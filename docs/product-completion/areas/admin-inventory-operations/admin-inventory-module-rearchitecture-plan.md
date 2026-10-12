# Admin Inventory Module Re-architecture and Completion Plan

**Prepared:** 2026-10-12

**Repository baseline reviewed:** `c680937`

**Document state:** fully owner-approved on 2026-10-12; implementation in progress batch by batch

**Scope:** Admin Portal Inventory experience, its API/application contracts, Inventory and Warehouse persistence, and required Catalog, Supply, Costing, Orders, Payments, Fulfillment, Delivery, Returns, Finance, Analytics, Notifications, IAM, Audit, and Integrity connections

---

## 1. Executive decision

Maevelle already has a substantial Inventory domain. The correct approach is not to discard the append-only ledger, reservations, condition balances, transfers, stocktakes, receiving, costing, or fulfillment integrations and replace them with a new stock system. Those foundations contain important concurrency, tenant-isolation, audit, outbox, and cost-provenance behavior that should remain authoritative.

The Admin Inventory product is nevertheless not complete as one intentional operator experience. It has grown through several strong but separately delivered stages. The resulting frontend exposes domain implementation pieces as navigation destinations, repeats page shells and tables, puts actions beside read workspaces, hides some important secondary workflows, and gives the newest physical-unit/QC feature too much freedom to mutate a parallel unit state without always mutating the aggregate ledger and cost state in the same transaction.

The recommended outcome is a coherent Inventory Operations workspace with six primary destinations:

1. **Overview** — current health, attention, work queues, and safe primary actions.
2. **Stock** — authoritative SKU/location positions, item detail, units, reservations, movements, valuation, and replenishment context.
3. **Locations** — warehouse/facility master data and location-level operations.
4. **Transfers** — draft, dispatch, receipt, and discrepancy workflows.
5. **Counts** — stocktakes, cycle counts, review, reconciliation, and posting.
6. **Quality** — serialized-unit intake, inspection, repair, quarantine, release, and write-off queues.

Adjustment, movement history, reservation investigation, scanner, settings, repair queue, and loss/shrinkage remain real capabilities, but most should be contextual actions, tabs, filtered views, or global commands rather than eleven separate sidebar items.

Before the visual rework, the physical-unit feature must be converged with the existing Inventory ledger. A serialized unit is an identity and traceability layer over Inventory quantity; it must never become a second quantity authority. Every action that changes a unit's location, sellability, physical existence, reservation/fulfillment state, or cost consequence must also change the aggregate ledger, condition balance, reservation/allocation, and cost evidence atomically where applicable.

### Recommended approval

The owner approved the full target architecture and staged implementation in this document on 2026-10-12, including the mandatory sequencing rule:

> Complete the serialized-unit integrity convergence and contract cleanup before treating the redesigned frontend as operationally complete.

### Implementation progress

#### Batch 1 — Serialized-unit authority and contract convergence — COMPLETE

Implemented in the first integrity slice:

- Added an explicit aggregate-ledger condition to every physical unit, separate from its quality grade. A unit now records which authoritative `SELLABLE`, `DAMAGED`, `QUARANTINE`, or `INSPECTION` bucket contains its quantity.
- Added organization-safe receipt foreign keys, source-shape constraints, and source indexes to the mutable unit-traceability baseline.
- Bounded inbound and return unit registration by the matching posted receipt quantity, variant/item, and receiving location.
- Bounded stock-conversion and manual identity adoption by the existing condition-level ledger quantity. Identity registration can no longer manufacture stock.
- Made stock conversion condition-aware and replay-safe: it creates only missing identities and rejects fractional or already-overrepresented stock.
- Removed the QC error-swallowing path. Inspection, physical-unit state, ledger condition movement, and cost-position movement now succeed or roll back together.
- Made repair requests move the unit's authoritative quantity into `QUARANTINE`; successful release moves it into `SELLABLE`.
- Made write-off consume authoritative condition quantity and FIFO/unvalued cost evidence in the same transaction as the unit state change.
- Blocked direct cross-location unit mutation. Until exact-unit warehouse-transfer allocation is delivered in the transfer batch, serialized transfers fail safely rather than moving identity without quantity and cost.
- Blocked aggregate stocktakes and transfer dispatches that contain serialized stock until their exact-identity workflows are implemented in the relevant later stages.
- Required posted return-receipt evidence before a dispatched unit can be reconnected at a receiving location.
- Reworked serialized reconciliation to compare live unit identities against every condition-level ledger bucket and to compare selected reservation/fulfillment identities against aggregate reserved quantity.
- Prevented switching a variant back to standard tracking while live unit identities remain.
- Corrected the Admin unit client contract: route paths, HTTP methods, registration quantity mapping, inspection outcome/media mapping, repair response shapes, bulk result mapping, stock-conversion response mapping, and reconciliation endpoint now match the Fastify API.
- Replaced the unsafe Admin "move unit" form with a clear hand-off to the canonical Transfer workflow, preserving the source-location context and explaining why quantity, identity, and cost must move together.
- Added exact-identity warehouse transfer execution for serialized stock. Dispatch locks concrete available Unit IDs and marks them in transit; receipt requires an arrival condition for every Unit ID and commits identity location/status, aggregate condition quantities, and transfer cost positions together.
- Added durable unit-to-transfer allocation evidence and exposed tracking mode plus allocated Unit IDs in transfer detail. The Admin receipt sheet now confirms condition per serialized Unit ID instead of inventing anonymous condition quantities.
- Completed exact-identity in-transit loss handling. A serialized transfer discrepancy now requires every missing Unit ID, verifies that each identity is still in transit on the selected line, permanently marks its allocation lost and its unit written off, and records the physical and cost evidence in one transaction. The Admin discrepancy sheet shows and submits the affected Unit Codes.
- Preserved explicit unvalued-stock truth during transfer loss: opening/found stock with no cost position can close operationally without inventing a zero-cost layer, while partially covered or consumed transfer-cost evidence still fails closed.
- Replaced the serialized-stocktake restriction with an identity-aware count. A stocktake now snapshots exact Unit IDs and conditions, the Admin count sheet records which Unit Codes are physically present plus their observed conditions, and posting atomically corrects unit state, aggregate condition balances, and cost evidence. Missing committed units fail closed until their reservation or fulfillment is resolved.
- Included live serialized identities discovered after the snapshot as explicit found candidates instead of allowing anonymous quantity additions. Serialized gains therefore require a registered physical identity before they can enter a posted count.
- Fixed the inspection-history query to use the actual IAM user-name column.
- Added command-level idempotency to every mutable serialized-unit API operation. Exact request replays return the recorded result, while reuse of a key for a changed payload is a `409` conflict.
- Added optimistic version requirements to mutable unit and repair commands, including batch inspection and placement operations. Batch commands now execute atomically and reject stale or duplicate Unit IDs rather than partially applying.
- Extended optimistic concurrency to tracking-mode changes and stock conversion. The Admin item workspace now carries the item version through the command boundary and shows refresh-and-retry conflicts instead of silently overwriting concurrent work.
- Removed the misleading editable conversion quantity from the Admin dialog. Conversion now truthfully adopts every missing whole-unit identity represented by the selected location's authoritative condition ledger and preserves existing identities.
- Completed a real serialized customer-return workflow through Order, Fulfillment, Delivery, Returns authorization, immutable receipt posting, and Unit ID intake. The returned identity is reconnected only after the matching receipt has restored aggregate `INSPECTION` quantity and cost provenance.
- Preserved immutable unit acquisition provenance during later returns. Existing Unit IDs now receive a durable return-receipt allocation record instead of overwriting their inbound/stock-conversion source, and receipt capacity is locked and bounded across both newly registered and reconnected identities.
- Cleared active Order and Fulfillment pointers when a dispatched identity is physically returned; the immutable unit event timeline and receipt allocation retain the historical connection.

Verification completed for this slice:

- Fresh disposable Compose baseline rebuild through `3100_unit_traceability`: passed.
- Root TypeScript project build: passed.
- Admin TypeScript check after client-contract repair: passed.
- Docker production builds for API, Worker, Admin, and Storefront during the disposable baseline rebuild: passed.
- Focused Inventory, serialized-unit, API, and Admin unit-client suites: 41 tests passed across 4 files.
- Focused command-safety verification after the idempotency/version changes: 24 tests passed across the serialized-unit database, API, and Admin client suites; exact replay, changed-payload rejection, and stale-write rejection are covered.
- Final Stage 1 focused verification: 47 tests passed across Inventory, serialized units, Returns, unit API, and Admin unit-client suites.
- Fresh disposable Compose rebuild after the return-provenance baseline change: migration plus API, Worker, Admin, and Storefront production builds passed.

