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
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  mutate: vi.fn(),
  session: vi.fn(),
  createAccountApi: vi.fn(),
}));
vi.mock('./api', () => ({
  createCartApi: mocks.createAccountApi,
  cartApi: { get: mocks.get, mutate: mocks.mutate, initialize: vi.fn(), forgetSession: vi.fn() },
}));
vi.mock('./shopper-authority', () => ({ resolveCartShopper: mocks.session }));
const close = vi.fn(),
  postMessage = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mocks.get.mockResolvedValue(view);
  mocks.session.mockResolvedValue(null);
  mocks.createAccountApi.mockReset();
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
  vi.stubGlobal('dispatchEvent', windowTarget.dispatchEvent.bind(windowTarget));
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

it('hides the account bag on lost authority and restores guest only after explicit sign-out', async () => {
  const account = { ...view, expiresAt: null };
  mocks.get.mockClear();
  mocks.session.mockResolvedValue('A'.repeat(43));
  mocks.createAccountApi.mockReturnValue({ get: vi.fn(async () => account) });
  const { cartStore } = await import('./browser-runtime');
  const stop = cartStore.subscribe(vi.fn());
  await cartStore.refresh();
  expect(cartStore.getSnapshot().confirmed).toEqual(account);
  expect(mocks.get).not.toHaveBeenCalled();

  mocks.session.mockResolvedValue(null);
  cartStore.ownerTransition('begin');
  expect(cartStore.getSnapshot().confirmed).toBeNull();
  cartStore.ownerTransition('settled');
  await cartStore.refresh();
  expect(cartStore.getSnapshot().mode).toBe('expired');
  expect(mocks.get).not.toHaveBeenCalled();

  cartStore.ownerTransition('settled', true);
  await cartStore.refresh();
  expect(cartStore.getSnapshot().confirmed).toEqual(view);
  stop();
});

it('drops the old account projection when a late read follows an account switch', async () => {
  const accountA = { ...view, expiresAt: null };
  const accountB = { ...accountA, ownerContext: crypto.randomUUID() };
  let finishA!: (value: typeof accountA) => void;
  const getA = vi.fn(
    () =>
      new Promise<typeof accountA>((resolve) => {
        finishA = resolve;
      }),
  );
  mocks.session.mockResolvedValue('A'.repeat(43));
  mocks.createAccountApi.mockImplementation((partition) => ({
    get: partition.startsWith('A') ? getA : vi.fn(async () => accountB),
  }));
  const { cartStore } = await import('./browser-runtime');
  const stop = cartStore.subscribe(vi.fn());
  await vi.waitFor(() => expect(getA).toHaveBeenCalled());
  cartStore.ownerTransition('begin');
  mocks.session.mockResolvedValue('B'.repeat(43));
  cartStore.ownerTransition('settled');
  await cartStore.refresh();
  finishA(accountA);
  await Promise.resolve();
  expect(cartStore.getSnapshot().confirmed).toEqual(accountB);
  stop();
});

it('rechecks verified authority after a sibling tab disappears during sign-in', async () => {
  const { cartStore } = await import('./browser-runtime');
  const stop = cartStore.subscribe(vi.fn());
  try {
    await cartStore.refresh();
    const event = Object.assign(new Event('storage'), {
      key: 'maevelle_cart_identity_v1',
      newValue: JSON.stringify({ phase: 'begin', nonce: 'abandoned-transition' }),
    });
    dispatchEvent(event);
    expect(cartStore.getSnapshot().confirmed).toBeNull();
    const account = { ...view, expiresAt: null };
    mocks.session.mockResolvedValue('A'.repeat(43));
    mocks.createAccountApi.mockReturnValue({ get: vi.fn(async () => account) });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(cartStore.getSnapshot().confirmed).toEqual(account);
  } finally {
    stop();
  }
});

it('keeps a storage-denied merge in memory for the original account and reports its recovery limits', async () => {
  const a = 'A'.repeat(43);
  const b = 'B'.repeat(43);
  const account = { ...view, expiresAt: null };
  const other = { ...account, ownerContext: crypto.randomUUID() };
  const mutate = vi.fn().mockRejectedValueOnce(new TypeError('Lost merge response'));
  mutate.mockResolvedValue({
    ...account,
    outcome: { operation: 'merge_guest', committedVersion: '1', changes: [] },
  });
  vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage denied', 'SecurityError');
  });
  mocks.session.mockResolvedValue(a);
  mocks.createAccountApi.mockImplementation((partition) => ({
    get: vi.fn(async () => (partition === a ? account : other)),
    mutate,
  }));
  const { cartStore } = await import('./browser-runtime');
  const stop = cartStore.subscribe(vi.fn());
  try {
    await cartStore.refresh();
    await expect(
      cartStore.mergeGuest({
        ownerContext: account.ownerContext,
        version: account.version,
        guestCartId: crypto.randomUUID(),
        guestOwnerContext: crypto.randomUUID(),
        reviewFingerprint: 'F'.repeat(43),
      }),
    ).rejects.toThrow('Lost merge response');
    expect(cartStore.getSnapshot().recoveryPersisted).toBe(false);
    const submitted = mutate.mock.calls[0]![0];
    for (const partition of [b, a]) {
      cartStore.ownerTransition('begin');
      mocks.session.mockResolvedValue(partition);
      cartStore.ownerTransition('settled');
      await cartStore.refresh();
      expect(cartStore.getSnapshot().pending).toEqual(partition === a ? submitted : null);
    }
    expect(cartStore.getSnapshot().recoveryPersisted).toBe(false);
    await cartStore.retryPending();
    expect(mutate.mock.calls[1]![0]).toEqual(submitted);
  } finally {
    stop();
  }
});
