import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table catalog.categories drop constraint categories_status_check;
    alter table catalog.categories
      add constraint categories_status_check
      check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED'));

    alter table catalog.categories
      add constraint categories_position_nonnegative check (position >= 0);

    create index categories_organization_status_updated
      on catalog.categories (organization_id, status, updated_at desc, id);

    create table catalog.category_handle_history (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      category_id uuid not null references catalog.categories(id),
      old_handle text not null,
      changed_at timestamptz not null default now(),
      unique (organization_id, old_handle)
    );
    create index category_handle_history_category
      on catalog.category_handle_history (organization_id, category_id, changed_at desc);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Automatic down migrations are intentionally unsupported.');
}
