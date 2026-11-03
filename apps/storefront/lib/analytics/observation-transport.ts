import type { CommerceConsentStateDto } from '@maevelle/contracts';
import { currentCommerceConsent, permitsAnalytics } from './consent';

/** One in-memory retry reuses the serialized observation and its event ID. */
export async function sendStorefrontObservation(
  event: { readonly consent: CommerceConsentStateDto },
  credentials: 'include' | 'omit',
): Promise<boolean> {
  function stillConsented() {
    const current = currentCommerceConsent();
    return permitsAnalytics(current) && current.recordedAt === event.consent.recordedAt;
  }
  const payload = JSON.stringify(event);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!stillConsented()) return false;
    const controller = new AbortController();
    const onConsentChange = () => {
      if (!stillConsented()) controller.abort();
    };
    window.addEventListener('maevelle:consent-changed', onConsentChange);
    window.addEventListener('storage', onConsentChange);
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/storefront/v1/analytics/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials,
        ...(credentials === 'omit' ? { referrerPolicy: 'no-referrer' as const } : {}),
        keepalive: true,
        signal: controller.signal,
        body: payload,
      });
      return response.ok;
    } catch {
      if (controller.signal.aborted || attempt === 1 || !stillConsented()) return false;
    } finally {
      clearTimeout(timeout);
      window.removeEventListener('maevelle:consent-changed', onConsentChange);
      window.removeEventListener('storage', onConsentChange);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
