import { StorefrontClientApiError } from '@/lib/api/client/http';
import type { ReviewIssue } from './foundation-types';
export function reviewIssue(error: unknown, now = Date.now()): ReviewIssue {
  const messages: Record<number, string> = {
    400: 'This selection could not be sent. Check the product or bag again.',
    401: 'Your session has expired. Sign in again, or explicitly start a new guest review.',
    403: 'This request could not be authorized. Reload Maevelle before trying again.',
    404: 'This review is unavailable to the current shopper. Return to your bag or product.',
    409: 'Your selection or review changed. Restore it and review the current selection.',
    410: 'This review is no longer editable. Return to your product or bag to start again.',
    413: 'This selection is too large. Review your bag before continuing.',
    415: 'This request could not be sent. Reload Maevelle before trying again.',
    422: 'This product or complete bag is not currently eligible. Check your selection.',
    429: 'Please wait before trying this same request again.',
    503: 'Checkout reviews are currently unavailable. Your bag has not been changed.',
  };
  if (error instanceof StorefrontClientApiError)
    return {
      message: messages[error.status] ?? 'We could not check the review. Retry this same request.',
      retryable: error.status >= 500 || error.status === 429,
      retryAt: now + Math.min(3600, Math.max(0, error.retryAfterSeconds ?? 0)) * 1000,
      code: error.code,
    };
  return {
    message: 'The result is uncertain. Retry to check the same review; your bag is unchanged.',
    retryable: true,
    retryAt: now,
    code: 'UNKNOWN_OUTCOME',
  };
}
