# Phase 01A-R implementation report

2026-11-03 · **PARTIAL** · guest backend implementation verified locally;
production release readiness remains unestablished.

## 1. Phase 01A-R status

**PARTIAL:19 PASS /4 PARTIAL /1 BLOCKED** acceptance gates. No final executed
check failed. Essential legacy continuity/operational deployment evidence prevents
a blanket PASS; local test success is not substituted for those gates.

## 2. Executive summary

Retained the proven capability-slot/barrier design, strict tenant/shopper
resolution, one relational Cart model, transactional platform receipts/outbox and
current commerce truth. Added atomic Clear, explicit cookie-only recovery,
mandatory public intent keys and forward3215 row integrity. Refactored protection
out of route composition and eliminated redundant command owner lookups. Batched
price/stock reads in owning boundaries. Retired unreachable legacy Add-receipt
replay and its unused DTO flag, while preserving old data/receipts. Compare-at
changes now invalidate calculation fingerprints without inventing intent revisions.
No complete Checkout/account/merge/payment/reservation feature was implemented.

## 3. Repository and Git state

Initial/final branch `main`; initial/final HEAD
`aa290065407030e85b5b6847efd22fb437a65279`. Significant dirty work was present.
[Baseline hashes](phase01ar-evidence/baseline.json) cover202 pre-existing modified/
untracked files.181 remain byte-identical;20 intentionally changed in scope;
1 obsolete in-scope module retired. All unrelated baseline files are unchanged.
[Final preservation](phase01ar-evidence/preservation.json) records exact paths.
No reset/clean/stash/discard/commit/push/deploy occurred.

Changed existing source boundaries: API cart.ts/cart-context.ts and foundation
tests; shared cart.ts contracts/index exports; database cart facade, command,
context, query, receipt, availability and upgrade fixtures; migration registry;
Pricing's previously clean resolver. Removed cart/legacy-receipts.ts. Added
cart-protection.ts, cart-reassessment.test.ts,3215_cart_integrity.ts and two
synthetic-only browser harness scripts. Documentation/resume files are listed
in the impact map. Existing Admin/Wishlist/auth/Orders/Worker/frontend source
was preserved byte-for-byte in this assignment.

## 4. Architectural reassessment

[Reassessment](PHASE_01AR_REASSESSMENT.md) examines lifecycle/schema, authority,
queries/commands, concurrency, commerce, errors, future accounts/Checkout,
security, resources and Worker responsibilities. [Six ADRs](PHASE_01AR_ARCHITECTURE_DECISIONS.md)
compare slot/barrier/session-table designs, relational/JSONB/event sourcing,
receipt alternatives, batch reads/caches, legacy recovery and Worker infrastructure.
Choices favor fewer correctness boundaries without adding speculative services.

## 5. Keep / improve / refactor / replace / retire

KEEP relational aggregate, platform receipt ledger, strict configured authority,
existing shopper realm and Checkout adapter. IMPROVE constraints/recovery/
fingerprints. REFACTOR transport protections and already-locked command context.
REPLACE per-line stock/price round trips with bounded batch reads. RETIRE public
unkeyed mutations and unreachable pre-cutover receipt lookup. Full matrix and
migration/security/test implications are in the reassessment and ADRs.

## 6. Guest Cart/session architecture

Unique HttpOnly production __Host-/Secure slots + mandatory credential round-trip.
Independent cold requests create independent empty Carts; delayed responses cannot
replace an acknowledged slot. Multiple valid slots require explicit owner-context
selection. Public IDs/context cannot authorize. Failed cookies cannot mutate.
Database concurrency and five actual HTTPS Chrome protocol cases pass. Explicit
session reset expires presented Cart cookies only; stale responses can reintroduce
a slot, so01B-R must quiesce work/re-read. Browser eviction is not recoverable
ownership proof, and forgetting is not server revocation.

## 7. Ownership and authentication

Trusted configured tenant/currency, exact slot-to-row binding, typed public owner
contexts and composite FKs retained. Strict verified shopper/CRM lookup failures
never become guests; real A/B/logout/suspended-mapping regressions pass. Account
Cart operations return ACCOUNT_CART_NOT_READY. Full persistence/merge is not
claimed. Pre-cutover3214 credentials remain irreversibly retired; intent/receipts
are retained. Independent legacy ownership proof is absent. Persistent cutover
acceptance and restore replay remain blocking.

## 8. Domain/database

One Cart persistence model and exact variant identity.3215 adds discrete1–99
quantity, positive line revision, valid observed price, tenant-scoped customer FK
and guest/account authority exclusivity. Invalid historical data stops migration
without deletion/truncation. All64 fresh migrations and13 populated post-baseline
upgrades pass; invalid3214 data was explicitly repaired only in a disposable test.
Creation+initial projection now rolls back together. No existing migration changed.
[Migration/forward-recovery report](PHASE_01AR_DATABASE_MIGRATION_REPORT.md).

## 9. Idempotency/revisions

