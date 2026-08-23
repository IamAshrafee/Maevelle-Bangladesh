import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

type Executor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
export type AllocationMethod =
  | 'EQUAL'
  | 'QUANTITY'
  | 'PURCHASE_VALUE'
  | 'WEIGHT'
  | 'VOLUME'
  | 'CHARGEABLE_WEIGHT'
  | 'PERCENTAGE'
  | 'MANUAL'
  | 'DIRECT';

export class CostingDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'VALIDATION_FAILED' | 'CONFLICT' | 'INVALID_TRANSITION',
    message: string,
  ) {
    super(message);
    this.name = 'CostingDomainError';
  }
}

const moneyScale = 10_000n;
const quantityScale = 1_000_000n;

function fixed(value: string, scale: bigint): bigint {
  const negative = value.trim().startsWith('-');
  const raw = negative ? value.trim().slice(1) : value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw))
    throw new CostingDomainError('VALIDATION_FAILED', 'A decimal value is invalid.');
  const [whole = '0', fraction = ''] = raw.split('.');
  const digits = scale.toString().length - 1;
  if (fraction.length > digits)
    throw new CostingDomainError('VALIDATION_FAILED', `Value exceeds ${digits} decimal places.`);
  const result = BigInt(whole) * scale + BigInt((fraction + '0'.repeat(digits)).slice(0, digits));
  return negative ? -result : result;
}
function decimal(value: bigint, scale: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const places = scale.toString().length - 1;
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(places, '0');
  return `${sign}${whole}.${fraction}`;
}
function cents(value: string): bigint {
  return fixed(value, moneyScale);
}

export interface AllocationPreview {
  readonly targetId: string;
  readonly shipmentAllocationId: string;
  readonly amount: string;
}

/** Exact largest-remainder allocation at committed money precision. */
export function allocateDeterministically(
  amount: string,
  targets: readonly { id: string; shipmentAllocationId: string; basis: string }[],
): readonly AllocationPreview[] {
  const total = cents(amount);
  const sign = total < 0n ? -1n : 1n;
  const absolute = total < 0n ? -total : total;
  const rows = targets.map((target) => ({ ...target, basis: fixed(target.basis, quantityScale) }));
  const totalBasis = rows.reduce((sum, row) => sum + row.basis, 0n);
  if (totalBasis <= 0n)
    throw new CostingDomainError(
      'VALIDATION_FAILED',
      'Allocation requires positive eligible basis values.',
    );
  const computed = rows.map((row) => {
    const numerator = absolute * row.basis;
    return { ...row, amount: numerator / totalBasis, remainder: numerator % totalBasis };
  });
  let remaining = absolute - computed.reduce((sum, row) => sum + row.amount, 0n);
  for (const row of [...computed].sort((a, b) =>
    b.remainder === a.remainder ? a.id.localeCompare(b.id) : b.remainder > a.remainder ? 1 : -1,
  )) {
    if (!remaining) break;
    row.amount += 1n;
    remaining -= 1n;
  }
  return computed
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => ({
      targetId: row.id,
      shipmentAllocationId: row.shipmentAllocationId,
      amount: decimal(row.amount * sign, moneyScale),
    }));
}

