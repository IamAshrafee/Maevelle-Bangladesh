import type {
  AdminSizingWorkspaceDto,
  CategoryGuideAssignmentPreviewDto,
  CategorySizeGuideDefaultListDto,
  CreateMeasurementDefinitionDto,
  CreateSizeDefinitionDto,
  CreateSizeGuideDto,
  CreateSizeGuideRevisionDto,
  CreateSizeGuideRowDto,
  CreateSizeSystemDto,
  CreateSizingDomainDto,
  ProductSizingDto,
  ProductGuideAssignmentPreviewDto,
  ProductSizeReconciliationDto,
  ReorderSizeGuideRowsDto,
  SetSizeGuideMeasurementDto,
  SetSizeGuideMeasurementsBulkDto,
  SetSupplyPurchaseSizingDecisionDto,
  SizeGuideDetailDto,
  SizeGuidePublishPreviewDto,
  SizeGuideListDto,
  SizeOptionValueMappingListDto,
  SizingMappingStatusDto,
  SizingAttentionListDto,
  SizingQualityChecksDto,
  SupplyPurchaseSizingReviewDto,
  UpdateMeasurementDefinitionDto,
  UpdateSizeDefinitionDto,
  UpdateSizeGuideDto,
  UpdateSizeGuideRevisionMetaDto,
  UpdateSizeGuideRowDto,
  UpdateSizeSystemDto,
  UpdateSizingDomainDto,
} from '@maevelle/contracts';

import { apiRequest, fetchApiData } from '@/lib/api';

