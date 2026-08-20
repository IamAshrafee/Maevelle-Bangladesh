# Maevelle Ecommerce — System & Technical Architecture

**Document:** `docs/architecture/system-technical-architecture.md`
**Status:** Initial Architecture Design / Living Document
**Version:** 0.1
**Related:** All domain architecture documents, `api-webhook-integration-architecture.md`, `security-audit-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

This document defines how Maevelle's business architecture becomes:

```text
Source Code

Running Applications

Database

Workers

Queues

Search

Storage

Caching

Deployments

Monitoring

Backups

Recovery

Scaling Infrastructure
```

The objective is not to create the most complicated infrastructure.

The objective is:

> **Build the simplest production architecture that preserves our domain integrity and can evolve without a rewrite.**

---

# 2. Central Technical Principle

> **Maevelle starts as a modular monolith, not a distributed monolith and not premature microservices.**

Meaning:

```text
One cohesive codebase

One primary transactional database

Clear internal domain boundaries

Multiple deployable processes where operationally useful

No unnecessary network calls between domains
```

---

# 3. Modular Monolith Does Not Mean One Giant Application File

The system remains divided into:

```text
Catalog

Sizing

Media

Inventory

Warehouse

Procurement

Shipments

Landed Cost

Orders

Payments

Customers

Access

Finance

Storefront

Reviews

Promotions

Notifications

Analytics

Settings

Integrations
```

Each has explicit:

```text
Domain

Application Services

Ports / Interfaces

Infrastructure Adapters

Public Module API
```

---

# 4. Second Core Principle

> **Deployment topology and domain topology are different concerns.**

We may initially run:

```text
API
Worker
Storefront
Admin
PostgreSQL
```

on one VPS.

That does not mean the domains become coupled.

Similarly, later running:

```text
3 API instances
8 workers
dedicated PostgreSQL
```

does not require changing business concepts.

---

# 5. Third Core Principle

> **PostgreSQL is the transactional authority.**

Authoritative data includes:

```text
Orders

Payments

Refunds

Inventory ledger

Reservations

Purchases

Shipments

Landed Cost

Customers

Expenses

Access Control

Audit

Configuration
```

PostgreSQL's current documentation provides transaction-isolation and explicit-locking facilities intended for maintaining consistency under concurrent database access.

---

# 6. Fourth Core Principle

> **Cache, search index, queues and analytical projections are never substitutes for transactional truth.**

If we lose:

```text
Cache
```

we rebuild.

If we lose:

```text
Search Index
```

we rebuild.

If we lose:

```text
Analytics Projection
```

we rebuild.

If we lose:

```text
PostgreSQL transactional history
```

that is a disaster requiring recovery from backups.

---

# 7. Fifth Core Principle

> **External provider availability must never become a prerequisite for unrelated local business operations.**

Examples:

```text
Courier down
≠
Catalog down

Email provider down
≠
Order creation down

Analytics broken
≠
Checkout broken

Search projection stale
≠
Inventory ledger corrupt
```

---

# 8. Technology Direction

Core technology:

```text
TypeScript

Node.js

Next.js

React

shadcn/ui

PostgreSQL

S3-compatible Object Storage

Docker / containerized deployment
```

Optional when justified:

```text
Redis

Dedicated Search Engine

Read Replica

CDN

Dedicated worker machines
```

---

# 9. Next.js Role

Next.js should primarily power:

```text
Storefront

Admin Portal
```

using the App Router architecture.

Current Next.js documentation supports self-hosting as a Node.js server or Docker container, making it compatible with Maevelle's VPS-first deployment model.

---

# 10. Important Backend Decision

> **The core business API should not live primarily inside Next.js Route Handlers.**

Instead:

```text
Next.js
→ Presentation / Server Rendering / Client UX

Standalone Backend
→ Application + Domain API
```

---

# 11. Why Separate the Backend?

Because Maevelle is intentionally:

```text
API-first

future mobile-ready

future integration-ready

theme-independent

future multi-storefront-ready
```

The backend should not depend on:

```text
Next.js rendering lifecycle
```

to perform business operations.

---

# 12. Next.js Route Handlers

Can still be used for:

```text
frontend-specific BFF behavior

web-specific proxying

special Next.js integration needs
```

but not as the canonical home of:

```text
Inventory logic

Payment logic

Order logic

Procurement logic
```

---

# 13. Backend Technology

Backend should be:

```text
Node.js + TypeScript
```

running as its own long-lived application process.

Exact HTTP framework is an implementation ADR.

Architecture does not depend on a particular framework.

---

# 14. Repository Strategy

A monorepo is justified.

Reasons:

```text
Storefront

Admin

API

Workers

Shared contracts

Shared types

Shared infrastructure

Coordinated migrations

Shared tests
```

all belong to one product/platform.

---

# 15. Recommended Repository Structure

```text
/
├── apps/
│   ├── storefront/
│   ├── admin/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── core/
│   ├── database/
│   ├── contracts/
│   ├── config/
│   ├── observability/
│   ├── security/
│   ├── ui-admin/
│   ├── ui-storefront/
│   └── testkit/
│
├── docs/
│   ├── initial/
│   ├── domains/
│   ├── architecture/
│   ├── decisions/
│   ├── operations/
│   └── testing/
│
├── scripts/
├── infrastructure/
└── package.json
```

---

# 16. Monorepo Tooling

Use:

```text
pnpm workspaces
```

or equivalent workspace mechanism.

Turborepo can be introduced if build orchestration/caching materially improves development.

It is not an architectural requirement.

---

# 17. `apps/storefront`

Responsibilities:

```text
Public routing

SEO

Product pages

Category pages

Search UX

Cart UX

Checkout UX

Review presentation

Server rendering

Public caching

Storefront analytics events
```

---

# 18. Storefront Must Not Own

```text
Pricing authority

Inventory authority

Promotion authority

Order validation

Payment verification
```

Those belong to backend domains.

---

# 19. `apps/admin`

Responsibilities:

```text
Admin routing

Dashboards

Product editor

Order workspace

Inventory UI

Procurement UI

Finance UI

Settings UI

Operational forms

Permission-aware presentation
```

---

# 20. Admin Is Also Not Domain Authority

Admin may hide:

```text
Refund button
```

but backend still checks:

```text
payments.refund
```

---

# 21. `apps/api`

Responsibilities:

```text
HTTP transport

Authentication integration

Request validation

Rate limiting integration

API DTO mapping

Application-service invocation

Error mapping

Request tracing
```

---

# 22. API Must Remain Thin

Avoid:

```text
controller contains 400 lines
of business rules
```

Controllers translate:

```text
HTTP
→ Command / Query
→ Application Service
```

---

# 23. `apps/worker`

Long-running process responsible for:

```text
Outbox dispatch

Notification delivery

Webhook delivery

Media processing

Imports

Exports

Analytics projection jobs

Scheduled jobs

Reconciliation

Cleanup
```

---

# 24. Worker Reuses Core Application Services

It must not implement duplicate domain rules.

Example:

```text
Worker
→ PaymentReconciliationService
```

not:

```text
worker manually UPDATE payments
```

---

# 25. `packages/core`

This is the **modular monolith core**.

Structure:

```text
core/
└── src/
    └── modules/
        ├── catalog/
        ├── sizing/
        ├── media/
        ├── inventory/
        ├── warehouse/
        ├── procurement/
        ├── shipments/
        ├── landed-cost/
        ├── orders/
        ├── payments/
        ├── customers/
        ├── iam/
        ├── finance/
        ├── reviews/
        ├── promotions/
        ├── notifications/
        ├── analytics/
        ├── settings/
        └── integrations/
```

---

# 26. Why One `core` Package Instead of 20 npm Packages Initially?

We want logical modularity without introducing package-management ceremony everywhere.

Within `core`, boundaries can still be strict.

Later a domain can be extracted into its own package/service if genuinely required.

---

# 27. Module Structure

Each domain module should roughly follow:

```text
catalog/
├── domain/
├── application/
├── infrastructure/
└── public/
```

---

# 28. `domain/`

Contains:

```text
Entities

Value Objects

Domain Rules

Domain Services

Invariants

Domain Events
```

---

# 29. Domain Layer Must Avoid

Direct dependency on:

```text
Next.js

HTTP request

React

database ORM specifics

Redis

email provider

courier SDK
```

---

# 30. `application/`

Contains:

```text
Commands

Queries

Use Cases

Application Services

Authorization orchestration

Transactions

