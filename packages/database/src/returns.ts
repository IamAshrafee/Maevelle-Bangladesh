import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import {
  InventoryDomainError,
  moveInventoryConditionInTransaction,
  receiveReturnInventoryInTransaction,
  type InventoryCondition,
} from './inventory.js';
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
  return (await listReturnCasePage(db, organizationId, { pageSize: 100 })).items;
}

export async function listReturnCasePage(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters: {
    readonly page?: number;
    readonly pageSize?: number;
    readonly search?: string;
    readonly caseType?: 'CUSTOMER_RETURN' | 'RTO';
    readonly status?: 'OPEN' | 'RESOLVED' | 'CANCELLED';
  } = {},
) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 25)));
  const offset = (page - 1) * pageSize;
  const search = filters.search?.trim() || null;
  const caseType = filters.caseType ?? null;
  const status = filters.status ?? null;
  const [items, total] = await Promise.all([
    sql`select return_case.id,return_case.return_number,return_case.case_type,return_case.case_status,return_case.authorization_status,return_case.transport_status,return_case.receipt_status,return_case.inspection_status,return_case.commercial_resolution_status,return_case.version::text,return_case.created_at::text,return_case.order_id,orders.order_number,customer.display_name as customer_name,return_case.reason_code
      from returns.return_cases return_case
      join orders.orders orders on orders.id=return_case.order_id and orders.organization_id=return_case.organization_id
      left join customers.customers customer on customer.id=return_case.customer_id and customer.organization_id=return_case.organization_id
      where return_case.organization_id=${organizationId}
        and (${caseType}::text is null or return_case.case_type=${caseType})
        and (${status}::text is null or return_case.case_status=${status})
        and (${search}::text is null or return_case.return_number ilike '%'||${search}||'%'
          or orders.order_number ilike '%'||${search}||'%'
          or coalesce(customer.display_name,'') ilike '%'||${search}||'%')
      order by return_case.created_at desc,return_case.id desc
      limit ${pageSize} offset ${offset}`.execute(db),
    sql<{ total: string }>`select count(*)::text as total
      from returns.return_cases return_case
      join orders.orders orders on orders.id=return_case.order_id and orders.organization_id=return_case.organization_id
      left join customers.customers customer on customer.id=return_case.customer_id and customer.organization_id=return_case.organization_id
      where return_case.organization_id=${organizationId}
        and (${caseType}::text is null or return_case.case_type=${caseType})
        and (${status}::text is null or return_case.case_status=${status})
        and (${search}::text is null or return_case.return_number ilike '%'||${search}||'%'
          or orders.order_number ilike '%'||${search}||'%'
          or coalesce(customer.display_name,'') ilike '%'||${search}||'%')`.execute(db),
  ]);
  const totalItems = Number(total.rows[0]?.total ?? 0);
  return {
    items: items.rows,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
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
    transport_status: string;
    receipt_status: string;
    inspection_status: string;
    commercial_resolution_status: string;
    version: string;
    order_id: string;
    order_number: string;
    customer_name: string | null;
    reason_code: string;
    reason_text: string | null;
  }>`select return_case.id,return_case.return_number,return_case.case_type,return_case.case_status,return_case.authorization_status,return_case.transport_status,return_case.receipt_status,return_case.inspection_status,return_case.commercial_resolution_status,return_case.version::text,return_case.order_id,orders.order_number,customer.display_name as customer_name,return_case.reason_code,return_case.reason_text from returns.return_cases return_case join orders.orders orders on orders.id=return_case.order_id and orders.organization_id=return_case.organization_id left join customers.customers customer on customer.id=return_case.customer_id and customer.organization_id=return_case.organization_id where return_case.organization_id=${input.organizationId} and return_case.id=${input.returnCaseId}`.execute(
    db,
  );
  if (!header.rows[0]) throw new ReturnDomainError('NOT_FOUND', 'Return case was not found.');
  const [lines, receipts, receiptLines, reverseShipments, refunds, recovery] = await Promise.all([
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
      receipt_number: string;
      version: string;
      sku: string;
      quantity: string;
      inspected_quantity: string;
      condition_code: string;
    }>`select receipt_line.id,receipt.receipt_number,receipt_line.version::text,variant.sku,
      receipt_line.quantity::text,receipt_line.inspected_quantity::text,receipt_line.condition_code
      from returns.return_receipt_lines receipt_line
      join returns.return_receipts receipt on receipt.id=receipt_line.return_receipt_id
      join returns.return_lines return_line on return_line.id=receipt_line.return_line_id
      join orders.order_lines order_line on order_line.id=return_line.order_line_id
      join catalog.product_variants variant on variant.id=order_line.variant_id
      where receipt_line.organization_id=${input.organizationId} and receipt.return_case_id=${input.returnCaseId}
      order by receipt.posted_at,receipt_line.created_at,receipt_line.id`.execute(db),
    sql<{
      id: string;
      shipment_number: string;
      provider_code: string;
      status: string;
      tracking_reference: string | null;
      created_at: string;
    }>`select id,shipment_number,provider_code,status,tracking_reference,created_at::text
      from returns.reverse_shipments where organization_id=${input.organizationId} and return_case_id=${input.returnCaseId}
      order by created_at desc`.execute(db),
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
    receiptLines: receiptLines.rows,
    reverseShipments: reverseShipments.rows,
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
    }>`select refund.id from payments.refunds refund join returns.return_cases return_case on return_case.organization_id=refund.organization_id and return_case.order_id=refund.order_id where refund.organization_id=${input.organizationId} and refund.id=${input.refundId} and return_case.id=${input.returnCaseId} and return_case.case_status <> 'CANCELLED'`.execute(
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
    await sql`update returns.return_cases return_case
      set commercial_resolution_status=case when not exists (select 1 from returns.return_refund_links link join payments.refunds refund on refund.id=link.refund_id where link.organization_id=return_case.organization_id and link.return_case_id=return_case.id and refund.status <> 'COMPLETED') then 'REFUND_COMPLETED' else 'REFUND_PENDING' end,
        case_status=case when return_case.inspection_status='COMPLETED' and not exists (select 1 from returns.return_refund_links link join payments.refunds refund on refund.id=link.refund_id where link.organization_id=return_case.organization_id and link.return_case_id=return_case.id and refund.status <> 'COMPLETED') then 'RESOLVED' else return_case.case_status end,
        resolved_at=case when return_case.inspection_status='COMPLETED' and not exists (select 1 from returns.return_refund_links link join payments.refunds refund on refund.id=link.refund_id where link.organization_id=return_case.organization_id and link.return_case_id=return_case.id and refund.status <> 'COMPLETED') then coalesce(return_case.resolved_at,now()) else return_case.resolved_at end,
        updated_at=now(),version=version+1
      where return_case.organization_id=${input.organizationId} and return_case.id=${input.returnCaseId}`.execute(
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
): Promise<{ recordId?: string; replay?: { id: string } }> {
  try {
    const record = await claimIdempotencyRecord(tx, {
      organizationId,
      principalType: 'USER',
      principalId: actorId,
      operationType: operation,
      idempotencyKey,
      requestFingerprint: key(request),
    });
    if (!record.created) {
      const existing = await sql<{ status: string; safe_response: unknown }>`
        select status, safe_response from platform.idempotency_records where id=${record.id}
      `.execute(tx);
      if (existing.rows[0]?.status === 'SUCCEEDED')
        return { replay: existing.rows[0].safe_response as { id: string } };
      throw new ReturnDomainError('CONFLICT', 'The same return command is already in progress.');
    }
    return { recordId: record.id };
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
  await sql`insert into platform.outbox_events (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    select return_case.organization_id,${event},1,'returns.return_case',return_case.id,return_case.version,
      jsonb_build_object('returnCaseId',return_case.id,'orderId',return_case.order_id),now()
    from returns.return_cases return_case
    where return_case.organization_id=${organizationId} and return_case.id=${id}`.execute(tx);
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
    const started = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.create',
      input.idempotencyKey,
      input,
    );
    if (started.replay) return started.replay;
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
      }>`select coalesce(sum(delivery_line.delivered_quantity),0)::text as quantity from delivery.delivery_lines delivery_line join delivery.deliveries delivery on delivery.organization_id=delivery_line.organization_id and delivery.id=delivery_line.delivery_id where delivery_line.organization_id=${input.organizationId} and delivery.order_id=${input.orderId} and delivery.outcome_status='DELIVERED' and delivery_line.order_line_id=${line.orderLineId}`.execute(
        tx,
      );
      const used = await sql<{
        quantity: string;
      }>`select coalesce(sum(return_line.authorized_quantity),0)::text as quantity from returns.return_lines return_line join returns.return_cases return_case on return_case.organization_id=return_line.organization_id and return_case.id=return_line.return_case_id where return_line.organization_id=${input.organizationId} and return_case.order_id=${input.orderId} and return_line.order_line_id=${line.orderLineId} and return_case.case_status <> 'CANCELLED'`.execute(
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
          and delivery.organization_id=delivery_line.organization_id
          and delivery.order_id=${input.orderId}
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
      await sql`insert into returns.return_lines (organization_id,return_case_id,order_id,order_line_id,fulfillment_line_id,delivery_line_id,requested_quantity) values (${input.organizationId},${id},${input.orderId},${line.orderLineId},${line.fulfillmentLineId ?? null},${line.deliveryLineId ?? null},${line.quantity}::numeric)`.execute(
        tx,
      );
    await finish(tx, started.recordId!, 'returns.return_case', id);
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
    const started = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.authorize',
      input.idempotencyKey,
      input,
    );
    if (started.replay) return started.replay;
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
    await finish(tx, started.recordId!, 'returns.return_case', input.returnCaseId);
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
    const started = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.rto-initiate',
      input.idempotencyKey,
      input,
    );
    if (started.replay) return started.replay;
    const delivery = await sql<{
      order_id: string;
      customer_id: string;
      payment_method: string;
    }>`select delivery.order_id, orders.customer_id, orders.payment_method from delivery.deliveries delivery join orders.orders orders on orders.id=delivery.order_id where delivery.organization_id=${input.organizationId} and delivery.id=${input.deliveryId} and delivery.outcome_status='FAILED' for update of delivery`.execute(
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
    }>`insert into returns.return_cases (organization_id,return_number,case_type,order_id,customer_id,delivery_id,authorization_status,transport_status,commercial_resolution_status,reason_code,created_by_actor_id) values (${input.organizationId},${`RTO-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`},'RTO',${row.order_id},${row.customer_id},${input.deliveryId},'NOT_REQUIRED','EXPECTED',${row.payment_method === 'COD' ? 'NO_REFUND_REQUIRED' : 'REFUND_PENDING'},'COURIER_FAILURE',${input.actorId}) returning id`.execute(
      tx,
    );
    const id = created.rows[0]!.id;
    await sql`insert into returns.return_lines (organization_id,return_case_id,order_id,order_line_id,fulfillment_line_id,delivery_line_id,requested_quantity,authorized_quantity) select ${input.organizationId},${id},${row.order_id},delivery_line.order_line_id,delivery_line.fulfillment_line_id,delivery_line.id,delivery_line.quantity,delivery_line.quantity from delivery.delivery_lines delivery_line where delivery_line.organization_id=${input.organizationId} and delivery_line.delivery_id=${input.deliveryId}`.execute(
      tx,
    );
    await sql`update delivery.deliveries set operational_status='RTO_INITIATED',last_tracking_event_at=now(),version=version+1,updated_at=now() where organization_id=${input.organizationId} and id=${input.deliveryId}`.execute(
      tx,
    );
    await finish(tx, started.recordId!, 'returns.return_case', id);
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

