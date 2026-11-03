# Phase 01A-R verification evidence

2026-11-03. Final source: dirty `main` at unchanged HEAD
`aa290065407030e85b5b6847efd22fb437a65279`. No commit was created.
Node24.18.0 / pnpm11.19.0 / TypeScript5.9.3 / PostgreSQL18.6 / Vitest5.0.5.
Installed dependency versions were inspected; no package installation or upgrade.

## Reproducible focused commands

For DB commands set TEST_DATABASE_URL to a dedicated, verified test instance.
This execution created its own labelled tmpfs container on127.0.0.1:55442;
never substitute a shared/production URL. Local synthetic connection credentials
are disposable fixture values, not application secrets.

```sh
pnpm --filter @maevelle/database build
pnpm exec tsc --build packages/database/tsconfig.json apps/api/tsconfig.json apps/storefront/tsconfig.json --pretty false
pnpm exec vitest run packages/database/src/cart-foundation.test.ts packages/database/src/cart-credential-closure.test.ts packages/database/src/cart-reassessment.test.ts apps/api/src/cart-foundation.test.ts apps/api/src/cart-credential-closure.test.ts apps/storefront/features/cart/controller.test.ts apps/storefront/features/cart/pending-journal.test.ts
UPGRADE_TEST_ALLOW=1 pnpm exec tsx packages/database/src/upgrade-test-cli.ts
pnpm check:architecture
pnpm check:migrations
```

Final tests: **85 PASS / 7 files / 0 failed / 0 skipped**,12.91 seconds in the
recorded run. [Raw final output](phase01ar-evidence/final-tests.txt).
Initial baseline-oriented run passed46 tests; the first new reassessment run
failed3 tests because API imports used stale compiled exports and two synthetic
fixtures violated required customer-number/SKU-normalization constraints. Rebuild
and fixture corrections resolved those failures; no regression assertions were
removed to conceal them. The intentionally obsolete public unkeyed-success test
was replaced with an explicit refusal/no-write assertion. The final suite adds
15 AR-numbered database/API cases; some case numbers live in the API file and
others in the database file. Historical counts in earlier reports are unchanged.

Targeted DB/API/Storefront typechecking PASS (no diagnostics). Database build
PASS. Scoped existing ESLint PASS (no diagnostics), applied to Cart API/context/
protection, Cart DB modules, Pricing, shared Cart contracts/exports, migration
registry/new3215, focused tests and the two new browser harness scripts.
No new SAST dependency/scanner was installed. Architecture PASS13 workspaces;
migration history PASS64 registered/51 immutable baseline migrations.
Generic populated upgrade PASS13 post-baseline migrations. Logs:
[types](phase01ar-evidence/typecheck.txt), [build](phase01ar-evidence/database-build.txt),
[lint](phase01ar-evidence/lint.txt), [architecture](phase01ar-evidence/architecture.txt),
[history](phase01ar-evidence/migration-history.txt), [upgrade](phase01ar-evidence/upgrade.txt).

## Database integrity and failure evidence

Tests create random owned databases and run real migrations; no SQL mocks.
Coverage includes concurrent duplicates, same key changed payload, tenant/key
separation, expired consumed receipts, no-op receipts, price-only revisions,
competing revision winner, actual pg_terminate_backend during a transaction,
rollback of writes/receipt/outbox, reconnect recovery, published/draft redaction,
foreign tenant and public identity attempts, irreversible retirement and expiry
while waiting for a lock. AR01 additionally uses independent pools to simulate
separate process ownership of connections; this is not an actual separate-OS-
process termination test. Existing two Fastify instances prove shared rate limits.

Clear: line+coupon atomic removal,12 duplicate contenders, same receipt/event,
no stock mutation, stale desired-state refusal, no-op semantics, Add-versus-Clear
race, trigger-induced failure after deletion, exact-key recovery. Fresh and
populated migrations include invalid legacy data fail/repair/retry. Creation
with failed initial projection rolls back its inserted row. Compare-at-only edits
change evaluation fingerprint without intent revision change.

## Real browser protocol

Chrome156.0.8078.74; two dedicated headless profiles with no user browsing state.
Self-signed HTTPS localhost:3444 certificate exception is confined to these local
synthetic profiles. One profile blocks first-party cookies through browser user
preferences; actual Network blocked reason is UserPreferences. Harness endpoints
exist only in scripts/cart-phase01ar-runtime.ts, never buildApi.

Commands: start the isolated runtime with TEST_DATABASE_URL, launch separate
Chrome profiles on9229/9230, then `node scripts/cart-phase01ar-browser.mjs`.
The scripts intentionally use fixed local fixture paths/ports and require a
fresh synthetic setup; they are not production smoke tooling.

**5 PASS / 0 failed**: delayed independent initialization after acknowledged Add;
actual production cookie attributes/HttpOnly visibility; concurrent Clear and
stale revision; cookie-only reset preserving DB state; cookie rejection refusing
the attempted mutation. [Machine-readable evidence](phase01ar-evidence/browser.json).
These are real fetch/Set-Cookie/PostgreSQL tests, not UI/accessibility acceptance.

## Performance and query plans

AR08 instruments Kysely query execution without logging credential parameters.
Ten read samples each at1/20/100 lines:8 SQL queries at every size. Final measured
medians4.45/4.60/5.64ms; sample p95 (maximum of10)4.84/5.19/6.85ms.
The count includes two SET LOCAL budget statements and excludes driver-managed
BEGIN/COMMIT. Includes full Cart projection and promotion invocation; benchmark variants have prices but no stock.
Matched promotions can add target queries in the existing Promotions engine;
this benchmark is not a bound independent of promotion count. Price-plan execution0.090ms; owner hash lookup0.004ms, using its unique index.
Real EXPLAIN ANALYZE BUFFERS JSON stored in
[performance.json](phase01ar-evidence/performance.json). Synthetic catalog size,
localhost timing and low concurrent load limit these results. No speculative
cache/index/infrastructure was added from this small sample.

## Not run / open

No full monorepo suite/build, staging smoke, release-readiness suite, production
load test, backup drill, persistent DB migration, VPS operation or dependency
audit. Complete UI/high-zoom/accessibility, Safari/Firefox, mobile devices,
cookie eviction/background suspension, denied Web Locks/storage and reset versus
late-bootstrap UI recovery are not claimed. Actual separate-process kill of the
API/Worker, Cart retention interruption and representative catalog/query plans
remain unverified. No cleanup requiring unapproved business policy was activated.
