# Maevelle Ecommerce — Delivery & Courier Architecture

**Document:** `docs/domains/delivery/delivery-courier-architecture.md`
**Status:** Initial Domain Architecture / Living Document
**Version:** 0.1
**Related:** Orders, Fulfillment, Inventory, Costing, Returns, Payments, Pricing, Finance, Integrations, Notifications, Customers

---

# 1. Purpose

This document defines the lifecycle after Maevelle prepares goods for customer delivery.

It answers:

```text
What is a Delivery?

How is Delivery different from Fulfillment?

How is a Courier Booking represented?

What happens if booking fails?

What happens after courier pickup?

How is tracking normalized?

How are delivery attempts recorded?

When is an Order considered delivered?

When does COGS become recognizable?

How does COD collection work?

How does COD settlement work?

What happens when delivery fails?

When does RTO begin?

How do we rebook a courier?

How does manual courier operation work?

How are lost/damaged parcels handled?

How are provider charges reconciled?
```

---

# 2. Central Principle

> **Fulfillment represents Maevelle releasing prepared goods; Delivery represents movement and handoff to the customer.**

Therefore:

```text
Order
  ↓
Reservation
  ↓
Fulfillment
  ↓
Delivery
  ↓
Customer Outcome
```

---

# 3. Fulfillment ≠ Delivery

Fulfillment owns:

```text
Which Order Lines?

Which quantities?

Which warehouse?

Which inventory reservation?

Which stock movement?
```

Delivery owns:

```text
Where are the goods going?

Who is transporting them?

Which parcel/consignment?

What is the tracking reference?

Has courier pickup happened?

How many delivery attempts occurred?

Were goods actually delivered?

Did delivery fail?

Did RTO begin?
```

---

# 4. Delivery ≠ Courier Booking

This is another important distinction.

A **Delivery** is Maevelle's delivery obligation.

A **Courier Booking** is one external provider execution attempt.

Therefore:

```text
Delivery
   │
   ├── Courier Booking #1
   │       → failed before pickup
   │
   └── Courier Booking #2
           → successful
```

The Delivery remains one business obligation.

---

# 5. Why Separate Them?

Otherwise changing:

```text
Pathao
→ Steadfast
```

would force us to:

```text
delete/recreate Delivery
```

and lose history.

Instead:

```text
same Delivery

new Courier Booking.
```

---

# 6. Delivery ≠ Payment

A courier saying:

```text
DELIVERED
```

does not directly manipulate Payment rows.

Delivery reports:

```text
Customer handoff

COD collection observation
```

Payments decides:

```text
recognized Payment

allocation

settlement
```

---

# 7. Delivery ≠ Return

Delivery failure can initiate:

```text
RTO
```

but reverse movement belongs to:

```text
Returns & Reverse Logistics.
```

---

# 8. Delivery Does Not Own Customer Delivery Price

Customer delivery charge:

```text
Pricing
```

Courier operational charge:

```text
Delivery/provider cost
```

These must remain separate.

Example:

```text
Customer delivery charge:
৳80

Actual courier expense:
৳110
```

Both are legitimate.

---

# 9. V1 Delivery Method

Primary V1 method:

```text
HOME_DELIVERY
```

Future:

```text
CUSTOMER_PICKUP

STORE_PICKUP

LOCKER

THIRD_PARTY_POINT
```

---

# 10. Delivery Method vs Courier

Do not define:

```text
Delivery Method = Pathao
```

Correct:

```text
Delivery Method:
HOME_DELIVERY

Provider:
PATHAO
```

---

# 11. Core Entities

The Delivery domain introduces:

```text
Delivery

Delivery Line

Delivery Address Snapshot

Delivery Package

Courier Booking

Courier Booking Attempt

Delivery Attempt

Delivery Event

Delivery Exception

COD Collection Instruction

Provider Charge

Delivery Claim
```

---

# 12. Delivery

One Delivery represents one planned customer handoff.

Conceptually:

```text
Delivery {
    Order
    Fulfillment
    Delivery Method
    Recipient
    Address Snapshot
    Packages
    Collection Instruction
    Operational Status
    Outcome
}
```

---

# 13. Fulfillment Relationship

V1 recommendation:

```text
Fulfillment
1 → 1 Delivery
```

for ordinary home delivery.

Architecture should not hard-code this forever.

Future:

```text
one Fulfillment
→ multiple packages/deliveries
```

can be introduced.

---

# 14. Split Orders

One Order can have:

```text
Fulfillment A
→ Delivery A

Fulfillment B
→ Delivery B
```

Therefore:

```text
Order
1 → many Deliveries
```

---

# 15. Delivery Line

Delivery should preserve explicit quantities.

```text
Delivery Line
→ Fulfillment Line
→ Quantity
```

This gives us a bridge between:

```text
fulfilled quantity
```

and:

```text
delivery outcome.
```

---

# 16. Delivery Address

Use immutable transaction snapshot.

Do not call:

```text
Customer.current_address
```

when booking a Delivery days later.

---

# 17. Address Snapshot Contains

Conceptually:

```text
Recipient Name

Phone

Address Line

Area

City

District

Postal Code

Country

Directions / Landmark

Coordinates if available

Canonical geography references if resolved
```

---

# 18. Customer Address Change

Customer edits profile after Order.

Existing Delivery remains:

```text
original committed Delivery address
```

unless an explicit Delivery-address amendment occurs.

---

# 19. Delivery Address Amendment

Before courier booking/pickup:

```text
controlled amendment
```

may be allowed.

After booking:

```text
provider update may be required.
```

---

# 20. Address Change After Handover

Do not simply change local database address.

Courier is physically carrying a parcel under old instructions.

Possible outcomes:

```text
provider address update

intercept

delivery exception

RTO + new delivery
```

depending provider capability.

---

# 21. Serviceability

Before selecting/booking a delivery, system must determine:

```text
Can this provider/method serve this destination?
```

---

# 22. Serviceability Is Not a Boolean Forever

A destination may be:

```text
Supported normally

Supported with higher charge

Supported only by some providers

Unsupported for same-day

Temporarily unavailable
```

---

# 23. Delivery Serviceability Context

Potential inputs:

```text
Origin Location

Destination Geography

Weight

Dimensions

Delivery Type

COD requirement

Declared value

Product restrictions

Provider capability
```

---

# 24. Provider Geography Problem

Courier providers frequently use their own:

```text
City ID

Zone ID

Area ID

Hub ID
```

These external IDs must never be stored as Customer-address truth.

---

# 25. Correct Model

```text
Maevelle Address / Geography
        │
        ▼
Provider Geography Mapping
        │
        ▼
Pathao/Steadfast/etc external IDs
```

---

# 26. Provider Geography Mapping

Recommended concept:

```text
delivery.provider_geography_mappings
```

containing:

```text
Integration Account

Local Geography / Service Area

Provider Geography Type

Provider External ID

Provider Name

Status

Last Verified At
```

---

# 27. Never Hard-Code Provider Area IDs

Bad:

```text
customer.address.pathao_zone_id
```

because Customer identity must remain provider-neutral.

---

# 28. Delivery Quote

Before Checkout/order pricing, a Delivery quote may be calculated.

This is not the courier's eventual final invoice.

---

# 29. Delivery Quote vs Provider Charge

### Delivery Quote

Used for:

```text
serviceability

estimated operational cost

customer Pricing input
```

### Provider Charge

Actual or provider-reported operational expense later.

---

# 30. Customer Charge Remains Pricing-Owned

Even if provider quotes:

```text
৳120
```

Maevelle may charge:

```text
৳100
```

or:

```text
free delivery.
```

---

# 31. Package

Delivery may contain one or more Packages.

V1 can usually use:

```text
one Delivery
one Package
```

but first-class Package foundation is valuable.

