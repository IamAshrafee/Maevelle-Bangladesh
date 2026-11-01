import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';
import type {
  WishlistAnalyticsQueryDto,
  WishlistAnalyticsMetadataDto,
  WishlistAnalyticsResponseDto,
  WishlistSummaryDto,
  WishlistTrendDto,
  WishlistProductInterestDto,
  WishlistCategoryInterestDto,
  WishlistSharingDto,
  WishlistOperationsDto,
  WishlistAnalyticsPageDto,
} from '@maevelle/contracts';
import { AnalyticsQueryError, normalizeAnalyticsReportQuery } from '../reporting.js';

export interface WishlistReports {
  summary: WishlistSummaryDto;
  activity: WishlistTrendDto[];
  products: WishlistAnalyticsPageDto<WishlistProductInterestDto>;
  categories: WishlistAnalyticsPageDto<WishlistCategoryInterestDto>;
  sharing: WishlistSharingDto;
  operations: WishlistOperationsDto;
}
export type WishlistReport = keyof WishlistReports;

function normalize(input: WishlistAnalyticsQueryDto) {
  const value = normalizeAnalyticsReportQuery(input);
  if ((Date.parse(value.toExclusive) - Date.parse(value.from)) / 86400000 > 90)
    throw new AnalyticsQueryError('Wishlist reports support at most 90 local days.');
  if (
    (input.page !== undefined &&
      (!Number.isInteger(input.page) || input.page < 1 || input.page > 1000)) ||
    (input.pageSize !== undefined &&
      (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100))
  )
    throw new AnalyticsQueryError('Invalid pagination.');
  return value;
}

