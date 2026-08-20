# Maevelle Ecommerce — API & OpenAPI Contract Specification

**Document:** `docs/architecture/api-openapi-contract-specification.md`
**Status:** Transport Contract / Living Document
**Version:** 0.1
**OpenAPI Target:** 3.1.1
**Related:** API Architecture, Application Services Architecture, Security Architecture, PostgreSQL Schema Specification

---

# 1. Purpose

This document defines how Maevelle's:

```text
Commands

Queries

Authentication

Authorization

Concurrency

Idempotency

Errors

Pagination

Async Jobs

Webhooks

Provider Callbacks
```

are exposed through HTTP.

The relationship is:

```text
HTTP
 ↓
Transport Contract
 ↓
Command / Query
 ↓
Application Service
 ↓
Domain
 ↓
PostgreSQL
```

HTTP is therefore a transport layer.

It does not become the source of business semantics.

---

# 2. Core API Principle

> **URLs represent resources and business capabilities. They do not expose the database model directly.**

Bad:

```http
PATCH /inventory-levels/123
```

with:

```json
{
  "quantity": 500
}
```

Correct:

```http
POST /inventory/adjustments
```

representing:

```text
AdjustInventory Command
```

---

# 3. Second Principle

> **Resource editing and business state transitions are different API operations.**

Plain editable master-data field:

```http
PATCH /products/{productId}
```

Business transition:

```http
POST /products/{productId}/publish
```

Do not submit:

```json
{
  "publication_status": "PUBLISHED"
}
```

through unrestricted PATCH.

---

# 4. Third Principle

> **The API never accepts caller-controlled derived truth.**

Clients cannot directly submit authoritative:

```text
payment status

inventory available quantity

verified-purchase status

Order paid status

Product rating

Promotion discount total

Order total
```

These are server-derived.

---

# 5. API Surfaces

Maevelle exposes four logical HTTP surfaces.

```text
Storefront API
Admin API
Integration API
Provider Callback API
```

Plus:

```text
Outbound Webhooks
```

which Maevelle sends rather than receives.

---

# 6. Base Paths

## Storefront

```text
/api/storefront/v1
```

## Admin

```text
/api/admin/v1
```

## External / Private Integration API

```text
/api/integration/v1
```

## Provider Callbacks

```text
/api/provider-callbacks/v1
```

---

# 7. Internal Application Interfaces

Internal domain/application communication does **not** use these HTTP APIs.

Example:

```text
Orders
→ Inventory.reserve()
```

remains an in-process application call in the modular monolith.

---

# 8. API Versioning

Major compatibility version appears in URL:

```text
/v1
```

V1 can receive:

```text
new optional fields

new endpoints

new optional filters
```

without changing the major version.

---

# 9. Breaking Change

Examples:

```text
Remove response field

Change field meaning

Change existing field type

Change required request semantics

Change error meaning

Rename existing enum value
```

require controlled migration and generally:

```text
/v2
```

for externally stable contracts.

---

# 10. Internal Admin Evolution

Admin frontend and Admin API may deploy together.

But Admin API should still maintain:

```text
documented contracts

generated types

contract tests
```

rather than relying on accidental backend/frontend coupling.

---

# 11. HTTP Method Rules

## GET

Read-only query.

Must not perform business mutation.

## POST

Used for:

```text
Resource creation

Semantic commands

Complex secure lookup

Async operation creation
```

## PATCH

Partial modification of editable resource fields.

## PUT

Replacement/set operation where complete resource semantics make sense.

## DELETE

Used sparingly for:

```text
ephemeral data

cart lines

removing relationships

uncommitted resources
```

Historical business records use:

```text
archive

cancel

void

disable
```

instead.

---

# 12. Semantic Command Routes

Allowed and intentional:

```http
POST /orders/{id}/cancel

POST /products/{id}/publish

POST /payments/attempts/{id}/verify

POST /inbound-receipts/{id}/post
```

We should not contort business transitions into fake CRUD merely to appear REST-pure.

---

# 13. URL Naming

Resource paths use:

```text
lowercase
plural nouns
kebab-case
```

Examples:

```text
/inbound-shipments

/payment-attempts

/financial-accounts
```

---

# 14. Resource IDs

Administrative/internal routes use opaque UUID identifiers.

Example:

```text
/products/019...
```

Public Catalog URLs use public handles where appropriate:

```text
/products/summer-beach-hat
```

---

# 15. Human Numbers

Support search/display using:

```text
ORD-2026-00152

PUR-2026-00019
```

but do not treat those values as secure authorization credentials.

---

# 16. Common Success Envelope

Single-resource response:

```json
{
  "data": {
    "id": "..."
  }
}
```

---

# 17. List Response

```json
{
  "data": [{}],
  "page": {
    "next_cursor": "...",
    "has_more": true
  }
}
```

---

# 18. Do Not Always Return Total Count

Large tables should not automatically execute expensive:

```text
COUNT(*)
```

queries.

Where useful:

```text
include_total=true
```

may be explicitly supported by selected Admin queries.

---

# 19. Decimal Representation

Authoritative decimals are serialized as strings.

Example:

```json
{
  "amount": "1250.000000"
}
```

not:

```json
{
  "amount": 1250.0
}
```

This avoids making JavaScript binary floating-point representation part of financial authority.

---

# 20. Money DTO

Canonical:

```json
{
  "amount": "1250.00",
  "currency": "BDT"
}
```

---

# 21. Quantity DTO

Fraction-capable quantities also use decimal strings:

```json
{
  "quantity": "3.000000"
}
```

Storefront can present:

```text
3
```

for whole-piece Inventory.

---

# 22. Timestamp Representation

Machine-readable timestamps use an unambiguous ISO-style offset/UTC representation.

Example:

```text
2026-08-20T06:47:00+06:00
```

or:

```text
2026-08-20T00:47:00Z
```

Presentation localization belongs to clients/Settings.

---

# 23. Date Representation

Date-only:

```text
2026-08-20
```

---

# 24. Enum Representation

Machine codes:

```text
CONFIRMED

UNPAID

INSPECTION
```

not localized labels.

UI maps them to:

```text
Confirmed

নিশ্চিত
```

etc.

---

# 25. Nullable vs Missing

For PATCH:

```text
property omitted
→ no change
```

```text
property: null
→ clear value
```

only where the field explicitly supports clearing.

---

# 26. Unknown Request Fields

Sensitive command endpoints should reject unknown properties.

This helps prevent:

```text
mass assignment

typos

client assumptions
```

