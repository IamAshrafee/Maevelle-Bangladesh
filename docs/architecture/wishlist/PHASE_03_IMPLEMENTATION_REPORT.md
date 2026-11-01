# Wishlist Phase 03 implementation report

Date: 2026-10-31 (Asia/Dhaka). Status: **PARTIALLY COMPLETE — local implementation requires database/API integration verification and security closure.** No deployment, persistent migration, commit, service restart, or Cart/Checkout edit occurred.

## A. Executive summary

A forward migration extends the existing share tables for account ownership, preferred variants, encrypted link recovery, and durable creation receipts. New database services and routes create guest and account snapshots, list/manage account shares, claim a guest share, hydrate public catalog data, and clean retained records. The existing guest browser adapter was minimally updated for creation recovery and the new public response. TypeScript, lint, crypto test, migration-history guard and diff checks pass. Local PostgreSQL was unavailable, so fresh/upgrade migration execution, lifecycle integration, and API security tests are **not verified**. Phase 03 must not be called complete or production-ready.

## B. Repository preflight

Branch `main`. The working tree was dirty with tracked and untracked Phase 00–02 Wishlist/auth work, including untracked 3208/3209 migrations, API sharing routes, Storefront sharing UI, and unrelated stockout-interest notes. All were preserved. The four prerequisite phase reports, product-completion state/focus, schema, sharing and account services, shopper resolver, auth/rate hooks, privacy transaction, Worker, contracts, and Storefront consumers were inspected. Staging ledger and schema remain **UNVERIFIED**; no authorized read-only staging connection was available.

## C. Existing sharing audit

Reused the 3208 `wishlist.shares`/`share_items` identity and 256-bit random SHA-256-digested guest capabilities. Existing guest rows and management credentials are not rewritten. Confirmed that the old public open service returned raw product IDs before eligibility filtering; the public route now uses catalog-filtered hydration. Confirmed a process-local creation limiter and additive renewal; the API now uses the PostgreSQL-backed app limiter and desired expiration. The old database helper remains for its legacy tests, but the API uses the new lifecycle service. Existing UI is updated to send a durable operation ID and desired expiration. The historical guest management credential storage key remains `maevelle_wishlist_shares_v1`.

## D. Final sharing domain architecture

`wishlist.shares` has organization, optional owner account, view-token digest, optional encrypted view token, nullable guest management digest, timestamps, revocation, version, and claim replay digest. A null owner with management digest is a guest share; a nonnull owner without it is an account share. `share_items` holds ordered product and optional variant references only. Membership is fixed after creation; price, availability, title, handle, and image are read from current public catalog on each open. States are derived: active (unrevoked, unexpired), expired, revoked, then purged. Multiple shares are independent. Account shares are capped at 50 active; each snapshot at 100 items. Account “all” selects the entire eligible saved collection in one transaction, ignores unpublished items and inactive variant preferences, and rejects more than 100 public items instead of truncating them.

## E. Database and migration implementation

New `3210_wishlist_share_lifecycle.ts` follows 3208/3209 without changing them. It adds composite organization/account FK, owner/credential check, positive version, preferred variant composite FK, creation receipt PK `(organization_id,owner_scope,operation_id)`, 32-byte request digest, encrypted response, and 48-hour recovery expiry. Owner history, retention expression, and receipt expiry indexes support reads/cleanup. Existing guest rows satisfy the new check. The existing product and share composite FKs, unique snapshot product and position, and `position between 1 and 100` remain authoritative. Migration registry now has 59 entries and the immutable 51-migration baseline passes. **Fresh and populated upgrade execution were attempted but failed before connecting** because `localhost:5434` refused connections; schema runtime correctness remains unverified.

## F. Token and cryptographic design

`share-crypto.ts` generates separate 32-byte `randomBytes` URL-safe capabilities, stores SHA-256 digests for verification, and derives a dedicated recovery key from the existing 32-byte `AUTH_ENCRYPTION_KEY` with HKDF-SHA256 and a Wishlist-specific context. Recovery uses AES-256-GCM with independent 96-bit random nonces, authentication tags, and context-bound AAD. The encrypted view token is stored for account re-copying; encrypted creation results are kept for 48 hours for lost-response replay. Raw tokens do not enter audit metadata, query parameters, or public DTOs. The key must be backed up with the database; key loss prevents link re-copy/replay but does not invalidate existing public links. A key ring and bulk re-encryption job are **not implemented**. An authenticated owner may explicitly rotate one active link, invalidating its previous view token; this is a recovery path for key loss or a claimed legacy share, with a forwarding consequence that must be clear in Phase 05 UI. Legacy 3208 guest shares have no encrypted view token; if claimed, the old view link cannot be reconstructed from its digest without explicit rotation.

