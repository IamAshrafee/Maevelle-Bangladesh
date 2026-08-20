# Maevelle Ecommerce — Landed Cost & Cost Allocation Architecture

**Document:** `docs/domains/landed-cost/landed-cost-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `procurement-architecture.md`, `inbound-shipment-architecture.md`, `inventory-architecture.md`, `warehouse-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Landed Cost domain determines the effective acquisition cost of inventory after combining Supplier Purchase Cost with other direct costs required to bring goods into usable business inventory.

The central business question is:

```text
Supplier Product Price
        +
International Freight
        +
China Domestic Shipping
        +
Forwarder Fees
        +
Customs / Duty
        +
Applicable Taxes
        +
Insurance
        +
Handling
        +
Local Transport
        +
Other Direct Acquisition Costs
        ↓
How much did each Product / Variant / unit
actually cost Maevelle?
```

This subsystem replaces spreadsheet-based cost splitting with a controlled, explainable and auditable **Cost Allocation Engine**.

---

# 2. Core Principle

> **Landed cost is not a single extra shipping number attached to a Product.**

Different expenses can apply to different groups of goods and require different allocation logic.

Example:

```text
Shipment contains:

Product A
20 units
High value
Low weight

Product B
100 units
Low value
High weight

Product C
5 units
Medium value
Very large volume
```

Applying every Shipment cost:

```text
Total Expense ÷ Total Quantity
```

would frequently produce misleading product costs.

Instead, every Cost Component must define:

```text
What cost is this?

How much is it?

Which goods does it apply to?

What allocation basis should be used?

What currency is it in?

Is the amount estimated or actual?
```

---

# 3. Research-Informed Direction

This approach follows patterns found in mature ERP and inventory systems. Microsoft Dynamics Landed Cost supports apportioning costs using bases including quantity, amount/value, and volume, and its inbound logistics model supports cost application at logistics scopes such as voyages and shipping containers.

Odoo's current landed-cost model similarly supports splitting additional acquisition costs equally, by quantity, by current cost, by weight, or by volume.

Business Central treats freight, insurance, handling, transportation and similar direct item charges as additions to inventory acquisition cost and supports allocation methods including equal, amount, weight and volume.

These systems validate the architectural direction, but Maevelle's allocation engine will be designed around our own operational requirements rather than copying any one ERP.

---

# 4. Important Boundary

This document defines **operational landed-cost computation**.

It does **not yet define statutory accounting or financial inventory valuation policy**.

Those are related but different concerns.

For example:

```text
Operational Landed Cost
```

may help Maevelle answer:

```text
What did this shipment of dresses actually cost us?
What margin are we making?
What selling price is sensible?
```

Accounting may separately require policies such as:

```text
FIFO
Weighted Average
Moving Average
Specific Identification
Period-end adjustments
```

The future Finance/Accounting architecture will determine those rules.

---

# 5. Domain Responsibilities

The Landed Cost domain owns concepts such as:

```text
Landed Cost Worksheet

Cost Component

Cost Type

Cost Source

Cost Scope

Eligible Cost Targets

Allocation Method

Allocation Basis

Allocation Result

Estimated Cost

Actual Cost

Cost Revision

Cost Reconciliation

Cost Finalization

Landed Unit Cost

Cost Breakdown

Allocation Rounding

Cost Variance

Cost Audit History
```

---

# 6. Landed Cost Does Not Own

The domain does not own:

```text
Purchase quantity

Physical Shipment movement

Warehouse inventory quantity

Supplier payment

General operating expenses

Customer selling price

Order revenue

Accounting journal entries
```

It consumes information from those domains and produces acquisition-cost results.

---

# 7. Core Cost Formula

At its simplest:

```text
Landed Cost
=
Direct Purchase Cost
+
Allocated Additional Acquisition Costs
```

Example:

```text
Supplier Product Cost       ৳500
Allocated Freight             70
Allocated Customs             35
Allocated Forwarder Fee       10
Allocated Local Transport      5
--------------------------------
Landed Unit Cost             ৳620
```

---

# 8. Purchase Cost

The base cost begins with Procurement.

Example:

```text
Purchase Line:

20 × Product A
Unit Cost:
¥30
```

Procurement remains authoritative for the commercial Supplier cost.

Landed Cost consumes it.

---

# 9. Purchase Cost Is Already Item-Specific

Supplier Purchase Cost generally does not require allocation across unrelated Products because it is already attached to specific Purchase Lines.

Example:

```text
Product A:
20 × ¥30

Product B:
50 × ¥10
```

Those values are direct costs.

Landed Cost primarily allocates **shared additional acquisition costs**.

---

# 10. Cost Component

A **Cost Component** represents one additional cost that may contribute to landed cost.

Examples:

```text
International Freight

China Domestic Delivery

Forwarder Service Fee

Customs Duty

VAT / Tax where capitalizable by business policy

Insurance

Port Charge

Airport Charge

Documentation Fee

Storage Charge

Handling

Local Delivery

Inspection Fee

Special Product Charge
```

---

# 11. Cost Type

Cost Components should reference reusable Cost Types.

Example:

```text
Cost Type:
International Freight

Default Allocation:
Weight

Default Landed-Cost Eligible:
Yes
```

Another:

```text
Cost Type:
Local Van Delivery

Default Allocation:
Equal
```

---

# 12. Why Reusable Cost Types Matter

Without reusable types, users repeatedly create:

```text
Shipping
Freight
Freight Cost
Shipping Cost
International Shipping
International Freight
```

and analytics become inconsistent.

Reusable Cost Types improve:

```text
Consistency
Default allocation rules
Reporting
Filtering
Automation
Permissions
```

---

# 13. Cost Type Does Not Permanently Force Allocation

Example:

```text
International Freight
```

may normally allocate:

```text
By Weight
```

But a particular Provider invoice could be explicitly billed by:

```text
Chargeable Weight
```

or even manually.

Therefore:

```text
Cost Type default
≠
Unchangeable rule
```

---

# 14. Cost Source

Every Cost Component should identify where it came from.

Potential sources:

```text
Shipment Expense

Purchase Charge

Supplier Invoice Charge

Customs Document

Logistics Provider Invoice

Manual Cost Entry

Other Direct Acquisition Expense
```

---

# 15. Source Traceability

Example:

```text
Cost Component:
International Freight

Amount:
$500

Source:
Forwarder Invoice FI-1002

Shipment:
SH-CN-82
```

The user should be able to navigate back to the source document.

---

# 16. Avoid Duplicate Cost Entry

If:

```text
Forwarder Invoice:
$500
```

already created the Freight Cost Component, manually adding another:

```text
Freight:
$500
```

could double landed cost.

The system should support duplicate detection and explicit source relationships.

---

# 17. Cost Scope

A Cost Component needs a scope answering:

> Which goods can this cost possibly apply to?

Potential scopes:

```text
Entire Shipment

Journey Leg

Package / Container

Purchase

Purchase Line

Shipment Item

Specific selected items
```

---

# 18. Shipment-Level Scope

Example:

```text
International Freight:
$500

Scope:
Entire SH-CN-82
```

All eligible goods in that Shipment participate.

---

# 19. Package-Level Scope

Example:

```text
Special Handling:
৳3,000

Scope:
Carton 4 only
```

Only goods physically inside Carton 4 should receive that cost.

Microsoft's landed-cost documentation notes that shipping containers can serve as cost areas when a cost should be shared only among goods physically grouped in that container.

---

# 20. Purchase-Level Scope

Example:

```text
Supplier Packaging Fee:
¥300

Scope:
PO-104
```

Goods from other Purchases in the same consolidated Shipment should not receive it.

---

# 21. Item-Level Scope

Example:

```text
Special Certification:
৳5,000

Applicable only to:
Product C
```

No allocation across unrelated Products is necessary.

---

# 22. Cost Eligibility

After Cost Scope defines the potential population, explicit eligibility rules determine which items actually participate.

Example Shipment:

```text
A
B
C
D
```

Freight applies:

```text
A B C D
```

Customs applies only:

```text
A B C
```

Special Handling applies:

```text
D
```

The system must allow this.

---

# 23. Cost Target

The basic allocation target should correspond to a **cost-bearing acquired quantity**.

Conceptually this may represent:

```text
Purchase Line quantity
Shipment Item quantity
Received quantity
Variant quantity
```

depending on costing stage.

The exact persistence representation will be decided later.

---

# 24. Allocation Granularity

The engine should ultimately be able to calculate:

```text
Cost allocated to Product/Variant quantity
```

and derive:

```text
Additional Cost Per Unit
```

Example:

```text
Product A
20 units

Allocated Freight:
৳1,400

Freight Per Unit:
৳70
```

---

# 25. Allocation Method

The first-class V1 methods should include:

```text
EQUAL

BY_QUANTITY

BY_PURCHASE_VALUE

BY_WEIGHT

BY_VOLUME

BY_CHARGEABLE_WEIGHT

BY_PERCENTAGE

MANUAL_AMOUNT
```

