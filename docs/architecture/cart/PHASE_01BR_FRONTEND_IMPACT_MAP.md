# Phase 01B-R impact map

2026-11-03. Preserve dirty main@aa290065407030e85b5b6847efd22fb437a65279.
Pre-edit hashes/status: phase01br-evidence/baseline.json and baseline-status.txt.

Authorized changes: storefront/features/cart controller, transport, journal,
errors/types/runtime/hooks and focused components/tests; shared confirmation
primitive if needed after searching existing dialogs; Cart page composition;
announcement/header responsive layout; narrow PDP feedback fencing where needed;
synthetic verification scripts; current Cart documentation/resume metadata.
Backend contracts, migration history, Wishlist ownership and unrelated dirty
Admin/API/Worker files must remain byte-identical unless a separately evidenced
contract defect requires a narrow correction.

Consumers: header count, global feedback, PDP, Cart page, shopper auth transitions.
One external store remains. No second Cart store, dependency, full drawer redesign,
account persistence/merge or Checkout feature. Reuse Button/Notice/QuantityStepper
and native dialog conventions. New confirmation is a shared primitive, not a
Cart-only modal implementation.

Decisions before edits: KEEP external store, primitive selectors, exact submitted
intents and capability barrier; IMPROVE queue bounds, outcome preservation,
retry guidance and journal whitelist; REPLACE unsupported Clear with one atomic
command; ADD explicit cookie forgetting coordinated with the bootstrap barrier;
REFACTOR recovery presentation away from global feedback; FIX header intrinsic
minimum sizes/wrapping instead of hiding overflow. No auto-reset or auto-retry.

Measured zoom correction additionally touches mobile-footer.tsx: its nowrap privacy
row reached705.875px at a640px CSS viewport with body zoom2. The tablet search
input also reached670.984px because its padding exceeded the available flex
space. Wrap the footer and allow the tablet header/search to reflow; do not
hide global overflow. These measured clean-file changes are in scope.

Preservation exception discovered during regression: inherited AR08 rewrote
phase01ar-evidence/performance.json. Original narrative/test outcomes are unchanged;
original sample values and baseline checksum are retained in that artifact’s
provenance_exception; original full plan bytes could not be restored. New timings
are copied to01BR evidence. The database test changes only its artifact sink to
opt-in CART_PERFORMANCE_OUTPUT; no backend API/domain/security contract changes.
This exception must be disclosed rather than claiming byte-perfect evidence preservation.

One focused global-chrome correction also changes chat-root.tsx’s launcher
bottom-offset breakpoint from sm to lg. Bottom navigation stays visible below
lg, so the earlier sm override put the launcher over tablet/high-zoom navigation.
No Chat workflow, provider, data model or ownership behavior changes.

Populated-Cart zoom additionally exposed a653px line-price overflow after the
header/footer correction. The quantity/price row and image/content group now
wrap at their intrinsic minimums. QuantityStepper gains a shared48px touch size
used by Cart; existing sizes/consumers remain unchanged. The lab demonstrates
that size. This is responsive/accessibility foundation work, not a new Cart design.