Cross-module coordination
```

---

# 31. Example

```text
CancelOrderCommand
```

application service coordinates:

```text
Order

Inventory Reservations

Payment/Refund implications

Audit

Domain Events
```

---

# 32. `infrastructure/`

Implements:

```text
Repositories

Database persistence

Provider adapters

Search adapters

Storage adapters
```

---

# 33. `public/`

Defines what other modules are allowed to use.

Example Inventory publishes:

```text
reserveInventory()

releaseReservation()

fulfillReservation()

getAvailability()
```

Other modules cannot directly import:

```text
Inventory internal repository
```

---

# 34. Module Encapsulation

Forbidden:

```text
Orders
→ inventory database table
```

Required:

```text
Orders
→ Inventory public application interface
```

---

# 35. Architecture Enforcement

Use:

```text
lint rules

dependency-boundary rules

code review

architecture tests
```

to prevent forbidden imports.

---

# 36. Shared `utils` Warning

Avoid creating:

```text
utils/
```

that becomes a dumping ground for unrelated domain behavior.

---

# 37. Shared Kernel

Only genuinely universal primitives belong centrally.

Examples:

```text
Money

Currency

Entity ID helpers

Clock interface

Result/Error abstraction

Pagination primitives
```

---

# 38. Domain-Specific Logic Stays Domain-Specific

Example:

```text
AvailableToSell
```

belongs to Inventory.

Not:

```text
common/utils/inventory.ts
```

---

# 39. `packages/database`

Contains:

```text
Database client setup

Transaction infrastructure

Migration infrastructure

Shared low-level DB primitives
```

It should not become owner of domain semantics.

---

# 40. Domain Persistence Ownership

Example:

```text
Inventory module
```

owns Inventory persistence adapters.

The database package supplies connection/transaction infrastructure.

---

# 41. `packages/contracts`

Contains stable cross-application API contracts where useful.

Examples:

```text
Storefront DTO schemas

Admin DTO schemas

Integration API schemas

Webhook event schemas
```

---

# 42. Do Not Share Domain Objects Directly With Frontend

Frontend can share:

```text
validated DTO contracts
```

but not persistence/domain entities.

---

# 43. `packages/config`

Typed environment/deployment configuration.

Examples:

```text
DATABASE_URL

OBJECT_STORAGE_ENDPOINT

APPLICATION_URL

LOG_LEVEL
```

---

# 44. Environment Validation

Application should fail fast at startup if mandatory configuration is missing or malformed.

---

# 45. `packages/observability`

Provides:

```text
Logging

Metrics

Tracing context

Request IDs

Correlation IDs
```

---

# 46. `packages/testkit`

Reusable:

```text
Fixtures

Factories

Fake clock

Test database helpers

Provider fakes

Assertion helpers
```

---

# 47. Separate Admin and Storefront UI Packages

Recommended:

```text
ui-admin

ui-storefront
```

because visual/interaction requirements differ.

---

# 48. Do Not Force One Design System Onto Both

Shared primitives can exist.

But:

```text
Admin dense operational table
```

and:

```text
Storefront Product Card
```

serve different users.

---

# 49. Runtime Processes

V1 deployable processes:

```text
Storefront

Admin

API

Worker
```

---

# 50. Do We Need a Separate Scheduler Process?

No initially.

Worker can include scheduled-job polling with distributed locking.

---

# 51. Multi-Worker Scheduler

When multiple workers exist:

```text
only one scheduler leader
```

should enqueue a given scheduled task occurrence.

PostgreSQL advisory locks are available for application-controlled locking when such coordination is useful.

---

# 52. One-VPS Production Topology

Recommended:

```text
                     INTERNET
                         │
                         ▼
                  Reverse Proxy
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   Storefront          Admin             API
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
                     PostgreSQL
                         ▲
                         │
                      Worker
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          Object      External    External
          Storage     Providers   Webhooks
```

---

# 53. Reverse Proxy

Responsibilities:

```text
TLS termination

Routing

Compression where appropriate

Request limits

Security headers support

Access logging

Static delivery coordination
```

Possible implementation:

```text
Nginx

Caddy
```

Exact choice is deployment ADR.

---

# 54. Next.js Reverse Proxy Configuration

If self-hosted Next.js streaming is used, reverse-proxy buffering needs compatible configuration; the official Next.js self-hosting guidance explicitly discusses reverse-proxy behavior for streaming.

---

# 55. Suggested Logical Hostnames

Conceptually:

```text
www.example.com
admin.example.com
api.example.com
```

Exact production domain remains configurable.

---

# 56. Internal Networking

Containers/processes communicate through:

```text
private Docker/network interface
```

rather than exposing:

```text
PostgreSQL

worker

Redis
```

to public internet.

---

# 57. Containerization

Recommended:

```text
Docker images
+
Docker Compose
```

for V1 VPS operations.

---

# 58. Why Compose Initially?

The topology is small enough that Kubernetes would add operational burden without meaningful V1 benefit.

---

# 59. Container Health

Every long-running service should expose appropriate health status.

Docker Compose supports health checks and health-aware dependency startup, rather than merely assuming a started container is ready.

---

# 60. Container Restart

Production services should use deliberate restart policies.

But restart loops must remain observable rather than hiding crashes forever.

---

# 61. Core Containers

Potential:

```text
reverse-proxy

storefront

admin

api

worker

postgres
```

Optional:

```text
redis
```

---

# 62. PostgreSQL

One PostgreSQL primary is sufficient V1.

Do not introduce:

```text
multiple database clusters

sharding

multi-primary
```

without real evidence.

---

# 63. Database Is Single Source of Transactional Truth

This enables local transactions across tightly connected domains.

Example checkout transaction can safely coordinate:

```text
Order

Inventory reservation

Promotion usage

Payment Intent

Outbox
```

without distributed transaction protocols.

---

# 64. Transaction Boundary

The application service decides transaction boundaries.

Not individual repositories independently.

---

# 65. Example

```text
BEGIN

validate checkout
create order
reserve inventory
commit promotion usage
create payment intent
write outbox events

COMMIT
```

Either:

```text
all succeeds
```

or:

```text
all rolls back
```

where the use case requires atomicity.

---

# 66. Do Not Perform External HTTP Call Inside Critical DB Transaction

Bad:

```text
BEGIN

lock inventory

call courier for 20 seconds

COMMIT
```

This increases:

```text
lock duration

connection usage

failure ambiguity
```

---

# 67. External Side Effects

Use:

```text
local committed state
+
durable job/outbox
+
external operation
+
reconciliation
```

instead.

---

# 68. Database Isolation

Do not globally force maximum isolation for every transaction.

Use:

```text
normal transaction isolation

explicit row locking

constraints

optimistic versioning

serializable where truly justified
```

based on each workflow.

PostgreSQL provides multiple transaction-isolation levels plus explicit row/table/advisory locking mechanisms.

---

# 69. Example — Inventory Reservation

Need transactionally safe:

```text
check sellable availability
+
create reservation
+
update materialized balance
```

under concurrency.

---

# 70. Example — Promotion Usage

Need atomic:

```text
remaining usage > 0
+
usage claim
```

---

# 71. Example — Sequence Allocation

Need concurrency-safe:

```text
next order number
```

---

# 72. Deadlocks

Even correct database systems can experience competing lock orders.

Application must:

```text
use consistent locking order

keep transactions short

retry known transient transaction failures safely
```

---

# 73. Retryable Transaction

Only retry when operation is:

```text
idempotent

or safely contained before side effects.
```

---

# 74. Database Constraints

Use database constraints aggressively for invariants that database can express.

Examples:

```text
Foreign Keys

Unique Constraints

Check Constraints

NOT NULL

Exclusion constraints where appropriate
```

---

# 75. Do Not Rely Only on Application Validation

Two simultaneous processes can bypass pre-check assumptions.

Database is final integrity layer.

---

# 76. ORM

ORM/query-builder selection is implementation detail.

Architecture requires:

```text
Explicit transactions

Raw SQL escape hatch

Strong migrations

Constraint support

Performance visibility
```

---

# 77. Avoid ORM-Driven Domain Model

Domain concepts should not become whatever the ORM happens to model conveniently.

---

# 78. Database Migrations

Schema changes are:

```text
version controlled

reviewed

repeatable

automated
```

---

# 79. Forward Migration

Production deployment normally moves:

```text
Schema N
→ Schema N+1
```

through migration.

---

# 80. Migration Safety

Avoid production migrations that casually:

```text
lock enormous tables

