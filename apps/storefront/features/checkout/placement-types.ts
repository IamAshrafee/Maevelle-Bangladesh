import type {
  CheckoutCommittedOrderDto,
  CheckoutFinalTermsDto,
  CheckoutPlacementReceiptDto,
} from '@maevelle/contracts';
import type { ReviewIssue } from './foundation-types';
import type { PlacementIntent } from './placement-api';

export interface PlacementProjection {
  readonly phase:
    | 'idle'
    | 'checking'
    | 'ready'
    | 'placing'
    | 'unknown'
    | 'review'
    | 'blocked'
    | 'rejected'
    | 'committed'
    | 'status';
  readonly terms: CheckoutFinalTermsDto | null;
  readonly pending: PlacementIntent | null;
  readonly receipt: CheckoutPlacementReceiptDto | null;
  readonly status: CheckoutCommittedOrderDto | null;
  readonly issue: ReviewIssue | null;
  readonly rejectedQuoteId: string | null;
  readonly committedConflict: boolean;
}
export const EMPTY_PLACEMENT: PlacementProjection = Object.freeze({
  phase: 'idle',
  terms: null,
  pending: null,
  receipt: null,
  status: null,
  issue: null,
  rejectedQuoteId: null,
  committedConflict: false,
});
export const placementBusy = (state: PlacementProjection) =>
  ['checking', 'placing', 'status'].includes(state.phase);
export const placementLocked = (state: PlacementProjection) =>
  placementBusy(state) || !!(state.pending || state.receipt || state.committedConflict);
