import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Rebuildable domain facts and semantic drill-down projections. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table analytics.order_facts (
      organization_id uuid not null references platform.organizations(id), source_order_id uuid not null references orders.orders(id), canonical_customer_id uuid references customers.customers(id),
      order_number text not null, order_status text not null, source text not null, currency_code text not null, gross_amount numeric(20,4) not null, discount_amount numeric(20,4) not null,
      net_amount numeric(20,4) not null, refund_amount numeric(20,4) not null default 0, order_at timestamptz not null, local_order_date date not null, primary key(organization_id,source_order_id)
    );
    create index order_facts_reporting on analytics.order_facts(organization_id,local_order_date,currency_code);
    create table analytics.customer_facts (
      organization_id uuid not null references platform.organizations(id), canonical_customer_id uuid not null references customers.customers(id), order_count bigint not null,
      currency_code text not null, lifetime_net_amount numeric(20,4) not null, first_order_at timestamptz, last_order_at timestamptz, primary key(organization_id,canonical_customer_id,currency_code)
    );
    create table analytics.delivery_facts (
      organization_id uuid not null references platform.organizations(id), source_delivery_id uuid not null references delivery.deliveries(id), order_id uuid not null references orders.orders(id), fulfillment_id uuid not null references fulfillment.fulfillments(id),
      operational_status text not null, outcome_status text not null, attempt_count integer not null, delivered_quantity numeric(20,6) not null, failed_quantity numeric(20,6) not null,
      ready_at timestamptz not null, delivered_at timestamptz, failed_at timestamptz, primary key(organization_id,source_delivery_id)
    );
    create table analytics.return_facts (
      organization_id uuid not null references platform.organizations(id), source_return_id uuid not null references returns.return_cases(id), order_id uuid not null references orders.orders(id), case_type text not null,
      case_status text not null, receipt_status text not null, commercial_resolution_status text not null, requested_quantity numeric(20,6) not null, received_quantity numeric(20,6) not null,
      refund_amount numeric(20,4) not null, currency_code text, created_at timestamptz not null, primary key(organization_id,source_return_id)
    );
    create table analytics.payment_facts (
      organization_id uuid not null references platform.organizations(id), fact_type text not null check(fact_type in ('ATTEMPT','PAYMENT','REFUND')), source_id uuid not null,
      order_id uuid references orders.orders(id), status text not null, currency_code text, amount numeric(20,4), occurred_at timestamptz not null, primary key(organization_id,fact_type,source_id)
    );
    create table analytics.cost_facts (
      organization_id uuid not null references platform.organizations(id), fact_type text not null check(fact_type in ('COGS','COGS_ADJUSTMENT','RETURN_RECOVERY')), source_id uuid not null,
      outbound_assignment_id uuid references costing.outbound_cost_assignments(id), amount numeric(24,8) not null, currency_code text not null, occurred_at timestamptz not null,
      primary key(organization_id,fact_type,source_id)
    );
    create table analytics.cash_facts (
      organization_id uuid not null references platform.organizations(id), source_entry_id bigint not null, finance_transaction_id uuid not null references finance.finance_transactions(id),
      account_id uuid not null references finance.financial_accounts(id), transaction_type text not null, currency_code text not null, amount_delta numeric(20,4) not null, occurred_at timestamptz not null,
      primary key(organization_id,source_entry_id)
    );
    create table analytics.projection_event_receipts (
      outbox_event_id bigint not null references platform.outbox_events(id), projection_name text not null, organization_id uuid not null references platform.organizations(id), processed_at timestamptz not null default now(),
      primary key(outbox_event_id,projection_name)
    );

    insert into analytics.metric_definitions(metric_key,semantic_version,display_name,description,grain,time_basis,currency_treatment,included_states,source_domains,calculation_semantics) values
      ('REFUNDS_BY_REFUND_DATE',1,'Refunds by refund date','Completed refunds attributed to their completed date, not the original Order date.','REFUND','REFUND_COMPLETED','GROUP_BY_CURRENCY','["COMPLETED"]','{payments}','sum completed Refund facts grouped by refund currency and completed_at'),
      ('ORDER_COHORT_REFUNDS',1,'Order cohort refunds','Completed refunds attributed separately to the original Order cohort.','ORDER','ORDER_COMMITTED','GROUP_BY_CURRENCY','["COMPLETED"]','{orders,payments}','sum completed Refund facts joined to Order local date'),
      ('RETURN_COGS_RECOVERY',1,'Return COGS recovery','Authoritative append-only Costing recovery on reverse receipt.','RETURN_RECEIPT','RETURN_RECEIVED','GROUP_BY_CURRENCY','["POSTED"]','{returns,costing}','sum Costing cogs_recoveries; Analytics never reruns FIFO'),
      ('DELIVERY_SUCCESS_RATE',1,'Delivery success rate','Delivered outcomes divided by terminal Delivery outcomes.','DELIVERY','DELIVERY_OUTCOME','SINGLE_CURRENCY','["DELIVERED","FAILED","CANCELLED","LOST","DAMAGED"]','{delivery}','delivered terminal deliveries / all terminal deliveries'),
      ('CUSTOMER_LIFETIME_NET',1,'Customer lifetime net sales','Order net snapshots grouped by canonical merged Customer identity.','CUSTOMER','ORDER_COMMITTED','GROUP_BY_CURRENCY','["PENDING","CONFIRMED","COMPLETED"]','{customers,orders}','sum Order net snapshots after canonical Customer alias resolution')
      on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Analytics reporting projections are rebuilt forward.');
}
