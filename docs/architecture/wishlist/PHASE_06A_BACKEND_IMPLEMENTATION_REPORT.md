# Phase 06A — Wishlist analytics backend implementation

Date: 2026-11-01, Asia/Dhaka. **Backend implemented and locally verified; full production acceptance remains PARTIAL.** This report does not close earlier Wishlist browser/security gates. Phase 06B and Phase 07 were not started.

## A. Executive Summary

Implemented account interest, committed Wishlist/share activity, consented observation ingestion, protected Admin reporting, bounded outbox projection, failure backoff, expiration processing, retention, and operational counters. Reused PostgreSQL/Kysely, transactional outbox, analytics receipts/projection state, existing behavioral tables/consent, Admin IAM, and Worker recovery tick. No vendor, queue service, database engine, or dependency was introduced.

Local evidence: 47 tests across seven focused files passed; another 16 existing analytics/API tests passed. Four package typechecks, Database/API/Worker compilation, targeted ESLint, migration guard and whitespace checks passed. See R–T for exact commands and qualifications. Local performance exposed and corrected a per-event processing bottleneck. Recipient attribution and complete guest inventory are explicitly unavailable, rather than inferred.

## B. Repository Audit

Branch: `main`. At entry, tracked and untracked Phase 00–05 Wishlist/auth/sharing work was present alongside Storefront visual work and stockout-interest notes. It was preserved. No stash, reset, clean, commit, deployment, or persistent migration occurred.

Read root instructions (no applicable backend nested AGENTS found), engineering standards, product-completion state/focus, prior Wishlist reports, database/migration conventions, analytics architecture, CRM privacy map, current outbox/Worker/auth/consent code and tests. Source outranks historical claims. Prior focus text forbidding Phase 06 was superseded by the owner's explicit assignment.

Existing infrastructure: analytics schema has metric definitions, business facts, behavioral sessions/events, projection receipts/state and exports. `processAnalyticsOutbox` selects known business-domain prefixes and previously rebuilt their projections; Wishlist now uses a separate consumer within that existing entry point. Existing business consumer receipt/rebuild behavior was preserved. Outbox IDs are stable bigint identities; existing projection receipts support at-least-once selection with uniqueness. New Wishlist facts and receipts commit in the same transaction, closing the crash window for this projection. Existing sharing emits audit creation/claim/rotation; new minimal outcome events cover transitions without querying audit metadata as analytical truth.

IAM defines `analytics.view`, `analytics.manage`, financial view and export capabilities. Wishlist reports require only `analytics.view`. Shopper authentication is a distinct Better Auth realm. Existing privacy deletion purges account lists/shares; new outcome data has no owner/customer/session linkage. Existing behavioral policy accepts self-reported consent, not independently authenticated consent. No complete approved production retention schedule exists in the repository; durations below are explicit operational defaults requiring policy review.

## C. Scope Confirmation

No Admin or Storefront frontend implementation was performed. Existing React, CSS, Tailwind, fonts, design tokens, page/drawer/sharing UI, Cart and Checkout were untouched by this assignment. Dirty frontend files shown by Git predate this work. No browser producers were added.

## D. Analytics Architecture

1. Current state: authoritative `wishlist.account_lists`, `account_items`, `shares`, canonical catalog primary category and existing search availability projection.
2. Committed outcomes: the command transaction writes version-1 events to `platform.outbox_events`; Worker projects minimal fields to `analytics.wishlist_outcomes` and writes `analytics.projection_event_receipts` named `wishlist_v1` atomically. There are no customer/list/share IDs in new analytical payloads. Aggregate IDs are independent random UUIDs, not owner identifiers.
3. Observations: existing `analytics.storefront_events`/`storefront_sessions`, strict Wishlist vocabulary, existing analytics consent, stable client IDs. These remain unverified observations.

Reporting executes SQL aggregates inside repeatable-read transactions. No raw event browsing or exports were introduced. Daily operational counters are bounded by an allowlist of operations/outcomes; they are best effort after the HTTP response.

