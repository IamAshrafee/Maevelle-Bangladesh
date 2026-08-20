# Maevelle Ecommerce — Inventory Costing & COGS Architecture

**Document:** `docs/domains/inventory-costing/inventory-costing-cogs-architecture.md`
**Status:** Initial Domain Architecture / Living Document
**Version:** 0.1
**Related:** Inventory, Procurement, Inbound Shipment, Landed Cost, Orders, Pricing, Finance, Analytics, PostgreSQL Schema Specification

---

# 1. Purpose

This document defines how Maevelle assigns monetary acquisition cost to physical inventory and how that cost eventually becomes:

```text id="d01">
Inventory Value

Cost of Goods Sold

Inventory Loss

Returned Inventory Cost

Margin
```

It answers:

```text id="d02">
What creates a Cost Layer?

What cost does a received unit carry?

Which layer is consumed when stock leaves?

How does FIFO work?

What happens during transfers?

What happens when a delivery fails?

What happens when a customer returns an item?

What happens when landed cost changes after stock was sold?

What happens when physical stock exists but cost is unknown?

How is COGS calculated?

How is historical margin corrected?
```

---

# 2. Central Principle

> **Physical Inventory Truth and Inventory Cost Truth are separate but explicitly connected.**

Inventory answers:

```text id="d03">
How many units physically exist?

Where?

In what condition?

How many are reserved?
```

Costing answers:

```text id="d04">
What acquisition cost is attached to those quantities?

Which cost was assigned when quantities left Inventory?

What amount became COGS?

What cost remains in Inventory?
```

Neither domain replaces the other.

---

# 3. Second Core Principle

> **Purchase Price ≠ Landed Cost ≠ Inventory Value ≠ COGS.**

Example:

```text id="d05">
Supplier unit price:
৳400

Allocated freight/customs:
৳90

Acquisition cost:
৳490

Selling price:
৳850
```

When the unit is still held:

```text id="d06">
৳490
=
inventory acquisition cost
```

When the qualifying sale becomes economically recognized:

```text id="d07">
৳490
=
COGS attributable to that sold unit
```

---

# 4. Third Core Principle

> **V1 uses perpetual FIFO cost layers.**

Maevelle therefore assigns cost using:

```text id="d08">
First acquired eligible cost layer
→ first cost consumed
```

for an Inventory Item.

This is a **cost-flow formula**, not a guarantee that warehouse workers physically pick the oldest individual object.

IAS 2 recognizes specific identification for non-interchangeable inventory and FIFO or weighted-average formulas for ordinarily interchangeable inventory. It also calls for consistent formulas for inventories of similar nature and use. That supports FIFO as a defensible V1 baseline, while Maevelle's module remains management architecture rather than a claim of statutory-accounting compliance.

---

# 5. Why FIFO for V1?

Our architecture already has:

```text id="d09">
Purchase

Shipment Item

Inbound Receipt Line

Landed Cost Allocation

Acquisition Cost Layer
```

FIFO preserves that provenance naturally.

Example:

```text id="d10">
Receipt A:
10 units @ ৳450

Receipt B:
20 units @ ৳520
```

A sale of 12 units consumes:

```text id="d11">
10 × ৳450
+
2 × ৳520
```

rather than losing the distinction between acquisition batches.

---

# 6. Why Not Weighted Average V1?

Weighted average remains a legitimate future method.

But V1 FIFO gives stronger:

```text id="d12">
Receipt traceability

Landed-cost traceability

Return restoration

Late-cost adjustment traceability

Supplier/batch profitability analysis
```

with the model we have already designed.

---

# 7. Why Not Specific Identification V1?

Specific Identification requires reliable identification of the exact unit being sold.

That normally needs:

```text id="d13">
Serial tracking

Lot tracking

Unique physical identifiers
```

Maevelle V1 does not require those.

Specific identification therefore remains future-ready.

---

# 8. LIFO

Maevelle will not implement LIFO.

Our management model should not introduce an unnecessary method that also falls outside IAS 2's permitted FIFO/weighted-average formula for ordinarily interchangeable inventory.

---

# 9. Statutory Accounting Boundary

This architecture provides:

```text id="d14">
Operational acquisition costing

Management inventory valuation

Management COGS attribution

Management margin
```

It does not claim to provide:

```text id="d15">
Statutory financial statements

Tax accounting

Complete IFRS compliance

General ledger accounting

NRV accounting

Auditor adjustments
```

Those can integrate later.

---

# 10. Standards Alignment

IAS 2 describes inventory cost as including purchase/conversion and other costs incurred in bringing inventories to their present location and condition, and recognizes the carrying amount as expense when related inventory is sold. This supports the conceptual separation we are using between acquisition cost accumulation and later COGS recognition.

---

# 11. Core Concepts

The domain introduces:

```text id="d16">
Costing Policy

Acquisition Cost Layer

Cost Layer Adjustment

Cost Layer Position

Cost Assignment

Outbound Cost Assignment

Transfer Cost Allocation

Inventory Loss Allocation

COGS Recognition

COGS Adjustment

COGS Reversal

Cost Reconciliation
```

---

# 12. Costing Policy

Organization has an explicit Costing Policy.

V1:

```text id="d17">
PERPETUAL_FIFO
```

---

# 13. Costing Method Is High Impact

Changing:

```text id="d18">
FIFO
→
Weighted Average
```

after commercial history exists is not an ordinary Settings change.

It requires:

```text id="d19">
migration policy

effective boundary

valuation review

analytics implications

audit
```

---

# 14. V1 Method Change

Recommended:

> Do not allow self-service costing-method changes after posted inventory activity exists.

Such a migration requires a dedicated future command/process.

---

# 15. Cost Layer

An **Acquisition Cost Layer** represents a quantity of an Inventory Item acquired under one identifiable cost provenance.

Typical source:

```text id="d20">
Inbound Receipt Line
```

---

# 16. Example

```text id="d21">
Receipt:
50 HAT-RED-M

Purchase cost:
৳20,000

Allocated freight:
৳3,000

Allocated customs:
৳1,000

Total acquisition:
৳24,000

Unit acquisition cost:
৳480
```

This becomes one Cost Layer or one proportional layer for that Receipt context.

---

# 17. Cost Layer Identity

A Cost Layer must preserve:

```text id="d22">
Inventory Item

Receipt Line

Shipment Item

Received Quantity

Currency

Base Purchase Cost

Additional Landed Cost

Total Acquisition Cost

Unit Acquisition Cost

Cost Status

Original FIFO Sequence
```

---

# 18. Cost Layer Does Not Mean Physical Lot Tracking

Two physical hats do not need labels saying:

```text id="d23">
Cost Layer A
```

Cost Layer is financial provenance.

---

# 19. Layer Quantity

A Cost Layer has:

```text id="d24">
original quantity
```

and quantity positions showing where its remaining cost-bearing quantity currently resides.

---

# 20. Cost Status

Recommended:

```text id="d25">
PROVISIONAL

FINAL

ADJUSTED

UNVALUED
```

---

# 21. PROVISIONAL

We know enough to estimate acquisition cost, but:

```text id="d26">
final freight

customs

tax

handling
```

may still change.

---

# 22. FINAL

The current acquisition-cost basis is considered finalized for operational management purposes.

---

# 23. ADJUSTED

A previously finalized/provisional Layer received a later legitimate cost adjustment.

