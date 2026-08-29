# Catalog Product Management Verification

Status: `ACTIVE_IMPLEMENTATION` — Stages 1–2 plus Stage 3 Product Organization
and customer-content slices verified; area completion gate not yet evaluated.

## Evidence required before completion

- Focused Catalog PostgreSQL lifecycle/read-model/concurrency tests.
- Catalog API validation, authorization, tenant isolation, pagination/filter tests.
- Admin component interaction, accessibility, responsive, and large-list checks.
- Realistic Product creation through publication and Storefront display.
- Unpublish/archive/recovery and stale-edit workflows.
- Broader lint, typecheck, tests, build, architecture, and secret checks.

## Stage 1 evidence — commit `2229434`

- `pnpm typecheck` — passed.
- Focused ESLint over all eight changed source/test files — passed.
- `pnpm vitest run packages/database/src/catalog.test.ts apps/admin/src/admin-v2.test.tsx apps/api/src/app.test.ts`
  — 3 files / 21 tests passed against PostgreSQL where applicable.
- `pnpm test` — 32 files / 137 tests passed, including the clean migration path.
- `pnpm --filter @maevelle/admin build` — production build and all 41 Admin routes
  passed.
- `pnpm check:architecture` — 13 workspace packages passed.
- `pnpm check:secrets` — passed.
- `docker compose up -d --build api admin storefront bootstrap-owner caddy` —
  images built, migrations and Owner bootstrap completed, API/Admin/Storefront
  reported healthy.
- In-app browser navigation reached the local Admin and then correctly redirected
  to login when its session expired. Chrome was not connected, so authenticated
  worklist interaction, responsive screenshots, and owner visual review are not
  claimed.

This evidence proves the Stage 1 local implementation. It does not grant Catalog
area completion, staging readiness, production readiness, or visual acceptance.

## Stage 2 evidence — commit `c364860`

- `pnpm typecheck` and focused ESLint — passed.
- Focused API, PostgreSQL Catalog, and Admin tests — 3 files / 23 tests passed.
- `pnpm test` — 32 files / 139 tests passed.
- `pnpm --filter @maevelle/api build` and
  `pnpm --filter @maevelle/admin build` — passed.
- PostgreSQL tests prove trimmed titles, Product Type changes, cross-tenant Type
  rejection, stale-version rejection, and handle redirect history.
- Admin pure-state tests prove non-conflicting three-way merges and true
  same-field conflict detection.
- API tests prove empty/invalid overview updates are rejected and valid requests
  remain protected.
- Architecture and secret checks passed; the rebuilt Compose API, Admin, and
  Storefront reported healthy after migration and Owner bootstrap.
- The rebuilt Admin login rendered with no browser console errors. Authenticated
  interaction and responsive visual proof remain unclaimed because the available
  browser session was signed out and no connected Chrome session existed.

This proves the local Stage 2 code and recovery model, not the Catalog area gate.

## Stage 3 backend foundation evidence — commit `d90d817`

- `pnpm typecheck`, focused Prettier, focused ESLint, and `git diff --check` —
  passed.
- Focused API and PostgreSQL Catalog tests — 2 files / 12 tests passed.
- PostgreSQL tests prove nested active-category paths, category and primary
  assignment, typed text and Boolean persistence, required-value rejection,
  stale-version rollback, and preservation of explicit Boolean `false`.
- API tests prove invalid category IDs and unsafe attribute payload shapes are
  rejected before authorization/database execution; valid shapes remain protected.
- Integer, decimal, and date values are bounded and validated before typed-column
  insertion. Reference values remain deliberately non-editable until a scoped
  reference selector exists.

This is a backend foundation checkpoint. Admin interaction, the full Stage 3 gate,
and broader regression/build/browser evidence are still pending.

## Stage 3 Product Organization evidence — commit `39e6a67`

- `pnpm typecheck`, focused Prettier/ESLint, and `git diff --check` — passed.
- Focused API, PostgreSQL Catalog, and Admin tests — 3 files / 26 tests passed.
- `pnpm test` — 32 files / 142 tests passed, including clean migration proof.
- `pnpm --filter @maevelle/api build` and
  `pnpm --filter @maevelle/admin build` — passed; all 41 Admin routes generated.
- `pnpm check:architecture` — 13 workspace packages passed.
- `pnpm check:secrets` — passed.
- Pure Admin state tests prove non-conflicting taxonomy/attribute merging, true
  same-field conflict detection, and removal of obsolete Product Type fields.
- PostgreSQL tests prove explicit Boolean `false`, required active Product Type
  values, stale rollback, and preservation of existing read-only reference values.
- `docker compose up -d --build api admin storefront bootstrap-owner caddy` —
  rebuilt successfully; migration and Owner bootstrap exited successfully and
  API/Admin/Storefront reported healthy.
- The browser reached the rebuilt Admin shell and then correctly redirected to
  sign-in. The login surface produced no console errors. Authenticated Product
  Organization interaction and responsive visual evidence remain unclaimed.

This proves the local Product Organization implementation and recovery model,
not the full Stage 3 or Catalog area completion gate.

## Stage 3 customer-content evidence — commit `9d52f61`

- Focused Catalog PostgreSQL, API, and Admin state tests — 3 files / 15 tests
  passed after reconstructing the missing disposable `maevelle_test` database
  from the checked-in migration baseline.
- PostgreSQL proof covers atomic information/FAQ/SEO replacement, stale-version
  rejection, normalized content, public detail and FAQ projection, SEO metadata,
  publication isolation, and tenant isolation.
- Admin pure-state tests prove semantic dirty checking independent of regenerated
  database IDs, additive request mapping, independent three-way merging, and
  explicit conflict detection.
- Repository TypeScript build, focused Prettier/ESLint, `git diff --check`, API
  TypeScript build, architecture check, and secret scan passed.
- Admin production build passed with Next.js 16.3.1 using webpack and generated
  all 42 routes. Turbopack could not bind its internal CSS worker port in the
  restricted execution environment; this was an environment restriction, not a
  compilation error.
- Browser testing was intentionally not run per owner instruction. No visual or
  browser-interaction claim is made.

This proves the structured customer-content vertical from database through
Storefront and its Admin implementation. Product Type/attribute-definition and
configured `REFERENCE` attribute workflows still prevent Stage 3 closure.
