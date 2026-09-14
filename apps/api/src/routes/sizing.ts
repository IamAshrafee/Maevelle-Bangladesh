import type {
  FastifyInstance,
  FastifyReply,
  FastifySchema,
} from 'fastify';
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
  linkOptionValueToSizeDefinition,
  linkOptionValuesToSizeDefinitionsBulk,
  listCategorySizeGuideDefaults,
  listSizeGuides,
  listSizeOptionValuesWithMapping,
  publishSizeGuideRevision,
  removeProductSizingConfiguration,
  removeSizeGuideMeasurement,
  removeSizeGuideRow,
  reorderSizeGuideRows,
  restoreMeasurementDefinition,
  restoreSizeDefinition,
  restoreSizeGuide,
  restoreSizeSystem,
  restoreSizingDomain,
  setCategoryDefaultSizeGuide,
  setSizeGuideMeasurement,
  setSizeGuideMeasurementsBulk,
  SizingDomainError,
  updateMeasurementDefinition,
  updateSizeDefinition,
  updateSizeGuide,
  updateSizeGuideRevisionMeta,
  updateSizeGuideRow,
  updateSizeSystem,
  updateSizingDomain,
} from '@maevelle/database/sizing';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

type SizingCapability = 'sizing.view' | 'sizing.manage';

type SizingContext = {
  organizationId: string;
  actorId: string;
};

type AuthorizationResult =
  | {
    ok: true;
    context: SizingContext;
  }
  | {
    ok: false;
    statusCode: 401 | 403;
    code: 'UNAUTHORIZED' | 'FORBIDDEN';
    message: string;
  };

type SecuredHandler = (
  body: Record<string, unknown>,
  context: SizingContext,
  reply: FastifyReply,
  params: Record<string, string>,
  query: Record<string, unknown>,
) => Promise<unknown>;

/* -------------------------------------------------------------------------- */
/*                               Shared schemas                               */
/* -------------------------------------------------------------------------- */

const uuid = Type.String({
  format: 'uuid',
});

const code = Type.String({
  minLength: 1,
  maxLength: 80,
  pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
});

const name = Type.String({
  minLength: 1,
  maxLength: 160,
});

const shortText = Type.String({
  maxLength: 500,
});

const longText = Type.String({
  maxLength: 10_000,
});

const nullableShortText = Type.Union([shortText, Type.Null()]);
const nullableLongText = Type.Union([longText, Type.Null()]);

const subjectType = Type.Union([
  Type.Literal('BODY'),
  Type.Literal('GARMENT'),
  Type.Literal('PRODUCT'),
]);

const measurementUnit = Type.Union([
  Type.Literal('cm'),
  Type.Literal('inch'),
]);

/**
 * Decimal values intentionally remain strings.
 *
 * This avoids JavaScript floating point issues when measurement values are
 * persisted as database decimal / numeric values.
 */
const measurementValue = Type.String({
  minLength: 1,
  maxLength: 24,
  pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,3})?$',
});

const expectedVersion = Type.Integer({
  minimum: 0,
});

const paginationQuery = {
  page: Type.Optional(
    Type.Integer({
      minimum: 1,
      default: 1,
    }),
  ),
  pageSize: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      default: 20,
    }),
  ),
};

const lifecycleStatus = Type.Union([
  Type.Literal('ACTIVE'),
  Type.Literal('ARCHIVED'),
  Type.Literal('ALL'),
]);

