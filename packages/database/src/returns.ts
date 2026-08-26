import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { receiveReturnInventoryInTransaction, type InventoryCondition } from './inventory.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';

export class ReturnDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED',
    message: string,
  ) {
    super(message);
  }
}
export async function listReturnCases(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select return_case.id,return_case.return_number,return_case.case_type,return_case.case_status,return_case.authorization_status,return_case.receipt_status,return_case.version::text,return_case.created_at::text,return_case.order_id,orders.order_number,customer.display_name as customer_name,return_case.reason_code from returns.return_cases return_case join orders.orders orders on orders.id=return_case.order_id and orders.organization_id=return_case.organization_id left join customers.customers customer on customer.id=return_case.customer_id and customer.organization_id=return_case.organization_id where return_case.organization_id = ${organizationId} order by return_case.created_at desc`.execute(
      db,
    )
  ).rows;
}

export async function getReturnCase(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; returnCaseId: string },
) {
  const header = await sql<{
    id: string;
    return_number: string;
    case_type: string;
    case_status: string;
    authorization_status: string;
    receipt_status: string;
    version: string;
    order_id: string;
    order_number: string;
    customer_name: string | null;
    reason_code: string;
    reason_text: string | null;
  }>`select return_case.id,return_case.return_number,return_case.case_type,return_case.case_status,return_case.authorization_status,return_case.receipt_status,return_case.version::text,return_case.order_id,orders.order_number,customer.display_name as customer_name,return_case.reason_code,return_case.reason_text from returns.return_cases return_case join orders.orders orders on orders.id=return_case.order_id and orders.organization_id=return_case.organization_id left join customers.customers customer on customer.id=return_case.customer_id and customer.organization_id=return_case.organization_id where return_case.organization_id=${input.organizationId} and return_case.id=${input.returnCaseId}`.execute(
    db,
  );
  if (!header.rows[0]) throw new ReturnDomainError('NOT_FOUND', 'Return case was not found.');
  const [lines, receipts, refunds, recovery] = await Promise.all([
    sql<{
      id: string;
      order_line_id: string;
      fulfillment_line_id: string | null;
      delivery_line_id: string | null;
      requested_quantity: string;
      authorized_quantity: string;
      received_quantity: string;
      sku: string;
      product_title: string;
    }>`select line.id, line.order_line_id, line.fulfillment_line_id, line.delivery_line_id,
      line.requested_quantity::text, line.authorized_quantity::text, line.received_quantity::text,
      variant.sku, product.title as product_title
      from returns.return_lines line
      join orders.order_lines order_line on order_line.id=line.order_line_id
      join catalog.product_variants variant on variant.id=order_line.variant_id
      join catalog.products product on product.id=variant.product_id
      where line.organization_id=${input.organizationId} and line.return_case_id=${input.returnCaseId}
      order by line.created_at, line.id`.execute(db),
    sql<{
      id: string;
      receipt_number: string;
      status: string;
      posted_at: string;
    }>`select id, receipt_number, status, posted_at::text from returns.return_receipts where organization_id=${input.organizationId} and return_case_id=${input.returnCaseId} order by posted_at desc`.execute(
      db,
    ),
    sql<{
      id: string;
      refund_id: string;
      created_at: string;
    }>`select id, refund_id, created_at::text from returns.return_refund_links where organization_id=${input.organizationId} and return_case_id=${input.returnCaseId} order by created_at desc`.execute(
      db,
    ),
    sql<{
      total_cost: string;
      currency_code: string;
    }>`select coalesce(sum(recovery.total_cost),0)::text as total_cost, coalesce(max(recovery.currency_code),'') as currency_code
      from costing.cogs_recoveries recovery
      join returns.return_receipt_lines line on line.id=recovery.return_receipt_line_id
      join returns.return_receipts receipt on receipt.id=line.return_receipt_id
      where recovery.organization_id=${input.organizationId} and receipt.return_case_id=${input.returnCaseId}`.execute(
      db,
    ),
  ]);
  return {
    ...header.rows[0],
    lines: lines.rows,
    receipts: receipts.rows,
    refunds: refunds.rows,
    cogsRecovery: recovery.rows[0],
  };
}
export async function linkRefundToReturn(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; returnCaseId: string; refundId: string },
) {
  return db.transaction().execute(async (tx) => {
    const valid = await sql<{
      id: string;
    }>`select refund.id from payments.refunds refund join returns.return_cases return_case on return_case.order_id=refund.order_id where refund.organization_id=${input.organizationId} and refund.id=${input.refundId} and return_case.id=${input.returnCaseId}`.execute(
      tx,
    );
    if (!valid.rows[0])
      throw new ReturnDomainError(
        'NOT_FOUND',
        'Refund and Return must belong to the same organization and Order.',
      );
    await sql`insert into returns.return_refund_links (organization_id,return_case_id,refund_id) values (${input.organizationId},${input.returnCaseId},${input.refundId}) on conflict do nothing`.execute(
      tx,
    );
    await sql`update returns.return_cases set commercial_resolution_status='REFUND_PENDING',updated_at=now(),version=version+1 where id=${input.returnCaseId}`.execute(
      tx,
    );
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      'returns.refund.linked',
      'returns.refund.linked',
      input.returnCaseId,
    );
    return { id: input.returnCaseId };
  });
}

export async function verifyReturnIntegrity(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly string[]> {
  const checks = await Promise.all([
    sql<{
      bad: boolean;
    }>`select exists(select 1 from returns.return_lines where organization_id=${organizationId} and received_quantity > authorized_quantity) as bad`.execute(
      db,
    ),
    sql<{
      bad: boolean;
    }>`select exists(select 1 from returns.return_receipts receipt left join inventory.inventory_transactions tx on tx.id=receipt.posted_inventory_transaction_id where receipt.organization_id=${organizationId} and (receipt.posted_inventory_transaction_id is null or tx.reference_type <> 'returns.return_receipt')) as bad`.execute(
      db,
    ),
    sql<{
      bad: boolean;
    }>`select exists(select 1 from returns.return_receipt_lines line left join costing.return_cost_layers layer on layer.return_receipt_line_id=line.id where line.organization_id=${organizationId} and layer.id is null) as bad`.execute(
      db,
    ),
    sql<{
      bad: boolean;
    }>`select exists(select 1 from costing.cogs_recoveries recovery left join costing.cogs_recognitions recognition on recognition.outbound_cost_assignment_id=recovery.outbound_cost_assignment_id and recognition.recognition_kind='ORIGINAL' where recovery.organization_id=${organizationId} and recognition.id is null) as bad`.execute(
      db,
    ),
  ]);
  return [
    'RETURN_RECEIVED_EXCEEDS_AUTHORIZATION',
    'RETURN_RECEIPT_MISSING_INVENTORY',
    'RETURN_RECEIPT_MISSING_COST_PROVENANCE',
    'COGS_RECOVERY_WITHOUT_ORIGINAL_COGS',
  ].filter((_code, index) => checks[index]!.rows[0]?.bad);
}
const key = (value: unknown) => JSON.stringify(value);
async function claim(
  tx: Kysely<DatabaseSchema>,
  organizationId: string,
  actorId: string,
  operation: string,
  idempotencyKey: string,
  request: unknown,
) {
  try {
    const record = await claimIdempotencyRecord(tx, {
      organizationId,
      principalType: 'USER',
      principalId: actorId,
      operationType: operation,
      idempotencyKey,
      requestFingerprint: key(request),
    });
    if (!record.created)
      throw new ReturnDomainError(
        'CONFLICT',
        'The same return command is already in progress or completed.',
      );
    return record.id;
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError)
      throw new ReturnDomainError('CONFLICT', error.message);
    throw error;
  }
}
async function finish(tx: Kysely<DatabaseSchema>, recordId: string, type: string, id: string) {
  await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = ${type}, result_entity_id = ${id}::uuid, safe_response = ${JSON.stringify({ id })}::jsonb, completed_at = now() where id = ${recordId}`.execute(
    tx,
  );
}
async function evidence(
  tx: Kysely<DatabaseSchema>,
  organizationId: string,
  actorId: string,
  action: string,
  event: string,
  id: string,
) {
  await appendAuditEvent(tx, {
    organizationId,
    actorType: 'USER',
    actorId,
    action,
    targetType: 'returns.return_case',
    targetId: id,
  });
  await sql`insert into platform.outbox_events (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values (${organizationId},${event},1,'returns.return_case',${id}::uuid,1,${JSON.stringify({ returnCaseId: id })}::jsonb,now())`.execute(
    tx,
  );
}
export async function createReturnCase(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    reasonCode: string;
    reasonText?: string;
    lines: readonly {
      orderLineId: string;
      fulfillmentLineId?: string;
      deliveryLineId?: string;
      quantity: string;
    }[];
    idempotencyKey: string;
  },
) {
  if (!input.lines.length)
    throw new ReturnDomainError(
      'VALIDATION_FAILED',
      'At least one returned Order line is required.',
    );
  return db.transaction().execute(async (tx) => {
    const recordId = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.create',
      input.idempotencyKey,
      input,
    );
    const order = await sql<{
      customer_id: string;
    }>`select customer_id from orders.orders where organization_id=${input.organizationId} and id=${input.orderId} for update`.execute(
      tx,
    );
    if (!order.rows[0]) throw new ReturnDomainError('NOT_FOUND', 'Order was not found.');
    const resolvedLines: (typeof input.lines)[number][] = [];
    for (const line of input.lines) {
      const eligible = await sql<{
        quantity: string;
      }>`select coalesce(sum(delivery_line.delivered_quantity),0)::text as quantity from delivery.delivery_lines delivery_line where delivery_line.organization_id=${input.organizationId} and delivery_line.order_line_id=${line.orderLineId}`.execute(
        tx,
      );
      const used = await sql<{
        quantity: string;
      }>`select coalesce(sum(return_line.authorized_quantity),0)::text as quantity from returns.return_lines return_line join returns.return_cases return_case on return_case.id=return_line.return_case_id where return_line.organization_id=${input.organizationId} and return_line.order_line_id=${line.orderLineId} and return_case.case_status <> 'CANCELLED'`.execute(
        tx,
      );
      if (
        Number(line.quantity) + Number(used.rows[0]?.quantity ?? 0) >
        Number(eligible.rows[0]?.quantity ?? 0)
      )
        throw new ReturnDomainError(
          'CONFLICT',
          'Return quantity exceeds delivered quantity still eligible for return.',
        );
      const deliveryLine = await sql<{ id: string; fulfillment_line_id: string }>`
        select delivery_line.id, delivery_line.fulfillment_line_id
        from delivery.delivery_lines delivery_line
        join delivery.deliveries delivery on delivery.id=delivery_line.delivery_id
        where delivery_line.organization_id=${input.organizationId}
          and delivery_line.order_line_id=${line.orderLineId}
          and delivery.outcome_status='DELIVERED'
          and (${line.deliveryLineId ?? null}::uuid is null or delivery_line.id=${line.deliveryLineId ?? null}::uuid)
        order by delivery_line.created_at, delivery_line.id
        limit 1
        for update
      `.execute(tx);
      if (!deliveryLine.rows[0])
        throw new ReturnDomainError(
          'VALIDATION_FAILED',
          'A Customer Return line must resolve to a delivered physical line.',
        );
      resolvedLines.push({
        ...line,
        deliveryLineId: deliveryLine.rows[0].id,
        fulfillmentLineId: deliveryLine.rows[0].fulfillment_line_id,
      });
    }
    const created = await sql<{
      id: string;
    }>`insert into returns.return_cases (organization_id,return_number,case_type,order_id,customer_id,reason_code,reason_text,created_by_actor_id) values (${input.organizationId},${`RET-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`},'CUSTOMER_RETURN',${input.orderId},${order.rows[0].customer_id},${input.reasonCode},${input.reasonText ?? null},${input.actorId}) returning id`.execute(
      tx,
    );
    const id = created.rows[0]!.id;
    for (const line of resolvedLines)
      await sql`insert into returns.return_lines (organization_id,return_case_id,order_line_id,fulfillment_line_id,delivery_line_id,requested_quantity) values (${input.organizationId},${id},${line.orderLineId},${line.fulfillmentLineId ?? null},${line.deliveryLineId ?? null},${line.quantity}::numeric)`.execute(
        tx,
      );
    await finish(tx, recordId, 'returns.return_case', id);
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      'returns.case.created',
      'returns.created',
      id,
    );
    return { id };
  });
}
export async function authorizeReturnCase(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    returnCaseId: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const recordId = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.authorize',
      input.idempotencyKey,
      input,
    );
    const row = await sql<{
      version: string;
    }>`select version::text from returns.return_cases where organization_id=${input.organizationId} and id=${input.returnCaseId} and case_type='CUSTOMER_RETURN' for update`.execute(
      tx,
    );
    if (!row.rows[0]) throw new ReturnDomainError('NOT_FOUND', 'Customer Return was not found.');
    if (Number(row.rows[0].version) !== input.expectedVersion)
      throw new ReturnDomainError('CONFLICT', 'Return has changed; reload before authorizing.');
    await sql`update returns.return_lines set authorized_quantity=requested_quantity,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and return_case_id=${input.returnCaseId}`.execute(
      tx,
    );
    await sql`update returns.return_cases set authorization_status='APPROVED',transport_status='EXPECTED',authorized_by_actor_id=${input.actorId},authorized_at=now(),version=version+1,updated_at=now() where id=${input.returnCaseId}`.execute(
      tx,
    );
    await finish(tx, recordId, 'returns.return_case', input.returnCaseId);
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      'returns.case.authorized',
      'returns.authorized',
      input.returnCaseId,
    );
    return { id: input.returnCaseId };
  });
}

