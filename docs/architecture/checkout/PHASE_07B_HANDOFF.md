# Checkout Phase 07B handoff

Phase 07A is **PARTIAL locally**. This handoff does not authorize Phase 07B, public tracking, purchasing, collection or deployment. Read [the implementation report](PHASE_07A_IMPLEMENTATION_REPORT.md) and retain every earlier PARTIAL/browser/human acceptance gate.

## Implemented contracts

| Interface | Current behavior |
| --- | --- |
| `@maevelle/contracts` commerce names/query types | Version-1 server fact taxonomy and `CommerceMeasurementQueryDto` |
| `GET /admin/analytics/commerce` | Existing API prefix; both `analytics.view` and `analytics.financial.view` required in the same organization. Query: from/to, optional currency and BUSINESS/SYNTHETIC/UNCLASSIFIED trafficClass. Private/no-store aggregate response. No event/entity details endpoint. |
| `POST /storefront/v1/analytics/events` | Existing observation endpoint; BROWSER only, strict specialized Cart/Wishlist contracts, generic UUID/quantity minimization, 16 KiB general body cap, real-app origin and 120/minute protection. It rejects authoritative Order/payment/refund names. |
| `getCommerceConsent(db, subject)` | Trusted server port, not HTTP. Subject: organizationId, opaque subjectId, SESSION or ACCOUNT. Returns purpose records, missingDecision UNKNOWN and externalDispatchEnabled false. |
| `setCommerceConsent(db, subject, input)` | Trusted server port, not HTTP. Input: ANALYTICS/ADVERTISING purpose, decision, policyVersion, expectedRevision decimal string, expiresAt Date. Revision 0 creates; later writes use exact revision. Conflict throws CONSENT_REVISION_CONFLICT. DB bounds expiry to 180 days. |
| `processCommerceAnalyticsOutbox` | Existing Worker invokes the internal consumer; never call from a confirmation render to synthesize conversions. |
| `queueCommerceTestDelivery` / `dispatchCommerceTestDeliveries` | Trusted synthetic-only test harness ports. No browser endpoint, vendor HTTP transport or automatically running fake dispatcher. |

`CommerceConsentSubject` is an internal context, not a browser request DTO. Do not trust client-selected tenant, account, subject or source event IDs. There is currently **no Storefront HTTP consent read/write API** and no authenticated linkage between a commercial event and a preference subject. These require an explicit secure transport/lifecycle implementation before server consent controls can be integrated. Do not invent an endpoint in frontend code or treat current localStorage as server authority.

## Frontend work and safe observations

Reuse `lib/analytics`, its existing transport, consent state and Cart/Wishlist validators. Do not add direct GA4/Meta calls or another event bus. Generic observation storage now discards names/labels, free text, client money and attribution. Generic cart/list/product reference fields must be UUIDs; do not submit arbitrary labels or raw URLs as list IDs.

Product interest, Add/Remove, Cart visibility, actual Checkout initiation and accepted shipping/payment-step interactions are observations only. Any new delivery/review/final-term/placement-attempt UI event needs a precise versioned allowlist, bounded payload, origin/rate/privacy checks and a clear denominator. The current taxonomy does not make every potential event available. Failed POLICY_BLOCKED initiation/placement is not customer abandonment. A quote acknowledgement is not an Order or payment.

Confirmation reload must not send ORDER_PLACED, PAYMENT_CONFIRMED or REFUND_COMPLETED. Actual Order, receipt, COD, refund and reversal facts already originate from owning transactions. Reuse existing committed Order/payment views for customer status; never create verified-money telemetry from a claim form, toast or wallet instruction display. Do not expose a guest grant or internal event ID for tracking.

## Consent and preference experience prerequisites

Keep optional purposes UNKNOWN by default and offer independent analytics and advertising choices. Denial must preserve browsing, Checkout, support and essential records. Give equally usable accept/decline controls, a persistent preference entry point, clear purposes and policy version, explicit save/loading/error/conflict feedback and reliable withdrawal. Do not silently migrate an old browser consent format into an advertising grant.

Before UI binding, establish trusted same-device preference ownership, account/session transitions, expiry and cross-device policy, origin/CSRF protection, durable request limits and safe response/error envelopes. A login must not grant advertising or overwrite a stricter current refusal. Use the internal revision port to prevent stale tabs from overwriting withdrawal. Do not submit account IDs or copy browser-generated identity into commerce source records.

On withdrawal, immediately stop optional browser dispatch/retries and update trusted server state once that transport exists. Queued server events must be checked again. Grant after an event does not authorize retroactive export; withdrawal/regrant invalidates an older queued revision. Essential Order/Payment/Finance records remain. Explain that an already received vendor event cannot be technically undone without a supported remediation process.

## Provider qualification and deduplication

GA4/Meta and advanced matching remain disabled in `unapproved-v1`; DB delivery destination is TEST only. No live payload adapter, destination credentials or purchase-policy approval exists. The recommended first-satisfaction policy is a proposal. Resolve zero Orders, late funds, partial/excess receipt/refund allocation, reversals, amendments and delayed COD/custody/settlement before approval.

GA4 mappings must follow current official ecommerce semantics: `begin_checkout`, `add_shipping_info`, `add_payment_info`, qualified `purchase`, actual completed `refund`. Merchandise value is distinct from payable, receipt amount, shipping, tax and fees. Derive line/item and refund values from owning immutable snapshots/allocations; do not invent omitted amounts or convert internal money to Number. Document bounded adapter-only conversion when approved.

Meta's official documentation returned HTTP 429 during 07A. Verify the supported API, accepted fields, event-time limits, matching/consent requirements and browser/server dedup contract before implementing its adapter. Do not activate advanced matching or transmit hashed shopper PII.

If intentional twins are later approved, resolve a single persisted qualification and **destination-scoped** opaque identity. Browser/server canonical names and destination must agree. Reuse the same ID across response loss/retries/reload. Use a separately scoped Order conversion reference for GA4 refunds. Never use an external payment Transaction ID, guest grant, account ID or universal cross-vendor identifier. No shopper qualification/identity endpoint exists yet. Local deduplication does not prove vendor exactly-once behavior.

## Debug, browser and activation acceptance

Use random disposable database/organization fixtures explicitly classified SYNTHETIC. The report defaults to BUSINESS and excludes unclassified activity. Fake queues require event-time and current consent and expire after one day. The fake payload is exactly schemaVersion/eventId/name/occurredAt/currency/amount; it is not a vendor payload template. Keep TEST adapters in controlled code; do not expose public enqueue/debug controls.

Verify consent denial, grant, withdrawal while queued, stale-tab conflicts, account transitions, disabled storage, offline recovery and no retroactive export in real browsers. Verify confirmation reload and uncertain claim recovery without optional conversion. Run privacy canaries through payloads, logs, tracing, browser network/cache/referrers and sensitive URL/grant exchange. Test keyboard/focus, screen readers, touch, native zoom, device and browser breadth. No 07A browser/human evidence closes these gates.

Activation needs explicit privacy/legal and conversion-policy approval, trusted preference binding, approved destination scoping, official provider contract verification, safe test-destination evidence, retained production ingestion/role/rate/retention acceptance, representative load and separately authorized migration/deployment. Public Checkout and payment-provider approvals remain independent. Preserve the migration-byte FAIL, missing generic 3221 upgrade fixture and synthetic-fixture secrets-scanner FAIL; the current Storefront production build PASS does not resolve those failures.
