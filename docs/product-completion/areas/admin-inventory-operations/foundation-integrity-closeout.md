# Inventory Foundation Integrity Closeout

## Outcome

Phase 1 is complete at `c905dfd`. Maevelle's existing Inventory ledger remains
the quantity source of truth, but every currently supported physical movement
now also preserves known cost provenance or writes explicit evidence that an
addition is unvalued. Stocktake posting, Catalog archive state, Storefront
availability refresh, totals, shared contracts, and integrity verification are
aligned with that foundation.

## What changed

- Cost positions now retain Location and condition. Transfer dispatch/receipt,
  condition moves, negative adjustments, and negative Stocktake variances move
  or consume those positions in the same database transaction as quantity.
- Positive manual and Stocktake additions create explicit unvalued-addition
  evidence instead of silently manufacturing acquisition value.
- Returned sellable units carry recovered cost positions and can be fulfilled
  again without losing provenance or double-recognizing COGS recovery.
- Transfer cost allocations and receipts record the valuation in transit and
  make duplicate receipt replay safe.
- Stocktake posting locks the counted lines and current Inventory Levels before
  calculating variance, and records movements since the snapshot.
- Inventory transactions and movement lines are protected by database triggers
  and grants against update/delete, not only by application convention.
- Whole-number quantity policy is enforced for current `UNIT` Inventory Items
  on server commands and reflected in the affected Admin forms.
- Product/Variant archival synchronizes Inventory Item state. Archived stock
  remains historically visible and can be reduced, reconditioned, transferred,
  received, or returned, while new positive stock and Reservations are blocked
  until an eligible Catalog entity is restored.
- Storefront Search consumes real Inventory/Reservation/Transfer/Receiving/
  Fulfillment/Return outbox events idempotently and rebuilds once per affected
  Organization batch.
- Global and Location on-hand totals no longer double-count Reservations.
- Reservation, Transfer, Stocktake, and History contracts were corrected;
  active Reservation views now include partially consumed holds.
- The Admin integrity center now evaluates Inventory balance/ledger,
  Reservation, transit, Stocktake-source, and cost-position invariants.
- The PostgreSQL test bootstrap script is pinned to LF through `.gitattributes`,
  fixing clean Linux container execution from a Windows checkout.

## Areas affected

- Database baseline: Warehouse, Inventory, Costing, and Return-cost migrations.
- Domain services: Inventory, Warehouse, Catalog, Costing, Returns, Storefront
  projection, and Admin integrity operations.
- Contracts/API: Inventory history/reservation/stocktake and Warehouse Transfer
  response shapes.
- Admin: adjustments, condition quantities, Stocktake counts, Transfer create/
  receive/list state, movement badges, and Warehouse Location type values.
- Tests: Inventory, Catalog variant integrity, Procurement/Receiving, Costing,
  Returns, and Storefront Search.

## Database behavior

The mutable development baseline was changed in place. New tables preserve
return cost positions, Transfer cost allocations/receipts, condition/writeoff
cost movements, and unvalued additions. Cost positions are keyed by source
layer, Location, and condition. Composite Organization foreign keys and
append-only Inventory ledger triggers strengthen tenant and history boundaries.
No forward-only migration or data backfill was created because local data is
disposable under the current repository policy.

## Verification performed

- Fresh `docker compose down --volumes` followed by `docker compose up -d
  --build`: passed; all baseline migrations through `2800_supply_operations`
  applied and Admin/API/Storefront became healthy.
- Fresh test database migration: passed.
- Production Admin, Storefront, API, and Worker image builds: passed.
- `pnpm typecheck`: passed.
- `pnpm check:architecture`: passed for 13 workspace packages.
- 48 focused tests across Inventory, Catalog variant integrity, Procurement,
  Costing, Returns, and Storefront: passed.
- `git diff --check`: passed.
- Browser/owner visual review: not performed; Phase 1 intentionally made only
  minimum contract-correctness UI changes.

Repository-wide `pnpm lint` remains red on pre-existing findings in Sizing,
Customers, several untouched Inventory detail components, Orders, Supply, and
other files. `pnpm check:hardening` remains red on the existing shared chart
HTML-sink review and three Catalog route authorization-pattern findings. The
Inventory implementation did not introduce those reported hardening findings.

## Remaining gaps and risks

- An unvalued positive addition is now explainable but still needs an explicit
  later valuation workflow; fulfillment fails closed when mixed stock cannot be
  fully costed.
- Reservation expiry/payment ownership, Transfer discrepancy closure, inbound
  shortage closure, condition disposition, and richer physical-count workflow
  remain roadmap phases rather than hidden Foundation work.
- The Admin experience is still fragmented and lacks running balances, actor
  identity, strong source navigation, durable URL state, and operator-focused
  exception queues.
- Costing remains financially sensitive. Future movement types must use the
  shared cost-position operations and extend integrity tests rather than write
  balances directly.

## Next recommended phase

Proceed to **Inventory Workspace and Traceability**. Start with authoritative,
server-paged stock/history/detail contracts and a responsive Admin information
architecture; then add running balances, actor/reason/source visibility,
URL-backed filters, and reliable cross-module links. Reservation lifecycle and
Transfer mutation redesign remain separate later phases.