Add increments; Set expresses desired state; Clear removes lines AND coupons.
Every public command requires UUID key + revision + observed owner. Ledger scope
is tenant/Cart/operation/key. Same scope/key with changed fingerprint conflicts;
exact replay is resolved before stale revision checks. Domain/receipt/outbox
commit together. No-op creates a receipt without version/event. Seven-day recovery
expiry rejects reexecution and retained records remain consumed. Price/stock/
compare-at recalculation does not manufacture customer intent. Tests include
12 Clear duplicates across two pools, reconnect, rollback, actual DB termination,
expired keys, stale winners and immutable outcome versus current projection.

## 10. Security

[Security closure](PHASE_01AR_SECURITY_CLOSURE.md) maps six findings and all30
historical threats. Bound SQL and strict schemas, no client ownership/money,
origin/JSON/Fetch Metadata protection, private caching, publication redaction,
bounded resources and database-shared rates are retained/verified locally.
No newly found Critical/High exploit is accepted as production-ready by waiver.
Legacy operational continuity, actual database privilege/proxy/restore evidence
remain explicit release risks. No third-party SAST scanner or full log-canary
scan was run; scoped ESLint/source review is not represented as one.

## 11. Commerce integrations

Existing Pricing temporal rule is shared by single and batch resolvers; stock
is grouped from authoritative inventory levels, never reserved. Catalog/media
hydrate once; unpublished merchandise is redacted and skipped for price/stock.
Promotions remain authoritative, evaluated once per projection with remaining-
gross stack protection. Its existing per-matched-promotion target reads remain;
this task does not claim complete Promotions-scale optimization. Existing strict
guest Checkout consumers remain compatible; no new order/payment workflow added.

## 12. API contracts

Existing guest paths/GuestCartViewDto remain. New DELETE current performs Clear;
new DELETE /carts/session forgets this browser's credentials. Missing public key
now returns400 INTENT_KEY_REQUIRED. Malformed context headers reject explicitly.
[Exact routes, DTOs, errors and recovery](PHASE_01AR_API_AND_FRONTEND_CONTRACT.md).
Current Storefront already sends keys and contexts. No duplicate versioned Cart
API or unsafe legacy adoption endpoint remains.

## 13. Worker/observability

Transactional Cart outbox and safe request code/status/revision logging retained;
existing DB connection-loss reporting remains. No destructive retention worker,
provider delivery or Cart analytics projector was activated. Planned bounded
inspection/compaction must preserve consumed intent tombstones and require
retention approval. Security report specifies counters and safe failure policy.
Receipt growth, abandoned bootstrap metadata and production role grants remain
operational work, not completed lifecycle features.

## 14. Performance

Ten samples per size:1/20/100 lines all8 measured SQL statements (includes two
SET LOCALs, excludes BEGIN/COMMIT). Median4.45/4.60/5.64ms; sample p954.84/5.19/
6.85ms. Actual price/hash EXPLAIN ANALYZE BUFFERS captured. Small synthetic
catalog/no-stock benchmark variants and no representative concurrent load limit
the conclusion. Structural N+1 reduction verified; no production SLO asserted.

## 15. Verification

**85 tests /7 files PASS;0 failed/0 skipped. Five real Chrome protocol cases PASS.**
Database build; DB/API/Storefront typecheck; scoped ESLint;13-workspace architecture;
64-migration/51-immutable history checks;13 populated upgrades PASS.
[Exact commands/environment/failures/limitations](PHASE_01AR_TEST_EVIDENCE.md).
No broad monorepo build/suite, deployment or production verification was run.

## 16. Documentation/acceptance

Produced all nine requested01A-R reports. Updated Cart index and current
master/system/domain/API implementation notices; preserved historical phase
reports. Updated concise completion resume metadata without removing Wishlist
open gates. [Acceptance](PHASE_01AR_ACCEPTANCE_REGISTER.md):19PASS/4PARTIAL/
1BLOCKED, with explicit dispositions for all59 scenarios. All30 threats are
mapped separately in security closure.

## 17. Outstanding issues

No secure automatic recovery exists for pre-cutover unproven guest ownership.
Actual persistent cutover/continuity acceptance, rollback-compatible released
manifest, backup/restore/revocation, role/proxy/TLS, retention policy, representative
catalog/load and full product accessibility/device/browser behavior remain open.
No current released image can be certified compatible with this uncommitted
schema/API foundation. Account persistence/merge, transfer, analytics and complete
Checkout are separate capabilities, not claimed omissions hidden by a phase PASS.

## 18. Phase 01B-R readiness

Implementable backend contract is ready. Add one Clear controller intention;
expose deliberate new-session recovery with continuity explanation, quiesce
pending work and clear owner journals before reset. Retain exact-key unknown-
outcome recovery, context selection and blocked-cookie handling. Do not silently
switch owners or treat reset as old-Cart restoration. Complete responsive,
keyboard/high-zoom/accessibility/storage/device/engine failure acceptance under
the frontend assignment. The backend phase did not implement that UI.
