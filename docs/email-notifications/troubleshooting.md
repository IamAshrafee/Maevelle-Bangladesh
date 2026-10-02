# Email Notification Troubleshooting

## Order changed but no notification exists

Confirm the lifecycle emitted a supported outbox event and the worker is running. A developer should inspect the event consumer receipt and worker logs. Admin can first check that the event has an email policy.

## Queued for too long

Check **Email operations**: sending may be globally disabled, the worker may be stopped, or provider configuration may be missing. Restarting the worker is a deployment task. A stale Processing claim becomes retryable after five minutes.

## Resend rejected the message

Open the notification and inspect the normalized failure code. Invalid sender, invalid recipient, or idempotency-payload conflicts are permanent; network, rate-limit and provider server errors are bounded retries. Confirm the sender domain remains verified.

## Sent but never delivered

Sent means Resend accepted it. Look for Delayed, Bounced, Complained, Suppressed, or Failed provider events. Check Resend's message log if the webhook timeline stops at Sent.

## Bounced, complained, or suppressed

Maevelle prevents future transactional sends to that address. Correct a genuine typo on future order/customer data. Clear a suppression only after investigation; never clear a complaint just to force delivery.

## Webhook does not update status

Confirm the endpoint is exactly `/webhooks/resend`, uses HTTPS, subscribes to the required event types, and has the matching `RESEND_WEBHOOK_SECRET`. Resend must send the original Svix headers. Proxy/body middleware must not rewrite the payload before verification.

## Signature verification fails

The API verifies the exact raw bytes. Confirm the signing secret belongs to this endpoint/environment and that a proxy is not decompressing or transforming the body. Do not JSON-stringify a parsed object for verification.

## Domain, SPF, or DKIM verification fails

Compare Namecheap records character for character with Resend. Watch for an automatically appended domain name, wrong host, duplicate SPF record, incorrect priority, or propagation delay. Never guess replacement values.

## Test email could reach a customer

Immediately set `EMAIL_ENABLED=false` and restart the worker. Non-production overrides must be allow-listed; production refuses any override at startup. Inspect Effective recipient in Admin before enabling sending.

## Duplicate suspected

Compare notification IDs, source event IDs, trigger types, parent IDs and Resend message IDs. A retry shares one logical notification; an intentional manual resend is a distinct audited notification. Give these facts to a developer before changing records.

## No customer email

This is expected and appears as **Skipped no email**. Add/correct contact data for future events; do not manufacture an address or retry the skipped notification.
