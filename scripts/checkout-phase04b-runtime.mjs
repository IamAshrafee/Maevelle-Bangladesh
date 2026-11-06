/** Standalone synthetic browser runtime. Never reads .env or a persistent target. */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { isolatedCartDatabase } from '../packages/database/dist/src/testing/cart-fixture.js';
import { manualPaymentFixture } from '../packages/database/dist/src/testing/manual-payment-fixture.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { sql } from '../packages/database/dist/src/index.js';
import { parseConfig } from '../packages/config/dist/src/index.js';
import { buildApi } from '../apps/api/dist/src/app.js';
import { createAuth } from '../apps/api/dist/src/auth/auth.js';
if (
  process.env.TEST_DATABASE_URL !== 'postgresql://checkout_fixture@127.0.0.1:55444/maevelle_test' ||
  !process.env.CHECKOUT_04B_OUTPUT
)
  throw new Error('Explicit disposable loopback fixture and output directory required.');
const isolated = await isolatedCartDatabase();
console.log(
  'Synthetic target',
  JSON.stringify(
    (await sql`select current_database(),version()`.execute(isolated.database.db)).rows,
  ),
);
await runMigrations(isolated.database.db);
const f = await manualPaymentFixture(isolated.database.db);
const org = (
  await sql`select code from platform.organizations where id=${f.organizationId}`.execute(
    isolated.database.db,
  )
).rows[0];
const config = parseConfig({
  NODE_ENV: 'test',
  DATABASE_URL: isolated.url,
  TEST_DATABASE_URL: isolated.url,
  BETTER_AUTH_SECRET: 'synthetic-payment04b-secret-only-32-characters-long',
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 31).toString('base64'),
  BETTER_AUTH_URL: 'http://localhost:3001',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:3001,http://127.0.0.1:3001',
  STOREFRONT_ORGANIZATION_CODE: org.code,
  STOREFRONT_BASE_URL: 'http://localhost:3000',
  API_HOST: '127.0.0.1',
  API_PORT: '3002',
});
const auth = createAuth(config, isolated.database, true);
const password = 'Synthetic-payment04B-only-123!';
const users = {};
for (const [role, oldId] of [
  ['owner', f.owner],
  ['reviewer', f.reviewer],
  ['viewer', f.viewer],
]) {
  const email = `${role}04b@example.test`;
  const signup = await auth.api.signUpEmail({
    body: { email, password, name: `Synthetic ${role}` },
  });
  if (!signup.user?.id) throw new Error('Synthetic signup failed.');
  await sql`update iam.organization_memberships set user_id=${signup.user.id} where organization_id=${f.organizationId} and user_id=${oldId}`.execute(
    isolated.database.db,
  );
  users[role] = { id: signup.user.id, email };
}
for (const capability of [
  'payments.view',
  'refunds.view',
  'refunds.manage',
  'finance.accounts.view',
  'orders.view',
])
  await sql`insert into iam.membership_capability_grants(membership_id,capability_code) select id,${capability} from iam.organization_memberships
    where organization_id=${f.organizationId} and user_id=${users.reviewer.id} on conflict do nothing`.execute(
    isolated.database.db,
  );
const claims = [];
for (let n = 1; n <= 30; n++)
  claims.push(await f.order(`SYNTHETIC-04B-${String(n).padStart(2, '0')}`));
const api = buildApi({
  database: isolated.database,
  config,
  logger: false,
  shopperAuthEmailSender: async () => {},
});
let loseNext = false;
api.addHook('onSend', async (request, reply, payload) => {
  if (
    loseNext &&
    request.method === 'POST' &&
    /\/attempts\/[^/]+\/verify$/.test(request.url) &&
    reply.statusCode < 300
  ) {
    loseNext = false;
    reply.code(503);
    return JSON.stringify({
      error: { code: 'UNAVAILABLE', message: 'Synthetic lost successful response' },
    });
  }
  return payload;
});
api.post('/__checkout04b/lost-response', async () => {
  loseNext = true;
  return { data: true };
});
api.get('/__checkout04b/facts', async () => ({
  data: (
    await sql`select
  (select count(*)::int from orders.orders where source='STOREFRONT') checkout_orders,
  (select count(*)::int from inventory.inventory_reservations) reservations,
  (select count(*)::int from payments.payments) synthetic_receipts,
  (select count(*)::int from finance.finance_transactions) synthetic_finance_movements,
  (select count(*)::int from promotions.promotion_usage) redemptions,
  (select count(*)::int from cart.carts where status='CONVERTED') converted_carts,
  (select count(*)::int from platform.outbox_events where event_type='orders.order.placed') purchase_events`.execute(
      isolated.database.db,
    )
  ).rows[0],
}));
api.post('/__checkout04b/stop', async () => {
  setTimeout(() => void close(), 100);
  return { data: true };
});
await api.listen({ host: '127.0.0.1', port: 3002 });
await writeFile(
  resolve(process.env.CHECKOUT_04B_OUTPUT, 'fixture.json'),
  JSON.stringify(
    { organizationId: f.organizationId, users, password, claims, accountId: f.accountId },
    null,
    2,
  ),
);
console.log('Synthetic payment API ready on 127.0.0.1:3002');
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
