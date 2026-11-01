import { wishlistObservationNames, type WishlistObservationDto } from '@maevelle/contracts';
export class WishlistObservationError extends Error {
  readonly code = 'INVALID_ANALYTICS_EVENT';
}

/** Exact minimal schema, also called before Fastify can remove unknown properties. */
export function validateWishlistObservation(
  value: unknown,
): asserts value is WishlistObservationDto {
  const fail = () => {
    throw new WishlistObservationError('Invalid Wishlist observation.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  const required = [
    'schemaVersion',
    'eventId',
    'name',
    'origin',
    'occurredAt',
    'sessionId',
    'consent',
    'data',
  ];
  if (Object.keys(v).length !== required.length || required.some((key) => !(key in v)))
    return fail();
  if (
    v.schemaVersion !== 1 ||
    v.origin !== 'BROWSER' ||
    !wishlistObservationNames.includes(v.name as never)
  )
    return fail();
  for (const key of ['eventId', 'sessionId'])
    if (
      typeof v[key] !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v[key])
    )
      return fail();
  if (
    typeof v.occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(v.occurredAt)) ||
    Date.parse(v.occurredAt) > Date.now() + 300000 ||
    Date.parse(v.occurredAt) < Date.now() - 86400000
  )
    return fail();
  const consent = v.consent as Record<string, unknown> | null;
  if (
    !consent ||
    typeof consent !== 'object' ||
    Array.isArray(consent) ||
    Object.keys(consent).length !== 5 ||
    consent.necessary !== 'GRANTED' ||
    ['analytics', 'marketing', 'preferences'].some(
      (key) => !['GRANTED', 'DENIED', 'UNKNOWN'].includes(String(consent[key])),
    ) ||
    typeof consent.recordedAt !== 'string' ||
    !Number.isFinite(Date.parse(consent.recordedAt)) ||
    Date.parse(consent.recordedAt) > Date.now() + 300000
  )
    return fail();
  const data = v.data as Record<string, unknown> | null;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).some((key) => !['mode', 'scope'].includes(key)) ||
    !['GUEST', 'ACCOUNT'].includes(String(data.mode)) ||
    (data.scope !== undefined && !['ALL', 'SELECTED'].includes(String(data.scope)))
  )
    return fail();
  if (v.name === 'WISHLIST_SCOPE_SELECTED' && !data.scope) return fail();
  if (String(v.name).startsWith('WISHLIST_GUEST_') && data.mode !== 'GUEST') return fail();
}
