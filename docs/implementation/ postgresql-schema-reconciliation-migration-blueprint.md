# Maevelle — PostgreSQL Schema Reconciliation & Migration Blueprint

## Master Instructions

**Stage:** Architecture → Physical Database Implementation
**Importance:** Critical / P0 Architecture Work
**Primary Existing Document:**
`docs/architecture/postgresql-schema-specification.md`

**New Implementation Document:**
`docs/implementation/postgresql-schema-reconciliation-migration-blueprint.md`

---

# 1. Primary Objective

Perform a **complete, adversarial reconciliation** of the existing PostgreSQL schema specification against the entire finalized Maevelle architecture.

The goal is not merely to:

```text
add a few missing tables.
```

The goal is to prove that the relational model can correctly support:

```text
Catalog
Sizing
Media
Geography

Warehouse
Inventory

Customers

Pricing
Promotions
Cart / Checkout

Orders
Payments

Fulfillment
Delivery

Procurement
Inbound Shipment
Receiving

Landed Cost
Inventory Costing / COGS

Returns
RTO
Exchange

Finance

Reviews

Notifications

Integrations

Analytics

IAM
Security
Audit

Jobs
Outbox
Idempotency
Integrity
```

without contradictions, duplicate authorities, missing links, or unsafe concurrency behavior.

---

# 2. Do NOT Create a Second Competing Schema Specification

The existing file:

```text
docs/architecture/postgresql-schema-specification.md
```

remains the canonical PostgreSQL architecture document.

Do not create:

```text
docs/implementation/postgresql-schema-specification.md
```

as another competing source of truth.

Instead:

```text
existing schema specification
v0.1
   ↓
reconcile
   ↓
v0.2
```

---

# 3. Preserve History

Do not erase useful architecture simply because some parts need changing.

Use normal version-control history to preserve v0.1.

Inside the document:

```text
Version: 0.2
```

and add a concise revision note explaining that v0.2 reconciles:

```text
Pricing
Costing/COGS
Returns/RTO
Delivery
Geography
Technical ADRs
```

with the earlier schema.

---

# 4. Two Required Outputs

## Output A — Canonical Schema v0.2

Update:

```text
docs/architecture/postgresql-schema-specification.md
```

This document answers:

> **What does the final logical/physical PostgreSQL model look like?**

It contains:

```text
schemas

tables

columns

types

PKs

FKs

unique constraints

checks

indexes

ownership

ledger rules

lifecycle rules

locking assumptions

relationships
```

---

## Output B — Migration Blueprint

Create:

```text
docs/implementation/postgresql-schema-reconciliation-migration-blueprint.md
```

This document answers:

> **How do we safely build that schema from an empty PostgreSQL database in implementation order?**

It contains:

```text
migration stages

dependency order

extensions

bootstrap

table creation sequence

index timing

constraint timing

seed/reference data

backfills

migration verification

rollback/recovery considerations

phase ownership
```

---

# 5. Read Architecture Before Editing Schema

The database model must be derived from architecture.

Never reverse this:

```text
database table
→ invent business behavior
```

Correct:

```text
business invariant
→ relational enforcement
```

---

# 6. Reconcile Every Domain

For every domain ask:

```text
What is authoritative?

What is historical?

What is mutable?

What is append-only?

What is projection?

What references another domain?

What may be deleted?

What must never be deleted?

What requires organization isolation?

What can race?

What requires idempotency?

What requires DB enforcement?

What requires audit?
```

---

# 7. Produce a Domain-to-Schema Coverage Matrix

Before modifying individual tables, create a reconciliation matrix.

Example:

| Domain    | Existing coverage | Missing                         | Incorrect          | Requires change |
| --------- | ----------------- | ------------------------------- | ------------------ | --------------- |
| Catalog   | Strong            | Minor                           | —                  | Yes             |
| Pricing   | Partial           | Price lists/calculation support | Maybe              | Yes             |
| Costing   | Partial           | Final FIFO relationships        | Unresolved earlier | Major           |
| Delivery  | Missing/partial   | Delivery domain                 | —                  | Major           |
| Geography | Missing           | Complete domain                 | —                  | Major           |
| Returns   | Partial           | RTO/inspection/cost links       | —                  | Major           |

Do this for **every domain**.

---

# 8. Classify Every Existing Table

Every table should be marked conceptually as:

```text
AUTHORITATIVE MASTER

AUTHORITATIVE TRANSACTION

APPEND-ONLY LEDGER

HISTORICAL SNAPSHOT

RELATIONSHIP

CONFIGURATION

PROJECTION

INTEGRATION STATE

OPERATIONAL INFRASTRUCTURE
```

This makes accidental authority duplication easier to detect.

---

# 9. No Duplicate Business Authority

Search aggressively for situations where two tables could both claim the same truth.

Examples to prevent:

```text
inventory stock
AND
variant.stock_quantity
```

```text
Inbound Receipt
AND
Purchase Receipt
```

```text
Payment amount
AND
Settlement net amount
```

```text
Delivery status
AND
Courier Booking status
```

```text
Customer current address
AND
Order committed address
```

