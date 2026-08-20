# Maevelle Ecommerce — Testing, Verification & Quality Master Plan

**Document:** `docs/quality/testing-master-plan.md`
**Status:** Quality Architecture / Implementation Contract
**Version:** 0.1
**Related:** All Domain Architectures, Security Architecture, Technical Architecture, Database Architecture, API/OpenAPI, Admin IA, Storefront UX

---

# 1. Purpose

Maevelle contains business operations where a seemingly small defect can cause:

```text
overselling

duplicate Orders

duplicate Payments

incorrect Refunds

lost Inventory

wrong COGS

wrong customer balances

cross-organization data exposure

duplicate courier bookings

incorrect RTO restoration

historical financial corruption
```

Testing is therefore part of system architecture.

The objective is not merely:

```text
"most tests are green."
```

The objective is:

> **Continuously prove that critical business invariants remain true under normal usage, concurrency, retries, crashes, provider failures, malformed data, configuration changes and software upgrades.**

---

# 2. Central Quality Principle

Every important requirement should be classified as one or more of:

```text
Invariant

Example Behavior

Boundary Condition

Failure Scenario

Recovery Scenario

Security Property

Performance Requirement

Compatibility Contract
```

and have an executable verification strategy.

---

# 3. Second Principle

> **Test observable business behavior, not internal implementation trivia.**

Prefer:

```text
PlaceOrder with the final available unit
must reserve exactly one unit
```

over:

```text
InventoryRepository.reserve() was called once.
```

Internal implementation can change.

Business behavior must not.

---

# 4. Third Principle

> **Critical correctness tests should cross real architectural boundaries.**

For high-risk flows use as much real infrastructure as practical:

```text
Application Service

Domain

Repository

PostgreSQL

Transactions

Constraints

Outbox
```

rather than mocking all of those pieces.

---

# 5. Fourth Principle

> **Mocks are strongest at external system boundaries, not inside our own domain.**

Mock/simulate:

```text
Pathao

Steadfast

bKash provider future

Nagad provider future

SSLCommerz

Email provider

Object storage boundary where appropriate
```

Prefer real:

```text
Pricing

Orders

Inventory

Payments

Promotions

Costing

Returns

PostgreSQL
```

for integration tests.

---

# 6. Fifth Principle

> **Every production bug must become a permanent regression test.**

Workflow:

```text
Bug discovered
      ↓
Reproduce with failing test
      ↓
Fix
      ↓
Test becomes permanent
```

---

# 7. Sixth Principle

> **Retries do not count as correctness.**

A flaky test that passes on retry is still evidence of instability.

Retries may gather diagnostics or tolerate known environmental flakiness in limited E2E contexts.

They must not hide deterministic product failures.

---

# 8. Seventh Principle

> **A test passing for the wrong reason is not proof.**

For critical tests:

```text
write test

verify RED

implement/fix

verify GREEN

refactor

verify GREEN
```

---

# 9. TDD Policy

Strongly recommended default for:

```text
new domain behavior

bug fixes

state transitions

financial calculations

inventory calculations

authorization rules

integration behavior

edge-case handling
```

Pure:

```text
documentation

static content

mechanical generated files
```

do not require ritual TDD.

---

# 10. Test Pyramid Is Not Enough

Maevelle needs a broader verification portfolio:

```text
Static Verification
        ↓
Domain Unit Tests
        ↓
Application Tests
        ↓
Database Integration Tests
        ↓
Cross-Domain Transaction Tests
        ↓
API Contract Tests
        ↓
Browser E2E
        ↓
Concurrency / Failure Tests
        ↓
Security Tests
        ↓
Performance Tests
        ↓
Migration / Restore Tests
        ↓
Production Verification
```

---

# 11. Test Categories

Canonical categories:

```text
STATIC

UNIT

PROPERTY

APPLICATION

DATABASE_INTEGRATION

TRANSACTION

CONTRACT

API

COMPONENT

E2E

CONCURRENCY

IDEMPOTENCY

SECURITY

ACCESSIBILITY

PERFORMANCE

LOAD

FAILURE_INJECTION

MIGRATION

BACKUP_RESTORE

PROJECTION_REBUILD

PROVIDER_SIMULATION

SMOKE

RECONCILIATION
```

---

# 12. Quality Registry

Create a machine-readable Quality Registry.

Potential location:

```text
docs/quality/invariant-test-registry.yaml
```

or equivalent structured source.

---

# 13. Registry Purpose

Map:

```text
Requirement
→ Invariant
→ Tests
→ Test level
→ Owner module
→ Severity
```

Example:

```text
INV-ORD-017
No overselling

Tests:
inventory-reservation-race.spec
place-order-last-unit.integration.spec
checkout-last-unit.e2e.spec
```

---

# 14. Invariant Traceability

Every critical invariant from architecture documents should eventually have:

```text
Invariant ID

Description

Criticality

Owning Domain

Enforcement Layer

Automated Tests

Manual Verification if any
```

---

# 15. Enforcement Layer

Potential:

```text
DOMAIN

APPLICATION

DATABASE

AUTHORIZATION

PROVIDER_ADAPTER

UI

MULTIPLE
```

---

# 16. Criticality

Recommended:

```text
P0 — Financial/security/inventory corruption

P1 — Major business workflow correctness

P2 — Important feature correctness

P3 — Low-risk UX behavior
```

---

# 17. Examples — P0

```text
Cross-organization data access

Duplicate confirmed Payment

Inventory below allowed availability

Refund above refundable amount

Duplicate Return stock restoration

Duplicate Fulfillment stock deduction

Cost Layer double consumption

Ownership-transfer privilege corruption
```

---

# 18. Examples — P1

```text
Coupon usage incorrectly released

Courier booking duplicated

Order cancellation releases wrong reservation

Wrong size guide published

Customer merge loses aliases
```

---

# 19. Examples — P2

```text
Saved Admin view filter incorrect

Product gallery order incorrect

Search synonym unavailable
```

---

# 20. Static Verification

Run on every pull request:

```text
TypeScript type checking

Linting

format validation

architecture dependency rules

OpenAPI validation

migration linting

secret scanning

dependency scanning

generated-contract drift checks
```

---

# 21. Type Safety

No:

```text
any
```

as casual escape hatch in critical commercial code.

Exceptions require explicit justification.

---

# 22. Architectural Boundary Tests

Automated tests/lint rules should prevent:

```text
Orders importing Inventory repositories

Payments importing Finance tables

Storefront directly importing database package

Admin directly querying PostgreSQL

Domain importing HTTP controllers

Core domain importing provider SDKs
```

---

# 23. Example Boundary Rule

Allowed:

```text
orders/application
→ inventory/public
```

Forbidden:

```text
orders/application
→ inventory/infrastructure/repository
```

---

# 24. Database Ownership Test

A module should not issue write SQL to another module's tables except through explicitly approved shared infrastructure.

---

# 25. Domain Unit Tests

Best for deterministic business rules.

Examples:

```text
Order state transitions

Promotion eligibility

Pricing calculations

FIFO selection logic

Return quantity eligibility

Permission policy decisions

Sizing conversions
```

---

# 26. Unit Tests Should Be Fast

Target:

```text
milliseconds
```

not real database/network.

---

# 27. Unit Tests Should Not Mock the Subject

Bad:

```text
mock PricingEngine
then test PricingEngine behavior.
```

---

# 28. Pricing Unit Tests

Mandatory coverage:

```text
Line Gross

Percentage Discount

Fixed Discount

Caps

Multiple compatible Promotions

Conflicting Promotions

Manual Discount

Price Override

Delivery Discount

Free Delivery

Zero-value Order

Rounding remainder

Maximum amounts
```

---

# 29. Pricing Property Tests

Useful properties:

```text
discount <= eligible amount

net >= 0

total >= 0

sum allocations = discount

same input = same result

reordering irrelevant inputs does not alter result
unless ordering is semantically defined
```

---

# 30. Money Arithmetic

Generate many randomized valid inputs to verify:

```text
gross - discount = net

merchandise_net
+ delivery_net
+ tax
= total
```

exactly under decimal semantics.

---

# 31. Largest-Remainder Testing

Generate random:

```text
eligible line values

fixed discounts
```

and assert:

```text
sum(all rounded allocations)
=
exact committed discount
```

---

# 32. FIFO Unit Tests

Given Layers:

```text
5 @ 400

10 @ 500

10 @ 550
```

consume:

```text
8
```

must produce:

```text
5 @ 400
3 @ 500
```

---

# 33. FIFO Properties

Assert:

```text
no Layer quantity consumed below zero

assigned quantity exactly equals requested quantity

FIFO ordering preserved

total assigned cost reconciles

same inputs produce same assignment
```

---

# 34. Promotions Unit Tests

Mandatory:

```text
minimum subtotal

quantity threshold

Product target

Variant target

Category descendants

Collection target

exclusion wins

customer eligibility

coupon normalization

schedule boundaries

usage limit rules

combination classes

priority ties
```

---

# 35. Time Boundary Tests

Test exactly:

```text
1 ms before promotion start

at start

1 ms before end

at end
```

according to defined interval semantics.

---

# 36. Use Injected Clock

No business-rule test should depend on wall-clock:

```text
new Date()
```

inside domain logic.

Use the existing Clock abstraction.

---

# 37. Settings Tests

For each setting change semantic:

```text
FUTURE_ONLY

IMMEDIATE_DYNAMIC

REQUIRES_RECALCULATION

REQUIRES_MIGRATION

REQUIRES_IMPACT_RESOLUTION

IMMUTABLE_AFTER_USE
```

verify correct historical behavior.

---

# 38. Application Command Tests

Test complete application behavior such as:

```text
PlaceOrder

CancelOrder

VerifyPaymentAttempt

PostInboundReceipt

PostFulfillment

FinalizeLandedCost

MergeCustomers

PostReturnReceipt

CreateCourierBooking
```

---

# 39. Application Tests Verify

```text
authorization

validation

domain execution

repository changes

events

audit intent

error code

transaction behavior
```

---

# 40. Application Tests Should Not Be HTTP-Dependent

HTTP is separate.

Example:

```text
PlaceOrderHandler.execute(...)
```

can be tested directly.

---

# 41. Database Integration Tests

Run against real PostgreSQL.

Do not replace PostgreSQL semantics with:

```text
SQLite

in-memory fake DB
```

for tests involving:

```text
constraints

transactions

locking

NUMERIC

JSONB

indexes

SKIP LOCKED

unique constraints
```

---

# 42. Test Database Strategy

Preferred:

```text
ephemeral PostgreSQL instance
```

or isolated databases/schemas from a disposable PostgreSQL service.

---

# 43. Clean-State Requirement

Every test must start from deterministic data.

Avoid tests depending on:

```text
whatever another test inserted.
```

---

# 44. Isolation Approaches

Potential:

```text
transaction rollback per test

database/schema per worker

fixture reset
```

Choose based on concurrency requirements.

---

# 45. Concurrency Tests Need Independent Connections

A single transaction/connection cannot simulate actual race behavior.

Use:

```text
multiple real PostgreSQL sessions.
```

---

# 46. Database Constraint Tests

Explicitly test:

```text
tenant-safe FKs

unique SKU

unique Order number

provider transaction uniqueness

idempotency uniqueness

nonnegative/valid checks

single-active relationships

FK RESTRICT behavior
```

---

# 47. Do Not Assume Constraint Works

If a DB invariant is important, execute the violating SQL/use case and assert PostgreSQL rejects it.

---

# 48. Organization Isolation Tests

Create:

```text
Organization A

Organization B
```

with overlapping-looking records.

Attempt:

```text
A Order → B Customer

A Payment → B Order

A Inventory Item → B Location
```

Expected:

```text
rejected.
```

---

# 49. Tenant Test Fixture

Every integration suite involving organization-owned data should support multiple organizations.

Otherwise cross-tenant bugs remain invisible.

---

# 50. Transaction Tests

Test atomicity.

Example PlaceOrder:

inject failure after:

```text
Order created
```

but before:

```text
Inventory reservation
```

Expected:

```text
no partial Order committed.
```

---

# 51. Transaction Failure Matrix

For critical command, intentionally fail after each major internal step.

Example:

```text
Customer resolution

Order creation

Promotion usage

Inventory reservation

Payment Intent

Outbox
```

Expected:

```text
either valid complete transaction
or no committed transaction.
```

---

# 52. Do Not Test Only Happy Commit

Rollback behavior is equally important.

---

# 53. External Calls and Transactions

Test that provider calls are **not** required for local critical transaction rollback.

Example:

```text
PlaceOrder commits
Email provider offline
```

Expected:

```text
Order remains committed.
```

---

# 54. Concurrency Test Suite

This is mandatory.

Concurrency bugs frequently cannot be found by sequential tests.

---

# 55. Required Concurrency Test — Last Unit

Initial:

```text
Sellable: 1
```

Execute two simultaneous:

```text
PlaceOrder
```

Expected:

```text
one succeeds

one fails ITEM_UNAVAILABLE

final reserved/sellable state valid.
```

---

# 56. Required Concurrency — Coupon Final Usage

Usage remaining:

```text
1
```

Two simultaneous Orders.

Expected:

```text
exactly one commits usage.
```

---

# 57. Required Concurrency — Refund

Refundable:

```text
৳1,000
```

Two simultaneous requests:

```text
৳800
৳800
```

Expected total committed/pending refundable usage:

```text
<= ৳1,000.
```

---

# 58. Required Concurrency — Payment Verification

Same Payment Attempt verified by two operators.

Expected:

```text
one confirmed Payment.
```

---

# 59. Required Concurrency — Provider Callback

Same provider Payment callback received simultaneously multiple times.

Expected:

```text
one Provider Event effect

one Payment.
```

---

# 60. Required Concurrency — Receipt

Two operators post same Inbound Receipt.

Expected:

```text
one Inventory Transaction

one Cost Layer creation.
```

---

# 61. Required Concurrency — Fulfillment

Two operators post same Fulfillment.

Expected:

```text
one reservation consumption

one stock movement

one cost assignment.
```

---

# 62. Required Concurrency — FIFO

Layer:

```text
5 units.
```

Concurrent outbound requests:

```text
4

4
```

Expected:

```text
never consume 8.
```

---

# 63. Required Concurrency — Stocktake

Inventory movements occur while Stocktake is active.

Posting Stocktake must account for defined snapshot semantics rather than destroying legitimate movements.

---

# 64. Required Concurrency — Customer Merge

Two simultaneous merge attempts involving:

```text
A → B

B → C
```

must not create:

```text
alias loops

multiple canonical targets.
```

---

# 65. Required Concurrency — Return

One eligible returned unit.

Two Return Cases simultaneously request it.

Expected:

```text
maximum final authorized quantity = 1.
```

---

# 66. Required Concurrency — Courier Booking

Two booking commands for same Delivery.

Expected:

```text
one active external booking operation.
```

---

# 67. Race Reproduction

Concurrency tests should use synchronization barriers where possible.

Bad:

```text
start Promise.all()
and hope race occurs.
```

Better:

```text
connection A locks/reads
barrier
connection B enters
release
assert.
```

---

# 68. Repeat Race Tests

Certain concurrency tests should run repeated iterations in CI/nightly to improve confidence.

---

# 69. Idempotency Test Suite

Critical command contract:

```text
same logical request
+
same Idempotency Key
=
same logical result.
```

---

# 70. Same Key / Same Input

Test:

```text
response succeeds

client loses response

client retries
```

Expected:

```text
original result returned

no duplicate mutation.
```

---

# 71. Same Key / Different Input

Expected:

```text
IDEMPOTENCY_KEY_REUSED.
```

---

# 72. Required Idempotency Tests

```text
PlaceOrder

PostInboundReceipt

PostFulfillment

VerifyPaymentAttempt

CreateRefund

RecordSupplierPayment

CreateRTOCase

PostReturnReceipt

CreateCourierBooking operation

Provider callbacks

Bulk import row
```

---

# 73. Idempotency Crash Test

Simulate:

```text
business transaction committed

response serialization/network fails
```

Retry must discover committed result.

---

# 74. API Tests

Test HTTP transport separately from domain/application behavior.

Verify:

```text
routes

methods

request parsing

headers

auth

HTTP status

Problem Details

response DTOs

ETag

Idempotency-Key

pagination

filters
```

---

# 75. API Contract Rule

Every documented OpenAPI operation must have at least one automated contract verification path.

---

# 76. OpenAPI Drift

CI fails if:

```text
implementation response
```

and:

```text
documented schema
```

diverge materially.

---

# 77. Problem Details Tests

Verify stable:

```text
code

status

safe detail

request ID
```

for known errors.

---

# 78. Error Leakage

Test production API responses never expose:

```text
SQL

stack traces

provider secrets

filesystem paths

internal tokens
```

---

# 79. Pagination Tests

Test:

```text
first page

middle page

last page

invalid cursor

page limit

stable ordering

new insert between pages

archived row
```

---

# 80. Filter Tests

Every supported filter should have:

```text
positive match

negative match

combination match

unauthorized filter where applicable.
```

---

# 81. Sort Tests

Verify deterministic secondary key.

No unstable pagination due equal primary sort values.

---

# 82. ETag Tests

For version-controlled resources:

```text
correct If-Match
→ success

stale If-Match
→ 412

missing required If-Match
→ 428.
```

---

# 83. Public API Enumeration Tests

Attempt guessing:

```text
Order numbers

Customer IDs

Cart IDs

Return numbers
```

Expected unauthorized data remains inaccessible.

---

# 84. Authorization Test Matrix

Every privileged command/query needs matrix testing.

Dimensions:

```text
Principal type

Capability

Organization

Location scope

Resource ownership/context

Membership status

MFA/step-up state
```

---

# 85. Standard Authorization Cases

For each critical operation:

```text
allowed

unauthenticated

capability missing

scope missing

cross-organization

disabled Membership

expired Session
```

---

# 86. Sensitive Field Authorization

Example Customer query:

User A:

```text
customers.view
```

receives:

```text
masked phone
```

User B:

```text
customers.view_sensitive
```

receives full authorized detail.

---

# 87. Authorization Must Test Queries Too

Read leakage is often more dangerous than write failure.

---

# 88. Cross-Organization Fuzzing

For high-risk endpoints automatically substitute:

```text
Organization B IDs
```

into Organization A requests.

Expected:

```text
404/403 according to concealment policy.
```

Never data.

---

# 89. Permission Escalation Tests

Attempt:

```text
grant capability you cannot delegate

change yourself to Owner

remove Primary Owner protections

create unrestricted service credential
```

Expected rejection.

---

# 90. Step-Up Tests

High-risk operation:

```text
ownership transfer
```

without recent step-up.

Expected:

```text
STEP_UP_REQUIRED.
```

---

# 91. Service Account Tests

Verify:

```text
human-only operation denied

scope enforced

revoked key denied

rotated key behavior

credential hash lookup
```

---

# 92. Security Testing Layers

Security is tested through:

```text
static scanning

dependency scanning

secret scanning

authorization tests

input validation

upload tests

session tests

CSRF/XSS checks

SSRF tests

rate-limit tests

webhook signature tests

manual penetration testing later
```

---

# 93. Session Security Tests

Test:

```text
login

logout

session expiration

idle timeout

absolute timeout

password change

Membership disable

permission change

revoke one session

revoke all sessions
```

---

# 94. Session Revocation

After:

```text
Membership disabled
```

active privileged session must converge to denied state promptly.

---

# 95. CSRF Tests

Admin cookie-authenticated mutations must reject missing/invalid anti-CSRF conditions according to selected strategy.

---

# 96. XSS Tests

Inject:

```text
<script>

malformed HTML

event handlers

dangerous URLs
```

into:

```text
Product content

Review

Customer note

Return note

Supplier fields
```

Verify rendering remains safe.

---

# 97. Rich Content Tests

If rich-text support exists:

```text
sanitize allowed content

strip dangerous attributes/elements.
```

---

# 98. SSRF Tests

Integration/webhook endpoint configuration attempts:

```text
localhost

127.0.0.1

169.254.169.254

private network targets

redirect-to-private target
```

must be blocked according to policy.

---

# 99. Upload Security Tests

Test:

```text
wrong MIME

double extension

oversized upload

corrupted image

malicious SVG

HTML disguised as image

metadata

path-like filename
```

---

# 100. Private Media Tests

Payment evidence/return evidence cannot become publicly fetchable without authorization.

---

# 101. CSV Export Injection

Fields beginning with:

```text
=

+

-

@
```

must not become dangerous spreadsheet formulas under chosen export policy.

---

# 102. Rate-Limit Tests

Verify limits for:

```text
login

PlaceOrder

coupon guessing

guest Order lookup

review submission

payment-reference submission

Integration API
```

---

# 103. Abuse Tests

Generate:

```text
rapid fake COD Orders

coupon brute force

payment reference spam

review spam
```

and verify controls trigger without corrupting state.

---

# 104. Webhook Signature Tests

Outbound and provider callback tests:

```text
valid signature

bad signature

missing signature

old timestamp

modified body

replay

duplicate event
```

---

# 105. Raw Body Verification

Provider adapters requiring raw-body signature must be tested against byte-level body alteration.

---

# 106. Provider Simulation Architecture

Build deterministic simulators for external systems.

Do not make CI depend on live Pathao/Steadfast production systems.

---

# 107. Courier Simulator

Should support programmable scenarios:

```text
booking success

booking rejection

booking timeout after external success

unknown outcome

pickup

in transit

out for delivery

failed attempt

delivered

RTO

lost parcel

duplicate webhook

out-of-order webhook

bad signature

rate limiting

provider 500
```

---

# 108. Payment Provider Simulator

Future gateway simulator:

```text
payment success

payment decline

redirect success + callback missing

callback success + browser missing

duplicate callback

timeout unknown outcome

refund success

refund unknown outcome

settlement mismatch
```

---

# 109. Provider Simulator Rule

Simulators should reproduce:

```text
provider behavior
```

not bypass our adapter.

Tests must go:

```text
Maevelle Adapter
→ Fake Provider HTTP
```

where integration semantics matter.

---

# 110. Manual Payment Tests

bKash/Nagad manual workflow:

```text
Order created

Payment instructions

Attempt submitted

duplicate reference

wrong amount

verified

rejected

second attempt

late attempt

overpayment

underpayment
```

---

# 111. Payment Core Tests

Mandatory:

```text
Payment Intent

Attempt

Confirmed Payment

Allocation

Partial Payment

Multiple Payments

Unallocated Payment

Refund

Reversal

Settlement
```

---

# 112. Refund Tests

Must cover:

```text
partial refund

multiple partial refunds

concurrent refunds

provider success

provider decline

provider timeout

reconciliation

Refund without Return

Return without Refund
```

---

# 113. COD Tests

Critical scenarios:

```text
standard COD delivered

COD RTO

COD amount updated before pickup

digital Payment after booking

digital Payment after pickup

under-collection

over-collection

delivered but COD mismatch

provider collection confirmed

settlement delayed

settlement fee deductions
```

---

# 114. Order Tests

Mandatory lifecycle:

```text
Draft

Pending

Confirmed

Hold

Partial cancellation

Full cancellation

Partial fulfillment

Multiple fulfillment

Completed

Rejected if supported
```

---

# 115. Order Snapshot Tests

After Order commitment change:

```text
Product title

SKU

Price

Promotion

Customer Address

Customer name

Delivery pricing config
```

Expected:

```text
historical Order unchanged.
```

---

# 116. Cancellation Tests

Test:

```text
before payment

after payment

before fulfillment

partial fulfillment

after delivery disallowed paths

reservation release

promotion usage release

refund requirement
```

---

# 117. Inventory Tests

Mandatory:

```text
Opening Balance

Receipt

Reservation

Release

Expiry

Consumption

Adjustment

Condition change

Transfer

Stocktake

Return receipt

Loss

Damage

Quarantine
```

---

# 118. Inventory Ledger Property

For each Item/Location/Condition:

```text
initial
+
sum ledger movements
=
current physical quantity
```

subject to documented reservation separation.

---

# 119. Reservation Property

```text
reserved >= 0

reserved <= allowed stock policy

available-to-sell correct
```

