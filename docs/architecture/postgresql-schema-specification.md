# Maevelle Ecommerce — PostgreSQL Schema Specification

**Document:** `docs/architecture/postgresql-schema-specification.md`
**Status:** Implementation Contract — Pre-DDL Review
**Version:** 0.1
**Database:** PostgreSQL 18+
**Purpose:** Concrete relational contract before migration SQL is generated.

---

# 1. Purpose

This specification converts:

```text
Domain Architecture
+
Database Architecture
+
Cross-Domain Stress Tests
```

into a concrete PostgreSQL model defining:

```text
Schemas

Tables

Columns

SQL Types

Primary Keys

Foreign Keys

Organization-safe relationships

Unique Constraints

Check Constraints

Indexes

Concurrency Columns

Ledger Structures

Snapshots

Projection Structures

Idempotency

Outbox

Jobs

Integration State
```

This document is the last architectural checkpoint before actual:

```text
CREATE TABLE
ALTER TABLE
CREATE INDEX
```

migration files.

---

# 2. PostgreSQL Baseline

Production baseline:

```text
PostgreSQL 18+
```

PostgreSQL 18 provides native UUID storage and generation including UUIDv7.

---

# 3. ID Strategy

Primary domain entity IDs:

```sql
uuid NOT NULL DEFAULT uuidv7()
```

Examples:

```text
Product

Variant

Order

Customer

Payment

Supplier

Shipment

Location
```

---

# 4. Why UUIDv7

We want:

```text
globally safe ID creation

no central ID allocation service

roughly time-ordered identifiers

native PostgreSQL UUID representation
```

PostgreSQL 18 exposes `uuidv7()` directly.

---

# 5. Technical/Internal Row IDs

Infrastructure child/event tables may use:

```sql
bigint GENERATED ALWAYS AS IDENTITY
```

where globally portable identity is unnecessary.

Examples:

```text
audit_events internal row ID

job_attempts

notification_delivery_attempts

inventory_movement_lines
```

Domain/business references still use UUID where useful.

---

# 6. Database Schemas

Create:

```text
platform
iam
catalog
sizing
media
warehouse
inventory
procurement
shipment
landed_cost
customers
orders
payments
finance
reviews
promotions
notifications
integrations
analytics
audit
```

---

# 7. Global Organization Rule

Nearly every business table contains:

```sql
organization_id uuid NOT NULL
```

referencing:

```text
platform.organizations.id
```

---

# 8. Tenant-Safe FK Rule

Critical relationships use:

```text
organization_id + entity_id
```

together.

Example parent:

```sql
UNIQUE (organization_id, id)
```

Child:

```sql
FOREIGN KEY (organization_id, customer_id)
REFERENCES customers.customers (organization_id, id)
```

PostgreSQL permits foreign keys against primary/unique candidate keys, giving us the database-level tenant protection needed here.

---

# 9. Standard Mutable Entity Columns

Where applicable:

```sql
id              uuid
organization_id uuid
created_at      timestamptz
created_by      uuid NULL
updated_at      timestamptz
updated_by      uuid NULL
version         bigint
```

Recommended defaults:

```sql
created_at DEFAULT now()
updated_at DEFAULT now()
version DEFAULT 1
```

---

# 10. Version Semantics

Application update:

```sql
UPDATE ...
SET
    ...,
    version = version + 1
WHERE id = $id
  AND version = $expected_version;
```

Affected rows:

```text
0
→ VERSION_CONFLICT
```

---

# 11. Money

Transaction money:

```sql
numeric(20,6)
```

High-precision calculations:

```sql
numeric(28,12)
```

Currency:

```sql
char(3)
```

Examples:

```text
BDT
USD
CNY
```

Never use:

```text
real
double precision
```

for financial authority.

---

# 12. Quantities

General quantity:

```sql
numeric(20,6)
```

Fashion Inventory Items initially enforce whole units through Inventory policy/application validation.

This prevents schema redesign if measured inventory is introduced later.

---

# 13. Time

Business instants:

```sql
timestamptz
```

Calendar-only values:

```sql
date
```

Duration:

```text
integer seconds
```

or domain-specific duration representation.

---

# 14. Status Storage

Business statuses:

```sql
text NOT NULL
```

with stable application codes.

Important/stable statuses receive:

```sql
CHECK (...)
```

where useful.

Do not create PostgreSQL ENUM for every evolving domain workflow.

---

# 15. JSONB Rule

Allowed for:

```text
Historical display snapshots

Provider payloads

Job payloads

Audit diffs

Configuration values

Webhook payloads

Search projection metadata
```

Not allowed as replacement for:

```text
Order Lines

Payments

Inventory

Permissions

Product Categories
```

PostgreSQL supports GIN indexing for JSONB where actual JSON querying requires it.

---

# PART I — PLATFORM

# 16. `platform.organizations`

```text
id                  uuid PK
code                text NOT NULL
display_name        text NOT NULL
legal_name          text NULL
country_code        char(2) NULL
timezone            text NOT NULL
default_locale      text NOT NULL
default_currency    char(3) NOT NULL
status              text NOT NULL
configuration_version bigint NOT NULL DEFAULT 1
created_at          timestamptz NOT NULL
updated_at          timestamptz NOT NULL
version             bigint NOT NULL
```

Constraints:

```text
UNIQUE(code)

status IN:
ACTIVE
SUSPENDED
ARCHIVED
```

---

# 17. `platform.number_sequences`

```text
id                  uuid PK
organization_id     uuid NOT NULL
sequence_type       text NOT NULL
prefix              text NOT NULL
counter_value       bigint NOT NULL
reset_policy        text NOT NULL
sequence_year       integer NULL
padding             integer NOT NULL
version             bigint NOT NULL
created_at          timestamptz
updated_at          timestamptz
```

Unique:

```text
organization_id
sequence_type
sequence_year
```

where yearly policy applies.

---

# 18. Sequence Rules

Valid reset policies:

```text
NEVER
YEARLY
```

V1 avoids arbitrary scripting.

Human number allocation happens while locking the sequence row.

---

# 19. `platform.configuration_values`

```text
id                  uuid PK
organization_id     uuid NOT NULL
configuration_key   text NOT NULL
scope_type          text NOT NULL
scope_id            uuid NULL
value_json          jsonb NOT NULL
definition_version  integer NOT NULL
created_at          timestamptz
updated_at          timestamptz
version             bigint
```

Unique:

```text
organization_id
configuration_key
scope_type
scope_id
```

Semantics come from code-controlled Configuration Registry.

---

# 20. `platform.configuration_change_sets`

```text
id                  uuid PK
organization_id     uuid NOT NULL
actor_type          text NOT NULL
actor_id            uuid NULL
reason              text NULL
created_at          timestamptz NOT NULL
```

---

# 21. `platform.configuration_changes`

```text
id                  bigint identity PK
change_set_id       uuid NOT NULL
configuration_key   text NOT NULL
scope_type          text NOT NULL
scope_id            uuid NULL
old_value           jsonb NULL
new_value           jsonb NULL
created_at          timestamptz
```

---

# 22. `platform.idempotency_records`

```text
id                  uuid PK
organization_id     uuid NOT NULL
principal_type      text NOT NULL
principal_id        uuid NULL
operation_type      text NOT NULL
idempotency_key     text NOT NULL
request_fingerprint text NOT NULL
status              text NOT NULL
result_entity_type  text NULL
result_entity_id    uuid NULL
safe_response       jsonb NULL
created_at          timestamptz NOT NULL
completed_at        timestamptz NULL
expires_at          timestamptz NULL
```

Unique:

```text
organization_id
principal_type
principal_id
operation_type
idempotency_key
```

---

# 23. Idempotency States

```text
IN_PROGRESS
SUCCEEDED
FAILED_FINAL
```

Temporary failures that never committed can allow controlled retry.

---

# 24. `platform.integrity_issues`

Stress-test refinement.

```text
id                  uuid PK
organization_id     uuid NOT NULL
domain              text NOT NULL
issue_type          text NOT NULL
severity            text NOT NULL
entity_type         text NULL
entity_id           uuid NULL
status              text NOT NULL
summary             text NOT NULL
details             jsonb NULL
detected_at         timestamptz NOT NULL
resolved_at         timestamptz NULL
resolved_by         uuid NULL
repair_reference    text NULL
version             bigint NOT NULL
```

Statuses:

```text
OPEN
INVESTIGATING
RESOLVED
IGNORED_WITH_REASON
```

---

# 25. Integrity Severity

```text
INFO
WARNING
ERROR
CRITICAL
```

---

# PART II — IAM

# 26. `iam.users`

Global authentication identity.

```text
id                  uuid PK
email               text NOT NULL
email_normalized    text NOT NULL
password_hash       text NULL
status              text NOT NULL
last_login_at       timestamptz NULL
created_at          timestamptz
updated_at          timestamptz
version             bigint
```

Unique:

```text
email_normalized
```

for internal identities.

---

# 27. User Status

```text
ACTIVE
DISABLED
LOCKED
```

---

# 28. `iam.organization_memberships`

```text
id                  uuid PK
organization_id     uuid NOT NULL
user_id             uuid NOT NULL
membership_type     text NOT NULL
status              text NOT NULL
display_name        text NULL
created_at          timestamptz
updated_at          timestamptz
version             bigint
```

Unique:

```text
organization_id
user_id
```