function number(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

async function assertRevisionMutable(
  executor: Executor,
  organizationId: string,
  revisionId: string,
) {
  const result = await sql<{ status: string; worksheet_id: string; base_currency_code: string }>`
    select revision.status, revision.worksheet_id, worksheet.base_currency_code
    from landed_cost.worksheet_revisions revision join landed_cost.worksheets worksheet on worksheet.id = revision.worksheet_id
    where revision.organization_id = ${organizationId} and revision.id = ${revisionId} for update
  `.execute(executor);
  const row = result.rows[0];
  if (!row) throw new CostingDomainError('NOT_FOUND', 'Landed Cost Revision was not found.');
  if (row.status !== 'DRAFT')
    throw new CostingDomainError('INVALID_TRANSITION', 'Only a draft revision can be changed.');
  return row;
}

export async function createLandedCostWorksheet(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    shipmentId: string;
    baseCurrencyCode: string;
    notes?: string;
  },
): Promise<{ id: string; revisionId: string }> {
  return db.transaction().execute(async (tx) => {
    const shipment =
      await sql`select id from inbound_shipment.shipments where organization_id = ${input.organizationId} and id = ${input.shipmentId} for update`.execute(
        tx,
      );
    if (!shipment.rows[0])
      throw new CostingDomainError('NOT_FOUND', 'Inbound Shipment was not found.');
    const worksheet = await sql<{
      id: string;
    }>`insert into landed_cost.worksheets (organization_id, shipment_id, worksheet_number, base_currency_code, notes, created_by_actor_id) values (${input.organizationId}, ${input.shipmentId}, ${number('LCW')}, ${input.baseCurrencyCode}, ${input.notes ?? null}, ${input.actorId}) returning id`.execute(
      tx,
    );
    const id = worksheet.rows[0]!.id;
    const revision = await sql<{
      id: string;
    }>`insert into landed_cost.worksheet_revisions (organization_id, worksheet_id, revision_number, created_by_actor_id) values (${input.organizationId}, ${id}, 1, ${input.actorId}) returning id`.execute(
      tx,
    );
    const revisionId = revision.rows[0]!.id;
    await sql`update landed_cost.worksheets set current_revision_id = ${revisionId}::uuid where id = ${id}`.execute(
      tx,
    );
    const targets = await sql<{ id: string; allocated_quantity: string; unit_price: string }>`
      select allocation.id, allocation.allocated_quantity::text, line.unit_price::text
      from inbound_shipment.purchase_line_allocations allocation join procurement.purchase_lines line on line.id = allocation.purchase_line_id
      where allocation.organization_id = ${input.organizationId} and allocation.shipment_id = ${input.shipmentId} order by allocation.id
    `.execute(tx);
    for (const target of targets.rows)
      await sql`insert into landed_cost.allocation_targets (organization_id, worksheet_revision_id, shipment_allocation_id, eligible_quantity, purchase_value) values (${input.organizationId}, ${revisionId}, ${target.id}, ${target.allocated_quantity}::numeric, (${target.allocated_quantity}::numeric * ${target.unit_price}::numeric))`.execute(
        tx,
      );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'landed_cost.worksheet.created',
      targetType: 'landed_cost.worksheet',
      targetId: id,
    });
    return { id, revisionId };
  });
}

export async function addLandedCostComponent(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    costType: string;
    scope: 'GLOBAL' | 'DIRECT';
    directShipmentAllocationId?: string;
    originalAmount: string;
    originalCurrencyCode: string;
    fxRate?: string;
    fxSource?: string;
    valueStatus: 'ESTIMATED' | 'ACTUAL' | 'CREDIT';
    allocationMethod: AllocationMethod;
    reference?: string;
    notes?: string;
  },
): Promise<{ id: string }> {
  return db.transaction().execute(async (tx) => {
    const revision = await assertRevisionMutable(tx, input.organizationId, input.revisionId);
    const original = cents(input.originalAmount);
    if (!original || (original < 0n && input.valueStatus !== 'CREDIT'))
      throw new CostingDomainError(
        'VALIDATION_FAILED',
        'Acquisition cost must be non-zero; only credits may be negative.',
      );
    if (input.scope === 'DIRECT' && !input.directShipmentAllocationId)
      throw new CostingDomainError(
        'VALIDATION_FAILED',
        'Direct cost needs one Shipment Item target.',
      );
    if (input.scope === 'GLOBAL' && input.allocationMethod === 'DIRECT')
      throw new CostingDomainError('VALIDATION_FAILED', 'Direct allocation must use direct scope.');
    const needsFx = input.originalCurrencyCode !== revision.base_currency_code;
    if (needsFx && !input.fxRate)
      throw new CostingDomainError(
        'VALIDATION_FAILED',
        'A manual FX snapshot is required for cross-currency cost.',
      );
    const rate = input.fxRate ? fixed(input.fxRate, 1_000_000_000_000n) : 1_000_000_000_000n;
    const converted = (original * rate) / 1_000_000_000_000n;
    const row = await sql<{
      id: string;
    }>`insert into landed_cost.cost_components (organization_id, worksheet_revision_id, cost_type, reference, scope, direct_shipment_allocation_id, original_amount, original_currency_code, fx_rate, fx_rate_recorded_at, fx_source, worksheet_amount, value_status, allocation_method, notes) values (${input.organizationId}, ${input.revisionId}, ${input.costType}, ${input.reference ?? null}, ${input.scope}, ${input.directShipmentAllocationId ?? null}::uuid, ${decimal(original, moneyScale)}::numeric, ${input.originalCurrencyCode}, ${needsFx ? input.fxRate! : null}::numeric, ${needsFx ? sql`now()` : null}, ${input.fxSource ?? null}, ${decimal(converted, moneyScale)}::numeric, ${input.valueStatus}, ${input.scope === 'DIRECT' ? 'DIRECT' : input.allocationMethod}, ${input.notes ?? null}) returning id`.execute(
      tx,
    );
    return { id: row.rows[0]!.id };
  });
}

