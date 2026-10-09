# System Integrity Progress

## Current checkpoint

`DURABLE_BACKEND_FOUNDATION_COMPLETE / CROSS_DOMAIN_COVERAGE_AND_ADMIN_WORKSPACE_REMAIN`

System Integrity is no longer an on-request aggregation of transient verifier strings. It now has a versioned check catalog, durable runs and per-check outcomes, honest partial coverage, leased Worker execution, scheduled and manual requests, deduplicated findings, recurrence/history, conservative lifecycle controls, allow-listed repair preview/execution, post-repair verification, audit, and capability-scoped critical alerts.

The current catalog covers Inventory, Costing, Returns, Finance, Payments, Order/Fulfillment/Delivery relationships, Reviews, Notifications/Integrations, Analytics, Worker/outbox recovery, Supply/Asset provenance, and Media metadata.

## Verification

- Fresh disposable database migration passed and was safe to rerun.
- Local Docker volumes were rebuilt from the edited baseline; migration, API, Admin, Storefront, Worker, PostgreSQL, and Caddy started successfully.
- Database, API, and Worker TypeScript compilation passed.
- Admin and Storefront production builds passed during the Docker rebuild.
- 21 focused Integrity and Notification tests passed.
- Focused Integrity tests cover tenant isolation, recurrence/deduplication, verified resolution, overlapping-run rejection, and failed coverage.

## Next work

Expand the check catalog for the remaining documented invariants, add storage-adapter and Search freshness checks, make schedules configurable, add genuinely targeted entity scanners and large-run checkpoints, then build the complete Admin Integrity workspace. The exact boundary and remaining gaps are recorded in `docs/domains/system-integrity/production-completion.md`.
