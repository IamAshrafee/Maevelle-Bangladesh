import type { CartObservationCommand, CartRejectionReason } from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import type { CartCommand } from './types';

const commandNames = {
  add: 'ADD',
  set: 'QUANTITY',
  replace: 'VARIANT',
  remove: 'REMOVE',
  clear: 'CLEAR',
  'apply-coupon': 'COUPON_APPLY',
  'remove-coupon': 'COUPON_REMOVE',
  merge: 'MERGE_CONFIRM',
} as const satisfies Record<
  Exclude<CartCommand['kind'], 'wishlist-transfer'>,
  CartObservationCommand
>;

export function cartObservationCommand(command: CartCommand): CartObservationCommand {
  if (command.kind === 'wishlist-transfer')
    return command.request.action === 'MOVE' ? 'WISHLIST_MOVE' : 'WISHLIST_ADD';
  return commandNames[command.kind];
}

export function cartRejectionReason(error: unknown): CartRejectionReason | null {
  // Network errors, throttling and 5xx can leave the original intent unresolved.
  if (
    !(error instanceof StorefrontClientApiError) ||
    error.status < 400 ||
    error.status >= 500 ||
    [408, 425, 429].includes(error.status)
  )
    return null;
  if (['STALE_VERSION', 'MERGE_STALE', 'WISHLIST_CHANGED'].includes(error.code)) return 'STALE';
  if (error.status === 400 || error.status === 422) return 'VALIDATION';
  return 'OTHER';
}
