import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  acceptPrivacySnapshot,
  currentCommerceConsent,
  currentObservationAuthority,
  invalidatePrivacyPreferences,
  loadPrivacyPreferences,
  privacyClientState,
  savePrivacyChoices,
} from './consent';
import { syntheticPrivacySnapshot } from './testing/privacy-fixture';
import { publishCommerceEvent } from './events';
import { minimalBrowserData } from './observation-allowlist';

class MemoryStorage {
  rows = new Map<string, string>();
  getItem(key: string) {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.rows.set(key, value);
  }
  removeItem(key: string) {
    this.rows.delete(key);
  }
}
let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      localStorage: storage,
      sessionStorage: new MemoryStorage(),
    }),
  );
  invalidatePrivacyPreferences();
});
afterEach(() => {
  invalidatePrivacyPreferences();
  vi.unstubAllGlobals();
});
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

it('ignores legacy grants and coalesces concurrent authoritative reads', async () => {
  storage.setItem('maevelle_commerce_consent_v2', JSON.stringify({ analytics: 'GRANTED' }));
  expect(currentObservationAuthority()).toBeUndefined();
  const fetch = vi.fn().mockResolvedValue(response(syntheticPrivacySnapshot()));
  vi.stubGlobal('fetch', fetch);
  await Promise.all([loadPrivacyPreferences(), loadPrivacyPreferences()]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(currentCommerceConsent().analytics).toBe('GRANTED');
  expect(fetch.mock.calls[0]![1]).toMatchObject({
    headers: { 'x-privacy-request': '1' },
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
});
it('shows a save as pending, never persists grants in browser storage, and sends exact revisions', async () => {
  acceptPrivacySnapshot(syntheticPrivacySnapshot('DENIED'));
  let complete!: (value: Response) => void;
  const fetch = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const pending = savePrivacyChoices(true, false);
  expect(privacyClientState().phase).toBe('saving');
  expect(currentObservationAuthority()).toBeUndefined();
  const options = fetch.mock.calls[0]![1] as RequestInit;
  expect(JSON.parse(options.body as string)).toEqual({
    policyVersion: 'privacy-choices-v1',
    choices: {
      ANALYTICS: { decision: 'GRANTED', expectedRevision: '1', expectedBrowserRevision: '1' },
      ADVERTISING: { decision: 'DENIED', expectedRevision: '1', expectedBrowserRevision: '1' },
    },
  });
  complete(response(syntheticPrivacySnapshot()));
  expect(await pending).toBe(true);
  expect(currentCommerceConsent().analytics).toBe('GRANTED');
  expect([...storage.rows.values()].join()).not.toContain('GRANTED');
});
it('pauses immediately on offline withdrawal and does not claim successful persistence', async () => {
  acceptPrivacySnapshot(syntheticPrivacySnapshot());
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
  const saved = savePrivacyChoices(false, false);
  expect(currentObservationAuthority()).toBeUndefined();
  expect(await saved).toBe(false);
  expect(privacyClientState()).toMatchObject({ phase: 'unavailable' });
  expect(storage.getItem('maevelle_privacy_paused_v1')).toBe('1');
  acceptPrivacySnapshot(syntheticPrivacySnapshot());
  expect(currentObservationAuthority()).toBeUndefined();
});
it('reconciles stale revisions without automatically repeating a grant', async () => {
  acceptPrivacySnapshot(syntheticPrivacySnapshot());
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'CONSENT_REVISION_CONFLICT', message: 'Changed' } }),
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(response(syntheticPrivacySnapshot('DENIED')));
  vi.stubGlobal('fetch', fetch);
  expect(await savePrivacyChoices(true, true)).toBe(false);
  expect(privacyClientState()).toMatchObject({
    phase: 'conflict',
    snapshot: { purposes: { ANALYTICS: { effectiveDecision: 'DENIED' } } },
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.filter((call) => call[1]?.method === 'PUT')).toHaveLength(1);
  expect(currentObservationAuthority()).toBeUndefined();
});
it('discards a delayed previous-owner response after identity invalidation', async () => {
  let old!: (value: Response) => void;
  const next = syntheticPrivacySnapshot('DENIED');
  next.context = 'b'.repeat(43);
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          old = resolve;
        }),
    )
    .mockResolvedValueOnce(response(next));
  vi.stubGlobal('fetch', fetch);
  const previous = loadPrivacyPreferences();
  invalidatePrivacyPreferences();
  await loadPrivacyPreferences();
  old(response(syntheticPrivacySnapshot()));
  await previous;
  expect(privacyClientState().snapshot?.context).toBe(next.context);
  expect(currentObservationAuthority()).toBeUndefined();
});
it('rejects expired client snapshots and keeps advertising inactive independently of the saved choice', () => {
  const snapshot = syntheticPrivacySnapshot('GRANTED', 'GRANTED');
  snapshot.purposes.ANALYTICS.expiresAt = new Date(Date.now() - 1).toISOString();
  acceptPrivacySnapshot(snapshot);
  expect(currentObservationAuthority()).toBeUndefined();
  expect(currentCommerceConsent().marketing).not.toBe('GRANTED');
});
it('sends only minimized generic observations and suppresses authoritative names', async () => {
  acceptPrivacySnapshot(syntheticPrivacySnapshot());
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal('fetch', fetch);
  const input = {
    schemaVersion: 1,
    name: 'PRODUCT_VIEWED',
    origin: 'BROWSER',
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    sessionId: crypto.randomUUID(),
    consent: currentCommerceConsent(),
    attribution: { source: 'PII-CANARY' },
    data: {
      item: {
        productId: crypto.randomUUID(),
        skuId: crypto.randomUUID(),
        itemName: 'PII-CANARY',
        email: 'PII-CANARY',
        price: '99999',
      },
      transactionId: 'PII-CANARY',
      value: '99999',
    },
  };
  publishCommerceEvent(input as unknown as Parameters<typeof publishCommerceEvent>[0]);
  expect(fetch).toHaveBeenCalledTimes(1);
  const options = fetch.mock.calls[0]![1] as RequestInit;
  expect(options.body).not.toContain('PII-CANARY');
  expect(options.body).not.toContain('99999');
  expect(options.credentials).toBe('include');
  expect(options.headers).toMatchObject({
    'x-privacy-context': 'c'.repeat(43),
    'x-privacy-observation': 'o'.repeat(43),
  });
  publishCommerceEvent({ ...input, name: 'ORDER_PLACED' } as unknown as Parameters<
    typeof publishCommerceEvent
  >[0]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    minimalBrowserData('PRODUCT_LIST_VIEWED', {
      listId: 'https://private.test?grant=secret',
      items: [],
    }),
  ).toBeNull();
});
