# Current Focus

## Active Area

Admin Inventory Operations

## Why Now

Inventory Workspace, traceability, and Reservation/Order lifecycle completion
are complete. The next operational gap is internal Transfer execution: draft
correction, reliable retry, selective receiving, and explicit closure for every
unit dispatched but not received.

## Current Status / Substage

`PLANNED` — `INVENTORY_TRANSFER_OPERATIONS_COMPLETION`

## Evidence Already Known

The completed Reservation lifecycle is recorded in
`areas/admin-inventory-operations/reservation-lifecycle-checkpoint.md`. Commit
`373d7e8` adds configurable manual-payment deadlines, race-safe timeout
cancellation, Payment review exceptions, stale-owner integrity checks, and the
existing safe release/fulfillment coordination.

## Immediate Objective

Make Warehouse Transfers operationally complete from editable Draft through
dispatch, selective receipt, and authorized discrepancy closure while preserving
owned quantity, condition, value, and history in transit.

## Next Exact Action

Revalidate Transfer contracts and current Admin workflows at `373d7e8`. First
close idempotent create and versioned Draft-line editing, including scalable
SKU selection and capability-valid Location choices; then proceed to selective
receipt and shortage/damage/loss closure.

## Important Constraints

Preserve the existing Warehouse Transfer authority, Inventory movement ledger,
Costing provenance, tenant isolation, capability authorization, idempotency,
optimistic concurrency, audit, and outbox behavior. Posted dispatch/receipt
movements are immutable facts; corrections must be new explainable movements.

## Blockers / Owner Review

No technical blocker is recorded. Authenticated visual/owner review remains a
distinct review gate and does not weaken the automated transaction and contract
evidence.
