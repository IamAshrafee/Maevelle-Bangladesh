# Performance, Operations, Packages, and Folder Architecture

## Performance targets

These are design targets, not measured baselines.

| Path | Target under normal single-VPS load |
|---|---|
| Accept website/staff text message | p95 < 250 ms to durable 2xx/202 |
| Conversation list query | p95 < 350 ms, first 30 rows |
| Message history query | p95 < 250 ms, 50 messages |
| Conversation switch usable | p75 < 500 ms on warm mobile network |
| Commit-to-SSE delivery | p95 < 1 s, p99 < 3 s |
| Provider worker pickup | p95 < 2 s when healthy |
| Local UI input response | < 100 ms; scroll/frame work < 16 ms where feasible |
| Storefront chat initial feature chunk | <= 45 KiB gzip beyond shared framework runtime |
| Primary indexed DB queries | p95 < 100 ms at initial expected volume |

Measure before optimizing. Add query timing by operation name and `EXPLAIN (ANALYZE, BUFFERS)` in non-production with representative data before changing indexes/caches.

## Resource model

- Database: use existing per-process pool. SSE handlers do not hold a connection; they acquire only for replay/poll queries.
- SSE: one visitor stream and up to three staff streams per session; 15-second keepalive; server closes/recycles after 30 minutes; backpressure/slow consumers are disconnected to replay later.
- Replay query: maximum 500 events per batch and bounded catch-up cycles.
- Worker: per-channel bounded delivery concurrency (initial website 20, each Meta connection 5; configuration bounded), per-tick batch 50; no unbounded `Promise.all`.
- Messages: cursor pages 30/50 default, 100 max. Inbox summaries avoid message-body joins through last-message projection.
- Attachments: direct presigned/private upload where storage supports it; image processing in media worker; no large buffers in API.
- No cache initially. Add only for measured, rebuildable read pressure with explicit invalidation.

## Observability

Structured operation names and fields:

- `messaging.message.accepted`: organization, conversation/message/sequence, direction, channel, latency;
- `messaging.delivery.attempt`: intent/message/connection, attempt, outcome, provider safe code, latency;
- `messaging.provider.event`: connection/event/type, dedupe outcome, processing lag;
- `messaging.sse.connection`: principal class, connect/reconnect cursor, duration, events sent, slow-consumer close;
- `messaging.authorization.denied`: actor/principal, capability, target class (no message data);
- `messaging.connection.health`: status, token expiry proximity, safe error;
- slow query: query name, duration, row count, organization ID; never interpolated SQL/body.

Metrics/counters: accepted inbound/outbound by channel, send success/failure/unknown, retry/dead-letter count, provider event lag, oldest pending intent age, SSE active/reconnect/gap, unread/actionable counts, first-response/resolution duration, attachment reject/quarantine, auth/rate-limit failures. Alerts initially can be log/runbook-driven; do not require a new monitoring stack for Phase 01.

## Deployment implications

- No new service in Phase 01. API, worker, PostgreSQL and Caddy remain.
- Add environment validation for SSE limits/retention and later provider secrets; secrets never have development defaults in production.
- Verify Caddy streams `text/event-stream` without buffering/compression delays and supports longer upstream reads. Configure route-specific timeouts only after testing.
- API health remains independent of Meta. Connection health is a domain diagnostic, not global readiness.
- Schema migration runs before API/worker as current compose does. Deploy additive-compatible code where possible: schema → worker/API → UIs.
- Rollback application processes without deleting schema/data. Pause new provider delivery if an adapter must roll back; preserve queued intents for reconciliation.
- Backup coverage must include PostgreSQL plus private media volume/object bucket. Secrets require separate secure recovery procedure.

## Package matrix

