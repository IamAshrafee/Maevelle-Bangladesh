import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { catalogProductHasCoherentActiveVariants } from '../catalog-variant-integrity.js';
import { evaluateProductRecommendations } from './evaluate.js';

export async function recommendationCoverage(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    query: string;
    page: number;
    pageSize: number;
    currency: string;
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  const rows = await sql<{
    id: string;
    handle: string;
    title: string;
    total: string;
    action_count: string;
  }>`
    select p.id::text,p.handle,p.title,count(*) over()::text total,
      (select count(*)::text from recommendations.product_actions action where action.organization_id=p.organization_id and action.source_product_id=p.id) action_count
    from catalog.products p where p.organization_id=${input.organizationId} and p.status='ACTIVE' and p.publication_status='PUBLISHED'
      and ${catalogProductHasCoherentActiveVariants(sql.ref('p.organization_id'), sql.ref('p.id'))}
      and (${input.query.trim()}='' or p.title ilike ${`%${input.query.trim()}%`})
    order by p.title,p.id limit ${input.pageSize} offset ${offset}
  `.execute(db);
  const items = await Promise.all(
    rows.rows.map(async (row) => {
      const evaluated = await evaluateProductRecommendations(db, {
        organizationId: input.organizationId,
        productId: row.id,
        currency: input.currency,
      });
      return {
        id: row.id,
        handle: row.handle,
        title: row.title,
        actionCount: Number(row.action_count),
        similarCount:
          evaluated.sections.find((section) => section.placement === 'pdp_similar')?.items.length ??
          0,
        complementaryCount:
          evaluated.sections.find((section) => section.placement === 'pdp_complementary')?.items
            .length ?? 0,
      };
    }),
  );
  return {
    items,
    page: input.page,
    pageSize: input.pageSize,
    total: Number(rows.rows[0]?.total ?? 0),
  };
}

export async function recommendationPerformance(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; from: string; to: string },
) {
  const result = await sql<{
    placement: string;
    impressions: string;
    clicks: string;
    clicked_impressions: string;
    continuations: string;
    unique_sessions: string;
  }>`
    select event.payload->>'placement' placement,
      count(*) filter(where event.event_name='PRODUCT_LIST_VIEWED')::text impressions,
      count(*) filter(where event.event_name='PRODUCT_SELECTED')::text clicks,
      count(distinct event.payload->>'recommendationRequestId') filter(where event.event_name='PRODUCT_SELECTED' and exists (
        select 1 from analytics.storefront_events impression
        where impression.organization_id=event.organization_id and impression.session_id=event.session_id
          and impression.event_name='PRODUCT_LIST_VIEWED' and impression.payload->>'placement'=event.payload->>'placement'
          and impression.payload->>'recommendationRequestId'=event.payload->>'recommendationRequestId'
      ))::text clicked_impressions,
      count(*) filter(where event.event_name='PRODUCT_SELECTED' and exists (
        select 1 from analytics.storefront_events viewed
        where viewed.organization_id=event.organization_id and viewed.session_id=event.session_id
          and viewed.product_id=event.product_id and viewed.event_name='PRODUCT_VIEWED'
          and viewed.occurred_at>=event.occurred_at and viewed.occurred_at<event.occurred_at+interval '30 minutes'
      ))::text continuations,
      count(distinct event.session_id)::text unique_sessions
    from analytics.storefront_events event
    where event.organization_id=${input.organizationId} and event.occurred_at>=${input.from}::date
      and event.occurred_at<(${input.to}::date+interval '1 day')
      and event.origin='BROWSER' and event.analytics_consent='GRANTED'
      and event.event_name in ('PRODUCT_LIST_VIEWED','PRODUCT_SELECTED')
      and event.payload->>'placement' in ('pdp_similar','pdp_complementary')
    group by event.payload->>'placement' order by placement
  `.execute(db);
  return {
    from: input.from,
    to: input.to,
    measurement: 'CONSENTED_BROWSER_EVENTS',
    placements: result.rows.map((row) => ({
      placement: row.placement,
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      clickedImpressions: Number(row.clicked_impressions),
      productPageContinuations: Number(row.continuations),
      uniqueSessions: Number(row.unique_sessions),
      ctr:
        Number(row.impressions) > 0
          ? Number(row.clicked_impressions) / Number(row.impressions)
          : null,
    })),
  };
}
