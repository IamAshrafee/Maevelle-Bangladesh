# Maevelle Ecommerce — Warehouse & Location Architecture

**Document:** `docs/domains/warehouse/warehouse-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `inventory-architecture.md`, `catalog-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Warehouse & Location domain defines the physical and operational places where business inventory exists or business fulfillment operations occur.

The domain must support much more than:

```text
Warehouse A
Warehouse B
```

A Location may represent:

```text
Main Warehouse
Secondary Warehouse
Showroom
Retail Store
Return Center
3PL / External Fulfillment Center
Temporary Storage
Future Distribution Center
```

Different locations may have completely different responsibilities.

---

# 2. Core Principle

> **A Location is an operational business entity, not simply an address.**

A Location may have:

```text
Inventory

Receiving capability

Fulfillment capability

Transfer capability

Return receiving capability

Operational priority

Availability rules

External fulfillment provider

Business permissions
```

The system must understand these properties explicitly.

---

# 3. Research-Informed Direction

Established commerce systems also separate physical/business locations from inventory and fulfillment records.

Shopify defines Locations as physical places such as warehouses, retail stores and fulfillment centers where inventory can be stocked and orders fulfilled.

Medusa similarly has a dedicated Stock Location domain; locations are associated with inventory levels and can also be connected with fulfillment providers.

Shopify's fulfillment architecture also groups order items around the location expected to fulfill them, reinforcing the need to keep inventory location and fulfillment responsibility explicit.

Maevelle should use the same architectural principle without copying another platform's exact implementation.

---

# 4. Official Terminology

The preferred generic term is:

# Location

A **Warehouse** is one type of Location.

Therefore:

```text
Location
├── Warehouse
├── Showroom
├── Store
├── Return Center
├── 3PL Location
└── Other
```

This keeps the architecture reusable.

---

# 5. Why Not Call Everything Warehouse?

Maevelle may initially operate:

```text
Main Warehouse
Showroom
```

Later:

```text
Dhaka Fulfillment Center
Chattogram Warehouse
Banani Shop
External 3PL
Return Center
```

Calling every one of them a warehouse would create misleading terminology and eventually awkward business logic.

---

# 6. Location Type

A Location may have a descriptive type.

Initial types may include:

```text
WAREHOUSE
SHOWROOM
RETAIL_STORE
FULFILLMENT_CENTER
RETURN_CENTER
THIRD_PARTY
OTHER
```

This primarily describes what the location is.

---

# 7. Type Does Not Define Behavior

This is an important rule.

Do not write logic like:

```text
if location.type == WAREHOUSE:
    can_fulfill = true
```

A Warehouse might intentionally be storage-only.

A Showroom might fulfill online orders.

Therefore:

```text
Location Type
≠
Operational Capabilities
```

---

# 8. Location Capabilities

Capabilities determine what operations are allowed.

Potential capabilities:

```text
STOCK_HOLDING

PURCHASE_RECEIVING

TRANSFER_SEND

TRANSFER_RECEIVE

ORDER_FULFILLMENT

RETURN_RECEIVING

CUSTOMER_PICKUP

INTERNAL_STORAGE
```

Future:

```text
PACKING

CROSS_DOCKING

REPAIR

QUALITY_INSPECTION
```

---

# 9. Example — Main Warehouse

```text
Location:
Maevelle Main Warehouse

Type:
WAREHOUSE

Capabilities:
✓ Stock Holding
✓ Purchase Receiving
✓ Transfer Send
✓ Transfer Receive
✓ Order Fulfillment
✓ Return Receiving
```

---

# 10. Example — Showroom

```text
Location:
Maevelle Showroom

Type:
SHOWROOM

Capabilities:
✓ Stock Holding
✗ Purchase Receiving
✓ Transfer Send
✓ Transfer Receive
✓ Order Fulfillment
✓ Return Receiving
```

---

# 11. Example — Storage Warehouse

```text
Location:
Bulk Storage

Capabilities:
✓ Stock Holding
✓ Purchase Receiving
✓ Transfer Send
✗ Customer Order Fulfillment
```

Stock here exists, but it does not automatically contribute to storefront sellable inventory.

---

# 12. Example — Return Center

```text
Location:
Returns Center

Capabilities:
✓ Stock Holding
✗ Normal Fulfillment
✓ Return Receiving
✓ Transfer Send
```

Returned goods can be inspected there and later transferred elsewhere.

---

# 13. Location Identity

Every Location requires stable technical identity.

Operational fields may include:

```text
Name

Internal Code

Type

Status

Capabilities

Address

Contact Information

Priority

Notes
```

Possible example:

```text
Name:
Dhaka Main Warehouse

Code:
DHK-MAIN
```

---

# 14. Location Code

A short unique business-friendly code should be supported.

Examples:

```text
DHK-MAIN
DHK-SHOW
CTG-WH
RET-DHK
```

This is useful in:

```text
Transfers
Reports
Exports
Inventory lists
Labels
Integrations
```

---

# 15. Location Code Stability

Changing the display name:

```text
Dhaka Main Warehouse
→
Central Distribution Warehouse
```

should not necessarily change:

```text
DHK-MAIN
```

Stable codes are useful operational references.

---

# 16. Address

A Location should have structured address information.

Potential fields:

```text
Address Line
Area
City
Region
Postal Code
Country
```

Do not store the entire address exclusively as one uncontrolled text string if the information may later matter operationally.

---

# 17. Operational Contact

Location may optionally maintain:

```text
Contact Person
Phone
Email
```

Useful for:

```text
Transfers
Courier handoffs
Receiving
External 3PL
```

---

# 18. Location Status

Recommended lifecycle:

```text
DRAFT
ACTIVE
INACTIVE
ARCHIVED
```

---

# 19. Draft Location

A Location may be configured before operational use.

