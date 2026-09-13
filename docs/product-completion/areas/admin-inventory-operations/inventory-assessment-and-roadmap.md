# Inventory Module Assessment and Upgrade Roadmap

**Assessment date:** 2026-09-13  
**Repository baseline:** `b1f5d08`  
**Assessment state:** complete; no Inventory implementation was changed during this assessment  
**Next selected stage:** `INVENTORY_FOUNDATION_INTEGRITY`

## Executive verdict

Maevelle does not have a shallow CRUD-only Inventory backend. Its current core already has several production-worthy decisions: variant-owned inventory identities, organization-scoped multi-location balances, condition balances, an append-oriented movement ledger, pessimistic row locking, strict no-oversell reservations, idempotent high-risk movements, transfer and stocktake lifecycles, atomic inbound receiving, atomic fulfillment consumption, physical return receiving, audit events, and transactional outbox events.

The module is nevertheless **not production-ready as one coherent inventory system**. The main problem is that several individually strong domains do not preserve one shared physical-and-financial truth across their boundaries. In particular:

1. Cost provenance is created by inbound receiving and return receiving, but Inventory transfer, condition change, negative adjustment, and stocktake operations move physical quantity without moving or consuming the corresponding cost position. Returned cost layers are valued but are not consumed by outbound FIFO assignment. This can make a transferred or returned unit sellable while its later fulfillment has no valid COGS provenance.
2. Stocktake posting reads the current level while locking only the stocktake line. A concurrent movement can land after that read and before the eventual level lock, causing the posted variance to be based on stale physical state.
3. Storefront search availability is rebuilt only for `catalog.product.*` outbox events. Live PDP/cart/checkout stock remains authoritative and overselling is prevented, but product cards and stock filters can remain stale after Inventory events.
4. The Admin UI contains multiple broken contracts and misleading surfaces: new transfers navigate to `undefined`, two warehouse type choices violate the database constraint, history filters use transaction types that do not exist, Inventory deep links do not hydrate filters, and stock totals double-count reservations.
5. Operational closure paths are incomplete: no reservation expiry worker, no payment-failure stock-release policy, no transfer discrepancy close, no inbound shortage close, no real stocktake review/approval, and no useful “who/why/source document” Inventory history.

The right evolution is to harden the existing source of truth—not replace it—and then build the operator experience around real transactions and exception queues.

## Assessment method and evidence

The assessment traced current migrations, database services, API handlers, shared contracts, Admin routes/components, Storefront availability, cart/checkout/order placement, fulfillment/delivery, procurement/inbound receiving, returns/RTO, costing, analytics, exports, worker processing, permissions, audits, outbox handling, and focused integration tests.

Verification performed against the assessment baseline:

- `pnpm typecheck` — passed.
- `pnpm check:architecture` — passed for 13 workspace packages.
- Focused database integration tests — 38 passed across Inventory, Orders, Procurement, Fulfillment/Delivery, and Returns.
- `pnpm db:migrate:status` against the local development database — all checked-in migrations through `2800_supply_operations` applied.
- Read-only local projection check — 5 Inventory Items, 0 Levels, 0 Inventory Transactions, 0 active Reservations, 0 open Transfers, 1 open Stocktake; no ledger-versus-balance mismatch was present in the empty current dataset.
- `pnpm check:hardening` — failed on four existing non-Inventory findings (`chart.tsx` HTML sink recognition and three Catalog route authorization-boundary recognizers). No reported finding was in an Inventory/Warehouse/Supply route, so this was recorded rather than represented as an Inventory pass.

No authenticated browser review was performed. The UI findings below come from route/component/API tracing and compilation, not visual or owner acceptance. The current local data is too sparse to validate day-to-day usability by observation.

---

## A. Current architecture

### Ownership and source of truth

The current ownership model is sound in principle:

```text
Catalog Product
  -> Product Variant (organization-unique normalized SKU)
     -> Inventory Item (stable inventory identity)
        -> Inventory Level per Warehouse Location
           -> Condition balances
           -> Reserved quantity

Inventory Transaction + Movement Lines = historical quantity evidence
Inventory Levels + Condition Balances   = transactionally maintained current projection
Available To Sell                       = sellable - reserved
```

- Catalog owns Product, option, Variant, SKU, publication, and archive state.
- Inventory owns Inventory Item identity, physical quantities, conditions, reservations, quantity ledger, and stocktakes.
- Warehouse owns business Locations, capabilities, and Transfer workflow headers/lines; Inventory posts the physical dispatch/receipt movements.
- Orders own commercial intent and link each Order Line to an Inventory Reservation.
- Fulfillment owns allocation/pick/pack/dispatch; dispatch consumes both the Reservation allocation and physical sellable stock in one transaction.
- Supply owns Suppliers, Purchases, inbound Shipments, and physical Receipts; a posted Receipt calls Inventory inside the same transaction.
- Returns owns return/RTO workflow; only a posted physical Return Receipt restores Inventory.
- Costing owns acquisition layers, FIFO assignment, return layers, valuation, and COGS—not Inventory quantity.
- Search and Analytics are rebuildable projections, not transactional authority.

The primary schema foundation is in `0500_warehouse.ts`, `0600_inventory.ts`, `1300_fulfillment.ts`, `1500_procurement.ts`, `1600_inbound_shipment.ts`, `1700_receiving.ts`, `1900_costing.ts`, and `2000_returns.ts`. The Inventory migration explicitly describes ledger entries as authority and levels as projections, but unlike `audit.audit_events`, the database does not revoke update/delete on Inventory ledger tables.

### Quantity model

- `inventory_levels.sellable_quantity` includes reserved units.
- `reserved_quantity` is a claim against sellable quantity and is constrained not to exceed it.
- `unavailable_quantity` is the sum of `DAMAGED`, `QUARANTINE`, and `INSPECTION` condition balances.
- `available_to_sell = sellable_quantity - reserved_quantity` and is derived in queries.
- On hand should be `sellable + unavailable`. Two summary queries incorrectly add `reserved` again.
- Quantities are `numeric(20,6)` and cross HTTP as strings. The Catalog item unit is effectively discrete fashion stock, but no invariant currently requires whole units for `UNIT` inventory.

### Transaction and concurrency model

`postTransaction` inserts an Inventory Transaction, sorts movement lines into a deterministic lock order, locks or creates the Inventory Level and condition row, rejects negative balances or sellable below reserved, updates the level/condition projection, and inserts movement lines in the same database transaction.

A repository-wide direct-write search found no production updates to `inventory_levels` or `inventory_level_conditions` outside `packages/database/src/inventory.ts`. Supported physical workflows therefore converge on the same projection writer today; the remaining risk is database-level bypass because the tables and ledger are not privilege-hardened.

Reservation creation locks the location/item level and enforces ATS before incrementing reserved quantity. Fulfillment consumption first releases the consumed reserved quantity, then posts the physical negative movement inside the caller-owned fulfillment transaction. These paths correctly protect the final-unit race.

