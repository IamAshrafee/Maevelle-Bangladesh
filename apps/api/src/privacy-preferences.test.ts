import { afterAll, beforeAll, expect, it } from 'vitest';
import Fastify from 'fastify';
import { parseConfig } from '@maevelle/config';
import { sql } from '@maevelle/database';
import { runMigrations } from '@maevelle/database/migrate';
import { isolatedCartDatabase } from '@maevelle/database/testing/cart';
import { manualPaymentFixture } from '@maevelle/database/testing/manual-payments';
import { resolveOrEnrollShopper, type ShopperPrincipal } from '@maevelle/database/shopper';
import {
  setShopperStorageValue,
  revokeShopperStorageValue,
} from '@maevelle/database/shopper-session-fence';
import {
  processCommerceAnalyticsOutbox,
  queueCommerceTestDelivery,
  dispatchCommerceTestDeliveries,
  ingestStorefrontEvent,
} from '@maevelle/database/analytics';
import type { PrivacyPreferencesDto, SavePrivacyPreferencesDto } from '@maevelle/contracts';
import { registerPrivacyPreferencesRoutes } from './routes/privacy-preferences.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';

let isolated: Awaited<ReturnType<typeof isolatedCartDatabase>>,
  f: Awaited<ReturnType<typeof manualPaymentFixture>>;
const app = Fastify({ logger: false });
const db = () => isolated.database.db;
const origin = 'http://privacy.example.test';
const accounts = new Map<string, ShopperPrincipal>();
let sequence = 1;
type Browser = {
  cookie: string;
  value: PrivacyPreferencesDto;
  identity?: string | undefined;
  ip: string;
};
beforeAll(async () => {
  isolated = await isolatedCartDatabase();
  await runMigrations(db());
  f = await manualPaymentFixture(db());
  await sql`update platform.organizations set code='privacy-fixture' where id=${f.organizationId}`.execute(
    db(),
  );
  await sql`insert into analytics.commerce_reporting_scopes values(${f.organizationId},'SYNTHETIC')`.execute(
    db(),
  );
  for (const name of ['A', 'B', 'revoked']) {
    const id = crypto.randomUUID(),
      email = `${id}@example.test`;
    await sql`insert into iam.users(id,name,email,email_normalized,email_verified) values(${id},'Synthetic shopper',${email},${email},true)`.execute(
      db(),
    );
    const principal = (await resolveOrEnrollShopper(db(), f.organizationId, id))!;
    const sessionKeyHash = crypto.randomUUID();
    await setShopperStorageValue(
      db(),
      sessionKeyHash,
      Buffer.from('synthetic-session-proof'),
      new Date(Date.now() + 86400000),
    );
    accounts.set(name, { ...principal, sessionKeyHash });
  }
  const config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: isolated.url,
    TEST_DATABASE_URL: isolated.url,
    BETTER_AUTH_SECRET: 'synthetic-privacy-session-test-secret-with-adequate-length',
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 29).toString('base64'),
    STOREFRONT_BASE_URL: origin,
    STOREFRONT_ORGANIZATION_CODE: 'privacy-fixture',
  });
  const gate = registerPrivacyPreferencesRoutes(
    app,
    isolated.database,
    config,
    async (request) => accounts.get(String(request.headers.authorization)) ?? null,
  );
  const auth = { api: { getSession: async () => null } } as unknown as Parameters<
    typeof registerAnalyticsRoutes
  >[2];
  registerAnalyticsRoutes(app, isolated.database, auth, 'privacy-fixture', gate);
  await app.ready();
}, 30000);
afterAll(async () => {
  await app.close();
  await isolated?.close();
});
function headers(b?: Browser) {
  return {
    origin,
    'x-privacy-request': '1',
    ...(b?.cookie ? { cookie: b.cookie } : {}),
    ...(b?.identity ? { authorization: b.identity } : {}),
  };
}
async function browser(identity?: string, priorCookie = ''): Promise<Browser> {
  const ip = `127.0.0.${++sequence}`;
  const response = await app.inject({
    url: '/storefront/v1/analytics/consent',
    headers: headers({ cookie: priorCookie, identity } as Browser),
    remoteAddress: ip,
  });
  expect(response.statusCode, response.body).toBe(200);
  const set = response.headers['set-cookie'];
  const line = Array.isArray(set) ? set[0] : set;
  const cookie = line ? line.split(';')[0]! : priorCookie;
  return { cookie, value: response.json().data, identity, ip };
}
function choices(b: Browser, analytics: boolean, advertising = false): SavePrivacyPreferencesDto {
  return {
    policyVersion: b.value.policyVersion,
    choices: {
      ANALYTICS: {
        decision: analytics ? 'GRANTED' : 'DENIED',
        expectedRevision: b.value.purposes.ANALYTICS.revision,
        expectedBrowserRevision: b.value.purposes.ANALYTICS.browserRevision,
      },
      ADVERTISING: {
        decision: advertising ? 'GRANTED' : 'DENIED',
        expectedRevision: b.value.purposes.ADVERTISING.revision,
        expectedBrowserRevision: b.value.purposes.ADVERTISING.browserRevision,
      },
    },
  };
}
async function save(b: Browser, a: boolean, d = false) {
  const response = await app.inject({
    method: 'PUT',
    url: '/storefront/v1/analytics/consent',
    headers: { ...headers(b), 'x-privacy-context': b.value.context },
    payload: choices(b, a, d),
    remoteAddress: b.ip,
  });
  if (response.statusCode === 200) b.value = response.json().data;
  return response;
}
function observation(b: Browser, name = 'CART_VIEWED') {
  return {
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    name,
    origin: 'BROWSER',
    occurredAt: new Date().toISOString(),
    ...(name.startsWith('WISHLIST_') ? { sessionId: crypto.randomUUID() } : {}),
    consent: {
      necessary: 'GRANTED',
      analytics: 'GRANTED',
      marketing: 'DENIED',
      preferences: 'DENIED',
      recordedAt: b.value.observationNotBefore ?? new Date().toISOString(),
    },
    data: name === 'CART_VIEWED' ? { mode: 'GUEST', surface: 'PAGE' } : { mode: 'GUEST' },
  };
}
const send = (b: Browser, payload = observation(b)) =>
  app.inject({
    method: 'POST',
    url: '/storefront/v1/analytics/events',
    headers: {
      ...headers(b),
      'x-privacy-context': b.value.context,
      'x-privacy-observation': b.value.observationToken ?? '',
    },
    payload,
    remoteAddress: b.ip,
  });

