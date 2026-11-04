/** Transport-only failures; domain errors carry semantic codes without HTTP concerns. */
export class CheckoutRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function checkoutDomainStatus(code: string): number {
  if (code === 'INVALID_REQUEST') return 400;
  if (code === 'SESSION_EXPIRED' || code === 'OWNER_CHANGED') return 401;
  if (code === 'NOT_FOUND') return 404;
  if (['SOURCE_CHANGED', 'STALE_REVISION', 'IDEMPOTENCY_CONFLICT', 'DRAFT_LIMIT'].includes(code))
    return 409;
  if (code === 'DRAFT_EXPIRED') return 410;
  if (code === 'SOURCE_INELIGIBLE') return 422;
  return 503;
}
