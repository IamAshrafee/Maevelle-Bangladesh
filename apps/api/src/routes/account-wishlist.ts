import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import {
  AccountWishlistError,
  getWishlistPage,
  getWishlistSavedState,
  mergeGuestWishlist,
  removeWishlistProduct,
  saveWishlistProduct,
  type WishlistOwner,
} from '@maevelle/database/wishlist-account';

const uuid = Type.String({ format: 'uuid' });
const productParams = Type.Object({ productId: uuid });
const saveBody = Type.Object(
  {
    preferredVariantId: Type.Optional(Type.Union([uuid, Type.Null()])),
    expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

/** Private routes are registered only with the verified shopper-realm resolver. */
export function registerAccountWishlistRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  resolveShopper: (request: FastifyRequest) => Promise<WishlistOwner | null>,
): void {
  async function authorized(
    request: FastifyRequest,
    reply: { code(status: number): { send(value: unknown): unknown } },
  ) {
    const owner = await resolveShopper(request);
    if (!owner) {
      reply
        .code(401)
        .send({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to view your wishlist.' } });
      return null;
    }
    return owner;
  }
  function fail(
    reply: { code(status: number): { send(value: unknown): unknown } },
    error: unknown,
  ) {
    if (!(error instanceof AccountWishlistError)) throw error;
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'VERSION_CONFLICT' || error.code === 'IDEMPOTENCY_CONFLICT'
            ? 409
            : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }

  app.get(
    '/storefront/v1/wishlist',
    {
      schema: {
        querystring: Type.Object(
          {
            cursor: Type.Optional(Type.String({ maxLength: 200 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const owner = await authorized(request, reply);
      if (!owner) return;
      try {
        return {
          data: await getWishlistPage(
            database.db,
            owner,
            request.query as { cursor?: string; limit?: number },
          ),
        };
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.post(
    '/storefront/v1/wishlist/saved-state',
    {
      schema: {
        body: Type.Object(
          { productIds: Type.Array(uuid, { maxItems: 100, uniqueItems: true }) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const owner = await authorized(request, reply);
      if (!owner) return;
      try {
        return {
          data: await getWishlistSavedState(
            database.db,
            owner,
            (request.body as { productIds: string[] }).productIds,
          ),
        };
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.post(
    '/storefront/v1/wishlist/merges',
    {
      schema: {
        body: Type.Object(
          {
            mergeId: uuid,
            baseVersion: Type.Integer({ minimum: 1 }),
            items: Type.Array(
              Type.Object(
                {
                  productId: uuid,
                  preferredVariantId: Type.Union([uuid, Type.Null()]),
                  savedAt: Type.String({ maxLength: 40 }),
                },
                { additionalProperties: false },
              ),
              { maxItems: 100 },
            ),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const owner = await authorized(request, reply);
      if (!owner) return;
      try {
        return {
          data: await mergeGuestWishlist(
            database.db,
            owner,
            request.body as {
              mergeId: string;
              baseVersion: number;
              items: { productId: string; preferredVariantId: string | null; savedAt: string }[];
            },
          ),
        };
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.put(
    '/storefront/v1/wishlist/items/:productId',
    {
      schema: { params: productParams, body: saveBody },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const owner = await authorized(request, reply);
      if (!owner) return;
      try {
        return {
          data: await saveWishlistProduct(
            database.db,
            owner,
            (request.params as { productId: string }).productId,
            request.body as { preferredVariantId?: string | null; expectedVersion?: number },
          ),
        };
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.delete(
    '/storefront/v1/wishlist/items/:productId',
    {
      schema: {
        params: productParams,
        querystring: Type.Object(
          {
            expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const owner = await authorized(request, reply);
      if (!owner) return;
      try {
        return {
          data: await removeWishlistProduct(
            database.db,
            owner,
            (request.params as { productId: string }).productId,
            (request.query as { expectedVersion?: number }).expectedVersion,
          ),
        };
      } catch (error) {
        return fail(reply, error);
      }
    },
  );
}
