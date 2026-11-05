import type { CheckoutDraftDto, CheckoutQuoteDto } from '@maevelle/contracts';
import type { ReviewIssue, ReviewOwner } from './foundation-types';

/** Commands and financial facts are page-memory only; never pass these to the source journal. */
export interface PrivateQuoteIntent {
  readonly key: string;
  readonly owner: ReviewOwner;
  readonly draftId: string;
  readonly path: string;
  readonly method: 'POST';
  readonly body: string;
  readonly kind: 'create' | 'acknowledge';
  readonly quoteId?: string;
}
export interface QuoteProjection {
  readonly phase: 'idle' | 'loading' | 'ready' | 'saving' | 'unknown' | 'conflict' | 'error';
  readonly current: CheckoutQuoteDto | null;
  readonly previous: CheckoutQuoteDto | null;
  readonly observedRevision: string | null;
  readonly pending: PrivateQuoteIntent | null;
  readonly issue: ReviewIssue | null;
  readonly notice: string;
  readonly conflictReady: boolean;
}
export const EMPTY_QUOTE: QuoteProjection = Object.freeze({
  phase: 'idle',
  current: null,
  previous: null,
  observedRevision: null,
  pending: null,
  issue: null,
  notice: '',
  conflictReady: false,
});
export interface QuoteScope {
  readonly owner: ReviewOwner;
  readonly draft: CheckoutDraftDto;
  readonly signal: AbortSignal;
  current(): boolean;
  verify(): Promise<void>;
  revokeView(): void;
  restoreDraft(): Promise<CheckoutDraftDto>;
}
