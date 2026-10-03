# Transactional SMS Developer Architecture

## Flow and ownership

```text
authoritative business event → platform outbox → channel policy
  ├─ EMAIL → email renderer/provider
  ├─ IN_APP → inbox
  └─ SMS → SMS renderer → SMS worker → SmsProvider
```

Business domains emit one event. `processNotificationOutbox` resolves the owning order, uses the immutable `orders.order_customer_snapshots` contact phone, and creates channel records under a database uniqueness constraint. Email and SMS policies use separate channel-policy rows and separate organization overrides.

## Important modules

- `packages/database/src/sms.ts`: provider contract/registry, capabilities, Bangladesh phone normalization, encoding and segmentation.
- `packages/database/src/sms-templates.ts`: typed, versioned transactional templates.
- `packages/database/src/notification-sms-operations.ts`: policy, preview, eligibility, manual/test/resend, worker, retries, provider events, polling, suppressions, diagnostics.
- `apps/worker/src/worker.ts`: independent SMS dispatch and reconciliation ticks.
- `apps/api/src/routes/notifications.ts`: typed Admin operations and provider callback route.

## Provider contract

Every provider implements `SmsProvider`: a stable name, capability set, and `send`. Optional methods are required only when the corresponding capability is declared: status lookup, balance, and authenticated webhook parsing. Provider request/response formats, authentication, error codes, and callback payloads stay inside the adapter.

Capabilities are `SEND`, `DELIVERY_CALLBACK`, `DELIVERY_STATUS_POLLING`, `MASKING_SENDER`, `NON_MASKING_SENDER`, `UNICODE`, `BULK_SEND`, `BALANCE_QUERY`, `COST_REPORTING`, and `PROVIDER_IDEMPOTENCY`.

## Recipient and content

`libphonenumber-js/max` validates Bangladesh mobile numbers and produces E.164 (`+880…`). Raw and normalized values remain distinct. Invalid input is not repaired into a plausible number. SMS templates receive narrow view models and persist template key/version plus the exact rendered text.

GSM-7 extension characters count as two septets. Single/concatenated limits are 160/153 septets and 70/67 UTF-16 units for Unicode. Provider-reported segment/cost facts remain nullable and distinct from estimates.

## Delivery safety

- Local uniqueness protects one automatic SMS per source event, recipient entity, and channel.
- Manual idempotency keys are atomically claimed and guarded by a request fingerprint.
- Attempts have bounded exponential backoff plus jitter and a five-attempt ceiling.
- Permanent/configuration errors do not retry; rate limits and confirmed transient errors may retry.
- A timeout with uncertain acceptance becomes `UNKNOWN_PROVIDER_OUTCOME`, schedules reconciliation, and is not blindly retried.
- Provider events are unique by provider/event ID. All events remain historical; terminal state cannot regress on late callbacks.
- Polling runs only when the configured provider declares `DELIVERY_STATUS_POLLING`.

## Security, privacy, and operations

Manual/test endpoints accept only known templates and order recipients; ordinary staff cannot submit arbitrary text to arbitrary phones. Test recipients require deployment allow-listing. Production rejects recipient override/test mode and refuses enablement until a real adapter exists. Provider secrets never belong in runtime business settings or API responses. Audit records store actions and reasons; phone suffixes are used where full PII is unnecessary.

The callback route is `/webhooks/sms/:provider`. It is unavailable unless the registered adapter declares callback support and implements authentication plus parsing. Generic code receives only normalized events and safe metadata.

The reusable contract helper is `sms-provider-contract.test-support.ts`; every real adapter must run it plus adapter-specific request, error, Unicode, callback-authentication, and timeout tests.

## Frontend Console Architecture

The SMS frontend is built in `apps/admin/components/sms/` and rendered at `/sms`:

- `sms-operations-console.tsx`: Primary coordinator managing tab routing, URL filter synchronization, revalidation, and detail sheet modals.
- `sms-overview-tab.tsx`: Operational readiness dashboard, metrics summary, and active safeguards warnings.
- `sms-activity-tab.tsx`: Server-paginated, filterable activity table with responsive cards for touch screens.
- `sms-templates-tab.tsx`: Code-backed template catalog with phone simulator, realistic fixtures, zero-side-effect order preview, and side-by-side comparison matrix.
- `sms-test-lab-tab.tsx`: Mock provider lifecycle simulation (Accepted, Delivered, Delayed, Temporary Failure, Permanent Failure, Rate Limited, Unknown Outcome, Undeliverable) enforcing allow-listed test recipients.
- `sms-policies-tab.tsx`: Granular event policy switches with mandatory audit logging and visual eligibility hierarchy.
- `sms-suppressions-tab.tsx`: Recipient blocklist management with E.164 normalization, reason capture, and safe clearance dialog.
- `sms-diagnostics-tab.tsx`: Platform health, provider capability matrix, sender configuration, and provider onboarding requirements.
- `sms-detail-sheet.tsx`: Comprehensive drawer displaying immutable message snapshots, encoding/segment analysis, technical attempts vs provider events, lifecycle timeline, and action protections.
- `apps/admin/components/orders/order-sms-status.tsx`: Order detail Customer Communications card with deliverability checklist, state-transition feedback, and manual send modal.
- `apps/admin/components/customers/customer-sms-communications.tsx`: Customer detail communications summary and primary phone deliverability status.

### Status Refreshing Strategy

The console automatically polls every 6–7 seconds **only** when active notifications are in pending or active transition states (`QUEUED`, `PROCESSING`, `ACCEPTED`, `DELIVERY_DELAYED`, `UNKNOWN_PROVIDER_OUTCOME`). Stable states (`DELIVERED`, `FAILED`, `SUPPRESSED`) do not trigger continuous polling.

## Provider Extensibility

When a new Bangladesh telecom provider adapter is integrated, **zero frontend rewrites are required**. The frontend automatically adapts based on declared backend provider capabilities:

1. Register adapter implementing `SmsProvider` with its declared `capabilities` array (`SEND`, `DELIVERY_CALLBACK`, `DELIVERY_STATUS_POLLING`, `MASKING_SENDER`, `BALANCE_QUERY`, etc.).
2. The `SmsDiagnosticsDto` endpoint returns the adapter's capabilities and connection status.
3. The Admin UI dynamically reflects:
   - Provider name and configured credentials state
   - Capability badges in the Provider Capability Matrix
   - Delivery callback activity and status polling controls
   - Masking sender status
   - Balance query and cost reporting when supported
