import { afterAll, beforeAll, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { parseConfig } from '@maevelle/config';
import { sql } from '@maevelle/database';
import { runMigrations } from '@maevelle/database/migrate';
import { createGuestCart, getGuestCart, addGuestCartLine } from '@maevelle/database/cart';
import { cartFixture, isolatedCartDatabase } from '@maevelle/database/testing/cart';
import { registerShopperAuthRoutes } from './routes/shopper-auth.js';
import { registerCartRoutes } from './routes/cart.js';
import { registerOrderRoutes } from './routes/orders.js';
import type { CartShopperResolver } from './routes/cart-context.js';

let isolated: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let fixture: Awaited<ReturnType<typeof cartFixture>>;
const apps: FastifyInstance[] = [];
const origin = 'http://localhost:3000';
let config: ReturnType<typeof parseConfig>;
let app: FastifyInstance;
async function application(resolver: CartShopperResolver = async () => null) {
  const instance = Fastify();
  registerCartRoutes(instance, isolated.database, config, resolver);
  registerOrderRoutes(
    instance,
    isolated.database,
    {} as Parameters<typeof registerOrderRoutes>[2],
    config,
    resolver,
  );
  apps.push(instance);
  await instance.ready();
  return instance;
}
beforeAll(async () => {
  isolated = await isolatedCartDatabase();
  await runMigrations(isolated.database.db);
  fixture = await cartFixture(isolated.database);
  config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: isolated.url,
    BETTER_AUTH_URL: 'http://localhost:3002',
    AUTH_TRUSTED_ORIGINS: origin,
    TEST_DATABASE_URL: isolated.url,
    BETTER_AUTH_SECRET: 'synthetic-only-cart01a1-secret-32-characters',
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 65).toString('base64'),
    STOREFRONT_ORGANIZATION_CODE: fixture.code,
    STOREFRONT_BASE_URL: origin,
  });
  app = await application();
}, 30000);
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
  await isolated?.close();
});
async function guest() {
  const g = await createGuestCart(isolated.database.db, {
    organizationId: fixture.organizationId,
    currency: 'BDT',
  });
  return { ...g, cookie: `maevelle_cart_${g.cart.id.replaceAll('-', '')}=${g.token}` };
}
const headers = (cookie: string) => ({ cookie, origin, 'content-type': 'application/json' });
const read = (cookie: string, instance = app) =>
  instance.inject({ method: 'GET', url: '/storefront/v1/carts/current', headers: headers(cookie) });
it('rejects fixed bearer even when valid and never discloses or reissues it', async () => {
  const g = await guest();
  const result = await read(`maevelle_cart=${g.token}`);
  expect(result.statusCode).toBe(401);
  expect(result.json().data).toBeUndefined();
  expect(result.headers['set-cookie']).toBeUndefined();
  const before = await sql<{ count: number }>`select count(*)::int count from cart.carts`.execute(
    isolated.database.db,
  );
  const duplicates = await Promise.all(
    Array.from({ length: 4 }, () =>
      app.inject({
        method: 'POST',
        url: '/storefront/v1/carts',
        headers: headers(`maevelle_cart=${g.token}`),
        payload: {},
      }),
    ),
  );
  expect(
    duplicates.every((r) => r.statusCode === 401 && r.headers['set-cookie'] === undefined),
  ).toBe(true);
  const after = await sql<{ count: number }>`select count(*)::int count from cart.carts`.execute(
    isolated.database.db,
  );
  expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
});
it('binds exact slot name to cart and rejects wrong names / duplicates / mixed fixed-slot authorities', async () => {
  const a = await guest(),
    b = await guest();
  for (const cookie of [
    `maevelle_cart_${b.cart.id.replaceAll('-', '')}=${a.token}`,
    `${a.cookie}; ${a.cookie}`,
    `${a.cookie}; maevelle_cart=${b.token}`,
    `maevelle_cart_whatever=${a.token}`,
  ]) {
    expect((await read(cookie)).statusCode).toBe(401);
  }
  expect((await read(a.cookie)).statusCode).toBe(200);
});
it('Checkout cannot substitute guest authority for signed-in or failed identity', async () => {
  const g = await guest();
  const account = await application(
    async () =>
      ({
        organizationId: fixture.organizationId,
        accountId: crypto.randomUUID(),
        customerId: crypto.randomUUID(),
      }) as Awaited<ReturnType<CartShopperResolver>>,
  );
  for (const url of [
    '/storefront/v1/checkouts',
    '/storefront/v1/checkouts/current',
    '/storefront/v1/checkouts/current/payment-methods',
  ]) {
    const result = await account.inject({
      method: url.endsWith('checkouts') ? 'POST' : 'GET',
      url,
      headers: headers(g.cookie),
      ...(url.endsWith('checkouts') ? { payload: {} } : {}),
    });
    expect(result.statusCode).toBe(409);
    expect(result.json().error.code).toBe('ACCOUNT_CART_NOT_READY');
  }
  const failed = await application(async () => {
    throw new Error('private resolver outage');
  });
  const result = await failed.inject({
    method: 'POST',
    url: '/storefront/v1/checkouts',
    headers: headers(g.cookie),
    payload: {},
  });
  expect(result.statusCode).toBe(503);
  expect(result.body).not.toContain('private resolver outage');
});