---

# 29. Membership Type

```text
OWNER
STANDARD
```

Role names do not determine domain authorization.

---

# 30. `iam.capability_definitions`

```text
capability_code     text PK
domain              text NOT NULL
description         text NOT NULL
sensitivity         text NOT NULL
```

Examples:

```text
orders.view
orders.cancel
inventory.adjust
payments.refund
```

---

# 31. `iam.permission_presets`

```text
id                  uuid PK
organization_id     uuid NOT NULL
name                text NOT NULL
description         text NULL
is_system_default   boolean NOT NULL
created_at
updated_at
version
```

---

# 32. `iam.permission_preset_capabilities`

```text
preset_id           uuid
capability_code     text

PRIMARY KEY (
    preset_id,
    capability_code
)
```

---

# 33. `iam.membership_capability_grants`

```text
membership_id       uuid
capability_code     text
created_at          timestamptz
created_by          uuid

PRIMARY KEY (
    membership_id,
    capability_code
)
```

---

# 34. `iam.membership_scopes`

```text
id                  uuid PK
organization_id     uuid
membership_id       uuid
capability_code     text NULL
scope_type          text NOT NULL
scope_id            uuid NOT NULL
created_at          timestamptz
```

Example:

```text
scope_type = LOCATION
scope_id = Main Warehouse ID
```

---

# 35. `iam.sessions`

```text
id                  uuid PK
user_id             uuid
membership_id       uuid NULL
token_hash          text NOT NULL
authentication_level text NOT NULL
created_at          timestamptz
last_activity_at    timestamptz
expires_at          timestamptz
revoked_at          timestamptz NULL
revocation_reason   text NULL
```

Index:

```text
token_hash
```

Unique.

---

# 36. `iam.mfa_methods`

```text
id                  uuid PK
user_id             uuid
method_type         text
encrypted_secret    bytea NULL
status              text
created_at
verified_at         timestamptz NULL
disabled_at         timestamptz NULL
```

---

# 37. `iam.mfa_recovery_codes`

```text
id                  bigint identity PK
mfa_method_id       uuid
code_hash           text
used_at             timestamptz NULL
```

---

# 38. `iam.service_accounts`

```text
id                  uuid PK
organization_id     uuid
name                text
status              text
created_at
updated_at
version
```

---

# 39. `iam.api_credentials`

```text
id                  uuid PK
organization_id     uuid
service_account_id  uuid
credential_prefix   text
secret_hash         text
status              text
expires_at          timestamptz NULL
last_used_at        timestamptz NULL
created_at
revoked_at          timestamptz NULL
```

---

# PART III — CATALOG

# 40. `catalog.product_types`

```text
id                  uuid PK
organization_id     uuid
code                text
name                text
status              text
created_at
updated_at
version
```

Unique:

```text
organization_id
code
```

---

# 41. `catalog.products`

```text
id                  uuid PK
organization_id     uuid
product_type_id     uuid NOT NULL
handle              text NOT NULL
title               text NOT NULL
description         text NULL
status              text NOT NULL
publication_status  text NOT NULL
primary_category_id uuid NULL
published_at        timestamptz NULL
seo_title           text NULL
seo_description     text NULL
version             bigint
created_at
updated_at
```

Unique:

```text
organization_id
handle
```

---

# 42. Product Lifecycle

```text
DRAFT
ACTIVE
ARCHIVED
```

Publication:

```text
UNPUBLISHED
PUBLISHED
```

Separate concepts.

---

# 43. `catalog.product_handle_history`

```text
id                  bigint identity PK
organization_id     uuid
product_id          uuid
old_handle          text
changed_at          timestamptz
```

Unique:

```text
organization_id
old_handle
```

Allows redirects.

---

# 44. `catalog.product_option_axes`

```text
id                  uuid PK
organization_id     uuid
product_id          uuid
code                text
name                text
position            integer
status              text
```

Unique:

```text
product_id
code
```

---

# 45. `catalog.product_option_values`

```text
id                  uuid PK
organization_id     uuid
option_axis_id      uuid
code                text
display_value       text
color_id            uuid NULL
size_definition_id  uuid NULL
position            integer
status              text
```

---

# 46. `catalog.product_variants`

```text
id                  uuid PK
organization_id     uuid
product_id          uuid
sku                 text NOT NULL
sku_normalized      text NOT NULL
barcode             text NULL
status              text NOT NULL
weight_value        numeric(20,6) NULL
weight_unit         text NULL
length_value        numeric(20,6) NULL
width_value         numeric(20,6) NULL
height_value        numeric(20,6) NULL
dimension_unit      text NULL
option_signature    text NOT NULL
version             bigint
created_at
updated_at
```

Unique:

```text
organization_id
sku_normalized

product_id
option_signature
```

---

# 47. `catalog.variant_option_values`

```text
organization_id     uuid
variant_id          uuid
option_axis_id      uuid
option_value_id     uuid

PRIMARY KEY (
    variant_id,
    option_axis_id
)
```

---

# 48. Variant Invariant

Each Variant can select:

```text
maximum one value
per Product Option Axis.
```

Application additionally verifies value belongs to that Product/Axis.

---

# 49. `catalog.attribute_definitions`

```text
id                  uuid PK
organization_id     uuid
code                text
name                text
value_type          text
scope               text
is_filterable       boolean
is_searchable       boolean
status              text
validation_config   jsonb NULL
version             bigint
```

---

# 50. Attribute Value Types

```text
TEXT
INTEGER
DECIMAL
BOOLEAN
DATE
REFERENCE
```

---

# 51. `catalog.product_attribute_values`

```text
id                  uuid PK
organization_id     uuid
product_id          uuid
attribute_definition_id uuid
value_text          text NULL
value_integer       bigint NULL
value_decimal       numeric(28,12) NULL
value_boolean       boolean NULL
value_date          date NULL
value_reference_id  uuid NULL
```

One CHECK ensures exactly the relevant value slot is populated.

---

# 52. `catalog.variant_attribute_values`

Same typed structure but references:

```text
variant_id
```

---

# 53. `catalog.categories`

```text
id                  uuid PK
organization_id     uuid
parent_category_id  uuid NULL
handle              text
name                text
status              text
position            integer
version             bigint
created_at
updated_at
```

Unique:

```text
organization_id
handle
```

---

# 54. Category Cycle

Prevented primarily through semantic move command.

Database FK prevents nonexistent parent.

Application prevents:

```text
self parent

descendant parent

cycles
```

---

# 55. `catalog.product_categories`

```text
organization_id     uuid
product_id          uuid
category_id         uuid

PRIMARY KEY (
    product_id,
    category_id
)
```

---

# 56. `catalog.collections`

```text
id                  uuid PK
organization_id     uuid
handle              text
name                text
status              text
created_at
updated_at
version
```

---

# 57. `catalog.collection_products`

```text
organization_id
collection_id
product_id
position

PRIMARY KEY (
    collection_id,
    product_id
)
```

---

# 58. Tags / Occasions

```text
catalog.tags
catalog.product_tags

catalog.occasions
catalog.product_occasions
```

with standard UUID/org/FK patterns.

---

# 59. `catalog.colors`

```text
id                  uuid PK
organization_id     uuid
code                text
name                text
hex_value           text NULL
status              text
```

---

# 60. `catalog.variant_colors`

```text
organization_id
variant_id
color_id
role
position

PRIMARY KEY (
    variant_id,
    color_id,
    role
)
```

Roles:

```text
PRIMARY
ASSOCIATED
```

Partial unique index:

```text
one PRIMARY color per Variant
```

A PostgreSQL partial index indexes only rows satisfying a predicate, making it suitable for invariants such as one active/primary row in a subset.

---

# 61. `catalog.variant_prices`

V1:

```text
id                  uuid PK
organization_id     uuid
variant_id          uuid
currency_code       char(3)
price_amount        numeric(20,6)
compare_at_amount   numeric(20,6) NULL
status              text
created_at
updated_at
version
```

Unique:

```text
variant_id
currency_code
```

V1.

Future Price Lists can replace/extend this structure.

---

# 62. Product Information

```text
catalog.product_information_groups
catalog.product_information_items
catalog.product_faqs
```

All ordered relational entities.

---

# PART IV — SIZING

# 63. `sizing.sizing_domains`

```text
id
organization_id
code
name
subject_type
status
```

Examples:

```text
CLOTHING
FOOTWEAR
RING
HEADWEAR
```

---

# 64. `sizing.size_systems`

```text
id
organization_id
sizing_domain_id
code
name
region_code NULL
status
```

---

# 65. `sizing.size_definitions`

```text
id
organization_id
size_system_id
code
label
sort_order
status
```

---

# 66. `sizing.measurement_definitions`

```text
id
organization_id
sizing_domain_id
code
name
subject_type
default_unit
status
```

---

# 67. `sizing.size_guides`

```text
id
organization_id
name
sizing_domain_id
status
current_published_revision_id NULL
created_at
updated_at
version
```

---

# 68. `sizing.size_guide_revisions`

```text
id
organization_id
size_guide_id
revision_number
status
instructions
created_at
published_at NULL
created_by
```

Unique:

```text
size_guide_id
revision_number
```

Published revisions immutable.

---

# 69. `sizing.size_guide_rows`

```text
id
organization_id
revision_id
size_definition_id NULL
display_label
position
```

---

