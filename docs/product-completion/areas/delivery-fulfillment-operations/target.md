# Delivery / Fulfillment Operations Target

The completed workflow is:

`Order -> partial-safe Fulfillment -> pack -> Delivery -> courier booking ->
physical handover/stock consumption -> tracking/attempts -> outcome`.

Failure paths are:

- `failed Delivery -> RTO -> reverse transport -> receipt into INSPECTION ->
  disposition -> resolved commercial state`; and
- `delivered Order -> authorized Customer Return -> reverse shipment -> receipt
  into INSPECTION -> disposition -> refund/other commercial resolution`.

External courier work must be durable, tenant-scoped, idempotent, protected
from concurrent duplicate calls, explicit about unknown outcomes, and able to
ignore duplicate, stale, regressive, and post-terminal events without losing
the original provider evidence.
