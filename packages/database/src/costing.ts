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
  const [whole = '0', originalFraction = ''] = raw.split('.');
  const fraction = originalFraction.replace(/0+$/, '');
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
  const result = await sql<{
    status: string;
    worksheet_id: string;
    base_currency_code: string;
    revision_kind: 'INITIAL' | 'ADJUSTMENT' | 'CREDIT';
    supersedes_revision_id: string | null;
  }>`
    select revision.status, revision.worksheet_id, worksheet.base_currency_code, revision.revision_kind, revision.supersedes_revision_id
    from landed_cost.worksheet_revisions revision join landed_cost.worksheets worksheet on worksheet.id = revision.worksheet_id
    where revision.organization_id = ${organizationId} and revision.id = ${revisionId} for update
  `.execute(executor);
  const row = result.rows[0];
  if (!row) throw new CostingDomainError('NOT_FOUND', 'Landed Cost Revision was not found.');
  if (row.status !== 'DRAFT')
    throw new CostingDomainError('INVALID_TRANSITION', 'Only a draft revision can be changed.');
  return row;
}

/** Opens an immutable adjustment/credit revision without changing finalized evidence. */
export async function createLandedCostRevision(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    worksheetId: string;
    kind: 'ADJUSTMENT' | 'CREDIT';
  },
): Promise<{ revisionId: string }> {
  return db.transaction().execute(async (tx) => {
    const worksheet = await sql<{
      id: string;
      current_revision_id: string | null;
    }>`select id, current_revision_id from landed_cost.worksheets where organization_id = ${input.organizationId} and id = ${input.worksheetId} for update`.execute(
      tx,
    );
    const current = worksheet.rows[0];
    if (!current || !current.current_revision_id)
      throw new CostingDomainError('NOT_FOUND', 'Landed Cost Worksheet was not found.');
    const prior = await sql<{
      revision_number: string;
      status: string;
    }>`select revision_number::text, status from landed_cost.worksheet_revisions where organization_id = ${input.organizationId} and id = ${current.current_revision_id} for update`.execute(
      tx,
    );
    if (prior.rows[0]?.status !== 'FINALIZED')
      throw new CostingDomainError(
        'INVALID_TRANSITION',
        'A new revision requires the current revision to be finalized.',
      );
    const created = await sql<{
      id: string;
    }>`insert into landed_cost.worksheet_revisions (organization_id, worksheet_id, revision_number, revision_kind, supersedes_revision_id, created_by_actor_id) values (${input.organizationId}, ${input.worksheetId}, ${Number(prior.rows[0]!.revision_number) + 1}, ${input.kind}, ${current.current_revision_id}::uuid, ${input.actorId}) returning id`.execute(
      tx,
    );
    const revisionId = created.rows[0]!.id;
    await sql`insert into landed_cost.allocation_targets (organization_id, worksheet_revision_id, shipment_allocation_id, eligible_quantity, purchase_value, weight, volume, chargeable_weight, percentage, manual_amount) select organization_id, ${revisionId}::uuid, shipment_allocation_id, eligible_quantity, purchase_value, weight, volume, chargeable_weight, percentage, manual_amount from landed_cost.allocation_targets where worksheet_revision_id = ${current.current_revision_id}`.execute(
      tx,
    );
    await sql`update landed_cost.worksheets set current_revision_id = ${revisionId}::uuid, status = 'DRAFT', finalized_at = null, version = version + 1 where id = ${input.worksheetId}`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `landed_cost.revision.${input.kind.toLowerCase()}.created`,
      targetType: 'landed_cost.revision',
      targetId: revisionId,
    });
    return { revisionId };
  });
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
  const revision = await sql<{ id: string }>`
    select id from landed_cost.worksheet_revisions
    where organization_id = ${input.organizationId} and id = ${input.revisionId}
  `.execute(db);
  if (!revision.rows[0])
    throw new CostingDomainError('NOT_FOUND', 'Landed Cost Revision was not found.');
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

