# Delivery / Fulfillment Operations Progress

## Implemented

- Packed Fulfillments can prepare a Delivery without consuming Inventory.
  Physical handover atomically dispatches Fulfillment, consumes the reservation,
  assigns outbound cost, and moves Delivery in transit.
- Courier bookings use provider-neutral ports, durable Integration Operations,
  skip-locked worker claims, external-reference uniqueness, crash-to-unknown
  recovery, operator reconciliation, connected-provider cancellation, and a
  manual fallback.
- Tracking persists authenticated inbound provider evidence, deduplicates by
  provider identity/payload, normalizes status, protects terminal outcomes, and
  records stale/regressive events without applying them.
- Multiple failed attempts, next-attempt context, final failure, lost/damaged
  outcomes, exceptions, and courier claims are distinct operational facts.
- RTO is a Return case with its own reverse transport. Customer Returns support
  partial authorization, rejection/cancellation, reverse shipments, partial
  receipts, inspection, and per-quantity SELLABLE/DAMAGED/QUARANTINE disposition.
- Returned stock always enters INSPECTION first. Disposition moves Inventory
  condition and cost provenance atomically; return cases resolve only after
  physical inspection and commercial resolution are both complete.
- COD collection instructions, provider collection observations, actual courier
  charges, confirmed COD Payments, courier-held balances, settlements, and
  deductions remain separate and traceable.
- Delivery/Return events include Order identity for Order timelines,
  notification routing, webhook fan-out, and analytics facts. High-volume lists
  support server-side paging, search, and lifecycle filters.
- Admin workspaces expose provider booking, unknown-outcome reconciliation,
  physical handover, attempts/outcomes, RTO transport/receipt, inspection and
  disposition, open exceptions, and courier claims.
- Pathao is the first connected courier adapter: encrypted credentials/tokens,
  refresh locking, environment isolation, connection validation, Store sync and
  location mapping, quote, durable booking, actual charge capture, authenticated
  polling, safe status normalization, and Returns-owned RTO reconciliation.
- Customer and Delivery workspaces expose factual cross-order delivery history
  and explainable internal risk. Canonical/alias identity and normalized phone
  history are included; pre-handover cancellations are not customer failures.

## External configuration boundary

Pathao code is complete, but no Merchant sandbox/production credentials are
stored in the repository. A real connection, consignment, and tracking smoke
test requires owner-supplied Pathao access. Undocumented cancellation, standard
Courier webhook, Fraud Check, claims, and settlement APIs remain deliberately
unsupported; polling and Maevelle-native operational workflows are the safe
fallbacks.
