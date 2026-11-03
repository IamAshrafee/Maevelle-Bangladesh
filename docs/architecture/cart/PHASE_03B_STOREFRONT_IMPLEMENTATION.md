# Phase 03B authenticated Shopping Bag

**Local integrated acceptance — PARTIAL. Production release — BLOCKED.**

The work started from clean HEAD `536a00c5dce5b66eafcd2b958148df895e8888a8`. The [Phase 03A backend contract](PHASE_03A_ACCOUNT_CART_IMPLEMENTATION.md) remains the authority for commerce and merge rules.

## Storefront decisions

| Decision | Behavior |
| --- | --- |
| Keep the shared Cart controller | Header count, lazy drawer, PDP Add, full Bag, quantity, selection changes, coupons and Clear use the same command queue and server projection. Guest cookie establishment still requires the cookie round trip. |
| Separate ownership and transport | The browser resolves the verified shopper partition before choosing a transport. An account request uses the account namespace and carries the observed `X-Shopper-Partition`. Fastify verifies it against the authenticated principal before account reads, creation, commands or merge. It is a precondition. Cookies and the verified shopper mapping still establish authority. |
| Establish on deliberate action | A returning account reads its existing Bag. An account with no Cart has an empty Bag state. Adding an item or choosing a guest Bag to review can establish the account Cart. Session loss and mapping outages get distinct recovery states. |
| Review on a dedicated route | `/cart/merge` discovers eligible slots when the shopper chooses to review. No global guest discovery or preview traffic. Each slot is selected independently. A long proposal has room to show the combined quantities, current amounts, redacted issues and coupon treatment. The shopper can leave and keep the Bags separate. |
| Keep recovery under the original owner | The existing epoch and revision fences cover merge and account commands. Session storage keeps bounded, validated metadata per account partition. Coupon text, credentials and private projections stay out of storage and broadcast messages. In-memory pending intents survive owner transitions within the tab. Reauthenticating a different account cannot recover the earlier account's intent. |

A successful explicit sign-out can restore access to still-valid guest Bags. Loss of account authority hides private content and asks the shopper to sign in again. The session endpoint distinguishes absent authentication, an invalid existing session and a failed verified mapping. A prior-account marker in session storage prevents silent guest fallback even if the account cookie disappears. Account switches, visibility changes and auth signals invalidate old responses. Server validation still applies if a cookie changes between verification and the next Cart request.

## Merge behavior and recovery

The review shows the server's proposal and preserves the current all-or-nothing limits. Collisions show the quantities from each Bag and the resulting quantity. Unavailable or changed selections remain visible for review under the technical caps. Account coupons stay selected and guest coupon codes remain candidates for explicit entry. An empty guest Bag and over-limit combinations block confirmation. The shopper can return to adjust their account selections or sign out deliberately to review the original guest Bag.

If an earlier guest action is unresolved in this tab, confirmation waits for that action to be recovered or explicitly reviewed. The commit submits the reviewed owner contexts, revision and fingerprint. Stale versions or changed commerce require another preview and a new confirmation. Account reads on focus and Bag navigation, and same-browser revision hints, reconcile other devices. The account path has no background Cart polling.

An uncertain merge is journaled before sending. Retry uses the original account partition, request body and UUID. The response can be recovered after guest revocation. Success uses the server's current projection, including the surviving line IDs. The frontend forgets only a matching selected guest context. Browser storage denial limits recovery to the active tab. Exact retry on a different device requires the original request metadata, which this UI keeps in the originating tab.

## Verification

Fresh tests used PostgreSQL 18.6 in a disposable container with a random loopback port and no host mounts. The dedicated test database migrated through 3216. The browser fixture used a separately generated database, two verified synthetic shoppers and a standalone Storefront production build.

| Gate | Status | Observed evidence |
| --- | --- | --- |
| Authenticated Bag and explicit review | PASS | Chromium verified account Add from the PDP, returning access after guest sign-in, keeping Bags separate, collision review, an empty account established by deliberate review, and account switching. |
| Cross-device and uncertain merge | PASS | Two independent browser contexts used the same verified account. A competing device edit forced renewed review. A successful server response was deliberately lost. Reload recovered the same serialized body and UUID. The server returned the same merge without another revision. The target account line and distinct transferred line retained their IDs. |
| Account privacy | PASS for tested cases | Browser session loss hid review without guest fallback. Runtime tests rejected late previous-owner projections. API tests refused another shopper's observed partition even with a valid session. |
| Guest compatibility | PASS | Chromium replayed the guest commerce journey, including variant collision, coupon expiry, repricing, stock recovery, invalid-line removal and atomic Clear. Existing backend and UI regressions passed. |
| Accessibility and performance | PARTIAL | Chromium checked review focus and reflow at 320, 390, 768 and 1440 CSS px. Human AT, physical touch, native zoom, other engines, throttled-network breadth and deployed performance remain open. |
| Production release | BLOCKED | Persistent migration and restore, deployed proxy and database roles, business policy and representative workload evidence remain open. |

