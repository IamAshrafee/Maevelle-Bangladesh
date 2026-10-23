# Phase 09 Instagram Direct Frontend Integration Completion

**Status:** Repository-controlled code complete; live Meta activation and end-to-end verification pending  
**Completed:** 2026-10-23  
**Roadmap boundary:** Phases 00–09 are code-complete. Remaining work is owner-controlled external activation, comprehensive live testing, and production deployment.

## 1. Outcome

Phase 09 completes Instagram Direct administration and operator workflows inside the existing Admin Messaging Workspace. It does not create a second inbox or a browser-side Meta integration. The UI consumes the Phase 08 server contracts, keeps Meta credentials server-only, and preserves the canonical conversation, assignment, collaboration, customer-context, notification, and SSE paths.

The completed experience includes:

- official Facebook Login initiation for a Page-linked Instagram Business or Creator account;
- encrypted OAuth-attempt discovery, explicit eligible-account selection, Page/account confirmation, and connection finalization;
- connection readiness, permission, Page-task, webhook, diagnostic, App Review evidence, suspend/restore, reauthorization, and non-destructive disconnect controls;
- bounded historical synchronization controls and progress/coverage reporting;
- Instagram identity, filtering, native folder/context, external-provider sender attribution, shared-content presentation, and delivery-state behavior in the unified inbox;
- a fail-closed, policy-aware composer that rechecks server eligibility immediately before sending and permits one text message **or** one supported image;
- responsive phone, tablet, and desktop behavior using the existing Tailwind CSS v4 and Base UI/shadcn system.

No real Instagram account, permission grant, webhook delivery, history import, DM, or production readiness is claimed by this completion record.

## 2. Frontend architecture

Instagram-specific code lives under `apps/admin/components/messaging/instagram/`:

- `instagram-api.ts` is the typed Maevelle API boundary. It never calls Graph API directly.
- `instagram-types.ts` translates provider states and reply restrictions into operator-facing language.
- `instagram-settings-panel.tsx` owns availability, connection selection, OAuth returns, sub-navigation, and authorization-aware rendering.
- `instagram-connection-wizard.tsx` implements introduction, preflight, authorization, discovery, selection, confirmation, and completion states.
- `instagram-connection-overview.tsx` presents identity, Page linkage, readiness, lifecycle actions, and activation blockers.
- `instagram-health-card.tsx` presents scopes, Page `MESSAGING` task, webhook/credential health, App Review evidence, and timestamps.
- `instagram-sync-card.tsx` starts and monitors bounded imports only while a job is active.
- `instagram-disconnect-dialog.tsx` explains and performs the destructive credential removal while preserving canonical business history.

The existing workspace remains authoritative for inbox pagination, realtime events, messages, assignments, tags, notes, saved replies, follow-ups, customer linking, commerce context, reporting, and notifications.

## 3. Exact API integration

The frontend uses the implemented Phase 08 routes:

```text
GET    /admin/messaging/connections/instagram/availability
POST   /admin/messaging/connections/instagram/oauth
GET    /admin/messaging/connections/instagram/oauth/:attemptId
POST   /admin/messaging/connections/instagram
GET    /admin/messaging/connections/instagram
GET    /admin/messaging/connections/instagram/:connectionId
PATCH  /admin/messaging/connections/instagram/:connectionId
POST   /admin/messaging/connections/instagram/:connectionId/diagnostics
DELETE /admin/messaging/connections/instagram/:connectionId
POST   /admin/messaging/connections/instagram/:connectionId/syncs
GET    /admin/messaging/connections/instagram/syncs/:syncId
GET    /admin/messaging/conversations/:conversationId/instagram-reply-eligibility
GET    /integrations/messaging/instagram/oauth/callback
```

Suspension/restoration and App Review evidence updates send the current connection version through `If-Match`. Stale writes refresh canonical connection state and surface the conflict instead of overwriting it.

## 4. Connection and account experience

The disconnected view checks server configuration before enabling authorization and explains the professional-account and linked-Page requirements. The wizard uses the backend-issued official Meta URL; no token, password, or Graph request enters browser code. OAuth callback parameters are treated only as an attempt reference, and the backend status endpoint remains authoritative.

Discovery cards show only safe metadata: username, display name, profile image when supplied, professional account type, Instagram ID, linked Page name/ID, Page tasks, and server-provided eligibility reasons. A sole eligible account may be preselected; multiple accounts always require an explicit choice. The confirmation step restates identity, Page linkage, required access, and non-effects on Facebook, WhatsApp, ads, ownership, and native history.

Reauthorization starts a fresh official attempt and relies on backend identity matching to update the intended connection. Suspension and restoration preserve credentials/history and use optimistic concurrency. Disconnect attempts provider unsubscribe, destroys the local credential, fails pending delivery work safely, and retains canonical transcripts and operational context.

## 5. Permissions, health, and activation evidence

The UI renders the server-provided permission matrix for:

- `pages_show_list`
- `pages_manage_metadata`
- `instagram_basic`
- `instagram_manage_messages`
- Facebook Page task `MESSAGING`

It separately presents credential health, webhook subscription evidence, subscribed fields, last verification/webhook/inbound/outbound timestamps, readiness blockers, provider error category, and administrative App Review evidence. A manual “Advanced Access Confirmed” value is labeled as operator-recorded evidence and is not treated as proof of live message delivery. Diagnostics are user-triggered rather than invoked on every render.