---

# 120. No Direct Quantity Mutation Test

Architecture/integration tests ensure stock-changing application commands create corresponding:

```text
Inventory Transaction

Movement Lines.
```

---

# 121. Receiving Tests

Inbound Receipt:

```text
exact expected

partial

over

under

damaged

unresolved item

multiple Purchase sources

multiple Receipts

duplicate posting

correction
```

---

# 122. Receipt Correction

Posted Receipt cannot be edited to rewrite history.

Correction must generate compensating physical/cost effects.

---

# 123. Procurement Tests

```text
Purchase Draft

Confirm

Amend

Cancel quantity

Partial Shipment allocation

Supplier Invoice

Partial Supplier Payment

Advance

Allocation

Claim
```

---

# 124. Shipment Tests

```text
one Purchase → one Shipment

many Purchases → one Shipment

one Purchase Line → multiple Shipments

partial arrival

exceptions

partial receipt

over/short receipt
```

---

# 125. Landed Cost Tests

Mandatory:

```text
equal allocation

quantity

purchase value

weight

volume

chargeable weight

manual

direct cost

rounding

missing basis

partial Receipt

estimated → actual

late adjustment

credit
```

---

# 126. Landed Cost Property

```text
SUM(allocations)
=
eligible Cost Component amount
```

exactly according to monetary precision.

---

# 127. Costing Tests

Mandatory:

```text
FIFO

partial Layer

multiple Layers

transfer preservation

condition change

loss

return restoration

RTO

provisional cost

late cost

unvalued cost

COGS

COGS adjustment

COGS reversal
```

---

# 128. Costing Quantity Reconciliation

For each Cost Layer:

```text
origin quantity
=
all current positions
+
pending outbound
+
permanently disposed quantity
```

under canonical accounting of returns/restorations.

---

# 129. Costing Money Reconciliation

Effective Layer total must reconcile with:

```text
held value

pending outbound value

recognized/disposed value

adjustments/reversals
```

within exact defined rounding.

---

# 130. Returns Tests

Mandatory:

```text
Customer Return

RTO

authorization

partial approval

expiry

partial receipt

multiple receipts

wrong item

unmatched return

inspection

sellable disposition

damaged disposition

quarantine

Refund linkage

replacement Order
```

---

# 131. Return Core Property

Normal workflow:

```text
finalized returned quantity
<=
fulfilled eligible quantity.
```

---

# 132. Return Stock Rule Test

Verify none of:

```text
Return Request

Approval

Courier RTO status

Refund
```

changes Inventory.

Only:

```text
posted physical Return Receipt/Disposition
```

may do so.

---

# 133. RTO Cost Tests

Before COGS:

```text
return restores pending cost

no COGS reversal.
```

After COGS:

```text
physical return
→ valid reversal.
```

---

# 134. Delivery Tests

Mandatory:

```text
Delivery creation

booking success

booking rejection

unknown booking outcome

manual courier

handover

tracking

multiple attempts

delivered

failed

RTO

lost

COD

rebooking
```

---

# 135. Delivery State Progression

Provider stale events must not move:

```text
DELIVERED
→ IN_TRANSIT.
```

---

# 136. Delivery Duplicate Event

Repeated:

```text
DELIVERED
```

must not duplicate:

```text
COGS

Payment

Notification

RTO effects.
```

---

# 137. Geography Tests

```text
rural hierarchy

urban hierarchy

aliases

Bangla/English search

same-name ambiguity

historical Area

provider mapping

unmapped Area

serviceability exclusion

temporary override
```

---

# 138. Geography Cycle Test

Attempt cyclic hierarchy.

Expected rejection.

---

# 139. Geography Source Sync

Simulate provider returning:

```text
normal dataset

one rename

one ID replacement

empty dataset

90% record drop

duplicate IDs
```

Unsafe datasets must not automatically destroy current mapping data.

---

# 140. Customer Tests

```text
create

phones

emails

addresses

duplicate candidate

merge

alias

block/unblock

anonymize
```

---

# 141. Customer Non-Unique Phone Test

Two legitimate Customers can share phone under current identity architecture.

Database must not incorrectly enforce global phone uniqueness.

---

# 142. Customer Merge History

After merge:

```text
historical Order Customer FK
```

may remain original while canonical resolution returns merged Customer.

Test both.

---

# 143. Review Tests

```text
rating only

rating + body

media

verified purchase

unverified import

moderation

negative review

revision

merchant response

customer merge conflict
```

---

# 144. Negative Review Moderation Test

A one-star Review that satisfies content rules must not be rejected merely because it is negative.

---

# 145. Review Revision Test

Published Revision A.

Customer submits Revision B.

Expected:

```text
A remains public

B pending

approval swaps current revision.
```

---

# 146. Media Tests

```text
upload session

private upload

validation

processing

renditions

Product usage

Review usage

Payment evidence usage

archive

unused detection

purge blocking
```

---

# 147. Media Usage Test

An Asset with authoritative Product usage cannot be considered safe-to-delete merely because usage projection is stale.

---

# 148. Notification Tests

```text
event → notification

template rendering

required notification

optional preference

in-app read

email attempt

temporary failure retry

permanent failure

dedupe

provider callback
```

---

# 149. Notification Failure Isolation

If Email fails:

```text
Order remains placed

Payment remains confirmed

Refund remains real.
```

---

# 150. Analytics Tests

Analytics is derived.

Test:

```text
event ingestion

idempotency

projection rebuild

metric formulas

historical dimensions

refund attribution

COGS adjustment

currency handling

freshness
```

---

# 151. Metric Golden Tests

For important metrics create small hand-computable datasets.

Example:

```text
3 Orders

1 Refund

1 Discount

1 Delivery Fee

2 COGS Layers
```

Expected exact:

```text
Gross Merchandise

Discount

Net Merchandise

Refund Activity

Effective COGS

Gross Margin
```

---

# 152. Analytics Rebuild Test

Destroy a projection.

Rebuild from canonical source.

Expected:

```text
same metric facts.
```

---

# 153. Analytics Cannot Mutate Truth

Test permission and architecture boundaries.

---

# 154. Projection Rebuild Tests

Required for rebuildable projections:

```text
Product Search

Inventory summaries if derived

Customer statistics

Review rating summaries

Analytics facts/aggregates

Order summaries
```

---

# 155. Projection Corruption Test

Intentionally corrupt projection.

Run rebuild.

Canonical transactional data remains unchanged.

---

# 156. Outbox Tests

Mandatory:

```text
event written in same transaction

business rollback removes event

consumer retries

multiple consumers independent

consumer crash

consumer idempotency
```

---

# 157. Multiple Consumer Test

Event:

```text
OrderPlaced
```

Consumers:

```text
Notifications succeeds

Analytics fails

Webhook succeeds
```

Analytics failure must not mark event globally complete for all consumers.

---

# 158. Worker Crash Test

Crash worker:

```text
after job claimed

before completion.
```

Lease expires.

Another worker safely retries.

---

# 159. Crash After External Effect

Example:

```text
provider booking succeeds

worker dies before local success update.
```

Expected:

```text
UNKNOWN_OUTCOME/reconciliation
```

not blind duplicate create.

---

# 160. Job Retry Tests

Test:

```text
temporary failure

max attempts

dead letter

manual retry

permanent failure

non-retryable error
```

---

# 161. Scheduled Job Tests

Test:

```text
reservation expiry

promotion activation/expiry where scheduler involved

return authorization expiry

provider reconciliation

analytics refresh
```

using injected Clock.

---

# 162. Scheduler Duplicate Leadership

Two workers attempt same scheduled operation.

Expected one logical effect.

---

# 163. Browser E2E Strategy

E2E proves real:

```text
browser

frontend

API

application services

database
```

work together.

---

# 164. Do Not Put Every Rule in E2E

E2E should cover:

```text
critical customer journeys

critical operator journeys

major integration boundaries
```

while domain edge cases remain lower-level.

---

# 165. Storefront E2E — COD Golden Path

```text
Browse

Open Product

Select Color

Select Size

Add to Cart

Apply Coupon

Checkout

Enter Address

Select Delivery

Choose COD

Place Order

See Confirmation

Securely Track
```

