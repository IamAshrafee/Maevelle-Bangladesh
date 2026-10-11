import type {
  InventoryUnitDto,
  UnitInspectionDto,
  UnitRepairDto,
  UnitEventDto,
  UnitBarcodeLookupDto,
  SerializedStockReconciliationDto,
  UnitConditionDto,
  UnitStatusDto,
  UnitSourceTypeDto,
  InspectionStageDto,
  InspectionOutcomeDto,
  InspectionDispositionDto,
  VariantTrackingModeDto,
  PaginationDto,
} from '@maevelle/contracts';

import { inventoryRequest } from './api';

export interface ListUnitsQuery {
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
  readonly search?: string | undefined;
  readonly variantId?: string | undefined;
  readonly sku?: string | undefined;
  readonly locationId?: string | undefined;
  readonly condition?: UnitConditionDto | undefined;
  readonly status?: UnitStatusDto | undefined;
  readonly sourceReceiptId?: string | undefined;
  readonly packageReference?: string | undefined;
}

export interface ListUnitsResponse {
  readonly data: readonly InventoryUnitDto[];
  readonly pagination: PaginationDto;
}

export interface RegisterUnitsInput {
  readonly variantId: string;
  readonly locationId: string;
  readonly count: number;
  readonly sourceType?: UnitSourceTypeDto | undefined;
  readonly sourceReceiptId?: string | undefined;
  readonly sourceReceiptLineId?: string | undefined;
  readonly packageReference?: string | undefined;
  readonly storageNotes?: string | undefined;
}

export interface PerformInspectionInput {
  readonly inspectionStage: InspectionStageDto;
  readonly conditionResult: UnitConditionDto;
  readonly defectDescription?: string | undefined;
  readonly notes?: string | undefined;
  readonly photoAssetIds?: readonly string[] | undefined;
  readonly disposition?: InspectionDispositionDto | undefined;
}

export interface BulkInspectInput {
  readonly unitIds: readonly string[];
  readonly conditionResult: UnitConditionDto;
  readonly defectDescription?: string | undefined;
  readonly notes?: string | undefined;
  readonly disposition?: InspectionDispositionDto | undefined;
}

export interface RequestRepairInput {
  readonly defectDescription: string;
  readonly actionRequired?: string | undefined;
  readonly notes?: string | undefined;
}

export interface CompleteRepairInput {
  readonly actionPerformed: string;
  readonly technicianName?: string | undefined;
  readonly costAmount?: string | undefined;
  readonly costCurrency?: string | undefined;
  readonly notes?: string | undefined;
  readonly photoAssetIds?: readonly string[] | undefined;
}

export interface MoveLocationInput {
  readonly newLocationId: string;
  readonly reason?: string | undefined;
}

export interface BulkMoveLocationInput {
  readonly unitIds: readonly string[];
  readonly newLocationId: string;
  readonly reason?: string | undefined;
}

export interface UpdatePackagingInput {
  readonly packageReference?: string | undefined;
  readonly storageNotes?: string | undefined;
}

export interface ReleaseUnitInput {
  readonly reason?: string | undefined;
  readonly targetCondition?: UnitConditionDto | undefined;
}

export interface WriteOffUnitInput {
  readonly reason: string;
}

export interface ReceiveReturnInput {
  readonly receivingLocationId: string;
  readonly returnReceiptId?: string | undefined;
  readonly condition?: UnitConditionDto | undefined;
  readonly notes?: string | undefined;
}

export interface SetTrackingModeInput {
  readonly variantId: string;
  readonly trackingMode: VariantTrackingModeDto;
}

export interface ConvertStockInput {
  readonly variantId: string;
  readonly locationId: string;
  readonly count: number;
  readonly storageNotes?: string | undefined;
}

export interface AllocateFulfillmentUnitsInput {
  readonly fulfillmentId: string;
  readonly allocations: readonly {
    readonly fulfillmentLineId: string;
    readonly unitId: string;
  }[];
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export async function listInventoryUnits(query: ListUnitsQuery = {}): Promise<ListUnitsResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.variantId) params.set('variantId', query.variantId);
  if (query.sku?.trim()) params.set('sku', query.sku.trim());
  if (query.locationId) params.set('locationId', query.locationId);
  if (query.condition) params.set('condition', query.condition);
  if (query.status) params.set('status', query.status);
  if (query.sourceReceiptId) params.set('sourceReceiptId', query.sourceReceiptId);
  if (query.packageReference?.trim()) params.set('packageReference', query.packageReference.trim());

  const queryString = params.toString();
  const endpoint = `/admin/inventory/units${queryString ? `?${queryString}` : ''}`;
  return inventoryRequest<ListUnitsResponse>(endpoint);
}

export async function lookupUnitByCode(code: string): Promise<UnitBarcodeLookupDto> {
  const params = new URLSearchParams({ code: code.trim() });
  const response = await inventoryRequest<{ readonly data: UnitBarcodeLookupDto }>(
    `/admin/inventory/units/lookup?${params.toString()}`,
  );
  return response.data;
}

export async function getInventoryUnit(unitId: string): Promise<InventoryUnitDto> {
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}`,
  );
  return response.data;
}

export async function getUnitInspections(unitId: string): Promise<readonly UnitInspectionDto[]> {
  const response = await inventoryRequest<{ readonly data: readonly UnitInspectionDto[] }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/inspections`,
  );
  return response.data;
}

