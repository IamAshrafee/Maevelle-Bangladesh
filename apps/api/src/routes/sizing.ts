import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  addSizeGuideRow,
  attachSizeGuideToProduct,
  createMeasurementDefinition,
  createSizeDefinition,
  createSizeGuide,
  createSizeGuideRevision,
  createSizeSystem,
  createSizingDomain,
  getAdminSizingWorkspace,
  publishSizeGuideRevision,
  setSizeGuideMeasurement,
  SizingDomainError,
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
  app.get('/admin/sizing', async (request, reply) => {
    const context = await requireSizing(database, auth, request.headers, 'sizing.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await getAdminSizingWorkspace(database.db, context.organizationId) };
  });

  const secured = (
    path: string,
    body: ReturnType<typeof Type.Object>,
    handler: (
      body: Record<string, unknown>,
      context: { organizationId: string; actorId: string },
      reply: { code(statusCode: number): { send(body: unknown): unknown } },
      params: Record<string, string>,
    ) => Promise<unknown>,
  ) => {
    app.post(path, { schema: { body } }, async (request, reply) => {
      const context = await requireSizing(database, auth, request.headers, 'sizing.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return await handler(
          request.body as Record<string, unknown>,
          context,
          reply,
          request.params as Record<string, string>,
        );
      } catch (error) {
        return sizingError(reply, error);
      }
    });
  };
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
        }),
      }),
  );
  secured(
    '/admin/sizing/measurements',
    Type.Object({
      sizingDomainId: uuid,
      code,
      name: Type.String({ minLength: 1 }),
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
          subjectType: body.subjectType as 'BODY' | 'GARMENT' | 'PRODUCT',
          defaultUnit: body.defaultUnit as 'cm' | 'inch',
        }),
      }),
  );
  secured(
    '/admin/sizing/guides',
    Type.Object({ name: Type.String({ minLength: 1 }), sizingDomainId: uuid }),
    async (body, context, reply) =>
      reply.code(201).send({
        data: await createSizeGuide(database.db, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          name: body.name as string,
          sizingDomainId: body.sizingDomainId as string,
        }),
      }),
  );
  secured(
    '/admin/sizing/guides/:guideId/revisions',
    Type.Object({ instructions: Type.Optional(Type.String()) }),
    async (body, context, reply, params) =>
      reply.code(201).send({
        data: await createSizeGuideRevision(database.db, {
          organizationId: context.organizationId,
          sizeGuideId: params.guideId!,
          actorId: context.actorId,
          ...(body.instructions ? { instructions: body.instructions as string } : {}),
        }),
      }),
  );

  app.post(
    '/admin/sizing/revisions/:revisionId/rows',
    {
      schema: {
        body: Type.Object({
          displayLabel: Type.String({ minLength: 1 }),
          position: Type.Integer({ minimum: 0 }),
          sizeDefinitionId: Type.Optional(uuid),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireSizing(database, auth, request.headers, 'sizing.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          displayLabel: string;
          position: number;
          sizeDefinitionId?: string;
        };
        return reply.code(201).send({
          data: await addSizeGuideRow(database.db, {
            organizationId: context.organizationId,
            revisionId: (request.params as { revisionId: string }).revisionId,
            ...body,
          }),
        });
      } catch (error) {
        return sizingError(reply, error);
      }
    },
  );
  app.put(
    '/admin/sizing/revisions/:revisionId/rows/:rowId/measurements/:measurementDefinitionId',
    {
      schema: {
        body: Type.Object({
          unitCode: Type.Union([Type.Literal('cm'), Type.Literal('inch')]),
          exact: Type.Optional(Type.String()),
          min: Type.Optional(Type.String()),
          max: Type.Optional(Type.String()),
          isApproximate: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireSizing(database, auth, request.headers, 'sizing.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          unitCode: 'cm' | 'inch';
          exact?: string;
          min?: string;
          max?: string;
          isApproximate?: boolean;
        };
        await setSizeGuideMeasurement(database.db, {
          organizationId: context.organizationId,
          revisionId: (request.params as { revisionId: string }).revisionId,
          rowId: (request.params as { rowId: string }).rowId,
          measurementDefinitionId: (request.params as { measurementDefinitionId: string })
            .measurementDefinitionId,
          ...body,
        });
        return reply.code(204).send();
      } catch (error) {
        return sizingError(reply, error);
      }
    },
  );
  app.post(
    '/admin/sizing/guides/:guideId/revisions/:revisionId/publish',
    async (request, reply) => {
      const context = await requireSizing(database, auth, request.headers, 'sizing.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        await publishSizeGuideRevision(database.db, {
          organizationId: context.organizationId,
          sizeGuideId: (request.params as { guideId: string }).guideId,
          revisionId: (request.params as { revisionId: string }).revisionId,
        });
        return reply.code(204).send();
      } catch (error) {
        return sizingError(reply, error);
      }
    },
  );
  secured(
    '/admin/catalog/products/:productId/size-configuration',
    Type.Object({ sizeSystemId: uuid, sizeGuideId: Type.Optional(uuid) }),
    async (body, context, reply, params) => {
      await attachSizeGuideToProduct(database.db, {
        organizationId: context.organizationId,
        productId: params.productId!,
        sizeSystemId: body.sizeSystemId as string,
        ...(body.sizeGuideId ? { sizeGuideId: body.sizeGuideId as string } : {}),
      });
      return reply.code(204).send(undefined);
    },
  );
}