## G. Guest sharing implementation

`POST /storefront/v1/wishlist/shares` requires 1–100 distinct public product IDs (or items with active preferred variants), a browser-generated 256-bit `operationId`, and an absolute desired expiry. It verifies organization, current publication and active status, preferred variant ownership, and snapshot order. The guest browser cannot prove local prior savings; the server treats input as a requested public collection. An advisory transaction lock and receipt PK serialize identical operations. Same payload replays the encrypted creation result; changed payload returns 409. The browser stores the pending operation before calling, reuses it after a lost response, and attempts immediate revocation if credential persistence fails. A lost browser management credential cannot be recovered from the public link.

## H. Account sharing implementation

The account route receives its owner only from `resolveShopper`, which requires a verified shopper session and active organization-scoped mapping. The domain rechecks account/customer/user status. Selected product IDs must exist in that account's private list; “all” reads the authoritative eligible collection. Current public catalog and variants are verified before insertion. Account management supports paginated history, detail, active link recovery, explicit link rotation, desired-state expiration, and idempotent revoke, all scoped by organization and account. No customer/account ID is accepted as authorization input. The existing Storefront sharing panel still uses guest creation; account sharing UI belongs to Phase 05.

## I. Guest-to-account claiming

`POST /storefront/v1/wishlist/account-shares/:id/claim` requires both the verified shopper session and guest management capability. The transaction locks the share, checks active/unrevoked state and active account, transfers owner, nulls the management digest, stores a digest solely for same-owner retry recognition, increments version, and appends a safe audit event. It preserves view-token digest and snapshot. Wrong owner/token receives 404; repeat from the same owner/token is idempotent. Phase 02 Wishlist merge remains separate. Legacy claimed shares cannot recover their old view token through account management.

## J. Public share retrieval

`POST /storefront/v1/wishlist/shares/open` verifies the view digest and active state in a transaction with a share row lock, then returns only currently active/published catalog products, current price/availability/media, active preferred variant ID, stable item order, and a generic unavailable count. It never returns restricted product IDs, owner data, management credentials, or private Wishlist contents. A valid share with no public products returns an empty product array. The existing recipient component now consumes this response directly. It retains fragment-based links and `noindex`, `nofollow`, and `no-referrer` page metadata.

## K. Expiration, revocation and retention

Creation expiry is validated from one to 90 days; the browser defaults to 30 days. Only active shares may receive a desired expiration update. Repeated identical PATCH/renew does not advance version. Revocation is idempotent and cannot be undone by expiry editing. Public open responses are `no-store`; a read that acquired the share lock before revocation may complete, while later reads cannot. The Worker calls bounded cleanup for expired creation receipts, shares 30 days after expiry/revocation, and expired Phase 02 merge receipts. The share cleanup DELETE rechecks retention eligibility after selecting candidates, so a concurrent extension cannot turn a stale candidate into an active-share deletion. Hard deletion cascades snapshot items and share receipts. Runtime cleanup behavior is not yet tested.

## L. Security and abuse protection

Guest creation and management require exact Storefront Origin and JSON; account mutations reuse the shopper CSRF/origin hook. The existing PostgreSQL-backed IP limiter now covers share routes, including public opens and management, with 429 and Retry-After. Invalid capabilities receive generic 404. Account routes are private/no-store; public opens are no-store/no-referrer. The global 1 MiB body limit is narrowed to 16 KiB for creation and 1 KiB for guest open/management. Proxy client-IP trust still needs staging verification. Token-bearing request bodies must remain excluded from request logging and analytics; no new raw-token logging was added. Rate bucket policy is code-defined and requires operational tuning.

## M. Privacy deletion integration

The authorized customer anonymization transaction deletes account-owned shares before private account lists; guest shares remain untouched. A CRM merge that would delete an account row owning shares now fails with a clear conflict rather than transferring share ownership or hitting a late FK error. A separately authorized ownership policy is needed before those merges can proceed. Focused runtime privacy tests remain open.