---

# 27. Response Evolution

Clients must tolerate new unknown response fields.

---

# 28. Request IDs

Every request receives:

```text
X-Request-ID
```

response header.

Client may submit one.

Server generates one if absent/invalid.

---

# 29. Correlation IDs

Internal/integration workflows may propagate:

```text
X-Correlation-ID
```

across:

```text
request

job

outbox

provider operation

webhook
```

---

# 30. Request ID Is Not Authentication

Never use it as:

```text
secret

session

idempotency identity
```

---

# 31. Authentication — Storefront

Most Storefront reads:

```text
Anonymous
```

Cart/Checkout use:

```text
opaque Storefront session/cart credential
```

rather than trusting arbitrary Cart UUID possession alone.

---

# 32. Future Customer Account

Customer Account will add a separate customer authentication scheme.

It does not share Admin sessions.

---

# 33. Authentication — Admin

Admin browser uses:

```text
secure server-managed session cookie
```

as established in Security Architecture.

---

# 34. OpenAPI Admin Security Scheme

Conceptually:

```yaml
AdminSession:
  type: apiKey
  in: cookie
  name: <session-cookie-name>
```

Exact cookie name remains implementation configuration.

---

# 35. Integration Authentication

Service Accounts use bearer-style credentials.

Conceptually:

```http
Authorization: Bearer <credential>
```

Credential resolves:

```text
Service Account

Organization

Capabilities

Scopes
```

---

# 36. API Credential Never Appears in URL

Forbidden:

```text
?api_key=...
```

---

# 37. Provider Callback Authentication

Provider-specific.

Potential:

```text
HMAC signature

public-key signature

shared-token signature

provider-specific verification
```

The generic OpenAPI contract documents each adapter's required headers.

---

# 38. Organization Selection

Admin/Integration clients do not obtain authorization by submitting:

```text
organization_id
```

in arbitrary payloads.

Organization derives from authenticated context.

---

# 39. Organization IDs in Responses

Can appear where useful for internal/integration consumers.

They do not grant access.

---

# 40. Authorization Documentation

Every Admin/Integration operation should include an OpenAPI extension such as:

```yaml
x-maevelle-capabilities:
  - orders.cancel
```

This enables:

```text
documentation

authorization tests

future tooling
```

without making OpenAPI the permission engine.

---

# 41. Scope Extension

Example:

```yaml
x-maevelle-scope:
  type: LOCATION
  source: request.location_id
```

for operations requiring Location access.

---

# 42. ETags and Resource Versions

Mutable Admin resources return:

```http
ETag: "v17"
```

where:

```text
17 = resource version
```

---

# 43. If-Match

Concurrency-sensitive Admin mutations use:

```http
If-Match: "v17"
```

HTTP's `If-Match` precondition is specifically suitable for preventing lost updates when a resource has changed since the client read it.

---

# 44. Missing Required Version

Where optimistic concurrency is mandatory:

```http
428 Precondition Required
```

RFC 6585 defines 428 for requests where the origin server requires a conditional request.

Problem code:

```text
EXPECTED_VERSION_REQUIRED
```

---

# 45. Stale Version

```http
412 Precondition Failed
```

with:

```text
VERSION_CONFLICT
```

The client should reload/merge current state rather than overwrite it.

---

# 46. Commands That Don't Require ETag

Examples:

```text
PlaceOrder

Provider callback processing

System reconciliation
```

use transactional current-state checks/idempotency instead.

---

# 47. Admin Transition Commands

Where stale UI matters:

```text
Cancel Order

Post Receipt

Archive Product
```

can require `If-Match`.

---

# 48. Idempotency Header

Critical commands require:

```http
Idempotency-Key: <opaque-client-key>
```

---

# 49. Idempotency-Key Requirements

Maevelle V1 contract:

```text
1–128 visible ASCII characters

opaque to server

stable across retries of same logical operation

new logical operation = new key
```

---

# 50. Required Idempotency Operations

Including:

```text
Place Order

Create Integration Order

Post Inbound Receipt

Post Fulfillment

Verify Payment

Create Refund

Record Supplier Payment

Provider callback processing where applicable

External provider create operation
```

---

# 51. Same Key + Same Payload

Server returns original logical result.

---

# 52. Same Key + Different Payload

Response:

```http
409 Conflict
```

Problem:

```text
IDEMPOTENCY_KEY_REUSED
```

---

# 53. Replayed Response Header

Recommended:

```http
Idempotency-Replayed: true
```

for observability/debugging.

---

# 54. Idempotency Is Not Business Duplicate Detection

Same Cart intentionally ordered tomorrow:

```text
new idempotency key
```

even if contents are identical.

---

# 55. HTTP Error Format

Maevelle adopts:

```text
application/problem+json
```

using the current HTTP Problem Details model defined by RFC 9457.

---

# 56. Base Problem Response

```json
{
  "type": "urn:maevelle:problem:item-unavailable",
  "title": "Item unavailable",
  "status": 409,
  "detail": "One or more items are no longer available.",
  "instance": "request:01...",
  "code": "ORDER_ITEM_UNAVAILABLE",
  "request_id": "01...",
  "retryable": false
}
```

---

# 57. Field Validation Errors

Extension:

```json
{
  "errors": [
    {
      "field": "phone",
      "code": "INVALID_PHONE",
      "message": "Enter a valid phone number."
    }
  ]
}
```

---

# 58. Sensitive Errors

Internal reason:

```text
CUSTOMER_FRAUD_POLICY_BLOCK
```

may map publicly to:

```text
ORDER_CANNOT_BE_PLACED
```

to avoid information leakage.

---

# 59. HTTP Status Mapping

## 400

Malformed transport/input.

```text
INVALID_REQUEST
```

## 401

Authentication missing/invalid.

## 403

Authenticated but unauthorized.

## 404

Resource absent or intentionally concealed across tenant boundary.

## 409

Business conflict.

Examples:

```text
ITEM_UNAVAILABLE

IDEMPOTENCY_KEY_REUSED

CUSTOMER_MERGE_CONFLICT
```

## 412

ETag/version mismatch.

## 422

Well-formed request that violates semantic validation.

Examples:

```text
INVALID_REFUND_AMOUNT

INCOMPLETE_RECEIPT
```

## 428

Required conditional mutation omitted `If-Match`.

## 429

Rate limited.

RFC 6585 defines 429 for rate limiting and permits `Retry-After` guidance.

## 503

Required infrastructure temporarily unavailable.

---

# 60. Retryable Flag

