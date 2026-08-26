import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';

export class FinanceDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED',
    message: string,
  ) {
    super(message);
  }
}
const money = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
function positive(value: string, label = 'Amount'): string {
  const v = value.trim();
  if (!money.test(v) || Number(v) <= 0)
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      `${label} must be a positive decimal amount.`,
    );
  return v;
}
function signed(value: string): string {
  const v = value.trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(v) || Number(v) === 0)
    throw new FinanceDomainError('VALIDATION_FAILED', 'Amount must be a non-zero decimal amount.');
  return v;
}
function fingerprint(value: unknown) {
  return JSON.stringify(value);
}
async function outbox(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  event: string,
  id: string,
) {
  await sql`insert into platform.outbox_events (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values (${organizationId},${event},1,'finance.finance_transaction',${id}::uuid,1,${JSON.stringify({ financeTransactionId: id })}::jsonb,now())`.execute(
    db,
  );
}
async function nextNumber(
  db: Kysely<DatabaseSchema>,
  org: string,
  prefix: string,
  table?: 'finance_transactions' | 'expenses',
): Promise<string> {
  const target = table ?? (prefix === 'EXP' ? 'expenses' : 'finance_transactions');
  const r = await sql<{
    n: string;
  }>`select lpad((count(*) + 1)::text,6,'0') as n from finance.${sql.table(target)} where organization_id=${org}`.execute(
    db,
  );
  return `${prefix}-${r.rows[0]?.n ?? '000001'}`;
}
async function account(db: Kysely<DatabaseSchema>, org: string, id: string, lock = false) {
  const r = await sql<{
    id: string;
    currency_code: string;
    status: string;
  }>`select id,currency_code,status from finance.financial_accounts where organization_id=${org} and id=${id}${lock ? sql` for update` : sql``}`.execute(
    db,
  );
  if (!r.rows[0]) throw new FinanceDomainError('NOT_FOUND', 'Financial account was not found.');
  return r.rows[0];
}
async function balance(db: Kysely<DatabaseSchema>, org: string, id: string) {
  const r = await sql<{
    amount: string;
  }>`select coalesce(sum(amount_delta),0)::text as amount from finance.financial_account_entries where organization_id=${org} and financial_account_id=${id}`.execute(
    db,
  );
  return r.rows[0]?.amount ?? '0';
}
async function movement(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    accountId: string;
    amount: string;
    currency: string;
    type: string;
    description: string;
    sourceDomain?: string;
    sourceId?: string;
  },
) {
  const number = await nextNumber(db, input.organizationId, 'FIN');
  const t = await sql<{
    id: string;
  }>`insert into finance.finance_transactions (organization_id,transaction_number,transaction_type,description,source_domain,source_id,created_by) values (${input.organizationId},${number},${input.type},${input.description},${input.sourceDomain ?? null},${input.sourceId ?? null}::uuid,${input.actorId}::uuid) returning id`.execute(
    db,
  );
  const id = t.rows[0]?.id;
  if (!id) throw new Error('Finance transaction was not created.');
  await sql`insert into finance.financial_account_entries (organization_id,finance_transaction_id,financial_account_id,amount_delta,currency_code) values (${input.organizationId},${id}::uuid,${input.accountId}::uuid,${input.amount}::numeric,${input.currency})`.execute(
    db,
  );
  return id;
}
async function claim(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; operation: string; key: string; body: unknown },
) {
  try {
    return await claimIdempotencyRecord(db, {
      organizationId: input.organizationId,
      principalType: 'USER',
      principalId: input.actorId,
      operationType: input.operation,
      idempotencyKey: input.key,
      requestFingerprint: fingerprint(input.body),
    });
  } catch (e) {
    if (e instanceof IdempotencyKeyReuseError) throw new FinanceDomainError('CONFLICT', e.message);
    throw e;
  }
}