const guideIdParams = Type.Object(
  {
    guideId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const revisionIdParams = Type.Object(
  {
    revisionId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const guideRevisionParams = Type.Object(
  {
    guideId: uuid,
    revisionId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const revisionRowParams = Type.Object(
  {
    revisionId: uuid,
    rowId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const measurementCellParams = Type.Object(
  {
    revisionId: uuid,
    rowId: uuid,
    measurementDefinitionId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const productIdParams = Type.Object(
  {
    productId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const categoryIdParams = Type.Object(
  {
    categoryId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const domainIdParams = Type.Object(
  {
    domainId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const systemIdParams = Type.Object(
  {
    systemId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const definitionIdParams = Type.Object(
  {
    definitionId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const measurementIdParams = Type.Object(
  {
    measurementId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const optionValueIdParams = Type.Object(
  {
    optionValueId: uuid,
  },
  {
    additionalProperties: false,
  },
);

const expectedVersionQuery = Type.Object(
  {
    expectedVersion,
  },
  {
    additionalProperties: false,
  },
);

/* -------------------------------------------------------------------------- */
/*                              Authentication                                */
/* -------------------------------------------------------------------------- */

function requestHeaders(
  headers: Record<string, string | string[] | undefined>,
): Headers {
  const result = new Headers();

  for (const [headerName, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      result.set(headerName, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(headerName, item);
      }
    }
  }

  return result;
}

async function requireSizing(
  database: DatabaseClient,
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  capability: SizingCapability,
): Promise<AuthorizationResult> {
  const session = await auth.api.getSession({
    headers: requestHeaders(headers),
  });

  if (!session?.user?.id) {
    return {
      ok: false,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    };
  }

  const context = await findActiveAdminContext(
    database.db,
    session.user.id,
    {
      requiredCapability: capability,
    },
  );

  if (!context) {
    return {
      ok: false,
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'You do not have permission to access sizing.',
    };
  }

  return {
    ok: true,
    context: {
      organizationId: context.organizationId,
      actorId: session.user.id,
    },
  };
}

function sendAuthorizationError(
  reply: FastifyReply,
  authorization: Extract<AuthorizationResult, { ok: false }>,
) {
  return reply.code(authorization.statusCode).send({
    error: {
      code: authorization.code,
      message: authorization.message,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                               Error mapping                                */
/* -------------------------------------------------------------------------- */

const sizingErrorStatus: Record<string, number> = {
  NOT_FOUND: 404,

  UNAUTHORIZED: 401,
  FORBIDDEN: 403,

  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  STALE_VERSION: 409,
  ALREADY_EXISTS: 409,
  DUPLICATE: 409,
  DEPENDENCY_EXISTS: 409,
  ALREADY_PUBLISHED: 409,
  PUBLISHED_REVISION_IMMUTABLE: 409,
  ARCHIVED: 409,
  INVALID_STATE: 409,
  DRAFT_ALREADY_EXISTS: 409,

  VALIDATION_ERROR: 422,
  INVALID_ARGUMENT: 422,
  INVALID_MEASUREMENT: 422,
  DOMAIN_MISMATCH: 422,
  SYSTEM_MISMATCH: 422,
};

function sizingError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof SizingDomainError)) {
    throw error;
  }

  const errorCode = String(error.code);
  const statusCode = sizingErrorStatus[errorCode] ?? 422;

  return reply.code(statusCode).send({
    error: {
      code: errorCode,
      message: error.message,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function pagination(
  page: number,
  pageSize: number,
  totalItems: number,
) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages:
      totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

/* -------------------------------------------------------------------------- */
/*                                Route setup                                 */
/* -------------------------------------------------------------------------- */

export function registerSizingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  /* ------------------------------------------------------------------------ */
  /*                                  Queries                                 */
  /* ------------------------------------------------------------------------ */

  app.get('/admin/sizing', async (request, reply) => {
    const authorization = await requireSizing(
      database,
      auth,
      request.headers,
      'sizing.view',
    );

    if (!authorization.ok) {
      return sendAuthorizationError(reply, authorization);
    }

    try {
      return {
        data: await getAdminSizingWorkspace(
          database.db,
          authorization.context.organizationId,
        ),
      };
    } catch (error) {
      return sizingError(reply, error);
    }
  });

  app.get(
    '/admin/sizing/quality-checks',
    async (request, reply) => {
      const authorization = await requireSizing(
        database,
        auth,
        request.headers,
        'sizing.view',
      );

      if (!authorization.ok) {
        return sendAuthorizationError(reply, authorization);
      }

      try {
        return {
          data: await getSizingQualityChecks(
            database.db,
            authorization.context.organizationId,
          ),
        };
      } catch (error) {
        return sizingError(reply, error);
      }
    },
  );

  app.get(
    '/admin/sizing/guides',
    {
      schema: {
        querystring: Type.Object(
          {
            ...paginationQuery,

            status: Type.Optional(lifecycleStatus),

            domainId: Type.Optional(uuid),

            search: Type.Optional(
              Type.String({
                minLength: 1,
                maxLength: 200,
              }),
            ),
          },
          {
            additionalProperties: false,
          },
        ),
      },
    },
    async (request, reply) => {
      const authorization = await requireSizing(
        database,
        auth,
        request.headers,
        'sizing.view',
      );

      if (!authorization.ok) {
        return sendAuthorizationError(reply, authorization);
      }

      const query = request.query as {
        page?: number;
        pageSize?: number;
        status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
        domainId?: string;
        search?: string;
      };

      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;

      try {
        const result = await listSizeGuides(database.db, {
          organizationId:
            authorization.context.organizationId,

          page,
          pageSize,

          ...(query.status ? { status: query.status } : {}),

          ...(query.domainId ? { domainId: query.domainId } : {}),

          ...(query.search?.trim() ? { search: query.search.trim() } : {}),
        });

        return {
          data: result.items,
          pagination: pagination(
            page,
            pageSize,
            result.totalItems,
          ),
        };
      } catch (error) {
        return sizingError(reply, error);
      }
    },
  );

  app.get(
    '/admin/sizing/guides/:guideId',
    {
      schema: {
        params: guideIdParams,
      },
    },
    async (request, reply) => {
      const authorization = await requireSizing(
        database,
        auth,
        request.headers,
        'sizing.view',
      );

      if (!authorization.ok) {
        return sendAuthorizationError(reply, authorization);
      }

      const { guideId } = request.params as {
        guideId: string;
      };

      try {
        const detail = await getSizeGuideDetail(
          database.db,
          authorization.context.organizationId,
          guideId,
        );

        if (!detail) {
          return reply.code(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Size guide not found.',
            },
          });
        }

        return {
          data: detail,
        };
      } catch (error) {
        return sizingError(reply, error);
      }
    },
  );

  app.get(
    '/admin/catalog/products/:productId/size-configuration',
    {
      schema: {
        params: productIdParams,
      },
    },
    async (request, reply) => {
      const authorization = await requireSizing(
        database,
        auth,
        request.headers,
        'sizing.view',
      );

      if (!authorization.ok) {
        return sendAuthorizationError(reply, authorization);
      }

      const { productId } = request.params as {
        productId: string;
      };

      try {
        return {
          data: await getProductSizingConfiguration(
            database.db,
            authorization.context.organizationId,
            productId,
          ),
        };
      } catch (error) {
        return sizingError(reply, error);
      }
    },
  );

  app.get(
    '/admin/sizing/category-defaults',
    {
      schema: {
        querystring: Type.Object(
          {
            ...paginationQuery,

            search: Type.Optional(
              Type.String({
                minLength: 1,
                maxLength: 200,
              }),
            ),

            mappingStatus: Type.Optional(
              Type.Union([
                Type.Literal('MAPPED'),
                Type.Literal('UNMAPPED'),
                Type.Literal('ALL'),
              ]),
            ),
          },
          {
            additionalProperties: false,
          },
        ),
      },
    },
    async (request, reply) => {
      const authorization = await requireSizing(
        database,
        auth,
        request.headers,
        'sizing.view',
      );

      if (!authorization.ok) {
        return sendAuthorizationError(reply, authorization);
      }

      const query = request.query as {
        page?: number;
        pageSize?: number;
        search?: string;
        mappingStatus?: 'MAPPED' | 'UNMAPPED' | 'ALL';
      };

      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;

      try {
        const result = await listCategorySizeGuideDefaults(
          database.db,
          {
            organizationId:
              authorization.context.organizationId,

            page,
            pageSize,

            ...(query.search?.trim() ? { search: query.search.trim() } : {}),

            ...(query.mappingStatus ? { mappingStatus: query.mappingStatus } : {}),
          },
        );

        return {
          data: result.items,

          pagination: pagination(
            page,
            pageSize,
            result.totalItems,
          ),
        };
      } catch (error) {
        return sizingError(reply, error);
      }
    },
  );

  app.get(
    '/admin/sizing/option-values',
    {
      schema: {
        querystring: Type.Object(
          {
            ...paginationQuery,

            search: Type.Optional(
              Type.String({
                minLength: 1,
                maxLength: 200,
              }),
            ),

            mappingStatus: Type.Optional(
              Type.Union([
                Type.Literal('MAPPED'),
                Type.Literal('UNMAPPED'),
                Type.Literal('ALL'),
              ]),
            ),

            sizeSystemId: Type.Optional(uuid),

            optionId: Type.Optional(uuid),
          },
          {
            additionalProperties: false,
          },
        ),
      },
    },
    async (request, reply) => {
      const authorization = await requireSizing(
        database,
        auth,
        request.headers,
        'sizing.view',
      );

      if (!authorization.ok) {
        return sendAuthorizationError(reply, authorization);
      }

      const query = request.query as {
        page?: number;
        pageSize?: number;

        search?: string;

        mappingStatus?:
        | 'MAPPED'
        | 'UNMAPPED'
        | 'ALL';

        sizeSystemId?: string;
        optionId?: string;
      };

      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;

      try {
        const result =
          await listSizeOptionValuesWithMapping(
            database.db,
            {
              organizationId:
                authorization.context.organizationId,

              page,
              pageSize,

              ...(query.search?.trim() ? { search: query.search.trim() } : {}),

              ...(query.mappingStatus ? { mappingStatus: query.mappingStatus } : {}),

              ...(query.sizeSystemId ? { sizeSystemId: query.sizeSystemId } : {}),

              ...(query.optionId ? { optionId: query.optionId } : {}),
            },
          );

        return {
          data: result.items,

          pagination: pagination(
            page,
            pageSize,
            result.totalItems,
          ),
        };
      } catch (error) {
        return sizingError(reply, error);
      }
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                           Secured mutation helper                         */
  /* ------------------------------------------------------------------------ */

  const secured = (
    method:
      | 'post'
      | 'put'
      | 'patch'
      | 'delete',
    path: string,
    schema: FastifySchema,
    handler: SecuredHandler,
  ) => {
    app[method](
      path,
      {
        schema,
      },
      async (request, reply) => {
        const authorization = await requireSizing(
          database,
          auth,
          request.headers,
          'sizing.manage',
        );

        if (!authorization.ok) {
          return sendAuthorizationError(
            reply,
            authorization,
          );
        }

        try {
          return await handler(
            (request.body as Record<
              string,
              unknown
            >) ?? {},

            authorization.context,

            reply,

            (request.params as Record<
              string,
              string
            >) ?? {},

            (request.query as Record<
              string,
              unknown
            >) ?? {},
          );
        } catch (error) {
          return sizingError(reply, error);
        }
      },
    );
  };

  /* ------------------------------------------------------------------------ */
  /*                              Sizing domains                              */
  /* ------------------------------------------------------------------------ */

  secured(
    'post',
    '/admin/sizing/domains',
    {
      body: Type.Object(
        {
          code,

          name,

          subjectType,
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (body, context, reply) => {
      const result = await createSizingDomain(
        database.db,
        {
          organizationId: context.organizationId,

          code: body.code as string,

          name: body.name as string,

          subjectType:
            body.subjectType as
            | 'BODY'
            | 'GARMENT'
            | 'PRODUCT',

          actorId: context.actorId,
        },
      );

      return reply.code(201).send({
        data: result,
      });
    },
  );

  secured(
    'put',
    '/admin/sizing/domains/:domainId',
    {
      params: domainIdParams,

      body: Type.Object(
        {
          name: Type.Optional(name),
        },
        {
          additionalProperties: false,
          minProperties: 1,
        },
      ),
    },
    async (body, context, reply, params) => {
      await updateSizingDomain(database.db, {
        organizationId: context.organizationId,

        id: params.domainId!,

        ...(body.name !== undefined
          ? {
            name: body.name as string,
          }
          : {}),

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'delete',
    '/admin/sizing/domains/:domainId',
    {
      params: domainIdParams,
    },
    async (_body, context, reply, params) => {
      await archiveSizingDomain(database.db, {
        organizationId: context.organizationId,

        id: params.domainId!,

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'post',
    '/admin/sizing/domains/:domainId/restore',
    {
      params: domainIdParams,
    },
    async (_body, context, reply, params) => {
      await restoreSizingDomain(database.db, {
        organizationId: context.organizationId,

        id: params.domainId!,

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                               Size systems                               */
  /* ------------------------------------------------------------------------ */

  secured(
    'post',
    '/admin/sizing/systems',
    {
      body: Type.Object(
        {
          sizingDomainId: uuid,

          code,

          name,

          regionCode: Type.Optional(
            Type.String({
              minLength: 1,
              maxLength: 40,
            }),
          ),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (body, context, reply) => {
      const result = await createSizeSystem(
        database.db,
        {
          organizationId: context.organizationId,

          sizingDomainId:
            body.sizingDomainId as string,

          code: body.code as string,

          name: body.name as string,

          ...(body.regionCode !== undefined
            ? {
              regionCode:
                body.regionCode as string,
            }
            : {}),

          actorId: context.actorId,
        },
      );

      return reply.code(201).send({
        data: result,
      });
    },
  );

  secured(
    'put',
    '/admin/sizing/systems/:systemId',
    {
      params: systemIdParams,

      body: Type.Object(
        {
          name: Type.Optional(name),

          regionCode:
            Type.Optional(nullableShortText),
        },
        {
          additionalProperties: false,
          minProperties: 1,
        },
      ),
    },
    async (body, context, reply, params) => {
      await updateSizeSystem(database.db, {
        organizationId: context.organizationId,

        id: params.systemId!,

        ...(body.name !== undefined
          ? {
            name: body.name as string,
          }
          : {}),

        ...(body.regionCode !== undefined
          ? {
            regionCode:
              body.regionCode as string | null,
          }
          : {}),

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'delete',
    '/admin/sizing/systems/:systemId',
    {
      params: systemIdParams,
    },
    async (_body, context, reply, params) => {
      await archiveSizeSystem(database.db, {
        organizationId: context.organizationId,

        id: params.systemId!,

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'post',
    '/admin/sizing/systems/:systemId/restore',
    {
      params: systemIdParams,
    },
    async (_body, context, reply, params) => {
      await restoreSizeSystem(database.db, {
        organizationId: context.organizationId,

        id: params.systemId!,

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                             Size definitions                             */
  /* ------------------------------------------------------------------------ */

  secured(
    'post',
    '/admin/sizing/definitions',
    {
      body: Type.Object(
        {
          sizeSystemId: uuid,

          code,

          label: Type.String({
            minLength: 1,
            maxLength: 120,
          }),

          sortOrder: Type.Optional(
            Type.Integer({
              minimum: 0,
            }),
          ),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (body, context, reply) => {
      const result = await createSizeDefinition(
        database.db,
        {
          organizationId: context.organizationId,

          sizeSystemId:
            body.sizeSystemId as string,

          code: body.code as string,

          label: body.label as string,

          ...(body.sortOrder !== undefined
            ? {
              sortOrder:
                body.sortOrder as number,
            }
            : {}),

          actorId: context.actorId,
        },
      );

      return reply.code(201).send({
        data: result,
      });
    },
  );

  secured(
    'put',
    '/admin/sizing/definitions/:definitionId',
    {
      params: definitionIdParams,

      body: Type.Object(
        {
          label: Type.Optional(
            Type.String({
              minLength: 1,
              maxLength: 120,
            }),
          ),

          sortOrder: Type.Optional(
            Type.Integer({
              minimum: 0,
            }),
          ),
        },
        {
          additionalProperties: false,
          minProperties: 1,
        },
      ),
    },
    async (body, context, reply, params) => {
      await updateSizeDefinition(database.db, {
        organizationId: context.organizationId,

        id: params.definitionId!,

        ...(body.label !== undefined
          ? {
            label: body.label as string,
          }
          : {}),

        ...(body.sortOrder !== undefined
          ? {
            sortOrder:
              body.sortOrder as number,
          }
          : {}),

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'delete',
    '/admin/sizing/definitions/:definitionId',
    {
      params: definitionIdParams,
    },
    async (_body, context, reply, params) => {
      await archiveSizeDefinition(database.db, {
        organizationId: context.organizationId,

        id: params.definitionId!,

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'post',
    '/admin/sizing/definitions/:definitionId/restore',
    {
      params: definitionIdParams,
    },
    async (_body, context, reply, params) => {
      await restoreSizeDefinition(database.db, {
        organizationId: context.organizationId,

        id: params.definitionId!,

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                         Measurement definitions                          */
  /* ------------------------------------------------------------------------ */

  secured(
    'post',
    '/admin/sizing/measurements',
    {
      body: Type.Object(
        {
          sizingDomainId: uuid,

          code,

          name,

          description:
            Type.Optional(shortText),

          instructions:
            Type.Optional(longText),

          sortOrder: Type.Optional(
            Type.Integer({
              minimum: 0,
            }),
          ),

          subjectType,

          defaultUnit: measurementUnit,
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (body, context, reply) => {
      const result =
        await createMeasurementDefinition(
          database.db,
          {
            organizationId:
              context.organizationId,

            sizingDomainId:
              body.sizingDomainId as string,

            code: body.code as string,

            name: body.name as string,

            ...(body.description !== undefined
              ? {
                description:
                  body.description as string,
              }
              : {}),

            ...(body.instructions !== undefined
              ? {
                instructions:
                  body.instructions as string,
              }
              : {}),

            ...(body.sortOrder !== undefined
              ? {
                sortOrder:
                  body.sortOrder as number,
              }
              : {}),

            subjectType:
              body.subjectType as
              | 'BODY'
              | 'GARMENT'
              | 'PRODUCT',

            defaultUnit:
              body.defaultUnit as
              | 'cm'
              | 'inch',

            actorId: context.actorId,
          },
        );

      return reply.code(201).send({
        data: result,
      });
    },
  );

  secured(
    'put',
    '/admin/sizing/measurements/:measurementId',
    {
      params: measurementIdParams,

      body: Type.Object(
        {
          name: Type.Optional(name),

          description:
            Type.Optional(nullableShortText),

          instructions:
            Type.Optional(nullableLongText),

          sortOrder: Type.Optional(
            Type.Integer({
              minimum: 0,
            }),
          ),

          defaultUnit:
            Type.Optional(measurementUnit),
        },
        {
          additionalProperties: false,
          minProperties: 1,
        },
      ),
    },
    async (body, context, reply, params) => {
      await updateMeasurementDefinition(
        database.db,
        {
          organizationId:
            context.organizationId,

          id: params.measurementId!,

          ...(body.name !== undefined
            ? {
              name: body.name as string,
            }
            : {}),

          ...(body.description !== undefined
            ? {
              description:
                body.description as
                | string
                | null,
            }
            : {}),

          ...(body.instructions !== undefined
            ? {
              instructions:
                body.instructions as
                | string
                | null,
            }
            : {}),

          ...(body.sortOrder !== undefined
            ? {
              sortOrder:
                body.sortOrder as number,
            }
            : {}),

          ...(body.defaultUnit !== undefined
            ? {
              defaultUnit:
                body.defaultUnit as
                | 'cm'
                | 'inch',
            }
            : {}),

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  secured(
    'delete',
    '/admin/sizing/measurements/:measurementId',
    {
      params: measurementIdParams,
    },
    async (_body, context, reply, params) => {
      await archiveMeasurementDefinition(
        database.db,
        {
          organizationId:
            context.organizationId,

          id: params.measurementId!,

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  secured(
    'post',
    '/admin/sizing/measurements/:measurementId/restore',
    {
      params: measurementIdParams,
    },
    async (_body, context, reply, params) => {
      await restoreMeasurementDefinition(
        database.db,
        {
          organizationId:
            context.organizationId,

          id: params.measurementId!,

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                                Size guides                               */
  /* ------------------------------------------------------------------------ */

  secured(
    'post',
    '/admin/sizing/guides',
    {
      body: Type.Object(
        {
          name,

          description:
            Type.Optional(shortText),

          sizingDomainId: uuid,

          /**
           * A guide may optionally be bound to one sizing system.
           *
           * Database invariants must ensure every row-linked
           * sizeDefinition belongs to this system.
           */
          sizeSystemId: Type.Optional(uuid),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (body, context, reply) => {
      const result = await createSizeGuide(
        database.db,
        {
          organizationId: context.organizationId,

          actorId: context.actorId,

          name: body.name as string,

          ...(body.description !== undefined
            ? {
              description:
                body.description as string,
            }
            : {}),

          sizingDomainId:
            body.sizingDomainId as string,

          ...(body.sizeSystemId !== undefined
            ? {
              sizeSystemId:
                body.sizeSystemId as string,
            }
            : {}),
        },
      );

      return reply.code(201).send({
        data: result,
      });
    },
  );

  secured(
    'put',
    '/admin/sizing/guides/:guideId',
    {
      params: guideIdParams,

      body: Type.Object(
        {
          expectedVersion,

          name: Type.Optional(name),

          description:
            Type.Optional(nullableShortText),

          sizeSystemId: Type.Optional(
            Type.Union([
              uuid,
              Type.Null(),
            ]),
          ),
        },
        {
          additionalProperties: false,
          minProperties: 2,
        },
      ),
    },
    async (body, context, reply, params) => {
      await updateSizeGuide(database.db, {
        organizationId: context.organizationId,

        id: params.guideId!,

        expectedVersion:
          body.expectedVersion as number,

        ...(body.name !== undefined
          ? {
            name: body.name as string,
          }
          : {}),

        ...(body.description !== undefined
          ? {
            description:
              body.description as
              | string
              | null,
          }
          : {}),

        ...(body.sizeSystemId !== undefined
          ? {
            sizeSystemId:
              body.sizeSystemId as
              | string
              | null,
          }
          : {}),

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'delete',
    '/admin/sizing/guides/:guideId',
    {
      params: guideIdParams,
    },
    async (_body, context, reply, params) => {
      await archiveSizeGuide(database.db, {
        organizationId: context.organizationId,

        id: params.guideId!,

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'post',
    '/admin/sizing/guides/:guideId/restore',
    {
      params: guideIdParams,
    },
    async (_body, context, reply, params) => {
      await restoreSizeGuide(database.db, {
        organizationId: context.organizationId,

        id: params.guideId!,

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'post',
    '/admin/sizing/guides/:guideId/duplicate',
    {
      params: guideIdParams,

      body: Type.Object(
        {
          name: Type.Optional(name),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (body, context, reply, params) => {
      const result = await duplicateSizeGuide(
        database.db,
        {
          organizationId:
            context.organizationId,

          actorId: context.actorId,

          id: params.guideId!,

          ...(body.name !== undefined
            ? {
              name: body.name as string,
            }
            : {}),
        },
      );

      return reply.code(201).send({
        data: result,
      });
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                              Guide revisions                             */
  /* ------------------------------------------------------------------------ */

  secured(
    'post',
    '/admin/sizing/guides/:guideId/revisions',
    {
      params: guideIdParams,

      body: Type.Object(
        {
          /**
           * When supplied, the new revision is cloned from this
           * revision.
           *
           * If omitted, the database/service layer should normally
           * clone the current published revision when one exists.
           */
          sourceRevisionId:
            Type.Optional(uuid),

          instructions:
            Type.Optional(longText),

          fitNotes:
            Type.Optional(longText),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (body, context, reply, params) => {
      const result =
        await createSizeGuideRevision(
          database.db,
          {
            organizationId:
              context.organizationId,

            sizeGuideId: params.guideId!,

            actorId: context.actorId,

            ...(body.sourceRevisionId !==
              undefined
              ? {
                sourceRevisionId:
                  body.sourceRevisionId as string,
              }
              : {}),

            ...(body.instructions !== undefined
              ? {
                instructions:
                  body.instructions as string,
              }
              : {}),

            ...(body.fitNotes !== undefined
              ? {
                fitNotes:
                  body.fitNotes as string,
              }
              : {}),
          },
        );

      return reply.code(201).send({
        data: result,
      });
    },
  );

  const revisionMetaBody = Type.Object(
    {
      expectedVersion,

      instructions:
        Type.Optional(nullableLongText),

      fitNotes:
        Type.Optional(nullableLongText),
    },
    {
      additionalProperties: false,
      minProperties: 2,
    },
  );

  const updateRevisionMeta: SecuredHandler =
    async (
      body,
      context,
      reply,
      params,
    ) => {
      await updateSizeGuideRevisionMeta(
        database.db,
        {
          organizationId:
            context.organizationId,

          revisionId: params.revisionId!,

          expectedVersion:
            body.expectedVersion as number,

          ...(body.instructions !== undefined
            ? {
              instructions:
                body.instructions as
                | string
                | null,
            }
            : {}),

          ...(body.fitNotes !== undefined
            ? {
              fitNotes:
                body.fitNotes as
                | string
                | null,
            }
            : {}),

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    };

  secured(
    'put',
    '/admin/sizing/revisions/:revisionId/meta',
    {
      params: revisionIdParams,
      body: revisionMetaBody,
    },
    updateRevisionMeta,
  );

  secured(
    'patch',
    '/admin/sizing/revisions/:revisionId/meta',
    {
      params: revisionIdParams,
      body: revisionMetaBody,
    },
    updateRevisionMeta,
  );

  secured(
    'post',
    '/admin/sizing/guides/:guideId/revisions/:revisionId/publish',
    {
      params: guideRevisionParams,

      body: Type.Object(
        {
          expectedVersion,
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (
      body,
      context,
      reply,
      params,
    ) => {
      await publishSizeGuideRevision(
        database.db,
        {
          organizationId:
            context.organizationId,

          sizeGuideId: params.guideId!,

          revisionId: params.revisionId!,

          expectedVersion:
            body.expectedVersion as number,

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                              Revision rows                               */
  /* ------------------------------------------------------------------------ */

  secured(
    'post',
    '/admin/sizing/revisions/:revisionId/rows',
    {
      params: revisionIdParams,

      body: Type.Object(
        {
          expectedVersion,

          displayLabel: Type.String({
            minLength: 1,
            maxLength: 120,
          }),

          position: Type.Integer({
            minimum: 0,
          }),

          sizeDefinitionId:
            Type.Optional(uuid),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (
      body,
      context,
      reply,
      params,
    ) => {
      const result = await addSizeGuideRow(
        database.db,
        {
          organizationId:
            context.organizationId,

          revisionId: params.revisionId!,

          expectedVersion:
            body.expectedVersion as number,

          displayLabel:
            body.displayLabel as string,

          position:
            body.position as number,

          ...(body.sizeDefinitionId !==
            undefined
            ? {
              sizeDefinitionId:
                body.sizeDefinitionId as string,
            }
            : {}),

          actorId: context.actorId,
        },
      );

      return reply.code(201).send({
        data: result,
      });
    },
  );

  secured(
    'patch',
    '/admin/sizing/revisions/:revisionId/rows/:rowId',
    {
      params: revisionRowParams,

      body: Type.Object(
        {
          expectedVersion,

          displayLabel: Type.Optional(
            Type.String({
              minLength: 1,
              maxLength: 120,
            }),
          ),

          position: Type.Optional(
            Type.Integer({
              minimum: 0,
            }),
          ),

          sizeDefinitionId:
            Type.Optional(
              Type.Union([
                uuid,
                Type.Null(),
              ]),
            ),
        },
        {
          additionalProperties: false,
          minProperties: 2,
        },
      ),
    },
    async (
      body,
      context,
      reply,
      params,
    ) => {
      await updateSizeGuideRow(database.db, {
        organizationId:
          context.organizationId,

        revisionId: params.revisionId!,

        rowId: params.rowId!,

        expectedVersion:
          body.expectedVersion as number,

        ...(body.displayLabel !== undefined
          ? {
            displayLabel:
              body.displayLabel as string,
          }
          : {}),

        ...(body.position !== undefined
          ? {
            position:
              body.position as number,
          }
          : {}),

        ...(body.sizeDefinitionId !==
          undefined
          ? {
            sizeDefinitionId:
              body.sizeDefinitionId as
              | string
              | null,
          }
          : {}),

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  secured(
    'delete',
    '/admin/sizing/revisions/:revisionId/rows/:rowId',
    {
      params: revisionRowParams,

      querystring: expectedVersionQuery,
    },
    async (
      _body,
      context,
      reply,
      params,
      query,
    ) => {
      await removeSizeGuideRow(database.db, {
        organizationId:
          context.organizationId,

        revisionId: params.revisionId!,

        rowId: params.rowId!,

        expectedVersion:
          query.expectedVersion as number,

        actorId: context.actorId,
      });

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                              Row ordering                                */
  /* ------------------------------------------------------------------------ */

  secured(
    'put',
    '/admin/sizing/revisions/:revisionId/rows/order',
    {
      params: revisionIdParams,

      body: Type.Object(
        {
          expectedVersion,

          rows: Type.Array(
            Type.Object(
              {
                rowId: uuid,

                position:
                  Type.Integer({
                    minimum: 0,
                  }),
              },
              {
                additionalProperties: false,
              },
            ),
            {
              minItems: 1,
              maxItems: 500,
            },
          ),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (
      body,
      context,
      reply,
      params,
    ) => {
      await reorderSizeGuideRows(
        database.db,
        {
          organizationId:
            context.organizationId,

          revisionId: params.revisionId!,

          expectedVersion:
            body.expectedVersion as number,

          rows: body.rows as Array<{
            rowId: string;
            position: number;
          }>,

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                         Individual matrix cells                          */
  /* ------------------------------------------------------------------------ */

  const exactMeasurementBody = Type.Object(
    {
      expectedVersion,

      unitCode: measurementUnit,

      exact: measurementValue,

      isApproximate:
        Type.Optional(Type.Boolean()),
    },
    {
      additionalProperties: false,
    },
  );

  const rangeMeasurementBody = Type.Object(
    {
      expectedVersion,

      unitCode: measurementUnit,

      min: measurementValue,

      max: measurementValue,

      isApproximate:
        Type.Optional(Type.Boolean()),
    },
    {
      additionalProperties: false,
    },
  );

  secured(
    'put',
    '/admin/sizing/revisions/:revisionId/rows/:rowId/measurements/:measurementDefinitionId',
    {
      params: measurementCellParams,

      body: Type.Union([
        exactMeasurementBody,
        rangeMeasurementBody,
      ]),
    },
    async (
      body,
      context,
      reply,
      params,
    ) => {
      await setSizeGuideMeasurement(
        database.db,
        {
          organizationId:
            context.organizationId,

          revisionId: params.revisionId!,

          rowId: params.rowId!,

          measurementDefinitionId:
            params.measurementDefinitionId!,

          expectedVersion:
            body.expectedVersion as number,

          unitCode:
            body.unitCode as
            | 'cm'
            | 'inch',

          ...(body.exact !== undefined
            ? {
              exact: body.exact as string,
            }
            : {}),

          ...(body.min !== undefined
            ? {
              min: body.min as string,
            }
            : {}),

          ...(body.max !== undefined
            ? {
              max: body.max as string,
            }
            : {}),

          ...(body.isApproximate !==
            undefined
            ? {
              isApproximate:
                body.isApproximate as boolean,
            }
            : {}),

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  secured(
    'delete',
    '/admin/sizing/revisions/:revisionId/rows/:rowId/measurements/:measurementDefinitionId',
    {
      params: measurementCellParams,

      querystring: expectedVersionQuery,
    },
    async (
      _body,
      context,
      reply,
      params,
      query,
    ) => {
      await removeSizeGuideMeasurement(
        database.db,
        {
          organizationId:
            context.organizationId,

          revisionId: params.revisionId!,

          rowId: params.rowId!,

          measurementDefinitionId:
            params.measurementDefinitionId!,

          expectedVersion:
            query.expectedVersion as number,

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                           Bulk matrix editing                            */
  /* ------------------------------------------------------------------------ */

  const bulkExactMeasurement =
    Type.Object(
      {
        operation: Type.Literal('SET'),

        rowId: uuid,

        measurementDefinitionId: uuid,

        unitCode: measurementUnit,

        exact: measurementValue,

        isApproximate:
          Type.Optional(Type.Boolean()),
      },
      {
        additionalProperties: false,
      },
    );

  const bulkRangeMeasurement =
    Type.Object(
      {
        operation: Type.Literal('SET'),

        rowId: uuid,

        measurementDefinitionId: uuid,

        unitCode: measurementUnit,

        min: measurementValue,

        max: measurementValue,

        isApproximate:
          Type.Optional(Type.Boolean()),
      },
      {
        additionalProperties: false,
      },
    );

  const bulkClearMeasurement =
    Type.Object(
      {
        operation: Type.Literal('CLEAR'),

        rowId: uuid,

        measurementDefinitionId: uuid,
      },
      {
        additionalProperties: false,
      },
    );

  secured(
    'put',
    '/admin/sizing/revisions/:revisionId/matrix',
    {
      params: revisionIdParams,

      body: Type.Object(
        {
          expectedVersion,

          changes: Type.Array(
            Type.Union([
              bulkExactMeasurement,
              bulkRangeMeasurement,
              bulkClearMeasurement,
            ]),
            {
              minItems: 1,
              maxItems: 2_000,
            },
          ),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (
      body,
      context,
      reply,
      params,
    ) => {
      await setSizeGuideMeasurementsBulk(
        database.db,
        {
          organizationId:
            context.organizationId,

          revisionId: params.revisionId!,

          expectedVersion:
            body.expectedVersion as number,

          changes:
            body.changes as Array<
              | {
                operation: 'SET';

                rowId: string;

                measurementDefinitionId:
                string;

                unitCode:
                | 'cm'
                | 'inch';

                exact: string;

                isApproximate?: boolean;
              }
              | {
                operation: 'SET';

                rowId: string;

                measurementDefinitionId:
                string;

                unitCode:
                | 'cm'
                | 'inch';

                min: string;

                max: string;

                isApproximate?: boolean;
              }
              | {
                operation: 'CLEAR';

                rowId: string;

                measurementDefinitionId:
                string;
              }
            >,

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                       Product sizing configuration                       */
  /* ------------------------------------------------------------------------ */

  secured(
    'put',
    '/admin/catalog/products/:productId/size-configuration',
    {
      params: productIdParams,

      body: Type.Object(
        {
          sizeSystemId: uuid,

          sizeGuideId:
            Type.Optional(uuid),

          /**
           * Optional catalog optimistic version.
           *
           * When supplied, the sizing service should reject
           * the operation when the product has changed since
           * the admin loaded it.
           */
          expectedProductVersion:
            Type.Optional(expectedVersion),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (
      body,
      context,
      reply,
      params,
    ) => {
      await attachSizeGuideToProduct(
        database.db,
        {
          organizationId:
            context.organizationId,

          productId: params.productId!,

          sizeSystemId:
            body.sizeSystemId as string,

          ...(body.sizeGuideId !== undefined
            ? {
              sizeGuideId:
                body.sizeGuideId as string,
            }
            : {}),

          ...(body.expectedProductVersion !==
            undefined
            ? {
              expectedProductVersion:
                body.expectedProductVersion as number,
            }
            : {}),

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  secured(
    'delete',
    '/admin/catalog/products/:productId/size-configuration',
    {
      params: productIdParams,

      querystring: Type.Object(
        {
          expectedProductVersion:
            Type.Optional(expectedVersion),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (
      _body,
      context,
      reply,
      params,
      query,
    ) => {
      await removeProductSizingConfiguration(
        database.db,
        {
          organizationId:
            context.organizationId,

          productId: params.productId!,

          ...(query.expectedProductVersion !==
            undefined
            ? {
              expectedProductVersion:
                query.expectedProductVersion as number,
            }
            : {}),

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                         Category guide defaults                          */
  /* ------------------------------------------------------------------------ */

  secured(
    'put',
    '/admin/catalog/categories/:categoryId/size-guide',
    {
      params: categoryIdParams,

      body: Type.Object(
        {
          sizeGuideId: Type.Union([
            uuid,
            Type.Null(),
          ]),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (
      body,
      context,
      reply,
      params,
    ) => {
      await setCategoryDefaultSizeGuide(
        database.db,
        {
          organizationId:
            context.organizationId,

          categoryId: params.categoryId!,

          sizeGuideId:
            body.sizeGuideId as
            | string
            | null,

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------------ */
  /*                      Catalog option-size mappings                        */
  /* ------------------------------------------------------------------------ */

  secured(
    'put',
    '/admin/sizing/option-values/:optionValueId/size-definition',
    {
      params: optionValueIdParams,

      body: Type.Object(
        {
          sizeDefinitionId:
            Type.Union([
              uuid,
              Type.Null(),
            ]),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (
      body,
      context,
      reply,
      params,
    ) => {
      await linkOptionValueToSizeDefinition(
        database.db,
        {
          organizationId:
            context.organizationId,

          optionValueId:
            params.optionValueId!,

          sizeDefinitionId:
            body.sizeDefinitionId as
            | string
            | null,

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );

  secured(
    'put',
    '/admin/sizing/option-values/size-definitions/bulk',
    {
      body: Type.Object(
        {
          mappings: Type.Array(
            Type.Object(
              {
                optionValueId: uuid,

                sizeDefinitionId:
                  Type.Union([
                    uuid,
                    Type.Null(),
                  ]),
              },
              {
                additionalProperties: false,
              },
            ),
            {
              minItems: 1,
              maxItems: 1_000,
            },
          ),
        },
        {
          additionalProperties: false,
        },
      ),
    },
    async (
      body,
      context,
      reply,
    ) => {
      await linkOptionValuesToSizeDefinitionsBulk(
        database.db,
        {
          organizationId:
            context.organizationId,

          mappings:
            body.mappings as Array<{
              optionValueId: string;

              sizeDefinitionId:
              | string
              | null;
            }>,

          actorId: context.actorId,
        },
      );

      return reply.code(204).send();
    },
  );
}