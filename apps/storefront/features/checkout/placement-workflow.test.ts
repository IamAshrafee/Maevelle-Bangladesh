import { describe, expect, it, vi } from 'vitest';
import type {
  CheckoutCommittedOrderDto,
  CheckoutDeliveryStateDto,
  CheckoutDraftDto,
  CheckoutFinalTermsDto,
  CheckoutPlacementResultDto,
  CheckoutQuoteDto,
} from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { createReviewController } from './foundation-controller';
import { createReviewJournal } from './foundation-journal';
import { sampleQuote } from './quote-test-fixture';
import type { FinalTermsInput, PlacementIntent } from './placement-api';
import type { PrivateQuoteIntent } from './quote-types';

const id = () => crypto.randomUUID();
const code = (status: number, name: string, wait?: number) =>
  new StorefrontClientApiError(status, name, name, wait);
async function fixture(account = false, cart = false) {
  let owner = account ? 'a'.repeat(43) : null;
  let ownerError: Error | undefined;
  const draftId = id(),
    context = id(),
    area = id(),
    rule = id(),
    bag = id();
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  let clock = Date.now(),
    draftStatus: CheckoutDraftDto['status'] = 'ACTIVE';
  const initial = sampleQuote(draftId, '9007199254740993');
  initial.acknowledged = true;
  initial.reviewRequired = false;
  if (cart) initial.source = { kind: 'CART', cartId: bag, cartRevision: '7' };
  let q: CheckoutQuoteDto = initial;
  const draft = (): CheckoutDraftDto => ({
    id: draftId,
    status: draftStatus,
    ownerKind: owner ? 'ACCOUNT' : 'GUEST',
    revision: q.draftRevision,
    expiresAt: initial.expiresAt,
    implementationVersion: 2,
    purchaseAvailable: false,
    currency: 'BDT',
    source: q.source,
    sourceReviewRequired: false,
    lines: [
      {
        id: q.facts.lines[0]!.id,
        variantId: q.facts.lines[0]!.variantId,
        quantity: '1',
        sourceCartLineId: cart ? id() : null,
      },
    ],
  });
  const delivery = (): CheckoutDeliveryStateDto => ({
    draftId,
    draftStatus,
    revision: draft().revision,
    expiresAt: draft().expiresAt,
    delivery: {
      recipientName: 'Shopper',
      mobile: '01700000000',
      countryCode: 'BD',
      addressLine1: 'Private address',
      geographyNodeId: area,
    },
    savedAddress: null,
    eligibility: {
      status: 'ELIGIBLE',
      configurationRevision: 'x',
      tariff: { ruleId: rule, revision: '1', amount: '0.0000', currency: 'BDT', final: false },
      courierCompatibility: 'NOT_EVALUATED',
    },
    configurationChanged: false,
    reviewRequired: false,
    quoteAvailable: false,
    purchaseAvailable: false,
  });
  const api = {
    establish: vi.fn(async () => ({ id: context, expiresAt: initial.expiresAt })),
    mutate: vi.fn(async () => draft()),
    read: vi.fn(async () => draft()),
    revoke: vi.fn(async () => ({ revoked: true as const })),
  };
  const deliveryApi = {
    read: vi.fn(async () => delivery()),
    addresses: vi.fn(async () => ({ items: [], nextOffset: null })),
    search: vi.fn(async () => ({ items: [], nextOffset: null })),
    mutate: vi.fn(async () => delivery()),
  };
  const quoteApi = {
    current: vi.fn(async () => q),
    detail: vi.fn(async () => q),
    mutate: vi.fn(async (intent: PrivateQuoteIntent) => {
      q =
        intent.kind === 'create'
          ? {
              ...q,
              id: id(),
              acknowledged: false,
              reviewRequired: true,
              draftRevision: String(BigInt(q.draftRevision) + 1n),
            }
          : { ...q, acknowledged: true, reviewRequired: false };
      return q;
    }),
  };
  const final = (input: FinalTermsInput): CheckoutFinalTermsDto => ({
    ...input,
    currency: 'BDT',
    expiresAt: new Date(clock + 300000).toISOString(),
    fingerprint: 'y'.repeat(43),
    merchandiseSubtotal: '100.0000',
    discountTotal: '0.0000',
    shipping: '0.0000',
    tax: '0.0000',
    taxTreatment: 'Fixture only',
    paymentFees: '0.0000',
    merchantWalletSurcharge: '0.0000',
    roundingAdjustment: '0.0000',
    payable: '100.0000',
  });
  let live: CheckoutCommittedOrderDto | null = null;
  const placementApi = {
    finalTerms: vi.fn(
      async (_draft: string, _owner: PlacementIntent['owner'], input: FinalTermsInput) => {
        void _draft;
        void _owner;
        return final(input);
      },
    ),
    place: vi.fn(async (intent: PlacementIntent): Promise<CheckoutPlacementResultDto> => {
      draftStatus = 'COMMITTED';
      live = {
        receipt: { orderId: id(), orderNumber: 'ORD-2026-001', terms: final(intent.accepted) },
        status: 'PENDING',
        payment: { status: 'UNPAID', outstanding: '100.0000' },
      };
      return { kind: 'COMMITTED', receipt: live.receipt };
    }),
    status: vi.fn(async () => {
      if (!live) throw code(404, 'NOT_FOUND');
      return live;
    }),
  };
  const open = () =>
    createReviewController({
      api,
      deliveryApi,
      quoteApi,
      placementApi,
      journal: createReviewJournal(storage, () => clock),
      now: () => clock,
      resolveOwner: async () => {
        if (ownerError) {
          const error = ownerError;
          ownerError = undefined;
          throw error;
        }
        return owner;
      },
    });
  const c = open();
  await c.initiate(
    cart
      ? { kind: 'CART', cartId: bag, cartRevision: '7' }
      : { kind: 'BUY_NOW', variantId: q.facts.lines[0]!.variantId, quantity: '1' },
  );
  await c.delivery.refresh();
  await c.quote.refresh();
  const check = () => c.placement.check('COD');
  const submit = (fingerprint = 'y'.repeat(43)) => c.placement.submit(fingerprint);
  return {
    c,
    api,
    deliveryApi,
    quoteApi,
    placementApi,
    check,
    submit,
    open,
    map,
    q: () => q,
    setQuote: (next: CheckoutQuoteDto) => {
      q = next;
    },
    switchOwner: () => {
      owner = 'b'.repeat(43);
    },
    failOwnerCheck: (error: Error) => {
      ownerError = error;
    },
    advance: (ms: number) => {
      clock += ms;
    },
    live: () => live,
    draft,
  };
}

