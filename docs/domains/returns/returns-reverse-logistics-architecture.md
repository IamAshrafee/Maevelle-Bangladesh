# Maevelle Ecommerce — Returns & Reverse Logistics Architecture

**Document:** `docs/domains/returns/returns-reverse-logistics-architecture.md`
**Status:** Initial Domain Architecture / Living Document
**Version:** 0.1
**Related:** Orders, Fulfillment, Inventory, Costing/COGS, Payments, Customers, Warehouse, Notifications, Analytics

---

# 1. Purpose

This document defines the canonical lifecycle for goods moving **back toward Maevelle** after outbound fulfillment.

It covers:

```text
Customer Return

Courier Return-to-Origin / RTO

Rejected Delivery

Return Authorization

Reverse Shipment

Physical Receipt

Inspection

Restocking

Damaged Return

Missing Return

Partial Return

Refund relationship

Exchange relationship

Cost restoration

COGS reversal
```

The goal is to eliminate ambiguous statuses such as:

```text
RETURNED
```

that could otherwise mean several completely different things.

---

# 2. Central Principle

> **Return Authorization, Reverse Physical Movement, Physical Return Receipt, Inspection, Inventory Restock, Refund, and COGS Reversal are separate business events.**

A return request does not mean:

```text
item is back in stock.
```

A refund does not mean:

```text
item physically returned.
```

A courier RTO does not always mean:

```text
a completed sale was reversed.
```

---

# 3. Core Lifecycle

Conceptually:

```text
RETURN REQUEST
      │
      ▼
ELIGIBILITY / AUTHORIZATION
      │
      ▼
RETURN EXPECTED
      │
      ▼
REVERSE PHYSICAL MOVEMENT
      │
      ▼
RETURN RECEIPT
      │
      ▼
INSPECTION
  ┌───┼─────────────┐
  ▼   ▼             ▼
SELLABLE          DAMAGED
RESTOCK           STOCK
  │                 │
  └──────┬──────────┘
         ▼
   COST RESTORATION
```

Refunding is a related but separate commercial/financial flow.

---

# 4. Two Primary Return Families

Maevelle must distinguish:

```text
CUSTOMER_RETURN
```

from:

```text
RTO
```

---

# 5. Customer Return

Typical flow:

```text
Customer successfully received Product
        ↓
Sale considered completed
        ↓
COGS recognized
        ↓
Customer requests return
        ↓
Goods physically come back
```

Possible result:

```text
Inventory restored
COGS reversed
Refund issued
```

depending policy.

---

# 6. RTO

Return-to-Origin usually means:

```text
Fulfillment dispatched
        ↓
Courier unable/refused to deliver
        ↓
Parcel returns to Maevelle
```

The commercial sale may never have completed.

Therefore an RTO can require:

```text
inventory restoration
```

without:

```text
COGS reversal
```

if COGS was never recognized.

---

# 7. Third Core Principle

> **Physical truth always wins over workflow expectation.**

Example:

System expects:

```text
1 returned red hat
```

Warehouse receives:

```text
wrong product
```

Correct action is not:

```text
mark expected hat returned.
```

Instead:

```text
record actual received item
open discrepancy
resolve identity
```

---

# 8. Fourth Core Principle

> **Return quantity is tracked explicitly against the original fulfilled quantity.**

Never rely only on:

```text
order.status = RETURNED
```

---

# 9. Fifth Core Principle

> **Refund eligibility and return eligibility are related but not identical.**

Examples:

```text
Refund without physical Return

Return without Refund

Partial Refund

Goodwill compensation

Replacement without Refund
```

must all be possible.

---

# 10. Domain Ownership

Returns owns:

```text
Return Case

Return Reason

Return Eligibility Decision

Return Authorization

Return Lines

Reverse Movement state

Return Receipt

Return Inspection

Disposition

Restock decision

RTO resolution

Return discrepancy
```

---

# 11. Returns Does Not Own

```text
Original Order
→ Orders

Outbound Fulfillment
→ Orders/Fulfillment

Physical stock ledger
→ Inventory

Cost restoration / COGS reversal
→ Costing

Refund execution
→ Payments

Customer identity
→ Customers

Courier provider API
→ Delivery/Integrations
```

---

# 12. Return Case

A Return Case is the central commercial/operational record.

Conceptually:

```text
ReturnCase
```

links:

```text
Order

Customer

Return type

Original Fulfillment context

Reason

Authorization

Physical reverse movement

Receipt

Disposition

Refund relationship
```

---

# 13. Return Case Type

V1:

```text
CUSTOMER_RETURN

RTO
```

Future:

```text
WARRANTY_RETURN

RECALL

EXCHANGE_RETURN

BUSINESS_INITIATED_RETURN
```

---

# 14. Return Status Dimensions

Avoid one overloaded status.

Recommended dimensions:

```text
case_status

authorization_status

transport_status

receipt_status

inspection_status

commercial_resolution_status
```

---

# 15. Why Multiple Dimensions?

A Return may be:

```text
authorized
in transit
not yet received
refund already approved
```

at the same time.

One enum cannot express that cleanly.

---

# 16. Case Status

High-level case lifecycle:

```text
OPEN

RESOLVED

CANCELLED
```

---

# 17. Authorization Status

```text
NOT_REQUIRED

PENDING

APPROVED

PARTIALLY_APPROVED

REJECTED
```

---

# 18. Transport Status

```text
NOT_STARTED

EXPECTED

IN_TRANSIT

ARRIVED

LOST

CANCELLED
```

---

# 19. Receipt Status

```text
NOT_RECEIVED

PARTIALLY_RECEIVED

RECEIVED

DISCREPANCY
```

---

# 20. Inspection Status

```text
NOT_REQUIRED

PENDING

PARTIALLY_INSPECTED

COMPLETED
```

---

# 21. Commercial Resolution Status

```text
PENDING

NO_REFUND_REQUIRED

REFUND_PENDING

REFUND_COMPLETED

REPLACEMENT_PENDING

REPLACEMENT_COMPLETED

OTHER_RESOLUTION
```

---

# 22. Return Reason

Return reason is not free text only.

Use controlled reason taxonomy.

Examples:

```text
CUSTOMER_CHANGED_MIND

WRONG_ITEM_SENT

WRONG_SIZE

DAMAGED_ON_ARRIVAL

DEFECTIVE

QUALITY_NOT_EXPECTED

DELIVERY_REFUSED

CUSTOMER_UNAVAILABLE

ADDRESS_ISSUE

COURIER_FAILURE

ORDER_CANCELLED_IN_TRANSIT

OTHER
```

