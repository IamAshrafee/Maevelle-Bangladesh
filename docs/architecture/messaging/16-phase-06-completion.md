# Phase 06 Facebook Messenger Backend Completion

**Status:** Code complete for repository-controlled responsibilities; live Meta integration and production activation unverified  
**Completed:** 2026-10-22  
**Next boundary:** Phase 07 Facebook connection and diagnostics UI

## 1. Implementation overview

Facebook Messenger is a provider adapter around the existing canonical messaging model. It does not own a second inbox, transcript, notification stream, customer model, or job framework. Signed Page webhooks enter a short-retention durable provider inbox; the existing worker resolves Page-scoped contacts and conversations and calls the canonical inbound service. Staff replies continue through the existing message acceptance and delivery-intent path, with a registered Facebook Send API adapter.

## 2. Meta API version and research

Every OAuth, Graph, subscription, history, attachment-upload and Send API URL is built from the explicit `META_GRAPH_API_VERSION`. The selected version is recorded on each Page connection. There is deliberately no silently aging source-code default; deployment must pin a currently supported `vNN.0` after the activation review.

Research on 2026-10-22 reconfirmed the Meta-maintained [Messenger Platform Postman collection](https://www.postman.com/meta/messenger-platform-api/collection/iyp204x/messenger-platform-api): a Facebook Page and `pages_messaging` are required, and the API supports user and system-user token models. Meta developer documentation for [Messenger Platform](https://developers.facebook.com/docs/messenger-platform/), [Send API](https://developers.facebook.com/docs/messenger-platform/send-messages/), [webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks/), [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login-for-business/), permissions, and the Graph changelog returned HTTP 429 to the research client. The owner must therefore repeat the official Dashboard/version review at activation. Development-mode access is not represented as App Review approval.

Configured scopes are minimal to the implemented operations: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, and `pages_read_engagement`. Actual grants are recorded and missing grants produce a limited-permission state.

## 3. Page connection architecture

An authorized owner starts a ten-minute, organization/member-bound OAuth attempt. Only a SHA-256 digest of the random state is stored. The callback exchanges the code server-side, discovers Pages from the authenticated Meta account, records safe Page metadata, and encrypts the user/Page authorization bundle with AES-256-GCM. Page selection must reference that stored eligible set; an arbitrary client-supplied Page ID cannot establish a connection.

Selection creates or reauthorizes:

- the existing `integrations` and `integration_accounts` records;
- an encrypted `provider_credentials` Page token;
- a `FACEBOOK` channel connection; and
- provider-specific health/permission/subscription state.

The same app/Page cannot be actively attached to conflicting organizations. Reauthorization for the same organization rotates the credential atomically. A cross-organization move requires a future explicit audited transfer procedure.

## 4. OAuth and permission model

OAuth state is random, short-lived, single-use, actor/member/organization bound, and consumed under a row lock. Callback errors fail the attempt without exposing codes or tokens to the browser. Phase 07 receives only an attempt ID and safe status/Page DTOs. Connection management uses Better Auth, active organization membership, `messaging.connections.manage`, tenant-qualified queries and audit events. Read-only health uses `messaging.connections.view`.

## 5. Token storage and lifecycle

Page access tokens are AES-256-GCM encrypted in `integrations.provider_credentials` using the existing versioned application encryption key. Tokens never appear in connection DTOs, callback redirects, realtime events, audit metadata or structured logs. Credential/authentication errors mark the connection `NEEDS_REAUTHORIZATION` and stop provider delivery. Reauthorization replaces the credential revision transactionally. Disconnect attempts official Page unsubscribe, deletes local credential material, disables the integration account, fails unsent delivery intents accurately, and retains the canonical transcript.

## 6. Database additions

The mutable development baseline `3200_messaging_core.ts` now owns:

- `facebook_oauth_attempts` — digested state, encrypted temporary authorization, expiry and safe Page discovery;
- `facebook_connection_state` — app/Page/version, permissions, Page tasks, subscription, credential and operational health;
- `provider_events` — signed durable webhook intake, dedupe, leases, retry/dead-letter state and seven-day retention;
- `facebook_sync_jobs` — resumable, leased historical synchronization checkpoints and progress;
- a global active Meta Page ownership index; and
- a Facebook active-conversation uniqueness constraint per Page-scoped identity.

Foreign keys and indexes cover Page lookup, OAuth cleanup, event claims, connection diagnostics, sync claims and tenant joins.

## 7. Webhook endpoints and verification

- `GET /webhooks/meta/messenger` validates `hub.mode`, the configured verify token and challenge before returning exact plain text.
- `POST /webhooks/meta/messenger` verifies `X-Hub-Signature-256` with HMAC-SHA256 over Fastify's exact retained raw JSON bytes using constant-time comparison. The route has a 1 MiB limit.

Only signed Page envelopes are accepted. Batched entries and messaging events are persisted before `200 EVENT_RECEIVED`. Unknown Pages are retained as short-lived ignored events without assigning a tenant.

## 8. Durability and deduplication

Provider events use unique `(provider, provider_account_id, event_key)`. Message/postback IDs are preferred; delivery/read/unsupported events use a Page-qualified stable hash. Workers claim with `FOR UPDATE SKIP LOCKED`, recover expired leases, retry transient failures with bounds, and mark unsupported or malformed work explicitly. Provider message references provide a second canonical idempotency barrier.

## 9. Incoming normalization

The worker handles text, Unicode/Bangla/emoji, quick-reply payloads, postbacks, attachments, delivery receipts, read watermarks and echoes. A Page/customer pair resolves under a transaction-scoped advisory lock into one Page-scoped contact identity and one active Facebook conversation. Canonical acceptance owns sequence allocation, lifecycle reopening, realtime events, outbox facts, routing and existing notification behavior.

Quick replies and postback payloads are stored as typed Facebook metadata, while their provider-supplied visible text/title remains the message text. Unsupported events are acknowledged and classified without becoming customer messages.

## 10. Contacts and conversations

The PSID is unique only inside `(organization, channel_connection)`. Facebook identities are channel-asserted and never auto-linked to Maevelle customers. Existing audited staff customer-linking remains authoritative. Website and Facebook threads remain separate even after linking to one customer.

## 11. Incoming attachments

Images from signed webhooks are downloaded asynchronously only from allowlisted Meta/Facebook CDN suffixes over HTTPS. DNS results are rejected if any address is loopback, link-local, private or carrier-grade NAT; redirects are bounded and revalidated; response type, streaming byte limit and timeout are enforced. JPEG, PNG and WebP enter existing private media upload, validation and rendition processing. Message attachments remain quarantined until the media asset becomes `READY`; failures become rejected. If download fails or a type is unsupported, the canonical message retains short-lived `REMOTE_ONLY` metadata instead of silently disappearing or creating a public URL.

Audio, video, file, sticker and provider-share metadata are preserved but are not advertised as locally renderable until an approved scanner/processor exists.

## 12. Outgoing Send API

The worker adapter reloads the authoritative Page credential, Page-scoped recipient, content and eligibility immediately before calling Meta. Text uses `/{page-id}/messages` with `messaging_type=RESPONSE`. One private image is uploaded with the official reusable attachment endpoint and then sent by `attachment_id`; Maevelle does not publish the private object. A canonical Facebook message is deliberately either text or one image so one canonical record never maps ambiguously to multiple visible provider messages.

Provider message IDs are saved in canonical external references. An HTTP success means `SENT`, not delivered/read.

## 13. Messaging-window policy

Qualifying customer messages set `reply_eligible_until` to provider time plus 24 hours. Admin message acceptance rejects a missing/expired window with `REPLY_WINDOW_CLOSED`; the worker checks again immediately before Send API. No tags, opt-ins, human-agent exception or marketing exception is applied without separately verified approval/evidence. The eligibility endpoint returns allowed/reason/expiry/next action and supported image MIME types.

## 14. Delivery, read and echoes

API-sent echoes reconcile by Page/connection/provider message ID and do not become inbound messages. An echo racing ahead of the Send API response is retained and retried three times before becoming an explicit unmatched ignored event. Delivery IDs and read watermarks advance canonical states monotonically and emit normal Admin realtime invalidations. Unmatched native Page/Business Suite replies are not falsely attributed to a Maevelle agent.

## 15. Errors, retries and unknown outcomes

Structured Meta codes classify authentication, permission, rate limit, recipient, validation, temporary and provider failures. Rate-limit/temporary failures use bounded existing delivery retries. Authentication/permission failures degrade the connection. A timeout or network loss is `UNKNOWN`; the existing delivery intent becomes `RECONCILIATION_REQUIRED` and is never blindly resent. Echoes may later supply reconciliation evidence.

## 16. Historical synchronization

An authorized operator starts a single active sync per connection. The worker uses Page Conversations and conversation Messages endpoints with bounded pages, durable conversation/message cursors, leases, error counters and idempotent provider references. Inbound history uses canonical acceptance with a historical outbox fact so old messages do not create false live-attention notifications. Page-originated history is stored with `PROVIDER` sender identity, never a fabricated staff actor. Imported provider timestamps remain evidence; canonical sequences reflect safe ingestion order and are never rewritten.

Meta may limit eligible conversations, history depth, folders and fields. A completed job means all pages returned to the authorized token were considered, not that Meta exposed every historical message.

## 17. Health and diagnostics

Safe diagnostics expose Page ID/name, connection state, Graph version, granted/missing scopes, Page tasks, subscription fields/health, credential health, last webhook/inbound/outbound/verification timestamps, safe error code, disconnect time and version. Diagnostics deliberately revalidate Page access and subscription; ordinary inbox reads do not call Meta.

## 18. Worker integration

The existing worker registers the Facebook adapter only when all Meta settings, encryption and media storage are available. Each tick handles delivery intents, provider events, historical sync, OAuth/event retention and attachment security projection alongside existing WEBSITE work. No broker, cache, service or second worker framework was added.

## 19. Administrative API catalog

| Method | Route | Capability | Purpose |
|---|---|---|---|
| GET | `/admin/messaging/connections/facebook/availability` | `connections.view` | Safe configuration/scopes/version readiness |
| POST | `/admin/messaging/connections/facebook/oauth` | `connections.manage` | Create state and return authorization URL/attempt |
| GET | `/integrations/messaging/facebook/oauth/callback` | signed OAuth state | Exchange code and store eligible Pages |
| GET | `/admin/messaging/connections/facebook/oauth/:attemptId` | `connections.manage` | Poll safe Page discovery/status |
| POST | `/admin/messaging/connections/facebook` | `connections.manage` | Select an eligible Page, rotate credentials and subscribe |
| GET | `/admin/messaging/connections/facebook` | `connections.view` | List organization connections |
| GET | `/admin/messaging/connections/facebook/:connectionId` | `connections.view` | Connection detail/diagnostics |
| PATCH | `/admin/messaging/connections/facebook/:connectionId` | `connections.manage` | Suspend/resume with `If-Match` version |
| POST | `/admin/messaging/connections/facebook/:connectionId/diagnostics` | `connections.manage` | Active Page/subscription check |
| DELETE | `/admin/messaging/connections/facebook/:connectionId` | `connections.manage` | Unsubscribe, revoke locally and disconnect |
| GET | `/admin/messaging/conversations/:conversationId/facebook-reply-eligibility` | `messaging.reply` | Current policy preflight |
| POST | `/admin/messaging/connections/facebook/:connectionId/syncs` | `connections.manage` | Start/resume bounded history sync |
| GET | `/admin/messaging/connections/facebook/syncs/:syncId` | `connections.view` | Sync progress/errors |

State-changing OAuth/Page selection is safe through a single-use attempt; suspend/resume uses optimistic concurrency; sync creation is idempotent while one job is active. All successful DTOs use `{ data }`, and errors use the established safe envelope.

## 20. Realtime, notifications and audit

Facebook messages use existing `messaging.message.created.v1`, delivery-changed and inbox invalidation streams. Live inbound events use the existing staff-attention outbox policy; history imports do not. Connect, reauthorize, suspend, resume and disconnect are audited without message bodies or tokens.

## 21. Security and privacy

Controls include encrypted credentials, one-time OAuth state, capability checks, organization-qualified queries/FKs, global Page ownership, raw-body HMAC, constant-time comparison, payload limits, bounded retention, server-side eligibility, SSRF/CDN/DNS/redirect/size/type defenses, private media, and safe diagnostics. No Facebook identity is treated as verified customer evidence. Legal review, privacy policy, data-deletion instructions/callback and Meta data-retention obligations remain owner activation gates.

## 22. Performance decisions

Webhook acknowledgement performs signature validation plus indexed durable inserts only. Media and Graph calls are worker-owned. Provider calls have a configurable timeout, delivery/event/history work is bounded, Page health is durable, and collection APIs use Meta cursors. PostgreSQL indexes match actual Page, event, cleanup and sync access paths.

## 23. Dependencies

No external package was added. The implementation uses native `fetch`, Web Crypto/Node crypto, existing Kysely/PostgreSQL, AES-GCM security helpers, private media storage, Fastify/TypeBox and the existing worker.

## 24. Verification

- Fresh PostgreSQL development and test databases migrated successfully through the edited `3200_messaging_core` baseline.
- Database, API, core, config and worker TypeScript checks passed during implementation.
- Sixteen focused tests passed across four files: canonical messaging/database (including webhook dedupe, concurrent identity/conversation resolution and reply-window enforcement), Meta client/error validation, exact raw-body HMAC and WEBSITE adapter compatibility.
- The focused Meta configuration test, focused ESLint, repository TypeScript build and credential-pattern scan passed.
- The repository hardening script still reports its pre-existing unrelated Admin/chart findings; it did not report the new Facebook route.
- The full Docker rebuild was attempted but dependency installation inside Docker timed out on the npm registry before compilation; this is not recorded as a passed container build.
- No authorized Meta account, Page token or public callback was available, so no live Meta request/webhook/message test was performed.

## 25. External Meta prerequisites

1. Own/control a Meta Business portfolio, app and Facebook Page; assign a person/system user the Page messaging task.
2. Complete business/domain verification, privacy policy and data-deletion requirements if Meta requests them.
3. Add Messenger Platform/use case and configure the HTTPS callback `https://HOST/webhooks/meta/messenger` with the same private verify token.
4. Register the exact OAuth redirect URI from `META_OAUTH_CALLBACK_URL`.
5. Request Advanced Access/App Review for every required permission used outside app-role testing; prepare reviewer instructions and screencast.
6. Confirm the current supported Graph version, 24-hour policy, subscription fields, Conversations availability, rate guidance and coexistence/handover behavior in current official docs.
7. Generate unique production app secret, verify token and 32-byte encryption key through deployment secret management.

## 26. Known limitations

- Live platform availability, App Review, business verification, Page tasks and advanced access are unverified.
- Full historical coverage is controlled by Meta and cannot be promised.
- Reactions, edits, deletions, marketing tags, opt-ins and handover control are intentionally not synthesized without verified current platform contracts.
- Non-image inbound media is retained as unavailable metadata until safe processing/scanning support exists.
- Native Meta inbox echoes that cannot be correlated are retained/retried but not attributed to a Maevelle staff member.
- Profile names/photos are not fetched speculatively; Page-scoped identity remains valid with missing profile metadata.

## 27. Safe deployment and activation

1. Back up the target database and confirm whether the mutable-baseline policy still applies; use a forward migration if any real environment must retain data.
2. Deploy schema before API/worker.
3. Configure all Meta variables together: `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`, `META_WEBHOOK_VERIFY_TOKEN`, `META_OAUTH_CALLBACK_URL`, optional scopes and timeout. Keep `AUTH_ENCRYPTION_KEY` stable.
4. Deploy API and worker, confirm normal WEBSITE messaging first, then verify the public webhook challenge/signature path.
5. Use Phase 07 or direct authorized API calls to start OAuth, select the Page, inspect permission/subscription health and send a test only to an approved app-role/test recipient who initiated the conversation.
6. Validate inbound text/image, Bangla/emoji, staff text/image, echo, delivery/read, closed window, token revocation and reconnect.
7. Start history sync only after live traffic is healthy; monitor bounded progress and provider errors.
8. Roll back by suspending/disconnecting the Page and application processes; preserve schema/transcripts and reconciliation-required intents.

## 28. Phase 07 frontend handoff

Phase 07 should fetch availability, POST OAuth start and navigate to `authorizationUrl`. The callback redirects to `/admin/messaging?facebook=authorized&attemptId=...`; the UI polls the attempt, displays only eligible authorized Pages and POSTs the selected `pageId` with that attempt. It then renders the returned connection DTO, including missing permissions, subscription/credential health and safe errors. Diagnostics are explicit user actions. Suspend/resume sends `If-Match` with the displayed version. Reauthorization repeats OAuth and Page selection; the backend recognizes and rotates the existing Page connection. Disconnect should explain that transcripts remain.

The existing inbox already displays canonical Facebook conversations. The composer should call reply eligibility and respect canonical `capabilities`; backend enforcement remains authoritative. Sync UI should create one job and poll its safe counters/status. No frontend ever receives or stores a Meta access token.

## Operational status

1. Facebook backend implementation: **code complete for independently implementable repository responsibilities**.
2. Meta credentials configured: **no**.
3. Actual Meta webhook communication verified: **no**.
4. Actual Facebook customer messaging verified: **no**.
5. App Review/Advanced Access approved: **not evidenced**.
6. Integration deployed: **no**.
7. Phase 07 can begin against the completed backend contracts: **yes**, with fixture/local API testing until Meta assets are approved.
