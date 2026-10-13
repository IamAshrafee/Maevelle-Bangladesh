import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  listInventoryUnits,
  lookupUnitByCode,
  performUnitInspection,
  bulkInspectUnits,
  completeUnitRepair,
  convertStockToSerialized,
  allocateUnitsToFulfillment,
  getUnitBarcodeSvgUrl,
} from './units';
import { InventoryRequestError, isInventoryConflictError } from './api';

// Mock global fetch for API client tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Individual Unit Traceability Frontend API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs correct query params for listInventoryUnits', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'unit-1',
            unitCode: 'MVU-000101',
            sku: 'MAE-DR-0042-PNK-M',
            productTitle: 'Floral Midi Dress',
            currentCondition: 'GRADE_A',
            status: 'AVAILABLE',
          },
        ],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      }),
    });

    const result = await listInventoryUnits({
      page: 1,
      pageSize: 25,
      search: 'MVU-000101',
      sku: 'MAE-DR-0042-PNK-M',
      status: 'AVAILABLE',
      condition: 'GRADE_A',
      locationId: 'loc-1',
      attention: 'REPAIR',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/admin/inventory/units?');
    expect(url).toContain('page=1');
    expect(url).toContain('pageSize=25');
    expect(url).toContain('search=MVU-000101');
    expect(url).toContain('sku=MAE-DR-0042-PNK-M');
    expect(url).toContain('status=AVAILABLE');
    expect(url).toContain('condition=GRADE_A');
    expect(url).toContain('locationId=loc-1');
    expect(url).toContain('attention=REPAIR');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.unitCode).toBe('MVU-000101');
  });

  it('preserves inventory conflict details for recoverable command errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'STALE_VERSION',
          message: 'The physical unit changed after this form opened.',
          requestId: 'request-123',
        },
      }),
    });

    const error = await listInventoryUnits().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InventoryRequestError);
    expect(isInventoryConflictError(error)).toBe(true);
    expect(error).toMatchObject({
      status: 409,
      code: 'STALE_VERSION',
      requestId: 'request-123',
    });
  });

  it('correctly handles fast scannable barcode lookup', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          unit: {
            id: 'unit-108',
            unitCode: 'MVU-000108',
            sku: 'MAE-DR-0042-PNK-M',
            productTitle: 'Floral Midi Dress',
            currentCondition: 'GRADE_A',
            status: 'AVAILABLE',
            barcodePayload: 'MVU-000108',
          },
          scannableCode: 'MVU-000108',
          barcodePayload: 'MVU-000108',
          permittedTransitions: ['RESERVED', 'ON_HOLD'],
        },
      }),
    });

    const lookup = await lookupUnitByCode('MVU-000108');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/admin/inventory/units/lookup?code=MVU-000108');
    expect(lookup.unit.unitCode).toBe('MVU-000108');
    expect(lookup.permittedTransitions).toContain('RESERVED');
  });

  it('formats SVG barcode URL correctly', () => {
    const url = getUnitBarcodeSvgUrl('unit-xyz');
    expect(url).toBe('/api/admin/inventory/units/unit-xyz/barcode.svg');
  });

  it('sends correct JSON payload for bulk QC inspection (Scenario B)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          count: 7,
          units: Array.from({ length: 7 }, (_, i) => ({
            id: `unit-${i + 1}`,
            unitCode: `MVU-00010${i + 1}`,
            currentCondition: 'GRADE_A',
            status: 'AVAILABLE',
          })),
        },
      }),
    });

    const res = await bulkInspectUnits({
      units: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'].map((unitId) => ({
        unitId,
        expectedVersion: 1,
      })),
      inspectionStage: 'REINSPECTION',
      conditionResult: 'GRADE_A',
      disposition: 'RELEASE_SELLABLE',
      notes: 'Passed 7 flawless dresses in bulk',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/admin/inventory/units/bulk-inspect');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string);
    expect(body.units).toHaveLength(7);
    expect(body.conditionResult).toBe('GRADE_A');
    expect(body.inspectionStage).toBe('REINSPECTION');
    expect(body.disposition).toBe('RELEASE_SELLABLE');
    expect(res.inspectedCount).toBe(7);
  });

  it('handles individual unit defect inspection with photo attachment', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          unit: {
            id: 'unit-8',
            unitCode: 'MVU-000108',
            currentCondition: 'GRADE_B',
            status: 'AVAILABLE',
          },
          inspection: {
            id: 'insp-1',
            unitId: 'unit-8',
            unitCode: 'MVU-000108',
            conditionResult: 'GRADE_B',
            defectDescription: 'Minor seam fraying on inner hem',
            disposition: 'RESTRICTED_SALE',
          },
        },
      }),
    });

    const res = await performUnitInspection('unit-8', {
      expectedVersion: 3,
      inspectionStage: 'INBOUND_INTAKE',
      conditionResult: 'GRADE_B',
      defectDescription: 'Minor seam fraying on inner hem',
      disposition: 'RESTRICTED_SALE',
      photoAssetIds: ['asset-photo-1'],
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/admin/inventory/units/unit-8/inspections');
    const body = JSON.parse(init?.body as string);
    expect(body.conditionResult).toBe('GRADE_B');
    expect(body.defectDescription).toBe('Minor seam fraying on inner hem');
    expect(body.mediaAssetIds).toEqual(['asset-photo-1']);
    expect(body.outcome).toBe('PASSED_WITH_DEFECT');
    expect(res.unit.currentCondition).toBe('GRADE_B');
  });

  it('handles repair completion and routes for reinspection', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'rep-1',
          unitId: 'unit-9',
          repairStatus: 'COMPLETED',
          actionPerformed: 'Re-stitched seam zipper',
          technicianName: 'Rafiq',
          costAmount: '120.00',
          costCurrency: 'BDT',
        },
      }),
    });

    const res = await completeUnitRepair('rep-1', {
      expectedVersion: 2,
      actionPerformed: 'Re-stitched seam zipper',
      technicianName: 'Rafiq',
      costAmount: '120.00',
      costCurrency: 'BDT',
      notes: 'Repair complete, ready for reinspection',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/admin/inventory/units/repairs/rep-1/complete');
    const body = JSON.parse(init?.body as string);
    expect(body.actionPerformed).toBe('Re-stitched seam zipper');
    expect(body.costAmount).toBe('120.00');
    expect(init?.method).toBe('PATCH');
    expect(res.repairStatus).toBe('COMPLETED');
  });

  it('handles stock conversion to serialized inventory', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          variantId: 'var-1',
          unitsCreated: 11,
          units: Array.from({ length: 11 }, (_, i) => ({
            id: `unit-${i + 1}`,
            unitCode: `MVU-0001${String(i + 1).padStart(2, '0')}`,
            status: 'AWAITING_QC',
          })),
        },
      }),
    });

    const res = await convertStockToSerialized({
      variantId: 'var-1',
      locationId: 'loc-main',
      expectedVersion: 4,
      storageNotes: 'Converted 11 dresses from warehouse floor',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/admin/inventory/units/convert-stock');
    const body = JSON.parse(init?.body as string);
    expect(body.count).toBeUndefined();
    expect(body.expectedVersion).toBe(4);
    expect(init?.headers).toMatchObject({ 'idempotency-key': expect.any(String) });
    expect(res.registeredUnitsCount).toBe(11);
  });

  it('verifies fulfillment unit allocation payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          allocatedCount: 1,
          allocations: [{ fulfillmentLineId: 'line-1', unitId: 'unit-101' }],
        },
      }),
    });

    const res = await allocateUnitsToFulfillment({
      fulfillmentId: 'ful-1',
      allocations: [{ fulfillmentLineId: 'line-1', unitId: 'unit-101' }],
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/admin/fulfillments/ful-1/units');
    const body = JSON.parse(init?.body as string);
    expect(body.allocations).toEqual([{ fulfillmentLineId: 'line-1', unitId: 'unit-101' }]);
    expect(res.allocatedCount).toBe(1);
  });
});
