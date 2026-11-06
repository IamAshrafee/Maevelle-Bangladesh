import type { CheckoutFinalTermsDto, CheckoutPlacementMethod } from '@maevelle/contracts';
import type { ReviewSnapshot } from './foundation-types';
import type { FinalTermsInput } from './placement-api';

export function reviewedTermsInput(
  state: ReviewSnapshot,
  method: CheckoutPlacementMethod,
  now: number,
): FinalTermsInput | null {
  const { draft, delivery, quote } = state;
  const q = quote.current,
    d = delivery.confirmed;
  if (
    state.suspended ||
    state.phase !== 'ready' ||
    state.pending ||
    state.deliveryEditing ||
    !draft ||
    draft.status !== 'ACTIVE' ||
    draft.sourceReviewRequired ||
    !draft.lines.length ||
    Date.parse(draft.expiresAt) <= now ||
    delivery.phase !== 'ready' ||
    delivery.pending ||
    !d?.delivery ||
    d.reviewRequired ||
    d.eligibility?.status !== 'ELIGIBLE' ||
    d.configurationChanged ||
    d.draftId !== draft.id ||
    quote.phase !== 'ready' ||
    quote.pending ||
    quote.observedRevision !== draft.revision ||
    !q ||
    q.status !== 'CURRENT' ||
    q.reviewRequired ||
    !q.acknowledged ||
    q.draftId !== draft.id ||
    q.draftRevision !== draft.revision ||
    q.id === state.placement.rejectedQuoteId ||
    Date.parse(q.expiresAt) <= now
  )
    return null;
  return { revision: draft.revision, quoteId: q.id, quoteFingerprint: q.fingerprint, method };
}

export function usableTerms(state: ReviewSnapshot, terms: CheckoutFinalTermsDto, now: number) {
  const input = reviewedTermsInput(state, terms.method, now);
  return (
    !!input &&
    terms.quoteId === input.quoteId &&
    terms.quoteFingerprint === input.quoteFingerprint &&
    terms.revision === input.revision &&
    Date.parse(terms.expiresAt) > now
  );
}
