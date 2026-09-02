# Orders + Customers: Production Implementation Plan (v2)

> [!IMPORTANT]
> This is the hardened v2 plan. All architectural decisions are explicit. No ambiguity is deferred to the implementation phase.

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Manual order creation | ✅ Admin-initiated, full lifecycle |
| `COMPLETED` trigger | Event-driven via outbox — delivery domain emits `delivery.all_lines_delivered`, order consumer auto-completes. NOT direct domain coupling. |
| Payment methods on orders | Expand constraint to `COD`, `BKASH_MANUAL`, `NAGAD_MANUAL` |
| Shipping charges | ✅ `delivery_amount >= 0`, admin-settable |
| Customer tags | Managed tag registry (org-level shared) |
| Dedicated URL routing | ✅ `/orders/[id]`, `/customers/[id]` canonical pages |
| Pagination default | 25 per page; keyset for large exports |

---

## Architectural Clarifications (Must Read Before Coding)

### A. Order status vs Fulfillment/Delivery status

> [!CAUTION]
> These are NOT the same dimension. Never represent fulfillment or delivery states as order states.

**Order status** (owned by `orders.orders`):
```
PENDING → CONFIRMED → ON_HOLD → COMPLETED | CANCELLED
```
This reflects the **commercial agreement** state only.

**Fulfillment status** (owned by `fulfillment.fulfillments`):
```
DRAFT → READY → PICKING → PACKED → DISPATCHED | CANCELLED
```

**Delivery status** (owned by `delivery.deliveries`):
```
READY → BOOKED → HANDED_OVER → IN_TRANSIT → DELIVERED | FAILED | CANCELLED
```

**The frontend status stepper** must show these as **three distinct dimensions**, not one linear chain. The UI should show:

```
Order:     [PENDING] → [CONFIRMED] ─────────────────── → [COMPLETED]
Fulfillment:           [DRAFT → DISPATCHED]
Delivery:                              [BOOKED → DELIVERED | FAILED]
```

`DISPATCHED` and `DELIVERED` must never appear in `orders.orders.order_status`. They are fulfillment/delivery concepts surfaced contextually on the order detail page.

---

### B. Auto-completion: Event-Driven Architecture (Required)

> [!IMPORTANT]
> The delivery domain MUST NOT call `completeOrder` directly. All cross-domain triggers go through the outbox.

**Flow:**
```
delivery.recordOutcome(DELIVERED for final line)
  → writes delivery row
  → emits outbox event: delivery.all_lines_delivered { orderId }
  → transaction commits

[Background worker / consumer]
  → reads delivery.all_lines_delivered from platform.outbox_events
  → calls completeOrder({ orderId, idempotencyKey: eventId })
  → completeOrder is idempotent — safe to retry
```

**Why this matters:**
- Delivery domain stays isolated.
- Auto-completion retries independently if the worker fails.
- Works with multiple delivery providers, webhook retries, split deliveries.
- Event replay is safe (idempotency key = outbox event ID).

**Implementation notes:**
- `completeOrder` takes an `idempotencyKey` (the outbox event ID).
- Guard: all order lines must have `delivered_quantity >= ordered_quantity` before completing.
- If the order is already `COMPLETED`, idempotency returns success.
- Admin can also manually complete an order (e.g., partial delivery scenario) — same function, different idempotency key.

---

### C. Manual Order Creation — Explicit Business Rules

> [!IMPORTANT]
> Every rule below must be enforced server-side. No rule is frontend-only.

| Rule | Decision |
|------|----------|
| Price below cost | Allowed — admin has full pricing authority |
| Zero unit price | Allowed — admin gifting scenario |
| Negative unit price | **Not allowed** — `unit_price >= 0` enforced at DB level |
| Zero quantity | **Not allowed** — `quantity > 0` enforced at DB level |
| Manual discounts | Not in v1 — admin sets the final unit price instead |
| Tax field | Set to `0` in v1 — explicit, not hidden |
| Delivery charge | Admin sets `delivery_amount` (numeric, BDT, `>= 0`) |
| Customer required | Yes — no guest manual orders (guest = storefront only) |
| Blocked/inactive customer | **Rejected** — only `ACTIVE` customers may receive manual orders |
| Merged customer | **Rejected** — must use canonical customer instead |
| Create customer during order | Not supported in this flow — create customer first |
| Address saved to customer | Optional — checkbox "Save this address to customer profile" |
| Inventory check timing | Before order is committed — reservation attempt within the same transaction |
| Warehouse selection | **Manual** — admin selects stock location (same as fulfillment) |
| Multi-warehouse per order | **Not supported in v1** — single location per order (reservation must be from one location) |
| Price validation | `unit_price` is a valid non-negative decimal with max 4dp |
| Inventory unavailable | Return `INVENTORY_UNAVAILABLE` error with line detail — do not partially create |
| Idempotency | Required — `idempotency-key` header mandatory |

---

### D. Payment Lifecycle — Full Financial State Machine

> [!NOTE]
> Payments already have domain functions in `payments.ts`. The gap is explicit documentation and surface completeness.

**Payment intent status** (per order):
```
UNPAID → PAYMENT_PENDING → PARTIALLY_PAID → PAID → PARTIALLY_REFUNDED → REFUNDED
```

**Manual payment attempt lifecycle** (bKash/Nagad):
```
PENDING_VERIFICATION → VERIFIED → REJECTED
```

**Manual COD collection lifecycle** (COD):
```
[No attempt] → COLLECTED (recorded at delivery)
```

Fields required on `payments.payment_attempts` for manual methods:
- `customer_reference` — customer's transaction ID / reference (required for BKASH/NAGAD).
- `claimed_amount` — what customer claims to have sent.
- `external_transaction_id` — optional, if courier/payment provider gives one.
- `proof_url` — optional, attachment link.
- `verified_by_actor_id` — who verified.
- `verified_at` — timestamp of verification.
- `rejection_reason` — free text if rejected.

**Refund source of truth:**
- `payments.refunds` is the authoritative financial record.
- `returns.return_refund_links` explains _why_ a refund exists (linked return case).
- Order and customer views **consume** these records — they do not maintain competing refund state.
- Orders module never creates a refund. Payment module owns all refund creation.

