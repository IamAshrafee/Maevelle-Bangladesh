# Phase01A implementation report

2026-11-02, Asia/Dhaka. **PARTIAL — 15 PASS / 1 PARTIAL.** Backend work is implemented and focused tests pass; complete legacy compatibility and credential migration remain open. No commit, push, deployment, external provider configuration or production/staging operation occurred.

## 1. Executive outcome

Evolved the existing Cart instead of adding another system: a stable facade over focused context/query/command/value/receipt modules, shared contracts, new additive migration3213, strict server-derived tenant/currency/identity, collision-free named bootstrap credentials, all-current-mutation receipts, immutable quantity outcomes/current projections, safe revisions/no-ops, essential API controls, privacy redaction and owning Promotions discount cap. Actual PostgreSQL loss testing additionally required safe driver error-event handling.

## 2. Git/repository state

Branch main, HEAD aa290065407030e85b5b6847efd22fb437a65279 unchanged. Initial state23 modified tracked paths and38 untracked paths (the additional Phase00 Cart directory explains difference from the older37). Snapshot covered1,950 pre-existing files before edits. Only intended source and Cart documentation changed; all prior Wishlist/Admin/config/upgrade-test work preserved. The already-dirty auth.ts changed only its Cart registration call relative to the captured working copy. Final preservation/hash validation and source manifest are in [verification](PHASE_01A_VERIFICATION.json).

## 3. D15 bootstrap resolution

[Exact protocol](PHASE_01A_BOOTSTRAP_PROTOCOL.md): each cold initializer gets a different HttpOnly slot cookie; mutations require returned cookie; delayed responses cannot replace other credentials; multiple authorities require explicit cookie-backed context or refusal. Controlled tests deliver late B only after add A was acknowledged, preserve independent A/B adds, and deny missing/public/forged proof. No IP/user-agent/key heuristic for identity. Browser storage loss remains an explicit persistence limit. Old fixed-cookie security parity/retirement remains partial, not mislabeled as resolved by the new protocol.

## 4. D16 owner context

Existing verified shopper realm/CRM mapping reused with opt-in strict failure propagation. Server-configured storefront resolves tenant/currency. Token hashes and scope/lifecycle/account predicates establish guest owner; UUID alone does not. New owner precondition rejects stale contexts before writes. Verified account Cart currently returns ACCOUNT_CART_NOT_READY; expired/invalid shopper state cannot silently initialize guest. This conservative refusal creates a known signed-in legacy compatibility gap pending explicit policy/adapter or migration, not an account implementation.

## 5. Durable idempotency

[Implemented contract](PHASE_01A_RECEIPT_AND_OWNER_CONTRACT.md) reuses platform.idempotency_records with canonical fingerprint, operation/tenant/cart scope, expiry metadata and safe immutable outcome. All five existing commands integrated, including remove/coupons; domain+receipt+outbox commit atomically. Recovery returns original committed quantity deltas/event IDs with current pricing projection. Concurrent duplicates serialize, changed payload conflicts, expired consumed keys refuse, rollback/disconnect does not retain a false success. Original cart.add_line receipts bridge across upgrade; old callers' CONFLICT code preserved. No-key legacy derivation documented as compatibility, not the new client contract.

## 6. Revisions/concurrency

Cart row lock, expected safe numeric version and2s lock/5s statement timeout; no blind server retry of unknown outcomes. Same-key replay precedes version rejection, stale new intent returns currentVersion. Intent changes and evaluation changes separate: price changes alter fingerprint/current projection without intent bump; desired no-op set/reselect coupon has receipt/no event/no revision bump. Independent actual database connections verify races and connection termination. Repeatable-read public projection uses one evaluation timestamp; no reservation or purchase-price guarantee.

## 7. Database/migration

3213_cart_foundation adds owner_context uniqueness, nullable scoped account reference/active uniqueness, Cart scoped identity, scoped line Cart/variant FKs, coupon scoped Cart/coupon FKs, FK indexes and Cart receipt-expiry index. Legacy coupon organization metadata backfills in500-row batches with aggregate PostgreSQL NOTICE; trigger preserves old insert shapes. Constraints reject inconsistent tenant history instead of repairing/dropping it silently. Token hashes, IDs, status, numeric quantity/money and existing migration files preserved. Fresh isolated databases and populated3212→3213 upgrade retain old lines/coupons/consumed receipt and rerun no-op. No automatic down migration; rollout requires preflight, compatible image baseline and forward repair; image rollback never reverses schema.

## 8. API/security

