import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export const analyticsReportKeys = [
  'SALES',
  'ORDERS',
  'PRODUCTS',
  'CUSTOMERS',
  'INVENTORY',
  'SUPPLY',
  'PAYMENTS',
  'FINANCE',
  'DELIVERY',
  'RETURNS',
  'REVIEWS',
  'NOTIFICATIONS',
  'STOREFRONT',
  'MARKETING',
  'ASSETS',
] as const;

export type AnalyticsReportKey = (typeof analyticsReportKeys)[number];
export type AnalyticsGranularity = 'DAY' | 'WEEK' | 'MONTH';

export interface AnalyticsReportQuery {
  readonly from: string;
  readonly to: string;
  readonly granularity?: AnalyticsGranularity;
  readonly currency?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface NormalizedAnalyticsReportQuery {
  readonly from: string;
  readonly toExclusive: string;
  readonly granularity: AnalyticsGranularity;
  readonly currency?: string;
  readonly page: number;
  readonly pageSize: number;
}

export class AnalyticsQueryError extends Error {
  public readonly code = 'INVALID_ANALYTICS_QUERY';
}

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new AnalyticsQueryError(`${field} must be an ISO date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new AnalyticsQueryError(`${field} is not a valid date.`);
  return date;
}

export function normalizeAnalyticsReportQuery(
  input: AnalyticsReportQuery,
): NormalizedAnalyticsReportQuery {
  const from = parseDate(input.from, 'from');
  const to = parseDate(input.to, 'to');
  if (to < from) throw new AnalyticsQueryError('to must be on or after from.');
  const toExclusive = new Date(to);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const days = (toExclusive.valueOf() - from.valueOf()) / 86_400_000;
  if (days > 731) throw new AnalyticsQueryError('Report ranges cannot exceed 731 days.');
  const currency = input.currency?.trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency))
    throw new AnalyticsQueryError('currency must be an ISO 4217 code.');
  return {
    from: input.from,
    toExclusive: toExclusive.toISOString().slice(0, 10),
    granularity: input.granularity ?? 'DAY',
    ...(currency ? { currency } : {}),
    page: Math.max(1, input.page ?? 1),
    pageSize: Math.min(100, Math.max(1, input.pageSize ?? 25)),
  };
}

function localBucket(column: ReturnType<typeof sql.ref>, granularity: AnalyticsGranularity) {
  const unit = granularity === 'DAY' ? 'day' : granularity === 'WEEK' ? 'week' : 'month';
  return sql`date_trunc(${unit},${column})::date`;
}

function previousPeriod(query: NormalizedAnalyticsReportQuery): NormalizedAnalyticsReportQuery {
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${query.toExclusive}T00:00:00.000Z`);
  const duration = toExclusive.valueOf() - from.valueOf();
  const previousTo = new Date(from);
  const previousFrom = new Date(from.valueOf() - duration);
  return {
    ...query,
    from: previousFrom.toISOString().slice(0, 10),
    toExclusive: previousTo.toISOString().slice(0, 10),
  };
}

async function reportContext(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  report: AnalyticsReportKey,
) {
  const [organization, freshness, eventCount] = await Promise.all([
    sql<{ timezone: string }>`select timezone from platform.organizations where id=${organizationId}`.execute(
      db,
    ),
    sql<{
      status: string;
      last_processed_at: string | null;
      last_success_at: string | null;
      last_error_code: string | null;
    }>`select status,last_processed_at::text,last_success_at::text,last_error_code from analytics.projection_state where organization_id=${organizationId} and projection_name='business_facts'`.execute(
      db,
    ),
    report === 'STOREFRONT' || report === 'MARKETING'
      ? sql<{ count: string }>`select count(*)::text count from analytics.storefront_events where organization_id=${organizationId}`.execute(
          db,
        )
      : Promise.resolve({ rows: [{ count: '1' }] }),
  ]);
  const projection = freshness.rows[0];
  const behavioralRows = Number(eventCount.rows[0]?.count ?? 0);
  return {
    timezone: organization.rows[0]?.timezone ?? 'Asia/Dhaka',
    freshness: {
      status: projection?.status ?? 'NOT_BUILT',
      lastProcessedAt: projection?.last_processed_at ?? null,
      lastSuccessAt: projection?.last_success_at ?? null,
      errorCode: projection?.last_error_code ?? null,
    },
    availability:
      (report === 'STOREFRONT' || report === 'MARKETING') && behavioralRows === 0
        ? {
            status: 'NOT_TRACKED' as const,
            reason: 'No consented storefront events have been collected for this organization.',
          }
        : { status: 'AVAILABLE' as const, reason: null },
  };
}

