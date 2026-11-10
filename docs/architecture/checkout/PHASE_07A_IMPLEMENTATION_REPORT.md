# Checkout Phase 07A implementation and acceptance

Date: 2026-11-10, Asia/Dhaka. **Overall: PARTIAL locally. Public purchasing, payment collection, live marketing export and deployment remain BLOCKED.** No Phase 07B frontend or Phase 08 work was performed.

## 1. Baseline and preserved work

Branch `main`; HEAD `038087c288da33787de85b1e81ec880a911e4e78`; migration tail on entry `3223_checkout_placement`. Five modified Storefront files, the modified scenario register, thirteen untracked Storefront payment files and two untracked Phase 06B reports were present on entry. They were preserved; only the scenario register received an additional 07A note. No reset, clean, stash, commit, push, persistent migration, VPS action or deployment occurred.

Docker Desktop was unavailable. A new disposable PostgreSQL 18 cluster used loopback port 5547 and local trust authentication. Tests created random databases and dropped them afterward. No existing local/staging/production database was migrated.

## 2. Existing architecture audit

The implementation reuses `analytics.ts`, existing rebuildable reports, `analytics/behavioral.ts`, specialized Cart/Wishlist analytics, transactional `platform.outbox_events`, durable consumer receipts, the Worker, API analytics capability checks and Storefront `lib/analytics` transport/consent storage. Analytics remains a read model; Finance owns financial truth. No active GA4/Meta commerce transport was found. Existing Meta messaging adapters serve messaging, not commerce conversions. Browser local-storage consent supplies suppression but is not a server consent authority. No authenticated server consent HTTP writer exists.

New focused `analytics/commerce` modules extend this infrastructure. The existing outbox insert transaction enqueues a dedicated consumer receipt through a narrow trigger. No second publisher, broker, database, dependency or frontend store was introduced.

The audit found and corrected these defects:

- Generic observation ingestion accepted authoritative-looking Order/payment/refund names. It now rejects them and SERVER origins.
- Generic observation payloads retained arbitrary data/attribution. A positive allowlist now retains UUID references and bounded quantities, excluding labels, private text, client money and attribution. Specialized Cart/Wishlist validators remain separate. Generic bodies are capped at 16 KiB; their existing 4 KiB limits remain.
- The real API enforces configured Storefront origin/fetch-site checks on analytics requests. Existing 120/minute ingress limits remain. General analytics request/error logging excludes raw URLs and driver errors.
- Legacy Storefront completion/conversion rates are null with an unavailable reason. Historical browser Order observations remain untrusted observations. Storefront/Marketing date bounds now use the organization's timezone; new commerce reports use explicit UTC bounds.
- Receipt events capture obligation satisfaction, amount and currency in the owning transaction. Delayed projection cannot substitute a later revised obligation after reversal.

## 3. Taxonomy and authoritative qualification

Facts use schema version 1 and supported source event version 1. Shared names/query types live in `packages/contracts/src/commerce-analytics.ts`. Unsupported versions are isolated.

| Fact | Owning event / qualification | Identity and amount |
| --- | --- | --- |
| ORDER_COMMITTED | `orders.order.placed`, committed Order | Order; immutable Checkout final payable/currency |
| PAYMENT_CLAIM_SUBMITTED | `payments.payment_attempt.submitted` | Attempt; no verified money |
| CLAIM_REJECTED | `payments.payment_attempt.rejected` | Attempt; no money |
| CLAIM_CORRECTION_REQUESTED | `payments.claim.reviewed`, exact correction state | Attempt; first correction request only |
| PAYMENT_VERIFIED | `payments.payment.verified`, independent receipt evidence | Payment; actual received and immutable allocated amounts |
| OBLIGATION_SATISFIED | Verified/COD source records satisfaction | Intent; first satisfaction and event-time obligation amount |
| COD_COLLECTED | `payments.cod_collection.recorded`, delivery-linked Payment | Payment; actual collection and allocation |
| ORDER_CANCELLED | `orders.order.cancelled` | Order; original payable where immutable, never refunded cash |
| REFUND_COMPLETED | `payments.refund.completed`, completed refund record | Refund; actual partial/full amount |
| PAYMENT_REVERSED | `payments.payment.reversed`, receipt correction record | Payment; separate reversal history |

Legacy editable Orders without immutable Checkout placement terms retain counts with null amount/currency. No guessed original amount or synthetic zero is used. Verification history survives a later reversal even if projection is delayed. Re-satisfaction does not create another first-satisfaction conversion. Ordinary UNDER_REVIEW/ESCALATED review events are consumed without conversion facts.