export interface RtoTransportContext {
  readonly id: string;
  readonly version: number;
  readonly transportStatus: 'NOT_STARTED' | 'EXPECTED' | 'IN_TRANSIT' | 'ARRIVED' | 'LOST';
}

export async function getRtoCaseForDelivery(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; deliveryId: string },
): Promise<RtoTransportContext | null> {
  const result = await sql<{
    id: string;
    version: string;
    transport_status: RtoTransportContext['transportStatus'];
  }>`select id,version::text,transport_status from returns.return_cases
    where organization_id=${input.organizationId} and delivery_id=${input.deliveryId}
      and case_type='RTO' and case_status='OPEN'
    order by created_at desc,id desc limit 1`.execute(db);
  const row = result.rows[0];
  return row
    ? { id: row.id, version: Number(row.version), transportStatus: row.transport_status }
    : null;
}

export async function postReturnReceipt(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    returnCaseId: string;
    locationId: string;
    lines: readonly { returnLineId: string; condition?: InventoryCondition; quantity: string }[];
    idempotencyKey: string;
    fault?: () => void;
  },
) {
  if (!input.lines.length)
    throw new ReturnDomainError('VALIDATION_FAILED', 'A reverse receipt needs at least one line.');
  return db.transaction().execute(async (tx) => {
    const started = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.receipt-post',
      input.idempotencyKey,
      input,
    );
    if (started.replay) return started.replay;
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
        returnLineId: line.returnLineId,
        quantity: line.quantity,
        inventoryItemId: item.inventory_item_id,
        costSlices,
      });
    }
    const inventoryTransactionId = await receiveReturnInventoryInTransaction(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      receiptId,
      locationId: input.locationId,
      idempotencyRecordId: started.recordId!,
      lines: prepared.map((x) => ({
        inventoryItemId: x.inventoryItemId,
        // Receiving proves possession, not sellability. Inspection/disposition
        // is a separate command and authoritative condition movement.
        condition: 'INSPECTION',
        quantity: x.quantity,
      })),
    });
    await sql`update returns.return_receipts set posted_inventory_transaction_id=${inventoryTransactionId}::uuid where id=${receiptId}`.execute(
      tx,
    );
    for (const line of prepared) {
      const inserted = await sql<{
        id: string;
      }>`insert into returns.return_receipt_lines (organization_id,return_receipt_id,return_line_id,inventory_item_id,condition_code,quantity) values (${input.organizationId},${receiptId},${line.returnLineId},${line.inventoryItemId},'INSPECTION',${line.quantity}::numeric) returning id`.execute(
        tx,
      );
      for (const slice of line.costSlices) {
        const costLayer = await sql<{
          id: string;
        }>`insert into costing.return_cost_layers (organization_id,return_receipt_line_id,inventory_item_id,location_id,condition_code,original_outbound_assignment_line_id,quantity,unit_cost,currency_code) values (${input.organizationId},${inserted.rows[0]!.id},${line.inventoryItemId},${input.locationId},'INSPECTION',${slice.assignmentLineId},${slice.quantity}::numeric,${slice.unitCost}::numeric,${slice.currency}) returning id`.execute(
          tx,
        );
        await sql`insert into costing.return_cost_layer_positions (organization_id, return_cost_layer_id, location_id, condition_code, remaining_quantity) values (${input.organizationId}, ${costLayer.rows[0]!.id}, ${input.locationId}, 'INSPECTION', ${slice.quantity}::numeric)`.execute(
          tx,
        );
      }
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
    await sql`update returns.return_cases set receipt_status=${complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED'},transport_status=case when ${complete} then 'ARRIVED' else transport_status end,inspection_status='PENDING',case_status='OPEN',updated_at=now(),version=version+1 where id=${input.returnCaseId}`.execute(
      tx,
    );
    if (complete && header.rows[0].case_type === 'RTO')
      await sql`update delivery.deliveries delivery set operational_status='RETURNED_TO_ORIGIN',outcome_status='RETURNED_TO_ORIGIN',last_tracking_event_at=now(),version=delivery.version+1,updated_at=now() from returns.return_cases return_case where return_case.id=${input.returnCaseId} and return_case.delivery_id=delivery.id and delivery.organization_id=${input.organizationId}`.execute(
        tx,
      );
    await finish(tx, started.recordId!, 'returns.return_receipt', receiptId);
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

export async function decideReturnAuthorization(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    returnCaseId: string;
    expectedVersion: number;
    decision: 'APPROVE' | 'REJECT';
    lines?: readonly { returnLineId: string; quantity: string }[];
    reason?: string;
    expiresAt?: string;
    idempotencyKey: string;
  },
) {
  if (input.decision === 'REJECT' && !input.reason?.trim())
    throw new ReturnDomainError('VALIDATION_FAILED', 'A rejection reason is required.');
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
  if (expiresAt && Number.isNaN(expiresAt.valueOf()))
    throw new ReturnDomainError('VALIDATION_FAILED', 'Authorization expiry is invalid.');
  return db.transaction().execute(async (tx) => {
    const started = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.authorization.decide',
      input.idempotencyKey,
      input,
    );
    if (started.replay) return started.replay;
    const current = await sql<{ version: string; authorization_status: string }>`
      select version::text, authorization_status from returns.return_cases
      where organization_id=${input.organizationId} and id=${input.returnCaseId}
        and case_type='CUSTOMER_RETURN' and case_status='OPEN' for update
    `.execute(tx);
    const row = current.rows[0];
    if (!row) throw new ReturnDomainError('NOT_FOUND', 'Open Customer Return was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new ReturnDomainError('CONFLICT', 'Return has changed; reload before deciding.');
    if (row.authorization_status !== 'PENDING')
      throw new ReturnDomainError('CONFLICT', 'Return authorization was already decided.');
    if (input.decision === 'REJECT') {
      await sql`update returns.return_cases set authorization_status='REJECTED',case_status='RESOLVED',rejected_at=now(),rejection_reason=${input.reason!.trim()},resolved_at=now(),updated_at=now(),version=version+1 where id=${input.returnCaseId}`.execute(
        tx,
      );
    } else {
      const requested = await sql<{ id: string; requested_quantity: string }>`
        select id, requested_quantity::text from returns.return_lines
        where organization_id=${input.organizationId} and return_case_id=${input.returnCaseId}
        order by id for update
      `.execute(tx);
      const decisions = new Map(
        (input.lines ?? []).map((line) => [line.returnLineId, line.quantity]),
      );
      let approvedLines = 0;
      let partiallyApproved = false;
      for (const line of requested.rows) {
        const quantity = decisions.get(line.id) ?? (input.lines ? '0' : line.requested_quantity);
        const valid = await sql<{
          valid: boolean;
        }>`select ${quantity}::numeric >= 0 and ${quantity}::numeric <= ${line.requested_quantity}::numeric as valid`.execute(
          tx,
        );
        if (!valid.rows[0]!.valid)
          throw new ReturnDomainError(
            'VALIDATION_FAILED',
            'Authorized quantity must be between zero and the requested quantity.',
          );
        if (Number(quantity) > 0) approvedLines += 1;
        if (Number(quantity) !== Number(line.requested_quantity)) partiallyApproved = true;
        await sql`update returns.return_lines set authorized_quantity=${quantity}::numeric,updated_at=now(),version=version+1 where id=${line.id}`.execute(
          tx,
        );
      }
      if (!approvedLines)
        throw new ReturnDomainError(
          'VALIDATION_FAILED',
          'Approval requires at least one positive line quantity.',
        );
      await sql`update returns.return_cases set authorization_status=${partiallyApproved ? 'PARTIALLY_APPROVED' : 'APPROVED'},transport_status='EXPECTED',authorized_by_actor_id=${input.actorId},authorized_at=now(),authorization_expires_at=${expiresAt ?? null},updated_at=now(),version=version+1 where id=${input.returnCaseId}`.execute(
        tx,
      );
    }
    await finish(tx, started.recordId!, 'returns.return_case', input.returnCaseId);
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      input.decision === 'REJECT' ? 'returns.case.rejected' : 'returns.case.authorized',
      input.decision === 'REJECT' ? 'returns.rejected' : 'returns.authorized',
      input.returnCaseId,
    );
    return { id: input.returnCaseId };
  });
}

