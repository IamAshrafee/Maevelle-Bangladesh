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

`ACTIVE_IMPLEMENTATION` — `SAFE_PUBLISHED_VARIANT_INTEGRITY`

## Evidence Already Known

The current Product list, detail workspace, and sectioned editor form a solid
base: URL-backed worklist filters and pagination, readiness, domain-owned
pricing/inventory/media/sizing signals, content conflict recovery, and
tenant/capability-scoped routes all exist. A current local desktop review and
source assessment found one P0 correctness issue plus product-worklist,
variant-scale, media, and Storefront-preview gaps. Focused database tests are
present but were not runnable locally because `maevelle_test` is absent.

## Immediate Objective

Fix the published Product option/variant integrity boundary before expanding
the surrounding workspace. A published Product must not retain active Variants
that refer to archived axes or values and therefore cannot be selected on the
Storefront; historical order/inventory records must remain intact and the
operator must receive a clear recovery path.

## Next Exact Action

Implement `SAFE_PUBLISHED_VARIANT_INTEGRITY`: trace option-axis/value archival,
variant status/lifecycle, Storefront projection, and readiness together; choose
and prove an explicit safe outcome for affected published Products, including
operator-facing explanation and focused regression tests. Do not begin the
worklist/editor breadth stages first.

## Important Constraints

Catalog owns product identity and publication. Pricing, inventory, media, and
sizing retain their own authoritative writes. Preserve tenant/capability checks,
transactions, optimistic versions, audit, and outbox behavior.

## Blockers / Owner Review

No technical blocker recorded. Owner review is not yet requested because the
area is being assessed, not presented for acceptance.
