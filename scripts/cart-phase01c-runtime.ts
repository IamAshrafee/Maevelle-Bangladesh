/** Synthetic loopback acceptance only: no .env, external providers, resets, DROP or TRUNCATE. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createDatabase, sql } from '../packages/database/src/index.ts';
import { runMigrations } from '../packages/database/src/migrate.ts';
import { createPromotion, createCouponCode } from '../packages/database/src/promotions.ts';
import { createPriceDefinition } from '../packages/database/src/pricing.ts';
import { adjustInventory } from '../packages/database/src/inventory.ts';
import { cartFixture } from '../packages/database/src/testing/cart-fixture.ts';
import { parseConfig } from '../packages/config/src/index.ts';
import { buildApi } from '../apps/api/src/app.ts';

const approved = process.env.CART_01C_ISOLATED_URL;
if (!approved) throw new Error('Explicit verified isolated URL required.');
const base = new URL(approved);
if (base.hostname !== '127.0.0.1' || base.port !== '55444' || base.pathname !== '/maevelle_test')
  throw new Error('Refusing unverified database target');
const admin = createDatabase({ connectionString: approved, maxConnections: 1 });
const name = `maevelle_cart01a_${crypto.randomUUID().replaceAll('-', '')}`;
await sql`create database ${sql.id(name)}`.execute(admin.db);
await admin.close();
base.pathname = `/${name}`;
const database = createDatabase({ connectionString: base.href, maxConnections: 12 });
const identity = await sql<{ name: string }>`select current_database() name`.execute(database.db);
if (identity.rows[0]?.name !== name) throw new Error('Target identity mismatch');
await runMigrations(database.db);
const fixture = await cartFixture(database);
const choiceHandle = `${fixture.code}-choices`;
const choice = await sql<{ id: string }>`
  insert into catalog.products (organization_id, product_type_id, handle, title, status, publication_status, published_at)
  select organization_id, product_type_id, ${choiceHandle}, 'Synthetic selectable clip', 'ACTIVE', 'PUBLISHED', now()
  from catalog.products where id=${fixture.productId}
  returning id
`.execute(database.db);
const choiceProductId = choice.rows[0]!.id;
const axis = await sql<{ id: string }>`
  insert into catalog.product_option_axes(organization_id, product_id, code, name)
  values (${fixture.organizationId}, ${choiceProductId}, 'style', 'Style') returning id
`.execute(database.db);
const axisId = axis.rows[0]!.id;
const locations = await sql<{ id: string }>`
  select id from warehouse.locations where organization_id=${fixture.organizationId} and code='TEST'
`.execute(database.db);
let selectedVariantId = '';
for (const style of ['Smooth', 'Textured']) {
  const option = await sql<{ id: string }>`
    insert into catalog.product_option_values(organization_id, product_id, option_axis_id, code, display_value)
    values (${fixture.organizationId}, ${choiceProductId}, ${axisId}, ${style.toLowerCase()}, ${style}) returning id
  `.execute(database.db);
  const optionId = option.rows[0]!.id;
  const sku = `C01-${style.toUpperCase()}`;
  const variant = await sql<{ id: string }>`
    insert into catalog.product_variants(organization_id, product_id, sku, sku_normalized, option_signature)
    values (${fixture.organizationId}, ${choiceProductId}, ${sku}, ${sku}, ${optionId}) returning id
  `.execute(database.db);
  const variantId = variant.rows[0]!.id;
  await sql`
    insert into catalog.variant_option_values(organization_id, variant_id, option_axis_id, option_value_id)
    values (${fixture.organizationId}, ${variantId}, ${axisId}, ${optionId})
  `.execute(database.db);
  await adjustInventory(database.db, {
    organizationId: fixture.organizationId,
    actorId: fixture.actorId,
    variantId,
    locationId: locations.rows[0]!.id,
    condition: 'SELLABLE',
    quantityDelta: '4',
    reasonCode: 'OPENING_BALANCE',
    idempotencyKey: crypto.randomUUID(),
  });
  await createPriceDefinition(database.db, {
    organizationId: fixture.organizationId,
    actorId: fixture.actorId,
    variantId,
    currency: 'BDT',
    amount: style === 'Textured' ? '123.0000' : '100.0000',
    effectiveFrom: new Date(Date.now() - 60_000),
  });
  if (style === 'Textured') selectedVariantId = variantId;
}
const promotion = await createPromotion(database.db, {
  organizationId: fixture.organizationId,
  actorId: fixture.actorId,
  name: 'Synthetic Cart01B coupon',
  promotionType: 'COUPON',
  benefitType: 'PERCENTAGE_DISCOUNT',
  benefitValue: '10',
  combinability: 'EXCLUSIVE',
});
await createCouponCode(database.db, {
  organizationId: fixture.organizationId,
  actorId: fixture.actorId,
  promotionId: promotion.id,
  code: 'CART01B10',
});
const origin = 'http://localhost:3000';
const config = parseConfig({
  NODE_ENV: 'development',
  DATABASE_URL: base.href,
  TEST_DATABASE_URL: base.href,
  BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
  AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  BETTER_AUTH_URL: origin,
  AUTH_TRUSTED_ORIGINS: origin,
  STOREFRONT_BASE_URL: origin,
  STOREFRONT_ORGANIZATION_CODE: fixture.code,
  STOREFRONT_INTERNAL_API_URL: 'http://127.0.0.1:3002',
  MEDIA_STORAGE_PATH: '/tmp/maevelle-cart01c/media',
  EMAIL_ENABLED: 'false',
  SMS_ENABLED: 'false',
  API_HOST: '127.0.0.1',
  API_PORT: '3002',
  LOG_LEVEL: 'error',
});
const mailbox: { text: string }[] = [];
const app = buildApi({
  database,
  config,
  logger: false,
  shopperAuthEmailSender: async (message) => {
    mailbox.push(message);
  },
});
app.post('/__fixture/expire', async () => {
  await sql`update cart.carts set expires_at=clock_timestamp()-interval '1 second' where organization_id=${fixture.organizationId}`.execute(
    database.db,
  );
  return { data: { expired: true } };
});
await app.ready();
const password = randomBytes(24).toString('base64url');
for (const actor of ['a', 'b']) {
  const signup = await app.inject({
    method: 'POST',
    url: '/shopper-auth/sign-up/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: {
      name: `Synthetic ${actor}`,
      email: `cart01br-${actor}@example.test`,
      password,
      callbackURL: `${origin}/account`,
    },
  });
  if (signup.statusCode !== 200) throw new Error('Synthetic signup failed');
  const link = new URL(mailbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const verification = await app.inject({ method: 'GET', url: link.pathname + link.search });
  if (![200, 302].includes(verification.statusCode))
    throw new Error('Synthetic verification failed');
}
mkdirSync('/tmp/maevelle-cart01c', { recursive: true, mode: 0o700 });
writeFileSync(
  '/tmp/maevelle-cart01c/fixture.json',
  JSON.stringify({
    ...fixture,
    databaseName: name,
    databaseUrl: base.href,
    origin,
    password,
    choiceHandle,
    selectedVariantId,
  }),
  { mode: 0o600 },
);
await app.listen({ host: '127.0.0.1', port: 3002 });
console.log(JSON.stringify({ ready: true, database: name, product: `/products/${fixture.code}` }));
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void app
      .close()
      .then(() => database.close())
      .then(() => process.exit(0));
  });
