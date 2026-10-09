# Current Focus

## Active area

Analytics — external destinations, complete Storefront event emission, advanced domain metrics, and later Admin reporting workspace.

## Evidence state

`DURABLE REPORTING AND INGESTION FOUNDATION COMPLETE / EXTERNAL DESTINATIONS AND FULL EVENT EMISSION REQUIRED`

Checkpoint `d099345` replaces the narrow all-time Analytics MVP with a tenant-scoped reporting and measurement foundation. Transactional domains remain authoritative; Analytics owns only rebuildable projections, normalized consented observations, report contracts, freshness metadata, and exports.

Implemented evidence includes canonical separation of merchandise gross, applied discount, customer delivery charge, Order total, completed Refunds, confirmed Payments, Finance account movement, COGS, and margin; historical sale snapshots; batch-coalesced outbox projection rebuilds; consent-aware session/event ingestion and UTM attribution; 15 bounded report families with timezone boundaries and prior-period comparisons; restricted financial capabilities; and leased audited CSV exports.

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