```text
Cost Layer
AND
Variant current landed cost
```

One concept should have one clear authority.

---

# 10. PostgreSQL Baseline

Adopt:

```text
PostgreSQL 18+
```

as implementation baseline.

Use native:

```sql
uuidv7()
```

for appropriate UUID identifiers.

Do not retain an old schema assumption that requires UUIDv7 generation elsewhere unless explicitly justified.

---

# 11. Required PostgreSQL Extensions

Review and explicitly declare required extensions.

Expected:

```text
pg_trgm
pg_stat_statements
```

Do not introduce extensions casually.

Every extension needs:

```text
reason

environment support

operational impact
```

---

# 12. Logical Schemas

Re-evaluate the earlier logical schemas.

Expected canonical areas include:

```text
platform
iam
audit

catalog
sizing
media
geography

warehouse
inventory

customers

pricing
promotions

orders
payments

delivery

procurement
shipment
landed_cost
costing

returns

finance

reviews

notifications

integrations

search
analytics
```

Do not keep something in an unrelated schema simply because v0.1 placed it there.

---

# 13. Organization Isolation

Every organization-owned entity must clearly define:

```text
organization_id
```

where applicable.

High-risk relationships should use tenant-safe relational enforcement.

Preferred pattern where justified:

```text
UNIQUE (organization_id, id)
```

and child FK:

```text
FOREIGN KEY (organization_id, parent_id)
REFERENCES parent (organization_id, id)
```

This prevents cross-organization references at the database layer.

---

# 14. Determine Which Tables Are Global

Not everything should be duplicated per organization.

Potential global/reference data:

```text
countries

official geography

capability definitions

system-level area types

currency definitions if stored
```

Organization-specific entities should remain tenant-owned.

Explicitly document scope.

---

# 15. Common Mutable Entity Columns

Review the standard:

```text
id

organization_id where applicable

created_at

updated_at

version
```

Use optimistic concurrency `version` only where meaningful.

Do not mechanically put it on immutable ledger rows.

---

# 16. Immutable / Append-Oriented Rows

Examples:

```text
inventory transactions

cost adjustments

audit events

outbox events

payment events/history

provider inbound events
```

should not pretend to support normal CRUD editing.

Corrections use compensation.

---

# 17. Money Type Policy

Finalize and apply consistently.

Initial decision:

### Committed money

```sql
numeric(20,4)
```

### High-precision unit cost

```sql
numeric(24,8)
```

### FX

```sql
numeric(24,12)
```

Never use:

```text
float

real

double precision
```

for money.

---

# 18. Quantity Policy

Use:

```sql
numeric(20,6)
```

where generic inventory quantity requires future fractional support.

Where quantity is structurally integer-only, evaluate whether:

```text
integer/bigint
```

is better.

Do not blindly use one type everywhere.

---

# 19. Percentage / Rate Policy

Use controlled exact numeric precision.

Expected:

```sql
numeric(18,8)
```

unless a specific use case requires another precision.

---

# 20. Currency

Money-bearing records must preserve:

```text
amount
currency_code
```

unless currency is unquestionably inherited from an immutable same-currency parent.

Do not silently assume BDT at table level throughout architecture.

---

# 21. Time

Use:

```sql
timestamptz
```

for absolute events.

Use:

```sql
date
```

for true date-only concepts.

Do not use:

```text
timestamp without timezone
```

for business event instants without deliberate reason.

---

# 22. Status Modeling

Continue the established approach:

```text
text/varchar
+
CHECK
```

where useful.

Do not create PostgreSQL ENUMs everywhere if state evolution would make migrations unnecessarily rigid.

But every lifecycle status must still be constrained.

---

# 23. Foreign-Key Delete Behavior

For every FK explicitly decide:

```text
RESTRICT

CASCADE

SET NULL
```

Do not leave deletion semantics implicit.

For transactional history, default toward:

```text
RESTRICT
```

or stable historical reference.

---

# 24. Archive vs Delete

Master entities such as:

```text
Product

Supplier

Customer Address

Location
```

often require:

```text
archive/deactivate
```

rather than delete.

Transactional entities generally must not be deleted during normal business operation.

Document this.

---

# 25. Pricing Reconciliation

Pricing was not fully formalized when v0.1 was first conceived.

Ensure schema supports:

```text
Price List

Variant Price

Currency

effective dates if applicable

compare-at/list price

channel foundation

price history/revisions where required
```

Do not let:

```text
catalog.variant.price
```

become permanent authority if Pricing owns selling prices.

---

# 26. Order Calculation Snapshot

Ensure committed Order preserves enough data to reconstruct:

```text
merchandise gross

product discounts

order discounts

delivery gross

delivery discounts

tax

grand total

paid

refunded

balance
```

without asking current Pricing/Promotion configuration.

---

# 27. Calculation Version

Ensure Checkout/Order captures:

```text
calculation_version
```

or equivalent pricing-engine version/provenance.

---

# 28. Manual Price Override

If supported:

```text
manual override
```

must have explicit schema/provenance.

Do not encode it as fake Promotion.

