# Current Focus

Shopping Cart Phase 03B implements the authenticated Bag and explicit guest merge review. Local integrated acceptance is **PARTIAL** and production release is **BLOCKED**. See the [Phase 03B report and verification priorities](../architecture/cart/PHASE_03B_STOREFRONT_IMPLEMENTATION.md).

Shopping Cart Phase 03A implements persistent account ownership, shared Cart operations, and explicit guest merge review and replay. Local backend acceptance is **PARTIAL** and production release is **BLOCKED**. See the [implementation report and Phase 03B contract](../architecture/cart/PHASE_03A_ACCOUNT_CART_IMPLEMENTATION.md).

Shopping Cart Phase 02-C local integrated acceptance is **PARTIAL** and production release is **BLOCKED**. See the [integrated acceptance report](../architecture/cart/PHASE_02C_INTEGRATED_ACCEPTANCE.md) and [Phase 03A Account Cart backend handoff](../architecture/cart/PHASE_03A_ACCOUNT_CART_HANDOFF.md). The focused Orders regression passed with the existing delivery-pricing fixture correction.

Shopping Cart Phase 02B is **PARTIAL**. The live guest drawer, full bag review,
PDP Add and semantic selection editor share the Cart controller. See the
[Phase 02B report](../architecture/cart/PHASE_02B_IMPLEMENTATION_REPORT.md)
for local evidence and pending accessibility, policy and release gates.

Shopping Cart Phase 02A is **PARTIAL**. Catalog configuration validation, coherent
Cart snapshots, and provisional coupon eligibility are implemented. See the
[continuation register](../architecture/cart/PHASE_02A_CONTINUATION.md) for the
current Phase 02B contract, verification and owner-policy gates.

Current owner assignment is **Shopping Cart Phase 01-C integrated acceptance**.
Local status is PARTIAL. Chrome native 200%/400% and exact historical evidence recovery
passed. Human AT, hardware and browser breadth remain open. The broad regression
has one existing Orders delivery pricing fixture failure. Production is BLOCKED on
persistent continuity/cutover, restore/revocation, real proxy/role and policy evidence.
See the [implementation report](../architecture/cart/PHASE_01C_IMPLEMENTATION_REPORT.md)
and [Phase 02A contract](../architecture/cart/PHASE_01C_PHASE02A_HANDOFF.md) before
a separate commerce assignment. Preserve previous Cart and Wishlist checkpoints below.

Current owner assignment: **Shopping Cart Phase01B-R frontend foundation**.
[Report](../architecture/cart/PHASE_01BR_IMPLEMENTATION_REPORT.md): atomic Clear,
deliberate session forgetting, unknown-intent continuity, reload-safe reset review,
bounded locks/queue/backoff, owner/PDP fencing, shared confirmations and measured
header/footer/populated-line reflow. Local acceptance remains **PARTIAL**:
AT/device/native zoom unperformed and an inherited fixed-output benchmark
accidentally regenerated the01A-R timing artifact; provenance/original samples
are recorded, original full plan bytes unavailable. Overall persistent cutover,
restore/proxy/role/privacy/account/commerce gates remain open. No commit/push/deploy,
package install, VPS or shared/production DB action. Read the current contract;
Phase02A is a separate assignment. Preserve all Wishlist gates/history below.


Current owner assignment: **Shopping Cart Phase01A-R backend reassessment**, locally
implemented and verified on the preserved dirty tree. [Report](../architecture/cart/PHASE_01AR_IMPLEMENTATION_REPORT.md):
atomic Clear, explicit cookie-only recovery, mandatory public UUID intent keys,
forward3215 integrity constraints, batch price/stock reads and obsolete legacy
receipt-path retirement.85 focused tests,5 real HTTPS Chrome protocol cases,
13 populated upgrades, targeted types/build/lint/architecture/history pass.
**Overall PARTIAL**: legacy persistent cutover/restore continuity is blocked;
representative load, production role/proxy/retention and frontend01B-R gates remain.
No commit/push/deploy/VPS or persistent DB operation. Read the Cart contract before
frontend01B-R; do not silently adopt old credentials. Preserved Wishlist progress
and its unresolved gates follow as history and remain valid.


The owner shifted work to the complete Storefront Wishlist system, including snapshot sharing. The [repository audit and implementation direction](areas/storefront-wishlist/audit-and-architecture.md) records decisions and open work. Guest and account Wishlist persistence, shared product-card/PDP hearts, header counts, a catalog-hydrated Wishlist page, durable guest merge, and the sharing backend are implemented locally. **Wishlist is not complete:** browser, staging, and remaining sharing-security acceptance gates remain open.

The prior Fit & Sizing implementation remains owner-review pending. The Customer 360 CRM production verdict remains **NO-GO**, with the customer-controlled identity challenge and other acceptance gates still open. Preserve that evidence and the untracked stockout-interest notes.

