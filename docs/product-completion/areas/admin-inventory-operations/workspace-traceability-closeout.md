# Inventory Workspace and Traceability Closeout

## Outcome

Phase 2 is complete at `11c2336`. Maevelle staff now have an authoritative,
server-paged stock-position workspace and movement timeline that explain current
physical, reserved, sellable, unavailable, incoming, and in-transit quantities
without introducing a second Inventory source of truth.

## What changed

- Added one Inventory position per SKU and Location, aggregating all condition
  balances, Reservations, open Transfers, and inbound Supply without counting
  incoming goods as physically on hand.
- Added searchable, paged movement history with condition, date, Location,
  movement-type, and order filters; rows include reason, actor, source number,
  and the resulting condition balance.
- Enriched Inventory Item detail with authoritative server totals, Catalog and
  variant identity/status, open movements, Reservation context, and source-aware
  history.
- Made creation of an inbound Shipment establish the Inventory Item relationship
  through the Inventory domain transaction boundary. Planned goods remain hidden
  from incoming stock until in transit or arrived, and on-hand remains zero until
  a Receipt is posted.
- Corrected summary language and contracts so unavailable stock includes damaged,
  quarantine, and inspection quantities rather than presenting damaged-only data
  as the full unavailable total.
- Rebuilt the Stock and History Admin surfaces with URL-backed server search,
  filters, sorting, accurate totals, pagination, responsive card/table layouts,
  loading/empty/error recovery, and Product, Location, Item, Transfer, Stocktake,
  Receiving, Fulfillment, and Return navigation.
- Moved dashboard low/out-of-stock lists from legacy condition rows to the same
  authoritative position model and made partial dashboard failures visible.
- Shared the active Admin capability context with page content. Inventory command
  entry points are now hidden unless the active user has the matching Adjust,
  Transfer, or Stocktake capability; backend authorization remains authoritative.

## Areas affected

- Shared contracts: Inventory position, history, detail, and unavailable totals.
- Database/application services: Inventory read models and inbound Shipment to
  Inventory Item integration.
- API: validated position, history, detail, and Reservation query boundaries.
- Admin: Inventory dashboard, Stock, History, Item detail, shared capability and
  feedback primitives.
- Tests: Inventory read models, pagination, source/actor visibility, incoming
  Supply, tenant isolation, and permission-sensitive rendering.

## Database changes

No table or migration changed. The existing ledger, levels, condition balances,
Reservations, Transfers, Receipts, and Catalog relationships remain authoritative.
All new aggregation is read-side behavior. Shipment allocation now calls the
existing Inventory Item semantic operation inside the Shipment transaction.

## Verification performed

- Fresh disposable test database migrations through
  `2800_supply_operations`: passed.
- `pnpm typecheck`: passed.
- Focused ESLint for every touched Admin, API, and database file: passed.
- Admin production build: passed (57 routes generated).
- API build: passed.
- `pnpm check:architecture`: passed for 13 workspace packages.
- 50 focused tests across Admin capability rendering, Inventory, Catalog variant
  integrity, Procurement/Receiving, Costing, Returns, and Storefront: passed.
- `git diff --check`: passed.
- Browser/owner visual review: not performed; it remains a distinct review gate.

## Remaining gaps and risks

- Reservation expiry, payment-failure release, partial-consumption operations,
  and unsafe manual-release policy are deliberately left for Phase 3.
- Transfer discrepancy closure, Receiving shortage closure, condition disposition,
  and richer Stocktakes remain their dedicated roadmap phases.
- Transfer and Stocktake sources deep-link to exact records. Receiving,
  Fulfillment, and Return receipt history exposes the exact source number and
  opens the correct workspace, but those modules do not yet provide a universal
  record-detail route for every receipt reference.
- The position query uses tenant-scoped lateral aggregates. It is bounded by
  server pagination and current indexes, but production-volume query plans should
  be measured before adding speculative caches or another projection.
- Low-stock remains the existing fixed five-unit rule. Reorder policy and
  incoming-aware replenishment belong to the later reporting/alerts phase.

## Next recommended phase

Proceed to `INVENTORY_RESERVATION_ORDER_LIFECYCLE`: define Reservation ownership
and terminal-state policy first, then implement expiry/payment-failure release,
safe fulfillment-aware recovery, operational exception visibility, and race-safe
tests without introducing cart-level holds.
