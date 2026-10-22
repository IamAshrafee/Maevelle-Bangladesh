# Phase 03 Storefront Live Chat Frontend Completion and Handoff

**Completed:** 2026-10-22
**Scope:** Customer-facing Storefront Live Chat Frontend Implementation & Backend Integration
**Status:** Complete

---

## 1. Implementation Overview

Phase 03 completes the production-quality, customer-facing Storefront Live Chat experience for Maevelle Bangladesh. Built upon the Phase 01 messaging core and Phase 02 website channel backend, this implementation delivers an end-to-end customer messaging workflow directly within the Next.js 16 Storefront without introducing MVP compromises, mock APIs, or temporary hacks.

In strict adherence to the project owner's scope clarification:
- **No administrative messaging UI or staff reply interface was built in Phase 03.**
- All staff, agent, and supervisor surfaces remain deferred to Phase 05 (Mobile/Tablet-first Admin Messaging Workspace), while advanced operational routing and presence logic will be delivered in Phase 04.
- Phase 03 provides the complete, autonomous shopper-side messaging experience integrated with real backend APIs.

---

## 2. Frontend Source Organization

The storefront live chat feature is modularly organized in `apps/storefront/features/chat/`:

```text
apps/storefront/features/chat/
├── api.ts              # Typed HTTP client, upload pipeline, chunked SSE parser, and error mapper
├── api.test.ts         # Vitest coverage for SSE chunk framing, cursor expiration, and keepalive handling
├── chat-root.tsx       # Lightweight lazy-mount entry point, launcher pill, unread badge, and context wiring
├── chat-panel.tsx      # Modal conversation dialog with visualViewport keyboard handling and life-cycle states
├── composer.tsx        # Message composer with text, drag-and-drop, clipboard image paste, and validation
├── contact-form.tsx    # Unverified customer contact collection (Name, Email, Phone, Consents)
├── image-lightbox.tsx  # Accessible full-resolution image preview lightbox with download action
├── message-list.tsx    # History log, grouping, safe URL linkification, Bengali typography, and scroll anchoring
├── model.ts            # Canonical deduplication, message sorting, pending reconciliation, and read sequence helpers
├── model.test.ts       # Vitest coverage for reconciliation, sequence order, and staff read cursors
├── page-context.tsx    # Context provider connecting page type (Home, PDP, Category, Cart, Checkout) & product ID
├── private-image.tsx   # Authenticated private media thumbnail fetcher using Blob URLs
└── types.ts            # Derived presentation view-models and component prop interfaces
```

Shared contracts, status enums, and schemas are imported directly from `@maevelle/contracts/messaging`.

---

## 3. Storefront Mounting & Integration Location

The chat launcher is mounted once at the root application layout:
`apps/storefront/app/layout.tsx` via `<StorefrontChat />`.

Key integration properties:
- **Isolated Client Island:** `RootLayout` remains an efficient server component. `<StorefrontChat />` marks the feature boundary.
- **Lazy Hydration:** Heavier conversation components (`ChatPanel`, media processing, and SSE logic) are dynamically imported (`next/dynamic` with `ssr: false`) and load only upon intent (clicking the launcher).
- **PDP Context Awareness:** `apps/storefront/features/pdp/pdp-view.tsx` mounts `<ChatProductContext productId={product.id} productTitle={product.title} variantId={selectedVariant?.id} />`. When shoppers open chat while browsing a specific apparel item, product context is automatically dispatched and attached to conversation creation and message events.
- **Non-Obtrusive Layout Stacking:** The launcher button is fixed at `bottom-20 right-3 z-50 sm:bottom-6 sm:right-6`, comfortably clearing the mobile `PdpStickyBar` and checkout summary bars without obstructing core purchasing workflows.

---

## 4. Component Structure & Responsibilities

1. **`StorefrontChat` (`chat-root.tsx`):**
   - Renders the floating "Chat with us" launcher button with icon and unread message counter badge.
   - Preserves widget mount state once opened so background realtime updates and unread counters continue functioning when the customer minimizes the panel.