async function distributeLayerAdjustmentToOutboundFacts(
  tx: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    costLayerAdjustmentId: string;
    costLayerId: string;
    delta: string;
  },
): Promise<void> {
  const layer = await sql<{
    original_quantity: string;
  }>`select original_quantity::text from costing.cost_layers where organization_id = ${input.organizationId} and id = ${input.costLayerId}`.execute(
    tx,
  );
  const layerRow = layer.rows[0];
  if (!layerRow) throw new CostingDomainError('NOT_FOUND', 'Cost layer was not found.');
  const lines = await sql<{
    id: string;
    outbound_cost_assignment_id: string;
    quantity: string;
    status: string;
    recognition_id: string | null;
  }>`
    select line.id, line.outbound_cost_assignment_id, line.quantity::text, assignment.status,
      (select recognition.id from costing.cogs_recognitions recognition where recognition.outbound_cost_assignment_id = assignment.id and recognition.recognition_kind = 'ORIGINAL') as recognition_id
    from costing.outbound_cost_assignment_lines line join costing.outbound_cost_assignments assignment on assignment.id = line.outbound_cost_assignment_id
    where line.organization_id = ${input.organizationId} and line.cost_layer_id = ${input.costLayerId} order by line.id
  `.execute(tx);
  if (!lines.rows.length) return;
  const outboundQuantity = lines.rows.reduce(
    (total, line) => total + fixed(line.quantity, quantityScale),
    0n,
  );
  const originalQuantity = fixed(layerRow.original_quantity, quantityScale);
  if (outboundQuantity > originalQuantity)
    throw new CostingDomainError(
      'CONFLICT',
      'Outbound cost assignment exceeds its source layer quantity.',
    );
  const pieces = allocateDeterministically(input.delta, [
    ...lines.rows.map((line) => ({
      id: line.id,
      shipmentAllocationId: line.outbound_cost_assignment_id,
      basis: line.quantity,
    })),
    ...(outboundQuantity < originalQuantity
      ? [
          {
            id: '__on_hand__',
            shipmentAllocationId: '__on_hand__',
            basis: decimal(originalQuantity - outboundQuantity, quantityScale),
          },
        ]
      : []),
  ]);
  for (const piece of pieces) {
    if (piece.targetId === '__on_hand__') continue;
    const line = lines.rows.find((candidate) => candidate.id === piece.targetId)!;
    if (line.status === 'COGS_RECOGNIZED') {
      if (!line.recognition_id)
        throw new CostingDomainError(
          'CONFLICT',
          'A COGS-recognized outbound assignment is missing its recognition fact.',
        );
      await sql`insert into costing.cogs_adjustments (organization_id, cogs_recognition_id, cost_layer_adjustment_id, amount) values (${input.organizationId}, ${line.recognition_id}, ${input.costLayerAdjustmentId}, ${piece.amount}::numeric) on conflict (cogs_recognition_id, cost_layer_adjustment_id) do nothing`.execute(
        tx,
      );
    } else {
      await sql`insert into costing.outbound_cost_assignment_adjustments (organization_id, outbound_cost_assignment_line_id, cost_layer_adjustment_id, amount) values (${input.organizationId}, ${line.id}, ${input.costLayerAdjustmentId}, ${piece.amount}::numeric) on conflict (outbound_cost_assignment_line_id, cost_layer_adjustment_id) do nothing`.execute(
        tx,
      );
    }
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
      const prior = revision.supersedes_revision_id
        ? await sql<{
            purchase_cost: string;
            additional_cost: string;
            total_acquisition_cost: string;
          }>`
          select result.purchase_cost::text, result.additional_cost::text, result.total_acquisition_cost::text
          from landed_cost.acquisition_cost_results result join landed_cost.allocation_targets previous_target on previous_target.id = result.allocation_target_id
          where result.organization_id = ${input.organizationId} and result.worksheet_revision_id = ${revision.supersedes_revision_id} and previous_target.shipment_allocation_id = ${target.shipment_allocation_id}
        `.execute(tx)
        : undefined;
      const priorResult = prior?.rows[0];
      if (revision.revision_kind !== 'INITIAL' && !priorResult)
        throw new CostingDomainError(
          'CONFLICT',
          'An adjustment revision requires prior finalized acquisition-cost results.',
        );
      const purchaseCost = priorResult
        ? fixed(priorResult.purchase_cost, 100_000_000n)
        : fixed(target.purchase_total, 100_000_000n);
      const additionalCost =
        (priorResult ? fixed(priorResult.additional_cost, 100_000_000n) : 0n) +
        fixed(additions.rows[0]!.value, 100_000_000n);
      const total = purchaseCost + additionalCost;
      const receivedQuantity = fixed(target.quantity, quantityScale);
      const unit = (total * quantityScale) / receivedQuantity;
      await sql`insert into landed_cost.acquisition_cost_results (organization_id, worksheet_revision_id, allocation_target_id, purchase_cost, additional_cost, total_acquisition_cost, unit_acquisition_cost, currency_code) values (${input.organizationId}, ${input.revisionId}, ${target.id}, ${decimal(purchaseCost, 100_000_000n)}::numeric, ${decimal(additionalCost, 100_000_000n)}::numeric, ${decimal(total, 100_000_000n)}::numeric, ${decimal(unit, 100_000_000n)}::numeric, ${revision.base_currency_code})`.execute(
        tx,
      );
      const layers = await sql<{
        id: string;
        quantity: string;
        base_purchase_cost: string;
      }>`select layer.id, layer.original_quantity::text as quantity, layer.base_purchase_cost::text from costing.cost_layers layer where layer.organization_id = ${input.organizationId} and layer.shipment_allocation_id = ${target.shipment_allocation_id} for update`.execute(
        tx,
      );
      const adjustmentAmounts: readonly { id: string; amount: string }[] =
        revision.revision_kind === 'INITIAL'
          ? layers.rows.map((layer) => ({
              id: layer.id,
              amount: decimal(
                (unit * fixed(layer.quantity, quantityScale)) / quantityScale -
                  fixed(layer.base_purchase_cost, 100_000_000n),
                100_000_000n,
              ),
            }))
          : allocateDeterministically(
              additions.rows[0]!.value,
              layers.rows.map((layer) => ({
                id: layer.id,
                shipmentAllocationId: layer.id,
                basis: layer.quantity,
              })),
            ).map((allocation) => ({ id: allocation.targetId, amount: allocation.amount }));
      for (const allocation of adjustmentAmounts) {
        const layer = layers.rows.find((candidate) => candidate.id === allocation.id)!;
        const deltaAmount = allocation.amount;
        const adjustment = await sql<{
          id: string;
        }>`insert into costing.cost_layer_adjustments (organization_id, cost_layer_id, worksheet_revision_id, delta_total_cost, reason) values (${input.organizationId}, ${layer.id}, ${input.revisionId}, ${deltaAmount}::numeric, ${revision.revision_kind === 'CREDIT' ? 'CREDIT' : revision.revision_kind === 'INITIAL' ? 'FINALIZATION' : 'ADJUSTMENT'}) on conflict (cost_layer_id, worksheet_revision_id) do update set delta_total_cost = excluded.delta_total_cost returning id`.execute(
          tx,
        );
        await distributeLayerAdjustmentToOutboundFacts(tx, {
          organizationId: input.organizationId,
          costLayerAdjustmentId: adjustment.rows[0]!.id,
          costLayerId: layer.id,
          delta: deltaAmount,
        });
        await sql`update costing.cost_layers set cost_state = 'FINALIZED', source_revision_id = ${input.revisionId}::uuid where id = ${layer.id}`.execute(
          tx,
        );
      }
    }
    if (revision.supersedes_revision_id)
      await sql`update landed_cost.worksheet_revisions set status = 'SUPERSEDED' where id = ${revision.supersedes_revision_id}`.execute(
        tx,
      );
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
    location_name: string;
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
    if (!positions.rows.length) {
      const provenance = await sql<{ exists: boolean }>`
        select exists(
          select 1 from costing.cost_layers layer
          where layer.organization_id = ${input.organizationId}
            and layer.inventory_item_id = ${line.inventory_item_id}::uuid
            and layer.location_id = ${line.location_id}::uuid
            and layer.condition_code = 'SELLABLE'
        ) as exists
      `.execute(tx);
      // Historical pre-costing stock can be physically dispatched, but stock
      // with known Cost Layers must never silently lose its cost provenance.
      if (!provenance.rows[0]?.exists && !assignedAnyLayer) continue;
    }
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
  const recognition = await sql<{
    id: string;
  }>`select id from costing.cogs_recognitions where outbound_cost_assignment_id = ${assignment.id} and recognition_kind = 'ORIGINAL'`.execute(
    tx,
  );
  await sql`
    insert into costing.cogs_adjustments (organization_id, cogs_recognition_id, cost_layer_adjustment_id, amount)
    select ${input.organizationId}, ${recognition.rows[0]!.id}, pending.cost_layer_adjustment_id, sum(pending.amount)
    from costing.outbound_cost_assignment_adjustments pending
    join costing.outbound_cost_assignment_lines line on line.id = pending.outbound_cost_assignment_line_id
    where line.outbound_cost_assignment_id = ${assignment.id}
    group by pending.cost_layer_adjustment_id
    on conflict (cogs_recognition_id, cost_layer_adjustment_id) do nothing
  `.execute(tx);
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
    product_title: string;
    sku: string;
    receipt_number: string;
    received_at: string;
    cost_state: string;
  }>`
    select layer.id, layer.inbound_receipt_line_id as receipt_line_id, position.remaining_quantity::text, layer.original_quantity::text,
      (layer.base_purchase_cost + coalesce(sum(adjustment.delta_total_cost), 0))::text as effective_cost,
      layer.currency_code, layer.location_id, location.name as location_name, layer.condition_code, allocation.product_title_snapshot as product_title,
      allocation.sku_snapshot as sku, receipt.receipt_number, layer.received_at::text, layer.cost_state
    from costing.cost_layers layer
    join costing.cost_layer_positions position on position.cost_layer_id = layer.id
    join receiving.inbound_receipt_lines receipt_line on receipt_line.id = layer.inbound_receipt_line_id
    join receiving.inbound_receipts receipt on receipt.id = receipt_line.inbound_receipt_id
    join inbound_shipment.purchase_line_allocations allocation on allocation.id = layer.shipment_allocation_id
    join warehouse.locations location on location.id = layer.location_id
    left join costing.cost_layer_adjustments adjustment on adjustment.cost_layer_id = layer.id
    where layer.organization_id = ${organizationId}
    group by layer.id, position.id, allocation.product_title_snapshot, allocation.sku_snapshot, receipt.receipt_number, location.name
    order by layer.received_at, layer.id
  `.execute(db);
  return rows.rows;
}

