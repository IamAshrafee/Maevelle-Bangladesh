# Phase 03A Account Cart backend acceptance

**Local backend acceptance — PARTIAL. Production release — BLOCKED.**

Work started from clean HEAD `0b3fd2f9a30a4fe0e3bcf8aa3315c966361895e5`. This record supersedes the design assumptions in the [Phase 03A handoff](PHASE_03A_ACCOUNT_CART_HANDOFF.md) where the implementation differs. The Phase 02-C evidence and Orders delivery-pricing fixture correction are preserved.

## Ownership and architecture

- **Keep** the existing verified Shopper Auth realm. The strict resolver supplies the configured tenant, shopper account, verified user and customer mapping. Account writes recheck the exact mapping and active status under customer and account row locks before taking the Cart lock. Guest authority continues to require a server-issued, correctly named slot with a live digest. Login alone does not select or transfer a guest Cart.
- **Separate the route namespaces.** A single automatic current-Cart route would make a change in cookies capable of changing the authority selected by a pending client request. Account endpoints require shopper authority and never resolve guest authority for ordinary reads or commands. Guest endpoints retain their existing authenticated refusal code for the current Storefront controller. The merge endpoints explicitly require both authorities for a new commit.
- **Share the Cart engine.** Catalog validation, price and availability resolution, coupon evaluation, line replacement, Clear, revision checks and receipt/outbox handling are common. Resolve authority and lock the aggregate before evaluating or writing it. The proposed merge uses the same merchandise evaluator on bounded, server-selected line IDs and quantities. It stages no Cart writes.
- **Persist account Carts without guest credentials or expiry.** GET reads the active Cart or returns 404. A deliberate POST creates or retrieves it, including concurrent first use. Uniqueness is enforced by the existing active tenant/account/currency index. Clearing leaves the Cart identity intact. Logout ends session authority. A subsequent valid session can recover the account Cart. Failed or suspended mappings deny access. No destructive retention or reactivation job is enabled. The database pins the verified user as well as the customer-account tuple. CRM can reactivate the same shopper link, while a different user relink or CRM merge that would remove or reassign a Cart owner returns a conflict.
- **Protect existing guest conversion.** Guest order placement now locks the Cart before evaluating lines and holds the lock through conversion. This closes the race with transfer of the same Cart. The Checkout API keeps its existing refusal of authenticated account authority.

## Review and commit semantics

| Case | Backend behavior |
| --- | --- |
| Explicit selection | The caller supplies the account owner context, guest Cart ID and guest owner context. The exact guest cookie name must match the selected Cart ID, and its digest, tenant, currency, status and expiry are checked. Multiple valid slots are listed as opaque pairs for selection. A fixed, forged, expired, retired or mismatched slot grants no authority. |
| Identical variant | Sum the quantities and retain the existing account line ID. The collided guest line remains on the inaccessible merged Cart as history. |
| Distinct variant | Move the line with its existing ID. The projected and committed views use the same stable line ordering. |
| Limits | More than 99 units per variant or 100 combined lines blocks commit. The preview records the original quantities and reason. Resolve through deliberate edits or defer the merge. Partial transfer and implicit quantity truncation are excluded from this contract. |
| Stock, unavailable or invalid items | Preserve intent under the technical caps. The projected Cart shows availability, recovery suggestions and safe redaction. A shopper must explicitly confirm the reviewed plan. Nothing reserves stock or establishes a Checkout amount. |
| Coupons | Keep account selections. Show guest selections as candidates in the guest view. No automatic coupon transfer or redemption. Both Cart types use the existing conservative eligibility preview, so customer-limited coupon benefits remain unpromised pending an approved account promotion policy. |
| Empty guest | An empty or coupon-only guest Bag yields `EMPTY_GUEST`. The guest slot remains usable and no merge event or committed receipt is created. A populated guest may merge into an explicitly established empty account Cart. |

The review fingerprint binds both owner contexts, guest ID, both intent revisions, line plan, and current and projected commerce fingerprints. Evaluation time alone does not invalidate a review. Material price, discount, availability and recovery-quantity changes do. The server rebuilds the plan from live authority in the commit transaction.

