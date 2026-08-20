# Maevelle Ecommerce — Order Lifecycle Architecture

**Document:** `docs/domains/orders/order-lifecycle-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `catalog-architecture.md`, `inventory-architecture.md`, `warehouse-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Order domain represents the commercial transaction between Maevelle and a customer.

It must support:

```text
Storefront Orders
Manual Orders
Guest Customers
Future Account Customers
COD
Manual bKash
Manual Nagad
Future Online Payments
Inventory Reservation
Warehouse Allocation
Partial Fulfillment
Cancellation
Order Hold
Delivery Failure
Returns
Refunds
Invoices
Manual Corrections
```

without reducing everything to:

```text
order.status = "processing"
```

---

# 2. Core Principle

> **An Order does not have one lifecycle. It participates in several coordinated lifecycles.**

At minimum:

```text
ORDER STATE

PAYMENT STATE

FULFILLMENT STATE
```

Future Delivery/Courier integration may add:

```text
DELIVERY STATE
```

and Returns may have:

```text
RETURN STATE
```

These dimensions must remain separate.

---

# 3. Why One Status Fails

Suppose an Order is:

```text
Confirmed
Not Paid
Partially Fulfilled
Courier Failed Delivery
Inventory still reserved for one item
```

What would one field contain?

```text
status = ?
```

There is no correct single answer.

Therefore:

```text
Order State       = CONFIRMED
Payment State     = UNPAID
Fulfillment State = PARTIALLY_FULFILLED
Delivery State    = DELIVERY_FAILED
```

is much more meaningful.

---

# 4. Domain Responsibilities

Order domain owns:

```text
Order Identity

Order Source

Order Lines

Commercial Snapshots

Order Totals

Order-Level Discounts

Customer Reference

Address Snapshots

Order State

Order Holds

Cancellation

Order Editing Rules

Order Timeline

Internal Notes

Customer Notes

Manual Order Creation

Order Revision / Adjustment Foundation
```

It coordinates with:

```text
Inventory
Warehouse
Payment
Fulfillment
Customer
Promotions
Invoices
Returns
Notifications
Audit
Analytics
```

---

# 5. Order Does Not Own

Order does not directly own:

```text
Physical Inventory Quantities

Warehouse Stock Ledger

Payment Provider Transactions

Courier Provider Internals

Product Master Data

Customer Master Address

Landed Cost Calculation
```

It stores references and historical snapshots where needed.

---

# 6. Order Sources

Orders should identify their source.

Initial values:

```text
STOREFRONT

MANUAL
```

Future:

```text
POS

API

MARKETPLACE

IMPORT

SOCIAL_COMMERCE
```

---

# 7. Why Source Matters

An Order created manually may require:

```text
Staff Actor
Manual Price Override
Internal Note
```

A Storefront Order may instead record:

```text
Checkout Session
Customer Device Metadata
Promotion Evaluation
```

Source also helps analytics.

---

# 8. Order Identity

Every Order should have:

```text
Stable Internal ID

Human-Readable Order Number
```

Example:

```text
MV-2026-001582
```

Order number is operational identity.

Internal database identity remains separate.

---

# 9. Order Number Immutability

Once issued:

```text
Order Number
```

should normally not change.

Even if customer name, address, fulfillment or products are later adjusted.

---

# 10. Customer Relationship

Every Order references a Customer record where possible.

Guest checkout still creates or resolves a customer identity.

Therefore:

```text
Guest Checkout
≠
No Customer Record
```

---

# 11. Customer vs Customer Account

As previously established:

```text
Customer
```

represents commercial identity/history.

```text
Customer Account
```

represents authentication/login.

V1 requires Customer.

Customer Account remains future.

---

# 12. Customer Matching

Guest checkout may attempt matching using normalized identity information such as:

```text
Phone Number
Email
```

according to Customer-domain rules.

Duplicate detection must avoid unsafe automatic merging.

---

# 13. Order Customer Snapshot

Order should preserve relevant transaction-time customer information.

Example:

```text
Customer Name Snapshot

Phone Snapshot

Email Snapshot

Billing / Delivery Address Snapshot
```

If Customer profile changes later, historical Order remains understandable.

---

# 14. Address Snapshot

Never rely only on:

```text
customer.current_address_id
```

for historical Orders.

Customer may later move.

Order keeps:

```text
Address used for this transaction.
```

---

# 15. Order Line

An Order contains one or more Order Lines.

Conceptually:

```text
Order Line

Product Reference
Variant Reference

Product Title Snapshot
Variant Snapshot
SKU Snapshot

Quantity

Unit Price

Discount Allocation

Tax if applicable

Line Total
```

---

# 16. Product Snapshot

Catalog can change later.

Example:

At purchase time:

```text
Product:
Floral Dress

Variant:
Red / M

SKU:
FD-R-M

Price:
৳1,200
```

Six months later the Product may be renamed or archived.

Order history must still show what was purchased.

---

# 17. Variant Snapshot

Snapshot may include:

```text
Selected Color
Selected Size
Other selected options
```

not only the Variant ID.

---

# 18. Pricing Snapshot

An Order must preserve the price actually agreed during transaction.

Do not calculate an old Order by asking:

```text
What is this Variant's current price?
```

---

# 19. Promotion Snapshot

If coupon:

```text
EID10
```

gave:

```text
৳120 discount
```

the Order should preserve:

```text
Coupon / Promotion Reference
Discount Result
Relevant Snapshot
```

Future changes to coupon rules must not alter historical totals.

---

# 20. Order Currency

Each Order explicitly stores transaction currency.

Initially:

```text
BDT
```

will likely dominate.

Architecture remains multi-currency ready.

---

# 21. Money Precision

Order money calculations must use decimal/fixed-precision arithmetic.

Never authoritative binary float arithmetic.

---

# 22. Order Totals

Order should explicitly represent totals such as:

```text
Item Subtotal

Discount Total

Delivery Charge

Tax where applicable

Other Charge where supported

Grand Total
```

