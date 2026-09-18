# Current Focus

## Active Area

Admin Inventory Operations

## Why Now

Inventory Workspace, traceability, and Reservation/Order lifecycle completion
are complete. The next operational gap is making physical counting a safe,
reviewable reconciliation process rather than a thin quantity-editing flow.

## Current Status / Substage

`READY` — `INVENTORY_STOCKTAKE_RECONCILIATION_HARDENING`

## Evidence Already Known

The completed Reservation lifecycle is recorded in
`areas/admin-inventory-operations/reservation-lifecycle-checkpoint.md`. Commit
`373d7e8` adds configurable manual-payment deadlines, race-safe timeout
cancellation, Payment review exceptions, stale-owner integrity checks, and the
existing safe release/fulfillment coordination.

## Immediate Objective

Make physical stocktake a safe reconciliation authority: serialize snapshot and
posting against stock movement, support count review/approval and cancellation,
record condition-aware found/short counts, and expose a practical operator flow.

## Last Completed Action

Transfer Operations completed at `ce3d571`: selective receipt does not infer
disposition for omitted lines, and Missing/Lost closure is authenticated,
tenant-scoped, idempotent, audited, outboxed, visible in Admin, and reconciled
through cost allocations. Fresh baseline migration and 23 focused integration
tests passed.

## Important Constraints

Preserve the existing Warehouse Transfer authority, Inventory movement ledger,
Costing provenance, tenant isolation, capability authorization, idempotency,
optimistic concurrency, audit, and outbox behavior. Posted dispatch/receipt
movements are immutable facts; corrections must be new explainable movements.

## Blockers / Owner Review

No technical blocker is recorded. Authenticated visual/owner review remains a
distinct review gate and does not weaken the automated transaction and contract
evidence.
