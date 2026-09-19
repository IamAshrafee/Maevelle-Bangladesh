import { sql } from 'kysely';

import {
  createManagedCatalogProductType,
  updateManagedCatalogProductType,
  type CatalogDefinitionStatus,
} from '../../catalog-product-types.js';
import { productTypeSeedData } from '../data/product-types.js';
import type { ProductTypeSeedItem, SeedContext, SeedModule, SeedModuleResult } from '../types.js';

interface ExistingProductTypeRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: CatalogDefinitionStatus;
  readonly version: string;
  readonly primary_category_id: string | null;
}

export function createProductTypesSeedModule(
  items: readonly ProductTypeSeedItem[] = productTypeSeedData,
): SeedModule {
  return {
    id: 'product-types',
    name: 'Product Types',
    description: 'Canonical structural product definitions with default category placement',
    scope: 'bootstrap',
    dependencies: ['categories'],
    async run(context: SeedContext): Promise<SeedModuleResult> {
      const [types, categories] = await Promise.all([
        sql<ExistingProductTypeRow>`select id::text,code,name,status,version::text,primary_category_id::text
          from catalog.product_types where organization_id=${context.organizationId}`.execute(context.db),
        sql<{ id: string; handle: string }>`select id::text,handle from catalog.categories
          where organization_id=${context.organizationId} and status='ACTIVE'`.execute(context.db),
      ]);
      const existingByCode = new Map(types.rows.map((row) => [row.code, row]));
      const categoryIdByHandle = new Map(categories.rows.map((row) => [row.handle, row.id]));
      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      for (const item of items) {
        const primaryCategoryId = categoryIdByHandle.get(item.primaryCategoryHandle);
        if (!primaryCategoryId)
          throw new Error(`Product Type "${item.code}" references unknown active category "${item.primaryCategoryHandle}".`);
        const status = item.status ?? 'ACTIVE';
        const existing = existingByCode.get(item.code);
        if (!existing) {
          const created = await createManagedCatalogProductType(context.db, {
            organizationId: context.organizationId,
            actorId: context.actorId,
            code: item.code,
            name: item.name,
            primaryCategoryId,
          });
          existingByCode.set(item.code, {
            id: created.id, code: item.code, name: item.name, status, version: '1', primary_category_id: primaryCategoryId,
          });
          createdCount += 1;
        } else if (
          existing.name !== item.name ||
          existing.status !== status ||
          existing.primary_category_id !== primaryCategoryId
        ) {
          await updateManagedCatalogProductType(context.db, {
            organizationId: context.organizationId,
            actorId: context.actorId,
            productTypeId: existing.id,
            expectedVersion: Number(existing.version),
            name: item.name,
            status,
            primaryCategoryId,
          });
          existingByCode.set(item.code, {
            ...existing, name: item.name, status, version: String(Number(existing.version) + 1), primary_category_id: primaryCategoryId,
          });
          updatedCount += 1;
        } else {
          unchangedCount += 1;
        }
      }

      return {
        moduleId: 'product-types', moduleName: 'Product Types', totalCount: items.length,
        createdCount, updatedCount, unchangedCount, failedCount: 0,
      };
    },
  };
}

export const productTypesSeedModule = createProductTypesSeedModule();
