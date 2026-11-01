# Wishlist Phase 04 implementation report

Date: 2026-10-31 (Asia/Dhaka). Verdict: **PARTIAL local acceptance**. The private guest and authenticated Storefront Wishlist, reusable hearts, account pagination, responsive presentation, and the main customer journeys are implemented and browser-tested against an isolated realistic fixture. Several failure, accessibility, media, and sharing journeys still need browser acceptance; no staging/production deployment or commit occurred. Phase 05 sharing UI was not implemented.

## A. Executive Summary

The Storefront now exposes one saved-product control across cards and PDP, active-owner counts in navigation, and a dedicated private Wishlist with current public catalog data. Guest sorting is globally correct for the bounded guest journal. Account lists load by keyset cursor in 100-item batches and display the server count. An isolated browser run exercised guest save/refresh/remove/undo, variant preference, product-card/PDP consistency, account sign-in/merge/sign-out/switch, and an account with 108 saved products. A cursor precision defect found during that run was fixed in the database layer and protected by a regression test. The current verdict is partial because the acceptance checklist includes browser and visual cases not yet performed and account sorting intentionally offers only server-wide recent order.

## B. Initial Repository State

Branch `main` began dirty with substantial Phase 00–03B Wishlist/auth/database/API/Worker work and unrelated product-completion/stockout-interest notes. All were preserved; no reset, clean, stash, or commit was used. `docs/product-completion/state.json` and `current-focus.md`, Phase 00–03 reports, current source, Git status, and the Phase 04 assignment were inspected. The Phase 03B report path was found overwritten by a byte-for-byte copy of the Phase 04 assignment; its verification record was reconstructed from the previous turn's evidence in the intended report path. That reconstruction explicitly distinguishes earlier reported results from checks rerun here. The ordinary persistent local PostgreSQL Compose instance remained stopped.

## C. Existing Frontend Audit

The pre-existing guest journal, account adapter/store, account page, recipient page, guest sharing panel, product card, PDP, and navigation primitives provided the foundation. Defects and gaps included an unbounded account adapter helper, ambiguous card navigation caused by nested links/buttons, wishlist hearts missing from recommendation cards, an account list without progressive loading, account failure misclassified as session expiry, misleading stock text on an out-of-stock PDP, and visual/error/undo limitations in the Wishlist page. The first functional page replaced the approved Wishlist presentation, an error identified by the owner after the initial report. The follow-up re-inspected the original mobile/desktop components, `/design-system` specimen, `docs/storefront/design-system.md`, and Storefront tokens, then rebuilt the live presentation around that reference. No new UI dependency or global stylesheet was added.

## D. Final UI Architecture

`wishlist-store.ts` remains the owner-aware client authority. It separates guest journal state from private account state, exposes an authoritative count, owner generation, known/unknown membership, account list version, keyset cursor, and pending IDs. `use-wishlist.ts` is the UI hook for mutations, undo, and feedback. `wishlist-membership-hydrator.tsx` batches account saved-state requests for product grids and PDP without an N-request card waterfall. The page shell hydrates current public catalog product data in at most 100-ID batches and keeps a cache scoped to currently visible IDs. The same hydrated view model feeds the horizontal mobile cards and editorial desktop split. A native modal bottom sheet opened from the bottom navigation presents the mobile view below `lg`; the desktop navigation continues to link to `/wishlist`. Direct mobile visits to `/wishlist` retain a usable route fallback. The design lab now has a separate populated specimen using the original approved sample products without mutating shopper state. Storefront responses for `/wishlist` are dynamic/no-store; private state is not serialized into public HTML.

## E. Reusable Wishlist Heart

`WishlistButton` is one semantic pressed-state button with a stable accessible name, visible saved/unsaved/pending/unknown treatment, and a 44px target. Unknown membership remains disabled until resolved, avoiding a false unsaved state while account data loads. Rapid repeat input is guarded by the pending state. Component render tests verify `aria-pressed`, naming, and unknown-state behavior. The same control is used on cards and PDP.

