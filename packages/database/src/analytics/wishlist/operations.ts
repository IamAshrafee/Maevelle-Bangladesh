import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';
export type WishlistOperation =
  | 'SAVE'
  | 'REMOVE'
  | 'MERGE'
  | 'SHARE_CREATE'
  | 'SHARE_OPEN'
  | 'SHARE_MANAGE'
  | 'SHARE_RECOVER'
  | 'SHARE_ROTATE'
  | 'SHARE_CLAIM'
  | 'CLEANUP'
  | 'PROCESS';
export async function recordWishlistOperation(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  operation: WishlistOperation,
  statusCode: number,
  durationMs = 0,
) {
  const outcome =
    statusCode >= 500
      ? 'SERVER_ERROR'
      : statusCode === 429
        ? 'RATE_LIMITED'
        : statusCode === 409
          ? 'CONFLICT'
          : statusCode >= 400
            ? 'CLIENT_ERROR'
            : 'SUCCESS';
  await sql`insert into analytics.wishlist_operations(organization_id,day,operation,outcome,count,duration_ms)
    select id,(now() at time zone timezone)::date,${operation},${outcome},1,${Math.max(0, Math.round(durationMs))}
    from platform.organizations where id=${organizationId}
    on conflict(organization_id,day,operation,outcome) do update
      set count=analytics.wishlist_operations.count+1,duration_ms=analytics.wishlist_operations.duration_ms+excluded.duration_ms`.execute(
    db,
  );
}
