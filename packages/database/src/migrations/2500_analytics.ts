import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Rebuildable reporting projections only; transactional domains remain authoritative. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists analytics;
    create table analytics.metric_definitions (
      metric_key text not null, semantic_version integer not null, display_name text not null, description text not null, grain text not null, time_basis text not null,
      currency_treatment text not null check(currency_treatment in ('GROUP_BY_CURRENCY','SINGLE_CURRENCY')), included_states jsonb not null check(jsonb_typeof(included_states)='array'), source_domains text[] not null,
      calculation_semantics text not null, status text not null default 'ACTIVE' check(status in ('ACTIVE','DEPRECATED')), created_at timestamptz not null default now(), primary key(metric_key,semantic_version)
    );
    create table analytics.sales_facts (
      id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id), source_order_line_id uuid not null unique references orders.order_lines(id), order_id uuid not null references orders.orders(id), customer_id uuid references customers.customers(id),
      product_id uuid references catalog.products(id), variant_id uuid references catalog.product_variants(id), order_date date not null, committed_at timestamptz not null, currency_code text not null, quantity numeric(20,6) not null,
      gross_amount numeric(20,4) not null, discount_amount numeric(20,4) not null, net_amount numeric(20,4) not null, refund_attributed_amount numeric(20,4) not null default 0, acquisition_cost_amount numeric(20,4), gross_margin_amount numeric(20,4), projection_version integer not null default 1, updated_at timestamptz not null default now(),
      check(net_amount=gross_amount-discount_amount), check(gross_margin_amount is null or acquisition_cost_amount is not null)
    );
    create index analytics_sales_reporting on analytics.sales_facts(organization_id,order_date,currency_code);
    create table analytics.inventory_daily_snapshots (organization_id uuid not null references platform.organizations(id), snapshot_date date not null, inventory_item_id uuid not null references inventory.inventory_items(id), location_id uuid not null references warehouse.locations(id), sellable_quantity numeric(20,6) not null, unavailable_quantity numeric(20,6) not null, reserved_quantity numeric(20,6) not null, available_to_sell numeric(20,6) not null, incoming_quantity numeric(20,6) not null default 0, in_transit_quantity numeric(20,6) not null default 0, primary key(organization_id,snapshot_date,inventory_item_id,location_id));
    create table analytics.analytics_refresh_runs (id uuid primary key default uuidv7(), organization_id uuid references platform.organizations(id), projection_name text not null, status text not null check(status in ('RUNNING','SUCCEEDED','FAILED')), started_at timestamptz not null default now(), completed_at timestamptz, source_high_watermark bigint, error_code text, unique(organization_id,projection_name,started_at));
    create table analytics.data_quality_results (id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id), check_code text not null, severity text not null, details jsonb not null default '{}'::jsonb, detected_at timestamptz not null default now());
    insert into analytics.metric_definitions(metric_key,semantic_version,display_name,description,grain,time_basis,currency_treatment,included_states,source_domains,calculation_semantics) values
      ('GROSS_SALES',1,'Gross sales','Committed Order-line gross before discounts.','ORDER_LINE','ORDER_COMMITTED','GROUP_BY_CURRENCY','["PENDING","CONFIRMED","COMPLETED"]','{orders}','sum gross_amount from sales facts'),
      ('NET_SALES',1,'Net sales','Committed Order-line net after discounts and before refunds.','ORDER_LINE','ORDER_COMMITTED','GROUP_BY_CURRENCY','["PENDING","CONFIRMED","COMPLETED"]','{orders}','sum net_amount from sales facts'),
      ('COLLECTED_CASH',1,'Collected cash','Confirmed payments; not order value.','PAYMENT','PAYMENT_CONFIRMED','GROUP_BY_CURRENCY','["CONFIRMED"]','{payments}','separate payment fact semantics'),
      ('GROSS_MARGIN',1,'Gross margin','Net sales less authoritative recognized COGS.','ORDER_LINE','DELIVERY_COMPLETED','GROUP_BY_CURRENCY','["DELIVERED"]','{orders,costing}','sales facts joined to recognized COGS') on conflict do nothing;
    insert into iam.capability_definitions(capability_code,domain,description,sensitivity) values('analytics.view','analytics','View rebuildable analytical projections.','INTERNAL'),('analytics.manage','analytics','Rebuild analytical projections.','HIGH') on conflict do nothing;
    insert into iam.membership_capability_grants(membership_id,capability_code) select m.id,c.capability_code from iam.organization_memberships m cross join(values('analytics.view'),('analytics.manage')) c(capability_code) where m.membership_type='OWNER' and m.status='ACTIVE' on conflict do nothing;
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Analytics projections are rebuilt forward, not dropped automatically.');
}
