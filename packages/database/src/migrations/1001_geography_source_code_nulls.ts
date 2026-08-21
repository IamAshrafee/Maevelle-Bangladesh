import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Reconciles Geography uniqueness without rewriting the applied 0650 migration. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table geography.nodes drop constraint nodes_dataset_id_source_code_key;
    alter table geography.nodes add constraint nodes_dataset_id_source_code_key unique (dataset_id, source_code);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Geography reference data has no automatic down migration.');
}
