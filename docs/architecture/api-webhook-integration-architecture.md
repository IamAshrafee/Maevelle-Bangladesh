# Maevelle Ecommerce — API, Webhooks & Integration Architecture

**Document:** `docs/architecture/api-webhook-integration-architecture.md`
**Status:** Initial Architecture Design / Living Document
**Version:** 0.1
**Related:** All domain architecture documents, `requirements.md`, `scope.md`

---

# 1. Purpose

This document defines how Maevelle exposes and consumes stable interfaces across:

```text
Storefront

Internal Admin Portal

Future Mobile Applications

External Integrations

Courier Providers

Payment Providers

Notification Providers

Third-Party Developers

Background Workers

Future External Services
```

while preserving all domain rules already established.

---

# 2. Core Principle

> **API design follows business capabilities, not database tables.**

Bad:

```text
PATCH /inventory-levels/123
{
  "quantity": 500
}
```

This bypasses:

```text
Inventory Ledger

Adjustment Reason

Audit

Concurrency

Permissions

Reconciliation
```

Correct conceptual command:

```text
POST /inventory/adjustments
```

with:

```text
Inventory Item

Location

Target or Difference

Reason

Idempotency Key

Expected Version
```

---

# 3. Another Example

Bad:

```text
PATCH /orders/123
{
  "status": "cancelled"
}
```

Correct:

```text
POST /orders/{order}/cancel
```

because cancellation has:

```text
Eligibility

Reason

Reservation Release

Refund implications

Fulfillment checks

Audit

Events
```

---

# 4. Another Example

Bad:

```text
PATCH /payments/123
{
  "status": "paid"
}
```

Correct:

```text
POST /payments/{payment}/verify
```

because Payment verification must establish financial truth.

---

# 5. Central Architecture

```text
CLIENT / INTEGRATION
        │
        ▼
API CONTRACT
        │
        ▼
APPLICATION COMMAND / QUERY
        │
        ▼
DOMAIN
        │
        ▼
TRANSACTIONAL DATA
```

Never:

```text
CLIENT
   ↓
DATABASE CRUD
```

---

# 6. Second Core Principle

> **Commands and Queries have different semantics.**

A **Query** asks:

```text
What is true?
```

A **Command** asks:

```text
Please attempt this business action.
```

---

# 7. Query Examples

```text
Get Product

Search Products

List Orders

Get Inventory Availability

Get Customer History

Get Payment Details
```

---

# 8. Command Examples

```text
Place Order

Cancel Order

Verify Payment

Dispatch Shipment

Receive Inventory

Adjust Stock

Finalize Landed Cost

Approve Review
```

---

# 9. Commands Are Not Generic Updates

A command may:

```text
succeed

fail validation

fail authorization

conflict with current state

require idempotent replay

produce several domain effects
```

---

# 10. Third Core Principle

> **API DTOs are contracts, not serialized domain/database objects.**

Do not automatically serialize ORM entities.

---

# 11. Why?

Internal domain object might contain:

```text
Supplier Cost

Internal Flags

Private Notes

Audit Data

Deleted Metadata

Database Fields
```

while Storefront needs:

```text
Title

Price

Public Media

Options

Availability
```

---

# 12. Purpose-Built DTOs

Examples:

```text
StorefrontProduct

AdminProductSummary

AdminProductDetail

OrderSummary

OrderOperationalDetail

CustomerSummary

PublicOrderStatus
```

---

# 13. Different Interfaces Can Expose Different Views

One Product:

```text
Catalog Product
```

can produce:

```text
StorefrontProductDTO

ProductAdminDTO

ProductSearchDTO

ProductAnalyticsDTO

IntegrationProductDTO
```

without duplicating Product truth.

---

# 14. API Surfaces

Recommended logical API surfaces:

```text
Storefront API

Admin API

Integration API

Webhook API

Provider Callback API

Internal Application Interfaces
```

---

# 15. Storefront API

Used by:

```text
Maevelle Web Storefront

Future Mobile App

Future Alternative Theme
```

Characteristics:

```text
Mostly public reads

Anonymous Cart

Guest Checkout

Highly rate limited

Privacy constrained

Performance optimized
```

---

# 16. Admin API

Used by:

```text
Business Operations Portal
```

Characteristics:

```text
Authenticated

Capability protected

Scope protected

Rich operational data

Business command heavy

Audit sensitive
```

---

# 17. Integration API

Used by:

```text
Trusted external systems

Future marketplace adapters

Future ERP/accounting integrations

External developer applications
```

Characteristics:

```text
API credentials

Scoped capabilities

Version stability

Rate limits

Idempotency
```

---

# 18. Webhook API

Outbound:

```text
Maevelle
→ External Consumer
```

---

# 19. Provider Callback API

Inbound:

```text
Payment Provider
Courier
Messaging Provider
→ Maevelle
```

These are security-sensitive integration endpoints.

---

# 20. Internal Application Interfaces

Inside modular monolith:

```text
Order Module
→ Inventory Application Service
```

does not need HTTP.

Use direct application interfaces where appropriate.

---

# 21. API-First Does Not Mean HTTP Everywhere

Important.

API-first means:

```text
stable explicit contracts
```

not:

```text
every module must call localhost HTTP.
```

---

# 22. Modular Monolith Communication

Preferred:

```text
Module
   ↓
Published Application Interface
   ↓
Other Module
```

not:

```text
Module
→ another module's database tables
```

---

# 23. Example

Orders may call:

```text
InventoryReservations.reserve(...)
```

rather than editing inventory-level tables directly.

---

# 24. Future Extraction

If Inventory later becomes a service:

```text
same conceptual interface
→ remote transport adapter
```

can evolve.

This supports future scalability without premature microservices.

---

# 25. Transport Style

Recommended V1 external API:

```text
HTTP

JSON

REST-style resources
+
semantic command endpoints
```

---

# 26. Why Not Pure CRUD REST?

Business domains contain state transitions.

Resources alone cannot express all semantics cleanly.

---

# 27. Why Not GraphQL First?

GraphQL could eventually be useful for certain read-heavy external clients.

But V1 benefits from:

```text
simpler authorization

clear command semantics

simpler caching

simpler observability

simpler public contract management
```

using HTTP JSON APIs.

---

# 28. Future GraphQL

Possible as:

```text
read/query façade
```

later.

It must still consume domain/application services.

---

# 29. URL Versioning

Recommended external contract base:

```text
/api/v1/
```

for stable public/integration interfaces.

---

# 30. Admin API Versioning

Admin frontend and backend may deploy together.

Still maintain explicit API contracts.

Can use:

```text
/api/admin/v1/
```

or equivalent.

Exact route layout decided during implementation.

---

# 31. Storefront API Versioning

Potential:

```text
/api/storefront/v1/
```

especially useful if:

```text
future mobile app
```

needs long-lived compatibility.

---

# 32. Version Does Not Mean Every Tiny Change Requires V2

Backward-compatible additions can remain V1.

---

# 33. Breaking Changes

Examples:

```text
Removing field

Changing field meaning

Changing type

Changing command semantics

Changing error contract incompatibly
```

require controlled version transition.

---

# 34. Additive Changes

Generally safe:

```text
new optional response field

new optional filter

new endpoint
```

provided clients tolerate unknown fields.

---

# 35. Client Robustness

Clients should ignore unknown response fields unless explicitly required otherwise.

---

# 36. Deprecated Fields

Lifecycle:

```text
ACTIVE

DEPRECATED

REMOVED_IN_NEXT_MAJOR
```

where external contracts require it.

---

# 37. API Documentation

Every stable API should document:

```text
Purpose

Authentication

Authorization

Request

Response

Errors

Idempotency

Concurrency

Pagination

Examples
```

---

# 38. Machine-Readable Specification

Preferred:

```text
OpenAPI
```

for external HTTP contracts.

---

# 39. OpenAPI Is Generated/Reviewed Contract

Not sole source of business semantics.

Domain docs remain authoritative for why rules exist.

---

# 40. API Authentication Categories

Different surfaces use different authentication.

---

# 41. Storefront Anonymous

Allowed:

```text
Product reads

Search

Category browsing

Cart operations

Checkout preparation
```

subject to security controls.

---

# 42. Customer Authentication Future

Customer Account:

```text
authenticated customer session/token
```

future.

---

# 43. Admin Authentication

Uses IAM architecture:

```text
Internal User

Organization Membership

Session

MFA

Capabilities

Scopes
```

---

# 44. Integration Authentication

Recommended concepts:

```text
API Client

Service Account

API Credential
```

---

# 45. API Client

Represents external application identity.

Example:

```text
Accounting Connector

Marketplace Connector

Internal Automation
```

---

# 46. Service Account

Machine identity controlled by Organization.

Distinct from human User.

---

# 47. Do Not Reuse Employee Password

Integrations must not authenticate using:

```text
human email + password
```

---

# 48. API Credential

Could be:

```text
API Key

OAuth client credential future

Signed token
```

depending integration needs.

---

# 49. API Key Storage

Only secure hash/reference should be retained where possible.

Full secret shown:

```text
once at creation
```

then masked.

---

# 50. API Credential Scope

Credential is granted explicit capabilities.

Example:

```text
orders.read

orders.create

inventory.read
```

---

# 51. No Implicit Admin

Creating API credential should not automatically grant:

```text
everything.
```

---

# 52. Service Account Permissions

Reuse IAM capability concepts where possible.

---

# 53. Expiration

API credentials can have:

```text
Expires At
```

optional.

---

# 54. Revocation

Immediate revocation supported.

---

# 55. Rotation

Create replacement credential before revoking old one.

---

# 56. Last Used

Operational metadata:

```text
Last Used At

Last IP foundation
```

subject to privacy/security policy.

---

# 57. API Authorization

Authentication answers:

```text
Who are you?
```

Authorization answers:

```text
Can you do this?
```

---

# 58. Server-Side Authorization Mandatory

Frontend hiding button is never sufficient.

---

# 59. Resource Ownership

Every request validates:

```text
Organization boundary
```

before accessing entity.

---

# 60. Cross-Organization ID Attack

Attacker changes:

```text
orderId
```

to another Organization's ID.

Result:

```text
not authorized / not found
```

never data exposure.

---

# 61. Scope Authorization

Examples:

```text
Warehouse Location scope

Financial data scope

Customer sensitive-data permission
```

apply at API layer via IAM/domain authorization.

---

# 62. Queries Also Require Authorization

Read-only does not mean harmless.

---

# 63. Sensitive Field Projection

User can have permission to:

```text
orders.view
```

without:

```text
payments.view_sensitive
```

Order DTO should omit/mask sensitive fields accordingly.

---

# 64. Field-Level Permission

Use sparingly.

Prefer purpose-built DTOs/endpoint capabilities over complex dynamic per-field rules everywhere.

---

# 65. Request Identity

Every API request should receive/propagate:

```text
Request ID
```

---

# 66. Correlation ID

Useful across:

```text
HTTP request

domain commands

background jobs

webhooks

logs
```

---

# 67. Client Request ID

Trusted clients may provide:

```text
X-Request-ID
```

or similar.

Server validates/generates safe identifier.

Exact header naming later.

---

# 68. Do Not Use Request ID as Security Token

It is diagnostic identity.

---

# 69. Idempotency

Critical business commands must support idempotent retry.

---

# 70. Commands Requiring Strong Idempotency

Examples:

```text
Place Order

Record Payment

Verify Payment

Issue Refund

Receive Inventory

Dispatch Transfer

Receive Transfer

Finalize Landed Cost

Create Shipment

Provider callbacks

Webhook processing
```

---

# 71. Idempotency Key

Client sends stable:

```text
Idempotency-Key
```

or equivalent.

---

# 72. Idempotency Scope

Key uniqueness should include:

```text
Organization

Actor / API Client

Command Type
```

or defined operation scope.

---

# 73. Same Key + Same Request

Return same logical result.

---

# 74. Same Key + Different Request

Reject:

```text
IDEMPOTENCY_KEY_REUSED
```

rather than executing new operation.

---

# 75. Idempotency Record

Conceptually stores:

```text
Key

Operation

Request fingerprint

Status

Result reference

Created At

Expiry policy
```

---

# 76. In-Progress Replay

If same command currently executing:

```text
return operation in progress
```

or wait safely according to implementation.

Do not start second transaction.

---

# 77. Failed Attempt

Need distinguish:

```text
validation failure

temporary failure before commit

successful commit but response lost
```

---

# 78. Idempotency After Successful Commit

Must return original result.

This solves:

```text
server committed Order
network disconnected
customer retries
```

---

# 79. Idempotency Is Not Duplicate Business Detection

Technical duplicate:

```text
double-click same operation
```

vs:

```text
customer intentionally creates another Order later
```

Different concerns.

---

# 80. Optimistic Concurrency

Editable resources should use version checks.

---

# 81. Example

Admin A loads Product version:

```text
17
```

Admin B edits Product → version:

```text
18
```

Admin A submits stale edit expecting:

```text
17
```

Result:

```text
VERSION_CONFLICT
```

rather than overwriting B.

---

# 82. Expected Version

Can be transmitted through:

```text
version field
```

or HTTP conditional mechanisms such as:

```text
ETag / If-Match
```

Exact transport decided later.

---

# 83. Commands and Version

Example:

```text
cancelOrder(
  orderId,
  expectedVersion
)
```

where concurrent state changes matter.

---

# 84. Not Every Command Needs Explicit Client Version

Some operations can lock/revalidate current state transactionally.

Use appropriately.

---

# 85. Request Validation

Layers:

```text
Transport Validation

Application Validation

Domain Validation
```

---

# 86. Transport Validation

Examples:

```text
Missing required field

Invalid UUID

Malformed date

Wrong data type
```

---

# 87. Application Validation

Example:

```text
Referenced Location does not exist
```

---

# 88. Domain Validation

Example:

```text
Cannot fulfill cancelled quantity
```

---

# 89. Never Trust Enum String Blindly

Unsupported:

```text
status = SUPER_PAID
```

rejected.

---

# 90. Unknown Fields

Stable public APIs should define strategy.

Recommended:

```text
Ignore unknown response fields

Reject unknown request fields for sensitive commands
```

or validation policy per endpoint.

---

# 91. Money in APIs

Represent as structured:

```text
{
  "amount": "1500.00",
  "currency": "BDT"
}
```

or minor-unit contract if globally standardized.

---

# 92. No JSON Floating Point Authority

Avoid:

```text
1500.1
```

as unqualified authoritative money representation.

---

# 93. Measurement Values

Structured:

```text
value

unit
```

where physical measurement is involved.

---

# 94. Timestamps

Use unambiguous machine format:

```text
ISO 8601 / RFC 3339 style timestamp
```

with timezone/offset.

---

# 95. Dates Without Times

Use:

```text
YYYY-MM-DD
```

for true calendar dates.

---

# 96. Localized Formatting

APIs return machine-friendly values.

Presentation clients format according to localization settings.

---

# 97. Entity IDs

External APIs should use opaque stable IDs.

---

# 98. Human Numbers

Can also appear:

```text
order_number
```

but should not replace stable ID.

---

# 99. Public IDs

Certain public endpoints may use:

```text
unguessable public reference/token
```

distinct from internal ID.

---

# 100. Pagination

Large collection endpoints require pagination.

---

# 101. Preferred Pagination

Cursor-based for frequently changing operational lists.

Example:

```text
next_cursor
```

---

# 102. Why Cursor?

More stable under:

```text
new inserts

deletes

large datasets
```

than deep offset pagination.

---

# 103. Offset Pagination

May still be acceptable for:

```text
small admin tables

static/reference lists
```

but should not be universal default.

---

# 104. Cursor Contract

Cursor is opaque to clients.

---

# 105. Never Let Client Construct Cursor Semantics

Do not expose encoded SQL assumptions as documented contract.

---

# 106. Page Size

Server defines:

```text
default

maximum
```

---

# 107. Large Page Abuse

Request:

```text
limit=1000000
```

must be capped/rejected.

---

# 108. Sort

Explicit supported sort keys.

Example Orders:

```text
created_at

order_number

total

updated_at
```

---

# 109. Stable Sort

Cursor pagination needs deterministic tie-breaker.

Example:

```text
created_at DESC,
id DESC
```

---

# 110. Filtering

Structured query parameters.

Examples:

```text
status

date_from

date_to

customer

location

payment_status
```

---

# 111. Avoid Arbitrary SQL-Like Filters

Do not expose:

```text
filter=whatever_database_expression
```

---

# 112. Filter Whitelist

Each endpoint supports documented filters.

---

# 113. Search

Free-text search remains separate from structured filters.

---

# 114. Example

```text
GET orders?
search=017...
&payment_status=unpaid
&created_from=...
```

---

# 115. Search Implementation Hidden

Client does not care whether search is:

```text
PostgreSQL

dedicated search engine
```

---

# 116. Sparse Fields

Could reduce payload:

```text
fields=id,title,...
```

future.

Not mandatory V1.

Purpose-built summary/detail endpoints may be simpler.

---

# 117. Includes / Expansion

