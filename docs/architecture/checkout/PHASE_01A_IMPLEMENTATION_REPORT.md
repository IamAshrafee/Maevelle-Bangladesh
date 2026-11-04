# Phase 01A — Backend foundation and ownership

Overall: **PASS for the assigned backend foundation, locally verified**. Checkout purchases, payment collection and production drafts remain disabled. Full Checkout, frontend/browser acceptance and production readiness are not complete. This report supplements the immutable Phase 00 baseline, not a claim of later phases.

## Baseline and scope

Initial branch `main`, HEAD `5a8c8ff4bfa4f85e7a05878a5048b561d0fc5da2`, clean working tree. Final branch/HEAD unchanged; only implementation, focused tests, new migration and relevant Checkout/continuity documentation changed. All work remains uncommitted. No staging/production data, provider account, persistent local database, VPS/container configuration, deployment, commit or push was changed. Storefront/Admin UI and Worker source are untouched.

The existing pnpm command automatically materialized the already-locked toolchain while starting verification; no dependency version or lockfile changed. Database package exports were extended for Checkout and session fencing. No new infrastructure dependency was introduced.

## What changed and why

- Dedicated implementation-2 draft persistence supports owner-isolated Cart and Buy Now sources. Guest identity is independent of Cart; explicit IDs support multiple tabs, bounded active drafts and safe restoration.
- Account authority derives from the actual shopper realm and mapping. Shared transaction fencing plus revocation tombstones prevents logout/refresh races and denies stale session proofs. No typed phone grants Customer data access.
- Initiation, edits/abandon and adoption have owner-scoped durable idempotency and string revisions. Same key/different content conflicts; receipt replay precedes stale-source/version checks. Real races protect capacity and revocation.
- Cart initiation uses a transaction-aware Cart read/lock operation and complete eligible source revision; it never converts or clears. Buy Now checks Catalog structure/publication, stores independent intent and never touches a Bag. Neither returns financial promises.
- Adoption requires both live proofs, changes only that draft, and explicitly flags Cart re-review without auto-merging Bags. Source refresh/rebinding is deliberate.
- Strict origin/JSON/body/unknown-field validation, no-store/no-referrer, trusted-client durable quotas, sanitized error/log behavior and production-disabled feature controls wrap the new APIs.
- Legacy shopper purchase/current APIs and weak number+phone tracking are contained. Historical confirmation APIs are tenant/lifetime/capability scoped and claim writes origin protected. Dormant frontend synthetic fallbacks remain untouched and release-blocking.

Significant deviations from Phase 00: use separate `orders.checkout_drafts` rather than extend legacy mandatory-Cart/payment sessions; choose READ COMMITTED after real capacity contention exposed stale Repeatable Read counts; bind adoption of Cart intent to an explicit account-Cart review; fence actual encrypted secondary storage rather than non-authoritative `iam.sessions`. See the [implemented contract](PHASE_01A_BACKEND_CONTRACT.md) for rationale and exact available API, DTOs, limits and future transaction interfaces.

## Database compatibility

New forward-only `3219_checkout_foundation` registers after inspected 3218 tail. Adds guest authority, implementation-2 drafts/lines and shopper revoked-key tombstones; tenant-composite owner/Cart/variant FKs, ownership/source/revision/quantity checks, owner/expiry/source indexes and normalized item intent. No authoritative price/stock columns; no historical migration edited or old financial/Order link rewritten. Existing platform idempotency records serve `checkout.foundation.*` operations.

Fresh migration application succeeded in the API fixture. Populated 3218→3219 retained synthetic legacy Checkout/Order linkage and tested tenant/owner/source/quantity/revision constraints. Registered upgrade-case fixture covers the new migration in the existing upgrade framework. No persistent migration/target ledger access occurred. Auth writer rollout is coordinated; a pre-01A API cannot be a safe writer rollback after new revocations begin. Forward repair/updated auth reader-writer and isolated restore/revocation continuity must precede any later deployment.

## Verification actually run

Dedicated temporary PostgreSQL **18** cluster initialized on loopback port **55439**, trust auth confined to local synthetic fixture user. All new tests create random databases through the existing isolated fixture and drop them after use; existing Orders/Payments tests use the newly created disposable `maevelle_test` in that cluster. The existing local PostgreSQL service and Docker project were not migrated or mutated. Test email stays in an injected memory mailbox; no provider delivery/payment. The task-owned cluster was stopped afterward and `pg_ctl status` confirmed no server running. Exact command/result summary: [verification record](PHASE_01A_VERIFICATION.json).

| Check | Observed result |
| --- | --- |
| `vitest run apps/api/src/checkout-foundation.test.ts packages/database/src/checkout/foundation.test.ts` with explicit isolated TEST_DATABASE_URL | **16/16 PASS**, two files. Includes new session/owner/source APIs, real shopper login/logout, concurrency, database constraints, rollback and upgrade fixtures. |
| Focused Cart/Auth/Orders/Payments regressions: `packages/database/src/{orders,payments,cart-foundation}.test.ts`, `apps/api/src/{cart-foundation,cart-credential-closure,shopper-auth}.test.ts` | **107/107 PASS**, six files. Legacy HTTP expectations updated specifically for the intentional disabled replacement boundary; Cart isolation and real business-domain tests retained. |
| `tsc -b packages/contracts packages/database apps/api --pretty false` | PASS; includes focused source/test typechecking. |
| `tsc -b apps/api/tsconfig.build.json --pretty false` and database/contracts/config dependency builds | PASS; no frontend/all-package build run. |
| ESLint on changed/new TypeScript files; focused Prettier and `git diff --check` | PASS at final verification; no full-repository lint/test/release suite. |
| `node scripts/check-architecture.mjs` | PASS, 13 workspace packages. |
| Raw `node scripts/check-migration-history.mjs` in Windows worktree | **FAIL: existing CRLF byte mismatch**, not a changed historical migration. HEAD baseline manifest hash equals the anchored digest; all 51 historical Git blobs match recorded SHA-256 and worktree text matches after CRLF normalization. LF temporary-tree validator PASS: 68 registered migrations, 51 historical baseline entries, zero mismatches. No baseline regeneration/history edits. |

