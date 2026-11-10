import { describe, it, expect, vi } from 'vitest';
import type { CheckoutDraftDto } from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { createReviewController } from './foundation-controller';
import { createReviewJournal } from './foundation-journal';
import type { ReviewIntent } from './foundation-types';
import { reviewIssue } from './foundation-errors';

const id = () => crypto.randomUUID();
const source = () => ({ kind: 'BUY_NOW' as const, variantId: id(), quantity: '1' });
function projection(intent: ReviewIntent): CheckoutDraftDto {
  return {
    id: intent.kind === 'create' ? id() : intent.id,
    implementationVersion: 2,
    revision: '1',
    ownerKind: intent.owner.kind,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    currency: 'BDT',
    source: { kind: 'BUY_NOW' },
    sourceReviewRequired: false,
    purchaseAvailable: false,
    lines: [{ id: id(), variantId: id(), quantity: '1', sourceCartLineId: null }],
  };
}
function fixture() {
  const map = new Map<string, string>(),
    storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
  let owner: string | null = null;
  const api = {
    establish: vi.fn(async () => ({
      id: id(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    })),
    read: vi.fn(async () => ({}) as CheckoutDraftDto),
    mutate: vi.fn(async (intent: ReviewIntent) => projection(intent)),
    revoke: vi.fn(async () => ({ revoked: true as const })),
  };
  const journal = createReviewJournal(storage),
    controller = createReviewController({ api, journal, resolveOwner: async () => owner });
  return {
    map,
    storage,
    api,
    journal,
    controller,
    setOwner: (next: string | null) => {
      owner = next;
    },
  };
}
describe('Checkout owner partition and exact-intent recovery', () => {
  it('does not establish a guest or draft during restore, and coalesces rapid initiation', async () => {
    const f = fixture();
    await f.controller.refresh();
    expect(f.api.establish).not.toHaveBeenCalled();
    expect(f.api.mutate).not.toHaveBeenCalled();
    const input = source();
    await Promise.all([f.controller.initiate(input), f.controller.initiate(input)]);
    expect(f.api.establish).toHaveBeenCalledTimes(1);
    expect(f.api.mutate).toHaveBeenCalledTimes(1);
    expect(f.controller.getSnapshot().draft?.purchaseAvailable).toBe(false);
  });
  it('preserves the exact key/body across timeout, reload and explicit retry', async () => {
    const f = fixture();
    const input = source();
    f.api.mutate.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(f.controller.initiate(input)).rejects.toThrow();
    const sent = structuredClone(f.api.mutate.mock.calls[0]![0]);
    const next = createReviewController({
      api: f.api,
      journal: createReviewJournal(f.storage),
      resolveOwner: async () => null,
    });
    await next.refresh();
    expect(f.api.mutate).toHaveBeenCalledTimes(1);
    expect(next.getSnapshot().pending?.key).toBe(sent.key);
    await next.retry();
    expect(f.api.mutate.mock.calls[1]![0]).toEqual(sent);
    expect(next.getSnapshot().draft).not.toBeNull();
  });
  it('never replaces an uncertain source with a new key when another product is clicked', async () => {
    const f = fixture();
    f.api.mutate.mockRejectedValueOnce(new Error('unknown'));
    await expect(f.controller.initiate(source())).rejects.toThrow();
    const pending = f.controller.getSnapshot().pending;
    await f.controller.initiate(source());
    expect(f.controller.getSnapshot().pending).toEqual(pending);
    expect(f.api.mutate).toHaveBeenCalledTimes(1);
  });
  it('discards delayed A data after an account transition, preserving A recovery privately', async () => {
    const f = fixture(),
      a = 'A'.repeat(43),
      b = 'B'.repeat(43);
    f.setOwner(a);
    let release!: (value: CheckoutDraftDto) => void;
    f.api.mutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = f.controller.initiate(source()).catch(() => undefined);
    await vi.waitFor(() => expect(f.api.mutate).toHaveBeenCalledTimes(1));
    const intent = f.api.mutate.mock.calls[0]![0];
    f.controller.invalidate(true);
    f.setOwner(b);
    f.controller.invalidate();
    await f.controller.refresh();
    release(projection(intent));
    await pending;
    expect(f.controller.getSnapshot().partition).toBe(b);
    expect(f.controller.getSnapshot().draft).toBeNull();
    expect(f.controller.getSnapshot().pending).toBeNull();
    expect(f.journal.pending(a)?.key).toBe(intent.key);
  });
  it('rechecks authority before publishing even if an identity hint is missed', async () => {
    const f = fixture();
    f.setOwner('A'.repeat(43));
    f.api.mutate.mockImplementationOnce(async (intent) => {
      f.setOwner('B'.repeat(43));
      return projection(intent);
    });
    await expect(f.controller.initiate(source())).rejects.toThrow('Shopper changed');
    expect(f.controller.getSnapshot().draft).toBeNull();
  });
  it('adopts explicitly with account plus guest context, with no implicit adoption on sign-in', async () => {
    const f = fixture();
    await f.controller.initiate(source());
    const guest = f.journal.reference('guest')!;
    f.setOwner('A'.repeat(43));
    f.controller.invalidate();
    await f.controller.refresh();
    expect(f.api.mutate).toHaveBeenCalledTimes(1);
    expect(f.controller.getSnapshot().guestCandidate?.id).toBe(guest.id);
    await f.controller.adopt();
    expect(f.api.mutate.mock.calls[1]![0]).toMatchObject({
      kind: 'adopt',
      id: guest.id,
      guestContext: guest.context,
      owner: { kind: 'ACCOUNT' },
    });
  });
  it('keeps string revisions and never optimistically marks an inactive draft editable', async () => {
    const f = fixture();
    await f.controller.initiate(source());
    const ref = f.journal.reference('guest')!;
    f.api.read.mockResolvedValueOnce({
      ...f.controller.getSnapshot().draft!,
      revision: '9007199254740993',
      status: 'EXPIRED',
    });
    f.controller.invalidate();
    await f.controller.refresh(ref.id);
    expect(f.controller.getSnapshot().draft).toMatchObject({
      revision: '9007199254740993',
      status: 'EXPIRED',
    });
  });
  it('keeps abandonment uncertain until the canonical response is confirmed', async () => {
    const f = fixture();
    await f.controller.initiate(source());
    const draft = f.controller.getSnapshot().draft!;
    f.api.mutate.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      f.controller.update({ revision: draft.revision, action: 'ABANDON' }),
    ).rejects.toThrow();
    expect(f.controller.getSnapshot().draft?.status).toBe('ACTIVE');
    const sent = structuredClone(f.api.mutate.mock.calls[1]![0]);
    f.api.mutate.mockImplementationOnce(async (intent) => ({
      ...projection(intent),
      status: 'ABANDONED',
    }));
    await f.controller.retry();
    expect(f.api.mutate.mock.calls[2]![0]).toEqual(sent);
    expect(f.controller.getSnapshot().draft?.status).toBe('ABANDONED');
  });
  it('preserves a rejected revision until explicit dismissal then restores canonical state', async () => {
    const f = fixture();
    await f.controller.initiate(source());
    const draft = f.controller.getSnapshot().draft!;
    f.api.mutate.mockRejectedValueOnce(
      new StorefrontClientApiError(409, 'REVISION_CONFLICT', 'internal'),
    );
    await expect(
      f.controller.update({ revision: draft.revision, action: 'ABANDON' }),
    ).rejects.toThrow();
    expect(f.controller.getSnapshot().issue?.retryable).toBe(false);
    f.controller.stopRecovering();
    f.api.read.mockResolvedValueOnce({ ...draft, revision: '2' });
    await f.controller.refresh();
    expect(f.controller.getSnapshot().draft?.revision).toBe('2');
    expect(f.api.mutate).toHaveBeenCalledTimes(2);
  });
  it('obeys a rate-limit deadline without replaying or replacing the command', async () => {
    const f = fixture();
    f.api.mutate.mockRejectedValueOnce(
      new StorefrontClientApiError(429, 'RATE_LIMITED', 'internal', 60),
    );
    await expect(f.controller.initiate(source())).rejects.toThrow();
    const pending = f.journal.pending('guest');
    await expect(f.controller.retry()).rejects.toThrow('Wait before retrying');
    expect(f.api.mutate).toHaveBeenCalledTimes(1);
    expect(f.journal.pending('guest')).toEqual(pending);
  });
  it('does not downgrade authority lookup failures into guest identity', async () => {
    const f = fixture(),
      controller = createReviewController({
        api: f.api,
        journal: f.journal,
        resolveOwner: async () => {
          throw new Error('unavailable');
        },
      });
    await expect(controller.initiate(source())).rejects.toThrow();
    expect(f.api.establish).not.toHaveBeenCalled();
    expect(f.api.mutate).not.toHaveBeenCalled();
    expect(controller.getSnapshot().partition).toBeNull();
  });
});
describe('Checkout journal and safe failure presentation', () => {
  it('stores only bounded nonsecret intent references and rejects injected financial/owner data', async () => {
    const f = fixture();
    await f.controller.initiate(source());
    const raw = [...f.map.values()][0]!;
    expect(raw).not.toMatch(/token|cookie|payment|phone|address|price|total/);
    const value = JSON.parse(raw);
    value.pending = [{ ...f.api.mutate.mock.calls[0]![0], price: '1', phone: 'private' }];
    const injected = createReviewJournal({
      getItem: () => JSON.stringify(value),
      setItem: () => undefined,
    });
    expect(injected.pending('guest')).toBeUndefined();
    const corrupt = createReviewJournal({ getItem: () => '{', setItem: () => undefined });
    expect(corrupt.reference('guest')).toBeUndefined();
    expect(corrupt.healthy()).toBe(false);
  });
  it('retains the in-memory key and reports blocked storage truthfully', async () => {
    const f = fixture();
    const journal = createReviewJournal({
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota');
      },
    });
    const controller = createReviewController({
      api: f.api,
      journal,
      resolveOwner: async () => null,
    });
    f.api.mutate.mockRejectedValueOnce(new Error('timeout'));
    await expect(controller.initiate(source())).rejects.toThrow();
    expect(controller.getSnapshot().persisted).toBe(false);
    const key = controller.getSnapshot().pending?.key;
    await controller.retry();
    expect(f.api.mutate.mock.calls[1]![0].key).toBe(key);
  });
  it.each([400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 503])(
    'maps %s without exposing raw backend text',
    (status) => {
      const issue = reviewIssue(
        new StorefrontClientApiError(status, 'SAFE', 'secret-stack-trace', 3),
        100,
      );
      expect(issue.message).not.toContain('secret-stack-trace');
      expect(issue.retryable).toBe(status === 429 || status >= 500);
      expect(issue.retryAt).toBe(3100);
    },
  );
  it('exposes orderPayment operations and clears orderPayment state on invalidate', () => {
    const f = fixture();
    expect(f.controller.orderPayment).toBeDefined();
    expect(typeof f.controller.orderPayment.read).toBe('function');
    expect(typeof f.controller.orderPayment.submit).toBe('function');
    expect(typeof f.controller.orderPayment.retry).toBe('function');
    expect(typeof f.controller.orderPayment.recover).toBe('function');
    expect(f.controller.getSnapshot().orderPayment).toEqual({
      phase: 'idle',
      data: null,
      pendingClaim: null,
      submittedClaim: null,
      issue: null,
      activeRecoveryKey: null,
      lastCheckedAt: null,
    });
    f.controller.invalidate();
    expect(f.controller.getSnapshot().orderPayment).toEqual({
      phase: 'idle',
      data: null,
      pendingClaim: null,
      submittedClaim: null,
      issue: null,
      activeRecoveryKey: null,
      lastCheckedAt: null,
    });
  });
});