**Duplicate payment prevention:**
- `external_transaction_id` must be unique per organization if provided.
- Multiple verified payments on one order are allowed (partial payments) up to the `expected_amount`.
- Excess payment is an error that must be flagged, not silently accepted.

---

### E. Customer Identity: Merge Safety Rules

> [!CAUTION]
> Customer merges must never corrupt historical commercial data.

**When Customer A merges into Customer B:**

| Data | Behavior |
|------|----------|
| `orders.orders.customer_id` | **Unchanged** — still points to A. Orders are historical facts. |
| `orders.order_customer_snapshots` | **Unchanged** — immutable transaction snapshot. |
| `orders.order_addresses` | **Unchanged** — immutable transaction snapshot. |
| `returns.return_cases.customer_id` | **Unchanged** — still points to A. |
| `payments.payments` | **Unchanged** — linked via order, not customer directly. |
| `customers.customer_aliases` | A is recorded as an alias of B. |
| `customers.customer_merges` | Merge record documents the event. |
| `customers.customers.status` on A | Set to `MERGED`, `canonical_customer_id = B`. |
| Admin UI showing A's orders | Works via alias resolution — query by canonical ID joins through aliases. |
| API `GET /admin/customers/:idOfA` | Should redirect or return a `410 Gone` with pointer to B's canonical ID. |
| `GET /admin/customers/:idOfB/orders` | Returns B's own orders PLUS orders from all merged-in aliases. |

**Implementation rule**: `listCustomerOrders` must resolve aliases and include orders from all `MERGED` source customers when returning orders for a canonical customer. This uses `customers.customer_aliases`.

---

### F. Address Snapshot Immutability

> [!IMPORTANT]
> `orders.order_addresses` is immutable commercial history. Customer address mutations must never propagate to existing orders.

**Rule**: Once an order is placed, its `order_addresses` record is frozen. Period.

**Therefore**: The rule "cannot deactivate default address if active orders reference it" is **wrong**. It should be removed from the plan.

Correct rule: Customer address deactivation is always allowed for any address. Existing orders are unaffected because they use the immutable snapshot in `orders.order_addresses`, not the live customer address.

**The only guard needed**: When creating a new order using a customer address, the address must currently be `ACTIVE`. After that point, no guard is needed.

---

### G. Pagination: Offset + Keyset Strategy

**Admin list pages** (orders, customers): Offset pagination via `LIMIT 25 OFFSET (page-1)*25`.
- Acceptable for normal admin navigation where users rarely go past page ~50.
- **Must** enforce deterministic sort order: `ORDER BY created_at DESC, id DESC` on all list queries (prevents record jumping between pages as new records arrive).

**Large dataset exports and high-volume APIs**: Keyset/cursor pagination.
- Cursor = opaque base64-encoded `(created_at, id)` tuple.
- Query: `WHERE (created_at, id) < (cursor.created_at, cursor.id) ORDER BY created_at DESC, id DESC LIMIT 25`.
- Fully stable regardless of dataset size.
- Document this path in the API as `?cursor=<token>` (distinct from `?page=`).

**Enforcement**: The API must reject `pageSize > 100`. All collection endpoints must have a bounded default.

---

### H. Search Field Specification

**Orders search (`q`):**
| Field | Strategy |
|-------|----------|
| Order number | Exact prefix match (e.g., `ORD-2026-AB` prefix) |
| Customer display name | Case-insensitive `ILIKE '%q%'` on `order_customer_snapshots.display_name` |
| Customer phone | Normalized phone search on `order_customer_snapshots.phone` |

**Excluded from v1 order search**: SKU, tracking number, email (add later with proper indexes).

**Customers search (`q`):**
| Field | Strategy |
|-------|----------|
| Customer number | Exact prefix |
| Display name | Case-insensitive `ILIKE '%q%'` using `lower(display_name)` index |
| Primary phone | Normalize input, match on `normalized_value` in `customer_phones` |
| Primary email | Normalize input (lowercase), match on `normalized_value` in `customer_emails` |

**Normalization**: Phone numbers must be normalized before storage and search (strip spaces, dashes, leading zeros, apply country prefix). The `customers.customer_phones.normalized_value` column already exists for this purpose.

**Performance**: Search queries must use the existing indexes. For fuzzy name search, `pg_trgm` with a GIN index can be added if ILIKE is too slow at scale — document this as a follow-up upgrade path.

---

### I. Business Timeline vs Audit Log

> [!NOTE]
> These serve different audiences and must be separated.

**`platform.audit_events`** = low-level security and compliance log.
- Records everything: who viewed what, every field change, every API call.
- Not safe to expose raw to the frontend — too noisy, may contain sensitive internal data.

**Business timeline** = operational event feed for operators.
- Curated projection of commercially meaningful events.
- Built from: outbox events + specific audit entries.
- Includes: order placed, payment received, order confirmed, fulfillment created, fulfillment dispatched, delivery booked, delivery delivered, return created, return authorized, return received, refund issued, order completed, order cancelled.
- Excludes: internal read events, system health checks, background job heartbeats.

**Implementation**: Build a `getOrderTimeline(db, { organizationId, orderId })` function that queries `platform.outbox_events` filtered by `aggregate_id = orderId` and aggregates them into typed `OrderTimelineEventDto` records. This is the timeline exposed on the order detail page — not raw `audit_events`.

Same separation applies to customer timeline.

---

### J. Refund Ownership — Source of Truth

```
payments.refunds       ← financial truth (created, owned, managed by Payments module)
returns.return_refund_links ← explains why this refund exists (created by Returns module)
```

**Orders module**: displays refunds as read-only data fetched from Payments.
**Customers module**: displays refund history as read-only data fetched from Payments.
**Returns module**: links a refund to a return case — does not duplicate the financial record.

**Admin UI**: "Issue refund" action lives in the Payments workspace. Order detail links to it. Customer 360 shows a read-only refund history.

---

### K. Shared Reservation Primitive

> [!IMPORTANT]
> `placeOrder` and `createManualOrder` must both call the same underlying inventory reservation function. No duplication.

The shared primitive is `createInventoryReservationInTransaction` in `inventory.ts`.

Both flows call it identically:
```typescript
// placeOrder:
await createInventoryReservationInTransaction(tx, { variantId, quantity, locationId, ... });

// createManualOrder:
await createInventoryReservationInTransaction(tx, { variantId, quantity, locationId, ... });
```