# 70. `sizing.size_guide_measurements`

```text
id
organization_id
row_id
measurement_definition_id
value_type
value_exact         numeric(20,6) NULL
value_min           numeric(20,6) NULL
value_max           numeric(20,6) NULL
unit_code
is_approximate      boolean
```

---

# 71. `sizing.product_size_configurations`

```text
id
organization_id
product_id
size_system_id
size_guide_id NULL
status
```

---

# PART V — MEDIA

# 72. `media.media_assets`

```text
id                  uuid PK
organization_id     uuid
asset_type          text
visibility_class    text
status              text
current_object_id   uuid NULL
title               text NULL
alt_text            text NULL
created_at
updated_at
version
```

Visibility:

```text
PUBLIC
PRIVATE
```

Status:

```text
UPLOADING
PROCESSING
READY
FAILED
ARCHIVED
```

---

# 73. `media.media_objects`

```text
id                  uuid PK
organization_id     uuid
asset_id            uuid
storage_provider    text
object_key          text
mime_type           text
byte_size           bigint
checksum_sha256     text
width_px            integer NULL
height_px           integer NULL
metadata_json       jsonb NULL
created_at
```

Unique:

```text
storage_provider
object_key
```

---

# 74. `media.media_renditions`

```text
id
organization_id
asset_id
source_object_id
rendition_key
storage_provider
object_key
mime_type
byte_size
width_px
height_px
processor_version
created_at
```

Unique:

```text
asset_id
rendition_key
processor_version
```

---

# 75. `catalog.product_media`

```text
id
organization_id
product_id
variant_id          uuid NULL
asset_id
role
position
created_at
```

Possible roles:

```text
GALLERY
THUMBNAIL
COLOR_GALLERY
SIZE_DIAGRAM
```

---

# 76. `media.media_usage_projection`

Derived only:

```text
id
organization_id
asset_id
domain
usage_type
entity_id
created_at
```

Deletion logic cannot trust this projection alone.

---

# PART VI — WAREHOUSE

# 77. `warehouse.locations`

```text
id
organization_id
code
name
location_type
status
address_json        jsonb NULL
created_at
updated_at
version
```

Unique:

```text
organization_id
code
```

---

# 78. `warehouse.location_capabilities`

```text
location_id
capability_code

PRIMARY KEY (
    location_id,
    capability_code
)
```

Examples:

```text
FULFILLMENT
RECEIVING
RETURNS
STOCK_STORAGE
```

---

# 79. Transfers

```text
warehouse.transfers
warehouse.transfer_lines
warehouse.transfer_dispatches
warehouse.transfer_dispatch_lines
warehouse.transfer_receipts
warehouse.transfer_receipt_lines
```

---

# 80. `warehouse.transfers`

```text
id
organization_id
transfer_number
source_location_id
destination_location_id
status
created_at
approved_at NULL
completed_at NULL
version
```

CHECK:

```text
source_location_id <> destination_location_id
```

Unique:

```text
organization_id
transfer_number
```

---

# 81. `warehouse.transfer_lines`

```text
id
organization_id
transfer_id
inventory_item_id
requested_quantity numeric(20,6)
cancelled_quantity numeric(20,6) DEFAULT 0
```

Checks:

```text
requested_quantity > 0

cancelled_quantity >= 0

cancelled_quantity <= requested_quantity
```

---

# 82. Dispatch

`transfer_dispatches`

```text
id
organization_id
transfer_id
dispatched_at
status
inventory_transaction_id NULL UNIQUE
created_by
```

---

# 83. Dispatch Lines

```text
dispatch_id
transfer_line_id
quantity
```

---

# 84. Transfer Receipt

```text
id
organization_id
transfer_id
receiving_location_id
received_at
status
inventory_transaction_id NULL UNIQUE
```

---

# 85. Transfer Receipt Lines

```text
receipt_id
transfer_line_id
received_sellable_quantity
received_damaged_quantity
received_other_quantity
```

---

# PART VII — INVENTORY

# 86. `inventory.inventory_items`

```text
id
organization_id
variant_id          uuid NULL
tracking_mode
unit_code
status
created_at
updated_at
version
```

V1 unique:

```text
variant_id
```

when present.

---

# 87. Inventory Tracking Mode

V1:

```text
STANDARD
```

Foundation allows later:

```text
LOT
SERIAL
```

without implementing them now.

---

# 88. `inventory.inventory_levels`

Fast materialized operational state.

```text
id
organization_id
inventory_item_id
location_id
sellable_quantity      numeric(20,6)
unavailable_quantity   numeric(20,6)
reserved_quantity      numeric(20,6)
version                bigint
updated_at
```

Unique:

```text
organization_id
inventory_item_id
location_id
```

Checks:

```text
sellable_quantity >= 0
unavailable_quantity >= 0
reserved_quantity >= 0
```

---

# 89. Available-to-Sell

Do not require stored column.

Calculated:

```text
sellable_quantity
-
reserved_quantity
-
safety_buffer
```

Policy service applies safety buffer/oversell rules.

---

# 90. `inventory.inventory_level_conditions`

```text
id
organization_id
inventory_item_id
location_id
condition_code
quantity
version
```

Unique:

```text
inventory_item_id
location_id
condition_code
```

Condition codes:

```text
SELLABLE
DAMAGED
QUARANTINE
INSPECTION
```

---

# 91. Level Relationship

V1 implementation should treat:

```text
sellable_quantity
```

as the SELLABLE condition materialization.

`unavailable_quantity` equals sum of unavailable conditions.

Reconciliation verifies consistency.

---

# 92. `inventory.inventory_transactions`

```text
id
organization_id
transaction_type
transaction_number NULL
occurred_at
reason_code NULL
reason_text NULL
idempotency_record_id NULL
created_by_actor_type
created_by_actor_id NULL
created_at
```

Append-oriented after posting.

---

# 93. Transaction Types

```text
OPENING_BALANCE

INBOUND_RECEIPT

ORDER_FULFILLMENT

RETURN_RECEIPT

TRANSFER_DISPATCH

TRANSFER_RECEIPT

ADJUSTMENT

STOCKTAKE_ADJUSTMENT

CONDITION_CHANGE

DISPOSAL

RECEIVING_CORRECTION
```

---

# 94. `inventory.inventory_movement_lines`

```text
id                  bigint identity PK
organization_id
inventory_transaction_id
inventory_item_id
location_id
condition_code
quantity_delta      numeric(20,6)
created_at
```

CHECK:

```text
quantity_delta <> 0
```

No updates after posting.

---

# 95. `inventory.inventory_reservations`

```text
id
organization_id
order_id
status
expires_at NULL
created_at
updated_at
version
```

Statuses:

```text
ACTIVE
PARTIALLY_CONSUMED
CONSUMED
RELEASED
EXPIRED
```

---

# 96. `inventory.inventory_reservation_allocations`

```text
id
organization_id
reservation_id
order_line_id
inventory_item_id
location_id
reserved_quantity
consumed_quantity
released_quantity
version
```

Checks:

```text
reserved_quantity > 0

consumed_quantity >= 0

released_quantity >= 0

consumed_quantity + released_quantity
<= reserved_quantity
```

---

# 97. Reservation Expiry Race

Expiry worker:

```text
SELECT reservation FOR UPDATE
```

then revalidates Order/Payment state before expiration.

PostgreSQL row locks provide the synchronization primitive for this class of mutation.

---

# 98. `inventory.fulfillment_inventory_allocations`

Stress-test refinement.

```text
id
organization_id
fulfillment_line_id
reservation_allocation_id
quantity_consumed
created_at
```

Unique:

```text
fulfillment_line_id
reservation_allocation_id
```

Allows precise:

```text
Fulfillment
→ Reservation
→ Item
→ Location
```

provenance.

---

# 99. Stocktakes

```text
inventory.stocktake_sessions
inventory.stocktake_lines
```

---

# 100. `inventory.stocktake_sessions`

```text
id
organization_id
stocktake_number
location_id
status
snapshot_at
posted_inventory_transaction_id uuid NULL UNIQUE
created_at
posted_at NULL
version
```

---

# 101. `inventory.stocktake_lines`

```text
id
organization_id
stocktake_session_id
inventory_item_id
expected_quantity_at_snapshot
counted_quantity NULL
movements_after_snapshot NULL
final_expected_quantity NULL
variance_quantity NULL
status
version
```

---

# PART VIII — PROCUREMENT

# 102. `procurement.suppliers`

```text
id
organization_id
supplier_number
name
status
default_currency NULL
country_code NULL
notes NULL
created_at
updated_at
version
```

Unique:

```text
organization_id
supplier_number
```

---

# 103. `procurement.supplier_contacts`

Multiple contacts.

```text
id
organization_id
supplier_id
contact_type
name
phone
email
is_primary
```

---

# 104. `procurement.supplier_variant_mappings`

```text
id
organization_id
supplier_id
variant_id NULL
supplier_sku
supplier_description
status
created_at
updated_at
version
```

Unique:

```text
supplier_id
supplier_sku
```

---

# 105. `procurement.purchases`

```text
id
organization_id
purchase_number
supplier_id
currency_code
status
confirmed_at NULL
expected_at NULL
notes NULL
created_at
updated_at
version
```

Unique:

```text
organization_id
purchase_number
```

---

# 106. `procurement.purchase_lines`