---

# 32. Why Package?

Courier data commonly depends on:

```text
Weight

Dimensions

Declared value

Content

Tracking number
```

These belong to physical parcel context, not Order itself.

---

# 33. Package Weight

Product weights provide:

```text
estimated shipment weight
```

before packing.

After packing:

```text
actual package weight
```

may differ.

---

# 34. Package Weight Sources

```text
ESTIMATED_FROM_PRODUCTS

MANUAL

MEASURED
```

preserve source.

---

# 35. Packaging Weight

Do not assume:

```text
sum Product weight
=
Courier parcel weight.
```

Packaging material contributes weight.

---

# 36. Missing Product Weight

Should not necessarily block every Delivery.

Operator can provide:

```text
manual package weight.
```

---

# 37. Courier Booking

Represents one provider consignment/request.

Fields conceptually:

```text
Provider

Integration Account

Delivery

External Consignment ID

Merchant Reference

Tracking Number

Booking Status

Requested COD

Package Snapshot

Address Snapshot

Created At
```

---

# 38. One Delivery, Multiple Bookings

Allowed sequentially.

Example:

```text
Booking A:
Steadfast
→ rejected

Booking B:
Pathao
→ booked
```

---

# 39. Active Booking Constraint

Normally:

> Only one active physical courier booking may control a Delivery at once.

Prevent two couriers both arriving to pick up the same parcel.

---

# 40. Booking Status

Normalized:

```text
PENDING

BOOKED

REJECTED

CANCELLED

UNKNOWN_OUTCOME
```

Booking status is not Delivery status.

---

# 41. Booking External Operation

Every API-based Create Booking uses:

```text
Integration Operation
```

before the provider call.

---

# 42. Why?

Provider call can:

```text
succeed externally
```

while Maevelle receives:

```text
timeout.
```

Without an operation record, retry could create duplicate consignments.

---

# 43. Booking State Machine

```text
CreateDelivery
      ↓
Create Courier Booking
      ↓
Persist Integration Operation
      ↓
Call Provider
  ┌───┼─────────────┐
  ▼   ▼             ▼
Success Failure    Timeout
  │   │             │
  ▼   ▼             ▼
BOOKED REJECTED  UNKNOWN_OUTCOME
                    │
                    ▼
                 RECONCILE
```

---

# 44. Unknown Booking Outcome

Never immediately create another provider consignment if the first may have succeeded.

First:

```text
query/reconcile using merchant reference.
```

---

# 45. Provider Without Idempotency

Maevelle uses a stable:

```text
merchant_delivery_reference
```

per booking operation.

Adapters should include it wherever provider permits.

---

# 46. Provider Capability Matrix

Each Courier Adapter declares capabilities.

Example:

```text
CREATE_BOOKING

CANCEL_BEFORE_PICKUP

UPDATE_ADDRESS

UPDATE_COD

TRACK

WEBHOOKS

POLL_STATUS

REVERSE_PICKUP

QUOTE

SERVICEABILITY
```

---

# 47. Why Capability Matrix?

Do not code:

```text
all couriers support update COD
```

because they may not.

---

# 48. Manual Courier Provider

A provider can be:

```text
MANUAL
```

without API credentials.

---

# 49. Manual Delivery Booking

Operator can record:

```text
Courier Name

Tracking Reference

COD amount

Pickup state

Delivery outcome
```

manually.

Same Delivery lifecycle remains.

---

# 50. Manual Fallback

If Pathao/Steadfast API is unavailable:

```text
Delivery remains valid.
```

Operator can:

```text
book through provider panel/phone

record external reference

continue tracking manually
```

---

# 51. API Outage Must Not Force Fake Delivery

Never:

```text
mark BOOKED
```

only to move workflow forward.

Use:

```text
BOOKING_FAILED
or
MANUAL_BOOKING_REQUIRED.
```

---

# 52. Delivery Operational Status

Recommended:

```text
DRAFT

READY

BOOKING

BOOKED

PICKUP_PENDING

HANDED_OVER

IN_TRANSIT

OUT_FOR_DELIVERY

DELIVERED

FAILED

CANCELLED
```

---

# 53. Important Meaning

`BOOKED` means:

```text
Provider accepted consignment.
```

It does not mean:

```text
goods left warehouse.
```

---

# 54. HANDED_OVER

Canonical point when Maevelle/courier handoff is confirmed.

Depending operation:

```text
provider pickup event

warehouse handover scan

manual confirmation
```

may establish it.

---

# 55. Inventory Movement Relationship

Inventory stock is already deducted when:

```text
Fulfillment is posted
```

under our previous architecture.

Therefore Delivery handover does not deduct Inventory again.

---

# 56. Costing Relationship

PostFulfillment creates:

```text
Outbound Cost Assignment
```

Delivery later supplies the customer-outcome trigger for:

```text
COGS Recognition

or

RTO restoration.
```

---

# 57. Delivery Outcome

Separate normalized outcome:

```text
PENDING

DELIVERED

FAILED

CANCELLED_BEFORE_HANDOVER

LOST

DAMAGED
```

---

# 58. Why Separate Outcome?

Operational status can progress through:

```text
BOOKED
PICKED UP
IN TRANSIT
```

while outcome remains:

```text
PENDING.
```

---

# 59. Successful Delivery

A Delivery becomes `DELIVERED` only from sufficiently trusted evidence.

Possible sources:

```text
authenticated provider event

provider reconciliation API

authorized manual confirmation
```

---

# 60. Manual Delivered Override

Should be allowed only with:

```text
delivery.outcome.override
```

and:

```text
reason

evidence/reference

audit.
```

---

# 61. Delivered Effect

Successful Delivery triggers:

```text
DeliveryDelivered
```

which allows:

```text
Orders/Fulfillment commercial completion

Costing RecognizeCOGS

Payments COD recognition if applicable

Notifications

Analytics
```

---

# 62. Delivered Does Not Automatically Mean Order Completed

An Order may have:

```text
Delivery A delivered

Delivery B pending.
```

Order completion is derived from all required fulfillment/commercial conditions.

---

# 63. Delivery Attempts

A courier may attempt customer handoff multiple times.

Represent each separately.

---

# 64. Delivery Attempt

Conceptually:

```text
attempt_number

attempted_at

outcome

failure_reason

provider_event

notes

next_attempt_expected
```

---

# 65. Attempt Outcomes

```text
DELIVERED

CUSTOMER_UNAVAILABLE

CUSTOMER_REFUSED

ADDRESS_NOT_FOUND

RESCHEDULE_REQUESTED

PHONE_UNREACHABLE

PROVIDER_FAILURE

OTHER_FAILED
```

---

# 66. Failed Attempt ≠ Failed Delivery

Example:

```text
Attempt 1:
Customer unavailable

Attempt 2:
Delivered
```

Delivery outcome:

```text
DELIVERED.
```

---

# 67. Delivery Failure

Delivery becomes finally failed only when:

```text
provider declares return/failure

business gives up attempts

parcel cannot be delivered

parcel lost/destroyed
```

according to policy.

---

# 68. Failure Reason

Controlled taxonomy:

```text
CUSTOMER_REFUSED

CUSTOMER_UNAVAILABLE

INVALID_ADDRESS

PHONE_UNREACHABLE

CUSTOMER_CANCELLED

PROVIDER_CANCELLED

SERVICE_AREA_FAILURE

LOST

DAMAGED

BUSINESS_CANCELLED

OTHER
```

---

# 69. Do Not Automatically Blame Customer

Provider status:

```text
customer unreachable
```

is an operational signal, not permanent fraud truth.

Customer/Risk domain may use facts later.

---

# 70. Delivery Cancellation

Before physical handover:

```text
Delivery may be cancelled.
```

---

# 71. Cancellation After Handover

