import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { parseConfig, type RuntimeConfig } from '@maevelle/config';
import { sql } from '@maevelle/database';
import { runMigrations } from '@maevelle/database/migrate';
import { cartFixture, isolatedCartDatabase } from '@maevelle/database/testing/cart';
import { createGuestCart, addGuestCartLine, getGuestCart } from '@maevelle/database/cart';
import {
  updateCheckoutDelivery,
  createCheckoutQuote,
  type CheckoutAuthority,
} from '@maevelle/database/checkout';
import {
  revokeShopperStorageValue,
  lockShopperSession,
} from '@maevelle/database/shopper-session-fence';
import { registerCheckoutRoutes } from './routes/checkout.js';
import { registerShopperAuthRoutes } from './routes/shopper-auth.js';
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
let testIp = '127.0.0.10';
let ipSequence = 10;
const post = (url: string, payload: object, headers: Record<string, string> = {}, server = app) =>
  server.inject({
    method: 'POST',
    remoteAddress: testIp,
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
  const email = `delivery-${key()}@example.test`,
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

const areas = '/storefront/v1/checkout/delivery-areas';
const addresses = '/storefront/v1/checkout/addresses';
let areaId: string, districtId: string, countryId: string, ruleId: string;
const put = (url: string, payload: object, headers: Record<string, string>, server = app) =>
  server.inject({
    method: 'PUT',
    remoteAddress: testIp,
    url,
    payload,
    headers: { origin, 'content-type': 'application/json', 'idempotency-key': key(), ...headers },
  });
const read = (url: string, headers: Record<string, string>) =>
  app.inject({ method: 'GET', remoteAddress: testIp, url, headers });
const contact = () => ({
  recipientName: 'মোঃ আব্দুর রহমান',
  mobile: '০১৭১২৩৪৫৬৭৮',
  geographyNodeId: areaId,
  addressLine1: 'বাড়ি ১২, রোড ৩, ঢাকা',
  instructions: 'বিকেলে আসবেন',
});
function signal() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function newDraft() {
  const g = await guest();
  const d = await draft(g);
  expect(d.statusCode, d.body).toBe(201);
  return { g, id: d.json().data.id as string, headers: guestHeaders(g) };
}

describe('Phase 02A delivery API, ownership and real PostgreSQL races', () => {
  beforeEach(() => {
    testIp = `127.0.0.${++ipSequence}`;
  });
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
    app = (await application()).server;
    countryId = (
      await sql<{
        id: string;
      }>`insert into geography.nodes(node_type,canonical_name,source_code,country_code) values('COUNTRY','Synthetic Bangladesh','BD','BD') returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
    districtId = (
      await sql<{
        id: string;
      }>`insert into geography.nodes(parent_id,node_type,canonical_name) values(${countryId},'DISTRICT','Synthetic Dhaka') returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
    areaId = (
      await sql<{
        id: string;
      }>`insert into geography.nodes(parent_id,node_type,canonical_name,local_name) values(${districtId},'LOCALITY','Synthetic Mirpur','মিরপুর') returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
    await sql`insert into delivery.delivery_methods(organization_id,code,name,method_type) values(${f.organizationId},'HOME_DELIVERY','Home','HOME_DELIVERY')`.execute(
      db(),
    );
    ruleId = (
      await sql<{
        id: string;
      }>`insert into orders.delivery_pricing_rules(organization_id,name,country_code,geography_node_id,flat_amount,currency_code,priority,checkout_serviceability) values(${f.organizationId},'Synthetic coverage','BD',${districtId},0,'BDT',10,'SUPPORTED') returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
  }, 60000);
  afterAll(async () => {
    for (const server of apps) await server.close();
    if (isolation) await isolation.close();
  });

  it('normalizes Bangla/local/international mobiles and restores Unicode intent without saving a Customer', async () => {
    const d = await newDraft();
    const saved = await put(
      `${base}/${d.id}/delivery`,
      { revision: '1', delivery: contact() },
      d.headers,
    );
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().data).toMatchObject({
      revision: '2',
      delivery: { recipientName: contact().recipientName, mobile: '+8801712345678' },
      eligibility: { status: 'ELIGIBLE', tariff: { amount: '0.0000', final: false } },
      reviewRequired: false,
      quoteAvailable: false,
      purchaseAvailable: false,
    });
    const restored = await read(`${base}/${d.id}/delivery`, d.headers);
    expect(restored.json()).toEqual(saved.json());
    expect(restored.headers['cache-control']).toBe('private, no-store');
    const updated = await put(
      `${base}/${d.id}/delivery`,
      { revision: '2', delivery: { ...contact(), mobile: '+880 1712-345678' } },
      d.headers,
    );
    expect(updated.statusCode, updated.body).toBe(200);
    expect(
      (await sql`select id from customers.customer_addresses`.execute(db())).rows,
    ).toHaveLength(0);
  });

  it('uses identical delivery operations for complete-Cart and Buy Now without converting the Bag', async () => {
    const cart = await createGuestCart(db(), { organizationId: f.organizationId, currency: 'BDT' });
    const c = await addGuestCartLine(db(), {
      token: cart.token,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: cart.cart.version,
    });
    const g = await guest();
    const h = {
      ...guestHeaders(g),
      cookie: `${g.cookie}; maevelle_cart_${c.id.replaceAll('-', '')}=${cart.token}`,
    };
    const created = await post(
      base,
      { source: { kind: 'CART', cartId: c.id, cartRevision: String(c.version) } },
      h,
    );
    expect(created.statusCode, created.body).toBe(201);
    const result = await put(
      `${base}/${created.json().data.id}/delivery`,
      { revision: '1', delivery: contact() },
      h,
    );
    expect(result.statusCode, result.body).toBe(200);
    expect((await getGuestCart(db(), cart.token)).version).toBe(c.version);
  });

  it('rejects foreign guests, unknown IDs, expired authority and stale drafts opaquely', async () => {
    const d = await newDraft();
    const other = await guest();
    expect((await read(`${base}/${d.id}/delivery`, guestHeaders(other))).statusCode).toBe(404);
    expect(
      (await read(`${base}/${d.id}/delivery`, { 'x-checkout-context': d.g.id })).statusCode,
    ).toBe(401);
    await sql`update orders.checkout_guest_sessions set expires_at=clock_timestamp()-interval '1 second' where id=${d.g.id}`.execute(
      db(),
    );
    expect(
      (await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers))
        .statusCode,
    ).toBe(401);
    const expired = await newDraft();
    await sql`update orders.checkout_drafts set expires_at=clock_timestamp()-interval '1 second' where id=${expired.id}`.execute(
      db(),
    );
    expect(
      (
        await put(
          `${base}/${expired.id}/delivery`,
          { revision: '1', delivery: contact() },
          expired.headers,
        )
      ).statusCode,
    ).toBe(410);
  });

  it('honors lost-response replay across API instances and rejects key reuse and two-tab stale edits', async () => {
    const d = await newDraft(),
      idempotencyKey = key(),
      body = { revision: '1', delivery: contact() };
    const both = await Promise.all([
      put(`${base}/${d.id}/delivery`, body, { ...d.headers, 'idempotency-key': idempotencyKey }),
      put(`${base}/${d.id}/delivery`, body, { ...d.headers, 'idempotency-key': idempotencyKey }),
    ]);
    expect(both.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(both[0]!.json().data.revision).toBe('2');
    const second = (await application()).server;
    expect(
      (
        await put(
          `${base}/${d.id}/delivery`,
          body,
          { ...d.headers, 'idempotency-key': idempotencyKey },
          second,
        )
      ).json().data.revision,
    ).toBe('2');
    expect(
      (
        await put(
          `${base}/${d.id}/delivery`,
          { ...body, delivery: { ...contact(), recipientName: 'Changed' } },
          { ...d.headers, 'idempotency-key': idempotencyKey },
        )
      ).statusCode,
    ).toBe(409);
    const race = await Promise.all([
      put(`${base}/${d.id}/delivery`, { revision: '2', delivery: contact() }, d.headers),
      put(
        `${base}/${d.id}/delivery`,
        { revision: '2', delivery: { ...contact(), addressLine1: 'Another address' } },
        d.headers,
      ),
    ]);
    expect(race.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await read(`${base}/${d.id}/delivery`, d.headers)).json().data.revision).toBe('3');
  });

  it('denies broad fallback, missing/inactive/wrong-country ancestry and disabled delivery', async () => {
    const d = await newDraft();
    await sql`insert into orders.delivery_pricing_rules(organization_id,name,country_code,flat_amount,currency_code,priority) values(${f.organizationId},'Broad fallback','BD',99,'BDT',-100)`.execute(
      db(),
    );
    const unknown = await put(
      `${base}/${d.id}/delivery`,
      { revision: '1', delivery: { ...contact(), geographyNodeId: key() } },
      d.headers,
    );
    expect(unknown.statusCode, unknown.body).toBe(422);
    await sql`update orders.delivery_pricing_rules set status='INACTIVE',version=version+1 where id=${ruleId}`.execute(
      db(),
    );
    expect(
      (await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers))
        .statusCode,
    ).toBe(422);
    await sql`update orders.delivery_pricing_rules set status='ACTIVE',version=version+1 where id=${ruleId}`.execute(
      db(),
    );
    await sql`update geography.nodes set status='INACTIVE' where id=${districtId}`.execute(db());
    expect(
      (await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers))
        .statusCode,
    ).toBe(422);
    await sql`update geography.nodes set status='ACTIVE' where id=${districtId}`.execute(db());
    await sql`update geography.nodes set country_code='IN' where id=${countryId}`.execute(db());
    expect(
      (await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers))
        .statusCode,
    ).toBe(422);
    await sql`update geography.nodes set country_code='BD' where id=${countryId}`.execute(db());
    await sql`update delivery.delivery_methods set status='DISABLED' where organization_id=${f.organizationId}`.execute(
      db(),
    );
    const disabled = await put(
      `${base}/${d.id}/delivery`,
      { revision: '1', delivery: contact() },
      d.headers,
    );
    expect(disabled.json().error.code).toBe('DELIVERY_UNAVAILABLE');
    await sql`update delivery.delivery_methods set status='ACTIVE' where organization_id=${f.organizationId}`.execute(
      db(),
    );
  });

  it('detects concurrent tariff changes on reads/replays, requires revalidation, and preserves accepted data on unsupported changes', async () => {
    const d = await newDraft();
    const body = { revision: '1', delivery: contact() },
      intent = key();
    await put(`${base}/${d.id}/delivery`, body, { ...d.headers, 'idempotency-key': intent });
    await sql`update orders.delivery_pricing_rules set flat_amount=25,version=version+1 where id=${ruleId}`.execute(
      db(),
    );
    const changed = await put(`${base}/${d.id}/delivery`, body, {
      ...d.headers,
      'idempotency-key': intent,
    });
    expect(changed.json().data).toMatchObject({
      revision: '2',
      configurationChanged: true,
      reviewRequired: true,
      eligibility: { tariff: { amount: '25.0000' } },
    });
    const revalidated = await put(
      `${base}/${d.id}/delivery`,
      { revision: '2', action: 'REVALIDATE' },
      d.headers,
    );
    expect(revalidated.json().data).toMatchObject({ revision: '3', configurationChanged: false });
    await sql`update geography.nodes set status='INACTIVE',version=version+1 where id=${areaId}`.execute(
      db(),
    );
    expect((await read(`${base}/${d.id}/delivery`, d.headers)).json().data).toMatchObject({
      reviewRequired: true,
      eligibility: { status: 'UNSUPPORTED_AREA', tariff: null },
      delivery: { recipientName: contact().recipientName },
    });
    expect(
      (await put(`${base}/${d.id}/delivery`, { revision: '3', action: 'REVALIDATE' }, d.headers))
        .statusCode,
    ).toBe(422);
    await sql`update geography.nodes set status='ACTIVE',version=version+1 where id=${areaId}`.execute(
      db(),
    );
  });

  it('requires confirmed coverage and applies a locality restriction ahead of inherited district support', async () => {
    const d = await newDraft();
    await sql`update orders.delivery_pricing_rules set checkout_serviceability='UNVERIFIED' where id=${ruleId}`.execute(
      db(),
    );
    expect(
      (
        await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers)
      ).json().error.code,
    ).toBe('UNSUPPORTED_AREA');
    await sql`update orders.delivery_pricing_rules set checkout_serviceability='SUPPORTED' where id=${ruleId}`.execute(
      db(),
    );
    const restriction = (
      await sql<{
        id: string;
      }>`insert into orders.delivery_pricing_rules(organization_id,name,country_code,geography_node_id,flat_amount,currency_code,checkout_serviceability)
      values(${f.organizationId},'Synthetic locality restriction','BD',${areaId},0,'BDT','UNSUPPORTED') returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
    expect(
      (await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers))
        .statusCode,
    ).toBe(422);
    expect(
      (await read(`${areas}?query=${encodeURIComponent('মির')}`, {})).json().data.items,
    ).toEqual([]);
    await sql`update orders.delivery_pricing_rules set status='INACTIVE' where id=${restriction}`.execute(
      db(),
    );
    expect(
      (await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers))
        .statusCode,
    ).toBe(200);
  });

  it('protects account address CRUD and explicit snapshots across edits/removal, without modifying Orders', async () => {
    const a = await account(),
      b = await account();
    const created = await post(addresses, { address: { ...contact(), isDefault: true } }, a);
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().data.id;
    const list = await read(addresses, a);
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data.items[0]).toMatchObject({ id, revision: '1', isDefault: true });
    expect((await read(addresses, b)).json().data.items).toEqual([]);
    const d = await post(base, { source: source() }, a);
    expect(d.statusCode, d.body).toBe(201);
    const url = `${base}/${d.json().data.id}/delivery`;
    expect(
      (await put(url, { revision: '1', savedAddressId: id, savedAddressRevision: '1' }, b))
        .statusCode,
    ).toBe(404);
    const selected = await put(
      url,
      { revision: '1', savedAddressId: id, savedAddressRevision: '1' },
      a,
    );
    expect(selected.statusCode, selected.body).toBe(200);
    expect(
      (await put(`${addresses}/${id}`, { revision: '1', address: contact() }, b)).statusCode,
    ).toBe(404);
    const edit = await put(
      `${addresses}/${id}`,
      { revision: '1', address: { ...contact(), recipientName: 'New recipient' } },
      a,
    );
    expect(edit.statusCode, edit.body).toBe(200);
    const snapshot = await read(url, a);
    expect(snapshot.json().data).toMatchObject({
      savedAddress: { status: 'CHANGED' },
      delivery: { recipientName: contact().recipientName },
      reviewRequired: true,
    });
    expect((await put(url, { revision: '2', action: 'REVALIDATE' }, a)).json().error.code).toBe(
      'ADDRESS_CHANGED',
    );
    expect(
      (await put(url, { revision: '2', savedAddressId: id, savedAddressRevision: '1' }, a))
        .statusCode,
    ).toBe(409);
    const removed = await app.inject({
      method: 'DELETE',
      url: `${addresses}/${id}`,
      payload: { revision: '2' },
      headers: { origin, 'content-type': 'application/json', 'idempotency-key': key(), ...a },
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect((await read(url, a)).json().data.savedAddress.status).toBe('REMOVED');
    expect(
      (await put(url, { revision: '2', delivery: contact() }, a)).json().data.savedAddress,
    ).toBeNull();
    expect((await read(addresses, a)).json().data.items).toEqual([]);
    const guestDraft = await newDraft();
    expect(
      (
        await put(
          `${base}/${guestDraft.id}/delivery`,
          { revision: '1', savedAddressId: id, savedAddressRevision: '3' },
          guestDraft.headers,
        )
      ).statusCode,
    ).toBe(401);
    expect((await read(addresses, guestDraft.headers)).statusCode).toBe(401);
  });

  it('fences revoked account sessions and denies stale partition/admin credentials', async () => {
    const a = await account();
    await read('/test-checkout-proof', a);
    const proof = observedProof!;
    const d = await post(base, { source: source() }, a);
    expect((await read(addresses, { ...a, 'x-shopper-partition': 'stale' })).statusCode).toBe(409);
    expect((await read(addresses, { cookie: 'better-auth.session_token=admin' })).statusCode).toBe(
      401,
    );
    await revokeShopperStorageValue(db(), proof.sessionKeyHash);
    await expect(
      updateCheckoutDelivery(
        db(),
        proof,
        d.json().data.id,
        { revision: '1', delivery: contact() },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect((await read(addresses, a)).statusCode).toBe(401);
  });

  it('rejects mass assignment, coercion, mixed variants, unsafe Unicode, missing fields and oversized requests', async () => {
    const d = await newDraft();
    const url = `${base}/${d.id}/delivery`;
    for (const delivery of [
      { ...contact(), price: '0' },
      { ...contact(), mobile: 1712345678 },
      { ...contact(), recipientName: 'a\u202eb' },
      { ...contact(), addressLine1: '\u0000' },
      { ...contact(), mobile: '+14155552671' },
      { ...contact(), recipientName: '' },
    ]) {
      const r = await put(url, { revision: '1', delivery }, d.headers);
      expect([400, 422], r.body).toContain(r.statusCode);
      expect(r.body).not.toContain(contact().addressLine1);
    }
    expect(
      (await put(url, { revision: '1', delivery: contact(), action: 'REVALIDATE' }, d.headers))
        .statusCode,
    ).toBe(400);
    expect((await put(url, { revision: 1, delivery: contact() }, d.headers)).statusCode).toBe(400);
    expect(
      (
        await put(
          url,
          { revision: '1', delivery: { ...contact(), addressLine1: 'x'.repeat(9000) } },
          d.headers,
        )
      ).statusCode,
    ).toBe(413);
    expect(
      (
        await put(
          url,
          { revision: '1', delivery: contact() },
          { ...d.headers, origin: 'https://attacker.test' },
        )
      ).statusCode,
    ).toBe(403);
    expect((await read(`${areas}?query=Sy&customerId=${key()}`, {})).statusCode).toBe(400);
    const gated = (await application({ ...config, nodeEnv: 'production' })).server;
    expect(
      (await put(url, { revision: '1', delivery: contact() }, d.headers, gated)).statusCode,
    ).toBe(503);
  });

  it('searches bounded actual supported areas and retains zero business side effects', async () => {
    const result = await read(`${areas}?query=Synthetic`, {});
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().data.items.map((i: { id: string }) => i.id)).toContain(areaId);
    expect(
      (await read(`${areas}?query=${encodeURIComponent('মির')}`, {})).json().data.items[0].id,
    ).toBe(areaId);
    const facts = await sql`select
      (select count(*)::integer from orders.orders) orders,
      (select count(*)::integer from inventory.inventory_reservations) reservations,
      (select count(*)::integer from payments.payment_intents) obligations,
      (select count(*)::integer from payments.payments where status='CONFIRMED') payments,
      (select count(*)::integer from promotions.promotion_usage) redemptions,
      (select count(*)::integer from analytics.storefront_events where event_name in ('ORDER_PLACED','PAYMENT_CONFIRMED')) purchase_events,
      (select count(*)::integer from cart.carts where status='CONVERTED') conversions,
      (select count(*)::integer from platform.outbox_events where event_type='orders.order.placed') purchases`.execute(
      db(),
    );
    expect(facts.rows[0]).toEqual({
      orders: 0,
      reservations: 0,
      obligations: 0,
      payments: 0,
      redemptions: 0,
      purchase_events: 0,
      conversions: 0,
      purchases: 0,
    });
  });

  it('rolls back contact/revision/receipt together after a database failure and safely retries the original intent', async () => {
    const d = await newDraft(),
      intent = key(),
      body = { revision: '1', delivery: contact() };
    await sql`create function orders.delivery_test_fail() returns trigger language plpgsql as $$ begin
      if new.operation_type='checkout.foundation.delivery.update' and new.status='SUCCEEDED' then raise exception 'synthetic private failure';end if;return new;end $$;
      create trigger delivery_test_fail before update on platform.idempotency_records for each row execute function orders.delivery_test_fail()`.execute(
      db(),
    );
    try {
      const result = await put(`${base}/${d.id}/delivery`, body, {
        ...d.headers,
        'idempotency-key': intent,
      });
      expect(result.statusCode, result.body).toBe(503);
      expect(result.body).not.toMatch(/synthetic|private failure|recipient|SQL/);
      expect((await read(`${base}/${d.id}/delivery`, d.headers)).json().data).toMatchObject({
        revision: '1',
        delivery: null,
      });
    } finally {
      await sql`drop trigger delivery_test_fail on platform.idempotency_records;drop function orders.delivery_test_fail()`.execute(
        db(),
      );
    }
    expect(
      (
        await put(`${base}/${d.id}/delivery`, body, { ...d.headers, 'idempotency-key': intent })
      ).json().data.revision,
    ).toBe('2');
  });

  it('returns a retryable sanitized lock timeout, then recovers the same intent', async () => {
    const d = await newDraft(),
      locked = signal(),
      release = signal(),
      intent = key();
    const holding = db()
      .transaction()
      .execute(async (tx) => {
        await sql`select id from orders.checkout_guest_sessions where id=${d.g.id} for update`.execute(
          tx,
        );
        locked.release();
        await release.promise;
      });
    await locked.promise;
    try {
      const result = await put(
        `${base}/${d.id}/delivery`,
        { revision: '1', delivery: contact() },
        { ...d.headers, 'idempotency-key': intent },
      );
      expect(result.statusCode, result.body).toBe(503);
      expect(result.headers['retry-after']).toBe('2');
      expect(result.body).not.toMatch(/lock timeout|postgres|checkout_guest/);
    } finally {
      release.release();
      await holding;
    }
    expect(
      (
        await put(
          `${base}/${d.id}/delivery`,
          { revision: '1', delivery: contact() },
          { ...d.headers, 'idempotency-key': intent },
        )
      ).statusCode,
    ).toBe(200);
  }, 10000);

  it('rejects delayed delivery and snapshot quote writes when revocation wins the session fence', async () => {
    const a = await account();
    await read('/test-checkout-proof', a);
    const proof = observedProof!;
    const created = await post(base, { source: source() }, a),
      locked = signal(),
      release = signal();
    const revoking = db()
      .transaction()
      .execute(async (tx) => {
        await lockShopperSession(tx, proof.sessionKeyHash, true);
        locked.release();
        await release.promise;
        await sql`insert into iam.shopper_revoked_storage_keys(key_hash) values(${proof.sessionKeyHash})`.execute(
          tx,
        );
        await sql`delete from iam.auth_kv_store where key_hash=${proof.sessionKeyHash}`.execute(tx);
      });
    await locked.promise;
    const mutation = updateCheckoutDelivery(
      db(),
      proof,
      created.json().data.id,
      { revision: '1', delivery: contact() },
      key(),
    );
    // Attach rejection handling before releasing the competing transaction.
    const outcome = expect(mutation).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    const quoting = createCheckoutQuote(
      db(),
      proof,
      created.json().data.id,
      { revision: '1' },
      key(),
    );
    const quoteOutcome = expect(quoting).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    release.release();
    await revoking;
    await outcome;
    await quoteOutcome;
    expect(
      (
        await sql`select id from orders.checkout_quotes where draft_id=${created.json().data.id}`.execute(
          db(),
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await sql`select draft_id from orders.checkout_draft_delivery where draft_id=${created.json().data.id}`.execute(
          db(),
        )
      ).rows,
    ).toHaveLength(0);
  });

  it('keeps explicit guest delivery during adoption and never grants it to a second account', async () => {
    const d = await newDraft();
    await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers);
    const a = await account(),
      b = await account();
    const adopted = await post(
      `${base}/${d.id}/adoptions`,
      { revision: '2' },
      { ...a, 'x-checkout-context': d.g.id, cookie: `${a.cookie}; ${d.g.cookie}` },
    );
    expect(adopted.statusCode, adopted.body).toBe(200);
    expect((await read(`${base}/${d.id}/delivery`, a)).json().data).toMatchObject({
      revision: '3',
      delivery: { recipientName: contact().recipientName },
    });
    expect((await read(`${base}/${d.id}/delivery`, d.headers)).statusCode).toBe(404);
    expect((await read(`${base}/${d.id}/delivery`, b)).statusCode).toBe(404);
  });

  it('serializes competing defaults, rejects stale address edits, and makes address creation replayable', async () => {
    const a = await account(),
      intent = key(),
      body = { address: { ...contact(), isDefault: true } };
    const [first, replay] = await Promise.all([
      post(addresses, body, { ...a, 'idempotency-key': intent }),
      post(addresses, body, { ...a, 'idempotency-key': intent }),
    ]);
    expect(first.statusCode, first.body).toBe(201);
    expect(replay.json()).toEqual(first.json());
    const second = await post(addresses, body, a);
    expect(second.statusCode, second.body).toBe(201);
    const listing = (await read(addresses, a)).json().data.items;
    expect(listing).toHaveLength(2);
    expect(listing.filter((row: { isDefault: boolean }) => row.isDefault)).toHaveLength(1);
    expect(
      (await put(`${addresses}/${first.json().data.id}`, { revision: '1', address: contact() }, a))
        .statusCode,
    ).toBe(409);
    const current = listing.find((row: { id: string }) => row.id === second.json().data.id);
    const race = await Promise.all([
      put(`${addresses}/${current.id}`, { revision: current.revision, address: contact() }, a),
      put(
        `${addresses}/${current.id}`,
        { revision: current.revision, address: { ...contact(), recipientName: 'Other intent' } },
        a,
      ),
    ]);
    expect(race.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  it('enforces durable geographic search quotas and strict pagination across API instances', async () => {
    const a = await account();
    expect((await read(`${addresses}?offset=-1`, a)).statusCode).toBe(400);
    expect((await read(`${addresses}?offset=10001`, a)).statusCode).toBe(400);
    const server = (await application()).server;
    let limited = false;
    for (let i = 0; i < 121; i++) {
      const result = await (i % 2 ? app : server).inject({
        method: 'GET',
        url: `${areas}?query=Synthetic`,
        remoteAddress: '127.0.1.99',
      });
      if (result.statusCode === 429) {
        expect(result.headers['retry-after']).toBe('60');
        limited = true;
        break;
      }
      expect(result.statusCode, result.body).toBe(200);
    }
    expect(limited).toBe(true);
  });

  it('paginates and caps owned saved addresses; tenant and phone matches never confer ownership', async () => {
    const a = await account();
    await read('/test-checkout-proof', a);
    const proof = observedProof!;
    await sql`insert into customers.customer_addresses(organization_id,customer_id,recipient_name,phone,address_line_1,geography_node_id,country_code)
      select ${f.organizationId},${proof.customerId},'Synthetic saved', '+8801712345678','Synthetic address',${areaId},'BD' from generate_series(1,50)`.execute(
      db(),
    );
    const page1 = await read(addresses, a),
      page2 = await read(`${addresses}?offset=20`, a),
      page3 = await read(`${addresses}?offset=40`, a);
    expect([
      page1.json().data.items.length,
      page2.json().data.items.length,
      page3.json().data.items.length,
    ]).toEqual([20, 20, 10]);
    expect(page3.json().data.nextOffset).toBeNull();
    const capped = await post(addresses, { address: contact() }, a);
    expect(capped.json().error.code).toBe('ADDRESS_LIMIT');
    const foreign = await cartFixture(isolation.database);
    const server = (await application({ ...config, storefrontOrganizationCode: foreign.code }))
      .server;
    const session = await server.inject({
      method: 'GET',
      url: '/storefront/v1/shopper/session',
      headers: { cookie: a.cookie },
    });
    const foreignHeaders = {
      cookie: a.cookie,
      'x-shopper-partition': session.json().data.partition,
    };
    const foreignList = await server.inject({
      method: 'GET',
      url: addresses,
      headers: foreignHeaders,
    });
    expect(foreignList.json().data.items).toEqual([]);
    const guessed = await put(
      `${addresses}/${page1.json().data.items[0].id}`,
      { revision: '1', address: contact() },
      foreignHeaders,
      server,
    );
    expect(guessed.statusCode, guessed.body).toBe(404);
    const d = await newDraft();
    expect(
      (await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers))
        .statusCode,
    ).toBe(200);
    expect((await read(addresses, d.headers)).statusCode).toBe(401);
  });

  it('quotes and explicitly acknowledges exact server components; retries recover the immutable accepted quote', async () => {
    await sql`update orders.delivery_pricing_rules set flat_amount=0,version=version+1 where id=${ruleId}`.execute(
      db(),
    );
    const d = await newDraft();
    await put(`${base}/${d.id}/delivery`, { revision: '1', delivery: contact() }, d.headers);
    expect((await read(`${base}/${d.id}/quotes/current`, d.headers)).json().data).toBeNull();
    const intent = key();
    const first = await post(
      `${base}/${d.id}/quotes`,
      { revision: '2' },
      { ...d.headers, 'idempotency-key': intent },
    );
    expect(first.statusCode, first.body).toBe(201);
    const q = first.json().data;
    expect(q).toMatchObject({
      status: 'CURRENT',
      draftRevision: '3',
      reviewRequired: true,
      purchaseAvailable: false,
      facts: {
        merchandiseSubtotal: '100.0000',
        shipping: '0.0000',
        evaluatedTotal: '100.0000',
        tax: null,
        paymentFees: null,
        payable: null,
        final: false,
      },
    });
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(
      (
        await post(
          `${base}/${d.id}/quotes`,
          { revision: '2' },
          { ...d.headers, 'idempotency-key': intent },
        )
      ).json().data.id,
    ).toBe(q.id);
    const acknowledged = await post(
      `${base}/${d.id}/quotes/${q.id}/acknowledgements`,
      { revision: '3', fingerprint: q.fingerprint },
      d.headers,
    );
    expect(acknowledged.statusCode, acknowledged.body).toBe(200);
    expect(acknowledged.json().data).toMatchObject({
      acknowledged: true,
      reviewRequired: false,
      purchaseAvailable: false,
    });
    expect((await read(`${base}/${d.id}/delivery`, d.headers)).json().data).toMatchObject({
      revision: '3',
      quoteAvailable: false,
      purchaseAvailable: false,
    });
    const other = await newDraft();
    expect((await read(`${base}/${d.id}/quotes/${q.id}`, other.headers)).statusCode).toBe(404);
    expect((await read(`${base}/${other.id}/quotes/${q.id}`, other.headers)).statusCode).toBe(404);
    expect((await read(`${base}/${d.id}/quotes/${key()}`, d.headers)).statusCode).toBe(404);
    for (const forged of [
      { revision: 3 },
      { revision: '3', total: '0' },
      { revision: '3', couponCodes: [false] },
      { revision: '3', customerId: key() },
      { revision: '3', couponCodes: Array(11).fill('AB') },
    ]) {
      expect((await post(`${base}/${d.id}/quotes`, forged, d.headers)).statusCode).toBe(400);
    }
    expect(
      (
        await post(
          `${base}/${d.id}/quotes`,
          { revision: '3' },
          { ...d.headers, origin: 'https://foreign.example' },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post(
          `${base}/${d.id}/quotes`,
          { revision: '3' },
          { ...d.headers, 'idempotency-key': intent },
        )
      ).statusCode,
    ).toBe(409);
    const expired = await post(
      `${base}/${d.id}/quotes/${q.id}/acknowledgements`,
      { revision: '3', fingerprint: 'x'.repeat(43) },
      d.headers,
    );
    expect(expired.statusCode).toBe(409);
  });

  it('revalidates account saved-address association on quote creation/read and keeps owners isolated', async () => {
    const a = await account(),
      b = await account();
    const created = await post(base, { source: source() }, a);
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().data.id;
    const saved = await post(addresses, { address: contact() }, a);
    const book = (await read(addresses, a)).json().data.items[0];
    expect(saved.statusCode).toBe(201);
    await put(
      `${base}/${id}/delivery`,
      { revision: '1', savedAddressId: book.id, savedAddressRevision: book.revision },
      a,
    );
    const response = await post(`${base}/${id}/quotes`, { revision: '2' }, a);
    expect(response.statusCode, response.body).toBe(201);
    const q = response.json().data;
    expect((await read(`${base}/${id}/quotes/${q.id}`, b)).statusCode).toBe(404);
    await put(
      `${addresses}/${book.id}`,
      { revision: book.revision, address: { ...contact(), addressLine1: 'Account edit' } },
      a,
    );
    const current = await read(`${base}/${id}/quotes/current`, a);
    expect(current.json().data).toMatchObject({
      status: 'INVALIDATED',
      issues: ['ADDRESS_CHANGED'],
      facts: q.facts,
    });
    const rejected = await post(`${base}/${id}/quotes`, { revision: '3' }, a);
    expect(rejected.statusCode, rejected.body).toBe(409);
    expect(rejected.json().error.code).toBe('ADDRESS_CHANGED');
  });

  it('keeps quote routes disabled in production and does not expose quote IDs as capabilities', async () => {
    const d = await newDraft();
    const anonymous = await read(`${base}/${d.id}/quotes/current`, {});
    expect(anonymous.statusCode).toBe(401);
    const production = (await application({ ...config, nodeEnv: 'production' })).server;
    const denied = await post(`${base}/${d.id}/quotes`, { revision: '1' }, d.headers, production);
    expect(denied.statusCode).toBe(503);
    expect(denied.json().error.code).toBe('CHECKOUT_DISABLED');
  });

  it('finishes all address and failure workflows with zero purchase/financial/inventory effects', async () => {
    const facts = await sql`select
      (select count(*)::integer from orders.orders) orders,
      (select count(*)::integer from inventory.inventory_reservations) reservations,
      (select count(*)::integer from payments.payment_intents) obligations,
      (select count(*)::integer from payments.payments where status='CONFIRMED') payments,
      (select count(*)::integer from promotions.promotion_usage) redemptions,
      (select count(*)::integer from analytics.storefront_events where event_name in ('ORDER_PLACED','PAYMENT_CONFIRMED')) purchase_events,
      (select count(*)::integer from cart.carts where status='CONVERTED') conversions,
      (select count(*)::integer from platform.outbox_events where event_type='orders.order.placed' or event_type ilike '%purchase%') purchases`.execute(
      db(),
    );
    expect(facts.rows[0]).toEqual({
      orders: 0,
      reservations: 0,
      obligations: 0,
      payments: 0,
      redemptions: 0,
      purchase_events: 0,
      conversions: 0,
      purchases: 0,
    });
  });
});