Accepted draft creation, delivery update, quotation, acknowledgement and explicit abandon commands are aggregated from existing server audit facts. New creation audit metadata records only CART/BUY_NOW source kind; older missing metadata is UNKNOWN. These are accepted operations/revisions, not unique shoppers or inferred abandonment. POLICY_BLOCKED is not abandonment.

## 4. Conversion policy and readiness

`commerceConversionPolicy` is `unapproved-v1`: GA4, Meta and advanced matching are false; purchase qualification is UNAPPROVED. The database permits only TEST delivery. There is no live transport, vendor credential reader, public conversion enqueue endpoint or switch that activates GA4/Meta. The Worker processes internal facts/cleanup and never invokes the fake dispatcher automatically.

Recommendation for owner review: one external purchase per Order after verified allocations or actual COD collection fully satisfy the approved obligation. Commitment remains a separate internal conversion. Zero obligations, late funds, reversals, amendments, unallocated/excess refunds and COD custody versus merchant settlement need approved treatment. Finance alone owns recognized revenue. This recommendation is not policy approval.

## 5. Provider audit and browser/server deduplication

Current official sources consulted:

- [GA4 ecommerce](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce) documents `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase` and `refund`. Merchandise value, tax and shipping are distinct. Future adapters must derive item values from immutable line snapshots and refunds from actual completed allocations, rather than mapping payable or received cash indiscriminately to merchandise value.
- [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events) documents server-secret protection, stream correlation and event-time constraints. No collection/debug call was made.
- [Meta deduplication](https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events) and [server event parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event) returned HTTP 429. Current API requirements, event-time/deduplication windows, matching and delayed-COD suitability remain NOT VERIFIED. Third-party articles were not used as implementation authority.

**No verified GA4/Meta payload adapter is claimed.** Implemented delivery is an in-process fake port. Vendor mappings, numeric conversion and live delivery remain blocked by policy/official-contract/provider acceptance. Internal money remains exact decimal strings, including zero and values beyond JavaScript safe integer precision.

Future intentional browser/server twins must share the persisted qualified fact, destination-scoped opaque ID and canonical vendor name. GA4 transaction identity must refer to the approved Order conversion, never the payment Transaction ID. Meta twins require the same verified destination/contract. The internal UUID is durable and noncredential but must not become a universal cross-vendor correlation identifier. No shopper endpoint exposes it. Local uniqueness prevents duplicate business facts; uncertain vendor acknowledgements cannot guarantee unconditional exactly-once external delivery.

## 6. Schema, history and compatibility

Forward-only `3224_commerce_measurement` adds reporting scopes, minimal facts, operation counters, purpose-specific preference state, fake delivery receipts, indexes and the enqueue trigger. Fact uniqueness is `(organization_id,event_name,schema_version,business_id)`; delivery uniqueness is `(organization_id,event_id,destination)`. Composite tenant FKs prevent cross-organization preference/event binding. No contact, address, evidence, instructions, notes, bearer, profile or raw request is copied.

Historical outbox rows are preserved without backfill or retroactive marketing enrollment. A new 3224 upgrade fixture is registered; it does not invent missing 3221 historical evidence.

Future deployment order: controlled migration once, then compatible API/Worker images. The additive schema remains compatible with the current HEAD's older code; pending receipts survive application rollback. This compatibility is source reasoning, not a deployed rollback test. Keep the schema and forward-repair, or restore a verified backup through a separately authorized procedure. No staging backup, migration or rollout ran.

## 7. Consent governance and field allowlists

`getCommerceConsent` and `setCommerceConsent` are trusted application ports exported through `@maevelle/database/analytics`, **not HTTP endpoints**. A trusted caller resolves tenant/subject ownership. Subjects have opaque UUIDs and SESSION/ACCOUNT scopes. Essential business facts, optional ANALYTICS and optional ADVERTISING are separate. Preferences retain decision, policy version, checked monotonic revision, server change time and expiry capped at 180 days. Missing/expired state is UNKNOWN; external dispatch remains false. Login and purchase grant no optional consent.

Only synthetic facts can enter `queueCommerceTestDelivery`. Grant must predate source occurrence and remain unexpired/current. Later grant cannot backfill older facts. Queue eligibility captures the exact preference revision; withdrawal, policy change or withdrawal/regrant suppresses it at dispatch. A row lock covers the bounded fake send: an already-started send precedes a waiting withdrawal commit; a withdrawal that commits first suppresses delivery. No promise is made to undo an already received event.

