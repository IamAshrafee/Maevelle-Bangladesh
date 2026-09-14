# Reservation and Order Lifecycle Checkpoint

**Checkpoint:** `373d7e8`

**Substage:** `INVENTORY_RESERVATION_ORDER_LIFECYCLE`

**State:** complete

## Policy established

| Reservation owner/state | Quantity outcome | Authority |
| --- | --- | --- |
| Active Order, no Fulfillment | Remains reserved until Order cancellation or Fulfillment dispatch | Orders |
| Active Order with open Fulfillment | Order cancellation first cancels all open warehouse work, then releases the remaining reservation in the same transaction | Orders coordinating Fulfillment and Inventory |
| Order with dispatched Fulfillment | Order cancellation is rejected; physically dispatched stock must use Delivery/Return recovery | Fulfillment / Returns |
| Standalone hold with explicit future expiry | Remains reserved | Inventory |
| Standalone hold whose explicit expiry has passed | Worker releases it once and records `EXPIRED` with system audit/outbox evidence | Inventory worker |
| Order-owned hold containing an expiry timestamp | Generic expiry deliberately ignores it | Orders |
| Rejected manual-payment attempt | Reservation remains owned by the active Order because rejection is an attempt outcome and the READY intent still permits resubmission | Payments / Orders |
| Manual-payment Order before its configured deadline | Reservation remains owned by the pending Order | Payments / Orders |
| Manual-payment reference awaiting review after the deadline | Automatic timeout pauses; staff see an overdue-review exception and must verify or reject the claim | Payments |
| Unclaimed or rejected manual-payment Order after the deadline | Worker cancels the pending Order and its READY intent, cancels open Fulfillment work, and releases stock exactly once | Orders coordinating Payments, Fulfillment, and Inventory |
| COD Order | No automatic expiry is invented; cancellation or dispatch is required | Orders |

## Completed in this checkpoint

- Generic Inventory release now rejects every Order-owned Reservation. The only
  internal bypass is a matching Order cancellation authority checked against the
  durable Order-to-Reservation bridge.
- Order cancellation now uses its supplied idempotency key canonically, cancels
  open Fulfillments in the same transaction, releases remaining Reservations,
  cancels READY payment intents, and records the combined outcome.
- Cancellation is rejected after any Fulfillment has dispatched physical stock.
- Standalone timed holds are reaped with `FOR UPDATE SKIP LOCKED`, deterministic
  idempotency, `SYSTEM` audit identity, an expiry outbox event, and an expiry
  lookup index. Order-owned holds are excluded by durable relationship, not by a
  source label.
- Reservation queries expose original, consumed, released, and remaining
  quantities plus the actual owning Order and live Fulfillment status.
- Admin search is server-backed, Order links now use the real Order ID rather
  than the Order Line source reference, order-owned rows no longer offer the
  unsafe Release command, and retrying a standalone release reuses its command
  identity.
- Each active manual wallet method now requires an organization-configured
  payment window from 15 minutes through seven days. COD deliberately has no
  automatic expiry.
- Order placement snapshots the policy into a Payment Intent deadline. The
  worker finds expired unpaid intents, while Order cancellation re-locks and
  revalidates the exact intent inside the cancellation transaction. Payment
  verification locks that same intent, so only verification or timeout can win.
- Submitted payment references pause automatic timeout until staff verify or
  reject them. Rejected claims retain their evidence while the still-expired
  obligation becomes eligible for cancellation.
- Reservation reads now expose Payment state and deadline and classify terminal
  owner, held Order, rejected Payment, overdue review, and expired standalone
  hold exceptions. Admin displays those conditions directly rather than asking
  staff to infer them from source labels.
- Integrity verification now detects active Reservations owned by terminal
  Orders and allocation/header identity or quantity mismatches.
- Protected Reservation list/release and Payment policy routes have explicit API
  authentication regression coverage. Existing capability checks remain
  authoritative on the handlers.

## Verification

- 45 focused PostgreSQL tests passed across Inventory, Orders,
  Fulfillment/Delivery, and Payments, including final-unit concurrency,
  timeout/review/rejection behavior, cancellation, tenant isolation,
  idempotency, rollback, and integrity exceptions.
- Six API foundation tests passed, including unauthenticated denial for the
  Reservation list/release and Payment policy routes.
- Database build and focused Admin, API, and Worker TypeScript checks passed.
- Focused lint and `git diff --check` passed.
- A freshly recreated disposable `maevelle_test` database successfully applied
  the complete migration baseline, including the Payment policy constraint and
  expiry index.
- Authenticated visual/owner review remains a separate product review gate; no
  browser verification was required for the transaction-policy closeout.

## Phase 3 closeout

Phase 3 is complete at `373d7e8`. Every supported active Reservation now has an
explicit owner or expiry path; order-owned release is controlled by the Order
lifecycle; manual-payment timeout is configured rather than invented; timeout
and verification serialize on the authoritative Payment Intent; and stale
ownership is visible both operationally and through integrity checks.

The next roadmap phase is `INVENTORY_TRANSFER_OPERATIONS_COMPLETION`. It must
extend the existing Warehouse Transfer authority rather than introduce another
stock movement system.