## F. Product Card Integration

Catalog and recommendation cards use the shared heart and batched membership hydration. The card image and title are independent product links; the heart is a separate button, so saving does not navigate and interactive elements are no longer nested. Browser checks verified a card heart changing saved state in place and title navigation to a PDP that reflected the same saved state. Catalog cards at `/categories` were tested with published fixture products; unpublished/archived fixture products did not appear.

## G. PDP Wishlist Integration

The PDP heart saves product identity and the intentionally selected variant preference. Changing variant while already saved does not silently write a new preference. Single/default-variant products save without a spurious preference label. An out-of-stock PDP now says “Currently out of stock” rather than “In Stock & Ready to Ship.” The browser verified a multivariant Pearl Hair Clip save, selection change without an unintended save, intentional re-save with the selected option, and an out-of-stock Mulberry Silk Scarf. An unavailable preferred variant is represented with a review-on-PDP warning; its visual browser case remains unverified.

## H. Header and Mobile Navigation

Desktop and bottom navigation read the shared owner-aware count and bound its display to `99+`. The bottom navigation remains available through tablet widths and opens a sliding modal Wishlist drawer; desktop keeps page navigation. During ownership resolution, unknown count is not announced as zero. Sign-out and account switches clear prior private state. Browser checks observed the header badge following guest saves and the account switching from a populated A list to an empty B list. A separate multi-tab live-convergence browser journey remains unverified.

## I. Dedicated Wishlist Page

The live desktop page restores the approved breadcrumb, editorial title, horizontal item cards, and sticky two-column summary. The mobile/tablet drawer uses the same data in a compact touch layout with a serif header and slide-up transition. Both surfaces have loading, empty, error/retry, product-unavailable, current price, current stock, preferred-option, remove/undo, and guest sharing sections. Current product data comes from the public Wishlist products endpoint; unpublished or archived product references render a neutral unavailable state without exposing restricted product details. The account count is server-authoritative. Dynamic rendering and a `Cache-Control: no-store` response were checked. The live fixture has no media assets, so live image fallback was visible; the design lab separately displays the original approved sample artwork. Real catalog media layout remains an acceptance task.

## J. Sorting and Pagination

Guest lists are bounded by the journal and support recent, oldest, price low-to-high, and price high-to-low using the fully hydrated current public catalog. The browser verified low-to-high order for two differently priced products. Account lists expose only the server-wide recent order; oldest/price controls are omitted because sorting one loaded page would misrepresent the whole list. The task brief explicitly permits omission of a sort that cannot be supported correctly, while the acceptance checklist still lists global account sorting as an open criterion.

Account pagination uses the existing 100-item keyset API. Browser evidence: first 100 of 108, then Load More displayed all 108 with no missing or duplicate cards and the button disappeared. The server cursor now preserves PostgreSQL microseconds; the former millisecond round-trip skipped five equal-timestamp records. `loadMore()` compares list version, reloads the newest page on concurrent version change, and retains at most 300 loaded account records to limit client memory. If more than 300 have been traversed, reloading returns to the newest window. Guest-only category pills use current public category names across the bounded guest list. Account filtering remains absent because the loaded page would not represent the full account list.

## K. Removal and Undo

Remove disables the item while the mutation is pending and offers a visible Undo. Guest remove/undo and account remove/undo were exercised in the browser. Undo checks current public product eligibility and the owner generation before saving, preventing a removed item from being reinserted after account switching. A fallback title is used when product hydration is temporarily absent. No bulk removal control was added.

## L. Guest and Account UX

