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
  const c = await findActiveAdminContext(d.db, s.user.id, { requiredCapability: cap });
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
    { schema: { querystring: Type.Object({ organizationId: Type.String() }) } },
    async (req) => ({
      data: {
        reviews: await reviews.listPublicReviews(
          database.db,
          (req.query as { organizationId: string }).organizationId,
          (req.params as { productId: string }).productId,
        ),
        summary: await reviews.getRatingSummary(
          database.db,
          (req.query as { organizationId: string }).organizationId,
          (req.params as { productId: string }).productId,
        ),
      },
    }),
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
  app.get('/admin/reviews', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'reviews.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await reviews.listAdminReviews(database.db, a.organizationId) };
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
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'reviews.moderate');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await reviews.moderateReview(database.db, {
            organizationId: a.organizationId,
            actorId: a.actorId,
            reviewId: (req.params as { id: string }).id,
            ...(req.body as Record<string, never>),
          } as unknown as Parameters<typeof reviews.moderateReview>[1]),
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