export async function listFinancialAccounts(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql<{
      id: string;
      account_number: string;
      name: string;
      account_type: string;
      currency_code: string;
      status: string;
      reference_label: string | null;
      version: string;
      ledger_balance: string;
      last_movement_at: string | null;
    }>`select a.id,a.account_number,a.name,a.account_type,a.currency_code,a.status,a.reference_label,a.version::text,coalesce(sum(e.amount_delta),0)::text as ledger_balance,max(e.created_at)::text as last_movement_at from finance.financial_accounts a left join finance.financial_account_entries e on e.financial_account_id=a.id and e.organization_id=a.organization_id where a.organization_id=${organizationId} group by a.id order by a.name`.execute(
      db,
    )
  ).rows;
}
export async function listLedger(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  accountId?: string,
) {
  return (
    await sql<{
      id: string;
      amount_delta: string;
      currency_code: string;
      created_at: string;
      transaction_id: string;
      transaction_number: string;
      transaction_type: string;
      description: string;
      source_domain: string | null;
      source_id: string | null;
      account_name: string;
    }>`select e.id::text,e.amount_delta::text,e.currency_code,e.created_at::text,t.id as transaction_id,t.transaction_number,t.transaction_type,t.description,t.source_domain,t.source_id,a.name as account_name from finance.financial_account_entries e join finance.finance_transactions t on t.id=e.finance_transaction_id join finance.financial_accounts a on a.id=e.financial_account_id where e.organization_id=${organizationId} and (${accountId ?? null}::uuid is null or e.financial_account_id=${accountId ?? null}::uuid) order by e.created_at desc,e.id desc`.execute(
      db,
    )
  ).rows;
}
export async function createFinancialAccount(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    accountNumber: string;
    name: string;
    accountType: 'CASH' | 'BANK' | 'MOBILE_WALLET' | 'OTHER';
    currencyCode: string;
    referenceLabel?: string;
    openingBalance?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const idempotency = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.account.create',
      key: input.idempotencyKey,
      body: input,
    });
    if (!idempotency.created) {
      const r = await sql<{
        id: string;
      }>`select id from finance.financial_accounts where organization_id=${input.organizationId} and account_number=${input.accountNumber}`.execute(
        tx,
      );
      if (r.rows[0]) return r.rows[0];
    }
    let id: string;
    try {
      const r = await sql<{
        id: string;
      }>`insert into finance.financial_accounts (organization_id,account_number,name,account_type,currency_code,reference_label) values (${input.organizationId},${input.accountNumber},${input.name},${input.accountType},${input.currencyCode},${input.referenceLabel ?? null}) returning id`.execute(
        tx,
      );
      id = r.rows[0]?.id as string;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new FinanceDomainError(
          'CONFLICT',
          'Financial account with this number already exists.',
        );
      throw error;
    }
    if (!id) throw new Error('Financial account was not created.');
    if (input.openingBalance && Number(input.openingBalance) !== 0) {
      const amount = signed(input.openingBalance);
      const openingTransactionId = await movement(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        accountId: id,
        amount,
        currency: input.currencyCode,
        type: 'OPENING_BALANCE',
        description: 'Opening balance',
        sourceDomain: 'finance.account',
        sourceId: id,
      });
      await outbox(tx, input.organizationId, 'finance.account.opened', openingTransactionId);
    }
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.account.created',
      targetType: 'finance.financial_account',
      targetId: id,
    });
    return { id };
  });
}
export async function createExpenseCategory(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; code: string; name: string; classification?: string },
) {
  const r = await sql<{
    id: string;
  }>`insert into finance.expense_categories (organization_id,code,name,classification) values (${input.organizationId},${input.code},${input.name},${input.classification ?? 'OPERATING'}) returning id`.execute(
    db,
  );
  return r.rows[0];
}
export async function listExpenseCategories(db: Kysely<DatabaseSchema>, org: string) {
  return (
    await sql`select id,code,name,classification,status from finance.expense_categories where organization_id=${org} order by name`.execute(
      db,
    )
  ).rows;
}
export async function createExpense(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    categoryId: string;
    amount: string;
    currencyCode: string;
    description: string;
    expenseDate: string;
    sourceDomain?: string;
    sourceId?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    positive(input.amount);
    const category =
      await sql`select id from finance.expense_categories where organization_id=${input.organizationId} and id=${input.categoryId} and status='ACTIVE'`.execute(
        tx,
      );
    if (!category.rows[0])
      throw new FinanceDomainError('NOT_FOUND', 'Active expense category was not found.');
    const claimResult = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.expense.create',
      key: input.idempotencyKey,
      body: input,
    });
    if (!claimResult.created)
      throw new FinanceDomainError('CONFLICT', 'Expense creation was already processed.');
    const n = await nextNumber(tx, input.organizationId, 'EXP');
    const r = await sql<{
      id: string;
    }>`insert into finance.expenses (organization_id,expense_number,expense_category_id,currency_code,amount,expense_date,description,source_domain,source_id,created_by) values (${input.organizationId},${n},${input.categoryId}::uuid,${input.currencyCode},${input.amount}::numeric,${input.expenseDate}::date,${input.description},${input.sourceDomain ?? null},${input.sourceId ?? null}::uuid,${input.actorId}::uuid) returning id`.execute(
      tx,
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error('Expense was not created.');
    if (input.sourceDomain && input.sourceId)
      await sql`insert into finance.expense_links (organization_id,expense_id,source_domain,source_id) values (${input.organizationId},${id}::uuid,${input.sourceDomain},${input.sourceId}::uuid)`.execute(
        tx,
      );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.expense.created',
      targetType: 'finance.expense',
      targetId: id,
    });
    return { id };
  });
}
export async function listExpenses(db: Kysely<DatabaseSchema>, org: string) {
  return (
    await sql<{
      id: string;
      expense_number: string;
      description: string;
      amount: string;
      currency_code: string;
      expense_date: string;
      status: string;
      category_name: string;
      paid: string;
      adjustments: string;
      outstanding: string;
    }>`select e.id,e.expense_number,e.description,e.amount::text,e.currency_code,e.expense_date::text,e.status,c.name as category_name,coalesce(sum(p.amount),0)::text as paid,coalesce(sum(a.amount),0)::text as adjustments,(e.amount+coalesce(sum(a.amount),0)-coalesce(sum(p.amount),0))::text as outstanding from finance.expenses e join finance.expense_categories c on c.id=e.expense_category_id left join finance.expense_payments p on p.expense_id=e.id left join finance.expense_adjustments a on a.expense_id=e.id where e.organization_id=${org} group by e.id,c.name order by e.expense_date desc`.execute(
      db,
    )
  ).rows;
}
export async function payExpense(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    expenseId: string;
    accountId: string;
    amount: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const amount = positive(input.amount);
    const exp = await sql<{
      currency_code: string;
      remaining: string;
    }>`select e.currency_code,(e.amount+coalesce((select sum(amount) from finance.expense_adjustments where expense_id=e.id),0)-coalesce((select sum(amount) from finance.expense_payments where expense_id=e.id),0))::text as remaining from finance.expenses e where e.organization_id=${input.organizationId} and e.id=${input.expenseId} for update`.execute(
      tx,
    );
    if (!exp.rows[0]) throw new FinanceDomainError('NOT_FOUND', 'Expense was not found.');
    if (Number(amount) > Number(exp.rows[0].remaining))
      throw new FinanceDomainError('CONFLICT', 'Payment exceeds the outstanding expense amount.');
    const a = await account(tx, input.organizationId, input.accountId, true);
    if (a.status !== 'ACTIVE' || a.currency_code !== exp.rows[0].currency_code)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'Financial account must be active and use the expense currency.',
      );
    if (Number(await balance(tx, input.organizationId, input.accountId)) < Number(amount))
      throw new FinanceDomainError('CONFLICT', 'Financial account has insufficient balance.');
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.expense.pay',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created)
      throw new FinanceDomainError('CONFLICT', 'Expense payment was already processed.');
    const t = await movement(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      accountId: input.accountId,
      amount: `-${amount}`,
      currency: a.currency_code,
      type: 'EXPENSE_PAYMENT',
      description: 'Expense payment',
      sourceDomain: 'finance.expense',
      sourceId: input.expenseId,
    });
    await sql`insert into finance.expense_payments (organization_id,expense_id,finance_transaction_id,amount) values (${input.organizationId},${input.expenseId}::uuid,${t}::uuid,${amount}::numeric)`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.expense.paid',
      targetType: 'finance.expense',
      targetId: input.expenseId,
    });
    await outbox(tx, input.organizationId, 'finance.expense.paid', t);
    return { financeTransactionId: t };
  });
}
export async function adjustExpense(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    expenseId: string;
    amount: string;
    adjustmentType: 'CREDIT' | 'CORRECTION' | 'REVERSAL';
    reason: string;
  },
) {
  const amount = signed(input.amount);
  const r = await sql<{
    id: string;
  }>`insert into finance.expense_adjustments (organization_id,expense_id,adjustment_type,amount,reason,created_by) select ${input.organizationId},${input.expenseId}::uuid,${input.adjustmentType},${amount}::numeric,${input.reason},${input.actorId}::uuid where exists(select 1 from finance.expenses where id=${input.expenseId} and organization_id=${input.organizationId}) returning id`.execute(
    db,
  );
  if (!r.rows[0]) throw new FinanceDomainError('NOT_FOUND', 'Expense was not found.');
  return r.rows[0];
}
export async function createInternalTransfer(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: string;
    reference?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const amount = positive(input.amount);
    if (input.sourceAccountId === input.destinationAccountId)
      throw new FinanceDomainError('VALIDATION_FAILED', 'Transfer accounts must differ.');
    const ids = [input.sourceAccountId, input.destinationAccountId].sort();
    for (const id of ids) await account(tx, input.organizationId, id, true);
    const source = await account(tx, input.organizationId, input.sourceAccountId);
    const dest = await account(tx, input.organizationId, input.destinationAccountId);
    if (
      source.status !== 'ACTIVE' ||
      dest.status !== 'ACTIVE' ||
      source.currency_code !== dest.currency_code
    )
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'Transfer accounts must be active and use the same currency.',
      );
    if (Number(await balance(tx, input.organizationId, input.sourceAccountId)) < Number(amount))
      throw new FinanceDomainError('CONFLICT', 'Source account has insufficient balance.');
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.transfer.create',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created) throw new FinanceDomainError('CONFLICT', 'Transfer was already processed.');
    const n = await nextNumber(tx, input.organizationId, 'FIN');
    const tr = await sql<{
      id: string;
    }>`insert into finance.finance_transactions (organization_id,transaction_number,transaction_type,description,created_by) values (${input.organizationId},${n},'INTERNAL_TRANSFER',${input.reference ?? 'Internal transfer'},${input.actorId}::uuid) returning id`.execute(
      tx,
    );
    const tid = tr.rows[0]?.id;
    if (!tid) throw new Error('Transfer transaction failed.');
    await sql`insert into finance.financial_account_entries (organization_id,finance_transaction_id,financial_account_id,amount_delta,currency_code) values (${input.organizationId},${tid}::uuid,${input.sourceAccountId}::uuid,${`-${amount}`}::numeric,${source.currency_code}),(${input.organizationId},${tid}::uuid,${input.destinationAccountId}::uuid,${amount}::numeric,${source.currency_code})`.execute(
      tx,
    );
    await sql`insert into finance.internal_transfers (organization_id,finance_transaction_id,source_account_id,destination_account_id,amount,currency_code,reference,created_by) values (${input.organizationId},${tid}::uuid,${input.sourceAccountId}::uuid,${input.destinationAccountId}::uuid,${amount}::numeric,${source.currency_code},${input.reference ?? null},${input.actorId}::uuid)`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.transfer.created',
      targetType: 'finance.internal_transfer',
      targetId: tid,
    });
    await outbox(tx, input.organizationId, 'finance.transfer.created', tid);
    return { financeTransactionId: tid };
  });
}
export async function createExternalMovement(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    accountId: string;
    amount: string;
    description: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const a = await account(tx, input.organizationId, input.accountId, true);
    if (a.status !== 'ACTIVE')
      throw new FinanceDomainError('VALIDATION_FAILED', 'Financial account is inactive.');
    const value = signed(input.amount);
    if (
      Number(value) < 0 &&
      Number(await balance(tx, input.organizationId, input.accountId)) < Math.abs(Number(value))
    )
      throw new FinanceDomainError('CONFLICT', 'Financial account has insufficient balance.');
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.cash.adjust',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created)
      throw new FinanceDomainError('CONFLICT', 'Cash movement was already processed.');
    const t = await movement(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      accountId: input.accountId,
      amount: value,
      currency: a.currency_code,
      type: 'EXTERNAL_ADJUSTMENT',
      description: input.description,
    });
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.cash.adjusted',
      targetType: 'finance.finance_transaction',
      targetId: t,
    });
    await outbox(tx, input.organizationId, 'finance.cash.adjusted', t);
    return { financeTransactionId: t };
  });
}
export async function postPaymentToFinancialAccount(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    paymentId: string;
    accountId: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const p = await sql<{
      amount: string;
      currency_code: string;
    }>`select amount::text,currency_code from payments.payments where organization_id=${input.organizationId} and id=${input.paymentId} and status='CONFIRMED'`.execute(
      tx,
    );
    if (!p.rows[0]) throw new FinanceDomainError('NOT_FOUND', 'Confirmed Payment was not found.');
    const a = await account(tx, input.organizationId, input.accountId, true);
    if (a.status !== 'ACTIVE' || a.currency_code !== p.rows[0].currency_code)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'Account must be active and match the Payment currency.',
      );
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.payment.post',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created)
      throw new FinanceDomainError('CONFLICT', 'Payment source posting was already processed.');
    try {
      const t = await movement(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        accountId: input.accountId,
        amount: p.rows[0].amount,
        currency: a.currency_code,
        type: 'PAYMENT_SOURCE_POSTING',
        description: 'Payment source posting',
        sourceDomain: 'payments.payment',
        sourceId: input.paymentId,
      });
      await outbox(tx, input.organizationId, 'finance.payment.posted', t);
      return { financeTransactionId: t };
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new FinanceDomainError('CONFLICT', 'Payment already has a Finance source posting.');
      throw error;
    }
  });
}
export async function postRefundToFinancialAccount(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    refundId: string;
    accountId: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const r = await sql<{
      amount: string;
      currency_code: string;
    }>`select amount::text,currency_code from payments.refunds where organization_id=${input.organizationId} and id=${input.refundId} and status='COMPLETED'`.execute(
      tx,
    );
    if (!r.rows[0]) throw new FinanceDomainError('NOT_FOUND', 'Completed Refund was not found.');
    const a = await account(tx, input.organizationId, input.accountId, true);
    if (a.status !== 'ACTIVE' || a.currency_code !== r.rows[0].currency_code)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'Account must be active and match the Refund currency.',
      );
    if (Number(await balance(tx, input.organizationId, input.accountId)) < Number(r.rows[0].amount))
      throw new FinanceDomainError('CONFLICT', 'Financial account has insufficient balance.');
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.refund.post',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created)
      throw new FinanceDomainError('CONFLICT', 'Refund source posting was already processed.');
    try {
      const t = await movement(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        accountId: input.accountId,
        amount: `-${r.rows[0].amount}`,
        currency: a.currency_code,
        type: 'REFUND_SOURCE_POSTING',
        description: 'Refund source posting',
        sourceDomain: 'payments.refund',
        sourceId: input.refundId,
      });
      await outbox(tx, input.organizationId, 'finance.refund.posted', t);
      return { financeTransactionId: t };
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new FinanceDomainError('CONFLICT', 'Refund already has a Finance source posting.');
      throw error;
    }
  });
}
export async function reconcileFinancialAccount(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; accountId: string; observedBalance: string },
) {
  return db.transaction().execute(async (tx) => {
    const a = await account(tx, input.organizationId, input.accountId);
    const observed = signed(input.observedBalance);
    const ledger = await balance(tx, input.organizationId, input.accountId);
    const diff = (Number(observed) - Number(ledger)).toFixed(4);
    const r = await sql<{
      id: string;
    }>`insert into finance.reconciliation_sessions (organization_id,financial_account_id,observed_balance,ledger_balance,difference_amount,created_by) values (${input.organizationId},${a.id}::uuid,${observed}::numeric,${ledger}::numeric,${diff}::numeric,${input.actorId}::uuid) returning id`.execute(
      tx,
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error('Reconciliation was not created.');
    if (Number(diff) !== 0)
      await sql`insert into finance.reconciliation_issues (organization_id,reconciliation_session_id,issue_code,description,amount_delta) values (${input.organizationId},${id}::uuid,'LEDGER_DIFFERENCE','Observed balance differs from immutable ledger.',${diff}::numeric)`.execute(
        tx,
      );
    return { id, ledgerBalance: ledger, difference: diff };
  });
}
export async function listReconciliations(db: Kysely<DatabaseSchema>, org: string) {
  return (
    await sql<{
      id: string;
      observed_balance: string;
      ledger_balance: string;
      difference_amount: string;
      status: string;
      created_at: string;
      account_name: string;
    }>`select s.id,s.observed_balance::text,s.ledger_balance::text,s.difference_amount::text,s.status,s.created_at::text,a.name as account_name from finance.reconciliation_sessions s join finance.financial_accounts a on a.id=s.financial_account_id where s.organization_id=${org} order by s.created_at desc`.execute(
      db,
    )
  ).rows;
}
export async function verifyFinanceIntegrity(db: Kysely<DatabaseSchema>, organizationId: string) {
  const findings: string[] = [];
  const badCurrency =
    await sql`select 1 from finance.financial_account_entries e join finance.financial_accounts a on a.id=e.financial_account_id where e.organization_id=${organizationId} and e.currency_code<>a.currency_code limit 1`.execute(
      db,
    );
  if (badCurrency.rows[0]) findings.push('ACCOUNT_ENTRY_CURRENCY_MISMATCH');
  const badTransfer =
    await sql`select t.id from finance.internal_transfers t join finance.financial_account_entries e on e.finance_transaction_id=t.finance_transaction_id where t.organization_id=${organizationId} group by t.id having count(*)<>2 or coalesce(sum(e.amount_delta),0)<>0 limit 1`.execute(
      db,
    );
  if (badTransfer.rows[0]) findings.push('TRANSFER_ENTRY_MISMATCH');
  const overpaid =
    await sql`select e.id from finance.expenses e where e.organization_id=${organizationId} and coalesce((select sum(amount) from finance.expense_payments where expense_id=e.id),0)>e.amount+coalesce((select sum(amount) from finance.expense_adjustments where expense_id=e.id),0) limit 1`.execute(
      db,
    );
  if (overpaid.rows[0]) findings.push('EXPENSE_OVERPAID');
  return findings;
}