export async function cancelReturnCase(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    returnCaseId: string;
    expectedVersion: number;
    reason: string;
    idempotencyKey: string;
  },
) {
  if (!input.reason.trim())
    throw new ReturnDomainError('VALIDATION_FAILED', 'A cancellation reason is required.');
  return db.transaction().execute(async (tx) => {
    const started = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.cancel',
      input.idempotencyKey,
      input,
    );
    if (started.replay) return started.replay;
    const current = await sql<{ version: string; received: boolean }>`
      select return_case.version::text,
        exists(select 1 from returns.return_lines line where line.return_case_id=return_case.id and line.received_quantity > 0) as received
      from returns.return_cases return_case
      where return_case.organization_id=${input.organizationId} and return_case.id=${input.returnCaseId}
        and return_case.case_status='OPEN' for update
    `.execute(tx);
    const row = current.rows[0];
    if (!row) throw new ReturnDomainError('NOT_FOUND', 'Open Return case was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new ReturnDomainError('CONFLICT', 'Return has changed; reload before cancelling.');
    if (row.received)
      throw new ReturnDomainError(
        'CONFLICT',
        'A Return cannot be cancelled after physical goods were received.',
      );
    await sql`update returns.return_cases set case_status='CANCELLED',transport_status='CANCELLED',cancelled_at=now(),cancellation_reason=${input.reason.trim()},updated_at=now(),version=version+1 where id=${input.returnCaseId}`.execute(
      tx,
    );
    await finish(tx, started.recordId!, 'returns.return_case', input.returnCaseId);
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      'returns.case.cancelled',
      'returns.cancelled',
      input.returnCaseId,
    );
    return { id: input.returnCaseId };
  });
}