## 6. Historical synchronization and native context

History import is explicit, capability-protected, resumable server-side, and never starts when the settings page opens. While `PENDING` or `PROCESSING`, the UI performs one three-second status poll and stops when the job reaches a terminal state. It reports imported conversations/messages, duplicates, attachment failures, errors, and provider coverage.

The UI states that Meta can omit unavailable history, including inactive Requests, and that provider exhaustion is not proof that every native DM was imported. Original timestamps and backend historical notification suppression remain authoritative.

Instagram `Primary`, `General`, and `Requests` values are contextual badges only; they do not replace Maevelle status or assignment. The UI explains that an API reply can move a native conversation to General and does not expose unsupported folder mutation or group messaging.

## 7. Unified inbox and message presentation

Instagram is available in the existing channel filter and uses canonical conversation IDs, search, pagination, unread counts, and deep links. Conversation summaries now expose the provider username, while detail projections expose redacted provider context. The workspace shows:

- Instagram channel and `@username` identity;
- native folder, referral, reaction, quick-reply, postback, reply, and story-context indicators when stored;
- safe shared-story/post/reel context without arbitrary HTML or unofficial private-media retrieval;
- external provider/Page senders as “Instagram Account,” not as a named Maevelle agent;
- unavailable provider-only media as an explained attachment instead of a broken download.

All existing claim/assignment, lifecycle, priority, star, tag, note, saved-reply, follow-up, audited customer-link, commerce-context, analytics, and notification operations remain channel-neutral.

## 8. Composer, eligibility, and delivery safety

For Instagram conversations the composer:

- loads server reply eligibility when the conversation opens and after message changes;
- refreshes when the returned eligibility deadline is reached;
- rechecks immediately before every send and fails closed if the check cannot be completed;
- prevents customer initiation from Maevelle and explains the 24-hour restriction;
- accepts one text message or one image, never a combined text/image payload or multiple images;
- preserves the existing broader Website composer behavior;
- uses the existing private media upload/readiness and stable idempotent send path.

Canonical delivery states remain authoritative. Provider `UNKNOWN` is presented as an unresolved outcome and is not converted to success or blindly resent. Existing pending-message reconciliation uses stable client/idempotency identifiers, while provider echoes/read receipts update the canonical transcript without duplicate rows.

## 9. Realtime, responsiveness, accessibility, security, and performance

Instagram events flow through the existing organization-scoped SSE stream, leader election, BroadcastChannel fan-out, and targeted messaging refresh logic. No provider-specific EventSource, notification system, or client cache was added.

The UI was checked at 390 px phone, 820 px tablet, and 1440 px desktop widths. Horizontal tab groups remain touch-scrollable with hidden scrollbars, forms and actions use existing touch-friendly primitives, dialogs constrain viewport height, and cards reflow without page-level horizontal overflow. Controls use semantic labels, native radio/select behavior, focus-visible rings, dialog focus management, polite live regions, and text/icon status redundancy.

Security invariants:

- no Instagram password or access token is requested, rendered, persisted in web storage, or placed in a URL;
- all privileged work goes through capability-checked organization-scoped backend routes;
- profile/provider content is treated as untrusted data and rendered without raw HTML;
- Facebook, WhatsApp, ads, ownership, and unrelated Meta assets are not mutated;
- no unsolicited “send by username” capability exists.

Performance remains bounded through dynamic loading of the Instagram settings module, abortable reads, polling only for active OAuth/sync work, lazy profile images, existing server pagination, and no new dependency.

## 10. Backend/read-model adjustments

Phase 09 required small contract-completeness changes rather than new domain behavior:

- conversation summaries expose `contact.username`;
- conversation detail exposes stored `providerContext`;
- Instagram connection views expose `pageName`, `requiredScopes`, `pageTasks`, and `latestSyncId`;
- the mutable development baseline stores `instagram_connection_state.page_name` and the connection flow persists it.

These values were already known or persisted in provider/domain flows but were not all available to the Admin read model. No new provider authorization method, token flow, message service, or business-state shortcut was introduced.

## 11. Verification

Completed targeted evidence is recorded in the final Phase 09 implementation report and current product-completion state. It includes workspace typechecking, focused lint, Admin production build, clean messaging migration, focused database/API/frontend provider tests, secret scanning, diff whitespace checks, and responsive browser inspection. Live Meta verification was intentionally not performed without owner credentials and approved assets.

## 12. External activation and operational handoff

Repository code is ready for controlled activation, but production Instagram Direct is not operational until the owner completes and verifies:

1. Meta Business Verification and the selected Business/Creator account’s valid Page linkage.
2. Advanced Access/App Review for all required permissions.
3. Production `INSTAGRAM_*` credentials and a public HTTPS OAuth callback.
4. Public HTTPS Instagram webhook verification and field subscription.
5. A controlled authorization of the intended Instagram/Page asset by an authorized owner.
6. Real inbound text/image, story/shared-context, echo, delivery/read, reply-window, history coverage, reconnect, and safe-disconnect exercises.
7. Comprehensive regression/security/accessibility testing, production environment review, deployment, monitoring, and rollback readiness.

Phases 00–09 are therefore **repository code-complete**, while external activation, comprehensive testing, and production launch remain explicit owner-controlled gates.
