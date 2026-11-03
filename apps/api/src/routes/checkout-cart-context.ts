import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { CartRequestError, resolveCartRequest, type CartShopperResolver } from './cart-context.js';

/** Read-only compatibility adapter. Checkout never selects or authenticates a Cart itself. */
export function checkoutCartContext(
  app: FastifyInstance,
  database: DatabaseClient,
  config?: RuntimeConfig,
  resolveShopper?: CartShopperResolver,
): WeakMap<FastifyRequest, string> {
  const tokens = new WeakMap<FastifyRequest, string>();
  const authorize = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('cache-control', 'private, no-store').header('vary', 'Cookie, X-Cart-Context');
    try {
      if (!config || !resolveShopper)
        throw new CartRequestError('UNAVAILABLE', 503, 'Checkout Cart ownership is unavailable.');
      if (
        request.method !== 'GET' &&
        request.method !== 'HEAD' &&
        (request.headers.origin !== new URL(config.storefrontBaseUrl).origin ||
          (request.headers['sec-fetch-site'] &&
            !['same-origin', 'same-site', 'none'].includes(request.headers['sec-fetch-site'])))
      )
        throw new CartRequestError('ORIGIN_REJECTED', 403, 'Request origin is not trusted.');
      const resolved = await resolveCartRequest(database, config, request, resolveShopper);
      if (resolved.owner?.kind === 'ACCOUNT')
        throw new CartRequestError(
          'ACCOUNT_CART_NOT_READY',
          409,
          'Account Cart integration is not available yet.',
        );
      if (resolved.token) tokens.set(request, resolved.token);
    } catch (error) {
      const known = error instanceof CartRequestError;
      return reply.code(known ? error.status : 503).send({
        error: {
          code: known ? error.code : 'UNAVAILABLE',
          message: known ? error.message : 'Checkout Cart ownership is temporarily unavailable.',
          ...(known && error.contexts ? { contexts: error.contexts } : {}),
        },
      });
    }
  };
  // Bind to registered routes, never to an untrusted raw URL representation.
  app.addHook('onRoute', (route) => {
    if (
      route.url !== '/storefront/v1/checkouts' &&
      !route.url.startsWith('/storefront/v1/checkouts/')
    )
      return;
    const existing = route.onRequest;
    route.onRequest = [
      authorize,
      ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    ];
  });
  return tokens;
}
