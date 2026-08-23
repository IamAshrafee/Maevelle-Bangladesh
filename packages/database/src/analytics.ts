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
        with recognized_cost as (
          select fulfillment_line.order_line_id,
                 sum(recognition.total_cost * (assignment_line.quantity / nullif(fulfillment_line.quantity, 0)))::numeric as amount
          from costing.cogs_recognitions recognition
          join costing.outbound_cost_assignments assignment on assignment.id=recognition.outbound_cost_assignment_id
          join costing.outbound_cost_assignment_lines assignment_line on assignment_line.outbound_cost_assignment_id=assignment.id
          join fulfillment.fulfillment_lines fulfillment_line on fulfillment_line.id=assignment_line.fulfillment_line_id
          where recognition.organization_id=${organizationId} and recognition.recognition_kind='ORIGINAL'
          group by fulfillment_line.order_line_id
        )
        insert into analytics.sales_facts(
          organization_id,source_order_line_id,order_id,customer_id,product_id,variant_id,order_date,committed_at,currency_code,quantity,gross_amount,discount_amount,net_amount,acquisition_cost_amount,gross_margin_amount
        )
        select line.organization_id,line.id,ord.id,ord.customer_id,line.product_id,line.variant_id,
               ord.created_at::date,ord.created_at,ord.currency_code,line.quantity,line.gross_amount,line.discount_amount,line.net_amount,
               cost.amount,case when cost.amount is null then null else line.net_amount-cost.amount end
        from orders.order_lines line
        join orders.orders ord on ord.id=line.order_id and ord.organization_id=line.organization_id
        left join recognized_cost cost on cost.order_line_id=line.id
        where line.organization_id=${organizationId} and ord.order_status <> 'CANCELLED'
        returning 1
      `.execute(tx);
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
  return findings;
}
