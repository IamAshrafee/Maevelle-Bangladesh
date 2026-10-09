# Current Focus

## Active area

Notifications — production transactional and operational foundation.

## Evidence state

`LOCAL_BACKEND_VERIFICATION_COMPLETE / EXTERNAL_PROVIDER_AND_OWNER_REVIEW_PENDING`

Checkpoint `505053c` establishes the durable notification intent/delivery/attempt model, central event catalog, customer and capability-scoped staff fan-out, paginated inbox and history contracts, safe versioned templates, scheduling, cancellation, retention, diagnostics, and reliability fixes across Email and SMS. Business domains remain authoritative; delivery failures and retries cannot rewrite Order, Payment, Inventory, Finance, or other source truth.

Email now treats stale claims and ambiguous network outcomes as unknown instead of retrying a possible duplicate, reconciles early verified Resend callbacks, and rechecks suppressions and policy at send time. SMS retains its provider-neutral lifecycle and the same unknown-outcome discipline. No unselected provider or social channel is represented as operational.

## Verification completed

- Rebuilt the disposable PostgreSQL volume from the edited baseline and migrated the test database cleanly.
- Affected Database, API, Worker, Contracts, and Admin TypeScript compilation passed.
- Focused ESLint passed for all changed TypeScript files.
- 58 focused Database/API/Worker tests passed.
- Rebuilt API, Worker, and Admin images; the Admin production build generated 85 routes.
- PostgreSQL, API, Worker, Admin, Storefront, and Caddy were running; health-checked services reported healthy.
- Architecture check, secret scan, and `git diff --check` passed.

The separate config fallback test still expects Storefront internal API port `3000` while current configuration resolves `3002`; this predates and is outside the Notifications change.

## External and owner gates

- Verify the Resend sender domain, signed webhook, and real mailbox delivery in the target environment.
- Select and implement a real Bangladesh SMS provider adapter, then verify sender identity, callbacks, cost reporting, compliance, and real-device delivery.
- Build and owner-review the generic Admin inbox client when frontend work is selected.
- Define consent/compliance and choose real providers before adding Marketing, WhatsApp, Telegram, browser/mobile push, or other social channels.

The previous Storefront design-system owner decision remains preserved as the next unrelated resume point: compare `/design-system` with the approved artifact, decide `#7E0E35` versus `#9E2A4B`, then begin the Global Shell/Header/Footer task.