export async function initiateRto(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; deliveryId: string; idempotencyKey: string },
) {
  return db.transaction().execute(async (tx) => {
    const recordId = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.rto-initiate',
      input.idempotencyKey,
      input,
    );
    const delivery = await sql<{
      order_id: string;
      customer_id: string;
    }>`select delivery.order_id, orders.customer_id from delivery.deliveries delivery join orders.orders orders on orders.id=delivery.order_id where delivery.organization_id=${input.organizationId} and delivery.id=${input.deliveryId} and delivery.outcome_status='FAILED' for update`.execute(
      tx,
    );
    const row = delivery.rows[0];
    if (!row)
      throw new ReturnDomainError('CONFLICT', 'Only a failed Delivery may initiate an RTO.');
    const exists = await sql<{
      id: string;
    }>`select id from returns.return_cases where organization_id=${input.organizationId} and case_type='RTO' and delivery_id=${input.deliveryId}`.execute(
      tx,
    );
    if (exists.rows[0]) return { id: exists.rows[0].id };
    const created = await sql<{
      id: string;
    }>`insert into returns.return_cases (organization_id,return_number,case_type,order_id,customer_id,delivery_id,authorization_status,transport_status,reason_code,created_by_actor_id) values (${input.organizationId},${`RTO-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`},'RTO',${row.order_id},${row.customer_id},${input.deliveryId},'NOT_REQUIRED','EXPECTED','COURIER_FAILURE',${input.actorId}) returning id`.execute(
      tx,
    );
    const id = created.rows[0]!.id;
    await sql`insert into returns.return_lines (organization_id,return_case_id,order_line_id,fulfillment_line_id,delivery_line_id,requested_quantity,authorized_quantity) select ${input.organizationId},${id},delivery_line.order_line_id,delivery_line.fulfillment_line_id,delivery_line.id,delivery_line.quantity,delivery_line.quantity from delivery.delivery_lines delivery_line where delivery_line.organization_id=${input.organizationId} and delivery_line.delivery_id=${input.deliveryId}`.execute(
      tx,
    );
    await finish(tx, recordId, 'returns.return_case', id);
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      'returns.rto.initiated',
      'rto.initiated',
      id,
    );
    return { id };
  });
}