Potential:

```text
Refunded Total
Outstanding Total
```

is derived from Payment/Refund state.

---

# 23. Totals Must Reconcile

Invariant:

```text
Grand Total
=
Subtotal
-
Discounts
+
Applicable Charges
+
Applicable Taxes
```

according to configured rules.

---

# 24. Order State

Order State describes the commercial lifecycle of the Order itself.

Recommended V1 states:

```text
DRAFT

PENDING

CONFIRMED

ON_HOLD

COMPLETED

CANCELLED
```

Potential exceptional:

```text
REJECTED
```

---

# 25. Draft

Used primarily for:

```text
Manual Order creation

Incomplete admin work

Future draft quotations/orders
```

Draft is not yet a committed commercial Order.

---

# 26. Pending

Order exists, but business confirmation may still be required.

For Maevelle's operational flow:

```text
Storefront Order
→ PENDING
```

may be the normal initial state.

---

# 27. Confirmed

Confirmed means:

> Maevelle has accepted the Order for processing.

This is distinct from:

```text
Paid
Fulfilled
Delivered
```

---

# 28. On Hold

Order is intentionally paused.

Possible reasons:

```text
Customer Verification Needed

Address Problem

Stock Investigation

Payment Verification

Fraud Concern

Customer Requested Delay

Operational Problem

Other
```

---

# 29. On Hold Must Carry Reason

Do not allow:

```text
ON_HOLD
```

without meaningful context.

Store:

```text
Hold Reason

Notes

Actor

Date
```

---

# 30. Hold Does Not Automatically Release Stock

Whether Reservations remain active during Hold depends on business reason.

Example:

```text
Payment Verification Hold
→ keep reservation
```

while:

```text
Long Customer Delay
→ may release reservation
```

Order workflow should make this decision explicitly.

---

# 31. Completed

Completed means:

> The Order has reached its normal final commercial outcome and no ordinary operational action remains.

Normally this implies relevant fulfillment/delivery completion.

Payment may still have exceptional accounting nuances, especially COD.

Exact completion guard rules must be explicit.

---

# 32. Cancelled

Cancelled means:

> The Order will not continue as originally committed.

Cancellation can happen:

```text
Before confirmation

After confirmation

Before fulfillment

After partial fulfillment
```

The consequences differ.

---

# 33. Rejected

Optional but useful distinction:

```text
REJECTED
```

means Maevelle explicitly refused the Order.

Examples:

```text
Fraudulent Order

Unserviceable Address

Customer Verification Failed
```

This differs semantically from customer/business cancellation after acceptance.

V1 can include it if useful.

---

# 34. Payment State

Payment state belongs to Payment domain but is summarized on Order.

Recommended:

```text
UNPAID

PARTIALLY_PAID

PAID

PARTIALLY_REFUNDED

REFUNDED

OVERPAID
```

Potential:

```text
PAYMENT_PENDING

PAYMENT_FAILED
```

depending on provider workflow.

---

# 35. COD Example

Order:

```text
Order State:
CONFIRMED

Payment:
UNPAID

Fulfillment:
UNFULFILLED
```

This is perfectly valid.

COD should not require fake:

```text
Payment = PAID
```

before delivery.

---

# 36. Manual bKash Example

Customer submits payment reference.

Possible:

```text
Payment:
PAYMENT_PENDING
```

until staff verifies.

Then:

```text
PAID
```

or:

```text
PAYMENT_FAILED / REJECTED
```

depending on Payment architecture.

---

# 37. Fulfillment State

Fulfillment describes physical outbound processing.

Recommended:

```text
UNFULFILLED

PARTIALLY_FULFILLED

FULFILLED
```

Operational intermediate states may include:

```text
PROCESSING

READY_TO_SHIP
```

but those may belong to Fulfillment records rather than the top-level summary.

---

# 38. Fulfillment Is Quantity-Based

Order:

```text
Dress ×2
Hat ×1
```

Fulfilled:

```text
Dress ×1
```

Order is:

```text
PARTIALLY_FULFILLED
```

not simply:

```text
SHIPPED
```

---

# 39. Fulfillment Record

Order may produce one or more Fulfillment records.

Conceptually:

```text
Fulfillment

Location

Order Lines / Quantities

Status

Tracking

Carrier Information

Created Date

Fulfilled Date
```

---

# 40. Why Multiple Fulfillments?

Required for:

```text
Partial fulfillment

Multiple Warehouses

Multiple Shipments

Replacement shipment

Split delivery
```

Therefore avoid:

```text
order.tracking_number
```

as the only fulfillment structure.

---

# 41. Warehouse Allocation

Before fulfillment, Order quantities may be allocated/reserved against eligible Locations.

From Warehouse Architecture:

```text
Order Requirement
      ↓
Location Allocation
      ↓
Inventory Reservation
```

---

# 42. Allocation Is Not Fulfillment

Reservation:

```text
These units are held.
```

Fulfillment:

```text
These units physically left warehouse control for customer delivery.
```

Separate events.

---

# 43. Recommended Reservation Timing

For Maevelle V1:

```text
Pending storefront Order
```

should not necessarily reserve forever without business confirmation.

A reasonable default architecture is:

```text
Order Created
      ↓
Availability validated
      ↓
Order accepted / confirmation policy
      ↓
Inventory reservation
```

However exact business policy should remain configurable enough to support:

```text
reserve at placement
```

when needed.

---

# 44. Strong Default

Because Maevelle operates limited physical inventory, the recommended V1 policy is:

> Attempt to secure inventory at or very near Order acceptance so two confirmed Orders cannot promise the same stock.

---

# 45. Storefront Race Condition

Available:

```text
1
```

Customer A and Customer B checkout simultaneously.

Only one authoritative reservation can succeed.

The other receives:

```text
Insufficient inventory
```

or appropriate checkout resolution.

---

# 46. Order Creation Transaction

