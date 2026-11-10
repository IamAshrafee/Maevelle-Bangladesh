import type { AdminContextDto } from '@maevelle/contracts';
import { decideAdminAccess, type AdminAccessDecision } from './access-policy';

/** Only a trusted deployment origin receives session credentials; never derive it from Host. */
export function adminInternalApiOrigin(): string {
  const url = new URL(process.env.ADMIN_INTERNAL_API_URL ?? 'http://127.0.0.1:3002');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('ADMIN_INTERNAL_API_URL must be an HTTP(S) origin.');
  }
  return url.origin;
}

export async function lookupAdminAccess(
  cookie: string,
  pathname: string,
): Promise<AdminAccessDecision> {
  // No cookies means no session. A cookie's presence never establishes authentication.
  if (!cookie) return { kind: 'AUTH_REQUIRED' };
  try {
    const response = await fetch(`${adminInternalApiOrigin()}/admin/context`, {
      headers: { cookie },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 401) return { kind: 'AUTH_REQUIRED' };
    if (response.status === 403) return { kind: 'ACCESS_DENIED' };
    if (!response.ok) return { kind: 'AUTH_UNAVAILABLE' };
    const context = (await response.json()) as AdminContextDto;
    if (
      !context.actorId ||
      !context.membershipId ||
      !context.organizationId ||
      !['OWNER', 'STANDARD'].includes(context.membershipType) ||
      !Array.isArray(context.capabilities) ||
      !context.twoFactor ||
      typeof context.twoFactor.accessRestricted !== 'boolean'
    ) {
      return { kind: 'AUTH_UNAVAILABLE' };
    }
    return decideAdminAccess(context, pathname);
  } catch {
    return { kind: 'AUTH_UNAVAILABLE' };
  }
}
