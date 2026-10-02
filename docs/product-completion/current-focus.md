# Current Focus

## Active Area

Transactional Email Notifications: asynchronous customer email across Order,
Payment, Fulfillment, Delivery, Cancellation, and Refund business events.

## Current Status / Substage

`IMPLEMENTATION_AND_LOCAL_VERIFICATION_COMPLETE`

## Evidence Already Known

- Canonical business events remain in the transactional outbox; domain services do not import Resend.
- The worker atomically claims email delivery using `FOR UPDATE SKIP LOCKED` and passes a stable idempotency key to Resend.
- Recipient, subject, HTML, plain text, template version, sender, and Reply-To facts are snapshotted in `notifications.notifications`.
- Resend webhook verification uses exact raw body bytes and Svix headers before provider events are persisted.
- Delivery history distinguishes provider acceptance, delivery, delay, bounce, complaint, suppression, and failure.
- Hard bounces, complaints, provider suppressions, and administrator suppressions protect future sends.
- Per-organization policy controls separate enabled, automatic, and manual behavior.
- Admin Email Operations (`/email`) and Order detail communications panel expose diagnostics, preview, safe test send, manual send, retry, resend, timeline, and suppression workflows.
- Full typechecks (`tsc --build`), 26 focused tests across DB integration, templates, config, and API routes (`packages/database/src/notifications.test.ts`, `packages/database/src/email-templates.test.ts`, `packages/config/src/index.test.ts`, `apps/api/src/app.test.ts`), and the 68-route Next.js Admin production build passed cleanly.

## Immediate Objective

Follow `docs/email-notifications/resend-setup-guide.md` to configure the production Resend account, add Namecheap DNS records (SPF, DKIM, DMARC), set server deployment environment variables, configure the signed webhook endpoint, and conduct owner operational review at `/email`.

## Important Constraints

- Email state never changes or rolls back Order, Payment, Delivery, or Refund truth.
- Production sending requires Resend, a verified sender domain, and deployment-managed secrets.
- `maevelleBangladesh@gmail.com` is Reply-To/human support, not the automated sender.
- Production refuses test recipient redirection; non-production redirection must be allow-listed.
- Retry reuses one logical delivery; intentional resend creates a new audited notification.
- Marketing campaigns, Gmail inbox integration, SMS, WhatsApp, and push are outside this capability.

## Blockers / Owner Review

External Resend account/domain setup, Namecheap DNS records, API key, webhook registration, real mailbox delivery, Reply-To validation, and owner operational/visual review are pending business owner action. The earlier Asset, Owner Capital, and Team & Access owner-review items remain open separately.
