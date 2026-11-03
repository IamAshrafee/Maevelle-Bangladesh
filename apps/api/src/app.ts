import { registerWishlistObservability } from './wishlist-observability.js';
import Fastify, { LogController } from 'fastify';
import { createHmac } from 'node:crypto';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyBaseLogger } from 'fastify';

import type { DatabaseClient } from '@maevelle/database';
import type { RuntimeConfig } from '@maevelle/config';
import { resolveCorrelationId } from '@maevelle/observability';
import { incrementAuthStorageValue } from '@maevelle/database/platform';
import type { ShopperAuthEmailSender } from './auth/shopper-auth.js';

import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';

export interface BuildApiOptions {
  readonly database: DatabaseClient;
  readonly config?: RuntimeConfig;
  readonly logger?: FastifyBaseLogger | false;
  /** Local test mailbox; production uses configured Resend delivery. */
  readonly shopperAuthEmailSender?: ShopperAuthEmailSender;
}

function matchesExpectedOrigin(
  origin: string,
  trustedOrigins: readonly string[],
  requestHost?: string,
  forwardedHost?: string | string[],
): boolean {
  try {
    const originUrl = new URL(origin);
    if (trustedOrigins.some((candidate) => candidate === originUrl.origin)) return true;
    if (originUrl.host === requestHost) return true;
    const fHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    if (fHost && originUrl.host === fHost.split(',')[0]?.trim()) return true;
    return false;
  } catch {
    return false;
  }
}

