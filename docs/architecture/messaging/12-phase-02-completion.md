# Phase 02 Storefront Backend Completion and Operations

**Completed:** 2026-10-21
**Scope:** Storefront live-chat backend and website channel

## Delivered capability

Phase 02 extends the Phase 01 canonical messaging core instead of creating a
parallel chat system.

- A single active `WEBSITE` connection is created idempotently per organization.
- Guest sessions use an opaque `session-id.secret` credential. Only an HMAC
  digest is stored. The browser credential is an HttpOnly, SameSite=Lax cookie;
  production cookies are Secure and scoped to `/api/storefront/v1/chat`.
- Session idle and absolute expiry, touch extension, revocation, authenticated
  customer linking, audited contact linking, and credential rotation are
  enforced server-side.
- One active website conversation is enforced by PostgreSQL for each website
  channel identity across `NEW`, `OPEN`, `PENDING`, and `RESOLVED`. Identity-row
  locking makes concurrent starts converge on the same conversation.
- Canonical inbound acceptance remains transactional and now supports website
  client IDs and visitor-owned attachments. Both the idempotency key and stable
  client message ID replay the original canonical message; conflicting reuse is
  rejected.
- Visitor history, read cursors, status/reopen behavior, safe page/product
  context, and visitor-filtered durable realtime replay are implemented.
- The worker registers a website adapter by default. Website `SENT` means the
  canonical reply is durably available to authorized visitor history; it does
  not claim that a browser was connected. `READ` is recorded only when the
  visitor advances the read cursor.
- Optional name, email, and phone claims are stored as unverified profile
  metadata. A contact becomes linked only through an active authenticated
  customer account relationship; the link is audited and session credentials
  rotate.

The availability response currently describes whether the website channel
accepts messages. It deliberately does not infer live agent presence. Business
hours, agent presence, SLA routing, and advanced inbox automation remain Phase
04 behavior.

## Public API

The API mounts these routes without the reverse-proxy `/api` prefix. Storefront
browser clients use the shown public paths:

| Public path | Behavior |
| --- | --- |
| `GET /api/storefront/v1/chat/config` | Safe channel availability, greeting, capabilities, and attachment policy |
| `POST /api/storefront/v1/chat/session` | Create or resume a visitor, link an authenticated customer when eligible, and return the active conversation |
| `DELETE /api/storefront/v1/chat/session` | Revoke the current visitor credential |
| `GET /api/storefront/v1/chat/conversations/current` | Return the visitor's current active conversation |
| `POST /api/storefront/v1/chat/conversations` | Converge on the current active conversation or create one after a prior conversation is closed |
| `GET /api/storefront/v1/chat/conversations/:id/messages` | Cursor-paginated canonical history |
| `POST /api/storefront/v1/chat/conversations/:id/messages` | Accept text and/or up to five ready private images; requires `Idempotency-Key` |
| `POST /api/storefront/v1/chat/conversations/:id/read` | Monotonically advance the visitor read cursor and mark eligible staff messages read |
| `POST /api/storefront/v1/chat/conversations/:id/reopen` | Reopen a resolved conversation; closed conversations require a new conversation |
| `PATCH /api/storefront/v1/chat/contact` | Save unverified optional contact claims and consent flags |
| `POST /api/storefront/v1/chat/uploads` | Create a visitor-owned private upload authorization |
| `PUT /api/storefront/v1/chat/uploads/:id/content` | Local-storage upload proxy with exact size, signature, and checksum validation |
| `POST /api/storefront/v1/chat/uploads/:id/complete` | Verify stored object evidence and queue normal media processing |
| `GET /api/storefront/v1/chat/uploads/:id` | Poll `PENDING`, `PROCESSING`, `AVAILABLE`, `ATTACHED`, `REJECTED`, or `EXPIRED` |
| `GET /api/storefront/v1/chat/attachments/:id` | Authorized private rendition read; never a public media URL |
| `GET /api/storefront/v1/chat/events` | Visitor-scoped replayable SSE using `cursor` or `Last-Event-ID` |

