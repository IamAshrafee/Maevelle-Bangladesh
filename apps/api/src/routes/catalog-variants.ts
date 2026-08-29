import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import { getCatalogVariantMatrix } from '@maevelle/database/catalog-variants';

import type { CatalogAuth } from './catalog-support.js';
import { requireCatalogCapability, sendCatalogDomainError } from './catalog-support.js';

const uuid = Type.String({
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
});

export function registerCatalogVariantRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: CatalogAuth,
): void {
  app.get(
    '/admin/catalog/products/:productId/variant-matrix',
    {
      schema: {
        params: Type.Object({ productId: uuid }),
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 10, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'catalog.view',
      );
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await getCatalogVariantMatrix(database.db, {
            organizationId: context.organizationId,
            productId: (request.params as { productId: string }).productId,
            ...(request.query as { page?: number; pageSize?: number }),
          }),
        };
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );
}
