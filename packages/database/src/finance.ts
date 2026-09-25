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
const signedMoney = /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

/** Finance amounts use the database's NUMERIC(20,4) scale; compare them without IEEE-754. */
function moneyUnits(value: string): bigint {
  const normalized = value.trim();
  if (!signedMoney.test(normalized))
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Amount must be a decimal with up to 4 places.',
    );
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const result = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
  return negative ? -result : result;
}

function moneyFromUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 10_000n;
  const fraction = (absolute % 10_000n).toString().padStart(4, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function positive(value: string, label = 'Amount'): string {
  const v = value.trim();
  if (!money.test(v) || moneyUnits(v) <= 0n)
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      `${label} must be a positive decimal amount.`,
    );
  return v;
}
function nonNegative(value: string, label = 'Amount'): string {
  const v = value.trim();
  if (!money.test(v) || moneyUnits(v) < 0n)
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      `${label} must be a non-negative decimal amount.`,
    );
  return v;
}
function signed(value: string): string {
  const v = value.trim();
  if (!signedMoney.test(v) || moneyUnits(v) === 0n)
    throw new FinanceDomainError('VALIDATION_FAILED', 'Amount must be a non-zero decimal amount.');
  return v;
}
function fingerprint(value: unknown) {
  return JSON.stringify(value);
}

