# Commerce Completion Remediation Phases

## Goal

Close the concrete completion blockers from the Orders and Customers audit so
Commerce can be treated as a complete operational workflow. Each phase is a
vertical, finished capability rather than a narrow patch.

## Phase 1 — Commercial reversals and return integrity

Make financial and reverse-logistics outcomes authoritative and internally
consistent.

- Make Order cancellation payment-aware. A cancellation with confirmed money
  must create or require a tracked refund obligation; it must never silently
  leave a cancelled Order as paid with no reversal workflow.
- Introduce an explicit cancellation settlement record/state where needed so
  operators can see the required next financial action.
- Enforce that a return case can contain only lines, fulfillment evidence, and
  delivery evidence belonging to its Order.
- Make linked refund completion advance the Return’s commercial-resolution
  state atomically, while retaining a complete audit/outbox trail.
- Keep Inventory, Payments, Returns, and Orders as the owners of their own
  facts; orchestration must use their published domain operations.

## Phase 2 — Authoritative Storefront delivery pricing

Make shipping/delivery charges a first-class checkout calculation.

- Define the configured delivery-pricing rule and snapshot its result at
  checkout/order placement.
- Recalculate it from the delivery address and Cart server-side, include it in
  calculation fingerprints and checkout review, and persist it in the Order
  and Payment Intent.
- Make confirmation, COD instructions, Admin detail, and manual-order behavior
  use the same commercial total semantics.

## Phase 3 — Reliable Commerce event delivery

Make asynchronous Commerce effects actually consumable and recoverable.

- Normalize emitted Commerce event names and consumer contracts.
- Resolve the affected Customer correctly for Order, Payment, Fulfillment,
  Delivery, and Refund events.
- Ensure notification, analytics, search, and webhook consumers receive
  idempotent authoritative events without making core transactions depend on
  workers.

## Phase 4 — Maintainability closeout

Finish the structural work needed to keep the completed domain understandable.

- Split the oversized Orders database module and API route by checkout,
  lifecycle commands, query projections, and financial adapters.
- Preserve public contracts and transaction boundaries while removing mixed
  responsibilities from those files.

## Working rule

Phases are completed as cohesive implementation work. Do not treat an
intermediate schema, route, or UI-only change as a completed phase when its
cross-domain workflow is unfinished.