---

# 23. Reason Details

Controlled reason plus optional:

```text
customer note

operator note

media evidence
```

---

# 24. Reason Does Not Automatically Determine Refund

Example:

```text
CUSTOMER_CHANGED_MIND
```

may be eligible under one return policy and not another.

Reason is input to policy.

---

# 25. Return Policy

Returns evaluates:

```text
return window

product eligibility

condition requirements

fulfilled quantity

already returned quantity

already refunded quantity

customer/order status

special product restrictions
```

---

# 26. Policy Snapshot

When return authorization is issued, preserve relevant policy snapshot.

Why?

Because return policy might change tomorrow.

Existing authorization should not silently change.

---

# 27. Return Window

Example:

```text
7 days from successful delivery
```

The exact policy belongs in Settings/Returns configuration.

---

# 28. RTO Has No Customer Return Window

RTO is operational reverse logistics.

Do not run normal customer return-window logic.

---

# 29. Return Line

A Return Case contains explicit Return Lines.

Each references:

```text
Order Line

Fulfillment Line

Quantity requested

Quantity approved

Quantity expected back

Quantity received

Disposition outcome
```

---

# 30. Fulfillment Context Is Important

One Order Line might be fulfilled:

```text
2 units from Warehouse A
1 unit from Warehouse B
```

Return provenance should preserve which fulfilled quantities are being returned where possible.

---

# 31. Return Quantity Invariant

For each Order Line:

```text
approved return quantity
<=
fulfilled quantity
-
previously finalized returned quantity
```

subject to controlled exceptional repair.

---

# 32. Duplicate Return Requests

Customer requests same item twice.

System must detect overlapping active/settled return quantity.

Do not authorize quantity beyond eligible fulfilled balance.

---

# 33. Return Request

A Return Request does not alter:

```text
Inventory

COGS

Payment
```

It creates intent only.

---

# 34. Return Authorization

Approval creates an expectation that specified quantity may come back.

Still:

```text
Inventory unchanged.
```

---

# 35. Authorization Number

Recommended human reference:

```text
RET-2026-000123
```

Internal UUID remains canonical identity.

---

# 36. Authorization Expiry

Customer Return authorization may expire.

Example:

```text
Return parcel must be handed over within 7 days.
```

Expiry does not rewrite policy history.

---

# 37. Expired Authorization

Can transition:

```text
APPROVED
→ expired operationally
```

through explicit expiry semantics.

Do not simply delete Return Case.

---

# 38. Return Method

Potential V1:

```text
CUSTOMER_SHIPS

COURIER_PICKUP

CUSTOMER_DROPOFF

RTO_COURIER
```

---

# 39. Reverse Shipment

A Return Case may create one or more reverse shipment records.

Why multiple?

```text
partial returns

replacement pickup

split packages
```

---

# 40. Reverse Shipment Is Not Return Receipt

Courier says parcel:

```text
delivered to warehouse
```

but warehouse has not verified contents.

Therefore:

```text
transport ARRIVED
≠
physical goods accepted.
```

---

# 41. Reverse Shipment Tracking

Preserve:

```text
provider

tracking number

merchant reference

shipped_at

latest status

delivered/arrived_at

exception history
```

---

# 42. Provider Status Normalization

Do not store courier raw status as Return business truth.

Map raw:

```text
ReturnedToMerchant
```

into normalized reverse movement event.

---

# 43. Courier Webhook Failure

Return Case remains.

Provider callback retry/reconciliation operates independently.

---

# 44. Reverse Movement Lost

If parcel is lost returning to Maevelle:

```text
transport_status = LOST
```

Inventory is not restored.

Refund/customer resolution depends commercial responsibility policy.

---

# 45. Return Receipt

Canonical physical proof that reverse goods arrived at a Maevelle Location.

Recommended:

```text
returns.return_receipts
```

---

# 46. Why Not Reuse Inbound Receipt?

Inbound Receipt represents acquisition/inbound commercial supply.

Return Receipt represents reverse fulfillment/customer goods.

Their financial/cost semantics differ.

They may reuse shared receiving infrastructure patterns, but remain separate domain entities.

---

# 47. Return Receipt Header

Conceptually:

```text
Return Receipt ID

Return Case

Location

Received At

Received By

Status

Inventory Transaction reference

Costing restoration reference
```

---

# 48. Return Receipt Lines

Each line records actual:

```text
expected Return Line

observed item

quantity

condition

identity resolution

notes
```

---

# 49. Return Receipt Before Inspection

Recommended default condition:

```text
INSPECTION
```

rather than:

```text
SELLABLE
```

---

# 50. Why Inspection First?

Returned goods may have:

```text
wear

missing accessories

stains

damage

wrong product

tampering
```

A Return should not automatically increase sellable inventory.

---

# 51. Immediate Sellable Exception

If business later has trusted sealed-return workflows, policy may allow direct SELLABLE receipt.

Not default V1.

---

# 52. Return Receipt Posting

Posting creates physical Inventory movement.

Example:

```text
INSPECTION +1
```

---

# 53. This Is the Moment Physical Stock Returns

Not:

```text
Return Request

Authorization

Courier pickup

Refund
```

---

# 54. Duplicate Receipt Posting

Idempotency guarantees:

```text
one Return Receipt
→ one Inventory Transaction
```

---

# 55. Partial Return Receipt

Expected:

```text
3 units
```

First parcel contains:

```text
2
```

Correct:

```text
received = 2

remaining expected = 1
```

Return Case remains open.

---

# 56. Over-Return

Expected:

```text
1
```

Received:

```text
2
```

Do not force warehouse to record 1.

Record actual physical quantity and open discrepancy.

---

# 57. Wrong Item Returned

Expected:

```text
Variant Red-M
```

Received:

```text
Variant Blue-L
```

Do not restore Red-M stock.

Create:

```text
RETURN_ITEM_MISMATCH
```

discrepancy.

---

# 58. Unknown Item Returned

Allow unresolved received item state similar in spirit to inbound receiving.

But it must not become normal Inventory without identity resolution.

---

# 59. Return Discrepancy Types

```text
QUANTITY_SHORT

QUANTITY_OVER

WRONG_ITEM

UNKNOWN_ITEM

DAMAGED

MISSING_COMPONENTS

EMPTY_PACKAGE

COUNTERFEIT_OR_SUBSTITUTED_ITEM

OTHER
```

---

# 60. Fraud Labeling