Exact configured origin/Fetch Metadata/JSON, strict unknown-field rejection before schema stripping, UUID/quantity/version limits, 64KiB payloads, private no-store/Vary across errors, host-only production cookies, bounded header credential inspection, PostgreSQL-backed shared quotas and safe errors. Read-time publication/lifecycle redaction removes restricted title/handle/SKU/media/options/price while retaining removable reference. Max100 hydrated lines/10 coupons prevent unbounded old payloads; over-limit legacy Cart fails review rather than truncating Checkout truth. Pricing remains server-owned; minimal Promotions-owned remaining-gross allocation prevents stacked negative net while original threshold basis is preserved. Full commerce/location/coherence/performance matrices remain02/04/07.

Threat/scenario mapping and the unclosed legacy T04/T05/T30 boundary are in [acceptance](PHASE_01A_ACCEPTANCE_REGISTER.md). No ASVS certification/guaranteed security claim.

## 9. Compatibility

CartView old fields/numeric versions and database/cart exports preserved. Old HTTP payload/response shape is tested with guest PDP-style add, no-key replay, page-style commands and original database regression. One new slot works with existing Checkout route via a read-only cookie adapter; multiple slots refuse rather than guess. Redacted withdrawn items preserve original Orders CHECKOUT_CHANGED error classification. Existing22 selected Orders tests pass. Signed-in legacy Cart refusal and old-cookie adoption/strict owner-precondition parity remain **PARTIAL**. No frontend behavior, Checkout features, addresses/payment/order/reservation implementation added.

## 10. Worker/lifecycle and policies

Only receipt expiry metadata/index and safe connection-loss observation implemented; no new destructive purge, account merge, full restoration or marketing job. New minimal domain outbox fact is not GA4/Meta analytics. Guest30-day existing expiry and provisional7-day receipt recovery remain; consumed keys physically retained. Technical ceilings99 units/100 lines/10 coupons/32 inspected credentials plus20/120/240 per-minute initialize/mutate/read quotas are explicit safe development bounds, not approved business settings. D09/D10/D14 retention/privacy/tax/location decisions remain later approval gates; no tax/delivery customer claim or Meta implementation.

## 11. Verification commands and results

All database commands used the newly created `maevelle-cart01a-pg18` PostgreSQL18.6 container: localhost55441, tmpfs /var/lib/postgresql, label maevelle.purpose=cart01a-isolated. Existing Wishlist container unchanged. New tests create random sibling databases, verify database name and drop only their own new DB; populated upgrade uses another new sibling. A disposable template was deliberately rebuilt only inside this owned tmpfs instance. No shared/production DB reset.

Use `<isolated-url>` for that verified local test URL; no environment files changed.

| Command | Result |
| --- | --- |
| `TEST_DATABASE_URL=<isolated-url> pnpm exec vitest run packages/database/src/cart-foundation.test.ts apps/api/src/cart-foundation.test.ts packages/database/src/index.test.ts` |35 passed, actual PostgreSQL, no unhandled errors |
| `TEST_DATABASE_URL=<owned-instance>/maevelle_test pnpm exec vitest run apps/api/src/shopper-auth.test.ts` |12 passed; existing dirty shopper/Wishlist integration preserved |
| `TEST_DATABASE_URL=<isolated-url> pnpm exec vitest run packages/database/src/orders.test.ts -t '^(?!.*manages delivery pricing rules)'` |22 passed,1 excluded unrelated existing fixture failure |
| `TEST_DATABASE_URL=<isolated-url> pnpm exec vitest run packages/database/src/commerce-foundation.test.ts -t 'keeps guest carts opaque'` |1 passed,5 intentionally unselected |
| `pnpm exec tsc --build packages/contracts/tsconfig.build.json packages/database/tsconfig.build.json apps/api/tsconfig.build.json apps/worker/tsconfig.build.json --pretty false` |passed |
| API/database `tsc --project ... --noEmit --composite false --incremental false --pretty false` |passed |
| Focused `pnpm exec eslint` over all changed implementation/test files |passed |
| `node scripts/check-architecture.mjs` |13 workspaces passed |
| `node scripts/check-migration-history.mjs` |62 registered,51 immutable baseline migrations passed |
| `git diff --check` |passed |

Selected verification totals70 passing tests; skipped/unselected tests are not called PASS. The first broader regression run had41 passed/4 failed: two introduced compatibility classifications were corrected; two unrelated failures remain in unchanged behavior: `listAdminPromotions` SQL COALESCE text/integer (commerce-foundation.test.ts), and Delivery Pricing fixture duplicate country/geography/priority against existing baseline rule (orders.test.ts). Do not claim those complete suites pass. Initial fixture normalization, private test import, closed-before-lazy-connect simulation and unhandled connection-error issues were investigated/corrected; final focused results replace those failed development runs, not conceal them. No frontend/browser/load/staging/provider test ran.