rewrite massive data synchronously

drop data immediately
```

---

# 81. Expand-and-Contract Pattern

For risky schema evolution:

```text
1. Add new structure

2. Deploy code compatible with both

3. Backfill

4. Switch reads/writes

5. Verify

6. Remove old structure later
```

---

# 82. Database Rollback

Do not assume every migration can safely be reversed automatically.

Forward repair is often safer after data transformations.

---

# 83. Migration Backup

High-risk migrations require:

```text
verified recent backup

rollback/repair plan
```

---

# 84. PostgreSQL Monitoring

Use built-in statistics plus query analysis.

PostgreSQL provides cumulative activity statistics, and the `pg_stat_statements` extension tracks SQL planning/execution statistics, useful for identifying expensive query patterns.

---

# 85. Indexing

Index based on real query patterns.

Do not create indexes on every column.

---

# 86. Critical Index Classes

Likely include:

```text
Organization ownership

status

human numbers

foreign keys

created_at

customer identity search

SKU

normalized phone

external references

queue status
```

Exact indexes come during schema design.

---

# 87. Partial Indexes

Can later help selective high-value queries such as:

```text
active records

unprocessed outbox entries

open exceptions
```

where justified.

---

# 88. Connection Pooling

All processes must use bounded database connection pools.

---

# 89. Why?

One overloaded API instance must not open:

```text
thousands of PostgreSQL connections
```

and collapse the database.

---

# 90. Connection Budget

Production should define:

```text
PostgreSQL max connections

API pool size

Worker pool size

migration/admin reserve
```

---

# 91. Future External Pooler

A dedicated pooler can be introduced when horizontal scaling makes direct application pools inefficient.

Not mandatory V1.

---

# 92. Transaction Timeout

Long-running accidental transactions should be detectable.

---

# 93. Query Timeout

Expensive administrative/reporting queries should have bounded behavior.

---

# 94. Search Architecture

Search is a separate projection/interface.

```text
Catalog
   ↓
Search Projection
   ↓
Search API
```

---

# 95. V1 Search Engine

Start with PostgreSQL-backed search.

This is enough to avoid adding another production datastore before necessary.

---

# 96. PostgreSQL Search Capabilities

PostgreSQL currently provides full-text search functionality, GIN indexes for text search, and the `pg_trgm` extension for trigram similarity/indexed matching.

---

# 97. Search Projection

Should flatten searchable public attributes:

```text
Product title

Description

SKU

Category

Collection

Tags

Occasion

Primary Color

Associated Colors

Option values

Attributes

Search aliases
```

---

# 98. Search Does Not Query 15 Domain Tables on Every Keystroke

Build a purpose-designed projection.

---

# 99. Search Projection Authority

Search projection is disposable.

Catalog remains authority.

---

# 100. Rebuild Search

Command:

```text
rebuildCatalogSearchProjection()
```

must be possible.

---

# 101. Search Eventual Consistency

Product update may reach search:

```text
slightly later
```

without invalidating Product truth.

---

# 102. Critical Publication

For Publish operation, Search indexing failure should be observable and retried.

Storefront can still retrieve canonical Product directly if route known.

---

# 103. Search Engine Extraction

Introduce dedicated engine only when evidence shows need for:

```text
larger data volume

complex faceting

advanced typo tolerance

ranking sophistication

multi-language search requirements

query load
```

---

# 104. Search Interface

Backend should depend on:

```text
CatalogSearchPort
```

not directly on PostgreSQL full-text implementation.

Later:

```text
PostgreSQLSearchAdapter
→ DedicatedSearchAdapter
```

without Storefront redesign.

---

# 105. Queue Architecture

Important decision:

> **Redis is not mandatory for V1.**

We already require PostgreSQL.

PostgreSQL can support durable:

```text
Jobs

Outbox

Retry state

Scheduled work
```

initially.

---

# 106. PostgreSQL-Backed Worker Queue

Conceptually:

```text
jobs
├── id
├── type
├── payload/reference
├── status
├── priority
├── attempts
├── available_at
└── locked_by
```

Exact schema later.

---

# 107. Work Claiming

Multiple workers need to claim different jobs safely.

PostgreSQL explicitly documents `SKIP LOCKED` as suitable for avoiding contention among multiple consumers of queue-like tables.

---

# 108. Queue Truth

For critical jobs:

```text
Payment reconciliation

Webhook delivery

Notification delivery

Outbox processing
```

the durable job/event record must survive process restart.

---

# 109. Worker Crash

If worker dies after claiming a job:

```text
lease/visibility timeout
```

allows safe recovery.

---

# 110. Job State

Recommended:

```text
PENDING

RUNNING

RETRY_WAIT

COMPLETED

FAILED

DEAD_LETTER

CANCELLED
```

---

# 111. Retry State

Record:

```text
attempt count

last error class

next retry

last attempted at
```

---

# 112. Dead Letter

After retry policy exhausted:

```text
DEAD_LETTER
```

with operator repair/retry UI.

---

# 113. Queue Priorities

At minimum:

```text
CRITICAL

HIGH

NORMAL

LOW
```

---

# 114. Critical Work

Examples:

```text
Payment callback processing

Refund operations

Security notifications
```

---

# 115. Lower-Priority Work

Examples:

```text
Analytics backfill

Search rebuild

Large export
```

---

# 116. Worker Starvation

Low-priority 500,000-row analytics job must not block:

```text
payment reconciliation.
```

---

# 117. Worker Concurrency

Configurable per job class.

Example:

```text
media processing:
4

webhooks:
20

heavy analytics:
1
```

depending hardware/load.

---

# 118. Outbox Architecture

Outbox is one of the most important infrastructure components.

---

# 119. Outbox Flow

```text
DOMAIN TRANSACTION
       │
       ├── Business Records
       └── Outbox Events
              │
            COMMIT
              │
              ▼
       Outbox Dispatcher
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
Notifications Analytics Webhooks
```

---

# 120. Why Outbox?

Prevents:

```text
Order committed

process crashes

order.created event permanently lost
```

---

# 121. Outbox Is PostgreSQL-Backed

Outbox entry belongs in same transaction as business state.

---

# 122. Outbox Dispatcher

Claims unpublished events and distributes them to registered internal consumers.

---

# 123. Consumer State

Each consumer needs independent delivery/processing identity.

Example:

```text
order.created

Notifications:
processed

Analytics:
processed

Webhook:
retrying
```

---

# 124. One Consumer Failure Must Not Block Others

Critical.

---

# 125. Event Versioning

Internal domain events carry:

```text
event_id

event_type

event_version

aggregate_id

aggregate_version

organization_id

occurred_at
```

---

# 126. Outbox Retention

Processed events can later be:

```text
archived

purged
```

after safe retention.

They are not necessarily permanent event sourcing history.

---

# 127. Maevelle Is Not Event-Sourced

Important.

The authoritative model remains:

```text
current relational state
+
business ledgers/history
+
audit
```

Events support integration/projections.

---

# 128. Do Not Confuse Outbox With Event Sourcing

We are not reconstructing Product entirely from:

```text
ProductCreated
ProductRenamed
ProductPublished
...
```

unless a specific domain ledger deliberately works that way.

---

# 129. Redis Decision

Redis can later be introduced for:

```text
Cache

rate limits

distributed coordination

high-throughput jobs

ephemeral sessions if architecture requires
```

---

# 130. Redis Must Not Become Hidden Primary Database

Redis documents distinct persistence modes ranging from no persistence through snapshots and append-only logging; therefore Maevelle should not make critical transactional truth dependent solely on Redis persistence.

---

# 131. Redis Failure Policy

If Redis is down:

```text
Product browsing may become slower

cache misses increase

some rate-limit behavior may degrade safely
```

but:

```text
Orders don't disappear

Payments don't disappear

Inventory doesn't disappear
```

---

# 132. Cache Architecture

Cache is optional optimization.

---

# 133. Cache Categories

```text
Public Storefront Cache

Configuration Cache

Reference Data Cache

Search Result Cache

Rate-Limit State

Session cache if later justified
```

---

# 134. Cache Key Must Include Context

Examples:

```text
Organization

Storefront

Locale

Currency

Permissions when sensitive
```

where applicable.

---

# 135. Never Cache Private Response as Public

Examples:

```text
Customer Order

Admin Finance

Payment Evidence
```

must not leak through shared cache.

---

# 136. Cache Invalidation

Prefer:

```text
versioned keys

tagged invalidation

