import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  cancelOrder,
  createCheckout,
  getCheckout,
  getOrderForAdmin,
  getOrderForCheckout,
  listOrders,
  OrderDomainError,
  placeOrder,
  refreshCheckout,
  updateCheckoutAddress,
  updateCheckoutContact,
  updateOrderStatus,
} from '@maevelle/database/orders';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

const cartCookie = 'maevelle_cart';
const checkoutCookie = 'maevelle_checkout';
type Auth = ReturnType<typeof createAuth>;

function token(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const cookie = headers.cookie;
  const source = Array.isArray(cookie) ? cookie[0] : cookie;
  return source
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function setCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
function sendError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  caught: unknown,
) {
  if (!(caught instanceof OrderDomainError)) throw caught;
  const status =
    caught.code === 'NOT_FOUND'
      ? 404
      : [
            'CHECKOUT_CHANGED',
            'CHECKOUT_COMPLETED',
            'STALE_VERSION',
            'IDEMPOTENCY_CONFLICT',
          ].includes(caught.code)
        ? 409
        : caught.code === 'OUT_OF_STOCK'
          ? 422
          : 422;
  return reply.code(status).send({
    error: {
      code: caught.code,
      message: caught.message,
      ...(caught.checkout ? { checkout: caught.checkout } : {}),
    },
  });
}
function headers(value: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(value).flatMap(([name, header]) =>
      typeof header === 'string' ? [[name, header]] : [],
    ),
  );
}
async function admin(
  database: DatabaseClient,
  auth: Auth,
  requestHeaders: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(requestHeaders) });
  if (!session?.user?.id) return undefined;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}
const contactSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  phone: Type.String({ minLength: 7 }),
  email: Type.Optional(Type.String()),
});
const addressSchema = Type.Object({
  recipientName: Type.String({ minLength: 1 }),
  phone: Type.String({ minLength: 1 }),
  addressLine1: Type.String({ minLength: 1 }),
  addressLine2: Type.Optional(Type.String()),
  geographyNodeId: Type.Optional(Type.String()),
  area: Type.Optional(Type.String()),
  city: Type.Optional(Type.String()),
  district: Type.Optional(Type.String()),
  postalCode: Type.Optional(Type.String()),
  countryCode: Type.String({ pattern: '^[A-Z]{2}$' }),
});