Potential:

```text
include=customer
```

but avoid allowing unrestricted object graph expansion.

---

# 118. N+1 API Client Calls

For frequently used admin screens, provide query projections tailored to screen needs.

---

# 119. Example

Order list should include:

```text
Customer display

Total

Payment summary

Fulfillment summary
```

without browser making 4 requests per Order.

---

# 120. Query Performance

API contract should avoid forcing:

```text
N+1
```

patterns.

---

# 121. Bulk Operations

Operations such as:

```text
Bulk Product Publish

Bulk Price Update

Bulk Variant Edit

Bulk Inventory Import

Bulk Order Export
```

need explicit architecture.

---

# 122. Bulk Command Principle

Bulk operation is not:

```text
loop client-side 10,000 POST requests
```

when server-side batch semantics are more appropriate.

---

# 123. Bulk Request

Conceptually:

```text
createBulkOperation(...)
```

---

# 124. Bulk Operation Lifecycle

Recommended:

```text
QUEUED

RUNNING

COMPLETED

PARTIALLY_COMPLETED

FAILED

CANCELLED
```

---

# 125. Row-Level Results

For partial-safe operations:

```text
Item A success

Item B failed validation

Item C success
```

must be explainable.

---

# 126. Atomic Bulk Operations

Some operations require:

```text
all or nothing
```

but large bulk processing usually benefits from per-item semantics.

Operation defines explicitly.

---

# 127. Bulk Inventory Adjustments

High-risk.

May require:

```text
preview

validation

permission

reason

import batch ID
```

before posting.

---

# 128. Long-Running Operations

Use async jobs for:

```text
Large imports

Large exports

Analytics backfills

Media bulk processing

Large reconciliation jobs
```

---

# 129. Async Job

Conceptually:

```text
Job ID

Type

Status

Progress

Result

Error Summary

Created By

Created At
```

---

# 130. Job APIs

```text
POST /jobs/...

GET /jobs/{id}
```

or operation-specific equivalents.

---

# 131. Do Not Hold HTTP Connection for Minutes

Long work should be queued.

---

# 132. Job Completion Notification

Can use Notification domain.

---

# 133. File Imports

Recommended flow:

```text
Upload File
    ↓
Validate
    ↓
Parse
    ↓
Preview
    ↓
Confirm Import
    ↓
Background Processing
    ↓
Result Report
```

---

# 134. Upload Ownership

Media/File infrastructure handles uploaded file.

Business domain owns import semantics.

---

# 135. Download Exports

Generated files:

```text
PRIVATE
```

permission controlled.

---

# 136. Error Contract

APIs need one consistent structured error envelope.

Conceptually:

```text
{
  "error": {
    "code": "ORDER_INVENTORY_UNAVAILABLE",
    "message": "One or more items are unavailable.",
    "details": [...],
    "request_id": "..."
  }
}
```

---

# 137. Error Code

Stable machine identifier.

---

# 138. Error Message

Human-safe summary.

---

# 139. Details

Structured context where safe.

---

# 140. No Internal Stack Traces

Never return:

```text
SQL query

file path

stack trace

secret
```

to clients.

---

# 141. Validation Errors

Can identify fields:

```text
phone

quantity

coupon
```

without leaking internals.

---

# 142. Domain Conflict Error

Example:

```text
ORDER_ALREADY_CANCELLED
```

---

# 143. Error Categories

Useful conceptual classes:

```text
VALIDATION

AUTHENTICATION

AUTHORIZATION

NOT_FOUND

CONFLICT

RATE_LIMITED

TEMPORARY_UNAVAILABLE

INTEGRATION_FAILURE

INTERNAL
```

---

# 144. HTTP Status

Map appropriately.

Exact mapping later.

---

# 145. Domain Code Is More Important

Client logic should rely on stable error code, not string parsing.

---

# 146. Public Error Sanitization

Internal:

```text
CUSTOMER_BLOCKED_FRAUD_POLICY_4
```

Public:

```text
ORDER_CANNOT_BE_PLACED
```

when internal reason is sensitive.

---

# 147. Rate Limiting

Needed for:

```text
Public APIs

Authentication

Coupon checks

Order placement

Payment submissions

Review submissions

Search

Integration APIs
```

---

# 148. Rate-Limit Dimensions

Potential:

```text
IP

Session

User

Customer

API Client

Endpoint

Organization
```

---

# 149. Avoid One Universal Limit

Product browse and Refund API have different risk.

---

# 150. Rate Limit Response

Structured:

```text
RATE_LIMIT_EXCEEDED
```

and retry metadata where appropriate.

---

# 151. Abuse Controls

Separate from legitimate integration quotas.

---

# 152. API Quotas

External integration may receive:

```text
requests/minute

requests/day

concurrent request limit
```

future.

---

# 153. Security Boundary

API layer enforces:

```text
TLS

Authentication

Authorization

Validation

Rate limiting

Audit

Secret handling
```

---

# 154. CORS

Storefront/Admin origins explicitly configured.

Do not use careless:

```text
Access-Control-Allow-Origin: *
```

for authenticated/admin surfaces.

---

# 155. CSRF

Cookie-authenticated browser mutations require appropriate CSRF protection.

---

# 156. API Tokens

Bearer credentials require protection from:

```text
logs

URLs

analytics

browser storage misuse
```

---

# 157. Secrets in URL

Never send:

```text
api_key=...
```

as query parameter where avoidable.

---

# 158. Request Body Logging

Sensitive endpoints may contain:

```text
phone

address

payment ref
```

Logs require redaction.

---

# 159. Response Logging

Same.

---

# 160. Audit vs Debug Logs

Audit records business/security actions.

Debug logs diagnose systems.

They are different.

---

# 161. Outbound Webhooks

A **Webhook** lets Maevelle notify external systems of relevant events.

---

# 162. Core Webhook Principle

> **Domain Event, Webhook Event and Webhook Delivery Attempt are different concepts.**

Exactly like Notifications.

---

# 163. Architecture

```text
DOMAIN EVENT
     │
     ▼
WEBHOOK EVENT
     │
     ▼
SUBSCRIPTION MATCH
     │
     ▼
WEBHOOK DELIVERY
     │
     ▼
EXTERNAL ENDPOINT
```

---

# 164. Webhook Failure

External consumer offline:

```text
Webhook:
RETRYING
```

while:

```text
Order:
CREATED
```

remains true.

---

# 165. Webhook Must Never Roll Back Domain Transaction

Critical invariant.

---

# 166. Webhook Endpoint

Represents one receiver URL.

Conceptually:

```text
Endpoint ID

Organization

URL

Status

Secret Reference

Subscribed Events

API Version

Created At
```

---

# 167. Webhook Endpoint Status

Recommended:

```text
ACTIVE

PAUSED

DISABLED

FAILING
```

---

# 168. Endpoint Validation

Require:

```text
HTTPS
```

for normal production endpoints.

---

# 169. SSRF Risk

Webhook URLs are server-side outbound requests.

Must defend against:

```text
localhost

private network metadata endpoints

internal infrastructure

unsafe redirects
```

---

# 170. Webhook URL Security

Block/restrict:

```text
127.0.0.1

169.254.x.x

RFC1918 private ranges
```

unless explicit trusted internal integration architecture permits them.

DNS rebinding protections should be considered.

---

# 171. Webhook Subscription

Select events such as:

```text
order.created

order.cancelled

payment.verified

refund.completed

inventory.low_stock

shipment.arrived
```

---

# 172. Not Every Domain Event Becomes Public Webhook

Webhook event catalog is a curated external contract.

---

# 173. Why?

Internal events may:

```text
change frequently

contain sensitive details

be too granular

not be useful externally
```

---

# 174. Webhook Event

A stable external event representation.

Conceptually:

```text
Event ID

Event Type

Event Version

Occurred At

Organization

Resource ID

Payload
```

---

# 175. Event ID

Globally/organization-unique opaque identifier.

Consumers use for deduplication.

---

# 176. Occurred At

Business/domain occurrence timestamp.

---

# 177. Delivered At

Webhook Delivery has separate timestamps.

---

# 178. Event Payload

Should contain:

```text
minimal useful snapshot
```

not entire internal database row.

---

# 179. Thin Event vs Full Snapshot

Two strategies:

### Thin

```text
resource ID
```

consumer calls API.

### Rich

Useful safe fields included.

---

# 180. Recommended

Moderately rich event:

```text
identity

status/transition

relevant summaries
```

plus resource ID for fresh detail retrieval.

---

# 181. Example

```text
order.created
```

payload may include:

```text
order_id

order_number

created_at

currency

total

customer_public/integration reference
```