```text
id
organization_id
purchase_id
variant_id NULL
supplier_variant_mapping_id NULL
description_snapshot
supplier_sku_snapshot NULL
ordered_quantity
cancelled_quantity DEFAULT 0
unit_price
line_amount
status
created_at
updated_at
version
```

---

# 107. Purchase Amount

```text
line_amount
=
ordered commercial quantity
×
agreed price
```

Stored after domain calculation.

---

# 108. `procurement.purchase_amendments`

```text
id
organization_id
purchase_id
revision_number
reason
before_snapshot jsonb
after_snapshot jsonb
created_by
created_at
```

---

# 109. `procurement.supplier_invoices`

```text
id
organization_id
supplier_id
supplier_invoice_number
invoice_date
currency_code
gross_amount
status
created_at
updated_at
version
```

Unique may be:

```text
organization_id
supplier_id
supplier_invoice_number
```

with controlled exception if suppliers reuse invoice references.

---

# 110. `procurement.supplier_invoice_lines`

```text
id
organization_id
supplier_invoice_id
purchase_line_id NULL
description
quantity NULL
unit_amount NULL
line_amount
```

---

# 111. `procurement.supplier_payments`

```text
id
organization_id
supplier_id
payment_number
currency_code
amount
payment_date
financial_account_id NULL
status
reference
created_at
version
```

---

# 112. Supplier Payment Allocation

`procurement.supplier_payment_allocations`

```text
id
organization_id
supplier_payment_id
supplier_invoice_id
amount
created_at
```

---

# 113. Supplier Advance

Stress-test refinement:

```text
Supplier Payment amount
-
allocated amount
=
Unallocated Supplier Advance
```

No fake invoice required.

No separate balance column is authoritative.

---

# PART IX — INBOUND SHIPMENTS & RECEIVING

# 114. `shipment.inbound_shipments`

```text
id
organization_id
shipment_number
status
origin_description NULL
destination_location_id
transport_mode
provider_name NULL
estimated_departure_at NULL
actual_departure_at NULL
estimated_arrival_at NULL
actual_arrival_at NULL
created_at
updated_at
version
```

---

# 115. `shipment.inbound_shipment_items`

```text
id
organization_id
inbound_shipment_id
variant_id NULL
inventory_item_id NULL
description_snapshot
expected_quantity
status
created_at
updated_at
version
```

---

# 116. `shipment.purchase_line_shipment_allocations`

```text
id
organization_id
purchase_line_id
shipment_item_id
allocated_quantity
created_at
```

Unique:

```text
purchase_line_id
shipment_item_id
```

---

# 117. Packages

```text
shipment.shipment_packages
shipment.shipment_package_items
```

---

# 118. Journey Legs

`shipment.shipment_journey_legs`

```text
id
organization_id
inbound_shipment_id
sequence_number
transport_mode
provider_name
origin
destination
status
estimated_departure_at
actual_departure_at
estimated_arrival_at
actual_arrival_at
```

Unique:

```text
inbound_shipment_id
sequence_number
```

---

# 119. `shipment.inbound_receipts`

**Canonical physical receiving document.**

```text
id
organization_id
receipt_number
inbound_shipment_id
receiving_location_id
status
received_at NULL
posted_at NULL
inventory_transaction_id uuid NULL UNIQUE
created_by
created_at
updated_at
version
```

Statuses:

```text
DRAFT
READY_TO_POST
POSTED
CORRECTED
CANCELLED_DRAFT
```

---

# 120. `shipment.inbound_receipt_lines`

```text
id
organization_id
inbound_receipt_id
shipment_item_id
inventory_item_id NULL
resolution_status
expected_quantity_context
received_quantity
condition_code NULL
description_actual NULL
notes NULL
created_at
updated_at
version
```

---

# 121. Resolution Status

Stress-test refinement:

```text
RESOLVED
UNRESOLVED_ITEM
```

---

# 122. Unresolved Receipt Rule

When:

```text
resolution_status = UNRESOLVED_ITEM
```

then:

```text
inventory_item_id IS NULL
```

and Receipt Line does **not** create normal Inventory movement.

It remains:

```text
Physically received
but not catalog/inventory resolved.
```

---

# 123. Resolved Receipt Rule

When:

```text
resolution_status = RESOLVED
```

then:

```text
inventory_item_id IS NOT NULL
condition_code IS NOT NULL
```

---

# 124. Posting With Unresolved Lines

Recommended V1 policy:

Allow partial posting of resolved lines only if Receipt explicitly tracks:

```text
resolved posted quantity
+
unresolved physical quantity
```

and UI clearly shows the Receipt remains:

```text
EXCEPTION / PARTIALLY_RESOLVED
```

Simpler safe alternative during first implementation:

```text
block final POSTED status
until all physical lines resolved.
```

### V0.1 decision

Use the safer first implementation:

> **All Receipt Lines must be resolved before final Receipt posting.**

Warehouse can save/count unresolved physical goods in Draft/Exception state first.

This avoids having physical receipt truth split between posted and unposted interpretations in V1.

---

# PART X — LANDED COST

# 125. `landed_cost.worksheets`

```text
id
organization_id
worksheet_number
inbound_shipment_id
currency_code
status
current_revision_id NULL
created_at
updated_at
version
```

---

# 126. `landed_cost.worksheet_revisions`

```text
id
organization_id
worksheet_id
revision_number
status
created_at
finalized_at NULL
created_by
```

Statuses:

```text
DRAFT
CALCULATED
FINALIZED
SUPERSEDED
```

---

# 127. `landed_cost.cost_types`

Configurable vocabulary:

```text
FREIGHT
CUSTOMS
TAX
VAT
HANDLING
BROKER
INSURANCE
OTHER
```

---

# 128. `landed_cost.cost_components`

```text
id
organization_id
worksheet_revision_id
cost_type_id
source_type
source_id NULL
description
amount_original
currency_original
fx_rate
amount_worksheet_currency
value_status
allocation_method
created_at
```

Value status:

```text
ESTIMATED
ACTUAL
CREDIT
ADJUSTMENT
```

---

# 129. Allocation Methods

```text
EQUAL
QUANTITY
PURCHASE_VALUE
WEIGHT
VOLUME
CHARGEABLE_WEIGHT
PERCENTAGE
MANUAL
DIRECT
```

---

# 130. `landed_cost.allocation_targets`

```text
id
organization_id
worksheet_revision_id
shipment_item_id
eligible_quantity
purchase_value_basis NULL
weight_basis NULL
volume_basis NULL
chargeable_weight_basis NULL
```

---

# 131. `landed_cost.allocations`

```text
id
organization_id
cost_component_id
allocation_target_id
basis_value
raw_amount
rounded_amount
created_at
```

Unique:

```text
cost_component_id
allocation_target_id
```

---

# 132. Reconciliation

For every component:

```text
SUM(rounded_amount)
=
component amount
```

exactly.

---

# 133. `landed_cost.acquisition_cost_layers`

Foundation strongly retained.

```text
id
organization_id
inbound_receipt_line_id
shipment_item_id
inventory_item_id
received_quantity
currency_code
base_purchase_cost_total
allocated_cost_total
total_acquisition_cost
unit_acquisition_cost
cost_status
source_revision_id
created_at
```

---

# 134. Cost Status

```text
PROVISIONAL
FINAL
ADJUSTED
```

This is acquisition provenance—not yet accounting FIFO/LIFO.

---

# PART XI — CUSTOMERS

# 135. `customers.customers`

```text
id
organization_id
customer_number
status
display_name
canonical_customer_id uuid NULL
created_at
updated_at
version
```

Unique:

```text
organization_id
customer_number
```

Statuses:

```text
ACTIVE
INACTIVE
BLOCKED
MERGED
ANONYMIZED
```

---

# 136. Merge Pointer

If:

```text
status = MERGED
```

then:

```text
canonical_customer_id IS NOT NULL
```

Cycle prevention enforced through Customer Merge application service.

---

# 137. `customers.customer_phones`

```text
id
organization_id
customer_id
raw_value
normalized_value
country_code NULL
is_primary
verification_status
created_at
updated_at
version
```

Index:

```text
organization_id
normalized_value
```

Not unique.

---

# 138. `customers.customer_emails`

Same pattern.

Not universally unique at Customer-domain level.

---

# 139. `customers.customer_addresses`

```text
id
organization_id
customer_id
label NULL
recipient_name
phone NULL
address_line_1
address_line_2 NULL
area NULL
city NULL
district NULL
postal_code NULL
country_code
is_default
status
created_at
updated_at
version
```

---

# 140. `customers.customer_notes`

```text
id
organization_id
customer_id
body
created_by
created_at
```

---

# 141. Customer Tags

```text
customers.customer_tags
customers.customer_tag_assignments
```

---

# 142. `customers.customer_duplicate_candidates`

```text
id
organization_id
customer_a_id
customer_b_id
confidence
signals jsonb
status
created_at
resolved_at NULL
```

---

# 143. `customers.customer_merges`

```text
id
organization_id
source_customer_id
target_customer_id
reason
conflict_snapshot jsonb
created_by
created_at
```

Immutable.

---

# 144. `customers.customer_aliases`

```text
organization_id
alias_customer_id
canonical_customer_id
created_at

PRIMARY KEY (
    organization_id,
    alias_customer_id
)
```

---

# PART XII — CART & CHECKOUT

# 145. `orders.carts`

