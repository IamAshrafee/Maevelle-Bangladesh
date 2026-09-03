import type {
  AdminSizingWorkspaceDto,
  CategorySizeGuideDefaultDto,
  SizeDefinitionDto,
  SizeGuideDetailDto,
  SizeGuideSummaryDto,
  SizeOptionValueMappingDto,
  SizeSystemDto,
  SizingDomainDto,
  SizingQualityChecksDto,
  MeasurementDefinitionDto,
} from '@maevelle/contracts';

import { apiRequest, fetchApiData } from '@/lib/api';

export async function fetchSizingWorkspace(): Promise<AdminSizingWorkspaceDto> {
  return fetchApiData<AdminSizingWorkspaceDto>('/admin/sizing');
}

export async function fetchSizingQualityChecks(): Promise<SizingQualityChecksDto> {
  return fetchApiData<SizingQualityChecksDto>('/admin/sizing/quality-checks');
}

export async function fetchSizeGuides(query?: {
  status?: string | undefined;
  domainId?: string | undefined;
  search?: string | undefined;
}): Promise<readonly SizeGuideSummaryDto[]> {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.domainId) params.set('domainId', query.domainId);
  if (query?.search) params.set('search', query.search);
  const q = params.toString();
  return fetchApiData<readonly SizeGuideSummaryDto[]>(`/admin/sizing/guides${q ? `?${q}` : ''}`);
}

export async function fetchSizeGuideDetail(guideId: string): Promise<SizeGuideDetailDto> {
  return fetchApiData<SizeGuideDetailDto>(`/admin/sizing/guides/${guideId}`);
}

export async function createSizeGuide(input: {
  name: string;
  description?: string | undefined;
  sizingDomainId: string;
}): Promise<{ id: string; revisionId: string }> {
  return fetchApiData<{ id: string; revisionId: string }>('/admin/sizing/guides', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function duplicateSizeGuide(
  guideId: string,
  name?: string | undefined,
): Promise<{ id: string; revisionId: string }> {
  return fetchApiData<{ id: string; revisionId: string }>(`/admin/sizing/guides/${guideId}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function fetchCategorySizeGuideDefaults(): Promise<readonly CategorySizeGuideDefaultDto[]> {
  return fetchApiData<readonly CategorySizeGuideDefaultDto[]>('/admin/sizing/category-defaults');
}

export async function setCategoryDefaultSizeGuide(
  categoryId: string,
  sizeGuideId: string | null,
): Promise<void> {
  return apiRequest<void>(`/admin/catalog/categories/${categoryId}/size-guide`, {
    method: 'PUT',
    body: JSON.stringify({ sizeGuideId }),
  });
}

export async function fetchSizeOptionValues(): Promise<readonly SizeOptionValueMappingDto[]> {
  return fetchApiData<readonly SizeOptionValueMappingDto[]>('/admin/sizing/option-values');
}

export async function linkOptionValueToSizeDefinition(
  optionValueId: string,
  sizeDefinitionId: string | null,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/option-values/${optionValueId}/size-definition`, {
    method: 'PUT',
    body: JSON.stringify({ sizeDefinitionId }),
  });
}

export async function createSizeGuideRow(
  revisionId: string,
  input: {
    displayLabel: string;
    sizeDefinitionId?: string | null | undefined;
    position: number;
  },
): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>(`/admin/sizing/revisions/${revisionId}/rows`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateSizeGuideMeasurement(
  revisionId: string,
  input: {
    rowId: string;
    measurementDefinitionId: string;
    exact?: string | undefined;
    min?: string | undefined;
    max?: string | undefined;
    unitCode: 'cm' | 'inch';
    isApproximate?: boolean | undefined;
  },
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/revisions/${revisionId}/measurements`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function publishSizeGuideRevision(
  guideId: string,
  revisionId: string,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/guides/${guideId}/revisions/${revisionId}/publish`, {
    method: 'POST',
  });
}

export async function archiveSizeGuideRevision(
  guideId: string,
  revisionId: string,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/guides/${guideId}/revisions/${revisionId}/archive`, {
    method: 'POST',
  });
}

export async function updateSizeGuideRevisionMeta(
  revisionId: string,
  input: {
    instructions?: string | null | undefined;
    fitNotes?: string | null | undefined;
  },
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/revisions/${revisionId}/meta`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function createSizingDomain(input: {
  code: string;
  name: string;
  subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
  description?: string | undefined;
}): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>('/admin/sizing/domains', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function archiveSizingDomain(id: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/domains/${id}`, {
    method: 'DELETE',
  });
}

export async function createSizeSystem(input: {
  sizingDomainId: string;
  code: string;
  name: string;
  regionCode?: string | undefined;
}): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>('/admin/sizing/systems', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function archiveSizeSystem(id: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/systems/${id}`, {
    method: 'DELETE',
  });
}

export async function createSizeDefinition(input: {
  sizeSystemId: string;
  code: string;
  label: string;
  sortOrder: number;
}): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>('/admin/sizing/definitions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function archiveSizeDefinition(id: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/definitions/${id}`, {
    method: 'DELETE',
  });
}

export async function createMeasurementDefinition(input: {
  sizingDomainId: string;
  code: string;
  name: string;
  subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
  defaultUnit: 'cm' | 'inch';
  sortOrder?: number | undefined;
  description?: string | undefined;
  instructions?: string | undefined;
}): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>('/admin/sizing/measurements', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function archiveMeasurementDefinition(id: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/measurements/${id}`, {
    method: 'DELETE',
  });
}

export async function createSizeGuideRevision(guideId: string): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>(`/admin/sizing/guides/${guideId}/revisions`, {
    method: 'POST',
  });
}

export async function deleteSizeGuideRow(revisionId: string, rowId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/revisions/${revisionId}/rows/${rowId}`, {
    method: 'DELETE',
  });
}

export async function setRowMeasurement(
  revisionId: string,
  rowId: string,
  measurementId: string,
  input: {
    unitCode: 'cm' | 'inch';
    exact?: string | undefined;
    min?: string | undefined;
    max?: string | undefined;
    isApproximate?: boolean | undefined;
  },
): Promise<void> {
  return apiRequest<void>(
    `/admin/sizing/revisions/${revisionId}/rows/${rowId}/measurements/${measurementId}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );
}