## N. Shared contracts and API specification

All routes use `{data}` or `{error:{code,message}}`. Invalid input is 400/422, unauthenticated 401, absent or unauthorized share 404, idempotency conflict 409, rate limited 429, and unavailable sharing 503. All share API responses are no-store. TypeBox validates route input; TypeScript DTOs are in `packages/contracts/src/wishlist.ts`.

| Method and route | Authority | Input / result | Retry |
|---|---|---|---|
| POST `/storefront/v1/wishlist/shares` | Guest Origin | productIds or items, operationId, expiresAt → ID, view/manage tokens, count | Receipt replay, 48 h |
| POST `/storefront/v1/wishlist/shares/open` | View capability | token → public products, unavailable count | Safe read |
| POST `/storefront/v1/wishlist/shares/manage` | Guest management capability | token, inspect/revoke/renew, expiresAt for renew → metadata | Revoke and desired expiry safe |
| POST `/storefront/v1/wishlist/account-shares` | Verified shopper | operationId, expiresAt, all/selected, items → ID, view token, count | Receipt replay, 48 h |
| GET `/storefront/v1/wishlist/account-shares` | Verified owner | limit/cursor → page and nextCursor | Safe read |
| GET `/storefront/v1/wishlist/account-shares/:id` | Verified owner | ID → metadata | Safe read |
| POST `/storefront/v1/wishlist/account-shares/:id/link` | Verified owner | ID, empty JSON → view token | Safe recovery |
| POST `/storefront/v1/wishlist/account-shares/:id/rotate-link` | Verified owner | ID, expectedVersion → new view token/version; prior link invalid | Stale retry returns 409; recover via `/link` |
| PATCH `/storefront/v1/wishlist/account-shares/:id` | Verified owner | expiresAt → metadata | Desired state |
| DELETE `/storefront/v1/wishlist/account-shares/:id` | Verified owner | ID → metadata | Idempotent |
| POST `/storefront/v1/wishlist/account-shares/:id/claim` | Verified shopper + guest management token | manageToken → claim result | Same-owner replay |

## O. Operational observability

Share creation and claiming append token-free audit events. Worker logs the bounded cleanup count with its ordinary job tick. Existing app rate-limit errors are structured and include Retry-After. Dedicated share metrics, open latency histograms, cleanup backlog gauges, and revoke/expiry audit events are **not implemented**; these remain operational gaps, without exposing token labels.

## P. Tests and verification

Passed: four package TypeScript checks (Database, API, Worker, Storefront); targeted ESLint on changed sharing files; `node scripts/check-migration-history.mjs` (59 registered, 51 immutable); `git diff --check`; `vitest run src/wishlist/share-crypto.test.ts` (1 test, encryption/AAD/tamper/token checks). Added a disposable PostgreSQL lifecycle test covering replay/conflict, guest claim, cross-account denial, link recovery and version-guarded rotation, eligible account all/revoke, and catalog unpublication. Attempted database suites (`migrate.test.ts`, `wishlist/account.test.ts`, `wishlist-sharing.test.ts`): **3 files failed before test execution** with `ECONNREFUSED ::1/127.0.0.1:5434`; 4 tests were skipped by that run. No API integration, concurrency runtime, browser, local migration, staging smoke, production, or performance run was performed. Therefore critical token/authorization/revocation/idempotency behavior is implemented in source but not runtime-verified.

## Q. Files created or modified

Created in Phase 03: `packages/database/src/migrations/3210_wishlist_share_lifecycle.ts`, `packages/database/src/wishlist/{share-crypto.ts,share-crypto.test.ts,share-lifecycle.ts}`, `apps/api/src/routes/account-wishlist-shares.ts`, and this report. Modified pre-existing dirty work: `packages/database/src/migrations/index.ts`, `packages/database/package.json`, `packages/database/src/wishlist/account.test.ts`, `packages/database/src/customers.ts`, `packages/contracts/src/wishlist.ts`, `apps/api/src/{app.ts,routes/auth.ts,routes/wishlist.ts}`, `apps/worker/src/worker.ts`, `apps/storefront/features/wishlist/components/{wishlist-sharing-panel.tsx,shared-wishlist.tsx}`, and `docs/product-completion/{state.json,current-focus.md}`. Earlier Phase 01/02 and stockout-interest work was preserved. Cart and Checkout were untouched.

