# Omnichannel Messaging Architecture

**Status:** Phase 00 complete — implementation reference
**Date:** 2026-10-21
**Scope:** Storefront live chat, unified Admin inbox, Facebook Messenger, and Instagram Direct
**Authority:** Current source and migrations outrank historical design documents. This design does not authorize a production migration or provider connection.

## Decision summary

Maevelle will implement messaging as a domain module in the existing modular monolith. PostgreSQL remains the transactional authority. The API accepts commands and serves queries; server-sent events (SSE) deliver replayable persisted changes; the existing worker leases durable jobs and delivers outbound provider messages. Storefront, Facebook, and Instagram are capability-aware channel adapters around one conversation/message model.

The design deliberately does **not** introduce Redis, a broker, a messaging microservice, a Meta SDK, or a second customer database. AI, WhatsApp, email ticketing, and voice/video are outside Phases 01–09.

## Reading order

1. [Codebase audit](00-codebase-audit.md)
2. [Requirements and system architecture](01-system-architecture.md)
3. [Database design](02-database-design.md)
4. [API and event contracts](03-api-and-event-contracts.md)
5. [Realtime, reliability, identity, and security](04-realtime-reliability-security.md)
6. [Storefront and Admin UX](05-storefront-admin-ux.md)
7. [Meta integration design](06-meta-integrations.md)
8. [Performance, operations, packages, and folders](07-operations-packages-folders.md)
9. [Architecture decisions](08-adrs.md)
10. [Phase roadmap and Phase 01 handoff](09-roadmap-and-phase-01-handoff.md)
11. [Phase 00 architecture review](10-architecture-review.md)

## Architecture at a glance

```mermaid
flowchart LR
  SW[Storefront widget] -->|HTTP commands / SSE| API[Fastify API]
  AW[Admin messaging workspace] -->|HTTP commands / SSE| API
  FB[Facebook webhooks] -->|signed events| API
  IG[Instagram webhooks] -->|signed events| API
  API --> CORE[Messaging application services]
  CORE --> DB[(PostgreSQL)]
  CORE --> MEDIA[Existing private media storage]
  DB --> WORKER[Existing worker]
  WORKER --> ADAPTERS[Channel adapters]
  ADAPTERS --> FBAPI[Messenger Platform API]
  ADAPTERS --> IGAPI[Instagram Messaging API]
  WORKER --> NOTIFY[Existing notification domain]
  DB --> SSE[SSE event reader]
  SSE --> SW
  SSE --> AW
```

## Non-negotiable invariants

- Every business row is organization-scoped; cross-organization joins use organization-qualified FKs.
- An authenticated staff identity is not authorization. Every Admin operation is capability checked on the server.
- A channel identity is not automatically a Maevelle customer. Linking requires an authenticated account relationship, verified contact proof, or an audited staff decision.
- A message is persisted before external delivery. Delivery is at-least-once at transport boundaries and idempotent at Maevelle boundaries; exactly-once network delivery is not claimed.
- `conversation.sequence` defines canonical message order. Provider timestamps are evidence, not ordering authority.
- Provider capabilities and reply eligibility are evaluated before accepting an outbound operation.
- Message bodies and private attachment URLs are not written to ordinary logs, notifications, or analytics payloads.
- Phase 03's staff surface is the first composition of permanent inbox components, not throwaway UI.

## Phase 01 readiness

Phase 01 can begin. It should implement the schema and service contracts in [the handoff](09-roadmap-and-phase-01-handoff.md#phase-01-implementation-handoff), beginning with core tables, transactional message acceptance, outbox events, authorization capabilities, cursor queries, and the SSE replay endpoint. Website visitor credentials, widget routes, and storefront-specific behavior remain Phase 02.
