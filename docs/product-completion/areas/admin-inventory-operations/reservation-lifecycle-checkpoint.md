# Reservation and Order Lifecycle Checkpoint

**Checkpoint:** `962cf74`

**Substage:** `INVENTORY_RESERVATION_ORDER_LIFECYCLE`

**State:** in progress

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

## Verification

- Database, Admin, and Worker focused TypeScript checks passed.
- 36 focused tests passed across Inventory, Orders, Fulfillment/Delivery, and
  Worker lifecycle.
- Focused lint passed for all touched implementation/test files. The shared
  contracts file still reports five pre-existing `no-explicit-any` findings in
  unrelated analytics contracts.
- A fresh temporary PostgreSQL database successfully applied the complete
  migration baseline including the revised Reservation indexes, then was
  removed.
- The repository-wide typecheck remains blocked by the unrelated in-progress
  `apps/api/src/routes/sizing.ts` worktree changes; no Inventory failure was
  reported by the focused checks.

## Remaining Phase 3 work

- Add an explicit organization-configured timeout policy for manual-payment
  Orders before setting `payment_intents.expires_at`; repository UX architecture
  explicitly forbids inventing a countdown.
- Implement timeout-versus-payment-verification serialization and automatic
  Order cancellation only after that policy exists.
- Surface payment waiting/review/rejected state and stale active Order holds as
  operational exceptions in Reservations.
- Extend Inventory integrity checks for active Reservations whose Order owner is
  terminal or whose allocation totals disagree with the Reservation header.
- Add API authorization/contract coverage for the enriched Reservation response
  and protected release command.
