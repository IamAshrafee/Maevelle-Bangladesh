# Maevelle Ecommerce — Inbound Shipment & Consolidation Architecture

**Document:** `docs/domains/shipment/inbound-shipment-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `procurement-architecture.md`, `inventory-architecture.md`, `warehouse-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Inbound Shipment domain defines how goods physically move from suppliers or consolidation points toward Maevelle-controlled inventory Locations.

It must support real importing scenarios such as:

```text
Supplier A ─┐
Supplier B ─┼──► China Consolidation Warehouse
Supplier C ─┘
                    ↓
            Consolidated Shipment
                    ↓
                 China Port
                    ↓
             International Freight
                    ↓
              Bangladesh Port
                    ↓
                  Customs
                    ↓
              Local Transport
                    ↓
             Maevelle Warehouse
```

The system must know:

- what goods are traveling;
- which Purchases those goods belong to;
- which Suppliers they came from;
- how quantities were consolidated;
- how goods are physically grouped;
- where they currently are;
- what stage they have reached;
- which logistics providers are involved;
- when each stage is expected;
- when each stage actually occurred;
- what documents exist;
- what shipment-level expenses exist;
- whether goods were lost, delayed or damaged;
- what quantities finally arrived;
- which Warehouse receives them.

---

# 2. Core Principle

> **Purchase and Shipment represent different realities.**

Purchase:

```text
What did Maevelle agree to buy?
```

Shipment:

```text
How are those physical goods traveling?
```

Therefore:

```text
Purchase ≠ Shipment
```

A Purchase can participate in several Shipments.

A Shipment can contain goods from several Purchases and several Suppliers.

---

# 3. Another Core Principle

> **Shipment, Package/Container, Journey Leg and Receipt are separate concepts.**

Conceptually:

```text
Inbound Shipment
     │
     ├── Shipment Items
     │
     ├── Physical Packages / Containers
     │
     ├── Journey Legs
     │
     ├── Tracking
     │
     ├── Documents
     │
     └── Expenses
             │
             ▼
          Arrival
             │
             ▼
          Receipt
             │
             ▼
         Inventory
```

Mature inbound-logistics systems similarly track journeys through multiple legs and can track containers separately before final receipt. Microsoft Dynamics, for example, models voyages, containers, journey activities/legs, estimated and actual dates, and goods in transit separately from final warehouse receipt.

---

# 4. Domain Responsibilities

Inbound Shipment owns:

```text
Inbound Shipments

Shipment Items

Purchase-Line Shipment Allocations

Consolidation

Physical Packages

Cartons

Containers

Shipment Legs

Transport Modes

Logistics Providers

Tracking References

Origin / Destination

Transit Locations

Estimated Dates

Actual Dates

Shipment Status

Customs / Clearance Status

Shipment Documents

Shipment Exceptions

Weight

Volume

Chargeable Weight

Shipment Expense References

Arrival Information
```

---

# 5. Shipment Does Not Own

Shipment does not own:

```text
Supplier Purchase Agreement

Supplier Invoice

Supplier Payment

Warehouse Inventory Balance

Customer Order

Final Landed Cost Allocation

General Business Expenses
```

It integrates with those domains.

---

# 6. Official Terminology

Preferred terminology:

```text
Inbound Shipment
Shipment Item
Shipment Allocation
Package
Carton
Container
Shipment Leg
Journey
Logistics Provider
Tracking Reference
Shipment Expense
Shipment Exception
Arrival
```

---

# 7. Inbound Shipment

An **Inbound Shipment** is the main operational logistics record representing goods moving toward Maevelle.

Example:

```text
Shipment:
SH-CN-2026-0082

Origin:
Guangzhou Consolidation Warehouse

Destination:
Maevelle Dhaka Main Warehouse

Mode:
Air

Forwarder:
ABC Logistics
```

---

# 8. Shipment Does Not Require One Supplier

Example:

```text
Shipment SH-CN-82

Supplier A:
Dresses

Supplier B:
Hats

Supplier C:
Jewelry
```

This is a valid and important Maevelle scenario.

---

# 9. Shipment Does Not Require One Purchase

Example:

```text
SH-CN-82

PO-101
PO-104
PO-108
PO-109
```

all travel together.

---

# 10. One Purchase Can Split Across Shipments

Example:

```text
PO-101:
100 Dresses
```

may become:

```text
SH-81 → 40
SH-82 → 35
SH-84 → 25
```

This must be a natural relationship.

---

# 11. Shipment Item

A **Shipment Item** represents a quantity of a purchased item included in the Shipment.

Conceptually:

```text
Shipment Item

Shipment
Purchase Line
Supplier
Supplier Item
Maevelle Variant where mapped
Quantity
```

---

# 12. Shipment Allocation

The important relationship is:

```text
Purchase Line
      ↓
Shipment Allocation
      ↓
Inbound Shipment
```

with a quantity.

Example:

```text
PO-101 Line 1

Ordered:
100

Allocated:
SH-81 → 40
SH-82 → 35
SH-84 → 25
```

---

# 13. Shipment Allocation Validation

A Purchase Line should normally not be allocated beyond its unresolved quantity.

Example:

```text
Ordered:
100

Cancelled:
10

Already allocated:
70

Remaining allocatable:
20
```

Attempt:

```text
Allocate another:
30
```

should generate an error or controlled exception.

---

# 14. Allocation Does Not Mean Dispatched

Putting goods into a planned Shipment means:

```text
Expected to travel in this Shipment
```

not necessarily:

```text
Physically dispatched
```

This distinction matters.

---

# 15. Shipment Lifecycle

Recommended high-level lifecycle:

```text
DRAFT
   ↓
PLANNED
   ↓
BOOKED
   ↓
COLLECTING
   ↓
READY_TO_DEPART
   ↓
IN_TRANSIT
   ↓
ARRIVED
   ↓
CLEARANCE / LOCAL_DELIVERY where relevant
   ↓
DELIVERED_TO_DESTINATION
   ↓
RECEIVED
   ↓
CLOSED
```

Not every Shipment needs every state.

---

# 16. Avoid One Giant Linear Status

A Shipment may simultaneously be:

```text
Transport:
ARRIVED_AT_PORT

Customs:
UNDER_REVIEW

Receiving:
NOT_RECEIVED
```

Therefore important sub-processes should have separate state dimensions where appropriate.

---

# 17. Recommended State Dimensions

Potential:

```text
Shipment Operational Status

Transport Status

Customs / Clearance Status

Receiving Status

Costing Status

Exception Status
```

