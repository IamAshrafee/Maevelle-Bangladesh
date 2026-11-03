# Future Checkout handoff contract

Cart must operate independently while Checkout is disabled. No implementation of address collection, order creation, reservation/allocation, tax/delivery quote, payment, COD collection or purchase completion is authorized by Cart planning. Existing Checkout/order code is verified in audit E35–E37; its existence requires compatibility care, not expansion.

## Proposed internal contract

```ts
type CartHandoffSnapshot = {
  organizationId: string; cartId: string;
  owner: { kind: 'GUEST'|'ACCOUNT'; ownerRef: string }; // server-side only
  cartVersion: string; currency: string;
  evaluatedAt: string; calculationFingerprint: string; policyVersion: string;
  lines: readonly {
    cartLineId: string; productId: string; variantId: string; quantity: string;
    unitPrice: string; gross: string; discount: string; net: string;
    priceDefinitionId: string; promotionRevisionIds: readonly string[];
  }[];
  merchandiseGross: string; discountTotal: string; merchandiseNet: string;
  eligible: boolean; reasons: readonly string[];
};
```

Cart application provides tenant/owner-authorized freshly evaluated snapshot; server ownerRef is never sent as a shopper credential. A fingerprint proves comparison to a snapshot, never ownership or permission. Snapshot does not hold stock, promise taxes/delivery, create a Checkout session, authorize a payment or lock prices. Empty, blocked, expired or merged-source Cart produces ineligible reasons.

Future Checkout resolves current shopper/guest authority independently, obtains fresh Cart evaluation, compares accepted version/fingerprint, surfaces changes, and invokes Inventory reservations/Orders/Payments only through their semantic operations. It owns reservation transaction boundary, fresh amount acknowledgement, idempotent order creation, fees/taxes/address and final order snapshot. No trusting client Cart prices or outbox observation as purchase authorization.

## Conversion and races

Future conversion must atomically bind order/checkout accepted Cart revision and mark CONVERTED via a Cart application operation participating in its owning transaction; it cannot direct-write Cart tables as a permanent architecture. Lock relevant Cart row before final validation/conversion and reject competing edits or revise Checkout first. New post-purchase shopping obtains new active Cart; do not erase another device's later edits. Exact replay of placement returns original order outcome, never creates a second conversion. This is a future contract test obligation, not implemented Cart scope.

## Legacy compatibility

`orders/checkout.ts`, `orders/placement.ts`, `orders/delivery-pricing.ts` and types import legacy CartView/getGuestCart and some directly read/write Cart tables. Maintain existing exports/status/fingerprint fields behind a facade during Cart increments. Legacy numeric versions need overflow guard when new DTO uses bigint strings; don't silently Number() unbounded revisions. Existing guest-token routes may access only guest ownership, never make account Cart accessible through claimed guest token. Any incompatible legacy consumer is a named migration dependency, not solved by weakening owner enforcement.

Phase01A adds compatibility contract/compile fixtures; no Cart table removal or Checkout refactor then. Phase02/03 preserve old read shape while account clients use new shared DTO. Existing Storefront Buy Now and /checkout links must be truthfully gated with existing enablement and new readiness in Cart UI work; future separate Checkout project replaces facade consumers with this internal query/semantic conversion contract. Production handoff remains BLOCKED until that separate project's full acceptance.

Acceptance S49–S52: Cart journey works with Checkout off, no reservations/orders/payments created; stale/invalid snapshot fails fresh validation; account/guest isolation preserved; legacy consumers remain compatible. No `begin_checkout`, `purchase`, Meta InitiateCheckout/Purchase emitted by Cart. Checkout readiness means a documented stable boundary and compatibility evidence, never a completed purchase system.

## Phase01A.1 actual legacy adapter

Checkout's eight existing Cart-consuming routes now use shared strict shopper/configured storefront/guest-slot resolution, rather than a separate cookie parser. The existing shopper resolver is passed from auth composition; missing configuration or resolver fails503. Account Cart is409 ACCOUNT_CART_NOT_READY on creation, current read, contact, address, payment-method list/select, refresh and placement. Invalid/expired shopper is401; lookup/mapping failure503. A guest cannot cross configured tenant/currency, use fixed/retired tokens, or resolve ambiguous authorities by guessing. The internal Cart facade also rejects retired hashes.

Existing guest DTO/numeric versions and Checkout business error classifications are retained; selected22 Orders regressions pass. This adapter implements authorization compatibility, not account Cart or Checkout completion. Account-backed Checkout remains controlled unavailable until Phase03 establishes authoritative account Cart persistence and a separately authorized Checkout integration consumes it. Migration3214 is a coordinated writer stop/security cutover, with no old-image rollback. See [compatibility matrix](PHASE_01A1_COMPATIBILITY_MATRIX.md).
