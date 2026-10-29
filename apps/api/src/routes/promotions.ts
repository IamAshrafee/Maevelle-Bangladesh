import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  createCouponCode,
  createPromotion,
  getAdminPromotionDetail,
  listAdminPromotions,
  PromotionDomainError,
  updateCouponCode,
  updatePromotion,
  updatePromotionStatus,
} from '@maevelle/database/promotions';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function headers(source: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(source).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  );
}
async function capability(
  database: DatabaseClient,
  auth: Auth,
  source: Record<string, string | string[] | undefined>,
  requiredCapability = 'promotions.manage',
) {
  const session = await auth.api.getSession({ headers: headers(source) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability,
    ...(typeof source['x-organization-id'] === 'string'
      ? { organizationId: source['x-organization-id'] }
      : {}),
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}
function error(
  reply: { code(status: number): { send(value: unknown): unknown } },
  caught: unknown,
) {
  if (!(caught instanceof PromotionDomainError)) throw caught;
  return reply
    .code(caught.code === 'NOT_FOUND' ? 404 : caught.code === 'CONFLICT' ? 409 : 422)
    .send({ error: { code: caught.code, message: caught.message } });
}
export function registerPromotionRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/promotions', async (request, reply) => {
    const active = await capability(database, auth, request.headers, 'promotions.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listAdminPromotions(database.db, active.organizationId) };
  });

  app.get(
    '/admin/promotions/:promotionId',
    { schema: { params: Type.Object({ promotionId: Type.String() }) } },
    async (request, reply) => {
      const active = await capability(database, auth, request.headers, 'promotions.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const detail = await getAdminPromotionDetail(
        database.db,
        active.organizationId,
        (request.params as { promotionId: string }).promotionId,
      );
      if (!detail) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Promotion not found' } });
      return { data: detail };
    },
  );

  app.post(
    '/admin/promotions',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1 }),
          promotionType: Type.Union([Type.Literal('AUTOMATIC'), Type.Literal('COUPON')]),
          status: Type.Optional(Type.Union([Type.Literal('DRAFT'), Type.Literal('ACTIVE'), Type.Literal('INACTIVE')])),
          benefitType: Type.Union([
            Type.Literal('PERCENTAGE_DISCOUNT'),
            Type.Literal('FIXED_AMOUNT_DISCOUNT'),
          ]),
          benefitValue: Type.String(),
          combinability: Type.Union([Type.Literal('STACKABLE'), Type.Literal('EXCLUSIVE')]),
          startsAt: Type.Optional(Type.String({ format: 'date-time' })),
          endsAt: Type.Optional(Type.Union([Type.String({ format: 'date-time' }), Type.Null()])),
          priority: Type.Optional(Type.Integer()),
          minimumMerchandiseSubtotal: Type.Optional(Type.String()),
          productIds: Type.Optional(Type.Array(Type.String())),
          variantIds: Type.Optional(Type.Array(Type.String())),
          categoryIds: Type.Optional(Type.Array(Type.String())),
        }),
      },
    },
    async (request, reply) => {
      const active = await capability(database, auth, request.headers);
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as Omit<
          Parameters<typeof createPromotion>[1],
          'organizationId' | 'actorId' | 'startsAt' | 'endsAt'
        > & { startsAt?: string; endsAt?: string | null };
        const { startsAt, endsAt, ...definition } = body;
        return reply.code(201).send({
          data: await createPromotion(database.db, {
            ...active,
            ...definition,
            ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
            ...(endsAt ? { endsAt: new Date(endsAt) } : endsAt === null ? { endsAt: null } : {}),
          }),
        });
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.patch(
    '/admin/promotions/:promotionId',
    {
      schema: {
        params: Type.Object({ promotionId: Type.String() }),
        body: Type.Object({
          name: Type.Optional(Type.String({ minLength: 1 })),
          status: Type.Optional(
            Type.Union([
              Type.Literal('DRAFT'),
              Type.Literal('ACTIVE'),
              Type.Literal('INACTIVE'),
              Type.Literal('ARCHIVED'),
            ]),
          ),
          benefitType: Type.Optional(
            Type.Union([
              Type.Literal('PERCENTAGE_DISCOUNT'),
              Type.Literal('FIXED_AMOUNT_DISCOUNT'),
            ]),
          ),
          benefitValue: Type.Optional(Type.String()),
          combinability: Type.Optional(Type.Union([Type.Literal('STACKABLE'), Type.Literal('EXCLUSIVE')])),
          startsAt: Type.Optional(Type.Union([Type.String({ format: 'date-time' }), Type.Null()])),
          endsAt: Type.Optional(Type.Union([Type.String({ format: 'date-time' }), Type.Null()])),
          priority: Type.Optional(Type.Integer()),
          minimumMerchandiseSubtotal: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          productIds: Type.Optional(Type.Array(Type.String())),
          variantIds: Type.Optional(Type.Array(Type.String())),
          categoryIds: Type.Optional(Type.Array(Type.String())),
        }),
      },
    },
    async (request, reply) => {
      const active = await capability(database, auth, request.headers);
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          name?: string;
          status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
          benefitType?: 'PERCENTAGE_DISCOUNT' | 'FIXED_AMOUNT_DISCOUNT';
          benefitValue?: string;
          combinability?: 'STACKABLE' | 'EXCLUSIVE';
          startsAt?: string | null;
          endsAt?: string | null;
          priority?: number;
          minimumMerchandiseSubtotal?: string | null;
          productIds?: string[];
          variantIds?: string[];
          categoryIds?: string[];
        };
        const { startsAt, endsAt, ...definition } = body;
        await updatePromotion(database.db, {
          ...active,
          promotionId: (request.params as { promotionId: string }).promotionId,
          ...definition,
          ...(startsAt !== undefined ? { startsAt: startsAt ? new Date(startsAt) : null } : {}),
          ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
        });
        return reply.code(200).send({ data: { success: true } });
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.patch(
    '/admin/promotions/:promotionId/status',
    {
      schema: {
        params: Type.Object({ promotionId: Type.String() }),
        body: Type.Object({
          status: Type.Union([
            Type.Literal('DRAFT'),
            Type.Literal('ACTIVE'),
            Type.Literal('INACTIVE'),
            Type.Literal('ARCHIVED'),
          ]),
        }),
      },
    },
    async (request, reply) => {
      const active = await capability(database, auth, request.headers);
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const { status } = request.body as { status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' };
        await updatePromotionStatus(database.db, {
          ...active,
          promotionId: (request.params as { promotionId: string }).promotionId,
          status,
        });
        return reply.code(200).send({ data: { success: true, status } });
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.post(
    '/admin/promotions/:promotionId/coupons',
    {
      schema: {
        params: Type.Object({ promotionId: Type.String() }),
        body: Type.Object({
          code: Type.String({ minLength: 2 }),
          usageLimitTotal: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
          usageLimitPerCustomer: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
        }),
      },
    },
    async (request, reply) => {
      const active = await capability(database, auth, request.headers);
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createCouponCode(database.db, {
            ...active,
            promotionId: (request.params as { promotionId: string }).promotionId,
            ...(request.body as { code: string; usageLimitTotal?: number | null; usageLimitPerCustomer?: number | null }),
          }),
        });
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.patch(
    '/admin/promotions/:promotionId/coupons/:couponId',
    {
      schema: {
        params: Type.Object({ promotionId: Type.String(), couponId: Type.String() }),
        body: Type.Object({
          status: Type.Optional(
            Type.Union([Type.Literal('ACTIVE'), Type.Literal('INACTIVE'), Type.Literal('ARCHIVED')]),
          ),
          usageLimitTotal: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
          usageLimitPerCustomer: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
        }),
      },
    },
    async (request, reply) => {
      const active = await capability(database, auth, request.headers);
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        await updateCouponCode(database.db, {
          ...active,
          promotionId: (request.params as { promotionId: string }).promotionId,
          couponId: (request.params as { couponId: string }).couponId,
          ...(request.body as {
            status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
            usageLimitTotal?: number | null;
            usageLimitPerCustomer?: number | null;
          }),
        });
        return reply.code(200).send({ data: { success: true } });
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );
}
