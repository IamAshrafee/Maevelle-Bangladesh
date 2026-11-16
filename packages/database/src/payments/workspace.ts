import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import type { PaymentClaimWorkspaceDto, PaymentPolicyDto } from '@maevelle/contracts';
import { getPaymentAttempt, getOrderPaymentSummary, PaymentDomainError } from '../payments.js';
import { requirePaymentCapability } from './authorization.js';
type Context = { organizationId: string; actorId: string };
export async function getPaymentClaimWorkspace(
  db: Kysely<DatabaseSchema>,
  input: Context & { attemptId: string },
): Promise<PaymentClaimWorkspaceDto> {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute((tx) => paymentClaimWorkspaceInTransaction(tx, input));
}
async function paymentClaimWorkspaceInTransaction(
  db: Kysely<DatabaseSchema>,
  input: Context & { attemptId: string },
): Promise<PaymentClaimWorkspaceDto> {
  await requirePaymentCapability(db, input.organizationId, input.actorId, 'payments.view');
  const attempt = await getPaymentAttempt(db, input.organizationId, input.attemptId);
  const [context, summary] = await Promise.all([
    sql<{
      currency_code: string;
      review_state: string;
      instructions_snapshot: {
        accountNumber?: string;
        receivingNumber?: string;
        text?: string;
        instructions?: string;
      };
      destination_revision: string | null;
      receiving_financial_account_id: string | null;
      payment_id: string | null;
    }>`select i.currency_code,a.review_state,i.instructions_snapshot,i.destination_revision::text,p.id payment_id,
      case when i.destination_id is not null then h.snapshot->>'financial_account_id'
        else i.instructions_snapshot->>'financialAccountId' end receiving_financial_account_id
      from payments.payment_attempts a
      join payments.payment_intents i on i.organization_id=a.organization_id and i.id=a.payment_intent_id
      left join payments.receiving_destination_history h on h.organization_id=i.organization_id
        and h.destination_id=i.destination_id and h.revision=i.destination_revision
      left join payments.payments p on p.organization_id=a.organization_id and p.source_attempt_id=a.id
      where a.organization_id=${input.organizationId} and a.id=${input.attemptId}`.execute(db),
    getOrderPaymentSummary(db, {
      organizationId: input.organizationId,
      orderId: attempt.orderId,
      paymentMethod: attempt.method,
      expectedAmount: attempt.expectedAmount,
    }),
  ]);
  const row = context.rows[0];
  if (!row) throw new PaymentDomainError('NOT_FOUND', 'Claim was not found.');
  return {
    ...attempt,
    currency: row.currency_code,
    reviewState: row.review_state,
    receivingNumber:
      row.instructions_snapshot.receivingNumber ?? row.instructions_snapshot.accountNumber ?? null,
    instructions: row.instructions_snapshot.instructions ?? row.instructions_snapshot.text ?? null,
    destinationRevision: row.destination_revision,
    receivingFinancialAccountId: row.receiving_financial_account_id,
    collected: summary.collected,
    outstanding: summary.outstanding,
    paymentId: row.payment_id,
  };
}
export async function listPaymentPolicies(
  db: Kysely<DatabaseSchema>,
  input: Context & { page: number },
) {
  await requirePaymentCapability(
    db,
    input.organizationId,
    input.actorId,
    'payments.destinations.view',
  );
  const pageSize = 25;
  const [rows, count] = await Promise.all([
    sql<PaymentPolicyDto>`select p.id,p.submission_minutes as "submissionMinutes",p.review_minutes as "reviewMinutes",p.created_by as "createdBy",
      p.created_at::text as "createdAt",r.approved_by as "approvedBy",r.created_at::text as "approvedAt",r.id as "policyId"
      from payments.operating_policy_proposals p left join payments.operating_policy_revisions r on r.organization_id=p.organization_id and r.proposal_id=p.id
      where p.organization_id=${input.organizationId} order by p.created_at desc,p.id desc limit ${pageSize} offset ${(input.page - 1) * pageSize}`.execute(
      db,
    ),
    sql<{
      total: string;
    }>`select count(*)::text total from payments.operating_policy_proposals where organization_id=${input.organizationId}`.execute(
      db,
    ),
  ]);
  return {
    items: rows.rows,
    pagination: { page: input.page, pageSize, totalItems: Number(count.rows[0]!.total) },
  };
}