The UI can summarize them without storing everything in one ambiguous string.

---

# 18. Draft

Draft means:

```text
Shipment is being prepared.
```

Goods may be added or removed freely according to Purchase constraints.

No physical movement is implied.

---

# 19. Planned

Planned means:

```text
Maevelle intends these goods to move together.
```

The shipment may not yet have a confirmed carrier/forwarder booking.

---

# 20. Booked

Booked means logistics have been arranged.

Potential information:

```text
Forwarder
Mode
Booking Reference
Departure Estimate
Arrival Estimate
```

---

# 21. Collecting

Especially relevant for consolidation.

Example:

```text
Supplier A delivered ✓
Supplier B delivered ✓
Supplier C not yet delivered
```

Shipment remains in consolidation preparation.

---

# 22. Ready to Depart

All intended goods are consolidated/prepared.

This does not yet mean the carrier physically departed.

---

# 23. In Transit

Shipment has departed its current origin toward the next stage/destination.

Goods are not yet Maevelle Warehouse On Hand.

---

# 24. Arrived

Shipment physically reached an important arrival point.

Example:

```text
Bangladesh airport
Port
Local hub
```

But arrival does not automatically equal Warehouse Receipt.

---

# 25. Delivered to Destination

Carrier/forwarder delivered goods to Maevelle's receiving Location.

Still:

```text
Delivered
≠
Inventory Received
```

Receiving staff must count/inspect/post Receipt.

---

# 26. Received

Shipment goods have undergone appropriate receipt processing.

A Shipment can be:

```text
PARTIALLY_RECEIVED
```

before full completion.

---

# 27. Closed

Shipment is operationally resolved.

All quantities are accounted for as some combination of:

```text
Received
Lost
Cancelled
Short
Returned / otherwise resolved
```

and outstanding shipment work is complete.

---

# 28. Shipment Status Should Be Configurable Carefully

We should **not** create a generic user-editable workflow builder in V1.

Instead, maintain a controlled built-in lifecycle with enough flexibility for real imports.

Advanced workflow customization can come later.

---

# 29. Consolidation

**Consolidation** means goods from multiple sources are combined into one logistical movement.

Example:

```text
Supplier A ──────┐
Supplier B ──────┼──► Consolidation Point
Supplier C ──────┘
                         ↓
                  Main Shipment
```

---

# 30. Consolidation Point

A Shipment may contain a logistics origin such as:

```text
China Forwarder Warehouse
Yiwu Consolidation Hub
Guangzhou Warehouse
```

This is not necessarily one of Maevelle's internal stock Locations.

---

# 31. External Logistics Location

We should support generic external logistics locations/references without turning them into internal inventory Warehouses.

Conceptually:

```text
External Logistics Location

Name
Country
City
Address
Provider
Notes
```

---

# 32. Supplier-to-Consolidation Movement

A future/advanced implementation may track:

```text
Supplier A
   ↓
Domestic China Courier
   ↓
Consolidation Warehouse
```

as a leg.

V1 should permit such tracking when useful, but not require every minor domestic parcel to become its own full Shipment.

---

# 33. Shipment Journey

An Inbound Shipment may follow multiple logistical stages.

Example:

```text
Supplier
   ↓
China Consolidation Warehouse
   ↓
Guangzhou Airport
   ↓
Dhaka Airport
   ↓
Customs
   ↓
Local Delivery
   ↓
Maevelle Warehouse
```

---

# 34. Shipment Leg

A **Shipment Leg** represents one segment of that journey.

Example:

```text
Leg 1:
Guangzhou Consolidation Warehouse
→ Guangzhou Airport

Leg 2:
Guangzhou Airport
→ Dhaka Airport

Leg 3:
Dhaka Airport
→ Maevelle Warehouse
```

Microsoft's landed-cost tracking similarly supports multiple journey legs with separate lead times/statuses and expected/actual dates.

---

# 35. Why Legs Matter

Different legs may have:

```text
Different provider

Different transport mode

Different cost

Different tracking number

Different planned duration

Different exception
```

Example:

```text
China domestic:
Truck

International:
Air

Bangladesh:
Truck
```

---

# 36. Leg Properties

Conceptually:

```text
Sequence

Origin

Destination

Transport Mode

Logistics Provider

Tracking / Reference

Estimated Departure

Actual Departure

Estimated Arrival

Actual Arrival

Status

Notes
```

---

# 37. Leg Order

Legs have explicit sequence.

Example:

```text
1
2
3
4
```

Changing route must preserve understandable history once travel begins.

---

# 38. Leg Modification

Before departure:

```text
Route may be edited.
```

After completion:

```text
Historical completed Leg should not simply disappear.
```

Use exception/correction records where necessary.

---

# 39. Journey Template — Future / Preferred

Frequently used route:

```text
China Consolidation
→ Guangzhou Airport
→ Dhaka Airport
→ Customs
→ Maevelle Warehouse
```

could eventually become:

```text
Journey Template:
China Air Standard
```

to reduce repetitive setup.

V1 can support reusable templates if practical, but it is not mandatory.

---

# 40. Transport Mode

Controlled values:

```text
AIR

SEA

ROAD

RAIL

COURIER

MULTIMODAL

OTHER
```

---

# 41. Shipment-Level vs Leg-Level Mode

A simple Shipment may use:

```text
Mode:
Air
```

But a multi-leg Shipment may use:

```text
Leg 1 Road
Leg 2 Air
Leg 3 Road
```

Therefore leg-level mode is the more precise source.

Shipment-level mode can be:

```text
Primary Mode
```

or derived summary.

---

# 42. Logistics Provider

A logistics provider may be:

```text
Freight Forwarder
Carrier
Local Transport Company
Courier
Customs Agent
Consolidation Company
```

This entity is different from Product Supplier.

---

# 43. Logistics Provider Entity

Potential information:

```text
Name
Provider Type
Contacts
Address
Country
Notes
Payment information reference
Status
```

---

# 44. One Shipment Can Use Multiple Providers

Example:

```text
Forwarder:
China Logistics Ltd

Air Carrier:
Airline X

Customs Agent:
BD Clearance Ltd

Local Transport:
Dhaka Transport Co
```

So:

```text
shipment.provider_id
```

alone is insufficient.

---

# 45. Provider Relationship

A provider may be associated with:

```text
Whole Shipment
```

or:

```text
Specific Journey Leg
```

or:

```text
Specific Shipment Expense
```

---

# 46. Tracking References

