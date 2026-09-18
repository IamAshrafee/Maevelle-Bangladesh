# Transfer Operations Closeout

## Outcome

`INVENTORY_TRANSFER_OPERATIONS_COMPLETION` is complete at `ce3d571`.
Transfers now support a real operational path from retry-safe editable Draft to
selective receipt or documented, final discrepancy closure.

## Delivered behavior

- Transfer creation is canonically idempotent and current Drafts use optimistic
  concurrency for full replacement.
- Receiving is selective: an omitted line remains in transit rather than being
  silently received or lost.
- A transfer operator can close any whole remaining line as `MISSING` or
  `LOST`, with a required reason, optional note, actor, timestamp, immutable
  transfer record, audit event, transactional outbox event, and canonical
  idempotent response.
- Closed quantities cannot be received later. A transfer closes as
  `CLOSED_WITH_DISCREPANCY` only once every dispatched unit is either received
  or explicitly resolved.
- Cost allocations now track written-off quantities. Receipt, in-transit
  projections, and integrity checks exclude permanently resolved quantities,
  preserving cost-layer reconciliation.
- Admin exposes the action only on in-transit/partially received transfers,
  shows the discrepancy on each line, prevents resolved stock appearing in the
  receive sheet, and makes the closed state filterable.

## Verification

- Fresh disposable `maevelle_test` migration baseline: passed.
- Focused Inventory and Procurement integration suite: 23 tests passed.
- Database build and API typecheck: passed.
- Targeted lint and `git diff --check`: passed.
- Admin-wide typecheck remains blocked only by existing Sizing unit errors in
  the sizing pages; no error is attributable to the transfer changes.
- Browser/owner visual review was not performed.

## Next recommended work

Proceed with the Stocktake/Reconciliation hardening phase: accurate snapshot
locking, count review/approval, found-stock handling, condition-aware counts,
and an operator-safe reconciliation trail.