You cannot cancel physical reality.

Use:

```text
intercept

delivery failure

RTO
```

workflow.

---

# 72. Provider Booking Cancellation

If provider booking is cancelled before pickup:

```text
Delivery may return to READY
```

and be rebooked.

---

# 73. Rebooking Before Handover

Same:

```text
Delivery
```

new:

```text
Courier Booking.
```

---

# 74. Rebooking After RTO

Different case.

Goods physically left and came back.

Prior design requires:

```text
new Reservation
+
new Fulfillment
+
new Delivery.
```

Do not reuse old Delivery.

---

# 75. Tracking

Delivery maintains normalized timeline while preserving provider raw history.

---

# 76. Provider Raw Events

Stored in:

```text
Integrations inbound_provider_events
```

and optionally provider-specific delivery mapping.

---

# 77. Normalized Delivery Events

Examples:

```text
BOOKED

PICKUP_ASSIGNED

PICKED_UP

IN_TRANSIT

AT_DESTINATION_HUB

OUT_FOR_DELIVERY

DELIVERY_ATTEMPTED

DELIVERED

FAILED

RETURN_STARTED
```

---

# 78. Provider Status ≠ Domain Status

Adapters map:

```text
Pathao status X
Steadfast status Y
```

to:

```text
normalized Delivery event.
```

Core Delivery never branches on:

```text
if provider == PATHAO
```

for business lifecycle.

---

# 79. Out-of-Order Provider Events

Provider sends:

```text
DELIVERED
```

then stale:

```text
IN_TRANSIT.
```

Delivery must not regress.

---

# 80. Provider Event Timestamp

Preserve both:

```text
provider_occurred_at

received_at
```

---

# 81. Polling Fallback

If provider has:

```text
no webhook
```

or webhook is unreliable:

```text
periodic reconciliation
```

can query active Deliveries.

---

# 82. Webhook + Poll Race

Both can discover same transition.

Idempotent event processing must create:

```text
one normalized business effect.
```

---

# 83. Reconciliation Priority

Poll heavily only for:

```text
active

stale

unknown-outcome

financially significant
```

Deliveries.

Do not poll every historical Delivery forever.

---

# 84. Stale Tracking Detection

Example:

```text
IN_TRANSIT
for unusually long duration
```

creates:

```text
Delivery Exception
```

rather than guessing status.

---

# 85. Delivery Exception

First-class operational problem.

Examples:

```text
TRACKING_STALE

ADDRESS_PROBLEM

PROVIDER_REJECTED

COD_MISMATCH

LOST_PARCEL

DAMAGED_PARCEL

UNKNOWN_EXTERNAL_OUTCOME

UNMATCHED_PROVIDER_STATUS

PROVIDER_AUTH_FAILURE
```

---

# 86. Exception Status

```text
OPEN

INVESTIGATING

RESOLVED

IGNORED_WITH_REASON
```

---

# 87. Exceptions Don't Necessarily Change Delivery Outcome

Example:

```text
tracking stale
```

can later resolve to:

```text
delivered.
```

---

# 88. COD

COD is one of the most important Delivery/Payment boundaries.

---

# 89. COD Collection Instruction

Delivery may carry:

```text
amount_to_collect
```

as an instruction to courier.

This is not yet a Payment.

---

# 90. Why Separate?

Before customer pays:

```text
Expected COD:
৳1,500
```

After handoff:

```text
Actual Collected:
৳1,500
```

Later:

```text
Provider Settlement:
৳1,430
```

after fees/deductions.

These are three separate truths.

---

# 91. COD Model

```text
Order Amount Due
        ↓
COD Collection Instruction
        ↓
Provider Customer Collection
        ↓
Confirmed COD Payment
        ↓
Provider Settlement
        ↓
Financial Account Cash Receipt
```

---

# 92. Delivery COD Instruction

Conceptually:

```text
expected_collection_amount

currency

collection_status

instruction_version
```

---

# 93. COD Amount Source

Payments/Pricing calculates:

```text
amount still intended for courier collection.
```

Delivery does not invent it.

---

# 94. Split Deliveries and COD

Order:

```text
৳3,000
```

with two Deliveries cannot both receive:

```text
COD ৳3,000
```

unless intentionally collecting twice.

---

# 95. COD Allocation

Payment/Order application must explicitly allocate collection instruction across Deliveries.

Example:

```text
Delivery A:
৳1,200

Delivery B:
৳1,800
```

---

# 96. V1 Simplification

Where possible, for COD Orders:

> Prefer one active COD Delivery per Order.

But the underlying model must not depend on this forever.

---

# 97. Digital Payment After Courier Booking

Major race:

```text
COD Delivery booked:
collect ৳1,500

Customer pays bKash:
৳1,500
```

Now courier must not collect again.

---

# 98. Required Behavior

System must detect:

```text
payment changed amount due
```

and evaluate active Delivery collection instruction.

---

# 99. If Provider Supports COD Update

Create:

```text
UpdateCourierCollectionInstruction
```

Integration Operation.

---

# 100. If Provider Does Not Support Update

Possible safe actions:

```text
cancel/rebook before pickup

operator intervention

contact courier

mark COLLECTION_CHANGE_UNRESOLVED
```

---

# 101. After Handover

Changing COD becomes high-risk.

Never pretend local amount changed successfully until provider confirms.

---

# 102. COD Instruction Version

Preserve:

```text
local expected amount

provider confirmed amount

last synchronization state.
```

---

# 103. COD Sync Status

```text
NOT_REQUIRED

PENDING_SYNC

SYNCED

SYNC_FAILED

UNKNOWN_OUTCOME

MANUAL_ACTION_REQUIRED
```

---

# 104. COD Customer Collection Observation

Provider says:

```text
Delivered
Collected ৳1,500
```

Delivery records provider observation.

---

# 105. Payment Recognition

Trusted provider collection event can trigger:

```text
Payments.RecordProviderCODCollection
```

Payments creates confirmed Payment under provider-specific trust policy.

---

# 106. COD Amount Mismatch

Expected:

```text
৳1,500
```

Provider reports:

```text
৳1,300
```

Do not convert Delivery to:

```text
fully financially settled.
```

Instead:

```text
Delivery outcome:
DELIVERED

Payment:
৳1,300

Order balance:
৳200

COD reconciliation issue:
OPEN
```

---

# 107. Delivered ≠ Settled

Customer could have paid courier.

Maevelle may not yet have received provider remittance.

---

# 108. COD Settlement

Payments owns:

```text
Settlement Batch

Settlement Line

Reconciliation.
```

Delivery supplies:

```text
Delivery

Collection observation

Courier reference

Provider fee context
```

---

# 109. Provider Settlement Example

```text
Customer collected:
৳1,500

Delivery fee:
৳70

COD fee:
৳15

Other deduction:
৳0

Merchant settlement:
৳1,415
```

Do not record:

```text
Payment = ৳1,415.
```

Correct:

```text
Customer Payment:
৳1,500

Provider Fees:
৳85

Cash Settlement:
৳1,415
```

---

# 110. Provider Charge

Delivery should preserve operational charge information.

Concepts:

```text
Estimated Provider Charge

Actual Provider Charge

Charge Components

Currency

Source

Provider Invoice/Settlement reference
```

---

# 111. Charge Components

Examples:

```text
DELIVERY_FEE

COD_FEE

WEIGHT_SURCHARGE

RETURN_FEE

REMOTE_AREA_FEE

OTHER
```

---

# 112. Provider Charge Is Not Customer Price

Never use:

```text
provider actual fee
```

to retroactively recalculate customer Order delivery amount.

---

# 113. Delivery Provider Expense

Finance can create/reconcile expense from actual provider charges.

Delivery remains source of operational cost details.

---

# 114. Duplicate Expense Prevention

