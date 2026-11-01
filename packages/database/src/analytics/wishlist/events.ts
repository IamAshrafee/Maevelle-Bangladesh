import { sql, type Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import type { DatabaseSchema } from '../../index.js';
import { wishlistOutcomeNames, type WishlistOutcomeName } from '@maevelle/contracts';

export type WishlistOutcome =
  | { name: 'wishlist.item.saved'; productId: string; source: 'MANUAL' | 'MERGE' }
  | { name: 'wishlist.item.removed'; productId: string }
  | {
      name: 'wishlist.share.created';
      origin: 'GUEST' | 'ACCOUNT';
      scope: 'ALL' | 'SELECTED' | 'UNKNOWN';
      size: number;
    }
  | {
      name: Exclude<
        WishlistOutcomeName,
        'wishlist.item.saved' | 'wishlist.item.removed' | 'wishlist.share.created'
      >;
    };
/** Call with the domain transaction. No owner identity, credentials, or membership snapshot. */
export async function recordWishlistOutcome(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  event: WishlistOutcome,
  occurredAt?: Date,
) {
  if (!wishlistOutcomeNames.includes(event.name)) throw new Error('Unsupported Wishlist outcome');
  const { name, ...payload } = event;
  await sql`insert into platform.outbox_events
    (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values (${organizationId},${name},1,'wishlist.analytics',${randomUUID()}::uuid,1,
      ${JSON.stringify(payload)}::jsonb,coalesce(${occurredAt ?? null}::timestamptz,now()))`.execute(
    db,
  );
}