type ReportRows = { totals: readonly unknown[]; series: readonly unknown[]; breakdown: readonly unknown[]; totalItems: number };

async function salesReport(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  query: NormalizedAnalyticsReportQuery,
): Promise<ReportRows> {
  const currency = query.currency;
  const currencyFilter = currency ? sql`and currency_code=${currency}` : sql``;
  const bucket = localBucket(sql.ref('local_order_date'), query.granularity);
  const [totals, series] = await Promise.all([
    sql`select currency_code,
      coalesce(sum(merchandise_gross_amount) filter(where order_status<>'CANCELLED'),0)::text merchandise_gross,
      coalesce(sum(discount_amount) filter(where order_status<>'CANCELLED'),0)::text discounts,
      coalesce(sum(delivery_charge_amount) filter(where order_status<>'CANCELLED'),0)::text delivery_charges,
      coalesce(sum(order_total_amount) filter(where order_status<>'CANCELLED'),0)::text order_total,
      coalesce(sum(refund_amount),0)::text refunds,
      coalesce(sum(order_total_amount-refund_amount) filter(where order_status<>'CANCELLED'),0)::text net_after_refunds,
      count(*) filter(where order_status<>'CANCELLED')::text eligible_orders
      from analytics.order_facts where organization_id=${organizationId} and local_order_date>=${query.from}::date and local_order_date<${query.toExclusive}::date ${currencyFilter}
      group by currency_code order by currency_code`.execute(db),
    sql`select ${bucket}::text period,currency_code,
      sum(order_total_amount) filter(where order_status<>'CANCELLED')::text order_total,
      sum(refund_amount)::text refunds,count(*) filter(where order_status<>'CANCELLED')::text orders
      from analytics.order_facts where organization_id=${organizationId} and local_order_date>=${query.from}::date and local_order_date<${query.toExclusive}::date ${currencyFilter}
      group by period,currency_code order by period,currency_code`.execute(db),
  ]);
  return { totals: totals.rows, series: series.rows, breakdown: [], totalItems: 0 };
}

async function ordersReport(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  query: NormalizedAnalyticsReportQuery,
): Promise<ReportRows> {
  const [status, channel, methods] = await Promise.all([
    sql`select order_status,count(*)::text orders from analytics.order_facts where organization_id=${organizationId} and local_order_date>=${query.from}::date and local_order_date<${query.toExclusive}::date group by order_status order by order_status`.execute(db),
    sql`select sales_channel,count(*)::text orders from analytics.order_facts where organization_id=${organizationId} and local_order_date>=${query.from}::date and local_order_date<${query.toExclusive}::date group by sales_channel order by orders desc`.execute(db),
    sql`select payment_method,count(*)::text orders from analytics.order_facts where organization_id=${organizationId} and local_order_date>=${query.from}::date and local_order_date<${query.toExclusive}::date group by payment_method order by orders desc`.execute(db),
  ]);
  return { totals: status.rows, series: [], breakdown: [...channel.rows, ...methods.rows], totalItems: status.rows.length };
}