Stage 1 completion decision:

- **COMPLETE.** Every currently supported serialized-unit mutation is ledger-bound, retry-safe at the API command boundary, optimistic-version protected where it edits existing state, and covered by focused cross-domain workflow evidence.
- The next implementation batch is Stage 2: contract normalization, backend responsibility splits, overview/attention read models, replenishment policy resolution, and capability/location-scope alignment.

#### Batch 2 — Contracts, overview read model, and policy authority — IN PROGRESS

Implemented in the first Stage 2 slice:

- Added a focused Inventory Overview contract module and a separately owned database read service instead of adding more mixed responsibilities to the Inventory ledger service.
- Added `GET /admin/inventory/overview`, returning one generated-at snapshot with KPIs, bounded risk-ordered stock attention, work-queue counts, recent movements, and Location health.
- Made the Overview read model honor the caller's `inventory.view` Location scope directly. Scoped operators receive scoped totals and work queues instead of being denied all overview information or receiving organization-wide data.
- Replaced hard-coded low-stock thresholds in Inventory position filtering, Inventory statistics, and Location detail summaries. Resolution now uses the Catalog variant reorder point when present, then the authoritative `inventory.lowStockThreshold` organization setting.
- Exposed each position's resolved replenishment threshold and source so the Admin UI can explain why a SKU is considered low stock.
- Removed the dashboard's false “5 units” copy and show the resolved threshold on attention rows.
- Repaired clean-database Settings audit/outbox writes discovered by the new policy tests: audit targets now use real UUID entity IDs, and Settings outbox records include the required event and aggregate envelope.
- Added versioned `inventory.replenishment_policies` with one item-wide policy or a Location-specific override, non-negative reorder/safety/target invariants, active stock-holding source validation, and organization-safe optional Supplier sourcing.
- Added the separate `inventory.replenishment.manage` capability with Location scope support. Location-scoped operators can manage only destination policies in their scope and cannot create or reset an organization-wide override.
- Added focused shared contracts plus paginated policy and recommendation services and APIs. Policy create/update/reset commands require idempotency keys, reject stale versions, write audit evidence, and emit transactional outbox events.
- Established the authoritative threshold order: Location policy, item-wide policy, Catalog variant reorder point, then the organization Inventory default. Overview attention, Stock positions, legacy balance filtering, and Inventory statistics now use that same order.
- Added explainable replenishment projections from available-to-sell, inbound purchase shipments, inbound transfers, and approved outbound transfers. Recommendations suggest a Transfer only when the configured source has enough surplus above its own resolved threshold; otherwise they hand off to a preferred Supplier Purchase or policy review without creating Procurement or Finance obligations inside Inventory.
- Added the responsive Admin Replenishment workspace with action-only/all-position views, Location and text filters, compact desktop tables, touch-friendly mobile cards, source explanations, policy hierarchy labels, pagination, empty/error/loading states, and capability-gated management.
- Added one shared create/edit policy form with client and server validation, optimistic versions, mobile full-screen behavior, item-wide and Location-specific scopes, safety/target/lead-time inputs, preferred transfer source, and fallback Supplier.
- Connected recommendation actions to prefilled canonical Transfer and Purchase workflows. The owning forms now accept the suggested SKU, quantity, destination, source, and Supplier context while leaving the operator in control of the resulting business command.
- Reduced the Inventory sidebar to the six approved operator destinations: Overview, Stock, Locations, Transfers, Counts, and Quality. Replenishment is linked contextually from Overview; adjustments, movement history, repair, and other secondary workflows remain reachable inside their owning workspaces rather than competing as primary navigation.
- Replaced the legacy Overview's six independent browser requests and partial-failure aggregation with the single scope-aware Inventory Overview snapshot. The page now uses the shared Admin page system for authoritative KPIs, threshold-aware attention, owned work queues, recent ledger movements, Location health, recovery states, and responsive action placement.

Verification for this slice:

- Root TypeScript project build and Admin TypeScript check: passed.
- Focused Inventory and Settings database suites: 31 tests passed.
- Inventory API lifecycle suite, including the new Overview endpoint: 2 tests passed.
- Focused lint for all touched contracts, database, API, and Admin files: passed.
- Fresh disposable Compose rebuild after adding replenishment policy persistence: migration plus API, Worker, Admin, and Storefront production builds passed.
- Focused Inventory suite after policy lifecycle and recommendation integration: 19 tests passed, including idempotent replay, changed-payload rejection, stale-write protection, reset replay, hierarchy resolution, and genuine-surplus transfer selection.
- Database and API package builds plus focused replenishment lint: passed.
- Root TypeScript project build and the combined Inventory/serialized-unit database suites: passed; 33 tests passed across 2 files.
- Replenishment Admin slice: Admin TypeScript check, database package build, and focused lint passed; the single authoritative policy/recommendation workflow test passed.

Remaining in Stage 2:

- Continue splitting route/service responsibilities and normalize remaining Inventory envelopes and error semantics.
- Build the responsive Admin replenishment queue and shared policy editor on the new contracts, then connect the prefilled Transfer and Purchase handoffs to their owning forms.
- Expand Overview attention beyond the now-authoritative stock, queue, movement, and Location snapshot where owning-domain SLA/configuration evidence is still required.

#### Batch 3 — Inventory shell and navigation — IN PROGRESS

- Added the six-destination Inventory workspace navigation to every Inventory route with responsive horizontal overflow, capability-aware rendering, active-route treatment, and semantic links.
- Mapped secondary Stock routes—Replenishment, Adjustments, Reservations, Movement History, and Settings—back to the Stock destination so operators keep their workspace context without restoring sidebar clutter.
- Kept barcode scanning as a global command and Repair as a visible Quality action. Added Replenishment, Reservations, Movements, and Adjust Stock as contextual Stock actions.
- Removed the broken Loss destination from both primary navigation layers; loss handling remains an explicit Transfer discrepancy or authoritative write-off action rather than a dead standalone page.

Focused verification: Admin TypeScript and lint for the workspace navigation and Stock integration passed.

Remaining in Stage 3:

- Consolidate the secondary Stock and Quality routes into tabs/actions, then add compatibility redirects only after their destination behavior is present.
- Standardize the remaining Locations, Transfers, Counts, and Quality page shells and permission rendering.

#### Batch 4 — Location lifecycle authority — IN PROGRESS

- Added an authoritative Location operational-commitment projection covering stocked SKUs, active reservations, incoming/outgoing Transfers, open Counts, inbound Shipments, open Fulfillments, and replenishment destination/source policies.
- Location deactivation and archive now reject changes that would strand any active operational work. Capability removal is validated against the exact work that requires that capability, with actionable blocker counts in the domain error.
- Location detail now returns those commitment explanations, uses the replenishment-policy hierarchy for low-stock counts, and reports real incoming Transfer plus inbound-supply quantity instead of the former hard-coded zero.
- Location updates now publish a transactional outbox event in addition to their audit evidence.

Verification for this slice:

- Database package TypeScript build passed.
- One focused Inventory integration test passed for Location commitment projection and capability-removal protection.

Remaining in Stage 5:

- Rebuild the responsive Location list and detail surfaces around the shared Admin primitives and the new blocker model.
- Consolidate create/edit onto one shared Location form, then add retry-safe command semantics for Location creation and updates.

---

## 2. What was reviewed

This assessment used the current repository and Git state as authority. It reviewed:

- Product Completion V2 state and all existing Inventory assessment/closeout documents.
- Admin shell navigation and capability filtering.
- Every current route under `apps/admin/app/inventory`.
- Inventory presentation and workflow components under `apps/admin/components/inventory`.
- Inventory frontend clients and tests under `apps/admin/lib/inventory`.
- Inventory, Warehouse, and serialized-unit API routes.
- Inventory, Warehouse, and serialized-unit database/application services.
- Warehouse, Inventory, and unit-traceability baseline migrations.
- Shared transport contracts.
- Inventory connections in Catalog, Supply/Receiving, Costing, Orders, Payments, Fulfillment, Delivery, Returns, Finance, Analytics, Notifications, Integrity, and Admin Operations.
- Existing focused tests and current compile/lint behavior.

### Current scale