Critical direct Inventory mutations use `platform.idempotency_records`, payload fingerprints, replay responses, audit events, and outbox events. Transfer creation/approval/cancel, stocktake start/count, Location management, and Order cancellation do not all use the same idempotency pattern; optimistic versions cover several but not all of those commands.

### Tenant and authorization model

- Every primary Inventory/Warehouse/Supply table carries `organization_id`.
- Composite tenant foreign keys protect many cross-domain relationships.
- Database services scope commands and queries by Organization; focused tests cover cross-tenant denial for reservation, transfer, stocktake, fulfillment, receipt, and return operations.
- API routes establish an Admin context and require a named capability. The backend is the authorization authority; hidden navigation is not relied upon.
- There is no PostgreSQL row-level security. Isolation depends on application query discipline plus tenant-aware foreign keys.

Capabilities currently include:

- `warehouse.view`, `warehouse.manage`
- `inventory.view`, `inventory.adjust`, `inventory.reserve`, `inventory.transfer`, `inventory.stocktake`
- `procurement.view`, `procurement.manage`
- `inbound_shipment.view`, `inbound_shipment.manage`
- `receiving.view`, `receiving.post`
- `fulfillment.view`, `fulfillment.manage`, `fulfillment.dispatch`
- `returns.view`, `returns.manage`, `returns.receive`
- separate Costing, Analytics, export, integrity, and audit capabilities

The grants are strong enough to separate sensitive operations, but the Inventory UI does not consistently render actions from the same capability decisions. For example, Reservations is visible with `inventory.view` but its Release button requires `inventory.reserve`; Transfers navigation uses `inventory.transfer`, while create/approve/cancel currently require `warehouse.manage`.

---

## B. Current feature map

Status meanings in this table describe the current end-to-end capability, not code volume.

| Capability | Status | Evidence-based assessment |
| --- | --- | --- |
| Variant-to-Inventory Item identity | COMPLETE | Existing Variants were backfilled; new Variants create an Inventory Item in the Catalog transaction. |
| Organization-unique SKU | COMPLETE | `sku_normalized = upper(trim(sku))`, unique per Organization; barcode is also unique per Organization when present. |
| Multi-warehouse balances | COMPLETE | Level is unique per Organization + Item + Location. |
| Condition balances | FUNCTIONAL BUT BASIC | Sellable, damaged, quarantine, and inspection are real balances; costing does not follow condition moves. |
| ATS calculation | COMPLETE | Derived as sellable minus reserved; enforced under level lock. |
| No-oversell reservation | COMPLETE | Concurrent final-unit tests prove one winner. |
| Inventory quantity ledger | FUNCTIONAL BUT BASIC | Every supported physical command posts movement evidence; database append-only enforcement and operator visibility are missing. |
| Projection updates | COMPLETE | Ledger line and current condition/level projection commit atomically for supported movement commands. |
| Reconciliation query | PARTIAL | Compares total movement quantity with total condition quantity only; it does not check per-condition balance, level rollups, reservation allocations, transfer transit, or cost positions. |
| Manual signed adjustment | PARTIAL | Real ledger/audit/idempotency path, but cost provenance/loss effects, durable retry UX, before/after preview, and stronger reason policy are missing. |
| Opening balance | PARTIAL | Transaction type exists, but the Admin selector cannot find zero-level new Variants and no opening cost/unvalued resolution flow exists. |
| Condition change | PARTIAL | Conserves physical quantity and records paired movements; cost positions remain in the old condition. |
| Inventory Item detail | FUNCTIONAL BUT BASIC | Balances/history/reservations exist; option summary, full history, sources, actors, and useful prefilled actions are absent. |
| Inventory history | PARTIAL | Server paging exists; filters and display omit core evidence and several UI filter values are invalid. |
| Location master | PARTIAL | Multiple typed/capability-bearing Locations work; invalid UI type values and capability-removal invariants are defects. |
| Default warehouse | MISSING | No default Location/allocation preference is modeled. |
| Bin/storage sublocations | MISSING | No intra-warehouse bin model; not currently required for the first upgrade stages. |
| Transfer create/draft/approve | BROKEN | Backend creates/approves, but create UI reads `data.id` while API returns `data.transferId`; users land on `/undefined`. Draft line edit is absent. |
| Transfer dispatch | PARTIAL | Atomic and idempotent quantity removal; transit exists only as Transfer line state and cost provenance does not move. |
| Transfer receipt | PARTIAL | Partial and condition-aware receipt exists; UI cannot omit a line, cost provenance does not move, and discrepancies cannot be closed. |
| Transfer cancellation | FUNCTIONAL BUT BASIC | Draft-only cancellation; no post-dispatch loss/return/correction path. |
| In-transit visibility | PARTIAL | Transfer line quantities imply it; Inventory balances/history/reporting do not present owned in-transit stock coherently. |
| Reservation create/release/consume | FUNCTIONAL BUT BASIC | Core mechanics are strong; expiry, safe manual release, complete status contract, and source navigation are incomplete. |
| Reservation expiry | MISSING | `expires_at`/`EXPIRED` exist in schema but no worker expires and releases claims. Order reservations have no expiry. |
| Checkout reservation | COMPLETE | Order and Reservation are atomic; stale Catalog/price/stock blocks the Order without partial facts. |
| Explicit Order cancellation release | COMPLETE | Eligible cancellation releases remaining reservations transactionally. |
| Payment rejection/timeout release policy | MISSING | Rejecting/failing payment does not cancel the Order or release stock; no timeout job exists. |
| Fulfillment reservation allocation | COMPLETE | Partial claims are serialized and overclaim is blocked. |
| Fulfillment physical consumption | PARTIAL | Physical/reservation transaction is strong; transferred and returned stock can lack consumable FIFO provenance. |
| Failed delivery handling | FUNCTIONAL BUT BASIC | Failure does not fabricate stock; RTO/Return Receipt is the physical restoration path. Operational linkage remains manual. |
| Customer/RTO physical return receipt | PARTIAL | Atomic condition-aware quantity and cost recovery exist; returned cost layers are not consumed by later outbound FIFO. |
| Supplier/Purchase Order | FUNCTIONAL BUT BASIC | Supplier and Purchase lifecycle exists; shortage/closure semantics are weak. |
| Inbound Shipment | FUNCTIONAL BUT BASIC | Allocation, departure, arrival, and cancellation exist; no discrepancy close/actual shipped quantity resolution. |
| Inbound Receiving | FUNCTIONAL BUT BASIC | Multiple partial condition-aware receipts, over-receipt prevention, costing, audit, outbox, and idempotency are strong; scanner/bulk UX and shortage close are absent. |
| Landed cost and valuation | PARTIAL | Inbound/return valuation exists; adjustments, transfers, condition moves, and stocktake effects are disconnected. |
| Stocktake snapshot/count/post | BROKEN | Basic workflow exists, but concurrent movement race and condition-blind posting make it unsafe as a reconciliation authority. |
| Stocktake review/approval/cancel | FRONTEND ONLY | Schema names `REVIEW`/`CANCELLED` and UI says “Review & Post,” but no actual transition, approval, or cancel command exists. |
| Cycle/partial count | MISSING | Only a full existing-level Location snapshot exists. |
| Found stock during count | MISSING | Zero-level Inventory Items are omitted and cannot be added. |
| Low/out-of-stock view | PARTIAL | Hard-coded ATS threshold `<= 5`; counts are Location levels, not unique SKUs; no per-SKU/location policy. |
| Replenishment recommendations | MISSING | No reorder point, safety stock, lead-time, or purchase suggestion. |
| Inventory export | BACKEND ONLY | Operations page can export up to 1,000 level rows; not discoverable in Inventory and omits conditions, unavailable, ATS, references, and full pagination. |
| Daily Inventory snapshots | PARTIAL | Table/query exists, but capture happens only during an Analytics rebuild and incoming/in-transit are never populated. |
| Bulk adjustment/transfer/receipt | MISSING | Receiving supports multiple lines in one receipt, but no reusable bulk operational workflow/import validation. |
| Lot/serial tracking | PARTIAL | Enum values exist only; there are no lot/serial entities or commands. This should remain deferred unless a real product need appears. |
| Storefront stock availability | PARTIAL | PDP/cart/checkout read live truth; Search projection can remain stale after Inventory changes. |
| Inventory alerts | MISSING | No low-stock, stale reservation, overdue transfer, unresolved discrepancy, or large-adjustment alert generation. |