The guest operation journal preserves reference-only saves across refreshes, with a tab-only fallback and warning if browser storage rejects writes. Storage recovery is implemented and component-tested, not browser-tested. Account sign-in merges guest items through the existing durable merge path; the browser verified three guest items arriving in synthetic account A and persisting after reload. Sign-out cleared A's private list from view, and synthetic account B had an empty list. Temporary account-list outages now remain retryable rather than rendering a false expired-session state; focused store tests cover this. Version-conflicted merge review and unknown-result retry paths have store tests but no completed browser journey. Session expiry and browser back/forward privacy still need dedicated browser acceptance.

## M. Sharing Compatibility

The existing guest selection and link-management panel remains on the guest Wishlist. It continues to use `maevelle_wishlist_shares_v1` for local guest credentials and `maevelle_wishlist_share_create_v1` for pending creation replay. Its fixed snapshot semantics are unchanged. Account sharing is deliberately absent from this Phase 04 UI; no fake account sharing button appears. The recipient page and sharing API were not broadened in this assignment. The guest panel's end-to-end browser flow was not exercised here and remains a Phase 05 acceptance case.

## N. Accessibility

The shared heart uses a stable label and `aria-pressed`; loading/error messages use status or alert roles, Undo feedback uses a polite live region, and page actions are native buttons/links with keyboard behavior. Primary heart and page controls target roughly 44px touch size. Reduced-motion styling exists for loading animation. Browser inspection covered accessibility-tree names and control state, but a complete keyboard tab-order, screen-reader, zoom, automated contrast, and reduced-motion visual audit was not performed. These remain acceptance gates.

## O. Responsive Design

The initial generic grid was inspected at 320, 375, 430, 768, 1024, and 1440 CSS px and then replaced after owner feedback. The corrected layout was visually inspected in the browser at 390 px as an empty and populated modal drawer, at 768 px as a tablet drawer, and at 1280 px as the full editorial page. Phone and desktop screenshots rendered clearly; the tablet capture clipped its right half in the in-app capture surface, while DOM scroll width equaled client width. Escape closed the drawer and returned focus to its navigation trigger. The populated `/design-system` specimen was inspected with the original sample images loaded. Landscape rotation, on-screen keyboard, real catalog media, and 200% zoom were not tested.

## P. Performance

Product-card membership is batched, account list payloads are bounded at 100, visible catalog hydration is batched at 100, and the client retains no more than 300 account rows. The navigation count comes from one shared store. Public catalog server rendering remains intact. Browser checks confirmed the progressive 100+8 account flow; no representative-volume latency, memory profile, image optimization measurement, or network waterfall trace was recorded. The 108-card fixture is functional evidence, not a performance benchmark. The design correction was reviewed with a separate disposable PostgreSQL 18 visual fixture; the local preview at `http://localhost:3000` was left running for owner review. It is not staging or production.

## Q. Security and Privacy

Account identity comes from the existing verified shopper session and server-scoped partition. The client clears private list state on sign-out/account change, guards stale async responses with generation checks, and blocks stale Undo across owners. Account API requests are credentialed/no-store. `/wishlist` is dynamic/no-store; `noindex` and no-referrer metadata are set. Public product hydration returns only eligible catalog data. Browser A/B switching showed no A items in B's list. CSRF/origin and sharing capability rules remain owned by the backend; Phase 03B security gaps and staging proxy checks remain open.

## R. Tests and Browser Verification

Exact checks run in this Phase 04 turn:

- `pnpm exec vitest run apps/storefront/features/wishlist apps/storefront/components/commerce/wishlist-button.test.tsx` — **4 files, 20 tests passed**.
- `TEST_DATABASE_URL=<isolated maevelle_test URL> pnpm exec vitest run packages/database/src/wishlist/account.test.ts -t 'pages every item when saved timestamps share microseconds'` — **1 passed, 17 skipped by filter**.
- `pnpm --filter @maevelle/database build` — passed.
- `pnpm --filter @maevelle/api build` — passed.
- `pnpm --filter @maevelle/storefront build` — passed, including TypeScript; `/wishlist` is dynamic.
- `pnpm exec eslint apps/storefront/features/wishlist apps/storefront/components/commerce/wishlist-button.tsx apps/storefront/components/commerce/wishlist-button.test.tsx packages/database/src/wishlist/account.ts packages/database/src/wishlist/account.test.ts scripts/wishlist-phase04-large-fixture.ts scripts/wishlist-phase04-local-api.ts scripts/wishlist-phase04-local-fixture.ts vitest.config.ts` — passed after removing an unused import.
- `node scripts/check-migration-history.mjs` — passed, 60 registered migrations, 51 immutable baseline.
- `git diff --check` — passed.

