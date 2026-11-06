# Checkout Phase 06A implementation and acceptance

**Overall acceptance is PARTIAL. Public ordering, real wallet instructions, shopper collection and automated cross-device recovery are BLOCKED.** The private post-order backend is implemented. The eligible wallet flow was exercised with synthetic committed Orders in isolated PostgreSQL.

## Baseline and ownership

Work started on clean `main` at `b244056df722828bba7d79e17478d02558a79e16`, following Phase 05A at `bd5b101`. The migration ledger still ends at `3223_checkout_placement`. The feature uses existing tenant-composite draft, placement, Order, payment-intent and destination-history bindings. There is no schema change or financial backfill. Legacy Orders continue through their established access paths. Phase 05A/B and earlier PARTIAL outcomes carry forward.

The committed draft and authenticated shopper account, or the original guest session and Order cookie, authorize every operation before private results are returned. A Checkout draft must already be committed, and its placement determines the exact Order and intent. Neither quote identifiers nor Order numbers, contacts or Customer IDs grant access.

Account revocation uses the shared Shopper Auth PostgreSQL fence. Guest session revocation serializes with Checkout operations on the session row. Phase 05 had a one-hour browser cookie backed by a database expiry equal to the session expiry. Phase 06A caps new grants at one hour or the original session expiry, whichever comes first, and enforces the cap on historical grants at read time. Existing exact placement replay can restore the original cookie during that server window. Committed guest attribution stays immutable. Verified account email and outbound SMS/email adapters do not establish that an unverified guest delivery contact owns the Order or that Maevelle can deliver and redeem a verified Order-bound challenge. Cross-device recovery, independent grant rotation and committed guest-to-account adoption remain blocked. Use support escalation subject to independent identity verification.

## Payment authority and transaction behavior

The authorized view separates original committed payable, live outstanding, confirmed allocation, verified wallet receipts, refunds, reversal and late liability. COD uses the same existing payment summary and displays no wallet action. No customer-supplied amount or destination is used. Courier custody and Finance remittance retain their separate workflows.

The eligible wallet path checks the exact historical destination revision against current approval, active method and Finance account, approval provenance, and the immutable intent snapshot. It exposes the saved instructions only while current and usable. Suspension, retirement, revision changes, expiry, cancellation, settlement, financial exceptions and open claims can suppress transfer instructions. No substitute receiving number is selected. Independent Admin verification now validates the Finance account against the bound destination history for intents with a destination. Historical receipts can still be independently reconciled after suspension. Legacy intent verification retains its existing snapshot rules.

Claims reuse the Payments writer, existing five-unresolved limit, Admin queue and permanent duplicate-receipt fence. The Checkout command rejects a repeat of the same exact pending or verified reference under a new key. Distinct case-preserved claims stay separate testimony. The UUID receipt binds tenant, owner, Order and canonical input. Exact retries and authorized receipt lookup return the current review state after rechecking authority. The POST receipt, attempt, audit entry and outbox event share one transaction. The committed staff-review event carries the attempt and Order IDs. Existing review aging and cancellation use their approved deadlines. No additional shopper email/SMS is emitted.

The new write path takes the session/owner fence, draft, idempotency receipt, Order, intent and current configuration row locks. It matches the existing Order-to-intent sequence used by cancellation and independent verification. An authorized result can be linearized before a concurrent suspension that waits for its configuration lock. A later read must re-evaluate availability. The guard also checks database time after waits. Checkout uses 2 s lock, 5 s statement and 12 s transaction timeouts with bounded retries for deadlocks and serialization conflicts. Existing mixed cross-domain writers can contend. Representative connection-pool and load behavior remain unverified.

The Fastify route shares Checkout private/no-store responses, disabled automatic request logging, trusted ingress IP handling, structured safe errors, strict mutation Origin, Fetch Metadata, bounded JSON and pre-coercion field checks. Cross-site reads of payment resources are rejected. Claims have a durable 12/minute trusted-IP bucket and reads share the Checkout 120/minute bucket. The two cookies and UUID intent key are never returned in a claim DTO. The key is a locator under live owner authorization.

## Verification and observed effects

All database commands used a newly initialized loopback PostgreSQL 18.3 cluster and disposable databases. Fresh migration applied 72 entries through `3223_checkout_placement`. The focused populated 3219/3220 Checkout and legacy Payments upgrade fixtures in the regression passed. The generic populated upgrade CLI failed separately at the missing `3221_checkout_quotes` upgrade fixture. No migration file or checksum baseline was edited.