Historical revisions remain traceable.

---

# 24. UNVALUED

Physical quantity exists, but reliable acquisition cost is unavailable.

Important:

> Unknown cost is not zero cost.

---

# 25. Never Fake Zero Cost

Forbidden:

```text id="d27">
Cost unknown
→ unit_cost = 0
```

because it would create fake:

```text id="d28">
Inventory value

COGS

Gross Margin
```

---

# 26. Cost Layer Creation

Normal flow:

```text id="d29">
Purchase Line
      ↓
Inbound Shipment
      ↓
Inbound Receipt
      ↓
Inventory Transaction
      ↓
Cost Layer
```

---

# 27. Layer Creation Timing

Create Layer when physical Receipt is posted.

Not when:

```text id="d30">
Purchase is created

Shipment departs

Shipment arrives at airport
```

because goods have not yet entered canonical received Inventory.

---

# 28. Base Acquisition Cost

Initial base cost derives from:

```text id="d31">
Purchase Line agreed unit cost
×
received quantity
```

with applicable purchase amendments/invoice reconciliation as defined by Procurement.

---

# 29. Additional Acquisition Cost

Comes from authoritative:

```text id="d32">
Landed Cost Allocations
```

not independent Costing calculations.

---

# 30. Costing Does Not Recalculate Landed Cost

Landed Cost owns:

```text id="d33">
which freight/customs/etc. belongs to which Shipment Item.
```

Costing consumes the resulting allocation.

---

# 31. Multiple Partial Receipts

Shipment Item:

```text id="d34">
100 units
```

may arrive:

```text id="d35">
Receipt A:
60

Receipt B:
40
```

The Shipment Item's acquisition cost must be allocated across those Receipt layers proportionally and deterministically.

---

# 32. Receipt Layer Allocation

If total final Shipment Item acquisition cost is:

```text id="d36">
৳50,000
```

for:

```text id="d37">
100 units
```

then:

```text id="d38">
60-unit receipt:
৳30,000

40-unit receipt:
৳20,000
```

subject to deterministic rounding.

---

# 33. Over-Receipt

Expected:

```text id="d39">
100
```

Actually received:

```text id="d40">
103
```

Costing must not pretend the extra three units have no cost.

Commercial reconciliation must determine:

```text id="d41">
supplier cost

landed-cost treatment
```

Until resolved they may remain:

```text id="d42">
PROVISIONAL
or
UNVALUED
```

---

# 34. Cost Layer Position

Cost Layer itself represents origin.

Its quantity may later be split across:

```text id="d43">
Warehouse A

Warehouse B

Damaged Stock

Inspection

Outbound pending Customer outcome
```

Therefore Layer origin and Layer current position must be separate.

---

# 35. Cost Position

Conceptually:

```text id="d44">
CostLayerPosition {
    layer
    location
    condition
    quantity
}
```

---

# 36. Position Reconciliation

For Inventory held at locations:

```text id="d45">
Cost Layer Position quantity
```

must reconcile with relevant physical Inventory quantity.

---

# 37. Reservations

Inventory Reservation does:

```text id="d46">
NOT
consume Cost Layers.
```

It reserves quantity, not cost.

---

# 38. Why Not Assign FIFO at Reservation?

Because Reservation can later be:

```text id="d47">
released

expired

partially fulfilled

fulfilled from another allocation
```

Cost should be assigned when the physical disposition occurs.

---

# 39. Margin Preview

Checkout/Admin may estimate COGS from current FIFO layers.

But it is:

```text id="d48">
ESTIMATED COGS
```

not authoritative COGS.

---

# 40. Cost Assignment

When quantity physically leaves a location for a cost-relevant disposition, Costing selects eligible Cost Layers.

Example:

```text id="d49">
Fulfill 7 units
```

FIFO algorithm selects available layer positions until 7 units are assigned.

---

# 41. FIFO Ordering

Canonical key:

```text id="d50">
fifo_sequence_at ASC
then stable Cost Layer ID
```

---

# 42. FIFO Sequence Date

Recommended source:

```text id="d51">
original physical receipt posting time
```

not:

```text id="d52">
Purchase creation

Supplier Invoice date

Transfer receipt date
```

---

# 43. Transfer Does Not Reset FIFO Age

Cost Layer received in January and transferred in March remains January-origin cost.

Do not turn it into:

```text id="d53">
new March acquisition
```

---

# 44. Layer Selection Location

Fulfillment can consume only Cost Layer quantities physically available at the selected fulfillment Location.

---

# 45. Condition Eligibility

Normal sale consumes:

```text id="d54">
SELLABLE
```

Cost Positions.

It does not consume:

```text id="d55">
DAMAGED

QUARANTINE

INSPECTION
```

unless an explicit workflow changes condition first.

---

# 46. Example FIFO Consumption

Current Location:

```text id="d56">
Layer A:
5 @ ৳400

Layer B:
10 @ ৳500

Layer C:
10 @ ৳550
```

Fulfillment:

```text id="d57">
8 units
```

Cost assignment:

```text id="d58">
5 × ৳400
+
3 × ৳500

=
৳3,500
```

---

# 47. Cost Assignment Is Historical

Preserve:

```text id="d59">
Layer

Quantity

Unit Cost At Assignment

Assigned Cost

Source physical event
```

---

# 48. Cost Assignment Does Not Mean Immediate COGS

This distinction is critical.

Physical goods may leave the warehouse before the sale is economically complete.

Example:

```text id="d60">
COD parcel dispatched
```

but Customer has not yet received it.

---

# 49. New Core Distinction

> **Inventory Cost Assignment ≠ COGS Recognition.**

---

# 50. Outbound Cost Assignment

When Fulfillment posts:

```text id="d61">
Inventory quantity leaves warehouse
```

Costing creates:

```text id="d62">
Outbound Cost Assignment
```

linked to the Fulfillment.

---

# 51. Outbound Cost State

Recommended:

```text id="d63">
PENDING_SALE_OUTCOME

COGS_RECOGNIZED

RETURNED_TO_INVENTORY

LOST

OTHER_RESOLVED
```

---

# 52. Why Pending Outbound Cost?

Consider COD:

```text id="d64">
Warehouse → Courier
```

Goods may still economically belong to Maevelle until successful delivery/sale completion.

Therefore:

```text id="d65">
warehouse stock has decreased
```

while:

```text id="d66">
COGS may not yet be recognized.
```

---

# 53. Physical Inventory vs Owned Inventory Value

This reveals an important distinction:

```text id="d67">
Warehouse On Hand
```

is not always identical to:

```text id="d68">
all inventory value still owned by business.
```

Outbound goods pending sale outcome may still carry business-owned cost.

---

# 54. COGS Recognition Trigger

Costing does not independently decide when a sale is economically qualified.

Orders/Delivery commercial policy emits/calls:

```text id="d69">
RecognizeSaleCost
```

when the sale reaches the defined qualifying state.

---

# 55. V1 Recognition Policy

Until the future Delivery domain formalizes more detailed ownership/revenue transitions, use the Order/Fulfillment event representing:

```text id="d70">
successful completed customer fulfillment
```

rather than mere warehouse dispatch.

---

# 56. Future Courier Delivery

When Delivery architecture exists:

```text id="d71">
DELIVERED
```

can become the normal COGS-recognition trigger for home-delivery Orders.

