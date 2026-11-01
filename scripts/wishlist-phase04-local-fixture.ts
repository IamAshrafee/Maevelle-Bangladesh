/** Disposable Phase 04 browser fixture. Requires the isolated local database name and port. */
import { createDatabase, sql } from '../packages/database/src/index.ts';
import { createOrganization } from '../packages/database/src/platform.ts';

const target = new URL(process.env.DATABASE_URL ?? '');
if (target.hostname !== '127.0.0.1' || target.port !== '55440' || target.pathname !== '/maevelle_ui_test')
  throw new Error('Phase 04 fixture requires the isolated local test database.');

const client = createDatabase({ connectionString: target.toString() });
try {
  const organization = await createOrganization(client.db, {
    code: 'maevelle', displayName: 'Maevelle local Wishlist fixture',
    timezone: 'Asia/Dhaka', defaultLocale: 'en', defaultCurrency: 'BDT',
  });
  const type = await sql<{ id: string }>`insert into catalog.product_types(organization_id,code,name)
    values (${organization.id},'accessory','Accessory') returning id::text`.execute(client.db);
  const categories: Record<string, string> = {};
  for (const name of ['Hair accessories', 'Jewelry', 'Handbags']) {
    const row = await sql<{ id: string }>`insert into catalog.categories(organization_id,handle,name)
      values (${organization.id},${name.toLowerCase().replaceAll(' ', '-')},${name}) returning id::text`.execute(client.db);
    categories[name] = row.rows[0]!.id;
  }
  const location = await sql<{ id: string }>`insert into warehouse.locations
    (organization_id,code,name,location_type,status)
    values (${organization.id},'UI-TEST','UI test warehouse','WAREHOUSE','ACTIVE') returning id::text`.execute(client.db);
  const products = [
    { handle: 'pearl-hair-clip-ui', title: 'Pearl Hair Clip', category: 'Hair accessories', price: 590, stock: 6, status: 'ACTIVE', publication: 'PUBLISHED', variants: 2 },
    { handle: 'silk-scarf-ui', title: 'Mulberry Silk Scarf', category: 'Hair accessories', price: 1890, stock: 0, status: 'ACTIVE', publication: 'PUBLISHED', variants: 1 },
    { handle: 'gold-bracelet-ui', title: 'Gold Tone Bracelet', category: 'Jewelry', price: 990, stock: 4, status: 'ACTIVE', publication: 'PUBLISHED', variants: 1 },
    { handle: 'leather-handbag-ui', title: 'Structured Everyday Handbag with an Elegant Long Product Name for Responsive Layout Testing', category: 'Handbags', price: 3490, stock: 3, status: 'ACTIVE', publication: 'PUBLISHED', variants: 1 },
    { handle: 'private-necklace-ui', title: 'Private Necklace', category: 'Jewelry', price: 690, stock: 1, status: 'ACTIVE', publication: 'UNPUBLISHED', variants: 1 },
    { handle: 'archived-clip-ui', title: 'Archived Clip', category: 'Hair accessories', price: 490, stock: 0, status: 'ARCHIVED', publication: 'UNPUBLISHED', variants: 1 },
  ] as const;
  for (const input of products) {
    const product = await sql<{ id: string }>`insert into catalog.products
      (organization_id,product_type_id,handle,title,description,status,publication_status,published_at,primary_category_id)
      values (${organization.id},${type.rows[0]!.id}::uuid,${input.handle},${input.title},
        'Local Wishlist UI test product',${input.status},${input.publication},
        ${input.publication === 'PUBLISHED' ? new Date() : null},${categories[input.category]}::uuid)
      returning id::text`.execute(client.db);
    await sql`insert into catalog.product_categories(organization_id,product_id,category_id)
      values (${organization.id},${product.rows[0]!.id}::uuid,${categories[input.category]}::uuid)`.execute(client.db);
    let axisId: string | null = null;
    const optionIds: string[] = [];
    if (input.variants > 1) {
      const axis = await sql<{ id: string }>`insert into catalog.product_option_axes
        (organization_id,product_id,code,name,is_visual)
        values (${organization.id},${product.rows[0]!.id}::uuid,'finish','Finish',true) returning id::text`.execute(client.db);
      axisId = axis.rows[0]!.id;
      for (let index = 0; index < input.variants; index += 1) {
        const value = await sql<{ id: string }>`insert into catalog.product_option_values
          (organization_id,product_id,option_axis_id,code,display_value,is_primary,position)
          values (${organization.id},${product.rows[0]!.id}::uuid,${axisId}::uuid,
            ${`finish-${index}`},${index === 0 ? 'Ivory pearl' : 'Blush pearl'},${index === 0},${index}) returning id::text`.execute(client.db);
        optionIds.push(value.rows[0]!.id);
      }
    }
    for (let index = 0; index < input.variants; index += 1) {
      const sku = `UI-${input.handle}-${index}`.toUpperCase();
      const variant = await sql<{ id: string }>`insert into catalog.product_variants
        (organization_id,product_id,sku,sku_normalized,option_signature)
        values (${organization.id},${product.rows[0]!.id}::uuid,${sku},${sku},${optionIds[index] ?? 'default'}) returning id::text`.execute(client.db);
      if (axisId) await sql`insert into catalog.variant_option_values
        (organization_id,variant_id,option_axis_id,option_value_id)
        values (${organization.id},${variant.rows[0]!.id}::uuid,${axisId}::uuid,${optionIds[index]}::uuid)`.execute(client.db);
      await sql`insert into pricing.price_definitions(organization_id,variant_id,currency_code,amount)
        values (${organization.id},${variant.rows[0]!.id}::uuid,'BDT',${input.price + index * 100})`.execute(client.db);
      const item = await sql<{ id: string }>`insert into inventory.inventory_items(organization_id,variant_id)
        values (${organization.id},${variant.rows[0]!.id}::uuid) returning id::text`.execute(client.db);
      if (input.stock) await sql`insert into inventory.inventory_levels
        (organization_id,inventory_item_id,location_id,sellable_quantity)
        values (${organization.id},${item.rows[0]!.id}::uuid,${location.rows[0]!.id}::uuid,${input.stock})`.execute(client.db);
    }
    if (input.publication === 'PUBLISHED') await sql`insert into search.catalog_documents
      (organization_id,product_id,handle,title,search_text,minimum_price,currency_code,available,published_at)
      values (${organization.id},${product.rows[0]!.id}::uuid,${input.handle},${input.title},
        ${input.title},${input.price},'BDT',${input.stock > 0},now())`.execute(client.db);
  }
} finally {
  await client.close();
}