it('issues private anonymous authority and exposes neither cookie credentials nor subject IDs', async () => {
  const b = await browser();
  expect(b.cookie).toMatch(/^maevelle_privacy=[A-Za-z0-9_-]{43}$/);
  expect(b.value).toMatchObject({
    scope: 'SESSION',
    externalDispatchEnabled: false,
    observationToken: null,
    purposes: {
      ANALYTICS: { effectiveDecision: 'UNKNOWN', revision: '0' },
      ADVERTISING: { effectiveDecision: 'UNKNOWN' },
    },
  });
  expect(JSON.stringify(b.value)).not.toContain(b.cookie.split('=')[1]);
  const response = await app.inject({
    url: '/storefront/v1/analytics/consent',
    headers: headers(b),
  });
  expect(response.headers['cache-control']).toBe('private, no-store');
});
it('persists independent choices and re-reads them on the same authorized browser', async () => {
  const b = await browser();
  expect((await save(b, false, true)).statusCode).toBe(200);
  expect(b.value.purposes.ADVERTISING.effectiveDecision).toBe('GRANTED');
  expect(b.value.observationToken).toBeNull();
  const restored = await browser(undefined, b.cookie);
  expect(restored.value.purposes.ANALYTICS.effectiveDecision).toBe('DENIED');
  expect((await save(restored, true, false)).statusCode).toBe(200);
  expect(restored.value.observationToken).toBeTruthy();
});
it('rejects client-selected subject, tenant, scope, expiry and stale policy data before schema stripping', async () => {
  const b = await browser();
  for (const extra of [
    { subjectId: crypto.randomUUID() },
    { organizationId: crypto.randomUUID() },
    { scope: 'ACCOUNT' },
    { expiresAt: '2099-01-01' },
  ]) {
    const r = await app.inject({
      method: 'PUT',
      url: '/storefront/v1/analytics/consent',
      headers: { ...headers(b), 'x-privacy-context': b.value.context },
      payload: { ...choices(b, true), ...extra },
    });
    expect(r.statusCode).toBe(400);
  }
  const r = await app.inject({
    method: 'PUT',
    url: '/storefront/v1/analytics/consent',
    headers: { ...headers(b), 'x-privacy-context': b.value.context },
    payload: { ...choices(b, true), policyVersion: 'invented' },
  });
  expect(r.statusCode).toBe(409);
});
it('blocks CSRF, cross-site metadata, query identifiers and absent cookie ownership', async () => {
  const b = await browser();
  for (const h of [
    { ...headers(b), 'x-privacy-request': '' },
    { ...headers(b), origin: 'https://evil.test' },
    { ...headers(b), 'sec-fetch-site': 'cross-site' },
  ]) {
    expect(
      (await app.inject({ url: '/storefront/v1/analytics/consent', headers: h })).statusCode,
    ).toBe(403);
  }
  expect(
    (
      await app.inject({
        url: '/storefront/v1/analytics/consent?subjectId=private',
        headers: headers(b),
      })
    ).statusCode,
  ).toBe(400);
  const r = await app.inject({
    method: 'PUT',
    url: '/storefront/v1/analytics/consent',
    headers: { origin, 'x-privacy-request': '1', 'x-privacy-context': b.value.context },
    payload: choices(b, true),
  });
  expect(r.statusCode).toBe(409);
  const stranger = await browser(undefined, `maevelle_privacy=${'a'.repeat(43)}`);
  expect(stranger.value.context).not.toBe(b.value.context);
  expect(stranger.value.purposes.ANALYTICS.revision).toBe('0');
});
it('serializes tab writes and never regrants a withdrawal from a stale revision', async () => {
  const b = await browser();
  expect((await save(b, true, true)).statusCode).toBe(200);
  const stale = { ...b, value: structuredClone(b.value) };
  expect((await save(b, false, false)).statusCode).toBe(200);
  expect((await save(stale, true, true)).statusCode).toBe(409);
  const restored = await browser(undefined, b.cookie);
  expect(restored.value.purposes.ANALYTICS.effectiveDecision).toBe('DENIED');
  const payload = choices(restored, true);
  const request = {
    method: 'PUT' as const,
    url: '/storefront/v1/analytics/consent',
    headers: { ...headers(restored), 'x-privacy-context': restored.value.context },
    payload,
  };
  const responses = await Promise.all([app.inject(request), app.inject(request)]);
  expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
});
it('separates anonymous, account A, account B and logout authority without merging grants', async () => {
  const guest = await browser();
  await save(guest, true, true);
  const a = await browser('A', guest.cookie);
  expect(a.value.scope).toBe('ACCOUNT');
  expect(a.value.observationToken).toBeNull();
  expect(a.cookie).not.toBe(guest.cookie);
  await save(a, false, false);
  const otherDevice = await browser('A');
  expect(otherDevice.value.purposes.ANALYTICS.effectiveDecision).toBe('DENIED');
  await save(a, true, true);
  const freshDevice = await browser('A');
  expect(freshDevice.value.purposes.ANALYTICS.decision).toBe('GRANTED');
  expect(freshDevice.value.purposes.ANALYTICS.effectiveDecision).toBe('UNKNOWN');
  const b = await browser('B', a.cookie);
  expect(b.value.purposes.ANALYTICS.effectiveDecision).toBe('UNKNOWN');
  const stale = { ...a, cookie: b.cookie, identity: 'B' };
  expect((await save(stale, true, true)).statusCode).toBe(409);
  const logout = await browser(undefined, b.cookie);
  expect(logout.value.scope).toBe('SESSION');
  expect(logout.value.observationToken).toBeNull();
});
it('rechecks session revocation inside the preference transaction', async () => {
  const b = await browser('revoked');
  await revokeShopperStorageValue(db(), accounts.get('revoked')!.sessionKeyHash!);
  expect((await save(b, true)).statusCode).toBe(401);
});
it('requires current server consent for Cart/Wishlist and records private provenance without client identity authority', async () => {
  const b = await browser();
  expect((await send(b)).json().data.accepted).toBe(false);
  await save(b, true, false);
  for (const name of ['CART_VIEWED', 'WISHLIST_PAGE_VIEWED']) {
    const payload = observation(b, name);
    const response = await send(b, payload);
    expect(response.statusCode, response.body).toBe(202);
    expect(response.json().data.accepted).toBe(true);
    expect((await send(b, payload)).json().data.duplicate).toBe(true);
    const bound = (
      await sql<{
        session_id: string | null;
      }>`select a.policy_version,a.scope,e.payload,e.session_id from analytics.commerce_observation_authority a
      join analytics.storefront_events e on e.organization_id=a.organization_id and e.event_id=a.event_id where a.event_id=${payload.eventId}`.execute(
        db(),
      )
    ).rows[0];
    expect(bound).toMatchObject({
      policy_version: b.value.policyVersion,
      scope: 'SESSION',
      payload: payload.data,
    });
    if ('sessionId' in payload) expect(bound!.session_id).not.toBe(payload.sessionId);
  }
  const noCookie = await app.inject({
    method: 'POST',
    url: '/storefront/v1/analytics/events',
    payload: observation(b),
    headers: { origin },
  });
  expect(noCookie.json().data.accepted).toBe(false);
});
it('rejects pregrant observations and withdrawn/regranted proof without retroactive capture', async () => {
  const b = await browser();
  const before = observation(b);
  await save(b, true);
  expect((await send(b, before)).json().data.accepted).toBe(false);
  const old = { ...b, value: structuredClone(b.value) };
  const pending = observation(old);
  await save(b, false);
  expect((await send(old, pending)).json().data.accepted).toBe(false);
  await save(b, true);
  expect((await send(old, pending)).json().data.accepted).toBe(false);
  expect((await send(b)).json().data.accepted).toBe(true);
});
it('does not attach current authority to an existing unbound observation', async () => {
  const b = await browser();
  await save(b, true);
  const payload = observation(b);
  expect(
    (
      await ingestStorefrontEvent(
        db(),
        f.organizationId,
        payload as Parameters<typeof ingestStorefrontEvent>[2],
      )
    ).accepted,
  ).toBe(true);
  expect((await send(b, payload)).json().data.accepted).toBe(false);
  expect(
    (
      await sql`select 1 from analytics.commerce_observation_authority where event_id=${payload.eventId}`.execute(
        db(),
      )
    ).rows,
  ).toHaveLength(0);
});
it('rotates expired browser authority and never revives its old grant', async () => {
  const b = await browser();
  await save(b, true);
  const old = { ...b, value: structuredClone(b.value) };
  await sql`update analytics.privacy_browser_sessions set created_at=now()-interval '2 days',expires_at=now()-interval '1 day'
    where organization_id=${f.organizationId}`.execute(db());
  const read = await app.inject({
    method: 'GET',
    url: '/storefront/v1/analytics/consent',
    headers: { cookie: b.cookie, 'x-privacy-request': '1' },
    remoteAddress: b.ip,
  });
  expect(read.statusCode).toBe(200);
  expect(read.json().data.context).not.toBe(b.value.context);
  expect(read.json().data.purposes.ANALYTICS.effectiveDecision).toBe('UNKNOWN');
  expect((await send(old)).json().data.accepted).toBe(false);
});
it('suppresses a queued TEST delivery on API withdrawal while preserving business records', async () => {
  const b = await browser();
  await save(b, true);
  const source = await f.order();
  await processCommerceAnalyticsOutbox(db());
  const event = (
    await sql<{
      id: string;
    }>`select id from analytics.commerce_events where organization_id=${f.organizationId} and business_id=${source.attemptId}`.execute(
      db(),
    )
  ).rows[0]!;
  const subject = (
    await sql<{
      id: string;
    }>`select id from analytics.privacy_browser_sessions where organization_id=${f.organizationId} order by created_at desc limit 1`.execute(
      db(),
    )
  ).rows[0]!;
  expect(
    await queueCommerceTestDelivery(
      db(),
      { organizationId: f.organizationId, subjectId: subject.id, scope: 'SESSION' },
      event.id,
      'ANALYTICS',
    ),
  ).toEqual({ queued: true });
  const before = (
    await sql`select (select count(*) from orders.orders) orders,(select count(*) from payments.payment_intents) obligations,
    (select count(*) from payments.payments) payments,(select count(*) from payments.refunds) refunds,(select count(*) from finance.finance_transactions) finance,
    (select count(*) from inventory.inventory_reservations) inventory,(select count(*) from promotions.promotion_usage) promotions,
    (select count(*) from cart.carts where status='CONVERTED') converted`.execute(db())
  ).rows;
  await save(b, false);
  let called = false;
  const delivery = await dispatchCommerceTestDeliveries(db(), {
    enabled: true,
    destination: {
      kind: 'TEST',
      send: async () => {
        called = true;
        return 'ACCEPTED';
      },
    },
  });
  expect(called).toBe(false);
  expect(delivery.suppressed).toBe(1);
  expect(
    (
      await sql`select (select count(*) from orders.orders) orders,(select count(*) from payments.payment_intents) obligations,
    (select count(*) from payments.payments) payments,(select count(*) from payments.refunds) refunds,(select count(*) from finance.finance_transactions) finance,
    (select count(*) from inventory.inventory_reservations) inventory,(select count(*) from promotions.promotion_usage) promotions,
    (select count(*) from cart.carts where status='CONVERTED') converted`.execute(db())
    ).rows,
  ).toEqual(before);
});
it('bounds preference writes with durable rate limits', async () => {
  const b = await browser();
  let response;
  for (let i = 0; i < 31; i++) response = await save(b, false);
  expect(response!.statusCode).toBe(429);
  expect(response!.headers['retry-after']).toBe('60');
});
it('fences two account browsers by account revision and applies withdrawal to both', async () => {
  let first = await browser('A'),
    second = await browser('A');
  expect((await save(first, true)).statusCode).toBe(200);
  expect((await save(second, true)).statusCode).toBe(409);
  second = await browser('A', second.cookie);
  expect(second.value.purposes.ANALYTICS.effectiveDecision).toBe('UNKNOWN');
  expect((await save(second, true)).statusCode).toBe(200);
  const old = { ...second, value: structuredClone(second.value) };
  const pending = { ...observation(old, 'WISHLIST_PAGE_VIEWED'), data: { mode: 'ACCOUNT' } };
  const positive = await send(old, pending);
  expect(positive.statusCode, positive.body).toBe(202);
  expect(positive.json().data.accepted).toBe(true);
  first = await browser('A', first.cookie);
  expect((await save(first, false)).statusCode).toBe(200);
  expect((await send(old, { ...pending, eventId: crypto.randomUUID() })).json().data.accepted).toBe(
    false,
  );
  expect((await browser('A', second.cookie)).value.purposes.ANALYTICS.effectiveDecision).toBe(
    'DENIED',
  );
});
it('makes a stored superseded policy UNKNOWN and rejects its prior observation proof', async () => {
  const b = await browser();
  await save(b, true);
  await sql`update analytics.commerce_consent set policy_version='superseded-policy' where organization_id=${f.organizationId} and subject_id=(select id from analytics.privacy_browser_sessions where organization_id=${f.organizationId} order by created_at desc limit 1)`.execute(
    db(),
  );
  expect((await send(b)).json().data.accepted).toBe(false);
  const current = await browser(undefined, b.cookie);
  expect(current.value.purposes.ANALYTICS.effectiveDecision).toBe('UNKNOWN');
  expect(current.value.observationToken).toBeNull();
});
