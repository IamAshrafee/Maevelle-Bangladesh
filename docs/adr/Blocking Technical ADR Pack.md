# Maevelle Ecommerce — Blocking Technical ADR Pack

**Directory:** `docs/adr/`
**Status:** Accepted for Initial Implementation
**Version:** 0.1
**Decision Date:** 2026-08-20

This pack contains:

```text
ADR-001 Backend HTTP Framework
ADR-002 PostgreSQL Access & Migration Layer
ADR-003 Authentication & Session Architecture
ADR-004 Object Storage
ADR-005 Background Jobs & Worker Runtime
ADR-006 Reverse Proxy & TLS
ADR-007 Search Engine
ADR-008 Observability
ADR-009 CI/CD & Deployment
```

---

# 1. Global Technical Baseline

Before the individual ADRs, the following foundation is accepted.

```text
Runtime:
Node.js 24 LTS

Language:
TypeScript

Module system:
ESM

Frontend:
Next.js + React

Admin UI:
shadcn/ui-based

Backend:
Fastify 5

Database:
PostgreSQL 18+

Database access:
Kysely + node-postgres

Package manager:
pnpm

Deployment:
Docker / Docker Compose

Reverse proxy:
Caddy

Object storage:
S3-compatible
Initial provider: Cloudflare R2

Jobs:
PostgreSQL-backed durable worker

Search:
PostgreSQL FTS + pg_trgm

Authentication:
Better Auth authentication engine
Custom Maevelle IAM authorization

Observability:
OpenTelemetry + Pino + Grafana Alloy / Grafana Cloud
```

Node.js 24 is currently an LTS line, while PostgreSQL 18 provides native `uuidv7()` generation, matching the UUIDv7 direction already adopted in our data architecture.

---

# ADR-001 — Backend HTTP Framework

## Status

**ACCEPTED**

## Decision

Use:

```text
Fastify 5
+
TypeBox
+
@fastify/type-provider-typebox
+
@fastify/swagger
```

for `apps/api`.

Fastify supports schema-driven request validation and response serialization, official TypeBox type-provider integration, and OpenAPI generation through its Swagger plugin.

---

## Why Fastify

Maevelle does not need a backend framework to define:

```text
Orders

Inventory

Payments

Customers

Costing
```

Those concepts already belong to our application/domain architecture.

The HTTP framework should therefore remain thin.

Fastify is a good fit because it provides:

```text
HTTP routing

request lifecycle

schema validation

serialization

plugins

logging integration

error hooks

OpenAPI integration
```

without forcing our domain to inherit a framework architecture.

---

## API Layer Architecture

```text
HTTP Request
      ↓
Fastify Route
      ↓
Transport Schema Validation
      ↓
Authentication
      ↓
Organization Context
      ↓
Authorization
      ↓
Application Command / Query
      ↓
Domain
      ↓
Repository / Transaction
      ↓
Application Result
      ↓
Public DTO
      ↓
HTTP Response
```

---

## Route Responsibility

Route handlers may:

```text
read HTTP data

resolve request context

call application command/query

map application errors

set response headers/status
```

They may not:

```text
implement Pricing

reserve Inventory directly

update Order statuses directly

query arbitrary domain tables

perform provider business logic
```

---

## Contracts

Transport contracts live primarily in:

```text
packages/contracts/
```

Example:

```text
packages/contracts/
  storefront/
  admin/
  integration/
  provider/
  shared/
```

Use TypeBox schemas for HTTP-facing:

```text
request

response

query

path

header
```

contracts.

---

## Why TypeBox

Fastify has official TypeBox Type Provider support, allowing route schemas to drive both runtime validation and TypeScript inference.

This gives us:

```text
one transport schema
→ validation
→ types
→ OpenAPI
```

instead of maintaining three unrelated definitions.

---

## Important Boundary

TypeBox schemas are:

```text
transport contracts
```

They are **not domain entities**.

Forbidden:

```text
Domain Order = TypeBox HTTP Order schema
```

because public/Admin representations will differ from internal domain state.

---

## OpenAPI

Use:

```text
@fastify/swagger
```

to generate the operational OpenAPI artifact from approved route schemas.

The plugin officially supports Fastify 5 and OpenAPI v3 generation.

Initial API contract version:

```text
OpenAPI 3.0.3
```

unless a future ADR deliberately upgrades it.

---

## API Contract Workflow

```text
Architecture/API contract
        ↓
packages/contracts TypeBox schema
        ↓
Fastify route
        ↓
generated OpenAPI
        ↓
CI contract validation
```

Generated OpenAPI is not allowed to drift silently from the approved API architecture.

---

## Error Handling

Fastify transport layer maps application errors into standardized Problem Details.

Example:

```json
{
  "type": "https://errors.maevelle.internal/item-unavailable",
  "title": "Item unavailable",
  "status": 409,
  "code": "ITEM_UNAVAILABLE",
  "request_id": "..."
}
```

No:

```text
SQL errors

stack traces

provider raw errors
```

reach public clients.

---

## Rejected Alternative — NestJS

NestJS is capable, but Maevelle does not currently need:

```text
framework-controlled modules

decorator-heavy domain composition

framework DI everywhere
```

It would risk making the application architecture follow the framework instead of the domain.

---

## Rejected Alternative — Hono

Hono remains an attractive lightweight framework, especially for edge/serverless systems.

Maevelle is initially:

```text
Node
long-running server
private VPS
heavy PostgreSQL transactions
worker processes
```

Fastify currently fits that deployment model better.

---

## ADR-001 Invariant

> **Fastify transports Maevelle business capabilities; Fastify never defines those capabilities.**

---

# ADR-002 — PostgreSQL Access & Migration Layer

## Status

**ACCEPTED**

## Decision

Use:

```text
PostgreSQL 18+
Kysely
node-postgres (pg)
```

for transactional database access.

Kysely's PostgreSQL dialect uses `pg`, supports explicit transactions, and provides a parameterized raw-SQL escape hatch for PostgreSQL-specific operations.

---

# Why Kysely

Our architecture specifically requires:

```text
explicit transactions

row locks

SKIP LOCKED

complex joins

CTEs

PostgreSQL constraints

partial indexes

raw SQL

migration control

performance visibility
```

Maevelle therefore benefits more from:

```text
type-safe SQL query builder
```

than a high-abstraction ORM.

---

# Domain Model Separation

Forbidden:

```text
Kysely row type
=
Domain Product
```

Use:

```text
Database Row
      ↓
Repository
      ↓
Domain/Application object
```

Domain logic cannot depend on Kysely.

---

# Database Package

Recommended:

```text
packages/database/
  src/
    connection/
    migrations/
    schemas/
    queries/
    testing/
```

Domain repositories remain module-owned.

Example:

```text
packages/core/src/modules/inventory/infrastructure/
  inventory.repository.pg.ts
```

---

# SQL Escape Hatch

When PostgreSQL behavior cannot be represented cleanly with Kysely:

```text
sql`...`
```

is explicitly allowed.

Kysely's SQL template parameterizes ordinary substitutions and supports raw PostgreSQL constructs where necessary.

This is expected for things such as:

```text
advanced indexes

constraint definitions

locking queries

CTEs

reconciliation SQL

special PostgreSQL functions
```

---

# Migration Strategy

Use Kysely's migration infrastructure as the migration runner.

But migration definitions remain:

> **SQL-first and PostgreSQL-aware.**

Simple schema changes may use Kysely schema builders.

Advanced schema changes should use explicit SQL.

---

# Production Migration Rule

Forbidden:

```text
automatic schema push

runtime auto-migrate

ORM schema synchronization

Better Auth auto-migrate on application boot
```

Every production migration must be:

```text
version-controlled

reviewed

tested

deployment-aware
```

---

# PostgreSQL Version

Production baseline:

```text
PostgreSQL 18
```

PostgreSQL 18 includes native time-ordered UUIDv7 generation.

---

# ID Generation

Canonical persisted entity IDs:

```sql
id uuid NOT NULL DEFAULT uuidv7()
```

unless a table has a documented reason to use:

```text
BIGINT identity
```

for internal high-volume rows.

---

# Why Database UUIDv7

Benefits:

```text
one canonical generator

time-ordered identifiers

no application library dependency

better index locality than random UUIDv4
```

Application-preallocated IDs remain possible only when an explicit workflow requires them.

---

# Monetary Precision

Adopt these initial database conventions:

### Committed monetary amounts

```sql
numeric(20,4)
```

Examples:

```text
Order totals

Payments

Refunds

Expenses
```

---

# Unit Monetary Rates

For values that may require additional precision before final rounding:

```sql
numeric(24,8)
```

Examples:

```text
unit acquisition cost

allocated unit landed cost
```

---

# FX Rates

```sql
numeric(24,12)
```

---

# Quantities

```sql
numeric(20,6)
```

This supports:

```text
integer fashion inventory

future weighted/measured inventory
```

without changing the schema.

---

# Percentages / Rates

```sql
numeric(18,8)
```

---

# JavaScript Money Rule

Never convert PostgreSQL NUMERIC money into ordinary JS floating-point numbers for calculations.

Application calculation uses:

```text
Decimal representation
```

and API money amounts serialize as strings.

Example:

```json
{
  "amount": "1450.00",
  "currency": "BDT"
}
```

---

# Time

Persist:

```text
timestamptz
```

for absolute events.

Persist:

```text
date
```

only where the business concept is genuinely date-only.

Presentation uses:

```text
IANA timezone
```

such as:

```text
Asia/Dhaka
```

---

# Database Naming

Use:

```text
snake_case
```

for:

```text
schemas

tables

columns

indexes

constraints
```

Application TypeScript remains camelCase where appropriate.

---

# Connection Pools

Separate bounded pools for:

```text
API

Worker

Migration tooling
```

Do not let each module create its own pool.

---

# Connection Budget

The total pool sizes must remain below PostgreSQL capacity with operating headroom.

Example concept:

```text
API pool
+
Worker pool
+
Admin maintenance
<
PostgreSQL max_connections budget
```

---

# Drizzle Decision

Drizzle is technically capable of PostgreSQL indexes and constraints.

It remains a viable fallback.

