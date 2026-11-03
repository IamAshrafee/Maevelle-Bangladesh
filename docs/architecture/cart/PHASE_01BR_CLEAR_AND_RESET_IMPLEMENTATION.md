# Phase 01B-R Clear and reset implementation

2026-11-03. Actual backend contracts are unchanged.

## Clear

CartClearAction is on the main Cart page, including a coupon-only Cart. Its shared
ConfirmDialog says all items AND selected coupons will be removed, with no Undo.
The controller admits one Clear flight, captures observed authority/revision,
uses a new UUID and sends DELETE `/api/storefront/v1/carts/current`. Journal
whitelisting supports `{kind:'clear'}`. No line-deletion loop or local total truth.

On receipt, apply only the current owner/ticket and nondecreasing projection,
clear resolved journal, update all subscriptions and emit one minimal revision
hint. A replay's original committed outcome may be older than the current bag;
announce confirmation/review separately. Empty/no-op Clear does not claim changed
quantities or increment a client revision. A queued or uncertain Clear prevents
dependent edits. Stale confirmation refreshes/requires renewed customer intent.

A Clear trigger can disappear when the page becomes empty. Confirmation cleanup
restores focus after DOM changes, using cart-feedback when the original trigger
is removed or no meaningful element was focused. This also supports pointer
activation in browsers that do not focus a clicked button.

## Session forgetting

Offer “Start a new bag on this browser” for unavailable guest authority. The
confirmation explicitly warns that contents may not return, stored bags are not
deleted, and other tabs should be closed. Account Cart unavailability never offers
a guest fallback. If the invalid state is actually an expired shopper session,
subsequent strict read still refuses and directs the customer to account recovery.

1. Block new commands. Unknown pending/journal/memory intentions must first be
   retried exactly or explicitly stopped with a separate continuity warning.
2. Increment the owner generation, hide private projections and invalidate old
   callbacks. Track already-started network activity across generation changes.
3. Emit begin hint, drain local activity and use the same optional Web Lock as
   bootstrap/mutations. Lock acquisition has a20-second deadline; no unbounded wait.
4. DELETE `/api/storefront/v1/carts/session` with JSON `{}`. This is not an intent
   command and has no fabricated Cart UUID, revision, authority or price.
5. Only after `{sessionForgotten:true}`, clear old selection/journal and set the
   nonsecret session-review marker. A failed/unknown reset does not initialize.
6. GET current with actual browser cookies and no selected context.404 means no
   current authority, not proof that every outstanding response has disappeared.
7. Remaining or subsequently returned authority is fenced behind explicit review,
   including after reload where storage permits the marker. Optional other-tab
   hints cause fencing/server reads, never authority adoption.
8. A new Cart is initialized only after a subsequent explicit shopping action,
   with the normal verified cookie round trip. That clears the review marker.

Stopping recovery does not undo a possibly committed change. It requires explicit
confirmation and is refused while tracked requests are still active. No backend
Cart rows, hashes, receipts, shopper cookies or account data are deleted by this UI.
Natural expiry, credential retirement, browser eviction and inaccessible legacy
continuity remain distinct from this browser-level operation.
