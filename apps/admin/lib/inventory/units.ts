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
  InspectionDispositionDto,
  VariantTrackingModeDto,
  InventoryConditionDto,
  PaginationDto,
} from '@maevelle/contracts';

import { inventoryRequest } from './api';

function commandHeaders(): HeadersInit {
  return { 'idempotency-key': crypto.randomUUID() };
}

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
  readonly attention?: 'REPAIR' | undefined;
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
  readonly inventoryCondition?: InventoryConditionDto | undefined;
  readonly packageReference?: string | undefined;
  readonly storageNotes?: string | undefined;
}

export interface PerformInspectionInput {
  readonly expectedVersion: number;
  readonly inspectionStage: InspectionStageDto;
  readonly conditionResult: UnitConditionDto;
  readonly defectDescription?: string | undefined;
  readonly notes?: string | undefined;
  readonly photoAssetIds?: readonly string[] | undefined;
  readonly disposition?: InspectionDispositionDto | undefined;
}

export interface BulkInspectInput {
  readonly units: readonly { readonly unitId: string; readonly expectedVersion: number }[];
  readonly inspectionStage?: InspectionStageDto | undefined;
  readonly conditionResult: UnitConditionDto;
  readonly defectDescription?: string | undefined;
  readonly notes?: string | undefined;
  readonly disposition?: InspectionDispositionDto | undefined;
}

export interface RequestRepairInput {
  readonly expectedVersion: number;
  readonly defectDescription: string;
  readonly actionRequired?: string | undefined;
  readonly notes?: string | undefined;
}

export interface CompleteRepairInput {
  readonly expectedVersion: number;
  readonly actionPerformed: string;
  readonly technicianName?: string | undefined;
  readonly costAmount?: string | undefined;
  readonly costCurrency?: string | undefined;
  readonly notes?: string | undefined;
  readonly photoAssetIds?: readonly string[] | undefined;
}

export interface MoveLocationInput {
  readonly expectedVersion: number;
  readonly newLocationId: string;
  readonly reason?: string | undefined;
}

export interface BulkMoveLocationInput {
  readonly units: readonly { readonly unitId: string; readonly expectedVersion: number }[];
  readonly newLocationId: string;
  readonly reason?: string | undefined;
}

export interface UpdatePackagingInput {
  readonly expectedVersion: number;
  readonly packageReference?: string | undefined;
  readonly storageNotes?: string | undefined;
}

export interface ReleaseUnitInput {
  readonly expectedVersion: number;
  readonly reason: string;
}

export interface WriteOffUnitInput {
  readonly expectedVersion: number;
  readonly reason: string;
}

export interface ReceiveReturnInput {
  readonly expectedVersion: number;
  readonly receivingLocationId: string;
  readonly returnReceiptId?: string | undefined;
  readonly condition?: UnitConditionDto | undefined;
  readonly notes?: string | undefined;
}

export interface SetTrackingModeInput {
  readonly variantId: string;
  readonly trackingMode: VariantTrackingModeDto;
  readonly expectedVersion: number;
}

export interface ConvertStockInput {
  readonly variantId: string;
  readonly locationId: string;
  readonly expectedVersion: number;
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
  const { count, ...registration } = input;
  const response = await inventoryRequest<{ readonly data: readonly InventoryUnitDto[] }>(
    '/admin/inventory/units/register',
    {
      method: 'POST',
      headers: commandHeaders(),
      body: JSON.stringify({ ...registration, quantity: count }),
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
  }>(`/admin/inventory/units/${encodeURIComponent(unitId)}/inspections`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify({
      ...input,
      inspectionStage: input.inspectionStage ?? 'INBOUND_INTAKE',
      outcome:
        input.disposition === 'RELEASE_SELLABLE'
          ? 'PASSED'
          : input.disposition === 'RESTRICTED_SALE'
            ? 'PASSED_WITH_DEFECT'
            : input.disposition === 'MOVE_TO_REPAIR'
              ? 'HOLD_FOR_REPAIR'
              : 'QUARANTINE_DAMAGED',
      mediaAssetIds: input.photoAssetIds,
      photoAssetIds: undefined,
    }),
  });
  return response.data;
}

