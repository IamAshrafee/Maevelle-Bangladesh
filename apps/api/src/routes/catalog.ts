import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type {
  CatalogProductContentUpdateDto,
  CatalogProductCreateDto,
  CatalogProductUpdateDto,
  CatalogVariantCreateDto,
  CatalogVariantUpdateDto,
} from '@maevelle/contracts';
import type { DatabaseClient } from '@maevelle/database';
import {
  createProductOptionAxis,
  createProductOptionValue,
  archiveCatalogProduct,
  createCatalogColor,
  createCatalogProduct,
  createCatalogVariant,
  createCatalogVariants,
  getCatalogProductWorkspace,
  getStorefrontCatalogProduct,
  listCatalogCategoryChoices,
  listStorefrontCatalogProducts,
  listCatalogProductWorkItems,
  listCatalogProducts,
  listCatalogVariantChoices,
  listCatalogProductTypes,
  listCatalogColors,
  publishCatalogProduct,
  replaceCatalogProductContent,
  restoreCatalogProduct,
  setCatalogProductAttributes,
  setCatalogProductCategories,
  unpublishCatalogProduct,
  updateCatalogProduct,
  updateCatalogColor,
  updateCatalogVariant,
  updateProductOptionAxis,
  updateProductOptionValue,
} from '@maevelle/database/catalog';
import { createManagedCatalogProductType } from '@maevelle/database/catalog-product-types';
import { getPublicSizeGuideForProduct } from '@maevelle/database/sizing';
import { resolveVariantPrice } from '@maevelle/database/pricing';
import {
  listPublicCategories,
  rebuildStorefrontSearch,
  resolveProductRedirect,
  searchStorefront,
  resolveStorefrontContext,
} from '@maevelle/database/storefront';

import { registerCatalogClassificationRoutes } from './catalog-classification.js';
import { registerCatalogProductTypeRoutes } from './catalog-product-types.js';
import { registerCatalogVariantRoutes } from './catalog-variants.js';
import {
  type CatalogAuth as Auth,
  requireCatalogCapability as requireCapability,
  sendCatalogDomainError as domainError,
} from './catalog-support.js';
const organizationIdParameter = Type.String({
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
});
const variantWriteSchema = Type.Object({
  sku: Type.String({ minLength: 1, maxLength: 120 }),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 180 })),
  optionValueIds: Type.Array(organizationIdParameter, { maxItems: 8, uniqueItems: true }),
  barcode: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  primaryColorId: Type.Optional(organizationIdParameter),
  associatedColorIds: Type.Optional(
    Type.Array(organizationIdParameter, { maxItems: 12, uniqueItems: true }),
  ),
  weight: Type.Optional(
    Type.Object({
      value: Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' }),
      unit: Type.Union([
        Type.Literal('G'),
        Type.Literal('KG'),
        Type.Literal('OZ'),
        Type.Literal('LB'),
      ]),
    }),
  ),
  dimensions: Type.Optional(
    Type.Object({
      length: Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' }),
      width: Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' }),
      height: Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' }),
      unit: Type.Union([Type.Literal('MM'), Type.Literal('CM'), Type.Literal('IN')]),
    }),
  ),
});

function expectedVersion(header: string | string[] | undefined): number | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  const number = Number(value?.replaceAll('"', ''));
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