## E. Metric Dictionary

The complete dictionary is [PHASE_06A_METRIC_DICTIONARY.md](PHASE_06A_METRIC_DICTIONARY.md). Its shared rules specify tenant scope, formula, grain, timezone/range, population, consent, history completeness, deduplication and retention. It covers current counts, availability, product/category interest, save/remove/net/merge activity, sharing origin/scope/size/lifecycle, observed interactions, HTTP outcomes/duration, processing backlog and cleanup backlog.

Current state ignores historical filters. Account lists include persisted empty lists; nonempty lists are separate. Save activity includes new merge insertions; `mergeAdditions` is a subset, not an additional total. Privacy deletion and catalog cascade are excluded from removal activity. Rankings are current-interest cohorts, so a product with no current saves is absent even if historical activity exists. Historical category columns deliberately use the current primary category. Unclassified legacy and old-client guest creation scope remains UNKNOWN.

## F. Event Inventory and Contracts

Shared vocabulary and DTOs: `packages/contracts/src/wishlist-analytics.ts`.

| Event | Exact payload | Trigger |
| --- | --- | --- |
| `wishlist.item.saved` | productId UUID, source MANUAL/MERGE | New account item inserted |
| `wishlist.item.removed` | productId UUID | Existing item explicitly removed |
| `wishlist.merge.completed` | empty object | New merge receipt committed |
| `wishlist.share.created` | origin GUEST/ACCOUNT, scope ALL/SELECTED/UNKNOWN, size 1–100 | New snapshot committed |
| `wishlist.share.claimed` | empty object | Ownership transfer committed |
| `wishlist.share.revoked` | empty object | First revoke committed |
| `wishlist.share.expiry_changed` | empty object | Desired expiry actually changed |
| `wishlist.share.link_rotated` | empty object | Version-checked rotation committed |
| `wishlist.share.expired` | empty object | Server expiration observed, occurred_at=expires_at |

All event_version=1, organization from trusted domain context, stable outbox ID, no behavioral consent requirement. Worker validates event version, exact key set and scalar types. Unknown versions/payloads remain pending with bounded backoff and failure diagnostics. No arbitrary JSON event endpoint can submit these authoritative outcomes.

## G. Wishlist Domain Instrumentation

Account list row locks serialize mutations. Existing PUT no-op returns before producing an event; preference-only changes do not emit saved. DELETE emits only after RETURNING confirms actual deletion. Merge additions each emit one MERGE save; preference fills do not. One successful new merge emits completed even with zero additions. Receipt replay exits first. Outbox insertion uses the same transaction as items, list version and merge receipt. A failed transaction emits no successful outcome. There are no external analytics calls in commands.

## H. Sharing Domain Instrumentation

Creation receipts are checked before insertion; replays do not emit created. Creation stores immutable scope and size event metadata. Account scope comes from the server selection command. Guest `creationScope` is an optional, validated additive request attribute representing requested intent; it does not prove completeness of a browser list. Existing clients omit it and remain UNKNOWN. It participates in the creation fingerprint only when supplied, preserving older fingerprint behavior.

Claim replay emits no additional claim. Rotation emits a separate outcome, never created. Guest/account management now lock, update, compare version and emit in one transaction; repeated revoke or identical expiry emits nothing. Expiry uses the original server timestamp, including after Worker interruption. Expirations before instrumentation are marked for cleanup without fabricated historical outcomes. An expired share later revoked can still emit expiration. A share revoked before expiration does not. Purge waits until required expiration processing, preserving history after credential/snapshot deletion.

## I. Guest and Recipient Analytics

No authoritative guest-list population exists. Guest save/remove observations and recipient initiation/view observations are consented, incomplete and forgeable. Public open counters are HTTP requests, including bots and retries; successful responses are validated opens, not humans. Global account saves are authoritative, but no verified share attribution is claimed.

