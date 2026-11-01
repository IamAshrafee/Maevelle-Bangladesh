/** Adds published fixture pieces to one synthetic shopper in the disposable browser database. */
import { createDatabase, sql } from '../packages/database/src/index.ts';

const target = new URL(process.env.DATABASE_URL ?? '');
if (target.hostname !== '127.0.0.1' || target.port !== '55440' || target.pathname !== '/maevelle_ui_test')
  throw new Error('Phase 05 fixture requires the isolated local test database.');

const database = createDatabase({ connectionString: target.toString() });
try {
  await database.db.transaction().execute(async (tx) => {
    const account = await sql<{ organization_id: string; list_id: string }>`
      select a.organization_id::text,l.id::text as list_id
      from customers.customer_accounts a
      join iam.users u on u.id=a.user_id
      join wishlist.account_lists l on l.organization_id=a.organization_id and l.owner_account_id=a.id
      where u.email='wishlist-phase05-qa-1101@example.test' and a.status='ACTIVE'
    `.execute(tx);
    if (account.rows.length !== 1) throw new Error('Synthetic Phase 05 shopper is required.');
    const { organization_id: organizationId, list_id: listId } = account.rows[0]!;
    const existing = await sql<{ count: number }>`select count(*)::int as count from catalog.products
      where organization_id=${organizationId}::uuid and handle like 'wishlist-bulk-%'`.execute(tx);
    if (![0, 105].includes(existing.rows[0]!.count)) throw new Error('Partial bulk fixture exists.');
    if (existing.rows[0]!.count === 0) {
      await sql`insert into catalog.products
        (organization_id,product_type_id,handle,title,status,publication_status,published_at)
        select ${organizationId}::uuid,t.id,'wishlist-bulk-'||series.value::text,
          'Saved accessory '||lpad(series.value::text,3,'0'),'ACTIVE','PUBLISHED',now()
        from generate_series(1,105) as series(value)
        join catalog.product_types t on t.organization_id=${organizationId}::uuid and t.code='accessory'`.execute(tx);
      await sql`insert into catalog.product_variants
        (organization_id,product_id,sku,sku_normalized,option_signature)
        select ${organizationId}::uuid,p.id,upper(p.handle),upper(p.handle),'default'
        from catalog.products p where p.organization_id=${organizationId}::uuid and p.handle like 'wishlist-bulk-%'`.execute(tx);
      await sql`insert into search.catalog_documents
        (organization_id,product_id,handle,title,search_text,minimum_price,currency_code,available,published_at)
        select ${organizationId}::uuid,p.id,p.handle,p.title,p.title,750,'BDT',false,now()
        from catalog.products p where p.organization_id=${organizationId}::uuid and p.handle like 'wishlist-bulk-%'`.execute(tx);
    }
    const added = await sql<{ product_id: string }>`
      insert into wishlist.account_items(organization_id,wishlist_id,product_id)
      select ${organizationId}::uuid,${listId}::uuid,p.id
      from catalog.products p where p.organization_id=${organizationId}::uuid
        and p.handle like 'wishlist-bulk-%' and p.status='ACTIVE' and p.publication_status='PUBLISHED'
      on conflict do nothing returning product_id::text
    `.execute(tx);
    if (added.rows.length !== 105 && added.rows.length !== 0)
      throw new Error(`Expected all or none of the 105 bulk fixture pieces; found ${added.rows.length}.`);
    if (added.rows.length) await sql`update wishlist.account_lists set version=version+1,updated_at=now()
      where organization_id=${organizationId}::uuid and id=${listId}::uuid`.execute(tx);
  });
} finally {
  await database.close();
}