```text
id
organization_id
public_token_hash
status
currency_code
customer_id NULL
expires_at
created_at
updated_at
version
```

Statuses:

```text
ACTIVE
CONVERTED
ABANDONED
EXPIRED
```

---

# 146. `orders.cart_lines`

```text
id
organization_id
cart_id
variant_id
quantity
last_seen_unit_price NULL
created_at
updated_at
version
```

Unique:

```text
cart_id
variant_id
```

if line-merging UX is used.

---

# 147. Checkout Calculation Version

Stress-test refinement.

Add:

`orders.checkout_sessions`

```text
id
organization_id
cart_id
cart_version
customer_id NULL
currency_code
calculation_version
calculated_totals jsonb
status
expires_at
created_at
updated_at
version
```

---

# 148. Checkout Session Purpose

Provides:

```text
stable checkout editing context

server-calculated delivery/payment/promotions

changed-checkout detection
```

but does **not** guarantee stock.

---

# 149. Checkout States

```text
ACTIVE
CHANGED
ORDER_PLACED
EXPIRED
```

---

# 150. Final Place Order

If recalculation differs materially from accepted Checkout calculation:

```text
CHECKOUT_CHANGED
```

returned instead of silently committing higher payable amount.

---

# PART XIII — ORDERS

# 151. `orders.orders`

```text
id
organization_id
order_number
source
customer_id
currency_code
order_status
subtotal_amount
discount_amount
delivery_amount
tax_amount
total_amount
created_at
confirmed_at NULL
completed_at NULL
cancelled_at NULL
version
```

Unique:

```text
organization_id
order_number
```

---

# 152. Order Financial Projection

Do **not** place authoritative:

```text
paid_amount
refunded_amount
```

inside Order core.

Use separate read projection:

```text
orders.order_financial_summaries
```

derived from Payments.

---

# 153. `orders.order_lines`

```text
id
organization_id
order_id
product_id NULL
variant_id NULL
inventory_item_id NULL
quantity
sku_snapshot
product_title_snapshot
variant_title_snapshot NULL
option_snapshot jsonb
unit_price
gross_amount
discount_amount
net_amount
created_at
```

Posted historical Line not freely editable.

---

# 154. `orders.order_addresses`

```text
id
organization_id
order_id
address_type
source_customer_address_id NULL
recipient_name
phone
address_line_1
address_line_2 NULL
area NULL
city NULL
district NULL
postal_code NULL
country_code
created_at
```

Types:

```text
DELIVERY
BILLING
```

---

# 155. `orders.order_holds`

```text
id
organization_id
order_id
reason_code
reason_text NULL
status
created_at
released_at NULL
created_by
released_by NULL
```

---

# 156. `orders.order_cancellations`

```text
id
organization_id
order_id
reason_code
reason_text NULL
created_by
created_at
```

---

# 157. `orders.order_cancellation_lines`

```text
id
organization_id
cancellation_id
order_line_id
quantity
```

---

# 158. Quantity Invariant

Application transaction ensures:

```text
fulfilled
+
cancelled
+
active remaining
=
ordered quantity
```

and never exceeds Order quantity.

---

# 159. `orders.fulfillments`

```text
id
organization_id
order_id
fulfillment_number
location_id
status
inventory_transaction_id uuid NULL UNIQUE
created_at
dispatched_at NULL
completed_at NULL
version
```

---

# 160. `orders.fulfillment_lines`

```text
id
organization_id
fulfillment_id
order_line_id
quantity
created_at
```

---

# 161. `orders.order_discount_applications`

```text
id
organization_id
order_id
promotion_id NULL
promotion_revision_id NULL
coupon_code_snapshot NULL
benefit_snapshot jsonb
sequence_number
total_discount_amount
created_at
```

---

# 162. `orders.order_discount_allocations`

```text
id
organization_id
discount_application_id
order_line_id NULL
allocation_target_type
amount
created_at
```

Target types V1:

```text
ORDER_LINE
DELIVERY
```

---

# 163. `orders.order_financial_summaries`

Projection:

```text
order_id PK
organization_id
confirmed_payment_amount
refunded_amount
net_collected_amount
balance_due
updated_at
source_version
```

Authority remains Payment/Refund allocation records.

Rebuildable.

---

# PART XIV — PAYMENTS

# 164. `payments.payment_methods`

```text
id
organization_id
code
name
method_type
status
configuration jsonb
created_at
updated_at
version
```

---

# 165. `payments.payment_providers`

```text
id
organization_id
code
name
provider_type
status
created_at
updated_at
version
```

---

# 166. `payments.payment_accounts`

```text
id
organization_id
payment_method_id
provider_id
name
status
public_instructions jsonb NULL
secret_reference NULL
created_at
updated_at
version
```

---

# 167. `payments.payment_intents`

```text
id
organization_id
order_id
payment_method_id
payment_account_id NULL
currency_code
expected_amount
status
expires_at NULL
created_at
updated_at
version
```

---

# 168. `payments.payment_attempts`

```text
id
organization_id
payment_intent_id
provider_reference NULL
customer_reference NULL
submitted_amount NULL
status
submitted_at
resolved_at NULL
version
```

---

# 169. Attempt Status

```text
SUBMITTED
PENDING_VERIFICATION
VERIFIED
REJECTED
DUPLICATE
```

---

# 170. `payments.payment_evidence`

```text
id
organization_id
payment_attempt_id
media_asset_id
evidence_type
created_at
```

---

# 171. `payments.payments`

Actual confirmed money.

```text
id
organization_id
payment_number
payment_method_id
payment_account_id NULL
provider_transaction_id NULL
currency_code
amount
confirmed_at
status
source_attempt_id NULL
created_at
version
```

Unique where provider reference exists:

```text
payment_account_id
provider_transaction_id
```

---

# 172. Payment Status

```text
CONFIRMED
REVERSED
```

Do not use:

```text
PENDING
```

for a confirmed Payment entity.

Pending activity belongs to Intent/Attempt.

---

# 173. `payments.payment_allocations`

```text
id
organization_id
payment_id
order_id
amount
created_at
```

Checks:

```text
amount > 0
```

Allocation sum cannot exceed Payment amount.

Enforced transactionally with locking.

---

# 174. Late Payment After Cancellation

Stress-test refinement:

Payment is allowed to exist without full Order allocation.

Therefore:

```text
unallocated amount
=
Payment amount - allocations
```

is valid.

This preserves real money even if original Order is cancelled.

---

# 175. `payments.refunds`

```text
id
organization_id
refund_number
order_id
payment_id NULL
payment_method_id
currency_code
amount
status
reason_code
reason_text NULL
provider_reference NULL
external_operation_id NULL
requested_at
completed_at NULL
version
```

---

# 176. Refund States

```text
REQUESTED
PROCESSING
UNKNOWN_EXTERNAL_OUTCOME
COMPLETED
FAILED
CANCELLED_BEFORE_PROCESSING
```

---

# 177. `payments.refund_allocations`

```text
id
organization_id
refund_id
order_line_id NULL
component_type
amount
created_at
```

---

# 178. Refund Concurrency

Refund calculation locks relevant Payment/refundable balance records before accepting amount.

Two simultaneous Refunds cannot exceed currently refundable amount.

---

# 179. `payments.payment_reversals`

Separate from Refund.

```text
id
organization_id
payment_id
reason
amount
created_at
created_by
```

---

# 180. Settlements

```text
payments.settlement_batches
payments.settlement_lines
payments.reconciliation_issues
```

---

# 181. `payments.settlement_lines`

```text
id
organization_id
settlement_batch_id
payment_id NULL
order_id NULL
gross_amount
fee_amount
net_amount
external_reference
```

CHECK:

```text
gross_amount - fee_amount
= net_amount
```

within supported simple V1 semantics.

---

# PART XV — FINANCE

# 182. `finance.financial_accounts`

```text
id
organization_id
account_number
name
account_type
currency_code
status
created_at
updated_at
version
```

---

# 183. `finance.finance_transactions`

```text
id
organization_id
transaction_number
transaction_type
occurred_at
description
source_domain NULL
source_id NULL
created_by
created_at
```

Append-oriented after posting.

---

# 184. `finance.financial_account_entries`

```text
id                  bigint identity PK
organization_id
finance_transaction_id
financial_account_id
amount_delta
currency_code
created_at
```

CHECK:

```text
amount_delta <> 0
```

---

# 185. Internal Transfer

One Finance Transaction:

```text
Account A  -1000
Account B  +1000
```

plus separate fee entry/Expense if applicable.

---

# 186. `finance.expense_categories`

```text
id
organization_id
parent_category_id NULL
code
name
classification
status
```

---

# 187. `finance.expenses`

```text
id
organization_id
expense_number
expense_category_id
currency_code
amount
expense_date
description
payee_type NULL
payee_reference_id NULL
status
source_domain NULL
source_id NULL
created_at
updated_at
version
```

---

# 188. Expense Status

```text
DRAFT
RECORDED
CANCELLED
```

Payment status derived separately.

---

# 189. `finance.expense_payments`

```text
id
organization_id
expense_id
finance_transaction_id
amount
paid_at
created_at
```

---

# 190. Expense Credit Refinement

Add:

`finance.expense_adjustments`

```text
id
organization_id
expense_id
adjustment_type
amount
reason
finance_transaction_id NULL
created_by
created_at
```

