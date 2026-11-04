import { createHmac } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RuntimeConfig } from '@maevelle/config';
import { sql, type DatabaseClient } from '@maevelle/database';
import { hashToken } from '@maevelle/security';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import { incrementAuthStorageValue } from '@maevelle/database/platform';
import { hasShopperSessionCookie } from '../auth/shopper-partition.js';
import { rateLimitClientIp } from '../rate-limit-client.js';

/** No public legacy purchase writer survives the replacement foundation. */
export function containLegacyCheckoutRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  config?: RuntimeConfig,
) {
  app.addHook('onRoute', (route) => {
    const draft = route.url.startsWith('/storefront/v1/checkouts/current');
    const tracking = route.url === '/storefront/v1/orders/track';
    const confirmation = route.url.startsWith('/storefront/v1/orders/confirmation');
    if (!draft && !tracking && !confirmation) return;
    const protect = async (request: FastifyRequest, reply: FastifyReply) => {
      reply
        .header('cache-control', 'private, no-store')
        .header('referrer-policy', 'no-referrer')
        .header('vary', 'Cookie');
      const deny = (status: number, code: string, message: string) =>
        reply.code(status).send({ error: { code, message } });
      if (draft || tracking)
        return deny(
          503,
          'CHECKOUT_DISABLED',
          'This legacy Checkout operation is unavailable. Your Bag is unchanged.',
        );
      if (!config) return deny(503, 'UNAVAILABLE', 'Order access is unavailable.');
      if (
        !['GET', 'HEAD'].includes(request.method) &&
        (request.headers.origin !== new URL(config.storefrontBaseUrl).origin ||
          (request.headers['sec-fetch-site'] &&
            !['same-origin', 'same-site', 'none'].includes(request.headers['sec-fetch-site'])) ||
          request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !==
            'application/json')
      )
        return deny(403, 'ORIGIN_REJECTED', 'Request origin is not trusted.');
      if (hasShopperSessionCookie(request.headers.cookie))
        return deny(401, 'SESSION_EXPIRED', 'Use authorized Order recovery.');
      const values = (request.headers.cookie ?? '')
        .split(';')
        .map((p) => p.trim())
        .filter((p) => p.startsWith('maevelle_checkout='));
      const token = values[0]?.slice('maevelle_checkout='.length);
      if (values.length !== 1 || !token || !/^[A-Za-z0-9_-]{43}$/.test(token))
        return deny(404, 'NOT_FOUND', 'Order was not found.');
      try {
        const ip = rateLimitClientIp(request, config.apiTrustedGatewayIp);
        if (!ip) return deny(503, 'UNAVAILABLE', 'Order protection is unavailable.');
        const bucket = createHmac('sha256', config.betterAuthSecret)
          .update(`checkout-legacy:${config.storefrontOrganizationCode}:${ip}`)
          .digest('hex');
        if ((await incrementAuthStorageValue(database.db, bucket, 60)) > 60) {
          reply.header('retry-after', '60');
          return deny(429, 'RATE_LIMITED', 'Try again shortly.');
        }
        const context = await resolveStorefrontContext(
          database.db,
          config.storefrontOrganizationCode,
        );
        if (!context) return deny(503, 'UNAVAILABLE', 'Order access is unavailable.');
        const rows = await sql`select checkout.id from orders.checkout_sessions checkout
          join orders.orders o on o.organization_id=checkout.organization_id and o.id=checkout.resulting_order_id
          where checkout.organization_id=${context.organizationId} and checkout.public_token_hash=${hashToken(token)}
            and checkout.status='ORDER_PLACED' and checkout.expires_at>clock_timestamp()`.execute(
          database.db,
        );
        if (!rows.rows.length) return deny(404, 'NOT_FOUND', 'Order was not found.');
      } catch {
        return deny(503, 'UNAVAILABLE', 'Order access is temporarily unavailable.');
      }
    };
    route.onRequest = [
      protect,
      ...(Array.isArray(route.onRequest)
        ? route.onRequest
        : route.onRequest
          ? [route.onRequest]
          : []),
    ];
  });
}
