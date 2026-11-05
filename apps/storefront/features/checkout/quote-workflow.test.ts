import { describe, expect, it, vi } from 'vitest';
import type {
  CheckoutDraftDto,
  CheckoutDeliveryStateDto,
  CheckoutQuoteDto,
} from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { createReviewController } from './foundation-controller';
import { createReviewJournal } from './foundation-journal';
import type { PrivateQuoteIntent } from './quote-types';
import { sampleQuote } from './quote-test-fixture';

function signal() {
  let release!: (value: CheckoutQuoteDto) => void;
  const promise = new Promise<CheckoutQuoteDto>((r) => {
    release = r;
  });
  return { promise, release };
}
async function fixture(initial = '2') {
  const id = crypto.randomUUID(),
    template = sampleQuote(id),
    map = new Map<string, string>(),
    areaId = crypto.randomUUID(),
    ruleId = crypto.randomUUID();
  let owner: string | null = null,
    rev = initial,
    clock = Date.now(),
    current: CheckoutQuoteDto | null = null;
  const draft = (): CheckoutDraftDto => ({
    id,
    implementationVersion: 2,
    revision: rev,
    ownerKind: owner ? 'ACCOUNT' : 'GUEST',
    status: 'ACTIVE',
    expiresAt: new Date(clock + 3600000).toISOString(),
    currency: 'BDT',
    sourceReviewRequired: false,
    source: { kind: 'BUY_NOW' },
    lines: [
      {
        id: template.facts.lines[0]!.id,
        variantId: template.facts.lines[0]!.variantId,
        quantity: '1',
        sourceCartLineId: null,
      },
    ],
    purchaseAvailable: false,
  });
  const delivery = (): CheckoutDeliveryStateDto => ({
    draftId: id,
    revision: rev,
    draftStatus: 'ACTIVE',
    expiresAt: draft().expiresAt,
    delivery: {
      recipientName: 'Shopper',
      mobile: '+8801712345678',
      addressLine1: 'Private destination',
      countryCode: 'BD',
      geographyNodeId: areaId,
      addressLine2: null,
      instructions: null,
    },
    savedAddress: null,
    eligibility: {
      status: 'ELIGIBLE',
      configurationRevision: 'x',
      tariff: { ruleId, revision: '1', amount: '0.0000', currency: 'BDT', final: false },
      courierCompatibility: 'NOT_EVALUATED',
    },
    configurationChanged: false,
    reviewRequired: false,
    quoteAvailable: false,
    purchaseAvailable: false,
  });
  const api = {
    establish: vi.fn(async () => ({ id: crypto.randomUUID(), expiresAt: draft().expiresAt })),
    read: vi.fn(async () => draft()),
    mutate: vi.fn(async () => draft()),
    revoke: vi.fn(async () => ({ revoked: true as const })),
  };
  const privateApi = {
    read: vi.fn(async () => delivery()),
    addresses: vi.fn(async () => ({ items: [], nextOffset: null })),
    search: vi.fn(async () => ({ items: [], nextOffset: null })),
    mutate: vi.fn(async () => {
      rev = String(BigInt(rev) + 1n);
      return delivery();
    }),
  };
  const quoteApi = {
    current: vi.fn(async () => current),
    detail: vi.fn(async () => template),
    mutate: vi.fn(async (intent: PrivateQuoteIntent) => {
      if (intent.kind === 'create') {
        rev = String(BigInt(rev) + 1n);
        current = {
          ...template,
          id: crypto.randomUUID(),
          draftRevision: rev,
          previousQuoteId: current?.id ?? null,
          facts: {
            ...template.facts,
            coupons: JSON.parse(intent.body).couponCodes.map((code: string) => ({
              code,
              status: 'NO_CURRENT_BENEFIT',
            })),
          },
        };
      } else current = { ...current!, acknowledged: true, reviewRequired: false };
      return structuredClone(current!);
    }),
  };
  const journal = createReviewJournal(
    {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
    },
    () => clock,
  );
  const controller = createReviewController({
    api,
    deliveryApi: privateApi,
    quoteApi,
    journal,
    now: () => clock,
    resolveOwner: async () => owner,
  });
  await controller.initiate({
    kind: 'BUY_NOW',
    variantId: template.facts.lines[0]!.variantId,
    quantity: '1',
  });
  await controller.delivery.refresh();
  return {
    controller,
    api,
    privateApi,
    quoteApi,
    map,
    template,
    draft,
    rev: () => rev,
    setRev: (v: string) => {
      rev = v;
    },
    current: () => current,
    owner: (v: string | null) => {
      owner = v;
    },
    advance: () => {
      clock += 60001;
    },
  };
}
describe('quote workflow uses the existing Checkout controller and private intent protocol', () => {
  it('synchronizes the root as a string after creation, but acknowledgement does not increment it', async () => {
    const f = await fixture('9007199254740993');
    await f.controller.quote.create(['NO-BENEFIT']);
    expect(f.controller.getSnapshot().draft?.revision).toBe('9007199254740994');
    await f.controller.quote.acknowledge();
    expect(f.controller.getSnapshot().draft?.revision).toBe('9007199254740994');
    expect(f.controller.getSnapshot().quote.current).toMatchObject({
      acknowledged: true,
      reviewRequired: false,
    });
    const intent = f.quoteApi.mutate.mock.calls[1]![0];
    expect(JSON.parse(intent.body)).toEqual({
      revision: '9007199254740994',
      fingerprint: 'x'.repeat(43),
    });
    await f.controller.delivery.save({
      recipientName: 'Shopper',
      mobile: '01712345678',
      geographyNodeId: crypto.randomUUID(),
      addressLine1: 'Edited destination',
    });
    expect(f.controller.getSnapshot().draft?.revision).toBe('9007199254740995');
    expect(f.controller.getSnapshot().quote.observedRevision).toBeNull();
  });
  it('keeps a current quote reviewable when delivery restores the same snapshot at the new shared revision', async () => {
    const f = await fixture();
    await f.controller.quote.create();
    await f.controller.delivery.refresh();
    expect(f.controller.getSnapshot().quote.observedRevision).toBe('3');
    await f.controller.quote.acknowledge();
    expect(f.controller.getSnapshot().quote.current?.acknowledged).toBe(true);
  });
  it('keeps an uncertain accepted command exactly, blocks other writes, and replays without duplicate revision or browser persistence', async () => {
    const f = await fixture(),
      mutate = f.quoteApi.mutate.getMockImplementation()!;
    let accepted: CheckoutQuoteDto | undefined;
    f.quoteApi.mutate.mockImplementationOnce(async (intent) => {
      accepted = await mutate(intent);
      throw new StorefrontClientApiError(503, 'UNAVAILABLE', 'Synthetic response loss');
    });
    await expect(f.controller.quote.create(['PRIVATE-CODE'])).rejects.toThrow();
    const pending = f.controller.getSnapshot().quote.pending!;
    expect(f.controller.getSnapshot().quote.phase).toBe('unknown');
    await expect(f.controller.update({ revision: '2', action: 'ABANDON' })).rejects.toThrow();
    await expect(f.controller.delivery.revalidate()).rejects.toThrow();
    await expect(f.controller.quote.create(['MODIFIED'])).rejects.toThrow();
    f.quoteApi.mutate.mockResolvedValueOnce(accepted!);
    await f.controller.quote.retry();
    expect(f.quoteApi.mutate.mock.calls[1]![0]).toBe(pending);
    expect(f.rev()).toBe('3');
    expect(f.controller.getSnapshot().draft?.revision).toBe('3');
    expect([...f.map.values()].join('')).not.toMatch(
      /PRIVATE-CODE|evaluatedTotal|fingerprint|Immutable clip|Private destination/,
    );
  });
  it('recovers a superseded accepted quote without moving the root revision backwards', async () => {
    const f = await fixture(),
      old = {
        ...f.template,
        draftRevision: '3',
        status: 'SUPERSEDED' as const,
        issues: ['SUPERSEDED' as const],
      };
    f.quoteApi.mutate.mockImplementationOnce(async () => {
      throw new Error('lost response');
    });
    await expect(f.controller.quote.create()).rejects.toThrow();
    f.setRev('8');
    f.quoteApi.mutate.mockResolvedValueOnce(old);
    await f.controller.quote.retry();
    expect(f.controller.getSnapshot().draft?.revision).toBe('8');
    expect(f.controller.getSnapshot().quote.current?.status).toBe('SUPERSEDED');
    await expect(f.controller.quote.acknowledge()).rejects.toThrow();
  });
  it('never creates on reads, treats conflicts as explicit review, and keeps historical facts separate', async () => {
    const f = await fixture();
    await f.controller.quote.refresh();
    expect(f.quoteApi.mutate).not.toHaveBeenCalled();
    await f.controller.quote.create();
    const first = f.controller.getSnapshot().quote.current!;
    await f.controller.quote.create();
    const second = f.controller.getSnapshot().quote.current!;
    expect(second.previousQuoteId).toBe(first.id);
    expect(f.controller.getSnapshot().quote.previous?.id).toBe(first.id);
    f.quoteApi.mutate.mockRejectedValueOnce(
      new StorefrontClientApiError(409, 'STALE_REVISION', 'Synthetic conflict'),
    );
    await expect(f.controller.quote.acknowledge()).rejects.toThrow();
    expect(f.controller.getSnapshot().quote).toMatchObject({
      phase: 'conflict',
      conflictReady: true,
      pending: null,
    });
    await expect(f.controller.quote.create()).rejects.toThrow();
    f.controller.quote.reviewConflict();
    await f.controller.quote.acknowledge();
  });
  it('respects Retry-After and refuses expired, invalidated, historically acknowledged or locally edited inputs', async () => {
    const f = await fixture();
    f.controller.deliveryEditing(true);
    await expect(f.controller.quote.create()).rejects.toThrow();
    f.controller.deliveryEditing(false);
    f.quoteApi.mutate.mockRejectedValueOnce(
      new StorefrontClientApiError(429, 'RATE_LIMITED', 'Limited', 60),
    );
    await expect(f.controller.quote.create()).rejects.toThrow();
    await expect(f.controller.quote.retry()).rejects.toThrow();
    expect(f.quoteApi.mutate).toHaveBeenCalledTimes(1);
    f.advance();
    await f.controller.quote.retry();
    f.quoteApi.current.mockResolvedValueOnce({
      ...f.current()!,
      status: 'EXPIRED',
      issues: ['QUOTE_EXPIRED'],
      acknowledged: true,
      reviewRequired: true,
    });
    await f.controller.quote.refresh();
    await expect(f.controller.quote.acknowledge()).rejects.toThrow();
    f.quoteApi.current.mockResolvedValueOnce({
      ...f.current()!,
      status: 'INVALIDATED',
      issues: ['INSUFFICIENT_STOCK'],
      acknowledged: true,
      reviewRequired: true,
    });
    await f.controller.quote.refresh();
    await expect(f.controller.quote.acknowledge()).rejects.toThrow();
  });
  it('rejects delayed ignored-abort old-owner responses and clears pending, coupons and comparison on owner change', async () => {
    const f = await fixture(),
      delayed = signal();
    f.quoteApi.mutate.mockImplementationOnce(async () => delayed.promise);
    const pending = f.controller.quote.create(['PRIVATE-A']);
    await vi.waitFor(() => expect(f.quoteApi.mutate).toHaveBeenCalled());
    f.owner('B'.repeat(43));
    f.controller.invalidate();
    delayed.release(f.template);
    await expect(pending).rejects.toThrow();
    expect(f.controller.getSnapshot().quote).toMatchObject({
      current: null,
      previous: null,
      pending: null,
    });
  });
  it('suspends unknown writes and requires a live owner check before an exact retry', async () => {
    const f = await fixture(),
      delayed = signal();
    f.quoteApi.mutate.mockImplementationOnce(async () => delayed.promise);
    const pending = f.controller.quote.create();
    await vi.waitFor(() => expect(f.quoteApi.mutate).toHaveBeenCalled());
    f.controller.suspend();
    expect(f.controller.getSnapshot()).toMatchObject({
      suspended: true,
      quote: { phase: 'unknown' },
    });
    delayed.release(f.template);
    await expect(pending).rejects.toThrow();
    await f.controller.resume();
    expect(f.controller.getSnapshot().quote.pending).not.toBeNull();
    await f.controller.quote.retry();
    expect(f.controller.getSnapshot().quote.pending).toBeNull();
  });
});
