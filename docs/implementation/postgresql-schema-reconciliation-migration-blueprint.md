# Maevelle — PostgreSQL Schema Reconciliation & Migration Blueprint

**Document:** `docs/implementation/postgresql-schema-reconciliation-migration-blueprint.md`
**Status:** APPROVED IMPLEMENTATION BRIDGE
**Version:** 0.1
**Canonical Schema Being Reconciled:** `docs/architecture/postgresql-schema-specification.md`
**Target Canonical Version:** v0.2

---

# 1. Purpose

This document performs the final bridge between:

```text
Business Architecture
        ↓
Database Architecture
        ↓
Executable PostgreSQL Migrations
```

It has two responsibilities:

1. identify changes required in PostgreSQL Schema Specification v0.1;
2. define the exact implementation order for physical migrations.

After this document is approved:

> **Repository implementation begins.**

---

# 2. Final Architecture Freeze Rule

The architecture is not permanently frozen.

But the current design is considered:

```text
IMPLEMENTATION READY
```

unless coding/testing produces concrete evidence requiring revision.

We will no longer postpone implementation for speculative architecture exploration.

---

# 3. Reconciliation Result

The existing PostgreSQL schema specification is fundamentally sound.

It does **not** require replacement.

It requires:

```text
EXPANSION

CORRECTION

FINALIZATION

TECHNICAL ADR ALIGNMENT
```

to become v0.2.

---

# 4. Major v0.2 Changes

The largest additions since v0.1 are:

```text
Pricing formalization

FIFO Inventory Costing / COGS

Returns / RTO

Delivery / Courier

Geography / Serviceability

Better Auth reconciliation

PostgreSQL 18 / uuidv7

Kysely migration assumptions

Search implementation

Job leasing details

Operational Holds

Technical observability/deployment considerations
```

---

# 5. Canonical PostgreSQL Logical Schemas

v0.2 should use:

```text
platform

iam

audit

integrations

geography

catalog

sizing

media

warehouse

inventory

customers

pricing

promotions

orders

payments

delivery

procurement

shipment

landed_cost

costing

returns

finance

reviews

notifications

search

analytics
```

---

# 6. Removed Ambiguity

Previously:

```text
Pricing partially lived in Catalog.
```

v0.2:

```text
Catalog
→ commercial identity

Pricing
→ selling price authority
```

---

# 7. Removed Ambiguity — Cost

Previously there was risk of:

```text
Variant
→ latest landed cost
```

being treated as cost authority.

That is forbidden.

Canonical:

```text
Inbound Receipt
        ↓
Acquisition Cost Layer
        ↓
Cost Layer Position
        ↓
Outbound Cost Assignment
        ↓
COGS Recognition
```

---

# 8. Removed Ambiguity — Returns

A Return cannot reuse generic Inventory Receipt architecture without its own commercial/physical lifecycle.

Canonical:

```text
Return Case
    ↓
Return Authorization
    ↓
Reverse Movement
    ↓
Return Receipt
    ↓
Inspection
    ↓
Disposition
```

---

# 9. Removed Ambiguity — Delivery

Fulfillment is not Delivery.

Courier Booking is not Delivery.

Canonical:

```text
Fulfillment
    ↓
Delivery
    ↓
Courier Booking
```

---

# 10. Removed Ambiguity — Geography

Customer address must not directly depend on:

```text
Pathao Area ID

Steadfast Area ID
```

Canonical:

```text
Address
   ↓
Canonical Geography
   ↓
Provider Geography Mapping
```

---

# 11. PostgreSQL Version

Required:

```text
PostgreSQL 18+
```

---

# 12. Required Extensions

Migration family `0000` installs:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

`uuidv7()` is provided by PostgreSQL 18 itself.

---

# 13. UUID Policy

Default entity identifier:

```sql
id uuid PRIMARY KEY DEFAULT uuidv7()
```

unless explicitly documented otherwise.

---

# 14. Internal High-Volume IDs

Some append-only/internal tables may use:

```text
BIGINT GENERATED ALWAYS AS IDENTITY
```

if UUID has no domain value.

Candidates:

```text
audit event internals

some projection rows

some consumer receipts
```

but UUID remains preferred where cross-system reference is useful.

---

# 15. Money Types

## Committed monetary amounts

```sql
numeric(20,4)
```

## High-precision unit costs

```sql
numeric(24,8)
```

## FX rates

```sql
numeric(24,12)
```

## Percentages/rates

```sql
numeric(18,8)
```

---

# 16. Quantity

General inventory quantity:

```sql
numeric(20,6)
```

Quantity values that are absolutely structural counts may use integer types where appropriate.

---

# 17. JavaScript Rule

PostgreSQL `NUMERIC` values representing money or cost:

```text
MUST NOT
```

be converted into JS Number for authoritative calculation.

Use decimal-safe representation.

---

# 18. Time

Absolute timestamps:

```sql
timestamptz
```

Date-only concepts:

```sql
date
```

Organization timezone is configuration.

---

# 19. Organization Isolation Pattern

High-risk organization-owned parent tables expose:

```sql
UNIQUE (organization_id, id)
```

Children may use:

```sql
FOREIGN KEY (organization_id, parent_id)
REFERENCES schema.parent (organization_id, id)
```

where tenant isolation materially benefits.

---

# 20. Global Data

Do not add `organization_id` to globally shared reference data such as:

```text
official geography

capability definitions

platform-level reference definitions
```

unless organization-specific override semantics require it.

---

# 21. Mutable Entity Baseline

Typical:

```text
id

organization_id

created_at

updated_at

version
```

`version` supports optimistic concurrency.

---

# 22. Append-Only Entity Baseline

Do not add meaningless:

```text
updated_at

version
```