The fake payload contains exactly `schemaVersion,eventId,name,occurredAt,currency,amount`. It omits tenant, business/shopper/session IDs, contact, transaction references, notes, evidence and bearer values. Errors retain only fixed categories, never provider messages. This allowlist is not a GA4/Meta payload contract. Hashing PII is not an approval mechanism; advanced matching remains unavailable.

Fake deliveries expire one day after source occurrence, and older events cannot be re-enqueued after receipt purge. Bounded cleanup defaults to 500 rows/table (maximum 1000), removes expired optional deliveries/preferences and operation counters older than 400 days, preserving authoritative business records. Essential fact/receipt retention and erasure/tombstone governance still require approved policy and are not silently deleted. These development bounds are not legal approval.

## 8. Processing, retries and failure isolation

The consumer uses per-receipt `FOR UPDATE SKIP LOCKED`, one event/transaction, lock/statement timeouts, savepoints and five maximum attempts. Unknown sources/versions are isolated. Projection exceptions roll back the fact and retain a fixed code plus bounded exponential retry. A crash before commit releases the claim and rolls back projection. No global analytics lock or per-line analytics write was added.

The fake dispatcher uses durable IDs, per-destination uniqueness, five attempts, backoff, permanent malformed-payload isolation and a one-second abortable transport budget. Accepted send plus lost acknowledgement retries with the same ID. No external HTTP occurs inside commercial transactions. Analytics cannot originate or mutate Orders, reservations, promotions, obligations, payments, refunds, Finance or Cart conversion.

Tests inject pre-commit interruption, uncertain acknowledgement and transport errors; existing Worker lifecycle runs against PostgreSQL. Physical OS process kill, COMMIT-wire loss, live provider retry and destination verification are not claimed.

## 9. Reporting and operational observability

`GET /admin/analytics/commerce?from=YYYY-MM-DD&to=YYYY-MM-DD&currency=BDT&trafficClass=BUSINESS` requires both analytics capabilities in the same authorized organization. The private/no-store `{data:...}` response contains grouped counts/exact amounts, accepted step/source counts, queue health and operation counts/duration sums/maxima. Extra filters are rejected. Fixed enum/currency groups and the maximum 731-day range bound the result; no growing raw event list or arbitrary entity lookup is exposed.

Default BUSINESS excludes SYNTHETIC and UNCLASSIFIED. Trusted reporting-scope provisioning is required; no organization automatically becomes business traffic. Fact class is fixed on first projection. Audit-step cohorts use current organization scope: do not use scope changes to reclassify historically mixed environments. Global conversion rate remains null.

Post-response API diagnostics cover QUOTE, FINAL_TERMS, PLACEMENT, PAYMENT_READ and CLAIM_SUBMIT. Fixed outcomes distinguish policy block, review required, source conflict, unavailable method/destination, rate limit, client/server error and success. No shopper/Order IDs, raw URLs or payloads are metric dimensions. Failures cannot change a sent customer response. Request replays remain attempts while committed facts stay unique. Duration sums/maxima are not percentile histograms.

## 10. Verification, failures and build disposition

All database commands used explicit `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5547/maevelle_test` on the disposable server.

| Command / evidence | Actual result |
| --- | --- |
| `pnpm --filter @maevelle/storefront build` | PASS: executable contracts/Next compilation, TypeScript, page data/static generation and optimization. Windows, Node 24.14.1, pnpm 11.19.0, Next 16.4.2. Earlier failure did not reproduce; historical cause unestablished. No Storefront source fix needed. |
| `pnpm exec tsc --build tsconfig.build.json --pretty false` | PASS backend build; focused Database/API typechecks including tests also pass. |
| Commerce/placement/payments/manual-payments/analytics/API/auth/Worker focused run | 127 tests / 9 files PASS at earlier checkpoint. Later focused reruns overlap; final results below. |
| Finance, Cart foundation, account Wishlist, three Storefront post-order files and logger regression | 92 tests / 7 files PASS. |
| Later core run | 78 tests / 4 files PASS, including zero, large decimals, retention and timeout. |
| Fresh PostgreSQL 18; populated 3223 upgrade/rerun | PASS: 73 migrations through 3224; preserved existing Orders/claims/outbox. Manual-payment populated upgrade also passes after current-tail expectation update. |
| Architecture / focused ESLint / whitespace | PASS: 13-package architecture check; changed implementation lint and `git diff --check`. |
| Formatting | New modules and previously formatted touched files PASS. Six already-unformatted touched legacy files retain whole-file Prettier debt; unrelated reformatting avoided. |
| `pnpm test:migration-upgrade` with `UPGRADE_TEST_ALLOW=1` | FAIL: `Missing upgrade fixture for 3221_checkout_quotes`; runner stops before 3224. New 3224 fixture exists independently. |
| `node scripts/check-migration-history.mjs` | FAIL: inherited byte baseline. All 18 file mismatches and the manifest match their expected hashes after CRLF-to-LF normalization. Old files/manifest/checker unchanged. |
| `node scripts/check-secrets.mjs` | FAIL: eight pre-existing runtime/browser harness files; every matched assignment is visibly synthetic/local/development/test. No new exposure found in these findings; scanner unchanged. |

