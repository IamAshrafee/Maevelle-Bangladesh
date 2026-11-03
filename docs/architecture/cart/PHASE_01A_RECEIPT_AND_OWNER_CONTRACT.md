# Phase01A implemented owner, receipt and revision profile

This is the actual backend handoff. The larger `CART_API_CONTRACTS.md` remains the full-product proposal; its clear/batch/merge/transfer/summary/validation endpoints and string expectedVersion DTO are not all implemented by Phase01A.

## Actual endpoints and envelope

Existing GET current, POST carts, POST lines, PATCH line quantity, DELETE line, POST coupon and DELETE coupon routes remain. Browser prefix `/api` is handled by existing proxy, Fastify prefix `/storefront/v1/carts`. Success remains `{data: GuestCartViewDto}` to preserve current PDP/page/Orders consumers. New additive fields: ownerContext (public UUID precondition), intentRevision (decimal string), evaluatedAt (ISO), optional outcome. Numeric version/calculationVersion and every old CartView field remain; unsafe bigint-to-number conversion is refused, never truncated. API versions are safe integers <=MAX_SAFE_INTEGER-1.

New request example:

```json
{
  "variantId": "<variant UUID>",
  "quantity": "2",
  "version": 1,
  "ownerContext": "<observed public context UUID>"
}
```

Header `Idempotency-Key: <UUID>` requires observed ownerContext in body or `X-Cart-Context`. No client tenant/currency/customer/price/discount/total authority. Unknown body fields are rejected before Fastify can strip them. UUID parameters, positive whole decimal units 1..99, 64KiB bodies, 100 lines and 10 selected coupons bound work. Existing larger Cart projections fail LIMIT_EXCEEDED for review rather than performing unbounded hydration or silently truncating a purchase snapshot. These are provisional technical ceilings; lower business-policy configuration remains later work.

## Owner resolution

Configured ACTIVE Storefront organization and currency are resolved on server. Shopper resolver's new optional strict mode propagates storage errors; existing default Wishlist semantics remain unchanged. Active verified shopper uses existing customer_account/CRM mapping and typed ACCOUNT contract; Cart currently returns ACCOUNT_CART_NOT_READY rather than writing a guest/account Cart silently. Invalid/revoked/expired shopper cookie returns 401, infrastructure error 503, cross-tenant principal 403. No second auth realm or account merge was created.

Guest resolution hashes actual cookies and queries organization/currency/ACTIVE/unexpired/non-account Cart. Public Cart ID, ownerContext and receipt ID never authorize. Domain mutation guard repeats trusted scope/context checks while holding Cart row lock. New slot protocol is documented separately; legacy compatibility limitations remain explicit.

## Transaction and replay

Every existing mutation uses `cart/receipts.ts`: bounded lock/statement timeout, Cart row lock, owner validation, old receipt bridge, unique platform receipt claim, replay before stale-version rejection, command, version update, immutable outcome + minimal outbox fact and receipt commit **in the same transaction**. No new duplicate receipt table. Canonical sorted-body fingerprint excludes token/key and includes operation, expected revision, submitted intent fields and owner scope. Key namespace is organization + GUEST_CART/cart UUID + operation. Same key/different committed payload conflicts. Infrastructure/domain failure rolls back claim and mutations; rejected/uncommitted commands do not create a durable success receipt.

Outcome has receiptId, operation, committedVersion string, immutable per-line changes (line/variant IDs, previousQuantity, quantity), stable event IDs and replayed. No prices or full product snapshot stored in receipt. Replay returns the original outcome alongside the **current** authorized Cart projection, whose revision/price/fingerprint can be newer. A replay never executes domain changes or emits a second outbox event. Desired-state no-op set/repeated selected coupon has a receipt but no intent bump/event.

All five current mutations are integrated: add, set, remove, apply coupon, remove coupon. Existing `cart.add_line` receipts survive through a bridge using their original fingerprint/result shape; replay is flagged legacyReceipt with unknown historical changes `[]`, never fabricated delta/events. New receipts use `cart.foundation.*`; exact old domain conflict code CONFLICT remains compatible, owner-aware new requests use IDEMPOTENCY_CONFLICT. No-key legacy calls derive an operation+revision+payload identity; modern explicit keys are preferred and required by the Phase01B contract.

Receipt recovery expiry is provisional seven days (`platform.idempotency_records.expires_at`). Expiry returns INTENT_EXPIRED, never reexecutes; rows/keys are not physically deleted. No unapproved irreversible retention policy or Worker purge is enabled. Legacy receipts with no expiry remain consumed. Future retention approval must define scrubbing/tombstone horizon without re-enabling consumed keys.

## Revision/evaluation semantics

Intent version changes on actual accepted shopping-intent changes; no-op desired set does not bump. Stale new intent returns 409 STALE_VERSION with safe currentVersion string; same-key exact retry returns outcome before version rejection. Client must not blindly rebase unknown incremental adds under a new key. Cart read uses a repeatable-read snapshot, fixed evaluation timestamp and effective Pricing/Promotions calls; price change changes fingerprint/current projection without inventing a shopper revision. Mutation evaluation remains advisory; Checkout independently validates/reserves later.

## Errors and observations

400 INVALID_REQUEST, 401 INVALID_SESSION/SESSION_EXPIRED, 403 ORIGIN_REJECTED/INVALID_OWNERSHIP, 404 NOT_FOUND, 409 SESSION_ESTABLISHMENT_REQUIRED/CART_CONTEXT_REQUIRED/OWNER_CHANGED/OWNER_CONTEXT_REQUIRED/STALE_VERSION/IDEMPOTENCY_CONFLICT/INTENT_EXPIRED/ACCOUNT_CART_NOT_READY, 413 PAYLOAD_TOO_LARGE, 415 UNSUPPORTED_MEDIA_TYPE, 422 validation/limits/unavailable, 429 RATE_LIMITED, 503 UNAVAILABLE/INVALID_CONFIGURATION. Handler uses existing `{error:{code,message,requestId,...safe metadata}}` convention. All Cart success/errors are private no-store with Cookie/context Vary. No credentialed wildcard CORS is introduced.

PostgreSQL shared counters: initialize20, mutation120, read240 per minute/storefront/direct IP (not attacker-supplied forwarding headers); Retry-After60 for rate denial and2 for infrastructure failure. Proxy client-IP trust and representative load need later staging/performance evidence. Pino records rejection codes/request IDs and successful operation/replay/revision; never raw errors/cookies/token/body. Safe DATABASE_CONNECTION_LOST callback prevents unhandled pg errors between queries and is logged by API/Worker. It does not turn a failed transaction into success or automatically reexecute unknown operations.
