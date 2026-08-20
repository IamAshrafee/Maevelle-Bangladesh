import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyServerOptions } from 'fastify';

import type { DatabaseClient } from '@maevelle/database';

import { registerHealthRoutes } from './routes/health.js';

export interface BuildApiOptions {
  readonly database: DatabaseClient;
  readonly logger?: FastifyServerOptions['logger'];
}

export function buildApi(options: BuildApiOptions) {
  const app = Fastify({ logger: options.logger ?? true }).withTypeProvider<TypeBoxTypeProvider>();

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
