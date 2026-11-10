import { sql, type Kysely } from 'kysely';
import type { CashEligibilityDto, CashPolicyViewDto, CashReadPageDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../../index.js';
import { cashSettlement } from './queries.js';
import { PaymentDomainError } from '../../payments.js';

export async function listCashPolicies(
  db: Kysely<DatabaseSchema>,
  org: string,
  page = 1,
  pageSize = 20,
): Promise<CashReadPageDto<CashPolicyViewDto>> {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new PaymentDomainError('VALIDATION_FAILED', 'Invalid pagination.');
  type Row = Omit<CashPolicyViewDto, 'createdAt' | 'approvedAt' | 'status' | 'activation'> & {
    createdAt: Date;
    approvedAt: Date | null;
    effective: boolean;
    expired: boolean;
  };
  const [rows, count] = await Promise.all([
    sql<Row>`select p.id,r.id as "policyId",p.definition,p.created_by as "createdBy",p.created_at as "createdAt",
      r.approved_by as "approvedBy",r.created_at as "approvedAt",r.approval_reference as "approvalReference",
      r.effective_from<=clock_timestamp() effective,r.expires_at<=clock_timestamp() expired
      from payments.cash_policy_proposals p left join payments.cash_policy_revisions r
      on r.organization_id=p.organization_id and r.proposal_id=p.id where p.organization_id=${org}
      order by p.created_at desc,p.id desc limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(
      db,
    ),
    sql<{
      n: string;
    }>`select count(*)::text n from payments.cash_policy_proposals where organization_id=${org}`.execute(
      db,
    ),
  ]);
  return {
    items: rows.rows.map(({ effective, expired, ...r }) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      status: !r.policyId
        ? 'PROPOSED'
        : expired
          ? 'EXPIRED'
          : !effective
            ? 'SCHEDULED'
            : 'APPROVED',
      activation: 'POLICY_BLOCKED',
    })),
    page,
    pageSize,
    total: Number(count.rows[0]!.n),
  };
}

/** The same disabled activation boundary as the application engine. Stored approval cannot override it. */
export async function cashEligibility(
  db: Kysely<DatabaseSchema>,
  org: string,
  orderId: string,
): Promise<CashEligibilityDto> {
  const [settlement, order] = await Promise.all([
    cashSettlement(db, org, orderId),
    sql<{
      payment_method: string;
      pending: boolean;
    }>`select payment_method,exists(select 1 from payments.cash_shortfall_requests r
      where r.organization_id=o.organization_id and r.order_id=o.id and not exists(select 1 from payments.cash_shortfall_adjustments a where a.organization_id=r.organization_id and a.id=r.id)) pending
      from orders.orders o where organization_id=${org} and id=${orderId}`.execute(db),
  ]);
  const reasons: CashEligibilityDto['reasons'][number][] = ['POLICY_BLOCKED'];
  if (order.rows[0]!.payment_method !== 'COD') reasons.push('NOT_COD');
  if (settlement.settlementStatus === 'CANCELLED') reasons.push('CANCELLED');
  if (settlement.outstanding === '0.0000') reasons.push('NO_OUTSTANDING');
  if (order.rows[0]!.pending) reasons.push('REQUEST_PENDING');
  return {
    canApply: false,
    canApprove: false,
    activation: 'POLICY_BLOCKED',
    reasons,
    outstanding: settlement.outstanding,
  };
}
