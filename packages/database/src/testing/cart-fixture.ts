import { createDatabase, sql, type DatabaseClient } from '../index.js';
import { createOrganization } from '../platform.js';
import { createPriceDefinition } from '../pricing.js';
import { adjustInventory } from '../inventory.js';
import { createLocation } from '../warehouse.js';

/** Never connect a destructive integration fixture through the repository default. */
export function isolatedCartTestUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Cart tests require an explicit isolated TEST_DATABASE_URL.');
  const url = new URL(raw);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !/^\/(?:maevelle_test|maevelle_cart01a_[a-z0-9_]+)$/.test(url.pathname)
  )
    throw new Error('Cart tests require a local test server and a dedicated test database name.');
  return raw;
}
/** Only newly created random databases are migrated/mutated; never the configured template. */
export async function isolatedCartDatabase() {
  const base = isolatedCartTestUrl();
  const admin = createDatabase({ connectionString: base, maxConnections: 1 });
  const name = `maevelle_cart01a_${crypto.randomUUID().replaceAll('-', '')}`;
  await sql`create database ${sql.id(name)}`.execute(admin.db);
  const url = new URL(base);
  url.pathname = `/${name}`;
  const database = createDatabase({ connectionString: url.href, maxConnections: 10 });
  const identity = await sql<{ name: string }>`select current_database() name`.execute(database.db);
  if (identity.rows[0]?.name !== name) throw new Error('Isolated Cart database identity mismatch.');
  return {
    database,
    url: url.href,
    async close() {
      await database.close();
      await sql`drop database ${sql.id(name)}`.execute(admin.db);
      await admin.close();
    },
  };
}
export async function cartFixture(database: DatabaseClient) {
  const code = `cart-${crypto.randomUUID()}`;
  const org = await createOrganization(database.db, {
    code,
    displayName: 'Synthetic Cart',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const organizationId = org.id;
  const actorId = crypto.randomUUID();
  const type = await sql<{
    id: string;
  }>`insert into catalog.product_types(organization_id,code,name) values(${organizationId},'accessory','Accessory') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products(organization_id,product_type_id,handle,title,status,publication_status,published_at)
    values(${organizationId},${type.rows[0]!.id},${code},'Synthetic public clip','ACTIVE','PUBLISHED',now()) returning id`.execute(
    database.db,
  );
  const sku = `CART-${crypto.randomUUID()}`.toUpperCase();
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature)
    values(${organizationId},${product.rows[0]!.id},${sku},${sku},'default') returning id`.execute(
    database.db,
  );
  const variantId = variant.rows[0]!.id;
  const location = await createLocation(database.db, {
    organizationId,
    actorId,
    code: 'TEST',
    name: 'Synthetic test warehouse',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING'],
  });
  await adjustInventory(database.db, {
    organizationId,
    actorId,
    variantId,
    locationId: location.id,
    condition: 'SELLABLE',
    quantityDelta: '40',
    reasonCode: 'OPENING_BALANCE',
    idempotencyKey: crypto.randomUUID(),
  });
  await createPriceDefinition(database.db, {
    organizationId,
    actorId,
    variantId,
    currency: 'BDT',
    amount: '100.0000',
    // Keep the synthetic price unambiguously current across host/database clock skew.
    effectiveFrom: new Date(Date.now() - 60_000),
  });
  return { organizationId, code, actorId, productId: product.rows[0]!.id, variantId };
}
