import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { CartAnalyticsQueryDto } from '@maevelle/contracts';
import type { DatabaseClient } from '@maevelle/database';
import { AnalyticsQueryError, getAdminCartAnalytics } from '@maevelle/database/analytics';
import type { createAuth } from '../auth/auth.js';
import { analyticsAdmin } from './analytics-admin.js';

export function registerCartAnalyticsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: ReturnType<typeof createAuth>,
): void {
  const querystring = Type.Object(
    {
      from: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
      to: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
      currency: Type.Optional(Type.String({ pattern: '^[A-Z]{3}$' })),
    },
    { additionalProperties: false },
  );

  app.get(
    '/admin/analytics/cart',
    {
      schema: { querystring },
      attachValidation: true,
      preValidation: async (request, reply) => {
        if (
          Object.keys(request.query as object).some(
            (key) => !['from', 'to', 'currency'].includes(key),
          )
        )
          return reply.code(422).send({
            error: { code: 'INVALID_ANALYTICS_QUERY', message: 'Unsupported query parameter.' },
          });
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const active = await analyticsAdmin(database, auth, request.headers, 'analytics.view');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      if (request.validationError)
        return reply.code(422).send({
          error: {
            code: 'INVALID_ANALYTICS_QUERY',
            message: 'Enter valid dates and an optional three-letter currency.',
          },
        });
      try {
        return {
          data: await getAdminCartAnalytics(
            database.db,
            active.organizationId,
            request.query as CartAnalyticsQueryDto,
          ),
        };
      } catch (error) {
        if (error instanceof AnalyticsQueryError)
          return reply.code(422).send({ error: { code: error.code, message: error.message } });
        throw error;
      }
    },
  );
}
