/** Isolated HTTPS test harness only. Fixture endpoints are NEVER registered by buildApi. */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
import type FastifyFactory from '../apps/api/node_modules/fastify/fastify.js';
const Fastify = apiRequire('fastify') as typeof FastifyFactory;
const dbRequire = createRequire(new URL('../packages/database/package.json', import.meta.url));
import type * as MigrationModule from '../packages/database/node_modules/kysely/dist/migration/index.js';
const { Migrator } = dbRequire('kysely/migration') as typeof MigrationModule;
import { sql } from '../packages/database/src/index.js';
import { migrations } from '../packages/database/src/migrations/index.js';
import { runMigrations } from '../packages/database/src/migrate.js';
import {
  cartFixture,
  isolatedCartDatabase,
} from '../packages/database/src/testing/cart-fixture.js';
import { retireGuestCartCredential } from '../packages/database/src/cart/credentials.js';
import { parseConfig } from '../packages/config/src/index.js';
import { hashToken, generateOpaqueToken, decryptSecret } from '../packages/security/src/index.js';
import { registerCartRoutes } from '../apps/api/src/routes/cart.js';
import { registerShopperAuthRoutes } from '../apps/api/src/routes/shopper-auth.js';
import { registerOrderRoutes } from '../apps/api/src/routes/orders.js';

