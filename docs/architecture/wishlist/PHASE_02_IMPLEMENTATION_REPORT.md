# Wishlist Phase 02 implementation report

Status: **implemented locally; browser and release acceptance pending** — 2026-10-31. No staging/production migration, deployment, or commit occurred. Phase 03 was not started.

## A. Executive summary

Guest storage now persists only product UUID, optional preferred variant UUID, and saved timestamp through independently keyed journal operations. A shared Storefront controller selects guest or server-owned account state, coordinates optimistic intents, revalidates sessions, and merges guest references through an authenticated transactional API with durable receipts. Existing hearts, header counts, Wishlist page, Account sign-in/out, and guest sharing use the shared state. Focused API/database/client tests and a Storefront production build pass. Local browser checks reached the Account and Wishlist screens; the local catalog has no published products and shopper email delivery is disabled, so end-to-end browser heart/merge and mobile verification remain open.

## B. Repository preflight

Branch `main` had tracked and untracked guest Wishlist/share, Phase 01/01B, and unrelated stockout-interest work. All three required prior reports, current source, 3208/3209 migrations, API/auth contracts, and existing tests were inspected. No reset, clean, stash, destructive database operation, commit, or deployment was performed. Existing guest share token storage was left under `maevelle_wishlist_shares_v1`.

## C. State architecture

`wishlist-store.ts` is the single `useSyncExternalStore` source for product-card/PDP hearts, navigation counts, Wishlist page, and Account status. Snapshots expose `mode` (`resolving`, `guest`, `account`, `expired`), `sync` (`idle`, `loading`, `merging`, `pending`, `conflicted`, `error`, `synced`), visible items, pending product IDs, a message, and explicit merge review state. Guest references are browser-owned; account items/version come from PostgreSQL; desired account mutations overlay confirmed state until acknowledged. Account responses are guarded by a local generation counter. A server HMAC of organization/account IDs supplies an opaque `partition` in the session response for client cache and pending-merge separation; it is not an authorization credential. No account Wishlist is stored in localStorage. Pending account commands are kept in partition-bound sessionStorage until acknowledgement; refreshed unknown outcomes load the current server list and require explicit Retry.

## D. Guest persistence

`guest-journal.ts` uses `maevelle_wishlist_op_v2:<operation-id>` keys with schema-specific operation records: `{id,productId,action,preferredVariantId,savedAt,at}`. It migrates valid `maevelle_wishlist_items_v1` rows individually, deduplicates IDs, preserves valid timestamps/preferences, drops presentation fields, and removes the old key only after migration writes succeed. Repeated migration writes use deterministic legacy keys and an old logical clock, so later removes win. Saved items are capped at 100. Obsolete operations compact to one winner per product; old remove markers are pruned conservatively, and 2,000 journal keys is a hard bound. When browser storage fails, the controller keeps bounded references in this tab only, labels them as nonpersistent, and blocks automatic merge because it cannot retain a durable retry record. A visible Retry attempts to persist the in-memory actions; a successful retry then permits merging. Sharing credentials use separate keys and are never cleared by migration or merge.

## E. Cross-tab synchronization

Every operation gets its own localStorage key; simultaneous writes to different products cannot overwrite a shared array. `storage` events reload the journal. Same-product conflicts converge under lexicographic `(at,id)` order; sequential local operations advance the per-product clock by at least one millisecond. Exact physical ordering of simultaneous actions across different tabs is not promised. Compaction removes only observed losing keys and retains the winning operation/tombstone. A frozen merge records each product's winning key and clears only unchanged winners, preserving newer guest actions. Unsupported `navigator.locks` is irrelevant because no lock API is required. Browser storage denial/quota failure is surfaced and prevents a false success.

## F. Authenticated adapter

`account-adapter.ts` calls existing private endpoints with cookie credentials, JSON mutations, no-store requests, typed errors and Retry-After parsing. It loads all keyset pages, detects a version change across pages, and exposes bounded batch saved-state lookup. Catalog grids call one batch hydration trigger after the account data becomes stale; there is no per-card request. 401 clears private state; 403 blocks account access; 409 refreshes a desired-state command once or holds a merge for review; 429 delays retry; network/5xx preserves unconfirmed intent, reloads confirmed state, and requires explicit Retry after an unknown result. Account Wishlist API absence is surfaced and does not pretend persistence succeeded.

## G. Guest-to-account merge

`POST /storefront/v1/wishlist/merges` resolves the verified shopper principal, validates a bounded 100-item request, and invokes `mergeGuestWishlist` in `packages/database/src/wishlist/account.ts`. The transaction locks the owner list, checks an existing receipt before the exact `baseVersion`, fingerprints canonical input with SHA-256, validates current published products and active product-owned variants, deduplicates product IDs, preserves existing items/preferences, fills a missing preference when valid, increments the list version only for changes, and stores the complete result in `wishlist.merge_receipts`. Same ID and payload returns the stored result; same ID with different payload returns 409. Concurrent duplicates serialize on the list row. Receipt results distinguish accepted, already present, rejected product/variant, chosen preferences, version, and replay. Receipt rows are retained; `expires_at` is set to 90 days but no cleanup job was added.

