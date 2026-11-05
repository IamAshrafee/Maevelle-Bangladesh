# Phase 03A implementation and acceptance

Date: 2026-11-04 (Asia/Dhaka). Overall: **PARTIAL**.

The server-authoritative component-quote backend is implemented and locally verified. Both sources share merchandise evaluation; quotes and allocations are immutable, revision-bound, authorized, recoverable and snapshot-consistent. Tax, payment fees, final payable rounding, approved receiving destinations and real courier compatibility remain unresolved. Consequently this is not a placement-ready financial commitment. Phase 01B and Phase 02B stay **PARTIAL**. Public purchases and production drafts remain disabled.

## Repository baseline and scope

Initial/final branch: `main`. Initial HEAD: `2fd662eb2b515d0cda250b11b0e60a5883249901`. Final HEAD: `504e53b71ba2c05d1c174d435d69846721b05242`. Another actor committed the preserved Phase 02B work at 21:53:07 +06:00 during this task; that commit contains no Phase 03A backend code. The agent made no commit or push. Initial tree already contained ten tracked modifications and untracked Phase 02B frontend, tests, runtime fixture and handoff/report files. Those changes were preserved. In particular the existing two-byte `PHASE_02A_IMPLEMENTATION_REPORT.md` was not reconstructed or edited. No Storefront source was edited by 03A; existing frontend tests were run for compatibility. The final tree adds uncommitted backend/contracts/migration/tests and these documents, and extends existing shared tracker/index/scenario/security documentation.

The registered migration tail inspected before implementation was `3220_checkout_delivery`; `3221_checkout_quotes` was unused and is the sole new migration. No persistent ledger was queried or migrated. The new temporary cluster's template had no application ledger; random test databases were migrated only after identity verification. The agent performed no commit, push, deployment, production/staging connection, real provider action or payment.

## Ownership and architecture decisions

| Authority | Reuse / change |
| --- | --- |
| Checkout | Existing authority locks, root revision, active/expiry checks, durable receipts, audit and nonproduction transport protection; new quote orchestration/store/view and acknowledgement |
| Cart | New source-only transaction facade checks live owner, exact Cart identity/revision, complete lines and coupons; no mutation/conversion; the regular Cart now delegates its unchanged merchandise calculation to the common evaluator |
| Catalog | Existing publication/status and structural variant predicate, batched with product/category/version metadata |
| Pricing | Existing temporal batch resolver; its result now includes optional string revision provenance; price math is not copied |
| Promotions | Existing eligibility, targeting, minimum-spend, priority/stacking and deterministic allocation; provisional reads support verified Customer limits and total usage limits; a domain-owned opaque configuration digest detects insert/priority/target changes |
| Inventory | Existing available-to-sell query over active Inventory items, warehouse levels and STOCK_HOLDING locations; no balance/reservation writes |
| Delivery / Orders / Geography | Existing serviceability statement and Orders tariff resolver; exact existing priority rules and explicit district-or-finer approved coverage |
| Customers / Shopper Auth | Existing active Customer/account/user authority and revocation fences, purchase-specific delivery snapshot and saved-address association checks |
| Payments / Finance | Inspected but not invoked. Existing method reads may initialize defaults, so quotation does not use them as a side-effect-free readiness oracle. No approved immutable receiving-destination/fee/tax contract exists to justify a final payable |

`commerce/merchandise.ts` is extracted from the actual Cart implementation, not a new independent Pricing or Promotions calculator. BUY_NOW supplies its own draft lines and explicit coupons without a hidden Cart. CART supplies only its exact accepted complete intent and Cart coupons. Account quoting can evaluate verified Customer-limited coupons; anonymous Cart previews and guest quotes do not claim such eligibility.

Historical Orders still uses its existing Cart/final promotion calculation and locked redemption transaction. It does not consume replacement quotes and remains gated. The regression run found that applying a provisional coupon-limit filter to that final legacy candidate evaluation could silently omit its locked redemption check. The filter was restricted to provisional evaluation, preserving the legacy check; all 24 Orders regressions then passed. No placement implementation or broad legacy rewrite was introduced.

## Evaluation, exact money and delivery

New work locks live authority then the owned draft, verifies expected root revision and active expiry, rechecks organization status/currency and source, and authorizes/locks the Cart when applicable. Delivery revalidates normalized purchase-specific contact, saved-address revision/status, active BD ancestry, approved coverage, HOME_DELIVERY and current tariff/configuration. Stale Cart, changed/removed saved address or unreviewed delivery configuration fails before quote persistence. No items are silently removed or substituted.

