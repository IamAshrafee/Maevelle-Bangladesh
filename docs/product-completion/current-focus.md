# Current Focus

## Active area

Supply operations — supplier policy, purchasing, inbound shipment, landed cost,
receipt-backed variant costing, and inventory visibility.

## Evidence state

`CORE SUPPLY WORKFLOW COMPLETE / OWNER OPERATIONAL REVIEW PENDING`

The system now supports the operating model where a Bangladesh intermediary such
as SkyBuy sources from China, purchases merchandise, coordinates domestic China
delivery, international freight and import clearance, then completes Bangladesh
final-mile delivery.

Implemented behavior includes:

- structured supplier type, advance percentage, balance-due event, payment terms,
  currencies, lead time and service scope, with an editable intermediary preset;
- immutable supplier-policy snapshots on placed purchases;
- supplier-authoritative percentage and fixed-amount purchase discounts with
  deterministic allocation to variant lines;
- shipment provider references, status milestones, actual/chargeable weights,
  rates and reported freight evidence;
- Finance expenses linked to purchases and shipments, including a single cash
  settlement across merchandise and logistics obligations;
- explicit China local courier, international freight/import and Bangladesh
  delivery landed-cost categories with reconciliation gates;
- discounted merchandise and finalized landed costs flowing into receipt-backed
  FIFO cost layers, Catalog variant acquisition cost and location-weighted
  Inventory cost without replacing manual Catalog estimates; and
- image-first product/variant selection and cost visibility in Purchase, Catalog
  and Inventory workflows;
- a consistent Supply workspace navigation layer across overview, suppliers,
  purchases, shipments, receiving, landed cost and costing;
- server-paginated, tenant-scoped Catalog variant search by product title, SKU,
  barcode and option value, with image-led cards, retry and load-more recovery;
  and
- accessible, mobile-conscious Supply worklists with URL-backed filters,
  announced feedback, touch-friendly tabs and a corrected global inbound
  shipment route/capability; and
- one canonical shipment-level landed-cost workflow: the global Landed Cost
  workspace is now an oversight queue, while charge entry, allocation review,
  revisions and finalization live only in the shipment's URL-addressable
  `Landed Cost & Valuation` tab; and
- one intentional responsive Supply information architecture: listing pages
  discover and prioritize work, detail workspaces own record mutations, Receiving
  owns intake/history/condition resolution, and Costing remains a downstream
  Inventory valuation surface rather than a duplicate Supply destination.
- image-led mobile cards now cover Suppliers, Purchases, Shipments, Receiving and
  Landed Cost queues; long operational forms become full-screen mobile task
  dialogs; tabs, filters and primary actions use touch-conscious targets; and
  Receiving exposes its previously missing pagination controls.

## Verification completed

- Rebuilt the disposable PostgreSQL volume and migrated both development and test
  databases from the edited baseline.
- Database, API and Admin production builds passed.
- Procurement, Landed Cost/Costing, Inventory, Finance, Catalog and Admin supply
  helper suites passed: 80 tests across 7 files.
- Supplier policy snapshot regression verifies that placement captures the current
  agreement and later supplier edits do not rewrite committed purchases.
- The frontend completion pass additionally passed the Database Catalog integration
  suite (8 tests), Admin Supply helper suites (5 tests), Admin production build and
  a complete Docker build/start with healthy PostgreSQL, API and Admin services.
- The landed-cost workflow consolidation passed a fresh Admin production build;
  old `/landed-cost?shipment=...` bookmarks redirect to the canonical shipment
  costing tab.
- The complete Supply frontend consolidation at `54e6bfc` passed focused ESLint
  with zero findings, both Admin Supply helper suites (5 tests), `git diff
  --check`, and a fresh Admin production build including TypeScript and all 84
  generated routes.
- Browser verification confirmed the local Admin route and responsive 390×844
  authentication shell. The authenticated operator walkthrough remains an owner
  review gate rather than being represented as complete.

## Next implementation boundary

- Conduct an owner walkthrough using representative real orders such as
  `SKY363126` and `SKY395285`, including discount, split payment, freight evidence,
  receipt, landed-cost finalization and resulting variant cost.
- Treat direct SkyBuy synchronization as an optional external integration. Do not
  automate it without an authorized and documented provider API/export contract.
- Preserve the existing historical import safety boundary: it must not fabricate
  receipts, inventory, payments or landed costs from incomplete source evidence.