- `pnpm exec tsc --build tsconfig.build.json --pretty false` passed, as did focused API, Database and Contracts typechecks including tests. ESLint on changed TypeScript, focused Prettier, `git diff --check` and `node scripts/check-architecture.mjs` passed.
- The isolated regression ran 370 tests across 29 files covering Checkout, Orders, Payments, COD/Fulfillment, Finance, Inventory, Notifications, Cart, Account, Storefront Checkout and Admin payment transport and permissions. The standalone Worker test file passed both tests. A final focused run after tightening destination-bound Finance verification passed 74 tests across the placement, API foundation, manual-payment integrity and Admin payment-operations files. These suites overlap.
- The focused lock tests observed real PostgreSQL waits for cancellation, verification, destination suspension and account logout. A local two-call synthetic claim plus exact retry took about 9–13 ms wall time in sampled runs. This is a functional contention probe on a disposable local database. No representative load, pool saturation or deployment ingress measurements were made.
- A synthetic claim and its replay left Order, placement, intent, reservation, allocation, promotion usage, Cart conversion, confirmed payment, Finance and Order-placed event counts unchanged. The claim emitted one committed staff-review outbox event. Separate authorized Admin verification of 40 BDT and 75 BDT against a 100 BDT obligation created two confirmed receipts and two Finance postings, with 100 BDT allocated and 15 BDT unallocated. A mismatched same-tenant Finance account was rejected before financial posting.
- `node scripts/check-migration-history.mjs` remains **FAIL** on the inherited Windows historical byte and baseline mismatch. The repository secrets scan also remains **FAIL** on pre-existing synthetic secret assignments in Cart and Checkout harnesses. Neither is treated as passing.
- The receipt-recovery test discards a committed response and reads the same attempt through the durable receipt. Physical COMMIT wire loss, successful browser checkout or claim submission, production traffic, provider collection and human device/accessibility acceptance were outside the observed evidence.

## Acceptance register

| # | Outcome | Verdict | Evidence or remaining gate |
| --- | --- | --- | --- |
| 1 | Existing Orders/Payments authority | PASS | Bound placement and existing attempt/audit/outbox writer. |
| 2 | Committed-Order authorization | PASS | Uncommitted and unrelated identifiers denied. |
| 3 | Account and guest isolation | PASS | Wrong account, tenant and guest tested in PostgreSQL. |
| 4 | Order numbers and phones are never credentials | PASS | Authority requires session and committed ownership or scoped guest grant. |
| 5 | Instructions use immutable Order snapshot | PASS | Synthetic eligible wallet returns the bound snapshot. |
| 6 | Suspended or unapproved destinations fail safely | PASS | Current revision and provenance checks, including concurrent suspension. |
| 7 | Original payable and live balance distinct | PASS | Partial payment retains 100 BDT original and shows 60 BDT outstanding. |
| 8 | COD has no wallet request | PASS | Separate COD branch and COD/Fulfillment regressions. |
| 9 | Minimal claim input | PASS | Reference and optional mobile only. Extra fields and coercion rejected. |
| 10 | Claim produces no confirmed money | PASS | Before/after commercial and financial counts. |
| 11 | Existing management review | PASS | Claim appears in existing Admin queue and review state changes propagate. |
| 12 | Exact idempotent retry | PASS | Concurrent exact retries, conflicting body and recovery after discarded response. |
| 13 | Duplicate claim races | PASS | Two keys with the same exact reference create one unresolved claim. |
| 14 | Accurate financial transitions | PASS | Isolated review, verified partial and fully allocated states. |
| 15 | Cancelled and expired safety | PASS | Expired submission window, pending review window, and Worker cancellation race. |
| 16 | Partial, excess and late reconciliation | PARTIAL | Partial and excess new view tested. Existing late-money domain regressions pass. Dedicated post-order late and reversal/refund view journeys remain open. |
| 17 | Session and grant revocation | PASS | Guest session revocation and account logout fence protect claim recovery. |
| 18 | Same-device guest recovery | PARTIAL | Live scoped access and exact placement replay supported. Independent rotation and browser recovery acceptance remain open. |
| 19 | Verified cross-device recovery | BLOCKED | No verified Order-bound recovery channel or approved recovery policy. |
| 20 | Recovery abuse controls | PASS | Existing durable read quota, separate claim quota and owner/grant checks. No challenge endpoint is enabled. |
| 21 | Notification authority | PASS | Committed staff-review outbox event and existing Worker pipeline. |
| 22 | Admin integration without duplicate Finance posting | PASS | Existing Admin queue, evidence validation and Finance posting verified on isolated Orders. |
| 23 | Constraints and migration continuity | PARTIAL | Existing bindings retained and fresh and focused populated upgrades pass. Generic upgrade CLI fixture gap remains. |
| 24 | Financial/security contention tests | PASS | Real PostgreSQL duplicate, verification, Worker expiry, suspension and logout waits. |
| 25 | Public purchase and collection stay disabled | PASS | Production route gate and hard-disabled wallet resolver, with synthetic eligibility isolated to tests. |
| 26 | Checkout and commerce regression | PASS | Focused integrated and Worker suites passed. |
| 27 | Historical migration-byte gate | FAIL | Windows baseline and historical byte mismatch reproduced. |
| 28 | Previous acceptance outcomes carried forward | PASS | Earlier PARTIAL and external gates retained. |
| 29 | Provider, legal and business readiness | BLOCKED | Actual wallet/provider activation and method approval, Nagad category, tax/invoice/rounding, courier, operating windows and financial/privacy retention are open. |
| 30 | Phase 06B handoff | PASS | Implemented endpoints, DTOs, credentials, retry, blocked operations and browser acceptance are documented. |

The [Phase 06B handoff](PHASE_06B_HANDOFF.md) records the precise API contract and remaining browser and activation work.
