'use client';

import type {
  CommerceAttributionDto,
  CommerceConsentStateDto,
  CommerceEventDataMapDto,
  CommerceEventDto,
  CommerceEventNameDto,
} from '@maevelle/contracts';

export const COMMERCE_EVENT_CHANNEL = 'maevelle:commerce-event';

export interface BrowserCommerceEventInput<Name extends CommerceEventNameDto> {
  readonly name: Name;
  readonly data: CommerceEventDataMapDto[Name];
  readonly consent: CommerceConsentStateDto;
  readonly sessionId: string;
  readonly anonymousId?: string;
  readonly attribution?: CommerceAttributionDto;
  /** Supply the initiating intent ID when a matching server event will be emitted. */
  readonly eventId?: string;
  readonly occurredAt?: string;
}

export function createBrowserCommerceEvent<Name extends CommerceEventNameDto>(
  input: BrowserCommerceEventInput<Name>,
): CommerceEventDto<Name> {
  return {
    schemaVersion: 1,
    name: input.name,
    eventId: input.eventId ?? crypto.randomUUID(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    origin: 'BROWSER',
    sessionId: input.sessionId,
    ...(input.anonymousId ? { anonymousId: input.anonymousId } : {}),
    consent: input.consent,
    ...(input.attribution ? { attribution: input.attribution } : {}),
    data: input.data,
  } as CommerceEventDto<Name>;
}

/**
 * Vendor-neutral, failure-isolated browser hand-off. Adapters subscribe to this
 * channel after consent and never become a dependency of the commerce action.
 */
export function publishCommerceEvent(event: CommerceEventDto): void {
  try {
    window.dispatchEvent(new CustomEvent(COMMERCE_EVENT_CHANNEL, { detail: event }));
    if (event.origin === 'BROWSER' && event.consent.analytics === 'GRANTED') {
      void fetch('/api/storefront/v1/analytics/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify(event),
      }).catch(() => undefined);
    }
  } catch {
    // Measurement is deliberately best-effort; commerce has already succeeded.
  }
}

/** Creates the pseudonymous per-tab key used for funnel denominators. */
export function storefrontAnalyticsSessionId(): string {
  const key = 'maevelle_analytics_session';
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
