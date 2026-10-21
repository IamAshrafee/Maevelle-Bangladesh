# API and Realtime Event Contracts

## Contract rules

- Existing public prefix: `/storefront/v1`; Admin prefix: `/admin`; provider callbacks: `/webhooks` and connection management: `/admin/messaging/connections`.
- Success: `{ "data": ... }`; collection: `{ "data": [...], "pagination": { "nextCursor": string|null, "hasMore": boolean } }`.
- Error: `{ "error": { "code": string, "message": string, "details"?: object, "requestId"?: string } }`.
- TypeBox validates HTTP boundaries; shared DTOs live in `@maevelle/contracts/messaging`. Database rows never cross transport directly.
- IDs are opaque UUID strings. Times are RFC 3339 UTC. Enums are uppercase snake case.
- Commands that create messages/notes/assignments accept a stable `Idempotency-Key`; same key/different fingerprint is `422 IDEMPOTENCY_KEY_REUSED`; in-flight duplicate is `409 IDEMPOTENCY_IN_PROGRESS`; completed duplicate replays the safe response.
- Growing collections use opaque cursor pagination with deterministic `(sort_field,id)` order. Default 30, maximum 100; messages maximum 100.
- Conditional Admin mutations require `If-Match: "<version>"`; stale state returns 409 with current version/resource summary.

## Common DTOs

```ts
type ConversationStatus = 'NEW' | 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
type MessageDeliveryState =
  | 'RECEIVED' | 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ'
  | 'FAILED_TRANSIENT' | 'FAILED_PERMANENT' | 'UNKNOWN';

interface ConversationSummary {
  id: string;
  channel: { kind: 'WEBSITE'|'FACEBOOK'|'INSTAGRAM'; connectionId: string; name: string };
  contact: { id: string; displayName: string|null; customerId: string|null };
  status: ConversationStatus;
  priority: 'LOW'|'NORMAL'|'HIGH'|'URGENT';
  assignee: { membershipId: string; displayName: string } | null;
  lastMessage: { sequence: string; preview: string; direction: 'INBOUND'|'OUTBOUND'; createdAt: string } | null;
  unreadCount: number;
  capabilities: ChannelCapabilities;
  version: string;
}

interface MessageView {
  id: string;
  conversationId: string;
  sequence: string;
  direction: 'INBOUND'|'OUTBOUND'|'INTERNAL';
  sender: { type: 'CONTACT'|'STAFF'|'SYSTEM'|'PROVIDER'; id: string|null; name: string|null };
  type: 'TEXT'|'ATTACHMENT'|'MIXED'|'SYSTEM_EVENT';
  text: string|null;
  attachments: AttachmentView[];
  delivery: { state: MessageDeliveryState; failureCode?: string; canRetry: boolean };
  createdAt: string;
  editedAt: string|null;
  retractedAt: string|null;
}
```

## Storefront endpoints (Phase 02)

| Method and route | Purpose / auth | Request | Important results/errors |
|---|---|---|---|
| `GET /storefront/v1/chat/config` | Public bounded config | none | availability, business hours, allowed MIME/size, greeting; 503 unavailable |
| `POST /storefront/v1/chat/session` | Initialize/rotate visitor; rate limited | optional resume cookie; page context | 201 session/conversation summary; sets HttpOnly credential cookie |
| `GET /storefront/v1/chat/conversations/current` | Visitor cookie or verified customer session | none | current conversation; 404 none, 401 invalid credential |
| `POST /storefront/v1/chat/conversations` | Visitor/customer; idempotent | initial message optional, bounded context | 201/200 active conversation |
| `GET /storefront/v1/chat/conversations/:id/messages?before=&limit=` | Credential must own conversation | cursor | descending page returned in display order with `nextCursor` |
| `POST /storefront/v1/chat/conversations/:id/messages` | Own conversation; idempotent/rate limited | `{ clientMessageId,text?,attachmentIds? }` | 202 canonical message; 409 closed; 422 capability/content |
| `POST /storefront/v1/chat/uploads` | Own active conversation | `{ fileName,mimeType,byteSize,sha256 }` | upload session; rejected type/size; 429 abuse limit |
| `POST /storefront/v1/chat/uploads/:id/complete` | Own upload | object checksum/metadata | quarantined/available attachment |
| `POST /storefront/v1/chat/conversations/:id/read` | Own conversation | `{ lastReadSequence }` | monotonic cursor |
| `POST /storefront/v1/chat/conversations/:id/reopen` | Own conversation and policy allows | empty, idempotent | open conversation or 409 policy |
| `PATCH /storefront/v1/chat/contact` | Submit optional contact data | name/email/phone + consent flags | stores unverified contact claim; never exposes customer data |
| `GET /storefront/v1/chat/events?cursor=` | Visitor SSE | cursor or `Last-Event-ID` | authorized replay/keepalive; 410 expired cursor |

