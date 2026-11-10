import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { lookupAdminAccess } from '../lib/auth/lookup';
import { proxy, config } from '../proxy';

vi.mock('../lib/auth/lookup', () => ({ lookupAdminAccess: vi.fn() }));
const lookup = vi.mocked(lookupAdminAccess);
beforeEach(() => lookup.mockReset());

describe('Admin document and RSC entry protection', () => {
  it('explicitly matches the base-path root as well as nested routes', () => {
    expect(config.matcher).toContain('/');
  });
  it('redirects unauthorized documents and RSC prefetches before protected rendering', async () => {
    lookup.mockResolvedValue({ kind: 'AUTH_REQUIRED' });
    for (const headers of [{}, { rsc: '1', 'next-router-prefetch': '1' }]) {
      const response = await proxy(
        new NextRequest('http://localhost/admin/orders?page=2', { headers }),
      );
      expect(response.status).toBe(307);
      const login = new URL(response.headers.get('location')!);
      expect(login.pathname).toBe('/admin/login');
      expect(login.searchParams.get('redirect')).toBe('/admin/orders?page=2');
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(await response.text()).not.toContain('Dashboard');
    }
  });
  it('overwrites spoofed path metadata and leaves public authentication routes available', async () => {
    const response = await proxy(
      new NextRequest('http://localhost/admin/login', {
        headers: { 'x-maevelle-admin-path': '/finance' },
      }),
    );
    expect(response.headers.get('x-middleware-request-x-maevelle-admin-path')).toBe('/login');
    expect(lookup).not.toHaveBeenCalled();
  });
  it('rewrites denied and unavailable access to safe screens with correct status', async () => {
    for (const [kind, status] of [
      ['ACCESS_DENIED', 403],
      ['AUTH_UNAVAILABLE', 503],
    ] as const) {
      lookup.mockResolvedValueOnce({ kind });
      const response = await proxy(new NextRequest('http://localhost/admin/finance'));
      expect(response.status).toBe(status);
      expect(new URL(response.headers.get('x-middleware-rewrite')!).pathname).toBe(
        '/admin/access-status',
      );
      expect(response.headers.get('x-middleware-request-x-maevelle-admin-path')).toBe(
        '/access-status',
      );
    }
  });
});