This is broader than a basic equal-split engine.

---

# 26. Equal Allocation

Equal means:

> Split the Cost Component equally among eligible allocation targets.

Example:

```text
Cost:
৳900

Eligible Product Lines:
A
B
C
```

Result:

```text
A ৳300
B ৳300
C ৳300
```

---

# 27. Equal by Line vs Equal by Unit

This distinction must be explicit.

Suppose:

```text
A: 1 unit
B: 100 units
```

**Equal by target line:**

```text
A 50%
B 50%
```

**By quantity:**

```text
A   0.99%
B  99.01%
```

These are radically different.

Therefore our terminology should avoid ambiguous:

```text
Equal
```

when the actual target granularity is unclear.

For V1:

```text
EQUAL
```

will mean equal across eligible cost targets/lines.

```text
BY_QUANTITY
```

handles unit-proportional allocation.

---

# 28. By Quantity

Formula:

```text
Target Allocation
=
Cost Amount
×
(Target Quantity / Total Eligible Quantity)
```

Example:

```text
Cost:
৳1,000

A:
20 units

B:
30 units

Total:
50
```

Results:

```text
A:
৳400

B:
৳600
```

---

# 29. Quantity Is Appropriate Only Sometimes

Quantity can be reasonable for:

```text
per-piece inspection
per-unit handling
certain processing charges
```

but inappropriate for:

```text
freight where Products have very different weights
```

The system should help, but not pretend one allocation basis is universally correct.

---

# 30. By Purchase Value

Formula:

```text
Target Allocation
=
Cost Amount
×
(Target Purchase Value / Total Eligible Purchase Value)
```

Example:

```text
A Purchase Value:
৳80,000

B Purchase Value:
৳20,000

Customs-related shared charge:
৳10,000
```

Result:

```text
A:
৳8,000

B:
৳2,000
```

Microsoft Dynamics supports amount/value-based landed-cost apportionment, and Odoo supports allocation based on current item cost.

---

# 31. Which Value?

`BY_PURCHASE_VALUE` must define what value it uses.

Recommended V1 base:

```text
Purchase Line Extended Cost
=
Eligible Quantity × Purchase Unit Cost
```

converted into the worksheet/base allocation currency where needed.

Do not use Storefront Selling Price.

---

# 32. By Weight

Formula:

```text
Target Allocation
=
Cost Amount
×
(Target Weight / Total Eligible Weight)
```

Example:

```text
A:
10 kg

B:
30 kg

Freight:
৳8,000
```

Allocation:

```text
A:
৳2,000

B:
৳6,000
```

Weight-based landed-cost allocation is supported by current ERP systems including Business Central and Odoo.

---

# 33. Weight Source

Weight may come from:

```text
Actual Shipment Item Weight

Package Content Allocation

Variant/Product Weight

Manual Worksheet Weight
```

The system must know which source was used.

---

# 34. Actual vs Catalog Weight

Catalog Variant may say:

```text
0.25 kg
```

but actual Shipment data may show:

```text
0.30 kg/unit
```

For a particular shipment, actual logistics data may be more appropriate.

Therefore allocation inputs should support provenance.

---

# 35. Weight Calculation

Where item-level total weight is not supplied directly:

```text
Total Weight
=
Quantity × Unit Weight
```

Microsoft's landed-cost data model similarly calculates shipment weight from quantity and item gross weight when direct values are unavailable.

---

# 36. By Volume

Formula:

```text
Target Allocation
=
Cost Amount
×
(Target Volume / Total Eligible Volume)
```

Useful when shipping cost depends strongly on occupied space.

Current ERP landed-cost implementations support volume-based distribution.

---

# 37. Volume Source

Possible:

```text
Actual package volume allocation

Shipment Item total volume

Variant dimensions × quantity

Manual measured volume
```

Again, provenance matters.

---

# 38. By Chargeable Weight

For logistics where the Provider bills against a separate chargeable-weight figure:

```text
Allocation
=
Cost Amount
×
(Target Chargeable Weight / Total Chargeable Weight)
```

Shipment Architecture already stores actual and chargeable weight separately.

---

# 39. Why Chargeable Weight Is Separate

Freight companies may use volumetric-weight rules that vary by provider and transport mode. Microsoft Dynamics documents configurable volumetric divisors because carriers can use different rules for air, sea, routes, or contracts.

Therefore Maevelle should not universally calculate freight using one hard-coded formula.

---

# 40. Percentage Allocation

Percentage allocation allows users to explicitly specify:

```text
A 50%
B 30%
C 20%
```

for a cost.

This is useful when business knowledge exists that cannot be derived automatically.

---

# 41. Percentage Validation

Percent allocations must reconcile to:

```text
100%
```

subject to defined numeric tolerance.

Example invalid:

```text
A 50
B 40
C 20
=
110%
```

Cannot finalize.

---

# 42. Manual Amount Allocation

Users may explicitly allocate:

```text
A ৳1,200
B ৳2,000
C ৳800
```

The allocated total must equal the Cost Component amount after currency normalization/rounding rules.

---

# 43. Why Manual Is Necessary

No automated method can correctly represent every real-world invoice.

Example:

Forwarder tells Maevelle:

```text
Dress cartons:
$300

Jewelry carton:
$50

Hat cartons:
$150
```

Even if a single $500 invoice exists, actual known amounts should be allocatable manually.

---

# 44. Different Method Per Cost

This is a fundamental requirement.

Shipment:

```text
Freight:
৳50,000
→ By Weight

Customs:
৳20,000
→ By Purchase Value

Local Van:
৳3,000
→ Equal

Inspection:
৳2,000
→ By Quantity

Special Handling:
৳1,200
→ Manual
```

The engine must combine all resulting allocations.

---

# 45. Mixed Allocation

A Product's landed cost can therefore consist of many allocation methods.

Example:

```text
Product A

Purchase Cost       ৳10,000
Freight              1,450   weight-based
Customs                800   value-based
Transport               75   equal
Inspection              40   quantity-based
Handling                20   manual
--------------------------------
Total Cost           ৳12,385
```

---

# 46. Cost Breakdown Is Mandatory

The user must be able to inspect:

```text
Why is landed cost ৳619.25 per unit?
```

and see every component.

Never expose only:

```text
Landed Cost = ৳619.25
```

without explanation.

---

# 47. Landed Cost Worksheet

The central working entity should be a **Landed Cost Worksheet**.

It represents one costing exercise/reconciliation.

Example:

```text
Worksheet:
LC-SH-2026-0082-R1

Shipment:
SH-CN-82

Status:
ESTIMATED
```

---

# 48. Worksheet Scope

Normally:

```text
One Inbound Shipment
```

will be the primary V1 worksheet scope.

But architecture should allow costs affecting:

```text
Multiple related receipts
Container
Selected purchase lines
```

where required later.

---

# 49. Why Shipment-Centric V1

Maevelle's sourcing workflow naturally consolidates multiple Purchases into Shipment.

Most shared costs arise because those goods:

```text
traveled together
cleared customs together
were handled together
```

So Shipment is the strongest default costing context.

---

# 50. Worksheet Structure

Conceptually:

```text
Landed Cost Worksheet
│
├── Shipment
├── Version / Revision
├── Status
├── Base Currency
│
├── Cost Targets
│
├── Cost Components
│      ├── Scope
│      ├── Amount
│      ├── Currency
│      ├── Estimate / Actual
│      ├── Allocation Method
│      └── Eligible Targets
│
├── Allocation Results
│
├── Reconciliation
│
└── Finalized Cost Results
```

---

# 51. Worksheet Status

Recommended lifecycle:

```text
DRAFT
   ↓
ESTIMATED
   ↓
PARTIALLY_ACTUAL
   ↓
READY_TO_FINALIZE
   ↓
FINALIZED
```

Exceptional:

```text
REOPENED
SUPERSEDED
CANCELLED
```

---

# 52. Draft

Costs and targets are being assembled.

No official estimate/final result has been published operationally.

---

# 53. Estimated

All important expected costs have sufficient estimates to calculate a provisional landed cost.

This enables:

```text
early pricing decisions
margin estimation
inventory planning
```

before final bills arrive.

Microsoft Dynamics explicitly supports landed-cost estimates before actual costs are known.

---

# 54. Partially Actual

Some components are actual.

Others remain estimates.

Example:

```text
Supplier Cost       Actual
China Freight       Actual
Air Freight         Actual
Customs             Estimate
Local Delivery      Estimate
```

---

# 55. Ready to Finalize

Required Cost Components are actual or otherwise explicitly accepted according to business policy.

Allocation validates successfully.

---

# 56. Finalized

The Worksheet's resulting cost allocation becomes an official operational landed-cost result.

Finalized does not mean immutable forever under all circumstances.

But changes require controlled reopening/revision.

