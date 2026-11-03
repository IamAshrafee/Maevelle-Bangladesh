# Phase 04B Wishlist, recommendations and promotions Storefront integration

**Local acceptance — PARTIAL. Production release — BLOCKED.**

Started on `main` at `c3413e3e60cc5792878eca67426e575a6256943d`. The existing Shopper Auth route edit was preserved. Phase 03D.1's established-account lookup and enrollment lock behavior remain in use.

## Customer journeys and implementation

- **Account Wishlist.** Add to bag and Move to bag appear on eligible rows on the full Wishlist. The compact Wishlist drawer continues to link to the product. The confirmation shows a current saved selection without asking the shopper to choose it again. A product without a preference requires an explicit current selection. An unavailable account preference preserves the saved item and offers the public PDP for current options. Confirmation explains whether the item stays saved or leaves the Wishlist and accepts a whole-unit quantity.
- **Guest Wishlist.** The same confirmation uses ordinary exact Cart Add and leaves the browser-owned saved item in place. An existing guest Bag must match the observed context. Ambiguity, expiry and an unresolved earlier action use existing Bag recovery. Move is offered only on Account Wishlist.
- **Shared Wishlist.** The recipient can follow a clear product action to the public PDP. The share token stays in the shared view. Public PDP configuration and the recipient's independently verified Bag drive Add. The existing recipient Save behavior remains available.
- **Recommendations.** Retained complementary and similar PDP links and canonical PDP selection. A presentation variant in a recommendation carries no Cart authority. The existing optional recommendation section can fail independently of Bag operations.
- **Promotions.** The drawer and full Bag already share the server projection. Retained merchandise pricing, allocations and `commerceReview.coupons` statuses. A selected code can lose its current benefit while the intent revision stays stable and the calculation fingerprint changes.

## Ownership, conflicts and recovery

The shared Cart controller issues the typed Phase 04A account request and serializes it with existing Cart commands. It captures the Wishlist revision and shopper partition when opening the confirmation and rechecks the local saved generation before submission. It binds an established Bag to the observed owner context and Cart revision. Deliberate Add or Move can establish an empty Account Bag through the existing lifecycle. Viewing the Wishlist does not create one.

The existing account-partitioned journal persists the exact action, product, variant, quantity, Wishlist revision, Cart revision, context and key. Uncertain operations retain the original request after navigation and resume from Bag even when the source is gone. An expired transfer stays visible for explicit review and cannot be replayed. Confirmed Move and relevant source conflicts trigger account Wishlist reconciliation through the existing store. A successful replay reads the current Wishlist, including any newer saved generation. The client issues no source deletion. Owner changes invalidate the dialog and pending commands stay with the original account partition.

The one page-level confirmation uses the existing native modal, which contains focus and supports Escape. Cancel restores focus to the initiating action. Completed submissions focus the page's result region, which remains available if Move removes the initiating row. Status copy links to the Bag for exact retry or context review. Touch-sized controls wrap at narrow widths. The chooser loads current configurations on demand through the existing Cart configuration query, verifies the returned product identity and ignores results after close. There is no per-row Cart subscription or polling. A confirmed Move reuses the existing Wishlist session check and list refresh to protect private data during account changes.

## Executed verification

- **PASS** for 229 tests across 23 files in 45.36 seconds on disposable PostgreSQL 18. Included Cart, Wishlist, Shopper Auth, Catalog variant integrity, Pricing, Promotions, Recommendations, Orders and Storefront Cart, Wishlist and PDP. New cases cover account transport, original-partition journal restoration, expiry retention and lost-response replay through the controller. Phase 03D.1's held-lock discovery regression passed.
- **PASS** for the API build, production Storefront build and TypeScript, focused ESLint, architecture and whitespace checks. The synthetic fixture used real Fastify, PostgreSQL and Chrome 156.0.8078.74 against the standalone Storefront through a loopback fault proxy.
- **PASS** for Account Add and Move in Chromium. The account had no Cart after opening the Wishlist. Add kept the saved piece. Move consolidated the same variant to two units. The proxy dropped the committed Move response, and Bag recovered it after navigation with the original key. The three upstream Add, Move and replay responses were 200. A final-build run with the second shopper recreated the saved item before replay and verified that replay preserved it. A subsequent deliberate Move removed the new entry and placed focus on the result region. The two synthetic Add samples took 169 ms and 419 ms from confirmation to detected result, including browser probe polling.
- **PASS** for stale Wishlist protection in Chromium. A second write changed the saved preference while the Move modal was open. The transfer returned the Wishlist conflict, preserved the updated preference and left the Cart revision unchanged. Opening Move again showed the new preference.
- **PASS** for guest, shared and recommended product journeys in Chromium. Guest Add required explicit configuration and kept the saved item. A separate shared recipient navigated to the PDP, added to their own Bag and could no longer reopen the revoked share. A real similar recommendation linked to the configurable PDP, where explicit selection added the exact variant at its current BDT 157 price.
- **PASS** for coupon expiry in Chromium. The selected coupon showed an effective discount before the fixture expired it, then showed “Selected · No current discount” at the same Cart revision with a changed calculation fingerprint.
- **PARTIAL** for accessibility and performance. Escape restored the trigger and the chooser fit at 320, 390 and 820 CSS px. The shared page was exercised at 1440 CSS px before PDP selection on mobile. Human screen readers, native zoom, touch and physical devices remain open. The observed synthetic timings and request shape give no representative workload or production capacity evidence.

The regression run used an explicitly isolated loopback `TEST_DATABASE_URL`, migrated through the existing schema, and the following target set

```sh
pnpm exec vitest run apps/api/src/{account-cart,cart-foundation,cart-credential-closure,shopper-auth}.test.ts packages/database/src/{cart-foundation,cart-credential-closure,orders,catalog-variant-integrity,recommendations,wishlist-sharing,wishlist/account}.test.ts apps/api/src/routes/{pricing,promotions}.test.ts apps/storefront/features/{cart,wishlist,pdp}
```

## Phase 04-C priorities

Extend browser acceptance to competing tabs, multi-Bag guest selection, account switching and session expiry during a transfer, stock or publication loss between confirmation and commit, and long Wishlist pagination after reconciliation. Run reduced-motion, high-zoom, physical touch, Safari, Firefox and human screen-reader checks. Verify the existing release gates separately, including persistent migration and recovery, deployed proxy and roles, privacy and retention, and representative workloads. Guest Move, shared bulk transfer, reverse transfer, Bag ranking and purchase-time promotion decisions retain their separate boundaries.
