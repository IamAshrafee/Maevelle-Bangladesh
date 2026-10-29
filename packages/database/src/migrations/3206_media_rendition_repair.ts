import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Preserve an Archived image's lifecycle while its missing renditions are regenerated. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`alter table media.media_assets add column
    restore_archived_after_processing boolean not null default false`.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`alter table media.media_assets drop column restore_archived_after_processing`.execute(db);
}