Kysely is selected because Maevelle specifically wants:

```text
SQL-visible

transaction-focused

query-builder-centric
```

persistence rather than an ORM-led domain model.

---

# Prisma Decision

Not selected as Maevelle's primary database layer.

The deciding issue is not that Prisma cannot build ecommerce systems.

It is that Maevelle deliberately relies on many PostgreSQL-specific integrity/concurrency patterns where a thinner SQL abstraction is preferable.

---

# ADR-002 Invariant

> **PostgreSQL defines relational truth; Kysely assists us in expressing SQL but does not become our domain model.**

---

# ADR-003 — Authentication & Session Architecture

## Status

**ACCEPTED**

## Decision

Use:

```text
Better Auth
```

for **authentication primitives**.

Use Maevelle's own:

```text
IAM Membership

Capability

Scope

Owner protection

Resource authorization
```

for authorization.

Better Auth provides cookie-based sessions, configurable database schemas/table names, session management, TOTP 2FA, and custom database/storage integration.

---

# Critical Separation

```text
Better Auth
=
Who authenticated?

Maevelle IAM
=
What are they allowed to do?
```

We will **not** use Better Auth's organization/role system as Maevelle's business authorization authority.

---

# Internal User Login V1

Supported:

```text
Email

Password

TOTP MFA

Recovery Codes
```

---

# User Creation

Admin users are:

```text
invite-only
```

No public Admin sign-up.

---

# Authentication Table Mapping

Better Auth tables should map into the existing `iam` namespace rather than creating unrelated public tables.

Conceptually:

```text
iam.users

iam.auth_accounts

iam.auth_verifications

iam.auth_two_factor
```

Exact plugin-required schema is reconciled against the pinned Better Auth version during physical DDL work.

Better Auth supports custom model/table and field names.

---

# Better Auth Migration Rule

Better Auth's CLI may be used to:

```text
inspect

generate reference SQL
```

during development.

It must **not** autonomously migrate the production database.

Generated changes are reviewed and incorporated into normal Maevelle migrations.

---

# Session Design

For internal Admin sessions:

```text
server-side session

Secure cookie

HttpOnly

SameSite

database-backed validation
```

Better Auth's production cookies are HttpOnly and secure, and its session system supports revocation.

---

# Cookie Cache

Initial decision:

```text
DISABLED
```

for Admin sessions.

Why?

Better Auth documents that cookie caching can allow a revoked session to remain valid until the cookie cache expires.

Maevelle prioritizes:

```text
permission revocation

membership disable

security incident containment
```

over saving one small database lookup.

---

# Session Secret Storage

Better Auth's normal database session model stores the session token itself.

For Maevelle's stronger security posture, session state will instead use Better Auth's customizable secondary-storage mechanism backed by PostgreSQL.

Better Auth explicitly supports custom secondary storage through an interface implemented by the application.

---

# PostgreSQL Auth KV Store

Recommended infrastructure:

```text
iam.auth_kv_store
```

Conceptual structure:

```text
key_hash

encrypted_value

counter_value

expires_at

key_version

created_at

updated_at
```

---

# Key Handling

Incoming Better Auth secondary-storage key:

```text
session-token-or-internal-key
```

is transformed into:

```text
HMAC-SHA-256(key)
```

before database persistence.

Raw bearer credential is therefore not stored.

---

# Value Handling

Sensitive session values should be encrypted using application-managed authenticated encryption with:

```text
key versioning
```

for rotation.

---

# Atomic Auth Operations

The custom storage implementation must support the full interface required by the pinned Better Auth version, including atomic operations where required.

Recent Better Auth versions explicitly require atomic secondary-storage methods for certain single-use/counter workflows.

---

# Session Metadata Registry

Maintain non-secret operational session metadata separately for:

```text
session list

device information

last activity

revocation

security investigation
```

Conceptually:

```text
iam.sessions
```

with:

```text
id

user_id

created_at

last_seen_at

absolute_expires_at

revoked_at

ip metadata

user-agent metadata
```

No bearer secret.

---

# Session Expiration

Initial internal policy:

```text
Idle timeout:
30 minutes

Absolute session lifetime:
12 hours
```

These remain configurable security policy values.

---

# Step-Up Authentication

Sensitive operations require recent authentication.

Examples:

```text
ownership transfer

API credential creation

permission escalation

large/manual Refund override

security policy change
```

Application context should include:

```text
authenticated_at

mfa_verified_at
```

Initial recent-auth window:

```text
10 minutes
```

---

# MFA

TOTP MFA is required at launch for:

```text
Primary Owner

high-privilege internal users
```

Recommended default:

```text
all internal users
```

Better Auth's 2FA plugin supports TOTP and backup codes.

---

# Password Hashing

Use Better Auth's maintained password-hashing implementation rather than writing custom password cryptography.

Better Auth currently uses memory-hard scrypt by default and allows custom hashing if needed later.

---

# CSRF

Better Auth's authentication endpoints use its security protections.

Business/API mutations still follow Maevelle's:

```text
same-origin

CSRF

CORS

authorization
```

architecture.

---

# Customer Authentication Future

