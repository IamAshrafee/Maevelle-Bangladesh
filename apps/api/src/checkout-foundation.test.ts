import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { parseConfig, type RuntimeConfig } from '@maevelle/config';
import { sql } from '@maevelle/database';
import { runMigrations } from '@maevelle/database/migrate';
import { cartFixture, isolatedCartDatabase } from '@maevelle/database/testing/cart';
import {
  createGuestCart,
  addGuestCartLine,
  getGuestCart,
  establishAccountCart,
  getAccountCart,
  addCartLine,
} from '@maevelle/database/cart';
import {
  createCheckoutDraft,
  createCheckoutGuestSession,
  getCheckoutDraft,
  lockCheckoutAuthority,
  type CheckoutAuthority,
} from '@maevelle/database/checkout';
import {
  setShopperStorageValue,
  revokeShopperStorageValue,
  lockShopperSession,
} from '@maevelle/database/shopper-session-fence';
import type { CheckoutDraftDto, CreateCheckoutDraftDto } from '@maevelle/contracts';
import { registerCheckoutRoutes } from './routes/checkout.js';
import { registerShopperAuthRoutes } from './routes/shopper-auth.js';
import { registerOrderRoutes } from './routes/orders.js';
import { checkoutGuestCookieName } from './routes/checkout-context.js';
import type { ShopperAuthEmail } from './auth/shopper-auth.js';

let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let f: Awaited<ReturnType<typeof cartFixture>>;
let config: RuntimeConfig;
let app: FastifyInstance;
const apps: FastifyInstance[] = [];
const mailbox: ShopperAuthEmail[] = [];
let observedProof: Extract<CheckoutAuthority, { kind: 'ACCOUNT' }> | undefined;
const origin = 'http://localhost:3000';
const key = () => crypto.randomUUID();
const base = '/storefront/v1/checkouts';
type Guest = { cookie: string; id: string };
const db = () => isolation.database.db;
const post = (url: string, payload: object, headers: Record<string, string> = {}, server = app) =>
  server.inject({
    method: 'POST',
    url,
    payload,
    headers: { origin, 'content-type': 'application/json', 'idempotency-key': key(), ...headers },
  });
const guestHeaders = (guest: Guest) => ({ cookie: guest.cookie, 'x-checkout-context': guest.id });
const source = () => ({ kind: 'BUY_NOW', variantId: f.variantId, quantity: '1' });
async function application(cfg = config) {
  const server = Fastify({ logger: false });
  const resolve = registerShopperAuthRoutes(server, cfg, isolation.database, async (m) => {
    mailbox.push(m);
  });
  registerCheckoutRoutes(server, isolation.database, cfg, resolve);
  registerOrderRoutes(
    server,
    isolation.database,
    {} as Parameters<typeof registerOrderRoutes>[2],
    cfg,
    resolve,
  );
  server.get('/test-checkout-proof', async (request) => {
    const p = await resolve(request, true);
    observedProof = { ...p!, kind: 'ACCOUNT', sessionKeyHash: p!.sessionKeyHash! };
    return { ok: true };
  });
  apps.push(server);
  await server.ready();
  return { server, resolve };
}
async function guest(server = app): Promise<Guest> {
  const response = await post('/storefront/v1/checkout/guest-sessions', {}, {}, server);
  expect(response.statusCode, response.body).toBe(201);
  return {
    id: response.json().data.id,
    cookie: String(response.headers['set-cookie']).split(';')[0]!,
  };
}
async function draft(g: Guest, headers: Record<string, string> = {}) {
  return post(base, { source: source() }, { ...guestHeaders(g), ...headers });
}
async function account() {
  const email = `checkout-${key()}@example.test`,
    password = 'synthetic-long-password-123';
  const signup = await post('/shopper-auth/sign-up/email', {
    email,
    password,
    name: 'Synthetic shopper',
  });
  expect(signup.statusCode, signup.body).toBe(200);
  const url = new URL(mailbox.find((m) => m.to === email)!.text.match(/http[^\s]+/)![0]);
  const verify = await app.inject({ method: 'GET', url: url.pathname + url.search });
  expect([200, 302]).toContain(verify.statusCode);
  const login = await post('/shopper-auth/sign-in/email', { email, password });
  expect(login.statusCode, login.body).toBe(200);
  const cookies = login.headers['set-cookie'];
  const cookie = (Array.isArray(cookies) ? cookies : [cookies])
    .map((v) => String(v).split(';')[0])
    .find((v) => v?.includes('session_token'))!;
  const state = await app.inject({
    method: 'GET',
    url: '/storefront/v1/shopper/session',
    headers: { cookie },
  });
  expect(state.statusCode, state.body).toBe(200);
  return { cookie, 'x-shopper-partition': state.json().data.partition as string };
}
function signal() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((r) => {
      resolve = r;
    }),
    resolve: () => resolve(),
  };
}

