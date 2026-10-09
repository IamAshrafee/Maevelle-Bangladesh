# Current Focus

## Active area

System Integrity — cross-domain coverage and complete Admin operator workflow.

## Evidence state

`DURABLE_BACKEND_FOUNDATION_COMPLETE / COVERAGE_AND_FRONTEND_COMPLETION_REQUIRED`

Checkpoint `9023006` replaces the transient on-request Integrity MVP with durable, versioned, tenant-scoped orchestration. System Integrity coordinates domain-owned verifiers and safe projection rebuilds; it does not become a second Finance, Inventory, Payments, Delivery, Customer, Notification, or Audit authority.

The backend now provides a typed 12-check catalog, scheduled/manual runs, Worker leases and recovery, per-check coverage and errors, deduplicated findings with recurrence/history, severity/confidence/lifecycle separation, read-only repair preview, idempotent repair execution, post-repair verification, audit, and generic capability-scoped critical alerts.

## Verification completed

- Rebuilt the disposable PostgreSQL volume from the edited baseline and migrated the test database cleanly.
- Affected Database, API, and Worker TypeScript compilation passed.
- Focused ESLint passed for all changed TypeScript files.
- 23 focused Integrity, Notification, and clean-migration tests passed.
- A real comprehensive scan completed all 12 checks with zero check failures on the rebuilt local database.
- Admin and Storefront production builds passed during the Docker rebuild; PostgreSQL, API, Worker, Admin, Storefront, and Caddy were running, and health-checked services reported healthy.
- Architecture check, secret scan, and `git diff --check` passed.

## Next implementation boundary

- Add the remaining high-value invariants: Customer merge aliases, Search freshness, physical Media object existence, schema/runtime configuration evidence, backup age, and deeper Delivery/COD timing.
- Add configurable schedules, true entity-targeted scans, and resumable checkpoints for very large datasets.
- Build the complete responsive Admin Integrity dashboard, check catalog, run history/detail, findings worklist/detail, investigation, accepted-risk, repair preview, and recovery timeline.
- Perform load/long-run evidence and owner operational review.

The exact completed and remaining capability map is in `docs/domains/system-integrity/production-completion.md`.
