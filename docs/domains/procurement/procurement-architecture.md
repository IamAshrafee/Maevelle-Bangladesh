# Maevelle Ecommerce — Procurement & Supplier Purchasing Architecture

**Document:** `docs/domains/procurement/procurement-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `catalog-architecture.md`, `inventory-architecture.md`, `warehouse-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Procurement domain defines how the business acquires products and inventory from external suppliers.

It begins before stock exists in a Maevelle warehouse.

Conceptually:

```text
Supplier
   ↓
Supplier Product / Offer
   ↓
Purchase
   ↓
Supplier Confirmation
   ↓
Supplier Invoice / Commercial Documents
   ↓
Supplier Payment
   ↓
Shipment
   ↓
Receiving
   ↓
Inventory
```

This domain must support realistic sourcing scenarios such as:

- buying different products from one supplier;
- buying the same Product from multiple suppliers;
- purchasing products before they are published on the storefront;
- partial supplier fulfillment;
- one Purchase arriving in several Shipments;
- products from several Purchases being consolidated into one Shipment;
- deposits and installment payments;
- supplier invoices;
- shortages;
- over-supply;
- damaged goods;
- supplier-specific sizes/SKUs/names;
- foreign currencies;
- amendments after an order has already been placed;
- cancelled quantities;
- purchase history;
- future supplier returns and claims.

---

# 2. Core Principle

> **Purchasing, shipping, receiving, inventory and payment are connected processes, but they are not the same process.**

A weak architecture might represent:

```text
Purchase
├── quantity
├── price
├── paid
├── received
└── stock
```

That becomes unusable very quickly.

Instead:

```text
PURCHASE
What did we agree to buy?

SUPPLIER INVOICE
What did the supplier bill us for?

SUPPLIER PAYMENT
What money did we actually pay?

SHIPMENT
How are the goods physically traveling?

RECEIPT
What physically arrived?

INVENTORY
What stock do we actually have?
```

These concepts must remain distinguishable.

Established purchasing systems similarly keep purchase orders, product receipts and vendor invoices distinct and support partial receipt/invoicing. Dynamics 365 describes the cycle from purchase order through product receipt and vendor invoice, and Business Central supports partial receipt and partial invoicing independently.

---

# 3. Three-Way Reality

A powerful Procurement system should eventually compare three commercial realities:

```text
ORDERED
What did we order?

RECEIVED
What actually arrived?

BILLED
What did the supplier charge?
```

This is commonly called three-way matching in procurement/accounting systems. Both Microsoft Dynamics and Odoo document matching supplier invoices against purchase orders and received quantities.

Maevelle V1 does not need to become a full accounting system.

But its Procurement data model should support this reality.

---

# 4. Procurement Domain Responsibilities

Procurement owns:

```text
Suppliers

Supplier Contacts

Supplier Addresses

Supplier Product References

Supplier Variant References

Supplier Commercial Terms

Purchases / Purchase Orders

Purchase Lines

Purchase Revisions

Purchase Status

Ordered Quantities

Cancelled Quantities

Expected Quantities

Supplier Pricing

Supplier Discounts

Supplier Documents

Supplier Invoices

Supplier Payment Records

Supplier Payment Allocations

Purchase Notes

Purchase Attachments

Supplier Claims / Exceptions foundation
```

---

# 5. Procurement Does Not Own

Procurement does not own:

```text
Storefront selling price

Warehouse physical quantity

Inventory reservation

Shipment freight allocation

Final landed cost

General marketing expenses

Customer Orders

Courier delivery
```

It integrates with those domains.

---

# 6. Official Terminology

Preferred terms:

```text
Supplier
Supplier Item
Supplier Variant / Offer
Purchase
Purchase Line
Purchase Revision
Supplier Invoice
Supplier Payment
Purchase Shipment Allocation
Purchase Receipt
```

The UI may use:

```text
Purchase Order
```

where that terminology is more natural to staff.

Internally:

```text
Purchase
```

is the business transaction.

---

# 7. Supplier

A **Supplier** represents an external business or person from whom Maevelle purchases products/services.

Examples:

```text
Guangzhou ABC Fashion Co.
Yiwu Accessories Supplier
Local Packaging Vendor
China Sourcing Agent
```

---

# 8. Supplier Is Not Only a Name

Supplier should be a first-class business entity.

Potential information:

```text
Display Name

Legal / Business Name

Internal Code

Supplier Type

Country

Addresses

Contacts

Communication Information

Currency Preferences

Payment Terms

Lead Time Notes

Internal Notes

Status

Attachments
```

---

# 9. Supplier Status

Recommended:

```text
ACTIVE
INACTIVE
BLOCKED
ARCHIVED
```

---

# 10. Inactive Supplier

Inactive means:

> Do not normally use for new Purchases.

Existing:

```text
Purchases
Payments
Invoices
Shipments
History
```

remain intact.

---

# 11. Blocked Supplier

A Supplier may need stronger restriction.

Example reasons:

```text
Repeated quality issues
Fraud concern
Commercial dispute
Business decision
```

A blocked supplier should require elevated permission/override before new Purchase creation.

---

# 12. Supplier Code

Useful internal references:

```text
SUP-0001
CN-DRESS-01
YIWU-ACC-03
```

Code and display name remain separate.

---

# 13. Multiple Contacts

A Supplier may have:

```text
Sales Contact
Payment Contact
Shipping Contact
Owner
Account Manager
```

Do not force:

```text
supplier.phone
supplier.email
```

to be the only possible contact information forever.

---

# 14. Supplier Address Types

Potential:

```text
Business Address
Factory
Warehouse
Billing Address
Pickup Address
```

This becomes useful when shipment origin differs from invoice address.

---

# 15. Supplier Type

Optional descriptive types:

```text
MANUFACTURER
WHOLESALER
DISTRIBUTOR
AGENT
LOCAL_VENDOR
OTHER
```

These should describe the Supplier, not dictate hard-coded behavior.

---

# 16. Supplier Item

A **Supplier Item** represents a product as understood by the Supplier.

Example:

Maevelle storefront:

```text
Floral Puff Sleeve Midi Dress
```

Supplier:

```text
2026 Women French Floral Dress
Model 8821
```

These are different commercial identities.

---

# 17. Why Supplier Item Is Important

Do not force Maevelle to rename its Product based on supplier terminology.

Example:

```text
MAEVELLE

Product:
Floral Puff Sleeve Midi Dress

Variant:
Red / M

SKU:
MV-FD-R-M
```

Supplier:

```text
Supplier Product:
8821 Floral Dress

Supplier Variant:
Wine Red / CN-L

Supplier SKU:
8821-WR-L
```

Both identities must be preserved.

---

# 18. Supplier Catalog Mapping

Conceptually:

```text
Supplier
   ↓
Supplier Item
   ↓
Supplier Variant / Offer
   ↓
Maps To
   ↓
Maevelle Variant
```

---

# 19. One Product, Multiple Suppliers

Example:

```text
Maevelle Variant
Red / M
```

may be sourced from:

```text
Supplier A
Supplier B
Supplier C
```

Each may have different:

```text
Supplier SKU
Unit Cost
Minimum Order Quantity
Lead Time
Supplier Size Label
Quality
```

Therefore:

```text
Variant
→ one supplier
```

must not be hard-coded.

---

# 20. Supplier Mapping Is Historical Context

A Purchase Line should preserve the Supplier reference used at purchase time.

If a Supplier later changes:

```text
SKU
Product Name
Price
```

old Purchases must remain understandable.

---

# 21. Supplier Size Mapping

From Sizing Architecture:

```text
Maevelle Size:
M

Supplier Size:
CN-L
```

This mapping belongs naturally around Supplier Variant information.

---

# 22. Supplier Color Mapping

Similarly:

```text
Maevelle:
Maroon

Supplier:
Wine Red
```

Supplier vocabulary should not require changing Maevelle's reusable Color vocabulary.

---

# 23. Supplier SKU

Supplier Variant may contain:

```text
Supplier SKU
Supplier Model Number
Supplier Listing ID
Supplier URL/reference
```

These are not Maevelle's operational SKU.

---

# 24. Supplier Product URL

A supplier listing/reference URL may be stored.

Examples could originate from:

```text
1688
Taobao
Alibaba
Supplier website
Private catalog
```

The URL is supporting procurement metadata.

The Supplier Item remains a proper internal record.

---

# 25. Supplier Product Without Catalog Product

This is an important Maevelle scenario.

The business may discover and purchase something **before creating the storefront Product**.

Therefore Procurement should support:

```text
Supplier Item
      ↓
Purchase
```

without requiring:

```text
Published Product
```

to already exist.

---

# 26. Procurement-First Product Workflow

Example:

```text
Find Supplier Product
      ↓
Create Supplier Item
      ↓
Purchase Product
      ↓
Shipment Begins
      ↓
Later Build Maevelle Product
      ↓
Map Supplier Variant
      ↓
Receive Into Inventory
```

This is much more natural for sourcing-heavy businesses.

---

# 27. Catalog Mapping Requirement

Before stock can become normal sellable Inventory, the purchased item should generally be mapped to:

```text
Catalog Variant
      ↓
Inventory Item
```

unless the item is intentionally a non-storefront inventory item.

---

# 28. Unmapped Purchase Line

A Purchase Line may therefore temporarily be:

```text
UNMAPPED
```

with:

```text
Supplier Product
Supplier Variant
Description
Quantity
Cost
```

Dashboard should clearly show:

```text
Catalog Mapping Required
```

before final stock receiving where necessary.

---

# 29. Quick Create From Procurement

Good UX:

```text
Purchase Line
Supplier Dress 8821

[ Create Product From This Item ]
```

can start Catalog product creation with available information prefilled.

After Product/Variant creation:

```text
Link Supplier Item
```

This avoids duplicate data entry.

---

# 30. Purchase

A **Purchase** represents Maevelle's agreement/order to acquire goods from a Supplier.

Example:

```text
Purchase PO-2026-00182

Supplier:
ABC Fashion

Currency:
CNY

Lines:
Red Dress / M × 20
Red Dress / L × 15
Black Dress / M × 20
```

---

# 31. Purchase Header

Conceptually:

```text
Purchase Number

Supplier

Supplier Order Reference

Purchase Currency

Order Date

Expected Date

Destination / Expected Receiving Location

Commercial Terms

Payment Terms

Status

Notes

Attachments
```

---

# 32. Purchase Line

Each Purchase contains one or more lines.

Conceptually:

```text
Purchase Line

Supplier Item / Variant

Optional Maevelle Variant

Description Snapshot

Supplier SKU Snapshot

Supplier Size Snapshot

Supplier Color Snapshot

Ordered Quantity

Cancelled Quantity

Expected Quantity

Unit Cost

Discount

Tax where applicable

Line Total
```

---

# 33. Purchase Line Snapshot

Purchase Lines are transactional records.

They should preserve important purchase-time values.

If Supplier Item later changes:

```text
Name
SKU
Mapping
```

the Purchase should not silently rewrite its history.

---

# 34. Purchase Currency

Every Purchase has an explicit transaction currency.

Examples:

```text
CNY
USD
BDT
```

The system must never assume:

```text
All Purchases = BDT
```

---

# 35. Purchase Currency vs Business Currency

Example:

```text
Business Base Currency:
BDT

Purchase Currency:
CNY
```

These remain distinct.

Reporting may convert the Purchase into BDT.

But original commercial values remain:

```text
¥28 per unit
```

---

# 36. Historical FX Context

Where currency conversion affects financial reporting or landed cost, the system should preserve:

```text
Exchange Rate Used
Rate Source / Manual Entry
Effective Date
```

rather than recalculating old purchases using today's rate.

Detailed foreign-exchange policy will belong to Money/Finance Architecture.

---

# 37. Purchase Price

Purchase Line should represent Supplier commercial cost.

Example:

```text
Quantity:
100

Unit Cost:
¥28
```

This is:

```text
Supplier Purchase Cost
```

not:

```text
Landed Cost
```

and not:

```text
Selling Price
```

---

# 38. Purchase Discount

Supplier may offer:

```text
10% discount
```

or:

```text
¥500 line/order discount
```

The Purchase should preserve the actual negotiated commercial result.

---

# 39. Shared Inbound Freight Is Not Purchase Unit Price

Suppose:

```text
Product Cost:
¥2,800

International Freight:
৳12,000
```

Do not modify Supplier Unit Cost to hide Freight inside it.

Freight belongs in:

```text
Shipment / Landed Cost
```

This separation is essential for cost transparency.

---

# 40. Supplier-Specific Line Charges

If Supplier directly charges:

```text
Customization Fee
Packaging Fee
Production Fee
```

that directly belongs to the Purchase relationship and may later feed landed-cost calculation.

The source must remain explicit.

---

# 41. Purchase Number

Human-readable identifier:

```text
PO-2026-00182
```

or business-configured equivalent.

Internal database identity remains separate.

---

# 42. Supplier Reference

The Supplier may provide its own reference:

```text
Supplier Order:
AB-77882
```

We should preserve both:

```text
Maevelle Purchase Number
Supplier Reference
```

---

# 43. Purchase Lifecycle

Recommended primary lifecycle:

```text
DRAFT
   ↓
CONFIRMED / ORDERED
   ↓
ACTIVE
   ↓
COMPLETED
```

Alternative outcomes:

```text
CANCELLED
CLOSED
```

But one status alone is insufficient.

---

# 44. Separate Purchase State Dimensions

A Purchase may simultaneously be:

```text
Order Status:
CONFIRMED

Shipment Status:
PARTIALLY_SHIPPED

Receipt Status:
PARTIALLY_RECEIVED

Invoice Status:
PARTIALLY_BILLED

Payment Status:
PARTIALLY_PAID
```

Therefore we should **not** attempt to encode all procurement reality into:

```text
purchase.status = PROCESSING
```

---

# 45. Purchase Order Status

Represents commercial order lifecycle.

Potential:

```text
DRAFT
CONFIRMED
CANCELLED
CLOSED
```

---

# 46. Shipment Status

Derived from linked inbound Shipments.

Potential summary:

```text
NOT_SHIPPED
PARTIALLY_SHIPPED
SHIPPED
```

Exact Shipment lifecycle belongs to the next domain.

---

# 47. Receipt Status

Derived from actual receiving.

```text
NOT_RECEIVED
PARTIALLY_RECEIVED
FULLY_RECEIVED
OVER_RECEIVED
```

---

# 48. Billing Status

```text
NOT_BILLED
PARTIALLY_BILLED
FULLY_BILLED
```

---

# 49. Payment Status

```text
UNPAID
PARTIALLY_PAID
PAID
OVERPAID
```

Potential:

```text
REFUNDED
PARTIALLY_REFUNDED
```

later where needed.

---

# 50. Why State Separation Matters

Example:

Maevelle orders:

```text
100 units
```

Supplier has:

```text
Received Deposit:
50%

Produced:
100

Shipped:
60

Received:
60

Final Payment:
Not Yet Paid
```

Trying to represent this with:

```text
Status = Processing
```

provides almost no operational information.

---

# 51. Draft Purchase

Draft allows incomplete preparation.

Merchant can:

```text
Add/remove lines
Change quantities
Change supplier
Change currency
Change prices
```

before confirmation.

---

# 52. Confirm Purchase

Confirmation means:

> Maevelle considers this a real supplier order/commitment.

After confirmation, the Purchase becomes operational history.

Changes require controlled amendment behavior.

---

# 53. Confirmation Validation

Potential checks:

```text
Supplier exists and is usable

At least one Purchase Line

Quantities > 0

Currency set

Unit cost valid

Duplicate line review

Required supplier information available
```

Unmapped Catalog items should not necessarily block Purchase confirmation.

---

# 54. Purchase Revision

Confirmed Purchases can change in real life.

Example:

```text
Original:
100 units @ ¥30

Supplier says:
Only 80 available
```

or:

```text
Add another Color
```

Therefore confirmed Purchase changes need revision/history.

---

# 55. Purchase Revision Strategy

Conceptually:

```text
Purchase PO-00182

Revision 1
Confirmed

Revision 2
Quantity changed 100 → 80
```

We do not need to recreate an entire heavyweight procurement approval suite.

But important commercial changes must remain traceable.

---

# 56. Post-Confirmation Change

The UI should provide:

```text
Amend Purchase
```

rather than silently treating the confirmed Purchase like an ordinary editable draft.

---

# 57. Amendment Impact

Changing ordered quantity must consider:

```text
Already Shipped
Already Received
Already Billed
Already Paid
```

Example:

```text
Ordered:
100

Already Received:
60
```

Admin cannot change total ordered quantity to:

```text
50
```

without an exception/correction workflow.

---

# 58. Minimum Valid Quantity

Conceptually:

```text
Revised Ordered Quantity
>=
Already materially fulfilled quantity
```

unless a return/reversal process changes that history.

---

# 59. Purchase Quantity Dimensions

For each Purchase Line, track meaningful quantities:

```text
Ordered

Cancelled

Open

Allocated to Shipments

Shipped

Received

Rejected / Damaged

Returned to Supplier
```

Not all need separate persisted counters if safely derivable.

But the business concepts must exist.

---

# 60. Open Quantity

Conceptually:

```text
Open Quantity
=
Ordered
-
Cancelled
-
Completed/Fully resolved quantity
```

The exact formula depends on Shipment/Receipt status.

---

# 61. Purchase Cancellation

A Draft Purchase can be deleted/cancelled relatively easily.

A Confirmed Purchase requires controlled cancellation.

---

# 62. Full Cancellation

Valid when commercial commitment is cancelled.

But the system must consider:

```text
Has Supplier Invoice?

Has Payment?

Has Shipment?

Has Receipt?
```

Cancellation cannot erase those realities.

---

# 63. Partial Cancellation

Example:

```text
Ordered:
100

Supplier can provide:
80

Cancelled:
20
```

Purchase remains active/completed for the other 80.

Partial line cancellation is required for real-world purchasing.

---

# 64. Cancellation Reason

Record reasons such as:

```text
Supplier unavailable
Price changed
Quality issue
Business decision
Duplicate purchase
Other
```

---

# 65. Cancellation Does Not Delete History

Confirmed Purchase should generally remain visible as:

```text
CANCELLED
```

or with cancelled lines.

Never make it disappear.

---

# 66. Supplier Fulfillment

A Supplier may fulfill a Purchase in parts.

Example:

```text
Purchase:
100

Shipment 1:
40

Shipment 2:
30

Shipment 3:
30
```

This must be a natural scenario.

---

# 67. Purchase → Shipment Is Not One-to-One

Required relationship:

```text
Purchase
   ↓
Many Shipments
```

And:

```text
Shipment
   ↓
Lines from Many Purchases
```

This is crucial to Maevelle's consolidated China shipping scenario.

---

# 68. Purchase Shipment Allocation

We need an explicit relationship equivalent to:

```text
Purchase Line
      ↓
Shipment Allocation
      ↓
Inbound Shipment
```

with quantity.

---

# 69. Example — One Purchase Split

```text
PO-101

Dress A × 100
```

Shipments:

```text
SH-01 → 40
SH-02 → 60
```

---

# 70. Example — Consolidated Shipment

```text
PO-101 Supplier A
Dress A × 40

PO-102 Supplier B
Hat B × 100

PO-103 Supplier C
Bag C × 20
```

all inside:

```text
Shipment SH-CN-220
```

This relationship must be first-class.

---

# 71. Purchase Is Not Shipment

Purchase answers:

> Who did we buy from and what did we agree to buy?

Shipment answers:

> Which physical goods are traveling together?

These are fundamentally different.

---

# 72. Expected Delivery Date

Purchase may have expected dates.

But once physical shipment exists:

```text
Shipment ETA
```

becomes more authoritative for transportation.

Purchase expected date remains procurement context.

---

# 73. Supplier Invoice

A **Supplier Invoice** represents a commercial bill/invoice received from the Supplier.

This should not be conflated with Supplier Payment.

---

# 74. Why Supplier Invoice Matters

Example:

Purchase:

```text
100 × ¥28
=
¥2,800
```

Supplier invoice:

```text
Product:
¥2,800

Packaging:
¥100

Discount:
-¥50

Invoice Total:
¥2,850
```

We need to preserve what was actually billed.

---

# 75. Supplier Invoice Scope

V1 should support operational Supplier Invoice records without trying to become a complete Accounts Payable general ledger.

Potential fields:

```text
Supplier

Invoice Number

Invoice Date

Due Date

Currency

Lines

Subtotal

Discount

Tax

Total

Attachments

Billing Status

Payment Status
```

---

# 76. Supplier Invoice Attachment

The actual Supplier PDF/image/document should be attachable.

This is especially useful for:

```text
China supplier invoice
Commercial invoice
Proforma invoice
Screenshot/document
```

---

# 77. Proforma vs Final Invoice

Supplier may first provide:

```text
Proforma Invoice
```

and later:

```text
Commercial / Final Invoice
```

V1 may treat document type explicitly.

Example:

```text
PROFORMA
FINAL_INVOICE
OTHER
```

---

# 78. Purchase-to-Invoice Matching

Supplier invoice lines should be linkable to Purchase Lines.

Conceptually:

```text
Supplier Invoice Line
       ↓
Purchase Line
```

This enables comparison:

```text
Ordered:
100 @ ¥28

Billed:
100 @ ¥29
```

and surfaces discrepancy.

---

# 79. Partial Supplier Invoice

A Supplier may invoice only part of the Purchase.

Example:

```text
Purchase:
100

Invoice 1:
50

Invoice 2:
50
```

This should be supported.

Enterprise purchasing systems also support partial invoicing separately from partial receipt.

---

# 80. One Invoice Across Multiple Purchases

A Supplier may issue one invoice covering more than one Purchase.

We should not unnecessarily forbid:

```text
Invoice
├── PO-101 lines
└── PO-104 lines
```

This is a more mature relationship.

---

# 81. Matching Tolerances

