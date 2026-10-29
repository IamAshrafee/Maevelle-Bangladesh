import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Lease and retry metadata for purge jobs; existing stranded rows become claimable. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table media.media_assets
      add column purge_claim_token uuid,
      add column purge_lease_until timestamptz,
      add column purge_attempts integer not null default 0 check (purge_attempts >= 0),
      add column purge_retry_after timestamptz,
      add column purge_last_error text,
      add constraint media_purge_lease_pair check
        ((purge_claim_token is null) = (purge_lease_until is null));
    update media.media_assets set purge_retry_after=now()
      where status='PURGING';
    create index media_assets_purge_due on media.media_assets
      (status,purge_retry_after,purge_lease_until,purge_after,id)
      where status in ('TRASHED','PURGING');
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    drop index if exists media.media_assets_purge_due;
    alter table media.media_assets
      drop constraint if exists media_purge_lease_pair,
      drop column if exists purge_claim_token,
      drop column if exists purge_lease_until,
      drop column if exists purge_attempts,
      drop column if exists purge_retry_after,
      drop column if exists purge_last_error;
  `.execute(db);
}