export function registerOrderRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.post('/storefront/v1/checkouts', async (request, reply) => {
    const cartToken = token(request.headers, cartCookie);
    if (!cartToken)
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Cart was not found.' } });
    try {
      const created = await createCheckout(database.db, { cartToken });
      reply.header('set-cookie', setCookie(checkoutCookie, created.token));
      return reply.code(201).send({ data: created.checkout });
    } catch (caught) {
      return sendError(reply, caught);
    }
  });
  app.get('/storefront/v1/checkouts/current', async (request, reply) => {
    const checkoutToken = token(request.headers, checkoutCookie);
    const cartToken = token(request.headers, cartCookie);
    if (!checkoutToken || !cartToken)
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Checkout was not found.' } });
    try {
      return { data: await getCheckout(database.db, { checkoutToken, cartToken }) };
    } catch (caught) {
      return sendError(reply, caught);
    }
  });
  app.put(
    '/storefront/v1/checkouts/current/contact',
    {
      schema: {
        body: Type.Intersect([
          contactSchema,
          Type.Object({ version: Type.Integer({ minimum: 1 }) }),
        ]),
      },
    },
    async (request, reply) => {
      const checkoutToken = token(request.headers, checkoutCookie);
      const cartToken = token(request.headers, cartCookie);
      if (!checkoutToken || !cartToken)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Checkout was not found.' } });
      try {
        const body = request.body as {
          version: number;
          name: string;
          phone: string;
          email?: string;
        };
        return {
          data: await updateCheckoutContact(database.db, {
            checkoutToken,
            cartToken,
            expectedVersion: body.version,
            contact: {
              name: body.name,
              phone: body.phone,
              ...(body.email ? { email: body.email } : {}),
            },
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.put(
    '/storefront/v1/checkouts/current/address',
    {
      schema: {
        body: Type.Intersect([
          addressSchema,
          Type.Object({ version: Type.Integer({ minimum: 1 }) }),
        ]),
      },
    },
    async (request, reply) => {
      const checkoutToken = token(request.headers, checkoutCookie);
      const cartToken = token(request.headers, cartCookie);
      if (!checkoutToken || !cartToken)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Checkout was not found.' } });
      try {
        const body = request.body as { version: number } & Parameters<
          typeof updateCheckoutAddress
        >[1]['address'];
        return {
          data: await updateCheckoutAddress(database.db, {
            checkoutToken,
            cartToken,
            expectedVersion: body.version,
            address: body,
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.post(
    '/storefront/v1/checkouts/current/refresh',
    { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
    async (request, reply) => {
      const checkoutToken = token(request.headers, checkoutCookie);
      const cartToken = token(request.headers, cartCookie);
      if (!checkoutToken || !cartToken)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Checkout was not found.' } });
      try {
        return {
          data: await refreshCheckout(database.db, {
            checkoutToken,
            cartToken,
            expectedVersion: (request.body as { version: number }).version,
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.post(
    '/storefront/v1/checkouts/current/place-order',
    {
      schema: {
        body: Type.Object({
          calculationVersion: Type.Integer({ minimum: 1 }),
          calculationFingerprint: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const checkoutToken = token(request.headers, checkoutCookie);
      const cartToken = token(request.headers, cartCookie);
      const key = request.headers['idempotency-key'];
      if (!checkoutToken || !cartToken)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Checkout was not found.' } });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        const body = request.body as { calculationVersion: number; calculationFingerprint: string };
        const result = await placeOrder(database.db, {
          checkoutToken,
          cartToken,
          acceptedCalculationVersion: body.calculationVersion,
          acceptedCalculationFingerprint: body.calculationFingerprint,
          idempotencyKey: key,
        });
        return result.kind === 'CHANGED'
          ? reply.code(409).send({
              error: {
                code: 'CHECKOUT_CHANGED',
                message: 'Order details changed; review the updated total.',
                checkout: result.checkout,
              },
            })
          : reply.code(201).send({ data: result.order });
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.get('/storefront/v1/orders/confirmation', async (request, reply) => {
    const checkoutToken = token(request.headers, checkoutCookie);
    if (!checkoutToken)
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Order confirmation was not found.' } });
    try {
      return { data: await getOrderForCheckout(database.db, checkoutToken) };
    } catch (caught) {
      return sendError(reply, caught);
    }
  });
  app.get('/admin/orders', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'orders.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listOrders(database.db, active.organizationId) };
  });
  app.get('/admin/orders/:orderId', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'orders.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getOrderForAdmin(database.db, {
          organizationId: active.organizationId,
          orderId: (request.params as { orderId: string }).orderId,
        }),
      };
    } catch (caught) {
      return sendError(reply, caught);
    }
  });
  app.post(
    '/admin/orders/:orderId/status',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          status: Type.Union([Type.Literal('CONFIRMED'), Type.Literal('ON_HOLD')]),
          reason: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'orders.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          version: number;
          status: 'CONFIRMED' | 'ON_HOLD';
          reason?: string;
        };
        return {
          data: await updateOrderStatus(database.db, {
            ...active,
            orderId: (request.params as { orderId: string }).orderId,
            expectedVersion: body.version,
            nextStatus: body.status,
            ...(body.reason ? { reason: body.reason } : {}),
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.post(
    '/admin/orders/:orderId/cancel',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          reasonCode: Type.String({ minLength: 1 }),
          reasonText: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'orders.manage');
      const key = request.headers['idempotency-key'];
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        const body = request.body as { version: number; reasonCode: string; reasonText?: string };
        return {
          data: await cancelOrder(database.db, {
            ...active,
            orderId: (request.params as { orderId: string }).orderId,
            expectedVersion: body.version,
            reasonCode: body.reasonCode,
            ...(body.reasonText ? { reasonText: body.reasonText } : {}),
            idempotencyKey: key,
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
}
