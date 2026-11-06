import { createHmac } from 'node:crypto';
import type { CheckoutAuthority } from './types.js';

/** Reconstruct only after an authorized commit/replay; never serialize into a DTO or receipt. */
export function checkoutGuestOrderCredential(
  owner: Extract<CheckoutAuthority, { kind: 'GUEST' }>,
  draftId: string,
  orderId: string,
): string {
  return createHmac('sha256', owner.token)
    .update(
      `maevelle:checkout:order-read:v1:${owner.organizationId}:${owner.sessionId}:${draftId}:${orderId}`,
    )
    .digest('base64url');
}
