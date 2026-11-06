# Checkout Phase 05A implementation and acceptance

**Overall: PARTIAL. Public purchase and collection: BLOCKED.** The same placement engine commits synthetic guest/account Buy Now and complete-Cart intents in PostgreSQL. Real requests cannot obtain final terms or create a new Order: no approved final commercial/courier/provider resolver is wired to the public boundary. This phase does not change previous acceptance statuses.

The starting branch was `main`, HEAD `06f6d7856064d36d0bc89dd9470ad272ba2c114d`, migration tail `3222_manual_payment_integrity`. The initial working tree already contained tracked and untracked Phase 04B Admin, API, Storefront, Payments and evidence changes. Those changes were preserved. The new tail is `3223_checkout_placement`. No commit, push, Phase 05B UI, persistent migration, production/provider operation or deployment was performed.

## Commercial and transaction design

- Both sources use the Phase 03A merchandise evaluator. Cart locks and validates the complete active Cart, exact revision, line identities, quantities and coupon set; placement calls Cart's semantic conversion only after the Order and obligation exist in the same transaction. Buy Now uses stored line intent and does not require a Cart. The disabled legacy customer writer remains contained; historical Orders and Admin manual Order commands still use their existing paths. Legacy and new writers now share the same coupon capacity operation.
- The component quote stays immutable and nonfinal. The new separate server final-terms fingerprint binds the current component fingerprint and selected method to exact BDT totals and to commercial-policy, method, destination and operating-policy evidence. The placement request acknowledges that final fingerprint; a quote acknowledgement never accepts unknown money. Final terms are recomputed at submit; only the accepted final terms become immutable placement history. The evaluator and commitment use decimal strings/BigInt. The existing Order and amendment equations only support zero tax/fees/rounding adjustments today: the policy seam requires explicit amounts and rejects unsupported nonzero outcomes or non-two-decimal settlement. Zero is exercised only by explicit synthetic policy, and no additional merchant wallet surcharge is added. No real VAT, fees, invoice policy or rounding rule was assumed.
- Checkout first locks live guest/account authority using the existing revocation fence, then the owned draft and owner-scoped receipt. Replay precedes normal expiry/source checks. Database uniqueness on `orders.orders.checkout_draft_id` plus the immutable one-to-one placement binding protects against different keys; the canonical digest rejects changed payloads. The terminal review receipt survives via a savepoint rollback, while all purchase effects are undone; up to 64 terminal review receipts are kept per draft. Invalid authority and missing real policy do not leave a new receipt. Unknown outcomes recover by exact-key replay under current authority; no success is returned before the database transaction resolves.
- In the new purchase path the transaction uses READ COMMITTED with an explicit configuration fence. PostgreSQL [SHARE locks](https://www.postgresql.org/docs/18/explicit-locking.html) conflict with configuration DML, including inserted candidate prices, promotion definitions/targets and delivery rules. Existing writers need no advisory-lock convention to participate. Config reads occur after the fence, so committed writer-first changes are visible; writer-behind operations wait to commit. This is consistent with PostgreSQL's [READ COMMITTED statement visibility](https://www.postgresql.org/docs/18/transaction-iso.html). Configuration includes relevant Catalog, Pricing, Promotions, geography, delivery methods/rates, saved addresses, restrictions, payment methods, destinations/policies, Finance accounts and stock-holding locations. The statement reads stock and usage as observations; Inventory and Promotions make the scarce-resource decisions. Evaluation uses DB wall time after the fence for effective prices and promotions; draft/quote and live authority are checked again before finalizing. This is an evaluation-time rule for scheduled transitions, not a promise that a scheduled price can never tick over before COMMIT.
- The main lock order is revocation → Customer/account/user (account) → draft → idempotency → commercial fence → Cart (if any) → guest CRM identity/customer (guest) → Order sequence/new Order → Inventory item/level → coupon rows → new payment intent. Inventory locks by item/location; Promotions locks coupons in sorted order and counts committed usage in a new READ COMMITTED statement. Existing cancellation and independent receipt operations serialize on their existing Order, then check intent/reservation/financial state; the newly created Order is invisible to those operations until placement commits. The global table fence and mixed older writer paths can still contend or deadlock across different Orders/configuration transactions. No claim of a globally deadlock-free graph. The entire intent retries up to three attempts on PostgreSQL serialization/deadlock errors; per transaction the lock, statement and overall budgets are 2 s, 5 s and 12 s. Lock timeouts propagate as retryable transport failures rather than looping.
- Order lines, recipient/address/rate snapshots, discount applications/allocations, promotion usage, exact unpaid obligation, Inventory reservation/bridge rows, reviewed Cart conversion, immutable placement, draft commit, receipt, audit and outbox are one transaction. Inventory uses existing levels and a shared reservation writer; it locks and checks all selected levels before writing. Quantity must fit in one active stock-holding location per line; a split-location plan is not implemented. The batch emits existing per-reservation audit and outbox facts. Release/dispatch and Finance remain owned by existing semantics.
- Manual obligation resolution checks tenant, active method, provider, current approved receiving revision and matching immutable snapshot, active wallet Finance account and approved operating-policy revision, after the trusted policy decision. The isolated manual fixture uses a synthetic bKash merchant-payment instruction and bounded deadlines. The contract accepts Nagad selection and enforces the matching provider; actual Nagad merchant account/action eligibility is unavailable. No public activation follows from internal `APPROVED`. COD uses no receiving instructions or payment timeout and is unpaid until collection. Manual testimony/verification/refunds remain Phase 04A Payments/Finance responsibilities. No provider calls, Finance postings, purchase analytics, or receipt claims are added to placement.
- Status reads use an authorized account or the original live guest Checkout capability plus an independent Order-specific cookie. The credential is derived for that tenant/session/draft/Order with HMAC, stored only as a hash with DB expiry, reissued only after authorized commit/replay, and revoked by original guest-session revocation. Accounts are attributed to the authenticated Customer, never from recipient contact. Guest CRM matching supplies operations context; it is not the access credential. No cross-device challenge, separate rotation flow, public transfer instructions or claim route exists. Read response uses an Orders/Payments snapshot, private/no-store transport and existing durable IP controls. No grant, contact details or instructions go into placement receipts or Order-placed events.
- Migration 3223 adds tenant-composite references linking the new Order, quote, draft and original obligation; immutable committed ownership/placement; durable review lookup; and guest grant hash/expiry. Legacy Orders have a null draft reference and remain valid. Historical files and checksum baseline were not changed. The additive migration has no automatic down path. An eventual persistent rollout needs a compatible deployment window for new indexes/constraints and forward repair or verified restore; no rollout is authorized here.

## Verification

Verification used an independently initialized PostgreSQL 18.3 cluster bound to `127.0.0.1:55445` (Windows x64). Successful placement was exercised only with package-internal synthetic policy and random disposable databases. No repository environment or persistent database was used. The runner migrates a new randomized database, checks its identity, runs the regression, and drops it. The Worker suite validates the base name `maevelle_test` and creates its own randomized database.

```powershell
$env:TEST_DATABASE_URL='postgresql://checkout_fixture@127.0.0.1:55445/maevelle_test'
node node_modules/typescript/bin/tsc --build --pretty false
node node_modules/typescript/bin/tsc --build tsconfig.build.json --pretty false
node scripts/checkout-phase05a-verification.mjs
node node_modules/vitest/vitest.mjs run packages/database/src/checkout/placement.test.ts --disableConsoleIntercept
node node_modules/vitest/vitest.mjs run apps/api/src/checkout-delivery.test.ts -t 'protects the placement boundary'
node scripts/check-architecture.mjs
node scripts/check-migration-history.mjs
node --test scripts/check-migration-history.test.mjs
node scripts/check-secrets.mjs
git diff --check
```

Typecheck, backend build, focused ESLint and Prettier, architecture (13 packages), and whitespace checks passed. The runner passed 341 regression tests in 29 files and two Worker tests in one file. The regression covers Checkout foundation/delivery/quotes/placement, Cart, Pricing, Promotions, Orders, Inventory, Payments, Finance/refunds, fulfillment, notifications, Auth, Admin payment access and existing Storefront Checkout. The final targeted reruns passed all 32 placement tests (including the added missing destination approval evidence case) and one blocked-boundary HTTP test. These reruns overlap the integrated counts. The Worker retention case initially required its fixture-specific database name, then exceeded its default five-second budget after the full suite; the runner now uses its required base database name and a 20-second test budget, and both Worker tests passed.

The historical migration check still fails on the baseline manifest bytes and 18 historical migration files. The migration policy harness passed 3/4; its baseline acceptance case failed on the same bytes. The secret pattern check flagged seven pre-existing runtime harnesses; none of the Phase 05A paths were flagged. Targeted review checked parameter binding, authority, cookie scope, error handling and payload boundaries; no external scanner received source.

| Synthetic Cart | Per-line writer (before batching) | Batched placement with kill switch |
| --- | ---: | ---: |
| 5 lines | 123 queries, 37 ms | 69 queries, 20 ms |
| 25 lines | 363 queries, 82 ms | 69 queries, 27 ms |
| 100 lines | 1,263 queries, 288 ms | 69 queries, 54 ms |

These are single local samples; the query count is from a Kysely plugin and excludes transaction control outside the query builders. Four one-line guest/account/source samples ranged from about 20 to 71 ms in the final integrated run. Tests observe actual PostgreSQL lock waits for last-resource contention, tariff insertion, destination suspension and account logout. One injected serialization failure took two complete attempts and produced one set of effects. No pool saturation or resource utilization benchmark was performed; the configuration fence and tenant Order sequence require representative mixed-workload measurement before activation.

Test coverage includes both owners and sources, Buy Now Cart preservation, database-level duplicate prevention, same/different keys, payload conflicts, response-discard replay after expiry, Cart edits, price changes, tariff insertion, last stock and coupon, changed final fingerprint, missing policy, method disable, account restriction, logout orderings, revoked guest, wrong tenant/grant, rollback after six write checkpoints, bounded retry, manual unpaid expiry and destination suspension in both lock schedules. Rollback assertions cover Orders, placements, reservations/allocations, payment obligations, redemptions, Cart conversion, audit, outbox and Finance transactions. HTTP tests exercise the blocked boundary and Origin, schema, owner, cache and cookie behavior; the successful public journey is intentionally unavailable.

No physical COMMIT wire-failure simulation, live provider call, public/browser purchase, full cancellation/dispatch/verification contention matrix, external consumer replay for new placement, production ingress/log review or representative connection-pool/load test was performed. Positive provider/courier eligibility, cross-device recovery and manual shopper claims remain blocked. Existing earlier PARTIAL gates, including browser, accessibility, device and role/ingress evidence, carry forward.

## Acceptance register

| # | Requirement | Status | Evidence or remaining work |
| ---: | --- | --- | --- |
| 1 | Unified placement engine | PASS | Both sources and owners use one transaction. |
| 2 | Guest/account ownership | PASS | Live authority, ownership and revoked/wrong-owner tests. |
| 3 | Buy Now and Cart independence | PASS | Both owner/source pairs; unrelated Cart remains active. |
| 4 | Source revision enforcement | PASS | Exact Cart facade, conversion condition and changed Cart test. |
| 5 | Current commercial evaluation | PARTIAL | Shared evaluator and tested price/tariff changes; real courier policy blocked. |
| 6 | Exact final payable contract | PARTIAL | Separate fingerprint and exact synthetic BDT obligation; nonzero adjustments and legal policy blocked. |
| 7 | Method/destination/policy enforcement | PARTIAL | Active matching revisions and suspension tested synthetically; real provider eligibility blocked. |
| 8 | Atomic Order creation | PASS | Faults after Order and later writes leave no Order. |
| 9 | Atomic Inventory allocation | PASS | Batch locks, reservation/bridges and transactional rollback; single location per line. |
| 10 | Atomic promotion redemption | PASS | Shared capacity operation, last coupon and rollback. |
| 11 | Atomic Cart conversion | PASS | Exact reviewed Cart only, including rollback after conversion. |
| 12 | Exact unpaid obligation | PASS | Synthetic amount/currency/method match and zero cash postings. |
| 13 | Checkout-to-Order uniqueness | PASS | Concurrent keys and direct unique-index rejection. |
| 14 | Durable idempotency and replay | PASS | Stable commit and terminal review receipts; exact replay. |
| 15 | Changed payload conflict | PASS | Original key with changed final fingerprint conflicts. |
| 16 | Unknown commit recovery | PARTIAL | Discarded response/exact replay verified; physical wire-loss and browser unverified. |
| 17 | Quote/final-term invalidation | PARTIAL | Component/final separation, changes and expiry checks; full scenario matrix open. |
| 18 | Concurrent stock conservation | PASS | Two shoppers, one remaining unit, one Order. |
| 19 | Concurrent promotion limits | PASS | Two eligible quotes, one last coupon redemption. |
| 20 | Configuration writer consistency | PARTIAL | Verified tariff phantom and destination schedules; cross-domain writer breadth and global fence load open. |
| 21 | Session revocation races | PASS | Both account logout orderings; guest revocation denies access. |
| 22 | Guest/account Order access | PARTIAL | Scoped same-device/account reads tested; standalone rotation/long retention and verified cross-device access open. |
| 23 | Secure status and recovery | PARTIAL | Private committed status and safe exact retry; browser/deployed ingress evidence open. |
| 24 | Manual claim authorization | BLOCKED | Shopper claim endpoint intentionally absent; independent financial verification unchanged. |
| 25 | Cancellation/Worker compatibility | PARTIAL | Synthetic unpaid expiry releases stock once; full verification/cancellation/dispatch races open. |
| 26 | COD/payment separation | PASS | Initial COD/manual obligations unpaid and no Finance postings. |
| 27 | Audit/outbox idempotency | PARTIAL | One committed fact through placement/replay; new Order downstream duplicate-delivery scenario not run. |
| 28 | No unauthorized Finance posting | PASS | PostgreSQL negative and success-path assertions. |
| 29 | Historical compatibility | PASS | Additive schema and populated legacy Order/payment regressions. |
| 30 | PostgreSQL migration integrity | FAIL | Fresh and populated disposable migrations pass; inherited Windows historical byte check fails, baseline untouched. |
| 31 | Realistic performance evidence | PARTIAL | Local sample/query counts and observed lock waits; saturation and representative latency unverified. |
| 32 | Relevant regression coverage | PARTIAL | Focused suites run; remaining scenarios listed above. |
| 33 | No public purchase activation | PASS | Runtime gate and missing real policy tested, no deployment. |
| 34 | Business/provider eligibility | BLOCKED | Real tax, invoice, fees/rounding, provider, carrier/COD, operating and privacy approvals outstanding. |
| 35 | Phase 05B handoff | PASS | [Implemented contracts and gates](PHASE_05B_HANDOFF.md). |