```text
DRAFT
```

should not:

```text
Hold production stock
Receive orders
Participate in allocation
```

until activated.

---

# 20. Active

```text
ACTIVE
```

means the Location is operational.

Its actual allowed activities remain controlled by capabilities.

---

# 21. Inactive

```text
INACTIVE
```

means:

> Do not use this Location for new normal operations.

Existing:

```text
Stock
Transfers
Orders
Inventory history
```

must remain intact.

---

# 22. Archived

An Archived Location is no longer part of normal operations.

Historical transactions must still reference it.

---

# 23. Location Cannot Simply Be Deleted

If Location has:

```text
Inventory
Inventory Movements
Transfers
Orders
Receipts
Returns
```

destructive deletion should normally be prohibited.

Use:

```text
Inactive
Archive
```

instead.

---

# 24. Deactivation Validation

Suppose:

```text
Main Warehouse

Remaining Sellable Stock:
2,430 units

Active Reservations:
42

Incoming Transfers:
3
```

Clicking:

```text
Deactivate
```

must not silently succeed without informing the administrator.

---

# 25. Deactivation Impact Preview

Recommended UX:

```text
This location currently has:

2,430 units on hand
42 reserved units
3 incoming transfers
18 orders assigned for fulfillment

Deactivating it will remove it from
new fulfillment allocation.

Existing operational work still requires resolution.
```

---

# 26. Inventory Relationship

From Inventory Architecture:

```text
Inventory Item
      +
Location
      ↓
Inventory Level
```

Warehouse owns the Location.

Inventory owns the quantities at that Location.

---

# 27. Warehouse Does Not Own Stock Quantity

Avoid:

```text
warehouse.total_stock = 5000
```

as authoritative state.

Warehouse total stock is derived from Inventory Levels.

---

# 28. Location Inventory Summary

Location page can show:

```text
On Hand
Available
Reserved
Damaged
Quarantine
Incoming
In Transit
```

but these originate from Inventory.

---

# 29. Storefront Fulfillment Eligibility

Not every Location containing sellable stock should automatically contribute to storefront availability.

A Location must be:

```text
Active
+
Stock Holding
+
Order Fulfillment Enabled
+
Eligible for the relevant storefront/order
```

before inventory normally participates in storefront allocation.

---

# 30. Example

Inventory:

```text
Main Warehouse       10
Showroom               5
Archive Storage       20
```

If:

```text
Main Warehouse → online fulfillment enabled
Showroom        → online fulfillment enabled
Archive Storage → disabled
```

Storefront may have:

```text
Available Pool = 15
```

not:

```text
35
```

---

# 31. Fulfillment Location

A **Fulfillment Location** is simply an active Location with fulfillment capability.

No completely separate Warehouse record should be needed merely for fulfillment.

---

# 32. Fulfillment Assignment

An Order or Order Line must eventually know:

```text
Which Location is expected to fulfill this quantity?
```

Established commerce systems make this relationship explicit; Shopify's Fulfillment Order represents items expected to be fulfilled from a particular location.

---

# 33. Order Allocation

**Allocation Strategy** answers:

> Which eligible Location should reserve/fulfill an Order?

This is not the same as Inventory availability.

Inventory answers:

```text
Where is stock available?
```

Allocation answers:

```text
Which available location should we use?
```

---

# 34. Allocation Strategies

V1 should support at least:

```text
Manual

Priority-Based
```

Preferably also:

```text
Highest Available Inventory
```

Saleor currently supports allocation strategies including warehouse sorting/priority, validating priority-based warehouse allocation as an established commerce pattern.

---

# 35. Priority-Based Allocation

Example:

```text
Fulfillment Priority

1. Main Warehouse
2. Secondary Warehouse
3. Showroom
```

Order:

```text
Red / M × 2
```

If Main Warehouse has sufficient available inventory:

```text
Assign Main Warehouse
```

---

# 36. Priority Fallback

If:

```text
Main Warehouse:
0

Secondary:
5
```

then:

```text
Secondary Warehouse
```

becomes the source.

---

# 37. Highest-Stock Strategy

Possible strategy:

```text
Main:
3

Secondary:
20

Showroom:
4
```

Choose:

```text
Secondary
```

because it has the highest eligible availability.

This can reduce fragmentation.

---

# 38. Manual Allocation

Authorized staff should be able to explicitly choose:

```text
Fulfill from Showroom
```

when operational reality requires it.

Manual choice must still pass:

```text
Location eligibility
Inventory availability
Permission
```

---

# 39. Allocation Is Not Physical Movement

This distinction is important.

Changing fulfillment assignment:

```text
Main Warehouse
→
Showroom
```

does not mean products physically moved between warehouses.

It means:

> The responsibility/reservation for fulfilling the Order changed.

Physical transfers use the Transfer workflow.

---

# 40. Reservation Reallocation

If an Order reservation is moved:

```text
Main Warehouse reservation
      ↓
release

Showroom reservation
      ↓
create
```

This operation should be controlled and atomic where possible.

---

# 41. Split Fulfillment

Suppose:

```text
Order needs:
5 × Product A
```

Locations:

```text
Main:
3

Secondary:
2
```

The architecture must support:

```text
Main → 3
Secondary → 2
```

Modern commerce platforms also support quantities from one order line being assigned across multiple fulfillment locations.

---

# 42. V1 Split Strategy

The underlying model **must support split fulfillment**.

However, V1 automatic routing can prefer:

> One Location whenever one eligible Location can fulfill the complete requirement.

This keeps operations simpler.

---

# 43. Why Avoid Unnecessary Splitting?

Order:

```text
1 Dress
1 Hat
```

If both can ship from Main Warehouse, creating two shipments unnecessarily:

```text
Main Warehouse → Dress
Showroom       → Hat
```

increases:

```text
Packing work
Courier cost
Tracking complexity
Customer confusion
```

Therefore allocation strategy should consider operational simplicity.

---

# 44. Future Allocation Factors

Advanced routing may later consider:

```text
Warehouse priority

Available stock

Customer destination

Courier coverage

Delivery cost

Delivery speed

Packing capacity

Warehouse workload

Split-shipment avoidance

Stock balancing
```

Not required in V1.

---

# 45. Allocation Engine Boundary

A future Allocation Engine may consume:

```text
Order Requirements
Eligible Locations
Inventory Availability
Warehouse Priority
Fulfillment Rules
```

and produce:

```text
Fulfillment Plan
```

---

# 46. Fulfillment Plan

Example:

```text
Order #10492

Main Warehouse
├── Red Dress / M × 1
└── Hat / Black × 2

Secondary Warehouse
└── Shoe / EU 39 × 1
```

Reservations follow that plan.

---

# 47. Allocation Plan Must Be Revalidated

Inventory can change between:

```text
Plan generation
```

and:

```text
Reservation
```

Therefore actual reservation must remain authoritative.

Planning cannot guarantee stock until Inventory successfully reserves it.

---

# 48. Location Capability — Purchase Receiving

A Location must explicitly support supplier goods receiving.

Example:

```text
Main Warehouse:
PURCHASE_RECEIVING = true

Showroom:
PURCHASE_RECEIVING = false
```

Procurement cannot accidentally receive a container shipment directly into a Location not configured for it.

---

# 49. Purchase Destination

Purchase/Shipment may specify:

```text
Expected Receiving Location:
Main Warehouse
```

Actual receiving can confirm or, with permission, change the destination.

---

# 50. Purchase Arrival Is Not Inventory Receipt

Procurement may say:

```text
Shipment Arrived
```

but Inventory becomes On Hand only when a receiving operation is posted.

This boundary remains important.

---

# 51. Receiving Workflow Boundary

Procurement owns:

```text
What was purchased?
What arrived?
Shipment reference?
Supplier?
```

Warehouse owns:

```text
Where can it be received?
```

Inventory owns:

```text
What quantity was added to this Location?
```

---

# 52. Receiving Session

A future/common UI can create a receiving session:

```text
Shipment:
SH-220

Destination:
Main Warehouse

Expected:
120 units

Received:
118

Damaged:
2
```

But the domain responsibilities remain separated underneath.

---

# 53. Receiving Destination Change

Expected:

```text
Main Warehouse
```

Actual:

```text
Secondary Warehouse
```

should be allowed only with appropriate permission and recorded in history.

---

# 54. Receiving Into Multiple Locations

A single incoming Shipment may eventually be split:

```text
80 units → Main Warehouse
20 units → Showroom
```

The architecture should allow it.

V1 UI may begin with one receiving destination per receiving operation.

---

# 55. Transfer Domain Responsibility

Warehouse owns the **operational Transfer workflow**.

Inventory owns the resulting stock movements.

Conceptually:

```text
Warehouse Transfer
      ↓
Inventory Transactions
```

---

# 56. Transfer

A Transfer represents planned physical movement between Locations.

Example:

```text
Transfer TR-1042

From:
Main Warehouse

To:
Showroom

Items:
Red / M × 5
Black / L × 2
```

---

# 57. Transfer Requirements

A transfer should contain:

```text
Transfer Number

Source Location

Destination Location

Status

Items

Requested Quantities

Dispatched Quantities

Received Quantities

Damaged Quantities

Missing Quantities

Dates

Created By

Notes
```

---

# 58. Source and Destination Validation

Invalid:

```text
Source = Main Warehouse
Destination = Main Warehouse
```

A normal Transfer must connect different Locations.

---

# 59. Capability Validation

Source must allow:

```text
TRANSFER_SEND
```

Destination must allow:

```text
TRANSFER_RECEIVE
```

unless an authorized exceptional workflow exists.

---

# 60. Transfer Lifecycle

Recommended V1 lifecycle:

```text
DRAFT
   ↓
READY
   ↓
DISPATCHED
   ↓
IN_TRANSIT
   ↓
RECEIVED
```

Alternatives:

```text
CANCELLED
PARTIALLY_RECEIVED
EXCEPTION
```

---

# 61. Draft Transfer

Draft means:

> Planned but not yet committed.

Normally no physical quantity moves.

---

# 62. Ready

Ready means:

> Transfer has been approved/prepared for dispatch.

Stock may now need to be held from customer Orders.

Recommended:

```text
Create internal Transfer Reservation/Hold
```

so it cannot be sold while staff prepares dispatch.

---

# 63. Transfer Hold

Example:

```text
Main Warehouse

Available:
20

Transfer Ready:
5
```

Customer-order availability should become:

```text
15
```

even though all 20 remain physically present until dispatch.

---

# 64. Dispatch

At actual dispatch:

```text
Source On Hand:
-5

In Transit:
+5
```

The previous Transfer hold is consumed/released appropriately.

---

# 65. In Transit

The goods physically belong to the business but are currently between Locations.

They should not appear as normal on-hand stock in either endpoint.

---

# 66. Receiving

Destination staff confirms what physically arrived.

Example:

```text
Expected:
5

Received:
5
```

Inventory:

```text
Transit -5
Destination Sellable +5
```

or Quarantine depending on receiving policy.

---

# 67. Partial Transfer Receipt

Sent:

```text
10
```

First receipt:

```text
7
```

Remaining:

```text
3 still in transit
```

Transfer should support partial receiving rather than forcing all-or-nothing completion.

---

# 68. Transfer Variance

Sent:

```text
10
```

Received final:

```text
9
```

The remaining:

```text
1
```

becomes a Transfer discrepancy.

It must not disappear.

---

# 69. Transfer Discrepancy Reasons

Potential reasons:

```text
Missing in Transit
Lost
Damaged
Packing Error
Quantity Error
Other
```

---

# 70. Damage During Transfer

Example:

```text
Sent:
10

Received:
9 Sellable
1 Damaged
```

Transfer can complete while Inventory posts:

```text
Destination Sellable +9
Destination Damaged  +1
```

---

# 71. Transfer Over-Receipt

Sent:

```text
10
```

Destination counts:

```text
11
```

Do not silently accept.

Possible workflow:

```text
Flag discrepancy
Require recount
Allow controlled variance resolution
```

---

# 72. Transfer Cancellation

Cancellation rules depend on state.

### Draft

Can normally be cancelled.

### Ready

Release Transfer hold.

### Dispatched

Cannot simply cancel physical transit.

Requires:

```text
Return Transfer
or
Exception Resolution
```

---

# 73. Transfer Reversal

If goods must return:

```text
Showroom
→
Main Warehouse
```

create another Transfer rather than editing history.

---

# 74. Transfer Number

Transfers need human-readable references.

Example:

```text
TR-2026-00142
```

Numbering strategy will later be centralized.

---

# 75. Transfer Timeline

Transfer detail should show:

```text
Created
Ready
Dispatched
Partially Received
Received
Variance Resolved
```

with actors and timestamps.

---

# 76. Transfer Notes

Support:

```text
Internal operational notes
```

Potential future:

```text
Packaging notes
Courier/transport information
```

---

# 77. Transfer Attachments — Preferred

Documents/images may include:

```text
Dispatch Sheet
Packing Photo
Transport Receipt
Damage Photo
```

using Media/Attachments infrastructure.

---

# 78. Transport Information

V1 may optionally record:

```text
Transport Method
Driver / Carrier
Reference
Expected Arrival
```

without implementing a full logistics provider system.

---

# 79. Transfer List UX

Useful columns:

```text
Transfer
From
To
Status
Items
Quantity
Created
Dispatched
Expected
```

---

# 80. Transfer Filters

```text
Status
Source
Destination
Date
Overdue
Has Variance
```

---

# 81. Transfer Detail UX

Recommended:

```text
Transfer Summary

Items

Dispatch

Receiving

Variance

Timeline

Notes / Attachments
```

---

# 82. Location Fulfillment Priority

Each fulfillment-enabled Location should be configurable in routing priority.

Example:

```text
1 Main Warehouse
2 Secondary Warehouse
3 Showroom
```

Priority should be explicit rather than depending on record creation order.

---

# 83. Priority Scope

V1 can use one business-wide fulfillment priority.

Future:

```text
Per storefront
Per region
Per shipping method
Per channel
```

may become possible.

---

# 84. Default Location

Business settings may define:

```text
Default Warehouse
```

for appropriate workflows.

But defaults must not become hidden architectural assumptions.

---

# 85. Default Receiving Location

Possible:

```text
Default Purchase Receiving Location:
Main Warehouse
```

Procurement forms can preselect it.

---

# 86. Default Return Location

Possible:

```text
Default Return Location:
Main Warehouse
```

or future dedicated Return Center.

---

# 87. Location-Specific Inventory Policies

Potential policies:

```text
Allow Overselling?

Safety Stock Defaults

Low Stock Defaults

Fulfillment Enabled?
```

However too many duplicated settings can become confusing.

V1 should keep global defaults plus item-level overrides only where needed.

---

# 88. Location-Specific Product Restrictions — Future

Future:

```text
Location only handles:
Apparel
```

or:

```text
Hazardous category not supported
```

Not necessary in Maevelle V1.

---

# 89. Service Area — Future

A Location may eventually fulfill only particular customer destinations.

Example:

```text
Dhaka Fulfillment Center
→ Dhaka Metro

Chattogram Warehouse
→ Chattogram Region
```

Medusa similarly models fulfillment/shipping options with geographic service zones, showing why geography-aware fulfillment can become useful at larger scale.

V1 does not need a sophisticated routing-by-geography engine.

---

# 90. Third-Party Location

Future businesses may use:

```text
External 3PL Warehouse
```

That Location may be:

```text
Stock Holding
Order Fulfillment
Externally Managed
```

---

# 91. Managed By

Foundation field:

```text
Management:
INTERNAL
EXTERNAL
```

or equivalent.

This prepares for 3PLs without implementing full integration.

---

# 92. External Inventory Authority — Future

For a 3PL Location:

```text
Maevelle system
```

may not be the direct quantity authority.

Future configuration may specify:

```text
Inventory Authority:
EXTERNAL_PROVIDER
```

Synchronization architecture would be required.

Not V1.

---

# 93. External Fulfillment Provider

A Location may later connect with:

```text
Fulfillment Provider
Courier Integration
3PL
```

Medusa likewise associates stock locations with fulfillment providers.

---

# 94. Warehouse vs Courier

Courier is not a Warehouse.

Courier integration handles transportation/last-mile delivery.

Warehouse handles:

```text
Where inventory is stored
Where order is prepared
```

A courier later handles:

```text
Moving fulfillment to customer
```

Keep those domains separate.

---

# 95. Picking — Future

V1 fulfillment may simply show:

```text
Items to prepare
```

Later warehouse operations may introduce:

```text
Pick List
Picker Assignment
Picked Quantity
```

---

# 96. Packing — Future

Future:

```text
Picked
→
Packing
→
Packed
→
Courier Handoff
```

This belongs to Delivery/Fulfillment/Warehouse operations.

V1 need not become a full WMS.

---

# 97. Bin / Shelf Locations — Future

Large warehouses may need:

```text
Warehouse
└── Zone A
    └── Rack 4
        └── Shelf 2
            └── Bin B
```

This is **sub-location inventory placement**, different from business-level Stock Locations.

---

# 98. Do Not Model Bins as Warehouses

