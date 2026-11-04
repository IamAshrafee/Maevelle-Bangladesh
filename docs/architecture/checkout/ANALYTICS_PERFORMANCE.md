# Analytics, SEO, performance and reliability

Audit E25–E32 distinguishes existing consent/outbox/reporting infrastructure from unverified Checkout vendor integrations. R: reuse it. Transaction facts remain Orders/Payments/Finance authority; behavioral events are untrusted observations. No Checkout availability gate may fabricate conversions.

## Event contract and conversion policy

Every event: schema version, stable event ID, tenant internally, aggregate ID/revision for domain facts, occurred-at server time, source kind/method, currency and exact amount snapshot where appropriate, consent/attribution policy version where exported. No name, phone, email, street, bearer, transaction reference or screenshot in behavioral payloads. Canonical identifiers reuse `commerce-item.ts` SKU/variant mapping; verify catalog feed identifiers before Meta activation.

| Event | Producer / deduplication / meaning |
| --- | --- |
| Checkout started | Domain draft-created fact once per real initiation; browser page-visible interaction separately consented. Failed initiation isn't started. |
| Shipping information accepted | Server accepted draft revision; browser interaction links it. Dedup by draft+revision, not keystroke. |
| Payment method selected | Accepted method change/revision; not receipt/payment completion. |
| Quote changed/expired | Domain quote revision transition or observed expiry, stable draft+quote+reason fact; no repeated expiry facts per render. |
| Placement attempted / failed | Correlated submission intent; failure reason category, no raw request. Unknown outcome remains unknown until reconciled, not false failure. Rate-limited abuse belongs to diagnostics, not customer conversion denominator. |
| Order committed | Outbox from placement transaction; unique Order/committed revision fact. This is placed-order volume, not cash received. |
| Manual claim received | Durable claim outbox, unverified. |
| Payment verified/rejected | Payment/claim transition event, independently verified amount only for receipt fact. |
| COD collected | Actual collection/custody fact; settlement separate. |
| Order cancelled / fulfilled | Authoritative Orders/Fulfillment events, no browser inference from timeline view. |
| Refund / adjustment processed | Confirmed semantic completion or compensated correction; requested/unknown not completed refund. |

Internal reports separately show drafts, attempts, committed Orders, outstanding obligations, verified receipts, COD collection, settlement, refunds and Finance-realized revenue. Unavailable attribution/consent cohorts are labeled, never backfilled as invented visits. Funnel denominators distinguish source, real initiation and consented observed sessions; do not divide all Order facts by a partial observed denominator and call it global conversion.

R recommended external purchase policy: **one qualified purchase per Order when payment obligation is fully satisfied by verified manual allocations or actual COD collection**. Use a single shared qualification event for GA4 and Meta; no second purchase at remittance/fulfillment. Placed Orders measured separately internally (and optionally a clearly named custom vendor event with approval). This conservative policy reduces unpaid/fake COD conversions but delays ad signals; owner can choose committed-Order conversion instead only as an explicit documented policy applied consistently, never a mix by refresh or payment method. Finance revenue remains separate whichever marketing policy is approved (D06).

GA4 mapping: eligible started→`begin_checkout`; accepted delivery→`add_shipping_info`; selected method→`add_payment_info`; qualified fact→`purchase`; actual refund→`refund` referencing original transaction. Use stable opaque tenant-safe transaction ID, item IDs/quantities/discounts, BDT currency and provider-appropriate numeric conversion **at adapter boundary only**. Follow official ecommerce field semantics: GA4 value is item value excluding separately reported tax/shipping; don't send total payable as merchandise value. Payment amount, merchandise net, shipping, tax and rounding remain independently auditable. Cancellation of unpaid Order isn't a refund; never invent a native cancellation event supported by neither vendor. Guidance: [Google ecommerce](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce?client_type=gtag&hl=en).

Meta proposed InitiateCheckout on real started intent; Purchase only shared qualification policy. Same canonical event name/ID for browser and server twins; stable event ID persisted before export, reused across retries, refresh and Worker replay. Same pixel/dataset destination identity must match. Prefer server authoritative Purchase; browser twin only if actually needed and same persisted ID. No relying solely on vendor deduplication: unique local `(tenant,destination,event_id,event_name)` receipt and bounded outbox export state. Current official Meta dedup page was rate limited; exact supported version, event-time/dedup limits and delayed-COD suitability must be verified before implementation activation. No invented backdating to evade vendor windows.

