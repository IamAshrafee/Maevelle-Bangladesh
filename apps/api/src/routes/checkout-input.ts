import type { FastifyRequest } from 'fastify';
import { CheckoutRequestError } from './checkout-errors.js';
export function intentKey(request: FastifyRequest) {
  const key = request.headers['idempotency-key'];
  if (
    typeof key !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
  )
    throw new CheckoutRequestError('INVALID_REQUEST', 400, 'A UUID idempotency key is required.');
  return key.toLowerCase();
}
/** Reject before Fastify's default removeAdditional/coercion can change request intent. */
export function strictBody(request: FastifyRequest, allowed: readonly string[]) {
  const body = request.body;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !allowed.includes(k))
  )
    throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Unknown or invalid Checkout field.');
  const input = body as Record<string, unknown>;
  if ('revision' in input && typeof input.revision !== 'string')
    throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Revision must be a string.');
  if ('source' in input) {
    const item = input.source as Record<string, unknown> | null;
    const fields =
      item?.kind === 'CART'
        ? ['kind', 'cartId', 'cartRevision']
        : ['kind', 'variantId', 'quantity'];
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      Object.keys(item).some((k) => !fields.includes(k)) ||
      Object.values(item).some((value) => typeof value !== 'string')
    )
      throw new CheckoutRequestError('INVALID_REQUEST', 400, 'Invalid Checkout source fields.');
  }
}
