# Wishlist Phase 07A — Local integrated acceptance

Date: **2026-11-02, Asia/Dhaka**. Verdict: **PARTIAL**. This report concerns the dirty working tree based on `aa290065407030e85b5b6847efd22fb437a65279`; it is not a release certificate.

## A. Executive Summary

Executed an isolated PostgreSQL 18/API/Worker/Storefront/Admin environment, real shopper and Admin browser sessions, database/API/security regressions, populated upgrades, responsive screenshots, failure injection, and bounded performance measurements. Repaired consent withdrawal, stale analytics responses, stale public fragments, calendar validation/timezones, missing-history presentation, responsive chrome, and recipient feedback.

**117 tests passed in 23 files** in the final focused serial run. Admin and Storefront production builds and backend build passed. No new or rewritten migration, deployment, automatic commit, persistent database operation, Cart/Checkout edit, or VPS access occurred.

Local acceptance remains incomplete: full assistive-technology/contrast/zoom testing, the complete browser failure/concurrency matrix, operational key rotation, natural session TTL testing, and several sharing/catalog browser lifecycle combinations remain open. Repeated email verification is provider-idempotent rather than rejected, contrary to the requested strict single-use behavior. No authentication escalation was observed from that behavior.

## B. Repository Preflight

Branch `main`; HEAD `aa290065407030e85b5b6847efd22fb437a65279` (`feat(wishlist): add account persistence, sharing, and analytics`). Initial state was **8 modified tracked files and 6 untracked files**, including the Phase 06B implementation/report. It was not clean. [Recent commits](phase07a-evidence/recent-commits.txt). [Preflight hashes](phase07a-evidence/preflight.json) preserve all 14 initial paths. The 06B report's historical clean-start statement cannot establish the current final Git state.

Preserved prior work; no reset, clean, stash, discard, stage, or commit. Next-generated `next-env.d.ts` changes returned to their original production paths through normal builds. Final path inventory is [working-tree.txt](phase07a-evidence/working-tree.txt).

Runtime: Node **24.18.0**, pnpm **11.19.0**, PostgreSQL **18.6**, Next **16.4.2**, React **19.2.8**, Fastify **5.12.7**, Better Auth **1.7.12**, Kysely **0.29.5**. No dependencies were installed or upgraded. Root/nested instructions, design, security/privacy, deployment/migration guidance, prior Wishlist reports and current product tracking informed the audit; current source/tests take precedence over historical completion claims.

## C. Acceptance Register

The consolidated [62-entry acceptance register](PHASE_07A_ACCEPTANCE_REGISTER.csv) contains requirement, originating phase, severity, previous evidence, missing evidence, procedure, actual result, defect/risk reference and final status. Grouped requirements retain explicit missing subcases rather than implying a whole matrix passed.

| Status | Entries |
|---|---:|
| PASS | 33 |
| PARTIAL | 22 |
| FAIL | 1 |
| NOT VERIFIED | 3 |
| BLOCKED | 3 |

PASS describes the stated tested layer/case; it does not silently promote a database test into browser acceptance. BLOCKED entries are key rotation and separately authorized operational/governance gates, not a request for deployment permission.

## D. Local Test Environment

Created assignment-owned `codex-wishlist-07a-pg18`: `postgres:18` (18.6), `--rm`, tmpfs `/var/lib/postgresql`, loopback **55442**, synthetic role `wishlist_07a`, databases `maevelle_test` and `maevelle_ui_07a`. Test files created/dropped uniquely named databases only on this server. Guarded helpers reject another hostname, port or UI database name. No persistent volumes were deleted.

API **127.0.0.1:3002**, Storefront **3000**, Admin **3001**, actual Worker at 5-second tick. Browser hostname `wishlist-07a.localhost` isolated storage from old localhost experiments. Email was delivered only to a local `@example.test` JSONL sink. No Resend/SMS/provider delivery was enabled. Secrets and synthetic passwords are generated outside Git in mode-0600 `/tmp/maevelle-phase07a/runtime.json`; helpers do not load developer `.env` credentials.