Storefront Order placement should coordinate:

```text
Validate Product/Variant

Validate Price

Validate Promotion

Validate Customer Inputs

Calculate Totals

Create Order

Attempt required Reservation

Create Payment intent/record where applicable
```

using strong transactional/application orchestration.

---

# 47. Failure Policy

If Order requires reservation and reservation fails:

```text
Do not leave a normal Confirmed Order
pretending inventory is secured.
```

Possible outcome:

```text
Order creation fails cleanly
```

or:

```text
Order enters explicit stock exception state
```

The simpler V1 path is generally atomic failure before confirmation.

---

# 48. Cart Is Not Order

Cart information remains mutable and non-authoritative.

At checkout:

```text
Price
Inventory
Coupon
Availability
```

must be revalidated.

---

# 49. Checkout Snapshot

Checkout cannot trust browser-submitted:

```text
Price = 100
```

The server calculates from authoritative domain data.

---

# 50. Manual Order

Authorized staff must be able to create Orders manually.

Flow:

```text
Find/Create Customer
      ↓
Add Product Variants
      ↓
Set Quantity
      ↓
Set Delivery Address
      ↓
Apply permitted discount / price adjustment
      ↓
Choose Payment Method
      ↓
Review
      ↓
Create
```

---

# 51. Manual Order and Storefront Order Converge

After creation:

```text
Manual Order
```

should use the same core:

```text
Inventory
Payment
Fulfillment
Cancellation
Return
Audit
```

logic as Storefront Orders.

Do not build two separate order engines.

---

# 52. Manual Price Override

Some staff may need:

```text
Normal price:
৳1,200

Manual sale:
৳1,100
```

This requires explicit permission.

Example:

```text
orders.price_override
```

---

# 53. Manual Discount Reason

Manual price/discount override should capture:

```text
Reason
Actor
Original Price
Final Price
```

for auditability.

---

# 54. Order Editing

Orders cannot remain universally editable forever.

Editing rules depend on lifecycle.

---

# 55. Draft Editing

Draft:

```text
freely editable
```

within validation.

---

# 56. Pending Editing

Pending may allow changes such as:

```text
Customer details

Address

Items

Quantity
```

but stock and totals must be recalculated.

---

# 57. Confirmed Editing

Confirmed Order edits become controlled business operations.

Changing:

```text
Quantity 1 → 2
```

requires:

```text
Additional inventory availability

Reservation update

Price recalculation

Audit
```

---

# 58. Fulfilled Order Editing

Once an Order Line quantity has physically fulfilled:

```text
do not simply delete or rewrite it.
```

Use:

```text
Return
Refund
Replacement
Correction workflow
```

---

# 59. Order Amendment

A useful conceptual operation:

```text
Amend Order
```

should safely coordinate modifications after confirmation.

Potential:

```text
Add Line

Remove Unfulfilled Line

Change Unfulfilled Quantity

Change Address before dispatch

Adjust permitted pricing
```

---

# 60. Order Amendment History

Important changes should preserve:

```text
Before

After

Reason

Actor

Timestamp
```

---

# 61. Adding an Item

Confirmed Order:

```text
Add Product B ×1
```

requires:

```text
Validate Product

Calculate Current/Allowed Price

Recalculate Promotions if policy requires

Reserve Inventory

Update Totals

Audit
```

---

# 62. Removing an Item

If quantity has not fulfilled:

```text
Release Reservation
Update Totals
Update Payment balance
```

Potential refund may be needed if already paid.

---

# 63. Quantity Decrease

Order:

```text
3
→
2
```

Release one reserved quantity if not fulfilled.

---

# 64. Quantity Increase

Order:

```text
2
→
3
```

must secure one additional unit.

Never merely change the number.

---

# 65. Address Change

Before fulfillment:

```text
Address change
```

can generally be allowed.

After courier booking/dispatch:

```text
delivery workflow
```

must determine whether re-routing is possible.

---

# 66. Customer Change

Changing Order Customer after confirmation should be highly restricted.

It affects:

```text
History
Contact information
Analytics
Potential fraud trail
```

Normally address/contact correction is preferable to changing commercial customer identity.

---

# 67. Cancellation Scope

Cancellation can apply to:

```text
Whole Order
```

or:

```text
Specific Unfulfilled Lines / Quantities
```

Partial cancellation is required.

---

# 68. Full Cancellation Before Fulfillment

Typical flow:

```text
Order
   ↓
Cancel
   ↓
Release Reservations
   ↓
Cancel pending fulfillment
   ↓
Handle Payment / Refund if needed
   ↓
Record Reason
   ↓
Timeline
```

---

# 69. Partial Cancellation

Order:

```text
Dress ×2
Hat ×1
```

Customer cancels:

```text
Hat ×1
```

Dress remains active.

Therefore whole Order need not become:

```text
CANCELLED
```

A summary can remain:

```text
CONFIRMED
```

with cancellation reflected at line/quantity level.

---

# 70. Cancelled Quantity

Order Line should conceptually track:

```text
Ordered Quantity

Cancelled Quantity

Fulfilled Quantity

Returned Quantity
```

Derived remaining quantity:

```text
Open Quantity
```

---

# 71. Cancellation After Partial Fulfillment

Order:

```text
2 Dresses

1 already fulfilled

1 not fulfilled
```

Customer cancels remaining.

Result:

```text
Fulfilled quantity remains historical.

Remaining reservation released.
```

Order may become commercially completed/partially cancelled rather than globally "cancelled."

---

# 72. Cancellation Reason

Structured reasons:

```text
Customer Changed Mind

Duplicate Order

Customer Unreachable

Invalid Address

Out of Stock

Fraud / Suspicious

Payment Problem

Business Decision

Other
```

---

# 73. Cancellation Actor

Store:

```text
Customer initiated

Staff initiated

System initiated
```

where possible.

---

# 74. Rejection

Rejected Order may use reasons such as:

```text
Fraudulent

Unserviceable

Verification Failed

Policy Violation
```

Reservations are released.

---

# 75. Hold

A Hold should be its own record/history rather than only:

```text
status = ON_HOLD
```

Potential:

```text
Hold Started

Reason

Actor

Reservation Policy

Released At

Released By
```

---

# 76. Multiple Holds

Order could experience:

```text
Address Hold
→ released

Payment Hold
→ released
```

Historical holds remain visible.

---

# 77. Fulfillment Preparation

Once Order is confirmed and inventory allocated:

```text
Processing
→ Ready to Ship
```

can occur inside Fulfillment.

---

# 78. Fulfillment Quantity Validation

Cannot fulfill:

```text
More than remaining fulfillable quantity.
```

Example:

```text
Ordered 2
Cancelled 1
Already fulfilled 1
```

Remaining:

```text
0
```

Another fulfillment must be rejected.

---

# 79. Fulfillment Inventory Consumption

At the appropriate outbound event:

```text
Reservation
→ consumed

Physical sellable inventory
→ decreases
```

Inventory Architecture already defines this.

---

# 80. Courier Booking Boundary

V1:

```text
Manual courier/tracking entry
```

is sufficient.

Future:

```text
Pathao
Steadfast
Other provider integrations
```

belong to Delivery domain.

Order/Fulfillment must remain provider-independent.

---

# 81. Shipment/Tracking Record

A Fulfillment may store:

```text
Carrier Name

Tracking Number

Tracking URL / external reference

Dispatch Date

Notes
```

without embedding Pathao-specific business logic into Order.

---

# 82. Delivery State — Foundation

Future Delivery domain might expose:

```text
NOT_DISPATCHED

BOOKED

PICKED_UP

IN_TRANSIT

OUT_FOR_DELIVERY

DELIVERED

DELIVERY_FAILED

RETURN_TO_ORIGIN

RETURNED
```

Order should consume a summary rather than own provider-specific delivery transitions.

---

# 83. Delivered Does Not Necessarily Mean Paid

COD provider may report:

```text
Delivered
```

while settlement money reaches Maevelle later.

Therefore:

```text
Delivery = DELIVERED

Payment = UNPAID / SETTLEMENT_PENDING
```

can temporarily be valid.

---

# 84. Delivery Failure

A delivery may fail due to:

```text
Customer Unavailable

Customer Refused

Address Issue

Courier Failure

Other
```

This does not automatically mean:

```text
Order Cancelled
```

Goods may be:

```text
Reattempted

Returned to origin

Held

Customer contacted
```

---

# 85. Returned to Origin

If courier returns goods:

```text
Inventory should not become available
the moment RTO is initiated.
```

Only after physical return receipt/inspection.

Same principle as customer returns.

---

# 86. Payment Domain Relationship

One Order may have:

```text
Multiple Payment Records
```

Examples:

```text
Deposit

Remaining payment

Manual correction

Refund
```

Avoid:

```text
order.payment_id
```

as the only payment model.

---

# 87. Payment Attempt vs Payment

Future online provider flow may create multiple failed attempts.

Commercial Payment record and provider attempts should be distinguishable.

Detailed design comes in Payment Architecture.

---

# 88. Payment Collection > Order Total

Potential overpayment:

```text
Order total:
৳1,000

Received:
৳1,100
```

Payment domain should show:

```text
OVERPAID
```

rather than silently changing Order total.

---

# 89. Payment Shortfall

Order:

```text
৳1,000

Received:
৳700
```

Payment:

```text
PARTIALLY_PAID
```

Order can remain Confirmed depending on policy.

---

# 90. Refund

Refund represents money returned.

It does not itself mean Product physically returned.

These are separate processes.

---

# 91. Refund Without Return

Valid examples:

```text
Goodwill refund

Delivery charge refund

Partial price adjustment
```

Therefore:

```text
Refund ≠ Return
```

---

# 92. Return Without Immediate Refund

Customer returns item.

Inspection may happen before refund approval.

Therefore:

```text
Return ≠ Refund
```

---

# 93. Return Foundation

Order Architecture needs return readiness.

Detailed Return Architecture can come later.

Conceptually:

```text
Return Request
      ↓
Approved / Rejected
      ↓
Goods Received
      ↓
Inspection
      ↓
Restock / Damaged
      ↓
Refund / Exchange Resolution
```

---

# 94. Return Quantity

Cannot return more than:

```text
Eligible Fulfilled Quantity
-
Already Returned Quantity
```

---

# 95. Partial Return

Order:

```text
Dress ×2
Hat ×1
```

Return:

```text
Dress ×1
```

Other fulfilled goods remain completed.

---

# 96. Return Snapshot

Return should identify:

```text
Order Line

Variant

Quantity

Reason

Condition

Resolution
```

---

# 97. Return Reasons

Examples:

```text
Too Small

Too Large

Wrong Product

Damaged

Defective

Not as Expected

Customer Changed Mind

Other
```

Sizing analytics can later consume relevant reasons.

---

# 98. Return Inspection

Physical return is received into:

```text
Inspection / Quarantine
```

before:

```text
SELLABLE
```

or:

```text
DAMAGED
```

Inventory already supports this.

---

# 99. Exchange Foundation

Exchange is conceptually:

```text
Return old quantity
+
Create/fulfill replacement quantity
```

Potentially under a dedicated Exchange workflow later.

Do not mutate original Variant history.

---

# 100. Replacement

If wrong/damaged item is replaced:

```text
Original Fulfillment remains historical

Replacement Fulfillment created
```

This preserves truth.

---

# 101. Order Invoice

Order should support generating customer invoice/receipt documents.

Invoice must use Order snapshots.

---

# 102. Invoice Number

Order Number and Invoice Number may initially match business policy or be separate.

Architecture should not require them to be identical.

Future accounting/tax rules may require independent invoice sequencing.

---

# 103. Invoice Revision

If Order changes after invoice issuance, we must avoid silently rewriting historical issued document.

