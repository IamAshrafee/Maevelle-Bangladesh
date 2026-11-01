# Wishlist Phase 01 implementation report

Status: **PARTIALLY COMPLETE** — 2026-10-30. A secure customer-controlled storefront authentication lifecycle is still missing. The private account API adapter is intentionally **not registered**; no account Wishlist route is exposed. This report distinguishes implemented local foundations from the blocked acceptance gate.

## A. Executive summary

Implemented additive account Wishlist schema, product-level persistence with optional preferred variant, tenant-aware owner validation, idempotent desired-state save/remove, bounded batch membership, recent-first keyset pages, shared private DTOs, and an unregistered Fastify adapter. Focused tests run against disposable local PostgreSQL 18 databases and include a populated 3208-to-3209 upgrade. Guest Wishlist and sharing source were preserved. No guest merge, account UI, sharing enhancement, Cart, Checkout, staging or production operation was undertaken.

## B. Initial repository state

Branch `main`, one commit ahead of `origin/main`. The working tree had tracked and untracked guest Wishlist/share work, notably `apps/api/src/routes/wishlist.ts`, `packages/database/src/wishlist-sharing.ts`, `packages/database/src/migrations/3208_wishlist_sharing.ts`, related Storefront files, plus unrelated `stockout-interest/` notes. The 3208 file was already registered in `migrations/index.ts`. See the Phase 00 report for file-by-file audit. All pre-existing work remains in place. At Phase 01 preflight, `DATABASE_URL` and `TEST_DATABASE_URL` were absent from the shell, but the local Compose PostgreSQL 18 container was healthy on loopback port 5434. Tests supplied only the checked-in development test URL and created uniquely named disposable databases.

## C. Migration 3208 assessment and safety matrix

`3208_wishlist_sharing.ts` creates `wishlist.shares` and `wishlist.share_items`; it is untracked in the working tree and registered. Its applied status in staging, production or another persistent environment is **UNVERIFIED**. The immutable migration baseline guard covers 51 older migrations; `node scripts/check-migration-history.mjs` reports 58 registered and 51 immutable baseline migrations after adding 3209. No historical migration was edited. New `3209_account_wishlist.ts` adds independent account tables and one additive composite unique constraint on `customers.customer_accounts`; it does not alter guest share rows or token columns. The local upgrade test migrated through 3208, inserted a guest share, ran 3209, and verified that share survived.

| Environment | Safety finding | Required action before deployment |
|---|---|---|
| Fresh database | Full migration test passed through 3209. | CI fresh install and app smoke at release gate. |
| Existing local development DB | Container is healthy; its ledger was not inspected or mutated. | Read status before local migration; preserve any useful local data or deliberately use disposable DB. |
| Staging with 3208 applied | Forward 3209 is ordered after 3208; disposable upgrade with guest share passed. Actual staging objects unverified. | Read-only ledger/schema comparison, backup and one controlled migration job. |
| Staging without 3208 | Both 3208 then 3209 would run in order. | Confirm current schema/ledger and that 3208 is approved before staging rollout. |
| Existing partial guest shares | New migration does not change shares/items. Local populated-upgrade test passed. | Verify actual staging row count and schema before rollout. |
| Rollback/repair | Application rollback does not undo 3209; earlier guest-only app should ignore new tables. | Record last compatible app SHA, retain backup, use forward repair if migration fails after partial operational rollout. No down migration in staging. |

## D. Shopper authentication architecture and blocker

Existing Better Auth instance in `apps/api/src/auth/auth.ts` is configured as “Maevelle Admin”; its sign-up is disabled outside bootstrap. Admin access requires an organization membership/capability, but that does not make its session a customer-controlled storefront session. `customers.customer_accounts` maps IAM users to CRM customers, yet `resolveCustomerForAuthenticatedUser` in `packages/database/src/customers/accounts.ts` may attach an unlinked CRM record through contact matching. That helper is unsuitable as authorization proof for a private Wishlist. Existing account verification and recovery endpoints are Admin workflows (`apps/api/src/routes/account.ts`). There is no verified shopper registration, verification, sign-in, sign-out, recovery and session lifecycle. A complete shopper flow would require separate browser credential/session handling, secure verification delivery and abuse controls; enabling Admin sign-up or trusting a CRM match would weaken the boundary.