Avoid creating:

```text
Warehouse: Rack A
Warehouse: Rack B
Warehouse: Shelf 1
```

That would destroy reporting and fulfillment semantics.

Future internal storage hierarchy should be separate.

---

# 99. Future Storage Hierarchy

Potential:

```text
Stock Location
   ↓
Zone
   ↓
Aisle
   ↓
Rack
   ↓
Bin
```

Inventory may later track exact placement.

Not V1.

---

# 100. Warehouse Capacity — Future

Potential metrics:

```text
Storage Capacity
Volume
Weight
Bin Occupancy
```

Could inform receiving/routing later.

Not required now.

---

# 101. Location Operating Hours — Future

Relevant for:

```text
Customer Pickup
Same-Day Fulfillment
Courier Collection
```

Foundation can allow future operating schedules without building them now.

---

# 102. Customer Pickup — Future

A Showroom might later support:

```text
Pick up from store
```

This requires:

```text
Customer Pickup capability
Availability at Location
Pickup preparation
Pickup notification
```

The Location architecture already supports this direction.

---

# 103. Returns Capability

Not every Location should automatically accept customer returns.

Example:

```text
Main Warehouse:
Return Receiving ✓

Showroom:
Return Receiving ✓

External Storage:
Return Receiving ✗
```

---

# 104. Return Destination

Order Return workflow can determine:

```text
Return to Main Warehouse
```

Inventory changes happen only after actual receipt.

---

# 105. Location-Specific Permissions

A future employee may need access only to:

```text
Showroom
```

not:

```text
Main Warehouse
```

Therefore our access architecture should eventually support permission scopes.

---

# 106. Foundation Permission Model

Example future policy:

```text
inventory.view
Scope:
Showroom

inventory.adjust
Scope:
Showroom
```

This was anticipated in our access requirements.

V1 may begin with global capabilities if staff structure is simple, but architecture should not block scoped permissions.

---

# 107. Warehouse Manager Preset

A permission preset might contain:

```text
inventory.view
inventory.adjust
transfer.create
transfer.dispatch
transfer.receive
stocktake.create
```

but presets remain collections of permissions, not fundamental fixed roles.

---

# 108. Receiving Staff Preset

Could have:

```text
purchases.view_receiving
inventory.receive
transfer.receive
```

without:

```text
expenses.view
landed_cost.edit
selling_price.edit
```

---

# 109. Financial Information Separation

Warehouse users do not necessarily need to see:

```text
Supplier unit price
Shipment cost
Landed cost
Margin
```

Location/Inventory screens should support permission-sensitive financial visibility.

---

# 110. Location Activity

Location detail should provide recent operational activity.

Example:

```text
Purchase Received
Transfer Dispatched
Transfer Received
Inventory Adjustment
Order Fulfilled
Return Received
```

---

# 111. Location Dashboard

Potential page:

```text
Dhaka Main Warehouse

Available Stock        4,280
Reserved                 284
Incoming                  610
Damaged                    18
Low Stock SKUs             43

Open Transfers
Pending Receipts
Orders To Fulfill
Recent Adjustments
```

The exact metrics come from corresponding domains.

---

# 112. Location List

Recommended columns:

```text
Location
Code
Type
Status
Inventory
Fulfillment
Receiving
Open Transfers
Updated
```

---

# 113. Location Filters

```text
Active / Inactive
Type
Stock Holding
Fulfillment Enabled
Purchase Receiving
Return Receiving
```

---

# 114. Cross-Location Inventory View

A powerful inventory matrix should be available:

```text
SKU             Main WH    Showroom    Secondary    Total

RED-S              10          3            2         15
RED-M               8          1            4         13
RED-L               2          0            6          8
```

with states available on drill-down.

---

# 115. Cross-Location Transfer Shortcut

From Inventory:

```text
Main Warehouse:
30

Showroom:
0
```

user may choose:

```text
Transfer Stock
```

The system opens a Transfer prefilled with relevant Item and source.

This is good contextual UX.

---

# 116. Cross-Linking

Warehouse should cross-link naturally with:

```text
Inventory
Purchases
Incoming Shipments
Transfers
Orders
Returns
Audit
```

Users should not have to manually copy identifiers between modules.

---

# 117. Breadcrumb Example

```text
Operations
→ Locations
→ Main Warehouse
→ Transfers
→ TR-1042
```

---

# 118. Location Creation UX

Recommended structure:

```text
Basic Information

Address

Capabilities

Fulfillment

Receiving

Inventory Settings

Advanced
```

Do not expose every future setting by default.

---

# 119. Sensible Location Presets

When selecting:

```text
Type:
Warehouse
```

the UI may suggest:

```text
Stock Holding ✓
Purchase Receiving ✓
Transfer Send ✓
Transfer Receive ✓
Order Fulfillment ✓
```

but the merchant can modify them.

Type provides defaults, not hard rules.

---

# 120. Location Activation Validation

Before Activation:

```text
Name exists

Code valid

Address appropriate

At least one useful capability

Required operational settings valid
```

---

# 121. Warehouse Settings vs Global Settings

Avoid repeating the entire business settings configuration on each Warehouse.

Location settings should exist only where behavior genuinely differs.

---

# 122. Timezone

Initial Maevelle locations will likely share the business timezone.

But the data model should preserve globally correct timestamps.

Future multi-region Locations may have local timezone configuration.

Not necessary to expose complicated timezone controls in V1 unless needed.

---

# 123. Audit Events

Important Warehouse events:

```text
location.created
location.activated
location.deactivated
location.capabilities_changed
location.fulfillment_priority_changed

transfer.created
transfer.ready
transfer.dispatched
transfer.partially_received
transfer.received
transfer.cancelled
transfer.variance_recorded
```

---

# 124. Audit Questions

The system should answer:

```text
Who deactivated this Location?

Who changed its fulfillment capability?

Who dispatched this Transfer?

Who confirmed receipt?

Why did received quantity differ?
```

---

# 125. Transfer Idempotency

Operations such as:

```text
Dispatch Transfer
Receive Transfer
```

must be idempotency-safe.

Retrying:

```text
Receive Transfer
```

must not double inventory.

---

# 126. Transfer Concurrency

Two employees may try to dispatch the same Transfer.

Only one valid dispatch should affect inventory.

State transition must use concurrency protection.

---

# 127. Transfer Inventory Validation

At dispatch:

```text
Requested:
5

Available:
3
```

The system cannot dispatch five sellable units unless policy explicitly resolves the shortage.

---

# 128. Partial Dispatch

V1 should support or leave clear room for:

```text
Requested:
10

Dispatched:
8
```

remaining two may stay pending or be removed/adjusted intentionally.

---

# 129. Transfer State Validation

Invalid:

```text
RECEIVED
→
DRAFT
```

without a formal correction workflow.

Transfer lifecycle transitions must be controlled.

---

# 130. Transfer Source History

Once dispatched, source Location cannot simply be edited:

```text
Main Warehouse
→
Showroom
```

because inventory already physically moved.

Use correction workflows.

---

# 131. Transfer Destination Change

Before dispatch:

```text
Main → Showroom
```

may potentially be edited.

After dispatch, changing destination should require a controlled redirect/exception workflow.

---

# 132. Location Allocation Failure

Suppose routing chooses:

```text
Main Warehouse
```

but reservation fails due to concurrent purchase.

The allocation process should:

```text
Retry another eligible Location
```

where policy permits.

It should not oversell.

---

# 133. Allocation Candidate Evaluation

Conceptually:

```text
Find Eligible Locations
        ↓
Query Authoritative Availability
        ↓
Apply Strategy
        ↓
Attempt Reservation
        ↓
Success?
  ┌─────┴─────┐
 Yes          No
  │            │
Use plan     Retry next candidate
```

---

# 134. Location Eligibility Is Dynamic

A Location may become unavailable because:

```text
Deactivated
Fulfillment disabled
Inventory exhausted
Temporary operational block
```

therefore allocation must evaluate current conditions.

---

# 135. Operational Block — Preferred

Beyond fully deactivating a Location, future/V1-preferred setting:

```text
Pause Fulfillment
```

may be useful.

Example:

```text
Warehouse inventory still valid

Receiving still allowed

New Orders temporarily not assigned
```

This is better than deactivating the whole Location.

---

# 136. Capability-Specific Pause

Potential:

```text
Fulfillment:
PAUSED

Receiving:
ACTIVE

Transfers:
ACTIVE
```

This gives more operational control.

Could be implemented using capability enabled/disabled state.

---

# 137. Maintenance Scenario

Main Warehouse experiences:

```text
Power issue
Flood
System maintenance
Staff shortage
```

Business should be able to stop new allocation without corrupting inventory.

---

# 138. Order Reassignment

Orders already assigned to a paused Location should be visible as exceptions.

Staff may:

```text
Keep Assignment
or
Reassign
```

depending on fulfillment status.

---

# 139. Cannot Reassign Fulfilled Quantity

Once stock physically left:

```text
Fulfilled
```

reassignment cannot simply rewrite warehouse identity.

Historical fulfillment remains linked to original Location.

---

# 140. Partial Fulfillment

Order:

```text
Dress × 2
Hat × 1
```

Main Warehouse fulfills:

```text
Dress × 1
```

Remaining lines may later be assigned elsewhere.

Warehouse architecture must support fulfillment responsibility at quantity/line level rather than only:

```text
order.warehouse_id
```

---

# 141. Avoid `order.warehouse_id`

A single warehouse field on Order would become inadequate for:

```text
Split fulfillment
Partial fulfillment
Reassignment
Multiple shipments
Returns
```

Fulfillment assignments must be modeled separately.

---

# 142. Fulfillment Assignment Is Not Inventory Transfer

Again:

```text
Order assignment
```

changes responsibility/reservation.

```text
Transfer
```

changes physical location of inventory.

Never merge these concepts.

---

# 143. Allocation Strategy Configuration

Business Settings may contain:

```text
Default Fulfillment Strategy:
PRIORITY

Allow Split Fulfillment:
Yes

Prefer Single Location:
Yes
```

Exact options can grow later.

---

# 144. Future Cost-Aware Allocation

Potential future algorithm:

```text
Main Warehouse:
Courier cost ৳120

Secondary:
Courier cost ৳70
```

choose Secondary when appropriate.

Not V1.

---

# 145. Future Distance-Aware Allocation

Potential:

```text
Customer:
Chattogram

Chattogram Warehouse:
available

Dhaka:
available
```

route Chattogram locally.

Requires geographic fulfillment architecture.

Not V1.

---

# 146. Future SLA-Aware Allocation

Could consider:

```text
Same-day capability
Cutoff times
Warehouse workload
Courier schedule
```

Not required now.

---

# 147. Future Stock Balancing

Potential goal:

```text
Don't consume the last Showroom unit
while Main Warehouse has 40.
```

Allocation engine may later consider stock-balancing policy.

Priority-based V1 already provides basic control.

---

# 148. Future Replenishment Transfers

System might eventually recommend:

```text
Showroom has 1 unit

Target:
10

Main Warehouse:
50

Recommended Transfer:
9
```

Not part of V1.

---

# 149. Future Automatic Transfers

Advanced operations may automatically propose or create Transfers based on:

```text
Stock threshold
Demand
Warehouse target
```

Requires approval/policy controls.

Not V1.

---

# 150. Future Internal WMS Layer

At larger scale:

```text
Warehouse
│
├── Receiving
├── Putaway
├── Bin Management
├── Replenishment
├── Picking
├── Packing
├── Dispatch
└── Cycle Counting
```

