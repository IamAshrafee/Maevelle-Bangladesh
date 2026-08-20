# Maevelle Ecommerce — Inventory & Stock Management Architecture

**Document:** `docs/domains/inventory/inventory-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `catalog-architecture.md`, `sizing-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Inventory domain defines how Maevelle Ecommerce understands and controls physical stock.

Its responsibility is significantly larger than storing:

```text
stock = 25
```

The system must be able to answer:

```text
What physically exists?

Where is it?

How much can we actually sell?

How much has already been promised to customers?

How much is damaged or unavailable?

How much is arriving?

How much is currently moving between warehouses?

Why did the quantity change?

Which transaction caused the change?

Who performed the change?

Can the history be reconstructed?

What happens when two customers attempt to purchase
the final unit simultaneously?
```

Inventory must become a trusted operational source of truth.

---

# 2. Core Principle

> **Inventory is a transactional ledger-backed system, not an editable stock number.**

The current quantity shown in the dashboard is the result of inventory operations.

It should not normally be treated as an isolated value with no explanation.

Conceptually:

```text
Opening Inventory
      +
Purchase Receipts
      +
Returns Restocked
      +
Transfers In
      +
Positive Adjustments

      -

Sales / Fulfillment
      -
Transfers Out
      -
Damage / Disposal
      -
Negative Adjustments

      =
Current Inventory
```

Every meaningful change should have a business reason.

---

# 3. Second Core Principle

> **Physical quantity and sellable quantity are different.**

Example:

The warehouse physically contains:

```text
20 units
```

But:

```text
15 Sellable
 2 Reserved for Orders
 2 Damaged
 1 Under Inspection
```

Therefore:

```text
Physical On Hand = 20
```

does **not** mean:

```text
Available to Sell = 20
```

---

# 4. Research-Informed Direction

Modern commerce platforms use similar distinctions.

Shopify's current inventory model connects an Inventory Item to a Location and tracks multiple quantity states including `on_hand`, `available`, `incoming`, and `committed`.

Medusa also models inventory items across locations and separately models reservations of inventory at a particular location.

Saleor uses stock allocations tied to order lifecycle operations so inventory can be committed before final fulfillment.

Maevelle will follow the same underlying principle while using terminology and workflows appropriate to our architecture.

---

# 5. Inventory Domain Responsibilities

The Inventory domain owns:

```text
Inventory Items
Inventory Levels
Inventory Balances
Stock Conditions
Reservations
Inventory Transactions
Inventory Movements
Adjustments
Transfers
Stocktakes
Availability Calculations
Inventory Policies
```

It integrates with:

```text
Catalog
Warehouses
Orders
Procurement
Returns
Fulfillment
Audit
Analytics
Notifications
```

---

# 6. Inventory Does Not Own

Inventory does not determine:

```text
Selling Price
Product Description
Supplier Price
Landed Cost
Order Payment Status
Courier Status
Customer Identity
```

These belong to other domains.

Inventory may reference those records when they caused an inventory event.

---

# 7. Inventory Item

An **Inventory Item** is the inventory-tracked identity of something the business physically stocks.

For standard products:

```text
Catalog Variant
      ↓
Inventory Item
```

Example:

```text
Product:
Floral Dress

Variant:
Red / M

SKU:
FD-RED-M

Inventory Item:
The physical stock identity for FD-RED-M
```

---

# 8. Why Variant and Inventory Item Are Separate

It may initially appear that:

```text
Variant = Inventory Item
```

should simply be the same record.

Keeping the concepts separate gives us significantly better future flexibility.

Medusa similarly separates Inventory Items from Product Variants and allows an inventory item to be associated with variants.

This future-proofs scenarios such as:

```text
Bundles
Kits
Shared Components
Raw Inventory
Packaging Components
Non-standard stock items
```

without making Catalog responsible for physical-stock mechanics.

---

# 9. Normal V1 Relationship

For ordinary Maevelle products:

```text
1 Variant
   ↓
1 Inventory Item
```

will usually be the normal relationship.

The architecture simply should not permanently assume that is the only possible relationship.

---

# 10. Inventory Tracking Mode

A Variant should support an inventory-tracking policy.

Typical:

```text
TRACKED
```

Future/non-stock product:

```text
NOT_TRACKED
```

For tracked items, availability depends on Inventory.

For untracked items, Inventory does not control sellability.

Maevelle physical products should default to tracked inventory.

---

# 11. Inventory Level

An **Inventory Level** represents the inventory position of one Inventory Item at one stock-holding Location.

Conceptually:

```text
Inventory Item:
FD-RED-M

Location:
Dhaka Main Warehouse

Inventory Level:
quantities for FD-RED-M at Dhaka Main Warehouse
```

Shopify and Medusa use the same basic relationship: inventory is represented per inventory item and location rather than as one global product number.

---

# 12. Multi-Location Inventory

Example:

```text
Variant:
Red / M

Main Warehouse        20
Showroom               5
Secondary Warehouse    8
```

Aggregate:

```text
Total Physical Stock = 33
```

But each location remains independently authoritative for its own inventory.

---

# 13. Aggregate Quantity Is Derived

The Product page may show:

```text
Total Stock:
33
```

but this is an aggregate.

It must not become the source of truth.

Source:

```text
Inventory Item
  ↓
Inventory Levels
  ↓
Locations
```

---

# 14. Core Inventory Quantity Concepts

Maevelle should distinguish at least:

```text
ON HAND
SELLABLE ON HAND
UNAVAILABLE ON HAND
RESERVED
AVAILABLE TO SELL
INCOMING
IN TRANSIT
```

These are not interchangeable.

---

# 15. On Hand

**On Hand** means:

> Physical quantity currently present at a specific business inventory location.

It may contain both sellable and non-sellable inventory.

Example:

```text
Sellable       15
Damaged         2
Quarantine      3
-----------------
On Hand        20
```

---

# 16. Sellable On Hand

**Sellable On Hand** means:

> Physical stock currently present and approved for normal sale.

Example:

```text
On Hand:
20

Damaged:
2

Quarantine:
3

Sellable On Hand:
15
```

---

# 17. Unavailable On Hand

Physical inventory may be unavailable for normal selling.

Possible reasons:

```text
Damaged
Quarantine
Return Inspection
Quality Hold
Internal Hold
Other Controlled Reason
```

These units physically exist.

They simply cannot currently be sold.

---

# 18. Reserved

**Reserved** means:

> Sellable units already committed or temporarily held for a business transaction such as an Order.

Example:

```text
Sellable On Hand:
15

Reserved:
4
```

Those four units still physically exist.

They simply cannot be promised to another customer.

Medusa likewise treats reservation quantities separately from the physical inventory level and associates reservations with locations.

---

# 19. Available to Sell

Conceptually:

```text
Available To Sell
=
Sellable On Hand
-
Reserved
-
Safety Buffer
```

subject to configured overselling policy.

Example:

```text
Sellable On Hand    15
Reserved             4
Safety Buffer         1
-----------------------
Available To Sell    10
```

---

# 20. Available Is Derived

We should avoid allowing staff to independently edit:

```text
On Hand = 20
Available = 15
Reserved = 2
```

as unrelated numbers.

These values have relationships.

Changing physical stock, reservations or condition must automatically affect availability.

---

# 21. Incoming

**Incoming** means:

> Inventory expected to arrive at a location but not yet physically received.

Examples:

```text
Purchase shipment in transit
Warehouse transfer heading to destination
```

Incoming stock should normally not be treated as ordinary sellable On Hand.

Shopify likewise exposes `incoming` separately from current on-hand/available quantities.

---

# 22. In Transit

**In Transit** represents physical stock that has left one internal stock location but has not yet been received by another.