Customer Account authentication must not silently reuse internal staff memberships/sessions.

Recommended future:

```text
separate Better Auth configuration
or
strictly isolated customer auth model
```

sharing only necessary authentication infrastructure.

---

# Service Accounts

Service Accounts/API Clients remain Maevelle IAM/Integration entities.

They do not log in through Better Auth human sessions.

---

# ADR-003 Invariant

> **Authentication establishes identity; all business authorization remains Maevelle-owned and server-enforced.**

---

# ADR-004 — Object Storage

## Status

**ACCEPTED**

## Decision

Use an abstraction:

```text
ObjectStoragePort
```

with initial production provider:

```text
Cloudflare R2
```

via its S3-compatible API.

R2 exposes an S3-compatible API and is designed for object storage accessible using standard S3 SDKs.

---

# Why External Object Storage

The VPS filesystem must not become authority for:

```text
Product media

Review media

Payment evidence

Return evidence

Supplier documents

Backups
```

because:

```text
VPS failure
```

would otherwise also become:

```text
media/data loss.
```

---

# Why R2 Initially

R2 currently provides:

```text
S3 API compatibility

strong consistency

global Cloudflare infrastructure
```

and Cloudflare states direct R2 egress has no bandwidth charge.

---

# Port Interface

Conceptually:

```text
ObjectStoragePort {
  createUpload()
  putObject()
  getObject()
  createSignedGet()
  createSignedPut()
  headObject()
  copyObject()
  deleteObject()
}
```

Domain code never imports:

```text
Cloudflare SDK
```

directly.

---

# Buckets

Production should separate concerns.

Recommended:

```text
maevelle-prod-media-private

maevelle-prod-media-public

maevelle-prod-backups
```

Staging has entirely separate buckets/credentials.

---

# Private Media

Includes:

```text
payment evidence

return evidence

supplier documents

original unvalidated uploads

quarantined files
```

Never publicly addressable.

---

# Public Media

Contains only explicitly publishable processed renditions.

Examples:

```text
Product images

approved public Review images

storefront assets
```

---

# Upload Flow

```text
Create Upload Session
        ↓
Generate pre-signed upload
        ↓
Client uploads to private/quarantine object
        ↓
Finalize upload
        ↓
Worker validates
        ↓
Worker processes
        ↓
Generate renditions
        ↓
Publish eligible rendition
```

---

# Object Identity

Database stores:

```text
provider

bucket

object key

checksum

content type

size
```

not a CDN URL as permanent identity.

---

# URL Rule

URLs are derived.

They can change without changing Asset identity.

---

# Backups

Database backups may use the dedicated R2 backup bucket.

Backup credentials must be separate from normal media credentials.

Application containers should not have permission to delete backup history.

---

# Local Development

A local S3-compatible service may be used in development/test.

Production remains R2 unless a future ADR changes provider.

---

# Provider Portability

Because the application speaks the S3-compatible `ObjectStoragePort`, later migration to:

```text
AWS S3

Backblaze B2

another S3-compatible provider
```

does not alter Media domain rules.

---

# ADR-004 Invariant

> **Storage provider is infrastructure; an Asset is a Maevelle business object whose identity survives provider/URL changes.**

---

# ADR-005 — Background Jobs & Worker Runtime

## Status

**ACCEPTED**

## Decision

Use:

```text
PostgreSQL-backed durable jobs
+
apps/worker
```

for V1.

Do **not** require:

```text
Redis

BullMQ

RabbitMQ

Kafka
```

at launch.

---

# Job Authority

Canonical table remains:

```text
platform.jobs
```

with states already established:

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

# Job Claiming

Use PostgreSQL row locking:

```sql
FOR UPDATE SKIP LOCKED
```

to let multiple workers claim independent jobs without blocking each other.

PostgreSQL explicitly notes `SKIP LOCKED` can be useful for multiple consumers accessing a queue-like table.

---

# Worker Architecture

```text
PostgreSQL
   ↓
Job Claim
   ↓
Lease
   ↓
Worker Handler
   ↓
Complete
or
Retry
or
Dead Letter
```

---

# Lease Model

Each RUNNING job records:

```text
worker_id

lease_token

leased_at

lease_expires_at

heartbeat_at
```

A crashed worker eventually loses the lease.

---

# Worker Crash

Another worker may reclaim the job after:

```text
lease_expires_at
```

provided the operation is retry-safe.

---

# External Operations

For external side effects:

```text
Courier booking

Payment/refund future

Webhook
```

job retry does not imply blind provider retry.

Use:

```text
Integration Operation
→ UNKNOWN outcome
→ reconciliation
```

where necessary.

---

# Queue Names

Initial:

```text
critical

integrations

reconciliation

notifications

media

analytics

imports

exports

maintenance
```

Exact queue assignment can evolve.

---

# Priority

Example:

```text
0   critical money/integrity
10  provider business operations
20  notifications
30  media
40  analytics
50  exports
```

Priority does not replace separate queues when resource isolation is necessary.

---

# Scheduled Jobs

Use:

```text
run_at
```

on durable jobs.

Critical scheduling must not rely on:

```text
setTimeout()

setInterval()
```