export function buildApi(options: BuildApiOptions) {
  const rateAttempts = new Map<string, { count: number; resetAt: number }>();
  const loggerOptions =
    options.logger === false
      ? { logger: false }
      : options.logger
        ? { loggerInstance: options.logger }
        : { logger: true };
  const app = Fastify({
    ...loggerOptions,
    // Cart paths can contain customer-specific coupon codes.
    logController: new LogController({
      disableRequestLogging: (request) => /^\/storefront\/v1\/carts(?:[/?]|$)/.test(request.url),
    }),
    bodyLimit: 1_048_576,
    routerOptions: { maxParamLength: 160 },
    genReqId: (request) => resolveCorrelationId(request.headers['x-correlation-id']),
  }).withTypeProvider<TypeBoxTypeProvider>();

  registerWishlistObservability(app, options.database, options.config?.storefrontOrganizationCode ?? 'maevelle');

  // Auth is bridged through Better Auth's Fetch handler; retaining JSON as text
  // prevents Fastify from consuming and reserializing credential payloads.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const rawBody = String(body);
    (request as typeof request & { rawBody?: string }).rawBody = rawBody;
    try {
      done(null, rawBody.trim() ? JSON.parse(rawBody) : undefined);
    } catch {
      done(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }));
    }
  });
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });
  // The dedicated local Media proxy is streamed; other binary endpoints retain their parser.
  app.addContentTypeParser('application/x-maevelle-media-upload', (_request, payload, done) => {
    done(null, payload);
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.headers({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    });
    const method = request.method.toUpperCase();
    const origin = request.headers.origin;
    const path = request.url.split('?', 1)[0] ?? '';
    const shopperPrivate = path.startsWith('/shopper-auth/')
      || path === '/storefront/v1/wishlist'
      || path === '/storefront/v1/wishlist/saved-state'
      || path === '/storefront/v1/wishlist/merges'
      || path.startsWith('/storefront/v1/wishlist/account-shares')
      || path.startsWith('/storefront/v1/wishlist/items/');
    const sharePath = path.startsWith('/storefront/v1/wishlist/shares');
    if (options.config && shopperPrivate && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (!origin || origin !== new URL(options.config.storefrontBaseUrl).origin
        || (request.headers['sec-fetch-site'] && !['same-origin', 'same-site', 'none'].includes(request.headers['sec-fetch-site'])))
        return reply.code(403).send({
          error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not trusted.' },
        });
      if (!request.headers['content-type']?.startsWith('application/json'))
        return reply.code(415).send({
          error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'JSON is required.' },
        });
    }
    if (options.config && sharePath && method === 'POST' && path !== '/storefront/v1/wishlist/shares/open') {
      if (request.headers.origin !== new URL(options.config.storefrontBaseUrl).origin)
        return reply.code(403).send({ error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not trusted.' } });
      if (!request.headers['content-type']?.startsWith('application/json'))
        return reply.code(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'JSON is required.' } });
    }
    if (options.config && (shopperPrivate || sharePath)) {
      const policy = path.startsWith('/shopper-auth/sign-up/') ? { maximum: 5, seconds: 3600 }
        : path.startsWith('/shopper-auth/sign-in/') ? { maximum: 12, seconds: 900 }
        : path.startsWith('/shopper-auth/send-verification-email')
          || path.startsWith('/shopper-auth/request-password-reset')
          ? { maximum: 5, seconds: 3600 }
        : sharePath ? { maximum: path.endsWith('/open') ? 120 : 30, seconds: 3600 }
        : path.startsWith('/storefront/v1/wishlist/items/')
          ? { maximum: 120, seconds: 60 }
        : { maximum: 120, seconds: 60 };
      const key = createHmac('sha256', options.config.betterAuthSecret)
        .update(`shopper-rate:v1:${request.ip}:${path.replace(/\/[0-9a-f-]{36}$/i, '/:id')}`)
        .digest('hex');
      let attempts: number;
      try {
        attempts = await incrementAuthStorageValue(options.database.db, key, policy.seconds);
      } catch (error) {
        request.log.error({ err: error, path }, 'shopper rate limiter unavailable');
        return reply.code(503).send({
          error: { code: 'UNAVAILABLE', message: 'Request protection is temporarily unavailable.' },
        });
      }
      if (attempts > policy.maximum) {
        reply.header('retry-after', String(policy.seconds));
        return reply.code(429).send({
          error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try later.' },
        });
      }
    }
    if (
      options.config &&
      origin &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
      (request.url.startsWith('/admin/') || request.url.startsWith('/invitations/'))
    ) {
      const trustedOrigins = [
        new URL(options.config.authBaseUrl).origin,
        ...(options.config.authTrustedOrigins ?? []),
      ];
      if (
        !matchesExpectedOrigin(
          origin,
          trustedOrigins,
          request.headers.host,
          request.headers['x-forwarded-host'],
        )
      )
        return reply.code(403).send({
          error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not trusted.' },
        });
    }
    if (
      options.config &&
      origin &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
      request.url.startsWith('/storefront/v1/chat/')
    ) {
      const trustedOrigins = [
        new URL(options.config.storefrontBaseUrl).origin,
        ...(options.config.authTrustedOrigins ?? []),
      ];
      if (
        !matchesExpectedOrigin(
          origin,
          trustedOrigins,
          request.headers.host,
          request.headers['x-forwarded-host'],
        )
      )
        return reply.code(403).send({
          error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not trusted.' },
        });
    }
    const limits = [
      { prefix: '/auth/', maximum: 20 },
      { prefix: '/invitations/', maximum: 12 },
      { prefix: '/storefront/v1/reviews', maximum: 15 },
      { prefix: '/storefront/v1/analytics/events', maximum: 120 },
      { prefix: '/storefront/v1/orders/confirmation', maximum: 60 },
      { prefix: '/integrations/', maximum: 120 },
      { prefix: '/webhooks/resend', maximum: 240 },
      { prefix: '/webhooks/meta/', maximum: 600 },
      { prefix: '/admin/email/', maximum: 120 },
      { prefix: '/admin/sms/', maximum: 60 },
      { prefix: '/admin/integrity/', maximum: 30 },
      { prefix: '/admin/messaging/', maximum: 180 },
      { prefix: '/storefront/v1/chat/', maximum: 120 },
      { prefix: '/webhooks/sms/', maximum: 240 },
    ];
    const policy = limits.find((candidate) => request.url.startsWith(candidate.prefix));
    if (!policy) return;
    const key = `${request.ip}:${policy.prefix}`;
    const now = Date.now();
    const current = rateAttempts.get(key);
    const state =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
    state.count += 1;
    rateAttempts.set(key, state);
    if (state.count > policy.maximum) {
      reply.header('retry-after', String(Math.ceil((state.resetAt - now) / 1000)));
      return reply
        .code(429)
        .send({ error: { code: 'RATE_LIMITED', message: 'Too many attempts.' } });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'validation' in error &&
      Array.isArray(error.validation)
    )
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          requestId: request.id,
        },
      });
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY'
    )
      return reply.status(400).send({
        error: {
          code: 'EMPTY_BODY',
          message: 'Request body cannot be empty.',
          requestId: request.id,
        },
      });
    request.log.error({ err: error, requestId: request.id }, 'Unhandled API request error.');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method}:${request.url} was not found.`,
        requestId: request.id,
      },
    });
  });

  registerHealthRoutes(app, options.database);
  if (options.config) {
    registerAuthRoutes(app, options.config, options.database, options.shopperAuthEmailSender);
  }

  return app;
}