The domain accepts a server-only `{organizationId, accountId}` owner input and rechecks active customer-account, customer, IAM user and verified email before each operation. **This is a defense inside the persistence layer, not proof that the browser controls that IAM identity.** The future resolver must mint that input only from a verified shopper session bound to the configured Storefront organization; it must not accept organization/customer/account IDs from the request. Admin-only sessions must be rejected. The adapter in `apps/api/src/routes/account-wishlist.ts` requires such a resolver and is not imported or registered in `routes/auth.ts`. Thus current private routes are closed by non-registration, and Phase 01 identity/API acceptance remains blocked. No API response claims a successful customer login.

## E. Implemented database schema

`packages/database/src/migrations/3209_account_wishlist.ts`:

- Adds `customers.customer_accounts(organization_id,id)` unique constraint for composite ownership FK.
- `wishlist.account_lists`: UUIDv7 PK, organization, owner account, positive list version, timestamps, unique `(organization_id,owner_account_id)` and `(organization_id,id)`, composite account FK. One default list per account.
- `wishlist.account_items`: UUIDv7 PK, organization/list/product, nullable preferred variant, saved/updated time, positive row version; unique `(organization_id,wishlist_id,product_id)`; composite tenant FKs to list/product/variant. Product hard deletion cascades the item; variant hard deletion nulls only the preference. Recent page and product aggregate indexes.
- `wishlist.merge_receipts`: `(organization_id,wishlist_id,merge_id)` PK, 32-byte request digest, account version, JSON result, timestamps/expiry, composite list FK and expiry index. Phase 02 owns merge execution. No deletion tombstone was added: the intended Phase 02 protocol must require an exact base list version and reject/rebase stale merges before insert, so a removal after snapshot cannot be resurrected. This policy needs a focused concurrency test in Phase 02.

No product title, handle, price, inventory, media or description is stored in account items. Account privacy deletion is **not yet integrated**: FK intentionally restricts deletion of an owner account with a list until an explicit privacy workflow purges the list and future shares. This is a high-severity closure item before exposing accounts.

## F. Domain implementation

`packages/database/src/wishlist/account.ts` owns `getWishlistPage`, `getWishlistSavedState`, `saveWishlistProduct`, and `removeWishlistProduct`. The first access creates the one default list with `ON CONFLICT DO NOTHING`, after checking active account/customer/user and verified email. Transactions lock the identity rows; mutations lock the list row, compare optional expected list version, validate public product/active variant, use the unique item constraint, and advance list version only when state changes. Repeated identical PUT preserves `saved_at` and version; omitted preference preserves the existing value, explicit null clears it. Repeated DELETE returns the current version without a write. Out-of-stock products remain eligible; only active/published status governs new saves. Unpublished/archived saved entries remain as private unavailable rows. Reads hold a shared list lock while gathering rows, count and version so those fields describe one stable list state. The list query hydrates current public catalog fields in one SQL statement with a media subquery; it never returns unpublished product details. It pages by `(saved_at,id)` descending and caps at 100, with a separate accurate count. A cursor is structurally validated but not cryptographically signed; when routes are enabled, binding/signed cursor behavior should be reviewed. The account list lock serializes writes for one owner, and `expectedVersion` yields 409 at the adapter on a stale command. It does not infer cross-device chronological intent.

## G. Shared contracts

`packages/contracts/src/wishlist.ts`, exported from `index.ts`, defines item/page/saved-state DTOs, save input and error codes, plus Phase 02 merge request/receipt types. It explicitly distinguishes omitted, set and null-cleared preferred variant. Owner IDs are absent from transport types. The private route adapter uses TypeBox boundary schemas for UUIDs, page size, bounded product arrays and save inputs. No new package dependency was installed. Full shared runtime schema centralization remains incomplete because contracts currently follow interface-first conventions without a runtime schema dependency.