Catalog/prices/availability are batched. Promotions calculates remaining eligible gross with the established priority/STACKABLE/EXCLUSIVE semantics, positive four-place percentage truncation, capped discount and largest-remainder allocation with stable line-ID ties. Existing target inclusions define the eligible set; no unsupported exclusion engine or invented discount type was added. Nonbeneficial requested coupons are explicitly NO_CURRENT_BENEFIT. Quote/review never redeems or increments usage. Eligibility can be lost before placement; multiple shoppers can simultaneously qualify for the last coupon without owning it.

Money uses BigInt at scale 10,000 and decimal strings. The reused Cart parser/serializer now reject invalid precision/coercion and numeric(20,4) overflow rather than truncating. Whole quantities multiply exactly. Zero prices, zero shipping and zero discount remain valid. Header/line equations and per-promotion/per-line allocations are checked at commit in PostgreSQL. Tests cover scale limits and deterministic residual conservation. Legacy Orders' positive multiplication/zero-tax storage was inspected; it is not evidence of approved tax or final rounding policy.

`evaluatedTotal = merchandiseSubtotal - discountTotal + shipping`. Tax/payment fees/payable are **null**, never guessed zero. The DTO is explicitly nonfinal with purchase unavailable and named blockers. No two-place wallet/COD amount or invoice treatment is selected. Active generic delivery coverage does not establish courier/provider/payment compatibility, an ETA or a delivery promise. Real geography mapping and coverage approval remain external gates.

## Persistence, API, lifecycle and recovery

Migration 3221 adds immutable quote headers, normalized immutable monetary lines, immutable acknowledgement observations, and a mutable current-quote pointer on the existing draft. Composite foreign keys enforce tenant/draft quote lineage, including the pointer and predecessor. Checks enforce currency, source binding, bounded quantity/JSON, positive revision, expiry, exact totals and allocations. Price/variant/product ownership consistency is checked before commit. Lines can only be inserted in their header's creation transaction; later appends, updates and deletes are denied. No Order/history table is rewritten.

The header retains private source/delivery/configuration provenance and applied promotion allocations. Public DTOs omit private contact, owner identities, stock balances and internal configuration snapshots. Facts never change. CURRENT/EXPIRED/SUPERSEDED/INVALIDATED and issues are derived separately under current owner authorization. A sufficient-stock change is not a stock hold; loss of availability invalidates. New immutable quotes bind a new root revision; old equal totals/fingerprints cannot override a changed draft. Acknowledgement requires exact ID, root revision and fingerprint plus fresh eligibility. It is a commercial review observation, not permission to purchase.

Four endpoints support create, current read, owned detail read and explicit acknowledgement. Strict input allowlists reject browser amounts, identity/status fields and primitive coercion. Stable UUID keys bind canonical content and owner. Exact replay returns the accepted quote identity with current lifecycle observations, even after supersession/expiry. Replay rechecks current authority before returning private data. Definite rejection rolls back all quote/line/root/pointer/receipt/audit writes; timeout/503 remains unknown and recovers by exact-key POST. There is no fake quote response or fresh-key automatic retry. Quotes are capped at 64 per draft; lines at 100, quantities at 99 and coupon codes at ten. Development TTL is ten minutes capped by draft expiry, not approved production policy.

The exact routes, DTOs, statuses, errors, frontend recovery, money presentation and future transaction contract are in [the Phase 03B handoff](PHASE_03B_HANDOFF.md).

## Concurrency and security

**Deliberate deviation from the proposed organization-wide commercial writer fence:** quotation uses PostgreSQL REPEATABLE READ instead. All commercial statements see one MVCC snapshot, including inserted price/promotion/rate rules; all temporal Pricing/Promotions selection uses one transaction timestamp. This works with existing transactional Admin writers without a global reader/writer bottleneck. The configuration digest detects change; it is not the consistency lock. Reference: [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html).

Authority/draft/Cart locks serialize private intent. Existing revocation and Customer/account/user lock order is retained. Lock waits are bounded at two seconds; statements at five seconds. Recognized serialization/deadlock failures restart the complete transaction up to two times with the same intent key. No provider call happens inside it. The evaluator explicitly refuses READ COMMITTED so a future caller cannot accidentally weaken coherence.

Real PostgreSQL tests pause after the authoritative price SELECT while another connection replaces the price and inserts a promotion and a higher-priority tariff. The quote contains the old coherent combination, never old price with new promotion/rate; its next read invalidates it, and explicit revalidation produces the new coherent combination. Other tests exercise simultaneous same-key requests, a source edit versus quote, wall-clock expiry during acknowledgement, rollback after quote persistence, owner/tenant denial forged acceptance, and a snapshot quote delayed behind winning live account revocation. Existing live account/guest revocation, partition, Origin, quota and lock-timeout regressions also pass.