function withFinanceTransaction<T>(
  db: Kysely<DatabaseSchema>,
  callback: (trx: Kysely<DatabaseSchema>) => Promise<T>,
): Promise<T> {
  if ('isTransaction' in db && (db as { isTransaction?: boolean }).isTransaction) {
    return callback(db);
  }
  return db.transaction().execute(callback);
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
  table?: 'finance_transactions' | 'expenses' | 'cod_settlements',
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

export interface FinanceOverviewView {
  readonly currency: string;
  readonly period: { readonly from: string; readonly to: string; readonly label: string };
  readonly metrics: {
    readonly collectedPayments: string;
    readonly completedRefunds: string;
    readonly paidExpenses: string;
    readonly netAccountMovement: string;
    readonly accountBalance: string;
    readonly outstandingExpenses: string;
    readonly outstandingSupplierPayments: string;
    readonly outstandingCodHeld: string;
  };
  readonly attention: {
    readonly pendingPaymentVerifications: number;
    readonly pendingCodCollections: number;
    readonly unpostedPayments: number;
    readonly unpostedRefunds: number;
    readonly reconciliationDifferences: number;
    readonly outstandingExpenses: number;
    readonly outstandingSupplierPayments: number;
    readonly outstandingCodPayments: number;
  };
  readonly recentActivity: readonly {
    readonly id: string;
    readonly amount_delta: string;
    readonly currency_code: string;
    readonly created_at: string;
    readonly transaction_id: string;
    readonly transaction_number: string;
    readonly transaction_type: string;
    readonly description: string;
    readonly source_domain: string | null;
    readonly source_id: string | null;
    readonly account_name: string;
  }[];
}

export type FinanceTrendRange = 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_MONTH';

export interface FinanceTrendsView {
  readonly range: FinanceTrendRange;
  readonly currency: string;
  readonly period: { readonly from: string; readonly to: string; readonly label: string };
  readonly totals: {
    readonly collectedPayments: string;
    readonly completedRefunds: string;
    readonly paidExpenses: string;
    readonly courierDeductions: string;
    readonly netAccountMovement: string;
  };
  readonly series: readonly {
    readonly date: string;
    readonly collectedPayments: string;
    readonly completedRefunds: string;
    readonly paidExpenses: string;
    readonly courierDeductions: string;
    readonly netAccountMovement: string;
  }[];
}

export async function getFinanceTrends(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  range: FinanceTrendRange = 'LAST_30_DAYS',
): Promise<FinanceTrendsView> {
  if (!['LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'THIS_MONTH'].includes(range))
    throw new FinanceDomainError('VALIDATION_FAILED', 'Finance trend range is not supported.');
  const result = await sql<{
    currency: string;
    period_from: string;
    period_to: string;
    label: string;
    date: string;
    collected_payments: string;
    completed_refunds: string;
    paid_expenses: string;
    courier_deductions: string;
    net_account_movement: string;
  }>`
    with organization as (
      select default_currency::text as currency,timezone,(now() at time zone timezone)::date as local_today
      from platform.organizations where id=${organizationId}
    ), bounds as (
      select currency,timezone,local_today,
        case ${range}
          when 'LAST_7_DAYS' then local_today-6
          when 'LAST_30_DAYS' then local_today-29
          when 'LAST_90_DAYS' then local_today-89
          else date_trunc('month',local_today)::date
        end as from_date,
        case ${range}
          when 'LAST_7_DAYS' then 'Last 7 days'
          when 'LAST_30_DAYS' then 'Last 30 days'
          when 'LAST_90_DAYS' then 'Last 90 days'
          else 'This month'
        end as label
      from organization
    ), period as (
      select *,from_date::timestamp at time zone timezone as period_from,now() as period_to
      from bounds
    ), days as (
      select generate_series(period.from_date,period.local_today,'1 day'::interval)::date as day
      from period
    ), payment_daily as (
      select (payment.confirmed_at at time zone period.timezone)::date as day,sum(payment.amount) as amount
      from payments.payments payment cross join period
      where payment.organization_id=${organizationId} and payment.status='CONFIRMED'
        and payment.currency_code=period.currency and payment.confirmed_at>=period.period_from and payment.confirmed_at<=period.period_to
      group by 1
    ), refund_daily as (
      select (refund.completed_at at time zone period.timezone)::date as day,sum(refund.amount) as amount
      from payments.refunds refund cross join period
      where refund.organization_id=${organizationId} and refund.status='COMPLETED'
        and refund.currency_code=period.currency and refund.completed_at>=period.period_from and refund.completed_at<=period.period_to
      group by 1
    ), expense_daily as (
      select (payment.paid_at at time zone period.timezone)::date as day,sum(payment.amount) as amount
      from finance.expense_payments payment
      join finance.expenses expense on expense.id=payment.expense_id
      cross join period
      where payment.organization_id=${organizationId} and expense.currency_code=period.currency
        and payment.paid_at>=period.period_from and payment.paid_at<=period.period_to
      group by 1
    ), deduction_daily as (
      select (settlement.settled_at at time zone period.timezone)::date as day,sum(settlement.deduction_amount) as amount
      from finance.cod_settlements settlement cross join period
      where settlement.organization_id=${organizationId} and settlement.currency_code=period.currency
        and settlement.settled_at>=period.period_from and settlement.settled_at<=period.period_to
      group by 1
    ), movement_daily as (
      select (transaction.occurred_at at time zone period.timezone)::date as day,sum(entry.amount_delta) as amount
      from finance.financial_account_entries entry
      join finance.finance_transactions transaction on transaction.id=entry.finance_transaction_id
      cross join period
      where entry.organization_id=${organizationId} and entry.currency_code=period.currency
        and transaction.occurred_at>=period.period_from and transaction.occurred_at<=period.period_to
      group by 1
    )
    select period.currency,period.period_from::text,period.period_to::text,period.label,
      to_char(days.day,'YYYY-MM-DD') as date,
      coalesce(payment_daily.amount,0)::numeric(20,4)::text as collected_payments,
      coalesce(refund_daily.amount,0)::numeric(20,4)::text as completed_refunds,
      coalesce(expense_daily.amount,0)::numeric(20,4)::text as paid_expenses,
      coalesce(deduction_daily.amount,0)::numeric(20,4)::text as courier_deductions,
      coalesce(movement_daily.amount,0)::numeric(20,4)::text as net_account_movement
    from days cross join period
    left join payment_daily on payment_daily.day=days.day
    left join refund_daily on refund_daily.day=days.day
    left join expense_daily on expense_daily.day=days.day
    left join deduction_daily on deduction_daily.day=days.day
    left join movement_daily on movement_daily.day=days.day
    order by days.day
  `.execute(db);
  const first = result.rows[0];
  if (!first)
    throw new FinanceDomainError('NOT_FOUND', 'Organisation finance settings were not found.');
  const total = (
    key: keyof Pick<
      (typeof result.rows)[number],
      | 'collected_payments'
      | 'completed_refunds'
      | 'paid_expenses'
      | 'courier_deductions'
      | 'net_account_movement'
    >,
  ) => moneyFromUnits(result.rows.reduce((sum, row) => sum + moneyUnits(row[key]), 0n));
  return {
    range,
    currency: first.currency,
    period: { from: first.period_from, to: first.period_to, label: first.label },
    totals: {
      collectedPayments: total('collected_payments'),
      completedRefunds: total('completed_refunds'),
      paidExpenses: total('paid_expenses'),
      courierDeductions: total('courier_deductions'),
      netAccountMovement: total('net_account_movement'),
    },
    series: result.rows.map((row) => ({
      date: row.date,
      collectedPayments: row.collected_payments,
      completedRefunds: row.completed_refunds,
      paidExpenses: row.paid_expenses,
      courierDeductions: row.courier_deductions,
      netAccountMovement: row.net_account_movement,
    })),
  };
}

/** Authoritative Finance home read model. Period values use the organisation's local month. */
export async function getFinanceOverview(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<FinanceOverviewView> {
  const [summary, activity] = await Promise.all([
    sql<{
      currency: string;
      period_from: Date;
      period_to: Date;
      collected_payments: string;
      completed_refunds: string;
      paid_expenses: string;
      net_account_movement: string;
      account_balance: string;
      outstanding_expenses: string;
      outstanding_supplier_payments: string;
      outstanding_cod_held: string;
      pending_payment_verifications: string;
      pending_cod_collections: string;
      unposted_payments: string;
      unposted_refunds: string;
      reconciliation_differences: string;
      outstanding_expense_count: string;
      outstanding_supplier_payment_count: string;
      outstanding_cod_payment_count: string;
    }>`
      with organization as (
        select default_currency::text as currency, timezone
        from platform.organizations where id = ${organizationId}
      ), period as (
        select currency,
          (date_trunc('month', now() at time zone timezone) at time zone timezone) as period_from,
          now() as period_to
        from organization
      ), expense_balances as (
        select expense.id, expense.source_domain, expense.currency_code,
          greatest(
            expense.amount
              + coalesce((select sum(adjustment.amount) from finance.expense_adjustments adjustment where adjustment.organization_id = expense.organization_id and adjustment.expense_id = expense.id), 0)
              - coalesce((select sum(payment.amount) from finance.expense_payments payment where payment.organization_id = expense.organization_id and payment.expense_id = expense.id), 0),
            0
          ) as outstanding
        from finance.expenses expense
        where expense.organization_id = ${organizationId} and expense.status <> 'CANCELLED'
      ), latest_reconciliation as (
        select distinct on (session.financial_account_id)
          session.financial_account_id, session.difference_amount, session.status
        from finance.reconciliation_sessions session
        where session.organization_id = ${organizationId}
        order by session.financial_account_id, session.created_at desc, session.id desc
      )
      select period.currency, period.period_from, period.period_to,
        coalesce((select sum(payment.amount) from payments.payments payment
          where payment.organization_id = ${organizationId} and payment.status = 'CONFIRMED'
            and payment.currency_code = period.currency
            and payment.confirmed_at >= period.period_from and payment.confirmed_at <= period.period_to), 0)::text as collected_payments,
        coalesce((select sum(refund.amount) from payments.refunds refund
          where refund.organization_id = ${organizationId} and refund.status = 'COMPLETED'
            and refund.currency_code = period.currency
            and refund.completed_at >= period.period_from and refund.completed_at <= period.period_to), 0)::text as completed_refunds,
        coalesce((select sum(expense_payment.amount) from finance.expense_payments expense_payment
          join finance.expenses expense on expense.id = expense_payment.expense_id
          where expense_payment.organization_id = ${organizationId} and expense.currency_code = period.currency
            and expense_payment.paid_at >= period.period_from and expense_payment.paid_at <= period.period_to), 0)::text as paid_expenses,
        coalesce((select sum(entry.amount_delta) from finance.financial_account_entries entry
          where entry.organization_id = ${organizationId} and entry.currency_code = period.currency
            and entry.created_at >= period.period_from and entry.created_at <= period.period_to), 0)::text as net_account_movement,
        coalesce((select sum(entry.amount_delta) from finance.financial_account_entries entry
          where entry.organization_id = ${organizationId} and entry.currency_code = period.currency), 0)::text as account_balance,
        coalesce((select sum(outstanding) from expense_balances where currency_code = period.currency), 0)::text as outstanding_expenses,
        coalesce((select sum(outstanding) from expense_balances where currency_code = period.currency and source_domain = 'procurement.purchase'), 0)::text as outstanding_supplier_payments,
        coalesce((select sum(greatest(payment.amount - coalesce(settled.amount, 0), 0))
          from payments.payments payment
          join payments.payment_methods method on method.id = payment.payment_method_id and method.code = 'COD'
          left join lateral (select sum(allocation.amount) as amount from finance.cod_settlement_allocations allocation where allocation.organization_id = payment.organization_id and allocation.payment_id = payment.id) settled on true
          where payment.organization_id = ${organizationId} and payment.status = 'CONFIRMED'
            and payment.currency_code = period.currency), 0)::text as outstanding_cod_held,
        (select count(*) from payments.payment_attempts attempt where attempt.organization_id = ${organizationId} and attempt.status = 'PENDING_VERIFICATION')::text as pending_payment_verifications,
        (select count(*) from delivery.deliveries delivery
          join delivery.cod_collection_instructions instruction on instruction.delivery_id = delivery.id and instruction.status = 'ACTIVE'
          join payments.payment_intents intent on intent.organization_id = delivery.organization_id and intent.order_id = delivery.order_id and intent.status = 'READY'
          join payments.payment_methods method on method.id = intent.payment_method_id and method.code = 'COD'
          left join lateral (
            select sum(allocation.amount) as amount
            from payments.payment_allocations allocation
            join payments.payments payment on payment.id = allocation.payment_id and payment.status = 'CONFIRMED'
            where allocation.organization_id = delivery.organization_id and allocation.order_id = delivery.order_id
          ) collected on true
          where delivery.organization_id = ${organizationId} and delivery.outcome_status = 'DELIVERED'
            and delivery.cod_required and delivery.delivered_at is not null
            and greatest(intent.expected_amount - coalesce(collected.amount, 0), 0) > 0
            and not exists (select 1 from payments.payments payment where payment.organization_id = delivery.organization_id and payment.source_delivery_id = delivery.id))::text as pending_cod_collections,
        (select count(*) from payments.payments payment where payment.organization_id = ${organizationId} and payment.status = 'CONFIRMED'
          and not exists (select 1 from finance.finance_transactions transaction where transaction.organization_id = payment.organization_id and transaction.transaction_type = 'PAYMENT_SOURCE_POSTING' and transaction.source_domain = 'payments.payment' and transaction.source_id = payment.id))::text as unposted_payments,
        (select count(*) from payments.refunds refund where refund.organization_id = ${organizationId} and refund.status = 'COMPLETED'
          and not exists (select 1 from finance.finance_transactions transaction where transaction.organization_id = refund.organization_id and transaction.transaction_type = 'REFUND_SOURCE_POSTING' and transaction.source_domain = 'payments.refund' and transaction.source_id = refund.id))::text as unposted_refunds,
        (select count(*) from latest_reconciliation where status = 'OPEN' and difference_amount <> 0)::text as reconciliation_differences,
        (select count(*) from expense_balances where outstanding > 0)::text as outstanding_expense_count,
        (select count(*) from expense_balances where outstanding > 0 and source_domain = 'procurement.purchase')::text as outstanding_supplier_payment_count,
        (select count(*) from payments.payments payment
          join payments.payment_methods method on method.id = payment.payment_method_id and method.code = 'COD'
          left join lateral (select sum(allocation.amount) as amount from finance.cod_settlement_allocations allocation where allocation.organization_id = payment.organization_id and allocation.payment_id = payment.id) settled on true
          where payment.organization_id = ${organizationId} and payment.status = 'CONFIRMED'
            and greatest(payment.amount - coalesce(settled.amount, 0), 0) > 0)::text as outstanding_cod_payment_count
      from period
    `.execute(db),
    sql<FinanceOverviewView['recentActivity'][number]>`
      select entry.id::text, entry.amount_delta::text, entry.currency_code, entry.created_at::text,
        transaction.id as transaction_id, transaction.transaction_number, transaction.transaction_type,
        transaction.description, transaction.source_domain, transaction.source_id,
        account.name as account_name
      from finance.financial_account_entries entry
      join finance.finance_transactions transaction on transaction.id = entry.finance_transaction_id
      join finance.financial_accounts account on account.id = entry.financial_account_id
      where entry.organization_id = ${organizationId}
      order by entry.created_at desc, entry.id desc
      limit 8
    `.execute(db),
  ]);
  const row = summary.rows[0];
  if (!row)
    throw new FinanceDomainError('NOT_FOUND', 'Organisation finance settings were not found.');
  return {
    currency: row.currency,
    period: {
      from: row.period_from.toISOString(),
      to: row.period_to.toISOString(),
      label: 'This month',
    },
    metrics: {
      collectedPayments: row.collected_payments,
      completedRefunds: row.completed_refunds,
      paidExpenses: row.paid_expenses,
      netAccountMovement: row.net_account_movement,
      accountBalance: row.account_balance,
      outstandingExpenses: row.outstanding_expenses,
      outstandingSupplierPayments: row.outstanding_supplier_payments,
      outstandingCodHeld: row.outstanding_cod_held,
    },
    attention: {
      pendingPaymentVerifications: Number(row.pending_payment_verifications),
      pendingCodCollections: Number(row.pending_cod_collections),
      unpostedPayments: Number(row.unposted_payments),
      unpostedRefunds: Number(row.unposted_refunds),
      reconciliationDifferences: Number(row.reconciliation_differences),
      outstandingExpenses: Number(row.outstanding_expense_count),
      outstandingSupplierPayments: Number(row.outstanding_supplier_payment_count),
      outstandingCodPayments: Number(row.outstanding_cod_payment_count),
    },
    recentActivity: activity.rows,
  };
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

export async function getFinancialAccountDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  accountId: string,
) {
  const result = await sql<{
    account_number: string;
    account_type: string;
    currency_code: string;
    entry_count: string;
    id: string;
    last_movement_at: string | null;
    latest_reconciliation_difference: string | null;
    latest_reconciliation_id: string | null;
    latest_reconciliation_observed_at: string | null;
    latest_reconciliation_status: 'OPEN' | 'CLOSED' | null;
    ledger_balance: string;
    name: string;
    reference_label: string | null;
    status: string;
    total_inflow: string;
    total_outflow: string;
    version: string;
    has_opening_balance: boolean;
    created_at: string;
    updated_at: string;
  }>`select account.id,account.account_number,account.name,account.account_type,
      account.currency_code,account.status,account.reference_label,account.version::text,
      account.created_at::text as created_at,account.updated_at::text as updated_at,
      coalesce(sum(entry.amount_delta),0)::numeric(20,4)::text as ledger_balance,
      coalesce(sum(entry.amount_delta) filter (where entry.amount_delta>0),0)::numeric(20,4)::text as total_inflow,
      coalesce(abs(sum(entry.amount_delta) filter (where entry.amount_delta<0)),0)::numeric(20,4)::text as total_outflow,
      count(entry.id)::text as entry_count,max(entry.created_at)::text as last_movement_at,
      reconciliation.id::text as latest_reconciliation_id,
      reconciliation.status as latest_reconciliation_status,
      reconciliation.difference_amount::text as latest_reconciliation_difference,
      reconciliation.observed_at::text as latest_reconciliation_observed_at,
      exists(
        select 1 from finance.finance_transactions t
        where t.organization_id = account.organization_id
          and t.source_domain = 'finance.account'
          and t.source_id = account.id
          and t.transaction_type = 'OPENING_BALANCE'
      ) as has_opening_balance
    from finance.financial_accounts account
    left join finance.financial_account_entries entry
      on entry.organization_id=account.organization_id and entry.financial_account_id=account.id
    left join lateral (
      select session.id,session.status,session.difference_amount,session.observed_at
      from finance.reconciliation_sessions session
      where session.organization_id=account.organization_id
        and session.financial_account_id=account.id
      order by session.observed_at desc,session.id desc limit 1
    ) reconciliation on true
    where account.organization_id=${organizationId} and account.id=${accountId}
    group by account.id,reconciliation.id,reconciliation.status,
      reconciliation.difference_amount,reconciliation.observed_at`.execute(db);
  const account = result.rows[0];
  if (!account) throw new FinanceDomainError('NOT_FOUND', 'Financial account was not found.');
  return {
    id: account.id,
    account_number: account.account_number,
    name: account.name,
    account_type: account.account_type,
    currency_code: account.currency_code,
    status: account.status,
    reference_label: account.reference_label,
    version: account.version,
    ledger_balance: account.ledger_balance,
    last_movement_at: account.last_movement_at,
    created_at: account.created_at,
    updated_at: account.updated_at,
    hasOpeningBalance: Boolean(account.has_opening_balance),
    canSetOpeningBalance:
      !account.has_opening_balance &&
      moneyUnits(account.ledger_balance) === 0n &&
      account.status === 'ACTIVE',
    summary: {
      totalInflow: account.total_inflow,
      totalOutflow: account.total_outflow,
      entryCount: Number(account.entry_count),
    },
    latestReconciliation:
      account.latest_reconciliation_id &&
      account.latest_reconciliation_status &&
      account.latest_reconciliation_difference !== null &&
      account.latest_reconciliation_observed_at
        ? {
            id: account.latest_reconciliation_id,
            status: account.latest_reconciliation_status,
            differenceAmount: account.latest_reconciliation_difference,
            observedAt: account.latest_reconciliation_observed_at,
          }
        : null,
  };
}

export type FinanceTransactionType =
  | 'OPENING_BALANCE'
  | 'EXPENSE_PAYMENT'
  | 'INTERNAL_TRANSFER'
  | 'EXTERNAL_ADJUSTMENT'
  | 'PAYMENT_SOURCE_POSTING'
  | 'REFUND_SOURCE_POSTING'
  | 'COD_SETTLEMENT';

export interface FinanceLedgerFilters {
  readonly accountId?: string;
  readonly query?: string;
  readonly transactionType?: FinanceTransactionType | 'ALL';
  readonly direction?: 'ALL' | 'IN' | 'OUT';
  readonly from?: string;
  readonly to?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export async function listLedger(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters: FinanceLedgerFilters = {},
) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 25)));
  const offset = (page - 1) * pageSize;
  const accountId = filters.accountId?.trim() || null;
  const query = filters.query?.trim() || null;
  const transactionType = filters.transactionType ?? 'ALL';
  const direction = filters.direction ?? 'ALL';
  const from = filters.from?.trim() || null;
  const to = filters.to?.trim() || null;
  const where = sql`entry.organization_id=${organizationId}
    and (${accountId}::uuid is null or entry.financial_account_id=${accountId}::uuid)
    and (${query}::text is null or concat_ws(' ',transaction.transaction_number,
      transaction.description,transaction.transaction_type,account.name,account.account_number,
      transaction.source_domain) ilike '%' || ${query}::text || '%')
    and (${transactionType}::text='ALL' or transaction.transaction_type=${transactionType}::text)
    and (${direction}::text='ALL' or (${direction}::text='IN' and entry.amount_delta>0)
      or (${direction}::text='OUT' and entry.amount_delta<0))
    and (${from}::text is null or
      (transaction.occurred_at at time zone organization.timezone)::date>=${from}::date)
    and (${to}::text is null or
      (transaction.occurred_at at time zone organization.timezone)::date<=${to}::date)`;
  const [entries, count] = await Promise.all([
    sql<{
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
    }>`select entry.id::text,entry.amount_delta::text,entry.currency_code,
      transaction.occurred_at::text as created_at,transaction.id as transaction_id,
      transaction.transaction_number,transaction.transaction_type,transaction.description,
      transaction.source_domain,transaction.source_id,account.name as account_name
    from finance.financial_account_entries entry
    join finance.finance_transactions transaction
      on transaction.organization_id=entry.organization_id
      and transaction.id=entry.finance_transaction_id
    join finance.financial_accounts account
      on account.organization_id=entry.organization_id and account.id=entry.financial_account_id
    join platform.organizations organization on organization.id=entry.organization_id
    where ${where}
    order by transaction.occurred_at desc,entry.id desc
    limit ${pageSize} offset ${offset}`.execute(db),
    sql<{ total: string }>`select count(*)::text as total
      from finance.financial_account_entries entry
      join finance.finance_transactions transaction
        on transaction.organization_id=entry.organization_id
        and transaction.id=entry.finance_transaction_id
      join finance.financial_accounts account
        on account.organization_id=entry.organization_id and account.id=entry.financial_account_id
      join platform.organizations organization on organization.id=entry.organization_id
      where ${where}`.execute(db),
  ]);
  const totalItems = Number(count.rows[0]?.total ?? 0);
  return {
    items: entries.rows,
    pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
  };
}

export async function changeFinancialAccountStatus(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    accountId: string;
    status: 'ACTIVE' | 'INACTIVE';
    expectedVersion: number;
    reason: string;
  },
) {
  const reason = input.reason.trim();
  if (reason.length < 4)
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Account status changes require a meaningful reason.',
    );
  return withFinanceTransaction(db, async (tx) => {
    const current = await sql<{
      status: 'ACTIVE' | 'INACTIVE';
      version: string;
    }>`select status,version::text from finance.financial_accounts
      where organization_id=${input.organizationId} and id=${input.accountId} for update`.execute(
      tx,
    );
    const account = current.rows[0];
    if (!account) throw new FinanceDomainError('NOT_FOUND', 'Financial account was not found.');
    if (Number(account.version) !== input.expectedVersion)
      throw new FinanceDomainError(
        'CONFLICT',
        'Financial account changed since it was opened. Refresh before changing its status.',
      );
    if (account.status === input.status)
      throw new FinanceDomainError('CONFLICT', `Financial account is already ${input.status}.`);
    const updated = await sql<{
      version: string;
    }>`update finance.financial_accounts
      set status=${input.status},version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.accountId}
        and version=${input.expectedVersion}
      returning version::text`.execute(tx);
    const version = Number(updated.rows[0]?.version);
    if (!version)
      throw new FinanceDomainError('CONFLICT', 'Financial account changed before update completed.');
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.account.status_changed',
      targetType: 'finance.financial_account',
      targetId: input.accountId,
      reason,
      beforeDiff: { status: account.status },
      afterDiff: { status: input.status },
    });
    await sql`insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values (${input.organizationId},'finance.account.status_changed',1,
        'finance.financial_account',${input.accountId}::uuid,${version},
        ${JSON.stringify({ accountId: input.accountId, status: input.status, reason })}::jsonb,now())`.execute(
      tx,
    );
    return { id: input.accountId, status: input.status, version };
  });
}