A Shipment may have multiple tracking references.

Examples:

```text
Forwarder Reference

Air Waybill

Master Air Waybill

House Air Waybill

Container Number

Courier Tracking Number

Booking Reference
```

---

# 47. Tracking Reference Structure

Conceptually:

```text
Type
Value
Provider
Leg
Package/Container
URL metadata where supported
Notes
```

Do not force all references into:

```text
tracking_number
```

---

# 48. Physical Packing Structure

An Inbound Shipment may contain:

```text
Packages
Cartons
Bags
Pallets
Containers
```

These are physical groupings.

---

# 49. Package

A **Package** is a generic physical unit of shipment packing.

Example:

```text
Carton 1

Weight:
18.5 kg

Dimensions:
60 × 40 × 50 cm
```

---

# 50. Container

For sea freight or larger logistics:

```text
Shipping Container
```

can be modeled as a specialized physical grouping.

Microsoft Dynamics similarly distinguishes shipping containers beneath voyage/shipment level and can track receiving/costs by container.

---

# 51. V1 Generic Packing Model

We do not need separate complicated entities for:

```text
Box
Bag
Carton
Pallet
```

A generic:

```text
Shipment Package
```

with a `type` can cover most needs.

A Container can be an enhanced/special type when needed.

---

# 52. Package Properties

Potential:

```text
Package Number

Package Type

External Label / ID

Weight

Length

Width

Height

Volume

Tracking Reference

Notes
```

---

# 53. Package Contents

Where necessary:

```text
Package
   ↓
Shipment Item Quantity
```

Example:

```text
Carton 1

Dress Red/M × 20
Dress Red/L × 10
```

---

# 54. Do We Require Package-Level Contents in V1?

Not for every Shipment.

The system should support it, but merchants may track only Shipment-level contents when package detail is unnecessary.

This avoids excessive data entry.

---

# 55. Package-Level Receiving

If packages are tracked, the receiving workflow may later allow:

```text
Carton 1 received

Carton 2 received

Carton 3 missing
```

This is useful for larger shipments.

---

# 56. Weight

Shipment may track:

```text
Actual Gross Weight
Net Weight
```

and package-level weights.

---

# 57. Why Weight Matters

Weight later affects:

```text
Freight Charges

Landed Cost Allocation

Carrier Billing

Shipment Planning
```

Weight should therefore be structured numeric data with units.

---

# 58. Volume

Shipment/package may track:

```text
Length
Width
Height
Calculated Volume
```

or reported total volume.

---

# 59. Chargeable Weight

Air freight providers often bill according to carrier-defined chargeable-weight rules rather than only raw physical weight.

Our domain should therefore support:

```text
Actual Weight
Chargeable Weight
```

as separate values.

The calculation policy/provider rule can remain external/manual in V1.

---

# 60. Do Not Hard-Code Volumetric Formula

Different providers/routing contracts may use different volumetric divisors or rules.

Therefore:

```text
chargeable_weight
```

may be recorded/calculated through configured provider rules later.

Do not globally hard-code one formula.

---

# 61. Measurement Units

Shipment physical measurements should use structured units:

```text
g
kg

mm
cm
m

cm³
m³
```

or corresponding supported units.

---

# 62. Shipment Quantity vs Package Quantity

Purchase quantities are item units.

Package count is packaging units.

Example:

```text
100 Dresses
```

packed inside:

```text
4 Cartons
```

Never confuse:

```text
Item Quantity
```

with:

```text
Package Count
```

---

# 63. Estimated Dates

Shipment tracking should support planned dates.

Potential:

```text
Expected Supplier Dispatch

Expected Consolidation Arrival

Expected Shipment Departure

Expected Port Arrival

Expected Customs Completion

Expected Warehouse Delivery
```

But we should avoid dozens of fixed columns.

Shipment Legs/Activities provide a more flexible structure.

---

# 64. Actual Dates

Each meaningful event should support actual timestamps.

Example:

```text
Estimated Arrival:
20 Aug

Actual Arrival:
22 Aug
```

This enables delay analysis.

Microsoft's inbound tracking similarly records estimated and actual dates across journey activities.

---

# 65. Estimated Date Changes

When:

```text
Departure delayed by 3 days
```

future expected dates may need recalculation.

V1 can provide manual/recommended propagation rather than sophisticated route planning.

---

# 66. Actual Date Is Historical

Once actual departure occurred:

```text
Actual Departure
```

should not casually change through normal editing.

Corrections should remain auditable.

---

# 67. Shipment Milestones

Useful operational milestones:

```text
Supplier Goods Ready

Picked Up

Reached Consolidation

Consolidation Complete

Departed Origin

Arrived Destination Country

Customs Started

Customs Cleared

Local Delivery Started

Delivered to Warehouse

Receipt Completed
```

---

# 68. Milestones vs Status

Milestones are events:

```text
Customs Cleared at 14:22
```

Status describes current condition:

```text
LOCAL_DELIVERY
```

The two concepts may share data but should not be confused.

---

# 69. Timeline

Shipment detail should provide:

```text
Aug 02
Created

Aug 04
Supplier A goods added

Aug 06
Supplier B goods added

Aug 07
Consolidation completed

Aug 08
Departed Guangzhou

Aug 10
Arrived Dhaka

Aug 11
Customs processing

Aug 12
Customs cleared

Aug 13
Delivered to Maevelle

Aug 13
Partial receipt posted
```

---

# 70. Shipment Origin

Origin may be:

```text
Supplier Address

Supplier Warehouse

Consolidation Warehouse

Port

Another logistics hub
```

---

# 71. Shipment Destination

Destination should generally be an eligible Maevelle Location or another logistics waypoint.

Final expected destination usually:

```text
Maevelle Warehouse / Location
```

---

# 72. Destination Change

Before dispatch:

```text
Destination may be editable.
```

After shipment is in transit:

```text
Changing destination should be controlled and auditable.
```

---

# 73. Multi-Destination Shipment

One international Shipment may arrive in Bangladesh and then split to:

```text
Main Warehouse
Showroom
```

Rather than making one Shipment have two final Warehouse Receipts in an ambiguous way, we can represent:

```text
Main Inbound Shipment
      ↓
Arrival / Consolidation
      ↓
Receiving / Internal Transfer
```

or distinct final delivery legs/receipts.

V1 should prefer operational clarity over cleverness.

---

# 74. Recommended V1 Rule

An Inbound Shipment has **one primary final receiving Location**.

If goods need redistribution afterward:

```text
Warehouse Transfer
```

handles it.

Advanced multi-destination shipment allocation can come later.

---

# 75. Shipment Consolidation Example

```text
Supplier A
PO-101
Dresses × 50

Supplier B
PO-104
Hats × 100

Supplier C
PO-108
Jewelry × 30
```

At China hub:

```text
Consolidated into:
SH-CN-82
```

Physical:

```text
Carton 1
Carton 2
Carton 3
Carton 4
```

---

# 76. Split Before Departure

A planned Shipment may become too large.

Original:

```text
SH-82
200 kg
```

Forwarder decides:

```text
SH-82A
120 kg

SH-82B
80 kg
```

The system must support moving allocated quantities between Shipments before/after booking according to state.

---

# 77. Shipment Split

A split should preserve source relationships.

Conceptually:

```text
Original Shipment
      ↓
Split Operation
      ↓
Shipment A
Shipment B
```

or controlled reallocation from original.

---

# 78. Shipment Split After Departure

This is much more sensitive.

If goods physically separated after transit began, the system should record a logistics exception/new child journey rather than rewriting the original history.

---

# 79. Shipment Merge

Two planned Shipments may be consolidated before departure.

Example:

```text
SH-80
+
SH-81
      ↓
SH-82
```

This should be allowed only while operational state permits.

---

# 80. Merge Does Not Erase History

Old planned records should become:

```text
CONSOLIDATED_INTO SH-82
```

or equivalent.

Do not silently delete them if they had operational references.

---

# 81. Shipment Cancellation

Draft/Planned shipments may normally be cancelled.

Allocated Purchase quantities become available for another Shipment.

---

# 82. Cannot Simply Cancel In-Transit Shipment

Once departed, Shipment cannot logically disappear.

Possible outcomes:

```text
Returned to Origin

Lost

Abandoned

Redirected

Exception
```

---

# 83. Shipment Exceptions

Shipment needs first-class exception handling.

Examples:

```text
DELAY

PARTIAL_LOSS

TOTAL_LOSS

DAMAGE

CUSTOMS_HOLD

DOCUMENT_MISSING

PROVIDER_ISSUE

QUANTITY_MISMATCH

WRONG_ITEM

ADDRESS_PROBLEM

OTHER
```

---

# 84. Exception Record

Conceptually:

```text
Type

Severity

Description

Detected Date

Affected Shipment Items / Packages

Status

Owner

Resolution

Attachments
```

---

# 85. Exception Lifecycle

Potential:

```text
OPEN

INVESTIGATING

RESOLVED

CLOSED
```

---

# 86. Delay

Delay should affect expected dates but not modify original planned history.

Example:

```text
Original ETA:
Aug 10

Current ETA:
Aug 13
```

The system should preserve enough information for delay analysis.

---

# 87. Total Loss

Shipment lost entirely.

Purchase/Inventory behavior:

```text
No Warehouse Receipt
```

Procurement decides:

```text
Replacement?
Supplier claim?
Forwarder claim?
Refund?
```

Landed Cost decides treatment of any incurred costs.

---

# 88. Partial Loss

Example:

```text
Shipment:
100 units

Lost:
5

Arrived:
95
```

The five units require explicit resolution.

---

# 89. Damage in Transit

Example:

```text
100 arrive physically

5 damaged
```

Receiving may post:

```text
Sellable +95
Damaged  +5
```

Inventory Architecture already supports this.

Shipment records where damage was detected.

---

# 90. Shipment Item Condition Is Not Final Inventory Condition

A forwarder may report:

```text
Package damaged
```

but final item-level damage is determined during receiving/inspection.

Shipment exceptions are logistics evidence.

Inventory condition is warehouse truth after receipt.

---

# 91. Customs

International Shipments may require customs/clearance tracking.

Recommended separate status:

```text
NOT_REQUIRED

NOT_STARTED

DOCUMENT_PREPARATION

SUBMITTED

UNDER_REVIEW

INSPECTION

CLEARED

HELD

REJECTED / EXCEPTION
```

Exact V1 statuses can be simplified.

---

# 92. Customs Status Is Not Shipment Status

Example:

```text
Shipment:
ARRIVED_DESTINATION_COUNTRY

Customs:
UNDER_REVIEW
```

This is more informative than:

```text
Status:
PROCESSING
```

---

# 93. Customs Agent

Shipment may reference:

```text
Customs Broker / Agent
```

separately from freight forwarder.

---

# 94. Customs Documents

Potential attachments:

```text
Commercial Invoice

Packing List

Air Waybill

Bill of Lading

Customs Declaration

Import Documents

Duty/Tax Documents

Release Document
```

The system should support configurable document types.

---

# 95. Document Record

A shipment document should conceptually contain:

```text
Document Type

Document Number

Asset/File

Issue Date

Provider / Issuer

Notes

Status
```

---

# 96. Required Document Checklist

V1-preferred capability:

```text
Commercial Invoice      ✓
Packing List            ✓
Air Waybill             ✓
Customs Document        Missing
```

Requirements may vary by Shipment type.

Do not hard-code one universal checklist.

---

# 97. Shipment Expenses

Shipment should reference expenses such as:

```text
International Freight

Domestic China Shipping

Forwarder Fee

Customs Duty

VAT / Tax where applicable

Insurance

Handling

Documentation Fee

Port/Airport Charge

Local Transport

Storage

Other
```

---

# 98. Shipment Expense Is Not Yet Allocation

Shipment domain records:

```text
This Shipment incurred a ৳20,000 freight charge.
```

Landed Cost domain decides:

```text
How much of that charge belongs to each Product/Variant/received unit?
```

This separation is mandatory.

---

# 99. Expense Relationship

Conceptually:

```text
Shipment
    ↓
Shipment Expense
    ↓
Landed Cost Allocation
```

---

# 100. Estimated Shipment Expense

Before final bills arrive:

```text
Estimated Freight:
৳20,000
```

may be entered.

This supports estimated landed cost.

---

# 101. Actual Shipment Expense

Later:

```text
Actual Freight:
৳21,750
```

is recorded.

Costing can then reconcile.

---

# 102. Estimated Does Not Get Deleted

The system should preserve:

```text
Estimate
Actual
Variance
```

where meaningful.

This enables future cost forecasting.

---

# 103. Shipment Expense Currency

Expenses may occur in different currencies.

Example:

```text
China Domestic Delivery:
CNY

International Freight:
USD

Bangladesh Local Delivery:
BDT
```

Each expense must have explicit currency.