Avoid making irreversible fraud accusations automatically.

System can record:

```text
suspected substitution
```

and require operator review.

---

# 61. Inspection

Inspection is explicit.

It determines physical disposition.

---

# 62. Inspection Outcome

V1 outcomes:

```text
SELLABLE

DAMAGED

QUARANTINE

REJECTED_RETURN
```

Potential future:

```text
REFURBISH

REPAIR

PARTS
```

---

# 63. SELLABLE

Inventory condition change:

```text
INSPECTION -1
SELLABLE +1
```

---

# 64. DAMAGED

```text
INSPECTION -1
DAMAGED +1
```

---

# 65. QUARANTINE

Used when decision needs:

```text
supervisor review

authenticity check

quality investigation
```

---

# 66. REJECTED_RETURN

Important distinction.

Customer's return claim can be commercially rejected, but physical item may still be in Maevelle possession.

Therefore physical disposition must still be recorded.

---

# 67. Rejected Return Does Not Mean Delete Receipt

Physical truth remains.

Commercial resolution may involve:

```text
send item back to Customer

hold item

dispose under policy
```

---

# 68. Inspection Is Not Refund Approval

Refund can be:

```text
pre-approved

post-inspection approved

partially approved

denied
```

according to return policy.

---

# 69. Return Refund Strategies

Potential:

```text
REFUND_AFTER_RECEIPT

REFUND_AFTER_INSPECTION

REFUND_IMMEDIATELY

NO_REFUND
```

---

# 70. V1 Recommendation

Default customer Return:

> Refund becomes executable after required physical receipt and inspection completes.

Exceptions require explicit business policy.

---

# 71. RTO Refund

For prepaid Order that fails delivery:

```text
payment exists

sale may not complete

RTO returns physically
```

Refund may become due independently of customer Return authorization.

---

# 72. COD RTO

If customer never paid:

```text
refund usually not required.
```

But:

```text
reservation/fulfillment/inventory/cost
```

still need resolution.

---

# 73. Return Commercial Amount

Returns should not calculate refund using current price.

It requests refundable commercial attribution from Pricing/Orders.

---

# 74. Pricing Source

Use original:

```text
Order Line gross

discount allocations

net amount

delivery allocation where policy applies
```

---

# 75. Refund Execution

Payments owns:

```text
CreateRefund

ProcessRefund

Refund Provider Operation
```

Returns may request/link Refund.

---

# 76. Return Does Not Create Fake Payment Records

No Refund row unless actual financial refund workflow exists.

---

# 77. Refund Relationship

Recommended many-to-many capable linkage:

```text
Return Case
↔
Refund
```

because:

```text
one Return may have multiple partial Refunds

one Refund may cover several Return Lines
```

---

# 78. Return Refund Allocation

Preserve:

```text
Return Line

Refund Allocation

Commercial component

Amount
```

---

# 79. Refund Before Return Receipt

If policy allows immediate Refund:

Inventory still remains unchanged until physical receipt.

This creates legitimate:

```text
Refunded but not returned
```

state.

---

# 80. Customer Never Sends Item

Then:

```text
Refund remains real

Inventory remains absent

COGS remains unless physical return occurs
```

This economic loss must remain visible.

---

# 81. Cost Restoration

Return Receipt coordinates with Costing.

Costing restores:

```text
original attributable acquisition cost
```

rather than current FIFO cost.

---

# 82. Return Cost Source

Original:

```text
Outbound Cost Assignment
```

is the preferred provenance.

---

# 83. Customer Return After COGS

Physical Return:

```text
restores Cost Layer position
```

and Costing creates:

```text
COGS Reversal
```

for that physical quantity.

---

# 84. RTO Before COGS

Physical return restores:

```text
Pending Outbound Cost Assignment
```

without COGS reversal.

---

# 85. RTO After COGS Was Incorrectly Recognized

System may need:

```text
COGS reversal
```

because commercial completion had been recognized but later invalidated.

This should be explicit, not implied merely by `RTO`.

---

# 86. Cost Restoration and Inspection

Cost may return while condition is:

```text
INSPECTION
```

The cost stays attached to that condition.

---

# 87. Damaged Return Cost

Returned damaged item may still restore acquisition cost provenance.

Condition does not automatically write cost to zero.

---

# 88. Future Write-Down

A separate valuation/impairment process may reduce carrying value later.

Not Returns responsibility.

---

# 89. Return Shipping Cost

Reverse courier cost is operational expense.

It is not automatically:

```text
COGS
```

and not automatically deducted from customer Refund unless business policy explicitly allows customer-paid return shipping.

---

# 90. Customer Return Fee

If future business policy charges:

```text
restocking fee

return shipping fee
```

that must become explicit commercial adjustment.

Do not hide it by altering original Product price.

---

# 91. No Restocking Fee V1

Recommended defer unless actual business need emerges.

---

# 92. Exchanges

Exchange is not a single state transition.

Model as:

```text
Original Return
+
Replacement commercial flow
```

---

# 93. Replacement Options

Potential:

```text
new Order

replacement Fulfillment linked to original Order
```

V1 recommendation:

> Create a replacement Order or explicit replacement-order relationship rather than mutating original Order Lines.

---

# 94. Why Replacement Order?

It preserves:

```text
new Variant

new price

new fulfillment

new reservation

new delivery

new payment difference
```

cleanly.

---

# 95. Zero-Value Replacement

Replacement Order can use:

```text
explicit replacement credit/adjustment
```

rather than pretending Variant price is permanently zero.

---

# 96. Price Difference

Example:

Original:

```text
৳800
```

Replacement:

```text
৳900
```

Business policy may require:

```text
collect ৳100

waive difference

refund difference
```

This is explicit commercial resolution.

---

# 97. Exchange Inventory

Original item stock return and replacement stock fulfillment are independent inventory movements.

---

# 98. Partial Return

Order:

```text
3 shirts
```

Customer returns:

```text
1
```

Correct:

```text
Return Line quantity = 1
```

Remaining two stay fulfilled/sold.

---

# 99. Multiple Returns Against One Order

Allowed where eligibility remains.

Example:

```text
Return 1:
1 unit

Return 2:
another unit
```

Quantity constraints prevent over-return.

---

# 100. Multiple Return Cases

Possible because reasons/timing may differ.

Do not force one lifetime Return record per Order.

---

# 101. Return Cancellation

Customer cancels Return before handing item over.

Return Case can become:

```text
CANCELLED
```

if no irreversible physical/financial effects occurred.

---

# 102. Cannot Cancel After Physical Receipt

