import { sql, type Kysely } from 'kysely';
import {
  cartAnalyticsMaxDays,
  cartAnalyticsTimezone,
  cartInteractionNames,
  type CartAnalyticsDto,
  type CartAnalyticsDayDto,
  type CartAnalyticsQueryDto,
} from '@maevelle/contracts';
import type { DatabaseSchema } from '../../index.js';
import { AnalyticsQueryError, normalizeAnalyticsReportQuery } from '../reporting.js';
import { getCartActivity } from './reporting.js';

type RecordedCoverage = {
  firstRecordedAt: Date | null;
  lastRecordedAt: Date | null;
};

export async function getAdminCartAnalytics(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: CartAnalyticsQueryDto,
): Promise<CartAnalyticsDto> {
  if (input.from.startsWith('0000-') || input.to.startsWith('9999-'))
    throw new AnalyticsQueryError('Cart report dates are outside the supported calendar.');
  const { from, toExclusive, currency } = normalizeAnalyticsReportQuery(input);
  const days = (Date.parse(toExclusive) - Date.parse(from)) / 86_400_000;
  if (!(days > 0 && days <= cartAnalyticsMaxDays))
    throw new AnalyticsQueryError('Cart reports support at most 366 calendar days.');

  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const timezone = cartAnalyticsTimezone;
      const {
        rows: [bounds],
      } = await sql<{ from: Date; to: Date; now: Date }>`
      select ${from}::date::timestamp at time zone ${timezone} as "from",
        ${toExclusive}::date::timestamp at time zone ${timezone} as "to", now() as now
    `.execute(tx);
      const period = bounds!;
      const inPeriod = sql`occurred_at>=${period.from} and occurred_at<${period.to}`;
      const currencyFilter = currency ? sql`and currency=${currency}` : sql``;
      const day = sql`(occurred_at at time zone ${timezone})::date`;

      const activity = await getCartActivity(tx, organizationId, period, currency);
      const { rows: values } = await sql<CartAnalyticsDto['committed']['values'][number]>`
      select currency, round(avg(merchandise_gross_after),4)::text as "averageGross",
        round(avg(merchandise_net_after),4)::text as "averageNet"
      from analytics.cart_mutations
      where organization_id=${organizationId} and ${inPeriod}
      group by currency order by currency
    `.execute(tx);
      const { rows: mutations } = await sql<
        Omit<CartAnalyticsDayDto, 'day'> & RecordedCoverage & { day: string | null; net: string }
      >`
      select bucket::text as day, count(*)::text as count,
        min(occurred_at) as "firstRecordedAt", max(occurred_at) as "lastRecordedAt",
        coalesce(sum(unit_delta),0)::text as net
      from (
        select ${day} as bucket, occurred_at, unit_delta
        from analytics.cart_mutations
        where organization_id=${organizationId} and ${inPeriod} ${currencyFilter}
      ) as selected
      group by grouping sets ((),(bucket)) order by day nulls first
    `.execute(tx);
      const [mutationTotals, ...mutationTrend] = mutations;
      const {
        rows: [projection],
      } = await sql<{ pending: string; failed: string }>`
      select count(*) filter(where receipt.status='PENDING')::text as pending,
        count(*) filter(where receipt.status='DEAD_LETTER')::text as failed
      from platform.event_consumer_receipts receipt
      join platform.outbox_events event on event.id=receipt.outbox_event_id
      where event.organization_id=${organizationId}
        and event.occurred_at>=${period.from} and event.occurred_at<${period.to}
        and receipt.consumer_name='analytics.cart.v1' and receipt.status in ('PENDING','DEAD_LETTER')
    `.execute(tx);
      const { rows: browser } = await sql<
        Omit<CartAnalyticsDayDto, 'day'> &
          RecordedCoverage & {
            day: string | null;
            name: (typeof cartInteractionNames)[number] | null;
          }
      >`
      select bucket::text as day, event_name as name, count(*)::text as count,
        min(occurred_at) as "firstRecordedAt", max(occurred_at) as "lastRecordedAt"
      from (
        select ${day} as bucket, occurred_at, event_name
        from analytics.storefront_events
        where organization_id=${organizationId} and ${inPeriod}
          and origin='BROWSER' and analytics_consent='GRANTED'
          and event_name in (${sql.join(cartInteractionNames)})
      ) as selected
      group by grouping sets ((),(event_name),(event_name,bucket))
      having grouping(bucket)=1 or event_name='CART_VIEWED'
      order by day nulls first, name nulls first
    `.execute(tx);
      const [browserTotals, ...browserDetails] = browser;

      return {
        generatedAt: period.now.toISOString(),
        committed: {
          ...activity,
          currencies: values.map((row) => row.currency),
          values: values.filter((row) => !currency || row.currency === currency),
          netUnitChange: mutationTotals!.net,
          firstRecordedAt: mutationTotals!.firstRecordedAt?.toISOString() ?? null,
          lastRecordedAt: mutationTotals!.lastRecordedAt?.toISOString() ?? null,
          trend: mutationTrend.flatMap(({ day, count }) => (day === null ? [] : [{ day, count }])),
          ...projection!,
        },
        observations: {
          firstRecordedAt: browserTotals!.firstRecordedAt?.toISOString() ?? null,
          lastRecordedAt: browserTotals!.lastRecordedAt?.toISOString() ?? null,
          counts: cartInteractionNames.map((name) => ({
            name,
            count:
              browserDetails.find((row) => row.name === name && row.day === null)?.count ?? '0',
          })),
          viewsTrend: browserDetails.flatMap(({ day, count }) =>
            day === null ? [] : [{ day, count }],
          ),
        },
      };
    });
}
