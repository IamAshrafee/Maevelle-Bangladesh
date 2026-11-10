'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminContextDto } from '@maevelle/contracts';
import { decideAdminAccess, publicAdminPaths, safeAdminReturnUrl } from './access-policy';
import { observeAdminApiAccess } from './observe-api-access';

export function useAdminAccess(pathname: string, initialContext?: AdminContextDto) {
  const [context, setContext] = useState(initialContext);
  const [failure, setFailure] = useState<
    'ACCESS_DENIED' | 'AUTH_UNAVAILABLE' | 'CHECKING' | undefined
  >();
  const generation = useRef(0);
  const signingOut = useRef(false);
  const checkedPath = useRef(initialContext ? pathname : undefined);
  const isPublic = publicAdminPaths.has(pathname);

  const refresh = useCallback(async () => {
    if (signingOut.current || publicAdminPaths.has(pathname)) return;
    const current = ++generation.current;
    try {
      const response = await fetch('/api/admin/context', {
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (current !== generation.current) return;
      if (response.status === 401) {
        setContext(undefined);
        setFailure('CHECKING');
        window.location.replace(
          `/admin/login?redirect=${encodeURIComponent(safeAdminReturnUrl(window.location.pathname + window.location.search))}`,
        );
        return;
      }
      if (!response.ok) {
        setContext(undefined);
        setFailure(response.status === 403 ? 'ACCESS_DENIED' : 'AUTH_UNAVAILABLE');
        return;
      }
      const next = (await response.json()) as AdminContextDto;
      if (current !== generation.current) return;
      const decision = decideAdminAccess(next, pathname);
      if (decision.kind === 'ACCESS_DENIED') {
        setContext(undefined);
        setFailure('ACCESS_DENIED');
        return;
      }
      setContext(next);
      setFailure(undefined);
    } catch {
      if (current !== generation.current) return;
      setContext(undefined);
      setFailure('AUTH_UNAVAILABLE');
    }
  }, [pathname]);

  const signOut = async () => {
    signingOut.current = true;
    ++generation.current;
    setContext(undefined);
    setFailure('CHECKING');
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error('Sign out unavailable');
      // A full navigation discards this tab's in-memory protected route cache.
      window.location.replace('/admin/login');
    } catch {
      signingOut.current = false;
      setFailure('AUTH_UNAVAILABLE');
    }
  };

  useEffect(() => {
    if (isPublic) return;
    if (checkedPath.current !== pathname) void refresh();
    checkedPath.current = pathname;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    let queued: ReturnType<typeof setTimeout> | undefined;
    const stopObserving = observeAdminApiAccess((status) => {
      if (status === 401) {
        setContext(undefined);
        setFailure('CHECKING');
      }
      // Several dashboard requests can fail together. Never replay business requests.
      if (queued === undefined)
        queued = setTimeout(() => {
          queued = undefined;
          void refresh();
        }, 50);
    });
    const interval = window.setInterval(onVisible, 60_000);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('maevelle:account-updated', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      ++generation.current;
      stopObserving();
      if (queued !== undefined) clearTimeout(queued);
      window.clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('maevelle:account-updated', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isPublic, pathname, refresh]);

  // A newly forbidden route must not reuse the last page's capabilities while rechecking.
  const decision = context ? decideAdminAccess(context, pathname) : undefined;
  return {
    context,
    refresh,
    signOut,
    failure:
      failure ??
      (decision?.kind === 'ACCESS_DENIED' ? 'ACCESS_DENIED' : context ? undefined : 'CHECKING'),
  };
}
