import type { CheckoutPlacementMethod } from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { placementApi, sameTerms, type PlacementIntent } from './placement-api';
import { reviewedTermsInput, usableTerms } from './placement-eligibility';
import type { PlacementProjection } from './placement-types';
import type { QuoteScope } from './quote-types';
import { quoteIssueMessages } from './quote-workflow';
import type { ReviewSnapshot } from './foundation-types';
import { ownerPartition } from './foundation-journal';

interface Dependencies {
  api?: typeof placementApi;
  get(): ReviewSnapshot;
  publish(patch: Partial<PlacementProjection>): void;
  run<T>(action: (scope: QuoteScope) => Promise<T>): Promise<T>;
  now(): number;
  uuid(): string;
}

const messages: Record<string, string> = {
  ...quoteIssueMessages,
  POLICY_BLOCKED: 'Ordering is unavailable. You can still review your bag and delivery details.',
  CHECKOUT_DISABLED: 'Ordering is currently unavailable.',
  FINAL_TERMS_CHANGED:
    'The final amount or payment conditions changed. Request a new evaluation and review the updated terms.',
  QUOTE_REVIEW_REQUIRED: 'Review a new evaluation before checking final terms.',
  PAYMENT_METHOD_UNAVAILABLE:
    'This payment method is unavailable. Check the current review before choosing a method again.',
  PROMOTION_UNAVAILABLE: 'An offer is no longer available. Request and review a fresh evaluation.',
  CUSTOMER_RESTRICTED: 'This checkout cannot use the selected payment method.',
  IDEMPOTENCY_CONFLICT:
    'This request conflicts with an earlier attempt. Check order status before doing anything else.',
};
const code = (error: unknown) =>
  error instanceof StorefrontClientApiError ? error.code : 'UNKNOWN_OUTCOME';
const blocked = (error: unknown) => ['POLICY_BLOCKED', 'CHECKOUT_DISABLED'].includes(code(error));
const unauthorized = (error: unknown) =>
  error instanceof StorefrontClientApiError && [401, 403].includes(error.status);
function retryAt(error: unknown, now: number) {
  const delay = error instanceof StorefrontClientApiError ? (error.retryAfterSeconds ?? 0) : 0;
  return now + Math.max(0, Math.min(3600, delay)) * 1000;
}
const reviewCodes = new Set([
  'STALE_REVISION',
  'DRAFT_EXPIRED',
  'QUOTE_EXPIRED',
  'QUOTE_REVIEW_REQUIRED',
  'FINAL_TERMS_CHANGED',
  'SOURCE_CHANGED',
  'SOURCE_INELIGIBLE',
  'CONFIGURATION_CHANGED',
  'VARIANT_UNAVAILABLE',
  'ADDRESS_CHANGED',
  'DELIVERY_CHANGED',
  'DELIVERY_UNAVAILABLE',
  'UNSUPPORTED_AREA',
  'INSUFFICIENT_STOCK',
  'PROMOTION_UNAVAILABLE',
  'SUPERSEDED',
]);