to truly immutable ledger events unless operational processing requires them.

Examples:

```text
audit event

inventory transaction

cost adjustment event

provider received event
```

---

# 23. Platform Tables

Canonical:

```text
platform.organizations

platform.number_sequences

platform.configuration_definitions

platform.configuration_values

platform.configuration_changes

platform.idempotency_records

platform.outbox_events

platform.outbox_consumer_receipts

platform.jobs

platform.integrity_issues

platform.operational_holds
```

---

# 24. NEW — Operational Holds

Add:

```text
platform.operational_holds
```

Purpose:

temporarily prevent unsafe operations against affected resources.

Example columns:

```text
id
organization_id

hold_type
domain
resource_type
resource_id

reason_code
reason_text

status

created_by_actor_type
created_by_actor_id

created_at
released_at
released_by_actor_id
```

---

# 25. Hold Examples

```text
INVENTORY_MUTATION

REFUND

FULFILLMENT

DELIVERY_BOOKING

COST_FINALIZATION

CUSTOMER_MERGE
```

---

# 26. Idempotency Record

Must support:

```text
organization_id

operation

actor/client scope

idempotency_key_hash

request_fingerprint

status

result_resource_type

result_resource_id

response_metadata

created_at

expires_at
```

---

# 27. Idempotency Unique Constraint

Conceptually:

```text
organization
+
operation
+
actor/client
+
key
```

unique.

---

# 28. Outbox

Canonical:

```text
platform.outbox_events
```

Fields include:

```text
event_id

organization_id

event_type

event_version

aggregate_type

aggregate_id

payload

occurred_at

created_at
```

Do not add one global:

```text
processed = true
```

for all consumers.

---

# 29. Consumer Receipt

Use:

```text
platform.outbox_consumer_receipts
```

with:

```text
outbox_event_id
consumer_name
processed_at
attempts
```

unique on:

```text
event + consumer
```

---

# 30. Jobs

Finalize:

```text
platform.jobs
```

with:

```text
id

organization_id NULL

queue

priority

job_type

payload_version

payload

state

run_at

attempt_count

max_attempts

worker_id

lease_token

leased_at

lease_expires_at

heartbeat_at

last_error_code

last_error_message

created_at

started_at

completed_at
```

---

# 31. Job Claim Index

Partial index should support:

```text
state IN ('PENDING','RETRY_WAIT')
AND run_at <= now()
```

ordered by:

```text
priority
run_at
id
```

---

# 32. Integrity Issue

Canonical:

```text
platform.integrity_issues
```

Add/confirm:

```text
severity

domain

issue_type

resource_type

resource_id

status

evidence

detected_at

resolved_at

resolution

operational_hold_id NULL
```

---

# 33. IAM Tables

Canonical authorization structures remain:

```text
iam.users

iam.organization_memberships

iam.capability_definitions

iam.permission_presets

iam.permission_preset_capabilities

iam.membership_capability_grants

iam.membership_scopes

iam.service_accounts

iam.api_credentials
```

---

# 34. Better Auth Reconciliation

Add implementation-specific authentication tables:

```text
iam.auth_accounts

iam.auth_verifications

iam.auth_two_factor
```

Exact required columns must follow the **pinned Better Auth version** used at repository bootstrap.

---

# 35. IAM Users

Prefer one internal User identity shared with Better Auth authentication identity.

Do not create:

```text
better_auth_user
+
maevelle_user
```

as two independent human identities unless the library forces a compelling separation.

---

# 36. Auth Secondary Storage

Add:

```text
iam.auth_kv_store
```

for Better Auth secondary storage.

Conceptual:

```text
key_hash bytea/text PK

encrypted_value bytea NULL

counter_value bigint NULL

expires_at timestamptz NULL

key_version smallint

created_at
updated_at
```

---

# 37. Session Registry

Add/retain:

```text
iam.sessions
```

without bearer-token authority.

Contains:

```text
id
user_id

created_at

last_seen_at

absolute_expires_at

revoked_at

ip metadata

user agent metadata
```

---

# 38. API Credentials

Store:

```text
credential_prefix

secret_hash

created_at

expires_at

revoked_at

last_used_at
```

Never raw key.

---

# 39. Geography Tables

Add:

```text
geography.geographic_areas

geography.area_aliases

geography.area_source_references

geography.geography_dataset_versions

geography.area_successors

geography.postal_areas

geography.postal_area_links

geography.provider_areas

geography.provider_area_mappings

geography.provider_geography_syncs

geography.service_areas

geography.service_area_members

geography.serviceability_rules

geography.serviceability_overrides
```

---

# 40. Geographic Areas

Conceptual columns:

```text
id

ownership_scope
organization_id NULL

country_code

area_type

parent_area_id NULL

canonical_name

canonical_name_local NULL

status

source_priority

created_at
updated_at
version
```

---

# 41. Geographic Area Ownership Constraint

If:

```text
ownership_scope = GLOBAL
```

then:

```text
organization_id IS NULL
```

If:

```text
ownership_scope = ORGANIZATION
```

then:

```text
organization_id IS NOT NULL
```

enforce through CHECK.

---

# 42. Geographic Hierarchy

Primary hierarchy:

```text
parent_area_id
```

with recursive querying.

V1 decision:

```text
adjacency list
```

is authority.

Do not require closure table initially.

---

# 43. Geography Cycle Protection

Primary enforcement:

```text
application semantic command
+
transactional recursive validation
```

Do not introduce a complicated trigger until implementation evidence demonstrates need.

Integrity checker also scans for impossible cycles.

---

# 44. Catalog Tables

Retain:

```text
catalog.product_types

catalog.products

catalog.product_handle_history

catalog.product_options

catalog.product_option_values

catalog.variants

catalog.variant_option_values

catalog.attribute_definitions

catalog.product_attribute_values

catalog.categories

catalog.product_categories

catalog.collections

catalog.collection_products

catalog.tags

catalog.product_tags

catalog.occasions

catalog.product_occasions

catalog.colors

catalog.product_information_groups

catalog.product_information_items

catalog.product_faqs
```

---

# 45. REMOVE Pricing Authority From Catalog

Do not keep selling price authority under:

```text
catalog.variant_prices
```

Move/rename to:

```text
pricing.variant_prices
```

or equivalent canonical Pricing structure.

---

# 46. Pricing Tables

v0.2 introduces/normalizes:

```text
pricing.price_lists

pricing.variant_prices

pricing.price_adjustments
```

The third table only exists if explicit price-history/override semantics require it.

Do not add speculative complexity otherwise.

---

# 47. Price List

Initial system creates:

```text
DEFAULT_RETAIL_BDT
```

or equivalent organization-level retail Price List.

The schema remains capable of future:

```text
channel price list

other currency

customer segment
```

without implementing their UX now.

---

# 48. Variant Price

Conceptually:

```text
id
organization_id

price_list_id
variant_id

currency_code

amount
compare_at_amount NULL

starts_at NULL
ends_at NULL

status

created_at
updated_at
version
```

---

# 49. Price Uniqueness

Prevent ambiguous simultaneous prices for the same:

```text
price_list
+
variant
+
effective period
```

Application rules handle scheduled overlap initially.

If reliable DB exclusion constraints prove worthwhile, an ADR can introduce them.

---

# 50. Manual Order Price Override

Do not mutate Price List.

Order Line snapshot contains:

```text
base price

effective price

manual override amount

override reason

override actor
```

where used.

---

# 51. Sizing Tables

Retain existing model:

```text
sizing.size_definitions

sizing.measurement_definitions

sizing.size_guides

sizing.size_guide_revisions

sizing.size_guide_rows

sizing.size_guide_measurements
```

plus existing linking structures.

---

# 52. Media Tables

Retain:

```text
media.assets

media.stored_objects

media.renditions

catalog.product_media

reviews.review_media

payments.payment_evidence
```

Authoritative usage remains domain-owned.

---

# 53. Generic Usage

`media_usage_projection` remains:

```text
projection only
```

Never purge based only on this projection.

---

# 54. Warehouse Tables

Retain:

```text
warehouse.locations

warehouse.location_capabilities

warehouse.transfers

warehouse.transfer_lines

warehouse.transfer_dispatches

warehouse.transfer_receipts
```

---

# 55. Inventory Condition Decision

v0.2 decision:

> **Inventory Level is materialized by Inventory Item + Location + Condition.**

Therefore:

```text
inventory.inventory_levels
```

key dimension:

```text
inventory_item_id
location_id
condition
```

---

# 56. Inventory Conditions

Controlled:

```text
SELLABLE

DAMAGED

QUARANTINE

INSPECTION
```

---

# 57. Inventory Level

Contains materialized quantity such as:

```text
on_hand_quantity
```

for that condition.

Reservation remains separate.

---

# 58. Available to Sell

Not independently editable.

Derived from:

```text
SELLABLE physical quantity
-
active reservation quantity
```

possibly materialized into a read projection later.

---

# 59. Inventory Tables

Retain/finalize:

```text
inventory.inventory_items

inventory.inventory_levels

inventory.inventory_transactions

inventory.inventory_movement_lines

inventory.reservations

inventory.reservation_allocations

inventory.fulfillment_inventory_allocations

inventory.stocktakes

inventory.stocktake_lines
```

---

# 60. Inventory Transaction

Append-oriented.

Example transaction types:

```text
OPENING_BALANCE

INBOUND_RECEIPT

ADJUSTMENT

TRANSFER_DISPATCH

TRANSFER_RECEIPT

FULFILLMENT

RETURN_RECEIPT

CONDITION_CHANGE

LOSS

CORRECTION
```

---

# 61. Customers

Retain:

```text
customers.customers

customers.customer_phones

customers.customer_emails

customers.customer_addresses

customers.customer_notes

customers.customer_tags

customers.customer_duplicate_candidates

customers.customer_merges

customers.customer_aliases
```

---

# 62. Customer Phone/Email

Indexes on normalized values.

No global uniqueness requirement.

---

# 63. Customer Address v0.2

Add:

```text
country_code

locality_area_id NULL

district_area_id NULL

postal_area_id NULL

unresolved_locality_text NULL

address_quality_status

latitude NULL

longitude NULL

coordinate_source NULL
```

while retaining human-readable address fields.

---

# 64. Promotions

Retain/finalize:

```text
promotions.promotions

promotions.promotion_revisions

promotions.promotion_rules

promotions.coupon_codes

promotions.promotion_usage
```

---

# 65. Cart & Checkout

Keep under:

```text
orders
```

or introduce a separate `checkout` schema?

Decision:

> **Keep Cart/Checkout in `orders` for V1.**

Reason:

They are commerce pre-order lifecycle structures, and another schema adds little benefit initially.

---

# 66. Cart Tables

```text
orders.carts

orders.cart_lines

orders.checkout_sessions
```

---

# 67. Order Tables

Retain:

```text
orders.orders

orders.order_lines

orders.order_addresses

orders.order_holds

orders.order_cancellations

orders.fulfillments

orders.fulfillment_lines

orders.order_discount_applications

orders.order_discount_allocations

orders.order_financial_summary
```

---

# 68. Order Financial Summary

Important clarification:

```text
orders.order_financial_summary
```

is:

```text
rebuildable operational projection
```

not historical pricing authority.

Historical pricing authority remains:

```text
Order

Order Lines

Discount Applications

Discount Allocations

Delivery pricing snapshot
```