If settlement includes:

```text
Delivery Fee
```

and provider invoice also imports it:

```text
same economic fee
```

must not be counted twice.

Source references/reconciliation required.

---

# 115. Successful Delivery & COGS

`DeliveryDelivered`

is the normal V1 trigger indicating customer handoff occurred.

Costing then evaluates eligible Outbound Cost Assignments and performs:

```text
RecognizeCOGS.
```

---

# 116. Partial Commercial Success

If Delivery contains several packages and only some are delivered:

```text
recognize COGS
only for successfully handed-off quantities.
```

---

# 117. V1 Parcel Atomicity

Recommended V1:

> Treat one courier parcel/consignment as operationally atomic for delivery outcome unless the provider/business workflow explicitly supports item-level partial acceptance.

This avoids inventing item-level delivery truth from provider statuses that do not provide it.

---

# 118. If Partial Customer Acceptance Becomes Required

Represent explicit:

```text
Delivered Quantity

Reverse Quantity
```

per Delivery Line/Package.

Never just mark Delivery:

```text
PARTIAL
```

without quantities.

---

# 119. Delivery Failure & Costing

Failed delivery does not automatically produce COGS.

Outbound cost remains:

```text
PENDING_SALE_OUTCOME
```

until:

```text
RTO restoration

confirmed loss

other final disposition.
```

---

# 120. RTO Initiation

Delivery failure may request:

```text
CreateRTOCase
```

in Returns domain.

---

# 121. RTO Relationship

```text
Delivery
   ↓
RTO Return Case
```

Delivery does not manage the reverse stock receipt itself.

---

# 122. RTO Provider Status

Courier reports:

```text
RETURNING
```

Delivery/adapter triggers or updates RTO Case.

---

# 123. RTO Received

Courier saying:

```text
returned to merchant
```

does not directly restore Inventory.

Returns requires:

```text
Return Receipt.
```

---

# 124. RTO Cost

Outbound cost remains pending until physical reverse receipt or confirmed loss/disposition.

---

# 125. RTO Fee

Courier may charge return fee.

This becomes:

```text
Provider Charge
```

and later Finance expense.

---

# 126. Prepaid RTO

Delivery failure + RTO can require:

```text
Refund
```

because Customer already paid.

Returns/Payments handle commercial refund.

---

# 127. COD RTO

Usually:

```text
Customer Payment = none
```

but operational costs still exist:

```text
forward fee

return fee.
```

---

# 128. Lost Delivery

Provider confirms parcel lost before customer handoff.

Correct:

```text
Delivery outcome:
LOST
```

---

# 129. Inventory Cost Effect of Loss

Costing recognizes:

```text
Inventory Loss
```

not:

```text
COGS.
```

---

# 130. Customer Financial Effect

If prepaid:

```text
Refund may be required.
```

If COD:

```text
no Customer Payment exists.
```

---

# 131. Provider Compensation

Provider may owe:

```text
claim compensation.
```

That is not:

```text
negative COGS.
```

It is a separate provider receivable/financial recovery.

---

# 132. Delivery Claim

Strongly recommended foundation:

```text
delivery.delivery_claims
```

---

# 133. Claim Reasons

```text
LOST

DAMAGED

INCORRECT_SETTLEMENT

OTHER
```

---

# 134. Claim Lifecycle

```text
DRAFT

SUBMITTED

UNDER_REVIEW

APPROVED

PARTIALLY_APPROVED

REJECTED

PAID

CLOSED
```

---

# 135. Claim Amount

Preserve:

```text
Claimed Amount

Approved Amount

Received Amount
```

separately.

---

# 136. Provider Compensation

Finance records actual:

```text
receivable/cash recovery
```

when appropriate.

Delivery Claim owns operational provider dispute.

---

# 137. Damaged In Transit

Possible outcomes:

```text
delivered damaged to customer

returned damaged to Maevelle

destroyed/lost
```

Do not map all into one status.

---

# 138. Delivered Damaged

Delivery may technically succeed.

Customer may then create:

```text
Customer Return
```

or receive goodwill Refund.

---

# 139. Returned Damaged

RTO/Return Receipt records actual condition.

---

# 140. Destroyed Parcel

Once confirmed permanently unavailable:

```text
Costing inventory loss
```

can be recognized.

---

# 141. Customer Contact Attempts

Delivery provider may expose attempts.

Do not store unnecessary sensitive call data.

Preserve operational events such as:

```text
phone unreachable
customer requested reschedule.
```

---

# 142. Reschedule

A Delivery can remain active after:

```text
RESCHEDULE_REQUESTED.
```

No new Delivery necessarily required.

---

# 143. Address Correction During Attempt

Provider capability-dependent.

All change attempts must be:

```text
audited

synchronized

outcome-tracked.
```

---

# 144. Delivery Instructions

Snapshot:

```text
Landmark

Direction

Special instruction

Allowed contact notes
```

for provider.

Avoid sending unrelated Customer Notes.

---

# 145. Data Minimization

Provider receives only information necessary for Delivery.

Do not send:

```text
Customer lifetime value

internal tags

fraud notes

other Orders.
```

---

# 146. Tracking Public Access

Storefront may expose:

```text
Delivery status

tracking reference

customer-safe events.
```

---

# 147. Do Not Expose Raw Provider Payload

Customer-facing tracking DTO uses normalized safe events.

---

# 148. Admin Tracking Workspace

Can show:

```text
Normalized status

Provider raw status

Latest provider sync

Tracking

Attempts

Exceptions

COD status

Settlement status

RTO relationship
```

---

# 149. Delivery Timeline

Example:

```text
Fulfillment Posted
Courier Booking Requested
Courier Booking Confirmed
Picked Up
In Transit
Out for Delivery
Delivery Attempt Failed
Rescheduled
Delivered
COD Collected
```

---

# 150. Timeline ≠ Audit

Timeline is operational.

Audit records actor/change evidence.

---

# 151. Delivery Number

Human-readable:

```text
DLV-2026-000123
```

Separate from:

```text
provider tracking number.
```

---

# 152. Provider Tracking Number Not Globally Unique

Uniqueness should usually be scoped by:

```text
Integration Account
+
Provider
+
Tracking/External ID.
```

---

# 153. Merchant Reference

Maevelle-generated stable reference:

```text
delivery/booking ID-derived reference
```

sent to provider when supported.

---

# 154. Delivery Data Model

Recommended schema:

```text
delivery
```

---

# 155. `delivery.delivery_methods`

Conceptually:

```text
id
organization_id
code
name
method_type
status
customer_visibility
configuration
version
```

V1:

```text
HOME_DELIVERY
```

---

# 156. `delivery.deliveries`

```text
id
organization_id
delivery_number
order_id
fulfillment_id
delivery_method_id

operational_status
outcome_status

recipient_name
recipient_phone

address_snapshot_json
service_area_id NULL

currency_code

cod_required
cod_expected_amount

created_at
ready_at
handed_over_at NULL
delivered_at NULL
failed_at NULL

version
```

---

# 157. Why Address JSON Snapshot Here?

Stable address fields could be columns.

A bounded structured snapshot is also reasonable because:

```text
Order Address remains relational authority/history

Delivery needs provider-ready point-in-time snapshot.
```

Exact DDL can choose typed columns + small JSON metadata.

---

# 158. `delivery.delivery_lines`

```text
id
organization_id
delivery_id
fulfillment_line_id
order_line_id
quantity
delivered_quantity
failed_quantity
version
```

For V1 atomic parcel:

```text
delivered or failed quantities normally equal full line quantity.
```

---

# 159. `delivery.delivery_packages`

```text
id
organization_id
delivery_id
package_number

weight_value
weight_unit
weight_source

length_value NULL
width_value NULL
height_value NULL
dimension_unit NULL

declared_value NULL
currency_code NULL

status
version
```