async function previewComponent(
  executor: Executor,
  organizationId: string,
  componentId: string,
): Promise<readonly AllocationPreview[]> {
  const component = await sql<{
    worksheet_amount: string;
    allocation_method: AllocationMethod;
    direct_shipment_allocation_id: string | null;
    revision_id: string;
  }>`select worksheet_amount::text, allocation_method, direct_shipment_allocation_id, worksheet_revision_id as revision_id from landed_cost.cost_components where organization_id = ${organizationId} and id = ${componentId}`.execute(
    executor,
  );
  const row = component.rows[0];
  if (!row) throw new CostingDomainError('NOT_FOUND', 'Cost component was not found.');
  const targets = await sql<{
    id: string;
    shipment_allocation_id: string;
    eligible_quantity: string;
    purchase_value: string | null;
    weight: string | null;
    volume: string | null;
    chargeable_weight: string | null;
    percentage: string | null;
    manual_amount: string | null;
  }>`select id, shipment_allocation_id, eligible_quantity::text, purchase_value::text, weight::text, volume::text, chargeable_weight::text, percentage::text, manual_amount::text from landed_cost.allocation_targets where organization_id = ${organizationId} and worksheet_revision_id = ${row.revision_id} order by id`.execute(
    executor,
  );
  const map: Record<AllocationMethod, keyof (typeof targets.rows)[number] | undefined> = {
    EQUAL: undefined,
    QUANTITY: 'eligible_quantity',
    PURCHASE_VALUE: 'purchase_value',
    WEIGHT: 'weight',
    VOLUME: 'volume',
    CHARGEABLE_WEIGHT: 'chargeable_weight',
    PERCENTAGE: 'percentage',
    MANUAL: 'manual_amount',
    DIRECT: undefined,
  };
  if (row.allocation_method === 'DIRECT') {
    const target = targets.rows.find(
      (item) => item.shipment_allocation_id === row.direct_shipment_allocation_id,
    );
    if (!target)
      throw new CostingDomainError(
        'VALIDATION_FAILED',
        'Direct cost target is not part of this Shipment.',
      );
    return [
      {
        targetId: target.id,
        shipmentAllocationId: target.shipment_allocation_id,
        amount: row.worksheet_amount,
      },
    ];
  }
  const field = map[row.allocation_method];
  const allocationTargets = targets.rows.map((target) => {
    const basis = field ? target[field] : '1';
    if (basis === null || fixed(basis, quantityScale) <= 0n)
      throw new CostingDomainError(
        'VALIDATION_FAILED',
        `${row.allocation_method} allocation requires complete positive target metadata.`,
      );
    return { id: target.id, shipmentAllocationId: target.shipment_allocation_id, basis };
  });
  if (row.allocation_method === 'PERCENTAGE') {
    const percent = allocationTargets.reduce(
      (sum, item) => sum + fixed(item.basis, quantityScale),
      0n,
    );
    if (percent !== 100n * quantityScale)
      throw new CostingDomainError('VALIDATION_FAILED', 'Percentages must total exactly 100.');
  }
  if (row.allocation_method === 'MANUAL') {
    const manualTotal = allocationTargets.reduce((sum, item) => sum + cents(item.basis), 0n);
    if (manualTotal !== cents(row.worksheet_amount))
      throw new CostingDomainError(
        'VALIDATION_FAILED',
        'Manual allocations must total the component amount exactly.',
      );
    return allocationTargets.map((item) => ({
      targetId: item.id,
      shipmentAllocationId: item.shipmentAllocationId,
      amount: decimal(cents(item.basis), moneyScale),
    }));
  }
  return allocateDeterministically(row.worksheet_amount, allocationTargets);
}