Problem responses may include:

```json
{
  "retryable": true
}
```

But client still obeys operation-specific retry rules.

---

# 61. `Retry-After`

Can accompany:

```text
429

503
```

where meaningful.

---

# 62. Pagination

Default model:

```text
cursor pagination
```

for operational collections.

---

# 63. Query Parameters

```text
limit=50
cursor=<opaque>
```

---

# 64. V1 Page Limits

Recommended:

```text
default: 25

maximum: 100
```

Endpoint may set lower maximum for expensive resources.

---

# 65. Cursor Is Opaque

Client must never parse or modify it.

---

# 66. Stable Sorting

Cursor query uses deterministic secondary key.

Conceptually:

```text
created_at DESC
id DESC
```

---

# 67. Sort Parameter

Where multiple sort modes are supported:

```text
sort=-created_at
```

or:

```text
sort=created_at
```

---

# 68. Supported Sort Whitelist

Endpoint documentation lists valid values.

No arbitrary SQL column names accepted.

---

# 69. Search Query

Free text:

```text
q=<search>
```

---

# 70. Filters

Use explicit documented parameters.

Example Orders:

```text
order_status=CONFIRMED
payment_status=UNPAID
created_from=...
created_to=...
customer_id=...
```

---

# 71. No Generic Filter Language V1

Do not expose:

```text
filter=(status='x' OR ...)
```

---

# 72. Date Ranges

Use explicit inclusive/exclusive semantics in each endpoint.

Recommended:

```text
created_from
→ inclusive

created_to
→ exclusive
```

to reduce boundary ambiguity.

---

# 73. Public Caching

Storefront Catalog reads can return public cache instructions.

Examples:

```text
Product

Category

Collection

Sizing Guide
```

---

# 74. Transactional Storefront Data

Do not shared-cache:

```text
Cart

Checkout

Guest Order Lookup

Payment instructions tied to Order
```

---

# 75. Admin Caching

Default:

```text
private/no-store
```

for authenticated operational resources unless a resource is explicitly safe.

---

# 76. Integration API Caching

Consumers should not assume mutable operational resources are fresh forever.

Use ETag where appropriate.

---

# 77. API Contract Source

OpenAPI description represents:

```text
HTTP contract
```

not:

```text
complete business architecture.
```

Domain documentation remains source of business semantics.

---

# 78. OpenAPI Repository Structure

Recommended:

```text
packages/contracts/openapi/
├── storefront/
│   ├── openapi.yaml
│   ├── paths/
│   └── schemas/
│
├── admin/
│   ├── openapi.yaml
│   ├── paths/
│   └── schemas/
│
├── integration/
│   ├── openapi.yaml
│   ├── paths/
│   └── schemas/
│
└── provider-callbacks/
    ├── openapi.yaml
    ├── paths/
    └── schemas/
```

---

# 79. OpenAPI Version

Initial:

```yaml
openapi: 3.1.1
```

The OpenAPI specification is language-agnostic and intended to describe HTTP API capabilities in a machine-readable form.

---

# 80. Future 3.2 Upgrade

OpenAPI 3.2.0 is already officially published; moving Maevelle's source documents to it should be a toolchain compatibility decision rather than a business-architecture change.

---

# 81. `operationId`

Every operation receives unique stable ID.

Examples:

```text
storefrontGetProduct

storefrontPlaceOrder

adminCancelOrder

adminAdjustInventory

integrationCreateOrder
```

---

# 82. OpenAPI Tags

Use domain tags:

```text
Catalog

Inventory

Orders

Payments

Customers

Procurement
```

rather than frontend-page tags.

---

# 83. Shared Components

Examples:

```text
Money

DecimalQuantity

Problem

CursorPage

Address

Pagination

RequestId
```

---

# 84. Internal Extensions

Recommended:

```text
x-maevelle-command

x-maevelle-query

x-maevelle-capabilities

x-maevelle-idempotency

x-maevelle-audit

x-maevelle-freshness

x-maevelle-sensitivity
```

---

# 85. Example

```yaml
x-maevelle-command: CancelOrder
x-maevelle-capabilities:
  - orders.cancel
x-maevelle-audit: required
x-maevelle-idempotency: supported
```

---

# 86. Contract CI

CI should:

```text
validate OpenAPI

bundle references

generate/check types

detect duplicate operationIds

detect missing security declaration

detect undocumented error response

run breaking-change checks
```

---

# 87. Synthetic Examples

OpenAPI examples must use:

```text
fake customer names

fake phone numbers

fake references
```

Never copy production PII.

---

# STOREFRONT API

# 88. Catalog Endpoints

```http
GET /api/storefront/v1/products/{handle}
```

Maps:

```text
GetStorefrontProduct
```

---

# 89. Product Response

Conceptually:

```json
{
  "data": {
    "id": "...",
    "handle": "summer-beach-hat",
    "title": "Summer Beach Hat",
    "description": "...",
    "options": [],
    "variants": [],
    "gallery": [],
    "price": {
      "amount": "650.00",
      "currency": "BDT"
    },
    "availability": {
      "state": "IN_STOCK"
    },
    "rating": {
      "average": "4.6",
      "count": 38
    }
  }
}
```

No:

```text
supplier cost

landed cost

warehouse quantity

private media
```

---

# 90. Categories

```http
GET /categories/{handle}
```

---

# 91. Collections

```http
GET /collections/{handle}
```

---

# 92. Search

```http
GET /search?q=hat&color=red&category=hats&cursor=...
```

Maps:

```text
SearchCatalog
```

Search results are advisory.

Checkout revalidates canonical Product/Variant state.

---

# 93. Size Guide

```http
GET /products/{handle}/size-guide
```

---

# 94. Reviews

```http
GET /products/{handle}/reviews
```

Parameters:

```text
rating

verified_only

with_media

sort

cursor

limit
```

---

# 95. Cart Creation

```http
POST /carts
```

Response contains:

```text
Cart ID

opaque access/session mechanism

expiration
```

---

# 96. Get Cart

```http
GET /carts/{cartId}
```

Requires correct Storefront cart authorization context.

Cart UUID alone is insufficient security.

---

# 97. Add Cart Line

```http
POST /carts/{cartId}/lines
```

Request:

```json
{
  "variant_id": "...",
  "quantity": "2"
}
```

---

# 98. Update Cart Line

```http
PATCH /carts/{cartId}/lines/{lineId}
```

---

# 99. Remove Cart Line

```http
DELETE /carts/{cartId}/lines/{lineId}
```

---

