import { apiRequest, fetchApiData } from '@/lib/api';
import type {
  IntegrityCheckDto,
  IntegrityFindingDetailDto,
  IntegrityFindingListItemDto,
  IntegrityOverviewDto,
  IntegrityRepairPreviewDto,
  IntegrityRunDetailDto,
  IntegrityRunDto,
} from './types';

export interface ListFindingsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  severity?: string;
  module?: string;
  checkId?: string;
  repairableOnly?: boolean;
  q?: string;
}

export interface ListFindingsResponse {
  items: readonly IntegrityFindingListItemDto[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ListRunsParams {
  page?: number;
  pageSize?: number;
}

export interface ListRunsResponse {
  items: readonly IntegrityRunDto[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export async function fetchIntegrityOverview(): Promise<IntegrityOverviewDto> {
  return fetchApiData<IntegrityOverviewDto>('/admin/integrity/overview');
}

export async function fetchIntegrityChecks(): Promise<readonly IntegrityCheckDto[]> {
  return fetchApiData<readonly IntegrityCheckDto[]>('/admin/integrity/checks');
}

export async function fetchIntegrityFindings(
  params: ListFindingsParams = {},
): Promise<ListFindingsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.status && params.status !== 'ALL') query.set('status', params.status);
  if (params.severity && params.severity !== 'ALL') query.set('severity', params.severity);
  if (params.module && params.module !== 'ALL') query.set('module', params.module);
  if (params.checkId && params.checkId !== 'ALL') query.set('checkId', params.checkId);
  if (params.repairableOnly) query.set('repairableOnly', 'true');
  if (params.q?.trim()) query.set('q', params.q.trim());

  const queryString = query.toString();
  const path = `/admin/integrity${queryString ? `?${queryString}` : ''}`;

  const envelope = await apiRequest<{
    data: readonly IntegrityFindingListItemDto[];
    meta: {
      pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    };
  }>(path);

  return {
    items: envelope.data,
    pagination: envelope.meta.pagination,
  };
}

export async function fetchIntegrityFinding(
  findingId: string,
): Promise<IntegrityFindingDetailDto> {
  return fetchApiData<IntegrityFindingDetailDto>(`/admin/integrity/findings/${encodeURIComponent(findingId)}`);
}

export async function updateFindingStatus(
  findingId: string,
  payload: {
    version: number;
    status: 'OPEN' | 'INVESTIGATING' | 'ACCEPTED';
    reason?: string | undefined;
  },
): Promise<{ version: number; status: string }> {
  return fetchApiData<{ version: number; status: string }>(
    `/admin/integrity/findings/${encodeURIComponent(findingId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function previewFindingRepair(
  findingId: string,
): Promise<IntegrityRepairPreviewDto> {
  return fetchApiData<IntegrityRepairPreviewDto>(
    `/admin/integrity/findings/${encodeURIComponent(findingId)}/repair-preview`,
    {
      method: 'POST',
    },
  );
}

export async function executeFindingRepair(
  findingId: string,
  payload: {
    findingVersion: number;
    repairKey: 'ANALYTICS' | 'REVIEW_RATINGS';
  },
): Promise<{ id: string; status: string; verificationRunId?: string }> {
  const idempotencyKey = `repair-${findingId}-${payload.findingVersion}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return fetchApiData<{ id: string; status: string; verificationRunId?: string }>(
    `/admin/integrity/findings/${encodeURIComponent(findingId)}/repairs`,
    {
      method: 'POST',
      headers: {
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchIntegrityRuns(
  params: ListRunsParams = {},
): Promise<ListRunsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));

  const queryString = query.toString();
  const path = `/admin/integrity/runs${queryString ? `?${queryString}` : ''}`;

  const envelope = await apiRequest<{
    data: readonly IntegrityRunDto[];
    meta: {
      pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    };
  }>(path);

  return {
    items: envelope.data,
    pagination: envelope.meta.pagination,
  };
}

export async function fetchIntegrityRun(
  runId: string,
): Promise<IntegrityRunDetailDto> {
  return fetchApiData<IntegrityRunDetailDto>(`/admin/integrity/runs/${encodeURIComponent(runId)}`);
}

export async function requestIntegrityRun(input: {
  module?: string;
  checkIds?: readonly string[];
  executeInline?: boolean;
}): Promise<{ id: string; status: string }> {
  return fetchApiData<{ id: string; status: string }>('/admin/integrity/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function cancelIntegrityRun(
  runId: string,
): Promise<{ id: string; status: string }> {
  return fetchApiData<{ id: string; status: string }>(
    `/admin/integrity/runs/${encodeURIComponent(runId)}/cancel`,
    {
      method: 'POST',
    },
  );
}