according to subscription permissions.

---

# 182. Do Not Include

Unless explicitly contracted:

```text
internal notes

supplier costs

permission data

full audit trail

payment secret
```

---

# 183. Event Schema Version

Every Webhook event type needs version.

Example:

```text
order.created.v1
```

or:

```text
type = order.created
version = 1
```

---

# 184. Webhook Version Compatibility

Additive fields generally safe.

Breaking payload changes require new event version/API version.

---

# 185. Subscription Version

Endpoint subscribes to:

```text
event schema version
```

or API version.

---

# 186. Webhook Signature

Every outbound Webhook delivery is cryptographically signed.

---

# 187. Signature Inputs

Recommended conceptually include:

```text
Timestamp

Raw Request Body

Secret
```

---

# 188. Why Timestamp?

Supports replay-window validation.

---

# 189. Consumer Verification

External consumer should:

```text
verify signature

verify timestamp

deduplicate event ID
```

before processing.

---

# 190. Signing Secret

Generated securely.

Stored as secret.

---

# 191. Secret Rotation

Webhook endpoint should support:

```text
new secret

rotation period

old secret expiration
```

future/strongly preferred.

---

# 192. Secret Never Returned Repeatedly

Show once or provide explicit rotate action.

---

# 193. Webhook Delivery Attempt

One outbound HTTP attempt.

Conceptually:

```text
Delivery ID

Webhook Event

Endpoint

Attempt Number

Status

Response Code

Started At

Completed At

Next Retry At

Failure Classification
```

---

# 194. Delivery Status

Recommended:

```text
PENDING

SENDING

DELIVERED

FAILED_TEMPORARY

FAILED_PERMANENT

CANCELLED
```

---

# 195. Success

Normal:

```text
2xx
```

response.

---

# 196. Redirects

Recommended:

```text
do not blindly follow arbitrary redirects
```

because of SSRF/security concerns.

Potentially disable redirects completely.

---

# 197. Timeout

Short bounded timeout.

Webhook consumer must respond quickly.

---

# 198. Long Consumer Processing

Consumer should:

```text
verify

enqueue

respond 2xx
```

rather than process minutes synchronously.

---

# 199. Retryable Responses

Potential:

```text
408

429

5xx

network timeout
```

---

# 200. Non-Retryable

Potential:

```text
400

401

403

404
```

after limited policy, depending reason.

---

# 201. Retry Policy

Exponential backoff + jitter.

---

# 202. Example Conceptual

```text
Immediate

1 minute

5 minutes

30 minutes

2 hours

...
```

Exact schedule later.

---

# 203. Maximum Retry Horizon

After bounded attempts/time:

```text
FAILED_PERMANENT
```

and surfaced operationally.

---

# 204. Dead-Letter Webhooks

Failed delivery remains inspectable.

---

# 205. Manual Retry

Authorized admin can:

```text
Retry Delivery
```

after endpoint fixed.

---

# 206. Manual Retry Uses Same Event ID

Consumer should identify it as same logical event.

---

# 207. Test Webhook

Admin can send:

```text
test event
```

to validate endpoint.

Clearly marked:

```text
test = true
```

or test event type.

---

# 208. Test Does Not Affect Domain

No fake Order creation.

---

# 209. Delivery Logs

Store:

```text
request metadata

response status

duration

safe response excerpt
```

with sensitive redaction.

---

# 210. Do Not Store Unlimited Response Bodies

External endpoint could return:

```text
huge

sensitive

malicious
```

response.

Limit size.

---

# 211. Delivery Ordering

Webhook systems should not promise strict global ordering.

---

# 212. Why?

Retries can cause:

```text
Event B delivered

before delayed Event A
```

---

# 213. Consumer Must Tolerate Out-of-Order Events

Provide:

```text
event occurred_at

resource version where useful
```

---

# 214. Resource Version

Example:

```text
order_version = 17
```

helps consumer reject stale update.

---

# 215. Per-Resource Ordering

Could improve later with partitioned queue.

But do not promise if infrastructure cannot guarantee it.

---

# 216. At-Least-Once Delivery

Recommended contract:

> Webhooks are delivered **at least once**, not exactly once.

---

# 217. Therefore Consumers Must Deduplicate

Using:

```text
Event ID
```

---

# 218. Exactly-Once External Delivery Is Unrealistic

Network failures make it impossible to reliably know whether remote side processed request when response was lost.

Idempotent consumers are correct design.

---

# 219. Webhook Event Generation

Use durable domain event/outbox.

---

# 220. Transactional Outbox

Business transaction:

```text
Order Create
+
Outbox Event
```

committed atomically where practical.

---

# 221. Dispatcher

Background worker converts eligible domain event into:

```text
Webhook Event

Notification

Analytics updates
```

as separate consumers.

---

# 222. Consumer Isolation

Webhook failure does not block:

```text
Notifications

Analytics

other integrations
```

---

# 223. Webhook Replay

Authorized admin can replay events over limited time range.

Useful:

```text
external consumer lost data.
```

---

# 224. Replay Security

Requires high privilege.

Can generate significant external traffic.

---

# 225. Replay Uses Same Event IDs or New Delivery IDs

Recommended:

```text
same Webhook Event ID

new Delivery Attempt IDs
```

---

# 226. Webhook Health

Dashboard:

```text
Active Endpoints

Failure Rate

Oldest Pending

Permanent Failures

Recent Deliveries

Endpoint Latency
```

---

# 227. Auto-Pause

Potential policy:

Endpoint fails repeatedly:

```text
PAUSED / FAILING
```

to prevent endless load.

---

# 228. Notification

Notify integration owner when endpoint enters failing state.

---

# 229. Inbound Webhooks / Provider Callbacks

Maevelle also receives external events.

Examples:

```text
Payment gateway callback

Courier status callback

Email provider delivery callback

Future marketplace event
```

---

# 230. Inbound Principle

> **Inbound webhook payload is untrusted input until authenticated, validated and reconciled.**

---

# 231. Authentication

Provider-specific:

```text
HMAC signature

Public-key signature

Shared secret

OAuth

mTLS future
```

---

# 232. No Universal Fake Signature Scheme

Each provider adapter implements official protocol.

---

# 233. Provider Timestamp / Replay

Where supported:

```text
verify timestamp

reject stale replay
```

---

# 234. Event ID

Persist provider event identity where available.

---

# 235. Duplicate Provider Callback

Must be idempotent.

---

# 236. Missing Provider Event ID

Fallback deduplication may use:

```text
transaction reference

event type

payload hash

provider sequence
```

carefully.

---

# 237. Raw Payload

Preserve raw provider payload where necessary for:

```text
audit

reconciliation

debugging
```

subject to sensitive-data retention/redaction.

---

# 238. Normalized Event

Adapter converts provider-specific payload into internal normalized event.

Example:

```text
ProviderCourierDeliveryChanged
```

---

# 239. Domain Application

Normalized event is then validated against local business state.

---

# 240. Never Map Blindly

Provider says:

```text
DELIVERED
```

but reference does not match local Delivery.

Create:

```text
integration exception
```

not random Order update.

---

# 241. Payment Example

Provider callback:

```text
payment success
```

must verify:

```text
provider reference

merchant account

amount

currency

local Payment

current state
```

before posting financial truth.

---

# 242. Redirect Page Is Not Payment Proof

Customer browser returning:

```text
/success
```

is never authoritative.

Server callback/provider verification is.

---

# 243. Courier Example

Courier callback:

```text
Delivered
```

updates Delivery domain after:

```text
tracking mapping

provider authenticity

state transition validation
```

---

# 244. Delivery Failure != Order Cancellation

Existing Order architecture remains authoritative.

---

# 245. Out-of-Order Provider Events

Possible:

```text
DELIVERED

then old IN_TRANSIT event
```

must not regress state incorrectly.

---

# 246. Provider Sequence

Use if official provider supplies:

```text
event sequence

version

updated_at
```

---

# 247. Otherwise

State-transition precedence/reconciliation rules.

---

# 248. Inbound Processing Lifecycle

Conceptually:

```text
RECEIVED

AUTHENTICATED

NORMALIZED

PROCESSED

IGNORED_DUPLICATE

RECONCILIATION_REQUIRED

REJECTED
```

---

# 249. Respond Quickly

Provider endpoints often retry on timeout.

After authentication/durable persistence:

```text
enqueue processing
```

where synchronous domain commit isn't required.

---

# 250. Callback HTTP Response

Provider-specific expectations.

Adapter handles.

---

# 251. Integration Adapter

Every external provider should sit behind an adapter.

Examples:

```text
CourierProviderAdapter

PaymentProviderAdapter

NotificationProviderAdapter

StorageProviderAdapter
```

---

# 252. Provider-Specific Logic Stays in Adapter

Do not spread:

```text
if provider == pathao
```

through Orders, Storefront, Finance.

---

# 253. Example Courier Interface

Conceptually:

```text
createDelivery()

cancelDelivery()

getDeliveryStatus()

validateAddress() future

parseWebhook()

verifyWebhook()
```

Actual capability varies by provider.

---

# 254. Capability Model

Not every courier supports:

```text
cancel

return tracking

pickup scheduling

webhooks
```

---

# 255. Adapter Declares Capabilities

Example:

```text
supports_webhooks

supports_cancel

supports_cod

supports_status_query
```

---

# 256. Do Not Fake Unsupported Capability

If provider cannot cancel shipment through API:

```text
manual operational fallback
```

may be required.

---

# 257. Provider-Neutral Core

Delivery domain stores normalized concepts.

Provider-specific raw statuses retained separately if useful.

---

# 258. Status Mapping

Example provider:

```text
parcel-delivered
```

maps to normalized:

```text
DELIVERED
```

---

# 259. Mapping Version

Provider mappings can evolve.

Historical raw provider value remains useful.

---

# 260. External Identity Mapping

Integration needs relationship:

```text
Local Entity
↔
External Entity ID
```

---

# 261. Example

```text
Order:
ORD-1005

Pathao Consignment:
PTH-998812
```

---

# 262. External Reference Scope

External ID uniqueness may be within:

```text
Provider

Merchant Account

Entity Type
```

not globally.

---

# 263. Integration Mapping

Conceptually:

```text
Provider

Integration Account

Local Entity Type

Local Entity ID

External Entity Type

External ID
```

---

# 264. Mapping Is Auditable

Do not silently remap:

```text
Order A
```

from one external consignment to another without controlled workflow.

---

# 265. Create External Resource Idempotency

Danger:

```text
Maevelle calls courier create

courier succeeds

network timeout

Maevelle retries

duplicate parcel created
```

---

# 266. Strategy

Use provider idempotency key where supported.

Otherwise:

```text
local operation ID

merchant order reference

reconciliation/query
```

before retrying blindly.

---

# 267. Unknown Outcome

Integration command may become:

```text
UNKNOWN_EXTERNAL_OUTCOME
```

rather than assume failure.

---

# 268. Reconciliation

Query provider using:

```text
merchant reference

transaction ID
```

where possible.

---

# 269. Integration Exception

First-class concept:

```text
Authentication Failure

Unknown External Outcome

Amount Mismatch

Status Conflict

Mapping Missing

Duplicate External Reference

Webhook Verification Failure

Provider Unavailable
```

---

# 270. Integration Exception Lifecycle

```text
OPEN

INVESTIGATING

RESOLVED

IGNORED_WITH_REASON
```

---

# 271. No Manual Database Fix

Operational UI should offer repair actions.

---

# 272. Example Repair

```text
Link external consignment

Retry status sync

Mark external creation confirmed

Cancel retry

Re-fetch payment
```

---

# 273. Integration Health

Each active provider integration should show:

```text
Connection status

Last successful API call

Last successful webhook

Failure rate

Authentication health

Pending exceptions
```

---

# 274. Circuit Breaker

If provider consistently fails:

```text
temporarily stop hammering it
```

through circuit breaker/backoff strategy.

---

# 275. Provider Failure Isolation

Courier A down:

```text
Courier B
```

and unrelated business modules remain operational.

---

# 276. Storefront Dependency

Do not make Product browsing depend on:

```text
live courier API call
```

on every request.

---

# 277. Checkout Delivery Availability

Use cached/configured delivery rules where appropriate.

Provider quote/validation only where genuinely required.

---

# 278. Integration Timeouts

Every external request needs bounded timeout.

---

# 279. Retry Safety

Only retry operations known to be:

```text
idempotent

or protected by idempotency mechanism.
```

---

# 280. GET/Status Query

Usually safe to retry.

---

# 281. Create Payment / Shipment

Must use idempotency/reconciliation.

---

# 282. Provider Rate Limits

Adapter should handle:

```text
429

Retry-After

quota
```

without crashing caller.

---

# 283. Queue Provider Work

Non-interactive integrations can be asynchronous.

Example:

```text
Create courier consignment
```

may run after Order reaches readiness.

---

# 284. Interactive Work

Some actions require synchronous feedback:

```text
Validate Coupon

Calculate Checkout
```

These should not depend unnecessarily on unstable external services.

---

# 285. Webhook vs Polling

Prefer Webhooks when reliable provider supports them.

But maintain reconciliation/polling capability for:

```text
missed webhook

provider outage

uncertain state
```

---

# 286. Polling Is Fallback

Not necessarily primary.

---

# 287. Reconciliation Jobs

Examples:

```text
Recent gateway payments

Open courier deliveries

Unsettled COD

Webhook failures
```

periodically checked.

---

# 288. Reconciliation Window

Focus on:

```text
recent/non-terminal records
```

rather than repeatedly querying entire history.

---

# 289. API Read Consistency

Some reads need:

```text
transactionally current
```

others can use projections.

---

# 290. Strongly Consistent Reads

Examples:

```text
Checkout final validation

Inventory reservation

Payment verification
```

---

# 291. Eventually Consistent Reads

Examples:

```text
Product search index

Analytics dashboard

Notification status summary
```

---

# 292. API Should Make Freshness Understandable

If using projection:

```text
updated_at

projection_version
```

where useful.

---

# 293. Storefront Product Availability

Can be cached/projection.

Final Order command authoritative.

---

# 294. Command Response

Should return resulting authoritative resource summary.

Example:

```text
placeOrder()
→ Order Confirmation
```

---

# 295. `202 Accepted`

Use for async operation accepted but not complete.

Example:

```text
large export
```

---

# 296. Do Not Return Success Before Business Completion

For:

```text
Place Order
```

if semantics mean Order has been committed.

---

# 297. Command Result States

If operation is async:

```text
Operation ID
```

rather than pretending resource final state exists.

---

# 298. Audit

API mutations record:

```text
Actor

API Client

Request ID

Command

Entity

Outcome

Timestamp
```

where appropriate.

---

# 299. API Client Actor

Audit differentiates:

```text
Human User

Service Account

System

Provider
```

---

# 300. Provider Callback Actor

Example:

```text
EXTERNAL_PROVIDER: SSLCommerz
```

or adapter identity.

---

# 301. IP/User-Agent

Can be collected for security where useful.

Apply retention/privacy controls.

---

# 302. API Observability

Track:

```text
Request count

Latency

Error rate

Endpoint

API client

Rate-limit events
```

---

# 303. Do Not Put PII in Metrics Labels

Bad:

```text
customer_phone=017...
```

in observability metrics.

---

# 304. Distributed Tracing Foundation

Request/correlation IDs prepare for:

```text
future tracing
```

even in modular monolith.

---

# 305. Slow Endpoint Detection

Monitor:

```text
P95

P99
```

latency for important endpoints.

---

# 306. Critical Endpoint Examples

```text
Storefront Product

Search

Cart Update

Checkout

Place Order

Admin Order List

Inventory Adjustment
```

---

# 307. API Health

Operational dashboard:

```text
5xx rate

latency

rate limits

integration failures

webhook backlog

job backlog
```

---

# 308. Webhook Observability

Track:

```text
Events generated

Deliveries attempted

Delivery success rate

Retry count

Oldest pending

Permanent failures
```

---

# 309. Integration Observability

Track per provider:

```text
request latency

success rate

authentication failures

429 rate

timeouts

webhook delay
```

---

# 310. API Documentation Audiences

Different docs:

```text
Internal developers

External integration developers

Storefront client developers
```

---

# 311. Internal Domain Docs Remain Private

Public developer documentation should later be generated separately.

Do not expose internal architectural notes by default.

---

# 312. External API Documentation

Only stable supported public/integration APIs.

---

# 313. Sandbox/Test Environment Future

External integrations may later receive:

```text
Test credentials

Sandbox Organization
```

without touching production data.

---

# 314. Webhook Test Environment

Test events clearly distinguished from production.

---

# 315. Test Credentials

Cannot access production Organization.

---

# 316. Contract Testing

Every API contract needs automated tests.

---

# 317. Storefront Contract Tests

Examples:

```text
Published Product visible

Draft Product hidden

Manipulated price ignored

Unavailable Variant rejected

Cross-org IDs rejected
```

---

# 318. Admin Contract Tests

