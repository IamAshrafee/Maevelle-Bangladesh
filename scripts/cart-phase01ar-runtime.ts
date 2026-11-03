/** Local synthetic acceptance only. Never composed into buildApi. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import type FastifyFactory from '../apps/api/node_modules/fastify/fastify.js';
import { parseConfig } from '../packages/config/src/index.js';
import {
  isolatedCartDatabase,
  cartFixture,
} from '../packages/database/src/testing/cart-fixture.js';
import { runMigrations } from '../packages/database/src/migrate.js';
import { sql } from '../packages/database/src/index.js';
import { registerCartRoutes } from '../apps/api/src/routes/cart.js';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Fastify = require('fastify') as typeof FastifyFactory;
const isolated = await isolatedCartDatabase();
await runMigrations(isolated.database.db);
const fixture = await cartFixture(isolated.database);
const origin = 'https://localhost:3444';
const config = {
  ...parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: isolated.url,
    TEST_DATABASE_URL: isolated.url,
    BETTER_AUTH_SECRET: 'cart01ar-synthetic-browser-secret-32-characters',
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 65).toString('base64'),
    STOREFRONT_BASE_URL: origin,
    STOREFRONT_ORGANIZATION_CODE: fixture.code,
  }),
  nodeEnv: 'production' as const,
};
const app = Fastify({
  logger: false,
  https: {
    key: readFileSync('/tmp/maevelle-cart01ar/key.pem'),
    cert: readFileSync('/tmp/maevelle-cart01ar/cert.pem'),
  },
});
app.addHook('onSend', async (request, _reply, payload) => {
  if (request.headers['x-ar-delay'] === 'late') await setTimeout(500);
  return payload;
});
registerCartRoutes(app, isolated.database, config, async () => null);
app.get('/', async (_req, reply) =>
  reply
    .type('text/html')
    .send('<!doctype html><title>Cart 01A-R isolated protocol acceptance</title>'),
);
app.get('/__fixture/counts', async () => {
  const rows =
    await sql`select (select count(*)::int from cart.carts) carts,(select count(*)::int from cart.cart_lines) lines,(select count(*)::int from platform.idempotency_records where principal_type='GUEST_CART') receipts`.execute(
      isolated.database.db,
    );
  return rows.rows[0];
});
await app.listen({ host: '127.0.0.1', port: 3444 });
writeFileSync(
  '/tmp/maevelle-cart01ar/fixture.json',
  JSON.stringify({ origin, variantId: fixture.variantId }),
);
console.log('Isolated Cart 01A-R HTTPS runtime ready');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await isolated.close();
      process.exit(0);
    })();
  });
