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
