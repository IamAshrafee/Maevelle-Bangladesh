# Verification

Status: `PLANNED` — `VERIFICATION_AND_OWNER_REVIEW`.

Current assessment evidence:

- Local authenticated Admin browser review at desktop covered the Product list,
  published Product detail, variant detail, and variant editor with four
  disposable Products. The layouts did not show a desktop overflow or hierarchy
  failure; a narrower viewport was not available through the connected browser.
- Source confirms capability-scoped Admin routes, organization predicates,
  product/option/variant optimistic versions, transaction-backed product writes,
  duplicate SKU/option-signature constraints, and content conflict merge UI.
- `pnpm exec vitest run packages/database/src/catalog.test.ts
  packages/database/src/catalog-variants.test.ts
  apps/admin/src/catalog-content-state.test.ts
  apps/admin/src/catalog-organization-state.test.ts` produced 2 passing Admin
  state files (4 tests). The 2 Catalog database files could not execute (9
  tests) because `maevelle_test` does not exist locally.
- Storefront runtime/browser proof remains unavailable: `localhost:3001` was
  the Admin dev server and `/products/does` returned its 404. Storefront source
  projection was inspected; owner visual review remains required.

## Safe published Variant integrity proof — 2026-09-10

- `pnpm exec vitest run packages/database/src/catalog.test.ts
  packages/database/src/catalog-variants.test.ts
  packages/database/src/storefront.test.ts
  packages/database/src/catalog-variant-integrity.test.ts
  apps/api/src/routes/catalog-support.test.ts` passed: 5 files, 17 tests.
- The dedicated regression suite proves used value/axis archive rejection with
  affected SKU details, safe archive after Variant deactivation, preservation
  of archived Variant links, rejection of the final active Variant on a
  published Product, tenant isolation, concurrent publish/archive serialization,
  legacy-invalid readiness, republish blocking, public list/detail/search
  suppression, and restoration.
- Focused ESLint passed for changed database, API, Admin Catalog, and Product
  Variant files. Focused database and API TypeScript checks passed.
- API and Storefront Docker production images built successfully and services
  started. The combined local stack could not build Admin because the untouched
  current-head `apps/admin/components/ui/search-input.tsx:93` has
  `TS2532: Object is possibly 'undefined'`; therefore the new recovery panel
  has code/test evidence but no fresh authenticated browser screenshot.
- The repository test-database initializer failed in the Linux container because
  its checked-out CRLF line ending made `set -eu` invalid. The missing disposable
  `maevelle_test` database was created with the same Compose Postgres role and
  all checked-in migrations were applied successfully; no live data was used.

Completion cannot be claimed until the remaining P2 stages have current
targeted proof and responsive/owner review is complete.

## Integrated organization, sizing, content, and lifecycle proof — 2026-09-12

- `pnpm exec vitest run packages/database/src/sizing.test.ts
  packages/database/src/catalog.test.ts packages/database/src/storefront.test.ts
  apps/admin/src/catalog-content-state.test.ts
  apps/admin/src/product-workspace-links.test.ts` passed: 5 files, 18 tests.
  The Sizing regression covers active/published/domain-compatible attachment,
  safe guide archival, retained system configuration, system-archive blocking,
  and defensive omission of a legacy archived guide from Storefront data.
- Affected database, API, Admin, and Storefront TypeScript checks passed, as did
  executable-surface ESLint for the changed sizing and Product workspace files.
  `pnpm --filter @maevelle/admin build` completed all 56 routes.
- Product Details uses the capability-scoped Sizing read model only for context;
  all sizing writes remain in Sizing and Catalog retains identity/lifecycle
  authority. Content stale-conflict merge, lifecycle confirmation, and
  root-safe published Storefront handoff remain covered by their existing focused
  source/test evidence.
- Browser rendering was not claimed: the safe saved Admin session was invalidated
  by prior local rebuilds and no credentials were exposed or injected. Responsive
  browser review and owner operational judgment remain the final gate.

## Scalable Variant and media operations proof — 2026-09-12

- `pnpm exec vitest run packages/database/src/catalog.test.ts
  packages/database/src/catalog-variants.test.ts
  packages/database/src/catalog-variant-integrity.test.ts
  packages/database/src/media.test.ts packages/database/src/storefront.test.ts
  apps/api/src/routes/catalog-support.test.ts` passed: 6 files, 23 tests.
- New regression cases prove a 120-combination matrix reaches page 3 without
  omission, stored-signature drift remains visible as repair work, Variant
  media cannot target a Variant from another Product, and one primary image is
  maintained per Variant scope.
- Focused ESLint passed for touched Product Admin and database files. Admin,
  database, and contracts TypeScript checks pass.
- `pnpm --filter @maevelle/admin build` passed all 56 Admin routes after the
  existing SearchInput null-safety blocker was corrected. Fresh Compose Admin,
  API, and Storefront images built and their services became healthy.
- Browser rendering was attempted through the local Caddy stack. The rebuild
  invalidated the saved authenticated session (`/admin/context` returned 401),
  so the changed Product screens were not visually claimed; repository
  bootstrap credentials were not printed or injected. Responsive and owner
  visual review remain open for the area gate.

## Merchandiser worklist and workspace clarity proof — 2026-09-12

- `pnpm exec vitest run packages/database/src/catalog.test.ts
  packages/database/src/catalog-variant-integrity.test.ts
  packages/database/src/storefront.test.ts apps/api/src/routes/catalog-support.test.ts
  apps/admin/src/product-workspace-links.test.ts` passed: 5 files, 17 tests.
  It includes canonical worklist attention/recovery, deterministic name sorting,
  structural-Variant defense, public projection, API support, and Admin route
  handoff coverage.
- Catalog/API/Admin TypeScript checks and focused executable-surface ESLint
  pass. The touched contracts file's package-level ESLint remains blocked by
  pre-existing `no-explicit-any` errors near `index.ts:973`; its TypeScript
  check passes. `pnpm --filter @maevelle/admin build` passed all 56 Admin routes.
- Local Compose API, Admin, Storefront, database, and Caddy services were
  healthy. Authenticated browser rendering was not claimed because the prior
  container rebuild invalidated the available Admin session; no credentials were
  exposed or injected. Responsive and owner visual review remain open.
