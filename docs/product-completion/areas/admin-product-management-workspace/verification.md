# Verification

Status: `ACTIVE_IMPLEMENTATION` — `SCALABLE_VARIANT_AND_MEDIA_OPERATIONS`.

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

Completion cannot be claimed until the remaining P1/P2 stages have current
targeted proof, the Admin build blocker is resolved in its proper scope, and
responsive/owner review is complete.
