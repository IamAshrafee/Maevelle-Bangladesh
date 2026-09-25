import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  completeManualRefund,
  configurePaymentMethod,
  createRefund,
  getPaymentDetail,
  getPaymentAttempt,
  listPaymentMethods,
  listPayments,
  listPendingCodCollections,
  listPendingPaymentAttempts,
  listRefunds,
  PaymentDomainError,
  recordCodCollection,
  rejectManualPayment,
  verifyManualPayment,
  type PaymentMethodCode,
} from '@maevelle/database/payments';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function sendError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  caught: unknown,
) {
  if (!(caught instanceof PaymentDomainError)) throw caught;
  const status =
    caught.code === 'NOT_FOUND'
      ? 404
      : [
            'IDEMPOTENCY_CONFLICT',
            'PAYMENT_ATTEMPT_ALREADY_REVIEWED',
            'DUPLICATE_EXTERNAL_TRANSACTION',
            'REFUND_ALREADY_COMPLETED',
          ].includes(caught.code)
        ? 409
        : caught.code === 'REFUND_EXCEEDS_REFUNDABLE'
          ? 422
          : 422;
  return reply.code(status).send({
    error: {
      code: caught.code,
      message: caught.message,
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

export function registerPaymentRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/payments/methods', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'payments.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listPaymentMethods(database.db, active.organizationId) };
  });

  app.put(
    '/admin/payments/methods/:code',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1 }),
          status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('DISABLED')]),
          instructions: Type.Optional(
            Type.Object({
              accountNumber: Type.Optional(Type.String()),
              text: Type.Optional(Type.String()),
            }),
          ),
          displayOrder: Type.Integer(),
          paymentWindowMinutes: Type.Optional(
            Type.Union([Type.Integer({ minimum: 15, maximum: 10080 }), Type.Null()]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'payments.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          name: string;
          status: 'ACTIVE' | 'DISABLED';
          instructions?: { accountNumber?: string; text?: string };
          displayOrder: number;
          paymentWindowMinutes?: number | null;
        };
        const code = (request.params as { code: PaymentMethodCode }).code;
        if (!['COD', 'BKASH_MANUAL', 'NAGAD_MANUAL'].includes(code))
          return reply
            .code(422)
            .send({ error: { code: 'VALIDATION_FAILED', message: 'Unknown payment method.' } });
        return {
          data: await configurePaymentMethod(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            code,
            ...body,
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );

  app.get('/admin/payments/pending', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'payments.verify');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listPendingPaymentAttempts(database.db, active.organizationId) };
  });

  app.get('/admin/payments/cod-collections/pending', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'payments.verify');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listPendingCodCollections(database.db, active.organizationId) };
  });

  app.post(
    '/admin/payments/cod-collections',
    {
      schema: {
        body: Type.Object({
          deliveryId: Type.String({ minLength: 1 }),
          amount: Type.String({ minLength: 1 }),
          externalReference: Type.String({ minLength: 4 }),
          note: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'payments.verify');
      const key = request.headers['idempotency-key'];
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        const body = request.body as {
          deliveryId: string;
          amount: string;
          externalReference: string;
          note?: string;
        };
        return reply.code(201).send({
          data: await recordCodCollection(database.db, {
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

  app.get('/admin/payments/attempts/:attemptId', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'payments.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getPaymentAttempt(
          database.db,
          active.organizationId,
          (request.params as { attemptId: string }).attemptId,
        ),
      };
    } catch (caught) {
      return sendError(reply, caught);
    }
  });

  app.post(
    '/admin/payments/attempts/:attemptId/verify',
    { schema: { body: Type.Object({ confirmedAmount: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'payments.verify');
      const key = request.headers['idempotency-key'];
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        return {
          data: await verifyManualPayment(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            attemptId: (request.params as { attemptId: string }).attemptId,
            confirmedAmount: (request.body as { confirmedAmount: string }).confirmedAmount,
            idempotencyKey: key,
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );

  app.post(
    '/admin/payments/attempts/:attemptId/reject',
    {
      schema: {
        body: Type.Object({
          reasonCode: Type.String({ minLength: 1 }),
          note: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'payments.verify');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as { reasonCode: string; note?: string };
        return {
          data: await rejectManualPayment(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            attemptId: (request.params as { attemptId: string }).attemptId,
            ...body,
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );

  app.get(
    '/admin/payments',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          q: Type.Optional(Type.String({ maxLength: 160 })),
          method: Type.Optional(
            Type.Union([
              Type.Literal('COD'),
              Type.Literal('BKASH_MANUAL'),
              Type.Literal('NAGAD_MANUAL'),
            ]),
          ),
          posting: Type.Optional(
            Type.Union([Type.Literal('ALL'), Type.Literal('POSTED'), Type.Literal('UNPOSTED')]),
          ),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'payments.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as {
        page?: number;
        pageSize?: number;
        q?: string;
        method?: PaymentMethodCode;
        posting?: 'ALL' | 'POSTED' | 'UNPOSTED';
        from?: string;
        to?: string;
      };
      const { q, ...filters } = query;
      return {
        data: await listPayments(database.db, active.organizationId, {
          ...filters,
          ...(q ? { query: q } : {}),
        }),
      };
    },
  );

  app.get('/admin/payments/:paymentId', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'payments.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getPaymentDetail(
          database.db,
          active.organizationId,
          (request.params as { paymentId: string }).paymentId,
        ),
      };
    } catch (caught) {
      return sendError(reply, caught);
    }
  });

  app.get(
    '/admin/refunds',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          q: Type.Optional(Type.String({ maxLength: 160 })),
          status: Type.Optional(
            Type.Union([
              Type.Literal('REQUESTED'),
              Type.Literal('PROCESSING'),
              Type.Literal('UNKNOWN_EXTERNAL_OUTCOME'),
              Type.Literal('COMPLETED'),
              Type.Literal('FAILED'),
              Type.Literal('CANCELLED_BEFORE_PROCESSING'),
            ]),
          ),
          posting: Type.Optional(
            Type.Union([Type.Literal('ALL'), Type.Literal('POSTED'), Type.Literal('UNPOSTED')]),
          ),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'refunds.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as {
        page?: number;
        pageSize?: number;
        q?: string;
        status?: string;
        posting?: 'ALL' | 'POSTED' | 'UNPOSTED';
        from?: string;
        to?: string;
      };
      const { q, ...filters } = query;
      return {
        data: await listRefunds(database.db, active.organizationId, {
          ...filters,
          ...(q ? { query: q } : {}),
        }),
      };
    },
  );

  app.post(
    '/admin/payments/:paymentId/refunds',
    {
      schema: {
        body: Type.Object({
          amount: Type.String({ minLength: 1 }),
          reasonCode: Type.String({ minLength: 1 }),
          reasonText: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'refunds.manage');
      const key = request.headers['idempotency-key'];
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        const body = request.body as { amount: string; reasonCode: string; reasonText?: string };
        return reply.code(201).send({
          data: await createRefund(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            paymentId: (request.params as { paymentId: string }).paymentId,
            ...body,
            idempotencyKey: key,
          }),
        });
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );

  app.post(
    '/admin/refunds/:refundId/complete',
    { schema: { body: Type.Object({ externalReference: Type.String({ minLength: 4 }) }) } },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'refunds.manage');
      const key = request.headers['idempotency-key'];
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        return {
          data: await completeManualRefund(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            refundId: (request.params as { refundId: string }).refundId,
            externalReference: (request.body as { externalReference: string }).externalReference,
            idempotencyKey: key,
          }),
        };
      } catch (caught) {
        return sendError(reply, caught);
      }
    },
  );
}