Once item is physically received:

```text
Return Case remains historical.
```

Commercial resolution may change, but physical event cannot disappear.

---

# 103. Cannot Cancel Completed Refund

Refund is financial truth.

---

# 104. Lost Reverse Shipment

Case remains:

```text
OPEN / EXCEPTION
```

until responsibility resolved.

Possible business outcomes:

```text
refund Customer anyway

carrier claim

deny refund under policy
```

Returns records operational resolution.

---

# 105. Carrier Claim

Potential future relationship:

```text
Return Case
→ Courier Claim
```

Financial reimbursement from courier belongs Finance/Integration domain.

---

# 106. Customer Return Address

Return authorization may specify:

```text
return destination

return instructions

contact
```

Snapshot it.

Do not depend on current Warehouse address if it later changes.

---

# 107. Reverse Label

If courier supports label generation:

```text
Return Authorization
→ Integration Operation
→ Reverse Shipment
```

External failure must not invalidate Return Authorization.

---

# 108. Reverse Pickup Creation Timeout

Use:

```text
UNKNOWN_EXTERNAL_OUTCOME
```

and reconcile before duplicate creation.

Same external-operation rules as outbound delivery.

---

# 109. Return Media

Customer may submit:

```text
damage photos

wrong-item photos
```

Media remains private operational evidence until explicitly published elsewhere.

---

# 110. Return Notes

Separate:

```text
customer-visible note

internal note
```

where necessary.

Do not accidentally expose fraud/review commentary to Customer.

---

# 111. Return Timeline

Recommended human-readable timeline:

```text
Requested

Approved

Pickup scheduled

In transit

Arrived

Received

Inspected

Refund requested

Refund completed

Case resolved
```

---

# 112. Audit vs Timeline

Timeline is operational summary.

Audit records:

```text
who approved

what changed

why

before/after
```

---

# 113. Customer Communication

Notifications can be triggered for:

```text
Return Requested

Return Approved

Return Rejected

Return Received

Refund Started

Refund Completed

Replacement Created
```

---

# 114. Notification Failure

Never rolls back:

```text
Return

Inventory

Refund
```

---

# 115. Return Expiry Job

SYSTEM job can expire unused authorizations.

Must recheck:

```text
no active reverse shipment

no physical receipt

not already cancelled/resolved
```

before expiry.

---

# 116. RTO Creation

RTO may originate from:

```text
Delivery provider event

Admin reconciliation

manual warehouse discovery
```

---

# 117. RTO Must Be Idempotent

Same courier status/callback cannot create multiple RTO cases for same Fulfillment/Delivery.

---

# 118. RTO Without Existing Return Case

System creates one normalized:

```text
RTO Return Case
```

linked to Delivery/Fulfillment.

---

# 119. RTO With Parcel Still At Courier

Do not restore Inventory yet.

---

# 120. Courier Says RTO Delivered

Still wait for canonical warehouse Return Receipt where operationally possible.

Provider status is not physical warehouse count authority.

---

# 121. Manual RTO Receipt

If courier integration unavailable, warehouse can receive manually against known Fulfillment.

Audit source:

```text
MANUAL
```

---

# 122. RTO Wrong Contents

Same discrepancy handling as Customer Return.

Do not blindly restore original goods.

---

# 123. Customer Refuses Partial Shipment

Future Delivery may represent partial delivery.

Returns must support only actually returned Fulfillment quantities.

---

# 124. Delivery Failure Before Dispatch

No Return exists because goods never left Inventory.

Use Order/Fulfillment cancellation.

---

# 125. Delivery Cancellation After Dispatch

Now reverse physical movement is necessary.

This becomes:

```text
RTO / reverse logistics
```

not simple Order cancellation.

---

# 126. Return-to-Origin Does Not Reopen Reservation

When stock returns:

```text
physical Inventory restored
```

but original Reservation should normally remain consumed/closed.

Do not resurrect old reservation.

---

# 127. Reattempt Delivery

If business wants to resend same Order after RTO:

Recommended:

```text
new Fulfillment
+
new Reservation
```

using restored stock.

Do not revive the old dispatched Fulfillment.

---

# 128. Why New Fulfillment?

Preserves:

```text
first failed attempt

second delivery attempt

inventory movement

cost assignment

courier tracking
```

separately.

---

# 129. Return and Order Status

Do not overload Order status with:

```text
RETURNED
```

as sole reverse-logistics truth.

Order may remain:

```text
COMPLETED
```

with associated Return Case history.

---

# 130. Why?

An Order can be:

```text
partially returned

partially refunded

partially exchanged
```

while still commercially completed overall.

---

# 131. Derived Order Return Summary

Order Workspace may expose projection:

```text
return_status_summary

returned_quantity

refunded_amount
```

but Returns/Payments remain authority.

---

# 132. Return and Fulfillment Status

Original Fulfillment remains historical:

```text
COMPLETED
```

or:

```text
DELIVERY_FAILED
```

according to lifecycle.

Return is separate.

---

# 133. Data Model

Recommended schema:

```text
returns
```

---

# 134. `returns.return_cases`

Conceptually:

```text
id
organization_id
return_number
order_id
customer_id
return_type
case_status
authorization_status
transport_status
receipt_status
inspection_status
commercial_resolution_status
reason_code
reason_detail
requested_at
approved_at
resolved_at
cancelled_at
created_by_actor_type
created_by_actor_id
version
created_at
updated_at
```

---

# 135. Unique Return Number

```text
organization_id
+
return_number
```

---

# 136. `returns.return_lines`

```text
id
organization_id
return_case_id
order_line_id
fulfillment_line_id
inventory_item_id
requested_quantity
approved_quantity
expected_return_quantity
received_quantity
finalized_return_quantity
reason_code
status
version
```

---

# 137. Return Line Quantity Checks

```text
requested_quantity >= 0

approved_quantity >= 0

received_quantity >= 0

finalized_return_quantity >= 0
```

Cross-record eligibility remains transactional.

---

# 138. `returns.return_authorizations`

Could be separate if policy/version/history becomes significant.

Recommended V1 yes.

```text
id
organization_id
return_case_id
authorization_number
policy_version
authorized_at
expires_at
authorized_by
instructions_snapshot
destination_location_id
status
```

---

# 139. Why Separate Authorization?

A Return Case can:

```text
be requested

rejected

reopened/reviewed
```

while Authorization itself is a historical decision artifact.

---

# 140. `returns.reverse_shipments`