---

# 57. Prepaid Does Not Automatically Mean COGS

Receiving customer money before physical completion does not itself consume COGS.

Payment and COGS remain different.

---

# 58. COGS Recognition

Creates immutable recognition records linked to:

```text id="d72">
Order

Order Line

Fulfillment Line

Outbound Cost Assignment

Cost Layer
```

---

# 59. COGS Amount

```text id="d73">
COGS
=
SUM effective Cost assigned to sold quantity
```

---

# 60. COGS Is Not Selling Price

Example:

```text id="d74">
Customer Net Merchandise:
৳850

Assigned Cost:
৳490
```

Management Gross Margin:

```text id="d75">
৳360
```

before other costs.

---

# 61. COGS Recognition Is Append-Oriented

Do not edit:

```text id="d76">
COGS ৳490
→ ৳520
```

silently after late cost.

Instead create:

```text id="d77">
COGS Adjustment +৳30.
```

---

# 62. Effective COGS

```text id="d78">
Original Recognition
+
Subsequent Cost Adjustments
-
COGS Reversals
```

---

# 63. Late Landed Cost

This is one of the most important workflows.

Example:

Initial provisional Layer:

```text id="d79">
10 units
@ ৳100
```

Later final landed cost establishes:

```text id="d80">
@ ৳110
```

Difference:

```text id="d81">
+৳10/unit.
```

---

# 64. Assume Current Position

Of the 10:

```text id="d82">
6 sold / COGS recognized

2 outbound pending delivery

2 on hand
```

The additional:

```text id="d83">
৳100 total cost
```

must be distributed:

```text id="d84">
Recognized COGS adjustment:
6 × ৳10 = ৳60

Outbound pending adjustment:
2 × ৳10 = ৳20

On-hand valuation adjustment:
2 × ৳10 = ৳20
```

Total:

```text id="d85">
৳100.
```

---

# 65. Never Put Entire Late Cost Onto Remaining Stock

Bad:

```text id="d86">
2 units remaining

late ৳100 cost

remaining units become +৳50 each
```

while six already-sold units receive no adjustment.

That destroys historical margin.

---

# 66. Cost Layer Adjustment

Cost change creates:

```text id="d87">
CostLayerAdjustment
```

with:

```text id="d88">
Layer

Source

Previous effective cost

Adjustment total

New effective cost

Reason

Effective/recorded time
```

---

# 67. Adjustment Source

Examples:

```text id="d89">
Landed Cost finalization

Late customs bill

Supplier credit

Receiving-cost correction

Authorized cost repair
```

---

# 68. Negative Adjustment

Allowed.

Example logistics credit:

```text id="d90">
-৳5,000.
```

But total effective acquisition cost should not normally become negative.

---

# 69. Cost Adjustment Allocation

Adjustment is attributed proportionally to the Layer's original quantity/cost basis.

Previously disposed quantities receive corresponding adjustment records.

---

# 70. Historical COGS Restatement

Analytics needs two views:

### Economic Attribution

Late cost changes update effective historical margin of the originating sale.

### Adjustment Activity

Report:

```text id="d91">
Cost Adjustment recognized today
```

as today's adjustment activity.

This mirrors the time semantics already established for Refund analytics.

---

# 71. Never Rewrite Original Recognition Timestamp

Original:

```text id="d92">
COGS recognized:
July 10
```

Late adjustment:

```text id="d93">
August 20
```

Both dates remain.

---

# 72. Transfers

Internal Transfer does not create COGS.

---

# 73. Transfer Cost

When stock dispatches:

```text id="d94">
Source cost positions
→ Transfer Cost Allocations
```

---

# 74. Transfer Receipt

At destination:

```text id="d95">
same source Cost Layers
```

become destination Cost Positions.

---

# 75. Transfer Does Not Create New Acquisition Layer

Important.

Do not create:

```text id="d96">
new cost layer
```

just because Location changed.

---

# 76. Transfer Cost Example

Warehouse A:

```text id="d97">
Layer X:
5 units @ ৳450
```

Transfer 3 units to Warehouse B.

After dispatch:

```text id="d98">
Warehouse A:
2 × ৳450

In Transit:
3 × ৳450
```

After receipt:

```text id="d99">
Warehouse B:
3 × ৳450
```

Original Layer X remains provenance.

---

# 77. Transfer In-Transit Valuation

Transferred goods remain business Inventory value while moving internally.

---

# 78. Transfer Loss

Dispatched:

```text id="d100">
10
```

Received:

```text id="d101">
9
```

one confirmed lost.

Cost assigned to that missing quantity becomes:

```text id="d102">
Inventory Loss
```

not COGS.

---

# 79. Transfer Damage

Damage does not automatically remove cost.

The received quantity moves into:

```text id="d103">
DAMAGED
```

position at its original acquisition cost.

Potential write-down is separate.

---

# 80. Inventory Condition Change

Example:

```text id="d104">
SELLABLE
→
DAMAGED
```

Physical cost remains attached to same Layer.

---

# 81. Condition Change Is Not COGS

No sale occurred.

---

# 82. Damaged Inventory Value

Acquisition cost remains known.

However expected recoverability may be lower.

That introduces:

```text id="d105">
Inventory Valuation Adjustment
```

as a future/accounting-related concept.

---

# 83. V1 Damage Policy

Do not automatically change acquisition cost merely because condition changes.

Instead report:

```text id="d106">
Damaged quantity at acquisition cost
```

and leave formal write-down policy for future Finance/Accounting architecture.

---

# 84. Disposal

If damaged stock is physically discarded:

```text id="d107">
Cost Layer quantity leaves Inventory
```

but classification is:

```text id="d108">
INVENTORY_LOSS / DISPOSAL
```

not COGS.

---

# 85. Inventory Loss Recognition

Examples:

```text id="d109">
Shrinkage

Theft

Loss

Disposal

Transfer loss
```

Costing records the acquisition cost removed.

Finance/Accounting may later classify it in formal financial statements.

---

# 86. Stocktake Negative Variance

Expected:

```text id="d110">
10
```

Count:

```text id="d111">
8
```

Missing 2 units consume FIFO Cost Layer positions.

Cost classification:

```text id="d112">
STOCKTAKE_LOSS
```

not sale COGS.

---

# 87. Stocktake Positive Variance

Expected:

```text id="d113">
8
```

Count:

```text id="d114">
10
```

Physical Inventory must become:

```text id="d115">
10
```

even if we cannot immediately prove acquisition cost.

---

# 88. Unknown-Cost Positive Variance

Create quantity with:

```text id="d116">
UNVALUED Cost Layer
```

or equivalent Unvalued Cost Position.

Never assign zero automatically.

---

# 89. Cost Resolution

Operator can later:

```text id="d117">
identify original Receipt

identify Purchase

enter controlled acquisition-cost basis

resolve through investigation
```

and finalize the Unvalued Layer.

---

# 90. Can Unvalued Inventory Be Sold?

Recommended operational rule:

> Yes, if business needs require it, but COGS remains unresolved rather than fabricated.

---

# 91. Unvalued Sale

Fulfillment can create:

```text id="d118">
Cost Assignment:
COST_PENDING
```

The Order can complete.

Analytics shows:

```text id="d119">
Margin unavailable/incomplete.
```

---

# 92. Why Not Block Every Sale?

