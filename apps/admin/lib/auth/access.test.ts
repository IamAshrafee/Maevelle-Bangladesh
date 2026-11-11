import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminContextDto } from '@maevelle/contracts';
import { decideAdminAccess, safeAdminReturnUrl } from './access-policy';
import { lookupAdminAccess } from './lookup';

const context: AdminContextDto = {
  actorId: 'actor',
  organizationId: 'organization',
  membershipId: 'membership',
  membershipType: 'STANDARD',
  capabilities: ['orders.view'],
  scopes: [],
  twoFactor: {
    isEnabled: false,
    isRequired: false,
    enrollmentRequired: false,
    accessRestricted: false,
    enrollmentDeadline: null,
  },
};
afterEach(() => vi.unstubAllGlobals());

describe('Admin access boundary', () => {
  it('allows only internal Admin return destinations without authentication loops', () => {
    expect(safeAdminReturnUrl('/admin/orders?page=2')).toBe('/admin/orders?page=2');
    for (const unsafe of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/administrator',
      '/orders',
      '/admin/login?redirect=/admin/login',
      '/admin/two-factor',
      '/admin/access-status',
      '/admin/%6cogin',
      '/admin/%2e%2e/login',
      '/admin/%252e%252e/login',
      '/admin/%5cevil',
    ]) {
      expect(safeAdminReturnUrl(unsafe), unsafe).toBe('/admin');
    }
  });
  it('gates pages using capabilities and gives enrollment precedence', () => {
    expect(decideAdminAccess(context, '/orders').kind).toBe('AUTHORIZED');
    expect(decideAdminAccess(context, '/finance').kind).toBe('ACCESS_DENIED');
    expect(decideAdminAccess(context, '/orders/new').kind).toBe('ACCESS_DENIED');
    expect(decideAdminAccess({ ...context, membershipType: 'OWNER' }, '/finance').kind).toBe(
      'AUTHORIZED',
    );
    expect(
      decideAdminAccess(
        { ...context, twoFactor: { ...context.twoFactor, accessRestricted: true } },
        '/orders',
      ).kind,
    ).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
  });
  it('does not call the API when no session cookies exist', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await lookupAdminAccess('', '/')).kind).toBe('AUTH_REQUIRED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires an Owner for Checkout settings even when a member can manage storefront settings', () => {
    const manager = { ...context, capabilities: ['settings.view', 'settings.storefront.manage'] };
    expect(decideAdminAccess(manager, '/settings/checkout').kind).toBe('ACCESS_DENIED');
    expect(
      decideAdminAccess({ ...manager, membershipType: 'OWNER' }, '/settings/checkout').kind,
    ).toBe('AUTHORIZED');
  });
  it('validates cookie-bearing requests with an uncached authoritative lookup', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(context));
    vi.stubGlobal('fetch', fetch);
    expect((await lookupAdminAccess('test=session', '/orders')).kind).toBe('AUTHORIZED');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/context'),
      expect.objectContaining({
        headers: { cookie: 'test=session' },
        cache: 'no-store',
        redirect: 'error',
      }),
    );
  });
  it('distinguishes expired sessions, denied access, outages and malformed responses', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const [status, kind] of [
      [401, 'AUTH_REQUIRED'],
      [403, 'ACCESS_DENIED'],
      [503, 'AUTH_UNAVAILABLE'],
    ] as const) {
      fetch.mockResolvedValueOnce(new Response(null, { status }));
      expect((await lookupAdminAccess('test=session', '/')).kind).toBe(kind);
    }
    fetch.mockRejectedValueOnce(new Error('unavailable'));
    expect((await lookupAdminAccess('test=session', '/')).kind).toBe('AUTH_UNAVAILABLE');
    fetch.mockResolvedValueOnce(Response.json({}));
    expect((await lookupAdminAccess('test=session', '/')).kind).toBe('AUTH_UNAVAILABLE');
  });
});
