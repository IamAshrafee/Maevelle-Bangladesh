import { sql } from 'kysely';
import { createManagedCategory, updateManagedCategory } from '../../catalog-classification.js';
import { categorySeedData } from '../data/categories.js';
import { slugify } from '../helpers/slug.js';
import type { CategorySeedItem, SeedContext, SeedModule, SeedModuleResult } from '../types.js';

interface ExistingCategoryRow {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  readonly parent_category_id: string | null;
  readonly position: number;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly version: string;
  readonly default_size_guide_id: string | null;
}

/**
 * Creates a Category Seed Module with custom or canonical data.
 */
export function createCategoriesSeedModule(
  items: readonly CategorySeedItem[] = categorySeedData,
): SeedModule {
  return {
    id: 'categories',
    name: 'Categories',
    description:
      'Hierarchical product category taxonomy with change-detection and cycle protection',
    scope: 'bootstrap',
    async run(context: SeedContext): Promise<SeedModuleResult> {
      // 1. Fetch current categories for this organization
      const existingRows = (
        await sql<ExistingCategoryRow>`
          select id::text, handle, name, parent_category_id::text, position, status, version::text, default_size_guide_id::text
          from catalog.categories
          where organization_id = ${context.organizationId}
        `.execute(context.db)
      ).rows;

      // Map existing records by handle and by id for fast in-memory lookup
      const existingByHandle = new Map<string, ExistingCategoryRow>();
      const existingById = new Map<string, ExistingCategoryRow>();
      for (const row of existingRows) {
        existingByHandle.set(row.handle, row);
        existingById.set(row.id, row);
      }

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let totalCount = 0;

      async function syncNode(
        item: CategorySeedItem,
        parentId: string | null,
        depthIndex: number,
      ): Promise<string> {
        totalCount += 1;
        const handle = item.handle ? item.handle.trim().toLowerCase() : slugify(item.name);
        const position = item.position !== undefined ? item.position : depthIndex * 10;
        const status = item.status ?? 'ACTIVE';

        // Check if category exists by handle, or by any declared previous handles
        let existing = existingByHandle.get(handle);
        if (!existing && item.previousHandles?.length) {
          for (const prev of item.previousHandles) {
            const found = existingByHandle.get(prev);
            if (found) {
              existing = found;
              break;
            }
          }
        }

        let categoryId: string;

        if (!existing) {
          // CREATE NEW
          const created = await createManagedCategory(context.db, {
            organizationId: context.organizationId,
            actorId: context.actorId,
            name: item.name.trim(),
            handle,
            status,
            position,
            defaultSizeGuideId: item.defaultSizeGuideId ?? null,
            ...(parentId ? { parentCategoryId: parentId } : {}),
          });
          categoryId = created.id;
          createdCount += 1;

          const newRow: ExistingCategoryRow = {
            id: categoryId,
            handle,
            name: item.name.trim(),
            parent_category_id: parentId,
            position,
            status,
            version: '1',
            default_size_guide_id: item.defaultSizeGuideId ?? null,
          };
          existingByHandle.set(handle, newRow);
          existingById.set(categoryId, newRow);
        } else {
          // EVALUATE FOR UPDATES
          categoryId = existing.id;
          const nameChanged = item.name.trim() !== existing.name;
          const handleChanged = handle !== existing.handle;
          const statusChanged = status !== existing.status;
          const positionChanged = position !== existing.position;
          const parentChanged = (parentId ?? null) !== (existing.parent_category_id ?? null);
          const guideChanged =
            (item.defaultSizeGuideId ?? null) !== (existing.default_size_guide_id ?? null);

          if (
            nameChanged ||
            handleChanged ||
            statusChanged ||
            positionChanged ||
            parentChanged ||
            guideChanged
          ) {
            await updateManagedCategory(context.db, {
              organizationId: context.organizationId,
              actorId: context.actorId,
              categoryId: existing.id,
              expectedVersion: Number(existing.version),
              name: item.name.trim(),
              handle,
              status,
              parentCategoryId: parentId,
              position,
              defaultSizeGuideId: item.defaultSizeGuideId ?? null,
            });
            updatedCount += 1;

            const updatedRow: ExistingCategoryRow = {
              ...existing,
              handle,
              name: item.name.trim(),
              parent_category_id: parentId,
              position,
              status,
              version: String(Number(existing.version) + 1),
              default_size_guide_id: item.defaultSizeGuideId ?? null,
            };
            existingByHandle.set(handle, updatedRow);
            existingById.set(categoryId, updatedRow);
          } else {
            unchangedCount += 1;
          }
        }

        // Recursively sync children
        if (item.children && item.children.length > 0) {
          for (let i = 0; i < item.children.length; i++) {
            await syncNode(item.children[i]!, categoryId, i);
          }
        }

        return categoryId;
      }

      // Sync all root categories
      for (let i = 0; i < items.length; i++) {
        await syncNode(items[i]!, null, i);
      }

      return {
        moduleId: 'categories',
        moduleName: 'Categories',
        rootCount: items.length,
        totalCount,
        createdCount,
        updatedCount,
        unchangedCount,
        failedCount: 0,
      };
    },
  };
}

export const categoriesSeedModule = createCategoriesSeedModule();
