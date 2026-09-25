import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  cancelFulfillment,
  createFulfillment,
  dispatchFulfillment,
  FulfillmentDomainError,
  getFulfillment,
  listFulfillmentPage,
  transitionFulfillment,
} from '@maevelle/database/fulfillment';
import {
  cancelCourierBooking,
  cancelDelivery,
  createDelivery,
  createDeliveryClaim,
  DeliveryDomainError,
  dispatchDelivery,
  getDelivery,
  listCourierIntegrationAccounts,
  listDeliveryPage,
  markDelivered,
  markDeliveryFailed,
  recordDeliveryAttempt,
  recordManualCourierBooking,
  reconcileUnknownCourierBooking,
  requestCourierBooking,
  resolveDeliveryException,
  transitionDeliveryClaim,
} from '@maevelle/database/delivery';
import {
  listDeliveryFinancialObservations,
  recordProviderCharge,
  recordProviderCollectionObservation,
} from '@maevelle/database/delivery-finance';
import { findActiveAdminContext } from '@maevelle/database/platform';
import { getCustomerDeliveryHistory } from '@maevelle/database/delivery-intelligence';

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
  app.get(
    '/admin/fulfillments',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          search: Type.Optional(Type.String()),
          status: Type.Optional(
            Type.Union([
              Type.Literal('OPEN'),
              Type.Literal('READY'),
              Type.Literal('PICKING'),
              Type.Literal('PACKED'),
              Type.Literal('DISPATCHED'),
              Type.Literal('CANCELLED'),
            ]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'fulfillment.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const result = await listFulfillmentPage(
        database.db,
        active.organizationId,
        request.query as Parameters<typeof listFulfillmentPage>[2],
      );
      return { data: result.items, meta: { pagination: result.pagination } };
    },
  );
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

  app.get(
    '/admin/deliveries',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          search: Type.Optional(Type.String()),
          status: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const result = await listDeliveryPage(
        database.db,
        active.organizationId,
        request.query as Parameters<typeof listDeliveryPage>[2],
      );
      return { data: result.items, meta: { pagination: result.pagination } };
    },
  );
  app.get('/admin/deliveries/courier-accounts', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'delivery.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listCourierIntegrationAccounts(database.db, active.organizationId) };
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
  app.get('/admin/deliveries/:deliveryId/customer-delivery-history', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'delivery.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await getCustomerDeliveryHistory(database.db, {
        organizationId: active.organizationId,
        deliveryId: (request.params as { deliveryId: string }).deliveryId,
      }),
    };
  });
  app.get('/admin/deliveries/:deliveryId/financial-observations', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'delivery.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await listDeliveryFinancialObservations(database.db, {
          organizationId: active.organizationId,
          deliveryId: (request.params as { deliveryId: string }).deliveryId,
        }),
      };
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });
  app.post(
    '/admin/deliveries/:deliveryId/provider-collections',
    {
      schema: {
        body: Type.Object({
          courierBookingId: Type.String({ minLength: 1 }),
          providerEventId: Type.String({ minLength: 1 }),
          collectedAmount: Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' }),
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
          collectedAt: Type.String({ format: 'date-time' }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await recordProviderCollectionObservation(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            ...(request.body as {
              courierBookingId: string;
              providerEventId: string;
              collectedAmount: string;
              currency: string;
              collectedAt: string;
            }),
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/provider-charges',
    {
      schema: {
        body: Type.Object({
          courierBookingId: Type.String({ minLength: 1 }),
          providerReference: Type.String({ minLength: 1 }),
          chargeType: Type.Union([
            Type.Literal('DELIVERY'),
            Type.Literal('COD_COLLECTION'),
            Type.Literal('RTO'),
            Type.Literal('SURCHARGE'),
            Type.Literal('OTHER'),
          ]),
          chargeBasis: Type.Union([
            Type.Literal('ESTIMATE'),
            Type.Literal('ACTUAL'),
            Type.Literal('ADJUSTMENT'),
          ]),
          amount: Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' }),
          currency: Type.String({ pattern: '^[A-Z]{3}$' }),
          occurredAt: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await recordProviderCharge(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            ...(request.body as Omit<
              Parameters<typeof recordProviderCharge>[1],
              'organizationId' | 'actorId' | 'deliveryId'
            >),
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/exceptions/:exceptionId/resolve',
    {
      schema: {
        body: Type.Intersect([
          version,
          Type.Object({
            resolution: Type.Union([Type.Literal('RESOLVED'), Type.Literal('IGNORED_WITH_REASON')]),
            note: Type.String({ minLength: 1 }),
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
          resolution: 'RESOLVED' | 'IGNORED_WITH_REASON';
          note: string;
        };
        return {
          data: await resolveDeliveryException(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            exceptionId: (request.params as { exceptionId: string }).exceptionId,
            expectedVersion: body.version,
            resolution: body.resolution,
            note: body.note,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/claims',
    {
      schema: {
        body: Type.Intersect([
          version,
          Type.Object({
            reason: Type.Union([
              Type.Literal('LOST'),
              Type.Literal('DAMAGED'),
              Type.Literal('COD_MISMATCH'),
              Type.Literal('OVERCHARGE'),
              Type.Literal('OTHER'),
            ]),
            claimedAmount: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' })),
            currency: Type.String({ pattern: '^[A-Z]{3}$' }),
            notes: Type.Optional(Type.String()),
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
        const body = request.body as Omit<
          Parameters<typeof createDeliveryClaim>[1],
          'organizationId' | 'actorId' | 'deliveryId' | 'expectedVersion' | 'idempotencyKey'
        > & { version: number };
        return {
          data: await createDeliveryClaim(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            expectedVersion: body.version,
            reason: body.reason,
            ...(body.claimedAmount ? { claimedAmount: body.claimedAmount } : {}),
            currency: body.currency,
            ...(body.notes ? { notes: body.notes } : {}),
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/claims/:claimId/transition',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          nextStatus: Type.Union([
            Type.Literal('SUBMITTED'),
            Type.Literal('APPROVED'),
            Type.Literal('REJECTED'),
            Type.Literal('PAID'),
            Type.Literal('CLOSED'),
          ]),
          approvedAmount: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' })),
          providerReference: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
        }),
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
          nextStatus: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CLOSED';
          approvedAmount?: string;
          providerReference?: string;
          notes?: string;
        };
        return {
          data: await transitionDeliveryClaim(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            claimId: (request.params as { claimId: string }).claimId,
            expectedClaimVersion: body.version,
            nextStatus: body.nextStatus,
            ...(body.approvedAmount ? { approvedAmount: body.approvedAmount } : {}),
            ...(body.providerReference ? { providerReference: body.providerReference } : {}),
            ...(body.notes ? { notes: body.notes } : {}),
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
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
    '/admin/deliveries/:deliveryId/courier-bookings',
    {
      schema: {
        body: Type.Intersect([
          version,
          Type.Object({
            integrationAccountId: Type.String({ minLength: 1 }),
            packageWeightKg: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' })),
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
          integrationAccountId: string;
          packageWeightKg?: string;
        };
        return reply.code(202).send({
          data: await requestCourierBooking(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            expectedVersion: body.version,
            integrationAccountId: body.integrationAccountId,
            ...(body.packageWeightKg ? { packageWeightKg: body.packageWeightKg } : {}),
            idempotencyKey: key,
          }),
        });
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/courier-bookings/:bookingId/reconcile',
    {
      schema: {
        body: Type.Intersect([
          version,
          Type.Union([
            Type.Object({
              outcome: Type.Literal('BOOKED'),
              providerBookingId: Type.String({ minLength: 1 }),
              trackingReference: Type.Optional(Type.String({ minLength: 1 })),
              trackingUrl: Type.Optional(Type.String({ minLength: 1 })),
            }),
            Type.Object({
              outcome: Type.Literal('NOT_CREATED'),
              reasonCode: Type.String({ minLength: 1 }),
            }),
          ]),
        ]),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as
          | {
              version: number;
              outcome: 'BOOKED';
              providerBookingId: string;
              trackingReference?: string;
              trackingUrl?: string;
            }
          | { version: number; outcome: 'NOT_CREATED'; reasonCode: string };
        return {
          data: await reconcileUnknownCourierBooking(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            bookingId: (request.params as { bookingId: string }).bookingId,
            expectedVersion: body.version,
            outcome:
              body.outcome === 'BOOKED'
                ? {
                    kind: 'BOOKED',
                    providerBookingId: body.providerBookingId,
                    ...(body.trackingReference
                      ? { trackingReference: body.trackingReference }
                      : {}),
                    ...(body.trackingUrl ? { trackingUrl: body.trackingUrl } : {}),
                  }
                : { kind: 'NOT_CREATED', reasonCode: body.reasonCode },
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
  app.post(
    '/admin/deliveries/:deliveryId/attempts',
    {
      schema: {
        body: Type.Intersect([
          version,
          Type.Object({
            outcome: Type.Union([
              Type.Literal('DELIVERED'),
              Type.Literal('CUSTOMER_UNAVAILABLE'),
              Type.Literal('CUSTOMER_REFUSED'),
              Type.Literal('ADDRESS_NOT_FOUND'),
              Type.Literal('RESCHEDULE_REQUESTED'),
              Type.Literal('PHONE_UNREACHABLE'),
              Type.Literal('PROVIDER_FAILURE'),
              Type.Literal('OTHER_FAILED'),
            ]),
            reasonCode: Type.Optional(Type.String()),
            note: Type.Optional(Type.String()),
            nextAttemptAt: Type.Optional(Type.String()),
            isFinal: Type.Optional(Type.Boolean()),
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
        const body = request.body as Parameters<typeof recordDeliveryAttempt>[1] & {
          version: number;
        };
        return {
          data: await recordDeliveryAttempt(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            expectedVersion: body.version,
            outcome: body.outcome,
            ...(body.reasonCode ? { reasonCode: body.reasonCode } : {}),
            ...(body.note ? { note: body.note } : {}),
            ...(body.nextAttemptAt ? { nextAttemptAt: body.nextAttemptAt } : {}),
            ...(body.isFinal !== undefined ? { isFinal: body.isFinal } : {}),
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/cancel-booking',
    { schema: { body: Type.Intersect([version, Type.Object({ reason: Type.String() })]) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        const body = request.body as { version: number; reason: string };
        return {
          data: await cancelCourierBooking(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            expectedVersion: body.version,
            reason: body.reason,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
  app.post(
    '/admin/deliveries/:deliveryId/cancel',
    { schema: { body: Type.Intersect([version, Type.Object({ reason: Type.String() })]) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(request, reply);
      if (!key) return;
      try {
        const body = request.body as { version: number; reason: string };
        return {
          data: await cancelDelivery(database.db, {
            ...active,
            deliveryId: (request.params as { deliveryId: string }).deliveryId,
            expectedVersion: body.version,
            reason: body.reason,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
}
