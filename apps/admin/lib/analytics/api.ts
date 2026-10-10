import { fetchApiData, apiRequest } from '@/lib/api';
import type {
  AnalyticsIntegrityFindingDto,
  AnalyticsMetricDefinitionDto,
  AnalyticsOverviewDto,
  AnalyticsReportEnvelopeDto,
  AnalyticsReportExportDto,
  AnalyticsReportKeyDto,
  AnalyticsReportPaginationDto,
  AnalyticsReportQueryDto,
  DestinationStatusDto,
  InventorySnapshotItemDto,
} from './types';

export async function fetchAnalyticsOverview(init?: RequestInit): Promise<AnalyticsOverviewDto> {
  return fetchApiData<AnalyticsOverviewDto>('/admin/analytics/overview', init);
}

export async function fetchAnalyticsReport<
  TTotals = unknown,
  TSeries = unknown,
  TBreakdown = unknown,
>(
  report: AnalyticsReportKeyDto,
  query: AnalyticsReportQueryDto,
  init?: RequestInit,
): Promise<AnalyticsReportEnvelopeDto<TTotals, TSeries, TBreakdown>> {
  const params = new URLSearchParams({
    from: query.from,
    to: query.to,
  });
  if (query.granularity) params.set('granularity', query.granularity);
  if (query.currency) params.set('currency', query.currency);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));

  return fetchApiData<AnalyticsReportEnvelopeDto<TTotals, TSeries, TBreakdown>>(
    `/admin/analytics/reports/${report.toLowerCase()}?${params.toString()}`,
    init,
  );
}

export async function fetchAnalyticsDrilldown(
  metric: 'GROSS_SALES' | 'NET_SALES' | 'REFUNDS' | 'GROSS_MARGIN' | 'CASH' | 'INVENTORY',
  init?: RequestInit,
): Promise<readonly Record<string, unknown>[]> {
  return fetchApiData<readonly Record<string, unknown>[]>(
    `/admin/analytics/drilldown/${metric}`,
    init,
  );
}

export async function fetchInventorySnapshots(
  init?: RequestInit,
): Promise<readonly InventorySnapshotItemDto[]> {
  return fetchApiData<readonly InventorySnapshotItemDto[]>(
    '/admin/analytics/inventory-snapshots',
    init,
  );
}

export async function fetchMetricCatalog(
  init?: RequestInit,
): Promise<readonly AnalyticsMetricDefinitionDto[]> {
  return fetchApiData<readonly AnalyticsMetricDefinitionDto[]>('/admin/analytics/metrics', init);
}

export async function fetchAnalyticsIntegrity(
  init?: RequestInit,
): Promise<readonly AnalyticsIntegrityFindingDto[]> {
  return fetchApiData<readonly AnalyticsIntegrityFindingDto[]>('/admin/analytics/integrity', init);
}

export async function fetchAnalyticsDestinations(
  init?: RequestInit,
): Promise<readonly DestinationStatusDto[]> {
  return fetchApiData<readonly DestinationStatusDto[]>('/admin/analytics/destinations', init);
}

export async function fetchAnalyticsExports(
  page = 1,
  pageSize = 25,
  init?: RequestInit,
): Promise<{
  readonly items: readonly AnalyticsReportExportDto[];
  readonly pagination: AnalyticsReportPaginationDto;
}> {
  return fetchApiData<{
    readonly items: readonly AnalyticsReportExportDto[];
    readonly pagination: AnalyticsReportPaginationDto;
  }>(`/admin/analytics/exports?page=${page}&pageSize=${pageSize}`, init);
}

export async function requestAnalyticsExport(
  report: AnalyticsReportKeyDto,
  query: AnalyticsReportQueryDto,
): Promise<{ readonly id: string; readonly status: string; readonly createdAt: string }> {
  return fetchApiData<{ readonly id: string; readonly status: string; readonly createdAt: string }>(
    '/admin/analytics/exports',
    {
      method: 'POST',
      body: JSON.stringify({ report, query }),
    },
  );
}

export async function triggerAnalyticsRebuild(): Promise<{
  readonly projections: Record<string, number>;
  readonly inventorySnapshot: { readonly rows: number };
}> {
  return fetchApiData<{
    readonly projections: Record<string, number>;
    readonly inventorySnapshot: { readonly rows: number };
  }>('/admin/analytics/rebuild', {
    method: 'POST',
  });
}
