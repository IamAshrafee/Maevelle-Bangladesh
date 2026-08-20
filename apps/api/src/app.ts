import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyBaseLogger } from 'fastify';

import type { DatabaseClient } from '@maevelle/database';
import { resolveCorrelationId } from '@maevelle/observability';

import { registerHealthRoutes } from './routes/health.js';

export interface BuildApiOptions {
  readonly database: DatabaseClient;
  readonly logger?: FastifyBaseLogger | false;
}

export function buildApi(options: BuildApiOptions) {
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

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
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

  return app;
}