V1 can:

```text
Regenerate only while invoice not final
```

or:

```text
Issue revised document
```

according to business requirements.

Detailed Invoice Architecture can follow later.

---

# 104. Order Timeline

Order Timeline should tell a clear operational story.

Example:

```text
10:02 Order placed

10:05 Order confirmed

10:05 Inventory reserved

10:10 Manual bKash payment submitted

10:15 Payment verified

11:00 Allocated to Main Warehouse

13:00 Ready to ship

15:00 Tracking added

Next day Delivered
```

---

# 105. Timeline vs Audit

Timeline:

```text
Human-readable business events
```

Audit:

```text
Detailed mutation/security record
```

Both are needed.

---

# 106. Internal Notes

Staff can add:

```text
Customer requested delivery after 5 PM.
```

Internal notes never appear publicly unless explicitly designed.

---

# 107. Customer Notes

Checkout may include:

```text
Please call before delivery.
```

This is customer-provided information.

Store separately from internal notes.

---

# 108. Tags / Flags on Orders

Operational labels may be useful:

```text
VIP
Potential Fraud
Urgent
Call Before Ship
Wholesale
```

V1 can support lightweight internal tags if needed.

Do not use tags as a replacement for real states.

---

# 109. Order Search

Search should support:

```text
Order Number

Customer Name

Phone

Email

SKU

Product

Tracking Number

Payment Reference
```

---

# 110. Filters

Useful:

```text
Order State

Payment State

Fulfillment State

Source

Warehouse

Date

Customer

Has Hold

Cancellation

Return status

Delivery status later
```

---

# 111. Saved Views

Examples:

```text
New Orders

Needs Confirmation

Payment Verification

Ready to Fulfill

On Hold

Partially Fulfilled

Delivery Issues

Returns Pending

COD Unpaid
```

---

# 112. Order List UX

Do not show twenty columns by default.

High-priority:

```text
Order

Customer

Total

Order State

Payment

Fulfillment

Created

Important Alert
```

Contextual badges can show:

```text
HOLD
RETURN
DELIVERY ISSUE
```

---

# 113. Order Detail UX

Recommended:

```text
Overview

Items

Customer / Address

Payment

Fulfillment

Delivery

Returns / Refunds

Timeline

Notes

Audit
```

Progressive disclosure keeps it powerful but usable.

---

# 114. Action Bar

Contextual actions:

```text
Confirm

Hold

Cancel

Edit

Record Payment

Create Fulfillment

Add Tracking

Create Return

Refund
```

Only show valid actions for current state and permission.

---

# 115. Invalid Actions Should Be Server-Rejected

Hiding UI buttons is not enough.

Example:

```text
Fulfill Cancelled Order
```

must fail server-side.

---

# 116. Order State Machine

Conceptual:

```text
             DRAFT
               │
               ▼
            PENDING
               │
        ┌──────┼─────────┐
        │      │         │
        ▼      ▼         ▼
   CONFIRMED  REJECTED CANCELLED
        │
        ├────► ON_HOLD
        │         │
        │         └────► CONFIRMED
        │
        ▼
    COMPLETED
```

Cancellation can occur from several non-final states according to rules.

---

# 117. Order State Does Not Mirror Fulfillment

Order may be:

```text
CONFIRMED
```

while Fulfillment:

```text
PARTIALLY_FULFILLED
```

This is expected.

---

# 118. Completion Guard

Order should not become Completed merely because staff presses a button if unresolved quantities remain.

Potential conditions:

```text
No remaining fulfillable quantity

No unresolved critical return/cancellation work

Commercial lifecycle considered resolved
```

Payment requirement depends on configured business policy.

---

# 119. Closed Administrative State?

Do we need:

```text
CLOSED
```

separate from Completed?

Probably not in V1 unless actual operational scenarios justify it.

Avoid unnecessary states.

---

# 120. Order Editing Versioning

Confirmed Orders should use concurrency/version checks.

Two staff:

```text
A changes address

B removes an item
```

must not silently overwrite each other.

---

# 121. Idempotency — Storefront Checkout

Customer presses:

```text
Place Order
```

twice due to network delay.

Should create:

```text
1 Order
```

not:

```text
2 Orders
```

Checkout needs idempotency.

---

# 122. Idempotency — Manual Order

Admin double-clicks Create.

Same protection.

---

# 123. Idempotency — Confirm

Retrying:

```text
Confirm Order
```

must not create duplicate Inventory Reservations.

---

# 124. Idempotency — Fulfillment

Retrying fulfillment must not:

```text
consume inventory twice.
```

---

# 125. Idempotency — Refund

Retry must not send/record refund twice.

Payment architecture must enforce this.

---

# 126. Cross-Domain Transaction Safety

Operations such as:

```text
Confirm Order
+
Reserve Inventory
```

need carefully coordinated transaction boundaries.

Likewise:

```text
Cancel Order
+
Release Inventory
```

---

# 127. Failure Scenario — Order Created, Reservation Failed

Preferred:

```text
Do not leave normal Confirmed Order.
```

Rollback or explicit exception.

---

# 128. Failure Scenario — Reservation Succeeds, Order Save Fails

Must not leave orphan Reservation indefinitely.

Use atomic transaction or compensation.

---

# 129. Failure Scenario — Payment Received, Order Update Fails

Payment truth cannot disappear.

Need reconciliation mechanism.

Payment transaction should remain independently identifiable and linkable later.

---

# 130. Failure Scenario — Fulfillment Created, Inventory Consumption Fails

Fulfillment must not pretend stock left successfully.

Operation should fail/rollback or enter explicit reconciliation issue.

---

# 131. Failure Scenario — Courier Booking Succeeds, Local Request Times Out

Future courier integration requires idempotency/external reference lookup.

Do not create duplicate courier bookings.

---

# 132. Failure Scenario — Cancellation After Courier Pickup

Cannot simply release Inventory Reservation because stock already physically left.