---

# 69. Order Amount Columns

Order should contain top-level committed summaries for efficient operations:

```text
merchandise_gross_amount

merchandise_discount_amount

merchandise_net_amount

delivery_gross_amount

delivery_discount_amount

delivery_net_amount

tax_amount

grand_total_amount

currency_code
```

These are committed snapshot values.

---

# 70. Calculation Metadata

Order:

```text
calculation_version

pricing_context_snapshot
```

where bounded metadata helps explain how calculation was produced.

Do not store full calculation engine object dump.

---

# 71. Order Line Snapshot

Must include:

```text
product_id NULLABLE historical reference as policy dictates

variant_id NULLABLE/retained

product_title_snapshot

variant_title_snapshot

sku_snapshot

options_snapshot

quantity

unit_list_price

unit_effective_price

line_gross

line_discount

line_net

currency
```

---

# 72. Order Address Snapshot

Store explicit:

```text
recipient name

phone

human address

country

division ID/name

district ID/name

locality ID/type/name

postal code

coordinates if known

address quality
```

---

# 73. Fulfillment

Retain:

```text
orders.fulfillments

orders.fulfillment_lines
```

Do not move Fulfillment into Delivery.

---

# 74. Payments

Retain:

```text
payments.payment_methods

payments.payment_providers

payments.payment_accounts

payments.payment_intents

payments.payment_attempts

payments.payment_evidence

payments.payments

payments.payment_allocations

payments.refunds

payments.refund_allocations

payments.payment_reversals

payments.provider_settlements

payments.provider_settlement_lines
```

---

# 75. Payment Reference Uniqueness

Provider/manual transaction reference uniqueness must be scoped carefully by:

```text
organization

payment account/provider

normalized transaction reference
```

according to method.

Do not globally unique all text references.

---

# 76. Delivery Tables — NEW

Create:

```text
delivery.delivery_methods

delivery.deliveries

delivery.delivery_lines

delivery.delivery_packages

delivery.delivery_package_lines

delivery.courier_bookings

delivery.delivery_events

delivery.delivery_attempts

delivery.cod_collection_instructions

delivery.provider_collection_observations

delivery.provider_charges

delivery.delivery_exceptions

delivery.delivery_claims
```

---

# 77. Delivery Status

Delivery carries at least:

```text
operational_status

outcome_status
```

separately.

---

# 78. Courier Booking

Carries:

```text
status

integration_account_id

provider_code

merchant_reference

external_consignment_id

tracking_number

requested_cod_amount

provider_confirmed_cod_amount
```

---

# 79. Active Booking Constraint

Use a partial unique index conceptually:

```text
UNIQUE(delivery_id)
WHERE status IN ('PENDING','BOOKED')
```

Exact active state set must match final lifecycle.

---

# 80. COD Instructions

Versioned:

```text
delivery.cod_collection_instructions
```

Unique:

```text
delivery_id
+
version_number
```

---

# 81. Delivery Event

Append-oriented.

Unique provider event when identifier exists:

```text
integration account
+
provider event ID
```

---

# 82. Procurement

Retain:

```text
procurement.suppliers

procurement.supplier_contacts

procurement.supplier_product_mappings

procurement.purchases

procurement.purchase_lines

procurement.purchase_amendments

procurement.supplier_invoices

procurement.supplier_payments

procurement.supplier_payment_allocations
```

---

# 83. Supplier Advance

Important change:

`Supplier Payment` may exist without complete Invoice allocation.

Therefore:

```text
allocated amount
<=
payment amount
```

Unallocated balance is valid.

---

# 84. Shipment

Retain:

```text
shipment.inbound_shipments

shipment.inbound_shipment_items

shipment.inbound_shipment_purchase_allocations

shipment.shipment_packages

shipment.shipment_journey_legs

shipment.inbound_receipts

shipment.inbound_receipt_lines
```

---

# 85. Canonical Receipt Rule

There is no authoritative:

```text
procurement.purchase_receipts
```

table.

If such concept exists in v0.1:

```text
remove / rename / demote it
```

to derived procurement reporting only.

---

# 86. Unresolved Receipt Line

`inbound_receipt_lines` supports:

```text
inventory_item_id NULL
```

only when:

```text
resolution_status = UNRESOLVED
```

and such quantity must not be posted into sellable Inventory until resolution workflow completes.

---

# 87. Landed Cost

Retain:

```text
landed_cost.worksheets

landed_cost.worksheet_revisions

landed_cost.cost_types

landed_cost.cost_components

landed_cost.cost_targets

landed_cost.allocations
```

---

# 88. Cost Allocation Target

Final V1 primary acquisition allocation:

```text
inbound_shipment_item_id
```

with optional finer receipt-line context where required.

---

# 89. Costing Tables — MAJOR v0.2 Addition

Canonical:

```text
costing.costing_policies

costing.acquisition_cost_layers

costing.cost_layer_positions

costing.cost_layer_adjustments

costing.outbound_cost_assignments

costing.outbound_cost_assignment_lines

costing.cogs_recognitions

costing.cogs_recognition_lines

costing.cogs_adjustments

costing.inventory_loss_costs
```

---

# 90. Costing Policy

Organization-level V1:

```text
inventory_valuation_method = FIFO
```

Future methods require explicit migration/architecture change.

---

# 91. Acquisition Cost Layer

Conceptual:

```text
id
organization_id

inventory_item_id
origin_location_id

inbound_receipt_line_id NULL
inbound_shipment_item_id NULL

acquired_at
available_for_fifo_at

original_quantity

purchase_unit_cost
landed_cost_unit_amount
effective_unit_cost

currency_code

cost_status

created_at
```

---

# 92. FIFO Stable Ordering