export function createPlacementWorkflow(d: Dependencies) {
  const api = d.api ?? placementApi;
  const projection = () => d.get().placement;
  function issue(error: unknown, message: string, retryable: boolean) {
    return { code: code(error), message, retryable, retryAt: retryAt(error, d.now()) };
  }
  async function needsReview(scope: QuoteScope, reason: string, quoteId: string) {
    d.publish({
      phase: 'review',
      pending: null,
      terms: null,
      rejectedQuoteId: quoteId,
      issue: {
        code: reason,
        message: messages[reason] ?? 'Review your current checkout and request a fresh evaluation.',
        retryable: false,
        retryAt: d.now(),
      },
    });
    // Restore server revision only. The shopper must explicitly recheck delivery and evaluate/acknowledge again.
    try {
      await scope.restoreDraft();
    } catch (error) {
      if (scope.current() && unauthorized(error)) scope.revokeView();
    }
  }
  async function readStatus(scope: QuoteScope, conflict = false) {
    const previous = projection();
    if (d.now() < (previous.issue?.retryAt ?? 0)) return;
    d.publish({
      phase: 'status',
      status: null,
      issue: null,
      committedConflict: conflict || previous.committedConflict,
    });
    try {
      const value = await api.status(scope.draft.id, scope.owner, scope.signal);
      await scope.verify();
      if (previous.receipt && value.receipt.orderId !== previous.receipt.orderId)
        throw new StorefrontClientApiError(
          502,
          'INVALID_RESPONSE',
          'Order status did not match its receipt.',
        );
      d.publish({
        phase: 'committed',
        receipt: value.receipt,
        status: value,
        pending: null,
        terms: null,
        issue: null,
        committedConflict: false,
      });
    } catch (error) {
      if (!scope.current()) return;
      if (unauthorized(error)) {
        scope.revokeView();
        return;
      }
      const missing = error instanceof StorefrontClientApiError && error.status === 404;
      d.publish({
        phase: previous.pending
          ? 'unknown'
          : previous.receipt && !missing
            ? 'committed'
            : 'rejected',
        ...(missing
          ? {
              receipt: null,
              committedConflict: conflict || previous.committedConflict || !!previous.receipt,
            }
          : {}),
        issue: issue(
          error,
          missing
            ? previous.pending
              ? 'Order status could not be confirmed. Retry the original request in this tab.'
              : 'Order status is unavailable to this session. If you previously placed an order, it may still exist.'
            : 'Order status could not be checked. Try checking again.',
          true,
        ),
      });
    }
  }
  async function execute(scope: QuoteScope, intent: PlacementIntent, replay: boolean) {
    d.publish({ phase: 'placing', pending: intent, issue: null });
    let responseReceived = false;
    try {
      const result = await api.place(intent, scope.signal);
      responseReceived = true;
      await scope.verify();
      if (result.kind === 'REVIEW_REQUIRED') {
        await needsReview(scope, result.reason, intent.accepted.quoteId);
        return;
      }
      d.publish({
        phase: 'committed',
        receipt: result.receipt,
        status: null,
        pending: null,
        terms: null,
        issue: null,
      });
      await readStatus(scope);
    } catch (error) {
      if (!scope.current()) return;
      if (unauthorized(error)) {
        scope.revokeView();
        return;
      }
      if (!responseReceived && code(error) === 'CHECKOUT_COMMITTED') {
        d.publish({ pending: null, terms: null, committedConflict: true });
        await readStatus(scope, true);
      } else if (!responseReceived && code(error) === 'IDEMPOTENCY_CONFLICT') {
        d.publish({
          phase: 'rejected',
          pending: null,
          terms: null,
          committedConflict: true,
          issue: issue(error, messages.IDEMPOTENCY_CONFLICT!, false),
        });
      } else if (!responseReceived && !replay && blocked(error)) {
        d.publish({
          phase: 'blocked',
          pending: null,
          terms: null,
          issue: issue(error, messages[code(error)]!, false),
        });
      } else if (
        !responseReceived &&
        !replay &&
        error instanceof StorefrontClientApiError &&
        error.status < 500 &&
        error.status !== 429
      ) {
        await needsReview(scope, code(error), intent.accepted.quoteId);
      } else {
        d.publish({
          phase: 'unknown',
          terms: null,
          pending: intent,
          issue: issue(
            error,
            code(error) === 'RATE_LIMITED'
              ? 'Please wait, then retry the same order request.'
              : 'We could not confirm whether your order was placed. Keep this tab open and retry the same request.',
            true,
          ),
        });
      }
    }
  }
  return {
    check: (method: CheckoutPlacementMethod) =>
      d.run(async (scope) => {
        const p = projection();
        if (p.pending || p.receipt || p.committedConflict || d.now() < (p.issue?.retryAt ?? 0))
          return;
        const input = reviewedTermsInput(d.get(), method, d.now());
        if (!input) return;
        d.publish({ phase: 'checking', terms: null, issue: null });
        try {
          const value = await api.finalTerms(scope.draft.id, scope.owner, input, scope.signal);
          await scope.verify();
          if (!sameTerms(value, input) || !usableTerms(d.get(), value, d.now())) {
            await needsReview(scope, 'FINAL_TERMS_CHANGED', input.quoteId);
            return;
          }
          d.publish({ phase: 'ready', terms: value, issue: null });
        } catch (error) {
          if (!scope.current()) return;
          if (unauthorized(error)) {
            scope.revokeView();
            return;
          }
          if (reviewCodes.has(code(error))) await needsReview(scope, code(error), input.quoteId);
          else
            d.publish({
              phase: blocked(error) ? 'blocked' : 'rejected',
              terms: null,
              issue: issue(
                error,
                messages[code(error)] ??
                  'Final terms could not be checked. No order was submitted.',
                !blocked(error),
              ),
            });
        }
      }),
    submit: (fingerprint: string) =>
      d.run(async (scope) => {
        const p = projection(),
          final = p.terms;
        if (
          p.pending ||
          p.receipt ||
          p.committedConflict ||
          !final ||
          final.fingerprint !== fingerprint ||
          !usableTerms(d.get(), final, d.now())
        )
          return;
        const accepted = Object.freeze({
          revision: final.revision,
          quoteId: final.quoteId,
          quoteFingerprint: final.quoteFingerprint,
          method: final.method,
          finalTermsFingerprint: final.fingerprint,
        });
        await execute(
          scope,
          Object.freeze({
            draftId: scope.draft.id,
            owner: Object.freeze({ ...scope.owner }),
            key: d.uuid(),
            body: JSON.stringify(accepted),
            accepted,
          }),
          false,
        );
      }),
    retry: () =>
      d.run(async (scope) => {
        const p = projection(),
          intent = p.pending;
        if (
          !intent ||
          d.now() < (p.issue?.retryAt ?? 0) ||
          intent.draftId !== scope.draft.id ||
          ownerPartition(intent.owner) !== ownerPartition(scope.owner) ||
          (intent.owner.kind === 'GUEST' &&
            (scope.owner.kind !== 'GUEST' || intent.owner.context !== scope.owner.context))
        )
          return;
        await execute(scope, intent, true);
      }),
    status: () => d.run((scope) => readStatus(scope)),
  };
}
