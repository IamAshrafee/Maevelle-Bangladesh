import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createDatabase, sql, type DatabaseClient } from '@maevelle/database';
import { runMigrations } from '@maevelle/database/migrate';
import { createOrganization } from '@maevelle/database/platform';
import { registerAnalyticsRoutes } from './routes/analytics.js';
import type { WishlistObservationDto } from '@maevelle/contracts';

const url = process.env.TEST_DATABASE_URL!;
const name = `maevelle_wishlist_api_${crypto.randomUUID().replaceAll('-', '')}`;
let admin: DatabaseClient;
let database: DatabaseClient;
let app: FastifyInstance;
let org: string;
let other: string;
let userId: string;
let membershipId: string;
const endpoints = ['summary', 'activity', 'products', 'categories', 'sharing', 'operations'];
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const period = `from=${today}&to=${today}`;
function event(): WishlistObservationDto {
  return {
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    name: 'WISHLIST_RECIPIENT_VIEWED',
    origin: 'BROWSER',
    occurredAt: new Date().toISOString(),
    sessionId: crypto.randomUUID(),
    consent: {
      necessary: 'GRANTED',
      analytics: 'GRANTED',
      marketing: 'DENIED',
      preferences: 'UNKNOWN',
      recordedAt: new Date().toISOString(),
    },
    data: { mode: 'GUEST' },
  };
}
beforeAll(async () => {
  if (
    !url ||
    new URL(url).pathname !== '/maevelle_test' ||
    (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) &&
      !/^maevelle-ci-pg-[a-f0-9]{12}$/.test(new URL(url).hostname))
  )
    throw new Error('Dedicated Phase 06A test PostgreSQL required');
  const a = new URL(url);
  a.pathname = '/postgres';
  admin = createDatabase({ connectionString: a.toString(), maxConnections: 1 });
  await sql.raw(`create database "${name}"`).execute(admin.db);
  const d = new URL(url);
  d.pathname = `/${name}`;
  database = createDatabase({ connectionString: d.toString(), maxConnections: 4 });
  await runMigrations(database.db);
  const fixture = (code: string) =>
    createOrganization(database.db, {
      code,
      displayName: code,
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
  org = (await fixture('maevelle')).id;
  other = (await fixture('other')).id;
  userId = (
    await sql<{
      id: string;
    }>`insert into iam.users(name,email,email_verified) values ('Admin','admin-analytics@example.test',true) returning id::text`.execute(
      database.db,
    )
  ).rows[0]!.id;
  membershipId = (
    await sql<{
      id: string;
    }>`insert into iam.organization_memberships(organization_id,user_id,membership_type,status,display_name,activated_at)
    values (${org},${userId}::uuid,'STANDARD','ACTIVE','Analyst',now()) returning id::text`.execute(
      database.db,
    )
  ).rows[0]!.id;
  app = Fastify({ logger: false });
  // Authentication adapter is controlled here; actual IAM membership/capability queries run in PostgreSQL.
  const auth = {
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.get('authorization') === 'test-admin' ? { user: { id: userId } } : null,
    },
  } as unknown as Parameters<typeof registerAnalyticsRoutes>[2];
  registerAnalyticsRoutes(app, database, auth, 'maevelle');
  await app.ready();
}, 30000);
afterAll(async () => {
  await app?.close();
  await database?.close();
  if (admin) {
    await sql.raw(`drop database if exists "${name}"`).execute(admin.db);
    await admin.close();
  }
});

