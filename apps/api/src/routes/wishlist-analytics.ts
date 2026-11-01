import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import {
  getWishlistAnalytics,
  AnalyticsQueryError,
  type WishlistReport,
} from '@maevelle/database/analytics';
import type { WishlistAnalyticsQueryDto } from '@maevelle/contracts';
import type { createAuth } from '../auth/auth.js';
import { analyticsAdmin } from './analytics-admin.js';
import { wishlistResponseSchema } from './wishlist-analytics-schemas.js';

export function registerWishlistAnalyticsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: ReturnType<typeof createAuth>,
): void {
  for (const report of [
    'summary',
    'activity',
    'products',
    'categories',
    'sharing',
    'operations',
  ] as const) {
    app.get(
      `/admin/analytics/wishlist/${report}`,
      {
        schema: {
          response: {
            200: wishlistResponseSchema(report),
            403: Type.Object({
              error: Type.Object({ code: Type.String(), message: Type.String() }),
            }),
            422: Type.Object({
              error: Type.Object({ code: Type.String(), message: Type.String() }),
            }),
          },
          querystring: Type.Object(
            {
              from: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
              to: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
              page: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
              pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
            },
            { additionalProperties: false },
          ),
        },
        preValidation: async (request, reply) => {
          if (
            Object.keys(request.query as object).some(
              (key) => !['from', 'to', 'page', 'pageSize'].includes(key),
            )
          )
            return reply
              .code(422)
              .send({
                error: { code: 'INVALID_ANALYTICS_QUERY', message: 'Unsupported query parameter.' },
              });
        },
      },
      async (request, reply) => {
        reply.header('cache-control', 'private, no-store');
        const active = await analyticsAdmin(database, auth, request.headers, 'analytics.view');
        if (!active)
          return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
        try {
          return {
            data: await getWishlistAnalytics(
              database.db,
              active.organizationId,
              report as WishlistReport,
              request.query as WishlistAnalyticsQueryDto,
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
}