---

# 57. Reopened

Example:

```text
Worksheet finalized.

Two days later:
Customs sends an additional ৳5,000 bill.
```

We cannot pretend the previous result never existed.

Instead:

```text
FINALIZED Revision 1
       ↓
REOPEN
       ↓
Revision 2 / Adjustment
```

---

# 58. Cost Revision

Important finalized cost changes should create identifiable revisions.

Example:

```text
LC-82 Revision 1
Final landed cost:
৳600/unit

LC-82 Revision 2
Additional customs charge
Final landed cost:
৳608/unit
```

---

# 59. Historical Result Preservation

The business should be able to answer:

```text
What landed cost did we initially estimate?

What did we finally calculate?

Why did it change?
```

This requires estimate/actual/revision history.

---

# 60. Cost Component State

Each component may have:

```text
ESTIMATE

ACTUAL

ADJUSTMENT

CREDIT
```

---

# 61. Estimated Amount

Example:

```text
Customs:
Estimated ৳20,000
```

Used for provisional costing.

---

# 62. Actual Amount

Later:

```text
Customs:
Actual ৳23,500
```

Variance:

```text
+৳3,500
```

---

# 63. Estimate Should Not Be Destroyed

Preserve:

```text
Estimated:
৳20,000

Actual:
৳23,500

Variance:
৳3,500
```

for operational analysis.

---

# 64. Cost Adjustment

A later charge may be entered as:

```text
Additional Port Fee:
৳2,000
```

Rather than editing a previous unrelated component.

This makes history clearer.

---

# 65. Cost Credit

A Provider may refund:

```text
Freight Credit:
-৳1,500
```

Negative Cost Components should be supported through controlled credit semantics.

---

# 66. Multi-Currency

One Worksheet may include:

```text
Supplier Cost     CNY

Air Freight       USD

China Delivery    CNY

Customs           BDT

Local Delivery    BDT
```

This is normal.

---

# 67. Worksheet Base Currency

For allocation and reporting, the Worksheet requires a base costing currency.

For Maevelle initially:

```text
BDT
```

will likely be normal.

But this must be configurable.

---

# 68. Original Currency Is Preserved

Example:

```text
Freight:
$500

Conversion Rate:
1 USD = X BDT

Converted Allocation Amount:
৳...
```

Never discard:

```text
$500
```

after converting it.

---

# 69. FX Rate

Each currency conversion needs a defined rate context.

Potential:

```text
Transaction Date Rate

Invoice Date Rate

Payment/Settlement Rate

Manual Agreed Rate
```

The exact financial policy must be configured later.

---

# 70. FX Rate Snapshot

Once an allocation uses:

```text
1 USD = 122.50 BDT
```

that rate should be preserved with the Worksheet/revision.

Do not recalculate old landed cost using tomorrow's FX rate.

---

# 71. FX Source

Potential:

```text
Manual

Business-configured source

Future FX provider

Settlement rate
```

V1 can support manual entry as a reliable baseline.

---

# 72. Missing FX Rate

If Cost Component is:

```text
$500
```

and Worksheet currency is BDT but no valid USD→BDT rate exists:

```text
Cannot finalize allocation.
```

Do not silently assume `1:1`.

---

# 73. Purchase Value Conversion

`BY_PURCHASE_VALUE` may involve Purchase Lines in currencies different from Worksheet base.

Their purchase values must be normalized using defined historical rates before calculating relative shares.

---

# 74. Allocation Basis Snapshot

This is one of the most important design rules.

When allocation is calculated, preserve the basis used.

Example:

```text
Freight Cost:
৳10,000

Method:
BY_WEIGHT

Target A:
12.5 kg

Target B:
37.5 kg
```

If Product weight is edited next month, the historical Cost allocation must not silently change.

---

# 75. Allocation Input Snapshot

Finalized allocation should preserve:

```text
Quantity used

Weight used

Volume used

Purchase value used

Chargeable weight used

Percentage used
```

according to method.

---

# 76. Recalculation Before Finalization

Before finalization:

```text
Update Product weight
→
Recalculate Worksheet
```

can be allowed.

After finalization:

```text
Do not silently recalculate.
```

Use revision/reopen.

---

# 77. Allocation Preview

Before applying/finalizing, show:

| Product | Qty | Purchase Cost | Weight | Allocated Freight | Allocated Customs | Total Add. Cost | Landed Unit |
| ------- | --: | ------------: | -----: | ----------------: | ----------------: | --------------: | ----------: |

The user needs to inspect unusual results.

---

# 78. Cost Component Preview

For each expense:

```text
International Freight
৳50,000
By Weight
```

show:

| Target | Weight | Share |  Amount |
| ------ | -----: | ----: | ------: |
| A      |  10 kg |   20% | ৳10,000 |
| B      |  40 kg |   80% | ৳40,000 |

---

# 79. Explainability

Every allocation result should be able to explain itself.

Example:

```text
Product A received ৳10,000 of Freight because:

Product A Weight:
10 kg

Eligible Shipment Weight:
50 kg

Share:
20%

Freight:
৳50,000

Allocation:
৳10,000
```

---

# 80. Allocation Formula Metadata

The system does not need to store arbitrary formula code.

It should store:

```text
Method
Basis values
Total basis
Cost amount
Calculated share
Calculated allocation
```

which is enough to reconstruct the result.

---

# 81. Zero Basis Problem

Suppose:

```text
Method:
BY_WEIGHT
```

but all eligible items have:

```text
Weight = 0 / missing
```

The system cannot allocate safely.

Result:

```text
ALLOCATION_BLOCKED:
Missing Weight
```

---

# 82. Partial Missing Basis

Example:

```text
A weight = 10 kg
B weight = missing
C weight = 20 kg
```

Do not silently ignore B and distribute the entire Freight across A/C unless user explicitly excludes B.

The Worksheet should flag incomplete basis data.

---

# 83. Basis Completion UX

Potential:

```text
Freight allocation requires weight.

3 targets
1 missing weight

[Enter Missing Weight]
[Use Different Method]
[Exclude Target with Reason]
```

---

# 84. Excluding a Target

Exclusion should require clear intent.

Example:

```text
Product C excluded from Customs charge

Reason:
Duty exempt
```

This should be preserved.

---

# 85. Eligibility vs Zero Allocation

A Target excluded from a Cost Component is different from:

```text
Eligible but mathematically receives ৳0
```

The system should know the difference.

---

# 86. Rounding

Money allocation creates unavoidable rounding scenarios.

Example:

```text
৳100
÷
3 targets
=
৳33.333333...
```

But:

```text
33.33 × 3
=
99.99
```

One paisa remains.

---

# 87. Reconciliation Rule

Fundamental invariant:

> Sum of allocations must exactly equal the allocatable Cost Component amount in the allocation currency.

Therefore:

```text
Allocated A
+
Allocated B
+
Allocated C
=
Cost Component
```

after deterministic rounding.

---

# 88. Rounding Strategy

Recommended:

1. calculate with high internal precision;
2. round target allocations to currency precision;
3. calculate remainder;
4. assign remainder using a deterministic rule.

Potential deterministic rule:

```text
Largest fractional remainder first
```

or:

```text
Stable target ordering
```

The exact algorithm will be documented at implementation.

---

# 89. Never Lose Rounding Money

Invalid:

```text
Cost:
৳100

Allocated:
৳99.99
```

with:

```text
৳0.01 disappeared.
```

Financial reconciliation must be exact.

---

# 90. Per-Unit Rounding

Suppose:

```text
Line Allocation:
৳100

Quantity:
3
```

Per-unit display:

```text
৳33.333...
```

The line allocation remains authoritative.

Unit cost display may use required precision.

Do not force:

```text
Rounded unit × quantity
```

to become the only source.

---

# 91. Monetary Precision

Financial calculations should use decimal/fixed-precision arithmetic.

Do not use binary floating point for authoritative money calculations.

---

# 92. Quantity Precision

Maevelle V1 mostly uses whole units.

But cost calculations must not assume every allocation basis is integer:

```text
Weight:
10.25 kg

Volume:
0.415 m³
```

---

# 93. Partial Shipment

PO:

```text
100 units
```

Shipment:

```text
40 units
```

Only the 40 shipped units should participate in costs attributable specifically to that Shipment.

Do not allocate Shipment Freight across the entire 100-unit Purchase.

---

# 94. Purchase Cost in Partial Shipment

For landed-cost purposes:

```text
Purchase Cost Basis
=
Quantity in Shipment
×
Purchase Unit Cost
```

for the applicable Shipment allocation.

---

# 95. Multiple Shipments From One Purchase

Example:

```text
PO:
100 units @ ৳500
```

Shipment 1:

```text
40 units
```

Shipment 2:

```text
60 units
```

Each Shipment can develop a different landed cost because:

```text
different freight
different customs
different provider
different timing
different FX
```

---

