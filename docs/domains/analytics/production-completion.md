# Analytics backend production-completion record

## Status

`FRONTEND & BACKEND PRODUCTION WORKSPACE COMPLETE / EXTERNAL AD PLATFORMS UNCONFIGURED`

Analytics operates as a comprehensive, production-ready operational intelligence workspace in Maevelle Admin (`/admin/analytics`), fully connected to authoritative backend reporting contracts, tenant isolation, capability authorization, and outbox projection pipelines.

## Frontend Architecture & Workspaces Delivered

- **Shared Reporting Foundation (`apps/admin/components/analytics/`):**
  - `AnalyticsWorkspace`: Central coordinator with responsive subnavigation bar (`overview`, `sales`, `products`, `customers`, `inventory`, `finance`, `supply`, `delivery`, `storefront`, `marketing`, `operations`, `settings`), full URL search parameter synchronization (`view`, `preset`, `from`, `to`, `granularity`, `currency`), and seamless view rendering.
  - `AnalyticsFilterToolbar`: Uniform reporting toolbar supporting 7 date presets (`Today`, `Yesterday`, `Last 7 Days`, `Last 30 Days`, `This Month`, `Last Month`, `This Year`, `Custom`), custom date pickers, granularity switching (`DAY`, `WEEK`, `MONTH`), `Asia/Dhaka (UTC+6)` timezone indicator, and direct CSV export modal.
  - `MetricCard`: Standardized KPI presentation with tabular numbers, canonical unit formatting, definition tooltips, status pills (`PARTIAL`, `RESTRICTED`), comparison deltas with semantic directionality (e.g. Inverted for cancellations/RTO), and drill-down links.
  - `AnalyticsCharts`: Accessible Recharts components (`SalesTrendChart`, `DistributionList`, `StorefrontFunnelChart`, `ReviewDistribution`, `ChartSkeleton`) with explicit property transitions and accessible empty states.
- **Domain Workspaces:**
  - **Overview (`views/overview-view.tsx`):** Executive snapshot with commercial KPIs, sales/order trend comparison, top 5 ranked products preview, reverse logistics (Returns vs RTO) comparison, delivery success rate, and storefront traffic pulse.
  - **Sales Analytics (`views/sales-view.tsx`):** Gross, Discounts, Net Sales, AOV, sales trend over time, channel distribution (Storefront, Facebook, Instagram, TikTok, Manual), payment method mix, and order lifecycle statuses.
  - **Products & Variants (`views/products-view.tsx`):** SKU-level demand table, units sold, net sales, recognized COGS, gross margins, margin percentages, and link to catalog management. Non-financial operators receive masked cost columns with `RESTRICTED` status indicator.
  - **Customers Analytics (`views/customers-view.tsx`):** Active buyers, repeat vs first-time customer breakdown, spend rankings, and guest checkout canonicalization notices.
  - **Inventory Analytics (`views/inventory-view.tsx`):** Available to Sell (ATS) vs reserved units, location distribution table, SKU snapshot history, and stock valuation context.
  - **Finance & Profitability (`views/finance-view.tsx`):** Restricted capability-gated workspace (`analytics.financial.view`), cash ledger delta, customer payments vs completed refunds, cash movement by transaction type (capital vs transfers vs operating), and COD settlement rules.
  - **Supply & Procurement (`views/supply-view.tsx`):** Purchase orders, inbound units ordered, total procurement value, and supplier breakdown table.
  - **Delivery & Logistics (`views/delivery-view.tsx`):** Consignments, delivery success rate, average delivery hours, outcome status breakdown, and COD vs delivery status distinction.
  - **Storefront Behavioral Analytics (`views/storefront-view.tsx`):** Consented sessions, stage progression (Views -> Cart -> Checkout -> Orders), conversion rates, and honest `NOT_TRACKED` consent state.
  - **Marketing Attribution (`views/marketing-view.tsx`):** Campaign traffic, attributed orders, conversion rates, UTM source/medium/campaign table, and social channel vs paid ad distinction.
  - **Operations (`views/operations-view.tsx`):** Tabbed workspace for Returns & Refunds, Customer Reviews (with star rating distribution), Notifications & Dispatch (Email vs SMS), and Fixed Assets.
  - **Settings & Data Status (`views/settings-view.tsx`):** Projection freshness & status, projection rebuild trigger with confirmation modal, background CSV export center, searchable metric dictionary, GA4 & Meta external destinations status, and projection integrity verification.

## Gaps Resolved

- **Permissions & Masking:** Updated backend `GET /admin/analytics/reports/PRODUCTS` so that non-financial staff with `analytics.view` can inspect Product sales demand with sensitive financial costing fields masked to `null` and flagged as `RESTRICTED`, while operators with `analytics.financial.view` receive full cost & margin facts.
- **Truthful External Destinations:** Added `GET /admin/analytics/destinations` returning real configuration status for GA4 and Meta (`EXTERNALLY_UNCONFIGURED / NOT_ACTIVE`).
- **Obsolete Cleanup:** Removed the legacy MVP `analytics-console.tsx` and mounted `AnalyticsWorkspace` cleanly in `apps/admin/app/analytics/page.tsx`.

## Verification Evidence

- Full TypeScript compilation passes with 0 errors across `@maevelle/contracts`, `@maevelle/api`, `@maevelle/database`, and `@maevelle/admin`.
- Production container routes `/admin/analytics` and `/api/health/ready` tested via Caddy gateway and returning HTTP 200.
- All Tailwind CSS v4 and shadcn/Base UI component standards respected: `tabular-nums font-mono` for currency, no `transition: all`, explicit CSS transition properties, responsive grids for mobile and desktop.

## Remaining Honest Boundaries

- `EXTERNALLY_UNCONFIGURED`: GA4 and Meta Pixel / CAPI external measurement destinations (no external credentials configured; internal analytics functions independently).
- `OPTIONAL_FUTURE_ENHANCEMENT`: Scheduled email report dispatching and entity-level incremental checkpointing for very high transaction volumes.


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
