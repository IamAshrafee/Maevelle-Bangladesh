# Master specification and domain architecture

R: build a modular Checkout capability inside the existing API/database/Worker deployment. There is no evidence that a new microservice, broker, cache, database or payment gateway is justified. Source evidence IDs refer to [the audit](REPOSITORY_AUDIT.md). All behavior below is proposed unless explicitly marked V.

## Non-negotiable product invariants

1. Guest purchase requires no registration. Name, mobile, deliverable address and payment choice are sufficient unless a demonstrated legal/courier requirement adds a field.
2. Buy Now consumes a selected variant and quantity without reading, modifying, merging or converting the existing Bag. Cart checkout consumes exactly a freshly validated complete Bag revision.
3. A quote is a comparison and acknowledgement object, never proof of ownership, payment, or reserved inventory. No inventory hold while merely filling a form.
4. Only authoritative server calculation supplies amounts. Any changed monetary total, items, destination, promotion eligibility or payment destination requires a new quote/review before submission.
5. One Checkout can commit at most one Order across all keys/devices. One submission intent replays one durable outcome. A network timeout means unknown outcome, never success or definite failure.
6. Orders, payment obligations, cash receipts, fulfillment, courier settlement and refunds remain separate facts. COD placement is an unpaid obligation; a manual claim is unverified evidence.
7. Inventory and financial side effects, Cart conversion, receipt, audit and outbox commit together in the local placement transaction. External deliveries happen after commit.
8. Every private read/write validates configured tenant and current owner/grant. A customer-entered phone never grants access to a Customer profile, saved addresses or historic Orders.
9. Guest/account transitions are explicit. No automatic merge, silent owner reassignment, or exposing a prior account's form through browser state.
10. Existing Orders remain processable during replacement. Destination compromise, late payment, timeout, wrong account and lost response all have recovery paths.

## Domain ownership

| Domain | Authority | Checkout use / prohibited duplication |
| --- | --- | --- |
| Cart | Guest/account item intent, owner binding, merge, revision, semantic conversion | Query owner-authorized snapshot, convert accepted revision in same transaction; no direct Cart table updates |
| Catalog | Variant/product identity, publication, eligibility, media | Query batch eligibility; never infer sale permission from cached PDP |
| Pricing / Promotions | Price definitions, revisions, stacking, limits, redemption and allocations | Common evaluator for Cart and Buy Now; do not reproduce discount formulas in Checkout |
| Inventory | Physical condition/location balances, available-to-sell, reservation/allocation/consumption/release | Transaction-aware batch allocation API; no Checkout stock ledger |
| Checkout | Purchase-source intent, current draft revision, quote orchestration, acknowledgements, placement coordination | Stores intended items and snapshots, no authoritative stock/cash balances |
| Orders | Commercial contract, immutable snapshots, business status, correction/cancellation/fulfillment eligibility | Create through one transaction-aware application operation used by Checkout and compatible Admin workflows |
| Payments | Methods, destinations, obligations, claims, verified receipt identity, allocations/refunds, COD collection | Never interpret screenshot/reference as funds received; Finance owns postings |
| Finance | Accounts/postings, cash custody and settlement/reconciliation | Payments/Delivery invoke established semantic postings, no parallel Checkout ledger |
| Delivery | Geography serviceability, shopper tariff ownership facade, courier mappings/bookings/events | Existing tariffs remain authoritative even while physically in Orders; customer tariff and carrier expense separate |
| Customers | Customer identity records, restrictions, addresses and account associations | Auth account mapping selects profile; guest identity resolution cannot authorize account data |
| Shopper Auth / IAM | Session identity/realm, owner partition; Admin capability/organization | Checkout enforces permission beyond identity; Admin authentication never substitutes shopper authority |
| Notifications | Communication policy/templates and intent delivery | Consume outbox after commit; failures never undo Order |
| Analytics | Derived facts and consented interaction measurement | No write authority over Order/Payment/Inventory; no fake success |

## One initiation model, two sources

`source = {kind: CART, cartId, acceptedCartRevision} | {kind: BUY_NOW, variantId, quantity}`. Tenant, currency and owner are resolved server-side. Client source IDs are references, never authority. Reject multiple sources and client amounts/product metadata.

Cart initiation obtains current owner-authorized active Bag; reject empty, expired, merged or converted intent and return actionable eligibility issues. Store line identities, quantities, source revision and calculation fingerprint. Do not clear the Bag at initiation, quote or failed submission. At placement lock the Cart, re-evaluate and compare; stale Cart requires explicit review. Successful conversion calls Cart's semantic operation with the same transaction and accepted revision. Later shopping obtains a new active Bag; never delete another tab's later edits. No selected-line Cart checkout is introduced initially: it increases partial-conversion complexity without a requirement.

Buy Now validates the chosen active, published sellable variant and bounded whole quantity. Store its own Checkout lines. Reuse Pricing/Promotions evaluation for those lines without synthesizing a hidden Cart. A failed Buy Now leaves Bag and inventory untouched. Editing variant/quantity in Checkout increments draft revision and invalidates quote. Support the same coupon rules where eligible; do not inherit unrelated Bag coupons silently.

