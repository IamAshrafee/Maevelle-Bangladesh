import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, sql, type DatabaseClient } from '@maevelle/database';
import { createOrganization } from '@maevelle/database/platform';
import { registerMessagingRoutes } from './messaging.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 3,
});
let ownerUserId: string;
let standardUserId: string;
let organizationId: string;

beforeAll(async () => {
  organizationId = (
    await createOrganization(database.db, {
      code: `api-msg-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Messaging API Test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    })
  ).id;
  const users = await sql<{
    id: string;
    email: string;
  }>`insert into iam.users(name,email,email_normalized,email_verified,status) values
    ('Owner',${`owner-${crypto.randomUUID()}@example.test`},${`owner-normalized-${crypto.randomUUID()}@example.test`},true,'ACTIVE'),
    ('Standard',${`standard-${crypto.randomUUID()}@example.test`},${`standard-normalized-${crypto.randomUUID()}@example.test`},true,'ACTIVE') returning id,email`.execute(
    database.db,
  );
  ownerUserId = users.rows[0]!.id;
  standardUserId = users.rows[1]!.id;
  await sql`insert into iam.organization_memberships(organization_id,user_id,membership_type,status,display_name,activated_at) values
    (${organizationId},${ownerUserId},'OWNER','ACTIVE','Owner',now()),(${organizationId},${standardUserId},'STANDARD','ACTIVE','Standard',now())`.execute(
    database.db,
  );
});

afterAll(async () => database.close());

describe('messaging HTTP authentication boundary', () => {
  it('rejects an unauthenticated Admin request before database access', async () => {
    const app = Fastify();
    const auth = { api: { getSession: async () => null } };
    registerMessagingRoutes(app, {} as DatabaseClient, auth as never);
    const response = await app.inject({ method: 'GET', url: '/admin/messaging/conversations' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    await app.close();
  });

  it('denies a member without inbox capability and allows the Owner', async () => {
    let activeUserId = standardUserId;
    const auth = { api: { getSession: async () => ({ user: { id: activeUserId } }) } };
    const app = Fastify();
    registerMessagingRoutes(app, database, auth as never);
    const denied = await app.inject({
      method: 'GET',
      url: '/admin/messaging/conversations',
      headers: { 'x-organization-id': organizationId },
    });
    expect(denied.statusCode).toBe(403);
    activeUserId = ownerUserId;
    const allowed = await app.inject({
      method: 'GET',
      url: '/admin/messaging/conversations',
      headers: { 'x-organization-id': organizationId },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({
      data: [],
      pagination: { hasMore: false, nextCursor: null },
    });
    const settings = await app.inject({
      method: 'GET',
      url: '/admin/messaging/settings/channels',
      headers: { 'x-organization-id': organizationId },
    });
    expect(settings.statusCode).toBe(200);
    expect(settings.json()).toEqual({ data: [] });
    await app.close();
  });

  it('returns 410 before opening SSE when the replay cursor expired', async () => {
    const membership = await sql<{
      id: string;
    }>`select id from iam.organization_memberships where organization_id=${organizationId} and user_id=${ownerUserId}`.execute(
      database.db,
    );
    await sql`insert into messaging.realtime_streams(organization_id,next_sequence,retained_from_sequence) values(${organizationId},10,7) on conflict(organization_id) do update set next_sequence=10,retained_from_sequence=7`.execute(
      database.db,
    );
    const auth = { api: { getSession: async () => ({ user: { id: ownerUserId } }) } };
    const app = Fastify();
    registerMessagingRoutes(app, database, auth as never);
    const response = await app.inject({
      method: 'GET',
      url: '/admin/messaging/events?cursor=2',
      headers: { 'x-organization-id': organizationId },
    });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ error: { code: 'EVENT_CURSOR_EXPIRED' } });
    expect(membership.rows[0]).toBeDefined();
    await app.close();
  });
});