event-driven invalidation

reasonable TTL
```

depending use case.

---

# 137. Cache Failure

Correct behavior:

```text
cache unavailable
→ fallback to source
```

where practical.

---

# 138. Next.js Caching

Current Next.js self-hosting documentation notes that multiple application instances need cache coordination/shared caching for consistent revalidation behavior.

---

# 139. V1 Single Storefront Instance

Local Next.js cache is acceptable where semantics allow.

---

# 140. Future Multiple Storefront Instances

Need:

```text
shared cache handler

or reliable cross-instance invalidation
```

before horizontal scaling.

---

# 141. Product Cache

Safe for:

```text
public Product projection
```

but Order placement never trusts cached availability/pricing as final authority.

---

# 142. Object Storage

User-generated/business files should not be stored as BLOBs in PostgreSQL.

Use object storage abstraction.

---

# 143. Storage Interface

```text
putObject()

getObject()

deleteObject()

createSignedReadUrl()

createSignedUploadUrl()
```

conceptually.

---

# 144. Production Storage

Prefer S3-compatible object storage.

Backend stores:

```text
Asset ID

Object key

Metadata
```

rather than permanent provider URL as identity.

---

# 145. Application Filesystem

Do not treat container filesystem as durable user-media storage.

Containers can be replaced/rebuilt.

---

# 146. Public Media

Can be delivered via:

```text
object storage
+
CDN later
```

---

# 147. Private Media

Delivered through:

```text
authorization
+
signed/controlled access
```

---

# 148. V1 Storage Failure

Upload failure:

```text
Asset remains failed/pending
```

rather than creating fake READY media.

---

# 149. Storage Backup

Original media and important business documents must be covered by backup/replication strategy.

---

# 150. Media Processing

Worker handles:

```text
validation

metadata extraction

EXIF stripping

thumbnail generation

web renditions

security scanning
```

---

# 151. Media CPU Isolation

Large image processing can be CPU/memory intensive.

Worker concurrency must prevent it from exhausting API resources.

---

# 152. Future Dedicated Media Worker

Can move media jobs onto:

```text
separate process/machine
```

without changing Media domain.

---

# 153. Scheduled Jobs

Examples:

```text
Expire reservations

Send due notifications

Reconcile payments

Reconcile courier statuses

Mark stale operations

Generate inventory snapshots

Cleanup orphan uploads

Backup verification reminders
```

---

# 154. Scheduled Job Definition

Persistent:

```text
job type

next due time

execution identity

retry policy
```

or generated from persistent domain records.

---

# 155. Do Not Depend on In-Memory Timer

Bad:

```text
setTimeout(... 24 hours ...)
```

for business-critical scheduling.

Process restart would lose it.

---

# 156. Scheduled Work Must Be Recoverable

Use database-backed scheduler/job discovery.

---

# 157. Scheduler Concurrency

When horizontal workers arrive:

```text
one scheduled occurrence
```

must not be enqueued 5 times accidentally.

---

# 158. Clock Abstraction

Domain/application code should use injected:

```text
Clock
```

rather than scattered direct system-time reads.

Benefits:

```text
testing

time-zone clarity

deterministic workflows
```

---

# 159. Time Storage

Store absolute timestamps.

Domain Settings defines business timezone for interpretation.

---

# 160. Analytics Architecture

V1 analytics lives inside same PostgreSQL cluster using:

```text
purpose-built projection tables

aggregates

snapshots
```

---

# 161. Analytics Worker

Updates projections asynchronously from:

```text
domain events

source reconciliation jobs
```

---

# 162. Analytics Failure

Does not fail Order creation.

---

# 163. Heavy Analytics

Avoid huge live joins on request.

Use:

```text
preaggregation

indexes

background refresh
```

---

# 164. Future Read Replica

When reporting workload grows:

```text
Analytics
→ PostgreSQL read replica
```

can reduce primary read pressure.

---

# 165. Future Warehouse

Dedicated warehouse becomes justified only when:

```text
data volume

complex reporting

external datasets

long analytical scans
```

warrant it.

---

# 166. Configuration Cache

Typed Settings can be cached because reads are frequent.

---

# 167. Configuration Version

Cache uses:

```text
organization configuration version
```

or domain-specific version.

---

# 168. Configuration Change

Emits event:

```text
configuration.changed
```

to invalidate relevant caches.

---

# 169. Security-Critical Config

Examples:

```text
Payment Method Disabled

Membership Disabled

MFA Policy
```

must converge rapidly.

---

# 170. API Process Should Be Stateless Where Possible

Meaning business state lives in:

```text
PostgreSQL

Object Storage
```

not process memory.

---

# 171. Why?

Horizontal scale later becomes straightforward:

```text
API-1
API-2
API-3
```

can receive requests interchangeably.

---

# 172. Acceptable In-Memory State

Examples:

```text
small caches

compiled templates

connection pools
```

but loss must be harmless.

---

# 173. Session State

If sessions are server-side, store in:

```text
durable/shared backing store
```

such as PostgreSQL initially.

Redis may later accelerate session access if needed.

---

# 174. Admin Login Must Survive API Restart

Process restart should not randomly log every user out unless explicitly intended.

---

# 175. Storefront Cart

Architecture options:

```text
database-backed anonymous cart

signed lightweight cart ID + DB cart
```

Recommended:

```text
server-side Cart record
+
secure cart identifier
```

because cart has:

```text
promotions

customer context

checkout transitions
```

---

# 176. Cart Is Not Inventory Reservation

Already established.

---

# 177. Cart Expiration

Scheduled cleanup can archive/delete abandoned carts after policy.

---

# 178. Deployment Environments

At minimum:

```text
Development

Staging

Production
```

---

# 179. Development

Local Docker dependencies where practical.

Developers run:

```text
Storefront

Admin

API

Worker

PostgreSQL
```

with local/test configuration.

---

# 180. Staging

Should resemble production architecture closely enough to validate:

```text
migrations

containers

provider sandbox

workers

webhooks

security configuration
```

---

# 181. Production

Separate:

```text
database

storage

secrets

provider accounts

domains
```

---

# 182. Environment Safety

Staging must not:

```text
send real courier deliveries

charge real payments

message real customers
```

without deliberate test configuration.

---

# 183. CI Pipeline

Recommended stages:

```text
Install

Lint

Type Check

Unit Tests

Architecture/Boundary Tests

Integration Tests

Build

Security Scans
```

---

# 184. Pull Request Gate

Code should not merge when:

```text
tests fail

type checking fails

critical security check fails
```

---

# 185. Build Once

Production artifacts should come from trusted CI build rather than manually changing files on VPS.

---

# 186. Image Tagging

Docker image:

```text
commit SHA

release version
```

rather than ambiguous:

```text
latest
```

as only production identifier.

---

# 187. Deployment Process

Conceptually:

```text
CI Builds Images

Push Artifacts

VPS Pulls Release

Run Pre-Deployment Validation

Run Safe Migrations

Restart/Replace Services

Run Health Checks

Verify
```

---

# 188. No SSH-and-Edit Production Source

Avoid:

```text
nano file.ts
npm install
```

directly on production server as normal workflow.

---

# 189. Deployment Audit

Record:

```text
version

commit

deployed by

migration version

timestamp

result
```

---

# 190. Graceful Shutdown

API/worker must handle termination signal.

---

# 191. API Graceful Shutdown

Sequence:

```text
stop accepting new requests

finish bounded in-flight requests

close server

close DB pool
```

---

# 192. Worker Graceful Shutdown

Sequence:

```text
stop claiming jobs

finish/return current leases safely

close connections

exit
```

---

# 193. Do Not Lose Claimed Job

If shutdown interrupts job:

```text
lease expires
→ another worker retries
```

---

# 194. Health Endpoints

Separate:

```text
Liveness

Readiness
```

---

# 195. Liveness

Answers:

```text
Is process functioning?
```

---

# 196. Readiness

Answers:

```text
Can this instance currently serve work?
```

May check:

```text
database connectivity

critical initialization
```

---

# 197. Do Not Make Health Check Too Heavy

Health endpoint should not perform expensive domain operations every few seconds.

---

# 198. Dependency Failure

Example database unavailable:

```text
API not ready
```

rather than accepting commands it cannot commit.

---

# 199. Object Storage Down

Depending endpoint:

```text
Catalog reads continue

Media uploads fail gracefully
```

---

# 200. Email Provider Down

API remains ready.

Notification worker shows degraded external provider health.

---

# 201. Observability

Three pillars:

```text
Logs

