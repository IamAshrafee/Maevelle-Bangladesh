# Phase 01-C implementation report

1. **Local acceptance** is PARTIAL, with 14 PASS and 2 PARTIAL gates. The [acceptance register](PHASE_01C_ACCEPTANCE_REGISTER.md) records the scope of each result.
2. **Production release readiness** is BLOCKED. Continuity approval and persistent cutover, actual proxy/TLS/roles and business policies require separate decisions and proof.
3. **Executive summary.** Verified guest authority, exact intent/replay, atomic Clear, deliberate forgetting and coherent browser projection on the existing architecture. Closed three reproduced defects.
4. **Git baseline and preservation.** Started on main at aa290065407030e85b5b6847efd22fb437a65279 and captured 2,124 existing file hashes. Main advanced externally to 27b79e9fe1e3111d0f0b5fd9578eeb3636aac4e6 while verification ran. That checkpoint added the initial harness copies. Cleanup restored the tracked copies and reapplied the verified harness refinements. The audit found 2,113 unchanged baseline files and eleven expected edits, with zero deletions. [Preservation evidence](phase01c-evidence/preservation.json).
5. **Contract.** Every supported route is mapped to method, request shape, owner preconditions, outcome, state transition and recovery. Current source supersedes historical frontend omissions. [Matrix](PHASE_01C_CONTRACT_VERIFICATION.md).
6. **Guest journey.** First visit, Add, two-variant selection, header, quantity up/down, remove, coupon, Clear, reload, navigation, tab close/reopen, expiry and deliberate recovery executed. Unknown, pending and confirmed state were checked separately.
7. **Concurrency.** Real PostgreSQL winners for stale desired-state edits and Clear/Add, same-key replay and coupon/Clear via the real Cart API route. Delayed and dropped browser responses preserve original intent and separate current projection from committed receipt.
8. **Auth/session.** Scoped live cookie authority, deliberate context selection, fixed and retired credential refusal, strict shopper A/B/logout/expiry/mapping, controlled account unavailability, and protected legacy Checkout consumers.
9. **Adversarial testing.** Foreign lines/tenant/currency/context, invalid quantities/coupons/UUIDs/body, rate/origin/Fetch Metadata, caching, tampering, rollback and safe logs. No unresolved Critical/High issue demonstrated in exercised scope. [Threat evidence](PHASE_01C_SECURITY_VERIFICATION.md).
10. **Browser/accessibility.** 36 fresh functional Chrome cases, 9 layout/AX checks, 2 native zoom cases, 1 cookie policy and a touch sample. Safari automation was disabled. Firefox, human AT and device verification remain open. [Browser and manual closure](PHASE_01C_BROWSER_ACCESSIBILITY.md).
11. **Performance.** Eight domain statements at 1/20/100 lines, real execution plans, bounded four-way reads and serial revision-checked writes, observed first Add traffic and route script sizes. Synthetic evidence only. [Measurements](PHASE_01C_PERFORMANCE_REGRESSION.md).
12. **Evidence recovery.** Exact original 01A-R artifact recovered from local Git blob and verified by SHA-256. Regenerated artifact and all historical reports are preserved. Benchmark output requires explicit exclusive creation. Both no-output and existing-path behavior tested. [Provenance](PHASE_01C_EVIDENCE_INTEGRITY.md).
13. **Cutover.** Verified fresh and populated migration paths and a synthetic dump/restore, with matched Cart, line, receipt and outbox row hashes. Persistent legacy retirement needs business approval, controlled sequencing and restore/revocation validation. [Decision record](PHASE_01C_CUTOVER_READINESS.md).
14. **Regressions.** 189 tests passed and one Orders delivery-pricing test failed across 20 files. The initial unmigrated run failed 23 Orders tests, which require preapplied migrations. After provisioning, the remaining Orders test attempts to create the same country/currency/geography/priority as the default seeded rule. All 22 other Orders tests and all 19 other files passed. Preserved the [baseline run](phase01c-evidence/baseline-tests.txt) and [final run](phase01c-evidence/closure-tests.txt).
15. **Defect closure.** Recovery verification honors Retry-After without losing its intent. Malformed assembled JSON returns 400 without cookie or retry. Cart log templates omit coupon path values and cookies. Each defect has a failing reproduction and passing regression.
16. **Coverage.** The [scenario matrix](PHASE_01C_SCENARIO_RESULTS.md) maps current S IDs and the security report maps T IDs. Future commerce/merge/transfer/analytics and operational coverage remains distinct.
17. **Local register.** Browser breadth and the broader Orders regression gate remain partial. Chrome native zoom and artifact recovery have fresh closure evidence.
18. **Release blockers.** Obtain continuity and privacy/policy decisions, authorized persistent migration/restore/revocation proof, actual deployed TLS/proxy/roles/cache/log evidence, representative load and device/AT acceptance, then planned commerce and account completion.
19. **Phase 02A readiness.** Implementation contract covers exact variant configuration and replacement/collision, quantity and stock, price/compare-at, coupons and stacking, lifecycle, validation, batching and integrity. [Handoff matrix](PHASE_01C_PHASE02A_HANDOFF.md).
20. **Next action.** Start Phase 02A only as a separate assignment using that matrix. Schedule manual browser/device and screen-reader checks against the isolated fixture and track the Orders fixture failure in its owning domain. Carry the continuity decision into release planning.