```text
id
organization_id
return_case_id
provider/integration_account_id
external_reference
tracking_number
status
shipped_at
arrived_at
created_at
updated_at
version
```

---

# 141. `returns.return_receipts`

```text
id
organization_id
return_case_id
receipt_number
receiving_location_id
status
received_at
received_by
inventory_transaction_id
created_at
version
```

---

# 142. Return Receipt Unique Inventory Link

```text
inventory_transaction_id UNIQUE
```

after posting.

---

# 143. `returns.return_receipt_lines`

```text
id
organization_id
return_receipt_id
return_line_id NULL
expected_inventory_item_id NULL
actual_inventory_item_id NULL
resolution_status
received_quantity
initial_condition_code
discrepancy_type NULL
notes
```

---

# 144. Resolution Status

```text
MATCHED

MISMATCH

UNRESOLVED
```

---

# 145. `returns.return_inspections`

```text
id
organization_id
return_receipt_line_id
status
outcome
quantity
reason_code NULL
notes NULL
inspected_by
inspected_at
```

---

# 146. Inspection Granularity

One Receipt Line can split:

```text
2 received

1 sellable

1 damaged
```

Therefore inspection outcomes may need multiple rows.

---

# 147. `returns.return_dispositions`

Recommended first-class row.

```text
id
organization_id
return_inspection_id
disposition_type
quantity
inventory_condition
inventory_transaction_id NULL
created_at
```

---

# 148. Disposition Types

```text
RESTOCK_SELLABLE

RESTOCK_DAMAGED

RESTOCK_QUARANTINE

RETURN_TO_CUSTOMER

DISPOSE

OTHER
```

---

# 149. Cost Restoration Link

Disposition/Receipt should preserve reference to Costing restoration result.

Exact FK direction can remain Costing-owned.

---

# 150. `returns.return_refund_links`

```text
id
organization_id
return_case_id
refund_id
created_at
```

Allows multiple Refund relationships.

---

# 151. `returns.replacement_orders`

```text
organization_id
return_case_id
replacement_order_id
created_at
```

for exchange/replacement relationship.

---

# 152. Application Commands

Recommended:

```text
RequestReturn

CreateRTOCase

ApproveReturn

PartiallyApproveReturn

RejectReturn

CancelReturn

CreateReverseShipment

RecordReverseShipmentEvent

CreateReturnReceipt

PostReturnReceipt

ResolveReturnItemMismatch

InspectReturnedItem

RecordReturnDisposition

RequestReturnRefund

LinkRefundToReturn

CreateReplacementOrder

ResolveReturnCase

ExpireReturnAuthorization

ReconcileRTO
```

---

# 153. `RequestReturn`

Inputs:

```text
Order

Lines/quantities

Reason

Customer note

Evidence
```

Checks:

```text
fulfilled quantity

returnable quantity

return policy

window

existing active returns
```

---

# 154. `ApproveReturn`

Preserves:

```text
approved quantity

policy version

expiry

destination

instructions
```

---

# 155. `RejectReturn`

Requires reason.

Does not delete Case.

---

# 156. `CreateRTOCase`

Normally internal SYSTEM/provider/Admin command.

Does not require customer return authorization.

---

# 157. `PostReturnReceipt`

Transaction coordinates:

```text
Return Receipt posting

Inventory receipt into INSPECTION/condition

Costing cost restoration

Outbox

Audit
```

---

# 158. Costing Interaction

For Customer Return with recognized COGS:

```text
restore original Cost Layer position

COGS reversal
```

For pre-COGS RTO:

```text
restore pending outbound cost
```

---

# 159. `InspectReturnedItem`

Moves quantity from:

```text
INSPECTION
```

to:

```text
SELLABLE

DAMAGED

QUARANTINE
```

through Inventory condition-change transactions.

---

# 160. `RequestReturnRefund`

Returns asks Payments to create/refine Refund based on:

```text
authorized commercial amount

received/inspection policy

already refunded value
```

---

# 161. Returns Never Directly Writes Payment Tables

Cross-domain command/interface only.

---

# 162. Queries

Recommended:

```text
ListReturns

GetReturnWorkspace

GetReturnEligibility

GetReturnAuthorization

ListExpectedReturns

GetReturnReceivingWorkspace

ListReturnDiscrepancies

GetRTOQueue

GetReturnRefundSummary

GetReturnCostSummary

GetCustomerReturnHistory

GetReturnAnalytics
```

---

# 163. Storefront Queries

Future Customer Account / Guest return flow may expose:

```text
GetReturnEligibility

GetReturnStatus
```

with secure customer access.

---

# 164. Admin Return Workspace

Should show:

```text
Original Order

Fulfillment

Customer

Return reason

Requested/approved quantities

Reverse shipment

Receipt

Inspection

Restock

Refund

Cost restoration

Timeline
```

without requiring operators to open six unrelated modules.

---

# 165. Permissions

Potential:

```text
returns.view

returns.create

returns.approve

returns.reject

returns.receive

returns.inspect

returns.resolve_discrepancy

returns.refund_request

returns.exchange

returns.rto.manage

returns.override_policy
```

---

# 166. Policy Override

High privilege.

Must require:

```text
reason

actor

original policy result

override decision

audit
```

---

# 167. Return Security

Customer return endpoint cannot submit arbitrary:

```text
customer_id

order_id belonging to someone else

verified_return = true

refund_amount
```

Server resolves authorization.

---

# 168. Return Token

If guest return access is supported, use:

```text
secure opaque return/order access credential
```

not guessable Order number alone.

---

# 169. Media Security

Return evidence remains private by default.

---

# 170. Concurrency — Double Approval

Two agents approve same Request.

Expected:

```text
one authorization effect
```

version/lock protects.

---

# 171. Concurrency — Return vs Refund

Two agents request separate Refunds against same Return.

Payments refundable-state locking prevents over-refund.

---

# 172. Concurrency — Two Receipts

Two warehouse operators receive same parcel.

Idempotent Receipt identity/provider tracking + Case locks prevent duplicate stock restoration.

---

# 173. Concurrency — Partial Returns

Two Return Cases against same Order Line compete for final eligible unit.

Transactional quantity check ensures total authorized/finalized returns do not exceed fulfilled eligible quantity.

---

# 174. Return Integrity Checks

Required:

```text
Return approved quantity <= eligible fulfilled quantity

Received quantity >= 0

Finalized returned quantity <= received quantity

Inventory restored only from posted Return Receipt

COGS reversed only for physically restored eligible quantity

Refund does not imply stock restoration

RTO cost restoration cannot duplicate Customer Return restoration

Replacement Order links remain traceable
```

