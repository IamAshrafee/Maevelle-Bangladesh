import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';

export class AnalyticsDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'VALIDATION_FAILED',
    message: string,
  ) {
    super(message);
  }
}

export type AnalyticsOverview = {
  readonly metrics: readonly {
    readonly currencyCode: string;
    readonly grossSales: string;
    readonly discounts: string;
    readonly netSales: string;
    readonly recognizedCost: string | null;
    readonly grossMargin: string | null;
    readonly orderLines: string;
  }[];
  readonly refreshedAt: string | null;
};

/**
 * Rebuilds reporting projections from committed Order lines and recognized COGS.
 * It deliberately does not change any transactional source record.
 */
export async function rebuildSalesFacts(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<{ readonly inserted: number }> {
  return db.transaction().execute(async (tx) => {
    const run = await sql<{
      id: string;
    }>`insert into analytics.analytics_refresh_runs(organization_id,projection_name,status) values(${organizationId},'sales_facts','RUNNING') returning id::text`.execute(
      tx,
    );
    const runId = run.rows[0]?.id;
    if (!runId) throw new Error('Analytics refresh run was not created.');
    try {
      await sql`delete from analytics.sales_facts where organization_id=${organizationId}`.execute(
        tx,
      );
      const inserted = await sql<{ count: string }>`
        with cost_effects as (
          select fulfillment_line.order_line_id,recognition.total_cost * (assignment_line.quantity / nullif(fulfillment_line.quantity, 0)) amount
          from costing.cogs_recognitions recognition join costing.outbound_cost_assignments assignment on assignment.id=recognition.outbound_cost_assignment_id join costing.outbound_cost_assignment_lines assignment_line on assignment_line.outbound_cost_assignment_id=assignment.id join fulfillment.fulfillment_lines fulfillment_line on fulfillment_line.id=assignment_line.fulfillment_line_id
          where recognition.organization_id=${organizationId} and recognition.recognition_kind='ORIGINAL'
          union all
          select fulfillment_line.order_line_id,adjustment.amount * (assignment_line.quantity / nullif(fulfillment_line.quantity, 0))
          from costing.cogs_adjustments adjustment join costing.cogs_recognitions recognition on recognition.id=adjustment.cogs_recognition_id join costing.outbound_cost_assignment_lines assignment_line on assignment_line.outbound_cost_assignment_id=recognition.outbound_cost_assignment_id join fulfillment.fulfillment_lines fulfillment_line on fulfillment_line.id=assignment_line.fulfillment_line_id
          where adjustment.organization_id=${organizationId}
          union all
          select fulfillment_line.order_line_id,-recovery.total_cost * (assignment_line.quantity / nullif(fulfillment_line.quantity, 0))
          from costing.cogs_recoveries recovery join costing.outbound_cost_assignment_lines assignment_line on assignment_line.outbound_cost_assignment_id=recovery.outbound_cost_assignment_id join fulfillment.fulfillment_lines fulfillment_line on fulfillment_line.id=assignment_line.fulfillment_line_id
          where recovery.organization_id=${organizationId}
        ), recognized_cost as (
          select order_line_id,sum(amount)::numeric amount from cost_effects group by order_line_id
        )
        insert into analytics.sales_facts(
          organization_id,source_order_line_id,order_id,customer_id,product_id,variant_id,order_date,committed_at,currency_code,quantity,gross_amount,discount_amount,net_amount,acquisition_cost_amount,gross_margin_amount
        )
        select line.organization_id,line.id,ord.id,ord.customer_id,line.product_id,line.variant_id,
               (ord.created_at at time zone organization.timezone)::date,ord.created_at,ord.currency_code,line.quantity,line.gross_amount,line.discount_amount,line.net_amount,
               cost.amount,case when cost.amount is null then null else line.net_amount-cost.amount end
        from orders.order_lines line
        join orders.orders ord on ord.id=line.order_id and ord.organization_id=line.organization_id
        join platform.organizations organization on organization.id=ord.organization_id
        left join recognized_cost cost on cost.order_line_id=line.id
        where line.organization_id=${organizationId} and ord.order_status <> 'CANCELLED'
        returning 1
      `.execute(tx);
      await sql`update analytics.sales_facts fact set refund_attributed_amount=refund.amount * (fact.net_amount/nullif(summary.net_amount,0)),gross_margin_amount=case when fact.acquisition_cost_amount is null then null else fact.net_amount-(refund.amount * (fact.net_amount/nullif(summary.net_amount,0)))-fact.acquisition_cost_amount end from (select order_id,sum(net_amount) net_amount from analytics.sales_facts where organization_id=${organizationId} group by order_id) summary join (select order_id,sum(amount) amount from payments.refunds where organization_id=${organizationId} and status='COMPLETED' group by order_id) refund on refund.order_id=summary.order_id where fact.organization_id=${organizationId} and fact.order_id=summary.order_id`.execute(
        tx,
      );
      await sql`update analytics.analytics_refresh_runs set status='SUCCEEDED',completed_at=now(),source_high_watermark=(select coalesce(max(id),0) from analytics.sales_facts where organization_id=${organizationId}) where id=${runId}::uuid`.execute(
        tx,
      );
      return { inserted: inserted.rows.length };
    } catch (error) {
      await sql`update analytics.analytics_refresh_runs set status='FAILED',completed_at=now(),error_code='REBUILD_FAILED' where id=${runId}::uuid`.execute(
        tx,
      );
      throw error;
    }
  });
}

export async function captureInventoryDailySnapshot(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  snapshotDate = new Date().toISOString().slice(0, 10),
): Promise<{ readonly rows: number }> {
  const result = await sql<{ inventory_item_id: string }>`
    insert into analytics.inventory_daily_snapshots(organization_id,snapshot_date,inventory_item_id,location_id,sellable_quantity,unavailable_quantity,reserved_quantity,available_to_sell)
    select item.organization_id,${snapshotDate}::date,item.id,level.location_id,
           level.sellable_quantity,level.unavailable_quantity,level.reserved_quantity,
           level.sellable_quantity-level.reserved_quantity
    from inventory.inventory_items item
    join inventory.inventory_levels level on level.inventory_item_id=item.id and level.organization_id=item.organization_id
    where item.organization_id=${organizationId}
    on conflict(organization_id,snapshot_date,inventory_item_id,location_id) do update set sellable_quantity=excluded.sellable_quantity,unavailable_quantity=excluded.unavailable_quantity,reserved_quantity=excluded.reserved_quantity,available_to_sell=excluded.available_to_sell
    returning inventory_item_id::text
  `.execute(db);
  return { rows: result.rows.length };
}

export async function getAnalyticsOverview(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<AnalyticsOverview> {
  const [metrics, refresh] = await Promise.all([
    sql<AnalyticsOverview['metrics'][number]>`
      select currency_code as "currencyCode",
        coalesce(sum(gross_amount),0)::text as "grossSales",
        coalesce(sum(discount_amount),0)::text as discounts,
        coalesce(sum(net_amount),0)::text as "netSales",
        case when count(acquisition_cost_amount)=0 then null else coalesce(sum(acquisition_cost_amount),0)::text end as "recognizedCost",
        case when count(gross_margin_amount)=0 then null else coalesce(sum(gross_margin_amount),0)::text end as "grossMargin",
        count(*)::text as "orderLines"
      from analytics.sales_facts where organization_id=${organizationId}
      group by currency_code order by currency_code
    `.execute(db),
    sql<{
      completed_at: string | null;
    }>`select completed_at::text from analytics.analytics_refresh_runs where organization_id=${organizationId} and projection_name='sales_facts' and status='SUCCEEDED' order by completed_at desc nulls last limit 1`.execute(
      db,
    ),
  ]);
  return { metrics: metrics.rows, refreshedAt: refresh.rows[0]?.completed_at ?? null };
}

export async function listInventorySnapshots(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql<{
      snapshot_date: string;
      sku: string;
      location_name: string;
      sellable_quantity: string;
      reserved_quantity: string;
      available_to_sell: string;
    }>`select snapshot.snapshot_date::text,coalesce(variant.sku,'Unlinked') as sku,location.name as location_name,snapshot.sellable_quantity::text,snapshot.reserved_quantity::text,snapshot.available_to_sell::text from analytics.inventory_daily_snapshots snapshot join inventory.inventory_items item on item.id=snapshot.inventory_item_id left join catalog.product_variants variant on variant.id=item.variant_id join warehouse.locations location on location.id=snapshot.location_id where snapshot.organization_id=${organizationId} order by snapshot.snapshot_date desc,sku`.execute(
      db,
    )
  ).rows;
}

/** Rebuilds every implemented fact family without mutating authoritative domains. */
export async function rebuildAnalyticsProjections(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
) {
  const salesFacts = await rebuildSalesFacts(db, organizationId);
  const counts = await db.transaction().execute(async (tx) => {
    await sql`delete from analytics.customer_facts where organization_id=${organizationId}`.execute(
      tx,
    );
    await sql`delete from analytics.delivery_facts where organization_id=${organizationId}`.execute(
      tx,
    );
    await sql`delete from analytics.return_facts where organization_id=${organizationId}`.execute(
      tx,
    );
    await sql`delete from analytics.payment_facts where organization_id=${organizationId}`.execute(
      tx,
    );
    await sql`delete from analytics.cost_facts where organization_id=${organizationId}`.execute(tx);
    await sql`delete from analytics.cash_facts where organization_id=${organizationId}`.execute(tx);
    await sql`delete from analytics.order_facts where organization_id=${organizationId}`.execute(
      tx,
    );
    const orders = await sql<{
      id: string;
    }>`insert into analytics.order_facts(organization_id,source_order_id,canonical_customer_id,order_number,order_status,source,currency_code,gross_amount,discount_amount,net_amount,refund_amount,order_at,local_order_date) select o.organization_id,o.id,coalesce(alias.canonical_customer_id,o.customer_id),o.order_number,o.order_status,o.source,o.currency_code,o.subtotal_amount,o.discount_amount,o.total_amount,coalesce(refund.amount,0),o.created_at,(o.created_at at time zone organization.timezone)::date from orders.orders o join platform.organizations organization on organization.id=o.organization_id left join customers.customer_aliases alias on alias.organization_id=o.organization_id and alias.alias_customer_id=o.customer_id left join (select order_id,sum(amount) amount from payments.refunds where organization_id=${organizationId} and status='COMPLETED' group by order_id) refund on refund.order_id=o.id where o.organization_id=${organizationId} returning source_order_id::text id`.execute(
      tx,
    );
    await sql`insert into analytics.customer_facts(organization_id,canonical_customer_id,order_count,currency_code,lifetime_net_amount,first_order_at,last_order_at) select organization_id,canonical_customer_id,count(*),currency_code,sum(net_amount-refund_amount),min(order_at),max(order_at) from analytics.order_facts where organization_id=${organizationId} and canonical_customer_id is not null group by organization_id,canonical_customer_id,currency_code`.execute(
      tx,
    );
    const deliveries = await sql<{
      id: string;
    }>`insert into analytics.delivery_facts(organization_id,source_delivery_id,order_id,fulfillment_id,operational_status,outcome_status,attempt_count,delivered_quantity,failed_quantity,ready_at,delivered_at,failed_at) select d.organization_id,d.id,d.order_id,d.fulfillment_id,d.operational_status,d.outcome_status,(select count(*) from delivery.delivery_attempts a where a.delivery_id=d.id),coalesce((select sum(l.delivered_quantity) from delivery.delivery_lines l where l.delivery_id=d.id),0),coalesce((select sum(l.failed_quantity) from delivery.delivery_lines l where l.delivery_id=d.id),0),d.ready_at,d.delivered_at,d.failed_at from delivery.deliveries d where d.organization_id=${organizationId} returning source_delivery_id::text id`.execute(
      tx,
    );
    const returns = await sql<{
      id: string;
    }>`insert into analytics.return_facts(organization_id,source_return_id,order_id,case_type,case_status,receipt_status,commercial_resolution_status,requested_quantity,received_quantity,refund_amount,currency_code,created_at) select r.organization_id,r.id,r.order_id,r.case_type,r.case_status,r.receipt_status,r.commercial_resolution_status,coalesce(sum(line.requested_quantity),0),coalesce(sum(line.received_quantity),0),coalesce(refund.amount,0),refund.currency_code,r.created_at from returns.return_cases r left join returns.return_lines line on line.return_case_id=r.id left join (select link.return_case_id,sum(p.amount) amount,min(p.currency_code) currency_code from returns.return_refund_links link join payments.refunds p on p.id=link.refund_id and p.status='COMPLETED' group by link.return_case_id) refund on refund.return_case_id=r.id where r.organization_id=${organizationId} group by r.id,refund.amount,refund.currency_code returning source_return_id::text id`.execute(
      tx,
    );
    const paymentAttempts = await sql<{
      id: string;
    }>`insert into analytics.payment_facts(organization_id,fact_type,source_id,order_id,status,currency_code,amount,occurred_at) select a.organization_id,'ATTEMPT',a.id,i.order_id,a.status,i.currency_code,a.claimed_amount,a.submitted_at from payments.payment_attempts a join payments.payment_intents i on i.id=a.payment_intent_id where a.organization_id=${organizationId} returning source_id::text id`.execute(
      tx,
    );
    const payments = await sql<{
      id: string;
    }>`insert into analytics.payment_facts(organization_id,fact_type,source_id,order_id,status,currency_code,amount,occurred_at) select p.organization_id,'PAYMENT',p.id,allocation.order_id,p.status,p.currency_code,p.amount,p.confirmed_at from payments.payments p left join lateral(select min(a.order_id::text)::uuid order_id from payments.payment_allocations a where a.payment_id=p.id) allocation on true where p.organization_id=${organizationId} returning source_id::text id`.execute(
      tx,
    );
    const refunds = await sql<{
      id: string;
    }>`insert into analytics.payment_facts(organization_id,fact_type,source_id,order_id,status,currency_code,amount,occurred_at) select organization_id,'REFUND',id,order_id,status,currency_code,amount,coalesce(completed_at,requested_at) from payments.refunds where organization_id=${organizationId} returning source_id::text id`.execute(
      tx,
    );
    const costs = await sql<{
      id: string;
    }>`insert into analytics.cost_facts(organization_id,fact_type,source_id,outbound_assignment_id,amount,currency_code,occurred_at) select organization_id,'COGS',id,outbound_cost_assignment_id,total_cost,currency_code,created_at from costing.cogs_recognitions where organization_id=${organizationId} union all select adjustment.organization_id,'COGS_ADJUSTMENT',adjustment.id,recognition.outbound_cost_assignment_id,adjustment.amount,recognition.currency_code,adjustment.created_at from costing.cogs_adjustments adjustment join costing.cogs_recognitions recognition on recognition.id=adjustment.cogs_recognition_id where adjustment.organization_id=${organizationId} union all select organization_id,'RETURN_RECOVERY',id,outbound_cost_assignment_id,-total_cost,currency_code,created_at from costing.cogs_recoveries where organization_id=${organizationId} returning source_id::text id`.execute(
      tx,
    );
    const cash = await sql<{
      id: string;
    }>`insert into analytics.cash_facts(organization_id,source_entry_id,finance_transaction_id,account_id,transaction_type,currency_code,amount_delta,occurred_at) select entry.organization_id,entry.id,entry.finance_transaction_id,entry.financial_account_id,transaction.transaction_type,entry.currency_code,entry.amount_delta,transaction.occurred_at from finance.financial_account_entries entry join finance.finance_transactions transaction on transaction.id=entry.finance_transaction_id where entry.organization_id=${organizationId} returning source_entry_id::text id`.execute(
      tx,
    );
    return {
      orders: orders.rows.length,
      deliveries: deliveries.rows.length,
      returns: returns.rows.length,
      payments: paymentAttempts.rows.length + payments.rows.length + refunds.rows.length,
      costs: costs.rows.length,
      cash: cash.rows.length,
    };
  });
  return { salesFacts: salesFacts.inserted, ...counts };
}

export async function consumeAnalyticsOutbox(db: Kysely<DatabaseSchema>, outboxEventId: number) {
  const claimed = await sql<{
    organization_id: string;
  }>`insert into analytics.projection_event_receipts(outbox_event_id,projection_name,organization_id) select id,'all_facts_v1',organization_id from platform.outbox_events where id=${outboxEventId} and organization_id is not null on conflict do nothing returning organization_id`.execute(
    db,
  );
  const organizationId = claimed.rows[0]?.organization_id;
  if (!organizationId) return { processed: false };
  try {
    await rebuildAnalyticsProjections(db, organizationId);
    return { processed: true };
  } catch (error) {
    await sql`delete from analytics.projection_event_receipts where outbox_event_id=${outboxEventId} and projection_name='all_facts_v1'`.execute(
      db,
    );
    throw error;
  }
}

export async function processAnalyticsOutbox(db: Kysely<DatabaseSchema>, limit = 10) {
  const events = await sql<{
    id: string;
  }>`select event.id::text from platform.outbox_events event left join analytics.projection_event_receipts receipt on receipt.outbox_event_id=event.id and receipt.projection_name='all_facts_v1' where event.organization_id is not null and receipt.outbox_event_id is null order by event.id limit ${limit}`.execute(
    db,
  );
  let processed = 0;
  for (const event of events.rows) {
    if ((await consumeAnalyticsOutbox(db, Number(event.id))).processed) processed++;
  }
  return processed;
}

export async function getAnalyticsDashboards(db: Kysely<DatabaseSchema>, organizationId: string) {
  const [sales, products, customers, deliveryReturns, finance, metrics] = await Promise.all([
    sql`select currency_code,sum(gross_amount)::text gross_sales,sum(discount_amount)::text discounts,sum(net_amount-refund_amount)::text net_sales,sum(refund_amount)::text refunds from analytics.order_facts where organization_id=${organizationId} group by currency_code order by currency_code`.execute(
      db,
    ),
    sql`select coalesce(variant.sku,fact.source_order_line_id::text) sku,sum(fact.quantity)::text quantity,sum(fact.net_amount)::text net_sales,fact.currency_code from analytics.sales_facts fact left join catalog.product_variants variant on variant.id=fact.variant_id where fact.organization_id=${organizationId} group by coalesce(variant.sku,fact.source_order_line_id::text),fact.currency_code order by sum(fact.net_amount) desc limit 50`.execute(
      db,
    ),
    sql`select fact.canonical_customer_id,customer.display_name,fact.order_count::text,fact.lifetime_net_amount::text,fact.currency_code from analytics.customer_facts fact join customers.customers customer on customer.id=fact.canonical_customer_id where fact.organization_id=${organizationId} order by fact.lifetime_net_amount desc limit 50`.execute(
      db,
    ),
    sql`select (select count(*) from analytics.delivery_facts where organization_id=${organizationId} and outcome_status='DELIVERED')::text delivered,(select count(*) from analytics.delivery_facts where organization_id=${organizationId} and outcome_status='FAILED')::text failed,(select count(*) from analytics.return_facts where organization_id=${organizationId} and case_type='CUSTOMER_RETURN')::text customer_returns,(select count(*) from analytics.return_facts where organization_id=${organizationId} and case_type='RTO')::text rto`.execute(
      db,
    ),
    sql`select currency_code,sum(amount_delta)::text collected_cash from analytics.cash_facts where organization_id=${organizationId} group by currency_code order by currency_code`.execute(
      db,
    ),
    sql`select metric_key,semantic_version,display_name,description,grain,time_basis,currency_treatment,source_domains,calculation_semantics from analytics.metric_definitions where status='ACTIVE' order by metric_key,semantic_version desc`.execute(
      db,
    ),
  ]);
  return {
    overview: sales.rows,
    sales: sales.rows,
    products: products.rows,
    customers: customers.rows,
    deliveryReturns: deliveryReturns.rows[0] ?? {},
    finance: finance.rows,
    metricCatalog: metrics.rows,
  };
}

export async function analyticsDrilldown(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  metric: 'GROSS_SALES' | 'NET_SALES' | 'REFUNDS' | 'GROSS_MARGIN' | 'CASH' | 'INVENTORY',
) {
  if (metric === 'CASH')
    return (
      await sql`select source_entry_id,transaction_type,currency_code,amount_delta::text,occurred_at::text from analytics.cash_facts where organization_id=${organizationId} order by occurred_at desc limit 200`.execute(
        db,
      )
    ).rows;
  if (metric === 'INVENTORY') return listInventorySnapshots(db, organizationId);
  if (metric === 'GROSS_MARGIN')
    return (
      await sql`select source_order_line_id,order_id,currency_code,net_amount::text,acquisition_cost_amount::text,gross_margin_amount::text from analytics.sales_facts where organization_id=${organizationId} and acquisition_cost_amount is not null order by committed_at desc limit 200`.execute(
        db,
      )
    ).rows;
  return (
    await sql`select source_order_id,order_number,order_status,currency_code,gross_amount::text,discount_amount::text,net_amount::text,refund_amount::text,order_at::text from analytics.order_facts where organization_id=${organizationId} ${metric === 'REFUNDS' ? sql`and refund_amount<>0` : sql``} order by order_at desc limit 200`.execute(
      db,
    )
  ).rows;
}

/** Lightweight projection health check; source facts are always authoritative. */
export async function verifyAnalyticsIntegrity(db: Kysely<DatabaseSchema>, organizationId: string) {
  const findings: { code: string; detail: string }[] = [];
  const duplicate = await sql<{
    bad: boolean;
  }>`select exists(select source_order_line_id from analytics.sales_facts where organization_id=${organizationId} group by source_order_line_id having count(*)<>1) as bad`.execute(
    db,
  );
  if (duplicate.rows[0]?.bad)
    findings.push({
      code: 'DUPLICATE_SALES_FACT',
      detail: 'An Order line has more than one sales fact.',
    });
  const mismatch = await sql<{
    bad: boolean;
  }>`select exists(select 1 from analytics.sales_facts where organization_id=${organizationId} and net_amount<>gross_amount-discount_amount) as bad`.execute(
    db,
  );
  if (mismatch.rows[0]?.bad)
    findings.push({
      code: 'SALES_FACT_TOTAL_MISMATCH',
      detail: 'A sales fact does not reconcile.',
    });
  const checks = await sql<{ code: string; detail: string }>`
    select 'MISSING_ORDER_FACT' code,'An authoritative Order is absent from order_facts.' detail where exists(select 1 from orders.orders o where o.organization_id=${organizationId} and not exists(select 1 from analytics.order_facts f where f.organization_id=o.organization_id and f.source_order_id=o.id))
    union all select 'ORDER_FACT_SOURCE_MISMATCH','An Order projection no longer matches its immutable commercial snapshot.' where exists(select 1 from analytics.order_facts f join orders.orders o on o.id=f.source_order_id where f.organization_id=${organizationId} and (f.gross_amount<>o.subtotal_amount or f.discount_amount<>o.discount_amount or f.net_amount<>o.total_amount or f.currency_code<>o.currency_code))
    union all select 'REFUND_DOUBLE_COUNT','Projected completed refunds differ from authoritative completed Refund totals.' where exists(select 1 from (select currency_code,sum(refund_amount) amount from analytics.order_facts where organization_id=${organizationId} group by currency_code) f full join (select currency_code,sum(amount) amount from payments.refunds where organization_id=${organizationId} and status='COMPLETED' group by currency_code) r using(currency_code) where coalesce(f.amount,0)<>coalesce(r.amount,0))
    union all select 'COSTING_FACT_MISMATCH','Analytics COGS facts differ from authoritative Costing facts.' where (select count(*) from analytics.cost_facts where organization_id=${organizationId})<>(select count(*) from costing.cogs_recognitions where organization_id=${organizationId})+(select count(*) from costing.cogs_adjustments where organization_id=${organizationId})+(select count(*) from costing.cogs_recoveries where organization_id=${organizationId})
    union all select 'CUSTOMER_CANONICALIZATION_MISMATCH','A projected Order uses a noncanonical merged Customer identity.' where exists(select 1 from analytics.order_facts fact join customers.customer_aliases alias on alias.organization_id=fact.organization_id and alias.alias_customer_id=fact.canonical_customer_id where fact.organization_id=${organizationId})
  `.execute(db);
  findings.push(...checks.rows);
  return findings;
}
