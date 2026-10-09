# Transactional Email Developer Guide

## Boundaries and flow

Orders, Payments, Fulfillment, Delivery and Refunds emit canonical outbox events inside their own business transactions. `processNotificationOutbox` consumes those events idempotently through `platform.event_consumer_receipts`, evaluates the tenant policy, snapshots the event-time order recipient/content, and creates a channel record. Provider code is isolated in `apps/worker/src/resend-email-provider.ts` behind `EmailAdapter`.

The worker atomically changes eligible rows from `QUEUED`/retryable `FAILED` to `PROCESSING` with `FOR UPDATE SKIP LOCKED`. It sends HTML and text using the stored recipient and content. A stable notification idempotency key is passed to Resend. If a processing lease becomes stale after a crash, Maevelle records `UNKNOWN_PROVIDER_OUTCOME` and requires provider-event reconciliation instead of blindly sending a possible duplicate.

Signed Resend webhooks are verified from the exact raw request body and Svix headers before parsing is trusted. Provider events are stored uniquely, normalized, appended to the timeline, and then applied with terminal/out-of-order guards. Bounces, complaints, and provider suppressions add internal suppression records.

## Data model

- `notification_policies`: supported event catalog and code-template mapping
- `organization_policy_overrides`: tenant enabled/automatic/manual controls
- `notification_templates` / `template_revisions`: existing versioned generic/in-app templates
- `notifications`: logical delivery, recipient/content/template snapshots, source, trigger, provider identity and current lifecycle
- `delivery_attempts`: technical attempts, retryability and bounded next retry
- `delivery_events`: immutable application/provider/admin timeline
- `provider_events`: raw verified Resend event history and idempotency
- `email_suppressions`: active/cleared bounce, complaint, provider and administrator blocks

## Supported code templates

`order-received`, `order-confirmed`, `payment-confirmed`, `order-shipped`, `order-delivered`, `order-cancelled`, and `refund-completed`. All render HTML and plain text from escaped order snapshots. The tracking CTA uses `STOREFRONT_BASE_URL` and the public tracking entry point, never an internal Order UUID.

## Retry and duplicate rules

- Same outbox event: unique source/recipient/channel plus consumer receipt.
- Same automatic email: stable notification idempotency key.
- Worker retry: same notification and same provider key; maximum five recorded attempts, only after a known retryable failure.
- Unknown provider outcome: no automatic resend; reconcile provider events or investigate before an intentional audited resend.
- Manual command retry: caller-supplied idempotency key is stored uniquely.
- Intentional resend: a new notification with `trigger_type=RESEND` and a parent link.
- Webhook retry/replay: unique provider plus Svix event ID.
- Early webhook: verified unmatched events are retained and reconciled after the provider message ID is persisted.

## API and authorization

- `GET /admin/email/operations` (`notifications.view`), paginated/filterable
- `GET /admin/email/operations/:id` (`notifications.view`)
- `GET/PATCH /admin/email/policies` (`notifications.view` / `notifications.manage`)
- `GET /admin/email/templates` and `POST .../preview` (`notifications.view`)
- `POST /admin/email/orders/:orderId/send` (`notifications.send`)
- `POST /admin/email/operations/:id/retry` (`notifications.retry`)
- `GET/POST /admin/email/suppressions` (`notifications.view` / `notifications.suppressions.manage`)
- `GET /admin/email/diagnostics` (`notifications.view`)
- `POST /webhooks/resend` (signed public provider callback)

Admin state changes are origin-protected, capability checked, rate limited, validated, and audited. There is no arbitrary bulk-send, From override, HTML injection, or production test-recipient endpoint.

## Configuration

See `.env.example`. Development defaults to sending disabled and the local adapter. Test recipient override must be non-production and included in `EMAIL_ALLOWED_TEST_RECIPIENTS`. Secrets remain deployment-only. Diagnostics reveal booleans, never secret values.

## Extending

Add a canonical outbox mapping, a `notification_policies` seed, and a code-template key. Keep business state in its owning domain. Do not call Resend from a domain service or API route. Increment template version whenever historical output meaningfully changes.
