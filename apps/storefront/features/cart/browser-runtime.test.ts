import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GuestCartViewDto } from '@maevelle/contracts';
const view: GuestCartViewDto = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerContext: '22222222-2222-4222-8222-222222222222',
  intentRevision: '1',
  evaluatedAt: '2026-11-03T00:00:00Z',
  currency: 'BDT',
  version: 1,
  expiresAt: '2026-12-03T00:00:00Z',
  calculationVersion: 1,
  calculationFingerprint: 'test',
  lines: [],
  appliedCoupons: [],
  merchandiseGross: '0.0000',
  discountTotal: '0.0000',
  merchandiseNet: '0.0000',
};
const mocks = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock('./api', () => ({
  cartApi: { get: mocks.get, mutate: mocks.mutate, initialize: vi.fn(), forgetSession: vi.fn() },
}));
const close = vi.fn(),
  postMessage = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mocks.get.mockResolvedValue(view);
  mocks.mutate.mockImplementation(async () => ({
    ...view,
    outcome: {
      receiptId: crypto.randomUUID(),
      operation: 'clear',
      committedVersion: '1',
      eventIds: [],
      changes: [],
      replayed: false,
    },
  }));
  const windowTarget = new EventTarget(),
    documentTarget = new EventTarget();
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
  vi.stubGlobal('window', { sessionStorage: storage, location: { pathname: '/cart' } });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('document', Object.assign(documentTarget, { visibilityState: 'visible' }));
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('addEventListener', windowTarget.addEventListener.bind(windowTarget));
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage: unknown = null;
      close = close;
      postMessage = postMessage;
    },
  );
  close.mockClear();
  postMessage.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('the last subscriber releases polling, channel and event registrations; re-subscription restarts once', async () => {
  const { cartStore } = await import('./browser-runtime');
  const a = cartStore.subscribe(vi.fn()),
    b = cartStore.subscribe(vi.fn());
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(1);
  a();
  expect(close).not.toHaveBeenCalled();
  b();
  expect(close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  const stop = cartStore.subscribe(vi.fn());
  expect(vi.getTimerCount()).toBe(1);
  stop();
  expect(vi.getTimerCount()).toBe(0);
});
it('a committed Clear emits one minimal hint and no cart contents or credentials', async () => {
  const { cartStore } = await import('./browser-runtime');
  const stop = cartStore.subscribe(vi.fn());
  await cartStore.refresh();
  await cartStore.clearCart();
  expect(postMessage).toHaveBeenCalledTimes(1);
  expect(Object.keys(postMessage.mock.calls[0]![0]).sort()).toEqual([
    'context',
    'kind',
    'nonce',
    'revision',
  ]);
  stop();
});

it('policy-denied Web Locks fall back only before entry and still use the ordinary command protocol', async () => {
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn(async () => {
        throw new DOMException('denied', 'SecurityError');
      }),
    },
  });
  const { cartStore } = await import('./browser-runtime');
  const stop = cartStore.subscribe(vi.fn());
  await cartStore.refresh();
  await cartStore.clearCart();
  expect(mocks.mutate).toHaveBeenCalled();
  stop();
});
it('a stalled lock acquisition times out without submitting a request or generating a replacement intent', async () => {
  const request = vi.fn(
    (_name: string, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        ),
      ),
  );
  vi.stubGlobal('navigator', { locks: { request } });
  mocks.mutate.mockClear();
  const { cartStore } = await import('./browser-runtime');
  const stop = cartStore.subscribe(vi.fn());
  await cartStore.refresh();
  const pending = cartStore.clearCart().catch((e) => e);
  await vi.waitFor(() => expect(request).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(20000);
  expect((await pending).name).toBe('AbortError');
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(cartStore.getSnapshot().pending?.command.kind).toBe('clear');
  stop();
});

it('read Retry-After pauses background polling and new commands until the cooldown ends', async () => {
  const { StorefrontClientApiError } = await import('@/lib/api/client/http');
  mocks.get.mockRejectedValueOnce(new StorefrontClientApiError(429, 'RATE_LIMITED', 'wait', 60));
  mocks.get.mockClear();
  mocks.mutate.mockClear();
  const { cartStore } = await import('./browser-runtime');
  const stop = cartStore.subscribe(vi.fn());
  await expect(cartStore.refresh()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  await expect(cartStore.clearCart()).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
  expect(mocks.mutate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30000);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(31000);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(cartStore.getSnapshot().mode).toBe('ready');
  stop();
});