- 64 non-test Admin Inventory files were identified across Inventory app routes, components, and frontend clients.
- Those files contain approximately 17,326 lines before counting a few dynamic-route wrapper files that PowerShell treated as wildcard paths.
- The six principal Inventory/Warehouse/unit API and database service files contain 9,282 lines.
- Several individual frontend components are already 780–1,477 lines long.
- The largest current components mix fetching, URL state, form state, workflow rules, transport mapping, modal orchestration, and presentation.

This size is not itself a defect. The defect is that important responsibilities are concentrated in page-sized client components while closely related behavior is duplicated elsewhere.

### Current verification evidence

Performed during this assessment:

- Admin TypeScript check: **passed**.
- API build/typecheck: **passed**.
- Database build/typecheck: **passed**.
- Admin Inventory frontend unit client tests: **8 passed**.
- Fresh migration of the disposable `maevelle_test` database through `3100_unit_traceability`: **passed**.
- Focused Inventory, unit traceability, and API suites: **29 passed** across 3 files.
- Focused Inventory/Admin/API/database lint: **failed with 76 errors**, primarily unused imports/state, explicit `any`, one unused caught error, and invalid references to an unavailable Next.js ESLint rule.

Not performed:

- Authenticated browser walkthrough with representative products, receipts, orders, transfers, counts, and returns.
- Mobile hardware barcode-scanner validation.
- Thermal label printer validation.
- Production-volume query-plan measurement.
- Owner operational acceptance.

The passing tests prove several existing flows. They do not prove that unit state and aggregate ledger state cannot diverge, because the current tests do not assert all required cross-model invariants.

---

## 3. Status vocabulary

The following labels are used throughout this document:

- **COMPLETE** — coherent current implementation with relevant repository evidence.
- **PARTIAL** — meaningful implementation exists, but material workflow, UX, integrity, or contract work remains.
- **BROKEN** — current behavior is misleading, unreachable, internally inconsistent, or unsafe for real operation.
- **MISSING** — the product needs the capability and no adequate current workflow exists.
- **UNVERIFIED** — code may exist, but present evidence is insufficient for a completion claim.

---

## 4. Current domain strengths that must be preserved

### 4.1 Inventory quantity authority — COMPLETE

The aggregate Inventory model correctly centers on:

- one stable Inventory Item per Catalog variant;
- Inventory Levels per Organization, Item, and Location;
- condition balances for `SELLABLE`, `DAMAGED`, `QUARANTINE`, and `INSPECTION`;
- an append-only Inventory Transaction and Movement Line history;
- available-to-sell derived from sellable less reserved;
- pessimistic locking and deterministic movement ordering;
- server-side whole-unit enforcement for current `UNIT` products;
- audited, outbox-backed, idempotent high-risk commands.

This remains the physical quantity source of truth.

### 4.2 Reservations and order lifecycle — COMPLETE for the supported policy

The current lifecycle correctly distinguishes:

- standalone expiring holds;
- order-owned reservations;
- payment-review and payment-timeout ownership;
- fulfillment allocations;
- cancellation before dispatch;
- rejection of cancellation after physical dispatch;
- return receipt as the path back into stock.

The generic Inventory UI must not introduce a “release any reservation” escape hatch. Order-owned stock release remains an Orders/Payments/Fulfillment coordination operation.

### 4.3 Warehouse transfers — COMPLETE core lifecycle, PARTIAL product experience

The backend supports:

- retry-safe creation;
- versioned editable drafts;
- approval and dispatch;
- partial/selective receipt;
- condition-aware receipt;
- documented missing/lost discrepancy closure;
- cost-in-transit and write-off evidence;
- audit/outbox history.

The list/detail/create/receive UI exists, but its information architecture, shared page structure, filters, mobile presentation, capability rendering, and unit-traceability relationship need redesign.

### 4.4 Stocktake reconciliation — COMPLETE core lifecycle, PARTIAL product experience

The backend supports:

- session snapshot;
- condition-aware counts;
- found stock;
- submit for review;
- cancellation before posting;
- race-safe posting against locked current levels;
- cost-aware condition reclassification;
- idempotent posting.

The current 1,477-line detail component should not be kept as the long-term workflow architecture. Serialized-unit counting is also not yet integrated.

### 4.5 Supply receiving and costing — COMPLETE core handoff

Posted receipts create aggregate Inventory movements and receipt-backed FIFO cost positions. Finalized landed cost flows into receipt-backed acquisition cost without replacing editable Catalog planning estimates. Inventory must continue referencing these authoritative costs rather than inventing or directly editing landed cost.

### 4.6 Traceable read models — COMPLETE core read capability

The current server-paged position, history, detail, reservation, transfer, and stocktake read models already expose much of the data required by a strong Admin workspace. The redesign should consolidate and extend these models rather than fetch raw tables or duplicate business calculations in React.

---

## 5. Critical findings

## 5.1 The newest physical-unit system can diverge from the authoritative ledger — BROKEN

This is the highest-priority finding.

The current unit traceability layer adds useful identity, inspection, repair, barcode, packaging, return, and fulfillment data. However, several unit mutations change only `inventory.inventory_units` and the unit event stream:

- moving a unit between warehouse Locations changes `unit.location_id` but does not post an aggregate transfer or location movement;
- releasing an on-hold unit changes its unit status to `AVAILABLE` but does not necessarily move aggregate quantity from quarantine/inspection/damaged into sellable;
- writing off a unit changes its unit status/condition but does not necessarily post aggregate negative quantity or cost write-off;
- return-unit intake changes unit location/status without owning the aggregate Return Receipt transaction;
- bulk unit moves execute one transaction per unit, so a batch can partially succeed;
- QC attempts an aggregate condition move but catches and ignores every error, allowing unit state to commit even when the Inventory ledger rejects the corresponding mutation.

The reconciliation query detects some mismatches but does not prevent them. Detection is not an adequate replacement for atomic correctness.

### Required correction

- Treat `inventory_units` as child identities of aggregate stock, never as an independent stock ledger.
- Define one explicit mapping from unit status/condition to aggregate quantity condition and sellability.
- Execute unit mutation, Inventory ledger movement, cost-position movement/write-off, audit event, and outbox event in one transaction.
- Never suppress a failed ledger/cost mutation. Fail the unit command and return a recoverable conflict.
- Make inter-Location movement use the Warehouse Transfer lifecycle. A direct unit “move” may only change bin/package metadata within the same Location unless it creates/participates in a transfer.
- Make write-off consume the exact unit's cost provenance where known.
- Make return identity intake occur inside or as a guarded continuation of the authoritative Return Receipt.
- Add database/integrity checks for SERIAL item unit-count versus aggregate quantity by Location and condition.

## 5.2 Unit registration can create identities without sufficient source quantity — BROKEN

Registration intentionally does not increase aggregate quantity, which is correct for receipt-backed registration. But the current command can register up to 500 units, switches the item to SERIAL, and does not demonstrate a hard invariant that the cumulative registered quantity cannot exceed the eligible receipt/return/conversion quantity.

### Required correction

- Receipt-backed registration must lock and validate the specific receipt line and remaining registrable quantity.
- Stock conversion must lock aggregate position and existing units and create exactly the eligible unrepresented units.
- Manual intake must be removed or converted into an explicit Inventory adjustment/opening-balance workflow that creates ledger and cost/unvalued evidence first.
- Replays must be idempotent and payload-guarded.
- Changing STANDARD to SERIAL with existing stock must be one conversion command; it must not be a separate mode update followed by optional conversion.
- Downgrading SERIAL to STANDARD must be prohibited while any live unit identity exists unless an explicit, audited consolidation workflow is designed.

## 5.3 Unit fulfillment semantics are not yet one coherent reservation model — PARTIAL

The existing aggregate reservation remains authoritative, while units are selected later for fulfillment. That is a sound direction, but the current status/reconciliation semantics are incomplete:

- `RESERVED` is a unit status but is not clearly bridged to Inventory Reservation allocations.
- `IN_FULFILLMENT` units remain part of aggregate sellable/reserved quantity until dispatch.
- the current reconciliation compares `AVAILABLE` unit count directly to aggregate sellable quantity, which includes stock under reservation/fulfillment;
- unit allocation APIs do not use the same retry/version conventions as other costly Inventory commands.

### Required correction

Define and test this invariant:

```text
aggregate sellable quantity
  = available serialized units
  + serialized units allocated to active fulfillment
  + any explicitly reserved serialized units not yet allocated

aggregate reserved quantity
  = active reservation quantity

serialized fulfillment selections
  <= reservation allocation for the same item, order line, and location
```