describe('Checkout placement uses the existing owner, draft, delivery and quote controller', () => {
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const)('handles server commit for account=%s cart=%s', async (account, cart) => {
    const f = await fixture(account, cart);
    await f.check();
    expect(f.c.getSnapshot().placement.terms).toMatchObject({
      payable: '100.0000',
      revision: '9007199254740993',
    });
    await f.submit();
    const intent = f.placementApi.place.mock.calls[0]![0];
    expect(JSON.parse(intent.body)).toEqual({
      revision: '9007199254740993',
      quoteId: f.q().id,
      quoteFingerprint: f.q().fingerprint,
      method: 'COD',
      finalTermsFingerprint: 'y'.repeat(43),
    });
    expect(intent.owner.kind).toBe(account ? 'ACCOUNT' : 'GUEST');
    expect(f.c.getSnapshot().placement).toMatchObject({
      phase: 'committed',
      receipt: { orderNumber: 'ORD-2026-001' },
      status: { status: 'PENDING', payment: { status: 'UNPAID', outstanding: '100.0000' } },
    });
    expect([...f.map.values()].join()).not.toMatch(
      /ORD-2026|100\.0000|Private address|finalTermsFingerprint/,
    );
  });

  it('blocks on actual policy error without requesting placement or setting a recovery marker', async () => {
    const f = await fixture();
    f.placementApi.finalTerms.mockRejectedValueOnce(code(503, 'POLICY_BLOCKED', 2));
    await f.check();
    await f.submit();
    expect(f.c.getSnapshot().placement).toMatchObject({
      phase: 'blocked',
      terms: null,
      receipt: null,
      issue: { code: 'POLICY_BLOCKED' },
    });
    expect(f.placementApi.place).not.toHaveBeenCalled();
    expect([...f.map.values()].join()).not.toContain('placementAttempted');
  });

  it('requires acknowledged current quote, matching final fingerprint and unexpired final terms', async () => {
    const f = await fixture();
    f.setQuote({ ...f.q(), acknowledged: false, reviewRequired: true });
    await f.c.quote.refresh();
    await f.check();
    expect(f.placementApi.finalTerms).not.toHaveBeenCalled();
    await f.c.quote.acknowledge();
    await f.check();
    await f.submit('z'.repeat(43));
    f.advance(301000);
    await f.submit();
    expect(f.placementApi.place).not.toHaveBeenCalled();
  });

  it('clears approval when delivery edits start and rejects stale quotes', async () => {
    const f = await fixture();
    await f.check();
    f.c.deliveryEditing(true);
    expect(f.c.getSnapshot().placement.terms).toBeNull();
    f.c.deliveryEditing(false);
    f.setQuote({
      ...f.q(),
      status: 'INVALIDATED',
      reviewRequired: true,
      issues: ['SOURCE_CHANGED'],
    });
    await f.c.quote.refresh();
    await f.check();
    await f.submit();
    expect(f.placementApi.finalTerms).toHaveBeenCalledTimes(1);
    expect(f.placementApi.place).not.toHaveBeenCalled();
  });

  it('deduplicates rapid submit and retries the exact frozen body after transport loss, even after expiry', async () => {
    const f = await fixture();
    await f.check();
    f.placementApi.place.mockRejectedValueOnce(new TypeError('response lost'));
    await Promise.allSettled([f.submit(), f.submit()]);
    expect(f.placementApi.place).toHaveBeenCalledTimes(1);
    const original = f.placementApi.place.mock.calls[0]![0];
    expect(f.c.getSnapshot().placement).toMatchObject({
      phase: 'unknown',
      pending: original,
      receipt: null,
    });
    await expect(
      f.c.initiate({ kind: 'BUY_NOW', variantId: id(), quantity: '1' }),
    ).rejects.toThrow();
    f.advance(900000);
    await f.c.placement.retry();
    expect(f.placementApi.place.mock.calls[1]![0]).toBe(original);
    expect(f.c.getSnapshot().placement.receipt).not.toBeNull();
  });

  it('preserves the original key on rate limiting and prevents retry before cooldown', async () => {
    const f = await fixture();
    f.placementApi.place.mockRejectedValueOnce(code(429, 'RATE_LIMITED', 5));
    await f.check();
    await f.submit();
    await f.c.placement.retry();
    expect(f.placementApi.place).toHaveBeenCalledTimes(1);
    f.advance(5000);
    await f.c.placement.retry();
    expect(f.placementApi.place.mock.calls[1]![0]).toBe(f.placementApi.place.mock.calls[0]![0]);
  });

  it.each([
    'SOURCE_CHANGED',
    'DELIVERY_CHANGED',
    'FINAL_TERMS_CHANGED',
    'PROMOTION_UNAVAILABLE',
    'PAYMENT_METHOD_UNAVAILABLE',
  ])('requires a fresh explicitly acknowledged quote after durable %s', async (reason) => {
    const f = await fixture();
    await f.check();
    f.placementApi.place.mockResolvedValueOnce({ kind: 'REVIEW_REQUIRED', reason });
    await f.submit();
    await f.check();
    expect(f.c.getSnapshot().placement).toMatchObject({
      phase: 'review',
      terms: null,
      pending: null,
      issue: { code: reason },
    });
    expect(f.placementApi.finalTerms).toHaveBeenCalledTimes(1);
    await f.c.quote.create();
    await f.check();
    expect(f.placementApi.finalTerms).toHaveBeenCalledTimes(1);
    await f.c.quote.acknowledge();
    await f.check();
    await f.submit();
    expect(f.placementApi.place.mock.calls[1]![0].key).not.toBe(
      f.placementApi.place.mock.calls[0]![0].key,
    );
  });

  it.each(['IDEMPOTENCY_CONFLICT', 'CHECKOUT_COMMITTED'])(
    'does not infer a receipt from %s or replace the key',
    async (name) => {
      const f = await fixture();
      f.placementApi.place.mockRejectedValueOnce(code(409, name));
      await f.check();
      await f.submit();
      await f.check();
      await f.submit();
      expect(f.c.getSnapshot().placement).toMatchObject({ committedConflict: true, receipt: null });
      expect(f.placementApi.place).toHaveBeenCalledTimes(1);
    },
  );

  it('restores a committed draft using status only after a lost response and reload', async () => {
    const f = await fixture(true);
    const realPlace = f.placementApi.place.getMockImplementation()!;
    f.placementApi.place.mockImplementationOnce(async (intent) => {
      await realPlace(intent);
      throw code(503, 'UNAVAILABLE');
    });
    await f.check();
    await f.submit();
    const newPage = f.open();
    await newPage.refresh();
    expect(newPage.getSnapshot()).toMatchObject({
      draft: { status: 'COMMITTED' },
      placement: { pending: null, committedConflict: true, receipt: null },
    });
    await newPage.placement.status();
    expect(newPage.getSnapshot().placement.receipt).toEqual(f.live()!.receipt);
    expect(f.placementApi.place).toHaveBeenCalledTimes(1);
  });

  it('keeps an unresolved reloaded draft in recovery, with no reconstructed private intent', async () => {
    const f = await fixture();
    f.placementApi.place.mockRejectedValueOnce(new TypeError('unknown'));
    await f.check();
    await f.submit();
    const newPage = f.open();
    await newPage.refresh();
    await newPage.placement.status();
    await newPage.placement.retry();
    expect(newPage.getSnapshot().placement).toMatchObject({
      committedConflict: true,
      pending: null,
      receipt: null,
    });
    expect(f.placementApi.place).toHaveBeenCalledTimes(1);
    expect([...f.map.values()].join()).not.toContain('y'.repeat(43));
  });

  it('clears private state and discards a late committed response after an A/B transition', async () => {
    const f = await fixture(true);
    let respond!: (value: CheckoutPlacementResultDto) => void;
    f.placementApi.place.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
    await f.check();
    const first = f.submit();
    await vi.waitFor(() => expect(f.placementApi.place).toHaveBeenCalledTimes(1));
    const realPlace = f.placementApi.place.getMockImplementation()!;
    f.c.invalidate(true);
    f.switchOwner();
    f.c.invalidate();
    await f.c.refresh();
    respond(await realPlace(f.placementApi.place.mock.calls[0]![0]));
    await first;
    expect(f.c.getSnapshot()).toMatchObject({
      partition: 'b'.repeat(43),
      draft: null,
      placement: { receipt: null, terms: null, pending: null, status: null },
    });
    expect(f.placementApi.status).not.toHaveBeenCalled();
  });

  it('clears order details after a revoked session and does not poll', async () => {
    const f = await fixture();
    await f.check();
    await f.submit();
    expect(f.placementApi.status).toHaveBeenCalledTimes(1);
    f.placementApi.status.mockRejectedValueOnce(code(401, 'SESSION_EXPIRED'));
    await f.c.placement.status();
    expect(f.c.getSnapshot()).toMatchObject({
      draft: null,
      issue: { code: 'SESSION_EXPIRED' },
      placement: { receipt: null, status: null },
    });
  });

  it('treats an owner verification failure after a commit response as uncertain', async () => {
    const f = await fixture(true);
    const realPlace = f.placementApi.place.getMockImplementation()!;
    f.placementApi.place.mockImplementationOnce(async (intent) => {
      const result = await realPlace(intent);
      f.failOwnerCheck(code(404, 'UNAVAILABLE'));
      return result;
    });
    await f.check();
    await f.submit();
    expect(f.c.getSnapshot().placement).toMatchObject({
      phase: 'unknown',
      receipt: null,
      pending: f.placementApi.place.mock.calls[0]![0],
    });
    expect([...f.map.values()].join()).toContain('placementAttempted');
  });

  it('hides a cached receipt when a fresh owner check fails before the status read', async () => {
    const f = await fixture(true);
    await f.check();
    await f.submit();
    f.failOwnerCheck(new TypeError('offline'));
    await expect(f.c.placement.status()).rejects.toThrow();
    expect(f.c.getSnapshot().placement).toMatchObject({
      receipt: null,
      status: null,
      committedConflict: true,
      issue: { code: 'UNAVAILABLE' },
    });
    expect(f.placementApi.status).toHaveBeenCalledTimes(1);
  });
});