`createManualOrder` extracts the reservation logic path from `placeOrder` — it does not re-implement it.

---

### L. Bulk Operations (Architecture Now, Implementation Later)

**Architecture decision**: Bulk operations must go through the same domain functions as single operations. No bulk-specific shortcut logic.

**v1 bulk endpoints (POST with array body):**
- `POST /admin/orders/bulk-status` — body: `{ orderIds[], status, idempotencyKeys{} }`. Server applies transitions one-by-one, returns per-ID success/failure.
- `POST /admin/customers/bulk-tags` — assign/remove a tag from N customers.

**Export (async):**
- `POST /admin/orders/export` — enqueues a background export job, returns `{ jobId }`.
- `GET /admin/export-jobs/:jobId` — poll for status and download URL.
- Export formats: CSV initially; XLSX later.

**Not implemented in v1 phases but structure must not prevent them.**

---

### M. Observability

Every API request and every domain operation must emit:

**Structured logs (already or to add):**
- `organizationId`, `actorId`, `orderId`, `customerId` on every relevant log line.
- `idempotencyKey` on all mutating operations.
- `requestId` / correlation ID from Fastify request context.
- Domain errors logged at `warn` level with code + message.
- Infrastructure errors logged at `error` level with stack.

**Metrics (to wire up):**
- Order creation rate (storefront vs manual).
- Order cancellation rate by reason code.
- Payment verification turnaround time.
- Fulfillment creation → dispatch duration.
- Delivery attempt outcomes (DELIVERED, FAILED rates).
- Return case volume by type.
- Background job / outbox event processing lag.

**Implementation note**: Use the existing Fastify request lifecycle hooks to attach correlation IDs. Domain functions should receive a logger interface — do not use `console.log` in domain code.

---

### N. Testing Strategy

> [!IMPORTANT]
> Tests are not optional. Every phase must include tests for the behavior introduced in that phase.

#### Unit tests (pure domain logic — no database)
- Order state transition validation: all valid and invalid transitions.
- Payment total calculation: collected, refunded, outstanding math.
- Reservation quantity validation: over-fulfillment, over-return guards.
- Customer merge precondition checks.
- Search query builder logic.
- Manual order price validation rules.

#### Integration tests (database required — use test transaction that rolls back)
- `placeOrder` full lifecycle.
- `createManualOrder` — success, blocked customer, inventory unavailable, duplicate idempotency key.
- `cancelOrder` — verifies reservation released and payment intent cancelled.
- `completeOrder` — guard: all delivery lines delivered; idempotent replay.
- `createFulfillment` → `dispatchFulfillment` — inventory consumed, COGS assigned.
- `createReturnCase` → `authorizeReturnCase` → `postReturnReceipt` — inventory restocked, COGS recovered.
- `initiateRto` — only from FAILED delivery.
- Manual payment attempt → verify → reject → re-submit cycle.
- Concurrent stock reservation (two orders for same last unit — only one succeeds).
- Duplicate webhook / repeated `completeOrder` call — idempotent.
- Customer merge — aliases, order history still accessible via canonical ID.

#### API/HTTP tests (Fastify injection, no external network)
- Auth + permission checks: 403 on wrong capability.
- Tenant isolation: org A cannot read org B's orders.
- Input validation: missing required fields, wrong types, negative amounts.
- Idempotency key reuse: first call succeeds, second returns 200 with same result.
- Pagination: page 1 / page 2 consistent ordering; pageSize > 100 rejected.

#### Frontend tests (Vitest + Testing Library)
- Orders list: renders rows, filter chips change query, pagination links work.
- Order detail: all sections render, action buttons show correct state per order status.
- Cancel order dialog: shows on click, submits with reason code, shows error on failure.
- Create manual order dialog: customer search, line item add/remove, price validation.
- Customer 360: contact add/remove, address management, order history pagination.

#### Concurrency tests (dedicated integration tests with real DB)
- Simultaneous stock reservation for the same variant — exactly one succeeds.
- Simultaneous order cancellation — idempotent, only one release occurs.
- Simultaneous `completeOrder` calls with the same outbox event ID — only one transition.

---

## Proposed Changes by Phase (Restructured)

Each phase follows: **Database → Backend → API → Frontend → Tests**

---

### Phase 1 — Foundation: Database Schema

> Per AGENTS.md: edit existing baseline migrations. Rebuild: `docker compose down --volumes && docker compose up -d --build`.

#### [MODIFY] [1100_orders_checkout_cod.ts](file:///Users/ashrafee/Documents/GitHub/Maevelle%20Bangladesh/packages/database/src/migrations/1100_orders_checkout_cod.ts)

On `orders.orders`:
- `payment_method` check: `in ('COD', 'BKASH_MANUAL', 'NAGAD_MANUAL')`.
- `delivery_amount` check: `>= 0` (remove `= 0`).
- `source` check: already has `'STOREFRONT', 'MANUAL'` ✓.

Add `orders.order_notes`:
```sql
create table orders.order_notes (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references platform.organizations(id),
  order_id        uuid not null references orders.orders(id),
  author_actor_id uuid not null,
  note_type       text not null default 'INTERNAL'
                    check (note_type in ('INTERNAL', 'CUSTOMER_VISIBLE')),
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, order_id) references orders.orders(organization_id, id)
);
create index order_notes_order_idx on orders.order_notes (order_id, created_at desc);
```

Add `orders.order_completion_events` (links order completion to the triggering delivery event for traceability):
```sql
create table orders.order_completion_events (
  order_id              uuid primary key references orders.orders(id),
  organization_id       uuid not null,
  trigger_outbox_event_id uuid,    -- the delivery.all_lines_delivered event that caused this
  completed_by_actor_id uuid,      -- null if auto-completed, actor_id if manually completed
  created_at            timestamptz not null default now()
);
```

#### [MODIFY] [0700_customers.ts](file:///Users/ashrafee/Documents/GitHub/Maevelle%20Bangladesh/packages/database/src/migrations/0700_customers.ts)

Add `customers.customer_notes`:
```sql
create table customers.customer_notes (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references platform.organizations(id),
  customer_id     uuid not null,
  author_actor_id uuid not null,
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
);
create index customer_notes_customer_idx on customers.customer_notes (customer_id, created_at desc);
```

