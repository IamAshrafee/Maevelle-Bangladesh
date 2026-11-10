import type { FastifyInstance } from 'fastify';
import { registerCashShortfallRoutes } from './cash-shortfall.js';
import { Type } from 'typebox';
import type { ReceivingDestinationInputDto } from '@maevelle/contracts';
import type { DatabaseClient } from '@maevelle/database';
import {
  createReceivingDestination,
  changeReceivingDestination,
  listReceivingDestinations,
  checkoutPaymentReadiness,
  listManualClaimQueue,
  reviewManualClaim,
  getVerifiedReceipt,
  reverseManualReceipt,
  approvePaymentOperatingPolicy,
  proposePaymentOperatingPolicy,
  listReceiptExceptions,
  changeRefundProcessingState,
  getPaymentClaimWorkspace,
  listPaymentPolicies,
} from '@maevelle/database/payments';
import type { createAuth } from '../auth/auth.js';
import { paymentAdmin, sendPaymentError } from './payments.js';

const uuid = Type.String({ format: 'uuid' });
const pagination = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export function registerPaymentOperationsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: ReturnType<typeof createAuth>,
) {
  registerCashShortfallRoutes(app, database, auth);
  app.get(
    '/admin/payments/attempts/:id/workspace',
    { schema: { params: Type.Object({ id: uuid }) } },
    async (request, reply) => {
      const c = await paymentAdmin(database, auth, request.headers, 'payments.view');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Payment viewing is required.' } });
      try {
        return {
          data: await getPaymentClaimWorkspace(database.db, {
            ...c,
            attemptId: (request.params as { id: string }).id,
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.get(
    '/admin/payments/operating-policies',
    { schema: { querystring: pagination } },
    async (request, reply) => {
      const c = await paymentAdmin(database, auth, request.headers, 'payments.destinations.view');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Configuration viewing is required.' } });
      try {
        return {
          data: await listPaymentPolicies(database.db, {
            ...c,
            page: (request.query as { page?: number }).page ?? 1,
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.get(
    '/admin/payments/receipt-exceptions',
    { schema: { querystring: pagination } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const c = await paymentAdmin(database, auth, request.headers, 'payments.review');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Payment review is required.' } });
      try {
        return {
          data: await listReceiptExceptions(database.db, {
            ...c,
            ...(request.query as { page?: number; pageSize?: number }),
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/refunds/:id/processing',
    {
      schema: {
        params: Type.Object({ id: uuid }),
        body: Type.Object(
          {
            expectedVersion: Type.Integer({ minimum: 1 }),
            state: Type.Union([
              Type.Literal('PROCESSING'),
              Type.Literal('UNKNOWN_EXTERNAL_OUTCOME'),
              Type.Literal('FAILED'),
              Type.Literal('CANCELLED_BEFORE_PROCESSING'),
            ]),
            evidenceReference: Type.String({ minLength: 1, maxLength: 512 }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const c = await paymentAdmin(database, auth, request.headers, 'refunds.manage');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Refund authorization is required.' } });
      try {
        return {
          data: await changeRefundProcessingState(database.db, {
            ...c,
            ...(request.body as {
              expectedVersion: number;
              state:
                | 'PROCESSING'
                | 'UNKNOWN_EXTERNAL_OUTCOME'
                | 'FAILED'
                | 'CANCELLED_BEFORE_PROCESSING';
              evidenceReference: string;
            }),
            refundId: (request.params as { id: string }).id,
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/operating-policy-proposals',
    {
      schema: {
        body: Type.Object(
          {
            submissionMinutes: Type.Integer({ minimum: 15, maximum: 10080 }),
            reviewMinutes: Type.Integer({ minimum: 1, maximum: 10080 }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const c = await paymentAdmin(database, auth, request.headers, 'payments.destinations.edit');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Policy editing is required.' } });
      try {
        return reply.code(201).send({
          data: await proposePaymentOperatingPolicy(database.db, {
            ...c,
            ...(request.body as { submissionMinutes: number; reviewMinutes: number }),
          }),
        });
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/operating-policies',
    {
      schema: {
        body: Type.Object(
          {
            proposalId: uuid,
            approvalReference: Type.String({ minLength: 1, maxLength: 512 }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const c = await paymentAdmin(
        database,
        auth,
        request.headers,
        'payments.destinations.approve',
      );
      if (!c)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Independent policy approval is required.' },
        });
      try {
        return reply.code(201).send({
          data: await approvePaymentOperatingPolicy(database.db, {
            ...c,
            ...(request.body as {
              proposalId: string;
              approvalReference: string;
            }),
          }),
        });
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.get('/admin/payments/readiness', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const c = await paymentAdmin(database, auth, request.headers, 'payments.view');
    if (!c)
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN', message: 'Payment access is required.' } });
    return { data: checkoutPaymentReadiness() };
  });
  app.get(
    '/admin/payments/destinations',
    { schema: { querystring: pagination } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const c = await paymentAdmin(database, auth, request.headers, 'payments.destinations.view');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Destination access is required.' } });
      try {
        return {
          data: await listReceivingDestinations(database.db, {
            ...c,
            ...(request.query as { page?: number; pageSize?: number }),
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/destinations',
    {
      schema: {
        body: Type.Object(
          {
            provider: Type.Union([Type.Literal('BKASH'), Type.Literal('NAGAD')]),
            accountType: Type.Union([
              Type.Literal('PERSONAL_RETAIL_ACCOUNT'),
              Type.Literal('MERCHANT'),
            ]),
            receivingNumber: Type.String({ pattern: '^01[3-9][0-9]{8}$' }),
            recipientName: Type.String({ minLength: 1, maxLength: 160 }),
            transferAction: Type.Union([
              Type.Literal('MERCHANT_PAYMENT'),
              Type.Literal('PAYMENT_QR'),
              Type.Literal('UNVERIFIED'),
            ]),
            instructions: Type.String({ minLength: 1, maxLength: 1000 }),
            financialAccountId: uuid,
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const c = await paymentAdmin(database, auth, request.headers, 'payments.destinations.edit');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Destination editing is required.' } });
      try {
        return reply.code(201).send({
          data: await createReceivingDestination(database.db, {
            ...c,
            ...(request.body as ReceivingDestinationInputDto),
          }),
        });
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/destinations/:id/transitions',
    {
      schema: {
        params: Type.Object({ id: uuid }),
        body: Type.Object(
          {
            expectedRevision: Type.String({ pattern: '^[1-9][0-9]{0,18}$' }),
            action: Type.Union([
              Type.Literal('APPROVE'),
              Type.Literal('SUSPEND'),
              Type.Literal('RETIRE'),
            ]),
            reason: Type.String({ minLength: 1, maxLength: 512 }),
            providerEvidenceReference: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const body = request.body as {
        expectedRevision: string;
        action: 'APPROVE' | 'SUSPEND' | 'RETIRE';
        reason: string;
        providerEvidenceReference?: string;
      };
      const c = await paymentAdmin(
        database,
        auth,
        request.headers,
        body.action === 'APPROVE' ? 'payments.destinations.approve' : 'payments.destinations.edit',
      );
      if (!c)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Destination authorization is required.' },
        });
      try {
        return {
          data: await changeReceivingDestination(database.db, {
            ...c,
            ...body,
            id: (request.params as { id: string }).id,
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.get(
    '/admin/payments/claims',
    { schema: { querystring: pagination } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const c = await paymentAdmin(database, auth, request.headers, 'payments.review');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Payment review is required.' } });
      try {
        return {
          data: await listManualClaimQueue(database.db, {
            ...c,
            ...(request.query as { page?: number; pageSize?: number }),
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/attempts/:id/review',
    {
      schema: {
        params: Type.Object({ id: uuid }),
        body: Type.Object(
          {
            state: Type.Union([
              Type.Literal('UNDER_REVIEW'),
              Type.Literal('CORRECTION_REQUESTED'),
              Type.Literal('ESCALATED'),
            ]),
            note: Type.String({ minLength: 1, maxLength: 512 }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const c = await paymentAdmin(database, auth, request.headers, 'payments.review');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Payment review is required.' } });
      try {
        return {
          data: await reviewManualClaim(database.db, {
            ...c,
            ...(request.body as {
              state: 'UNDER_REVIEW' | 'CORRECTION_REQUESTED' | 'ESCALATED';
              note: string;
            }),
            attemptId: (request.params as { id: string }).id,
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.get(
    '/admin/payments/:id/receipt',
    { schema: { params: Type.Object({ id: uuid }) } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const c = await paymentAdmin(database, auth, request.headers, 'payments.view');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Payment access is required.' } });
      try {
        return {
          data: await getVerifiedReceipt(
            database.db,
            c.organizationId,
            (request.params as { id: string }).id,
          ),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/:id/reversal',
    {
      schema: {
        params: Type.Object({ id: uuid }),
        body: Type.Object(
          {
            reason: Type.String({ minLength: 1, maxLength: 512 }),
            evidenceReference: Type.String({ minLength: 1, maxLength: 512 }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const c = await paymentAdmin(database, auth, request.headers, 'payments.correct');
      if (!c)
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Financial correction authorization is required.',
          },
        });
      try {
        return {
          data: await reverseManualReceipt(database.db, {
            ...c,
            ...(request.body as { reason: string; evidenceReference: string }),
            paymentId: (request.params as { id: string }).id,
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
}