The design correction additionally passed Storefront and API builds, focused ESLint, 20/20 Wishlist/component tests, and `git diff --check`. Browser checks used a disposable PostgreSQL 18 database on loopback port 55440, a guarded local API with a mailbox limited to synthetic `@example.test` recipients, and Storefront on localhost:3000. Fixture products included available, out-of-stock, multivariant, long-name, unpublished, and archived examples. Observed journeys: guest save/remove/undo/refresh, variant preference, sort, card/PDP consistency, out-of-stock display, account sign-in/merge/reload/remove/undo/sign-out/A-to-B isolation, empty B page, and 100+8 pagination. Media, full desktop screenshot, multi-tab convergence, service outage, storage denial, session expiry, merge conflict, keyboard-only, and guest link creation were not completed in the browser. No production credentials or persistent data were used.

## S. Defects Discovered and Fixed

1. **High: skipped account pages.** `packages/database/src/wishlist/account.ts` encoded `saved_at` through JavaScript `Date.toISOString()`, discarding PostgreSQL microseconds. In a 108-item fixture, the second page ended at 103. The cursor now carries an exact six-digit UTC timestamp while accepting legacy three-digit cursors. The focused database regression uses three equal microsecond timestamps and passes; the browser now shows 108/108.
2. **Medium: false PDP stock message.** `apps/storefront/features/pdp/pdp-commercial-header.tsx` used unconditional in-stock copy. It now reflects current availability; browser verified the out-of-stock scarf message.
3. **Medium: card interaction nesting.** `apps/storefront/components/commerce/product-card.tsx` nested a button inside a product link. Independent links and the heart now support correct navigation and semantics; browser verified save in place and title navigation.
4. **Medium: account outage mistaken for expiry.** `wishlist-store.ts` now leaves transient list failures in retryable unavailable state; a store regression passes.
5. **High: approved Wishlist design ignored in initial Phase 04 UI.** The functional grid bypassed the original mobile and desktop specimens. The correction reused their visual structure, restored the populated lab specimen, and connected bottom navigation to a focus-managed modal drawer. Browser checks covered phone, tablet, desktop, Escape dismissal, and focus return.
6. **Low: pre-existing report path corruption.** The Phase 03B report was a copy of the Phase 04 brief. Its prior evidence was reconstructed in the report path, with uncertainty disclosed.

## T. Files Created or Modified