Customer login transition calls an internal identity-link application service after Better Auth/customer-account verification; there is no public arbitrary `customerId` link route.

### Start/send example

```http
POST /api/storefront/v1/chat/conversations/019.../messages
Idempotency-Key: 6b90d10e-...
Content-Type: application/json

{"clientMessageId":"01J...","text":"Is the teal size M available?","attachmentIds":[]}
```

```json
{
  "data": {
    "id": "019...",
    "conversationId": "019...",
    "sequence": "3",
    "direction": "INBOUND",
    "type": "TEXT",
    "text": "Is the teal size M available?",
    "attachments": [],
    "delivery": { "state": "RECEIVED", "canRetry": false },
    "createdAt": "2026-10-21T10:15:30.000Z",
    "editedAt": null,
    "retractedAt": null
  }
}
```

## Admin endpoints

### Phase 01/03 minimum operational surface

| Method and route | Capability | Purpose |
|---|---|---|
| `GET /admin/messaging/conversations` | `messaging.inbox.view_assigned` or `.view_all` | cursor list with `scope=mine|unassigned|all`, status/channel/search/sort filters |
| `GET /admin/messaging/conversations/:id` | assignment-aware view | detail, capabilities, contact, assignment, tags summary |
| `GET /admin/messaging/conversations/:id/messages` | assignment-aware view | cursor history |
| `POST /admin/messaging/conversations/:id/messages` | `messaging.reply` + conversation access | accept staff reply, 202 |
| `POST /admin/messaging/conversations/:id/read` | conversation access | advance membership read cursor |
| `GET /admin/messaging/events` | inbox capability | organization/membership-authorized SSE |
| `POST /admin/messaging/conversations/:id/claim` | `messaging.claim` | atomic self-assignment, expected version |
| `PATCH /admin/messaging/conversations/:id/status` | `messaging.status.manage` | transition status, expected version |

### Phase 04 complete operations

| Method and route | Capability / notes |
|---|---|
| `PATCH /admin/messaging/conversations/:id/assignment` | `messaging.assign`; assignee, reason, version |
| `PATCH /admin/messaging/conversations/:id/priority` | `messaging.priority.manage` |
| `POST/DELETE /admin/messaging/conversations/:id/tags/:tagId` | `messaging.tags.manage` |
| `GET/POST/PATCH /admin/messaging/tags` | list uses inbox permission; mutation settings permission |
| `GET/POST/PATCH /admin/messaging/saved-replies` | view/use vs manage permissions |
| `POST /admin/messaging/conversations/:id/notes` | `messaging.notes.create`; idempotent |
| `PATCH /admin/messaging/notes/:id` | author within edit window or supervisor permission; preserves revision evidence |
| `GET /admin/messaging/contacts?query=&cursor=` | `messaging.contacts.search` |
| `POST /admin/messaging/contacts/:id/customer-link` | `messaging.customer_link.manage`; proof/method/reason |
| `DELETE /admin/messaging/contacts/:id/customer-link` | same; audited unlink reason |
| `GET /admin/messaging/conversations/:id/customer-context` | `messaging.customer_context.view`; only linked customer |
| `GET/PATCH /admin/messaging/settings/business-hours` | `messaging.settings.manage` |
| `GET/POST/PATCH /admin/messaging/settings/assignment-rules` | `messaging.settings.manage` |
| `GET/PATCH /admin/messaging/availability/me` | authenticated agent |
| `GET /admin/messaging/reports/summary` | `messaging.reports.view`; bounded date/channel/agent filters |
| `POST /admin/messaging/conversations/bulk` | supervisor-only; allowed actions tag/priority/assign/resolve; max 100 IDs, per-item results |

Search is server-side and initially covers contact display name, verified contact points through the customer context boundary, provider username, conversation ID, and message text using PostgreSQL full-text/trigram only after privacy/performance review. It never searches across organizations.

### Admin reply example

```json
{
  "clientMessageId": "01JAZ...",
  "text": "Yes—size M is currently available.",
  "attachmentIds": [],
  "replyToMessageId": "019..."
}
```

