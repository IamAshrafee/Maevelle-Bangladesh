import type { CartSessionForgottenDto, WishlistCartTransferRequestDto } from '@maevelle/contracts';
import type { CartIntent, CartView } from './types';

export { requestWithDeadline as requestCart } from '@/lib/api/client/deadline';
import { requestWithDeadline as requestCart } from '@/lib/api/client/deadline';
export interface CartApi {
  get(context?: string, signal?: AbortSignal): Promise<CartView>;
  initialize(): Promise<CartView>;
  forgetSession(): Promise<CartSessionForgottenDto>;
  mutate(intent: CartIntent): Promise<CartView>;
}
export function createCartApi(partition?: string): CartApi {
  const base = '/api/storefront/v1/carts' + (partition ? '/account' : '');
  const ownerHeaders: Record<string, string> = partition
    ? { 'x-shopper-partition': partition }
    : {};
  return {
    get(context, signal) {
      return requestCart(base + '/current', {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
        headers: {
          ...ownerHeaders,
          ...(!partition && context ? { 'x-cart-context': context } : {}),
        },
      });
    },
    initialize() {
      return requestCart(base, {
        method: 'POST',
        cache: 'no-store',
        headers: { ...ownerHeaders, 'content-type': 'application/json' },
        body: '{}',
      });
    },
    forgetSession() {
      return requestCart('/api/storefront/v1/carts/session', {
        method: 'DELETE',
        cache: 'no-store',
        headers: { ...ownerHeaders, 'content-type': 'application/json' },
        body: '{}',
      });
    },
    mutate(intent) {
      const command = intent.command;
      if (command.kind === 'merge') {
        if (!partition) throw new Error('Account authority is required to merge.');
        return requestCart(base + '/merge/commit', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            ...ownerHeaders,
            'content-type': 'application/json',
            'idempotency-key': intent.key,
          },
          body: JSON.stringify({
            guestCartId: command.request.guestCartId,
            guestOwnerContext: command.request.guestOwnerContext,
            ownerContext: command.request.ownerContext,
            version: command.request.version,
            reviewFingerprint: command.request.reviewFingerprint,
          }),
        });
      }
      if (command.kind === 'wishlist-transfer') {
        if (!partition) throw new Error('Account authority is required to transfer a saved item.');
        const body: WishlistCartTransferRequestDto = {
          ...command.request,
          version: intent.version,
          ownerContext: intent.ownerContext,
        };
        return requestCart(base + '/current/wishlist-transfers', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            ...ownerHeaders,
            'content-type': 'application/json',
            'idempotency-key': intent.key,
            'x-cart-context': intent.ownerContext,
          },
          body: JSON.stringify(body),
        });
      }
      const lineRoute = 'lineId' in command ? `/lines/${encodeURIComponent(command.lineId)}` : '';
      const routeByCommand = {
        clear: '',
        add: '/lines',
        set: lineRoute,
        replace: `${lineRoute}/variant`,
        remove: lineRoute,
        'apply-coupon': '/coupons',
        'remove-coupon':
          'couponCode' in command ? `/coupons/${encodeURIComponent(command.couponCode)}` : '',
      };
      const methodByCommand = {
        clear: 'DELETE',
        add: 'POST',
        set: 'PATCH',
        replace: 'PUT',
        remove: 'DELETE',
        'apply-coupon': 'POST',
        'remove-coupon': 'DELETE',
      };
      const payload = {
        ...('quantity' in command ? { quantity: command.quantity } : {}),
        ...(command.kind === 'add' ? { variantId: command.variantId } : {}),
        ...(command.kind === 'replace' ? { targetVariantId: command.targetVariantId } : {}),
        ...(command.kind === 'apply-coupon' ? { couponCode: command.couponCode } : {}),
      };
      // Submitted identity/body never change on retry. No client price/tenant fields.
      return requestCart(`${base}/current${routeByCommand[command.kind]}`, {
        method: methodByCommand[command.kind],
        cache: 'no-store',
        headers: {
          ...ownerHeaders,
          'content-type': 'application/json',
          'idempotency-key': intent.key,
          'x-cart-context': intent.ownerContext,
        },
        body: JSON.stringify({
          ...payload,
          version: intent.version,
          ownerContext: intent.ownerContext,
        }),
      });
    },
  };
}

export const cartApi = createCartApi();