Canonical order:

```text
available_for_fifo_at ASC
id ASC
```

This guarantees deterministic tie-breaking.

---

# 93. Cost Layer Adjustment

Append-oriented:

```text
layer_id

adjustment_type

total_adjustment_amount

unit_adjustment_amount

source_landed_cost_revision_id NULL

reason

created_at
```

Never rewrite original acquisition cost provenance.

---

# 94. Cost Layer Position

Tracks where unconsumed cost quantity exists.

Conceptually:

```text
cost_layer_id

inventory_item_id

location_id

condition

position_type

quantity
```

Position types can include:

```text
ON_HAND

OUTBOUND_PENDING

RETURN_PENDING
```

only where architecture genuinely needs them.

Avoid speculative positions.

---

# 95. Outbound Cost Assignment

Header:

```text
fulfillment_id

status

total_quantity

total_cost

currency

assigned_at
```

Lines:

```text
fulfillment_inventory_allocation_id

cost_layer_id

quantity

unit_cost

total_cost
```

---

# 96. COGS Recognition

Reference:

```text
delivery_id
+
outbound_cost_assignment
```

where successful Delivery is recognition trigger.

---

# 97. Inventory Loss Cost

Reference physical:

```text
inventory transaction / movement
```

and consumed Cost Layers.

Separate from COGS.

---

# 98. Returns Tables — NEW/EXPANDED

Canonical:

```text
returns.return_cases

returns.return_lines

returns.return_authorizations

returns.reverse_shipments

returns.return_receipts

returns.return_receipt_lines

returns.return_inspections

returns.return_inspection_lines

returns.return_dispositions

returns.return_disposition_lines

returns.replacement_order_links
```

---

# 99. Return Case Types

Controlled:

```text
CUSTOMER_RETURN

RTO
```

Supplier Return remains Procurement territory/future unless formalized separately.

---

# 100. Return Line

References original:

```text
order_line_id

fulfillment_line_id
```

where available.

Tracks:

```text
requested_quantity

authorized_quantity

received_quantity

finalized_quantity
```

through derived/validated relationships.

---

# 101. Return Receipt

Physical authority.

Contains:

```text
receiving_location_id

received_at

posted_at
```

and lines.

---

# 102. Return Receipt Line

Captures:

```text
expected_return_line_id NULL

actual_inventory_item_id NULL

received_quantity

resolution status
```

allowing wrong/unidentified items.

---

# 103. Inspection

Do not use a single disposition field on Return Receipt Line.

Inspection can split quantity.

---

# 104. Disposition Lines

Example:

```text
Return Receipt Line: 10

Disposition:
7 SELLABLE
2 DAMAGED
1 QUARANTINE
```

---

# 105. Return Cost Link

Disposition/restoration should preserve:

```text
original_outbound_cost_assignment_line_id
```

where known.

This enables original cost-basis restoration.

---

# 106. Replacement Order

Use relationship:

```text
return_case_id
replacement_order_id
```

No mutation of original Order.

---

# 107. Finance

Retain:

```text
finance.financial_accounts

finance.expense_categories

finance.expenses

finance.expense_links

finance.expense_payments

finance.expense_adjustments

finance.finance_transactions

finance.financial_account_entries

finance.internal_transfers

finance.reconciliation_sessions

finance.reconciliation_issues
```

---

# 108. Finance Formalism Decision

V1 uses:

> **Account-entry operational cash ledger, not a full statutory General Ledger.**

`finance_transactions` group one economic cash movement.

`financial_account_entries` change financial-account balances.

---

# 109. Entry Rule

For internal transfer:

```text
source account entry negative

destination account entry positive
```

sum:

```text
0
```

within currency.

---

# 110. External Cash Movement

Example Expense payment:

```text
one negative account entry
```

does not need fake counter-account bookkeeping merely to imitate double-entry accounting.

We are deliberately not claiming full GL accounting.

---

# 111. Financial Balance

Derived from:

```text
SUM(financial_account_entries.amount)
```

plus opening balance represented as transaction.

---

# 112. Expense Adjustment

Supports:

```text
CREDIT

REVERSAL

CORRECTION
```

without rewriting original Expense.

---

# 113. Reviews

Retain:

```text
reviews.reviews

reviews.review_revisions

reviews.review_media

reviews.merchant_responses

reviews.product_rating_summary
```

---

# 114. Review Active Uniqueness

One active Review per:

```text
canonical Customer
+
Product
```

is an application rule reinforced where feasible.

Customer merges can create conflict requiring explicit resolution, so do not design a constraint that makes merge impossible without plan.

---

# 115. Rating Summary

Projection only.

---

# 116. Notifications

Retain/finalize:

```text
notifications.notification_types

notifications.templates

notifications.template_revisions

notifications.notifications

notifications.delivery_attempts

notifications.preferences
```

---

# 117. Integrations

Retain:

```text
integrations.integrations

integrations.integration_accounts

integrations.external_mappings

integrations.integration_operations

integrations.integration_exceptions

integrations.inbound_provider_events

integrations.webhook_subscriptions

integrations.webhook_events

integrations.webhook_delivery_attempts
```

---

# 118. Integration Operation

Must include:

```text
status
```

supporting:

```text
PENDING

SUCCEEDED

FAILED

UNKNOWN_OUTCOME
```

---

# 119. Provider Event Dedupe

Where provider event ID exists:

```text
integration_account_id
+
provider_event_id
```

unique.

Where provider lacks stable ID:

store calculated dedupe key if adapter can construct one safely.

---

# 120. Search

Canonical schema:

```text
search.catalog_documents
```

---

# 121. Search Document

Contains:

```text
organization_id

product_id

search_text

search_vector

title_normalized

sku values

price projection

availability projection

published state

updated_at

projection_version
```

