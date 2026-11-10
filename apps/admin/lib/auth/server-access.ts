import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminPathHeader, publicAdminPaths, safeAdminReturnUrl } from './access-policy';
import { lookupAdminAccess } from './lookup';

/** Request-local deduplication only; never cache sessions across users or requests. */
export const requireAdminAccess = cache(async () => {
  const incoming = await headers();
  const path = incoming.get(adminPathHeader);
  if (path && publicAdminPaths.has(path)) return undefined;
  // Missing trusted proxy metadata fails closed, including accidental unguarded routes.
  if (!path) redirect('/access-status?reason=AUTH_UNAVAILABLE');
  const access = await lookupAdminAccess(incoming.get('cookie') ?? '', path);
  const destination = safeAdminReturnUrl(`/admin${path === '/' ? '' : path}`);
  if (access.kind === 'AUTHORIZED') return access.context;
  if (access.kind === 'TWO_FACTOR_ENROLLMENT_REQUIRED') {
    if (path === '/account/security') return access.context;
    redirect(`/account/security?redirect=${encodeURIComponent(destination)}`);
  }
  if (access.kind === 'AUTH_REQUIRED')
    redirect(`/login?redirect=${encodeURIComponent(destination)}`);
  redirect(`/access-status?reason=${access.kind}&redirect=${encodeURIComponent(destination)}`);
});