Qualified recipients, unique visitors, share-attributed successful/already-saved/failed/unresolved saves, and per-share conversion are explicitly unavailable. No attribution token or arbitrary share ID is accepted. No account-switching identity is attached to observations. Phase 06B must preserve these limitations.

## J. Database Schema and Migrations

New forward-only `3212_wishlist_analytics.ts`, registered after 3211. No prior migration was edited.

- `analytics.wishlist_instrumentation`: singleton deployment start timestamp; no historical reconstruction.
- `analytics.wishlist_outcomes`: outbox PK/FK, organization FK, version/name checks, typed minimal columns, bounded snapshot size, event and processing time.
- `analytics.wishlist_processing_failures`: outbox PK/FK with cascade, organization FK, attempt count, retry time and last failure; no error payload/credential storage.
- `analytics.wishlist_operations`: tenant/local-day/allowlisted-operation/outcome PK, nonnegative count/duration.
- Sharing: immutable application-written creation_scope, default UNKNOWN; expiration marker.
- Indexes: organization/product interest, pending expiration, Wishlist outbox identity, organization/time/name and product/time facts, fact retention, failure organization, observation retention.
- Existing behavioral name CHECK expanded additively; legacy event names preserved.

Fresh chain/rerun and populated 3211 upgrade passed on PostgreSQL 18.6. A 3212 upgrade case is registered and executed by the focused suite. The older generic upgrade harness still lacks pre-existing 3207–3211 cases; full generic upgrade CI closure remains open. Do not mislabel the focused upgrade as that full harness.

Deployment order when separately authorized: backup/verify ledger, run 3212 once, deploy compatible API and Worker, then later frontend. Old code ignores additive columns; old API/Worker remain schema-compatible but do not generate/process new activity. Migration timestamp may precede actual new API rollout: release verification must account for that instrumentation gap. Image rollback does not reverse schema. Forward repair or verified backup restore remains the recovery path. No deployment or restore was performed.

## K. Aggregation Engine

All reads predicate organization. Summary uses one item-grain join to product and search projection. Products aggregate items and outcomes before joining; categories separately aggregate current lists and activity to primary category, preventing multiplication. SQL performs counts/averages and daily bucketing; Node receives bounded aggregates only. Materialized intermediate CTEs avoid repeated activity aggregation. Rankings order saved descending then stable UUID; categories put null last. Server pagination: page 1–1000, pageSize 1–100, default 25, one extra row for hasMore. No arbitrary sort/filter input. Page movement observes a fresh snapshot and can change as saves change; no frozen ranking snapshot is promised.

Current rankings require three distinct current account lists; historical per-product/category cells of 1–2 return null. Global summary/trends remain coarse whole-organization aggregates. No owner filters, identities, raw memberships or small-cohort drilldown exist. Suppression is a minimization measure, not a formal differential-privacy guarantee.

## L. Worker and Outbox

Existing Worker calls `processAnalyticsOutbox`; it now also projects at most 100 Wishlist rows and runs bounded analytics retention. Direct consumer accepts 1–1000. `FOR UPDATE SKIP LOCKED` supports concurrent consumers; fact and receipt uniqueness protect retries. Valid batch facts, receipts, failure removal and projection timestamps commit together. A malformed event gets 30-second retry delay increasing linearly to a one-hour cap; other rows in the batch proceed. Failures retain the original event; reporting shows FAILED while failure rows exist. Interrupted database transactions roll back completely. Existing Worker failure logging and shutdown/tick ownership remain unchanged.

Existing Wishlist cleanup still handles shares, encrypted recovery receipts, tombstones and merge receipts in bounded batches. It now records qualifying expiration before purge. No external delivery or rebuild of unrelated business facts is triggered per Wishlist event. Receipts outlive retained facts, so retention cannot resurrect old metrics.

## M. Behavioral Ingestion Backend

