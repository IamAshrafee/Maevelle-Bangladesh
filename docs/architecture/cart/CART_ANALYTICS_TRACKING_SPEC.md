# Cart analytics and tracking specification

Existing central browser channel/consent/item identity, internal ingestion dedupe and Wishlist transactional outbox patterns: audit E38–E43. Current GA4/Meta destination APIs explicitly say unconfigured/NOT_ACTIVE. No live Pixel/CAPI/GA4 Cart delivery was verified. Meta messaging integrations are not Conversions API delivery.

## Event ownership and taxonomy

| Event | Owner / timing | Semantics and external mapping |
| --- | --- | --- |
| cart.created | Cart transaction once row created by intent | Necessary operational outcome, not add |
| cart.item.added | Cart transaction, successful positive incremental add | Added delta only; consented ADD_TO_CART → GA4 add_to_cart / Meta AddToCart |
| cart.quantity.increased/decreased | Cart transaction, desired set delta vs confirmed previous | Positive delta maps add, negative absolute delta maps remove; no event for no-op |
| cart.item.removed | Cart transaction, actual removed quantity | GA4 remove_from_cart with absolute removed units; Meta no invented standard remove conversion |
| cart.variant.changed | Cart transaction, atomic old/new intent | Domain-specific; do not automatically count as new customer add; reporting separate variant transfer |
| cart.cleared | Cart transaction with removed-line delta snapshot | One outcome with individual removed units; GA4 one remove event with items if consented |
| cart.restored / cart.merged | Cart transaction / explicit restore outcome | No ADD mapping for restored or merged quantities |
| cart.reconciliation.failed / cart.validation.failed | Safe bounded command failure diagnostics, outside rolled-back transaction where needed | Not successful analytics; no private content/capability |
| cart.promotion.applied/rejected/removed | Cart command/evaluation outcome | Applied requires actual eligibility benefit; no conversion mapping |
| CART_VIEWED observation | Browser genuine visible open/navigation, consented ingestion | GA4 view_cart; no Meta custom purchase-like event |

Minimal necessary operational outcome includes event UUID, org, cart aggregate/version, timestamp, operation/source, variant/product refs and quantities/money needed for diagnostics/projection, never token/email/phone/account ID/IP/raw contents. Persist in same transaction as mutation/receipt; publishers/projectors handle at-least-once and dedupe by org/event. Privacy/legal review must confirm lawful aggregate behavior retention; necessary transactional reliability does not authorize behavioral marketing.

Outcome IDs returned in mutation receipt are stable on replay. Derive a separate stable measurement ID per committed delta where one intent yields multiple commerce observations, linked to canonical outcome. Store event ID with canonical delta/currency/price at commit, not reconstructed from current view. Browser cannot invent authoritative successful add by submitting an event. If existing generic analytics accepts ADD_TO_CART observations, mark them untrusted/legacy and exclude from new authoritative demand projections. Keep observation and domain-outcome channels distinguishable.

## GA4 mapping

Official [GA4 ecommerce guide](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce) was consulted 2026-11-02 for Cart event names and item payloads. `add_to_cart` uses added units, `remove_from_cart` uses removed absolute units, `view_cart` uses current eligible visible merchandise. Preserve existing variant UUID as `item_id`; product UUID is grouping metadata, SKU text is separate, item_variant describes options. `currency=BDT`, quantity integer, price is per-unit net merchandise price after allocated item discount; discount separately represented where appropriate, value equals sum(price × delta quantity), excludes delivery/tax. Decimal4 converted to provider numeric format only at adapter boundary with tested deterministic rounding; do not feed conversion back into Cart.

Use a single authoritative GA4 delivery path per event (recommended receipt-backed browser adapter for storefront Cart observations initially); provider does not gain generic exactly-once merely from arbitrary event_id. Keep an internal delivery ledger and dispatch guard, prevent repeated renders/replayed outcomes sending again. If later Measurement Protocol delivery is chosen, move that event ownership from browser to server explicitly; never send both casually assuming deduplication. Provider retry uncertainty must remain visible in diagnostics. Reserve begin_checkout/purchase for real future Checkout/Orders; Cart never emits them.

## Meta Pixel + Conversions API design

Proposed mapping: positive explicit committed add delta → `AddToCart`, `content_type=product`, content_ids = variant UUIDs matching existing merchant identity, contents with id/quantity/item_price, value sum of net added merchandise, currency BDT. Pixel `{eventID}` and CAPI `event_id` share identical canonical measurement ID and `event_name=AddToCart` for same destination dataset. CAPI server owns delivery record/outbox, original occurrence time, action_source website and canonical nonprivate source URL. No query/share tokens or private cart identifier in source URL. No email/phone hashes, raw IP/user-agent, fbp/fbc or account IDs without explicitly approved purpose, consent and documented provider requirements; if required permitted fields unavailable, do not send a malformed event.

**Primary-source limitation:** official [Meta deduplication page](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/) returned HTTP 429 during Phase00; no third-party substitute is treated as verified authority. Shared name/ID mapping above is a proposed contract. Current API version, supported event time/retry window, matching/privacy parameters, deduplication semantics and Events Manager validation must be rechecked against accessible current official Meta documentation in 05A before configuring dependencies or enabling delivery. This blocks Meta activation acceptance, not core Cart implementation. Never pin a remembered API version or claim live dedupe verified.

## Consent and delivery

Analytics UNKNOWN/DENIED: no behavioral ingestion/GA4. Marketing UNKNOWN/DENIED: no Pixel/CAPI or vendor script. Existing consent save path grants analytics only and forces marketing denied; Phase05 must extend the shared consent UI and server evidence contract deliberately rather than silently enabling marketing. Purpose decisions, recordedAt/policy version and withdrawal must be reflected on capture and again before dispatch. Do not backfill pre-consent adds after a later grant. Stop pending provider deliveries on withdrawal; in-flight requests cannot be recalled, and that residual exposure must be documented.

Server-side consent cannot trust arbitrary client claims as legal evidence. Use validated versioned consent context and documented session binding; no user fingerprinting. Necessary cookies preserve Cart without marketing consent. External provider delivery remains opt-in/configuration-gated and environment-isolated. Transport retries keep event ID, destination and occurrence time; exponential backoff with jitter/attempt and age caps set to verified provider policy, dead-letter redrive only within safe window and permission. No synchronous provider call in Cart transaction or response path.

## Metrics and operational definitions

Active Cart = ACTIVE, unexpired, last explicit activity within 7 days, separately show empty/populated. Current intent value is an as-of snapshot estimate, not revenue; eligible value separated from blocked intent. Add count = unique committed positive explicit add/set-increase intent outcomes; add units = summed deltas. Remove units include explicit decreases/clear, merges excluded. Report product/variant/time/source and guest/account aggregate segments; shopper behavioral segmentation only with approved basis. Conversion rates stay unavailable until real downstream events and defensible denominators exist. Consent-limited views never masquerade as all shoppers.

Expose outbox age, pending/dead letters, attempt/error categories, reconciliation discrepancies, provider disabled reason, snapshot as_of/policy version, no high-cardinality token/account labels. Projector rebuild uses unique event IDs/watermark and bounded jobs; no duplicate add on rebuild/retry. Default privacy proposal: raw outcomes 30 days, aggregates 13 months, small cohort suppression <5; pending approval. S40–S43 and S48 require synthetic delivery/dedupe/consent withdrawal tests plus real provider test-mode verification when separately authorized; no production tracking activation in this phase.
