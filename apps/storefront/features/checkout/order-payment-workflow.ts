import type { SubmitCheckoutPaymentClaimDto } from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { orderPaymentApi } from './order-payment-api';
import type { ClaimSubmissionIntent, OrderPaymentProjection } from './order-payment-types';
import type { QuoteScope } from './quote-types';
import type { ReviewSnapshot } from './foundation-types';
import { ownerPartition } from './foundation-journal';

interface Dependencies {
  api?: typeof orderPaymentApi;
  get(): ReviewSnapshot;
  publish(patch: Partial<OrderPaymentProjection>): void;
  run<T>(action: (scope: QuoteScope) => Promise<T>): Promise<T>;
  now(): number;
  uuid(): string;
}

const errorMessages: Record<string, string> = {
  POLICY_BLOCKED: 'Wallet payment collection is currently unavailable.',
  PAYMENT_METHOD_UNAVAILABLE: 'This payment method is currently unavailable.',
  DESTINATION_UNAVAILABLE: 'The payment receiving destination is temporarily unavailable.',
  PAYMENT_WINDOW_EXPIRED: 'The payment submission window for this order has expired.',
  ORDER_CANCELLED: 'This order has been cancelled. Payment cannot be submitted.',
  PAYMENT_ALREADY_SETTLED: 'This order is already fully paid.',
  PAYMENT_SUPPORT_REQUIRED: 'Payment support is required for this order.',
  CLAIM_ALREADY_SUBMITTED: 'This transaction reference has already been submitted.',
  CLAIM_LIMIT_REACHED:
    'Maximum unresolved payment claims (5) reached for this order. Please wait for management review.',
  IDEMPOTENCY_CONFLICT:
    'This submission conflicts with an existing attempt. Review your order status.',
  ORDER_GRANT_EXPIRED:
    'Guest order access has expired (1-hour limit). Contact support with your order reference.',
  NOT_FOUND: 'Payment information is unavailable for this session.',
  RATE_LIMITED: 'Too many requests. Please wait a moment before trying again.',
  UNKNOWN_OUTCOME:
    'We could not confirm your submission. Keep this tab open and retry the same claim.',
};

const code = (error: unknown): string =>
  error instanceof StorefrontClientApiError ? error.code : 'UNKNOWN_OUTCOME';

const unauthorized = (error: unknown): boolean =>
  error instanceof StorefrontClientApiError && [401, 403].includes(error.status);

function retryAt(error: unknown, now: number): number {
  const delay = error instanceof StorefrontClientApiError ? (error.retryAfterSeconds ?? 0) : 0;
  return now + Math.max(0, Math.min(3600, delay)) * 1000;
}

