# Maevelle Ecommerce — Execution Playbook

**Document:** `docs/implementation/execution-playbook.md`
**Status:** Historical phase execution reference
**Version:** 0.1
**Audience:** Owner, human developers, AI coding agents, reviewers
**Purpose:** Tell contributors exactly where to start, what to read, what to build next, and when they may proceed.

---

# 1. Purpose

This document preserves the original phase-oriented execution method.

Current product development starts at:

```text
docs/product-completion/README.md
docs/product-completion/state.json
docs/product-completion/current-focus.md
```

The Product Completion tracker supersedes phase and launch sequencing when
choosing work. This playbook remains useful for architecture, testing, and
vertical-slice implementation practices.

It does not replace:

```text
docs/implementation/implementation-roadmap.md
```

The Implementation Roadmap defines:

```text
what gets built
dependency order
phase requirements
phase exit gates
```

This Execution Playbook defines:

```text
how to begin work today
which documents to read
how to choose the next task
what files/modules may be touched
what tests are required
when a task is done
when the next task may begin
```

---

# 2. Start Here

Any developer or AI agent joining Maevelle should begin with this document.

Do **not** begin by randomly browsing the repository and implementing whatever looks unfinished.

The correct flow is:

```text
execution-playbook.md
        ↓
check current phase
        ↓
check current milestone
        ↓
select next approved task
        ↓
read task-specific source-of-truth docs
        ↓
implement
        ↓
test
        ↓
verify exit criteria
        ↓
update implementation status
        ↓
take next task
```

---

# 3. Documentation Hierarchy

When documents appear to conflict, use this order:

```text
1. Security / business invariants

2. Domain architecture
   docs/domains/

3. Cross-domain/system architecture
   docs/architecture/

4. Technical ADRs
   docs/adr/

5. PostgreSQL schema specification
   docs/architecture/postgresql-schema-specification.md

6. Implementation roadmap
   docs/implementation/implementation-roadmap.md

7. Execution playbook
   docs/implementation/execution-playbook.md

8. Current implementation task

9. Existing code convenience
```

Code does not overrule architecture simply because it already exists.

---

# 4. Documents You Do NOT Read Every Time

Contributors do not need to read the entire documentation repository for every task.

Use **task-scoped reading**.

Example:

Inventory Reservation task:

```text
READ:
- execution-playbook.md
- implementation-roadmap.md relevant phase
- inventory architecture
- application service architecture
- PostgreSQL schema relevant section
- testing master plan relevant sections
```

Do not read:

```text
Reviews
CMS future ideas
Analytics
Finance
```

unless the task actually interacts with them.

---

# 5. Mandatory Reading for Every Contributor

Before the first contribution:

```text
docs/implementation/execution-playbook.md

docs/implementation/implementation-roadmap.md

docs/architecture/system-technical-architecture.md

docs/quality/testing-master-plan.md
```

Then read relevant ADRs and domain documents for the assigned task.

---

# 6. Current Technical Stack

Approved implementation foundation:

```text
Node.js 24 LTS

TypeScript

pnpm

Next.js

React

Fastify 5

TypeBox

Kysely

PostgreSQL 18+

Better Auth

Cloudflare R2 / S3-compatible storage

PostgreSQL-backed jobs

Caddy

PostgreSQL FTS + pg_trgm

Pino

OpenTelemetry

Docker / Docker Compose

GitHub Actions

GHCR
```

Do not introduce substitutes without an ADR change.

---

# 7. Project Structure

Target:

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
  initial/
  domains/
  architecture/
  product/
  quality/
  operations/
  implementation/
  adr/

infrastructure/
scripts/
```

---

# 8. Architectural Boundaries

The following are forbidden:

```text
Storefront → PostgreSQL

Admin → PostgreSQL

Domain → Fastify

Domain → Next.js

Domain → provider SDK

Orders → Inventory repository implementation

Payments → Orders tables directly

Analytics → transactional mutations
```

Correct:

```text
UI
→ API
→ Application service
→ Published module interfaces
→ Repository
→ PostgreSQL
```

---

# 9. Working Mode

Maevelle uses:

> **Vertical slices with foundation-first sequencing.**

Do not build entire horizontal layers independently.

Bad:

```text
build all tables
then all repositories
then all APIs
then all UI
then all tests
```

Preferred:

```text
one business capability
    ↓