---

## C. Admin Portal map

### Direct Inventory workspace

| Route / surface | Purpose | Current state |
| --- | --- | --- |
| `/inventory` | Overview/KPIs, low/out stock, damage, recent movements, Locations, active reservations, quick actions | Attractive shell but partial failures silently become zero; total on hand is wrong; alerts can duplicate/misclassify condition rows; several links do not hydrate destination filters. |
| `/inventory/stock` | Paginated condition-by-Location stock table with search and filters | Real server query. URL parameters are ignored on initial load, no sort/bulk/export, zero-stock items are absent, and exact page-size results show a possibly false Next button. |
| `/inventory/stock/[inventoryItemId]` | SKU balances, recent movements, active reservations | Functional detail, but Variant option summary is always absent, history is capped at 25, actor/source/reason text is absent, and action links do not prefill. |
| `/inventory/history` | Movement ledger | Operationally misleading. It calls the ledger “double-entry,” its type filters mostly do not match backend values, search only filters the current page, and the API withholds who/why/source document. |
| `/inventory/adjustments` | Signed adjustment and condition movement | Real commands. Item lookup searches existing stock rows, so opening a brand-new zero-level SKU is impossible. No before/after balance, safe retry token persistence, cost consequence, large-adjustment guard, or capability-aware action state. Several mobile grids are not responsive. |
| `/inventory/reservations` | Active/all reservations and manual release | Real list/release. Order sources are `ORDER_LINE`, so UI Order links never render. Visual expiry does not release ATS. Manual release can invalidate a fulfillment allocation. Search is current-page only. |
| `/inventory/warehouses` | Location list/search/create | Functional but basic; client-only search and limited operational totals. |
| `/inventory/warehouses/new` | Create Location | Broken for “Retail Store” and “Dropshipper”: UI sends `STORE`/`DROPSHIPPER`, while the database accepts `RETAIL_STORE`/`THIRD_PARTY`. Capability defaults are fixed rather than deliberate. |
| `/inventory/warehouses/[locationId]` | Location summary, stock table, configuration | Real stock and editing. Total on hand double-counts reservations; incoming is hardcoded to zero; removing essential capabilities can strand active stock/work; Transfer deep-link prefill is ignored. |
| `/inventory/transfers` | Transfer worklist | Server paging/search/status. UI offers invalid `DISPATCHED` status and omits `PARTIALLY_RECEIVED`; backend list omits shared-contract totals/line count. |
| `/inventory/transfers/new` | Create multi-line Transfer | Backend request is real, but successful creation navigates to `undefined`; source prefill is ignored; only first 100 stock rows are selectable; duplicates are not prevented; incompatible Locations are shown. |
| `/inventory/transfers/[transferId]` | Approve/cancel/dispatch/receive | Lifecycle actions are real. Draft cannot be edited; receipt defaults every remaining line to fully sellable; zero receipt lines cannot be omitted; discrepancy closure and cost effects are absent. |
| `/inventory/stocktakes` | Stocktake worklist | Search field is inert, list emphasizes raw Location ID, and status options include unreachable Review. |
| `/inventory/stocktakes/new` | Start Location count | Starts a real snapshot but offers ineligible Locations and allows empty counts. |
| `/inventory/stocktakes/[stocktakeId]` | Enter counts and post | Autosaves per row and uses optimistic versioning, but local state can enable Post before saves settle. “Review & Post” bypasses review. No condition count, notes, recount, approval, cancel, or found-item flow. Backend posting is concurrency-unsafe. |

### Cross-domain Admin surfaces affecting Inventory

| Surface | Inventory relationship | Current state |
| --- | --- | --- |
| `/products/[id]` details | Shows live Variant ATS and links to Inventory | ATS is an authoritative projection from Inventory. The table header “Physical” actually contains weight/dimensions, while “Available” contains ATS. Inventory search link is ignored by the destination page. |
| Product edit / Variants | Creates/archives sellable SKUs | Create produces Inventory Item atomically. Archive does not archive Inventory Item or block Inventory commands; historical stock remains, as it should. |
| `/suppliers`, `/purchases` | Source intent and ordered quantity | Real basic supplier/purchase workflows. |
| `/inbound-shipments` | Allocates PO lines, departure, arrival | Real shipment state, but shortage and final-close semantics are missing. |
| `/receiving` | Posts condition-aware inbound receipt | Strong core workflow; not embedded or summarized in Inventory overview/history with adequate source links. |
| `/fulfillments` and Order detail dialog | Allocates reservations and dispatches stock | Strong lifecycle and explicit warning that dispatch is physical consumption. |
| `/deliveries` | Records delivered/failed outcome | Does not change Inventory, correctly; failed goods require RTO/return receipt. |
| `/returns`, `/rto` | Posts physical reverse receipt | Quantity and cost recovery are atomic; subsequent FIFO gap remains. |
| `/costing` | Cost layers, valuation, COGS | Separate authority; detects several mismatches but does not make non-receipt Inventory movements cost-safe. |
| `/analytics` | Captures/shows Inventory snapshots | Snapshot is not scheduled daily; incoming/in-transit remain zero. |
| `/operations` | Exports Inventory | Real permission-safe export exists outside Inventory, capped at 1,000 and too shallow for operations. |
| `/integrity` | Cross-domain integrity findings/repairs | Useful read-only checks and safe projection rebuilds; Inventory reconciliation coverage is narrower than the business invariants. |