`202` returns `MessageView` with `QUEUED`. `409 REPLY_WINDOW_CLOSED` includes safe details `{ "eligibleUntil": "...", "channelKind": "FACEBOOK" }`. A timeout after acceptance is resolved by retrying the same key or fetching by `clientMessageId`.

## Connection/provider endpoints

| Phase | Route | Purpose/security |
|---|---|---|
| 06/08 | `GET /admin/messaging/connections` | list health/capabilities; `messaging.connections.view` |
| 06/08 | `POST /admin/messaging/connections/:kind/oauth/start` | state/PKCE initiation; `messaging.connections.manage` |
| 06/08 | `GET /integrations/messaging/:kind/oauth/callback` | validates single-use OAuth state; no Admin cookie authority alone |
| 06/08 | `PATCH /admin/messaging/connections/:id` | enable/configure non-secret settings |
| 06/08 | `POST /admin/messaging/connections/:id/diagnostics` | bounded health check, no secret output |
| 06/08 | `DELETE /admin/messaging/connections/:id` | audited disconnect/revoke; preserves transcript |
| 06 | `GET/POST /webhooks/meta/messenger` | verification challenge / signed raw-body intake |
| 08 | `GET/POST /webhooks/meta/instagram` | verification challenge / signed raw-body intake |

Webhook POST acknowledges only after signature validation and durable dedupe-row insertion. Invalid signatures return 401. Duplicate verified events return 200 without duplicate effects. Processing errors after durable acceptance do not change webhook response; the worker retries.

## Internal application contracts

Internal functions receive an explicit `MessagingActorContext` containing organization, principal type/ID, membership/customer/visitor identity and granted capabilities. They do not infer organization from an entity ID. Channel adapters receive normalized commands and never a database client.

```ts
type DeliveryOutcome =
  | { type: 'ACCEPTED'; providerMessageId: string; providerRequestId?: string }
  | { type: 'TRANSIENT_FAILURE'; code: string; retryAfter?: string }
  | { type: 'PERMANENT_FAILURE'; code: string; safeMessage: string }
  | { type: 'UNKNOWN'; code: string; reconciliationKey?: string };
```

Third-party payloads are parsed into discriminated normalized events. Unknown versions/types are persisted as `IGNORED` or dead-lettered with diagnostics; they are never cast to trusted DTOs.

## Realtime event catalog

Persisted/replayable:

| Event | Minimal payload |
|---|---|
| `messaging.conversation.created.v1` | conversation ID/version |
| `messaging.conversation.updated.v1` | ID/version/changed fields |
| `messaging.conversation.assigned.v1` | ID/version/assignee ID |
| `messaging.conversation.status_changed.v1` | ID/version/from/to |
| `messaging.message.created.v1` | conversation/message IDs, sequence, direction |
| `messaging.message.delivery_changed.v1` | IDs, sequence, state, safe failure code |
| `messaging.read_cursor.advanced.v1` | conversation ID, reader scope, sequence |
| `messaging.connection.status_changed.v1` | connection ID/status |
| `messaging.inbox.invalidated.v1` | affected saved scopes/filter hints |

Ephemeral, non-replayable: `typing.started/stopped`, transient presence heartbeat, active-view hints. Loss is acceptable; TTL is 10 seconds and no database business state changes.

### SSE framing and recovery

```text
id: 184922
event: messaging.message.created.v1
data: {"eventId":"019...","conversationId":"019...","messageId":"019...","sequence":"42"}
```

The server authorizes every event against the connection principal, emits 15-second comments as keepalives, limits one active visitor stream and a small bounded number per staff session, and closes at a configured maximum duration so browsers reconnect. `Last-Event-ID` and `cursor` are equivalent. Events can duplicate across reconnect; clients dedupe by event ID and reconcile by message ID/sequence. A sequence gap triggers bounded history refetch.

## Error catalog

Core codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `CONVERSATION_NOT_FOUND` (404, also used to prevent enumeration), `VALIDATION_FAILED` (400), `RATE_LIMITED` (429 + Retry-After), `STALE_VERSION`/`ASSIGNMENT_CONFLICT`/`CONVERSATION_CLOSED` (409), `CHANNEL_CAPABILITY_UNSUPPORTED`/`REPLY_WINDOW_CLOSED`/`ATTACHMENT_REJECTED` (422), `IDEMPOTENCY_IN_PROGRESS` (409), `IDEMPOTENCY_KEY_REUSED` (422), `EVENT_CURSOR_EXPIRED` (410), and `CONNECTION_UNAVAILABLE` (503).
