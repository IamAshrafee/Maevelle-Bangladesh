# Phase 01 Implementation Record and Phase 02 Handoff

**Completed:** 2026-10-21  
**Scope:** Messaging core backend foundation

## Implemented foundation

- Shared browser-safe DTOs and delivery outcomes are exported from `@maevelle/contracts/messaging`.
- Migration `3200_messaging_core` creates tenant-qualified channel connections, contacts and identities, conversations, messages and attachments, external references, delivery intents/attempts, durable realtime streams/events, minimal read cursors, and the five Phase 01 capabilities.
- Internal services create connections, contacts/identities and conversations; accept trusted inbound messages; prepare staff outbound messages; query list/detail/history; claim and transition conversations; advance read cursors; and replay events.
- Message acceptance uses the platform idempotency record and one database transaction for sequence allocation, canonical message persistence, references, delivery intent where applicable, conversation projection, realtime event, outbox event, audit evidence for staff actions, and the safe idempotency result.
- The existing worker has a bounded `ChannelAdapterRegistry` processor. It records every attempt, leases work with `SKIP LOCKED`, applies retry backoff, stops permanent failures, preserves unknown outcomes for reconciliation, reclaims expired leases, and purges expired realtime events.
- Fastify exposes the Phase 01 Admin list, detail, history, reply, read, claim, status, and SSE routes. Better Auth session resolution, organization context, capability checks, assignment-aware visibility, TypeBox input validation, mutation rate limiting, optimistic versions, and structured errors apply at the boundary.
- The notification outbox catalog creates a compact in-app staff-attention notification for inbound messages. Transcript text is not copied into notification or event payloads.

## Realtime ordering and recovery

PostgreSQL identity values are not commit-order cursors. Phase 01 therefore added `messaging.realtime_streams`, one row per organization. Event insertion increments that row and inserts the event in the same SQL statement and surrounding business transaction. The row lock is retained until commit, so another transaction in the same organization cannot publish a later cursor before the earlier event commits. Different organizations do not serialize each other.

The SSE route polls this durable log, supports `cursor` and `Last-Event-ID`, emits 15-second keepalives, revalidates the session and capabilities every 30 seconds, limits concurrent streams per membership, closes after 30 minutes for browser reconnection, and aborts streams during request or server shutdown. Cursors older than `retained_from_sequence` receive `410 EVENT_CURSOR_EXPIRED` before streaming begins.

## Deliberate architecture adjustments

1. Minimal `conversation_read_cursors` moved from Phase 04 to Phase 01 because the approved Phase 01 Admin read route and per-agent unread projection require durable state. Advanced read/assignment workflows remain Phase 04.
2. The realtime replay cursor is organization-scoped `stream_sequence`, not the global identity column. This fixes the commit-order race described above and avoids a global cross-tenant lock.
3. The proposed website-only active-conversation unique index is deferred to Phase 02. PostgreSQL cannot make the index predicate depend safely on the joined connection kind, and applying it to every channel would incorrectly prevent multiple provider threads for one identity. Phase 02 must enforce and test the website-specific invariant when the website connection/session model is added.

## Verification evidence

- Clean disposable database migration and rerun: passed.
- Messaging database integration suite: tenant isolation, atomic acceptance evidence, idempotency replay/conflict, eight concurrent contiguous sequences, single-winner concurrent claim, ordered replay, expired cursor, adapter absence, accepted/transient/permanent/unknown outcomes, and expired lease recovery passed.
- Messaging API authentication boundary test passed.
- Contracts, Database, API, and Worker focused TypeScript builds passed.

## Phase 02 entry points

Phase 02 should use `createChannelConnection`, `createContactIdentity`, `createConversation`, `acceptInboundMessage`, `prepareOutboundMessage`, `listMessages`, and the `ChannelAdapterRegistry`; it should not write canonical message/delivery/event rows directly. It owns:

- one active website connection and the website-only active-conversation invariant;
- opaque visitor credentials and session rotation/revocation;
- public Storefront chat config/session/conversation/message/read/events routes;
- website delivery adapter registration;
- private attachment upload authorization and scanning/quarantine integration; and
- focused guest ownership, abuse, resume, reconnect, and customer-link transition tests.

No provider credentials, public guest routes, widget UI, advanced inbox workflow, or Meta behavior were added in Phase 01.