Example:

```text
Main Warehouse
      ↓
Transfer dispatched
      ↓
IN TRANSIT: 10
      ↓
Showroom receives
```

Those ten units should not simultaneously appear as normal stock in both warehouses.

---

# 23. Quantity Model

Conceptually:

```text
                    PHYSICAL INVENTORY
                           │
              ┌────────────┴────────────┐
              │                         │
         ON HAND                    IN TRANSIT
              │
      ┌───────┴──────────┐
      │                  │
   SELLABLE          UNAVAILABLE
                         │
                 ┌───────┼────────┐
                 │       │        │
              Damaged  Hold   Quarantine

SELLABLE
   │
   ├── Reserved
   │
   └── Available to Sell
```

`Incoming` represents expected inventory and is not yet part of physical On Hand.

---

# 24. Stock Condition

Inventory that is On Hand should have a meaningful condition/bucket when it is not normally sellable.

Minimum V1 conditions:

```text
SELLABLE
DAMAGED
QUARANTINE / INSPECTION
```

Potential future conditions:

```text
QUALITY_HOLD
RETURN_INSPECTION
EXPIRED
REPAIR
RECALLED
```

---

# 25. Why Damaged Inventory Should Not Simply Disappear

Suppose staff discovers:

```text
3 damaged dresses
```

A weak system does:

```text
Stock:
20 → 17
```

Now the system no longer knows what happened to the three units.

A stronger system records:

```text
SELLABLE    -3
DAMAGED     +3
```

Physical On Hand remains:

```text
20
```

until those damaged units are eventually disposed, repaired or otherwise removed.

---

# 26. Disposal

If damaged goods are later discarded:

```text
DAMAGED    -3
DISPOSED   +3 / leaves physical inventory
```

The business history can answer:

```text
Why did physical stock decrease?
```

Reason:

```text
Damaged inventory disposal
```

---

# 27. Quarantine / Inspection

Newly received or returned goods may need inspection.

Example:

```text
Purchase receipt:
20 units

Receiving policy:
Inspection required
```

Result:

```text
QUARANTINE +20
```

After inspection:

```text
18 → SELLABLE
 2 → DAMAGED
```

This is significantly safer than marking all received goods sellable before inspection.

---

# 28. Inventory Ledger

The **Inventory Ledger** is the historical record of quantity-changing inventory operations.

Conceptually:

```text
Date       Item       Location       Change    Reason

10 Aug     Red/M      Main WH        +20       Purchase Receipt
12 Aug     Red/M      Main WH         -2       Order Fulfillment
13 Aug     Red/M      Main WH         -1       Damage
14 Aug     Red/M      Main WH         -5       Transfer Dispatch
```

---

# 29. Ledger Entries Should Be Append-Oriented

Historical inventory movements should generally not be edited in place.

If an incorrect movement was posted:

```text
+20
```

and should have been:

```text
+18
```

the system should preferably create a controlled correction.

Example:

```text
Original Receipt     +20
Correction            -2
```

rather than secretly rewriting history.

---

# 30. Current Balance vs Ledger

We should distinguish:

```text
Inventory Ledger
=
Historical source of quantity movements
```

from:

```text
Inventory Balance / Level
=
Efficient current-state representation
```

The application should not need to scan millions of ledger lines every time it displays:

```text
Available: 14
```

The current balance can be maintained transactionally while the ledger provides traceability.

---

# 31. Ledger Is Not Only an Audit Log

Inventory Ledger and generic Audit Log have different purposes.

### Inventory Ledger

Answers:

```text
Why did quantity change?
```

### Audit Log

Answers:

```text
Who changed the business record/configuration?
What fields changed?
```

An inventory adjustment may create both.

---

# 32. Inventory Transaction

A single business action may affect multiple balances.

Therefore we should have the concept of an **Inventory Transaction** grouping related movement lines.

Example:

```text
Warehouse Transfer #TR-1022
```

could create:

```text
Transaction TR-1022

Line 1:
Main Warehouse / Sellable    -10

Line 2:
Transfer Transit             +10
```

and later:

```text
Transfer Receipt

Transit                      -10
Showroom / Sellable          +10
```

---

# 33. Movement Reference

Every inventory movement should reference its cause when applicable.

Examples:

```text
Order #MV-10482
Purchase Receipt #RCV-225
Transfer #TR-1022
Return #RET-441
Stocktake #COUNT-120
Manual Adjustment #ADJ-102
```

This allows navigation:

```text
Inventory History
→
Source Business Record
```

---

# 34. Movement Types

V1 should support controlled movement reasons/types.

Examples:

```text
OPENING_BALANCE

PURCHASE_RECEIPT
ORDER_FULFILLMENT
ORDER_CANCELLATION_RELEASE

CUSTOMER_RETURN
RETURN_RESTOCK
RETURN_DAMAGED

TRANSFER_DISPATCH
TRANSFER_RECEIPT
TRANSFER_LOSS
TRANSFER_DAMAGE

MANUAL_INCREASE
MANUAL_DECREASE

STOCKTAKE_CORRECTION

DAMAGE
DAMAGE_RECOVERY
DISPOSAL

QUARANTINE_IN
QUARANTINE_RELEASE
```

Exact naming will be refined during implementation.

---

# 35. Opening Balance

When migrating existing business inventory into Maevelle, the system needs controlled initial quantities.

This should use an explicit operation:

```text
OPENING BALANCE
```

rather than pretending the stock came from a purchase that never existed.

---

# 36. Opening Balance Information

Should capture:

```text
Inventory Item
Location
Quantity
Condition
Effective Date
Import / Migration Reference
Actor
Notes
```

Opening balances should require appropriate permission.

---

# 37. Manual Adjustment

Authorized users shall be able to correct stock.

But the workflow should never be simply:

```text
Stock:
20

Type:
17
```

Instead:

```text
Current:
20

Count / Target:
17

Difference:
-3

Reason:
[Required]

Notes:
[Optional]
```

---

# 38. Adjustment Reason

Controlled adjustment reasons may include:

```text
Physical Count Correction
Missing Item
Damage
Data Migration Correction
Administrative Correction
Found Inventory
Other
```

The business may create additional approved reasons.

---

# 39. Adjustment Permission

Viewing Inventory and modifying Inventory are separate permissions.

Potential capabilities:

```text
inventory.view

inventory.adjust
inventory.adjust_large

inventory.transfer

inventory.stocktake

inventory.condition_change
```

Sensitive operations may require stronger permission.

---

# 40. Large Adjustment Protection

Changing:

```text
500
→
5
```

should receive significantly more attention than:

```text
500
→
499
```

The system should support safeguards for unusually large adjustments.

Potential:

```text
Warning
Reason required
Explicit confirmation
Optional approval later
```

---

# 41. Reservation

A **Reservation** represents a claim against sellable inventory.

Conceptually:

```text
Reservation

Inventory Item
Location
Quantity
Source
Source Reference
Status
Created
Expires At where applicable
```

---

# 42. Reservations Are Location-Aware

Example:

```text
Red / M

Main Warehouse:
10 available

Showroom:
5 available
```

An order reservation should indicate which location is holding the units.

That prevents both locations from assuming the other location will fulfill the order.

---

# 43. One Order Line May Have Multiple Reservations

Future or partial fulfillment scenario:

```text
Order requires:
5 × Red/M
```

Inventory:

```text
Main Warehouse      3
Secondary Warehouse 2
```

The architecture should allow:

```text
Reservation A:
Main Warehouse × 3

Reservation B:
Secondary Warehouse × 2
```

even if V1 normally tries to fulfill from one location.

---

# 44. Reservation Lifecycle

Conceptually:

```text
CREATED
   ↓
ACTIVE
   ↓
┌───────────────┬───────────────┬──────────────┐
│               │               │              │
CONSUMED      RELEASED        EXPIRED       CANCELLED
```

The exact state model can be simplified during implementation.

---

# 45. Reservation Creation

Inventory must perform an atomic availability check.

Conceptually:

```text
Requested:
2

Available:
2

Create reservation:
2
```

must be one safe operation.

It must not be:

```text
1. Read Available = 2
2. Wait
3. Another Order reserves 2
4. First Order also reserves 2
```

---

# 46. Cart Does Not Guarantee Inventory

Adding an item to a cart should normally **not** permanently reserve inventory.

Otherwise customers could fill carts and lock stock without placing orders.

Therefore:

```text
Cart availability
=
informational/current check
```

while final purchasing uses authoritative reservation logic.

---

# 47. Final Checkout Validation

At final order placement/confirmation:

```text
Revalidate Variant
Revalidate Price
Revalidate Availability
Attempt Reservation
```

This must happen server-side.

A stale browser cannot be trusted.

---

# 48. Reservation Timing

The precise moment an Order receives a reservation belongs to Order Lifecycle policy.

Inventory should support:

```text
Create Reservation
Release Reservation
Consume Reservation
Expire Reservation
```

without hard-coding:

```text
Every Pending Order always reserves forever.
```

Possible policies could later reserve at:

```text
Order Placement
Order Confirmation
Payment Authorization
```

depending on the business workflow.

---

# 49. Temporary Reservation

The architecture should support expiry where necessary.

Example:

```text
Payment session reservation
```

may expire after a configured period if the Order/payment never completes.

Expired reservation:

```text
Reserved -1
Available +1
```

without changing physical On Hand.

---

# 50. Confirmed COD Orders

Cash-on-delivery workflows may require longer reservations because payment does not happen before delivery.

Order Architecture will define exactly which order state controls this.

Inventory simply provides the required reservation mechanics.

---

# 51. Reservation Consumption

Suppose:

```text
Sellable:
10

Reserved:
2

Available:
8
```

Then the two reserved units are fulfilled.

Correct transition:

```text
Sellable:
8

Reserved:
0

Available:
8
```

Notice:

```text
Available remains 8.
```

Why?

Before fulfillment, two units were physically present but promised.

After fulfillment, those two units physically left the business.

This is an important correctness property.

---

# 52. Reservation Release

Suppose:

```text
Sellable:
10
Reserved:
2
Available:
8
```

Order is cancelled.

Result:

```text
Sellable:
10
Reserved:
0
Available:
10
```

Physical stock never left.

Only the commercial commitment disappeared.

---

# 53. Overselling

The business should have an explicit overselling policy.

Possible policies:

```text
NEVER_OVERSELL

ALLOW_OVERSALE
```

Potential later:

```text
ALLOW_UP_TO_LIMIT
```

---

# 54. Default V1 Policy

Recommended default for Maevelle:

```text
NEVER_OVERSELL
```

because physical imported fashion inventory is limited.

Overselling should require deliberate configuration.

---

# 55. Negative Availability

Under strict no-oversell mode:

```text
Available To Sell
```

should not normally become negative through ordinary customer ordering.

Administrative corrections may reveal negative physical reality, but those cases should be surfaced as exceptions.

---

# 56. Safety Stock / Buffer

Optional safety quantity can prevent the storefront from consuming every final physical unit.

Example:

```text
Sellable:
10

Reserved:
1

Safety Buffer:
2

Available:
7
```

Use cases:

- warehouse discrepancy protection;
- keep one unit for showroom;
- avoid selling uncertain final stock.

---

# 57. Safety Stock Scope

A safety buffer may eventually exist:

```text
Per Inventory Item + Location
```

or through reusable policy.

V1 can begin with a simple optional quantity.

---

# 58. Low Stock Threshold

Separate from Safety Stock:

```text
Low Stock Threshold:
5
```

means:

> Alert users when available stock becomes 5 or below.

It does not necessarily prevent sale.

---

# 59. Out of Stock

A tracked Variant is considered unavailable when:

```text
Available To Sell <= 0
```

subject to overselling configuration.

The Product may still remain publicly visible.

---

# 60. Incoming Inventory

Incoming quantity can originate from:

```text
Supplier Purchase / Shipment
Warehouse Transfer
```

Incoming represents expectation, not reality.

---

# 61. Incoming Must Be Explainable

Dashboard:

```text
Incoming:
40
```

should allow the user to see:

```text
30 — Shipment SH-101
10 — Transfer TR-204
```

not merely a mysterious aggregate.

---

# 62. Purchase Receiving

When purchased goods physically arrive:

```text
Incoming
      ↓
Receive
      ↓
On Hand
```

The receiving operation must reference Procurement.

---

# 63. Partial Receiving

Example Purchase:

```text
Ordered:
100
```

Shipment arrives:

```text
Received:
80
```

Inventory records only:

```text
+80
```

The remaining:

```text
20
```

remain outstanding/incoming according to Procurement state.

---

# 64. Multiple Receipts

Purchase:

```text
100 units
```

may arrive:

```text
Receipt 1: 50
Receipt 2: 30
Receipt 3: 20
```

Each receiving operation creates separate inventory movements.

---

# 65. Over-Receiving

Supplier sends:

```text
Ordered:
100

Actual:
103
```

The system should not silently treat this as impossible.

V1 should support controlled over-receiving with:

```text
Warning
Permission / policy
Recorded actual quantity
```

Procurement handles purchase implications.

Inventory records what physically arrived.

---

# 66. Under-Receiving

Likewise:

```text
Ordered:
100
Received:
97
```

Inventory must reflect:

```text
97
```

not the expected 100.

Procurement records remaining/short quantity and eventual resolution.

---

# 67. Receiving Condition

Depending on workflow:

```text
Received Stock
      ↓
SELLABLE
```

or:

```text
Received Stock
      ↓
QUARANTINE
      ↓
Inspection
      ↓
SELLABLE / DAMAGED
```

This should be configurable operational behavior.

---

# 68. Inventory Receiving Does Not Finalize Landed Cost

Physical stock may arrive before every final shipping/customs expense is known.

Therefore:

```text
Inventory Quantity
```

and:

```text
Landed Cost Finalization
```

must not be unnecessarily coupled.

The system can receive quantity while costing remains estimated/reconciling.

---

# 69. Cost Is Not Inventory Quantity

Inventory tracks:

```text
How many?
Where?
What condition?
```

Landed Cost / Costing tracks:

```text
What did those units cost?
```

The domains integrate but remain separate.

---

# 70. Customer Returns

A customer returning an item should not automatically cause:

```text
Available +1
```

at the instant the return request is created.

The item has not necessarily physically returned yet.

---

# 71. Return Receipt

When the item arrives:

```text
Returned Item
      ↓
RETURN INSPECTION / QUARANTINE
```

Recommended default.

After inspection:

```text
Restockable
      ↓
SELLABLE
```

or:

```text
Damaged
      ↓
DAMAGED
```

---

# 72. Returned Item States

Conceptually:

```text
Returned
   ↓
Inspection
   ↓
┌───────────────┬────────────────┬──────────────┐
│               │                │              │
Restock       Damaged          Repair        Dispose
```

V1 primarily needs:

```text
Restock
Damaged
```

but should not make future dispositions impossible.

---

# 73. Exchange

Future exchanges may generate:

```text
Return of Variant A
+
New fulfillment of Variant B
```

Inventory should treat these as normal return/restock and fulfillment operations connected through the exchange workflow.

No special inventory arithmetic is needed.

---

# 74. Warehouse Transfer

Inventory transfers must be controlled workflows.

A transfer is not:

```text
Warehouse A: -10
Warehouse B: +10
```

performed simultaneously at creation time.

That incorrectly implies goods instantly teleported.

---

# 75. Transfer Lifecycle

Recommended concept:

```text
DRAFT
   ↓
READY
   ↓
DISPATCHED
   ↓
IN TRANSIT
   ↓
RECEIVED
```

Potential exception:

```text
CANCELLED
```

Exact naming belongs to Warehouse Architecture.

---

# 76. Transfer Creation

Creating a draft transfer does not necessarily modify physical inventory.

Example:

```text
Transfer planned:
10 units
```

Possible reservation/hold behavior can later be configured.

---

# 77. Transfer Dispatch

At dispatch:

```text
Source Sellable:
-10

In Transit:
+10
```

The destination may simultaneously show:

```text
Incoming:
+10
```

as an expectation.

---

# 78. Transfer Receive

At destination:

```text
In Transit:
-10

Destination On Hand / Sellable:
+10

Destination Incoming:
-10
```

depending on inspection policy.

---

# 79. Transfer Discrepancy

Sent:

```text
10
```

Destination receives:

```text
9
```

The system must not simply pretend ten arrived.

Possible outcome:

```text
Received:
9

Transfer Variance:
1 Missing
```

which must be resolved operationally.

---

# 80. Transfer Damage

Sent:

```text
10
```

Received:

```text
9 Sellable
1 Damaged
```

Valid inventory result:

```text
Destination Sellable +9
Destination Damaged  +1
Transit              -10
```

---

# 81. Transfer Cancellation

If transfer is still Draft:

```text
Cancel
```

may have no physical effect.

If already dispatched:

```text
Cancel
```

should not magically return stock.

A reversal/return-transfer workflow may be required.

---

# 82. Stocktake

A **Stocktake** is a structured physical count of inventory.

This is different from manually editing one item's quantity.

Example:

```text
Main Warehouse
Physical Inventory Count
20 August 2026
```

---

# 83. Stocktake Purpose

The business wants to compare:

```text
System Quantity
vs
Physical Quantity
```

and reconcile differences.

---

# 84. Stocktake Lifecycle

Recommended:

```text
DRAFT
   ↓
COUNTING
   ↓
REVIEW
   ↓
POSTED
```

or:

```text
CANCELLED
```

---

# 85. Count Entry

Example:

```text
SKU        System      Counted      Difference

RED-S        20          20             0
RED-M        18          17            -1
RED-L         8          10            +2
```

---

# 86. Posting Stocktake

Posting creates inventory adjustment transactions.

Example:

```text
RED-M   -1
Reason: STOCKTAKE_CORRECTION

RED-L   +2
Reason: STOCKTAKE_CORRECTION
```

The original count remains preserved.

---

# 87. Stocktake Must Not Rewrite History

The system should not alter past receipts/orders to force inventory to match the count.

The discrepancy becomes a new correction.

---

# 88. Blind Count — Future/Preferred

For more reliable counting, users may optionally perform:

```text
Blind Count
```

where the employee does not see the expected quantity before entering the physical count.

This reduces confirmation bias.

Can be a V1 enhancement rather than mandatory launch functionality.

---

# 89. Full vs Partial Stocktake

The system should support:

```text
Full Location Count
```

and eventually:

```text
Partial / Selected Inventory Count
```

V1 can begin with both if practical.

---

# 90. Cycle Counts

Future warehouse maturity may introduce scheduled cycle counting.

Example:

```text
High-value SKUs:
weekly

Normal SKUs:
monthly
```

Not necessary for first release.

---

# 91. Concurrent Stocktake Changes

A stocktake may take hours while orders continue.

This creates an important problem.

System quantity at:

```text
Count Start
```

may differ by:

```text
Count Submit
```

because orders occurred.

Therefore stocktake reconciliation needs a clear strategy.

---

# 92. V1 Stocktake Strategy

The system should record:

```text
Count Session Start
Expected Baseline
Physical Count
Inventory movements during counting
Final reconciliation
```

or restrict counting operations appropriately.

We should not simply compare against whatever quantity happens to exist at submission time without context.

Detailed algorithm can be finalized during Inventory implementation.

---

# 93. Inventory Availability Across Warehouses

A Product may have:

```text
Main WH       3
Showroom      2
Secondary     4
```

Total available:

```text
9
```

But whether storefront may sell all nine depends on fulfillment configuration.

---

# 94. Fulfillable Inventory

Not every warehouse necessarily fulfills online orders.

Example:

```text
Main Warehouse:
Online fulfillment enabled

Showroom:
Online fulfillment disabled

Secondary:
Online fulfillment enabled
```

Then storefront available quantity may be:

```text
Main + Secondary
```

not total organization inventory.

Warehouse Architecture will define these policies.

---

# 95. Location Eligibility

Inventory availability for a storefront/order must consider:

```text
Inventory exists?
Location active?
Location allowed to fulfill?
Inventory condition sellable?
Reservation state?
Safety stock?
Order/channel policy?
```

Therefore:

```text
Organization Total Stock
```

does not automatically equal:

```text
Storefront Available Stock
```

---

# 96. Warehouse Selection

When an Order requires inventory, some process must choose a fulfillment location.

Potential V1 strategies:

```text
Manual Selection

Priority Warehouse

Highest Available Stock
```

Saleor exposes warehouse allocation strategies for similar stock-allocation decisions.

The detailed strategy belongs to Warehouse / Fulfillment Architecture.

---

# 97. Default V1 Allocation

A practical V1 default may be:

```text
Configured Warehouse Priority
```

Example:

```text
1. Main Warehouse
2. Secondary Warehouse
3. Showroom
```

subject to availability.

But staff should retain manual override when permitted.

---

# 98. Split Allocation

If no single warehouse has sufficient inventory:

```text
Order:
5 units

Main:
3

Secondary:
2
```

The architecture should support split reservations.

V1 UX may initially prefer to avoid automatic splitting unless necessary.

---

# 99. Inventory Concurrency

Inventory is one of the project's strongest concurrency requirements.

Consider:

```text
Available:
1
```

Customer A attempts purchase.

Customer B attempts purchase at exactly the same time.

Both requests may observe:

```text
Available = 1
```

A naïve system sells both.

---

# 100. Concurrency Requirement

Availability checking and reservation creation must use a safe concurrency mechanism.

Possible implementation mechanisms later include:

```text
Database transactions
Row-level locking
Atomic conditional update
Serializable operation
Optimistic concurrency with retry
```

Exact implementation depends on schema and workload.

The invariant is:

> Two successful reservations cannot consume the same strictly limited inventory.

---

# 101. Database Is the Final Authority

Frontend state such as:

```text
Only 1 left!
```

is not authoritative.

The server-side transactional operation makes the final decision.

---

# 102. Inventory Transaction Boundary

Critical operations should execute atomically.

Example:

```text
Confirm Order
   ↓
Create/Update Reservation
   ↓
Write Inventory transaction
   ↓
Write Order timeline
```

must avoid leaving impossible partial state.

Cross-domain transaction orchestration will be defined in application architecture.

---

# 103. Idempotency

Inventory commands originating from retryable APIs need duplicate protection.

Example:

```text
POST /receive-purchase
```

times out after server completed the operation.

Client retries.

Without idempotency:

```text
+20
+20
=
40
```

instead of 20.

Critical inventory mutations therefore need idempotency/replay protection.

---

# 104. Idempotent Source Operations

Examples:

```text
Purchase Receipt
Transfer Receipt
Order Fulfillment
Return Restock
External Inventory Adjustment
```

should not be capable of posting twice merely because a network request was repeated.

---

# 105. Duplicate Event Protection