2. **`ChatPanel` (`chat-panel.tsx`):**
   - Top header with Maevelle Support brand mark, availability presence dot, and accessible Close button.
   - Realtime connectivity banners (`reconnecting`, `offline`, `standby`).
   - Contextual product banner when opened from a PDP.
   - Lifecycle overlays: `initializing`, `expired`, `unavailable`, and `error` recovery.
   - Status actions: "Reopen conversation" for `RESOLVED` status; "Start a new conversation" for `CLOSED` status.
3. **`MessageList` (`message-list.tsx`):**
   - Renders canonical and optimistic messages with deterministic sequence ordering.
   - Date separators grouping messages by day ("Today", "22 Oct").
   - Intra-conversation grouping: consecutive messages from the same sender within 2 minutes group naturally with tighter vertical spacing and subtle radius changes.
   - Safe linkification for `http:` and `https:` URLs inside message text.
   - Unicode Bengali script detection (`[\u0980-\u09FF]`) applying `font-bangla` (`Noto Sans Bengali`) and `lang="bn"`.
   - Scroll anchoring: maintains scroll position when loading older history; shows floating "New messages ↓" button when scrolled up.
4. **`ImageLightbox` (`image-lightbox.tsx`):**
   - Accessible modal displaying enlarged attachment images with download/open action and Escape key dismissal.
5. **`Composer` (`composer.tsx`):**
   - Multiline message input with auto-growing textarea up to max-height.
   - Keyboard interaction: Enter sends on desktop; Shift+Enter creates a new line. On touch devices, Enter creates a newline while the dedicated 48px Send button submits.
   - Image upload button (`ImageIcon`), drag-and-drop image dropzone, and clipboard paste (Cmd+V / Ctrl+V) handling.
   - Character count indicator when approaching `maximumTextLength`.
6. **`ContactForm` (`contact-form.tsx`):**
   - Optional customer contact submission (Name, Email, Phone, Email Consent, Phone Consent).
   - Validates email format and Bangladesh phone format (`+880 1...` or `01...`).

---

## 5. UI/UX & Design System Alignment

- **Brand Tokens:** Follows `styles/theme.css` tokens exclusively:
  - Brand Primary: Maevelle Berry `#7e0e35` (`--color-primary`) with hover `#65102e` and subtle `#ffd9de`.
  - Backgrounds: Canvas `#fff8f5`, Surface `#ffffff` (`--color-surface-container-lowest`).
  - Feedback: Semantic Success `#17633f`, Warning `#8a4a07`, Danger `#ba1a1a`.
- **Typography:** Plus Jakarta Sans for UI labels and metadata; Playfair Display for welcome editorial headers; Noto Sans Bengali for Bangla text; tabular mono numbers for sequences, dates, and unread badges.
- **Accessibility:**
  - Standard `role="dialog"`, `aria-modal="true"`, and `role="log"`.
  - Focus trap inside panel with Escape key closing and returning focus to trigger.
  - 48px comfortable touch targets on all primary interactive buttons.
  - Screen reader live region (`aria-live="polite"`) announcing connection updates.
  - Respects reduced-motion preferences with short, purposeful transition durations (120–150ms).

---

## 6. Mobile & Responsive Layout Behavior

- **Mobile Viewport Adaptation:** On phones (`< 768px`), the chat panel opens as an immersive, full-screen surface (`inset-0`).
- **Virtual Keyboard Handling:** Integrates `window.visualViewport` tracking. When the on-screen software keyboard opens on iOS Safari or Android Chrome, the panel dynamically adjusts its height (`visualViewport.height`) and top offset (`visualViewport.offsetTop`), ensuring the composer is never pushed behind the virtual keyboard.
- **Background Scroll Locking:** Disables `document.body` scrolling while the mobile chat is open and marks sibling body children `inert` for screen reader safety. Restores both seamlessly upon closing.
- **Tablet / Desktop:** Renders as a floating card docked at bottom-right (`w-full max-w-md h-[min(44rem,calc(100dvh-3rem))]`) with elevation shadow (`shadow-modal`) and subtle border (`border-border-subtle`).

