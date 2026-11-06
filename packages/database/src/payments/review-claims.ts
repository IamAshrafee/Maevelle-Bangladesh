import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { PaymentDomainError } from '../payments.js';
import { requirePaymentCapability } from './authorization.js';
import { appendPaymentOperationEvent } from './events.js';
type Context = { organizationId: string; actorId: string };

export async function reviewManualClaim(
  db: Kysely<DatabaseSchema>,
  input: Context & {
    attemptId: string;
    state: 'UNDER_REVIEW' | 'CORRECTION_REQUESTED' | 'ESCALATED';
    note: string;
  },
) {
  if (
    !input.note.trim() ||
    input.note.length > 512 ||
    !['UNDER_REVIEW', 'CORRECTION_REQUESTED', 'ESCALATED'].includes(input.state)
  )
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'A bounded review note and valid review state are required.',
    );
  return db.transaction().execute(async (tx) => {
    await requirePaymentCapability(tx, input.organizationId, input.actorId, 'payments.review');
    const row = (
      await sql<{
        id: string;
      }>`update payments.payment_attempts set review_state=${input.state},reviewer_note=${input.note.trim()},
      version=version+1 where organization_id=${input.organizationId} and id=${input.attemptId} and status='PENDING_VERIFICATION' returning id`.execute(
        tx,
      )
    ).rows[0];
    if (!row)
      throw new PaymentDomainError('CONFLICT', 'Claim is missing or has already been resolved.');
    await appendPaymentOperationEvent(tx, input, input.attemptId, 'payments.claim.reviewed', {
      attemptId: input.attemptId,
      state: input.state,
    });
    return { id: row.id, state: input.state };
  });
}
export async function listManualClaimQueue(
  db: Kysely<DatabaseSchema>,
  input: Context & { page?: number; pageSize?: number },
) {
  await requirePaymentCapability(db, input.organizationId, input.actorId, 'payments.review');
  const page = Math.max(1, Math.trunc(input.page ?? 1)),
    pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const rows = await sql<{
    id: string;
    orderId: string;
    currency: string;
    orderNumber: string;
    methodName: string;
    customerReference: string;
    expectedAmount: string;
    reviewState: string;
    submittedAt: Date;
    reviewExpiresAt: Date | null;
    ageSeconds: string;
    overdue: boolean;
    total: string;
  }>`select a.id,i.currency_code as currency,i.order_id as "orderId",i.order_number_snapshot as "orderNumber",m.name as "methodName",a.customer_reference as "customerReference",i.expected_amount::text as "expectedAmount",a.review_state as "reviewState",a.submitted_at as "submittedAt",
      i.review_expires_at as "reviewExpiresAt",extract(epoch from (now()-a.submitted_at))::bigint::text as "ageSeconds",
      (i.review_expires_at is not null and i.review_expires_at<=now()) overdue,count(*) over()::text total
    from payments.payment_attempts a join payments.payment_intents i on i.organization_id=a.organization_id and i.id=a.payment_intent_id
    join payments.payment_methods m on m.organization_id=i.organization_id and m.id=i.payment_method_id
    where a.organization_id=${input.organizationId} and a.status='PENDING_VERIFICATION' order by a.submitted_at,a.id
    limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(db);
  const totalItems =
    rows.rows[0]?.total ??
    (page > 1
      ? (
          await sql<{
            total: string;
          }>`select count(*)::text total from payments.payment_attempts where organization_id=${input.organizationId} and status='PENDING_VERIFICATION'`.execute(
            db,
          )
        ).rows[0]!.total
      : '0');
  return {
    items: rows.rows.map(({ total, ...r }) => {
      void total;
      return r;
    }),
    pagination: { page, pageSize, totalItems: Number(totalItems) },
  };
}