This guarantees a coherent **quote observation**, not latest-at-COMMIT commercial state or future scarce-resource commitment. Future placement must rerun the same evaluator, compare the accepted full quote, lock limited coupon counters and Inventory allocation, and retry the whole operation on serialization loss. Existing nonparticipating legacy writers are not certified as a complete placement protocol. Physical network loss at COMMIT, all quote-specific logout/timeout permutations, representative mixed-tenant load, detailed lock/deadlock distributions and production role/ingress/log review remain NOT VERIFIED. No financial/private quote payload was added to public telemetry or general logs.

## Verification actually run

PostgreSQL **18.3**, newly initialized temporary cluster, loopback `127.0.0.1:55444`, synthetic `checkout_fixture` role. The harness verifies a newly created random `maevelle_cart01a_*` database and never migrates the explicit `maevelle_test` base. Test databases were dropped in finally blocks; a final cluster inventory contained only the untouched base `maevelle_test`, and the disposable cluster was stopped. Separate fresh and populated 3220→3221 cases preserve legacy Orders and both draft owners; existing 3218/3219 upgrade regressions remain compatible. All monetary/tenant/immutability tests ran against PostgreSQL, not mocked transaction races.

| Executed command | Result |
| --- | --- |
| `TEST_DATABASE_URL=postgresql://checkout_fixture@127.0.0.1:55444/maevelle_test node scripts/checkout-phase03a-verification.mjs` | **211 tests / 17 files PASS**, integrated run 91.44 s; harness creates/migrates/drops an isolated regression DB |
| Final `vitest run packages/database/src/checkout/quotes.test.ts apps/api/src/checkout-delivery.test.ts` after organization provenance and direct quote-revocation coverage | **37 / 2 files PASS**, 21.08 s |
| Same harness's quote, foundation, populated-delivery-upgrade and API suites | Real component evaluation, receipt recovery, limits/ownership/revision/expiry/rollback and preserved source/delivery contracts PASS |
| Harness Cart foundation/reassessment, Pricing/Promotions API, Orders, Payments, Inventory | PASS; Pricing/Promotions computations also exercised through real domain/Cart/quote/Orders fixtures |
| Harness existing Storefront Checkout tests | PASS; no new frontend implementation or browser acceptance claim |
| `node node_modules/typescript/bin/tsc --build packages/database/tsconfig.json apps/api/tsconfig.json --pretty false` | PASS |
| `node node_modules/typescript/bin/tsc --build packages/database/tsconfig.build.json apps/api/tsconfig.build.json --pretty false` | PASS; backend and dependent contract builds |
| Focused ESLint and Prettier on added/changed backend, contracts, tests and harness | PASS |
| `node scripts/check-architecture.mjs` | PASS, 13 workspaces |
| `node scripts/check-migration-history.mjs` | **FAIL on existing CRLF bytes**: baseline manifest plus 18 historical migration byte hashes |
| `node --test scripts/check-migration-history.test.mjs` | 3 PASS / 1 FAIL for the same existing byte-hash fixture issue |

Read-only diagnostics found zero historical content mismatches after LF normalization. The baseline's HEAD digest and normalized working-copy digest both equal its pinned digest. No historical migration or baseline was edited, regenerated or normalized in place. The actual byte-checker failure remains visible; it is not reported as passing. Persistent upgrades, deployment smoke, production frontend build/runtime, live providers and human browser/accessibility acceptance were not run in this backend task.

Negative-side-effect assertions in quote-only and API fixtures verify zero Orders, Inventory reservations, payment obligations, confirmed payments, promotion usage, Cart conversions, Finance transactions and purchase events where applicable. The separate Orders/Payments/Inventory regression database intentionally creates its own synthetic business facts; those are not attributed to quotation. No Checkout purchase outbox or real provider operation is emitted by the new code.

## Performance

Synthetic warmed loopback domain measurements, eight samples per discounted Cart size, include quote persistence/commit. The p95 below is the maximum of this small eight-sample set, not a production percentile/capacity certification. Query counts are Kysely statements including setup/authority/receipt/snapshot writes, excluding server-internal trigger statements, wire BEGIN/COMMIT and the API's preliminary ownership/source-cookie lookup.

| Cart lines | First quote / replacement statements | p50 ms | Approximate p95 ms |
| --- | --- | --- | --- |
| 1 | 37 / 39 | 13.87 | 15.54 |
| 5 | 37 / 39 | 13.60 | 16.30 |
| 20 | 37 / 39 | 14.89 | 17.00 |
| 100 | 37 / 39 | 37.66 | 51.75 |

Initial 100-line samples were about 1.2 s because deferred row triggers repeated full allocation validation for every line. Validation now caches a successfully checked immutable line count transaction-locally and rechecks if the set grows; individual constraints and deferred validation remain active, including under SET CONSTRAINTS. The integrated-run sample improved to 40.48 ms; final targeted rerun maximum was 51.75 ms. Batched statement count does not grow with line count. An EXPLAIN ANALYZE/BUFFERS empty-result latest-quote lookup used `checkout_quotes_draft`, under 0.1 ms execution locally. This is a narrow indexed lookup, not a broad commercial-query plan audit.