The focused API, PostgreSQL and Storefront regression passed **183 tests across 19 files**. After the final review visibility changes, the overlapping Cart suite passed **53 tests across four files**. The Storefront production build, API and Storefront typechecks, targeted ESLint and whitespace check passed. Migration history and the Orders pricing fixture were unchanged.

One authenticated Bag navigation issued one account Cart GET and zero guest Cart GETs before any explicit test read. The local guest probe measured 771,825 decoded JavaScript bytes on the initial PDP and 11,729 additional bytes on the first drawer open, with zero added Cart reads. The drawer opened in 84 ms including probe polling. These are single loopback samples. Merge review code is loaded on its dedicated route.

The browser probe exposed a replay serialization issue. The journal restored merge fields in a different order from the initial UI object. Backend canonicalization accepted the equivalent payload, but the transport now sends the same JSON bytes on the first request and the retry. The browser probe also distinguishes a settled Bag navigation from an intermediate client route transition.

Reproduce with a verified disposable `TEST_DATABASE_URL`. Run the fixture with `CART_FIXTURE_SHOPPERS=1`, start the standalone Storefront after the fixture is ready, and use a fresh standalone fetch cache for each synthetic tenant. Set `CART_02B_PRODUCT_HANDLE` to the emitted handle and use disposable Chrome CDP on port 9228.

```sh
pnpm --filter @maevelle/database build
DATABASE_URL="$TEST_DATABASE_URL" node packages/database/dist/src/migrate-cli.js
pnpm exec vitest run apps/api/src/{account-cart,cart-foundation,cart-credential-closure,shopper-auth}.test.ts packages/database/src/{cart-foundation,cart-credential-closure,wishlist-sharing}.test.ts packages/database/src/wishlist/account.test.ts apps/storefront/features/{cart,wishlist,pdp} apps/storefront/components/commerce/wishlist-button.test.tsx
pnpm exec vitest run apps/storefront/features/cart
pnpm exec tsc -p apps/api/tsconfig.json --noEmit
pnpm exec tsc -p apps/storefront/tsconfig.json --noEmit
CART_FIXTURE_SHOPPERS=1 pnpm exec tsx scripts/cart-phase02b-runtime.ts
STOREFRONT_BASE_URL=http://localhost:3000 STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002 NEXT_TELEMETRY_DISABLED=1 pnpm --filter @maevelle/storefront build
node scripts/cart-phase03b-browser.mjs
CART_02B_FIXTURE_COMMERCE=1 node scripts/cart-phase02b-browser.mjs
```

## Manual acceptance and Phase 03-C priorities

1. Repeat sign-in, review, cancel and confirm on physical iPhone, iPad and Android devices in portrait and landscape, plus Safari and Firefox desktop. With VoiceOver and a desktop screen reader, check headings, selected Bag buttons, quantity equations, issue announcements, focus after preview and the retry and sign-in links. Test native 200% and 400% zoom with a long proposal.
2. Create multiple guest slots and retain an unresolved guest edit. Sign in, confirm the account Bag is available independently, and verify that merge waits for guest recovery. Recover that action in the original guest context, then merge one slot. Confirm the other slot still works after deliberate sign-out.
3. With a verified test account, exercise account mutation timeouts before send and after commit. Retry the exact intent after reload, after the same account reauthenticates and after switching to a different account. Repeat with browser storage blocked and with stale revisions from another device.
4. Verify a blocked cap, an invalid configuration and a disappearing coupon in real browsers. Change stock or price during review and verify that a new confirmation is required. Exercise simultaneous confirmation in two tabs and compare the final projection, receipt and outbox.
5. Verify deployed HTTPS, cookie and proxy behavior, migration continuity, restore and revocation, database roles and representative workload separately. Retention, partial transfer, customer-limited promotion benefits, destination eligibility, tax and final Checkout policies remain open.

Checkout, payments and stock reservation remain outside this implementation.
