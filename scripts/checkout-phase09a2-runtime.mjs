/** Loopback-only synthetic browser fixture. No activation overrides or provider adapters. */
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { setInterval } from 'node:timers';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  isolatedCartDatabase,
  cartFixture,
} from '../packages/database/dist/src/testing/cart-fixture.js';
import { cashSettlementFixture } from '../packages/database/dist/src/testing/cash-settlement-fixture.js';
import { cashShortfallEngine } from '../packages/database/dist/src/payments/cash-shortfall/engine.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { sql } from '../packages/database/dist/src/index.js';
import { setCurrentVariantPrice } from '../packages/database/dist/src/pricing.js';
import { parseConfig } from '../packages/config/dist/src/index.js';
import { buildApi } from '../apps/api/dist/src/app.js';
import { createAuth } from '../apps/api/dist/src/auth/auth.js';
import { fixturePassword, fixtureSigningSecret } from './fixtures/browser-credentials.mjs';

const output = process.env.CHECKOUT_09A2_OUTPUT;
const target = new URL(process.env.TEST_DATABASE_URL ?? 'invalid:');
if (!output || target.hostname !== '127.0.0.1' || target.pathname !== '/maevelle_test')
  throw Error('Explicit disposable local target/output required.');
const isolated = await isolatedCartDatabase();
await runMigrations(isolated.database.db);
const db = isolated.database.db,
  f = await cashSettlementFixture(db),
  c = await f.collect();
await sql`insert into orders.order_customer_snapshots(organization_id,order_id,display_name,phone,normalized_phone)
  values(${f.organizationId},${c.orderId},'Synthetic buyer','01700000000','01700000000')`.execute(
  db,
);
await cashShortfallEngine(async () => 'SYNTHETIC').settle(
  db,
  { organizationId: f.organizationId, actorId: f.owner },
  c.input,
  randomUUID(),
);
const catalog = await cartFixture(isolated.database);
await sql`update platform.organizations set code='retail-browser-fixture' where id=${catalog.organizationId}`.execute(
  db,
);
await setCurrentVariantPrice(db, {
  organizationId: catalog.organizationId,
  actorId: catalog.actorId,
  variantId: catalog.variantId,
  amount: '299.0000',
  currency: 'BDT',
});
const product = (
  await sql`select handle from catalog.products where id=${catalog.productId}`.execute(db)
).rows[0];
const config = parseConfig({
  NODE_ENV: 'test',
  DATABASE_URL: isolated.url,
  TEST_DATABASE_URL: isolated.url,
  BETTER_AUTH_SECRET: fixtureSigningSecret(),
  AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  BETTER_AUTH_URL: 'http://localhost:3001',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:3001,http://localhost:3000',
  STOREFRONT_ORGANIZATION_CODE: 'retail-browser-fixture',
  STOREFRONT_BASE_URL: 'http://localhost:3000',
  API_HOST: '127.0.0.1',
  API_PORT: '3002',
  EMAIL_ENABLED: 'false',
  SMS_ENABLED: 'false',
});
const auth = createAuth(config, isolated.database, true),
  users = {};
for (const role of ['owner', 'reader']) {
  const email = `${role}-retail@example.test`,
    signed = await auth.api.signUpEmail({
      body: { email, password: fixturePassword, name: `Synthetic ${role}` },
    });
  await sql`update iam.users set email_verified=true where id=${signed.user.id}`.execute(db);
  if (role === 'owner')
    await sql`update iam.organization_memberships set user_id=${signed.user.id} where organization_id=${f.organizationId} and user_id=${f.owner}`.execute(
      db,
    );
  else
    await sql`insert into iam.organization_memberships(organization_id,user_id,membership_type,status) values(${f.organizationId},${signed.user.id},'STANDARD','ACTIVE')`.execute(
      db,
    );
  users[role] = { email, id: signed.user.id };
}

const api = buildApi({
  database: isolated.database,
  config,
  logger: false,
  shopperAuthEmailSender: async () => {},
});
await api.listen({ host: '127.0.0.1', port: 3002 });
await writeFile(
  join(output, 'fixture.json'),
  JSON.stringify({
    organizationId: f.organizationId,
    catalogOrganizationId: catalog.organizationId,
    orderId: c.orderId,
    paymentId: c.paymentId,
    handle: product.handle,
    users,
  }),
);
console.log('Phase09A.2 disposable API ready on loopback3002; public financial gates unchanged.');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await api.close();
  await isolated.close();
  process.exit(0);
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
setInterval(() => {
  if (existsSync(join(output, 'stop-runtime'))) void close();
}, 500).unref();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (v) => {
  if (v.trim() === 'stop') void close();
});