schema
domain
application
API
authorization
UI if required
tests
observability
    ↓
complete
```

---

# 10. Current Project Entry Phase

Initial implementation begins at:

```text
PHASE 1
Repository & Engineering Foundation
```

after accepted ADRs and schema reconciliation.

---

# 11. Immediate Execution Queue

The following is the initial ordered task list.

Do not reorder without a concrete dependency reason.

---

# TASK 001 — Repository Bootstrap

## Goal

Create the monorepo foundation.

## Create

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json

apps/
packages/
docs/
infrastructure/
scripts/
```

## Required Apps

```text
apps/storefront
apps/admin
apps/api
apps/worker
```

## Required Packages

```text
packages/core
packages/database
packages/contracts
packages/config
packages/observability
packages/security
packages/ui-admin
packages/ui-storefront
packages/testkit
```

## Read

```text
system-technical-architecture.md
blocking technical ADRs
implementation-roadmap.md
```

## Do Not

```text
implement Products

implement Orders

create random domain tables
```

## Done When

```text
pnpm install succeeds

workspace packages resolve

all apps/packages participate in typechecking
```

---

# TASK 002 — Toolchain Baseline

Configure:

```text
TypeScript strict mode

ESLint

formatting

package scripts

Node version

pnpm version

ESM
```

## Required Scripts

Eventually:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Done When

All empty/skeleton apps pass the toolchain.

---

# TASK 003 — Architecture Boundary Enforcement

Add automated import rules.

Must prevent:

```text
storefront → database

admin → database

core/domain → apps

domain → provider implementation
```

## Done When

A deliberately invalid import causes CI/local validation failure.

---

# TASK 004 — Development PostgreSQL

Create PostgreSQL 18 local environment using Docker Compose.

## Required

```text
PostgreSQL 18

persistent development volume

health check

separate test DB strategy
```

## Do Not

Add Redis.

Do not add external search.

## Done When

```text
docker compose up postgres
```

produces healthy PostgreSQL 18.

---

# TASK 005 — Database Package

Implement:

```text
packages/database
```

with:

```text
pg pool

Kysely instance

transaction helpers

migration runner foundation

shutdown lifecycle
```

## Read

```text
ADR-002
postgresql-schema-specification.md
```

## Done When

A test can:

```text
connect
begin transaction
query
rollback
close
```

against real PostgreSQL.

---

# TASK 006 — Configuration Package

Implement:

```text
packages/config
```

with typed validated environment configuration.

Invalid critical configuration:

```text
must fail startup.
```

Never allow scattered:

```text
process.env.X
```

throughout domain/application code.

---

# TASK 007 — Fastify API Skeleton

Create:

```text
apps/api
```

with:

```text
Fastify

TypeBox provider

structured error handling

request IDs

Pino logging

graceful shutdown
```

First route:

```text
GET /health/live
```

Expected:

```text
200
```

without requiring DB.

---

# TASK 008 — API Readiness

Add:

```text
GET /health/ready
```

Readiness checks:

```text
PostgreSQL connectivity

required application initialization
```

Do not include every external provider.

Courier outage should not make core API unready.

---

# TASK 009 — Worker Skeleton

Create:

```text
apps/worker
```

with:

```text
startup

DB connection

heartbeat foundation

graceful shutdown

job handler registry foundation
```

No real business jobs yet.

---

# TASK 010 — Admin Skeleton

Create Next.js Admin application.

Initial:

```text
/app
/login placeholder
basic layout
```

No full navigation yet.

---

# TASK 011 — Storefront Skeleton

Create Next.js Storefront.

Initial:

```text
/
basic shell
health/build verification
```

No ecommerce UI yet.

---

# TASK 012 — Observability Foundation

Implement:

```text
packages/observability
```

Initial:

```text
Pino logger

correlation ID

OpenTelemetry initialization foundation
```

No giant observability platform needed locally.

---

# TASK 013 — Security Foundation

Implement:

```text
packages/security
```

with reusable foundation for:

```text
hashing helpers

token generation

constant-time comparison

encryption interface

security headers/config
```

Do not build authentication itself yet.

---

# TASK 014 — Testkit Foundation

Implement:

```text
packages/testkit
```

with:

```text
database test helpers

fake Clock

organization fixture foundation

random deterministic helpers
```

Production code must never import `testkit`.

---

# TASK 015 — Initial CI

GitHub Actions should run:

```text
install

lint

typecheck

unit tests

build
```

Then add PostgreSQL-backed integration tests.

---

# TASK 016 — Docker Application Baseline

Create Dockerfiles/Compose for:

```text
api

worker

admin

storefront

postgres
```

Caddy may be introduced immediately after internal services work.

---

# TASK 017 — Caddy Development/Production Foundation

Configure routing model compatible with:

```text
storefront

admin

api
```

Exact public domains are environment configuration.

---

# TASK 018 — First Migration

Create:

```text
0000_extensions_and_database_baseline
```

Expected:

```text
pg_trgm
pg_stat_statements
```

and PostgreSQL version preflight.

---

# TASK 019 — Migration CI

Prove:

```text
empty PostgreSQL 18
        ↓
run migrations
        ↓
success
```

This becomes permanent CI behavior.

---

# TASK 020 — Platform Core Migration

Implement:

```text
platform.organizations

platform.number_sequences

platform.idempotency_records

configuration foundation
```

according to canonical schema.

---

# TASK 021 — Audit Foundation

Implement:

```text
audit.audit_events
```

before major business modules.

---

# TASK 022 — Outbox / Jobs / Integrity Foundation

Implement:

```text
platform.outbox_events

platform.outbox_consumer_receipts

platform.jobs

platform.integrity_issues

platform.operational_holds
```

---

# TASK 023 — Job Claiming

Implement real:

```text
FOR UPDATE SKIP LOCKED
```

leasing.

Test:

```text
two workers
→ same job
→ only one claims it
```

---

# TASK 024 — Worker Crash Recovery Test

Simulate:

```text
worker claims job
worker dies
lease expires
second worker reclaims
```

Must pass before relying on jobs.

---

# TASK 025 — IAM Migration

Implement Maevelle IAM foundation:

```text
iam.users

iam.organization_memberships

capabilities

permission presets

grants

scopes
```

---

# TASK 026 — Better Auth Reconciliation

At this exact point:

```text
pin Better Auth version
generate/inspect required tables
reconcile with IAM schema
```

Then implement approved:

```text
auth accounts

verification

2FA

auth KV secondary storage

session registry
```

Do not allow library auto-migration in production.

---

# TASK 027 — Authentication

Implement:

```text
login

logout

session

TOTP

recovery codes
```

for internal users.

---

# TASK 028 — Authorization Context

Every Admin API request obtains:

```text
actor

organization

membership

capabilities

scope
```

---

# TASK 029 — Organization Isolation Tests

Create:

```text
Organization A

Organization B
```

Attempt cross-organization access.

Must fail.

This is a P0 gate.

---

# TASK 030 — First Real Admin Login

Connect:

```text
Admin UI
        ↓
API
        ↓
Better Auth
        ↓
Maevelle Membership
```

## Milestone

A real authorized internal user can securely enter Admin.

---

# 12. Foundation Milestone

When TASK 001–030 are complete:

```text
MILESTONE F0
ENGINEERING FOUNDATION
```

is complete.

Expected running system:

```text
Caddy / routing
PostgreSQL
API
Worker
Admin
Storefront
Authentication
Authorization
CI
Migrations
Jobs
Outbox
Audit
```

No ecommerce business features yet.

This is intentional.

---

# 13. Next Queue — Catalog Vertical Slice

After F0, begin:

```text
CATALOG
```

Ordered:

```text
C001 Product Type

C002 Product

C003 Product lifecycle

C004 Product Options

C005 Option Values

C006 Variant

C007 Variant Option Values

C008 SKU

C009 Category

C010 Collection

C011 Tags / Occasions

C012 Colors

C013 Product information

C014 FAQ

C015 Catalog Admin API

C016 Product list

C017 Product create

C018 Product workspace

C019 Variant editor
```

---

# 14. Media Slice

Then:

```text
M001 Asset schema

M002 Stored Object

M003 R2 adapter

M004 Upload Session

M005 upload validation

M006 image processing worker

M007 Renditions

M008 Product media

M009 Variant media

M010 Media Library
```

---

# 15. Sizing Slice

Then:

```text
S001 Size definitions

S002 Measurement definitions

S003 Size Guides

S004 Guide revisions

S005 Product assignment

S006 Admin sizing UI

S007 Storefront Size Guide DTO
```

---

# 16. First Public Product Milestone

Then Storefront:

```text
SF001 public Product query

SF002 Product page

SF003 media gallery

SF004 Color selection

SF005 Size selection

SF006 Variant resolution
```

## Milestone

A published Product can be created in Admin and viewed correctly in Storefront.

---

# 17. Inventory Queue

Only after Catalog foundation:

```text
I001 Warehouse Location

I002 Location capability

I003 Inventory Item

I004 Inventory Level

I005 Inventory Transaction

I006 Movement Line

I007 Opening Balance

I008 Adjustment

I009 Condition change

I010 Reservation

I011 Reservation Allocation

I012 Reservation release

I013 Reservation expiry

I014 concurrency tests

I015 Inventory Admin
```

---

# 18. Inventory Hard Gate

Before Cart/Orders:

Must prove:

```text
No oversell

No negative invalid reservation

Inventory ledger reconciles

Opening Balance works

Adjustment works

Reservation locking works
```

Do not begin `PlaceOrder` before this.

---

# 19. Customer / Geography Queue

Then:

```text
G001 canonical geography tables

G002 Bangladesh geography import

G003 aliases

G004 area search

G005 Customer

G006 Customer phones

G007 Customer addresses

G008 Address resolution

G009 Customer Admin
```

Courier provider mappings come later.

---

# 20. Pricing Queue

Then:

```text
P001 Price List

P002 Variant Price

P003 price resolution

P004 line gross

P005 calculation pipeline

P006 rounding

P007 calculation version

P008 pricing API
```

All authoritative monetary calculations require decimal-safe arithmetic.

---

# 21. Promotions Queue

Then:

```text
PR001 Promotion

PR002 revisions

PR003 coupon

PR004 eligibility

PR005 targets

PR006 benefits

PR007 stacking

PR008 allocations

PR009 usage

PR010 race tests
```

---

# 22. Cart Queue

Then:

```text
CT001 Guest Cart

CT002 Cart Line

CT003 secure Cart access

CT004 Cart calculation

CT005 add/update/remove

CT006 coupon apply

CT007 Mini Cart

CT008 Cart Page
```

Remember:

```text
Cart does NOT reserve Inventory.
```

---

# 23. Order / Checkout Queue

This becomes the first major commerce milestone.

Ordered:

```text
O001 Checkout Session

O002 Order

O003 Order Line

O004 Customer Snapshot

O005 Address Snapshot

O006 Pricing Snapshot

O007 Order Discount Applications

O008 Order Discount Allocations

O009 Number sequence

O010 PlaceOrder command

O011 inventory reservation integration

O012 promotion usage integration

O013 idempotency

O014 concurrency

O015 cancellation

O016 Order Admin list

O017 Order Workspace

O018 Storefront Checkout

O019 COD

O020 Order Confirmation

O021 secure guest tracking access
```

---

# 24. First Real Commerce Milestone

This is:

```text
M1 — COD COMMERCE CORE
```

Acceptance:

```text
Customer opens Product

selects Variant

adds to Cart

enters Checkout

enters Address

selects COD

places Order

server recalculates Pricing

Promotion usage commits

Inventory reserves

Order commits once

customer gets confirmation

Order appears in Admin
```

---

# 25. M1 Required Proof

Before continuing:

```text
✓ last-unit race

✓ duplicate PlaceOrder retry

✓ stale Checkout pricing

✓ coupon final-use race

✓ cross-organization isolation

✓ immutable Order snapshot

✓ cancellation releases reservation

✓ full Storefront E2E

✓ full Admin visibility
```

---

# 26. What Comes After M1

Use the existing Implementation Roadmap.

Sequence:

```text
Payments
        ↓
Fulfillment
        ↓
Delivery
        ↓
Courier integrations
        ↓
Procurement
        ↓
Inbound Shipment
        ↓
Receiving
        ↓
Landed Cost
        ↓
Costing / COGS
        ↓
Returns / RTO
        ↓
Finance
        ↓
Reviews
        ↓
Notifications
        ↓
Analytics
        ↓
Full Admin
        ↓
Full Storefront
        ↓
Hardening
        ↓
Launch
```