---

# 166. Storefront E2E — bKash

```text
Checkout

bKash

Place Order

See Instructions

Submit Transaction Reference

See Awaiting Verification
```

Then Admin:

```text
open Payment queue

verify

Storefront tracking shows confirmed.
```

---

# 167. Storefront E2E — Last Unit

Two isolated browser sessions.

Both reach Checkout.

One succeeds.

Second receives recoverable unavailable-state UI.

---

# 168. Storefront E2E — Checkout Change

Change Product price or Promotion while Checkout open.

Customer presses Place Order.

Expected:

```text
updated pricing review
```

not silent Order.

---

# 169. Storefront E2E — Network Retry

Intercept PlaceOrder response after server commit.

Simulate browser timeout.

Retry same operation.

Expected:

```text
one Order.
```

---

# 170. Admin E2E — Order Processing

```text
new Order

verify Payment

create Fulfillment

post Fulfillment

create Delivery

book Courier

record Delivered

verify Order/COGS state
```

---

# 171. Admin E2E — Procurement

```text
Supplier

Purchase

Confirm

Shipment

Receipt

Post

Inventory

Landed Cost

Finalize

Cost valuation
```

---

# 172. Admin E2E — Return

```text
Return Request

Approve

Receive

Inspect

Restock

Refund

verify Costing/Inventory
```

---

# 173. Admin E2E — RTO

```text
Delivery fails

RTO created

Courier returns

Warehouse receipt

Inspection

Stock restored

no false COGS where not recognized
```

---

# 174. E2E Browser Matrix

Core CI:

```text
Chromium
```

Expanded CI/nightly:

```text
Chromium

WebKit

Firefox
```

with representative:

```text
desktop

mobile viewport
```

coverage.

---

# 175. Real Device Testing

Before production launch manually verify at least representative:

```text
iPhone Safari

Android Chrome

desktop Chrome
```

especially Checkout/payment/address workflows.

---

# 176. E2E Selector Policy

Prefer stable:

```text
role

label

accessible name

semantic test IDs only where necessary
```

not brittle CSS selectors.

---

# 177. E2E Diagnostics

On failure preserve:

```text
trace

screenshots

network/error context

request IDs
```

for CI debugging.

---

# 178. Visual Regression

Use selectively.

Good candidates:

```text
Product Card

PDP

Cart

Checkout

Order confirmation

Admin Order Workspace

critical status banners

print layouts
```

---

# 179. Do Not Snapshot Everything

Large indiscriminate screenshots create noisy maintenance.

Visual tests should protect meaningful design contracts.

---

# 180. Accessibility Automated Tests

Automate:

```text
common accessibility rule scans

keyboard-critical flows

labels

dialog focus

error associations
```

---

# 181. Accessibility Manual Checks

Automation cannot prove everything.

Manual review should cover:

```text
keyboard-only Checkout

screen-reader basic navigation

focus order

zoom

color/contrast

status communication
```

---

# 182. Performance Testing Levels

Separate:

```text
Frontend performance

API latency

Database performance

Worker throughput

Load capacity
```

---

# 183. Performance Budget — Storefront

Define target budgets before implementation freeze.

Track at least:

```text
LCP

INP

CLS

initial JS

image payload

server response latency
```

Exact thresholds can follow current web-performance standards during implementation.

---

# 184. API Performance Budgets

Classify endpoints.

Example targets:

### Interactive read

```text
p95 < target A
```

### Critical mutation

```text
p95 < target B
```

### Search

```text
p95 < target C
```

Exact milliseconds must be established after representative baseline benchmarking rather than arbitrary architecture numbers.

---

# 185. Performance Regression Gate

CI/nightly should alert if important query/API latency regresses materially versus baseline.

---

# 186. Database Query Tests

Capture:

```text
query plans

index usage

row estimates

execution time
```

for known high-volume queries.

---

# 187. N+1 Tests

High-value workspaces should be profiled to prevent:

```text
1 Order query
+
100 line/customer/payment queries.
```

---

# 188. Load Testing

Scenarios:

```text
Storefront browse burst

Product search

Cart mutations

Checkout calculations

PlaceOrder

Admin order list

provider callbacks

worker processing
```

---

# 189. Load Is Not Only Throughput

Observe:

```text
latency

error rate

DB connections

lock waits

CPU

memory

disk

worker backlog.
```

---

# 190. PlaceOrder Load Test

Verify under parallel Orders:

```text
no oversell

no duplicate Order

reasonable lock contention

bounded DB connection usage.
```

---

# 191. Callback Storm Test

Simulate:

```text
10,000 provider events
```

including duplicates.

System should:

```text
dedupe

queue safely

avoid starving normal Admin/Storefront.
```

---

# 192. Queue Backpressure Test

If Email/provider slows down:

```text
business transactions continue

job backlog becomes visible

worker memory remains bounded.
```

---

# 193. Resource Exhaustion Tests

Test controlled behavior for:

```text
DB pool exhaustion

disk nearing capacity

worker backlog

provider rate limit

large exports

large media uploads.
```

---

# 194. Failure Injection

Introduce deliberate failures.

Examples:

```text
database disconnect

worker process kill

provider timeout

object storage unavailable

email unavailable

Redis future unavailable

search projection unavailable
```

---

# 195. PostgreSQL Restart Test

During noncommitted operation:

Expected:

```text
transaction rollback

client safe error/retry.
```

After restart:

```text
data invariants intact.
```

---

# 196. Worker Restart Test

Durable jobs/outbox continue.

No lost tasks.

---

# 197. Object Storage Failure

Product image upload can fail.

Expected:

```text
no fake READY Asset

Product/catalog remains safe.
```

Existing commerce remains operational.

---

# 198. Search Projection Failure

Search may degrade.

Direct Product access/Checkout truth remains unaffected.

---

# 199. Analytics Failure

Orders continue.

No transactional dependency.

---

# 200. Notification Provider Failure

Commerce continues.

Notifications retry.

---

# 201. Courier Provider Outage

Test:

```text
Orders still created

Delivery booking queued/fails explicitly

manual fallback possible

no fake booking.
```

---

# 202. Payment Provider Outage Future

Affected Payment Method becomes unavailable/exception.

COD/other methods continue according to policy.

---

# 203. Chaos Test Scope

V1 does not require a full chaos-engineering platform.

Scripted failure scenarios in staging/test are sufficient.

---

# 204. Migration Testing

Database migrations are high risk.

Every migration must be tested:

```text
from prior supported schema

on representative data

with constraints

with application compatibility.
```

---

# 205. Clean Database Migration

Test:

```text
empty DB
→ all migrations
→ current schema.
```

---

# 206. Upgrade Migration

Test:

```text
previous release DB
→ new migrations
→ current application.
```

---

# 207. Representative Data Migration

Include:

```text
Orders

Payments

Inventory

Cost Layers

Returns

provider events

large text/JSON
```

not only empty tables.

---

# 208. Migration Failure Test

For high-risk migrations simulate interruption.

Document:

```text
restart

resume

restore

repair
```

behavior.

---

# 209. Expand-and-Contract Tests

During compatible rollout verify:

```text
old app + expanded schema

new app + expanded schema
```

where deployment sequence requires it.

---

# 210. Destructive Migration Gate

Require explicit review if migration:

```text
drops column

drops table

changes money precision

rewrites IDs

changes tenant ownership

rewrites ledger history.
```

---

# 211. Data Backfill Tests

Large backfills must verify:

```text
idempotent/restartable

bounded batches

progress tracking

no long blocking transactions

reconciliation after completion.
```

---

# 212. Backup Tests

Creating backups is insufficient.

We must verify they can be restored.

---

# 213. Restore Drill

Regular automated/manual drill:

```text
take backup

create isolated environment

restore PostgreSQL

restore required object-storage metadata/assets sample

start application

run smoke/reconciliation suite.
```

---

# 214. Restore Acceptance

Verify:

```text
Orders readable

Inventory reconciles

Payments intact

Costing intact

sessions/secrets handled appropriately

outbox/jobs state understood.
```

---

# 215. Point-in-Time Recovery Future

If PostgreSQL WAL/PITR is configured, periodically test recovery to a chosen timestamp.

