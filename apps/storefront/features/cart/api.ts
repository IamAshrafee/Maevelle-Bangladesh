import type { CartSessionForgottenDto } from '@maevelle/contracts';
import { requestStorefrontClient } from '@/lib/api/client/http';
import type { CartIntent, CartView } from './types';

/** Transport abort is an unknown write outcome, not proof of rollback. */
export async function requestCart<T>(path: string, init: RequestInit): Promise<T> {
  const control = new AbortController();
  const cancel = () => control.abort();
  if (init.signal?.aborted) control.abort();
  init.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15_000);
  try {
    return await requestStorefrontClient<T>(path, { ...init, signal: control.signal });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}
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
