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
    let row = (await finance.listExpenses(database.db, org)).items.find(
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
    row = (await finance.listExpenses(database.db, org)).items.find(
      (value) => value.id === expense.id,
    )!;
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
    const overview = await finance.getFinanceOverview(database.db, org);
    expect(overview.currency).toBe('BDT');
    expect(decimal(overview.metrics.paidExpenses)).toBe('5000.0000');
    expect(decimal(overview.metrics.accountBalance)).toBe('6000.0000');
    expect(decimal(overview.metrics.netAccountMovement)).toBe('6000.0000');
    expect(overview.attention.outstandingExpenses).toBe(0);
    expect(overview.recentActivity.length).toBeGreaterThan(0);
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
    expect(await finance.listReconciliations(database.db, org)).toMatchObject([
      {
        id: result.id,
        status: 'OPEN',
        difference_amount: '-200.0000',
        resolution: null,
      },
    ]);
    expect(
      (await finance.getFinanceOverview(database.db, org)).attention.reconciliationDifferences,
    ).toBe(1);
    await expect(
      finance.resolveReconciliation(database.db, {
        organizationId: org,
        actorId: actor,
        reconciliationId: result.id,
        resolutionCode: 'EXPLAINED_DIFFERENCE',
        note: 'Cash count included a documented petty-cash handoff.',
      }),
    ).resolves.toEqual({ id: result.id, status: 'CLOSED' });
    expect(await finance.listReconciliations(database.db, org)).toMatchObject([
      {
        id: result.id,
        status: 'CLOSED',
        resolution: {
          code: 'EXPLAINED_DIFFERENCE',
          note: 'Cash count included a documented petty-cash handoff.',
        },
      },
    ]);
    expect(
      (await finance.getFinanceOverview(database.db, org)).attention.reconciliationDifferences,
    ).toBe(0);
    await expect(
      finance.resolveReconciliation(database.db, {
        organizationId: org,
        actorId: actor,
        reconciliationId: result.id,
        resolutionCode: 'EXPLAINED_DIFFERENCE',
        note: 'A repeated close must not overwrite the first resolution.',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      finance.reopenReconciliation(database.db, {
        organizationId: org,
        actorId: actor,
        reconciliationId: result.id,
        note: 'New evidence requires the discrepancy to be reviewed again.',
      }),
    ).resolves.toEqual({ id: result.id, status: 'OPEN' });
    expect((await finance.listReconciliations(database.db, org))[0]).toMatchObject({
      id: result.id,
      status: 'OPEN',
      resolution: { code: 'EXPLAINED_DIFFERENCE' },
    });
    expect(
      (await finance.getFinanceOverview(database.db, org)).attention.reconciliationDifferences,
    ).toBe(1);
    await expect(
      finance.reopenReconciliation(database.db, {
        organizationId: org,
        actorId: actor,
        reconciliationId: result.id,
        note: 'A repeated reopen must not create another transition.',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await finance.resolveReconciliation(database.db, {
      organizationId: org,
      actorId: actor,
      reconciliationId: result.id,
      resolutionCode: 'EXTERNAL_BALANCE_CORRECTED',
      note: 'The external cash count was corrected and independently checked.',
    });
    expect((await finance.listReconciliations(database.db, org))[0]).toMatchObject({
      id: result.id,
      status: 'CLOSED',
      resolution: {
        code: 'EXTERNAL_BALANCE_CORRECTED',
        note: 'The external cash count was corrected and independently checked.',
      },
    });
    const evidence = await sql<{
      resolved_audits: string;
      reopened_audits: string;
      resolved_events: string;
      reopened_events: string;
    }>`select
      (select count(*) from audit.audit_events where organization_id=${org} and target_id=${result.id}::uuid and action='finance.reconciliation.resolved')::text as resolved_audits,
      (select count(*) from audit.audit_events where organization_id=${org} and target_id=${result.id}::uuid and action='finance.reconciliation.reopened')::text as reopened_audits,
      (select count(*) from platform.outbox_events where organization_id=${org} and aggregate_id=${result.id}::uuid and event_type='finance.reconciliation.resolved')::text as resolved_events,
      (select count(*) from platform.outbox_events where organization_id=${org} and aggregate_id=${result.id}::uuid and event_type='finance.reconciliation.reopened')::text as reopened_events`.execute(
      database.db,
    );
    expect(evidence.rows[0]).toEqual({
      resolved_audits: '2',
      reopened_audits: '1',
      resolved_events: '2',
      reopened_events: '1',
    });
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, org)).find(
          (value) => value.id === cash.id,
        )?.ledger_balance,
      ),
    ).toBe('10000.0000');
    const matched = await finance.reconcileFinancialAccount(database.db, {
      organizationId: org,
      actorId: actor,
      accountId: cash.id,
      observedBalance: '10000',
    });
    expect(matched.difference).toBe('0.0000');
    expect((await finance.listReconciliations(database.db, org))[0]).toMatchObject({
      id: matched.id,
      status: 'CLOSED',
      resolution: null,
    });
  });

  it('handles comma-formatted observed balance and validates input in reconcileFinancialAccount', async () => {
    const org = await organization('reconciliation-comma');
    const bank = await account(org, 'City Bank', '25000');

    // Comma-formatted matching balance -> difference 0, auto-closed
    const matched = await finance.reconcileFinancialAccount(database.db, {
      organizationId: org,
      actorId: actor,
      accountId: bank.id,
      observedBalance: '25,000.00',
    });
    expect(matched.difference).toBe('0.0000');
    expect(matched.status).toBe('CLOSED');

    // Comma-formatted discrepancy -> difference recorded, status OPEN
    const discrepancy = await finance.reconcileFinancialAccount(database.db, {
      organizationId: org,
      actorId: actor,
      accountId: bank.id,
      observedBalance: '24,500.50',
    });
    expect(decimal(discrepancy.difference)).toBe('-499.5000');
    expect(discrepancy.status).toBe('OPEN');

    // Invalid format rejected with VALIDATION_FAILED
    await expect(
      finance.reconcileFinancialAccount(database.db, {
        organizationId: org,
        actorId: actor,
        accountId: bank.id,
        observedBalance: 'not-a-number',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      finance.reconcileFinancialAccount(database.db, {
        organizationId: org,
        actorId: actor,
        accountId: bank.id,
        observedBalance: '',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects sub-cent overdrafts without converting NUMERIC money to floating point', async () => {
    const org = await organization('exact-decimals');
    const source = await account(org, 'Large exact balance', '9007199254740992.0000');
    const destination = await account(org, 'Destination', '0');

    await expect(
      finance.createInternalTransfer(database.db, {
        organizationId: org,
        actorId: actor,
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        amount: '9007199254740992.0001',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('validates and traces supplier payables to a placed Purchase', async () => {
    const org = await organization('supplier-payable');
    const other = await organization('other-supplier-payable');
    const cash = await account(org, 'Supplier payment account', '1000');
    const category = await finance.createExpenseCategory(database.db, {
      organizationId: org,
      code: `COGS-${crypto.randomUUID().slice(0, 6)}`,
      name: 'Supplier invoices',
    });
    const supplier = await sql<{
      id: string;
    }>`insert into procurement.suppliers (organization_id,code,name) values (${org},${`SUP-${crypto.randomUUID().slice(0, 8)}`},'Traceable supplier') returning id`.execute(
      database.db,
    );
    const purchase = await sql<{
      id: string;
    }>`insert into procurement.purchases (organization_id,purchase_number,supplier_id,currency_code) values (${org},${`PO-${crypto.randomUUID().slice(0, 8)}`},${supplier.rows[0]!.id},'BDT') returning id`.execute(
      database.db,
    );
    const otherSupplier = await sql<{
      id: string;
    }>`insert into procurement.suppliers (organization_id,code,name) values (${other},${`SUP-${crypto.randomUUID().slice(0, 8)}`},'Other tenant supplier') returning id`.execute(
      database.db,
    );
    const otherPurchase = await sql<{
      id: string;
    }>`insert into procurement.purchases (organization_id,purchase_number,supplier_id,currency_code,status) values (${other},${`PO-${crypto.randomUUID().slice(0, 8)}`},${otherSupplier.rows[0]!.id},'BDT','PLACED') returning id`.execute(
      database.db,
    );
    const input = {
      organizationId: org,
      actorId: actor,
      categoryId: category!.id,
      amount: '250',
      currencyCode: 'BDT',
      description: 'Supplier invoice',
      expenseDate: '2026-09-21',
      sourceDomain: 'procurement.purchase' as const,
    };
    await expect(
      finance.createExpense(database.db, {
        ...input,
        sourceId: purchase.rows[0]!.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      finance.createExpense(database.db, {
        ...input,
        sourceId: otherPurchase.rows[0]!.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await sql`update procurement.purchases set status='PLACED' where id=${purchase.rows[0]!.id}`.execute(
      database.db,
    );
    const expense = await finance.createExpense(database.db, {
      ...input,
      sourceId: purchase.rows[0]!.id,
      idempotencyKey: crypto.randomUUID(),
    });
    const listed = (await finance.listExpenses(database.db, org)).items.find(
      (item) => item.id === expense.id,
    );
    expect(listed).toMatchObject({
      source_domain: 'procurement.purchase',
      source_id: purchase.rows[0]!.id,
      source_counterparty: 'Traceable supplier',
    });
    expect(listed?.source_reference).toMatch(/^PO-/);
    await finance.payExpense(database.db, {
      organizationId: org,
      actorId: actor,
      expenseId: expense.id,
      accountId: cash.id,
      amount: '250',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      decimal(
        (await finance.listExpenses(database.db, org)).items.find((item) => item.id === expense.id)
          ?.outstanding,
      ),
    ).toBe('0.0000');
  });

  it('supports paged Expense operations with idempotent payments, safe adjustments, cancellation, and evidence', async () => {
    const org = await organization('expense-workflow');
    const cash = await account(org, 'Expense cash', '1000');
    const category = await finance.createExpenseCategory(database.db, {
      organizationId: org,
      code: `OPS-${crypto.randomUUID().slice(0, 6)}`,
      name: 'Operations',
    });
    const paidInput = {
      organizationId: org,
      actorId: actor,
      categoryId: category!.id,
      amount: '250',
      currencyCode: 'BDT',
      description: 'Warehouse supplies',
      expenseDate: '2026-09-20',
      payeeName: 'Supply vendor',
      externalReference: 'INV-EXP-001',
      notes: 'Paid at the counter.',
      accountId: cash.id,
      paymentReference: 'BANK-EXP-001',
      idempotencyKey: `expense-${crypto.randomUUID()}`,
    };
    const paid = await finance.createExpense(database.db, paidInput);
    expect((await finance.createExpense(database.db, paidInput)).id).toBe(paid.id);
    const paidDetail = await finance.getExpenseDetail(database.db, org, paid.id);
    expect(paidDetail).toMatchObject({
      payee_name: 'Supply vendor',
      external_reference: 'INV-EXP-001',
      notes: 'Paid at the counter.',
      paid: '250.0000',
      outstanding: '0.0000',
    });
    expect(paidDetail.payments).toHaveLength(1);
    expect(paidDetail.payments[0]).toMatchObject({
      accountId: cash.id,
      reference: 'BANK-EXP-001',
    });
    expect(paidDetail.activity.map((event) => event.action)).toEqual(
      expect.arrayContaining(['finance.expense.created', 'finance.expense.paid']),
    );
    expect(
      decimal(
        (await finance.listFinancialAccounts(database.db, org)).find(
          (value) => value.id === cash.id,
        )?.ledger_balance,
      ),
    ).toBe('750.0000');
    const filtered = await finance.listExpenses(database.db, org, {
      query: 'INV-EXP-001',
      categoryId: category!.id,
      accountId: cash.id,
      paymentState: 'PAID',
      from: '2026-09-20',
      to: '2026-09-20',
      page: 1,
      pageSize: 1,
    });
    expect(filtered.items.map((item) => item.id)).toEqual([paid.id]);
    expect(filtered.pagination).toEqual({ page: 1, pageSize: 1, totalItems: 1, totalPages: 1 });
    await expect(
      finance.cancelExpense(database.db, {
        organizationId: org,
        actorId: actor,
        expenseId: paid.id,
        expectedVersion: paidDetail.version,
        reason: 'A paid Expense must remain immutable.',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const adjustable = await finance.createExpense(database.db, {
      organizationId: org,
      actorId: actor,
      categoryId: category!.id,
      amount: '300',
      currencyCode: 'BDT',
      description: 'Adjustable service cost',
      expenseDate: '2026-09-21',
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      finance.adjustExpense(database.db, {
        organizationId: org,
        actorId: actor,
        expenseId: adjustable.id,
        expectedVersion: 1,
        amount: '25',
        adjustmentType: 'CREDIT',
        reason: 'Vendor credit note.',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const adjustmentInput = {
      organizationId: org,
      actorId: actor,
      expenseId: adjustable.id,
      expectedVersion: 1,
      amount: '-50',
      adjustmentType: 'CREDIT' as const,
      reason: 'Vendor credit note.',
      idempotencyKey: crypto.randomUUID(),
    };
    const adjustment = await finance.adjustExpense(database.db, adjustmentInput);
    expect(adjustment.version).toBe(2);
    await expect(finance.adjustExpense(database.db, adjustmentInput)).resolves.toEqual(adjustment);
    await expect(
      finance.adjustExpense(database.db, {
        organizationId: org,
        actorId: actor,
        expenseId: adjustable.id,
        expectedVersion: 1,
        amount: '10',
        adjustmentType: 'CORRECTION',
        reason: 'Stale correction attempt.',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const partialPaymentInput = {
      organizationId: org,
      actorId: actor,
      expenseId: adjustable.id,
      accountId: cash.id,
      amount: '100',
      reference: 'PARTIAL-EXP-001',
      idempotencyKey: crypto.randomUUID(),
    };
    const partialPayment = await finance.payExpense(database.db, partialPaymentInput);
    await expect(finance.payExpense(database.db, partialPaymentInput)).resolves.toEqual(
      partialPayment,
    );
    await expect(
      finance.adjustExpense(database.db, {
        organizationId: org,
        actorId: actor,
        expenseId: adjustable.id,
        expectedVersion: 2,
        amount: '-200',
        adjustmentType: 'CORRECTION',
        reason: 'Would reduce the Expense below its payment.',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const adjustedDetail = await finance.getExpenseDetail(database.db, org, adjustable.id);
    expect(adjustedDetail).toMatchObject({
      adjustments: '-50.0000',
      paid: '100.0000',
      outstanding: '150.0000',
      version: 2,
    });
    expect(adjustedDetail.adjustmentHistory).toMatchObject([
      { id: adjustment.id, amount: '-50.0000', type: 'CREDIT' },
    ]);

    const cancellable = await finance.createExpense(database.db, {
      organizationId: org,
      actorId: actor,
      categoryId: category!.id,
      amount: '50',
      currencyCode: 'BDT',
      description: 'Cancelled service',
      expenseDate: '2026-09-21',
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      finance.cancelExpense(database.db, {
        organizationId: org,
        actorId: actor,
        expenseId: cancellable.id,
        expectedVersion: 1,
        reason: 'Service was not delivered.',
      }),
    ).resolves.toMatchObject({ id: cancellable.id, status: 'CANCELLED', version: 2 });
    await expect(
      finance.payExpense(database.db, {
        organizationId: org,
        actorId: actor,
        expenseId: cancellable.id,
        accountId: cash.id,
        amount: '1',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const cancelledDetail = await finance.getExpenseDetail(database.db, org, cancellable.id);
    expect(cancelledDetail).toMatchObject({ status: 'CANCELLED', version: 2 });
    expect(cancelledDetail.activity.map((event) => event.action)).toContain(
      'finance.expense.cancelled',
    );
    const evidence = await sql<{
      adjustment_audits: string;
      adjustment_events: string;
      cancellation_audits: string;
      cancellation_events: string;
    }>`select
      (select count(*) from audit.audit_events where organization_id=${org} and target_id=${adjustable.id}::uuid and action='finance.expense.adjusted')::text as adjustment_audits,
      (select count(*) from platform.outbox_events where organization_id=${org} and aggregate_id=${adjustable.id}::uuid and event_type='finance.expense.adjusted')::text as adjustment_events,
      (select count(*) from audit.audit_events where organization_id=${org} and target_id=${cancellable.id}::uuid and action='finance.expense.cancelled')::text as cancellation_audits,
      (select count(*) from platform.outbox_events where organization_id=${org} and aggregate_id=${cancellable.id}::uuid and event_type='finance.expense.cancelled')::text as cancellation_events`.execute(
      database.db,
    );
    expect(evidence.rows[0]).toEqual({
      adjustment_audits: '1',
      adjustment_events: '1',
      cancellation_audits: '1',
      cancellation_events: '1',
    });
  });

  it('sanitizes account code, supports comma-formatted opening balance, and reports duplicate conflicts', async () => {
    const org = await organization('acc-creation');
    const created = await finance.createFinancialAccount(database.db, {
      organizationId: org,
      actorId: actor,
      accountNumber: '  bkash-main  ',
      name: '  Main bKash Wallet  ',
      accountType: 'MOBILE_WALLET',
      currencyCode: 'bdt',
      referenceLabel: '  01700-000000  ',
      openingBalance: ' 25,000.00 ',
      idempotencyKey: crypto.randomUUID(),
    });

    expect(created.id).toBeDefined();

    const detail = await finance.getFinancialAccountDetail(database.db, org, created.id);
    expect(detail.account_number).toBe('BKASH-MAIN');
    expect(detail.name).toBe('Main bKash Wallet');
    expect(detail.currency_code).toBe('BDT');
    expect(detail.reference_label).toBe('01700-000000');
    expect(decimal(detail.ledger_balance)).toBe('25000.0000');

    // Duplicate account code should throw CONFLICT
    await expect(
      finance.createFinancialAccount(database.db, {
        organizationId: org,
        actorId: actor,
        accountNumber: 'BKASH-MAIN',
        name: 'Another bKash',
        accountType: 'MOBILE_WALLET',
        currencyCode: 'BDT',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Financial account with code "BKASH-MAIN" already exists.',
    });
  });

  it('supports comma-formatted transfer amounts and validates account balance invariants', async () => {
    const org = await organization('transfers-test');
    const source = await account(org, 'Bank Source', '50000');
    const dest = await account(org, 'Wallet Dest', '10000');

    // Transfer 15,000 with commas
    const transferResult = await finance.createInternalTransfer(database.db, {
      organizationId: org,
      actorId: actor,
      sourceAccountId: source.id,
      destinationAccountId: dest.id,
      amount: ' 15,000.00 ',
      reference: '  Weekly bank to wallet refill  ',
      idempotencyKey: crypto.randomUUID(),
    });

    expect(transferResult.financeTransactionId).toBeDefined();

    const sourceDetail = await finance.getFinancialAccountDetail(database.db, org, source.id);
    const destDetail = await finance.getFinancialAccountDetail(database.db, org, dest.id);
    expect(decimal(sourceDetail.ledger_balance)).toBe('35000.0000');
    expect(decimal(destDetail.ledger_balance)).toBe('25000.0000');

    // Insufficient balance transfer
    await expect(
      finance.createInternalTransfer(database.db, {
        organizationId: org,
        actorId: actor,
        sourceAccountId: source.id,
        destinationAccountId: dest.id,
        amount: '40000',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    // Same account transfer
    await expect(
      finance.createInternalTransfer(database.db, {
        organizationId: org,
        actorId: actor,
        sourceAccountId: source.id,
        destinationAccountId: source.id,
        amount: '1000',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Transfer accounts must differ.',
    });
  });

  it('supports setting initial opening balance and enforces invariants', async () => {
    const org = await organization('opening-bal-test');

    // Create an account with zero opening balance
    const zeroAcc = await finance.createFinancialAccount(database.db, {
      organizationId: org,
      actorId: actor,
      accountNumber: 'CASH-DRAWER-1',
      name: 'Test Cash Drawer',
      accountType: 'CASH',
      currencyCode: 'BDT',
      idempotencyKey: crypto.randomUUID(),
    });

    const initialDetail = await finance.getFinancialAccountDetail(database.db, org, zeroAcc.id);
    expect(initialDetail.hasOpeningBalance).toBe(false);
    expect(initialDetail.canSetOpeningBalance).toBe(true);
    expect(decimal(initialDetail.ledger_balance)).toBe('0.0000');

    // Invalid amount (0 or negative)
    await expect(
      finance.setFinancialAccountOpeningBalance(database.db, {
        organizationId: org,
        actorId: actor,
        accountId: zeroAcc.id,
        amount: '0',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    // Successfully set opening balance
    const idempotencyKey = crypto.randomUUID();
    const setResult = await finance.setFinancialAccountOpeningBalance(database.db, {
      organizationId: org,
      actorId: actor,
      accountId: zeroAcc.id,
      amount: ' 10,500.00 ',
      description: 'Initial drawer float',
      idempotencyKey,
    });
    expect(setResult.id).toBe(zeroAcc.id);
    expect(setResult.transactionId).toBeDefined();

    // Idempotent retry returns the same transaction
    const replayResult = await finance.setFinancialAccountOpeningBalance(database.db, {
      organizationId: org,
      actorId: actor,
      accountId: zeroAcc.id,
      amount: ' 10,500.00 ',
      idempotencyKey,
    });
    expect(replayResult.transactionId).toBe(setResult.transactionId);

    // Detail after opening balance
    const updatedDetail = await finance.getFinancialAccountDetail(database.db, org, zeroAcc.id);
    expect(updatedDetail.hasOpeningBalance).toBe(true);
    expect(updatedDetail.canSetOpeningBalance).toBe(false);
    expect(decimal(updatedDetail.ledger_balance)).toBe('10500.0000');

    // Attempting to set opening balance again with a new key fails
    await expect(
      finance.setFinancialAccountOpeningBalance(database.db, {
        organizationId: org,
        actorId: actor,
        accountId: zeroAcc.id,
        amount: '5000',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'An opening balance has already been set for this account.',
    });

    // Inactive account cannot have opening balance set
    const inactiveAcc = await finance.createFinancialAccount(database.db, {
      organizationId: org,
      actorId: actor,
      accountNumber: 'INACTIVE-1',
      name: 'Inactive Account',
      accountType: 'OTHER',
      currencyCode: 'BDT',
      idempotencyKey: crypto.randomUUID(),
    });
    await finance.changeFinancialAccountStatus(database.db, {
      organizationId: org,
      actorId: actor,
      accountId: inactiveAcc.id,
      status: 'INACTIVE',
      expectedVersion: 1,
      reason: 'Deactivated immediately for testing',
    });
    await expect(
      finance.setFinancialAccountOpeningBalance(database.db, {
        organizationId: org,
        actorId: actor,
        accountId: inactiveAcc.id,
        amount: '5000',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Opening balance can only be set on an ACTIVE financial account.',
    });
  });
});