# 100. Cart Response

Returns current calculation preview:

```text
current price

subtotal

availability warning

discount preview
```

but no stock reservation guarantee.

---

# 101. Checkout Session

```http
POST /checkouts
```

Request:

```json
{
  "cart_id": "..."
}
```

---

# 102. Get Checkout

```http
GET /checkouts/{checkoutId}
```

---

# 103. Set Checkout Customer

```http
PUT /checkouts/{checkoutId}/customer
```

Example:

```json
{
  "name": "Customer",
  "phone": "...",
  "email": null
}
```

---

# 104. Set Delivery Address

```http
PUT /checkouts/{checkoutId}/delivery-address
```

---

# 105. Set Delivery Method

```http
PUT /checkouts/{checkoutId}/delivery-method
```

---

# 106. Set Payment Method

```http
PUT /checkouts/{checkoutId}/payment-method
```

---

# 107. Apply Coupon

```http
PUT /checkouts/{checkoutId}/coupon
```

Request:

```json
{
  "code": "EID10"
}
```

Does not consume usage.

---

# 108. Remove Coupon

```http
DELETE /checkouts/{checkoutId}/coupon
```

---

# 109. Refresh Checkout

```http
POST /checkouts/{checkoutId}/refresh
```

Maps:

```text
RefreshCheckoutCalculation
```

Returns:

```text
calculation_version
```

---

# 110. Place Order

```http
POST /checkouts/{checkoutId}/place-order
```

Required:

```http
Idempotency-Key: ...
```

Request:

```json
{
  "accepted_calculation_version": 14
}
```

---

# 111. Changed Checkout

If authoritative recalculation changed materially:

```http
409 Conflict
```

Problem:

```text
CHECKOUT_CHANGED
```

Response extension can include:

```json
{
  "checkout": {}
}
```

with fresh calculation.

---

# 112. Place Order Success

```http
201 Created
```

Response:

```json
{
  "data": {
    "order_id": "...",
    "order_number": "ORD-2026-00152",
    "public_reference": "...",
    "total": {
      "amount": "1450.00",
      "currency": "BDT"
    },
    "payment": {
      "status": "ACTION_REQUIRED",
      "method": "BKASH",
      "instructions": {}
    }
  }
}
```

---

# 113. Manual Payment Submission

```http
POST /orders/{publicOrderReference}/payment-attempts
```

Requires public Order access authorization, not merely guessable Order number.

Request:

```json
{
  "transaction_reference": "...",
  "claimed_amount": {
    "amount": "1450.00",
    "currency": "BDT"
  },
  "evidence_asset_id": null
}
```

---

# 114. Secure Guest Order Lookup

Avoid placing sensitive verification secrets in query strings.

Recommended:

```http
POST /order-lookups
```

with secure verification input/body.

Response is read-only despite POST transport.

---

# 115. Review Submission

```http
POST /reviews
```

with a secure review eligibility/access token supplied in an approved header/body mechanism.

Client does not submit:

```text
verified_purchase
customer_id
moderation_status
```

as authoritative values.

---

# ADMIN API

# 116. Product List

```http
GET /api/admin/v1/products
```

Supported:

```text
q
status
publication_status
category_id
product_type_id
cursor
limit
sort
```

---

# 117. Create Product

```http
POST /products
```

Maps:

```text
CreateProduct
```

---

# 118. Product Detail

```http
GET /products/{productId}
```

Returns:

```http
ETag: "v17"
```

---

# 119. Update Product

```http
PATCH /products/{productId}
If-Match: "v17"
```

---

# 120. Publish

```http
POST /products/{productId}/publish
If-Match: "v17"
```

---

# 121. Unpublish

```http
POST /products/{productId}/unpublish
```

---

# 122. Archive Product

```http
POST /products/{productId}/archive
```

No historical DELETE.

---

# 123. Variants

```http
POST  /products/{productId}/variants
GET   /variants/{variantId}
PATCH /variants/{variantId}
POST  /variants/{variantId}/archive
```

---

# 124. Variant Price

```http
PUT /variants/{variantId}/prices/{currencyCode}
```

Permission:

```text
products.pricing.manage
```

---

# 125. Categories

```http
GET  /categories
POST /categories

GET   /categories/{id}
PATCH /categories/{id}

POST /categories/{id}/move
POST /categories/{id}/archive
```

Category move is semantic because hierarchy/cycle rules apply.

---

# 126. Media Library

```http
GET /media/assets
GET /media/assets/{assetId}
PATCH /media/assets/{assetId}
POST /media/assets/{assetId}/archive
GET /media/assets/{assetId}/usages
```

---

# 127. Upload Session

```http
POST /media/upload-sessions
```

Response:

```text
upload session

object-storage upload target

required headers

expiration
```

---

# 128. Complete Upload

```http
POST /media/upload-sessions/{id}/complete
```

This triggers validation/processing.

---

# 129. Inventory List

```http
GET /inventory
```

Filters:

```text
location_id

product_id

variant_id

availability

q
```

---

# 130. Inventory Detail

```http
GET /inventory/items/{inventoryItemId}
```

---

# 131. Inventory Ledger

```http
GET /inventory/items/{inventoryItemId}/ledger
```

---

# 132. Adjust Inventory

```http
POST /inventory/adjustments
```

Required:

```text
inventory.adjust

Idempotency-Key
```

Request:

```json
{
  "inventory_item_id": "...",
  "location_id": "...",
  "condition": "SELLABLE",
  "adjustment_type": "DIFFERENCE",
  "quantity": "-2",
  "reason_code": "COUNT_CORRECTION",
  "note": "Physical recount"
}
```

---

# 133. Target-Based Adjustment

Example:

```json
{
  "adjustment_type": "SET_COUNT",
  "target_quantity": "50",
  "expected_level_version": 31
}
```

prevents stale set-to-value updates.

---

# 134. Inventory Condition Change

```http
POST /inventory/condition-changes
```

---

# 135. Stocktakes

```http
POST /inventory/stocktakes

GET /inventory/stocktakes/{id}

PATCH /inventory/stocktakes/{id}/lines/{lineId}

POST /inventory/stocktakes/{id}/post
```

---

# 136. Locations

```http
GET   /locations
POST  /locations
GET   /locations/{id}
PATCH /locations/{id}

POST /locations/{id}/deactivate
```

---

# 137. Transfers

```http
GET  /transfers
POST /transfers

GET /transfers/{id}

POST /transfers/{id}/approve
POST /transfers/{id}/dispatch
POST /transfers/{id}/receive
```

