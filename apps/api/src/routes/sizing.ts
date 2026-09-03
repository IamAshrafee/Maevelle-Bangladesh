import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  addSizeGuideRow,
  archiveMeasurementDefinition,
  archiveSizeDefinition,
  archiveSizeGuide,
  archiveSizeSystem,
  archiveSizingDomain,
  attachSizeGuideToProduct,
  createMeasurementDefinition,
  createSizeDefinition,
  createSizeGuide,
  createSizeGuideRevision,
  createSizeSystem,
  createSizingDomain,
  duplicateSizeGuide,
  getAdminSizingWorkspace,
  getProductSizingConfiguration,
  getSizeGuideDetail,
  getSizingQualityChecks,
  listCategorySizeGuideDefaults,
  listSizeOptionValuesWithMapping,
  linkOptionValueToSizeDefinition,
  listSizeGuides,
  publishSizeGuideRevision,
  removeProductSizingConfiguration,
  removeSizeGuideRow,
  setCategoryDefaultSizeGuide,
  setSizeGuideMeasurement,
  SizingDomainError,
  updateMeasurementDefinition,
  updateSizeDefinition,
  updateSizeGuide,
  updateSizeGuideRevisionMeta,
  updateSizeSystem,
} from '@maevelle/database/sizing';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function requestHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(headers).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

async function requireSizing(
  database: DatabaseClient,
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  capability: 'sizing.view' | 'sizing.manage',
) {
  const session = await auth.api.getSession({ headers: requestHeaders(headers) });
  if (!session?.user?.id) return undefined;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}

function sizingError(
  reply: { code(statusCode: number): { send(body: unknown): unknown } },
  error: unknown,
) {
  if (!(error instanceof SizingDomainError)) throw error;
  return reply
    .code(error.code === 'NOT_FOUND' ? 404 : 422)
    .send({ error: { code: error.code, message: error.message } });
}