Unit selection must never create or expand reservation quantity. It only identifies the physical pieces satisfying an existing allocation.

## 5.4 Low-stock settings are duplicated and not authoritative — BROKEN

The repository currently has:

- `general.lowStockThreshold`;
- `inventory.lowStockThreshold`;
- Catalog variant `reorder_point`;
- an Inventory Settings page;
- a General Settings control;
- Inventory and Warehouse queries that still hard-code `<= 5`.

The Inventory Settings UI claims to update alarms across Catalog and warehouses, but current Inventory statistics and location summaries do not consume that setting. This is misleading product behavior.

### Required correction

Adopt one policy hierarchy:

1. item/location replenishment policy override, when configured;
2. Catalog variant reorder point, when configured;
3. Organization Inventory default threshold;
4. no invented hard-coded threshold in queries.

Remove the duplicate General setting or make it an intentional alias to the same authoritative key. UI copy must only claim effects actually implemented.

## 5.5 Sidebar contains an unreachable destination — BROKEN

The Admin shell links to `/inventory/loss`, but no route exists. “Loss & shrink” is also better represented as a filtered movement/exception view plus controlled write-off workflows, not a disconnected empty module.

### Required correction

Remove the broken sidebar link immediately during implementation. Add a `Losses & shrinkage` saved filter inside Movements/Exceptions only after it is backed by real transaction types, unit write-offs, transfer discrepancies, stocktake losses, cost effect, and source links.

## 5.6 Navigation exposes implementation fragments instead of operator jobs — PARTIAL

Current Inventory sidebar destinations include Overview, Stock, Physical Units, Repair Queue, Warehouses, Transfers, Stocktakes, Movement History, Adjustments, and the missing Loss & Shrink page. Reservations and Settings exist but are not in the group. Scanner exists as a command.

Problems:

- Physical Units and Repair Queue are two views of one Quality/Traceability workflow.
- Adjustments is a command, not a primary workspace.
- Movement History is mainly evidence supporting Stock, Items, Locations, Transfers, Counts, and Returns.
- Reservations are meaningful but usually investigated from the Order, Item, attention queue, or Fulfillment context.
- Settings belongs in centralized Settings.
- Scanner is a global/mobile action.
- “Warehouses” understates that Locations include retail stores, fulfillment centers, return centers, and third-party facilities.

## 5.7 Permissions are authoritative in the API but inconsistently reflected in UI — PARTIAL

Examples:

- the item Tracking Mode action is visible without checking `inventory.units.manage`;
- unit detail derives action visibility only from unit state, not user capability;
- QC, repair, release, write-off, registration, and movement entry points are not consistently gated with the same capability the API requires;
- sidebar Transfer visibility uses `inventory.transfer`, while some Transfer commands require Warehouse capabilities;
- location-scoped users can encounter organization-wide surfaces that later fail.

### Required correction

Create a typed Inventory permission view model and use it consistently in navigation, page actions, row actions, dialogs, and empty states. Backend checks remain authoritative; frontend checks provide truthful affordances.

## 5.8 API conventions are inconsistent — PARTIAL

The core routes generally return `{ data }`, but error bodies mix structured `{ error: { code, message } }` with `{ error: 'FORBIDDEN' }`. Pagination types mix `page/limit`, `pageSize`, total counts, optional cursors, and client-side “25 results means there may be another page” inference.

### Required correction

- Standardize success and error envelopes.
- Standardize page-number pagination for operator tables unless cursor pagination has a measured need.
- Always return explicit pagination metadata.
- Validate UUIDs consistently.
- Split route files by resource/workflow while preserving one contract version.
- Require idempotency keys on every retryable state-changing Inventory operation that can move quantity, cost, or physical identity.
- Guard reused keys against different payloads.
- Use optimistic version fields for editable records and mutable unit/repair state.

## 5.9 Frontend architecture is too concentrated — PARTIAL

Largest examples:

- `stocktake-detail.tsx`: 1,477 lines;
- `adjustments-section.tsx`: 1,432 lines;
- `location-detail.tsx`: 999 lines;
- `transfer-form.tsx`: 923 lines;
- `units-list.tsx`: 815 lines;
- `location-form.tsx`: 794 lines;
- `qc-inspection-workspace.tsx`: 780 lines.

These files are difficult to reason about and encourage duplicated loading, error, pagination, status, form, and table behavior.

### Required correction

Organize Inventory frontend code by workspace and workflow, with:

- route/page composition;
- query clients and schemas;
- mutation clients and command identity;
- URL state;
- focused hooks/providers;
- table/card presentation;
- forms/dialogs/sheets;
- shared Inventory primitives.

Do not split every ten lines into a new file. Split where a responsibility has its own state, contract, or reusable UI.

## 5.10 Design-system and accessibility compliance is uneven — PARTIAL

Current Inventory code includes:

- raw HTML tables despite the shared Table primitive;
- hard-coded Tailwind status colors instead of semantic status tokens/StatusBadge;
- `transition-all` in Stocktake progress;
- placeholder text using `...` instead of `…`;
- page-specific headers instead of `AdminPage`/`PageHeader`/`PageTitle`;
- duplicate badges and status mapping;
- several dialogs that are only max-width constrained rather than designed as full-screen mobile tasks;
- feedback/dismiss actions with insufficient accessible labels in places;
- number/date typography that is not consistently `font-mono tabular-nums`;
- client-side pages fetching after mount where server composition could reduce loading waterfalls and client JavaScript.

The redesign must use the current Admin design system rather than visually restyling each page independently.

## 5.11 Lint debt is concentrated in the Inventory surface — BROKEN quality gate

The focused lint run reported 76 errors. The newest unit UI contains many unused imports and stale state references. `location-detail.tsx` contains explicit `any` usage. There are also invalid inline ESLint rule references for a Next.js rule not installed in the current flat configuration.

The code compiles, but compilation alone is not sufficient evidence of a clean frontend baseline.

---

## 6. Target ownership model

| Concern | Authoritative owner | Inventory UI responsibility |
| --- | --- | --- |
| Product, variant, SKU, publication, option values, media | Catalog | Display identity and link to exact Product/Variant; never edit Catalog truth from Inventory forms. |
| Physical aggregate quantity and condition | Inventory | Display and mutate only through Inventory commands. |
| Serialized physical identity | Inventory traceability layer | Identify physical pieces while remaining transactionally consistent with aggregate Inventory. |
| Location/facility master and capabilities | Warehouse | Configure Locations and use capability-aware operational choices. |
| Inter-Location movement | Warehouse Transfer + Inventory posting | Create/manage Transfer; do not directly rewrite unit location across facilities. |
| Commercial reservation owner | Orders/Payments | Explain reservation and deep-link to Order/Payment; never bypass ownership. |
| Pick/pack/dispatch | Fulfillment | Select eligible serialized units against existing allocation; dispatch consumes aggregate Inventory. |
| Delivery journey | Delivery | Show outbound state and link; do not restore stock on failed delivery alone. |
| Return authorization and physical receipt | Returns | Receive identity within Return Receipt; return inspection then controls condition. |
| Acquisition cost, FIFO, valuation, COGS | Costing | Display provenance/completeness and invoke owning-domain operations; never edit FIFO rows directly. |
| Expenses, losses, repair spending | Finance | Link documented financial consequences; Inventory records physical cause/evidence. |
| Purchase and inbound supply | Supply/Procurement/Receiving | Show incoming quantity and create prefilled handoffs to owning Supply workflows. |
| Business measurement | Analytics | Consume authoritative facts; Inventory does not own reporting projections. |
| Alerts/delivery | Notifications | Emit intent/outbox facts; Inventory does not send providers directly. |
| Cross-domain checks | System Integrity | Detect and deep-link; only approved domain repair can mutate projections. |

---

## 7. Target information architecture

## 7.1 Global Admin sidebar

Replace the current Inventory group with:

| Label | Canonical destination | Purpose |
| --- | --- | --- |
| Overview | `/inventory` | Health, attention, work queues, and safe primary actions. |
| Stock | `/inventory/stock` | SKU/location positions and the entry point to Items, Units, Movements, Reservations, cost, and replenishment. |
| Locations | `/inventory/locations` | Facilities and Location operations. |
| Transfers | `/inventory/transfers` | Inter-Location stock movement lifecycle. |
| Counts | `/inventory/counts` | Stocktakes/cycle counts and reconciliation. |
| Quality | `/inventory/quality` | Serialized-unit QC, quarantine, repairs, and exceptions. |

