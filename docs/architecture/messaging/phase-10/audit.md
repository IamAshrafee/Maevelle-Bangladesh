# Phase 10 assurance — in progress

Date: 2026-10-23. Verdict: **NO-GO**. This is an interim evidence record, not completion of the requested audit. Unverified gates are not passes.

## Environment and migration

The checkout started clean on `main` at `f72d8d4`, ahead of origin by five commits. Node 24.18.0 and pnpm 11.19.0 were available. A PostgreSQL 18 container exposed localhost port 5434; existing `maevelle_dev` and `maevelle_test` databases were not reset or used for mutation. An independently named database `maevelle_phase10_audit_20261023` was created on that container and the complete current baseline migrated successfully. It contains synthetic test records and is retained for follow-up. No live Meta asset or production service was accessed or changed.

Migration 3200 was modified repeatedly across messaging phases, while migration tracking is name-based. A fresh install does not establish that any existing database with 3200 already recorded can be upgraded. Inventory the actual target schema and migration history without exposing data, and develop and test a forward reconciliation migration against a representative copy before any persistent deployment. No existing-installation upgrade or verified backup/restore was tested.

## Evidence matrix

| Requirement | Method and result | Status |
|---|---|---|
| Fresh baseline | Migrated the isolated empty audit database through 3200 | PASS for fresh schema only |
| Existing installation | Mutable baseline observed in Git history; target schema unknown | BLOCKED |
| Canonical messaging | Database suite: sequencing, deduplication, tenant scope, claims, operations, channel reply windows | PARTIAL: 15 tests passed; not exhaustive |
| Lease recovery | Reproduced retry/sent contradiction and verified new stale-worker regression | FIXED for tested race; recovery workflow remains incomplete |
| Website | Six database and three API tests, plus chat model/component tests | PARTIAL; actual browser-to-worker end-to-end not verified |
| Admin | Three API authorization/SSE tests and three Instagram UI logic tests | PARTIAL; real operator flows and responsive accessibility not verified |
| Facebook/Instagram | Seven Meta core tests, one HMAC test and database provider policy cases | PARTIAL; live authorization, provider contracts and messages not verified |
| SSE | Existing expired cursor and visitor isolation tests | PARTIAL; disconnect/replay and multi-tab integration not verified |
| Media | Existing database and API visitor upload tests | PARTIAL; full storage pipeline and unauthorized variants not verified |
| Reliability | Lease race reproduced and fixed; website adapter test | FAIL / incomplete; operator reconciliation, events, crashes and provider recovery remain unverified |
| Performance | No representative load or resource measurement | NOT TESTED |
| Security | Tracked secret scan and selected authorization/HMAC tests passed | PARTIAL; comprehensive threat review not performed |
| Business acceptance / Meta approval | No owner acceptance, approval evidence, credentials or public callback tested | EXTERNALLY DEPENDENT |

Read-only orphan check in the synthetic audit database found zero messages without their tenant-qualified conversation. This is not evidence about any other database.

## Defect register

**P1 — ambiguous delivery recovery and stale worker state.** Expired processing leases were retried even though an external provider might have accepted the message. A stale worker could then write message state even when its intent update matched no row; the regression reproduced `RETRY_WAIT` paired with `SENT`. Expired leases and unexpected adapter exceptions now require reconciliation, and completion updates are fenced by attempt number and require a successful intent update before modifying the message. The focused test exercises a late successful adapter result after reclamation. This avoids automatic duplicate sends but does not establish a complete operator resolution process.

**Open reliability gap:** reclamation changes the durable state but does not publish the delivery-change realtime/outbox event in the existing implementation. Discover and implement a complete authorized, auditable reconciliation and notification workflow, and test race conditions, worker crash, late provider receipts and both Meta channels. Until then, unknown deliveries may require manual investigation and operators may not see the change promptly.

## Commands and results

- `pnpm check:architecture` and `pnpm check:secrets`: passed; secret scan checks tracked patterns only.
- `pnpm typecheck`: passed after the fix.
- `pnpm exec eslint packages/database/src/messaging/index.ts packages/database/src/messaging.test.ts`: passed after the fix.
- Focused provider, worker adapter, Storefront chat and Admin Instagram tests: 7 files, 38 passed before the fix.
- Isolated database and API messaging tests: 4 files, 26 passed before the fix.
- The same isolated database and API messaging suites: 4 files, 27 passed after the fix, including the new regression. The regression was first run against the original implementation and failed with the contradictory states above.

## Release and Phase 11 handoff

Do not deploy: existing-schema migration safety, critical workflows, security, reliability, performance, usability and operational acceptance have not been established. Before production preparation, inventory the actual target and produce a data-preserving forward migration; verify an off-server backup and restore; validate secrets and encryption keys, worker topology, private media, HTTPS callbacks and SSE proxy settings; then verify API, worker, Admin and Storefront health and rollback procedures. Owner-controlled Meta App Review, permission and business verification, authorized Page/Instagram assets, webhook subscriptions, coexistence/routing review and controlled test-recipient verification are external gates. Do not modify live routing, assets or customer conversations as part of this audit.

## Resume

Complete architecture and contract review against all phase records; inventory isolated services and storage; exercise website/admin end-to-end, cross-channel tenant/capability isolation, OAuth/webhook security, media, SSE and worker failure recovery; implement and retest complete reconciliation; run representative performance and responsive accessibility checks; produce the requested full matrix, readiness gates and deployment handoff. Treat this document as interim, not evidence that those tasks passed.
