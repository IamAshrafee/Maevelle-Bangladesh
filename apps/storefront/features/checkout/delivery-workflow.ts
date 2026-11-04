import type {
  CheckoutDeliveryInput,
  CheckoutDeliveryStateDto,
  CheckoutDraftDto,
  ShopperAddressInput,
  UpdateCheckoutDeliveryDto,
} from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import type { ReviewIssue, ReviewOwner } from './foundation-types';
import { addressInput, deliveryInput, deliveryApi } from './delivery-api';
import type { DeliveryProjection, PrivateDeliveryIntent } from './delivery-types';

export interface DeliveryScope {
  readonly owner: ReviewOwner;
  readonly draft: CheckoutDraftDto;
  readonly signal: AbortSignal;
  current(): boolean;
  verify(): Promise<void>;
  revokeView(): void;
  accept(value: CheckoutDeliveryStateDto): void;
}
interface Dependencies {
  api?: typeof deliveryApi;
  get(): DeliveryProjection;
  publish(patch: Partial<DeliveryProjection>): void;
  run<T>(action: (scope: DeliveryScope) => Promise<T>, wait?: boolean): Promise<T>;
  uuid(): string;
  now(): number;
}
export function deliveryIssue(error: unknown, now = Date.now()): ReviewIssue {
  const e = error instanceof StorefrontClientApiError ? error : null;
  const code = e?.code ?? 'UNKNOWN_OUTCOME';
  const message =
    e?.status === 401
      ? 'Your session has ended. Sign in again before accessing delivery details.'
      : e?.status === 409
        ? 'Delivery or a saved address changed. Review the latest information before saving again.'
        : e?.status === 410
          ? 'This checkout has expired. Start again from your product or bag.'
          : e?.status === 422
            ? code === 'INVALID_CONTACT'
              ? 'Check the name, Bangladesh mobile number and address. Your other entries are still here.'
              : 'Delivery is unavailable for this area. Choose another area or contact us.'
            : e?.status === 429
              ? 'Too many requests. Wait before retrying the same request.'
              : e?.status === 404
                ? 'These details are unavailable to the current shopper. Restore your checkout.'
                : e?.status === 413
                  ? 'The details are too long. Shorten the address or instructions.'
                  : 'We could not confirm the result. Keep this checkout page open and retry the same request.';
  return {
    code,
    message,
    retryable: !e || e.status >= 500 || e.status === 429,
    retryAt: now + Math.min(3600, Math.max(0, e?.retryAfterSeconds ?? 0)) * 1000,
  };
}
/** Composes into the foundation projection, task queue and generation fence; no second store. */
export function createDeliveryWorkflow(d: Dependencies) {
  const api = d.api ?? deliveryApi;
  async function load(scope: DeliveryScope, preservePending = false) {
    const [confirmed, addresses] = await Promise.all([
      api.read(scope.draft.id, scope.owner, scope.signal),
      scope.owner.kind === 'ACCOUNT'
        ? api.addresses(scope.owner, 0, scope.signal)
        : Promise.resolve(null),
    ]);
    await scope.verify();
    scope.accept(confirmed);
    d.publish({
      confirmed,
      addresses: addresses?.items ?? [],
      nextOffset: addresses?.nextOffset ?? null,
      addressesLoaded: true,
      ...(!preservePending
        ? {
            phase: 'ready' as const,
            issue: null,
            notice: 'Review the delivery details saved on this checkout.',
          }
        : {}),
    });
    return confirmed;
  }
  async function failure(scope: DeliveryScope, error: unknown, writing: boolean) {
    if (!scope.current()) throw error;
    const issue = deliveryIssue(error, d.now());
    if (error instanceof StorefrontClientApiError && [401, 403].includes(error.status)) {
      scope.revokeView();
      throw error;
    }
    if (error instanceof StorefrontClientApiError && error.status === 409) {
      let conflictReady = false;
      try {
        await load(scope, true);
        conflictReady = true;
      } catch (readError) {
        if (readError instanceof StorefrontClientApiError && [401, 403].includes(readError.status))
          scope.revokeView();
        if (!scope.current()) throw error;
      }
      if (scope.current())
        d.publish({ phase: 'conflict', pending: null, conflictReady, issue, notice: '' });
    } else
      d.publish({
        phase: writing && issue.retryable ? 'unknown' : 'error',
        ...(!writing || !issue.retryable ? { pending: null } : {}),
        issue,
        notice: '',
      });
    throw error;
  }
  async function execute(scope: DeliveryScope, intent: PrivateDeliveryIntent) {
    d.publish({ phase: 'saving', pending: intent, issue: null, notice: '' });
    try {
      const value = await api.mutate(intent, scope.signal);
      await scope.verify();
      if (intent.kind === 'delivery') {
        const confirmed = value as CheckoutDeliveryStateDto;
        scope.accept(confirmed);
        d.publish({ confirmed });
      } else await load(scope, true);
      d.publish({
        phase: 'ready',
        pending: null,
        issue: null,
        ...(intent.kind === 'address' ? { addressOutcomeKey: intent.key } : {}),
        notice:
          intent.kind === 'delivery'
            ? 'Delivery details saved.'
            : 'Your address book was updated. Review any selected address before continuing.',
      });
    } catch (error) {
      await failure(scope, error, true);
    }
  }
  function mutate(
    kind: PrivateDeliveryIntent['kind'],
    method: PrivateDeliveryIntent['method'],
    suffix: string,
    body: (scope: DeliveryScope) => unknown,
  ) {
    return d.run(async (scope) => {
      if (d.get().pending) throw new Error('Recover the pending private request first.');
      if (d.get().phase === 'conflict') throw new Error('Review the conflict first.');
      if (scope.draft.status !== 'ACTIVE' || Date.parse(scope.draft.expiresAt) <= d.now())
        throw new Error('Checkout is no longer active.');
      const intent: PrivateDeliveryIntent = Object.freeze({
        key: d.uuid(),
        owner: scope.owner,
        draftId: scope.draft.id,
        kind,
        method,
        path: `/api/storefront/v1/${kind === 'delivery' ? `checkouts/${scope.draft.id}/delivery` : `checkout/addresses${suffix}`}`,
        body: JSON.stringify(body(scope)),
      });
      await execute(scope, intent);
    });
  }
  return {
    refresh: () =>
      d.run(async (scope) => {
        if (d.get().pending) throw new Error('Retry the same pending request first.');
        const conflict = d.get().phase === 'conflict';
        d.publish({ phase: 'loading', issue: null, notice: '' });
        try {
          const confirmed = await load(scope, conflict);
          if (conflict) d.publish({ phase: 'conflict', conflictReady: true });
          return confirmed;
        } catch (error) {
          if (conflict && scope.current()) {
            if (error instanceof StorefrontClientApiError && [401, 403].includes(error.status))
              scope.revokeView();
            else
              d.publish({
                phase: 'conflict',
                conflictReady: false,
                issue: deliveryIssue(error, d.now()),
              });
            throw error;
          }
          return failure(scope, error, false);
        }
      }, true),
    save: (delivery: CheckoutDeliveryInput) =>
      mutate('delivery', 'PUT', '', (s) => ({
        revision: s.draft.revision,
        delivery: deliveryInput(delivery),
      })),
    select: (id: string, revision: string) =>
      mutate(
        'delivery',
        'PUT',
        '',
        (s) =>
          ({
            revision: s.draft.revision,
            savedAddressId: id,
            savedAddressRevision: revision,
          }) satisfies UpdateCheckoutDeliveryDto,
      ),
    revalidate: () => {
      const saved = d.get().confirmed?.savedAddress;
      if (saved && saved.status !== 'CURRENT')
        return Promise.reject(new Error('Explicitly review the changed saved address.'));
      return mutate(
        'delivery',
        'PUT',
        '',
        (s) =>
          ({
            revision: s.draft.revision,
            action: 'REVALIDATE',
          }) satisfies UpdateCheckoutDeliveryDto,
      );
    },
    address: (address: ShopperAddressInput, id?: string, revision?: string) =>
      mutate('address', id ? 'PUT' : 'POST', id ? `/${encodeURIComponent(id)}` : '', () => ({
        ...(id ? { revision } : {}),
        address: addressInput(address),
      })),
    remove: (id: string, revision: string) =>
      mutate('address', 'DELETE', `/${encodeURIComponent(id)}`, () => ({ revision })),
    retry: () =>
      d.run(async (scope) => {
        const state = d.get(),
          intent = state.pending;
        if (!intent || d.now() < (state.issue?.retryAt ?? 0))
          throw new Error('Wait before retrying.');
        if (
          intent.draftId !== scope.draft.id ||
          JSON.stringify(intent.owner) !== JSON.stringify(scope.owner)
        )
          throw new Error('Shopper changed.');
        await execute(scope, intent);
      }),
    acknowledge: () => {
      if (d.get().phase === 'conflict' && d.get().conflictReady)
        d.publish({
          phase: 'ready',
          issue: null,
          notice: 'Latest saved details reviewed. Your unsaved edits have not been applied.',
        });
    },
    more: () =>
      d.run(async (scope) => {
        const before = d.get();
        if (before.nextOffset === null || before.pending || before.phase === 'conflict') return;
        d.publish({ phase: 'loading', issue: null });
        try {
          const page = await api.addresses(scope.owner, before.nextOffset, scope.signal);
          await scope.verify();
          d.publish({
            phase: 'ready',
            addresses: [
              ...before.addresses,
              ...page.items.filter((a) => !before.addresses.some((old) => old.id === a.id)),
            ].slice(0, 50),
            nextOffset: page.nextOffset,
          });
        } catch (error) {
          await failure(scope, error, false);
        }
      }),
  };
}
