# Phase 02B guest shopping bag

**Local acceptance — PARTIAL. Production readiness — BLOCKED.**

## Storefront decisions

| Decision | Surface and behavior |
| --- | --- |
| Keep | One browser controller and API adapter, HttpOnly guest authority, owner fences, revision checks, bounded replay journal, cross-tab signals, atomic Clear and explicit session recovery. |
| Improve | The header opens the same confirmed bag on mobile and desktop. The native drawer provides compact item review, removal, current merchandise total, Escape, and focus restoration. Its module loads on first use. |
| Refactor | The full bag is the editing workspace. Shared line presentation feeds the drawer and page. The page shows current unit prices, line subtotals and net values, selected coupons and current benefits. |
| Improve | Catalog cards route shoppers to the product page to resolve options. PDP starts unresolved for products with axes and uses the shared quantity control. Optionless products can add directly from the PDP. |
| Replace | An inline selection editor loads current public Catalog variants on demand. It previews quantity consolidation and the current public unit price. The server validates pricing, stock and the requested final quantity at save. |
| Retire | Sample drawer contents, simulated shipping and checkout purchase actions were removed from the shopper path. The checkout route and design-system reference show the supported boundary while Checkout integration is pending. |

## Commerce and recovery

- Replacement sends the observed owner context, revision and UUID intent key through the shared PUT adapter. A changed revision asks for review, and a stale editor cannot create another bag. A lost response retains the exact request in the nonsecret replay journal. The response and receipt supply the surviving line and consolidation message.
- Line recovery follows the server commerce review. Stock-limited lines allow reductions. Invalid or unpriced lines remain removable and can offer reselection if public Catalog resolves. Hidden lines without public handles have no product link. Availability remains advisory.
- The UI displays the latest server amounts and separates coupon selection from the current discount. Material price, offer or availability changes can generate a notice on refresh at the same intent revision.
- Uncertain actions block conflicting controls. The drawer links to full bag recovery for exact retry, context selection, expiry recovery and deliberate abandonment. Coupon codes remain memory-only for uncertain replay.

## Acceptance register

| Area | Status |
| --- | --- |
| Required option, PDP Add, header count, drawer and full bag | PASS in isolated Chromium |
| Collision, target identity and lost response | PASS against the real API and PostgreSQL with response loss simulated after commit |
| Quantity and cross-tab reconciliation | PASS for a confirmed quantity increase reflected in a sibling tab |
| Evaluation changes and invalid configuration | PASS in the isolated journey. Price and expired coupon changed at the same intent revision. An invalidated configuration stayed visible and could be removed when public options were unavailable. |
| Responsive and accessibility | PARTIAL. Headless Chromium checked Escape, initial focus, return focus and reflow at 320, 390, 768 and 1440 CSS px. Native zoom, human assistive technology, physical touch hardware and other engines remain open. |
| Performance | PARTIAL. The local resource sample is described below. Field and concurrent-load performance remain open. |
| Release | BLOCKED. Phase 02A policy, persistent continuity and deployed verification gates carry forward. |

## Verification and reproduction

Use the dedicated loopback PostgreSQL 18 fixture server and an isolated `TEST_DATABASE_URL`. The API fixture binds to 127.0.0.1 and creates and drops a random database. Start a fresh Storefront process for each fixture tenant because the public Storefront context is cached. Use a disposable Chromium profile on CDP port 9228.

```sh
pnpm exec tsx scripts/cart-phase02b-runtime.ts
STOREFRONT_BASE_URL=http://localhost:3000 STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002 pnpm --filter @maevelle/storefront build
# Serve the standalone build on loopback with its .next/static assets.
# Set CART_02B_PRODUCT_HANDLE to the fixture's emitted handle.
CART_02B_FIXTURE_COMMERCE=1 node scripts/cart-phase02b-browser.mjs

pnpm exec vitest run apps/api/src/{cart-foundation,cart-credential-closure,shopper-auth}.test.ts packages/database/src/{cart-foundation,cart-reassessment,cart-credential-closure,wishlist-sharing}.test.ts packages/database/src/wishlist/account.test.ts apps/storefront/features/{cart,wishlist,pdp} apps/storefront/components/commerce/wishlist-button.test.tsx
pnpm exec tsc -p apps/storefront/tsconfig.json --noEmit
git diff --check
```

The integrated Vitest run passed 182 tests across 19 files. The focused Storefront rerun passed 79 tests across 11 files. The Storefront production build, Storefront typecheck, focused ESLint and whitespace check passed. The lint command covered changed Storefront files, the new Cart components and both browser harness scripts.

The browser probe passed on Chrome 156.0.8078.74 against the standalone build, real Fastify API and PostgreSQL 18.6. It checked two required-option PDP adds, live count and drawer, Escape and return focus, collision confirmation, exact request replay after a committed response was lost, coupon application and expiry, sibling-tab quantity refresh, price refresh at a stable intent revision, safe removal after Catalog invalidation, and the checkout boundary. The test emulated widths of 320, 390, 768 and 1440 CSS pixels.

One local sample recorded 768,516 decoded JavaScript bytes for the initial PDP and 11,488 additional bytes at first drawer open. Opening the drawer took about 86 ms including probe polling and added zero Cart reads. The sample includes shared scripts and does not establish field latency or a before/after bundle delta.

## Remaining work

Run human keyboard and screen-reader review, native zoom, physical phones and tablets, and non-Chromium engines. Verify recovery journeys across those surfaces with slow or intermittent connectivity. Close the backend policy and persistent cutover gates before release. Begin Checkout integration as a separate project with supported delivery, contact and order workflows.
