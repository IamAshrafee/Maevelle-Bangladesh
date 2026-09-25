import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import {
  authorizeReturnCase,
  cancelReturnCase,
  createReturnCase,
  createReverseShipment,
  decideReturnAuthorization,
  getReturnCase,
  initiateRto,
  inspectReturnReceiptLine,
  linkRefundToReturn,
  listReturnCasePage,
  postReturnReceipt,
  ReturnDomainError,
  transitionReturnTransport,
} from '@maevelle/database/returns';
import { findActiveAdminContext } from '@maevelle/database/platform';
import type { createAuth } from '../auth/auth.js';
type Auth = ReturnType<typeof createAuth>;
function headers(source: Record<string, string | string[] | undefined>) {
  return new Headers(
    Object.entries(source).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  );
}
async function admin(
  database: DatabaseClient,
  auth: Auth,
  source: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(source) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}
function send(reply: { code(value: number): { send(value: unknown): unknown } }, error: unknown) {
  if (error instanceof ReturnDomainError)
    return reply
      .code(error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422)
      .send({ error: { code: error.code, message: error.message } });
  throw error;
}
export function registerReturnRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get(
    '/admin/returns',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          search: Type.Optional(Type.String()),
          caseType: Type.Optional(
            Type.Union([Type.Literal('CUSTOMER_RETURN'), Type.Literal('RTO')]),
          ),
          status: Type.Optional(
            Type.Union([Type.Literal('OPEN'), Type.Literal('RESOLVED'), Type.Literal('CANCELLED')]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const result = await listReturnCasePage(
        database.db,
        active.organizationId,
        request.query as Parameters<typeof listReturnCasePage>[2],
      );
      return { data: result.items, meta: { pagination: result.pagination } };
    },
  );
  app.get('/admin/returns/:id', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'returns.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getReturnCase(database.db, {
          organizationId: active.organizationId,
          returnCaseId: (request.params as { id: string }).id,
        }),
      };
    } catch (error) {
      return send(reply, error);
    }
  });
  app.post(
    '/admin/returns',
    {
      schema: {
        body: Type.Object({
          orderId: Type.String(),
          reasonCode: Type.String(),
          reasonText: Type.Optional(Type.String()),
          lines: Type.Array(
            Type.Object({
              orderLineId: Type.String(),
              fulfillmentLineId: Type.Optional(Type.String()),
              deliveryLineId: Type.Optional(Type.String()),
              quantity: Type.String(),
            }),
          ),
          idempotencyKey: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createReturnCase(database.db, {
            ...active,
            actorId: active.actorId,
            ...(request.body as {
              orderId: string;
              reasonCode: string;
              reasonText?: string;
              lines: {
                orderLineId: string;
                fulfillmentLineId?: string;
                deliveryLineId?: string;
                quantity: string;
              }[];
              idempotencyKey: string;
            }),
          }),
        });
      } catch (error) {
        return send(reply, error);
      }
    },
  );
  app.post(
    '/admin/returns/:id/authorize',
    {
      schema: {
        body: Type.Object({ expectedVersion: Type.Number(), idempotencyKey: Type.String() }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await authorizeReturnCase(database.db, {
            ...active,
            actorId: active.actorId,
            returnCaseId: (request.params as { id: string }).id,
            ...(request.body as { expectedVersion: number; idempotencyKey: string }),
          }),
        };
      } catch (error) {
        return send(reply, error);
      }
    },
  );
  app.post(
    '/admin/rto',
    { schema: { body: Type.Object({ deliveryId: Type.String(), idempotencyKey: Type.String() }) } },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await initiateRto(database.db, {
            ...active,
            actorId: active.actorId,
            ...(request.body as { deliveryId: string; idempotencyKey: string }),
          }),
        });
      } catch (error) {
        return send(reply, error);
      }
    },
  );
  app.post(
    '/admin/returns/:id/receipts',
    {
      schema: {
        body: Type.Object({
          locationId: Type.String(),
          idempotencyKey: Type.String(),
          lines: Type.Array(
            Type.Object({
              returnLineId: Type.String(),
              quantity: Type.String(),
            }),
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.receive');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await postReturnReceipt(database.db, {
            ...active,
            actorId: active.actorId,
            returnCaseId: (request.params as { id: string }).id,
            ...(request.body as {
              locationId: string;
              idempotencyKey: string;
              lines: {
                returnLineId: string;
                quantity: string;
              }[];
            }),
          }),
        });
      } catch (error) {
        return send(reply, error);
      }
    },
  );
  app.post(
    '/admin/returns/:id/authorization',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          decision: Type.Union([Type.Literal('APPROVE'), Type.Literal('REJECT')]),
          lines: Type.Optional(
            Type.Array(Type.Object({ returnLineId: Type.String(), quantity: Type.String() })),
          ),
          reason: Type.Optional(Type.String()),
          expiresAt: Type.Optional(Type.String()),
          idempotencyKey: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          expectedVersion: number;
          decision: 'APPROVE' | 'REJECT';
          lines?: { returnLineId: string; quantity: string }[];
          reason?: string;
          expiresAt?: string;
          idempotencyKey: string;
        };
        return {
          data: await decideReturnAuthorization(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            returnCaseId: (request.params as { id: string }).id,
            expectedVersion: body.expectedVersion,
            decision: body.decision,
            ...(body.lines ? { lines: body.lines } : {}),
            ...(body.reason ? { reason: body.reason } : {}),
            ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
            idempotencyKey: body.idempotencyKey,
          }),
        };
      } catch (error) {
        return send(reply, error);
      }
    },
  );
  app.post(
    '/admin/returns/:id/cancel',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          reason: Type.String(),
          idempotencyKey: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          expectedVersion: number;
          reason: string;
          idempotencyKey: string;
        };
        return {
          data: await cancelReturnCase(database.db, {
            ...active,
            returnCaseId: (request.params as { id: string }).id,
            ...body,
          }),
        };
      } catch (error) {
        return send(reply, error);
      }
    },
  );
  app.post(
    '/admin/returns/:id/reverse-shipments',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          providerCode: Type.String(),
          trackingReference: Type.Optional(Type.String()),
          externalConsignmentId: Type.Optional(Type.String()),
          idempotencyKey: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          expectedVersion: number;
          providerCode: string;
          trackingReference?: string;
          externalConsignmentId?: string;
          idempotencyKey: string;
        };
        return reply.code(201).send({
          data: await createReverseShipment(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            returnCaseId: (request.params as { id: string }).id,
            expectedVersion: body.expectedVersion,
            providerCode: body.providerCode,
            ...(body.trackingReference ? { trackingReference: body.trackingReference } : {}),
            ...(body.externalConsignmentId
              ? { externalConsignmentId: body.externalConsignmentId }
              : {}),
            idempotencyKey: body.idempotencyKey,
          }),
        });
      } catch (error) {
        return send(reply, error);
      }
    },
  );
  app.post(
    '/admin/returns/:id/transport',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          nextStatus: Type.Union([
            Type.Literal('IN_TRANSIT'),
            Type.Literal('ARRIVED'),
            Type.Literal('LOST'),
          ]),
          idempotencyKey: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          expectedVersion: number;
          nextStatus: 'IN_TRANSIT' | 'ARRIVED' | 'LOST';
          idempotencyKey: string;
        };
        return {
          data: await transitionReturnTransport(database.db, {
            ...active,
            returnCaseId: (request.params as { id: string }).id,
            ...body,
          }),
        };
      } catch (error) {
        return send(reply, error);
      }
    },
  );
  app.post(
    '/admin/return-receipt-lines/:id/inspect',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          quantity: Type.String(),
          outcome: Type.Union([
            Type.Literal('SELLABLE'),
            Type.Literal('DAMAGED'),
            Type.Literal('QUARANTINE'),
            Type.Literal('REJECTED_RETURN'),
          ]),
          note: Type.Optional(Type.String()),
          idempotencyKey: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'returns.receive');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          expectedVersion: number;
          quantity: string;
          outcome: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'REJECTED_RETURN';
          note?: string;
          idempotencyKey: string;
        };
        return reply.code(201).send({
          data: await inspectReturnReceiptLine(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            returnReceiptLineId: (request.params as { id: string }).id,
            expectedVersion: body.expectedVersion,
            quantity: body.quantity,
            outcome: body.outcome,
            ...(body.note ? { note: body.note } : {}),
            idempotencyKey: body.idempotencyKey,
          }),
        });
      } catch (error) {
        return send(reply, error);
      }
    },
  );
  app.post(
    '/admin/returns/:id/refunds',
    { schema: { body: Type.Object({ refundId: Type.String() }) } },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'refunds.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await linkRefundToReturn(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            returnCaseId: (request.params as { id: string }).id,
            refundId: (request.body as { refundId: string }).refundId,
          }),
        };
      } catch (error) {
        return send(reply, error);
      }
    },
  );
}