Exact facet structures can be relational/arrays/JSONB according to query needs.

---

# 122. Search Indexes

Expected:

```text
GIN(search_vector)

GIN/GiST trigram index on normalized title/search aliases
```

based on final query plan testing.

---

# 123. Analytics

Retain projections/facts already proposed.

Important classifications:

```text
analytics facts
=
derived/rebuildable
```

unless explicitly designated immutable reporting snapshot.

---

# 124. Analytics Snapshot

Historical metric snapshots may intentionally become stored reporting records.

Must distinguish:

```text
rebuildable fact

published snapshot
```

explicitly.

---

# 125. Audit

Retain:

```text
audit.audit_events
```

Append-oriented.

No update/delete through normal application.

---

# 126. Audit Indexes

Initial likely:

```text
organization_id, created_at DESC

organization_id, resource_type, resource_id, created_at DESC

organization_id, actor_id, created_at DESC
```

Exact plan validated under workload.

---

# 127. Cross-Schema Dependency Rule

Logical schemas do not mean direct unrestricted table access between modules.

Application module boundaries remain enforced in code.

The DB can use FKs across schemas where necessary for integrity.

---

# 128. FK Index Rule

Every foreign-key child column/set receives explicit review.

Do not assume PostgreSQL created the index.

---

# 129. Status Index Rule

Do not index every status column.

Use indexes only for real operational queries.

Particularly useful:

```text
open/pending queues

active records

jobs

bookings

integrity issues
```

---

# 130. Soft Delete

No global `deleted_at`.

Each entity explicitly chooses:

```text
ARCHIVE

CANCEL

DEACTIVATE

PURGE

NONE
```

---

# 131. Primary Historical Entities

Never normally delete:

```text
Orders

Order Lines

Payments

Refunds

Fulfillments

Deliveries

Inbound Receipts

Inventory Transactions

Cost Layers

COGS

Return Receipts

Finance Transactions

Audit Events
```

---

# 132. Projection Delete

Projections may be:

```text
truncate
+
rebuild
```

where documented.

---

# 133. Database Roles — Migration Blueprint

Create roles conceptually:

```text
maevelle_migrator

maevelle_app

maevelle_readonly
```

Exact environment usernames can differ.

---

# 134. Migrator

Can:

```text
CREATE/ALTER/DROP schema objects

install approved extensions
```

Used only by migration process.

---

# 135. Application Role

Can:

```text
SELECT

INSERT

UPDATE

DELETE
```

only where application lifecycle requires.

No:

```text
SUPERUSER

CREATE EXTENSION

arbitrary schema changes.
```

---

# 136. Readonly Role

Used later for:

```text
diagnostics

reporting

safe production reconciliation
```

where useful.

---

# 137. RLS Decision

V1:

```text
NOT mandatory
```

for all tables.

Primary tenant defenses:

```text
application authorization

organization context

tenant-safe composite FKs

tests.
```

RLS remains future defense-in-depth ADR.

---

# 138. Partitioning Decision

No table partitioning initially.

Future candidates recorded:

```text
audit events

inventory movements

outbox

jobs

provider events

notification attempts

analytics facts
```

---

# 139. Migration Family Order

Physical implementation should now use this ordering:

```text
0000_extensions_and_database_baseline

0010_platform_core

0020_iam_auth

0030_audit

0040_integrations_core

0050_outbox_jobs_integrity

0100_geography

0200_catalog

0300_sizing

0400_media

0500_warehouse

0600_inventory

0700_customers

0800_pricing

0900_promotions

1000_cart_checkout

1100_orders

1200_payments

1300_fulfillment

1400_delivery

1500_procurement

1600_inbound_shipment

1700_receiving

1800_landed_cost

1900_costing

2000_returns

2100_finance

2200_reviews

2300_notifications

2400_search

2500_analytics
```

---

# 140. Why Geography Comes Early

Because it will later support:

```text
Customer Addresses

Warehouse Addresses

Delivery

Provider mappings
```

and is mostly reference infrastructure.

---

# 141. Why Inventory Precedes Orders

Because:

> Order placement must never exist before safe reservation exists.

---

# 142. Why Pricing Precedes Orders

Because Orders snapshot Pricing truth.

---

# 143. Why Promotions Precede Orders

Promotion usage becomes committed inside PlaceOrder.

---

# 144. Why Payments Follow Orders

Payment Intent/Payment typically needs stable Order context.

---

# 145. Why Delivery Follows Fulfillment

Delivery requires physical Fulfillment context.

---

# 146. Why Costing Comes After Receiving

Cost Layers originate from physical acquisition.

---

# 147. Why Returns Come After Costing

Correct returns need:

```text
original outbound cost assignment
```

for restoration/COGS reversal.

---

# 148. Migration 0000

Creates:

```text
required extensions

database baseline validation
```

Checks PostgreSQL major:

```text
>= 18
```

through deployment/preflight tooling.

---

# 149. Migration 0010 — Platform

Creates:

```text
platform.organizations

platform.number_sequences

platform.configuration_*

platform.idempotency_records
```

---

# 150. Migration 0020 — IAM/Auth

Creates:

```text
IAM core

Better Auth reconciled tables

auth KV store

session registry

service accounts

API credentials
```

---

# 151. Migration 0030 — Audit

Creates:

```text
audit.audit_events
```

before most business features so early actions can already be audited.

---

# 152. Migration 0040 — Integrations

Creates:

```text
integration accounts

credentials metadata

mappings

operations

provider events

webhook structures
```

---

# 153. Migration 0050 — Infrastructure

Creates:

```text
outbox

consumer receipts

jobs

integrity issues

operational holds
```

---

# 154. Reference Data After Foundation

Seed:

```text
capability definitions

core configuration definitions
```

using explicit bootstrap process.

Do not create Maevelle business user yet in migration.

---

# 155. Geography Import

After Geography schema:

```text
Import approved Bangladesh reference dataset
```

through versioned import process.

---

# 156. Catalog Migration Group

Do not add large business seed.

Catalog starts empty.

---

# 157. Warehouse/Inventory

After these migrations, repository should already be capable of testing:

```text
Opening Balance

Adjustment

Reservation
```

before Orders migration exists.

---

# 158. Order Migration Dependency

`orders` migration should not need to invent Inventory tables.

All referenced foundations already exist.

---

# 159. Circular Dependency Handling

Where domains reference each other in both directions:

avoid circular FK creation order by:

```text
create primary tables

then add secondary FK in later migration
```

or model one side as relationship table.

Do not eliminate important integrity merely to avoid ordering inconvenience.

---

# 160. Example

Order may later reference:

```text
primary/current fulfillment?
```

Do not add such FK if unnecessary.

Use:

```text
Fulfillment → Order
```

and derive current state.

This eliminates unnecessary circularity.

---

# 161. Cross-Domain Snapshot Rule

When historical snapshot exists:

do not require mutable master FK to remain valid forever unless useful.

Possible pattern:

```text
product_id NULL

product_title_snapshot NOT NULL
```

if future Product purge policy allows FK removal.

For V1, archived masters remain, so FK can usually stay.

---

# 162. Number Sequence Dependency

Document-number creation requires:

```text
platform.number_sequences
```

and therefore every numbered transactional migration depends on Platform.

---

# 163. Concurrency Matrix — PlaceOrder

Locks/checks:

```text
idempotency record

promotion usage constraints

Inventory Item/Level/Reservation rows in deterministic order

relevant Checkout version
```

Transaction commits:

```text
Order

Lines

Snapshots

Promotion usage

Reservations

Payment Intent where applicable

Outbox
```

No courier/payment-provider HTTP inside transaction.

---

# 164. Concurrency — Payment Verification

Lock:

```text
Payment Attempt

relevant Payment/reference uniqueness context

Order allocation context
```

Guarantee:

```text
one confirmed Payment effect.
```

---

# 165. Concurrency — Inbound Receipt

Lock:

```text
Receipt

Shipment Items / remaining quantities as required
```

Guarantee:

```text
one posted physical effect.
```

---

# 166. Concurrency — Fulfillment

Lock:

```text
Fulfillment

reservation allocations

Inventory rows

FIFO Cost Layer rows in deterministic order
```

Guarantee:

```text
one inventory consumption.
```

---

# 167. Concurrency — FIFO

Lock candidate Cost Layers:

```text
ORDER BY available_for_fifo_at, id
FOR UPDATE
```

consume only available quantity.

---

# 168. Concurrency — Refund

Lock/refundable-position logic must include:

```text
confirmed Refunds

pending provider Refunds

UNKNOWN outcome Refund operations
```

Unknown amount counts as unavailable until reconciled.

---

# 169. Concurrency — Return Receipt

Posting same Return Receipt twice must be blocked through:

```text
receipt state

idempotency

unique physical transaction linkage.
```

---

# 170. Concurrency — Courier Booking

Use:

```text
Delivery lock
+
active Booking partial unique index
+
Integration Operation idempotency
```

---

# 171. Stress Test — Last Unit

Schema support is sufficient if:

```text
Inventory locking

Reservation unique identity

ATS calculation

transaction rollback
```

prevent second reservation.

---

# 172. Stress Test — Duplicate Receipt

Must be impossible to create two Inventory transactions for one posted Receipt through normal application.

Add unique relationship:

```text
source_type/source_id
```

or explicit:

```text
inventory_transaction_id
```

one-to-one from Receipt/posting record according to final implementation.

---

# 173. Stress Test — Duplicate Fulfillment

Same requirement.

One posted Fulfillment maps to one canonical Inventory outbound transaction.

---

# 174. Stress Test — Late Landed Cost

Schema supports:

```text
Cost Layer Adjustment
```

and downstream:

```text
COGS Adjustment
```

without rewriting history.

---

# 175. Stress Test — RTO

Courier status cannot reference Inventory transaction directly.

Only:

```text
Return Receipt posting
```

creates restoration Inventory movement.

---

# 176. Stress Test — Customer Merge

Orders retain original:

```text
customer_id
```

while:

```text
customer_aliases
```

resolve canonical identity for aggregates.

---

# 177. Stress Test — Provider Timeout

Integration Operation retains:

```text
UNKNOWN_OUTCOME
```

so database cannot treat local timeout as proof provider failed.

---

# 178. Stress Test — Response Lost After Commit

Idempotency record returns original resource/result.

No second business transaction.

---

# 179. Rebuildability Matrix

## Rebuildable

```text
Search projection

Product rating summary

Customer statistics

Order operational financial summary

Analytics projections

some Inventory availability projections
```

## Not casually rebuildable

```text
Orders

Payments

Inventory ledger

Cost Layers

COGS

Return Receipts

Finance ledger

Audit
```

---

# 180. Security Classification

Mark at schema-document level:

### Sensitive PII

```text
Customer phone

Customer email

Customer address

exact coordinates
```

### Financial-sensitive

```text
Payment evidence

provider references

Finance
```

### Secret

```text
encrypted provider credentials

auth encrypted state
```

### Public-capable

```text
published Product media
```

---

# 181. Migration Validation

Every migration family gets:

```text
clean install verification

schema assertions

constraint tests

index presence tests
```

---

# 182. Full Clean Migration CI

CI spins:

```text
PostgreSQL 18
```

then:

```text
empty DB
→ migration 0000
→ ...
→ migration current
```