export async function createReverseShipment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    returnCaseId: string;
    expectedVersion: number;
    providerCode: string;
    trackingReference?: string;
    externalConsignmentId?: string;
    idempotencyKey: string;
  },
) {
  if (!input.providerCode.trim())
    throw new ReturnDomainError('VALIDATION_FAILED', 'Reverse shipment provider is required.');
  return db.transaction().execute(async (tx) => {
    const started = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.reverse-shipment.create',
      input.idempotencyKey,
      input,
    );
    if (started.replay) return started.replay;
    const current = await sql<{ version: string; authorization_status: string }>`
      select version::text, authorization_status from returns.return_cases
      where organization_id=${input.organizationId} and id=${input.returnCaseId} and case_status='OPEN' for update
    `.execute(tx);
    const row = current.rows[0];
    if (!row) throw new ReturnDomainError('NOT_FOUND', 'Open Return case was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new ReturnDomainError('CONFLICT', 'Return has changed; reload before shipping.');
    if (!['NOT_REQUIRED', 'APPROVED', 'PARTIALLY_APPROVED'].includes(row.authorization_status))
      throw new ReturnDomainError('CONFLICT', 'Return authorization is required before shipment.');
    const created = await sql<{
      id: string;
    }>`insert into returns.reverse_shipments (organization_id,return_case_id,shipment_number,provider_code,status,tracking_reference,external_consignment_id) values (${input.organizationId},${input.returnCaseId},${`RVS-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`},${input.providerCode.trim().toUpperCase()},${input.trackingReference ? 'BOOKED' : 'EXPECTED'},${input.trackingReference ?? null},${input.externalConsignmentId ?? null}) returning id`.execute(
      tx,
    );
    await sql`update returns.return_cases set transport_status='EXPECTED',updated_at=now(),version=version+1 where id=${input.returnCaseId}`.execute(
      tx,
    );
    await finish(tx, started.recordId!, 'returns.reverse_shipment', created.rows[0]!.id);
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      'returns.reverse_shipment.created',
      'returns.reverse_shipment_created',
      input.returnCaseId,
    );
    return { id: created.rows[0]!.id };
  });
}