Fixtures: two organizations (Asia/Dhaka and UTC); verified A/B, two cohort shoppers, authorized/unauthorized/other-organization analysts; 108 published products plus restricted fixtures; multi-variant Pearl Hair Clip; OOS scarf; long product title; 28 added categories; A with 108 saves; cohort accounts with 108 each; 22 account shares; guest collections. Four existing approved-reference photo URLs were processed through the actual image pipeline into valid local public renditions and reused across synthetic catalog cards.

Existing `codex-wishlist-visual-pg18` on **55440** stayed running. The ordinary `maevellebangladesh-postgres-1` on **5434** stayed stopped. Neither was modified. Development servers were stopped only to build this assignment's apps; production builds were also locally served for final browser checks. Final cleanup is recorded below.

Reproduction helpers: `scripts/wishlist-phase07a-{config,api,worker,catalog,fixture,measure,auth-smoke}.ts`. Start a fresh positively identified disposable server, create/migrate the two databases, run catalog then fixture once, start API/Worker and the two Next apps. Fixture creation is deliberately **not idempotent**. Do not rerun against existing records or a persistent target. Set `DATABASE_URL` to the exact guarded UI URL for the catalog helper. Keep runtime files outside Git.

Initial media key failures and an incorrect test auth base URL ending in `/api` were **fixture defects**, repaired locally before acceptance evidence. The correct auth base URL is the public origin; `/shopper-auth` is appended by the realm configuration.

## E. Database and Migration Verification

Registry: **61 migrations, 51 immutable baseline migrations**, ending in `3212_wishlist_analytics`. Relevant chain:

`3207_product_recommendations` → `3208_wishlist_sharing` → `3209_account_wishlist` → `3210_wishlist_share_lifecycle` → `3211_wishlist_share_receipt_tombstones` → `3212_wishlist_analytics`.

Fresh chain passed through isolated integration databases. Populated generic upgrade now passes **10 post-baseline migrations** with representative records and a no-pending rerun. Added missing cases for 3207–3211, retaining the existing 3212 case. Fixed the harness to execute each fixture immediately before its migration, then its postcondition; running all fixtures against the baseline was invalid for dependent schemas. [Upgrade result](phase07a-evidence/upgrade.log).

DB tests protect tenant/owner/variant constraints, unique product identity, microsecond cursors, transaction rollback, merge/share replay, receipt tombstones, event deduplication, privacy deletion and bounded retention. Existing historical migration files are unchanged. The migration-history guard passed. No staging ledger or persistent schema was inspected or changed.

## F. Shopper Authentication

**API/DB-tested:** real registration and local email, unverified rejection, verification, login/session/private list, sign-out, reset, reset replay, expired verification/reset capabilities, prior-session invalidation and new-password login. Added Date-only 16-minute expiry tests without sleeping. Realm isolation, copied/renamed Admin cookies, shopper access to all six Admin endpoints, forged owner data, contact-match non-claim, Origin rejection and inactive mappings are covered.

**Loopback runtime-tested:** [auth-runtime.json](phase07a-evidence/auth-runtime.json): registration 200; unverified login 403; verification 302; login/private list 200; reset 200; reused reset 400; old session/password 401; new password 200; logout 200; logged-out list 401. This used actual API and local mailbox, not mocked principals.

**Browser-tested:** synthetic shopper A/B sign-in and signed-in account context; Admin sign-in/out and capability transitions. Registration/reset browser forms were not fully traversed. Natural 12-hour expiry/refresh and multi-process abuse limits remain partial.

**R01:** repeated verification returns 302 again. Better Auth validates the capability and treats an already-verified account idempotently; it grants no automatic session. Strict replay rejection requested by this task is **not implemented** and is a medium acceptance mismatch. Do not describe verification links as single-use. Password-reset tokens do reject reuse.

## G. Guest Wishlist

Browser-tested product-card/PDP saving, two guest products, preferred Blush variant, refreshed counts, ordinary second-tab propagation, valid catalog media and OOS presentation. Guest reference-only journal, legacy migration, duplicate/conflict convergence, failed writes and memory-only retention passed unit tests.

Simultaneous real-tab conflicts, out-of-order notifications, compaction and real quota/blocked-storage retry are **not fully browser-verified**. Unit tests are not substituted for those requested journeys.

## H. Account Wishlist and Merge

