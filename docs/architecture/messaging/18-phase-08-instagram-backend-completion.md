# Phase 08 Instagram Direct Messaging Backend Completion

**Status:** Repository-controlled backend code complete; Meta approval, credentials, live webhook verification, real messages, and production activation pending
**Completed:** 2026-10-22
**Next boundary:** Phase 09 Instagram Admin frontend integration and owner-controlled Meta activation

## 1. Implementation summary

Instagram Direct is implemented as an `INSTAGRAM` adapter around the existing canonical messaging domain. It reuses canonical contacts, conversations, messages, delivery intents, attempts, private media, durable provider intake, the worker, outbox facts, Admin SSE, notifications, assignments, tags, notes, follow-ups, customer links, and commerce context. There is no second inbox, transcript, queue, authorization system, or realtime transport.

The repository now owns:

- secure Instagram authorization and professional-account discovery;
- separate encrypted Instagram connection credentials;
- signed, durable, batched webhook ingestion;
- account-scoped identity and conversation resolution;
- text, image, share/story metadata, postback, reaction, read, and echo processing;
- official Send API delivery for eligible text and image replies;
- two-stage customer-initiated 24-hour reply enforcement;
- provider-specific errors, retry, rate-limit, and unknown-outcome behavior;
- resumable, idempotent Conversations API history import;
- safe connection health, subscription, permissions, suspension, reauthorization, and disconnect APIs; and
- complete typed Phase 09 contracts.

## 2. Authorization decision

### Selected model

**Instagram API with Facebook Login** is selected for Maevelle.

The business already has its Instagram professional account linked to its Facebook Page. The Facebook Login model provides a documented Page-linked account discovery response, Page task verification, and the clearest official Conversations API contract for historical Instagram inbox synchronization. Those operational requirements outweigh Instagram Login's smaller scope set for this specific business.

This decision is not an assumption that Facebook and Instagram are the same provider. Instagram has its own OAuth attempts, account selection, credential record, channel connection, health state, provider-event namespace, adapter, delivery policy, sync jobs, configuration, callback, webhook route, and disconnect lifecycle. Connecting, reauthorizing, suspending, or disconnecting Instagram does not overwrite or revoke the Facebook Messenger credential.

### Required permissions

- `pages_show_list` — discover Pages actually authorized by the user.
- `pages_manage_metadata` — app/webhook subscription management.
- `instagram_basic` — inspect the linked professional account.
- `instagram_manage_messages` — Instagram messaging and Conversations API operations.

The professional account's linked Page must report the `MESSAGING` task. Advanced Access, App Review, business verification, and reviewer/test-account requirements remain external activation gates.

### Token, identifiers, host, and version

- Authorization endpoint: versioned Facebook Login OAuth dialog.
- Token model: server-exchanged user token used only during discovery, followed by a separately encrypted Page access token for the selected linked Instagram professional account.
- API host: `graph.facebook.com`.
- Version: explicitly configured `v26.0`; no source-code fallback exists.
- Business identity: Instagram professional account ID.
- Customer identity: Instagram-scoped ID, unique only inside the selected channel connection.
- Webhook object: `instagram`; account ID comes from each entry.
- Page linkage: required by the selected authorization model.

Deployment must re-confirm `v26.0` and all fields in the Meta App Dashboard before activation. Meta developer pages returned HTTP 429 during the 2026-10-22 review, so current official Meta Postman material was used as the accessible primary implementation evidence and the Dashboard review remains mandatory.

### Official evidence reviewed