# 96. Same Variant Can Have Different Landed Costs

Therefore:

```text
Variant Red/M
```

may have:

```text
Batch/Receipt A:
৳620/unit

Batch/Receipt B:
৳645/unit
```

This is normal.

Do not store only:

```text
variant.landed_cost = 645
```

as the complete historical truth.

---

# 97. Cost Lot / Receipt Cost Context

Landed cost should be associated with acquisition/receipt context.

Conceptually:

```text
Variant
  ↓
Receipt / Acquisition Quantity
  ↓
Landed Cost Result
```

This preserves historical purchasing differences.

---

# 98. Current Operational Cost

The dashboard may later display:

```text
Current Cost
```

or:

```text
Latest Landed Cost
```

but it must be clear what calculation it represents.

Possibilities include:

```text
Latest receipt cost

Weighted average operational cost

Inventory valuation cost
```

These must not be ambiguously merged.

---

# 99. Inventory Valuation Boundary

Suppose:

```text
Old inventory:
10 units @ ৳600

New receipt:
10 units @ ৳700
```

What is the financial cost of the next unit sold?

That depends on valuation policy.

Potential:

```text
FIFO
Weighted Average
Other
```

That decision belongs to future Costing/Accounting architecture.

Landed Cost only establishes:

```text
New receipt acquisition cost = ৳700/unit
```

---

# 100. Estimated Landed Cost Before Receipt

Maevelle may need:

```text
We ordered this at ¥30.
What do we expect it to cost after arrival?
```

before goods arrive.

Therefore estimated Worksheet can run against Shipment allocations before Receipt.

---

# 101. Estimated Cost Target Quantity

Before receipt:

```text
Shipment quantity
```

is the provisional target quantity.

After receipt, actual accepted quantities may differ.

---

# 102. Reconciliation After Receipt

Example:

Estimated:

```text
Expected:
100 units

Freight:
৳10,000

Estimated Freight/unit:
৳100
```

Actual receipt:

```text
95 units
```

Now the system must decide how actual incurred Freight is allocated.

Generally, actual cost still needs to be reconciled over the final cost-bearing quantity according to business policy.

---

# 103. Shortage Scenario

Shipment expected:

```text
100
```

Actual:

```text
95 received
5 lost
```

Freight:

```text
৳10,000
```

Question:

> Who bears the cost associated with the missing five?

This is a real costing policy decision.

---

# 104. Loss Cost Treatment

Possible policies:

### Policy A — Cost absorbed by surviving inventory

```text
Freight
÷
95 received units
```

### Policy B — Lost quantity retains a loss cost

```text
95 inventory units
+
5 lost units / loss expense
```

### Policy C — Provider/Supplier claim reduces cost

depends on actual reimbursement.

This must not be hard-coded prematurely.

---

# 105. V1 Recommended Loss Policy

For operational landed cost, default to:

> Allocate direct acquisition costs according to explicitly eligible cost-bearing quantities, while recording lost/damaged quantities separately and requiring unresolved-loss review before finalization.

The final treatment should be configurable/documented because accounting requirements can differ.

---

# 106. Damaged Quantity

Shipment:

```text
100 units

95 Sellable
5 Damaged
```

Those five damaged units physically arrived.

They may still carry acquisition cost.

Therefore:

```text
Damaged
≠
Costless
```

---

# 107. Damaged Inventory Cost

Operationally, the business may want:

```text
5 damaged units @ actual acquisition cost
```

so the loss is visible.

Do not automatically transfer all their cost into the 95 sellable units unless explicit policy requires it.

---

# 108. Quarantine Quantity

Received into inspection/quarantine:

```text
100
```

Landed cost can still be calculated even before final sellable condition is known.

Inventory condition and acquisition cost remain separate dimensions.

---

# 109. Over-Receipt

Expected:

```text
100
```

Actual accepted:

```text
103
```

The Worksheet must refresh/reconcile target quantities.

Possible additional three units may:

```text
have supplier cost
be free promotional units
require Purchase amendment
```

Procurement must resolve their commercial basis.

---

# 110. Free Bonus Units

Supplier sends:

```text
Buy 100
Get 5 free
```

Commercial Purchase Cost:

```text
100 paid units
105 received units
```

Operational cost may need to spread Purchase cost across 105 inventory units.

This scenario must be explicitly supported rather than forcing a fake unit purchase cost onto the bonus units.

---

# 111. Bonus Unit Example

Purchase cost:

```text
৳100,000
```

Units received:

```text
105
```

before additional costs:

```text
Average acquisition base:
৳952.38...
```

depending on configured cost allocation treatment.

This is another reason Purchase Line price and final Landed Unit Cost must remain distinct.

---

# 112. Different Commercial Quantity From Inventory Quantity

Procurement may track:

```text
Paid quantity
Free quantity
```

while Inventory tracks:

```text
Actual received units
```

Landed Cost bridges them through explicit cost-bearing quantity logic.

---

# 113. Cost Allocation Across Variants

Purchase:

```text
Red / M
Red / L
Blue / M
```

all may have the same Supplier price.

Freight might allocate by weight.

Customs by purchase value.

Resulting Variant landed costs can differ.

---

# 114. Product Aggregate Cost

Product-level landed-cost display can summarize Variants.

But Product should not become the fundamental cost target if Variants have different:

```text
Purchase costs
Weights
Quantities
```

---

# 115. Direct Cost

Some additional costs require no proportional allocation.

Example:

```text
Embroidery charge:
৳50/unit
```

specific to Product A.

The system can directly assign:

```text
Product A
```

rather than routing through all shipment goods.

---

# 116. Cost Formula Type

Cost Components may therefore be:

```text
FIXED_TOTAL

PER_UNIT

PERCENT_OF_VALUE
```

in addition to allocation method.

This distinction helps model the source amount correctly.

---

# 117. Fixed Total Cost

Example:

```text
Forwarder Fee:
৳5,000 total
```

Then allocation method distributes the ৳5,000.

---

# 118. Per-Unit Cost

Example:

```text
Inspection:
৳20 per unit
```

Eligible:

```text
100 units
```

Cost becomes:

```text
৳2,000
```

and may already be directly quantity-derived.

---

# 119. Percentage Cost

Example:

```text
Insurance:
1% of declared value
```

The Cost Component may calculate its total from:

```text
Eligible purchase/declared value
```

before allocation.

Microsoft Dynamics landed-cost auto-cost rules also support percentage-based costs based on goods value.

---

# 120. Cost Calculation vs Cost Allocation

Important distinction:

```text
Cost Calculation
=
How do we determine total expense?
```

Example:

```text
1% × Goods Value
```

Then:

```text
Cost Allocation
=
How do we distribute that total across targets?
```

These could use different bases.

---

# 121. Example

Insurance invoice:

```text
1% of total shipment purchase value
```

Cost calculation:

```text
1% × ৳1,000,000
=
৳10,000
```

Allocation:

```text
By Purchase Value
```

produces item shares.

---

# 122. Estimated Cost Rules

Future/preferred V1 functionality may automatically estimate:

```text
Forwarder Fee:
৳X/kg

Insurance:
1%

Local Delivery:
৳Y flat
```

based on reusable rules.

Microsoft Dynamics supports configured automatic cost rules to estimate landed cost.

V1 does not need a huge rule engine, but simple reusable defaults would be valuable.

---

# 123. Cost Template

Possible reusable:

```text
China Air Import
```

template:

```text
International Freight      By Chargeable Weight
China Local Delivery       By Weight
Forwarder Fee              Equal
Customs                    By Purchase Value
Local Delivery             Equal
```

Users add actual amounts per Shipment.

---

# 124. Templates Reduce Error

Instead of choosing allocation method every time, templates provide sensible defaults.

Still allow authorized override.

---

# 125. Allocation Method Recommendation

The UI can display:

```text
Recommended:
By Weight
```

based on Cost Type.

Do not make it an invisible forced behavior.

---

# 126. Worksheet Auto-Population

When opening landed cost for Shipment:

```text
Supplier Purchase Costs
→ automatically loaded

Shipment Expenses
→ automatically loaded

Shipment Items
→ automatically loaded

Quantity/weight/volume
→ automatically loaded when available
```

The user should not manually reconstruct the Shipment in another screen.

---

# 127. Missing Information Indicators

Example:

```text
Product A   Weight ✓
Product B   Weight !
Product C   Weight ✓
```

If Freight uses weight, Worksheet displays:

```text
Cannot calculate final allocation:
1 target missing weight.
```

---

# 128. Override Input

Authorized users may enter:

```text
Actual Shipment Weight:
12.4 kg
```

instead of relying on Catalog weight.

Override requires:

```text
Reason / source
```

where materially significant.

---

# 129. Allocation Lock

Once finalized:

```text
Cost Component allocation basis
```

should become locked in that revision.

No silent background recalculation.

---

# 130. Preview Before Finalization

Finalization page should summarize:

```text
Total Purchase Cost

Total Additional Costs

Estimated vs Actual

Total Landed Cost

Total Received Quantity

Cost by Product

Cost by Variant

Unallocated Amount

Warnings

Missing Actual Costs
```

---

# 131. Finalization Requirements

Potential blockers:

```text
Allocation totals do not reconcile

Required FX rate missing

Cost basis missing

Unresolved over/under receipt

Unmapped Purchase Item

Duplicate Cost Component

Unresolved manual allocation

Invalid percentage total

Required actual costs missing
```

---

# 132. Warning vs Blocker

Example warning:

```text
Local Delivery is still estimated.
```

Depending on policy, business may still finalize provisional costing.

Example blocker:

```text
Freight ৳50,000 has only ৳45,000 allocated.
```

Cannot finalize.

---

# 133. Provisional Finalization

We may distinguish:

```text
ESTIMATED / PROVISIONAL
```

from:

```text
FINAL
```

so inventory can be operational before final invoices arrive.

This is important for imported goods.

---

# 134. Operational Availability Before Final Cost

Goods may be:

```text
Received
Inspected
Sellable
```

while:

```text
Final Customs Invoice
```

is still outstanding.

Inventory availability should not be unnecessarily blocked.

Cost status can remain:

```text
PROVISIONAL
```

---

# 135. Final Cost Arrives After Sales Begin

Example:

```text
Goods received Monday.

Some units sold Tuesday.

Customs adjustment received Friday.
```

This can happen.

The system must support later landed-cost adjustment without rewriting historical inventory movement quantities.

---

# 136. Cost Adjustment After Sales

Operational cost history must distinguish:

```text
Original provisional cost
```

and:

```text
Final revised acquisition cost
```

How that affects cost-of-goods-sold/accounting is a Finance decision.

Do not embed accounting assumptions in Landed Cost.

---

# 137. Cost Reopening

Permission should be restricted.

Potential capability:

```text
landed_cost.reopen
```

Reopening requires:

```text
Reason
Actor
Timestamp
```

---

# 138. Cost Finalization Audit

Record:

```text
Who finalized?

When?

Which revision?

Which FX rates?

Which allocation methods?

What amounts?

What warnings were accepted?
```

---

# 139. Manual Override Audit

If user changes:

```text
Freight Allocation
from Weight
to Manual
```

that should be auditable.

---

# 140. Allocation Comparison

Preferred UX:

```text
Try Allocation Method
```

without saving.

Example:

```text
By Quantity

vs

By Weight
```

show resulting landed costs.

This helps users understand impact.

---

# 141. Scenario Simulation

Future/preferred:

```text
Scenario A:
Air Freight

Scenario B:
Sea Freight
```

using estimated costs.

This could support sourcing/planning decisions.

Not mandatory V1.

---

# 142. Landed Cost Worksheet UX

Recommended structure:

```text
Overview

Cost Targets

Cost Components

Allocation

Estimated vs Actual

Cost Breakdown

Reconciliation

History
```

---

# 143. Cost Component Editor

Example:

```text
Cost Type
International Freight

Amount
$500

Status
Actual

Scope
Whole Shipment

Allocation
By Chargeable Weight

Source
Forwarder Invoice #...
```

---

# 144. Allocation Matrix

A powerful grid could show:

| Item | Qty | Purchase Value | Weight | Volume | Freight | Customs | Handling | Total Add. | Landed Unit |
| ---- | --: | -------------: | -----: | -----: | ------: | ------: | -------: | ---------: | ----------: |

This should be exportable.

---

# 145. Cost Component Drill-Down

Clicking:

```text
Freight ৳50,000
```

shows only that allocation.

This avoids overwhelming users.

---

# 146. Variant Cost Detail

From Product/Variant:

```text
Red / M

Latest Receipt:
20 units

Supplier Cost:
৳500/unit

Freight:
৳70

Customs:
৳35

Handling:
৳8

Local Transport:
৳4

Landed:
৳617
```

---

# 147. Receipt Cost History

Variant page may show:

| Receipt | Date | Qty | Supplier Cost | Add. Cost | Landed Unit |
| ------- | ---- | --: | ------------: | --------: | ----------: |
| RCV-101 | Aug  |  20 |          ৳500 |      ৳117 |        ৳617 |
| RCV-204 | Oct  |  30 |          ৳520 |      ৳105 |        ৳625 |

This becomes extremely useful sourcing intelligence.

---

# 148. Supplier Cost Trend

Procurement can already show Supplier price changes.

Landed Cost adds:

```text
Actual total acquisition-cost trend.
```

These should be separately visible.

---

# 149. Profitability Connection

Later Analytics can use:

```text
Selling Revenue
-
Discounts
-
Product Cost basis
```

for margin analysis.

But it must explicitly state which cost basis is used.

Examples:

```text
Receipt Landed Cost

Inventory Valuation Cost

Latest Landed Cost
```

Never label all of these simply:

```text
Profit
```

without definition.

---

# 150. Cost Data Permissions

Sensitive capabilities:

```text
landed_cost.view

landed_cost.create

landed_cost.edit

landed_cost.allocate

landed_cost.finalize

landed_cost.reopen

landed_cost.override_basis

landed_cost.view_supplier_cost
```

---

# 151. Warehouse Staff

A Warehouse Receiver may need to see:

```text
Expected Quantity
Actual Quantity
```

without:

```text
Supplier Cost
Freight Cost
Landed Cost
Margin
```

Permission-sensitive read models are required.

---

# 152. Cost Analyst / Manager

May have:

```text
Procurement Cost
Shipment Expenses
Allocation
Finalization
```

without User Management permissions.

---

# 153. Cost Types Permissions

Managing global:

```text
Cost Types
Default Allocation Methods
Templates
```

should be more restricted than entering a cost into one Worksheet.

---

# 154. Cost Component Source Integration

Potential flow:

```text
Shipment Expense Created
      ↓
Eligible for Landed Cost
      ↓
Automatically appears as Cost Component
```

No duplicate manual entry.

---

# 155. Cost Eligibility Flag

Not every Shipment Expense should necessarily become landed cost.

Example:

```text
Late-payment penalty
```

may be operational expense but not part of inventory acquisition cost depending on business/accounting policy.

Therefore Expense/Cost Type needs:

```text
Include in Operational Landed Cost?
```

with explicit policy.

---

# 156. Direct Acquisition vs General Expense

Example:

```text
Freight
```

likely acquisition cost.

```text
Facebook Ads
```

not landed cost.

```text
Office Rent
```

not landed cost.

The platform must not allocate every business expense to Products.

---

# 157. Ambiguous Cost

Some expenses may require policy:

```text
Inspection Fee

Warehouse Storage

Sourcing Agent Fee

Currency Conversion Fee

Import License Fee
```

Cost Type configuration can determine default handling.

---

# 158. Cost Allocation Template Example

```text
Template:
China Air Import

International Freight
Scope: Shipment
Method: Chargeable Weight

China Domestic Freight
Scope: Shipment
Method: Weight

Customs / Duty
Scope: Eligible Items
Method: Purchase Value

Forwarder Service Fee
Scope: Shipment
Method: Equal

Local Transport
Scope: Shipment
Method: Equal
```

---

# 159. Cost Component Order

Display order should be configurable for readability.

It has no mathematical effect.

---

# 160. Nested Cost Allocation

Avoid unnecessary recursive costing where:

```text
Freight cost itself changes basis for Customs
which changes basis for another cost
```

unless business/legal rules specifically require it.

V1 should favor transparent independent allocation bases.

---

# 161. Customs Based on Declared Value

If customs charge is determined using a declared/customs value different from Purchase cost, support an explicit:

```text
Customs Value Basis
```

rather than abusing normal Purchase Value.

Foundation/preferred capability.

---

# 162. Custom Basis

Advanced future engine may support:

```text
DECLARED_VALUE
CARTON_COUNT
PACKAGE_WEIGHT
SUPPLIER
CUSTOM_METRIC
```

But V1 should not provide arbitrary user-written formulas.

---

# 163. No Formula Programming in V1

Do not create:

```text
User JavaScript Formula
SQL Formula
Expression Engine
```

inside landed cost.

That creates security, correctness and support problems.

Controlled allocation methods are safer.

---

# 164. Allocation Strategy Extensibility

Internally, implementation should allow adding a new controlled method later.

Example:

```text
BY_CARTON_COUNT
```

without rewriting the entire engine.

Business Central itself exposes extensible item-charge distribution methods beyond its standard allocation options, reinforcing the usefulness of keeping the strategy implementation modular.

---

# 165. Cost Allocation Engine

Conceptually:

```text
Cost Component
      ↓
Determine Eligible Targets
      ↓
Load Allocation Basis
      ↓
Validate Basis
      ↓
Normalize Basis
      ↓
Calculate Shares
      ↓
Calculate Raw Allocations
      ↓
Apply Deterministic Rounding
      ↓
Validate Reconciliation
      ↓
Produce Allocation Results
```