Future webhooks/queues may redeliver events.

Inventory consumers must assume:

```text
At-least-once delivery can happen.
```

Source/reference identities should prevent duplicate quantity movement.

---

# 106. No Direct Balance Mutation

Business code outside Inventory should not perform operations equivalent to:

```text
inventory_level.available -= 2
```

directly.

Instead:

```text
Inventory.reserve(...)
Inventory.fulfill(...)
Inventory.receive(...)
Inventory.adjust(...)
```

or equivalent domain/application commands.

This centralizes invariants.

---

# 107. Negative Physical Stock

Under normal strict inventory control:

```text
Sellable On Hand < 0
```

should generally be prohibited.

However migrations or reconciliation errors may reveal inconsistent data.

Such exceptions should be:

```text
Detected
Logged
Surfaced
Corrected deliberately
```

rather than silently hidden.

---

# 108. Inventory Consistency Check

The platform should provide operational integrity checks.

Potential checks:

```text
Reserved > Sellable On Hand

Negative quantities

Reservation references missing Order

Transfer transit mismatch

Inventory Level without valid Item/Location

Impossible bucket totals
```

---

# 109. Reconciliation Tool

Later or preferably as an admin diagnostic:

```text
Inventory Health
```

can identify suspicious records.

V1 should at least support internal consistency checks and operator visibility.

---

# 110. Inventory Item Detail Page

Recommended page structure:

```text
Inventory Item
FD-RED-M

Overview
├── Total On Hand
├── Available
├── Reserved
├── Incoming
└── Low Stock

Locations
├── Main Warehouse
├── Showroom
└── Secondary

Reservations

Incoming

Movement History

Related
├── Product / Variant
├── Purchases
└── Orders
```

---

# 111. Inventory Overview Page

Default Inventory list should focus on operational decisions.

Potential columns:

```text
SKU / Item
Product / Variant
On Hand
Available
Reserved
Incoming
Locations
Low Stock Status
Updated
```

---

# 112. Location Inventory View

Warehouse page should provide:

```text
SKU
Product
Sellable
Reserved
Available
Unavailable
Incoming
```

for that location.

---

# 113. Inventory Search

Search should support:

```text
SKU
Barcode
Product Title
Variant
```

Potential later:

```text
Supplier reference
Warehouse bin
```

---

# 114. Inventory Filters

Useful filters:

```text
Location
Availability
Out of Stock
Low Stock
Reserved
Incoming
Damaged
Inventory Tracking Mode
Product Type
Category
```

---

# 115. Saved Views

Examples:

```text
Out of Stock
Low Stock
Incoming This Week
Damaged Inventory
Main Warehouse Problems
Reserved Stock
```

Shared dashboard saved-view infrastructure can support these.

---

# 116. Bulk Operations

V1 should support safe bulk workflows such as:

```text
Bulk Adjustment Import
Low-Stock Threshold Update
Inventory Export
Stocktake Count Entry
```

Potentially:

```text
Bulk location activation
```

through Warehouse tooling.

---

# 117. Spreadsheet Import

Inventory import can be extremely dangerous.

Therefore CSV/XLSX adjustment workflow should never silently overwrite stock.

Recommended process:

```text
Upload
   ↓
Map Columns
   ↓
Validate
   ↓
Preview Current vs Proposed
   ↓
Show Difference
   ↓
Confirm
   ↓
Create Inventory Adjustment Transaction
```

---

# 118. Import Example

Uploaded:

```text
SKU        Warehouse      Count
FD-R-S     Main            20
FD-R-M     Main            18
```

Preview:

```text
SKU       Current   Imported   Difference

FD-R-S      19         20         +1
FD-R-M      21         18         -3
```

Only the differences become inventory movements.

---

# 119. Never Treat Import as Hidden Database Replacement

Every imported inventory change should still be:

```text
Traceable
Auditable
Attributed to Import
```

---

# 120. Inventory Export

Export should support:

```text
Inventory Item
SKU
Product
Variant
Location
On Hand
Sellable
Reserved
Available
Damaged/Hold
Incoming
```

according to permission.

---

# 121. Inventory Notifications

Potential V1 notifications:

```text
Low Stock
Out of Stock
Large Adjustment
Transfer Overdue
Inventory Discrepancy
```

Notification details should link directly to the relevant record.

---

# 122. Inventory Analytics

Useful operational metrics:

```text
Current Stock
Inventory by Location
Low Stock
Out of Stock
Damaged Quantity
Incoming Quantity
Stock Movement
Adjustment Frequency
```

Later:

```text
Sell-through
Inventory Turnover
Days of Stock
Dead Stock
Stock Aging
Forecasting
```

---

# 123. Inventory Value Is Separate

Analytics may eventually show:

```text
Inventory Value
```

but this requires Costing/Landed-Cost rules.

Inventory provides quantities.

Costing provides:

```text
Unit Cost
Cost Layer
Valuation Method
```

We should not simply calculate:

```text
Current Stock × Latest Purchase Price
```

and pretend that is always financially correct.

---

# 124. Lot / Batch Tracking — Future

Some future businesses may require:

```text
Batch Number
Manufacturing Date
Expiry Date
Lot Traceability
```

particularly:

```text
Cosmetics
Food
Health products
```

Not required for Maevelle V1.

But Inventory Item identity and movement architecture should not make later lot-level subtracking impossible.

---

# 125. Serial Number Tracking — Future

Future products may need individual serial identities:

```text
Phone IMEI
Laptop Serial Number
Luxury Item Serial
```

This is different from ordinary quantity inventory.

Not V1.

---

# 126. Expiration Management — Future

Lot/batch inventory may later enable:

```text
Expiry Alerts
FEFO
Expired Inventory Hold
```

Not required now.

---

# 127. Bundle Inventory — Future

A future bundle:

```text
Gift Set
=
1 Bag
1 Wallet
1 Keychain
```

may have availability derived from component inventory.

Medusa's separation of Product Variants and Inventory Items also accommodates inventory kits/multi-part relationships.

Detailed bundle design is deferred.

---

# 128. Packaging Inventory — Future

The business may eventually track:

```text
Boxes
Courier Bags
Gift Bags
Tape
Labels
```

using the same Inventory domain even though these are not customer-sellable Catalog Products.

This is another reason Inventory Item should not be identical to Product Variant.

---

# 129. Internal Consumables — Future

Inventory could eventually represent:

```text
Packaging supplies
Warehouse materials
Office stock
```

without publishing them to Storefront.

No V1 UI needed.

---

# 130. Inventory Location Relationship

Inventory references:

```text
Location ID
```

but Warehouse / Location domain owns:

```text
Location Name
Address
Type
Status
Fulfillment Capability
Priority
Operational Configuration
```

---

# 131. Location Deactivation

A warehouse containing stock cannot simply disappear.

Deactivation should:

```text
Prevent new operational use
Preserve existing inventory/history
Warn about remaining stock
Require stock relocation where appropriate
```

Detailed behavior belongs in Warehouse Architecture.

---

# 132. Inventory Level Activation

An Inventory Item does not necessarily need a level in every business location.

Example:

```text
FD-RED-M
```

may be stocked only at:

```text
Main Warehouse
Showroom
```

not all future locations.

Shopify likewise connects inventory items only to locations where that item is stocked.

---

# 133. Zero Quantity Levels

A valid Inventory Level may exist with:

```text
On Hand = 0
```

This should not automatically delete the relationship.

Historical/operational configuration may still matter.

---

# 134. Inventory Reservations Page

Operational users should be able to inspect active reservations.

Medusa's current admin similarly exposes reservations as inspectable inventory records with SKU, quantity, location and related data.

Potential columns:

```text
SKU
Product
Location
Quantity
Source Order
Created
Expires
Status
```

