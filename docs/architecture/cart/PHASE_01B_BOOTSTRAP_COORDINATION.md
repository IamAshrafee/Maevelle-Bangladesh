# Phase01B guest bootstrap coordination

Implemented against [Phase01A's actual cookie-slot protocol](PHASE_01A_BOOTSTRAP_PROTOCOL.md). Reading a PDP/header may GET current Cart, but never POST initialization. GET404 without a known owner is confirmed empty; missing previously selected authority is expired/unavailable, not permission to create a replacement.

## First mutation

1. Coalesce local initialization into one flight. Request optional origin-wide Web Lock `maevelle:cart-bootstrap`.
2. GET current authority again inside the lock. Reuse an existing verified projection.
3. Only confirmed cookie-less empty state permits POST `/storefront/v1/carts` with `{}`.
4. Await POST, then perform an **unqualified** GET current with actual browser cookies. No mutation before this round trip succeeds and matches the returned public ownerContext.
5. Submit immutable ownerContext/version/key/body. The backend independently validates the credential and preconditions.

Web Locks are coordination, not authentication. Unsupported locks and policy denial **before the callback begins** fall back to this same protocol. An exception after callback entry never reruns initialization. Rejected cookies lead to `PERSISTENCE_UNAVAILABLE` and no add. Chrome's actual UserPreferences rejection is verified, including zero stored slots.

Without coordination, independent cookie-less requests may mint independent HttpOnly slot cookies. No IP/user-agent/public-ID deduplication or fixation/adoption is attempted. Distinct names prevent a delayed response overwriting a newer slot. An unqualified GET with several authorities returns409 CART_CONTEXT_REQUIRED and validated context choices. Feedback offers explicit bag selection; selected UUID stays tab-local in sessionStorage, followed by a server-validated GET. It does not merge bags, transfer ownership or automatically repeat an add.

Selection remains explicit once made; a late slot can remain a separate recoverable bag. The UI does not secretly switch the selected bag. Rejected/unknown bootstrap responses do not claim a saved mutation. After a lost initialization response, the next attempt checks cookies before issuing another initializer; several resulting slots require selection.

BroadcastChannel/storage messages contain only kind, public context, revision/nonce or identity phase. Mutation invalidations cause bounded trailing authoritative rechecks; reads do not broadcast. Focus, pageshow, visible state, online and a visible-only30s poll recover missed hints. A hidden tab clears private display and invalidates old callbacks; returning visible verifies again. Auth begin pauses; auth settled rechecks the actual shopper realm. No raw cookie, bearer credential, full Cart or customer record crosses these channels.

Real Chrome controlled-order results: [browser scenarios](PHASE_01B_BROWSER_SCENARIO_RESULTS.md). Backend legacy fixed-cookie adoption/retirement/fixation parity remains an inherited High release gate. The frontend does not retire or adopt credentials.