could become its own sophisticated module.

Current architecture deliberately leaves room for it without forcing WMS complexity into V1.

---

# 151. API Responsibilities

Location APIs should support:

```text
Create Location

Update Location

Activate / Deactivate

Manage Capabilities

Configure Fulfillment Priority

Query Location
```

Transfer application APIs:

```text
Create Transfer

Update Draft

Mark Ready

Dispatch

Receive

Record Variance

Cancel where valid
```

---

# 152. Allocation API

Conceptual application operation:

```text
planFulfillment(orderRequirements)
```

returns candidate/selected Locations.

Authoritative Inventory reservations still occur through Inventory.

---

# 153. Location Read API

Should support:

```text
Pagination
Search
Type filtering
Capability filtering
Status filtering
```

---

# 154. Transfer Read API

Should support:

```text
Search by transfer number

Source filter

Destination filter

Status

Date range

Variance filter
```

---

# 155. Structured Transfer Errors

Examples:

```text
INVALID_TRANSFER_STATE

SAME_SOURCE_DESTINATION

SOURCE_CANNOT_TRANSFER

DESTINATION_CANNOT_RECEIVE

INSUFFICIENT_INVENTORY

TRANSFER_ALREADY_DISPATCHED

TRANSFER_ALREADY_RECEIVED

RECEIVED_QUANTITY_EXCEEDS_ALLOWED

UNRESOLVED_VARIANCE
```

---

# 156. Location Domain Events

Potential:

```text
location.created

location.updated

location.activated

location.deactivated

location.fulfillment_paused

location.fulfillment_resumed
```

Transfer events:

```text
transfer.created

transfer.ready

transfer.dispatched

transfer.received

transfer.variance_detected
```

---

# 157. Consumers

These events may update:

```text
Inventory

Notifications

Analytics

Order Allocation

Webhooks

Operational dashboards
```

---

# 158. Warehouse Analytics

V1 reporting should support useful metrics such as:

```text
Inventory by Location

Available Stock by Location

Incoming Stock

Damaged Stock

Transfer Volume

Transfer Variances

Orders Fulfilled by Location
```

Later:

```text
Fulfillment Speed

Picking Productivity

Inventory Accuracy

Warehouse Cost

Stock Turnover by Location
```

---

# 159. Location Activity Metrics

Example:

```text
Main Warehouse

Orders Fulfilled Today:
82

Units Received:
450

Transfers Out:
3

Transfers In:
1

Adjustments:
2
```

Useful operational dashboard information.

---

# 160. Transfer Performance — Future

Future:

```text
Average Transfer Time

Transfer Accuracy

Damage Rate

Loss Rate
```

---

# 161. Warehouse Business Questions

The system should eventually answer:

```text
Where does Product X currently exist?

Which Location can fulfill Order Y?

Why did Showroom stock decrease?

What is moving to Showroom?

What has not arrived yet?

Which Transfers have discrepancies?

Which Warehouse has most stock?

Which Location has damaged items?

Which Locations are fulfilling online orders?

Who received Transfer TR-1002?
```

---

# 162. Important Invariants

### WH-INV-001

Every Location belongs to one Organization.

### WH-INV-002

Location Code follows business uniqueness policy.

### WH-INV-003

Location Type does not alone determine operational capability.

### WH-INV-004

Inactive Locations do not participate in new normal fulfillment allocation.

### WH-INV-005

Deactivating a Location does not destroy its Inventory or history.

### WH-INV-006

Inventory at a non-fulfillment Location does not automatically become storefront sellable availability.

### WH-INV-007

Order fulfillment assignment and physical inventory transfer are separate concepts.

### WH-INV-008

A Transfer must have different source and destination Locations.

### WH-INV-009

Transfer source must be operationally eligible to dispatch.

### WH-INV-010

Transfer destination must be operationally eligible to receive.

### WH-INV-011

A Draft Transfer does not mean goods physically moved.

### WH-INV-012

Dispatched goods cannot remain ordinary On Hand at the source.

### WH-INV-013

Goods in transit are not ordinary On Hand at the destination until received.

### WH-INV-014

Transfer receipt must use actual received quantity.

### WH-INV-015

Transfer discrepancies must remain traceable.

### WH-INV-016

Transfer dispatch/receipt cannot be applied twice.

### WH-INV-017

Fulfillment allocation cannot guarantee Inventory until reservation succeeds.

### WH-INV-018

Split fulfillment must be structurally possible.

### WH-INV-019

Fulfillment responsibility must not be modeled solely as one `warehouse_id` on an Order.

### WH-INV-020

Warehouse quantities remain owned by Inventory.

---

# 163. V1 Mandatory Scope

V1 Production Core includes:

```text
✓ Generic Location entity

✓ Location Types

✓ Location Codes

✓ Addresses

✓ Active / Inactive lifecycle

✓ Operational capabilities

✓ Stock-holding configuration

✓ Purchase-receiving configuration

✓ Transfer send/receive configuration

✓ Order fulfillment configuration

✓ Return receiving configuration

✓ Multiple Locations

✓ Location inventory summaries

✓ Fulfillment eligibility

✓ Fulfillment priority

✓ Manual allocation

✓ Priority-based allocation

✓ Split-fulfillment-compatible architecture

✓ Transfer creation

✓ Transfer lifecycle

✓ Transfer holds/reservations

✓ Dispatch

✓ In Transit

✓ Partial Receiving

✓ Transfer discrepancies

✓ Damage handling

✓ Transfer cancellation rules

✓ Transfer timeline

✓ Warehouse permissions

✓ Audit integration

✓ Idempotency

✓ Concurrency protection

✓ Location search/filtering

✓ Transfer search/filtering

✓ Warehouse analytics fundamentals

✓ Inventory cross-linking
```