Initial verification exposed and corrected UTC/session-timezone bounds, Fastify's silent removal of unknown query filters, a fresh-migration Worker test's five-second timeout, and stale current-migration-tail expectations. These are separate from the retained history/fixture/scanner gates.

Actual tests cover domain sources, independent receipts, partial/excess allocation, first satisfaction, reversal before projection, partial refund completion/replay, unpaid versus collected COD, cancellation without refund fabrication, IAM/tenant denial, forged HTTP events, canaries, concurrent consumers, duplicate facts, poison/retry limits, consent timing/withdrawal serialization, fake disabling/rate-limit/timeout and retention. Negative snapshots compare Orders, obligations, payments, allocations, reservations, promotion usage, Cart conversion, refunds and Finance before/after projection/replay. Placement separately compares complete business effects.

No 07A browser, native zoom, human assistive-technology, live provider or production journey ran. The successful production build does not establish those outcomes.

## 11. Performance and resource evidence

[`PHASE_07A_BENCHMARK.json`](PHASE_07A_BENCHMARK.json) records five 100-event batches before/after instrumentation. Baseline was 1.15-2.81 ms/batch; instrumented 3.38-7.49 ms/batch. Two consumers drained 500 duplicate source events in 500.07 ms into one fact, zero pending and 98,304 bytes allocated to the fact relation/indexes. Reproduce with `pnpm exec tsx packages/database/src/analytics/commerce/benchmark.ts` and an explicit isolated URL.

This local duplicate-heavy probe ran alongside regression work. It is not representative traffic, sustained storage growth, per-line query-count instrumentation, placement overhead, pool-saturation evidence, Checkout p95/p99 or production capacity. Those gates remain open.

## 12. Acceptance register

| # | Outcome | Verdict | Evidence / remaining gate |
| --- | --- | --- | --- |
| 1 | Architecture audited | PASS | Actual owning sources and existing pipeline |
| 2 | Domain facts distinct from observations | PASS | Separate consumer and ingestion rejection |
| 3 | Order distinct from payment | PASS | Placement/receipt tests |
| 4 | COD Order distinct from collection | PASS | Real domain regression |
| 5 | Claim is not verified funds | PASS | Null-money claim/review facts |
| 6 | Refund request is not completion | PASS | Partial completion/replay |
| 7 | Qualification policy/readiness | PARTIAL | Versioned disabled gate; business approval unavailable |
| 8 | Exact event amounts | PASS | Immutable snapshots, zero/large decimals and delayed amendment test |
| 9 | Stable identities | PASS | Tenant/type/schema/entity uniqueness |
| 10 | Placement replay deduplication | PASS | Real PostgreSQL placement/consumer replay |
| 11 | Browser/server dedup contract | PARTIAL | Designed; no browser twins/vendor verification |
| 12 | Outbox/Worker safe retry | PASS | Local database retry/lifecycle scope |
| 13 | Vendor failure cannot undo Order | PASS | No provider in transaction; negative-effects assertions |
| 14 | Consent purposes distinct | PASS | Essential, analytics, advertising separated |
| 15 | Optional dispatch fails closed | PASS | No live transport; synthetic-only TEST |
| 16 | Withdrawal enforcement | PARTIAL | Fake/concurrent tests; live remediation unavailable |
| 17 | No unauthorized retroactive export | PASS | Event-time/current-revision/age checks |
| 18 | Marketing field allowlist | PARTIAL | Fake canaries pass; real adapters unavailable |
| 19 | General telemetry privacy | PARTIAL | Minimization/log boundaries; browser/referrer/production canary open |
| 20 | Tenant/ownership/access | PASS | Real IAM, tenant denial, FKs; trusted-only consent ports |
| 21 | No public purchase forging | PASS | Registered HTTP rejection; no business-fact endpoint |
| 22 | Funnel observability | PARTIAL | Accepted steps/sources/diagnostics; full funnel/coverage unavailable |
| 23 | Synthetic exclusion | PASS | Explicit cohort and default BUSINESS |
| 24 | Verified GA4/Meta adapters | BLOCKED | No live adapters; Meta official docs 429 and approvals open |
| 25 | Real PostgreSQL idempotency | PASS | Domain and consumer tests |
| 26 | Worker/fault/retry coverage | PARTIAL | Injected interruption/ack loss; physical kill/vendor matrix open |
| 27 | Fresh/populated history | PARTIAL | Focused migration PASS; historical bytes/generic fixture FAIL |
| 28 | Commerce regressions | PASS | Focused scope; no full-suite readiness claim |
| 29 | Phase 06B build discrepancy | PASS | Current executable build succeeds; historical cause unknown |
| 30 | Inherited failures reported | PASS | Actual failures retained and classified |
| 31 | Public financial gates disabled | PASS | Existing production policy unchanged; no live actions |
| 32 | Earlier PARTIAL preserved | PASS | No historical promotion |
| 33 | Precise 07B handoff | PASS | Actual ports/endpoints and unavailable surfaces documented |