Phase 04 Storefront changes: `apps/storefront/features/wishlist/{account-adapter.ts,wishlist-store.ts,use-wishlist.ts,wishlist-membership-hydrator.tsx,wishlist-store.test.ts,components/wishlist-page-shell.tsx}`, `apps/storefront/components/commerce/{wishlist-button.tsx,wishlist-button.test.tsx,product-card.tsx}`, `apps/storefront/components/ui/{icons.tsx,bottom-sheet.tsx}`, `apps/storefront/components/layout/{bottom-nav.tsx,mobile-footer.tsx,desktop-navbar.tsx}`, `apps/storefront/components/product-page-client.tsx, apps/storefront/features/pdp/{pdp-view.tsx,pdp-gallery.tsx,pdp-commercial-header.tsx,recommendation-section.tsx}`, and `apps/storefront/app/{wishlist/page.tsx,design-system/page.tsx}`. The corrected presentation also created or rewrote `apps/storefront/features/wishlist/components/{wishlist-desktop-view.tsx,wishlist-mobile-view.tsx,wishlist-item-card.tsx,wishlist-controls.tsx,wishlist-view-model.ts,wishlist-drawer.tsx,wishlist-design-specimen.tsx,wishlist-design-fixtures.ts}`. The public product hydration endpoint in `apps/api/src/routes/wishlist.ts` now includes the actual primary category name. Backend pagination fix/test: `packages/database/src/wishlist/{account.ts,account.test.ts}`. Test inclusion: `vitest.config.ts`. Disposable guarded browser fixtures: `scripts/wishlist-phase04-{local-api,local-fixture,large-fixture}.ts`. Documentation: this report, the restored Phase 03B report, and product-completion state/focus. Other dirty Phase 00–03B files were preserved, not attributed to Phase 04. Cart and Checkout were untouched.

## U. Remaining Risks and Blockers

- **High:** Phase 04 cannot receive full local visual/functional acceptance without real catalog media, full keyboard/screen-reader/zoom/motion, session-expiry, outage, storage-denial, and merge-conflict browser journeys.
- **Medium:** Account Wishlist offers recent order only. Server-wide oldest/price sorting requires a validated database query and cursor contract; page-only sorting must stay absent.
- **Medium:** 300-row client window is bounded but earlier rows require reload after traversing beyond it; confirm desired navigation for very large lists.
- **Medium:** Guest sharing UI exists but its full browser and accessibility acceptance is Phase 05 work.
- **High release gate:** Phase 03B staging origin/proxy, key custody/rotation, and representative-volume checks remain open. No staging migration or deployment was run.

## V. Phase 04 Acceptance Checklist

| Requirement group | Status | Evidence / open item |
|---|---|---|
| Card/PDP hearts, shared state, pending semantics | PASS locally | Browser journeys and component/store tests; rapid-click browser case not isolated |
| Product identity and intentional variant preference | PASS locally | Multivariant PDP browser journey; unavailable-variant visual case open |
| Desktop/mobile access, active-owner count, switch isolation | PASS locally | Browser A/B switch and badge; multi-tab case open |
| Guest/account page, current data, stock, empty/loading/error | PARTIAL | Main browser journeys passed; restricted/unavailable and outage browser cases open |
| Global sorting | PARTIAL | Guest four options correct; account recent only; account price/oldest absent |
| Bounded accurate pagination | PASS locally | 100+8 browser result and microsecond cursor regression |
| Remove/Undo | PASS locally | Guest and account browser journeys; stale-owner guard in code |
| Guest storage and account merge/recovery | PARTIAL | Normal merge browser passed; storage failure, conflict, expiry browser cases open |
| Sharing compatibility, Cart/Checkout isolation | PASS by source review | Guest panel retained; Cart/Checkout untouched; share browser journey open |
| Accessibility/responsive visual acceptance | PARTIAL | Corrected phone drawer, tablet drawer, desktop split and lab specimen visually inspected; full accessibility audit and real-media capture open |
| Builds, focused tests, lint, guard, diff | PASS | Exact commands in R |
| Realistic fixture/report/no deployment | PASS | Disposable fixture; this report; no deploy |

## W. Phase 05 Handoff

The complete sharing frontend can build on the guest-only entry point in `wishlist-sharing-panel.tsx`, the mobile/tablet `BottomSheet`, desktop page, and existing recipient route. Introduce account selection and management as owner-scoped UI, with accessible responsive dialog/sheet flows. Account Share All must call the backend `all` mode against the complete eligible account Wishlist, never the currently loaded 100-row page. Keep fixed-membership snapshots, current public product hydration, and a clear distinction between guest browser credentials and account-owned links. The detailed integration contract follows.

## X. Phase 07 Release Gates