/** Current valuation derives only from remaining FIFO positions and append-only adjustments. */
export async function getInventoryValuation(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; inventoryItemId?: string; locationId?: string },
) {
  const rows = await sql<{
    inventory_item_id: string;
    location_id: string;
    condition_code: string;
    product_title: string;
    sku: string;
    location_name: string;
    currency_code: string;
    quantity: string;
    value: string;
  }>`
    select layer.inventory_item_id, layer.location_id, layer.condition_code, layer.currency_code,
      product.title as product_title, variant.sku, location.name as location_name,
      sum(position.remaining_quantity)::text as quantity,
      sum((layer.base_purchase_cost + coalesce((select sum(adjustment.delta_total_cost) from costing.cost_layer_adjustments adjustment where adjustment.cost_layer_id = layer.id), 0)) * position.remaining_quantity / layer.original_quantity)::text as value
    from costing.cost_layers layer
    join costing.cost_layer_positions position on position.cost_layer_id = layer.id
    join inventory.inventory_items item on item.id = layer.inventory_item_id
    join catalog.product_variants variant on variant.id = item.variant_id
    join catalog.products product on product.id = variant.product_id
    join warehouse.locations location on location.id = layer.location_id
    where layer.organization_id = ${input.organizationId}
      and (${input.inventoryItemId ?? null}::uuid is null or layer.inventory_item_id = ${input.inventoryItemId ?? null}::uuid)
      and (${input.locationId ?? null}::uuid is null or layer.location_id = ${input.locationId ?? null}::uuid)
    group by layer.inventory_item_id, layer.location_id, layer.condition_code, layer.currency_code, product.title, variant.sku, location.name
    union all
    select layer.inventory_item_id, layer.location_id, layer.condition_code, layer.currency_code,
      product.title as product_title, variant.sku, location.name as location_name,
      sum(layer.quantity)::text as quantity, sum(layer.quantity * layer.unit_cost)::text as value
    from costing.return_cost_layers layer
    join inventory.inventory_items item on item.id = layer.inventory_item_id
    join catalog.product_variants variant on variant.id = item.variant_id
    join catalog.products product on product.id = variant.product_id
    join warehouse.locations location on location.id = layer.location_id
    where layer.organization_id = ${input.organizationId}
      and (${input.inventoryItemId ?? null}::uuid is null or layer.inventory_item_id = ${input.inventoryItemId ?? null}::uuid)
      and (${input.locationId ?? null}::uuid is null or layer.location_id = ${input.locationId ?? null}::uuid)
    group by layer.inventory_item_id, layer.location_id, layer.condition_code, layer.currency_code, product.title, variant.sku, location.name
    order by inventory_item_id, location_id, condition_code, currency_code
  `.execute(db);
  return rows.rows;
}