Add managed tag registry:
```sql
create table customers.customer_tags (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references platform.organizations(id),
  name            text not null check (length(trim(name)) > 0),
  color           text,
  created_at      timestamptz not null default now(),
  unique (organization_id, lower(name))
);
create table customers.customer_tag_assignments (
  organization_id uuid not null references platform.organizations(id),
  customer_id     uuid not null,
  tag_id          uuid not null references customers.customer_tags(id),
  created_at      timestamptz not null default now(),
  primary key (organization_id, customer_id, tag_id),
  foreign key (organization_id, customer_id) references customers.customers(organization_id, id)
);
create index customer_tag_customer_idx on customers.customer_tag_assignments (customer_id);
```

Add `orders.order_completion_events` capability grants:
```sql
insert into iam.capability_definitions values
  ('orders.create', 'orders', 'Create manual orders from admin.', 'HIGH')
on conflict do nothing;
-- grant to OWNER memberships same as orders.manage
```

**Tests for Phase 1**: Schema migration runs cleanly on fresh DB. All constraints enforce correctly (negative delivery_amount rejected, note_type invalid value rejected, tag name collision rejected).

---

### Phase 2 — Domain: Orders Backend Functions

#### [MODIFY] [orders.ts](file:///Users/ashrafee/Documents/GitHub/Maevelle%20Bangladesh/packages/database/src/orders.ts)

**`listOrders` — full rewrite:**

Signature:
```typescript
listOrders(db, {
  organizationId: string;
  page?: number;           // default 1
  pageSize?: number;       // default 25, max 100
  status?: OrderStatus;
  q?: string;              // searches: order_number prefix, customer display_name ILIKE, customer phone normalized
  from?: string;           // ISO date, filters created_at >= from
  to?: string;             // ISO date, filters created_at <= to
  customerId?: string;     // scope to customer, includes MERGED aliases
}): Promise<{ data: OrderSummaryRow[]; pagination: PaginationMeta }>
```

Implementation notes:
- Inline payment summary via `LEFT JOIN LATERAL` — no per-row call.
- `customerId` filter must resolve aliases: `customer_id IN (SELECT alias_customer_id FROM customers.customer_aliases WHERE canonical_customer_id = ? UNION VALUES (?))`.
- Sort: `ORDER BY o.created_at DESC, o.id DESC` always — no overrides in v1.
- Count: use `count(*) OVER()` window function to avoid a second query.
- Phone search: normalize `q` using the same normalization function used at insert time before comparing against `normalized_value`.

**`getOrderDetail` — extend:**
- Returns enriched view including: discount applications, cancellation record, notes (latest 20), business timeline events (latest 30 from outbox), fulfillments (with line detail), deliveries (with outcome), return cases (with type and status), refunds (read from payments), inventory reservation status per line.
- All sub-queries via `Promise.all`.
- Business timeline: query `platform.outbox_events WHERE aggregate_type IN ('orders.order', 'fulfillment.fulfillment', 'delivery.delivery', 'returns.return_case') AND payload->>'orderId' = ?` ordered by `occurred_at DESC LIMIT 30`.

**New: `addOrderNote`:**
```typescript
addOrderNote(db, {
  organizationId, actorId, orderId, noteType: 'INTERNAL' | 'CUSTOMER_VISIBLE', body
}): Promise<{ id: string }>
```

**New: `completeOrder`:**
```typescript
completeOrder(db, {
  organizationId,
  orderId,
  actorId,            // null if auto-triggered
  idempotencyKey,     // required — use outbox event ID for auto-completion
  triggerOutboxEventId?: string,
}): Promise<OrderView>
```
Guards:
- Order must be `CONFIRMED` (not `ON_HOLD`, `CANCELLED`, or already `COMPLETED`).
- All `delivery.delivery_lines` for this order must have `delivered_quantity >= order_line.quantity`. (Check against order lines, not just delivery lines, to handle partial deliveries.)
- If already `COMPLETED`: idempotency returns existing record.

**New: `resumeOrderFromHold`:**
```typescript
resumeOrderFromHold(db, {
  organizationId, actorId, orderId, expectedVersion
}): Promise<OrderView>
```
- `ON_HOLD → CONFIRMED`. Version-checked. Audit event.

**New: `createManualOrder`:**
```typescript
createManualOrder(db, {
  organizationId,
  actorId,
  customerId,
  lines: {
    variantId: string;
    quantity: string;          // positive decimal
    unitPrice: string;         // non-negative decimal, admin-set
  }[],
  deliveryAmount: string,      // >= 0, BDT
  paymentMethod: 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL',
  locationId: string,          // warehouse for reservation
  deliveryAddress: {
    recipientName, phone, addressLine1, addressLine2?, area?, city?, district?, postalCode?, countryCode,
    geographyNodeId?, saveToCustomer?: boolean,
  },
  idempotencyKey: string,
}): Promise<OrderView>
```

Implementation:
1. Idempotency claim (operation: `orders.manual-create`).
2. Validate customer is `ACTIVE` (not INACTIVE, BLOCKED, MERGED, ANONYMIZED).
3. Validate all lines: `unitPrice >= 0`, `quantity > 0`, variant exists and is `ACTIVE` in catalog.
4. Validate location has `STOCK_HOLDING` capability.
5. Within transaction:
   - Compute totals: `subtotal = sum(qty * unitPrice)`, `discount = 0`, `total = subtotal + deliveryAmount`.
   - `INSERT INTO orders.orders` with `source = 'MANUAL'`.
   - Create customer snapshot + address snapshot.
   - For each line (sorted by variantId to avoid deadlock): call `createInventoryReservationInTransaction` — if any fail, roll back entire transaction with `INVENTORY_UNAVAILABLE` error listing the failing line.
   - Insert order lines + reservations.
   - Create payment intent.
   - If `deliveryAddress.saveToCustomer === true`: call `addCustomerAddress` within same transaction.
6. Complete idempotency record. Emit outbox event `orders.manual_order.created`.

**Tests for Phase 2 orders.ts:**
- `listOrders` returns correct pagination metadata.
- `listOrders` with `q` matching order number returns correct order.
- `listOrders` with `customerId` of a MERGED customer returns empty (must use canonical ID).
- `listOrders` with canonical ID returns orders from merged aliases too.
- `completeOrder` succeeds when all delivery lines delivered.
- `completeOrder` rejected when order is ON_HOLD.
- `completeOrder` idempotent on repeat call.
- `createManualOrder` — success path creates order + reservations.
- `createManualOrder` — blocked customer returns error.
- `createManualOrder` — inventory unavailable rolls back completely.
- `createManualOrder` — duplicate idempotency key returns same order.
- `resumeOrderFromHold` — transitions correctly, version mismatch rejected.

