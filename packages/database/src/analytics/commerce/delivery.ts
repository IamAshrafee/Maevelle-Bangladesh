import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';
import type { CommerceConsentSubject, CommercePurpose } from './consent.js';

export const commerceConversionPolicy = Object.freeze({
  version: 'unapproved-v1',
  ga4: false,
  meta: false,
  advancedMatching: false,
  purchaseQualification: 'UNAPPROVED',
});
export interface CommerceTestPayload {
  schemaVersion: 1;
  eventId: string;
  name: string;
  occurredAt: string;
  currency: string | null;
  amount: string | null;
}
export interface CommerceTestDestination {
  kind: 'TEST';
  send(
    payload: Readonly<CommerceTestPayload>,
    signal: AbortSignal,
  ): Promise<'ACCEPTED' | 'RATE_LIMIT' | 'INVALID_PAYLOAD'>;
}

/** No GA4/Meta HTTP adapter exists. This port cannot enqueue actual business traffic. */
export async function queueCommerceTestDelivery(
  db: Kysely<DatabaseSchema>,
  subject: CommerceConsentSubject,
  eventId: string,
  purpose: CommercePurpose,
) {
  return db.transaction().execute(async (tx) => {
    await sql`select 1 from analytics.commerce_consent where organization_id=${subject.organizationId}
      and subject_id=${subject.subjectId} and scope=${subject.scope} and purpose=${purpose} for update`.execute(
      tx,
    );
    const result = await sql`insert into analytics.commerce_deliveries
      (organization_id,event_id,destination,policy_version,subject_id,scope,purpose,consent_revision,expires_at)
      select e.organization_id,e.id,'TEST','test-v1',c.subject_id,c.scope,c.purpose,c.revision,e.occurred_at+interval '1 day'
      from analytics.commerce_events e join analytics.commerce_consent c on c.organization_id=e.organization_id
      where e.organization_id=${subject.organizationId} and e.id=${eventId} and e.traffic_class='SYNTHETIC'
        and e.occurred_at>clock_timestamp()-interval '1 day'
        and c.subject_id=${subject.subjectId} and c.scope=${subject.scope} and c.purpose=${purpose}
        and c.decision='GRANTED' and c.changed_at<=e.occurred_at and c.expires_at>e.occurred_at
        and c.expires_at>clock_timestamp() on conflict do nothing`.execute(tx);
    return { queued: result.numAffectedRows === 1n };
  });
}

/** Consent is locked through the bounded fake send: withdrawal commits before or after this dispatch.
 * An acknowledgement lost after send leaves the same event ID retryable, never promises vendor exactly-once.
 */