---

# 166. Pure Calculation Core

The mathematical allocation engine should ideally be implemented as deterministic domain logic.

Inputs:

```text
Cost

Targets

Basis values

Currency precision

Method
```

Output:

```text
Allocation result
```

This makes it highly testable.

---

# 167. Side-Effect Separation

Calculation should not itself:

```text
change Inventory
post Payments
send Webhooks
```

Those actions occur after validated application operations.

---

# 168. Idempotency

Finalizing:

```text
LC-82 Revision 2
```

twice must not apply cost results twice.

Finalization requires unique operation identity/state protection.

---

# 169. Concurrency

Two users editing the same Worksheet:

```text
User A modifies Freight.

User B finalizes old version.
```

must not silently succeed.

Use optimistic concurrency/version checking.

---

# 170. Immutable Finalized Revision

Once a revision is finalized:

```text
allocation results
basis snapshots
FX rates
amounts
```

should be treated as immutable historical data.

Reopen/new revision for changes.

---

# 171. Domain Events

Potential:

```text
landed_cost.created

landed_cost.estimated

landed_cost.component_added

landed_cost.recalculated

landed_cost.ready

landed_cost.finalized

landed_cost.reopened

landed_cost.adjusted
```

---

# 172. Event Consumers

May update:

```text
Product cost views

Procurement analytics

Inventory cost projections

Profitability analytics

Notifications

Webhooks

Future accounting integration
```

---

# 173. Structured Errors

Examples:

```text
LANDING_COST_MISSING_FX_RATE

ALLOCATION_BASIS_MISSING

ALLOCATION_BASIS_ZERO

ALLOCATION_DOES_NOT_RECONCILE

INVALID_PERCENTAGE_TOTAL

NO_ELIGIBLE_TARGETS

WORKSHEET_ALREADY_FINALIZED

WORKSHEET_VERSION_CONFLICT

UNRESOLVED_RECEIPT_VARIANCE

DUPLICATE_COST_SOURCE

COST_COMPONENT_NOT_ACTUAL
```

---

# 174. Validation — Quantity

For:

```text
BY_QUANTITY
```

eligible total quantity must be:

```text
> 0
```

---

# 175. Validation — Weight

For:

```text
BY_WEIGHT
```

every required target needs valid weight or explicit exclusion.

---

# 176. Validation — Volume

Same principle.

---

# 177. Validation — Purchase Value

Purchase value must be:

```text
known
currency-normalized
non-invalid
```

---

# 178. Validation — Manual Allocation

Allocated total must reconcile exactly.

---

# 179. Validation — Percentage

Percentage must reconcile to configured total:

```text
100%
```

---

# 180. Cost Component With Zero Amount

May be permitted in Draft.

Should generally not create meaningless finalized allocations unless deliberately retained for template completeness.

---

# 181. Negative Cost

Only allowed through appropriate:

```text
Credit
Adjustment
```

semantics.

Prevent accidental:

```text
Freight = -৳50,000
```

without context.

---

# 182. Cost Deletion

Draft Cost Components can be deleted when safe.

Actual/source-linked or finalized components should use:

```text
Void
Exclude
Adjustment
```

according to state.

---

# 183. Cost Source Changed

If an Expense source changes after Cost finalization:

```text
do not silently update finalized landed cost.
```

Raise:

```text
Cost Source Changed
Reconciliation Required
```

---

# 184. Source Consistency Monitoring

Preferred V1:

```text
Shipment Expense:
৳10,000

Finalized Cost Component:
৳9,500
```

should be detectable if they are meant to be linked.

---

# 185. Cost Reconciliation Dashboard

Potential issues:

```text
Actual Shipment Expenses Not Allocated

Estimated Components Still Open

Finalized Worksheets With Changed Sources

Missing FX Rates

Unresolved Receipt Variances

Unfinalized Received Shipments
```

---

# 186. Shipment Cost Status

Shipment can derive:

```text
NOT_STARTED

ESTIMATED

IN_PROGRESS

FINALIZED

RECONCILIATION_REQUIRED
```

from Landed Cost.

---

# 187. Receipt Cost Status

Similarly:

```text
PROVISIONAL_COST

FINAL_COST
```

can be surfaced on Receipt/Inventory views.

---

# 188. Catalog Cost Display

Catalog manager may see:

```text
Latest Landed Cost:
৳617
```

if permitted.

But this is a read projection.

Catalog does not own the value.

---

# 189. Cost Snapshot in Order

Do not automatically read today's Landed Cost when analyzing an old Order.

Historical sales profitability requires a defined transaction-time cost basis.

That belongs to future Order/Costing integration.

---

# 190. Returns

Customer return does not create a new landed cost.

Returned Inventory retains cost history according to inventory valuation policy.

Landed Cost remains associated with original acquisition.

---

# 191. Warehouse Transfer

Internal Warehouse Transfer normally does not change original Supplier landed cost.

However, future businesses may want internal distribution costs allocated separately.

Do not mix:

```text
Inbound acquisition landed cost
```

with:

```text
internal distribution cost
```

without explicit policy.

---

# 192. Outbound Courier Cost

Customer delivery cost:

```text
Pathao Courier
```

is not inbound product landed cost.

Keep it in Order/Fulfillment profitability.

---

# 193. Customer Return Courier Cost

Also operational/order expense, not original inbound landed cost.

---

# 194. Marketing Cost

Facebook Ads:

```text
never part of product landed cost by default.
```

Analytics may later calculate contribution margin separately.

---

# 195. Full Profitability Layers

Future analytics could show:

```text
Revenue
-
Discount
-
Product Acquisition Cost
-
Outbound Delivery Cost
-
Payment Fees
-
Marketing Attribution
=
Contribution Margin
```

but those are separate layers.

Landed Cost handles the Product Acquisition layer.

---

# 196. Landed Cost Analytics

Useful V1 reporting:

```text
Landed Cost by Product

Landed Cost by Variant

Landed Cost by Shipment

Supplier Cost vs Landed Cost

Additional Cost Percentage

Freight Contribution

Customs Contribution

Estimated vs Actual Variance

Cost Trend Over Time
```

---

# 197. Additional Cost Percentage

Example:

```text
Supplier Cost:
৳500

Landed Cost:
৳650

Additional Acquisition Cost:
৳150

Additional Cost %:
30% of Supplier Cost
```

Useful sourcing insight.

---

# 198. Shipment Cost Efficiency

Potential:

```text
Additional Cost per kg

Freight per kg

Additional cost per unit

Landed uplift %
```

when basis data is reliable.

---

# 199. Cost Component Analytics

Example:

```text
International Freight
35% of additional acquisition costs

Customs
40%

Local Transport
10%

Other
15%
```

---

# 200. Provider Cost Analytics — Future

Compare:

```text
Forwarder A

vs

Forwarder B
```

based on:

```text
Freight/kg
Transit time
Damage
```

Shipment domain provides operational data; Landed Cost provides financial data.

---

# 201. Cost Simulation — Future

Before ordering:

```text
What if we buy 500 instead of 100?

What if we use Sea instead of Air?

What if freight rises 15%?
```

Structured cost rules can eventually support this.

---

# 202. Pricing Recommendation — Future

Future:

```text
Landed Cost
+
Target Margin
=
Suggested Selling Price
```

But Pricing remains responsible for the actual selling price.

Landed Cost may provide cost input.

---

# 203. Audit Events

Important:

```text
Worksheet created

Cost added

Cost removed

Cost source changed

Allocation method changed

Eligibility changed

Basis overridden

FX rate changed

Estimate replaced by Actual

Finalized

Reopened

Revision created
```

---

# 204. Audit Detail

Example:

```text
Freight allocation changed:

From:
BY_QUANTITY

To:
BY_WEIGHT

Actor:
User X

Reason:
Forwarder invoiced based on kg
```

---

# 205. Permissions

Recommended:

```text
landed_cost.view

landed_cost.view_breakdown

landed_cost.create

landed_cost.edit

landed_cost.cost_component.manage

landed_cost.allocate

landed_cost.override_basis

landed_cost.fx.manage

landed_cost.finalize

landed_cost.reopen

landed_cost.templates.manage
```

---

# 206. Cost Data Masking

A user without cost permission should not receive:

```text
Supplier Purchase Cost
Landed Cost
Margin
```

in API responses merely because frontend buttons are hidden.

---

# 207. Worksheet Search

Search by:

```text
Worksheet Number

Shipment

Purchase

Supplier

Product

SKU

Cost Source / Invoice
```

---

# 208. Worksheet Filters

Useful:

```text
Draft

Estimated

Partially Actual

Ready

Finalized

Reconciliation Required

Shipment

Supplier

Date

Currency

Has Missing Basis

Has Variance
```

---

# 209. Saved Views

