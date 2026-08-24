# System hardening evidence

Status: repository-executable hardening complete. This is not a production SLA or external penetration-test claim.

| Category | Repository measurement | Result |
| --- | --- | --- |
| Authorization and tenancy | Domain integration tests plus Admin route authorization-boundary scan | Protected resources remain capability- and organization-scoped |
| Browser mutation security | Host/configured-origin enforcement test | Cross-origin Admin mutation rejected with `ORIGIN_REJECTED` |
| Guest credentials | Orders, Reviews, Returns, and tracking tests | Human identifiers alone do not authorize protected data |
| Upload/import | Media signature/size validation and all-or-nothing Catalog import tests | Invalid input cannot create authoritative partial records |
| XSS/static analysis | React escaping plus `check:hardening` unsafe-sink scan | No unreviewed executable HTML sink |
| SSRF/webhooks | URL, DNS, redirect, signature, retry, and dedupe tests | Private/metadata destinations and tampering rejected |
| Rate limits | Authentication, Review, guest Order, and integration buckets | Bounded with explicit 429/retry response |
| Dependency and secret scan | `check:dependencies`, `check:secrets` | No known high production dependency vulnerability or tracked credential |
| Concurrency/load | Existing PostgreSQL last-unit, FIFO, dispatch, Delivery, provider-event, and projection idempotency tests | No duplicate canonical effect in measured scenarios |
| Search performance/recovery | GIN FTS/trigram indexes and deterministic rebuild corruption test | Search projection is indexed and rebuildable without changing Catalog truth |
| Failure isolation | Email, webhook, Delivery, Fulfillment, Analytics, and search recovery tests | External/projection failure does not roll back or rewrite committed truth |
| Operations | Health/readiness plus Admin Operations and Integrity centers | Worker, outbox, notifications, integrations, and integrity are observable |
| Backup/restore | Custom-format `pg_dump` restored into isolated `maevelle_restore_waveb`; seven critical schemas verified; disposable target removed | PASS on PostgreSQL 18 local Compose environment |

External-only work remains explicit: independent penetration testing, internet-scale load testing, external monitoring delivery, remote encrypted-backup activation, provider certification, and staging operator evidence.

Database migrations remain forward-only. Application rollback must use schema-compatible images; it must never reverse a committed production migration automatically.