---

# 29. Promotions Reconciliation

Verify:

```text
Promotion

Promotion Revision

Rules

Coupon Codes

Usage

Order applications

Order allocations
```

have correct relationships.

Promotion historical truth must survive Promotion edits.

---

# 30. Inventory Reconciliation

Verify authoritative path:

```text
Inventory Item
→ Inventory Transaction
→ Movement Lines
```

with current:

```text
Inventory Level
```

as materialized operational representation where designed.

Ensure:

```text
Reservations
```

are separate from physical stock.

---

# 31. Inventory Conditions

Finalize whether:

```text
SELLABLE
DAMAGED
QUARANTINE
INSPECTION
```

are:

```text
materialized columns/balances
```

or derived from transaction positions.

Resolve the earlier ADR question.

---

# 32. Reservation Allocation

Ensure reservation tracks:

```text
Order
Order Line
Inventory Item
Location
Quantity
```

appropriately.

---

# 33. Fulfillment Inventory Allocation

Stress test required this explicit bridge.

Ensure:

```text
Fulfillment Line
→ Fulfillment Inventory Allocation
→ Reservation / Inventory movement
```

exists.

---

# 34. Procurement Canonical Receipt Path

Preserve:

```text
Purchase Line
→ Shipment Allocation
→ Inbound Shipment Item
→ Inbound Receipt Line
→ Inventory Transaction
```

Do not introduce competing physical receipt authority.

---

# 35. Inbound Receipt

One Receipt:

```text
belongs to one Inbound Shipment
belongs to one receiving Location
```

and may contain items originating from multiple Purchases/Suppliers through Shipment Items.

Multiple Receipts per Shipment must work.

---

# 36. Unresolved Receiving

Ensure actual physical goods can be received before perfect catalog identification.

Represent:

```text
unresolved received quantity
```

safely.

It must not become sellable Inventory prematurely.

---

# 37. Landed Cost

Reconcile:

```text
Worksheet

Revision

Cost Component

Cost Type

Scope

Target

Allocation
```

Final allocations should preserve acquisition context.

---

# 38. Costing / COGS

This is a major reconciliation area.

Ensure concrete support for:

```text
Acquisition Cost Layer

Cost Layer Position

Cost Layer Adjustment

Outbound Cost Assignment

COGS Recognition

COGS Adjustment

COGS Reversal

Inventory Loss Cost
```

---

# 39. FIFO Decision

Implementation architecture now requires FIFO V1 unless a later ADR changes it.

Design tables so FIFO ordering can be deterministic.

Likely ordering inputs:

```text
available_at / acquired_at

receipt ordering

stable ID tie-breaker
```

Specify exact deterministic rule.

---

# 40. Cost Layer Provenance

A Cost Layer should trace to:

```text
Inbound Receipt Line

Shipment Item

Inventory Item

Quantity

Purchase unit cost

allocated landed cost

currency / FX provenance

cost status
```

where applicable.

---

# 41. Cost Layer Positions

Cost must survive:

```text
transfers

condition changes

pending outbound

returns
```

without creating fake new acquisition history.

---

# 42. Outbound Cost Assignment

Bridge:

```text
Fulfillment
→ Fulfillment Inventory Allocation
→ Cost Layer quantity
```

must be explicit.

---

# 43. COGS Recognition

COGS should reference the actual commercial trigger.

Likely:

```text
Delivery delivered event/outcome
```

plus Outbound Cost Assignment.

Do not calculate COGS directly from current Product cost.

---

# 44. Inventory Loss

Lost/destroyed goods use:

```text
Inventory Loss
```

cost treatment.

Not COGS.

---

# 45. Returns Domain

Ensure first-class:

```text
Return Case

Return Line

Return Authorization

Reverse Shipment

Return Receipt

Return Receipt Line

Inspection

Disposition
```

---

# 46. Return Reason vs Disposition

These are different.

Example:

```text
Reason:
Wrong size

Disposition:
Sellable
```

Do not combine them into one field.

---

# 47. Customer Return vs RTO

Return Case must support explicit type/source:

```text
CUSTOMER_RETURN

RTO

possibly future SUPPLIER_RETURN separately
```

Do not infer RTO solely from reason string.

---

# 48. Return Receipt Is Physical Truth

Neither:

```text
Return authorization

provider RTO status

Refund
```

may restore Inventory.

The schema should make:

```text
Return Receipt
```

the physical reverse-receipt authority.

---

# 49. Return Inspection

Support quantity split.

Example:

```text
10 received

7 sellable

2 damaged

1 quarantine
```

Do not require one disposition per receipt line.

---

# 50. Return Cost Restoration

Preserve relationship to original:

```text
Outbound Cost Assignment
```

where possible.

This is necessary for accurate FIFO/COGS reversal.

---

# 51. Exchange

Do not create an `exchange_order_mutation` model.

Exchange architecture:

```text
Return
+
Replacement Order
```

Schema only needs explicit linkage.

---

# 52. Delivery Domain

Add/reconcile:

```text
Delivery Method

Delivery

Delivery Line

Delivery Package

Delivery Package Line

Courier Booking

Delivery Event

Delivery Attempt

COD Collection Instruction

Provider Collection Observation

Provider Charge

Delivery Exception

Delivery Claim
```

---

# 53. Fulfillment vs Delivery

Do not collapse:

```text
Fulfillment
```

and:

```text
Delivery.
```

Their lifecycles differ.

---

# 54. Delivery vs Courier Booking

One Delivery may have:

```text
Booking 1 failed
Booking 2 succeeded
```

Therefore Booking must be separate.

---

# 55. Active Courier Booking Constraint

Design a partial unique index or equivalent so one Delivery cannot accidentally have multiple active physical courier bookings.

---

# 56. Delivery Event

Provider events are append-oriented.

Preserve:

```text
provider event ID

provider occurred_at

received_at

raw status

normalized type
```

where safe.

---

# 57. Delivery Attempts

Each actual handoff attempt is a separate record.

Do not encode only:

```text
attempt_count = 3
```

without history.

---

# 58. COD

Separate:

```text
COD Collection Instruction

Provider Collection Observation

Payment

Settlement
```

Never let one row stand for all four.

---

# 59. Geography Domain

Add/reconcile:

```text
Geographic Area

Area Alias

Area Source Reference

Dataset Version

Area Successor

Postal Area

Postal Link

Provider Area

Provider Area Mapping

Provider Geography Sync

Service Area

Service Area Member

Serviceability Rule

Serviceability Override
```

---

# 60. Geography Global vs Organization

Canonical Bangladesh administrative geography should generally be global.

Operational service areas/provider mappings are organization/integration-specific.

Model that explicitly.

---

# 61. Geography Hierarchy

Use typed nodes.

Do not build fixed table columns:

```text
division_id
district_id
upazila_id
union_id
```

as the entire hierarchy model.

Address snapshots may denormalize common ancestors.

---

# 62. Hierarchy Cycle Protection

Specify implementation.

Potential:

```text
application validation
+
recursive DB check/trigger where justified
```

or another robust strategy.

Document exact enforcement approach.

---

# 63. Geography Aliases

Support:

```text
Bangla

English

former name

common name

transliteration
```

without duplicate canonical nodes.

---

# 64. Provider Geography

Provider Area IDs belong to:

```text
Integration Account
```

scope.

They must not become canonical Address IDs.

---

# 65. Customers

Verify:

```text
phone/email normalized value
```

is indexed but not globally unique identity.

Customer duplicate resolution remains explicit.

---

# 66. Customer Merge

Alias-based canonical resolution must be supported.

Do not rewrite every historical Order during merge.

---

# 67. Customer Addresses

Add canonical Geography references while preserving:

```text
human address text

unresolved locality text

postal data

coordinates where present
```

---

# 68. Order Address Snapshots

Must store enough immutable context to remain human-readable even if Geography names later change.

---

# 69. IAM + Better Auth Reconciliation

This is another major v0.2 change.

Ensure schema cleanly separates:

```text
authentication engine data
```

from:

```text
Maevelle authorization.
```

---

# 70. Better Auth Tables

Based on the pinned implementation version, reconcile required:

```text
User/auth identity

Account

Verification

Two-factor
```

storage with `iam`.

Do not let Better Auth automatically own production migrations.

---

# 71. Auth Secondary Storage

Add the agreed PostgreSQL-backed secondary store supporting:

```text
hashed keys

encrypted values

expiration

atomic increments if required
```

---

# 72. Session Registry

Keep non-secret Maevelle session metadata for:

```text
session management

security investigation

device listing

revocation tracking
```

without raw bearer-token storage.

---

# 73. Service Accounts / API Credentials

Ensure:

```text
raw secrets never stored
```

where hashing is possible.

Store:

```text
prefix / identifier

hash

created

expires

revoked

last used
```

appropriately.

---

# 74. Idempotency

Review:

```text
platform.idempotency_records
```

for:

```text
scope

operation

key

request fingerprint

state

response/result reference

expiry
```

Need concurrency-safe unique key.

---

# 75. Outbox

Ensure Outbox supports:

```text
event ID

aggregate/domain source

event type

payload version

occurred at

published/consumer processing
```

without pretending event sourcing.

---

# 76. Consumer State

One consumer failing cannot prevent another from tracking its own successful consumption.

Reconcile whether:

```text
consumer receipts
```

or equivalent per-consumer state exists.

---

# 77. Jobs

Finalize fields for:

```text
queue

priority

payload

payload_version

run_at

attempt

max_attempts

lease

heartbeat

error

completion
```

---

# 78. Job Claim Index

Design specifically for:

```sql
WHERE state IN ('PENDING','RETRY_WAIT')
  AND run_at <= now()
ORDER BY priority, run_at, id
FOR UPDATE SKIP LOCKED
```

Create supporting index.

---

# 79. Integrity Issues

Ensure cross-domain issue framework supports:

```text
type

domain

resource

severity

status

evidence

operational hold

resolution
```

---

# 80. Operational Holds

Stress testing identified holds as first-class.

Decide whether they are:

```text
generic platform entity
```

or domain-specific.

Do not leave them only as UI concept.

---

# 81. Search

Move/confirm search projection under:

```text
search
```

logical schema.

Add:

```text
tsvector

GIN indexes

pg_trgm indexes
```

as required.

Search remains projection.

---

# 82. Bangla Search

Do not use an English stemmer as the universal configuration.

Start with neutral/simple normalization and aliases unless measured tests justify another configuration.

---

# 83. Analytics

Keep analytics facts/projections separate from transaction tables.

Explicitly mark:

```text
rebuildable
```

where appropriate.

---

# 84. Review Rating Summary

Projection only.

Do not allow Product rating columns to become authoritative.

---

# 85. Order Financial Summary

Stress testing introduced this as an operational projection.

Clarify:

```text
what is snapshot authority
```

versus:

```text
what is rebuildable summary.
```

---

# 86. Finance Ledger

Earlier schema left Finance formalism partially open.

Resolve enough for V1.

Need:

```text
Finance Transaction

Financial Account Entry
```

with balanced operational cash movement semantics if that is the accepted model.

Do not accidentally implement a fake partial double-entry system without documented rules.

---

# 87. Financial Account Balance

Must be ledger-derived/materialized.

No freely editable balance.

---

# 88. Expense Adjustments/Credits

Stress testing introduced:

```text
Expense Credit / Adjustment
```

Ensure schema supports them.

---

# 89. Supplier Advances

Procurement/Finance must support:

```text
unallocated supplier payment/advance
```

if earlier architecture requires it.

Do not require every Supplier Payment to immediately map to Invoice.

---

# 90. Integration Operations

Ensure explicit:

```text
UNKNOWN
```

external outcome state.

Required for:

```text
courier booking

future payment/refund provider operation

other side-effectful provider calls.
```

---

# 91. Provider Events

Store:

```text
external event identifier

received_at

provider timestamp

signature/auth result where useful

raw payload reference

processing status
```

with dedupe.

---

# 92. Webhook Subscriptions

Separate:

```text
Webhook Subscription

Webhook Event

Delivery Attempt
```

Do not merge into Notifications.

---

# 93. Audit

Review partitionability/high-volume future.

V1 need not partition yet.

But index by:

```text
organization

resource

actor

created_at
```

according to known queries.

---

# 94. Soft Delete Is Not Universal

Do not add:

```text
deleted_at
```

to every table automatically.

Choose lifecycle deliberately.

---

# 95. JSONB Policy

For every JSONB column ask:

```text
Why is this not relational?

Is the schema bounded?

Will we query it?

Will constraints be needed?
```

Acceptable examples:

```text
provider raw metadata

historical snapshot supplementary metadata

job payload

outbox payload

bounded rule configuration
```

Bad:

```text
all Product details

all Inventory

all Payment state
```

---

# 96. Index Review

For every table identify:

```text
lookup indexes

list filters

sort keys

FK indexes

unique indexes

partial indexes

provider external identities

time-based queues
```

Do not add indexes blindly.

---

# 97. Every FK Needs Index Review

PostgreSQL does not automatically index referencing FK columns.

Explicitly determine whether child lookup/delete/update behavior requires index.

---

# 98. Partial Indexes

Use where business states make them valuable.

Examples:

```text
active courier booking

active review uniqueness

pending jobs

open integrity issues

current product handle

active session metadata
```

---

# 99. Unique Index vs Unique Constraint

Choose deliberately based on:

```text
partial predicate

FK target requirement

business semantics.
```

---

# 100. Check Constraints

Use for local row invariants such as:

```text
amount >= 0

quantity > 0

start < end

one-of fields

valid combinations
```

Do not duplicate complex cross-row domain logic inside huge CHECK expressions.

---

# 101. Deferred Constraints

Use only where transaction semantics genuinely require them.

Document why.

---

# 102. Locking Matrix

Update the canonical locking matrix.

At minimum cover:

```text
PlaceOrder

Reservation

Promotion usage

Payment verification

Refund

Inbound Receipt

Fulfillment

FIFO cost consumption

Return Receipt

Customer merge

Number sequence

Courier booking active constraint
```

---

# 103. Lock Ordering

Define deterministic lock ordering for multi-row operations.

Example:

```text
Inventory Items
→ ascending stable ID
```

to reduce deadlocks.

---

# 104. Transaction Matrix

For every P0 command specify:

```text
transaction starts

rows locked

writes

outbox creation

commit

external work after commit
```

---

# 105. Idempotency Matrix

For:

```text
PlaceOrder

Receipt posting

Fulfillment posting

Payment verification

Refund

Return receipt

Courier booking operation
```

specify:

```text
key scope

unique constraint

result persistence

retry behavior.
```

---

# 106. Authoritative Source Matrix

Update existing matrix with every newly completed domain.

Example:

| Fact                  | Authority                                                |
| --------------------- | -------------------------------------------------------- |
| Sellable quantity     | Inventory ledger/current level according to architecture |
| Selling price         | Pricing                                                  |
| Committed Order price | Order snapshot                                           |
| Physical return       | Return Receipt                                           |
| COGS                  | Costing                                                  |
| Delivery outcome      | Delivery                                                 |
| Courier consignment   | Courier Booking                                          |
| Customer payment      | Payments                                                 |
| Provider settlement   | Payments/settlement                                      |
| Canonical geography   | Geography                                                |
| Provider area         | Provider geography dataset                               |

---

# 107. Rebuildability Matrix

For each projection state:

```text
Rebuild source

Rebuild command

Expected consistency

Whether business can continue while unavailable
```

---

# 108. High-Volume Table Review

Identify likely growth:

```text
audit events

inventory transactions

outbox

jobs

notification attempts

provider events

analytics facts
```

Do not partition prematurely.

But ensure indexes/access patterns will not make obvious future pain.

---

# 109. Retention

Specify retention behavior where relevant.

Examples:

```text
expired Idempotency records

completed Jobs

old auth secondary storage

provider raw payloads

audit

notifications
```

Do not delete historical financial/business truth through generic cleanup.

---

# 110. Personally Identifiable Information

Mark sensitive tables/columns.

Examples:

```text
Customer phone

email

addresses

exact coordinates

payment evidence

return evidence
```

This helps future masking/access/export policies.

---

# 111. Database Roles

Migration blueprint should propose:

```text
maevelle_migrator

maevelle_app

possibly maevelle_readonly
```

or equivalent.

Application runtime should not have migration/superuser privileges.

---

# 112. Extension Privileges

Extensions should be installed through migration/admin role, not application startup.

---

# 113. Migration Blueprint Must Be Dependency-Aware

Do not create migration numbering merely by domain naming.

Foreign-key dependencies matter.

---

# 114. Proposed Migration Families

Initial planning:

```text
0000_extensions

0010_platform

0020_iam_auth

0030_audit

0040_integrations_infra

0050_jobs_outbox

0100_geography

0200_catalog

0300_sizing

0400_media

0500_warehouse

0600_inventory

0700_customers

0800_pricing

0900_promotions

1000_carts_checkout

1100_orders

1200_payments

1300_fulfillment

1400_delivery

1500_procurement

1600_shipments

1700_receiving

1800_landed_cost

1900_costing

2000_returns

2100_finance

2200_reviews

2300_notifications

2400_search

2500_analytics

2600_integrity_projections
```

Exact numbering may change after dependency analysis.

---

# 115. Do Not Put Hundreds of Objects in One Migration

Migrations should be:

```text
cohesive

reviewable

recoverable.
```

But avoid one migration per trivial column when building from zero.

Balance is required.

---

# 116. Bootstrap vs Evolution Migrations

Initial schema creation may use larger coherent migration families.

Once production launches:

```text
small incremental migrations
```

become standard.

---

# 117. Reference Data

Separate schema from reference/seed data.

Examples:

```text
capability definitions

geography dataset

default configuration registry

payment method definitions if platform-level
```

Specify which are:

```text
migration seed

application seed

imported versioned dataset.
```

---

# 118. Organization Bootstrap

Do not create Maevelle-specific business rows inside generic schema migrations.

Organization setup should use:

```text
bootstrap command/seed process
```

after schema exists.

---

# 119. Geography Dataset

Official/reference Geography data should be loaded through a versioned import/bootstrap process.

Not thousands of hard-coded INSERT statements mixed throughout normal domain migrations unless deliberately generated as a versioned dataset artifact.

---

# 120. Better Auth Schema Generation

For the pinned Better Auth version:

```text
generate/inspect expected DB schema
```

then manually reconcile into the Maevelle IAM migrations.

Do not accept unexpected tables automatically.

---

# 121. Kysely Type Generation

Database row types may be generated from schema after migration.

Generated types belong:

```text
database/infrastructure
```

not Domain.

---

# 122. Physical SQL Review

Before applying any migration:

```text
inspect final SQL.
```

Do not trust query-builder abstraction blindly for critical constraints/indexes.

---

# 123. Migration Verification

Every migration family needs:

```text
schema assertions

constraint tests

clean install test

upgrade test later

critical index presence.
```

---

# 124. Clean Install Test

CI must prove:

```text
empty PostgreSQL 18
→ all migrations
→ expected current schema.
```

---

# 125. Schema Drift Detection

Production/staging DB should not contain:

```text
manual untracked tables

columns

indexes
```

without corresponding migration.

Implement drift-check tooling where practical.

---

# 126. Migration Metadata

Use canonical migration metadata table through Kysely or approved migration runner.

Do not create multiple migration histories.

---

# 127. Production Migration Rule

Never run migration automatically from:

```text
API startup

Worker startup

Next.js startup.
```

Deployment invokes explicit migration job/container.

---

# 128. Dangerous Migration Classification

Mark migration as HIGH RISK if it:

```text
drops data

rewrites historical monetary data

changes cost quantities

changes tenant keys

changes Order snapshots

changes authentication identity

changes provider idempotency keys.
```

---

# 129. Pre-Launch Advantage

Because production does not exist yet, we can still correct structural mistakes relatively cheaply.

