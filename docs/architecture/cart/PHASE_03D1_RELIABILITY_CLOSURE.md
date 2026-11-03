# Phase 03D.1 guest discovery and combined UI acceptance

**Local acceptance — PARTIAL. Production release — BLOCKED.**

The work started from `fd77ec1d7f91eb1e38061fbc675f90e431354aee` with the Phase 03D changes and the concurrent drawer, coupon and editor changes already in the worktree. Those changes and the [Phase 03D report](PHASE_03D_TARGETED_ACCEPTANCE.md) were preserved. The fixture used a fresh Docker Desktop PostgreSQL 18 container with no host mounts and a random loopback port. Fastify used its own generated database and Chromium used a disposable profile against the combined production Storefront build.

## Guest discovery

The instrumented Chromium run received one 503 across eight guest-discovery responses. The browser returned the Cart error envelope with `UNAVAILABLE` and a request ID. The same ID in Fastify's fixture diagnostics reported PostgreSQL SQLSTATE `40P01`. PostgreSQL's deadlock trace showed Shopper Auth holding the IAM user row and waiting on the customer-account row while a concurrent Wishlist authority check held the account row and waited on the user. A second deadlock trace showed the same lock cycle with another authority request queued. The observed failure originated in PostgreSQL through Fastify. It was distinct from a 429 limit, a proxy-generated response, an empty guest list or a wrong-account denial.

Existing verified mappings now resolve in a single read-only lookup. It checks the tenant, verified active user, active account and active customer in one statement. First-time enrollment still locks the IAM user and rechecks the mapping before inserting. Inactive mappings return denial. Existing Cart and Wishlist command-side ownership checks continue to enforce authority at the mutation boundary. The change adds no automatic retry, no fallback to guest, and no new authorization path.

The real Fastify regression holds the same user and account shared locks as the concurrent Wishlist operation while issuing authenticated guest discovery. Before the change, the request could not finish while those locks were held. After the change, it completes under the locks. The fixture diagnostics retain only route template, request ID, error type and error code. Browser diagnostics retain response status and the safe error code and request ID for 503s.

## Combined UI

- The empty drawer's Continue shopping link and populated drawer navigation remain in the combined build. The Chromium journey checks drawer focus and return focus, quantity, coupon benefit and expiry, variant collision and canonical line identity, and atomic Clear.
- The concurrent coupon input style remains in place. Chromium checks the rendered input is at least 16 CSS px and verifies the coupon against the API. Native iOS keyboard and zoom behavior remain a device check.
- Escape closed the editor and restored focus when a selection control existed. With zero available options, the opening button unmounted and the editor tried to focus an absent select. Focus fell outside the form, so Escape could not reach its handler. The editor now focuses its Close action during loading or when no select is present. Escape returns focus to the row trigger and follows the same saving guard as the Close action.

## Executed checks

- **PASS** for the corrected Chromium account journey. All seven discovery requests returned 200. The journey covered account switching, two guest slots, stale review, native 200% and 400% zoom on 41 lines, lost-response replay after reload, memory-only retry after storage denial and preservation of the unrelated slot.
- **PASS** for the combined guest Chromium journey. The empty drawer action, coupon input, loaded editor Escape and unavailable editor Escape assertions passed. The journey verified server results for collision, coupon expiry, price refresh, stock recovery and atomic Clear. Reflow passed at 320, 390, 768 and 1440 CSS px.
- **PASS** for 206 tests across 18 files on the corrected source, including the held-lock API regression, Shopper Auth, Cart, Wishlist and Orders. The database build, API typecheck, production Storefront build and its TypeScript validation, focused ESLint and whitespace checks passed.
- **PARTIAL** for performance. The sampled Account Bag issued one account GET and zero guest GETs. First guest drawer open added 12,307 decoded JavaScript bytes and zero Cart reads, and took 83 ms including probe polling. Initial PDP JavaScript was 772,010 decoded bytes. The established shopper path now uses one mapping query without enrollment locks. These samples leave representative concurrency, browser and deployed latency open.

The verified local Cart boundary can support Phase 04 integration work. Production release and human and cross-engine acceptance retain separate gates.

## Reproduction

Use the isolated database, synthetic shopper fixture and standalone build procedure in the [Phase 03D report](PHASE_03D_TARGETED_ACCEPTANCE.md). Run the account probe first, before the guest probe changes synthetic pricing, stock and Catalog data.

```sh
pnpm --filter @maevelle/database build
DATABASE_URL="$TEST_DATABASE_URL" node packages/database/dist/src/migrate-cli.js
pnpm exec vitest run apps/api/src/{account-cart,cart-foundation,cart-credential-closure,shopper-auth}.test.ts packages/database/src/{cart-foundation,cart-credential-closure,orders}.test.ts packages/database/src/wishlist/account.test.ts apps/storefront/features/{cart,wishlist,pdp}
pnpm exec tsc -p apps/api/tsconfig.json --noEmit
pnpm exec eslint packages/database/src/shopper.ts apps/api/src/account-cart.test.ts apps/storefront/components/commerce/cart-drawer.tsx apps/storefront/features/cart/components/{cart-summary,cart-variant-editor}.tsx scripts/cart-phase{02b-runtime.ts,02b-browser.mjs,03b-browser.mjs}
CART_FIXTURE_SHOPPERS=1 CART_FIXTURE_LONG_REVIEW=1 CART_FIXTURE_DIAGNOSTICS=1 pnpm exec tsx scripts/cart-phase02b-runtime.ts
STOREFRONT_BASE_URL=http://localhost:3000 STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002 NEXT_TELEMETRY_DISABLED=1 pnpm --filter @maevelle/storefront build
CART_03D_EXTENDED=1 node scripts/cart-phase03b-browser.mjs
CART_02B_FIXTURE_COMMERCE=1 node scripts/cart-phase02b-browser.mjs
```

## Remaining gates

Repeat the [Phase 03D manual procedures](PHASE_03D_TARGETED_ACCEPTANCE.md#remaining-manual-acceptance) on Safari, Firefox and physical phones and tablets with human screen readers. Include the empty drawer link, coupon input with the on-screen keyboard, and closing the unavailable variant editor with Escape. Capture browser and OS version, input method, focus and announcement evidence. Deployed proxy, TLS and roles, persistent migration continuity, restore and revocation, representative load, and unapproved commerce and Checkout policies remain separate release gates.
