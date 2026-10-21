# Phase Roadmap and Phase 01 Handoff

## Cross-phase ownership matrix

| Phase | Owns | Required inputs / reuse | Excludes | Definition of done and verification |
|---|---|---|---|---|
| 01 Core backend — complete | core schema; conversation/contact/message services; delivery intents; realtime log/SSE; permissions; shared contracts; worker handlers/ports; minimal read cursors | IAM context, customer IDs, audit, idempotency, outbox/jobs, notifications/media ports | visitor cookie/widget, operational notes/rules/reports, Meta | verified by fresh migration; focused tenant isolation, sequence/idempotency/concurrency/replay/delivery tests; API/DB/worker typecheck |
| 02 Website backend | visitor sessions; website connection/config; public chat APIs; website adapter; private upload authorization; hours/offline behavior | Phase 01 contracts/services, Storefront org resolver, media | customer UI and staff workspace presentation | guest/resume/send/history/read/reconnect/upload flow; abuse/auth tests |
| 03 Website UI + basic staff | lazy Storefront widget; permanent Admin list/conversation/composer/claim/status; shared messaging feature composition | Phase 02 APIs/SSE; Admin primitives | full notes/tags/rules/reports/Meta filters | mobile/desktop end-to-end customer↔staff, focused accessibility/responsive/build checks |
| 04 Admin backend | advanced assignments/read workflows, priorities, notes, tags, saved replies, hours/rules, availability, search, customer context, reports, bulk operations | core, IAM, customer/order services, notifications | complete workspace UI | transition/claim/reassign authorization/concurrency/report tests and API contracts |
| 05 Admin UI | full mobile/tablet/desktop workspace; context; notes/tags/saved replies/settings/reports; optional notification permission UX | Phase 04, existing Admin system | provider backend | workflow/responsive/a11y checks across widths; no duplicate Phase 03 components |
| 06 Facebook backend | OAuth/connection, typed Graph client, signature/webhook inbox, FB normalization/delivery/reconciliation/health | official approval/assets, provider core | Facebook-specific UI polish | sandbox fixtures and live test Page inbound/outbound/window/revocation evidence |
| 07 Facebook frontend | connection setup/health, Facebook capability/status presentation and filters | Phase 06, Phase 05 workspace | Instagram backend | owner connection flow and operational error recovery verified |
| 08 Instagram backend | Instagram OAuth/connection path, webhook normalization/delivery/reconciliation and capability rules | official approval/pro account, shared Meta infrastructure | Instagram UI | sandbox/pro account flows, request/window/token failures verified |
| 09 Instagram frontend | setup/health, Instagram filters/content/capability presentation | Phase 08, unified workspace | new channels/AI | full omnichannel UI consistency and owner walkthrough |

Each phase updates contracts and docs when actual behavior changes and leaves the next handoff explicit. A consumer does not gain ownership of a shared service merely by using it.

## Design-time user stories and acceptance criteria

### Storefront

- New guest: receives an opaque credential and one website contact identity; no customer record/order access is created.
- Send/receive: duplicate submission returns the same message; staff reply arrives by SSE and history reconciliation.
- Navigation/reload/browser reopen: cookie resumes; clean page/product context may be appended; message sequence remains continuous.
- Interrupted network: accepted message reconciles by client ID; unaccepted draft remains retryable with same key.
- Attachment: disallowed/oversized file rejects before upload; allowed private object remains quarantined until policy allows; only conversation principals can download.
- Outside hours: widget states that support is offline, accepts an offline message if configured, sends at most one deterministic autoresponse per conversation/time rule.
- Later login: only an existing verified customer-account relationship can auto-link; ambiguous identity creates review, not merge.

### Administration

- New inbound conversation appears in eligible inbox with unread state/notification.
- One of simultaneous claimers wins; loser sees conflict/current assignee.
- Reply is accepted durably before delivery and exposes queued→delivered/failed transitions.
- Saved reply inserts editable text and records revision used.
- Internal note never reaches customer/provider and is capability protected.
- Customer/order context appears only for linked customer plus context permission.
- Resolve records actor/reason/time; later inbound reopens and notifies.
- Supervisor reassigns conditionally; all viewers receive event/reconcile.
- Settings mutations validate, version, audit and never expose provider secrets.
- Mobile agent can list/open/read/reply/claim/resolve without rotation or hover.

### Reliability/security

- Duplicate provider event/external message produces one canonical message.
- Transient send retries with recorded attempt; permanent failure stops; unknown outcome reconciles without blind duplicate.
- Worker restart reclaims lease and resumes idempotently.
- Expired realtime cursor returns 410 and client refetches current list/history.
- Expired/revoked token degrades only that connection and creates an operational alert.
- Unauthorized/cross-organization access returns no content and produces safe audit/log evidence.
- Unsupported provider feature is rejected explicitly, never represented as success.

## Phase 01 implementation handoff

### Start here

Read in order:

1. `docs/architecture/messaging/01-system-architecture.md`
2. `docs/architecture/messaging/02-database-design.md`
3. `docs/architecture/messaging/03-api-and-event-contracts.md`
4. `docs/architecture/messaging/04-realtime-reliability-security.md`
5. this handoff and ADRs.

Inspect current source before editing because the branch was behind remote during Phase 00. Preserve Product Completion state and any new dirty work.

### Exact existing integration points