DB/API tests passed desired-state mutation, preferences, no-op idempotency, version conflicts, exact-version atomic merge, overlap/preference policy, replay receipts, explicit removal, publication/ownership validation and stable pagination. Store tests passed unknown-response quarantine, refresh recovery, merge review, owner switching and stale response rejection.

Browser A loaded first 100 then remaining items: **108 unique product links**, no load-more control left. Overlapping two-product guest merge retained 108 total. B's separate-context account received the guest merge and later confirmed account recipient writes. Pending logout/switch/timeouts and stale merge browser matrix remain partial.

## I. Private Wishlist UI

Preserved approved warm editorial desktop split/horizontal cards, pink accents, typography and mobile/tablet presentation. Actual local images loaded; no design replacement or global stylesheet expansion.

Mobile bottom navigation opened the native Wishlist dialog; body overflow became `hidden`. Escape closed it, body overflow returned to `visible`, and focus returned to `Wishlist, 108 saved products`. Keyboard heart activation and preferred variant/count consistency were observed. Full Undo, focus-trap/Back, session-error and touch matrix remain partial.

## J. Guest and Account Sharing

Browser-tested guest two-product Share All, creation, Copy feedback and management history; account server-authoritative Share All rejected 108 products with 422 and clear smaller-selection guidance. After loading all items, selecting Pearl and accessory 103 created a two-product fixed collection. Account history loaded **22** records beyond the first 20.

DB/API tests cover guest/account management, expiry, revoke, recovery, rotation, claim and retry receipts. Current browser claim, rotation/revoke, lost create/rotate responses and storage-loss combinations were not completely rerun. Prior Phase 05 evidence is retained as historical evidence, not relabeled as new Phase 07A execution.

## K. Sharing Security

DB/API tests passed wrong organization/owner, view-as-manager rejection, credential guessing limits and fail-closed limiter database failure. Independent DB transactions exercise concurrent creation, competing claims, 50-active-share boundary, full 100-product snapshots, receipt replay/tombstones and bounded cleanup. All requested opposing-operation races are not exhaustively tested.

Crypto tests passed independent 256-bit random tokens, SHA-256 lookup, HKDF-SHA256 separation and AES-256-GCM authenticated recovery bound to context. No raw management/view credentials appear in observation contracts. Private/no-store and generic noindex/no-referrer behavior are covered by source/API evidence.

**R02 — high operational/release gate:** there is one unversioned configured root. A versioned encryption key ring and bulk re-encryption are **not implemented**. A runbook is not implementation. Replacing `AUTH_ENCRYPTION_KEY` makes old recovery ciphertext unreadable; valid public view digests are independent, but management recovery fails. Retain the current root securely, identify every consumer (including auth storage), and implement/test versioned decryption and re-encryption or an explicitly accepted invalidate/rotate recovery procedure before a key-changing release. Never trial this on real keys. Local crypto correctness does not close key custody/rotation readiness.

## L. Recipient Experience

A separate Chrome context opened the guest collection with current title/price/photos, variant-aware saves and OOS labels. Guest Save One and Save All confirmed **1 new, 1 existing, 0 failures**. Authenticated B removed its two synthetic saves, then Save One confirmed account persistence and production-build Save All confirmed **2 saved to account, 0 unable to submit**. A remained at 108; fixed public collection remained two products.

Reproduced same-document `#invalid` retaining the old collection. A fragment-subscribed keyed lifecycle now clears old state, aborts old fetches and follows valid/invalid changes. Browser regression passed. Already-saved account Save All no longer claims browser storage.

Expired/revoked/rotated/restricted/empty public states have DB/API coverage but not the complete current browser matrix. Partial save/network/owner-switch browser cases remain unverified; initiated telemetry is never conversion evidence.

## M. Analytics Backend

All six actual endpoints were exercised: summary, activity, products, categories, sharing and operations. At the measurement snapshot, API and independent SQL both returned **326 saved items, 108 distinct products, 4 nonempty lists**. Summary availability: 10 available, 316 OOS, 0 unavailable. Later synthetic auth/mutation checks may change fixture totals; the timestamped measurement remains a snapshot.

DB tests passed event production/no-op suppression, merge/share replay suppression, lifecycle events, authoritative expiration time, rollback, concurrent projection/deduplication, retention and privacy cleanup. Source semantics distinguish current authoritative holdings, committed outbox activity, consented unverified observations and best-effort operations. No historical backfill was invented.