---

## 7. Backend API Integration & Realtime SSE

All network requests target `/api/storefront/v1/chat/*`, rewritten by Next.js to Fastify:

| Endpoint | Method | Transport & Behavior |
|---|---|---|
| `/api/storefront/v1/chat/config` | `GET` | Fetches channel availability, greeting, capabilities, and attachment policy |
| `/api/storefront/v1/chat/session` | `POST` | Initializes or resumes visitor session, returns active conversation, sets `maevelle_chat` HttpOnly cookie |
| `/api/storefront/v1/chat/session` | `DELETE` | Revokes visitor credential and clears session cookie |
| `/api/storefront/v1/chat/conversations/current` | `GET` | Returns visitor's active conversation summary |
| `/api/storefront/v1/chat/conversations` | `POST` | Idempotently creates or converges on active conversation |
| `/api/storefront/v1/chat/conversations/:id/messages` | `GET` | Cursor-paginated history (`limit=30`, `before=<cursor>`) |
| `/api/storefront/v1/chat/conversations/:id/messages` | `POST` | Accepts text & attachment IDs with mandatory `Idempotency-Key` and `clientMessageId` |
| `/api/storefront/v1/chat/conversations/:id/read` | `POST` | Monotonically advances visitor read sequence |
| `/api/storefront/v1/chat/conversations/:id/reopen` | `POST` | Reopens a resolved conversation |
| `/api/storefront/v1/chat/contact` | `PATCH` | Updates unverified visitor contact claims |
| `/api/storefront/v1/chat/uploads` | `POST` | Requests private attachment upload authorization |
| `/api/storefront/v1/chat/uploads/:id/content` | `PUT` | Binary upload proxy with exact checksum validation |
| `/api/storefront/v1/chat/uploads/:id/complete` | `POST` | Verifies stored object and queues media worker |
| `/api/storefront/v1/chat/uploads/:id` | `GET` | Polls upload processing status until `AVAILABLE` |
| `/api/storefront/v1/chat/attachments/:id` | `GET` | Authorized private image fetch (Blob URL creation) |
| `/api/storefront/v1/chat/events` | `GET` | Replayable SSE stream with cursor / `Last-Event-ID` |

---

## 8. Guest Session & Identity Lifecycle

- **Opaque HttpOnly Cookie:** The visitor session credential (`session-id.secret`) is transported exclusively via the `maevelle_chat` HttpOnly cookie. JavaScript cannot access, inspect, or store the secret.
- **Session Expiration:** If the server returns `SESSION_EXPIRED` (401), the UI transitions to an `expired` state, offering a "Start new chat" action that re-invokes `chatApi.bootstrap()`.
- **Authenticated Customer Transition:** Handled server-side by `linkVisitorToAuthenticatedUser`. When a logged-in customer starts chat or an anonymous visitor logs in, the backend links the contact identity and rotates the session credential without client intervention.

---

## 9. Optimistic Messaging & Idempotency

- **Sending Flow:**
  1. Generates `clientMessageId` (UUID) and `idempotencyKey` (UUID).
  2. Creates an optimistic `PendingMessage` in state with `state: 'sending'`.
  3. Sends `POST` with `idempotency-key` header and `clientMessageId` in payload.
  4. On 202 Accepted, reconciles canonical server message by matching `clientMessageId`, removing optimistic item from pending list.
- **Strict Retry Invariant:** When retrying an uncertain or network-failed submission, the client reuses the exact same `idempotencyKey` and `clientMessageId`. If the backend already durably accepted the message, it replays the canonical record with `200 OK` without creating a duplicate.

---

## 10. Realtime Event Handling & Multi-Tab Synchronization