Examples:

```text
Awaiting Final Freight

Received but Cost Not Finalized

Missing FX

Large Estimate Variance

Reopened Costs
```

---

# 210. Worksheet Number

Human-readable:

```text
LC-2026-00122
```

Internal ID remains separate.

---

# 211. Cost Revision Number

Example:

```text
LC-2026-00122 / R1
LC-2026-00122 / R2
```

---

# 212. Cost Export

V1 should support export of:

```text
Cost Targets

Supplier Cost

Cost Components

Allocation Results

Unit Cost

FX Rates

Estimated / Actual
```

to CSV/XLSX-friendly format.

---

# 213. Excel Is an Export, Not the Source of Truth

The business may still export costing to Excel for analysis.

But:

```text
Excel
```

should not be required to perform the authoritative cost calculation.

The platform owns the result.

---

# 214. Spreadsheet-Like UX

The Allocation Worksheet should still take advantage of spreadsheet efficiency.

Support:

```text
Keyboard navigation

Bulk entry

Paste amounts

Paste percentages

Copy allocations

Fast recalculation
```

where practical.

---

# 215. Cost Allocation Import

For complex forwarder breakdowns:

```text
SKU / Package / Amount
```

may be imported.

Validation/preview is mandatory.

---

# 216. Manual Allocation Paste

Example user pastes:

```text
SKU-A     1200
SKU-B     3500
SKU-C      800
```

System matches targets and validates total.

---

# 217. Cost Formula Testing

This domain requires exceptionally strong automated testing.

Especially:

```text
Rounding

Multi-currency

Quantity allocation

Weight allocation

Volume allocation

Percentage allocation

Manual allocation

Zero basis

Credits

Partial receipt

Recalculation

Finalization

Revision
```

---

# 218. Property-Based Tests — Strongly Recommended

The allocation engine is a strong candidate for property-based testing.

Example invariant:

For any valid positive cost:

```text
sum(allocations)
=
source cost
```

regardless of:

```text
number of targets
basis values
currency precision
```

---

# 219. Determinism Test

Same inputs must always generate same allocations.

This is essential for auditability.

---

# 220. Rounding Stress Tests

Test:

```text
৳1 split across 3

৳0.01 split across 100

Very large amount

Many tiny basis values

Different currencies

Very unequal basis
```

---

# 221. FX Stress Test

Test:

```text
CNY Purchase

USD Freight

BDT Customs

BDT Worksheet
```

and verify conversions/reconciliation.

---

# 222. Partial Receipt Stress Test

Expected:

```text
100
```

Receive:

```text
40
30
25
```

with:

```text
5 short
```

must produce explainable costing state.

---

# 223. Multi-Purchase Stress Test

Shipment contains:

```text
10 Purchases

8 Suppliers

200 Variants

20 Cost Components
```

Engine must remain correct and reasonably performant.

---

# 224. Performance

Allocation is generally batch calculation, not every-page real-time processing.

We can afford strong validation.

But it should still handle hundreds or thousands of targets efficiently.

---

# 225. Recalculation Strategy

Changing one Cost Component should not require unnecessary unrelated external API operations.

Calculation can operate from Worksheet snapshot/projection.

---

# 226. Transactional Finalization

Finalization should atomically record:

```text
Final revision state

Allocation results

Basis snapshot

FX snapshot

Final total
```

so half-finalized states cannot occur.

---

# 227. Failed Finalization

If persistence fails:

```text
Worksheet remains unfinalized.
```

Do not partially publish some target costs.

---

# 228. Landed Cost API Commands

Conceptual:

```text
createWorksheet()

loadShipmentCosts()

addCostComponent()

updateCostComponent()

setEligibility()

setAllocationMethod()

overrideAllocationBasis()

calculateAllocation()

previewAllocation()

markEstimate()

replaceWithActual()

finalizeWorksheet()

reopenWorksheet()

createRevision()
```

---

# 229. Queries

```text
getWorksheet()

getCostBreakdown()

getAllocationPreview()

getVariantCostHistory()

getShipmentCostSummary()

getUnfinalizedShipments()

getCostVariance()
```

---

# 230. Domain Boundary Map

```text
PROCUREMENT
│
├── Supplier Cost
└── Purchase Quantity
          │
          ▼
SHIPMENT
│
├── Shipment Items
├── Weight
├── Volume
├── Chargeable Weight
└── Shipment Expenses
          │
          ▼
     LANDED COST
          │
          ├── Cost Components
          ├── Eligibility
          ├── Allocation Basis
          ├── FX
          ├── Allocation Engine
          └── Reconciliation
                  │
                  ▼
             Cost Result
                  │
          ┌───────┴────────┐
          ▼                ▼
      INVENTORY        ANALYTICS
    Cost Context       Profitability
```

---

# 231. Example — Real Maevelle Shipment

Assume:

```text
Shipment SH-001

Product A
Hat
Qty: 100
Purchase Value: ৳20,000
Weight: 10 kg

Product B
Dress
Qty: 20
Purchase Value: ৳40,000
Weight: 30 kg

Product C
Jewelry
Qty: 50
Purchase Value: ৳40,000
Weight: 5 kg
```

Additional costs:

```text
Freight:
৳45,000
By Weight

Customs:
৳20,000
By Purchase Value

Local Transport:
৳3,000
Equal

Handling:
৳1,700
Manual
```

---

# 232. Freight Allocation

Total Weight:

```text
10 + 30 + 5
=
45 kg
```

Therefore approximately:

```text
Hat:
10 / 45 × 45,000
=
৳10,000

Dress:
30 / 45 × 45,000
=
৳30,000

Jewelry:
5 / 45 × 45,000
=
৳5,000
```

---

# 233. Customs Allocation

Purchase Value total:

```text
৳100,000
```

Shares:

```text
Hat:
20%
→ ৳4,000

Dress:
40%
→ ৳8,000

Jewelry:
40%
→ ৳8,000
```

---

# 234. Local Transport

Equal across three Cost Targets:

```text
৳3,000 / 3
=
৳1,000 each
```

---

# 235. Manual Handling

Suppose:

```text
Hat:
৳500

Dress:
৳800

Jewelry:
৳400
```

Total:

```text
৳1,700
```

reconciles.

---

# 236. Hat Final Cost

Purchase:

```text
৳20,000
```

Additional:

```text
Freight       10,000
Customs        4,000
Transport      1,000
Handling         500
--------------------
Additional    15,500
```

Total acquisition:

```text
৳35,500
```

Quantity:

```text
100
```

Landed cost:

```text
৳355/unit
```

---

# 237. Dress Final Cost

Purchase:

```text
৳40,000
```

Additional:

```text
30,000
8,000
1,000
800
=
39,800
```

Total:

```text
৳79,800
```

Quantity:

```text
20
```

Landed:

```text
৳3,990/unit
```

---

# 238. Why Equal Quantity Would Be Wrong

If we simply allocated:

```text
৳69,700 total additional cost
```

by number of units:

```text
100 hats
20 dresses
50 jewelry
```

the lightweight, low-value Hats would receive most shared cost simply because there are more units.

The mixed method better models the different nature of each charge.

---

# 239. Cost Confidence

Preferred future field:

```text
ESTIMATED

PARTIAL

FINAL
```

at target/result level.

This lets Product managers understand whether:

```text
৳617
```

is provisional or final.

---

# 240. Cost Freshness

Display:

```text
Final Landed Cost
Calculated Aug 20, 2026
Revision 2
```

rather than a contextless number.

---

# 241. Cost Finalization Notification

Useful:

```text
Shipment SH-82 landed cost finalized.

Average landed-cost uplift:
24.3%
```

linking to Worksheet.

---

# 242. Cost Variance Alert

Example:

```text
Actual Freight exceeded estimate by 18%.
```

could trigger notification if threshold configured.

---

# 243. Future Threshold Rules

Examples:

```text
Notify when actual cost > estimate by 10%

Notify when landed-cost uplift > 40%

Notify when FX variance exceeds X
```

Post-V1 enhancement.

---

# 244. Important Invariants

### LC-INV-001

Every Landed Cost Worksheet belongs to one Organization.

### LC-INV-002

Every Cost Component has explicit currency.

### LC-INV-003

Original Cost currency and converted base amount remain distinguishable.

### LC-INV-004

Every Cost Component has an explicit scope/eligibility population.

### LC-INV-005

Every allocation has an explicit method.

### LC-INV-006

Different Cost Components may use different allocation methods.

### LC-INV-007

Supplier Purchase Cost and additional acquisition costs remain distinct.

### LC-INV-008

Landed Cost does not rewrite Supplier Purchase Price.

### LC-INV-009

Final allocated amount must reconcile exactly to Cost Component amount after defined conversion/rounding.

### LC-INV-010

Missing allocation basis must not silently exclude eligible targets.

### LC-INV-011

Allocation basis inputs are snapshotted for finalized results.

