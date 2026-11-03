import { sql, type Kysely } from 'kysely';
import {
  cartMutationOperations,
  type CartMutationMeasurement,
  type CartMutationOperation,
} from '@maevelle/contracts';
import type { DatabaseSchema } from '../../index.js';
import { parseMoney } from '../../cart/value.js';

const measurementKeys = [
  'owner',
  'wishlistAction',
  'currency',
  'unitDelta',
  'unitsAfter',
  'linesAfter',
  'merchandiseGrossAfter',
  'merchandiseNetAfter',
] as const satisfies readonly (keyof CartMutationMeasurement)[];

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function amount(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,19})\.\d{4}$/.test(value);
}

export function parseCartMutationMeasurement(version: number, payload: unknown) {
  if (version !== 2 || !object(payload) || !object(payload.measurement)) return null;
  const { operation, measurement } = payload;
  if (!cartMutationOperations.includes(operation as CartMutationOperation)) return null;
  if (Object.keys(measurement).some((key) => !measurementKeys.some((allowed) => allowed === key)))
    return null;
  const {
    owner,
    wishlistAction,
    currency,
    unitDelta,
    unitsAfter,
    linesAfter,
    merchandiseGrossAfter,
    merchandiseNetAfter,
  } = measurement;
  if (
    (owner !== 'GUEST' && owner !== 'ACCOUNT') ||
    (operation === 'merge_guest' && owner !== 'ACCOUNT') ||
    (wishlistAction !== null && wishlistAction !== 'ADD' && wishlistAction !== 'MOVE') ||
    (operation === 'wishlist_transfer') !== (wishlistAction !== null) ||
    (wishlistAction !== null && owner !== 'ACCOUNT') ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency) ||
    !integer(unitDelta, -9900, 9900) ||
    !integer(unitsAfter, 0, 9900) ||
    !integer(linesAfter, 0, 100) ||
    unitsAfter < linesAfter ||
    unitsAfter > linesAfter * 99 ||
    !integer(unitsAfter - unitDelta, 0, 9900) ||
    !amount(merchandiseGrossAfter) ||
    !amount(merchandiseNetAfter) ||
    parseMoney(merchandiseNetAfter) > parseMoney(merchandiseGrossAfter)
  )
    return null;
  return {
    operation: operation as CartMutationOperation,
    measurement: {
      owner,
      wishlistAction,
      currency,
      unitDelta,
      unitsAfter,
      linesAfter,
      merchandiseGrossAfter,
      merchandiseNetAfter,
    } satisfies CartMutationMeasurement,
  };
}

/** Claims and facts share a transaction. A crash or database error leaves the batch pending. */
export async function processCartAnalyticsOutbox(db: Kysely<DatabaseSchema>, limit = 100) {
  if (!integer(limit, 1, 500)) throw new Error('Invalid Cart analytics batch size');
  return db.transaction().execute(async (tx) => {
    await sql`set local lock_timeout='2s'`.execute(tx);
    await sql`set local statement_timeout='5s'`.execute(tx);
    const events = await sql<{
      id: string;
      organization_id: string | null;
      aggregate_type: string;
      event_type: string;
      event_version: number;
      payload: unknown;
    }>`
      select event.id::text,event.organization_id::text,
        event.aggregate_type,event.event_type,event.event_version,event.payload
      from platform.event_consumer_receipts receipt
      join platform.outbox_events event on event.id=receipt.outbox_event_id
      where receipt.consumer_name='analytics.cart.v1' and receipt.status='PENDING'
      order by receipt.outbox_event_id limit ${limit} for update of receipt skip locked
    `.execute(tx);

    const rejected: string[] = [];
    const facts = events.rows.flatMap((event) => {
      const fact = parseCartMutationMeasurement(event.event_version, event.payload);
      if (
        !fact ||
        !event.organization_id ||
        event.aggregate_type !== 'cart' ||
        event.event_type !== 'cart.intent.mutated'
      ) {
        rejected.push(event.id);
        return [];
      }
      return [{ id: event.id, operation: fact.operation, ...fact.measurement }];
    });

    if (facts.length) {
      await sql`
        insert into analytics.cart_mutations
          (outbox_event_id,organization_id,cart_id,occurred_at,operation,owner,wishlist_action,
            currency,unit_delta,units_after,lines_after,merchandise_gross_after,merchandise_net_after)
        select event.id,event.organization_id,event.aggregate_id,event.occurred_at,
          fact.operation,fact.owner,fact."wishlistAction",fact.currency,fact."unitDelta",
          fact."unitsAfter",fact."linesAfter",fact."merchandiseGrossAfter",fact."merchandiseNetAfter"
        from jsonb_to_recordset(${JSON.stringify(facts)}::jsonb) as fact(
          id bigint,operation text,owner text,"wishlistAction" text,currency text,"unitDelta" integer,
          "unitsAfter" integer,"linesAfter" integer,"merchandiseGrossAfter" numeric,"merchandiseNetAfter" numeric)
        join platform.outbox_events event on event.id=fact.id
        on conflict(outbox_event_id) do nothing
      `.execute(tx);
      await sql`
        update platform.event_consumer_receipts
        set status='COMPLETED',attempt_count=attempt_count+1,last_attempt_at=now(),processed_at=now(),
          next_retry_at=null,last_error_code=null
        where consumer_name='analytics.cart.v1' and outbox_event_id=any(${facts.map((fact) => fact.id)}::bigint[])
      `.execute(tx);
    }

    if (rejected.length)
      await sql`
        update platform.event_consumer_receipts
        set status='DEAD_LETTER',attempt_count=attempt_count+1,last_attempt_at=now(),
          last_error_code='INVALID_CART_ANALYTICS_EVENT'
        where consumer_name='analytics.cart.v1' and outbox_event_id=any(${rejected}::bigint[])
      `.execute(tx);

    return { processed: facts.length, rejected: rejected.length };
  });
}