export async function previewLandedCostWorksheet(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; revisionId: string },
): Promise<{ components: readonly { id: string; allocations: readonly AllocationPreview[] }[] }> {
  const components = await sql<{
    id: string;
  }>`select id from landed_cost.cost_components where organization_id = ${input.organizationId} and worksheet_revision_id = ${input.revisionId} order by id`.execute(
    db,
  );
  return {
    components: await Promise.all(
      components.rows.map(async (component) => ({
        id: component.id,
        allocations: await previewComponent(db, input.organizationId, component.id),
      })),
    ),
  };
}

/** Cost layers are created with receipt truth, even when final freight is not known yet. */
export async function createProvisionalCostLayersForInboundReceiptInTransaction(
  tx: Transaction<DatabaseSchema>,
  input: { organizationId: string; receiptId: string; locationId: string },
): Promise<void> {
  const lines = await sql<{
    receipt_line_id: string;
    allocation_id: string;
    inventory_item_id: string;
    condition_code: string;
    quantity: string;
    unit_price: string;
    currency_code: string;
    posted_at: string;
  }>`
    select receipt_line.id as receipt_line_id, receipt_line.shipment_allocation_id as allocation_id, item.id as inventory_item_id, receipt_line.condition_code, receipt_line.quantity::text, purchase_line.unit_price::text, purchase.currency_code, receipt.posted_at::text
    from receiving.inbound_receipt_lines receipt_line join receiving.inbound_receipts receipt on receipt.id = receipt_line.inbound_receipt_id
    join inbound_shipment.purchase_line_allocations allocation on allocation.id = receipt_line.shipment_allocation_id
    join procurement.purchase_lines purchase_line on purchase_line.id = allocation.purchase_line_id join procurement.purchases purchase on purchase.id = purchase_line.purchase_id
    join inventory.inventory_items item on item.organization_id = receipt_line.organization_id and item.variant_id = receipt_line.variant_id
    where receipt_line.organization_id = ${input.organizationId} and receipt_line.inbound_receipt_id = ${input.receiptId} order by receipt_line.id
  `.execute(tx);
  for (const line of lines.rows) {
    const inserted = await sql<{
      id: string;
    }>`insert into costing.cost_layers (organization_id, inbound_receipt_line_id, shipment_allocation_id, inventory_item_id, location_id, condition_code, original_quantity, base_purchase_cost, currency_code, received_at) values (${input.organizationId}, ${line.receipt_line_id}, ${line.allocation_id}, ${line.inventory_item_id}, ${input.locationId}, ${line.condition_code}, ${line.quantity}::numeric, (${line.quantity}::numeric * ${line.unit_price}::numeric)::numeric(24,8), ${line.currency_code}, ${line.posted_at}::timestamptz) returning id`.execute(
      tx,
    );
    await sql`insert into costing.cost_layer_positions (organization_id, cost_layer_id, remaining_quantity) values (${input.organizationId}, ${inserted.rows[0]!.id}, ${line.quantity}::numeric)`.execute(
      tx,
    );
  }
}