export async function listOutboundCostAssignments(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
) {
  const rows = await sql<{
    id: string;
    fulfillment_id: string;
    status: string;
    total_cost: string;
    currency_code: string;
    cogs_adjustments: string;
    quantity: string;
    order_number: string;
    product_title: string;
    sku: string;
    created_at: string;
  }>`
    select assignment.id, assignment.fulfillment_id, assignment.status, assignment.total_cost::text, assignment.currency_code,
      coalesce((select sum(adjustment.amount) from costing.cogs_adjustments adjustment join costing.cogs_recognitions recognition on recognition.id = adjustment.cogs_recognition_id where recognition.outbound_cost_assignment_id = assignment.id), 0)::text as cogs_adjustments,
      coalesce(sum(line.quantity), 0)::text as quantity, orders.order_number,
      min(order_line.product_title_snapshot) as product_title, min(order_line.sku_snapshot) as sku,
      assignment.created_at::text
    from costing.outbound_cost_assignments assignment
    join fulfillment.fulfillments fulfillment on fulfillment.id = assignment.fulfillment_id
    join orders.orders orders on orders.id = fulfillment.order_id
    left join costing.outbound_cost_assignment_lines line on line.outbound_cost_assignment_id = assignment.id
    left join fulfillment.fulfillment_lines fulfillment_line on fulfillment_line.id = line.fulfillment_line_id
    left join orders.order_lines order_line on order_line.id = fulfillment_line.order_line_id
    where assignment.organization_id = ${organizationId}
    group by assignment.id, orders.order_number
    order by assignment.created_at desc, assignment.id desc
  `.execute(db);
  return rows.rows;
}