### LC-INV-012

Finalized results do not silently recalculate when Catalog or Shipment data later changes.

### LC-INV-013

Finalized revisions are historically immutable.

### LC-INV-014

Corrections occur through controlled reopen/revision/adjustment.

### LC-INV-015

Estimated and actual costs remain distinguishable.

### LC-INV-016

A Shipment can have provisional landed cost before final cost.

### LC-INV-017

Inventory may become operational before all final costs are known.

### LC-INV-018

One Variant may have different landed costs across different acquisition receipts.

### LC-INV-019

Landed Cost does not itself define inventory valuation method.

### LC-INV-020

Customer outbound delivery and marketing costs are not normal inbound landed-cost components.

### LC-INV-021

Critical cost finalization is concurrency-safe and idempotent.

### LC-INV-022

Manual allocations must reconcile exactly.

### LC-INV-023

Percentage allocations must reconcile to 100% under configured precision.

### LC-INV-024

Currency conversion requires an explicit historical rate context.

### LC-INV-025

Finalized cost results remain explainable down to component and allocation basis.

---

# 245. V1 Mandatory Scope

Maevelle V1 Landed Cost should include:

```text
✓ Landed Cost Worksheet

✓ Shipment-centric costing

✓ Purchase Cost ingestion

✓ Shipment Expense ingestion

✓ Cost Types

✓ Cost Components

✓ Cost Sources

✓ Cost Scope

✓ Target Eligibility

✓ Estimated Cost

✓ Actual Cost

✓ Estimate vs Actual Variance

✓ Cost Credits / Adjustments

✓ Multiple Currencies

✓ Worksheet Base Currency

✓ Manual FX Rates

✓ FX Snapshot

✓ EQUAL Allocation

✓ BY_QUANTITY

✓ BY_PURCHASE_VALUE

✓ BY_WEIGHT

✓ BY_VOLUME

✓ BY_CHARGEABLE_WEIGHT

✓ BY_PERCENTAGE

✓ MANUAL_AMOUNT

✓ Different Allocation Per Cost

✓ Direct item-specific cost

✓ Per-unit cost support

✓ Percentage-derived cost support

✓ Allocation Preview

✓ Cost Breakdown

✓ Basis Snapshot

✓ Missing Basis Validation

✓ Rounding / Exact Reconciliation

✓ Partial Shipment Support

✓ Partial Receipt Support

✓ Damage awareness

✓ Loss / shortage review

✓ Over-receipt awareness

✓ Bonus/free-unit foundation

✓ Provisional Landed Cost

✓ Final Landed Cost

✓ Finalization

✓ Reopening

✓ Revisions

✓ Variant/Receipt Cost History

✓ Shipment Cross-Link

✓ Procurement Cross-Link

✓ Inventory Cost Context

✓ Analytics integration

✓ Search / Filtering

✓ Permissions

✓ Audit

✓ Concurrency

✓ Idempotency

✓ CSV/XLSX-friendly Export
```

---

# 246. Strongly Preferred V1

```text
Cost Templates

Default method per Cost Type

Spreadsheet-like allocation matrix

Manual allocation paste

Cost comparison preview

Received-but-unfinalized dashboard

Cost health/reconciliation dashboard

Estimate variance alerts

Customs/declared value basis

Supplier bonus/free-unit support

Basic cost scenario comparison
```

---

# 247. Foundation Now / Later

Architecture should prepare for:

```text
Accounting valuation integration

FIFO / Average Cost

COGS integration

Financial Goods in Transit

Automated FX provider

Customs valuation rules

Automatic cost templates

Provider invoice ingestion

Cost allocation by package/carton

Supplier credits

Insurance claims

Internal distribution costing
```

---

# 248. Deferred Advanced Capabilities

Post-V1:

```text
Automatic Freight Invoice OCR

Automatic Cost Matching

Automatic FX Feeds

Advanced Cost Forecasting

Scenario Planning

Purchase Quantity Optimization

Air vs Sea Cost Simulation

Accounting Journal Integration

FIFO Cost Layers

Weighted-Average Inventory Valuation

Cost of Goods Sold Posting

Advanced Customs Rules

Automatic Provider Rate Import

Cost Anomaly Detection

AI Cost Forecasting
```

---

# 249. Decisions Established

### Decision LC-001

**Landed Cost is a dedicated first-class domain.**

### Decision LC-002

**Landed Cost is calculated from direct Purchase Cost plus allocated direct acquisition costs.**

### Decision LC-003

**Shipment is the primary V1 costing context.**

### Decision LC-004

**A Cost Component has explicit source, amount, currency, scope, eligibility and allocation method.**

### Decision LC-005

**Different costs can use different allocation methods.**

### Decision LC-006

**V1 supports equal, quantity, purchase-value, weight, volume, chargeable-weight, percentage and manual allocation.**

### Decision LC-007

**Allocation scope and allocation method are separate concepts.**

### Decision LC-008

**Allocation eligibility is explicit.**

### Decision LC-009

**Actual logistics data may override generic Catalog measurements for costing when appropriate.**

### Decision LC-010

**Allocation inputs are snapshotted when finalized.**

### Decision LC-011

**Cost allocations reconcile exactly to source amounts.**

### Decision LC-012

**Rounding is deterministic.**

### Decision LC-013

**Estimated and actual Cost Components remain historically distinguishable.**

### Decision LC-014

**Multi-currency Cost Components preserve original currency and the conversion rate used.**

### Decision LC-015

**Old landed-cost results do not recalculate using current FX rates.**

### Decision LC-016

**One Variant can have multiple historical landed costs from different Receipts/Shipments.**

### Decision LC-017

**Landed Cost does not define the future accounting inventory-valuation policy.**

### Decision LC-018

**Inventory can become sellable with provisional landed cost when operationally necessary.**

### Decision LC-019

**Finalized cost changes require reopening/revision rather than silent edits.**

### Decision LC-020

**Damaged/lost inventory is not automatically treated as having zero acquisition cost.**

### Decision LC-021

**Customer delivery, marketing and unrelated operating expenses are not normal inbound landed costs.**

### Decision LC-022

**The allocation engine will use deterministic testable domain logic.**

### Decision LC-023

**External Excel may consume cost data, but Excel is not the authoritative calculation system.**

### Decision LC-024

**Every final landed-cost number must be explainable down to the individual Cost Components and allocation bases that created it.**

---

# 250. Result

We now have the complete acquisition chain:

```text
SUPPLIER
   ↓
PURCHASE
   ↓
SUPPLIER COST
   ↓
INBOUND SHIPMENT
   │
   ├── Freight
   ├── Customs
   ├── Forwarder
   ├── Insurance
   ├── Handling
   └── Local Transport
           │
           ▼
    LANDED COST ENGINE
           │
    ┌──────┼─────────┐
    │      │         │
 Quantity Weight    Value
 Volume   Manual    etc.
    │      │         │
    └──────┼─────────┘
           ▼
   ALLOCATION RESULTS
           ↓
   LANDED UNIT COST
           ↓
       RECEIPT COST
           ↓
   INVENTORY / ANALYTICS
```

The original manual problem:

```text
Shipment total cost = ৳5,853

How much belongs to each Product?
```

is no longer solved by:

```text
one Excel formula
```

but by a reusable system that understands:

```text
which cost
which goods
which quantity
which weight
which value
which currency
which method
which receipt
which revision
and why.
```

---

# 251. Important Architecture Milestone

At this point the hardest **physical acquisition chain** is substantially defined:

```text
Catalog
   ↓
Variant
   ↓
Supplier Mapping
   ↓
Purchase
   ↓
Inbound Shipment
   ↓
Landed Cost
   ↓
Receiving
   ↓
Warehouse
   ↓
Inventory
```

That gives us enough clarity to move into the **selling side of the system** without guessing how purchased stock and product cost work.

---

# 252. Next Domain

The next highest-risk domain should now be:

```text
docs/domains/orders/order-lifecycle-architecture.md
```

This needs the same level of stress testing because we must connect:

```text
Storefront Order

Manual Order

Customer

Cart

Checkout

Inventory Reservation

Order Confirmation

Order Editing

Payment Status

Fulfillment Status

Order Status

Warehouse Allocation

Partial Fulfillment

Cancellation

Rejected Order

On Hold

Delivery Failure

Returns

Partial Returns

Refunds

Manual Corrections

Order Timeline

Order Snapshots

Invoices

Permissions

Audit

Idempotency

Concurrency

Unexpected Failures
```

Most importantly, we should **not** create one giant:

```text
order.status
```

trying to represent payment, inventory, fulfillment and delivery simultaneously.

The Order Architecture should define an independent but coordinated state model for:

```text
ORDER STATE

PAYMENT STATE

FULFILLMENT STATE
```

and later Delivery can add its own lifecycle without corrupting Orders.

---

**End of Landed Cost & Cost Allocation Architecture v0.1**