export async function finalizeLandedCostWorksheet(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; revisionId: string },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const revision = await assertRevisionMutable(tx, input.organizationId, input.revisionId);
    const preview = await previewLandedCostWorksheet(tx, {
      organizationId: input.organizationId,
      revisionId: input.revisionId,
    });
    await sql`delete from landed_cost.component_allocations where organization_id = ${input.organizationId} and cost_component_id in (select id from landed_cost.cost_components where worksheet_revision_id = ${input.revisionId})`.execute(
      tx,
    );
    for (const component of preview.components)
      for (const allocation of component.allocations)
        await sql`insert into landed_cost.component_allocations (organization_id, cost_component_id, allocation_target_id, raw_amount, allocated_amount) values (${input.organizationId}, ${component.id}, ${allocation.targetId}, ${allocation.amount}::numeric, ${allocation.amount}::numeric)`.execute(
          tx,
        );
    const targets = await sql<{
      id: string;
      shipment_allocation_id: string;
      quantity: string;
      purchase_total: string;
      currency_code: string;
    }>`
      select target.id, target.shipment_allocation_id, coalesce(sum(receipt_line.quantity), 0)::text as quantity, coalesce(sum(receipt_line.quantity * purchase_line.unit_price), 0)::text as purchase_total, min(purchase.currency_code) as currency_code
      from landed_cost.allocation_targets target join inbound_shipment.purchase_line_allocations allocation on allocation.id = target.shipment_allocation_id
      join procurement.purchase_lines purchase_line on purchase_line.id = allocation.purchase_line_id join procurement.purchases purchase on purchase.id = purchase_line.purchase_id
      left join receiving.inbound_receipt_lines receipt_line on receipt_line.shipment_allocation_id = allocation.id
      where target.organization_id = ${input.organizationId} and target.worksheet_revision_id = ${input.revisionId}
      group by target.id, target.shipment_allocation_id order by target.id
    `.execute(tx);
    for (const target of targets.rows) {
      if (fixed(target.quantity, quantityScale) <= 0n)
        throw new CostingDomainError(
          'VALIDATION_FAILED',
          'A landed-cost revision can only finalize after physical receipt.',
        );
      if (target.currency_code !== revision.base_currency_code)
        throw new CostingDomainError(
          'VALIDATION_FAILED',
          'Purchase cost currency must match the worksheet base currency until purchase-FX capture is added.',
        );
      const additions = await sql<{
        value: string;
      }>`select coalesce(sum(allocated_amount), 0)::text as value from landed_cost.component_allocations where allocation_target_id = ${target.id}`.execute(
        tx,
      );
      const total =
        fixed(target.purchase_total, 100_000_000n) + fixed(additions.rows[0]!.value, 100_000_000n);
      const receivedQuantity = fixed(target.quantity, quantityScale);
      const unit = (total * quantityScale) / receivedQuantity;
      await sql`insert into landed_cost.acquisition_cost_results (organization_id, worksheet_revision_id, allocation_target_id, purchase_cost, additional_cost, total_acquisition_cost, unit_acquisition_cost, currency_code) values (${input.organizationId}, ${input.revisionId}, ${target.id}, ${target.purchase_total}::numeric, ${additions.rows[0]!.value}::numeric, ${decimal(total, 100_000_000n)}::numeric, ${decimal(unit * quantityScale, 100_000_000n)}::numeric, ${revision.base_currency_code})`.execute(
        tx,
      );
      const layers = await sql<{
        id: string;
        quantity: string;
        base_purchase_cost: string;
      }>`select layer.id, layer.original_quantity::text as quantity, layer.base_purchase_cost::text from costing.cost_layers layer where layer.organization_id = ${input.organizationId} and layer.shipment_allocation_id = ${target.shipment_allocation_id} for update`.execute(
        tx,
      );
      for (const layer of layers.rows) {
        const expected = (unit * fixed(layer.quantity, quantityScale)) / quantityScale;
        const delta = expected - fixed(layer.base_purchase_cost, 100_000_000n);
        await sql`insert into costing.cost_layer_adjustments (organization_id, cost_layer_id, worksheet_revision_id, delta_total_cost, reason) values (${input.organizationId}, ${layer.id}, ${input.revisionId}, ${decimal(delta, 100_000_000n)}::numeric, 'FINALIZATION') on conflict (cost_layer_id, worksheet_revision_id) do nothing`.execute(
          tx,
        );
        await sql`update costing.cost_layers set cost_state = 'FINALIZED', source_revision_id = ${input.revisionId}::uuid where id = ${layer.id}`.execute(
          tx,
        );
      }
    }
    await sql`update landed_cost.worksheet_revisions set status = 'FINALIZED', finalized_at = now() where id = ${input.revisionId}`.execute(
      tx,
    );
    await sql`update landed_cost.worksheets set status = 'FINALIZED', finalized_at = now(), version = version + 1 where id = ${revision.worksheet_id}`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'landed_cost.revision.finalized',
      targetType: 'landed_cost.revision',
      targetId: input.revisionId,
    });
  });
}