A costing-data problem should not necessarily stop legitimate physical commerce.

Quantity truth and cost truth have different failure modes.

---

# 93. Strict Policy Future

An organization can later choose:

```text id="d120">
BLOCK_FULFILLMENT_IF_COST_UNKNOWN
```

but not V1 default.

---

# 94. Opening Inventory

Opening Inventory should ideally provide:

```text id="d121">
quantity

unit acquisition cost

cost basis/source
```

---

# 95. Missing Opening Cost

Allow:

```text id="d122">
UNVALUED
```

with prominent integrity warning.

---

# 96. Manual Positive Adjustment

Same principle.

Never:

```text id="d123">
+10 stock
@ latest purchase cost
```

automatically without policy.

---

# 97. Manual Cost Assignment

High-privilege operation.

Requires:

```text id="d124">
Costing permission

Reason

Source/basis

Actor

Audit
```

---

# 98. Returns — Core Cost Rule

If a customer physically returns an item, we should restore the **cost originally assigned to that sold quantity** wherever possible.

Do not use:

```text id="d125">
current FIFO cost

current Product cost

latest Purchase cost.
```

---

# 99. Why Original Cost?

Example:

Original sale consumed:

```text id="d126">
Layer A:
৳400
```

Current inventory layers are:

```text id="d127">
৳600.
```

Returning that original unit should restore:

```text id="d128">
৳400
```

plus any later adjustments applicable to Layer A.

---

# 100. Return Before COGS Recognition

Typical failed delivery/RTO before successful sale completion:

```text id="d129">
Outbound Cost:
PENDING_SALE_OUTCOME
```

When item physically returns:

```text id="d130">
Outbound assignment
→ returned Cost Position
```

No COGS reversal because COGS was never recognized.

---

# 101. RTO Stock Condition

Returned item should usually enter:

```text id="d131">
INSPECTION
```

not automatically SELLABLE.

Cost provenance remains original.

---

# 102. Return After COGS Recognition

Customer successfully received Order, then later returns it.

When physical return is accepted:

```text id="d132">
restore cost position

+

create COGS Reversal
```

for returned quantity.

---

# 103. COGS Reversal

Links to:

```text id="d133">
original COGS Recognition

original Cost Assignment

original Cost Layer

return receipt
```

---

# 104. Returned Item Damaged

Restore quantity into:

```text id="d134">
DAMAGED
or
INSPECTION
```

with original effective acquisition cost.

Future valuation adjustment may reduce its carrying value separately.

---

# 105. Refund Without Physical Return

No cost comes back into Inventory.

Therefore:

```text id="d135">
Refund
≠
COGS reversal
```

by default.

This is critical.

---

# 106. Return Without Refund

Physical cost can return to Inventory even before/without Refund.

Returns and Payments remain separate.

---

# 107. Exchange

Costing sees:

```text id="d136">
original item return flow

+

new replacement fulfillment cost flow
```

not one magical netted Cost event.

---

# 108. Partial Return

Restore cost tied to returned quantity using original cost assignments.

---

# 109. Multi-Layer Sale Return

Sale:

```text id="d137">
5 × Layer A @ ৳400

3 × Layer B @ ৳500
```

Customer returns 2 of 8 interchangeable units.

Without serial identity, we cannot know exactly which physical Layer the returned pieces originated from.

---

# 110. Return Cost Allocation Policy

V1 must use deterministic attribution.

Recommended:

> Return against the original Fulfillment's cost assignments in the same deterministic consumption order, limited to quantities not previously returned.

---

# 111. Why?

It ensures:

```text id="d138">
repeatable

reconcilable

non-manipulable
```

cost restoration.

---

# 112. Future Specific Unit Tracking

Serial/Lot tracking can later replace this approximation where exact identity exists.

---

# 113. Cost Layer Adjustment After Return

If original Layer later receives additional landed cost:

```text id="d139">
restored returned quantity
```

also receives its proportional adjustment.

---

# 114. Cost Layer Effective Cost

Do not rely solely on initial:

```text id="d140">
unit_cost_at_creation.
```

Define:

```text id="d141">
Effective Layer Cost
=
Original Acquisition Cost
+
Cost Layer Adjustments
```

---

# 115. Historical Assignment

Cost Assignment preserves original amount used at that time.

Adjustments preserve later changes.

---

# 116. Why Preserve Both?

We can answer:

```text id="d142">
What did the system believe on July 10?
```

and:

```text id="d143">
What is the final effective cost today?
```

---

# 117. Inventory Valuation

Management Inventory Value cannot be:

```text id="d144">
Current Quantity
×
Latest Cost.
```

---

# 118. Correct Layer-Based Valuation

```text id="d145">
SUM(
  remaining Cost Layer quantities
  ×
  effective Layer unit cost
)
```

plus applicable still-owned:

```text id="d146">
Internal transfer in-transit

Outbound pending-sale inventory
```

depending ownership policy.

---

# 119. Condition Breakdown

Inventory Value should support:

```text id="d147">
Sellable Value

Inspection Value

Quarantine Value

Damaged Acquisition Cost

Transfer-In-Transit Value

Outbound-Pending Value
```

---

# 120. Incoming Is Not Inventory Value Yet

Unreceived Purchase/Shipment quantity is:

```text id="d148">
Incoming
```

not owned/received Inventory Value under this operational model.

Procurement commitment analytics remain separate.

---

# 121. Unvalued Quantity

Inventory valuation response must expose:

```text id="d149">
valued_quantity

unvalued_quantity

valuation_status
```

---

# 122. Never Hide Missing Cost

Bad dashboard:

```text id="d150">
Inventory Value = ৳1,000,000
```

when:

```text id="d151">
20% of stock is unvalued.
```

Correct:

```text id="d152">
Known Inventory Value:
৳1,000,000

Unvalued:
216 units
```

---

# 123. Costing Completeness

Possible:

```text id="d153">
COMPLETE

PARTIAL

UNAVAILABLE
```

---

# 124. COGS Completeness

Same concept.

An Order can have:

```text id="d154">
Revenue known

COGS partial
```

if one Cost Assignment is unresolved.

---

# 125. Gross Margin

Canonical management formula:

```text id="d155">
Gross Margin
=
Net Merchandise Revenue
-
Recognized Effective COGS
```

---

# 126. Gross Margin Does Not Use Order Grand Total

Because Grand Total can include:

```text id="d156">
Delivery

Tax

other charges future.
```

---

# 127. Gross Margin Percentage

```text id="d157">
Gross Margin %
=
Gross Margin
/
Net Merchandise Revenue
```

when denominator > 0.

---

# 128. Zero-Revenue Cases

Do not divide by zero.

Return:

```text id="d158">
margin_percent = null
```

where denominator is zero.

---

# 129. Refund Effect on Margin

Analytics should distinguish:

```text id="d159">
Refund without Return

Return with COGS reversal
```

because economics differ.

---

# 130. Example — Refund Without Return

Original:

```text id="d160">
Net Sale:
৳1,000

COGS:
৳600

Margin:
৳400
```

Full goodwill Refund:

```text id="d161">
Revenue economics:
-৳1,000

COGS remains:
৳600
```

because Inventory did not return.

This is economically very different from a returned item.

---

# 131. Example — Full Return

Original:

```text id="d162">
Sale:
৳1,000

COGS:
৳600
```