State-changing Storefront chat requests enforce the configured Storefront
origin when an `Origin` header is present. Public and endpoint-specific rate
limits apply. SSE permits one stream per visitor session, emits keepalives,
revalidates the credential, supports replay, reports an expired replay window as
`410 EVENT_CURSOR_EXPIRED`, and closes periodically for normal reconnection.

## Attachment lifecycle

Only JPEG, PNG, and WebP are accepted, with a five-image message limit and a
5 MiB per-file limit. Upload records are bound to the organization,
conversation, and stable website identity. The original asset is private and
cannot be attached until the existing media worker has decoded and validated
the image, generated private renditions, and moved the asset to `READY`.
Invalid images are failed or quarantined by the existing media processor.

Message attachment rows retain the media asset. Normal media purge refuses to
remove referenced messaging assets. Unattached expired uploads are marked
expired, moved into the recoverable media-trash lifecycle, and later purged by
the normal worker. Download authorization always rechecks visitor or staff
conversation access and serves a private `zoom` rendition.

## Error and recovery contract

- Missing or malformed visitor credentials return `401 UNAUTHENTICATED`.
- Expired, revoked, or rotated credentials return `401 SESSION_EXPIRED`.
- Cross-visitor conversation, upload, and attachment identifiers are reported
  as not found and reveal no ownership detail.
- Closed conversations reject new messages. The client creates a new
  conversation instead.
- A reused idempotency key with different input returns
  `409 IDEMPOTENCY_KEY_REUSED`; an in-progress original returns
  `409 IDEMPOTENCY_IN_PROGRESS`.
- Unsupported/oversized uploads and unavailable attachment IDs fail before a
  canonical message is created.
- A disconnected browser loses no accepted messages: reconnect SSE using the
  last cursor, and reload history on a replay-window gap.

## Operations and troubleshooting

The API, PostgreSQL, existing worker, and configured object storage are the only
required runtime components. There is no new broker or chat service.

1. Confirm `GET /api/storefront/v1/chat/config` returns `enabled: true` and
   `acceptsMessages: true`.
2. If sends are accepted but staff replies remain queued, confirm the worker is
   running and inspect messaging delivery intents/attempts. The website adapter
   requires no external provider credential.
3. If an upload remains `PROCESSING`, inspect media processing records and the
   worker's media storage configuration. Do not mark assets ready manually.
4. If SSE returns `410`, reload canonical history and reconnect without the old
   cursor. If it returns `401`, initialize a new session; do not copy a stale
   credential into client storage.
5. Never log cookie values, message bodies, contact claims, private object keys,
   or attachment bytes. Realtime and outbox payloads contain identifiers and
   state only.

The worker also expires stale visitor sessions, expires unattached website
uploads, reclaims abandoned messaging delivery leases, and purges old realtime
events on its normal tick.

## Verification evidence

- Both development and test PostgreSQL databases were rebuilt from the mutable
  baseline, and all migrations through `3200_messaging_core` applied cleanly.
- Database integration coverage passes for durable resume, six concurrent
  conversation starts, cross-visitor isolation, filtered realtime replay,
  idempotency-key and client-ID replay, revoked credentials, website delivery,
  visitor read evidence, ready private attachments, and cross-visitor attachment
  denial.
- The existing Phase 01 messaging integration suite still passes, including
  transactional evidence, concurrent sequences, tenant isolation, claim races,
  delivery outcomes, and replay retention.
- API integration coverage passes for cookie issuance, unauthenticated denial,
  send/replay/conflict history, cross-origin mutation rejection, and a verified
  local image upload through completion into media processing.
- Focused Database and API builds plus Worker typechecking pass; those builds
  consume and validate the shared messaging contracts.

## Phase 03 handoff

Phase 03 owns presentation only: the lazy responsive Storefront widget and the
permanent Admin inbox workspace. It should consume these API and SSE contracts,
reuse `clientMessageId` and `Idempotency-Key` across retries, poll attachment
processing before send, reconcile optimistic items with canonical messages, and
reload history when replay retention has elapsed. It must not introduce another
guest identity, transcript store, websocket protocol, or public attachment URL.
