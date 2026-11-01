import { describe, expect, it } from 'vitest';
import {
  GUEST_OP_PREFIX,
  LEGACY_GUEST_KEY,
  clearTransferredGuestItems,
  readGuestJournal,
  writeGuestOperation,
} from './guest-journal';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';

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

describe('guest Wishlist journal', () => {
  it('migrates valid legacy records without persisting presentation fields or erasing good rows', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_GUEST_KEY,
      JSON.stringify([
        {
          id: a,
          title: 'Old title',
          price: 99,
          savedAt: '2024-01-02T00:00:00.000Z',
          preferredVariantId: b,
        },
        { id: 'invalid' },
        { id: a, title: 'Duplicate' },
        { id: c, imageUrl: '/old.jpg' },
      ]),
    );
    storage.setItem('maevelle_wishlist_shares_v1', 'secret-management-token');
    const first = readGuestJournal(storage);
    const second = readGuestJournal(storage);
    expect(first.items).toEqual(second.items);
    expect(first.items).toHaveLength(2);
    expect(first.items.find((item) => item.productId === a)?.preferredVariantId).toBe(b);
    expect(first.items.find((item) => item.productId === a)?.savedAt).toBe(
      '2024-01-02T00:00:00.000Z',
    );
    expect(JSON.stringify([...first.items])).not.toContain('Old title');
    expect(storage.getItem(LEGACY_GUEST_KEY)).toBeNull();
    expect(storage.getItem('maevelle_wishlist_shares_v1')).toBe('secret-management-token');
  });

  it('converges additive tab writes, duplicate notifications and deterministic same-product conflicts', () => {
    const storage = new MemoryStorage();
    writeGuestOperation(storage, a, 'save');
    writeGuestOperation(storage, b, 'save');
    expect(
      readGuestJournal(storage)
        .items.map((item) => item.productId)
        .sort(),
    ).toEqual([a, b]);
    writeGuestOperation(storage, a, 'remove');
    writeGuestOperation(storage, b, 'remove');
    expect(readGuestJournal(storage, true).items).toHaveLength(0);
    expect(readGuestJournal(storage, true).items).toHaveLength(0);
    expect(
      [...Array(storage.length)]
        .map((_, index) => storage.key(index))
        .filter((key) => key?.startsWith(GUEST_OP_PREFIX)),
    ).toHaveLength(2);
  });

  it('keeps a newer guest operation when an older frozen merge is confirmed', () => {
    const storage = new MemoryStorage();
    writeGuestOperation(storage, a, 'save');
    const frozen = readGuestJournal(storage);
    writeGuestOperation(storage, a, 'remove');
    writeGuestOperation(storage, a, 'save');
    clearTransferredGuestItems(storage, frozen, new Set([a]));
    expect(readGuestJournal(storage).items.map((item) => item.productId)).toEqual([a]);
  });

  it('leaves prior state intact when a storage write fails', () => {
    class FailingStorage extends MemoryStorage {
      override setItem(key: string, value: string) {
        if (key.startsWith(GUEST_OP_PREFIX)) throw new Error('quota');
        super.setItem(key, value);
      }
    }
    const storage = new FailingStorage();
    expect(() => writeGuestOperation(storage, a, 'save')).toThrow('quota');
    expect(readGuestJournal(storage).items).toHaveLength(0);
  });
});