Admin manual Orders, messaging Orders and courier actions already exist (E09/E24); retain their semantic operations outside this shopper source architecture. No new quick-order, upsell or abandoned-checkout campaign workflow is needed.

## Owner and session lifecycle

Guest draft: opaque server-generated capability with at least 256 bits entropy, hash at rest, Secure/HttpOnly/host-only/Lax production cookie; never use draft UUID or phone as bearer. Multiple Checkout IDs may share a narrowly scoped guest browser principal, so tabs don't overwrite one `current` authority. Apply bounded active-draft creation and expiry. Do not reuse Cart bearer as the only Checkout authority.

Account draft: `(organization_id, customer_account_id)` via live shopper session and authoritative mapping. Request carries opaque partition/version expectation to detect owner change, but the partition isn't a credential. Check account active state and restrictions on every operation. Rotate guest capability on explicit guest-to-account adoption. Adoption verifies both authorities, locks draft and ownership, rejects committed/expired drafts and invalidates old guest grant. Cart merge stays in Cart's explicit review flow; adopting Checkout never merges Bag contents.

Signing out expires account access in UI and server. Clear owner-bound in-memory state immediately, cancel pending fetches, reject stale results and stale commands. Show “Sign in again” or an explicit fresh guest checkout action; do not copy private saved addresses into guest state automatically. Account A→B cannot reveal A's draft, receipts or Order grant. Auth revocation and placement require a common local fence; linearization is specified in the transaction document. A commit that won before logout remains a real Order, discoverable only by its authorized owner.

Guest recovery: separate read-status grant bound to one committed Order and tenant, with revocation, expiry and limited DTO. Confirmation grant lifetime is independent of draft TTL. Cross-device recovery requires a verified channel challenge or staff-assisted independent identity checks; order number + phone alone never discloses full status/customer details. Grant links exchange a fragment-carried token via same-origin POST, then remove fragment and use secure cookie; prevent referrer/log capture and third-party scripts on exchange. No sending links is authorized in Phase 00. Delivery setup and challenge implementation are explicit dependencies.

## Draft and quote lifecycle

Draft states: `ACTIVE → NEEDS_REVIEW → ACTIVE`, `ACTIVE/NEEDS_REVIEW → COMMITTED`, `ACTIVE/NEEDS_REVIEW → EXPIRED/ABANDONED`. `COMMITTED` always links exactly one Order; it cannot be edited or converted again. Read results derive expiry from database time even before Worker marks it. Cleanup never destroys committed-order receipt recovery.

Quote is immutable per revision: source version, validated lines/prices/discount allocations, address/geography/tariff revision, payment method/destination revision, policy/tax treatment, currency, rounded payable, evaluated/expiry times and fingerprint. Changing any bound field invalidates it. Quote validity does not promise stock or a price hold. Final evaluation must exactly match accepted quote; lower price also requires clear acknowledgement rather than silently changing what was accepted.

B/O: draft lifetime, quote lifetime and retention require owner approval informed by observed shopper completion, price/config churn and support needs. Existing one-hour draft (E07) is a compatibility value, not a new business mandate. Initial development can use explicit fixture policies; production enabling requires approved values. Expired draft offers “Review items again” with fresh prices and no inherited reservation.

## Decisions and rejected alternatives

| Decision | Rationale / alternative |
| --- | --- |
| Create Order before showing manual transfer instructions | Gives durable reference, exact amount, destination snapshot and stock allocation. Reject “send money first then try to create Order,” which can leave unassociated money and no stock. |
| Reserve on committed Order, for both methods | Reuses inventory semantics and avoids draft-hoarding. Manual hold duration follows approved payment/review policies; COD is a real unpaid Order, not a timed gateway session. |
| Require re-review when source/config changes | Avoids silent price/delivery/destination substitution. A fingerprint alone is insufficient: owner and draft revisions are also bound. |
| No forced mobile OTP on every normal guest purchase | Keeps common journey simple. Use risk-adaptive challenge/manual review for abuse; verified recovery still requires proof. Mandatory OTP can be selected later with evidence of benefit and provider readiness. |
| Retain current Orders statuses | `PENDING/CONFIRMED/ON_HOLD/COMPLETED/CANCELLED` already serve operations. Add Checkout lifecycle and payment projections without one giant combined status enum. |
| No gateway now | Typed Payments adapter interfaces for future initiation/status/webhook/refund can reuse obligations, receipts and outbox. Provider calls and ambiguous outcomes stay outside DB transactions. |

Exact [API/transaction](DATA_TRANSACTIONS_API.md), [payment policies](PAYMENTS_AND_BUSINESS_RULES.md), [UX](UX_AND_OPERATIONS.md) and [scenario gates](SCENARIO_ACCEPTANCE_REGISTER.md) govern implementation details.