it('invalid, expired, retired, forged, foreign and mixed new slots never disclose private items', async () => {
  const g = await guest();
  const db = isolated.database.db;
  await addGuestCartLine(db, {
    token: g.token,
    variantId: fixture.variantId,
    quantity: '2',
    expectedVersion: 1,
  });
  const current = await guest();
  const foreign = await cartFixture(isolated.database);
  const foreignGuest = await createGuestCart(db, {
    organizationId: foreign.organizationId,
    currency: 'BDT',
  });
  const foreignCookie = `maevelle_cart_${foreignGuest.cart.id.replaceAll('-', '')}=${foreignGuest.token}`;
  for (const cookie of [
    foreignCookie,
    `maevelle_cart_${g.cart.id.replaceAll('-', '')}=${'a'.repeat(43)}`,
    `maevelle_cart_${g.cart.id.replaceAll('-', '')}=forged`,
    `maevelle_cart=${g.token}`,
  ]) {
    const result = await read(cookie);
    expect(result.statusCode).toBe(401);
    expect(result.body).not.toContain('Synthetic public clip');
    expect(result.json().data).toBeUndefined();
  }
  const wrong = await app.inject({
    method: 'GET',
    url: '/storefront/v1/carts/current',
    headers: { ...headers(g.cookie), 'x-cart-context': current.cart.ownerContext },
  });
  expect(wrong.json().error.code).toBe('OWNER_CHANGED');
  await sql`update cart.carts set credential_state='RETIRED', public_token_hash='retired:' || public_token_hash where id=${g.cart.id}`.execute(
    db,
  );
  for (const cookie of [g.cookie, `${g.cookie}; ${current.cookie}`]) {
    const result = await read(cookie);
    expect(result.statusCode).toBe(401);
    expect(result.json().data).toBeUndefined();
  }
  await sql`update cart.carts set expires_at=clock_timestamp()-interval '1 second' where id=${current.cart.id}`.execute(
    db,
  );
  expect((await read(current.cookie)).statusCode).toBe(401);
});
it('Checkout accepts one scoped guest, refuses ambiguous authority and never crosses tenant', async () => {
  const a = await guest(),
    b = await guest();
  await addGuestCartLine(isolated.database.db, {
    token: a.token,
    variantId: fixture.variantId,
    quantity: '1',
    expectedVersion: 1,
  });
  for (const [cookie, code] of [
    [`${a.cookie}; ${b.cookie}`, 'CART_CONTEXT_REQUIRED'],
    [`maevelle_cart=${a.token}`, 'SESSION_EXPIRED'],
    [`${a.cookie}; maevelle-shopper.session_token=forged`, 'SESSION_EXPIRED'],
  ]) {
    const result = await app.inject({
      method: 'POST',
      url: '/storefront/v1/checkouts',
      headers: headers(cookie!),
      payload: {},
    });
    expect(result.json().error.code).toBe(code);
    expect(result.json().data).toBeUndefined();
  }
  const result = await app.inject({
    method: 'POST',
    url: '/storefront/v1/checkouts',
    headers: headers(a.cookie),
    payload: {},
  });
  expect(result.statusCode).toBe(201);
  expect(result.json().data.cart.id).toBe(a.cart.id);
  expect(result.headers['cache-control']).toBe('private, no-store');
});
it('all Checkout Cart-consuming verbs refuse accounts before validation or side effects', async () => {
  const account = await application(async () => ({
    organizationId: fixture.organizationId,
    accountId: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
  }));
  const g = await guest();
  for (const [method, path] of [
    ['POST', ''],
    ['GET', '/current'],
    ['PUT', '/current/contact'],
    ['PUT', '/current/address'],
    ['GET', '/current/payment-methods'],
    ['PUT', '/current/payment-method'],
    ['POST', '/current/refresh'],
    ['POST', '/current/place-order'],
  ] as const) {
    const r = await account.inject({
      method,
      url: '/storefront/v1/checkouts' + path,
      headers: headers(g.cookie),
      ...(method === 'GET' ? {} : { payload: {} }),
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('ACCOUNT_CART_NOT_READY');
  }
  expect((await getGuestCart(isolated.database.db, g.token)).version).toBe(1);
});
it('actual shopper A/B/logout/invalid-session/mapping-failure never attaches or substitutes guest authority', async () => {
  const real = Fastify();
  const mailbox: { text: string }[] = [];
  const resolver = registerShopperAuthRoutes(real, config, isolated.database, async (m) => {
    mailbox.push(m);
  });
  registerCartRoutes(real, isolated.database, config, resolver);
  registerOrderRoutes(
    real,
    isolated.database,
    {} as Parameters<typeof registerOrderRoutes>[2],
    config,
    resolver,
  );
  apps.push(real);
  await real.ready();
  const g = await guest();
  const identities: { cookie: string; userId: string }[] = [];
  for (let n = 0; n < 2; n++) {
    const email = `cart01a1-${crypto.randomUUID()}@example.test`,
      password = 'synthetic-secure-password-123';
    const signup = await real.inject({
      method: 'POST',
      url: '/shopper-auth/sign-up/email',
      headers: headers(''),
      payload: { name: 'Synthetic', email, password, callbackURL: origin + '/account' },
    });
    expect(signup.statusCode).toBe(200);
    const link = new URL(mailbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
    expect([200, 302]).toContain(
      (await real.inject({ method: 'GET', url: link.pathname + link.search })).statusCode,
    );
    const login = await real.inject({
      method: 'POST',
      url: '/shopper-auth/sign-in/email',
      headers: headers(''),
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    identities.push({ cookie, userId: login.json().user.id });
  }
  for (const identity of identities) {
    for (const [method, url] of [
      ['GET', '/storefront/v1/carts/current'],
      ['POST', '/storefront/v1/checkouts'],
    ] as const) {
      const r = await real.inject({
        method,
        url,
        headers: headers(`${g.cookie}; ${identity.cookie}`),
        ...(method === 'POST' ? { payload: {} } : {}),
      });
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('ACCOUNT_CART_NOT_READY');
    }
  }
  const [a, b] = identities;
  await real.inject({
    method: 'POST',
    url: '/shopper-auth/sign-out',
    headers: headers(a!.cookie),
    payload: {},
  });
  expect((await read(`${g.cookie}; ${a!.cookie}`, real)).statusCode).toBe(401);
  expect((await read(g.cookie, real)).statusCode).toBe(200);
  await sql`update customers.customer_accounts set status='SUSPENDED' where organization_id=${fixture.organizationId} and user_id=${b!.userId}`.execute(
    isolated.database.db,
  );
  const mapped = await read(`${g.cookie}; ${b!.cookie}`, real);
  expect(mapped.statusCode).toBe(503);
  expect(mapped.json().data).toBeUndefined();
  const rows = await sql<{
    owner_account_id: string | null;
    quantity: number;
  }>`select owner_account_id,(select count(*)::int from cart.cart_lines where cart_id=c.id) quantity from cart.carts c where id=${g.cart.id}`.execute(
    isolated.database.db,
  );
  expect(rows.rows[0]).toEqual({ owner_account_id: null, quantity: 0 });
});
