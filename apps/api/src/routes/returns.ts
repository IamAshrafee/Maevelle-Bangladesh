import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import {
  authorizeReturnCase,
  createReturnCase,
  initiateRto,
  listReturnCases,
  postReturnReceipt,
  ReturnDomainError,
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
  app.get('/admin/returns', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'returns.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listReturnCases(database.db, active.organizationId) };
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
              condition: Type.Union([
                Type.Literal('SELLABLE'),
                Type.Literal('DAMAGED'),
                Type.Literal('QUARANTINE'),
                Type.Literal('INSPECTION'),
              ]),
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
                condition: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
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
}
