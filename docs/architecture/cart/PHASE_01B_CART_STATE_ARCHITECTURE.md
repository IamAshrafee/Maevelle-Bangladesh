# Phase01B Cart state architecture

Implemented 2026-11-02. Source, not the historical proposed endpoints, defines this profile.

`features/cart/controller.ts` owns one confirmed server projection and a separate immutable pending intent. `api.ts` adapts the five existing routes; `browser-runtime.ts` owns browser lifecycle/coordination; `pending-journal.ts` owns bounded recovery metadata. React hooks use `useSyncExternalStore`. There is no new dependency or customer authentication realm.

The factory is independently testable. The browser singleton is created lazily, never during server rendering. Server snapshots are empty and contain no private customer data. Header count subscribes to a primitive number/null, busy/epoch/message hooks also select primitives. Detailed Cart state is subscribed only by the Cart page and feedback boundary. Unknown ownership/count is distinct from confirmed empty/zero. Global state does not include catalog grids or Wishlist data.

Modes: idle, loading, empty, ready, ambiguous, unavailable, expired, error. Synchronization: idle, refreshing, initializing, pending, uncertain, conflict. The confirmed DTO retains numeric version, intentRevision, calculationFingerprint and evaluatedAt. Pricing projection updates never create a frontend quantity intent. No optimistic price, stock, discount, tax or persisted quantity is fabricated; pending feedback is the optimistic interaction.

The public browser facade provides initialize/refresh/reconcile, subscription/snapshot, count/summary, add/set/remove and supported coupons. `clearCart` rejects local `UNSUPPORTED_CAPABILITY` and makes no request. Atomic Clear needs a transactional backend endpoint/receipt before UI integration; delete loops are forbidden.

PDP and Cart page now use shared commands. The page route is a thin wrapper around the existing adapted presentation. Header navigates to the real Cart page; the sample drawer remains a design-system specimen only. Product-card and Wishlist-to-Cart operations are future consumers of the same facade, not parallel state stores. Existing Wishlist implementation files are untouched.

The shared API error wrapper preserves existing fields and exposes only bounded validated context/version metadata. Public context UUIDs select an already authenticated HttpOnly slot; they never authorize access by themselves.

Performance evidence and limitations are in the [implementation report](PHASE_01B_IMPLEMENTATION_REPORT.md). No claim of measured React render duration or Core Web Vitals improvement is made.