type PaginatedApiEnvelope<T> = {
  readonly data: readonly T[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
};

function buildQuery(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

/* -------------------------------------------------------------------------- */
/*                                  Queries                                   */
/* -------------------------------------------------------------------------- */

export async function fetchSizingWorkspace(): Promise<AdminSizingWorkspaceDto> {
  return fetchApiData<AdminSizingWorkspaceDto>('/admin/sizing');
}

export async function fetchSizingQualityChecks(): Promise<SizingQualityChecksDto> {
  return fetchApiData<SizingQualityChecksDto>('/admin/sizing/quality-checks');
}

export async function fetchSizingAttention(
  query: { page?: number; pageSize?: number } = {},
): Promise<SizingAttentionListDto> {
  const response = await apiRequest<PaginatedApiEnvelope<SizingAttentionListDto['items'][number]>>(
    `/admin/sizing/attention${buildQuery({ page: query.page, pageSize: query.pageSize })}`,
  );
  return { items: response.data, pagination: response.pagination };
}

export async function fetchSizeGuides(
  query: {
    page?: number;
    pageSize?: number;
    status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
    domainId?: string;
    kind?:
      | 'APPAREL_SIZE_CHART'
      | 'FOOTWEAR_SIZE_CHART'
      | 'WEARABLE_FIT_GUIDE'
      | 'CUSTOM_FIT_GUIDE'
      | 'ALL';
    publication?: 'PUBLISHED' | 'WORKING_CHANGES' | 'DRAFT_ONLY' | 'ALL';
    sort?: 'UPDATED_DESC' | 'USAGE_DESC' | 'NAME_ASC';
    search?: string;
  } = {},
): Promise<SizeGuideListDto> {
  const response = await apiRequest<PaginatedApiEnvelope<SizeGuideListDto['items'][number]>>(
    `/admin/sizing/guides${buildQuery({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      domainId: query.domainId,
      kind: query.kind,
      publication: query.publication,
      sort: query.sort,
      search: query.search?.trim(),
    })}`,
  );

  return {
    items: response.data,
    pagination: response.pagination,
  };
}

export async function fetchSizeGuideDetail(guideId: string): Promise<SizeGuideDetailDto> {
  return fetchApiData<SizeGuideDetailDto>(`/admin/sizing/guides/${guideId}`);
}

export async function fetchProductSizingConfiguration(
  productId: string,
): Promise<ProductSizingDto> {
  return fetchApiData<ProductSizingDto>(`/admin/catalog/products/${productId}/size-configuration`);
}

export async function fetchProductSizeReconciliation(
  productId: string,
): Promise<ProductSizeReconciliationDto> {
  return fetchApiData<ProductSizeReconciliationDto>(
    `/admin/sizing/products/${productId}/reconciliation`,
  );
}

export async function fetchSupplyPurchaseSizingReview(
  purchaseId: string,
): Promise<SupplyPurchaseSizingReviewDto> {
  return fetchApiData<SupplyPurchaseSizingReviewDto>(
    `/admin/procurement/purchases/${purchaseId}/sizing`,
  );
}

export async function setSupplyPurchaseSizingDecision(
  purchaseId: string,
  input: SetSupplyPurchaseSizingDecisionDto,
): Promise<{ id: string; version: number }> {
  return fetchApiData<{ id: string; version: number }>(
    `/admin/procurement/purchases/${purchaseId}/sizing-decisions`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function fetchCategorySizeGuideDefaults(
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    mappingStatus?: SizingMappingStatusDto;
  } = {},
): Promise<CategorySizeGuideDefaultListDto> {
  const response = await apiRequest<
    PaginatedApiEnvelope<CategorySizeGuideDefaultListDto['items'][number]>
  >(
    `/admin/sizing/category-defaults${buildQuery({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search?.trim(),
      mappingStatus: query.mappingStatus,
    })}`,
  );

  return {
    items: response.data,
    pagination: response.pagination,
  };
}

export async function fetchSizeOptionValues(
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    mappingStatus?: SizingMappingStatusDto;
    sizeSystemId?: string;
    optionId?: string;
  } = {},
): Promise<SizeOptionValueMappingListDto> {
  const response = await apiRequest<
    PaginatedApiEnvelope<SizeOptionValueMappingListDto['items'][number]>
  >(
    `/admin/sizing/option-values${buildQuery({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search?.trim(),
      mappingStatus: query.mappingStatus,
      sizeSystemId: query.sizeSystemId,
      optionId: query.optionId,
    })}`,
  );

  return {
    items: response.data,
    pagination: response.pagination,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Sizing domains                                */
/* -------------------------------------------------------------------------- */

export async function createSizingDomain(input: CreateSizingDomainDto): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>('/admin/sizing/domains', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateSizingDomain(
  domainId: string,
  input: UpdateSizingDomainDto,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/domains/${domainId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function archiveSizingDomain(domainId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/domains/${domainId}`, {
    method: 'DELETE',
  });
}

export async function restoreSizingDomain(domainId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/domains/${domainId}/restore`, {
    method: 'POST',
  });
}

/* -------------------------------------------------------------------------- */
/*                                Size systems                                */
/* -------------------------------------------------------------------------- */

export async function createSizeSystem(input: CreateSizeSystemDto): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>('/admin/sizing/systems', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateSizeSystem(
  systemId: string,
  input: UpdateSizeSystemDto,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/systems/${systemId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function archiveSizeSystem(systemId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/systems/${systemId}`, {
    method: 'DELETE',
  });
}

export async function restoreSizeSystem(systemId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/systems/${systemId}/restore`, {
    method: 'POST',
  });
}

/* -------------------------------------------------------------------------- */
/*                              Size definitions                              */
/* -------------------------------------------------------------------------- */

export async function createSizeDefinition(
  input: CreateSizeDefinitionDto,
): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>('/admin/sizing/definitions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateSizeDefinition(
  definitionId: string,
  input: UpdateSizeDefinitionDto,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/definitions/${definitionId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function archiveSizeDefinition(definitionId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/definitions/${definitionId}`, {
    method: 'DELETE',
  });
}

export async function restoreSizeDefinition(definitionId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/definitions/${definitionId}/restore`, {
    method: 'POST',
  });
}

/* -------------------------------------------------------------------------- */
/*                          Measurement definitions                           */
/* -------------------------------------------------------------------------- */

export async function createMeasurementDefinition(
  input: CreateMeasurementDefinitionDto,
): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>('/admin/sizing/measurements', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateMeasurementDefinition(
  measurementId: string,
  input: UpdateMeasurementDefinitionDto,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/measurements/${measurementId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function archiveMeasurementDefinition(measurementId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/measurements/${measurementId}`, {
    method: 'DELETE',
  });
}

export async function restoreMeasurementDefinition(measurementId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/measurements/${measurementId}/restore`, {
    method: 'POST',
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Guides                                     */
/* -------------------------------------------------------------------------- */

export async function createSizeGuide(
  input: CreateSizeGuideDto,
): Promise<{ id: string; revisionId: string }> {
  return fetchApiData<{ id: string; revisionId: string }>('/admin/sizing/guides', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateSizeGuide(guideId: string, input: UpdateSizeGuideDto): Promise<void> {
  return apiRequest<void>(`/admin/sizing/guides/${guideId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function archiveSizeGuide(guideId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/guides/${guideId}`, {
    method: 'DELETE',
  });
}

export async function restoreSizeGuide(guideId: string): Promise<void> {
  return apiRequest<void>(`/admin/sizing/guides/${guideId}/restore`, {
    method: 'POST',
  });
}

export async function duplicateSizeGuide(
  guideId: string,
  name?: string,
): Promise<{ id: string; revisionId: string }> {
  return fetchApiData<{ id: string; revisionId: string }>(
    `/admin/sizing/guides/${guideId}/duplicate`,
    {
      method: 'POST',
      body: JSON.stringify(name === undefined ? {} : { name }),
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                              Guide revisions                               */
/* -------------------------------------------------------------------------- */

export async function createSizeGuideRevision(
  guideId: string,
  input: CreateSizeGuideRevisionDto = {},
): Promise<{ id: string; revisionNumber: number }> {
  return fetchApiData<{ id: string; revisionNumber: number }>(
    `/admin/sizing/guides/${guideId}/revisions`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export async function updateSizeGuideRevisionMeta(
  revisionId: string,
  input: UpdateSizeGuideRevisionMetaDto,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/revisions/${revisionId}/meta`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function publishSizeGuideRevision(
  guideId: string,
  revisionId: string,
  expectedVersion: number,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/guides/${guideId}/revisions/${revisionId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion }),
  });
}

export async function previewSizeGuidePublication(
  guideId: string,
  revisionId: string,
): Promise<SizeGuidePublishPreviewDto> {
  return fetchApiData<SizeGuidePublishPreviewDto>(
    `/admin/sizing/guides/${guideId}/revisions/${revisionId}/publish-preview`,
    { method: 'POST', body: '{}' },
  );
}

export async function publishReviewedSizeGuideRevision(
  guideId: string,
  revisionId: string,
  previewToken: string,
): Promise<void> {
  return apiRequest<void>(
    `/admin/sizing/guides/${guideId}/revisions/${revisionId}/publish-reviewed`,
    { method: 'POST', body: JSON.stringify({ previewToken }) },
  );
}

/* -------------------------------------------------------------------------- */
/*                                Guide rows                                  */
/* -------------------------------------------------------------------------- */

export async function createSizeGuideRow(
  revisionId: string,
  input: CreateSizeGuideRowDto,
): Promise<{ id: string }> {
  return fetchApiData<{ id: string }>(`/admin/sizing/revisions/${revisionId}/rows`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function addSizeGuideColumn(
  revisionId: string,
  input: { expectedVersion: number; measurementDefinitionId: string; displayName?: string },
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/revisions/${revisionId}/columns`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function renameSizeGuideColumn(
  revisionId: string,
  columnId: string,
  input: { expectedVersion: number; displayName: string },
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/revisions/${revisionId}/columns/${columnId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function removeSizeGuideColumn(
  revisionId: string,
  columnId: string,
  expectedVersion: number,
): Promise<void> {
  return apiRequest<void>(
    `/admin/sizing/revisions/${revisionId}/columns/${columnId}?expectedVersion=${expectedVersion}`,
    { method: 'DELETE' },
  );
}

export async function updateSizeGuideRow(
  revisionId: string,
  rowId: string,
  input: UpdateSizeGuideRowDto,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/revisions/${revisionId}/rows/${rowId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function reorderSizeGuideRows(
  revisionId: string,
  input: ReorderSizeGuideRowsDto,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/revisions/${revisionId}/rows/order`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteSizeGuideRow(
  revisionId: string,
  rowId: string,
  expectedVersion: number,
): Promise<void> {
  return apiRequest<void>(
    `/admin/sizing/revisions/${revisionId}/rows/${rowId}${buildQuery({ expectedVersion })}`,
    {
      method: 'DELETE',
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                            Measurement matrix                              */
/* -------------------------------------------------------------------------- */

export async function setRowMeasurement(
  revisionId: string,
  rowId: string,
  measurementDefinitionId: string,
  input: SetSizeGuideMeasurementDto,
): Promise<void> {
  return apiRequest<void>(
    `/admin/sizing/revisions/${revisionId}/rows/${rowId}/measurements/${measurementDefinitionId}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );
}

/**
 * Compatibility name for existing callers. New code should prefer
 * setRowMeasurement because the API resource is an individual matrix cell.
 */
export async function updateSizeGuideMeasurement(
  revisionId: string,
  input: SetSizeGuideMeasurementDto & {
    readonly rowId: string;
    readonly measurementDefinitionId: string;
  },
): Promise<void> {
  const { rowId, measurementDefinitionId, ...measurement } = input;

  return setRowMeasurement(revisionId, rowId, measurementDefinitionId, measurement);
}

export async function deleteRowMeasurement(
  revisionId: string,
  rowId: string,
  measurementDefinitionId: string,
  expectedVersion: number,
): Promise<void> {
  return apiRequest<void>(
    `/admin/sizing/revisions/${revisionId}/rows/${rowId}/measurements/${measurementDefinitionId}${buildQuery({ expectedVersion })}`,
    {
      method: 'DELETE',
    },
  );
}

export async function updateSizeGuideMatrix(
  revisionId: string,
  input: SetSizeGuideMeasurementsBulkDto,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/revisions/${revisionId}/matrix`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/* -------------------------------------------------------------------------- */
/*                         Product sizing configuration                       */
/* -------------------------------------------------------------------------- */

export async function setProductSizingConfiguration(
  productId: string,
  input: {
    readonly sizeSystemId: string;
    readonly sizeGuideId?: string;
    readonly guideOutcome?: 'INHERIT' | 'DIRECT' | 'NONE';
    readonly noGuideReason?: string;
    readonly assignmentOrigin?: 'MANUAL' | 'SUPPLY_PURCHASE';
    readonly sourcePurchaseId?: string;
    readonly expectedProductVersion?: number;
  },
): Promise<void> {
  return apiRequest<void>(`/admin/catalog/products/${productId}/size-configuration`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function removeProductSizingConfiguration(
  productId: string,
  expectedProductVersion?: number,
): Promise<void> {
  return apiRequest<void>(
    `/admin/catalog/products/${productId}/size-configuration${buildQuery({
      expectedProductVersion,
    })}`,
    {
      method: 'DELETE',
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                           Category defaults                                */
/* -------------------------------------------------------------------------- */

export async function setCategoryDefaultSizeGuide(
  categoryId: string,
  sizeGuideId: string | null,
): Promise<void> {
  return apiRequest<void>(`/admin/catalog/categories/${categoryId}/size-guide`, {
    method: 'PUT',
    body: JSON.stringify({ sizeGuideId }),
  });
}

export async function previewCategoryDefaultSizeGuide(
  categoryId: string,
  sizeGuideId: string | null,
): Promise<CategoryGuideAssignmentPreviewDto> {
  return fetchApiData<CategoryGuideAssignmentPreviewDto>(
    '/admin/sizing/assignments/category-preview',
    { method: 'POST', body: JSON.stringify({ categoryId, sizeGuideId }) },
  );
}

export async function applyCategoryDefaultSizeGuide(previewToken: string): Promise<void> {
  return apiRequest<void>('/admin/sizing/assignments/category-apply', {
    method: 'POST',
    body: JSON.stringify({ previewToken }),
  });
}

export async function previewProductGuideAssignment(
  productId: string,
  input: {
    outcome: 'INHERIT' | 'DIRECT' | 'NONE';
    sizeGuideId?: string;
    noGuideReason?: string;
  },
): Promise<ProductGuideAssignmentPreviewDto> {
  return fetchApiData<ProductGuideAssignmentPreviewDto>(
    `/admin/sizing/assignments/products/${productId}/preview`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function applyProductGuideAssignment(
  productId: string,
  previewToken: string,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/assignments/products/${productId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ previewToken }),
  });
}

/* -------------------------------------------------------------------------- */
/*                         Option-value mappings                              */
/* -------------------------------------------------------------------------- */

export async function linkOptionValueToSizeDefinition(
  optionValueId: string,
  sizeDefinitionId: string | null,
): Promise<void> {
  return apiRequest<void>(`/admin/sizing/option-values/${optionValueId}/size-definition`, {
    method: 'PUT',
    body: JSON.stringify({ sizeDefinitionId }),
  });
}

export async function linkOptionValuesToSizeDefinitionsBulk(
  mappings: readonly {
    readonly optionValueId: string;
    readonly sizeDefinitionId: string | null;
  }[],
): Promise<void> {
  return apiRequest<void>('/admin/sizing/option-values/size-definitions/bulk', {
    method: 'PUT',
    body: JSON.stringify({ mappings }),
  });
}
