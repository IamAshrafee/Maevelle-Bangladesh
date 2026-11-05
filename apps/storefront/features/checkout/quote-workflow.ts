import { StorefrontClientApiError } from '@/lib/api/client/http';
import { quoteApi } from './quote-api';
import type { QuoteProjection, PrivateQuoteIntent, QuoteScope } from './quote-types';
import type { ReviewIssue } from './foundation-types';

export const quoteIssueMessages: Readonly<Record<string, string>> = {
  SOURCE_CHANGED:
    'Your bag changed. Review the complete current bag before requesting another evaluation.',
  STALE_REVISION:
    'This checkout changed in another request. Check the latest details and review them before continuing.',
  ADDRESS_CHANGED: 'Your selected saved address changed. Review it in delivery details first.',
  DELIVERY_CHANGED: 'Review and save your delivery details before requesting a new evaluation.',
  CONFIGURATION_CHANGED:
    'Prices or delivery conditions changed. Check delivery availability, then request a fresh evaluation.',
  SUPERSEDED: 'A newer evaluation is available. Check the current evaluation before reviewing it.',
  QUOTE_LIMIT:
    'This checkout has reached its evaluation limit. Start a fresh review from your product or bag.',
  DRAFT_EXPIRED: 'This checkout expired. Return to the product or bag to start a fresh review.',
  QUOTE_EXPIRED:
    'This evaluation expired. Request a fresh evaluation before reviewing the amounts.',
  VARIANT_UNAVAILABLE:
    'An item is no longer available. Review your product selection or complete bag.',
  INSUFFICIENT_STOCK:
    'There is not enough current stock for this selection. Review the quantity in your product or bag.',
  UNSUPPORTED_AREA:
    'This delivery area is no longer supported. Choose another area in delivery details.',
  DELIVERY_UNAVAILABLE:
    'Delivery is currently unavailable. Check your destination before requesting another evaluation.',
  SOURCE_INELIGIBLE: 'Your selection needs attention. Review the product or complete bag.',
  IDEMPOTENCY_CONFLICT:
    'This request conflicts with an earlier intent. Check the latest evaluation and explicitly review it.',
};
export function quoteIssue(error: unknown, now: number): ReviewIssue {
  const e = error instanceof StorefrontClientApiError ? error : null;
  return {
    code: e?.code ?? 'UNKNOWN_OUTCOME',
    retryable: !e || e.status >= 500 || e.status === 429,
    retryAt: now + Math.min(3600, Math.max(0, e?.retryAfterSeconds ?? 0)) * 1000,
    message:
      quoteIssueMessages[e?.code ?? ''] ??
      (e?.status === 429
        ? 'Too many requests. Wait before retrying the same evaluation request.'
        : e?.status === 400
          ? 'Check the coupon codes and selection before trying again.'
          : 'The evaluation result could not be confirmed. Keep this page open and retry the same request.'),
  };
}
interface Dependencies {
  api?: typeof quoteApi;
  get(): QuoteProjection;
  publish(patch: Partial<QuoteProjection>): void;
  run<T>(action: (scope: QuoteScope) => Promise<T>, wait?: boolean): Promise<T>;
  canCreate(): boolean;
  now(): number;
  uuid(): string;
}
/** One projection within the Checkout controller. No journal, storage or automatic writes. */
export function createQuoteWorkflow(d: Dependencies) {
  const api = d.api ?? quoteApi;
  async function load(scope: QuoteScope, preserveConflict = false) {
    const draft = await scope.restoreDraft();
    const current = await api.current(draft.id, scope.owner, scope.signal);
    await scope.verify();
    d.publish({
      current,
      previous: null,
      observedRevision: draft.revision,
      ...(!preserveConflict ? { phase: 'ready' as const, issue: null, notice: '' } : {}),
    });
    return current;
  }
  async function failure(scope: QuoteScope, error: unknown, writing: boolean): Promise<never> {
    if (!scope.current()) throw error;
    if (error instanceof StorefrontClientApiError && [401, 403, 404].includes(error.status)) {
      scope.revokeView();
      throw error;
    }
    const issue = quoteIssue(error, d.now());
    if (error instanceof StorefrontClientApiError && error.status === 409) {
      let conflictReady = false;
      try {
        await load(scope, true);
        conflictReady = true;
      } catch (readError) {
        if (
          readError instanceof StorefrontClientApiError &&
          [401, 403, 404].includes(readError.status)
        )
          scope.revokeView();
        if (!scope.current()) throw error;
      }
      d.publish({ phase: 'conflict', pending: null, conflictReady, issue, notice: '' });
    } else
      d.publish({
        phase: writing && issue.retryable ? 'unknown' : 'error',
        ...(!writing || !issue.retryable ? { pending: null } : {}),
        observedRevision: null,
        issue,
        notice: '',
      });
    throw error;
  }
  async function execute(scope: QuoteScope, intent: PrivateQuoteIntent) {
    d.publish({
      phase: 'saving',
      pending: intent,
      issue: null,
      notice: '',
      observedRevision: null,
    });
    try {
      const current = await api.mutate(intent, scope.signal);
      await scope.verify();
      // A replay can return a historical quote. Only the current draft read sets root revision.
      const draft = await scope.restoreDraft();
      await scope.verify();
      const previous = d.get().current;
      d.publish({
        current,
        previous: previous?.id === current.previousQuoteId ? previous : null,
        observedRevision: draft.revision,
        phase: 'ready',
        pending: null,
        issue: null,
        conflictReady: false,
        notice:
          intent.kind === 'create'
            ? 'Evaluation ready. Review the amounts below.'
            : current.status === 'CURRENT' &&
                current.acknowledged &&
                current.draftRevision === draft.revision
              ? 'You reviewed these evaluated components. No order was placed and no payment is due.'
              : 'Your request was recovered. This evaluation needs a fresh review.',
      });
      return current;
    } catch (error) {
      return failure(scope, error, true);
    }
  }
  return {
    refresh: () =>
      d.run(async (scope) => {
        if (d.get().pending) throw new Error('Recover the pending evaluation request first.');
        if (d.now() < (d.get().issue?.retryAt ?? 0)) throw new Error('Wait before checking again.');
        const conflict = d.get().phase === 'conflict';
        d.publish({ phase: 'loading', issue: null, notice: '', observedRevision: null });
        try {
          const result = await load(scope, conflict);
          if (conflict) d.publish({ phase: 'conflict', conflictReady: true });
          return result;
        } catch (error) {
          return failure(scope, error, false);
        }
      }, true),
    create: (codes: readonly string[] = []) =>
      d.run(async (scope) => {
        if (
          d.get().pending ||
          d.get().phase === 'conflict' ||
          d.now() < (d.get().issue?.retryAt ?? 0) ||
          !d.canCreate()
        )
          throw new Error('Review the current source and saved delivery details first.');
        if (scope.draft.status !== 'ACTIVE' || Date.parse(scope.draft.expiresAt) <= d.now())
          throw new Error('Checkout expired.');
        if (
          !Array.isArray(codes) ||
          codes.length > 10 ||
          codes.some(
            (c) =>
              typeof c !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(c) || c.length > 64,
          )
        )
          throw new Error('Enter at most ten valid coupon codes.');
        if (scope.draft.source.kind === 'CART' && codes.length)
          throw new Error('Manage bag coupons in your bag.');
        const couponCodes = [...codes];
        return execute(
          scope,
          Object.freeze({
            key: d.uuid(),
            owner: scope.owner,
            draftId: scope.draft.id,
            path: `/api/storefront/v1/checkouts/${scope.draft.id}/quotes`,
            method: 'POST',
            kind: 'create',
            body: JSON.stringify({
              revision: scope.draft.revision,
              ...(scope.draft.source.kind === 'BUY_NOW' ? { couponCodes } : {}),
            }),
          }),
        );
      }),
    acknowledge: () =>
      d.run(async (scope) => {
        const s = d.get(),
          q = s.current;
        if (
          s.pending ||
          s.phase === 'conflict' ||
          d.now() < (s.issue?.retryAt ?? 0) ||
          s.observedRevision !== scope.draft.revision ||
          !d.canCreate() ||
          !q ||
          q.status !== 'CURRENT' ||
          q.draftRevision !== scope.draft.revision ||
          Date.parse(q.expiresAt) <= d.now()
        )
          throw new Error('Check and review the current evaluation first.');
        return execute(
          scope,
          Object.freeze({
            key: d.uuid(),
            owner: scope.owner,
            draftId: scope.draft.id,
            path: `/api/storefront/v1/checkouts/${scope.draft.id}/quotes/${q.id}/acknowledgements`,
            method: 'POST',
            kind: 'acknowledge',
            quoteId: q.id,
            body: JSON.stringify({ revision: scope.draft.revision, fingerprint: q.fingerprint }),
          }),
        );
      }),
    retry: () =>
      d.run(async (scope) => {
        const s = d.get(),
          intent = s.pending;
        if (!intent || d.now() < (s.issue?.retryAt ?? 0))
          throw new Error('Wait before retrying the same request.');
        if (
          intent.draftId !== scope.draft.id ||
          JSON.stringify(intent.owner) !== JSON.stringify(scope.owner)
        )
          throw new Error('Shopper changed.');
        return execute(scope, intent);
      }),
    reviewConflict: () => {
      if (d.get().phase === 'conflict' && d.get().conflictReady)
        d.publish({
          phase: 'ready',
          issue: null,
          notice:
            'Latest evaluation checked. Review any changes before creating or acknowledging an evaluation.',
        });
    },
    previous: () =>
      d.run(async (scope) => {
        const current = d.get().current;
        if (!current?.previousQuoteId || d.get().pending) return;
        d.publish({ phase: 'loading' });
        try {
          const previous = await api.detail(
            scope.draft.id,
            current.previousQuoteId,
            scope.owner,
            scope.signal,
          );
          await scope.verify();
          d.publish({ previous, phase: 'ready' });
          return previous;
        } catch (error) {
          return failure(scope, error, false);
        }
      }),
  };
}
