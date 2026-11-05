# Phase 03B handoff: implemented commercial quote contract

Phase 03A is **PARTIAL overall**, with an implemented, locally tested component-quote backend. It does not provide a final payable amount. Phase 01B and Phase 02B remain **PARTIAL**. This document describes available backend behavior; it does not authorize frontend implementation or activation.

## Authority and transport

Shared types: `packages/contracts/src/checkout-quote.ts`. Routes: `apps/api/src/routes/checkout-quotes.ts`. Base: `/storefront/v1/checkouts/:id`. Keep the Phase 01A/02A guest capability or live shopper cookie and current partition. IDs/fingerprints are references, never credentials. Private responses are `private, no-store` and `no-referrer`. Writes require exact trusted Origin, Fetch Metadata, JSON, and a UUID `Idempotency-Key`. Existing durable IP quotas cover these routes. They remain unavailable in production, including when the draft flag is true.

| Method / suffix | Body | Result in `{data}` |
| --- | --- | --- |
| POST `/quotes` | `{revision:"2",couponCodes?:["CODE"]}` | 201 `CheckoutQuoteDto`; accepted creation increments the shared draft revision, e.g. `"3"` |
| GET `/quotes/current` | None | Current pointed quote, including current invalidity, or `null` before any quote exists |
| GET `/quotes/:quoteId` | None | Owned historical quote with immutable facts and fresh lifecycle observations; unrelated/missing quote returns 404 |
| POST `/quotes/:quoteId/acknowledgements` | `{revision:"3",fingerprint:"<exact server fingerprint>"}` | Current quote with acknowledgement; no Order, payment, promotion use or stock hold |

The root draft revision is a decimal string. Do not coerce it through Number. Quote creation advances it once; acknowledgement records a review observation against that exact revision without advancing it. Source/delivery edits, adoption and abandonment retain their existing revision behavior. Restore the shared controller's draft revision after quote creation before any further delivery/source edit. Phase 02B's delivery DTO still deliberately returns `quoteAvailable:false`; do not change its old adapter assumptions to enable financial presentation implicitly.

BUY_NOW accepts an explicit bounded list of at most ten coupon codes. Codes normalize to uppercase, deduplicate and sort for idempotency. CART rejects a nonempty coupon override: edit coupons in the Bag, explicitly accept its new complete revision, then quote. Buy Now never reads unrelated Bag contents. Quotes are bounded to 100 lines, quantities 1–99, 100 applied promotions and 64 immutable quotes per draft. The development quote lifetime is ten minutes capped by draft expiry; production lifetime/retention still require approval.

## Facts, observations and money presentation

`CheckoutQuoteDto` includes `id`, `draftId`, `draftRevision`, source kind and Cart binding when applicable, `fingerprint`, `evaluatedAt`, `expiresAt`, `facts`, `status`, `issues`, `acknowledged`, `reviewRequired`, `changes`, `previousQuoteId`, blockers, `stockReserved:false`, `purchaseAvailable:false`.

`facts` contains currency; exact lines with identity/title/SKU/whole quantity/price-definition identity/unit price/gross/discount/net; promotion identities/revisions/allocations; requested coupon statuses; merchandise subtotal, discount total, shipping and evaluated total. Amounts serialize as four-place decimal strings. Coupons report EFFECTIVE or NO_CURRENT_BENEFIT; the latter includes unknown, expired, disabled, exhausted, untargeted, below-minimum, customer-limited or stacking-displaced codes. It is a visible rejected benefit, not an applied discount or a promise of later availability.

The equation is `evaluatedTotal = merchandiseSubtotal - discountTotal + shipping`. **`tax:null`, `paymentFees:null`, `payable:null`, `final:false`** are mandatory. Do not relabel evaluatedTotal as “total payable”, manufacture zero tax/fees, silently round it into a payment amount or display transfer instructions. Explicit blockers are TAX_POLICY_UNRESOLVED, PAYMENT_POLICY_UNRESOLVED and COURIER_COMPATIBILITY_UNVERIFIED. An acknowledgement only acknowledges evaluated components; it does not resolve these blockers.

Use exact decimal formatting at the presentation boundary. Preserve legitimate zero prices/shipping/discounts; never use a truthy fallback. Pricing retains its existing four-place prices. Promotions retain their existing four-place percentage truncation and deterministic largest-remainder allocation by stable line ID. A two-place final BDT payable/rounding-adjustment policy is intentionally not selected. Stock is only observed for eligibility and never held. Sufficient-stock movements do not change prices; loss of required availability invalidates the quote.

## Lifecycle and review

| Status | Meaning / next action |
| --- | --- |
| CURRENT | Exact current draft and evaluation match as observed in this request's database snapshot; show components and require explicit acknowledgement |
| EXPIRED | Database clock reached quote expiry; request a new quote if the draft remains active, otherwise explicitly restart |
| SUPERSEDED | Another quote is now pointed to by the draft; restore current quote, never accept the historical one |
| INVALIDATED | Draft/source/delivery/address/configuration/eligibility changed; follow issue, review current inputs and request a new quote |

