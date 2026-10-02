import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import * as capital from '@maevelle/database/capital';
import { FinanceDomainError } from '@maevelle/database/finance';
import { findActiveAdminContext } from '@maevelle/database/platform';
import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
const idempotencyKey = Type.String({ minLength: 8, maxLength: 200 });

function requestHeaders(source: Record<string, string | string[] | undefined>) {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

async function authorize(
  database: DatabaseClient,
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: requestHeaders(headers) });
  if (!session?.user?.id) return;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof headers['x-organization-id'] === 'string'
      ? { organizationId: headers['x-organization-id'] }
      : {}),
  });
  return context && { ...context, actorId: session.user.id };
}

function failure(
  reply: { code(value: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof FinanceDomainError) {
    return reply
      .code(error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422)
      .send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

export function registerCapitalRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/finance/capital/overview', async (request, reply) => {
    const context = await authorize(database, auth, request.headers, 'finance.capital.view');
    if (!context)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    return { data: await capital.getCapitalOverview(database.db, context.organizationId) };
  });

  app.get('/admin/finance/capital/contributors', async (request, reply) => {
    const context = await authorize(database, auth, request.headers, 'finance.capital.view');
    if (!context)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    return { data: await capital.listCapitalContributors(database.db, context.organizationId) };
  });

  app.post(
    '/admin/finance/capital/contributors',
    {
      schema: {
        body: Type.Object({
          displayName: Type.String({ minLength: 1, maxLength: 200 }),
          linkedUserId: Type.Optional(Type.String({ format: 'uuid' })),
          contactNote: Type.Optional(Type.String({ maxLength: 1000 })),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const context = await authorize(database, auth, request.headers, 'finance.capital.manage');
      if (!context)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        const input = request.body as Omit<
          Parameters<typeof capital.createCapitalContributor>[1],
          'organizationId' | 'actorId'
        >;
        return reply.code(201).send({
          data: await capital.createCapitalContributor(database.db, {
            ...input,
            organizationId: context.organizationId,
            actorId: context.actorId,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.patch(
    '/admin/finance/capital/contributors/:id',
    {
      schema: {
        body: Type.Object({
          displayName: Type.String({ minLength: 1, maxLength: 200 }),
          contactNote: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
          status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('INACTIVE')]),
          expectedVersion: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await authorize(database, auth, request.headers, 'finance.capital.manage');
      if (!context)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        const input = request.body as Omit<
          Parameters<typeof capital.updateCapitalContributor>[1],
          'organizationId' | 'actorId' | 'contributorId'
        >;
        return {
          data: await capital.updateCapitalContributor(database.db, {
            ...input,
            organizationId: context.organizationId,
            actorId: context.actorId,
            contributorId: (request.params as { id: string }).id,
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.get(
    '/admin/finance/capital/events',
    {
      schema: {
        querystring: Type.Object({
          contributorId: Type.Optional(Type.String({ format: 'uuid' })),
          eventType: Type.Optional(
            Type.Union([
              Type.Literal('ALL'),
              Type.Literal('CONTRIBUTION'),
              Type.Literal('OWNER_FUNDED_EXPENSE'),
              Type.Literal('WITHDRAWAL'),
              Type.Literal('REVERSAL'),
            ]),
          ),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authorize(database, auth, request.headers, 'finance.capital.view');
      if (!context)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      return {
        data: await capital.listCapitalEvents(
          database.db,
          context.organizationId,
          request.query as Parameters<typeof capital.listCapitalEvents>[2],
        ),
      };
    },
  );

  app.post(
    '/admin/finance/capital/account-movements',
    {
      schema: {
        body: Type.Object({
          contributorId: Type.String({ format: 'uuid' }),
          accountId: Type.String({ format: 'uuid' }),
          type: Type.Union([Type.Literal('CONTRIBUTION'), Type.Literal('WITHDRAWAL')]),
          amount: Type.String({ minLength: 1, maxLength: 30 }),
          occurredAt: Type.String({ format: 'date-time' }),
          reference: Type.Optional(Type.String({ maxLength: 200 })),
          note: Type.Optional(Type.String({ maxLength: 2000 })),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const context = await authorize(database, auth, request.headers, 'finance.capital.manage');
      if (!context)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        const input = request.body as Omit<
          Parameters<typeof capital.recordCapitalAccountMovement>[1],
          'organizationId' | 'actorId'
        >;
        return reply.code(201).send({
          data: await capital.recordCapitalAccountMovement(database.db, {
            ...input,
            organizationId: context.organizationId,
            actorId: context.actorId,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.post(
    '/admin/finance/expenses/:id/owner-funded-payments',
    {
      schema: {
        body: Type.Object({
          contributorId: Type.String({ format: 'uuid' }),
          amount: Type.String({ minLength: 1, maxLength: 30 }),
          occurredAt: Type.String({ format: 'date-time' }),
          reference: Type.Optional(Type.String({ maxLength: 200 })),
          note: Type.Optional(Type.String({ maxLength: 2000 })),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const context = await authorize(database, auth, request.headers, 'finance.capital.manage');
      if (!context)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        const input = request.body as Omit<
          Parameters<typeof capital.recordOwnerFundedExpense>[1],
          'organizationId' | 'actorId' | 'expenseId'
        >;
        return reply.code(201).send({
          data: await capital.recordOwnerFundedExpense(database.db, {
            ...input,
            organizationId: context.organizationId,
            actorId: context.actorId,
            expenseId: (request.params as { id: string }).id,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.post(
    '/admin/finance/capital/events/:id/reversal',
    {
      schema: {
        body: Type.Object({
          reason: Type.String({ minLength: 4, maxLength: 1000 }),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const context = await authorize(database, auth, request.headers, 'finance.capital.manage');
      if (!context)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        const input = request.body as { reason: string; idempotencyKey: string };
        return reply.code(201).send({
          data: await capital.reverseCapitalEvent(database.db, {
            ...input,
            organizationId: context.organizationId,
            actorId: context.actorId,
            eventId: (request.params as { id: string }).id,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
}