---

# 104. Expense Provider

Shipment Expense may reference:

```text
Forwarder
Customs Agent
Carrier
Local Transport Provider
Other Vendor
```

---

# 105. Expense Document

Attach:

```text
Invoice
Receipt
Screenshot
Payment Evidence
```

where appropriate.

---

# 106. Payment vs Shipment Expense

Recording a Shipment Expense means:

```text
Cost exists.
```

It does not necessarily mean:

```text
Cost has been paid.
```

Payment tracking may later integrate with Expense/Finance.

---

# 107. Landed Cost Areas

A cost may apply at:

```text
Entire Shipment

Specific Leg

Specific Package / Container

Specific Purchase

Specific Shipment Item
```

Enterprise landed-cost systems similarly support applying costs at different levels such as voyage, container, purchase order, item or transfer.

Our Landed Cost architecture will generalize this carefully.

---

# 108. Arrival

**Arrival** means goods reached the final receiving point physically.

Arrival should record:

```text
Arrival Date/Time

Location

Carrier Reference

Package Count

Condition Notes

Attachments
```

---

# 109. Arrival Is Not Receipt

Again:

```text
ARRIVAL
=
Truck physically arrived.

RECEIPT
=
Maevelle counted/inspected/accepted quantities.
```

---

# 110. Receiving Handoff

Shipment provides expected physical contents.

Receiving operation consumes that expectation.

Example:

```text
Shipment:
Expected Red/M × 20
```

Receiving:

```text
Counted:
19

Damaged:
1
```

---

# 111. Partial Receiving

Shipment:

```text
100 units
```

Receipt 1:

```text
60
```

Receipt 2:

```text
35
```

Remaining:

```text
5 unresolved
```

Partial receiving must be supported.

Enterprise receiving systems similarly support partial receipts rather than requiring full purchase quantity at once.

---

# 112. Shipment Receiving Status

Potential:

```text
NOT_RECEIVED

PARTIALLY_RECEIVED

FULLY_RECEIVED

RECEIVED_WITH_VARIANCE
```

---

# 113. Under-Receipt

Expected:

```text
100
```

Final accepted:

```text
97
```

Difference:

```text
3
```

must be resolved as:

```text
Short
Lost
Cancelled
Supplier issue
Claim
Other
```

not silently discarded.

---

# 114. Over-Receipt

Expected:

```text
100
```

Counted:

```text
103
```

needs controlled handling.

Possible:

```text
Accept extras

Reject extras

Return extras

Amend sourcing quantity
```

---

# 115. Receiving by Package

If detailed package structure is tracked:

```text
Carton 1 ✓
Carton 2 ✓
Carton 3 Missing
```

can provide useful receiving reconciliation.

---

# 116. Package Count Variance

Expected:

```text
5 cartons
```

Arrived:

```text
4 cartons
```

This is a logistics exception even before individual items are counted.

---

# 117. Shipment Quantity Summary

Shipment should answer:

```text
Planned Quantity

Dispatched Quantity

In-Transit Quantity

Arrived Quantity

Received Quantity

Damaged Quantity

Lost / Short Quantity

Outstanding Quantity
```

Not all should necessarily be stored counters; some can be safely derived.

---

# 118. Goods in Transit

For Maevelle operational purposes:

```text
Goods In Transit
```

means goods physically dispatched toward the destination but not yet received into an internal Warehouse.

They should remain visible operationally but unavailable for normal Warehouse fulfillment. This is consistent with mature landed-cost systems that track goods while in transit but do not treat them as normal pickable stock before final receipt.

---

# 119. Goods in Transit vs Incoming

Recommended terminology:

```text
ON ORDER
Procurement expectation before dispatch

INCOMING / IN TRANSIT
Shipment physically underway

ON HAND
Warehouse received physical stock
```

---

# 120. Example

Purchase:

```text
100 units
```

Before Shipment:

```text
On Order:
100

Incoming:
0
```

Shipment dispatched 60:

```text
On Order:
40

Incoming:
60

On Hand:
0
```

Receipt 60:

```text
On Order:
40

Incoming:
0

On Hand:
60
```

---

# 121. Financial Ownership

International trade may transfer ownership/risk before Warehouse receipt.

This is important for mature accounting but not required for V1 operational quantity handling.

Foundation should allow future:

```text
Ownership / Risk Transfer Date
Incoterm Context
Financial Goods-in-Transit State
```

without forcing Inventory On Hand prematurely.

---

# 122. Incoterm Relationship

Purchase/Shipment may record:

```text
EXW
FOB
CIF
...
```

where known.

But V1 should not automatically attempt full legal/accounting interpretation.

It is operational metadata until Finance/Costing rules explicitly use it.

---

# 123. Shipment Timeline Sources

Timeline events may originate from:

```text
User

Forwarder Integration

Carrier Integration

Customs Integration

Receiving

System Calculation
```

---

# 124. Manual Tracking V1

V1 does not need carrier integrations.

Staff should be able to manually update:

```text
Status

Location

Estimated Dates

Actual Dates

Tracking References

Notes
```

efficiently.

---

# 125. Future Provider Integrations

Later:

```text
Carrier API
Forwarder API
Customs API
Tracking aggregator
```

may update Shipment automatically.

---

# 126. External Event Idempotency

Future integration events may be delivered repeatedly.

Shipment tracking updates should use:

```text
Provider
External Event ID
Reference
Timestamp
```

to prevent duplicate milestone creation.

---

# 127. Shipment List UX

High-priority columns:

```text
Shipment

Origin

Destination

Status

Mode

Providers

Purchase Count

Item / Unit Count

ETA

Receiving Status

Cost Status

Exceptions
```

Do not display every logistics field by default.

---

# 128. Shipment Filters

Useful filters:

```text
Status

Origin Country

Destination

Transport Mode

Provider

Supplier

Purchase

ETA

Delayed

Customs Status

Receiving Status

Has Exception

Costing Status
```

---

# 129. Saved Views

Examples:

```text
China Shipments

In Transit

Arriving This Week

Customs Hold

Delayed

Awaiting Receipt

Cost Not Finalized

Has Variance
```

---

# 130. Shipment Detail UX

Recommended sections:

```text
Overview

Contents

Purchases / Suppliers

Journey / Tracking

Packages

Customs

Expenses

Receiving

Documents

Exceptions

Timeline

Audit
```

---

# 131. Shipment Overview

Should answer quickly:

```text
Where is it now?

What is inside?

When will it arrive?

Where is it going?

Who is handling it?

Are there problems?

Has it been received?

Are shipment costs finalized?
```

