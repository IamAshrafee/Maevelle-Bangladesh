import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Match the default inbox keyset order without a tenant-wide sort. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`create index if not exists conversations_activity
    on messaging.conversations(organization_id,(coalesce(last_message_at,created_at)) desc,id desc)`.execute(
    db,
  );
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`drop index if exists messaging.conversations_activity`.execute(db);
}
