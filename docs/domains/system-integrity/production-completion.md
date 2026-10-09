# System Integrity Backend Completion

## Responsibility and ownership

System Integrity coordinates read-only detection, durable scan execution, finding lifecycle, and allow-listed recovery. It does not own Orders, Inventory, Payments, Finance, Delivery, Customers, Media, Notifications, Analytics, Reviews, Supply, Assets, or IAM business truth.

Repairs call domain-owned rebuild operations. The module does not create balancing Finance entries, stock movements, Refunds, Customer merges, courier bookings, permission grants, or external delivery retries.

## Architecture

The backend flow is:

`typed check catalog -> queued run -> leased Worker execution -> per-check outcome -> deduplicated finding -> investigation -> read-only repair preview -> authorized/idempotent domain repair -> targeted verification run -> resolution or actionable failure`

Operational health remains separate. Worker dead letters, outbox dead letters, and unknown provider outcomes are consumed as evidence, but the Integrity module does not replace Worker, outbox, integration, audit, or observability ownership.

## Durable records

- `platform.integrity_runs`: trigger, scope, selection, lease, coverage, progress, totals, and honest `SUCCEEDED`/`PARTIAL`/`FAILED`/`INTERRUPTED` outcome.
- `platform.integrity_run_checks`: versioned per-check execution, duration, inspected-record count, finding count, and safe failure details.
- `platform.integrity_issues`: tenant-scoped fingerprint, check version, category, severity, confidence, entity reference, lifecycle, recurrence, evidence, and optimistic version.
- `platform.integrity_finding_events`: append-only detection, recurrence, reopen, lifecycle, repair, and verified-resolution timeline.
- `platform.integrity_repair_runs`: idempotent request identity, immutable preview, execution result, and verification-run link.

The baseline has indexes for active-scope concurrency, Worker claims and expired leases, run history, finding worklists, entity lookup, finding history, and repair history.

## Check catalog

| Check | Coverage | Schedule | Repair |
| --- | --- | --- | --- |
| `inventory.core` v2 | condition/level rollups, movement ledger, Reservations, terminal Order ownership, allocations, Transfers, Stocktakes | nightly | diagnosis only |
| `costing.core` v2 | landed-cost allocation, layers/positions, outbound assignments, COGS provenance | nightly | diagnosis only |
| `returns.core` v1 | authorization, receipt posting, returned-cost provenance, COGS recovery | nightly | diagnosis only |
| `finance.core` v2 | Account currency, balanced Transfers, Expense payment limits, COD Settlement entries/allocations | nightly | diagnosis only |
| `payments.core` v1 | Payment and Refund allocation totals | frequent | diagnosis only |
| `commerce.relationships` v1 | tenant-safe Order/Customer links, Fulfillment quantities, Delivery/Fulfillment Order identity | nightly | diagnosis only |
| `reviews.projection` v2 | active Review uniqueness and Product rating drift | nightly | rating projection rebuild for an identified Product |
| `notifications.integrations` v1 | template provenance, duplicate success, webhook evidence, provider status, tenant mappings | frequent | diagnosis only |
| `analytics.projection` v1 | Orders, Refunds, Customers, Costing, and Analytics projection agreement | nightly | Organization Analytics rebuild |
| `platform.recovery` v1 | Worker/outbox dead letters and unknown external outcomes | frequent | domain recovery only; no automatic replay |
| `supply.assets.provenance` v1 | Purchase allocation, Receipt limits, and Asset Purchase provenance | nightly | diagnosis only |
| `media.metadata` v1 | READY/current-object consistency and stale processing state | nightly | diagnosis only |

Check implementations use bounded aggregate queries and return only diagnostic identifiers and minimal evidence. The current domain verifiers remain authoritative and reusable.

## API

All endpoints require an active Organization context. Reads require `admin.integrity.view`, scan commands require `admin.integrity.run`, and repair commands require `admin.integrity.repair`.