Future/advanced configuration may allow acceptable differences:

```text
Price tolerance
Quantity tolerance
Rounding tolerance
```

Enterprise systems use invoice-matching tolerances for exactly this purpose.

V1 can begin with explicit warnings rather than a full accounting hold engine.

---

# 82. V1 Invoice Discrepancy UX

Example:

```text
PO Unit Cost:
¥28

Supplier Invoice:
¥29

Difference:
+¥1/unit
```

Dashboard should highlight the variance.

Authorized staff can:

```text
Accept
Correct Purchase
Correct Invoice
Investigate
```

according to circumstances.

---

# 83. Supplier Payment

A **Supplier Payment** represents money actually paid to a Supplier.

It must remain separate from:

```text
Purchase
Supplier Invoice
```

---

# 84. Payment Scenarios

Must support:

```text
Full Payment

Deposit

Partial Payment

Multiple Installments

Final Settlement

Advance Payment
```

---

# 85. Example

Purchase:

```text
Total:
¥10,000
```

Payments:

```text
Deposit:
¥3,000

Second Payment:
¥4,000

Final:
¥3,000
```

Payment status:

```text
PAID
```

---

# 86. Payment Record

Conceptually:

```text
Supplier

Payment Date

Amount

Currency

Payment Method

Transaction Reference

Recipient / Account Information where appropriate

Notes

Attachment

Status

Created By
```

---

# 87. Payment Method

Potential examples:

```text
Bank Transfer
Cash
Mobile Financial Service
Sourcing Agent
Alipay / WeChat reference
Other
```

The list should be configurable enough for real sourcing operations.

---

# 88. Payment Currency Can Differ

Important sourcing scenario:

Purchase:

```text
CNY
```

Payment may be funded/recorded as:

```text
USD
```

or:

```text
BDT
```

through an agent/exchange arrangement.

Therefore the architecture should not necessarily enforce:

```text
Payment Currency = Purchase Currency
```

---

# 89. Settlement Amount

Where currencies differ, Supplier Payment may need both:

```text
Paid Amount:
৳50,000

Settled Supplier Amount:
¥3,000
```

with exchange information.

This is much more accurate than pretending the two currencies are identical.

---

# 90. Payment Allocation

One Payment may apply to:

```text
One Purchase
```

or potentially:

```text
Multiple Purchases / Invoices
```

Therefore:

```text
Supplier Payment
      ↓
Payment Allocation
      ↓
Purchase / Supplier Invoice
```

is preferable to only:

```text
purchase.payment_id
```

---

# 91. Unallocated Supplier Payment

A business may send:

```text
Supplier Advance:
¥10,000
```

before deciding exactly which future Purchase consumes it.

Therefore future/current architecture should allow:

```text
Unallocated Supplier Credit / Advance
```

or at minimum a Supplier Payment not fully allocated yet.

---

# 92. V1 Practical Payment Model

V1 can support:

```text
Payment
+
Allocations to Purchases / Supplier Invoices
+
Remaining Unallocated Amount
```

without implementing a full accounting ledger.

---

# 93. Purchase Payment Summary

Purchase page should show:

```text
Purchase Total       ¥10,000

Paid                  ¥7,000

Outstanding           ¥3,000
```

subject to billing/commercial rules.

---

# 94. Invoice Payment Summary

Where invoices exist:

```text
Invoice Total         ¥10,200

Paid                   ¥7,000

Outstanding            ¥3,200
```

Invoice may become the stronger payable document once finalized.

---

# 95. Do Not Double Count

If one Payment is allocated to:

```text
Supplier Invoice
```

which itself relates to:

```text
Purchase
```

analytics must not count the same payment twice.

Financial relationships need one clear allocation source.

---

# 96. Payment Status

Potential:

```text
DRAFT
POSTED
VOIDED
```

Commercial summary:

```text
UNPAID
PARTIALLY_PAID
PAID
OVERPAID
```

---

# 97. Payment Correction

Posted Supplier Payment should not simply be edited from:

```text
¥3,000
```

to:

```text
¥30
```

after downstream use.

Use:

```text
Void
Correction
Reversal
```

where appropriate.

This follows the same historical-integrity principle used in Inventory.

---

# 98. Payment Attachment

Useful attachments:

```text
Transfer Receipt
Bank Screenshot
Supplier Confirmation
Agent Receipt
```

---

# 99. Supplier Credit / Refund — Foundation

Supplier may refund money due to:

```text
Short Shipment
Cancelled Product
Damage
Overpayment
```

The architecture should support future:

```text
Supplier Credit
Supplier Refund
```

without treating negative payments as an undocumented hack.

---

# 100. Supplier Return — Foundation / Preferred V1

Goods may need to be returned to Supplier.

Examples:

```text
Wrong Product
Major Damage
Quality Failure
Over-Supply
```

Dynamics 365 similarly treats purchase returns as a procurement/receipt-related workflow rather than deleting the original receipt.

---

# 101. Supplier Return Principle

Supplier return should not rewrite the original receipt.

Conceptually:

```text
Original Purchase Receipt
+100

Supplier Return
-5
```

with a linked return transaction.

---

# 102. Supplier Claim

Even if goods are not physically returned, Maevelle may claim:

```text
Refund
Credit
Replacement
Discount
```

because of shortage/damage.

A lightweight Supplier Claim concept may become valuable.

---

# 103. V1 Claim Handling

Rather than building a huge dispute-management system immediately, V1 can support:

```text
Receiving discrepancy

Notes

Attachments

Resolution status

Supplier credit/refund reference
```

Detailed Claims module can evolve later.

---

# 104. Expected vs Actual Quantity

Purchase:

```text
Ordered:
100
```

Supplier claims shipped:

```text
100
```

Actual received:

```text
97
```

The system must preserve all three facts.

Do not overwrite:

```text
Ordered Quantity
```

with:

```text
Received Quantity
```

---

# 105. Over-Supply

Ordered:

```text
100
```

Received:

```text
103
```

Procurement must support controlled decision:

```text
Accept extra 3
Reject extra 3
Return extra 3
Amend Purchase
```

Inventory records what physically arrives according to receiving action.

---

# 106. Under-Supply

Ordered:

```text
100
```

Received:

```text
97
```

Remaining 3 may become:

```text
Still Expected
Cancelled
Backordered
Refunded
Claimed
```

Procurement determines resolution.

---

# 107. Damaged Arrival

Shipment delivers:

```text
100
```

Inspection:

```text
95 Good
5 Damaged
```

Procurement remains able to say:

```text
100 physically received
```

while Inventory condition records:

```text
95 Sellable
5 Damaged
```

and Supplier Claim may later resolve the financial/commercial issue.

---

# 108. Receiving Boundary

Receiving is where Procurement and Inventory meet.

Procurement says:

```text
Expected Line:
Red/M × 20
```

Receiving says:

```text
Actual:
19 good
1 damaged
```

Inventory then posts the physical quantities to the selected Location.

---

# 109. Purchase Receipt

A **Purchase Receipt** is the business record of goods physically received against Purchase lines.

Established ERP systems similarly use product receipt records tied to purchase orders, and receipt processes may include registration/quality stages before final stock availability.

---

# 110. Purchase Receipt Contains

Conceptually:

```text
Receipt Number

Receiving Location

Date

Supplier

Shipment Reference

Purchase Line

Expected Quantity

Received Quantity

Condition Breakdown

Supplier Packing Slip Reference

Notes

Attachments

Actor
```