export async function getUnitRepairs(unitId: string): Promise<readonly UnitRepairDto[]> {
  const response = await inventoryRequest<{ readonly data: readonly UnitRepairDto[] }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/repairs`,
  );
  return response.data;
}

export async function getUnitEvents(unitId: string): Promise<readonly UnitEventDto[]> {
  const response = await inventoryRequest<{ readonly data: readonly UnitEventDto[] }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/events`,
  );
  return response.data;
}

export function getUnitBarcodeSvgUrl(unitId: string): string {
  return `/api/admin/inventory/units/${encodeURIComponent(unitId)}/barcode.svg`;
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

export async function registerInventoryUnits(
  input: RegisterUnitsInput,
): Promise<readonly InventoryUnitDto[]> {
  const response = await inventoryRequest<{ readonly data: readonly InventoryUnitDto[] }>(
    '/admin/inventory/units/register',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function performUnitInspection(
  unitId: string,
  input: PerformInspectionInput,
): Promise<{ readonly unit: InventoryUnitDto; readonly inspection: UnitInspectionDto }> {
  const response = await inventoryRequest<{
    readonly data: { readonly unit: InventoryUnitDto; readonly inspection: UnitInspectionDto };
  }>(`/admin/inventory/units/${encodeURIComponent(unitId)}/inspect`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function bulkInspectUnits(
  input: BulkInspectInput,
): Promise<{ readonly inspectedCount: number; readonly units: readonly InventoryUnitDto[] }> {
  const response = await inventoryRequest<{
    readonly data: { readonly inspectedCount: number; readonly units: readonly InventoryUnitDto[] };
  }>('/admin/inventory/units/bulk-inspect', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function requestUnitRepair(
  unitId: string,
  input: RequestRepairInput,
): Promise<{ readonly unit: InventoryUnitDto; readonly repair: UnitRepairDto }> {
  const response = await inventoryRequest<{
    readonly data: { readonly unit: InventoryUnitDto; readonly repair: UnitRepairDto };
  }>(`/admin/inventory/units/${encodeURIComponent(unitId)}/repair-requests`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function completeUnitRepair(
  repairId: string,
  input: CompleteRepairInput,
): Promise<{ readonly unit: InventoryUnitDto; readonly repair: UnitRepairDto }> {
  const response = await inventoryRequest<{
    readonly data: { readonly unit: InventoryUnitDto; readonly repair: UnitRepairDto };
  }>(`/admin/inventory/units/repairs/${encodeURIComponent(repairId)}/complete`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function moveUnitLocation(
  unitId: string,
  input: MoveLocationInput,
): Promise<InventoryUnitDto> {
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/move-location`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function bulkMoveUnitsLocation(
  input: BulkMoveLocationInput,
): Promise<{ readonly movedCount: number; readonly units: readonly InventoryUnitDto[] }> {
  const response = await inventoryRequest<{
    readonly data: { readonly movedCount: number; readonly units: readonly InventoryUnitDto[] };
  }>('/admin/inventory/units/bulk-move', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function updateUnitPackaging(
  unitId: string,
  input: UpdatePackagingInput,
): Promise<InventoryUnitDto> {
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/packaging`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function releaseUnitForSale(
  unitId: string,
  input: ReleaseUnitInput = {},
): Promise<InventoryUnitDto> {
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/release`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function writeOffUnit(
  unitId: string,
  input: WriteOffUnitInput,
): Promise<InventoryUnitDto> {
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/write-off`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function receiveReturnedUnit(
  unitId: string,
  input: ReceiveReturnInput,
): Promise<InventoryUnitDto> {
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/receive-return`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function setVariantTrackingMode(
  input: SetTrackingModeInput,
): Promise<{ readonly variantId: string; readonly trackingMode: VariantTrackingModeDto }> {
  const response = await inventoryRequest<{
    readonly data: { readonly variantId: string; readonly trackingMode: VariantTrackingModeDto };
  }>('/admin/inventory/variants/tracking-mode', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function convertStockToSerialized(
  input: ConvertStockInput,
): Promise<{
  readonly variantId: string;
  readonly registeredUnitsCount: number;
  readonly units: readonly InventoryUnitDto[];
}> {
  const response = await inventoryRequest<{
    readonly data: {
      readonly variantId: string;
      readonly registeredUnitsCount: number;
      readonly units: readonly InventoryUnitDto[];
    };
  }>('/admin/inventory/variants/convert-to-serialized', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function reconcileSerializedInventory(
  variantId: string,
  locationId: string,
): Promise<SerializedStockReconciliationDto> {
  const params = new URLSearchParams({ locationId });
  const response = await inventoryRequest<{ readonly data: SerializedStockReconciliationDto }>(
    `/admin/inventory/variants/${encodeURIComponent(variantId)}/reconciliation?${params.toString()}`,
  );
  return response.data;
}

export async function allocateUnitsToFulfillment(
  input: AllocateFulfillmentUnitsInput,
): Promise<{ readonly allocatedCount: number; readonly allocations: readonly unknown[] }> {
  const response = await inventoryRequest<{
    readonly data: { readonly allocatedCount: number; readonly allocations: readonly unknown[] };
  }>(`/admin/fulfillments/${encodeURIComponent(input.fulfillmentId)}/units`, {
    method: 'POST',
    body: JSON.stringify({ allocations: input.allocations }),
  });
  return response.data;
}