export function createOrderPaymentWorkflow(d: Dependencies) {
  const api = d.api ?? orderPaymentApi;
  const projection = () => d.get().orderPayment;

  function issue(error: unknown, fallback: string, retryable: boolean) {
    const errCode = code(error);
    return {
      code: errCode,
      message: errorMessages[errCode] ?? fallback,
      retryable,
      retryAt: retryAt(error, d.now()),
    };
  }

  async function readInternal(scope: QuoteScope, preserveIssue = false) {
    const value = await api.getPayment(scope.draft.id, scope.owner, scope.signal);
    await scope.verify();
    d.publish({
      phase: 'ready',
      data: value,
      ...(preserveIssue ? {} : { issue: null }),
      lastCheckedAt: d.now(),
    });
    return value;
  }

  async function executeClaim(scope: QuoteScope, intent: ClaimSubmissionIntent, replay: boolean) {
    d.publish({ phase: 'submitting', pendingClaim: intent, issue: null });
    let responseReceived = false;
    try {
      const result = await api.submitClaim(
        intent.draftId,
        intent.owner,
        intent.body,
        intent.key,
        scope.signal,
      );
      responseReceived = true;
      await scope.verify();
      d.publish({
        phase: 'ready',
        pendingClaim: null,
        submittedClaim: result,
        issue: null,
      });
      await readInternal(scope).catch(() => undefined);
    } catch (error) {
      if (!scope.current()) return;
      if (unauthorized(error)) {
        scope.revokeView();
        return;
      }

      const errCode = code(error);

      if (!responseReceived && errCode === 'CLAIM_ALREADY_SUBMITTED') {
        d.publish({
          phase: 'ready',
          pendingClaim: null,
          issue: issue(error, errorMessages.CLAIM_ALREADY_SUBMITTED!, false),
        });
        await readInternal(scope, true).catch(() => undefined);
      } else if (!responseReceived && errCode === 'IDEMPOTENCY_CONFLICT') {
        d.publish({
          phase: 'ready',
          pendingClaim: null,
          issue: issue(error, errorMessages.IDEMPOTENCY_CONFLICT!, false),
        });
        await readInternal(scope, true).catch(() => undefined);
      } else if (!responseReceived && errCode === 'CLAIM_LIMIT_REACHED') {
        d.publish({
          phase: 'ready',
          pendingClaim: null,
          issue: issue(error, errorMessages.CLAIM_LIMIT_REACHED!, false),
        });
        await readInternal(scope, true).catch(() => undefined);
      } else if (!responseReceived && errCode === 'RATE_LIMITED') {
        d.publish({
          phase: 'error',
          pendingClaim: intent,
          issue: issue(error, errorMessages.RATE_LIMITED!, true),
        });
      } else if (
        !responseReceived &&
        !replay &&
        error instanceof StorefrontClientApiError &&
        error.status < 500 &&
        error.status !== 429
      ) {
        d.publish({
          phase: 'error',
          pendingClaim: null,
          issue: issue(error, 'Payment claim could not be submitted.', false),
        });
        await readInternal(scope).catch(() => undefined);
      } else {
        d.publish({
          phase: 'error',
          pendingClaim: intent,
          issue: issue(
            error,
            'We could not confirm your submission. Keep this tab open and click Retry to resubmit.',
            true,
          ),
        });
      }
    }
  }

  return {
    read: () =>
      d.run(async (scope) => {
        const p = projection();
        if (d.now() < (p.issue?.retryAt ?? 0)) return;
        d.publish({ phase: 'loading', issue: null });
        try {
          await readInternal(scope);
        } catch (error) {
          if (!scope.current()) return;
          if (unauthorized(error)) {
            scope.revokeView();
            return;
          }
          const errCode = code(error);
          const isGrantExpired = errCode === 'ORDER_GRANT_EXPIRED';
          d.publish({
            phase: 'error',
            issue: issue(
              error,
              isGrantExpired
                ? errorMessages.ORDER_GRANT_EXPIRED!
                : 'Payment information could not be retrieved.',
              !isGrantExpired && errCode !== 'NOT_FOUND',
            ),
          });
        }
      }),

    submit: (input: SubmitCheckoutPaymentClaimDto) =>
      d.run(async (scope) => {
        const p = projection();
        if (p.phase === 'submitting' || d.now() < (p.issue?.retryAt ?? 0)) return;

        const trimmedTrx = input.transactionId.trim();
        if (!/^[A-Za-z0-9-]{4,128}$/.test(trimmedTrx)) {
          d.publish({
            issue: {
              code: 'INVALID_REQUEST',
              message: 'Enter a valid Transaction ID (4–128 letters, numbers, or hyphens).',
              retryable: false,
              retryAt: d.now(),
            },
          });
          return;
        }

        if (input.sendingMobile !== undefined && !/^01[3-9][0-9]{8}$/.test(input.sendingMobile)) {
          d.publish({
            issue: {
              code: 'INVALID_REQUEST',
              message: 'Enter a valid 11-digit Bangladesh mobile number (e.g. 01712345678).',
              retryable: false,
              retryAt: d.now(),
            },
          });
          return;
        }

        const intent: ClaimSubmissionIntent = Object.freeze({
          draftId: scope.draft.id,
          owner: Object.freeze({ ...scope.owner }),
          key: d.uuid(),
          body: Object.freeze({
            transactionId: trimmedTrx,
            ...(input.sendingMobile ? { sendingMobile: input.sendingMobile } : {}),
          }),
          createdAt: d.now(),
        });

        await executeClaim(scope, intent, false);
      }),

    retry: () =>
      d.run(async (scope) => {
        const p = projection();
        const intent = p.pendingClaim;
        if (
          !intent ||
          d.now() < (p.issue?.retryAt ?? 0) ||
          intent.draftId !== scope.draft.id ||
          ownerPartition(intent.owner) !== ownerPartition(scope.owner) ||
          (intent.owner.kind === 'GUEST' &&
            (scope.owner.kind !== 'GUEST' || intent.owner.context !== scope.owner.context))
        ) {
          return;
        }
        await executeClaim(scope, intent, true);
      }),

    recover: (key: string) =>
      d.run(async (scope) => {
        const p = projection();
        if (d.now() < (p.issue?.retryAt ?? 0)) return;
        d.publish({ phase: 'recovering', activeRecoveryKey: key, issue: null });
        try {
          const claim = await api.recoverClaim(scope.draft.id, scope.owner, key, scope.signal);
          await scope.verify();
          d.publish({
            phase: 'ready',
            activeRecoveryKey: null,
            submittedClaim: claim,
            pendingClaim: null,
            issue: null,
          });
          await readInternal(scope).catch(() => undefined);
        } catch (error) {
          if (!scope.current()) return;
          if (unauthorized(error)) {
            scope.revokeView();
            return;
          }
          if (error instanceof StorefrontClientApiError && error.status === 404) {
            // Claim not committed yet or key not found; read base view
            d.publish({ phase: 'ready', activeRecoveryKey: null });
            await readInternal(scope).catch(() => undefined);
            return;
          }
          d.publish({
            phase: 'error',
            activeRecoveryKey: null,
            issue: issue(error, 'Claim recovery could not be completed.', true),
          });
        }
      }),

    clearIssue: () => {
      d.publish({ issue: null });
    },
  };
}