## N. Admin Analytics

**Real browser-tested against local API:** authorized analyst, six reports, real KPI truth, chart/table switch, product and category page 2, partial-history warning, actual zeros, injected summary 503 and Retry, >90-day warning, unauthorized analyst and other-organization sign-out/login. Other organization rendered zero KPIs and UTC rather than old Maevelle data.

Reproduced filter race: delayed 7-day summary (2500ms) arrived after selecting 30 days; table incorrectly had 8 rows. Abort propagation plus post-await cancellation checks and actor/org keyed view now retain **31** rows. A regression tests transports that finish despite abort. Header Refresh now causes actual client reload: **exactly six additional report requests**. Authorization metadata now filters capability-gated navigation.

Strict dates reject February 30 and timestamp strings. Presets use the organization calendar rather than browser timezone; UTC/Dhaka midnight and leap-month tests passed. Timezone label and chart legend follow API metadata. Chart colors use semantic CSS tokens and reduced-motion preference controls animation.

The final production browser table displayed **29 “Not measured” cells** before instrumentation, instead of fabricated zeros; chart uses gaps there. Small-cohort null rendering has DB/client/component evidence, but its actual tooltip/browser journey remains open. An in-product same-user organization-selector pending-request journey was not available/tested; sign-out/login with a different organization was executed.

## O. Storefront Telemetry

Strict schema supports 13 approved event names, stable IDs, bounded retry and exact minimal mode/scope data. Unit/DB/API tests reject secret/PII/URL/extra fields and deduplicate event IDs. Real browser events were absent through initial unknown/denied consent; granted page-view, sharing-open and scope selection appeared in the safe local ingestion log. [Sanitized shapes](phase07a-evidence/observation-shapes.json).

Fixed a high consent defect: retry reused earlier granted consent after withdrawal. Each attempt now rechecks consent, active requests abort on consent changes, and construction/network errors resolve without blocking shopping. Added withdrawal-between-attempts and crypto failure regressions. Resolving/expired account modes no longer emit a private-page view as guest; recipient view waits for resolved mode.

All 13 real producers, in-flight multi-tab withdrawal, denied clipboard, native share cancellation and WhatsApp selection were not all executed. No message was sent to WhatsApp. No confirmed save attribution, unique-human recipients or conversion rate is claimed.

## P. Worker and Retention

Actual local Worker ran and projected fixture/browser outbox events. DB/Worker tests exercise concurrent projection, retry/deduplication, retained event receipts, expired observations/orphan-session cleanup, share expiration, receipt/tombstone cleanup and privacy deletion. Lag metadata and failed retry cases are DB-tested.

OS termination during an in-flight Worker batch/retention and an actual browser backlog warning were not executed. Those operational cases remain partial. Retention durations in code are technical defaults, not legal approval.

## Q. Accessibility

**Accessibility/browser-tested subset:** AX/DOM names, keyboard heart activation, date-control labels, real chart table alternative/table headers, drawer close focus, Escape and scroll lock. The timezone tooltip trigger is now keyboard-focusable. Existing button/table/dialog primitives were retained.

**Not verified:** complete keyboard-only journey, every trap/restoration path, VoiceOver/NVDA announcements, measured contrast, 200% zoom, OS reduced motion and full dark-theme review. Semantic markup and successful compilation are not accessibility conformance. These are significant open acceptance gates.

## R. Responsive Design

Actual `innerWidth` and document scroll width matched at **320, 375, 430, 768, 1024, 1440** for both private Wishlist and Admin after repair. Admin had 340px page overflow at 320px because the fixed search group pushed the user menu outside the viewport; shrinkable/min-width-zero search and fixed action group repaired it. Tables/nav keep intentional internal scrolling.

[Dimension evidence](phase07a-evidence/responsive.json). Screenshots under the local artifact directory `/Users/ashrafee/.codex/visualizations/2026/11/01/01a19750-8ce8-7d83-8ee5-81d0738a9f5c/phase07a/`: `wishlist-{width}.jpg`, `admin-{width}.jpg`, `wishlist-drawer-375.jpg`, `recipient-account.jpg`, `admin-other-organization.jpg`, `admin-invalid-range.jpg`, `admin-final-production.jpg`. The first invalid viewport attempt affected only the newest tab; it was discarded and repeated in a dedicated tab with actual inner-width assertions. Broken-image fixture captures were replaced after media repair.