## 12. Source-backed changes

| Current source | Significant responsibility |
| --- | --- |
| [packages/contracts/src/cart.ts:18](../../../packages/contracts/src/cart.ts) | Additive shared DTOs, immutable outcome and typed owner |
| [packages/database/src/cart.ts:1](../../../packages/database/src/cart.ts) | Old imports preserved |
| [packages/database/src/cart/context.ts:14](../../../packages/database/src/cart/context.ts) | Token lookup/account exclusion/checked revision |
| [packages/database/src/cart/receipts.ts:25](../../../packages/database/src/cart/receipts.ts) | All-mutation transactional receipts/outbox/locks |
| [packages/database/src/cart/legacy-receipts.ts:9](../../../packages/database/src/cart/legacy-receipts.ts) | Pre-foundation consumed-key compatibility |
| [packages/database/src/cart/queries.ts:10](../../../packages/database/src/cart/queries.ts) | Consistent evaluation, publication redaction and bounded hydration |
| [packages/database/src/cart/commands.ts:27](../../../packages/database/src/cart/commands.ts) | Current commands share replay and resource guards |
| [packages/database/src/migrations/3213_cart_foundation.ts:5](../../../packages/database/src/migrations/3213_cart_foundation.ts) | Additive scoped constraints, ownership/coupon metadata and receipt index |
| [apps/api/src/routes/cart.ts:36](../../../apps/api/src/routes/cart.ts) | Scoped API security, initialization and compatible existing endpoints |
| [apps/api/src/routes/cart-context.ts:51](../../../apps/api/src/routes/cart-context.ts) | Configured identity/context/capability selection |
| [apps/api/src/routes/shopper-auth.ts:44](../../../apps/api/src/routes/shopper-auth.ts) | Opt-in strict auth resolver, existing Wishlist default retained |
| [apps/api/src/routes/orders.ts:68](../../../apps/api/src/routes/orders.ts) | One-slot legacy reader adapter, no Checkout expansion |
| [packages/database/src/orders/placement.ts:198](../../../packages/database/src/orders/placement.ts) | Preserve existing CHECKOUT_CHANGED behavior |
| [packages/database/src/promotions.ts:838](../../../packages/database/src/promotions.ts) | Owning-domain stack cap |
| [packages/database/src/index.ts:53](../../../packages/database/src/index.ts) | Observed pg error-event recovery |
| [apps/api/src/server.ts:20](../../../apps/api/src/server.ts) | Safe API DB-loss logging |
| [apps/worker/src/server.ts:18](../../../apps/worker/src/server.ts) | Safe Worker DB-loss logging |
| [packages/database/src/testing/cart-fixture.ts:20](../../../packages/database/src/testing/cart-fixture.ts) | Random newly created local test DB proof/cleanup |
| [packages/database/src/cart-foundation.test.ts:49](../../../packages/database/src/cart-foundation.test.ts) | Real domain/upgrade/replay/disconnect tests |
| [apps/api/src/cart-foundation.test.ts:116](../../../apps/api/src/cart-foundation.test.ts) | Controlled-order API/auth/security tests |

Also changed: database package public `./testing/cart` export, contracts/migration indexes and auth composition registration. No dependency version/lockfile/install change. Official Fastify route/body-limit docs, PostgreSQL18 constraints/alter-table docs and node-postgres client/pool event docs informed implementation; no framework upgrade/config replacement. See [Fastify routes](https://fastify.dev/docs/latest/Reference/Routes/), [PostgreSQL18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html), [pg pool](https://node-postgres.com/apis/pool), [pg client](https://node-postgres.com/apis/client).

## 13. Documents and acceptance

Created this report, pre-edit impact map, exact bootstrap protocol, implemented owner/receipt profile, Phase01A acceptance register and machine-readable verification. Updated Cart index/master/system/data/API/scenario/threat references to distinguish historical proposal from implemented profile. Phase00 historical acceptance remains21PASS/3PARTIAL; Phase01A is15PASS/1PARTIAL. Scenario coverage is targeted; full59-scenario/30-threat acceptance is not asserted.

## 14. Risks and next phase

Guest backend interfaces can support Phase01B development, but full Phase01A acceptance remains open for legacy parity. The exact smallest closure is in the acceptance register: explicit signed-in legacy policy, safe old-cookie adoption/retirement without lost acknowledged authority, and owner-aware client adoption/real-browser proof. Do not auto-start account merging or Checkout. Preserve user intent/receipts and fail closed while those boundaries are unresolved. Separate business/privacy/location/tax/Meta gates remain assigned later; representative latency, natural browser TTL, accessibility and VPS proxy behavior unverified.
