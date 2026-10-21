# Codebase Audit

## Method and evidence boundary

This audit inspected the workspace manifests, application bootstraps, current migrations, customer/order/media/notification modules, worker, reverse proxy, runtime configuration, Admin and Storefront structures, shared contracts, architecture documents, and Product Completion V2 records. Claims below identify inspected source. Recommendations are marked **Proposed**.

The worktree was clean at inspection time and `main` was 26 commits behind `origin/main`. No source changes, migrations, dependency installation, database operation, deployment, or external account mutation was performed during Phase 00.

## Repository and runtime

| Area | Confirmed evidence | Messaging consequence |
|---|---|---|
| Workspace | `pnpm@11.19.0`, Node 24, TypeScript 5.9; root `package.json` | Use existing workspace packages and project references. |
| Deployables | `apps/api`, `apps/worker`, `apps/admin`, `apps/storefront` | No new deployable is justified. |
| Shared packages | config, contracts, core, database, media, observability, security, Admin/Storefront UI packages | Contracts belong in `@maevelle/contracts`; persistence/application code follows existing database-package convention. |
| API | Fastify 5.12 + TypeBox type provider; API body limit 1 MiB; raw JSON retained | Reuse TypeBox boundary validation. Webhook signature verification can use `request.rawBody`. Attachments use upload sessions, not JSON bodies. |
| Frontends | Next 16.3.1, React 19.2.8; Admin has Base UI/shadcn/Tailwind v4; Storefront intentionally has very few dependencies | Keep widget dependency-light; reuse Admin primitives. |
| Database | PostgreSQL 18, Kysely 0.29, SQL-first explicit migration registry | Add one mutable-baseline messaging migration while the repo remains in current development mode. |
| Topology | PostgreSQL, API, worker, Admin, Storefront, Caddy on one host (`compose.yaml`) | SSE plus DB replay works without another service. |
| Proxy | Caddy routes `/api/*` to API, `/admin*` to Admin, remaining paths to Storefront | SSE needs Caddy streaming/time-out verification, not a new route topology. |

Key source references:

- API security headers, raw-body capture, origin checks, and in-memory rate limits: `apps/api/src/app.ts:18-145`.
- Single-process DB pool: `packages/database/src/index.ts:20-69`.
- Runtime configuration and secret validation: `packages/config/src/index.ts:8-59`, `200-360`.
- Pino redaction and correlation IDs: `packages/observability/src/index.ts:7-68`.
- Caddy routing: `infrastructure/caddy/Caddyfile:1-20`.
- Current service topology: `compose.yaml:1-183`.

## Architectural style

The repository is a modular monolith with multiple processes, one transactional database, schemas by domain, Fastify route registrars, SQL-backed application functions, and React feature/component groupings. The intended style is stated in `docs/architecture/system-technical-architecture.md`; current code broadly implements it. Some database modules still combine application and persistence responsibilities, so messaging should use focused files rather than one large `messaging.ts`.

## Durable processing and reliability assets

Confirmed reusable foundations:

- `platform.outbox_events` and `platform.event_consumer_receipts` exist (`0003_platform_operations.ts`).
- `platform.jobs` supports priority, availability, leases, attempts, retry wait, and dead-letter state.
- `platform.idempotency_records` atomically identifies organization/principal/operation/key and stores request fingerprints/results (`0001_platform_core.ts:55-72`).
- Append-only `audit.audit_events` supports organization, actor, action, target, request, before/after and metadata (`0002_audit_foundation.ts:7-31`).
- The worker runs bounded periodic processors in parallel and prevents overlapping ticks (`apps/worker/src/worker.ts`).
- Integration tables already cover encrypted provider credentials, OAuth state, inbound provider events, webhook endpoints/deliveries, external mappings, operations, and exceptions (`2400_notifications_integrations.ts`).

**Proposed:** Reuse the outbox and worker execution model. Add messaging-specific delivery-attempt and provider-event rows where their lifecycle/query requirements differ. Do not overload customer notifications as chat messages or generic webhook tables as the conversation ledger.

Risks:

- The API rate limiter is process-local (`Map` at `apps/api/src/app.ts:19`), appropriate for the current single API instance but not a multi-replica guarantee.
- The worker is timer/poll based; messaging latency needs a shorter bounded polling interval or a dedicated messaging tick within the same process.
- No realtime transport currently exists.

## Identity, authorization, and organization isolation

Better Auth is mapped to Maevelle-owned `iam` tables. Sessions are encrypted in secondary storage, cookie cache is disabled, and two-factor/lockout support exists (`apps/api/src/auth/auth.ts`). Organization memberships, capability definitions/grants, scopes, invitations, service accounts, and API credentials are created in `0004_iam_and_authentication.ts`.

