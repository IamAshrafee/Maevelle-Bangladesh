# Phase 01A.1 executed test evidence

2026-11-02, Asia/Dhaka. New evidence only; historical Phase00/01A/01B results are not rewritten. All PostgreSQL work used verified `maevelle-cart01a-pg18`, PostgreSQL18.6, label `maevelle.purpose=cart01a-isolated`, tmpfs `/var/lib/postgresql`, loopback55441. Ordinary persistent local/Wishlist/staging/production databases were untouched.

## Executed commands

Use `<isolated-test-url>` for the synthetic local server URL ending `/maevelle_test`. No environment file changed. `isolatedCartDatabase()` creates, verifies and drops only its random newly created sibling. Shopper tests and upgrade CLI likewise create unique siblings. Orders regressions used the already verified synthetic browser database, not the unmigrated template.

```sh
pnpm exec tsc --build packages/database/tsconfig.build.json apps/api/tsconfig.build.json --pretty false
TEST_DATABASE_URL=<isolated-test-url> pnpm exec vitest run packages/database/src/cart-credential-closure.test.ts packages/database/src/cart-foundation.test.ts apps/api/src/cart-credential-closure.test.ts apps/api/src/cart-foundation.test.ts apps/api/src/shopper-auth.test.ts apps/storefront/features/cart/controller.test.ts apps/storefront/features/cart/pending-journal.test.ts apps/storefront/features/pdp/pdp-product-details.test.tsx tooling/architecture-boundaries.test.mjs
TEST_DATABASE_URL=<verified-synthetic-browser-db-url> pnpm exec vitest run packages/database/src/orders.test.ts -t '^(?!.*manages delivery pricing rules)'
UPGRADE_TEST_ALLOW=1 TEST_DATABASE_URL=<isolated-test-url> node packages/database/dist/src/upgrade-test-cli.js
pnpm exec tsc --project apps/api/tsconfig.json --noEmit --composite false --incremental false --pretty false
pnpm exec tsc --project packages/database/tsconfig.json --noEmit --composite false --incremental false --pretty false
node scripts/check-architecture.mjs
node scripts/check-migration-history.mjs
git diff --check
```

Results: **92 PASS /9 files**, then **22 PASS /1 intentionally excluded** Orders tests: **114 selected passing tests /10 files**. Build and API/database type checks passed. Populated CI upgrade passed **12 post-baseline migrations**, including new3213/3214 Cart fixtures, representative retained lines/receipt/revisions, new issuance, old-writer refusal, irreversible retirement and ledger rerun. Fresh empty installations are exercised repeatedly by isolated test setup. A final focused13-test rerun passed after refining the unchanged-row lock-expiry barrier and adding concurrent duplicate refused-initialization assertions; these reruns are not added again to the114 unique selected tests. Migration history passed63 registered/51 immutable baseline migrations. Architecture passed13 workspaces. Targeted ESLint passed over Cart context/Checkout adapter, orders/shopper routes, API foundation/closure tests, database context/credentials/foundation/closure/testing fixture/new migration/upgrade fixtures, and the two new scripts. No package install/version/framework configuration change.

## Real browser runtimes and commands

```sh
CART_01B_ISOLATED_URL=<owned-loopback-template-url> pnpm exec tsx scripts/cart-phase01b-runtime.ts
STOREFRONT_BASE_URL=http://localhost:3000 STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002 pnpm --filter @maevelle/storefront exec next start --port 3004
node scripts/cart-phase01b-browser-proxy.mjs
node scripts/cart-phase01b-browser-acceptance.mjs
TEST_DATABASE_URL=<owned-loopback-template-url> pnpm exec tsx scripts/cart-phase01a1-runtime.ts
node scripts/cart-phase01a1-browser.mjs
```

Installed Chrome launched in its own `/tmp/maevelle-cart01a1-chrome` profile with `--headless=new --remote-debugging-port=9227 --no-first-run --no-default-browser-check`. TLS runtime requires a one-day self-signed RSA2048 localhost certificate/key in private `/tmp/maevelle-cart01a1/`; browser ignores that certificate error only for the disposable test connection. No dependency installation, app TLS policy change or real certificate configuration. Next used the existing production build because frontend source did not change. No new frontend build is claimed.