export async function updateFinancialAccount(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    accountId: string;
    name?: string;
    referenceLabel?: string | null;
    expectedVersion: number;
  },
) {
  const name = input.name?.trim();
  const referenceLabel =
    input.referenceLabel !== undefined ? (input.referenceLabel?.trim() || null) : undefined;

  if (input.name !== undefined && !name) {
    throw new FinanceDomainError('VALIDATION_FAILED', 'Account name cannot be empty.');
  }

  return withFinanceTransaction(db, async (tx) => {
    const current = await sql<{
      id: string;
      name: string;
      reference_label: string | null;
      version: string;
    }>`select id, name, reference_label, version::text
       from finance.financial_accounts
       where organization_id = ${input.organizationId} and id = ${input.accountId}
       for update`.execute(tx);

    const account = current.rows[0];
    if (!account) {
      throw new FinanceDomainError('NOT_FOUND', 'Financial account was not found.');
    }
    if (Number(account.version) !== input.expectedVersion) {
      throw new FinanceDomainError(
        'CONFLICT',
        'Financial account changed since it was opened. Refresh before editing.',
      );
    }

    const newName = name ?? account.name;
    const newRef = referenceLabel !== undefined ? referenceLabel : account.reference_label;

    const updated = await sql<{ version: string }>`
      update finance.financial_accounts
      set name = ${newName},
          reference_label = ${newRef},
          version = version + 1,
          updated_at = now()
      where organization_id = ${input.organizationId}
        and id = ${input.accountId}
        and version = ${input.expectedVersion}
      returning version::text
    `.execute(tx);

    const version = Number(updated.rows[0]?.version);
    if (!version) {
      throw new FinanceDomainError(
        'CONFLICT',
        'Financial account changed before update completed.',
      );
    }

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.account.updated',
      targetType: 'finance.financial_account',
      targetId: input.accountId,
      beforeDiff: { name: account.name, referenceLabel: account.reference_label },
      afterDiff: { name: newName, referenceLabel: newRef },
    });

    await sql`insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values (${input.organizationId},'finance.account.updated',1,
        'finance.financial_account',${input.accountId}::uuid,${version},
        ${JSON.stringify({ accountId: input.accountId, name: newName, referenceLabel: newRef })}::jsonb,now())`.execute(
      tx,
    );

    return { id: input.accountId, name: newName, referenceLabel: newRef, version };
  });
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
  const accountNumber = input.accountNumber.trim().toUpperCase();
  const name = input.name.trim();
  const currencyCode = input.currencyCode.trim().toUpperCase();
  const referenceLabel = input.referenceLabel?.trim() || null;
  const rawOpeningBalance = input.openingBalance?.replace(/,/g, '').trim();

  if (!accountNumber) {
    throw new FinanceDomainError('VALIDATION_FAILED', 'Account code is required.');
  }
  if (!name) {
    throw new FinanceDomainError('VALIDATION_FAILED', 'Account name is required.');
  }
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Currency code must be a 3-letter uppercase code (e.g. BDT).',
    );
  }

  return withFinanceTransaction(db, async (tx) => {
    const idempotency = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.account.create',
      key: input.idempotencyKey,
      body: {
        ...input,
        accountNumber,
        name,
        currencyCode,
        referenceLabel,
        openingBalance: rawOpeningBalance,
      },
    });
    if (!idempotency.created) {
      const r = await sql<{
        id: string;
      }>`select id from finance.financial_accounts where organization_id=${input.organizationId} and account_number=${accountNumber}`.execute(
        tx,
      );
      if (r.rows[0]) return r.rows[0];
    }
    let id: string;
    try {
      const r = await sql<{
        id: string;
      }>`insert into finance.financial_accounts (organization_id,account_number,name,account_type,currency_code,reference_label) values (${input.organizationId},${accountNumber},${name},${input.accountType},${currencyCode},${referenceLabel}) returning id`.execute(
        tx,
      );
      id = r.rows[0]?.id as string;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new FinanceDomainError(
          'CONFLICT',
          `Financial account with code "${accountNumber}" already exists.`,
        );
      throw error;
    }
    if (!id) throw new Error('Financial account was not created.');
    if (rawOpeningBalance && moneyUnits(rawOpeningBalance) !== 0n) {
      const amount = signed(rawOpeningBalance);
      const openingTransactionId = await movement(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        accountId: id,
        amount,
        currency: currencyCode,
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

export interface SetFinancialAccountOpeningBalanceInput {
  organizationId: string;
  actorId: string;
  accountId: string;
  amount: string;
  description?: string;
  idempotencyKey: string;
}

export async function setFinancialAccountOpeningBalance(
  db: Kysely<DatabaseSchema>,
  input: SetFinancialAccountOpeningBalanceInput,
) {
  const rawAmount = input.amount?.replace(/,/g, '').trim();
  if (!rawAmount) {
    throw new FinanceDomainError('VALIDATION_FAILED', 'Opening balance amount is required.');
  }
  const units = moneyUnits(rawAmount);
  if (units <= 0n) {
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Opening balance amount must be greater than zero.',
    );
  }
  const amount = signed(rawAmount);

  return withFinanceTransaction(db, async (tx) => {
    const idempotency = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.account.set_opening_balance',
      key: input.idempotencyKey,
      body: {
        organizationId: input.organizationId,
        accountId: input.accountId,
        amount: rawAmount,
      },
    });

    if (!idempotency.created) {
      const existing = await sql<{
        id: string;
      }>`select t.id
        from finance.finance_transactions t
        where t.organization_id = ${input.organizationId}
          and t.source_domain = 'finance.account'
          and t.source_id = ${input.accountId}
          and t.transaction_type = 'OPENING_BALANCE'`.execute(tx);
      if (existing.rows[0]) {
        return {
          id: input.accountId,
          transactionId: existing.rows[0].id,
        };
      }
    }

    const accountResult = await sql<{
      id: string;
      status: string;
      currency_code: string;
      ledger_balance: string;
      has_opening_balance: boolean;
    }>`select account.id, account.status, account.currency_code,
        coalesce((
          select sum(entry.amount_delta)
          from finance.financial_account_entries entry
          where entry.organization_id = account.organization_id
            and entry.financial_account_id = account.id
        ), 0)::numeric(20,4)::text as ledger_balance,
        exists(
          select 1 from finance.finance_transactions t
          where t.organization_id = account.organization_id
            and t.source_domain = 'finance.account'
            and t.source_id = account.id
            and t.transaction_type = 'OPENING_BALANCE'
        ) as has_opening_balance
      from finance.financial_accounts account
      where account.organization_id = ${input.organizationId}
        and account.id = ${input.accountId}
      for update`.execute(tx);

    const account = accountResult.rows[0];
    if (!account) {
      throw new FinanceDomainError('NOT_FOUND', 'Financial account was not found.');
    }
    if (account.status !== 'ACTIVE') {
      throw new FinanceDomainError(
        'CONFLICT',
        'Opening balance can only be set on an ACTIVE financial account.',
      );
    }
    if (account.has_opening_balance) {
      throw new FinanceDomainError(
        'CONFLICT',
        'An opening balance has already been set for this account.',
      );
    }
    if (moneyUnits(account.ledger_balance) !== 0n) {
      throw new FinanceDomainError(
        'CONFLICT',
        'Opening balance can only be set when current account balance is zero.',
      );
    }

    const description = input.description?.trim() || 'Opening balance';
    const openingTransactionId = await movement(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      accountId: account.id,
      amount,
      currency: account.currency_code,
      type: 'OPENING_BALANCE',
      description,
      sourceDomain: 'finance.account',
      sourceId: account.id,
    });

    await outbox(tx, input.organizationId, 'finance.account.opened', openingTransactionId);

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.account.opening_balance_set',
      targetType: 'finance.financial_account',
      targetId: account.id,
      afterDiff: {
        amount,
        currency: account.currency_code,
        transactionId: openingTransactionId,
      },
    });

    return {
      id: account.id,
      transactionId: openingTransactionId,
    };
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