---

# 164. Preferred V1 Enhancements

Strongly preferred:

```text
Highest-stock allocation strategy

Fulfillment pause/resume

Transfer attachments

Transport reference

Inventory matrix across locations

Warehouse dashboard

Large transfer warnings

Location-specific permission scope foundation
```

---

# 165. Foundation Only

Prepare architecture now for:

```text
3PL Locations

External inventory authority

Customer pickup

Geographic service areas

Location-specific shipping methods

Return centers

Warehouse sublocations

Bins / racks / shelves

Warehouse operating hours

Complex routing strategies
```

---

# 166. Deferred Advanced Capabilities

Post-V1:

```text
Barcode receiving

Barcode picking

Bins

Zones

Aisles

Racks

Putaway

Pick lists

Pick waves

Packing stations

Shipping stations

Cycle-count scheduling

Automatic replenishment

Warehouse capacity planning

Worker task assignments

3PL synchronization

Cost-based routing

Distance-based routing

SLA routing

Advanced stock balancing

WMS-level optimization
```

---

# 167. Decisions Established

### Decision W-001

**Location is the generic domain concept; Warehouse is a Location type.**

### Decision W-002

**Location Type and Location Capability are separate concepts.**

### Decision W-003

**Capabilities control operational behavior.**

### Decision W-004

**Inventory quantities remain owned by Inventory, not Warehouse.**

### Decision W-005

**A Location holding inventory does not automatically participate in storefront fulfillment.**

### Decision W-006

**Fulfillment-enabled Locations form the candidate pool for Order allocation.**

### Decision W-007

**V1 supports manual and priority-based fulfillment allocation.**

### Decision W-008

**The model supports split fulfillment even when V1 prefers one-location fulfillment.**

### Decision W-009

**Order fulfillment assignment is separate from physical Inventory Transfer.**

### Decision W-010

**Fulfillment responsibility cannot be modeled as one simple `warehouse_id` on Order.**

### Decision W-011

**Purchase receiving requires an eligible destination Location.**

### Decision W-012

**Warehouse owns Transfer workflow; Inventory owns resulting quantity movement.**

### Decision W-013

**Transfers have a lifecycle rather than instantly subtracting/adding stock.**

### Decision W-014

**Approved/ready transfer quantities should become unavailable to ordinary sales before physical dispatch where required.**

### Decision W-015

**Dispatched inventory enters Transit.**

### Decision W-016

**Receiving uses actual quantity, not expected quantity.**

### Decision W-017

**Partial receipt and discrepancies are first-class scenarios.**

### Decision W-018

**Transfer correction uses additional controlled operations rather than historical rewriting.**

### Decision W-019

**Location deactivation preserves historical records and remaining stock.**

### Decision W-020

**Fulfillment allocation remains subject to authoritative Inventory reservation.**

### Decision W-021

**Location-specific scoped permissions remain a future-ready requirement.**

### Decision W-022

**Bins/racks/shelves will not be represented as independent Warehouses.**

### Decision W-023

**The architecture remains suitable for future 3PL/external fulfillment Locations.**

---

# 168. Resulting Operational Model

We now have:

```text
                         ORGANIZATION
                              │
                      ┌───────┴────────┐
                      │                │
                  LOCATION          LOCATION
                  Main WH           Showroom
                      │                │
               Capabilities       Capabilities
                      │                │
               Inventory Levels   Inventory Levels
                      │
                      │
                  Fulfillment
                   Candidate
                      │
                      ▼
                    ORDER
```

Transfers operate independently:

```text
MAIN WAREHOUSE
      │
      │ Transfer Ready
      │
      ▼
Inventory Held
      │
      │ Dispatch
      ▼
   IN TRANSIT
      │
      │ Receive
      ▼
   SHOWROOM
```

Order allocation:

```text
Order Requirement
      ↓
Eligible Locations
      ↓
Availability
      ↓
Allocation Strategy
      ↓
Fulfillment Plan
      ↓
Inventory Reservation
      ↓
Fulfillment
```

This gives Maevelle a real multi-location operational foundation rather than simply:

```text
warehouse_id
+
stock
```

---

# 169. Next Domain

We now have:

```text
Catalog
      ↓
Variant

Inventory
      ↓
Inventory Item
      ↓
Inventory Level

Warehouse
      ↓
Location
```

The next question is:

> **How does inventory enter the business in the first place?**

The next deep document should therefore be:

```text
docs/domains/procurement/procurement-architecture.md
```

That architecture should define:

```text
Supplier

Supplier Contacts

Supplier Product Mapping

Supplier Variant Mapping

Purchase / Purchase Order

Purchase Items

Purchase Currency

Supplier Unit Cost

Ordered Quantity

Supplier Size / Color References

Purchase Lifecycle

Supplier Payments

Deposits

Outstanding Supplier Balance

Partial Purchase Payment

Purchase Attachments

Purchase Amendments

Purchase Cancellation

Partial Supplier Fulfillment

Expected Inventory

Purchase → Shipment relationship

One Purchase across Multiple Shipments

Multiple Purchases consolidated into one Shipment

Receiving relationship

Purchase History

Procurement permissions

Auditability

Multi-currency implications
```

After Procurement, we should immediately design:

```text
Incoming Shipment Architecture
```

and then:

```text
Landed Cost & Cost Allocation Architecture
```

Those three together will complete the path:

```text
SUPPLIER
   ↓
PURCHASE
   ↓
INCOMING SHIPMENT
   ↓
SHARED EXPENSES
   ↓
LANDED COST
   ↓
RECEIVING
   ↓
WAREHOUSE
   ↓
INVENTORY
```

Only after that chain is deeply understood should we start thinking seriously about database tables for this part of the platform.

---

**End of Warehouse & Location Architecture v0.1**
