# Phase 03D targeted browser and recovery acceptance

**Local acceptance — PARTIAL. Production release — BLOCKED.**

The starting tree was clean at `fd77ec1d7f91eb1e38061fbc675f90e431354aee`. Tests used a new Docker Desktop PostgreSQL 18 container with no host mounts, a random loopback port, a migrated disposable database and a separate generated Fastify browser fixture. Browser runs used Chrome 156.0.8078.74 with disposable profiles and a standalone production Storefront build. Safari 27.0.1 refused WebDriver session creation because remote automation was disabled. No Firefox executable or physical test devices were available. Chrome's accessibility tree and keyboard probe provide automated evidence. Human assistive-technology acceptance remains open. Separate drawer, coupon-input and variant-editor edits appeared during verification and were preserved. The browser build predates them.

## Acceptance results

| Gate | Status | Evidence |
| --- | --- | --- |
| Long proposal and zoom | PASS in Chromium | A 41-line proposal rendered from real API and PostgreSQL fixture data at native 200% and 400% browser zoom. The 1440 px window yielded 720 and 360 CSS px. With reduced motion emulated, review completion focused the status, the accessibility tree exposed the review heading and pressed Bag button, and two Tab presses reached visible merge confirmation. The account probe also checked short review reflow at 320, 390, 768 and 1440 CSS px. |
| Abandoned and repeated auth hints | PASS for tested cases | A real sibling initiated sign-out, with its network call deliberately held before dispatch. Closing that tab caused the primary tab to recheck its still-valid shopper session and recover the same Account Bag. The focused regression sent a second begin at 15 seconds and checked recovery at the first 20-second deadline. A sibling completion also failed to release an active local transition in a separate test. |
| Storage denial and pre-dispatch interruption | PASS in a live Chromium tab | Denied session-storage writes and rejected the first merge fetch before transmission. The server revision stayed unchanged. Switching to another verified account hid Retry. Reauthenticating the original shopper in the same document restored the memory-only warning. Exact retry sent the original body and UUID and advanced the account revision once. |
| Commit followed by lost response | PASS in Chromium | A separate scenario discarded the real committed response, reloaded and replayed the identical body and key. The revision stayed unchanged on replay, surviving line IDs were correct, and the unrelated guest slot kept its identity and revision. |
| Authoritative commerce and security | PASS for tested boundaries | The PostgreSQL and Fastify regressions covered connection termination during a transaction, stale revisions and commerce, wrong-account replay, expired receipts, CRM relinking, guest revocation and merge versus guest order placement. Guest Chromium exercised variant editing, repricing, coupon expiry, stock reduction, invalid selection removal, drawer focus and atomic Clear. |
| Other engines, devices and human AT | PARTIAL | Safari and Firefox journeys, physical phones and tablets, and human screen-reader testing remain open. Native zoom and reduced-motion emulation were performed in Chromium. |

## Defect closure

The Phase 03-C sibling timeout was restarted on every remote begin. A late duplicate extended the hold despite the first tab having disappeared. The runtime now ignores further remote begins during an existing hold and retains the first deadline. The deadline triggers session verification and carries no sign-out permission. An active local transition remains fenced until its own completion.

The first sequential guest probe inherited the disposable browser's native 400% zoom and reported overflow in its 768 px emulation case. It passed after resetting Chrome to 100%. The extended harness now restores the profile's original zoom so the short guest probe starts from its intended baseline.

Repeat runs received intermittent guest-discovery 503s after account switching. The workspace exposed its retry action, and clicking it in Chromium restored the guest choices. The cause was unconfirmed. The full extended scenario passed on its first execution. The subsequent repeat stopped at discovery and was recovered manually. The ownership assertion now independently checks the other account’s Bag count and absence of the prior account’s retry action.

No further Cart architecture change was justified by the executed cases. Recovery remains partitioned in the shared controller. Storage denial leaves memory-only recovery available in the originating document. Closing that document without a saved journal leaves no exact retry metadata.

## Verification and performance