---

# 111. Receipt and Shipment

A Purchase Receipt may reference:

```text
Inbound Shipment
```

but physical receiving remains its own operation.

Shipment says:

```text
Goods arrived
```

Receipt says:

```text
We counted and accepted these quantities into our operation.
```

---

# 112. Partial Receipt

Purchase:

```text
100
```

Receipt #1:

```text
40
```

Receipt #2:

```text
30
```

Receipt #3:

```text
30
```

Every receipt creates its own Inventory transaction.

---

# 113. Receipt Idempotency

Posting Receipt:

```text
RCV-1002
+40
```

must not be repeatable accidentally due to:

```text
Network retry
Double click
Background retry
```

The Inventory architecture already requires this.

---

# 114. Receipt Correction

If receipt recorded:

```text
40
```

but physical quantity was:

```text
38
```

do not secretly rewrite history after Inventory has moved.

Use controlled correction.

---

# 115. Purchase Completion

Purchase should not become complete merely because:

```text
Payment = 100%
```

or:

```text
Shipment sent
```

Completion policy should evaluate unresolved commercial quantity.

---

# 116. Operational Purchase Completion

Conceptually, a Purchase can be considered operationally completed when all ordered quantities are resolved as some combination of:

```text
Received
Cancelled
Returned / otherwise resolved
```

and no remaining procurement work is expected.

Payment may still have separate status.

---

# 117. Closed vs Completed

Potential distinction:

```text
COMPLETED
Normal procurement fulfillment resolved

CLOSED
Administratively closed with known exceptions
```

We should use only if business value justifies the extra state.

Could remain one state + exception indicators in V1.

---

# 118. Purchase Reopen

Reopening a completed Purchase should require deliberate permission.

If new goods are being ordered later, normally create:

```text
New Purchase
```

rather than continuously extending historical POs forever.

---

# 119. Duplicate Purchase Protection

The system should warn about obvious duplicate entry scenarios such as:

```text
Same Supplier
Same Supplier Reference
Same Amount
Same Date
```

but should not automatically reject legitimate similar Purchases.

---

# 120. Supplier Minimum Order Quantity

Supplier Variant may optionally store:

```text
MOQ:
20
```

Purchase editor can warn:

```text
Quantity 10 is below Supplier MOQ 20.
```

This may be overrideable.

---

# 121. Supplier Pack Size

Supplier may sell in:

```text
Pack of 10
Carton of 100
```

Procurement should eventually understand purchase units distinct from sellable units.

Example:

```text
Order:
2 cartons

1 carton:
50 pieces

Inventory receiving:
100 pieces
```

This is important for scalable procurement.

---

# 122. Purchase Unit vs Inventory Unit

Conceptually:

```text
Supplier Purchase Unit:
Carton

Conversion:
1 Carton = 50 Pieces

Inventory Unit:
Piece
```

V1 should at least leave architecture room for this.

For Maevelle's normal fashion buying, purchase quantity will usually equal pieces.

---

# 123. Unit Conversion Must Be Explicit

Never infer:

```text
1 carton = 50
```

from product names.

Conversion must belong to supplier offer/purchase unit configuration.

---

# 124. Supplier Lead Time

Supplier relationship may store expected:

```text
Production Lead Time

Preparation Lead Time
```

Example:

```text
7–10 days
```

This supports future planning.

---

# 125. Purchase-Specific Lead Time

Actual Purchase can override supplier default.

Example:

```text
Standard:
7 days

This Purchase:
20 days
```

because custom production is required.

---

# 126. Purchase Expected Dates

Potential dates:

```text
Order Date

Supplier Confirmation Date

Expected Ready Date

Expected Ship Date

Expected Arrival
```

But transportation-specific ETA belongs primarily to Shipment.

Avoid duplicating too many similar dates without clear meanings.

---

# 127. Commercial Terms

Purchase may store structured/notes information such as:

```text
Incoterm — future/optional
Payment Terms
Production Terms
Quality Notes
Packaging Requirements
```

V1 need not become a complete international trade suite.

---

# 128. Incoterms — Foundation

For international sourcing, terms such as:

```text
EXW
FOB
CIF
```

can affect which costs/risks belong to Maevelle.

A future Landed Cost domain can use this information.

V1 may support an optional Incoterm field rather than implementing full rules.

---

# 129. Purchase Notes

Separate:

```text
Internal Notes
```

from:

```text
Supplier-Facing Notes / Instructions
```

The latter may later appear in exported PO documents.

---

# 130. Purchase Attachments

Examples:

```text
Supplier Quotation

Product Screenshot

Proforma Invoice

Chat Screenshot

Design File

Commercial Invoice

Payment Receipt

Packing List
```

All use central Media/Attachment infrastructure.

---

# 131. Supplier Communication History — Future

A complete future Supplier relationship may integrate:

```text
Email
Chat
WhatsApp
Alibaba messages
```

but V1 only needs notes/attachments/references.

---

# 132. Purchase Document Generation

V1 should preferably support generating a formal Purchase Order document.

Containing:

```text
Business Information
Supplier
Purchase Number
Order Date
Items
Supplier SKU
Quantity
Unit Cost
Totals
Terms
Notes
```

---

# 133. Purchase Document Revision

If confirmed Purchase changes:

```text
Revision 2
```

generated document should reflect the revision.

Historical revision should remain accessible.

---

# 134. Purchase Print / PDF

A clean printable/exportable purchase order is operationally useful.

This is separate from customer Order Invoice.

---

# 135. Procurement Search

Search should support:

```text
Purchase Number

Supplier Name

Supplier Reference

Supplier SKU

Maevelle SKU

Product

Invoice Number
```

---

# 136. Purchase Filters

Useful:

```text
Supplier

Order Status

Receipt Status

Payment Status

Invoice Status

Shipment Status

Currency

Date

Expected Date

Has Exception

Unmapped Items
```

---

# 137. Purchase List

Recommended high-priority columns:

```text
Purchase

Supplier

Status

Ordered Value

Receipt Status

Shipment Status

Payment Status

Expected

Updated
```

Do not display twenty statuses simultaneously by default.

Use priority-based UI.

---

# 138. Purchase Detail Page

Recommended:

```text
Overview

Items

Shipments

Receiving

Supplier Invoices

Payments

Costs / Landed Cost

Documents

Timeline

Audit
```

This creates the cross-linked operational workspace the project requires.

---

# 139. Purchase Line Drill-Down

A line should answer:

```text
What did we order?

Supplier's SKU/size/color?

What Maevelle Variant is it mapped to?

How many ordered?

How many shipped?

How many received?

How many damaged?

How many cancelled?

How much billed?

What was unit cost?

Which Shipments contain it?
```

---

# 140. Procurement Dashboard

Potential:

```text
Open Purchases

Purchase Value This Month

Awaiting Supplier

Not Yet Shipped

Partially Shipped

Incoming

Partially Received

Supplier Payments Due

Unmapped Purchase Items

Purchases With Discrepancies
```

---

# 141. Procurement Saved Views

Examples:

```text
China Purchases

Awaiting Shipment

Outstanding Supplier Balance

Partially Received

Supplier Issues

Unmapped Catalog Items
```

---

# 142. Procurement Analytics

V1 useful analysis:

```text
Purchase value over time

Purchases by Supplier

Items purchased

Average purchase unit cost

Outstanding purchase quantities

Supplier payment totals

Purchase currency breakdown

Receiving discrepancies
```

