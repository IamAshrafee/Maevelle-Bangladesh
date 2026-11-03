# Phase01B frontend impact map — pre-edit baseline

2026-11-02. main / aa290065407030e85b5b6847efd22fb437a65279. Initial dirty status and content hashes captured in /tmp/cart01b-baseline.json before application edits; all existing01A/Wishlist/Admin/config work must survive.

| Current source | Classification | Authorized impact |
| --- | --- | --- |
| features/cart/use-cart-count.ts, cart-events.ts | Replace safely / adapt | Shared selective subscription and legacy invalidation hint; no separate navbar fetching/state |
| components/product-page-client.tsx | Adapt | Replace local Cart DTO/state/fetch with shared commands; preserve product/options and existing Wishlist changes |
| features/pdp/pdp-view.tsx | Adapt | Propagate failed add correctly, invalidate local feedback on owner epoch; never navigate to Checkout after rejected/unknown add |
| app/cart/page.tsx | Adapt | Thin route; existing presentation consumes confirmed shared state and pending/errors, no competing fetch/state; no redesign |
| components/layout/header-client-shell.tsx | Replace safely | Remove sample CartDrawer from live header; existing nav links open actual /cart |
| desktop-navbar.tsx / mobile-navbar.tsx | Adapt | Shared count, unknown != zero, stable accessible names; preserve existing nav/Wishlist behavior |
| components/commerce/cart-drawer.tsx | Defer | Design-lab-only local specimen after header disconnect; full real drawer is02B, not represented as customer state |
| lib/api/client/http.ts | Reuse/extend | Preserve shared envelope/error wrapper; expose validated safe context/conflict metadata for Cart recovery |
| features/account/shopper-account.tsx | Adapt | Signal begin/settled auth transitions to Cart before requests; existing shopper realm and Wishlist operations unchanged |
| app/layout.tsx | Adapt narrowly | Small client runtime/feedback boundary, no private SSR payload or new state library |
| features/wishlist/* and product cards | Reuse / defer | Read existing identity/signal patterns; future Cart integration uses controller API, no new bulk/variant/transfer workflow now |
| features/cart/* new focused modules | New foundation | Typed adapter, pure controller, pending journal, browser coordination/runtime, selective React hooks and accessible recovery |

## Contract reconciliation before implementation

Source01A is authoritative: success {data:GuestCartViewDto}, numeric version and additive intentRevision/evaluatedAt/ownerContext/outcome. Mutations use Idempotency-Key UUID and ownerContext; GET without cookie404, several valid slot contexts409 CART_CONTEXT_REQUIRED. Round-trip cookie proof precedes first mutation. ACCOUNT_CART_NOT_READY remains controlled unavailable; no fallback/merge/adoption. Exactly five existing mutations available; atomic clear, summary, validation and merge endpoints are missing. Expose clear as unsupported capability, never simulate it with partial delete loops or invent a route.

Design: one factory-tested external store and browser singleton (never mutable private SSR state), explicit confirmed vs pending intent, immutable submitted key/body, serialization, revision/evaluation/epoch guards, one initialization flight, optional Web Locks, nonsecret BroadcastChannel invalidations, sessionStorage-only bounded nonsecret recovery metadata. Cookie credentials never readable/persisted in JavaScript. Explicit context chooser preserves multiple authorities without merge. Root reads do not mint sessions.

Verification plan: existing focused Vitest, production build/types/lint; actual local API + newly created isolated database on verified owned PostgreSQL18 loopback55441 (no DROP/TRUNCATE/reset); real Chrome with isolated profile and controlled local response ordering, without installing packages. Do not alter backend security to make frontend tests pass. Known legacy fixation/signed-in/high-risk gates remain inherited release blockers.
