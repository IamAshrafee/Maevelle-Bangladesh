# Wishlist Phase 07A.1 — Local acceptance closure

Date: **2026-11-02, Asia/Dhaka**. Final verdict: **PARTIAL**. Phase 07B was not started or authorized.

## A. Executive Summary

Implemented versioned Wishlist encryption recovery with compatible legacy reads, reader-first rollout, safe recovery errors, bounded resumable re-encryption and key-retirement checks. Rehearsed 24 share records and 24 creation receipts with generated temporary keys. Added session/replay/security regressions, executed real Chrome sharing/storage/account journeys, killed actual isolated Worker processes, and verified shared abuse counters across two API processes. Corrected Admin ownership wording and measured/fixed primary-action contrast.

Final targeted regression: **141 passed, 26 files, zero failures/skips**, including the original Phase 07A selection plus recovery/configuration/contrast cases. Both frontend production builds, backend build, full TypeScript project check, targeted ESLint and populated upgrades passed. Evidence is in [phase07a1-evidence](phase07a1-evidence/).

**This is not complete local acceptance.** Pending account-switch races (A18, Critical), remaining browser failure/retention/telemetry/security verification and full accessibility evidence remain locally actionable. Provider-idempotent verification remains **FAIL against the unchanged strict replay criterion**. No observed authentication escalation is asserted. External/owner gates remain open. The register has **37 PASS / 20 PARTIAL / 1 FAIL / 2 NOT VERIFIED / 2 BLOCKED**.

## B. Repository Preflight

Branch `main`; HEAD `aa290065407030e85b5b6847efd22fb437a65279`, unchanged from Phase 07A. The starting tree contained 13 tracked modifications and the untracked Phase 06B/07A implementation/evidence/helpers. Preserved all of it; no reset, clean, stash, automatic commit or unrelated file removal.

Read root/nested instructions, completion state/current focus, engineering standards, Storefront/Admin visual contracts, security/privacy/testing/migration/deployment references, predecessor reports 01B–06B, the 07A report/register/handoff and evidence. The stored initial 07A inventory differs from its final implementation; final `quality-results.json` contains the useful final source hashes. [Comparison](phase07a1-evidence/comparison-to-07a-final.json) confirms the other listed source files are unchanged; current task edits explain the three differences in that final source inventory. Starting status and diff digest are preserved; the raw dirty diff was moved outside Git after the secret guard flagged pre-existing synthetic assignments.

No API/Worker/Next services were initially listening. The pre-existing `codex-wishlist-visual-pg18` on loopback55440 was left untouched (no mounted volume reported; its container data is treated as protected existing state). Created assignment-owned `maevelle-wishlist-07a1-pg18`, PostgreSQL18 on loopback55442 with tmpfs storage, plus `maevelle_test`, `maevelle_ui_07a` and test-created disposable databases. No persistent or staging database was migrated. Registry remains **61 migrations / 51 immutable baseline**, ending3212. No migration file/registry change.

## C. Previous Acceptance Gaps

All 29 non-PASS rows were reopened **before implementation** in the same62-entry register. Added local/external classification, explicit closure criteria, disposition and actual07A.1 result; original IDs/severity/history retained. The end-of-report reconciliation lists every reopened row. PASS rows retain historical browser evidence and current applicable regressions; they are not falsely described as new browser journeys.

## D. Security and Encryption-Key Closure

See the complete [key audit, configuration, recovery and compatibility runbook](SHARE_RECOVERY_KEY_RUNBOOK.md). Audited authentication secondary storage, MFA/account/team security, keyed messaging digests, courier/Meta/settings/notifications/Worker provider credentials and Wishlist. The shared authentication root has wider consumers; it was neither replaced nor migrated.

Wishlist adds an authenticated binary v2 envelope with an explicit key ID, existing HKDF separation/AES-256-GCM, AAD binding to header and record context, retained old decryptors, strict ID/root validation and generic recovery503. Legacy binary records remain readable. `AUTH_ENCRYPTION_KEY` stays mandatory/unchanged; independent Wishlist roots use `WISHLIST_SHARE_ACTIVE_KEY_ID`, `WISHLIST_SHARE_KEYS`, `WISHLIST_SHARE_READ_LEGACY`, and `WISHLIST_SHARE_WRITE_LEGACY`. Reader-only rollout writes legacy while reading both formats. Version-writing migration refuses a legacy-writing ring.