Initial test runs exposed/fixed the active-cap snapshot race and two synthetic fixture schema errors; final success counts above exclude failed development attempts. API replay was also corrected so Cart liveness is validated after canonical receipt recovery. No real network connection loss at COMMIT, live ingress/log canary, actual runtime DB role, full load, browser/AT or deployed mixed-version acceptance was performed. Unknown-response recovery is tested by replay through a second API instance; transactional rollback is tested with PostgreSQL fault injection.

## Scenario and acceptance register

| Criterion | Status / evidence |
| --- | --- |
| 1. Modular Checkout foundation exists | PASS — dedicated domain, transport/protection/context, shared DTOs |
| 2. Guest/account ownership enforced server-side | PASS — live KV proof, guest hashes, mapping checks and denial tests |
| 3. Independent Cart/Buy Now sources | PASS — canonical line provenance, eligible Cart revision, no hidden Cart |
| 4. Persistent draft/revision/lifecycle/restore | PASS — exact string revisions, derived DB-time expiry, abandon and bounded active count |
| 5. Strict validation and idempotent initiation | PASS — malformed/extra/oversized/source/key conflicts and concurrent replay |
| 6. Adoption and revocation concurrency | PASS — dual proof, canonical adoption, both revocation orderings, stale-refresh prevention and source re-review |
| 7. Isolated migration/constraint compatibility | PASS — fresh schema plus populated predecessor fixture, old links retained, negative constraints |
| 8. Usable Phase 01B contracts | PASS — implemented endpoint/DTO/error/header protocol, no pretend quote/payment/Order fields |
| 9. Existing Cart/Auth/Order business operations | PASS — 107 focused regressions; intentional legacy HTTP gate change documented |
| 10. Legacy security boundary | PASS backend — old writers/tracking disabled, confirmation scoped; **frontend fallback replacement remains an external-to-01A release blocker** |
| 11. No real Checkout purchase enabled | PASS — default-off/non-production draft gate, unconditional old purchase gate, unchanged unavailable UI |
| 12. API/security/concurrency tests | PASS — 16 focused new tests on PostgreSQL plus regressions |
| 13. Significant remaining issues visible | PASS — limitations and handoff below; no unverified ownership/migration/revocation closure claimed |

Priority scenario portions S03/S04/S17/S18/S42/S43/S45: **PASS for Phase 01A backend scope**. Their complete purchase/browser journeys remain NOT VERIFIED/unimplemented until corresponding B/later phases. Negative-side-effect assertions confirm zero Orders, payment intents, inventory reservations, promotion redemptions or purchase outbox facts from draft operations; Bags retain versions/items, no payment instructions are sent. Ownership/tenant/PII boundaries have adversarial API tests, not merely mocks.

## Changed-file map

| Area | Significant paths |
| --- | --- |
| Shared contract/config | `packages/contracts/src/checkout.ts`, root export; `packages/config/src/index.ts` development gate |
| Schema/upgrade | `packages/database/src/migrations/3219_checkout_foundation.ts`, registry; `checkout/upgrade-cases.ts` and upgrade registry |
| Domain | `packages/database/src/checkout/{authority,commands,queries,source,types,index}.ts` |
| Auth/revocation | `packages/database/src/shopper-session-fence.ts`, shopper internal proof type; `apps/api/src/auth/{shopper-auth,secondary-storage}.ts`, shopper resolver |
| Narrow domain integration | `packages/database/src/cart/checkout-source.ts`, Cart facade; shared Catalog eligibility extracted from existing Cart assertion |
| API/containment | `apps/api/src/routes/{checkout,checkout-context,checkout-protection,checkout-errors,checkout-legacy}.ts`, route composition, legacy context/Orders and safe logging |
| Tests | `apps/api/src/checkout-foundation.test.ts`, `packages/database/src/checkout/foundation.test.ts`, updated legacy-gate assertions in two Cart API files |
| Continuity | Checkout index/contract/report/evidence and Product Completion focus/state |

## Remaining gates and Phase 01B handoff

Phase 01B can integrate **only** the available foundation contract: explicit guest establishment/cookie echo, selected guest header or live account partition, source initiation, restore, safe edits/abandon, explicit adoption and owner-partitioned recovery of the original idempotency key. No contact/address/payment/quote/submission/status-grant capability exists yet. Keep form state narrow, clear account-private data on account switch, ignore delayed old-partition responses and never show success from fixture fallback. Public purchase gate remains off. No Phase 01B work was started here; it requires a separate assignment.

Later release blockers: replace legacy frontend confirmation synthetic fallback; complete quote/commercial lock graph, placement/grants/recovery and payment policies; approve production TTL/caps/retention and tombstone cleanup; confirm provider/legal/tax/recipient/consent policies; verify actual migration ledger/roles/backup/restore/ingress and coordinated auth-writer rollout; real device/accessibility and load acceptance. Raw Windows migration hash verification needs a clean LF checkout or equivalent byte-preserving workflow, never a regenerated baseline. These do not invalidate the isolated Phase 01A functional evidence, and none was performed against a live target.