export async function transitionReturnTransport(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    returnCaseId: string;
    expectedVersion: number;
    nextStatus: 'IN_TRANSIT' | 'ARRIVED' | 'LOST';
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const started = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.transport.transition',
      input.idempotencyKey,
      input,
    );
    if (started.replay) return started.replay;
    const current = await sql<{
      version: string;
      transport_status: string;
      case_type: string;
      delivery_id: string | null;
    }>`select version::text, transport_status, case_type, delivery_id from returns.return_cases
      where organization_id=${input.organizationId} and id=${input.returnCaseId} and case_status='OPEN' for update`.execute(
      tx,
    );
    const row = current.rows[0];
    if (!row) throw new ReturnDomainError('NOT_FOUND', 'Open Return case was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new ReturnDomainError('CONFLICT', 'Return has changed; reload before updating.');
    const valid =
      (['EXPECTED', 'NOT_STARTED'].includes(row.transport_status) &&
        ['IN_TRANSIT', 'ARRIVED', 'LOST'].includes(input.nextStatus)) ||
      (row.transport_status === 'IN_TRANSIT' && ['ARRIVED', 'LOST'].includes(input.nextStatus));
    if (!valid)
      throw new ReturnDomainError('CONFLICT', 'This reverse transport transition is not allowed.');
    await sql`update returns.return_cases set transport_status=${input.nextStatus},updated_at=now(),version=version+1 where id=${input.returnCaseId}`.execute(
      tx,
    );
    await sql`update returns.reverse_shipments set status=${input.nextStatus},shipped_at=case when ${input.nextStatus}='IN_TRANSIT' then coalesce(shipped_at,now()) else shipped_at end,arrived_at=case when ${input.nextStatus}='ARRIVED' then coalesce(arrived_at,now()) else arrived_at end,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and return_case_id=${input.returnCaseId} and status in ('EXPECTED','BOOKED','IN_TRANSIT')`.execute(
      tx,
    );
    if (row.case_type === 'RTO' && row.delivery_id)
      await sql`update delivery.deliveries set operational_status=${input.nextStatus === 'IN_TRANSIT' ? 'RETURNING' : input.nextStatus === 'LOST' ? 'LOST' : 'RETURNING'},outcome_status=case when ${input.nextStatus}='LOST' then 'LOST' else outcome_status end,last_tracking_event_at=now(),updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${row.delivery_id}`.execute(
        tx,
      );
    await finish(tx, started.recordId!, 'returns.return_case', input.returnCaseId);
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      'returns.transport.updated',
      `returns.transport_${input.nextStatus.toLowerCase()}`,
      input.returnCaseId,
    );
    return { id: input.returnCaseId };
  });
}