Physical return accepted:

```text id="d163">
COGS reversal:
৳600
```

Refund:

```text id="d164">
Revenue reversal/refund:
৳1,000
```

Inventory again carries:

```text id="d165">
৳600
```

subject to condition/write-down treatment.

---

# 132. Contribution Margin

Separate future metric.

May subtract:

```text id="d166">
Payment Fees

Courier Costs

Packaging

Direct Advertising Attribution
```

Costing does not own those expenses.

---

# 133. Product Margin

Product Margin must derive from:

```text id="d167">
actual sold Order Lines
+
actual assigned COGS
```

not:

```text id="d168">
Current selling price
-
Latest purchase price.
```

---

# 134. Current Product Margin Estimate

Admin may show an estimate:

```text id="d169">
Current Price
-
Estimated Next FIFO Cost
```

but label clearly:

```text id="d170">
Estimated Margin
```

---

# 135. Next FIFO Cost

Can be useful operationally:

```text id="d171">
What cost would the next unit sold likely consume?
```

It is not historical COGS.

---

# 136. Costing and Pricing

Pricing never reads Costing to decide normal customer price unless a future cost-plus pricing policy explicitly requests it.

---

# 137. Costing and Finance

Costing may emit:

```text id="d172">
CostRecognized

InventoryLossRecognized

CostAdjusted
```

events.

Finance/Accounting can consume them later.

Costing does not create fake cash movement.

---

# 138. Costing and Supplier Payment

Whether Supplier invoice has been paid does not determine Inventory Cost Layer.

Obligation/payment timing is separate.

---

# 139. Costing and Landed Cost

Landed Cost changes Cost Layer economics.

It does not change physical quantity.

---

# 140. Costing and Inventory

Inventory physical movement drives cost-position movement.

Costing must not create physical stock.

---

# 141. Costing and Analytics

Analytics consumes:

```text id="d173">
COGS Recognition

COGS Adjustment

COGS Reversal

Inventory valuation snapshots

Inventory loss
```

rather than recalculating FIFO itself.

---

# 142. Analytics Must Never Re-run FIFO

Important:

> Costing is the authority for cost assignment.

Analytics must not inspect Purchase history and invent its own COGS.

---

# 143. Costing Determinism

Given identical:

```text id="d174">
Cost Layer positions

FIFO policy

Disposition quantity

time/order state
```

the selected Layers and costs must be identical.

---

# 144. Concurrency

Two Fulfillments at same Location can compete for the same Cost Layer quantity.

Cost assignment must be concurrency-safe.

---

# 145. Cost Layer Position Locking

When cost is assigned:

```text id="d175">
lock eligible Cost Layer positions
```

in stable FIFO order.

---

# 146. Physical + Cost Transaction

Where practical, Inventory movement and Cost Assignment should commit in the same database transaction.

Example Fulfillment:

```text id="d176">
BEGIN

post Inventory movement

update Inventory Level

select/lock Cost Layers

create Outbound Cost Assignments

update Cost Positions

write Outbox

COMMIT
```

---

# 147. Never Allow

```text id="d177">
Inventory deducted
but no traceable cost assignment
```

except explicit:

```text id="d178">
UNVALUED / COST_PENDING
```

state.

---

# 148. Duplicate Fulfillment

Idempotent Fulfillment posting must also prevent duplicate Cost Assignment.

---

# 149. Duplicate Receipt

Cannot create duplicate Cost Layer.

Canonical unique relationship:

```text id="d179">
Receipt Line
→ Cost Layer creation identity
```

---

# 150. Costing Failure During Receipt

If cost can be determined provisionally:

```text id="d180">
create PROVISIONAL Layer.
```

If not:

```text id="d181">
create UNVALUED Layer.
```

Do not lose physical Receipt.

---

# 151. Costing Failure During Fulfillment

If eligible physical quantity exists but costing projection is damaged:

```text id="d182">
open critical Costing Integrity Issue.
```

Depending trust level:

```text id="d183">
rebuild positions
```

or assign COST_PENDING.

Do not fabricate cost.

---

# 152. Costing Integrity

Required reconciliations:

```text id="d184">
Cost Layer original quantities

Layer positions

Transfer allocations

Outbound assignments

Loss assignments

Returned quantities

COGS recognitions

Adjustments
```

---

# 153. Core Layer Quantity Equation

Conceptually:

```text id="d185">
Original Layer Quantity
=
Location Positions
+
Internal Transfer In Transit
+
Outbound Pending
+
Permanently Disposed Quantity
```

with returned/resolved flows incorporated exactly once.

---

# 154. Permanently Disposed Quantity

Includes:

```text id="d186">
COGS-recognized sold quantity
-
returned/restored quantity

+

confirmed losses/disposals
```

---

# 155. Layer Cost Equation

```text id="d187">
Effective Layer Acquisition Cost
=
Cost of all currently held positions
+
pending outbound cost
+
recognized/disposed cost
```

after accounting for later adjustments and restorations.

---

# 156. Costing Reconciliation Failure

Creates:

```text id="d188">
Integrity Issue
```

not silent balancing entry.

---

# 157. Repair

Projection-like Cost Positions can be rebuilt from trusted:

```text id="d189">
Receipt

Inventory movement

Cost Assignment

Transfer

Return
```

history where possible.

---

# 158. Authoritative Cost History Repair

If an original Cost Assignment itself is wrong:

```text id="d190">
do not delete and recreate invisibly.
```

Use:

```text id="d191">
Cost Correction / Adjustment
```

with full audit.

---

# 159. Costing Permissions

Potential:

```text id="d192">
costing.view

costing.view_margin

costing.manage

costing.resolve_unvalued

costing.adjust

costing.repair

inventory_valuation.view
```

---

# 160. Margin Permission

Seeing Selling Price does not automatically grant:

```text id="d193">
COGS

Gross Margin

Supplier Cost.
```

---

# 161. Cost Adjustment Permission

High sensitivity.

Requires:

```text id="d194">
reason

source

before/after

audit.
```

---

# 162. Costing Schema

Recommended new PostgreSQL schema:

```text id="d195">
costing
```

---

# 163. `costing.costing_policies`

Conceptually:

```text id="d196">
id
organization_id
costing_method
effective_from
status
created_at
created_by
```

V1:

```text id="d197">
PERPETUAL_FIFO
```

---

# 164. `costing.cost_layers`

Refines the earlier provisional:

```text id="d198">
landed_cost.acquisition_cost_layers
```

decision.

Canonical Cost Layer should belong to:

```text id="d199">
costing
```

because it outlives Landed Cost and participates in Fulfillment/Returns/Valuation.

---

# 165. Cost Layer Columns

Conceptually:

```text id="d200">
id
organization_id
inventory_item_id
inbound_receipt_line_id
shipment_item_id
currency_code

original_quantity

base_purchase_cost_total
landed_cost_total
other_acquisition_cost_total

original_total_cost
original_unit_cost

cost_status
fifo_sequence_at

created_at
```

---

# 166. Cost Layer Adjustment Table

`costing.cost_layer_adjustments`

```text id="d201">
id
organization_id
cost_layer_id
adjustment_type
source_domain
source_id
amount
quantity_basis
unit_cost_delta
reason
occurred_at
created_at
```

---

# 167. Adjustment Types