Types:

```text
CREDIT
CORRECTION
REVERSAL
```

---

# 191. Expense Effective Amount

Derived:

```text
Original Expense
+
positive corrections
-
credits
```

according to adjustment semantics.

Original Expense row remains historical.

---

# PART XVI — REVIEWS

# 192. `reviews.reviews`

Stable Review identity:

```text
id
organization_id
product_id
customer_id
verification_order_line_id NULL
source
visibility_status
withdrawn_at NULL
created_at
updated_at
version
```

---

# 193. Review Revision Requirement

Our earlier Reviews architecture strongly benefits from explicit revisioning.

Therefore add:

`reviews.review_revisions`

```text
id
organization_id
review_id
revision_number
rating
title NULL
body NULL
public_display_name
moderation_status
submitted_at
moderated_at NULL
moderated_by NULL
moderation_reason NULL
created_at
```

Unique:

```text
review_id
revision_number
```

---

# 194. Review Rating

CHECK:

```text
rating BETWEEN 1 AND 5
```

---

# 195. `reviews.reviews`

also contains:

```text
published_revision_id uuid NULL
```

Only that Revision contributes to public aggregate.

---

# 196. `reviews.review_media`

```text
id
organization_id
review_revision_id
media_asset_id
position
created_at
```

---

# 197. `reviews.review_merchant_responses`

```text
id
organization_id
review_id
body
status
created_by
created_at
updated_at
version
```

One active response V1.

---

# 198. `reviews.review_summary_projection`

```text
organization_id
product_id
rating_count
rating_sum
rating_1_count
rating_2_count
rating_3_count
rating_4_count
rating_5_count
text_review_count
media_review_count
updated_at

PRIMARY KEY (
    organization_id,
    product_id
)
```

Rebuildable.

---

# PART XVII — PROMOTIONS

# 199. `promotions.promotions`

```text
id
organization_id
name
promotion_type
status
starts_at NULL
ends_at NULL
priority
created_at
updated_at
version
```

---

# 200. `promotions.promotion_revisions`

```text
id
organization_id
promotion_id
revision_number
status
benefit_type
benefit_value
configuration jsonb
created_at
activated_at NULL
```

---

# 201. Promotion Rules

Rather than generic executable JSON:

```text
promotions.promotion_conditions
promotions.promotion_target_products
promotions.promotion_target_variants
promotions.promotion_target_categories
promotions.promotion_target_collections
promotions.promotion_exclusions
```

---

# 202. `promotions.coupon_codes`

```text
id
organization_id
promotion_id
code
normalized_code
status
usage_limit_total NULL
usage_limit_per_customer NULL
created_at
updated_at
version
```

Index:

```text
organization_id
normalized_code
```

Policy determines reuse after historical use.

Default:

```text
historical codes remain reserved.
```

---

# 203. `promotions.promotion_usage`

```text
id
organization_id
promotion_id
promotion_revision_id
coupon_code_id NULL
customer_id
order_id
discount_amount
status
created_at
released_at NULL
```

Status:

```text
COMMITTED
RELEASED
```

---

# PART XVIII — NOTIFICATIONS

# 204. `notifications.notification_templates`

```text
id
organization_id
notification_type
channel
name
status
current_revision_id NULL
created_at
updated_at
version
```

---

# 205. `notifications.template_revisions`

```text
id
organization_id
template_id
revision_number
subject_template NULL
body_template
status
created_at
published_at NULL
```

---

# 206. `notifications.notifications`

```text
id
organization_id
notification_type
recipient_type
customer_id NULL
membership_id NULL
channel
template_revision_id NULL
rendered_subject NULL
rendered_body
status
source_domain
source_id
created_at
```

CHECK ensures appropriate recipient ID.

---

# 207. `notifications.delivery_attempts`

```text
id                  bigint identity PK
organization_id
notification_id
attempt_number
provider
provider_message_id NULL
status
started_at
completed_at NULL
next_retry_at NULL
error_code NULL
```

---

# PART XIX — INTEGRATIONS

# 208. `integrations.integrations`

```text
id
organization_id
provider_code
integration_type
name
status
created_at
updated_at
version
```

---

# 209. `integrations.integration_accounts`

```text
id
organization_id
integration_id
external_account_id NULL
name
status
non_secret_config jsonb
secret_reference NULL
created_at
updated_at
version
```

---

# 210. `integrations.external_entity_mappings`

```text
id
organization_id
integration_account_id
local_entity_type
local_entity_id
external_entity_type
external_entity_id
created_at
```

Unique:

```text
integration_account_id
external_entity_type
external_entity_id
```

---

# 211. `integrations.integration_operations`

Strengthened by stress-test.

```text
id
organization_id
integration_account_id
operation_type
operation_key
local_entity_type
local_entity_id
request_fingerprint
status
external_reference NULL
attempt_count
last_attempt_at NULL
reconcile_after NULL
created_at
updated_at
version
```

---

# 212. External Operation Status

```text
PENDING
SENT
CONFIRMED_SUCCESS
CONFIRMED_FAILURE
UNKNOWN_OUTCOME
RECONCILIATION_REQUIRED
```

---

# 213. Unique Operation Key

```text
integration_account_id
operation_type
operation_key
```

Prevents accidental duplicate external operations.

---

# 214. `integrations.integration_exceptions`

```text
id
organization_id
integration_account_id
integration_operation_id NULL
exception_type
severity
status
summary
details jsonb
created_at
resolved_at NULL
version
```

---

# 215. `integrations.inbound_provider_events`

```text
id
organization_id
integration_account_id
provider_event_id NULL
event_type
payload_hash
raw_payload jsonb
authentication_status
processing_status
received_at
processed_at NULL
```

Unique where provider event ID exists:

```text
integration_account_id
provider_event_id
```

---

# PART XX — OUTBOX

# 216. `platform.outbox_events`

```text
id                  bigint identity PK
event_id            uuid NOT NULL DEFAULT uuidv7()
organization_id     uuid
event_type          text
event_version       integer
aggregate_type      text
aggregate_id        uuid
aggregate_version   bigint NULL
payload             jsonb
occurred_at         timestamptz
created_at          timestamptz
```

Unique:

```text
event_id
```

---

# 217. `platform.event_consumer_receipts`

```text
id                  bigint identity PK
outbox_event_id
consumer_name
status
attempt_count
last_attempt_at NULL
next_retry_at NULL
processed_at NULL
last_error_code NULL
```

Unique:

```text
outbox_event_id
consumer_name
```

---

# 218. Consumer Status

```text
PENDING
PROCESSING
RETRY_WAIT
COMPLETED
DEAD_LETTER
```

---

# PART XXI — JOBS

# 219. `platform.jobs`

Stress-test hardened structure:

```text
id                  uuid PK
organization_id     uuid NULL
queue_name          text NOT NULL
job_type            text NOT NULL
payload_version     integer NOT NULL
payload             jsonb NOT NULL
priority            integer NOT NULL
status              text NOT NULL
initiator_type      text NOT NULL
initiator_id        uuid NULL
authorization_mode  text NOT NULL
available_at        timestamptz NOT NULL
lease_owner         text NULL
lease_expires_at    timestamptz NULL
attempt_count       integer NOT NULL
max_attempts        integer NOT NULL
created_at          timestamptz
started_at          timestamptz NULL
completed_at        timestamptz NULL
last_error_code     text NULL
```

---

# 220. Queue Names

V1:

```text
critical
default
media
analytics
```

Allows workload isolation before separate queue infrastructure exists.

---

# 221. Job Authorization Mode

```text
SYSTEM

REVALIDATE_INITIATOR
```

Examples:

```text
Reservation Expiry
→ SYSTEM

Large Customer Export
→ REVALIDATE_INITIATOR
```

Historical actor context never becomes permanent authorization.

---

# 222. Job Claim Index

Recommended partial index:

```text
(queue_name, priority DESC, available_at, id)
WHERE status IN ('PENDING', 'RETRY_WAIT')
```

Partial indexes are intended specifically for indexing selected row subsets.

---

# 223. Job Claim Query

Conceptually:

```sql
SELECT ...
FROM platform.jobs
WHERE ...
FOR UPDATE SKIP LOCKED
LIMIT ...
```

`SKIP LOCKED` allows competing workers to skip rows already locked, which PostgreSQL explicitly notes can be useful for queue-like consumers.

---

# PART XXII — WEBHOOKS

# 224. `integrations.webhook_endpoints`

```text
id
organization_id
name
endpoint_url
status
secret_reference
api_version
created_at
updated_at
version
```

---

# 225. `integrations.webhook_subscriptions`

```text
endpoint_id
event_type
event_version

PRIMARY KEY (
    endpoint_id,
    event_type,
    event_version
)
```

---

# 226. `integrations.webhook_events`

```text
id
event_id
organization_id
event_type
event_version
resource_type
resource_id
resource_version NULL
payload jsonb
occurred_at
created_at
```

Unique:

```text
event_id
```

---

# 227. `integrations.webhook_deliveries`

```text
id
organization_id
webhook_event_id
webhook_endpoint_id
attempt_number
status
response_status NULL
response_excerpt NULL
started_at
completed_at NULL
next_retry_at NULL
failure_code NULL
```

---

# PART XXIII — AUDIT

# 228. `audit.audit_events`