---

### Phase 3 — Domain: Customers Backend Functions

#### [MODIFY] [customers.ts](file:///Users/ashrafee/Documents/GitHub/Maevelle%20Bangladesh/packages/database/src/customers.ts)

**`listCustomers` — rewrite:**
```typescript
listCustomers(db, {
  organizationId,
  page?, pageSize?,          // default 25, max 100
  q?,                        // name ILIKE, customer_number prefix, normalized phone, normalized email
  status?,
}): Promise<{ data: CustomerSummaryRow[]; pagination: PaginationMeta }>
```
- Aggregate order stats via single `LEFT JOIN` + `GROUP BY customer_id`.
- Search across name, customer_number, phone (via join on customer_phones), email (via join on customer_emails).
- Exclude `MERGED` customers by default (show only canonical records unless `status = 'MERGED'` explicitly requested).
- Sort: `ORDER BY c.created_at DESC, c.id DESC`.

**New: `getCustomer`:**
```typescript
getCustomer(db, { organizationId, customerId }): Promise<CustomerDetailView>
```
- If customer status is `MERGED`: return `{ redirectToCanonicalId: canonicalCustomerId }` — API returns 301 or 410.
- Otherwise: fetch all phones, all emails, all active addresses, notes (latest 20), tags, aggregate stats (total orders including merged aliases, total spend, AOV, return count, last order date).
- Stats query must include orders from MERGED aliases via `customer_aliases`.
- All sub-queries via `Promise.all`.

**New: `updateCustomer`:**
```typescript
updateCustomer(db, {
  organizationId, actorId, customerId, expectedVersion,
  displayName?, status?,
}): Promise<CustomerView>
```
- Cannot set `status` to `MERGED` or `ANONYMIZED` — those are domain-controlled.
- Allowed status changes: `ACTIVE ↔ INACTIVE`, `ACTIVE/INACTIVE → BLOCKED`.
- Version-checked. Audit event.

