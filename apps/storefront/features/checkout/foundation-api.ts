import type { CheckoutDraftDto, CheckoutGuestSessionDto } from '@maevelle/contracts';
import { requestWithDeadline } from '@/lib/api/client/deadline';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import type { ReviewIntent, ReviewOwner } from './foundation-types';

export function ownerHeaders(owner: ReviewOwner): Record<string, string> {
  return owner.kind === 'GUEST'
    ? { 'x-checkout-context': owner.context }
    : { 'x-shopper-partition': owner.partition };
}
function draftResult(value: CheckoutDraftDto): CheckoutDraftDto {
  if (
    !value ||
    value.implementationVersion !== 2 ||
    value.purchaseAvailable !== false ||
    !/^[0-9a-f-]{36}$/i.test(value.id) ||
    !/^[1-9][0-9]*$/.test(value.revision) ||
    !['GUEST', 'ACCOUNT'].includes(value.ownerKind) ||
    !['ACTIVE', 'ABANDONED', 'EXPIRED', 'COMMITTED'].includes(value.status) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    typeof value.sourceReviewRequired !== 'boolean' ||
    !value.source ||
    !['BUY_NOW', 'CART'].includes(value.source.kind) ||
    !Array.isArray(value.lines) ||
    value.lines.some(
      (line) =>
        !line ||
        typeof line.id !== 'string' ||
        typeof line.variantId !== 'string' ||
        typeof line.quantity !== 'string' ||
        !/^[1-9][0-9]*$/.test(line.quantity),
    )
  )
    throw new StorefrontClientApiError(502, 'INVALID_RESPONSE', 'The review could not be checked.');
  return value;
}
export const reviewApi = {
  async establish(signal: AbortSignal) {
    const value = await requestWithDeadline<CheckoutGuestSessionDto>(
      '/api/storefront/v1/checkout/guest-sessions',
      {
        method: 'POST',
        signal,
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
    );
    if (!value || !/^[0-9a-f-]{36}$/i.test(value.id))
      throw new Error('Guest session was not established.');
    return value;
  },
  async read(id: string, owner: ReviewOwner, signal: AbortSignal) {
    return draftResult(
      await requestWithDeadline<CheckoutDraftDto>(
        `/api/storefront/v1/checkouts/${encodeURIComponent(id)}`,
        {
          signal,
          cache: 'no-store',
          headers: ownerHeaders(owner),
        },
      ),
    );
  },
  async mutate(intent: ReviewIntent, signal: AbortSignal) {
    const base = '/api/storefront/v1/checkouts';
    const path =
      intent.kind === 'create'
        ? base
        : `${base}/${encodeURIComponent(intent.id)}${intent.kind === 'adopt' ? '/adoptions' : ''}`;
    const body =
      intent.kind === 'create'
        ? { source: intent.source }
        : intent.kind === 'adopt'
          ? { revision: intent.revision }
          : intent.change;
    return draftResult(
      await requestWithDeadline<CheckoutDraftDto>(path, {
        method: intent.kind === 'update' ? 'PATCH' : 'POST',
        signal,
        cache: 'no-store',
        headers: {
          ...ownerHeaders(intent.owner),
          'content-type': 'application/json',
          'idempotency-key': intent.key,
          ...(intent.kind === 'adopt' ? { 'x-checkout-context': intent.guestContext } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  },
  async revoke(owner: Extract<ReviewOwner, { kind: 'GUEST' }>, signal: AbortSignal) {
    return requestWithDeadline<{ revoked: true }>(
      `/api/storefront/v1/checkout/guest-sessions/${owner.context}`,
      {
        method: 'DELETE',
        signal,
        cache: 'no-store',
        headers: { ...ownerHeaders(owner), 'content-type': 'application/json' },
        body: '{}',
      },
    );
  },
};
