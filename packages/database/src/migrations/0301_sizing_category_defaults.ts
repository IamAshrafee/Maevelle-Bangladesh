import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Adds an optional default size guide to categories.
 *
 * This is a separate migration (not part of 0300_sizing.ts) to avoid a forward-reference
 * circular dependency: catalog tables are defined in 0200, sizing tables in 0300, so the
 * FK from catalog.categories → sizing.size_guides can only be established after 0300 runs.
 *
 * The FK uses ON DELETE SET NULL so that archiving/deleting a size guide does not
 * cascade-delete or block the category.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table catalog.categories
      add column default_size_guide_id uuid
        references sizing.size_guides(id) on delete set null;

    create index categories_default_size_guide on catalog.categories (default_size_guide_id)
      where default_size_guide_id is not null;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Category default size guide column has no automatic down migration.');
}