Visibility rules:

- Hide a destination only when the user lacks the read capability for the workspace.
- Quality remains visible when the organization has SERIAL items or the user has active QC/repair work; otherwise Stock explains how to enable traceability.
- Do not add Adjustments, Scanner, Settings, Reservations, or Loss as permanent sidebar items.

## 7.2 Contextual and secondary destinations

| Capability | Destination pattern | Discovery |
| --- | --- | --- |
| Inventory Item detail | `/inventory/stock/[inventoryItemId]` | Stock row/card, Product detail, global search. |
| Unit detail | `/inventory/units/[unitId]` or future `/inventory/stock/[item]/units/[unit]` | Item Units tab, scanner, Quality queue, Receipt, Fulfillment, Return. |
| Movements | `/inventory/stock?view=movements` with compatible deep link | Stock workspace tab, Overview activity, Item/Location detail. |
| Reservations | `/inventory/stock?view=reservations` | Stock workspace tab, Item detail, Order, Attention. |
| Adjust stock | contextual sheet/page | Item/Location actions; no top-level navigation. |
| Opening balance | dedicated guarded task | Empty item/location setup only. |
| Scanner | command palette and mobile action | Global quick command, Quality header, Unit list. |
| Inventory policy settings | `/settings/inventory` | Settings search, Overview settings action for authorized users. |
| Loss and shrink | saved Movements/Exceptions filter | Overview attention and movement filters. |

## 7.3 Route migration

During implementation, keep temporary redirects so bookmarks do not break:

- `/inventory/warehouses` → `/inventory/locations`;
- `/inventory/stocktakes` → `/inventory/counts`;
- `/inventory/history` → `/inventory/stock?view=movements`;
- `/inventory/reservations` → `/inventory/stock?view=reservations`;
- `/inventory/units/repairs` → `/inventory/quality?queue=repairs`;
- `/inventory/settings` → `/settings/inventory`;
- remove `/inventory/loss` from navigation and redirect only if a historical route ever existed.

Internal Admin URLs can be migrated coherently in heavy-development mode, but redirects make the transition less disruptive and protect links from audit events, docs, and operator bookmarks.

---

## 8. Target page specifications

## 8.1 Inventory Overview

### Purpose

Answer four questions immediately:

1. What stock can be sold now?
2. What needs attention now?
3. What stock is moving or expected?
4. What operation should this user perform next?

### Layout

- Page header with last-updated time and capability-aware primary actions.
- Compact KPI row with explicit definitions:
  - On hand;
  - Available to sell;
  - Reserved;
  - Unavailable;
  - Incoming supply;
  - In transit between Locations;
  - Valuation completeness, not a fabricated total when costs are incomplete.
- Attention worklist ordered by operational risk, not decorative cards.
- Work queues for Transfers, Counts, Quality, Reservations/payment exceptions, and unvalued additions.
- Recent movements with exact source links and actors.
- Location health summary.

### Attention categories

- out of stock;
- below authoritative replenishment threshold;
- overdue inbound/transfer;
- transfer discrepancy;
- stocktake awaiting review;
- unresolved count variance;
- standalone hold expired or reservation ownership exception;
- unit/ledger inconsistency;
- units awaiting QC;
- repairs overdue;
- unvalued found/opening stock;
- archived Catalog item still carrying stock;
- Location configuration blocking an operation.

### UX rules

- Partial request failure must show which section is unavailable.
- KPIs never silently display zero when their source failed.
- Each attention row has an explanation, source, age, owner, and next action.
- Avoid duplicating entire worklists; Overview shows the most urgent bounded subset and links to the filtered owning workspace.

## 8.2 Stock workspace

### Primary views

- **Positions** — one item/location position.
- **Items** — one Inventory Item/SKU aggregated across Locations.
- **Units** — serialized physical pieces.
- **Movements** — append-only ledger evidence.
- **Reservations** — active/history/attention.

All view, filter, sort, search, pagination, and selected-row state must be URL-backed.

### Position row/card

- product image;
- Product title, option summary, SKU;
- Location;
- tracking mode;
- on hand;
- reserved;
- available;
- unavailable by condition;
- incoming Supply;
- incoming/outgoing Transfer;
- latest authoritative unit cost and valuation completeness;
- replenishment status;
- last movement;
- contextual actions allowed for this user.

Desktop uses the shared compact Table. Mobile uses image-led cards with the same priority order and no horizontal dependency for the common task.

### Filters

- search by Product title, SKU, barcode, option value, unit code;
- Location;
- Catalog status;
- availability;
- condition;
- tracking mode;
- replenishment state;
- cost completeness;
- movement recency;
- incoming/outgoing state.

### Contextual actions

- adjust stock;
- reclassify condition;
- create Transfer;
- start focused Count;
- scan/view physical units;
- configure replenishment policy;
- open Catalog Product/Variant;
- open source movements.

Actions must open with the item and Location already selected. Operators should never copy UUIDs or repeat a search after choosing a row.

## 8.3 Inventory Item detail

### Header

- image, Product title, option summary, SKU, Catalog status, Inventory status, tracking mode;
- current aggregate availability;
- exact link to Product/Variant;
- capability-aware primary action.

### Tabs

1. **Overview** — aggregate totals, open movement, attention, policy.
2. **Locations** — conditions and quantities by Location.
3. **Units** — only for SERIAL or during conversion; registration completeness and scanner.
4. **Movements** — full server-paged ledger filtered to the Item.
5. **Reservations** — ownership, payment/fulfillment state, release policy.
6. **Cost & provenance** — receipt layers, weighted/location cost, unvalued quantity, transfer/return provenance, links to Costing.
7. **Replenishment** — reorder policy, incoming Supply, suggested Purchase/Transfer actions.

### Tracking-mode workflow

- STANDARD with zero stock: switch to SERIAL through a simple confirmation.
- STANDARD with stock: launch a controlled conversion task that shows represented quantity, reservations, open Transfers, and blockers.
- SERIAL: no casual downgrade button.
- All actions require `inventory.units.manage` and exact Location scope.

## 8.4 Locations workspace

Rename the user-facing concept from Warehouses to Locations while retaining Warehouse as the domain owner.

### List

- server search/pagination if needed;
- type, status, capability summary;
- on hand, ATS, unavailable, inbound, outbound;
- open Transfer/Count/QC work;
- address/city;
- health/attention.

### Create/edit

- one shared Location form for create and edit;
- deliberate capability presets by Location type, always editable before save;
- explicit consequence text for each capability;
- prevent deactivation/removal of a capability when live stock, reservation, Transfer, Receipt, Fulfillment, Return, or Count work depends on it;
- show exactly which blockers must be resolved.

### Detail tabs

- Overview;
- Stock;
- Transfers;
- Counts;
- Quality;
- Activity;
- Configuration.

The current incoming quantity must be real, never hard-coded.

## 8.5 Transfers workspace

### List

- URL-backed status, source, destination, discrepancy, date, and search filters;
- explicit pagination metadata;
- responsive table/cards;
- status through shared `StatusBadge`;
- attention views for Draft, Ready, In Transit, Partially Received, and Discrepancy.

### Create/edit Draft

- dedicated page due multi-line complexity;
- source and destination first;
- image-led server-searchable item picker;
- available quantity and open reservation warning;
- serialized quantity/identity implications;
- carrier/consignment metadata if operationally used;
- stable idempotency key for the user intent;
- unsaved-change protection;
- editable Draft only, with optimistic version conflict recovery.

### Detail

- timeline with actor and timestamps;
- line-level requested/dispatched/received/resolved/in-transit quantities;
- cost-in-transit evidence;
- serialized unit identities where applicable;
- actions: Edit Draft, Approve, Dispatch, Receive, Resolve discrepancy, Cancel;
- each action visible only for valid state + capability + Location scope.

### Serialized rule

Dispatch and receipt of SERIAL items must identify exact units. Unit Location changes only when the Transfer dispatch/receipt transaction changes aggregate stock and cost provenance.

## 8.6 Counts workspace

Use “Counts” as the operator label and “Stocktake” as the domain term where precision is needed.

### Sessions list

- status, Location, scope, progress, variance, age, creator/reviewer;
- URL-backed filters and pagination;
- clear primary “Start Count” action;
- separate active, review, posted, and cancelled views.

### Start Count

- choose Location;
- choose scope: full Location, selected categories/items, or cycle-count policy;
- explain snapshot behavior;
- show conflicting open Count;
- require dedicated page on mobile/desktop due scope selection.

