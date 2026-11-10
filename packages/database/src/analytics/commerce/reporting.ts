import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';
import { normalizeAnalyticsReportQuery } from '../reporting.js';
import { commerceConversionPolicy } from './delivery.js';
import type {
  CommerceMeasurementQueryDto,
  CommerceMeasurementReportDto,
  CommerceFactName,
} from '@maevelle/contracts';

export async function getCommerceMeasurementReport(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: CommerceMeasurementQueryDto,
): Promise<CommerceMeasurementReportDto> {
  const query = normalizeAnalyticsReportQuery(input);
  const traffic = input.trafficClass ?? 'BUSINESS';
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const facts = (
        await sql<{
          name: CommerceFactName;
          currency: string | null;
          count: string;
          amount: string | null;
          allocated: string | null;
        }>`
      select event_name name,currency,count(*)::text count,sum(amount)::text amount,sum(allocated_amount)::text allocated
      from analytics.commerce_events where organization_id=${organizationId} and traffic_class=${traffic}
        and occurred_at>=(${query.from}::date::timestamp at time zone 'UTC') and occurred_at<(${query.toExclusive}::date::timestamp at time zone 'UTC')
        ${query.currency ? sql`and currency=${query.currency}` : sql``}
      group by event_name,currency order by event_name,currency`.execute(tx)
      ).rows;
      const health = (
        await sql<{
          status: string;
          count: string;
          oldestAt: string | null;
        }>`select r.status,count(*)::text count,min(e.occurred_at)::text as "oldestAt"
      from platform.event_consumer_receipts r join platform.outbox_events e on e.id=r.outbox_event_id
      where e.organization_id=${organizationId} and r.consumer_name='analytics.commerce.v1'
      group by r.status order by r.status`.execute(tx)
      ).rows;
      // These are accepted server revisions, not unique people, sessions or inferred abandonment.
      const acceptedSteps = (
        await sql<{ action: string; count: string }>`select a.action,count(*)::text count
      from audit.audit_events a where a.organization_id=${organizationId}
        and a.action in ('checkout.draft.created','checkout.draft.delivery_updated','checkout.draft.quoted','checkout.draft.quote_acknowledged','checkout.draft.abandoned')
        and a.created_at>=(${query.from}::date::timestamp at time zone 'UTC') and a.created_at<(${query.toExclusive}::date::timestamp at time zone 'UTC')
        and exists(select 1 from analytics.commerce_reporting_scopes s where s.organization_id=a.organization_id and s.traffic_class=${traffic})
      group by a.action order by a.action`.execute(tx)
      ).rows;
      const entries = (
        await sql<
          CommerceMeasurementReportDto['entries'][number]
        >`select coalesce(a.metadata->>'sourceKind','UNKNOWN') as source,count(*)::text count
        from audit.audit_events a where a.organization_id=${organizationId} and a.action='checkout.draft.created'
          and a.created_at>=(${query.from}::date::timestamp at time zone 'UTC') and a.created_at<(${query.toExclusive}::date::timestamp at time zone 'UTC')
          and exists(select 1 from analytics.commerce_reporting_scopes s where s.organization_id=a.organization_id and s.traffic_class=${traffic})
        group by a.metadata->>'sourceKind' order by source`.execute(tx)
      ).rows;
      const operations = (
        await sql<
          CommerceMeasurementReportDto['operations'][number]
        >`select operation,outcome,sum(count)::text count,sum(duration_ms)::text duration_ms,
        max(max_duration_ms)::text max_duration_ms from analytics.commerce_operations
        where organization_id=${organizationId} and traffic_class=${traffic}
          and day>=${query.from}::date and day<${query.toExclusive}::date
        group by operation,outcome order by operation,outcome`.execute(tx)
      ).rows;
      return {
        schemaVersion: 1 as const,
        trafficClass: traffic,
        timezone: 'UTC' as const,
        facts,
        acceptedSteps,
        entries,
        health,
        operations,
        conversionRate: null,
        conversionRateReason: 'PUBLIC_PURCHASING_DISABLED_OR_COVERAGE_UNVERIFIED',
        revenueAuthority: 'FINANCE' as const,
        conversionPolicy: commerceConversionPolicy,
        coverage:
          'Since migration 3224; no historical backfill. Unclassified activity excluded by default. Accepted steps count revisions; no inferred abandonment.',
      };
    });
}
