# Maevelle Ecommerce — Implementation Roadmap

**Document:** `docs/implementation/implementation-roadmap.md`
**Status:** Historical implementation sequence and architecture reference

> Current product development is governed by `docs/product-completion/`. Phase
> and launch milestones below remain historical evidence and operational
> reference; they no longer define the active work queue or prove completeness.
**Version:** 0.1
**Audience:** Owner, developers, AI coding agents, reviewers
**Authority:** Must be read together with domain/architecture source-of-truth documents.

---

# 1. Purpose

This document converts Maevelle from:

```text
Architecture
Requirements
Domain models
Failure handling
UX design
```

into:

```text
Ordered engineering execution.
```

It defines:

- what gets built first,
- what must exist before another feature starts,
- what must not be built prematurely,
- which database structures may be introduced,
- when Admin and Storefront work begins,
- testing requirements,
- staging gates,
- release gates,
- and what constitutes completion.

---

# 2. Central Implementation Principle

> **Build foundations first, then complete vertical business slices—not disconnected horizontal layers.**

We should not build:

```text
all tables
→ all repositories
→ all APIs
→ all Admin pages
→ all Storefront pages
→ tests at the end
```

That produces large amounts of unverified infrastructure.

Instead:

```text
FOUNDATION
    ↓
SMALL COMPLETE BUSINESS SLICE
    ↓
DATABASE
DOMAIN
APPLICATION
API
UI
TESTS
OBSERVABILITY
    ↓
VERIFY
    ↓
NEXT SLICE
```

---

# 3. Second Principle

> **Architecture remains authoritative until implementation evidence justifies changing it.**

A developer must not silently simplify architecture because:

```text
"this is easier to code."
```

If implementation exposes a real problem:

```text
implementation finding
        ↓
architecture review
        ↓
ADR/domain-doc update
        ↓
implementation
```

---

# 4. Third Principle

> **No module may invent another module's business rules.**

Examples:

Storefront must not calculate authoritative discounts.

Admin must not directly update stock.

Payments must not mark Orders fulfilled.

Delivery must not restore RTO stock.

Analytics must not recalculate FIFO.

---

# 5. Fourth Principle

> **Correctness precedes automation.**

Example courier evolution:

```text
Manual Delivery
        ↓
Provider Adapter
        ↓
Automatic Booking
        ↓
Automatic Tracking/Reconciliation
```

This is safer than beginning with complex provider automation before the Delivery lifecycle itself works.

---

# 6. Fifth Principle

> **Every implementation phase has an exit gate.**

A phase is not complete because:

```text
"most of the code exists."
```

It is complete only when its:

```text
schema

domain behavior

application commands

API

tests

authorization

observability

critical UI

integrity checks
```

meet the defined exit criteria.

---

# 7. Implementation Authority Hierarchy

When implementation decisions conflict, use this priority:

```text
1. Security / business integrity invariants

2. Domain architecture

3. Cross-domain architecture

4. Database architecture

5. API/application contracts

6. Product UX architecture

7. Implementation roadmap

8. ADRs

9. Implementation convenience
```

ADRs may amend technical choices but may not silently violate domain invariants.

---

# 8. Source-of-Truth Document Classes

### Domain truth

```text
docs/domains/
```

Defines business behavior.

### System architecture

```text
docs/architecture/
```

Defines cross-domain/system rules.

### Product UX

```text
docs/product/
```

Defines Admin/Storefront interaction architecture.

### Quality

```text
docs/quality/
```

Defines proof requirements.

### Operations

```text
docs/operations/
```

Defines production recovery.

### Implementation

```text
docs/implementation/
```

Defines engineering sequencing and execution.

---

# 9. Implementation Phases

Recommended top-level phases:

```text
PHASE 0  — Implementation readiness

PHASE 1  — Repository & engineering foundation

PHASE 2  — Database/platform foundation

PHASE 3  — Catalog, Sizing & Media

PHASE 4  — Warehouse & Inventory

PHASE 5  — Customers, Pricing, Promotions & Cart

PHASE 6  — Orders + First Storefront Checkout

PHASE 7  — Payments

PHASE 8  — Fulfillment & Delivery

PHASE 9  — Procurement, Shipment & Receiving

PHASE 10 — Landed Cost & Inventory Costing

PHASE 11 — Returns, RTO & Refund Integration

PHASE 12 — Finance Operations

PHASE 13 — Reviews & Customer Trust

PHASE 14 — Notifications & Integrations Hardening

PHASE 15 — Analytics & Reporting

PHASE 16 — Full Admin Operations

PHASE 17 — Full Storefront / SEO / Merchandising

PHASE 18 — Security, performance & operational hardening

PHASE 19 — Staging / UAT / launch readiness

PHASE 20 — Production launch
```

These are dependency phases, not necessarily calendar sprints.

---

# 10. Phase 0 — Implementation Readiness

Before writing meaningful production code, close technical decisions that affect the entire repository.

---

# 11. Blocking ADRs

The following ADRs should be resolved early:

```text
ADR-001 Backend HTTP Framework

ADR-002 PostgreSQL ORM / Query Builder

ADR-003 Authentication / Session Implementation

ADR-004 Object Storage Provider

ADR-005 Background Job Implementation

ADR-006 Reverse Proxy

ADR-007 PostgreSQL Search Implementation

ADR-008 Observability / Error Tracking

ADR-009 Deployment & CI/CD Pipeline
```

---

# 12. ADR Rule

Do not choose a technology merely because:

```text
"it's popular."
```

Each ADR must evaluate:

```text
Architecture fit

Explicit transaction support

Type safety

Performance

Operational complexity

Debuggability

Security

Vendor lock-in

VPS suitability

Testing

Migration strategy

Future scaling
```

---

# 13. Phase 0 Deliverables

```text
docs/adr/ADR-001-...
...
docs/adr/ADR-009-...

docs/implementation/postgresql-schema-specification.md
```

The schema specification may be progressively refined, but core relationships must be defined before migrations.

---

# 14. Phase 0 Exit Gate

Must have:

```text
✓ Blocking ADRs approved

✓ Package/module naming finalized

✓ PostgreSQL logical schemas finalized

✓ Core tenant strategy finalized

✓ Identifier strategy finalized

✓ Money/quantity precision finalized

✓ migration strategy finalized

✓ testing strategy mapped to repository

✓ deployment environment model finalized
```

No significant domain implementation before this gate.

---

# 15. Phase 1 — Repository & Engineering Foundation

Create the actual monorepo.

Recommended:

```text
apps/
  storefront/
  admin/
  api/
  worker/

packages/
  core/
  database/
  contracts/
  config/
  observability/
  security/
  ui-admin/
  ui-storefront/
  testkit/

docs/
scripts/
infrastructure/
```

---

# 16. Workspace Foundation

Recommended:

```text
pnpm workspace
```

Turborepo remains optional.

Do not add tooling without measurable benefit.

---

# 17. Repository Standards

Configure:

```text
TypeScript strict mode

ESLint

formatting

workspace boundaries

environment validation

test framework

build scripts

CI
```

---

# 18. Architecture Boundary Enforcement

Automated rules must prevent:

```text
storefront → database

admin → database

domain → HTTP

domain → provider SDK

orders → inventory repositories

payments → orders tables
```

---

# 19. Base CI

Initial CI:

```text
install

lint

typecheck

architecture rules

unit tests

build

secret scan

dependency scan
```

---

# 20. Environment Structure

Create:

```text
.env.example

development

test

staging

production
```

Secrets never committed.

---

# 21. Application Configuration

Use validated configuration at application startup.

Invalid critical configuration should:

```text
fail startup
```

rather than produce undefined behavior later.

---

# 22. Shared Kernel

Only true universal concepts:

```text
ID

Money

Currency

Clock

Result/Error

Organization context

Actor context
```

Avoid:

```text
packages/core/utils/everything.ts
```

---

# 23. Error Foundation

Implement stable internal/application errors.

Example:

```text
ITEM_UNAVAILABLE

VERSION_CONFLICT

FORBIDDEN

IDEMPOTENCY_KEY_REUSED
```

HTTP mapping remains API layer responsibility.

---

# 24. Logging Foundation

Every request/job should support:

```text
request_id

correlation_id

organization

actor

operation
```

while avoiding PII leakage.

---

# 25. Phase 1 Exit Gate

```text
✓ All four apps boot

✓ shared packages compile

✓ architectural imports enforced

✓ CI passes

✓ PostgreSQL development environment boots

✓ tests run locally and CI

✓ structured logging works

✓ environment validation works

✓ basic health endpoints exist
```

---

# 26. Phase 2 — Platform, Organization, IAM & Database Foundation

Implement the base platform required by every business module.

---

# 27. Initial PostgreSQL Schemas

Create:

```text
platform
iam
audit
integrations
```

and required extensions.

Other domain schemas may also be created empty.

---

# 28. Organization

Implement:

```text
Organization

Organization Settings foundation

Organization Context resolution
```

---

# 29. IAM

Implement:

```text
User

Membership

Capability definitions

Permission presets

Membership grants

Scopes

Sessions

MFA foundation

Recovery codes
```

---

# 30. Authentication

First supported actor:

```text
Internal Admin User
```

Customer Account auth is deferred.

---

# 31. Owner

Implement:

```text
Primary Owner

Owner protections

Ownership transfer foundation
```

---

# 32. Sessions

Server-managed secure session.

Must support:

```text
login

logout

expiration

revocation

membership disable

permission refresh
```

---

# 33. Capability Middleware

Every Admin application command/query gets:

```text
actor

organization

capability

scope
```

resolved server-side.

---

# 34. Audit Foundation

Implement:

```text
audit event

actor

organization

action

target

reason

before/after where appropriate
```

Append-oriented.

---

# 35. Idempotency Infrastructure

Implement:

```text
platform.idempotency_records
```

with:

```text
organization

actor/client

operation

key

request fingerprint

result reference

status
```

---

# 36. Outbox Foundation

Implement:

```text
platform.outbox_events
```

within business transaction support.

---

# 37. Durable Job Foundation

Implement:

```text
platform.jobs
```

with:

```text
queue

priority

payload_version

state

attempt

lease

schedule
```

---

# 38. Worker

Worker supports:

```text
claim

lease

retry

backoff

dead letter

graceful shutdown
```

---

# 39. Integrity Issue Foundation

Implement cross-domain:

```text
platform.integrity_issues
```

or equivalent agreed schema.

Required before high-risk transactional modules proliferate.

---

# 40. Admin Foundation UI

Create:

```text
Login

App shell

Sidebar

Header

Global permission-aware navigation

Error pages

Session UI
```

---

# 41. Phase 2 Exit Gate

```text
✓ Organization isolation tested

✓ cross-org DB FK tests pass

✓ login/logout works

✓ capability checks work

✓ scoped permissions work

✓ audit works

✓ idempotency infrastructure works

✓ outbox transaction test passes

✓ worker crash/retry test passes

✓ Integrity Issue creation works

✓ Admin shell is usable
```

---

# 42. Phase 3 — Catalog, Sizing & Media

This is the first meaningful business-information slice.

---

# 43. Catalog Implementation Order

```text
Product Types

Products

Options

Option Values

Variants

Categories

Collections

Tags

Occasions

Colors

Attributes

Product Information

FAQ
```

---

# 44. Catalog Requirements

Must preserve:

```text
generic Variant architecture

arbitrary options

SKU uniqueness

Product lifecycle

Category hierarchy

Collection separation

typed attributes
```

---

# 45. Sizing

Implement:

```text
Size Definitions

Measurement Definitions

Size Guides

Guide Revisions

Rows

Measurements

Product assignment
```

---

# 46. Media

Implement:

```text
Asset

Stored Object

Upload Session

Validation

Rendition

Product Media

Variant Media

Usage Projection
```

---

# 47. Media Upload Vertical Slice

```text
Admin uploads image
        ↓
Object stored
        ↓
Asset created
        ↓
Worker validates/processes
        ↓
Renditions generated
        ↓
Asset READY
        ↓
Assign to Product
```

---

# 48. Catalog Admin

Minimum complete UI:

```text
Product list

Product create

Product workspace

Variant editor

Category tree

Collection management

Sizing manager

Media library
```

---

# 49. Public Catalog Read Model

Implement Storefront read APIs for:

```text
Product

Category

Collection

Search foundation
```

before full Storefront UI.

---

# 50. Phase 3 Exit Gate

```text
✓ Product can be created

✓ arbitrary Variants supported

✓ color + size Product works

✓ Product can publish/unpublish

✓ category hierarchy works

✓ collection works

✓ Size Guide can publish

✓ media reusable

✓ variant-specific media works

✓ public Product DTO leaks no private data

✓ search foundation can find Product
```

---

# 51. Phase 4 — Warehouse & Inventory

No Order placement before Inventory authority exists.

---

# 52. Warehouse

Implement:

```text
Locations

Location capabilities

Receiving defaults

Fulfillment defaults

Return defaults
```

---

# 53. Inventory

Implement:

```text
Inventory Item

Inventory Condition

Inventory Level

Inventory Transaction

Inventory Movement

Reservation

Adjustment

Opening Balance
```

---

# 54. Inventory Quantities

Support canonical:

```text
On Hand

Sellable

Unavailable

Reserved

Available to Sell
```

---

# 55. Inventory Ledger First

Do not implement:

```text
variant.stock_quantity
```

as authority.

---

# 56. Reservation Engine

Implement:

```text
create

consume

release

expire

partial consume
```

with locking.

---

# 57. Inventory Admin

Minimum:

```text
Stock list

Inventory Item workspace

Adjustment

Warehouse workspace

Ledger
```

---

# 58. Concurrency Proof

Before Phase 4 exits:

```text
last unit race test
```

must pass repeatedly.

---

# 59. Phase 4 Exit Gate

```text
✓ Opening stock works

✓ Adjustment creates ledger

✓ reservations concurrency-safe

✓ ATS reconciles

✓ no oversell test passes

✓ condition changes work

✓ cross-location isolation works

✓ stock repair/rebuild mechanism tested

✓ Inventory Admin usable
```

---

# 60. Phase 5 — Customers, Pricing, Promotions & Cart

Now implement the commercial calculation side before Orders.

---

# 61. Customers

Implement:

```text
Customer

Phone

Email

Address

Address snapshot helpers

Customer resolution

Duplicate candidate foundation
```

---

# 62. Geography Foundation

Implement required V1 geography before Checkout:

```text
Country

Division

District

typed Areas

aliases

provider-independent Address resolution
```

Courier mappings can come later.

---

# 63. Pricing

Implement:

```text
Price records

Price List foundation

Price selection

Calculation Engine

Money Summary

Calculation Version
```

---

# 64. Promotion Engine

Implement:

```text
Promotion

Coupon

conditions

targets

benefits

discount allocation

stacking

usage eligibility
```

---

# 65. Promotion Usage

Cart evaluation is provisional.

Usage commit waits for Order transaction.

---

# 66. Cart

Implement:

```text
Guest Cart

Cart Lines

secure guest Cart access

Cart calculation

Cart warnings
```

No reservations.

---

# 67. Cart Storefront

Minimum:

```text
Add to Cart

Mini Cart

Cart Page

Quantity update

Remove

Coupon
```

---

# 68. Calculation Test Gate

Pricing + Promotion property tests must be strong before Orders begin.

---

# 69. Phase 5 Exit Gate

```text
✓ Customer can be resolved/created

✓ Address stored safely

✓ Price lookup deterministic

✓ discount allocation reconciles exactly

✓ coupon rules work

✓ usage eligibility race tests ready

✓ guest Cart survives refresh

✓ Cart holds no reservation

✓ stale price/cart recalculation works
```

---

# 70. Phase 6 — Orders + First Complete Checkout

This is the first truly major commerce milestone.

---

# 71. Order Core

Implement:

```text
Order

Order Line

Customer Snapshot

Address Snapshot

Pricing Snapshot

Order state

Cancellation foundation

Order source
```

---

# 72. `PlaceOrder`

This is a P0 command.

Transaction should coordinate:

```text
Checkout validation

Customer resolution

Pricing recalculation

Promotion evaluation

Promotion usage commit

Order creation

Inventory reservations

Payment Intent where needed

Outbox
```

---

# 73. `PlaceOrder` Requirements

Must be:

```text
idempotent

transactional

concurrency-safe

audited where relevant

version-aware

testable under response loss
```

---

# 74. First Payment Mode for Initial Slice

Use:

```text
COD
```

first.

Why:

```text
no external payment dependency

lets complete Order/Inventory flow prove itself
```

---

# 75. First End-to-End Production-Like Slice

```text
Product
   ↓
Variant
   ↓
Inventory
   ↓
Cart
   ↓
Pricing
   ↓
Checkout
   ↓
Customer
   ↓
Address
   ↓
COD
   ↓
PlaceOrder
   ↓
Reservation
   ↓
Order Admin
```

---

# 76. Minimal Storefront Required

Implement:

```text
Product page

Variant selection

Cart

Checkout

Address

COD

Order confirmation
```

before building elaborate Homepage merchandising.

---

# 77. Minimal Order Admin

Implement:

```text
Order list

Order Workspace

Customer summary

Pricing summary

Reservation status

Cancel
```

---

# 78. Phase 6 Exit Gate — Major Milestone

Must prove:

```text
✓ customer can place COD Order

✓ no duplicate Order on retry

✓ last-unit race safe

✓ coupon last-usage race safe

✓ historical price snapshot immutable

✓ Customer snapshot immutable

✓ cancellation releases eligible reservation

✓ Order Admin usable

✓ secure guest Order access works

✓ full E2E passes
```

At this point Maevelle has a real commerce core.

---

# 79. Phase 7 — Payments

Now add financial collection complexity.

---

# 80. Payment Model

Implement:

```text
Payment Intent

Payment Attempt

Payment Evidence

Payment

Payment Allocation

Refund foundation

Reversal foundation
```

---

# 81. Manual bKash

Implement:

```text
public instructions

Transaction ID submission

Payment Attempt

Admin verification

duplicate-reference detection

Payment confirmation
```

---

# 82. Manual Nagad

Use same Payment architecture.

No separate business model.

---

# 83. Payment Admin

Implement:

```text
Verification Queue

Payment Workspace

Evidence viewer

Verify

Reject

Allocation summary
```

---

# 84. Multiple/Partial Payments

Underlying data model supports them even if V1 UI simplifies common cases.

---

# 85. Payment Safety Gate

Must pass:

```text
duplicate reference

double verification

partial payment

overpayment

underpayment

Order cancelled before late Payment

Payment retry/idempotency
```

---

# 86. Phase 7 Exit Gate

```text
✓ COD Payment model supported

✓ bKash manual works end-to-end

✓ Nagad manual works end-to-end

✓ verification concurrency-safe

✓ duplicate Payment reference prevented

✓ Payment allocation reconciles

✓ customer sees pending vs confirmed correctly

✓ Admin queue works
```

---

# 87. Phase 8 — Fulfillment & Delivery

Now Orders become physically executable.

---

# 88. Fulfillment

Implement:

```text
Fulfillment

Fulfillment Lines

Fulfillment Inventory Allocations

Reservation consumption

Outbound Inventory movement
```

---

# 89. Fulfillment Inventory Bridge

Formalize the stress-test refinement:

```text
Fulfillment Line
       ↓
Fulfillment Inventory Allocation
       ↓
Reservation / Inventory movement
```

Do not leave consumption implicit.

---

# 90. Delivery Core

Implement first:

```text
Delivery

Delivery Lines

Package

Manual Courier Booking

Tracking events

Delivery attempt

Delivered

Failed
```

---

# 91. Manual Courier First

Before provider APIs:

```text
Admin records courier/tracking manually.
```

This verifies lifecycle without external uncertainty.

---

# 92. COD Delivery Link

Implement:

```text
COD Collection Instruction
```

separately from Payment.

---

# 93. Successful Delivery

Triggers:

```text
commercial completion
```

and later Costing COGS recognition once Costing exists.

Before Costing Phase:

store domain event/interface cleanly.

---

# 94. Delivery Admin

Implement:

```text
Delivery queue

Delivery Workspace

Tracking

Attempts

Manual status

COD summary

Exceptions
```

---

# 95. Provider Adapter Foundation

Then implement:

```text
CourierAdapter
```

and Integration Operation model.

---

# 96. First Courier Integration

Choose one provider after current capability/quality evaluation.

Do not implement both simultaneously unless doing so materially accelerates testing.

---

# 97. Second Courier

Implement after adapter is proven provider-neutral.

If adding provider requires core Delivery conditionals:

```text
provider abstraction is wrong.
```

---

# 98. Phase 8 Exit Gate

```text
✓ Fulfillment consumes reservation correctly

✓ stock deducted exactly once

✓ Delivery separate from Fulfillment

✓ manual courier flow works

✓ delivered/failed states work

✓ delivery attempts work

✓ COD instruction exists

✓ duplicate Delivery event safe

✓ first provider adapter proves core neutrality

✓ unknown booking outcome supported
```

---

# 99. Phase 9 — Procurement, Inbound Shipment & Receiving

Now automate full inventory acquisition.

---

# 100. Procurement

Implement:

```text
Supplier

Purchase

Purchase Lines

Purchase confirmation

Amendment

Supplier Invoice

Supplier Payment foundation
```

---

# 101. Inbound Shipment

Implement:

```text
Inbound Shipment

Shipment Item

Purchase Line Allocation

Packages

Journey foundation

Shipment Expenses

Exceptions
```

---

# 102. Canonical Receiving

Implement:

```text
Inbound Receipt

Inbound Receipt Line
```

Do not introduce:

```text
purchase_receipts
```

as competing physical authority.

---

# 103. Receiving

Posting coordinates:

```text
Shipment

Receipt

Inventory

future Cost Layer creation
```

---

# 104. Receiving Discrepancies

Must support:

```text
partial

over

under

damaged

unresolved item
```

from day one.

---

# 105. Supply Admin

Implement:

```text
Suppliers

Purchases

Inbound Shipments

Receiving Workspace
```

---

# 106. Phase 9 Exit Gate

```text
✓ Purchase confirmation works

✓ amendments preserve history

✓ multiple Purchases consolidate into Shipment

✓ Shipment split supported

✓ Inbound Receipt authoritative

✓ partial/over/under receiving works

✓ unresolved receiving works

✓ duplicate Receipt posting prevented

✓ received stock reaches Inventory correctly
```

---

# 107. Phase 10 — Landed Cost & Inventory Costing

Now complete acquisition economics.

---

# 108. Landed Cost

Implement:

```text
Worksheet

Revision

Cost Components

Scope

Allocation Targets

Allocation Methods

Estimated/Actual
```

---

# 109. Costing

Implement:

```text
Costing Policy

FIFO Cost Layer

Cost Layer Position

Cost Layer Adjustment

Outbound Cost Assignment

COGS Recognition

COGS Adjustment

COGS Reversal

Inventory Loss Cost
```

---

# 110. Receipt Integration

Posted Inbound Receipt creates:

```text
Inventory
+
Cost Layer
```

in one safe workflow.

---

# 111. Fulfillment Integration

Post Fulfillment coordinates:

```text
Inventory movement
+
FIFO Outbound Cost Assignment
```

---

# 112. Delivery Integration

Successful Delivery triggers:

```text
COGS Recognition
```

---

# 113. Late Landed Cost

Must correctly distribute adjustment across:

```text
On Hand

Transfer

Outbound Pending

Already Sold

Returned
```

---

# 114. Costing Admin

Implement:

```text
Inventory Valuation

Cost Layers

Unvalued Inventory

Order Margin

Cost Integrity
```

permission-sensitive.

---

# 115. Phase 10 Exit Gate

```text
✓ FIFO proven

✓ transfer preserves FIFO age

✓ Fulfillment cost assignment exact

✓ Delivery recognizes COGS

✓ late cost adjustment works

✓ unvalued inventory explicit

✓ Inventory valuation reconciles

✓ Order Gross Margin trustworthy
```

---

# 116. Phase 11 — Returns, RTO & Refund Integration

Now reverse logistics becomes complete.

---

# 117. Return Core

Implement:

```text
Return Case

Return Lines

Authorization

Reverse Shipment

Return Receipt

Inspection

Disposition
```

---

# 118. RTO

Delivery failure can create:

```text
RTO Return Case
```

idempotently.

---

# 119. Return Receipt

Only posted Return Receipt physically restores Inventory.

---

# 120. Cost Restoration

Return uses original:

```text
Outbound Cost Assignment
```

where available.

---

# 121. Refund Integration

Return may request Refund, but:

```text
Return ≠ Refund
```

must remain visible in code and UI.

---

# 122. Exchange

Implement foundation as:

```text
Return
+
Replacement Order
```

not original Order mutation.

---

# 123. Return Admin

Implement:

```text
Returns queue

RTO queue

Return Workspace

Receiving

Inspection

Disposition

Refund relationship
```

---

# 124. Phase 11 Exit Gate

```text
✓ Customer Return works

✓ RTO works

✓ Return request does not restock

✓ courier RTO status does not restock

✓ physical Return Receipt restores stock

✓ inspection split works

✓ COGS reversal correct

✓ Refund without Return supported

✓ Return without Refund supported

✓ duplicate return restoration impossible
```

---

# 125. Phase 12 — Finance Operations

Now operational cash tracking can consume mature transactional facts.

---

# 126. Finance

Implement:

```text
Financial Account

Expense Category

Expense

Expense Payment

Finance Transaction

Financial Account Entry

Internal Transfer

Reconciliation foundation
```

---

# 127. Integrate Existing Sources

Reference:

```text
Supplier Payment

Courier Charge

Payment Settlement

Refund

Shipment Expense
```

without duplicating business truth.

---

# 128. Opening Balance

Use explicit ledger transaction.

No editable:

```text
account.current_balance = ...
```

authority.

---

# 129. Finance Admin

Implement:

```text
Finance Overview

Expenses

Financial Accounts

Cash Movements

Transfers
```