---

# 138. Suppliers

```http
GET /suppliers
POST /suppliers

GET /suppliers/{id}
PATCH /suppliers/{id}
```

---

# 139. Purchases

```http
GET /purchases
POST /purchases

GET /purchases/{id}
PATCH /purchases/{id}

POST /purchases/{id}/confirm
POST /purchases/{id}/amend
POST /purchases/{id}/cancel-quantity
```

---

# 140. Supplier Invoices

```http
POST /supplier-invoices
GET  /supplier-invoices/{id}
```

---

# 141. Supplier Payments

```http
POST /supplier-payments
GET  /supplier-payments/{id}

POST /supplier-payments/{id}/allocations
```

Payment may remain partially unallocated.

---

# 142. Inbound Shipments

```http
GET /inbound-shipments
POST /inbound-shipments

GET /inbound-shipments/{id}
PATCH /inbound-shipments/{id}

POST /inbound-shipments/{id}/dispatch
POST /inbound-shipments/{id}/arrival
POST /inbound-shipments/{id}/exceptions
```

---

# 143. Shipment Purchase Allocation

```http
POST /inbound-shipments/{id}/purchase-allocations
```

---

# 144. Inbound Receipts

```http
POST /inbound-shipments/{shipmentId}/receipts

GET /inbound-receipts/{receiptId}

PATCH /inbound-receipts/{receiptId}

POST /inbound-receipts/{receiptId}/resolve-item

POST /inbound-receipts/{receiptId}/post
```

---

# 145. Post Receipt

Required:

```http
Idempotency-Key: ...
If-Match: "v..."
```

Maps:

```text
PostInboundReceipt
```

---

# 146. Receipt Correction

```http
POST /inbound-receipts/{id}/corrections
```

Never PATCH a posted physical quantity.

---

# 147. Landed Cost

```http
POST /landed-cost/worksheets

GET /landed-cost/worksheets/{id}

POST /landed-cost/worksheets/{id}/revisions

POST /landed-cost/revisions/{id}/calculate

POST /landed-cost/revisions/{id}/finalize

POST /landed-cost/revisions/{id}/adjustments
```

---

# 148. Customer List

```http
GET /customers
```

Supports:

```text
q

phone

email

status

tag_id
```

subject to permission.

---

# 149. Customer Detail

```http
GET /customers/{id}
```

DTO fields depend on:

```text
customers.view_sensitive
```

---

# 150. Customer Merge Preview

```http
POST /customers/merge-previews
```

Request:

```json
{
  "source_customer_id": "...",
  "target_customer_id": "..."
}
```

---

# 151. Merge Customer

```http
POST /customers/{sourceId}/merge
```

Required:

```text
customers.merge

step-up if configured

reason
```

---

# 152. Order List

```http
GET /orders
```

Filters:

```text
q

order_status

payment_status

fulfillment_status

customer_id

source

created_from

created_to
```

---

# 153. Order Workspace

```http
GET /orders/{orderId}
```

Purpose-built read model includes:

```text
Order

Lines

Customer summary

Payment summary

Reservation summary

Fulfillment

timeline

holds
```

---

# 154. Manual Order

```http
POST /orders
```

Maps:

```text
CreateManualOrder
```

Required idempotency.

---

# 155. Cancel Order

```http
POST /orders/{orderId}/cancel
```

---

# 156. Partial Cancellation

```http
POST /orders/{orderId}/cancellations
```

Request:

```json
{
  "reason_code": "CUSTOMER_REQUEST",
  "lines": [
    {
      "order_line_id": "...",
      "quantity": "1"
    }
  ]
}
```

---

# 157. Hold

```http
POST /orders/{id}/holds
```

Release:

```http
POST /orders/{id}/holds/{holdId}/release
```

---

# 158. Fulfillment

```http
POST /orders/{orderId}/fulfillments
```

---

# 159. Post Fulfillment

```http
POST /fulfillments/{fulfillmentId}/post
```

Required idempotency.

Consumes specified Reservation Allocation provenance.

---

# 160. Payment Attempts Queue

```http
GET /payment-attempts
```

---

# 161. Verify Payment Attempt

```http
POST /payment-attempts/{id}/verify
```

Required:

```text
payments.verify

Idempotency-Key

If-Match where workflow requires
```

---

# 162. Reject Attempt

```http
POST /payment-attempts/{id}/reject
```

---

# 163. Payments

```http
GET /payments
GET /payments/{id}
```

---

# 164. Unallocated Payments

```http
GET /payments?allocation_status=UNALLOCATED
```

---

# 165. Allocate Payment

```http
POST /payments/{id}/allocations
```

---

# 166. Refund

```http
POST /refunds
```

Required:

```text
payments.refund

Idempotency-Key
```

---

# 167. Refund Detail

```http
GET /refunds/{id}
```

Possible status:

```text
REQUESTED

PROCESSING

UNKNOWN_EXTERNAL_OUTCOME

COMPLETED

FAILED
```

---

# 168. Refund Reconciliation

```http
POST /refunds/{id}/reconcile
```

highly controlled/system-oriented.

---

# 169. Financial Accounts

```http
GET /financial-accounts
POST /financial-accounts

GET /financial-accounts/{id}
GET /financial-accounts/{id}/ledger
```

---

# 170. Expenses

```http
GET /expenses
POST /expenses

GET /expenses/{id}
PATCH /expenses/{id}
```

---

# 171. Record Expense

```http
POST /expenses/{id}/record
```

if Draft→Recorded lifecycle used.

---

# 172. Expense Payment

```http
POST /expenses/{id}/payments
```

---

# 173. Expense Adjustment

```http
POST /expenses/{id}/adjustments
```

---

# 174. Finance Transfer

```http
POST /financial-transfers
```

---

# 175. Reviews Moderation

```http
GET /reviews/moderation-queue

GET /reviews/{id}

POST /review-revisions/{revisionId}/approve

POST /review-revisions/{revisionId}/reject

POST /reviews/{id}/hide

POST /reviews/{id}/restore-visibility
```

---

# 176. Merchant Response

```http
PUT /reviews/{id}/merchant-response
```

---

# 177. Promotions

```http
GET /promotions
POST /promotions

GET /promotions/{id}
PATCH /promotions/{id}

POST /promotions/{id}/revisions

POST /promotion-revisions/{id}/activate

POST /promotions/{id}/disable
```

---

# 178. Coupon Codes

```http
POST /promotions/{id}/coupons

GET /promotions/{id}/coupons

POST /coupons/{id}/disable
```