async function recordExpensePayment(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    expenseId: string;
    expenseNumber: string;
    accountId: string;
    amount: string;
    currency: string;
    reference?: string;
  },
) {
  const financialAccount = await account(db, input.organizationId, input.accountId, true);
  if (financialAccount.status !== 'ACTIVE' || financialAccount.currency_code !== input.currency)
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Financial account must be active and use the expense currency.',
    );
  if (
    moneyUnits(await balance(db, input.organizationId, input.accountId)) < moneyUnits(input.amount)
  )
    throw new FinanceDomainError('CONFLICT', 'Financial account has insufficient balance.');
  const financeTransactionId = await movement(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    accountId: input.accountId,
    amount: `-${input.amount}`,
    currency: input.currency,
    type: 'EXPENSE_PAYMENT',
    description: `Expense payment ${input.expenseNumber}`,
    sourceDomain: 'finance.expense',
    sourceId: input.expenseId,
  });
  await sql`insert into finance.expense_payments
    (organization_id,expense_id,finance_transaction_id,amount,reference,created_by)
    values (${input.organizationId},${input.expenseId}::uuid,${financeTransactionId}::uuid,${input.amount}::numeric,${input.reference?.trim() || null},${input.actorId ?? null}::uuid)`.execute(
    db,
  );
  return financeTransactionId;
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
    payeeName?: string;
    externalReference?: string;
    notes?: string;
    accountId?: string;
    paymentReference?: string;
    sourceDomain?: string;
    sourceId?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const amount = positive(input.amount);
    const description = input.description.trim();
    if (!description)
      throw new FinanceDomainError('VALIDATION_FAILED', 'Expense description is required.');
    if (input.paymentReference && !input.accountId)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'A payment reference requires an account-backed expense payment.',
      );
    if (Boolean(input.sourceDomain) !== Boolean(input.sourceId))
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'Expense source domain and source id must be supplied together.',
      );
    const claimResult = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.expense.create',
      key: input.idempotencyKey,
      body: input,
    });
    if (!claimResult.created) {
      const replay = await sql<{
        id: string;
      }>`select result_entity_id::text as id from platform.idempotency_records where id=${claimResult.id} and status='SUCCEEDED'`.execute(
        tx,
      );
      if (replay.rows[0]?.id) return { id: replay.rows[0].id };
      throw new FinanceDomainError('CONFLICT', 'Expense creation is already being processed.');
    }
    if (input.sourceDomain && input.sourceId) {
      if (input.sourceDomain !== 'procurement.purchase')
        throw new FinanceDomainError(
          'VALIDATION_FAILED',
          'Expense source domain is not supported.',
        );
      const source = await sql<{
        currency_code: string;
        status: string;
      }>`select currency_code,status from procurement.purchases where organization_id=${input.organizationId} and id=${input.sourceId}`.execute(
        tx,
      );
      if (!source.rows[0])
        throw new FinanceDomainError('NOT_FOUND', 'Source Purchase was not found.');
      if (source.rows[0].status !== 'PLACED')
        throw new FinanceDomainError(
          'CONFLICT',
          'Supplier invoices can only be recorded for a placed Purchase.',
        );
      if (source.rows[0].currency_code !== input.currencyCode)
        throw new FinanceDomainError(
          'VALIDATION_FAILED',
          'Supplier invoice currency must match the Purchase currency.',
        );
    }
    const category =
      await sql`select id from finance.expense_categories where organization_id=${input.organizationId} and id=${input.categoryId} and status='ACTIVE'`.execute(
        tx,
      );
    if (!category.rows[0])
      throw new FinanceDomainError('NOT_FOUND', 'Active expense category was not found.');
    const n = await nextNumber(tx, input.organizationId, 'EXP');
    const r = await sql<{
      id: string;
    }>`insert into finance.expenses
      (organization_id,expense_number,expense_category_id,currency_code,amount,expense_date,description,payee_name,external_reference,notes,source_domain,source_id,created_by)
      values (${input.organizationId},${n},${input.categoryId}::uuid,${input.currencyCode},${amount}::numeric,${input.expenseDate}::date,${description},${input.payeeName?.trim() || null},${input.externalReference?.trim() || null},${input.notes?.trim() || null},${input.sourceDomain ?? null},${input.sourceId ?? null}::uuid,${input.actorId ?? null}::uuid) returning id`.execute(
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
      metadata: {
        amount,
        currency: input.currencyCode,
        accountId: input.accountId ?? null,
      },
    });
    let financeTransactionId: string | undefined;
    if (input.accountId) {
      financeTransactionId = await recordExpensePayment(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        expenseId: id,
        expenseNumber: n,
        accountId: input.accountId,
        amount,
        currency: input.currencyCode,
        ...(input.paymentReference ? { reference: input.paymentReference } : {}),
      });
      await appendAuditEvent(tx, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'finance.expense.paid',
        targetType: 'finance.expense',
        targetId: id,
        metadata: { amount, accountId: input.accountId, reference: input.paymentReference ?? null },
      });
      await outbox(tx, input.organizationId, 'finance.expense.paid', financeTransactionId);
    }
    await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type='finance.expense',result_entity_id=${id}::uuid,safe_response=${JSON.stringify({ expenseId: id, financeTransactionId: financeTransactionId ?? null })}::jsonb,completed_at=now() where id=${claimResult.id}`.execute(
      tx,
    );
    await sql`insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values (${input.organizationId},'finance.expense.created',1,'finance.expense',${id}::uuid,1,${JSON.stringify({ expenseId: id, financeTransactionId: financeTransactionId ?? null })}::jsonb,now())`.execute(
      tx,
    );
    return { id, financeTransactionId };
  });
}
export interface FinanceExpenseView {
  readonly id: string;
  readonly expense_number: string;
  readonly description: string;
  readonly amount: string;
  readonly currency_code: string;
  readonly expense_date: string;
  readonly status: string;
  readonly category_id: string;
  readonly category_name: string;
  readonly category_classification: string;
  readonly paid: string;
  readonly adjustments: string;
  readonly outstanding: string;
  readonly source_domain: string | null;
  readonly source_id: string | null;
  readonly source_reference: string | null;
  readonly source_counterparty: string | null;
  readonly payee_name: string | null;
  readonly external_reference: string | null;
  readonly notes: string | null;
  readonly created_at: string;
  readonly version: number;
}

type FinanceExpenseRow = Omit<FinanceExpenseView, 'version'> & { readonly version: string };

function financeExpenseView(row: FinanceExpenseRow): FinanceExpenseView {
  return { ...row, version: Number(row.version) };
}

export interface FinanceExpenseListFilters {
  readonly query?: string;
  readonly categoryId?: string;
  readonly accountId?: string;
  readonly status?: 'ALL' | 'RECORDED' | 'CANCELLED';
  readonly paymentState?: 'ALL' | 'OUTSTANDING' | 'PAID';
  readonly from?: string;
  readonly to?: string;
  readonly sourceDomain?: 'procurement.purchase';
  readonly sourceId?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export async function listExpenses(
  db: Kysely<DatabaseSchema>,
  org: string,
  filters: FinanceExpenseListFilters = {},
) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 25)));
  const offset = (page - 1) * pageSize;
  const query = filters.query?.trim() || null;
  const categoryId = filters.categoryId ?? null;
  const accountId = filters.accountId ?? null;
  const status = filters.status ?? 'ALL';
  const paymentState = filters.paymentState ?? 'ALL';
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const sourceDomain = filters.sourceDomain ?? null;
  const sourceId = filters.sourceId ?? null;
  const [rows, count] = await Promise.all([
    sql<FinanceExpenseRow>`select e.id,e.expense_number,e.description,e.amount::text,e.currency_code,
      e.expense_date::text,e.status,c.id as category_id,c.name as category_name,
      c.classification as category_classification,e.source_domain,e.source_id,
      purchase.purchase_number as source_reference,supplier.name as source_counterparty,
      e.payee_name,e.external_reference,e.notes,e.created_at::text,e.version::text,
      coalesce(payment.total,0)::numeric(20,4)::text as paid,
      coalesce(adjustment.total,0)::numeric(20,4)::text as adjustments,
      greatest(e.amount+coalesce(adjustment.total,0)-coalesce(payment.total,0),0)::numeric(20,4)::text as outstanding
      from finance.expenses e
      join finance.expense_categories c on c.id=e.expense_category_id
      left join procurement.purchases purchase on e.source_domain='procurement.purchase' and purchase.organization_id=e.organization_id and purchase.id=e.source_id
      left join procurement.suppliers supplier on supplier.organization_id=purchase.organization_id and supplier.id=purchase.supplier_id
      left join lateral (select sum(p.amount) as total from finance.expense_payments p where p.organization_id=e.organization_id and p.expense_id=e.id) payment on true
      left join lateral (select sum(a.amount) as total from finance.expense_adjustments a where a.organization_id=e.organization_id and a.expense_id=e.id) adjustment on true
      where e.organization_id=${org}
        and (${query}::text is null or concat_ws(' ',e.expense_number,e.description,e.payee_name,e.external_reference,c.name,purchase.purchase_number,supplier.name) ilike '%' || ${query}::text || '%')
        and (${categoryId}::uuid is null or e.expense_category_id=${categoryId}::uuid)
        and (${status}::text='ALL' or e.status=${status}::text)
        and (${paymentState}::text='ALL' or (${paymentState}::text='OUTSTANDING' and greatest(e.amount+coalesce(adjustment.total,0)-coalesce(payment.total,0),0)>0) or (${paymentState}::text='PAID' and greatest(e.amount+coalesce(adjustment.total,0)-coalesce(payment.total,0),0)=0 and e.status<>'CANCELLED'))
        and (${from}::text is null or e.expense_date>=${from}::date)
        and (${to}::text is null or e.expense_date<=${to}::date)
        and (${sourceDomain}::text is null or e.source_domain=${sourceDomain}::text)
        and (${sourceId}::uuid is null or e.source_id=${sourceId}::uuid)
        and (${accountId}::uuid is null or exists (
          select 1 from finance.expense_payments expense_payment
          join finance.financial_account_entries entry on entry.organization_id=expense_payment.organization_id and entry.finance_transaction_id=expense_payment.finance_transaction_id
          where expense_payment.organization_id=e.organization_id and expense_payment.expense_id=e.id and entry.financial_account_id=${accountId}::uuid
        ))
      order by e.expense_date desc,e.created_at desc,e.id desc limit ${pageSize} offset ${offset}`.execute(
      db,
    ),
    sql<{ total: string }>`select count(*)::text as total
      from finance.expenses e
      join finance.expense_categories c on c.id=e.expense_category_id
      left join procurement.purchases purchase on e.source_domain='procurement.purchase' and purchase.organization_id=e.organization_id and purchase.id=e.source_id
      left join procurement.suppliers supplier on supplier.organization_id=purchase.organization_id and supplier.id=purchase.supplier_id
      left join lateral (select sum(p.amount) as total from finance.expense_payments p where p.organization_id=e.organization_id and p.expense_id=e.id) payment on true
      left join lateral (select sum(a.amount) as total from finance.expense_adjustments a where a.organization_id=e.organization_id and a.expense_id=e.id) adjustment on true
      where e.organization_id=${org}
        and (${query}::text is null or concat_ws(' ',e.expense_number,e.description,e.payee_name,e.external_reference,c.name,purchase.purchase_number,supplier.name) ilike '%' || ${query}::text || '%')
        and (${categoryId}::uuid is null or e.expense_category_id=${categoryId}::uuid)
        and (${status}::text='ALL' or e.status=${status}::text)
        and (${paymentState}::text='ALL' or (${paymentState}::text='OUTSTANDING' and greatest(e.amount+coalesce(adjustment.total,0)-coalesce(payment.total,0),0)>0) or (${paymentState}::text='PAID' and greatest(e.amount+coalesce(adjustment.total,0)-coalesce(payment.total,0),0)=0 and e.status<>'CANCELLED'))
        and (${from}::text is null or e.expense_date>=${from}::date)
        and (${to}::text is null or e.expense_date<=${to}::date)
        and (${sourceDomain}::text is null or e.source_domain=${sourceDomain}::text)
        and (${sourceId}::uuid is null or e.source_id=${sourceId}::uuid)
        and (${accountId}::uuid is null or exists (
          select 1 from finance.expense_payments expense_payment
          join finance.financial_account_entries entry on entry.organization_id=expense_payment.organization_id and entry.finance_transaction_id=expense_payment.finance_transaction_id
          where expense_payment.organization_id=e.organization_id and expense_payment.expense_id=e.id and entry.financial_account_id=${accountId}::uuid
        ))`.execute(db),
  ]);
  const totalItems = Number(count.rows[0]?.total ?? 0);
  return {
    items: rows.rows.map(financeExpenseView),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}
export async function payExpense(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    expenseId: string;
    accountId: string;
    amount: string;
    reference?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const amount = positive(input.amount);
    const exp = await sql<{
      currency_code: string;
      expense_number: string;
      status: string;
      remaining: string;
    }>`select e.currency_code,e.expense_number,e.status,(e.amount+coalesce((select sum(amount) from finance.expense_adjustments where expense_id=e.id),0)-coalesce((select sum(amount) from finance.expense_payments where expense_id=e.id),0))::text as remaining from finance.expenses e where e.organization_id=${input.organizationId} and e.id=${input.expenseId} for update`.execute(
      tx,
    );
    if (!exp.rows[0]) throw new FinanceDomainError('NOT_FOUND', 'Expense was not found.');
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.expense.pay',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created) {
      const replay = await sql<{
        id: string;
      }>`select result_entity_id::text as id from platform.idempotency_records where id=${c.id} and status='SUCCEEDED'`.execute(
        tx,
      );
      if (replay.rows[0]?.id) return { financeTransactionId: replay.rows[0].id };
      throw new FinanceDomainError('CONFLICT', 'Expense payment is already being processed.');
    }
    if (exp.rows[0].status !== 'RECORDED')
      throw new FinanceDomainError('CONFLICT', 'Only a recorded Expense can be paid.');
    if (moneyUnits(amount) > moneyUnits(exp.rows[0].remaining))
      throw new FinanceDomainError('CONFLICT', 'Payment exceeds the outstanding expense amount.');
    const t = await recordExpensePayment(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      expenseId: input.expenseId,
      expenseNumber: exp.rows[0].expense_number,
      accountId: input.accountId,
      amount,
      currency: exp.rows[0].currency_code,
      ...(input.reference ? { reference: input.reference } : {}),
    });
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.expense.paid',
      targetType: 'finance.expense',
      targetId: input.expenseId,
      metadata: { amount, accountId: input.accountId, reference: input.reference ?? null },
    });
    await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type='finance.finance_transaction',result_entity_id=${t}::uuid,safe_response=${JSON.stringify({ financeTransactionId: t })}::jsonb,completed_at=now() where id=${c.id}`.execute(
      tx,
    );
    await outbox(tx, input.organizationId, 'finance.expense.paid', t);
    return { financeTransactionId: t };
  });
}

