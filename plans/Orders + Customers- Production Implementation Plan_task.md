# Orders + Customers Implementation — Task Tracker

## Phase 1 — Foundation: Database Schema
- [ ] Edit `1100_orders_checkout_cod.ts`: fix payment_method constraint, delivery_amount constraint, add order_notes, add order_completion_events, add orders.create capability
- [ ] Edit `0700_customers.ts`: add customer_notes, customer_tags, customer_tag_assignments
- [ ] Rebuild local DB
- [ ] Verify migrations compile (tsc)

## Phase 2 — Domain: Orders Backend
- [ ] Rewrite `listOrders` with pagination, inline payment summary, alias-aware customerId filter
- [ ] Extend `getOrderDetail` (notes, timeline, fulfillments, deliveries, returns, refunds in parallel)
- [ ] Add `addOrderNote`
- [ ] Add `completeOrder` (idempotent, all-lines-delivered guard)
- [ ] Add `resumeOrderFromHold`
- [ ] Add `createManualOrder` (all business rules from plan)
- [ ] Unit + integration tests for Phase 2

## Phase 3 — Domain: Customers Backend
- [ ] Rewrite `listCustomers` with pagination + aggregation join
- [ ] Add `getCustomer` (full detail, alias stats, merged redirect)
- [ ] Add `updateCustomer` (version-checked, status guards)
- [ ] Add `removeCustomerPhone` / `removeCustomerEmail` (with guards)
- [ ] Add `updateCustomerAddress` / `removeCustomerAddress` (no order guard)
- [ ] Add `addCustomerNote`
- [ ] Add `listCustomerOrders` (alias-aware)
- [ ] Add `listCustomerReturns` / `listCustomerRefunds`
- [ ] Add tag operations: listOrgTags, createTag, assignTag, removeTagAssignment
- [ ] Unit + integration tests for Phase 3

## Phase 4 — API Routes
- [ ] Update `orders.ts` route: paginated list, enriched detail, notes, complete, resume, manual create
- [ ] Update `customers.ts` route: paginated list, full detail, PATCH, phone/email/address DELETE, notes, orders, returns, refunds, tags
- [ ] HTTP tests for Phase 4

## Phase 5 — Shared Contracts
- [ ] Add OrderSummaryDto, OrderDetailDto, OrderLineDto, OrderNoteDto, OrderTimelineEventDto, OrderPaymentSummaryDto
- [ ] Add CustomerSummaryDto, CustomerDetailDto, CustomerPhoneDto, CustomerEmailDto, CustomerAddressDto, CustomerTagDto, CustomerNoteDto
- [ ] Add PaginatedEnvelope<T>
- [ ] Run tsc on contracts package

## Phase 6 — Frontend Architecture
- [ ] Create `app/orders/[id]/page.tsx` + `layout.tsx`
- [ ] Create `app/customers/[id]/page.tsx` + `layout.tsx`
- [ ] Create `components/orders/` directory structure
- [ ] Create `components/customers/` directory structure
- [ ] Wire up new pages in admin-shell navigation (update links)

## Phase 7 — Orders Frontend
- [ ] `orders-list.tsx` — paginated table, filter chips, search, date range
- [ ] `orders-filters.tsx`
- [ ] `order-detail-header.tsx` + three-status display (order/fulfillment/delivery separate)
- [ ] `order-actions.tsx` — context-aware per status
- [ ] `order-customer-card.tsx`
- [ ] `order-items-table.tsx`
- [ ] `order-payment-section.tsx`
- [ ] `order-fulfillment-section.tsx`
- [ ] `order-delivery-section.tsx`
- [ ] `order-returns-section.tsx`
- [ ] `order-notes-section.tsx`
- [ ] `order-timeline-section.tsx`
- [ ] `cancel-order-dialog.tsx`
- [ ] `create-fulfillment-dialog.tsx`
- [ ] `create-manual-order-dialog.tsx` (multi-step)
- [ ] Update `app/orders/page.tsx` (Server Component)
- [ ] Update `app/orders/[id]/page.tsx` (Server Component)
- [ ] Retire `orders-console.tsx` after verification

## Phase 8 — Customers Frontend
- [ ] `customers-list.tsx` — paginated, filtered
- [ ] `customers-filters.tsx`
- [ ] `customer-detail-header.tsx`
- [ ] `customer-stats-bar.tsx`
- [ ] `customer-contact-section.tsx`
- [ ] `customer-addresses-section.tsx`
- [ ] `customer-orders-section.tsx`
- [ ] `customer-returns-section.tsx`
- [ ] `customer-refunds-section.tsx`
- [ ] `customer-notes-section.tsx`
- [ ] `customer-tags-section.tsx`
- [ ] `customer-duplicate-alert.tsx`
- [ ] `create-customer-dialog.tsx`
- [ ] `edit-customer-dialog.tsx`
- [ ] `add-address-dialog.tsx` + `edit-address-dialog.tsx`
- [ ] Update `app/customers/page.tsx` (Server Component)
- [ ] Update `app/customers/[id]/page.tsx` (Server Component)
- [ ] Retire `customers-console.tsx` after verification

## Phase 9 — Cross-Module Connections
- [ ] Order → Customer link verified
- [ ] Customer → Orders via alias-aware API verified
- [ ] Order → Fulfillments cards with links
- [ ] Order → Deliveries with Initiate RTO button
- [ ] Order → Returns
- [ ] Delivery domain: emit `delivery.all_lines_delivered` event when final line delivered

## Phase 10 — Event-Driven Order Completion
- [ ] Delivery domain emits `delivery.all_lines_delivered` outbox event
- [ ] Background consumer reads event and calls `completeOrder`
- [ ] Integration test: delivery completion → order auto-completes

## Phase 11 — Performance
- [ ] `listOrders` N+1 fix with LEFT JOIN LATERAL
- [ ] `listCustomers` aggregation fix
- [ ] Verify Promise.all in getOrderDetail and getCustomer
- [ ] Run query explain on list endpoints with 1000+ rows

## Phase 12 — Reliability + Permissions
- [ ] Verify all new routes check correct capability
- [ ] Structured logging in domain functions
- [ ] Idempotency coverage audit

## Phase 13 — Testing
- [ ] Unit tests written alongside each phase
- [ ] Integration tests for all domain functions
- [ ] HTTP tests for all API routes
- [ ] Frontend tests for key user flows
- [ ] Concurrency tests: simultaneous reservation, duplicate completion
