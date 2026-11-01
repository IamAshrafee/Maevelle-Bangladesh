import { sql, type Kysely } from 'kysely';
import { wishlistOutcomeNames, type WishlistOutcomeName } from '@maevelle/contracts';
import type { DatabaseSchema } from '../../index.js';
import { recordWishlistOutcome } from './events.js';
import { recordWishlistOperation } from './operations.js';

function batchSize(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 1000)
    throw new Error('Invalid analytics batch size');
  return value;
}

/** Expiry event-time is expires_at, even when the Worker was stopped at that instant. */
export async function recordExpiredWishlistShares(db: Kysely<DatabaseSchema>, limit = 100) {
  return db.transaction().execute(async (tx) => {
    const rows = await sql<{
      id: string;
      organization_id: string;
      expires_at: Date;
      instrumented: boolean;
    }>`
      select id::text,organization_id::text,expires_at,expires_at>=(select started_at from analytics.wishlist_instrumentation) as instrumented from wishlist.shares
      where expiration_reported_at is null and expires_at<=now() and (revoked_at is null or revoked_at>=expires_at)
      order by expires_at,id limit ${batchSize(limit)} for update skip locked`.execute(tx);
    for (const row of rows.rows) {
      if (row.instrumented)
        await recordWishlistOutcome(
          tx,
          row.organization_id,
          { name: 'wishlist.share.expired' },
          row.expires_at,
        );
      await sql`update wishlist.shares set expiration_reported_at=now() where organization_id=${row.organization_id} and id=${row.id}::uuid`.execute(
        tx,
      );
    }
    return rows.rows.length;
  });
}

function validatePayload(name: string, payload: Record<string, unknown>, version: number) {
  if (version !== 1 || !wishlistOutcomeNames.includes(name as WishlistOutcomeName))
    throw new Error('UNSUPPORTED_WISHLIST_EVENT');
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).some(
      (key) => !['productId', 'source', 'origin', 'scope', 'size'].includes(key),
    )
  )
    throw new Error('INVALID_WISHLIST_PAYLOAD');
  const allowed =
    name === 'wishlist.item.saved'
      ? ['productId', 'source']
      : name === 'wishlist.item.removed'
        ? ['productId']
        : name === 'wishlist.share.created'
          ? ['origin', 'scope', 'size']
          : [];
  if (Object.keys(payload).length !== allowed.length || allowed.some((key) => !(key in payload)))
    throw new Error('INVALID_WISHLIST_PAYLOAD');
  if (
    payload.productId !== undefined &&
    (typeof payload.productId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.productId))
  )
    throw new Error('INVALID_WISHLIST_PRODUCT');
  if (
    payload.source !== undefined &&
    (typeof payload.source !== 'string' || !['MANUAL', 'MERGE'].includes(payload.source))
  )
    throw new Error('INVALID_WISHLIST_SOURCE');
  if (
    payload.origin !== undefined &&
    (typeof payload.origin !== 'string' || !['GUEST', 'ACCOUNT'].includes(payload.origin))
  )
    throw new Error('INVALID_WISHLIST_ORIGIN');
  if (
    payload.scope !== undefined &&
    (typeof payload.scope !== 'string' || !['ALL', 'SELECTED', 'UNKNOWN'].includes(payload.scope))
  )
    throw new Error('INVALID_WISHLIST_SCOPE');
  if (
    payload.size !== undefined &&
    (!Number.isInteger(payload.size) || Number(payload.size) < 1 || Number(payload.size) > 100)
  )
    throw new Error('INVALID_WISHLIST_SIZE');
}

