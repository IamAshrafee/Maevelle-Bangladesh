# Phase 02A commerce integrity and backend acceptance

**Local acceptance — PARTIAL. Production release — BLOCKED.**

This continuation starts from [the replacement checkpoint](PHASE_02A_IMPLEMENTATION_REPORT.md). The working tree at HEAD `27b79e9` included uncommitted Phase 01-C and Phase 02A work. Those changes and their evidence were preserved. This continuation changes application code, contracts, and isolated fixture data. It introduces no schema migration.

## Architecture decisions

| Domain | Decision |
| --- | --- |
| Catalog | Reuse the Catalog predicate already used by publication readiness and defensive public reads. An eligible variant must have one active value for every active product axis, all links must belong to that product, and its signature must match the canonical linked signature. Optionless products require the canonical `default` variant. Add, replacement and changed quantities validate this; Cart reads classify an invalid selection separately from hidden merchandise. |
| Cart | Keep the owner fence, revision precondition, aggregate lock, exact-intent digest, atomic line/coupon updates, receipt and outbox. Each mutation attempt uses PostgreSQL repeatable read. A serialization failure restarts the complete transaction up to two times, so a committed duplicate finds its receipt before revision checks. A stale competing intent still fails. Lock/statement timeouts and unknown commit outcomes follow the existing API recovery path. |
| Pricing | Keep the tenant/currency resolver and four-decimal merchandise arithmetic. Validate compare-at using exact scaled integers in both write paths. The database supplies default effective start and evaluation time. Cart preserves PostgreSQL timestamp precision for temporal price and promotion predicates and emits the existing ISO evaluation time. |
| Inventory | Keep active, tenant-scoped stock-holding locations and subtract existing reservations. The 1–99 bound is a technical whole-unit limit per variant. Stock is a snapshot and imposes no reservation. Delivery eligibility is explicitly unevaluated. |
| Promotions | Keep the existing owning evaluator, ordering, eligible target union, fixed-point arithmetic, and largest-remainder allocation. Read targets with the candidate promotion query to avoid an application round trip per candidate. Automatic offers have no coupon attribution. Guest previews exclude exhausted total-limit coupons and customer-limited coupons without verified identity. Selected codes remain removable and can have zero current benefit. |
| Legacy consumers | Preserve existing Cart fields, route semantics, and receipt format. Use canonical signatures in optionless test fixtures. Keep Orders delivery-pricing logic and the existing corrected fixture priority. Constrain the Wishlist migration fixture to its intended migration endpoint. Fix the Promotions list query's pre-existing text/integer COALESCE so the shared commerce regression can reach its assertions. |

## Acceptance register

| Area | Local status | Evidence and remaining gate |
| --- | --- | --- |
| Configuration lifecycle, S09–S11/S14 | PASS for tested behavior | The Catalog predicate gates mutations and the read projection. A newly required axis invalidates an existing line without changing intent, blocks Add and leaves removal available. Valid selectable variants replace and merge atomically. A public product handle can remain available for recovery while invalid option data, SKU and price are suppressed. |
| Replacement, concurrent writes, replay, S03/S04/S14/S21/S22/S53 | PASS for tested behavior | PostgreSQL and API tests cover in-place identity, a successful merge, rejection preserving both lines, duplicate replay, a competing revision, and attempts against another Cart. |
| Stock and quantity, S07/S10/S44 | PARTIAL | Disabled location and insufficient quantities are covered. Active stock-holding inventory is an aggregate signal. Delivery/channel eligibility, backorder treatment, and product-specific minima, maxima and increments require owner decisions. |
| Effective prices and calculation identity, S08/S58 | PASS for tested behavior | A concurrent price commit inside the Cart transaction does not split the evaluation. A later read sees the new price and fingerprint at the same intent revision. Orders stale-price and stock behavior is exercised on a fresh database. Compare-at presentation remains a policy gate. |
| Coupons and discount allocation, S32/S33 | PARTIAL | Targeted offers cap at remaining gross. Expiry, exhausted limits and identity-dependent benefits preserve selection and lose the current discount. Existing stacking precedence is preserved as observed behavior. Advanced exclusions and fixed-amount or threshold currency semantics beyond the current organization currency need approval. Redemption and any atomic enforcement at placement belong to Checkout/Orders. |
| API and privacy | PASS for tested behavior | Existing owner context and receipt tests cover foreign lines, cookie-only authority, lost responses, and malformed requests. Unpublished Catalog details and promotion rules are omitted from the public projection. |
| Capacity and release | PARTIAL locally, BLOCKED for release | The synthetic benchmark measures stocked reads with active promotions. Representative cardinality, concurrent load and production infrastructure verification remain open. Persistent cutover/restore, role and proxy validation, and policy approval remain release gates. |

