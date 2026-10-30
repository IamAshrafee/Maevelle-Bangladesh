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

const consentKey = 'maevelle_commerce_consent_v1';

export function currentCommerceConsent(): CommerceConsentStateDto {
  try {
    const raw=window.localStorage.getItem(consentKey);
    if (raw) {
      const parsed=JSON.parse(raw) as Partial<CommerceConsentStateDto>;
      if (parsed.necessary==='GRANTED' && ['GRANTED','DENIED'].includes(parsed.analytics ?? '') &&
        typeof parsed.recordedAt==='string')
        return { necessary:'GRANTED', analytics:parsed.analytics!,
          marketing:parsed.marketing==='GRANTED'?'GRANTED':'DENIED',
          preferences:parsed.preferences==='GRANTED'?'GRANTED':'DENIED',recordedAt:parsed.recordedAt };
    }
  } catch { /* Storage may be unavailable. */ }
  return unknownConsentState();
}

export function saveCommerceConsent(analytics:'GRANTED'|'DENIED'): CommerceConsentStateDto {
  const value:CommerceConsentStateDto={necessary:'GRANTED',analytics,marketing:'DENIED',preferences:'DENIED',recordedAt:new Date().toISOString()};
  try { window.localStorage.setItem(consentKey,JSON.stringify(value)); } catch { /* Continue privately without persistence. */ }
  window.dispatchEvent(new Event('maevelle:consent-changed'));
  return value;
}
