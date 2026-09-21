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
  app.get('/admin/finance/overview', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.cash.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await finance.getFinanceOverview(database.db, a.organizationId) };
  });
  app.get(
    '/admin/finance/trends',
    {
      schema: {
        querystring: Type.Object({
          range: Type.Optional(
            Type.Union([
              Type.Literal('LAST_7_DAYS'),
              Type.Literal('LAST_30_DAYS'),
              Type.Literal('LAST_90_DAYS'),
              Type.Literal('THIS_MONTH'),
            ]),
          ),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.cash.view');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      const range = (req.query as { range?: finance.FinanceTrendRange }).range ?? 'LAST_30_DAYS';
      return { data: await finance.getFinanceTrends(database.db, a.organizationId, range) };
    },
  );
  app.get('/admin/finance/accounts', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.accounts.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await finance.listFinancialAccounts(database.db, a.organizationId) };
  });
  app.get(
    '/admin/finance/ledger',
    {
      schema: {
        querystring: Type.Object({
          accountId: Type.Optional(Type.String({ format: 'uuid' })),
          q: Type.Optional(Type.String()),
          transactionType: Type.Optional(
            Type.Union([
              Type.Literal('ALL'),
              Type.Literal('OPENING_BALANCE'),
              Type.Literal('EXPENSE_PAYMENT'),
              Type.Literal('INTERNAL_TRANSFER'),
              Type.Literal('EXTERNAL_ADJUSTMENT'),
              Type.Literal('PAYMENT_SOURCE_POSTING'),
              Type.Literal('REFUND_SOURCE_POSTING'),
              Type.Literal('COD_SETTLEMENT'),
            ]),
          ),
          direction: Type.Optional(
            Type.Union([Type.Literal('ALL'), Type.Literal('IN'), Type.Literal('OUT')]),
          ),
          from: Type.Optional(Type.String({ format: 'date' })),
          to: Type.Optional(Type.String({ format: 'date' })),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.cash.view');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = req.query as {
        accountId?: string;
        q?: string;
        transactionType?: finance.FinanceTransactionType | 'ALL';
        direction?: 'ALL' | 'IN' | 'OUT';
        from?: string;
        to?: string;
        page?: number;
        pageSize?: number;
      };
      const { q, ...filters } = query;
      return {
        data: await finance.listLedger(database.db, a.organizationId, {
          ...filters,
          ...(q ? { query: q } : {}),
        }),
      };
    },
  );
  app.get('/admin/finance/accounts/:id', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.accounts.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await finance.getFinancialAccountDetail(
          database.db,
          a.organizationId,
          (req.params as { id: string }).id,
        ),
      };
    } catch (e) {
      return failure(reply, e);
    }
  });
  app.post(
    '/admin/finance/accounts/:id/status',
    {
      schema: {
        body: Type.Object({
          status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('INACTIVE')]),
          expectedVersion: Type.Integer({ minimum: 1 }),
          reason: Type.String({ minLength: 4, maxLength: 1000 }),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.accounts.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<{
          status: 'ACTIVE' | 'INACTIVE';
          expectedVersion: number;
          reason: string;
        }>(req.body);
        return {
          data: await finance.changeFinancialAccountStatus(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
            accountId: (req.params as { id: string }).id,
          }),
        };
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
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
  app.get(
    '/admin/finance/expenses',
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String()),
          categoryId: Type.Optional(Type.String({ format: 'uuid' })),
          accountId: Type.Optional(Type.String({ format: 'uuid' })),
          status: Type.Optional(
            Type.Union([Type.Literal('ALL'), Type.Literal('RECORDED'), Type.Literal('CANCELLED')]),
          ),
          paymentState: Type.Optional(
            Type.Union([Type.Literal('ALL'), Type.Literal('OUTSTANDING'), Type.Literal('PAID')]),
          ),
          from: Type.Optional(Type.String({ format: 'date' })),
          to: Type.Optional(Type.String({ format: 'date' })),
          sourceDomain: Type.Optional(Type.Literal('procurement.purchase')),
          sourceId: Type.Optional(Type.String({ format: 'uuid' })),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.expenses.view');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = req.query as {
        q?: string;
        categoryId?: string;
        accountId?: string;
        status?: 'ALL' | 'RECORDED' | 'CANCELLED';
        paymentState?: 'ALL' | 'OUTSTANDING' | 'PAID';
        from?: string;
        to?: string;
        sourceDomain?: 'procurement.purchase';
        sourceId?: string;
        page?: number;
        pageSize?: number;
      };
      const { q, ...filters } = query;
      return {
        data: await finance.listExpenses(database.db, a.organizationId, {
          ...filters,
          ...(q ? { query: q } : {}),
        }),
      };
    },
  );
  app.get('/admin/finance/expenses/:id', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.expenses.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await finance.getExpenseDetail(
          database.db,
          a.organizationId,
          (req.params as { id: string }).id,
        ),
      };
    } catch (e) {
      return failure(reply, e);
    }
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
          payeeName: Type.Optional(Type.String({ maxLength: 200 })),
          externalReference: Type.Optional(Type.String({ maxLength: 200 })),
          notes: Type.Optional(Type.String({ maxLength: 2000 })),
          accountId: Type.Optional(Type.String({ format: 'uuid' })),
          paymentReference: Type.Optional(Type.String({ maxLength: 200 })),
          sourceDomain: Type.Optional(Type.Literal('procurement.purchase')),
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
        body: Type.Object({
          accountId: Type.String(),
          amount: Type.String(),
          reference: Type.Optional(Type.String({ maxLength: 200 })),
          idempotencyKey: key,
        }),
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
    '/admin/finance/expenses/:id/cancel',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          reason: Type.String({ minLength: 4, maxLength: 1000 }),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.expenses.create');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<{ expectedVersion: number; reason: string }>(req.body);
        return {
          data: await finance.cancelExpense(database.db, {
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
          amount: Type.String({ pattern: '^-?(?:0|[1-9]\\d*)(?:\\.\\d{1,4})?$' }),
          adjustmentType: Type.Union([
            Type.Literal('CREDIT'),
            Type.Literal('CORRECTION'),
            Type.Literal('REVERSAL'),
          ]),
          reason: Type.String({ minLength: 4, maxLength: 1000 }),
          expectedVersion: Type.Integer({ minimum: 1 }),
          idempotencyKey: Type.String({ minLength: 1, maxLength: 200 }),
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
  app.get('/admin/finance/cod-settlements/outstanding', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'finance.cod_settlements.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await finance.listOutstandingCodSettlementPayments(database.db, a.organizationId),
    };
  });
  app.get(
    '/admin/finance/cod-settlements',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.cod_settlements.view');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = req.query as { page?: number; pageSize?: number };
      return {
        data: await finance.listCodSettlements(database.db, a.organizationId, query),
      };
    },
  );
  app.post(
    '/admin/finance/cod-settlements',
    {
      schema: {
        body: Type.Object({
          destinationAccountId: Type.String({ minLength: 1 }),
          remittanceReference: Type.String({ minLength: 1, maxLength: 200 }),
          deductionAmount: Type.Optional(Type.String()),
          deductionNote: Type.Optional(Type.String({ maxLength: 1000 })),
          settledAt: Type.Optional(Type.String()),
          allocations: Type.Array(
            Type.Object({
              paymentId: Type.String({ minLength: 1 }),
              amount: Type.String({ minLength: 1 }),
            }),
            { minItems: 1, maxItems: 100 },
          ),
          idempotencyKey: key,
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.cod_settlements.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<
          Omit<Parameters<typeof finance.createCodSettlement>[1], 'organizationId' | 'actorId'>
        >(req.body);
        return reply.code(201).send({
          data: await finance.createCodSettlement(database.db, {
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
    '/admin/finance/reconciliations/:id/resolve',
    {
      schema: {
        body: Type.Object({
          resolutionCode: Type.Union([
            Type.Literal('EXPLAINED_DIFFERENCE'),
            Type.Literal('EXTERNAL_BALANCE_CORRECTED'),
          ]),
          note: Type.String({ minLength: 4, maxLength: 1000 }),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.reconciliation.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const p = body<{
          resolutionCode: finance.ReconciliationResolutionCode;
          note: string;
        }>(req.body);
        return {
          data: await finance.resolveReconciliation(database.db, {
            ...p,
            organizationId: a.organizationId,
            actorId: a.actorId,
            reconciliationId: (req.params as { id: string }).id,
          }),
        };
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
  app.post(
    '/admin/finance/reconciliations/:id/reopen',
    { schema: { body: Type.Object({ note: Type.String({ minLength: 4, maxLength: 1000 }) }) } },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'finance.reconciliation.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await finance.reopenReconciliation(database.db, {
            organizationId: a.organizationId,
            actorId: a.actorId,
            reconciliationId: (req.params as { id: string }).id,
            note: body<{ note: string }>(req.body).note,
          }),
        };
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