and verifies expected schema.

---

# 183. Migration SQL Inspection

Before implementation PR approval:

developer/agent must inspect generated SQL for:

```text
constraints

indexes

defaults

cascade behavior

precision
```

---

# 184. Better Auth Migration Procedure

At repository bootstrap:

```text
pin Better Auth version

generate its expected schema

compare with this architecture

adapt names into iam

write Maevelle migrations

run Better Auth integration tests.
```

If Better Auth requires materially conflicting database architecture:

```text
stop
→ amend ADR
```

Do not silently modify IAM.

---

# 185. Reference Data Bootstrap

Separate commands:

```text
bootstrap-capabilities

import-geography

bootstrap-config-definitions
```

instead of mixing all seed data into table migrations.

---

# 186. First Organization Bootstrap

Future command:

```text
pnpm bootstrap:organization
```

or application-equivalent.

Creates:

```text
Organization

Primary Owner Membership

required settings/defaults
```

through application/bootstrap services.

---

# 187. Maevelle Business Data

Never hard-coded inside generic product migrations.

---

# 188. v0.1 → v0.2 Added

Major additions:

```text
geography schema

pricing schema formalization

costing schema

returns schema

delivery schema

operational holds

Better Auth storage integration

auth KV store

provider geography

COD delivery entities

Cost Layer Positions

COGS recognition structures
```

---

# 189. v0.1 → v0.2 Changed

```text
Catalog no longer owns selling price

Cost valuation finalized as FIFO

Receipt architecture clarified

Customer Addresses gain Geography references

Order snapshots strengthened

Jobs gain explicit leases/claim behavior

Integration Operations explicitly support UNKNOWN

PostgreSQL 18 native UUIDv7 adopted

Money/quantity precision finalized

Search implementation finalized
```

---

# 190. v0.1 → v0.2 Removed / Rejected

Reject any competing notions of:

```text
variant.stock authority

variant.landed_cost authority

purchase_receipts authority

courier provider fields directly defining Delivery

Pathao/Steadfast IDs directly defining Customer geography

Refund restoring Inventory

RTO provider status restoring Inventory

current Product price reconstructing Order

current Customer address reconstructing Order
```

---

# 191. Renaming/Cleanup

Ensure:

```text
consistent *_id

consistent *_at

provider_external_id

merchant_reference

human *_number

status naming
```

across the canonical document.

---

# 192. Remaining ADRs Before Coding?

No **architecture-blocking** ADR is currently required.

Implementation may later need focused ADRs for:

```text
frontend API client generation

exact object image-processing library

load-testing tool

email provider
```

These do not block repository bootstrap.

---

# 193. Schema Approval Gate

The schema is approved for implementation when:

```text
✓ every major domain represented

✓ no duplicate authorities known

✓ FIFO cost path complete

✓ Return physical/cost path complete

✓ Delivery/COD boundaries complete

✓ Geography boundary complete

✓ IAM/Auth boundary complete

✓ organization isolation clear

✓ transaction matrix clear

✓ migration dependency order clear
```

---

# 194. Result

At this point:

```text
Architecture
    ↓
Schema v0.2
    ↓
Migration Blueprint
```

is sufficiently mature to begin coding.

---

# 195. IMPORTANT — DOCUMENTATION STOP POINT

After applying this reconciliation:

> **Do not create another planned architecture document before repository bootstrap.**

This is the hard transition.

The next work item is not another `.md` planning artifact.

The next work item is:

```text
CREATE THE REPOSITORY.
```

---

# 196. Next Execution Task

## Repository Bootstrap

Actual work begins with:

```text
package.json

pnpm-workspace.yaml

tsconfig

ESLint

apps/api

apps/worker

apps/admin

apps/storefront

packages/core

packages/database

packages/contracts

packages/config

packages/security

packages/observability

packages/testkit

Dockerfiles

compose.yaml

GitHub Actions
```

---

# 197. First Running Target

The first implementation checkpoint is:

```text
docker compose up
```

and obtain:

```text
PostgreSQL 18         HEALTHY

API                   HEALTHY

Worker                HEALTHY

Admin                 RUNNING

Storefront            RUNNING
```

---

# 198. First Database Migration

After bootstrap:

```text
0000_extensions_and_database_baseline
```

becomes the first real migration.

---

# 199. First Backend Endpoint

```text
GET /health/live
```

then:

```text
GET /health/ready
```

with real PostgreSQL readiness.

---

# 200. First Automated Integration Test

```text
API starts
        ↓
connects PostgreSQL
        ↓
migration exists
        ↓
readiness returns healthy
```

---

# 201. Then Platform

Actual implementation sequence:

```text
Organization
    ↓
IAM
    ↓
Authentication
    ↓
Admin Login
```

That gives us the first real usable application surface.

---

# 202. Then First Business Slice

```text
Catalog
    ↓
Product creation
    ↓
Variant creation
    ↓
Media
    ↓
Publish Product
    ↓
Storefront reads Product
```

---

# 203. Then Inventory

```text
Warehouse
    ↓
Inventory Item
    ↓
Opening Balance
    ↓
Inventory Ledger
    ↓
Reservation
```

---

# 204. Then Commerce

```text
Customer
    ↓
Pricing
    ↓
Cart
    ↓
Checkout
    ↓
PlaceOrder
```

---

# 205. First Major Working Goal

The first true business milestone is not:

```text
"all backend endpoints complete."
```

It is:

> **A real Customer can open a real Product, select a Variant, place a COD Order, Inventory is reserved exactly once, and the Order immediately appears correctly inside Admin.**

When that works, Maevelle becomes a functioning commerce system instead of a documentation project.

---

**End of PostgreSQL Schema Reconciliation & Migration Blueprint v0.1**