## Phase 02B contract

- Keep the existing guest routes and the [replacement request and replay protocol](PHASE_02A_IMPLEMENTATION_REPORT.md#phase-02b-frontend-contract). Reuse the original idempotency key and identical payload after network failure or retryable 503. A stale revision calls for a fresh read and review before issuing a new intent.
- Use `commerceReview.issues` for corrective actions and legacy `lines[].availability` for compatibility. An `INVALID_CONFIGURATION` line remains owned and removable. Offer explicit reselection only from current public Catalog data. If a product link is empty or its public page can no longer be resolved, retain the remove action.
- Use the returned line IDs after replacement and merge. Use `intentRevision` for customer edits and `calculationFingerprint` to detect changed evaluation. Compare prior and current projected prices and totals to explain changes. Refresh after a recoverable error instead of assuming a failed response rolled back.
- Present `merchandiseReady` as a current merchandise observation. `deliveryEligibility: NOT_EVALUATED` leaves location, channel and destination decisions to their authoritative workflow. Preserve a coupon selection with `NO_CURRENT_BENEFIT` and display its current discount separately. Treat all current discounts as provisional at purchase handoff.

## Policy and risk

High risk before release includes persistent migration continuity and restore, actual proxy/role evidence, channel and location eligibility, and purchase-time enforcement of promotion limits. Audit persistent Catalog data for noncanonical variants before rollout. Affected lines remain recoverable through removal or explicit replacement.

Medium risk includes display rules for compare-at and tax, multi-currency fixed benefits and thresholds, advanced stacking, per-product quantity rules, representative load, and broad browser acceptance. Preserve existing policy behavior until an owner decision supplies the business rules. A complete Checkout quote and reservation workflow remains a separate assignment.

## Verification

Executed with PostgreSQL 18.6 on the existing dedicated loopback fixture server. Cart, Shopper Auth, and Wishlist tests created their own random databases. The second group ran with `TEST_DATABASE_URL` pointed at a separate random database after `runMigrations`, and removed that database afterward. Historical evidence was preserved. No shared or production migration ran.

```sh
pnpm --filter @maevelle/database build
pnpm exec tsc -p packages/database/tsconfig.json --noEmit
pnpm exec tsc -p apps/api/tsconfig.json --noEmit
pnpm exec tsc -p apps/storefront/tsconfig.json --noEmit
git diff --check

# Use the dedicated loopback test server with the required /maevelle_test URL.
# Use a new output path when recording benchmark samples and query plans.
pnpm exec vitest run apps/api/src/{cart-foundation,cart-credential-closure,shopper-auth}.test.ts packages/database/src/{cart-foundation,cart-reassessment,cart-credential-closure,wishlist-sharing}.test.ts packages/database/src/wishlist/account.test.ts apps/storefront/features/{cart,wishlist,pdp} apps/storefront/components/commerce/wishlist-button.test.tsx

# Use a freshly migrated isolated database for the suites below.
pnpm exec vitest run packages/database/src/{commerce-foundation,costing,fulfillment-delivery,orders,payments,returns}.test.ts
```

The first group passed 177 tests across 19 files, including Cart transaction and API, Shopper Auth, Wishlist migration and sharing, and Storefront Cart/PDP/Wishlist regressions. The second group passed 78 tests across six files, including all 23 Orders tests and the corrected delivery-pricing fixture. The database build, three typechecks and whitespace check passed.

### Stocked Cart read benchmark

| Lines | SQL statements | Median (ms) | Sample p95 (ms) |
| ---: | ---: | ---: | ---: |
| 1 | 8 | 5.55 | 7.06 |
| 20 | 8 | 6.75 | 7.06 |
| 100 | 8 | 10.10 | 10.69 |

Ten sequential direct-domain reads per size used canonical products, live fixture prices, stock at one active location, and four active stackable promotions. The statement count includes the configured SQL timeouts and excludes transaction protocol commands, API authority resolution, and network transport. The p95 is the largest of ten samples. This run captured price and owner lookup EXPLAIN ANALYZE/BUFFERS output and used a new temporary artifact path. The dataset was small and does not establish production or concurrent-load latency.
