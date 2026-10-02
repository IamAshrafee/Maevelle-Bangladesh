# Current Focus

## Active Area

Transactional Email Notifications: asynchronous customer email across Order,
Payment, Fulfillment, Delivery, Cancellation, and Refund business events.

## Current Status / Substage

`IMPLEMENTATION_COMPLETE / LOCAL_DB_VERIFICATION_BLOCKED`

## Evidence Already Known

- Canonical business events remain in the transactional outbox; domain services do not import Resend.
- The worker atomically claims email delivery and uses a stable local/provider idempotency key.
- Recipient, subject, HTML, plain text, template version, sender, and Reply-To facts are snapshotted.
- Resend webhook verification uses exact raw bytes and Svix headers before provider events are persisted.
- Delivery history distinguishes provider acceptance, delivery, delay, bounce, complaint, suppression, and failure.
- Hard bounces, complaints, provider suppressions, and administrator suppressions protect future sends.
- Per-organization policy controls separate enabled, automatic, and manual behavior.
- Admin Email Operations and Order detail expose diagnostics, preview, safe test send, manual send, retry, resend, timeline, and suppression workflows.
- Database/API/Worker/Admin TypeScript checks, focused ESLint, architecture check, secret scan, 16 focused unit/API tests, and the 68-route Admin production build passed.

## Immediate Objective

Start Docker Desktop, rebuild the disposable database from the mutable baseline,
and run `packages/database/src/notifications.test.ts`. Fix any runtime migration
or concurrency issue. Then follow `docs/email-notifications/resend-setup-guide.md`
to configure Resend, Namecheap DNS, deployment secrets, and the signed webhook,
and conduct owner operational review at `/email`.

## Important Constraints

- Email state never changes or rolls back Order, Payment, Delivery, or Refund truth.
- Production sending requires Resend, a verified sender domain, and deployment-managed secrets.
- `maevelleBangladesh@gmail.com` is Reply-To/human support, not the automated sender.
- Production refuses test recipient redirection; non-production redirection must be allow-listed.
- Retry reuses one logical delivery; intentional resend creates a new audited notification.
- Marketing campaigns, Gmail inbox integration, SMS, WhatsApp, and push are outside this capability.

## Blockers / Owner Review

Docker Desktop was unavailable on 2026-10-02, so clean migration and focused
PostgreSQL integration execution remain pending. External Resend account/domain,
Namecheap DNS, API key, webhook registration, real mailbox delivery, Reply-To,
and owner operational/visual review are also pending. The earlier Asset, Owner
Capital, and Team & Access owner-review items remain open separately.