`acknowledged` is a historical review fact. It can remain true on an invalidated/expired quote. `reviewRequired` is true unless CURRENT and acknowledged. Status precedence is SUPERSEDED, then EXPIRED, then INVALIDATED, then CURRENT; issues may contain more than one reason. Old quotes cannot become accepted by matching an amount. Changes bind full fingerprints and exact root/source revisions.

`changes` names SOURCE, DELIVERY, MERCHANDISE, DISCOUNTS, SHIPPING or CONFIGURATION. For a new quote it compares the predecessor; for a successful current reevaluation it describes detected differences. When eligibility prevents a fresh evaluation, use `issues` for recovery rather than interpreting `changes` as an exhaustive new diff. Retrieve `previousQuoteId` under the same authority for old/new component presentation. Never replace an old quote's facts with fresh numbers in client memory.

Saved-address CHANGED/REMOVED, stale Cart or delivery configuration require the explicit existing source/delivery review action first. A quote POST does not accept or overwrite them. Acknowledgement reevaluates current commercial eligibility and rejects stale, expired or superseded quotes. No price/stock/promotion hold is implied by CURRENT or acknowledged. Another writer may commit after this snapshot; future placement must revalidate again.

## Errors and recovery

| HTTP | Representative codes / action |
| --- | --- |
| 400 | INVALID_REQUEST: unknown amount/owner/status fields, nonstring revision/coupon/fingerprint, invalid key/body; fix the intent |
| 401 / 403 / 404 | SESSION_EXPIRED, OWNER_CHANGED / ORIGIN_REJECTED / NOT_FOUND; clear private state on identity rejection; no guest fallback |
| 409 | STALE_REVISION, SOURCE_CHANGED, ADDRESS_CHANGED, DELIVERY_CHANGED, CONFIGURATION_CHANGED, SUPERSEDED, QUOTE_LIMIT, IDEMPOTENCY_CONFLICT; restore and explicitly review before a distinct new key |
| 410 | DRAFT_EXPIRED, QUOTE_EXPIRED; refresh/restart explicitly |
| 422 | VARIANT_UNAVAILABLE, INSUFFICIENT_STOCK, UNSUPPORTED_AREA, DELIVERY_UNAVAILABLE, SOURCE_INELIGIBLE; preserve input and guide correction |
| 429 / 503 | RATE_LIMITED / UNAVAILABLE with Retry-After; outcome may be unknown, retry the identical intent and key |

Keep one key/body for an uncertain command. An accepted create replay returns the same immutable quote identity even after expiry/supersession, with freshly derived lifecycle/eligibility; it does not create another revision or imply current acceptance. Same-key/different canonical content conflicts. Receipt replay always rechecks live authority. Replaying an acknowledgement returns its current authorized quote observation; it does not resurrect acceptance. A definitive domain rejection rolls back the receipt and all writes. Network failure/503 is not proof of rejection. No separate receipt endpoint is needed: exact-key POST is recovery.

Keep the existing private page-memory intent handling, generation fences, abort/ignored-abort protection, account-switch clearing, focus/background revalidation and explicit conflict recovery. No quote/contact payload belongs in browser persistent storage, URLs, public telemetry, coordination messages or general logs. No frontend was implemented in 03A.

## Future placement contract and remaining gates

`evaluateCheckoutInTransaction` requires the caller's REPEATABLE READ or SERIALIZABLE Kysely transaction; it rejects READ COMMITTED. Caller obtains live authority and draft locks first. It uses the common merchandise evaluator, Cart's source-only authorized facade, Catalog structural eligibility, existing ATS query, Pricing/Promotions and Orders delivery serviceability/tariff resolver. There are no nested domain transactions or provider requests in this evaluator.

Snapshot isolation prevents mixed commercial statement versions and insert phantoms for quotation without retrofitting every Admin writer. It does not reserve stock, lock usage, guarantee freshness at commit, or certify future placement. Future placement must re-evaluate, compare exact accepted root/source/quote/fingerprint, enforce approved payment/tax/fee policies, then lock and atomically consume limited coupon capacity and Inventory allocation through their owners. Serialization/deadlock restarts must rerun the entire evaluation/comparison, never reuse old calculations. Legacy Orders retains its locked redemption path and remains gated; do not use it to consume these quotes.

Open gates: owner/accountant tax/fee/final rounding; payment destination/provider configuration and compatibility; real BD mapping/coverage; approved TTL/privacy/retention cleanup; populated persistent migration/recovery/ingress/role verification; broader load/fault/security and inherited 01B/02B browser/accessibility acceptance. See [03A implementation evidence](PHASE_03A_IMPLEMENTATION_REPORT.md). No purchase activation, deployment, persistent migration or provider operation was performed or authorized.