Wishlist Phase 02 adds reference-only guest persistence with a per-operation browser journal, a shared guest/account controller, authenticated API adapter, and an exact-version transactional merge with durable receipts. Phase 03B restored an isolated disposable PostgreSQL 18 runtime and passed focused migration, database, API, Worker, and Storefront checks. It added forward migration 3211 for receipt tombstones and repaired cross-organization share capability access. See `docs/architecture/wishlist/PHASE_03B_VERIFICATION_AND_SECURITY_CLOSURE_REPORT.md` for evidence and remaining gates. Phase 03 remains **partial**; staging migration status, proxy behavior, browser acceptance, key rotation, and catalog edge coverage are unverified. The ordinary persistent local PostgreSQL container was not restarted.

Phase 04 implemented and locally browser-tested the private Storefront Wishlist, including guest/account save, remove, undo, variant preference, owner switching, responsive layouts, and bounded 108-item account pagination. A PostgreSQL microsecond cursor defect was fixed with a focused regression test. See `docs/architecture/wishlist/PHASE_04_IMPLEMENTATION_REPORT.md`. Phase 04 remains **partial local acceptance** pending complete keyboard/screen-reader, real-media/desktop visual, and failure-mode browser journeys.

Owner review identified that the first functional Phase 04 page discarded the approved Wishlist visual design. The follow-up restored a populated design-lab specimen and refit the live Wishlist to its warm editorial desktop split and compact mobile cards. Mobile/tablet bottom navigation now opens a modal sliding Wishlist drawer; desktop keeps the full page. Browser checks confirmed phone/tablet/desktop presentation and Escape focus return. Real media and the remaining accessibility/failure journeys are still open.

Phase 05 implemented the sharing frontend across guest/account creation and management, explicit guest claim, and the public recipient Save One/All experience. Local browser verification covered ordinary guest/account creation, a 107-item account with cross-page selection, link recovery, rotation, expiry, revocation, claim, recipient saves, and a 320 px drawer. The recipient uses the shared editorial product card. See `docs/architecture/wishlist/PHASE_05_IMPLEMENTATION_REPORT.md`. Phase 05 remains **partial local acceptance**; real media, full accessibility, failure/legacy cases, account recipient/owner-switch/history pagination, catalog edge cases, and staging/security gates remain open. No staging deployment occurred. These gates remain open independently of the subsequently authorized Phase 06A backend assignment.

The owner explicitly authorized Phase 06A backend-only work. Transactional account/share outcome events, bounded outbox projection and retries, current/historical aggregate reports, Analytics-authorized Admin APIs, minimal consented ingestion, retention and operational counters are implemented and locally tested. See `docs/architecture/wishlist/PHASE_06A_BACKEND_IMPLEMENTATION_REPORT.md` and its metric dictionary for exact verification, API/Phase 06B handoff and limitations. Phase 06A production acceptance remains partial: privacy approval, staging/recovery, missing pre-existing generic upgrade cases and broader volume gates remain open. No frontend work or deployment occurred. Stop here; Phase 06B needs a separate assignment.

Phase07A executed local integrated acceptance on the preserved dirty06B implementation. The final focused run passed117 tests/23 files; fresh/populated upgrades, frontend/backend builds and targeted checks passed. Real browser evidence covers108-item pagination, guest/account recipient saves, authenticated Admin reports/tenant denial and transition,503 Retry, stale-filter/hash regressions, and all six responsive widths with valid media. Consent withdrawal, calendar/history display, request cancellation and mobile chrome were repaired. **Overall remains PARTIAL**, with full accessibility, browser failure/concurrency/lifecycle matrices, natural session TTL, provider-idempotent verification replay and versioned key rotation still open. See `docs/architecture/wishlist/PHASE_07A_LOCAL_ACCEPTANCE_REPORT.md` and its62-entry register. No commit, persistent migration, staging/production/VPS action, or Cart/Checkout edit occurred. Resume these local gates before separately authorized Phase07B execution.

Phase07A.1 added versioned recovery with a reader-first mode, retained keys, safe errors and atomic resumable re-encryption. Synthetic24 shares/24 receipts migrated; actual Worker kill/restart/concurrency/poison and two-API management limits passed. Chrome verified quota recovery, corrupt journal tolerance, explicit claim,23-row history, recover/rotate/revoke and session-expired/B isolation; Admin ownership wording and measured primary-action contrast were repaired. Final targeted141 tests/26 files, upgrades, both frontend/backend builds, types and focused lint passed. **Verdict remains PARTIAL**: Critical pending-account races, complete failure/storage/recipient/telemetry/accessibility and retention-interruption evidence remain open; strict email replay remains FAIL pending an explicit contract decision. Register:37 PASS/20 PARTIAL/1 FAIL/2 NOT VERIFIED/2 BLOCKED. See `docs/architecture/wishlist/PHASE_07A1_LOCAL_ACCEPTANCE_CLOSURE_REPORT.md` and `SHARE_RECOVERY_KEY_RUNBOOK.md`. No commit, persistent migration, staging/production/VPS action or Cart/Checkout source edit. Phase07B remains unauthorized and not ready for write-enabled execution.