describe('registered Wishlist analytics routes', () => {
  it('requires IAM analytics.view on every endpoint, and forbids cross organization selection', async () => {
    for (const endpoint of endpoints) {
      const path = `/admin/analytics/wishlist/${endpoint}?${period}`;
      expect((await app.inject({ url: path })).statusCode).toBe(403);
      expect(
        (await app.inject({ url: path, headers: { authorization: 'test-admin' } })).statusCode,
      ).toBe(403);
    }
    await sql`insert into iam.membership_capability_grants(membership_id,capability_code) values (${membershipId}::uuid,'analytics.view')`.execute(
      database.db,
    );
    for (const endpoint of endpoints) {
      const path = `/admin/analytics/wishlist/${endpoint}?${period}`;
      const response = await app.inject({ url: path, headers: { authorization: 'test-admin' } });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.json().data.metadata).toMatchObject({
        timezone: 'Asia/Dhaka',
        pendingEvents: 0,
        historyComplete: false,
      });
      expect(
        (
          await app.inject({
            url: path,
            headers: { authorization: 'test-admin', 'x-organization-id': other },
          })
        ).statusCode,
      ).toBe(403);
      expect(response.body).not.toContain(userId);
      expect(response.body).not.toContain(membershipId);
    }
  });
  it('rejects invalid ranges, oversized pages, arbitrary filtering and sorting', async () => {
    for (const query of [
      'from=2026-02-30&to=2026-03-01',
      'from=2026-11-02&to=2026-11-01',
      'from=2026-01-01&to=2026-11-01',
      `${period}&pageSize=101`,
      `${period}&customerId=${userId}`,
      `${period}&sort=password`,
    ]) {
      const response = await app.inject({
        url: `/admin/analytics/wishlist/products?${query}`,
        headers: { authorization: 'test-admin' },
      });
      expect([400, 422], response.body).toContain(response.statusCode);
    }
  });
  it('accepts minimal consented observations and deduplicates without claiming recipient authority', async () => {
    const input = event();
    const response = await app.inject({
      method: 'POST',
      url: '/storefront/v1/analytics/events',
      payload: input,
    });
    expect(response.statusCode, response.body).toBe(202);
    expect(response.json().data).toMatchObject({ accepted: true, duplicate: false });
    const replay = await app.inject({
      method: 'POST',
      url: '/storefront/v1/analytics/events',
      payload: input,
    });
    expect(replay.json().data.duplicate).toBe(true);
    const denied = event();
    denied.consent.analytics = 'DENIED';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/storefront/v1/analytics/events',
          payload: denied,
        })
      ).json().data.accepted,
    ).toBe(false);
    const otherHeader = await app.inject({
      method: 'POST',
      url: '/storefront/v1/analytics/events',
      headers: { 'x-organization-id': other },
      payload: event(),
    });
    expect(otherHeader.statusCode).toBe(202);
    const rows = await sql<{
      count: number;
    }>`select count(*)::int count from analytics.storefront_events where organization_id=${other}`.execute(
      database.db,
    );
    expect(rows.rows[0]!.count).toBe(0);
  });
  it('rejects unknown fields before schema stripping, secrets, spoofed outcomes and old observations', async () => {
    const base = event();
    for (const payload of [
      { ...base, data: { mode: 'GUEST', viewToken: 'a'.repeat(43) } },
      { ...base, data: { mode: 'GUEST', manageToken: 'a'.repeat(43) } },
      { ...base, data: { mode: 'GUEST', url: 'https://evil.test/wishlist/shared#secret' } },
      { ...base, organizationId: other },
      { ...base, attribution: { shareId: crypto.randomUUID() } },
      { ...base, origin: 'SERVER' },
      { ...base, name: 'wishlist.item.saved' },
      { ...base, name: 'WISHLIST_UNKNOWN' },
      { ...base, occurredAt: '2020-01-01T00:00:00Z' },
      { ...base, consent: undefined },
      { ...base, data: { mode: 'GUEST', secret: 'x'.repeat(20000) } },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/storefront/v1/analytics/events',
        payload,
      });
      expect([400, 413, 422], response.body).toContain(response.statusCode);
    }
    expect(
      (
        await app.inject({
          url: `/admin/analytics/wishlist/sharing?${period}`,
          headers: { authorization: 'test-admin' },
        })
      ).json().data.metadata.unavailable,
    ).toContain('VERIFIED_SHARE_SAVE_ATTRIBUTION');
  });
});
