# Delivery / Fulfillment Operations Context

## Scope

This area owns outbound Fulfillment, Delivery shipment state, courier booking
and tracking, delivery attempts and exceptions, RTO, Customer Returns,
returned-stock inspection/disposition, and their authoritative connections to
Orders, Inventory, Costing, Payments, Finance, Notifications, Analytics, Audit,
and Storefront tracking.

## Authority boundaries

- Orders own the commercial promise and ordered quantities.
- Fulfillment owns pick/pack work; Inventory owns reservation consumption.
- Delivery owns shipment, courier, attempt, tracking, and customer outcome.
- Returns owns RTO and customer-return reverse logistics.
- Payments and Finance own COD confirmation, remittance, refunds, and money.
- Provider collection and charge records are reconciliation evidence; they do
  not silently create Payments or Finance transactions.

## Replaced shortcuts

The prior baseline consumed stock before courier preparation, treated receiving
as inspection, provided only terminal delivery outcomes, and had no durable
provider-booking execution or RTO transport lifecycle. Those shortcuts are no
longer authoritative.