export async function getExpenseDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  expenseId: string,
) {
  const [expense, payments, adjustments, activity] = await Promise.all([
    sql<FinanceExpenseRow>`select e.id,e.expense_number,e.description,e.amount::text,e.currency_code,
      e.expense_date::text,e.status,c.id as category_id,c.name as category_name,
      c.classification as category_classification,e.source_domain,e.source_id,
      purchase.purchase_number as source_reference,supplier.name as source_counterparty,
      e.payee_name,e.external_reference,e.notes,e.created_at::text,e.version::text,
      coalesce(payment.total,0)::numeric(20,4)::text as paid,
      coalesce(adjustment.total,0)::numeric(20,4)::text as adjustments,
      greatest(e.amount+coalesce(adjustment.total,0)-coalesce(payment.total,0),0)::numeric(20,4)::text as outstanding
      from finance.expenses e
      join finance.expense_categories c on c.id=e.expense_category_id
      left join procurement.purchases purchase on e.source_domain='procurement.purchase' and purchase.organization_id=e.organization_id and purchase.id=e.source_id
      left join procurement.suppliers supplier on supplier.organization_id=purchase.organization_id and supplier.id=purchase.supplier_id
      left join lateral (select sum(p.amount) as total from finance.expense_payments p where p.organization_id=e.organization_id and p.expense_id=e.id) payment on true
      left join lateral (select sum(a.amount) as total from finance.expense_adjustments a where a.organization_id=e.organization_id and a.expense_id=e.id) adjustment on true
      where e.organization_id=${organizationId} and e.id=${expenseId}`.execute(db),
    sql<{
      id: string;
      amount: string;
      paid_at: string;
      reference: string | null;
      account_id: string;
      account_name: string;
      finance_transaction_id: string;
      transaction_number: string;
    }>`select payment.id,payment.amount::text,payment.paid_at::text,payment.reference,
      account.id as account_id,account.name as account_name,payment.finance_transaction_id,
      transaction.transaction_number
      from finance.expense_payments payment
      join finance.finance_transactions transaction on transaction.id=payment.finance_transaction_id
      join finance.financial_account_entries entry on entry.organization_id=payment.organization_id and entry.finance_transaction_id=payment.finance_transaction_id
      join finance.financial_accounts account on account.organization_id=entry.organization_id and account.id=entry.financial_account_id
      where payment.organization_id=${organizationId} and payment.expense_id=${expenseId}
      order by payment.paid_at desc,payment.id desc`.execute(db),
    sql<{
      id: string;
      adjustment_type: string;
      amount: string;
      reason: string;
      created_at: string;
    }>`select id,adjustment_type,amount::text,reason,created_at::text
      from finance.expense_adjustments where organization_id=${organizationId} and expense_id=${expenseId}
      order by created_at desc,id desc`.execute(db),
    sql<{
      id: string;
      action: string;
      reason: string | null;
      created_at: string;
      actor_id: string | null;
    }>`select id::text,action,reason,created_at::text,actor_id::text
      from audit.audit_events where organization_id=${organizationId}
        and target_type='finance.expense' and target_id=${expenseId}
      order by created_at desc,id desc`.execute(db),
  ]);
  const row = expense.rows[0];
  if (!row) throw new FinanceDomainError('NOT_FOUND', 'Expense was not found.');
  return {
    ...financeExpenseView(row),
    payments: payments.rows.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      paidAt: payment.paid_at,
      reference: payment.reference,
      accountId: payment.account_id,
      accountName: payment.account_name,
      financeTransactionId: payment.finance_transaction_id,
      transactionNumber: payment.transaction_number,
    })),
    adjustmentHistory: adjustments.rows.map((adjustment) => ({
      id: adjustment.id,
      type: adjustment.adjustment_type,
      amount: adjustment.amount,
      reason: adjustment.reason,
      createdAt: adjustment.created_at,
    })),
    activity: activity.rows.map((event) => ({
      id: event.id,
      action: event.action,
      reason: event.reason,
      occurredAt: event.created_at,
      actorId: event.actor_id,
    })),
  };
}