The client freezes the guest winner set and base version, writes a partition-bound pending request before sending it, retries the same ID after unknown outcomes, clears only receipt-confirmed unchanged guest operations, and reloads server state. A version conflict is persisted as a conflict state; focus/reload does not silently rebase it. The user must review the refreshed account list and explicitly choose a new merge. This exact-version policy prevents an automatic stale snapshot from resurrecting an account removal. Rejected guest items remain in browser storage and are marked by winner key to avoid repeated automatic submissions until their guest intent changes.

## H. Authentication transitions

Initial load hides account data while the session endpoint resolves. Successful sign-in invokes controller revalidation and merge; sign-out increments the generation, clears account-confirmed and optimistic state, removes its pending command record, restores only guest-owned references, and signals other tabs. Focus and reconnection revalidate the authoritative session; an auth signal prompts other tabs to revalidate. A different partition clears the prior account snapshot and removes prior pending commands before loading the new one. Delayed responses from an earlier generation are ignored. Session expiry clears private data and blocks further account writes until revalidation/sign-in. Same-account reauthentication can recover pending sessionStorage commands but requires manual review/retry after a server refresh. No private list is copied into guest storage.

## I. Existing UI integration

Existing product-card and PDP hearts still use `useWishlist`, which now reads the shared controller. PDP passes its selected product variant as an optional preference. Header and bottom navigation counts use the active shared snapshot. The Wishlist page uses the same items, public catalog hydration, pending/error/merge feedback, and an explicit review action. Account sign-in and sign-out notify the controller. The existing page structure and product visuals were not redesigned.

## J. Sharing compatibility

The share-management key `maevelle_wishlist_shares_v1` is untouched by guest migration, merge, or sign-out. The sharing panel still manages stored guest capabilities. It receives current catalog titles for guest selection; while viewing an account Wishlist, it receives no account items for new guest shares. Selection is pruned when available guest IDs change. Merge does not claim, revoke, or delete guest shares. Existing guest sharing database test passes.

## K. Database changes

No schema change was necessary. 3209 already has owner-scoped list/items and receipt columns/uniqueness. The merge service uses the existing `(organization_id,wishlist_id,merge_id)` receipt PK and list version. 3208/3209 migration files were not rewritten. Fresh/upgrade compatibility remains covered by the existing disposable account test; the migration-history guard reports 58 registered and 51 immutable baseline migrations. Staging application state for 3208/3209 is **UNVERIFIED**.

## L. Security assessment

The merge target comes only from the shopper resolver, never the body. The API retains Phase 01B Origin, JSON and durable rate-limit hooks for the new merge path, plus no-store responses. Input UUIDs, size and fields are checked at the route, with eligibility/tenant/preference checks in the domain. Receipt replay is scoped to the authenticated owner's list. The opaque client partition avoids exposing account IDs and prevents automatic pending-merge replay under a different account. Confirmed account data is memory-only and cleared on logout/401/403/switch; sessionStorage contains only pending command IDs and intent, bound to that partition and removed on acknowledgement, logout, or account switch. The new Wishlist storage keys contain guest references, pending command references and opaque merge metadata, not passwords, cookies, share-management tokens or the confirmed private list. Existing guest share-management tokens remain in their separate legacy key. A local user controlling their own browser storage can change their guest input; server authorization and catalog rules remain authoritative.

## M. Tests and verification

Passed: `TEST_DATABASE_URL=.../maevelle_test pnpm --filter @maevelle/database exec vitest run src/wishlist/account.test.ts` (4 tests), including populated 3208→3209 upgrade, concurrent identical merge, replay, fingerprint conflict, exact version conflict, cross-tenant/unavailable product and variant rejection, preference precedence and fill. Passed: `TEST_DATABASE_URL=.../maevelle_test pnpm --filter @maevelle/api exec vitest run src/shopper-auth.test.ts` (4 tests), including authenticated merge, Admin-only rejection, bad Origin, replay and conflicts. Passed: three focused Storefront Vitest files (16 tests) for legacy migration, journal convergence/compaction/failure, account transport errors, guest merge flow, account switch race, and manual merge conflict review. Passed: relevant Contracts, Database, API and Storefront TypeScript checks; targeted ESLint after the import fix; migration-history guard; `git diff --check`; `pnpm --filter @maevelle/storefront build`. The first journal test run exposed a same-millisecond ordering bug; the per-product monotonic clock fixed it and the rerun passed.

Local browser: `/wishlist`, `/categories`, and `/account` rendered; registration mode opened. The local catalog had zero published products and local shopper delivery was disabled, so browser heart, real multi-tab, authenticated merge, mobile breakpoint, offline and real email flows were **not verified**. No staging/production browser or performance measurement was performed.

## N. Files changed