Later:

```text
Supplier lead-time performance

Quality performance

Cost trends

Supplier reliability

Price variance

Supplier scorecard
```

---

# 143. Supplier Detail Page

Recommended:

```text
Supplier Overview

Contacts

Supplier Products

Open Purchases

Purchase History

Invoices

Payments

Outstanding Balance

Shipments

Issues / Notes

Attachments
```

---

# 144. Supplier Statistics

Useful:

```text
Total Purchases

Open Purchases

Purchase Value

Outstanding Balance

Last Purchase

Items Sourced

Receiving Variance
```

Careful metric definitions are required.

---

# 145. Supplier Product Page

Could show:

```text
Supplier Name

Supplier Product Name

Supplier SKU

Reference URL

Current Known Cost

MOQ

Lead Time

Mapped Maevelle Products / Variants

Purchase History
```

---

# 146. Current Supplier Price Is Not Historical Purchase Price

Supplier Item may store:

```text
Current Expected Cost
```

for convenience.

But old Purchase Lines preserve:

```text
Actual Purchase Unit Cost
```

A price update must never rewrite history.

---

# 147. Price History

Because each Purchase Line stores transaction price, supplier cost history can be derived:

```text
Jan     ¥25
Mar     ¥27
Aug     ¥30
```

No separate manual history duplication necessarily required.

---

# 148. Supplier Preferred Source

A Catalog Variant may eventually have:

```text
Preferred Supplier
```

among several possible suppliers.

This is sourcing configuration, not exclusive ownership.

---

# 149. Preferred Supplier Is Not Mandatory Supplier

Example:

```text
Preferred:
Supplier A

Alternative:
Supplier B
```

If Supplier A is unavailable, business can still purchase from Supplier B.

---

# 150. Purchase Permissions

Suggested capabilities:

```text
procurement.view

procurement.suppliers.view
procurement.suppliers.manage

procurement.supplier_items.manage

procurement.purchases.create
procurement.purchases.edit_draft
procurement.purchases.confirm
procurement.purchases.amend
procurement.purchases.cancel

procurement.receipts.view
procurement.receipts.create
procurement.receipts.correct

procurement.invoices.view
procurement.invoices.manage

procurement.payments.view
procurement.payments.create
procurement.payments.void

procurement.costs.view
```

---

# 151. Cost Permission Separation

A warehouse receiving employee may need:

```text
Purchase quantities
Supplier SKU
Expected items
```

without seeing:

```text
Purchase Unit Cost
Supplier Payments
Margin
```

This needs permission-sensitive read models.

---

# 152. Supplier Payment Permission

Supplier payment information should be more restricted than basic Purchase viewing.

---

# 153. Procurement Audit

Important events:

```text
supplier.created
supplier.blocked

purchase.created
purchase.confirmed
purchase.amended
purchase.cancelled

purchase_line.quantity_changed
purchase_line.cost_changed

supplier_invoice.created
supplier_invoice.matched

supplier_payment.posted
supplier_payment.voided

purchase_receipt.posted
purchase_receipt.corrected
```

---

# 154. Timeline

Purchase Timeline should show business-level events:

```text
Aug 01
Purchase Created

Aug 02
Confirmed

Aug 02
Deposit Paid ¥3,000

Aug 07
40 units assigned to Shipment SH-101

Aug 15
Shipment Dispatched

Aug 20
38 units received

Aug 20
2-unit shortage recorded
```

---

# 155. Audit vs Timeline

Audit:

```text
Technical/business mutation history
```

Timeline:

```text
Human-readable operational story
```

They may share underlying events but have different UX purposes.

---

# 156. Procurement API Commands

Conceptual operations:

```text
createSupplier()

createSupplierItem()

mapSupplierItem()

createPurchase()

confirmPurchase()

amendPurchase()

cancelPurchaseLine()

createSupplierInvoice()

matchSupplierInvoice()

recordSupplierPayment()

allocateSupplierPayment()

createPurchaseReceipt()

correctPurchaseReceipt()
```

---

# 157. Do Not Use Generic CRUD for Everything

Critical operations should not simply expose:

```text
PATCH /purchase
```

with arbitrary field mutation.

Confirmed Purchase changes need explicit business commands.

---

# 158. Structured Errors

Examples:

```text
PURCHASE_ALREADY_CONFIRMED

PURCHASE_CANNOT_BE_AMENDED

QUANTITY_BELOW_RECEIVED

SUPPLIER_BLOCKED

CURRENCY_MISMATCH

PAYMENT_ALLOCATION_EXCEEDS_AMOUNT

PURCHASE_LINE_NOT_MAPPED

DUPLICATE_RECEIPT

INVOICE_VARIANCE_REQUIRES_REVIEW
```

---

# 159. Concurrency

Two staff may simultaneously amend:

```text
PO-101
```

Use optimistic concurrency/versioning or equivalent to prevent one change silently overwriting the other.

---

# 160. Idempotency

Critical operations:

```text
Confirm Purchase

Post Supplier Payment

Post Receipt

Void Payment
```

should be retry-safe where applicable.

---

# 161. Payment Idempotency

A retry must not record:

```text
¥3,000
+
¥3,000
```

when only one bank transfer happened.

External transaction reference/idempotency key can help prevent duplicate posting.

---

# 162. Purchase Receipt Idempotency

Already established:

```text
Receipt RCV-1001
```

can affect Inventory only once.

---

# 163. Supplier Invoice Duplicate Detection

Supplier invoice numbers should be checked for likely duplicates within Supplier scope.

Example:

```text
Supplier:
ABC

Invoice:
INV-1002
```

entered twice should generate a strong warning/block depending on policy.

---

# 164. Procurement Domain Events

Potential:

```text
purchase.created

purchase.confirmed

purchase.amended

purchase.cancelled

purchase.line_mapped

supplier_payment.recorded

supplier_invoice.recorded

purchase.received_partial

purchase.received_full
```

---

# 165. Event Consumers

May trigger:

```text
Notifications

Shipment planning

Inventory incoming projection

Analytics

Audit

Webhooks

Landed-cost workflow
```

---

# 166. Incoming Inventory Projection

Once Purchase quantities are actually assigned to active Shipments destined for Maevelle, Inventory may expose:

```text
Incoming
```

But simply creating a Purchase should not necessarily mean:

```text
Inventory Incoming = Ordered Quantity
```

because the supplier may not yet have shipped it.

---

# 167. Expected Procurement vs Incoming Inventory

Distinguish:

```text
ON ORDER
Purchased / expected from supplier
```

from:

```text
INCOMING
Physically committed/in transit toward a Location
```

This is an important operational distinction.

---

# 168. Example

Purchase:

```text
100 units confirmed
```

Supplier has not shipped yet.

Dashboard:

```text
On Order:
100

Incoming:
0
```

Later Shipment:

```text
60 units dispatched
```

Now:

```text
On Order/Open:
40

Incoming:
60
```

This is significantly clearer.

---

# 169. Procurement Incoming Summary

Product/Variant dashboard may eventually show:

```text
Available       8
Reserved        3
Incoming       60
On Order       40
```

These values originate from different domains but can be displayed together.

---

# 170. Purchase Cost vs Landed Cost

Example:

```text
Supplier Cost:
¥28/unit
```

Later:

```text
Freight
Customs
Forwarder
Local transport
```

produce:

```text
Landed Cost:
৳615/unit
```

Procurement owns the Supplier Cost.

