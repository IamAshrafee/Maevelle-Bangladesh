import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import * as capital from './capital.js';
import * as finance from './finance.js';
import { createDatabase, type DatabaseClient } from './index.js';
import { runMigrations } from './migrate.js';
import { createOrganization } from './platform.js';

const configuredUrl = process.env.TEST_DATABASE_URL!;
const databaseName = `maevelle_capital_${crypto.randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(configuredUrl);
testUrl.pathname = `/${databaseName}`;
const adminUrl = new URL(configuredUrl);
adminUrl.pathname = '/postgres';
const adminPool = new Pool({ connectionString: adminUrl.toString() });
let database: DatabaseClient;
const actor = undefined as never;
const decimal = (value: string | undefined) => Number(value).toFixed(4);

beforeAll(async () => {
  if (new URL(configuredUrl).pathname.slice(1) !== 'maevelle_test')
    throw new Error(
      'Capital integration tests require the disposable maevelle_test configuration.',
    );
  await adminPool.query(`create database "${databaseName}"`);
  database = createDatabase({ connectionString: testUrl.toString(), maxConnections: 4 });
  await runMigrations(database.db);
});

afterAll(async () => {
  await database?.close();
  await adminPool.query(`drop database if exists "${databaseName}" with (force)`);
  await adminPool.end();
});

async function organization(label: string) {
  return (
    await createOrganization(database.db, {
      code: `capital-${label}-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Capital Test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    })
  ).id;
}

