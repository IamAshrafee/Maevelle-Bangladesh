# Email Notifications Admin Guide

Open **Email operations** in Admin.

## What administrators can do

1. Confirm whether application sending, the provider, and the webhook are configured. Secret values are intentionally never displayed.
2. Review queued, processing, failed, delivered and suppressed totals.
3. Enable or disable an event, automatic sending, or its manual action. Policy changes require a reason and are audited.
4. Preview a template with an existing Order ID. Preview uses the real order snapshot and performs no provider call.
5. Queue a permitted manual order email. The worker sends it asynchronously.
6. Inspect intended and effective recipients. They differ when safe development redirection is active.
7. Retry a technical failure. Retry is the same logical email; it does not create another customer copy.
8. Clear a suppression only after the address or complaint issue has been investigated. The action is audited.

Order detail shows all email events tied to that order and provides eligible manual actions. When automatic sending is disabled, the event is shown as **Pending manual**. Missing email is shown as **Skipped no email**, not as a provider outage.

## What still requires a developer or deployment owner

- API keys and webhook signing secrets
- sender-domain DNS and Resend verification
- changing production environment variables or worker deployment
- diagnosing stopped workers, database failures, or malformed provider payloads
- changing code-backed email content or template versions

The From address is a verified sending identity. Customer replies go to the configured Reply-To support mailbox, normally `maevelleBangladesh@gmail.com`.

