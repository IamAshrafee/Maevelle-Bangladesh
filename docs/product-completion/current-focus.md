# Current Focus

## Active Area

Admin Inventory Operations

## Why Now

The active Inventory hardening work is complete. Inventory operations is left
idle until a new repository-evidenced capability is selected.

## Current Status / Substage

`IDLE`

## Evidence Already Known

The completed Reservation lifecycle is recorded in
`areas/admin-inventory-operations/reservation-lifecycle-checkpoint.md`. Commit
`373d7e8` adds configurable manual-payment deadlines, race-safe timeout
cancellation, Payment review exceptions, stale-owner integrity checks, and the
existing safe release/fulfillment coordination.

## Immediate Objective

None. Reassess the current repository before starting the next Inventory
capability.

## Last Completed Action

Stocktake hardening closed at `e799499`: review/cancel lifecycle, concurrency
locking, condition-aware counts, found-SKU lines, responsive Admin workflow,
and cost-safe condition reclassification are implemented. See
`areas/admin-inventory-operations/stocktake-reconciliation-closeout.md`.

## Important Constraints

Preserve the existing Warehouse Transfer authority, Inventory movement ledger,
Costing provenance, tenant isolation, capability authorization, idempotency,
optimistic concurrency, audit, and outbox behavior. Posted dispatch/receipt
movements are immutable facts; corrections must be new explainable movements.

## Blockers / Owner Review

No technical blocker is recorded. Authenticated visual/owner review remains a
distinct review gate for the Admin UI and was not performed in this
checkpoint.