`POST /storefront/v1/analytics/events` remains the integration endpoint. Wishlist observations are checked before schema stripping, limited to 4 KiB, and validated again at persistence. Existing non-Wishlist payload size behavior is preserved. Exact Wishlist input: schemaVersion=1, eventId UUID, name, origin=BROWSER, occurredAt ISO instant, sessionId UUID, consent, data. No other root fields. Consent: necessary=GRANTED; analytics/marketing/preferences each GRANTED/DENIED/UNKNOWN; recordedAt valid and no more than five minutes future. Analytics must be GRANTED to store observations. Denial returns accepted=false under existing policy. Event time is at most 24 hours old and five minutes future.

Data contains only mode=GUEST/ACCOUNT and optional scope=ALL/SELECTED. Scope-selected requires scope; guest save/remove names require GUEST. No product, account, share, token, URL, referrer, attribution, count or arbitrary text is permitted. Event names are listed in Y. Stable `(organization,eventId)` deduplicates retries; callers must keep the same payload and ID. Changed-payload ID collision is ignored as duplicate, not another metric. Consent is self-reported and does not authorize domain access. Existing general commerce observations were not redesigned.

## N. Admin Analytics APIs

All GET endpoints require Admin-realm session plus active tenant membership and `analytics.view`:

| Path | `data.result` |
| --- | --- |
| `/admin/analytics/wishlist/summary` | WishlistSummaryDto |
| `/admin/analytics/wishlist/activity` | WishlistTrendDto[] |
| `/admin/analytics/wishlist/products` | WishlistAnalyticsPageDto<WishlistProductInterestDto> |
| `/admin/analytics/wishlist/categories` | WishlistAnalyticsPageDto<WishlistCategoryInterestDto> |
| `/admin/analytics/wishlist/sharing` | WishlistSharingDto |
| `/admin/analytics/wishlist/operations` | WishlistOperationsDto |

Query: required `from` and inclusive `to`, real ISO dates, maximum 90 local days; optional page/pageSize bounded above. Daily only. Frontend computes 7/30/90-day presets. Unknown keys are rejected before stripping. Bad syntax/ranges return 400/422. Missing/unauthorized Admin context returns 403 under existing convention. Cross-tenant selection is rejected unless the user independently has the tenant membership/capability. Invalid organization IDs fail closed. Success: `{data:{metadata,result}}`; errors retain `{error:{code,message}}`. Runtime response schemas match shared DTOs. All reports set private, no-store; no shared cache.

Metadata includes period/exclusive end, organization timezone, generatedAt, instrumentationStart, retainedFrom, observationRetainedFrom, historyComplete, CURRENT/LAGGING/FAILED, pendingEvents, oldestPendingAt, lastProcessedAt, metric source labels, rankingMinimumLists=3 and unavailable metrics. No histories before instrumentation are manufactured. Empty zero-filled daily trends are accompanied by completeness metadata; absent sharing outcome rows mean no retained recorded events, not proof of pre-instrumentation inactivity.

## O. Operational Observability

Post-response allowlisted counters: SAVE, REMOVE, MERGE, SHARE_CREATE/OPEN/MANAGE/RECOVER/ROTATE/CLAIM; outcome SUCCESS/CLIENT_ERROR/CONFLICT/RATE_LIMITED/SERVER_ERROR; total response duration. No IP, token, path parameter, user ID or body dimension is stored. Failure to record logs only operation label and does not change a customer response. PROCESS failures have daily counters. Existing Worker logs carry cleanup counts/errors. API exposes pending count/oldest time, failure state, last processed time, expired-unreported/purgeable shares and expired merge receipts. Counters are best effort, not an authoritative audit or percentile latency system. No new alerting platform or external alert activation occurred.

## P. Privacy and Security

No new analytic owner/customer IDs, contacts, complete lists, token digests, raw tokens, recovery credentials or bearer URLs. Outcomes cannot reconstruct a named individual's list. Existing customer anonymization removes current account Wishlist/share state; minimal non-owner aggregates/outcomes remain. Existing privacy integration tests pass. Existing audit history and backup retention remain subject to separate policy; backup erasure or a legal compliance guarantee is not claimed.

