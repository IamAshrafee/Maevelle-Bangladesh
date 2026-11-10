import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';
import { readCommerceFact, type CommerceSource, type CommerceFact } from './source.js';

const consumer = 'analytics.commerce.v1';

async function persistFact(db: Kysely<DatabaseSchema>, event: CommerceSource, fact: CommerceFact) {
  await sql`insert into analytics.commerce_events(organization_id,outbox_event_id,event_name,business_id,occurred_at,traffic_class,currency,amount,allocated_amount)
    select e.organization_id,e.id,${fact.name},${fact.businessId}::uuid,e.occurred_at,
      coalesce(s.traffic_class,'UNCLASSIFIED'),${fact.currency},${fact.amount}::numeric,${fact.allocated}::numeric
    from platform.outbox_events e left join analytics.commerce_reporting_scopes s on s.organization_id=e.organization_id
    where e.id=${event.id}::bigint on conflict(organization_id,event_name,schema_version,business_id) do nothing`.execute(
    db,
  );
}

/** A row lease, projection and receipt commit together. No HTTP, business writes or global lock. */
export async function processCommerceAnalyticsOutbox(
  db: Kysely<DatabaseSchema>,
  limit = 100,
  interruptAfterClaim?: () => void,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new Error('Invalid commerce batch size');
  let processed = 0,
    rejected = 0,
    retried = 0;
  for (let index = 0; index < limit; index++) {
    const outcome = await db.transaction().execute(async (tx) => {
      await sql`set local lock_timeout='1s'`.execute(tx);
      await sql`set local statement_timeout='5s'`.execute(tx);
      const event = (
        await sql<CommerceSource>`select e.id::text,e.organization_id,e.aggregate_id,e.aggregate_type,e.event_type,e.event_version,e.payload
        from platform.event_consumer_receipts r join platform.outbox_events e on e.id=r.outbox_event_id
        where r.consumer_name=${consumer} and (r.status='PENDING' or (r.status='RETRY_WAIT' and r.next_retry_at<=clock_timestamp()))
        order by r.outbox_event_id limit 1 for update of r skip locked`.execute(tx)
      ).rows[0];
      if (!event) return 'EMPTY';
      interruptAfterClaim?.();
      await sql`savepoint commerce_fact`.execute(tx);
      try {
        const fact = await readCommerceFact(tx, event);
        if (fact) {
          await persistFact(tx, event, fact);
          // Qualification is captured in the owning receipt transaction, never inferred from a later status read.
          if (
            ['PAYMENT_VERIFIED', 'COD_COLLECTED'].includes(fact.name) &&
            event.payload.obligationSatisfied === true
          ) {
            const intent = (
              await sql<{
                id: string;
              }>`select i.id
              from payments.payment_intents i where i.organization_id=${event.organization_id} and i.id::text=${event.payload.intentId as string}
                and exists(select 1 from payments.payment_allocations a where a.organization_id=i.organization_id
                  and a.order_id=i.order_id and a.payment_id=${event.aggregate_id})`.execute(tx)
            ).rows[0];
            if (
              !intent ||
              typeof event.payload.obligationAmount !== 'string' ||
              !/^(0|[1-9]\d{0,19})\.\d{4}$/.test(event.payload.obligationAmount) ||
              typeof event.payload.obligationCurrency !== 'string' ||
              !/^[A-Z]{3}$/.test(event.payload.obligationCurrency)
            )
              throw new Error('Invalid obligation source');
            await persistFact(tx, event, {
              name: 'OBLIGATION_SATISFIED',
              businessId: intent.id,
              amount: event.payload.obligationAmount,
              currency: event.payload.obligationCurrency,
              allocated: null,
            });
          }
        }
        const ignored =
          event.event_version === 1 &&
          event.event_type === 'payments.claim.reviewed' &&
          ['UNDER_REVIEW', 'ESCALATED'].includes(String(event.payload.state));
        await sql`update platform.event_consumer_receipts set status=${fact || ignored ? 'COMPLETED' : 'DEAD_LETTER'},
          attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),processed_at=clock_timestamp(),next_retry_at=null,
          last_error_code=${fact || ignored ? null : 'INVALID_COMMERCE_SOURCE'} where consumer_name=${consumer} and outbox_event_id=${event.id}::bigint`.execute(
          tx,
        );
        return fact || ignored ? 'PROCESSED' : 'REJECTED';
      } catch {
        await sql`rollback to savepoint commerce_fact`.execute(tx);
        await sql`update platform.event_consumer_receipts set attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),
          status=case when attempt_count>=4 then 'DEAD_LETTER' else 'RETRY_WAIT' end,
          next_retry_at=clock_timestamp()+make_interval(secs=>least(3600,power(2,attempt_count+1)::integer)),
          last_error_code='COMMERCE_PROJECTION_FAILED' where consumer_name=${consumer} and outbox_event_id=${event.id}::bigint`.execute(
          tx,
        );
        return 'RETRY';
      }
    });
    if (outcome === 'EMPTY') break;
    if (outcome === 'PROCESSED') processed++;
    else if (outcome === 'REJECTED') rejected++;
    else retried++;
  }
  return { processed, rejected, retried };
}
