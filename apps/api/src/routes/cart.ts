import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  addGuestCartLine,
  applyGuestCartCoupon,
  CartDomainError,
  createGuestCart,
  getGuestCart,
  removeGuestCartCoupon,
  removeGuestCartLine,
  setGuestCartLineQuantity,
} from '@maevelle/database/cart';

const cartCookie = 'maevelle_cart';

function readCartToken(cookie: string | undefined): string | undefined {
  return cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cartCookie}=`))
    ?.slice(cartCookie.length + 1);
}

function setCartCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${cartCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

function error(
  reply: { code(status: number): { send(value: unknown): unknown } },
  caught: unknown,
) {
  if (!(caught instanceof CartDomainError)) throw caught;
  const status =
    caught.code === 'NOT_FOUND'
      ? 404
      : caught.code === 'STALE_VERSION' || caught.code === 'CONFLICT'
        ? 409
        : caught.code === 'UNAVAILABLE'
          ? 422
          : 422;
  return reply.code(status).send({ error: { code: caught.code, message: caught.message } });
}

function tokenFrom(request: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const cookie = request.headers.cookie;
  return readCartToken(Array.isArray(cookie) ? cookie[0] : cookie);
}

export function registerCartRoutes(app: FastifyInstance, database: DatabaseClient): void {
  app.post(
    '/storefront/v1/carts',
    {
      schema: {
        body: Type.Object({
          organizationId: Type.String(),
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
        }),
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as { organizationId: string; currency: string };
        const created = await createGuestCart(database.db, body);
        reply.header('set-cookie', setCartCookie(created.token));
        return reply.code(201).send({ data: created.cart });
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.get('/storefront/v1/carts/current', async (request, reply) => {
    const token = tokenFrom(request);
    if (!token)
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Cart was not found.' } });
    try {
      return { data: await getGuestCart(database.db, token) };
    } catch (caught) {
      return error(reply, caught);
    }
  });

  app.post(
    '/storefront/v1/carts/current/lines',
    {
      schema: {
        body: Type.Object({
          variantId: Type.String(),
          quantity: Type.String({ pattern: '^[1-9]\\d*$' }),
          version: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const token = tokenFrom(request);
      if (!token)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Cart was not found.' } });
      try {
        const idempotencyKey = request.headers['idempotency-key'];
        return {
          data: await addGuestCartLine(database.db, {
            token,
            ...(request.body as { variantId: string; quantity: string; version: number }),
            expectedVersion: (request.body as { version: number }).version,
            ...(typeof idempotencyKey === 'string' && idempotencyKey.trim()
              ? { idempotencyKey }
              : {}),
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.patch(
    '/storefront/v1/carts/current/lines/:lineId',
    {
      schema: {
        body: Type.Object({
          quantity: Type.String({ pattern: '^[1-9]\\d*$' }),
          version: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const token = tokenFrom(request);
      if (!token)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Cart was not found.' } });
      try {
        const body = request.body as { quantity: string; version: number };
        return {
          data: await setGuestCartLineQuantity(database.db, {
            token,
            lineId: (request.params as { lineId: string }).lineId,
            quantity: body.quantity,
            expectedVersion: body.version,
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.delete(
    '/storefront/v1/carts/current/lines/:lineId',
    { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
    async (request, reply) => {
      const token = tokenFrom(request);
      if (!token)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Cart was not found.' } });
      try {
        return {
          data: await removeGuestCartLine(database.db, {
            token,
            lineId: (request.params as { lineId: string }).lineId,
            expectedVersion: (request.body as { version: number }).version,
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.post(
    '/storefront/v1/carts/current/coupons',
    {
      schema: {
        body: Type.Object({
          couponCode: Type.String({ minLength: 2 }),
          version: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const token = tokenFrom(request);
      if (!token)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Cart was not found.' } });
      try {
        return {
          data: await applyGuestCartCoupon(database.db, {
            token,
            ...(request.body as { couponCode: string; version: number }),
            expectedVersion: (request.body as { version: number }).version,
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );

  app.delete(
    '/storefront/v1/carts/current/coupons/:couponCode',
    { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
    async (request, reply) => {
      const token = tokenFrom(request);
      if (!token)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Cart was not found.' } });
      try {
        return {
          data: await removeGuestCartCoupon(database.db, {
            token,
            couponCode: (request.params as { couponCode: string }).couponCode,
            expectedVersion: (request.body as { version: number }).version,
          }),
        };
      } catch (caught) {
        return error(reply, caught);
      }
    },
  );
}
