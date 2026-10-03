# How Maevelle SMS Notifications Work

Maevelle now has a transactional SMS platform for order, payment, delivery, cancellation, and refund updates. A telecom provider has intentionally not been selected yet. The application can create, preview, audit, suppress, queue, retry, and inspect SMS notifications without knowing a provider's API.

The current safe production posture is:

- SMS infrastructure: available
- real provider: not selected
- real customer sending: disabled
- development/testing provider: deterministic mock adapter
- automatic SMS policies: disabled by default per SMS event

When a business event occurs, Maevelle's transactional outbox records it once. Notification channel policies independently decide whether Email, in-app, and SMS records should be created. Orders never call an SMS provider and never fail because SMS is unavailable.

## Status language

- **Queued**: waiting for the SMS worker.
- **Processing**: claimed by one worker under a database lease.
- **Accepted**: the provider accepted the request. This is not proof of handset delivery.
- **Delivered**: a provider delivery report confirmed delivery.
- **Delayed**: the provider is still attempting delivery.
- **Failed / rejected / expired / undeliverable**: delivery did not complete; the detail timeline explains why.
- **Unknown provider outcome**: the request may have reached the provider before a timeout. Maevelle does not blindly retry because that could create a paid duplicate.
- **Suppressed**: Maevelle intentionally blocks this recipient.
- **Skipped**: the order had no usable phone, policy was disabled, or no provider was configured. This does not fail the order.

## Templates and segments

SMS templates are short, code-backed, versioned, and separate from Email content. Every preview reports GSM-7 or Unicode encoding, character count, and an estimated segment count. Bangla normally uses Unicode. Estimates are operational guidance, not guaranteed billing; future provider-reported segments and costs are stored separately.

## Masking and non-masking senders

A masking sender shows an approved brand name; a non-masking sender shows a number or provider identity. Maevelle models both but does not claim a sender is approved. Approval is external provider/regulatory work.

## After a provider is selected

Maevelle needs one adapter, provider configuration/secrets, callback verification/status mapping, contract tests, and controlled enablement. Orders, delivery, templates, lifecycle storage, Admin operations, idempotency, and workers do not need redesign.

See [Admin guide](admin-guide.md), [developer guide](developer-guide.md), [provider checklist](provider-selection-checklist.md), [integration guide](provider-integration-guide.md), and [environment configuration](environment.md).
