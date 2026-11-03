# Phase 01B-R state and recovery contract

2026-11-03. `features/cart` is the single source for frontend Cart coordination.
Backend source and01A-R contracts remain authoritative for commerce/identity.

| State | Display / allowed next step |
| --- | --- |
| idle/loading | Unknown count; Add busy until identity read settles; never show false zero |
| empty | Authorized absence/confirmed empty bag; next explicit Add may initialize |
| ready | Confirmed server projection; commands still preflight current authority/revision |
| ambiguous | No old contents; explicit offered cookie-backed context selection and server read |
| expired | No private projection; recheck/account recovery or deliberate new-bag workflow |
| unavailable | Account Cart unsupported; no guest fallback/merge claim |
| error | Safe error + check/recovery action; never manufacture an empty bag |
| pending | Exact submitted intention locked; dependent mutations blocked |
| uncertain | Preserve key, command, parameters, version, owner and creation time; explicit retry |
| conflict | Review latest projection; expired/mismatched diagnostic intentions remain available for explicit stop |
| resetting | Admission paused, old generations fenced, requests draining; no new shopping authority yet |

Cart intent storage: tab-local <=7 days/2KB, whitelist reconstruction. It contains
only UUID key, public owner precondition, revision, timestamp, variant/line IDs
and quantity or Clear kind. Coupon text/full Cart/customer/product/prices and all
credentials are excluded. Coupon unknown outcomes remain in memory and warn
about unavailable reload recovery. A separate static reset-review marker prevents
late old cookies from being silently accepted after reload; storage-denied memory
fallback is explicitly warned, not a false persistence guarantee.

## Exact recovery rules

- Network timeout/abort/503/invalid response: unknown write, preserve exact intent.
  Never generate a replacement key or change its original revision on retry.
- 429: keep intention and honor Retry-After before manual retry; background reads and new commands also pause during cooldown, so no retry storm.
- STALE_VERSION or external revision found in preflight: refresh/review, then a
  genuinely new customer decision. Never silently rebase a desired-state edit.
- IDEMPOTENCY_CONFLICT / INTENT_EXPIRED: stop automatic retry; preserve diagnostic
  intent until customer explicitly stops recovery. A new key represents a new
  decision, not an escape from an uncertain outcome.
- CART_CONTEXT_REQUIRED: select only offered contexts and validate via server.
  An unresolved intention may select only its original context, not another bag.
  “Review other bags” returns to a fresh server-validated choice list.
- OWNER_CHANGED / OWNER_TRANSITION / invalid ownership: fence old callbacks and
  hide contents. Do not attach intent to a new owner or initialize a fallback.
- CART_CONTEXT_LIMIT: hide old display and offer deliberate bounded forgetting
  or browser-settings guidance; do not create an initialization loop.
- SESSION_ESTABLISHMENT_REQUIRED / OWNER_CONTEXT_REQUIRED: review actual session;
  a returned public context never substitutes for the cookie round trip.
- ACCOUNT_CART_NOT_READY / failed shopper lookup: no guest authority substitution.
- Missing key/invalid request: safe implementation-error message, never success.

At most20 distinct queued/in-flight commands; identical active commands share
one flight. Clear prevents dependent command admission. The existing server receipt
is the committed fact, while the returned projection is current evaluation. No
local version bump, stock reservation, money computation or false outcome event.

## Lifecycle

Runtime is lazy/client-only. Primitive selectors limit header/PDP rerenders.
Last-unsubscribe closes channel, events and polling; route navigation can retain
one active controller under the persistent header.30-second polling is visibility
and auth-hold aware. Hints are bounded/coalesced and never authorize. Visibility
and auth transitions hide old contents/fence pending callbacks and revalidate on
settlement. Route admission scope prevents an old product action from claiming
success on a different surface. Buy Now cannot navigate after owner/product/unmount
changes. Complete Checkout is not implemented by that compatibility behavior.

SessionStorage is tab-local. Closing a tab can discard its journal; reopening reads
actual server state and never automatically repeats an old command. A browser
restoring a retained journal can offer exact replay, subject to owner/age checks.
