import type { PrivacyPreferencesDto, PrivacyDecision } from '@maevelle/contracts';

/** Controlled server-response fixture. A local-storage grant is intentionally insufficient. */
export function syntheticPrivacySnapshot(
  analytics: PrivacyDecision = 'GRANTED',
  advertising: PrivacyDecision = 'DENIED',
): PrivacyPreferencesDto {
  const changedAt = new Date(Date.now() - 1000).toISOString();
  const purpose = (decision: PrivacyDecision) => ({
    decision,
    effectiveDecision: decision,
    revision: '1',
    browserRevision: '1',
    policyVersion: 'privacy-choices-v1',
    changedAt,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  return {
    schemaVersion: 1,
    scope: 'SESSION',
    context: 'c'.repeat(43),
    policyVersion: 'privacy-choices-v1',
    purposes: { ANALYTICS: purpose(analytics), ADVERTISING: purpose(advertising) },
    observationToken: analytics === 'GRANTED' ? 'o'.repeat(43) : null,
    observationNotBefore: analytics === 'GRANTED' ? changedAt : null,
    externalDispatchEnabled: false,
  };
}
