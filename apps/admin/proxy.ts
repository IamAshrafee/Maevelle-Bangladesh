import { NextResponse, type NextRequest } from 'next/server';
import {
  adminPathHeader,
  internalAdminPath,
  publicAdminPaths,
  safeAdminReturnUrl,
} from './lib/auth/access-policy';
import { lookupAdminAccess } from './lib/auth/lookup';

function privateResponse(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

/** Runs for documents, RSC navigation, and prefetches, including persistent-layout navigations. */
export async function proxy(request: NextRequest) {
  const path = internalAdminPath(request.nextUrl.pathname);
  const forwarded = new Headers(request.headers);
  // Always overwrite caller-controlled routing metadata before server components consume it.
  forwarded.set(adminPathHeader, path);
  if (publicAdminPaths.has(path))
    return privateResponse(NextResponse.next({ request: { headers: forwarded } }));

  const access = await lookupAdminAccess(request.headers.get('cookie') ?? '', path);
  if (access.kind === 'AUTH_REQUIRED') {
    const login = new URL('/admin/login', request.url);
    login.searchParams.set(
      'redirect',
      safeAdminReturnUrl(`/admin${path === '/' ? '' : path}${request.nextUrl.search}`),
    );
    return privateResponse(NextResponse.redirect(login));
  }
  if (access.kind === 'TWO_FACTOR_ENROLLMENT_REQUIRED' && path !== '/account/security') {
    const enrollment = new URL('/admin/account/security', request.url);
    enrollment.searchParams.set(
      'redirect',
      safeAdminReturnUrl(`/admin${path === '/' ? '' : path}${request.nextUrl.search}`),
    );
    return privateResponse(NextResponse.redirect(enrollment));
  }
  if (access.kind === 'ACCESS_DENIED' || access.kind === 'AUTH_UNAVAILABLE') {
    const destination = new URL('/admin/access-status', request.url);
    destination.searchParams.set('reason', access.kind);
    destination.searchParams.set(
      'redirect',
      safeAdminReturnUrl(`/admin${path === '/' ? '' : path}${request.nextUrl.search}`),
    );
    forwarded.set(adminPathHeader, '/access-status');
    return privateResponse(
      NextResponse.rewrite(destination, {
        status: access.kind === 'ACCESS_DENIED' ? 403 : 503,
        request: { headers: forwarded },
      }),
    );
  }
  return privateResponse(NextResponse.next({ request: { headers: forwarded } }));
}

export const config = {
  matcher: ['/', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