### Important UI action traces

#### Adjustment

```text
Adjustment form -> POST /admin/inventory/adjustments
-> inventory.adjust capability -> adjustInventory
-> Location eligibility + Inventory Item resolution
-> locked condition/level -> Transaction + movement + projection
-> audit + outbox + idempotency result -> UI reload/message
```

Quantity trace is sound. Cost trace is absent.

#### Order purchase

```text
Add to bag -> live Catalog/Variant + ATS validation
-> checkout snapshot (no Reservation yet)
-> place Order transaction -> lock eligible Location level
-> Order Line + Reservation + Reservation Allocation
-> ATS falls, on hand unchanged
-> Fulfillment claims allocation
-> dispatch transaction consumes reserved claim + sellable physical quantity
-> Delivery success recognizes COGS; Order completion changes no stock
```

This is the strongest current end-to-end Inventory workflow.

#### Transfer

```text
Create form -> Warehouse Transfer DRAFT
-> approve READY -> dispatch
-> negative SELLABLE Inventory Transaction at source
-> Transfer lines represent in-transit quantity
-> destination receipt condition split
-> positive Inventory Transaction at destination
```

Physical quantity is traceable, but cost provenance is not transferred and operational discrepancy closure is missing.

#### Inbound receipt

```text
Supplier Purchase -> placed PO lines
-> inbound Shipment allocation -> IN_TRANSIT -> ARRIVED
-> receiving count split by condition
-> immutable Receipt + Inventory movement + projection + provisional cost layer
-> shipment receiving status update + audit + outbox
```

This is strong and atomic. It cannot formally close supplier/shipment shortages.

#### Return / failed delivery

```text
Delivery failure -> no Inventory restoration
-> initiate RTO / create Return -> transport/authorization workflow
-> physical Return Receipt -> condition-aware Inventory movement
-> return cost layer + COGS recovery where provenance exists
```

The physical timing is correct. Re-selling returned stock does not consume the return layer in outbound assignment.

---

## D. Backend map

### Tables and projections

| Schema | Important tables | Role |
| --- | --- | --- |
| `warehouse` | `locations`, `location_capabilities`, `transfers`, `transfer_lines` | Physical operating places and Transfer workflow. |
| `inventory` | `inventory_items`, `inventory_levels`, `inventory_level_conditions`, `inventory_transactions`, `inventory_movement_lines`, `inventory_reservations`, `inventory_reservation_allocations`, `fulfillment_inventory_allocations`, `stocktake_sessions`, `stocktake_lines` | Inventory identity, current quantity projections, historical movement, claims, and counts. |
| `procurement` | `suppliers`, `purchases`, `purchase_lines` | Supply intent and ordered quantity. |
| `inbound_shipment` | `shipments`, `purchase_line_allocations` | Inbound movement and allocated shipped quantity. |
| `receiving` | `inbound_receipts`, `inbound_receipt_lines` | Immutable physical receipt documents. |
| `fulfillment` | `fulfillments`, `fulfillment_lines` | Outbound physical work. |
| `returns` | return cases/lines/authorizations/transport events/receipts | Reverse logistics and physical restoration. |
| `costing` | cost layers/positions/assignments/COGS/return layers | Financial provenance and valuation. |
| `analytics` | `inventory_daily_snapshots` | Rebuildable reporting snapshot, currently manually refreshed. |
| `platform` / `audit` | idempotency records, outbox events, audit events | Retry safety, event propagation, operator evidence. |

### Inventory and Warehouse APIs

All routes are under `/admin` and all use backend capability checks.

- `GET /inventory/stock`
- `GET /inventory/history`
- `POST /inventory/adjustments`
- `POST /inventory/condition-movements`
- `POST /inventory/reservations`
- `GET /inventory/reservations`
- `POST /inventory/reservations/:reservationId/release`
- `POST /inventory/stocktakes`
- `GET /inventory/stocktakes`
- `GET /inventory/stocktakes/:stocktakeId`
- `POST /inventory/stocktakes/:stocktakeId/lines/:inventoryItemId/count`
- `POST /inventory/stocktakes/:stocktakeId/post`
- `GET /inventory/stats`
- `GET /inventory/stock/:inventoryItemId`
- `GET /warehouse/locations`
- `POST /warehouse/locations`
- `GET /warehouse/locations/:locationId`
- `PATCH /warehouse/locations/:locationId`
- `GET /warehouse/transfers`
- `POST /warehouse/transfers`
- `GET /warehouse/transfers/:transferId`
- `POST /warehouse/transfers/:transferId/approve`
- `POST /warehouse/transfers/:transferId/cancel`
- `POST /warehouse/transfers/:transferId/dispatch`
- `POST /warehouse/transfers/:transferId/receive`

### Supply, outbound, and reverse APIs touching Inventory

- Suppliers: list/create/update/archive.
- Purchases: list/detail/create, add/update/delete line, place, cancel.
- Inbound Shipments: list/detail/create, depart, arrive, cancel.
- Receiving: list Receipts and post a Receipt to an arrived Shipment.
- Fulfillment: list/detail/create, ready, start picking, pack, dispatch, cancel.
- Delivery: list/detail/create, manual booking, dispatch, delivered, failed.
- Returns/RTO: list/detail/create, authorize, create RTO, post physical Receipt, attach Refund.
- Orders: place from checkout or Admin, status transition, explicit cancellation and Reservation release.

### Events, jobs, and integrations

- Inventory adjustment, condition move, Reservation create/release, Transfer dispatch/receipt, Stocktake start/post, inbound receipt, fulfillment, and return operations emit audit/outbox evidence.
- The worker handles notifications, emails, webhooks, analytics, imports, Storefront search, and Order completion.
- There is no Reservation expiry/reaper job.
- Search consumption listens only for `catalog.product.%`, so Inventory outbox events do not refresh public availability.
- Analytics Inventory snapshots are captured during an explicit rebuild, not by a daily scheduled job.
- No Inventory-specific low-stock or exception alert producer exists.

### Contract quality

Shared DTOs exist, but implementation drift is significant:

- Reservation DTO omits `PARTIALLY_CONSUMED` although the database/service emits it.
- Transfer list DTO requires totals and line count that the query does not return.
- Stocktake service/UI use a custom shape that differs from `StocktakeDetailDto` names.
- History DTO is too narrow for the audit promise made by the UI.
- Several database functions return `any`, weakening compile-time enforcement at the API boundary.

### Tests

Current tests strongly cover:

- condition balances, ATS, ledger, audit, and outbox for adjustment;
- final-unit concurrency and tenant isolation;
- idempotent adjustment/release;
- competing Transfer dispatch and basic reconciliation;
- draft Transfer cancellation;
- at-most-once Stocktake posting;
- atomic Order + Reservation, stale input failure, and final-unit behavior;
- fulfillment allocation/dispatch concurrency, rollback, and tenant isolation;
- Shipment allocation, partial condition-aware receipt, over-receipt, retry, rollback, and tenant isolation;
- return/RTO physical and cost recovery, retry, rollback, and tenant isolation.