## H. API implementation status

`apps/api/src/routes/account-wishlist.ts` contains an adapter for `GET /storefront/v1/wishlist`, `POST /storefront/v1/wishlist/saved-state`, `PUT /storefront/v1/wishlist/items/:productId`, and `DELETE /storefront/v1/wishlist/items/:productId`. It returns `{data}` or structured errors, applies private no-store, and requires an injected verified shopper resolver. **It is not registered.** No protected account endpoint is reachable. This intentionally fails Phase 01 API acceptance until shopper authentication, CSRF/origin enforcement, rate limiting and real integration tests exist. The existing public guest routes in `apps/api/src/routes/wishlist.ts` remain registered and unchanged.

## I. Security assessment

| Threat | Implemented protection / evidence | Limitation |
|---|---|---|
| Cross-tenant product or variant | Composite FKs and organization predicates in migration/domain; isolated DB test with other organization. | Route principal minting not implemented. |
| Duplicate/concurrent save | Unique product key, list row lock, no-op idempotency; concurrent save test. | Cross-device intent ordering requires caller version/reconciliation. |
| Stale command | Optional `expectedVersion`, 409 mapping; stale-version test. | Unregistered route not integration-tested. |
| Unpublished disclosure | Public eligibility on write; public-only left join on read; unpublished test. | Search projection freshness not benchmarked. |
| Admin/CRM impersonation | No route registration; no contact-matching resolver used. | Customer-controlled auth absent, critical blocker. |
| Session fixation/CSRF/rate abuse | No private route exposed. | Must implement and test with shopper auth before registration. |
| Privacy deletion | FK prevents orphan ownership. | Explicit purge/revoke lifecycle still missing; high severity. |
| Sensitive logging/cache | No owner or token logging added; adapter sets private no-store. | Proxy and browser behavior unverified. |

## J. Tests and verification

Ran `pnpm --filter @maevelle/{database,contracts,api} exec tsc --noEmit -p tsconfig.json` individually: passed. Targeted ESLint on new TS files: passed. `node scripts/check-migration-history.mjs`: passed, 58 registered/51 immutable. `git diff --check`: passed. `TEST_DATABASE_URL=.../maevelle_test pnpm exec vitest run packages/database/src/migrate.test.ts --reporter=dot`: passed 1 test, fresh disposable schema through 3209. The new `packages/database/src/wishlist/account.test.ts` initially failed three cases because its catalog fixture supplied lowercase normalized SKU, violating catalog's `sku_normalized=upper(trim(sku))` check. The fixture was corrected after inspecting the catalog constraint; rerun passed 3 tests. The test creates and drops its own uniquely named database, migrates to 3208, inserts a guest share, applies 3209 and checks preservation. Domain tests cover duplicate PUT, preference semantics, variant hard deletion clearing only preference, one item, concurrent save, owner/tenant separation, publication, pagination, invalid cursor, version conflict, repeated DELETE, suspended mapping and unverified IAM email. No staging, production, live auth, API integration, browser, full suite, or benchmark check was run.

## K. Files created or modified in Phase 01

Created: `packages/database/src/migrations/3209_account_wishlist.ts`; `packages/database/src/wishlist/account.ts`; `packages/database/src/wishlist/account.test.ts`; `packages/contracts/src/wishlist.ts`; `apps/api/src/routes/account-wishlist.ts`; this report.

Modified: `packages/database/src/migrations/index.ts` (add 3209 while preserving dirty 3208 registration); `packages/database/package.json` (account module export while preserving dirty guest-sharing export); `packages/contracts/src/index.ts` (Wishlist contract export); `docs/product-completion/current-focus.md` (resume point). No other existing dirty file was modified for Phase 01. In particular, guest Wishlist, sharing, Cart, Checkout, Admin auth, infrastructure and environment files were not changed.

## L. Compatibility

