import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import {
  analyticsReportKeys,
  getAnalyticsReport,
  normalizeAnalyticsReportQuery,
  type AnalyticsReportKey,
  type AnalyticsReportQuery,
} from './reporting.js';

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let rendered = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(rendered)) rendered = `'${rendered}`;
  return `"${rendered.replaceAll('"', '""')}"`;
}

function reportCsv(report: Awaited<ReturnType<typeof getAnalyticsReport>>): string {
  const records: Record<string, unknown>[] = [
    ...report.totals.map((row) => ({ section: 'TOTAL', ...(row as Record<string, unknown>) })),
    ...report.series.map((row) => ({ section: 'SERIES', ...(row as Record<string, unknown>) })),
    ...report.breakdown.map((row) => ({ section: 'BREAKDOWN', ...(row as Record<string, unknown>) })),
  ];
  const headers = [...new Set(records.flatMap((row) => Object.keys(row)))];
  if (!headers.length) return 'section\r\n';
  return [
    headers.map(csvCell).join(','),
    ...records.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\r\n');
}

export async function requestAnalyticsExport(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly actorId: string;
    readonly membershipId?: string;
    readonly report: AnalyticsReportKey;
    readonly query: AnalyticsReportQuery;
  },
) {
  normalizeAnalyticsReportQuery(input.query);
  const created = await sql<{ id: string; status: string; created_at: string }>`
    insert into analytics.report_exports(organization_id,requested_by_actor_id,report_key,parameters)
    values(${input.organizationId},${input.actorId}::uuid,${input.report},${JSON.stringify(input.query)}::jsonb)
    returning id::text,status,created_at::text
  `.execute(db);
  const row = created.rows[0];
  if (!row) throw new Error('Analytics export was not created.');
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    ...(input.membershipId ? { membershipId: input.membershipId } : {}),
    action: 'analytics.export.requested',
    targetType: 'analytics.report_export',
    targetId: row.id,
    metadata: { report: input.report, query: input.query },
  });
  return { id: row.id, status: row.status, createdAt: row.created_at };
}

export async function listAnalyticsExports(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  page = 1,
  pageSize = 25,
) {
  const boundedSize = Math.min(100, Math.max(1, pageSize));
  const boundedPage = Math.max(1, page);
  const offset = (boundedPage - 1) * boundedSize;
  const [items, count] = await Promise.all([
    sql`select id::text,report_key,status,row_count::text,content_type,file_name,error_code,created_at::text,started_at::text,completed_at::text,expires_at::text from analytics.report_exports where organization_id=${organizationId} order by created_at desc,id desc limit ${boundedSize} offset ${offset}`.execute(
      db,
    ),
    sql<{ count: string }>`select count(*)::text count from analytics.report_exports where organization_id=${organizationId}`.execute(
      db,
    ),
  ]);
  const totalItems = Number(count.rows[0]?.count ?? 0);
  return {
    items: items.rows,
    pagination: {
      page: boundedPage,
      pageSize: boundedSize,
      totalItems,
      totalPages: Math.ceil(totalItems / boundedSize),
    },
  };
}

export async function getAnalyticsExport(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  exportId: string,
) {
  const result = await sql<{
    id: string;
    report_key: string;
    status: string;
    row_count: string | null;
    content_type: string | null;
    file_name: string | null;
    payload: string | null;
    error_code: string | null;
    created_at: string;
    completed_at: string | null;
    expires_at: string | null;
  }>`select id::text,report_key,status,row_count::text,content_type,file_name,payload,error_code,created_at::text,completed_at::text,expires_at::text from analytics.report_exports where organization_id=${organizationId} and id=${exportId}::uuid`.execute(
    db,
  );
  return result.rows[0];
}

/** Leases and renders bounded CSV exports. Worker crashes are recovered after lease expiry. */
export async function processAnalyticsExports(
  db: Kysely<DatabaseSchema>,
  workerId: string,
  limit = 1,
) {
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const claimed = await sql<{
      id: string;
      organization_id: string;
      report_key: string;
      parameters: AnalyticsReportQuery;
    }>`with candidate as (
      select id from analytics.report_exports where (status='QUEUED' or (status='PROCESSING' and lease_expires_at<now())) order by created_at,id for update skip locked limit 1
    ) update analytics.report_exports export set status='PROCESSING',lease_owner=${workerId},lease_expires_at=now()+interval '5 minutes',started_at=coalesce(started_at,now()),version=version+1 from candidate where export.id=candidate.id returning export.id::text,export.organization_id::text,export.report_key,export.parameters`.execute(
      db,
    );
    const job = claimed.rows[0];
    if (!job) break;
    try {
      if (!analyticsReportKeys.includes(job.report_key as AnalyticsReportKey))
        throw new Error('INVALID_REPORT_KEY');
      const report = await getAnalyticsReport(
        db,
        job.organization_id,
        job.report_key as AnalyticsReportKey,
        job.parameters,
      );
      const csv = reportCsv(report);
      const rowCount = report.totals.length + report.series.length + report.breakdown.length;
      await sql`update analytics.report_exports set status='READY',row_count=${rowCount},content_type='text/csv; charset=utf-8',file_name=${`maevelle-${job.report_key.toLowerCase()}-${job.parameters.from}-${job.parameters.to}.csv`},payload=${csv},completed_at=now(),expires_at=now()+interval '7 days',lease_owner=null,lease_expires_at=null,version=version+1 where id=${job.id}::uuid and lease_owner=${workerId}`.execute(
        db,
      );
      processed += 1;
    } catch (error) {
      await sql`update analytics.report_exports set status='FAILED',error_code=${error instanceof Error ? error.message.slice(0, 200) : 'EXPORT_FAILED'},completed_at=now(),lease_owner=null,lease_expires_at=null,version=version+1 where id=${job.id}::uuid and lease_owner=${workerId}`.execute(
        db,
      );
    }
  }
  await sql`update analytics.report_exports set status='EXPIRED',payload=null where status='READY' and expires_at<now()`.execute(
    db,
  );
  return processed;
}
