/** Synthetic loopback fixture for the Phase 02B browser journey. */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApi } from '../apps/api/src/app.ts';
import { parseConfig } from '../packages/config/src/index.ts';
import { sql } from '../packages/database/src/index.ts';
import { runMigrations } from '../packages/database/src/migrate.ts';
import { adjustInventory } from '../packages/database/src/inventory.ts';
import { createPriceDefinition, setCurrentVariantPrice } from '../packages/database/src/pricing.ts';
import { createCouponCode, createPromotion } from '../packages/database/src/promotions.ts';
import {
  cartFixture,
  isolatedCartDatabase,
} from '../packages/database/src/testing/cart-fixture.ts';

const isolation = await isolatedCartDatabase();
const media = await mkdtemp(join(tmpdir(), 'maevelle-cart02b-media-'));
const { database } = isolation;
try {
  await runMigrations(database.db);
  const fixture = await cartFixture(database);
  const { organizationId, actorId, productId, variantId } = fixture;
  const handle = `${fixture.code}-choices`;
  await sql`update catalog.products set handle = ${handle}, title = 'Synthetic selectable clip'
    where organization_id = ${organizationId} and id = ${productId}`.execute(database.db);
  const axis = await sql<{ id: string }>`insert into catalog.product_option_axes
    (organization_id, product_id, code, name)
    values (${organizationId}, ${productId}, 'style', 'Style') returning id`.execute(database.db);
  const axisId = axis.rows[0]!.id;
  const values = await sql<{ id: string; code: string }>`insert into catalog.product_option_values
    (organization_id, product_id, option_axis_id, code, display_value)
    values (${organizationId}, ${productId}, ${axisId}, 'smooth', 'Smooth'),
      (${organizationId}, ${productId}, ${axisId}, 'textured', 'Textured')
    returning id, code`.execute(database.db);
  const smooth = values.rows.find(({ code }) => code === 'smooth')!.id;
  const textured = values.rows.find(({ code }) => code === 'textured')!.id;
  await sql`update catalog.product_variants set option_signature = ${smooth}
    where organization_id = ${organizationId} and id = ${variantId}`.execute(database.db);
  const variant = await sql<{ id: string }>`insert into catalog.product_variants
    (organization_id, product_id, sku, sku_normalized, option_signature)
    values (${organizationId}, ${productId}, 'C02B-TEXTURED', 'C02B-TEXTURED', ${textured})
    returning id`.execute(database.db);
  const target = variant.rows[0]!.id;
  await sql`insert into catalog.variant_option_values
    (organization_id, variant_id, option_axis_id, option_value_id)
    values (${organizationId}, ${variantId}, ${axisId}, ${smooth}),
      (${organizationId}, ${target}, ${axisId}, ${textured})`.execute(database.db);
  const location = await sql<{ id: string }>`select id from warehouse.locations
    where organization_id = ${organizationId} and code = 'TEST'`.execute(database.db);
  await adjustInventory(database.db, {
    organizationId,
    actorId,
    variantId: target,
    locationId: location.rows[0]!.id,
    condition: 'SELLABLE',
    quantityDelta: '4',
    reasonCode: 'OPENING_BALANCE',
    idempotencyKey: crypto.randomUUID(),
  });
  await createPriceDefinition(database.db, {
    organizationId,
    actorId,
    variantId: target,
    currency: 'BDT',
    amount: '123.0000',
  });
  const promotion = await createPromotion(database.db, {
    organizationId,
    actorId,
    name: 'Synthetic ten percent',
    promotionType: 'COUPON',
    benefitType: 'PERCENTAGE_DISCOUNT',
    benefitValue: '10',
    combinability: 'EXCLUSIVE',
  });
  await createCouponCode(database.db, {
    organizationId,
    actorId,
    promotionId: promotion.id,
    code: 'CART01B10',
  });

  const origin = 'http://localhost:3000';
  const config = parseConfig({
    NODE_ENV: 'development',
    DATABASE_URL: isolation.url,
    TEST_DATABASE_URL: isolation.url,
    BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
    AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    BETTER_AUTH_URL: origin,
    AUTH_TRUSTED_ORIGINS: origin,
    STOREFRONT_BASE_URL: origin,
    STOREFRONT_ORGANIZATION_CODE: fixture.code,
    MEDIA_STORAGE_PATH: media,
    EMAIL_ENABLED: 'false',
    SMS_ENABLED: 'false',
  });
  const app = buildApi({ database, config, logger: false });
  app.post('/__fixture/reprice-and-expire', async () => {
    await setCurrentVariantPrice(database.db, {
      organizationId,
      actorId,
      variantId: target,
      currency: 'BDT',
      amount: '157.0000',
    });
    await sql`update promotions.promotions set ends_at = now() - interval '1 second'
      where organization_id = ${organizationId} and id = ${promotion.id}`.execute(database.db);
    return { data: { updated: true } };
  });
  app.post('/__fixture/reduce-stock', async () => {
    await adjustInventory(database.db, {
      organizationId,
      actorId,
      variantId: target,
      locationId: location.rows[0]!.id,
      condition: 'SELLABLE',
      quantityDelta: '-3',
      reasonCode: 'CORRECTION',
      idempotencyKey: crypto.randomUUID(),
    });
    return { data: { updated: true } };
  });
  app.post('/__fixture/invalidate', async () => {
    await sql`insert into catalog.product_option_axes (organization_id, product_id, code, name)
      values (${organizationId}, ${productId}, 'new-axis', 'New option')`.execute(database.db);
    return { data: { updated: true } };
  });
  await app.listen({ host: '127.0.0.1', port: 3002 });
  console.log(JSON.stringify({ ready: true, handle }));
  await new Promise<void>((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
  });
  await app.close();
} finally {
  await isolation.close();
  await rm(media, { recursive: true, force: true });
}