/** Locks FIFO positions after physical inventory is consumed; rollback keeps the two ledgers aligned. */
export async function assignOutboundCostsForFulfillmentInTransaction(
  tx: Transaction<DatabaseSchema>,
  input: { organizationId: string; fulfillmentId: string },
): Promise<void> {
  const existing =
    await sql`select id from costing.outbound_cost_assignments where organization_id = ${input.organizationId} and fulfillment_id = ${input.fulfillmentId} for update`.execute(
      tx,
    );
  if (existing.rows[0]) return;
  const lines = await sql<{
    fulfillment_line_id: string;
    inventory_item_id: string;
    location_id: string;
    quantity: string;
  }>`
    select line.id as fulfillment_line_id, item.id as inventory_item_id, fulfillment.location_id, line.quantity::text
    from fulfillment.fulfillment_lines line join fulfillment.fulfillments fulfillment on fulfillment.id = line.fulfillment_id
    join orders.order_lines order_line on order_line.id = line.order_line_id
    join inventory.inventory_items item on item.organization_id = line.organization_id and item.variant_id = order_line.variant_id
    where line.organization_id = ${input.organizationId} and line.fulfillment_id = ${input.fulfillmentId} order by line.id
  `.execute(tx);
  const assignment = await sql<{
    id: string;
  }>`insert into costing.outbound_cost_assignments (organization_id, fulfillment_id, total_cost, currency_code) values (${input.organizationId}, ${input.fulfillmentId}, 0, 'BDT') returning id`.execute(
    tx,
  );
  let total = 0n;
  let currency = 'BDT';
  let assignedAnyLayer = false;
  for (const line of lines.rows) {
    let required = fixed(line.quantity, quantityScale);
    const positions = await sql<{
      position_id: string;
      layer_id: string;
      remaining: string;
      original_quantity: string;
      base_purchase_cost: string;
      currency_code: string;
      adjustments: string;
    }>`
      select position.id as position_id, layer.id as layer_id, position.remaining_quantity::text as remaining, layer.original_quantity::text, layer.base_purchase_cost::text, layer.currency_code, coalesce((select sum(adjustment.delta_total_cost) from costing.cost_layer_adjustments adjustment where adjustment.cost_layer_id = layer.id), 0)::text as adjustments
      from costing.cost_layer_positions position join costing.cost_layers layer on layer.id = position.cost_layer_id
      where position.organization_id = ${input.organizationId} and layer.inventory_item_id = ${line.inventory_item_id}::uuid and layer.location_id = ${line.location_id}::uuid and layer.condition_code = 'SELLABLE' and position.remaining_quantity > 0
      order by layer.received_at asc, layer.id asc for update of position, layer
    `.execute(tx);
    if (!positions.rows.length && !assignedAnyLayer) continue;
    for (const position of positions.rows) {
      if (!required) break;
      const available = fixed(position.remaining, quantityScale);
      const take = available < required ? available : required;
      const effective =
        fixed(position.base_purchase_cost, 100_000_000n) +
        fixed(position.adjustments, 100_000_000n);
      const lineCost = (effective * take) / fixed(position.original_quantity, quantityScale);
      const unit = effective / fixed(position.original_quantity, quantityScale);
      await sql`update costing.cost_layer_positions set remaining_quantity = remaining_quantity - ${decimal(take, quantityScale)}::numeric, version = version + 1, updated_at = now() where id = ${position.position_id}`.execute(
        tx,
      );
      await sql`insert into costing.outbound_cost_assignment_lines (organization_id, outbound_cost_assignment_id, fulfillment_line_id, cost_layer_id, quantity, unit_cost, total_cost) values (${input.organizationId}, ${assignment.rows[0]!.id}, ${line.fulfillment_line_id}, ${position.layer_id}, ${decimal(take, quantityScale)}::numeric, ${decimal(unit, 100_000_000n)}::numeric, ${decimal(lineCost, 100_000_000n)}::numeric)`.execute(
        tx,
      );
      total += lineCost;
      currency = position.currency_code;
      assignedAnyLayer = true;
      required -= take;
    }
    if (required)
      throw new CostingDomainError(
        'CONFLICT',
        'Physical inventory was consumed without enough FIFO cost-layer quantity.',
      );
  }
  if (!assignedAnyLayer) {
    // Pre-costing historical stock has no fabricated zero-cost layer.
    await sql`delete from costing.outbound_cost_assignments where id = ${assignment.rows[0]!.id}`.execute(
      tx,
    );
    return;
  }
  await sql`update costing.outbound_cost_assignments set total_cost = ${decimal(total, 100_000_000n)}::numeric, currency_code = ${currency} where id = ${assignment.rows[0]!.id}`.execute(
    tx,
  );
}

