# Pathao Courier Operations

## Configuration and security

- Configure Pathao under Admin Integrations with a named account, `SANDBOX` or
  `PRODUCTION`, default service (`NORMAL` or `ON_DEMAND`), item type, and the
  Merchant Developer API credentials.
- Credentials and OAuth access/refresh tokens are AES-256-GCM encrypted with the
  runtime encryption key. APIs return only safe configuration and connection
  state; secrets are write-only.
- Tokens are reused until shortly before expiry. Refresh is protected by an
  account advisory lock so concurrent workers issue one refresh. A rejected
  refresh token falls back once to the configured password grant.
- Changing environment deletes tokens, synced Stores, and pickup mappings. This
  prevents sandbox identifiers from entering Production. Accounts can be
  enabled or disabled; disable is blocked while a provider operation is active.

## Stores, quote, and booking

- `Check connection` authenticates and reads Stores without creating a parcel.
  `Sync Stores` maintains Pathao-owned Store identifiers and the default Store.
- Every Maevelle fulfillment location maps to an active Store. A provider
  default is used only as an explicit fallback when no location mapping exists.
- Quotes use the mapped Store, explicit operational package weight, configured
  service/item type, recipient address, and the authoritative outstanding COD
  balance. Quote components are retained separately from actual courier charge.
- Booking uses a stable Maevelle merchant reference and persists the Pathao
  consignment ID as the tracking reference. A timeout/ambiguous response becomes
  `UNKNOWN_OUTCOME`; it is never retried as a new consignment.

## Tracking, cancellation, and RTO

- The worker polls authenticated order info (`/aladdin/api/v1/orders/{consignment_id}/info`)
  and ingests inbound webhooks at `/webhooks/courier/PATHAO`.
- Inbound Pathao webhooks verify the webhook secret and respond with the required
  `X-Pathao-Merchant-Webhook-Integration-Secret` header within 10 seconds.
- Order cancellation is supported via `POST /aladdin/api/v1/orders/{consignment_id}/cancel`
  before physical pickup.
- Multi-event tracking history is extracted from provider status logs when provided.
- Raw status is retained, known statuses are normalized, and unknown values open an
  integration exception without changing Delivery state.
- Polling can safely reconstruct skipped outbound milestones from a current
  provider snapshot. Duplicate, stale, regressive, and terminal events remain
  evidence without overwriting Maevelle truth.
- Return statuses create/use the Returns-owned RTO case and reverse-transport
  lifecycle. `RETURNED_TO_MERCHANT` can mark reverse transport arrived, but only
  Maevelle's physical return receipt marks the Delivery returned to origin and
  moves stock into `INSPECTION`.

## Money and customer history

- Pathao receives only the payment-ledger outstanding COD amount. Provider COD
  observations and courier charges remain evidence; they never create Payments,
  settlements, refunds, or Finance postings automatically.
- Customer history is organization-scoped and matches canonical/merged customer
  identity, order snapshots, and normalized Bangladesh mobile phone numbers (`+8801...`, `01...`).
- It reports factual success, failure, RTO, COD, provider, and recent-outcome facts.
  Cancellations before handover are excluded from customer failure risk.
- Risk levels are explainable internal indicators (`INSUFFICIENT_HISTORY`, `LOW`,
  `MODERATE`, `ELEVATED`), not automated order rejection or black-box fraud scores.
- Surfaced across Order Detail, Customer Detail, and Delivery Console.

## Capability boundary

Implemented: OAuth authentication/refresh, connection check, Store sync/mapping,
quote, booking, booking cancellation, serviceability check, COD calculation,
consignment/tracking reference, multi-event tracking timeline, webhook ingestion,
fallback polling reconciliation, comprehensive status normalization, RTO evidence,
actual booking charge, and customer delivery risk intelligence across couriers.

Not automated without an official public merchant API: COD mutation after booking,
Pathao Fraud Check (dashboard-only feature; Maevelle uses internal first-party cross-courier
history with clean provider extension points), automated claims, and settlement/remittance import.
Maevelle exposes these as unsupported rather than guessing endpoints or scraping dashboards.

Operational references:
[Merchant integration](https://help.pathao.com/integrate-pathao-panel-with-website/),
[auto-address order API](https://pathao.com/bn/blog/api-merchant-auto-address-feature/),
and [delivery charges](https://help.pathao.com/what-is-the-delivery-charge-inside-or-outside-the-city/).
