# Current Focus

## Active Area

Admin Product Management Workspace

## Why Now

Products are the upstream operating record for merchandising and customer
discovery. The workspace received concentrated recent changes after the former
tracker was deleted, so its real workflow and remaining gaps are uncertain.
It is bounded enough to establish the V2 assessment process without assuming
that the historical Catalog stage remains current.

## Current Status / Substage

`ACTIVE_IMPLEMENTATION` — `SCALABLE_VARIANT_AND_MEDIA_OPERATIONS`

## Evidence Already Known

`SAFE_PUBLISHED_VARIANT_INTEGRITY` is complete. Catalog now serializes
publication and option/Variant mutations on the Product row, rejects unsafe
published option archival with affected SKU details, preserves archived
Variant links/history, detects legacy structural inconsistency in readiness,
and suppresses incoherent Products from live public reads/search. The
disposable `maevelle_test` database was created and 17 focused Catalog,
Storefront, and API tests pass.

## Immediate Objective

Complete the high-count Variant and variant-media operating workflow. The
editor must not silently stop at the first 100 matrix combinations, and
operators need safe generation/reconciliation, practical editing, and
variant-scoped media placement while Pricing and Inventory remain authoritative
in their own domains.

## Next Exact Action

Implement `SCALABLE_VARIANT_AND_MEDIA_OPERATIONS`: design and prove complete
matrix traversal beyond 100 combinations, safe bounded bulk operations and
high-count editing, plus variant-scoped media assignment in the Product
workspace. Do not begin worklist sorting/reason cues or Storefront preview.

## Important Constraints

Catalog owns product identity and publication. Pricing, inventory, media, and
sizing retain their own authoritative writes. Preserve tenant/capability checks,
transactions, optimistic versions, audit, and outbox behavior.

## Blockers / Owner Review

No technical blocker recorded. The Admin production build has a pre-existing
TypeScript failure at `components/ui/search-input.tsx:93`, so the new recovery
panel was not visually verified in a freshly built Admin container. Owner
review is not yet requested because the area remains in implementation.