export async function cancelExpense(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    expenseId: string;
    expectedVersion: number;
    reason: string;
  },
) {
  const reason = input.reason.trim();
  if (reason.length < 4)
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Expense cancellation requires a meaningful reason.',
    );
  return db.transaction().execute(async (tx) => {
    const current = await sql<{
      status: string;
      version: string;
      paid: string;
    }>`select status,version::text,
      coalesce((select sum(amount) from finance.expense_payments where organization_id=expense.organization_id and expense_id=expense.id),0)::text as paid
      from finance.expenses expense where organization_id=${input.organizationId} and id=${input.expenseId} for update`.execute(
      tx,
    );
    const row = current.rows[0];
    if (!row) throw new FinanceDomainError('NOT_FOUND', 'Expense was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new FinanceDomainError(
        'CONFLICT',
        'Expense changed since it was opened. Refresh before cancelling.',
      );
    if (row.status !== 'RECORDED')
      throw new FinanceDomainError('CONFLICT', 'Only a recorded Expense can be cancelled.');
    if (moneyUnits(row.paid) !== 0n)
      throw new FinanceDomainError(
        'CONFLICT',
        'An Expense with account-backed payments cannot be cancelled. Record a correcting financial event instead.',
      );
    const updated = await sql<{
      version: string;
    }>`update finance.expenses set status='CANCELLED',version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.expenseId} and version=${input.expectedVersion}
      returning version::text`.execute(tx);
    if (!updated.rows[0])
      throw new FinanceDomainError('CONFLICT', 'Expense changed before cancellation completed.');
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.expense.cancelled',
      targetType: 'finance.expense',
      targetId: input.expenseId,
      reason,
      beforeDiff: { status: 'RECORDED' },
      afterDiff: { status: 'CANCELLED' },
    });
    await sql`insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values (${input.organizationId},'finance.expense.cancelled',1,'finance.expense',${input.expenseId}::uuid,${Number(updated.rows[0].version)},${JSON.stringify({ expenseId: input.expenseId, reason })}::jsonb,now())`.execute(
      tx,
    );
    return {
      id: input.expenseId,
      status: 'CANCELLED' as const,
      version: Number(updated.rows[0].version),
    };
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
    expectedVersion: number;
    idempotencyKey: string;
  },
) {
  const amount = signed(input.amount);
  const reason = input.reason.trim();
  if (reason.length < 4)
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Expense adjustment requires a meaningful reason.',
    );
  if (
    (input.adjustmentType === 'CREDIT' || input.adjustmentType === 'REVERSAL') &&
    moneyUnits(amount) > 0n
  )
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Credits and reversals must use a negative amount.',
    );
  return db.transaction().execute(async (tx) => {
    const current = await sql<{
      amount: string;
      adjustments: string;
      paid: string;
      status: string;
      version: string;
    }>`select expense.amount::text,expense.status,expense.version::text,
      coalesce((select sum(adjustment.amount) from finance.expense_adjustments adjustment where adjustment.organization_id=expense.organization_id and adjustment.expense_id=expense.id),0)::text as adjustments,
      coalesce((select sum(payment.amount) from finance.expense_payments payment where payment.organization_id=expense.organization_id and payment.expense_id=expense.id),0)::text as paid
      from finance.expenses expense
      where expense.organization_id=${input.organizationId} and expense.id=${input.expenseId}
      for update`.execute(tx);
    const expense = current.rows[0];
    if (!expense) throw new FinanceDomainError('NOT_FOUND', 'Expense was not found.');
    const claimResult = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.expense.adjust',
      key: input.idempotencyKey,
      body: input,
    });
    if (!claimResult.created) {
      const replay = await sql<{
        expense_id: string | null;
        id: string;
        version: string | null;
      }>`select result_entity_id::text as id,safe_response->>'expenseId' as expense_id,
          safe_response->>'version' as version
        from platform.idempotency_records where id=${claimResult.id} and status='SUCCEEDED'`.execute(
        tx,
      );
      if (replay.rows[0]?.id)
        return {
          id: replay.rows[0].id,
          expenseId: replay.rows[0].expense_id ?? input.expenseId,
          version: Number(replay.rows[0].version ?? expense.version),
        };
      throw new FinanceDomainError('CONFLICT', 'Expense adjustment is already being processed.');
    }
    if (Number(expense.version) !== input.expectedVersion)
      throw new FinanceDomainError(
        'CONFLICT',
        'Expense changed since it was opened. Refresh before recording the adjustment.',
      );
    if (expense.status !== 'RECORDED')
      throw new FinanceDomainError('CONFLICT', 'Only a recorded Expense can be adjusted.');
    const previousTotal = moneyUnits(expense.amount) + moneyUnits(expense.adjustments);
    const adjustedTotal = previousTotal + moneyUnits(amount);
    if (adjustedTotal <= 0n)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'An adjustment must leave a positive Expense total. Cancel an unpaid Expense instead.',
      );
    if (adjustedTotal < moneyUnits(expense.paid))
      throw new FinanceDomainError(
        'CONFLICT',
        'An adjustment cannot reduce the Expense below the amount already paid.',
      );
    const adjustment = await sql<{
      id: string;
    }>`insert into finance.expense_adjustments
      (organization_id,expense_id,adjustment_type,amount,reason,created_by)
      values (${input.organizationId},${input.expenseId}::uuid,${input.adjustmentType},${amount}::numeric,${reason},${input.actorId ?? null}::uuid)
      returning id`.execute(tx);
    const adjustmentId = adjustment.rows[0]?.id;
    if (!adjustmentId) throw new Error('Expense adjustment was not created.');
    const updated = await sql<{
      version: string;
    }>`update finance.expenses set version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.expenseId} and version=${input.expectedVersion}
      returning version::text`.execute(tx);
    const version = Number(updated.rows[0]?.version);
    if (!version)
      throw new FinanceDomainError('CONFLICT', 'Expense changed before adjustment completed.');
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.expense.adjusted',
      targetType: 'finance.expense',
      targetId: input.expenseId,
      reason,
      beforeDiff: { total: moneyFromUnits(previousTotal) },
      afterDiff: {
        total: moneyFromUnits(adjustedTotal),
        adjustmentId,
        adjustmentType: input.adjustmentType,
        amount,
      },
    });
    await sql`update platform.idempotency_records
      set status='SUCCEEDED',result_entity_type='finance.expense_adjustment',
        result_entity_id=${adjustmentId}::uuid,
        safe_response=${JSON.stringify({ expenseId: input.expenseId, version })}::jsonb,
        completed_at=now()
      where id=${claimResult.id}`.execute(tx);
    await sql`insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values (${input.organizationId},'finance.expense.adjusted',1,'finance.expense',${input.expenseId}::uuid,${version},${JSON.stringify({ expenseId: input.expenseId, adjustmentId, adjustmentType: input.adjustmentType, amount, reason })}::jsonb,now())`.execute(
      tx,
    );
    return { id: adjustmentId, expenseId: input.expenseId, version };
  });
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
  const cleanAmount = input.amount.replace(/,/g, '').trim();
  const cleanReference = input.reference?.trim() || null;
  const amount = positive(cleanAmount, 'Transfer amount');

  return db.transaction().execute(async (tx) => {
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
    const sourceBalance = await balance(tx, input.organizationId, input.sourceAccountId);
    if (moneyUnits(sourceBalance) < moneyUnits(amount))
      throw new FinanceDomainError(
        'CONFLICT',
        `Source account has insufficient balance (available: ${source.currency_code} ${moneyFromUnits(moneyUnits(sourceBalance))}).`,
      );
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.transfer.create',
      key: input.idempotencyKey,
      body: { ...input, amount: cleanAmount, reference: cleanReference },
    });
    if (!c.created) throw new FinanceDomainError('CONFLICT', 'Transfer was already processed.');
    const n = await nextNumber(tx, input.organizationId, 'FIN');
    const tr = await sql<{
      id: string;
    }>`insert into finance.finance_transactions (organization_id,transaction_number,transaction_type,description,created_by) values (${input.organizationId},${n},'INTERNAL_TRANSFER',${cleanReference ?? 'Internal transfer'},${input.actorId}::uuid) returning id`.execute(
      tx,
    );
    const tid = tr.rows[0]?.id;
    if (!tid) throw new Error('Transfer transaction failed.');
    await sql`insert into finance.financial_account_entries (organization_id,finance_transaction_id,financial_account_id,amount_delta,currency_code) values (${input.organizationId},${tid}::uuid,${input.sourceAccountId}::uuid,${`-${amount}`}::numeric,${source.currency_code}),(${input.organizationId},${tid}::uuid,${input.destinationAccountId}::uuid,${amount}::numeric,${source.currency_code})`.execute(
      tx,
    );
    await sql`insert into finance.internal_transfers (organization_id,finance_transaction_id,source_account_id,destination_account_id,amount,currency_code,reference,created_by) values (${input.organizationId},${tid}::uuid,${input.sourceAccountId}::uuid,${input.destinationAccountId}::uuid,${amount}::numeric,${source.currency_code},${cleanReference},${input.actorId}::uuid)`.execute(
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
      moneyUnits(value) < 0n &&
      moneyUnits(await balance(tx, input.organizationId, input.accountId)) < -moneyUnits(value)
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

export interface OutstandingCodSettlementPaymentView {
  readonly paymentId: string;
  readonly paymentNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly deliveryId: string;
  readonly deliveryNumber: string;
  readonly carrierName: string;
  readonly trackingReference: string | null;
  readonly collectedAt: string;
  readonly amount: string;
  readonly settledAmount: string;
  readonly outstandingAmount: string;
  readonly currency: string;
  readonly sourceAccountId: string | null;
  readonly sourceAccountName: string | null;
  readonly canSettle: boolean;
}

export interface FinanceCodSettlementView {
  readonly id: string;
  readonly settlementNumber: string;
  readonly carrierName: string;
  readonly remittanceReference: string;
  readonly currency: string;
  readonly grossAmount: string;
  readonly deductionAmount: string;
  readonly netAmount: string;
  readonly deductionNote: string | null;
  readonly sourceAccountId: string;
  readonly sourceAccountName: string;
  readonly destinationAccountId: string;
  readonly destinationAccountName: string;
  readonly financeTransactionId: string;
  readonly settledAt: string;
  readonly createdBy: string | null;
  readonly allocations: readonly {
    readonly paymentId: string;
    readonly paymentNumber: string;
    readonly orderId: string;
    readonly orderNumber: string;
    readonly deliveryId: string;
    readonly deliveryNumber: string;
    readonly amount: string;
  }[];
}

export async function listOutstandingCodSettlementPayments(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly OutstandingCodSettlementPaymentView[]> {
  const result = await sql<{
    payment_id: string;
    payment_number: string;
    order_id: string;
    order_number: string;
    delivery_id: string;
    delivery_number: string;
    carrier_name: string | null;
    tracking_reference: string | null;
    collected_at: string;
    amount: string;
    settled_amount: string;
    outstanding_amount: string;
    currency_code: string;
    source_account_id: string | null;
    source_account_name: string | null;
    source_account_status: string | null;
  }>`
    select payment.id as payment_id,payment.payment_number,allocation.order_id,allocation.order_number_snapshot as order_number,
      delivery.id as delivery_id,delivery.delivery_number,delivery.manual_carrier_name as carrier_name,
      delivery.tracking_reference,payment.confirmed_at::text as collected_at,payment.amount::text,
      coalesce(settled.amount,0)::numeric(20,4)::text as settled_amount,
      greatest(payment.amount-coalesce(settled.amount,0),0)::numeric(20,4)::text as outstanding_amount,
      payment.currency_code,posting.account_id as source_account_id,posting.account_name as source_account_name,
      posting.account_status as source_account_status
    from payments.payments payment
    join payments.payment_methods method on method.id=payment.payment_method_id and method.code='COD'
    join payments.payment_allocations allocation on allocation.organization_id=payment.organization_id and allocation.payment_id=payment.id
    join delivery.deliveries delivery on delivery.organization_id=payment.organization_id and delivery.id=payment.source_delivery_id
    left join lateral (
      select sum(cod_allocation.amount) as amount
      from finance.cod_settlement_allocations cod_allocation
      where cod_allocation.organization_id=payment.organization_id and cod_allocation.payment_id=payment.id
    ) settled on true
    left join lateral (
      select account.id as account_id,account.name as account_name,account.status as account_status
      from finance.finance_transactions transaction
      join finance.financial_account_entries entry on entry.organization_id=transaction.organization_id and entry.finance_transaction_id=transaction.id
      join finance.financial_accounts account on account.organization_id=entry.organization_id and account.id=entry.financial_account_id
      where transaction.organization_id=payment.organization_id
        and transaction.transaction_type='PAYMENT_SOURCE_POSTING'
        and transaction.source_domain='payments.payment' and transaction.source_id=payment.id
      limit 1
    ) posting on true
    where payment.organization_id=${organizationId} and payment.status='CONFIRMED'
      and greatest(payment.amount-coalesce(settled.amount,0),0)>0
    order by payment.confirmed_at asc,payment.id asc
    limit 200
  `.execute(db);
  return result.rows.map((row) => ({
    paymentId: row.payment_id,
    paymentNumber: row.payment_number,
    orderId: row.order_id,
    orderNumber: row.order_number,
    deliveryId: row.delivery_id,
    deliveryNumber: row.delivery_number,
    carrierName: row.carrier_name ?? 'Unidentified courier',
    trackingReference: row.tracking_reference,
    collectedAt: row.collected_at,
    amount: row.amount,
    settledAmount: row.settled_amount,
    outstandingAmount: row.outstanding_amount,
    currency: row.currency_code,
    sourceAccountId: row.source_account_id,
    sourceAccountName: row.source_account_name,
    canSettle: row.source_account_status === 'ACTIVE' && Boolean(row.carrier_name?.trim()),
  }));
}

export async function listCodSettlements(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: { page?: number; pageSize?: number } = {},
): Promise<{
  readonly items: readonly FinanceCodSettlementView[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
}> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const offset = (page - 1) * pageSize;
  const [settlements, total] = await Promise.all([
    sql<{
      id: string;
      settlement_number: string;
      carrier_name: string;
      remittance_reference: string;
      currency_code: string;
      gross_amount: string;
      deduction_amount: string;
      net_amount: string;
      deduction_note: string | null;
      source_account_id: string;
      source_account_name: string;
      destination_account_id: string;
      destination_account_name: string;
      finance_transaction_id: string;
      settled_at: string;
      created_by: string | null;
    }>`select settlement.id,settlement.settlement_number,settlement.carrier_name,settlement.remittance_reference,
      settlement.currency_code,settlement.gross_amount::text,settlement.deduction_amount::text,settlement.net_amount::text,
      settlement.deduction_note,settlement.source_account_id,source_account.name as source_account_name,
      settlement.destination_account_id,destination_account.name as destination_account_name,
      settlement.finance_transaction_id,settlement.settled_at::text,settlement.created_by::text
      from finance.cod_settlements settlement
      join finance.financial_accounts source_account on source_account.id=settlement.source_account_id
      join finance.financial_accounts destination_account on destination_account.id=settlement.destination_account_id
      where settlement.organization_id=${organizationId}
      order by settlement.settled_at desc,settlement.id desc limit ${pageSize} offset ${offset}`.execute(
      db,
    ),
    sql<{
      total: string;
    }>`select count(*)::text as total from finance.cod_settlements where organization_id=${organizationId}`.execute(
      db,
    ),
  ]);
  const settlementIds = settlements.rows.map((row) => row.id);
  const allocations = settlementIds.length
    ? await sql<{
        settlement_id: string;
        payment_id: string;
        payment_number: string;
        order_id: string;
        order_number: string;
        delivery_id: string;
        delivery_number: string;
        amount: string;
      }>`select allocation.settlement_id,allocation.payment_id,payment.payment_number,
        payment_allocation.order_id,payment_allocation.order_number_snapshot as order_number,
        delivery.id as delivery_id,delivery.delivery_number,allocation.amount::text
        from finance.cod_settlement_allocations allocation
        join payments.payments payment on payment.id=allocation.payment_id
        join payments.payment_allocations payment_allocation on payment_allocation.organization_id=allocation.organization_id and payment_allocation.payment_id=allocation.payment_id
        join delivery.deliveries delivery on delivery.organization_id=payment.organization_id and delivery.id=payment.source_delivery_id
        where allocation.organization_id=${organizationId} and allocation.settlement_id in (${sql.join(settlementIds.map((id) => sql`${id}::uuid`))})
        order by allocation.created_at,allocation.id`.execute(db)
    : { rows: [] as const };
  return {
    items: settlements.rows.map((row) => ({
      id: row.id,
      settlementNumber: row.settlement_number,
      carrierName: row.carrier_name,
      remittanceReference: row.remittance_reference,
      currency: row.currency_code,
      grossAmount: row.gross_amount,
      deductionAmount: row.deduction_amount,
      netAmount: row.net_amount,
      deductionNote: row.deduction_note,
      sourceAccountId: row.source_account_id,
      sourceAccountName: row.source_account_name,
      destinationAccountId: row.destination_account_id,
      destinationAccountName: row.destination_account_name,
      financeTransactionId: row.finance_transaction_id,
      settledAt: row.settled_at,
      createdBy: row.created_by,
      allocations: allocations.rows
        .filter((allocation) => allocation.settlement_id === row.id)
        .map((allocation) => ({
          paymentId: allocation.payment_id,
          paymentNumber: allocation.payment_number,
          orderId: allocation.order_id,
          orderNumber: allocation.order_number,
          deliveryId: allocation.delivery_id,
          deliveryNumber: allocation.delivery_number,
          amount: allocation.amount,
        })),
    })),
    pagination: {
      page,
      pageSize,
      totalItems: Number(total.rows[0]?.total ?? 0),
      totalPages: Math.ceil(Number(total.rows[0]?.total ?? 0) / pageSize),
    },
  };
}

export async function createCodSettlement(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    destinationAccountId: string;
    remittanceReference: string;
    deductionAmount?: string;
    deductionNote?: string;
    settledAt?: string;
    allocations: readonly { paymentId: string; amount: string }[];
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const claimResult = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'finance.cod-settlement.create',
      key: input.idempotencyKey,
      body: input,
    });
    if (!claimResult.created) {
      const replay = await sql<{ id: string; finance_transaction_id: string }>`
        select settlement.id,settlement.finance_transaction_id
        from platform.idempotency_records record
        join finance.cod_settlements settlement on settlement.organization_id=record.organization_id and settlement.id=record.result_entity_id
        where record.id=${claimResult.id} and record.status='SUCCEEDED'
      `.execute(tx);
      if (replay.rows[0])
        return {
          id: replay.rows[0].id,
          financeTransactionId: replay.rows[0].finance_transaction_id,
        };
      throw new FinanceDomainError('CONFLICT', 'COD settlement is already being processed.');
    }
    if (!input.allocations.length || input.allocations.length > 100)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'A COD settlement must allocate between 1 and 100 Payments.',
      );
    const paymentIds = input.allocations.map((allocation) => allocation.paymentId);
    if (new Set(paymentIds).size !== paymentIds.length)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'Each Payment can appear only once in a COD settlement.',
      );
    const requested = new Map(
      input.allocations.map((allocation) => [
        allocation.paymentId,
        positive(allocation.amount, 'Settlement allocation'),
      ]),
    );
    const reference = input.remittanceReference.trim();
    if (!reference)
      throw new FinanceDomainError('VALIDATION_FAILED', 'Remittance reference is required.');
    const normalizedReference = reference.replace(/\s+/g, ' ').toLocaleUpperCase();
    const deduction = nonNegative(input.deductionAmount ?? '0', 'Deduction');
    const deductionNote = input.deductionNote?.trim() || undefined;
    if (moneyUnits(deduction) > 0n && !deductionNote)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'A deduction note is required when the courier deducts an amount.',
      );
    const settledAt = input.settledAt?.trim() || new Date().toISOString();
    if (Number.isNaN(new Date(settledAt).valueOf()))
      throw new FinanceDomainError('VALIDATION_FAILED', 'Settlement time is invalid.');

    const payments = await sql<{
      id: string;
      payment_number: string;
      amount: string;
      currency_code: string;
      carrier_name: string | null;
      source_account_id: string | null;
      settled_amount: string;
    }>`select payment.id,payment.payment_number,payment.amount::text,payment.currency_code,
      delivery.manual_carrier_name as carrier_name,posting.account_id as source_account_id,
      coalesce(settled.amount,0)::numeric(20,4)::text as settled_amount
      from payments.payments payment
      join payments.payment_methods method on method.id=payment.payment_method_id and method.code='COD'
      join delivery.deliveries delivery on delivery.organization_id=payment.organization_id and delivery.id=payment.source_delivery_id
      left join lateral (
        select entry.financial_account_id as account_id
        from finance.finance_transactions transaction
        join finance.financial_account_entries entry on entry.organization_id=transaction.organization_id and entry.finance_transaction_id=transaction.id
        where transaction.organization_id=payment.organization_id
          and transaction.transaction_type='PAYMENT_SOURCE_POSTING'
          and transaction.source_domain='payments.payment' and transaction.source_id=payment.id
        limit 1
      ) posting on true
      left join lateral (
        select sum(allocation.amount) as amount from finance.cod_settlement_allocations allocation
        where allocation.organization_id=payment.organization_id and allocation.payment_id=payment.id
      ) settled on true
      where payment.organization_id=${input.organizationId} and payment.status='CONFIRMED'
        and payment.id in (${sql.join(paymentIds.map((id) => sql`${id}::uuid`))})
      order by payment.id for update of payment`.execute(tx);
    if (payments.rows.length !== paymentIds.length)
      throw new FinanceDomainError(
        'NOT_FOUND',
        'One or more confirmed COD Payments were not found.',
      );
    const sourceAccountId = payments.rows[0]?.source_account_id;
    if (!sourceAccountId || payments.rows.some((payment) => !payment.source_account_id))
      throw new FinanceDomainError(
        'CONFLICT',
        'Every COD Payment must be posted to a courier holding account before settlement.',
      );
    if (payments.rows.some((payment) => payment.source_account_id !== sourceAccountId))
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'A settlement can only combine Payments posted to the same courier holding account.',
      );
    const currency = payments.rows[0]!.currency_code;
    if (payments.rows.some((payment) => payment.currency_code !== currency))
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'A COD settlement cannot combine currencies.',
      );
    const carrierName = payments.rows[0]!.carrier_name?.trim() ?? '';
    if (
      !carrierName ||
      payments.rows.some(
        (payment) =>
          payment.carrier_name?.trim().toLocaleLowerCase() !== carrierName.toLocaleLowerCase(),
      )
    )
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'A COD settlement can only combine Payments from the same identified courier.',
      );
    let grossUnits = 0n;
    for (const payment of payments.rows) {
      const amount = requested.get(payment.id);
      if (!amount) throw new Error('Settlement allocation lookup failed.');
      const outstanding = moneyUnits(payment.amount) - moneyUnits(payment.settled_amount);
      if (moneyUnits(amount) > outstanding)
        throw new FinanceDomainError(
          'CONFLICT',
          `Allocation for ${payment.payment_number} exceeds its outstanding courier-held amount of ${moneyFromUnits(outstanding)} ${currency}.`,
        );
      grossUnits += moneyUnits(amount);
    }
    const deductionUnits = moneyUnits(deduction);
    if (deductionUnits >= grossUnits)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'Deduction must be lower than the gross remittance amount.',
      );
    const gross = moneyFromUnits(grossUnits);
    const net = moneyFromUnits(grossUnits - deductionUnits);
    if (sourceAccountId === input.destinationAccountId)
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'Courier holding and receiving accounts must differ.',
      );
    const accountIds = [sourceAccountId, input.destinationAccountId].sort();
    const lockedAccounts = new Map<string, Awaited<ReturnType<typeof account>>>();
    for (const accountId of accountIds)
      lockedAccounts.set(accountId, await account(tx, input.organizationId, accountId, true));
    const source = lockedAccounts.get(sourceAccountId)!;
    const destination = lockedAccounts.get(input.destinationAccountId)!;
    if (
      source.status !== 'ACTIVE' ||
      destination.status !== 'ACTIVE' ||
      source.currency_code !== currency ||
      destination.currency_code !== currency
    )
      throw new FinanceDomainError(
        'VALIDATION_FAILED',
        'Settlement accounts must be active and match the COD currency.',
      );
    if (moneyUnits(await balance(tx, input.organizationId, sourceAccountId)) < grossUnits)
      throw new FinanceDomainError(
        'CONFLICT',
        'Courier holding account has insufficient balance for this settlement.',
      );

    const settlementId = crypto.randomUUID();
    const transactionNumber = await nextNumber(tx, input.organizationId, 'FIN');
    const settlementNumber = await nextNumber(tx, input.organizationId, 'CODS', 'cod_settlements');
    const transaction = await sql<{ id: string }>`insert into finance.finance_transactions
      (organization_id,transaction_number,transaction_type,occurred_at,description,source_domain,source_id,created_by)
      values (${input.organizationId},${transactionNumber},'COD_SETTLEMENT',${settledAt}::timestamptz,${`Courier COD settlement ${reference}`},'finance.cod_settlement',${settlementId}::uuid,${input.actorId ?? null}::uuid)
      returning id`.execute(tx);
    const financeTransactionId = transaction.rows[0]?.id;
    if (!financeTransactionId) throw new Error('COD settlement transaction was not created.');
    await sql`insert into finance.financial_account_entries
      (organization_id,finance_transaction_id,financial_account_id,amount_delta,currency_code)
      values (${input.organizationId},${financeTransactionId}::uuid,${sourceAccountId}::uuid,${`-${gross}`}::numeric,${currency}),
        (${input.organizationId},${financeTransactionId}::uuid,${input.destinationAccountId}::uuid,${net}::numeric,${currency})`.execute(
      tx,
    );
    try {
      await sql`insert into finance.cod_settlements
        (id,organization_id,settlement_number,finance_transaction_id,source_account_id,destination_account_id,carrier_name,remittance_reference,normalized_remittance_reference,currency_code,gross_amount,deduction_amount,net_amount,deduction_note,settled_at,created_by)
        values (${settlementId}::uuid,${input.organizationId},${settlementNumber},${financeTransactionId}::uuid,${sourceAccountId}::uuid,${input.destinationAccountId}::uuid,${carrierName},${reference},${normalizedReference},${currency},${gross}::numeric,${deduction}::numeric,${net}::numeric,${deductionNote ?? null},${settledAt}::timestamptz,${input.actorId ?? null}::uuid)`.execute(
        tx,
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new FinanceDomainError(
          'CONFLICT',
          'This courier remittance reference has already been recorded.',
        );
      throw error;
    }
    for (const allocation of input.allocations)
      await sql`insert into finance.cod_settlement_allocations
        (organization_id,settlement_id,payment_id,amount)
        values (${input.organizationId},${settlementId}::uuid,${allocation.paymentId}::uuid,${requested.get(allocation.paymentId)!}::numeric)`.execute(
        tx,
      );
    await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type='finance.cod_settlement',result_entity_id=${settlementId}::uuid,safe_response=${JSON.stringify({ settlementId, financeTransactionId })}::jsonb,completed_at=now() where id=${claimResult.id}`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.cod_settlement.created',
      targetType: 'finance.cod_settlement',
      targetId: settlementId,
      metadata: {
        carrierName,
        remittanceReference: reference,
        grossAmount: gross,
        deductionAmount: deduction,
        netAmount: net,
        allocationCount: input.allocations.length,
      },
    });
    await sql`insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values (${input.organizationId},'finance.cod_settlement.created',1,'finance.cod_settlement',${settlementId}::uuid,1,${JSON.stringify({ settlementId, financeTransactionId, carrierName, grossAmount: gross, deductionAmount: deduction, netAmount: net })}::jsonb,now())`.execute(
      tx,
    );
    return { id: settlementId, financeTransactionId };
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
    if (
      moneyUnits(await balance(tx, input.organizationId, input.accountId)) <
      moneyUnits(r.rows[0].amount)
    )
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
  const observed = input.observedBalance.replace(/,/g, '').trim();
  if (!observed) {
    throw new FinanceDomainError('VALIDATION_FAILED', 'Observed balance is required.');
  }
  if (!signedMoney.test(observed))
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Observed balance must be a valid numeric amount with up to 4 decimal places.',
    );

  return db.transaction().execute(async (tx) => {
    const a = await account(tx, input.organizationId, input.accountId);
    const ledger = await balance(tx, input.organizationId, input.accountId);
    const diff = moneyFromUnits(moneyUnits(observed) - moneyUnits(ledger));
    const status = moneyUnits(diff) === 0n ? 'CLOSED' : 'OPEN';
    const r = await sql<{
      id: string;
    }>`insert into finance.reconciliation_sessions (organization_id,financial_account_id,observed_balance,ledger_balance,difference_amount,status,created_by) values (${input.organizationId},${a.id}::uuid,${observed}::numeric,${ledger}::numeric,${diff}::numeric,${status},${input.actorId}::uuid) returning id`.execute(
      tx,
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error('Reconciliation was not created.');
    if (moneyUnits(diff) !== 0n)
      await sql`insert into finance.reconciliation_issues (organization_id,reconciliation_session_id,issue_code,description,amount_delta) values (${input.organizationId},${id}::uuid,'LEDGER_DIFFERENCE','Observed balance differs from immutable ledger.',${diff}::numeric)`.execute(
        tx,
      );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.reconciliation.created',
      targetType: 'finance.reconciliation_session',
      targetId: id,
      metadata: {
        accountId: a.id,
        observedBalance: observed,
        ledgerBalance: ledger,
        difference: diff,
      },
    });
    await sql`insert into platform.outbox_events (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values (${input.organizationId},'finance.reconciliation.created',1,'finance.reconciliation_session',${id}::uuid,1,${JSON.stringify({ reconciliationId: id, accountId: a.id, status })}::jsonb,now())`.execute(
      tx,
    );
    return { id, ledgerBalance: ledger, difference: diff, status };
  });
}

export type ReconciliationResolutionCode = 'EXPLAINED_DIFFERENCE' | 'EXTERNAL_BALANCE_CORRECTED';

export async function resolveReconciliation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    reconciliationId: string;
    resolutionCode: ReconciliationResolutionCode;
    note: string;
  },
) {
  const note = input.note.trim();
  if (note.length < 4 || note.length > 1000)
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Resolution note must contain 4–1000 characters.',
    );
  if (!['EXPLAINED_DIFFERENCE', 'EXTERNAL_BALANCE_CORRECTED'].includes(input.resolutionCode))
    throw new FinanceDomainError('VALIDATION_FAILED', 'Resolution code is not supported.');

  return db.transaction().execute(async (tx) => {
    const result = await sql<{
      id: string;
      financial_account_id: string;
      difference_amount: string;
      status: string;
    }>`select id,financial_account_id,difference_amount::text,status from finance.reconciliation_sessions where organization_id=${input.organizationId} and id=${input.reconciliationId} for update`.execute(
      tx,
    );
    const session = result.rows[0];
    if (!session) throw new FinanceDomainError('NOT_FOUND', 'Reconciliation was not found.');
    if (session.status !== 'OPEN')
      throw new FinanceDomainError('CONFLICT', 'Reconciliation is already closed.');
    if (moneyUnits(session.difference_amount) === 0n)
      throw new FinanceDomainError('CONFLICT', 'A matched reconciliation needs no resolution.');

    await sql`update finance.reconciliation_issues set status='RESOLVED' where organization_id=${input.organizationId} and reconciliation_session_id=${session.id}::uuid and status='OPEN'`.execute(
      tx,
    );
    await sql`update finance.reconciliation_sessions set status='CLOSED' where organization_id=${input.organizationId} and id=${session.id}::uuid`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.reconciliation.resolved',
      targetType: 'finance.reconciliation_session',
      targetId: session.id,
      reason: note,
      beforeDiff: { status: 'OPEN' },
      afterDiff: { status: 'CLOSED' },
      metadata: {
        accountId: session.financial_account_id,
        difference: session.difference_amount,
        resolutionCode: input.resolutionCode,
      },
    });
    await sql`insert into platform.outbox_events (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values (${input.organizationId},'finance.reconciliation.resolved',1,'finance.reconciliation_session',${session.id}::uuid,2,${JSON.stringify({ reconciliationId: session.id, accountId: session.financial_account_id, resolutionCode: input.resolutionCode })}::jsonb,now())`.execute(
      tx,
    );
    return { id: session.id, status: 'CLOSED' as const };
  });
}

export async function reopenReconciliation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    reconciliationId: string;
    note: string;
  },
) {
  const note = input.note.trim();
  if (note.length < 4 || note.length > 1000)
    throw new FinanceDomainError(
      'VALIDATION_FAILED',
      'Reopen note must contain 4–1000 characters.',
    );

  return db.transaction().execute(async (tx) => {
    const result = await sql<{
      id: string;
      financial_account_id: string;
      difference_amount: string;
      status: string;
    }>`select id,financial_account_id,difference_amount::text,status from finance.reconciliation_sessions where organization_id=${input.organizationId} and id=${input.reconciliationId} for update`.execute(
      tx,
    );
    const session = result.rows[0];
    if (!session) throw new FinanceDomainError('NOT_FOUND', 'Reconciliation was not found.');
    if (session.status !== 'CLOSED')
      throw new FinanceDomainError('CONFLICT', 'Reconciliation is already open.');
    if (moneyUnits(session.difference_amount) === 0n)
      throw new FinanceDomainError('CONFLICT', 'A matched reconciliation cannot be reopened.');

    await sql`update finance.reconciliation_issues set status='OPEN' where organization_id=${input.organizationId} and reconciliation_session_id=${session.id}::uuid and status='RESOLVED'`.execute(
      tx,
    );
    await sql`update finance.reconciliation_sessions set status='OPEN' where organization_id=${input.organizationId} and id=${session.id}::uuid`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'finance.reconciliation.reopened',
      targetType: 'finance.reconciliation_session',
      targetId: session.id,
      reason: note,
      beforeDiff: { status: 'CLOSED' },
      afterDiff: { status: 'OPEN' },
      metadata: {
        accountId: session.financial_account_id,
        difference: session.difference_amount,
      },
    });
    await sql`insert into platform.outbox_events (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values (${input.organizationId},'finance.reconciliation.reopened',1,'finance.reconciliation_session',${session.id}::uuid,3,${JSON.stringify({ reconciliationId: session.id, accountId: session.financial_account_id })}::jsonb,now())`.execute(
      tx,
    );
    return { id: session.id, status: 'OPEN' as const };
  });
}
export async function listReconciliations(
  db: Kysely<DatabaseSchema>,
  org: string,
  filters: { accountId?: string | undefined } = {},
) {
  const accountId = filters.accountId?.trim() || null;
  const result = await sql<{
    id: string;
    account_id: string;
    observed_balance: string;
    ledger_balance: string;
    difference_amount: string;
    status: 'OPEN' | 'CLOSED';
    created_at: string;
    account_name: string;
    resolution_code: ReconciliationResolutionCode | null;
    resolution_note: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
  }>`
    select s.id,s.financial_account_id as account_id,s.observed_balance::text,s.ledger_balance::text,
      s.difference_amount::text,s.status,s.created_at::text,a.name as account_name,
      resolution.metadata->>'resolutionCode' as resolution_code,
      resolution.reason as resolution_note,resolution.created_at::text as resolved_at,
      resolution.actor_id::text as resolved_by
    from finance.reconciliation_sessions s
    join finance.financial_accounts a on a.id=s.financial_account_id
    left join lateral (
      select event.metadata,event.reason,event.created_at,event.actor_id
      from audit.audit_events event
      where event.organization_id=s.organization_id
        and event.action='finance.reconciliation.resolved'
        and event.target_type='finance.reconciliation_session'
        and event.target_id=s.id
      order by event.created_at desc,event.id desc limit 1
    ) resolution on true
    where s.organization_id=${org}
      and (${accountId}::uuid is null or s.financial_account_id=${accountId}::uuid)
    order by s.created_at desc,s.id desc
  `.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    account_id: row.account_id,
    account_name: row.account_name,
    observed_balance: row.observed_balance,
    ledger_balance: row.ledger_balance,
    difference_amount: row.difference_amount,
    status: row.status,
    created_at: row.created_at,
    resolution:
      row.resolution_code && row.resolution_note && row.resolved_at
        ? {
            code: row.resolution_code,
            note: row.resolution_note,
            resolved_at: row.resolved_at,
            resolved_by: row.resolved_by,
          }
        : null,
  }));
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
  const invalidCodSettlement = await sql`
    select settlement.id
    from finance.cod_settlements settlement
    left join finance.financial_account_entries source_entry
      on source_entry.organization_id=settlement.organization_id
      and source_entry.finance_transaction_id=settlement.finance_transaction_id
      and source_entry.financial_account_id=settlement.source_account_id
    left join finance.financial_account_entries destination_entry
      on destination_entry.organization_id=settlement.organization_id
      and destination_entry.finance_transaction_id=settlement.finance_transaction_id
      and destination_entry.financial_account_id=settlement.destination_account_id
    where settlement.organization_id=${organizationId}
    group by settlement.id
    having count(source_entry.id)<>1 or count(destination_entry.id)<>1
      or coalesce(max(source_entry.amount_delta),0)<>-settlement.gross_amount
      or coalesce(max(destination_entry.amount_delta),0)<>settlement.net_amount
      or coalesce((select sum(allocation.amount) from finance.cod_settlement_allocations allocation where allocation.organization_id=settlement.organization_id and allocation.settlement_id=settlement.id),0)<>settlement.gross_amount
    limit 1
  `.execute(db);
  if (invalidCodSettlement.rows[0]) findings.push('COD_SETTLEMENT_ENTRY_MISMATCH');
  const overSettledCod = await sql`
    select payment.id from payments.payments payment
    join payments.payment_methods method on method.id=payment.payment_method_id and method.code='COD'
    where payment.organization_id=${organizationId}
      and coalesce((select sum(allocation.amount) from finance.cod_settlement_allocations allocation where allocation.organization_id=payment.organization_id and allocation.payment_id=payment.id),0)>payment.amount
    limit 1
  `.execute(db);
  if (overSettledCod.rows[0]) findings.push('COD_PAYMENT_OVER_SETTLED');
  return findings;
}
