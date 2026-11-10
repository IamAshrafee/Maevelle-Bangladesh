import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Keep cross-domain purge reference checks indexed by media asset. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create index if not exists assets_media_links_media_asset on assets.media_links
      (organization_id,media_asset_id);
    alter table customers.customers
      add column if not exists profile_image_asset_id uuid;
    create index if not exists customers_profile_image_asset on customers.customers
      (organization_id,profile_image_asset_id) where profile_image_asset_id is not null;
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    drop index if exists assets.assets_media_links_media_asset;
    drop index if exists customers.customers_profile_image_asset;
  `.execute(db);
}