The focused regression passed **188 tests across 18 files**. The overlapping final Cart rerun passed **56 tests across four files**, including the new local-hold assertion. Nine Cart reassessment tests passed with the historical fixed-output benchmark skipped. The production Storefront build, Storefront typecheck, targeted ESLint and whitespace check passed. Migration history and the Orders delivery-pricing fixture were preserved.

The account browser probe observed one account Cart read and zero guest Cart reads on initial Bag navigation. The stocked preview test used 20 SQL statements at 2, 20 and 100 combined lines, with medians of 14.66, 14.83 and 19.22 ms in one loopback run. The guest probe measured 772,010 decoded JavaScript bytes for the initial PDP, with 11,729 additional bytes and zero Cart reads on first drawer open. The open took 90 ms including probe polling. These samples leave sustained browser heap, degraded-network latency and production capacity open.

Reproduce using the isolated setup from the [Phase 03B report](PHASE_03B_STOREFRONT_IMPLEMENTATION.md). Run the account probe before the guest probe changes synthetic commerce. Use a fresh disposable Chrome profile on CDP port 9228 with a 1440 px window for native zoom.

```sh
DATABASE_URL="$TEST_DATABASE_URL" node packages/database/dist/src/migrate-cli.js
pnpm exec vitest run apps/api/src/{account-cart,cart-foundation,cart-credential-closure,shopper-auth}.test.ts packages/database/src/{cart-foundation,cart-credential-closure,cart-merge-capacity,orders}.test.ts apps/storefront/features/{cart,wishlist,pdp}
pnpm exec vitest run apps/storefront/features/cart
pnpm exec vitest run --reporter=verbose packages/database/src/cart-merge-capacity.test.ts
pnpm exec vitest run packages/database/src/cart-reassessment.test.ts -t 'AR0[1-7]|AR1[45]'
pnpm exec tsc -p apps/storefront/tsconfig.json --noEmit
pnpm exec eslint apps/storefront/features/cart/browser-runtime{,.test}.ts scripts/cart-phase{02b-runtime.ts,03b-browser.mjs}
CART_FIXTURE_SHOPPERS=1 CART_FIXTURE_LONG_REVIEW=1 pnpm exec tsx scripts/cart-phase02b-runtime.ts
STOREFRONT_BASE_URL=http://localhost:3000 STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002 NEXT_TELEMETRY_DISABLED=1 pnpm --filter @maevelle/storefront build
CART_03D_EXTENDED=1 node scripts/cart-phase03b-browser.mjs
CART_02B_FIXTURE_COMMERCE=1 node scripts/cart-phase02b-browser.mjs
```

## Remaining manual acceptance

1. On Safari and Firefox desktop and on physical iPhone, Android phone and tablet, record OS, browser, input mode, orientation and zoom. Start from a product listing, choose a PDP option, add, open the drawer and use Escape or the close action. Verify focus returns to the opening control. Repeat quantity, coupon and variant editing with the on-screen keyboard and while rotating the device.
2. With macOS and iOS VoiceOver and a desktop screen reader, review two guest slots and a long and blocked proposal. Record the spoken heading, selected slot state, quantity equation, availability and blocked reason. Confirm status feedback after preview, visible focus and access to Cancel or Keep bags separate, and that a blocked proposal offers no enabled merge action. Capture the relevant announcement or transcript with private data redacted.
3. Apply real browser network throttling, go offline before dispatch, and separately disconnect after the fixture confirms commit. With storage denied or cleared, switch to a different account, then back to the original. Record warning visibility, which account can retry, the original request identity, committed revision and remaining guest-slot IDs. Test a closed tab separately from an in-memory live tab. Never record credentials or cookie values.
4. Repeat with at least two active tabs on physical devices and a suspended or backgrounded tab. Check that a sibling close releases the hold after resumption, never grants guest authority implicitly, and keeps the original Account Bag when its session is valid.

Prioritize the human and cross-engine acceptance above. Persistent cutover, backup and restore, credential revocation rehearsal, deployed proxy/TLS/private caching and database roles, and representative workload remain separate release gates. Retention, partial transfer, customer-limited promotions, purchase-time redemption, delivery/channel eligibility, compare-at and tax presentation, advanced stacking, and final Checkout pricing require separate policy decisions.