3209 depends on 3208's `wishlist` schema but does not mutate guest share tables. The populated guest-share upgrade test passed. Existing guest browser state and Storefront behavior are unchanged. The unregistered account route cannot collide with the already registered guest share/hydration routes. Cart and Checkout remain untouched. Account list owner FK blocks account row hard deletion until explicit cleanup; existing CRM anonymization flow must be integrated before account release. The private page DTO supplies current public product details or null, allowing a future account Storefront adapter without duplicating catalog authority.

## M. Deployment and migration requirements

No staging/production migration, deploy, restart or infrastructure change occurred. Before a later staging release: inspect staging's 3208 ledger and actual schema read-only; confirm 3209 has not been applied; back up and record compatible release; run 3209 once as controlled migration after 3208; deploy compatible API/Storefront only after a shopper auth boundary and privacy deletion path are ready; check API and browser sessions, CSRF/origin, domain routes, logs and schema status. No new secret was introduced in this phase. Shopper auth may need verification/recovery email delivery and a distinct cookie/session namespace; decide and configure those with official Better Auth documentation and existing email provider before deployment. Existing `BETTER_AUTH_SECRET` and auth encryption key must not be reused to fake a shopper identity. No application image rollback reverses 3209.

## N. Blockers and technical debt

- **Critical:** verified shopper registration/verification/sign-in/sign-out/recovery and session namespace absent. Private route stays unregistered; account API is not usable.
- **High:** privacy deletion/anonymization must purge private list and future account shares before account release.
- **High:** staging 3208 applied status and schema are unverified. Deployment gate remains closed.
- **High:** private API CSRF/origin and abuse controls need actual session integration and negative tests.
- **Medium:** cursor is structurally opaque but unsigned; add owner-bound signing or retain owner-scoped keyset with explicit tamper policy before route exposure.
- **Medium:** runtime shared schemas are still route-local TypeBox; contracts currently provide shared types only.
- **Low:** representative performance and browser checks await Phase 07.

## O. Phase 01 acceptance checklist

| Requirement group | Verdict | Evidence |
|---|---|---|
| Real shopper authentication/session, Admin separation by verified login | **BLOCKED** | No customer-controlled flow; private route unregistered. |
| Organization-scoped account table/list/items/variant constraints, merge receipt foundation | **PASS** | 3209 fresh and 3208 upgrade tests. |
| Domain idempotency, concurrency, eligibility, pagination | **PASS for tested cases** | 3 focused DB tests; no full volume benchmark. |
| Shared DTO types and structured error mapping | **PASS/PARTIAL** | Shared types and unregistered TypeBox adapter; runtime schema not shared. |
| Protected account API reachable and security negative integration tests | **BLOCKED** | Deliberate non-registration. |
| Guest/share preservation, Cart/Checkout untouched | **PASS** | Git diff/status review and populated-share upgrade test. |
| Staging migration status and release | **NOT VERIFIED / not performed** | No staging access or deployment. |
| Focused typecheck, lint, migration guard, local DB tests | **PASS** | Commands in section J. |

Overall Phase 01: **PARTIALLY COMPLETE**, not production-ready. Do not start Phase 02 guest/account synchronization against an unauthenticated account API.

## P. Phase 02 handoff

The immediate dependency is completing shopper authentication and the remaining Phase 01 security gates. Keep `registerAccountWishlistRoutes` unregistered until a customer-controlled resolver returns an organization-bound active `WishlistOwner`, with Admin-only and CRM-match negative integration tests, CSRF/origin checks, rate limits and session expiry/logout coverage. Integrate account privacy deletion, review signed cursor policy, then register and test the route. The database module export is `@maevelle/database/wishlist-account`; shared types are exported from `@maevelle/contracts`. Phase 02 can then migrate the guest store to reference-only operations, add cross-tab journal and account adapter, implement merge using `wishlist.merge_receipts` with exact `baseVersion` conflict/rebase semantics, and prove no removal resurrection. Do not use `resolveCustomerForAuthenticatedUser` as private-list authorization. Preserve guest sharing and do not modify Cart/Checkout.
