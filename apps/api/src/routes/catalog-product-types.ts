import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  createManagedCatalogAttribute,
  createManagedCatalogReferenceOption,
  listManagedCatalogProductTypes,
  updateManagedCatalogAttribute,
  updateManagedCatalogProductType,
  updateManagedCatalogReferenceOption,
  type CatalogAttributeScope,
  type CatalogAttributeValueType,
  type CatalogDefinitionStatus,
} from '@maevelle/database/catalog-product-types';

import {
  type CatalogAuth,
  requireCatalogCapability,
  sendCatalogDomainError,
} from './catalog-support.js';

const uuid = Type.String({
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
});
const slug = Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' });
const status = Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')]);
const valueType = Type.Union([
  Type.Literal('TEXT'),
  Type.Literal('INTEGER'),
  Type.Literal('DECIMAL'),
  Type.Literal('BOOLEAN'),
  Type.Literal('DATE'),
  Type.Literal('REFERENCE'),
]);
const scope = Type.Union([Type.Literal('PRODUCT'), Type.Literal('VARIANT')]);

export function registerCatalogProductTypeRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: CatalogAuth,
): void {
  app.get('/admin/catalog/product-type-definitions', async (request, reply) => {
    const context = await requireCatalogCapability(database, auth, request.headers, 'catalog.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listManagedCatalogProductTypes(database.db, context.organizationId) };
  });

  app.patch(
    '/admin/catalog/product-types/:productTypeId',
    {
      schema: {
        params: Type.Object({ productTypeId: uuid }),
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          name: Type.String({ minLength: 1, maxLength: 120 }),
          status,
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
          name: string;
          status: CatalogDefinitionStatus;
        };
        await updateManagedCatalogProductType(database.db, {
          ...context,
          productTypeId: (request.params as { productTypeId: string }).productTypeId,
          expectedVersion: body.version,
          name: body.name,
          status: body.status,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );

  app.post(
    '/admin/catalog/product-types/:productTypeId/attributes',
    {
      schema: {
        params: Type.Object({ productTypeId: uuid }),
        body: Type.Object({
          code: slug,
          name: Type.String({ minLength: 1, maxLength: 120 }),
          valueType,
          scope,
          required: Type.Optional(Type.Boolean()),
          filterable: Type.Optional(Type.Boolean()),
          searchable: Type.Optional(Type.Boolean()),
          referenceOptions: Type.Optional(
            Type.Array(
              Type.Object({
                code: slug,
                label: Type.String({ minLength: 1, maxLength: 120 }),
                position: Type.Optional(Type.Integer({ minimum: 0 })),
              }),
              { maxItems: 100 },
            ),
          ),
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
          data: await createManagedCatalogAttribute(database.db, {
            ...context,
            productTypeId: (request.params as { productTypeId: string }).productTypeId,
            ...(request.body as {
              code: string;
              name: string;
              valueType: CatalogAttributeValueType;
              scope: CatalogAttributeScope;
              required?: boolean;
              filterable?: boolean;
              searchable?: boolean;
              referenceOptions?: { code: string; label: string; position?: number }[];
            }),
          }),
        });
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/catalog/product-types/:productTypeId/attributes/:attributeId',
    {
      schema: {
        params: Type.Object({ productTypeId: uuid, attributeId: uuid }),
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          name: Type.String({ minLength: 1, maxLength: 120 }),
          status,
          required: Type.Boolean(),
          filterable: Type.Boolean(),
          searchable: Type.Boolean(),
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
        const params = request.params as { productTypeId: string; attributeId: string };
        const body = request.body as {
          version: number;
          name: string;
          status: CatalogDefinitionStatus;
          required: boolean;
          filterable: boolean;
          searchable: boolean;
        };
        await updateManagedCatalogAttribute(database.db, {
          ...context,
          ...params,
          expectedVersion: body.version,
          name: body.name,
          status: body.status,
          required: body.required,
          filterable: body.filterable,
          searchable: body.searchable,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );

  app.post(
    '/admin/catalog/attributes/:attributeId/reference-options',
    {
      schema: {
        params: Type.Object({ attributeId: uuid }),
        body: Type.Object({
          code: slug,
          label: Type.String({ minLength: 1, maxLength: 120 }),
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
          data: await createManagedCatalogReferenceOption(database.db, {
            ...context,
            attributeId: (request.params as { attributeId: string }).attributeId,
            ...(request.body as { code: string; label: string; position?: number }),
          }),
        });
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/catalog/attributes/:attributeId/reference-options/:optionId',
    {
      schema: {
        params: Type.Object({ attributeId: uuid, optionId: uuid }),
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          label: Type.String({ minLength: 1, maxLength: 120 }),
          status,
          position: Type.Integer({ minimum: 0 }),
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
        const params = request.params as { attributeId: string; optionId: string };
        const body = request.body as {
          version: number;
          label: string;
          status: CatalogDefinitionStatus;
          position: number;
        };
        await updateManagedCatalogReferenceOption(database.db, {
          ...context,
          ...params,
          expectedVersion: body.version,
          label: body.label,
          status: body.status,
          position: body.position,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendCatalogDomainError(reply, error);
      }
    },
  );
}
