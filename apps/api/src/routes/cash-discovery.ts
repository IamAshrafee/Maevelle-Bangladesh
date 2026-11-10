import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import { listCashPolicies, cashEligibility } from '@maevelle/database/payments';
import type { createAuth } from '../auth/auth.js';
import { paymentAdmin, sendPaymentError } from './payments.js';

export function registerCashDiscovery(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: ReturnType<typeof createAuth>,
) {
  app.get(
    '/admin/payments/cash-policies',
    {
      schema: {
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
      reply.header('cache-control', 'private, no-store');
      const c =
        (await paymentAdmin(database, auth, request.headers, 'payments.cash_policies.manage')) ??
        (await paymentAdmin(database, auth, request.headers, 'payments.cash_policies.approve'));
      if (!c)
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Cash policy management or review permission is required.',
          },
        });
      const q = request.query as { page?: number; pageSize?: number };
      try {
        return { data: await listCashPolicies(database.db, c.organizationId, q.page, q.pageSize) };
      } catch (e) {
        return sendPaymentError(reply, e);
      }
    },
  );
  app.get(
    '/admin/payments/orders/:id/cash-eligibility',
    {
      schema: {
        params: Type.Object(
          { id: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const c = await paymentAdmin(database, auth, request.headers, 'payments.view');
      if (!c)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Payment viewing permission is required.' },
        });
      try {
        return {
          data: await cashEligibility(
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
}
