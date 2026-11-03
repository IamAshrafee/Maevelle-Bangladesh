'use client';

import type { WishlistObservationDto, WishlistObservationName } from '@maevelle/contracts';
import { currentCommerceConsent, permitsAnalytics } from './consent';
import { storefrontAnalyticsSessionId, COMMERCE_EVENT_CHANNEL } from './events';

export interface EmitWishlistObservationOptions {
  readonly name: WishlistObservationName;
  readonly mode: 'GUEST' | 'ACCOUNT';
  readonly scope?: 'ALL' | 'SELECTED';
  /** Optional pre-allocated stable eventId for retries or correlation */
  readonly eventId?: string;
}

/**
 * Creates a schema-compliant WishlistObservationDto strictly conforming
 * to the backend's validateWishlistObservation 8-key requirement.
 *
 * Rejects any extraneous fields to prevent 422 INVALID_ANALYTICS_EVENT.
 */
export function buildWishlistObservation(
  options: EmitWishlistObservationOptions,
): WishlistObservationDto {
  const consent = currentCommerceConsent();
  const eventId = options.eventId ?? crypto.randomUUID();
  const occurredAt = new Date().toISOString();
  const sessionId = storefrontAnalyticsSessionId();

  const data: { mode: 'GUEST' | 'ACCOUNT'; scope?: 'ALL' | 'SELECTED' } = {
    mode: options.mode,
  };

  if (options.scope) {
    data.scope = options.scope;
  }

  // Exactly 8 root keys: schemaVersion, eventId, name, origin, occurredAt, sessionId, consent, data
  return {
    schemaVersion: 1,
    eventId,
    name: options.name,
    origin: 'BROWSER',
    occurredAt,
    sessionId,
    consent: {
      necessary: 'GRANTED',
      analytics: consent.analytics,
      marketing: consent.marketing ?? 'DENIED',
      preferences: consent.preferences ?? 'DENIED',
      recordedAt: consent.recordedAt,
    },
    data,
  };
}

/** Only mount observations are render-deduplicated; separate user actions must remain distinct. */
const mountObservations = new Set<WishlistObservationName>([
  'WISHLIST_PAGE_VIEWED',
  'WISHLIST_SHARE_OPENED',
  'WISHLIST_RECIPIENT_VIEWED',
]);
const recentlyEmittedEvents = new Map<string, number>();

/** Best-effort measurement. Consent is checked at construction and before every network attempt. */
export async function emitWishlistObservation(
  options: EmitWishlistObservationOptions,
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (!permitsAnalytics(currentCommerceConsent())) return false;
    const dedupKey = `${options.name}:${options.mode}:${options.scope ?? ''}`;
    const now = Date.now();
    const lastEmitted = recentlyEmittedEvents.get(dedupKey);
    if (mountObservations.has(options.name) && lastEmitted !== undefined && now - lastEmitted < 300)
      return false;
    const observation = buildWishlistObservation(options);
    if (mountObservations.has(options.name)) recentlyEmittedEvents.set(dedupKey, now);
    window.dispatchEvent(new CustomEvent(COMMERCE_EVENT_CHANNEL, { detail: observation }));
    const payload = JSON.stringify(observation);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!permitsAnalytics(currentCommerceConsent())) return false;
      const controller = new AbortController();
      const onConsentChange = () => {
        if (!permitsAnalytics(currentCommerceConsent())) controller.abort();
      };
      window.addEventListener('maevelle:consent-changed', onConsentChange);
      window.addEventListener('storage', onConsentChange);
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch('/api/storefront/v1/analytics/events', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          signal: controller.signal,
          body: payload,
        });
        return response.ok;
      } catch {
        if (
          controller.signal.aborted ||
          attempt === 1 ||
          !permitsAnalytics(currentCommerceConsent())
        )
          return false;
      } finally {
        clearTimeout(timeout);
        window.removeEventListener('maevelle:consent-changed', onConsentChange);
        window.removeEventListener('storage', onConsentChange);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  } catch {
    return false;
  }
}
