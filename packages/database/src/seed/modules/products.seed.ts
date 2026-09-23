import { sql } from 'kysely';

import { createCatalogProduct } from '../../catalog.js';
import { adjustInventory } from '../../inventory.js';
import { attachMediaToProduct, registerUrlMedia } from '../../media.js';
import { productSeedData } from '../data/products.js';
import { slugify } from '../helpers/slug.js';
import type {
  ProductSeedItem,
  SeedContext,
  SeedModule,
  SeedModuleResult,
} from '../types.js';

interface ExistingProductRow {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly status: string;
  readonly publication_status: string;
}

/**
 * Creates a Products Seed Module with realistic fashion items, variant matrix,
 * canonical colors, alpha sizing, high-resolution media URLs, and warehouse inventory.
 */
export function createProductsSeedModule(
  items: readonly ProductSeedItem[] = productSeedData,
): SeedModule {
  return {
    id: 'products',
    name: 'Products & Inventory',
    description:
      'Complete catalog products with variants, colors, sizes, media, and multi-warehouse stock',
    scope: 'bootstrap',
    dependencies: [
      'categories',
      'product-types',
      'tags',
      'occasions',
      'collections',
      'sizing',
      'warehouses',
      'colors',
    ],
    async run(context: SeedContext): Promise<SeedModuleResult> {
      // 1. Pre-fetch reference maps for this tenant
      const [
        categoryRows,
        productTypeRows,
        tagRows,
        occasionRows,
        collectionRows,
        colorRows,
        sizeSystemRows,
        sizeDefinitionRows,
        warehouseRows,
        existingProducts,
      ] = await Promise.all([
        sql<{ id: string; handle: string }>`
          select id::text, handle from catalog.categories where organization_id = ${context.organizationId}
        `.execute(context.db),
        sql<{ id: string; code: string }>`
          select id::text, code from catalog.product_types where organization_id = ${context.organizationId}
        `.execute(context.db),
        sql<{ id: string; name: string; handle: string }>`
          select id::text, name, handle from catalog.tags where organization_id = ${context.organizationId}
        `.execute(context.db),
        sql<{ id: string; name: string; handle: string }>`
          select id::text, name, handle from catalog.occasions where organization_id = ${context.organizationId}
        `.execute(context.db),
        sql<{ id: string; name: string; handle: string }>`
          select id::text, name, handle from catalog.collections where organization_id = ${context.organizationId}
        `.execute(context.db),
        sql<{ id: string; code: string }>`
          select id::text, code from catalog.colors where organization_id = ${context.organizationId}
        `.execute(context.db),
        sql<{ id: string; code: string }>`
          select id::text, code from sizing.size_systems where organization_id = ${context.organizationId}
        `.execute(context.db),
        sql<{ id: string; size_system_id: string; code: string }>`
          select id::text, size_system_id::text, code from sizing.size_definitions where organization_id = ${context.organizationId}
        `.execute(context.db),
        sql<{ id: string; code: string }>`
          select id::text, code from warehouse.locations where organization_id = ${context.organizationId}
        `.execute(context.db),
        sql<ExistingProductRow>`
          select id::text, handle, title, status, publication_status
          from catalog.products where organization_id = ${context.organizationId}
        `.execute(context.db),
      ]);

      const categoriesByHandle = new Map(categoryRows.rows.map((r) => [r.handle.toLowerCase(), r.id]));
      const productTypesByCode = new Map(productTypeRows.rows.map((r) => [r.code.toLowerCase(), r.id]));
      const tagsByName = new Map(
        tagRows.rows.flatMap((r) => [
          [r.name.toLowerCase().trim(), r.id],
          [r.handle.toLowerCase().trim(), r.id],
        ]),
      );
      const occasionsByName = new Map(
        occasionRows.rows.flatMap((r) => [
          [r.name.toLowerCase().trim(), r.id],
          [r.handle.toLowerCase().trim(), r.id],
        ]),
      );
      const collectionsByName = new Map(
        collectionRows.rows.flatMap((r) => [
          [r.name.toLowerCase().trim(), r.id],
          [r.handle.toLowerCase().trim(), r.id],
        ]),
      );
      const colorsByCode = new Map(colorRows.rows.map((r) => [r.code.toLowerCase(), r.id]));
      const sizeSystemsByCode = new Map(sizeSystemRows.rows.map((r) => [r.code.toLowerCase(), r.id]));
      const warehousesByCode = new Map<string, string>();
      for (const r of warehouseRows.rows) {
        warehousesByCode.set(r.code.toUpperCase(), r.id);
        if (r.code.toUpperCase().includes('WEST')) {
          warehousesByCode.set('WH-WEST-01', r.id);
          warehousesByCode.set('WH-WEST-ASHRAFEE', r.id);
          warehousesByCode.set('WEST', r.id);
        }
        if (r.code.toUpperCase().includes('EAST')) {
          warehousesByCode.set('WH-EAST-01', r.id);
          warehousesByCode.set('WH-EAST-MAISHA', r.id);
          warehousesByCode.set('EAST', r.id);
        }
      }

      // Size definitions mapped by: `${sizeSystemId}:::${code.toLowerCase()}`
      const sizeDefsBySystemAndCode = new Map<string, string>();
      for (const r of sizeDefinitionRows.rows) {
        sizeDefsBySystemAndCode.set(`${r.size_system_id}:::${r.code.toLowerCase()}`, r.id);
      }

      const existingByHandle = new Map(existingProducts.rows.map((r) => [r.handle.toLowerCase(), r]));
      const existingByTitle = new Map(existingProducts.rows.map((r) => [r.title.toLowerCase().trim(), r]));

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      for (const item of items) {
        const handle = item.handle ? item.handle.trim().toLowerCase() : slugify(item.title);
        const existing = existingByHandle.get(handle) ?? existingByTitle.get(item.title.toLowerCase().trim());

        if (existing) {
          // Check if any variant stocks are missing and fulfill them
          const variantRows = await sql<{ id: string; sku: string }>`
            select id::text, sku from catalog.product_variants
            where product_id = ${existing.id}::uuid and organization_id = ${context.organizationId}
          `.execute(context.db);
          const variantMap = new Map(variantRows.rows.map((r) => [r.sku.toUpperCase(), r.id]));

          let addedStock = false;
          for (const v of item.variants) {
            const variantId = variantMap.get(v.sku.toUpperCase());
            if (!variantId) continue;

            for (const stock of v.stocks) {
              const locationId = warehousesByCode.get(stock.warehouseCode.toUpperCase());
              if (!locationId) continue;

              const existingLevel = await sql<{ sellable_quantity: string }>`
                select sellable_quantity::text from inventory.inventory_levels
                join inventory.inventory_items item on item.id = inventory_levels.inventory_item_id
                where item.variant_id = ${variantId}::uuid
                  and inventory_levels.location_id = ${locationId}::uuid
                  and inventory_levels.organization_id = ${context.organizationId}
              `.execute(context.db);

              if (!existingLevel.rows[0]) {
                await adjustInventory(context.db, {
                  organizationId: context.organizationId,
                  actorId: context.actorId,
                  variantId,
                  locationId,
                  condition: 'SELLABLE',
                  quantityDelta: stock.quantity,
                  reasonCode: 'OPENING_BALANCE',
                  note: `Seed inventory for ${v.sku} at ${stock.warehouseCode}`,
                  idempotencyKey: `seed-stock-${context.organizationId}-${variantId}-${locationId}`,
                });
                addedStock = true;
              }
            }
          }

          if (addedStock) {
            updatedCount++;
          } else {
            unchangedCount++;
          }
          continue;
        }

        // CREATE NEW PRODUCT
        const productTypeId = productTypesByCode.get(item.productTypeCode.toLowerCase());
        if (!productTypeId) {
          throw new Error(
            `Product Type "${item.productTypeCode}" not found for product "${item.title}". Run product-types seed first.`,
          );
        }

        const primaryCategoryId = categoriesByHandle.get(item.primaryCategoryHandle.toLowerCase());
        if (!primaryCategoryId) {
          throw new Error(
            `Category "${item.primaryCategoryHandle}" not found for product "${item.title}". Run categories seed first.`,
          );
        }

        const categoryIds: string[] = [primaryCategoryId];
        for (const catHandle of item.additionalCategoryHandles ?? []) {
          const catId = categoriesByHandle.get(catHandle.toLowerCase());
          if (catId && !categoryIds.includes(catId)) {
            categoryIds.push(catId);
          }
        }

        const tagIds: string[] = [];
        for (const tagName of item.tagNames ?? []) {
          const tagId = tagsByName.get(tagName.toLowerCase().trim());
          if (tagId && !tagIds.includes(tagId)) tagIds.push(tagId);
        }

        const occasionIds: string[] = [];
        for (const occName of item.occasionNames ?? []) {
          const occId = occasionsByName.get(occName.toLowerCase().trim());
          if (occId && !occasionIds.includes(occId)) occasionIds.push(occId);
        }

        const collectionIds: string[] = [];
        for (const colName of item.collectionNames ?? []) {
          const colId = collectionsByName.get(colName.toLowerCase().trim());
          if (colId && !collectionIds.includes(colId)) collectionIds.push(colId);
        }

        const sizeSystemId = item.sizeSystemCode
          ? sizeSystemsByCode.get(item.sizeSystemCode.toLowerCase())
          : undefined;

        // Map Option Axes & Values
        const mappedOptions = item.options.map((axis, axisIdx) => ({
          name: axis.name,
          code: axis.code ?? slugify(axis.name),
          position: axis.position ?? axisIdx,
          values: axis.values.map((val, valIdx) => {
            const colorId = val.colorCode ? colorsByCode.get(val.colorCode.toLowerCase()) : undefined;
            const sizeDefinitionId =
              sizeSystemId && val.sizeCode
                ? sizeDefsBySystemAndCode.get(`${sizeSystemId}:::${val.sizeCode.toLowerCase()}`)
                : undefined;

            return {
              displayValue: val.displayValue,
              code: val.code ?? slugify(val.displayValue),
              position: val.position ?? valIdx,
              ...(colorId ? { colorId } : {}),
              ...(sizeDefinitionId ? { sizeDefinitionId } : {}),
            };
          }),
        }));

        // Map Variants
        const mappedVariants = item.variants.map((v) => {
          const primaryColorId = v.primaryColorCode
            ? colorsByCode.get(v.primaryColorCode.toLowerCase())
            : undefined;

          return {
            sku: v.sku,
            title: v.title ?? `${item.title} - ${v.sku}`,
            optionSelections: v.optionSelections.map((sel) => ({
              axisName: sel.axisName,
              valueDisplay: sel.valueDisplay,
            })),
            priceAmount: v.amount,
            ...(v.compareAtAmount ? { compareAtAmount: v.compareAtAmount } : {}),
            ...(v.barcode ? { barcode: v.barcode } : {}),
            ...(v.weightGrams ? { weight: { value: String(v.weightGrams), unit: 'G' as const } } : {}),
            ...(primaryColorId ? { primaryColorId } : {}),
          };
        });

        // 1. Create the Product
        const createdProduct = await createCatalogProduct(context.db, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          title: item.title,
          handle,
          productTypeId,
          primaryCategoryId,
          categoryIds,
          tagIds,
          occasionIds,
          collectionIds,
          ...(item.description ? { description: item.description } : {}),
          ...(sizeSystemId ? { sizeSystemId } : {}),
          options: mappedOptions,
          variants: mappedVariants,
        });

        // 2. Publish the Product
        await sql`
          update catalog.products
          set status = 'ACTIVE', publication_status = 'PUBLISHED', published_at = coalesce(published_at, now()), updated_at = now()
          where id = ${createdProduct.id}::uuid and organization_id = ${context.organizationId}
        `.execute(context.db);

        // 3. Query created variants to get their IDs
        const createdVariants = await sql<{ id: string; sku: string }>`
          select id::text, sku from catalog.product_variants
          where product_id = ${createdProduct.id}::uuid and organization_id = ${context.organizationId}
        `.execute(context.db);
        const variantMap = new Map(createdVariants.rows.map((r) => [r.sku.toUpperCase(), r.id]));

        // 4. Query created option values to link color gallery media if applicable
        const createdOptionValues = await sql<{ id: string; color_code: string | null }>`
          select val.id::text, c.code as color_code
          from catalog.product_option_values val
          join catalog.product_option_axes ax on ax.id = val.option_axis_id
          left join catalog.colors c on c.id = val.color_id
          where ax.product_id = ${createdProduct.id}::uuid and ax.organization_id = ${context.organizationId}
        `.execute(context.db);
        const optionValuesByColorCode = new Map<string, string>();
        for (const optVal of createdOptionValues.rows) {
          if (optVal.color_code) {
            optionValuesByColorCode.set(optVal.color_code.toLowerCase(), optVal.id);
          }
        }

        // 5. Attach product media
        if (item.media && item.media.length > 0) {
          for (const m of item.media) {
            const asset = await registerUrlMedia(context.db, {
              organizationId: context.organizationId,
              url: m.url,
              visibility: 'PUBLIC',
              title: `${item.title} - ${m.role}`,
            });

            const optionValueId = m.colorCode
              ? optionValuesByColorCode.get(m.colorCode.toLowerCase())
              : undefined;

            await attachMediaToProduct(context.db, {
              organizationId: context.organizationId,
              productId: createdProduct.id,
              assetId: asset.id,
              role: m.role,
              isPrimary: m.isPrimary ?? false,
              position: m.position ?? 0,
              ...(optionValueId ? { optionValueId } : {}),
            });
          }
        }

        // 6. Record inventory stock for each variant across warehouses
        for (const v of item.variants) {
          const variantId = variantMap.get(v.sku.toUpperCase());
          if (!variantId) continue;

          for (const stock of v.stocks) {
            const locationId = warehousesByCode.get(stock.warehouseCode.toUpperCase());
            if (!locationId) continue;

            await adjustInventory(context.db, {
              organizationId: context.organizationId,
              actorId: context.actorId,
              variantId,
              locationId,
              condition: 'SELLABLE',
              quantityDelta: stock.quantity,
              reasonCode: 'OPENING_BALANCE',
              note: `Seed inventory for ${v.sku} at ${stock.warehouseCode}`,
              idempotencyKey: `seed-stock-${context.organizationId}-${variantId}-${locationId}`,
            });
          }
        }

        createdCount++;
      }

      return {
        moduleId: 'products',
        moduleName: 'Products & Inventory',
        totalCount: items.length,
        createdCount,
        updatedCount,
        unchangedCount,
        failedCount: 0,
      };
    },
  };
}

export const productsSeedModule = createProductsSeedModule();
