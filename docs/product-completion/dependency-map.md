# Dependency Map

## Business flow

`Catalog -> Media/Sizing/Pricing/Inventory -> Cart/Checkout/Orders -> Payments/Fulfillment/Delivery -> Returns/Finance/Analytics`

`Procurement -> Inbound/Receiving -> Inventory -> Landed Cost/Costing -> Margin/Finance`

## Platform dependencies

Every business area depends on organization context, IAM capabilities, audit,
configuration, PostgreSQL transactions, and observability. Background effects
depend on outbox/jobs and worker recovery.

## Catalog dependency position

Catalog owns Product and Variant identity. It references Product Types,
categories, options, attributes, information, and FAQ. It does not own price,
stock, stored media, sizing truth, purchase cost, reviews, or analytics. Its
operator workspace must compose those domains without duplicating their truth.
