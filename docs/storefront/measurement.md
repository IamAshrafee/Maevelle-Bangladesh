# Commerce Measurement Foundation

Maevelle components emit one semantic commerce event. Consent-aware adapters later translate that event for internal analytics, GA4, Meta browser tracking, and a durable server pipeline. No feature component calls a vendor SDK directly.

The shared contract in `@maevelle/contracts` defines the versioned event envelope, consent, attribution, item identity, and taxonomy. Browser creation/hand-off is in `apps/storefront/lib/analytics`; vendor adapters are intentionally not activated in this foundation task.

## Event ownership

- Browser interaction: `PRODUCT_VIEWED`, `PRODUCT_LIST_VIEWED`, `PRODUCT_SELECTED`, `VARIANT_SELECTED`, `SIZE_GUIDE_OPENED`, `ADD_TO_CART`, `REMOVE_FROM_CART`, `VIEW_CART`, and checkout-step interactions.
- Authoritative server/domain truth: `ORDER_PLACED`, `PAYMENT_CONFIRMED`, `ORDER_DELIVERED`, `ORDER_CANCELLED`, and `REFUND_COMPLETED`.
- Browser events are best-effort observations. Conversion truth never depends on a thank-you page loading.
- Future server destinations consume the existing transactional outbox in an independent analytics worker/consumer. Vendor HTTP calls never run inside Order, Payment, Delivery, or Refund transactions.

## Identity mapping

| Consumer | Identifier |
| --- | --- |
| Internal product analysis | immutable parent `productId` plus sellable `skuId` |
| GA4 `item_id` | immutable `skuId` |
| Meta `content_ids` | immutable `skuId` |
| Google Merchant offer ID | immutable `skuId` |
| Order line merchandise identity | backend variant/`skuId` |
| Inventory | backend variant/`skuId` |
| Human operations | SKU code alongside immutable ID |

`productGroupId` and `presentationVariantId` are optional, explicit fields. They must not be guessed from titles, slugs, colors, or SKU strings. Later Catalog/PDP work will populate them when authoritative ProductGroup/presentation-group contracts exist. Title or handle changes therefore do not reset analytics identity.

## Event ID and retries

`eventId` belongs to the logical intent, not an adapter attempt. Browser and server copies of the same Meta-eligible logical event reuse that ID. A mutation that needs browser/server deduplication must generate the ID before the request, send it with the command, persist it with the authoritative event/outbox record, and return/reuse it for the browser copy. Server-only conversions derive a stable ID from the immutable outbox/business event. Adapter retries reuse the stored event ID; they never generate a new conversion ID.

## Consent and attribution

Consent categories are necessary, analytics, marketing, and preferences. Optional categories default to `UNKNOWN`, not granted. Server-side delivery obeys the same consent snapshot as the browser. The final consent UI/storage mechanism is later work.

Attribution stores only purposeful campaign fields: source, medium, campaign, content, referrer origin, and touch classification. First touch, current session, and last non-direct touch must be separately named. Raw URLs, secrets, customer message content, and unnecessary PII do not belong in the event. UTM, `fbclid`, future `fbc`/`fbp`, and similar identifiers never enter canonical URLs or core Order/Customer identity.

## Adapter and performance policy

The browser dispatch channel is failure-isolated and synchronous only to an in-page event bus; commerce does not await a destination. Adapters initialize after consent and critical rendering, use one GA4 ownership strategy (GTM or direct gtag, never both), and are measured as part of the JavaScript/main-thread budget. Blocked or timed-out vendors do not affect product rendering, Cart, Checkout, Payment, or Order placement.