New Phase 02 files: `apps/storefront/features/wishlist/{guest-journal.ts,guest-journal.test.ts,account-adapter.ts,account-adapter.test.ts,wishlist-store.test.ts,wishlist-membership-hydrator.tsx}` and this report. Replaced the pre-existing untracked guest `wishlist-store.ts`. Modified pre-existing Wishlist/Phase 01B files: `apps/storefront/features/wishlist/{use-wishlist.ts,types.ts,components/wishlist-page-shell.tsx,components/wishlist-sharing-panel.tsx}`, `apps/storefront/features/account/shopper-account.tsx`, `apps/storefront/features/catalog/components/catalog-browser.tsx`, `apps/storefront/components/product-page-client.tsx`, `apps/storefront/features/pdp/pdp-view.tsx`, `apps/storefront/components/layout/{bottom-nav.tsx,desktop-navbar.tsx}`, `apps/api/src/{app.ts,routes/account-wishlist.ts,routes/shopper-auth.ts,shopper-auth.test.ts}`, `packages/database/src/wishlist/{account.ts,account.test.ts}`, `packages/contracts/src/wishlist.ts`, `docs/architecture/wishlist/PHASE_01B_AUTHENTICATION_AND_ACTIVATION_REPORT.md`, and product-completion focus/state. Earlier guest-share, migration and stockout-interest work remains.

## O. Remaining risks and blockers

**High acceptance gate:** real browser guest heart→login→merge, multiple tabs/devices, mobile layout and email delivery were not exercised in a configured local/staging environment. **High deployment gate:** staging 3208/3209 ledger/schema remains unknown. **Medium:** browser journal provides deterministic convergence but cannot promise physical last-click order for truly simultaneous same-product actions on separate tabs. **Medium:** 2,000-key journal limit deliberately fails closed; a long-lived browser with many distinct removals may require an explicit user cleanup/recovery path. **Medium:** account list loading is paginated and complete but can grow; representative volume and merge latency remain unmeasured. **Medium:** existing `merge_receipts.expires_at` has no cleanup worker; retention/privacy policy must be settled before release. **Low:** local auth-unavailable fallback displays an error banner until email delivery is configured.

## P. Phase 02 acceptance checklist

| Area | Verdict | Evidence / limit |
|---|---|---|
| Legacy guest migration and reference-only persistence | PASS locally | Journal fixtures, no presentation data persisted. |
| Multi-tab additive writes and deterministic convergence | PASS in simulated storage; browser NOT VERIFIED | Independent keys and storage events, focused tests. |
| Browser storage failure handling | PASS in focused test | Failed write switches to bounded, visibly nonpersistent tab memory; automatic merge waits for a successful storage Retry. |
| Account adapter, version/pagination/error handling | PASS locally | Adapter tests, controller tests, API integration; real device NOT VERIFIED. |
| Account switching and stale responses | PASS in controller test | Generation fence; browser multi-tab NOT VERIFIED. |
| Transactional merge, receipt, ownership and exact conflict | PASS locally | Disposable DB and API integration tests. |
| Rejected item and lost-response recovery | PASS in focused tests; browser NOT VERIFIED | Durable receipt, frozen winner logic, and quarantined pending account command after refresh; no real browser retry test. |
| Existing controls, header, PDP preference and sharing | PASS in source/build; visual interaction PARTIAL | Account/Wishlist screens opened; catalog empty locally. |
| Type/lint/build/migration guard/diff | PASS | Commands above. |
| Staging/production readiness | BLOCKED | Migration state, email and browser gates outstanding. |

Overall: **Phase 02 local implementation complete; acceptance pending browser and deployment evidence.** No critical known merge/ownership/data-loss defect remains from the focused checks, but unverified browser paths are not marked passed.

## Q. Phase 03 handoff

Guest schema and operations: `GuestReference`, `GuestOperation` and journal functions in `apps/storefront/features/wishlist/guest-journal.ts`. Active state and account transition APIs: `wishlistStore` in `wishlist-store.ts`; account HTTP in `account-adapter.ts`. Private transport contracts and receipt: `packages/contracts/src/wishlist.ts`; endpoints in `apps/api/src/routes/account-wishlist.ts`; domain in `packages/database/src/wishlist/account.ts`. Shopper principal remains `ShopperPrincipal` in `packages/database/src/shopper.ts`; only its resolver may authorize account shares. Existing guest sharing is `apps/api/src/routes/wishlist.ts`, `packages/database/src/wishlist-sharing.ts`, and `3208_wishlist_sharing.ts`. Browser guest management credentials remain `maevelle_wishlist_shares_v1` and view links use a URL fragment capability. Phase 03 needs account-owned share schema and privacy deletion integration through the existing authorized customer anonymization transaction, without converting guest capability ownership by email or copying private Wishlist data into public shares. Preserve 3208/3209 history; any share-ownership schema change needs a new forward migration. Confirm staging ledger and existing guest-share compatibility before release.