Missing tests align with the main findings: concurrent movement during Stocktake post; cost-layer behavior for Transfer/condition/adjustment/Stocktake; resale of returned stock; Reservation expiry/payment rejection; Storefront search refresh after Inventory events; API/shared-contract tests; and Admin component/workflow tests.

---

## E. Integration map

### Products, Options, Variants, SKU, and archive

- Inventory is tracked at **Variant / Inventory Item / Location / condition** grain, not Product grain.
- Every newly created Variant receives one Inventory Item in the same Catalog transaction; the migration backfilled existing Variants.
- Inventory Items may have nullable `variant_id` at schema level, which permits future non-Catalog stock identities, but no current operator command creates them.
- SKU uniqueness is enforced by `(organization_id, sku_normalized)` and barcode uniqueness by Organization.
- Product Management shows ATS from Inventory queries. It is a read projection; Catalog cannot write stock.
- Archiving/unpublishing a Product or Variant hides it from public Catalog/cart flows and preserves historical Inventory. However, Inventory Item status is not synchronized and direct adjustment/reservation can still target an archived Variant because `ensureItem` checks existence/tenant only.
- Zero-level Inventory Items are invisible in the stock query and adjustment search, so “every sellable Variant is trackable” is true in storage but false in the Admin workflow.

### Orders, checkout, fulfillment, delivery, cancellation, and refund

- Cart and checkout validate live ATS but do not reserve.
- Order placement chooses and locks an eligible stock-holding Location, creates the Order Line, Reservation, and allocation atomically.
- On hand stays unchanged; reserved rises; ATS falls.
- Fulfillment claims Order allocation; dispatch is the physical negative SELLABLE movement and consumes reserved quantity atomically.
- Delivery success recognizes COGS; completion changes no Inventory.
- Explicit cancellation of a pending/confirmed/on-hold Order releases remaining Reservations and restores ATS.
- Checkout expiry happens before an Order Reservation exists and needs no release.
- Failed/rejected payment does not currently expire/cancel the Order or release stock.
- Failed Delivery does not restore Inventory because the unit has physically left; RTO/Return Receipt is the correct restoration route.
- Refund alone does not change Inventory, correctly.
- Partial Return restores only physically received quantity. Replacement has no dedicated exchange orchestration; it should be a new outbound Order/Fulfillment plus independent Return.
- There is no mutable post-placement Order-line edit flow, avoiding silent Reservation drift.

### Supply, importing, receiving, and cost

The software can represent:

```text
PO ordered 100
-> Shipment allocated 98
-> Receipt posted 96
-> those 96 split among SELLABLE/DAMAGED/QUARANTINE/INSPECTION
```

It cannot resolve the remaining two PO units or two shipped-but-not-received units as accepted shortages/missing/damaged-in-transit and formally close those commitments. They remain open implied differences.

Receipt is the correct boundary where physical Inventory begins. Shipment arrival does not create stock. A Receipt creates Inventory movement and acquisition-cost facts together. This foundation should be kept.

### Warehouses and locations

- Multiple Locations are supported with types, active/inactive/archive state, and operational capabilities.
- Stock, Reservations, receipt eligibility, Transfer send/receive, fulfillment, and return receiving are Location-specific.
- Deactivation/archive is blocked when current stock or Reservations exist.
- There is no default Location or explicit allocation priority.
- Removing `STOCK_HOLDING`, Transfer, fulfillment, or receiving capabilities from an active Location is not protected against existing stock/open work.
- No bin/shelf placement exists.

### Returns, accounting, and cost

- Inbound Receipts create provisional acquisition layers and positions.
- Fulfillment dispatch consumes FIFO positions; Delivery success recognizes COGS.
- Return Receipt can recover prior cost into return cost layers and reverse COGS.
- Inventory transfer, condition movement, adjustment, and Stocktake do not move/consume/create cost-position effects.
- Outbound FIFO assignment reads acquisition `cost_layers/cost_layer_positions`, not `return_cost_layers`; returned stock can therefore be valued but not assigned on resale.

---

## F. Problems and gaps by severity

### P0 — correctness/security/source-of-truth

#### INV-P0-01 — Physical movements can detach stock from cost provenance

Affected paths: Transfer dispatch/receipt, condition move, negative/positive adjustment, Stocktake correction, and resale after Return Receipt.

Physical quantity commits without the corresponding cost-position move, consumption, unvalued-stock fact, or loss fact. Consequences include overstated source valuation, missing destination valuation, integrity findings, blocked FIFO dispatch when partial cost provenance exists, and silent no-COGS fulfillment when a Location has no acquisition layer. Returned stock is included in valuation but not in outbound FIFO assignment.

This is the first repair priority because a system that knows quantity but loses the financial identity of that quantity cannot answer what the business owns or what a sold unit cost.

#### INV-P0-02 — Stocktake posting can reconcile against a stale current balance

The posting query locks Stocktake lines but not Inventory Levels. It calculates `variance = counted - actual`, then later `postTransaction` locks the level. A concurrent receipt, sale, transfer, or adjustment between those points makes the variance stale and can force the final system balance away from the intended physical count.

Fix must establish an explicit movement-aware policy and lock/read order; adding a UI warning is insufficient.

### P1 — major business capability or broken workflow

1. **Ledger immutability is not database-enforced.** Application code is append-oriented, but Inventory Transaction and movement tables are not protected from update/delete as Audit is.
2. **Storefront Search availability goes stale after Inventory changes.** Only Catalog product events trigger rebuild.
3. **Reservation expiry/payment-failure release is absent.** Active claims can hold ATS indefinitely.
4. **Manual Reservation release can break fulfillment.** It does not reject already-claimed, non-cancelled fulfillment allocations.
5. **Transfer cost and discrepancy lifecycle is incomplete.** No loss/damage/short receipt closure; transit is not included in Inventory reporting.
6. **Successful Transfer creation has broken navigation** because frontend and response contract disagree.
7. **Location creation exposes invalid database enum values.** Two user-visible choices fail at runtime.
8. **Location capability changes can strand stock or open work.** Only status deactivation has a stock guard.
9. **Stocktake is condition-blind and cannot count zero-level/found Items.** Posting all variance to SELLABLE can fail or misclassify unavailable stock.
10. **Stocktake “review” is not a workflow.** No review/approval/cancel transitions; UI posts directly.
11. **Inbound shortage/Transfer discrepancy closure is absent.** Open quantities have no controlled terminal explanation.
12. **On-hand summary is incorrect.** Global and Location summaries add reserved quantity twice.
13. **Inventory unit policy is ambiguous.** Decimal stock is accepted for unit-based fashion SKUs without a whole-unit invariant.
14. **Archived Catalog lifecycle is incomplete.** Inventory commands can operate on archived Variants and Inventory Item status is unused.
15. **Shared API contracts have drifted.** Reservation, Transfer, Stocktake, and history shapes disagree across layers.