---

# 160. `delivery.delivery_package_lines`

```text
package_id
delivery_line_id
quantity
```

---

# 161. `delivery.courier_bookings`

```text
id
organization_id
delivery_id
integration_account_id NULL
provider_code
booking_sequence

status

merchant_reference

external_consignment_id NULL
tracking_number NULL

requested_cod_amount
provider_confirmed_cod_amount NULL

package_snapshot_json
address_snapshot_json

created_at
booked_at NULL
cancelled_at NULL

version
```

---

# 162. Booking Sequence

Example:

```text
Delivery X

Booking 1 → failed
Booking 2 → successful
```

---

# 163. Active Booking Constraint

At most one active Booking per Delivery where:

```text
status IN (
  PENDING,
  BOOKED
)
```

unless deliberate exceptional provider transition.

---

# 164. `delivery.delivery_events`

```text
id
organization_id
delivery_id
courier_booking_id NULL

event_type
provider_status_raw NULL

provider_event_id NULL

occurred_at
received_at

source
metadata_json
```

Append-oriented.

---

# 165. `delivery.delivery_attempts`

```text
id
organization_id
delivery_id
courier_booking_id
attempt_number
attempted_at
outcome
reason_code NULL
notes NULL
provider_event_id NULL
```

Unique:

```text
delivery_id
attempt_number
```

---

# 166. `delivery.cod_collection_instructions`

Recommended separate historical entity.

```text
id
organization_id
delivery_id
version_number
currency_code
expected_amount
status
source_payment_state_version
created_at
provider_synced_at NULL
```

---

# 167. Why Historical Instruction Versions?

Example:

```text
v1 COD:
৳1,500

Customer partial payment:
৳500

v2 COD:
৳1,000
```

We need to know exactly what the provider had been instructed at each point.

---

# 168. `delivery.provider_collection_observations`

```text
id
organization_id
delivery_id
courier_booking_id

currency_code
reported_collected_amount

provider_event_id/reference
observed_at

payment_id NULL
reconciliation_status
```

---

# 169. Payment Link

Payment ID is populated after Payments recognizes/reconciles collection.

---

# 170. `delivery.provider_charges`

```text
id
organization_id
delivery_id
courier_booking_id

charge_type

estimate_or_actual
currency_code
amount

provider_reference NULL
settlement_line_id NULL
source
created_at
```

---

# 171. Avoid Duplicate Charge Authority

If Payments Settlement is authoritative for actual provider deduction:

```text
Delivery charge record should reference it
```

rather than separately pretending to be financial cash truth.

---

# 172. `delivery.delivery_exceptions`

```text
id
organization_id
delivery_id
courier_booking_id NULL

exception_type
severity
status

summary
details_json

detected_at
resolved_at NULL
resolved_by NULL

version
```

---

# 173. `delivery.delivery_claims`

```text
id
organization_id
delivery_id
courier_booking_id

claim_number
claim_type
status

claimed_amount
approved_amount NULL
received_amount NULL
currency_code

provider_claim_reference NULL

created_at
submitted_at NULL
resolved_at NULL

version
```

---

# 174. Provider Geography Mapping

Recommended:

```text
delivery.provider_geography_mappings
```

---

# 175. Geography Mapping Fields

```text
id
organization_id
integration_account_id

local_geography_type
local_geography_id

provider_geography_type
provider_external_id
provider_name

status
last_verified_at
```

---

# 176. Provider Capability Configuration

Recommended:

```text
delivery.provider_capabilities
```

as integration-derived cached/read configuration, not manually authoritative if provider adapter code knows capability.

Could live in:

```text
Integration Provider Definition
```

instead of DB if static.

---

# 177. Application Commands

Recommended:

```text
CreateDelivery

PrepareDelivery

UpdateDeliveryAddress

CreateCourierBooking

ReconcileCourierBooking

CancelCourierBooking

RecordManualCourierBooking

RecordCourierHandover

RecordDeliveryEvent

RecordDeliveryAttempt

MarkManualDeliveryOutcome

UpdateCODCollectionInstruction

ReconcileCODInstruction

RecordProviderCODCollection

RecordProviderCharge

ResolveDeliveryException

CreateDeliveryClaim

UpdateDeliveryClaim

InitiateRTO

RebookDelivery
```

---

# 178. `CreateDelivery`

Normally called from:

```text
Create/Post Fulfillment
```

according to workflow.

Checks:

```text
Fulfillment

Delivery Method

Address

quantity

Order state.
```

---

# 179. Creation Timing

Recommended:

> Create Delivery when Fulfillment is finalized/prepared for outbound shipment, before external courier booking.

---

# 180. `PrepareDelivery`

Calculates/snapshots:

```text
Address

Package

Weight

COD Instruction

Serviceability context.
```

---

# 181. `CreateCourierBooking`

Checks:

```text
Delivery READY

no conflicting active booking

provider active

serviceability

required provider geography

package details

COD state.
```

---

# 182. External Booking Flow

```text
BEGIN

lock Delivery

create Courier Booking PENDING

create Integration Operation

Outbox/Job

COMMIT
```

Then Worker:

```text
Execute Provider Booking
```

outside long DB transaction.

---

# 183. Why Async Booking?

External provider latency/outage should not hold:

```text
inventory/order transaction locks.
```

---

# 184. Immediate Admin UX

Admin sees:

```text
BOOKING
```

then:

```text
BOOKED
```

or exception.

---

# 185. Synchronous Option

If provider is fast/reliable, API may wait briefly for job outcome for UX.

But durable Integration Operation remains the correctness mechanism.

---

# 186. `ReconcileCourierBooking`

Used when:

```text
UNKNOWN_OUTCOME

provider callback missing

manual discrepancy.
```

---

# 187. `CancelCourierBooking`

Allowed only according to provider/current physical state.

---

# 188. Cancel Failure

If provider refuses cancellation because parcel already picked up:

```text
Delivery does not become cancelled.
```

Open exception/intercept/RTO flow.

---

# 189. `RecordCourierHandover`

Can originate from:

```text
Provider pickup webhook

Operator scan

Manual confirmation
```

---

# 190. `RecordDeliveryEvent`

Provider adapter submits normalized event.

Handler:

```text
deduplicates

checks state progression

updates Delivery

creates attempt if needed

triggers secondary domain actions.
```

---

# 191. `RecordDeliveryAttempt`

One actual customer handoff attempt.

---

# 192. `MarkManualDeliveryOutcome`

Only for:

```text
manual provider

provider reconciliation failure

approved operational correction.
```

Audit required.

---

# 193. `UpdateCODCollectionInstruction`

Coordinates:

```text
Payments amount due
+
Delivery
+
Integration.
```

---

# 194. Updating COD Must Be Idempotent

Same payment event should not submit multiple provider updates.

---

# 195. `RecordProviderCODCollection`

Delivery records observation.

Payments decides financial recognition.

---

# 196. `InitiateRTO`

Creates/links:

```text
Returns RTO Case
```

exactly once.

---

# 197. `RebookDelivery`

Only before physical handover or after provider cancellation without parcel movement.

After RTO:

```text
new Fulfillment / Delivery.
```

---

# 198. Queries

Recommended:

```text
ListDeliveries

GetDeliveryWorkspace

GetDeliveryTracking

GetDeliveryServiceability

GetDeliveryQuote

ListReadyForBooking

ListBookingFailures

ListDeliveryExceptions

ListStaleDeliveries

ListCODReconciliationIssues

GetDeliveryCODSummary

GetProviderPerformance

GetProviderChargeSummary

GetRTOCandidates

GetDeliveryClaims

GetDeliveryIntegrationHealth
```

---

# 199. Admin Delivery Workspace

One screen should combine:

```text
Order

Fulfillment

Recipient

Address

Package

Provider

Booking

Tracking

Attempts

COD

Provider charges

Settlement summary

Exceptions

RTO

Claim

Timeline
```

---

# 200. Storefront Tracking

Customer-safe view:

```text
Confirmed

Prepared

Handed to courier

In transit

Out for delivery

Delivered

Delivery issue
```

Avoid raw provider/internal financial details.

---

# 201. Permissions

Potential:

```text
delivery.view

delivery.create

delivery.book

delivery.cancel_booking

delivery.rebook

delivery.update_address

delivery.record_manual_status

delivery.override_outcome

delivery.cod.manage

delivery.exceptions.manage

delivery.claims.manage

delivery.cost.view

delivery.integrations.manage
```

---

# 202. High-Risk Permissions

Require stronger capability for:

```text
Delivered manual override

COD amount override after handover

Lost parcel manual confirmation

Provider charge correction
```

---

# 203. Delivery API Endpoints — Admin

Recommended:

```text
GET  /api/admin/v1/deliveries
GET  /api/admin/v1/deliveries/{id}

POST /api/admin/v1/fulfillments/{id}/delivery

POST /api/admin/v1/deliveries/{id}/prepare

POST /api/admin/v1/deliveries/{id}/courier-bookings

POST /api/admin/v1/courier-bookings/{id}/cancel
POST /api/admin/v1/courier-bookings/{id}/reconcile

POST /api/admin/v1/deliveries/{id}/manual-booking

POST /api/admin/v1/deliveries/{id}/handover

POST /api/admin/v1/deliveries/{id}/attempts

POST /api/admin/v1/deliveries/{id}/cod-instructions

POST /api/admin/v1/deliveries/{id}/rto

POST /api/admin/v1/deliveries/{id}/exceptions/{exceptionId}/resolve

POST /api/admin/v1/deliveries/{id}/claims
```

---

# 204. Serviceability API

Admin/internal:

```text
POST /api/admin/v1/delivery/serviceability
```

Storefront:

```text
POST /api/storefront/v1/delivery/options
```

depending Checkout design.

---

# 205. Serviceability Request

Conceptually:

```json
{
  "destination": {
    "district": "...",
    "area": "..."
  },
  "cart_id": "..."
}
```

Server resolves provider/method/rate options.

---

# 206. Customer Does Not Select Courier Provider Necessarily

Storefront can offer:

```text
Standard Delivery

Same Day
```

while Maevelle selects the actual courier.

This keeps provider selection operational.

---

# 207. Provider Exposure

If business wants:

```text
Delivered by Pathao
```

it can be displayed.

But Checkout architecture should not require customer to understand courier providers unless deliberately desired.

---

# 208. Integration Adapter Interface

Conceptually:

```text
CourierAdapter {
    getCapabilities()

    resolveGeography()

    checkServiceability()

    quote()

    createBooking()

    getBooking()

    cancelBooking()

    updateAddress()

    updateCOD()

    getTracking()

    reconcile()

    createReversePickup()
}
```

Each operation may return:

```text
SUPPORTED
UNSUPPORTED
```

via capability interface.

---

# 209. Adapter Never Writes Domain Tables

Adapter:

```text
Provider HTTP
→ normalized result
```

Application service performs domain mutation.

---

# 210. Adapter Error Categories

Normalize:

```text
AUTHENTICATION_FAILED

VALIDATION_REJECTED

NOT_SERVICEABLE

RATE_LIMITED

PROVIDER_UNAVAILABLE

TIMEOUT_UNKNOWN_OUTCOME

NOT_FOUND

CONFLICT

UNSUPPORTED_OPERATION

MALFORMED_PROVIDER_RESPONSE
```

---

# 211. Provider Raw Errors

Stored securely for diagnosis.

Not returned directly to Storefront.

---

# 212. Provider Authentication Failure

Integration state becomes:

```text
ERROR / AUTH_REQUIRED
```

affected bookings stop/retry appropriately.

---

# 213. Provider Rate Limit

Respect:

```text
Retry-After/backoff.
```

Do not hammer provider.

---

# 214. Provider Outage

Expected:

```text
Orders continue

Fulfillment may continue

Delivery booking queues

Admin sees provider degraded

Manual fallback available
```

according to operational decision.

---

# 215. Provider Outage During Checkout

Storefront should not necessarily become unavailable.

If Delivery pricing/serviceability can use cached/local policy:

```text
Checkout can continue
```

within safe freshness policy.

If real-time provider quote is mandatory and unavailable:

```text
Delivery option becomes temporarily unavailable.
```

Never fabricate a quote.

---

# 216. Provider Outage After Order

Order remains valid.

Delivery booking:

```text
pending/retry/manual fallback.
```

---

# 217. Multi-Provider Fallback

Potential rule:

```text
Preferred Provider A fails
→ suggest Provider B
```

But V1 should not automatically create Provider B booking if Provider A outcome is unknown.

---

# 218. Safe Failover

Only after:

```text
Provider A confirmed failure/rejection
```

may automatic Provider B booking be considered.

---

# 219. Unknown Outcome Blocks Automatic Failover

Because:

```text
A may already have created consignment.
```

---

# 220. Delivery Lost After Provider Pickup

System should know:

```text
goods no longer in warehouse

customer has not received

cost remains pending outbound

Delivery exception open.
```

---

# 221. Confirmed Loss Resolution

Once provider/manual investigation establishes permanent loss:

```text
Delivery outcome = LOST

Costing → Inventory Loss

Returns → no RTO receipt expected

Payments → refund if needed

Delivery Claim → possible
```

---

# 222. Provider Later Finds Parcel

After Loss was confirmed:

```text
do not silently flip to normal delivery.
```

Create controlled recovery event.

Possible:

```text
return to merchant

redelivery
```

requires operational resolution.

---

# 223. Double Delivery Problem

Two active courier bookings accidentally collect duplicated packages.

Prevent through:

```text
one active booking constraint

package identity

handover controls.
```

If it still occurs:

```text
critical Delivery Exception.
```

---

# 224. Handover Verification

Strongly preferred:

```text
handover scan / reference / provider pickup confirmation
```

rather than manually clicking:

```text
Picked Up
```

without evidence.

---

# 225. Package Identity

Recommended label includes:

```text
Delivery Number

Package Number

Order Number

recipient-safe data

barcode/QR
```

without exposing secrets.

---

# 226. Scanning

Future-friendly:

```text
Prepare Package

Scan for Handover

Scan Return Receipt
```

gives physical control points.

---

# 227. COD Tampering Risk

Client/admin request cannot simply send:

```text
cod_amount = 1
```

during booking.

Amount is resolved from approved:

```text
COD Collection Instruction.
```

---

# 228. Manual COD Override

Requires:

```text
delivery.cod.override

reason

expected Payment state

audit.
```

---

# 229. COD Over-Collection

Expected:

```text
৳1,500
```

Provider reports:

```text
৳1,700
```

Payment recognizes actual:

```text
৳1,700
```

with:

```text
৳200 unallocated/customer credit
```

and reconciliation issue.

Never discard the excess.

---

# 230. COD Under-Collection

Actual Payment remains lower.

Order Balance remains.

---

# 231. COD Collected But Delivery Marked Failed

This is inconsistent.

Create:

```text
CRITICAL COD/Delivery reconciliation issue
```

unless provider has specific legitimate semantics.

---

# 232. Delivered With Zero COD

Valid for:

```text
prepaid Order

zero-value Order

COD instruction legitimately updated to zero.
```

---

# 233. Provider Charge Estimate vs Actual

Keep both.

Example:

```text
Estimated:
৳70

Actual:
৳90
```

Variance:

```text
৳20.
```

---

# 234. Charge Variance Analytics