describe('Checkout Phase 01A on isolated PostgreSQL', () => {
  beforeAll(async () => {
    isolation = await isolatedCartDatabase();
    await runMigrations(db());
    f = await cartFixture(isolation.database);
    config = parseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: isolation.url,
      TEST_DATABASE_URL: isolation.url,
      BETTER_AUTH_SECRET: 'synthetic-checkout-only-secret-32-characters-long',
      AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'),
      STOREFRONT_ORGANIZATION_CODE: f.code,
      STOREFRONT_BASE_URL: origin,
      BETTER_AUTH_URL: 'http://localhost:3002',
      CHECKOUT_DRAFTS_ENABLED: 'true',
    });
    const result = await application();
    app = result.server;
  }, 60000);
  afterAll(async () => {
    for (const server of apps) await server.close();
    if (isolation) await isolation.close();
  });

  it('creates, restores and edits independent Buy Now with no commercial side effects', async () => {
    const bag = await createGuestCart(db(), { organizationId: f.organizationId, currency: 'BDT' });
    const before = await getGuestCart(db(), bag.token);
    const g = await guest();
    const result = await draft(g);
    expect(result.statusCode, result.body).toBe(201);
    const view: CheckoutDraftDto = result.json().data;
    expect(view).toMatchObject({
      revision: '1',
      ownerKind: 'GUEST',
      purchaseAvailable: false,
      source: { kind: 'BUY_NOW' },
    });
    expect(view.lines[0]).toMatchObject({
      variantId: f.variantId,
      quantity: '1',
      sourceCartLineId: null,
    });
    expect(JSON.stringify(view)).not.toMatch(/token|price|payment|customerId|sessionKeyHash/);
    const read = await app.inject({
      method: 'GET',
      url: `${base}/${view.id}`,
      headers: guestHeaders(g),
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.headers['cache-control']).toBe('private, no-store');
    const update = await app.inject({
      method: 'PATCH',
      url: `${base}/${view.id}`,
      headers: {
        origin,
        'content-type': 'application/json',
        'idempotency-key': key(),
        ...guestHeaders(g),
      },
      payload: { revision: '1', source: { ...source(), quantity: '2' } },
    });
    expect(update.statusCode, update.body).toBe(200);
    expect(update.json().data.revision).toBe('2');
    expect(await getGuestCart(db(), bag.token)).toMatchObject({
      id: before.id,
      version: before.version,
      lines: before.lines,
      appliedCoupons: before.appliedCoupons,
    });
    const effects = await sql<{
      orders: string;
      payments: string;
      reservations: string;
      promotions: string;
      conversions: string;
    }>`
      select (select count(*) from orders.orders)::text orders,(select count(*) from payments.payment_intents)::text payments,
        (select count(*) from inventory.inventory_reservations)::text reservations,(select count(*) from promotions.promotion_usage)::text promotions,
        (select count(*) from platform.outbox_events where event_type in ('orders.order.placed','payments.payment_intent.created'))::text conversions`.execute(
      db(),
    );
    expect(effects.rows[0]).toEqual({
      orders: '0',
      payments: '0',
      reservations: '0',
      promotions: '0',
      conversions: '0',
    });
  });
  it('makes concurrent same-key initiation canonical and rejects changed payloads', async () => {
    const g = await guest(),
      intent = key();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => draft(g, { 'idempotency-key': intent })),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(6).fill(201));
    expect(new Set(results.map((r) => r.json().data.id)).size).toBe(1);
    const changed = await post(
      base,
      { source: { ...source(), quantity: '2' } },
      { ...guestHeaders(g), 'idempotency-key': intent },
    );
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    // Lost response recovery can use another API instance and the identical intent.
    const other = await application();
    const recovered = await post(
      base,
      { source: source() },
      { ...guestHeaders(g), 'idempotency-key': intent },
      other.server,
    );
    expect(recovered.json().data.id).toBe(results[0]!.json().data.id);
  });
  it('denies another guest, UUID-only access, duplicate cookies, wrong tenant and revoked authority', async () => {
    const g = await guest(),
      other = await guest();
    const created = await draft(g);
    const id = created.json().data.id;
    for (const headers of [
      {},
      guestHeaders(other),
      { ...guestHeaders(g), cookie: `${g.cookie}; ${g.cookie}` },
    ]) {
      const read = await app.inject({ method: 'GET', url: `${base}/${id}`, headers });
      expect(read.statusCode).toBeGreaterThanOrEqual(400);
    }
    const second = await cartFixture(isolation.database);
    const foreign = await application({ ...config, storefrontOrganizationCode: second.code });
    expect(
      (
        await foreign.server.inject({
          method: 'GET',
          url: `${base}/${id}`,
          headers: guestHeaders(g),
        })
      ).statusCode,
    ).toBe(401);
    const revoked = await app.inject({
      method: 'DELETE',
      url: `/storefront/v1/checkout/guest-sessions/${g.id}`,
      headers: { origin, 'content-type': 'application/json', ...guestHeaders(g) },
      payload: {},
    });
    expect(revoked.statusCode, revoked.body).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: `${base}/${id}`, headers: guestHeaders(g) }))
        .statusCode,
    ).toBe(401);
  });
  it('snapshots the complete authorized Cart without mutation and rejects stale/empty sources', async () => {
    const cart = await createGuestCart(db(), { organizationId: f.organizationId, currency: 'BDT' });
    const full = await addGuestCartLine(db(), {
      token: cart.token,
      expectedVersion: cart.cart.version,
      idempotencyKey: key(),
      variantId: f.variantId,
      quantity: '2',
    });
    const g = await guest();
    const headers = {
      ...guestHeaders(g),
      cookie: `${g.cookie}; maevelle_cart_${cart.cart.id.replaceAll('-', '')}=${cart.token}`,
      'x-cart-context': cart.cart.ownerContext,
    };
    const request = {
      source: { kind: 'CART', cartId: full.id, cartRevision: full.intentRevision },
    };
    const initiation = key();
    const created = await post(base, request, { ...headers, 'idempotency-key': initiation });
    expect(created.statusCode, created.body).toBe(201);
    const restored = await post(base, request, {
      ...guestHeaders(g),
      'idempotency-key': initiation,
    });
    expect(restored.statusCode, restored.body).toBe(201);
    expect(restored.json().data.id).toBe(created.json().data.id);
    expect(created.json().data.lines[0].sourceCartLineId).toBe(full.lines[0]!.id);
    expect(await getGuestCart(db(), cart.token)).toMatchObject({
      id: full.id,
      version: full.version,
      lines: full.lines,
      appliedCoupons: full.appliedCoupons,
    });
    expect(
      (await post(base, { source: { ...request.source, cartRevision: '1' } }, headers)).statusCode,
    ).toBe(409);
    const empty = await createGuestCart(db(), {
      organizationId: f.organizationId,
      currency: 'BDT',
    });
    const emptyHeaders = {
      ...guestHeaders(g),
      cookie: `${g.cookie}; maevelle_cart_${empty.cart.id.replaceAll('-', '')}=${empty.token}`,
      'x-cart-context': empty.cart.ownerContext,
    };
    expect(
      (
        await post(
          base,
          {
            source: {
              kind: 'CART',
              cartId: empty.cart.id,
              cartRevision: empty.cart.intentRevision,
            },
          },
          emptyHeaders,
        )
      ).statusCode,
    ).toBe(422);
  });
  it('rejects unpublished variants, extra authority/price fields, coercion, foreign Origin and huge payloads', async () => {
    const g = await guest();
    for (const input of [
      { source: { ...source(), price: '1' } },
      { source: source(), ownerId: key() },
      { source: { ...source(), quantity: 1 } },
      { source: { ...source(), quantity: '10000000000' } },
      { source: { kind: 'CART', cartId: key(), cartRevision: 1 } },
    ])
      expect((await post(base, input, guestHeaders(g))).statusCode).toBe(400);
    expect(
      (
        await post(
          base,
          { source: source() },
          { ...guestHeaders(g), origin: 'https://evil.example' },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await post(base, { source: { ...source(), quantity: '1'.repeat(10000) } }, guestHeaders(g)))
        .statusCode,
    ).toBe(413);
    await sql`update catalog.products set publication_status='UNPUBLISHED',published_at=null where id=${f.productId}`.execute(
      db(),
    );
    expect((await draft(g)).statusCode).toBe(422);
    await sql`update catalog.products set publication_status='PUBLISHED',published_at=clock_timestamp() where id=${f.productId}`.execute(
      db(),
    );
  });
  it('reports expiry and stale revisions truthfully and bounds concurrent active drafts', async () => {
    const g = await guest();
    const result = await draft(g);
    const id = result.json().data.id;
    const change = (revision: string) =>
      app.inject({
        method: 'PATCH',
        url: `${base}/${id}`,
        headers: {
          origin,
          'content-type': 'application/json',
          'idempotency-key': key(),
          ...guestHeaders(g),
        },
        payload: { revision, action: 'ABANDON' },
      });
    expect((await change('99')).statusCode).toBe(409);
    await sql`update orders.checkout_drafts set expires_at=clock_timestamp()-interval '1 second' where id=${id}`.execute(
      db(),
    );
    expect(
      (await app.inject({ method: 'GET', url: `${base}/${id}`, headers: guestHeaders(g) })).json()
        .data.status,
    ).toBe('EXPIRED');
    expect((await change('1')).statusCode).toBe(410);
    const context = { organizationId: f.organizationId, currency: 'BDT' };
    const raw = await createCheckoutGuestSession(db(), context);
    const owner: CheckoutAuthority = {
      kind: 'GUEST',
      organizationId: f.organizationId,
      sessionId: raw.session.id,
      token: raw.token,
    };
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        createCheckoutDraft(
          db(),
          context,
          owner,
          { source: source() as CreateCheckoutDraftDto['source'] },
          key(),
        ),
      ),
    );
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(8);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(2);
  });
  it('supports real shopper sessions, account isolation, explicit adoption and logout', async () => {
    const a = await account(),
      b = await account();
    const g = await guest();
    const created = await draft(g);
    const id = created.json().data.id;
    const headers = {
      ...a,
      'x-checkout-context': g.id,
      cookie: `${a.cookie}; ${g.cookie}`,
      'idempotency-key': key(),
    };
    const simultaneous = await Promise.all([
      post(`${base}/${id}/adoptions`, { revision: '1' }, headers),
      post(`${base}/${id}/adoptions`, { revision: '1' }, headers),
    ]);
    expect(simultaneous.map((r) => r.statusCode)).toEqual([200, 200]);
    const adopted = simultaneous[0]!;
    expect(adopted.statusCode, adopted.body).toBe(200);
    expect(adopted.json().data.ownerKind).toBe('ACCOUNT');
    expect((await post(`${base}/${id}/adoptions`, { revision: '1' }, headers)).statusCode).toBe(
      200,
    );
    expect(
      (await app.inject({ method: 'GET', url: `${base}/${id}`, headers: guestHeaders(g) }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${base}/${id}`, headers: b })).statusCode).toBe(
      404,
    );
    const own = await post(base, { source: source() }, a);
    expect(own.statusCode, own.body).toBe(201);
    const read = await app.inject({ method: 'GET', url: `${base}/${id}`, headers: a });
    expect(read.statusCode).toBe(200);
    const logout = await post('/shopper-auth/sign-out', {}, a);
    expect(logout.statusCode, logout.body).toBe(200);
    expect((await app.inject({ method: 'GET', url: `${base}/${id}`, headers: a })).statusCode).toBe(
      401,
    );
  });
  it('serializes authority revocation against in-flight transactions and forbids stale refresh resurrection', async () => {
    const headers = await account();
    await app.inject({ method: 'GET', url: '/test-checkout-proof', headers });
    const owner = observedProof!;
    const created = await post(base, { source: source() }, headers);
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().data.id;
    const live = await sql<{
      encrypted_value: Buffer;
      expires_at: Date;
    }>`select encrypted_value,expires_at from iam.auth_kv_store where key_hash=${owner.sessionKeyHash}`.execute(
      db(),
    );
    const locked = signal(),
      release = signal();
    let revoked = false;
    const inFlight = db()
      .transaction()
      .execute(async (tx) => {
        await lockCheckoutAuthority(tx, owner);
        locked.resolve();
        await release.promise;
      });
    await locked.promise;
    const revocation = revokeShopperStorageValue(db(), owner.sessionKeyHash).then(() => {
      revoked = true;
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(revoked).toBe(false);
    release.resolve();
    await Promise.all([inFlight, revocation]);
    await expect(getCheckoutDraft(db(), owner, id)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    await setShopperStorageValue(
      db(),
      owner.sessionKeyHash,
      live.rows[0]!.encrypted_value,
      live.rows[0]!.expires_at,
    );
    expect(
      (
        await sql`select key_hash from iam.auth_kv_store where key_hash=${owner.sessionKeyHash}`.execute(
          db(),
        )
      ).rows,
    ).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `${base}/${id}`, headers })).statusCode).toBe(
      401,
    );
  });
  it('adopts Cart intent without merging Bags and requires an explicit owned-Cart refresh', async () => {
    const headers = await account();
    await app.inject({ method: 'GET', url: '/test-checkout-proof', headers });
    const owner = observedProof!,
      cartOwner = { ...owner, currency: 'BDT' };
    const accountBag = await establishAccountCart(db(), cartOwner);
    const accountFull = await addCartLine(db(), {
      account: cartOwner,
      expectedVersion: accountBag.version,
      ownerContext: accountBag.ownerContext,
      idempotencyKey: key(),
      variantId: f.variantId,
      quantity: '1',
    });
    const bag = await createGuestCart(db(), { organizationId: f.organizationId, currency: 'BDT' });
    const full = await addGuestCartLine(db(), {
      token: bag.token,
      expectedVersion: bag.cart.version,
      idempotencyKey: key(),
      variantId: f.variantId,
      quantity: '2',
    });
    const g = await guest();
    const guestRequest = {
      ...guestHeaders(g),
      cookie: `${g.cookie}; maevelle_cart_${bag.cart.id.replaceAll('-', '')}=${bag.token}`,
      'x-cart-context': full.ownerContext,
    };
    const started = await post(
      base,
      { source: { kind: 'CART', cartId: full.id, cartRevision: full.intentRevision } },
      guestRequest,
    );
    expect(started.statusCode, started.body).toBe(201);
    const id = started.json().data.id;
    const adopted = await post(
      `${base}/${id}/adoptions`,
      { revision: '1' },
      { ...headers, 'x-checkout-context': g.id, cookie: `${headers.cookie}; ${g.cookie}` },
    );
    expect(adopted.statusCode, adopted.body).toBe(200);
    expect(adopted.json().data).toMatchObject({
      sourceReviewRequired: true,
      source: { kind: 'CART', cartId: full.id },
    });
    expect((await getGuestCart(db(), bag.token)).version).toBe(full.version);
    expect((await getAccountCart(db(), cartOwner)).version).toBe(accountFull.version);
    const refreshed = await app.inject({
      method: 'PATCH',
      url: `${base}/${id}`,
      headers: { origin, 'content-type': 'application/json', 'idempotency-key': key(), ...headers },
      payload: {
        revision: '2',
        source: { kind: 'CART', cartId: accountFull.id, cartRevision: accountFull.intentRevision },
      },
    });
    expect(refreshed.statusCode, refreshed.body).toBe(200);
    expect(refreshed.json().data).toMatchObject({
      sourceReviewRequired: false,
      source: { cartId: accountFull.id },
      lines: [{ quantity: '1' }],
    });
  });
  it('rejects an already-verified session proof when revocation wins the transaction race', async () => {
    const headers = await account();
    await app.inject({ method: 'GET', url: '/test-checkout-proof', headers });
    const owner = observedProof!;
    const started = await post(base, { source: source() }, headers);
    expect(started.statusCode, started.body).toBe(201);
    const locked = signal(),
      release = signal();
    const revocation = db()
      .transaction()
      .execute(async (tx) => {
        await lockShopperSession(tx, owner.sessionKeyHash, true);
        await sql`insert into iam.shopper_revoked_storage_keys(key_hash) values(${owner.sessionKeyHash})`.execute(
          tx,
        );
        await sql`delete from iam.auth_kv_store where key_hash=${owner.sessionKeyHash}`.execute(tx);
        locked.resolve();
        await release.promise;
      });
    await locked.promise;
    const pending = getCheckoutDraft(db(), owner, started.json().data.id).catch((error) => error);
    release.resolve();
    await revocation;
    expect(await pending).toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('rejects pending guest writes when guest revocation wins the row lock', async () => {
    const context = { organizationId: f.organizationId, currency: 'BDT' };
    const guest = await createCheckoutGuestSession(db(), context);
    const owner: CheckoutAuthority = {
      kind: 'GUEST',
      organizationId: f.organizationId,
      sessionId: guest.session.id,
      token: guest.token,
    };
    const locked = signal(),
      release = signal();
    const revocation = db()
      .transaction()
      .execute(async (tx) => {
        await lockCheckoutAuthority(tx, owner);
        await sql`update orders.checkout_guest_sessions set revoked_at=clock_timestamp() where id=${owner.sessionId}`.execute(
          tx,
        );
        locked.resolve();
        await release.promise;
      });
    await locked.promise;
    const pending = createCheckoutDraft(
      db(),
      context,
      owner,
      { source: source() as CreateCheckoutDraftDto['source'] },
      key(),
    ).catch((error) => error);
    release.resolve();
    await revocation;
    expect(await pending).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(
      (
        await sql`select id from orders.checkout_drafts where guest_session_id=${owner.sessionId}`.execute(
          db(),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it('fails closed for stale account partitions, restricted accounts and expired guest sessions', async () => {
    const a = await account();
    const own = await post(base, { source: source() }, a);
    expect(own.statusCode, own.body).toBe(201);
    expect(
      (await post(base, { source: source() }, { ...a, 'x-shopper-partition': 'wrong-account' }))
        .statusCode,
    ).toBe(409);
    await app.inject({ method: 'GET', url: '/test-checkout-proof', headers: a });
    const owner = observedProof!;
    await sql`update customers.customer_accounts set status='SUSPENDED' where id=${owner.accountId}`.execute(
      db(),
    );
    await expect(getCheckoutDraft(db(), owner, own.json().data.id)).rejects.toMatchObject({
      code: 'OWNER_CHANGED',
    });
    const g = await guest();
    await sql`update orders.checkout_guest_sessions set expires_at=clock_timestamp()-interval '1 second' where id=${g.id}`.execute(
      db(),
    );
    expect((await draft(g)).statusCode).toBe(401);
  });
  it('never enables production drafts or legacy purchase/weak tracking routes', async () => {
    const disabled = await application({ ...config, checkoutDraftsEnabled: false });
    expect((await post(base, { source: source() }, {}, disabled.server)).statusCode).toBe(503);
    const production = await application({
      ...config,
      nodeEnv: 'production',
      checkoutDraftsEnabled: true,
    });
    expect((await post(base, { source: source() }, {}, production.server)).statusCode).toBe(503);
    for (const url of [
      '/storefront/v1/checkouts/current/place-order',
      '/storefront/v1/orders/track',
    ]) {
      const result = await post(url, {});
      expect(result.statusCode, result.body).toBe(503);
      expect(result.json().error.code).toBe('CHECKOUT_DISABLED');
    }
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/storefront/v1/orders/confirmation',
          headers: { cookie: 'maevelle_checkout=invalid' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(
          '/storefront/v1/orders/confirmation/payment-attempts',
          {},
          { origin: 'https://evil.example' },
        )
      ).statusCode,
    ).toBe(403);
    expect(checkoutGuestCookieName('01234567-1234-4123-8123-123456789012', true)).toBe(
      '__Host-maevelle_checkout_guest_01234567123441238123123456789012',
    );
  });
  it('protects post-order payment routes from draft access, cross-site requests and claim spam', async () => {
    const g = await guest(),
      headers = guestHeaders(g);
    const created = await draft(g);
    expect(created.statusCode, created.body).toBe(201);
    const payment = `${base}/${created.json().data.id}/order-payment`;
    const claims = `${payment}/claims`;
    const view = await app.inject({ method: 'GET', url: payment, headers });
    expect(view.statusCode).toBe(404);
    expect(view.headers['cache-control']).toBe('private, no-store');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: payment,
          headers: { ...headers, 'sec-fetch-site': 'cross-site' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await post(claims, { transactionId: 'Synthetic-123', amount: '100' }, headers)).statusCode,
    ).toBe(400);
    expect((await post(claims, { transactionId: 12345 }, headers)).statusCode).toBe(400);
    expect(
      (
        await post(
          claims,
          { transactionId: 'Synthetic-123' },
          { ...headers, origin: 'https://evil.example' },
        )
      ).statusCode,
    ).toBe(403);
    expect((await post(claims, { transactionId: 'Synthetic-123' }, headers)).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: claims,
          headers: {
            ...headers,
            'idempotency-key': key(),
          },
        })
      ).statusCode,
    ).toBe(404);
    const production = await application({
      ...config,
      nodeEnv: 'production',
      checkoutDraftsEnabled: true,
    });
    const productionRead = await production.server.inject({ method: 'GET', url: payment, headers });
    expect(productionRead.json().error.code).toBe('CHECKOUT_DISABLED');
    expect(
      (await post(claims, { transactionId: 'Synthetic-123' }, headers, production.server))
        .statusCode,
    ).toBe(503);
    const bucket = createHmac('sha256', config.betterAuthSecret)
      .update(`checkout-rate:v2:${config.storefrontOrganizationCode}:127.0.0.1:claim`)
      .digest('hex');
    await sql`update iam.auth_kv_store set counter_value=12 where key_hash=${bucket}`.execute(db());
    const otherInstance = await application();
    const limited = await post(
      claims,
      { transactionId: 'Synthetic-123' },
      headers,
      otherInstance.server,
    );
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
  });

  it('shares durable quotas across API instances without accepting forwarded-IP spoofing', async () => {
    const g = await guest();
    const second = await application();
    const bucket = createHmac('sha256', config.betterAuthSecret)
      .update(`checkout-rate:v2:${config.storefrontOrganizationCode}:127.0.0.1:write`)
      .digest('hex');
    await sql`insert into iam.auth_kv_store(key_hash,counter_value,key_version,expires_at) values(${bucket},40,1,clock_timestamp()+interval '1 minute')
      on conflict(key_hash) do update set counter_value=40,expires_at=excluded.expires_at`.execute(
      db(),
    );
    for (const server of [app, second.server]) {
      const result = await post(
        base,
        { source: source() },
        { ...guestHeaders(g), 'x-forwarded-for': '203.0.113.9' },
        server,
      );
      expect(result.statusCode, result.body).toBe(429);
      expect(result.headers['retry-after']).toBe('60');
    }
    const effects = await sql<{
      orders: string;
      payments: string;
      reservations: string;
      redemptions: string;
      conversions: string;
      convertedCarts: string;
    }>`
      select (select count(*) from orders.orders)::text orders,
        (select count(*) from payments.payment_intents)::text payments,
        (select count(*) from inventory.inventory_reservations)::text reservations,
        (select count(*) from promotions.promotion_usage)::text redemptions,
        (select count(*) from platform.outbox_events where event_type in ('orders.order.placed','payments.payment_intent.created'))::text conversions,
        (select count(*) from cart.carts where status='CONVERTED')::text "convertedCarts"`.execute(
      db(),
    );
    expect(effects.rows[0]).toEqual({
      orders: '0',
      payments: '0',
      reservations: '0',
      redemptions: '0',
      conversions: '0',
      convertedCarts: '0',
    });
  });
});