---

# 130. Phase 12 Exit Gate

```text
✓ account balance ledger-derived

✓ expense ≠ payment

✓ transfer ≠ expense

✓ refunds not counted as operating expense

✓ courier fee not double counted

✓ source relationships traceable

✓ Finance reconciliation works
```

---

# 131. Phase 13 — Reviews & Customer Trust

Implement only after Orders exist because Verified Purchase depends on Order truth.

---

# 132. Reviews

Implement:

```text
Review

Revision

Moderation

Media

Merchant Response

Rating Summary
```

---

# 133. Review Submission

Secure guest Review access linked to eligible purchase.

---

# 134. Moderation

Negative sentiment cannot itself justify rejection.

---

# 135. Phase 13 Exit Gate

```text
✓ verified purchase derived

✓ customer cannot spoof verification

✓ revision workflow works

✓ rating summary rebuildable

✓ review images private until safe

✓ Product structured rating truth matches public Reviews
```

---

# 136. Phase 14 — Notifications & Integrations Hardening

Some infrastructure already exists earlier.

Now expose full domain behavior.

---

# 137. Notifications

Implement:

```text
Notification Type

Notification

Policy

Template

Delivery Attempt

Preference
```

---

# 138. Initial Channels

```text
IN_APP

EMAIL
```

---

# 139. Notifications UI

Implement:

```text
Admin Notification Inbox

Preferences
```

---

# 140. Integration Hardening

Add:

```text
Webhook Subscription

Webhook Event

Delivery Attempt

External Mapping

Provider Reconciliation

Integration Health
```

---

# 141. Phase 14 Exit Gate

```text
✓ notification failure cannot rollback truth

✓ required notifications bypass optional preference correctly

✓ webhook signatures work

✓ retry/dedup works

✓ provider raw status preserved

✓ Admin integration health visible
```

---

# 142. Phase 15 — Analytics & Reporting

Do this after authoritative transactional facts are mature.

---

# 143. Metric Catalog

Implement metric definitions first.

Do not begin with dashboard SQL.

---

# 144. Analytics Projections

Initial:

```text
Sales Facts

Order Facts

Customer Facts

Inventory Snapshots

Delivery Facts

Return Facts

Payment Facts

Cost/Margin Facts
```

---

# 145. Dashboards

Build:

```text
Overview

Sales

Products

Customers

Inventory

Delivery & Returns

Finance
```

---

# 146. Financial Metric Rule

Do not expose:

```text
Profit
```

until definition has complete authoritative inputs.

---

# 147. Phase 15 Exit Gate

```text
✓ metric definitions versioned

✓ projections rebuildable

✓ Gross Sales/Net Sales/Cash distinguishable

✓ refunds time attribution explicit

✓ Gross Margin uses Costing

✓ currency/timezone rules tested

✓ drill-down works
```

---

# 148. Phase 16 — Full Admin Operations

Admin basics were built progressively.

Now implement the complete Information Architecture.

---

# 149. Admin Completion Areas

```text
Dashboard

Attention Center

Global Search

Saved Views

Operations Health

Integrity Center

Settings

Team & Access

Import/Export

Cross-domain timelines
```

---

# 150. Attention Center

Aggregate actionable queues from:

```text
Payments

Delivery

Returns

Inventory

Supply

Integrations

Integrity
```

---

# 151. Global Search

Implement permission-aware cross-domain search.

---

# 152. Import Framework

Implement:

```text
Upload

Validate

Preview

Confirm

Async process

Results
```

never direct spreadsheet-to-table mutation.

---

# 153. Phase 16 Exit Gate

```text
✓ core business can be operated without DB/manual scripts

✓ attention queues complete

✓ repair workflows exist for expected incidents

✓ search permission-safe

✓ saved views work

✓ settings impact semantics visible

✓ Admin responsive operational workflows usable
```

---

# 154. Phase 17 — Full Storefront, SEO & Merchandising

The Storefront commerce core already exists.

Now complete the customer product experience.

---

# 155. Implement

```text
Homepage

Navigation

Search UX

Category

Collection

Filters

Sort

Review UX

Tracking

Static policy pages

Typed Homepage sections

SEO

Sitemap

Redirects

Structured Data
```

---

# 156. Performance Hardening

At this stage optimize:

```text
images

client JS

PDP orchestration

category/search

Checkout
```

using actual performance measurements.

---

# 157. Phase 17 Exit Gate

```text
✓ mobile commerce polished

✓ search useful

✓ filters context-aware

✓ SEO metadata valid

✓ structured Product data matches public truth

✓ redirects work

✓ accessibility critical flows pass

✓ Core Web performance monitored
```

---

# 158. Phase 18 — Security, Performance & Operations Hardening

Now attack the whole system before launch.

---

# 159. Security

Run:

```text
authorization matrix

cross-org tests

upload attacks

XSS

CSRF

SSRF

session revocation

secret scan

dependency scan

rate-limit tests

webhook attacks
```

---

# 160. Performance

Run:

```text
Checkout load

PlaceOrder race/load

Order list

Search

Inventory

provider callback storm

worker backlog

large imports
```

---

# 161. Failure Injection

Test:

```text
DB restart

worker crash

provider outage

object storage outage

email outage

search failure

analytics failure

disk pressure
```

---

# 162. Recovery

Perform:

```text
database restore drill

projection rebuild

provider reconciliation

deployment rollback

migration recovery exercise
```

---

# 163. Phase 18 Exit Gate

All P0/P1 quality requirements pass.

No known launch blocker from Testing Master Plan.

---

# 164. Phase 19 — Staging, UAT & Launch Readiness

Staging must resemble production closely enough to prove deployment.

---

# 165. Staging Requirements

```text
same application images

same PostgreSQL major version

same reverse proxy model

same worker architecture

same object-storage contract

production-like configuration
```

but separate credentials/data.

---

# 166. Seed Business Setup

Configure realistic Maevelle data:

```text
Organization

Owner

Warehouses

Payment methods

Delivery method

Courier integrations

Products

Categories

Inventory

Promotions

Settings
```

---

# 167. Full Acceptance Flows

Must complete:

### COD commerce

```text
Product
→ Checkout
→ Order
→ Fulfillment
→ Delivery
→ Delivered
→ COGS
```

### Manual bKash

```text
Order
→ Payment Attempt
→ Verification
→ Fulfillment
```

### Procurement

```text
Purchase
→ Shipment
→ Receipt
→ Inventory
→ Landed Cost
```

### RTO

```text
Delivery Failed
→ RTO
→ Return Receipt
→ Restock
```

### Customer Return

