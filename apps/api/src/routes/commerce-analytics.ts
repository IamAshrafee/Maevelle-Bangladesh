import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import { AnalyticsQueryError, getCommerceMeasurementReport } from '@maevelle/database/analytics';
import type { createAuth } from '../auth/auth.js';
import { analyticsAdmin } from './analytics-admin.js';

export function registerCommerceAnalyticsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: ReturnType<typeof createAuth>,
) {
  app.get(
    '/admin/analytics/commerce',
    {
      preValidation: async (request, reply) => {
        if (
          Object.keys(request.query as object).some(
            (key) => !['from', 'to', 'currency', 'trafficClass'].includes(key),
          )
        )
          return reply.code(400).send({
            error: { code: 'INVALID_ANALYTICS_QUERY', message: 'Unsupported query parameter.' },
          });
      },
      schema: {
        querystring: Type.Object(
          {
            from: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
            to: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
            currency: Type.Optional(Type.String({ pattern: '^[A-Z]{3}$' })),
            trafficClass: Type.Optional(
              Type.Union([
                Type.Literal('BUSINESS'),
                Type.Literal('SYNTHETIC'),
                Type.Literal('UNCLASSIFIED'),
              ]),
            ),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const active = await analyticsAdmin(
        database,
        auth,
        request.headers,
        'analytics.financial.view',
      );
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const visible = await analyticsAdmin(
        database,
        auth,
        { ...request.headers, 'x-organization-id': active.organizationId },
        'analytics.view',
      );
      if (!visible || visible.actorId !== active.actorId)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await getCommerceMeasurementReport(
            database.db,
            active.organizationId,
            request.query as Parameters<typeof getCommerceMeasurementReport>[2],
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
