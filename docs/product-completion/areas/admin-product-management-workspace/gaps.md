# Observed Gaps

## Resolved 2026-09-10 — Published option changes could leave active Storefront SKUs unselectable

- **Former problem:** Archiving a Product option axis or value was allowed against a
  published Product without changing the Product lifecycle or reconciling its
  active Variants. The Storefront returns published active Variants regardless
  of whether their option values remain active, while it omits archived option
  axes/values from the customer choice list.
- **Former evidence:** `apps/admin/components/products/product-variants-form.tsx`
  exposes `Archive Axis` and tiny `×` archive actions for the published `Does`
  Product; `packages/database/src/catalog.ts:updateProductOptionAxis` and
  `updateProductOptionValue` update only the option rows. The public projection
  at `getStorefrontCatalogProduct` filters options/values to `ACTIVE` but its
  Variant query filters only `variant.status='ACTIVE'`.
- **Business effect:** a merchandiser could make an active published SKU
  impossible to select while the Product remains listed and purchasable,
  producing a broken customer choice/variant mapping. Historical records must
  remain, but this published-state transition needs an explicit safe outcome.
- **Resolution:** Catalog applies one structural Variant invariant through
  readiness and transaction-serialized semantic commands. Published archive
  attempts identify affected SKUs and explain the safe recovery path; archived
  Variant/link history is retained, and public Product/search projections omit
  any legacy-inconsistent published Product rather than exposing contradictory
  selectors and active SKUs.
- **Proof:** `packages/database/src/catalog-variant-integrity.test.ts` and
  `apps/api/src/routes/catalog-support.test.ts`, plus the existing Catalog,
  Variant-matrix and Storefront focused suites (17 passing tests total).
- **Blocks area completion:** no; resolved. The area remains incomplete for the
  P1/P2 substages below.

## Resolved 2026-09-12 — Variant matrix generation silently covered only the first 100 combinations

- **Former problem:** the editor requests only page 1 of the paginated variant matrix
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
- **Resolution:** the editor now traverses deterministic 50-combination pages,
  exposes full counts/range/navigation, generates only missing rows on the
  visible page with bounded unique SKUs, and edits only the current page.
  Unsaved navigation is guarded; Catalog and Pricing remain separate writes
  with explicit partial-success refresh/recovery. Stored option-signature drift
  is reported as repair work and never placed under the wrong combination.
- **Proof:** `catalog-variants.test.ts` reaches page 3 of a 120-combination
  matrix and proves signature-drift detection; focused TypeScript, lint, Admin
  production build, and the broader 23-test Product suite pass.
- **Blocks area completion:** no; resolved.

## Resolved 2026-09-12 — Editor could not manage variant-scoped media

- **Former problem:** the detail UI describes general, option-value, and
  variant-specific galleries, and the Catalog media relationship supports a
  `variantId`; the editor only uploads/attaches product and color-option media.
- **Evidence:** `apps/admin/components/products/product-details.tsx` renders
  variant media and labels the three gallery scopes; `product-media-form.tsx`
  has only `PRODUCT` and `OPTION` upload paths and only color-option galleries.
- **Business effect:** operators cannot complete media assignments for
  variant-specific imagery (for example a non-colour material/cut variation)
  from the Product workspace, despite being told the capability is there.
- **Likely layers:** Admin media editor/read model and focused media tests.
- **Resolution:** the Media section now provides a bounded searchable Variant
  finder by SKU/title/options and a precise per-Variant gallery alongside the
  existing Product and colour-option scopes. Upload, remove, and primary-image
  actions preserve the Media asset and use the existing tenant-scoped Catalog
  placement boundary; touch and keyboard actions remain visible and named.
- **Proof:** `media.test.ts` proves same-Product Variant scoping, rejection of a
  Variant from another Product, and one primary placement per Variant scope;
  focused type/lint/build validation passes.
- **Blocks area completion:** no; resolved.

## Resolved 2026-09-12 — The worklist needed sorting and actionable reason detail

- **Problem:** the worklist supports search, Product Type/catalog-state/readiness
  filters, URL state and pagination, but ordering is fixed to newest-updated and
  a blocker/warning count does not identify the needed action until a Product is
  opened.
- **Evidence:** `product-list.tsx` exposes only those filters; the database
  query orders `updated_at desc,id desc`. Local Admin showed `ATTENTION — 2
  warnings` but no reason or direct remediation at list level.
- **Business effect:** a high-volume merchandiser cannot prioritize stale,
  incomplete, out-of-stock or no-media work without opening records one by one.
- **Resolution:** the worklist contract now exposes a bounded set of
  operator-selected sorts (`recent`, `needs attention first`, `oldest`, and
  `name`) in URL state. Each non-ready row surfaces the first existing canonical
  readiness check and links directly to its owning editor section. The worklist
  now also uses the shared structural Variant predicate, so signature drift
  cannot be flattened into a healthy readiness summary.
- **Proof:** `catalog.test.ts` proves the canonical active-Variant recovery
  cue and alphabetical ordering; the focused 17-test Catalog/API/Admin/
  Storefront suite, Catalog/API/Admin TypeScript, executable-surface lint, and
  Admin production build pass. The pre-existing contracts lint errors are
  outside this Product change.
- **Blocks area completion:** no; resolved.

## Resolved 2026-09-12 — Product overview and editor lacked a safe Storefront handoff

- **Problem:** the review copy promises Storefront eligibility and URL, but the
  Product detail/editor surfaces do not provide a Storefront preview/open link.
- **Evidence:** `product-review.tsx` links only back to Product Details or the
  worklist; Product Detail links only to its Admin editor sections. The public
  handle is shown as an internal technical token (`/does`) rather than a
  customer-view action.
- **Business effect:** merchandisers must manually reconstruct customer-facing
  representation, weakening final publication review.
- **Resolution:** published Product detail and review now use an explicit
  root-relative, new-tab `Open/View Storefront` anchor to the existing public
  handle route. Drafts receive a clear “available after publishing” explanation
  rather than a leaking preview route. The route helper encodes the handle and
  intentionally bypasses Admin's `/admin` base path.
- **Proof:** Admin link tests prove editor recovery routes and root-safe public
  URLs; existing Storefront projection tests remain green.
- **Blocks area completion:** no; resolved.

## Resolved 2026-09-12 — Product media signals were internally confusing in the workspace

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
- **Resolution:** the detail workspace now labels the fallback gallery as
  Product-level, shows Product/option/SKU-scope counts, explains their customer
  relationship, and reports each Variant's effective coverage as SKU-specific,
  option-gallery, Product fallback, or no image. It does not move Media's
  placement authority into Catalog.
- **Proof:** affected Admin build/type/executable-surface lint checks pass; the
  existing media and public Storefront regression coverage remains in the
  focused suite.
- **Blocks area completion:** no; resolved.

## Resolved 2026-09-10 — Variant archive controls were inaccessible and overly terse

- **Former problem:** active option values were archived through icon-only `×` buttons
  with no accessible name and a generic confirmation.
- **Former evidence:** `product-variants-form.tsx` rendered the button with only `×`;
  local accessibility inspection names it simply `×`.
- **Business effect:** keyboard/screen-reader operators could not reliably identify
  the value they will archive, and sighted operators face a small ambiguous
  destructive target.
- **Resolution:** archive/restore controls now have value-specific accessible
  names, titles and touch-sized targets; confirmations explain published/draft
  consequences, and structured conflict recovery lists affected SKUs.
- **Blocks area completion:** no; resolved with the P0 safety work.
