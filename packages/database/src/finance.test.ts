import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import * as finance from './finance.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 6,
});
const actor = undefined as never;
const decimal = (value: string | undefined) => Number(value).toFixed(4);
async function organization(label: string) {
  return (
    await createOrganization(database.db, {
      code: `finance-${label}-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Finance Test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    })
  ).id;
}
async function account(org: string, name: string, opening: string) {
  return finance.createFinancialAccount(database.db, {
    organizationId: org,
    actorId: actor,
    accountNumber: `ACC-${crypto.randomUUID().slice(0, 8)}`,
    name,
    accountType: 'CASH',
    currencyCode: 'BDT',
    openingBalance: opening,
    idempotencyKey: crypto.randomUUID(),
  });
}
afterAll(async () => database.close());

describe('Finance operational cash ledger', () => {
  it('derives opening, expense payment, and adjustment balances from immutable entries', async () => {
    const org = await organization('ledger');
    const cash = await account(org, 'Main cash', '10000');
    const category = await finance.createExpenseCategory(database.db, {
      organizationId: org,
      code: `PACK-${crypto.randomUUID().slice(0, 6)}`,
      name: 'Packaging',
    });
    const expense = await finance.createExpense(database.db, {
      organizationId: org,
      actorId: actor,
      categoryId: category!.id,
      amount: '5000',
      currencyCode: 'BDT',
      description: 'Packaging materials',
      expenseDate: '2026-08-24',
      idempotencyKey: crypto.randomUUID(),
    });
    let row = (await finance.listExpenses(database.db, org)).find(
      (value) => value.id === expense.id,
    )!;
    expect(decimal(row.paid)).toBe('0.0000');
    expect(decimal(row.outstanding)).toBe('5000.0000');
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, org)).find(
          (value) => value.id === cash.id,
        )?.ledger_balance,
      ),
    ).toBe('10000.0000');
    await finance.payExpense(database.db, {
      organizationId: org,
      actorId: actor,
      expenseId: expense.id,
      accountId: cash.id,
      amount: '2000',
      idempotencyKey: crypto.randomUUID(),
    });
    await finance.payExpense(database.db, {
      organizationId: org,
      actorId: actor,
      expenseId: expense.id,
      accountId: cash.id,
      amount: '3000',
      idempotencyKey: crypto.randomUUID(),
    });
    row = (await finance.listExpenses(database.db, org)).find((value) => value.id === expense.id)!;
    expect(decimal(row.paid)).toBe('5000.0000');
    expect(decimal(row.outstanding)).toBe('0.0000');
    await expect(
      finance.payExpense(database.db, {
        organizationId: org,
        actorId: actor,
        expenseId: expense.id,
        accountId: cash.id,
        amount: '1',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await finance.createExternalMovement(database.db, {
      organizationId: org,
      actorId: actor,
      accountId: cash.id,
      amount: '1000',
      description: 'Owner injection',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, org)).find(
          (value) => value.id === cash.id,
        )?.ledger_balance,
      ),
    ).toBe('6000.0000');
    expect(await finance.verifyFinanceIntegrity(database.db, org)).toEqual([]);
  });
  it('posts same-currency transfers as one zero-sum transaction and keeps tenant data isolated', async () => {
    const org = await organization('transfer');
    const other = await organization('other');
    const source = await account(org, 'Cash', '10000');
    const destination = await account(org, 'Wallet', '5000');
    const b = await account(other, 'Other cash', '50');
    const result = await finance.createInternalTransfer(database.db, {
      organizationId: org,
      actorId: actor,
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      amount: '3000',
      idempotencyKey: `transfer-${crypto.randomUUID()}`,
    });
    const entries = await sql<{
      sum: string;
      count: string;
    }>`select sum(amount_delta)::text as sum,count(*)::text as count from finance.financial_account_entries where finance_transaction_id=${result.financeTransactionId}::uuid`.execute(
      database.db,
    );
    expect(decimal(entries.rows[0]?.sum)).toBe('0.0000');
    expect(entries.rows[0]?.count).toBe('2');
    const balances = await finance.listFinancialAccounts(database.db, org);
    expect(decimal(balances.find((value) => value.id === source.id)?.ledger_balance)).toBe(
      '7000.0000',
    );
    expect(decimal(balances.find((value) => value.id === destination.id)?.ledger_balance)).toBe(
      '8000.0000',
    );
    await expect(
      finance.createInternalTransfer(database.db, {
        organizationId: org,
        actorId: actor,
        sourceAccountId: source.id,
        destinationAccountId: b.id,
        amount: '1',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('records reconciliation differences without mutating the ledger', async () => {
    const org = await organization('reconciliation');
    const cash = await account(org, 'Cash', '10000');
    const result = await finance.reconcileFinancialAccount(database.db, {
      organizationId: org,
      actorId: actor,
      accountId: cash.id,
      observedBalance: '9800',
    });
    expect(decimal(result.ledgerBalance)).toBe('10000.0000');
    expect(decimal(result.difference)).toBe('-200.0000');
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, org)).find(
          (value) => value.id === cash.id,
        )?.ledger_balance,
      ),
    ).toBe('10000.0000');
  });
});