### P2 — important operations and UX

1. History lacks actor, note, reference type/document, transaction number, running balance, and direct source links.
2. History transaction filters mostly use non-existent values; “double-entry” wording is false.
3. Dashboard errors silently become zero/empty values.
4. Dashboard Stock deep links and Product/Location action prefill are ignored.
5. New zero-stock Variants cannot be opened through Adjustment search.
6. Low-stock threshold is a hard-coded 5 per Location; counts are not unique SKUs and there is no replenishment policy.
7. Stock list lacks sort, durable URL state, useful total-page calculation, saved views, and direct export.
8. Searches on Reservations and History only filter the loaded page.
9. Transfer create loads only the first 100 source stock rows and permits duplicate lines.
10. Transfer receipt requires a positive quantity for every submitted line and defaults all remaining quantity to sellable.
11. Warehouse incoming is hardcoded to zero.
12. Analytics “daily” snapshots are only captured on manual rebuild and omit incoming/in-transit.
13. Export is capped at 1,000 rows and omits condition/unavailable/ATS/reference data.
14. Product detail labels weight/dimensions as “Physical,” which is confusing beside Inventory quantity.
15. Multiple icon controls lack strong accessible names and several forms/grids are not touch-first at small widths.
16. Admin action visibility does not consistently mirror backend capabilities, leading to predictable 403 actions for limited roles.
17. Audit facts exist but operator-facing identity resolution and before/after context are weak.
18. Order cancellation requires an HTTP idempotency key but does not claim/replay an idempotency record; repeat safety currently comes from the locked terminal Order state rather than the advertised command contract.
19. Guest Order Reservation audit records use `actorType: USER` with the Checkout ID as actor ID, so the audit identity is semantically misleading even though the transaction is traceable.

### P3 — useful later

1. Barcode-assisted receiving/count/transfer.
2. Saved operational views and user-specific column preferences.
3. Scheduled CSV exports and richer Inventory trend charts.
4. Optional approval threshold for unusually large adjustments.
5. Transfer/receipt printable documents and labels.

---

## G. UX assessment

The Admin workspace currently exposes database concepts more readily than operator questions.

- “How many units do we own?” is answered incorrectly by dashboard/Location totals when Reservations exist.
- “Where are they?” excludes in-transit and incoming quantities from the Inventory picture.
- “Why did this change, and who did it?” cannot be answered from Movement History despite the underlying transaction/audit data.
- “What needs action today?” is split across Inventory, Supply, Receiving, Fulfillment, Returns, Costing, Analytics, Operations, and Integrity without one exception-oriented Inventory landing page.
- “Receive 96 of 98 and close two missing” and “receive only these two Transfer lines today” are not comfortable workflows.
- “Count the shelf and reconcile” exposes expected figures, autosaves with a session-wide version, has no real review, and posts immediately.
- “Open stock for this Product/Location” produces links whose destination ignores query state.
- “Start stock for a new SKU” fails because the selector only searches rows that already have condition balances.

The redesign should organize the workspace around:

1. **Stock position:** owned, sellable, reserved, unavailable, in transit, incoming.
2. **Exceptions:** low/out, stale holds, mismatches, overdue Transfers, incomplete Receipts, unvalued stock.
3. **Movements:** receive, adjust, change condition, transfer, count, fulfill, return.
4. **Traceability:** SKU timeline with actor, reason, source document, and running balances.

All filters that describe a worklist should be server-backed and URL-backed. Destructive or financially sensitive actions should show current state, resulting state, reason/reference, retry-safe intent, and a clear recovery path. Responsive implementation must use existing shadcn/project primitives and full-screen/sheet behavior where long workflows are impractical in a desktop dialog.

---

## H. Data integrity assessment

### Ledger invariants

Strong:

- Movement lines reject zero delta.
- Negative condition and level balances are blocked.
- Sellable cannot fall below reserved.
- Movement and projection update are one transaction.
- Tenant-aware references are widely enforced.

Weak/missing:

- No database append-only protection for Inventory Transaction/movement rows.
- No transaction-level invariant requires condition-change conservation or Transfer dispatch/receipt correspondence; service code supplies it.
- Reconciliation aggregates all conditions and can miss a swap between condition projections.
- Reconciliation does not cover level rollup, Reservations/allocations, transit, receipt references, or cost positions.

### Reservations and concurrency

Strong:

- Level `FOR UPDATE` and ATS check prevent final-unit oversell.
- Order placement and Reservation creation are atomic.
- Fulfillment allocation consumption is serialized and physical dispatch is atomic.

Weak/missing:

- No expiry execution.
- Payment failure does not release.
- Manual release does not respect downstream fulfillment claims.
- Reservation list/status contracts omit partial consumption.
- Manual generic Reservation creation is exposed although controlled business workflows should be primary.
- Explicit Order cancellation is physically at-most-once through Order locking/status, but its required idempotency key is not used for canonical replay.

### Transfers

Strong:

- Source and destination are distinct, capability checked, and tenant scoped.
- Dispatch and receipt are idempotent and lock headers/lines.
- Partial condition-aware receipt and duplicate receipt prevention exist.

Weak/missing:

- Cost provenance does not travel.
- Transit ownership is not represented in Inventory reporting/reconciliation.
- No discrepancy/missing/loss resolution.
- No partial-line omission in current UI.
- Transfer creation itself is not idempotent and draft lines cannot be corrected.

### Adjustments and conditions

Strong:

- Signed delta, condition, actor, reason code, optional note, timestamp, Location, idempotency, audit, and movement evidence exist.
- Condition move conserves physical quantity in service code.

Weak/missing:

- Note is optional even for `OTHER` and important decreases.
- Cost layer and loss/unvalued consequences are absent.
- Client generates a fresh key per click, so retry after an ambiguous response creates a new business intent.
- No server policy for large adjustments or whole-unit Items.

### Receiving

Strong:

- Only arrived Shipments can be received.
- Quantity cannot exceed shipment allocation.
- Partial/multiple Receipts and condition splits are supported.
- Inventory, Receipt, provisional cost, audit, outbox, and Shipment receiving state commit atomically.

Weak/missing:

- No shortage/discrepancy terminal state or supplier claim.
- UI is basic and lacks scan/bulk verification.
- Arrival/receipt changes do not update public Search availability.

### Stocktake and reconciliation

Strong:

- Snapshot/current/count/variance facts are stored.
- Posting creates ledger correction rather than rewriting history.
- Posting is idempotent.

Unsafe/incomplete:

- Current level is not locked when actual quantity is read.
- Count is total-only; variance is posted only to SELLABLE.
- No found/zero-level Item, partial scope, recount, notes, reviewer, approval, or cancel.
- Overlapping Location stocktakes are allowed.
- The UI can post while row saves are still settling.

### Auditability

