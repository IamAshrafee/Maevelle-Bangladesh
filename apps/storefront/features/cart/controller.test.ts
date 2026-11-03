import { describe, expect, it, vi } from 'vitest';
import type { GuestCartViewDto } from '@maevelle/contracts';
import { createCartController } from './controller';
import type { CartApi } from './api';
import { createCartJournal } from './pending-journal';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { confirmedCartCount, cartIsBusy } from './types';

const owner = '11111111-1111-4111-8111-111111111111';
const variant = '22222222-2222-4222-8222-222222222222';
const line = '33333333-3333-4333-8333-333333333333';
const key = '44444444-4444-4444-8444-444444444444';
function projection(version = 1, quantity = 0, context = owner): GuestCartViewDto {
  return {
    id: context,
    ownerContext: context,
    intentRevision: String(version),
    evaluatedAt: `2026-11-02T00:00:${String(version).padStart(2, '0')}.000Z`,
    currency: 'BDT',
    version,
    expiresAt: '2026-12-02T00:00:00Z',
    calculationVersion: version,
    calculationFingerprint: `price-${version}`,
    lines: quantity
      ? [
          {
            id: line,
            variantId: variant,
            sku: 'TEST',
            productTitle: 'Test',
            productHandle: 'test',
            mediaAssetId: null,
            options: [],
            quantity: String(quantity),
            unitPrice: '10.0000',
            compareAtUnitPrice: null,
            gross: '10.0000',
            discount: '0.0000',
            net: '10.0000',
            availability: 'AVAILABLE',
          },
        ]
      : [],
    appliedCoupons: [],
    merchandiseGross: '10.0000',
    discountTotal: '0.0000',
    merchandiseNet: '10.0000',
  };
}
function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const error = (code: string, status = 409, contexts?: string[]) =>
  new StorefrontClientApiError(status, code, code, null, contexts ? { contexts } : {});