---

# 135. Manual Reservation

V1 does not necessarily need ordinary staff to manually create arbitrary reservations.

Reservations should primarily originate from controlled business workflows.

Future examples:

```text
Wholesale hold
VIP hold
Event stock hold
```

may justify explicit manual reservations.

---

# 136. Stock Hold

A **Hold** and a **Reservation** are conceptually different.

Reservation:

```text
Committed to a transaction/customer/order
```

Hold:

```text
Administratively unavailable for sale
```

V1 can represent administrative hold through unavailable stock condition rather than creating fake Orders.

---

# 137. Transfer Reservation

When a transfer is approved but not dispatched, source stock may need to become unavailable to orders.

Possible approach:

```text
Transfer Reservation
```

or:

```text
Internal Hold
```

Detailed workflow will be finalized in Warehouse Architecture.

The key requirement:

> Approved transfer stock must not accidentally be simultaneously promised to a customer.

---

# 138. Incoming Transfer vs Procurement Incoming

Both may contribute to an aggregate:

```text
Incoming
```

but the UI should distinguish source:

```text
Supplier Shipment
Internal Transfer
```

---

# 139. Inventory Timeline

For a specific SKU/location:

```text
Aug 10   Purchase Receipt        +20
Aug 11   Order Reservation        0 physical / +2 reserved
Aug 12   Order Fulfillment        -2 / reservation consumed
Aug 14   Damage                   -1 sellable / +1 damaged
Aug 15   Transfer Dispatch        -5
```

The interface should make history understandable to business users rather than exposing raw accounting-style database lines only.

---

# 140. Balance After Movement

Movement history should preferably show:

```text
Change
+
Resulting Balance
```

where useful.

Example:

```text
Before:
20

Movement:
-2 Order Fulfillment

After:
18
```

This greatly improves troubleshooting.

---

# 141. Correcting Wrong Location

Suppose a receipt was accidentally posted to:

```text
Showroom
```

instead of:

```text
Main Warehouse
```

Do not simply edit the original location after subsequent inventory movements occurred.

Use a controlled correction:

```text
Showroom      -20
Main WH       +20
```

linked to the correction transaction.

---

# 142. Correcting Wrong Variant

Same principle.

Wrong:

```text
Red / M +10
```

should have been:

```text
Red / L +10
```

Correction:

```text
Red / M -10
Red / L +10
```

with reason/reference.

---

# 143. Immutable Historical Meaning

Once inventory movement has influenced later operations, editing it in place can rewrite history.

Therefore:

> Post corrective transactions instead of rewriting historical reality.

This should become a general financial/operational design principle throughout Maevelle.

---

# 144. Audit Integration

Important inventory actions should produce Audit events.

Examples:

```text
Inventory Adjustment
Transfer Creation
Transfer Dispatch
Transfer Receipt
Condition Change
Stocktake Posting
Inventory Policy Change
Threshold Change
```

Audit captures:

```text
Actor
Timestamp
Action
Entity
Important before/after context
```

---

# 145. Inventory Ledger Actor

Ledger transaction should also carry operational source.

Examples:

```text
System
User
Order Workflow
Procurement Workflow
Import
Integration
```

This is different from generic audit metadata but may overlap.

---

# 146. Inventory Permissions

Recommended capabilities:

```text
inventory.view

inventory.history.view

inventory.adjust

inventory.adjust_large

inventory.receive

inventory.condition.manage

inventory.transfer.create
inventory.transfer.dispatch
inventory.transfer.receive

inventory.stocktake.create
inventory.stocktake.count
inventory.stocktake.post

inventory.settings.manage
```

Exact grouping will be finalized with Access Architecture.

---

# 147. Sensitive Cost Separation

A warehouse employee may need:

```text
Inventory quantities
```

without permission to view:

```text
Landed Costs
Purchase Costs
Profit Margin
```

Inventory APIs/UI must respect this separation.

---

# 148. Inventory API Commands

Rather than generic unrestricted quantity updates, application interfaces should expose business operations.

Examples:

```text
getAvailability()

reserveInventory()

releaseReservation()

consumeReservation()

receiveInventory()

adjustInventory()

changeCondition()

dispatchTransfer()

receiveTransfer()

postStocktake()
```

Names are conceptual, not final API signatures.

---

# 149. Inventory API Queries

Potential read operations:

```text
Get Inventory Item

Get Inventory Levels

Get Availability

Get Reservations

Get Movement History

Get Incoming Quantity

Get Location Inventory

Get Low Stock

Get Inventory Health
```

---

# 150. Structured Errors

Examples:

```text
INSUFFICIENT_INVENTORY

INVENTORY_ITEM_NOT_TRACKED

LOCATION_NOT_ELIGIBLE

RESERVATION_ALREADY_CONSUMED

TRANSFER_ALREADY_RECEIVED

DUPLICATE_RECEIPT

STOCKTAKE_ALREADY_POSTED
```

Callers should not need to parse arbitrary error strings.

---

# 151. Domain Events

Potential internal events:

```text
inventory.received

inventory.adjusted

inventory.reserved

inventory.reservation_released

inventory.fulfilled

inventory.low_stock

inventory.out_of_stock

inventory.condition_changed

inventory.transfer_dispatched

inventory.transfer_received

inventory.stocktake_posted
```

---

# 152. Event Consumers

These may later trigger:

```text
Notifications
Search availability update
Analytics projection
Webhooks
Courier/fulfillment workflows
Reorder recommendation
```

V1 does not need distributed event-streaming infrastructure.

Internal application events are sufficient.

---

# 153. Search Projection

Storefront Search may need:

```text
In Stock
Out of Stock
Available Sizes
Available Colors
```

These are derived from Inventory.

Search index should update from inventory events.

But Search is not authoritative for purchasing.

---

# 154. Search Availability Can Be Slightly Stale

A search listing might temporarily display:

```text
In Stock
```

while another customer purchases the last item milliseconds later.

That is acceptable.

Checkout must perform authoritative transactional validation.

---

# 155. Cache Rule

Inventory availability is more volatile than Product content.

Therefore inventory caching needs conservative freshness/invalidation.

Never allow a cache to become the final authority for reservation.

---

# 156. Performance

Inventory list pages should not independently count millions of historical ledger lines for every row.

Use efficient maintained balances/projections.

Ledger remains historical evidence.

---

# 157. Indexing

Later database design should explicitly index common access patterns such as:

```text
Inventory Item + Location

SKU

Active Reservation by Item + Location

Movement by Inventory Item + Date

Movement by Source Reference

Low Stock / Availability
```

Exact indexes come during schema design.

---

# 158. Transaction Volume

Inventory Ledger may become one of the fastest-growing operational datasets.

Even a small business can generate many movements through:

```text
Orders
Returns
Transfers
Receiving
Adjustments
```

Therefore pagination and archival/query strategy must be considered from the beginning.

---

# 159. Inventory History Pagination

Movement history must use scalable pagination.

Never:

```text
SELECT all history forever
```

for one API request.

---

# 160. External Inventory Integration — Future

Future businesses may synchronize inventory with:

```text
ERP
POS
Marketplace
External Warehouse
```

Such integrations must use controlled adjustment/synchronization operations rather than direct database writes.

---

# 161. External Source Identity

Future sync operations should store:

```text
Provider
External Reference
Idempotency Identity
Timestamp
```

to avoid duplicate adjustments.

---

# 162. POS / Showroom Future

If Maevelle later sells through a physical shop:

```text
Showroom Sale
```

can create ordinary inventory fulfillment movements against the Showroom location.

This does not require a separate stock model.

---

# 163. Reserved vs Allocated Terminology

Different commerce systems use both terms.

