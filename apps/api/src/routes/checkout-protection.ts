import { CheckoutRequestError, checkoutDomainStatus } from './checkout-errors.js';
import type { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { CheckoutError } from '@maevelle/database/checkout';
import { CartDomainError } from '@maevelle/database/cart';
import { incrementAuthStorageValue } from '@maevelle/database/platform';
import { rateLimitClientIp } from '../rate-limit-client.js';
import { CartRequestError } from './cart-context.js';

export function protectCheckoutRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  config: RuntimeConfig,
) {
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('cache-control', 'private, no-store')
      .header('vary', 'Cookie, X-Checkout-Context, X-Shopper-Partition')
      .header('referrer-policy', 'no-referrer');
    if (!config.checkoutDraftsEnabled || config.nodeEnv === 'production')
      throw new CheckoutRequestError(
        'CHECKOUT_DISABLED',
        503,
        'Checkout is unavailable. Your Bag is unchanged.',
      );
    if (
      request.query &&
      Object.keys(request.query).length &&
      !['/storefront/v1/checkout/delivery-areas', '/storefront/v1/checkout/addresses'].includes(
        request.routeOptions.url ?? '',
      )
    )
      throw new CheckoutRequestError(
        'INVALID_REQUEST',
        400,
        'Checkout does not accept query fields.',
      );
    const mutation = !['GET', 'HEAD'].includes(request.method);
    const orderPayment = request.routeOptions.url?.includes('/order-payment');
    if (
      !mutation &&
      orderPayment &&
      (request.headers['sec-fetch-site'] === 'cross-site' ||
        (request.headers.origin &&
          request.headers.origin !== new URL(config.storefrontBaseUrl).origin))
    )
      throw new CheckoutRequestError('ORIGIN_REJECTED', 403, 'Request origin is not trusted.');
    if (mutation) {
      if (
        request.headers.origin !== new URL(config.storefrontBaseUrl).origin ||
        (request.headers['sec-fetch-site'] &&
          !['same-origin', 'same-site', 'none'].includes(request.headers['sec-fetch-site']))
      )
        throw new CheckoutRequestError('ORIGIN_REJECTED', 403, 'Request origin is not trusted.');
      if (
        request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
      )
        throw new CheckoutRequestError('UNSUPPORTED_MEDIA_TYPE', 415, 'JSON is required.');
    }
    const ip = rateLimitClientIp(request, config.apiTrustedGatewayIp);
    if (!ip)
      throw new CheckoutRequestError('UNAVAILABLE', 503, 'Request protection is unavailable.');
    const bootstrap =
      request.routeOptions.url === '/storefront/v1/checkout/guest-sessions' &&
      request.method === 'POST';
    const bucket = bootstrap ? 'bootstrap' : !mutation ? 'read' : orderPayment ? 'claim' : 'write';
    const maximum = bootstrap || bucket === 'claim' ? 12 : bucket === 'read' ? 120 : 40;
    const hash = createHmac('sha256', config.betterAuthSecret)
      .update(`checkout-rate:v2:${config.storefrontOrganizationCode}:${ip}:${bucket}`)
      .digest('hex');
    if ((await incrementAuthStorageValue(database.db, hash, 60)) > maximum) {
      reply.header('retry-after', '60');
      throw new CheckoutRequestError(
        'RATE_LIMITED',
        429,
        'Too many Checkout requests. Try again shortly.',
      );
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof CheckoutRequestError || error instanceof CartRequestError;
    const domain = error instanceof CheckoutError;
    const cart = error instanceof CartDomainError;
    const transport = error as { statusCode?: number; validation?: unknown };
    const status = known
      ? error.status
      : domain
        ? checkoutDomainStatus(error.code)
        : cart
          ? error.code === 'NOT_FOUND'
            ? 404
            : 422
          : transport.statusCode === 413
            ? 413
            : transport.statusCode && transport.statusCode < 500
              ? 400
              : 503;
    if (status === 503) reply.header('retry-after', '2');
    // No raw driver error, query, bearer, body or URL is logged here.
    return reply.code(status).send({
      error: {
        code:
          known || domain || cart
            ? error.code
            : status === 413
              ? 'PAYLOAD_TOO_LARGE'
              : status === 400
                ? 'INVALID_REQUEST'
                : 'UNAVAILABLE',
        message:
          known || domain || cart
            ? error.message
            : status === 400
              ? 'Invalid Checkout request.'
              : 'Checkout is temporarily unavailable.',
        requestId: request.id,
      },
    });
  });
}
