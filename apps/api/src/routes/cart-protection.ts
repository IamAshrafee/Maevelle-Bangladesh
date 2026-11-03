import type { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { CartDomainError } from '@maevelle/database/cart';
import { incrementAuthStorageValue } from '@maevelle/database/platform';
import { CartRequestError } from './cart-context.js';

/** Common protection applies equally to reads, commands, establishment and recovery. */
export function protectCartRoutes(
  cart: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
): void {
  cart.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'private, no-store').header('vary', 'Cookie, X-Cart-Context');
    const write = ['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method);
    if (
      write &&
      (request.headers.origin !== new URL(config.storefrontBaseUrl).origin ||
        (request.headers['sec-fetch-site'] &&
          !['same-origin', 'same-site', 'none'].includes(request.headers['sec-fetch-site'])))
    )
      throw new CartRequestError('ORIGIN_REJECTED', 403, 'Request origin is not trusted.');
    if (
      write &&
      request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
    )
      throw new CartRequestError('UNSUPPORTED_MEDIA_TYPE', 415, 'JSON is required.');
    const create =
      request.method === 'POST' && request.url.split('?')[0] === '/storefront/v1/carts';
    const bucket = create ? 'initialize' : write ? 'mutate' : 'read';
    const maximum = create ? 20 : write ? 120 : 240;
    const key = createHmac('sha256', config.betterAuthSecret)
      .update(`cart-rate:v1:${config.storefrontOrganizationCode}:${request.ip}:${bucket}`)
      .digest('hex');
    const attempts = await incrementAuthStorageValue(database.db, key, 60);
    if (attempts > maximum) {
      reply.header('retry-after', '60');
      throw new CartRequestError('RATE_LIMITED', 429, 'Too many Cart requests. Try again shortly.');
    }
  });
  cart.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode < 300 && typeof payload === 'string') {
      const outcome = (
        JSON.parse(payload) as {
          data?: { outcome?: { operation: string; replayed: boolean; committedVersion: string } };
        }
      ).data?.outcome;
      if (outcome)
        request.log.info(
          {
            component: 'cart',
            requestId: request.id,
            operation: outcome.operation,
            replayed: outcome.replayed,
            revision: outcome.committedVersion,
          },
          'Cart intent resolved',
        );
    }
    return payload;
  });
  cart.addHook('preValidation', async (request) => {
    const schema = request.routeOptions.schema?.body as
      { properties?: Record<string, unknown> } | undefined;
    if (
      schema?.properties &&
      request.body &&
      typeof request.body === 'object' &&
      Object.keys(request.body).some((key) => !Object.hasOwn(schema.properties!, key))
    )
      throw new CartRequestError('INVALID_REQUEST', 400, 'Unknown Cart request field.');
  });
  cart.setErrorHandler((error, request, reply) => {
    const transport = error as { statusCode?: number; validation?: unknown };
    const domain = error instanceof CartDomainError;
    const known = error instanceof CartRequestError;
    const status = known
      ? error.status
      : domain
        ? error.code === 'NOT_FOUND'
          ? 404
          : [
                'STALE_VERSION',
                'CONFLICT',
                'OWNER_CHANGED',
                'IDEMPOTENCY_CONFLICT',
                'INTENT_EXPIRED',
              ].includes(error.code)
            ? 409
            : error.code === 'UNAVAILABLE' || error.code === 'INVALID_CONFIGURATION'
              ? 422
              : 422
        : transport.statusCode && transport.statusCode < 500
          ? transport.statusCode
          : 503;
    const code =
      known || domain
        ? error.code
        : transport.validation
          ? 'INVALID_REQUEST'
          : status === 413
            ? 'PAYLOAD_TOO_LARGE'
            : status === 415
              ? 'UNSUPPORTED_MEDIA_TYPE'
              : status < 500
                ? 'INVALID_REQUEST'
                : 'UNAVAILABLE';
    // No Error object/raw body, cookies, token or URL in diagnostics.
    request.log.warn(
      { code, status, requestId: request.id, component: 'cart' },
      'Cart request rejected',
    );
    if (status === 503) reply.header('retry-after', '2');
    return reply.code(status).send({
      error: {
        code,
        message:
          known || domain
            ? error.message
            : status < 500
              ? 'Invalid Cart request.'
              : 'Cart is temporarily unavailable.',
        ...(domain && error.currentVersion ? { currentVersion: String(error.currentVersion) } : {}),
        ...(known && error.contexts ? { contexts: error.contexts } : {}),
        requestId: request.id,
      },
    });
  });
}
