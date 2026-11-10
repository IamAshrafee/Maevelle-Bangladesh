import { sql, type Kysely } from 'kysely';
import type { CashAdjustmentDto, CashSettlementDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../../index.js';
import { PaymentDomainError, getOrderPaymentSummary } from '../../payments.js';

type AdjustmentRow = Omit<CashAdjustmentDto, 'createdAt'> & { createdAt: Date };
const projection = sql`select r.id,r.order_id as "orderId",r.payment_id as "paymentId",r.reason,
    r.collection_evidence_reference as "collectionEvidenceReference",policy.revision as "policyRevision",
    x.reason as "reversalReason",x.evidence_reference as "reversalEvidenceReference",
    r.policy_id as "policyId",r.amount::text, r.requested_by as "requestedBy",a.approved_by as "approvedBy",
    a.finance_transaction_id as "financeTransactionId",r.created_at as "createdAt",
    case when x.id is not null then 'REVERSED' when a.id is null then 'REQUIRES_APPROVAL'
      when p.status<>'CONFIRMED' then 'COLLECTION_REVERSED' else 'APPLIED' end state
    from payments.cash_shortfall_requests r left join payments.cash_shortfall_adjustments a on a.organization_id=r.organization_id and a.id=r.id
    left join payments.cash_shortfall_reversals x on x.organization_id=r.organization_id and x.adjustment_id=r.id
    join payments.payments p on p.organization_id=r.organization_id and p.id=r.payment_id
    join payments.cash_policy_revisions policy on policy.organization_id=r.organization_id and policy.id=r.policy_id`;
const view = (r: AdjustmentRow): CashAdjustmentDto => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
});
export async function cashAdjustment(
  db: Kysely<DatabaseSchema>,
  org: string,
  id: string,
): Promise<CashAdjustmentDto> {
  const r = (
    await sql<AdjustmentRow>`${projection} where r.organization_id=${org} and r.id=${id}`.execute(
      db,
    )
  ).rows[0];
  if (!r) throw new PaymentDomainError('NOT_FOUND', 'Cash adjustment was not found.');
  return view(r);
}

export async function cashSettlement(
  db: Kysely<DatabaseSchema>,
  org: string,
  orderId: string,
): Promise<CashSettlementDto> {
  const row = (
    await sql<{
      total: string;
      payment_method: 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';
      order_status: string;
    }>`select
    total_amount::text total,payment_method,order_status from orders.orders where organization_id=${org} and id=${orderId}`.execute(
      db,
    )
  ).rows[0];
  if (!row) throw new PaymentDomainError('NOT_FOUND', 'Order was not found.');
  const summary = await getOrderPaymentSummary(db, {
    organizationId: org,
    orderId,
    paymentMethod: row.payment_method,
    expectedAmount: row.total,
  });
  return {
    originalPayable: row.total,
    actualCollected: summary.collected,
    authorizedWaiver: summary.authorizedWaiver,
    refunded: summary.refunded,
    outstanding: summary.outstanding,
    settlementStatus: row.order_status === 'CANCELLED' ? 'CANCELLED' : summary.settlementStatus,
    accountingStatus: 'NON_CASH_OPERATIONAL_RECORD_ONLY',
  };
}

export async function listCashAdjustments(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderId: string; page?: number; pageSize?: number },
) {
  const page = input.page ?? 1,
    pageSize = input.pageSize ?? 20;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new PaymentDomainError('VALIDATION_FAILED', 'Invalid pagination.');
  const rows = (
    await sql<AdjustmentRow>`${projection} where r.organization_id=${input.organizationId}
    and r.order_id=${input.orderId} order by r.created_at desc,r.id desc limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(
      db,
    )
  ).rows;
  const count = (
    await sql<{
      n: string;
    }>`select count(*)::text n from payments.cash_shortfall_requests where organization_id=${input.organizationId}
    and order_id=${input.orderId}`.execute(db)
  ).rows[0]!.n;
  return { items: rows.map(view), page, pageSize, total: Number(count) };
}
