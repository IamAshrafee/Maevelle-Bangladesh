# Storefront Cart UX architecture

> Frontend implementation notice (2026-11-03): [Phase01B-R](PHASE_01BR_IMPLEMENTATION_REPORT.md)
> and its [state/recovery contract](PHASE_01BR_STATE_AND_RECOVERY_CONTRACT.md) supersede
> unsupported-Clear/reset frontend assumptions. One controller now integrates
> the unchanged01A-R atomic Clear and cookie-forgetting API. Full account/merge,
> Checkout and complete AT/device/release acceptance are not claimed.


Planning specification; no UI implementation or visual acceptance performed. Follow `apps/storefront/AGENTS.md`, `docs/storefront/design-system.md` and `styles/theme.css`: warm premium light theme, Plus Jakarta functional text, Playfair editorial headings, Noto Sans Bengali with lang=bn, existing semantic tokens and Money/Price. Admin teal/Inter tokens do not replace Storefront identity. Audit E29–E34/E51/E55 identify reusable components and conflicts.

## Page anatomy and component ownership

```text
Storefront layout (Server Component, public navigation data only)
  HeaderClientShell
    CartSummarySubscriber (single shared controller subscription)
    DesktopNavbar / MobileNavbar (same count and state)
    CartDrawer (lazy load on intent/open; authoritative projection)
  ProductCard -> ProductVariantPicker -> cart.add
  PDP -> shared variant selector + QuantityStepper -> cart.add
  /cart thin route
    CartPageShell -> CartStatus -> CartLineList -> CartLine
      Media thumbnail, title/options, Price, QuantityStepper, remove, Wishlist transfer
    CartSummary -> CouponForm -> MerchandiseSummary -> ContinueShopping
    CartRecommendations (independent deferred request)
  Shopper account navigation -> /cart (same state, no account-specific duplicate)
```

Controller lives in `features/cart`, transport through existing client HTTP helper, DTOs from contracts. Hooks select summary or lines; avoid duplicate navbar fetching. Search and extend existing Button/IconButton, QuantityStepper, Price/Money, ProductCard, PDP variant selector, Wishlist controls and modal behavior before introducing new components. Refit authoritative shared CartDrawer; explicitly relocate sample data to design lab only. Compose a reusable CartLine presentation for page/drawer variants; shared mutations/validation with different density. Do not copy full Wishlist store; use focused queue/owner/snapshot hooks with narrow responsibilities.

## Placement and interaction

| Surface | Anatomy and primary flow | Feedback / recovery |
| --- | --- | --- |
| Global header | Existing desktop utility + mobile navigation bag icon opens drawer; direct /cart link as fallback | Count = sum requested units, not distinct lines; announced label includes units; loading placeholder is not 0; cap badge visually at 99+ with exact accessible count |
| Product cards | Existing heart remains independent; single explicit known eligible variant may Add; otherwise Choose options opens shared picker | Never choose minimum-price variant implicitly; per-card pending, safe inline retry; no hover-only action |
| PDP | Variant axes, selected SKU/availability, whole-unit stepper, Add to Bag; existing Wishlist and recommendations nearby | Preserve choice/input on rejection; show exact stock/price changes; pending prevents accidental double activation; confirm once with View Bag link |
| Drawer | Modal heading/count/close, independently scrollable line list, image/options/price/stepper/remove, warning region, sticky subtotal and View Bag | No sample products/shipping threshold or local total calculation; recommendations optional below primary content; Continue Shopping closes drawer |
| Full /cart | Heading + item count, notices, complete lines, variant edit, quantity/remove/undo/move, coupon form, merchandise subtotal, continue shopping, recommendation module | Errors remain distinct from empty, unavailable lines editable/removable, explicit partial/price review; no false shipping/tax promise |
| Account | Navigation entry Shopping bag linking /cart | Same authoritative account Cart as header/PDP, no second provider or duplicate page |
| Shared Wishlist recipient | Per-product Add/Choose options; Add selected to Bag with review sheet; pagination selection retained by product IDs | Resolve live explicit variants, bounded batch, added/rejected counts, retry rejected only; keep sender identity private; Save to Wishlist stays separate |

Drawer opening never creates Cart, reserves stock or emits new adds. Successful add may show confirmation with optional View Bag; do not force-open large overlay after every addition. Full page includes a clear warning that items are not held and totals are merchandise only. Checkout entry is omitted until its separate enablement/acceptance contract is ready; no decorative enabled action. Existing Buy Now/checkout links and drawer callbacks must be reconciled in implementation, with Checkout code preserved.