Landed Cost domain owns the allocation of additional acquisition costs.

---

# 171. Purchase Cost Changes After Receiving

If Supplier invoice changes actual cost after goods have arrived:

```text
PO:
¥28

Final Invoice:
¥29
```

Costing/Landed Cost may need recalculation/reconciliation.

Do not silently overwrite Inventory quantity or previous commercial documents.

---

# 172. Estimated Supplier Cost

A Purchase may begin with:

```text
Estimated Unit Cost
```

and later have:

```text
Confirmed Unit Cost
```

where sourcing negotiations require it.

V1 can simplify by treating the confirmed Purchase cost as authoritative and recording later amendments explicitly.

---

# 173. Supplier Payment Is Not General Expense

Supplier Payments may eventually create financial cash-outflow records.

But we should not duplicate them blindly as manual:

```text
Expense: Purchase Payment
```

in Expense Management.

Finance/Expense architecture must decide how these are represented in aggregate reporting without double counting.

---

# 174. Procurement Expense Relationship

Expenses such as:

```text
Supplier Product Cost
```

are procurement transaction values.

Costs such as:

```text
Freight
Customs
Forwarder
```

may be shipment/landed-cost expenses.

General business expenses remain Expense domain records.

This distinction is important for profitability.

---

# 175. Procurement and Marketing Never Mix

Do not use Purchase records for:

```text
Facebook Ads
Office Rent
Electricity
```

even though all involve spending money.

Procurement represents acquiring goods/services from Suppliers for sourcing operations.

---

# 176. Purchase Approval — Future

Larger businesses may require:

```text
Draft
→
Submitted
→
Approved
→
Confirmed
```

with spending authority.

V1 does not need complex approval chains.

Permission to confirm Purchase is sufficient initially.

---

# 177. Spending Limit — Future

Future access rules may restrict:

```text
User can confirm up to ৳100,000
```

This becomes policy-based authorization.

Not required in V1.

---

# 178. RFQ — Future

A mature procurement system may support:

```text
Request for Quotation

Supplier A quote
Supplier B quote
Supplier C quote

Compare
Choose Supplier
Create Purchase
```

Not necessary in V1.

Supplier quotation attachment/reference is sufficient.

---

# 179. Purchase Planning — Future

Future:

```text
Low stock
     ↓
Suggested reorder
     ↓
Preferred Supplier
     ↓
Draft Purchase
```

Inventory forecasting/replenishment can integrate later.

---

# 180. Supplier Scorecards — Future

Structured data eventually enables:

```text
Average lead time

Late shipment rate

Receiving shortage rate

Damage rate

Price trend

Claim rate
```

This can help sourcing decisions.

---

# 181. Procurement Automation — Future

Potential:

```text
Automatic reorder suggestions

Supplier portal

EDI/API Purchase Orders

Automated supplier invoices

Invoice OCR

Automatic payment reconciliation
```

Odoo, for example, currently supports digitizing vendor bills and matching recognized documents to purchase orders, illustrating one possible future automation path.

Not V1.

---

# 182. Supplier Portal — Future

Suppliers could eventually:

```text
View Purchase Orders

Confirm quantities

Update ready dates

Submit invoice

Upload packing list

Update shipment information
```

Far outside initial V1.

---

# 183. Important Procurement Invariants

### PROC-INV-001

Every Purchase belongs to one Organization.

### PROC-INV-002

Every Purchase has exactly one Supplier.

### PROC-INV-003

Purchase Currency is explicit.

### PROC-INV-004

Confirmed Purchase history is not silently rewritten.

### PROC-INV-005

Post-confirmation commercial changes are traceable.

### PROC-INV-006

Received quantity does not overwrite ordered quantity.

### PROC-INV-007

Paid amount does not determine received quantity.

### PROC-INV-008

Supplier Invoice and Supplier Payment are different concepts.

### PROC-INV-009

Purchase and Shipment are not one-to-one.

### PROC-INV-010

One Purchase may participate in multiple Shipments.

### PROC-INV-011

One Shipment may contain lines from multiple Purchases.

### PROC-INV-012

Supplier Item identity and Maevelle Catalog identity remain distinct.

### PROC-INV-013

One Maevelle Variant may have multiple Supplier sources.

### PROC-INV-014

Supplier size/color/SKU terminology does not overwrite Maevelle catalog vocabulary.

### PROC-INV-015

Procurement may begin before storefront Product publication.

### PROC-INV-016

Unmapped procurement lines must be resolved before normal Catalog Inventory receiving where required.

### PROC-INV-017

Supplier Purchase Cost is not Landed Cost.

### PROC-INV-018

Supplier Purchase Cost is not Storefront Selling Price.

### PROC-INV-019

A Purchase Receipt can affect Inventory only once.

### PROC-INV-020

Payment posting must be retry-safe.

### PROC-INV-021

Historical FX context must not be replaced by current exchange rates where transaction conversion is required.

### PROC-INV-022

Purchase cancellation cannot destroy already received/shipped/paid history.

### PROC-INV-023

Purchase completion requires unresolved quantities to be accounted for.

### PROC-INV-024

Supplier payment allocations cannot exceed the valid payment amount without an explicit credit/overpayment state.

### PROC-INV-025

Transaction snapshots survive future Supplier Catalog changes.

---

# 184. V1 Mandatory Scope

Maevelle V1 Procurement should include:

```text
✓ Suppliers

✓ Multiple Supplier contacts

✓ Supplier addresses

✓ Supplier status

✓ Supplier Items

✓ Supplier Variant references

✓ Supplier SKU

✓ Supplier Size mapping

✓ Supplier Color mapping

✓ Supplier ↔ Maevelle Variant mapping

✓ Multiple Suppliers per Maevelle Variant

✓ Procurement-first / unmapped sourcing

✓ Quick Catalog creation/linking

✓ Purchases / Purchase Orders

✓ Purchase Lines

✓ Purchase Currency

✓ Supplier unit costs

✓ Supplier discounts

✓ Supplier references

✓ Purchase notes

✓ Purchase attachments

✓ Draft / Confirm lifecycle

✓ Controlled amendments

✓ Purchase revisions/history

✓ Partial line cancellation

✓ Separate receipt status

✓ Separate shipment status

✓ Separate invoice status

✓ Separate payment status

✓ Partial supplier fulfillment

✓ Purchase → multiple Shipments

✓ Shipment → multiple Purchases readiness

✓ Supplier invoices

✓ Invoice attachments

✓ Invoice-to-purchase matching

✓ Partial billing

✓ Supplier payments

✓ Deposits

✓ Installments

✓ Payment allocations

✓ Outstanding balances

✓ Multi-currency payment foundation

✓ Purchase receiving

✓ Partial receiving

✓ Over/under receiving

✓ Damaged receiving integration

✓ Inventory integration

✓ Purchase timeline

✓ Search/filtering

✓ Permissions

✓ Audit

✓ Idempotency

✓ Concurrency protection
```

---

# 185. Strongly Preferred V1 Capabilities

```text
Supplier MOQ warnings

Supplier lead-time information

Formal PO PDF/print

Supplier invoice discrepancy warnings

Supplier advances / unallocated payments

Supplier return foundation

Receiving discrepancy resolution

Purchase price history

Preferred Supplier

Product sourcing history

Purchase dashboard

Procurement health/exceptions view
```

---

# 186. Foundation Now / Later

Architecture should prepare for:

```text
Purchase units / cartons

Supplier credits

Supplier refunds

Supplier claims

Incoterms

Purchase approval workflows

Spending limits

RFQs

Supplier scorecards

Replenishment suggestions

Supplier APIs / portals
```

---

# 187. Deferred Advanced Procurement

Post-V1:

```text
RFQ comparison

Automated supplier selection

Purchase approval chains

Budget enforcement

Supplier portal

Supplier EDI/API

Automated PO sending

Invoice OCR

Automatic invoice matching

Automated bank reconciliation

Complex accounts payable

Supplier performance scoring

Demand-driven purchase planning

Automatic replenishment

Procurement forecasting
```

---

# 188. Procurement Relationship Map

```text
                         SUPPLIER
                            │
                 ┌──────────┴──────────┐
                 │                     │
          SUPPLIER ITEMS          SUPPLIER PAYMENTS
                 │                     │
                 │                     ▼
                 │                PAYMENT ALLOCATION
                 │                     │
                 ▼                     │
               PURCHASE ◄──────────────┘
                 │
                 ├── Purchase Lines
                 │       │
                 │       ├── Supplier Variant
                 │       │
                 │       └── Optional Maevelle Variant
                 │
                 ├── Supplier Invoices
                 │
                 ├── Payments
                 │
                 └── Shipment Allocations
                         │
                         ▼
                 INBOUND SHIPMENT
                         │
                         ▼
                      RECEIPT
                         │
                         ▼
                     INVENTORY
```

---

# 189. Catalog Relationship

```text
SUPPLIER ITEM
      │
      │ mapping
      ▼
CATALOG VARIANT
      │
      ▼
INVENTORY ITEM
```

Procurement can begin before mapping.

But normal sellable inventory eventually needs a valid internal identity.

---

# 190. Shipment Relationship

```text
PO-101 ──────┐
             │
PO-102 ──────┼──► SHIPMENT SH-01
             │
PO-103 ──────┘
```

and:

```text
PO-101
  │
  ├──► SH-01
  └──► SH-02
```

This relationship is now a non-negotiable architectural requirement.

---

# 191. Payment Relationship

```text
Supplier Payment
       │
       ├──► Invoice A
       │
       └──► Invoice B
```

or:

```text
Supplier Advance
       │
       └── Unallocated balance
```

This is stronger than attaching one payment field to a Purchase.

---

# 192. Purchase Page Mental Model

A business user should open a Purchase and immediately understand:

```text
WHAT WE ORDERED

WHAT THE SUPPLIER SHIPPED

WHAT WE RECEIVED

WHAT THE SUPPLIER BILLED

WHAT WE PAID

WHAT IS STILL OUTSTANDING

WHICH SHIPMENTS CONTAIN THE GOODS

WHAT THE CURRENT COST INFORMATION IS

WHICH PROBLEMS REMAIN
```

If these require checking several spreadsheets or messaging employees, the Procurement module is incomplete.

---

# 193. Decisions Established

### Decision P-001

**Supplier is a first-class business entity.**

### Decision P-002

**Supplier Item and Maevelle Product/Variant identities are separate.**

### Decision P-003

**One Maevelle Variant can have multiple Supplier sources.**

### Decision P-004

**Supplier size/color/SKU terminology is preserved independently.**

### Decision P-005

**Procurement may begin before Catalog Product publication or even complete Catalog mapping.**

### Decision P-006

**Normal Inventory receiving requires an appropriate internal inventory identity.**

### Decision P-007

**Purchase, Shipment, Receipt, Supplier Invoice and Supplier Payment are separate lifecycles.**

### Decision P-008

**Purchases support partial supplier fulfillment.**

### Decision P-009

**One Purchase can span multiple Shipments.**

### Decision P-010

**One Shipment can consolidate multiple Purchases and Suppliers.**

### Decision P-011

**Confirmed Purchases use controlled amendment/revision rather than unrestricted mutation.**

### Decision P-012

**Ordered, shipped, received, billed and paid quantities/values remain distinct.**

### Decision P-013

**Purchase status is multi-dimensional rather than one giant state.**

### Decision P-014

**Supplier unit cost is purchase-time transactional data.**

### Decision P-015

**Supplier cost does not include arbitrary shared freight/landed costs.**

### Decision P-016

**Supplier Invoice is first-class operational procurement data.**

### Decision P-017

**Supplier Payment is separate from Supplier Invoice.**

### Decision P-018

**Supplier Payments can be partial/installment/deposit payments.**

### Decision P-019

**Payment allocation is more flexible than one Payment per Purchase.**

### Decision P-020

**Payment currency may differ from Purchase currency where properly represented.**

### Decision P-021

**Supplier Invoice discrepancies should be visible rather than silently modifying Purchase data.**

### Decision P-022

**Receiving uses actual physical quantity.**

### Decision P-023

**Purchase Receipts are idempotent and historically traceable.**

### Decision P-024

**Cancellation cannot erase already materialized business history.**

### Decision P-025

**Supplier returns/corrections use additional transactions rather than rewriting prior receipts.**

---

# 194. Resulting Procurement Flow

We now have:

```text
DISCOVER SUPPLIER
        ↓
SUPPLIER ITEM
        ↓
CREATE PURCHASE
        ↓
CONFIRM PURCHASE
        ↓
DEPOSIT / SUPPLIER PAYMENT
        ↓
SUPPLIER PREPARES GOODS
        ↓
ALLOCATE GOODS TO SHIPMENT
        ↓
INBOUND SHIPMENT
        ↓
ARRIVAL
        ↓
RECEIVING
        ↓
INSPECTION
        ↓
INVENTORY
```

Commercially:

```text
PURCHASE
   │
   ├──── Supplier Invoice
   │          │
   │          ▼
   └──── Supplier Payment
```

Financially:

```text
SUPPLIER PURCHASE COST
        +
INBOUND / SHIPMENT COSTS
        +
OTHER DIRECT ACQUISITION COSTS
        ↓
LANDED COST
```

That final part is deliberately **not** calculated by Procurement.

---

# 195. Next Domain

The next document should be:

```text
docs/domains/shipment/inbound-shipment-architecture.md
```

This is where your original China-consolidation scenario becomes the center of the design.

It needs to define:

```text
Inbound Shipment

Shipment Legs

Origin

Destination

Supplier Pickup / Consolidation

Multiple Suppliers in One Shipment

Multiple Purchases in One Shipment

One Purchase Across Multiple Shipments

Shipment Items

Expected vs Actual Quantities

Forwarder / Freight Provider

Tracking

Shipment Status

Consolidation

Packages / Cartons

Weight

Volume

Chargeable Weight

Dates

Customs

Documents

Partial Arrival

Shipment Split

Shipment Merge / Consolidation

Loss / Damage

Arrival

Receiving Handoff

Shared Expenses

Estimated Expenses

Actual Expenses

Multi-currency Shipment Charges

Shipment Expense Relationship

Shipment Timeline

Shipment Exceptions

Audit

Webhooks / future logistics integration
```

Then immediately after it:

```text
docs/domains/landed-cost/landed-cost-architecture.md
```

That is where we build the powerful allocation engine for scenarios such as:

```text
Freight        → by weight

Customs        → by purchase value

Local Delivery → equal

Forwarder Fee  → by quantity

Special Charge → manual
```

across products from multiple suppliers and Purchases inside one consolidated Shipment.

---

**End of Procurement & Supplier Purchasing Architecture v0.1**