### Count execution

- mobile-first numeric entry;
- barcode scan for item/unit;
- save per line with visible offline/network failure state;
- condition breakdown only when needed;
- mark expected quantity for convenience without hiding that it is expected;
- found item/unit workflow;
- progress and uncounted filters.

### SERIAL count behavior

- scan/confirm individual expected units;
- mark missing expected units;
- capture unexpected units;
- reconcile Location and status identity;
- aggregate variance derived from unit evidence, not entered separately.

### Review/post

- summary by gain, loss, condition reclassification, value effect, and unvalued addition;
- reviewer identity and separation when policy requires;
- source movement since snapshot;
- conflicts require refresh/review, never silent overwrite;
- idempotent post with immutable result and exact movement links.

## 8.7 Quality workspace

Quality consolidates the current Physical Units, QC workspace, and Repair Queue into one job-oriented area.

### Queues

- Awaiting intake QC;
- Quarantine/hold;
- Repair requested;
- Repair in progress;
- Awaiting reinspection;
- Ready for authorized release;
- Write-off review;
- Identity/ledger mismatch.

### Unit detail

- physical identity and barcode;
- Product/Variant;
- Location/bin/package;
- authoritative aggregate condition mapping;
- current reservation/Fulfillment/Order/Delivery/Return;
- receipt and cost provenance;
- inspection/repair timeline;
- exact permissible next actions.

### Repair cost boundary

Repair records may capture operational estimates/evidence. A real financial expense must be created/linked through Finance. The UI must label unposted repair cost as operational evidence, not booked expense or altered acquisition cost.

### Scanner

- one reusable scanner component;
- hardware wedge first, camera fallback;
- accessible manual entry;
- clear permission/camera recovery;
- repeated-scan mode for counts, receipt QC, picking, and returns;
- scan result routes to the correct contextual task rather than always opening a generic unit modal.

## 8.8 Movements and evidence

Movement history remains a first-class read capability but not a primary sidebar workspace.

Each movement must show:

- transaction number/type;
- occurred time;
- Item/Variant/Unit when applicable;
- Location and condition;
- quantity delta and resulting condition balance;
- actor;
- reason code and narrative;
- exact source document;
- cost effect/completeness where authorized;
- audit/outbox correlation when troubleshooting.

Filters must be server-side and URL-backed. “Loss & shrinkage” is one saved filter over authoritative movement/source types.

## 8.9 Reservations view

The dedicated read model remains useful but should appear within Stock and Attention.

It must show:

- original, consumed, released, and remaining quantity;
- owner type and exact Order;
- payment status/deadline;
- Fulfillment status;
- exception/attention code;
- expiry for standalone hold;
- why release is or is not allowed;
- safe next action in the owning domain.

No generic Release action for Order-owned rows.

## 8.10 Inventory policy settings

Centralize under Settings and support:

- organization default low-stock/reorder threshold;
- optional item/location replenishment overrides;
- safety stock and target stock where used;
- count approval threshold/policy;
- large-adjustment approval threshold if the business wants dual control;
- barcode/label defaults;
- repair SLA defaults;
- audit history and optimistic versioning.

Do not add controls until their runtime consumers exist.

---

## 9. Replenishment capability

Replenishment is the largest genuinely missing operator capability suggested by the current data model.

## 9.1 Policy model

Use existing Catalog variant `reorder_point` as a default signal, but Inventory should own Location-specific operational policy. A credible baseline is:

```text
inventory.replenishment_policies
  organization_id
  inventory_item_id
  location_id nullable for organization-wide item policy
  reorder_point
  safety_stock
  target_stock
  preferred_source_location_id nullable
  preferred_supplier_id nullable
  lead_time_days nullable
  version
  created_at / updated_at / actor evidence
```

Only introduce columns that feed an implemented decision. Preferred supplier remains a Procurement reference; it does not transfer supplier ownership to Inventory.

## 9.2 Recommendation calculation

For each item/location:

```text
projected available
  = available to sell
  + confirmed incoming supply
  + dispatched incoming transfer
  - approved outgoing transfer
  - optionally forecast demand only when Analytics evidence is mature

suggested replenishment
  = max(0, target stock - projected available)
```

Costs remain nullable when incomplete. Demand forecasting must not be invented from insufficient history.

## 9.3 Operator actions

- “Transfer from another Location” opens a prefilled Transfer Draft and shows genuine surplus.
- “Create Purchase” opens Supply/Purchase with prefilled item and suggested quantity.
- “Review incoming” opens exact Shipment/Transfer sources.
- Inventory never directly creates supplier obligation or Finance payment.

---

## 10. API and contract target

## 10.1 Contract organization

Move Inventory contracts out of the monolithic shared index into focused exports while preserving package-level compatibility during migration:

```text
packages/contracts/src/inventory/
  common.ts
  positions.ts
  items.ts
  movements.ts
  reservations.ts
  transfers.ts
  counts.ts
  units.ts
  quality.ts
  replenishment.ts
```

Input and output contracts must be separate. Use explicit discriminated unions for workflow states and attention reasons.

## 10.2 Endpoint families

Recommended logical families:

```text
GET  /admin/inventory/overview
GET  /admin/inventory/positions
GET  /admin/inventory/items/:itemId
GET  /admin/inventory/movements
GET  /admin/inventory/reservations

POST /admin/inventory/adjustments
POST /admin/inventory/condition-movements

GET/POST/PATCH /admin/warehouse/locations...
GET/POST/PUT   /admin/warehouse/transfers...

GET/POST       /admin/inventory/counts...
POST           /admin/inventory/counts/:id/submit
POST           /admin/inventory/counts/:id/post

GET            /admin/inventory/units...
POST           /admin/inventory/unit-conversions
POST           /admin/inventory/units/:id/inspect
POST           /admin/inventory/units/:id/repair...
POST           /admin/inventory/units/:id/release
POST           /admin/inventory/units/:id/write-off

GET/PATCH      /admin/inventory/replenishment-policies...
GET            /admin/inventory/replenishment-recommendations
```

Renaming endpoints is optional if current names can be made coherent. The important work is stable semantics, shared schemas, and removal of parallel mutation paths.

## 10.3 Pagination

Every growing collection returns:

```ts
interface PaginatedResult<T> {
  data: readonly T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
```

Use deterministic sort with an ID tie-breaker. Do not infer `hasNext` from receiving a full page.

## 10.4 Command contract

Every high-risk command includes:

- stable idempotency key;
- payload hash guard;
- expected version where mutable state is involved;
- structured conflict code and current server state;
- audit actor/reason;
- transactional outbox event;
- deterministic replay response.

Unknown outcome must be represented rather than encouraging blind retry.

## 10.5 Error model

Use only:

```ts
{
  error: {
    code: string;
    message: string;
    details?: unknown;
  }
}
```

Frontend error handling maps codes to contextual recovery without parsing English text.

---

## 11. Database and integrity target

## 11.1 Preserve current authority

Keep the existing schemas and append-only Inventory movement model. Modify the mutable development baseline where required rather than stacking compensating migrations.

## 11.2 Strengthen unit constraints

Add or enforce:

- composite organization foreign keys for every cross-domain unit reference, not only selected core references;
- unique source representation where one physical unit may be registered only once for one eligible source allocation;
- indexes for actual unit queue filters, source receipt line, active repair, condition/status/location, and fulfillment allocation;
- append-only protection for unit events;
- no direct delete of units/inspections/repairs with operational history;
- version checks for mutable unit and repair records;
- status/condition transition validation in application commands and, where practical, database constraints/triggers.

## 11.3 Required integrity checks

Extend System Integrity with read-only findings for:

- SERIAL item aggregate on-hand versus live unit count by Location;
- aggregate sellable/unavailable versus mapped unit status/condition;
- reserved aggregate versus reservation allocations and unit selections;
- unit Location versus active Transfer/Fulfillment/Return state;
- dispatched unit without dispatch Inventory movement;
- written-off unit without quantity/cost effect;
- receipt-backed unit count exceeding source receipt line quantity;
- unit source tenant mismatch;
- SERIAL item with unrepresented aggregate quantity;
- STANDARD item with live unit identities;
- active repair without hold state;
- completed repair missing reinspection requirement;
- unit event gaps or mutable evidence.

Repairs must remain narrow and domain-owned. The Integrity module may recommend or call an approved reconciliation command; it must not arbitrarily rewrite stock.

## 11.4 Cost rules

