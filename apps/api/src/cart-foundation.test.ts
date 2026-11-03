import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { parseConfig, type RuntimeConfig } from '@maevelle/config';
import { createDatabase } from '@maevelle/database';
import { createLogger } from '@maevelle/observability';
import { runMigrations } from '@maevelle/database/migrate';
import { registerCartRoutes } from './routes/cart.js';
import { buildApi } from './app.js';
import { registerShopperAuthRoutes } from './routes/shopper-auth.js';
import { registerOrderRoutes } from './routes/orders.js';
import { cartFixture, isolatedCartDatabase } from '@maevelle/database/testing/cart';
import { createGuestCart } from '@maevelle/database/cart';
import { createCouponCode, createPromotion } from '@maevelle/database/promotions';
import type { GuestCartViewDto } from '@maevelle/contracts';
import type { CartShopperResolver } from './routes/cart-context.js';
import type { ShopperAuthEmail } from './auth/shopper-auth.js';

let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let url: string;
let db: ReturnType<typeof createDatabase>;
const origin = 'http://localhost:3001';
let cfg: RuntimeConfig;
let fixture: Awaited<ReturnType<typeof cartFixture>>;
let app: FastifyInstance;
const apps: FastifyInstance[] = [];
const mailbox: ShopperAuthEmail[] = [];
function configuration(code: string): RuntimeConfig {
  return parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: url,
    TEST_DATABASE_URL: url,
    BETTER_AUTH_SECRET: 'synthetic-cart01a-auth-secret-only-32-characters',
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 67).toString('base64'),
    STOREFRONT_ORGANIZATION_CODE: code,
    STOREFRONT_BASE_URL: origin,
    BETTER_AUTH_URL: 'http://localhost:3002',
    AUTH_TRUSTED_ORIGINS: origin,
  });
}
async function application(config = cfg, resolver?: CartShopperResolver) {
  const instance = Fastify({ logger: false });
  const shopper =
    resolver ??
    registerShopperAuthRoutes(instance, config, db, async (message) => {
      mailbox.push(message);
    });
  registerCartRoutes(instance, db, config, shopper);
  apps.push(instance);
  await instance.ready();
  return instance;
}
beforeAll(async () => {
  isolation = await isolatedCartDatabase();
  db = isolation.database;
  url = isolation.url;
  await runMigrations(db.db);
  fixture = await cartFixture(db);
  cfg = configuration(fixture.code);
  app = await application();
}, 30_000);
afterAll(async () => {
  await Promise.all(apps.map((instance) => instance.close()));
  await isolation?.close();
});
function cookie(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  return String(Array.isArray(value) ? value[0] : value).split(';')[0]!;
}
function data(response: { json(): { data: GuestCartViewDto } }): GuestCartViewDto {
  return response.json().data;
}
let ip = 1;
function headers(credential = '', context?: string) {
  return {
    origin,
    'content-type': 'application/json',
    ...(credential ? { cookie: credential } : {}),
    ...(context ? { 'x-cart-context': context } : {}),
  };
}
async function initialize(instance = app, credential = '', context?: string) {
  const response = await instance.inject({
    method: 'POST',
    url: '/storefront/v1/carts',
    remoteAddress: `127.1.0.${ip++}`,
    headers: headers(credential, context),
    payload: {},
  });
  expect([200, 201], response.body).toContain(response.statusCode);
  return response;
}
async function add(
  credential: string,
  current: GuestCartViewDto,
  quantity = '1',
  key?: string,
  instance = app,
) {
  return instance.inject({
    method: 'POST',
    url: '/storefront/v1/carts/current/lines',
    remoteAddress: `127.2.0.${ip++}`,
    headers: { ...headers(credential), 'idempotency-key': key ?? crypto.randomUUID() },
    payload: {
      variantId: fixture.variantId,
      quantity,
      version: current.version,
      ownerContext: current.ownerContext,
    },
  });
}
async function read(credential: string, context?: string, instance = app) {
  return instance.inject({
    method: 'GET',
    url: '/storefront/v1/carts/current',
    headers: headers(credential, context),
  });
}
it('protects variant replacement and replays the original receipt', async () => {
  const created = await initialize();
  const credential = cookie(created);
  const added = await add(credential, data(created));
  expect(added.statusCode).toBe(200);
  const current = data(added);
  const line = current.lines[0]!;
  const url = `/storefront/v1/carts/current/lines/${line.id}/variant`;
  const payload = {
    ownerContext: current.ownerContext,
    version: current.version,
    targetVariantId: line.variantId,
    quantity: '2',
  };
  const key = crypto.randomUUID();
  const replace = (body: typeof payload, requestHeaders: Record<string, string>) =>
    app.inject({
      method: 'PUT',
      url,
      remoteAddress: `127.3.0.${ip++}`,
      headers: requestHeaders,
      payload: body,
    });
  expect((await replace(payload, headers(credential))).statusCode).toBe(400);
  const other = await initialize();
  const otherCart = data(other);
  const foreign = await replace(
    { ...payload, ownerContext: otherCart.ownerContext, version: otherCart.version },
    { ...headers(cookie(other)), 'idempotency-key': key },
  );
  expect(foreign.statusCode).toBe(404);
  const authorized = { ...headers(credential), 'idempotency-key': key };
  const response = await replace(payload, authorized);
  expect(response.statusCode, response.body).toBe(200);
  expect(data(response).lines[0]).toMatchObject({ id: line.id, quantity: '2.000000' });
  const replay = await replace(payload, authorized);
  expect(replay.statusCode).toBe(200);
  expect(data(replay).outcome).toMatchObject({
    receiptId: data(response).outcome!.receiptId,
    replayed: true,
  });
  expect((await replace({ ...payload, quantity: '3' }, authorized)).statusCode).toBe(409);
});