Before staging/release acceptance: verify persistent migration ledger and backup/forward-repair plan; deploy only compatible services with immutable SHA/digests and controlled migrations; validate HTTPS origin, auth trust/cookies/callbacks, `/admin` routing, private cache headers, account A/B isolation, legacy guest links, sharing recovery, proxy-aware rate limits, Worker cleanup, image/media behavior, and responsive/keyboard/screen-reader journeys with realistic data. Measure representative 100+ account pagination, product-grid membership batching, sharing open latency, and cleanup backlog. Record deployment and owner visual/operational review. No such deployment/release gate was run in Phase 04.

### Detailed Phase 05 sharing integration contract

- **Entry/selection:** Guest panel currently selects from the bounded guest list and stores credentials locally. Add account selected-product UI with selection that survives page loading; selection IDs must be checked by the backend against the account. Distinguish selected scope from backend Share All. Do not label “select visible” as all saved products.
- **Owner/session:** `wishlist-store.ts` exposes `mode`, `ownerGeneration`, `count`, `nextCursor`, and list version. Clear selection, pending account operations, and private share history when generation changes or sign-out occurs. Never show A's links or selected IDs to B. Guest links remain browser-owned even when signed in unless explicitly claimed.
- **Create/replay:** Guest `POST /storefront/v1/wishlist/shares` accepts 1–100 public product IDs/items, 256-bit `operationId`, and `expiresAt`; it returns view and management capabilities. Account `POST /storefront/v1/wishlist/account-shares` uses a verified session and supports `all` or owned `selected` items. Persist the pending operation before sending, replay the same operation/payload after uncertain outcomes within its 48-hour receipt window, and handle fingerprint conflicts. Account Share All must use server authority and reject an over-100 eligible collection clearly rather than silently truncate it.
- **Guest capabilities:** `maevelle_wishlist_shares_v1` holds guest link records and private management credentials; `maevelle_wishlist_share_create_v1` holds a pending creation. Do not put a management token in a share URL, analytics, log, or ordinary page state. On storage failure, do not claim a guest link is safely manageable; follow the existing revoke/retry path.
- **Account management API:** `GET /storefront/v1/wishlist/account-shares?limit=&cursor=` for history; `GET /:id` detail; `POST /:id/link` recovers the active view token; `POST /:id/rotate-link` requires `expectedVersion` and invalidates the old URL; `PATCH /:id` changes desired expiry; `DELETE /:id` revokes idempotently; `POST /:id/claim` accepts a guest management capability under a verified shopper session. Use the route prefix `/storefront/v1/wishlist/account-shares`. Paginate history, expose active/expired/revoked states, and recover lost-response mutations safely.
- **Claim and legacy:** Claim must be explicit, never automatic on sign-in. Claimed legacy 3208 guest shares have no encrypted view token, so recovering an old link can require explicit rotation. Warn that rotation breaks previously copied/forwarded links; offer copy of the new link after success.
- **Recipient:** `/wishlist/shared#<view-token>` uses fragment transport, `noindex` and no-referrer metadata, and `POST /storefront/v1/wishlist/shares/open` to receive only currently public product details plus an unavailable count. Keep token out of server rendering, URLs sent to API logs, and analytics. Treat an empty eligible snapshot, expiry, and revocation as distinct accessible outcomes without exposing restricted IDs.
- **Responsive/accessibility:** Use a full-screen sheet/dialog on narrow devices for creation and management; keep focus return, keyboard operation, explicit selection count, pending/error/Retry-After status, copied-link feedback, and visible revoke/rotation consequences. Test account/guest ownership, link creation/replay, selected/all behavior beyond 100 saved items, management, claim, recipient, and storage/network failure in the browser.
- **Backend limits:** Maximum 100 items per snapshot and 50 active account shares; 1–90 day expiry; 48-hour creation receipt recovery. Phase 03B still lacks complete key-ring rotation, staging proxy verification, representative performance, and full catalog edge coverage.