## Flow details

Add → validate/pick variant → create one intent/key → optimistic pending item/count labelled updating → commit outcome → authoritative projection + confirmation. Failure before acceptance rolls back pending projection; timeout shows unknown and recovers receipt. Never show success solely from optimistic state.

Set quantity → keep local input while typing → submit validated whole units → pending line → committed snapshot. Coalesce unsent desired sets only; never drop submitted intents. Slow results cannot replace newer revision/owner. Conflict → show latest server quantity and user's desired quantity → explicit retry after review. Minus at one retains one with Remove separate; keyboard input supports exact quantity.

Remove → confirmed absent → Undo for a short announced interval (proposed 8 seconds) → new add with fresh validation, same owner required. Clear requires explicit confirmation when populated and returns empty plus success. Move to Wishlist → pending save → saved → remove source guarded by line version; second failure offers Retry removal and explains item remains in bag. Account switch during any flow immediately dismisses owner-sensitive overlay, clears projection and invalidates its actions.

Variant edit → reuse create-selection fields with current variant initial values → show target overlap/summed quantity → submit atomically → focused updated line. Coupon form explicitly shows applied/ineligible/expired outcome, retains typed code on retryable error and never reports code applied without an actual evaluator allocation.

## Responsive layout and accessibility

| Width/context | Layout and ergonomics |
| --- | --- |
| 320–430px phone | Single-column compact lines; 48px important touch envelopes; full-width bottom sheet or full-screen variant editor; sticky summary respects safe-area and on-screen keyboard; no horizontal page scroll |
| 431–767px large phone | Same workflow with growing text and optional thumbnail space; controls wrap rather than overlap |
| 768–1023px tablet/iPad | Wider single content column or balanced list/summary only if text remains readable; portrait/landscape and touch-first sheet; navigation stays consistent |
| >=1024px desktop | Two-column line list + bounded sticky summary, drawer side/sheet composition using same state; no duplicated actions/read model |
| 200% zoom / large text | Reflow to one column, no fixed-height clipping, line actions remain reachable; images reserve aspect ratio |

Every control has accessible name, visible focus, text error/description association and pending semantics. Modal uses focus trap, inert background, Escape/close, labelled title, safe scroll lock and focus return to invoker; nested picker restores focus to Cart line. Announce successful updates and partial outcomes with polite live region, blocking errors appropriately without repetitive per-keystroke announcements. Don't move focus for background count refresh. Preserve keyboard quantity editing, meaningful thumbnail alt, reduced-motion support, sufficient text/focus/status contrast and noncolor icons/text. Verify screen reader and keyboard manually; role=dialog alone is insufficient.

## Complete UI state matrix

| State | Header | Drawer/page/inputs | Action and next step |
| --- | --- | --- | --- |
| Empty | confirmed 0 | Helpful empty state, shopping/category link, no coupon/checkout clutter | Continue shopping; GET creates no row |
| Loading | reserved badge placeholder | Skeleton with stable dimensions, busy region, no fabricated items | Cancel/close always works |
| Populated | confirmed units | Current lines, prices, notices and subtotal | Edit/remove/view page |
| Updating | pending indicator | Only related controls busy, pending labelled; keep confirmed baseline | Same intent retry if unknown |
| Saved | new confirmed count | Brief success/live region, next action visible | Continue shopping/View Bag |
| Error | last count with warning | Inline error + request ID/support hint, input preserved | Retry with correct original intent |
| Offline | last snapshot stale | Persistent offline notice; no claim of saved changes | Reconnect/refetch; no blind queued increments |
| Conflict | refreshed count | Latest vs desired quantity visible | Explicit reviewed retry |
| Reconciliation | syncing indication | Merge progress/result, combined/unavailable/cap review | Resolve and acknowledge |
| Partial success | committed successful units | Per-entry added/rejected, saved-but-not-removed transfer | Retry remaining reviewed entries/removal |
| Unavailable | requested count retained | Safe tombstone and reason; totals clearly exclude private/unpriced | Change variant/reduce/remove |
| Expired session | private count hidden | Clear private projection and pending owner actions | Sign in or explicit fresh guest |
| Account switching | loading/no private badge | Blank old account data, close sensitive dialog | Resolve new owner then fetch |

Manual acceptance: S01–S34/S55/S57; browser widths 320,390,430,768,1024,1440, tablet orientations, keyboard and screen reader, slow/offline/reordered requests, cookie/storage denied and account transitions. Test B phases against real API, not only design fixtures/mocks.
