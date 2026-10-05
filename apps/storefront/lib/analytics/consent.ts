import type { CommerceConsentStateDto } from '@maevelle/contracts';

/** Privacy-safe state used before a consent preference has been recorded. */
export function unknownConsentState(
  recordedAt = new Date().toISOString(),
): CommerceConsentStateDto {
  return {
    necessary: 'GRANTED',
    analytics: 'UNKNOWN',
    marketing: 'UNKNOWN',
    preferences: 'UNKNOWN',
    recordedAt,
  };
}

export function permitsAnalytics(consent: CommerceConsentStateDto): boolean {
  return consent.analytics === 'GRANTED';
}

export function permitsMarketing(consent: CommerceConsentStateDto): boolean {
  return consent.marketing === 'GRANTED';
}