[Drawer screenshot](</Users/ashrafee/.codex/visualizations/2026/11/01/01a19750-8ce8-7d83-8ee5-81d0738a9f5c/phase07a/wishlist-drawer-375.jpg>) · [Final production Admin screenshot](</Users/ashrafee/.codex/visualizations/2026/11/01/01a19750-8ce8-7d83-8ee5-81d0738a9f5c/phase07a/admin-final-production.jpg>).

Visual inspection confirmed editorial horizontal cards, warm surfaces and pink actions; Admin retains teal tokens/shared KPI/table patterns. These are synthetic fixtures, not real customer/catalog data. Owner design approval remains distinct.

## S. Failure Injection

Guarded local API helper reads a temporary fault specification and injects only exact-route status/delay failures; it never fabricates successful data. Exercised summary **503 → visible error → Retry → recovery**, and delayed stale-filter response. Fault file was cleared afterwards.

Unit/API/DB tests cover 401/403/409/422/429, unavailable limiter DB, unknown mutation result, failed storage, stale owners, replay and projection failures. The **complete actual-browser** offline/timeout/lost response, all HTTP statuses, denied storage/sessionStorage/clipboard and native cancellation matrix was not executed.

An overlapping build/test run timed out the long multi-step auth test at 5 seconds, then caused two dependent failures (112 pass/3 fail). Preserved that failed run. The specific multi-step auth test now has a 15-second allowance; with builds completed, serial rerun passed 115, and final run passed 117. No endpoint success assertion was weakened.

## T. Performance

Measured sequential warm loopback HTTP, **20 samples per endpoint**, including response body parsing, on the synthetic UI database:

| Endpoint | p50 ms | p95 ms |
|---|---:|---:|
| Summary | 9.28 | 38.77 |
| Activity | 7.92 | 20.27 |
| Products | 8.69 | 9.43 |
| Categories | 8.76 | 11.91 |
| Sharing | 9.90 | 20.48 |
| Operations | 7.30 | 8.28 |

[Timestamped results/SQL truth](phase07a-evidence/performance.json). First measurement attempt used an incorrect observation table name and failed after sampling; only the corrected completed run is reported.

The isolated integration workload used **2,000 products, 50 lists, 10,000 saved items, 5,000 events** and query-plan evidence. The 115-test serial run processed 5,000 events in 282ms; ranking EXPLAIN execution was 2.660ms with the tenant-filtered interest index. Final-run metrics are retained in the final test log and may differ. These are bounded single-machine observations, not production capacity or SLO claims. Browser CLS, sustained mixed concurrency, heap growth, full 100-guest-item rendering and 50-share browser rendering were not performance-measured.

## U. Security and Privacy

Critical realm, owner and tenant boundaries passed the recorded DB/API tests. Shopper enrollment does not use CRM email matching. Account operations preserve transactions, versions, audit/outbox and receipt replay. Public hydration remains publication-filtered; view capability is separate from management authority. Guest data remains browser-readable and subject to XSS/browser-profile access; no new claim of encrypted guest storage is made.

Reviewed exact observation allowlists, private cache behavior, public metadata, capability digests and encrypted recovery. Local API observation log is isolated and records synthetic validated bodies only; production telemetry contains no tokens, URL fragments, management credentials or private arrays. Secret guard passed after synthetic helper passwords were moved out of source into generated runtime configuration. This is a focused source/security audit, not an external SAST certification or penetration-test certificate.

Proxy trusted-IP normalization, HTTPS cookie deployment behavior, production log redaction, operational key custody, legal retention approval and external provider delivery remain Phase 07B/owner gates.

## V. Defects Found and Fixed