The Roadmap owns full details after this point.

---

# 27. Task Template

Every implementation task should use this format.

```text
TASK ID:

TITLE:

GOAL:

CURRENT PHASE:

OWNING MODULE:

READ FIRST:

DEPENDENCIES:

ALLOWED AREAS:

DO:

DO NOT:

DATABASE IMPACT:

API IMPACT:

AUTHORIZATION:

CONCURRENCY:

IDEMPOTENCY:

AUDIT:

OBSERVABILITY:

REQUIRED TESTS:

DONE WHEN:

FOLLOW-UP TASK:
```

---

# 28. Example Task

```text
TASK:
I010

TITLE:
Create Inventory Reservation

GOAL:
Reserve sellable Inventory for a commercial operation.

OWNING MODULE:
Inventory

READ FIRST:
- inventory architecture
- application command/query architecture
- schema specification Inventory section
- testing master plan concurrency section

DEPENDENCIES:
Inventory Item
Inventory Level
Inventory Transaction foundation

DO:
Implement reservation aggregate/application service/repository.

DO NOT:
Implement Order creation.
Do not call Orders repository.
Do not reduce On Hand.

CONCURRENCY:
Lock required Inventory rows in deterministic order.

REQUIRED TESTS:
- reserve available quantity
- reject insufficient quantity
- concurrent final unit
- organization isolation
- release
- expiry

DONE WHEN:
All tests pass and ledger/ATS invariants remain valid.
```

---

# 29. Bug-Fix Template

When fixing a bug:

```text
1. Reproduce.

2. Write failing regression test.

3. Identify violated invariant.

4. Fix smallest correct layer.

5. Run neighboring tests.

6. Evaluate existing production/data impact.

7. Update architecture only if architecture itself was wrong.
```

---

# 30. Architecture Change Rule

Do not update architecture simply because implementation differs.

First determine:

### Case A

Implementation is wrong.

```text
Fix code.
```

### Case B

Architecture is impossible/incomplete.

```text
Create ADR/doc amendment.
```

### Case C

Pure technical implementation detail.

```text
No architecture change needed.
```

---

# 31. Implementation Status Tracking

Maintain a small status file:

```text
docs/implementation/status.md
```

This is not architecture.

It should remain concise.

Recommended:

```text
Current Phase

Current Milestone

Completed Tasks

In Progress

Blocked

Next Approved Tasks

Recent Architecture Decisions

Known Risks
```

---

# 32. Example Status

```text
Current Phase:
Phase 4 — Warehouse & Inventory

Current Milestone:
M1 Commerce Core

Completed:
I001–I009

In Progress:
I010 Inventory Reservation

Blocked:
None

Next:
I011 Reservation Allocation
I012 Reservation Release
```

---

# 33. Status Rule

`status.md` is allowed to change frequently.

Architecture documents should not.

---

# 34. AI Agent Rule — Never Guess Next Task

If an AI agent finishes one task:

```text
check status.md
+
execution-playbook.md
+
implementation-roadmap.md
```

before choosing another.

---

# 35. AI Agent Rule — Read Exact Domain

Before touching:

```text
Payments
```

read Payments architecture.

Before touching:

```text
Returns
```

read Returns architecture.

Before touching:

```text
Costing
```

read Costing architecture.

Do not derive behavior from database table names alone.

---

# 36. AI Agent Rule — No Opportunistic Refactors

A Catalog task should not suddenly:

```text
rewrite authentication

change queue technology

restructure Payments

introduce Redis
```

because the agent thinks it is cleaner.

Stay within task boundary.

---

# 37. AI Agent Rule — No Hidden TODO Architecture

Forbidden:

```text
TODO: make this concurrency safe later
```

inside P0 flows.

If required correctness cannot be completed:

```text
task remains incomplete.
```

---

# 38. AI Agent Rule — Tests First for Critical Behavior

For:

```text
Inventory

Pricing

Promotions

Orders

Payments

Refunds

Costing

Authorization
```

prefer:

```text
RED
→ implementation
→ GREEN
→ refactor
```

---

# 39. Review Rule

High-risk code requires stronger review.

High-risk modules:

```text
IAM

Inventory

Orders

Pricing

Payments

Refunds

Costing

Migrations

Integrations
```

