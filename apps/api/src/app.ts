import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyBaseLogger } from 'fastify';

import type { DatabaseClient } from '@maevelle/database';
import type { RuntimeConfig } from '@maevelle/config';
import { resolveCorrelationId } from '@maevelle/observability';

import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';

export interface BuildApiOptions {
  readonly database: DatabaseClient;
  readonly config?: RuntimeConfig;
  readonly logger?: FastifyBaseLogger | false;
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
    bodyLimit: 1_048_576,
    genReqId: (request) => resolveCorrelationId(request.headers['x-correlation-id']),
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Auth is bridged through Better Auth's Fetch handler; retaining JSON as text
  // prevents Fastify from consuming and reserializing credential payloads.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    try {
      done(null, JSON.parse(String(body)));
    } catch {
      done(new Error('Request body must be valid JSON.'));
    }
  });
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
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
    if (
      options.config &&
      origin &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
      request.url.startsWith('/admin/')
    ) {
      const trustedOrigin = new URL(options.config.authBaseUrl).origin;
      const sameHost = new URL(origin).host === request.headers.host;
      if (origin !== trustedOrigin && !sameHost)
        return reply.code(403).send({
          error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not trusted.' },
        });
    }
    const limits = [
      { prefix: '/auth/', maximum: 20 },
      { prefix: '/storefront/v1/reviews', maximum: 15 },
      { prefix: '/storefront/v1/orders/confirmation', maximum: 60 },
      { prefix: '/integrations/', maximum: 120 },
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
    request.log.error({ err: error, requestId: request.id }, 'Unhandled API request error.');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId: request.id,
      },
    });
  });

  registerHealthRoutes(app, options.database);
  if (options.config) {
    registerAuthRoutes(app, options.config, options.database);
  }

  return app;
}
