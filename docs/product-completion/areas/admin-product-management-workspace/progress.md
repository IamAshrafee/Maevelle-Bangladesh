# Progress

## 2026-09-10 — V2 baseline restoration

- Selected this area for current-head assessment; no product behavior changed.
- First substage: `CURRENT_HEAD_ASSESSMENT`.
- Next: map a realistic merchandiser workflow against current routes, commands,
  tests and current UI behavior before recording implementation gaps.

## 2026-09-10 — Current-head merchandiser assessment

- Assessed the realistic workflow: find the published multi-variant Product
  `Does` → read readiness → inspect options/SKUs/prices/inventory/media → open
  sectioned editor → review organization, sizing, content and publication
  boundaries. Local Admin at `http://localhost:3000/admin` supplied four
  disposable Products and a working authenticated operator session.
- Confirmed useful foundations: URL-backed query/status/readiness/type/page
  worklist; price, available quantity and readiness signals; separate detail
  and edit surfaces with deep links; readiness resolution links; catalog
  capability checks, tenant-scoped queries, transactional product writes,
  optimistic versions, duplicate SKU/option-signature constraints; and
  content stale-conflict merge/recovery.
- Recorded P0 published-variant integrity, plus P1/P2/P3 workflow gaps in
  `gaps.md`. Storefront browser review was unavailable: port 3001 served the
  Admin application and returned Admin 404 for `/products/does`; no separate
  local Storefront process was running. Storefront source projection was
  inspected instead.
- Focused Admin state tests passed. Catalog/database integration tests could
  not start because the configured local `maevelle_test` database does not
  exist; this is an evidence limitation, not a product-test failure.
- Next: `SAFE_PUBLISHED_VARIANT_INTEGRITY`.

## 2026-09-10 — Safe published Variant integrity

- Established the authoritative rule: every active Variant on a published
  Product must have exactly one link for every active option axis, no links to
  archived/foreign axes or values, and a signature matching the linked values;
  at least one active Variant must remain. Archived Variants are historical and
  are excluded from the live invariant without deleting their links.
- Product publication and option-axis/value/Variant commands now take the same
  Product-row lock. Unsafe published archive attempts return a structured 409
  with affected SKUs and explicit deactivate/reconfigure-or-unpublish recovery;
  successful semantic writes emit Catalog audit/outbox evidence.
- Draft Products may be temporarily inconsistent while being rebuilt.
  Readiness blocks republishing until repaired. Existing inconsistent published
  Products become `ATTENTION`, cannot republish, and are defensively omitted
  from Product detail/list/search projections until healed.
- Created and migrated the disposable `maevelle_test` database. Seventeen
  focused Catalog, Variant, Storefront and API tests pass, including concurrent
  publish-versus-archive, tenant isolation, historical-link preservation,
  public projection defense, restoration, and structured error transport.
- API and Storefront Docker images build. A fresh Admin image is blocked by the
  untouched current-head TypeScript error in `components/ui/search-input.tsx:93`,
  so post-change browser proof remains unperformed.
- Next: `SCALABLE_VARIANT_AND_MEDIA_OPERATIONS`; do not begin worklist or preview
  improvements first.

## 2026-09-12 — Scalable Variant and media operations

- Replaced the first-page-only matrix workflow with bounded 50-combination
  pages, full summary/range navigation, page-scoped generation, and current-page
  editing. Generated SKUs retain readable option segments plus a stable global
  ordinal and remain within the API limit.
- Existing prices now load instead of appearing blank. Catalog identity/status
  and Pricing writes continue through their owning APIs; sequential saves stop,
  refresh, and explain partial success if a later domain rejects a row. Page
  navigation participates in the editor's unsaved-change guard.
- The Catalog matrix now compares stored signatures with actual option links.
  Drift is surfaced as `SIGNATURE_MISMATCH`, excluded from a misleading matrix
  position, and counted as missing/repair work.
- Added a bounded searchable Variant picker and exact-SKU media galleries.
  Product, colour-option, and Variant placements stay distinct; removing a
  placement explicitly retains the Media-library asset.
- Preserved and incorporated the interrupted saved-Product guard/typed empty
  workspace edits found at the start of the run. Fixed the one-line shared
  SearchInput null-safety error that blocked Admin production builds.
- Twenty-three focused Catalog/Variant/Media/Storefront/API tests pass. Focused
  lint and Admin/database/contracts TypeScript pass; fresh Docker Admin, API,
  and Storefront builds are healthy. Authenticated browser proof was blocked
  only because rebuilding containers invalidated the saved local session.
- Next: `MERCHANDISER_WORKLIST_AND_WORKSPACE_CLARITY`; do not begin integrated
  organization/sizing/content/lifecycle review first.

## 2026-09-12 — Merchandiser worklist and workspace clarity

- Added four intentional Product worklist orders—recent, attention first,
  oldest, and name—while retaining bounded server pagination and URL state.
  Every attention row now shows the first canonical publishing issue and opens
  the exact editor section that owns recovery.
- The worklist derives that issue from the same readiness facts used by the
  Product workspace. Its structural-Variant count now uses the shared signature
  and active-option predicate, so the P0 repair condition is not hidden there.
- Product detail makes media scope legible: Product fallback, option gallery,
  and SKU-specific placements are counted and Variants explain their effective
  coverage rather than presenting a misleading zero. Published Products expose
  an explicit root-safe Storefront handoff; drafts remain unpreviewable.
- Seventeen focused Catalog, Variant-integrity, Storefront, API, and Admin tests
  pass. Catalog/API/Admin TypeScript and executable-surface lint pass; the
  pre-existing contracts lint errors remain outside this Product change. The
  Admin production build completes all 56 routes. Fresh authenticated browser
  review remains unavailable because the local rebuild invalidated the saved session.
- Next: `INTEGRATED_ORGANIZATION_SIZING_CONTENT_LIFECYCLE_REVIEW`; do not begin
  final verification and owner review first.

## 2026-09-12 — Integrated organization, sizing, content, and lifecycle review

- Confirmed a Product operator could select an arbitrary published guide before
  the server rejected its sizing-domain mismatch, or select a guide without a
  system and have the form silently remove the configuration. The editor now
  requires a system before guide selection, limits choices to active published
  guides in that system's domain, and keeps an incompatible legacy selection
  visible until the operator replaces it.
- Sizing configuration writes and guide/system archival now lock their shared
  authority rows in one transaction. Guide archival preserves the Product's
  system configuration and audit history; system archival remains blocked while
  an active Product configuration uses it. A legacy configuration pointing at
  an archived guide cannot reach the public guide projection.
- Product Details now gives merchandisers the effective product-specific sizing
  system/guide context, a recovery message when sizing access is absent, and a
  direct guide handoff. Existing structured-content conflict recovery,
  lifecycle actions, and published Storefront handoff were revalidated from
  their focused tests and current source.
- Eighteen focused Catalog/Sizing/Storefront/Admin state and handoff tests pass;
  affected database/API/Admin/Storefront TypeScript and executable-surface lint
  pass, and the Admin production build completes all 56 routes. Browser proof
  remains unperformed because the prior local rebuild invalidated the safe
  authenticated session.
- Next: `VERIFICATION_AND_OWNER_REVIEW`; do not begin unrelated Product work.
