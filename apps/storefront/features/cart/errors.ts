import { StorefrontClientApiError } from '@/lib/api/client/http';
import type { CartIssue } from './types';

/** These are local coordination failures, never fabricated backend response codes. */
export class CartCoordinationError extends Error {
  constructor(
    public readonly code: 'OWNER_TRANSITION' | 'REVIEW_REQUIRED' | 'PERSISTENCE_UNAVAILABLE',
    message: string,
  ) {
    super(message);
  }
}
export function cartIssue(error: unknown, now: number, submitted = false): CartIssue {
  const code =
    error instanceof StorefrontClientApiError || error instanceof CartCoordinationError
      ? error.code
      : 'NETWORK_UNAVAILABLE';
  const retryAt =
    error instanceof StorefrontClientApiError && error.retryAfterSeconds !== null
      ? now + error.retryAfterSeconds * 1000
      : 0;
  if (code === 'ACCOUNT_CART_NOT_READY')
    return {
      code,
      message: 'Your shopper session changed. Check your shopping bag again.',
      recovery: 'refresh',
      retryAt,
    };
  if (
    ['SESSION_EXPIRED', 'INVALID_SESSION', 'UNAUTHENTICATED', 'SHOPPER_SESSION_REQUIRED'].includes(
      code,
    )
  )
    return {
      code,
      message:
        'Your bag session is unavailable. Sign in again or review your browser cookie settings. We have not created a replacement bag.',
      recovery: 'sign-in',
      retryAt,
    };
  if (code === 'CART_CONTEXT_LIMIT')
    return {
      code,
      message:
        'This browser has too many bag sessions. You can deliberately start a new bag here, or clear this site’s bag cookies in browser settings. Stored contents are not deleted or recovered.',
      recovery: 'review',
      retryAt,
    };
  if (code === 'CART_CONTEXT_REQUIRED')
    return {
      code,
      message:
        'More than one shopping bag is available in this browser. Choose a bag to review before continuing.',
      recovery: 'select',
      retryAt,
    };
  if (
    [
      'STALE_VERSION',
      'MERGE_STALE',
      'MERGE_REVIEW_REQUIRED',
      'OWNER_CHANGED',
      'IDEMPOTENCY_CONFLICT',
      'INTENT_EXPIRED',
      'CONFLICT',
    ].includes(code)
  )
    return {
      code,
      message:
        'Your bag or this action changed. Review the current bag before trying a new action.',
      recovery: 'review',
      retryAt,
    };
  if (code === 'RATE_LIMITED')
    return {
      code,
      message: 'Your bag is receiving too many requests. Wait a moment before retrying.',
      recovery: submitted ? 'same-intent' : 'wait',
      retryAt,
    };
  if (['SESSION_ESTABLISHMENT_REQUIRED', 'OWNER_CONTEXT_REQUIRED'].includes(code))
    return {
      code,
      message:
        'Your bag session needs to be checked before this action can continue. Nothing has been confirmed.',
      recovery: 'review',
      retryAt,
    };
  if (['INTENT_KEY_REQUIRED', 'INVALID_REQUEST'].includes(code))
    return {
      code,
      message:
        'This bag action could not be submitted correctly. Check the bag again; if it continues, contact support.',
      recovery: 'review',
      retryAt,
    };
  if (code === 'PERSISTENCE_UNAVAILABLE')
    return {
      code,
      message:
        'Your browser did not return the bag session cookie. Nothing was added. Allow necessary cookies before trying again.',
      recovery: 'review',
      retryAt,
    };
  const uncertain =
    submitted &&
    (!(error instanceof StorefrontClientApiError) ||
      error.status >= 500 ||
      code === 'INVALID_RESPONSE');
  if (uncertain)
    return {
      code,
      message:
        'We could not confirm this action. It may already be saved. Retry the same action to check its result without adding it twice.',
      recovery: 'same-intent',
      retryAt,
    };
  return {
    code,
    message: error instanceof Error ? error.message : 'Your bag could not be checked. Try again.',
    recovery: 'refresh',
    retryAt,
  };
}
export function isUncertain(error: unknown): boolean {
  return (
    !(error instanceof StorefrontClientApiError) ||
    error.status >= 500 ||
    error.code === 'INVALID_RESPONSE'
  );
}

const unavailableOwnerCodes = new Set([
  'ACCOUNT_CART_NOT_READY',
  'SESSION_EXPIRED',
  'INVALID_SESSION',
  'UNAUTHENTICATED',
  'SHOPPER_SESSION_REQUIRED',
  'INVALID_OWNERSHIP',
  'OWNER_CHANGED',
  'OWNER_TRANSITION',
  'SESSION_ESTABLISHMENT_REQUIRED',
  'CART_CONTEXT_LIMIT',
]);
/** Authority loss has one classification for reads, fresh writes and recovery attempts. */
export function cartOwnerUnavailable(code: string): boolean {
  return unavailableOwnerCodes.has(code);
}