```text id="d202">
LANDED_COST_FINALIZATION

LANDED_COST_ADJUSTMENT

SUPPLIER_COST_CORRECTION

CREDIT

MANUAL_COST_CORRECTION

OTHER
```

---

# 168. Cost Layer Positions

`costing.cost_layer_positions`

```text id="d203">
id
organization_id
cost_layer_id
location_id
condition_code
quantity
version
updated_at
```

Unique conceptually:

```text id="d204">
Layer
+
Location
+
Condition
```

---

# 169. Transfer Cost Allocations

`costing.transfer_cost_allocations`

```text id="d205">
id
organization_id
transfer_dispatch_line_id
cost_layer_id
quantity
unit_cost_at_assignment
cost_amount_at_assignment
status
created_at
```

---

# 170. Outbound Cost Assignments

`costing.outbound_cost_assignments`

```text id="d206">
id
organization_id
fulfillment_line_id
reservation_allocation_id NULL
cost_layer_id
quantity
unit_cost_at_assignment
cost_amount_at_assignment
cost_status
outcome_status
created_at
```

---

# 171. COGS Recognition

`costing.cogs_recognitions`

```text id="d207">
id
organization_id
order_id
order_line_id
fulfillment_line_id
recognized_at
currency_code
original_amount
status
created_at
```

---

# 172. COGS Recognition Allocations

Recommended:

`costing.cogs_recognition_allocations`

```text id="d208">
id
organization_id
cogs_recognition_id
outbound_cost_assignment_id
cost_layer_id
quantity
amount
created_at
```

---

# 173. COGS Adjustments

`costing.cogs_adjustments`

```text id="d209">
id
organization_id
cogs_recognition_id
cost_layer_adjustment_id
amount
occurred_at
created_at
```

Can be positive or negative.

---

# 174. COGS Reversals

`costing.cogs_reversals`

```text id="d210">
id
organization_id
cogs_recognition_id
return_reference_id
quantity
amount
occurred_at
created_at
```

---

# 175. Inventory Loss Cost Allocations

`costing.inventory_loss_allocations`

```text id="d211">
id
organization_id
inventory_transaction_id
inventory_movement_line_id
cost_layer_id
loss_type
quantity
amount
created_at
```

---

# 176. Costing Integrity Runs

Potential:

```text id="d212">
costing.reconciliation_runs
costing.reconciliation_results
```

or use platform Integrity Issue framework plus Analytics/operations jobs.

---

# 177. Existing Schema Refinement

Earlier:

```text id="d213">
landed_cost.acquisition_cost_layers
```

should no longer be canonical.

Replace with:

```text id="d214">
costing.cost_layers
```

and let Landed Cost reference/update those through published Costing application interfaces.

---

# 178. Why?

A Cost Layer belongs to the entire inventory lifecycle:

```text id="d215">
Receipt

Storage

Transfer

Fulfillment

Return

Loss

COGS
```

not only Landed Cost.

---

# 179. Commands

Recommended Costing commands:

```text id="d216">
CreateReceiptCostLayers

ApplyLandedCostAdjustment

AssignOutboundCost

RecognizeCOGS

ReverseCOGSForReturn

AssignTransferCost

ReceiveTransferredCost

RecognizeInventoryLoss

ResolveUnvaluedCost

RepairCostPosition
```

Most are internal commands called by other application modules.

---

# 180. Queries

```text id="d217">
GetInventoryValuation

GetInventoryValuationByLocation

GetInventoryValuationByProduct

GetCostLayerDetail

GetCostLayerHistory

GetFulfillmentCost

GetOrderCOGS

GetOrderMargin

GetProductMargin

GetEstimatedNextFIFOUnitCost

ListUnvaluedInventory

GetCostingIntegrityStatus
```

---

# 181. Receipt Integration

`PostInboundReceipt`

within its transaction coordinates:

```text id="d218">
Inventory
+
Costing
```

---

# 182. Fulfillment Integration

`PostFulfillment` coordinates:

```text id="d219">
Inventory deduction
+
Cost assignment
```

---

# 183. Successful Sale Integration

Order/Delivery completion triggers:

```text id="d220">
RecognizeCOGS
```

---

# 184. Return Integration

Future Return Receipt triggers:

```text id="d221">
Restore Cost Position
+
COGS Reversal if already recognized
```

---

# 185. Transfer Integration

Transfer Dispatch:

```text id="d222">
AssignTransferCost
```

Transfer Receipt:

```text id="d223">
ReceiveTransferredCost
```

---

# 186. Disposal Integration

Inventory Disposal:

```text id="d224">
RecognizeInventoryLoss
```

---

# 187. Late Cost Integration

Landed Cost finalization/adjustment:

```text id="d225">
ApplyLandedCostAdjustment
```

Costing distributes effect across:

```text id="d226">
On Hand

Transfer In Transit

Outbound Pending

Recognized COGS

Loss history
```

where applicable.

---

# 188. Costing API

Costing is mostly internal.

Admin endpoints may expose:

```text id="d227">
GET /inventory-valuation

GET /cost-layers/{id}

GET /orders/{id}/margin

GET /costing/unvalued-inventory

POST /cost-layers/{id}/resolve

POST /costing/repairs/...
```

Sensitive permissions required.

---

# 189. Public Storefront

Storefront receives **no COGS data**.

---

# 190. Integration API

Cost/Margin information excluded by default.

Service Account needs explicit capability if ever exposed.

---

# 191. COGS and Currency

A Cost Layer retains acquisition/valuation currency context.

V1 organization selling currency may be BDT while Purchase was CNY/USD.

Landed Cost already resolves acquisition cost into the selected costing/worksheet currency.

---

# 192. Canonical Costing Currency

V1 recommendation:

> Cost Layers use Organization's designated inventory costing/reporting currency at time of layer creation, while preserving original Purchase/Landed-Cost source currencies upstream.

For Maevelle initial deployment this will normally be:

```text id="d228">
BDT
```

but the architecture remains configurable.

---

# 193. Currency Change

Changing Organization default currency must not convert historical Cost Layers.

---

# 194. Reporting Currency

Analytics can separately translate amounts using explicit historical FX policy.

Never rewrite Cost Layers for display currency.

---

# 195. Precision

Cost unit values often require more precision than customer prices.

Recommended calculation:

```text id="d229">
NUMERIC(28,12)
```

internally.

Committed/reportable cost amounts use appropriate high-precision decimal storage.

---

# 196. Rounding

Do not round Layer unit cost to two decimals too early.

Example:

```text id="d230">
৳1,000
/
3 units
=
৳333.333333...
```

Preserve sufficient internal precision.

---

# 197. Layer Total Is Reconciliation Anchor

After allocations:

```text id="d231">
sum assigned/remaining effective cost
```

must reconcile to:

```text id="d232">
effective Layer total
```

subject to explicit smallest-unit rounding rules.

---

# 198. Largest Remainder

Where Layer cost must be divided into currency-rounded transaction amounts, use deterministic remainder allocation.

Same principle as Pricing.

---

# 199. Do Not Accumulate Rounding Drift

100 partial Fulfillments from one Layer must not produce total COGS greater/less than Layer effective cost because each operation independently rounded carelessly.

---

# 200. Final-Quantity Rule

The final quantity consumed/restored from a Layer can absorb the deterministic residual required to reconcile total Layer cost.

---

# 201. Costing Health Checks