Operational defaults: 400-day domain facts/counters, 90-day Wishlist observations; bounded transactional cleanup also deletes expired observations' orphan sessions only if no other events/order linkage remain. Other commerce sessions/events are preserved. Existing share 30-day post-expiry/revocation retention, 48-hour encrypted recovery, tombstone and 90-day merge-receipt rules remain. Projection receipts must remain while original outbox rows remain. The platform outbox retains minimal non-owner facts under existing platform lifecycle; no platform-wide deletion policy was silently introduced.

## Q. Performance

Synthetic disposable PostgreSQL 18.6 fixture: 2,000 products, 50 account lists, 10,000 saves, 5,000 outcomes, multiple organizations. Final measured batch projection: **204 ms** for five 1,000-row batches. Report calls: summary 19.80 ms, activity 10.43 ms, products 85.71 ms, categories 20.44 ms, sharing 11.24 ms, operations 9.32 ms. Primitive ranking EXPLAIN ANALYZE: 3.007 ms, index-only access via wishlist_interest_product, top-N heapsort, no temporary spill; heap fetches remained on fresh rows. These are one local warm-process run, not p95, throughput guarantees, production SLOs, or a complete high-share-volume benchmark. Query planner estimates on newly seeded tables were conservative; staging statistics/volume and concurrent load need verification.

Initial per-event consumer exceeded 60 seconds for the same processing workload. Batching removed repeated round trips. Initial category aggregation was also replaced with set-based category/list aggregation. No fabricated measurement or backend-to-purchase inference is used.

## R. Database Test Results

Dedicated test runtime: `codex-wishlist-06a-pg18`, `postgres:18`, tmpfs storage, loopback port 55441, synthetic user wishlist_06a, guarded maevelle_test source. Prior visual container on 55440 and stopped persistent Compose PostgreSQL on 5434 were preserved. Every new destructive test validates its target and uses uniquely named disposable databases.

Command prefix: `TEST_DATABASE_URL=postgresql://wishlist_06a@127.0.0.1:55441/maevelle_test pnpm exec vitest run`.

Final seven-file command includes:

- `packages/database/src/analytics/wishlist/wishlist-analytics.test.ts` — 11 tests.
- `packages/database/src/migrate.test.ts` — 1 test.
- `packages/database/src/wishlist/account.test.ts` — 18 tests.
- `packages/database/src/wishlist-sharing.test.ts` — 2 tests.
- API and Worker files listed below.

Total: **7 files, 47 passed**. Added 3212 upgrade-case invocation was subsequently verified in an 11-test targeted rerun. Coverage includes upgrade preservation, fresh/rerun, counts, no-ops/preferences, concurrent mutations/merge, rollback, lifecycle replay, expiration and purge, tenant isolation, suppression, range/page checks, observation validation/deduplication/retention, concurrent consumers, retained receipts and failed-version recovery.

Additional existing analytics/API run: `packages/database/src/analytics.test.ts apps/api/src/app.test.ts` — **2 files, 16 passed**, against the same dedicated disposable runtime (base test database migrated only in that new tmpfs container).

## S. API Security Test Results

`apps/api/src/wishlist-analytics.test.ts` — 4 registered-route tests, real PostgreSQL IAM membership/capability checks with a controlled authentication adapter: all endpoints denied without analytics capability, permitted with capability, cross-tenant denied, schemas/ranges/unknown filters, response metadata/cache, consent/deduplication, sensitive/unknown/spoofed inputs.

`apps/api/src/shopper-auth.test.ts` — 9 tests, real Better Auth Admin and shopper cookies, positive Analytics permission checks on all six routes, shopper denial even for an identity separately granted Admin analytics access, observed event rate limiting, prior account/share/merge/origin/limiter/privacy regressions. One test fixture initially used invalid membership status SUSPENDED; changed to schema-defined DISABLED and reran. This fixture failure did not indicate a product authorization bypass.