## 13. Carry-forward and next assignment

Earlier Checkout/Cart/Wishlist PARTIAL outcomes remain open, including privacy/legal/provider approval, trusted deployed ingress/roles, recovery, browser/device/native zoom, human accessibility, load and staging gates. Phase 06B component tests and the current build do not establish human/browser acceptance.

Use [`PHASE_07B_HANDOFF.md`](PHASE_07B_HANDOFF.md) for a separately authorized assignment. Consent HTTP ownership/lifecycle binding and approved provider mapping are prerequisites, not existing frontend capabilities. No report control enables purchases, collection or exports.


## Final verification ledger

The focused checks exercised **246 distinct tests across 19 files**, with overlapping reruns. This is not a full-suite or production-readiness result. Final changed-source backend build, Database/API typechecks, lint, new/previously formatted source formatting and whitespace checks pass. The supported Storefront production build was repeated after the shared-contract changes and passed again.

Actual Vitest command groups (each prefixed by `pnpm exec vitest run`):

1. `packages/database/src/analytics/commerce/commerce.test.ts packages/database/src/checkout/placement.test.ts packages/database/src/payments.test.ts packages/database/src/payments/manual-payment.test.ts packages/database/src/analytics.test.ts apps/api/src/wishlist-analytics.test.ts apps/api/src/checkout-foundation.test.ts apps/worker/src/worker.test.ts apps/api/src/shopper-auth.test.ts` - 127 PASS at the earlier checkpoint.
2. `packages/database/src/finance.test.ts packages/database/src/cart-foundation.test.ts packages/database/src/wishlist/account.test.ts apps/storefront/features/checkout/order-payment-api.test.tsx apps/storefront/features/checkout/order-payment-components.test.tsx apps/storefront/features/checkout/order-payment-workflow.test.ts packages/observability/src/index.test.ts` - 92 PASS.
3. Core commerce/placement/payments/registered analytics API files subsequently passed 79 tests, including the final 20 commerce tests. The same invocation's foundation migration setup initially failed its stale expected tail; no product assertion was suppressed.
4. `packages/database/src/checkout/foundation.test.ts packages/database/src/payments/manual-payment.test.ts apps/worker/src/worker.test.ts` - 20 PASS after the foundation expectation correction.
5. `packages/database/src/checkout/delivery-migration.test.ts packages/database/src/checkout/quotes.test.ts` - delivery's 6 and quote's 14 behavior tests passed; the quote populated-upgrade assertion briefly contained a duplicate expected 3224 entry. Removing that test-edit mistake and rerunning `packages/database/src/checkout/quotes.test.ts -t 'preserves legacy Orders, draft ownership and delivery-compatible addresses'` passed its remaining test (14 intentionally filtered tests). All 21 distinct tests in those files have passing evidence.

The test-tail edits only acknowledge the new forward migration; they do not fabricate the missing generic historical 3221 fixture. No inherited migration-byte or secrets-scanner failure was waived.
