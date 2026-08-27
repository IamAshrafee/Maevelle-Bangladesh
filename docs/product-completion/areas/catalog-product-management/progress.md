# Catalog Product Management Progress

## 2026-08-26

- Completed source inventory across schema, repository, API, Admin, Storefront,
  tests, Catalog architecture, and Admin information architecture.
- Confirmed current Product worklist and readiness defects.
- Defined target state and seven implementation stages.
- Started Stage 1: Product worklist and truthful readiness.

## 2026-08-27

- Completed Stage 1 in `2229434`.
- Added shared Catalog readiness contracts and a tenant-scoped, bounded Product
  worklist with query, status, Product Type, readiness, and page filters.
- Reused the same authoritative blocker model in the publish command and the
  Admin workspace; price, media, category, inventory, and description remain
  separately labelled operational warnings.
- Added URL-backed filters, stale-page normalization, duplicate-submit guards,
  create-drawer focus recovery, unpublish confirmation, and truthful empty and
  disabled states.
- Verified PostgreSQL behavior, 137 repository tests, typecheck, focused lint,
  architecture and secret checks, and the production Admin build.
- Built and started the local Compose stack. Authenticated browser workflow proof
  remains pending because neither available browser had a current Admin session.
- Completed Stage 2 in `c364860`.
- Added Product overview editing for name, handle, description, and active Product
  Type through the shared transport contract and validated API command.
- Preserved optimistic concurrency with `If-Match`; a three-way merge retains
  non-conflicting local edits and exposes true stale-field conflicts with explicit
  current-versus-draft choices.
- Added inline validation/recovery, redirect-history proof for handle changes,
  tenant validation for Product Type changes, and protection against losing
  overview or create-drawer drafts on close, internal navigation, or page exit.
- Verified 139 tests, API/Admin builds, typecheck, lint, architecture and secret
  checks, a healthy rebuilt Compose stack, and an error-free Admin login surface.
- Completed the Stage 3 backend foundation in `d90d817`.
- Added a tenant-scoped active category tree, atomic category and primary-category
  assignment, and Product Type-driven active Product attribute reads and writes.
- Persisted text, integer, decimal, Boolean, and date values through their typed
  columns; rejected unconfigured reference editing, invalid ranges/dates,
  cross-tenant or inactive inputs, missing required values, and stale commands.
- Preserved explicit Boolean `false` values and serialized optimistic updates
  before replacing category or attribute rows, so stale commands roll back safely.
- Verified typecheck, focused lint, API schema boundaries, and 12 focused API and
  PostgreSQL tests.
- Completed the Stage 3 Product Organization editor in `39e6a67`.
- Added accessible nested-category selection, a selected-category-only primary
  choice, and Product Type-driven controls for text, integer, decimal, Boolean,
  date, and safely read-only reference attributes.
- Added independent category/attribute saves that preserve other workspace
  drafts, page/navigation/command guards, inline domain errors, and three-way
  recovery with explicit current-versus-local conflict choices.
- Preserved existing reference values while replacing editable typed values and
  linked category/required-attribute readiness actions to the editor.
- Verified 142 repository tests, typecheck, focused lint, API/Admin production
  builds, architecture and secret checks, and a healthy rebuilt Compose stack.
- The in-app browser reached the rebuilt Admin, was redirected to sign-in by the
  auth guard, and reported no console errors. Authenticated Organization visual
  and responsive interaction remain unclaimed.

## Next

Implement Stage 3 structured information, FAQ, and SEO.