Source/delivery conflicts and rule-writer overlap were exercised, but no representative throughput, p99/pool wait or lock-contention distribution was measured. Promotion provenance currently hashes tenant configuration/targets; a large promotion-history dataset needs measured projection/version optimization before a scale claim. No extra infrastructure was introduced. Machine-readable samples and limitations are in `PHASE_03A_VERIFICATION.json`.

## Acceptance register

| # | Requirement | Status / evidence boundary |
| --- | --- | --- |
| 1 | One evaluator, both sources | PASS; extracted shared merchandise path and real Cart/Buy Now comparison |
| 2 | Owner/tenant isolation | PASS locally; same live fences, API denial and composite FKs |
| 3 | Active source/delivery revalidation | PASS; authoritative source and saved/configuration state |
| 4 | Exact variants/quantities | PASS; whole 1–99 and complete source comparison |
| 5 | Existing Pricing authority | PASS; temporal batch resolver with revision provenance |
| 6 | Promotion eligibility/allocation | PASS for established provisional rules; no unsupported new promotion features |
| 7 | No promotion consumption | PASS; quote-only assertions and two shoppers qualifying without usage |
| 8 | Explicit serviceability and shipping | PASS locally with synthetic approved coverage; real coverage remains unverified |
| 9 | Money and rounding | PARTIAL; exact components/allocations pass; approved final tax/fee/two-place payable policy absent |
| 10 | Verified consistency strategy | PASS for quote observations; RR and transaction-aware interface |
| 11 | Concurrent changes cannot mix snapshots | PASS; real price/promotion/tariff insertion barrier; future placement remains separate |
| 12 | Immutable bound revisions | PASS; database constraints, immutable facts/pointer/revision tests |
| 13 | Expiry/invalidation | PASS locally; database-clock expiry during acknowledgement and fresh read derivation |
| 14 | Source/address review | PASS; source rejection and account saved-address API invalidation |
| 15 | Idempotency/recovery | PASS locally; same-key concurrency/replay and rollback; physical COMMIT wire loss not injected |
| 16 | Security/adversarial breadth | PARTIAL; listed assigned tests pass; complete fault/revocation/ingress/log matrix remains open |
| 17 | Migration preservation/constraints | PARTIAL; fresh/populated/constraints pass; historical byte-check FAIL remains unrepaired, persistent targets unverified |
| 18 | Bounded measured performance | PARTIAL; 1–100 line statement counts/latency measured; representative load/contention/history scale not verified |
| 19 | No purchase side effects | PASS; quote/API fixture assertions, no business mutations in new path |
| 20 | Production disabled | PASS; explicit production API test and unchanged purchase/draft gates |
| 21 | Existing domain compatibility | PASS for executed Cart/Pricing/Promotions/Inventory/Delivery/Foundation/Orders/Payments regressions |
| 22 | Earlier frontend gates visible | PASS; 01B/02B remain PARTIAL |
| 23 | Policy/provider limitations accurate | PASS; null components/payable, blockers and external gates retained |
| 24 | Exact 03B handoff | PASS; implemented routes/types/review/recovery/security documented |

Scenario status: **S07 PARTIAL** (quote configuration changes tested; tax/payment destination and final placement remain future); **S08 PASS for quotation** (exact Cart revision rejects drift; conversion remains future); **S14 PARTIAL** (stock observation/loss tested; atomic last-unit allocation remains future); **S15 PARTIAL** (two quote contenders consume nothing; legacy redemption regression passes; new placement absent); **S50 PARTIAL** (actual documented zero/rounding/tax scenario: component zero/residual equations pass; approved two-place payable matching obligations remains blocked).

## Outstanding gates and next action

Approve tax-inclusive/exclusive treatment, applicable fees, final BDT rounding/invoice rules and quote/privacy/retention policy; complete payment receiving-destination and provider compatibility contracts in the later payment work. No quote can authorize payment or placement in their absence. Verify real BD data and merchant coverage/courier mappings. Preserve all inherited Cart/Wishlist/01B/02B browser, AT/zoom/device, historical receipt, ingress/role/recovery and production-runtime gates. Persistent deployment needs its own reviewed ledger/backup/forward-repair and compatibility record.

3221 is additive to the current HEAD's legacy tables; no previous release is newly certified as a deployed rollback target. Existing shopper revocation requirements still apply. A future deployment must retain compatible quote readers before enabling new writers; rollback must gate quotes and repair forward, never undo applied migrations or destroy immutable history. No retention deletion is scheduled without policy.

Phase 03B can now use the implemented component-quote API when separately assigned, keeping final-payable and purchase controls unavailable. Follow [the exact handoff](PHASE_03B_HANDOFF.md); do not silently promote previous phases or the complete Checkout system to PASS.