export async function dispatchCommerceTestDeliveries(
  db: Kysely<DatabaseSchema>,
  options: {
    enabled?: boolean;
    destination: CommerceTestDestination;
    limit?: number;
  },
) {
  const limit = options.limit ?? 20;
  if (options.destination.kind !== 'TEST' || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid test destination');
  let attempted = 0,
    suppressed = 0;
  for (let i = 0; i < limit; i++) {
    const result = await db.transaction().execute(async (tx) => {
      await sql`set local lock_timeout='2s'`.execute(tx);
      await sql`set local statement_timeout='5s'`.execute(tx);
      const row = (
        await sql<{
          organization_id: string;
          event_id: string;
          subject_id: string;
          scope: string;
          purpose: string;
          consent_revision: string;
          expired: boolean;
        }>`
        select d.*,d.consent_revision::text,d.expires_at<=clock_timestamp() expired from analytics.commerce_deliveries d
        where d.status in ('PENDING','RETRY_WAIT') and d.next_attempt_at<=clock_timestamp()
        order by d.next_attempt_at limit 1 for update of d skip locked`.execute(tx)
      ).rows[0];
      if (!row) return 'EMPTY';
      const consent = (
        await sql<{ eligible: boolean }>`select decision='GRANTED' and expires_at>clock_timestamp()
        and revision=${row.consent_revision}::bigint eligible from analytics.commerce_consent
        where organization_id=${row.organization_id} and subject_id=${row.subject_id} and scope=${row.scope} and purpose=${row.purpose} for update`.execute(
          tx,
        )
      ).rows[0];
      const payload = (
        await sql<CommerceTestPayload>`select 1 as "schemaVersion",id::text as "eventId",event_name name,
        occurred_at::text as "occurredAt",currency,amount::text amount from analytics.commerce_events
        where organization_id=${row.organization_id} and id=${row.event_id} and traffic_class='SYNTHETIC'`.execute(
          tx,
        )
      ).rows[0];
      const reason = !options.enabled
        ? 'DISABLED'
        : row.expired
          ? 'EXPIRED'
          : !consent?.eligible
            ? 'CONSENT'
            : !payload
              ? 'INVALID_PAYLOAD'
              : null;
      if (reason) {
        await sql`update analytics.commerce_deliveries set status='SUPPRESSED',error_code=${reason}
          where organization_id=${row.organization_id} and event_id=${row.event_id} and destination='TEST'`.execute(
          tx,
        );
        return 'SUPPRESSED';
      }
      let outcome: string;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        outcome = await Promise.race([
          options.destination.send(Object.freeze(payload!), controller.signal),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error('Timeout'));
            }, 1000);
          }),
        ]);
      } catch {
        outcome = 'TIMEOUT';
      } finally {
        clearTimeout(timer);
      }
      if (!['ACCEPTED', 'RATE_LIMIT', 'INVALID_PAYLOAD', 'TIMEOUT'].includes(outcome))
        outcome = 'INVALID_PAYLOAD';
      await sql`update analytics.commerce_deliveries set attempt_count=attempt_count+1,
        status=case when ${outcome}='ACCEPTED' then 'COMPLETED' when ${outcome}='INVALID_PAYLOAD' or attempt_count>=4 then 'DEAD_LETTER' else 'RETRY_WAIT' end,
        error_code=${outcome === 'ACCEPTED' ? null : outcome},
        next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,power(2,attempt_count+1)::integer))
        where organization_id=${row.organization_id} and event_id=${row.event_id} and destination='TEST'`.execute(
        tx,
      );
      return 'ATTEMPTED';
    });
    if (result === 'EMPTY') break;
    if (result === 'SUPPRESSED') suppressed++;
    else attempted++;
  }
  return { attempted, suppressed };
}

/** Proposed retention: optional test queues 1d, preferences <=180d. Domain financial records are untouched. */
export async function cleanupCommerceMeasurement(db: Kysely<DatabaseSchema>, limit = 500) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('Invalid retention batch');
  return db.transaction().execute(async (tx) => {
    const deliveries =
      await sql`delete from analytics.commerce_deliveries where (organization_id,event_id,destination) in
      (select organization_id,event_id,destination from analytics.commerce_deliveries where expires_at<clock_timestamp() order by expires_at limit ${limit} for update skip locked)`.execute(
        tx,
      );
    const consent =
      await sql`delete from analytics.commerce_consent c where (organization_id,subject_id,scope,purpose) in
      (select organization_id,subject_id,scope,purpose from analytics.commerce_consent where expires_at<clock_timestamp()
        and not exists(select 1 from analytics.commerce_deliveries d where d.organization_id=commerce_consent.organization_id
          and d.subject_id=commerce_consent.subject_id and d.scope=commerce_consent.scope and d.purpose=commerce_consent.purpose)
        order by expires_at limit ${limit} for update skip locked)`.execute(tx);
    const operations =
      await sql`delete from analytics.commerce_operations where (organization_id,day,traffic_class,operation,outcome) in
      (select organization_id,day,traffic_class,operation,outcome from analytics.commerce_operations where day<(clock_timestamp() at time zone 'UTC')::date-400
        order by day limit ${limit} for update skip locked)`.execute(tx);
    await sql`delete from analytics.privacy_browser_sessions where id in (select id from analytics.privacy_browser_sessions where expires_at<clock_timestamp() order by expires_at limit ${limit} for update skip locked)`.execute(
      tx,
    );
    return {
      operations: Number(operations.numAffectedRows),
      deliveries: Number(deliveries.numAffectedRows),
      consent: Number(consent.numAffectedRows),
    };
  });
}