/** Read model for the operational Admin worksheet screen; all financial facts remain immutable. */
export async function getLandedCostWorksheet(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; worksheetId: string },
) {
  const worksheet = await sql<{
    id: string;
    shipment_id: string;
    worksheet_number: string;
    base_currency_code: string;
    status: string;
    current_revision_id: string | null;
    created_at: string;
    finalized_at: string | null;
  }>`
    select id, shipment_id, worksheet_number, base_currency_code, status, current_revision_id, created_at::text, finalized_at::text
    from landed_cost.worksheets
    where organization_id = ${input.organizationId} and id = ${input.worksheetId}
  `.execute(db);
  const header = worksheet.rows[0];
  if (!header) throw new CostingDomainError('NOT_FOUND', 'Landed Cost Worksheet was not found.');
  const [revisions, components, results] = await Promise.all([
    sql<{
      id: string;
      revision_number: string;
      revision_kind: string;
      status: string;
      supersedes_revision_id: string | null;
      created_at: string;
      finalized_at: string | null;
      total_effect: string;
    }>`
      select revision.id, revision.revision_number::text, revision.revision_kind, revision.status, revision.supersedes_revision_id,
        revision.created_at::text, revision.finalized_at::text,
        coalesce(sum(component.worksheet_amount), 0)::text as total_effect
      from landed_cost.worksheet_revisions revision
      left join landed_cost.cost_components component on component.worksheet_revision_id = revision.id
      where revision.organization_id = ${input.organizationId} and revision.worksheet_id = ${input.worksheetId}
      group by revision.id
      order by revision.revision_number desc
    `.execute(db),
    sql<{
      id: string;
      revision_id: string;
      cost_type: string;
      original_amount: string;
      original_currency_code: string;
      worksheet_amount: string;
      value_status: string;
      allocation_method: string;
      scope: string;
      fx_rate: string | null;
      fx_rate_recorded_at: string | null;
      fx_source: string | null;
      reference: string | null;
      notes: string | null;
    }>`
      select id, worksheet_revision_id as revision_id, cost_type, original_amount::text, original_currency_code,
        worksheet_amount::text, value_status, allocation_method, scope, fx_rate::text, fx_rate_recorded_at::text, fx_source, reference, notes
      from landed_cost.cost_components
      where organization_id = ${input.organizationId} and worksheet_revision_id = ${header.current_revision_id}::uuid
      order by created_at, id
    `.execute(db),
    sql<{
      allocation_target_id: string;
      purchase_cost: string;
      additional_cost: string;
      total_acquisition_cost: string;
      unit_acquisition_cost: string;
      currency_code: string;
      sku: string;
      product_title: string;
      quantity: string;
    }>`
      select result.allocation_target_id, result.purchase_cost::text, result.additional_cost::text,
        result.total_acquisition_cost::text, result.unit_acquisition_cost::text, result.currency_code,
        allocation.sku_snapshot as sku, allocation.product_title_snapshot as product_title,
        target.eligible_quantity::text as quantity
      from landed_cost.acquisition_cost_results result
      join landed_cost.allocation_targets target on target.id = result.allocation_target_id
      join inbound_shipment.purchase_line_allocations allocation on allocation.id = target.shipment_allocation_id
      where result.organization_id = ${input.organizationId} and result.worksheet_revision_id = ${header.current_revision_id}::uuid
      order by allocation.product_title_snapshot, allocation.sku_snapshot
    `.execute(db),
  ]);
  return {
    ...header,
    revisions: revisions.rows,
    components: components.rows,
    results: results.rows,
  };
}