| Ref | Severity | Failure/root cause and repair | Verification |
|---|---|---|---|
| D01 | High | Telemetry retried captured consent after withdrawal; recheck each attempt and abort on change | Failing regression then unit PASS |
| D02 | Low | Event construction could throw outside failure isolation; wrap whole operation | Crypto failure regression PASS |
| D03 | Medium | Date.parse normalized impossible dates/accepted timestamps; canonical round-trip validation | Failing regression then PASS |
| D04 | Medium | Resolving/expired Wishlist page could be labeled guest; gate observation on resolved owner | Source + telemetry regressions; full mode matrix partial |
| D05 | Medium | Generic upgrade harness ran dependent fixtures on baseline; add missing cases and migrate/assert sequentially | Populated upgrade PASS |
| D06 | Medium | Public hash read once, leaving stale collection; subscribe/key lifecycle and guard aborted completion | Real valid/invalid same-document regression PASS |
| D07 | Medium | Old analytics requests overwrote newer range; cancel six requests, guard completion, key actor/org | Real delayed race + abort regression PASS |
| D08 | Medium | Header router refresh did not invalidate client data; pass refresh generation | Real header generated six requests |
| D09 | Medium | Hex-token hsl wrappers/literal chart colors and unconditional motion | Semantic vars/reduced-motion source; actual chart/table browser; OS motion unverified |
| D10 | Medium | 320px topbar overflow; allow search group to shrink, reserve action width | Real six-width regression PASS |
| D11 | Low | No-op account Save All used guest copy; owner-specific confirmed feedback | Unit PASS; actual account save confirmed |
| D12 | Medium | Browser-local presets and hardcoded Dhaka label on UTC organization | Calendar unit cases + UTC browser label PASS |
| D13 | Medium | Zero-filled pre-instrumentation trend looked measured | Coverage helper tests + production browser29 Not measured cells |

Presentation/fetch responsibilities were separated into `use-wishlist-analytics.ts`, report loader and coverage helpers. No historical schema was edited. R01/R02/R03 are unresolved acceptance/operational requirements, not claimed fixed defects.

## W. Exact Test Results

Working directory is repository root. Set **only** the positively identified disposable target:

```sh
TEST_DATABASE_URL=postgresql://wishlist_07a@127.0.0.1:55442/maevelle_test pnpm exec vitest run packages/database/src/migrate.test.ts packages/database/src/wishlist packages/database/src/wishlist-sharing.test.ts packages/database/src/analytics/wishlist packages/database/src/analytics.test.ts apps/api/src/shopper-auth.test.ts apps/api/src/wishlist-analytics.test.ts apps/api/src/app.test.ts apps/worker/src/worker.test.ts apps/storefront/features/wishlist apps/storefront/components/commerce/wishlist-button.test.tsx apps/storefront/lib/analytics apps/admin/lib/analytics/wishlist-report-loader.test.ts apps/admin/lib/analytics/wishlist-coverage.test.ts apps/admin/lib/analytics/date-presets.test.ts apps/admin/src/wishlist-analytics.test.tsx apps/admin/src/admin-capabilities.test.tsx
```

**117 passed, 0 failed, 0 skipped; 23 files; 26.14s.** [Final log](phase07a-evidence/acceptance-final.log). Initial baseline: 106/19. Reproduction regressions intentionally failed3/19 before repairs. Intermediate corrected regression:109/19. Expiry suite:10/1. Build-overlap run:112 pass/3 fail; serial rerun115/22; final117/23. Counts are repeated runs, not additive totals. After removing unrelated formatting churn from the auth test file, the unchanged auth cases were rerun:10/10 passed, with targeted ESLint passing.

Additional commands/results:

```sh
pnpm exec tsc --build --pretty false
pnpm --filter @maevelle/database build
TEST_DATABASE_URL=postgresql://wishlist_07a@127.0.0.1:55442/maevelle_test pnpm test:migration-upgrade
pnpm --filter @maevelle/admin build
pnpm --filter @maevelle/storefront build
pnpm exec tsc --build tsconfig.build.json --pretty false
pnpm check:migrations
pnpm check:secrets
pnpm exec tsx scripts/wishlist-phase07a-auth-smoke.ts
pnpm exec tsx scripts/wishlist-phase07a-measure.ts
```

All passed in the recorded final applicable runs. Final Admin build repeated after coverage repair. Backend build includes Database/API/Worker. Targeted ESLint command and final file hashes are in [quality-results.json](phase07a-evidence/quality-results.json); lint exited0, migration guard61/51, secret guard passed, and `git diff --check` passed. No full-repository test/lint claim is made. Screenshot/browser actions are runtime evidence, not an unattended browser regression suite. Broad assistive-technology/failure matrices were not executed.