---

# 175. Return Health Issues

Examples:

```text
Refund completed but expected Return overdue

Return received but not inspected

RTO marked arrived by courier but no warehouse receipt

Received quantity mismatch

COGS reversal missing

Inventory restored but Costing restoration missing

Return Case resolved with active reverse shipment

Duplicate return quantity conflict
```

---

# 176. Integrity Severity

Examples:

```text
Return waiting inspection 2 days
→ WARNING

Inventory restored twice
→ CRITICAL

Refund completed without physical return where policy allows
→ INFO / expected

COGS reversed without physical return
→ CRITICAL
```

---

# 177. Reconciliation Jobs

Recommended:

```text
RTO provider status reconciliation

Expected Return aging

Receipt vs Inventory reconciliation

Return quantity reconciliation

Return vs Refund reconciliation

Return vs Costing reconciliation
```

---

# 178. Return Aging

Admin should see:

```text
Approved but not shipped

In transit too long

Arrived but not received

Received but not inspected

Refund pending
```

---

# 179. Analytics

Returns provides facts such as:

```text
Return Requests

Authorized Returns

Physical Return Rate

RTO Rate

Return Reasons

Restockable Rate

Damaged Return Rate

Refund-after-return amount

Return cycle time

RTO cycle time
```

---

# 180. Return Rate Denominator

Must be explicit.

Example:

```text
Returned Units
/
Delivered Units
```

is different from:

```text
Return Cases
/
Orders
```

Analytics metric catalog defines exact formula.

---

# 181. RTO Rate

Likely:

```text
RTO Fulfillments
/
Dispatched Fulfillments
```

not:

```text
RTO Orders / All Orders
```

unless deliberately defined.

---

# 182. Refund Rate

Payment Analytics owns actual Refund amount metrics.

Returns supplies physical/commercial attribution.

---

# 183. Gross Margin Impact

Analytics combines:

```text
Refund economics

COGS reversal

restored Inventory cost

reverse shipping expense
```

without collapsing them.

---

# 184. Return Reason Analytics

Reason taxonomy should stay stable/versioned enough for reporting.

Do not allow arbitrary free-text-only reasons.

---

# 185. RTO Analytics

Important Bangladesh operational metrics may later include:

```text
RTO by courier

RTO by area

RTO by customer

RTO by delivery attempt

RTO by payment method

RTO reason
```

but policy against unfair customer blocking belongs Customers/Risk future.

---

# 186. Customer History

Customer profile can display:

```text
Orders

Returns

RTOs

Refunds
```

but must not automatically label customer fraudulent based solely on Return frequency.

---

# 187. Customer Blocking

If business policy later uses abusive-return signals:

```text
Risk/Fraud policy
```

should own decision.

Returns provides facts only.

---

# 188. Return State Machine — Customer Return

Recommended:

```text
REQUESTED
   │
   ├── REJECTED
   │
   ▼
AUTHORIZED
   │
   ▼
EXPECTED / IN_TRANSIT
   │
   ▼
RECEIVED
   │
   ▼
INSPECTED
   │
   ├── RESTOCKED
   ├── DAMAGED
   ├── QUARANTINED
   └── REJECTED_RETURN
   │
   ▼
COMMERCIAL RESOLUTION
   │
   ▼
RESOLVED
```

Not all branches require Refund.

---

# 189. RTO State Machine

Recommended:

```text
DELIVERY FAILED / RETURN STARTED
        │
        ▼
RTO IN TRANSIT
        │
        ▼
ARRIVED
        │
        ▼
WAREHOUSE RECEIPT
        │
        ▼
INSPECTION
        │
        ▼
RESTOCK / OTHER DISPOSITION
        │
        ▼
PAYMENT/COMMERCIAL RESOLUTION
        │
        ▼
RESOLVED
```

---

# 190. State Regression

Provider may send stale events.

Example:

```text
ARRIVED
then
IN_TRANSIT
```

Normalized Return state must not regress due stale callback.

---

# 191. Manual Correction

If Return Case state is wrong due provider/import issue, use explicit correction/reconciliation command.

Do not PATCH arbitrary status.

---

# 192. Return Event Candidates

Internal events:

```text
ReturnRequested

ReturnAuthorized

ReturnRejected

ReverseShipmentCreated

ReturnArrived

ReturnReceived

ReturnInspectionCompleted

ReturnRestocked

ReturnDamaged

RTOCreated

RTOReceived

ReturnRefundRequested

ReturnResolved
```

---

# 193. Public Webhooks Future

Potential stable external events:

```text
return.created

return.received

return.resolved
```

Do not expose every internal event.

---

# 194. API Endpoints — Admin

Recommended:

```text
GET  /api/admin/v1/returns
POST /api/admin/v1/returns

GET  /api/admin/v1/returns/{id}

POST /api/admin/v1/returns/{id}/approve
POST /api/admin/v1/returns/{id}/reject
POST /api/admin/v1/returns/{id}/cancel

POST /api/admin/v1/returns/{id}/reverse-shipments

POST /api/admin/v1/returns/{id}/receipts
POST /api/admin/v1/return-receipts/{id}/post

POST /api/admin/v1/return-receipt-lines/{id}/inspect

POST /api/admin/v1/returns/{id}/refund-request

POST /api/admin/v1/returns/{id}/replacement-order

POST /api/admin/v1/returns/{id}/resolve
```

---

# 195. RTO Endpoint

Potential:

```text
POST /api/admin/v1/fulfillments/{id}/rto
```

or Delivery-owned command later.

---

# 196. Storefront Return Request Future

Potential:

```text
POST /api/storefront/v1/orders/{publicReference}/returns
```

only with secure customer/order authorization.

---

# 197. API Problem Codes

Examples:

```text
RETURN_NOT_ELIGIBLE

RETURN_WINDOW_EXPIRED

RETURN_QUANTITY_EXCEEDS_ELIGIBLE

RETURN_ALREADY_RESOLVED

RETURN_AUTHORIZATION_REQUIRED

RETURN_NOT_RECEIVED

RETURN_INSPECTION_REQUIRED

RETURN_ITEM_MISMATCH

RETURN_RECEIPT_ALREADY_POSTED

RETURN_REFUND_NOT_ELIGIBLE

RETURN_REPLACEMENT_NOT_ALLOWED

RTO_ALREADY_EXISTS

RETURN_VERSION_CONFLICT
```

---

# 198. Required Idempotency

