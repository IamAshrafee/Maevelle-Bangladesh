import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  cancelOrder,
  cancelOrderLine,
  createCheckout,
  createDeliveryPricingRule,
  getCheckout,
  getAvailableCheckoutPaymentMethods,
  getOrderForAdmin,
  getOrderForCheckout,
  getOrderForCheckoutContext,
  getOrderPublicTracking,
  listDeliveryPricingRules,
  listOrders,
  OrderDomainError,
  placeOrder,
  refreshCheckout,
  updateCheckoutAddress,
  updateCheckoutContact,
  updateCheckoutPaymentMethod,
  updateDeliveryPricingRule,
  updateOrderStatus,
  updateOrderDeliveryAddress,
  createManualOrder,
  addOrderNote,
  resumeOrderFromHold,
} from '@maevelle/database/orders';
import {
  getOrderPaymentInstructions,
  PaymentDomainError,
  submitManualPayment,
  type PaymentMethodCode,
} from '@maevelle/database/payments';
import { getPublicOrderFulfillmentStatus } from '@maevelle/database/delivery';
import { findActiveAdminContext, isCheckoutEnabledForToken } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

const cartCookie = 'maevelle_cart';
const checkoutCookie = 'maevelle_checkout';
type Auth = ReturnType<typeof createAuth>;
type OrderListQuery = NonNullable<Parameters<typeof listOrders>[2]>;

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
  if (!(caught instanceof OrderDomainError) && !(caught instanceof PaymentDomainError))
    throw caught;
  const status =
    caught.code === 'NOT_FOUND'
      ? 404
      : [
            'CHECKOUT_CHANGED',
            'CHECKOUT_COMPLETED',
            'STALE_VERSION',
            'IDEMPOTENCY_CONFLICT',
            'PAYMENT_ATTEMPT_ALREADY_REVIEWED',
            'DUPLICATE_EXTERNAL_TRANSACTION',
            'REFUND_ALREADY_COMPLETED',
          ].includes(caught.code)
        ? 409
        : caught.code === 'OUT_OF_STOCK' || caught.code === 'REFUND_EXCEEDS_REFUNDABLE'
          ? 422
          : 422;
  return reply.code(status).send({
    error: {
      code: caught.code,
      message: caught.message,
      ...(caught instanceof OrderDomainError && caught.checkout
        ? { checkout: caught.checkout }
        : {}),
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
  app.get('/storefront/v1/checkouts/current/payment-methods', async (request, reply) => {
    const checkoutToken = token(request.headers, checkoutCookie);
    const cartToken = token(request.headers, cartCookie);
    if (!checkoutToken || !cartToken)
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Checkout was not found.' } });
    try {
      return {
        data: await getAvailableCheckoutPaymentMethods(database.db, { checkoutToken, cartToken }),
      };
    } catch (caught) {
      return sendError(reply, caught);
    }
  });
  app.put(
    '/storefront/v1/checkouts/current/payment-method',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          paymentMethod: Type.Union([
            Type.Literal('COD'),
            Type.Literal('BKASH_MANUAL'),
            Type.Literal('NAGAD_MANUAL'),
          ]),
        }),
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
        const body = request.body as { version: number; paymentMethod: PaymentMethodCode };
        return {
          data: await updateCheckoutPaymentMethod(database.db, {
            checkoutToken,
            cartToken,
            expectedVersion: body.version,
            paymentMethod: body.paymentMethod,
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
  app.patch(
    '/admin/orders/delivery-pricing-rules/:ruleId',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          name: Type.String({ minLength: 1, maxLength: 160 }),
          countryCode: Type.String({ pattern: '^[A-Z]{2}$' }),
          geographyNodeId: Type.Optional(Type.String()),
          flatAmount: Type.String({ pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,4})?$' }),
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
          priority: Type.Integer(),
          status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('INACTIVE')]),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'orders.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          version: number;
          name: string;
          countryCode: string;
          geographyNodeId?: string;
          flatAmount: string;
          currency: string;
          priority: number;
          status: 'ACTIVE' | 'INACTIVE';
        };
        return {
          data: await updateDeliveryPricingRule(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ruleId: (request.params as { ruleId: string }).ruleId,
            expectedVersion: body.version,
            name: body.name,
            countryCode: body.countryCode,
            ...(body.geographyNodeId ? { geographyNodeId: body.geographyNodeId } : {}),
            flatAmount: body.flatAmount,
            currency: body.currency,
            priority: body.priority,
            status: body.status,
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
      if (!(await isCheckoutEnabledForToken(database.db, checkoutToken)))
        return reply.code(503).send({
          error: {
            code: 'CHECKOUT_DISABLED',
            message: 'Checkout is temporarily unavailable. Your Cart remains unchanged.',
          },
        });
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
  app.get('/storefront/v1/orders/confirmation/payment', async (request, reply) => {
    const checkoutToken = token(request.headers, checkoutCookie);
    if (!checkoutToken)
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Order confirmation was not found.' } });
    try {
      const context = await getOrderForCheckoutContext(database.db, checkoutToken);
      return {
        data: {
          summary: context.order.payment,
          instructions: await getOrderPaymentInstructions(database.db, {
            organizationId: context.organizationId,
            orderId: context.order.id,
          }),
        },
      };
    } catch (caught) {
      return sendError(reply, caught);
    }
  });
  app.get('/storefront/v1/orders/confirmation/fulfillment', async (request, reply) => {
    const checkoutToken = token(request.headers, checkoutCookie);
    if (!checkoutToken)
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Order confirmation was not found.' } });
    try {
      const context = await getOrderForCheckoutContext(database.db, checkoutToken);
      return {
        data: await getPublicOrderFulfillmentStatus(database.db, {
          organizationId: context.organizationId,
          orderId: context.order.id,
        }),
      };
    } catch (caught) {
      return sendError(reply, caught);
    }
  });
  app.post(
    '/storefront/v1/orders/confirmation/payment-attempts',
    {
      schema: {
        body: Type.Object({
          transactionReference: Type.String({ minLength: 4 }),
          payerReference: Type.Optional(Type.String()),
          claimedAmount: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const checkoutToken = token(request.headers, checkoutCookie);
      const key = request.headers['idempotency-key'];
      if (!checkoutToken)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Order confirmation was not found.' } });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        const context = await getOrderForCheckoutContext(database.db, checkoutToken);
        const body = request.body as {
          transactionReference: string;
          payerReference?: string;
          claimedAmount?: string;
        };
        return reply.code(201).send({
          data: await submitManualPayment(database.db, {
            organizationId: context.organizationId,
            orderId: context.order.id,
            customerReference: body.transactionReference,
            ...(body.payerReference ? { payerReference: body.payerReference } : {}),
            ...(body.claimedAmount ? { claimedAmount: body.claimedAmount } : {}),
            idempotencyKey: key,
          }),
        });
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.post(
    '/storefront/v1/orders/track',
    {
      schema: {
        body: Type.Object({
          orderNumber: Type.String({ minLength: 1 }),
          phone: Type.String({ minLength: 6 }),
        }),
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as { orderNumber: string; phone: string };
        const tracking = await getOrderPublicTracking(database.db, {
          orderNumber: body.orderNumber,
          phone: body.phone,
        });
        return { data: tracking };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.get('/admin/orders/delivery-pricing-rules', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'orders.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listDeliveryPricingRules(database.db, active.organizationId) };
  });
  app.post(
    '/admin/orders/delivery-pricing-rules',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 160 }),
          countryCode: Type.String({ pattern: '^[A-Z]{2}$' }),
          geographyNodeId: Type.Optional(Type.String()),
          flatAmount: Type.String({ pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,4})?$' }),
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
          priority: Type.Optional(Type.Integer()),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'orders.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createDeliveryPricingRule(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...(request.body as Omit<Parameters<typeof createDeliveryPricingRule>[1], 'organizationId' | 'actorId'>),
          }),
        });
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.get(
    '/admin/orders',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          q: Type.Optional(Type.String()),
          status: Type.Optional(
            Type.Union([
              Type.Literal('PENDING'),
              Type.Literal('CONFIRMED'),
              Type.Literal('ON_HOLD'),
              Type.Literal('COMPLETED'),
              Type.Literal('CANCELLED'),
            ]),
          ),
          paymentStatus: Type.Optional(
            Type.Union([
              Type.Literal('UNPAID'),
              Type.Literal('PAYMENT_PENDING'),
              Type.Literal('PARTIALLY_PAID'),
              Type.Literal('PAID'),
              Type.Literal('PARTIALLY_REFUNDED'),
              Type.Literal('REFUNDED'),
              Type.Literal('EXPIRED'),
              Type.Literal('CANCELLED'),
            ]),
          ),
          fulfillmentStatus: Type.Optional(
            Type.Union([
              Type.Literal('UNFULFILLED'),
              Type.Literal('PARTIALLY_FULFILLED'),
              Type.Literal('IN_PROGRESS'),
              Type.Literal('FULFILLED'),
              Type.Literal('CANCELLED'),
            ]),
          ),
          deliveryStatus: Type.Optional(
            Type.Union([
              Type.Literal('NOT_STARTED'),
              Type.Literal('PENDING'),
              Type.Literal('IN_TRANSIT'),
              Type.Literal('PARTIALLY_DELIVERED'),
              Type.Literal('DELIVERED'),
              Type.Literal('FAILED'),
              Type.Literal('CANCELLED'),
            ]),
          ),
          paymentMethod: Type.Optional(
            Type.Union([
              Type.Literal('COD'),
              Type.Literal('BKASH_MANUAL'),
              Type.Literal('NAGAD_MANUAL'),
            ]),
          ),
          salesChannel: Type.Optional(
            Type.Union([
              Type.Literal('STOREFRONT'),
              Type.Literal('ADMIN'),
              Type.Literal('FACEBOOK'),
              Type.Literal('INSTAGRAM'),
              Type.Literal('WHATSAPP'),
              Type.Literal('PHONE'),
              Type.Literal('EXTERNAL_API'),
              Type.Literal('IMPORT'),
            ]),
          ),
          source: Type.Optional(Type.Union([Type.Literal('STOREFRONT'), Type.Literal('MANUAL')])),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          customerId: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'orders.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as OrderListQuery;
      const result = await listOrders(database.db, active.organizationId, query);
      return {
        data: {
          items: result.data,
          totalCount: result.pagination.totalItems,
          pagination: result.pagination,
        },
      };
    },
  );
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
    '/admin/orders/:orderId/delivery-address',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          reason: Type.String({ minLength: 1, maxLength: 1000 }),
          address: Type.Object({
            recipientName: Type.String({ minLength: 1 }),
            phone: Type.String({ minLength: 1 }),
            addressLine1: Type.String({ minLength: 1 }),
            addressLine2: Type.Optional(Type.String()),
            geographyNodeId: Type.Optional(Type.String()),
            area: Type.Optional(Type.String()),
            city: Type.Optional(Type.String()),
            district: Type.Optional(Type.String()),
            postalCode: Type.Optional(Type.String()),
            countryCode: Type.String({ minLength: 2, maxLength: 2 }),
          }),
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
        const body = request.body as {
          version: number;
          reason: string;
          address: Parameters<typeof updateOrderDeliveryAddress>[1]['address'];
        };
        return {
          data: await updateOrderDeliveryAddress(database.db, {
            ...active,
            orderId: (request.params as { orderId: string }).orderId,
            expectedVersion: body.version,
            reason: body.reason,
            address: body.address,
            idempotencyKey: key,
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.post(
    '/admin/orders/:orderId/lines/:orderLineId/cancel',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          reasonCode: Type.String({ minLength: 1, maxLength: 100 }),
          reasonText: Type.Optional(Type.String({ maxLength: 1000 })),
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
        const params = request.params as { orderId: string; orderLineId: string };
        const body = request.body as {
          version: number;
          reasonCode: string;
          reasonText?: string;
        };
        return {
          data: await cancelOrderLine(database.db, {
            ...active,
            orderId: params.orderId,
            orderLineId: params.orderLineId,
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
  app.post(
    '/admin/orders/:orderId/resume',
    {
      schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'orders.manage');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await resumeOrderFromHold(database.db, {
            ...active,
            orderId: (request.params as { orderId: string }).orderId,
            expectedVersion: (request.body as { version: number }).version,
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
  app.post(
    '/admin/orders/:orderId/notes',
    {
      schema: {
        body: Type.Object({
          noteType: Type.Union([Type.Literal('INTERNAL'), Type.Literal('CUSTOMER_VISIBLE')]),
          body: Type.String({ minLength: 1, maxLength: 4000 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'orders.manage');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return reply.code(201).send({
          data: await addOrderNote(database.db, {
            ...active,
            orderId: (request.params as { orderId: string }).orderId,
            ...(request.body as { noteType: 'INTERNAL' | 'CUSTOMER_VISIBLE'; body: string }),
          }),
        });
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );

  app.post(
    '/admin/orders',
    {
      schema: {
        body: Type.Object({
          customerId: Type.String({ minLength: 1 }),
          locationId: Type.String({ minLength: 1 }),
          lines: Type.Array(
            Type.Object({
              variantId: Type.String({ minLength: 1 }),
              quantity: Type.String({
                pattern: '^(?:(?:[1-9]\\d*)(?:\\.\\d{1,4})?|(?:0\\.\\d*[1-9]\\d*))$',
              }),
              unitPrice: Type.Optional(
                Type.String({ pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,4})?$' }),
              ),
              priceOverrideReason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
            }),
            { minItems: 1 },
          ),
          deliveryAddress: Type.Object({
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
            saveToCustomer: Type.Optional(Type.Boolean()),
          }),
          deliveryAmount: Type.Optional(Type.String({ pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,4})?$' })),
          deliveryOverrideReason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
          paymentMethod: Type.Union([
            Type.Literal('COD'),
            Type.Literal('BKASH_MANUAL'),
            Type.Literal('NAGAD_MANUAL'),
          ]),
          salesChannel: Type.Union([
            Type.Literal('ADMIN'),
            Type.Literal('FACEBOOK'),
            Type.Literal('INSTAGRAM'),
            Type.Literal('WHATSAPP'),
            Type.Literal('PHONE'),
            Type.Literal('EXTERNAL_API'),
            Type.Literal('IMPORT'),
          ]),
          currency: Type.Optional(Type.String({ pattern: '^[A-Z]{3}$' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'orders.create');
      const key = request.headers['idempotency-key'];
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        const body = request.body as Omit<
          Parameters<typeof createManualOrder>[1],
          'organizationId' | 'actorId' | 'idempotencyKey'
        >;
        return reply.code(201).send({
          data: await createManualOrder(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...body,
            idempotencyKey: key,
          }),
        });
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
}
