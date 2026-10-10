# Current Focus

## Active area

Analytics — Complete Frontend Product Development & Business Intelligence Workspace.

## Evidence state

`ANALYTICS MODULE COMPLETE (FRONTEND + BACKEND) / OPERATIONAL INTELLIGENCE WORKSPACE DELIVERED`

The Analytics module has transitioned from a backend reporting foundation + MVP table dump into a complete, production-grade Analytics & Business Intelligence workspace across Maevelle Admin (`apps/admin/app/analytics/`).

Implemented surfaces include:
- Executive Overview with live commercial indicators, top product rankings, and operational health summaries.
- Specialized domain workspaces: Sales, Products & Variants, Customers, Inventory, Finance & Profitability, Supply & Procurement, Delivery & Logistics, Storefront Behavioral Tracking, Marketing Attribution, Operations (Returns, Reviews, Notifications, Assets), and Settings/Data Status.
- Uniform date filter toolbar with 7 presets, custom dates, granularity selector, `Asia/Dhaka (UTC+6)` boundary alignment, and prior-period baseline comparisons.
- Strict authoritative business truth: transactional records remain authoritative; no simulated traffic, no fake cohort heatmaps, no calculating Finance profit in React floating-point, honest unconfigured states for GA4 & Meta CAPI.
- Capability-aware masking: non-financial staff can view Product sales while recognized cost and gross margin are masked to `RESTRICTED`. Full cash and margin facts require `analytics.financial.view`.
- Leased background CSV export generation and download center.
- Self-healing projection rebuild trigger and System Integrity drift detection.

## Verification completed

- Rebuilt the disposable PostgreSQL volume from the edited baseline and migrated the development and test databases cleanly.
- Database, API, Worker, and Storefront TypeScript compilation passed.
- Focused ESLint passed for all changed TypeScript files.
- Seven focused Analytics tests and the clean-migration test passed.
- Admin and Storefront production builds passed during the Docker rebuild.
- PostgreSQL, API, Admin, Storefront, Worker, and Caddy were running; API readiness passed.
- A real consent-unknown browser event was rejected from persistence through the public Caddy/API route without affecting commerce.
- Architecture check, secret scan, and `git diff --check` passed.

## Next implementation boundary

- Emit the internal taxonomy from real Product, list, search, Cart, Checkout, and confirmation interactions and implement durable checkout/session-to-Order linking.
- Add centralized non-secret destination settings plus secret-backed GA4 Measurement Protocol and Meta Pixel/CAPI adapters, stable browser/server deduplication, retries, unknown-outcome reconciliation, and provider diagnostics.
- Add purpose-built retention/cohort/RFM, supplier and inbound lead-time, landed-cost allocation, courier fee/COD settlement, notification cost, search-query, stockout-duration, and operational workload facts.
- Add scheduled report delivery and scalable entity-level incremental projection checkpoints.
- Build the complete responsive Analytics Admin overview and specialized report workspaces, then perform owner review and live provider/browser verification.

The exact implemented and remaining capability map is in `docs/domains/analytics/production-completion.md`.
