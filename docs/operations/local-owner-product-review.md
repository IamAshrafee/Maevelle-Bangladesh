# Local Owner Product Review

Use the local Caddy site at `http://127.0.0.1:8080`. This is a human visual and usability review; automated checks do not mark these items complete.

## Admin

- [ ] Dashboard and attention queues are clear.
- [ ] Products: create/edit, variants, media, sizing, pricing, inventory, and publish.
- [ ] Orders, payments, fulfillment, and delivery form one understandable workflow.
- [ ] Customers and their related orders are easy to reach.
- [ ] Supply: suppliers, purchases, inbound shipments, receiving, landed cost, and costing use names/references instead of internal IDs.
- [ ] Returns and RTO actions are understandable and appropriately guarded.
- [ ] Finance, analytics, team, integrations, and settings show useful empty/error states.

## Storefront

- [ ] Homepage hierarchy, imagery, navigation, and merchandising feel appropriate for Maevelle.
- [ ] Search supports exact, partial, typo, and no-result recovery.
- [ ] Category filters, sorting, chips, pagination, and the mobile filter drawer are usable.
- [ ] Product page gallery, color/size selection, size guide, availability, reviews, and Add to Bag are clear.
- [ ] Cart handles quantity, removal, promotions, price/stock changes, and empty state clearly.
- [ ] Checkout contact, address, delivery, payment, summary, errors, and duplicate-submit protection feel trustworthy.
- [ ] Confirmation and secure tracking explain what happens next without exposing internal data.
- [ ] Review submission, policies, missing pages, and error recovery are consistent.
- [ ] Check narrow mobile widths (320, 375, 390, and 430 px), tablet (768 px), and desktop (1280–1440 px) for clipping or awkward spacing.

## Cross-surface scenario

- [ ] Admin publishes a realistic product with variants, media, sizing, price, and stock.
- [ ] Storefront discovers it, selects a valid variant, adds it to cart, and places a test order.
- [ ] Admin processes payment/fulfillment/delivery; Storefront tracking reflects the change.
- [ ] A return/refund/finance path behaves consistently when exercised.
- [ ] An eligible review can be submitted, moderated, and displayed publicly.

Record findings separately with route, device width, expected result, actual result, and severity. Do not use production data or provider operations.