Saleor calls stock committed to unfulfilled order lines an allocation, while Medusa uses reservations.

For Maevelle, the preferred general term will be:

# Reservation

because it communicates:

> This quantity is being held for a transaction.

If Fulfillment later needs a narrower concept of allocation, we may introduce it separately.

---

# 164. Inventory State Example

Assume:

```text
Variant:
Black / M

Main Warehouse
```

Physical:

```text
20 units
```

Conditions:

```text
Sellable     17
Damaged       2
Quarantine    1
```

Reservations:

```text
4
```

Safety stock:

```text
1
```

Therefore:

```text
On Hand             = 20

Sellable On Hand    = 17

Unavailable On Hand = 3

Reserved            = 4

Safety Buffer       = 1

Available To Sell   = 12
```

And separately:

```text
Incoming            = 30
```

The 30 incoming units do not increase current On Hand.

---

# 165. Purchase Example

Before:

```text
Sellable:
10
```

Purchase shipment:

```text
Incoming:
20
```

Before receipt:

```text
Sellable = 10
Incoming = 20
```

Receive 20 into inspection:

```text
Sellable   = 10
Quarantine = 20
Incoming   = 0
On Hand    = 30
```

Inspect:

```text
18 good
2 damaged
```

Result:

```text
Sellable = 28
Damaged  = 2
On Hand  = 30
```

---

# 166. Order Example

Starting:

```text
Sellable = 10
Reserved = 0
Available = 10
```

Order reserves 2:

```text
Sellable = 10
Reserved = 2
Available = 8
```

Fulfill order:

```text
Sellable = 8
Reserved = 0
Available = 8
```

---

# 167. Cancellation Example

Starting:

```text
Sellable = 10
Reserved = 2
Available = 8
```

Order cancelled:

```text
Sellable = 10
Reserved = 0
Available = 10
```

No physical movement occurred.

---

# 168. Return Example

Order fulfilled earlier:

```text
Sellable:
8
```

Customer returns 1.

At receipt:

```text
Sellable:
8

Return Inspection:
1

On Hand:
9
```

After inspection:

```text
Restockable
```

result:

```text
Sellable:
9

Return Inspection:
0
```

---

# 169. Damage Example

Current:

```text
Sellable:
20
```

Staff finds 2 damaged units.

Movement:

```text
SELLABLE   -2
DAMAGED    +2
```

Result:

```text
On Hand:
20

Sellable:
18

Damaged:
2
```

---

# 170. Disposal Example

Later discard those two damaged items:

```text
DAMAGED:
-2
```

Physical On Hand becomes:

```text
18
```

History still explains why.

---

# 171. Transfer Example

Main Warehouse:

```text
Sellable:
20
```

Transfer 5 to Showroom.

At dispatch:

```text
Main Sellable:
15

Transit:
5

Showroom Incoming:
5
```

At receipt:

```text
Transit:
0

Showroom Incoming:
0

Showroom Sellable:
+5
```

No stock duplication occurs.

---

# 172. Stocktake Example

System:

```text
Red / M:
20
```

Physical count:

```text
18
```

Post stocktake:

```text
Adjustment:
-2

Reason:
Physical Count Variance
```

History remains:

```text
Previous Balance 20
Correction       -2
Current Balance  18
```

---

# 173. Failure Scenario — Order Reservation

Suppose reservation operation fails.

The Order workflow must know:

```text
Reservation did not succeed.
```

It must not proceed as if stock is secured.

Order Architecture will define whether order creation rolls back or enters an exception state.

---

# 174. Failure Scenario — Fulfillment

Suppose courier workflow succeeds but Inventory fulfillment fails.

The system must surface an operational inconsistency.

It must not silently continue.

Cross-domain orchestration needs:

```text
Retry
Idempotency
Compensation / reconciliation
Operator visibility
```

---

# 175. Failure Scenario — Transfer Receipt Retry

User presses:

```text
Receive
```

Network times out.

They press again.

The second attempt must detect:

```text
Transfer already received
```

rather than adding the inventory twice.

---

# 176. Failure Scenario — Purchase Receipt Retry

Same rule.

Receipt identity must ensure:

```text
20 units
```

cannot accidentally become:

```text
40 units
```

through retry.

---

# 177. Failure Scenario — Concurrent Adjustment

Two staff modify the same inventory item.

The system must use appropriate concurrency/version checks so that one update does not silently discard the other.

---

# 178. Failure Scenario — Location Deactivated

An Order attempts to reserve from a Location that became unavailable.

Reservation must re-evaluate eligibility transactionally.

Do not trust a previous browser selection indefinitely.

---

# 179. Failure Scenario — Reservation Expiry During Checkout

If a temporary reservation expires before final completion, checkout must attempt to reacquire inventory.

It must not assume the expired stock is still available.

---

# 180. Inventory Health Dashboard — Preferred

A small operational health view could surface:

```text
Negative / Impossible Balances
Stale Reservations
Overdue Transfers
Unresolved Transfer Variances
Low Stock
Out of Stock
Large Recent Adjustments
Unposted Stocktakes
```

This is extremely useful for a serious business system.

---

# 181. Data Retention

Inventory movements are commercially important records.

They should have long retention.

Archive strategy may be used for performance, but operational history should not be casually deleted.

---

# 182. Privacy

Inventory itself contains relatively little customer information.

Movement references should avoid copying unnecessary personal information from Orders.

Use:

```text
Order ID / Reference
```

rather than duplicating customer data into inventory ledger records.

---

# 183. Inventory and Product Archive

Archiving a Product or Variant does not delete its Inventory history.

If physical stock remains, the portal must clearly surface it.

Example:

```text
Archived Variant
Stock Remaining: 18
```

The user may need to:

```text
Reactivate
Transfer
Adjust
Dispose
```

before fully retiring it.

---

# 184. Variant Deactivation

A disabled Variant with inventory:

```text
Stock = 12
```

should not automatically delete/zero stock.

The stock still physically exists.

Only commercial sellability changes.

---

# 185. SKU Rename

Changing:

```text
FD-RED-M
→
MV-FD-R-M
```

does not create a new Inventory Item.

Inventory Item identity is stable.

Historical movements can preserve SKU snapshots/display context where useful.

---

# 186. Inventory Item Archive

An Inventory Item with operational history should normally be archived rather than deleted.

Deletion only when:

```text
No quantity
No movements
No reservations
No references
```

and business rules permit.

---

# 187. Quantity Precision

Most Maevelle physical products use whole-unit inventory.

V1 UI should primarily operate with integer quantities.

However, technical schema design should explicitly decide whether the future platform may support measured inventory such as:

```text
0.5 kg
2.25 m
```

rather than making an accidental irreversible assumption.

For V1 business workflows:

```text
Discrete whole units
```

are the expected standard.

---

# 188. Inventory Invariants

### INV-INV-001

Every tracked Inventory Level belongs to one Inventory Item and one Location.

### INV-INV-002

A Location cannot have duplicate active Inventory Levels for the same Inventory Item.

### INV-INV-003

Available quantity is derived, not independently authoritative.

### INV-INV-004

Incoming inventory is not current On Hand.

### INV-INV-005

Reserved stock is physically present but unavailable for another transaction.

### INV-INV-006

Damaged/quarantine stock is not normally available for sale.

### INV-INV-007

Inventory movements must have an identifiable reason/source.

### INV-INV-008

Posted historical quantity movements are not silently rewritten.

### INV-INV-009

Corrections create controlled compensating movements.

### INV-INV-010

A strict no-oversell policy cannot successfully reserve more than permitted availability.

### INV-INV-011

Reservation creation and availability enforcement are concurrency-safe.

### INV-INV-012

