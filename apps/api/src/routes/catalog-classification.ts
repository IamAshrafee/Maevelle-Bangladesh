import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  createCatalogVocabularyItem,
  createManagedCategory,
  listCatalogCategories,
  listCatalogVocabulary,
  setCatalogProductVocabulary,
  updateCatalogVocabularyItem,
  updateManagedCategory,
  type CatalogClassificationStatus,
  type CatalogVocabularyKind,
} from '@maevelle/database/catalog-classification';

import {
  type CatalogAuth,
  requireCatalogCapability,
  sendCatalogDomainError,
} from './catalog-support.js';

const status = Type.Union([
  Type.Literal('ACTIVE'),
  Type.Literal('INACTIVE'),
  Type.Literal('ARCHIVED'),
]);
const kind = Type.Union([
  Type.Literal('TAG'),
  Type.Literal('OCCASION'),
  Type.Literal('COLLECTION'),
]);
const slug = Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' });
const listQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 5, maximum: 100 })),
  q: Type.Optional(Type.String({ maxLength: 120 })),
  status: Type.Optional(Type.Union([status, Type.Literal('ALL')])),
});

export function registerCatalogClassificationRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: CatalogAuth,
): void {
  app.get(
    '/admin/catalog/category-tree',
    { schema: { querystring: listQuery } },
    async (request, reply) => {
      const context = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'catalog.view',
      );
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as {
        page?: number;
        pageSize?: number;
        q?: string;
        status?: CatalogClassificationStatus | 'ALL';
      };
      return {
        data: await listCatalogCategories(database.db, {
          organizationId: context.organizationId,
          ...(query.page === undefined ? {} : { page: query.page }),
          ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.q === undefined ? {} : { query: query.q }),
        }),
      };
    },
  );

  app.post(
    '/admin/catalog/categories',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1 }),
          handle: slug,
          parentCategoryId: Type.Optional(Type.String()),
          status: Type.Optional(status),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'catalog.manage',
      );
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createManagedCategory(database.db, {
            ...context,
            ...(request.body as {
              name: string;
              handle: string;
              parentCategoryId?: string;
              status?: CatalogClassificationStatus;
              position?: number;
            }),
          }),
        });
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/catalog/categories/:categoryId',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          name: Type.Optional(Type.String({ minLength: 1 })),
          handle: Type.Optional(slug),
          status: Type.Optional(status),
          parentCategoryId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'catalog.manage',
      );
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          version: number;
          name?: string;
          handle?: string;
          status?: CatalogClassificationStatus;
          parentCategoryId?: string | null;
          position?: number;
        };
        const { version, ...changes } = body;
        await updateManagedCategory(database.db, {
          ...context,
          ...changes,
          categoryId: (request.params as { categoryId: string }).categoryId,
          expectedVersion: version,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );

  app.get(
    '/admin/catalog/vocabulary/:kind',
    { schema: { params: Type.Object({ kind }), querystring: listQuery } },
    async (request, reply) => {
      const context = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'catalog.view',
      );
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as {
        page?: number;
        pageSize?: number;
        q?: string;
        status?: CatalogClassificationStatus | 'ALL';
      };
      return {
        data: await listCatalogVocabulary(database.db, {
          organizationId: context.organizationId,
          kind: (request.params as { kind: CatalogVocabularyKind }).kind,
          ...(query.page === undefined ? {} : { page: query.page }),
          ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.q === undefined ? {} : { query: query.q }),
        }),
      };
    },
  );

  app.post(
    '/admin/catalog/vocabulary/:kind',
    {
      schema: {
        params: Type.Object({ kind }),
        body: Type.Object({
          name: Type.String({ minLength: 1 }),
          handle: slug,
          description: Type.Optional(Type.String()),
          status: Type.Optional(status),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'catalog.manage',
      );
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createCatalogVocabularyItem(database.db, {
            ...context,
            kind: (request.params as { kind: CatalogVocabularyKind }).kind,
            ...(request.body as {
              name: string;
              handle: string;
              description?: string;
              status?: CatalogClassificationStatus;
              position?: number;
            }),
          }),
        });
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/catalog/vocabulary/:kind/:itemId',
    {
      schema: {
        params: Type.Object({ kind, itemId: Type.String() }),
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          name: Type.String({ minLength: 1 }),
          handle: slug,
          description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          status,
          position: Type.Optional(Type.Integer({ minimum: 0 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'catalog.manage',
      );
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const params = request.params as { kind: CatalogVocabularyKind; itemId: string };
        const body = request.body as {
          version: number;
          name: string;
          handle: string;
          description?: string | null;
          status: CatalogClassificationStatus;
          position?: number;
        };
        const { version, ...changes } = body;
        await updateCatalogVocabularyItem(database.db, {
          ...context,
          ...params,
          ...changes,
          expectedVersion: version,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );

  app.put(
    '/admin/catalog/products/:productId/vocabulary',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          tagIds: Type.Array(Type.String()),
          occasionIds: Type.Array(Type.String()),
          collectionIds: Type.Array(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'catalog.manage',
      );
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          version: number;
          tagIds: string[];
          occasionIds: string[];
          collectionIds: string[];
        };
        await setCatalogProductVocabulary(database.db, {
          ...context,
          productId: (request.params as { productId: string }).productId,
          expectedVersion: body.version,
          tagIds: body.tagIds,
          occasionIds: body.occasionIds,
          collectionIds: body.collectionIds,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );
}