```text
Permission allowed

Permission denied

Scope denied

Stale version conflict

Idempotent replay
```

---

# 319. Webhook Contract Tests

```text
Correct signature

Wrong signature

Old timestamp

Duplicate event

Retry

Endpoint timeout

500

429

SSRF blocked
```

---

# 320. Provider Callback Tests

```text
Valid signature

Invalid signature

Duplicate callback

Unknown local reference

Amount mismatch

Out-of-order event

Provider retry
```

---

# 321. Idempotency Stress Test

Fire:

```text
100 identical Place Order requests
```

with same key.

Result:

```text
1 Order
```

---

# 322. Usage-Limit Race

Two requests attempting final Coupon use.

Exactly one succeeds if one use remains.

API/orchestration respects Promotion transaction.

---

# 323. Inventory Race

Two Order requests compete for final stock.

Exactly one secure reservation.

---

# 324. Concurrent Cancellation

Two cancel commands.

One effective cancellation.

Second safely returns idempotent/already-cancelled result.

---

# 325. Webhook Delivery Duplicate

External consumer receives same event twice.

Contract makes dedupe possible via Event ID.

---

# 326. Webhook Ordering Stress

Deliver:

```text
Order Confirmed

Order Created
```

out of order.

Consumer has:

```text
occurred_at

resource version
```

and documentation that ordering is not guaranteed.

---

# 327. Provider Timeout After Success

Courier create request succeeds externally but times out locally.

System:

```text
UNKNOWN_EXTERNAL_OUTCOME
```

then reconciliation finds external consignment.

No duplicate creation.

---

# 328. Payment Callback Race

Webhook and polling discover success simultaneously.

Idempotency creates:

```text
one Payment Transaction
```

---

# 329. Bulk Import Retry

Background worker crashes midway.

Restart resumes safely without duplicate entities/movements.

---

# 330. API Evolution Test

Old V1 client continues working after additive response field added.

---

# 331. API Security Test

Fuzz:

```text
IDs

large payloads

invalid enums

negative quantities

unexpected nested objects
```

---

# 332. Payload Size Limits

Set per endpoint.

---

# 333. File Upload Limits

Media controls:

```text
file size

count

type
```

---

# 334. JSON Depth

Avoid malicious deeply nested request causing resource exhaustion.

---

# 335. Query Complexity

Search/filter APIs need bounded complexity.

---

# 336. Expensive Sort/Filter

Unsupported combinations should be rejected rather than creating table scans across millions of rows.

---

# 337. Timeout Budgets

Server operations should have explicit timeout expectations.

---

# 338. DB Transaction Length

Do not keep database transaction open while waiting 30 seconds for external provider.

---

# 339. Critical Pattern

```text
Local transaction
→ durable pending integration operation
→ external call
→ local reconciliation/state update
```

where provider interaction cannot safely live inside local transaction.

---

# 340. Saga / Compensation

For cross-domain/external operations where atomic transaction is impossible:

```text
explicit workflow

state

retry

compensation

reconciliation
```

rather than pretending distributed atomicity.

---

# 341. Example

Order created locally.

Courier creation fails.

Order remains valid:

```text
Delivery:
NOT_CREATED / ERROR
```

operator retries.

---

# 342. Do Not Cancel Order Automatically

unless explicit business policy requires it.

---

# 343. External Side Effects

Never perform external call before local system knows how to recover from ambiguous result.

---

# 344. Inbox Pattern Foundation

For reliably processing inbound/internal events:

```text
event inbox
```

may track:

```text
event ID

consumer

processed status
```

---

# 345. Outbox + Inbox

Potential:

```text
Domain Transaction
    ↓
Outbox
    ↓
Consumer
    ↓
Inbox/Dedupe
```

reliable within modular architecture.

---

# 346. Event Bus

V1 does not require Kafka.

---

# 347. V1 Options

Could use:

```text
PostgreSQL-backed outbox

job queue

Redis-backed worker queue where justified
```

depending technical design.

---

# 348. Domain Events Are Internal Contracts

They should still be version-aware/stable enough for internal consumers.

---

# 349. Domain Event Fields

Recommended baseline:

```text
event_id

event_type

occurred_at

organization_id

aggregate_type

aggregate_id

aggregate_version

payload
```

---

# 350. Event Payload Principle

Include facts about:

```text
what happened
```

not command instructions to consumer.

---

# 351. Example

Good:

```text
order.cancelled
```

Bad:

```text
please_release_inventory_and_email_customer_and...
```

Consumers decide reactions.

---

# 352. Event Consumer Idempotency

Every durable event consumer must tolerate duplicates.

---

# 353. Event Consumer Failure

Retry only failing consumer.

Other consumers continue.

---

# 354. Poison Event

If one malformed event continually fails:

```text
dead-letter / exception
```

rather than block entire stream forever.

---

# 355. Event Replay

Internal projections can replay durable events or rebuild from source depending architecture.

---

# 356. Integration API Publicness

V1 can be:

```text
API-first internally

private Integration API
```

before public third-party developer program exists.

---

# 357. Do Not Publish Everything Immediately

Public developer ecosystem requires:

```text
security review

contract stability

rate limits

documentation

support policy
```

---

# 358. V1 Integration Consumers

Initially likely:

```text
Storefront

Admin

Internal Workers

Payment Providers

Courier Providers

Notification Providers
```

---

# 359. Future Developer API

Can expose curated:

```text
Products

Orders

Inventory Availability

Customers where authorized

Webhooks
```

---

# 360. Write APIs for External Developers

Need especially strict:

```text
idempotency

permission

validation

versioning
```

---

# 361. External Customer Data Access

High sensitivity.

Do not grant by broad:

```text
customers.read
```

without scoped purpose/approval.

---

# 362. Data Minimization

Integration API returns only required fields.

---

# 363. Webhook Privacy

Endpoint subscription capabilities govern payload.

A Product-only integration should not receive Customer data.

---

# 364. Event Authorization Snapshot

Webhook generation checks endpoint/API client permissions/subscriptions.

---

# 365. Credential Revocation

Pending future Webhook deliveries?

Recommended:

```text
Webhook Endpoint credentials independent
```

but if integration itself disabled:

```text
pause future deliveries
```

according to policy.

---

# 366. Integration Disable

Should not delete:

```text
external mappings

delivery history

audit
```

---

# 367. Re-enable

Can continue with existing mapping after health validation.

---

# 368. Integration Removal

Historical records remain.

Secret revoked.

New operations prohibited.

---

# 369. Public API Deprecation

Need:

```text
announcement

migration window

deprecation metadata
```

for external developers eventually.

---

# 370. Breaking Webhook Changes

Never silently change:

```text
meaning

types

field structure
```

for active subscribed version.

---

# 371. Provider Adapter Upgrade

External provider API changes should be absorbed within adapter where normalized core semantics remain same.

---

# 372. Provider API Version

Integration configuration may record provider API version/capabilities.

---

# 373. Failure Scenario — API Cache Stale

Read can be stale where allowed.

Final commands revalidate authoritative state.

---

# 374. Failure Scenario — Webhook Worker Down

Domain event remains durable.

Worker catches up later.

---

# 375. Failure Scenario — Endpoint Permanently Dead

Delivery fails after retry horizon.

Integration health shows failure.

Business transaction unchanged.

---

# 376. Failure Scenario — Provider Sends Duplicate Payment Success 50 Times

One normalized financial transaction.

Callbacks 2–50 become duplicates/idempotent.

---

# 377. Failure Scenario — Provider Sends Wrong Amount

Create:

```text
PAYMENT_RECONCILIATION_REQUIRED
```

Do not mark full expected amount paid.

---

# 378. Failure Scenario — Courier Sends Unknown Tracking Number

Store:

```text
integration exception
```

Do not attach to random Order.

---

# 379. Failure Scenario — Webhook Endpoint Attempts SSRF Redirect

Do not follow unsafe redirect.

---

# 380. Failure Scenario — API Key Leaked

Operator:

```text
revoke credential
```

immediately.

Historical audit remains.

---

# 381. Failure Scenario — Bulk Operation Partially Completes

Results show exactly which rows succeeded/failed.

Retry only safe failed items.

---

# 382. Failure Scenario — API Client Retries After 30 Minutes

Idempotency retention must be long enough for critical operations according to operational policy.

---

# 383. Failure Scenario — Same Idempotency Key, Different Cart

Reject.

---

# 384. Failure Scenario — External API Slow

Circuit breaker/timeout prevents thread/resource exhaustion.

---

# 385. Failure Scenario — Queue Saturated

Backpressure and health alert.

Core high-priority commands should not collapse because low-priority Webhook backlog is huge.

---