export async function listLandedCostWorksheets(db: Kysely<DatabaseSchema>, organizationId: string) {
  const ids = await sql<{ id: string }>`
    select id from landed_cost.worksheets where organization_id = ${organizationId} order by created_at desc, id desc
  `.execute(db);
  return Promise.all(
    ids.rows.map((row) => getLandedCostWorksheet(db, { organizationId, worksheetId: row.id })),
  );
}

export async function listCogsRecognitions(db: Kysely<DatabaseSchema>, organizationId: string) {
  const rows = await sql<{
    id: string;
    delivery_id: string;
    fulfillment_id: string;
    order_number: string;
    total_cost: string;
    currency_code: string;
    created_at: string;
  }>`
    select recognition.id, delivery.id as delivery_id, assignment.fulfillment_id, orders.order_number,
      recognition.total_cost::text, recognition.currency_code, recognition.created_at::text
    from costing.cogs_recognitions recognition
    join costing.outbound_cost_assignments assignment on assignment.id = recognition.outbound_cost_assignment_id
    join fulfillment.fulfillments fulfillment on fulfillment.id = assignment.fulfillment_id
    join orders.orders orders on orders.id = fulfillment.order_id
    left join delivery.deliveries delivery on delivery.fulfillment_id = fulfillment.id
    where recognition.organization_id = ${organizationId} and recognition.recognition_kind = 'ORIGINAL'
    order by recognition.created_at desc, recognition.id desc
  `.execute(db);
  return rows.rows;
}

export interface CostingIntegrityIssue {
  readonly code: string;
  readonly summary: string;
  readonly entityId?: string;
}

