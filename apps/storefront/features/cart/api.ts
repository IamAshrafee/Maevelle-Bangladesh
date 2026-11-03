import type { GuestCartViewDto, CartSessionForgottenDto } from '@maevelle/contracts';
import { requestStorefrontClient } from '@/lib/api/client/http';
import type { CartIntent } from './types';

/** Transport abort is an unknown write outcome, not proof of rollback. */
async function requestCart<T>(path: string, init: RequestInit): Promise<T> {
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
  get(context?: string, signal?: AbortSignal): Promise<GuestCartViewDto>;
  initialize(): Promise<GuestCartViewDto>;
  forgetSession(): Promise<CartSessionForgottenDto>;
  mutate(intent: CartIntent): Promise<GuestCartViewDto>;
}
export const cartApi: CartApi = {
  get(context, signal) {
    return requestCart('/api/storefront/v1/carts/current', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
      headers: context ? { 'x-cart-context': context } : {},
    });
  },
  initialize() {
    return requestCart('/api/storefront/v1/carts', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  },
  forgetSession() {
    return requestCart('/api/storefront/v1/carts/session', {
      method: 'DELETE',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  },
  mutate(intent) {
    const command = intent.command;
    const route =
      command.kind === 'clear'
        ? ''
        : command.kind === 'add'
          ? '/lines'
          : command.kind === 'set' || command.kind === 'remove'
            ? `/lines/${encodeURIComponent(command.lineId)}`
            : command.kind === 'apply-coupon'
              ? '/coupons'
              : `/coupons/${encodeURIComponent(command.couponCode)}`;
    const method =
      command.kind === 'set'
        ? 'PATCH'
        : command.kind === 'clear' || command.kind === 'remove' || command.kind === 'remove-coupon'
          ? 'DELETE'
          : 'POST';
    const payload =
      command.kind === 'add'
        ? { variantId: command.variantId, quantity: command.quantity }
        : command.kind === 'set'
          ? { quantity: command.quantity }
          : command.kind === 'apply-coupon'
            ? { couponCode: command.couponCode }
            : {};
    // Submitted identity/body never change on retry. No client price/tenant fields.
    return requestCart(`/api/storefront/v1/carts/current${route}`, {
      method,
      cache: 'no-store',
      headers: {
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