/** COGS is a delivery-success fact; failed delivery preserves physical consumption without a reversal. */
export async function recognizeCogsForDeliveredFulfillmentInTransaction(
  tx: Transaction<DatabaseSchema>,
  input: { organizationId: string; fulfillmentId: string },
): Promise<void> {
  const row = await sql<{
    id: string;
    total_cost: string;
    currency_code: string;
    status: string;
  }>`select id, total_cost::text, currency_code, status from costing.outbound_cost_assignments where organization_id = ${input.organizationId} and fulfillment_id = ${input.fulfillmentId} for update`.execute(
    tx,
  );
  const assignment = row.rows[0];
  if (!assignment) return;
  if (assignment.status === 'COGS_RECOGNIZED') return;
  await sql`insert into costing.cogs_recognitions (organization_id, outbound_cost_assignment_id, recognition_kind, total_cost, currency_code) values (${input.organizationId}, ${assignment.id}, 'ORIGINAL', ${assignment.total_cost}::numeric, ${assignment.currency_code}) on conflict (outbound_cost_assignment_id, recognition_kind) do nothing`.execute(
    tx,
  );
  await sql`update costing.outbound_cost_assignments set status = 'COGS_RECOGNIZED', recognized_at = now() where id = ${assignment.id}`.execute(
    tx,
  );
}

export async function listCostLayers(db: Kysely<DatabaseSchema>, organizationId: string) {
  const rows = await sql<{
    id: string;
    receipt_line_id: string;
    remaining_quantity: string;
    original_quantity: string;
    effective_cost: string;
    currency_code: string;
    location_id: string;
    condition_code: string;
  }>`
    select layer.id, layer.inbound_receipt_line_id as receipt_line_id, position.remaining_quantity::text, layer.original_quantity::text, (layer.base_purchase_cost + coalesce(sum(adjustment.delta_total_cost), 0))::text as effective_cost, layer.currency_code, layer.location_id, layer.condition_code
    from costing.cost_layers layer join costing.cost_layer_positions position on position.cost_layer_id = layer.id left join costing.cost_layer_adjustments adjustment on adjustment.cost_layer_id = layer.id
    where layer.organization_id = ${organizationId} group by layer.id, position.id order by layer.received_at, layer.id
  `.execute(db);
  return rows.rows;
}
