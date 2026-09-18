# Current Focus

## Active Area

Admin Inventory Operations

## Why Now

Inventory Workspace, traceability, and Reservation/Order lifecycle completion
are complete. The next operational gap is making physical counting a safe,
reviewable reconciliation process rather than a thin quantity-editing flow.

## Current Status / Substage

`IN_PROGRESS` — `INVENTORY_STOCKTAKE_RECONCILIATION_HARDENING`

## Evidence Already Known

The completed Reservation lifecycle is recorded in
`areas/admin-inventory-operations/reservation-lifecycle-checkpoint.md`. Commit
`373d7e8` adds configurable manual-payment deadlines, race-safe timeout
cancellation, Payment review exceptions, stale-owner integrity checks, and the
existing safe release/fulfillment coordination.

## Immediate Objective

Complete the last financial-integrity boundary in physical stocktake: ensure a
condition-aware count moves existing cost provenance between conditions instead
of incorrectly treating a reclassification as a write-off plus unvalued gain.

## Last Completed Action

Stocktake hardening reached `e335f28`: review/cancel lifecycle, concurrency
locking, condition-aware counts, found-SKU lines, and the responsive Admin
workflow are implemented and focused checks passed. Cost-position treatment of
condition reclassification remains the final validation/correction before
closing this stage.

## Important Constraints

Preserve the existing Warehouse Transfer authority, Inventory movement ledger,
Costing provenance, tenant isolation, capability authorization, idempotency,
optimistic concurrency, audit, and outbox behavior. Posted dispatch/receipt
movements are immutable facts; corrections must be new explainable movements.

## Blockers / Owner Review

No technical blocker is recorded. Authenticated visual/owner review remains a
distinct review gate and does not weaken the automated transaction and contract
evidence.