**New: `removeCustomerPhone` / `removeCustomerEmail`:**
- Guard: cannot remove if it is the only record of its type (phone or email). Customer must have at least zero contacts — but if isPrimary, must not remove without another record taking primary.
- Deletes record (hard delete, since it's not commercial history). Audit event.

**New: `updateCustomerAddress` / `removeCustomerAddress`:**
- `removeCustomerAddress`: Set `status = 'INACTIVE'`. **No guard against active orders** — orders use snapshots. No restriction.
- `updateCustomerAddress`: Version-checked, partial field update, audit event.

**New: `addCustomerNote`:**
```typescript
addCustomerNote(db, { organizationId, actorId, customerId, body }): Promise<{ id: string }>
```

**New: `listCustomerOrders`** — delegates to updated `listOrders` with `customerId` (canonical, resolves aliases).

**New: `listCustomerReturns`** — return cases by `customer_id` (including via aliases).

**New: `listCustomerRefunds`** — refunds via `payments.refunds → payments.payments → orders.orders WHERE customer_id IN (aliases)`.

**Tag operations:**
- `listOrgTags(db, { organizationId })` — list all tags for org.
- `createTag(db, { organizationId, actorId, name, color? })` — org-level, unique by name.
- `assignTagToCustomer(db, { organizationId, actorId, customerId, tagId })` — idempotent upsert.
- `removeTagFromCustomer(db, { organizationId, actorId, customerId, tagId })`.

**Tests for Phase 3:**
- `getCustomer` for MERGED customer returns redirect signal.
- `getCustomer` stats include orders from merged aliases.
- `updateCustomer` — version mismatch rejected; invalid status transition rejected.
- `removeCustomerPhone` — blocked if last phone; succeeds otherwise.
- `removeCustomerAddress` — always succeeds (no order guard).
- `listCustomers` — MERGED customers excluded by default.
- `listCustomerOrders` — returns orders from canonical + merged aliases.

---

### Phase 4 — API Routes

#### [MODIFY] [orders.ts (route)](file:///Users/ashrafee/Documents/GitHub/Maevelle%20Bangladesh/apps/api/src/routes/orders.ts)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/admin/orders` | Query: `page`, `pageSize` (max 100), `status`, `q`, `from`, `to`, `customerId`. Returns `PaginatedEnvelope<OrderSummaryDto>`. |
| `GET` | `/admin/orders/:id` | Returns `OrderDetailDto`. |
| `POST` | `/admin/orders` | Manual creation. `idempotency-key` header required. `orders.create` capability. |
| `POST` | `/admin/orders/:id/status` | Confirm / Hold. Existing. |
| `POST` | `/admin/orders/:id/resume` | Resume from ON_HOLD. `{ version }`. `orders.manage`. |
| `POST` | `/admin/orders/:id/complete` | Manual complete. `{ version }` + `idempotency-key`. `orders.manage`. |
| `POST` | `/admin/orders/:id/cancel` | Existing. Ensure `idempotency-key` header required. |
| `POST` | `/admin/orders/:id/notes` | `{ noteType, body }`. `orders.manage`. |
| `POST` | `/admin/orders/:id/fulfillments` | Existing fulfillment creation (keep here, it's correct). |

All list endpoints: reject `pageSize > 100` with `422`. Reject `page < 1` with `422`.

#### [MODIFY] [customers.ts (route)](file:///Users/ashrafee/Documents/GitHub/Maevelle%20Bangladesh/apps/api/src/routes/customers.ts)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/admin/customers` | `page`, `pageSize`, `q`, `status`. Paginated. |
| `GET` | `/admin/customers/:id` | Full `CustomerDetailDto`. If MERGED: 301 to canonical. |
| `PATCH` | `/admin/customers/:id` | `{ displayName?, status?, version }`. `customers.manage`. |
| `DELETE` | `/admin/customers/:id/phones/:phoneId` | `customers.manage`. |
| `DELETE` | `/admin/customers/:id/emails/:emailId` | `customers.manage`. |
| `PUT` | `/admin/customers/:id/addresses/:addressId` | `customers.manage`. |
| `DELETE` | `/admin/customers/:id/addresses/:addressId` | `customers.manage`. |
| `POST` | `/admin/customers/:id/notes` | `{ body }`. `customers.manage`. |
| `GET` | `/admin/customers/:id/orders` | `page`, `pageSize`. Delegates to `listOrders`. |
| `GET` | `/admin/customers/:id/returns` | Return cases. |
| `GET` | `/admin/customers/:id/refunds` | Refund records. |
| `GET` | `/admin/customers/tags` | List org tags. `customers.view`. |
| `POST` | `/admin/customers/tags` | Create tag. `customers.manage`. |
| `POST` | `/admin/customers/:id/tags` | Assign tag. `customers.manage`. |
| `DELETE` | `/admin/customers/:id/tags/:tagId` | Remove assignment. `customers.manage`. |

**Tests for Phase 4:**
- 403 on all routes without correct capability.
- Org isolation: org B's token cannot access org A's orders.
- `pageSize=200` returns 422.
- Idempotency key reuse returns 200 with original result.
- MERGED customer GET returns 301.

---

### Phase 5 — Shared Contracts (DTOs)

#### [MODIFY] [index.ts (contracts)](file:///Users/ashrafee/Documents/GitHub/Maevelle%20Bangladesh/packages/contracts/src/index.ts)

```typescript
// Pagination
export interface PaginationDto {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
export interface PaginatedEnvelope<T> {
  readonly data: readonly T[];
  readonly pagination: PaginationDto;
}

// Orders
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type PaymentMethodCode = 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';

export interface OrderSummaryDto {
  readonly id: string;
  readonly orderNumber: string;
  readonly source: 'STOREFRONT' | 'MANUAL';
  readonly status: OrderStatus;
  readonly paymentMethod: PaymentMethodCode;
  readonly paymentStatus: string;
  readonly total: string;
  readonly currency: string;
  readonly customerName: string;
  readonly customerId: string | null;
  readonly createdAt: string;
}

export interface OrderLineDto {
  readonly id: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly options: readonly { name: string; value: string }[];
  readonly quantity: string;
  readonly unitPrice: string;
  readonly gross: string;
  readonly discount: string;
  readonly net: string;
}

export interface OrderNoteDto {
  readonly id: string;
  readonly authorActorId: string;
  readonly noteType: 'INTERNAL' | 'CUSTOMER_VISIBLE';
  readonly body: string;
  readonly createdAt: string;
}

export interface OrderTimelineEventDto {
  readonly eventType: string;         // e.g. "orders.confirmed", "fulfillment.dispatched"
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface OrderPaymentSummaryDto {
  readonly method: PaymentMethodCode;
  readonly status: string;
  readonly expected: string;
  readonly collected: string;
  readonly refunded: string;
  readonly outstanding: string;
}

export interface OrderDetailDto extends OrderSummaryDto {
  readonly version: number;
  readonly deliveryAmount: string;
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly customer: {
    readonly displayName: string;
    readonly phone: string;
    readonly email: string | null;
    readonly customerId: string | null;
  };
  readonly address: {
    readonly recipientName: string;
    readonly phone: string;
    readonly addressLine1: string;
    readonly addressLine2: string | null;
    readonly area: string | null;
    readonly city: string | null;
    readonly district: string | null;
    readonly postalCode: string | null;
    readonly countryCode: string;
  };
  readonly lines: readonly OrderLineDto[];
  readonly discountApplications: readonly OrderDiscountApplicationDto[];
  readonly payment: OrderPaymentSummaryDto;
  readonly fulfillments: readonly FulfillmentSummaryDto[];
  readonly deliveries: readonly DeliverySummaryDto[];
  readonly returnCases: readonly ReturnCaseSummaryDto[];
  readonly refunds: readonly RefundSummaryDto[];
  readonly notes: readonly OrderNoteDto[];
  readonly timeline: readonly OrderTimelineEventDto[];
  readonly cancellation: {
    readonly reasonCode: string;
    readonly reasonText: string | null;
    readonly createdAt: string;
  } | null;
}

// Customers
export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'MERGED' | 'ANONYMIZED';

export interface CustomerSummaryDto {
  readonly id: string;
  readonly customerNumber: string;
  readonly displayName: string;
  readonly status: CustomerStatus;
  readonly primaryPhone: string | null;
  readonly primaryEmail: string | null;
  readonly orderCount: number;
  readonly totalSpend: string;
  readonly lastOrderAt: string | null;
  readonly createdAt: string;
}

export interface CustomerPhoneDto {
  readonly id: string;
  readonly rawValue: string;
  readonly isPrimary: boolean;
  readonly verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'BOUNCED';
}

export interface CustomerEmailDto {
  readonly id: string;
  readonly rawValue: string;
  readonly isPrimary: boolean;
  readonly verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'BOUNCED';
}

export interface CustomerAddressDto {
  readonly id: string;
  readonly label: string | null;
  readonly recipientName: string;
  readonly phone: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly area: string | null;
  readonly city: string | null;
  readonly district: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly isDefault: boolean;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly version: number;
}

export interface CustomerTagDto {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
}

export interface CustomerDetailDto {
  readonly id: string;
  readonly customerNumber: string;
  readonly displayName: string;
  readonly status: CustomerStatus;
  readonly version: number;
  readonly phones: readonly CustomerPhoneDto[];
  readonly emails: readonly CustomerEmailDto[];
  readonly addresses: readonly CustomerAddressDto[];
  readonly notes: readonly CustomerNoteDto[];
  readonly tags: readonly CustomerTagDto[];
  readonly stats: {
    readonly orderCount: number;
    readonly totalSpend: string;
    readonly averageOrderValue: string;
    readonly returnCount: number;
    readonly lastOrderAt: string | null;
  };
  readonly createdAt: string;
}
```

---

### Phase 6 — Frontend Architecture

Break monolithic consoles into composed, routed components using **Tailwind CSS + shadcn primitives only**. No new vanilla CSS.

**File structure:**
```
apps/admin/
  app/
    orders/
      page.tsx               ← Server Component: initial fetch, passes to list
      [id]/
        page.tsx             ← Server Component: full order detail
        layout.tsx           ← Breadcrumb: Orders / ORDER-XXXX
    customers/
      page.tsx
      [id]/
        page.tsx
        layout.tsx
  components/
    orders/
      orders-list.tsx              ← Client: table, filter bar, pagination
      orders-filters.tsx           ← Status chips, search input, date range
      order-detail/
        order-status-dimensions.tsx   ← Shows Order / Fulfillment / Delivery status separately
        order-detail-header.tsx
        order-customer-card.tsx
        order-items-table.tsx
        order-payment-section.tsx
        order-fulfillment-section.tsx
        order-delivery-section.tsx
        order-returns-section.tsx
        order-notes-section.tsx
        order-timeline-section.tsx
        order-actions.tsx
        dialogs/
          cancel-order-dialog.tsx
          create-fulfillment-dialog.tsx
          hold-order-dialog.tsx
      create-manual-order-dialog.tsx
    customers/
      customers-list.tsx
      customers-filters.tsx
      customer-detail/
        customer-detail-header.tsx
        customer-stats-bar.tsx
        customer-contact-section.tsx
        customer-addresses-section.tsx
        customer-orders-section.tsx
        customer-returns-section.tsx
        customer-refunds-section.tsx
        customer-notes-section.tsx
        customer-tags-section.tsx
        customer-duplicate-alert.tsx
      dialogs/
        create-customer-dialog.tsx
        edit-customer-dialog.tsx
        add-address-dialog.tsx
        edit-address-dialog.tsx
```

Legacy `orders-console.tsx` and `customers-console.tsx` are **retired** (deleted) once new pages pass verification.

---

### Phase 7 — Orders Frontend

#### `/orders` — List Page
- Server Component fetches page 1.
- Status filter chips: ALL | PENDING | CONFIRMED | ON_HOLD | COMPLETED | CANCELLED.
- Search: debounced 300ms → server call with `q` param.
- Date range picker (from/to).
- Pagination: Previous / Next / page number display.
- Table columns: Order # + source badge | Customer (link) | Date | Order status | Payment status | Total.
- "Create Order" button → `CreateManualOrderDialog`.

#### `/orders/[id]` — Detail Page

**Three-status display** (not a stepper — three independent badges/rows):
```
Order status:      [CONFIRMED]
Fulfillment:       [DISPATCHED] — FUL-2026-XXXXX
Delivery outcome:  [IN_TRANSIT] — DLV-2026-XXXXX
```

Sections (shadcn Card):
1. **Header**: Order number, source badge, date, three status display. Action bar (context-aware).
2. **Actions** (shown based on order status):
   - PENDING: "Confirm Order" button, "Put On Hold" button, "Cancel Order" button.
   - CONFIRMED: "Put On Hold" button, "Cancel Order" button.
   - ON_HOLD: "Resume Order" button (primary), "Cancel Order" button.
   - COMPLETED/CANCELLED: No actions (read-only state label).
3. **Customer card**: Name → `/customers/[id]`, phone, email.
4. **Delivery address**: Formatted address.
5. **Order lines**: Table with product, SKU, options, qty × unit price, discount, net. Footer totals including delivery charge.
6. **Discounts**: Applied promotions/coupons listed.
7. **Payment**: Method chip + status + financial grid (expected/collected/outstanding/refunded). Pending manual attempts. Link to payments workspace.
8. **Fulfillments**: Cards per fulfillment (number, status, location, dispatched at). Create Fulfillment button (when order is PENDING or CONFIRMED and locations exist).
9. **Deliveries**: Cards per delivery (number, status, tracking, outcome). "Initiate RTO" appears when `outcome_status = 'FAILED'`.
10. **Returns**: Return case cards (type, status, created at). Link to `/returns/[id]`.
11. **Refunds**: Refund list (read-only from payments).
12. **Order notes**: Note list + add note form.
13. **Business timeline**: Event feed from outbox (not raw audit events).

#### Dialogs

**Cancel Order Dialog**: Reason code select (ADMIN_REQUEST | CUSTOMER_REQUEST | PAYMENT_FAILED | OUT_OF_STOCK | OTHER) + optional reason text + warning block. Idempotency key generated client-side.

**Create Fulfillment Dialog**: Location select → per-line qty inputs showing ordered, fulfilled, remaining. Validates client-side before server submit.

**Create Manual Order Dialog** (multi-step):
- Step 1: Customer search (combobox with async search → `/admin/customers?q=`). Shows name, number, status.
- Step 2: Line items. Add line: variant search (SKU/title), quantity input, unit price input (pre-populated from catalog current price, editable). Multiple lines.
- Step 3: Delivery. Location select (warehouse, STOCK_HOLDING). Address: select existing customer address or enter new (with "Save to profile" checkbox). Delivery charge input (BDT).
- Step 4: Payment. Method select. Summary: subtotal + delivery = total.
- Step 5: Confirm + submit. Shows full order summary before creation.

---

### Phase 8 — Customers Frontend

#### `/customers` — List Page
- Server Component + Client pagination/filter.
- Table: Name + number | Phone | Email | Orders | Spend | Last order | Status.
- "Create Customer" → dialog.
- Rows click → `/customers/[id]`.

#### `/customers/[id]` — 360 View

1. **Header**: Name (large), customer number (mono), status badge. "Edit" → `EditCustomerDialog` (name + status, version-checked).
2. **Stats bar**: Total orders | Lifetime spend | AOV | Returns | Last order.
3. **Contact section**: All phones (primary badge, verification badge). All emails. Add/Set Primary/Remove per entry.
4. **Addresses section**: Cards. Add/Edit/Deactivate/Set Default.
5. **Tags**: Chips. Add (combobox of org tags, create inline if not found). Remove.
6. **Order history**: Mini-table, paginated, sorted by date desc. Click → `/orders/[id]`.
7. **Returns**: Return case list. Link to `/returns/[id]`.
8. **Refunds**: Refund list (read-only).
9. **Notes**: Note feed + add form.
10. **Duplicate candidates alert**: Banner if open candidates. Dismiss / View.
11. **Audit trail** (collapsed by default): Expandable event feed.

---

### Phase 9 — Cross-Module Connections

| Connection | Implementation |
|------------|----------------|
| Order → Customer | Link using `customerId` from `order_customer_snapshots` → `/customers/[id]` |
| Customer → Orders | `GET /admin/customers/:id/orders` — includes merged alias orders |
| Order → Fulfillments | Fetched in `getOrderDetail`, cards with link to `/fulfillments/[id]` |
| Order → Deliveries | Same; "Initiate RTO" on FAILED outcome |
| Order → Returns | Same; link to `/returns/[id]` |
| Delivery FAILED → RTO | `POST /admin/deliveries/:id/rto` — surfaces `initiateRto` |
| `completeOrder` auto-trigger | Outbox consumer: `delivery.all_lines_delivered` → `completeOrder` |
| Fulfillment dispatch → COGS | Already wired — surface cost summary in order detail |
| Return receipt → Inventory | Show "Stock restocked" on return case after receipt posted |

---

### Phase 10 — Event-Driven Order Completion

**Background consumer implementation:**

```typescript
// Consumer watches: platform.outbox_events WHERE event_type = 'delivery.all_lines_delivered'
async function handleAllLinesDelivered(event: OutboxEvent): Promise<void> {
  const orderId = (event.payload as { orderId: string }).orderId;
  await completeOrder(db, {
    organizationId: event.organizationId,
    orderId,
    actorId: null,                     // system-triggered
    idempotencyKey: event.id,          // outbox event ID = idempotency key
    triggerOutboxEventId: event.id,
  });
}
```

**Delivery domain change**: When recording a `DELIVERED` outcome on the **last undelivered delivery line** for an order, emit `delivery.all_lines_delivered { orderId }` to `platform.outbox_events`. This check is a read on `order_lines` vs `delivery_lines` within the delivery transaction.

**Idempotency**: If the consumer retries (due to worker crash), `completeOrder` with the same `idempotencyKey` returns success without re-processing.

---

### Phase 11 — Performance

1. `listOrders` N+1 → inline `LEFT JOIN LATERAL` for payment summary.
2. `listCustomers` correlated subqueries → single `LEFT JOIN` aggregation.
3. All list endpoints: `count(*) OVER()` window function for total count (single round-trip).
4. `getOrderDetail` and `getCustomer` sub-queries: all via `Promise.all`.
5. Missing indexes added in Phase 1.
6. Phone/email search: uses `normalized_value` indexed columns.
7. Server Components for initial page data — avoids client waterfall.

---

### Phase 12 — Reliability and Production Hardening

**Idempotency coverage:**

| Operation | Key source |
|-----------|-----------|
| `createManualOrder` | Client-generated UUID in `idempotency-key` header |
| `completeOrder` (auto) | Outbox event ID |
| `completeOrder` (manual) | Client-generated UUID |
| `cancelOrder` | Client-generated UUID (already implemented) |
| `createFulfillment` | Client-generated UUID (already implemented) |
| `dispatchFulfillment` | Client-generated UUID (already implemented) |
| `createReturnCase` | Client-generated UUID (already implemented) |

**Structured logging additions:**
- All domain functions receive a `logger` interface (not `console.log`).
- Log: `{ organizationId, orderId/customerId, idempotencyKey, actorId }` on every mutation.
- Fastify request ID attached to all downstream log calls via async context.

**Permission audit:**
- `orders.create` — `createManualOrder`.
- `orders.manage` — confirm, hold, resume, cancel, complete, add note.
- `orders.view` — all GET endpoints.
- `customers.manage` — update, notes, tags, address management.
- `customers.view` — all GET endpoints.

---

### Phase 13 — Testing (Non-Negotiable)

Tests are written alongside the phase they cover, not after.

#### Unit tests
- All order state transitions (valid + invalid).
- Manual order total calculation.
- Payment outstanding calculation.
- Reservation quantity guard (over-fulfillment, over-return).
- Customer status transition guards (cannot set MERGED via updateCustomer).
- Search query builder (q → SQL conditions).
- Phone normalization function.

#### Integration tests (transactional — rolls back after each test)
- `createManualOrder` — all scenarios documented in Phase 2.
- `completeOrder` — guard, idempotency, auto-trigger simulation.
- `cancelOrder` — reservation released, payment intent cancelled.
- `resumeOrderFromHold` — transition correct, version mismatch rejected.
- `listCustomerOrders` — includes merged alias orders.
- `getCustomer` — merged customer returns redirect.
- `removeCustomerAddress` — always succeeds (no order guard).
- Concurrent stock reservation — two simultaneous orders for last unit, exactly one succeeds.
- Duplicate `completeOrder` call — idempotent.

#### HTTP/API tests (Fastify `inject`)
- 403 on all endpoints without correct capability.
- Org isolation on every GET endpoint.
- `pageSize > 100` → 422.
- Missing `idempotency-key` on required endpoints → 422.
- MERGED customer GET → 301.

#### Frontend tests (Vitest + Testing Library)
- Orders list renders, filter chips update query, pagination works.
- Order detail: each section renders; action buttons correct per status.
- Cancel dialog: opens, submits with reason, shows error on API failure.
- Create manual order dialog: all steps, validation, submission.
- Customer 360: all sections render, contact add/remove, address deactivation.

---

## Phase Execution Order

```
Phase 1   DB schema
Phase 2   Orders domain functions
Phase 3   Customers domain functions
Phase 4   API routes
Phase 5   Contracts / DTOs
Phase 6   Frontend architecture (routing + file structure)
Phase 7   Orders frontend (list + detail + dialogs)
Phase 8   Customers frontend (list + 360 + dialogs)
Phase 9   Cross-module connections
Phase 10  Event-driven order completion
Phase 11  Performance
Phase 12  Reliability + permissions
Phase 13  Testing (written in parallel with each phase, not after)
```

---

## What Is Explicitly Deferred (Not Forgotten)

| Feature | Reason |
|---------|--------|
| Bulk confirm / hold / cancel | Architecture accounts for it; not in v1 |
| Bulk CSV export (async job) | Endpoint stub in Phase 4; implementation deferred |
| Cursor/keyset pagination | Documented; offset is sufficient for v1 admin usage |
| `pg_trgm` fuzzy search | Upgrade path documented; ILIKE sufficient for v1 |
| Customer account / login link | Architecture supports it; not in v1 |
| SMS/email customer notifications | Notification module handles it |
| Tax calculation | Always `0` in v1; `tax_amount` column ready |
| Multi-warehouse per order | Single location per order in v1 |
| Observability metrics | Structured logging in scope; metric dashboards deferred |