Delivery/return workflow must handle it.

---

# 133. Failure Scenario — Payment Refund Succeeds, Database Timeout

Payment reconciliation must detect external refund later.

Future provider webhooks/reconciliation solve this.

---

# 134. Order Health / Exception Detection

Useful checks:

```text
Confirmed Order with no Reservation

Fulfillment greater than ordered quantity

Paid amount > valid total unexpectedly

Cancelled Order with active reservation

Fulfilled quantity with no Inventory movement

Stale On-Hold Orders

Payment pending too long

Unresolved delivery failure
```

---

# 135. Order Exception Indicator

Order detail can show:

```text
⚠ Inventory Reservation Missing
```

rather than silently hiding inconsistent state.

---

# 136. Order Reconciliation Tools

Authorized operators should eventually have safe repair actions.

Examples:

```text
Retry Reservation

Reconcile Payment

Reassign Warehouse

Resolve Fulfillment Exception
```

Never require direct database edits for normal recoverable failures.

---

# 137. Manual Corrections

Some corrections are unavoidable.

They should use explicit commands with:

```text
Reason

Actor

Before/After

Audit
```

---

# 138. No Hard Delete

Committed Orders should never be casually deleted.

Use:

```text
Cancelled
Rejected
```

Historical business records remain.

Drafts may potentially be deleted.

---

# 139. Product Archive

Archiving Product/Variant must not affect historical Order readability.

Snapshots preserve it.

---

# 140. Customer Delete/Anonymization Future

Privacy rules may later require anonymization.

Order commercial history may need retention while personal fields are appropriately anonymized.

Design should permit this without deleting commercial transaction facts.

---

# 141. Order Permissions

Suggested:

```text
orders.view

orders.create_manual

orders.edit_pending

orders.amend_confirmed

orders.confirm

orders.hold

orders.release_hold

orders.cancel

orders.reject

orders.price_override

orders.discount_override

orders.notes.manage

orders.fulfillment.view

orders.fulfillment.create

orders.fulfillment.modify

orders.returns.view

orders.returns.manage

orders.refunds.view

orders.refunds.manage
```

---

# 142. Sensitive Permission Separation

Someone may manage Orders without being allowed to:

```text
Refund Money

Override Price

View Landed Cost

Change Payments
```

These permissions remain distinct.

---

# 143. Warehouse-Scope Permissions Future

User may eventually be able to fulfill only:

```text
Main Warehouse
```

not:

```text
Showroom
```

Scope-aware permissions should remain compatible.

---

# 144. Order Audit Events

Important:

```text
order.created

order.confirmed

order.hold_started

order.hold_released

order.amended

order.cancelled

order.rejected

order.completed

order.line_added

order.line_removed

order.quantity_changed

order.price_overridden

order.address_changed
```

---

# 145. Cross-Domain Events

Potential:

```text
order.confirmed
→ inventory reservation

order.cancelled
→ reservation release

fulfillment.created
→ inventory consumption

return.received
→ inventory inspection receipt

payment.updated
→ order payment summary
```

---

# 146. Internal Events First

V1 does not require distributed event infrastructure.

Modular-monolith application events are sufficient.

Critical state changes should still use reliable transaction patterns.

---

# 147. Notifications

V1 useful notifications:

```text
New Order

Order Needs Confirmation

Payment Verification Needed

Inventory Problem

Order On Hold

Cancellation

Ready to Fulfill

Return Received

Refund Required
```

---

# 148. Customer Notifications

Future/current basic communication can include:

```text
Order Placed

Order Confirmed

Shipped

Delivered

Cancelled
```

External channel implementation may evolve later.

---

# 149. Analytics

Useful V1 metrics:

```text
Orders Created

Confirmed Orders

Delivered / Completed Orders

Cancelled Orders

Rejected Orders

Average Order Value

Sales Value

Payment Method

Order Source

Fulfillment Time

Cancellation Rate
```

---

# 150. Revenue Recognition Warning

Do not automatically label:

```text
All Orders Created
```

as:

```text
Revenue
```

Analytics must define whether it measures:

```text
Gross Order Value

Confirmed Sales

Delivered Sales

Paid Sales
```

Metrics must be explicit.

---

# 151. Cancelled Order Value

Cancelled amounts should not silently remain inside net sales.

But gross demand analytics may still want them.

Again:

```text
metric definition matters.
```

---

# 152. Manual vs Storefront Analytics

Order Source allows comparison:

```text
Storefront Orders

Manual/Facebook Orders
```

which may be valuable for Maevelle's business.

---

# 153. Fraud / Risk Foundation

V1 does not need sophisticated fraud scoring.

But Order may support:

```text
Risk Flag

Internal Reason

Manual Review
```

without hard-coding future provider logic.

---

# 154. Duplicate Order Detection

Storefront may create accidental duplicates.

Potential signals:

```text
Same Customer

Same items

Same total

Short time window

Same payment reference
```

System can warn.

Do not automatically merge Orders.

---

# 155. Customer Confirmation

Maevelle may manually call a customer before confirmation.

Order workflow should support:

```text
PENDING
→ CONFIRMED
```

without requiring Inventory/Fulfillment assumptions to be hard-coded into UI.

---

# 156. Confirmation Notes

Could store:

```text
Confirmed by phone

Customer unreachable

Call back requested
```

through notes/timeline.

---

# 157. Backorder Foundation

V1 default should avoid overselling.

Future may allow:

```text
BACKORDER
```

for products intentionally sold before stock availability.

This should be implemented as inventory/order policy later, not by allowing negative stock accidentally.

---

# 158. Preorder Foundation

Future:

```text
Preorder Product

Expected Date
```

can create Orders tied to incoming inventory.

Not V1.

Architecture should avoid assuming every Order must use current on-hand stock forever.

---

# 159. Gift Orders — Future

Potential:

```text
Gift Message

Gift Packaging

Recipient
```