- Migrations/registry: `packages/database/src/migrations/index.ts`; follow SQL-first domain migration style and mutable-baseline policy.
- Platform primitives: `packages/database/src/platform.ts`, migrations `0001_platform_core.ts`, `0002_audit_foundation.ts`, `0003_platform_operations.ts`.
- IAM/admin context: `packages/database/src/iam*.ts`, `apps/api/src/auth/auth.ts`, `apps/api/src/routes/admin-context.ts`, `apps/api/src/authorization/location-scope.ts`.
- Route registration: `apps/api/src/app.ts` → `routes/auth.ts`; split messaging registrars rather than growing one route file.
- Worker: `apps/worker/src/worker.ts`; add bounded messaging processors, do not create a second scheduler.
- Customer linking/context: `packages/database/src/customers.ts`, `customers/accounts.ts`, `customers/timeline.ts`, order queries/timeline/delivery services.
- Media: `packages/database/src/media/*`, `packages/media`, `apps/api/src/routes/media.ts`, `apps/worker/src/media-jobs.ts`.
- Notifications: `packages/database/src/notifications.ts`, `apps/api/src/routes/notifications.ts`, `apps/worker/src/worker.ts`.
- Contracts: `packages/contracts/src`; create focused messaging files and exports.
- Logs/config: `packages/observability/src/index.ts`, `packages/config/src/index.ts`.

### Required implementation order

1. Define `@maevelle/contracts/messaging` core DTOs, cursor/event schemas, enums and safe errors. Avoid exporting persistence rows.
2. Add mutable-baseline `messaging` migration with Phase 01 tables/capabilities/indexes exactly as specified; register explicitly.
3. Implement focused persistence/application modules for contacts, conversations, messages, delivery and realtime.
4. Implement transactional `acceptInboundMessage`, `prepareOutboundMessage`, `transitionConversation`, `assign/claim`, `markRead` and query functions. Use organization-qualified predicates/FKs everywhere.
5. Add Admin minimum routes and SSE endpoint with TypeBox schemas/canonical envelopes. Add route-specific process-local limits as defense-in-depth.
6. Add worker delivery lease/recovery skeleton and `ChannelAdapter` registry with a non-network website adapter contract. Phase 01 need not expose public website routes.
7. Integrate staff attention notification port without placing transcript bodies in notification data.
8. Add focused tests and documentation corrections found during implementation.

### Phase 01 transaction boundaries

Message acceptance transaction must:

- authenticate/authorize before entry;
- atomically claim/replay idempotency record and verify request fingerprint;
- lock conversation/allocate sequence;
- insert canonical message and external/client reference;
- update last-message/activity/status/version projections;
- insert delivery intent for outbound messages;
- append compact realtime event and platform outbox event;
- append audit for staff actions where required;
- commit before any notification/provider/network action.

Inbound normalization may create contact/identity/conversation in this same transaction. Assignment/status commands lock or conditionally update the conversation and append history/audit/events together.

### Phase 01 API subset

Implement Admin list/detail/history/reply/read/events/claim/status routes from the contracts document. They serve Phase 03 and must already support `channelKind` even though only website is active later. Do not expose provider OAuth/webhooks or visitor endpoints.

### Essential focused checks

- Clean database constructs from migration set; intended tables, FKs, unique constraints and indexes exist.
- Two organizations cannot reference/read/mutate each other's contact/conversation/message/attachment/event.
- Concurrent message inserts allocate unique contiguous per-conversation sequences.
- Same idempotency key/same body replays; same key/different body rejects; in-progress behavior is deterministic.
- Concurrent claims produce one assignee; stale versions conflict.
- Message + delivery intent + outbox + realtime event commit or roll back together.
- Worker lease expiry/retry and unknown/permanent outcome transitions.
- SSE authorization, replay order, duplicate tolerance, cursor expiry, slow-client disconnect.
- Capability denials for view/reply/claim/status/context paths.
- Logs/errors do not include body/token/credential/private URL.
- Focused DB/API/worker typechecks/tests and `git diff --check`; no full suite unless cross-cutting evidence requires it.

### Phase 01 exclusions

- No public guest cookie/session or Storefront route/widget.
- No live Meta API calls, credentials, OAuth or webhooks.
- No notes/tags/saved replies/business-hours/rules/reporting UI or full backend.
- No web push, broker, Redis, WebSockets, search engine, AI or new deployable.
- No database rebuild/deployment/production mutation unless separately authorized by the owner.

### Phase 01 handoff to Phase 02

Phase 02 should receive:

- migrated core schema and capability seeds;
- stable messaging contracts and service entry points;
- functional message/list/history/realtime behavior;
- website adapter port and private attachment port;
- documented sequence/idempotency/retry guarantees;
- focused verification evidence and any deviations from this design.

## Overall completion risks and assumptions

- Meta approval/assets are external blockers for Phases 06/08, not Phase 01.
- Current process-local rate limiting matches one API replica; a shared limiter becomes mandatory before horizontal API scaling or if abuse evidence requires it.
- Malware scanning technology is undecided; production attachment scope must remain conservative until resolved.
- Retention and Bangladesh privacy/legal obligations require owner/legal validation before launch.
- Performance targets and Caddy SSE behavior are unmeasured and must be verified in implementation.
- The repository's mutable migration policy may change before implementation; if so, use forward-only migrations.