Account writes lock the customer and account rows in that order, then the account Cart. Merge takes the selected guest Cart lock last. Guest commands take only the guest lock, and existing guest placement takes its Checkout lock before the guest lock. No merge path acquires a Checkout lock. Repeatable read provides a coherent commerce snapshot and retries serialization failures up to three attempts. Lock and statement timeouts remain bounded.

A successful merge writes the lines, advances the account revision once, records the guest's MERGED destination, retires its credential and commits one account-scoped receipt and one Cart outbox event in the same transaction. An exact retry checks the account Cart's receipt before consulting the guest credential. The fingerprint binds the original request, and the receipt is scoped to the authorized account Cart and operation. The response separates the immutable outcome from a freshly evaluated account view. The existing seven-day recovery window applies. Expired records remain consumed. Replay assumes the original account Cart is active. A future archival policy must define cross-lifecycle receipt lookup before it can retire account Carts.

## Phase 03B API contract

Base path `/storefront/v1/carts/account`, through the Storefront's same-origin `/api` rewrite. All responses use the Cart data or error envelope and private no-store headers. Writes require trusted Origin and JSON. No account or tenant ID is accepted from the client as authority.

| Request | Input and result |
| --- | --- |
| `GET /current` | `AccountCartViewDto` or `NOT_FOUND`. Account views use `expiresAt: null`. |
| `POST /` at the base path | Send `{}` to establish or retrieve the Cart. Returns its view without issuing a guest cookie. |
| `POST /current/lines`, `PATCH /current/lines/:lineId`, `PUT /current/lines/:lineId/variant`, `DELETE /current/lines/:lineId` | Existing line operations and payloads. Supply observed `version`, `ownerContext` in the body, and a UUID `Idempotency-Key`. |
| `POST /current/coupons`, `DELETE /current/coupons/:couponCode`, `DELETE /current` | Apply, remove or atomically Clear, with the same mutation preconditions. |
| `GET /merge/guests` | `CartMergeGuestContextDto[]` for valid cookies in this tenant and currency. Returns no guest lines until the shopper selects a pair. |
| `POST /merge/preview` | Send `CartMergeSelectionDto`. Receive `CartMergePreviewDto` with account/guest snapshots, line mappings, projected Bag, blockers and review fingerprint. This operation writes no Cart rows. |
| `POST /merge/commit` | Send the exact selection, `version` from the reviewed account revision, and `reviewFingerprint` with a UUID `Idempotency-Key`. Returns the current account view and `outcome`. Success and exact replay expire only the selected guest slot in the browser. |

Phase 03B should fence its queue and owner epoch on every auth transition and use the existing verified shopper client partition. Drain or explicitly recover uncertain guest intents before asking for merge. Keep the original request and UUID after an uncertain commit. Retry only under the same verified account partition. `STALE_VERSION` means refresh the account Cart and review again. `MERGE_STALE` means obtain a new preview before confirmation. `MERGE_REVIEW_REQUIRED` means the plan is blocked. `OWNER_CHANGED`, session errors and unavailable guest authority require resolving identity or the selected slot. Never retry an account action as guest, auto-create a replacement after an auth failure, or apply one account's outcome to another. Device refresh on focus or navigation and revision conflicts supply synchronization without a realtime service.

## Verification and remaining gates

Tests ran on a new Docker Desktop PostgreSQL 18.6 container with disposable storage, a random loopback port and no host mounts. The suite used a migrated dedicated `maevelle_test` and generated databases for isolated fixtures. Real Fastify tests signed in verified synthetic shoppers. The fresh migration and populated migration harness passed through 3216, including validation of the live and retired guest shapes, wrong-customer ownership rejection and active-account uniqueness. The populated harness verified 14 post-baseline migrations.