Required:

```text id="d233">
Physical quantity without Cost Position

Cost Position without physical quantity

Negative Cost Position

Cost assignment exceeding Layer quantity

Unvalued stock

Unvalued completed sale

Cost Layer total mismatch

Late adjustment allocation mismatch

COGS recognition without outbound assignment

COGS reversal exceeding recognized quantity

Transfer cost mismatch

Return restoration mismatch
```

---

# 202. Critical Health State

Examples:

```text id="d234">
same Cost Layer quantity consumed twice

negative remaining Layer quantity

COGS recognized for more units than fulfilled
```

should create:

```text id="d235">
CRITICAL Integrity Issue.
```

---

# 203. Costing Outage

Inventory quantity operations should continue only if Costing can preserve an explicit safe:

```text id="d236">
UNVALUED / COST_PENDING
```

state.

Never silently proceed with invented cost.

---

# 204. Analytics Failure

Does not affect Costing.

Costing remains authority; Analytics rebuilds.

---

# 205. Landed Cost Failure

Cost Layers can remain:

```text id="d237">
PROVISIONAL
```

until Landed Cost becomes final.

---

# 206. Costing Invariants

### COST-INV-001

Physical Inventory quantity and Inventory Cost are separate truths connected by explicit provenance.

### COST-INV-002

Maevelle V1 uses perpetual FIFO as its management Costing method.

### COST-INV-003

Costing method cannot change retroactively through ordinary Settings mutation.

### COST-INV-004

Every normal acquired inventory quantity originates in an identifiable Cost Layer.

### COST-INV-005

Inbound Receipt posting creates Cost Layer provenance exactly once.

### COST-INV-006

A Transfer preserves original Cost Layer identity and FIFO age.

### COST-INV-007

Reservation does not consume Cost Layers.

### COST-INV-008

Cost Layers are assigned when physical disposition occurs, not at Cart or Reservation time.

### COST-INV-009

Cost assignment is concurrency-safe.

### COST-INV-010

Cost assignment never exceeds available quantity in the selected Cost Layer positions.

### COST-INV-011

Inventory Cost Assignment and COGS Recognition are separate operations.

### COST-INV-012

Warehouse dispatch alone does not necessarily imply COGS Recognition.

### COST-INV-013

COGS originates from actual Cost Assignments rather than current/latest Product cost.

### COST-INV-014

COGS Recognition is append-oriented.

### COST-INV-015

Late acquisition-cost changes create Cost/COGS Adjustments rather than rewriting original history.

### COST-INV-016

Late cost adjustments are attributed across on-hand, pending and previously disposed quantities correctly.

### COST-INV-017

Unknown Cost is represented as UNVALUED/COST_PENDING and never silently as zero.

### COST-INV-018

Unvalued Inventory makes valuation completeness explicit.

### COST-INV-019

Internal Transfers do not create COGS.

### COST-INV-020

Condition changes do not create COGS.

### COST-INV-021

Confirmed shrinkage/loss/disposal consumes cost as Inventory Loss rather than COGS.

### COST-INV-022

Refund without physical Return does not automatically reverse COGS.

### COST-INV-023

Physical Return restores original attributable acquisition cost whenever provenance exists.

### COST-INV-024

A Return after recognized sale creates a COGS reversal only for physically restored quantity.

### COST-INV-025

A failed-delivery/RTO return before COGS recognition restores pending outbound cost without creating a false COGS reversal.

### COST-INV-026

Same Variant may simultaneously contain Cost Layers with different unit costs.

### COST-INV-027

Inventory Value cannot be calculated using Variant latest cost.

### COST-INV-028

Analytics never independently re-runs FIFO.

### COST-INV-029

Gross Margin uses Net Merchandise Revenue and recognized effective COGS.

### COST-INV-030

Order Grand Total is not the numerator for merchandise Gross Margin.

### COST-INV-031

Selling Price never becomes Inventory Cost authority.

### COST-INV-032

Supplier Payment timing never determines Cost Layer value.

### COST-INV-033

Costing never creates physical Inventory quantity.

### COST-INV-034

All cost calculations use decimal arithmetic, never binary floating point.

### COST-INV-035

Layer-level quantity and monetary totals remain reconcilable after partial movements and adjustments.

---

# 207. Required V1 Tests

```text id="d238">
Single Receipt FIFO

Multiple Receipt FIFO

Partial Layer Consumption

Consumption Crossing Two Layers

Concurrent Fulfillments

Duplicate Fulfillment

Transfer Cost Preservation

Partial Transfer

Transfer Loss

Condition Change

Damage

Disposal

Stocktake Negative Variance

Stocktake Positive Variance

Unvalued Positive Stock

Opening Inventory

Provisional Landed Cost

Final Landed Cost

Positive Late Cost Adjustment

Negative Late Cost Adjustment

Late Cost After Partial Sale

Late Cost After Full Sale

Late Cost With Outbound Pending

RTO Before COGS

Return After COGS

Partial Return

Multi-Layer Return

Refund Without Return

Return Without Refund

Costing Projection Rebuild

Rounding Across Partial Layer Consumption
```

---

# 208. Stress Test — Concurrent FIFO

Layer:

```text id="d239">
5 units
```

Two Fulfillments simultaneously request:

```text id="d240">
4 units each.
```

Expected:

```text id="d241">
only valid Cost Layer quantity assigned

no negative Layer position

physical Inventory concurrency policy remains authoritative.
```

---

# 209. Stress Test — Late Landed Cost

100 units received provisionally.

Then:

```text id="d242">
30 on hand

10 transfer in transit

20 outbound pending

40 COGS recognized
```

New:

```text id="d243">
+৳100 total Layer cost
```

Expected adjustment:

```text id="d244">
all 100 units' economic positions receive exactly their proportional share.
```

---

# 210. Stress Test — Unvalued Sale

Unvalued positive Stocktake quantity is fulfilled.

Expected:

```text id="d245">
Order succeeds if policy allows

Cost assignment remains pending

COGS incomplete

Margin unavailable

Integrity warning persists

future cost resolution backfills through adjustment mechanism.
```

---

# 211. Stress Test — RTO

Fulfillment cost assigned:

```text id="d246">
৳500
```

Courier fails delivery.

Stock physically returns.

Expected:

```text id="d247">
same cost provenance restored

no Sale COGS if never recognized

returned item enters inspection
```

---

# 212. Stress Test — Refund Only

Order sold:

```text id="d248">
Revenue ৳900
COGS ৳500
```

Customer receives:

```text id="d249">
৳200 goodwill Refund
```

keeps Product.

Expected:

```text id="d250">
COGS remains ৳500

no Inventory restored.
```

---

# 213. Stress Test — Return After Late Cost

Original sale:

```text id="d251">
unit provisional cost ৳450
```

Later final:

```text id="d252">
৳500
```

Customer returns unit afterward.

Restored Layer cost:

```text id="d253">
৳500 effective cost
```

not old provisional:

```text id="d254">
৳450.
```

---

# 214. V1 Mandatory Scope