Existing ingestion limiter: 120 requests/IP/process/minute with Retry-After. The new Wishlist contract reuses it; distributed/global ingestion throttling is not claimed. Domain Wishlist/share limiters remain PostgreSQL-backed as before.

## T. Worker Test Results

`apps/worker/src/worker.test.ts` — 2 tests: lifecycle plus real startup tick, expiration cleanup and new Wishlist outcome projection. Concurrent projection, duplicate retry, malformed version/backoff, fact retention with permanent receipts and recovery are also exercised directly by the 11-test database suite. Process interruption is covered by transaction rollback/retry semantics, not a separate OS kill/fault-injection campaign. Existing Worker shutdown is preserved. No staging Worker was touched.

Quality commands passed: four `pnpm --filter @maevelle/{database,api,worker,contracts} exec tsc --noEmit`; Database/API package builds; Worker `exec tsc --build tsconfig.build.json --pretty false`; targeted ESLint; `node scripts/check-migration-history.mjs` (61 registered, 51 immutable baseline); `git diff --check`. Contracts has no package build script, so its build config was compiled with `pnpm exec tsc --build packages/contracts/tsconfig.build.json`.

## U. Defects Found and Fixed

- New migration parameterized multiple SQL statements: PostgreSQL rejected prepared multi-command query. Replaced evolving contract imports with frozen migration literals; fresh/upgrade tests pass.
- New daily SQL cast used bare day alias: reproduced directly on PostgreSQL; explicit AS fixes trend queries.
- New projection processed one event per transaction: 5,000-event test timed out; bounded multi-row fact/receipt writes reduce the measured work to ~0.2 seconds.
- New category ranking used correlated cohort checks: replaced with distinct-list category aggregation.
- Legacy expiry could have invented pre-instrumentation history: marker/purge retained, historical event omitted. Revoked-after-expiry and purge ordering are explicit.
- Unknown observation fields could otherwise be removed by Fastify validation: exact prevalidation now rejects them before removal, repeated at persistence.
- Existing migration assertions needed new schema/table/migration expectations; updated without changing old migration implementations.

## V. Files Created or Modified

New implementation:

- `packages/contracts/src/wishlist-analytics.ts`
- `packages/database/src/migrations/3212_wishlist_analytics.ts`
- `packages/database/src/analytics/wishlist/events.ts`
- `packages/database/src/analytics/wishlist/observations.ts`
- `packages/database/src/analytics/wishlist/operations.ts`
- `packages/database/src/analytics/wishlist/processing.ts`
- `packages/database/src/analytics/wishlist/reporting.ts`
- `packages/database/src/analytics/wishlist/wishlist-analytics.test.ts`
- `apps/api/src/routes/analytics-admin.ts`
- `apps/api/src/routes/wishlist-analytics.ts`
- `apps/api/src/routes/wishlist-analytics-schemas.ts`
- `apps/api/src/wishlist-observability.ts`
- `apps/api/src/wishlist-analytics.test.ts`

Previously clean files modified: `packages/database/src/analytics.ts`, `packages/database/src/analytics/behavioral.ts`, `packages/database/src/migrate.test.ts`, `packages/database/src/upgrade-cases.ts`, `apps/api/src/routes/analytics.ts`.

Pre-existing dirty/untracked files extended: `packages/contracts/src/index.ts`, `packages/database/src/migrations/index.ts`, `packages/database/src/wishlist/{account.ts,account.test.ts,share-lifecycle.ts}`, `apps/api/src/{app.ts,shopper-auth.test.ts,routes/wishlist.ts}`, `apps/worker/src/worker.test.ts`, `docs/product-completion/{state.json,current-focus.md}`. Existing Worker implementation calls are reused through analytics exports; this phase did not edit Worker implementation. Other dirty files, including frontend, customers, prior migrations and reports, belong to earlier work.

New documentation: this report and `PHASE_06A_METRIC_DICTIONARY.md`.