| Gate | Status | Evidence |
| --- | --- | --- |
| Account lifecycle and cross-device | PASS | Explicit concurrent creation, account isolation, returning sessions, quantity, coupons, Clear, stale revisions and logout denial. |
| Merge integrity and recovery | PASS | Collision and distinct-line identity, coupon retention, limit review, invalid configuration preservation, stale guest/account/commerce changes, concurrent duplicates and different-account claims, exact replay after revocation, and forced PostgreSQL connection loss after line writes. |
| Guest compatibility and order boundary | PASS | Existing API, persistence and Storefront tests. A PostgreSQL lock test verified an in-flight merge prevents guest order placement and stock reservations when merge wins. |
| Security breadth | PARTIAL | Targeted TypeScript source review, ESLint and adversarial tests cover tenant/line/context substitution, incorrect cookie slot, wrong-account replay, origin and session denial. Deployed proxy/TLS, roles, privacy and independent security review remain open. |
| Scale and frontend | PARTIAL | Stocked merge projection was measured locally. Representative load, browser/device/accessibility and full Phase 03B behavior remain open. |
| Production release | BLOCKED | Persistent cutover and restore/revocation evidence, approved retention and deletion policy, infrastructure and workload evidence, and outstanding business policies remain release gates. |

The focused regression passed **252 tests across 26 files**. The Cart reassessment passed nine additional tests with the fixed-output historical benchmark skipped. The database build, API and Storefront typechecks, focused ESLint and whitespace check passed. Dedicated Semgrep and CodeQL binaries were unavailable locally. The security review used source inspection and adversarial runtime tests.

The capacity test seeded stocked variants with active prices and measured five sequential direct-domain previews at each size.

| Combined lines | Kysely SQL statements | Median |
| ---: | ---: | ---: |
| 2 | 20 | 13.35 ms |
| 20 | 20 | 13.62 ms |
| 100 | 20 | 17.53 ms |

The statement count includes SQL timeout configuration and excludes PostgreSQL transaction protocol, Shopper Auth and HTTP transport. The 101-line plan was blocked before evaluating the projected union. These synthetic medians do not represent multi-tenant concurrent load or deployed latency.

Two integration fixtures required adjustment. The older Cart upgrade test asserted that 3215 was the only remaining migration. It now verifies that 3215 applies first after repair and the full ledger is repeatable. The Wishlist fixture still verifies its exact legacy upgrade sequence before advancing to the current schema for cross-domain CRM tests. Merge review also exposed an implementation bug during testing. Hashing an object in transport field order rejected equivalent preview and commit payloads. The fingerprint now serializes owner bindings in an explicit order.

Reproduce against a verified disposable `TEST_DATABASE_URL`. Run the database build, migrate the dedicated test database, then run:

```sh
pnpm --filter @maevelle/database build
DATABASE_URL="$TEST_DATABASE_URL" node packages/database/dist/src/migrate-cli.js
UPGRADE_TEST_ALLOW=1 node packages/database/dist/src/upgrade-test-cli.js
pnpm exec vitest run --reporter=verbose apps/api/src/{account-cart,cart-foundation,cart-credential-closure,shopper-auth,routes/pricing,routes/promotions}.test.ts packages/database/src/{cart-foundation,cart-credential-closure,cart-merge-capacity,customers,wishlist-sharing,catalog-variant-integrity,inventory,orders}.test.ts packages/database/src/wishlist/account.test.ts apps/storefront/features/{cart,wishlist,pdp} apps/storefront/components/commerce/wishlist-button.test.tsx
pnpm exec vitest run packages/database/src/cart-reassessment.test.ts -t 'AR0[1-7]|AR1[45]'
pnpm exec tsc -p apps/api/tsconfig.json --noEmit
pnpm exec tsc -p apps/storefront/tsconfig.json --noEmit
git diff --check
```

Migration 3216 expands the existing schema and validates the account/customer/user/tenant tuple. It keeps guest digests and intent intact. A persistent deployment must preflight any pre-existing rows with `owner_account_id` populated. Unexpected reserved-owner rows require explicit reconciliation before migration. Apply the migration before enabling account and merge routes, coordinate API versions that can place guest Orders, and retain the last compatible application release. Recovery is forward repair or verified backup restore. Schema rollback must never un-revoke a merged guest credential.

Open policy includes account Cart retention and deletion, partial merges, customer-limited promotion eligibility and redemption, destination/channel stock policy, compare-at and tax presentation, advanced promotion stacking, and final Checkout pricing and delivery. These decisions remain separate from the technical Cart safeguards.
