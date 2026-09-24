# Commerce Orders & Customers Progress

## Current checkpoint

- Aligned Orders/Customers DTOs with actual database and API read models.
- Rebuilt manual order entry around the domain contract: customer, stock
  location, multiple lines, catalog price defaults, reasoned price overrides,
  delivery charge/address, payment method, sales channel, and idempotency.
- Replaced floating-point manual totals with exact four-decimal arithmetic and
  persisted price provenance on each order line.
- Persisted order sales channel and customer first/latest source, including
  Facebook, Instagram, WhatsApp, phone, Admin, import, and external API paths.
- Added E.164 phone normalization and conservative checkout identity matching;
  blocked customers are rejected and ambiguous matches become reviewable
  duplicate candidates instead of silent merges.
- Serialized same-phone first-time checkout resolution per organization so two
  concurrent guest checkouts cannot create duplicate customer identities.
- Organization-scoped contact, address, note, and tag mutations; tag assignment
  is protected by a composite organization foreign key.
- Added customer commerce metrics and paginated order/return/refund history
  endpoints, with recent Orders visible from customer detail.
- Exposed order resume and note commands, accurate delivery timestamps, line
  totals, payment status, and customer/contact search data.
- Corrected order-line reservation linkage and concurrent same-customer manual
  order locking; the last-unit race produces one winner and one stock error.
- Reworked delivery auto-completion consumption so receipts complete only after
  the order transition, with leases, retry scheduling, and dead-letter bounds.
- Replaced the single-status worklist projection with authoritative Order,
  Payment, Fulfillment, and Delivery dimensions and added server-side channel,
  payment-method, source, date, customer, order-number, name, phone, and email
  filtering.
- Added controlled whole-line cancellation for unpaid, unfulfilled Orders. The
  original line is preserved as cancelled evidence while active totals, the
  Payment intent, Inventory reservation, audit, outbox, Fulfillment eligibility,
  delivery completion, and Analytics facts reconcile in one transaction.
- Added versioned, idempotent delivery-address correction before Fulfillment,
  with immutable before/after evidence. Arbitrary repricing, line additions,
  quantity rewrites, and historical customer-snapshot edits remain prohibited.
- Added explicit, idempotent Customer merge and anonymization commands with
  separate capabilities, organization locks, alias-aware history, child-record
  reconciliation, operational blockers, immutable evidence, audit, and outbox.
  Anonymization removes current profile PII while preserving Order snapshots
  needed for operational and accounting history.
- Exposed merge, anonymization, item cancellation, address correction, and Order
  notes through responsive Admin dialogs; revised Customer filters now include
  status, first source, and created date.

## Remaining review gate

Implementation is complete for this area. Authenticated owner review remains
for mobile, tablet, and desktop behavior and for final business-language
judgment on the destructive-action dialogs.
