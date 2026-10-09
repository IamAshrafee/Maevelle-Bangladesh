# Analytics backend production-completion record

## Status

`DURABLE REPORTING AND INGESTION FOUNDATION COMPLETE / EXTERNAL DESTINATIONS AND FULL EVENT EMISSION PENDING`

Analytics remains a read and measurement domain. Orders, Payments, Finance, Inventory, Costing, Delivery, Returns, Reviews, Notifications, Procurement, and Assets remain authoritative for their business facts. Analytics can rebuild its projections but cannot mutate those source domains.

## Architecture delivered

- Versioned metric catalog with explicit grain, time basis, source domains, eligible states, and currency policy.
- Rebuildable tenant-scoped facts for Orders, Order lines, Customers, Payments, Refunds, Finance account entries, COGS, Delivery, Returns, and daily Inventory positions.
- Immutable product, variant, and SKU sale snapshots so later Catalog renames do not rewrite historical product reporting.
- Batched outbox consumption with database-enforced event receipts. A batch rebuilds once per affected Organization instead of once per source event.
- Projection state records freshness, high-watermark, failure, and rebuild state. System Integrity continues to own cross-domain detection and allow-listed projection repair.
- Consent-gated, idempotent Storefront event ingestion with separate sessions, raw normalized events, first-touch and last-non-direct attribution fields, business time, receive time, and optional authoritative Order links.
- Leased background CSV exports with recovery after Worker loss, formula-injection protection, seven-day payload expiry, tenant scoping, separate export permission, and audit evidence.

## Canonical money distinctions

- Merchandise gross, applied discount, customer delivery charge, Order total, completed Refunds, confirmed Payments, Finance account movement, recognized COGS, and gross margin are separate facts.
- Cancelled Orders remain in placed/cancelled counts but are excluded from eligible sales totals.
- Completed Refunds use Payments records. Refund reporting can use refund completion time; Order-cohort reporting keeps the original Order date separately.
- Finance account movement is not labelled revenue. Owner Capital and internal transfers therefore cannot silently become sales.
- Product gross margin is `PARTIAL` unless every included line has authoritative recognized Costing data. Unknown costing is returned as `null`, never zero.
- Source currencies remain separate. No implicit cross-currency addition or invented exchange rate is performed.

## Reporting APIs

All Admin endpoints are tenant-scoped through active Organization membership and capability checks.

- `GET /admin/analytics/metrics`
- `GET /admin/analytics/reports/:report?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=DAY|WEEK|MONTH&currency=BDT&page=1&pageSize=25`
- Reports: `SALES`, `ORDERS`, `PRODUCTS`, `CUSTOMERS`, `INVENTORY`, `SUPPLY`, `PAYMENTS`, `FINANCE`, `DELIVERY`, `RETURNS`, `REVIEWS`, `NOTIFICATIONS`, `STOREFRONT`, `MARKETING`, and `ASSETS`.
- Every report declares Organization timezone and `[from,to)` normalized boundaries, freshness, availability, partial-period state, previous equal-length comparison totals, and pagination metadata.
- `POST /admin/analytics/exports`, `GET /admin/analytics/exports`, and `GET /admin/analytics/exports/:exportId/download` provide asynchronous export operations.
- Existing overview, dashboard, drill-down, inventory-snapshot, rebuild, and integrity endpoints remain available for additive compatibility.

Financial and product-profitability reports require `analytics.financial.view`. Export operations require `analytics.export`. Rebuild requires `analytics.manage`.

## Storefront measurement

`POST /storefront/v1/analytics/events` accepts the versioned internal commerce taxonomy. Browser events require a UUID session and explicit Analytics consent. `DENIED` and `UNKNOWN` observations are not persisted. Duplicate logical event IDs return a duplicate receipt and do not create a second event.

Internal funnel rates use related session populations and return `null` when a denominator is empty. Storefront and Marketing reports return `NOT_TRACKED` until real consented events exist. No historical visitor data is inferred.

The Storefront analytics hand-off now sends consented events to the internal endpoint without blocking commerce. Feature-level event emission remains part of the later Storefront integration/frontend phase; an endpoint existing does not imply every Storefront interaction is already observed.

## GA4 and Meta status

- Internal event taxonomy and stable event ID/deduplication contracts: `COMPLETE`.
- GA4 destination delivery: `EXTERNALLY UNCONFIGURED / NOT ACTIVE`.
- Meta Pixel destination delivery: `EXTERNALLY UNCONFIGURED / NOT ACTIVE`.
- Meta Conversions API delivery: `EXTERNALLY UNCONFIGURED / NOT ACTIVE`.
- Browser/server purchase deduplication foundation: `PARTIAL`; stable IDs are defined, but checkout-to-server destination dispatch is not enabled.

GA4 and Meta are external measurement destinations, never internal Finance truth. GA4 purchase payloads must use authoritative transaction IDs and currency/value pairs. Any future Meta browser/server pair must reuse one logical event ID. Provider failure must remain isolated from checkout.

## Verification evidence

- Empty PostgreSQL volume migrated through all checked-in migrations.
- Database and API TypeScript builds passed.
- Worker and Storefront TypeScript builds passed.
- Focused ESLint passed for all changed TypeScript files.
- Admin and Storefront production builds passed in the Docker rebuild.
- Clean-migration test passed.
- Seven focused Analytics tests plus the clean-migration test passed, covering tenant projection isolation, rebuild/integrity recovery, duplicate outbox claims, inventory snapshot scope, consent gating, event deduplication, funnel denominators, bounded date semantics, and leased CSV export recovery.
- API readiness and a real consent-unknown ingestion request passed through Caddy at `http://127.0.0.1:8080`.

## Honest remaining gaps

- `PARTIAL`: business projections are durable and batch-coalesced, but high-volume entity-level incremental upserts/checkpoints are not yet implemented; a relevant batch rebuilds the Organization projection set.
- `PARTIAL`: reports cover all requested domains, but richer supplier lead-time, landed-cost allocation, courier settlement, notification cost, cohort-retention, RFM, search-query, and stockout-duration measures need additional purpose-built facts.
- `MISSING`: scheduled report definitions and email delivery.
- `MISSING`: Admin configuration and secret-backed delivery workers for GA4 Measurement Protocol and Meta CAPI.
- `MISSING`: full Storefront feature emission for product, Cart, Checkout, search, and purchase events, plus final consent preference UI/storage.
- `UNVERIFIED`: real GA4 property, Meta dataset/pixel, browser deduplication, live consent behavior, and provider acceptance because no external credentials or destinations were configured.
- `PENDING`: complete Analytics Admin frontend/dashboard phase and owner review.

The module must not be labelled fully production-complete until these boundaries are closed or explicitly accepted as external/optional scope.