inside one long-running Node process.

---

# Scheduler Coordination

When multiple workers exist:

```text
database lock/advisory leadership
```

prevents duplicate scheduler generation.

---

# Outbox vs Job

Remain separate.

```text
Outbox Event
=
something happened

Job
=
work needs execution
```

An outbox consumer may create jobs.

They are not interchangeable tables.

---

# Dead Letter

Any DEAD_LETTER job affecting business operations becomes visible through:

```text
Operations / Attention Center
```

---

# Redis Future

Redis may later support:

```text
cache

distributed rate limiting

short-lived coordination

high-throughput queues
```

but loss of Redis must never erase canonical:

```text
Orders

Payments

Inventory

Outbox
```

---

# Migration Trigger

Move heavy queue workloads away from PostgreSQL only when measured queue traffic materially harms OLTP behavior.

Not because:

```text
"queues normally use Redis."
```

---

# ADR-005 Invariant

> **Job durability begins in PostgreSQL; worker convenience never becomes more authoritative than transactional data.**

---

# ADR-006 — Reverse Proxy & TLS

## Status

**ACCEPTED**

## Decision

Use:

```text
Caddy 2
```

as the initial production reverse proxy and TLS terminator.

Caddy automatically provisions and renews HTTPS certificates for configured public hostnames and provides built-in reverse proxy functionality.

---

# Initial Routing

Example:

```text
maevelle.com
→ storefront

admin.maevelle.com
→ admin

api.maevelle.com
→ api
```

Possible later:

```text
assets.maevelle.com
```

served from object-storage/CDN infrastructure.

---

# Caddy Responsibilities

```text
TLS

HTTP → HTTPS redirects

reverse proxy

request forwarding

compression where appropriate

basic request-level protections
```

---

# Application Responsibilities

Caddy does not own:

```text
authentication

authorization

business rate limits

CSRF

CORS policy

application validation
```

Those remain in application/security architecture.

---

# Container Deployment

Caddy runs under Docker Compose with persistent:

```text
/data
/config
```

volumes where required for certificate state.

---

# Origin Exposure

Application containers should not expose public ports unnecessarily.

Only:

```text
Caddy
```

should normally bind public HTTP/HTTPS ports.

---

# Trusted Proxy Configuration

Fastify/Next.js must only trust forwarding headers from known proxy topology.

Do not blindly trust arbitrary:

```text
X-Forwarded-For
```

sent by the internet.

---

# Health

Caddy routes traffic only to application processes expected to be healthy/readied.

---

# Nginx

Nginx is fully capable and remains a valid future alternative.

Caddy wins initially because it reduces:

```text
certificate management

TLS configuration

small-server operational overhead.
```

---

# ADR-006 Invariant

> **Caddy manages edge HTTP/TLS concerns; it never becomes business authorization infrastructure.**

---

# ADR-007 — Search Engine

## Status

**ACCEPTED**

## Decision

Use:

```text
PostgreSQL 18
+
Full Text Search
+
pg_trgm
+
search projection
```

for V1 Catalog search.

PostgreSQL provides built-in full-text search, and its documentation identifies GIN as the preferred index type for frequently searched `tsvector` data. `pg_trgm` provides similarity search plus index support for fast fuzzy matching.

---

# Search Port

Domain/application access occurs through:

```text
CatalogSearchPort
```

not PostgreSQL-specific functions everywhere.

---

# Search Projection

Recommended:

```text
search.catalog_documents
```

or the search schema already established in the existing PostgreSQL specification.

One row per searchable Product/Variant representation according to chosen grain.

---

# Searchable Content

Projection may contain:

```text
Product title

description

SKU

Category names

Collection names

Tags

Occasions

Attribute text

Color names

Color aliases

search synonyms
```

---

# Structured Fields

Keep filterable values explicitly structured.

Examples:

```text
price_min

price_max

category IDs

collection IDs

attribute facets

availability projection

published state
```

Do not parse them out of one text blob.

---

# Full-Text Index

Use:

```text
tsvector
+
GIN
```

for token search.

For multilingual Bangla/English content, initial configuration should avoid English-only stemming assumptions.

A `simple` text-search configuration plus normalized aliases is the safest baseline unless later language-specific testing proves a better approach.

---

# Fuzzy / Typo Search

Use:

```text
pg_trgm
```

for:

```text
title similarity

alias similarity

prefix/fuzzy discovery
```

---

# Ranking

Initial rank composition should favor:

```text
1. Exact SKU

2. Exact Product title

3. Title prefix

4. Exact alias/tag/color match

5. Full-text rank

6. Trigram similarity
```

plus merchandising/business ranking where explicitly configured.

---

# Availability

Search can display projected:

```text
availability
```

but final Product/Cart/Checkout remains authoritative.

Search projection staleness must never permit purchase.

---

# Rebuild

Catalog Search projection is:

```text
rebuildable
```

from Catalog/Pricing/search-source facts.

---

# Dedicated Search Engine Trigger

Consider:

```text
Typesense

Meilisearch

OpenSearch
```

later only if measured requirements justify it.

Examples:

```text
ranking complexity exceeds PostgreSQL maintainability

large facet workloads hurt OLTP

search volume materially competes with commerce DB

advanced typo/recommendation capabilities are required.
```

---

# ADR-007 Invariant

> **Search helps customers find sellable things; it never decides whether those things may actually be sold.**

---

# ADR-008 — Observability

## Status

**ACCEPTED**

## Decision

Use:

```text
Pino
+
OpenTelemetry
+
Grafana Alloy
+
Grafana Cloud
+
PostgreSQL pg_stat_statements
```

as the initial observability architecture.

---

# Signal Strategy

### Logs

```text
Pino structured JSON
```

### Traces

```text
OpenTelemetry
```

### Application metrics

```text
OpenTelemetry Metrics
```

### Host/container telemetry

```text
Grafana Alloy
```

### Backend

```text
Grafana Cloud
```

OpenTelemetry's current JavaScript implementation considers traces and metrics stable, while its log signal remains under development, which is a strong reason to keep structured application logging independent rather than forcing logs through the OTel JS logging API.

Grafana Cloud provides an OTLP ingestion endpoint, and its Linux integration through Grafana Alloy can collect CPU, memory, disk, networking metrics and logs from the server.

---

# Why Managed Observability

Do not run:

```text
Prometheus

Loki

Tempo

Grafana

Elasticsearch
```

all on the same initial commerce VPS.

That would:

```text
consume resources

increase operational complexity

share the same failure domain
```

as production commerce.

---

# Logging

Every API request includes:

```text
request_id

correlation_id

organization_id where known

principal type

application operation

duration

status
```

---

# Forbidden Log Data

Do not log:

```text
passwords

session tokens

API secrets

payment credentials

full sensitive address

full payment evidence

TOTP secrets
```

---

# Domain Telemetry

Create custom spans/metrics around important business operations.

Examples:

```text
checkout.place_order

inventory.reserve

payment.verify

fulfillment.post

delivery.book

return.receive

costing.consume_fifo
```

---

# Required Business Metrics

Examples:

```text
PlaceOrder success/failure

Inventory conflict rate

Payment verification backlog

Refund unknown outcomes

Worker queue depth

Outbox age

Courier booking failure

RTO aging

Integrity Issue count
```

---

# PostgreSQL

Enable:

```text
pg_stat_statements
```

for query-performance visibility.

PostgreSQL ships `pg_stat_statements` as an official supplied extension for tracking SQL planning/execution statistics.

---

# Correlation

A browser/API request causing:

```text
Order
→ Outbox
→ Worker
→ Courier
```

should retain:

```text
correlation_id
```

across the workflow.

---

# Alerting

Grafana alerts should cover at minimum:

```text
disk

DB availability

API error rate

latency

worker heartbeat

queue age

outbox age

provider failures

backup age
```

---

# Error Grouping

Dedicated Sentry-style issue aggregation is intentionally **not mandatory initially**.

If Grafana logs/traces prove insufficient for developer error triage, Sentry can later be added without changing core telemetry contracts.

---

# ADR-008 Invariant

> **Maevelle emits vendor-neutral operational signals; the monitoring backend must never become required for commerce correctness.**

---

# ADR-009 — CI/CD & Deployment

## Status

**ACCEPTED**

## Decision

Use:

```text
GitHub Actions
+
GitHub Container Registry (GHCR)
+
Docker images
+
Docker Compose
+
Caddy
+
single private VPS initially
```

GitHub officially documents building and publishing container images into GHCR from Actions, and Docker explicitly supports Compose as a production deployment model for a single server.

---

# Core Principle

> **Build once. Deploy the same immutable artifact.**

Do not:

```text
git pull production

npm install production

compile TypeScript production

edit source over SSH
```

---

# CI Pipeline

Pull request:

```text
Checkout
   ↓
Install
   ↓
Lint
   ↓
Typecheck
   ↓
Architecture checks
   ↓
Unit tests
   ↓
PostgreSQL integration tests
   ↓
API contract tests
   ↓
Build
   ↓
Security scans
   ↓
Critical E2E
```

---

# Container Build

On approved release:

```text
Build immutable images
        ↓
Tag Git SHA
        ↓
Push GHCR
        ↓
Record image digest
```

---

# GitHub Actions Security

External GitHub Actions should be pinned to immutable commit SHAs for sensitive deployment workflows.

GitHub's own container-publishing documentation recommends pinning third-party Actions to commit SHAs rather than floating tags.

---

# Images

Potential:

```text
maevelle-storefront

maevelle-admin

maevelle-api

maevelle-worker
```

Shared packages compile into consuming artifacts.

---

# Deployment Trigger

Production deployment should be:

```text
manual approved workflow
or
approved release trigger
```

not every push to `main`.

---

# Deployment Authentication

GitHub Actions uses:

```text
restricted SSH deploy credential
```

to reach the VPS.

The deployment account:

```text
cannot interactive-admin everything
```

unless required.

---

# Server Layout

Example:

```text
/opt/maevelle/
  compose.yaml
  compose.production.yaml
  caddy/
  deploy/
  state/

/etc/maevelle/
  api.env
  worker.env
  storefront.env
  admin.env
```