const isolated = await isolatedCartDatabase();
const database = isolated.database;
const previous = new Migrator({
  db: database.db,
  provider: {
    getMigrations: async () =>
      Object.fromEntries(
        Object.entries(migrations).filter(([name]) => name < '3214_cart_credential_retirement'),
      ),
  },
});
const applied = await previous.migrateToLatest();
if (applied.error) throw applied.error;
const fixture = await cartFixture(database);
const legacyToken = generateOpaqueToken();
const old = await sql<{
  id: string;
  owner_context: string;
}>`insert into cart.carts(organization_id,public_token_hash,currency_code,expires_at,version) values(${fixture.organizationId},${hashToken(legacyToken)},'BDT',now()+interval '1 day',2) returning id,owner_context`.execute(
  database.db,
);
const legacy = old.rows[0]!;
await sql`insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity) values(${fixture.organizationId},${legacy.id},${fixture.variantId},2)`.execute(
  database.db,
);
const receiptId = crypto.randomUUID();
await sql`insert into platform.idempotency_records(id,organization_id,principal_type,principal_id,operation_type,idempotency_key,request_fingerprint,status,safe_response,completed_at) values(${receiptId},${fixture.organizationId},'GUEST_CART',${legacy.id},'cart.add_line',${crypto.randomUUID()},'synthetic','SUCCEEDED','{}'::jsonb,now())`.execute(
  database.db,
);
const origin = 'https://localhost:3443';
const config = {
  ...parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: isolated.url,
    TEST_DATABASE_URL: isolated.url,
    BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
    AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    BETTER_AUTH_URL: origin,
    AUTH_TRUSTED_ORIGINS: origin,
    STOREFRONT_BASE_URL: origin,
    STOREFRONT_ORGANIZATION_CODE: fixture.code,
  }),
  nodeEnv: 'production' as const,
};
const app = Fastify({
  logger: false,
  https: {
    key: readFileSync('/tmp/maevelle-cart01a1/key.pem'),
    cert: readFileSync('/tmp/maevelle-cart01a1/cert.pem'),
  },
});
const mailbox: { text: string }[] = [];
const resolver = registerShopperAuthRoutes(app, config, database, async (m) => {
  mailbox.push(m);
});
registerCartRoutes(app, database, config, resolver);
registerOrderRoutes(
  app,
  database,
  {} as Parameters<typeof registerOrderRoutes>[2],
  config,
  resolver,
);
app.get('/', async (_req, reply) =>
  reply
    .type('text/html')
    .send(
      '<!doctype html><title>Isolated Cart security acceptance</title><p>Synthetic HTTPS fixture</p>',
    ),
);
let releaseLegacy: (() => void) | undefined;
app.get('/__fixture/held', async () => ({ held: !!releaseLegacy }));
app.post('/__fixture/release', async () => {
  releaseLegacy?.();
  releaseLegacy = undefined;
  return { released: true };
});
app.post('/__fixture/legacy', async (request, reply) => {
  if ((request.body as { hold?: boolean })?.hold)
    await new Promise<void>((resolve) => {
      releaseLegacy = resolve;
    });
  const slot = (request.body as { slot?: boolean })?.slot;
  reply.header(
    'set-cookie',
    `${slot ? '__Host-maevelle_cart_' + legacy.id.replaceAll('-', '') : 'maevelle_cart'}=${legacyToken}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
  return { issued: true };
});
app.post('/__fixture/cutover', async () => ({
  executed: (await runMigrations(database.db)).executed,
}));
app.get('/__fixture/retained', async () => {
  const rows = await sql<{
    version: string;
    quantity: string;
    credential_state: string;
    old_reader_matches: number;
    receipts: number;
  }>`select version::text,credential_state,(select quantity::text from cart.cart_lines where cart_id=c.id) quantity,(select count(*)::int from cart.carts where public_token_hash=${hashToken(legacyToken)}) old_reader_matches,(select count(*)::int from platform.idempotency_records where id=${receiptId}) receipts from cart.carts c where id=${legacy.id}`.execute(
    database.db,
  );
  return rows.rows[0];
});
app.post('/__fixture/retire', async (request) => {
  const selected = (request.body as { ownerContext: string }).ownerContext;
  const cookie = (request.headers.cookie ?? '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('__Host-maevelle_cart_'));
  if (!cookie) throw new Error('Fixture requires returned browser cookie');
  await retireGuestCartCredential(database.db, {
    token: cookie.slice(cookie.indexOf('=') + 1),
    organizationId: fixture.organizationId,
    ownerContext: selected,
  });
  return { retired: true };
});
app.post('/__fixture/suspend-b', async () => {
  await sql`update customers.customer_accounts set status='SUSPENDED' where organization_id=${fixture.organizationId} and user_id=(select id from iam.users where email='cart01a1-b@example.test')`.execute(
    database.db,
  );
  return { suspended: true };
});
app.post('/__fixture/expire-a', async () => {
  const rows = await sql<{
    key_hash: string;
    encrypted_value: Buffer;
  }>`select key_hash,encrypted_value from iam.auth_kv_store where encrypted_value is not null`.execute(
    database.db,
  );
  let count = 0;
  for (const row of rows.rows) {
    try {
      const value = JSON.parse(
        decryptSecret(row.encrypted_value.toString('utf8'), {
          id: 'v1',
          value: Buffer.from(config.authEncryptionKey, 'base64'),
        }),
      ) as { session?: { userId?: string }; user?: { email?: string } };
      if (value.session && value.user?.email === 'cart01a1-a@example.test') {
        await sql`update iam.auth_kv_store set expires_at=clock_timestamp()-interval '1 second' where key_hash=${row.key_hash}`.execute(
          database.db,
        );
        count++;
      }
    } catch {
      /* Non-session storage. */
    }
  }
  if (!count) throw new Error('No synthetic A session expired');
  return { expired: count };
});
const password = randomBytes(24).toString('base64url');
await app.ready();
for (const actor of ['a', 'b']) {
  const signup = await app.inject({
    method: 'POST',
    url: '/shopper-auth/sign-up/email',
    headers: { origin },
    payload: {
      name: `Synthetic ${actor}`,
      email: `cart01a1-${actor}@example.test`,
      password,
      callbackURL: origin,
    },
  });
  if (signup.statusCode !== 200) throw new Error('Synthetic signup failed: ' + signup.statusCode);
  const link = new URL(mailbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const verify = await app.inject({ method: 'GET', url: link.pathname + link.search });
  if (![200, 302].includes(verify.statusCode)) throw new Error('Synthetic verification failed');
}
writeFileSync(
  '/tmp/maevelle-cart01a1/fixture.json',
  JSON.stringify({
    ...fixture,
    databaseName: new URL(isolated.url).pathname.slice(1),
    origin,
    password,
    legacyContext: legacy.owner_context,
  }),
  { mode: 0o600 },
);
await app.listen({ host: '127.0.0.1', port: 3443 });
console.log(JSON.stringify({ ready: true, database: new URL(isolated.url).pathname.slice(1) }));
// Preserve synthetic database for inspection; no persistent/shared target is opened.
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app
      .close()
      .then(() => database.close())
      .then(() => process.exit(0));
  });