Metrics

Traces/Correlation
```

---

# 202. Structured Logging

JSON structured production logs preferred.

Include:

```text
timestamp

level

service

request_id

organization_id where safe

actor_id where safe

operation

duration

outcome
```

---

# 203. Do Not Log Secrets

As Security Architecture established.

---

# 204. Logging Levels

```text
DEBUG

INFO

WARN

ERROR
```

Production debug logging should not normally be continuously verbose.

---

# 205. API Metrics

Track:

```text
Request Count

Latency

5xx

4xx

Rate Limits

Active Requests
```

---

# 206. Worker Metrics

Track:

```text
Queue Depth

Jobs Processed

Failures

Retries

Oldest Pending Age

Job Duration
```

---

# 207. Database Metrics

Track:

```text
Connections

Slow Queries

Transaction duration

Lock waits

Deadlocks

Disk usage

Replication lag future
```

---

# 208. Business-System Health

Track:

```text
Outbox backlog

Webhook failures

Notification failures

Media failures

Analytics freshness

Integration exceptions
```

---

# 209. Request Correlation

One Order request may produce:

```text
API request

database transaction

outbox event

notification job

webhook job
```

Correlation IDs make debugging possible across the flow.

---

# 210. Distributed Tracing

Not mandatory V1.

But instrumentation context should be ready for OpenTelemetry-style tracing later.

---

# 211. Error Tracking

Central error aggregation strongly recommended.

But provider/tool choice is implementation/deployment ADR.

---

# 212. Alerting

Alert on symptoms requiring human attention.

Examples:

```text
API unavailable

Database nearly full

Backup failed

Outbox stuck

Critical job dead-lettered

Webhook failures spike

Disk usage critical
```

---

# 213. Avoid Alert Noise

Do not page operators for:

```text
one customer typed wrong coupon.
```

---

# 214. Disk Management

Single VPS has important risk:

```text
logs

database

Docker images

temporary exports

media
```

can fill disk.

---

# 215. Disk Alerts

Monitor:

```text
percentage used

database volume

Docker storage

temporary files
```

---

# 216. Log Rotation

Mandatory.

A forgotten log file must not fill production disk.

---

# 217. Temporary Files

Generated exports/import staging must be cleaned through policy.

---

# 218. PostgreSQL Backup

Production database needs automated scheduled backup.

---

# 219. Backup Strategy

At minimum:

```text
regular logical/physical backup

off-VPS copy

retention policy

restore test
```

Exact RPO/RTO belongs Operations doc.

---

# 220. Backup Is Not Complete Until Restore Is Tested

Already established in Security.

---

# 221. Object Storage Backup

Critical originals/business documents need suitable durability/backup policy independently from PostgreSQL.

---

# 222. Configuration Backup

Infrastructure configuration needed to rebuild system must also be preserved securely:

```text
Compose

reverse proxy configuration

deployment scripts

environment templates
```

not secrets in plain repository.

---

# 223. Disaster Recovery Goal

We should be able to rebuild a replacement VPS from:

```text
source repository

container artifacts

database backup

object storage

secret/configuration records
```

without reconstructing production manually from memory.

---

# 224. Infrastructure as Code Foundation

Even with one VPS:

```text
deployment configuration

compose configuration

proxy configuration

backup scripts
```

must live as versioned code where safe.

---

# 225. Secrets Are Injected Separately

Repository contains:

```text
.env.example
```

not production:

```text
.env
```

---

# 226. One-VPS Failure Domain

Important reality:

If the single VPS dies:

```text
Storefront

Admin

API

Worker

Database
```

may all become unavailable.

---

# 227. Why Accept This?

V1 prioritizes:

```text
cost efficiency

operational simplicity

fast development
```

while protecting data using:

```text
off-server backups

external object storage where possible

rebuildable deployment
```

---

# 228. One VPS Is Not High Availability

Do not label it HA.

The architecture is **recoverable**, not continuously available under total host failure.

---

# 229. Scaling Trigger

Do not scale because:

```text
microservices sound professional.
```

Scale when telemetry shows:

```text
CPU pressure

memory pressure

database pressure

latency

worker backlog

availability requirements
```

---

# 230. First Scaling Step

Usually:

```text
increase VPS resources
```

before increasing infrastructure complexity.

---

# 231. Second Scaling Step

Separate PostgreSQL from application host.

Topology:

```text
Load Balancer / Proxy
        │
   ┌────┴────┐
   ▼         ▼
 App       Worker
        │
        ▼
Dedicated PostgreSQL
```

---

# 232. Why Database Separation Early in Scale?

It creates independent:

```text
CPU

memory

disk I/O

backup
```

failure/resource domain.

---

# 233. Third Scaling Step

Run multiple API/Next instances:

```text
Load Balancer
     │
 ┌───┼───┐
 API API API
```

---

# 234. Prerequisite for Horizontal API Scale

Ensure:

```text
no critical local-process state

shared sessions

shared/coordinate cache

shared object storage

database-backed idempotency
```

---

# 235. Next.js Multi-Instance Scaling

Current Next.js guidance specifically notes shared-cache/coordination considerations when running multiple instances.

---

# 236. Worker Scale

Workers horizontally scale by:

```text
job claiming

leases

idempotency
```

---

# 237. Separate Worker Pools

Potential:

```text
worker-critical

worker-notifications

worker-media

worker-analytics
```

---

# 238. Search Scale

When PostgreSQL search becomes bottleneck:

```text
SearchPort
→ Dedicated Search Cluster
```

---

# 239. Analytics Scale

When analytical workload becomes too heavy:

```text
Read Replica
```

then potentially:

```text
Dedicated Warehouse
```

---

# 240. Cache Scale

Redis may be introduced/shared when:

```text
multi-instance caching

rate-limit coordination

high-frequency ephemeral data
```

justifies it.

---

# 241. CDN

Add for:

```text
Public images

static JS/CSS

public cacheable Storefront assets
```

as traffic grows.

---

# 242. CDN Is Not Database Cache

Never serve:

```text
customer-specific checkout
```

through uncontrolled public CDN cache.

---

# 243. Microservice Extraction

Only extract a module when evidence demonstrates a separate service materially solves:

```text
independent scaling

separate reliability need

different deployment cadence

special technology requirement

team ownership boundary
```

---

# 244. Candidate Future Extraction

Potentially:

```text
Media Processing

Search

Notifications

Analytics
```

before core:

```text
Orders

Inventory

Payments
```

because transactional coupling is lower.

---

# 245. Core Commerce Extraction Is Expensive

Separating:

```text
Order
Inventory
Promotion
Payment
```

into independent services introduces:

```text
distributed consistency

network failures

sagas

cross-service transactions
```

Do not do it without reason.

---

# 246. Domain Interfaces Prepare Us Anyway

The modular monolith already exposes application interfaces.

Extraction replaces:

```text
in-process adapter
```

with:

```text
remote adapter
```

only when needed.

---

# 247. Failure Isolation

Architecture should classify dependencies:

### Tier 1 — Transaction Critical

```text
PostgreSQL

API process
```

### Tier 2 — Commerce Experience Important

```text
Storefront

Admin

Object Storage for media-heavy operations
```

### Tier 3 — Async/Degradable

```text
Email

Webhooks

Analytics

External Courier

Search projection in some fallback cases
```

---

# 248. PostgreSQL Failure

Commands requiring database:

```text
fail closed
```

Storefront may temporarily serve already cached public content, but:

```text
Checkout
Order placement
Admin mutations
```

cannot succeed.

---

# 249. Worker Failure

Core synchronous commerce remains operational.

Backlogs accumulate.

Alert if:

```text
oldest job age
```

exceeds threshold.

---

# 250. Search Failure

Possible fallback:

```text
basic category/product navigation
```

while search endpoint shows temporary failure.

Do not make checkout dependent on Search.

---

# 251. Analytics Failure

Admin operational pages continue.

Dashboard can show:

```text
Analytics temporarily unavailable
```

---

# 252. Notification Failure

Orders/Payments continue.

Delivery retries.

---

# 253. Courier Failure

Orders can continue according to operational policy.

Delivery booking remains:

```text
PENDING_EXTERNAL_CREATION
```

for repair/retry.

---

# 254. Payment Gateway Failure Future

Other enabled payment methods can continue.

Do not make COD unavailable because gateway API is offline.

---

# 255. Object Storage Failure

Product pages may still use CDN-cached images.

New uploads fail safely.

---

# 256. Graceful Degradation

Each optional dependency should document:

```text
What stops?

