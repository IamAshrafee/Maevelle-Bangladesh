import { sql } from 'kysely';

import { createCatalogColor, updateCatalogColor } from '../../catalog.js';
import { colorSeedData } from '../data/colors.js';
import type {
  ColorSeedItem,
  SeedContext,
  SeedModule,
  SeedModuleResult,
} from '../types.js';

interface ExistingColorRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly hex_value: string | null;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly version: string;
}

/**
 * Creates a Colors Seed Module with custom or canonical fashion colors.
 */
export function createColorsSeedModule(
  items: readonly ColorSeedItem[] = colorSeedData,
): SeedModule {
  return {
    id: 'colors',
    name: 'Colors',
    description:
      'Standardized fashion color palette, HEX definitions, and swatches',
    scope: 'bootstrap',
    dependencies: [],
    async run(context: SeedContext): Promise<SeedModuleResult> {
      // 1. Fetch current colors for this organization
      const existingRows = (
        await sql<ExistingColorRow>`
          select id::text, code, name, hex_value, status, version::text
          from catalog.colors
          where organization_id = ${context.organizationId}
        `.execute(context.db)
      ).rows;

      const existingByCode = new Map<string, ExistingColorRow>();
      const existingByName = new Map<string, ExistingColorRow>();
      for (const row of existingRows) {
        existingByCode.set(row.code.toLowerCase(), row);
        existingByName.set(row.name.trim().toLowerCase(), row);
      }

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      for (const item of items) {
        const code = item.code.trim().toLowerCase();
        const name = item.name.trim();
        const hexValue = item.hexValue ? item.hexValue.trim().toUpperCase() : null;
        const status = item.status ?? 'ACTIVE';

        // Check if color exists by code, previous codes, or exact name
        let existing = existingByCode.get(code);
        if (!existing && item.previousCodes?.length) {
          for (const prev of item.previousCodes) {
            const found = existingByCode.get(prev.trim().toLowerCase());
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
          // CREATE COLOR
          const created = await createCatalogColor(context.db, {
            organizationId: context.organizationId,
            code,
            name,
            ...(hexValue ? { hexValue } : {}),
          });

          const newRow: ExistingColorRow = {
            id: created.id,
            code,
            name,
            hex_value: hexValue,
            status,
            version: '1',
          };
          existingByCode.set(code, newRow);
          existingByName.set(name.toLowerCase(), newRow);
          createdCount += 1;
        } else {
          // EVALUATE FOR UPDATES
          const nameChanged = existing.name.trim() !== name;
          const codeChanged = existing.code !== code;
          const hexChanged = (existing.hex_value?.toUpperCase() ?? null) !== hexValue;
          const statusChanged = existing.status !== status;

          if (nameChanged || codeChanged || hexChanged || statusChanged) {
            await updateCatalogColor(context.db, {
              organizationId: context.organizationId,
              colorId: existing.id,
              expectedVersion: Number(existing.version),
              name,
              code,
              hexValue,
              status,
            });

            const nextVersion = String(Number(existing.version) + 1);
            const updatedRow: ExistingColorRow = {
              ...existing,
              code,
              name,
              hex_value: hexValue,
              status,
              version: nextVersion,
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
        moduleId: 'colors',
        moduleName: 'Colors',
        totalCount: items.length,
        createdCount,
        updatedCount,
        unchangedCount,
        failedCount: 0,
      };
    },
  };
}

export const colorsSeedModule = createColorsSeedModule();
