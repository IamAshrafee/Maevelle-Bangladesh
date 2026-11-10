import type {
  CheckoutOrderPaymentDto,
  CheckoutPaymentClaimDto,
  SubmitCheckoutPaymentClaimDto,
} from '@maevelle/contracts';
import type { ReviewIssue, ReviewOwner } from './foundation-types';

export interface ClaimSubmissionIntent {
  readonly draftId: string;
  readonly owner: ReviewOwner;
  readonly key: string;
  readonly body: SubmitCheckoutPaymentClaimDto;
  readonly createdAt: number;
}

export interface OrderPaymentProjection {
  readonly phase: 'idle' | 'loading' | 'ready' | 'submitting' | 'recovering' | 'error';
  readonly data: CheckoutOrderPaymentDto | null;
  readonly pendingClaim: ClaimSubmissionIntent | null;
  readonly submittedClaim: CheckoutPaymentClaimDto | null;
  readonly issue: ReviewIssue | null;
  readonly activeRecoveryKey: string | null;
  readonly lastCheckedAt: number | null;
}

export const EMPTY_ORDER_PAYMENT: OrderPaymentProjection = Object.freeze({
  phase: 'idle',
  data: null,
  pendingClaim: null,
  submittedClaim: null,
  issue: null,
  activeRecoveryKey: null,
  lastCheckedAt: null,
});

export const orderPaymentBusy = (state: OrderPaymentProjection): boolean =>
  ['loading', 'submitting', 'recovering'].includes(state.phase);

export const canSubmitClaim = (state: OrderPaymentProjection): boolean =>
  !orderPaymentBusy(state) && state.data !== null && state.data.claimAvailability === 'AVAILABLE';