```text id="d255">
✓ Costing policy

✓ Perpetual FIFO

✓ Cost Layers

✓ Receipt-origin provenance

✓ Provisional Cost

✓ Final Cost

✓ Unvalued Cost

✓ Layer adjustments

✓ Layer positions

✓ FIFO selection

✓ Concurrency-safe Cost Assignment

✓ Transfer Cost preservation

✓ Outbound Cost Assignment

✓ Pending-sale cost state

✓ COGS Recognition

✓ COGS Adjustment

✓ COGS Reversal

✓ Inventory Loss attribution

✓ Return cost restoration foundation

✓ RTO behavior

✓ Stocktake cost behavior

✓ Opening Inventory cost

✓ Unknown-cost handling

✓ Late Landed Cost attribution

✓ Inventory valuation

✓ Valuation completeness

✓ Order COGS

✓ Order Gross Margin

✓ Product Margin

✓ Estimated next FIFO cost

✓ Analytics integration

✓ Integrity reconciliation

✓ Repair commands

✓ Cost-sensitive permissions

✓ Audit
```

---

# 215. Strongly Preferred V1

```text id="d256">
Inventory Value by Location

Inventory Value by Product

Cost Layer explorer

Fulfillment cost breakdown

Order Margin panel

Unvalued Inventory queue

Costing integrity dashboard

Late-cost impact preview

Margin completeness indicator
```

---

# 216. Explicitly Deferred

```text id="d257">
Weighted Average

Specific Identification

Serial costing

Lot costing

LIFO

Manufacturing costing

Standard costing

Bill-of-material costing

Production overhead absorption

Formal NRV engine

Formal impairment accounting

Statutory accounting postings

Tax cost rules

Automated cost-plus selling prices

Multi-ledger accounting

Period-close inventory accounting
```

---

# 217. Decisions Established

### Decision COST-001

**Maevelle V1 uses perpetual FIFO management costing.**

### Decision COST-002

**Cost Layer is the canonical acquisition-cost provenance entity.**

### Decision COST-003

**Cost Layers belong to the new Costing domain rather than the Landed Cost domain.**

### Decision COST-004

**Inbound Receipt posting creates Cost Layers.**

### Decision COST-005

**Transfers preserve Layer identity and FIFO age.**

### Decision COST-006

**Reservations do not reserve/consume Cost Layers.**

### Decision COST-007

**Fulfillment assigns FIFO Cost Layers when physical quantity leaves the Location.**

### Decision COST-008

**Outbound Cost Assignment and COGS Recognition are separate states.**

### Decision COST-009

**Successful commercial fulfillment/revenue-qualified outcome triggers COGS rather than warehouse dispatch alone.**

### Decision COST-010

**Unknown Cost is represented explicitly and never defaulted to zero.**

### Decision COST-011

**Late Landed Cost changes create Layer and COGS adjustments rather than rewriting original records.**

### Decision COST-012

**Internal stock loss is distinguished from COGS.**

### Decision COST-013

**Physical Returns restore original attributable Cost rather than current Cost.**

### Decision COST-014

**Refund alone does not reverse COGS.**

### Decision COST-015

**Analytics consumes Costing outputs and never re-implements FIFO.**

### Decision COST-016

**Inventory valuation is layer-based, not latest-cost × quantity.**

### Decision COST-017

**Management Gross Margin uses Net Merchandise Revenue minus recognized effective COGS.**

---

# 218. Schema Refinements Required

The PostgreSQL specification should be revised:

Remove canonical ownership from:

```text id="d258">
landed_cost.acquisition_cost_layers
```

and introduce:

```text id="d259">
costing.costing_policies

costing.cost_layers

costing.cost_layer_adjustments

costing.cost_layer_positions

costing.transfer_cost_allocations

costing.outbound_cost_assignments

costing.cogs_recognitions

costing.cogs_recognition_allocations

costing.cogs_adjustments

costing.cogs_reversals

costing.inventory_loss_allocations
```

---

# 219. Fulfillment Refinement

`PostFulfillment` becomes atomically responsible for:

```text id="d260">
Inventory quantity movement

Reservation consumption

FIFO Cost Assignment
```

but **not necessarily COGS Recognition**.

---

# 220. Order/Delivery Refinement

We now need an explicit event/command representing:

```text id="d261">
successful sale/fulfillment outcome
```

that triggers:

```text id="d262">
RecognizeCOGS.
```

This must become clearer when the Delivery domain is formalized.

---

# 221. Analytics Refinement

`analytics.sales_facts.acquisition_cost_amount`

should not independently read:

```text id="d263">
Cost Layer current unit cost.
```

It should consume effective:

```text id="d264">
COGS Recognition
+
COGS Adjustments
-
COGS Reversals.
```

---

# 222. Architecture Milestone

Our commercial economics now form:

```text id="d265">
SUPPLIER
   ↓
PURCHASE
   ↓
SHIPMENT
   ↓
LANDED COST
   ↓
INBOUND RECEIPT
   ↓
COST LAYER
   ↓
INVENTORY
   ↓
FULFILLMENT
   ↓
OUTBOUND COST ASSIGNMENT
   ↓
SUCCESSFUL SALE
   ↓
COGS
```

while customer-side economics are:

```text id="d266">
CATALOG PRICE
   ↓
PRICING
   ↓
PROMOTIONS
   ↓
ORDER NET REVENUE
```

Together:

```text id="d267">
Net Merchandise Revenue
-
COGS
=
Management Gross Margin
```

This means we can finally produce trustworthy margin analytics instead of estimating margin from the latest Purchase price.

---

# 223. Important Remaining Domain Gap Found

Costing exposes another domain that we have referenced repeatedly but never fully formalized:

# **Returns & Reverse Logistics**

We currently understand:

```text id="d268">
Refunds

RTO

Physical return

Inspection

Restocking

COGS reversal
```

individually.

But we do not yet have one canonical Return lifecycle covering:

```text id="d269">
Return Request

Return Approval

Return Quantity

Return Reason

Customer-initiated Return

Business-initiated Return

RTO

Return Shipment

Physical Receipt

Inspection

Sellable Restock

Damaged Return

Rejected Return

Exchange

Refund linkage

Cost restoration

Partial Return

Multiple Return attempts

Lost Return parcel
```

Without that domain, different modules could invent different meanings for:

```text id="d270">
"returned".
```

---

# 224. Recommended Next Document

The next source-of-truth document should therefore be:

```text id="d271">
docs/domains/returns/returns-reverse-logistics-architecture.md
```

Its core principle should be:

> **Return Authorization, Reverse Physical Movement, Return Receipt, Inspection, Inventory Restock, Refund and COGS Reversal are separate events.**

A safe lifecycle should look conceptually like:

```text id="d272">
RETURN REQUEST
      ↓
AUTHORIZATION
      ↓
RETURN IN TRANSIT
      ↓
PHYSICAL RECEIPT
      ↓
INSPECTION
   ┌──┼─────────────┐
   ▼  ▼             ▼
SELLABLE          DAMAGED
RESTOCK           STOCK
   │                │
   └──────┬─────────┘
          ▼
     COST RESTORATION

Refund decision/execution
runs as a related but separate flow.
```

It must also distinguish:

```text id="d273">
Customer Return
vs
Courier RTO
```

because an RTO can occur before revenue/COGS recognition, while a normal customer Return usually happens after the sale.

After Returns, we should be much safer to move into:

```text id="d274">
Admin Information Architecture
→ Storefront UX Architecture
→ Testing Master Plan
→ Operations Runbooks
→ Implementation Roadmap
```

---

**End of Inventory Costing & COGS Architecture v0.1**