const code = Type.String({ minLength: 1, maxLength: 80, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' });
const uuid = Type.String({ format: 'uuid' });

export function registerSizingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  // ─── Queries ─────────────────────────────────────────────────────────────

  app.get('/admin/sizing', async (request, reply) => {
    const context = await requireSizing(database, auth, request.headers, 'sizing.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await getAdminSizingWorkspace(database.db, context.organizationId) };
  });

  app.get('/admin/sizing/quality-checks', async (request, reply) => {
    const context = await requireSizing(database, auth, request.headers, 'sizing.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await getSizingQualityChecks(database.db, context.organizationId) };
  });

  app.get(
    '/admin/sizing/guides',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED'), Type.Literal('ALL')])),
          domainId: Type.Optional(uuid),
          search: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireSizing(database, auth, request.headers, 'sizing.view');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as any;
      const data = await listSizeGuides(database.db, {
        organizationId: context.organizationId,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        status: query.status,
        domainId: query.domainId,
        search: query.search,
      });
      return { data: data.items, pagination: { totalItems: data.totalItems } };
    },
  );

  app.get('/admin/sizing/guides/:guideId', async (request, reply) => {
    const context = await requireSizing(database, auth, request.headers, 'sizing.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    const guideId = (request.params as any).guideId;
    const detail = await getSizeGuideDetail(database.db, context.organizationId, guideId);
    if (!detail) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Size guide not found' } });
    return { data: detail };
  });

  app.get('/admin/catalog/products/:productId/size-configuration', async (request, reply) => {
    const context = await requireSizing(database, auth, request.headers, 'sizing.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    const productId = (request.params as any).productId;
    return { data: await getProductSizingConfiguration(database.db, context.organizationId, productId) };
  });

  app.get('/admin/sizing/category-defaults', async (request, reply) => {
    const context = await requireSizing(database, auth, request.headers, 'sizing.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listCategorySizeGuideDefaults(database.db, context.organizationId) };
  });

  app.get('/admin/sizing/option-values', async (request, reply) => {
    const context = await requireSizing(database, auth, request.headers, 'sizing.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listSizeOptionValuesWithMapping(database.db, context.organizationId) };
  });

  // ─── Mutations ───────────────────────────────────────────────────────────

  const secured = (
    path: string,
    body: ReturnType<typeof Type.Object> | null,
    handler: (
      body: Record<string, unknown>,
      context: { organizationId: string; actorId: string },
      reply: { code(statusCode: number): { send(body: unknown): unknown } },
      params: Record<string, string>,
    ) => Promise<unknown>,
    method: 'post' | 'put' | 'delete' | 'patch' = 'post',
  ) => {
    app[method](path, { ...(body ? { schema: { body } } : {}) }, async (request, reply) => {
      const context = await requireSizing(database, auth, request.headers, 'sizing.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return await handler(
          (request.body as Record<string, unknown>) ?? {},
          context,
          reply,
          request.params as Record<string, string>,
        );
      } catch (error) {
        return sizingError(reply, error);
      }
    });
  };

  // Create
  secured(
    '/admin/sizing/domains',
    Type.Object({
      code,
      name: Type.String({ minLength: 1 }),
      subjectType: Type.Union([
        Type.Literal('BODY'),
        Type.Literal('GARMENT'),
        Type.Literal('PRODUCT'),
      ]),
    }),
    async (body, context, reply) =>
      reply.code(201).send({
        data: await createSizingDomain(database.db, {
          organizationId: context.organizationId,
          code: body.code as string,
          name: body.name as string,
          subjectType: body.subjectType as 'BODY' | 'GARMENT' | 'PRODUCT',
          actorId: context.actorId,
        }),
      }),
  );
  secured(
    '/admin/sizing/systems',
    Type.Object({
      sizingDomainId: uuid,
      code,
      name: Type.String({ minLength: 1 }),
      regionCode: Type.Optional(Type.String()),
    }),
    async (body, context, reply) =>
      reply.code(201).send({
        data: await createSizeSystem(database.db, {
          organizationId: context.organizationId,
          sizingDomainId: body.sizingDomainId as string,
          code: body.code as string,
          name: body.name as string,
          ...(body.regionCode ? { regionCode: body.regionCode as string } : {}),
          actorId: context.actorId,
        }),
      }),
  );
  secured(
    '/admin/sizing/definitions',
    Type.Object({
      sizeSystemId: uuid,
      code,
      label: Type.String({ minLength: 1 }),
      sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
    }),
    async (body, context, reply) =>
      reply.code(201).send({
        data: await createSizeDefinition(database.db, {
          organizationId: context.organizationId,
          sizeSystemId: body.sizeSystemId as string,
          code: body.code as string,
          label: body.label as string,
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder as number } : {}),
          actorId: context.actorId,
        }),
      }),
  );
  secured(
    '/admin/sizing/measurements',
    Type.Object({
      sizingDomainId: uuid,
      code,
      name: Type.String({ minLength: 1 }),
      description: Type.Optional(Type.String()),
      instructions: Type.Optional(Type.String()),
      sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
      subjectType: Type.Union([
        Type.Literal('BODY'),
        Type.Literal('GARMENT'),
        Type.Literal('PRODUCT'),
      ]),
      defaultUnit: Type.Union([Type.Literal('cm'), Type.Literal('inch')]),
    }),
    async (body, context, reply) =>
      reply.code(201).send({
        data: await createMeasurementDefinition(database.db, {
          organizationId: context.organizationId,
          sizingDomainId: body.sizingDomainId as string,
          code: body.code as string,
          name: body.name as string,
          ...(body.description !== undefined ? { description: body.description as string } : {}),
          ...(body.instructions !== undefined ? { instructions: body.instructions as string } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder as number } : {}),
          subjectType: body.subjectType as 'BODY' | 'GARMENT' | 'PRODUCT',
          defaultUnit: body.defaultUnit as 'cm' | 'inch',
          actorId: context.actorId,
        }),
      }),
  );
  secured(
    '/admin/sizing/guides',
    Type.Object({ name: Type.String({ minLength: 1 }), description: Type.Optional(Type.String()), sizingDomainId: uuid }),
    async (body, context, reply) =>
      reply.code(201).send({
        data: await createSizeGuide(database.db, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          name: body.name as string,
          ...(body.description !== undefined ? { description: body.description as string } : {}),
          sizingDomainId: body.sizingDomainId as string,
        }),
      }),
  );
  secured(
    '/admin/sizing/guides/:guideId/revisions',
    Type.Object({ instructions: Type.Optional(Type.String()), fitNotes: Type.Optional(Type.String()) }),
    async (body, context, reply, params) =>
      reply.code(201).send({
        data: await createSizeGuideRevision(database.db, {
          organizationId: context.organizationId,
          sizeGuideId: params.guideId!,
          actorId: context.actorId,
          ...(body.instructions !== undefined ? { instructions: body.instructions as string } : {}),
          ...(body.fitNotes !== undefined ? { fitNotes: body.fitNotes as string } : {}),
        }),
      }),
  );

  secured(
    '/admin/sizing/guides/:guideId/duplicate',
    Type.Object({ name: Type.Optional(Type.String({ minLength: 1 })) }),
    async (body, context, reply, params) =>
      reply.code(201).send({
        data: await duplicateSizeGuide(database.db, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          id: params.guideId!,
          ...(body.name !== undefined ? { name: body.name as string } : {}),
        }),
      }),
  );

  // Update
  secured(
    '/admin/sizing/guides/:guideId',
    Type.Object({ name: Type.Optional(Type.String({ minLength: 1 })), description: Type.Optional(Type.Union([Type.String(), Type.Null()])) }),
    async (body, context, reply, params) => {
      await updateSizeGuide(database.db, {
        organizationId: context.organizationId,
        id: params.guideId!,
        ...(body.name !== undefined ? { name: body.name as string } : {}),
        ...(body.description !== undefined ? { description: body.description as string | null } : {}),
        actorId: context.actorId,
      });
      return reply.code(204).send(undefined);
    },
    'put'
  );
  const updateMetaHandler = async (
    body: Record<string, unknown>,
    context: { organizationId: string; actorId: string },
    reply: { code(statusCode: number): { send(body: unknown): unknown } },
    params: Record<string, string>,
  ) => {
    await updateSizeGuideRevisionMeta(database.db, {
      organizationId: context.organizationId,
      revisionId: params.revisionId!,
      ...(body.instructions !== undefined ? { instructions: body.instructions as string | null } : {}),
      ...(body.fitNotes !== undefined ? { fitNotes: body.fitNotes as string | null } : {}),
    });
    return reply.code(204).send(undefined);
  };
  const metaSchema = Type.Object({
    instructions: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    fitNotes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  });
  secured('/admin/sizing/revisions/:revisionId/meta', metaSchema, updateMetaHandler, 'put');
  secured('/admin/sizing/revisions/:revisionId/meta', metaSchema, updateMetaHandler, 'patch');
  secured(
    '/admin/sizing/systems/:systemId',
    Type.Object({ name: Type.Optional(Type.String({ minLength: 1 })), regionCode: Type.Optional(Type.Union([Type.String(), Type.Null()])) }),
    async (body, context, reply, params) => {
      await updateSizeSystem(database.db, {
        organizationId: context.organizationId,
        id: params.systemId!,
        ...(body.name !== undefined ? { name: body.name as string } : {}),
        ...(body.regionCode !== undefined ? { regionCode: body.regionCode as string | null } : {}),
        actorId: context.actorId,
      });
      return reply.code(204).send(undefined);
    },
    'put'
  );
  secured(
    '/admin/sizing/definitions/:definitionId',
    Type.Object({ label: Type.Optional(Type.String({ minLength: 1 })), sortOrder: Type.Optional(Type.Integer({ minimum: 0 })) }),
    async (body, context, reply, params) => {
      await updateSizeDefinition(database.db, {
        organizationId: context.organizationId,
        id: params.definitionId!,
        ...(body.label !== undefined ? { label: body.label as string } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder as number } : {}),
        actorId: context.actorId,
      });
      return reply.code(204).send(undefined);
    },
    'put'
  );
  secured(
    '/admin/sizing/measurements/:measurementId',
    Type.Object({
      name: Type.Optional(Type.String({ minLength: 1 })),
      description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      instructions: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      sortOrder: Type.Optional(Type.Integer({ minimum: 0 }))
    }),
    async (body, context, reply, params) => {
      await updateMeasurementDefinition(database.db, {
        organizationId: context.organizationId,
        id: params.measurementId!,
        ...(body.name !== undefined ? { name: body.name as string } : {}),
        ...(body.description !== undefined ? { description: body.description as string | null } : {}),
        ...(body.instructions !== undefined ? { instructions: body.instructions as string | null } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder as number } : {}),
        actorId: context.actorId,
      });
      return reply.code(204).send(undefined);
    },
    'put'
  );

  // Archive
  secured(
    '/admin/sizing/guides/:guideId', null,
    async (_body, context, reply, params) => {
      await archiveSizeGuide(database.db, { organizationId: context.organizationId, id: params.guideId!, actorId: context.actorId });
      return reply.code(204).send(undefined);
    },
    'delete'
  );
  secured(
    '/admin/sizing/systems/:systemId', null,
    async (_body, context, reply, params) => {
      await archiveSizeSystem(database.db, { organizationId: context.organizationId, id: params.systemId!, actorId: context.actorId });
      return reply.code(204).send(undefined);
    },
    'delete'
  );
  secured(
    '/admin/sizing/definitions/:definitionId', null,
    async (_body, context, reply, params) => {
      await archiveSizeDefinition(database.db, { organizationId: context.organizationId, id: params.definitionId!, actorId: context.actorId });
      return reply.code(204).send(undefined);
    },
    'delete'
  );
  secured(
    '/admin/sizing/measurements/:measurementId', null,
    async (_body, context, reply, params) => {
      await archiveMeasurementDefinition(database.db, { organizationId: context.organizationId, id: params.measurementId!, actorId: context.actorId });
      return reply.code(204).send(undefined);
    },
    'delete'
  );
  secured(
    '/admin/sizing/domains/:domainId', null,
    async (_body, context, reply, params) => {
      await archiveSizingDomain(database.db, { organizationId: context.organizationId, id: params.domainId!, actorId: context.actorId });
      return reply.code(204).send(undefined);
    },
    'delete'
  );

  // Revisions & Rows
  secured(
    '/admin/sizing/revisions/:revisionId/rows',
    Type.Object({
      displayLabel: Type.String({ minLength: 1 }),
      position: Type.Integer({ minimum: 0 }),
      sizeDefinitionId: Type.Optional(uuid),
    }),
    async (body, context, reply, params) =>
      reply.code(201).send({
        data: await addSizeGuideRow(database.db, {
          organizationId: context.organizationId,
          revisionId: params.revisionId!,
          displayLabel: body.displayLabel as string,
          position: body.position as number,
          ...(body.sizeDefinitionId !== undefined ? { sizeDefinitionId: body.sizeDefinitionId as string } : {}),
        }),
      }),
  );

  secured(
    '/admin/sizing/revisions/:revisionId/rows/:rowId', null,
    async (_body, context, reply, params) => {
      await removeSizeGuideRow(database.db, {
        organizationId: context.organizationId,
        revisionId: params.revisionId!,
        rowId: params.rowId!,
      });
      return reply.code(204).send(undefined);
    },
    'delete'
  );

  secured(
    '/admin/sizing/revisions/:revisionId/rows/:rowId/measurements/:measurementDefinitionId',
    Type.Object({
      unitCode: Type.Union([Type.Literal('cm'), Type.Literal('inch')]),
      exact: Type.Optional(Type.String()),
      min: Type.Optional(Type.String()),
      max: Type.Optional(Type.String()),
      isApproximate: Type.Optional(Type.Boolean()),
    }),
    async (body, context, reply, params) => {
      await setSizeGuideMeasurement(database.db, {
        organizationId: context.organizationId,
        revisionId: params.revisionId!,
        rowId: params.rowId!,
        measurementDefinitionId: params.measurementDefinitionId!,
        unitCode: body.unitCode as 'cm' | 'inch',
        ...(body.exact !== undefined ? { exact: body.exact as string } : {}),
        ...(body.min !== undefined ? { min: body.min as string } : {}),
        ...(body.max !== undefined ? { max: body.max as string } : {}),
        ...(body.isApproximate !== undefined ? { isApproximate: body.isApproximate as boolean } : {}),
      });
      return reply.code(204).send(undefined);
    },
    'put'
  );

  secured(
    '/admin/sizing/guides/:guideId/revisions/:revisionId/publish',
    null,
    async (_body, context, reply, params) => {
      await publishSizeGuideRevision(database.db, {
        organizationId: context.organizationId,
        sizeGuideId: params.guideId!,
        revisionId: params.revisionId!,
        actorId: context.actorId,
      });
      return reply.code(204).send(undefined);
    },
    'post'
  );

  // Configuration (Product + Category)
  secured(
    '/admin/catalog/products/:productId/size-configuration',
    Type.Object({ sizeSystemId: uuid, sizeGuideId: Type.Optional(uuid) }),
    async (body, context, reply, params) => {
      await attachSizeGuideToProduct(database.db, {
        organizationId: context.organizationId,
        productId: params.productId!,
        sizeSystemId: body.sizeSystemId as string,
        ...(body.sizeGuideId !== undefined ? { sizeGuideId: body.sizeGuideId as string } : {}),
        actorId: context.actorId,
      });
      return reply.code(204).send(undefined);
    },
    'put'
  );
  
  secured(
    '/admin/catalog/products/:productId/size-configuration', null,
    async (_body, context, reply, params) => {
      await removeProductSizingConfiguration(database.db, {
        organizationId: context.organizationId,
        productId: params.productId!,
        actorId: context.actorId,
      });
      return reply.code(204).send(undefined);
    },
    'delete'
  );

  secured(
    '/admin/catalog/categories/:categoryId/size-guide',
    Type.Object({ sizeGuideId: Type.Optional(Type.Union([uuid, Type.Null()])) }),
    async (body, context, reply, params) => {
      await setCategoryDefaultSizeGuide(database.db, {
        organizationId: context.organizationId,
        categoryId: params.categoryId!,
        sizeGuideId: (body.sizeGuideId as string | null | undefined) ?? null,
        actorId: context.actorId,
      });
      return reply.code(204).send(undefined);
    },
    'put'
  );

  secured(
    '/admin/sizing/option-values/:optionValueId/size-definition',
    Type.Object({ sizeDefinitionId: Type.Optional(Type.Union([uuid, Type.Null()])) }),
    async (body, context, reply, params) => {
      await linkOptionValueToSizeDefinition(database.db, {
        organizationId: context.organizationId,
        optionValueId: params.optionValueId!,
        sizeDefinitionId: (body.sizeDefinitionId as string | null | undefined) ?? null,
        actorId: context.actorId,
      });
      return reply.code(204).send(undefined);
    },
    'put'
  );
}