- **One-Stream-Per-Session Coordination:** The backend enforces a limit of 1 active SSE connection per visitor session. To prevent multiple browser tabs from repeatedly disconnecting one another:
  - Uses `navigator.locks` (`maevelle-chat-events`) to elect a single active streaming tab.
  - Non-streaming tabs enter `standby` mode.
  - When the active tab receives an SSE event, it broadcasts an invalidation notice across tabs via `BroadcastChannel('maevelle_storefront_chat_v1')`.
  - Standby tabs trigger a lightweight debounced refresh to pull canonical updates.
  - If the active tab closes, a standby tab acquires the lock and connects seamlessly.
- **Event Cursor Expiration (410):** If SSE returns `410 EVENT_CURSOR_EXPIRED`, local cursor storage is cleared and a full canonical history refetch is executed.
- **Lifecycle Reconnection:** Foregrounding the tab (`visibilitychange` to `visible`) and regaining network (`online` event) immediately trigger data resynchronization.

---

## 11. Image Attachments & Private Media Security

- **Constraints:** Enforces maximum 5 images per message, maximum 5 MiB per file, accepted MIME types: `image/jpeg`, `image/png`, `image/webp`.
- **Upload Sequence:**
  1. Hashing: computes SHA-256 checksum in browser using `crypto.subtle.digest`.
  2. Authorization: requests upload slot via `POST /uploads`.
  3. Binary PUT: uploads file bytes via `PUT /uploads/:id/content`.
  4. Complete: triggers verification via `POST /uploads/:id/complete`.
  5. Polling: polls `GET /uploads/:id` until status transitions from `PROCESSING` to `AVAILABLE`.
  6. Associating: passes `attachmentIds: [id]` into `POST /conversations/:id/messages`.
- **Private Image Display:** Images are not served via public URLs. `PrivateChatImage` fetches private renditions with `credentials: 'include'` and renders temporary Blob URLs, automatically revoking them on component unmount to prevent browser memory leaks.

---

## 12. Verification Evidence

1. **TypeScript Compilation:**
   - Command: `pnpm --filter @maevelle/storefront exec tsc --noEmit`
   - Result: Exit code 0 (zero errors).
2. **Next.js Production Build:**
   - Command: `pnpm --filter @maevelle/storefront build`
   - Result: Compiled successfully in 1258ms with Turbopack; all 19 application routes generated cleanly.
3. **Automated Unit & Integration Tests:**
   - Command: `pnpm vitest run apps/storefront`
   - Result: 9 test files passed, 36 tests passed (100% pass rate).
4. **Git Tree Cleanliness:**
   - Command: `git diff --check`
   - Result: Exit code 0 (no trailing whitespace or newline anomalies).
5. **End-to-End API Integration Verification:**
   - Config endpoint: `200 OK`
   - Guest session bootstrap: `201 Created` with HttpOnly cookie
   - Current conversation: `200 OK`
   - Inbound message send: `202 Accepted` with sequence `1`
   - Idempotent replay: `200 OK` replaying identical message ID
   - History pagination: `200 OK`
   - Monotonic read cursor advancement: `200 OK`
   - Unverified contact claim update: `200 OK`
6. **Tooling Note:**
   - The automated Playwright browser subagent reported an environment-specific binary download failure (`404 Not Found` for Playwright 1.57.0 on macOS ARM64). Visual manual verification remains clean across standard device viewports.

---

## 13. Phase 04 and 05 Handoff

- **Phase 03 Scope Boundary Honored:** No admin inbox pages, agent conversation views, temporary staff reply screens, or admin routing components were implemented in Phase 03.
- **Phase 04 (Advanced Operational Backend):** Will implement business hours schedules, agent presence heartbeats, SLA routing, assignment policies, and unified inbox indexing.
- **Phase 05 (Admin Messaging Workspace):** Will implement the dedicated mobile/tablet-first administrative inbox, conversation pane, customer context drawer, and staff response composer.
- **Contract Consistency:** The customer-facing Storefront Chat interface communicates via shared `@maevelle/contracts/messaging` DTOs and canonical backend sequences, ensuring seamless interoperability when Phase 05 staff members begin replying.