/** Read-only verifier: detects inconsistent cost facts without fabricating a repair. */
export async function verifyCostingIntegrity(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly CostingIntegrityIssue[]> {
  const checks = await Promise.all([
    sql<{
      id: string;
    }>`select component.id from landed_cost.cost_components component left join landed_cost.component_allocations allocation on allocation.cost_component_id = component.id where component.organization_id = ${organizationId} and component.worksheet_revision_id in (select id from landed_cost.worksheet_revisions where status = 'FINALIZED') group by component.id, component.worksheet_amount having coalesce(sum(allocation.allocated_amount), 0) <> component.worksheet_amount`.execute(
      db,
    ),
    sql<{
      id: string;
    }>`select adjustment.id from costing.cost_layer_adjustments adjustment left join (select cost_layer_adjustment_id, coalesce(sum(amount), 0) as amount from costing.outbound_cost_assignment_adjustments group by cost_layer_adjustment_id) pending on pending.cost_layer_adjustment_id = adjustment.id left join (select cost_layer_adjustment_id, coalesce(sum(amount), 0) as amount from costing.cogs_adjustments group by cost_layer_adjustment_id) recognized on recognized.cost_layer_adjustment_id = adjustment.id where adjustment.organization_id = ${organizationId} and abs(coalesce(pending.amount, 0) + coalesce(recognized.amount, 0)) > abs(adjustment.delta_total_cost)`.execute(
      db,
    ),
    sql<{
      id: string;
    }>`select layer.id from costing.cost_layers layer join receiving.inbound_receipt_lines receipt on receipt.id = layer.inbound_receipt_line_id where layer.organization_id = ${organizationId} and layer.original_quantity <> receipt.quantity`.execute(
      db,
    ),
    sql<{
      id: string;
    }>`select level.id from inventory.inventory_level_conditions level where level.organization_id = ${organizationId} and level.quantity > 0 and not exists (select 1 from costing.cost_layers layer where layer.organization_id = level.organization_id and layer.inventory_item_id = level.inventory_item_id and layer.location_id = level.location_id and layer.condition_code = level.condition_code) and not exists (select 1 from costing.return_cost_layers layer where layer.organization_id = level.organization_id and layer.inventory_item_id = level.inventory_item_id and layer.location_id = level.location_id and layer.condition_code = level.condition_code)`.execute(
      db,
    ),
    sql<{
      id: string;
    }>`select delivery.id from delivery.deliveries delivery join fulfillment.fulfillments fulfillment on fulfillment.id = delivery.fulfillment_id where delivery.organization_id = ${organizationId} and delivery.outcome_status = 'DELIVERED' and exists (select 1 from costing.outbound_cost_assignments assignment where assignment.fulfillment_id = fulfillment.id) and not exists (select 1 from costing.cogs_recognitions recognition join costing.outbound_cost_assignments assignment on assignment.id = recognition.outbound_cost_assignment_id where assignment.fulfillment_id = fulfillment.id)`.execute(
      db,
    ),
    sql<{
      id: string;
    }>`select position.id from costing.cost_layer_positions position where position.organization_id = ${organizationId} and position.remaining_quantity < 0`.execute(
      db,
    ),
    sql<{
      id: string;
    }>`
      with physical as (
        select fulfillment.id, sum(line.quantity) as quantity
        from fulfillment.fulfillments fulfillment
        join fulfillment.fulfillment_lines line on line.fulfillment_id = fulfillment.id
        where fulfillment.organization_id = ${organizationId}
        group by fulfillment.id
      ), assigned as (
        select assignment.id, assignment.fulfillment_id, sum(line.quantity) as quantity
        from costing.outbound_cost_assignments assignment
        left join costing.outbound_cost_assignment_lines line on line.outbound_cost_assignment_id = assignment.id
        where assignment.organization_id = ${organizationId}
        group by assignment.id
      )
      select assigned.id
      from assigned join physical on physical.id = assigned.fulfillment_id
      where coalesce(assigned.quantity, 0) <> physical.quantity
    `.execute(db),
    sql<{
      id: string;
    }>`
      select fulfillment.id
      from fulfillment.fulfillments fulfillment
      join fulfillment.fulfillment_lines fulfillment_line on fulfillment_line.fulfillment_id = fulfillment.id
      join orders.order_lines order_line on order_line.id = fulfillment_line.order_line_id
      join inventory.inventory_items item on item.organization_id = fulfillment.organization_id and item.variant_id = order_line.variant_id
      join inventory.fulfillment_inventory_allocations allocation on allocation.fulfillment_line_id = fulfillment_line.id
      where fulfillment.organization_id = ${organizationId}
        and fulfillment.status = 'DISPATCHED'
        and allocation.quantity_consumed > 0
        and exists (
          select 1 from costing.cost_layers layer
          where layer.organization_id = fulfillment.organization_id
            and layer.inventory_item_id = item.id
            and layer.location_id = fulfillment.location_id
            and layer.condition_code = 'SELLABLE'
        )
        and not exists (
          select 1 from costing.outbound_cost_assignments assignment
          where assignment.organization_id = fulfillment.organization_id and assignment.fulfillment_id = fulfillment.id
        )
      group by fulfillment.id
    `.execute(db),
    sql<{
      id: string;
    }>`
      select recognition.id
      from costing.cogs_recognitions recognition
      left join costing.outbound_cost_assignments assignment on assignment.id = recognition.outbound_cost_assignment_id
      where recognition.organization_id = ${organizationId} and assignment.id is null
    `.execute(db),
    sql<{
      id: string;
    }>`
      select component.id
      from landed_cost.cost_components component
      join landed_cost.worksheet_revisions revision on revision.id = component.worksheet_revision_id
      join landed_cost.worksheets worksheet on worksheet.id = revision.worksheet_id
      where component.organization_id = ${organizationId}
        and component.original_currency_code <> worksheet.base_currency_code
        and (component.fx_rate is null or component.fx_source is null)
    `.execute(db),
    sql<{
      id: string;
    }>`
      select position.id
      from costing.cost_layer_positions position
      join costing.cost_layers layer on layer.id = position.cost_layer_id
      left join inventory.inventory_level_conditions level
        on level.organization_id = layer.organization_id
        and level.inventory_item_id = layer.inventory_item_id
        and level.location_id = layer.location_id
        and level.condition_code = layer.condition_code
      where position.organization_id = ${organizationId}
      group by position.id, position.remaining_quantity
      having position.remaining_quantity > coalesce(max(level.quantity), 0)
    `.execute(db),
    sql<{
      id: string;
    }>`
      select result.id
      from landed_cost.acquisition_cost_results result
      join landed_cost.allocation_targets target on target.id = result.allocation_target_id
      where result.organization_id = ${organizationId}
        and (
          result.total_acquisition_cost <> result.purchase_cost + result.additional_cost
          or result.unit_acquisition_cost <> result.total_acquisition_cost / nullif(target.eligible_quantity, 0)
        )
    `.execute(db),
    sql<{
      id: string;
    }>`
      select level.id
      from inventory.inventory_level_conditions level
      left join (
        select layer.organization_id, layer.inventory_item_id, layer.location_id, layer.condition_code, sum(position.remaining_quantity) as quantity
        from costing.cost_layers layer
        join costing.cost_layer_positions position on position.cost_layer_id = layer.id
        where layer.organization_id = ${organizationId}
        group by layer.organization_id, layer.inventory_item_id, layer.location_id, layer.condition_code
      ) position on position.organization_id = level.organization_id
        and position.inventory_item_id = level.inventory_item_id
        and position.location_id = level.location_id
        and position.condition_code = level.condition_code
      left join (
        select layer.organization_id, layer.inventory_item_id, layer.location_id, layer.condition_code, sum(layer.quantity) as quantity
        from costing.return_cost_layers layer
        where layer.organization_id = ${organizationId}
        group by layer.organization_id, layer.inventory_item_id, layer.location_id, layer.condition_code
      ) returned on returned.organization_id = level.organization_id
        and returned.inventory_item_id = level.inventory_item_id
        and returned.location_id = level.location_id
        and returned.condition_code = level.condition_code
      where level.organization_id = ${organizationId}
        and (position.quantity is not null or returned.quantity is not null)
        and coalesce(position.quantity, 0) + coalesce(returned.quantity, 0) <> level.quantity
    `.execute(db),
  ]);
  return [
    ...checks[0].rows.map((row) => ({
      code: 'ALLOCATION_MISMATCH',
      summary: 'Finalized component allocations do not equal its committed amount.',
      entityId: row.id,
    })),
    ...checks[2].rows.map((row) => ({
      code: 'LAYER_RECEIPT_QUANTITY_MISMATCH',
      summary: 'Cost Layer quantity differs from its canonical Receipt Line.',
      entityId: row.id,
    })),
    ...checks[3].rows.map((row) => ({
      code: 'UNCOSTED_INVENTORY',
      summary: 'Physical inventory has no authoritative Cost Layer provenance.',
      entityId: row.id,
    })),
    ...checks[4].rows.map((row) => ({
      code: 'DELIVERED_COGS_MISSING',
      summary: 'Delivered cost-enabled fulfillment is missing COGS recognition.',
      entityId: row.id,
    })),
    ...checks[1].rows.map((row) => ({
      code: 'ADJUSTMENT_EFFECT_MISMATCH',
      summary:
        'Outbound and recognized COGS adjustment effects exceed their source Layer adjustment.',
      entityId: row.id,
    })),
    ...checks[5].rows.map((row) => ({
      code: 'NEGATIVE_FIFO_POSITION',
      summary: 'A Cost Layer Position must never have negative remaining quantity.',
      entityId: row.id,
    })),
    ...checks[6].rows.map((row) => ({
      code: 'OUTBOUND_ASSIGNMENT_QUANTITY_MISMATCH',
      summary: 'Outbound Cost Assignment quantity differs from the physical Fulfillment quantity.',
      entityId: row.id,
    })),
    ...checks[7].rows.map((row) => ({
      code: 'OUTBOUND_ASSIGNMENT_MISSING',
      summary: 'Cost-enabled physical outbound inventory is missing its Cost Assignment.',
      entityId: row.id,
    })),
    ...checks[8].rows.map((row) => ({
      code: 'COGS_ORPHAN',
      summary: 'COGS recognition has no valid Outbound Cost Assignment.',
      entityId: row.id,
    })),
    ...checks[9].rows.map((row) => ({
      code: 'FX_PROVENANCE_MISSING',
      summary: 'Cross-currency cost component is missing persisted FX provenance.',
      entityId: row.id,
    })),
    ...checks[10].rows.map((row) => ({
      code: 'VALUATION_QUANTITY_MISMATCH',
      summary: 'FIFO Position quantity exceeds the matching physical inventory quantity.',
      entityId: row.id,
    })),
    ...checks[11].rows.map((row) => ({
      code: 'ACQUISITION_RESULT_MISMATCH',
      summary: 'Shipment acquisition total or unit result is internally inconsistent.',
      entityId: row.id,
    })),
    ...checks[12].rows.map((row) => ({
      code: 'VALUATION_QUANTITY_MISMATCH',
      summary: 'FIFO Position quantity differs from matching physical inventory.',
      entityId: row.id,
    })),
  ];
}