async function productsReport(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  query: NormalizedAnalyticsReportQuery,
): Promise<ReportRows> {
  const offset = (query.page - 1) * query.pageSize;
  const currencyFilter = query.currency ? sql`and currency_code=${query.currency}` : sql``;
  const [rows, count] = await Promise.all([
    sql`select product_id,variant_id,sku_snapshot,product_title_snapshot,variant_title_snapshot,currency_code,
      sum(quantity)::text quantity,sum(net_amount-refund_attributed_amount)::text net_sales,
      case when count(acquisition_cost_amount)=count(*) then sum(acquisition_cost_amount)::text else null end recognized_cost,
      case when count(gross_margin_amount)=count(*) then sum(gross_margin_amount)::text else null end gross_margin,
      case when count(gross_margin_amount)=count(*) then 'AVAILABLE' else 'PARTIAL' end profitability_status
      from analytics.sales_facts where organization_id=${organizationId} and order_date>=${query.from}::date and order_date<${query.toExclusive}::date ${currencyFilter}
      group by product_id,variant_id,sku_snapshot,product_title_snapshot,variant_title_snapshot,currency_code
      order by sum(net_amount-refund_attributed_amount) desc,sku_snapshot limit ${query.pageSize} offset ${offset}`.execute(db),
    sql<{ count: string }>`select count(*)::text count from (select 1 from analytics.sales_facts where organization_id=${organizationId} and order_date>=${query.from}::date and order_date<${query.toExclusive}::date ${currencyFilter} group by product_id,variant_id,sku_snapshot,product_title_snapshot,variant_title_snapshot,currency_code) grouped`.execute(db),
  ]);
  return { totals: [], series: [], breakdown: rows.rows, totalItems: Number(count.rows[0]?.count ?? 0) };
}

async function customersReport(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  query: NormalizedAnalyticsReportQuery,
): Promise<ReportRows> {
  const offset = (query.page - 1) * query.pageSize;
  const rows = await sql`with eligible as (
    select canonical_customer_id,currency_code,count(*) orders,sum(order_total_amount-refund_amount) net_sales,min(order_at) first_order_at,max(order_at) last_order_at
    from analytics.order_facts where organization_id=${organizationId} and canonical_customer_id is not null and order_status<>'CANCELLED'
      and local_order_date>=${query.from}::date and local_order_date<${query.toExclusive}::date
    group by canonical_customer_id,currency_code
  ) select eligible.canonical_customer_id,customer.display_name,eligible.currency_code,eligible.orders::text,eligible.net_sales::text,
    eligible.first_order_at::text,eligible.last_order_at::text,(eligible.orders>1) returning_customer
    from eligible join customers.customers customer on customer.id=eligible.canonical_customer_id
    order by eligible.net_sales desc limit ${query.pageSize} offset ${offset}`.execute(db);
  const count = await sql<{ count: string }>`select count(distinct canonical_customer_id)::text count from analytics.order_facts where organization_id=${organizationId} and canonical_customer_id is not null and order_status<>'CANCELLED' and local_order_date>=${query.from}::date and local_order_date<${query.toExclusive}::date`.execute(db);
  return { totals: [], series: [], breakdown: rows.rows, totalItems: Number(count.rows[0]?.count ?? 0) };
}

