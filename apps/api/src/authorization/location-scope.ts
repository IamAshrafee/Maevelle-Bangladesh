import type { AdminContextRecord } from '@maevelle/database/platform';

/** Undefined means organization-wide. Any configured rows make the capability location-restricted. */
export function locationScopeIds(
  context: AdminContextRecord,
  capabilityCode: string,
): readonly string[] | undefined {
  if (context.membershipType === 'OWNER') return undefined;
  const configured = context.scopes
    .filter(
      (scope) =>
        scope.capabilityCode === capabilityCode && scope.scopeType === 'LOCATION',
    )
    .map((scope) => scope.scopeId);
  return configured.length ? configured : undefined;
}

export function canAccessLocation(
  context: AdminContextRecord,
  capabilityCode: string,
  locationId: string,
): boolean {
  const allowed = locationScopeIds(context, capabilityCode);
  return allowed === undefined || allowed.includes(locationId);
}

export function locationScopeError() {
  return {
    error: {
      code: 'LOCATION_SCOPE_FORBIDDEN',
      message: 'The active membership cannot access this location for the requested operation.',
    },
  };
}
