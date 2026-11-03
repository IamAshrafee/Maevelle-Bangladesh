# Phase 01A-R API and Phase 01B-R frontend contract

2026-11-03. This is the implemented guest foundation profile. Full-product
architecture documents retain future capabilities; they are not proof those
routes exist. All paths below are API paths; Storefront uses its `/api` proxy.

| Method / path | Body | Result |
| --- | --- | --- |
| POST /storefront/v1/carts | `{}` preferred; optional organizationId/currency assertions and ownerContext | 201 newly issued guest Cart + HttpOnly cookie; 200 existing authorized Cart without cookie rotation |
| GET /storefront/v1/carts/current | none; optional X-Cart-Context | Current evaluated GuestCartViewDto; never creates |
| POST …/current/lines | version, ownerContext, variantId, quantity | Increment selected exact variant, one receipt |
| PATCH …/current/lines/:lineId | version, ownerContext, quantity | Desired whole-unit quantity, one receipt |
| DELETE …/current/lines/:lineId | version, ownerContext | Remove that owned line, one receipt |
| POST …/current/coupons | version, ownerContext, couponCode | Select coupon; duplicate selected coupon is a no-op |
| DELETE …/current/coupons/:couponCode | version, ownerContext | Remove selected coupon |
| **DELETE …/current** | **version, ownerContext** | **Atomic Clear: all lines and coupon selections; shared receipt** |
| **DELETE /storefront/v1/carts/session** | **{}** | **`{data:{sessionForgotten:true}}`; expire presented recognized Cart cookies; no database deletion/recovery** |

All command routes through Clear require `Idempotency-Key: <UUID>` and the
observed owner context in the body or `X-Cart-Context`. When both exist they must
agree. Public ID/context alone never grants access. UUID intent keys are scoped
to tenant + Cart + operation, and must be newly generated for each new intention.
Replay MUST retain key, operation, path parameters, exact body, revision and
owner context. Changing the revision on a retry changes the fingerprint and
conflicts. Successful replay returns the original immutable outcome and a fresh
authorized projection; those may have different revisions/quantities.

Reset/initialization/read are not customer Cart mutations and do not require an
intent receipt/key. Reset is repeatable; quiesce requests first. A late response
can reintroduce an old slot, so read again and offer explicit context selection.
It is browser credential forgetting, NOT server credential revocation. Current
Storefront controller supports existing keyed commands already. It has not been
changed to expose Clear or reset in this backend assignment.

## Authority and responses

Organization/currency come from configured storefront resolution. Optional
initialization fields assert equality only. The present deployment model has one
configured storefront mapped to a tenant/default currency; there is no separate
multi-storefront-within-one-tenant isolation key. Do not claim that feature.
Exact Catalog variant UUID is the configuration identity. No client customer,
price, discount, currency override, tenant override, or availability authority.

Success is `{data: GuestCartViewDto}` except session reset above. DTOs live in
packages/contracts/src/cart.ts. Decimal monetary strings have four decimal
places; line quantities are positive whole units, projected as database decimal
strings. `version` is a safe numeric intent revision; `intentRevision` is its
string representation. `calculationFingerprint` includes current price identity,
amount/compare-at, availability, selections and promotion evaluation. It may
change without an intent revision. A quote/reservation is not promised.

`outcome` carries receiptId, operation, committedVersion, eventIds, replayed and
line quantity changes. Clear records removals. Coupon-only changes have empty
line changes but one revision/event. An empty Clear/unchanged quantity/duplicate
coupon selection consumes a receipt without revision increment or event. Old
legacyReceipt flags/replay branches are retired; old records remain inaccessible
under revoked credentials. Nonexistent line/coupon removal returns NOT_FOUND;
it is not silently converted into a new successful intention.

All responses, including errors, are private/no-store with Cookie and
X-Cart-Context variance. Errors use `{error:{code,message,requestId?,currentVersion?,contexts?}}`.
Body size <=65,536 bytes; unknown properties are rejected. Quantity 1–99 decimal
unit strings; 100 lines, 10 coupons, 32 slot credentials. Rates per trusted
connection IP/tenant/minute: initialize20, mutations120, reads240. Reset uses the
mutation bucket. Current API does not trust forwarded IP headers; verify proxy
behavior before release, especially shared gateway IP aggregation.

## Recovery state machine for Phase 01B-R

1. Initialize only for an explicit shopping action; GET first on restore. Use the
   existing single-flight/Web Locks barrier where available. Do not assume it
   correlates independent cookie-less requests. Follow POST with a cookie-backed
   GET of the observed owner before submitting a command.
2. CART_CONTEXT_REQUIRED (409) supplies only cookie-backed public contexts. Ask
   for selection; do not silently choose newest/first or combine contents. Keep
   context pinned across tabs and pending journals. OWNER_CHANGED (409) cancels
   dependent work and resolves identity again. No automatic new-owner retry.
3. SESSION_ESTABLISHMENT_REQUIRED (409) means no valid capability returned.
   Detect rejected cookies; keep the action uncommitted and offer browser-cookie
   guidance. Do not loop on initialization or report Add success.
4. INVALID_SESSION / SESSION_EXPIRED (401) offers an explicit explanation and
   “Start a new bag on this browser” action. Confirm continuity loss, stop pending
   work, clear owner-bound journals/broadcast state, DELETE session, GET to confirm
   no current authority, then initialize only on explicit new shopping intent.
   Do not silently discard pending intents or suggest reset recovers the old Cart.
5. ACCOUNT_CART_NOT_READY (409) is a supported fail-closed boundary. Show a clear
   unavailable state; do not retry against guest credentials. Existing shopper
   identity remains the sole account realm. Sign-out can resume independent
   valid guest authority; it does not copy account intent.
6. STALE_VERSION (409): reload and ask for renewed desired-state intent; do not
   silently overwrite newer edits. IDEMPOTENCY_CONFLICT (409): preserve diagnostics,
   stop automatic retry. INTENT_EXPIRED (409): review current Cart; a fresh key is
   permitted only for a new explicit decision, never as recovery of unknown work.
7. 503/network abort/timeout: outcome is unknown. Retain exact key/body and retry
   after Retry-After/reconnect. 429: honor Retry-After. 400 INTENT_KEY_REQUIRED or
   INVALID_REQUEST: fix caller input, never hide as success. OWNER_CONTEXT_REQUIRED
   (409): resolve/pin current context before creating a new intention.
8. Clear becomes one controller command `{kind:'clear'}` mapped to DELETE current.
   One UUID and observed revision/context. Disable dependent edits while pending,
   reconcile immutable outcome separately from latest projection, and broadcast
   revision once. Never implement Clear as sequential line deletes. Existing UI
   does not expose an atomic Clear until 01B-R intentionally adds this command.

Real-browser acceptance must cover reload, two tabs, delayed responses, storage
and Web Locks denial, cookie rejection/eviction, reset racing late bootstrap,
unknown writes, account switch, mobile keyboard, touch, focus and high zoom.
The five new API-protocol Chrome cases pass; complete UI accessibility and
multi-engine/device acceptance are not claimed by this backend reassessment.