interface OutboxRow {
  id: string;
  organization_id: string;
  event_type: string;
  event_version: number;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

/** The bounded batch, facts, and receipts commit atomically; locks allow concurrent consumers. */
export async function processWishlistAnalyticsOutbox(db: Kysely<DatabaseSchema>, limit = 100) {
  batchSize(limit);
  const result = await db.transaction().execute(async (tx) => {
    const selected = await sql<OutboxRow>`
      select event.id::text,event.organization_id::text,event.event_type,event.event_version,event.payload,event.occurred_at
      from platform.outbox_events event
      where event.aggregate_type='wishlist.analytics'
        and not exists(select 1 from analytics.wishlist_processing_failures f where f.outbox_event_id=event.id and f.retry_at>now())
        and not exists(select 1 from analytics.projection_event_receipts r where r.outbox_event_id=event.id and r.projection_name='wishlist_v1')
      order by event.id limit ${limit} for update of event skip locked`.execute(tx);
    const valid: OutboxRow[] = [];
    let failed = 0;
    for (const event of selected.rows) {
      try {
        validatePayload(event.event_type, event.payload, event.event_version);
        valid.push(event);
      } catch {
        failed++;
        await sql`insert into analytics.wishlist_processing_failures(outbox_event_id,organization_id,attempts,retry_at)
          values (${event.id}::bigint,${event.organization_id},1,now()+interval '30 seconds')
          on conflict(outbox_event_id) do update set attempts=analytics.wishlist_processing_failures.attempts+1,
            retry_at=now()+least(3600,30*analytics.wishlist_processing_failures.attempts)*interval '1 second',last_failed_at=now()`.execute(
          tx,
        );
        await recordWishlistOperation(tx, event.organization_id, 'PROCESS', 500);
      }
    }
    if (valid.length) {
      await sql`insert into analytics.wishlist_outcomes
        (organization_id,outbox_event_id,schema_version,event_name,product_id,source,origin,scope,snapshot_size,occurred_at)
        values ${sql.join(
          valid.map(
            (e) => sql`(${e.organization_id}::uuid,${e.id}::bigint,1,${e.event_type},
          ${e.payload.productId ?? null}::uuid,${e.payload.source ?? null},${e.payload.origin ?? null},
          ${e.payload.scope ?? null},${e.payload.size ?? null}::integer,${e.occurred_at}::timestamptz)`,
          ),
        )}
        on conflict(outbox_event_id) do nothing`.execute(tx);
      await sql`insert into analytics.projection_event_receipts(outbox_event_id,projection_name,organization_id)
        values ${sql.join(valid.map((e) => sql`(${e.id}::bigint,'wishlist_v1',${e.organization_id}::uuid)`))} on conflict do nothing`.execute(
        tx,
      );
      await sql`delete from analytics.wishlist_processing_failures where outbox_event_id=any(${valid.map((e) => e.id)}::bigint[])`.execute(
        tx,
      );
      const organizations = [...new Set(valid.map((e) => e.organization_id))];
      await sql`insert into analytics.projection_state(organization_id,projection_name,projection_version,status,last_processed_at,last_success_at)
        values ${sql.join(organizations.map((id) => sql`(${id}::uuid,'wishlist_v1',1,'CURRENT',now(),now())`))}
        on conflict(organization_id,projection_name) do update set status='CURRENT',last_processed_at=now(),last_success_at=now(),last_error_code=null`.execute(
        tx,
      );
    }
    return { processed: valid.length, failed };
  });
  if (result.failed)
    throw new Error('Wishlist analytics processing failed; pending events retained.');
  return result.processed;
}

/** Proposed operational retention: domain facts 400d, consented observations 90d. Receipts survive facts. */
export async function cleanupWishlistAnalytics(db: Kysely<DatabaseSchema>, limit = 100) {
  batchSize(limit);
  return db.transaction().execute(async (tx) => {
    const facts = await sql`delete from analytics.wishlist_outcomes where outbox_event_id in
    (select outbox_event_id from analytics.wishlist_outcomes where occurred_at<now()-interval '400 days' order by occurred_at limit ${limit})`.execute(
      tx,
    );
    const observations = await sql<{
      organization_id: string;
      session_id: string | null;
    }>`delete from analytics.storefront_events where ctid in
    (select ctid from analytics.storefront_events where event_name like 'WISHLIST_%' and received_at<now()-interval '90 days' order by received_at limit ${limit}) returning organization_id::text,session_id::text`.execute(
      tx,
    );
    const sessions = observations.rows.filter((row) => row.session_id);
    if (sessions.length)
      await sql`delete from analytics.storefront_sessions session
    where (session.organization_id,session.session_id) in (${sql.join(sessions.map((row) => sql`(${row.organization_id}::uuid,${row.session_id}::uuid)`))})
      and session.resulting_order_id is null and session.last_seen_at<now()-interval '90 days'
      and not exists(select 1 from analytics.storefront_events event where event.organization_id=session.organization_id and event.session_id=session.session_id)`.execute(
        tx,
      );
    const operations = await sql`delete from analytics.wishlist_operations where ctid in
    (select ctid from analytics.wishlist_operations where day<current_date-400 order by day limit ${limit})`.execute(
      tx,
    );
    return {
      facts: Number(facts.numAffectedRows ?? 0),
      observations: Number(observations.numAffectedRows ?? 0),
      operations: Number(operations.numAffectedRows ?? 0),
    };
  });
}
