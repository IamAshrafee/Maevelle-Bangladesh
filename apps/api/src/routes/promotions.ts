import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  createCouponCode,
  createPromotion,
  listAdminPromotions,
  PromotionDomainError,
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

  app.post(
    '/admin/promotions',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1 }),
          promotionType: Type.Union([Type.Literal('AUTOMATIC'), Type.Literal('COUPON')]),
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
  app.post(
    '/admin/promotions/:promotionId/coupons',
    { schema: { body: Type.Object({ code: Type.String({ minLength: 2 }) }) } },
    async (request, reply) => {
      const active = await capability(database, auth, request.headers);
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createCouponCode(database.db, {
            ...active,
            promotionId: (request.params as { promotionId: string }).promotionId,
            ...(request.body as { code: string }),
          }),
        });
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );
}
