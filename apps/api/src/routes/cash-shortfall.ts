import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import type { CashShortfallPolicyInputDto, SettleCashShortfallDto } from '@maevelle/contracts';
import {
  settleCashShortfall,
  approveCashShortfall,
  reverseCashShortfall,
  cashSettlement,
  listCashAdjustments,
  proposeCashShortfallPolicy,
  approveCashShortfallPolicy,
  PaymentDomainError,
} from '@maevelle/database/payments';
import type { createAuth } from '../auth/auth.js';
import { paymentAdmin, sendPaymentError } from './payments.js';
import { registerCashDiscovery } from './cash-discovery.js';

const uuid = Type.String({ format: 'uuid' }),
  bounded = Type.String({ minLength: 1, maxLength: 512 }),
  amount = Type.String({ pattern: '^[0-9]{1,16}(?:[.]0{1,4})?$' });
const params = Type.Object({ id: uuid }, { additionalProperties: false });
const body = {
  orderId: uuid,
  paymentId: uuid,
  policyId: uuid,
  amount,
  reason: bounded,
  collectionEvidenceReference: bounded,
};
const strictBody =
  (allowed: readonly string[]) => async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('cache-control', 'private, no-store');
    const value = request.body;
    if (value && typeof value === 'object' && Object.keys(value).some((k) => !allowed.includes(k)))
      return reply
        .code(400)
        .send({ error: { code: 'INVALID_REQUEST', message: 'Unsupported adjustment fields.' } });
  };
export function registerCashShortfallRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: ReturnType<typeof createAuth>,
) {
  registerCashDiscovery(app, database, auth);
  app.get(
    '/admin/payments/orders/:id/cash-settlement',
    { schema: { params } },
    async (request, reply) => {
      const c = await paymentAdmin(database, auth, request.headers, 'payments.view');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Payment viewing is required.' } });
      reply.header('cache-control', 'private, no-store');
      try {
        return {
          data: {
            ...(await cashSettlement(
              database.db,
              c.organizationId,
              (request.params as { id: string }).id,
            )),
            adjustmentActivation: 'POLICY_BLOCKED',
          },
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.get(
    '/admin/payments/orders/:id/cash-adjustments',
    {
      schema: {
        params,
        querystring: Type.Object(
          {
            page: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000 })),
            pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const c = await paymentAdmin(database, auth, request.headers, 'payments.view');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Payment viewing is required.' } });
      reply.header('cache-control', 'private, no-store');
      try {
        return {
          data: await listCashAdjustments(database.db, {
            organizationId: c.organizationId,
            orderId: (request.params as { id: string }).id,
            ...(request.query as { page?: number; pageSize?: number }),
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/cash-shortfalls',
    {
      preValidation: strictBody(Object.keys(body)),
      schema: { body: Type.Object(body, { additionalProperties: false }) },
    },
    async (request, reply) => {
      const c = await paymentAdmin(
        database,
        auth,
        request.headers,
        'payments.cash_adjustments.manage',
      );
      if (!c)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Cash adjustment permission is required.' },
        });
      try {
        return {
          data: await settleCashShortfall(
            database.db,
            c,
            request.body as SettleCashShortfallDto,
            key(request.headers['idempotency-key']),
          ),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/cash-shortfalls/:id/approve',
    {
      preValidation: strictBody([]),
      schema: { params, body: Type.Object({}, { additionalProperties: false }) },
    },
    async (request, reply) => {
      const c = await paymentAdmin(
        database,
        auth,
        request.headers,
        'payments.cash_adjustments.approve',
      );
      if (!c)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Independent approval permission is required.' },
        });
      try {
        return {
          data: await approveCashShortfall(
            database.db,
            c,
            (request.params as { id: string }).id,
            key(request.headers['idempotency-key']),
          ),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/cash-shortfalls/:id/reverse',
    {
      preValidation: strictBody(['reason', 'evidenceReference']),
      schema: {
        params,
        body: Type.Object(
          { reason: bounded, evidenceReference: bounded },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const c = await paymentAdmin(database, auth, request.headers, 'payments.correct');
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Correction permission is required.' } });
      try {
        return {
          data: await reverseCashShortfall(
            database.db,
            c,
            (request.params as { id: string }).id,
            request.body as { reason: string; evidenceReference: string },
            key(request.headers['idempotency-key']),
          ),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/cash-policies',
    {
      preValidation: strictBody([
        'revision',
        'scope',
        'maximumPerAdjustment',
        'maximumPerOrder',
        'maximumPerStaffDay',
        'selfApprovalLimit',
        'allowedOrderStates',
        'effectiveFrom',
        'expiresAt',
        'accountingReference',
        'invoiceTreatmentReference',
        'courierShortCollectionReference',
      ]),
      schema: {
        body: Type.Object(
          {
            revision: Type.String({ minLength: 1, maxLength: 64 }),
            scope: Type.Union([Type.Literal('SYNTHETIC'), Type.Literal('BUSINESS')]),
            maximumPerAdjustment: amount,
            maximumPerOrder: amount,
            maximumPerStaffDay: amount,
            selfApprovalLimit: amount,
            allowedOrderStates: Type.Array(
              Type.Union([
                Type.Literal('PENDING'),
                Type.Literal('CONFIRMED'),
                Type.Literal('COMPLETED'),
              ]),
              { minItems: 1, maxItems: 3, uniqueItems: true },
            ),
            effectiveFrom: Type.String({ format: 'date-time' }),
            expiresAt: Type.String({ format: 'date-time' }),
            accountingReference: bounded,
            invoiceTreatmentReference: bounded,
            courierShortCollectionReference: bounded,
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
        'payments.cash_policies.manage',
      );
      if (!c)
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: 'Cash policy permission is required.' } });
      try {
        return {
          data: await proposeCashShortfallPolicy(database.db, {
            ...c,
            policy: request.body as CashShortfallPolicyInputDto,
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.post(
    '/admin/payments/cash-policies/:id/approve',
    {
      preValidation: strictBody(['approvalReference']),
      schema: {
        params,
        body: Type.Object({ approvalReference: bounded }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      const c = await paymentAdmin(
        database,
        auth,
        request.headers,
        'payments.cash_policies.approve',
      );
      if (!c)
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Independent policy approval permission is required.',
          },
        });
      try {
        return {
          data: await approveCashShortfallPolicy(database.db, {
            ...c,
            proposalId: (request.params as { id: string }).id,
            ...(request.body as { approvalReference: string }),
          }),
        };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
}
function key(value: string | string[] | undefined) {
  if (typeof value !== 'string')
    throw new PaymentDomainError('VALIDATION_FAILED', 'A stable UUID intent key is required.');
  return value;
}
