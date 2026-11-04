# Phase 03A handoff — authoritative inputs, no quote implementation

Phase 02B acceptance is **PARTIAL**; Phase 01B stays **PARTIAL**. This document describes available inputs for a separately authorized immutable-quote assignment. Purchases and production drafts remain disabled. No quote, final charge or placement capability was added.

## Current contracts and authority

Use `packages/contracts/src/checkout.ts`, `checkout-delivery.ts`, [Phase 01A](PHASE_01A_BACKEND_CONTRACT.md) and [Phase 02A](PHASE_02A_BACKEND_CONTRACT.md). The browser is a projection, never the authority for money, ownership, inventory, coverage or configuration.

- `CheckoutDraftDto`: id, implementationVersion 2, root decimal-string revision, ownerKind, ACTIVE/ABANDONED/EXPIRED, expiresAt, currency, sourceReviewRequired, source and lines. CART source binds cartId/cartRevision and line sourceCartLineId; BUY_NOW lines bind variantId/quantity independently of Cart. Revisions and quantities are strings. Refresh/rebind is explicit; no conversion or reservation occurs at draft creation.
- `CheckoutDeliveryStateDto`: draftId and the **same root revision**, normalized purchase-specific delivery including `countryCode:'BD'`, savedAddress id/selectedRevision/CURRENT|CHANGED|REMOVED, eligibility, configurationChanged, reviewRequired, expiry/status, `quoteAvailable:false`, `purchaseAvailable:false`.
- Delivery updates require exactly one of full manual delivery, savedAddressId plus savedAddressRevision, or explicit REVALIDATE. The current root revision is required. Manual input detaches a saved association. CHANGED/REMOVED requires explicit latest selection or manual snapshot acceptance; revalidation must not silently replace it.
- Eligibility has ELIGIBLE/UNSUPPORTED_AREA/DELIVERY_UNAVAILABLE, opaque server-derived configurationRevision, nullable tariff `{ruleId,revision,amount,currency,final:false}`, and courierCompatibility NOT_EVALUATED. Amount and rule revision remain exact strings. Valid zero is zero, never a fallback trigger.
- Guest context plus HttpOnly capability cookie or live shopper cookie/partition remain mandatory. IDs, address IDs, Customer IDs and phone matches do not authorize anything. Use existing semantic boundaries, tenant checks, transaction/session fences, quotas, audit and idempotency, including replay authority verification.

## Quote preconditions and decisions still required

A future server quote must coherently read/revalidate the authorized active unexpired draft, source snapshot/current Cart preconditions, exact variants/quantities, delivery snapshot, selected address association, geography ancestry, delivery-method status and coverage/configuration. Bind the quote to the evaluated root/source/configuration revisions and persist immutable evaluated inputs/components. Reads from separate endpoints are not a transactional quote. Browser cached eligibility is not sufficient.

The configuration fingerprint detects change; it is not a lock or permanent promise. Define a coherent configuration read/write fence or equivalent transaction contract, quote validity/expiry and quote-to-placement revalidation before implementation. Define how an intentional destination/source/configuration change invalidates a quote. Never rewrite a historical quote or Order snapshot following address-book edits.

Orders' existing tariff resolver owns rate selection. Confirmed district-or-finer coverage is separate from the selected rate, and UNVERIFIED/UNSUPPORTED fails closed. Real geography mapping, merchant coverage approval and provider destination compatibility remain unresolved. Broad country/default tariffs do not approve delivery. Do not infer courier ETA, wallet/COD compatibility or guaranteed fulfillment from ELIGIBLE.

Pricing/Promotions must own merchandise prices, discounts and usage semantics; Taxes/shipping/payment policy must be resolved under their actual authoritative domains. Decide exact rounding, currency consistency, discount allocation, shipping/COD fees and policy/version provenance. No JS floating-point total or client-submitted amount can become financial truth. Immutable quotes alone must not allocate inventory, redeem promotions, create payment obligations or place Orders; later placement needs its own transaction/idempotency/stock/payment contracts.

## Client continuity and remaining gates

Phase 02B serializes source/private writes through one controller. Unknown private commands retain exact bodies and keys only in page memory; reload restores current server truth, without automatic submission or reconstructed PII. 409 retains local edits until explicit review, and identity transitions clear private projections/forms and ignore old generations. Future quote work must preserve those properties and avoid PII in URLs, browser storage, telemetry or coordination signals.

Read [02B evidence and acceptance](PHASE_02B_IMPLEMENTATION_REPORT.md) before continuing. Native zoom, human AT/device breadth, exact delayed-response/OS-background browser timing, populated historical receipt and production runtime/ingress remain open alongside all carried-forward Cart/Wishlist/01B gates. This handoff does not authorize deployment, persistent migration, production activation or Phase 03A implementation.