## W. Remaining Risks and Blockers

- **Critical:** none found in focused local checks; production acceptance is not established.
- **High release gates:** approved privacy/retention basis, staging schema/backup/recovery, proxy/rate-limit behavior, earlier auth/key/security/browser gates.
- **Medium:** full generic migration upgrade harness has pre-existing uncovered 3207–3211 cases; high-share-volume/million-row/concurrent-load and forced OS termination campaigns unverified; process-local behavioral ingestion limiter; no external alert activation. Current cold/fresh database planner statistics warrant monitoring.
- **Low:** ranking pagination can shift under concurrent saves; current-category attribution can reclassify historical rows after catalog changes, deliberately disclosed.
- **Unavailable by design:** complete guest inventory, unique/qualified humans, verified share-save attribution. These are never rendered as zero conversion.

## X. Phase 06A Acceptance Checklist

| Gate | Verdict |
| --- | --- |
| Audit, dictionary, typed contracts, separation of truth/observations | PASS |
| Account/domain/share transitions, no-op/replay/rollback/concurrency | PASS locally |
| Fresh migration and targeted populated upgrade | PASS |
| Complete legacy generic upgrade CI harness | PARTIAL; pre-existing missing cases |
| Current summaries, trends, rankings, categories, sharing and operations APIs | PASS locally |
| Admin IAM capability and tenant isolation, shopper-cookie denial | PASS locally |
| Minimal consented ingestion, validation, deduplication, rate rejection | PASS locally |
| Projection, concurrent retry, failure backoff, bounded retention | PASS locally |
| Privacy deletion regression, no new owner/token payloads, cohort minimization | PASS locally; legal policy approval open |
| Representative synthetic workload | PASS within measured fixture; larger/share-heavy load NOT VERIFIED |
| Existing account/share/analytics/Worker regressions | PASS for listed tests |
| Frontend/Cart/Checkout unchanged; no deploy/commit/persistent migration | PASS |
| Full production/Phase 07 acceptance | NOT VERIFIED |
| Overall Phase 06A | IMPLEMENTED, LOCALLY VERIFIED; acceptance PARTIAL pending stated gates |

## Y. Detailed Phase 06B Frontend Handoff

Use shared DTOs in `@maevelle/contracts`; six paths and auth in N. Reuse existing Admin API envelopes/error handling, IAM context and organization header selection. Authentication alone is insufficient. No financial capability is required for these nonfinancial reports. All requests use no-store. Do not expose private-list/customer drilldowns.

Use 7/30/90 inclusive local-calendar-day presets computed in metadata.timezone (normally Asia/Dhaka); custom periods have a 90-day maximum. Send from/to as ISO dates, daily granularity only. Do not derive labels from UTC midnight. Page/pageSize apply to rankings, default 25/max 100, maximum page 1000. Sorting is fixed server order, saved descending then ID; no client-only sort pretending to cover unloaded rows. No owner/product/category filter contract exists. Current counts remain current irrespective of selected dates.

Handle empty result arrays, empty/suppressed ranking cohorts, null small historical cells, zero-filled daily rows, unknown creation scope and missing share outcome names. Show completeness/instrumentation/retention/lag visibly; historyComplete=false is not an empty business population. Label current account saved rows separately from activity, merge subset, guest-created shares and observed guest actions. Source labels are returned; operations are best effort. Availability uses the existing catalog search projection. History category attribution uses today's primary category. Never label saves as purchases, orders or revenue.

Browser integration (no producers built here):

```json
{
  "schemaVersion": 1,
  "eventId": "<stable UUID per observation, reused on retry>",
  "name": "WISHLIST_COPY_SUCCEEDED",
  "origin": "BROWSER",
  "occurredAt": "<ISO instant within last 24h>",
  "sessionId": "<existing analytics session UUID>",
  "consent": {
    "necessary": "GRANTED", "analytics": "GRANTED",
    "marketing": "DENIED", "preferences": "UNKNOWN",
    "recordedAt": "<existing consent record ISO time>"
  },
  "data": { "mode": "GUEST", "scope": "SELECTED" }
}
```

