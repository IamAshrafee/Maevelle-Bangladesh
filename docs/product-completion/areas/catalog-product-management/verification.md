# Catalog Product Management Verification

Status: `ACTIVE_IMPLEMENTATION` — Stages 1–2 verified; area completion gate not yet
evaluated.

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
