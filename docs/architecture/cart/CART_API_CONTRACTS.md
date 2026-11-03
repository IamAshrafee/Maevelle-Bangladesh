# Cart API contracts

> Frontend implementation notice (2026-11-03): [Phase01B-R](PHASE_01BR_IMPLEMENTATION_REPORT.md)
> and its [state/recovery contract](PHASE_01BR_STATE_AND_RECOVERY_CONTRACT.md) supersede
> unsupported-Clear/reset frontend assumptions. One controller now integrates
> the unchanged01A-R atomic Clear and cookie-forgetting API. Full account/merge,
> Checkout and complete AT/device/release acceptance are not claimed.


> Current implementation notice (2026-11-03): [Phase01A-R](PHASE_01AR_IMPLEMENTATION_REPORT.md)
> and its [API/frontend profile](PHASE_01AR_API_AND_FRONTEND_CONTRACT.md) are authoritative
> for the implemented guest foundation. Retain the full-product design below;
> fixed-cookie adoption, optional public intent keys and legacy receipt replay
> are superseded. Atomic Clear and explicit cookie-only session forgetting now
> exist. Account Carts/merge and complete Checkout are not implemented by01A-R.


Phase01A update: the [implemented profile](PHASE_01A_RECEIPT_AND_OWNER_CONTRACT.md), [bootstrap protocol](PHASE_01A_BOOTSTRAP_PROTOCOL.md) and [acceptance register](PHASE_01A_ACCEPTANCE_REGISTER.md) distinguish current code from this full-product proposal/historical design register. Only explicitly evidenced Phase01A coverage has run; other scenarios/threats remain unexecuted.


All routes below are proposed evolutions of existing `/storefront/v1/carts` (audit E06–E17), not currently implemented capabilities. Preserve versioned prefix, `{data}` and `{error:{code,message}}`, TypeBox validation and shared contracts/client helper. Put new DTOs in focused `packages/contracts/src/cart.ts` re-exported through existing entry; do not make clients import database types.

## Request authority

Browser calls same-origin `/api/storefront/v1/...`; Fastify receives `/storefront/v1/...`. No client organization/account/cart-owner/price/discount/total fields accepted. Currency comes from configured storefront context; reject mismatch rather than silently convert. All mutations require exact configured Origin, JSON, bounded schema with `additionalProperties:false`, ownerContext, mandatory UUID Idempotency-Key and expectedVersion except explicit initialization. Cookie/verified session is authority; ownerContext only an anti-switch precondition. Unknown/missing/tampered ownerContext returns 409 OWNER_CHANGED without details about other owners.

| Method / suffix after `/carts` | Input beyond common mutation envelope | Semantics / permission |
| --- | --- | --- |
| GET `/current` | none | Full bounded view, ephemeral empty if no guest cookie; owner inferred; no writes |
| GET `/current/summary` | none | Same snapshot owner/version, sum requested units, warnings, merchandise net and eligibility; no product payload |
| POST `` | `{ownerContext?:string}` initialization intent | Create/recover current cart; resolve tenant/currency; account uses shopper resolver; guest token only Set-Cookie; rate limited; 201 new / 200 existing |
| POST `/current/lines` | `{variantId,quantity,source}` | Increment by quantity; source enum PDP/CARD/WISHLIST/RECOMMENDATION/SHARED_WISHLIST/CART; actual product/price derived |
| PATCH `/current/lines/:lineId` | `{quantity}` | Desired-state set, never increment; zero rejected; use remove |
| DELETE `/current/lines/:lineId` | common body | Desired absent, no-op absent under valid revision; owner checked even if absent |
| POST `/current/clear` | common body | Atomically empty lines + coupons |
| POST `/current/lines/:lineId/variant` | `{variantId,quantity}` | Atomic move/union with target variant; exact product compatibility verified; sum target + requested source units, reject safety cap without removal |
| POST `/current/validate` | common body | Re-evaluate all lines and return notices/eligibility; no stock reservation; no intent bump if no stored intent change |
| POST `/current/restore` | common body | Explicit revalidation/activity of unexpired inactive Cart; expired returns CART_EXPIRED |
| POST `/current/batch` | `{entries:[{clientEntryId,variantId,quantity}],mode:'BEST_EFFORT'}` | <=50 unique clientEntryIds, stable input order; one atomic receipt for all successful changes and per-entry rejections; transaction infrastructure failure rolls back all |
| POST `/current/merges` | `{expectedGuestVersion,expectedVersion,mergeIntentId,review?:...}` | Shopper only plus guest cookie; atomic reviewed merge; old token revoked |
| GET `/current/intents/:intentId` | none | Owner-authorized committed outcome recovery, including merge after capability revocation for target account only |
| POST `/current/coupons` | `{couponCode}` | Explicit selection; evaluator returns APPLIED/INELIGIBLE/EXPIRED/UNKNOWN safe result; never redemption |
| DELETE `/current/coupons/:couponCode` | common body | Desired remove; bounded normalized code; URL excluded from sensitive logging |
| POST `/current/transfers` | `{lineId,lineVersion,destination:'WISHLIST'}` | Account: durable save-first orchestration; guest: return reference preparation, UI persists Wishlist then calls guarded remove |
| GET `/current/recommendations` | none | Optional Cart application adapter supplies bounded context to Recommendation-owned query; no engine SQL in Cart |