Allowlisted observation names:
`WISHLIST_PAGE_VIEWED`, `WISHLIST_SHARE_OPENED`, `WISHLIST_SCOPE_SELECTED`,
`WISHLIST_COPY_ATTEMPTED`, `WISHLIST_COPY_SUCCEEDED`, `WISHLIST_NATIVE_SHARE_INVOKED`,
`WISHLIST_WHATSAPP_SELECTED`, `WISHLIST_RECIPIENT_VIEWED`, `WISHLIST_PRODUCT_OPENED`,
`WISHLIST_SAVE_ONE_INITIATED`, `WISHLIST_SAVE_ALL_INITIATED`,
`WISHLIST_GUEST_SAVE_OBSERVED`, `WISHLIST_GUEST_REMOVE_OBSERVED`.

Only `data.mode` and optional scope are permitted. Scope is required for scope-selected. Guest save/remove require GUEST. Even product-opened does not accept a product ID in this minimal contract. Recipient-viewed is an unverified observation, never qualified engagement. Mode is a self-reported population label, never proof of identity. No owner attribution follows account switching. Do not attach raw links, fragment/path/query, product membership, share ID, management token, view token, anonymousId, referrer or arbitrary attribution. Never send domain outcome names. Use the existing consent/session lifecycle and stop telemetry when consent is absent/withdrawn. Batch neither full lists nor raw histories.

202 receipt: accepted/duplicate/reason. Consent rejection returns accepted=false. Retry the same event ID and payload on uncertain outcomes within event age limits; never regenerate IDs for a retry. Do not retry 400/413/422 unchanged. Respect 429 Retry-After; 120 events/IP/process/minute. Suppress measurement errors from the customer workflow. Do not claim attempted or browser-reported guest saves are confirmed account saves. Verified successful/already-saved/failed/unresolved share-save metrics remain unavailable; do not reconstruct them from unrelated counters.

Guest share creation may now include optional `creationScope: "ALL" | "SELECTED"` in the existing create request. Persist it with the pending idempotent intent, and preserve it on retries. Account creation continues to use existing all/selected server selection. Old clients and historical records remain UNKNOWN; do not reclassify them.

Build Admin UX later with Tailwind v4, semantic tokens, existing shadcn/Base UI, page-shell, Button/forms/tables/StatusBadge, responsive touch-first layouts, explicit loading/retry/error states, tabular numeric typography and design-system lab checks. No design or UI implementation occurred here.

Recommended frontend tests: no/incorrect Analytics capability; organization switching; shopper-cookie denial; empty/suppressed data; incomplete history and Worker lag/failure; local midnight; 7/30/90/custom invalid dates; page changes during mutations; null suppressed cells; unknown guest scope; consent denied/withdrawn; retry deduplication; rate/network failure; no token/URL capture; account switching; accessibility/mobile/tablet/dark mode. Coordinate earlier Phase 04/05 browser gates separately.

## Z. Phase 07 Release Gates

Do not deploy from this report. On separate authorization, inspect persistent ledger/schema, verify backups and restoration/forward repair, close missing generic upgrade cases, apply one controlled migration, deploy compatible API/Worker with immutable identity, verify coverage start against rollout, and run focused service/API/Worker smoke tests. Check real HTTPS origins, cookies/Admin separation, tenant capability boundaries, proxy-aware abuse handling, log/referrer/token redaction, behavioral limiter topology, retention/legal notices, recovery-key custody/rotation, actual cleanup backlog and representative sustained/share-heavy load. Complete existing browser/media/accessibility/owner acceptance. The assignment-only tmpfs test container was stopped and automatically removed after verification; the pre-existing visual container and stopped persistent Compose service were left unchanged. No staging, VPS, provider, persistent volume or production secret was modified.
