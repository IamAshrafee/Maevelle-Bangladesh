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
