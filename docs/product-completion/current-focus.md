# Current Focus

## Active Area

Transactional Email Notifications: Full-stack operational control center and asynchronous customer email delivery across Order, Payment, Fulfillment, Delivery, Cancellation, and Refund business events.

## Current Status / Substage

`FRONTEND_FOCUSED_FULL_STACK_COMPLETION_VERIFIED`

## Evidence Already Known

- **Architectural Decoupling**: Canonical business events remain in the transactional outbox; domain services never import Resend. Orders progress regardless of email delivery states.
- **Worker & Outbox Delivery**: Background worker atomically claims email delivery using `FOR UPDATE SKIP LOCKED`, records attempts with retry scheduling, and passes stable idempotency keys to Resend.
- **Server-Authoritative Eligibility**: `getOrderEmailEligibility` calculates `canSendManually` and `eligibilityCode` on the server across global status, event policies, business state prerequisites, customer email availability, and suppression status.
- **Authoritative History Snapshot**: Recipient, subject, rendered HTML snapshot, plain text fallback, template version, and Reply-To facts are persisted in `notifications.notifications`.
- **Signed Webhook Ingestion**: Webhook verification uses exact raw body bytes and Svix headers to record provider events (`email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`).
- **Reputation Protection**: Hard bounces, spam complaints, and administrator suppressions block future sends to protected addresses.
- **Admin Email Operations Console (`/email`)**: 7 modular, URL-synchronized tabs (Overview, Activity, Templates Gallery with multi-device preview and real order rendering, Test Lab with allow-list safeguards, Policies Matrix, Suppressions, Diagnostics with Setup Checklist).
- **Order Detail Customer Communications (`/orders/[id]`)**: Full lifecycle communication timeline, server eligibility explanations, real-order preview modal, manual send confirmation, retry technical failure dialog, intentional resend dialog, and auto-polling during in-flight deliveries.
- **Customer Detail Communications (`/customers/[id]`)**: Primary mailbox deliverability indicator (`Usable`, `Suppressed` with root-cause reason, or `Missing`) and full transactional dispatch history with order navigation.
- **Verification Evidence**:
  - `pnpm exec tsc --build --pretty false` compiles with **0 errors** across all packages.
  - `@maevelle/database` test suite passes (21/21 tests, including new eligibility, preview, and test-send suites).
  - `@maevelle/api` test suite passes.
  - Next.js Admin production build (`pnpm --filter @maevelle/admin build`) compiles and statically generates all **68 routes** with 0 errors.

## Immediate Objective

Follow `docs/email-notifications/resend-setup-guide.md` to configure the production Resend account, add Namecheap DNS records (SPF, DKIM, DMARC), set server deployment environment variables, configure the signed webhook endpoint, and conduct owner operational review at `/email`.

## Important Constraints

- Email state never alters, rolls back, or stalls Order, Payment, Delivery, or Refund truth.
- Production sending requires Resend, a verified sender domain, and deployment-managed secrets.
- `maevelleBangladesh@gmail.com` is strictly Reply-To/human support, not the automated sender.
- Production refuses test recipient redirection; non-production redirection is strictly allow-listed.
- Technical Retry reuses the same logical delivery; intentional Resend creates a new audited notification.
- Marketing campaigns, Gmail inbox syncing, and bulk newsletters are strictly outside this capability.

## Blockers / Owner Review

External Resend account/domain setup, Namecheap DNS records, API key, webhook registration, real mailbox delivery, Reply-To validation, and owner operational/visual review are pending business owner action.