/** All reads share one database snapshot. No owner dimensions or arbitrary filters are accepted. */
export async function getWishlistAnalytics<K extends WishlistReport>(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  report: K,
  input: WishlistAnalyticsQueryDto,
): Promise<WishlistAnalyticsResponseDto<WishlistReports[K]>> {
  const query = normalize(input);
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const org = await sql<{
        timezone: string;
        started_at: Date;
        now: Date;
      }>`select timezone,instrumentation.started_at,now() as now
      from platform.organizations cross join analytics.wishlist_instrumentation instrumentation
      where id=${organizationId}`.execute(tx);
      const settings = org.rows[0];
      if (!settings) throw new AnalyticsQueryError('Organization unavailable.');
      const timezone = settings.timezone;
      const start = sql`${query.from}::date::timestamp at time zone ${timezone}`;
      const end = sql`${query.toExclusive}::date::timestamp at time zone ${timezone}`;
      const period = sql`occurred_at>=(${start}) and occurred_at<(${end})`;
      const coverage = await sql<{
        pending: number;
        oldest: string | null;
        last: string | null;
        failed: boolean;
        complete: boolean;
      }>`
      select (select count(*)::int from platform.outbox_events e where e.organization_id=${organizationId}
        and e.aggregate_type='wishlist.analytics' and not exists(select 1 from analytics.projection_event_receipts r where r.outbox_event_id=e.id and r.projection_name='wishlist_v1')) pending,
      (select min(e.occurred_at)::text from platform.outbox_events e where e.organization_id=${organizationId}
        and e.aggregate_type='wishlist.analytics' and not exists(select 1 from analytics.projection_event_receipts r where r.outbox_event_id=e.id and r.projection_name='wishlist_v1')) oldest,
      (select last_success_at::text from analytics.projection_state where organization_id=${organizationId} and projection_name='wishlist_v1') last,
      exists(select 1 from analytics.wishlist_processing_failures where organization_id=${organizationId}) failed,
      (${start})>=${settings.started_at} and (${start})>=now()-interval '400 days' complete`.execute(
        tx,
      );
      const c = coverage.rows[0]!;
      const metadata: WishlistAnalyticsMetadataDto = {
        from: query.from,
        toExclusive: query.toExclusive,
        timezone,
        generatedAt: settings.now.toISOString(),
        instrumentationStart: settings.started_at.toISOString(),
        retainedFrom: new Date(settings.now.getTime() - 400 * 86400000).toISOString(),
        historyComplete: c.complete && c.pending === 0 && !c.failed,
        projection: c.failed ? 'FAILED' : c.pending ? 'LAGGING' : 'CURRENT',
        pendingEvents: c.pending,
        oldestPendingAt: c.oldest,
        lastProcessedAt: c.last,
        sources: {
          current: 'AUTHORITATIVE_DATABASE',
          activity: 'COMMITTED_OUTBOX',
          behavioral: 'CONSENTED_UNVERIFIED_BROWSER',
          operations: 'BEST_EFFORT_COUNTERS',
        },
        rankingMinimumLists: 3,
        observationRetainedFrom: new Date(settings.now.getTime() - 90 * 86400000).toISOString(),
        unavailable: [
          'PRE_INSTRUMENTATION_HISTORY',
          'GUEST_CURRENT_INVENTORY',
          'UNIQUE_OR_QUALIFIED_RECIPIENTS',
          'VERIFIED_SHARE_SAVE_ATTRIBUTION',
        ],
      };
      let result: WishlistReports[WishlistReport];
      if (report === 'summary') {
        const rows =
          await sql<WishlistSummaryDto>`select count(*)::int as "savedItems",count(distinct item.wishlist_id)::int as "nonemptyLists",
        count(distinct item.product_id)::int as "distinctProducts",
        (select count(*)::int from wishlist.account_lists where organization_id=${organizationId}) as lists,
        count(*) filter(where product.status='ACTIVE' and product.publication_status='PUBLISHED' and document.available=true)::int as "availableItems",
        count(*) filter(where product.status='ACTIVE' and product.publication_status='PUBLISHED' and document.available=false)::int as "outOfStockItems",
        count(*) filter(where not coalesce(product.status='ACTIVE' and product.publication_status='PUBLISHED' and document.available is not null,false))::int as "unavailableItems"
        from wishlist.account_items item
        left join catalog.products product on product.organization_id=item.organization_id and product.id=item.product_id
        left join search.catalog_documents document on document.organization_id=item.organization_id and document.product_id=item.product_id
        where item.organization_id=${organizationId}`.execute(tx);
        result = rows.rows[0]!;
      } else if (report === 'activity') {
        const rows =
          await sql<WishlistTrendDto>`with days as (select generate_series(${query.from}::date,${query.toExclusive}::date-1,interval '1 day')::date as day),
        events as (select (occurred_at at time zone ${timezone})::date as day,
          count(*) filter(where event_name='wishlist.item.saved')::int saved,
          count(*) filter(where event_name='wishlist.item.removed')::int removed,
          count(*) filter(where event_name='wishlist.item.saved' and source='MERGE')::int additions,
          count(*) filter(where event_name='wishlist.merge.completed')::int merges
          from analytics.wishlist_outcomes where organization_id=${organizationId} and ${period} group by 1)
        select days.day::text as day,coalesce(saved,0) saved,coalesce(removed,0) removed,coalesce(additions,0) as "mergeAdditions",coalesce(merges,0) merges,
          coalesce(saved,0)-coalesce(removed,0) net from days left join events using(day) order by days.day`.execute(
            tx,
          );
        result = rows.rows;
      } else if (report === 'products' || report === 'categories') {
        // Current primary category is intentional for both current and activity columns.
        // Only groups with at least three distinct current account lists are exposed.
        const base = sql`with current_interest as materialized (
        select product_id,count(*)::int saved,count(distinct wishlist_id)::int lists
        from wishlist.account_items where organization_id=${organizationId} group by product_id),
        activity as materialized (select product_id,count(*) filter(where event_name='wishlist.item.saved')::int saved,
          count(*) filter(where event_name='wishlist.item.removed')::int removed from analytics.wishlist_outcomes
          where organization_id=${organizationId} and ${period} and product_id is not null group by product_id)`;
        const offset = (query.page - 1) * query.pageSize;
        const rows =
          report === 'products'
            ? await sql<WishlistProductInterestDto>`${base}
          select product.id::text as "productId",product.title,product.primary_category_id::text as "categoryId",document.available,
            interest.saved,case when coalesce(activity.saved,0) between 1 and 2 then null else coalesce(activity.saved,0) end as "recentSaves",
            case when coalesce(activity.removed,0) between 1 and 2 then null else coalesce(activity.removed,0) end as "recentRemovals"
          from current_interest interest join catalog.products product on product.organization_id=${organizationId} and product.id=interest.product_id
          left join activity on activity.product_id=product.id
          left join search.catalog_documents document on document.organization_id=product.organization_id and document.product_id=product.id
          where interest.lists>=3 order by interest.saved desc,product.id limit ${query.pageSize + 1} offset ${offset}`.execute(
                tx,
              )
            : await sql<WishlistCategoryInterestDto>`${base},
          current_category as materialized (
            select p.primary_category_id category_id,count(*)::int saved,count(distinct item.wishlist_id)::int lists
            from wishlist.account_items item join catalog.products p on p.organization_id=item.organization_id and p.id=item.product_id
            where item.organization_id=${organizationId} group by p.primary_category_id),
          category_activity as materialized (
            select p.primary_category_id category_id,sum(a.saved)::int saved,sum(a.removed)::int removed
            from activity a join catalog.products p on p.organization_id=${organizationId} and p.id=a.product_id group by p.primary_category_id)
          select c.category_id::text as "categoryId",coalesce(category.name,'Uncategorized') name,c.saved,
            case when coalesce(a.saved,0) between 1 and 2 then null else coalesce(a.saved,0) end as "recentSaves",
            case when coalesce(a.removed,0) between 1 and 2 then null else coalesce(a.removed,0) end as "recentRemovals"
          from current_category c left join category_activity a on a.category_id is not distinct from c.category_id
          left join catalog.categories category on category.organization_id=${organizationId} and category.id=c.category_id
          where c.lists>=3 order by c.saved desc,c.category_id nulls last limit ${query.pageSize + 1} offset ${offset}`.execute(
                tx,
              );
        result = {
          items: rows.rows.slice(0, query.pageSize),
          page: query.page,
          pageSize: query.pageSize,
          hasMore: rows.rows.length > query.pageSize,
        } as WishlistReports['products'] | WishlistReports['categories'];
      } else if (report === 'sharing') {
        const current = await sql<
          WishlistSharingDto['current']
        >`select count(*) filter(where revoked_at is null and expires_at>now())::int active,
        count(*) filter(where revoked_at is not null)::int revoked,count(*) filter(where revoked_at is null and expires_at<=now())::int expired,
        count(*) filter(where owner_account_id is null)::int as "guestOwned",count(*) filter(where owner_account_id is not null)::int as "accountOwned"
        from wishlist.shares where organization_id=${organizationId}`.execute(tx);
        const outcomes = await sql<
          WishlistSharingDto['outcomes'][number]
        >`select event_name name,count(*)::int count,
        count(*) filter(where origin='GUEST')::int guest,count(*) filter(where origin='ACCOUNT')::int account,
        count(*) filter(where scope='ALL')::int as all,count(*) filter(where scope='SELECTED')::int selected,
        count(*) filter(where scope='UNKNOWN')::int unknown,avg(snapshot_size)::float8 as "averageSize"
        from analytics.wishlist_outcomes where organization_id=${organizationId} and ${period} and event_name like 'wishlist.share.%'
        group by event_name order by event_name`.execute(tx);
        const trends = await sql<
          WishlistSharingDto['trends'][number]
        >`select (occurred_at at time zone ${timezone})::date::text as day,event_name name,count(*)::int count
        from analytics.wishlist_outcomes where organization_id=${organizationId} and ${period} and event_name like 'wishlist.share.%' group by 1,2 order by 1,2`.execute(
          tx,
        );
        const observations = await sql<
          WishlistSharingDto['observations'][number]
        >`select event_name name,count(*)::int count from analytics.storefront_events
        where organization_id=${organizationId} and event_name like 'WISHLIST_%' and analytics_consent='GRANTED' and ${period} group by event_name order by event_name`.execute(
          tx,
        );
        result = {
          current: current.rows[0]!,
          outcomes: outcomes.rows,
          trends: trends.rows,
          observations: observations.rows,
        };
      } else {
        const counters = await sql<
          WishlistOperationsDto['counters'][number]
        >`select day::text,operation,outcome,count::int,duration_ms::float8 as "totalDurationMs"
        from analytics.wishlist_operations where organization_id=${organizationId} and day>=${query.from}::date and day<${query.toExclusive}::date order by day,operation,outcome`.execute(
          tx,
        );
        const cleanup = await sql<WishlistOperationsDto['cleanup']>`select
        (select count(*)::int from wishlist.shares where organization_id=${organizationId} and revoked_at is null and expires_at<=now() and expiration_reported_at is null) as "expiredUnreported",
        (select count(*)::int from wishlist.shares where organization_id=${organizationId} and coalesce(revoked_at,expires_at)<now()-interval '30 days') as "purgeableShares",
        (select count(*)::int from wishlist.merge_receipts where organization_id=${organizationId} and expires_at<now()) as "expiredMergeReceipts"`.execute(
          tx,
        );
        result = { counters: counters.rows, cleanup: cleanup.rows[0]! };
      }
      return { metadata, result: result as WishlistReports[K] };
    });
}