- [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/)
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
- [Instagram API with Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/)
- [Instagram Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [Graph API Webhooks](https://developers.facebook.com/docs/graph-api/webhooks/)
- [Meta permission reference](https://developers.facebook.com/docs/permissions/reference/)
- [Official Meta Instagram Postman workspace](https://www.postman.com/meta/instagram/overview)
- [Official Meta Instagram API collection](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api)
- [Official Conversations API collection](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a)

Official material confirms professional Business and Creator accounts, customer-initiated one-to-one conversations, Instagram-scoped recipients, Requests older than 30 inactive days being unavailable, share webhooks exposing only provider URLs, and API replies moving native conversations to General. Live behavior remains unverified without approved credentials.

## 3. Connection and OAuth lifecycle

1. A member with `messaging.connections.manage` creates a ten-minute OAuth attempt.
2. The database stores only a SHA-256 state digest, bound to organization, actor, and membership.
3. The browser receives the official Meta authorization URL; no password or token is accepted by Maevelle UI contracts.
4. The callback consumes only a pending, unexpired state.
5. Code exchange, permission inspection, and linked professional-account discovery happen server-side.
6. The temporary user token and Page credentials are AES-256-GCM encrypted while an account awaits selection.
7. The selection request can name only an account present in the encrypted provider discovery response.
8. Page `MESSAGING` task, actual grants, global account ownership, and tenant binding are checked transactionally.
9. A separate Instagram integration account, encrypted credential, channel connection, and provider state are created or reauthorized.
10. The backend subscribes the account and records actual subscription evidence.
11. The OAuth payload is erased after consumption.

An advisory transaction lock and `(app_id, instagram_account_id)` uniqueness prevent concurrent duplicate provisioning. A connected account cannot be silently moved to another organization.

## 4. Database implementation

The mutable development baseline `3200_messaging_core.ts` now includes:

- `instagram_oauth_attempts` — single-use state, actor/tenant binding, encrypted temporary authorization, eligible safe account projection, expiry, and errors;
- `instagram_connection_state` — Page/account identity, username/type, selected auth model, permissions, Page tasks, subscription, credential health, activity evidence, safe provider errors, review status, suspension, disconnection, and optimistic version;
- `instagram_sync_jobs` — leased resumable cursor, counters, coverage, errors, and completion evidence;
- `META_INSTAGRAM` provider-event support in the existing `provider_events` table;
- Instagram active-conversation uniqueness per account-scoped identity; and
- lookup, claim, health, and cleanup indexes.

Organization-qualified foreign keys remain authoritative. Canonical messages and conversations are not duplicated in Instagram tables.

## 5. Credential security and lifecycle

Selected Page access tokens are encrypted with the existing versioned AES-256-GCM application key and stored in `integrations.provider_credentials`. Tokens are never returned by APIs, redirects, audit metadata, realtime events, or diagnostics. Temporary OAuth credentials are deleted when the attempt is consumed.

Structured authentication and permission failures mark only the Instagram connection `NEEDS_REAUTHORIZATION`, stop prohibited provider calls, and prevent endless retries. Reauthorization rotates only the Instagram credential. Disconnect attempts official unsubscribe, destroys the local Instagram credential, disables that integration account, fails pending Instagram intents accurately, and preserves all canonical transcripts.

Token expiry/renewal semantics are provider controlled. Facebook Login Page-token validity is checked through active diagnostics and normal API failures; the implementation does not invent a refresh endpoint or silently exchange unrelated Facebook credentials.

## 6. Webhooks and durable processing

- `GET /webhooks/meta/instagram` implements the exact verification challenge.
- `POST /webhooks/meta/instagram` requires `X-Hub-Signature-256` over Fastify's exact retained raw bytes with constant-time HMAC comparison and a 1 MiB limit.
- Only `object=instagram` batches are accepted.
- Account mapping is resolved from trusted local provider-account state, never a client-provided organization.
- Stable message/postback IDs are preferred for dedupe; other events use an account-qualified stable hash.
- The API durably inserts events before returning `200 EVENT_RECEIVED`.
- Unknown accounts and unsupported events are retained only under the existing short raw-event retention and cannot crash a batch.
- Workers use `FOR UPDATE SKIP LOCKED`, bounded leases, exponential retry, attempt limits, and dead-letter state.

## 7. Incoming messages, identities, and conversations

The worker handles:

- Unicode/Bangla text;
- supported image attachments;
- non-image attachment metadata as explicit remote/provider-only content;
- story reply/share and referral context supplied by Meta;
- quick-reply payloads and postbacks;
- reactions and reaction removal as explicit canonical context events;
- read evidence; and
- API-sent echoes.

Instagram-scoped IDs are unique only within `(organization, channel_connection)`. Username, display name, and profile photo are metadata, not identity proof. Instagram contacts are never automatically merged with customers. Existing audited customer linking remains authoritative.

An advisory lock plus the active-conversation unique index prevents concurrent first-message duplicates. Website, Facebook, and Instagram histories remain separate canonical conversations even when staff later link them to one customer.

## 8. Media and attachment security

Incoming remote images reuse the Facebook/Meta media security pipeline:

- HTTPS only;
- allowlisted Meta/Facebook/Instagram CDN suffixes;
- no credentials or non-default ports;
- DNS resolution and private, loopback, link-local, CGNAT, and benchmark-network rejection;
- bounded, revalidated redirects;
- ten-second timeout;
- declared and streaming five-MiB limits;
- JPEG, PNG, and WebP allowlist; and
- existing private media upload, validation, processing, and authorization.

Failures preserve `REMOTE_ONLY` provider metadata instead of fabricating availability. Expiring story/share URLs are represented honestly.

Outgoing images remain private. The adapter gives Meta a five-minute signed object URL. Local storage, which cannot provide an externally fetchable signed URL, fails with `ATTACHMENT_PUBLIC_FETCH_UNAVAILABLE` rather than publishing or leaking the asset. A canonical Instagram reply is either text or one image.

## 9. Outgoing delivery and policy

Staff continue using the existing canonical reply API. It persists the message and delivery intent before provider I/O. The registered `INSTAGRAM` adapter reloads authoritative credentials, recipient identity, content, account, permissions, subscription health, and reply eligibility immediately before sending.

Text and image requests use `/{instagram-account-id}/messages` with the account-scoped recipient. Provider message IDs are saved through the existing external-reference path. HTTP success means `SENT`, not delivered or read.

The ordinary 24-hour customer-service window is applied from the latest qualifying customer message. Enforcement occurs during canonical acceptance and again in the delivery worker. Maevelle does not expose an arbitrary-username send API, fabricate customer initiation, apply unsupported tags, or offer unsolicited campaigns.

Timeout/network ambiguity returns `UNKNOWN`, causes `RECONCILIATION_REQUIRED`, and is not blindly retried. Rate limits and temporary failures use bounded existing delivery retries. Authentication, permission, recipient, policy, and validation failures are permanent and safe to surface.

## 10. Echoes, reads, native inbox, and folder semantics

API-sent echoes reconcile by connection and provider message ID and never create a duplicate visible message. Unmatched echoes receive a small bounded reconciliation retry before being explicitly ignored. Read watermarks advance only matching outbound messages and emit the shared delivery-changed event.

Official material states:

- new follower conversations initially appear in Primary;
- new non-follower conversations initially appear in Requests;
- replying through the API moves the native conversation to General; and
- Requests inactive for more than 30 days are not returned by API calls.

Meta does not expose a sufficiently reliable writable folder contract for Maevelle to mirror or reorganize the native inbox. Canonical workflow status therefore remains separate. Conversation context records folder as `UNKNOWN` until supported provider evidence exists. Maevelle never moves, deletes, archives, blocks, or marks native conversations as spam.

## 11. Historical synchronization

The bounded worker uses the official Conversations API to list Instagram conversations and messages. One conversation is checkpointed at a time so a crash cannot skip the remainder of a provider page. Provider cursors, participant ID, conversation ID, and page completion state are durable.

Imports preserve provider timestamps, direction, provider conversation/message IDs, account-scoped identity, and attachment metadata. Canonical external references prevent duplication. Historical inbound acceptance suppresses normal live staff attention and does not reopen or reorder a newer resolved conversation. Counters distinguish conversations, messages, duplicates, attachment failures, partial coverage, provider exhaustion, and unavailable access.

Coverage is never claimed complete beyond provider evidence. Requests inactive for more than 30 days and any Meta-side retention/access restriction remain unavailable.

## 12. Administrative API catalog

All successful responses use `{ data }`; errors use the established `{ error: { code, message, details?, requestId? } }` envelope. No endpoint returns credentials.

| Method | Route | Capability/auth | Request | Response / concurrency / idempotency |
|---|---|---|---|---|
| GET | `/webhooks/meta/instagram` | Verify token | Meta challenge query | Plain challenge; no mutation beyond provider verification |
| POST | `/webhooks/meta/instagram` | HMAC signature | Official batch envelope | Durable dedupe then `EVENT_RECEIVED`; replay safe by provider/account/event key |
| GET | `/integrations/messaging/instagram/oauth/callback` | Signed one-time state | `state`, `code` or provider error | Safe redirect with attempt ID; state is single use |
| GET | `/admin/messaging/connections/instagram/availability` | `messaging.connections.view` | none | Configuration, auth model, version, scopes, callback, limitations |
| POST | `/admin/messaging/connections/instagram/oauth` | `messaging.connections.manage` | none | Authorization URL, attempt ID, expiry; each call intentionally creates a new attempt |
| GET | `/admin/messaging/connections/instagram/oauth/:attemptId` | `messaging.connections.manage` and bound actor | UUID path | Safe status and eligible account list |
| POST | `/admin/messaging/connections/instagram` | `messaging.connections.manage` | `{ attemptId, instagramAccountId }` | Selected/reauthorized connection; single-use attempt and unique account ownership make retries safe or conflict |
| GET | `/admin/messaging/connections/instagram` | `messaging.connections.view` | none | Organization connection list |
| GET | `/admin/messaging/connections/instagram/:connectionId` | `messaging.connections.view` | UUID path | Connection, permissions, subscription, readiness, errors, sync projection |
| PATCH | `/admin/messaging/connections/instagram/:connectionId` | `messaging.connections.manage` | `{ suspended? , permissionReviewStatus? }` plus `If-Match` | Updated connection; stale version is `STALE_VERSION` |
| POST | `/admin/messaging/connections/instagram/:connectionId/diagnostics` | `messaging.connections.manage` | none | Active identity/subscription verification and refreshed connection state |
| DELETE | `/admin/messaging/connections/instagram/:connectionId` | `messaging.connections.manage` | UUID path | `204`; unsubscribe is attempted, transcript retained, credential destroyed |
| GET | `/admin/messaging/conversations/:conversationId/instagram-reply-eligibility` | `messaging.reply` | UUID path | Allowed/reason/expiry/content types/next action |
| POST | `/admin/messaging/connections/instagram/:connectionId/syncs` | `messaging.connections.manage` | UUID path | `202` sync job; one active job per connection makes repeated starts idempotent |
| GET | `/admin/messaging/connections/instagram/syncs/:syncId` | `messaging.connections.view` | UUID path | Tenant-scoped progress, checkpoint coverage, and safe error state |

Important errors include `FORBIDDEN`, `INSTAGRAM_NOT_CONFIGURED`, `META_AUTHORIZATION_DENIED`, `INVALID_WEBHOOK_SIGNATURE`, `INVALID_WEBHOOK_PAYLOAD`, `VALIDATION_FAILED`, `STALE_VERSION`, `CONNECTION_UNAVAILABLE`, `REPLY_WINDOW_CLOSED`, provider `META_<code>_<subcode>`, and safe delivery failure codes.

Connection and sync changes are visible through normal Admin refetch/invalidation patterns. Canonical new-message, conversation, and delivery changes use existing `messaging.message.created.v1`, `messaging.message.delivery_changed.v1`, and inbox invalidation events. Phase 09 does not need a new websocket or Instagram event protocol.

## 13. Unified inbox, notifications, and customer context

Live inbound Instagram messages call canonical trusted inbound acceptance, which owns sequencing, reopen behavior, routing, unread state, outbox facts, notifications, and realtime publication. Historical messages set the existing `historical` flag and do not create false live attention.

Every existing operational feature—assignment, claim, priority, notes, tags, saved replies, follow-ups, search, reporting, audited customer link, customer profile, orders, payments, fulfillment, returns, and access policy—works through the shared conversation/contact IDs. No provider metadata bypasses customer or commerce authorization.

## 14. Cross-asset safety

Instagram uses `INSTAGRAM_*` runtime configuration, `META_INSTAGRAM` integration/provider namespaces, separate provider credentials, and separate connection state. The implementation does not mutate Facebook channel rows, Facebook Page connection credentials, WhatsApp configuration, business ownership, administrators, ad accounts, or Meta Business Suite. It does not delete provider conversations or change conversation routing/handover controls.

The only provider-side mutations implemented are the selected Instagram professional account's app subscription, normal eligible replies, and explicit unsubscribe during disconnect.

## 15. Performance and dependencies

Webhook responses perform HMAC validation and indexed durable inserts only. Provider/media/history work is asynchronous. Claims and syncs are bounded, profile discovery occurs only during OAuth, cursors are durable, and the existing worker shares capacity without a new broker or service.

No dependency was added. The implementation uses native `fetch`, Node crypto/DNS, existing Kysely/PostgreSQL, Fastify/TypeBox, AES-GCM helpers, private object storage, canonical messaging services, worker leases, and SSE.

## 16. Verification performed

- `pnpm typecheck` — passed.
- Focused ESLint on touched TypeScript files — passed with no findings.
- `pnpm vitest run packages/core/src/meta-messenger.test.ts packages/config/src/index.test.ts apps/api/src/routes/facebook-messaging.test.ts` — 21/21 passed during implementation.
- Focused messaging/provider regression run — 36/36 passed after Instagram tests were added.
- `pnpm vitest run apps/api` — 11 files and 39 tests passed.
- `pnpm vitest run apps/worker` — 2 files and 2 tests passed.
- `pnpm vitest run packages/database/src/migrate.test.ts` — clean PostgreSQL baseline migration and rerun passed.
- `pnpm check:secrets` — passed; no high-confidence tracked credentials.
- Focused SAST source review — no eval/command sinks, token DTO exposure, raw-body signature bypass, or tenant-unqualified public lookup found. Semgrep was unavailable and was not installed.

The disposable test database was rebuilt at the `3200_messaging_core` baseline because it had previously recorded that mutable migration as applied. No production/shared database was changed.

No live Instagram credentials, approved app, public callback, authorized account, webhook, or real recipient were available. No live provider test or deployment is claimed.

## 17. Deployment and activation runbook

1. Confirm the Meta app is a Business app owned by Maevelle's verified business.
2. Confirm the intended Instagram account is Business or Creator, linked to the intended Page, and the authorizing person has the Page `MESSAGING` task.
3. Reconfirm current Graph version, scopes, webhook fields, 24-hour policy, Conversations API coverage, media limits, and review requirements in the Meta Dashboard.
4. Request and obtain Advanced Access/App Review for every configured scope; prepare reviewer instructions and a screencast.
5. Configure a unique Instagram callback and webhook endpoint without modifying the Facebook Messenger callback/subscription.
6. Configure `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_GRAPH_API_VERSION=v26.0`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `INSTAGRAM_OAUTH_CALLBACK_URL`, and optional scope override. Preserve `AUTH_ENCRYPTION_KEY`.
7. Deploy schema, API, then worker. Confirm Website and Facebook messaging first.
8. Verify the public challenge and a signed fixture before authorizing the business account.
9. Authorize, inspect the discovered account ID/username/Page, and explicitly select it.
10. Confirm permission and subscription diagnostics.
11. Use an approved test user to initiate a DM; verify text, Bangla/emoji, image, story/share context, unread count, notification, and SSE.
12. Send one controlled eligible text reply and one image reply. Compare provider message IDs, echo/read evidence, and native inbox movement to General.
13. Verify an expired window is rejected and a simulated timeout becomes reconciliation-required without duplicate send.
14. Start a small history sync, compare coverage with Instagram/Business Suite, and record Requests limitations.
15. Recheck the existing Facebook connection and confirm WhatsApp and ads are unchanged.
16. Obtain owner operational acceptance before general use.

Rollback is local and non-destructive: suspend Instagram outbound processing, then disconnect if required. This removes only the Instagram subscription/credential and preserves Maevelle transcripts and original Instagram history. Reauthorization can occur later. Facebook and WhatsApp remain independent.

## 18. Known limitations and external requirements

- Meta App Review, Advanced Access, business verification, Page tasks, credential validity, and account eligibility are not evidenced.
- Live webhook shape, Send API behavior, echo/read availability, and native Business Suite coexistence are not verified.
- Requests inactive more than 30 days are outside documented Conversations API coverage.
- Primary/General/Requests cannot be reliably mirrored or changed through the implemented contract; API replies may move threads to General.
- Read evidence is supported where delivered; provider acceptance is not represented as read.
- Edits, unsend/deletion, arbitrary folder control, marketing tags, automation exceptions, and unsolicited DMs are not invented.
- Non-image media is preserved as provider-only metadata until an approved safe processor exists.
- Outgoing image delivery requires externally fetchable short-lived signed object access; local-only object storage cannot complete that provider fetch.
- Native Instagram/Business Suite messages that Meta does not echo cannot be attributed or imported beyond Conversations API evidence.

## 19. Phase 09 frontend handoff

Phase 09 can implement a guided Instagram panel without backend redesign:

1. Fetch availability and explain professional-account/Page linkage, minimal scopes, Advanced Access, native General-folder movement, and history limits.
2. POST OAuth start and open/navigate to `authorizationUrl`.
3. On `?instagram=authorized&attemptId=...`, poll the bound attempt.
4. Render only provider-discovered eligible accounts with ID, username, display name, type, Page, tasks, grants, and ineligibility reasons.
5. POST the selected account and render the returned readiness projection.
6. Provide diagnostics, review-status update, suspend/resume, reauthorization, non-destructive disconnect, and sync controls with `If-Match` where required.
7. Add `INSTAGRAM` to the existing inbox filter/badge/fallback-name presentation.
8. Fetch reply eligibility for Instagram conversations, display the countdown/restriction, and enforce one-image-or-text composition in the UI while treating backend enforcement as authoritative.
9. Render `context.instagram` story/share, postback, quick reply, referral, and reaction data defensively.
10. Continue using shared transcript, private attachment, assignment, note, tag, follow-up, customer, and commerce components.

The frontend must never receive tokens, exchange codes, validate provider identity, determine tenant ownership, or override policy eligibility.

## 20. Operational status

1. Instagram backend code complete: **yes, for independently implementable repository responsibilities**.
2. Selected authorization model verified: **verified against accessible current official Meta material; Dashboard revalidation required at activation**.
3. Credentials configured: **no evidence**.
4. Instagram professional account connected: **no**.
5. Webhooks live and verified: **no**.
6. Real incoming DMs verified: **no**.
7. Real outgoing replies verified: **no**.
8. Required permissions approved: **not evidenced**.
9. Historical sync supported: **implemented against the official Conversations API; live coverage unverified**.
10. Facebook and WhatsApp assets unaffected: **repository code and credential/state isolation verified; live external regression not performed**.
11. Production deployment performed: **no**.
12. Phase 09 can begin without major backend redesign: **yes**.