export function registerCatalogRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  storefrontOrganizationCode = 'maevelle',
): void {
  registerCatalogClassificationRoutes(app, database, auth);
  registerCatalogProductTypeRoutes(app, database, auth);
  registerCatalogVariantRoutes(app, database, auth);
  app.get('/storefront/v1/context', async (_request, reply) => {
    const context = await resolveStorefrontContext(database.db, storefrontOrganizationCode);
    if (!context)
      return reply.code(503).send({
        error: { code: 'STOREFRONT_UNAVAILABLE', message: 'The Storefront is not configured.' },
      });
    return { data: context };
  });

  app.get('/admin/catalog/product-types', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'catalog.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listCatalogProductTypes(database.db, context.organizationId) };
  });

  app.get('/admin/catalog/colors', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'catalog.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listCatalogColors(database.db, context.organizationId) };
  });

  app.post(
    '/admin/catalog/colors',
    {
      schema: {
        body: Type.Object({
          code: Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
          name: Type.String({ minLength: 1, maxLength: 120 }),
          hexValue: Type.Optional(
            Type.Union([Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }), Type.Null()]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createCatalogColor(database.db, {
            organizationId: context.organizationId,
            ...(request.body as { code: string; name: string; hexValue?: string | null }),
          }),
        });
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/catalog/colors/:colorId',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          hexValue: Type.Optional(
            Type.Union([Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }), Type.Null()]),
          ),
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')])),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          version: number;
          name?: string;
          hexValue?: string | null;
          status?: 'ACTIVE' | 'ARCHIVED';
        };
        return {
          data: await updateCatalogColor(database.db, {
            organizationId: context.organizationId,
            colorId: (request.params as { colorId: string }).colorId,
            expectedVersion: body.version,
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.hexValue !== undefined ? { hexValue: body.hexValue } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
          }),
        };
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.get('/admin/catalog/categories', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'catalog.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listCatalogCategoryChoices(database.db, context.organizationId) };
  });

  app.post(
    '/admin/catalog/product-types',
    {
      schema: {
        body: Type.Object({
          code: Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
          name: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createManagedCatalogProductType(database.db, {
            ...context,
            ...(request.body as { code: string; name: string }),
          }),
        });
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );
  app.get('/admin/catalog/products', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'catalog.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listCatalogProducts(database.db, context.organizationId) };
  });

  app.get(
    '/admin/catalog/product-work-items',
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String({ maxLength: 120 })),
          status: Type.Optional(
            Type.Union([
              Type.Literal('ALL'),
              Type.Literal('DRAFT'),
              Type.Literal('ACTIVE'),
              Type.Literal('ARCHIVED'),
              Type.Literal('PUBLISHED'),
            ]),
          ),
          productTypeId: Type.Optional(organizationIdParameter),
          readiness: Type.Optional(
            Type.Union([
              Type.Literal('ALL'),
              Type.Literal('READY'),
              Type.Literal('BLOCKED'),
              Type.Literal('PUBLISHED'),
              Type.Literal('ATTENTION'),
            ]),
          ),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 10, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.view');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as {
        q?: string;
        status?: 'ALL' | 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'PUBLISHED';
        productTypeId?: string;
        readiness?: 'ALL' | 'READY' | 'BLOCKED' | 'PUBLISHED' | 'ATTENTION';
        page?: number;
        pageSize?: number;
      };
      return {
        data: await listCatalogProductWorkItems(database.db, {
          organizationId: context.organizationId,
          ...query,
        }),
      };
    },
  );

  app.get('/admin/catalog/variants', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'catalog.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listCatalogVariantChoices(database.db, context.organizationId) };
  });

  app.put(
    '/admin/catalog/products/:productId/categories',
    {
      schema: {
        body: Type.Object({
          categoryIds: Type.Array(organizationIdParameter, {
            maxItems: 50,
            uniqueItems: true,
          }),
          primaryCategoryId: Type.Optional(Type.Union([organizationIdParameter, Type.Null()])),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      const version = expectedVersion(request.headers['if-match']);
      if (!version)
        return reply.code(428).send({
          error: {
            code: 'PRECONDITION_REQUIRED',
            message: 'If-Match must contain the current Product version.',
          },
        });
      try {
        const body = request.body as {
          categoryIds: string[];
          primaryCategoryId?: string | null;
        };
        return {
          data: await setCatalogProductCategories(database.db, {
            ...body,
            organizationId: context.organizationId,
            actorId: context.actorId,
            productId: (request.params as { productId: string }).productId,
            expectedVersion: version,
          }),
        };
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.put(
    '/admin/catalog/products/:productId/attributes',
    {
      schema: {
        body: Type.Object({
          values: Type.Array(
            Type.Object({
              attributeDefinitionId: organizationIdParameter,
              value: Type.Union([Type.String({ maxLength: 2000 }), Type.Boolean(), Type.Null()]),
            }),
            { maxItems: 100 },
          ),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      const version = expectedVersion(request.headers['if-match']);
      if (!version)
        return reply.code(428).send({
          error: {
            code: 'PRECONDITION_REQUIRED',
            message: 'If-Match must contain the current Product version.',
          },
        });
      try {
        const body = request.body as {
          values: { attributeDefinitionId: string; value: string | boolean | null }[];
        };
        return {
          data: await setCatalogProductAttributes(database.db, {
            ...body,
            organizationId: context.organizationId,
            actorId: context.actorId,
            productId: (request.params as { productId: string }).productId,
            expectedVersion: version,
          }),
        };
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.put(
    '/admin/catalog/products/:productId/content',
    {
      schema: {
        body: Type.Object({
          informationGroups: Type.Array(
            Type.Object({
              title: Type.String({ maxLength: 120 }),
              items: Type.Array(
                Type.Object({
                  label: Type.String({ maxLength: 120 }),
                  value: Type.String({ maxLength: 2000 }),
                }),
                { minItems: 1, maxItems: 24 },
              ),
            }),
            { maxItems: 12 },
          ),
          faqs: Type.Array(
            Type.Object({
              question: Type.String({ maxLength: 300 }),
              answer: Type.String({ maxLength: 3000 }),
            }),
            { maxItems: 30 },
          ),
          seoTitle: Type.Union([Type.String({ maxLength: 180 }), Type.Null()]),
          seoDescription: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      const version = expectedVersion(request.headers['if-match']);
      if (!version)
        return reply.code(428).send({
          error: {
            code: 'PRECONDITION_REQUIRED',
            message: 'If-Match must contain the current Product version.',
          },
        });
      try {
        const body = request.body as CatalogProductContentUpdateDto;
        return {
          data: await replaceCatalogProductContent(database.db, {
            ...body,
            organizationId: context.organizationId,
            actorId: context.actorId,
            productId: (request.params as { productId: string }).productId,
            expectedVersion: version,
          }),
        };
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.get('/admin/catalog/products/:productId', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'catalog.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    const product = await getCatalogProductWorkspace(
      database.db,
      context.organizationId,
      (request.params as { productId: string }).productId,
    );
    if (!product)
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Product was not found in this organization.' },
      });
    return { data: product };
  });

  app.post(
    '/admin/catalog/products',
    {
      schema: {
        body: Type.Object({
          productTypeId: Type.String(),
          title: Type.String({ minLength: 1 }),
          handle: Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
          description: Type.Optional(Type.String()),
          categoryIds: Type.Optional(Type.Array(organizationIdParameter, { uniqueItems: true })),
          primaryCategoryId: Type.Optional(organizationIdParameter),
          tagIds: Type.Optional(Type.Array(organizationIdParameter, { uniqueItems: true })),
          occasionIds: Type.Optional(Type.Array(organizationIdParameter, { uniqueItems: true })),
          collectionIds: Type.Optional(Type.Array(organizationIdParameter, { uniqueItems: true })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as CatalogProductCreateDto;
        const product = await createCatalogProduct(database.db, {
          ...body,
          organizationId: context.organizationId,
          actorId: context.actorId,
        });
        return reply.code(201).send({ data: product });
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.post(
    '/admin/catalog/products/:productId/option-axes',
    {
      schema: {
        body: Type.Object({
          code: Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
          name: Type.String({ minLength: 1 }),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createProductOptionAxis(database.db, {
            organizationId: context.organizationId,
            productId: (request.params as { productId: string }).productId,
            ...(request.body as { code: string; name: string; position?: number }),
          }),
        });
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.post(
    '/admin/catalog/option-axes/:axisId/values',
    {
      schema: {
        body: Type.Object({
          code: Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
          displayValue: Type.String({ minLength: 1 }),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
          colorId: Type.Optional(Type.String()),
          sizeDefinitionId: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createProductOptionValue(database.db, {
            organizationId: context.organizationId,
            optionAxisId: (request.params as { axisId: string }).axisId,
            ...(request.body as {
              code: string;
              displayValue: string;
              position?: number;
              colorId?: string;
              sizeDefinitionId?: string;
            }),
          }),
        });
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/catalog/products/:productId/option-axes/:axisId',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          code: Type.Optional(Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' })),
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')])),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          version: number;
          code?: string;
          name?: string;
          position?: number;
          status?: 'ACTIVE' | 'ARCHIVED';
        };
        const { version, ...changes } = body;
        const params = request.params as { productId: string; axisId: string };
        await updateProductOptionAxis(database.db, {
          organizationId: context.organizationId,
          productId: params.productId,
          axisId: params.axisId,
          expectedVersion: version,
          ...changes,
        });
        return reply.code(204).send();
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/catalog/option-axes/:axisId/values/:valueId',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          code: Type.Optional(Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' })),
          displayValue: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')])),
          colorId: Type.Optional(Type.Union([organizationIdParameter, Type.Null()])),
          sizeDefinitionId: Type.Optional(Type.Union([organizationIdParameter, Type.Null()])),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          version: number;
          code?: string;
          displayValue?: string;
          position?: number;
          status?: 'ACTIVE' | 'ARCHIVED';
          colorId?: string | null;
          sizeDefinitionId?: string | null;
        };
        const { version, ...changes } = body;
        await updateProductOptionValue(database.db, {
          organizationId: context.organizationId,
          axisId: (request.params as { axisId: string }).axisId,
          valueId: (request.params as { valueId: string }).valueId,
          expectedVersion: version,
          ...changes,
        });
        return reply.code(204).send();
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/catalog/products/:productId',
    {
      schema: {
        body: Type.Object(
          {
            title: Type.Optional(Type.String({ minLength: 1, maxLength: 180 })),
            handle: Type.Optional(
              Type.String({
                maxLength: 160,
                pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
              }),
            ),
            description: Type.Optional(Type.Union([Type.String({ maxLength: 5000 }), Type.Null()])),
            productTypeId: Type.Optional(organizationIdParameter),
          },
          { minProperties: 1 },
        ),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as CatalogProductUpdateDto;
        const version = expectedVersion(request.headers['if-match']);
        if (!version)
          return reply.code(428).send({
            error: {
              code: 'PRECONDITION_REQUIRED',
              message: 'If-Match must contain the current product version.',
            },
          });
        const productId = (request.params as { productId: string }).productId;
        const product = await updateCatalogProduct(database.db, {
          ...body,
          productId,
          organizationId: context.organizationId,
          actorId: context.actorId,
          expectedVersion: version,
        });
        return { data: product };
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  for (const action of ['publish', 'unpublish'] as const) {
    app.post(
      `/admin/catalog/products/:productId/${action}`,
      { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
      async (request, reply) => {
        const context = await requireCapability(
          database,
          auth,
          request.headers,
          action === 'publish' ? 'catalog.publish' : 'catalog.publish',
        );
        if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
        try {
          const { version } = request.body as { version: number };
          const input = {
            organizationId: context.organizationId,
            actorId: context.actorId,
            productId: (request.params as { productId: string }).productId,
            expectedVersion: version,
          };
          const product =
            action === 'publish'
              ? await publishCatalogProduct(database.db, input)
              : await unpublishCatalogProduct(database.db, input);
          return { data: product };
        } catch (error) {
          return domainError(reply, error);
        }
      },
    );
  }

  for (const action of ['archive', 'restore'] as const) {
    app.post(
      `/admin/catalog/products/:productId/${action}`,
      { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
      async (request, reply) => {
        const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
        if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
        try {
          const input = {
            organizationId: context.organizationId,
            actorId: context.actorId,
            productId: (request.params as { productId: string }).productId,
            expectedVersion: (request.body as { version: number }).version,
          };
          return {
            data:
              action === 'archive'
                ? await archiveCatalogProduct(database.db, input)
                : await restoreCatalogProduct(database.db, input),
          };
        } catch (error) {
          return domainError(reply, error);
        }
      },
    );
  }

  app.post(
    '/admin/catalog/products/:productId/variants',
    {
      schema: { body: variantWriteSchema },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as CatalogVariantCreateDto;
        const variant = await createCatalogVariant(database.db, {
          ...body,
          organizationId: context.organizationId,
          productId: (request.params as { productId: string }).productId,
        });
        return reply.code(201).send({ data: variant });
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.post(
    '/admin/catalog/products/:productId/variants/bulk',
    {
      schema: {
        body: Type.Object({ variants: Type.Array(variantWriteSchema, { minItems: 1, maxItems: 250 }) }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as { variants: readonly CatalogVariantCreateDto[] };
        return reply.code(201).send({
          data: await createCatalogVariants(database.db, {
            organizationId: context.organizationId,
            productId: (request.params as { productId: string }).productId,
            variants: body.variants,
          }),
        });
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/catalog/products/:productId/variants/:variantId',
    {
      schema: {
        body: Type.Object(
          {
            version: Type.Integer({ minimum: 1 }),
            sku: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            title: Type.Optional(
              Type.Union([Type.String({ minLength: 1, maxLength: 180 }), Type.Null()]),
            ),
            optionValueIds: Type.Optional(
              Type.Array(organizationIdParameter, { maxItems: 8, uniqueItems: true }),
            ),
            barcode: Type.Optional(
              Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
            ),
            status: Type.Optional(
              Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')]),
            ),
            primaryColorId: Type.Optional(Type.Union([organizationIdParameter, Type.Null()])),
            associatedColorIds: Type.Optional(
              Type.Array(organizationIdParameter, { maxItems: 12, uniqueItems: true }),
            ),
            weight: Type.Optional(
              Type.Union([variantWriteSchema.properties.weight, Type.Null()]),
            ),
            dimensions: Type.Optional(
              Type.Union([variantWriteSchema.properties.dimensions, Type.Null()]),
            ),
          },
          { minProperties: 2 },
        ),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as CatalogVariantUpdateDto;
        const { version, ...changes } = body;
        const params = request.params as { productId: string; variantId: string };
        return {
          data: await updateCatalogVariant(database.db, {
            organizationId: context.organizationId,
            productId: params.productId,
            variantId: params.variantId,
            expectedVersion: version,
            ...changes,
          }),
        };
      } catch (error) {
        return domainError(reply, error);
      }
    },
  );

  app.get(
    '/storefront/v1/products',
    {
      schema: {
        querystring: Type.Object({
          organizationId: organizationIdParameter,
          q: Type.Optional(Type.String({ minLength: 2, maxLength: 120 })),
        }),
      },
    },
    async (request) => {
      const query = request.query as { organizationId: string; q?: string };
      return {
        data: await listStorefrontCatalogProducts(database.db, query.organizationId, query.q),
      };
    },
  );
  app.get(
    '/storefront/v1/categories',
    { schema: { querystring: Type.Object({ organizationId: organizationIdParameter }) } },
    async (request) => ({
      data: await listPublicCategories(
        database.db,
        (request.query as { organizationId: string }).organizationId,
      ),
    }),
  );
  app.get(
    '/storefront/v1/search',
    {
      schema: {
        querystring: Type.Object({
          organizationId: organizationIdParameter,
          q: Type.Optional(Type.String({ maxLength: 120 })),
          categoryId: Type.Optional(Type.String()),
          minimumPrice: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' })),
          maximumPrice: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' })),
          availability: Type.Optional(
            Type.Union([Type.Literal('IN_STOCK'), Type.Literal('OUT_OF_STOCK')]),
          ),
          sort: Type.Optional(
            Type.Union([
              Type.Literal('RELEVANCE'),
              Type.Literal('NEWEST'),
              Type.Literal('PRICE_ASC'),
              Type.Literal('PRICE_DESC'),
            ]),
          ),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
        }),
      },
    },
    async (request) => {
      const query = request.query as {
        organizationId: string;
        q?: string;
        categoryId?: string;
        minimumPrice?: string;
        maximumPrice?: string;
        availability?: 'IN_STOCK' | 'OUT_OF_STOCK';
        sort?: 'RELEVANCE' | 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC';
        page?: number;
      };
      return {
        data: await searchStorefront(database.db, {
          organizationId: query.organizationId,
          ...(query.q ? { query: query.q } : {}),
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.minimumPrice ? { minimumPrice: query.minimumPrice } : {}),
          ...(query.maximumPrice ? { maximumPrice: query.maximumPrice } : {}),
          ...(query.availability ? { availability: query.availability } : {}),
          ...(query.sort ? { sort: query.sort } : {}),
          ...(query.page ? { page: query.page } : {}),
        }),
      };
    },
  );
  app.post('/admin/catalog/search/rebuild', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: { count: await rebuildStorefrontSearch(database.db, context.organizationId) } };
  });
  app.get(
    '/storefront/v1/products/:handle',
    {
      schema: {
        querystring: Type.Object({
          organizationId: organizationIdParameter,
          currency: Type.Optional(Type.String({ pattern: '^[A-Z]{3}$' })),
        }),
      },
    },
    async (request, reply) => {
      const query = request.query as { organizationId: string; currency?: string };
      const product = await getStorefrontCatalogProduct(
        database.db,
        query.organizationId,
        (request.params as { handle: string }).handle,
      );
      if (!product) {
        const redirect = await resolveProductRedirect(
          database.db,
          query.organizationId,
          (request.params as { handle: string }).handle,
        );
        if (redirect)
          return reply.code(308).header('location', `/storefront/v1/products/${redirect}`).send();
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      const currency = query.currency ?? 'BDT';
      return {
        data: {
          ...product,
          variants: await Promise.all(
            product.variants.map(async (variant) => {
              const price = await resolveVariantPrice(database.db, {
                organizationId: query.organizationId,
                variantId: variant.id,
                currency,
              });
              return {
                ...variant,
                ...(price
                  ? {
                      price: {
                        amount: price.amount,
                        compareAtAmount: price.compareAtAmount,
                        currency: price.currency,
                      },
                    }
                  : {}),
              };
            }),
          ),
        },
      };
    },
  );

  app.get(
    '/storefront/v1/products/:handle/size-guide',
    { schema: { querystring: Type.Object({ organizationId: organizationIdParameter }) } },
    async (request, reply) => {
      const organizationId = (request.query as { organizationId: string }).organizationId;
      const product = await getStorefrontCatalogProduct(
        database.db,
        organizationId,
        (request.params as { handle: string }).handle,
      );
      if (!product) return reply.code(404).send({ error: 'NOT_FOUND' });
      return { data: await getPublicSizeGuideForProduct(database.db, organizationId, product.id) };
    },
  );
}
