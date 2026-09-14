# Current Focus

## Active Area

Admin Inventory Operations

## Why Now

Inventory Workspace and Traceability is complete. Staff can now see authoritative
stock positions and explain movement history across Locations, conditions,
Reservations, Transfers, and inbound Supply. The highest remaining integrity risk
is Reservation ownership: holds can currently outlive failed or timed-out Payment
paths, and manual release does not sufficiently account for downstream
Fulfillment claims.

## Current Status / Substage

`PLANNED` — `INVENTORY_RESERVATION_ORDER_LIFECYCLE`

## Evidence Already Known

The assessment and roadmap are recorded in
`areas/admin-inventory-operations/inventory-assessment-and-roadmap.md`; Phase 2
closeout is in
`areas/admin-inventory-operations/workspace-traceability-closeout.md`. Commit
`11c2336` passed typecheck, focused lint, Admin/API production builds,
architecture checks, and 50 focused Inventory/Catalog/Procurement/Costing/
Returns/Storefront/Admin tests.

## Immediate Objective

Ensure every Reservation has one explicit business owner, cannot reduce ATS
indefinitely after its owner becomes terminal, and can be consumed, released, or
expired exactly once without racing Order, Payment, cancellation, or Fulfillment
work.

## Next Exact Action

Trace the current Order, Payment, Reservation, Fulfillment, cancellation, failed
payment, and timeout transitions into a single state/ownership matrix. Then add
failing tests for expiry-versus-fulfillment, payment failure, cancellation replay,
partial consumption, and unauthorized or unsafe manual release before changing
domain behavior.

## Important Constraints

Preserve Inventory's locked ATS check, atomic Order placement, existing
idempotency/audit/outbox behavior, tenant isolation, and Fulfillment consumption
boundary. Do not add cart-level holds. COD policy must not expire legitimate
confirmed Orders, and recovery actions must never release stock already claimed
by a live Fulfillment.

## Blockers / Owner Review

No technical blocker is recorded. Authenticated visual/owner review of the Phase
2 workspace remains a distinct review gate and does not weaken its automated
contract/integrity evidence.
