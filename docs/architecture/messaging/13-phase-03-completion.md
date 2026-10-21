# Phase 03 Storefront Live Chat Frontend Completion

**Completed:** 2026-10-22

**Scope:** Customer-facing Storefront live chat only

**Backend authority:** Phase 02 Storefront messaging APIs and canonical messaging model

## Implementation overview

Phase 03 adds a production-oriented, mobile-first chat experience to every
Storefront route. It consumes the Phase 02 guest session, conversation,
messaging, private-media, read-cursor, and realtime contracts without creating
a parallel identity or transcript store. No Admin messaging UI is included.

The launcher is part of the root Storefront layout, while the full client panel
is dynamically imported only after the first interaction. Once loaded, the
panel remains mounted so the conversation, optimistic sends, unread state, and
realtime coordination survive closing the panel and navigating between routes.

## Source organization and mounting

The feature is organized under `apps/storefront/features/chat/`:

- `chat-root.tsx` owns the always-available launcher and lazy panel boundary.
- `chat-panel.tsx` composes the accessible dialog, lifecycle states, transcript,
  contact workflow, and composer.
- `use-chat.ts` owns bootstrap, canonical history, optimistic state, read
  acknowledgements, SSE recovery, and multi-tab coordination.
- `api.ts` is the credentialed transport layer, including private uploads and
  streaming SSE parsing.
- `message-list.tsx`, `composer.tsx`, `contact-form.tsx`, and
  `private-image.tsx` isolate focused presentation responsibilities.
- `model.ts` contains deterministic canonical merge and optimistic
  reconciliation helpers; `types.ts` defines UI-only state.
- `page-context.tsx` maps Storefront routes and bridges current product/variant
  selection into chat context.

`apps/storefront/app/layout.tsx` mounts `StorefrontChat` after the shared footer,
so one launcher is available throughout the Storefront. Product detail pages
mount `ChatProductContext` from `features/pdp/pdp-view.tsx`; variant changes
update the context without coupling the chat feature to PDP state internals.

## Component and UX decisions

The launcher uses the existing Storefront primary token, a 48-pixel touch
target, an accessible label, and an unread badge. Desktop uses a raised,
fixed-width panel; mobile uses a full-screen `100dvh` dialog. The UI provides:

- configured greeting and offline copy;
- plain-text customer/staff message bubbles with timestamps and delivery state;
- cursor-based older-history loading with scroll-position preservation;
- a new-message affordance when the visitor has scrolled away from the bottom;
- resolved-conversation reopen and closed-conversation restart actions;
- optional unverified contact details and explicit channel consent flags;
- text and image composition with validation and visible upload stages; and
- loading, disabled, expired-session, offline, reconnecting, rate-limit,
  validation, and uncertain-send recovery states.

Existing Storefront tokens and primitives are reused. The shared `Textarea`
gained a compact compositional size variant for the single-row composer; no
feature CSS, global stylesheet growth, or new visual dependency was introduced.

## Responsive behavior and accessibility

Phones receive a full-screen surface with safe-area-aware header and composer,
body scroll locking, touch-sized controls, an independently scrolling
transcript, and keyboard-friendly `dvh` sizing. Tablet and desktop widths use a
bounded floating panel with the same interaction model. Attachment previews
scroll horizontally when necessary and message content wraps safely.

The panel is a labelled modal dialog. Opening it moves focus inside, Escape
closes it, Tab/Shift+Tab remain within its controls, background siblings become
inert while open, and focus returns to the launcher/previous control. Messages
use log semantics, connection changes use polite live announcements, errors
use alert semantics, and controls have explicit accessible names. Enter sends
only for fine pointers; Shift+Enter preserves multiline entry.

## Backend API usage

The browser uses the public `/api/storefront/v1/chat` paths through the existing
Storefront proxy:

| Operation | Endpoint |
| --- | --- |
| Bootstrap/resume | `POST /session` |
| Current conversation | `GET /conversations/current` |
| Start after closure | `POST /conversations` |
| Paginated history | `GET /conversations/:id/messages` |
| Idempotent send | `POST /conversations/:id/messages` |
| Visitor read cursor | `POST /conversations/:id/read` |
| Reopen resolved chat | `POST /conversations/:id/reopen` |
| Optional contact details | `PATCH /contact` |
| Upload authorize/content/complete/status | `POST /uploads`, authorized `PUT`, `POST /uploads/:id/complete`, `GET /uploads/:id` |
| Private attachment rendering | `GET /attachments/:id` |
| Realtime replay | `GET /events?cursor=...` |

The safe configuration is returned by bootstrap and drives capabilities,
message limits, attachment limits, greeting, availability, and offline copy.

## Session and identity flow

The panel initializes only after first open. The server creates or resumes the
opaque visitor session in its HttpOnly cookie and returns the active
conversation. JavaScript never reads, copies, or persists the credential.
Expired or revoked sessions move to a recoverable fresh-session state.

When the Storefront request already carries an authenticated customer session,
Phase 02 links and rotates the visitor credential during bootstrap and exposes
only the safe `isCustomerLinked` flag. The current Storefront does not yet have
an account login/logout surface, so an in-place guest-to-account switch and
logout-triggered visitor revocation cannot be wired to an application auth
event in this phase. The chat code creates no inferred identity link and is
ready to re-bootstrap from a future trusted auth transition.

## Send, retry, and reconciliation

