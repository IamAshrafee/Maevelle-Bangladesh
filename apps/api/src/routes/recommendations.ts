import type { FastifyInstance, FastifyReply } from 'fastify';
import { Type, type Static } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import { sql } from '@maevelle/database';
import {
  evaluateProductRecommendations,
  getProductRecommendationSettings,
  listCompatibilityRules,
  listRecommendationPlacements,
  placementCodes,
  RecommendationError,
  saveCompatibilityRule,
  saveProductRecommendationSettings,
  searchRecommendationProducts,
  updateRecommendationPlacement,
  recommendationCoverage,
  recommendationPerformance,
} from '@maevelle/database/recommendations';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import { requireCatalogCapability, type CatalogAuth } from './catalog-support.js';

const uuid = Type.String({ format: 'uuid' });
const placement = Type.Union([Type.Literal('pdp_complementary'), Type.Literal('pdp_similar')]);
const action = Type.Object({
  targetProductId: uuid,
  action: Type.Union([Type.Literal('PIN'), Type.Literal('BOOST'), Type.Literal('EXCLUDE')]),
  pinPosition: Type.Union([Type.Integer({ minimum: 1, maximum: 100 }), Type.Null()]),
  boost: Type.Union([Type.Integer({ minimum: 1, maximum: 30 }), Type.Null()]),
});
const productWrite = Type.Object({
  placement,
  expectedVersion: Type.Integer({ minimum: 0 }),
  mode: Type.Union([Type.Literal('AUTOMATIC'), Type.Literal('HYBRID'), Type.Literal('MANUAL')]),
  enabled: Type.Union([Type.Boolean(), Type.Null()]),
  targetCount: Type.Union([Type.Integer({ minimum: 1, maximum: 12 }), Type.Null()]),
  minimumScore: Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]),
  actions: Type.Array(action, { maxItems: 100 }),
});

function error(reply: FastifyReply, caught: unknown) {
  if (caught instanceof RecommendationError) {
    const status = caught.code === 'NOT_FOUND' ? 404 : caught.code === 'CONFLICT' ? 409 : 422;
    return reply.code(status).send({ error: { code: caught.code, message: caught.message } });
  }
  if (
    typeof caught === 'object' &&
    caught &&
    'code' in caught &&
    (caught.code === '23503' || caught.code === '23505' || caught.code === '23514')
  )
    return reply.code(422).send({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Recommendation configuration is invalid or conflicts with another entry.',
      },
    });
  throw caught;
}

