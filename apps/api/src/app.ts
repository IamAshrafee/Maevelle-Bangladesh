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
  const authAttempts = new Map<string, { count: number; resetAt: number }>();
  const loggerOptions =
    options.logger === false
      ? { logger: false }
      : options.logger
        ? { loggerInstance: options.logger }
        : { logger: true };
  const app = Fastify({
    ...loggerOptions,
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
    if (!request.url.startsWith('/auth/')) return;
    const key = `${request.ip}:${request.url.split('?')[0]}`;
    const now = Date.now();
    const current = authAttempts.get(key);
    const state =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
    state.count += 1;
    authAttempts.set(key, state);
    if (state.count > 20) {
      reply.header('retry-after', String(Math.ceil((state.resetAt - now) / 1000)));
      return reply
        .code(429)
        .send({ error: { code: 'RATE_LIMITED', message: 'Too many attempts.' } });
    }
  });

  app.setErrorHandler((error, request, reply) => {
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