---

# 216. Backup Corruption Test

At minimum validate backup integrity and detect incomplete archives.

---

# 217. Recovery Is a Testable Product Capability

Runbooks without restore drills are not trusted.

---

# 218. Print Tests

Verify:

```text
Invoice

Purchase document

Package label

Return receipt
```

for:

```text
A4

common printer behavior

page breaks

barcode/QR readability where used.
```

---

# 219. Localization Tests

Test:

```text
English

Bangla
```

where supported.

Include:

```text
long translations

number formatting

currency

date/time

Bangla text input/search.
```

---

# 220. Timezone Tests

Organization:

```text
Asia/Dhaka
```

Test:

```text
midnight boundaries

promotion windows

analytics reporting day

Order dates

scheduled jobs.
```

---

# 221. DST Tests

Even though Bangladesh currently does not normally use DST, platform architecture supports named IANA zones.

Test another DST-observing timezone to prevent fixed-offset assumptions.

---

# 222. Currency Tests

At least:

```text
BDT

USD
```

in automated money logic.

Include a currency with non-default minor-unit behavior in lower-level money tests to detect hard-coded two-decimal assumptions.

---

# 223. Maximum Boundary Tests

Test near defined limits:

```text
large Order quantity

large monetary values

maximum string lengths

maximum import rows

maximum media size

maximum page limit.
```

---

# 224. Negative/Invalid Boundary Tests

```text
negative quantity

negative unsupported amount

zero quantity

NaN-like input

overflow strings

invalid UUID

malformed JSON.
```

---

# 225. Unicode Tests

Include:

```text
Bangla names

emoji in allowed notes

combining characters

mixed Bangla/English

RTL text where unexpected
```

to ensure storage/rendering does not corrupt text.

---

# 226. Search Tests

Catalog search:

```text
exact title

partial

SKU

Bangla

English

color alias

category

tag

occasion

typo tolerance
```

---

# 227. Search Permission Tests

Admin search must not surface restricted Finance/Customer entities.

---

# 228. Search Projection Staleness

Product archived but stale Search result exists.

Click/Checkout canonical Product query must prevent sale.

---

# 229. Import Testing

Every import type:

```text
valid file

invalid headers

duplicate rows

partial invalid rows

wrong types

huge file

interrupted processing

retry

preview consistency.
```

---

# 230. Import Preview Invariant

Data shown in preview must correspond to the same normalized input used during confirmation or detect input/config drift.

---

# 231. Export Testing

Verify:

```text
permission

scope

current filters

large dataset

PII masking

CSV safety

expiration

private download.
```

---

# 232. Data Factory Architecture

Create composable test factories:

```text
organizationFactory

membershipFactory

customerFactory

productFactory

variantFactory

inventoryFactory

orderFactory

paymentFactory

deliveryFactory

returnFactory
```

---

# 233. Factories Should Create Valid Defaults

Example:

```text
orderFactory()
```

creates internally valid Order.

Override only fields relevant to test.

---

# 234. Invalid Fixtures

Use explicit helpers:

```text
buildInvalidOrder(...)
```

instead of normal factories silently generating impossible records.

---

# 235. Scenario Builders

For complex tests create domain scenarios:

```text
givenSellableVariant()

givenPaidOrder()

givenDeliveredCODOrder()

givenRTOInTransit()

givenReceivedInventoryLayer()
```

---

# 236. Avoid Giant Global Seed

Tests should not depend on a massive opaque seed database.

Use focused factories.

---

# 237. Golden Data Sets

Maintain small intentional datasets for:

```text
Pricing

Analytics

Costing

Geography

permissions
```

where expected outputs can be manually inspected.

---

# 238. Deterministic Randomness

Property/load tests using randomness should record:

```text
seed
```

so failure is reproducible.

---

# 239. Test IDs

Recommended naming:

```text
ORD-CON-001

PAY-IDEM-004

INV-LEDGER-010

SEC-TENANT-003

DLV-RTO-007
```

for high-value scenario registry.

Test implementation filenames do not need every ID, but report/registry can.

---

# 240. Test Naming

Prefer:

```text
"does not reserve the same final unit for two concurrent Orders"
```

over:

```text
"test inventory case 4".
```

---

# 241. CI Layers

Recommended PR pipeline:

```text
1. Install / dependency integrity

2. Lint

3. Typecheck

4. Architecture checks

5. Unit / property tests

6. Database integration tests

7. API/contract tests

8. Build

9. Security scans

10. Critical E2E
```

---

# 242. Parallelization

Parallelize independent suites.

Do not parallelize tests that accidentally share mutable test state.

---

# 243. Pull Request Time Budget

Keep normal PR pipeline reasonably fast.

Move expensive:

```text
full browser matrix

large load tests

long race repetitions

restore drills

full security scans
```

to scheduled/release pipelines where appropriate.

---

# 244. Nightly Pipeline

Recommended:

```text
full integration suite

expanded browser matrix

race repetitions

provider simulations

projection rebuild

migration from latest production-like snapshot

security deeper scan

performance regression

long-running data integrity checks
```

---

# 245. Release Candidate Pipeline

Before production deployment:

```text
all P0/P1 tests

full migration test

critical E2E

security gate

performance sanity

backup confirmation

staging smoke

provider sandbox/simulation verification.
```

---

# 246. Production Smoke Tests

After deployment use non-destructive checks.

Examples:

```text
Storefront home loads

Product loads

Search works

Admin login works

Health endpoints pass

DB available

Worker active

Object storage accessible

critical provider health observable.
```

---

# 247. Production Smoke Must Not Create Real Customer Effects

Avoid automatically:

```text
placing real courier Orders

sending real bKash transactions

emailing Customers.
```

Use dedicated safe fixtures/providers where possible.

---

# 248. Synthetic Production Order

If ever used:

```text
explicit TEST Order source

non-deliverable provider sandbox/manual handling

auto-cleanup policy
```

and ensure it does not contaminate business Analytics.

Not mandatory V1.

---

# 249. Release Gates

P0 test failure:

```text
deployment blocked.
```

P1:

```text
deployment normally blocked.
```

P2:

```text
product-owner/engineering decision possible.
```

---

# 250. Flaky Test Gate

A known-flaky P0/P1 test cannot simply be:

```text
.skip()
```

indefinitely.

It requires:

```text
owner

issue

deadline/priority

risk classification.
```

---

# 251. Quarantine

Only low-risk/non-authoritative tests may be temporarily quarantined.

Critical correctness tests remain blocking.

---

# 252. Code Coverage

Coverage percentage is diagnostic, not the objective.

---

# 253. Coverage Policy

Higher expectations for:

```text
Pricing

Promotion calculations

Inventory

Costing

Payments

Authorization
```

but we do not chase meaningless:

```text
100% line coverage
```

through tests that prove nothing.

---

# 254. Mutation Testing

Strong later enhancement for:

```text
Pricing

Promotion

Inventory calculations

Authorization
```

to detect weak tests that pass even when logic is deliberately corrupted.

Not required to block initial implementation.

---

# 255. Manual QA

Automation cannot replace all product review.

Manual release checklist should cover:

```text
new major UX

copy

responsive behavior

visual polish

unexpected workflow interactions.
```

---

# 256. Exploratory Testing

Before major release perform exploratory sessions around:

```text
Orders

Payments

Warehouse

Returns

Courier

Customer Checkout
```

with users intentionally trying unusual sequences.

---

# 257. Operator Testing

Warehouse/operator workflows should be tested by someone acting like an actual operator:

```text
rapid receiving

partial quantities

mistyped counts

back navigation

double-click

network drop.
```

---

# 258. Test Production-Like Data Volume

Staging should periodically contain enough:

```text
Orders

Customers

Products

Inventory ledger rows

Audit events
```

to expose performance behavior.

No copied production PII unless explicitly approved/sanitized.

---

# 259. Privacy in Test Environments

Use:

```text
synthetic

anonymized

generated
```

Customer data.

---

# 260. No Production Secrets

Test/staging uses separate:

```text
API credentials

payment accounts

courier accounts

object storage

webhook secrets.
```

---

# 261. Test Provider Safety

Staging courier integration should not accidentally request real pickup.

Use:

```text
sandbox

fake provider

disabled live actions
```

unless an explicit controlled real-provider test is being performed.

---

# 262. Database Integrity Suite

Create a reusable reconciliation suite runnable:

```text
CI

staging

production read-only
```

for important equations.

---

# 263. Inventory Reconciliation Queries

Detect:

```text
negative impossible balances

ledger/level mismatch

reservation mismatch

duplicate posting links.
```

---

# 264. Payment Reconciliation

Detect:

```text
payment allocations > payment

refunds > refundable

duplicate provider references

settlement inconsistencies.
```

---

# 265. Pricing Reconciliation

Detect:

```text
Order Line sum mismatch

discount allocation mismatch

grand-total mismatch.
```

---

# 266. Costing Reconciliation

Detect:

```text
Layer quantity mismatch

Cost Position mismatch

COGS allocation mismatch

invalid reversal.
```

---

# 267. Return Reconciliation

Detect:

```text
returned > fulfilled

inventory restoration without receipt

COGS reversal without restoration

duplicate RTO restoration.
```

---

# 268. Delivery Reconciliation

Detect:

```text
multiple active bookings

delivered + active RTO conflict

COD collection mismatch

lost delivery unresolved in costing.
```

---

# 269. Audit Reconciliation

For high-risk mutations verify Audit record exists.

Examples:

```text
Inventory adjustment

Refund

Customer merge

permission change

manual Delivery override

Cost correction.
```

---

# 270. Test Failure Evidence

Critical CI failures should preserve:

```text
test name

seed if randomized

request ID

relevant entity IDs

DB error

trace

safe logs
```

without secrets/PII.

---

# 271. Developer Local Workflow

Recommended:

```text
pnpm test
```

fast suite.

Then targeted:

```text
domain

database

E2E
```

commands.

Exact scripts fixed during repository bootstrap.

---

# 272. Pre-Commit

Keep light:

```text
format/lint selected files

possibly targeted unit tests.
```

Do not make commits painfully slow.

---

# 273. Pre-Push / CI

Full meaningful verification belongs CI.

---

# 274. Test Ownership

Every module owns tests for its behavior.

Cross-domain scenarios belong:

```text
tests/integration

tests/scenarios
```

or equivalent dedicated package.

---

# 275. Proposed Test Structure

```text
tests/
  scenarios/
    checkout/
    inventory/
    payments/
    delivery/
    returns/
    costing/
    security/

  e2e/
    storefront/
    admin/

  performance/
  security/
  migrations/
  recovery/
```

Within modules:

```text
packages/core/src/modules/orders/
  domain/
    *.spec.ts
  application/
    *.spec.ts
```

---

# 276. Testkit Package

Recommended:

```text
packages/testkit
```

containing:

```text
factories

scenario builders

fake Clock

fake external providers

DB helpers

authorization fixtures

money helpers

assertion helpers.
```

---

# 277. Testkit Must Not Become Production Dependency

Production modules should not import testkit.

---

# 278. Database Test Helper

Should support:

```text
create Organization

create connection/session

open independent transaction

synchronize concurrency barriers

query reconciliation
```

---

# 279. Provider Fake Package

Potential:

```text
packages/testkit/providers
```

with:

```text
FakeCourierServer

FakePaymentGateway

FakeEmailProvider

FakeObjectStorageAdapter
```

---

# 280. Quality Dashboards

CI/reporting should surface:

```text
pass/fail

flaky tests

slow tests

coverage trend

E2E browser results

performance trend

security findings.
```

---

# 281. Production Quality Signals

After release observe:

```text
error rate

Order failure rate

Payment reconciliation

Inventory Integrity Issues

provider failures

worker dead letters

Checkout errors

unexpected refund rate
```

to find defects tests missed.

---

# 282. Observability Feeds Testing

Production incident:

```text
trace/request evidence
→ reproduce
→ regression test.
```

---

# 283. Quality Is Closed-Loop

```text
Architecture
    ↓
Tests
    ↓
Implementation
    ↓
Production Observability
    ↓
Incident
    ↓
Regression Test
    ↓
Improved Architecture
```

---

# 284. Definition of Done — Feature

No behavior-changing feature is complete until:

```text
requirements understood

invariants identified

tests written

tests observed failing where applicable

implementation passes

authorization tested

error cases tested

logging/metrics considered

docs updated

E2E updated if critical journey changed.
```

---

# 285. Definition of Done — Bug

```text
bug reproduced

regression test added

root cause fixed

neighboring edge cases checked

production data impact evaluated

repair/reconciliation considered.
```

---

# 286. Definition of Done — Migration

```text
clean install passes

upgrade passes

representative data passes

rollback/recovery plan documented where required

post-migration reconciliation passes.
```

---

# 287. Definition of Done — Integration

```text
success

validation rejection

authentication failure

timeout

unknown outcome

retry

duplicate callback

out-of-order callback

provider outage

reconciliation

manual fallback
```

must be addressed.

---

# 288. Definition of Done — Critical Command

Must document/test:

```text
authorization

transaction

locking

idempotency

events

audit

rollback

concurrency

retry

errors

reconciliation.
```

---

# 289. Quality Invariants

### TEST-INV-001

Every P0/P1 architecture invariant has an explicit automated verification strategy.

### TEST-INV-002

Critical financial, Inventory and authorization logic is not proven solely through mocked unit tests.

### TEST-INV-003

Database-dependent correctness is tested against real PostgreSQL semantics.

### TEST-INV-004

Concurrency-sensitive workflows have explicit simultaneous-execution tests.

### TEST-INV-005

Critical idempotent commands test response-loss retry behavior.

### TEST-INV-006

Every production bug that can be reproducibly automated gains a regression test.

### TEST-INV-007

Cross-organization isolation is tested across reads and writes.

### TEST-INV-008

Provider simulations include duplicate, delayed and out-of-order behavior.

### TEST-INV-009

Provider timeout is never automatically tested as confirmed failure when outcome can be uncertain.

### TEST-INV-010

Critical E2E tests verify customer/operator journeys, not every domain edge case.

### TEST-INV-011

Historical snapshots are tested against later master-data changes.

### TEST-INV-012

Money tests never rely on binary floating-point equality.

### TEST-INV-013

Inventory tests prove quantity-ledger reconciliation.

### TEST-INV-014

Costing tests prove Cost Layer quantity and monetary reconciliation.

### TEST-INV-015

Analytics tests consume canonical facts and never validate by reimplementing source-domain algorithms.

### TEST-INV-016

Projection rebuild tests prove projections are disposable.

### TEST-INV-017

Migration tests cover both clean installation and upgrade from prior supported schema.

### TEST-INV-018

Backup capability is not considered healthy until restore has been tested.

### TEST-INV-019

Security scans complement but do not replace authorization/security behavior tests.

### TEST-INV-020

Retries cannot be used to hide known deterministic test failures.

### TEST-INV-021

Production smoke tests are non-destructive by default.

### TEST-INV-022

Test environments never casually use production PII or production secrets.

### TEST-INV-023

Failure-injection tests verify graceful degradation of non-critical dependencies.

### TEST-INV-024

Every critical command is tested for rollback at important internal failure boundaries.

### TEST-INV-025

Provider-facing integrations always have reconciliation test coverage.

### TEST-INV-026

Customer-facing network uncertainty is tested without duplicate business effects.

### TEST-INV-027

UI tests verify accessible state and behavior, not only screenshots.

### TEST-INV-028

Quality gates are risk-based: P0/P1 failures cannot be casually ignored.

### TEST-INV-029

Integrity/reconciliation tests can be safely run in read-only mode against production where designed.

### TEST-INV-030

Testing remains traceable back to architecture requirements instead of becoming an unrelated collection of tests.

---

# 290. Mandatory V1 Quality Scope

