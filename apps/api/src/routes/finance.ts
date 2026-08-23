import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import * as finance from '@maevelle/database/finance';
import { findActiveAdminContext } from '@maevelle/database/platform';
import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
const body = <T>(value: unknown) => value as T;
function headers(source: Record<string, string | string[] | undefined>) {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
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
  if (!session?.user?.id) return;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return active && { ...active, actorId: session.user.id };
}
function failure(
  reply: { code(value: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof finance.FinanceDomainError)
    return reply
      .code(error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422)
      .send({ error: { code: error.code, message: error.message } });
  throw error;
}
const key = Type.String({ minLength: 8 });

export function registerFinanceRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/finance', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.accounts.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    const [accounts, expenses, reconciliations] = await Promise.all([
      finance.listFinancialAccounts(database.db, a.organizationId),
      finance.listExpenses(database.db, a.organizationId),
      finance.listReconciliations(database.db, a.organizationId),
    ]);
    return { data: { accounts, expenses, reconciliations } };
  });
  app.get('/admin/finance/accounts', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.accounts.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await finance.listFinancialAccounts(database.db, a.organizationId) };
  });
  app.get('/admin/finance/ledger', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.cash.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await finance.listLedger(
        database.db,
        a.organizationId,
        (req.query as { accountId?: string }).accountId,
      ),
    };
  });
  app.post(
    '/admin/finance/accounts',
    {
      schema: {
        body: Type.Object({
          accountNumber: Type.String(),
          name: Type.String(),
          accountType: Type.Union([
            Type.Literal('CASH'),
            Type.Literal('BANK'),
            Type.Literal('MOBILE_WALLET'),
            Type.Literal('OTHER'),
          ]),
          currencyCode: Type.String({ minLength: 3, maxLength: 3 }),
          referenceLabel: Type.Optional(Type.String()),
          openingBalance: Type.Optional(Type.String()),
          idempotencyKey: key,
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.accounts.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<Parameters<typeof finance.createFinancialAccount>[1], 'organizationId' | 'actorId'>
        >(req.body);
        return reply.code(201).send({
          data: await finance.createFinancialAccount(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.get('/admin/finance/categories', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.expenses.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await finance.listExpenseCategories(database.db, a.organizationId) };
  });
  app.post(
    '/admin/finance/categories',
    {
      schema: {
        body: Type.Object({
          code: Type.String(),
          name: Type.String(),
          classification: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.categories.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await finance.createExpenseCategory(database.db, {
            ...body<Omit<Parameters<typeof finance.createExpenseCategory>[1], 'organizationId'>>(
              req.body,
            ),
            organizationId: a.organizationId,
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.get('/admin/finance/expenses', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.expenses.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await finance.listExpenses(database.db, a.organizationId) };
  });
  app.post(
    '/admin/finance/expenses',
    {
      schema: {
        body: Type.Object({
          categoryId: Type.String(),
          amount: Type.String(),
          currencyCode: Type.String(),
          description: Type.String(),
          expenseDate: Type.String(),
          sourceDomain: Type.Optional(Type.String()),
          sourceId: Type.Optional(Type.String()),
          idempotencyKey: key,
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.expenses.create');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<Parameters<typeof finance.createExpense>[1], 'organizationId' | 'actorId'>
        >(req.body);
        return reply.code(201).send({
          data: await finance.createExpense(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.post(
    '/admin/finance/expenses/:id/pay',
    {
      schema: {
        body: Type.Object({ accountId: Type.String(), amount: Type.String(), idempotencyKey: key }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.expenses.pay');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<Parameters<typeof finance.payExpense>[1], 'organizationId' | 'actorId' | 'expenseId'>
        >(req.body);
        return {
          data: await finance.payExpense(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
            expenseId: (req.params as { id: string }).id,
          }),
        };
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.post(
    '/admin/finance/expenses/:id/adjustments',
    {
      schema: {
        body: Type.Object({
          amount: Type.String(),
          adjustmentType: Type.Union([
            Type.Literal('CREDIT'),
            Type.Literal('CORRECTION'),
            Type.Literal('REVERSAL'),
          ]),
          reason: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.expenses.create');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<
            Parameters<typeof finance.adjustExpense>[1],
            'organizationId' | 'actorId' | 'expenseId'
          >
        >(req.body);
        return reply.code(201).send({
          data: await finance.adjustExpense(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
            expenseId: (req.params as { id: string }).id,
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.post(
    '/admin/finance/transfers',
    {
      schema: {
        body: Type.Object({
          sourceAccountId: Type.String(),
          destinationAccountId: Type.String(),
          amount: Type.String(),
          reference: Type.Optional(Type.String()),
          idempotencyKey: key,
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.transfers.create');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<Parameters<typeof finance.createInternalTransfer>[1], 'organizationId' | 'actorId'>
        >(req.body);
        return reply.code(201).send({
          data: await finance.createInternalTransfer(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.post(
    '/admin/finance/movements',
    {
      schema: {
        body: Type.Object({
          accountId: Type.String(),
          amount: Type.String(),
          description: Type.String(),
          idempotencyKey: key,
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.cash.record_manual');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<Parameters<typeof finance.createExternalMovement>[1], 'organizationId' | 'actorId'>
        >(req.body);
        return reply.code(201).send({
          data: await finance.createExternalMovement(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.get('/admin/finance/reconciliations', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.reconciliation.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await finance.listReconciliations(database.db, a.organizationId) };
  });
  app.post(
    '/admin/finance/reconciliations',
    { schema: { body: Type.Object({ accountId: Type.String(), observedBalance: Type.String() }) } },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.reconciliation.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<
            Parameters<typeof finance.reconcileFinancialAccount>[1],
            'organizationId' | 'actorId'
          >
        >(req.body);
        return reply.code(201).send({
          data: await finance.reconcileFinancialAccount(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.post(
    '/admin/finance/payments/:id/posting',
    { schema: { body: Type.Object({ accountId: Type.String(), idempotencyKey: key }) } },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.cash.record_manual');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<
            Parameters<typeof finance.postPaymentToFinancialAccount>[1],
            'organizationId' | 'actorId' | 'paymentId'
          >
        >(req.body);
        return reply.code(201).send({
          data: await finance.postPaymentToFinancialAccount(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
            paymentId: (req.params as { id: string }).id,
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.post(
    '/admin/finance/refunds/:id/posting',
    { schema: { body: Type.Object({ accountId: Type.String(), idempotencyKey: key }) } },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.cash.record_manual');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<
            Parameters<typeof finance.postRefundToFinancialAccount>[1],
            'organizationId' | 'actorId' | 'refundId'
          >
        >(req.body);
        return reply.code(201).send({
          data: await finance.postRefundToFinancialAccount(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
            refundId: (req.params as { id: string }).id,
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.get('/admin/finance/integrity', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.cash.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await finance.verifyFinanceIntegrity(database.db, a.organizationId) };
  });
}