The migration accepts1–500 records per transaction, locks candidates with `SKIP LOCKED`, validates decrypted identities/tokens/digests/receipt structure, verifies its output by decryption, and changes ciphertext only. A failed batch rolls back atomically; committed envelopes are its resume checkpoint. Unknown outcome credentials, tombstones, versions, ownership, public digests and outbox semantics are preserved. Startup rejects missing dependent key IDs; retiring a key must be checked with writers quiesced. This is not proof that root bytes under an existing ID are correct; never reuse an ID for changed bytes.

**Unit/DB evidence:** legacy/new coexistence, reader-only writes, active writes, wrong root/AAD, altered/truncated/header ciphertext (including non-ASCII ID mutation), unavailable version, corrupted source rollback, output recovery, committed-batch resume, concurrent migrators, premature retirement rejection and public digest lookup independence. Actual local CLI rehearsal moved **24 shares +24 receipts** in batches10/10/10/10/8, then0; retirement check passed. [Rehearsal log](phase07a1-evidence/reencrypt.log). OS-kill re-encryption was not claimed: transaction rollback and interruption between committed calls were tested.

Lost roots make their dependent recovery unreadable; existing public tokens remain cryptographically valid but missing-key startup protection can make the API unavailable. Owner recovery requires the matching root; explicit account rotation issues a different link. Legacy-only applications cannot read v2; after first v2 write, rollback requires a reader-capable image and retained roots. Backups require escrowed keys for their restore window. Production custody/escrow/retirement approval remains external.

## E. Email Verification Replay

Installed Better Auth verifies an HS256 JWT, enforces expiration and redirects successfully for an already-verified email before invoking `beforeEmailVerification`. The existing verification table is not an atomic one-use ledger for this JWT. `autoSignInAfterVerification=false`; verified login remains required. Password reset has a separate single-use contract and revokes previous sessions.

New concurrent replay tests confirm two successful redirects without session issuance, modified capability rejection and no unauthenticated private access. Expired verification/reset and password-reset replay/revocation regressions also passed. These tests establish provider-idempotence; **they do not establish strict one-use rejection**. A03 remains FAIL/Medium, with proposed provider-idempotent acceptance awaiting explicit owner/security approval. Callback-only checks cannot safely enforce the original requirement; a supported issuance/consumption design would need separate implementation rather than patching provider internals. No contract approval was inferred.

