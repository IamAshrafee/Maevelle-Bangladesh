import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Mutable stocktake workflow records retain an update timestamp for optimistic editing. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`alter table inventory.stocktake_sessions add column updated_at timestamptz not null default now();`.execute(
    db,
  );
}

export async function down(): Promise<void> {
  throw new Error('Stocktake workflow history has no automatic down migration.');
}
