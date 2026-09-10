# Observed Gaps

## P0 — Published option changes can leave active Storefront SKUs unselectable

- **Problem:** Archiving a Product option axis or value is allowed against a
  published Product without changing the Product lifecycle or reconciling its
  active Variants. The Storefront returns published active Variants regardless
  of whether their option values remain active, while it omits archived option
  axes/values from the customer choice list.
- **Evidence:** `apps/admin/components/products/product-variants-form.tsx`
  exposes `Archive Axis` and tiny `×` archive actions for the published `Does`
  Product; `packages/database/src/catalog.ts:updateProductOptionAxis` and
  `updateProductOptionValue` update only the option rows. The public projection
  at `getStorefrontCatalogProduct` filters options/values to `ACTIVE` but its
  Variant query filters only `variant.status='ACTIVE'`.
- **Business effect:** a merchandiser can make an active published SKU
  impossible to select while the Product remains listed and purchasable,
  producing a broken customer choice/variant mapping. Historical records must
  remain, but this published-state transition needs an explicit safe outcome.
- **Likely layers:** Catalog domain lifecycle/readiness, Storefront projection,
  Catalog Admin option/variant controls, focused database/API/Admin tests.
- **Blocks area completion:** yes; this is the first implementation substage.

## P1 — Variant matrix generation silently covers only the first 100 combinations

- **Problem:** the editor requests only page 1 of the paginated variant matrix
  and builds `missingRows` from that page. It never displays matrix pagination
  or the summary’s remaining combinations.
- **Evidence:** `apps/admin/components/products/product-variants-form.tsx`
  requests `variant-matrix?page=1&pageSize=100`, while
  `packages/database/src/catalog-variants.ts` supports paged combinations and
  reports `totalPages`; the UI permits an operation up to 250 based only on its
  loaded rows.
- **Business effect:** a fashion Product with more than 100 combinations is
  presented as though its matrix were fully generated or complete, leaving
  SKUs undiscovered and obstructing high-volume merchandising.
- **Likely layers:** variant matrix API contract/read model and Admin variant
  workflow.
- **Blocks area completion:** yes.

## P1 — Editor cannot manage the variant-scoped media that the workspace read model supports

- **Problem:** the detail UI describes general, option-value, and
  variant-specific galleries, and the Catalog media relationship supports a
  `variantId`; the editor only uploads/attaches product and color-option media.
- **Evidence:** `apps/admin/components/products/product-details.tsx` renders
  variant media and labels the three gallery scopes; `product-media-form.tsx`
  has only `PRODUCT` and `OPTION` upload paths and only color-option galleries.
- **Business effect:** operators cannot complete media assignments for
  variant-specific imagery (for example a non-colour material/cut variation)
  from the Product workspace, despite being told the capability is there.
- **Likely layers:** Admin media editor/read model and focused media tests.
- **Blocks area completion:** yes.

## P2 — The worklist is a strong finder but lacks sorting and actionable reason detail

- **Problem:** the worklist supports search, Product Type/catalog-state/readiness
  filters, URL state and pagination, but ordering is fixed to newest-updated and
  a blocker/warning count does not identify the needed action until a Product is
  opened.
- **Evidence:** `product-list.tsx` exposes only those filters; the database
  query orders `updated_at desc,id desc`. Local Admin showed `ATTENTION — 2
  warnings` but no reason or direct remediation at list level.
- **Business effect:** a high-volume merchandiser cannot prioritize stale,
  incomplete, out-of-stock or no-media work without opening records one by one.
- **Likely layers:** Catalog worklist contract/query and Admin list UI.
- **Blocks area completion:** yes.

## P2 — Product overview and editor lack a safe Storefront preview handoff

- **Problem:** the review copy promises Storefront eligibility and URL, but the
  Product detail/editor surfaces do not provide a Storefront preview/open link.
- **Evidence:** `product-review.tsx` links only back to Product Details or the
  worklist; Product Detail links only to its Admin editor sections. The public
  handle is shown as an internal technical token (`/does`) rather than a
  customer-view action.
- **Business effect:** merchandisers must manually reconstruct customer-facing
  representation, weakening final publication review.
- **Likely layers:** Admin deep links and Storefront route/preview boundary.
- **Blocks area completion:** yes.

## P2 — Product media signals are internally confusing in the current workspace

- **Problem:** the published `Does` workspace reports four public images and
  shows a thumbnail, but the overview Primary Gallery says no Product images
  and every Variant row reports zero media. The separate Media tab can show
  option-scoped placements, but that distinction is not explained where the
  contradictory signals appear.
- **Evidence:** local Product Detail at
  `/admin/products/01a076a3-1ff7-7e5c-8913-c496e639767e`; `product-details.tsx`
  deliberately uses only unscoped media for the Primary Gallery while its
  summary counts all public media.
- **Business effect:** an operator cannot confidently tell whether the
  customer sees an image or where to correct it.
- **Likely layers:** Product workspace media projection and labels.
- **Blocks area completion:** yes.

## P3 — Variant archive controls are inaccessible and overly terse

- **Problem:** active option values are archived through icon-only `×` buttons
  with no accessible name and a generic confirmation.
- **Evidence:** `product-variants-form.tsx` renders the button with only `×`;
  local accessibility inspection names it simply `×`.
- **Business effect:** keyboard/screen-reader operators cannot reliably identify
  the value they will archive, and sighted operators face a small ambiguous
  destructive target.
- **Likely layers:** Product variant UI primitive/copy.
- **Blocks area completion:** no, but should be corrected with the safety work.