## Reproduction commands and limits

PostgreSQL 18.6 in the labeled cart01c-isolated tmpfs container on 127.0.0.1:55444, database maevelle_test. Verified identity before tests. The source runner migrates the test database before the Orders suite, and Cart suites create their own random databases. Browser runtime uses synthetic products, warehouse, prices, coupons and verified shopper accounts. The Next standalone output uses the generated static assets. The fault proxy and browser profiles are loopback and disposable.

```sh
# Export TEST_DATABASE_URL for the verified loopback container and a new CART_PERFORMANCE_OUTPUT.
DATABASE_URL="$TEST_DATABASE_URL" pnpm exec tsx packages/database/src/migrate-cli.ts
pnpm exec vitest run packages/database/src/cart-{foundation,credential-closure,reassessment}.test.ts apps/api/src/cart-{foundation,credential-closure}.test.ts apps/api/src/shopper-auth.test.ts packages/database/src/orders.test.ts apps/worker/src/worker.test.ts apps/storefront/features/cart/*.test.ts apps/storefront/features/pdp/pdp-product-details.test.tsx apps/storefront/features/wishlist/*.test.ts apps/storefront/lib/analytics/wishlist-telemetry.test.ts tooling/architecture-boundaries.test.mjs
STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002 STOREFRONT_BASE_URL=http://localhost:3000 pnpm --filter @maevelle/storefront build
pnpm exec tsc --project apps/api/tsconfig.json --noEmit --pretty false
pnpm exec tsc --project apps/storefront/tsconfig.json --noEmit --pretty false
pnpm exec eslint apps/api/src/{app.ts,cart-foundation.test.ts,routes/cart-protection.ts} apps/storefront/features/cart/{controller.ts,controller.test.ts} packages/database/src/cart-reassessment.test.ts scripts/cart-phase01c-*
pnpm check:architecture
pnpm check:migrations
git diff --check
```

Browser commands and setup are in the [harness record](phase01c-evidence/browser-harness.md). Earlier harness attempts exposed cached fixture tenant selection on an API restart and standalone static assets missing at process startup. Fresh standalone startup with copied static assets and matching fixture resolved both. Raw attempts are kept separately. Scoped lint and type checks passed. Prettier on the entire existing app file reports inherited Wishlist formatting, which was left intact.

Full monorepo suites, production load, persistent cutover and shared services were outside this run. Test processes and the verified disposable database were cleaned up. [Cleanup record](phase01c-evidence/cleanup.json).
