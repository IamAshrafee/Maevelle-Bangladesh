# Phase 05 Admin Messaging Workspace Completion

**Status:** Complete
**Completed:** 2026-10-22
**Next boundary:** Phase 06 Facebook Messenger integration

## Delivered capability

Phase 05 turns the Phase 04 operational API into the Admin customer-service
workspace at `/admin/messaging`. It is a focused React client composition inside
the existing Admin shell and uses the shared messaging contracts, request
transport, authorization context, semantic Tailwind tokens, shadcn/Base UI
primitives and canonical backend commands.

The workspace now includes:

- a cursor-paginated inbox with Mine, Unassigned and All scopes, authoritative
  counts, debounced search, status/priority/channel/follow-up/reply/star filters,
  stable sorting, selection and permission-aware bulk lifecycle/priority actions;
- deep-linked conversations, canonical ordered history, older-history paging,
  read advancement, delivery state, authorized attachment downloads and a
  keyboard-friendly reply composer with saved replies;
- optimistic idempotent staff sends with explicit sending, uncertain and
  rejected states, canonical reconciliation, retry using the original identity
  keys and safe removal of failed local projections;
- claim, assignment, release, lifecycle, priority and star controls using
  expected versions, with conflict refresh and assignment history;
- private notes, organization tags, saved-reply management, activity history,
  follow-up creation/completion/cancellation and a personal follow-up queue;
- permissioned linked-customer context including contact facts, commerce
  metrics, orders, payment/fulfillment/delivery states, returns and captured
  product context, plus audited manual link and unlink operations;
- personal availability and heartbeat, channel greeting/offline settings,
  timezone-aware weekly hours, ordered channel-to-agent assignment rules,
  personal notification preferences, tag and saved-reply libraries; and
- bounded date-range operations reporting with response, resolution, channel
  and agent workload metrics.

## Responsive and accessible composition

The workspace uses a three-pane desktop composition when space permits, a
focused single-pane conversation workflow on constrained tablet widths, and a
single-pane phone workflow with explicit back navigation. The customer and
collaboration rail becomes a full-height sheet below the desktop breakpoint.
Search, tabs, menus, form controls and icon actions have accessible names;
loading, empty and error states remain visible; touch targets use shared Button
and form primitives; generated content truncates or wraps safely; the composer
accounts for mobile safe areas and does not depend on hover.

Authenticated browser inspection covered desktop, 820 px tablet and 390 px
phone layouts. It also covered a real persisted website conversation and fixed
the compressed-tablet and clipped-mobile-action issues found during review.

## Realtime and reliability

One organization-scoped EventSource is elected across visible tabs by a
renewable local lease. Other tabs receive events and connection state over
BroadcastChannel. The durable event cursor is retained per organization,
replayed on reconnect and cleared after repeated cursor-bearing failures so a
canonical inbox/conversation resync can recover from an expired replay window.
Hidden leaders release their stream; online/offline and visibility changes
trigger election. Realtime events debounce canonical inbox and selected-
conversation invalidation rather than treating event payloads as business
truth. Organization changes clear conversation, message and pending-send state.

## Backend contract additions

Two narrow Phase 05 gaps were closed without introducing a new transport or
messaging architecture:

1. `GET /admin/messaging/settings/channels` enumerates organization-scoped
   channel settings for the configuration UI.
2. Staff image replies now have an actor-owned, conversation-authorized private
   upload lifecycle (authorize, local upload proxy or signed upload, complete,
   processing poll). Existing media signature, size, private-storage and READY
   checks remain authoritative, and the canonical message command still owns
   attachment association.

## Verification evidence

- Focused ESLint passed for all changed Admin, API and database files.
- `@maevelle/database` and `@maevelle/api` TypeScript builds passed.
- The optimized `@maevelle/admin` Next.js build passed and generated the
  `/messaging` route.
- Messaging database, Storefront messaging and API suites passed: 18 tests in
  3 files, including concurrency, authentication and expired replay behavior.
- Authenticated browser inspection passed on desktop, tablet and phone using
  authoritative local API/database state. No customer reply was sent during
  visual inspection.

## Phase 06 handoff

Facebook should enter through the existing channel-connection, webhook ingress,
deduplication, reply-window and durable delivery adapter boundaries. Its
capability snapshot will automatically drive composer availability and message
presentation. Provider identifiers stay in external-reference tables; customer
linking remains evidence based; delivery remains outbox driven; and the Admin
workspace, collaboration model, reports and SSE stream remain unchanged. No
Facebook controls or simulated provider behavior were added in Phase 05.