```text
✓ Type checking

✓ Linting

✓ Architecture boundary tests

✓ Domain unit tests

✓ Pricing property tests

✓ FIFO tests

✓ Application command tests

✓ Real PostgreSQL integration tests

✓ Database constraint tests

✓ Transaction rollback tests

✓ Concurrency tests

✓ Idempotency tests

✓ Authorization matrix tests

✓ Cross-organization tests

✓ API tests

✓ OpenAPI contract validation

✓ Storefront critical E2E

✓ Admin critical E2E

✓ Courier provider simulator

✓ Manual Payment workflows

✓ Refund tests

✓ COD tests

✓ Returns/RTO tests

✓ Costing tests

✓ Geography tests

✓ Outbox tests

✓ Worker crash/retry tests

✓ Projection rebuild tests

✓ Migration tests

✓ Security tests

✓ Upload tests

✓ Accessibility automation

✓ Frontend performance monitoring

✓ API/database performance baselines

✓ Basic load testing

✓ Failure injection

✓ Backup/restore drill

✓ Production smoke tests

✓ Data reconciliation suite

✓ Regression-test policy
```

---

# 291. Strongly Preferred V1

```text
✓ Property-based testing

✓ Expanded browser matrix

✓ Visual regression for critical screens

✓ Performance regression tracking

✓ Nightly race-test repetitions

✓ Provider callback storm tests

✓ Production read-only integrity checks

✓ Test-seed capture

✓ Test result dashboard

✓ Test data factories

✓ Scenario builders

✓ Automated staging smoke

✓ Dependency/security deep scan
```

---

# 292. Explicitly Deferred

```text
Full chaos platform

Continuous fuzzing cluster

Massive-scale distributed load laboratory

Full mutation testing on every PR

Native mobile device farm

Automated penetration testing replacing human review

Formal verification of all domain logic

Multi-region disaster simulation

Continuous full production synthetic commerce
```

---

# 293. Provisional Tooling Direction

Without freezing an unnecessary implementation ADR yet:

```text
Unit / Domain / Application
→ Vitest or equivalent TypeScript-native runner

Browser E2E
→ Playwright

Database
→ real PostgreSQL test environment

Provider testing
→ local deterministic HTTP simulators

Load testing
→ dedicated load tool selected through ADR

Accessibility
→ automated axe-style checks + manual verification

Security
→ SAST + dependency + secret scanning + behavioral security tests
```

Tooling may change.

The quality contracts above should not.

---

# 294. Skills.sh Workflow Recommendation

During actual implementation, the project should use a TDD-oriented agent skill for behavioral changes.

A strong current option is:

```text
addyosmani/agent-skills
→ test-driven-development
```

The implementation rule should remain:

```text
RED
→ GREEN
→ REFACTOR
→ VERIFY
```

rather than asking AI agents to generate large amounts of implementation first and add tests afterward.

---

# 295. Critical Pre-Launch Proof Checklist

Before launch Maevelle must demonstrate at minimum:

```text
Two Customers cannot buy the same final unit.

A PlaceOrder retry cannot create a second Order.

A Payment callback retry cannot create a second Payment.

Two Refunds cannot exceed the refundable amount.

An Inbound Receipt cannot post stock twice.

A Fulfillment cannot deduct stock twice.

A Return cannot restore stock twice.

A courier RTO status alone cannot restore stock.

A Refund alone cannot reverse COGS.

Two Organizations cannot access each other's records.

A Customer cannot manipulate authoritative Price.

A stale Admin page cannot silently overwrite newer data.

A provider timeout cannot automatically create duplicate courier bookings.

Cost Layers cannot be consumed below zero.

Order pricing remains unchanged after Product/Promotion changes.

Historical Orders remain readable after Product/Customer changes.

Inventory ledger reconciles.

Pricing totals reconcile.

Payments reconcile.

Costing reconciles.

Backups restore successfully.
```

If any of these cannot be proved, launch readiness is incomplete.

---

# 296. Critical Launch E2E Set

At minimum:

### Flow A — COD Purchase

```text
Customer
→ Product
→ Variant
→ Cart
→ Checkout
→ Address
→ Delivery
→ COD
→ Order
→ Reservation
→ Admin Fulfillment
→ Courier
→ Delivered
→ COGS
```

### Flow B — Manual bKash

```text
Order
→ Instructions
→ Payment Attempt
→ Verification
→ Fulfillment
→ Delivery
```

### Flow C — Failed Delivery/RTO

```text
Fulfillment
→ Delivery
→ Failed
→ RTO
→ Return Receipt
→ Inspection
→ Inventory restored
```

### Flow D — Customer Return

```text
Delivered
→ COGS
→ Return
→ Receipt
→ Inspection
→ COGS reversal
→ Refund
```

### Flow E — Procurement to Margin

```text
Purchase
→ Shipment
→ Receipt
→ Inventory
→ Landed Cost
→ Cost Layer
→ Sale
→ COGS
→ Margin
```

---

# 297. Architecture Milestone

Maevelle now has:

```text
Architecture Invariants
        ↓
Quality Registry
        ↓
Executable Tests
        ↓
CI Gates
        ↓
Production Reconciliation
```

Testing is therefore no longer a separate engineering concern.

It becomes the mechanism that proves the architecture remains true after every change.

---

# 298. Important Outstanding Item

One document from the architecture process remains worth formalizing before operational runbooks:

```text
docs/quality/cross-domain-stress-test-failure-matrix.md
```

We have progressively stress-tested individual domains while designing them, but we have **not yet consolidated the entire platform into one adversarial cross-domain matrix**.

That should not be silently skipped.

---

# 299. Why a Separate Cross-Domain Stress Matrix Still Matters

Unit/domain testing asks:

```text
Does this module behave correctly?
```

The cross-domain stress matrix asks:

```text
What happens when several individually-correct modules fail or race together?
```

Examples:

```text
Payment confirmed
while Order cancelled
while courier COD update times out.

Delivery reports Delivered
while Customer disputes delivery
while Settlement reports COD.

Landed Cost finalizes
while stock is being sold
and some quantity is in RTO.

Customer merge occurs
while Promotion usage and Review submission race.

Deployment starts
while Worker owns jobs
and provider callback arrives.

Restore from backup
while external provider has newer state than restored database.
```

These scenarios deserve one consolidated source of truth.

---

# 300. Recommended Next Document

Therefore the strongest next document is:

```text
docs/quality/cross-domain-stress-test-failure-matrix.md
```

# **Cross-Domain Stress Test, Failure Modes, Recovery & Compensation Matrix**

Every scenario should define:

```text
1. Trigger

2. Concurrent facts

3. Correct final state

4. Dangerous incorrect state

5. Prevention

6. Detection

7. Recovery

8. Compensation

9. Audit evidence

10. Customer impact

11. Operator UX

12. Automated test

13. Monitoring signal

14. Remaining risk
```

---

# 301. Stress Matrix Families

It should aggressively attack:

```text
Checkout ↔ Pricing ↔ Promotions ↔ Inventory

Orders ↔ Payments

Orders ↔ Customers

Orders ↔ Fulfillment

Fulfillment ↔ Inventory ↔ Costing

Delivery ↔ Payments/COD

Delivery ↔ Returns

Returns ↔ Inventory ↔ Costing

Returns ↔ Refunds

Procurement ↔ Shipments

Receiving ↔ Inventory ↔ Costing

Landed Cost ↔ Sold/Transferred/Returned Inventory

Customer Merge ↔ Promotions ↔ Reviews ↔ Orders

Permissions ↔ Long-running Jobs

Settings ↔ Existing Transactions

Webhooks ↔ Outbox ↔ Worker Crashes

Provider State ↔ Local State

Deployment ↔ Jobs ↔ Callbacks

Migration ↔ Live Traffic

Backup Restore ↔ External Provider Reality

Disk Full

Database Unavailable

Partial Network Partition

Operator Mistakes

Malicious Requests

Duplicate Events

Missing Events

Out-of-Order Events

Projection Corruption

Clock Errors

Stale UI

Concurrent Admin Actions
```

---

# 302. Sequence After That

```text
Cross-Domain Stress Test & Failure Matrix
        ↓
Operations / Incident / Recovery Runbooks
        ↓
Implementation Roadmap
        ↓
Repository Bootstrap
        ↓
Concrete PostgreSQL Migrations
        ↓
Core Application Implementation
        ↓
Admin + Storefront
```

This is the correct point to perform the **final adversarial attack on the architecture** before turning all of these designs into implementation tasks.

---

**End of Testing, Verification & Quality Master Plan v0.1**
