import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import * as reviews from '@maevelle/database/reviews';
import { findActiveAdminContext } from '@maevelle/database/platform';
import type { createAuth } from '../auth/auth.js';
type Auth = ReturnType<typeof createAuth>;
function headers(s: Record<string, string | string[] | undefined>) {
  return new Headers(
    Object.entries(s).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
  );
}
async function admin(
  d: DatabaseClient,
  a: Auth,
  h: Record<string, string | string[] | undefined>,
  cap: string,
) {
  const s = await a.api.getSession({ headers: headers(h) });
  if (!s?.user?.id) return;
  const c = await findActiveAdminContext(d.db, s.user.id, {
    requiredCapability: cap,
    ...(typeof h['x-organization-id'] === 'string'
      ? { organizationId: h['x-organization-id'] }
      : {}),
  });
  return c && { ...c, actorId: s.user.id };
}
function fail(reply: { code(n: number): { send(v: unknown): unknown } }, e: unknown) {
  if (e instanceof reviews.ReviewDomainError)
    return reply
      .code(
        e.code === 'NOT_FOUND'
          ? 404
          : e.code === 'FORBIDDEN'
            ? 403
            : e.code === 'CONFLICT'
              ? 409
              : 422,
      )
      .send({ error: { code: e.code, message: e.message } });
  throw e;
}
export function registerReviewRoutes(app: FastifyInstance, database: DatabaseClient, auth: Auth) {
  app.get(
    '/products/:productId/reviews',
    {
      schema: {
        querystring: Type.Object({
          organizationId: Type.String(),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
          rating: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
          withMedia: Type.Optional(Type.Boolean()),
          verifiedOnly: Type.Optional(Type.Boolean()),
          sort: Type.Optional(
            Type.Union([
              Type.Literal('NEWEST'),
              Type.Literal('RATING_DESC'),
              Type.Literal('RATING_ASC'),
              Type.Literal('WITH_PHOTOS'),
            ]),
          ),
        }),
      },
    },
    async (req) => {
      const query = req.query as {
        organizationId: string;
        page?: number;
        pageSize?: number;
        rating?: number;
        withMedia?: boolean;
        verifiedOnly?: boolean;
        sort?: 'NEWEST' | 'RATING_DESC' | 'RATING_ASC' | 'WITH_PHOTOS';
      };
      const productId = (req.params as { productId: string }).productId;

      const publicReviews = await reviews.listPublicReviews(database.db, {
        organizationId: query.organizationId,
        productId,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        rating: query.rating ? Number(query.rating) : undefined,
        withMedia: query.withMedia !== undefined ? Boolean(query.withMedia) : undefined,
        verifiedOnly: query.verifiedOnly !== undefined ? Boolean(query.verifiedOnly) : undefined,
        sort: query.sort,
      });

      const summary = await reviews.getRatingSummary(
        database.db,
        query.organizationId,
        productId,
      );

      return {
        data: {
          reviews: publicReviews.items.map((r) => ({
            id: r.id,
            rating: r.rating,
            title: r.title,
            body: r.body,
            public_display_name: r.publicDisplayName,
            publicDisplayName: r.publicDisplayName,
            verified_purchase: r.verifiedPurchase,
            verifiedPurchase: r.verifiedPurchase,
            purchased_variant_label: r.purchasedVariant?.label ?? null,
            purchasedVariant: r.purchasedVariant,
            submitted_at: r.submittedAt,
            submittedAt: r.submittedAt,
            media_asset_ids: r.media.map((m) => m.assetId),
            media: r.media,
            merchant_response: r.merchantResponse?.body ?? null,
            merchantResponse: r.merchantResponse,
          })),
          summary: summary
            ? {
                rating_count: summary.ratingCount,
                ratingCount: summary.ratingCount,
                average_rating: summary.formattedAverage ?? summary.averageRating,
                averageRating: summary.formattedAverage ?? summary.averageRating,
                rating_1_count: summary.rating1Count,
                rating_2_count: summary.rating2Count,
                rating_3_count: summary.rating3Count,
                rating_4_count: summary.rating4Count,
                rating_5_count: summary.rating5Count,
                rating1Count: summary.rating1Count,
                rating2Count: summary.rating2Count,
                rating3Count: summary.rating3Count,
                rating4Count: summary.rating4Count,
                rating5Count: summary.rating5Count,
                text_review_count: summary.textReviewCount,
                textReviewCount: summary.textReviewCount,
                media_review_count: summary.mediaReviewCount,
                mediaReviewCount: summary.mediaReviewCount,
                verified_review_count: summary.verifiedReviewCount,
                verifiedReviewCount: summary.verifiedReviewCount,
                distributionPercentages: summary.distributionPercentages,
              }
            : undefined,
          pagination: {
            page: publicReviews.page,
            pageSize: publicReviews.pageSize,
            totalItems: publicReviews.total,
            totalPages: publicReviews.totalPages,
          },
        },
      };
    },
  );

  app.get(
    '/reviews/eligibility',
    {
      schema: {
        querystring: Type.Object({
          organizationId: Type.String(),
          accessToken: Type.Optional(Type.String()),
          orderLineId: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      try {
        const query = req.query as {
          organizationId: string;
          accessToken?: string;
          orderLineId?: string;
        };
        const eligibility = await reviews.checkReviewEligibility(database.db, {
          organizationId: query.organizationId,
          accessToken: query.accessToken,
          orderLineId: query.orderLineId,
        });
        return { data: eligibility };
      } catch (e) {
        return fail(reply, e);
      }
    },
  );

  app.post(
    '/reviews',
    {
      schema: {
        body: Type.Object({
          organizationId: Type.String(),
          accessToken: Type.String(),
          rating: Type.Integer({ minimum: 1, maximum: 5 }),
          title: Type.Optional(Type.String()),
          body: Type.Optional(Type.String()),
          mediaAssetIds: Type.Optional(Type.Array(Type.String())),
          customDisplayName: Type.Optional(Type.String()),
          idempotencyKey: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      try {
        return reply
          .code(201)
          .send({ data: await reviews.submitReview(database.db, req.body as never) });
      } catch (e) {
        return fail(reply, e);
      }
    },
  );

  app.post(
    '/reviews/revisions',
    {
      schema: {
        body: Type.Object({
          organizationId: Type.String(),
          accessToken: Type.String(),
          rating: Type.Integer({ minimum: 1, maximum: 5 }),
          title: Type.Optional(Type.String()),
          body: Type.Optional(Type.String()),
          mediaAssetIds: Type.Optional(Type.Array(Type.String())),
          customDisplayName: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      try {
        return reply
          .code(201)
          .send({ data: await reviews.submitReviewRevision(database.db, req.body as never) });
      } catch (e) {
        return fail(reply, e);
      }
    },
  );

  app.post(
    '/reviews/:id/withdraw',
    {
      schema: {
        body: Type.Object({
          organizationId: Type.String(),
          accessToken: Type.Optional(Type.String()),
          reason: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      try {
        const body = req.body as {
          organizationId: string;
          accessToken?: string;
          reason?: string;
        };
        const reviewId = (req.params as { id: string }).id;
        return {
          data: await reviews.withdrawReview(database.db, {
            organizationId: body.organizationId,
            reviewId,
            accessToken: body.accessToken,
            reason: body.reason,
          }),
        };
      } catch (e) {
        return fail(reply, e);
      }
    },
  );

  app.get(
    '/admin/reviews',
    {
      schema: {
        querystring: Type.Object({
          queue: Type.Optional(
            Type.Union([
              Type.Literal('ALL'),
              Type.Literal('PENDING'),
              Type.Literal('VISIBLE'),
              Type.Literal('REJECTED'),
              Type.Literal('HIDDEN'),
              Type.Literal('NEEDS_RESPONSE'),
              Type.Literal('MEDIA'),
            ]),
          ),
          search: Type.Optional(Type.String()),
          rating: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          sort: Type.Optional(
            Type.Union([
              Type.Literal('NEWEST'),
              Type.Literal('OLDEST'),
              Type.Literal('RATING_DESC'),
              Type.Literal('RATING_ASC'),
            ]),
          ),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'reviews.view');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = req.query as {
        queue?: 'ALL' | 'PENDING' | 'VISIBLE' | 'REJECTED' | 'HIDDEN' | 'NEEDS_RESPONSE' | 'MEDIA';
        search?: string;
        rating?: number;
        page?: number;
        pageSize?: number;
        sort?: 'NEWEST' | 'OLDEST' | 'RATING_DESC' | 'RATING_ASC';
      };
      const result = await reviews.listAdminReviews(database.db, {
        organizationId: a.organizationId,
        queue: query.queue,
        search: query.search,
        rating: query.rating ? Number(query.rating) : undefined,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        sort: query.sort,
      });

      const itemsWithCompatibility = result.items.map((r) => ({
        ...r,
        product_id: r.productId,
        product_title: r.productTitle,
        revision_id: r.revisionId,
        revision_number: r.revisionNumber,
        public_display_name: r.publicDisplayName,
        moderation_status: r.moderationStatus,
        moderation_reason: r.moderationReason,
        visibility_status: r.visibilityStatus,
        verified_purchase: r.verifiedPurchase,
        purchased_variant_label: r.purchasedVariantLabel,
        order_number: r.orderNumber,
        media_count: r.mediaCount,
        merchant_response: r.merchantResponse,
        submitted_at: r.submittedAt,
        moderated_at: r.moderatedAt,
      }));

      return {
        data: itemsWithCompatibility,
        counts: result.counts,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          totalItems: result.total,
          totalPages: result.totalPages,
        },
      };
    },
  );

  app.get('/admin/reviews/:id', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'reviews.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      const detail = await reviews.getAdminReviewDetail(
        database.db,
        a.organizationId,
        (req.params as { id: string }).id,
      );
      return { data: detail };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post(
    '/admin/reviews/:id/moderate',
    {
      schema: {
        body: Type.Object({
          revisionId: Type.String(),
          decision: Type.Union([
            Type.Literal('APPROVE'),
            Type.Literal('REJECT'),
            Type.Literal('HIDE'),
            Type.Literal('RESTORE'),
          ]),
          reason: Type.Optional(Type.String()),
          internalNotes: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'reviews.moderate');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = req.body as {
          revisionId: string;
          decision: 'APPROVE' | 'REJECT' | 'HIDE' | 'RESTORE';
          reason?: string;
          internalNotes?: string;
        };
        return {
          data: await reviews.moderateReview(database.db, {
            organizationId: a.organizationId,
            actorId: a.actorId,
            reviewId: (req.params as { id: string }).id,
            revisionId: body.revisionId,
            decision: body.decision,
            reason: body.reason as never,
            internalNote: body.internalNotes,
          }),
        };
      } catch (e) {
        return fail(reply, e);
      }
    },
  );

  app.post(
    '/admin/reviews/:id/response',
    { schema: { body: Type.Object({ body: Type.String({ minLength: 1, maxLength: 3000 }) }) } },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'reviews.respond');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await reviews.upsertMerchantResponse(database.db, {
            organizationId: a.organizationId,
            actorId: a.actorId,
            reviewId: (req.params as { id: string }).id,
            body: (req.body as { body: string }).body,
          }),
        });
      } catch (e) {
        return fail(reply, e);
      }
    },
  );

  app.get('/admin/reviews/integrity', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'reviews.integrity');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await reviews.verifyReviewIntegrity(database.db, a.organizationId) };
  });

  app.post('/admin/reviews/products/:productId/rebuild-rating-summary', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'reviews.integrity');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await reviews.rebuildRatingSummary(
        database.db,
        a.organizationId,
        (req.params as { productId: string }).productId,
      ),
    };
  });
}
