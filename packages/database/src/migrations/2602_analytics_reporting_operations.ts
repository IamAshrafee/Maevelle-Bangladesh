import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Rebuildable domain facts and semantic drill-down projections. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table analytics.order_facts (
      organization_id uuid not null references platform.organizations(id), source_order_id uuid not null references orders.orders(id), canonical_customer_id uuid references customers.customers(id),
      order_number text not null, order_status text not null, source text not null, sales_channel text not null, payment_method text not null, currency_code text not null,
      merchandise_gross_amount numeric(20,4) not null, discount_amount numeric(20,4) not null, delivery_charge_amount numeric(20,4) not null,
      order_total_amount numeric(20,4) not null, refund_amount numeric(20,4) not null default 0, order_at timestamptz not null, confirmed_at timestamptz,
      completed_at timestamptz, cancelled_at timestamptz, local_order_date date not null, primary key(organization_id,source_order_id),
      check(order_total_amount=merchandise_gross_amount-discount_amount+delivery_charge_amount)
    );
    create index order_facts_reporting on analytics.order_facts(organization_id,local_order_date,currency_code);
    create index order_facts_status_reporting on analytics.order_facts(organization_id,order_status,local_order_date);
    create index order_facts_customer_reporting on analytics.order_facts(organization_id,canonical_customer_id,order_at);
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
    create index projection_event_receipts_organization on analytics.projection_event_receipts(organization_id,processed_at desc);

    create table analytics.storefront_sessions (
      organization_id uuid not null references platform.organizations(id), session_id uuid not null, anonymous_id uuid,
      analytics_consent text not null check(analytics_consent in ('GRANTED','DENIED','UNKNOWN')),
      marketing_consent text not null check(marketing_consent in ('GRANTED','DENIED','UNKNOWN')),
      first_source text, first_medium text, first_campaign text, first_content text, first_referrer_origin text,
      last_non_direct_source text, last_non_direct_medium text, last_non_direct_campaign text, last_non_direct_content text,
      started_at timestamptz not null, last_seen_at timestamptz not null, resulting_order_id uuid references orders.orders(id),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      primary key(organization_id,session_id)
    );
    create index storefront_sessions_period on analytics.storefront_sessions(organization_id,started_at desc,session_id);
    create index storefront_sessions_order on analytics.storefront_sessions(organization_id,resulting_order_id) where resulting_order_id is not null;

    create table analytics.storefront_events (
      organization_id uuid not null references platform.organizations(id), event_id uuid not null, schema_version integer not null,
      event_name text not null check(event_name in ('PRODUCT_VIEWED','PRODUCT_LIST_VIEWED','PRODUCT_SELECTED','VARIANT_SELECTED','SIZE_GUIDE_OPENED','ADD_TO_CART','REMOVE_FROM_CART','VIEW_CART','BEGIN_CHECKOUT','ADD_SHIPPING_INFO','ADD_PAYMENT_INFO','ORDER_PLACED','PAYMENT_CONFIRMED','ORDER_DELIVERED','ORDER_CANCELLED','REFUND_COMPLETED')),
      origin text not null check(origin in ('BROWSER','SERVER')), session_id uuid, anonymous_id uuid, order_id uuid references orders.orders(id),
      product_id uuid, variant_id uuid, cart_id text, currency_code text, monetary_value numeric(20,4), item_count integer,
      source text, medium text, campaign text, content text, referrer_origin text, touch text check(touch is null or touch in ('FIRST','SESSION','LAST_NON_DIRECT')),
      analytics_consent text not null check(analytics_consent in ('GRANTED','DENIED','UNKNOWN')),
      marketing_consent text not null check(marketing_consent in ('GRANTED','DENIED','UNKNOWN')),
      payload jsonb not null check(jsonb_typeof(payload)='object'), occurred_at timestamptz not null, received_at timestamptz not null default now(),
      primary key(organization_id,event_id),
      foreign key(organization_id,session_id) references analytics.storefront_sessions(organization_id,session_id) on delete restrict
    );
    create index storefront_events_funnel on analytics.storefront_events(organization_id,event_name,occurred_at desc);
    create index storefront_events_product on analytics.storefront_events(organization_id,product_id,event_name,occurred_at desc) where product_id is not null;
    create index storefront_events_campaign on analytics.storefront_events(organization_id,campaign,occurred_at desc) where campaign is not null;
    create index storefront_events_order on analytics.storefront_events(organization_id,order_id) where order_id is not null;

    create table analytics.projection_state (
      organization_id uuid not null references platform.organizations(id), projection_name text not null, projection_version integer not null,
      status text not null check(status in ('CURRENT','LAGGING','REBUILDING','FAILED')), source_high_watermark bigint,
      last_event_occurred_at timestamptz, last_processed_at timestamptz, last_success_at timestamptz, last_failure_at timestamptz,
      last_error_code text, last_error_detail text, primary key(organization_id,projection_name)
    );

    create table analytics.report_exports (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), requested_by_actor_id uuid not null,
      report_key text not null, parameters jsonb not null check(jsonb_typeof(parameters)='object'), status text not null default 'QUEUED' check(status in ('QUEUED','PROCESSING','READY','FAILED','EXPIRED')),
      lease_owner text, lease_expires_at timestamptz, row_count bigint, content_type text, file_name text, payload text,
      error_code text, created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, expires_at timestamptz,
      version bigint not null default 1
    );
    create index report_exports_queue on analytics.report_exports(status,created_at,id) where status in ('QUEUED','PROCESSING');
    create index report_exports_organization on analytics.report_exports(organization_id,created_at desc,id desc);

    insert into analytics.metric_definitions(metric_key,semantic_version,display_name,description,grain,time_basis,currency_treatment,included_states,source_domains,calculation_semantics) values
      ('REFUNDS_BY_REFUND_DATE',1,'Refunds by refund date','Completed refunds attributed to their completed date, not the original Order date.','REFUND','REFUND_COMPLETED','GROUP_BY_CURRENCY','["COMPLETED"]','{payments}','sum completed Refund facts grouped by refund currency and completed_at'),
      ('ORDER_COHORT_REFUNDS',1,'Order cohort refunds','Completed refunds attributed separately to the original Order cohort.','ORDER','ORDER_COMMITTED','GROUP_BY_CURRENCY','["COMPLETED"]','{orders,payments}','sum completed Refund facts joined to Order local date'),
      ('RETURN_COGS_RECOVERY',1,'Return COGS recovery','Authoritative append-only Costing recovery on reverse receipt.','RETURN_RECEIPT','RETURN_RECEIVED','GROUP_BY_CURRENCY','["POSTED"]','{returns,costing}','sum Costing cogs_recoveries; Analytics never reruns FIFO'),
      ('DELIVERY_SUCCESS_RATE',1,'Delivery success rate','Delivered outcomes divided by terminal Delivery outcomes.','DELIVERY','DELIVERY_OUTCOME','SINGLE_CURRENCY','["DELIVERED","FAILED","CANCELLED","LOST","DAMAGED"]','{delivery}','delivered terminal deliveries / all terminal deliveries'),
      ('CUSTOMER_LIFETIME_NET',1,'Customer lifetime net sales','Order net snapshots grouped by canonical merged Customer identity.','CUSTOMER','ORDER_COMMITTED','GROUP_BY_CURRENCY','["PENDING","CONFIRMED","COMPLETED"]','{customers,orders}','sum Order net snapshots after canonical Customer alias resolution')
      on conflict do nothing;

    insert into analytics.metric_definitions(metric_key,semantic_version,display_name,description,grain,time_basis,currency_treatment,included_states,source_domains,calculation_semantics) values
      ('ORDERS_PLACED',1,'Orders placed','Orders durably created, including orders later cancelled.','ORDER','ORDER_CREATED','SINGLE_CURRENCY','["PENDING","CONFIRMED","ON_HOLD","COMPLETED","CANCELLED"]','{orders}','count distinct source_order_id by order_at'),
      ('ORDERS_CONFIRMED',1,'Orders confirmed','Orders that reached confirmed state; excludes cancelled and pending orders.','ORDER','ORDER_CONFIRMED','SINGLE_CURRENCY','["CONFIRMED","COMPLETED"]','{orders}','count distinct source_order_id with confirmed_at in the reporting period'),
      ('ORDERS_CANCELLED',1,'Orders cancelled','Orders cancelled by their cancellation business time.','ORDER','ORDER_CANCELLED','SINGLE_CURRENCY','["CANCELLED"]','{orders}','count distinct source_order_id with cancelled_at in the reporting period'),
      ('ORDER_TOTAL',1,'Order total','Authoritative Order total including merchandise after discount plus customer delivery charge.','ORDER','ORDER_CREATED','GROUP_BY_CURRENCY','["PENDING","CONFIRMED","ON_HOLD","COMPLETED"]','{orders}','sum immutable order_total_amount excluding cancelled orders'),
      ('DELIVERY_CHARGES_BILLED',1,'Customer delivery charges billed','Delivery amounts billed to customers; not courier expense.','ORDER','ORDER_CREATED','GROUP_BY_CURRENCY','["PENDING","CONFIRMED","ON_HOLD","COMPLETED"]','{orders}','sum delivery_charge_amount excluding cancelled orders'),
      ('PAYMENTS_CONFIRMED',1,'Confirmed payments','Payment amounts confirmed by Payments; distinct from sales and account cash movements.','PAYMENT','PAYMENT_CONFIRMED','GROUP_BY_CURRENCY','["CONFIRMED"]','{payments}','sum confirmed Payment facts by confirmed_at'),
      ('REFUNDS_COMPLETED',1,'Completed refunds','Refund amounts completed by Payments, attributed to refund completion time.','REFUND','REFUND_COMPLETED','GROUP_BY_CURRENCY','["COMPLETED"]','{payments}','sum completed Refund facts by completed_at'),
      ('STORE_SESSIONS',1,'Consented storefront sessions','Distinct sessions with analytics consent granted.','SESSION','SESSION_STARTED','SINGLE_CURRENCY','["GRANTED"]','{analytics}','count sessions accepted under analytics consent'),
      ('SESSION_ORDER_CONVERSION',1,'Session to order conversion','Sessions linked to an authoritative Order divided by eligible consented sessions.','SESSION','SESSION_STARTED','SINGLE_CURRENCY','["GRANTED"]','{analytics,orders}','distinct converted sessions / distinct eligible sessions; unavailable when session capture is incomplete')
      on conflict do nothing;

    insert into iam.capability_definitions(capability_code,domain,description,sensitivity) values
      ('analytics.financial.view','analytics','View financial and profitability analytics.','RESTRICTED'),
      ('analytics.export','analytics','Create and download analytics exports.','HIGH')
      on conflict do nothing;
    insert into iam.membership_capability_grants(membership_id,capability_code)
      select m.id,c.capability_code from iam.organization_memberships m cross join(values('analytics.financial.view'),('analytics.export')) c(capability_code)
      where m.membership_type='OWNER' and m.status='ACTIVE' on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Analytics reporting projections are rebuilt forward.');
}
