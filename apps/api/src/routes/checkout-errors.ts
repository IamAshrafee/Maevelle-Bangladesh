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
  if (
    [
      'SOURCE_CHANGED',
      'STALE_REVISION',
      'IDEMPOTENCY_CONFLICT',
      'DRAFT_LIMIT',
      'ADDRESS_LIMIT',
      'ADDRESS_CHANGED',
      'CONFIGURATION_CHANGED',
      'DELIVERY_CHANGED',
      'SUPERSEDED',
      'QUOTE_LIMIT',
      'QUOTE_REVIEW_REQUIRED',
      'CHECKOUT_COMMITTED',
      'PAYMENT_METHOD_UNAVAILABLE',
      'PLACEMENT_REVIEW_LIMIT',
      'CUSTOMER_RESTRICTED',
    ].includes(code)
  )
    return 409;
  if (code === 'DRAFT_EXPIRED' || code === 'QUOTE_EXPIRED') return 410;
  if (
    [
      'SOURCE_INELIGIBLE',
      'INVALID_CONTACT',
      'UNSUPPORTED_AREA',
      'DELIVERY_UNAVAILABLE',
      'VARIANT_UNAVAILABLE',
      'INSUFFICIENT_STOCK',
    ].includes(code)
  )
    return 422;
  return 503;
}