---

# 132. Contents View

Example:

```text
Supplier A

PO-101
Dress Red/M       20
Dress Red/L       15

Supplier B

PO-104
Beach Hat         100
```

---

# 133. Supplier Grouping

Shipment items should be groupable by:

```text
Supplier

Purchase

Product

Package
```

depending on user task.

---

# 134. Journey View

Visual:

```text
Guangzhou Hub
   ✓ Aug 8
      │
      ▼
Guangzhou Airport
   ✓ Aug 8
      │
      ▼
Dhaka Airport
   ✓ Aug 10
      │
      ▼
Customs
   ● In Progress
      │
      ▼
Main Warehouse
   ○ Expected Aug 12
```

This would be a very useful operational UI.

---

# 135. Delay Visualization

Display:

```text
Original ETA:
Aug 10

Current ETA:
Aug 13

Delay:
3 days
```

rather than only overwriting the old value.

---

# 136. Shipment Dashboard

Potential widgets:

```text
Currently In Transit

Arriving Next 7 Days

Delayed

At Customs

Awaiting Receipt

Shipment Value

Estimated Freight

Actual Freight

Open Exceptions
```

---

# 137. Procurement Cross-Link

From Purchase:

```text
PO-101
→ Shipments
```

From Shipment:

```text
SH-82
→ Purchases
```

Bi-directional navigation is mandatory.

---

# 138. Inventory Cross-Link

Shipment page should show:

```text
Not Received Yet
```

or:

```text
Receipt RCV-1002
→ Main Warehouse Inventory
```

after receipt.

---

# 139. Landed Cost Cross-Link

Shipment:

```text
Expenses
→ Landed Cost Worksheet
```

Costing should be directly accessible from Shipment context.

---

# 140. Shipment Expenses UX

Potential:

```text
Freight             $500       Actual
China Delivery      ¥300       Actual
Customs             ৳12,000    Estimate
Local Delivery      ৳2,000     Estimate
```

with allocation status:

```text
Freight             Allocated ✓
Customs             Pending
```

---

# 141. Shipment Cost Status

Useful summary:

```text
NOT_STARTED

ESTIMATED

PARTIALLY_ACTUAL

FINALIZED

REOPENED / RECONCILING
```

Exact semantics belong to Landed Cost domain.

Shipment can consume a summarized status.

---

# 142. Permissions

Suggested:

```text
shipments.view

shipments.create

shipments.edit_planned

shipments.book

shipments.dispatch

shipments.tracking.edit

shipments.customs.edit

shipments.packages.manage

shipments.expenses.view

shipments.expenses.manage

shipments.documents.manage

shipments.exceptions.manage

shipments.close
```

---

# 143. Financial Permission Separation

A logistics employee may see:

```text
Contents

Packages

Tracking

Dates

Provider
```

without:

```text
Supplier Cost

Freight Amount

Landed Cost

Margin
```

Read models must respect permissions.

---

# 144. Shipment Audit

Important events:

```text
shipment.created

shipment.items_changed

shipment.booked

shipment.dispatched

shipment.status_changed

shipment.eta_changed

shipment.arrived

shipment.received_partial

shipment.received_full

shipment.cancelled

shipment.split

shipment.merged

shipment.exception_created

shipment.expense_added
```

---

# 145. Timeline vs Audit

Timeline:

```text
Operational story
```

Audit:

```text
Detailed mutation history
```

Both remain useful.

---

# 146. Concurrency

Two employees may update Shipment contents simultaneously.

Use:

```text
Versioning

Optimistic concurrency

Transactional validation
```

where appropriate.

---

# 147. Dispatch Concurrency

Only one valid transition should mark:

```text
READY_TO_DEPART
→ IN_TRANSIT
```

and activate incoming/goods-in-transit behavior.

---

# 148. Dispatch Validation

Potential checks:

```text
Shipment has items

Quantities valid

Purchase allocations valid

Origin set

Destination set

Required tracking/booking information present where configured
```

---

# 149. Shipment Modification After Dispatch

Once dispatched:

```text
Purchase allocations

Quantities

Packages
```

should become more controlled.

Physical history now exists.

---

# 150. Adding Goods After Dispatch

Usually invalid unless representing an actual consolidation/handoff event.

Do not let staff casually edit:

```text
100 units
→
120
```

after physical departure.

Use an explicit correction/additional Shipment.

---

# 151. Removing Goods After Dispatch

Similarly, use:

```text
Short Shipment

Loss

Misload

Reallocation
```

rather than silently deleting them.

---

# 152. Idempotency

Critical operations:

```text
Dispatch Shipment

Mark Arrival

Post External Milestone

Finalize Split/Merge

Post Receipt Handoff
```

should be safe against retries.

---

# 153. Shipment API Commands

Conceptual:

```text
createShipment()

addPurchaseAllocation()

removePlannedAllocation()

bookShipment()

addPackage()

createLeg()

dispatchShipment()

recordTrackingEvent()

recordArrival()

createShipmentException()

splitShipment()

mergePlannedShipments()

closeShipment()
```

---

# 154. Shipment Query APIs

```text
getShipment()

listShipments()

getShipmentContents()

getJourney()

getPackages()

getTracking()

getExpenses()

getDocuments()

getExceptions()
```

---

# 155. Structured Errors

Examples:

```text
SHIPMENT_ALREADY_DISPATCHED

SHIPMENT_ALLOCATION_EXCEEDS_PURCHASE_OPEN_QUANTITY

INVALID_SHIPMENT_STATE

DESTINATION_NOT_RECEIVING_ENABLED

PACKAGE_WEIGHT_INVALID

INVALID_LEG_SEQUENCE

SHIPMENT_ALREADY_RECEIVED

UNRESOLVED_SHIPMENT_QUANTITY

CANNOT_CANCEL_IN_TRANSIT_SHIPMENT

CANNOT_MERGE_DISPATCHED_SHIPMENT
```

---

# 156. Domain Events

Potential:

```text
shipment.created

shipment.booked

shipment.dispatched

shipment.in_transit

shipment.delayed

shipment.arrived

shipment.customs_cleared

shipment.delivered

shipment.partially_received

shipment.received

shipment.exception_opened
```

---

# 157. Event Consumers

May trigger:

```text
Notifications

Inventory incoming projection

Procurement status

Analytics

Landed Cost

Webhooks

Future integrations
```

---

# 158. Notifications

V1 useful alerts:

```text
Shipment Delayed

Shipment Arriving Soon

Customs Hold

Shipment Delivered

Receipt Required

Shipment Exception

Missing Document

Cost Still Estimated
```

---

# 159. Shipment Analytics

V1:

```text
Shipment Count

In-Transit Shipments

Average Transit Duration

Delay Count

Shipments by Mode

Shipments by Provider

Freight Spend

Receiving Variance

Damage / Loss Incidents
```

Future:

```text
Provider On-Time Rate

Cost per kg

Cost per m³

Route Performance

Customs Duration

Supplier-to-Warehouse Lead Time

Forwarder Scorecard
```

---

# 160. Logistics Provider Analytics — Future

Eventually:

```text
Average Transit Time

Delay Rate

Damage Rate

Cost Trend

Exception Rate
```

could inform provider selection.

---

# 161. Shipment Search

Search should support:

```text
Shipment Number

Tracking Reference

Container Number

Package Reference

Purchase Number

Supplier

Product / SKU

Provider
```

---

# 162. Shipment Number

Human-readable:

```text
SH-2026-00182
```

or:

```text
SH-CN-2026-0082
```

Internal ID remains separate.

---

# 163. Provider Reference Is Not Shipment ID

Keep:

```text
Maevelle Shipment Number
```

separate from:

```text
Forwarder Reference
Air Waybill
Container Number
```

---

# 164. Shipment Document Numbering

Packages/containers may also use internal numbers:

```text
PKG-001
CTN-001
```

without replacing external carrier labels.

---

# 165. Shipment Revision

Planned Shipment content changes should remain historically traceable.

We do not necessarily need formal document revisions for every minor tracking update.

But changes to:

```text
Purchase allocations

Quantities

Origin

Destination

Major booking terms
```

should be auditable.

---

# 166. Shipment Duplicate Detection

Potential warning if:

```text
Same provider

Same tracking reference

Same destination

Same purchase allocations
```

appear in another active Shipment.

---

# 167. Packing List

V1 should support generating/exporting a shipment packing summary:

```text
Shipment

Packages

Suppliers

Purchase References

Items

Quantities

Weight

Dimensions
```

This may help receiving.

---

# 168. Receiving Worksheet

Shipment can generate:

```text
Expected vs Counted
```

worksheet for warehouse staff.

Example:

| SKU    | Expected | Counted | Good | Damaged | Difference |
| ------ | -------: | ------: | ---: | ------: | ---------: |
| DR-R-M |       20 |      20 |   19 |       1 |          0 |
| DR-R-L |       15 |      14 |   14 |       0 |         -1 |

---

# 169. Barcode / Scanning Future

Later receiving could scan:

```text
Shipment

Package

SKU

Quantity
```

with mobile devices.

Not necessary for V1.

---

# 170. Shipment Contents Must Use Snapshots

Purchase/Catalog data may change.

Shipment should preserve important relevant context such as:

```text
Supplier SKU

Product/Variant Reference

Description

Expected Quantity
```

for historical understanding.

---

# 171. Product Archive

Archiving a Product while goods are in transit must not make the Shipment unreadable.

Shipment retains references/snapshots.

---

# 172. Purchase Cancellation with Goods in Shipment

If Purchase line already dispatched:

```text
Cancel Purchase
```

cannot simply erase Shipment Item.

Physical goods still exist in transit.

Procurement must use a commercial resolution workflow.

---

# 173. Supplier Change After Shipment

Supplier identity associated with the shipped goods remains historical.

Do not change it because current sourcing mapping later changes.

---

# 174. Important Invariants

### SHIP-INV-001

Every Inbound Shipment belongs to one Organization.

### SHIP-INV-002

A Shipment may contain items from multiple Suppliers.

### SHIP-INV-003

A Shipment may contain items from multiple Purchases.

### SHIP-INV-004

A Purchase Line may participate in multiple Shipments.

### SHIP-INV-005

Shipment allocation quantity cannot silently exceed unresolved Purchase quantity.

### SHIP-INV-006

Allocation to a planned Shipment does not itself mean physical dispatch.

### SHIP-INV-007

Shipment dispatch does not create Warehouse On Hand.

### SHIP-INV-008

Arrival does not equal Receipt.

### SHIP-INV-009

Receipt uses actual counted quantities.

### SHIP-INV-010

Goods in transit remain unavailable as normal Warehouse stock.

### SHIP-INV-011

Package count and item quantity are separate concepts.

### SHIP-INV-012

Shipment Expenses and Landed Cost allocations are separate.

### SHIP-INV-013

Estimated and actual expenses remain distinguishable.

### SHIP-INV-014

Journey Legs have explicit sequence.

### SHIP-INV-015

Completed journey history is not silently rewritten.

### SHIP-INV-016

In-transit Shipment cannot simply be deleted/cancelled like a Draft.

### SHIP-INV-017

Loss, damage and shortage remain explicitly traceable.

### SHIP-INV-018

Under/over receipt must be resolved deliberately.

### SHIP-INV-019

Shipment status and customs status remain separate where customs applies.

### SHIP-INV-020

Shipment contents remain historically understandable even if Catalog/Supplier data later changes.

### SHIP-INV-021

Dispatch and receiving operations must be retry-safe.

### SHIP-INV-022

A Shipment should normally have one primary final receiving Location in V1.

### SHIP-INV-023

Redistribution after receipt uses internal Warehouse Transfer rather than pretending the international Shipment had multiple internal destinations.

### SHIP-INV-024

Search/cache/tracking projections do not determine Inventory truth.

---

# 175. V1 Mandatory Scope

Maevelle V1 Shipment domain should include:

```text
✓ Inbound Shipments

✓ Multiple Suppliers per Shipment

✓ Multiple Purchases per Shipment

✓ Purchase Line Shipment Allocation

✓ One Purchase across Multiple Shipments

✓ Consolidation

✓ Shipment Number

✓ Origin

✓ Final Receiving Location

✓ Transport Mode

✓ Logistics Providers

✓ Tracking References

✓ Shipment Status

✓ Receiving Status

✓ Customs Status where relevant

✓ Estimated Dates

✓ Actual Dates

✓ Journey Legs

✓ Shipment Milestones

✓ Generic Packages / Cartons

✓ Package Count

✓ Package Weight

✓ Package Dimensions

✓ Shipment Weight

✓ Volume foundation

✓ Chargeable Weight field

✓ Package contents optionally

✓ Shipment Documents

✓ Document Types

✓ Shipment Expenses

✓ Estimated Expenses

✓ Actual Expenses

✓ Multiple Expense Currencies

✓ Shipment Exceptions

✓ Delay

✓ Damage

✓ Loss

✓ Quantity Variance

✓ Partial Receiving

✓ Under / Over Receipt

✓ Receiving Handoff

✓ Shipment Timeline

✓ Search / Filters

✓ Permissions

✓ Audit

✓ Idempotency

✓ Concurrency Protection

✓ Procurement Cross-Link

✓ Inventory Cross-Link

✓ Landed Cost Cross-Link
```