Useful for:

```text
Courier profitability

delivery pricing policy

provider selection.
```

---

# 235. Delivery SLA

Track:

```text
booking to pickup

pickup to delivery

attempt count

delivery cycle time
```

---

# 236. SLA Is Reporting, Not State Truth

Late Delivery remains:

```text
IN_TRANSIT
```

plus:

```text
SLA_BREACH exception
```

rather than a fake status:

```text
LATE.
```

---

# 237. Delivery Analytics

Core metrics:

```text
Deliveries Created

Booking Success Rate

Pickup Success

Delivered Rate

First-Attempt Delivery Rate

Average Attempts

Delivery Failure Rate

RTO Rate

Lost Rate

Average Delivery Time

Provider Cost

COD Collected

COD Mismatch

Settlement Lag

Provider Performance
```

---

# 238. Delivered Rate Denominator

Metric catalog must specify.

Example:

```text
Delivered Finalized Deliveries
/
All Finalized Deliveries
```

not arbitrary Orders.

---

# 239. First-Attempt Rate

```text
Deliveries delivered on attempt #1
/
Deliveries with at least one attempt
```

---

# 240. Provider Comparison

Must control for:

```text
geography

service type

weight

COD/prepaid

period
```

where analysis requires fairness.

---

# 241. COD Settlement Lag

```text
Provider Customer Collection Time
→ Merchant Settlement Time
```

not:

```text
Order creation → settlement.
```

---

# 242. Delivery Health Checks

Required:

```text
Delivery with multiple active Bookings

Delivered Delivery without delivery evidence

Handed-over Delivery without active/known Booking

Stale tracking

Provider status regression

COD instruction/provider mismatch

COD collected without Payment recognition

Delivered COD without settlement after threshold

Failed Delivery without RTO/Resolution

Lost Delivery without Costing loss resolution

Delivery provider charge duplicated

RTO started twice

Order/Fulfillment quantity mismatch
```

---

# 243. Integrity Severity Examples

```text
Tracking stale:
WARNING

Two active courier pickups:
CRITICAL

Delivered but COD mismatch:
ERROR

Confirmed lost but Costing still pending:
CRITICAL
```

---

# 244. Reconciliation Jobs

Recommended:

```text
Active Delivery provider status reconciliation

Unknown Booking reconciliation

COD Instruction reconciliation

COD Customer Collection reconciliation

COD Settlement reconciliation

Provider Charge reconciliation

Stale Tracking detection

Lost/Damaged resolution checks

RTO-link reconciliation
```

---

# 245. Repair Commands

Purpose-built:

```text
RelinkCourierBooking

ReconcileDeliveryStatus

ReconcileCODCollection

CorrectProviderTrackingReference

ResolveUnknownBooking

ResolveLostDelivery

RebuildDeliverySummary
```

No generic status editor.

---

# 246. Failure Scenario — Booking API Times Out

Correct:

```text
Courier Booking:
UNKNOWN_OUTCOME

Delivery:
BOOKING

No second provider booking yet

Reconciliation scheduled
```

---

# 247. Failure Scenario — Booking Rejected

Correct:

```text
Booking:
REJECTED

Delivery:
READY

Operator can choose another provider.
```

---

# 248. Failure Scenario — Provider Pickup Without Webhook

Physical warehouse confirms handover.

Correct:

```text
Delivery:
HANDED_OVER

provider sync:
STALE/RECONCILIATION_REQUIRED
```

not block physical truth.

---

# 249. Failure Scenario — Provider Says Delivered, Customer Complains Not Received

Provider event remains evidence but creates:

```text
delivery dispute/exception.
```

Do not immediately rewrite status without investigation.

---

# 250. Failure Scenario — Duplicate Delivered Callback

One:

```text
DeliveryDelivered
```

business effect.

No duplicate:

```text
COGS

COD Payment

Notification.
```

---

# 251. Failure Scenario — Customer Pays After Pickup

Expected:

```text
COD ৳1,500

Digital Payment ৳1,500
```

System detects double-collection risk.

Attempts:

```text
COD update/intercept
```

and opens exception until provider confirms.

---

# 252. Failure Scenario — Courier Collects Anyway

Actual:

```text
Digital Payment:
৳1,500

COD:
৳1,500
```

Payments records:

```text
total collections ৳3,000

Order allocation ৳1,500

unallocated/customer credit ৳1,500.
```

No money is discarded to make Order look clean.

---

# 253. Failure Scenario — COD Payment Confirmed but Provider Never Settles

Correct:

```text
Customer Payment remains real

Provider receivable/outstanding settlement remains open

Cash account not falsely increased.
```

---

# 254. Failure Scenario — Parcel RTOs Before Delivery

Correct:

```text
Delivery FAILED

RTO Case created

Outbound cost pending

No COGS if sale not completed

Inventory restored only after Return Receipt.
```

---

# 255. Failure Scenario — Parcel Lost

Correct:

```text
Delivery LOST

No RTO stock restoration

Costing Inventory Loss

Refund if applicable

Provider Claim.
```

---

# 256. Failure Scenario — Courier Return Fee Arrives Months Later

Correct:

```text
new actual Provider Charge

Finance expense/settlement adjustment

historical Order customer delivery charge unchanged.
```

---

# 257. Delivery Invariants

### DLV-INV-001

Fulfillment and Delivery are separate domain entities.

### DLV-INV-002

Delivery and Courier Booking are separate entities.

### DLV-INV-003

One Delivery may have multiple sequential Courier Bookings.

### DLV-INV-004

A Delivery normally has at most one active courier booking controlling physical pickup at a time.

### DLV-INV-005

A booked consignment does not prove courier handover occurred.

### DLV-INV-006

Courier handover does not prove customer delivery occurred.

### DLV-INV-007

Provider-delivered status does not directly mutate Payment or Costing tables.

### DLV-INV-008

Successful customer handoff is the normal V1 trigger for COGS Recognition.

### DLV-INV-009

Delivery failure does not itself restore Inventory.

### DLV-INV-010

RTO physical Inventory restoration occurs only through Returns Return Receipt.

### DLV-INV-011

Courier provider status is normalized before becoming Delivery state.

### DLV-INV-012

Out-of-order provider events cannot regress a finalized Delivery state.

### DLV-INV-013

Provider raw geography IDs never become Customer Address identity.

### DLV-INV-014

Delivery Address is snapshotted independently of Customer current Address.

### DLV-INV-015

Courier operational charge and Customer delivery price are separate.

### DLV-INV-016

COD Collection Instruction and actual Customer Payment are separate.

### DLV-INV-017

Customer COD collection and provider settlement are separate.

### DLV-INV-018

Provider fees do not reduce the recorded principal Customer Payment.

### DLV-INV-019

Split Deliveries cannot each collect the full Order balance unintentionally.

### DLV-INV-020

Changing Payment state can require explicit synchronization of active COD instructions.

### DLV-INV-021

Unknown external booking outcome must be reconciled before duplicate-prone failover.

### DLV-INV-022

Provider outage never deletes or invalidates the Delivery business obligation.

### DLV-INV-023

Manual courier operation uses the same Delivery lifecycle rather than a separate shadow system.

### DLV-INV-024

A failed provider booking before handover may be rebooked under the same Delivery.

### DLV-INV-025

A new outbound attempt after completed RTO uses a new Reservation, Fulfillment, and Delivery.

### DLV-INV-026

Confirmed lost stock becomes Inventory Loss, not COGS.

### DLV-INV-027

Refund and Delivery outcome remain separate.

### DLV-INV-028

Provider compensation for loss is separate from Inventory Cost/COGS.

### DLV-INV-029

Delivery attempts are first-class and one failed attempt does not necessarily mean final Delivery failure.

### DLV-INV-030

