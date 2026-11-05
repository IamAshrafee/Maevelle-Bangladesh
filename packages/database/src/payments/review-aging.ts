import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { PaymentDomainError } from '../payments.js';

/** Durable one-shot escalation is independent of inventory expiry and messaging success. */
export async function processPaymentReviewAging(
  db: Kysely<DatabaseSchema>,
  limit = 100,
): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new PaymentDomainError('VALIDATION_FAILED', 'Review batch limit is invalid.');
  return db.transaction().execute(async (tx) => {
    const rows = await sql<{
      organization_id: string;
      id: string;
      order_id: string;
    }>`select i.organization_id,i.id,i.order_id from payments.payment_intents i
      where i.review_expires_at<=now() and exists(select 1 from payments.payment_attempts a where a.organization_id=i.organization_id
        and a.payment_intent_id=i.id and a.status='PENDING_VERIFICATION')
      and not exists(select 1 from payments.review_escalations e where e.organization_id=i.organization_id and e.intent_id=i.id)
      order by i.review_expires_at,i.id limit ${limit} for update of i skip locked`.execute(tx);
    for (const row of rows.rows) {
      await sql`insert into payments.review_escalations(organization_id,intent_id) values(${row.organization_id},${row.id})`.execute(
        tx,
      );
      await sql`update payments.payment_attempts set review_state='ESCALATED',version=version+1 where organization_id=${row.organization_id}
        and payment_intent_id=${row.id} and status='PENDING_VERIFICATION'`.execute(tx);
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
        values(${row.organization_id},'payments.claim.review_overdue',1,'payments.payment_intent',${row.id},1,
        ${JSON.stringify({ intentId: row.id, orderId: row.order_id })}::jsonb,now())`.execute(tx);
    }
    return rows.rows.length;
  });
}