can later extend Order lines/fulfillment without redesign.

---

# 160. Bundles — Future

Order Line may represent a Bundle Product.

Inventory consumption could happen on component items.

Catalog/Inventory bundle architecture will define that later.

---

# 161. Order Line Customization — Future

Future personalized products may store:

```text
Engraving Text

Custom Measurement

Name
```

as order-line customization snapshot.

This is distinct from Variant selection.

---

# 162. Tax Architecture Boundary

Bangladesh/VAT or future international taxes may require separate Tax architecture.

Order needs:

```text
Tax Amount Snapshots
```

but should not hard-code one country's tax logic.

---

# 163. Delivery Charge Boundary

Order stores final charged delivery amount.

Future Delivery/Pricing modules determine how it was calculated.

---

# 164. COD Fee Foundation

If future courier/payment policies add:

```text
COD Fee
```

it should be a structured charge component, not hidden inside Product prices.

---

# 165. Order Adjustment Concept

Post-order financial changes may require:

```text
Adjustment

Reason

Amount

Line/Order Scope
```

Rather than rewriting original subtotal.

Potential examples:

```text
Goodwill discount

Delivery charge correction

Price correction
```

Detailed financial adjustment design can come with Payment/Invoice.

---

# 166. Order Original vs Current Totals

For amended Orders, we may need:

```text
Original Transaction Snapshot

Current Valid Order Total
```

with adjustment history.

Do not lose the fact that the Order changed.

---

# 167. Versioning

Order should have:

```text
Version
```

for optimistic concurrency.

Important for dashboard edits and API integrations.

---

# 168. API Commands

Conceptual:

```text
createStorefrontOrder()

createManualOrder()

confirmOrder()

holdOrder()

releaseOrderHold()

amendOrder()

cancelOrderQuantity()

cancelOrder()

rejectOrder()

completeOrder()
```

Cross-domain:

```text
recordPayment()

createFulfillment()

createReturn()

issueRefund()
```

may reside in their respective domains.

---

# 169. Avoid Generic PATCH

A confirmed Order should not allow:

```text
PATCH {
  "status": "completed",
  "quantity": 999
}
```

Business commands must enforce invariants.

---

# 170. Query APIs

Potential:

```text
getOrder()

listOrders()

searchOrders()

getOrderTimeline()

getOrderPayments()

getOrderFulfillments()

getOrderReturns()

getOrderInventoryState()
```

---

# 171. Structured Errors

Examples:

```text
ORDER_ALREADY_CONFIRMED

ORDER_ALREADY_CANCELLED

ORDER_CANNOT_BE_EDITED

INSUFFICIENT_INVENTORY

ORDER_LINE_ALREADY_FULFILLED

CANCEL_QUANTITY_EXCEEDS_OPEN_QUANTITY

FULFILL_QUANTITY_EXCEEDS_AVAILABLE_ORDER_QUANTITY

PAYMENT_REQUIRED

ORDER_HOLD_ACTIVE

ORDER_VERSION_CONFLICT

DUPLICATE_ORDER_REQUEST
```

---

# 172. Important Invariants

### ORD-INV-001

Every Order belongs to one Organization.

### ORD-INV-002

Every committed Order has immutable stable identity/order number.

### ORD-INV-003

Order, Payment and Fulfillment states remain distinct.

### ORD-INV-004

Future Delivery state remains separate from Order state.

### ORD-INV-005

Order Lines preserve transaction-time Catalog snapshots.

### ORD-INV-006

Order address is snapshotted.

### ORD-INV-007

Historical Order pricing does not depend on current Catalog price.

### ORD-INV-008

Historical discounts do not recalculate from current Promotion rules.

### ORD-INV-009

Cart availability does not guarantee final reservation.

### ORD-INV-010

Critical inventory availability is revalidated server-side.

### ORD-INV-011

Confirmed inventory commitments must be backed by valid reservation/allocation according to policy.

### ORD-INV-012

Reservations cannot be silently duplicated through retry.

### ORD-INV-013

Fulfilled quantity cannot exceed valid remaining quantity.

### ORD-INV-014

Cancelled quantity cannot exceed valid open quantity.

### ORD-INV-015

Returned quantity cannot exceed eligible fulfilled quantity.

### ORD-INV-016

Fulfilled history cannot be erased by editing Order quantity.

### ORD-INV-017

Refund and Return are separate concepts.

### ORD-INV-018

Order cancellation releases only inventory commitments that have not physically left stock control.

### ORD-INV-019

Order amendments requiring more stock must secure additional inventory.

### ORD-INV-020

Committed Orders are not hard-deleted.

### ORD-INV-021

Order creation and other critical operations are idempotent.

### ORD-INV-022

Manual Orders and Storefront Orders converge on the same core domain rules.

### ORD-INV-023

One Order may have multiple Payments.

### ORD-INV-024

One Order may have multiple Fulfillments.

### ORD-INV-025

Fulfillment responsibility is quantity/location aware.

### ORD-INV-026

Delivery failure does not automatically equal Order cancellation.

### ORD-INV-027

RTO stock does not become available before physical return receipt.

### ORD-INV-028

Order state transitions are server-validated.

### ORD-INV-029

Confirmed Order edits are auditable and concurrency-safe.

### ORD-INV-030

Commercial totals reconcile deterministically.

---

# 173. V1 Mandatory Scope

Maevelle V1 Orders should include:

```text
✓ Storefront Orders

✓ Manual Orders

✓ Guest Customers

✓ Order Numbers

✓ Order Sources

✓ Customer References

✓ Customer Snapshots

✓ Address Snapshots

✓ Product / Variant Snapshots

✓ Order Lines

✓ Quantity

✓ Prices

✓ Discounts

✓ Charges

✓ Currency

✓ Totals

✓ DRAFT

✓ PENDING

✓ CONFIRMED

✓ ON_HOLD

✓ COMPLETED

✓ CANCELLED

✓ Optional REJECTED

✓ Separate Payment State

✓ Separate Fulfillment State

✓ Inventory Reservation Integration

✓ Warehouse Allocation Integration

✓ Partial Fulfillment

✓ Multiple Fulfillment Records

✓ Manual Tracking

✓ Confirmation

✓ Holds

✓ Hold Reasons

✓ Controlled Order Amendments

✓ Add / Remove Unfulfilled Items

✓ Quantity Increase / Decrease

✓ Manual Price Override with Permission

✓ Cancellation

✓ Partial Cancellation

✓ Cancellation Reasons

✓ Delivery-Failure Readiness

✓ RTO Readiness

✓ Return Foundation

✓ Partial Return

✓ Refund Foundation

✓ Exchange / Replacement Readiness

✓ Invoice Generation Foundation

✓ Timeline

✓ Internal Notes

✓ Customer Notes

✓ Search

✓ Filters

✓ Saved Views

✓ Permissions

✓ Audit

✓ Notifications

✓ Analytics

✓ Idempotency

✓ Concurrency Protection

✓ Exception Detection

✓ Reconciliation Path
```

---

# 174. Strongly Preferred V1

```text
Duplicate Order Warning

Order Health Indicators

Warehouse Reallocation

Manual Payment Verification

Customer Verification Notes

Bulk Confirmation

Bulk Hold

Bulk Fulfillment Preparation

Order Tags / Flags

Advanced Search

Operational Saved Views
```

---

# 175. Foundation Now / Later

Prepare architecture for:

```text
Courier Integrations

Automatic Delivery State

Online Payment Gateways

Backorders

Preorders

POS

Marketplace Orders

Bundles

Gift Orders

Order-Line Customization

Tax Engines

Advanced Fraud Detection

Wholesale Orders

B2B Terms
```

---

# 176. Deferred Advanced Capabilities

Post-V1:

```text
Automatic Pathao Booking

Automatic Steadfast Booking

Courier Routing

Delivery Reattempt Automation

Advanced Exchange Portal

Customer Self-Service Returns

Automated Refund Gateway

Fraud Scoring

Order Approval Workflows

Advanced Backorders

Preorders

Subscription Orders

B2B Credit Terms

Marketplace Synchronization

POS Synchronization
```

---

# 177. Decisions Established

### Decision O-001

**Order, Payment, Fulfillment and future Delivery state are separate.**

### Decision O-002

**Order uses a controlled commercial state machine.**

### Decision O-003

**Storefront and Manual Orders share the same core domain.**

### Decision O-004

**Guest checkout still creates/links a Customer record.**

### Decision O-005

**Order retains customer/address snapshots.**

### Decision O-006

**Order Lines retain Product/Variant/price/option snapshots.**

### Decision O-007

**Cart does not guarantee inventory.**

### Decision O-008

**Final order acceptance validates/reserves inventory transactionally.**

### Decision O-009

**Confirmed Order changes use controlled amendment operations.**

### Decision O-010

**Increasing quantity requires additional inventory reservation.**

### Decision O-011

**Reducing unfulfilled quantity releases reservation.**

### Decision O-012

**Fulfilled quantities cannot be rewritten away.**

### Decision O-013

**Partial cancellation is first-class.**

### Decision O-014

**On Hold has structured reason/history.**

### Decision O-015

**One Order may have multiple Fulfillments.**

### Decision O-016

**Fulfillment is quantity-aware and location-aware.**

### Decision O-017

**Courier/provider logic remains outside core Order domain.**

### Decision O-018

**Delivery failure does not automatically cancel Order.**

### Decision O-019

**Return and Refund are independent processes.**

### Decision O-020

**RTO/customer-return inventory becomes available only after physical receipt/inspection.**

### Decision O-021

**Committed Orders are preserved historically rather than hard-deleted.**

### Decision O-022

**Critical Order operations are idempotent and concurrency-safe.**

### Decision O-023

**Order exceptions must be recoverable without normal database surgery.**

### Decision O-024

**One giant `order.status` is explicitly rejected.**

---

# 178. Resulting Order Model

The architecture now looks like:

```text
                         ORDER
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ORDER STATE        PAYMENT STATE     FULFILLMENT STATE
        │                  │                  │
        │                  │                  ▼
        │                  │             Fulfillment
        │                  │                  │
        │                  │                  ▼
        │                  │             Warehouse
        │                  │                  │
        │                  │                  ▼
        │                  │             Inventory
        │                  │
        │                  ▼
        │               Payment
        │
        ▼
    Commercial
     Lifecycle
```

Customer side:

```text
CUSTOMER
   ↓
CART
   ↓
CHECKOUT
   ↓
ORDER
   ↓
CONFIRM
   ↓
RESERVE STOCK
   ↓
FULFILL
   ↓
DELIVERY
```

Exception side:

```text
ORDER
 │
 ├── Hold
 ├── Cancellation
 ├── Partial Cancellation
 ├── Delivery Failure
 ├── Return
 ├── Refund
 └── Replacement
```

This gives Maevelle a real transaction engine rather than a status dropdown.

---

# 179. Next Domain

The next deep document should be:

```text
docs/domains/payments/payment-architecture.md
```

because Orders now depend on payment state but we have intentionally not yet defined:

```text
COD

Manual bKash

Manual Nagad

Payment Method

Payment Record

Payment Attempt

Payment Verification

Transaction Reference

Partial Payment

Overpayment

Refund

Partial Refund

Payment Adjustment

Gateway Abstraction

Future SSLCommerz

Future bKash API

Future Nagad API

Provider Webhooks

Idempotency

Payment Reconciliation

COD Settlement

Courier COD Remittance

Payment Failure

Duplicate Payment

Unmatched Payment

Audit

Permissions
```

After Payment, we should design:

```text
Customer Architecture
```

then:

```text
Media
Access Control
Expense / Finance Operations
```

before moving toward broader technical/schema design.

---

**End of Order Lifecycle Architecture v0.1**
