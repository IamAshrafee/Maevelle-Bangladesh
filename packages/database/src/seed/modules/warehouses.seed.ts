import { sql } from 'kysely';

import {
  createLocation,
  updateLocation,
  type LocationCapability,
} from '../../warehouse.js';
import {
  ALL_LOCATION_CAPABILITIES,
  warehouseSeedData,
} from '../data/warehouses.js';
import type {
  SeedContext,
  SeedModule,
  SeedModuleResult,
  WarehouseSeedItem,
} from '../types.js';

interface ExistingWarehouseRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly location_type: string;
  readonly status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly version: string;
  readonly address_json: Record<string, unknown> | null;
  readonly capabilities: string[] | null;
}

function normalizeAddress(
  addr: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!addr || typeof addr !== 'object') return null;
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(addr)) {
    if (val !== undefined && val !== null && val !== '') {
      normalized[key] = typeof val === 'string' ? val.trim() : val;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function areAddressesEqual(
  existing: Record<string, unknown> | null | undefined,
  desired: Record<string, unknown> | null | undefined,
): boolean {
  const normA = normalizeAddress(existing);
  const normB = normalizeAddress(desired);
  if (!normA && !normB) return true;
  if (!normA || !normB) return false;
  const keysA = Object.keys(normA).sort();
  const keysB = Object.keys(normB).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => normA[key] === normB[key]);
}

function areCapabilitiesEqual(
  existingCaps: readonly string[] | null | undefined,
  desiredCaps: readonly string[],
): boolean {
  const setA = new Set(existingCaps ?? []);
  const setB = new Set(desiredCaps);
  if (setA.size !== setB.size) return false;
  for (const cap of setA) {
    if (!setB.has(cap)) return false;
  }
  return true;
}

/**
 * Creates a Warehouse Seed Module with custom or canonical warehouse facilities.
 */
export function createWarehousesSeedModule(
  items: readonly WarehouseSeedItem[] = warehouseSeedData,
): SeedModule {
  return {
    id: 'warehouses',
    name: 'Warehouses',
    description:
      'Operational warehouses and fulfillment facilities with full capability matrices and addressing',
    scope: 'bootstrap',
    dependencies: [],
    async run(context: SeedContext): Promise<SeedModuleResult> {
      // 1. Fetch current locations and their assigned capabilities for this tenant
      const existingRows = (
        await sql<ExistingWarehouseRow>`
          select
            location.id::text,
            location.code,
            location.name,
            location.location_type,
            location.status,
            location.version::text,
            location.address_json,
            array_remove(array_agg(capability.capability_code order by capability.capability_code), null) as capabilities
          from warehouse.locations location
          left join warehouse.location_capabilities capability
            on capability.location_id = location.id
            and capability.organization_id = location.organization_id
          where location.organization_id = ${context.organizationId}
          group by location.id
        `.execute(context.db)
      ).rows;

      const existingByCode = new Map<string, ExistingWarehouseRow>();
      const existingByName = new Map<string, ExistingWarehouseRow>();
      for (const row of existingRows) {
        existingByCode.set(row.code.toUpperCase(), row);
        existingByName.set(row.name.trim().toLowerCase(), row);
      }

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      for (const item of items) {
        const code = item.code.trim().toUpperCase();
        const name = item.name.trim();
        const locationType = item.locationType ?? 'WAREHOUSE';
        const status = item.status ?? 'ACTIVE';
        const capabilities = item.capabilities ?? ALL_LOCATION_CAPABILITIES;
        const address = item.address ? (item.address as Record<string, unknown>) : undefined;

        // Check if location exists by primary code, previous codes, or exact name
        let existing = existingByCode.get(code);
        if (!existing && item.previousCodes?.length) {
          for (const prev of item.previousCodes) {
            const found = existingByCode.get(prev.trim().toUpperCase());
            if (found) {
              existing = found;
              break;
            }
          }
        }
        if (!existing) {
          existing = existingByName.get(name.toLowerCase());
        }

        if (!existing) {
          // CREATE LOCATION
          const created = await createLocation(context.db, {
            organizationId: context.organizationId,
            actorId: context.actorId,
            code,
            name,
            locationType,
            capabilities,
            status,
            ...(address ? { address } : {}),
          });

          const newRow: ExistingWarehouseRow = {
            id: created.id,
            code,
            name,
            location_type: locationType,
            status,
            version: '1',
            address_json: address ?? null,
            capabilities: [...capabilities],
          };
          existingByCode.set(code, newRow);
          existingByName.set(name.toLowerCase(), newRow);
          createdCount += 1;
        } else {
          // EVALUATE FOR UPDATES
          const nameChanged = existing.name.trim() !== name;
          const statusChanged = existing.status !== status;
          const capabilitiesChanged = !areCapabilitiesEqual(existing.capabilities, capabilities);
          const addressChanged = !areAddressesEqual(existing.address_json, address);

          if (nameChanged || statusChanged || capabilitiesChanged || addressChanged) {
            await updateLocation(context.db, {
              organizationId: context.organizationId,
              actorId: context.actorId,
              locationId: existing.id,
              expectedVersion: Number(existing.version),
              name,
              ...(status !== 'DRAFT' ? { status } : {}),
              capabilities,
              address: address ?? null,
            });


            const nextVersion = String(Number(existing.version) + 1);
            const updatedRow: ExistingWarehouseRow = {
              ...existing,
              name,
              status,
              version: nextVersion,
              address_json: address ?? null,
              capabilities: [...capabilities],
            };
            existingByCode.set(code, updatedRow);
            existingByName.set(name.toLowerCase(), updatedRow);
            updatedCount += 1;
          } else {
            unchangedCount += 1;
          }
        }
      }

      return {
        moduleId: 'warehouses',
        moduleName: 'Warehouses',
        totalCount: items.length,
        createdCount,
        updatedCount,
        unchangedCount,
        failedCount: 0,
      };
    },
  };
}

export const warehousesSeedModule = createWarehousesSeedModule();
