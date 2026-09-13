# Current Focus

## Active Area

Admin Inventory Operations

## Why Now

The user explicitly selected Inventory for deep completion work. Current source
shows a strong locked quantity ledger and several real cross-domain workflows,
but physical quantity and cost provenance diverge during Transfers, condition
changes, adjustments, Stocktakes, and returned-stock resale. Stocktake posting
also has an unsafe current-balance read/lock order. Those integrity boundaries
must be repaired before expanding the Admin experience.

## Current Status / Substage

`PLANNED` — `INVENTORY_FOUNDATION_INTEGRITY`

## Evidence Already Known

The current-head assessment is recorded in
`areas/admin-inventory-operations/inventory-assessment-and-roadmap.md` at
baseline `b1f5d08`. It traces schema, services, APIs, Admin pages, Catalog,
Orders, Fulfillment/Delivery, Supply/Receiving, Returns, Costing, Search,
Analytics, permissions, audit, outbox, and tests. Typecheck and architecture
checks passed; 38 focused integration tests passed; all migrations through
`2800_supply_operations` are applied locally. No Inventory implementation was
changed during the assessment.

## Immediate Objective

Make every existing physical Inventory movement preserve explainable quantity
and cost truth, and make Stocktake reconciliation safe under concurrent
movements, before broad UI work.

## Next Exact Action

Add failing regression proof for Transfer/condition/adjustment/Stocktake/return
resale cost-provenance gaps and the concurrent Stocktake posting race. Then
implement the smallest coherent cost-safe movement and Stocktake locking
checkpoint, expand integrity checks, and close it with focused verification.

## Important Constraints

Extend the existing Inventory ledger and projections; do not create a parallel
stock system. Preserve tenant/capability checks, historical movement evidence,
transactions, optimistic versions, idempotency, audit, outbox, Order/Fulfillment
locking, Receiving atomicity, and Costing provenance. Keep the first checkpoint
focused on correctness, not the broad Admin redesign.

## Blockers / Owner Review

No technical blocker is recorded. Authenticated visual/owner review was not part
of the source assessment and remains a later UX verification gate.
