# Architecture Decision Records

## ADR-001 — Messaging remains in the modular monolith

**Decision:** Add messaging domain modules to the existing API/worker/database/frontends, not a microservice.

**Context:** One VPS, one PostgreSQL authority, existing modular-monolith conventions and no independent scaling/compliance boundary.

**Alternatives:** standalone service/database; third-party helpdesk as system of record.

**Rationale:** Local transactions with customers/outbox/audit, fewer failure modes and no duplicated IAM/operations. External providers remain adapters.

**Consequences:** Modules require disciplined boundaries; API/worker deployments share repository releases. Revisit only after independently measured scaling, isolation, team ownership or compliance need.

## ADR-002 — HTTP commands plus replayable SSE

**Decision:** HTTP for mutations/queries; SSE for server-to-browser persisted events.

**Alternatives:** WebSockets, polling, broker-backed pub/sub.

**Rationale:** Predominantly server→client updates, native reconnect, simple Caddy support, and database cursor replay without new infrastructure.

**Consequences:** Typing is ephemeral/best effort; client commands remain HTTP. Revisit if required bidirectional frequency or multi-node fan-out makes SSE/poll hints inadequate.

## ADR-003 — Strict per-conversation sequence

**Decision:** Lock/update conversation row to allocate a bigint sequence for every canonical message.

**Alternatives:** timestamp/UUID order, provider order, global sequence.

**Rationale:** Deterministic pagination/gap detection under concurrency with only local contention.

**Consequences:** Hot single conversations serialize inserts briefly; provider timestamps remain evidence. Revisit if one conversation sustains write rates beyond PostgreSQL row-lock capacity.

## ADR-004 — Durable acceptance, at-least-once delivery

**Decision:** Persist message and delivery intent before network calls; idempotent acceptance and provider-event processing; explicit unknown outcome/reconciliation.

**Alternatives:** synchronous provider send before commit; claim exactly-once delivery.

**Rationale:** Survives restarts/timeouts and describes real network guarantees honestly.

**Consequences:** UIs show queued/failure states and operations need reconciliation tooling.

## ADR-005 — Messaging contact identity is separate from customer

**Decision:** Channel identities map to messaging contacts; customer link is optional, verified and audited.

**Alternatives:** create a customer for every chat; auto-merge by name/email/phone; place provider IDs on customer.

**Rationale:** Guests/provider identities are not verified commercial identities. Existing customer domain remains canonical.

**Consequences:** Context is unavailable until linking; operators may review duplicates. Customer merge events must update/repoint links safely.

## ADR-006 — Opaque visitor cookie credential

**Decision:** High-entropy secret in HttpOnly Secure SameSite cookie; only keyed digest stored; rotate/revoke/expire.

**Alternatives:** public conversation token in localStorage, mandatory account, IP fingerprint.

**Rationale:** Guest continuity without exposing reusable credentials to JavaScript or assuming unstable identifiers.

**Consequences:** Cross-device history requires authentication/verification; CSRF/same-origin and abuse controls remain necessary.

## ADR-007 — Capability-aware adapters

**Decision:** Core normalized commands plus runtime capability/reply-eligibility contract; provider adapters own translation and error classification.

**Alternatives:** lowest-common-denominator model; provider conditions scattered through routes/UI.

**Rationale:** Preserves one inbox while preventing false support claims and core-to-Meta coupling.

**Consequences:** UI must render capability reasons; adapter contract has versioned tests.

## ADR-008 — Reuse outbox/jobs/media/notifications without overloading them

**Decision:** Reuse platform primitives and ports, but keep messages, delivery attempts, provider inbox and private attachment linkage domain-owned.

**Alternatives:** store chat as notifications/webhooks; introduce a second queue/storage system.

**Rationale:** Existing primitives solve cross-cutting mechanics, while messaging data has distinct order/privacy/lifecycle semantics.

**Consequences:** Some parallel tables are intentional domain state, not duplication.

## ADR-009 — Cursor pagination and derived inbox projections

**Decision:** Opaque keyset cursors for messages/inbox; conversation keeps last-message and activity projections; read state is per principal.

**Alternatives:** page/offset, full joins/counts, shared unread counter.

**Rationale:** Stable under inserts and efficient for growing collections/multiple agents.

**Consequences:** Filter/sort shape is part of cursor fingerprint; changed filters require a new cursor.

## ADR-010 — Permanent Phase 03 staff composition

**Decision:** Phase 03 ships the `/admin/messaging` route and reusable feature components; Phase 05 expands them.

**Alternatives:** temporary debug console or duplicated website-only staff UI.

**Rationale:** Storefront chat is not usable without staff response, and throwaway UI creates contract/component drift.

**Consequences:** Phase 01/02 contracts must serve both final Admin and Storefront needs; Phase 03 has production quality even if fewer operational panels.

## ADR-011 — No new package/infrastructure by default

**Decision:** Native EventSource/fetch, existing validation/storage/worker/UI dependencies; add virtualization/scanning/provider libraries only on demonstrated need.

**Rationale:** Smaller bundle/attack/operational surface on cost-conscious VPS.

**Revisit:** Package evaluation at each implementation phase follows current official docs and compatibility checks.