Export after commit via existing Worker, nonblocking for checkout. Capture necessary consent/attribution only with permission; check current consent/withdrawal and destination policy again before send. Marketing consent separate from essential operational records. No hashed PII sharing without explicit approved basis; hashing doesn't make personal data anonymous. Keep vendor destinations inactive until privacy approval and provider test evidence. Retry/backoff, bounded age, dead-letter reason and safe operator replay; unsupported/expired attribution is “not sent,” not fake provider acceptance.

## SEO and privacy

Preserve existing noindex metadata and sitemap exclusion for Checkout/Orders/account/private status. Set private no-store at Next fetch/render, API and proxy; no shared-CDN caching. Dynamic private pages must not statically embed one shopper's data. `noindex`/robots isn't authorization. Use Referrer-Policy no-referrer on token exchange/private confirmation, remove fragments after exchange and avoid PII in paths/query/title/analytics. No third-party marketing scripts on sensitive grant exchange. Preserve indexable PDP canonical/product JSON-LD and public product cache behavior; keep Checkout JavaScript route-local.

## Proposed engineering targets, not measurements

Targets assume approved representative synthetic data, warmed services and documented regional client profile. Treat failures as evidence to optimize, not reason to lower correctness.

| Target | Initial objective / measurement |
| --- | --- |
| Mobile experience | p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at 390px under defined mid-tier mobile/network profile; lab results distinct from eventual field RUM |
| Checkout private bootstrap | API p95 ≤400ms server-side; quote p95 ≤300ms at 20 lines, excluding client/network; record p99 and pool wait |
| Placement | p95 ≤750ms server-side normal non-contention; DB transaction p95 ≤500ms; no provider requests in transaction; report lock wait separately |
| Boundaries | Initial transaction lock timeout 1s, request/statement budgets bounded and tuned from tests; max two internal whole-transaction retries with jitter for recognized deadlock/serialization failure, never new intent key |
| Client JavaScript | Incremental route-specific compressed JS target ≤80 KiB beyond shared shell; measure built output before accepting; one mounted form and narrow client controller |
| Reads | Batched catalog/pricing/geography/availability reads; no linear per-line SELECT waterfall. Track query count vs 1/10/20/maximum lines; writes may scale with normalized snapshots but should batch where safe |
| Worker | Under expected load outbox age p95 <30s, alert >2m; expired unpaid Orders processed within 60s of due under healthy Worker. UI expiry uses DB deadline even when Worker delayed |
| Operations | Alerts: payment-review SLA breach, unallocated cash, stock conservation, lock waits/deadlocks, receipt conflicts, queue poison and 429/503 surge; no PII labels |

No current Checkout performance benchmark or bundle measurement ran in Phase 00. Existing Cart database timings are not Checkout capacity proof.

## Reliability and load acceptance

Use existing PostgreSQL/API/Worker; scoped indexes, caps and pagination before new infra. Server initial restore fetch can run independent config/status reads in parallel; avoid contact→address→method→refresh waterfalls. New section-save API returns fresh revision/quote eligibility. Area search bounded, debounce/cancel old requests, cache only public geography per version. Private quote/draft is no-store; immutable public catalog can keep current cache strategy.

Local isolated synthetic harness: 1) 50 simultaneous same-key and different-key submissions for one Checkout, assert one Order; 2) 100 contenders for one unit, one winner/no negative balance; 3) reverse 20-line item ordering plus Cart edits, coupon cap and price/rate writer races; 4) mixed 10/25/50 concurrent shoppers with quotes/placements/status and actual Worker projection, record throughput/latency/locks/pool/CPU; 5) kill Worker/DB connection around commit, resume receipts/events; 6) simulate slow network/offline/reload on real UI. Verify all authoritative totals, stock and event counts after drain, not just HTTP success rates.

Scale targets must be agreed against expected traffic before capacity claim. Run harness only against an explicitly isolated disposable target, never a discovered default/production URL. Staging is shared-host development infrastructure: no live load or host changes without separate authorization. Use existing tracing/request IDs and structured safe errors; sample query plans on representative data and verify indexes rather than guessing.
