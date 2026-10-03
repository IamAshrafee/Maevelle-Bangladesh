# Current Focus

## Active Area

Transactional SMS Notifications: provider-agnostic delivery infrastructure and a basic functional Admin operations layer for authoritative Order, Payment, Fulfillment, Delivery, Cancellation, and Refund business events.

## Current Status / Substage

`PROVIDER_AGNOSTIC_PLATFORM_WITH_BASIC_ADMIN_VERIFIED`

## Evidence Already Known

- **Event-driven isolation**: Existing canonical business events feed the shared notification outbox. SMS failure, delay, suppression, or provider uncertainty never rolls back or stalls Order, Payment, Fulfillment, Delivery, Refund, or Email truth.
- **Bangladesh recipient safety**: `libphonenumber-js` normalizes common Bangladesh mobile formats to E.164 and rejects malformed, non-Bangladesh, or non-mobile recipients before provider submission.
- **Encoding-aware templates**: Seven lifecycle templates expose variable definitions, fixture or real-order preview, SMS-specific length guidance, GSM-7/extension-table septet accounting, Unicode counting, and provider-neutral segment estimates.
- **Provider abstraction**: `SmsProvider` and `SmsProviderRegistry` advertise capabilities explicitly. `none` safely disables sending, while the deterministic `mock` adapter covers accepted, delivered, delayed, transient, permanent, rate-limited, and unknown-outcome paths.
- **Durable delivery state**: Immutable notification facts, SMS delivery details, append-only attempts, stable idempotency keys, provider events, suppressions, retry scheduling, and reconciliation state are persisted separately from provider credentials.
- **Safe worker behavior**: The worker atomically claims due notifications, uses bounded jittered retry for confirmed transient failures, does not blindly resend unknown outcomes, polls only when supported, and records callback events idempotently with out-of-order protection.
- **Operational controls**: Granular SMS RBAC capabilities guard view, policy management, send, test, retry, resend, suppression, and diagnostic operations. Automatic SMS policies default disabled.
- **Admin surfaces**: `/sms` provides functional Overview, Activity, Templates, Policies, Test Send, Suppressions, and Diagnostics views. Order detail includes server-authoritative eligibility, lifecycle status, and manual send controls.
- **Clean database evidence**: The disposable Docker database was rebuilt from the checked-in mutable migration baseline with `docker compose down --volumes` and `docker compose up -d --build`; test migrations also applied cleanly.
- **Verification evidence**:
  - 60 focused worker/database/config/API tests passed.
  - `pnpm exec tsc --build --pretty false` passed across the monorepo.
  - `pnpm --filter @maevelle/admin build` compiled and generated all 80 routes.

## Immediate Objective

Conduct owner operational and responsive visual review of `/sms` and the Order detail SMS panel. Then use `docs/sms-notifications/provider-selection-checklist.md` to select a Bangladesh provider and implement its adapter, credentials, approved sender identity, callback verification, reconciliation behavior, and real-device delivery validation.

## Important Constraints

- No real provider is selected or integrated; production sending is intentionally unavailable.
- Provider acceptance is not delivery. Delivery requires authoritative callbacks or polling evidence.
- SMS remains operationally independent from business truth and from Email delivery.
- Automatic SMS policies are disabled by default until commercial and operational readiness is confirmed.
- Marketing campaigns, OTP/authentication SMS, WhatsApp, arbitrary freeform composer sends, and generic bulk messaging remain outside this transactional capability.

## Blockers / Owner Review

Provider commercial onboarding, production credentials, sender-ID approval, callback registration, regulatory and consent review, provider cost/balance semantics, real-device delivery tests, and owner responsive/operational review remain pending. The checked-in mock adapter and diagnostics support local verification without pretending these external gates are complete.
