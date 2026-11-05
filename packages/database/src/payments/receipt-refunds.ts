import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { PaymentDomainError } from '../payments.js';
import { requirePaymentCapability } from './authorization.js';

/** Refund excess liability first, without misrepresenting it as refunded merchandise. */
export async function allocateReceiptRefundInTransaction(
  tx: Kysely<DatabaseSchema>,
  input: { organizationId: string; paymentId: string; refundId: string; amount: string },
) {
  const split = (
    await sql<{ excess: string; commercial: string }>`with liability as (
    select greatest(coalesce((select unallocated_amount from payments.verified_receipt_evidence where organization_id=${input.organizationId}
      and payment_id=${input.paymentId}),0)-coalesce((select sum(a.amount) from payments.refund_allocations a join payments.refunds r
      on r.organization_id=a.organization_id and r.id=a.refund_id where r.organization_id=${input.organizationId} and r.payment_id=${input.paymentId}
      and r.status in ('REQUESTED','PROCESSING','UNKNOWN_EXTERNAL_OUTCOME','COMPLETED') and a.component_type='UNALLOCATED_RECEIPT'),0),0) amount
    ) select least(amount,${input.amount}::numeric)::text excess,greatest(${input.amount}::numeric-amount,0)::text commercial from liability`.execute(
      tx,
    )
  ).rows[0]!;
  for (const [type, amount] of [
    ['UNALLOCATED_RECEIPT', split.excess],
    ['ORDER_TOTAL', split.commercial],
  ])
    await sql`insert into payments.refund_allocations(organization_id,refund_id,component_type,amount)
      select ${input.organizationId},${input.refundId},${type},${amount}::numeric where ${amount}::numeric>0`.execute(
      tx,
    );
}

/** Only independently verified original-source refunds may complete new receipt obligations. */
export async function receiptRefundContext(
  tx: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    refundId: string;
    evidenceReference?: string;
    originalSourceVerified?: boolean;
  },
) {
  const r = (
    await sql<{
      financial_account_id: string;
      payment_id: string;
      amount: string;
      currency_code: string;
    }>`select e.financial_account_id,
    r.payment_id,r.amount::text,r.currency_code from payments.refunds r join payments.verified_receipt_evidence e
      on e.organization_id=r.organization_id and e.payment_id=r.payment_id
    where r.organization_id=${input.organizationId} and r.id=${input.refundId}`.execute(tx)
  ).rows[0];
  if (!r) return undefined; // Retained legacy refunds have their original provenance.
  await requirePaymentCapability(tx, input.organizationId, input.actorId, 'refunds.manage');
  if (
    !input.originalSourceVerified ||
    !input.evidenceReference?.trim() ||
    input.evidenceReference.length > 512
  )
    throw new PaymentDomainError(
      'POLICY_BLOCKED',
      'Independent refund evidence and original payment source verification are required.',
    );
  return r;
}