---

# 179. Promotion Simulator

Strongly preferred:

```http
POST /promotions/{id}/simulate
```

Request contains synthetic Cart/context.

No Usage committed.

Response explains:

```text
eligible/not eligible

condition results

discount

allocation

combination decisions
```

---

# 180. Notifications

```http
GET /notifications

GET /notifications/{id}

POST /notifications/{id}/retry
```

primarily operational Admin views.

---

# 181. IAM Memberships

```http
GET /memberships
POST /memberships/invitations

GET /memberships/{id}

POST /memberships/{id}/disable
```

---

# 182. Permissions

```http
GET /memberships/{id}/permissions

PUT /memberships/{id}/permissions
```

Protected by:

```text
access.manage
```

and expected-version protection.

---

# 183. Sessions

```http
GET /sessions

DELETE /sessions/{id}

POST /sessions/revoke-others
```

---

# 184. Service Accounts

```http
GET /service-accounts
POST /service-accounts
```

---

# 185. API Credentials

```http
POST /service-accounts/{id}/credentials

POST /api-credentials/{id}/revoke
```

Secret shown only at controlled creation response.

---

# 186. Settings

```http
GET /settings

PATCH /settings/{key}
```

or domain-specific settings endpoints for complex policies.

High-impact Settings retain domain-specific permission requirements.

---

# 187. Audit

```http
GET /audit-events
```

Permission:

```text
audit.view
```

Filters:

```text
actor_id

action

target_type

target_id

created_from

created_to
```

---

# 188. Integrity Issues

```http
GET /integrity-issues
GET /integrity-issues/{id}
```

---

# 189. Repair

Purpose-built routes.

Examples:

```http
POST /inventory/items/{id}/rebuild-level

POST /orders/{id}/rebuild-financial-summary

POST /integrations/operations/{id}/reconcile
```

No:

```http
POST /repair
{
  "table": "...",
  "field": "..."
}
```

---

# 190. Jobs

```http
GET /jobs/{jobId}
```

for user-visible async operations.

---

# 191. Dead Letter Operations

Admin:

```http
GET /jobs?status=DEAD_LETTER

POST /jobs/{id}/retry
```

requires privileged capability.

---

# INTEGRATION API

# 192. Purpose

V1 Integration API can remain:

```text
private / trusted
```

before opening a public developer ecosystem.

---

# 193. Authentication

Every Integration API request requires:

```text
Service Account credential
```

except explicitly documented future cases.

---

# 194. Integration Product Read

```http
GET /api/integration/v1/products
GET /api/integration/v1/products/{id}
```

Only fields covered by integration contract.

---

# 195. Integration Orders

```http
GET /orders
GET /orders/{id}
```

---

# 196. Create Integration Order

```http
POST /orders
```

Required:

```text
orders.create

Idempotency-Key
```

Maps into same Order application architecture rather than custom integration Order logic.

---

# 197. Integration Inventory Availability

```http
GET /inventory/availability
```

Example filter:

```text
sku
variant_id
location_id
```

Return only caller-authorized Location information.

---

# 198. Integration Customer Data

Disabled unless credential explicitly has appropriate capability.

Customer data should be minimized.

---

# 199. Integration Pagination

Same cursor conventions as Admin API.

---

# 200. Integration Error Contract

Same Problem Details format.

No leaking internal stack/provider secrets.

---

# FILE / IMPORT / EXPORT CONTRACTS

# 201. File Upload

Large file bytes should normally go directly to approved object-storage upload target rather than pass through the API process.

Flow:

```text
Create Upload Session
      ↓
Upload File
      ↓
Complete Upload
      ↓
Validate / Process
```

---

# 202. Import Creation

```http
POST /imports
```

Request references private uploaded Asset.

---

# 203. Import Lifecycle

```text
UPLOADED

VALIDATING

PREVIEW_READY

RUNNING

PARTIALLY_COMPLETED

COMPLETED

FAILED
```

---

# 204. Import Preview

```http
GET /imports/{id}/preview
```

---

# 205. Confirm Import

```http
POST /imports/{id}/confirm
```

returns:

```http
202 Accepted
```

with Job reference.

---

# 206. Export

```http
POST /exports
```

returns Job.

---

# 207. Export Completion

```http
GET /exports/{id}
```

returns controlled short-lived download access when ready.

---

# 208. Export Security

Generated files are:

```text
private

permission-controlled

retention-limited
```

---

# ASYNC JOB RESPONSE

# 209. Accepted Operation

```http
202 Accepted
```

Response:

```json
{
  "data": {
    "job_id": "...",
    "status": "PENDING"
  }
}
```

---

# 210. Job Status

```json
{
  "data": {
    "id": "...",
    "status": "RUNNING",
    "progress": {
      "completed": 100,
      "total": 200
    }
  }
}
```

Progress is optional where meaningful.

---

# PROVIDER CALLBACK API

# 211. Callback Route

General shape:

```text
/api/provider-callbacks/v1/{provider}/{integrationAccountPublicId}
```

Individual adapters may need provider-specific suffixes.

---

# 212. Account ID Is Not Secret

Security still requires:

```text
provider signature/authentication
```

---

# 213. Raw Payload Verification

If provider signature covers raw body:

```text
verify before modifying/parsing bytes
```

then normalize.

---

# 214. Callback Processing

Flow:

```text
Receive

Payload size check

Provider authentication

Replay/deduplication

Durable Provider Event

Acknowledge or process

Normalize

Application Command

Domain validation
```

---

# 215. Callback Retry

Duplicate Provider Event must not duplicate:

```text
Payment

Refund

Delivery transition
```

---

# 216. Provider Response

Adapter owns exact status/body expected by the provider.

Generic API code should not assume every provider expects identical acknowledgement.

---

# OUTBOUND WEBHOOK CONTRACT

# 217. Event Envelope

Recommended:

```json
{
  "id": "019...",
  "type": "order.created",
  "version": 1,
  "occurred_at": "2026-08-20T00:47:00Z",
  "resource": {
    "type": "order",
    "id": "019...",
    "version": 1
  },
  "data": {}
}
```

---

# 218. Webhook Headers

Recommended:

```text
Maevelle-Event-Id

Maevelle-Event-Type

Maevelle-Event-Version

Maevelle-Timestamp

Maevelle-Signature
```

---

# 219. Signature

Recommended canonical signing input:

```text
timestamp
+
"."
+
raw request body
```

using:

```text
HMAC-SHA256
```

with endpoint secret.

