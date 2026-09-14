# Current Focus

## Active Area

Admin Inventory Operations

## Why Now

Inventory Foundation Integrity is now complete. The authoritative ledger,
current balances, cost positions, Storefront availability, Catalog archive
state, and integrity checks are aligned across the existing movement paths.
The next operational bottleneck is staff visibility: the Admin surfaces remain
fragmented and do not yet make quantity, location, condition, reason, actor,
source document, and running balance easy to understand together.

## Current Status / Substage

`PLANNED` — `INVENTORY_WORKSPACE_TRACEABILITY`

## Evidence Already Known

The assessment and roadmap are recorded in
`areas/admin-inventory-operations/inventory-assessment-and-roadmap.md`; the
Foundation closeout is in
`areas/admin-inventory-operations/foundation-integrity-closeout.md`. Commit
`c905dfd` passed a fresh main/test database construction, production container
builds, typecheck, architecture checks, and 48 focused Inventory/Catalog/
Costing/Procurement/Returns/Storefront tests.

## Immediate Objective

Give Maevelle staff one authoritative, responsive Inventory workspace that can
answer how many units exist, where they are, what can sell, what is reserved or
unavailable, and exactly what changed, why, by whom, and from which business
document.

## Next Exact Action

Define the paged stock/history/detail API contracts and Admin information
architecture. Implement running balances, actor/reason/reference fields,
server-backed URL search/filter/sort, and reliable Product, Location, and source
document links before broader dashboard polish.

## Important Constraints

Keep the ledger and current balance projections authoritative; the workspace is
a read/command surface, not a new stock source. Reuse shared contracts and UI
primitives, keep queries server-paged, preserve tenant/capability boundaries,
and design touch-first for mobile, tablet, and desktop. Do not absorb Reservation,
Transfer discrepancy, Receiving, or Stocktake workflow redesign into this phase.

## Blockers / Owner Review

No technical blocker is recorded. Repository-wide lint and hardening still
report known unrelated baseline findings; these are recorded in the Foundation
closeout. Authenticated visual/owner review remains a distinct gate for the new
workspace.