Secrets live outside repository.

---

# Production Source Code

Production host does not need a mutable source checkout.

It pulls:

```text
container images
```

from GHCR.

---

# Deployment Flow

```text
1. Resolve release image digests

2. Preflight checks

3. Confirm backup health

4. Pull images

5. Run migration container

6. Verify migration result

7. Recreate affected services

8. Wait readiness

9. Run smoke checks

10. Record deployed release
```

---

# Migration Container

Migrations run as a dedicated one-shot command using the exact release image/code.

Not from:

```text
API startup

Worker startup
```

---

# Migration Lock

Only one migration process may execute at a time.

Use:

```text
Kysely migration lock
or
PostgreSQL advisory lock
```

depending final migration-runner implementation.

---

# Backup Before Migration

High-risk migrations require verified recent backup.

---

# Rollback

Application rollback:

```text
previous image digest
```

may be used only if database schema remains backward compatible.

---

# Schema Rollback

Never assume:

```text
app rollback
=
migration rollback.
```

Migration recovery follows the migration-specific plan.

---

# Compose

Use separate:

```text
compose.yaml

compose.production.yaml
```

or equivalent override.

Docker's production Compose guidance explicitly recommends production-specific overrides for elements such as environment, ports and restart policies.

---

# Containers

Initial production topology:

```text
Caddy

Storefront

Admin

API

Worker

PostgreSQL

Grafana Alloy
```

External:

```text
Cloudflare R2

Grafana Cloud

Courier providers

Email provider
```

---

# PostgreSQL

PostgreSQL remains on the initial private VPS.

Its data directory uses a dedicated persistent volume/storage path.

It is not recreated casually with application containers.

---

# Restart Policies

Use appropriate:

```text
unless-stopped
```

or equivalent production policies while avoiding restart loops that hide persistent failure.

---

# Health Checks

Need:

```text
liveness

readiness
```

for:

```text
API

Storefront

Admin

Worker heartbeat
```

---

# Graceful Shutdown

API:

```text
stop accepting requests
finish in-flight work
close DB pool
```

Worker:

```text
stop claiming jobs
finish/release current leases
close DB pool
```

---

# Secrets

Initial secrets are managed outside Git.

Requirements:

```text
minimum permissions

separate staging/production

rotation

no CI log exposure
```

A dedicated secrets manager may be introduced later without changing application configuration contracts.

---

# Staging

Staging uses:

```text
same Docker architecture

same PostgreSQL major

same Caddy model

same worker model
```

but separate:

```text
database

R2 buckets

provider credentials

domain names
```

---

# Production Downtime

One VPS is not true HA.

We therefore target:

```text
short predictable deployments
```

rather than making a false zero-downtime promise.

Blue/green service switching can be introduced later if deployment interruption becomes materially important.

---

# Scaling

Initial scaling order remains:

```text
1. Optimize application/queries

2. Increase VPS resources

3. Move PostgreSQL to dedicated host

4. Multiple app processes/instances

5. Dedicated workers

6. Redis where justified

7. Dedicated search where justified
```

not immediate Kubernetes.

---

# Kubernetes

Explicitly not V1.

---

# ADR-009 Invariant

> **Production runs immutable, tested artifacts; deployment never becomes an untracked coding environment.**

---

# 10. Cross-ADR Compatibility

The accepted stack now fits together as:

```text
                     ┌──────────────────┐
                     │ Cloudflare R2    │
                     │ Object Storage   │
                     └────────▲─────────┘
                              │
                              │ S3 API
                              │
┌───────────────┐      ┌──────┴──────┐
│ Storefront    │─────▶│             │
│ Next.js       │      │             │
└───────────────┘      │             │
                       │ Fastify API │
┌───────────────┐      │             │
│ Admin         │─────▶│             │
│ Next.js       │      └──────┬──────┘
└───────────────┘             │
                              │ Application Commands
                              ▼
                    ┌──────────────────┐
                    │ Domain Modules   │
                    └────────┬─────────┘
                             │
                    Kysely / SQL
                             │
                             ▼
                    ┌──────────────────┐
                    │ PostgreSQL 18    │
                    │                  │
                    │ Transactions     │
                    │ Ledger           │
                    │ Outbox           │
                    │ Jobs             │
                    │ Search           │
                    │ Auth state       │
                    └──────┬───────────┘
                           │
                           │ SKIP LOCKED
                           ▼
                    ┌──────────────────┐
                    │ Worker           │
                    └────────┬─────────┘
                             │
                Providers / Notifications
```

Edge:

```text
Internet
   ↓
Caddy
   ├── Storefront
   ├── Admin
   └── API
```

Observability:

```text
Apps
 ├── Pino logs
 └── OpenTelemetry
          ↓
     Grafana Alloy
          ↓
     Grafana Cloud
```

Deployment:

```text
GitHub
   ↓
GitHub Actions
   ↓
GHCR
   ↓
Private VPS
   ↓
Docker Compose
```

---

# 11. Decisions We Explicitly Did NOT Make

The following remain intentionally absent:

```text
Redis as mandatory infrastructure

Kafka

RabbitMQ

Elasticsearch/OpenSearch

Kubernetes

microservices

serverless backend

Prisma

NestJS

local filesystem media authority

provider-specific courier domain model

self-hosted observability stack on commerce VPS
```

These are not forbidden forever.

They require evidence.

---

# 12. Implementation Guardrails

From this point forward, an implementation agent must not independently decide to introduce:

```text
another ORM

another job queue

another auth system

another search authority

another storage backend abstraction

another HTTP framework
```

without an ADR amendment.

---

# 13. Dependency Version Policy

Do not write architecture around:

```text
latest
```

floating packages.

At repository bootstrap:

```text
Node major/minor baseline fixed

pnpm version fixed

dependency versions locked

lockfile committed

container base-image digest tracked where appropriate
```

Major framework upgrades require deliberate review.

---

# 14. Database Extension Baseline

Initial expected PostgreSQL extensions/features include:

```text
pg_trgm

pg_stat_statements
```

plus built-in PostgreSQL 18 capabilities such as:

```text
uuidv7()
```

Additional extensions require review.

---

# 15. Revised Implementation Sequence

Because the PostgreSQL specification already exists, the correct next steps are now:

```text
BLOCKING TECHNICAL ADR PACK
        ↓
EXISTING POSTGRESQL SPEC RECONCILIATION
        ↓
PHYSICAL MIGRATION BLUEPRINT
        ↓
REPOSITORY BOOTSTRAP
        ↓
FOUNDATION MIGRATIONS
        ↓
PLATFORM + IAM
        ↓
CATALOG VERTICAL SLICE
```

---

# 16. Existing PostgreSQL Specification Must Be Updated

Current:

```text
docs/architecture/postgresql-schema-specification.md
v0.1
```

should become:

```text
v0.2
```

with these ADR decisions merged.

Required changes include:

```text
Kysely/SQL migration assumptions

PostgreSQL 18 hard baseline

uuidv7() DB defaults

exact NUMERIC precision policy

auth tables required by Better Auth

hashed/encrypted auth secondary storage

session metadata registry

job claim indexes

SKIP LOCKED lease semantics

pg_trgm extension

pg_stat_statements extension

search GIN/trigram indexes

R2 object metadata assumptions

deployment/migration metadata
```

---

# 17. Important Schema Reconciliation Topics

The next pass should also verify earlier domain additions are all reflected:

```text
Pricing

Inventory Costing / COGS

Returns / RTO

Delivery

Geography
```

because several of those were designed **after** the first PostgreSQL schema specification.

This means the next schema work is not merely:

```text
"change Kysely syntax."
```

It is:

> **Reconcile the complete final domain architecture against the physical relational model and detect anything the earlier schema specification is still missing.**

---

# 18. Next Document

Recommended next source-of-truth artifact:

```text
docs/implementation/postgresql-schema-reconciliation-migration-blueprint.md
```

It should:

```text
audit every domain against the existing PostgreSQL schema

identify missing/obsolete tables

resolve naming conflicts

finalize column types

finalize constraints

finalize indexes

finalize tenant-safe FKs

finalize delete/archive behavior

finalize lock strategy

finalize migration order

split the schema into deployable migration stages
```

---

# 19. Desired Migration Stages

Initial direction:

```text
000 Platform foundations

010 IAM/Auth

020 Audit/Integration infrastructure

030 Catalog

040 Sizing

050 Media

060 Geography

070 Warehouse

080 Inventory

090 Customers

100 Pricing

110 Promotions

120 Cart/Checkout

130 Orders

140 Payments

150 Fulfillment

160 Delivery

170 Procurement

180 Inbound Shipment

190 Landed Cost

200 Costing

210 Returns

220 Finance

230 Reviews

240 Notifications

250 Search

260 Analytics

270 Integrity/Operational projections
```

Exact migration files should be derived during the next pass.

---

# 20. Technical Readiness Gate

After this ADR pack, these choices are considered resolved:

```text
✓ Node runtime

✓ HTTP framework

✓ request schema system

✓ OpenAPI generation

✓ PostgreSQL access layer

✓ migration runner direction

✓ ID generation

✓ monetary/quantity precision direction

✓ authentication engine

✓ authorization ownership

✓ session architecture

✓ MFA foundation

✓ object storage

✓ job queue

✓ worker model

✓ reverse proxy

✓ TLS

✓ search engine

✓ observability architecture

✓ CI/CD

✓ container registry

✓ production deployment model
```

---

# 21. Remaining Engineering Questions

These are implementation-level, not blockers to the overall architecture:

```text
exact pool sizes

exact Caddy rate/size limits

exact Grafana alert thresholds

exact worker concurrency

exact R2 custom-domain configuration

exact PostgreSQL index parameters

exact frontend API client-generation tool

exact deployment maintenance window behavior
```

These should be decided from implementation/testing evidence.

---

# 22. Final ADR Principle

> **Maevelle begins with a deliberately boring infrastructure stack—Node, Fastify, PostgreSQL, Docker and S3-compatible storage—while placing the sophistication inside the business model, transactions, correctness guarantees and operational recovery where it actually matters.**

---

**End of Blocking Technical ADR Pack v0.1**
