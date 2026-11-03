import { describe, expect, it } from 'vitest';
import { createCartJournal } from './pending-journal';
import type { CartIntent } from './types';
const key = '11111111-1111-4111-8111-111111111111';
const intent: CartIntent = {
  key,
  ownerContext: key,
  version: 2,
  createdAt: 1000,
  command: { kind: 'add', variantId: key, quantity: '2' },
};
function storage() {
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
describe('Cart nonsecret recovery journal', () => {
  it('restores replacement identity and excludes non-command fields', () => {
    const s = storage();
    const j = createCartJournal(s, () => 1000);
    const command = { kind: 'replace', lineId: key, targetVariantId: key, quantity: '1' } as const;
    s.setItem(
      'maevelle_cart_pending_v1',
      JSON.stringify({ ...intent, command: { ...command, amount: '0' } }),
    );
    expect(j.read()).toEqual({ ...intent, command });
  });
  it('only restores whitelisted fields, never arbitrary stored metadata', () => {
    const s = storage(),
      j = createCartJournal(s, () => 1000);
    s.setItem(
      'maevelle_cart_pending_v1',
      JSON.stringify({
        ...intent,
        token: 'untrusted',
        command: { ...intent.command, price: '0.01' },
      }),
    );
    expect(j.read()).toEqual(intent);
  });
  it('rejects corrupt, expired, future and out-of-bound metadata', () => {
    const s = storage(),
      j = createCartJournal(s, () => 1000);
    for (const bad of [
      'invalid',
      JSON.stringify({ ...intent, createdAt: -8 * 86400000 }),
      JSON.stringify({ ...intent, createdAt: 100000 }),
      JSON.stringify({ ...intent, command: { kind: 'add', variantId: key, quantity: '100' } }),
      'x'.repeat(2049),
    ]) {
      s.setItem('maevelle_cart_pending_v1', bad);
      expect(j.read()).toBeNull();
    }
  });
  it('coupon text is never persisted and storage failure is observable', () => {
    const s = storage(),
      j = createCartJournal(s);
    expect(j.save({ ...intent, command: { kind: 'apply-coupon', couponCode: 'PRIVATE' } })).toBe(
      false,
    );
    expect(s.map.size).toBe(0);
    const blocked = createCartJournal({
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {
        throw Error('blocked');
      },
      removeItem: () => {
        throw Error('blocked');
      },
    });
    expect(blocked.save(intent)).toBe(false);
    expect(blocked.read()).toBeNull();
    expect(blocked.context()).toBeUndefined();
  });
});

it('recovers exact merge metadata only under the original account partition', () => {
  const s = storage();
  const account = createCartJournal(s, () => 1000, 'A'.repeat(43));
  const request = {
    guestCartId: key,
    guestOwnerContext: key,
    ownerContext: key,
    reviewFingerprint: 'F'.repeat(43),
    version: 2,
  };
  const merge: CartIntent = { ...intent, command: { kind: 'merge', request } };
  expect(account.save(merge)).toBe(true);
  expect(account.read()).toEqual(merge);
  expect(createCartJournal(s, () => 1000, 'B'.repeat(43)).read()).toBeNull();
  expect(createCartJournal(s, () => 1000).read()).toBeNull();
});

it('restores a Move with its observed Wishlist revision only for the original partition', () => {
  const s = storage();
  const partition = 'A'.repeat(43);
  const account = createCartJournal(s, () => 1000, partition);
  const move: CartIntent = {
    ...intent,
    command: {
      kind: 'wishlist-transfer',
      request: {
        action: 'MOVE',
        productId: key,
        variantId: key,
        quantity: '3',
        wishlistVersion: 4,
      },
    },
  };
  expect(account.save(move)).toBe(true);
  expect(account.read()).toEqual(move);
  expect(createCartJournal(s, () => 1000, 'B'.repeat(43)).read()).toBeNull();
  expect(createCartJournal(s, () => 1000).read()).toBeNull();
});

it('retains an expired Move for review under the original partition', () => {
  const account = createCartJournal(storage(), () => 8 * 86_400_000, 'A'.repeat(43));
  const move: CartIntent = {
    ...intent,
    command: {
      kind: 'wishlist-transfer',
      request: {
        action: 'MOVE',
        productId: key,
        variantId: key,
        quantity: '1',
        wishlistVersion: 2,
      },
    },
  };
  expect(account.save(move)).toBe(true);
  expect(account.read()).toEqual(move);
});
