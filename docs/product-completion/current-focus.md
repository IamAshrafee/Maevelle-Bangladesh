# Current Focus

## Active Area

Admin Commerce — Orders & Customers

## Why Now

Orders and Customers are the selected module-completion area. The first
foundation checkpoint repaired broken manual-order contracts, established
explicit sales-channel and customer-source facts, hardened guest identity and
tenant boundaries, and connected customer support context to authoritative
order, payment, return, and refund history.

## Current Status / Substage

`IMPLEMENTATION_COMPLETE / VERIFICATION_PENDING`

## Evidence Already Known

Atomic checkout, immutable order/customer/address snapshots, stock
reservations, payment intents, fulfillment/delivery links, cancellation,
idempotency, audit, and outbox foundations already existed. Manual order entry
now uses those same invariants and supports catalog pricing, explicit override
reasons, payment method, stock location, delivery address, and Bangladesh
social/phone channels. Customer creation and checkout identity use E.164 phone
normalization and conservative matching; ambiguous identities remain separate
for operator review. Admin detail views now expose accurate totals, recent
orders, and commerce metrics, while failed delivery auto-completion remains
retryable instead of being acknowledged early.

## Immediate Objective

Perform authenticated owner review of the completed Orders and Customers
workflows at mobile, tablet/iPad, and desktop widths. Record only concrete
follow-up defects; implementation work has no known open blocker.

## Last Completed Action

Completed the Commerce implementation: multi-axis lifecycle worklists,
controlled whole-line cancellation, audited pre-fulfillment address correction,
Customer merge/anonymization, notes, source/date filtering, and responsive Admin
controls. Fresh development/test baselines migrate successfully; 32 focused
tests and Database/API/Admin builds pass.

## Important Constraints

Preserve Orders as the commercial aggregate, Inventory as stock authority,
Payments as collection/refund authority, Fulfillment as pick/pack authority,
Delivery as shipment/outcome authority, and Returns as reverse-logistics
authority. Keep historical snapshots immutable and preserve tenant isolation,
capability authorization, exact money math, idempotency, optimistic
concurrency, audit, outbox, and transaction boundaries.

## Blockers / Owner Review

No technical blocker is recorded. Authenticated owner review is still required
for responsive manual order creation, order detail/actions, customer creation,
customer detail/history, and the revised worklists.