---

# 176. Strongly Preferred V1 Capabilities

```text
Journey Templates

Document Checklist

Packing List Export

Receiving Worksheet

Shipment Split Before Dispatch

Planned Shipment Merge

Delayed ETA Comparison

Shipment Health Dashboard

Package-Level Receiving

Expense Variance View
```

---

# 177. Foundation Now / Later

Architecture should prepare for:

```text
Financial Ownership in Transit

Incoterm-driven rules

3PL integrations

Forwarder APIs

Carrier tracking APIs

Customs integrations

Master / House airway bills

Sea-container logistics

Multiple final destinations

Shipment appointment scheduling

Provider rate comparison

Shipment insurance claims

Detailed package hierarchy
```

---

# 178. Deferred Advanced Logistics

Post-V1:

```text
Automatic Carrier Tracking

Automatic ETA Prediction

Freight Rate Shopping

Provider Booking APIs

Route Optimization

Shipment Scheduling

Dock Appointments

Container Tracking Integrations

Customs Filing Integrations

IoT Shipment Tracking

Temperature Monitoring

GPS Tracking

Advanced Claims Management

Automatic Document Extraction

Freight Invoice Reconciliation

Advanced Transport Management System
```

---

# 179. Decisions Established

### Decision SH-001

**Inbound Shipment is a first-class domain entity.**

### Decision SH-002

**Purchase and Shipment represent separate realities.**

### Decision SH-003

**Multiple Purchases and Suppliers may be consolidated into one Shipment.**

### Decision SH-004

**One Purchase may be split across multiple Shipments.**

### Decision SH-005

**Purchase-Line Shipment Allocation explicitly records quantity relationships.**

### Decision SH-006

**Shipment planning does not itself imply physical dispatch.**

### Decision SH-007

**Inbound Shipment may contain multiple Journey Legs.**

### Decision SH-008

**Legs can have independent modes, providers, tracking and dates.**

### Decision SH-009

**Estimated and actual logistics dates are separate.**

### Decision SH-010

**Shipment status, customs state and receiving state should not be collapsed into one field.**

### Decision SH-011

**Packages/containers are physical groupings beneath Shipment.**

### Decision SH-012

**Package-level contents are supported but not mandatory for every Shipment.**

### Decision SH-013

**Goods in transit remain operationally visible but are not normal Warehouse On Hand.**

### Decision SH-014

**Arrival and Receipt are separate events.**

### Decision SH-015

**Receiving posts actual counted/inspected quantity.**

### Decision SH-016

**Partial receipts are supported.**

### Decision SH-017

**Loss, damage, shortage and overage are explicit exceptions.**

### Decision SH-018

**Shipment Expenses are recorded separately from Landed Cost allocation.**

### Decision SH-019

**Shipment Expenses support estimate vs actual values.**

### Decision SH-020

**Shipment Expenses may exist in multiple currencies.**

### Decision SH-021

**V1 normally uses one final receiving Location per Inbound Shipment.**

### Decision SH-022

**Post-receipt redistribution uses Warehouse Transfer.**

### Decision SH-023

**Shipment split/merge operations are state-sensitive and historically traceable.**

### Decision SH-024

**Dispatched Shipment contents cannot be casually rewritten.**

### Decision SH-025

**Critical Shipment mutations require idempotency and concurrency protection.**

---

# 180. Resulting Logistics Model

We now have the full sourcing-to-arrival chain:

```text
                         PROCUREMENT

Supplier A ── PO-101 ──┐
Supplier B ── PO-104 ──┼──────┐
Supplier C ── PO-108 ──┘      │
                              ▼
                    PURCHASE-LINE ALLOCATIONS
                              │
                              ▼
                      INBOUND SHIPMENT
                              │
              ┌───────────────┼───────────────┐
              │               │               │
           Packages        Journey         Expenses
              │             Legs               │
              │               │               │
              └───────────────┼───────────────┘
                              │
                              ▼
                        GOODS IN TRANSIT
                              │
                              ▼
                           ARRIVAL
                              │
                              ▼
                          RECEIVING
                              │
                 ┌────────────┴────────────┐
                 │                         │
              Sellable                  Damaged
                 │                         │
                 └────────────┬────────────┘
                              ▼
                          INVENTORY
                              │
                              ▼
                           WAREHOUSE
```

And financial acquisition now looks like:

```text
Supplier Purchase Cost
         +
Shipment Expenses
         +
Customs / Taxes
         +
Handling
         +
Insurance
         +
Local Transport
         +
Other Direct Costs
         ↓
?????????????????????
         ↓
Actual Product Cost
```

That question mark is exactly our **next domain**.

---

# 181. Next Domain — Landed Cost

The next deep document should be:

```text
docs/domains/landed-cost/landed-cost-architecture.md
```

This will likely be one of the most important and technically difficult domains in Maevelle.

It needs to define:

```text
Landed Cost Worksheet

Cost Source

Purchase Cost

Shipment Expenses

Estimated Cost

Actual Cost

Cost Type

Charge Scope

Eligible Items

Allocation Basis

By Quantity

By Purchase Value

By Weight

By Volume

By Chargeable Weight

Equal Allocation

Percentage Allocation

Manual Allocation

Mixed Allocation

Different Strategy Per Expense

Multiple Currencies

FX Conversion

Allocation Precision

Rounding

Reconciliation

Partial Shipment

Partial Receipt

Damaged Quantity

Lost Quantity

Over-Receipt

Under-Receipt

Estimated vs Actual Reconciliation

Cost Revision

Cost Finalization

Cost Reopening

Historical Cost

Per-Unit Landed Cost

Cost Breakdown

Profitability Integration

Inventory Valuation Boundary

Audit

Permissions

Failure Cases
```

That is where your original Excel-style problem:

```text
"How much shipping cost belongs to each product?"
```

becomes a proper production-grade **Cost Allocation Engine**.

---

**End of Inbound Shipment & Consolidation Architecture v0.1**