Cart-to-Wishlist guest uses existing guest Wishlist save API/store outcome then guarded remove with transfer intent. An account transfer calls Wishlist-owned application operations, never raw Wishlist table writes. No Checkout-creation route is added; handoff is an internal read contract in its dedicated document. Legacy guest handlers remain behind compatibility facade and acquire equivalent tenant/origin/receipt protections before general rollout.

## Representative DTOs (proposed)

```ts
type CartMutation = { expectedVersion: string; ownerContext: string };
type AddItem = CartMutation & {
  variantId: string; quantity: string;
  source: 'PDP'|'CARD'|'WISHLIST'|'RECOMMENDATION'|'SHARED_WISHLIST'|'CART';
};
type CartOutcome = {
  intentId: string; operation: string; committedVersion: string;
  replayed: boolean; eventIds: readonly string[];
  entries?: readonly { clientEntryId: string; status: 'APPLIED'|'REJECTED'; code?: string; addedQuantity?: string }[];
};
type CartView = {
  id: string|null; ownerContext: string; ownerMode: 'GUEST'|'ACCOUNT';
  version: string; currency: 'BDT'; expiresAt: string|null;
  evaluatedAt: string; evaluationExpiresAt: string;
  calculationFingerprint: string; policyVersion: string;
  lines: readonly CartLine[];
  merchandiseGross: string; discountTotal: string; merchandiseNet: string;
  eligibleMerchandiseNet: string; itemCount: string;
  coupons: readonly { code: string; status: 'APPLIED'|'INELIGIBLE'|'EXPIRED'|'UNKNOWN'; message: string }[];
  eligibility: { readyForFutureCheckout: boolean; reasons: readonly string[] };
};
type CartLine = {
  id: string; version: string; productId: string|null; variantId: string;
  quantity: string; availableQuantity: string;
  title: string|null; handle: string|null; sku: string|null;
  mediaAssetId: string|null; options: readonly { name:string; value:string }[];
  unitPrice: string|null; gross: string|null; discount:string; net:string|null;
  status: 'AVAILABLE'|'UNPUBLISHED'|'DISCONTINUED'|'UNPRICED'|'INSUFFICIENT_STOCK'|'OUT_OF_STOCK';
  notices: readonly { code:string; previousUnitPrice?:string; currentUnitPrice?:string }[];
};
// GET -> {data: CartView}
// mutation -> {data: {outcome: CartOutcome, cart: CartView}}
```

Unpublished redaction sets title/handle/sku/media/options/price null or empty, while retaining own line ID/variant reference for remove/support. ProductId may be null to avoid exposing newly private catalog linkage. Snapshot lines unavailable for purchase remain visible as safe recovery placeholders. Shared DTO contract generation is an implementation task; these examples are not installed types.