Audit and outbox records are usually in the same transaction as the command. Inventory Transaction carries actor, reason, reference, idempotency identity, and timestamps. The operator query discards much of this information, and audit metadata rarely includes before/after balances. Historical rows have no database-level append-only guard.

---

## I. Missing business capabilities Maevelle genuinely needs

1. A cost-safe physical movement contract covering transfers, conditions, shrinkage/corrections, stocktake, and returned-stock resale.
2. Safe, movement-aware, condition-aware physical counts with review and permanent reconciliation evidence.
3. Reservation ownership rules plus automatic expiry/payment-timeout release where the Order policy requires it.
4. Transfer discrepancy and shortage closure with missing/damaged/lost quantities and responsible actor/reason.
5. Supply shortage closure for ordered, shipped, and received quantities.
6. One SKU/Location stock timeline that answers who, why, source, quantity, condition, and running position.
7. An exception-led Inventory home: low/out stock, unavailable stock, stale Reservations, overdue Transfers, incomplete Receipts, unvalued stock, and failed integrity checks.
8. Per-SKU or SKU/Location reorder point and safety buffer with simple replenishment suggestions tied to open Purchase/Shipment quantities.
9. Accurate owned/sellable/reserved/unavailable/in-transit/incoming summaries.
10. Whole-unit enforcement for Maevelle fashion SKUs unless an explicit measured-item type is introduced later.
11. Capability-consistent UI actions and source-document navigation.
12. Operational export without silent 1,000-row truncation.

---

## J. Things we should not build yet

- Full bin/rack/zone warehouse management before Maevelle demonstrates a real picking-location problem.
- Lot, serial, expiry, batch recall, or FEFO workflows for ordinary fashion SKUs.
- RFID, robots, pick waves, labor planning, cartonization engines, or route optimization.
- Multi-echelon demand forecasting or machine-learning purchasing.
- Supplier EDI/ASN standards and automated customs brokerage integrations.
- Multiple inventory authorities or marketplace stock synchronization before Maevelle has a real channel integration.
- Configurable accounting methods beyond the existing FIFO direction.
- Generalized workflow builders, arbitrary state machines, or user-authored ledger types.
- A separate “new Inventory system.” Existing Items, movements, levels, Reservations, Receipts, Transfers, and Costing facts should be evolved in place.

---

## Upgrade roadmap: Inventory MVP to complete Maevelle Inventory

The stages below are deliberately vertical and independently closeable. Each stage must preserve historical facts and pass focused tenant, capability, concurrency, idempotency, and failure-path checks.

## Phase 1 — Inventory foundation integrity

**Goal:** make every existing quantity movement safe across Inventory, Costing, Search, contracts, and concurrency before expanding features.

**Existing behavior:** strong locked quantity ledger; incomplete cost movement; unsafe Stocktake read/lock order; stale Search; drifted DTOs; app-only ledger immutability.

**Problems solved:** `INV-P0-01`, `INV-P0-02`, stale public availability, incorrect summaries, unit ambiguity, and foundational contract drift.

**Backend work:**

- Define one cost-provenance effect for Transfer, condition move, negative/positive adjustment, Stocktake, and returned-stock resale.
- Move cost positions atomically with physical Transfers/conditions; record shrinkage/loss or explicit unvalued additions rather than silently detaching cost.
- Make returned stock consumable by outbound FIFO without double valuation or double COGS recovery.
- Fix Stocktake locking and define movement-after-snapshot semantics.
- Add database append-only protection for Inventory transaction/movement evidence.
- Fix on-hand formulas and whole-unit policy for current `UNIT` Items.
- Consume Inventory outbox events for Storefront availability refresh using an efficient idempotent projection strategy.
- Align Reservation/Transfer/Stocktake/history DTOs and remove `any` from touched boundaries.
- Expand integrity verification across per-condition balances, level rollups, Reservations, transit, source documents, and cost positions.

**Frontend work:** only the minimum needed to stop broken contracts and misleading numbers in affected screens; no broad visual redesign yet.

**Integration work:** Costing, Returns, Search worker, Catalog archive rules, and integrity console.

**Tests:** concurrent Stocktake movement; Transfer/condition/adjustment/Stocktake cost preservation; return resale; unvalued additions; Search after each Inventory event; append-only database behavior; whole-unit rejection; DTO/API response tests.

**Acceptance criteria:**

- No supported physical movement can create unexplained quantity or silently detach known cost.
- Stocktake cannot post a stale variance under concurrent movement.
- Current balances, per-condition ledger, Reservations, transit, and cost checks reconcile.
- Search availability updates after committed Inventory changes while PDP/cart/checkout remain live-safe.
- Totals and shared contracts agree end to end.

**Dependencies:** existing Costing and outbox foundations.

**Risks:** Costing changes are financially sensitive; migration design must preserve current facts and local clean-database construction.

**Deliberately excluded:** new dashboards, replenishment, barcode flows, and full Stocktake UX.

## Phase 2 — Inventory workspace and traceability

**Goal:** give staff one accurate, understandable place to answer current stock and movement questions.

**Existing behavior:** many separate pages with real APIs but misleading totals, weak history, shallow errors, and broken deep links.

**Problems solved:** operational visibility, History accuracy, URL state, source navigation, retry UX, accessibility, and responsive use.

**Backend work:** richer paged stock/history/detail queries with actor identity, reason text, references, running balances, condition/reservation context, sort, totals, and exception summaries.

**Frontend work:** responsive Inventory workspace, accurate position cards, exception queues, server-backed URL filters, reusable SKU/Location selectors, source links, durable command keys, clear partial/error/loading/empty/success states, and working Product/Location deep links.

**Integration work:** Product details, Receiving, Orders, Fulfillment, Returns, Costing/Integrity links.

**Tests:** query/filter/pagination contracts, actor/source visibility, component interaction and permission rendering, responsive non-browser structure checks; owner visual review remains separate.

**Acceptance criteria:** staff can answer how many, where, sellable/reserved/unavailable/transit/incoming, what changed, why, who, and source document from Inventory.

**Dependencies:** Phase 1 authoritative contracts.

**Risks:** avoid one monolithic client component or fetching every row to search.

**Deliberately excluded:** mutation workflow redesign except broken entry points.

## Phase 3 — Reservation and Order lifecycle completion

**Goal:** make every Reservation have a safe owner, terminal path, and operational exception.

**Existing behavior:** strong create/consume/cancel mechanics; no expiry/payment policy and unsafe manual release.

**Backend work:** explicit Reservation policy/state machine, expiry/reaper worker, payment timeout/rejection integration, safe release validation around fulfillment claims, status/allocation queries, and stale-hold integrity checks.

**Frontend work:** Order-linked Reservation detail, source owner/status, expiry, remaining/consumed/released quantities, safe recovery action, and stale-hold queue.

**Integration work:** Payments, Orders, Fulfillment, notifications.