- `GET /admin/integrity/checks`
- `GET /admin/integrity?page=&pageSize=&status=&severity=&module=`
- `GET /admin/integrity/findings/:findingId`
- `PATCH /admin/integrity/findings/:findingId`
- `GET /admin/integrity/runs?page=&pageSize=`
- `GET /admin/integrity/runs/:runId`
- `POST /admin/integrity/runs`
- `POST /admin/integrity/findings/:findingId/repair-preview`
- `POST /admin/integrity/findings/:findingId/repairs` with `Idempotency-Key`

Collections are server-paginated. Mutations validate at the HTTP boundary, use structured error envelopes, and reject stale finding versions.

## Worker and scheduling

The existing PostgreSQL-backed Worker queues frequent lightweight scans and nightly moderate/heavy scans. Active equivalent scopes are deduplicated. Runs use `SKIP LOCKED`, a renewable lease, and bounded concurrency. Expired run leases become `INTERRUPTED`; findings from failed checks are not auto-resolved.

Scheduled buckets are deterministic, so multiple Workers cannot create duplicate hourly/nightly scans. Manual and targeted scans are separately concurrency-protected.

## Finding semantics

Severity, confidence, lifecycle status, and check execution status are independent. A clean check resolves only findings owned by that successfully completed check. A failed check makes the run partial or failed and preserves existing findings.

Fingerprints keep one coherent finding across scans. Recurrence increments a counter and appends history. A resolved discrepancy detected again is reopened. Accepted findings require an explicit reason and remain visible as historical evidence.

## Repair safety

Repair preview performs no writes. It explains the target, effect, risk, preconditions, and verification strategy.

Execution requires an allow-listed repair key, current finding version, capability authorization, and stable idempotency key. Only Analytics and per-Product Review rating projections are currently repairable. After the domain rebuild, the owning check runs again. The finding resolves only when the discrepancy is absent; otherwise the repair remains verification-failed and the finding stays actionable.

## Alerts and privacy

A newly detected Critical finding emits one generic outbox event. The central Notification catalog sends it only to staff with `admin.integrity.view`. The alert contains the finding identifier, owning domain, and severity; detailed evidence stays behind the tenant- and capability-scoped Integrity API.

## Frontend readiness

| Backend capability | Future Admin surface |
| --- | --- |
| catalog and schedule metadata | Available Checks / Integrity Settings |
| run summary and per-check outcomes | Dashboard / Scan History / Coverage |
| paginated findings and filters | Findings worklist |
| finding evidence, entity link, and timeline | Finding Detail / Investigation |
| read-only preview | Repair Confirmation |
| idempotent repair and verification link | Recovery Timeline |
| partial/failed/interrupted status | Integrity Operations |

The existing Admin page remains a minimal backend consumer. A separate frontend pass should compose the complete workspaces above.

## Verification and remaining boundaries

Complete in this checkpoint:

- durable execution, coverage, history, deduplication, lifecycle, worker recovery, safe projection repair, audit, generic critical alerts, tenant-scoped APIs, and the catalog listed above;
- clean-database migration and local Docker rebuild;
- focused concurrency, tenant isolation, recurrence, resolution, failure-coverage, and notification regression tests.

Partial:

- Catalog/Customer coverage is currently relationship-oriented rather than an exhaustive domain catalog;
- Media verifies database metadata and stuck processing, but physical object existence needs the configured storage adapter;
- scheduled checks use code-owned frequency classes; an Admin-editable schedule/settings contract is not yet implemented;
- targeted entity scope is represented in the catalog but current execution is Organization/module scoped except for repair verification.

Missing before an honest production-complete claim:

- exhaustive check implementations for every invariant in the System Integrity brief, including schema-version compatibility, Audit-chain checks, Customer merge aliases, full courier/COD timing policy, Search freshness, backup age, and runtime configuration drift;
- persisted incremental checkpoints for multi-million-row scans;
- a storage-adapter object-existence scanner;
- complete Admin dashboard, check catalog, run detail, finding detail, investigation, suppression, schedule, and repair UI;
- load/long-run evidence and owner operational review.

Intentionally unsupported:

- arbitrary SQL repair, automatic money/stock/customer/access corrections, automatic replay of unknown external outcomes, historical-record deletion, and production restore controls.