export async function inspectReturnReceiptLine(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    returnReceiptLineId: string;
    expectedVersion: number;
    quantity: string;
    outcome: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'REJECTED_RETURN';
    note?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const started = await claim(
      tx,
      input.organizationId,
      input.actorId,
      'returns.inspect',
      input.idempotencyKey,
      input,
    );
    if (started.replay) return started.replay;
    const source = await sql<{
      version: string;
      quantity: string;
      inspected_quantity: string;
      inventory_item_id: string;
      receiving_location_id: string;
      return_case_id: string;
      return_line_id: string;
    }>`select receipt_line.version::text,receipt_line.quantity::text,receipt_line.inspected_quantity::text,
      receipt_line.inventory_item_id,receipt.receiving_location_id,receipt.return_case_id,receipt_line.return_line_id
      from returns.return_receipt_lines receipt_line
      join returns.return_receipts receipt on receipt.id=receipt_line.return_receipt_id and receipt.organization_id=receipt_line.organization_id
      where receipt_line.organization_id=${input.organizationId} and receipt_line.id=${input.returnReceiptLineId}
      for update of receipt_line`.execute(tx);
    const row = source.rows[0];
    if (!row) throw new ReturnDomainError('NOT_FOUND', 'Return receipt line was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new ReturnDomainError(
        'CONFLICT',
        'Receipt line has changed; reload before inspecting.',
      );
    const valid = await sql<{
      valid: boolean;
    }>`select ${input.quantity}::numeric > 0 and ${input.quantity}::numeric <= ${row.quantity}::numeric - ${row.inspected_quantity}::numeric as valid`.execute(
      tx,
    );
    if (!valid.rows[0]!.valid)
      throw new ReturnDomainError(
        'CONFLICT',
        'Inspection quantity exceeds the uninspected received quantity.',
      );
    const targetCondition: InventoryCondition =
      input.outcome === 'SELLABLE'
        ? 'SELLABLE'
        : input.outcome === 'DAMAGED'
          ? 'DAMAGED'
          : 'QUARANTINE';
    let inventoryTransactionId: string;
    try {
      inventoryTransactionId = await moveInventoryConditionInTransaction(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        inventoryItemId: row.inventory_item_id,
        locationId: row.receiving_location_id,
        fromCondition: 'INSPECTION',
        toCondition: targetCondition,
        quantity: input.quantity,
        reason: input.note ?? `Return inspection: ${input.outcome}`,
        idempotencyRecordId: started.recordId!,
        referenceType: 'returns.return_receipt_line',
        referenceId: input.returnReceiptLineId,
      });
    } catch (error) {
      if (error instanceof InventoryDomainError)
        throw new ReturnDomainError('CONFLICT', error.message);
      throw error;
    }
    const inspection = await sql<{
      id: string;
    }>`insert into returns.return_inspections (organization_id,return_receipt_line_id,quantity,outcome,notes,inspected_by_actor_id) values (${input.organizationId},${input.returnReceiptLineId},${input.quantity}::numeric,${input.outcome},${input.note ?? null},${input.actorId}) returning id`.execute(
      tx,
    );
    const disposition =
      input.outcome === 'SELLABLE'
        ? 'RESTOCK_SELLABLE'
        : input.outcome === 'DAMAGED'
          ? 'RESTOCK_DAMAGED'
          : input.outcome === 'REJECTED_RETURN'
            ? 'REJECT_TO_CUSTOMER'
            : 'HOLD_QUARANTINE';
    await sql`insert into returns.return_dispositions (organization_id,return_inspection_id,disposition_type,quantity,inventory_transaction_id) values (${input.organizationId},${inspection.rows[0]!.id},${disposition},${input.quantity}::numeric,${inventoryTransactionId})`.execute(
      tx,
    );
    await sql`update returns.return_receipt_lines set inspected_quantity=inspected_quantity+${input.quantity}::numeric,updated_at=now(),version=version+1 where id=${input.returnReceiptLineId}`.execute(
      tx,
    );
    await sql`update returns.return_lines set inspected_quantity=inspected_quantity+${input.quantity}::numeric,disposed_quantity=disposed_quantity+${input.quantity}::numeric,updated_at=now(),version=version+1 where id=${row.return_line_id}`.execute(
      tx,
    );
    const remaining = await sql<{
      count: string;
      receipt_status: string;
      commercial_status: string;
    }>`
      select count(*) filter(where receipt_line.inspected_quantity < receipt_line.quantity)::text as count,
        return_case.receipt_status,return_case.commercial_resolution_status as commercial_status
      from returns.return_cases return_case
      left join returns.return_receipts receipt on receipt.return_case_id=return_case.id
      left join returns.return_receipt_lines receipt_line on receipt_line.return_receipt_id=receipt.id
      where return_case.id=${row.return_case_id}
      group by return_case.receipt_status,return_case.commercial_resolution_status
    `.execute(tx);
    const completed =
      remaining.rows[0]?.receipt_status === 'RECEIVED' &&
      Number(remaining.rows[0]?.count ?? 0) === 0;
    const commerciallyResolved = [
      'NO_REFUND_REQUIRED',
      'REFUND_COMPLETED',
      'OTHER_RESOLUTION',
    ].includes(remaining.rows[0]?.commercial_status ?? '');
    await sql`update returns.return_cases set inspection_status=${completed ? 'COMPLETED' : 'PARTIALLY_INSPECTED'},case_status=${completed && commerciallyResolved ? 'RESOLVED' : 'OPEN'},resolved_at=case when ${completed && commerciallyResolved} then now() else resolved_at end,updated_at=now(),version=version+1 where id=${row.return_case_id}`.execute(
      tx,
    );
    await finish(tx, started.recordId!, 'returns.return_inspection', inspection.rows[0]!.id);
    await evidence(
      tx,
      input.organizationId,
      input.actorId,
      'returns.receipt_line.inspected',
      'returns.inspected',
      row.return_case_id,
    );
    return { id: inspection.rows[0]!.id };
  });
}
