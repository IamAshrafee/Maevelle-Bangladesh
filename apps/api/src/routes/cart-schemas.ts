import { Type } from 'typebox';
import type { FastifyRequest } from 'fastify';
import { CartRequestError } from './cart-context.js';

export const uuid = Type.String({ format: 'uuid' });
export const version = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 });
export const object = (
  properties: Record<
    string,
    ReturnType<typeof Type.String> | typeof version | ReturnType<typeof Type.Optional>
  >,
) => Type.Object(properties, { additionalProperties: false });

export function cartIntentKey(request: FastifyRequest): string {
  const key = request.headers['idempotency-key'];
  if (key === undefined)
    throw new CartRequestError(
      'INTENT_KEY_REQUIRED',
      400,
      'Every Cart mutation requires a UUID idempotency key.',
    );
  if (
    typeof key !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
  )
    throw new CartRequestError('INVALID_REQUEST', 400, 'Idempotency key must be a UUID.');
  return key;
}
