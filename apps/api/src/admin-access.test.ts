import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { DatabaseClient } from '@maevelle/database';
import type { MaevelleAuth } from './auth/auth.js';
import { registerAdminAccessGuard } from './auth/admin-access-guard.js';
import { registerAdminContextRoute } from './routes/admin-context.js';

const mocks = vi.hoisted(() => ({ membership: vi.fn(), twoFactor: vi.fn(), session: vi.fn() }));
vi.mock('@maevelle/database/platform', () => ({ findActiveAdminContext: mocks.membership }));
vi.mock('@maevelle/database/iam', () => ({ resolveTwoFactorAccessState: mocks.twoFactor }));
const active = {
  organizationId: 'organization',
  membershipId: 'membership',
  membershipType: 'STANDARD',
  capabilities: ['orders.view'],
  scopes: [],
};
const security = {
  isEnabled: false,
  isRequired: false,
  enrollmentRequired: false,
  accessRestricted: false,
  policy: { enrollmentDeadline: null },
};
const database = { db: {} } as DatabaseClient;
const auth = { api: { getSession: mocks.session } } as unknown as MaevelleAuth;
const apps: ReturnType<typeof Fastify>[] = [];
function application() {
  const app = Fastify();
  apps.push(app);
  registerAdminAccessGuard(app, database, auth);
  registerAdminContextRoute(app, database, auth);
  app.get('/admin/orders', async () => ({ data: 'protected' }));
  app.get('/admin/security/two-factor/status', async () => ({ data: 'security' }));
  return app;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'actor' }, session: { id: 'session' } });
  mocks.membership.mockResolvedValue(active);
  mocks.twoFactor.mockResolvedValue(security);
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Fastify Admin authentication and security policy', () => {
  it('rejects absent and incomplete sign-in sessions before business operations', async () => {
    const app = application();
    for (const session of [null, { user: { id: 'actor' } }]) {
      mocks.session.mockResolvedValue(session);
      for (const url of ['/admin/context', '/admin/orders']) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(401);
        expect(response.headers['cache-control']).toContain('no-store');
        expect(response.body).not.toContain('protected');
      }
    }
    expect(mocks.membership).not.toHaveBeenCalled();
  });
  it('denies revoked membership and isolates organization selection', async () => {
    mocks.membership.mockResolvedValue(undefined);
    const response = await application().inject({
      url: '/admin/orders',
      headers: { 'x-organization-id': 'selected' },
    });
    expect(response.statusCode).toBe(403);
    expect(mocks.membership).toHaveBeenCalledWith(database.db, 'actor', {
      organizationId: 'selected',
    });
    expect(mocks.twoFactor).not.toHaveBeenCalled();
  });
  it('blocks business operations during required enrollment while allowing enrollment tools', async () => {
    mocks.twoFactor.mockResolvedValue({ ...security, accessRestricted: true });
    const app = application();
    expect((await app.inject({ url: '/admin/orders' })).json().error.code).toBe(
      'TWO_FACTOR_ENROLLMENT_REQUIRED',
    );
    expect((await app.inject({ url: '/admin/security/two-factor/status' })).statusCode).toBe(200);
  });
  it('returns unavailable instead of treating session and membership outages as logged out', async () => {
    const app = application();
    mocks.session.mockRejectedValue(new Error('unavailable'));
    expect((await app.inject({ url: '/admin/context' })).statusCode).toBe(503);
    expect((await app.inject({ url: '/admin/orders' })).statusCode).toBe(503);
    mocks.session.mockResolvedValue({ user: { id: 'actor' }, session: { id: 'session' } });
    mocks.membership.mockRejectedValue(new Error('unavailable'));
    expect((await app.inject({ url: '/admin/orders' })).statusCode).toBe(503);
  });
  it('returns authorized context privately without caching', async () => {
    const response = await application().inject({ url: '/admin/context' });
    expect(response.statusCode).toBe(200);
    expect(response.json().membershipId).toBe('membership');
    expect(response.headers['cache-control']).toContain('no-store');
  });
});