Routes resolve an authenticated session then call `findActiveAdminContext` with a required capability. Owners receive organization-wide authority; standard memberships need grants. Location scope helpers exist but conversation access needs its own assignment-aware policy, not a fabricated location.

**Reusable:** membership IDs as staff participants/assignees; capabilities; audit; origin checks; structured authentication sessions.

**Missing:** messaging capability definitions and assignment-aware conversation policy. Proposed capabilities are in the security document.

## Customer and commerce domains

The customer model correctly separates commercial customers from login users (`0700_customers.ts:5`). It includes:

- tenant-scoped customers, phone/email contacts with verification state, addresses, restrictions;
- one active customer-account link per organization/user and customer, with link/unlink history and audit;
- duplicate candidates, explicit merges/aliases, anonymization, notes, and shared customer tags;
- `first_source`/`latest_source` already include `STOREFRONT`, `FACEBOOK`, and `INSTAGRAM`;
- customer lists, details, order/payment/refund context, communications, and unified timeline queries.

Orders expose bounded list/detail and public tracking services, timeline, notes, tags, risk, delivery, payment, fulfillment, and returns context. Messaging should consume narrow customer/order context providers rather than query commerce tables from channel adapters.

**Important gap:** no independent channel-contact/visitor identity model exists. `customers.customer_phones/emails` cannot represent a Facebook PSID, Instagram-scoped ID, or anonymous browser credential. A messaging contact identity layer is required, with an optional audited customer link.

## Media

The media domain provides public/private buckets, asset/object/rendition records, upload sessions, processing records, usage projection/history, local and S3 ports, presigned operations, MIME/size policy, Sharp image processing, cleanup, and worker jobs (`0400_media.ts`, `packages/media`, `apps/api/src/routes/media.ts`).

**Reusable:** private bucket, upload-session lifecycle, content hash, processing/cleanup, object-storage abstraction.

**Required extension:** chat attachments must be private-by-default and authorized through conversation access. They must not enter the general public media library or produce public URLs. Add a `MESSAGING_ATTACHMENT` purpose, malware/scanner status hook, conservative MIME/size policy, expiring download authorization, and retention linkage.

## Notifications

The notification domain has policies, channel policy, intents, templates/revisions, recipient preferences, in-app/email/SMS records, delivery attempts/events, suppressions, provider events, retry/reconciliation, Admin inbox/history, and a notification bell.

**Reuse:** notify assigned staff that a conversation needs attention; unread badge integration; preference model; worker delivery and observability patterns.

**Do not reuse as message storage:** notification content is a delivery projection and may be purged. Conversations/messages need independent retention, order, privacy, idempotency, and provider correlation.

No web-push service worker or Push API implementation was found. Browser push/PWA is therefore a later optional extension, not a Phase 01 dependency.

## Frontend findings

Admin already has:

- structural primitives in `components/ui/page-shell.tsx`;
- Base UI-backed buttons, dialogs, drawers, sheets, inputs, selects, textareas, tables, toasts, status badges;
- an Admin shell, responsive navigation, capability context, worklists, notification bell, customer/order detail components, media picker, and many mobile task dialogs;
- semantic Tailwind tokens documented in `docs/admin-design-system.md`.

Storefront is App Router-based and dependency-light. It has catalog/PDP/cart/checkout/account/wishlist features, server-side API access patterns, global storefront shell, and Tailwind v4. There is no generic widget/portal, chat state manager, or realtime client.

**Proposed:** feature-local messaging UI in each app; shared transport contracts, not a cross-app React component package. Admin and Storefront visual systems differ enough that message DTOs and behavior should be shared while presentation stays app-owned.

## Existing gaps relevant to messaging

1. No realtime event transport, durable client event cursor, or presence model.
2. No guest browser credential/session specifically for private resources.
3. No conversation/contact/message schema.
4. No assignment-aware messaging permissions.
5. Process-local rate limiting only.
6. No malware scanner integration; attachment release must support a quarantine state until one is configured.
7. No web push/PWA implementation.
8. API error shapes are mostly structured but some routes still return string errors; new messaging routes must use the canonical envelope consistently.
9. Page-number pagination exists in several modules; messaging history/inbox require stable cursor pagination.
10. Caddy SSE behavior and production connection limits have not been measured.

## Do not duplicate

- Customer profiles, account links, notes, customer tags, or order context.
- Better Auth sessions, organization memberships, or capability grants.
- Generic audit, idempotency, outbox/jobs, notification delivery, provider credential encryption, or object storage.
- Admin page primitives, status badges, dialog/sheet controls, toasts, and shell/navigation.
