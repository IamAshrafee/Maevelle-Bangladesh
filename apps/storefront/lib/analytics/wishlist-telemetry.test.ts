import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWishlistObservation, emitWishlistObservation } from './wishlist-telemetry';
import { wishlistObservationNames } from '@maevelle/contracts';
import { saveCommerceConsent } from './consent';

class MemoryStorage implements Storage {
  private rows = new Map<string, string>();
  get length() {
    return this.rows.size;
  }
  key(index: number) {
    return [...this.rows.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.rows.set(key, value);
  }
  removeItem(key: string) {
    this.rows.delete(key);
  }
  clear() {
    this.rows.clear();
  }
}

describe('Storefront Wishlist Behavioral Telemetry', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const target = new EventTarget();
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    Object.assign(target, { localStorage: local, sessionStorage: session });

    vi.stubGlobal('window', target);
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal(
      'CustomEvent',
      class extends Event {
        constructor(
          name: string,
          public detail: unknown,
        ) {
          super(name);
        }
      },
    );

    // Default to consent GRANTED for testing
    saveCommerceConsent('GRANTED');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  describe('Schema Conformance & Strict 8-Key Rule', () => {
    it('produces an observation with strictly 8 root keys conforming to backend validation', () => {
      const observation = buildWishlistObservation({
        name: 'WISHLIST_PAGE_VIEWED',
        mode: 'ACCOUNT',
      });

      const rootKeys = Object.keys(observation);
      expect(rootKeys).toHaveLength(8);
      expect(rootKeys.sort()).toEqual(
        [
          'consent',
          'data',
          'eventId',
          'name',
          'occurredAt',
          'origin',
          'schemaVersion',
          'sessionId',
        ].sort(),
      );

      // Exactly 5 consent keys
      const consentKeys = Object.keys(observation.consent);
      expect(consentKeys).toHaveLength(5);
      expect(consentKeys.sort()).toEqual(
        ['analytics', 'marketing', 'necessary', 'preferences', 'recordedAt'].sort(),
      );

      // Data contains only mode and optional scope
      expect(Object.keys(observation.data)).toEqual(['mode']);
      expect(observation.data.mode).toBe('ACCOUNT');

      // Verify schema invariants
      expect(observation.schemaVersion).toBe(1);
      expect(observation.origin).toBe('BROWSER');
      expect(wishlistObservationNames).toContain(observation.name);
      expect(observation.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(observation.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(Number.isFinite(Date.parse(observation.occurredAt))).toBe(true);
      expect(observation.consent.necessary).toBe('GRANTED');
    });

    it('validates scope observation with scope parameter', () => {
      const observation = buildWishlistObservation({
        name: 'WISHLIST_SCOPE_SELECTED',
        mode: 'GUEST',
        scope: 'SELECTED',
      });

      expect(observation.data.scope).toBe('SELECTED');
      expect(observation.data.mode).toBe('GUEST');
      expect(wishlistObservationNames).toContain(observation.name);
    });

    it('validates guest save and remove observations', () => {
      const saveObs = buildWishlistObservation({
        name: 'WISHLIST_GUEST_SAVE_OBSERVED',
        mode: 'GUEST',
      });
      expect(saveObs.data.mode).toBe('GUEST');
      expect(wishlistObservationNames).toContain(saveObs.name);

      const removeObs = buildWishlistObservation({
        name: 'WISHLIST_GUEST_REMOVE_OBSERVED',
        mode: 'GUEST',
      });
      expect(removeObs.data.mode).toBe('GUEST');
      expect(wishlistObservationNames).toContain(removeObs.name);
    });

    it('ensures NO tokens, URLs, IDs, or customer PII are attached to telemetry payload', () => {
      const observation = buildWishlistObservation({
        name: 'WISHLIST_RECIPIENT_VIEWED',
        mode: 'GUEST',
      });

      const json = JSON.stringify(observation);
      expect(json).not.toContain('token');
      expect(json).not.toContain('http');
      expect(json).not.toContain('customer');
      expect(json).not.toContain('email');
      expect(json).not.toContain('items');
    });
  });

  describe('Consent Gating & Transmission', () => {
    it('transmits event to /api/storefront/v1/analytics/events when analytics consent is GRANTED', async () => {
      saveCommerceConsent('GRANTED');
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
      globalThis.fetch = mockFetch;

      const sent = await emitWishlistObservation({
        name: 'WISHLIST_COPY_ATTEMPTED',
        mode: 'ACCOUNT',
      });

      expect(sent).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/storefront/v1/analytics/events');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'content-type': 'application/json' });
      expect(init.credentials).toBe('include');

      const parsedBody = JSON.parse(init.body as string);
      expect(parsedBody.name).toBe('WISHLIST_COPY_ATTEMPTED');
      expect(parsedBody.consent.analytics).toBe('GRANTED');
    });

    it('suppresses network transmission when analytics consent is DENIED', async () => {
      saveCommerceConsent('DENIED');
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
      globalThis.fetch = mockFetch;

      const sent = await emitWishlistObservation({
        name: 'WISHLIST_COPY_ATTEMPTED',
        mode: 'ACCOUNT',
      });

      expect(sent).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses stable eventId when provided for retries and preserves failure-isolation', async () => {
      saveCommerceConsent('GRANTED');
      const fixedEventId = '11111111-2222-4333-8444-555555555555';

      let attempt = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) return Promise.reject(new Error('Network offline'));
        return Promise.resolve({ ok: true, status: 202 });
      });
      globalThis.fetch = mockFetch;

      const sent = await emitWishlistObservation({
        name: 'WISHLIST_SAVE_ALL_INITIATED',
        mode: 'ACCOUNT',
        eventId: fixedEventId,
      });

      expect(sent).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCallBody = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      const secondCallBody = JSON.parse(mockFetch.mock.calls[1]![1].body as string);

      // Verify the SAME eventId was reused across retry!
      expect(firstCallBody.eventId).toBe(fixedEventId);
      expect(secondCallBody.eventId).toBe(fixedEventId);
    });

    it('never throws when fetch fails permanently (deliberately failure-isolated)', async () => {
      saveCommerceConsent('GRANTED');
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Fatal connection drop'));

      // Must resolve cleanly without throwing
      await expect(
        emitWishlistObservation({
          name: 'WISHLIST_PAGE_VIEWED',
          mode: 'GUEST',
        }),
      ).resolves.toBe(false);
    });
  });
  it('rechecks consent before a retry after withdrawal', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementationOnce(() => {
        saveCommerceConsent('DENIED');
        return Promise.reject(new Error('Lost first response'));
      })
      .mockResolvedValue({ ok: true, status: 202 });
    globalThis.fetch = mockFetch;
    await expect(
      emitWishlistObservation({ name: 'WISHLIST_NATIVE_SHARE_INVOKED', mode: 'GUEST' }),
    ).resolves.toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('isolates failures while constructing an observation', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('UUID unavailable');
      },
    });
    globalThis.fetch = vi.fn();
    await expect(
      emitWishlistObservation({ name: 'WISHLIST_WHATSAPP_SELECTED', mode: 'GUEST' }),
    ).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
