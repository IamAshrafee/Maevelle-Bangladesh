# Current Focus

## Active Area

Admin Inventory Operations

## Why Now

Inventory Workspace and Traceability is complete. Staff can now see authoritative
stock positions and explain movement history across Locations, conditions,
Reservations, Transfers, and inbound Supply. Reservation ownership and generic
expiry are now safe. The remaining lifecycle gap is policy-driven manual-payment
timeout: Maevelle needs an explicit configurable window and a race-safe terminal
path rather than an invented global countdown.

## Current Status / Substage

`IN_PROGRESS` — `INVENTORY_RESERVATION_ORDER_LIFECYCLE`

## Evidence Already Known

The ownership/expiry checkpoint is recorded in
`areas/admin-inventory-operations/reservation-lifecycle-checkpoint.md`. Commit
`962cf74` prevents unsafe direct release, coordinates Order cancellation with
open Fulfillment work, blocks cancellation after dispatch, reaps only explicitly
expiring standalone holds, and exposes real ownership/allocation state in Admin.

## Immediate Objective

Ensure every Reservation has one explicit business owner, cannot reduce ATS
indefinitely after its owner becomes terminal, and can be consumed, released, or
expired exactly once without racing Order, Payment, cancellation, or Fulfillment
work.

## Next Exact Action

Define an organization-configured timeout for manual-payment Orders, then make
payment timeout race safely with verification, Order cancellation, and
Fulfillment. Surface payment/stale-owner exceptions and add terminal-owner and
allocation integrity checks plus API authorization coverage.

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