What continues?

What queues?

What alerts?

How does recovery happen?
```

---

# 257. Deployment Compatibility

App release and DB schema need compatibility window.

---

# 258. Safe Deployment Pattern

```text
Schema expansion

Deploy compatible app

Backfill if needed

Activate new feature

Cleanup later
```

---

# 259. Zero-Downtime Goal

V1 should aim for:

```text
minimal downtime
```

rather than promise mathematically zero downtime from a single-host architecture.

---

# 260. Rolling Deploy Future

Multiple instances enable:

```text
old instance

new instance
```

overlap during deployments.

---

# 261. API Version During Deployment

Both app versions must tolerate migration transition when rolling.

---

# 262. Feature Flags for Deployments

Useful for:

```text
release control
```

not permanent business logic.

---

# 263. Database Seed Data

Separate:

```text
system reference seed
```

from:

```text
demo business data.
```

Production should not accidentally create fake Orders/Customers.

---

# 264. Development Seed

Can create:

```text
synthetic products

customers

orders

inventory
```

for development/test.

---

# 265. Test Database

Automated integration tests require isolated database.

---

# 266. Parallel Tests

Use:

```text
transaction rollback

separate schema/database

unique organization fixture
```

as appropriate.

---

# 267. Clock and IDs in Tests

Fake:

```text
Clock

ID generator
```

where deterministic tests benefit.

---

# 268. Provider Testing

External providers use adapters and fakes.

Example:

```text
FakeCourierProvider

FakePaymentGateway

FakeEmailProvider
```

---

# 269. Contract Tests

Real provider adapters need sandbox/fixture-based contract tests where possible.

---

# 270. Test Layers

```text
Unit

Domain

Application

Database integration

API contract

Provider adapter

E2E

Load

Security

Recovery
```

---

# 271. Domain Tests

No database required for pure rules where practical.

---

# 272. Database Integration Tests

Required for:

```text
constraints

transactions

locking

concurrency

migration behavior
```

---

# 273. Concurrency Tests

Mandatory for:

```text
Inventory reservations

Promotion usage

Order idempotency

Refund idempotency

Number sequences

Customer merge

Job claiming
```

---

# 274. Stress Tests

Later full stress-test phase must include:

```text
100 checkout requests for final item

100 duplicate payment callbacks

50 workers claiming same jobs

large import crash/restart

DB restart during worker processing
```

---

# 275. Load Tests

Focus real user paths:

```text
Homepage

Category

Product

Search

Cart

Checkout

Order placement

Admin Order List
```

---

# 276. Performance Budget

Set measurable targets later for:

```text
P50

P95

P99

first load

API response

checkout
```

rather than vague:

```text
fast
```

---

# 277. Storefront Performance

Priorities:

```text
small client JS where possible

server rendering

image optimization

cache public data

avoid sequential waterfalls

avoid unnecessary client components
```

---

# 278. Admin Performance

Priorities:

```text
paginated tables

server filtering

virtualization only when needed

lazy heavy panels

batched API queries
```

---

# 279. Next.js Server Components

Storefront/Admin can use server-rendered data paths where useful.

But server components call:

```text
backend API/application boundary
```

rather than accessing domain database directly.

---

# 280. Critical Boundary

Forbidden:

```text
apps/storefront
→ PostgreSQL directly
```

Required:

```text
apps/storefront
→ API
→ Application
→ Domain
```

---

# 281. Why?

Direct DB access from Next.js would undermine:

```text
API-first architecture

authorization

domain commands

future mobile clients

integration contracts
```

---

# 282. Internal Server-to-API Network

When Next.js server performs SSR:

```text
Storefront server
→ private API endpoint
```

can avoid public round trip.

---

# 283. Browser-to-API

Can be routed through same reverse proxy/domain strategy.

Exact BFF/direct-client split determined per screen.

---

# 284. Backend-for-Frontend Use

BFF is appropriate for:

```text
web-specific aggregation

cookie handling

SSR-specific needs
```

but not as another business-rule layer.

---

# 285. Database Access From Worker

Worker should use:

```text
core application services
```

not random ad hoc SQL.

---

# 286. Exception

Infrastructure jobs such as:

```text
projection rebuild

maintenance
```

may use specialized repositories, still within documented ownership.

---

# 287. Architecture Decision Records

Major implementation choices require ADRs.

Examples:

```text
ADR-001 Backend HTTP Framework

ADR-002 ORM / Query Builder

ADR-003 Object Storage Provider

ADR-004 Queue Backend

ADR-005 Authentication Library

ADR-006 Reverse Proxy

ADR-007 Search V1 Implementation

ADR-008 Deployment Pipeline
```

---

# 288. Why ADR?

Architecture docs describe target rules.

ADR explains:

```text
What implementation choice did we make?

Why?

What alternatives were considered?

What tradeoff was accepted?
```

---

# 289. No Technology Choice Without Ownership

Example:

```text
Redis
```

must answer:

```text
What problem?

What data?

What happens if Redis disappears?

Who monitors it?
```

---

# 290. Infrastructure Complexity Budget

Every extra production service has cost:

```text
Configuration

Backup

Monitoring

Security

Upgrades

Failure modes

Developer knowledge
```

---

# 291. Therefore V1 Should Avoid

Unless justified:

```text
Kafka

Kubernetes

Elasticsearch/OpenSearch

multiple databases

service mesh

distributed tracing cluster

microservice gateway
```

---

# 292. V1 Recommended Minimum Services

```text
Reverse Proxy

Storefront

Admin

API

Worker

PostgreSQL

Object Storage
```

---

# 293. Redis Status

```text
OPTIONAL
```

not foundational V1 dependency.

---

# 294. Dedicated Search Status

```text
DEFERRED
```

until PostgreSQL search proves insufficient.

---

# 295. Dedicated Message Broker Status

```text
DEFERRED
```

until PostgreSQL-backed queue/outbox becomes insufficient.

---

# 296. Kubernetes Status

```text
NOT V1
```

---

# 297. Read Replica Status

```text
FUTURE SCALE
```

---

# 298. Multi-Region Status

```text
FUTURE / VERY LATE
```

---

# 299. Recovery Documentation

Production must have runbooks for:

```text
API down

Worker down

Database restart

Disk nearly full

Failed deployment

Bad migration

Object storage outage

Provider outage

Restore database

Rotate secret
```

---

# 300. Operations Runbook Format

Each should define:

```text
Symptoms

Detection

Immediate Actions

Safety Warnings

Recovery

Verification

Escalation

Post-Incident Actions
```

---

# 301. Database Recovery

Never improvise in production under stress.

Document:

```text
restore procedure

backup location

credentials

verification query

application restart order
```

---

# 302. Deployment Rollback

Application image rollback should be easy.

Database rollback requires migration compatibility plan.

---

# 303. Bad Release

Response:

```text
stop rollout

restore prior app image

assess migration compatibility

forward-fix database if necessary
```

---

# 304. Release Version Endpoint

Internal health/build endpoint can expose:

```text
application version

commit

build date

schema compatibility
```

without exposing secrets.

---

# 305. Database Schema Version Health

Application startup can verify supported migration version.

---

# 306. App Too Old for Database

Fail startup rather than operate against incompatible schema.

---

# 307. Background Job Versioning

Danger:

Old job payload queued before deployment.

New worker must understand it.

---

# 308. Job Schema Version

Jobs should include:

```text
job type

payload version
```

for long-lived/delayed jobs.

---

# 309. Webhook Event Version

Already established.

Independent from worker job version.

---

# 310. Media Processing Version

Derived rendition can record:

```text
processor version

preset version
```

so old assets can be regenerated when pipeline improves.

---

# 311. Search Projection Version

When search schema changes:

```text
build new projection

validate

switch
```

rather than breaking live queries.

---

# 312. Analytics Projection Version

Same principle.

---

# 313. Configuration Version

Already established.

---

# 314. Database Partitioning

Do not partition tables initially merely because they might grow.

---

# 315. Future Partition Candidates

Potential:

```text
Audit Events

Inventory Ledger

Outbox History

Notification Delivery

Analytics Events
```

only after size/query evidence.

---

# 316. Data Archival

Archiving old operational data should preserve:

```text
referential history

auditability

reporting
```

---

# 317. Hard Delete

Rare for commercial records.

Prefer domain lifecycle:

```text
ARCHIVED

REMOVED

VOIDED