# 386. Queue Priority

Potential classes:

```text
CRITICAL

NORMAL

LOW
```

for workers.

---

# 387. Separate Worker Pools

Eventually useful:

```text
Payments

Webhooks

Notifications

Analytics

Imports
```

so one workload cannot starve others.

V1 can begin simpler but architecture supports separation.

---

# 388. Integration Data Ownership

Core Maevelle data remains canonical unless provider explicitly owns the concept.

---

# 389. Example

Courier owns:

```text
provider tracking events
```

Maevelle Delivery owns:

```text
normalized delivery record and relationship to Order.
```

---

# 390. Payment Provider

Provider owns external transaction truth.

Maevelle Payment owns:

```text
normalized recorded financial movement

verification

allocation

reconciliation.
```

---

# 391. Search Provider Future

Search engine owns:

```text
search index
```

Catalog remains Product authority.

---

# 392. Integration Adapter Principle

> External providers are replaceable infrastructure/capabilities; they do not become the platform's domain model.

---

# 393. API Naming

Use business language established in:

```text
terminology.md
```

Avoid inconsistent:

```text
warehouse vs depot vs branch
```

across APIs.

---

# 394. Stable Terminology

If canonical term is:

```text
Location
```

API uses:

```text
location_id
```

unless endpoint specifically represents Warehouse subtype.

---

# 395. Enum Evolution

External enums are contracts.

Clients must handle future unknown enum values where practical.

---

# 396. Internal Enum Exposure

Do not expose every internal enum automatically.

Public/API enum may be curated.

---

# 397. Status Summary vs Internal State

Storefront can receive:

```text
order_status = "Processing"
```

derived safely.

Admin API can receive richer internal dimensions.

---

# 398. API Localization

Error/message text can localize for UI.

Machine error codes remain stable.

---

# 399. Do Not Localize Enum Keys

Use stable machine identifier:

```text
UNPAID
```

plus UI translation.

---

# 400. Important Invariants

### API-INV-001

API contracts expose business capabilities, not unrestricted database CRUD.

### API-INV-002

Queries never bypass source-domain authorization.

### API-INV-003

Commands execute through application/domain services.

### API-INV-004

API DTOs are explicit contracts and are not raw ORM/database entities.

### API-INV-005

Storefront/public DTOs never expose private operational or financial fields unintentionally.

### API-INV-006

Organization boundaries are validated server-side on every relevant request.

### API-INV-007

Integration credentials are machine identities and never reuse human passwords.

### API-INV-008

API credentials have explicit capabilities/scopes.

### API-INV-009

Revoked credentials cannot continue authenticating.

### API-INV-010

Critical commands are idempotent/retry-safe.

### API-INV-011

Reusing an Idempotency Key with materially different input is rejected.

### API-INV-012

Successful command retries return the same logical result rather than duplicate side effects.

### API-INV-013

Optimistic concurrency prevents silent stale overwrites where applicable.

### API-INV-014

Client-submitted monetary values never override authoritative server pricing/calculation rules.

### API-INV-015

Money and currency are represented explicitly.

### API-INV-016

Pagination has bounded server-controlled limits.

### API-INV-017

Filtering/sorting only uses supported validated fields.

### API-INV-018

API error responses never expose secrets, stack traces or raw internal failures.

### API-INV-019

Rate limiting does not replace authorization/domain validation.

### API-INV-020

Domain Events and Webhook Events are separate contracts.

### API-INV-021

Webhook Event and Webhook Delivery Attempt are separate concepts.

### API-INV-022

Webhook delivery failure never rolls back committed domain truth.

### API-INV-023

Outbound Webhooks are signed.

### API-INV-024

Webhook endpoint handling defends against SSRF/internal-network targeting.

### API-INV-025

Outbound Webhook delivery is treated as at-least-once.

### API-INV-026

Every Webhook Event has stable event identity for consumer deduplication.

### API-INV-027

Webhook consumers must not rely on strict global event ordering.

### API-INV-028

Webhook schema breaking changes require explicit version evolution.

### API-INV-029

Provider callbacks are treated as untrusted until authenticated and validated.

### API-INV-030

Duplicate provider callbacks cannot duplicate financial/inventory/delivery effects.

### API-INV-031

External provider status cannot bypass local domain state-transition validation.

### API-INV-032

Provider-specific behavior is isolated behind adapters.

### API-INV-033

Provider external IDs are mapped explicitly to local entities.

### API-INV-034

Unknown external operation outcomes are reconciled rather than blindly retried when duplicate side effects are possible.

### API-INV-035

External calls have bounded timeouts and safe retry semantics.

### API-INV-036

Long-running operations use durable job workflows rather than long HTTP requests.

### API-INV-037

Bulk operation results remain traceable at individual item level where partial success is allowed.

### API-INV-038

Domain event consumers are idempotent.

### API-INV-039

Webhook/Notification/Analytics consumer failures are isolated from each other.

### API-INV-040

API/integration outages must not silently fabricate successful business operations.

---

# 401. V1 Mandatory Scope

Maevelle V1 API/Integration architecture should include:

```text
✓ Explicit application service interfaces

✓ Storefront API

✓ Admin API

✓ Provider Callback API

✓ Internal Application Interfaces

✓ HTTP JSON external contracts

✓ REST-style resources

✓ Semantic command endpoints

✓ Purpose-built DTOs

✓ API Versioning foundation

✓ OpenAPI documentation foundation

✓ Request IDs

✓ Correlation IDs

✓ Authentication

✓ Admin Session authentication

✓ API Client / Service Account foundation

✓ Capability-based API authorization

✓ Organization isolation

✓ Location/scoped authorization

✓ Structured request validation

✓ Structured error envelope

✓ Stable error codes

✓ Idempotency infrastructure

✓ Place Order idempotency

✓ Payment idempotency

✓ Refund idempotency

✓ Inventory mutation idempotency

✓ Provider callback idempotency

✓ Optimistic concurrency/version checks

✓ Cursor pagination foundation

✓ Filtering

✓ Sorting

✓ Search parameters

✓ Page-size limits

✓ Request payload limits

✓ Rate limiting

✓ Secure money/date representations

✓ Bulk-operation architecture foundation

✓ Async job architecture

✓ File import/export job pattern

✓ Domain-event contracts

✓ Durable Outbox foundation

✓ Event-consumer idempotency

✓ Outbound Webhook architecture

✓ Webhook Endpoint

✓ Webhook Subscriptions

✓ Webhook Event catalog

✓ Webhook Event ID

✓ Webhook Event version

✓ Webhook signatures

✓ Webhook retry

✓ Webhook delivery history

✓ Webhook failure queue

✓ Webhook SSRF protections

✓ Provider Callback verification

✓ Provider Event deduplication

✓ Provider Adapter pattern

✓ External ID mapping

✓ Integration exceptions

✓ Integration health

✓ External request timeout policies

✓ External retry policies

✓ Reconciliation foundation

✓ API observability

✓ Webhook observability

✓ Integration observability

✓ Audit integration
```

---

# 402. Strongly Preferred V1

```text
Webhook test delivery

Webhook manual retry

Webhook secret rotation

Webhook endpoint auto-pause

Integration service accounts

API key rotation

API credential expiration

Bulk operation progress

Async export jobs

Integration exception repair actions

Provider status polling fallback

Request/response redaction

Contract tests

Provider adapter conformance tests

API health dashboard

Webhook health dashboard

Integration health dashboard

Resource versions in Webhook events

Endpoint delivery latency metrics
```

---

# 403. Foundation Now / Later

Architecture should prepare for:

```text
Public Developer API

OAuth 2.x style delegated integrations

Third-party applications

Mobile clients

GraphQL read façade

Marketplace integrations

Accounting platforms

CRM integrations

Advanced courier integrations

Advanced payment gateways

API quotas/plans

Developer portal

Sandbox Organizations

Webhook replay API

Event streaming
```

---

# 404. Deferred Advanced Capabilities

Post-V1:

```text
Full external developer ecosystem

OAuth authorization server

Partner app marketplace

Per-client API quotas

Streaming API

SSE/WebSocket subscriptions

Kafka-class event infrastructure

Advanced API analytics

Schema registry

Multi-region webhook delivery

Webhook delivery regions

Advanced mTLS integrations

Enterprise integration gateway
```

---

# 405. Decisions Established

### Decision API-001

**Maevelle APIs are capability-oriented rather than database CRUD-oriented.**

### Decision API-002

**Queries and Commands are explicitly distinct concepts.**

### Decision API-003

**Domain/application services sit between transport and domain state.**

### Decision API-004

**API DTOs are purpose-built contracts, not ORM serialization.**

