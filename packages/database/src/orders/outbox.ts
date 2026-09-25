import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { completeOrder } from './lifecycle.js';
import { OrderDomainError } from './types.js';

export async function processOrderOutbox(db: Kysely<DatabaseSchema>): Promise<number> {
  const candidates = await sql<{
    event_id: string;
    organization_id: string;
    aggregate_id: string;
  }>`
    select event.id::text as event_id, event.organization_id::text, event.aggregate_id::text
    from platform.outbox_events event
    left join platform.event_consumer_receipts receipt
      on receipt.outbox_event_id = event.id
      and receipt.consumer_name = 'orders.autocomplete.v1'
    where event.event_type = 'delivery.all_lines_delivered'
      and (
        receipt.id is null
        or (receipt.status = 'RETRY_WAIT' and receipt.next_retry_at <= now())
        or (receipt.status = 'PROCESSING' and receipt.last_attempt_at < now() - interval '5 minutes')
      )
    order by event.occurred_at asc
    limit 100
  `.execute(db);

  let processed = 0;
  for (const row of candidates.rows) {
    const claim = await sql<{ id: string; attempt_count: number }>`
      insert into platform.event_consumer_receipts (
        outbox_event_id, consumer_name, status, attempt_count, last_attempt_at
      ) values (
        ${row.event_id}::bigint, 'orders.autocomplete.v1', 'PROCESSING', 1, now()
      )
      on conflict (outbox_event_id, consumer_name) do update
      set status = 'PROCESSING',
          attempt_count = platform.event_consumer_receipts.attempt_count + 1,
          last_attempt_at = now(),
          next_retry_at = null,
          last_error_code = null
      where (
        platform.event_consumer_receipts.status = 'RETRY_WAIT'
        and platform.event_consumer_receipts.next_retry_at <= now()
      ) or (
        platform.event_consumer_receipts.status = 'PROCESSING'
        and platform.event_consumer_receipts.last_attempt_at < now() - interval '5 minutes'
      )
      returning id::text, attempt_count
    `.execute(db);
    const receipt = claim.rows[0];
    if (!receipt) continue;

    try {
      await completeOrder(db, {
        organizationId: row.organization_id,
        orderId: row.aggregate_id,
        actorId: null,
        idempotencyKey: `auto-complete:${row.event_id}`,
        triggerOutboxEventId: row.event_id,
      });
      await sql`
        update platform.event_consumer_receipts
        set status = 'COMPLETED', processed_at = now(), next_retry_at = null, last_error_code = null
        where id = ${receipt.id}::bigint and status = 'PROCESSING'
      `.execute(db);
      processed++;
    } catch (error) {
      const errorCode =
        error instanceof OrderDomainError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : 'UNEXPECTED';
      await sql`
        update platform.event_consumer_receipts
        set status = case when attempt_count >= 10 then 'DEAD_LETTER' else 'RETRY_WAIT' end,
            next_retry_at = case
              when attempt_count >= 10 then null
              else now() + make_interval(secs => least(3600, power(2, attempt_count)::integer))
            end,
            last_error_code = ${errorCode},
            processed_at = null
        where id = ${receipt.id}::bigint and status = 'PROCESSING'
      `.execute(db);
      console.error('Failed to auto-complete order', row.aggregate_id, error);
    }
  }

  return processed;
}