describe('Owner capital finance integration', () => {
  it('keeps capital out of revenue and records personal Expense funding without fake cash', async () => {
    const organizationId = await organization('workflow');
    const businessAccount = await finance.createFinancialAccount(database.db, {
      organizationId,
      actorId: actor,
      accountNumber: 'CASH-1',
      name: 'Business cash',
      accountType: 'CASH',
      currencyCode: 'BDT',
      openingBalance: '1000',
      idempotencyKey: crypto.randomUUID(),
    });
    const contributor = await capital.createCapitalContributor(database.db, {
      organizationId,
      actorId: actor,
      displayName: 'Owner A',
      idempotencyKey: crypto.randomUUID(),
    });
    const contributionInput = {
      organizationId,
      actorId: actor,
      contributorId: contributor.id,
      accountId: businessAccount.id,
      type: 'CONTRIBUTION' as const,
      amount: '500',
      occurredAt: '2026-10-01T08:00:00.000Z',
      reference: 'OWNER-CASH-1',
      idempotencyKey: crypto.randomUUID(),
    };
    const contribution = await capital.recordCapitalAccountMovement(database.db, contributionInput);
    expect((await capital.recordCapitalAccountMovement(database.db, contributionInput)).id).toBe(
      contribution.id,
    );
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, organizationId))[0]?.ledger_balance,
      ),
    ).toBe('1500.0000');
    expect(
      decimal(
        (await finance.getFinanceOverview(database.db, organizationId)).metrics.collectedPayments,
      ),
    ).toBe('0.0000');

    const category = await finance.createExpenseCategory(database.db, {
      organizationId,
      code: 'EQUIPMENT',
      name: 'Equipment',
    });
    const expense = await finance.createExpense(database.db, {
      organizationId,
      actorId: actor,
      categoryId: category!.id,
      amount: '200',
      currencyCode: 'BDT',
      description: 'Office printer',
      expenseDate: '2026-10-01',
      idempotencyKey: crypto.randomUUID(),
    });
    const funded = await capital.recordOwnerFundedExpense(database.db, {
      organizationId,
      actorId: actor,
      contributorId: contributor.id,
      expenseId: expense.id,
      amount: '80',
      occurredAt: '2026-10-01T09:00:00.000Z',
      reference: 'PERSONAL-CARD',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, organizationId))[0]?.ledger_balance,
      ),
    ).toBe('1500.0000');
    let expenseView = (await finance.listExpenses(database.db, organizationId)).items.find(
      (item) => item.id === expense.id,
    )!;
    expect(decimal(expenseView.paid)).toBe('80.0000');
    expect(decimal(expenseView.outstanding)).toBe('120.0000');
    const detail = await finance.getExpenseDetail(database.db, organizationId, expense.id);
    expect(detail.payments[0]).toMatchObject({
      paymentSource: 'OWNER_CAPITAL',
      contributorName: 'Owner A',
      accountId: null,
    });

    const summary = await capital.getCapitalOverview(database.db, organizationId);
    expect(decimal(summary.totalContributed)).toBe('500.0000');
    expect(decimal(summary.ownerFundedExpenses)).toBe('80.0000');
    expect(decimal(summary.netCapital)).toBe('580.0000');

    await capital.reverseCapitalEvent(database.db, {
      organizationId,
      actorId: actor,
      eventId: funded.id,
      reason: 'The business Account actually paid this portion.',
      idempotencyKey: crypto.randomUUID(),
    });
    expenseView = (await finance.listExpenses(database.db, organizationId)).items.find(
      (item) => item.id === expense.id,
    )!;
    expect(decimal(expenseView.paid)).toBe('0.0000');
    expect(decimal(expenseView.outstanding)).toBe('200.0000');
    expect(
      decimal((await capital.getCapitalOverview(database.db, organizationId)).netCapital),
    ).toBe('500.0000');
    const contributorView = (
      await capital.listCapitalContributors(database.db, organizationId)
    )[0]!;
    await capital.updateCapitalContributor(database.db, {
      organizationId,
      actorId: actor,
      contributorId: contributor.id,
      displayName: 'Owner A (inactive)',
      contactNote: 'Historical contributor',
      status: 'INACTIVE',
      expectedVersion: contributorView.version,
    });
    await expect(
      capital.recordCapitalAccountMovement(database.db, {
        organizationId,
        actorId: actor,
        contributorId: contributor.id,
        accountId: businessAccount.id,
        type: 'CONTRIBUTION',
        amount: '1',
        occurredAt: '2026-10-01T11:00:00.000Z',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('withdraws and reverses capital through the same Account ledger with tenant isolation', async () => {
    const organizationId = await organization('withdrawal');
    const otherOrganizationId = await organization('other');
    const account = await finance.createFinancialAccount(database.db, {
      organizationId,
      actorId: actor,
      accountNumber: 'BANK-1',
      name: 'Bank',
      accountType: 'BANK',
      currencyCode: 'BDT',
      openingBalance: '1000',
      idempotencyKey: crypto.randomUUID(),
    });
    const person = await capital.createCapitalContributor(database.db, {
      organizationId,
      actorId: actor,
      displayName: 'Owner B',
      idempotencyKey: crypto.randomUUID(),
    });
    const outsider = await capital.createCapitalContributor(database.db, {
      organizationId: otherOrganizationId,
      actorId: actor,
      displayName: 'Other owner',
      idempotencyKey: crypto.randomUUID(),
    });
    const foreignCurrencyAccount = await finance.createFinancialAccount(database.db, {
      organizationId,
      actorId: actor,
      accountNumber: 'USD-1',
      name: 'USD bank',
      accountType: 'BANK',
      currencyCode: 'USD',
      openingBalance: '10',
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      capital.recordCapitalAccountMovement(database.db, {
        organizationId,
        actorId: actor,
        contributorId: person.id,
        accountId: foreignCurrencyAccount.id,
        type: 'CONTRIBUTION',
        amount: '1',
        occurredAt: '2026-10-01T10:00:00.000Z',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      capital.recordCapitalAccountMovement(database.db, {
        organizationId,
        actorId: actor,
        contributorId: outsider.id,
        accountId: account.id,
        type: 'CONTRIBUTION',
        amount: '1',
        occurredAt: '2026-10-01T10:00:00.000Z',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const withdrawal = await capital.recordCapitalAccountMovement(database.db, {
      organizationId,
      actorId: actor,
      contributorId: person.id,
      accountId: account.id,
      type: 'WITHDRAWAL',
      amount: '250',
      occurredAt: '2026-10-01T10:00:00.000Z',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, organizationId))[0]?.ledger_balance,
      ),
    ).toBe('750.0000');
    await capital.reverseCapitalEvent(database.db, {
      organizationId,
      actorId: actor,
      eventId: withdrawal.id,
      reason: 'Withdrawal was entered against the wrong statement.',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, organizationId))[0]?.ledger_balance,
      ),
    ).toBe('1000.0000');
    expect((await capital.listCapitalEvents(database.db, organizationId)).items).toHaveLength(2);
  });

  it('supports single-step creation of owner-funded expenses and prevents conflicting account and capital funding', async () => {
    const organizationId = await organization('direct-expense');
    const contributor = await capital.createCapitalContributor(database.db, {
      organizationId,
      actorId: actor,
      displayName: 'Owner Direct',
      idempotencyKey: crypto.randomUUID(),
    });
    const category = await finance.createExpenseCategory(database.db, {
      organizationId,
      code: 'EQUIPMENT-DIRECT',
      name: 'Direct Equipment',
    });
    const businessAccount = await finance.createFinancialAccount(database.db, {
      organizationId,
      actorId: actor,
      accountNumber: 'CASH-DIR',
      name: 'Business Cash Direct',
      accountType: 'CASH',
      currencyCode: 'BDT',
      openingBalance: '500',
      idempotencyKey: crypto.randomUUID(),
    });

    // Cannot fund with both account and owner capital on creation
    await expect(
      finance.createExpense(database.db, {
        organizationId,
        actorId: actor,
        categoryId: category!.id,
        amount: '100',
        currencyCode: 'BDT',
        description: 'Office printer with conflicting funding',
        expenseDate: '2026-10-02',
        accountId: businessAccount.id,
        capitalContributorId: contributor.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    // Creates owner-funded expense atomically
    const created = await finance.createExpense(database.db, {
      organizationId,
      actorId: actor,
      categoryId: category!.id,
      amount: '250',
      currencyCode: 'BDT',
      description: 'Office printer paid personally by owner',
      expenseDate: '2026-10-02',
      capitalContributorId: contributor.id,
      paymentReference: 'PERSONAL-RECEIPT-99',
      idempotencyKey: crypto.randomUUID(),
    });

    expect(created.capitalEventId).toBeDefined();
    expect(created.financeTransactionId).toBeDefined();

    // Account balance remains untouched
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, organizationId))[0]?.ledger_balance,
      ),
    ).toBe('500.0000');

    // Expense is fully paid
    const detail = await finance.getExpenseDetail(database.db, organizationId, created.id);
    expect(decimal(detail.paid)).toBe('250.0000');
    expect(decimal(detail.outstanding)).toBe('0.0000');
    expect(detail.payments[0]).toMatchObject({
      paymentSource: 'OWNER_CAPITAL',
      contributorName: 'Owner Direct',
      reference: 'PERSONAL-RECEIPT-99',
    });

    // Capital overview reflects the personally funded expense
    const summary = await capital.getCapitalOverview(database.db, organizationId);
    expect(decimal(summary.ownerFundedExpenses)).toBe('250.0000');
    expect(decimal(summary.netCapital)).toBe('250.0000');
  });
});
