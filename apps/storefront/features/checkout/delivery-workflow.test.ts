import { describe, it, expect, vi } from 'vitest';
import type {
  CheckoutDeliveryStateDto,
  CheckoutDraftDto,
  ShopperAddressDto,
} from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { createReviewController } from './foundation-controller';
import { createReviewJournal } from './foundation-journal';
import type { ReviewIntent } from './foundation-types';
import type { PrivateDeliveryIntent } from './delivery-types';

const id = () => crypto.randomUUID();
const contact = () => ({
  recipientName: 'মোঃ হানিফ',
  mobile: '০১৭১২৩৪৫৬৭৮',
  geographyNodeId: id(),
  addressLine1: 'বাড়ি ১২, সড়ক ৩',
  addressLine2: null,
  instructions: 'বিকেলে আসুন',
});
function fixture() {
  const map = new Map<string, string>(),
    storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
  let owner: string | null = null,
    clock = Date.now();
  const draftId = id();
  let confirmed: CheckoutDeliveryStateDto = {
    draftId,
    draftStatus: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    revision: '1',
    delivery: null,
    savedAddress: null,
    eligibility: null,
    configurationChanged: false,
    reviewRequired: true,
    quoteAvailable: false,
    purchaseAvailable: false,
  };
  const addresses: ShopperAddressDto[] = [];
  const draft = (): CheckoutDraftDto => ({
    id: draftId,
    implementationVersion: 2,
    revision: confirmed.revision,
    ownerKind: owner ? 'ACCOUNT' : 'GUEST',
    status: 'ACTIVE',
    expiresAt: confirmed.expiresAt,
    currency: 'BDT',
    source: { kind: 'BUY_NOW' },
    sourceReviewRequired: false,
    purchaseAvailable: false,
    lines: [{ id: id(), variantId: id(), quantity: '1', sourceCartLineId: null }],
  });
  const api = {
    establish: vi.fn(async () => ({ id: id(), expiresAt: confirmed.expiresAt })),
    read: vi.fn(async () => draft()),
    mutate: vi.fn(async (intent: ReviewIntent) => {
      void intent;
      return draft();
    }),
    revoke: vi.fn(async () => ({ revoked: true as const })),
  };
  const privateApi = {
    read: vi.fn(async (_id: string, _owner: unknown, _signal: AbortSignal) => {
      void _id;
      void _owner;
      void _signal;
      return structuredClone(confirmed);
    }),
    addresses: vi.fn(async (_owner: unknown, _offset: number, _signal: AbortSignal) => {
      void _owner;
      void _offset;
      void _signal;
      return { items: addresses, nextOffset: null as number | null };
    }),
    mutate: vi.fn(
      async (
        intent: PrivateDeliveryIntent,
        _signal: AbortSignal,
      ): Promise<CheckoutDeliveryStateDto | { id: string }> => {
        void _signal;
        const body = JSON.parse(intent.body);
        if (intent.kind === 'address') return { id: id() };
        confirmed = {
          ...confirmed,
          revision: String(BigInt(confirmed.revision) + 1n),
          delivery: body.delivery ? { ...body.delivery, countryCode: 'BD' } : confirmed.delivery,
          reviewRequired: false,
        };
        return structuredClone(confirmed);
      },
    ),
    search: vi.fn(async () => ({ items: [], nextOffset: null })),
  };
  const journal = createReviewJournal(storage, () => clock),
    controller = createReviewController({
      api,
      deliveryApi: privateApi,
      journal,
      resolveOwner: async () => owner,
      now: () => clock,
    });
  return {
    map,
    storage,
    journal,
    controller,
    api,
    privateApi,
    draftId,
    confirmed: () => confirmed,
    setServer: (patch: Partial<CheckoutDeliveryStateDto>) => {
      confirmed = { ...confirmed, ...patch };
    },
    owner: (value: string | null) => {
      owner = value;
    },
    advance: () => {
      clock += 60000;
    },
    start: () => controller.initiate({ kind: 'BUY_NOW', variantId: id(), quantity: '1' }),
    clone: () =>
      createReviewController({
        api,
        deliveryApi: privateApi,
        journal: createReviewJournal(storage, () => clock),
        resolveOwner: async () => owner,
        now: () => clock,
      }),
  };
}
describe('private delivery composes into the Checkout authority and shared revision', () => {
  it('clears the previous destination before a different draft is exposed', async () => {
    const f = fixture();
    await f.start();
    await f.controller.delivery.save(contact());
    const next = { ...f.controller.getSnapshot().draft!, id: id() };
    f.api.mutate.mockResolvedValueOnce(next);
    await f.start();
    expect(f.controller.getSnapshot().draft?.id).toBe(next.id);
    expect(f.controller.getSnapshot().delivery.confirmed).toBeNull();
    expect(f.controller.getSnapshot().delivery.addresses).toEqual([]);
  });

  it('forgets private delivery state when the guest explicitly revokes the session', async () => {
    const f = fixture();
    await f.start();
    await f.controller.delivery.save(contact());
    await f.controller.revoke();
    expect(f.controller.getSnapshot().draft).toBeNull();
    expect(f.controller.getSnapshot().delivery.confirmed).toBeNull();
    expect(f.controller.getSnapshot().delivery.pending).toBeNull();
  });

  it('queues initial private restoration behind foundation acceptance without fetching private data on unrelated entry', async () => {
    const f = fixture();
    let loading: Promise<unknown> | undefined;
    const unsubscribe = f.controller.subscribe(() => {
      if (f.controller.getSnapshot().draft && !loading) loading = f.controller.delivery.refresh();
    });
    await f.start();
    await loading;
    unsubscribe();
    expect(f.privateApi.read).toHaveBeenCalledTimes(1);
    expect(f.controller.getSnapshot().delivery.confirmed?.draftId).toBe(f.draftId);
  });

  it('hides private state on backgrounding while retaining a same-owner exact retry in memory', async () => {
    const f = fixture();
    await f.start();
    f.privateApi.mutate.mockRejectedValueOnce(new TypeError('lost response'));
    await expect(f.controller.delivery.save(contact())).rejects.toThrow();
    const intent = f.controller.getSnapshot().delivery.pending;
    f.controller.suspend();
    expect(f.controller.getSnapshot().suspended).toBe(true);
    expect(f.controller.getSnapshot().delivery.pending).toBe(intent);
    await f.controller.resume();
    expect(f.controller.getSnapshot().suspended).toBe(false);
    expect(f.privateApi.mutate).toHaveBeenCalledTimes(1);
    await f.controller.delivery.retry();
    expect(f.privateApi.mutate.mock.calls[1]![0]).toEqual(intent);
  });
  it('never reveals suspended A data when identity verification discovers B', async () => {
    const f = fixture();
    f.owner('A'.repeat(43));
    await f.start();
    f.setServer({ delivery: { ...contact(), countryCode: 'BD' } });
    await f.controller.delivery.refresh();
    f.controller.suspend();
    f.owner('B'.repeat(43));
    await expect(f.controller.resume()).rejects.toThrow();
    expect(f.controller.getSnapshot().delivery.confirmed).toBeNull();
    expect(f.controller.getSnapshot().draft).toBeNull();
  });
  it('saves through the shared revision and never journals contact PII', async () => {
    const f = fixture();
    await f.start();
    await f.controller.delivery.refresh();
    const input = contact();
    await f.controller.delivery.save(input);
    expect(f.controller.getSnapshot().draft?.revision).toBe('2');
    expect(f.controller.getSnapshot().delivery.confirmed?.delivery?.recipientName).toBe(
      input.recipientName,
    );
    const stored = JSON.stringify([...f.map.values()]);
    expect(stored).not.toContain(input.recipientName);
    expect(stored).not.toContain(input.mobile);
    expect(stored).not.toContain(input.addressLine1);
    expect(f.privateApi.addresses).not.toHaveBeenCalled();
  });
  it('retains an immutable exact body/key after timeout, ignores later input mutation and blocks fresh intents', async () => {
    const f = fixture();
    await f.start();
    const input = contact();
    f.privateApi.mutate.mockRejectedValueOnce(new TypeError('network lost'));
    await expect(f.controller.delivery.save(input)).rejects.toThrow();
    const pending = f.controller.getSnapshot().delivery.pending!;
    input.recipientName = 'Changed after sending';
    await expect(f.controller.delivery.save(input)).rejects.toThrow();
    await f.controller.checkOwner();
    expect(f.controller.getSnapshot().delivery.pending).toBe(pending);
    await f.controller.delivery.retry();
    expect(f.privateApi.mutate.mock.calls[1]![0]).toEqual(pending);
    expect(JSON.parse(pending.body).delivery.recipientName).not.toBe(input.recipientName);
  });
  it('coalesces no distinct private commands while one write is in flight', async () => {
    const f = fixture();
    await f.start();
    let release!: (v: CheckoutDeliveryStateDto) => void;
    f.privateApi.mutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const saving = f.controller.delivery.save(contact());
    await vi.waitFor(() => expect(f.privateApi.mutate).toHaveBeenCalledTimes(1));
    await expect(f.controller.delivery.save(contact())).rejects.toThrow('already running');
    release(f.confirmed());
    await saving;
    expect(f.privateApi.mutate).toHaveBeenCalledTimes(1);
  });
  it('does not replace an uncertain delivery with a source refresh, new draft or source update', async () => {
    const f = fixture();
    await f.start();
    f.privateApi.mutate.mockRejectedValueOnce(new TypeError('offline'));
    await expect(f.controller.delivery.save(contact())).rejects.toThrow();
    await expect(f.controller.refresh()).rejects.toThrow();
    expect(f.controller.getSnapshot().draft?.id).toBe(f.draftId);
    await expect(
      f.controller.initiate({ kind: 'BUY_NOW', variantId: id(), quantity: '1' }),
    ).rejects.toThrow();
    await expect(f.controller.update({ revision: '1', action: 'ABANDON' })).rejects.toThrow();
    expect(f.api.mutate).toHaveBeenCalledTimes(1);
  });
  it('reloads server truth after an uncertain commit without reconstructing or persisting a private body', async () => {
    const f = fixture();
    await f.start();
    const input = contact();
    f.privateApi.mutate.mockImplementationOnce(async () => {
      f.setServer({ revision: '2', delivery: { ...input, countryCode: 'BD' } });
      throw new TypeError('response lost');
    });
    await expect(f.controller.delivery.save(input)).rejects.toThrow();
    const next = f.clone();
    await next.refresh();
    await next.delivery.refresh();
    expect(next.getSnapshot().delivery.pending).toBeNull();
    expect(next.getSnapshot().delivery.confirmed?.delivery?.recipientName).toBe(
      input.recipientName,
    );
    expect(f.privateApi.mutate).toHaveBeenCalledTimes(1);
  });
  it('requires explicit review after 409 and sends a fresh intent only with the retrieved shared revision', async () => {
    const f = fixture();
    await f.start();
    f.setServer({ revision: '5', delivery: { ...contact(), countryCode: 'BD' } });
    f.privateApi.mutate.mockRejectedValueOnce(
      new StorefrontClientApiError(409, 'STALE_REVISION', 'private diagnostic'),
    );
    await expect(f.controller.delivery.save(contact())).rejects.toThrow();
    expect(f.controller.getSnapshot().delivery).toMatchObject({
      phase: 'conflict',
      conflictReady: true,
      pending: null,
    });
    await expect(f.controller.delivery.save(contact())).rejects.toThrow('Review the conflict');
    const old = f.privateApi.mutate.mock.calls[0]![0];
    f.controller.delivery.acknowledge();
    await f.controller.delivery.save(contact());
    const next = f.privateApi.mutate.mock.calls[1]![0];
    expect(next.key).not.toBe(old.key);
    expect(JSON.parse(next.body).revision).toBe('5');
  });
  it('cannot acknowledge a conflict when fetching the latest state failed', async () => {
    const f = fixture();
    await f.start();
    f.privateApi.mutate.mockRejectedValueOnce(
      new StorefrontClientApiError(409, 'STALE_REVISION', 'changed'),
    );
    f.privateApi.read.mockRejectedValueOnce(new TypeError('offline'));
    await expect(f.controller.delivery.save(contact())).rejects.toThrow();
    f.controller.delivery.acknowledge();
    expect(f.controller.getSnapshot().delivery.phase).toBe('conflict');
    await expect(f.controller.delivery.save(contact())).rejects.toThrow();
    f.setServer({ revision: '8' });
    await f.controller.delivery.refresh();
    expect(f.controller.getSnapshot().delivery).toMatchObject({
      phase: 'conflict',
      conflictReady: true,
    });
  });
  it('clears private state and discards an account A save response after B takes over, even if abort is ignored', async () => {
    const f = fixture();
    f.owner('A'.repeat(43));
    await f.start();
    await f.controller.delivery.refresh();
    let release!: (v: CheckoutDeliveryStateDto) => void;
    f.privateApi.mutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const saving = f.controller.delivery.save(contact()).catch(() => undefined);
    await vi.waitFor(() => expect(f.privateApi.mutate).toHaveBeenCalled());
    f.controller.invalidate(true);
    f.owner('B'.repeat(43));
    f.controller.invalidate();
    await f.controller.refresh();
    release({
      ...f.confirmed(),
      delivery: { ...contact(), recipientName: 'Account A private', countryCode: 'BD' },
    });
    await saving;
    expect(f.controller.getSnapshot().delivery.confirmed).toBeNull();
    expect(f.controller.getSnapshot().delivery.pending).toBeNull();
    expect(JSON.stringify([...f.map.values()])).not.toContain('Account A private');
  });
  it('ignores delayed address-book results from a previous identity', async () => {
    const f = fixture();
    f.owner('A'.repeat(43));
    await f.start();
    let release!: (page: { items: ShopperAddressDto[]; nextOffset: null }) => void;
    f.privateApi.addresses.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const reading = f.controller.delivery.refresh().catch(() => undefined);
    await vi.waitFor(() => expect(f.privateApi.addresses).toHaveBeenCalled());
    f.controller.invalidate(true);
    f.owner('B'.repeat(43));
    f.controller.invalidate();
    await f.controller.refresh();
    release({
      items: [
        {
          id: id(),
          revision: '1',
          recipientName: 'Account A secret',
          mobile: '01712345678',
          countryCode: 'BD',
          geographyNodeId: id(),
          addressLine1: 'A secret',
          addressLine2: null,
          instructions: null,
          label: null,
          isDefault: true,
        },
      ],
      nextOffset: null,
    });
    await reading;
    expect(f.controller.getSnapshot().delivery.addresses).toEqual([]);
  });
  it('clears all private projections when an expired/revoked session rejects a save', async () => {
    const f = fixture();
    f.owner('A'.repeat(43));
    await f.start();
    f.setServer({ delivery: { ...contact(), countryCode: 'BD' } });
    await f.controller.delivery.refresh();
    f.privateApi.mutate.mockRejectedValueOnce(
      new StorefrontClientApiError(401, 'SESSION_EXPIRED', 'expired'),
    );
    await expect(f.controller.delivery.save(contact())).rejects.toThrow();
    expect(f.controller.getSnapshot().draft).toBeNull();
    expect(f.controller.getSnapshot().delivery.confirmed).toBeNull();
  });
  it('selects exact saved-address revisions and forbids implicit revalidation of changed/removed associations', async () => {
    const f = fixture();
    f.owner('A'.repeat(43));
    await f.start();
    const addressId = id();
    await f.controller.delivery.select(addressId, '9007199254740993');
    expect(JSON.parse(f.privateApi.mutate.mock.calls[0]![0].body)).toEqual({
      revision: '1',
      savedAddressId: addressId,
      savedAddressRevision: '9007199254740993',
    });
    for (const status of ['CHANGED', 'REMOVED'] as const) {
      f.setServer({ savedAddress: { id: addressId, selectedRevision: '1', status } });
      await f.controller.delivery.refresh();
      await expect(f.controller.delivery.revalidate()).rejects.toThrow('Explicitly review');
    }
    expect(f.privateApi.mutate).toHaveBeenCalledTimes(1);
  });
  it('saves addresses only through explicit account commands and signals recovery completion separately', async () => {
    const f = fixture();
    f.owner('A'.repeat(43));
    await f.start();
    await f.controller.delivery.save(contact());
    expect(f.privateApi.mutate.mock.calls[0]![0].kind).toBe('delivery');
    await f.controller.delivery.address({ ...contact(), isDefault: true, label: 'Home' });
    expect(f.privateApi.mutate.mock.calls[1]![0]).toMatchObject({
      kind: 'address',
      method: 'POST',
    });
    expect(f.controller.getSnapshot().delivery.addressOutcomeKey).toBe(
      f.privateApi.mutate.mock.calls[1]![0].key,
    );
  });
  it('strips fabricated financial/internal fields from the allowlisted private intent', async () => {
    const f = fixture();
    await f.start();
    const forged = { ...contact(), shippingAmount: '0', customerId: id(), purchaseAvailable: true };
    await f.controller.delivery.save(forged);
    expect(f.privateApi.mutate.mock.calls[0]![0].body).not.toMatch(
      /shippingAmount|customerId|purchaseAvailable/,
    );
  });
  it('honors rate-limit retry timing without a new key or automatic loop', async () => {
    const f = fixture();
    await f.start();
    const error = new StorefrontClientApiError(429, 'RATE_LIMITED', 'wait', 60);
    f.privateApi.mutate.mockRejectedValueOnce(error);
    await expect(f.controller.delivery.save(contact())).rejects.toThrow();
    const original = f.controller.getSnapshot().delivery.pending;
    await expect(f.controller.delivery.retry()).rejects.toThrow('Wait');
    expect(f.privateApi.mutate).toHaveBeenCalledTimes(1);
    f.advance();
    await f.controller.delivery.retry();
    expect(f.privateApi.mutate.mock.calls[1]![0]).toEqual(original);
  });
});