Use this opportunity.

Do not preserve bad v0.1 design merely to avoid changing the document.

---

# 130. But Avoid Needless Redesign

Do not rewrite tables that already correctly satisfy architecture just to create stylistic consistency.

Every change must have reason:

```text
new domain requirement

correctness

security

performance

implementation ADR

naming conflict

operational requirement.
```

---

# 131. Naming Consistency Audit

Review:

```text
singular/plural policy

*_id naming

timestamp naming

status naming

number/reference naming

external_id naming

provider_* naming

snapshot naming

version naming.
```

Make it consistent now.

---

# 132. Human Number vs ID

Transactional entities may have:

```text
id
```

and:

```text
order_number
delivery_number
return_number
purchase_number
```

Separate them.

Human number is not FK authority.

---

# 133. Number Sequence

Ensure concurrency-safe:

```text
platform.number_sequences
```

supports per:

```text
organization

document type

possibly period
```

according to Settings architecture.

No promise of gapless numbering.

---

# 134. Public References

Guest/public access credentials must be separate from:

```text
human Order number.
```

Ensure schema supports secure public access token/reference hashing if needed.

---

# 135. Token Storage

For:

```text
API keys

guest order access

review links

password/recovery tokens
```

prefer:

```text
hash
```

rather than raw secret persistence where lookup model permits.

---

# 136. Secret Encryption

Where decryption is actually required:

```text
provider credentials

Better Auth secondary values
```

use application-managed authenticated encryption with key version.

Do not hash credentials that must later be sent to provider.

---

# 137. Integration Credentials

Keep secret material separate from ordinary Integration metadata.

Prefer:

```text
integration credential secret table
```

or encrypted secret field with strict access.

---

# 138. Audit Before/After

Avoid storing unnecessary giant copies for every action.

Use structured relevant changes.

Never store raw secrets inside audit snapshots.

---

# 139. Raw Provider Payloads

If large/sensitive, consider:

```text
object storage payload
+
DB metadata/reference
```

rather than unlimited JSONB growth.

Decide threshold/policy.

---

# 140. Media Metadata

Asset identity is:

```text
Asset
→ Stored Object
```

not URL.

Ensure DB supports multiple stored representations/renditions.

---

# 141. Public/Private Media

Schema must preserve:

```text
privacy classification
```

or relation semantics sufficient to prevent accidental public exposure.

---

# 142. Review Media

Public only if:

```text
Review approved/visible
AND
Media safe/public
```

Database relationships should make moderation traceable.

---

# 143. Payment Evidence

Must remain private.

No generic `media_usage` projection can grant public visibility.

---

# 144. Finance vs Payment

Review all financial FKs to avoid:

```text
Payment Settlement amount
=
Cash movement amount
```

without explicit relationship.

---

# 145. COD Settlement

Must support:

```text
customer collection gross

fees

deductions

net settlement
```

without reducing original Customer Payment.

---

# 146. Supplier Payment

Separate:

```text
cash paid
```

from:

```text
Supplier Invoice obligation.
```

Allocation table required.

---

# 147. Expense Link

Expenses may relate to:

```text
Shipment

Delivery

other operational source
```

but source domains retain their truth.

Use explicit/link model rather than generic authority stealing.

---

# 148. Settings

Do not create a giant:

```text
settings(key,value)
```

for everything.

Use configuration registry + typed structured setting storage according to Settings architecture.

Entities remain entities.

---

# 149. Feature Flags

Keep outside normal business settings.

---

# 150. User Preferences

Separate from Organization configuration.

---

# 151. Data Lifecycle Audit

For every table document:

```text
Can create?

Can update?

Can archive?

Can delete?

Can purge?

Retention?
```

---

# 152. Repairability

For high-risk tables ask:

```text
How is this repaired if corrupted?
```

Examples:

```text
Inventory Level
→ rebuild

Search
→ rebuild

Review Summary
→ rebuild

Cost Layer
→ compensation, not rebuild casually

Payment
→ reversal/correction, not deletion.
```

---

# 153. Database Triggers

Default:

```text
avoid hidden business logic.
```

Triggers are acceptable for tightly scoped relational integrity/audit infrastructure when clearly justified.

Any trigger must be documented.

---

# 154. Stored Procedures

Do not move domain architecture wholesale into PostgreSQL procedures.

Use only when:

```text
atomic DB-local operation
```

materially benefits correctness/performance and remains well-documented.

---

# 155. RLS

Earlier architecture left PostgreSQL RLS as optional defense in depth.

Re-evaluate, but do not automatically adopt it.

If adopted:

```text
must complement application auth

must be fully tested

must not silently break workers/migrations.
```

Otherwise tenant-safe FKs + application authorization remain primary.

---

# 156. Initial Recommendation on RLS

For V1:

```text
do not make RLS mandatory for all business tables
```

unless implementation review shows a clean, low-risk policy.

Use:

```text
tenant-safe relational keys
+
server authorization
```

as launch foundation.

RLS can be later ADR.

---

# 157. Partitioning

Do not partition ordinary tables in initial schema.