| Package/capability | Existing/new | Phase | Decision |
|---|---|---|---|
| Fastify + TypeBox provider | existing | 01+ | Use for routes/runtime validation; no new schema library in API. |
| OpenAPI generator | not installed | 01+ | Keep TypeBox route schemas and this contract catalog authoritative initially; evaluate official Fastify Swagger packages only if the repository adopts generated OpenAPI across APIs. |
| `@maevelle/contracts` | existing | 01+ | Add messaging DTOs/event schemas and cursor types. |
| Kysely + `pg` | existing | 01+ | SQL transactions, locks, cursor queries, worker leases. |
| Better Auth | existing | 01+ | Staff/customer identity only; visitor session stays domain-specific. |
| Pino | existing | 01+ | Structured logs with expanded redaction. |
| `@maevelle/media`, Sharp, AWS S3 client | existing | 02+ | Private attachment storage/processing; add purpose/policy. |
| Base UI, shadcn, Tailwind v4 | existing Admin | 03+ | Reuse primitives/tokens. |
| React resizable panels | existing Admin | 05 | Desktop/tablet three-pane composition. |
| React Hook Form + Zod | existing Admin | 04/05 settings | Reuse for complex settings forms; HTTP contracts remain TypeBox. |
| `date-fns` | existing Admin | 03+ | Relative/calendar presentation; server stores UTC. |
| list virtualization | new only if measured | 05 | Prefer no package initially; evaluate `@tanstack/react-virtual` current stable if transcript/list evidence requires it. |
| SSE client package | none | 02/03 | Native `EventSource` is sufficient with cookie auth; custom wrapper handles cursor/reconnect. |
| WebSocket package | none | — | Not needed. |
| Meta SDK | none | 06/08 | Prefer typed native `fetch`; reevaluate official maintained tooling at implementation time. |
| Redis/broker/queue package | none | — | Not needed on current topology. |
| web push | new, optional | 05+ | Not recommended until product opts into service worker/PWA and browser matrix work. |
| malware scanner client | integration TBD | 02 | Keep a scanning port/status; production attachment types remain restricted until an approved scanner/service exists. |

Any dependency addition must repeat official documentation/release/compatibility review at that future phase. Phase 00 installed nothing.

## Annotated source tree

Existing paths are unmarked; `[new]` is proposed.

```text
packages/contracts/src/messaging/                         [new]
  common.ts             # branded/opaque DTO IDs, cursors, envelopes
  conversations.ts      # list/detail/message contracts
  storefront.ts         # visitor/config/upload contracts
  events.ts             # versioned SSE payloads
  admin.ts              # operations/settings/report contracts
  providers.ts          # safe connection/capability DTOs

packages/database/src/messaging/                         [new]
  types.ts
  errors.ts
  conversations.ts      # transactional lifecycle/sequence rules
  messages.ts            # accept/query/read
  contacts.ts             # identity/link rules
  assignments.ts
  operations.ts           # notes/tags/saved replies/settings
  realtime.ts             # durable events/replay
  delivery.ts             # intents/attempt persistence and leases
  provider-events.ts      # durable webhook inbox
  reporting.ts
  index.ts
packages/database/src/migrations/NNNN_messaging.ts         [new mutable baseline]

apps/api/src/messaging/                                  [new]
  authorization.ts
  services/              # orchestration and ports
  adapters/
    website.ts
    meta-client.ts        # phase 06
    facebook.ts           # phase 06
    instagram.ts          # phase 08
  schemas/                # TypeBox boundary schemas
apps/api/src/routes/messaging/                            [new]
  storefront.routes.ts
  admin.routes.ts
  events.routes.ts
  connections.routes.ts
  meta-webhooks.routes.ts

apps/worker/src/messaging/                                [new]
  delivery-worker.ts
  provider-event-worker.ts
  retention-worker.ts

apps/admin/app/messaging/page.tsx                         [new]
apps/admin/features/messaging/                            [new; detailed in UX doc]
apps/storefront/features/chat/                            [new; detailed in UX doc]

docs/architecture/messaging/                             # this Phase 00 reference
```

Avoid a new workspace package for messaging core until an actual deployable/package boundary needs it. Database/application functions can stay in the database package convention, while API orchestration/adapters stay in API and worker handlers in worker. If implementation reveals business rules being duplicated between API/worker, move only the stable pure rules into `packages/core/src/messaging`.

## Operational runbooks required before provider launch

- Failed/unknown outbound reconciliation and controlled retry.
- Dead-letter provider event inspection/replay.
- Token expiry/revocation/reconnect.
- Connection disconnect without transcript deletion.
- SSE overload/degraded fallback to bounded polling.
- Attachment quarantine/purge/object missing.
- Privacy export/hold/anonymization/deletion.
- Database restore plus private-media referential verification.