- [Nine new HTTPS scenarios](phase01a1-evidence/browser.json), actual Chrome156/API/PostgreSQL. C01 pre-cutover HttpOnly fixed-cookie Set-Cookie → real3214 migration → no private response, old equality reader0, quantity2/version2/receipt1 retained. C02 same old value planted by fixture into a genuine Secure __Host slot remains invalid. C03 production host/path/Secure/HttpOnly/Lax/30-day attributes, JS cannot see credential, required round-trip, duplicate exact mutation receipt. C04 mixed fixed/new refuses without deleting new acknowledged quantity. C05 actual existing shopper A/B and Checkout refusal. C06 suspended CRM mapping503 then logout resumes same independent guest. C07 concurrent browser revoke/mutation and old-key replay denial. C08 encrypted secondary-storage session TTL set into past, actual browser still sends cookie, Cart and Checkout401 without guest fallback. C09 holds an actual old Set-Cookie response until new guest add is acknowledged; both HttpOnly cookies coexist, fixed cookie refuses and cannot replace slot or revive retired Cart; explicitly removing it reveals unchanged new quantity.
- [17 existing Chrome scenarios rerun](phase01a1-evidence/phase01b-regression.json), actual PDP/header/page, all five commands/coupons, exact recovery, delayed new slots, real A/B UI, cross-tab locks/updates, storage denial, history/navigation and bounded responsive/keyboard checks. These are newly executed regressions, not copied historical PASS claims.

The HTTPS fixture routes exist **only** in the loopback synthetic script. Production buildApi does not register them. Fixture seed/retire/expire/hold endpoints intentionally control real database and Set-Cookie transitions; API authorization and cookie browser enforcement are actual implementation, not mocked Cookie headers or synthetic Cart payloads. Browser runtime databases remain available for inspection; no shared DB reset or persistent migration occurred.

## Required scenario coverage

| Requirement family | Executed coverage |
| --- | --- |
| Valid/invalid/expired/revoked/forged legacy; wrong tenant/owner; retired replay | Fixed credentials uniformly refused; C01/C02; API lifecycle/foreign/context tests; DB expiry/revocation; public-ID foundation tests |
| Multiple old/new credentials; duplicate adoption | Mixed fixed/new and malformed/retired slots refuse; multiple valid slots explicitly select; no adoption endpoint or success state exists. Repeated denied initialization cannot issue a replacement |
| Attacker-supplied credential / late Set-Cookie | C02 fixed token relabeled as __Host; API exact-slot mismatch; C09 actual held fixed response; B07 actual held new initializer |
| Concurrent old/new requests / retirement / token after migration | Row-lock DB tests and C07; C01 hash-equality read0; browser C09 preserves separate new intent |
| Rotation during mutation / lost transition response | Policy has no rotation/adoption. Irreversible retirement serializes with mutation; duplicate migration ledger rerun is safe. B03/B04/C03 test lost successful mutation response; new token never depends on receiving a replacement Set-Cookie |
| Expiry during operation | Guest expiry after lock wait denied by database clock; C08 actual shopper TTL expiry; accounts have no permitted Cart mutation |
| Guest→sign-in→logout; A→B; invalid session; resolver/mapping failure | API real shopper A/B/logout/suspended mapping, outage injection; B08/B15; C05/C06/C08 |
| In-flight owner switch | Existing controller late-response epoch tests rerun and actual B08 delayed mutation/auth transition; no store change |
| Existing intent/receipts/revisions | Populated3212→3213→3214 integration, dedicated CI upgrade cases, C01, DB credential retirement test |
| Guest PDP/Cart/Checkout readers; no private item disclosure | B01–B17, eight Checkout verbs account-denial test, guest Checkout201, foreign-token/owner tests,22 Orders regressions |

## Failed development runs and limits

Initial closure fixture lacked TEST_DATABASE_URL; a subsequent run used stale dist exports and returned503 from the new column lookup. Required package build corrected that mismatch. Real-auth fixture initially used default auth URL containing `/api`, causing404; explicit existing realm base URL corrected it. A shopper regression invocation with the wrong template pathname refused at its safety gate; rerun with `/maevelle_test` passed. Orders initially targeted an unmigrated isolated template and failed22 missing-relation tests; rerun against verified migrated synthetic database passed22. No production/shared target was used.

First browser regression sequence failed B02 before any initialize request, causing dependent B03–06/B10 failures. A warm rerun passed all17; no application fix was made on that evidence. Cold harness click-before-hydration is the likely cause, not a proven product root cause; do not count the failed run as passing. One combined run passed91/failed1 on overlapping prices: synthetic host-clock effective_from could be slightly ahead of database time. The shared synthetic fixture now uses an explicit start one minute in the past; final92 passed. Initial script lint errors were corrected before final checks.

No Safari/Firefox, physical device, screen-reader, browser-menu high zoom, staging proxy/TLS, production migration/load/backup recovery or full Wishlist/Admin suite was executed. CSS zoom/header gap remains Phase01B.1. Tests prove targeted ownership/refusal and retained data, **not functional recovery of unproven pre-cutover Carts**. Full account persistence/merge remains Phase03, full atomic Clear Phase02A. No ASVS/WCAG or complete Checkout certification is claimed.