Mandatory for:

```text
CreateRTOCase

PostReturnReceipt

CreateReverseShipment external operation

RequestReturnRefund

CreateReplacementOrder
```

---

# 199. Required Expected-Version Protection

Strongly recommended for:

```text
ApproveReturn

RejectReturn

CancelReturn

ResolveReturnCase

manual inspection/discrepancy resolutions
```

---

# 200. Failure Scenario — Refund Succeeds, Return Lost

Correct:

```text
Refund remains completed

Inventory not restored

COGS not reversed

Return Case records lost reverse shipment

commercial loss remains visible
```

---

# 201. Failure Scenario — Return Received, Refund Provider Down

Correct:

```text
Inventory/cost restoration remains committed

Refund remains pending/failed/unknown

provider outage does not undo physical receipt
```

---

# 202. Failure Scenario — Warehouse Receives Item Before Return Request

Possible customer sends package without authorization.

Create:

```text
UNEXPECTED_RETURN / unmatched receipt workflow
```

rather than discard physical truth.

---

# 203. Unmatched Return Receipt

Recommended foundation:

```text
return_receipt
with return_case_id nullable until resolved
```

or separate:

```text
unmatched_return_receipts
```

---

# 204. V1 Recommendation

Allow controlled:

```text
UNMATCHED Return Receipt
```

with mandatory:

```text
sender/tracking context

actual item

quantity

receiving Location
```

and require resolution before commercial processing.

---

# 205. Why?

Real warehouses will receive:

```text
unannounced parcel

missing RMA/reference

wrong order reference
```

The system must not force staff to create fake Return Request first.

---

# 206. Architecture Leak Found #1

Earlier Return Receipt was assumed to always belong to Return Case.

That is too strict.

Refinement:

> **Physical reverse receipt must be able to exist temporarily without a resolved Return Case.**

This preserves actual warehouse truth.

---

# 207. Architecture Leak Found #2

A Return may contain multiple physical parcels.

Therefore:

```text
Return Case
1 → many Reverse Shipments
1 → many Return Receipts
```

must be first-class.

---

# 208. Architecture Leak Found #3

A single Return Receipt Line can produce multiple dispositions.

Example:

```text
3 units returned
2 sellable
1 damaged
```

Therefore inspection/disposition must be quantity-based, not one enum on Receipt Line.

---

# 209. Architecture Leak Found #4

RTO can occur before or after commercial completion depending Delivery workflow.

Therefore:

```text
RTO
```

alone cannot decide:

```text
COGS reversal

refund requirement

revenue reversal.
```

The Return/Costing/Payments modules must inspect actual prior facts.

---

# 210. Architecture Leak Found #5

Reattempting an RTO Order requires:

```text
new Reservation
+
new Fulfillment
```

rather than reopening the old outbound movement.

This should be enforced in future Delivery/Order commands.

---

# 211. Architecture Leak Found #6

Refund-first returns can legitimately produce:

```text
refunded
but not physically returned
```

for a long time or permanently.

Therefore operational reporting must distinguish:

```text
financially resolved
```

from:

```text
physically resolved.
```

---

# 212. Return Invariants

### RET-INV-001

A Return Request does not modify physical Inventory.

### RET-INV-002

Return Authorization does not modify physical Inventory.

### RET-INV-003

Courier return status alone does not modify warehouse Inventory.

### RET-INV-004

Physical Inventory is restored only through a posted Return Receipt or equivalent canonical physical receiving command.

### RET-INV-005

Returned goods do not become SELLABLE automatically by default.

### RET-INV-006

Inspection and physical receipt remain separate events.

### RET-INV-007

Refund and Return remain separate domains.

### RET-INV-008

Refund completion never automatically implies physical stock restoration.

### RET-INV-009

Physical Return never automatically implies Refund completion.

### RET-INV-010

COGS reversal occurs only when Costing confirms physically restored quantity that had previously recognized COGS.

### RET-INV-011

RTO before COGS recognition restores pending cost without fake COGS reversal.

### RET-INV-012

Returned cost uses original attributable acquisition-cost provenance wherever available.

### RET-INV-013

Return quantity cannot exceed eligible fulfilled quantity under normal workflow.

### RET-INV-014

Multiple partial Returns remain supported.

### RET-INV-015

Wrong/unknown returned items never restore expected SKU inventory automatically.

### RET-INV-016

Return receipt records actual physical truth even when it conflicts with expected Return authorization.

### RET-INV-017

Return disposition is quantity-based.

### RET-INV-018

A Return Receipt can temporarily exist unmatched when goods physically arrive without a resolvable Return Case.

### RET-INV-019

A Return Case may have multiple Reverse Shipments and multiple Receipts.

### RET-INV-020

A replacement/exchange is represented through a new commercial fulfillment/order flow rather than rewriting original sale history.

### RET-INV-021

Original Fulfillment history is never rewritten to pretend the returned goods were never dispatched.

### RET-INV-022

RTO does not resurrect the original Inventory Reservation.

### RET-INV-023

A delivery reattempt creates a new Reservation/Fulfillment.

### RET-INV-024

Return policy changes do not rewrite previously issued Authorization decisions.

### RET-INV-025

Commercial, physical, financial, and cost resolution statuses remain distinguishable.

### RET-INV-026

Provider callback ordering cannot regress a finalized Return state.

### RET-INV-027

Sensitive return evidence remains private unless explicitly reclassified.

### RET-INV-028

Return discrepancies remain visible until explicitly resolved.

### RET-INV-029

Return financial resolution can complete while physical resolution remains open if policy permits.

### RET-INV-030

Every Return-related stock movement remains traceable to its Return Receipt/Disposition.

---

# 213. Mandatory V1 Scope

```text
✓ Return Case

✓ Customer Return

✓ RTO

✓ Return Lines

✓ Controlled Return reasons

✓ Return eligibility

✓ Return authorization

✓ Partial authorization

✓ Authorization expiry

✓ Multiple Reverse Shipments

✓ Reverse shipment tracking

✓ Return Receipt

✓ Multiple Receipts

✓ Unmatched Return Receipt foundation

✓ Receipt discrepancy handling

✓ Wrong-item handling

✓ Unresolved item handling

✓ Inspection

✓ Quantity-level disposition

✓ Sellable Restock

✓ Damaged Restock

✓ Quarantine

✓ Partial Return

✓ Multiple Returns per Order

✓ Refund linkage

✓ Refund-after-inspection default policy

✓ Prepaid RTO refund foundation

✓ COD RTO behavior

✓ Cost restoration

✓ COGS reversal integration

✓ RTO pre-COGS behavior

✓ Replacement/Exchange relationship

✓ Reattempt delivery with new Fulfillment

✓ Notifications

✓ Audit

✓ Integrity checks

✓ Return/RTO analytics
```