Exact signature string format must be frozen before external publication.

---

# 220. Webhook Delivery Semantics

Contract:

```text
at least once

duplicates possible

strict global ordering not guaranteed
```

Consumers deduplicate by:

```text
event id
```

and can use resource version to detect stale events.

---

# 221. Webhook Success

Endpoint acknowledges quickly with:

```text
2xx
```

after safely accepting event.

---

# 222. Webhook Events V1 Candidates

```text
order.created

order.confirmed

order.cancelled

fulfillment.created

fulfillment.completed

payment.confirmed

refund.completed

inventory.low_stock

shipment.arrived

inbound_receipt.posted

review.published

customer.created
```

Only events that become stable external contracts should be published.

---

# 223. Internal Events Are Larger Set

Not every internal Outbox/domain event becomes a public Webhook.

---

# 224. Webhook Test

Admin:

```http
POST /webhook-endpoints/{id}/test
```

produces synthetic test event only.

---

# 225. Webhook Replay

Admin:

```http
POST /webhook-deliveries/{id}/retry
```

Same logical Event ID.

New Delivery Attempt.

---

# RATE LIMIT CONTRACT

# 226. Storefront

Different budgets for:

```text
Catalog reads

Search

Cart

Checkout

Order placement

Review submission

Payment reference submission
```

---

# 227. Admin

Rate limits protect abuse/errors without obstructing normal internal operations.

---

# 228. Integration API

Rate limit primarily by:

```text
Service Account

Organization

Endpoint
```

---

# 229. Provider Callback

Protection combines:

```text
rate control

signature authentication

payload limit

event deduplication
```

---

# 230. 429 Response

Problem response:

```text
RATE_LIMIT_EXCEEDED
```

and `Retry-After` where practical.

---

# API SECURITY CLASSIFICATION

# 231. PUBLIC

Examples:

```text
Product

Category

Collection

Search
```

---

# 232. SESSION-BOUND

```text
Cart

Checkout
```

---

# 233. GUEST-SENSITIVE

```text
Order lookup

Payment attempt
```

requires explicit Order/customer verification.

---

# 234. ADMIN

Internal Membership session required.

---

# 235. SENSITIVE ADMIN

Examples:

```text
Customer PII

Payment evidence

Supplier cost

Finance

Audit
```

additional capabilities.

---

# 236. HIGH-RISK ADMIN

Examples:

```text
Refund

Permission modification

Secret rotation

Customer merge

Large export
```

can require:

```text
step-up authentication
```

---

# 237. SERVICE

Integration Service Account.

---

# 238. PROVIDER

Provider-authenticated callback.

---

# DATA EXPOSURE RULES

# 239. Storefront Product DTO Must Never Expose

```text
purchase price

supplier

landed cost

internal SKU notes

actual warehouse stock count

internal Asset metadata

audit
```

SKU may be exposed only where Storefront requirements explicitly need it.

---

# 240. Customer Public DTO

Never exposes:

```text
customer internal ID

phone/email of other Customers

internal notes

risk flags
```

---

# 241. Admin DTO Masking

Permission-aware.

Example:

```text
customers.view
→ masked phone

customers.view_sensitive
→ full phone
```

where operationally appropriate.

---

# 242. Integration DTOs

Have their own explicit schemas.

Do not reuse:

```text
AdminCustomerDTO
```

as integration contract merely because it already exists.

---

# API CONTRACT TESTS

# 243. Every Endpoint Must Test

```text
valid request

invalid schema

unauthenticated

unauthorized

cross-Organization ID

not found

business conflict

success response schema
```

---

# 244. Mutable Resource Tests

Also:

```text
missing If-Match

correct If-Match

stale If-Match
```

where concurrency protection is required.

---

# 245. Critical Command Tests

Also:

```text
missing Idempotency-Key

same key same body

same key changed body

response lost/retry
```

---

# 246. Pagination Tests

```text
stable cursor

new row inserted between pages

deleted/archived row

invalid cursor

maximum limit
```

---

# 247. Problem Contract Tests

Every documented domain error has:

```text
HTTP status

problem code

safe detail

OpenAPI schema
```

---

# 248. API Boundary Security Tests

Try submitting protected fields:

```text
organization_id

is_owner

payment_status

verified_purchase

inventory_quantity

landed_cost
```

through unrelated request DTOs.

Expected:

```text
rejected / impossible
```

---

# 249. Public Enumeration Tests

Attempt guessing:

```text
Order numbers

Customer IDs

Cart IDs
```

must not expose unauthorized data.

---

# 250. Webhook Contract Tests

```text
correct signature

bad signature

old timestamp

duplicate event

retry

timeout

500

429

unsafe endpoint

out-of-order delivery
```

---

# OPENAPI GOVERNANCE

# 251. Contract-First for Stable Interfaces

For externally stable Integration/Webhook interfaces:

```text
update architecture
→ update OpenAPI
→ review
→ generate/implement
```

---

# 252. Admin/Storefront Development

Can evolve implementation and specification together.

CI prevents them drifting.

---

# 253. Breaking Change Detection

Pull request should flag:

```text
removed path

removed field

required field added

response type changed

enum removed/renamed
```

---

# 254. Deprecation

Deprecated contract remains available through an announced migration period for external integrations.

Do not silently remove it.

---

# 255. Generated Types

Strongly recommended:

```text
OpenAPI
→ TypeScript DTO/client types
```

for:

```text
Storefront

Admin

Integration SDK foundation
```

Domain entities should not be generated from OpenAPI.

---

# 256. Generated Server Stubs

Optional.

Avoid framework generation that obscures application architecture.

---

# 257. Contract Ownership

Domain/application team owns:

```text
meaning
```

API layer owns:

```text
transport shape
```

Frontend does not independently redefine payloads.

---

# API INVARIANTS

## API-CONTRACT-INV-001

All externally accessible business mutations map to explicit application Commands.

## API-CONTRACT-INV-002

GET never performs a business mutation.

## API-CONTRACT-INV-003

Public clients cannot directly set derived domain states.

## API-CONTRACT-INV-004

API DTOs are separate from ORM/domain entities.

## API-CONTRACT-INV-005

Storefront DTOs contain only Storefront-safe data.

## API-CONTRACT-INV-006

Organization authorization never derives from a client-provided Organization ID alone.

## API-CONTRACT-INV-007

Critical creation/posting commands use idempotency.

## API-CONTRACT-INV-008

Idempotency key reuse with different logical input fails.

## API-CONTRACT-INV-009