**Tests:** expiry versus fulfillment race, rejection/cancel replay, partial consumption, manual release denial, tenant/capability checks.

**Acceptance criteria:** no Reservation can hold ATS indefinitely without an explicit active business owner; every release/consume is explainable and race-safe.

**Dependencies:** Phase 1 contracts.

**Risks:** COD policy must not expire legitimate confirmed Orders.

**Deliberately excluded:** cart-level stock holds unless measured conversion data proves they are necessary.

## Phase 4 — Transfer operations completion

**Goal:** make internal movement correct from draft through destination reconciliation.

**Existing behavior:** draft/ready/in-transit/partial/received with locked idempotent movements; broken create navigation and no discrepancy closure.

**Backend work:** editable draft lines with optimistic versions, idempotent create, transit reconciliation, partial-line receipt, shortage/damage/loss dispositions, safe cancellation/reversal rules, and open/overdue queries.

**Frontend work:** capability-filtered Locations, scalable SKU picker, draft edit, dispatch review, selective partial receipt, discrepancy close, source/destination timelines, and responsive receiving sheet/page.

**Integration work:** cost provenance, Inventory history, alerts, Analytics.

**Tests:** duplicate/create retry, concurrent dispatch/receipt, selective partial receipt, loss/damage, wrong destination denial, cost preservation, tenant/capability checks.

**Acceptance criteria:** every dispatched unit is received, returned, or closed with an authorized discrepancy; quantity and value remain owned and traceable in transit.

**Dependencies:** Phase 1 cost movement.

**Risks:** reversal semantics must not rewrite posted movements.

**Deliberately excluded:** route optimization and inter-company Transfers.

## Phase 5 — Physical counts and reconciliation

**Goal:** support trustworthy Location counts and permanent variance resolution.

**Existing behavior:** unsafe full existing-level total count with immediate post.

**Backend work:** scope/count plan, overlap rules, condition-aware lines, zero/found Items, movement-aware final expected values, submit/review/approve/post/cancel, counter/reviewer identities, notes/reason, and discrepancy thresholds.

**Frontend work:** touch-friendly count entry, optional blind count, progress, barcode-ready input without requiring hardware, save state, variance review, recount, approval, and posted evidence.

**Integration work:** Costing loss/unvalued handling, alerts, Warehouse permissions.

**Tests:** movements during count, condition variance, found Item, overlapping sessions, stale save, reviewer separation, idempotent post, rollback.

**Acceptance criteria:** a physical count of 18 against 20 produces one authorized, cost-safe, immutable correction with full snapshot/movement/count/reviewer evidence.

**Dependencies:** Phase 1 Stocktake correctness and Phase 2 traceability.

**Risks:** do not freeze ordinary business unnecessarily; movement-aware policy must be explicit.

**Deliberately excluded:** complex perpetual count scheduling optimization.

## Phase 6 — Supply, receiving, and shortage closure

**Goal:** represent ordered, shipped, received, conditioned, and unresolved quantities without indefinite implied gaps.

**Existing behavior:** strong atomic partial Receiving but weak PO/Shipment closure.

**Backend work:** shipped/expected facts where needed, shortage and overage disposition, supplier variance, shipment close, receiving exceptions, and incoming calculations.

**Frontend work:** receiving workbench with expected/counted/accepted/damaged/quarantine/missing, progressive save/review/post, receipt history/source links, and unresolved inbound queue.

**Integration work:** Purchases, Shipments, Inventory, Costing/Landed Cost, supplier performance.

**Tests:** 100 ordered / 98 shipped / 96 received scenario, repeated partial receipt, shortage close, condition splits, overage policy, idempotency, rollback.

**Acceptance criteria:** all ordered/shipped differences reach an explicit open or terminal business state; only physically posted quantity becomes Inventory.

**Dependencies:** Phase 1 cost integrity and Phase 2 history.

**Risks:** avoid conflating commercial PO closure with physical receipt.

**Deliberately excluded:** EDI, customs brokerage, and freight-provider automation.

## Phase 7 — Conditions, damaged goods, and disposition

**Goal:** manage non-sellable owned stock from discovery through release, repair, return-to-supplier, or disposal.

**Existing behavior:** four condition buckets and manual movement only.

**Backend work:** condition reason/disposition records, allowed transition policy, inspection outcome, disposal/loss transaction, optional supplier-return reference, cost effects, and aging queries.

**Frontend work:** unavailable-stock queue, condition detail/timeline, inspect/release/dispose workflows, notes/evidence, and permission-sensitive cost visibility.

**Integration work:** Receiving, Returns, Supplier/Purchase, Costing, audit/notifications.

**Tests:** conserved moves, disposal, release to sellable, cost treatment, unauthorized transitions, tenant isolation.

**Acceptance criteria:** damaged/quarantine/inspection units never disappear; every exit has actor, reason, source, quantity, and financial treatment.

**Dependencies:** Phase 1 condition cost movement.

**Risks:** keep the state set small and operationally meaningful.

**Deliberately excluded:** repair-center management.

## Phase 8 — Replenishment, alerts, reporting, and operational polish

**Goal:** help Maevelle act before stock problems occur and close the area with coherent verification.

**Existing behavior:** hard-coded low-stock counts, manual snapshots, shallow export, no alerts.

**Backend work:** reorder point/safety stock policy, incoming/open-Purchase-aware replenishment query, event-driven exception alerts, scheduled snapshots, complete paged export jobs, and trend/report definitions.

**Frontend work:** low/out/replenishment worklist, configurable thresholds, notification links, accurate snapshots/trends, export progress/download, saved views, and final cross-device polish.

**Integration work:** Supply lead time/open orders, Notifications, Analytics, Operations exports, Product details.

**Tests:** threshold calculations, incoming offsets, duplicate alert suppression, snapshot schedule/idempotency, export completeness/permissions.

**Acceptance criteria:** staff can see what needs replenishment and why, what is already incoming, and receive actionable—not noisy—alerts; exports and reports reconcile to current authority.

**Dependencies:** Phases 1–7.

**Risks:** insufficient sales/lead-time history; begin with explicit reorder rules rather than speculative forecasting.

**Deliberately excluded:** machine-learning demand forecasting.

---

## First logical implementation phase selected

`INVENTORY_FOUNDATION_INTEGRITY` is selected as the next phase.

The first implementation checkpoint should be narrower than the whole phase but vertically complete:

1. Add failing regression tests that demonstrate Transfer/condition/adjustment/Stocktake/return-resale cost gaps and the concurrent Stocktake race.
2. Define and implement the shared cost-safe physical movement policy in the existing Inventory and Costing transaction boundaries.
3. Fix Stocktake lock/read ordering.
4. Expand integrity checks so the repaired invariants are observable.
5. Fix the incorrect on-hand formulas and shared contract drift touched by those changes.
6. Run focused database/API/type/architecture/migration verification and close the checkpoint before broader Admin redesign.

No implementation from this phase is included in this assessment commit/worktree change.