- Unit identity should point to exact cost provenance when practical, especially after receipt, transfer, return, and write-off.
- Transfer dispatch/receipt moves identity and cost together.
- Write-off consumes cost through Costing.
- Condition reclassification moves cost position with quantity.
- Repair expense is Finance-owned; capitalization into stock cost requires an explicit approved business rule and must not happen automatically.
- Any missing cost remains explicit `null`/unvalued evidence.

---

## 12. Cross-module experience map

## 12.1 Catalog

- Product detail links to exact Inventory Items/variants, not a title search.
- Variant editor shows Inventory status, tracking mode, reorder policy, and receipt-backed cost as read-only authoritative facts.
- Archiving keeps historical stock visible and blocks new positive stock/reservations according to current policy.
- Inventory links back to the exact Product and edit section.

## 12.2 Supply, Procurement, and Receiving

- Purchase/Shipment shows projected incoming but not on-hand.
- Posted Receipt shows created Inventory movement, cost layer, and unit registration completeness.
- SERIAL receipt line registration cannot exceed received quantity.
- QC intake opens from Receipt with the receipt context preserved.
- Replenishment handoff creates a prefilled Purchase draft; Supply remains owner.

## 12.3 Costing and Finance

- Stock and Item detail show authoritative cost state and source.
- Unvalued quantities are visible and actionable.
- Loss/write-off links to cost effect and any Finance evidence.
- Repair cost evidence can create/link a Finance expense; it is not silently booked.

## 12.4 Orders and Payments

- Order detail shows reservation quantity and Location.
- Inventory reservation view links to exact Order and Payment state.
- Timeout/rejection attention opens owning Order/Payment action.
- Inventory does not independently release Order-owned stock.

## 12.5 Fulfillment

- Aggregate allocation happens before unit selection.
- SERIAL pick workflow requires exact eligible units.
- Dispatch atomically consumes reservation, aggregate quantity, cost, and unit state.
- cancellation releases unit selection and aggregate allocation consistently.

## 12.6 Delivery and Returns

- Failed delivery does not restore stock.
- Return Receipt restores aggregate quantity/cost and reconnects the physical unit identity in one coordinated operation.
- Return inspection determines subsequent sellable/quarantine/damaged state.
- Unit timeline links Delivery and Return sources.

## 12.7 Analytics

- Inventory Analytics uses rebuildable snapshots and events.
- Snapshot capture includes incoming/in-transit only when definitions and source joins are correct.
- Operational pages use transactional read models, not stale Analytics projections.

## 12.8 Notifications

Outbox facts may create alerts for:

- low stock/reorder threshold crossed;
- Transfer overdue/discrepancy;
- Count awaiting review;
- unit awaiting QC or repair overdue;
- unit/ledger integrity finding;
- unvalued addition requiring review.

Notification delivery failure never changes Inventory truth.

---

## 13. Frontend architecture

Recommended structure:

```text
apps/admin/features/inventory/
  api/
    queries.ts
    commands.ts
    schemas.ts
  permissions/
    inventory-permissions.ts
  shared/
    inventory-workspace-nav.tsx
    inventory-status.tsx
    inventory-feedback.tsx
    quantity-display.tsx
    item-identity.tsx
    source-link.tsx
  overview/
  stock/
  locations/
  transfers/
  counts/
  quality/
  replenishment/
```

This is a target organization, not a requirement to rename everything in one destructive commit. Move code as each workspace is rebuilt.

### Rules

- Pages compose focused features; they do not own the full workflow implementation.
- Prefer Server Components for initial read data where authentication/API architecture supports it.
- Start independent queries together.
- Client components own only interactive state.
- URL is the authority for filters/tabs/page/sort.
- One shared Item picker and one shared Location picker.
- One shared responsive data-list pattern.
- One shared command feedback/conflict/retry pattern.
- One shared form for create/edit Location.
- One shared Transfer form for create/edit Draft.
- Shared StatusBadge mappings; no local `StatusBadge` functions.
- Shared `Table`, `AdminPage`, `PageHeader`, `PagePanel`, loading/empty/error states.
- No raw page-specific CSS, hard-coded status colors, or `transition-all`.

---

## 14. Responsive and interaction requirements

### Mobile

- Important operations work at approximately 360–430 px width.
- Primary action remains reachable without horizontal scroll.
- Lists use cards or intentional horizontal table fallback only for comparison-heavy data.
- Complex dialogs become full-screen sheets/routes.
- Camera scanner and hardware input have equal manual fallback.
- Numeric count fields work with on-screen keyboard and retain context while scrolling.
- Sticky action bars respect safe areas.

### Tablet/iPad

- Two-pane layouts may show worklist + detail where useful.
- Landscape and portrait both remain functional.
- Touch targets remain at least comfortably tappable; no hover-only action.

### Desktop

- Compact tables, keyboard navigation, bulk selection, and command palette are prioritized.
- Dense information does not become a wall of cards.
- Row actions are discoverable without making every row visually noisy.

### Accessibility

- Semantic headings and tables.
- Labels and names for every control.
- Icon-only buttons have accessible names.
- Async validation and mutation results use polite live regions.
- Focus moves to the first invalid field.
- Destructive operations use confirmation with consequences.
- No color-only status communication.
- Reduced-motion behavior is honored.
- Focus is never hidden behind sticky chrome.

---

## 15. Proposed implementation stages

Each stage should be a coherent commit/checkpoint. Do not call the whole module complete before all required stages and owner review finish.

## Stage 0 — Approval and baseline capture

- Approve this document or record requested changes.
- Capture representative workflows/data for Product, Receipt, Transfer, Count, Order/Fulfillment, Return, and SERIAL unit.
- Record current screenshots only as comparison evidence.
- Do not change business behavior.

**Gate:** owner approves target IA, ownership, and sequencing.

## Stage 1 — Serialized-unit integrity convergence

- Define unit-to-ledger state mapping.
- Make unit move/release/write-off/QC/return atomic with Inventory and Costing effects.
- Remove swallowed ledger errors.
- Make registration source-bounded and idempotent.
- Make stock conversion authoritative and non-optional.
- Integrate units into Transfers and Counts.
- Add cross-model integrity tests and findings.
- Fix unit API idempotency/version semantics.

**Gate:** no supported unit operation can create ledger, Location, condition, reservation, or cost divergence.

## Stage 2 — Contracts and backend modularization

- Split Inventory/Warehouse/unit route and service responsibilities.
- Standardize envelopes/errors/pagination.
- Create overview and attention read model.
- Create authoritative replenishment policy resolution.
- Align capabilities and Location scope semantics.

**Gate:** stable typed contracts support the target UI without frontend reconstruction of domain rules.

## Stage 3 — Inventory shell and navigation

- Replace sidebar group with six destinations.
- Add Inventory workspace sub-navigation.
- Add redirects for old routes.
- Remove broken Loss link.
- Add scanner/global commands.
- Standardize page shell and permission rendering.

**Gate:** every Inventory capability is discoverable from an intentional place; no dead destination.

## Stage 4 — Overview, Stock, and Item detail

- Build Overview attention workspace.
- Consolidate Positions/Items/Units/Movements/Reservations in Stock.
- Rebuild Item detail tabs.
- Add image-led mobile cards and compact desktop tables.
- Add exact Catalog, Supply, Costing, Order, Fulfillment, Return links.

**Gate:** an operator can understand any SKU's quantity, condition, reservation, movement, incoming state, cost state, and next action without searching across disconnected pages.

## Stage 5 — Locations

- Rebuild list/detail/create/edit around shared primitives.
- Implement blocker-aware capability/status changes.
- Add real incoming/outgoing and work queues.
- Rename routes/labels with redirects.

**Gate:** Location configuration cannot strand active business work.

## Stage 6 — Transfers

- Rebuild list/create/detail/receive/discrepancy UX.
- Add URL state and real pagination.
- Integrate exact SERIAL unit selection.
- Add mobile receiving workflow and conflict recovery.

**Gate:** quantity, unit identity, and cost provenance travel together through every Transfer outcome.

## Stage 7 — Counts

- Rebuild Count list/start/count/review/post.
- Add cycle/partial scope if approved.
- Add SERIAL scan reconciliation.
- Add value effect and unvalued-found-stock evidence.

**Gate:** count posting is reviewable, race-safe, condition-aware, identity-aware, and cost-aware.

## Stage 8 — Quality

- Consolidate unit list/QC/repair/reinspection/release/write-off.
- Add capability-aware actions and Location scope.
- Complete scanner and label workflows.
- Link Finance repair expense evidence.

