'use client';
import { currentCommerceConsent, permitsAnalytics } from './consent';
import { sendStorefrontObservation } from './observation-transport';
import { minimalBrowserData } from './observation-allowlist';

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

/** Failure-isolated first-party capture; no public vendor-event handoff. */
export function publishCommerceEvent(event: CommerceEventDto): void {
  try {
    const consent = currentCommerceConsent();
    if (event.origin !== 'BROWSER' || !permitsAnalytics(consent)) return;
    const data = minimalBrowserData(event.name, event.data as unknown as Record<string, unknown>);
    if (!data) return;
    const minimal = {
      schemaVersion: 1,
      eventId: event.eventId,
      name: event.name,
      origin: 'BROWSER',
      occurredAt: event.occurredAt,
      sessionId: event.sessionId,
      consent,
      data,
    };
    void sendStorefrontObservation(minimal);
  } catch {
    /* Optional measurement never changes a commerce result. */
  }
}

/** Creates the pseudonymous per-tab key used for funnel denominators. */
export function storefrontAnalyticsSessionId(): string {
  if (!permitsAnalytics(currentCommerceConsent())) return crypto.randomUUID();
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