Optimistically edited resources expose versions/ETags.

## API-CONTRACT-INV-010

Required stale-write protection cannot be bypassed because the UI omitted `If-Match`.

## API-CONTRACT-INV-011

API financial decimals use exact string representation.

## API-CONTRACT-INV-012

Public Order access cannot be obtained merely by guessing the human Order number.

## API-CONTRACT-INV-013

Pagination cursors remain opaque.

## API-CONTRACT-INV-014

Filters and sort keys are explicit whitelists.

## API-CONTRACT-INV-015

Errors use stable machine-readable problem codes.

## API-CONTRACT-INV-016

Public errors never expose stack traces, SQL or secrets.

## API-CONTRACT-INV-017

Async acceptance never pretends the requested business effect has completed.

## API-CONTRACT-INV-018

Uploaded bytes are untrusted until Media processing validates them.

## API-CONTRACT-INV-019

Provider callback authenticity never bypasses local business validation.

## API-CONTRACT-INV-020

Outbound Webhook Event schemas are versioned independently.

## API-CONTRACT-INV-021

Webhook duplicates are an expected supported condition.

## API-CONTRACT-INV-022

Integration API credentials expose only explicitly granted capabilities.

## API-CONTRACT-INV-023

Admin/Integration write contracts do not permit mass assignment of protected fields.

## API-CONTRACT-INV-024

Historical business records use semantic lifecycle commands rather than generic DELETE.

## API-CONTRACT-INV-025

OpenAPI documents transport contracts but never replace domain architecture as business source of truth.

---

# 258. V1 Mandatory API Contract Scope

```text
✓ Storefront API

✓ Admin API

✓ Private Integration API foundation

✓ Provider Callback API

✓ Versioned /v1 paths

✓ OpenAPI 3.1.1 source

✓ Stable operationId

✓ Purpose-built DTOs

✓ Money schema

✓ Decimal quantity schema

✓ Problem Details

✓ Stable error codes

✓ Request IDs

✓ Correlation foundation

✓ Admin session auth

✓ Storefront session/cart auth

✓ Service Account auth

✓ Provider callback auth abstraction

✓ Capability metadata

✓ Scope authorization

✓ ETag / If-Match

✓ 428 missing-precondition behavior

✓ 412 stale-version behavior

✓ Idempotency-Key

✓ Cursor pagination

✓ Filters

✓ Sorting

✓ Search

✓ Page limits

✓ Async Job response

✓ Upload session contract

✓ Import/Export contracts

✓ Storefront Product

✓ Cart

✓ Checkout

✓ Place Order

✓ Admin Product

✓ Inventory

✓ Stocktake

✓ Locations

✓ Transfers

✓ Procurement

✓ Inbound Shipment

✓ Inbound Receipt

✓ Landed Cost

✓ Customers

✓ Orders

✓ Fulfillment

✓ Payments

✓ Refunds

✓ Finance

✓ Reviews

✓ Promotions

✓ IAM

✓ Integrations

✓ Webhook endpoints

✓ Integrity/repair routes

✓ Outbound Webhook envelope

✓ Webhook signature contract foundation

✓ Contract testing

✓ Breaking-change detection
```

---

# 259. Important Architectural Gap Discovered

Before moving directly into Admin/Storefront screens, there is one remaining **business-domain gap** that is now too important to ignore:

```text
PRICING & ORDER TOTALS
```

We have referenced:

```text
Variant Price

Current Selling Price

Compare-at Price

Promotion Base Amount

Product-level discount

Order-level discount

Delivery Charge

Delivery Discount

Tax

Manual Discount

Order subtotal

Final total

Checkout calculation version

Refundable net line amount
```

across many documents.

But we have **not yet created one dedicated source-of-truth architecture defining how those amounts combine**.

---

# 260. Why This Matters

Consider:

```text
Variant price = ৳1,000

Product promotion = 10% off
→ ৳900

Order coupon = ৳100 fixed
→ ?

Delivery = ৳120

Free-delivery promotion
→ ?

Manual Admin discount = ৳50

Tax/VAT future
→ ?

Final payable = ?
```

Without a canonical calculation pipeline, different implementations could calculate:

```text
Storefront total

Admin manual Order total

Refund amount

Invoice

Analytics revenue
```

differently.

That would be a serious architecture leak.

---

# 261. Therefore Recommended Next Document

Before Admin Information Architecture, create:

```text
docs/domains/pricing/pricing-order-totals-architecture.md
```

Central rule:

> **Price Definition, Price Resolution, Pricing Adjustment, Discount Allocation, Delivery Charge, Tax Adjustment and Order Total Snapshot are distinct concepts.**

It should settle:

```text
Base Price

Selling Price

Compare-at Price

Promotion Base

Price Lists future

Currency

Price Resolution

Product Adjustment

Order Adjustment

Manual Discount

Delivery Price

Delivery Discount

Tax/VAT boundary

Subtotal

Gross Merchandise Amount

Discount Total

Net Merchandise Amount

Delivery

Tax

Grand Total

Rounding

Zero-value Orders

Negative protection

Checkout calculation fingerprint/version

Order immutable totals

Order amendments

Partial cancellation

Return/refund calculations

Analytics revenue amount

Invoice amount

Historical pricing snapshot
```

---

# 262. Calculation Pipeline To Validate Next

Conceptually:

```text
CATALOG / PRICE SOURCE
        │
        ▼
Resolved Unit Price
        │
        ▼
Line Gross
        │
        ▼
Product-Level Promotion Adjustments
        │
        ▼
Line Net Before Order Discount
        │
        ▼
Order-Level Discount Allocation
        │
        ▼
Net Merchandise
        │
        ├── Delivery Charge
        │      ↓
        │   Delivery Discount
        │
        ├── Tax/VAT future
        │
        ▼
FINAL ORDER TOTAL
```

The exact order and rounding must be explicit.

---

# 263. Why Insert Pricing Now?

Because the transport contracts now expose:

```text
Money

Checkout Calculation

Order Totals

Refund amounts
```

but deliberately do not define the arithmetic themselves.

Before UI design or coding, that arithmetic needs a single authoritative domain specification.

---

# 264. Sequence After Pricing

Then continue:

```text
Pricing & Order Totals Architecture
        ↓
Admin Information Architecture
        ↓
Storefront UX Architecture
        ↓
Testing Master Plan
        ↓
Operations / Runbooks
        ↓
Implementation Roadmap
        ↓
Implementation
```

---

**End of API & OpenAPI Contract Specification v0.1**