---

# 214. Strongly Preferred V1

```text
Return receiving queue

RTO queue

Return aging dashboard

Return discrepancy queue

Inspection workspace

Customer return history

Return reason analytics

RTO by courier/area/payment method

Refund-vs-return reconciliation

Cost restoration status

Replacement-order workflow
```

---

# 215. Explicitly Deferred

```text
Automated return labels across many couriers

Advanced warranty

Repair center workflows

Refurbishment

Restocking fees

Automated return shipping fees

Cross-border returns

Return-to-supplier from customer return

Automated fraud scoring

Serial/lot verification

Photo-based condition AI

Carrier claim automation

Marketplace return integrations
```

---

# 216. Decisions Established

### Decision RET-001

**Customer Returns and RTO are separate Return types.**

### Decision RET-002

**Return Authorization never restores stock.**

### Decision RET-003

**Return Receipt is the canonical reverse physical receiving document.**

### Decision RET-004

**Returned goods enter INSPECTION by default.**

### Decision RET-005

**Inspection determines disposition independently of Refund.**

### Decision RET-006

**Refund execution remains owned by Payments.**

### Decision RET-007

**Cost restoration and COGS reversal remain owned by Costing.**

### Decision RET-008

**RTO does not automatically mean COGS reversal.**

### Decision RET-009

**RTO does not reactivate the original Reservation.**

### Decision RET-010

**A reattempted delivery uses a new Reservation and new Fulfillment.**

### Decision RET-011

**Wrong returned goods do not restore expected Inventory.**

### Decision RET-012

**Return disposition is quantity-based and can split one receipt into multiple outcomes.**

### Decision RET-013

**A Return Case can have multiple reverse shipments and receipts.**

### Decision RET-014

**Physical reverse receipt may temporarily exist unmatched to a Return Case.**

### Decision RET-015

**Exchange is modeled as Return + new replacement commercial flow.**

### Decision RET-016

**Financial, physical, commercial and cost resolution remain separate.**

---

# 217. Schema Refinements Required

Add:

```text
returns.return_cases

returns.return_lines

returns.return_authorizations

returns.reverse_shipments

returns.return_receipts

returns.return_receipt_lines

returns.return_inspections

returns.return_dispositions

returns.return_refund_links

returns.replacement_orders
```

---

# 218. Inventory Refinement

Add Inventory transaction types:

```text
RETURN_RECEIPT

RETURN_CONDITION_CHANGE

RTO_RECEIPT
```

or use one canonical `RETURN_RECEIPT` plus source Return type metadata.

Recommended:

```text
RETURN_RECEIPT
```

with Return Case type carrying Customer Return/RTO distinction.

---

# 219. Costing Refinement

`costing.cogs_reversals.return_reference_id` should become a proper relationship to:

```text
Return Receipt / Disposition
```

rather than generic reference where possible.

---

# 220. Orders Refinement

Add read projections such as:

```text
returned_quantity

return_case_count

active_return_status
```

only as rebuildable summaries.

---

# 221. Payments Refinement

Refund creation can optionally carry:

```text
return_case_id
```

or explicit allocation/link relation without making Return mandatory.

---

# 222. API Refinement

Admin API should add:

```text
/returns

/return-receipts

/return-inspections
```

rather than hiding Returns under:

```text
/orders/{id}/status
```

---

# 223. Architecture Milestone

The outbound/reverse physical lifecycle now becomes:

```text
INVENTORY RESERVATION
        ↓
FULFILLMENT
        ↓
OUTBOUND COST ASSIGNMENT
        ↓
DELIVERY OUTCOME
      ┌─┴──────────────┐
      │                │
      ▼                ▼
SUCCESSFUL           FAILED /
DELIVERY             RTO
      │                │
      ▼                ▼
COGS               REVERSE MOVEMENT
      │                │
CUSTOMER RETURN        ▼
      │            RETURN RECEIPT
      └───────────────►│
                       ▼
                   INSPECTION
                       │
               ┌───────┴────────┐
               ▼                ▼
            SELLABLE         DAMAGED
               │                │
               └───────┬────────┘
                       ▼
                 COST RESTORATION
```

Refunds remain related but independent.

---

# 224. Important Remaining Gap

Returns now makes one missing operational domain impossible to postpone much longer:

# **Delivery & Courier Fulfillment**

We currently have:

```text
Order Fulfillment

Fulfillment posting

Outbound Inventory deduction

Courier integrations foundation

RTO
```

but we have not yet formalized the actual last-mile Delivery lifecycle:

```text
Delivery creation

Courier selection

Delivery method

Shipment/parcel

COD amount

Pickup

Handover

In transit

Out for delivery

Delivery attempt

Delivered

Failed delivery

Customer refusal

Partial delivery

Courier cancellation

Tracking

Courier fees

COD collection

COD settlement

RTO initiation

Provider status mapping

Manual delivery fallback

Rebooking
```

This domain is now necessary because:

```text
Fulfillment
≠
Delivery
```

just as:

```text
Order
≠
Payment
```

and:

```text
Return
≠
Refund.
```

---

# 225. Recommended Next Document

The next source-of-truth document should be:

```text
docs/domains/delivery/delivery-courier-architecture.md
```

Its central principle should be:

> **Fulfillment represents Maevelle's preparation/release of goods; Delivery represents the last-mile movement and customer handoff.**

The lifecycle should conceptually become:

```text
ORDER
  ↓
RESERVATION
  ↓
FULFILLMENT
  ↓
DELIVERY
  ├── Delivered
  │      ↓
  │   Sale/COGS completion
  │
  └── Failed
         ↓
        RTO
         ↓
     Return Receipt
```

That document should finally settle:

```text
Home Delivery

Future Pickup

Courier booking

Pathao/Steadfast adapters

COD

Tracking

Delivery fees

Delivery attempts

Delivery failure

Rebooking

RTO

COD settlement integration

Manual courier fallback

Provider outages

Courier reconciliation
```

After Delivery, we can safely move into the UX/implementation-oriented phase:

```text
Admin Information Architecture
→ Storefront UX Architecture
→ Testing Master Plan
→ Operations Runbooks
→ Implementation Roadmap
```

---

**End of Returns & Reverse Logistics Architecture v0.1**