## R. Backward compatibility

3208 guest rows/digests stay in place; the new open and management routes accept their capabilities. The old management storage key and fragment URL format remain. The guest creation API now requires an operation ID and desired expiry; the existing Storefront caller was updated, but an old cached client may receive validation failure until refreshed. The public open response now returns hydrated `products` instead of `productIds`; the existing recipient caller was updated. Phase 02 merge and private Wishlist stay independent. Legacy guest shares have no encrypted link recovery after account claim.

## S. Remaining risks and blockers

**Critical:** PostgreSQL migration and end-to-end domain/API/security tests could not run; the new SQL and concurrency behavior cannot be accepted from compilation alone. **High:** bulk recovery-key rotation still needs an operator protocol; explicit per-share link rotation changes the public URL and requires clear UI. **High:** origin and trusted proxy behavior require real deployment verification. **Medium:** no dedicated open/revoke/expiry metrics or complete lifecycle audit coverage. **Medium:** 48-hour receipt recovery requires the client to retain its pending operation; the current panel does so in localStorage but an account UI has not been built. **Medium:** active share count and cleanup throughput need representative-volume tests. **Medium:** the old database helper still exposes legacy unsafe renewal if called directly outside the API; remove it after callers/tests move to the new service.

## T. Deployment and migration requirements

Before any staging release: inspect 3208/3209 ledger and share counts read-only; compare schema; take a verified backup; confirm `AUTH_ENCRYPTION_KEY` backup/rotation custody; apply 3210 once as a controlled migration; deploy API and Worker compatible with 3210, then refreshed Storefront; verify guest old/new shares, account session, claim, revocation, public filtering, 429, cleanup, and logs. Record SHA, digests, schema state, last compatible release, and smoke outcome. The old API/Worker likely ignore additive 3210 columns, but the new API requires 3210. Image rollback does not reverse migration. Forward repair or verified restore is required for schema failure. No deployment step was executed.

## U. Phase 03 acceptance checklist

| Gate | Status | Evidence |
|---|---|---|
| Guest/account snapshot code, distinct credentials, fixed membership | IMPLEMENTED / NOT VERIFIED | Source and typecheck; DB unavailable |
| Durable replay, conflict, encrypted link recovery | IMPLEMENTED / PARTIAL TEST | Crypto test passed; DB replay test unrun |
| Account owner, tenant, catalog and claim authorization | IMPLEMENTED / NOT VERIFIED | Scoped SQL; DB/API negative tests unrun |
| Expiry, revocation, public no-store, cleanup | IMPLEMENTED / NOT VERIFIED | Source; Worker/runtime tests unrun |
| Privacy deletion and CRM merge guard | IMPLEMENTED / NOT VERIFIED | Source; DB integration unrun |
| 3208/3209 upgrade preservation | BLOCKED | Local PostgreSQL refused connection |
| Types, lint, crypto, migration history, diff | PASS | Commands in P |
| Browser/staging/deployment | NOT VERIFIED / NOT PERFORMED | No deployment or browser run |
| Complete Phase 03 acceptance | **FAIL** | Critical runtime verification and risks remain |

## V. Phase 04 handoff

Private Wishlist UI continues to use the Phase 02 controller, journal, and account adapter. Sharing endpoints do not change private list membership. Account share-all is a server-side operation and must not be built from one paginated client page. Phase 04 must not assume Phase 03 acceptance until database/API gates pass.

## W. Phase 05 handoff

Build an account-share UI against the account routes above. Generate and persist a 256-bit operation ID and fixed expiry per creation intent, reuse both after an unknown result, and clear the pending intent only after the link is safely shown or stored. Guest creation retains a distinct management token in browser storage; never put it in a URL or analytics. Account owners re-copy via the authenticated `/link` operation; offer `/rotate-link` only with a clear warning that all previous copies stop working. Send the current `expectedVersion`; after an unknown result, use `/link` to recover the current token rather than retrying with a fresh version. Explicit guest claiming needs the ID and guest management token plus shopper session; remove the local guest management record only after claim confirmation. Handle 401/404/409/422/429, active/expired/revoked states, storage failure, empty public collections, and account switching. Keep recipient view links as `/wishlist/shared#<viewToken>` and consume only the hydrated public products. Existing-link recovery for legacy claimed guest shares needs a policy before release.