```text
Delivered
→ Return
→ Inspection
→ Refund
→ COGS reversal
```

---

# 168. UAT

Real business operator should test:

```text
creating Products

processing Orders

verification

warehouse work

Purchases

receiving

returns

expenses

reports
```

not only developers.

---

# 169. Launch Data Verification

Before launch:

```text
Products valid

Prices valid

Inventory valid

Payment account details correct

Courier mappings correct

Return policy correct

Delivery pricing correct

Owner access correct

Backup healthy
```

---

# 170. Phase 19 Exit Gate — Launch Readiness

Mandatory:

```text
✓ P0/P1 tests pass

✓ full staging E2E pass

✓ security checklist pass

✓ restore drill pass

✓ backups active

✓ rollback procedure tested

✓ provider integrations tested

✓ operator UAT signed off

✓ emergency controls work

✓ monitoring/alerts work

✓ integrity dashboard clean or understood

✓ launch data verified
```

---

# 171. Phase 20 — Production Launch

Production launch should be controlled.

---

# 172. Launch Sequence

Recommended:

```text
1. Deploy infrastructure

2. Initialize PostgreSQL

3. Run migrations

4. Load Geography/reference data

5. Create Organization

6. Configure IAM/Owner

7. Configure Settings

8. Configure Warehouse

9. Configure Payments

10. Configure Delivery

11. Configure integrations

12. Import/Create Catalog

13. Load opening Inventory

14. Verify balances

15. Enable Storefront browsing

16. Enable Checkout

17. Monitor closely
```

---

# 173. Opening Inventory

Must enter through canonical:

```text
Opening Inventory
+
Cost basis
```

not direct quantity updates.

---

# 174. Opening Financial Accounts

Must use:

```text
Opening Balance Transaction
```

not editable account balance.

---

# 175. Production Smoke

Immediately verify:

```text
Storefront

PDP

Cart

Checkout

Admin

worker

database

object storage

payment configuration

delivery configuration
```

without causing unintended real-world provider effects.

---

# 176. Launch Monitoring Window

Closely watch:

```text
Checkout errors

PlaceOrder failures

Inventory conflicts

Payment verification

provider booking

worker queues

database

disk

error tracking
```

during early usage.

---

# 177. Feature Flags / Release Controls

Use selectively for risky new capabilities.

Possible:

```text
customer_returns_enabled

auto_courier_booking_enabled

provider_x_enabled

promotion_type_x_enabled

review_submission_enabled
```

---

# 178. Feature Flag Rule

Feature Flags are not Settings.

They control rollout/availability.

They must not become permanent business-rule storage.

---

# 179. Kill Switch vs Feature Flag

### Feature Flag

```text
controlled rollout.
```

### Kill Switch

```text
emergency containment.
```

Separate concepts.

---

# 180. Implementation Slice Definition

Every vertical slice should include:

```text
Schema

Migration

Domain

Application Command/Query

Authorization

API

Admin/Storefront UX if relevant

Unit Tests

Integration Tests

Concurrency/Idempotency if applicable

Audit

Events/Outbox

Observability

Documentation
```

---

# 181. A Slice Is Not Complete Without Error Paths

Example `VerifyPayment` must include:

```text
success

already verified

duplicate reference

wrong organization

missing permission

concurrent verifier

stale state
```

not only success.

---

# 182. Definition of Ready

A coding task is Ready when:

```text
domain behavior is documented

dependencies exist

command/query defined

expected state transitions understood

authorization understood

failure behavior understood

tests can be described.
```

---

# 183. Definition of Done — Domain Feature

```text
✓ invariants implemented

✓ unit tests

✓ application tests

✓ DB constraints

✓ transaction tests

✓ authorization tests

✓ API contract

✓ audit

✓ observability

✓ documentation updated
```

---

# 184. Definition of Done — UI Feature

```text
✓ loading

✓ empty

✓ success

✓ validation

✓ failure

✓ unauthorized

✓ stale-data/concurrency state where relevant

✓ keyboard/accessibility

✓ responsive behavior where required
```

---

# 185. Definition of Done — External Integration

```text
✓ happy path

✓ rejection

✓ timeout

✓ UNKNOWN outcome

✓ reconciliation

✓ duplicate callback

✓ out-of-order callback

✓ auth failure

✓ provider outage

✓ manual fallback

✓ monitoring
```

---

# 186. No "Temporary Direct DB Logic"

Forbidden implementation shortcuts:

```text
We'll directly update stock for now.

We'll make Payment status a column for now.

We'll store Pathao area ID directly on Customer address for now.

We'll calculate margin from latest Purchase cost for now.
```

These temporary shortcuts often become production architecture.

---

# 187. Database Migration Policy

Each module owns migrations for its schema.

Migrations are:

```text
reviewed

version-controlled

tested

deployment-aware
```

---

# 188. Database Constraints Are Required

Do not rely only on TypeScript validation for:

```text
tenant integrity

critical uniqueness

non-null business relationships

single-active structures

idempotency
```

where PostgreSQL can enforce safely.

---

# 189. Schema Freeze Philosophy

We do not need a permanent schema freeze.

But before a phase begins:

```text
core schema for that phase
```

must be reviewed.

Changes remain possible through migrations.

---

# 190. PostgreSQL Specification Strategy

`docs/implementation/postgresql-schema-specification.md` should organize tables by phase:

```text
Stage 1 Platform / IAM

Stage 2 Catalog / Sizing / Media

Stage 3 Warehouse / Inventory

Stage 4 Customers / Pricing / Cart

Stage 5 Orders

Stage 6 Payments

Stage 7 Fulfillment / Delivery

Stage 8 Procurement / Shipment

Stage 9 Landed Cost / Costing

Stage 10 Returns

Stage 11 Finance

Stage 12 Reviews / Notifications

Stage 13 Analytics / Projections
```

---

# 191. PostgreSQL Specification Requirements

For every table:

```text
exact columns

types

nullability

PK

FK

tenant-safe FK

unique constraints

check constraints

indexes

lifecycle/deletion rule

concurrency/versioning

ownership domain
```

---

# 192. Every Critical Table Also Needs

```text
expected write paths

expected read patterns

locking behavior

idempotency relation

audit requirement

high-volume risk
```

---

# 193. API Implementation Order

Do not generate hundreds of CRUD endpoints.

Implement semantic endpoints as phases need them.

Example:

```text
POST /orders/{id}/cancel
```

before generic:

```text
PATCH /orders/{id}
```

for lifecycle mutation.

---

# 194. Query Endpoints

Purpose-built Admin queries are encouraged.

Example:

```text
GET /admin/orders/{id}/workspace
```