export async function bulkInspectUnits(
  input: BulkInspectInput,
): Promise<{ readonly inspectedCount: number; readonly units: readonly InventoryUnitDto[] }> {
  const response = await inventoryRequest<{
    readonly data: { readonly count: number; readonly units: readonly InventoryUnitDto[] };
  }>('/admin/inventory/units/bulk-inspect', {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify({
      ...input,
      inspectionStage: input.inspectionStage ?? 'INBOUND_INTAKE',
      outcome:
        input.disposition === 'RELEASE_SELLABLE'
          ? 'PASSED'
          : input.disposition === 'RESTRICTED_SALE'
            ? 'PASSED_WITH_DEFECT'
            : input.disposition === 'MOVE_TO_REPAIR'
              ? 'HOLD_FOR_REPAIR'
              : 'QUARANTINE_DAMAGED',
    }),
  });
  return { inspectedCount: response.data.count, units: response.data.units };
}

export async function requestUnitRepair(
  unitId: string,
  input: RequestRepairInput,
): Promise<UnitRepairDto> {
  const response = await inventoryRequest<{
    readonly data: UnitRepairDto;
  }>(`/admin/inventory/units/${encodeURIComponent(unitId)}/repairs`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function completeUnitRepair(
  repairId: string,
  input: CompleteRepairInput,
): Promise<UnitRepairDto> {
  const response = await inventoryRequest<{
    readonly data: UnitRepairDto;
  }>(`/admin/inventory/units/repairs/${encodeURIComponent(repairId)}/complete`, {
    method: 'PATCH',
    headers: commandHeaders(),
    body: JSON.stringify({
      ...input,
      mediaAssetIds: input.photoAssetIds,
      photoAssetIds: undefined,
    }),
  });
  return response.data;
}

export async function moveUnitLocation(
  unitId: string,
  input: MoveLocationInput,
): Promise<InventoryUnitDto> {
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/location`,
    {
      method: 'PATCH',
      headers: commandHeaders(),
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function bulkMoveUnitsLocation(
  input: BulkMoveLocationInput,
): Promise<{ readonly movedCount: number; readonly units: readonly InventoryUnitDto[] }> {
  const response = await inventoryRequest<{
    readonly data: { readonly count: number; readonly units: readonly InventoryUnitDto[] };
  }>('/admin/inventory/units/bulk-location', {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input),
  });
  return { movedCount: response.data.count, units: response.data.units };
}

export async function updateUnitPackaging(
  unitId: string,
  input: UpdatePackagingInput,
): Promise<InventoryUnitDto> {
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/packaging`,
    {
      method: 'PATCH',
      headers: commandHeaders(),
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function releaseUnitForSale(
  unitId: string,
  input: ReleaseUnitInput,
): Promise<InventoryUnitDto> {
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/release`,
    {
      method: 'POST',
      headers: commandHeaders(),
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
      headers: commandHeaders(),
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function receiveReturnedUnit(
  unitId: string,
  input: ReceiveReturnInput,
): Promise<InventoryUnitDto> {
  const { returnReceiptId, condition, ...returnIntake } = input;
  const response = await inventoryRequest<{ readonly data: InventoryUnitDto }>(
    `/admin/inventory/units/${encodeURIComponent(unitId)}/receive-return`,
    {
      method: 'POST',
      headers: commandHeaders(),
      body: JSON.stringify({
        ...returnIntake,
        sourceReturnReceiptId: returnReceiptId,
        conditionResult: condition,
      }),
    },
  );
  return response.data;
}

export async function setVariantTrackingMode(input: SetTrackingModeInput): Promise<{
  readonly variantId: string;
  readonly trackingMode: VariantTrackingModeDto;
  readonly version: number;
}> {
  const response = await inventoryRequest<{
    readonly data: {
      readonly variantId: string;
      readonly trackingMode: VariantTrackingModeDto;
      readonly version: number;
    };
  }>('/admin/inventory/units/tracking-mode', {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function convertStockToSerialized(input: ConvertStockInput): Promise<{
  readonly variantId: string;
  readonly registeredUnitsCount: number;
  readonly units: readonly InventoryUnitDto[];
}> {
  const response = await inventoryRequest<{
    readonly data: {
      readonly variantId: string;
      readonly unitsCreated: number;
      readonly units: readonly InventoryUnitDto[];
    };
  }>('/admin/inventory/units/convert-stock', {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify({
      variantId: input.variantId,
      locationId: input.locationId,
      expectedVersion: input.expectedVersion,
      storageNotes: input.storageNotes,
    }),
  });
  return {
    variantId: response.data.variantId,
    registeredUnitsCount: response.data.unitsCreated,
    units: response.data.units,
  };
}

export async function reconcileSerializedInventory(
  variantId: string,
  locationId: string,
): Promise<SerializedStockReconciliationDto> {
  const response = await inventoryRequest<{ readonly data: SerializedStockReconciliationDto }>(
    `/admin/inventory/units/reconcile?${new URLSearchParams({ variantId, locationId }).toString()}`,
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
