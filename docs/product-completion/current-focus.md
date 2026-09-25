# Current Focus

## Active Area

Commerce: Orders (`/admin/orders`) & Customers (`/admin/customers`)

## Current Status / Substage

`COMMERCE_MODULE_COMPLETION / IMPLEMENTATION_COMPLETE`

## Evidence Already Known

The Orders and Customers modules have been fully transitioned from the initial MVP scaffold into a complete, reliable, production-grade commerce domain:

1. **Schema & Snapshotting**:
   - `orders.order_lines` updated in mutable baseline migration (`1100_orders_checkout_cod.ts`) with `image_url_snapshot text`.
   - Storefront checkout (`placeOrder`) and admin order creation (`createManualOrder`) snapshot the primary image URL at purchase time.
   - Contracts updated across `@maevelle/contracts` for line image thumbnails, delivery pricing rules, public tracking, customer notes, and tag management.

2. **Domain Architecture & God-File Elimination**:
   - `packages/database/src/orders.ts` (formerly 3,428 lines) decomposed into cleanly separated modules under `packages/database/src/orders/`:
     - `types.ts`: typed models, math minor helpers, view contracts, error classes.
     - `delivery-pricing.ts`: precedence quote resolution & rule management.
     - `checkout.ts`: session management, contact & address validation, quote calculation.
     - `queries.ts`: `orderView`, `getOrderForAdmin`, `getOrderForCheckout`, `listOrders`, `getOrderPublicTracking`.
     - `placement.ts`: storefront `placeOrder` with inventory reservation, promotion usage, image URL snapshots, outbox events.
     - `lifecycle.ts`: status transitions (with outbox events for `orders.order.confirmed` and `orders.order.placed_on_hold`), line cancellation, address correction, order cancellation, payment timeout expiration, notes, resume, and auto-completion.
     - `manual.ts`: manual order creation with catalog pricing, reason validation, image URL snapshots, inventory reservation, and outbox events.
     - `outbox.ts`: event consumer for auto-completing orders upon delivery.
     - `index.ts`: re-exports all functions and types.
   - `packages/database/src/orders.ts` re-exports from `orders/index.js`, preserving 100% backward compatibility for all existing imports.

3. **API Routing & Separation of Concerns**:
   - Extracted payment & refund endpoints from `apps/api/src/routes/orders.ts` into a dedicated `apps/api/src/routes/payments.ts` module registered via `apps/api/src/routes/auth.ts`.
   - Added public order tracking endpoint `POST /storefront/v1/orders/track` calling `getOrderPublicTracking`.

4. **Storefront & Admin Experience**:
   - Storefront Confirmation (`/orders/confirmation`): Fixed totals breakdown to properly display `deliveryAmount`, discounts, and `order.total` instead of `merchandiseNet`; rendered line item image thumbnails; linked directly to order tracking with query parameters.
   - Storefront Order Tracker (`/orders/track`): Added public lookup by Order Number + Phone Number; renders full stepper timeline, carrier details, tracking references, and financial breakdown.
   - Admin Customer Console (`/admin/customers/[id]`): Added `AddNoteDialog` and `ManageTagsDialog` (supporting toggle assignment and on-the-fly tag creation).
   - Admin Order Detail (`/admin/orders/[id]`): Renders line item image thumbnails and variant titles in the items table.
   - Admin Listings (`/admin/orders` and `/admin/customers`): Added CSV Export buttons supporting filtered exports.

## Immediate Objective

Owner visual review of customer note/tag dialogs, public order tracking, and CSV exports; Docker database baseline reload if running local database instance.

## Last Completed Action

All focused test suites (`orders.test.ts`, `customers.test.ts`) and TypeScript checks across `@maevelle/database`, `@maevelle/contracts`, `apps/api`, `apps/storefront`, and `apps/admin` passed with zero errors.
