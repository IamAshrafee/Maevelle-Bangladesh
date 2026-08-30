import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  listVariantPrices,
  createPriceDefinition,
  PricingDomainError,
  resolveVariantPrice,
  setCurrentVariantPrice,
} from '@maevelle/database/pricing';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function asHeaders(source: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(source).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  );
}

async function requireCapability(
  database: DatabaseClient,
  auth: Auth,
  requestHeaders: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: asHeaders(requestHeaders) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}

function error(
  reply: { code(status: number): { send(value: unknown): unknown } },
  caught: unknown,
) {
  if (!(caught instanceof PricingDomainError)) throw caught;
  return reply
    .code(
      caught.code === 'NOT_FOUND'
        ? 404
        : caught.code === 'CONFLICT' || caught.code === 'STALE_VERSION'
          ? 409
          : 422,
    )
    .send({ error: { code: caught.code, message: caught.message } });
}

export function registerPricingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get(
    '/admin/pricing/prices',
    { schema: { querystring: Type.Object({ variantId: Type.Optional(Type.String()) }) } },
    async (request, reply) => {
      const active = await requireCapability(database, auth, request.headers, 'pricing.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await listVariantPrices(
          database.db,
          active.organizationId,
          (request.query as { variantId?: string }).variantId,
        ),
      };
    },
  );
  app.post(
    '/admin/pricing/prices',
    {
      schema: {
        body: Type.Object({
          variantId: Type.String(),
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
          amount: Type.String(),
          compareAtAmount: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          effectiveFrom: Type.Optional(Type.String({ format: 'date-time' })),
          effectiveTo: Type.Optional(
            Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
          ),
          status: Type.Optional(
            Type.Union([Type.Literal('DRAFT'), Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireCapability(database, auth, request.headers, 'pricing.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          variantId: string;
          currency: string;
          amount: string;
          compareAtAmount?: string | null;
          effectiveFrom?: string;
          effectiveTo?: string | null;
          status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
        };
        const { effectiveFrom, effectiveTo, ...definition } = body;
        return reply.code(201).send({
          data: await createPriceDefinition(database.db, {
            ...active,
            ...definition,
            ...(effectiveFrom ? { effectiveFrom: new Date(effectiveFrom) } : {}),
            ...(effectiveTo
              ? { effectiveTo: new Date(effectiveTo) }
              : effectiveTo === null
                ? { effectiveTo: null }
                : {}),
          }),
        });
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );
  app.put(
    '/admin/pricing/variants/:variantId/current',
    {
      schema: {
        body: Type.Object({
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
          amount: Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' }),
          compareAtAmount: Type.Optional(
            Type.Union([
              Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' }),
              Type.Null(),
            ]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireCapability(database, auth, request.headers, 'pricing.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await setCurrentVariantPrice(database.db, {
            ...active,
            variantId: (request.params as { variantId: string }).variantId,
            ...(request.body as {
              currency: string;
              amount: string;
              compareAtAmount?: string | null;
            }),
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );
  app.get(
    '/storefront/v1/prices',
    {
      schema: {
        querystring: Type.Object({
          organizationId: Type.String(),
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
          variantId: Type.Array(Type.String()),
        }),
      },
    },
    async (request) => {
      const query = request.query as {
        organizationId: string;
        currency: string;
        variantId: string[];
      };
      const prices = await Promise.all(
        query.variantId.map(async (variantId) => ({
          variantId,
          price: await resolveVariantPrice(database.db, {
            organizationId: query.organizationId,
            variantId,
            currency: query.currency,
          }),
        })),
      );
      return {
        data: prices.filter(
          (entry): entry is { variantId: string; price: NonNullable<typeof entry.price> } =>
            entry.price !== undefined,
        ),
      };
    },
  );
}