ANONYMIZED
```

as already defined.

---

# 318. Database Maintenance

Operational plan needs:

```text
VACUUM/auto-vacuum health

index health

statistics

disk growth

slow queries
```

---

# 319. Query Regression

A harmless-looking feature can create:

```text
full table scan
```

after data grows.

Performance monitoring catches this before architecture panic.

---

# 320. Scalability Principle

> **Scale bottlenecks, not guesses.**

Examples:

If:

```text
media CPU high
```

scale media workers.

If:

```text
search latency high
```

scale/extract search.

If:

```text
database I/O high
```

optimize queries/indexes or database resources.

Do not immediately split Orders into microservice.

---

# 321. Capacity Planning

Track:

```text
Orders/day

Order lines/day

Products

Variants

Inventory movements/day

Media GB

API requests/sec

worker jobs/min

DB size growth
```

---

# 322. Growth Thresholds

Thresholds should trigger review, not automatic architectural panic.

---

# 323. V1 Operational Simplicity

A new developer should be able to understand:

```text
where Order logic lives

where Inventory logic lives

how to run locally

how migrations work

how workers run

how to trace an event
```

without learning 15 infrastructure platforms.

---

# 324. Local Development

One command should ideally start required infrastructure.

Example conceptually:

```text
docker compose up -d postgres
pnpm dev
```

or equivalent developer workflow.

---

# 325. Developer Experience Is Architecture

If local setup is painful:

```text
tests skipped

workers ignored

migrations diverge
```

which becomes production risk.

---

# 326. Seeded Development Organization

Development can create:

```text
Maevelle Demo
```

with synthetic data.

Never automatically seed production.

---

# 327. Documentation Linkage

Every module should link to:

```text
docs/domains/<domain>/
```

and implementation ADRs.

---

# 328. Source-of-Truth Hierarchy

Recommended:

```text
Domain Architecture
        ↓
Technical Architecture
        ↓
ADR
        ↓
Database Schema
        ↓
API Contract
        ↓
Implementation
        ↓
Tests
```

---

# 329. If Code Conflicts With Architecture

Either:

```text
code is wrong
```

or:

```text
architecture decision changed
```

If decision changed:

```text
update docs + ADR
```

rather than silently drifting.

---

# 330. Technical Invariants

### TECH-INV-001

Maevelle begins as a modular monolith.

### TECH-INV-002

Domain modules communicate through published application interfaces rather than each other's persistence internals.

### TECH-INV-003

The Storefront and Admin applications do not directly access transactional database tables.

### TECH-INV-004

The core business API is independent from Next.js rendering/runtime concerns.

### TECH-INV-005

PostgreSQL is the authoritative transactional datastore.

### TECH-INV-006

Redis, cache, search indexes and analytical projections never become transactional authority.

### TECH-INV-007

Critical multi-domain mutations use explicit database transaction boundaries.

### TECH-INV-008

External network calls do not remain inside long-lived critical PostgreSQL transactions.

### TECH-INV-009

Critical concurrency guarantees use database constraints, locking/versioning and idempotency rather than frontend assumptions.

### TECH-INV-010

Every production process uses bounded database connections.

### TECH-INV-011

Database migrations are version-controlled and deployable reproducibly.

### TECH-INV-012

Dangerous schema evolution uses staged migration rather than destructive one-step changes where practical.

### TECH-INV-013

User-generated binary media is stored outside normal PostgreSQL relational rows.

### TECH-INV-014

Container/local application filesystem is not authoritative user-media storage.

### TECH-INV-015

The transactional outbox is written atomically with relevant business transactions.

### TECH-INV-016

Async consumers are independently retryable and idempotent.

### TECH-INV-017

One failing async consumer cannot prevent other consumers processing the same domain event.

### TECH-INV-018

Background jobs have durable state for business-critical processing.

### TECH-INV-019

A crashed worker cannot permanently lose a claimed critical job.

### TECH-INV-020

Scheduled business work is based on durable state rather than in-memory timers.

### TECH-INV-021

Search is a rebuildable projection of authoritative Catalog data.

### TECH-INV-022

Analytics is a rebuildable projection of source transactional data.

### TECH-INV-023

Cache loss cannot cause loss of committed business data.

### TECH-INV-024

External provider outages are isolated from unrelated domain operations.

### TECH-INV-025

Production services expose health information sufficient for automated/operator diagnosis.

### TECH-INV-026

Every deployed release is identifiable by a stable application/build version.

### TECH-INV-027

Production infrastructure configuration is reproducible rather than existing only as undocumented manual server state.

### TECH-INV-028

Production and non-production data/configuration remain separated.

### TECH-INV-029

Database and private infrastructure services are not intentionally exposed to the public internet.

### TECH-INV-030

Backups are stored outside the primary VPS failure domain.

### TECH-INV-031

A backup is not treated as reliable until restore procedures are tested.

### TECH-INV-032

Horizontal application scaling does not depend on local process state.

### TECH-INV-033

Next.js multi-instance deployment cannot rely on isolated per-instance cache state where consistent revalidation is required.

### TECH-INV-034

No new infrastructure service is introduced without a defined operational purpose and failure policy.

### TECH-INV-035

Microservice extraction requires evidence rather than anticipation.

---

# 331. V1 Mandatory Technical Scope

Maevelle V1 should include:

```text
✓ TypeScript

✓ Node.js

✓ Next.js Storefront

✓ Next.js Admin

✓ Standalone API application

✓ Background Worker application

✓ Monorepo

✓ Modular-monolith Core

✓ Domain boundary enforcement

✓ PostgreSQL

✓ Database migrations

✓ Transactions

✓ Database constraints

✓ Concurrency handling

✓ Idempotency infrastructure

✓ Object Storage abstraction

✓ Private/Public Media delivery architecture

✓ PostgreSQL-backed transactional Outbox

✓ Durable job infrastructure

✓ Job retries

✓ Dead-letter handling

✓ Scheduled-job infrastructure

✓ PostgreSQL-backed Catalog search

✓ Search projection

✓ Search rebuild

✓ Analytics projections

✓ Analytics workers

✓ Configuration cache

✓ Dockerized deployment

✓ Docker Compose V1 production topology

✓ Reverse proxy

✓ TLS

✓ Health checks

✓ Graceful shutdown

✓ Structured logging

✓ Request IDs

✓ Correlation IDs

✓ Application metrics

✓ Worker metrics

✓ PostgreSQL monitoring

✓ Integration health

✓ Disk monitoring

✓ Automated PostgreSQL backups

✓ Off-VPS backups

✓ Object-storage backup/durability policy

✓ Restore procedure

✓ Development/Staging/Production separation

✓ CI pipeline

✓ Automated tests

✓ Migration checks

✓ Security scanning foundation

✓ Reproducible releases

✓ Deployment documentation

✓ Operations runbooks
```

---

# 332. Strongly Preferred V1

```text
pg_stat_statements monitoring

Central error tracking

Deployment audit

Database slow-query monitoring

Queue health dashboard

Outbox health dashboard

Automated backup verification

Restore drill

Search projection health

Analytics freshness health

Media-processing health

Provider circuit-breaker behavior

Worker priority classes

Architecture dependency tests

Generated OpenAPI contract checks

Staging provider safety controls

Performance/load testing baseline
```

---

# 333. Explicitly Not Required for Initial Production

```text
Kafka

Kubernetes

Microservices

Service Mesh

Elasticsearch/OpenSearch

Dedicated Data Warehouse

Redis as mandatory dependency

Multi-primary PostgreSQL

Database sharding

Multi-region deployment

Serverless rewrite

Complex orchestration platform
```

---

# 334. Phase 1 Production Topology

```text
                       INTERNET
                          │
                          ▼
                   Reverse Proxy
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
 STORE­FRONT            ADMIN               API
 Next.js               Next.js           Node.js
                                              │
                         ┌────────────────────┤
                         │                    │
                         ▼                    ▼
                    PostgreSQL             Worker
                                              │
                           ┌──────────────────┼──────────────────┐
                           ▼                  ▼                  ▼
                      Object Store       Providers          Webhooks
```

All app processes may physically reside on:

```text
ONE VPS
```

while durable backups/storage extend beyond its failure boundary.

---

# 335. Phase 2 Scaling

When application host becomes constrained:

```text
                     Reverse Proxy
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
         Application VPS          Worker VPS
              │                       │
              └───────────┬───────────┘
                          ▼
                 Dedicated PostgreSQL
