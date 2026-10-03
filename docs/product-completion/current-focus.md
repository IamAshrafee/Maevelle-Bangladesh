# Current Focus

## Active Area

Catalog V3 Unified Presentation Groups, Sellable SKUs, Media, Pricing & Inventory.

## Current Status / Substage

`PHASE_1_BACKEND_SCHEMA_AND_INTEGRITY_VERIFIED`

## Evidence Already Known

- **One Media-Driving Visual Axis**: Strictly enforced at DB level via partial unique index `(organization_id, product_id) WHERE is_visual`.
- **Elimination of Primary Sellable SKU**: Removed redundant `is_primary` and `is_default` on `catalog.product_variants`. Simple products use `option_signature = 'default'`. Configurable products have no primary sellable SKU.
- **Shared Gallery for No-Visual Products**:
  - `HAS visual axis`: Merchandising photography (`GALLERY`, `THUMBNAIL`, `COLOR_GALLERY`) MUST attach to a visual presentation option value (`option_value_id IS NOT NULL`) or SKU override (`variant_id IS NOT NULL`).
  - `NO visual axis` (Size-only configurable or simple products): Merchandising photography attaches to the product's shared presentation gallery (`variant_id IS NULL AND option_value_id IS NULL`).
  - Informational media (`SIZE_DIAGRAM`) is allowed at product level (`variant_id IS NULL AND option_value_id IS NULL`) in all configurations.
- **Write-Time Option Value Validation**: Immediate rejection (`VALIDATION_FAILED`) when attempting to set `is_primary = true` on a non-visual option axis.
- **Shipping Group Constraints & Inheritance**:
  - 3-valued boolean logic hardened constraints: `(weight_value is null) = (weight_unit is null)` and dimensions 4-tuple all present or all null.
  - Variants cleanly inherit base product shipping at runtime when overrides are NULL.
- **Atomic Opening Stock via Inventory Transaction**: Passed caller's transaction directly into `inventory.adjustInventory`, posting real append-only ledger movements (`OPENING_BALANCE` in `inventory.inventory_transactions` and `inventory.inventory_movement_lines`).
- **Database-Enforced Primary Media Uniqueness**: Partial unique index on primary media in `catalog.product_media`.
- **Composite Foreign Keys & Automated Trigger**: `(organization_id, product_id, id)` composite foreign keys ensure media cannot reference mismatched products; `set_product_option_value_product_id` trigger guarantees automated `product_id` population.
- **Verification evidence**:
  - 33 focused database/catalog/media/integrity/storefront tests passed (`catalog-v3-architecture.test.ts`, `catalog.test.ts`, `catalog-variants.test.ts`, `catalog-variant-integrity.test.ts`, `storefront.test.ts`, `media.test.ts`).
  - Monorepo contracts, database, and API TypeScript builds passed with 0 errors.
  - Clean PostgreSQL baseline rebuild and migrations passed. Seed script populated 503 records cleanly.

## Immediate Objective

Proceed to **Phase 2: Frontend Surfaces**:
1. Admin Product Creator (`apps/admin/components/products/creator/*`):
   - Refactor UI to 1 Visual Axis + N Secondary Axes.
   - Size-only / No-visual mode: Shared gallery uploader at product level.
   - Visual mode: Option-value galleries for each visual value (e.g. Black gallery, White gallery) with primary visual presentation selector.
   - Variant Matrix Table: Variant combinations with SKU, barcode, price, cost estimate, multi-location initial stock, and optional shipping overrides.
   - Pricing & Margin calculator using `estimatedCostAmount` without touching accounting FIFO layers.
2. Admin Product Details / Workspace (`apps/admin/components/products/product-details.tsx`).
3. Storefront PDP & Cards (`apps/storefront/components/*`):
   - PDP displays primary visual value gallery by default (or shared gallery when no visual axis). Swatch click switches active gallery smoothly.
   - Unselected size by default.
   - Dynamic price range display across active variants.