## X. Remaining Risks

**Critical:** no confirmed unresolved bypass/corruption in tested cases; pending real-browser owner-switch and failure cases still prevent full acceptance. Passing focused tests does not prove all cases safe.

**High:** unimplemented versioned key rotation/recovery; natural session TTL/multi-instance abuse gaps; incomplete browser fault/concurrency, full accessibility and operational interruption evidence; privacy/security/recovery approvals and persistent HTTPS/proxy gates.

**Medium:** provider-idempotent verification replay conflicts with strict rejection requirement; remaining claim/rotate/revoke/catalog-edge browser combinations, small-cohort browser null rendering, orientation/dark/zoom review and sustained performance characterization.

**Low:** synthetic fixture labels/photos are repetitive; no production visual/content judgment follows from them. Some early screenshots precede the final history/timezone changes; final production screenshot identifies the latest display.

## Y. Final Acceptance Matrix

| Area | Verdict | Highest evidence / limitation |
|---|---|---|
| Migration/integrity | PASS locally | Fresh/populated DB; no persistent ledger evidence |
| Auth/realm/security | PARTIAL | Real API/DB and browser sign-in; replay/TTL/browser gaps |
| Guest/account/merge | PARTIAL | Unit/DB/API and108-item browser; failure/tab matrix open |
| Sharing/security | PARTIAL | DB/API concurrency; key rotation and browser cases open |
| Recipient ordinary saves | PASS tested paths | Separate-context guest and account persistence |
| Recipient complete lifecycle | PARTIAL | Remaining invalid lifecycle/catalog/failure browser cases |
| Analytics backend | PASS tested paths | DB/API truth, outbox, suppression, retention |
| Admin integration | PARTIAL | Actual six endpoints, paging, errors, tenant switch; a11y/null gaps |
| Telemetry/consent | PARTIAL | Fixed withdrawal regression; actual subset of13 producers |
| Worker | PARTIAL | Runtime plus DB/Worker tests; OS interruption not tested |
| Responsive/design | PASS tested widths | Actual six widths/media; owner/full accessibility separate |
| Accessibility | PARTIAL | Names/table/drawer keyboard subset; full audit absent |
| Quality/build | PASS targeted |117 tests; app/backend builds, types/lint/guards |
| Overall Phase07A | **PARTIAL** | Do not mark Wishlist or production readiness complete |

## Z. Phase 07B Readiness

A concrete staging handoff is prepared. **No staging execution or release authorization is granted by this report.** Local acceptance gaps should be closed or explicitly dispositioned before publishing a staging release. Separately authorized read-only infrastructure inventory/planning can precede deployment. R02 key rotation/custody and recovery policy must be an explicit security decision; do not change the root key opportunistically.

## AA. Detailed Phase 07B Handoff