can return orchestrated read data.

It should not bypass domain ownership for writes.

---

# 195. Storefront BFF

Next.js Storefront may have web-specific orchestration.

It must call API/application contracts.

No direct PostgreSQL access.

---

# 196. Admin BFF

Same rule.

---

# 197. Background Job Implementation Order

Initial queues:

```text
outbox

media

notifications

integrations

analytics

imports

exports

reconciliation
```

Add queue isolation according to actual operational priority.

---

# 198. Search Implementation Order

Start:

```text
PostgreSQL
```

through `CatalogSearchPort`.

Do not adopt external search engine before evidence.

---

# 199. Cache Implementation Order

Start without Redis if PostgreSQL/application performance is sufficient.

Introduce Redis only for explicit need.

---

# 200. Scaling Rule

Scale because metrics say so.

Not because:

```text
"big ecommerce companies use X."
```

---

# 201. First Scaling Steps

Likely:

```text
larger VPS

dedicated PostgreSQL

CDN/object storage improvements

multiple app instances

dedicated workers

Redis

search engine
```

before microservices.

---

# 202. Microservice Rule

No domain extraction simply because codebase is large.

Service extraction requires evidence such as:

```text
independent scaling

fault isolation

team ownership

deployment cadence

technology requirement
```

---

# 203. Implementation Priority Categories

### P0 — must work before selling

```text
Catalog

Inventory

Pricing

Customers

Cart

Orders

COD

Admin Order operations

Security

Backups
```

### P1 — required for normal business operation

```text
Manual bKash/Nagad

Fulfillment

Delivery

Courier integration

Procurement

Receiving

Returns/RTO

Landed Cost

Costing
```

### P2 — operational intelligence

```text
Finance

Reviews

Notifications

Analytics
```

### P3 — expansion

```text
Accounts

CMS

Marketing automation

WhatsApp

Telegram

advanced Delivery

advanced Analytics
```

---

# 204. Critical Path

The shortest path to a correct first commerce transaction is:

```text
Platform
 ↓
IAM
 ↓
Catalog
 ↓
Inventory
 ↓
Customer
 ↓
Pricing
 ↓
Cart
 ↓
Order
 ↓
COD
 ↓
Admin Processing
```

Nothing should delay this with:

```text
advanced analytics

customer accounts

AI

CMS

microservices.
```

---

# 205. But "Fast" Does Not Mean Tiny Architecture

The foundation remains:

```text
correct

extensible

auditable

transactional.
```

We simplify **scope**, not **integrity**.

---

# 206. Parallel Workstreams

After foundations stabilize, teams/AI agents can work in parallel.

Example:

### Stream A

```text
Catalog Admin
```

### Stream B

```text
Storefront Product UX
```

### Stream C

```text
Inventory
```

provided shared contracts are stable.

---

# 207. Parallel Work Rule

Agents must not concurrently modify the same architecture boundary without coordination.

---

# 208. Agent Task Contract

Every AI/developer task should state:

```text
Goal

Owning module

Source-of-truth docs

Allowed files

Dependencies

Required tests

Invariants

Non-goals

Exit criteria
```

---

# 209. Example Agent Task

```text
Task:
Implement Inventory Reservation creation.

Read:
inventory-architecture.md
database-data-model-architecture.md
testing-master-plan.md

Must prove:
- no oversell
- organization isolation
- idempotency where applicable
- concurrency safety

Do not:
- implement Order lifecycle
- modify Product availability rules
```

---

# 210. AI Agent Documentation Rule

An AI agent must not assume a business rule from nearby code if the architecture defines it elsewhere.

Read the relevant source-of-truth document first.

---

# 211. Skills.sh Strategy During Implementation

Use skills where stage-specific benefit exists.

Recommended:

### PostgreSQL specification/review

```text
postgresql-table-design
postgresql-code-review
sql-optimization
```

### React / Next.js

```text
vercel-react-best-practices
vercel-composition-patterns
web-design-guidelines
```

### APIs

```text
api-and-interface-design
```

### Testing

```text
test-driven-development
```

### Security

Use appropriate SAST/security skill during hardening.

---

# 212. Skills Rule

Do not apply every skill to every task.

Use the smallest relevant set.

---

# 213. Documentation During Implementation

Every implementation-changing discovery must update:

```text
Architecture doc

ADR

Schema specification

API contract

Implementation roadmap
```

where applicable.

---

# 214. Generated Documentation

Public developer/customer docs should be generated separately later.

Do not turn private internal docs into public documentation accidentally.

---

# 215. Version Control Strategy

Prefer small reviewable commits.

Example:

```text
feat(inventory): add reservation domain

feat(inventory): persist reservations

test(inventory): add concurrent final-unit test
```

Exact commit policy can vary.

---

# 216. Pull Request Requirements

Each PR should state:

```text
What changed

Why

Architecture documents followed

Invariants affected

Tests

Migration impact

Operational impact
```

---

# 217. High-Risk PR Flag

Mark PR high-risk if it touches:

```text
Payments

Refunds

Inventory ledger

Costing

Authorization

tenant relationships

migrations

provider idempotency
```

requiring stronger review.

---

# 218. Database Review Requirement

Any migration affecting:

```text
money

tenant FK

inventory quantity

payment

Cost Layer

Order snapshot
```

gets explicit DB review.

---

# 219. Security Review Requirement

Features adding:

```text
new public endpoint

authentication

permissions

upload

webhook

external URL

secret

PII export
```

require security review.

---

# 220. Launch Blocker Classes

Production launch is blocked by known:

```text
oversell defect

duplicate Payment risk

duplicate Refund risk

cross-org leak

unsafe provider timeout retry

inventory reconciliation failure

backup restore failure

sensitive media exposure

lost durable job/outbox

unsafe migration

broken credential revocation
```

---

# 221. Launch Readiness Scorecard

Use explicit categories:

```text
Commerce
Inventory
Payments
Delivery
Returns
Costing
Security
Performance
Operations
Recovery
Data
UX
```

Each:

```text
READY

CONDITIONAL

BLOCKED
```

No vague:

```text
"probably ready."
```

---

# 222. Technical Debt Classification

Technical debt should be recorded as:

```text
DEBT-P0 correctness risk

DEBT-P1 operational risk

DEBT-P2 maintainability

DEBT-P3 convenience
```

---

# 223. Not All Debt Blocks Launch

Examples:

```text
manual courier fallback
```

can be acceptable.

Example:

```text
Refund can duplicate after timeout
```

cannot.

---

# 224. Deferred Features Registry

Maintain:

```text
docs/implementation/deferred-features.md
```