**Gate:** every physical unit has an understandable and authoritative journey.

## Stage 9 — Replenishment and settings

- Consolidate low-stock settings.
- Implement policy hierarchy.
- Add recommendation read model.
- Add Purchase/Transfer handoffs.
- Add alerts through outbox/Notifications.

**Gate:** low-stock labels and recommendations are explainable and use configured policy, confirmed incoming facts, and owning-domain actions.

## Stage 10 — Consolidation and owner walkthrough

- Remove superseded components/routes after redirects are proven.
- Resolve focused lint debt.
- Run focused typecheck/tests/build.
- Perform authenticated desktop/tablet/mobile walkthrough.
- Test hardware scanner/camera and a representative label printer if available.
- Review representative end-to-end scenarios with owner.
- Update Product Completion state only after evidence.

**Gate:** owner operational approval.

---

## 16. Acceptance scenarios

The final Inventory module should pass at least these real workflows.

### Scenario A — New standard SKU receipt

1. Supply Purchase and Shipment identify the Variant.
2. Receipt posts quantity and cost.
3. Stock position shows on-hand, sellable/inspection, incoming cleared, and cost source.
4. Product detail links to exact Item.
5. Movement links back to Receipt.

### Scenario B — New serialized SKU receipt and QC

1. Receipt posts 10 units into inspection.
2. Exactly 10 identities can be registered for the eligible receipt line.
3. Labels print.
4. QC passes 8, sends 1 to repair, and writes off 1.
5. Aggregate ledger and cost positions show 8 sellable, 1 quarantine/repair, 1 consumed/write-off.
6. Integrity reports no mismatch.

### Scenario C — Order reservation and serialized fulfillment

1. Order reserves 2 units at one Location.
2. Fulfillment selects two eligible physical units.
3. Cancellation before dispatch releases selections and reservation.
4. Dispatch consumes reservation, aggregate quantity, FIFO cost, and unit states once.
5. Duplicate dispatch is safely replayed/rejected without duplicate effects.

### Scenario D — Transfer with serialized discrepancy

1. Draft requests 5 exact serialized units.
2. Dispatch moves aggregate quantity/cost to transit and marks identities in transit.
3. Destination receives 4 exact units.
4. One is closed lost with evidence.
5. Cost write-off, Transfer line, units, Inventory movement, and source links reconcile.

### Scenario E — Condition reclassification and repair

1. Unit fails inspection and moves from inspection to quarantine.
2. Repair record captures technician/evidence.
3. Optional Finance expense is linked.
4. Reinspection passes and moves quantity/cost to sellable.
5. Unit and aggregate histories explain the complete journey.

### Scenario F — Aggregate count

1. Count snapshot starts.
2. Concurrent movement occurs.
3. Counter submits condition quantities and found SKU.
4. Reviewer sees movements since snapshot and value effect.
5. Post uses current locked truth and creates only necessary variance movements.

### Scenario G — Serialized count

1. Operator scans expected physical units.
2. One expected unit is missing and one unexpected unit is found.
3. Review resolves identity/location discrepancy.
4. Posting keeps unit and aggregate ledgers consistent.

### Scenario H — Payment timeout

1. Order-owned reservation is visible with Payment deadline.
2. Submitted reference awaiting review does not auto-release.
3. Rejected/unclaimed expired payment follows Orders-owned cancellation.
4. Inventory reflects release once and links to the Order.

### Scenario I — Replenishment

1. Item falls below effective threshold.
2. Recommendation includes confirmed incoming and transfer stock.
3. Operator chooses internal Transfer or Supply Purchase handoff.
4. Created owning-domain draft is prefilled but still explicitly reviewed.

### Scenario J — permissions and Location scope

1. View-only staff see read surfaces without false mutation controls.
2. QC staff see only scoped Locations and permitted actions.
3. Write-off requires its distinct capability.
4. Cross-tenant and out-of-scope IDs fail without disclosure.

---

## 17. Verification strategy

Use the narrowest meaningful check at each stage.

### Backend/integrity stages

- fresh disposable baseline migration when schema changes;
- focused Inventory, Costing, Procurement, Orders, Fulfillment, Returns, and unit tests;
- concurrency tests for conversion, reservation/allocation, Transfer, Count, release, and write-off;
- idempotency replay and changed-payload rejection;
- tenant and Location-scope tests;
- integrity verifier tests;
- database/API builds and focused lint.

### Frontend stages

- Admin typecheck;
- focused ESLint with zero findings in touched Inventory files;
- focused query/form/state tests;
- Admin production build at meaningful closure points;
- browser walkthrough at desktop, tablet, and mobile sizes;
- keyboard, focus, screen-reader naming, reduced-motion, long-content, empty/error/loading/conflict/retry checks;
- real scanner/label checks when hardware is available.

### Completion truth

Do not equate:

- static compilation with workflow correctness;
- empty-database integrity with production-data integrity;
- mocked client tests with API/domain behavior;
- responsive CSS classes with owner-verified mobile usability;
- provider/hardware code with real external operation.

---

## 18. File disposition strategy

### Preserve and evolve

- authoritative migrations and aggregate ledger tables;
- core Inventory transaction writer and cost-position operations;
- reservation lifecycle policy;
- Transfer and Stocktake domain commands;
- server-paged position/history/detail read models;
- shared Admin primitives and capability provider;
- current audit/outbox integration.

### Refactor substantially

- `apps/admin/components/admin-shell.tsx` Inventory navigation;
- Inventory dashboard;
- Stock workspace and Item detail;
- Location list/detail/form;
- Transfer list/detail/form/receive/discrepancy;
- Stocktake list/form/detail;
- Unit list/detail/QC/repair/scanner components;
- Inventory API clients;
- monolithic Inventory/Warehouse/unit route files;
- serialized-unit database service;
- shared Inventory contracts currently in one large index.

### Remove after replacement

- broken `/inventory/loss` navigation;
- duplicate low-stock setting surface/key;
- raw duplicated tables/status badge implementations;
- obsolete redirect-source pages after an agreed compatibility window;
- superseded one-off feedback/loading/empty primitives;
- unused imports/state and invalid ESLint rule comments;
- direct cross-Location unit move command.

### Do not delete casually

- movement/audit history;
- cost provenance;
- idempotency records;
- Transfer/Count/Reservation evidence;
- unit event history;
- source links required for reconciliation;
- currently dirty `apps/admin/next-env.d.ts`, which predates this assessment and remains untouched.

---

## 19. Decisions requested from the owner

The implementation can proceed with defaults below unless the owner changes them during review.

1. **Sidebar:** approve six Inventory destinations: Overview, Stock, Locations, Transfers, Counts, Quality.
2. **Terminology:** use “Locations” in UI and retain Warehouse as domain terminology.
3. **Physical units:** treat SERIAL units as identity over aggregate stock, never an independent source of quantity truth.
4. **Movements/Reservations:** keep as Stock views and contextual links, not primary sidebar destinations.
5. **Adjustments:** keep as contextual controlled operation, not primary navigation.
6. **Loss:** represent through authoritative movement/exception filters, not a standalone empty module.
7. **Settings:** consolidate under `/settings/inventory` with one effective policy hierarchy.
8. **Replenishment:** include Location-aware policy and Purchase/Transfer handoffs in the completion scope.
9. **Counts:** include SERIAL scan reconciliation and allow scoped/cycle counts as the target design.
10. **Sequencing:** repair unit/ledger integrity before frontend completion claims.

Recommended default answer to all ten decisions: **approve**.

---

## 20. Final completion definition

The Admin Inventory module is complete only when:

- navigation reflects operator jobs rather than implementation fragments;
- every meaningful capability is discoverable from a logical context;
- no dead route or false control remains;
- quantity, condition, reservation, unit identity, Location, cost, audit, and source evidence agree transactionally;
- all growing lists are server-paged and URL-backed;
- every mutation respects capability and Location scope in both UI and API;
- desktop, tablet, and mobile workflows are practical;
- loading, empty, error, conflict, retry, and recovery states are explicit;
- Catalog, Supply, Costing, Orders, Payments, Fulfillment, Delivery, Returns, Finance, Analytics, Notifications, and Integrity connections preserve their authoritative boundaries;
- focused automated evidence passes;
- authenticated owner walkthrough approves the real operating experience.

Until then, the truthful status is:

> **Strong Inventory core; fragmented Admin product; serialized-unit integrity convergence and full experience re-architecture required.**