```

---

# 336. Phase 3 Scaling

```text
                       Load Balancer
                 ┌────────┼────────┐
                 ▼        ▼        ▼
               App 1    App 2    App 3
                 │        │        │
                 └────────┼────────┘
                          ▼
                Dedicated PostgreSQL
                          │
               ┌──────────┼──────────┐
               ▼          ▼          ▼
            Workers     Search     Cache
```

---

# 337. Phase 4

Only if justified:

```text
Primary PostgreSQL
      │
      ├── Read Replica
      │
      └── Analytics Pipeline
              │
              ▼
        Analytics Store

Dedicated Search

Dedicated Worker Pools

CDN
```

---

# 338. Phase 5 / Large Platform

Selective service extraction only after evidence.

Potential:

```text
Media Service

Notification Service

Search Service

Analytics Platform
```

while core commercial domains may remain tightly coordinated longer.

---

# 339. Failure Scenario — API Crashes Mid-Order

If transaction not committed:

```text
rollback
```

Client retries using Idempotency Key.

If transaction committed but response lost:

```text
retry returns existing Order result.
```

---

# 340. Failure Scenario — Worker Crashes

Claimed job eventually becomes available again.

Job handler is idempotent.

---

# 341. Failure Scenario — Outbox Dispatcher Dies

Business events remain:

```text
UNPROCESSED
```

in PostgreSQL.

After restart:

```text
dispatcher catches up.
```

---

# 342. Failure Scenario — Notification Provider Down for Six Hours

```text
Orders continue

Notification jobs retry

Queue grows

Alert triggers

Provider recovers

queue drains
```

---

# 343. Failure Scenario — Analytics Code Bug

```text
Transactional data safe

projection marked unhealthy

fix deployed

projection rebuilt
```

---

# 344. Failure Scenario — Search Projection Corrupted

```text
Catalog safe

search projection cleared

rebuild from Catalog
```

---

# 345. Failure Scenario — Redis Completely Lost

If Redis exists:

```text
cache lost

ephemeral state reconstructed
```

No:

```text
Order

Payment

Inventory ledger

Outbox
```

lost.

---

# 346. Failure Scenario — PostgreSQL Unavailable

```text
Mutations stop

Checkout finalization unavailable

Workers requiring DB pause

Public cached pages may remain available
```

Never accept:

```text
fake offline Orders
```

unless a separately designed offline-order architecture exists.

---

# 347. Failure Scenario — VPS Dies

```text
Application unavailable
```

Recovery:

```text
Provision replacement VPS

Deploy known release

Restore PostgreSQL backup

Reconnect object storage

Inject secrets

Run migrations/verification

Restore services
```

---

# 348. Failure Scenario — Disk Fills

Potential consequences:

```text
PostgreSQL writes fail

logs fail

containers fail
```

Therefore:

```text
disk monitoring

log rotation

off-server media

temporary-file cleanup
```

are mandatory operational safeguards.

---

# 349. Failure Scenario — Bad Migration

Recovery uses:

```text
stop release

assess transaction state

restore/forward repair

deploy compatible app

run integrity checks
```

not panic-editing database manually.

---

# 350. Failure Scenario — External Courier Times Out

```text
local Order remains

integration operation becomes uncertain/retryable

provider reconciliation runs
```

No duplicate booking without checking external outcome.

---

# 351. Failure Scenario — Search Traffic Explodes

Scale/optimize:

```text
Search projection

indexes

cache

dedicated search
```

rather than scaling transactional Order logic unnecessarily.

---

# 352. Failure Scenario — Analytics Report Overloads DB

Move:

```text
live joins
→ projections
→ replica later
```

and constrain report query complexity.

---

# 353. Failure Scenario — 10 Workers Start Simultaneously

Job claiming ensures:

```text
one worker processes one job lease
```

while other workers claim different jobs.

---

# 354. Failure Scenario — Same Job Runs Twice Anyway

Handlers remain:

```text
idempotent
```

because at-least-once processing means duplicate execution must always be considered.

---

# 355. Architectural Result

Our complete application now has three clearly different layers:

```text
PRESENTATION
Storefront / Admin
        │
        ▼
APPLICATION & DOMAIN
Commands / Queries / Business Rules
        │
        ▼
INFRASTRUCTURE
PostgreSQL / Storage / Workers / Providers
```

---

# 356. Complete Request Path

Example Product page:

```text
Customer
   ↓
Reverse Proxy
   ↓
Next.js Storefront
   ↓
Storefront API
   ↓
Catalog Query Service
   ↓
Catalog / Search Projection
   ↓
Response
   ↓
SSR / UI
```

---

# 357. Complete Checkout Path

```text
Customer
   ↓
Storefront
   ↓
Checkout API
   ↓
Application Service
   │
   ├── Customer
   ├── Pricing
   ├── Promotions
   ├── Inventory
   ├── Orders
   └── Payments
   ↓
PostgreSQL Transaction
   │
   ├── Order
   ├── Reservation
   ├── Promotion Usage
   ├── Payment Intent
   └── Outbox
   ↓
COMMIT
   ↓
Customer Response
```

Async:

```text
Outbox
  ├── Notifications
  ├── Analytics
  ├── Webhooks
  └── Integrations
```

---

# 358. Complete Procurement Path

```text
Supplier
   ↓
Purchase
   ↓
Inbound Shipment
   ↓
Shipment Expenses
   ↓
Landed Cost
   ↓
Receipt
   ↓
Inventory Ledger
   ↓
Analytics Projection
```

All stays within one transactional platform without relying on spreadsheet truth.

---

# 359. Architecture Decision Summary

We have now established:

```text
Modular Monolith              YES

Monorepo                      YES

Separate Storefront           YES

Separate Admin                YES

Standalone API                YES

Worker Process                YES

PostgreSQL Primary            YES

Object Storage                YES

Transactional Outbox          YES

Durable Jobs                  YES

PostgreSQL Search V1          YES

PostgreSQL Analytics V1       YES

Redis Required V1             NO

Dedicated Search Required     NO

Kafka Required                NO

Kubernetes Required           NO

Microservices Required        NO

Single VPS Initial Deploy     YES

Scale-Out Path                YES
```

---

# 360. Recommended Next Document

The next stage is now **Database & Data Model Architecture**:

```text
docs/architecture/database-data-model-architecture.md
```

This is where we finally turn all previous architecture into actual relational structures.

It should define:

```text
Organization / tenancy columns

IDs

Primary keys

Foreign keys

Natural keys

Human numbers

Money representation

Currency representation

Timestamps

Soft deletion / archive rules

Version columns

Audit fields

Catalog tables

Variant tables

Option tables

Attribute tables

Category hierarchy

Color model

Sizing tables

Media tables

Inventory Items

Inventory Levels

Inventory Ledger

Reservations

Transfers

Stocktakes

Suppliers

Purchases

Purchase Lines

Supplier Invoices

Supplier Payments

Inbound Shipments

Shipment Allocations

Shipment Legs

Receipts

Landed Cost Worksheets

Cost Components

Cost Allocations

Orders

Order Lines

Order snapshots

Fulfillments

Payments

Payment Attempts

Allocations

Refunds

Settlements

Customers

Phones

Emails

Addresses

Customer merges

Access Control

Finance

Cash Movements

Reviews

Promotions

Notifications

Analytics projections

Settings

Integrations

Outbox

Jobs

Idempotency Records

Webhook Events

Audit Events
```

But unlike ordinary schema design, we should not simply produce hundreds of tables.

We need to decide:

```text
Aggregate boundaries

Transaction boundaries

FK direction

Uniqueness

Org-safe relationships

Indexes

Check constraints

Concurrency columns

Ledger modeling

Snapshot strategy

JSON vs normalized relational data

Versioning

High-volume tables

Deletion behavior

Partition readiness

Migration safety
```

and then perform **cross-domain schema stress tests** before calling it final.

One particularly important question we should resolve there is the refinement already discovered earlier:

```text
Purchase Receipt
```

versus the more general:

```text
Inbound Receipt
```

because one consolidated physical shipment can contain items from multiple Purchases and Suppliers. That schema stage is the correct time to settle the canonical receiving model.

At that point, the focused skills.sh recommendation becomes especially useful: **`postgresql-table-design`** should be brought in while designing the schema, followed later by PostgreSQL code-review/SQL-optimization skills during implementation. The Vercel React/composition skills become useful in parallel when we start the Storefront/Admin implementation.

---

**End of System & Technical Architecture v0.1**
