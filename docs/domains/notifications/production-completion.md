# Notifications Production Completion

## Product boundary

Maevelle's implemented notification domain covers transactional customer communication and capability-scoped operational/security communication for staff. The domain converts committed business outbox events into durable notification intents, then independent channel deliveries and delivery attempts. Notification failure never rolls back or rewrites the source business fact.

Marketing campaigns, browser/mobile push, WhatsApp, Telegram, and other social messaging are intentionally unsupported. They require real consent, audience, provider, credential, webhook, and compliance decisions; this codebase does not pretend that an unconfigured channel works.

## Source-of-truth model

- `platform.outbox_events` is the committed business-event source.
- `notification_intents` records why communication exists, its source, category, priority, deduplication key, and cancellation state.
- `notifications` stores one recipient/channel delivery with immutable rendered content and addressing snapshots.
- `delivery_attempts` records technical attempts, retry classification, and unknown outcomes.
- `delivery_events` is the append-oriented delivery/admin/provider timeline.
- `provider_events` and SMS provider-event tables retain idempotent callbacks for reconciliation.

The central event catalog maps supported events to customer or staff audiences. Staff fan-out resolves only active memberships with the required direct capability. Every query and mutation is organization-scoped; removed memberships cannot read historical inbox items.

## Implemented channels

### In-app

Staff in-app notifications support categorized and prioritized inbox items, unread filtering and counts, mark-one and mark-all read, pagination, deep-link actions, history filtering, scheduling, expiry, cancellation, and retention. The API is ready for a narrow Admin client surface; no new full-page UI was added in this backend-first pass.

### Email

Resend remains behind the existing adapter. Automatic, manual, test, retry, intentional resend, suppression, policy, preview, diagnostics, signed webhook, and delivery-timeline workflows remain supported. Send-time policy and suppression are rechecked. Network ambiguity and stale claims become `UNKNOWN_PROVIDER_OUTCOME`, which is never blindly retried. Verified callbacks that arrive before the provider message ID is stored are retained and reconciled later.

### SMS

The provider-neutral SMS lifecycle remains implemented, including Bangladesh number handling, cost/segment metadata, policies, suppressions, retries for confirmed transient failures, unknown-outcome handling, callbacks, polling, diagnostics, and Admin operations. No production telecom provider is selected or claimed as operational. The existing `none` and development/test adapter modes are not production delivery providers.

## Reliability and lifecycle

- Outbox consumption is at-least-once and idempotent, not exactly-once.
- Consumer receipts use durable claims, bounded retry with jitter, stale-claim reclamation, and dead-letter state without blocking unrelated events.
- Delivery deduplication includes event, notification type, recipient, and channel.
- Required operational communication cannot be disabled by a recipient preference.
- Optional preferences, organization policies, suppressions, cancellations, schedules, and expiries are enforced again at send time.
- Manual command idempotency binds the key to a request fingerprint; reusing a key with different intent is rejected.
- Retention is policy-driven and executed by the worker for terminal delivery history. Unknown outcomes are retained for reconciliation.

## API and authorization

The generic Admin API provides paginated inbox, history, event catalog, diagnostics, versioned templates, safe previews, scheduling, intent cancellation, read state, and preferences. Read actions require `notifications.view`; lifecycle/template/policy changes require `notifications.manage`; email/SMS operational commands retain their narrower send, retry, and suppression capabilities. Mutations are boundary-validated, tenant-scoped, and audited where they change shared operational state.

Template variables use a declared flat schema. Undeclared, dotted, triple-brace, or executable-style constructs are rejected. Rendered plain-text fallback is HTML-escaped before HTML delivery.

## External setup and verification boundary

The following are deployment or owner/provider gates, not missing internal notification-domain code:

- enable and verify the Resend domain, sender, credentials, and signed webhook in the target environment;
- select and implement a real SMS provider adapter, commercial account, sender identity, callback authentication, and Bangladesh compliance configuration;
- run real-mailbox and real-device delivery tests with approved non-production recipients;
- complete owner UX review when the Admin inbox/client surface is implemented;
- define consent and compliance requirements before adding marketing or social channels.

Never store provider secrets in the database, source, logs, rendered content, or API responses. Diagnostics expose configuration booleans and operational counts only.