export async function postReturnReceipt(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    returnCaseId: string;
    locationId: string;
    lines: readonly { returnLineId: string; condition: InventoryCondition; quantity: string }[];
    idempotencyKey: string;
    fault?: () => void;
  },
) {
  if (!input.lines.length)
    throw new ReturnDomainError('VALIDATION_FAILED', 'A reverse receipt needs at least one line.');
  return db.transaction().execute(async (tx) => {
    const recordId = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.receipt-post',
      input.idempotencyKey,
      input,
    );
    const header = await sql<{
      case_type: string;
      authorization_status: string;
    }>`select case_type, authorization_status from returns.return_cases where organization_id=${input.organizationId} and id=${input.returnCaseId} for update`.execute(
      tx,
    );
    if (!header.rows[0]) throw new ReturnDomainError('NOT_FOUND', 'Return case was not found.');
    if (
      header.rows[0].case_type === 'CUSTOMER_RETURN' &&
      header.rows[0].authorization_status !== 'APPROVED'
    )
      throw new ReturnDomainError(
        'CONFLICT',
        'Only an authorized Customer Return may be physically received.',
      );
    const receipt = await sql<{
      id: string;
    }>`insert into returns.return_receipts (organization_id,return_case_id,receipt_number,receiving_location_id,created_by_actor_id) values (${input.organizationId},${input.returnCaseId},${`RRC-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`},${input.locationId},${input.actorId}) returning id`.execute(
      tx,
    );
    const receiptId = receipt.rows[0]!.id;
    const prepared: {
      returnLineId: string;
      condition: InventoryCondition;
      quantity: string;
      inventoryItemId: string;
      costSlices: readonly {
        assignmentLineId: string;
        unitCost: string;
        currency: string;
        assignmentId: string;
        recognized: boolean;
        quantity: string;
      }[];
    }[] = [];
    for (const line of input.lines) {
      const source = await sql<{
        inventory_item_id: string;
        authorized_quantity: string;
        received_quantity: string;
        assignment_line_id: string;
        assignment_quantity: string;
        returned_quantity: string;
        unit_cost: string;
        currency_code: string;
        outbound_cost_assignment_id: string;
        recognized: boolean;
      }>`select item.id as inventory_item_id, return_line.authorized_quantity::text,return_line.received_quantity::text,
        assignment_line.id as assignment_line_id, assignment_line.quantity::text as assignment_quantity,
        coalesce((select sum(layer.quantity) from costing.return_cost_layers layer where layer.original_outbound_assignment_line_id=assignment_line.id),0)::text as returned_quantity,
        assignment_line.unit_cost::text,assignment.currency_code,assignment.id as outbound_cost_assignment_id,
        (assignment.status='COGS_RECOGNIZED') as recognized
        from returns.return_lines return_line
        join delivery.delivery_lines delivery_line on delivery_line.id=return_line.delivery_line_id
        join fulfillment.fulfillment_lines fulfillment_line on fulfillment_line.id=delivery_line.fulfillment_line_id
        join orders.order_lines order_line on order_line.id=fulfillment_line.order_line_id
        join inventory.inventory_items item on item.organization_id=return_line.organization_id and item.variant_id=order_line.variant_id
        join inventory.fulfillment_inventory_allocations allocation on allocation.fulfillment_line_id=delivery_line.fulfillment_line_id
        join costing.outbound_cost_assignment_lines assignment_line on assignment_line.fulfillment_line_id=delivery_line.fulfillment_line_id
        join costing.outbound_cost_assignments assignment on assignment.id=assignment_line.outbound_cost_assignment_id
        where return_line.organization_id=${input.organizationId} and return_line.id=${line.returnLineId} and return_line.return_case_id=${input.returnCaseId}
        order by assignment_line.created_at, assignment_line.id
        for update of return_line, assignment_line`.execute(tx);
      const item = source.rows[0];
      if (
        !item ||
        Number(item.received_quantity) + Number(line.quantity) > Number(item.authorized_quantity)
      )
        throw new ReturnDomainError(
          'CONFLICT',
          'Reverse receipt exceeds authorized physical quantity.',
        );
      let remaining = Number(line.quantity);
      const costSlices = source.rows.flatMap((slice) => {
        const available = Math.max(
          0,
          Number(slice.assignment_quantity) - Number(slice.returned_quantity),
        );
        const consumed = Math.min(remaining, available);
        remaining -= consumed;
        return consumed > 0
          ? [
              {
                assignmentLineId: slice.assignment_line_id,
                unitCost: slice.unit_cost,
                currency: slice.currency_code,
                assignmentId: slice.outbound_cost_assignment_id,
                recognized: slice.recognized,
                quantity: consumed.toFixed(6),
              },
            ]
          : [];
      });
      if (remaining > 0)
        throw new ReturnDomainError(
          'CONFLICT',
          'Reverse receipt exceeds the immutable outbound cost provenance available for return.',
        );
      prepared.push({
        ...line,
        inventoryItemId: item.inventory_item_id,
        costSlices,
      });
    }
    const inventoryTransactionId = await receiveReturnInventoryInTransaction(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receiptId,
      locationId: input.locationId,
      idempotencyRecordId: recordId,
      lines: prepared.map((x) => ({
        inventoryItemId: x.inventoryItemId,
        condition: x.condition,
        quantity: x.quantity,
      })),
    });
    await sql`update returns.return_receipts set posted_inventory_transaction_id=${inventoryTransactionId}::uuid where id=${receiptId}`.execute(
      tx,
    );
    for (const line of prepared) {
      const inserted = await sql<{
        id: string;
      }>`insert into returns.return_receipt_lines (organization_id,return_receipt_id,return_line_id,inventory_item_id,condition_code,quantity) values (${input.organizationId},${receiptId},${line.returnLineId},${line.inventoryItemId},${line.condition},${line.quantity}::numeric) returning id`.execute(
        tx,
      );
      for (const slice of line.costSlices)
        await sql`insert into costing.return_cost_layers (organization_id,return_receipt_line_id,inventory_item_id,location_id,condition_code,original_outbound_assignment_line_id,quantity,unit_cost,currency_code) values (${input.organizationId},${inserted.rows[0]!.id},${line.inventoryItemId},${input.locationId},${line.condition},${slice.assignmentLineId},${slice.quantity}::numeric,${slice.unitCost}::numeric,${slice.currency})`.execute(
          tx,
        );
      const recognized = line.costSlices.filter((slice) => slice.recognized);
      if (recognized.length) {
        const assignmentIds = new Set(recognized.map((slice) => slice.assignmentId));
        if (assignmentIds.size !== 1)
          throw new ReturnDomainError(
            'CONFLICT',
            'A reverse receipt must not combine Cost Assignments.',
          );
        const recoveryCost = sql.join(
          recognized.map((slice) => sql`${slice.quantity}::numeric * ${slice.unitCost}::numeric`),
          sql` + `,
        );
        await sql`insert into costing.cogs_recoveries (organization_id,return_receipt_line_id,outbound_cost_assignment_id,total_cost,currency_code) values (${input.organizationId},${inserted.rows[0]!.id},${recognized[0]!.assignmentId},${recoveryCost},${recognized[0]!.currency})`.execute(
          tx,
        );
      }
      await sql`update returns.return_lines set received_quantity=received_quantity+${line.quantity}::numeric,updated_at=now(),version=version+1 where id=${line.returnLineId}`.execute(
        tx,
      );
    }
    input.fault?.();
    const outstanding = await sql<{
      count: string;
    }>`select count(*)::text as count from returns.return_lines where return_case_id=${input.returnCaseId} and received_quantity < authorized_quantity`.execute(
      tx,
    );
    const complete = Number(outstanding.rows[0]?.count ?? 0) === 0;
    await sql`update returns.return_cases set receipt_status=${complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED'},inspection_status=${complete ? 'COMPLETED' : 'PARTIALLY_INSPECTED'},case_status=${complete ? 'RESOLVED' : 'OPEN'},updated_at=now(),version=version+1 where id=${input.returnCaseId}`.execute(
      tx,
    );
    await finish(tx, recordId, 'returns.return_receipt', receiptId);
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      'returns.receipt.posted',
      'returns.received',
      input.returnCaseId,
    );
    return { id: receiptId };
  });
}