async function operationalReport(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  report: Exclude<AnalyticsReportKey, 'SALES' | 'ORDERS' | 'PRODUCTS' | 'CUSTOMERS'>,
  query: NormalizedAnalyticsReportQuery,
): Promise<ReportRows> {
  let result;
  switch (report) {
    case 'INVENTORY':
      result = await sql`select snapshot_date::text,location.name location_name,count(*)::text sku_positions,sum(available_to_sell)::text available_to_sell,sum(reserved_quantity)::text reserved from analytics.inventory_daily_snapshots snapshot join warehouse.locations location on location.id=snapshot.location_id where snapshot.organization_id=${organizationId} and snapshot_date>=${query.from}::date and snapshot_date<${query.toExclusive}::date group by snapshot_date,location.name order by snapshot_date desc,location.name`.execute(db);
      break;
    case 'SUPPLY':
      result = await sql`select supplier.id supplier_id,supplier.name supplier_name,purchase.currency_code,count(distinct purchase.id)::text purchases,sum(line.quantity)::text units,sum(line.quantity*line.unit_price)::text purchase_value from procurement.purchases purchase join procurement.suppliers supplier on supplier.id=purchase.supplier_id left join procurement.purchase_lines line on line.purchase_id=purchase.id where purchase.organization_id=${organizationId} and purchase.created_at>=${query.from}::date and purchase.created_at<${query.toExclusive}::date group by supplier.id,supplier.name,purchase.currency_code order by sum(line.quantity*line.unit_price) desc nulls last`.execute(db);
      break;
    case 'PAYMENTS':
      result = await sql`select fact_type,status,currency_code,count(*)::text records,coalesce(sum(amount),0)::text amount from analytics.payment_facts where organization_id=${organizationId} and occurred_at>=${query.from}::date and occurred_at<${query.toExclusive}::date group by fact_type,status,currency_code order by fact_type,status,currency_code`.execute(db);
      break;
    case 'FINANCE':
      result = await sql`select transaction_type,currency_code,count(distinct finance_transaction_id)::text transactions,sum(amount_delta)::text account_movement from analytics.cash_facts where organization_id=${organizationId} and occurred_at>=${query.from}::date and occurred_at<${query.toExclusive}::date group by transaction_type,currency_code order by transaction_type,currency_code`.execute(db);
      break;
    case 'DELIVERY':
      result = await sql`select outcome_status,count(*)::text deliveries,sum(attempt_count)::text attempts,sum(delivered_quantity)::text delivered_quantity,sum(failed_quantity)::text failed_quantity,avg(extract(epoch from(delivered_at-ready_at))/3600)::numeric(20,2)::text average_delivery_hours from analytics.delivery_facts where organization_id=${organizationId} and ready_at>=${query.from}::date and ready_at<${query.toExclusive}::date group by outcome_status order by outcome_status`.execute(db);
      break;
    case 'RETURNS':
      result = await sql`select case_type,case_status,receipt_status,commercial_resolution_status,currency_code,count(*)::text cases,sum(requested_quantity)::text requested_quantity,sum(received_quantity)::text received_quantity,sum(refund_amount)::text refunds from analytics.return_facts where organization_id=${organizationId} and created_at>=${query.from}::date and created_at<${query.toExclusive}::date group by case_type,case_status,receipt_status,commercial_resolution_status,currency_code order by case_type,case_status`.execute(db);
      break;
    case 'REVIEWS':
      result = await sql`select review.visibility_status,revision.moderation_status,revision.rating,count(*)::text reviews from reviews.reviews review join reviews.review_revisions revision on revision.id=review.published_revision_id where review.organization_id=${organizationId} and review.created_at>=${query.from}::date and review.created_at<${query.toExclusive}::date group by review.visibility_status,revision.moderation_status,revision.rating order by revision.rating desc`.execute(db);
      break;
    case 'NOTIFICATIONS':
      result = await sql`select channel,status,provider,count(*)::text notifications from notifications.notifications where organization_id=${organizationId} and created_at>=${query.from}::date and created_at<${query.toExclusive}::date group by channel,status,provider order by channel,status,provider`.execute(db);
      break;
    case 'STOREFRONT':
      result = await sql`with eligible as (
        select session_id,event_name from analytics.storefront_events where organization_id=${organizationId} and analytics_consent='GRANTED' and occurred_at>=${query.from}::date and occurred_at<${query.toExclusive}::date
      ), funnel as (
        select count(distinct session_id)::numeric eligible_sessions,
          count(distinct session_id) filter(where event_name='PRODUCT_VIEWED')::numeric product_view_sessions,
          count(distinct session_id) filter(where event_name='ADD_TO_CART')::numeric cart_sessions,
          count(distinct session_id) filter(where event_name='BEGIN_CHECKOUT')::numeric checkout_sessions,
          count(distinct session_id) filter(where event_name='ORDER_PLACED')::numeric observed_order_sessions from eligible
      ) select eligible_sessions::text,product_view_sessions::text,cart_sessions::text,checkout_sessions::text,observed_order_sessions::text,
        case when product_view_sessions=0 then null else round(cart_sessions/product_view_sessions,4)::text end product_view_to_cart_rate,
        case when cart_sessions=0 then null else round(checkout_sessions/cart_sessions,4)::text end cart_to_checkout_rate,
        case when checkout_sessions=0 then null else round(observed_order_sessions/checkout_sessions,4)::text end checkout_completion_rate,
        case when eligible_sessions=0 then null else round(observed_order_sessions/eligible_sessions,4)::text end observed_session_conversion_rate
      from funnel`.execute(db);
      break;
    case 'MARKETING':
      result = await sql`select coalesce(source,'DIRECT_OR_UNKNOWN') source,coalesce(medium,'UNKNOWN') medium,coalesce(campaign,'UNATTRIBUTED') campaign,count(distinct session_id)::text sessions,count(*) filter(where event_name='ORDER_PLACED')::text observed_orders from analytics.storefront_events where organization_id=${organizationId} and analytics_consent='GRANTED' and occurred_at>=${query.from}::date and occurred_at<${query.toExclusive}::date group by source,medium,campaign order by count(distinct session_id) desc`.execute(db);
      break;
    case 'ASSETS':
      result = await sql`select status,condition,currency_code,count(*)::text assets,case when count(acquisition_cost)=count(*) then sum(acquisition_cost)::text else null end acquisition_cost,case when count(acquisition_cost)=count(*) then 'AVAILABLE' else 'PARTIAL' end valuation_status from assets.assets where organization_id=${organizationId} and acquisition_date>=${query.from}::date and acquisition_date<${query.toExclusive}::date group by status,condition,currency_code order by status,condition,currency_code`.execute(db);
      break;
  }
  return { totals: result.rows, series: [], breakdown: [], totalItems: result.rows.length };
}

