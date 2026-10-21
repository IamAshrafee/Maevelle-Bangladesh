# Storefront Live Chat and Admin Workspace UX

## Storefront widget

### Loading and presentation

The Storefront layout renders a tiny server-provided launcher shell. Interactive chat code loads only after idle/viewport intent or launcher activation. Do not add the Admin UI library to Storefront. Keep the client boundary to one feature root and use existing Storefront tokens.

- Small phone: full-screen fixed surface using dynamic viewport units, safe-area padding, sticky header, scrollable messages, keyboard-safe fixed composer.
- Tablet/desktop: floating panel, approximately 380–440 px wide and constrained to viewport height; launcher remains reachable.
- Accessibility: real dialog semantics when modal on phone, visible focus, escape/minimize behavior, labelled controls, live region for incoming messages/status, reduced motion, 44 px touch targets.

### Customer states and behavior

| State | Visible behavior |
|---|---|
| Initial loading | launcher skeleton only; storefront remains usable |
| Available, no conversation | greeting, hours/response expectation, `Start chat` |
| Outside hours | explicit offline message; customer may leave a message; no false live claim |
| Empty conversation | greeting + suggested non-AI help prompts if configured |
| Active | ordered bubbles, day separators, delivery indicators, load-older affordance |
| Sending | optimistic bubble keyed by client message ID; retry uses same idempotency key |
| Offline | persistent banner; composer queues draft locally but never shows unsent text as accepted |
| Reconnecting | messages remain; bounded retry and manual reconnect after repeated failure |
| Failed send | inline failure/retry/remove; preserve draft |
| Backend unavailable | launcher/panel explains temporary unavailability and existing non-chat contact route |
| Closed | transcript read-only with `Start a new conversation`; resolved may reopen if policy allows |

Composer supports text, allowed attachments, multiline input, send button, attachment preview/remove, and channel capability explanation. Enter sends only on hardware keyboard when appropriate; Shift+Enter inserts newline. Never clear the draft until acceptance. Typing indicator is optional/ephemeral and must not delay core delivery.

Message status mapping: visitor inbound `Sending → Sent` after API acceptance; staff outbound `New` when delivered to the visitor stream and `Seen` after visitor read cursor. Do not expose provider-specific states on website chat.

### Continuity

- Navigation/refresh/browser reopen: secure cookie resumes; UI state may be remembered separately.
- Multiple tabs: SSE in each tab is acceptable initially, bounded to one connection per visitor where practical; BroadcastChannel coordinates read/new-message hints.
- Login: verified customer link rotates the visitor credential and preserves transcript.
- Logout: does not destroy visitor transcript, but removes authenticated customer context and may rotate again.
- New device: no transcript unless authenticated/verified recovery is implemented.
- Product context: initiation/sending can attach current product/variant IDs and clean path/title snapshots; context is visible to staff but is not message text.

## Phase 03 permanent staff surface

Phase 03 adds `/admin/messaging`, built from the same feature modules Phase 05 expands:

- conversation list: Storefront only, new/open/pending, mine/unassigned, unread, cursor load-more;
- conversation view: history, composer, read cursor, status, claim;
- compact contact context: guest/linked indicator and safe page/product context;
- SSE reconciliation and notifications.

The route, API hooks, provider/context, message list/bubble/composer, list item, status control and assignment control are permanent. Phase 05 composes additional filters, panels, notes, tags, saved replies, settings and reports around them.

## Unified Admin workspace

### Responsive information architecture

| Width/capability | Layout |
|---|---|
| Small phones | inbox route/view first; selecting opens full-screen conversation; bottom action bar; context in full-height sheet |
| Large phones | denser list, swipe-free explicit actions, quick next/unread navigation |
| Portrait tablet | two columns: 300–360 px list + conversation; context sheet |
| Landscape tablet | list + conversation + collapsible context panel |
| Desktop | resizable three-column workspace using existing resizable panels; keyboard navigation |

Content-driven breakpoint: enable two columns only when list and 420 px readable conversation fit; enable third panel only when conversation remains at least 480 px. Do not force orientation.

### Screen inventory

