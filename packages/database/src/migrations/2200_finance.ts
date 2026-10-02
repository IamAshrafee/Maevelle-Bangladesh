import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Operational cash ledger only: balances are always derived from immutable entries. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists finance;
    create table finance.financial_accounts (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      account_number text not null, name text not null check (length(trim(name)) > 0),
      account_type text not null check (account_type in ('CASH','BANK','MOBILE_WALLET','OTHER')),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
      reference_label text null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique (organization_id, account_number), unique (organization_id, id)
    );
    create table finance.finance_transactions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      transaction_number text not null, transaction_type text not null check (transaction_type in ('OPENING_BALANCE','EXPENSE_PAYMENT','INTERNAL_TRANSFER','EXTERNAL_ADJUSTMENT','PAYMENT_SOURCE_POSTING','REFUND_SOURCE_POSTING','COD_SETTLEMENT','CAPITAL_CONTRIBUTION','OWNER_FUNDED_EXPENSE','CAPITAL_WITHDRAWAL','CAPITAL_REVERSAL','ASSET_SALE')),
      occurred_at timestamptz not null default now(), description text not null, source_domain text null, source_id uuid null, created_by uuid null references iam.users(id), created_at timestamptz not null default now(),
      unique (organization_id, transaction_number), unique (organization_id, id)
    );
    create unique index finance_one_opening_balance_per_account on finance.finance_transactions(organization_id, source_id) where transaction_type = 'OPENING_BALANCE' and source_domain = 'finance.account';
    create unique index finance_one_source_posting on finance.finance_transactions(organization_id, transaction_type, source_domain, source_id) where source_domain is not null and source_id is not null and transaction_type in ('PAYMENT_SOURCE_POSTING','REFUND_SOURCE_POSTING');
    create table finance.financial_account_entries (
      id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id),
      finance_transaction_id uuid not null references finance.finance_transactions(id), financial_account_id uuid not null references finance.financial_accounts(id),
      amount_delta numeric(20,4) not null check (amount_delta <> 0), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), created_at timestamptz not null default now(),
      unique (organization_id, id), foreign key (organization_id, finance_transaction_id) references finance.finance_transactions(organization_id,id),
      foreign key (organization_id, financial_account_id) references finance.financial_accounts(organization_id,id)
    );
    create index finance_entries_account_time on finance.financial_account_entries(organization_id, financial_account_id, created_at desc, id desc);
    create table finance.expense_categories (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), parent_category_id uuid null references finance.expense_categories(id),
      code text not null, name text not null, classification text not null default 'OPERATING', status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique (organization_id, code), unique (organization_id, id)
    );
    create table finance.expenses (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), expense_number text not null,
      expense_category_id uuid not null references finance.expense_categories(id), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), amount numeric(20,4) not null check (amount > 0),
      expense_date date not null, description text not null, payee_type text null, payee_reference_id uuid null, status text not null default 'RECORDED' check (status in ('DRAFT','RECORDED','CANCELLED')),
      payee_name text null, external_reference text null, source_domain text null, source_id uuid null, notes text null, created_by uuid null references iam.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique (organization_id, expense_number), unique (organization_id, id), foreign key (organization_id, expense_category_id) references finance.expense_categories(organization_id,id)
    );
    create table finance.expense_links (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), expense_id uuid not null references finance.expenses(id),
      source_domain text not null, source_id uuid not null, created_at timestamptz not null default now(), unique (organization_id, expense_id, source_domain, source_id),
      foreign key (organization_id, expense_id) references finance.expenses(organization_id,id)
    );
    create table finance.capital_contributors (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      display_name text not null check (length(trim(display_name)) > 0), linked_user_id uuid null references iam.users(id),
      contact_note text null, status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
      created_by uuid null references iam.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique (organization_id,id), unique (organization_id,linked_user_id)
    );
    alter table landed_cost.cost_components
      add column finance_expense_id uuid unique references finance.expenses(id) on delete restrict,
      add foreign key (organization_id, finance_expense_id) references finance.expenses(organization_id, id);
    create table finance.expense_payments (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), expense_id uuid not null references finance.expenses(id),
      finance_transaction_id uuid not null unique references finance.finance_transactions(id), amount numeric(20,4) not null check (amount <> 0),
      payment_source text not null default 'BUSINESS_ACCOUNT' check (payment_source in ('BUSINESS_ACCOUNT','OWNER_CAPITAL','REVERSAL')),
      capital_contributor_id uuid null references finance.capital_contributors(id), reversal_of_payment_id uuid null references finance.expense_payments(id), reversal_reason text null,
      reference text null, paid_at timestamptz not null default now(), created_by uuid null references iam.users(id), created_at timestamptz not null default now(),
      check (
        (payment_source='BUSINESS_ACCOUNT' and amount>0 and capital_contributor_id is null and reversal_of_payment_id is null and reversal_reason is null)
        or (payment_source='OWNER_CAPITAL' and amount>0 and capital_contributor_id is not null and reversal_of_payment_id is null and reversal_reason is null)
        or (payment_source='REVERSAL' and amount<0 and capital_contributor_id is not null and reversal_of_payment_id is not null and length(trim(reversal_reason))>0)
      ),
      unique (organization_id,id), unique (organization_id,reversal_of_payment_id), foreign key (organization_id,expense_id) references finance.expenses(organization_id,id),
      foreign key (organization_id,finance_transaction_id) references finance.finance_transactions(organization_id,id),
      foreign key (organization_id,capital_contributor_id) references finance.capital_contributors(organization_id,id),
      foreign key (organization_id,reversal_of_payment_id) references finance.expense_payments(organization_id,id)
    );
    create index finance_expense_payments_contributor on finance.expense_payments(organization_id,capital_contributor_id,paid_at desc) where capital_contributor_id is not null;
    create table finance.capital_events (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), contributor_id uuid not null references finance.capital_contributors(id),
      finance_transaction_id uuid not null unique references finance.finance_transactions(id), event_type text not null check (event_type in ('CONTRIBUTION','OWNER_FUNDED_EXPENSE','WITHDRAWAL','REVERSAL')),
      amount_delta numeric(20,4) not null check (amount_delta <> 0), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      financial_account_id uuid null references finance.financial_accounts(id), expense_payment_id uuid null references finance.expense_payments(id), reversal_of_event_id uuid null references finance.capital_events(id),
      reference text null, note text null, occurred_at timestamptz not null, created_by uuid null references iam.users(id), created_at timestamptz not null default now(),
      check (
        (event_type='CONTRIBUTION' and amount_delta>0 and financial_account_id is not null and expense_payment_id is null and reversal_of_event_id is null)
        or (event_type='OWNER_FUNDED_EXPENSE' and amount_delta>0 and financial_account_id is null and expense_payment_id is not null and reversal_of_event_id is null)
        or (event_type='WITHDRAWAL' and amount_delta<0 and financial_account_id is not null and expense_payment_id is null and reversal_of_event_id is null)
        or (event_type='REVERSAL' and reversal_of_event_id is not null)
      ),
      unique (organization_id,id), unique (organization_id,reversal_of_event_id), unique (organization_id,expense_payment_id),
      foreign key (organization_id,contributor_id) references finance.capital_contributors(organization_id,id),
      foreign key (organization_id,finance_transaction_id) references finance.finance_transactions(organization_id,id),
      foreign key (organization_id,financial_account_id) references finance.financial_accounts(organization_id,id),
      foreign key (organization_id,expense_payment_id) references finance.expense_payments(organization_id,id),
      foreign key (organization_id,reversal_of_event_id) references finance.capital_events(organization_id,id)
    );
    create index finance_capital_events_contributor_time on finance.capital_events(organization_id,contributor_id,occurred_at desc,id desc);
    create index finance_capital_events_account_time on finance.capital_events(organization_id,financial_account_id,occurred_at desc) where financial_account_id is not null;
    create table finance.expense_adjustments (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), expense_id uuid not null references finance.expenses(id),
      adjustment_type text not null check (adjustment_type in ('CREDIT','CORRECTION','REVERSAL')), amount numeric(20,4) not null check (amount <> 0), reason text not null,
      finance_transaction_id uuid null references finance.finance_transactions(id), created_by uuid null references iam.users(id), created_at timestamptz not null default now(), unique (organization_id,id), foreign key (organization_id,expense_id) references finance.expenses(organization_id,id)
    );
    create table finance.internal_transfers (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), finance_transaction_id uuid not null unique references finance.finance_transactions(id),
      source_account_id uuid not null references finance.financial_accounts(id), destination_account_id uuid not null references finance.financial_accounts(id), amount numeric(20,4) not null check (amount > 0), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), reference text null, created_by uuid null references iam.users(id), created_at timestamptz not null default now(),
      check (source_account_id <> destination_account_id), unique (organization_id,id), foreign key (organization_id,finance_transaction_id) references finance.finance_transactions(organization_id,id), foreign key (organization_id,source_account_id) references finance.financial_accounts(organization_id,id), foreign key (organization_id,destination_account_id) references finance.financial_accounts(organization_id,id)
    );
    create table finance.cod_settlements (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), settlement_number text not null,
      finance_transaction_id uuid not null unique references finance.finance_transactions(id), source_account_id uuid not null references finance.financial_accounts(id), destination_account_id uuid not null references finance.financial_accounts(id),
      carrier_name text not null check (length(trim(carrier_name)) > 0), remittance_reference text not null check (length(trim(remittance_reference)) > 0), normalized_remittance_reference text not null,
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), gross_amount numeric(20,4) not null check (gross_amount > 0), deduction_amount numeric(20,4) not null default 0 check (deduction_amount >= 0), net_amount numeric(20,4) not null check (net_amount > 0), deduction_note text null,
      settled_at timestamptz not null, created_by uuid null references iam.users(id), created_at timestamptz not null default now(),
      check (source_account_id <> destination_account_id), check (net_amount = gross_amount - deduction_amount), check ((deduction_amount = 0 and deduction_note is null) or (deduction_amount > 0 and length(trim(deduction_note)) > 0)),
      unique (organization_id, settlement_number), unique (organization_id, normalized_remittance_reference), unique (organization_id, id),
      foreign key (organization_id,finance_transaction_id) references finance.finance_transactions(organization_id,id), foreign key (organization_id,source_account_id) references finance.financial_accounts(organization_id,id), foreign key (organization_id,destination_account_id) references finance.financial_accounts(organization_id,id)
    );
    create table finance.cod_settlement_allocations (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), settlement_id uuid not null references finance.cod_settlements(id), payment_id uuid not null references payments.payments(id), amount numeric(20,4) not null check (amount > 0), created_at timestamptz not null default now(),
      unique (organization_id,id), unique (organization_id,settlement_id,payment_id), foreign key (organization_id,settlement_id) references finance.cod_settlements(organization_id,id), foreign key (organization_id,payment_id) references payments.payments(organization_id,id)
    );
    create index finance_cod_settlements_org_time on finance.cod_settlements(organization_id,settled_at desc,id desc);
    create index finance_cod_allocations_payment on finance.cod_settlement_allocations(organization_id,payment_id);
    create table finance.reconciliation_sessions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), financial_account_id uuid not null references finance.financial_accounts(id),
      observed_balance numeric(20,4) not null, ledger_balance numeric(20,4) not null, difference_amount numeric(20,4) not null, status text not null default 'OPEN' check (status in ('OPEN','CLOSED')), observed_at timestamptz not null default now(), created_by uuid null references iam.users(id), created_at timestamptz not null default now(),
      unique (organization_id,id), foreign key (organization_id,financial_account_id) references finance.financial_accounts(organization_id,id)
    );
    create table finance.reconciliation_issues (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), reconciliation_session_id uuid not null references finance.reconciliation_sessions(id),
      issue_code text not null, description text not null, amount_delta numeric(20,4) null, status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')), created_at timestamptz not null default now(),
      unique (organization_id,id), foreign key (organization_id,reconciliation_session_id) references finance.reconciliation_sessions(organization_id,id)
    );
    create index finance_expenses_org_date on finance.expenses(organization_id, expense_date desc);
    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('finance.accounts.view','finance','View financial accounts and ledger history.','INTERNAL'), ('finance.accounts.manage','finance','Create or change account lifecycle.','HIGH'),
      ('finance.expenses.view','finance','View expenses.','INTERNAL'), ('finance.expenses.create','finance','Create expenses.','HIGH'), ('finance.expenses.pay','finance','Pay recorded expenses.','HIGH'),
      ('finance.categories.manage','finance','Manage expense categories.','HIGH'), ('finance.cash.view','finance','View cash movements.','INTERNAL'), ('finance.cash.record_manual','finance','Record controlled external cash adjustments.','HIGH'),
      ('finance.transfers.create','finance','Create internal cash transfers.','HIGH'), ('finance.reconciliation.view','finance','View account reconciliations.','INTERNAL'), ('finance.reconciliation.manage','finance','Create account reconciliations.','HIGH')
      ,('finance.cod_settlements.view','finance','View courier COD settlement obligations and remittances.','INTERNAL'), ('finance.cod_settlements.manage','finance','Record courier COD remittances and deductions.','HIGH')
      ,('finance.capital.view','finance','View capital contributors, balances, and owner-funded business costs.','RESTRICTED'), ('finance.capital.manage','finance','Record and reverse capital contributions, withdrawals, and owner-funded costs.','HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code from iam.organization_memberships membership
      cross join (values ('finance.accounts.view'), ('finance.accounts.manage'), ('finance.expenses.view'), ('finance.expenses.create'), ('finance.expenses.pay'), ('finance.categories.manage'), ('finance.cash.view'), ('finance.cash.record_manual'), ('finance.transfers.create'), ('finance.reconciliation.view'), ('finance.reconciliation.manage'), ('finance.cod_settlements.view'), ('finance.cod_settlements.manage'), ('finance.capital.view'), ('finance.capital.manage')) as capability(capability_code)
      where membership.membership_type='OWNER' and membership.status='ACTIVE' on conflict do nothing;
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Finance ledger history is append-only.');
}
