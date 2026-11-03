# Phase 03-C integrated Account Cart acceptance

**Local integrated acceptance — PARTIAL. Production release — BLOCKED.**

The work started from clean HEAD `71ef8c267fac1bfd8a1f9fa39dbc3076d8c1c122`. The Phase 03A and 03B contracts, migration history, Orders delivery-pricing fixture and historical evidence were preserved. The isolated environment used PostgreSQL 18.6 in a fresh Docker Desktop container with no host mounts, a random loopback port, a dedicated migrated test database and separately generated Fastify fixture databases. Chromium used disposable profiles and a standalone Storefront build.

## Results

| Gate | Status | Evidence |
| --- | --- | --- |
| Guest and account ownership lifecycle | PASS for tested cases | Chromium signed in after a guest shopping journey, reviewed two independently issued guest slots, postponed transfer, switched accounts, and hid a review after session loss. The second slot retained its ID and revision after the selected slot was revoked. Chrome DevTools placed the second synthetic slot in the primary profile to stage the multi-slot case. |
| Persistence, concurrency and merge | PASS for tested cases | Two independently authenticated Chromium contexts shared one Account Bag. An edit on the second device required fresh review. The merge preserved the account line ID on collision and the transferred ID for a distinct line. PostgreSQL tests exercised concurrent creation, competing merge and edit, different-account competition, revoked credentials, rollback after connection termination, and guest order placement racing against merge. |
| Commerce and blocked plans | PASS for tested cases | Real API and PostgreSQL coverage includes stale guest and account revisions, price and configuration changes, coupon expiry and stock shortfall at unchanged revisions, quantity caps and a 101-line proposal. Guest Chromium regression verified repricing, coupon expiry, stock recovery and atomic Clear. No partial transfer policy was added. |
| Uncertain outcome and replay | PASS for tested cases | Chromium discarded the successful merge response, reloaded, and retried the identical serialized body and UUID. The committed revision stayed unchanged on replay. Fastify and PostgreSQL tests verified expired receipt denial and wrong-account denial. Focused runtime fault injection verified memory-only exact recovery after switching away and back with storage denied. |
| Authorization and privacy | PASS locally for tested boundaries | Verified principal and observed partition checks, exact guest slot proof, context substitution, origin and Fetch Metadata, tenant isolation, CRM relinking denial, private response headers, and guest credential retirement were exercised. Source review traced the journal and cross-tab hints. Independent scanning and deployed proxy, cache and role behavior remain open. |
| Accessibility and device breadth | PARTIAL | Chromium merge review reflow passed at 320, 390, 768 and 1440 CSS px with review focus. An adapted Chrome settings probe passed native 200% and 400% on a populated Account Bag, including initial Cancel focus, Tab to confirmation and Escape return. Safari WebDriver did not complete session creation. Firefox, human assistive technology, physical devices and native zoom on the merge proposal remain open. |
| Performance and resources | PARTIAL | One Account Bag navigation issued one account GET and zero guest GETs. First guest drawer open added 11,729 decoded JavaScript bytes, zero Cart reads and took 86 ms including polling. Initial PDP JavaScript was 771,946 decoded bytes. Stocked direct-domain previews used 20 SQL statements for 2, 20 and 100 combined lines, with medians of 14.44, 16.91 and 19.99 ms. These are isolated synthetic samples. Concurrent latency distributions, deployed load, and sustained browser heap measurements remain open. |

## Defects corrected

- A remote sign-in begin hint could leave sibling Bags hidden indefinitely if the initiating tab closed. The runtime now bounds remote holds to 20 seconds and rechecks the verified session. Remote hints cannot release an active local transition. The timeout carries no sign-out authority and the listener cleanup cancels it.
- Restoring a parked intent after account switching reset the persistence indicator to its default even when storage had been denied. Restore now checks the current partition's journal for the original key. The browser keeps the memory-only recovery warning and can replay the original intent after reauthentication as the same account.

No server-side lookup for missing merge metadata was introduced. Losing both the original tab memory and its journal still leaves the account projection readable after reauthentication, with exact replay requiring the original request. Guest revocation and receipt expiry continue to fence reexecution.

## Executed verification

The focused regression passed **257 tests across 26 files**. The populated upgrade harness passed **14 post-baseline migrations** through 3216. The focused Cart reassessment passed nine tests and excluded the historical fixed-output benchmark. A separate seven-test Account Cart API rerun passed after adding coupon expiry and stock shortfall assertions. The Storefront production build and type validation, API typecheck, targeted ESLint and whitespace check passed. The browser journeys ran on the production build containing the remote-transition fix. The final persistence-warning fix was covered by the focused runtime regression and final production build.

Use an explicitly isolated `TEST_DATABASE_URL` and migrate the dedicated database before running tests. The browser fixture and standalone procedure are in the [Phase 03B report](PHASE_03B_STOREFRONT_IMPLEMENTATION.md). Run the account browser probe before the guest probe mutates synthetic Catalog and pricing.

```sh
DATABASE_URL="$TEST_DATABASE_URL" node packages/database/dist/src/migrate-cli.js
UPGRADE_TEST_ALLOW=1 node packages/database/dist/src/upgrade-test-cli.js
pnpm exec vitest run --reporter=verbose apps/api/src/{account-cart,cart-foundation,cart-credential-closure,shopper-auth,routes/pricing,routes/promotions}.test.ts packages/database/src/{cart-foundation,cart-credential-closure,cart-merge-capacity,customers,wishlist-sharing,catalog-variant-integrity,inventory,orders}.test.ts packages/database/src/wishlist/account.test.ts apps/storefront/features/{cart,wishlist,pdp} apps/storefront/components/commerce/wishlist-button.test.tsx
pnpm exec vitest run packages/database/src/cart-reassessment.test.ts -t 'AR0[1-7]|AR1[45]'
pnpm exec vitest run apps/api/src/account-cart.test.ts
pnpm exec tsc -p apps/api/tsconfig.json --noEmit
pnpm exec eslint apps/api/src/account-cart.test.ts apps/storefront/features/cart/{controller,browser-runtime,browser-runtime.test}.ts scripts/cart-phase03b-browser.mjs
STOREFRONT_BASE_URL=http://localhost:3000 STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002 NEXT_TELEMETRY_DISABLED=1 pnpm --filter @maevelle/storefront build
node scripts/cart-phase03b-browser.mjs
CART_02B_FIXTURE_COMMERCE=1 node scripts/cart-phase02b-browser.mjs
```

## Remaining acceptance and handoff

1. In Safari, Firefox and physical iOS and Android browsers, repeat the guest and account probes using the UI. Exercise the drawer, a long merge proposal, two guest slots and a blocked proposal in portrait and landscape. Verify visible focus, keyboard and touch navigation, role and status announcements with VoiceOver and a desktop screen reader, and native zoom at 200% and 400% on the review page.
2. With the proposal open, interrupt connectivity before dispatch and after server commit. Reauthenticate as the original shopper and then as a different shopper. Test storage denial and clearing on an actual browser, and close the initiating tab while a sibling waits for auth completion. Confirm which recovery metadata survives and compare the account and guest revisions and receipt against the API and database.
3. Keep retention and deletion, partial and over-cap transfer, customer-limited promotions, purchase-time redemption, channel and delivery location, tax and compare-at presentation, advanced stacking and Checkout policy as explicit decision gates.

The next workstream should close the outstanding browser, device and failure-recovery cases, then gather persistent cutover, restore and revocation, deployed TLS/proxy/private caching and role evidence under separately authorized staging work. Account and merge functionality can serve as the Cart boundary for future Checkout design. Checkout, payments and order placement remain separate projects.
