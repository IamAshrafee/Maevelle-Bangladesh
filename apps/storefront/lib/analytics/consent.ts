'use client';

import type {
  CommerceConsentStateDto,
  PrivacyPreferencesDto,
  SavePrivacyPreferencesDto,
} from '@maevelle/contracts';
import { requestWithDeadline } from '@/lib/api/client/deadline';
import { StorefrontClientApiError } from '@/lib/api/client/http';

export type PrivacyClientState = {
  phase: 'unresolved' | 'loading' | 'ready' | 'saving' | 'conflict' | 'unavailable';
  snapshot?: PrivacyPreferencesDto;
  message?: string;
};
const initial: PrivacyClientState = { phase: 'unresolved' };
let state = initial;
let epoch = 0;
let paused = true;
let request: AbortController | undefined;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();
const denyKey = 'maevelle_privacy_paused_v1';
export const privacySignalKey = 'maevelle_privacy_signal_v1';
export function subscribePrivacy(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const privacyClientState = () => state;
export const privacyServerState = () => initial;
function publish(next: PrivacyClientState) {
  state = next;
  for (const listener of listeners) listener();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('maevelle:consent-changed'));
}
function guardPresent() {
  try {
    return window.localStorage.getItem(denyKey) === '1';
  } catch {
    return false;
  }
}
function broadcast() {
  try {
    window.localStorage.setItem(privacySignalKey, crypto.randomUUID());
  } catch {
    /* Server checks remain authoritative across tabs. */
  }
}
export function pauseCommerceConsent(persist = false) {
  paused = true;
  if (persist) {
    try {
      window.localStorage.setItem(denyKey, '1');
    } catch {
      /* In-memory refusal remains effective. */
    }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('maevelle:consent-changed'));
}
export function invalidatePrivacyPreferences() {
  epoch++;
  request?.abort();
  loading = undefined;
  pauseCommerceConsent();
  publish({ phase: 'unresolved' });
}
export function acceptPrivacySnapshot(snapshot: PrivacyPreferencesDto, confirmedSave = false) {
  if (typeof window === 'undefined') return;
  if (
    snapshot.schemaVersion !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(snapshot.context) ||
    snapshot.externalDispatchEnabled !== false
  )
    throw new Error('Invalid privacy response');
  if (confirmedSave) {
    try {
      window.localStorage.removeItem(denyKey);
    } catch {
      /* Never rely on storage to grant consent. */
    }
  }
  paused = guardPresent();
  publish({ phase: 'ready', snapshot });
}
export async function loadPrivacyPreferences(notice?: string): Promise<void> {
  if (loading) return loading;
  const generation = ++epoch;
  request?.abort();
  request = new AbortController();
  pauseCommerceConsent();
  publish({ phase: 'loading' });
  const signal = request.signal;
  loading = (async () => {
    try {
      const snapshot = await requestWithDeadline<PrivacyPreferencesDto>(
        '/api/storefront/v1/analytics/consent',
        {
          signal,
          cache: 'no-store',
          headers: { 'x-privacy-request': '1' },
          referrerPolicy: 'no-referrer',
        },
      );
      if (generation === epoch) {
        acceptPrivacySnapshot(snapshot);
        if (notice) publish({ phase: 'conflict', snapshot, message: notice });
      }
    } catch {
      if (generation === epoch)
        publish({
          phase: 'unavailable',
          message:
            'Privacy choices could not be loaded. Optional measurement is paused. You can keep shopping and try again here.',
        });
    } finally {
      if (generation === epoch) loading = undefined;
    }
  })();
  return loading;
}
export async function savePrivacyChoices(
  analytics: boolean,
  advertising: boolean,
): Promise<boolean> {
  const snapshot = state.snapshot;
  if (!snapshot || state.phase === 'saving') return false;
  const generation = ++epoch;
  request?.abort();
  request = new AbortController();
  pauseCommerceConsent(true);
  broadcast();
  publish({ phase: 'saving', snapshot });
  const choices = {} as SavePrivacyPreferencesDto['choices'];
  for (const purpose of ['ANALYTICS', 'ADVERTISING'] as const)
    choices[purpose] = {
      decision: (purpose === 'ANALYTICS' ? analytics : advertising) ? 'GRANTED' : 'DENIED',
      expectedRevision: snapshot.purposes[purpose].revision,
      expectedBrowserRevision: snapshot.purposes[purpose].browserRevision,
    };
  try {
    const saved = await requestWithDeadline<PrivacyPreferencesDto>(
      '/api/storefront/v1/analytics/consent',
      {
        method: 'PUT',
        signal: request.signal,
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
          'content-type': 'application/json',
          'x-privacy-request': '1',
          'x-privacy-context': snapshot.context,
        },
        body: JSON.stringify({
          policyVersion: snapshot.policyVersion,
          choices,
        } satisfies SavePrivacyPreferencesDto),
      },
    );
    if (generation !== epoch) return false;
    acceptPrivacySnapshot(saved, true);
    broadcast();
    publish({
      phase: 'ready',
      snapshot: saved,
      message: 'Privacy choices saved. Advertising exports remain inactive.',
    });
    return true;
  } catch (error) {
    if (generation !== epoch) return false;
    if (error instanceof StorefrontClientApiError && [401, 409].includes(error.status)) {
      await loadPrivacyPreferences();
      if (state.snapshot)
        publish({
          phase: 'conflict',
          snapshot: state.snapshot,
          message:
            'Your session or choices changed. Review the current choices before saving again.',
        });
    } else
      publish({
        phase: 'unavailable',
        message:
          'We could not confirm the save. Optional measurement is paused here. Reload your choices before trying again.',
      });
    return false;
  }
}
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
export function currentCommerceConsent(): CommerceConsentStateDto {
  const snapshot = state.snapshot;
  if (!snapshot || !['ready', 'conflict'].includes(state.phase)) return unknownConsentState();
  const expiry = snapshot.purposes.ANALYTICS.expiresAt;
  if (!expiry || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now())
    return unknownConsentState();
  return {
    necessary: 'GRANTED',
    analytics: paused ? 'DENIED' : snapshot.purposes.ANALYTICS.effectiveDecision,
    marketing: 'DENIED',
    preferences: 'DENIED',
    recordedAt: snapshot.observationNotBefore ?? new Date().toISOString(),
  };
}
export const permitsAnalytics = (consent: CommerceConsentStateDto) =>
  consent.analytics === 'GRANTED';
export const permitsMarketing = () => false;
export function currentObservationAuthority() {
  const snapshot = state.snapshot;
  return snapshot &&
    !paused &&
    permitsAnalytics(currentCommerceConsent()) &&
    snapshot.observationToken
    ? { context: snapshot.context, token: snapshot.observationToken }
    : undefined;
}
/** Legacy local preferences may pause collection, but never grant server consent. */
export function saveCommerceConsent(analytics: 'GRANTED' | 'DENIED'): CommerceConsentStateDto {
  if (analytics === 'DENIED') pauseCommerceConsent(true);
  return analytics === 'DENIED'
    ? { ...unknownConsentState(), analytics: 'DENIED' }
    : unknownConsentState();
}