Each submit creates a stable `clientMessageId` and `Idempotency-Key`. The
optimistic item appears immediately after required images become available.
The same identifiers and attachment IDs are reused for retry, so an uncertain
network outcome cannot create a second canonical message. Canonical history and
SSE-triggered refreshes reconcile optimistic items by client message ID and
deduplicate/order messages by canonical ID and sequence.

Definitive validation rejection is distinguished from an uncertain transport
or server outcome. Failed items remain visible with Retry and Remove actions.
Page/product context is included only when it has changed since bootstrap,
avoiding duplicate context events.

## Realtime, replay, and multi-tab recovery

The frontend consumes the persisted SSE stream, stores only its non-sensitive
cursor in local storage, and reloads canonical conversation/history on events.
Reconnect uses bounded exponential backoff. A `410 EVENT_CURSOR_EXPIRED`
clears the stale cursor, reloads canonical state, and reconnects without it; a
session `401` moves the UI to the expired state.

Web Locks elect one streaming tab per browser profile. Other tabs remain in a
standby state and refresh after BroadcastChannel invalidations. The lock is
retried when a leader disappears. Browsers without Web Locks use one stream in
the visible tab and start it when a previously hidden tab becomes visible.
Online and visibility changes also trigger canonical refresh. The API remains
the final one-stream-per-session enforcement boundary.

## Attachments and private rendering

The composer accepts up to the server-advertised count of JPEG, PNG, or WebP
files and enforces the advertised per-file size before network work. It creates
local previews, computes SHA-256 with Web Crypto, requests an authorization,
performs the required PUT, confirms completion, and polls until `AVAILABLE`.
The message is not submitted with a processing or rejected upload.

Canonical private attachments are fetched with credentials and `no-store`,
converted to object URLs, and revoked when replaced or unmounted. Selection
preview URLs are also revoked, and active uploads are aborted if the panel
closes or the feature unmounts. No private object-storage URL is exposed.

## Product and page context

Route mapping covers home, product, category/search, cart, checkout, and other
pages. Product pages add the authoritative product ID, selected variant ID, and
a display-only title for contextual UI. The transport sends only the backend
contract fields and relies on server validation for product and variant IDs.
Navigation does not reset the active conversation.

## Availability, errors, and recovery

The UI never invents agent presence. `AVAILABLE`, `OFFLINE`, `DISABLED`, and
`acceptsMessages` come from the backend. Offline-but-accepting mode retains the
composer and configured asynchronous copy; disabled/unavailable states prevent
sending. Network-offline and reconnecting banners preserve the transcript and
provide a retry action. Rate limits, invalid input, temporary server failure,
closed conversations, expired sessions, failed uploads, and uncertain sends
have distinct safe recovery behavior without exposing backend details.

## Performance and privacy decisions

- The launcher is the only eager chat client surface; the full panel is a
  client-only dynamic chunk loaded on demand.
- The root layout remains a Server Component, and the client boundary is
  contained within the feature.
- Bootstrap and history are loaded only after interaction; realtime invalidation
  is debounced and fetches canonical data in parallel where possible.
- History is server-paginated in 30-message pages.
- Object URLs, streams, timers, channels, visibility listeners, and uploads are
  cleaned up with component lifecycle.
- Message text is rendered as React text with preserved whitespace, never as
  HTML. Requests include credentials, use `no-store`, and surface only safe
  error messages. Credentials, bodies, contact claims, and image bytes are not
  persisted in browser storage or logs by this feature.

## Dependencies

No package was added. The implementation uses React/Next.js, browser Fetch,
ReadableStream, Web Crypto, Web Locks, BroadcastChannel, and existing Storefront
UI primitives.

## Verification evidence

- Storefront TypeScript check: `pnpm exec tsc --noEmit -p apps/storefront/tsconfig.json`.
- Focused ESLint over all touched Storefront/chat files.
- Five focused Vitest checks for canonical ordering/reconciliation, read
  sequence selection, chunked SSE parsing, and replay-window error propagation.
- Storefront production build with Next.js 16.
- Browser inspection at desktop and 390×844 mobile sizes, including launcher,
  modal layout, safe-area composition, focus behavior, and responsive scrolling.
- Live text-message API check confirmed canonical send, idempotent replay to the
  same message ID, and one-item history.
- Live private-image check confirmed authorization, PUT, completion, worker
  processing to `AVAILABLE`, canonical message acceptance (`202`), and one
  private attachment.

## Known limitations

- There is no current Storefront account login/logout UX to emit an auth-change
  event; authenticated linking is therefore exercised at chat bootstrap, not
  during an in-page account transition.
- Agent presence and business-hours intelligence are not fabricated from the
  Phase 02 capability response. Advanced routing/presence remain Phase 04 work.
- A human staff reply cannot be operated from a browser until the Phase 05
  Admin Messaging Workspace exists, although canonical staff messages and
  their Storefront delivery/read presentation are supported by the contracts.

## Phase 04 and Phase 05 handoff

Phase 03 contains **no Admin messaging UI**. Existing Phase 01 Admin APIs remain
available. Phase 04 owns the advanced administrative backend, and Phase 05 owns
the complete mobile/tablet-first Admin Messaging Workspace. The customer widget
must remain independent of staff-screen layout decisions.

Shared contracts, canonical ordering, authorization, idempotency, delivery
state, private attachment rules, and durable realtime behavior remain the
cross-surface authority. Generic utilities may be shared where genuinely
useful, but customer and staff experiences should not be forced into one UI
component framework.
