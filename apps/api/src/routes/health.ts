import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';

const healthyResponse = Type.Object({
  status: Type.Literal('ok'),
});

const unavailableResponse = Type.Object({
  status: Type.Literal('unavailable'),
});

export function registerHealthRoutes(app: FastifyInstance, database: DatabaseClient): void {
  app.get(
    '/health/live',
    {
      schema: {
        response: {
          200: healthyResponse,
        },
      },
    },
    async () => ({ status: 'ok' }),
  );

  app.get(
    '/health/ready',
    {
      schema: {
        response: {
          200: healthyResponse,
          503: unavailableResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        await database.ping();
        return { status: 'ok' };
      } catch (error) {
        request.log.error({ err: error }, 'PostgreSQL readiness check failed.');
        return reply.code(503).send({ status: 'unavailable' });
      }
    },
  );
}
