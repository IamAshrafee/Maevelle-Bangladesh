# Stocktake reconciliation hardening closeout

## Outcome

The physical stocktake workflow is now a reviewable, idempotent reconciliation
operation. Counts are captured by condition, the session is submitted for
review before posting, and a reviewer can cancel a session before it changes
Inventory. Posting locks the current levels before calculating variance, so a
movement that races with counting is reconciled against the authoritative
balance rather than a stale snapshot.

## Financial-integrity correction

When a count changes condition without changing total quantity (for example,
SELLABLE 5 to SELLABLE 4 plus DAMAGED 1), posting now matches the condition
loss and gain and calls the existing Costing condition-move operation. It no
longer creates a write-off plus an unvalued addition for that reclassification.
Only unmatched physical loss is written off, and only unmatched found stock is
recorded as an unvalued addition.

## Evidence

- Commit: `e799499` (`inventory: preserve cost provenance in stocktake reclassification`)
- Fresh local migration through `2800_supply_operations` completed successfully.
- `packages/database/src/inventory.test.ts`: 16 tests passed.
- `packages/database/src/procurement.test.ts`: 11 tests passed, including the
  acquired-cost condition-reclassification regression.
- Database package build, API TypeScript check, targeted ESLint, and `git diff
  --check` passed.
- Browser/owner visual review was not performed in this checkpoint; the
  repository's automated transaction and contract evidence remains the gate
  recorded here.

## Deliberate boundary

This closes the active stocktake-reconciliation hardening stage. It does not
claim that every future Inventory enhancement (such as replenishment policy,
alerts, barcode workflows, or supplier shortage automation) is required or
already implemented. Those should be reassessed from current repository
evidence when a new Inventory work item is selected.