Primary reference reviewed: [Better Auth email documentation](https://better-auth.com/docs/concepts/email), alongside installed provider source. No dependency upgraded/configured.

## F. Session and Account Transition Verification

**API-tested:** Date-only clock crossed unchanged12-hour TTL; private read and mutation returned401. Verification/reset expiration, reset single-use, old-session invalidation, copied/renamed Admin cookie denial, shopper/Admin separation, account/organization authorization passed current regression.

**Real browser:** expired only synthetic A session records in the disposable authentication store (two sessions); account Get link displayed session-expired feedback. After refresh and B login, both Chrome tabs displayed B's zero-item list, with no A108-item list. Synthetic login helper obtained real Better Auth sessions through the API; it is not browser sign-up/reset-form evidence. Settled expiry-refresh state before another login and the full delayed save/merge/sharing/logout/reset cross-tab matrix were not completed. A08/A18 remain PARTIAL; A18 is a Critical verification gate.

## G. Cross-Tab and Storage Failure Verification

Real Chrome quota injection caused a guest save to display “saved only in this tab until it closes.” Restoring writes and Retry persisted it across refresh. A second Chrome tab saved another product/preferred variant; refreshing the first displayed both entries. Injected corrupt journal JSON did not erase either valid entry.

The proxy injects browser failures into actual local Next/API pages; no application test overlay was added. Initial IAB proxy hydration stalled, so Chrome supplied the evidence. Proxy socket-reset failures were repaired as harness defects. Storage read/startup denial, sessionStorage denial, simultaneous same-product conflict, notification ordering, compaction, closure/reopen and share-vault-loss combinations remain open. Only observed cases are PASS, not the complete matrix.

## H. Sharing Browser Lifecycle

**Real browser:** guest Share All; deliberately lost response after the real API committed; “Retry earlier creation” recovered the same pending operation; browser management history persisted; expiry extended to60 days. Explicit Move/Confirm transferred management to A; authenticated recovery returned the same public link, which opened. Account history paged from20 to23 rows. Replacement warning/confirmation rotated the link; old capability stopped opening, replacement opened; explicit revoke then made replacement unavailable.

**API/DB-tested:** view/manage independence, old guest manager denial after claim, cross-owner/organization denial, competing claim/create, active limit, selected/all authority, over100 rejection, fixed snapshots, receipt replay/tombstones and optimistic rotation conflict. Current tests ran with an independent active Wishlist ring, so route integration exercised v2 writes/recovery.

Guest selected/direct guest revoke/storage-loss cases, lost rotation response, full selection/reload and pending-management account-switch browser cases remain open. A26/A27 close with combined browser + current API/DB evidence; A23/A28 remain PARTIAL.

## I. Public Recipient Edge Cases

Current real recipient cards used valid synthetic local media; published/in-stock Pearl and OOS scarf displayed. Claimed original link opened before rotation; rotated old/revoked replacement links showed unavailable. Private A/B holdings stayed separate. Earlier ordinary guest/account Save One/All evidence is retained and their unit/API contracts reran.

The complete current browser matrix for unpublished/archived/deleted/empty, invalid preferred variant, changed price/media/URL, expired exact cutoff, partial Save All/network failure/session/account switch was not executed. These remain locally actionable; no fresh complete recipient acceptance claim.

## J. Worker Interruption

[Actual process evidence](phase07a1-evidence/worker-recovery.json): a synthetic-only trigger paused an actual Worker during projection. SIGKILL terminated it; the paused PostgreSQL backend was then terminated to force immediate disconnect detection instead of waiting through every row sleep. **Before commit:0 facts/0 receipts**. Restart produced **1 fact/1 receipt**. Kill after observing commit and restart with two concurrent Workers retained1/1, while a healthy event progressed past a poison event recorded for retry.

Facts and receipts acknowledge atomically in this design; no separate external queue acknowledgment was invented. The temporary trigger/function were dropped. Initial harness run reached a poison-fixture NOT NULL error (missing occurred_at); corrected with `now()` and reran successfully. Cleanup/retention interruption, complete tombstone schedules and backlog memory remain unverified; A42 stays PARTIAL.

## K. Telemetry and Consent

All13 approved producer/schema contracts and consent/retry/dedup/secret-exclusion unit/API tests passed in the targeted suite. Existing source and prior evidence retained. Current browser clicked grant and Copy, but this run did not establish a fresh backend-confirmed matrix of all13 names; old `/tmp` observation entries were not counted as new evidence.

Unknown/denied/granted/withdrawn, withdrawal during retry/in-flight/across tabs and all producer interactions remain A50/A51. Native share cancellation, clipboard denial and WhatsApp producer execution remain A52; no native/WhatsApp delivery performed or claimed. Automated UI activation cannot prove delivery.

## L. Accessibility

Actual rendered measurements: Storefront primary **10.49:1**, copy **17.13:1**; create action48px tall. Admin white-on-teal active action was **3.74:1**. Fixed active analytics navigation and the shared primary Button using existing semantic foreground classes, preserving brand backgrounds/hover and dark tokens. Actual lab/button and navigation measurements: light **4.77:1**, dark **5.81:1**; token regression also checks hover pairs. Inspected `/admin/design-system`, light/dark buttons; restored light theme. Screenshot [fixed Admin](phase07a1-evidence/admin-fixed-contrast.jpg).

Keyboard Enter opened sharing and switched actual Admin chart to the semantic Data Table. Full keyboard traversal/trap/restoration, live announcements, VoiceOver/NVDA, complete contrast survey,200% zoom/400% reflow, OS reduced motion and mobile orientation were not completed. Browser AX inspection is not real assistive-technology acceptance. A55/A56 stay PARTIAL; no WCAG conformance claim. Existing Storefront/Admin designs preserved.

## M. Failure Injection

Executed: browser quota/corrupt journal, restored storage/Retry, lost committed creation response, expired account-management request, rotated/revoked links; two real API processes sharing management429 counters; actual Worker kill/restart/poison isolation; crypto wrong-key/AAD/tamper/missing-root and atomic rollback. Existing controller/API401/403/409/422/429/503 tests reran.

Not completed: complete offline/slow/status/clipboard/native/storage-denied matrix, expired merge receipts and pending tenant/account fetch schedules, cleanup interruption and every Analytics failure state. No false success observed in executed unknown-result path. Remaining cases retain local ownership in the register.

## N. Performance

New operational evidence is multi-process management rate-limit coordination (both instances blocked), bounded migration and Worker recovery. These are correctness observations, not sustained-capacity measurements. Current standard regression fixture (rerun because it belongs to the required targeted suite):2000 products,50 lists,10000 saves,5000 events; processing336ms, ranking EXPLAIN3.680ms in the final run. Single measurements are not p50/p95 or production capacity.

100-item guest render, large-account/50-share/100-recipient render, drawer/dashboard CLS and memory, sustained mixed traffic, pagination stability and backlog memory were not measured to the requested sample sizes. Do not reuse prior endpoint p50/p95 as evidence for these missing workloads.

## O. Security and Privacy

Current API/DB regressions passed tenant/owner/realm boundaries, verified identity, private cache/capability separation, merge idempotency, Analytics permission and suppression, anonymization/retention and transactional outcomes. Versioned recovery does not change public authorization or expose private arrays. No confirmed new boundary bypass remains in executed cases; unexecuted Critical/High browser schedules still prevent acceptance.

No real customer/provider secrets or production records used. Key custody, retention/legal notices, proxy log redaction, HTTPS/cookie deployment and external email delivery remain explicit owner/Phase07B gates. Code tests do not establish legal compliance or an external security certification.

## P. Defects Discovered and Fixed

| Ref | Severity | Cause / repair | Evidence |
|---|---|---|---|
| D14 | High | One unversioned recovery root; add independent ring, authenticated IDs, reader-only rollout and atomic migration | crypto/DB/config/API tests;48-record rehearsal |
| D15 | Medium | Ownership count includes all retained collections but subtitle said active; correct label | actual revoked collection + backend SQL + browser text |
| D16 | Medium | White13–14px text on teal had3.74:1 contrast; semantic foreground by state/theme | measured4.77/5.81 + normal/hover token test + lab |
| D17 | Test reliability | Expiry test provided only1ms above one-day minimum; give two-day future fixture while retaining actual expiry assertions | final targeted suite |

During review of new envelope code, tightened non-ASCII key-ID parsing so alternate high-bit bytes cannot normalize to the same ASCII ID; added rejection regression before final acceptance. Harness failures (stale compiled exports, missing base test schema, proxy disconnect, missing poison timestamp, CSS selector split and missing upgrade opt-in) were corrected and their failed logs retained; they are not product security defects.

## Q. Regression and Quality Checks

Final [targeted log](phase07a1-evidence/acceptance-final.log): **141 passed /26 files /33.09 seconds /0 failed /0 skipped**. Counts include117 baseline tests plus added tests and the configuration suite. No test removed. Earlier runs are not additive: initial140 tests had132pass/8fail; second141 had140pass/1fail (new contrast fixture selected the dark custom-variant declaration instead of its theme block); final corrected141/26 passed. Initial auth-only run11pass/1fail reflected the newly enabled startup check on an intentionally unavailable database; main auth fixture now opts into ring mode while the existing limiter-outage fixture retains legacy-mode runtime behavior.

Exact final commands are preserved in [verification commands](phase07a1-evidence/verification-commands.txt). Backend build, `pnpm exec tsc --build --pretty false`, targeted ESLint, Admin and Storefront production builds, migration guard, secret guard and `git diff --check` passed. Populated upgrade required explicit `UPGRADE_TEST_ALLOW=1`; initial guarded refusal changed nothing; corrected run passed10 post-baseline migrations/representative records. Fresh migrations passed in current tests and UI/test bootstrap. All DB migration-heavy test selections ran serially. No whole-repository test/lint or production load claim.

## R. Acceptance Register Reconciliation

| Status | Before | Final |
|---|---:|---:|
| PASS |33|37|
| PARTIAL |22|20|
| FAIL |1|1|
| NOT VERIFIED |3|2|
| BLOCKED |3|2|
| Total |62|62|

A26,A27,A33,A34 closed locally. A56 moves from NOT VERIFIED to PARTIAL for actual measured/fixed contrast and theme evidence. All other open rows remain explicitly assigned. The complete individual dispositions below are authoritative together with the CSV.

## S. Remaining Risks and Blockers

**Critical local verification:** A18 delayed logout/account-switch mutation isolation. No unsafe outcome proved; incomplete evidence still blocks local acceptance.

**High local verification:** A08 expiry/refresh schedules; remaining A09 abuse paths; A11/A12 storage/concurrency; A17 merge recovery; A28/A30 lifecycle races; A38 recipient invalid/expiry cases; A42 retention interruption; A50/A51 consent/producers; A53 full failure matrix; A56 full accessibility. Owners: implementation/QA/security, with an accessibility operator for real assistive technology.

**Medium:** strict replay requirement decision (A03 owner/security); A04 forms, A13 catalog browser transitions, A21/A23 touch/guest cases, A49 suppression browser state, A52 clipboard/platform interaction, A55 keyboard audit. Performance workloads remain unmeasured. External owners: privacy/legal retention and notices, security key custody/backup approval, owner visual acceptance. HTTPS/proxy/provider/persistent ledger require separately authorized staging.

## T. Final Local Acceptance

**PARTIAL. Not LOCALLY ACCEPTED.** Executed work is reviewable and focused regressions pass, but material local security, accessibility, recovery and browser evidence is still incomplete. Do not call Wishlist complete or turn this report into production/release approval. A03 remains a genuine requirement FAIL, not silently accepted risk.

## U. Phase 07B Readiness

**Not ready for write-enabled Phase07B verification.** A handoff is prepared; local Critical/High schedules must close or receive explicit owner disposition where appropriate. Phase07B execution remains unauthorized. Read-only future planning does not authorize deployment/reset.

## V. Detailed Phase 07B Handoff

1. Review the preserved dirty tree and this report/register/runbook. Base SHA is recorded above; there is no committed candidate/release SHA or published image digest for these changes. Commit only on explicit instruction; publish immutable full-SHA image manifests after checks/approval.
2. Inventory existing shared-VPS Maevelle rootless user/Quadlet units, networks, volume/media mounts, private Caddy, host Nginx route and previous/current manifests. Preserve unrelated applications/OS/Nginx. No routine deployment exposes DB/internal ports or updates unrelated units.
3. Positively identify environment/hostname/database, current schema ledger/checksums and last compatible image release. Compare61 migrations through3212. No07A.1 migration exists; versioned bytea envelopes are nevertheless an application compatibility change. Never infer persistent schema from tmpfs tests.
4. Require verified encrypted DB backup, media snapshot, retained configuration/keys and isolated restore evidence. Record last compatible manifests and forward-repair plan. No automatic reset, down migration, volume deletion or destructive restore. Staging reset needs separate explicit target-confirmed authorization.
5. Validate `DATABASE_URL`, pool/bind settings, `BETTER_AUTH_SECRET`, unchanged `AUTH_ENCRYPTION_KEY`, `BETTER_AUTH_URL` canonical public HTTPS origin, `AUTH_TRUSTED_ORIGINS`, `STOREFRONT_BASE_URL`, `STOREFRONT_ORGANIZATION_CODE`, internal API/media URL and storage paths. Public base URL should not accidentally duplicate `/api`. Secure secret custody is outside this report.
6. Wishlist rollout: follow the key runbook. Deploy all readers with `WRITE_LEGACY=true`; verify legacy auth/provider and Wishlist recovery; coordinate enablement of versioned writes, retain decryptors, then authorize a bounded re-encryption job separately. The local CLI is intentionally not a staging migration command. After v2 writes, only reader-capable rollback images are recovery-compatible. Keep old roots for backups even after live dependency counts reach zero.
7. Shopper email: configured sender requires `EMAIL_ENABLED`, approved provider/from/reply-to, `RESEND_API_KEY` if Resend, environment and recipient allowlist. Use synthetic staging identities; verify real delivery, verification/reset URLs and callbacks through HTTPS. Strict verification replay contract needs an explicit decision before changing acceptance.
8. Verify trusted upstream IP forwarding/spoof rejection, rate-limit coordination, secure/HttpOnly/SameSite cookies, `/api` stripping, `/shopper-auth` versus Admin `/auth`, Next `/admin`, media paths, no-store, no-referrer/noindex and safe route-template logging. Test Admin/shopper cookies and origins together.
9. Provision organization-scoped IAM through semantic/bootstrap operations; test `analytics.view` present/absent/disabled/other-tenant and pending tenant transitions. Authentication alone grants no capability. Worker encryption/provider root remains unchanged; configure isolated synthetic email/SMS behavior, bounded tick/projection/retention, health/heartbeat and lag reporting.
10. Governance: approve400-day outcomes/90-day observations and other recorded retention policies, small-cohort suppression, browser-storage lifecycle/notices, secure key escrow/custody, operational recovery and owner visual/accessibility findings. Do not infer privacy approval from counters/tests.
11. Deployment ordering: approved CircleCI/GHCR digest manifest; protected preflight/backup; one serialized migration job if the target needs historical3212 migrations (never API/Worker startup); compatible API/Worker before new client contracts; reader rollout before versioned encryption writes; then Admin/Storefront. Keep PostgreSQL/media persistent. Stop on migration, service health or smoke failure; retain diagnostics/previous manifest.
12. Focused staging smoke: ledger; API ready/live; Worker status/logs/lag; synthetic signup/verification/reset,12-hour controlled session boundary, A/B pending transitions, copied realm cookies;108-item paging/merge; selected/all limits; guest claim/recovery/rotation/old-link failure/revoke/expiry and lost responses; recipient independent saves/current media; six Analytics endpoints/SQL truth/null/history/timezone/permissions/tenant transition; all13 producers under consent; mobile drawer/keyboard/assistive technology; public proxy/cookie/cache/log behavior and shared rate limits.
13. Rollback/repair: no image rollback reverses SQL or re-encrypts bytea. Select an actually compatible reader image/configuration from recorded manifests. Missing root restore requires escrow; if unavailable, explicit account link rotation is a separate user-visible action. Use forward repair or separately authorized coordinated restore for incompatible schema/data. Retain failed deployment evidence and do not promote on a passing CI result alone.

## W. Deployment Status

Only assignment-owned local tmpfs PostgreSQL and synthetic local API/Worker/Admin/Storefront/browser/proxy processes were used. Existing local database container preserved. No staging/production deployment, VPS access/change, persistent migration, real secret rotation, real customer fault injection, external message, automatic commit or Cart/Checkout source edit occurred. Temporary services and assignment container are stopped at cleanup; screenshots/logs and generated private runtime files remain available as noted in cleanup evidence.

## Individual reopened requirements

| ID / severity | Previous → final | Disposition / remaining criterion |
|---|---|---|
| A03 / Medium | FAIL → FAIL | Accepted risk, pending explicit approval. Strict replay rejection or explicit owner-approved contract revision; provider callbacks do not cover the already-verified branch. |
| A04 / Medium | NOT VERIFIED → NOT VERIFIED | Still locally actionable. Complete signup/verification/reset/recovery forms in the browser; password entry through supported owner/test workflow. |
| A08 / High | PARTIAL → PARTIAL | Still locally actionable. Observe settled guest state after expiry refresh before a subsequent login; delayed request/expiry/logout interactions remain. |
| A09 / High | PARTIAL → PARTIAL | Still locally actionable. Repeat email and observation abuse paths across processes; management sharing alone is not the complete matrix. |
| A11 / High | PARTIAL → PARTIAL | Still locally actionable. Run read-denial, startup denial, sessionStorage denial and legacy migration in real browser; preserve share vault. |
| A12 / High | PARTIAL → PARTIAL | Still locally actionable. Concurrent same-product remove/save, out-of-order notification, compaction, close/reopen matrix. |
| A13 / Medium | PARTIAL → PARTIAL | Still locally actionable. Mutate publication/archive/delete/price/image/URL and invalid preferred variant through disposable catalog fixtures, verify current rendering. |
| A17 / High | PARTIAL → PARTIAL | Still locally actionable. Inject actual merge timeout, stale version, expired receipt and recover using original pending command. |
| A18 / Critical | PARTIAL → PARTIAL | Still locally actionable. Delay save/merge/share management while logging out/switching; prove stale completion cannot display or replay A data in B. |
| A21 / Medium | PARTIAL → PARTIAL | Still locally actionable. Complete touch Remove/Undo/error matrix in current desktop/drawer UI. |
| A23 / Medium | PARTIAL → PARTIAL | Still locally actionable. Guest selected scope, direct guest revoke, credential/sessionStorage loss and denied storage browser cases. |
| A26 / Medium | PARTIAL → PASS | Closed with evidence. Closed locally; old history and authenticated link recovery evidenced. |
| A27 / High | PARTIAL → PASS | Closed with evidence. Closed with browser confirmation plus current API/DB authority regressions. |
| A28 / High | PARTIAL → PARTIAL | Still locally actionable. Lost rotation response, retry/recovery, version conflict and pending management owner-switch browser combinations. |
| A30 / High | PARTIAL → PARTIAL | Still locally actionable. Execute extension-versus-cleanup, expire/open/revoke and exact-cutoff concurrent schedules. |
| A33 / High | PARTIAL → PASS | Fixed and regression-tested. Local crypto/recovery drill closed. Actual secret custody remains A62. |
| A34 / High | BLOCKED → PASS | Fixed and regression-tested. Local implementation/rehearsal closed. No production rotation or staging execution. |
| A38 / High | PARTIAL → PARTIAL | Still locally actionable. Browser expired/invalid link and exact cutoff, revoke while open, catalog-empty combinations. |
| A42 / High | PARTIAL → PARTIAL | Still locally actionable. OS interruption during retention/cleanup, large backlog memory and complete cleanup/tombstone failure schedules remain. |
| A49 / Medium | PARTIAL → PARTIAL | Still locally actionable. Real null tooltip and small-cohort browser comparison against zero and incomplete history. |
| A50 / High | PARTIAL → PARTIAL | Still locally actionable. Unknown/denied/granted/withdrawn, in-flight/retry/cross-tab consent matrix with fresh observation sink. |
| A51 / High | PARTIAL → PARTIAL | Still locally actionable. Drive all13 actual interactions; correlate fresh stable IDs, strict schemas, dedup and secret exclusion. |
| A52 / Medium | NOT VERIFIED → NOT VERIFIED | Requires external/provider verification. Browser clipboard-denial test locally actionable; native sheet/cancellation needs supported platform/manual interaction. WhatsApp selection is not delivery. |
| A53 / High | PARTIAL → PARTIAL | Still locally actionable. Complete offline/slow/lost response and401/403/409/422/429/503/5xx matrix across save/merge/share/recipient/Analytics. |
| A54 / High | PARTIAL → PARTIAL | Requires business/privacy approval. Governance owner approves retention, browser-storage deletion policy and notices; production delivery remains separate. |
| A55 / Medium | PARTIAL → PARTIAL | Still locally actionable. Full Tab/ShiftTab/Space/Escape/focus trap/restoration/announcement/error/drawer matrix. |
| A56 / High | NOT VERIFIED → PARTIAL | Still locally actionable. Actual assistive-technology interaction, full contrast matrix,200%/400% reflow, OS motion/orientation remain. |
| A61 / High | BLOCKED → BLOCKED | Requires authorized staging. Separately authorize Phase07B and verify protected target, HTTPS/proxy/cookies, persistence and restore. |
| A62 / High | BLOCKED → BLOCKED | Requires business/privacy approval. Owner/security/privacy approvals after local verification and separately authorized protected staging evidence. |