Eventually.

Examples:

```text
Customer Accounts

Advanced CMS

WhatsApp

Telegram

Gift Cards

Store Credit

Loyalty

Advanced fulfillment

Multi-currency selling

Advanced warehouse costing

External search engine

Microservices
```

---

# 225. Deferred Does Not Mean Forgotten

Each item should retain:

```text
reason

dependencies

likely architecture impact
```

---

# 226. Architecture Protection Tests

Before large implementation begins, encode dependency rules so future developers cannot accidentally erode modular architecture.

---

# 227. First Real Milestone

### MILESTONE M1 — Commerce Core

Complete through Phase 6.

Maevelle can:

```text
publish Product

track Inventory

accept COD Order

prevent oversell

operate Order in Admin
```

---

# 228. M2 — Money & Fulfillment

Complete through Phase 8.

Maevelle can:

```text
take manual wallet Payments

fulfill

deliver

track courier lifecycle
```

---

# 229. M3 — Supply Chain

Complete through Phase 10.

Maevelle can:

```text
buy inventory

ship inbound

receive

calculate landed cost

calculate actual COGS/margin
```

---

# 230. M4 — Reverse Commerce

Complete Phase 11.

Maevelle can:

```text
RTO

return

inspect

restock

refund

reverse COGS
```

correctly.

---

# 231. M5 — Business Operating System

Complete through Phase 17.

Maevelle has:

```text
Finance

Reviews

Notifications

Analytics

full Admin

full Storefront
```

---

# 232. M6 — Production Ready

Complete Phase 18–19.

System has proven:

```text
security

performance

backup recovery

failure handling

operator readiness
```

---

# 233. Recommended Build Philosophy Per Milestone

For every milestone:

```text
Build
↓
Test
↓
Stress
↓
Operate in staging
↓
Fix leaks
↓
Only then continue
```

Do not accumulate six unfinished milestones simultaneously.

---

# 234. Project Completion Is Not Feature Count

A smaller set of:

```text
correct

integrated

recoverable

tested
```

features is more valuable than hundreds of partially implemented screens.

---

# 235. Implementation Roadmap Invariants

### IMP-INV-001

Implementation sequencing follows domain dependencies.

### IMP-INV-002

No Order placement ships before authoritative Inventory reservation exists.

### IMP-INV-003

No historical transactional data depends on mutable master data for reconstruction.

### IMP-INV-004

No external provider is integrated directly into core business logic.

### IMP-INV-005

No high-risk mutation is considered complete without concurrency/idempotency analysis where applicable.

### IMP-INV-006

Each vertical slice includes database, domain, API, tests and operational concerns.

### IMP-INV-007

Admin/Storefront never become direct database clients.

### IMP-INV-008

Core business APIs remain semantic command/query interfaces rather than database CRUD.

### IMP-INV-009

Implementation shortcuts cannot weaken established architecture without documented architecture change.

### IMP-INV-010

Provider automation follows a working provider-neutral lifecycle rather than defining the lifecycle.

### IMP-INV-011

Testing is implemented alongside behavior rather than postponed until project completion.

### IMP-INV-012

Database constraints reinforce critical relational invariants.

### IMP-INV-013

Critical provider operations always have reconciliation before production use.

### IMP-INV-014

Every production migration is versioned, tested and recovery-aware.

### IMP-INV-015

Production launch requires verified restore capability.

### IMP-INV-016

P0 correctness/security defects block release.

### IMP-INV-017

Implementation phases cannot be declared complete while their exit gate remains failing.

### IMP-INV-018

Derived projections never become hidden transactional authority.

### IMP-INV-019

Feature flags and emergency kill switches remain separate concepts.

### IMP-INV-020

Architecture remains a living source of truth throughout implementation.

---

# 236. First Action After This Roadmap

Do **not** immediately begin coding Products or Checkout.

The immediate next technical task is to close the blocking implementation decisions.

Recommended next artifact:

```text
docs/adr/
```

with the **Blocking Technical ADR Pack**.

It should decide:

```text
Backend HTTP Framework

PostgreSQL ORM / Query Builder

Authentication / Session implementation

Object Storage

Job/Worker implementation

Reverse Proxy

Search implementation

Observability

Deployment pipeline
```

---

# 237. Why ADRs Before PostgreSQL DDL?

Some decisions directly affect how schema/application code will be expressed.

For example:

```text
ORM/query builder
→ migration conventions
→ transaction APIs
→ locking implementation
→ type generation
```

We should not create 100+ production tables before knowing whether the chosen DB layer can represent:

```text
composite tenant FKs

partial indexes

NUMERIC precision

row locking

SKIP LOCKED

deferrable/advanced constraints

explicit transactions

raw SQL
```

correctly.

---

# 238. Then PostgreSQL Specification

After the blocking ADR pack:

```text
docs/implementation/postgresql-schema-specification.md
```

becomes the next major implementation artifact.

That document should finally specify exact:

```text
CREATE TABLE architecture

columns

types

constraints

indexes

FKs

locking rules

uniqueness

migration order
```

for the architecture we have designed.

---

# 239. Immediate Execution Sequence

Therefore:

```text
IMPLEMENTATION ROADMAP
        ↓
BLOCKING TECHNICAL ADR PACK
        ↓
POSTGRESQL SCHEMA SPECIFICATION
        ↓
REPOSITORY BOOTSTRAP
        ↓
INITIAL MIGRATIONS
        ↓
PLATFORM + IAM
        ↓
FIRST VERTICAL SLICE
```

Repository bootstrap can begin alongside the tail end of schema specification once the blocking ADRs are settled, but **production domain migrations should not precede the schema specification review**.

---

# 240. Final Architecture-to-Code Transition

We have now reached:

```text
IDEA
 ↓
REQUIREMENTS
 ↓
DOMAIN ARCHITECTURE
 ↓
SYSTEM ARCHITECTURE
 ↓
DATABASE MODEL
 ↓
API CONTRACTS
 ↓
SECURITY
 ↓
FAILURE MODEL
 ↓
ADMIN UX
 ↓
STOREFRONT UX
 ↓
TEST STRATEGY
 ↓
OPERATIONS
 ↓
IMPLEMENTATION ROADMAP
 ↓
────────────────────────────
        ENGINEERING
────────────────────────────
 ↓
ADRs
 ↓
SCHEMA
 ↓
REPOSITORY
 ↓
MIGRATIONS
 ↓
APPLICATION
 ↓
PRODUCTION
```

From this point forward, architecture work should increasingly be triggered by **actual implementation evidence**, not endless speculative expansion.

---

**End of Maevelle Implementation Roadmap v0.1**