describe('Cart API guest bootstrap and security with PostgreSQL', () => {
  it('S59 late competing initialization never overwrites acknowledged authority', async () => {
    const [a, b] = await Promise.all([initialize(), initialize()]);
    const ca = cookie(a),
      cb = cookie(b);
    expect(ca.split('=')[0]).not.toBe(cb.split('=')[0]);
    // A response is delivered first. Hold B Set-Cookie until A mutation is acknowledged.
    const added = await add(ca, data(a));
    expect(added.statusCode, added.body).toBe(200);
    // Deliver B late: cookie jar contains both credentials instead of replacing A.
    const jar = `${ca}; ${cb}`;
    const ambiguous = await read(jar);
    expect(ambiguous.statusCode).toBe(409);
    expect(ambiguous.json().error).toMatchObject({ code: 'CART_CONTEXT_REQUIRED' });
    expect(ambiguous.json().error.contexts).toEqual(
      expect.arrayContaining([data(a).ownerContext, data(b).ownerContext]),
    );
    const restored = await read(jar, data(a).ownerContext);
    expect(data(restored).lines[0]!.quantity).toBe('1.000000');
    expect(data(await read(jar, data(b).ownerContext)).lines).toHaveLength(0);
    expect(restored.headers['set-cookie']).toBeUndefined();
  });
  it('S59 two tab-equivalent clients can acknowledge both intents, with explicit safe reconciliation', async () => {
    const [a, b] = await Promise.all([initialize(), initialize()]);
    const ca = cookie(a),
      cb = cookie(b);
    const results = await Promise.all([add(ca, data(a), '1'), add(cb, data(b), '2')]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    const jar = `${ca}; ${cb}`;
    expect(data(await read(jar, data(a).ownerContext)).lines[0]!.quantity).toBe('1.000000');
    expect(data(await read(jar, data(b).ownerContext)).lines[0]!.quantity).toBe('2.000000');
    const refused = await app.inject({
      method: 'POST',
      url: '/storefront/v1/carts/current/lines',
      headers: headers(jar),
      payload: { variantId: fixture.variantId, quantity: '1', version: 1 },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.headers['set-cookie']).toBeUndefined();
  });
  it('S01/S59 initialization retries with cookie reuse authority without Set-Cookie', async () => {
    const first = await initialize();
    const retry = await initialize(app, cookie(first));
    expect(data(retry).id).toBe(data(first).id);
    expect(retry.headers['set-cookie']).toBeUndefined();
  });
  it('S04/S59 lost initialization response, rejected cookie and early add fail safely', async () => {
    const lost = await initialize(); // deliberately discard its credential
    const early = await add('', data(lost), '1', crypto.randomUUID());
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('SESSION_ESTABLISHMENT_REQUIRED');
    const next = await initialize();
    expect(data(next).id).not.toBe(data(lost).id);
    expect(data(await read(cookie(lost), data(lost).ownerContext)).lines).toHaveLength(0);
  });
  it('S03/S04 explicit replay returns committed outcome with fresh view after simulated lost response', async () => {
    const initial = await initialize();
    const key = crypto.randomUUID();
    const first = await add(cookie(initial), data(initial), '1', key);
    expect(first.statusCode, first.body).toBe(200);
    const retry = await add(cookie(initial), data(initial), '1', key);
    expect(data(retry).outcome).toMatchObject({
      receiptId: data(first).outcome!.receiptId,
      committedVersion: '2',
      replayed: true,
    });
    const mismatch = await add(cookie(initial), data(initial), '2', key);
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
  it('S02 retired unkeyed public mutations reject without changing intent', async () => {
    const init = await initialize();
    const request = {
      method: 'POST' as const,
      url: '/storefront/v1/carts/current/lines',
      headers: headers(cookie(init)),
      payload: { variantId: fixture.variantId, quantity: '1', version: 1 },
    };
    const [a, b] = await Promise.all([app.inject(request), app.inject(request)]);
    expect(a.statusCode, a.body).toBe(400);
    expect(b.statusCode, b.body).toBe(400);
    expect(a.json().error.code).toBe('INTENT_KEY_REQUIRED');
    expect(data(await read(cookie(init))).lines).toHaveLength(0);
  });
  it('S17 owner switch rejects old precondition even when new credential is valid', async () => {
    const a = await initialize(),
      b = await initialize();
    const rejected = await add(cookie(b), data(a));
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('OWNER_CHANGED');
    expect(data(await read(cookie(b))).lines).toHaveLength(0);
  });
  it('S36 public Cart ID/context alone and forged session tokens never authorize access', async () => {
    const a = await initialize();
    expect((await read(`maevelle_cart=${data(a).id}`)).statusCode).toBe(401);
    expect((await read('', data(a).ownerContext)).statusCode).toBe(404);
    expect((await read(`maevelle_cart=${'a'.repeat(43)}`)).statusCode).toBe(401);
  });
  it('S36 configured tenant/currency reject client substitution and foreign capability', async () => {
    const foreign = await cartFixture(db);
    const guest = await createGuestCart(db.db, {
      organizationId: foreign.organizationId,
      currency: 'BDT',
    });
    expect((await read(`maevelle_cart=${guest.token}`)).statusCode).toBe(401);
    for (const body of [
      { organizationId: foreign.organizationId, currency: 'BDT' },
      { organizationId: fixture.organizationId, currency: 'USD' },
    ]) {
      const rejected = await app.inject({
        method: 'POST',
        url: '/storefront/v1/carts',
        remoteAddress: `127.3.0.${ip++}`,
        headers: headers(),
        payload: body,
      });
      expect(rejected.statusCode).toBe(422);
      expect(rejected.headers['set-cookie']).toBeUndefined();
    }
  });
  it('S37 exact origin/Fetch Metadata and JSON protections do not trust forwarded headers', async () => {
    for (const originValue of [undefined, 'null', 'https://evil.test']) {
      const rejected = await app.inject({
        method: 'POST',
        url: '/storefront/v1/carts',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-host': 'evil.test',
          ...(originValue ? { origin: originValue } : {}),
        },
        payload: {},
      });
      expect(rejected.statusCode).toBe(403);
      expect(rejected.headers['cache-control']).toBe('private, no-store');
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/storefront/v1/carts',
          headers: { ...headers(), 'sec-fetch-site': 'cross-site' },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/storefront/v1/carts',
          headers: { origin, 'content-type': 'text/plain' },
          payload: '{}',
        })
      ).statusCode,
    ).toBe(415);
  });
  it('S12 unknown fields, malformed UUID/quantity, oversized/malformed JSON are bounded errors', async () => {
    const a = await initialize();
    for (const payload of [
      { variantId: fixture.variantId, quantity: '1', version: 1, price: '0.01' },
      { variantId: 'bad', quantity: '1', version: 1 },
      { variantId: fixture.variantId, quantity: '1e9', version: 1 },
    ]) {
      const result = await app.inject({
        method: 'POST',
        url: '/storefront/v1/carts/current/lines',
        headers: headers(cookie(a)),
        payload,
      });
      expect(result.statusCode, result.body).toBe(400);
    }
    const bad = await app.inject({
      method: 'POST',
      url: '/storefront/v1/carts',
      headers: headers(),
      payload: '{broken',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.headers['cache-control']).toBe('private, no-store');
    const huge = await app.inject({
      method: 'POST',
      url: '/storefront/v1/carts',
      headers: headers(),
      payload: JSON.stringify({ junk: 'x'.repeat(70_000) }),
    });
    expect(huge.statusCode).toBe(413);
    expect(data(await read(cookie(a))).lines).toHaveLength(0);
  });
  it('S38 two API instances share creation quotas and honor Retry-After', async () => {
    const second = await application();
    let response;
    for (let n = 0; n < 21; n++)
      response = await (n % 2 ? app : second).inject({
        method: 'POST',
        url: '/storefront/v1/carts',
        remoteAddress: '127.99.0.1',
        headers: headers(),
        payload: {},
      });
    expect(response!.statusCode).toBe(429);
    expect(response!.headers['retry-after']).toBe('60');
  });
  it('T05/T16 production cookies are host-only, HttpOnly and Secure; response bodies have no credential', async () => {
    const production = await application({ ...cfg, nodeEnv: 'production' }, async () => null);
    const result = await initialize(production);
    const set = String(result.headers['set-cookie']);
    expect(set).toMatch(/^__Host-maevelle_cart_/);
    expect(set).toContain('; HttpOnly;');
    expect(set).toContain('; Secure');
    expect(set).not.toContain('Domain=');
    const credential = cookie(result).split('=')[1]!;
    expect(result.body).not.toContain(credential);
    expect(result.headers['cache-control']).toBe('private, no-store');
  });
  it('D16 actual verified shopper identity never falls back to guest; logout/expired/renamed Admin cookie fail closed', async () => {
    const email = `cart-${crypto.randomUUID()}@example.test`;
    const password = 'synthetic-cart-password-123456';
    const signup = await app.inject({
      method: 'POST',
      url: '/shopper-auth/sign-up/email',
      headers: headers(),
      payload: { name: 'Synthetic', email, password, callbackURL: `${origin}/account` },
    });
    expect(signup.statusCode, signup.body).toBe(200);
    const link = new URL(mailbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
    const verify = await app.inject({ method: 'GET', url: link.pathname + link.search });
    expect([200, 302]).toContain(verify.statusCode);
    const login = await app.inject({
      method: 'POST',
      url: '/shopper-auth/sign-in/email',
      headers: headers(),
      payload: { email, password },
    });
    expect(login.statusCode, login.body).toBe(200);
    const shopperCookie = cookie(login);
    const guest = await initialize();
    const combined = `${cookie(guest)}; ${shopperCookie}`;
    const rejected = await add(combined, data(guest));
    expect(rejected.statusCode, rejected.body).toBe(409);
    expect(rejected.json().error.code).toBe('ACCOUNT_CART_NOT_READY');
    expect(data(await read(cookie(guest))).lines).toHaveLength(0);
    await app.inject({
      method: 'POST',
      url: '/shopper-auth/sign-out',
      headers: headers(shopperCookie),
      payload: {},
    });
    const expired = await read(combined);
    expect(expired.statusCode).toBe(401);
    expect(
      (await read(`${cookie(guest)}; maevelle-shopper.session_token=renamed-admin-or-invalid`))
        .statusCode,
    ).toBe(401);
  });
  it('D16 auth lookup and protection-store outages reject rather than creating anonymous authority', async () => {
    const failed = await application(cfg, async () => {
      throw new Error('Synthetic auth storage unavailable');
    });
    const result = await failed.inject({
      method: 'POST',
      url: '/storefront/v1/carts',
      remoteAddress: `127.4.0.${ip++}`,
      headers: headers(),
      payload: {},
    });
    expect(result.statusCode).toBe(503);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(result.body).not.toContain('Synthetic auth storage');
  });
  it('D16 closed protection-store connection fails safely before credential issuance', async () => {
    const closed = createDatabase({ connectionString: url });
    await closed.ping();
    await closed.close();
    const instance = Fastify({ logger: false });
    registerCartRoutes(instance, closed, cfg, async () => null);
    apps.push(instance);
    await instance.ready();
    const response = await instance.inject({
      method: 'POST',
      url: '/storefront/v1/carts',
      headers: headers(),
      payload: {},
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['retry-after']).toBe('2');
  });
  it('legacy Checkout creation accepts one new guest slot without altering Checkout behavior', async () => {
    const compatibility = Fastify({ logger: false });
    registerOrderRoutes(
      compatibility,
      db,
      {} as Parameters<typeof registerOrderRoutes>[2],
      cfg,
      async () => null,
    );
    apps.push(compatibility);
    await compatibility.ready();
    const init = await initialize();
    const added = await add(cookie(init), data(init));
    expect(added.statusCode).toBe(200);
    const checkout = await compatibility.inject({
      method: 'POST',
      url: '/storefront/v1/checkouts',
      headers: headers(cookie(init)),
      payload: {},
    });
    expect(checkout.statusCode, checkout.body).toBe(201);
    expect(checkout.json().data.cart.id).toBe(data(init).id);
  });
});

it('AR09 Clear public contract requires key/context/revision and returns replayable atomic outcome', async () => {
  const g = await initialize(),
    added = await add(cookie(g), data(g));
  const key = crypto.randomUUID();
  const request = {
    method: 'DELETE' as const,
    url: '/storefront/v1/carts/current',
    headers: { ...headers(cookie(g), data(g).ownerContext), 'idempotency-key': key },
    payload: { version: data(added).version, ownerContext: data(g).ownerContext },
  };
  const first = await app.inject(request),
    replay = await app.inject(request);
  expect(first.statusCode, first.body).toBe(200);
  expect(data(first).lines).toEqual([]);
  expect(data(first).outcome).toMatchObject({ operation: 'clear', replayed: false });
  expect(data(replay).outcome).toMatchObject({
    receiptId: data(first).outcome!.receiptId,
    replayed: true,
  });
  const stale = await app.inject({
    ...request,
    headers: { ...request.headers, 'idempotency-key': crypto.randomUUID() },
  });
  expect(stale.json().error.code).toBe('STALE_VERSION');
  const absent = await app.inject({
    ...request,
    headers: headers(cookie(g), data(g).ownerContext),
  });
  expect(absent.json().error.code).toBe('INTENT_KEY_REQUIRED');
  const noOwner = await app.inject({
    ...request,
    headers: { ...headers(cookie(g)), 'idempotency-key': crypto.randomUUID() },
    payload: { version: data(first).version },
  });
  expect(noOwner.json().error.code).toBe('OWNER_CONTEXT_REQUIRED');
});
it('AR10 explicit session recovery expires cookies without adopting authority or deleting cart data', async () => {
  const g = await initialize(),
    added = await add(cookie(g), data(g));
  const recovered = await app.inject({
    method: 'DELETE',
    url: '/storefront/v1/carts/session',
    headers: headers(`${cookie(g)}; maevelle_cart=unproven`),
    payload: {},
  });
  expect(recovered.statusCode, recovered.body).toBe(200);
  expect(recovered.json().data).toEqual({ sessionForgotten: true });
  const removed = recovered.headers['set-cookie'] as string[];
  expect(removed).toHaveLength(2);
  expect(removed.every((c) => c.includes('Max-Age=0') && c.includes('HttpOnly'))).toBe(true);
  expect(recovered.body).not.toContain(cookie(g).split('=')[1]!);
  expect(data(await read(cookie(g))).version).toBe(data(added).version);
  expect(data(await read(cookie(g))).lines).toHaveLength(1);
  const next = await initialize();
  expect(data(next).id).not.toBe(data(g).id);
  expect(recovered.headers['cache-control']).toBe('private, no-store');
});
it('AR11 session recovery keeps exact origin, JSON and field protections and handles absent cookies', async () => {
  for (const [originValue, status] of [
    ['https://evil.test', 403],
    [origin, 200],
  ] as const) {
    const response = await app.inject({
      method: 'DELETE',
      url: '/storefront/v1/carts/session',
      headers: { origin: originValue, 'content-type': 'application/json' },
      payload: {},
    });
    expect(response.statusCode).toBe(status);
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  const rejected = await app.inject({
    method: 'DELETE',
    url: '/storefront/v1/carts/session',
    headers: headers(),
    payload: { cartId: crypto.randomUUID() },
  });
  expect(rejected.statusCode).toBe(400);
});
it('AR12 malformed selected context never silently falls back to the only cookie', async () => {
  const g = await initialize();
  const response = await read(cookie(g), 'not-a-context');
  expect(response.statusCode).toBe(400);
  expect(response.json().error.code).toBe('INVALID_REQUEST');
  expect(response.json().data).toBeUndefined();
});

it('AR13 malformed owned cookie names can be forgotten explicitly, with bounded response headers', async () => {
  const recovery = await app.inject({
    method: 'DELETE',
    url: '/storefront/v1/carts/session',
    headers: headers('maevelle_cart_whatever=forged'),
    payload: {},
  });
  expect(recovery.statusCode).toBe(200);
  expect(String(recovery.headers['set-cookie'])).toContain('maevelle_cart_whatever=;');
  const tooMany = Array.from({ length: 34 }, (_, i) => `maevelle_cart_${i}=forged`).join('; ');
  const limit = await app.inject({
    method: 'DELETE',
    url: '/storefront/v1/carts/session',
    headers: headers(tooMany),
    payload: {},
  });
  expect(limit.json().error.code).toBe('CART_CONTEXT_LIMIT');
  expect(limit.headers['set-cookie']).toBeUndefined();
});

it('C03 coupon selection racing Clear has one revision winner and one replayable receipt', async () => {
  const promotion = await createPromotion(db.db, {
    organizationId: fixture.organizationId,
    actorId: fixture.actorId,
    name: 'Clear race',
    promotionType: 'COUPON',
    benefitType: 'PERCENTAGE_DISCOUNT',
    benefitValue: '10',
    combinability: 'EXCLUSIVE',
  });
  const couponCode = 'CLEAR-RACE';
  await createCouponCode(db.db, {
    organizationId: fixture.organizationId,
    actorId: fixture.actorId,
    promotionId: promotion.id,
    code: couponCode,
  });
  const guest = await initialize();
  const current = data(await add(cookie(guest), data(guest)));
  const precondition = { version: current.version, ownerContext: current.ownerContext };
  const clear = () =>
    app.inject({
      method: 'DELETE',
      url: '/storefront/v1/carts/current',
      headers: { ...headers(cookie(guest)), 'idempotency-key': clearKey },
      payload: precondition,
    });
  const select = () =>
    app.inject({
      method: 'POST',
      url: '/storefront/v1/carts/current/coupons',
      headers: { ...headers(cookie(guest)), 'idempotency-key': selectKey },
      payload: { ...precondition, couponCode },
    });
  const clearKey = crypto.randomUUID();
  const selectKey = crypto.randomUUID();
  const responses = await Promise.all([clear(), select()]);
  expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
  expect(responses.find((response) => response.statusCode === 409)?.json().error.code).toBe(
    'STALE_VERSION',
  );
  const clearWon = responses[0].statusCode === 200;
  const winner = data(responses[clearWon ? 0 : 1]);
  const projection = data(await read(cookie(guest)));
  expect(projection.version).toBe(current.version + 1);
  expect(projection.lines).toHaveLength(clearWon ? 0 : 1);
  expect(projection.appliedCoupons).toHaveLength(clearWon ? 0 : 1);
  const replay = await (clearWon ? clear() : select());
  expect(replay.statusCode).toBe(200);
  expect(data(replay).outcome).toMatchObject({
    receiptId: winner.outcome?.receiptId,
    committedVersion: winner.outcome?.committedVersion,
    replayed: true,
  });
});

it('C05 a valid guest cannot change a foreign line or submit malformed coupon and quantity inputs', async () => {
  const foreign = await initialize();
  const foreignView = data(await add(cookie(foreign), data(foreign)));
  const caller = await initialize();
  const callerView = data(caller);
  const callerHeaders = { ...headers(cookie(caller)), 'idempotency-key': crypto.randomUUID() };
  const payload = { version: callerView.version, ownerContext: callerView.ownerContext };
  const foreignLine = foreignView.lines[0]!.id;
  const url = '/storefront/v1/carts/current';
  for (const method of ['PATCH', 'DELETE'] as const) {
    const response = await app.inject({
      method,
      url: `${url}/lines/${foreignLine}`,
      headers: callerHeaders,
      payload: method === 'PATCH' ? { ...payload, quantity: '2' } : payload,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  }
  for (const quantity of ['-1', '1.5', '999999999999999999999999']) {
    const response = await add(cookie(caller), callerView, quantity);
    expect(response.statusCode).toBe(400);
  }
  const badCoupon = await app.inject({
    method: 'POST',
    url: `${url}/coupons`,
    headers: callerHeaders,
    payload: { ...payload, couponCode: '<script>' },
  });
  expect(badCoupon.statusCode).toBe(400);
  expect(data(await read(cookie(caller))).version).toBe(callerView.version);
  expect(data(await read(cookie(foreign))).version).toBe(foreignView.version);
});

it('C05 the assembled API rejects malformed JSON as a client error without backoff', async () => {
  const assembled = buildApi({ database: db, config: cfg, logger: false });
  apps.push(assembled);
  const response = await assembled.inject({
    method: 'POST',
    url: '/storefront/v1/carts',
    headers: headers(),
    payload: '{malformed-cart-input',
  });
  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  expect(response.headers['retry-after']).toBeUndefined();
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.body).not.toContain('malformed-cart-input');
});

it('C05 assembled API logs redact Cart coupon paths and credentials', async () => {
  const logs: string[] = [];
  const logger = createLogger(
    { component: 'api', level: 'info' },
    {
      write(line: string) {
        logs.push(line);
      },
    },
  );
  const assembled = buildApi({ database: db, config: cfg, logger });
  apps.push(assembled);
  const guest = await initialize(assembled);
  const view = data(guest);
  const canary = 'C01-PRIVATE-COUPON-CANARY';
  const rejected = await assembled.inject({
    method: 'DELETE',
    url: `/storefront/v1/carts/current/coupons/${canary}`,
    headers: { ...headers(cookie(guest)), 'idempotency-key': crypto.randomUUID() },
    payload: { ownerContext: view.ownerContext, version: view.version },
  });
  expect(rejected.statusCode).toBe(404);
  const output = logs.join('');
  expect(output).toContain('Cart request rejected');
  expect(output).toContain('request completed');
  expect(output.includes(canary)).toBe(false);
  expect(output.includes(cookie(guest).split('=')[1]!)).toBe(false);
});