### Decision API-005

**Storefront, Admin, Integration, Webhook and Provider Callback APIs are logically distinct surfaces.**

### Decision API-006

**API-first architecture does not require every internal module call to use HTTP.**

### Decision API-007

**The modular monolith uses published in-process application interfaces internally.**

### Decision API-008

**HTTP JSON with REST-style resources plus semantic commands is the V1 external API approach.**

### Decision API-009

**GraphQL is not required for V1 and may later be introduced primarily as a query façade.**

### Decision API-010

**Stable external APIs use explicit versioning.**

### Decision API-011

**Storefront/public contracts expose only public-safe projections.**

### Decision API-012

**Machine integrations use API Client/Service Account identity rather than human credentials.**

### Decision API-013

**External integration credentials are capability scoped and revocable.**

### Decision API-014

**Critical mutation commands are idempotent.**

### Decision API-015

**Idempotency protects technical retries but does not replace business duplicate detection.**

### Decision API-016

**Optimistic concurrency protects editable shared resources from stale overwrite.**

### Decision API-017

**Cursor pagination is preferred for large/high-change operational lists.**

### Decision API-018

**Search, filters and sorting are separate query concepts.**

### Decision API-019

**Large/bulk work uses asynchronous job architecture.**

### Decision API-020

**Domain Events are internal business facts; Webhook Events are curated external contracts.**

### Decision API-021

**Webhook Events and Webhook Delivery Attempts are distinct.**

### Decision API-022

**Outbound Webhooks use signed at-least-once delivery.**

### Decision API-023

**Consumers are expected to deduplicate using stable Event IDs.**

### Decision API-024

**Strict global Webhook ordering is not guaranteed.**

### Decision API-025

**Webhook endpoints are protected against SSRF and unsafe redirects.**

### Decision API-026

**Inbound provider callbacks are authenticated before processing.**

### Decision API-027

**Provider callbacks are idempotent and out-of-order tolerant.**

### Decision API-028

**Browser redirects are never authoritative Payment confirmation.**

### Decision API-029

**External providers integrate through capability-aware adapters.**

### Decision API-030

**Provider-specific statuses do not become core domain statuses directly.**

### Decision API-031

**Local ↔ external identities are explicitly mapped.**

### Decision API-032

**Ambiguous external outcomes enter reconciliation instead of blind duplicate-prone retry.**

### Decision API-033

**External provider latency is kept outside long-running database transactions.**

### Decision API-034

**Transactional Outbox is the preferred reliability foundation for committed domain events.**

### Decision API-035

**V1 does not require Kafka or microservice-style network communication.**

### Decision API-036

**External integration failures are observable, repairable and isolated from core business truth.**

---

# 406. Example — Place Order

```text
STORE­FRONT
    │
    ▼
POST Place Order
    │
    ├── Authentication/Session
    ├── Rate Limit
    ├── Idempotency
    ├── Request Validation
    │
    ▼
Storefront Application Service
    │
    ├── Pricing
    ├── Promotions
    ├── Customer
    ├── Inventory
    ├── Payments
    │
    ▼
Order Domain
    │
    ▼
COMMIT
    │
    ├── Order
    ├── Reservation
    ├── Payment Intent
    └── Outbox Events
    │
    ▼
Response:
Order Confirmation
```

After commit:

```text
Outbox
   ├── Notification
   ├── Analytics
   └── Webhooks
```

External messaging/integration work cannot invalidate the Order.

---

# 407. Example — Inventory Adjustment

```text
Admin
  │
  ▼
POST Adjustment Command
  │
  ├── inventory.adjust permission
  ├── Location scope
  ├── Idempotency
  ├── Expected version
  │
  ▼
Inventory Application Service
  │
  ▼
Validate
  │
  ├── Item
  ├── Location
  ├── Reason
  ├── Quantity
  │
  ▼
Inventory Transaction
  │
  ▼
Ledger Movement
  │
  ▼
Updated Level
```

There is never:

```text
UPDATE inventory_levels
SET quantity = ...
```

through an external CRUD API.

---

# 408. Example — Outbound Webhook

```text
ORDER CREATED
      │
      ▼
Domain Event
      │
      ▼
Outbox
      │
      ▼
Webhook Event
order.created.v1
      │
      ▼
Webhook Endpoint
      │
      ▼
Signed Delivery
      │
      ├── 200 → DELIVERED
      │
      └── timeout
              │
              ▼
             RETRY
```

Order remains created in every case.

---

# 409. Example — Payment Callback

```text
PAYMENT PROVIDER
       │
       ▼
Provider Callback Endpoint
       │
       ├── Authenticate Signature
       ├── Replay Protection
       ├── Deduplicate Event
       │
       ▼
Payment Provider Adapter
       │
       ▼
Normalize Event
       │
       ├── Match Merchant Account
       ├── Match Payment
       ├── Verify Amount
       ├── Verify Currency
       ├── Check Current State
       │
       ▼
Payment Domain
       │
       ▼
Post Payment Transaction
```

A forged:

```text
status=success
```

request can never directly turn an Order into Paid.

---

# 410. Example — Courier Timeout

```text
Maevelle
   │
   ▼
Create Courier Delivery
   │
   ▼
Provider creates parcel
   │
   X
Network response lost
```

Maevelle must **not** immediately assume:

```text
Creation failed.
```

Instead:

```text
Integration Operation:
UNKNOWN_EXTERNAL_OUTCOME
```

then:

```text
query/reconcile using merchant reference
```

Possible result:

```text
Existing parcel found
→ link mapping
→ continue
```

No duplicate courier booking.

---

# 411. Complete External Boundary

```text
                        MAEVELLE
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
          Storefront      Admin     Integration API
              │            │            │
              └────────────┼────────────┘
                           ▼
                   Application Layer
                           │
                           ▼
                       Domains
                           │
                           ▼
                      Database
                           │
                           ▼
                         Outbox
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
      Notifications     Analytics      Webhooks
                                            │
                                            ▼
                                  External Consumers
```

Inbound:

```text
External Providers
        │
        ▼
Provider Callback APIs
        │
        ▼
Provider Adapters
        │
        ▼
Normalized Commands / Events
        │
        ▼
Domain Validation
```

---

# 412. Architecture Milestone

We now have a formal boundary around essentially the entire business platform.

The system can be:

```text
one modular monolith

one PostgreSQL database initially

one private VPS initially
```

while still exposing:

```text
well-defined APIs

durable events

webhooks

provider adapters

service accounts

integration boundaries
```

that allow future growth without treating the current implementation as disposable.

---

# 413. Recommended Next Document

Next should be:

```text
docs/architecture/security-audit-architecture.md
```

This should now perform a **system-wide security design**, rather than merely repeating IAM permissions.

It needs to cover:

```text
Threat Model

Trust Boundaries

Authentication Security

Session Security

MFA

Authorization

Organization Isolation

Object-Level Authorization

Privilege Escalation

Sensitive Operations

Step-Up Authentication

Service Accounts

API Credential Security

Secret Management

Encryption

Password Handling

CSRF

XSS

SQL Injection

SSRF

File Upload Security

Media Privacy

Payment Data

PII

Sensitive Logging

Audit Trail

Audit Integrity

IP / Device Context

Rate Limiting

Brute Force

Bot / Order Abuse

Coupon Abuse

Webhook Security

Provider Callback Security

Replay Attacks

Idempotency Abuse

Mass Assignment

Request Validation

Dependency Security

Supply Chain Security

CSP / Security Headers

Backups

Backup Encryption

Restore Security

Incident Response

Account Recovery

Security Events

Data Retention

Deletion / Anonymization

Environment Separation

Production Access

Database Access

SSH/VPS Hardening

Monitoring

Security Testing

SAST

Dependency Scanning

Secrets Scanning

Penetration Testing foundation
```

The central principle should be:

```text
CLIENT INPUT
     ↓
AUTHENTICATION
     ↓
AUTHORIZATION
     ↓
VALIDATION
     ↓
DOMAIN RULES
     ↓
TRANSACTION
     ↓
AUDIT
```

with **authorization at every server boundary**, regardless of what the frontend shows.

After Security & Audit, we can move into the overall **System/Technical Architecture**, then the **database/data-model design**, and finally perform the large cross-domain **failure-mode, fallback, leak-finding and stress-test pass** over the complete system.

At this stage, the focused skills.sh skill **`api-and-interface-design`** would also be useful when we turn these architectural rules into actual endpoint contracts/OpenAPI definitions; it is worth using then rather than during abstract domain modeling.

---

**End of API, Webhooks & Integration Architecture v0.1**
