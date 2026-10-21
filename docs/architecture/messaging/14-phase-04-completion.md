# Phase 04 Unified Inbox and Messaging Operations Backend Completion

**Status:** Complete
**Completed:** 2026-10-22
**Next boundary:** Phase 05 Admin Messaging Workspace

## Delivered capability

Phase 04 extends the existing canonical messaging core instead of creating a
parallel inbox service. PostgreSQL remains authoritative for conversations,
messages, collaboration state, operational history, durable realtime events and
notification jobs.

The backend now includes:

- a server-paginated inbox with stable, filter-bound cursors; full-text-like
  contact, identity, message and order-reference search; operational scopes;
  status, channel, priority, assignee, tag, unread, star, reply-needed,
  follow-up and date filters; and stable sorting;
- capability-authorized assignment, reassignment, unassignment, claim,
  priority, star, lifecycle and bounded bulk operations with optimistic
  concurrency and per-item outcomes;
- eligible-agent discovery, durable availability and heartbeat state, stale
  presence handling, capacity-aware deterministic assignment rules and complete
  assignment history;
- immutable internal-note revisions, soft deletion, organization-qualified
  tags, saved replies, conversation activity timelines and durable Admin
  realtime events without exposing private collaboration data to Storefront
  clients or provider delivery queues;
- linked-customer context with customer, order, payment, fulfillment, delivery,
  return and product-browsing evidence, plus permissioned and audited manual
  contact linking/unlinking and verified contact search;
- timezone-aware weekly business hours, date exceptions, manual closure,
  overnight intervals, offline messaging policy and channel greeting/offline
  configuration;
- durable follow-up creation, editing, completion, cancellation, inbox
  projection, overdue processing and exactly-once reminder enqueue behavior;
- assignment and follow-up notifications integrated with the existing
  notification preference and outbox processors; and
- bounded operational reporting for conversation state, message volume,
  reopened work, unanswered work, response/resolution time, follow-ups,
  channels and agents.

## Authoritative boundaries

- Authentication establishes identity only. Every Admin route checks an
  explicit messaging capability and every query or mutation is organization
  scoped.
- Assignment targets must be active, eligible memberships in the same
  organization. Customer links must target an active customer in that same
  organization and retain method, reason and actor evidence.
- Internal notes are never messages. Editing creates a new note row and links
  the prior revision through `superseded_by_note_id`; deletion is a reasoned
  soft delete.
- Saved replies are editable text resources. Creating or changing one never
  sends a customer message.
- Follow-up reminders are leased from durable database state and marked in the
  same transaction as notification/realtime enqueueing.
- Business-hours evaluation uses the stored IANA timezone and accounts for
  intervals crossing midnight. The existing Storefront configuration contract
  remains backward compatible.
- Reporting is computed from bounded authoritative data. A precomputed daily
  projection is intentionally not maintained until observed volume justifies
  that additional consistency mechanism.

## Schema and operations

The mutable development baseline migration `3200_messaging_core.ts` owns the
new assignment event, conversation event, internal note, tag, saved reply,
business-hours, availability, assignment-rule and follow-up tables. Tenant-
qualified foreign keys, uniqueness constraints, state checks and targeted
indexes keep the clean-database path authoritative.

The worker now processes deterministic assignment rules and due follow-up
reminders alongside the existing messaging delivery and notification workers.
No broker, Redis deployment, second audit system or second customer model was
introduced.

## Verification evidence

- Rebuilt the disposable PostgreSQL volume and migrated both development and
  test databases from the edited baseline through migration 3200.
- Database, API and worker TypeScript builds passed.
- Messaging database, Storefront messaging and API route suites passed: 18
  tests across 3 files.
- Focused lint, architecture, secret and static security checks are recorded in
  the implementation checkpoint.
- The repository-wide TypeScript build remains blocked by three pre-existing
  argument-count errors in `packages/media/src/media.test.ts`; the affected
  messaging packages pass their focused builds.

## Phase 05 handoff

Phase 05 should implement the responsive Admin Messaging Workspace using the
canonical APIs and contracts delivered here. It should not duplicate state in
client-only stores or bypass the semantic operations for assignment, notes,
follow-ups, linking, lifecycle or outbound messages. The primary owner review
gate is an authenticated desktop, tablet and mobile workflow walkthrough once
that UI exists.