Provider Charge estimates and actuals remain distinguishable.

### DLV-INV-031

Every provider external identity is scoped to its Integration Account.

### DLV-INV-032

Duplicate provider callbacks cannot duplicate Delivery, Payment, COGS, or RTO effects.

### DLV-INV-033

Public tracking never exposes unrestricted provider payload or internal sensitive metadata.

### DLV-INV-034

Delivery quantity outcomes remain traceable to Fulfillment quantities.

### DLV-INV-035

Delivery correctness does not depend on any single courier provider being available.

---

# 258. Mandatory V1 Scope

```text
✓ Home Delivery method

✓ Delivery entity

✓ Delivery Lines

✓ Address Snapshot

✓ Delivery Package

✓ Package weight

✓ Courier Booking

✓ Multiple booking history

✓ Active booking protection

✓ Manual Courier Booking

✓ Provider Adapter abstraction

✓ Provider capability model

✓ Provider Geography mapping foundation

✓ Serviceability

✓ Delivery operational status

✓ Delivery outcome

✓ Tracking

✓ Delivery Events

✓ Delivery Attempts

✓ Controlled failure reasons

✓ Booking idempotency

✓ Unknown external outcome

✓ Provider reconciliation

✓ Handover

✓ Successful delivery

✓ Failed delivery

✓ RTO initiation

✓ Lost Delivery

✓ Damaged Delivery foundation

✓ COD Collection Instruction

✓ COD instruction versioning

✓ COD provider sync

✓ COD collection observation

✓ Payment integration

✓ Settlement integration

✓ Provider charge estimate/actual

✓ Delivery exceptions

✓ Manual fallback

✓ Notifications

✓ Analytics

✓ Integrity checks

✓ Audit
```

---

# 259. Strongly Preferred V1

```text
✓ Provider quote comparison

✓ Delivery booking queue

✓ Provider outage dashboard

✓ COD reconciliation queue

✓ Stale tracking queue

✓ RTO candidates

✓ Provider-cost analytics

✓ Delivery claims foundation

✓ Printable/scannable package label

✓ Barcode/QR handover workflow

✓ Delivery timeline

✓ Provider performance dashboard
```

---

# 260. Explicitly Deferred

```text
Route optimization

Own delivery fleet

Rider mobile app

Live GPS

Dynamic carrier bidding

Multi-package partial-customer acceptance

International delivery

Customs export

Delivery lockers

Pickup points

Customer delivery-slot scheduling

Automated delivery insurance

Advanced claims automation

AI courier selection

Proof-of-delivery image processing

Signature capture system

Advanced address geocoding
```

---

# 261. Decisions Established

### Decision DLV-001

**Fulfillment and Delivery remain separate domains.**

### Decision DLV-002

**Delivery and Courier Booking remain separate entities.**

### Decision DLV-003

**Courier providers integrate through provider-neutral adapters.**

### Decision DLV-004

**One Delivery may have multiple sequential Courier Bookings.**

### Decision DLV-005

**Manual courier operation is a first-class fallback, not a separate process.**

### Decision DLV-006

**Provider external calls use durable Integration Operations.**

### Decision DLV-007

**Unknown provider outcomes are reconciled before duplicate-prone retry/failover.**

### Decision DLV-008

**Provider statuses are normalized before affecting Delivery lifecycle.**

### Decision DLV-009

**Delivery Address uses a point-in-time snapshot.**

### Decision DLV-010

**Provider geography identifiers remain mappings, not Customer Address truth.**

### Decision DLV-011

**Customer Delivery Charge and Courier operational cost remain separate.**

### Decision DLV-012

**COD Collection Instruction, COD Payment and provider Settlement are separate.**

### Decision DLV-013

**Successful Delivery is the normal V1 trigger for COGS Recognition.**

### Decision DLV-014

**Failed Delivery initiates RTO but does not itself restore Inventory.**

### Decision DLV-015

**RTO Inventory restoration remains owned by Returns.**

### Decision DLV-016

**Confirmed lost parcels create Inventory Loss rather than COGS.**

### Decision DLV-017

**Pre-handover rebooking may reuse Delivery; post-RTO reattempt uses a new Fulfillment/Delivery.**

### Decision DLV-018

**Delivery Attempts are first-class.**

### Decision DLV-019

**Provider charge estimate and actual charge remain separate values.**

### Decision DLV-020

**Provider loss/damage compensation is separate from inventory costing.**

---

# 262. Schema Refinements Required

Add:

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

delivery.provider_geography_mappings
```

---

# 263. Fulfillment Refinement

Add:

```text
delivery_id
```

through proper relationship rather than storing courier/provider fields directly on Fulfillment.

---

# 264. Costing Refinement

COGS recognition should reference the successful Delivery/Delivery outcome that justified recognition.

This creates trace:

```text
Order Line
→ Fulfillment
→ Outbound Cost Assignment
→ Delivery
→ Delivered
→ COGS Recognition
```

---

# 265. Returns Refinement

RTO Return Case should reference:

```text
Delivery

Courier Booking

Fulfillment
```

as source context.

---

# 266. Payments Refinement

COD Payment provenance should preserve:

```text
Delivery ID

Courier Booking

Provider Collection Observation
```

where applicable.

---

# 267. Finance Refinement

Provider charge/settlement relationship must avoid counting the same:

```text
courier fee
```

twice between:

```text
Delivery Provider Charge

Payment Settlement deduction

Finance Expense.
```

---

# 268. API Refinement

Add Admin API groups:

```text
/deliveries

/courier-bookings

/delivery-attempts

/delivery-claims
```

and Storefront tracking DTOs.

---

# 269. Architecture Leak Found #1 — Geography

Delivery has exposed a weakness in our existing Customer Address model.

We currently have free-form:

```text
area
city
district
```

but courier integration/serviceability requires reliable mapping between:

```text
Customer-entered address
Canonical Bangladesh geography
Courier-specific area/zone IDs
```

This cannot safely be solved with:

```text
string matching every time we book a parcel.
```

---

# 270. Required Geography Foundation

We therefore need at least:

```text
Country

Administrative Area

District

City/Upazila

Area

Postal Code foundation

Provider geography mapping

Serviceability
```

with aliases/search names.

---

# 271. Do We Need a Separate Geography Domain?

Yes, but we should keep it focused.

It is not merely a Delivery feature because it affects:

```text
Customer Addresses

Checkout

Delivery Serviceability

Delivery Pricing

Analytics by Area

Future Taxes

Warehouse Addresses

Supplier Addresses
```

---

# 272. Recommended Next Document

Before Admin Information Architecture, one final infrastructure/business-support domain should be formalized:

```text
docs/domains/geography/geography-address-serviceability-architecture.md
```

Its core rule should be:

> **Human-entered Address Text, Canonical Geography, and Provider Geography Identifiers are three separate concepts.**

It should settle:

```text
Bangladesh geography hierarchy

Address structure

Address normalization

Address snapshots

Aliases

District / Upazila / Area modeling

Postal codes

Coordinates

Customer free-form directions

Serviceability

Courier provider geography mappings

Provider area refresh/versioning

Unknown/unmapped areas

Checkout area selection

Manual address fallback

Search

Address corrections

Historical address snapshots

Analytics geography attribution
```

This is small compared with Orders/Inventory, but extremely important for Bangladesh courier reliability.

---

# 273. Sequence After Geography

At that point, the major transactional domain architecture is genuinely mature enough to stop discovering new foundational concepts.

Then move to:

```text
Geography, Address & Serviceability
        ↓
Admin Information Architecture
        ↓
Storefront UX Architecture
        ↓
Testing Master Plan
        ↓
Operations / Runbooks
        ↓
Implementation Roadmap
        ↓
Implementation
```

---

**End of Delivery & Courier Architecture v0.1**