export function registerRecommendationRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: CatalogAuth,
  storefrontOrganizationCode = 'maevelle',
): void {
  app.get(
    '/storefront/v1/products/:handle/recommendations',
    {
      schema: {
        querystring: Type.Object({
          organizationId: uuid,
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
          placements: Type.Optional(Type.String({ maxLength: 80 })),
        }),
      },
    },
    async (request, reply) => {
      const query = request.query as {
        organizationId: string;
        currency: string;
        placements?: string;
      };
      const context = await resolveStorefrontContext(database.db, storefrontOrganizationCode);
      if (
        !context ||
        context.organizationId !== query.organizationId ||
        context.currency !== query.currency
      )
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Storefront not found.' } });
      const asked = query.placements?.split(',') ?? [...placementCodes];
      if (
        asked.length > 2 ||
        new Set(asked).size !== asked.length ||
        asked.some((code) => !placementCodes.includes(code as (typeof placementCodes)[number]))
      )
        return reply.code(422).send({
          error: { code: 'VALIDATION_FAILED', message: 'Invalid recommendation placements.' },
        });
      const product = await sql<{
        id: string;
      }>`select id::text from catalog.products where organization_id=${context.organizationId} and handle=${(request.params as { handle: string }).handle}`.execute(
        database.db,
      );
      if (!product.rows[0])
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Product not found.' } });
      try {
        return {
          data: await evaluateProductRecommendations(database.db, {
            organizationId: context.organizationId,
            productId: product.rows[0].id,
            currency: query.currency,
            placements: asked as (typeof placementCodes)[number][],
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.get('/admin/recommendations/placements', async (request, reply) => {
    const admin = await requireCatalogCapability(
      database,
      auth,
      request.headers,
      'recommendations.view',
    );
    if (!admin)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return { data: await listRecommendationPlacements(database.db, admin.organizationId) };
  });
  app.patch(
    '/admin/recommendations/placements/:code',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 0 }),
          enabled: Type.Boolean(),
          targetCount: Type.Integer({ minimum: 1, maximum: 12 }),
          candidateLimit: Type.Integer({ minimum: 12, maximum: 200 }),
          minimumScore: Type.Integer({ minimum: 0, maximum: 100 }),
        }),
      },
    },
    async (request, reply) => {
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'recommendations.manage',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const code = (request.params as { code: string }).code;
      if (!placementCodes.includes(code as (typeof placementCodes)[number]))
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Placement not found.' } });
      try {
        return {
          data: await updateRecommendationPlacement(database.db, {
            organizationId: admin.organizationId,
            actorId: admin.actorId,
            code: code as (typeof placementCodes)[number],
            ...(request.body as {
              expectedVersion: number;
              enabled: boolean;
              targetCount: number;
              candidateLimit: number;
              minimumScore: number;
            }),
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.get(
    '/admin/recommendations/products/:productId',
    { schema: { params: Type.Object({ productId: uuid }) } },
    async (request, reply) => {
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'recommendations.view',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await getProductRecommendationSettings(
            database.db,
            admin.organizationId,
            (request.params as { productId: string }).productId,
          ),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );
  app.patch(
    '/admin/recommendations/products/:productId',
    { schema: { params: Type.Object({ productId: uuid }), body: productWrite } },
    async (request, reply) => {
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'recommendations.curate',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await saveProductRecommendationSettings(database.db, {
            organizationId: admin.organizationId,
            actorId: admin.actorId,
            productId: (request.params as { productId: string }).productId,
            ...(request.body as Static<typeof productWrite>),
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );
  app.post(
    '/admin/recommendations/preview',
    {
      schema: {
        body: Type.Object({
          productId: uuid,
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
          proposed: Type.Optional(productWrite),
          placementSettings: Type.Optional(
            Type.Object({
              code: placement,
              enabled: Type.Boolean(),
              targetCount: Type.Integer({ minimum: 1, maximum: 12 }),
              candidateLimit: Type.Integer({ minimum: 12, maximum: 200 }),
              minimumScore: Type.Integer({ minimum: 0, maximum: 100 }),
            }),
          ),
        }),
      },
    },
    async (request, reply) => {
      const body = request.body as {
        productId: string;
        currency: string;
        proposed?: Static<typeof productWrite>;
        placementSettings?: {
          code: (typeof placementCodes)[number];
          enabled: boolean;
          targetCount: number;
          candidateLimit: number;
          minimumScore: number;
        };
      };
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        body.placementSettings
          ? 'recommendations.manage'
          : body.proposed
            ? 'recommendations.curate'
            : 'recommendations.view',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      if (
        body.proposed &&
        (body.proposed.actions.some((item) => item.targetProductId === body.productId) ||
          new Set(body.proposed.actions.map((item) => item.targetProductId)).size !==
            body.proposed.actions.length ||
          body.proposed.actions.some((item) =>
            item.action === 'PIN'
              ? item.pinPosition === null || item.boost !== null
              : item.action === 'BOOST'
                ? item.pinPosition !== null || item.boost === null
                : item.pinPosition !== null || item.boost !== null,
          ))
      )
        return reply.code(422).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Preview actions are invalid or conflict with the source Product.',
          },
        });
      try {
        const placementOverride = body.placementSettings
          ? {
              ...(await listRecommendationPlacements(database.db, admin.organizationId)).find(
                (item) => item.code === body.placementSettings!.code,
              )!,
              ...body.placementSettings,
            }
          : undefined;
        return {
          data: await evaluateProductRecommendations(database.db, {
            organizationId: admin.organizationId,
            productId: body.productId,
            currency: body.currency,
            ...(body.proposed
              ? { proposed: { ...body.proposed, version: body.proposed.expectedVersion } }
              : {}),
            ...(placementOverride ? { placementOverride } : {}),
            preview: true,
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );
  app.get(
    '/admin/recommendations/product-picker',
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String({ maxLength: 120 })),
          sourceProductId: Type.Optional(uuid),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        }),
      },
    },
    async (request, reply) => {
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'recommendations.view',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const query = request.query as {
        q?: string;
        sourceProductId?: string;
        page?: number;
        pageSize?: number;
      };
      return {
        data: await searchRecommendationProducts(database.db, {
          organizationId: admin.organizationId,
          query: query.q ?? '',
          ...(query.sourceProductId ? { sourceProductId: query.sourceProductId } : {}),
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
        }),
      };
    },
  );
  app.get(
    '/admin/recommendations/compatibility-rules',
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String({ maxLength: 120 })),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        }),
      },
    },
    async (request, reply) => {
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'recommendations.view',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const query = request.query as { q?: string; page?: number; pageSize?: number };
      return {
        data: await listCompatibilityRules(database.db, admin.organizationId, {
          query: query.q ?? '',
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
        }),
      };
    },
  );
  app.put(
    '/admin/recommendations/compatibility-rules',
    {
      schema: {
        body: Type.Object({
          sourceProductTypeId: uuid,
          targetProductTypeId: uuid,
          strength: Type.Integer({ minimum: 1, maximum: 100 }),
          enabled: Type.Boolean(),
          expectedVersion: Type.Integer({ minimum: 0 }),
        }),
      },
    },
    async (request, reply) => {
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'recommendations.manage',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await saveCompatibilityRule(database.db, {
            organizationId: admin.organizationId,
            actorId: admin.actorId,
            ...(request.body as {
              sourceProductTypeId: string;
              targetProductTypeId: string;
              strength: number;
              enabled: boolean;
              expectedVersion: number;
            }),
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );
  app.get(
    '/admin/recommendations/coverage',
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String({ maxLength: 120 })),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
          currency: Type.Optional(Type.String({ pattern: '^[A-Z]{3}$' })),
        }),
      },
    },
    async (request, reply) => {
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'recommendations.view',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const query = request.query as {
        q?: string;
        page?: number;
        pageSize?: number;
        currency?: string;
      };
      return {
        data: await recommendationCoverage(database.db, {
          organizationId: admin.organizationId,
          query: query.q ?? '',
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 10,
          currency: query.currency ?? 'BDT',
        }),
      };
    },
  );
  app.get(
    '/admin/recommendations/performance',
    {
      schema: {
        querystring: Type.Object({
          from: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
          to: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
        }),
      },
    },
    async (request, reply) => {
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'analytics.view',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const period = request.query as { from: string; to: string };
      const fromDate = new Date(`${period.from}T00:00:00.000Z`);
      const toDate = new Date(`${period.to}T00:00:00.000Z`);
      if (
        Number.isNaN(fromDate.valueOf()) ||
        Number.isNaN(toDate.valueOf()) ||
        fromDate.toISOString().slice(0, 10) !== period.from ||
        toDate.toISOString().slice(0, 10) !== period.to ||
        toDate.valueOf() < fromDate.valueOf() ||
        toDate.valueOf() - fromDate.valueOf() > 366 * 86400000
      )
        return reply.code(422).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Choose a valid date range of at most 366 days.',
          },
        });
      return {
        data: await recommendationPerformance(database.db, {
          organizationId: admin.organizationId,
          ...period,
        }),
      };
    },
  );
  app.post(
    '/admin/recommendations/bulk',
    {
      schema: {
        body: Type.Object({
          productIds: Type.Array(uuid, { minItems: 1, maxItems: 20, uniqueItems: true }),
          dryRun: Type.Boolean(),
          placement,
          enabled: Type.Optional(Type.Boolean()),
          targetProductId: Type.Optional(uuid),
          action: Type.Optional(
            Type.Union([
              Type.Literal('PIN'),
              Type.Literal('BOOST'),
              Type.Literal('EXCLUDE'),
              Type.Literal('REMOVE'),
            ]),
          ),
          boost: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
        }),
      },
    },
    async (request, reply) => {
      const admin = await requireCatalogCapability(
        database,
        auth,
        request.headers,
        'recommendations.curate',
      );
      if (!admin)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const body = request.body as {
        productIds: string[];
        dryRun: boolean;
        placement: (typeof placementCodes)[number];
        enabled?: boolean;
        targetProductId?: string;
        action?: 'PIN' | 'BOOST' | 'EXCLUDE' | 'REMOVE';
        boost?: number;
      };
      if (
        (body.enabled === undefined && !body.action) ||
        Boolean(body.action) !== Boolean(body.targetProductId)
      )
        return reply
          .code(422)
          .send({
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Choose an enablement change or a target Product action.',
            },
          });
      if (body.targetProductId) {
        const target = await sql<{
          id: string;
        }>`select id::text from catalog.products where organization_id=${admin.organizationId} and id=${body.targetProductId}::uuid`.execute(
          database.db,
        );
        if (!target.rows[0])
          return reply
            .code(422)
            .send({
              error: {
                code: 'VALIDATION_FAILED',
                message: 'Target Product is outside this organization.',
              },
            });
      }
      const outcomes = [];
      for (const productId of body.productIds) {
        try {
          const current = (
            await getProductRecommendationSettings(database.db, admin.organizationId, productId)
          ).find((item) => item.placement === body.placement)!;
          if (body.targetProductId === productId)
            throw new RecommendationError(
              'VALIDATION_FAILED',
              'A Product cannot recommend itself.',
            );
          let actions = [...current.actions];
          if (body.action && body.targetProductId) {
            const existing = actions.find((item) => item.targetProductId === body.targetProductId);
            actions = actions.filter((item) => item.targetProductId !== body.targetProductId);
            if (body.action !== 'REMOVE') {
              const pinPosition =
                body.action === 'PIN'
                  ? existing?.action === 'PIN'
                    ? existing.pinPosition
                    : Math.max(
                        0,
                        ...actions
                          .filter((item) => item.action === 'PIN')
                          .map((item) => item.pinPosition ?? 0),
                      ) + 1
                  : null;
              if (pinPosition !== null && pinPosition > 100)
                throw new RecommendationError('VALIDATION_FAILED', 'Pin limit reached.');
              actions.push({
                targetProductId: body.targetProductId,
                action: body.action,
                pinPosition,
                boost: body.action === 'BOOST' ? (body.boost ?? 10) : null,
              });
            }
          }
          if (actions.length > 100)
            throw new RecommendationError('VALIDATION_FAILED', 'The Product action limit is 100.');
          const enabled = body.enabled === undefined ? current.enabled : body.enabled;
          const sameActions =
            current.actions.length === actions.length &&
            current.actions.every((before) =>
              actions.some(
                (after) =>
                  after.targetProductId === before.targetProductId &&
                  after.action === before.action &&
                  after.pinPosition === before.pinPosition &&
                  after.boost === before.boost,
              ),
            );
          if (current.enabled === enabled && sameActions) {
            outcomes.push({ productId, status: 'UNCHANGED' });
            continue;
          }
          if (!body.dryRun)
            await saveProductRecommendationSettings(database.db, {
              organizationId: admin.organizationId,
              actorId: admin.actorId,
              productId,
              ...current,
              expectedVersion: current.version,
              enabled,
              actions,
            });
          outcomes.push({ productId, status: body.dryRun ? 'READY' : 'APPLIED' });
        } catch (caught) {
          outcomes.push({
            productId,
            status: 'FAILED',
            reason: caught instanceof Error ? caught.message : 'Unable to update Product.',
          });
        }
      }
      return { data: { outcomes } };
    },
  );
}
