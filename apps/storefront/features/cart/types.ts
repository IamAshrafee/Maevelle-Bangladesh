import type { GuestCartViewDto } from '@maevelle/contracts';

export type CartCommand =
  | { kind: 'clear' }
  | { kind: 'add'; variantId: string; quantity: string }
  | { kind: 'set'; lineId: string; quantity: string }
  | { kind: 'remove'; lineId: string }
  | { kind: 'apply-coupon'; couponCode: string }
  | { kind: 'remove-coupon'; couponCode: string };
export interface CartIntent {
  readonly key: string;
  readonly command: CartCommand;
  readonly ownerContext: string;
  readonly version: number;
  readonly createdAt: number;
}
export type CartMode =
  'idle' | 'loading' | 'empty' | 'ready' | 'ambiguous' | 'unavailable' | 'expired' | 'error';
export type CartSync =
  'idle' | 'refreshing' | 'initializing' | 'pending' | 'uncertain' | 'conflict' | 'resetting';
export interface CartIssue {
  readonly code: string;
  readonly message: string;
  readonly recovery: 'refresh' | 'same-intent' | 'review' | 'select' | 'sign-in' | 'wait';
  readonly retryAt: number;
}
export interface CartSnapshot {
  readonly mode: CartMode;
  readonly sync: CartSync;
  readonly confirmed: GuestCartViewDto | null;
  readonly pending: CartIntent | null;
  readonly contexts: readonly string[];
  readonly issue: CartIssue | null;
  readonly notice: string | null;
  readonly epoch: number;
  readonly recoveryPersisted: boolean;
}
export const EMPTY_CART_SNAPSHOT: CartSnapshot = Object.freeze({
  mode: 'idle',
  sync: 'idle',
  confirmed: null,
  pending: null,
  contexts: [],
  issue: null,
  notice: null,
  epoch: 0,
  recoveryPersisted: true,
});
export function confirmedCartCount(state: CartSnapshot): number | null {
  if (state.confirmed)
    return state.confirmed.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  return state.mode === 'empty' ? 0 : null;
}
export function cartIsBusy(state: CartSnapshot): boolean {
  return (
    Boolean(state.pending) ||
    ['idle', 'loading'].includes(state.mode) ||
    ['pending', 'initializing', 'refreshing', 'resetting'].includes(state.sync)
  );
}