function setup(overrides: Partial<CartApi> = {}, storage = memory()) {
  const api: CartApi = {
    forgetSession: vi.fn(async () => ({ sessionForgotten: true as const })),
    get: vi.fn(async () => projection()),
    initialize: vi.fn(async () => projection()),
    mutate: vi.fn(async (intent) => ({
      ...projection(intent.version + 1, 1),
      outcome: {
        receiptId: key,
        operation: intent.command.kind,
        committedVersion: String(intent.version + 1),
        eventIds: [key],
        replayed: false,
        changes: [],
      },
    })),
    ...overrides,
  };
  const notify = vi.fn();
  const observe = vi.fn();
  const c = createCartController({
    api,
    journal: createCartJournal(storage, () => 1000),
    coordinate: (task) => task(),
    uuid: () => crypto.randomUUID(),
    now: () => 1000,
    notify,
    observe,
  });
  return { c, api, notify, storage, observe };
}
describe('unified Cart coordination', () => {
  it('requires a fresh configuration review when the observed Cart revision changed', async () => {
    const { c, api } = setup({ get: vi.fn(async () => projection(2, 1)) });
    await c.refresh();
    await expect(
      c.replaceVariant(line, key, '1', { ownerContext: owner, version: 1 }),
    ).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('never establishes a new Cart for a stale editor', async () => {
    const { c, api } = setup();
    await expect(
      c.replaceVariant(line, key, '1', { ownerContext: owner, version: 1 }),
    ).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    expect(api.initialize).not.toHaveBeenCalled();
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('announces a materially changed evaluation without changing the intent revision', async () => {
    const initial = projection(1, 1);
    const get = vi
      .fn(async () => initial)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({
        ...initial,
        evaluatedAt: '2026-11-02T00:00:03.000Z',
        calculationFingerprint: 'changed',
        merchandiseNet: '12.0000',
        lines: [{ ...initial.lines[0]!, unitPrice: '12.0000' }],
      });
    const { c } = setup({ get });
    await c.refresh();
    await c.refresh();
    expect(c.getSnapshot().confirmed?.intentRevision).toBe(initial.intentRevision);
    expect(c.getSnapshot().notice).toContain('Prices, offers or availability changed');
  });

  it('ordinary refresh is single-flight and never initializes a session', async () => {
    const d = deferred<GuestCartViewDto>();
    const { c, api } = setup({ get: vi.fn(() => d.promise) });
    const a = c.refresh(),
      b = c.refresh();
    d.resolve(projection());
    await Promise.all([a, b]);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.initialize).not.toHaveBeenCalled();
  });
  it('confirmed empty and unknown counts differ', async () => {
    const { c } = setup({
      get: async () => {
        throw error('NOT_FOUND', 404);
      },
    });
    expect(confirmedCartCount(c.getSnapshot())).toBeNull();
    await c.refresh();
    expect(c.getCartCount()).toBe(0);
  });
  it('first add waits for initialized cookie round trip before submission', async () => {
    let calls = 0;
    const proof = deferred<GuestCartViewDto>();
    const { c, api } = setup({
      get: vi.fn(async () => {
        if (++calls === 1) throw error('NOT_FOUND', 404);
        return proof.promise;
      }),
    });
    const task = c.addItem(variant, 1);
    await vi.waitFor(() => expect(api.initialize).toHaveBeenCalledTimes(1));
    expect(api.mutate).not.toHaveBeenCalled();
    proof.resolve(projection());
    await task;
    expect(api.mutate).toHaveBeenCalledTimes(1);
  });
  it('rejected cookies never become a saved add', async () => {
    const { c, api } = setup({
      get: async () => {
        throw error('NOT_FOUND', 404);
      },
    });
    await expect(c.addItem(variant, 1)).rejects.toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' });
    expect(api.mutate).not.toHaveBeenCalled();
    expect(c.getSnapshot().notice).toBeNull();
  });
  it('double activation shares a submitted intent; later separate activation gets another key', async () => {
    const d = deferred<GuestCartViewDto>();
    const { c, api, observe } = setup({ mutate: vi.fn(() => d.promise) });
    observe.mockImplementationOnce(() => {
      throw new Error('telemetry unavailable');
    });
    const a = c.addItem(variant, 1),
      b = c.addItem(variant, 1);
    await vi.waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1));
    d.resolve({
      ...projection(2, 1),
      outcome: {
        receiptId: key,
        operation: 'add',
        committedVersion: '2',
        eventIds: [key],
        changes: [],
        replayed: false,
      },
    });
    await Promise.all([a, b]);
    expect(observe.mock.calls).toEqual([
      [
        {
          name: 'CART_COMMAND_INITIATED',
          data: { mode: 'GUEST', command: 'ADD' },
        },
      ],
    ]);
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(projection(2, 1));
    await c.addItem(variant, 1);
    const args = (api.mutate as ReturnType<typeof vi.fn>).mock.calls;
    expect(args).toHaveLength(2);
    expect(args[0]![0].key).not.toBe(args[1]![0].key);
  });
  it('unknown outcome retains the exact key, version, context and command on manual retry', async () => {
    let attempts = 0;
    const mutate = vi.fn(async (intent: Parameters<CartApi['mutate']>[0]) => {
      expect(intent.key).toBeTruthy();
      if (++attempts === 1) throw new TypeError('lost after commit');
      return {
        ...projection(2, 1),
        outcome: {
          receiptId: key,
          operation: 'add',
          committedVersion: '2',
          eventIds: [key],
          changes: [],
          replayed: true,
        },
      };
    });
    const { c, observe } = setup({ mutate });
    await expect(c.addItem(variant, 1)).rejects.toThrow('lost');
    expect(c.getSnapshot().sync).toBe('uncertain');
    expect(c.getSnapshot().confirmed?.lines).toHaveLength(0);
    await c.retryPending();
    expect(mutate.mock.calls[0]![0]).toEqual(mutate.mock.calls[1]![0]);
    expect(c.getCartCount()).toBe(1);
    expect(observe.mock.calls).toEqual([
      [
        {
          name: 'CART_COMMAND_INITIATED',
          data: { mode: 'GUEST', command: 'ADD' },
        },
      ],
    ]);
  });
  it('an unknown action blocks new intentions until reviewed', async () => {
    const { c, api } = setup({
      mutate: vi.fn(async () => {
        throw new TypeError('lost');
      }),
    });
    await expect(c.addItem(variant, 1)).rejects.toThrow();
    await expect(c.addItem(variant, 2)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    expect(api.mutate).toHaveBeenCalledTimes(1);
  });
  it('reload restores reference metadata for review but never reexecutes automatically', async () => {
    const storage = memory();
    createCartJournal(storage, () => 1000).save({
      key,
      command: { kind: 'add', variantId: variant, quantity: '1' },
      version: 1,
      ownerContext: owner,
      createdAt: 1000,
    });
    const { c, api } = setup({}, storage);
    await c.refresh();
    expect(c.getSnapshot().sync).toBe('uncertain');
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('old read arriving after a newer projection cannot lower revision or count', async () => {
    const old = deferred<GuestCartViewDto>();
    let calls = 0;
    const { c } = setup({
      get: () => (++calls === 1 ? old.promise : Promise.resolve(projection(3, 4))),
    });
    const a = c.refresh();
    await c.refresh(true);
    old.resolve(projection(1, 1));
    await a;
    expect(c.getSnapshot().confirmed?.version).toBe(3);
    expect(c.getCartCount()).toBe(4);
  });
  it('price-only refresh keeps intent version and never emits a new add', async () => {
    const { c, api, notify } = setup();
    await c.refresh();
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...projection(),
      calculationFingerprint: 'price-changed',
      evaluatedAt: '2026-11-02T00:01:00Z',
      merchandiseNet: '20.0000',
    });
    await c.refresh(true);
    expect(c.getSnapshot().confirmed?.version).toBe(1);
    expect(c.getCartSummary()?.merchandiseNet).toBe('20.0000');
    expect(notify).not.toHaveBeenCalled();
  });
  it('server stale rejection refreshes and requires review, with no blind second mutation', async () => {
    const { c, api, observe } = setup({
      mutate: vi.fn(async () => {
        throw error('STALE_VERSION');
      }),
    });
    await c.refresh();
    await expect(c.setQuantity(line, '2')).rejects.toMatchObject({ code: 'STALE_VERSION' });
    expect(api.mutate).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot().issue?.recovery).toBe('review');
    expect(observe.mock.calls).toEqual([
      [{ name: 'CART_COMMAND_INITIATED', data: { mode: 'GUEST', command: 'QUANTITY' } }],
      [
        {
          name: 'CART_COMMAND_REJECTED',
          data: { mode: 'GUEST', command: 'QUANTITY', reason: 'STALE' },
        },
      ],
    ]);
  });
  it('an external revision seen before a prepared desired set requires renewed user intent', async () => {
    const { c, api } = setup();
    await c.refresh();
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(projection(2, 5));
    await expect(c.setQuantity(line, '2')).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    expect(api.mutate).not.toHaveBeenCalled();
    expect(c.getCartCount()).toBe(5);
  });
  it('ambiguous authorities require an explicitly offered, server-validated selection', async () => {
    const other = '55555555-5555-4555-8555-555555555555';
    const { c, api } = setup({
      get: vi.fn(async (context) => {
        if (!context) throw error('CART_CONTEXT_REQUIRED', 409, [owner, other]);
        return projection(1, context === owner ? 2 : 3, context);
      }),
    });
    await expect(c.refresh()).rejects.toMatchObject({ code: 'CART_CONTEXT_REQUIRED' });
    expect(c.getSnapshot().confirmed).toBeNull();
    await expect(c.selectContext(variant)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    await c.selectContext(other);
    expect(c.getCartCount()).toBe(3);
    expect(api.get).toHaveBeenLastCalledWith(other, expect.any(AbortSignal));
    await expect(c.reviewContexts()).rejects.toMatchObject({ code: 'CART_CONTEXT_REQUIRED' });
    expect(c.getSnapshot().confirmed).toBeNull();
    await c.selectContext(owner);
    expect(c.getCartCount()).toBe(2);
  });
  it('auth begin immediately clears old state and an old successful response cannot restore it', async () => {
    const d = deferred<GuestCartViewDto>();
    const { c, api } = setup({ mutate: vi.fn(() => d.promise) });
    await c.refresh();
    const task = c.addItem(variant, 1);
    await vi.waitFor(() => expect(api.mutate).toHaveBeenCalled());
    c.ownerTransition();
    expect(c.getSnapshot().confirmed).toBeNull();
    d.resolve({
      ...projection(2, 1),
      outcome: {
        receiptId: key,
        operation: 'add',
        committedVersion: '2',
        eventIds: [],
        changes: [],
        replayed: false,
      },
    });
    await expect(task).rejects.toMatchObject({ code: 'OWNER_TRANSITION' });
    expect(c.getSnapshot().confirmed).toBeNull();
  });
  it('unsupported account and expired shopper states never initialize guest', async () => {
    for (const code of ['ACCOUNT_CART_NOT_READY', 'SESSION_EXPIRED', 'CART_CONTEXT_LIMIT']) {
      const { c, api } = setup({
        get: async () => {
          throw error(code, code === 'SESSION_EXPIRED' ? 401 : 409);
        },
      });
      await expect(c.addItem(variant, 1)).rejects.toMatchObject({ code });
      expect(api.initialize).not.toHaveBeenCalled();
      expect(c.getSnapshot().confirmed).toBeNull();
    }
  });
  it('same-version no-op outcome is confirmed without invented quantity changes', async () => {
    const { c } = setup({
      mutate: async () => ({
        ...projection(1),
        outcome: {
          receiptId: key,
          operation: 'set_quantity',
          committedVersion: '1',
          eventIds: [],
          changes: [],
          replayed: false,
        },
      }),
    });
    await c.setQuantity(line, '1');
    expect(c.getSnapshot().sync).toBe('idle');
    expect(c.getSnapshot().confirmed?.version).toBe(1);
  });
  it('Clear uses one shared command flight and updates all subscribers', async () => {
    const { c, api, notify } = setup({
      mutate: vi.fn(async (intent) => ({
        ...projection(intent.version + 1),
        outcome: {
          receiptId: key,
          operation: 'clear',
          committedVersion: String(intent.version + 1),
          eventIds: [key],
          changes: [],
          replayed: false,
        },
      })),
    });
    const a = c.clearCart(),
      b = c.clearCart();
    expect(a).toBe(b);
    await a;
    expect(api.mutate).toHaveBeenCalledTimes(1);
    expect((api.mutate as ReturnType<typeof vi.fn>).mock.calls[0]![0].command).toEqual({
      kind: 'clear',
    });
    expect(c.getCartCount()).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it('subscriptions are removable and selector count stays stable across price changes', async () => {
    const { c } = setup();
    const listener = vi.fn();
    const stop = c.subscribe(listener);
    await c.refresh();
    expect(listener).toHaveBeenCalled();
    stop();
    listener.mockClear();
    await c.refresh(true);
    expect(listener).not.toHaveBeenCalled();
  });
  it('a mutation ownership rejection clears old projection without anonymous fallback', async () => {
    const { c, api } = setup({
      mutate: async () => {
        throw error('INVALID_OWNERSHIP', 403);
      },
    });
    await c.refresh();
    await expect(c.addItem(variant, 1)).rejects.toMatchObject({ code: 'INVALID_OWNERSHIP' });
    expect(c.getSnapshot().confirmed).toBeNull();
    expect(api.initialize).not.toHaveBeenCalled();
  });
  it('a later cookie-less404 cannot erase a previous ownership rejection', async () => {
    let calls = 0;
    const { c, api } = setup({
      get: async () => {
        if (++calls === 1) throw error('SESSION_EXPIRED', 401);
        throw error('NOT_FOUND', 404);
      },
    });
    await expect(c.refresh()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await c.refresh();
    expect(c.getSnapshot().mode).toBe('expired');
    await expect(c.addItem(variant, 1)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    expect(api.initialize).not.toHaveBeenCalled();
  });
  it('a failed reconciliation read does not hide an uncertain mutation recovery', async () => {
    let readingFails = false;
    const { c } = setup({
      get: async () => {
        if (readingFails) throw new TypeError('offline');
        return projection();
      },
      mutate: async () => {
        throw new TypeError('lost response');
      },
    });
    await expect(c.addItem(variant, 1)).rejects.toThrow();
    readingFails = true;
    await expect(c.refresh(true)).rejects.toThrow('offline');
    expect(c.getSnapshot().sync).toBe('uncertain');
    expect(c.getSnapshot().pending).not.toBeNull();
    expect(c.getSnapshot().issue?.recovery).toBe('same-intent');
  });
});

describe('01B-R Clear and honest session recovery', () => {
  it('empty Clear consumes its own intent without inventing a revision', async () => {
    const { c } = setup({
      mutate: async () => ({
        ...projection(),
        outcome: {
          receiptId: key,
          operation: 'clear',
          committedVersion: '1',
          eventIds: [],
          changes: [],
          replayed: false,
        },
      }),
    });
    const result = await c.clearCart();
    expect(result.version).toBe(1);
    expect(result.outcome?.changes).toEqual([]);
    expect(c.getSnapshot().notice).toContain('already empty');
  });
  it('lost Clear response blocks dependent Add and retry uses the unchanged original intent', async () => {
    let calls = 0;
    const { c, api } = setup({
      mutate: vi.fn(async () => {
        if (calls++ === 0) throw new TypeError('lost');
        return {
          ...projection(2),
          outcome: {
            receiptId: key,
            operation: 'clear',
            committedVersion: '2',
            eventIds: [key],
            changes: [],
            replayed: true,
          },
        };
      }),
    });
    await expect(c.clearCart()).rejects.toThrow('lost');
    const intent = c.getSnapshot().pending;
    expect(cartIsBusy(c.getSnapshot())).toBe(true);
    await expect(c.addItem(variant, 1)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    await c.retryPending();
    expect((api.mutate as ReturnType<typeof vi.fn>).mock.calls[1]![0]).toBe(intent);
    expect(c.getCartCount()).toBe(0);
  });
  it('Clear in flight blocks quantity changes before admission', async () => {
    const d = deferred<GuestCartViewDto>();
    const { c, api } = setup({ mutate: vi.fn(() => d.promise) });
    const task = c.clearCart();
    await vi.waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1));
    await expect(c.setQuantity(line, '2')).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    d.resolve({
      ...projection(2),
      outcome: {
        receiptId: key,
        operation: 'clear',
        committedVersion: '2',
        eventIds: [key],
        changes: [],
        replayed: false,
      },
    });
    await task;
  });
  it('session forgetting is deliberate, checks cookie absence and never initializes a bag', async () => {
    let forgotten = false;
    const { c, api, storage } = setup({
      get: async () => {
        throw error(forgotten ? 'NOT_FOUND' : 'SESSION_EXPIRED', forgotten ? 404 : 401);
      },
      forgetSession: vi.fn(async () => {
        forgotten = true;
        return { sessionForgotten: true as const };
      }),
    });
    await expect(c.refresh()).rejects.toThrow();
    await c.forgetSession();
    expect(api.forgetSession).toHaveBeenCalledTimes(1);
    expect(api.initialize).not.toHaveBeenCalled();
    expect(c.getSnapshot().mode).toBe('empty');
    expect(storage.map.get('maevelle_cart_session_review_v1')).toBe('required');
  });
  it('unknown reset failure does not create a replacement and is explicitly retryable', async () => {
    const { c, api } = setup({
      get: async () => {
        throw error('INVALID_SESSION', 401);
      },
      forgetSession: async () => {
        throw new TypeError('offline');
      },
    });
    await expect(c.refresh()).rejects.toThrow();
    await expect(c.forgetSession()).rejects.toThrow('offline');
    expect(c.getSnapshot().mode).toBe('expired');
    expect(api.initialize).not.toHaveBeenCalled();
  });
  it('pending unknown writes cannot be hidden by session reset', async () => {
    const { c, api } = setup({
      mutate: async () => {
        throw new TypeError('lost');
      },
    });
    await expect(c.clearCart()).rejects.toThrow();
    await expect(c.forgetSession()).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    expect(api.forgetSession).not.toHaveBeenCalled();
  });
  it('a restored journal without a cookie still blocks a new intention', async () => {
    const storage = memory();
    createCartJournal(storage, () => 1000).save({
      key,
      ownerContext: owner,
      version: 1,
      createdAt: 1000,
      command: { kind: 'clear' },
    });
    const { c, api } = setup(
      {
        get: async () => {
          throw error('NOT_FOUND', 404);
        },
      },
      storage,
    );
    await c.refresh();
    expect(c.getSnapshot().pending?.key).toBe(key);
    await expect(c.addItem(variant, 1)).rejects.toThrow();
    expect(api.initialize).not.toHaveBeenCalled();
  });
  it('ownership rejection while recovering retains the earlier unknown intent', async () => {
    let unknown = true;
    const { c } = setup({
      get: async () => {
        if (!unknown) throw error('SESSION_EXPIRED', 401);
        return projection();
      },
      mutate: async () => {
        throw new TypeError('lost');
      },
    });
    await expect(c.clearCart()).rejects.toThrow();
    unknown = false;
    await expect(c.retryPending()).rejects.toThrow();
    expect(c.getSnapshot().pending?.command.kind).toBe('clear');
    await expect(c.forgetSession()).rejects.toThrow();
    c.stopRetrying();
    expect(c.getSnapshot().pending).toBeNull();
  });
  it('a late cookie returning during reset requires review and cannot silently receive a new Add', async () => {
    let reset = false;
    const { c, api } = setup({
      get: async () => {
        if (!reset) throw error('INVALID_SESSION', 401);
        return projection();
      },
      forgetSession: async () => {
        reset = true;
        return { sessionForgotten: true as const };
      },
    });
    await expect(c.refresh()).rejects.toThrow();
    await c.forgetSession();
    expect(c.getSnapshot().mode).toBe('expired');
    expect(c.getSnapshot().confirmed).toBeNull();
    await expect(c.addItem(variant, 1)).rejects.toThrow();
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('reset is rejected for an authenticated shopper and never calls cookie forgetting', async () => {
    const { c, api } = setup({
      get: async () => {
        throw error('ACCOUNT_CART_NOT_READY');
      },
    });
    await expect(c.refresh()).rejects.toThrow();
    await expect(c.forgetSession()).rejects.toThrow();
    expect(api.forgetSession).not.toHaveBeenCalled();
  });
  it('an old owner success cannot surface a Clear notice after authentication begins', async () => {
    const d = deferred<GuestCartViewDto>(),
      { c, api } = setup({ mutate: vi.fn(() => d.promise) });
    const task = c.clearCart();
    await vi.waitFor(() => expect(api.mutate).toHaveBeenCalled());
    c.ownerTransition();
    d.resolve({
      ...projection(2),
      outcome: {
        receiptId: key,
        operation: 'clear',
        committedVersion: '2',
        eventIds: [],
        changes: [],
        replayed: false,
      },
    });
    await expect(task).rejects.toThrow();
    expect(c.getSnapshot().notice).toBeNull();
    expect(c.getSnapshot().confirmed).toBeNull();
  });
});

it('a cookie arriving after a successful reset cannot automatically restore an old bag on polling', async () => {
  let phase = 0;
  const { c } = setup({
    get: async () => {
      if (phase === 0) throw error('INVALID_SESSION', 401);
      if (phase === 1) throw error('NOT_FOUND', 404);
      return projection();
    },
    forgetSession: async () => {
      phase = 1;
      return { sessionForgotten: true };
    },
  });
  await expect(c.refresh()).rejects.toThrow();
  await c.forgetSession();
  phase = 2;
  await expect(c.refresh()).rejects.toThrow();
  expect(c.getSnapshot().confirmed).toBeNull();
  expect(c.getSnapshot().mode).toBe('expired');
  await c.reconcile();
  expect(c.getSnapshot().mode).toBe('ready');
});

it('command admission is bounded and an owner epoch cancels queued work before submission', async () => {
  const d = deferred<GuestCartViewDto>();
  const { c, api } = setup({ get: () => d.promise });
  const queued = Array.from({ length: 20 }, (_, n) => c.addItem(variant, n + 1));
  await expect(c.addItem(variant, 21)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
  c.ownerTransition();
  d.resolve(projection());
  await Promise.allSettled(queued);
  expect(api.mutate).not.toHaveBeenCalled();
});

it('a reload after forgetting retains the late-cookie review fence without storing any credential', async () => {
  const storage = memory();
  let phase = 0;
  const api: Partial<CartApi> = {
    get: async () => {
      if (phase === 0) throw error('INVALID_SESSION', 401);
      if (phase === 1) throw error('NOT_FOUND', 404);
      return projection();
    },
    forgetSession: async () => {
      phase = 1;
      return { sessionForgotten: true };
    },
  };
  const first = setup(api, storage);
  await expect(first.c.refresh()).rejects.toThrow();
  await first.c.forgetSession();
  phase = 2;
  const next = setup(api, storage);
  await expect(next.c.refresh()).rejects.toThrow();
  expect(next.c.getSnapshot().confirmed).toBeNull();
  await next.c.reconcile();
  expect(next.c.getSnapshot().mode).toBe('ready');
});

it('preserves the unknown intent and honors Retry-After when its verification read is rate limited', async () => {
  const { c, api } = setup({
    mutate: vi.fn().mockRejectedValue(new Error('Response lost')),
  });
  await c.refresh();
  await expect(c.addItem(variant, 1)).rejects.toThrow('Response lost');
  const pending = c.getSnapshot().pending;
  vi.mocked(api.get).mockRejectedValueOnce(
    new StorefrontClientApiError(429, 'RATE_LIMITED', 'Wait before retrying', 60),
  );
  await expect(c.retryPending()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  expect(c.getSnapshot()).toMatchObject({
    pending,
    issue: { code: 'RATE_LIMITED', recovery: 'same-intent', retryAt: 61_000 },
  });
  const reads = vi.mocked(api.get).mock.calls.length;
  await expect(c.retryPending()).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
  await c.refresh();
  expect(api.get).toHaveBeenCalledTimes(reads);
  expect(api.mutate).toHaveBeenCalledTimes(1);
});

it('replays an uncertain Wishlist Move and refreshes its original owner only after confirmation', async () => {
  const storage = memory();
  const partition = 'A'.repeat(43);
  const wishlistChanged = vi.fn();
  const projectionFor = (version: number) => ({ ...projection(version), expiresAt: null });
  const mutate = vi
    .fn<CartApi['mutate']>()
    .mockRejectedValueOnce(new TypeError('response lost'))
    .mockResolvedValueOnce({
      ...projectionFor(2),
      outcome: {
        receiptId: key,
        operation: 'wishlist_transfer',
        committedVersion: '2',
        eventIds: [key],
        replayed: true,
        changes: [],
      },
    });
  const api: CartApi = {
    get: vi.fn(async () => projectionFor(1)),
    initialize: vi.fn(async () => projectionFor(1)),
    forgetSession: vi.fn(async () => ({ sessionForgotten: true as const })),
    mutate,
  };
  const journal = createCartJournal(storage, () => 1000, partition);
  const controller = createCartController({
    api,
    journal: createCartJournal(storage, () => 1000),
    coordinate: (task) => task(),
    notify: vi.fn(),
    wishlistChanged,
    now: () => 1000,
    uuid: () => key,
  });
  const move = {
    action: 'MOVE' as const,
    productId: line,
    variantId: variant,
    quantity: '1',
    wishlistVersion: 9,
  };
  await controller.settleOwner({ partition, api, journal });
  await expect(controller.transferWishlistItem(move, 'wrong-owner')).rejects.toMatchObject({
    code: 'OWNER_TRANSITION',
  });
  await expect(controller.transferWishlistItem(move, partition)).rejects.toThrow('response lost');
  expect(wishlistChanged).not.toHaveBeenCalled();
  expect(journal.read()?.command).toEqual({ kind: 'wishlist-transfer', request: move });
  await controller.retryPending();
  expect(mutate.mock.calls[1]).toEqual(mutate.mock.calls[0]);
  expect(wishlistChanged).toHaveBeenCalledExactlyOnceWith(partition);
  expect(journal.read()).toBeNull();
});