```text
id                  bigint identity PK
event_id            uuid NOT NULL DEFAULT uuidv7()
organization_id     uuid NULL
actor_type          text NOT NULL
actor_id            uuid NULL
membership_id       uuid NULL
action              text NOT NULL
target_type         text NULL
target_id           uuid NULL
request_id          text NULL
reason              text NULL
before_diff         jsonb NULL
after_diff          jsonb NULL
metadata            jsonb NULL
created_at          timestamptz NOT NULL
```

Unique:

```text
event_id
```

No ordinary update/delete capability.

---

# 229. Audit Indexes

Initial:

```text
(organization_id, created_at DESC)

(organization_id, target_type, target_id, created_at DESC)

(organization_id, actor_id, created_at DESC)

(organization_id, action, created_at DESC)
```

Do not over-index huge JSON metadata.

---

# PART XXIV — SEARCH

# 230. `catalog.product_search_documents`

Derived.

```text
product_id PK
organization_id
publication_status
title
normalized_title
search_text
search_vector
sku_terms
category_ids        uuid[]
collection_ids      uuid[]
tag_ids             uuid[]
occasion_ids        uuid[]
color_ids            uuid[]
attribute_facets     jsonb
availability_state
updated_at
projection_version
```

---

# 231. Search Indexes

Potential:

```text
GIN(search_vector)

GIN(category_ids)

GIN(collection_ids)

GIN(tag_ids)

GIN(color_ids)
```

and trigram indexes for selected normalized title/SKU search where evidence justifies them.

PostgreSQL supports multiple index types including GIN, and its JSON/text-search facilities can use inverted indexing for document-like search.

---

# PART XXV — ANALYTICS

# 232. `analytics.sales_facts`

Grain:

```text
one Order Line
```

```text
id
organization_id
source_order_line_id
order_id
customer_id
product_id
variant_id
primary_category_id NULL
product_type_id NULL
order_date
committed_at
currency_code
quantity
gross_amount
discount_amount
net_amount
refund_attributed_amount
acquisition_cost_amount NULL
gross_margin_amount NULL
projection_version
updated_at
```

Unique:

```text
source_order_line_id
```

---

# 233. `analytics.inventory_daily_snapshots`

```text
organization_id
snapshot_date
inventory_item_id
location_id
sellable_quantity
unavailable_quantity
reserved_quantity
available_to_sell
incoming_quantity
in_transit_quantity

PRIMARY KEY (
    organization_id,
    snapshot_date,
    inventory_item_id,
    location_id
)
```

---

# 234. Other V1 Analytical Tables

```text
analytics.payment_facts

analytics.purchase_facts

analytics.shipment_facts

analytics.expense_facts

analytics.customer_statistics

analytics.product_statistics

analytics.analytics_refresh_runs

analytics.data_quality_results

analytics.metric_snapshots
```

---

# 235. Metric Snapshots

Added as future-close foundation discovered by stress testing.

```text
id
organization_id
metric_key
metric_version
period_start
period_end
reporting_currency NULL
value_json
snapshot_reason
created_at
```

Not accounting close authority.

---

# PART XXVI — CORE FK DELETE POLICY

# 236. Default FK Delete Policy

For historical/business relationships:

```text
ON DELETE RESTRICT
```

or default `NO ACTION`.

---

# 237. Cascade Allowed

Only true composition.

Examples:

```text
uncommitted temporary children

upload-session pieces

safe ephemeral data
```

---

# 238. Never Cascade From

```text
Customer
Product
Supplier
Order
Payment
Location
```

into historical business truth.

---

# PART XXVII — TENANT-SAFE RELATIONSHIP MATRIX

# 239. Mandatory Composite Organization Protection

At minimum enforce tenant-safe FKs for:

```text
Product → Product Type

Variant → Product

Product Category → Product/Category

Inventory Item → Variant

Inventory Level → Inventory Item/Location

Reservation → Order

Reservation Allocation → Order Line/Item/Location

Purchase → Supplier

Purchase Line → Purchase/Variant

Shipment → Location

Shipment Allocation → Purchase Line/Shipment Item

Inbound Receipt → Shipment/Location

Receipt Line → Shipment Item/Inventory Item

Order → Customer

Order Line → Product/Variant

Payment Intent → Order

Payment Allocation → Payment/Order

Review → Product/Customer

Promotion Usage → Customer/Order

Expense → Category

Membership → Organization/User
```

---

# 240. Why This Matters

If an application bug tries:

```text
Org A Order
→ Org B Customer
```

the database itself should reject the relationship instead of relying only on repository filtering.

---

# PART XXVIII — AUTHORITATIVE SOURCE MATRIX

# 241. Inventory

Authority:

```text
Inventory Movement Ledger
+
Reservation Allocations
```

Projection:

```text
Inventory Levels
```

Repair:

```text
rebuild/reconcile Level
```

---

# 242. Cash

Authority:

```text
Finance Transactions
+
Financial Account Entries
```

Projection:

```text
Account Balance
```

---

# 243. Order Payment Summary

Authority:

```text
Payments
Payment Allocations
Refunds
```

Projection:

```text
orders.order_financial_summaries
```

---

# 244. Review Rating

Authority:

```text
Published Review Revisions
```

Projection:

```text
review_summary_projection
```

---

# 245. Promotion Usage Count

Authority:

```text
promotion_usage
```

Projection:

```text
counter/cache if introduced
```

---

# 246. Search

Authority:

```text
Catalog
```

Projection:

```text
product_search_documents
```

---

# 247. Analytics

Authority:

```text
Transactional Domains
```

Projection:

```text
analytics.*
```

---

# PART XXIX — TRANSACTION / LOCKING MATRIX

# 248. Place Order

Lock/revalidate:

```text
Cart / Checkout Session where required

Promotion usage resource

Inventory Level rows

Reservation rows
```

Atomic write:

```text
Order

Order Lines

Discount Allocations

Reservation

Payment Intent

Outbox
```

---

# 249. Inventory Adjustment

Lock:

```text
Inventory Level
```

Write:

```text
Inventory Transaction

Movement Lines

Updated Level

Audit

Outbox
```

---

# 250. Inbound Receipt Posting

Lock:

```text
Receipt

affected Inventory Level rows
```

Write:

```text
Receipt POSTED

Inventory Transaction

Movement Lines

Levels

Acquisition-cost provenance

Outbox
```

---

# 251. Refund

Lock:

```text
Payment / refundable-state records
```

Validate current Refund total.

Create:

```text
Refund
```

before or alongside Integration Operation depending provider workflow.

External call occurs outside long database transaction.

---

# 252. Promotion Usage

Lock:

```text
coupon/promotion usage-cap context
```

then commit Usage with Order.

---

# 253. Customer Merge

Lock:

```text
both Customer records
```

in deterministic ID order.

Validate no existing canonical conflict/cycle.

---

# 254. Number Allocation

Lock:

```text
number_sequences row
```

increment once.

Gaps acceptable.

---

# PART XXX — INDEX BASELINE

# 255. Every Organization-Owned Operational Table

Generally needs:

```text
organization_id
```

as leading component of primary operational indexes.

---

# 256. Orders

```text
(organization_id, created_at DESC)

(organization_id, order_status, created_at DESC)

UNIQUE (
    organization_id,
    order_number
)

(organization_id, customer_id, created_at DESC)
```

---

# 257. Products

```text
(organization_id, status)

UNIQUE (
    organization_id,
    handle
)

UNIQUE (
    organization_id,
    sku_normalized
)
```

SKU actually belongs to Variant table.

---

# 258. Customers

```text
(organization_id, created_at DESC)

(organization_id, normalized phone)

(organization_id, normalized email)
```

through contact tables.

---

# 259. Inventory

```text
UNIQUE (
    organization_id,
    inventory_item_id,
    location_id
)
```

Movement:

```text
(
 organization_id,
 inventory_item_id,
 location_id,
 created_at DESC
)
```

---

# 260. Payments

```text
(organization_id, confirmed_at DESC)

(organization_id, payment_method_id, confirmed_at DESC)

UNIQUE provider transaction index
```

---

# 261. Jobs

Partial pending-job index.

---

# 262. Outbox

Potential partial index:

```text
created_at
WHERE consumer work remains pending
```

depending final consumer receipt implementation.

---

# 263. Partial Index Rule

Only introduce when query predicate matches real operational workload. PostgreSQL partial indexes apply only to table subsets defined by a predicate.

---

# PART XXXI — ROW-LEVEL SECURITY

# 264. V1 Decision

PostgreSQL Row-Level Security remains:

```text
OPTIONAL DEFENSE-IN-DEPTH
```

not foundational authorization authority.

PostgreSQL supports per-table row security policies, with important role/ownership bypass semantics that would need deliberate operational handling.

---

# 265. Primary Tenant Protection

V1 uses:

```text
Server authorization

Organization-scoped repository APIs

Composite tenant-safe FKs

Organization-aware indexes

Cross-org tests
```

RLS can be evaluated in a dedicated ADR later.

---

# PART XXXII — STRESS-TEST REFINEMENTS INCORPORATED

# 266. Incorporated

The schema now explicitly contains:

```text
✓ Unresolved Receipt Item handling

✓ Reservation-expiry race-safe state

✓ Late Payments can remain unallocated

✓ Fulfillment ↔ Reservation Allocation bridge

✓ Supplier Advances through unallocated Supplier Payment

✓ Expense Credits / Adjustments

✓ Order financial summaries explicitly projection-only

✓ Analytics Metric Snapshot foundation

✓ Strong Integration Operation state machine

✓ Integrity Issue framework

✓ Job actor context

✓ System vs user-requested jobs

✓ Queue names

✓ Checkout Session / calculation version

✓ Inventory Integrity Issue state foundation

✓ Repair-command targets

✓ Derived-state source matrix
```

---

# PART XXXIII — IMPORTANT NON-TABLE DECISIONS

# 267. No `stock` Column on Variant

Forbidden:

```text
catalog.product_variants.stock
```

---

# 268. No `paid` Boolean on Order

Forbidden:

```text
orders.orders.is_paid
```

Payment truth derives from allocations.

---

# 269. No `landed_cost` Column as Historical Authority on Variant

Forbidden:

```text
variant.landed_cost
```

Same Variant can have multiple acquisition costs.

---

# 270. No `customer_phone` as Customer Identity Key

Phone remains multiple/non-unique identity signal.

---

# 271. No Giant Order JSON

Order Lines/Amounts/Addresses remain relational.

---

# 272. No Generic `relationships` Table

Important domain relationships remain typed.

---

# 273. No Universal `deleted_at`

Lifecycle semantics remain domain-specific.

---

# 274. No Separate Authoritative `purchase_receipts`

Canonical:

```text
Inbound Receipt
```

Purchase received state is derived.

---

# 275. No Raw Provider Status as Domain State

Provider adapter maps:

```text
raw provider status
→ normalized domain event/status.
```

---

# PART XXXIV — OPEN ADRs BEFORE SQL FREEZE

Only a small number of implementation-level decisions remain.

### ADR-DB-001 — Database Access Library

Candidates to evaluate:

```text
Drizzle
Kysely
Prisma
other typed SQL/query layer
```

Requirements:

```text
Transactions

Raw SQL

Composite keys/FKs

Migrations

PostgreSQL features

Performance visibility
```

---

### ADR-DB-002 — Domain ID Generation

Choose:

```text
PostgreSQL uuidv7()
```

or:

```text
application UUIDv7
```

Both stored as native PostgreSQL `uuid`.

---

### ADR-DB-003 — Database Schema Namespace Tooling

Confirm whether selected migration/ORM tool handles:

```text
catalog.products
inventory.inventory_items
```

cleanly.

Otherwise adopt table prefixes while retaining logical domains.

---

### ADR-DB-004 — Inventory Condition Materialization

Choose exact implementation between:

```text
inventory_levels sellable/unavailable columns
+
condition rows
```

versus:

```text
all condition balances only
+
optimized current projection
```

Recommendation remains hybrid V1 for operational performance.

---

### ADR-DB-005 — Finance Ledger Formalism

Current V1 is:

```text
operational cash-account ledger
```

not statutory double-entry accounting.

Need exact balancing invariant for internal transfers and opening balances.

---

### ADR-DB-006 — Acquisition Cost Consumption

Do **not** decide FIFO/weighted-average accidentally while implementing Order margin.

Define later dedicated costing ADR.

---

# PART XXXV — MIGRATION IMPLEMENTATION ORDER

# 276. Migration Stage 1

```text
platform
iam
audit foundation
```

---

# 277. Migration Stage 2

```text
catalog
sizing
media
```

---

# 278. Migration Stage 3

```text
warehouse
inventory
```

---

# 279. Migration Stage 4

```text
procurement
shipment
receiving
```

---

# 280. Migration Stage 5

```text
landed_cost
acquisition cost
```

---

# 281. Migration Stage 6

```text
customers
cart
checkout
orders
```

---

# 282. Migration Stage 7

```text
payments
finance
```

---

# 283. Migration Stage 8

```text
reviews
promotions
notifications
```

---

# 284. Migration Stage 9

```text
integrations
webhooks
```

---

# 285. Migration Stage 10

```text
outbox
jobs
idempotency
integrity
```

---

# 286. Migration Stage 11

```text
search
analytics
```

---

# PART XXXVI — SCHEMA TEST REQUIREMENTS

# 287. Every Migration Stage Must Test

```text
Fresh database migration

Upgrade migration

Foreign-key integrity

Organization isolation

Unique constraints

Check constraints

Rollback/repair expectations

Indexes exist

Representative query plans
```

---

# 288. Required Database Concurrency Tests

Before production:

```text
Last-unit reservation race

Coupon final-use race

Duplicate Place Order

Duplicate Receipt Post

Duplicate Fulfillment Post

Concurrent Refund

Concurrent Payment Verification

Concurrent Sequence Allocation

Concurrent Customer Merge

Concurrent Job Claim
```

---

# 289. Required Integrity Tests

```text
Org A Order → Org B Customer rejected

Org A Inventory Item → Org B Location rejected

Ledger/Level reconciliation

Payment allocation <= Payment

Refund <= refundable

Receipt posting once

Promotion usage once

Audit rows not cascade-deleted

Search projection disposable

Analytics projection disposable
```

---

# PART XXXVII — DATABASE LAUNCH GATES

# 290. Schema Cannot Be Considered Production Ready If

Any of these remains possible:

```text
Cross-Organization FK linkage

Duplicate Order via retry

Duplicate Receipt stock posting

Duplicate confirmed Provider Payment

Concurrent over-refund

Concurrent stock oversell

Historical Product deletion cascades into Orders

Private Media can be referenced publicly without validation

Unallocated real Payment is lost

Supplier advance requires fake invoice

Inventory Level cannot reconcile to ledger
```

---

# 291. PostgreSQL Specification Definition of Done

Before schema implementation is declared complete:

```text
Every table has owner domain

Every FK has delete behavior

Every money field has currency source

Every projection has source authority

Every critical mutation has locking/idempotency design

Every historical relationship has snapshot policy

Every high-volume table has initial index plan

Every Organization relationship has tenant-isolation review

Every JSONB field has documented schema/purpose

Every repairable projection has rebuild path
```

---

# 292. Result

We now have a relational platform shaped approximately as:

```text
                          ORGANIZATION
                               │
       ┌───────────────────────┼────────────────────────┐
       │                       │                        │
       ▼                       ▼                        ▼
      IAM                    CATALOG                 CUSTOMERS
                               │                        │
                    ┌──────────┼──────────┐             │
                    ▼          ▼          ▼             ▼
                 SIZING      MEDIA     VARIANTS       ORDERS
                                           │             │
                                           ▼             ├──── PAYMENTS
                                      INVENTORY          │
                                           │             ├──── PROMOTIONS
                     PROCUREMENT ─────► SHIPMENT          │
                                           │             ├──── FULFILLMENT
                                           ▼             │
                                     INBOUND RECEIPT     ▼
                                           │           FINANCE
                               ┌───────────┴───────────┐
                               ▼                       ▼
                         INVENTORY LEDGER        LANDED COST

             All committed domains
                      │
                      ▼
                   OUTBOX
             ┌────────┼─────────┐
             ▼        ▼         ▼
        NOTIFY    ANALYTICS   WEBHOOKS
```

---

# 293. Architecture Status

At this point, the **core data model is sufficiently mature to begin implementation planning**.

We no longer have major conceptual uncertainty around:

```text
what Product means

what Variant means

how stock works

how receiving works

how Purchase relates to Shipment

how Landed Cost attaches

how Orders reserve stock

how Payment differs from Order

how Customer identity works

how money/cash differ

how asynchronous work survives failure

how Organization isolation is enforced
```

---

# 294. Recommended Next Document

Do **not** write migrations immediately without defining the actual application boundary that will operate this schema.

Next should be:

```text
docs/architecture/application-service-command-query-architecture.md
```

This should create the **application contract map** between our database/domain model and APIs.

For every important workflow we should formally define commands such as:

```text
CreateProduct
UpdateProduct
PublishProduct

AdjustInventory
StartStocktake
PostStocktake

CreatePurchase
ConfirmPurchase

CreateInboundShipment
PostInboundReceipt

CalculateLandedCost
FinalizeLandedCost

PlaceOrder
CancelOrder
CreateFulfillment
PostFulfillment

SubmitPaymentAttempt
VerifyPayment
CreateRefund

CreateExpense
RecordExpensePayment

MergeCustomers

SubmitReview
ModerateReview

EvaluatePromotion

CreateWebhookEndpoint
RetryIntegrationOperation
```

and queries such as:

```text
GetProductAdminDetail

GetStorefrontProduct

SearchCatalog

GetInventoryAvailability

GetInventoryLedger

GetOrderWorkspace

GetCustomer360

GetPurchaseStatus

GetShipmentReceivingWorkspace

GetPaymentReconciliation

GetFinanceDashboard
```

For each one we should define:

```text
Input

Output

Permission

Transaction boundary

Locks

Idempotency

Domain modules touched

Events emitted

Audit

Error codes

Retry semantics
```

That gives us a **complete implementation map**:

```text
UI
↓
API
↓
Command / Query
↓
Application Service
↓
Domain
↓
PostgreSQL
```

instead of allowing developers/AI agents to invent application behavior while coding controllers.

After that:

```text
Application Service / CQ architecture
→ Concrete API/OpenAPI specification
→ Admin/Storefront information architecture
→ Testing Master Plan
→ Implementation Roadmap
→ Begin migrations/code
```

---

**End of PostgreSQL Schema Specification v0.1**
