import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  cancelFulfillment,
  createFulfillment,
  dispatchFulfillment,
  FulfillmentDomainError,
  getFulfillment,
  listFulfillments,
  transitionFulfillment,
} from '@maevelle/database/fulfillment';
import {
  createDelivery,
  DeliveryDomainError,
  dispatchDelivery,
  getDelivery,
  listDeliveries,
  markDelivered,
  markDeliveryFailed,
  recordManualCourierBooking,
} from '@maevelle/database/delivery';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function requestHeaders(value: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(value).flatMap(([name, header]) =>
      typeof header === 'string' ? [[name, header]] : [],
    ),
  );
}

async function requireAdmin(
  database: DatabaseClient,
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: requestHeaders(headers) });
  if (!session?.user?.id) return undefined;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}

function idempotencyKey(request: { headers: Record<string, string | string[] | undefined> }) {
  const key = request.headers['idempotency-key'];
  return typeof key === 'string' && key.trim() ? key : undefined;
}

function sendDomainError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (!(error instanceof FulfillmentDomainError) && !(error instanceof DeliveryDomainError))
    throw error;
  const status =
    error.code === 'NOT_FOUND'
      ? 404
      : ['STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'CONFLICT', 'OVER_FULFILLMENT'].includes(
            error.code,
          )
        ? 409
        : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

function requireKey(
  request: { headers: Record<string, string | string[] | undefined> },
  reply: { code(status: number): { send(value: unknown): unknown } },
): string | undefined {
  const key = idempotencyKey(request);
  if (key) return key;
  reply
    .code(422)
    .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
  return undefined;
}

const version = Type.Object({ version: Type.Integer({ minimum: 1 }) });

export function registerFulfillmentDeliveryRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/fulfillments', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'fulfillment.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listFulfillments(database.db, active.organizationId) };
  });
  app.get('/admin/fulfillments/:fulfillmentId', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'fulfillment.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getFulfillment(database.db, {
          organizationId: active.organizationId,
          fulfillmentId: (request.params as { fulfillmentId: string }).fulfillmentId,
        }),
      };
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });
  app.post(
    '/admin/orders/:orderId/fulfillments',
    {
      schema: {
        body: Type.Object({
          locationId: Type.String({ minLength: 1 }),
          lines: Type.Array(
            Type.Object({
              orderLineId: Type.String({ minLength: 1 }),
              quantity: Type.String({ minLength: 1 }),
            }),
            { minItems: 1 },
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'fulfillment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        const body = request.body as {
          locationId: string;
          lines: { orderLineId: string; quantity: string }[];
        };
        return reply.code(201).send({
          data: await createFulfillment(database.db, {
            ...active,
            orderId: (request.params as { orderId: string }).orderId,
            ...body,
            idempotencyKey: key,
          }),
        });
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  for (const [path, nextStatus] of [
    ['ready', 'READY'],
    ['start-picking', 'PICKING'],
    ['pack', 'PACKED'],
  ] as const) {
    app.post(
      `/admin/fulfillments/:fulfillmentId/${path}`,
      { schema: { body: version } },
      async (request, reply) => {
        const active = await requireAdmin(database, auth, request.headers, 'fulfillment.manage');
        if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
        try {
          return {
            data: await transitionFulfillment(database.db, {
              ...active,
              fulfillmentId: (request.params as { fulfillmentId: string }).fulfillmentId,
              expectedVersion: (request.body as { version: number }).version,
              nextStatus,
            }),
          };
        } catch (error) {
          return sendDomainError(reply, error);
        }
      },
    );
  }
  app.post(
    '/admin/fulfillments/:fulfillmentId/dispatch',
    { schema: { body: version } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'fulfillment.dispatch');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        return {
          data: await dispatchFulfillment(database.db, {
            ...active,
            fulfillmentId: (request.params as { fulfillmentId: string }).fulfillmentId,
            expectedVersion: (request.body as { version: number }).version,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/fulfillments/:fulfillmentId/cancel',
    { schema: { body: version } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'fulfillment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        return {
          data: await cancelFulfillment(database.db, {
            ...active,
            fulfillmentId: (request.params as { fulfillmentId: string }).fulfillmentId,
            expectedVersion: (request.body as { version: number }).version,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );

  app.get('/admin/deliveries', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'delivery.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listDeliveries(database.db, active.organizationId) };
  });
  app.get('/admin/deliveries/:deliveryId', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'delivery.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getDelivery(database.db, {
          organizationId: active.organizationId,
          deliveryId: (request.params as { deliveryId: string }).deliveryId,
        }),
      };
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });
  app.post(
    '/admin/fulfillments/:fulfillmentId/deliveries',
    { schema: { body: Type.Object({}) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        return reply.code(201).send({
          data: await createDelivery(database.db, {
            ...active,
            fulfillmentId: (request.params as { fulfillmentId: string }).fulfillmentId,
            idempotencyKey: key,
          }),
        });
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/manual-booking',
    {
      schema: {
        body: Type.Intersect([
          version,
          Type.Object({
            carrierName: Type.String({ minLength: 1 }),
            trackingReference: Type.String({ minLength: 1 }),
          }),
        ]),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        const body = request.body as {
          version: number;
          carrierName: string;
          trackingReference: string;
        };
        return {
          data: await recordManualCourierBooking(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            expectedVersion: body.version,
            carrierName: body.carrierName,
            trackingReference: body.trackingReference,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/dispatch',
    { schema: { body: version } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.dispatch');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        return {
          data: await dispatchDelivery(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            expectedVersion: (request.body as { version: number }).version,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/delivered',
    {
      schema: {
        body: Type.Intersect([version, Type.Object({ note: Type.Optional(Type.String()) })]),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.dispatch');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        const body = request.body as { version: number; note?: string };
        return {
          data: await markDelivered(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            expectedVersion: body.version,
            ...(body.note ? { note: body.note } : {}),
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/failed',
    {
      schema: {
        body: Type.Intersect([
          version,
          Type.Object({
            reasonCode: Type.String({ minLength: 1 }),
            note: Type.Optional(Type.String()),
          }),
        ]),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.dispatch');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        const body = request.body as { version: number; reasonCode: string; note?: string };
        return {
          data: await markDeliveryFailed(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            expectedVersion: body.version,
            reasonCode: body.reasonCode,
            ...(body.note ? { note: body.note } : {}),
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
}
