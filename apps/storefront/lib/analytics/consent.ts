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

// The earlier prompt covered product views and selections. Preserve denials and renew grants.
const consentKey = 'maevelle_commerce_consent_v2';
const previousConsentKey = 'maevelle_commerce_consent_v1';
let unsavedDenial: CommerceConsentStateDto | undefined;

function readConsent(key: string): CommerceConsentStateDto | undefined {
  const raw = window.localStorage.getItem(key);
  if (!raw) return;
  const parsed = JSON.parse(raw) as Partial<CommerceConsentStateDto> | null;
  if (
    parsed?.necessary === 'GRANTED' &&
    (parsed.analytics === 'GRANTED' || parsed.analytics === 'DENIED') &&
    typeof parsed.recordedAt === 'string' &&
    Number.isFinite(Date.parse(parsed.recordedAt))
  ) {
    return {
      necessary: 'GRANTED',
      analytics: parsed.analytics,
      marketing: parsed.marketing === 'GRANTED' ? 'GRANTED' : 'DENIED',
      preferences: parsed.preferences === 'GRANTED' ? 'GRANTED' : 'DENIED',
      recordedAt: parsed.recordedAt,
    };
  }
}

export function currentCommerceConsent(): CommerceConsentStateDto {
  if (unsavedDenial) return unsavedDenial;
  try {
    const current = readConsent(consentKey);
    if (current) return current;
    const previous = readConsent(previousConsentKey);
    if (previous?.analytics === 'DENIED') return previous;
  } catch {
    /* Storage may be unavailable. */
  }
  return unknownConsentState();
}

export function saveCommerceConsent(analytics: 'GRANTED' | 'DENIED'): CommerceConsentStateDto {
  const value: CommerceConsentStateDto = {
    necessary: 'GRANTED',
    analytics,
    marketing: 'DENIED',
    preferences: 'DENIED',
    recordedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(consentKey, JSON.stringify(value));
    unsavedDenial = undefined;
  } catch {
    if (analytics === 'DENIED') {
      unsavedDenial = value;
      try {
        window.localStorage.removeItem(consentKey);
      } catch {
        /* Deny in this tab. */
      }
    }
  }
  window.dispatchEvent(new Event('maevelle:consent-changed'));
  return value;
}