export async function getAnalyticsReport(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  report: AnalyticsReportKey,
  input: AnalyticsReportQuery,
) {
  const query = normalizeAnalyticsReportQuery(input);
  const context = await reportContext(db, organizationId, report);
  const run = async (period: NormalizedAnalyticsReportQuery) =>
    report === 'SALES'
      ? await salesReport(db, organizationId, period)
      : report === 'ORDERS'
        ? await ordersReport(db, organizationId, period)
        : report === 'PRODUCTS'
          ? await productsReport(db, organizationId, period)
          : report === 'CUSTOMERS'
            ? await customersReport(db, organizationId, period)
            : await operationalReport(db, organizationId, report, period);
  const comparisonQuery = previousPeriod(query);
  const [rows, comparison] = await Promise.all([run(query), run(comparisonQuery)]);
  return {
    report,
    query: { ...query, timezone: context.timezone, boundary: '[from,to)' },
    freshness: context.freshness,
    availability: context.availability,
    completeness: {
      isPartialPeriod: query.toExclusive > new Date().toISOString().slice(0, 10),
      historicalBehavioralDataExistsOnlyAfterCollectionStarted:
        report === 'STOREFRONT' || report === 'MARKETING',
    },
    totals: rows.totals,
    series: rows.series,
    breakdown: rows.breakdown,
    comparison: {
      from: comparisonQuery.from,
      toExclusive: comparisonQuery.toExclusive,
      totals: comparison.totals,
    },
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: rows.totalItems,
      totalPages: Math.ceil(rows.totalItems / query.pageSize),
    },
  };
}

export async function listMetricCatalog(db: Kysely<DatabaseSchema>) {
  return (
    await sql`select metric_key,semantic_version,display_name,description,grain,time_basis,currency_treatment,included_states,source_domains,calculation_semantics,status from analytics.metric_definitions order by metric_key,semantic_version desc`.execute(
      db,
    )
  ).rows;
}