---

# 40. Migration Task Rule

Every migration task must include:

```text
schema specification reference

dependency migration

SQL review

constraint tests

clean-install test

upgrade implications when production exists
```

---

# 41. Database Direct Access Rule

No developer should solve application bugs by permanently relying on manual SQL.

If a recurring repair is required:

```text
create semantic application repair command.
```

---

# 42. Definition of Task Done

A task is not done because:

```text
"code compiles."
```

Done means relevant items are complete:

```text
implementation

tests

authorization

error handling

concurrency

idempotency

audit

observability

docs/contracts

UI states
```

according to task type.

---

# 43. Definition of Phase Done

Use:

```text
implementation-roadmap.md
```

phase exit gate.

Do not self-declare phase completion without satisfying it.

---

# 44. Stop Conditions

Stop implementation and escalate architecture review if:

```text
two domains both appear to own same truth

schema cannot enforce critical tenant boundary

provider operation has no safe UNKNOWN state

required operation cannot be made idempotent

historical truth requires mutable current data

migration would destroy important provenance

existing ADR blocks required correctness
```

---

# 45. Do Not Stop for Minor Questions

Do not pause entire project for:

```text
button icon

file naming

minor component abstraction

exact spacing

non-critical helper choice
```

Make reasonable implementation decision and continue.

---

# 46. Deferred Scope Discipline

When encountering future requirements such as:

```text
Customer Accounts

Gift Cards

Loyalty

Advanced CMS

Multi-currency selling

AI recommendations

Microservices
```

do not implement foundations unless current architecture explicitly requires compatibility.

---

# 47. First Working Product Definition

The first meaningful working Maevelle is:

```text
Admin logs in
        ↓
creates Product
        ↓
creates Variants
        ↓
uploads Media
        ↓
publishes Product
        ↓
sets Inventory
        ↓
Customer sees Product
        ↓
selects Variant
        ↓
adds Cart
        ↓
Checkout
        ↓
COD Order
        ↓
Inventory reserves
        ↓
Order appears Admin
```

Until this works, avoid spending large effort on:

```text
Analytics

advanced Dashboard

Reviews

full Finance

CMS

decorative Storefront polish.
```

---

# 48. First Business Success Metric

Not:

```text
number of tables created
```

Not:

```text
number of endpoints
```

Not:

```text
number of pages
```

It is:

> **One correct end-to-end commerce transaction executed through the real architecture.**

---

# 49. Second Working Milestone

After M1:

```text
manual bKash/Nagad

Payment verification

Fulfillment

Delivery

Courier integration
```

This creates real operational commerce.

---

# 50. Third Working Milestone

Then:

```text
Purchase
Shipment
Receiving
Landed Cost
FIFO Costing
```

This makes business margin/stock acquisition trustworthy.

---

# 51. Fourth Working Milestone

Then:

```text
RTO
Returns
Refund
Cost restoration
COGS reversal
```

This closes reverse commerce.

---

# 52. Documentation Policy From This Point

No planned broad architecture-document chain.

Allowed documentation work:

```text
update an existing source-of-truth doc because implementation discovered a real issue

create focused ADR for a genuine technical decision

update schema specification because migration requires structural correction

update implementation status

update public docs later
```

---

# 53. Forbidden Documentation Drift

Do not stop implementation to create:

```text
another overall architecture plan

another implementation roadmap

another project concept document

another generic UX strategy
```

unless the project scope fundamentally changes.

---

# 54. Entry Point Summary

A new contributor asks:

> What do I do?

Answer:

```text
1. Read execution-playbook.md

2. Check implementation/status.md

3. Read relevant roadmap phase

4. Read relevant domain/ADR/schema docs

5. Take the next approved task

6. Implement only that task

7. Run required tests

8. Meet Done criteria

9. Update status

10. Continue
```

---

# 55. Project Start Point

The implementation journey begins with:

```text
TASK 001
Repository Bootstrap
```

The project becomes commercially real at:

```text
M1
COD Commerce Core
```

The overall product progresses from there according to:

```text
docs/implementation/implementation-roadmap.md
```

---

# 56. Final Rule

> **Docs tell us what truth to preserve. The Execution Playbook tells us what to do next. The code and tests prove that we actually did it.**

---

**End of Execution Playbook v0.1**
