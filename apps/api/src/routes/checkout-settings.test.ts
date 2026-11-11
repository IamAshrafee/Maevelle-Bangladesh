import Fastify from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { parseConfig } from '@maevelle/config';
import { sql } from '@maevelle/database';
import { runMigrations } from '@maevelle/database/migrate';
import { createOrganization, createOwnerMembership } from '@maevelle/database/platform';
import { isolatedCartDatabase } from '@maevelle/database/testing/cart';
import { registerAdminAccessGuard } from '../auth/admin-access-guard.js';
import type { createAuth } from '../auth/auth.js';
import { registerSettingsRoutes } from './settings.js';

const app = Fastify();
const path = '/admin/settings/checkout';
let fixture: Awaited<ReturnType<typeof isolatedCartDatabase>>;

beforeAll(async () => {
  fixture = await isolatedCartDatabase();
  await runMigrations(fixture.database.db);
  const config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: fixture.url,
    TEST_DATABASE_URL: fixture.url,
    BETTER_AUTH_SECRET: 'synthetic-checkout-settings-test-secret',
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  });
  const auth = {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('x-test-actor');
        return id ? { user: { id }, session: { id: 'synthetic-admin-session' } } : null;
      },
    },
  } as unknown as ReturnType<typeof createAuth>;
  registerAdminAccessGuard(app, fixture.database, auth);
  registerSettingsRoutes(app, fixture.database, auth, config);
}, 30_000);

afterAll(async () => {
  await app.close();
  await fixture?.close();
});

async function organization(label: string) {
  return createOrganization(fixture.database.db, {
    code: label,
    displayName: label,
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
}

async function user(label: string) {
  const email = `${label}@example.test`;
  const { rows } = await sql<{ id: string }>`insert into iam.users
    (name, email, email_normalized, email_verified)
    values (${label}, ${email}, ${email}, true) returning id`.execute(fixture.database.db);
  return rows[0]!.id;
}

it('limits an auditable, repeatable pause to the selected Owner organization', async () => {
  const store = await organization('checkout-control');
  const other = await organization('checkout-unaffected');
  const owner = await user('checkout-owner');
  await createOwnerMembership(fixture.database.db, store.id, owner, 'Checkout Owner');
  const otherOwner = await user('checkout-other-owner');
  await createOwnerMembership(fixture.database.db, other.id, otherOwner, 'Other Owner');
  const manager = await user('storefront-manager');
  await sql`with member as (
      insert into iam.organization_memberships
        (organization_id, user_id, membership_type, status, display_name, activated_at)
      values (${store.id}, ${manager}, 'STANDARD', 'ACTIVE', 'Storefront manager', now())
      returning id
    )
    insert into iam.membership_capability_grants (membership_id, capability_code)
    select member.id, capability.capability_code from member
    cross join iam.capability_definitions capability
    where capability.capability_code in ('settings.view', 'settings.storefront.manage')`.execute(
    fixture.database.db,
  );

  const headers = { 'x-organization-id': store.id, 'x-test-actor': owner };
  const pause = {
    method: 'POST',
    url: `${path}/pause`,
    payload: { reason: 'Hold new orders' },
  } as const;
  expect(
    (await app.inject({ ...pause, headers: { 'x-organization-id': store.id } })).statusCode,
  ).toBe(401);
  const managerHeaders = { ...headers, 'x-test-actor': manager };
  expect((await app.inject({ url: path, headers: managerHeaders })).statusCode).toBe(403);
  expect((await app.inject({ ...pause, headers: managerHeaders })).statusCode).toBe(403);
  expect(
    (await app.inject({ ...pause, headers: { ...headers, 'x-organization-id': other.id } }))
      .statusCode,
  ).toBe(403);
  expect((await app.inject({ ...pause, headers, payload: { reason: '   ' } })).statusCode).toBe(
    400,
  );
  expect(
    (await app.inject({ ...pause, headers, payload: { ...pause.payload, enabled: true } }))
      .statusCode,
  ).toBe(400);

  const before = await app.inject({ url: path, headers });
  expect(before.headers['cache-control']).toContain('no-store');
  expect(before.json()).toEqual({ data: { paused: false, releaseStatus: 'BLOCKED' } });

  const results = await Promise.all([
    app.inject({ ...pause, headers }),
    app.inject({ ...pause, headers }),
  ]);
  for (const result of results) {
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ data: { paused: true, releaseStatus: 'BLOCKED' } });
  }
  expect((await app.inject({ method: 'POST', url: `${path}/resume`, headers })).statusCode).toBe(
    404,
  );
  expect((await app.inject({ url: path, headers })).json().data.paused).toBe(true);
  const otherStatus = await app.inject({
    url: path,
    headers: { 'x-organization-id': other.id, 'x-test-actor': otherOwner },
  });
  expect(otherStatus.json().data.paused).toBe(false);

  const audit = await sql`select actor_id, reason, before_diff, after_diff from audit.audit_events
    where organization_id = ${store.id} and action = 'checkout.orders.paused'`.execute(
    fixture.database.db,
  );
  expect(audit.rows).toEqual([
    {
      actor_id: owner,
      reason: 'Hold new orders',
      before_diff: { enabled: true },
      after_diff: { enabled: false },
    },
  ]);
});