A reservation cannot be consumed twice.

### INV-INV-013

A Purchase Receipt cannot affect stock twice through request retry.

### INV-INV-014

A Transfer Receipt cannot affect stock twice.

### INV-INV-015

Inventory transfer cannot count the same physical units as normal stock at both source and destination simultaneously.

### INV-INV-016

Stocktake corrections do not rewrite historical transactions.

### INV-INV-017

Product/Variant archival must not destroy Inventory history.

### INV-INV-018

Inventory quantity and monetary valuation remain distinct concepts.

### INV-INV-019

Current balance and historical ledger must remain reconcilable.

### INV-INV-020

Storefront caches/search indexes are never final authority for inventory reservation.

---

# 189. V1 Inventory Scope — Mandatory

V1 Production Core shall include:

```text
✓ Inventory Items

✓ Variant ↔ Inventory relationship

✓ Inventory Levels

✓ Multiple Locations

✓ On Hand

✓ Sellable On Hand

✓ Unavailable / Damaged Stock

✓ Quarantine / Inspection

✓ Reserved

✓ Available To Sell

✓ Incoming

✓ In Transit

✓ Inventory Ledger

✓ Inventory Transactions

✓ Movement Reasons

✓ Source References

✓ Opening Balances

✓ Manual Adjustments

✓ Adjustment Reasons

✓ Reservations

✓ Reservation lifecycle

✓ Reservation release

✓ Reservation consumption

✓ Expiration support where used

✓ Strict concurrency protection

✓ Overselling policy

✓ Low-stock thresholds

✓ Purchase Receiving

✓ Partial Receiving

✓ Controlled Over/Under Receiving

✓ Customer Return Receiving

✓ Restock / Damaged disposition

✓ Warehouse Transfers

✓ Transfer dispatch

✓ Transfer receiving

✓ Transfer discrepancy handling

✓ Stocktake

✓ Stocktake reconciliation

✓ Inventory search/filtering

✓ History/timeline

✓ Bulk/import adjustment with preview

✓ Inventory export

✓ Permissions

✓ Audit integration

✓ Notifications

✓ API-first operations

✓ Idempotent critical mutations

✓ Operational consistency checks
```

---

# 190. Preferred V1 Enhancements

Strongly preferred:

```text
Safety Stock / Buffer

Blind Stocktake

Inventory Health Dashboard

Spreadsheet-friendly bulk adjustment

Split reservation support

Large adjustment safeguards

Incoming source breakdown

Stocktake movement-aware reconciliation
```

---

# 191. Foundation Now / Later

Architectural preparation should exist for:

```text
Bundles / Kits

Packaging Inventory

Consumable Inventory

Batch / Lot Tracking

Serial Numbers

Expiry Dates

POS Integration

External Warehouse Integration

Measured / fractional inventory

Complex fulfillment allocation
```

but full functionality is not required in V1.

---

# 192. Deferred Advanced Capabilities

Post-V1:

```text
Automatic replenishment

Demand forecasting

Reorder recommendations

Supplier lead-time forecasting

Barcode scanning workflows

Mobile warehouse scanning

Bin / Shelf tracking

Pick lists

Pick waves

Packing stations

Advanced cycle counts

FEFO / FIFO warehouse execution

Lot tracking

Serial tracking

Expiry management

Inventory aging

Dead-stock analysis

Advanced warehouse routing

Distributed inventory promises

Enterprise allocation optimization
```

---

# 193. Decisions Established

### Decision I-001

**Inventory is ledger-backed, not a stock integer.**

### Decision I-002

**Inventory Item and Catalog Variant are separate domain concepts.**

### Decision I-003

**Ordinary V1 variants will normally map one-to-one to an Inventory Item.**

### Decision I-004

**Inventory exists per Inventory Item + Location.**

### Decision I-005

**Organization-level stock is derived from location levels.**

### Decision I-006

**On Hand and Available To Sell are different.**

### Decision I-007

**Physical stock condition and commercial reservation are separate dimensions.**

### Decision I-008

**Damaged inventory remains physically On Hand until disposed or otherwise removed.**

### Decision I-009

**Incoming inventory is not On Hand.**

### Decision I-010

**In-transit internal stock is not simultaneously normal stock at both locations.**

### Decision I-011

**Reservations are location-aware.**

### Decision I-012

**A Cart does not itself guarantee stock.**

### Decision I-013

**Final purchasing performs authoritative server-side availability/reservation.**

### Decision I-014

**Reservation trigger timing is an Order policy; Inventory provides the mechanics.**

### Decision I-015

**No-oversell is the recommended default.**

### Decision I-016

**Inventory movements reference their business cause.**

### Decision I-017

**Historical posted movements are corrected through compensating transactions rather than silent mutation.**

### Decision I-018

**Current balances are efficient maintained state; ledger provides historical traceability.**

### Decision I-019

**Receiving supports partial quantities and actual quantities.**

### Decision I-020

**Returned goods do not automatically become sellable before physical receipt/inspection.**

### Decision I-021

**Transfers have lifecycle and transit state.**

### Decision I-022

**Stocktakes create reconciliation movements rather than rewriting history.**

### Decision I-023

**Inventory mutations must be concurrency-safe.**

### Decision I-024

**Critical inventory operations must be retry/idempotency safe.**

### Decision I-025

**Other domains cannot directly manipulate inventory balance fields.**

### Decision I-026

**Inventory quantity and inventory financial value are separate domains.**

### Decision I-027

**Archived Products/Variants retain Inventory history.**

### Decision I-028

**Storefront/search availability is a projection; Inventory transactional state remains authoritative.**

---

# 194. Result

Inventory now becomes:

```text
                         INVENTORY ITEM
                               │
               ┌───────────────┴───────────────┐
               │                               │
           LOCATION A                      LOCATION B
               │                               │
        INVENTORY LEVEL                  INVENTORY LEVEL
               │
     ┌─────────┼──────────┐
     │         │          │
 Sellable   Damaged   Quarantine
     │
     ├── Reserved
     │
     └── Available
```

with additional operational flows:

```text
PURCHASE
    ↓
INCOMING
    ↓
RECEIVING
    ↓
ON HAND
```

```text
ORDER
   ↓
RESERVATION
   ↓
FULFILLMENT
   ↓
STOCK LEAVES
```

```text
WAREHOUSE A
     ↓
DISPATCH
     ↓
IN TRANSIT
     ↓
RECEIVE
     ↓
WAREHOUSE B
```

and every material quantity change produces:

```text
Inventory Transaction
      ↓
Movement Lines
      ↓
Updated Balances
      ↓
Historical Ledger
      ↓
Audit / Events / Analytics
```

This means Maevelle will be able to trust inventory operationally rather than treating stock figures as approximate manually maintained numbers.

---

# 195. Next Domain

The next document should be:

```text
docs/domains/warehouse/warehouse-architecture.md
```

Inventory now knows:

```text
Inventory Item
+
Location
```

But we have not yet deeply defined what a **Location / Warehouse** actually means.

That domain should determine:

```text
Warehouse vs Store vs Other Location

Location lifecycle

Fulfillment-enabled locations

Receiving-enabled locations

Transfer rules

Warehouse priority

Order allocation

Inventory sourcing

Default warehouse

Warehouse addresses

Multiple warehouse UX

Transfer workflow

Transfer discrepancies

Warehouse availability

Warehouse-specific permissions

Future bins / zones / shelves

Future pick-pack workflows

Future courier handoff
```

After Warehouse Architecture, we should move into:

```text
Procurement
→ Incoming Shipments
→ Landed Cost
```

Those three domains will connect directly back into the receiving and incoming-inventory mechanics established here.

---

**End of Inventory & Stock Management Architecture v0.1**
