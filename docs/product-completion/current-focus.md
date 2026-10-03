# Current Focus

## Active Area

Catalog V3 Unified Presentation Groups, Sellable SKUs, Media, Pricing & Inventory.

## Current Status / Substage

`PHASE_2_FRONTEND_SURFACES_COMPLETE`

## Evidence Already Known

### Phase 1: Backend Baseline & Integrity
- **One Media-Driving Visual Axis**: Strictly enforced at DB level via partial unique index `(organization_id, product_id) WHERE is_visual`.
- **Elimination of Primary Sellable SKU**: Removed redundant `is_primary` and `is_default` on `catalog.product_variants`. Simple products use `option_signature = 'default'`. Configurable products have no primary sellable SKU.
- **Shared Gallery for No-Visual Products**:
  - `HAS visual axis`: Merchandising photography (`GALLERY`, `THUMBNAIL`, `COLOR_GALLERY`) attaches to a visual presentation option value (`option_value_id IS NOT NULL`) or SKU override (`variant_id IS NOT NULL`). Product-level merchandising media is rejected by schema.
  - `NO visual axis` (Size-only configurable or simple products): Merchandising photography attaches to the product's shared presentation gallery (`variant_id IS NULL AND option_value_id IS NULL`).
  - Informational media (`SIZE_DIAGRAM`) is allowed at product level (`variant_id IS NULL AND option_value_id IS NULL`) in all configurations.
- **Write-Time Option Value Validation**: Immediate rejection (`VALIDATION_FAILED`) when attempting to set `is_primary = true` on a non-visual option axis.
- **Shipping Group Constraints & Inheritance**:
  - 3-valued boolean logic hardened constraints: `(weight_value is null) = (weight_unit is null)` and dimensions 4-tuple all present or all null.
  - Variants cleanly inherit base product shipping at runtime when overrides are NULL.
- **Atomic Opening Stock via Inventory Transaction**: Passed caller's transaction directly into `inventory.adjustInventory`, posting real append-only ledger movements (`OPENING_BALANCE` in `inventory.inventory_transactions` and `inventory.inventory_movement_lines`).
- **Database-Enforced Primary Media Uniqueness**: Partial unique index on primary media in `catalog.product_media`.
- **Composite Foreign Keys & Automated Trigger**: `(organization_id, product_id, id)` composite foreign keys ensure media cannot reference mismatched products; `set_product_option_value_product_id` trigger guarantees automated `product_id` population.

### Phase 2: Frontend Surfaces
- **Admin Product Creator** (`apps/admin/components/products/creator/*`):
  - Refactored `VariantsCard` for `OptionValueState` objects with single visual axis enforcement, primary cover selector (★) per visual presentation value, quick preset buttons (`Color + Size`, `Size Only`, `Single SKU`), multi-location opening inventory inputs, and unit estimated cost with live gross profit margin badges.
  - Refactored `VariantMatrixTable` with Cartesian SKU combination generation, catalog swatches, individual prices, unit estimated cost margins, multi-location stock popover/inline inputs, and optional physical shipping overrides.
  - Refactored `MediaCard` with dual-mode visual presentation grouping galleries, upload tabs for each visual value (`Black (Cover)`, `White`, `Size Diagram`), scoped uploads defaulting to the active tab, and shared gallery fallback for products without a visual axis.
  - Refactored `useProductCreatorState` to construct atomic creation payloads with shipping, options, variants (with initial stock and estimated cost), and media placements.
- **Admin Product Details / Workspace** (`apps/admin/components/products/product-details.tsx`):
  - Option structure card displays Visual Presentation Axis badge and Primary Cover star on option values.
  - Variants table displays unit cost, live calculated gross profit margins, and inherited product shipping vs custom SKU overrides.
- **Storefront PDP** (`apps/storefront/components/product-page-client.tsx`):
  - Non-visual secondary axes (e.g. Size) unselected by default.
  - Primary visual presentation value (`isPrimary: true`) pre-selected by default.
  - Immediate gallery switching on color swatch selection without requiring size selection.
  - Dynamic price range display across active matching variants (`৳2,200 – ৳2,650`).
  - "Select Size" disabled button state when secondary options remain unselected, transitioning to "Add to bag" once valid options are chosen.
- **Contracts and APIs**:
  - Added `shipping` to `CatalogProductUpdateDto`.
  - Added `estimatedCostAmount` to `CatalogVariantUpdateDto`.
  - Updated PATCH endpoints in `apps/api/src/routes/catalog.ts`.

## Verification Evidence
- Monorepo TypeScript builds passed with 0 errors (`pnpm run typecheck`).
- Focused test suite passed: 25/25 tests passing across `catalog-v3-architecture.test.ts`, `catalog.test.ts`, `catalog-variants.test.ts`, `catalog-variant-integrity.test.ts`, `catalog-classification.test.ts`, and `catalog-product-types.test.ts`.