1. **Freeze reviewable source:** current base SHA is `aa290065407030e85b5b6847efd22fb437a65279`, with uncommitted06B/07A work. Review register/diff and close local gates. Only then create an explicitly requested commit and immutable release manifest. This report cannot supply a release SHA for dirty work or image digests that were never built/published.
2. **Inventory/protect shared VPS first:** identify existing application owners, rootless users/units, networks, volumes, ports, Nginx/Caddy routes and current/previous Maevelle manifests. Use the established CircleCI/GHCR/rootless Podman Quadlet/private Caddy/host Nginx topology. Do not update host OS, unrelated services, shared Nginx or unrelated applications as a routine deployment side effect.
3. **Read-only schema preflight:** inspect target hostname/environment/database identity, PostgreSQL18 version, migration ledger/checksums and current deployed release. Compare all61 registered migrations, especially3208–3212. Never infer staging schema from these tmpfs tests. Stop if unknown/modified history or incompatible state appears.
4. **Backup/recovery:** take verified database snapshot/backup and preserve media; retain diagnostics, manifest and last compatible image digests. Verify restore/forward-repair path in a separate isolated target. No automatic reset or volume deletion. A staging reset requires separate explicit authorization and recorded target safeguards.
5. **Configuration:** validate `DATABASE_URL`, pool limits, API binding, Worker tick, `BETTER_AUTH_SECRET`, `AUTH_ENCRYPTION_KEY`, **`BETTER_AUTH_URL`** public origin (the current parser's variable; historical `AUTH_BASE_URL` wording is stale), `AUTH_TRUSTED_ORIGINS`, `STOREFRONT_BASE_URL`, `STOREFRONT_ORGANIZATION_CODE`, and internal API URL. Keep roots/provider keys outside Git/images/logs. Confirm32-byte decoded encryption root and retain the existing root across ordinary compatible rollout.
6. **Shopper delivery:** configure `EMAIL_ENABLED`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, approved from/reply-to, environment and test-recipient allowlist. Validate actual verification/reset URLs through public HTTPS; callbacks return to the Storefront origin and realm uses `/shopper-auth`. A public base ending in `/api` produced incorrect routes in the local fixture. With no email sender, private shopper routes may be unavailable; do not assume activation from the UI alone.
7. **Proxy/cookies:** verify `/api/*`, `/shopper-auth`, Admin `/auth`, media paths, Next `/admin` basePath and both public origins together. Keep DB/internal service ports private. Validate trusted upstream IP handling, spoofed forwarding headers, public HTTPS origin, Secure/HttpOnly/SameSite cookies, Admin/shopper realm isolation, no-store, noindex/no-referrer and callback Origin validation. Rehearse restart without session/capability key loss.
8. **IAM:** provision invited organization-scoped operators through approved bootstrap/semantic commands. Test `analytics.view` granted, absent, disabled and other-tenant sessions. Authentication alone never grants Analytics or customer ownership. Do not use a real customer account as staging fixture.
9. **Rollout order:** publish full-SHA immutable images for affected Database migration job/API/Worker/Admin/Storefront. Pause incompatible consumers as necessary. Run migrations **once** in a controlled job, never API/Worker startup. Stop on preflight/migration failure. Deploy compatible API and Worker before enabling new Admin/Storefront contracts; keep PostgreSQL/media persistent. Verify encrypted recovery and3211 tombstones before accepting retry traffic;3212 must exist before analytics consumers run.
10. **Compatibility:** no new07A schema is introduced, but dirty06B/07A clients require the06A six-report/observation contract and the3208–3212 Wishlist schema. Determine the actual last compatible deployed release from its source/manifest, rather than assuming the local Git parent is safe. Record this before migration.
11. **Focused staging smoke:** migration status; service health/logs; API health; real synthetic verification/reset email; A/B login/logout/401 isolation; guest merge with108 saves; first100+remainder; create selected share/recover/rotate/old-link reject/claim/expiry/revoke; separate recipient save; unauthorized/other-org Analytics; six endpoints and SQL totals; consent deny/grant/withdraw; Worker lag/projection/retention; media; mobile drawer and Admin320px; exact proxy/cookie/no-store headers.
12. **Failure/rollback:** retain failed job/service logs and previous/current manifests; stop promotion on failure. Roll back application images only when compatible with resulting schema. Migrations are forward-only; application rollback never reverses them. Prefer reviewed forward repair; restore only through verified backup procedure with explicitly accepted data-loss window. A changed root key cannot be repaired by an image rollback alone.
13. **Record/approve:** release SHA, image digests, migration ledger, public origins, configuration validation without secrets, smoke outcomes, schema-compatible rollback target and required operator actions. Owner visual/a11y, privacy retention, secure email/key custody and shared-VPS protection approvals remain distinct. No automatic production launch follows07B.

## AB. Deployment Status

**Only local assignment-owned processes, tmpfs PostgreSQL databases, synthetic records, local mailbox/media, browser test storage, source/tests and documentation were touched.** Existing persistent local DB and the pre-existing visual PG container were preserved. No staging/production migration, VPS configuration, external email/SMS, shared-service restart, image push, deploy, commit, Cart or Checkout change occurred.

Temporary fault injection was cleared. Assignment-created services/container are stopped at final cleanup; mode-0600 temporary runtime files and local evidence remain outside Git. Screenshots remain in the artifact directory. Final preservation/cleanup evidence is [cleanup.json](phase07a-evidence/cleanup.json).
