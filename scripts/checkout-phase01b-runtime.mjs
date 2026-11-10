import { fixtureSigningSecret, fixturePassword } from './fixtures/browser-credentials.mjs';
/** Isolated synthetic runtime; never uses .env or a persistent database. */
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { parseConfig } from '../packages/config/dist/src/index.js';
import {
  isolatedCartDatabase,
  cartFixture,
} from '../packages/database/dist/src/testing/cart-fixture.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { sql } from '../packages/database/dist/src/index.js';
import { rebuildStorefrontSearch } from '../packages/database/dist/src/storefront.js';
import { buildApi } from '../apps/api/dist/src/app.js';

if (
  process.env.TEST_DATABASE_URL !== 'postgresql://checkout_fixture@127.0.0.1:55440/maevelle_test' ||
  !process.env.CHECKOUT_01B_OUTPUT
)
  throw new Error('Explicit local disposable Checkout01B cluster and output directory required.');
const isolated = await isolatedCartDatabase();
await runMigrations(isolated.database.db);
const fixture = await cartFixture(isolated.database);
await rebuildStorefrontSearch(isolated.database.db, fixture.organizationId);
const mailbox = [];
const config = parseConfig({
  NODE_ENV: 'test',
  DATABASE_URL: isolated.url,
  TEST_DATABASE_URL: isolated.url,
  BETTER_AUTH_SECRET: fixtureSigningSecret(),
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 29).toString('base64'),
  STOREFRONT_ORGANIZATION_CODE: fixture.code,
  STOREFRONT_BASE_URL: 'http://localhost:3000',
  BETTER_AUTH_URL: 'http://localhost:3000',
  CHECKOUT_DRAFTS_ENABLED: 'true',
  API_HOST: '127.0.0.1',
  API_PORT: '3002',
});
const api = buildApi({
  database: isolated.database,
  config,
  logger: false,
  shopperAuthEmailSender: async (value) => {
    mailbox.push(value);
  },
});
// Test control surface is registered only in this standalone loopback fixture.
api.get('/__checkout01b/facts', async () => ({
  data: (
    await sql`
  select (select count(*) from orders.checkout_drafts)::integer drafts,
    (select count(*) from orders.orders)::integer orders,
    (select count(*) from inventory.inventory_reservations)::integer reservations,
    (select count(*) from payments.payment_intents)::integer obligations,
    (select count(*) from promotions.promotion_usage)::integer redemptions,
    (select count(*) from cart.carts where status='CONVERTED')::integer converted,
    (select count(*) from platform.outbox_events where event_type='orders.order.placed')::integer purchases`.execute(
      isolated.database.db,
    )
  ).rows[0],
}));
api.post('/__checkout01b/expire-drafts', async () => {
  await sql`update orders.checkout_drafts set expires_at=clock_timestamp()-interval '1 second'`.execute(
    isolated.database.db,
  );
  return { data: true };
});
api.post('/__checkout01b/expire-guests', async () => {
  await sql`update orders.checkout_guest_sessions set expires_at=clock_timestamp()-interval '1 second'`.execute(
    isolated.database.db,
  );
  return { data: true };
});
api.post('/__checkout01b/stop', async () => {
  setTimeout(() => void close(), 100);
  return { data: true };
});
for (const letter of ['a', 'b']) {
  const email = `checkout01b-${letter}@example.test`,
    password = fixturePassword;
  const signup = await api.inject({
    method: 'POST',
    url: '/shopper-auth/sign-up/email',
    headers: { origin: config.storefrontBaseUrl },
    payload: { name: `Synthetic ${letter}`, email, password },
  });
  if (signup.statusCode !== 200) throw new Error(`Fixture signup failed ${signup.statusCode}`);
  const url = new URL(mailbox.find((m) => m.to === email).text.match(/https?:\/\/\S+/)[0]);
  await api.inject({ method: 'GET', url: url.pathname + url.search });
}
await api.listen({ host: '127.0.0.1', port: 3002 });
writeFileSync(
  join(process.env.CHECKOUT_01B_OUTPUT, 'fixture.json'),
  JSON.stringify({
    handle: fixture.code,
    variantId: fixture.variantId,
    organizationId: fixture.organizationId,
  }),
);
console.log('Isolated Checkout01B API ready on loopback 3002');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await api.close();
  await isolated.close();
  process.exit(0);
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