Only record future candidates:

```text
audit

inventory ledger

outbox

jobs

provider events

notification attempts

analytics facts.
```

Add partitioning only from measured need.

---

# 158. Materialized Views

Do not use as hidden domain truth.

May be used later for heavy reporting.

---

# 159. Migration Blueprint Exit Criteria

The blueprint is complete only when:

```text
every table belongs to a migration stage

every stage dependencies are understood

every critical constraint is assigned

every required extension is assigned

reference data bootstrap is assigned

auth bootstrap is assigned

indexes are assigned

high-risk concurrency tables are identified

verification tests are specified.
```

---

# 160. Schema v0.2 Exit Criteria

The canonical schema is complete only when:

```text
all architecture domains have coverage

no known duplicate authority exists

Pricing is reconciled

Costing is reconciled

Returns is reconciled

Delivery is reconciled

Geography is reconciled

Better Auth is reconciled

technical ADRs are reflected

locking matrix updated

transaction matrix updated

source-of-truth matrix updated

rebuildability matrix updated.
```

---

# 161. Mandatory Stress Review Before Approval

Attack the schema with these scenarios:

```text
Two customers buy final unit

Two admins verify same payment

Refund timeout

Duplicate inbound receipt

Duplicate fulfillment

Concurrent FIFO consumption

Return restoration twice

RTO before warehouse receipt

Late landed cost after some units sold

Transfer while cost correction occurs

Customer merge during Order creation

Courier timeout after booking succeeded

COD changed after courier pickup

Geography provider ID changes

Provider callback arrives twice

Worker crashes after external provider success

Order cancelled while late payment arrives

Database response lost after commit.
```

For each, the schema must have a plausible correctness mechanism.

---

# 162. Do Not Start Production Domain Migrations Until Approval

Repository scaffolding may proceed.

But do not implement dozens of domain migrations while this reconciliation remains unresolved.

---

# 163. Recommended Work Sequence

```text
STEP 1
Load/read existing PostgreSQL v0.1

STEP 2
Build complete domain coverage matrix

STEP 3
List every gap/conflict

STEP 4
Resolve global conventions

STEP 5
Reconcile Platform/IAM/Auth

STEP 6
Reconcile Catalog/Sizing/Media/Geography

STEP 7
Reconcile Warehouse/Inventory

STEP 8
Reconcile Customer/Pricing/Promotions

STEP 9
Reconcile Orders/Payments

STEP 10
Reconcile Fulfillment/Delivery

STEP 11
Reconcile Procurement/Shipment/Receiving

STEP 12
Reconcile Landed Cost/Costing

STEP 13
Reconcile Returns/RTO

STEP 14
Reconcile Finance

STEP 15
Reconcile Reviews/Notifications/Integrations

STEP 16
Reconcile Search/Analytics/Projections

STEP 17
Stress constraints, transactions and locking

STEP 18
Update canonical schema to v0.2

STEP 19
Create Migration Blueprint

STEP 20
Run final cross-document consistency audit.
```

---

# 164. Required Final Summary

At the end, provide:

## Added

```text
new tables/relationships introduced
```

## Changed

```text
tables/constraints/types revised from v0.1
```

## Removed

```text
obsolete/competing schema ideas
```

## Renamed

```text
naming corrections
```

## Deferred

```text
intentionally non-V1 relational structures
```

## ADRs still required

Only genuine unresolved implementation decisions.

---

# 165. Change Classification

Every v0.1 → v0.2 change should be classified:

```text
CRITICAL CORRECTION

NEW DOMAIN COVERAGE

SECURITY HARDENING

CONCURRENCY HARDENING

TECHNICAL ADR ALIGNMENT

NAMING / CLEANUP

PERFORMANCE
```

This prevents arbitrary edits.

---

# 166. Important Instruction for AI Agents

Do **not** optimize for brevity.

This reconciliation is one of the final chances to find structural leaks before implementation.

Use highest-effort reasoning.

Look for:

```text
hidden duplicate authorities

circular dependencies

missing provenance

missing historical snapshots

FK impossibilities

cross-tenant vulnerabilities

unrecoverable states

race conditions

ambiguous ownership

late-event behavior

compensation gaps

provider uncertainty

inconsistent money/currency

broken FIFO provenance

return/refund coupling mistakes.
```

---

# 167. But Do Not Invent Complexity Without Use

For every new table ask:

```text
Which concrete invariant or workflow requires this?
```

If there is no answer:

```text
do not add it.
```

---

# 168. Final Goal

When this stage is complete, a developer should be able to move from:

```text
docs/architecture/postgresql-schema-specification.md v0.2
```

plus:

```text
docs/implementation/
postgresql-schema-reconciliation-migration-blueprint.md
```

directly into:

```text
Kysely migration implementation
```

without needing to invent business relationships on the fly.

---

# 169. Success Definition

The result should allow us to say:

> **The database schema is no longer an early architectural proposal. It is a reconciled implementation contract derived from the complete Maevelle business architecture and ready to be translated into reviewed PostgreSQL migrations.**

---

**End of Master Instructions**