Example add: Idempotency-Key `UUID`, `{expectedVersion:"7",ownerContext:"opaque-partition",variantId:"UUID",quantity:"2",source:"PDP"}`. Result outcome committedVersion `8`; view may have version `9` on replay after another edit. UI uses outcome for confirmation/measurement and newest view for rendering, never infers the original added delta from latest quantity.

## Errors and retry semantics

| HTTP | Code | Client recovery |
| --- | --- | --- |
| 400 | INVALID_REQUEST | Show field error; never retry invalid JSON/schema |
| 401 | UNAUTHENTICATED / SESSION_EXPIRED | Pause account queue, hide private state, sign in; no guest fallback |
| 403 | ORIGIN_REJECTED / FORBIDDEN | Stop mutation, generic safe message, log correlation only |
| 404 | NOT_FOUND | Foreign line/capability indistinguishable from absent |
| 409 | STALE_VERSION / OWNER_CHANGED | Refetch matching owner; re-review desired intent, use new intent key if payload/version changes |
| 409 | IDEMPOTENCY_CONFLICT / INTENT_IN_PROGRESS / INTENT_EXPIRED | Changed body rejected; pending bounded Retry-After; expired never reexecute silently |
| 410 | CART_EXPIRED | Clear stale projection, explicit new Cart action |
| 413 / 415 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE | Correct request, no retry |
| 422 | UNAVAILABLE / UNPRICED / LIMIT_EXCEEDED / INVALID_VARIANT | Show fresh availability and specific line resolution; no hidden clamp |
| 429 | RATE_LIMITED | Honor Retry-After; keep intent and input |
| 503 | UNAVAILABLE | Unknown outcome: recover receipt then same-key retry, bounded backoff |

Safe error extension may contain currentVersion, field errors, retryAfterSeconds and requestId; never tokens, owner account IDs or draft data. Do not attach full foreign-owner Cart on conflict.

Receipt fingerprint covers canonical operation/target/body including expected versions, owner generation, entries/source and policy-relevant intent; key is scoped by org + principal/cart generation + operation. Receipt lookup happens before version check so original exact retry succeeds after commit. Same key/different payload returns conflict. Rebase after confirmed stale rejection creates a new key only after UI reconciliation; never blindly rebase an unknown incremental add. Short bounded wait or 409 for concurrent claim; no second execution. Tombstones return INTENT_EXPIRED. Response headers on all success/error/summary/receipt paths: `Cache-Control: private, no-store`, appropriate Vary Cookie, no credential-bearing URLs. No wildcard credentialed CORS. Request/response schemas and generated contract tests must remain aligned.

Initialization exception: the mandatory receipt guarantee for merchandise mutations cannot treat a cookie-less create key as proof of guest ownership. D15/S59 must settle cold-bootstrap fencing and retry responses before implementing/accepting this endpoint evolution. No replay response may reveal/reissue another Cart capability from intent ID alone. Empty unacknowledged bootstrap rows are disposable after bounded retention; acknowledged merchandise is not.

## Phase01A.1 implemented credential deprecation

Migration3214 requires explicitly issued SLOT_V1 credentials; all earlier credentials are retired, including earlier slots with no stored provenance. `maevelle_cart` is never accepted, adopted, rotated or reissued. It returns401 SESSION_EXPIRED without disclosing whether a Cart exists. Malformed/mismatched/retired slots return401 INVALID_SESSION or SESSION_EXPIRED; no DTO or replacement credential. Duplicate refused initializers create no Cart. Slots must match exact configured environment prefix and server Cart UUID suffix. Several valid slots still require an explicit cookie-backed context; invalid/fixed credentials are not ignored to guess another authority.

Existing paths/envelopes/Cart DTOs and five commands remain unchanged for newly issued guests. ACCOUNT_CART_NOT_READY remains409, invalid shopper401, strict lookup/mapping failure503. No frontend change/new store is required because existing ownership-rejection latches and epochs consume these established errors. Stored legacy intent is retained but automatic recovery unavailable; see [compatibility](PHASE_01A1_COMPATIBILITY_MATRIX.md) and [cutover design](PHASE_01A1_SECURITY_MIGRATION_DESIGN.md). Proposed account/merge/Clear endpoints above are not implemented by this phase.