| Screen | Primary actions | States/permissions | Backend dependencies |
|---|---|---|---|
| Inbox/workspace | open, claim, filter/search, compose reply | skeleton rows, empty per filter, stale/offline banner, access-denied; assigned/all policy | conversation list, SSE |
| Conversation | send, status, priority, assignment | gap recovery, closed/reply-window state, failed messages | detail/history/commands |
| Customer context | open customer/order/delivery detail | guest/unlinked, restricted fields, context denial | context provider |
| Notes/timeline | add/edit own note, view events | notes permission, optimistic conflict | notes/events |
| Saved replies | search/insert; manage separately | no-result, stale template; use/manage capability | saved replies |
| Tags/assignment | add/remove/reassign | conflict and current state | conditional mutation |
| Settings | connections, hours, rules, retention | dirty form, validation, diagnostics, restricted access | settings/connections APIs |
| Reports | response/resolution/channel/agent metrics | date bounds, no-data, partial projection warning | reporting projection |

Inbox presets have precise semantics:

- All: all accessible non-closed by default.
- Mine: current assignee.
- Unassigned: no assignee and actionable status.
- New/Open/Pending/Resolved/Closed: canonical status filters.
- Starred/priority/channel/agent/tag filters combine server-side.

Unread is per membership. Opening does not immediately mark all read; advance to the highest actually rendered/acknowledged sequence. List previews never expose internal notes to channel participants.

## Component architecture

Proposed Admin feature tree:

```text
apps/admin/features/messaging/
  api/                 # typed fetchers, cursor helpers
  components/
    conversation-list.tsx
    conversation-list-item.tsx
    conversation-pane.tsx
    conversation-header.tsx
    message-list.tsx
    message-bubble.tsx
    message-composer.tsx
    delivery-indicator.tsx
    attachment-preview.tsx
    customer-context-panel.tsx
    assignment-control.tsx
    status-control.tsx
    notes-panel.tsx
    saved-reply-picker.tsx
    filter-toolbar.tsx
  hooks/               # SSE, pagination, scroll anchoring, drafts
  state/               # workspace provider: state/actions/meta
  types.ts
```

Use `AdminPage`, `PageHeader`, `PagePanel`, `EmptyState`, `ErrorState`, `LoadingState`, existing Button/Input/NativeSelect/Textarea/Table/Dialog/Drawer/Sheet/Toast and `StatusBadge`. Use semantic colors; mono/tabular numerals for IDs, dates, counts and metrics. No page CSS, `transition-all`, broad ancestor styling, or raw common controls.

Proposed Storefront tree:

```text
apps/storefront/features/chat/
  api.ts
  chat-root.tsx
  chat-launcher.tsx
  chat-panel.tsx
  message-list.tsx
  message-bubble.tsx
  composer.tsx
  attachment-preview.tsx
  use-chat-session.ts
  use-chat-events.ts
  use-chat-draft.ts
  types.ts
```

Shared code is transport DTOs/schemas in contracts; do not share visual components across different design systems prematurely.

## Performance behavior

- Initial history 30 messages; prepend older pages while preserving scroll anchor.
- Virtualize only after measured jank/large transcripts; first use windowed DOM/content visibility and cap retained pages on memory-constrained devices.
- New messages append by ID/sequence; reconcile optimistic items by client message ID without list replacement.
- Subscribe to derived workspace state; split composer/transient typing from message list to avoid rerenders.
- Defer customer context and attachments; start independent conversation detail/history requests together.
- Cancel stale conversation fetches during rapid switching; cache bounded summaries and latest pages.
- Store drafts per conversation locally without sensitive attachment tokens and with expiry.
- Storefront chat JS target: <= 45 KiB gzip initial interactive chunk excluding framework shared runtime; launcher shell adds negligible server HTML. This is a target, not a measured baseline.

## Notifications

Phase 03/04 reuses in-app notifications and the Admin notification bell for new/unassigned/assigned messages. Default payload contains contact/channel and conversation link, not message body. Deduplicate bursts per conversation. Browser notifications/web push require permission, service-worker/PWA work and iOS testing that do not currently exist; treat them as an optional Phase 05 extension after an explicit product decision.

## Interaction acceptance examples

- When two agents claim, the losing UI keeps the transcript, shows the new assignee and offers request/reassign only if permitted.
- If a customer replies while resolved, status changes to Open, unread increments for eligible agents, and the timeline records reopening.
- If reply eligibility expires while composing, send returns a capability error and preserves draft.
- If a saved reply changes after selection, inserted text remains an editable draft; sending records the saved-reply ID/revision used for reporting without re-expanding it.
- Mobile keyboard opening never hides the composer or send control; conversation header remains reachable after keyboard closes.
