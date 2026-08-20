# Maevelle Ecommerce — Payment Architecture

**Document:** `docs/domains/payments/payment-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `order-lifecycle-architecture.md`, `inventory-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Payment domain defines how Maevelle records, verifies, collects, refunds, reconciles and eventually settles customer money.

Initial required methods:

```text
Cash on Delivery

Manual bKash

Manual Nagad
```

Future methods may include:

```text
SSLCommerz

Direct bKash integration

Direct Nagad integration

Cards

Bank transfer

Wallets

Other payment providers
```

The architecture must support them without redesigning Orders.

---

# 2. Core Principle

> **Order, Payment, Refund and Provider Settlement are separate financial realities.**

Example:

```text
Order Total:
৳1,500

Customer pays courier:
৳1,500

Courier has not yet remitted money to Maevelle.
```

The correct state is conceptually:

```text
Customer Collection:
PAID

Refund:
NONE

Provider Settlement:
UNSETTLED
```

It would be incorrect to call the Order:

```text
UNPAID
```

merely because Maevelle has not yet received the courier settlement.

---

# 3. Refinement of Order Architecture

The previous Order Architecture established a separate:

```text
PAYMENT STATE
```

This document refines that into three important dimensions:

```text
CUSTOMER COLLECTION STATUS

REFUND STATUS

SETTLEMENT STATUS
```

A simplified Order UI can still show one convenient Payment badge.

But the underlying system should retain the distinct meanings.

---

# 4. Why This Matters for COD

Consider:

```text
Order delivered

Customer paid courier

Courier settlement arrives 5 days later
```

From the customer's perspective:

```text
Paid
```

From Maevelle's provider receivable perspective:

```text
Settlement Pending
```

Those are not contradictory.

They are different stages.

---

# 5. Domain Responsibilities

Payment owns:

```text
Payment Methods

Payment Providers

Payment Accounts

Payment Intents

Payment Attempts / Submissions

Confirmed Payments

Payment Allocations

Manual Verification

Refunds

Payment Reversals

Customer Payment Balance

Provider Settlements

Settlement Batches

Provider Fees / Deductions references

Payment Reconciliation

Provider Events / Webhooks

Payment Evidence

Payment Exceptions
```

---

# 6. Payment Does Not Own

Payment does not own:

```text
Order Product Lines

Inventory

Warehouse

Courier Delivery Lifecycle

Customer Master Data

General Accounting

Expense Accounting

Order Returns
```

It integrates with those domains.

---

# 7. Official Terminology

Preferred terminology:

```text
Payment Method

Payment Provider

Payment Account

Payment Intent

Payment Attempt

Payment

Payment Allocation

Payment Evidence

Refund

Settlement

Settlement Batch

Provider Event

Reconciliation Issue
```

---

# 8. Payment Method

A **Payment Method** represents how a customer pays.

Initial examples:

```text
COD

BKASH

NAGAD
```

Future:

```text
CARD

BANK_TRANSFER

MOBILE_WALLET

OTHER
```

---

# 9. Method vs Provider

Method and Provider must remain separate.

Example:

```text
Method:
CARD

Provider:
SSLCommerz
```

or:

```text
Method:
BKASH

Provider:
Manual bKash
```

and later:

```text
Method:
BKASH

Provider:
Direct bKash Gateway
```

Thus:

```text
Payment Method
≠
Payment Provider
```

---

# 10. Why This Separation Matters

If we hard-code:

```text
payment_method = "sslcommerz"
```

we mix:

```text
How the customer paid
```

with:

```text
Who processed the transaction
```

That becomes limiting as integrations grow.

---

# 11. Payment Provider

A **Payment Provider** represents a service/system involved in processing or collecting money.

Examples:

```text
Manual bKash

Manual Nagad

Courier COD Collection

SSLCommerz

Direct bKash

Direct Nagad
```

---

# 12. Payment Account

A Provider may have multiple merchant/payment accounts.

Example:

```text
Provider:
bKash

Account:
Maevelle Main Merchant Account
```

Potential information:

```text
Display Name

Provider

Public Account Identifier

Internal Account Code

Status

Supported Methods

Configuration
```

---

# 13. Sensitive Configuration

Provider secrets must never be exposed through ordinary administrative APIs.

Future credentials such as:

```text
API keys

Signing secrets

Merchant credentials
```

must use secure secret storage/configuration.

They should not appear in:

```text
Payment records
Audit payloads
Frontend JavaScript
```

---

# 14. Payment Account Display Data

Some payment information may be intentionally public.

Example:

```text
Send payment to:
01XXXXXXXXX
```

for a manual payment flow.

The system must distinguish:

```text
Public payment instructions
```

from:

```text
Private credentials
```

---

# 15. Payment Method Configuration

Authorized staff should configure:

```text
Enabled / Disabled

Storefront Label

Instructions

Display Order

Applicable Currency

Optional Minimum / Maximum

Optional Availability Conditions

Provider / Account
```

---

# 16. Instructions Must Not Be Hard-Coded

Manual bKash instructions may change.

Therefore:

```text
"Send Money to..."
```

should come from business configuration.

No code deployment should be required to update payment instructions.

---

# 17. Payment Intent

A **Payment Intent** represents:

> An intention/request to collect a defined amount from a customer using a particular payment method.

It is not evidence that money was received.

---

# 18. Intent Example — Manual bKash

```text
Order:
MV-1005

Amount Expected:
৳1,500

Method:
bKash

Provider:
Manual bKash
```

The Intent records what payment is being requested.

---

# 19. Intent Example — COD

```text
Order:
MV-1006

Amount Expected:
৳2,200

Method:
COD

Collection Point:
Delivery
```

No Payment exists yet.

---

# 20. Intent Example — Future Gateway

```text
Order:
MV-1007

Amount:
৳3,000

Method:
Card

Provider:
SSLCommerz
```

Provider interaction happens under the Intent.

---

# 21. Payment Intent Lifecycle

Recommended generic lifecycle:

```text
DRAFT

READY

PROCESSING

SATISFIED

FAILED

EXPIRED

CANCELLED
```

Not every Provider needs every state.

---

# 22. Intent Is Provider-Neutral

Avoid making internal Intent states identical to one gateway's terminology.

Provider statuses should be normalized into Maevelle's internal model.

---

# 23. Intent Amount

An Intent should contain:

```text
Expected Amount

Currency
```

and optionally:

```text
Maximum / Allowed Variation
```

where business policy requires.

---

# 24. Order Amendment and Intent

Suppose:

```text
Order Total:
৳1,500
```

then staff adds an item:

```text
New Total:
৳1,800
```

If original Payment Intent remains unpaid:

```text
Intent can be updated/replaced
```

according to lifecycle.

---

# 25. Paid Intent Cannot Simply Be Rewritten

If:

```text
৳1,500
```

was already collected and Order becomes:

```text
৳1,800
```

create an additional:

```text
৳300 Payment Intent
```

or equivalent.

Do not rewrite the historical payment into ৳1,800.

---

# 26. Payment Attempt

A **Payment Attempt** represents one effort to satisfy a Payment Intent.

Examples:

```text
Customer submits bKash Transaction ID

Customer opens gateway checkout

Gateway transaction fails

Customer retries using another card

Courier attempts COD collection
```

---

# 27. Why Attempt Is Separate

One Payment Intent may have:

```text
Attempt 1:
Failed

Attempt 2:
Expired

Attempt 3:
Succeeded
```

The Order should not appear to have received three Payments.

---

# 28. Attempt Lifecycle

Potential:

```text
CREATED

SUBMITTED

PROCESSING

SUCCEEDED

FAILED

REJECTED

CANCELLED

EXPIRED
```

---

# 29. Manual Payment Submission

For manual bKash/Nagad, the customer may submit:

```text
Transaction Reference

Sender Number where required

Expected Amount

Optional Screenshot / Evidence
```

This creates:

```text
Payment Attempt / Submission
```

not immediately a confirmed Payment.

---

# 30. Manual Verification

Submission enters:

```text
PENDING_VERIFICATION
```

operationally.

Authorized staff then:

```text
Verify
Reject
Request Correction
```

---

# 31. Verification Result

If valid:

```text
Payment confirmed
```

If invalid:

```text
Attempt rejected
```

Historical rejected attempt remains visible.

---

# 32. Never Delete Rejected Attempts

Suppose customer submits:

```text
Txn ID:
ABC123
```

and staff rejects it.

Later the customer submits:

```text
XYZ789
```

Both attempts should remain in the timeline.

This is useful for:

```text
Fraud investigation

Customer support

Duplicate detection
```

---

# 33. Verification Data

A verification action should record:

```text
Verified By

Verified At

Verification Result

Verification Notes

Amount Confirmed

Provider Reference

Evidence where applicable
```

---

# 34. Verification Permission

Recommended capability:

```text
payments.verify_manual
```

This should be distinct from:

```text
payments.view
```

---

# 35. Confirmed Payment

A **Payment** represents customer funds that Maevelle recognizes as successfully collected.

Examples:

```text
Verified bKash transfer

Verified Nagad transfer

COD successfully collected

Future gateway payment success
```

---

# 36. Payment Is Financial History

A confirmed Payment should not remain freely editable.

Important properties:

```text
Amount

Currency

Method

Provider

Account

External Reference

Collected At

Source

Verification
```

become historical financial facts.

---

# 37. Payment Status

Recommended Payment record status:

```text
POSTED

VOIDED

REVERSED

DISPUTED
```

Most V1 Payments will simply be:

```text
POSTED
```

---

# 38. Pending Money Is Usually Not a Payment Yet

For clarity:

```text
Manual bKash pending verification
```

is:

```text
Payment Attempt
```

not a posted Payment.

This avoids treating unverified customer claims as money received.

---

# 39. Payment Allocation

A **Payment Allocation** answers:

> Which Order financial obligation does this confirmed Payment satisfy?

Normal V1:

```text
Payment
→ One Order
```

But using an explicit allocation layer gives much stronger reconciliation capabilities.

---

# 40. Multiple Payments per Order

Example:

```text
Order:
৳2,000

Payment 1:
৳500

Payment 2:
৳1,500
```

Both allocations point to the same Order.

---

# 41. One Payment Across Multiple Orders

Rare but valid future/manual scenario:

```text
Customer transfers:
৳5,000

Order A:
৳2,000

Order B:
৳3,000
```

One Payment could be allocated across both.

V1 UI does not need to emphasize this, but architecture should allow it.

---

# 42. Unallocated Payment

Another important real-world scenario:

Maevelle finds a bKash transaction:

```text
৳1,500

Reference known

Order unknown
```

Create:

```text
Confirmed / imported Payment

Allocated:
৳0

Unallocated:
৳1,500
```

Staff can investigate later.

---

# 43. Why Unallocated Payments Matter

Without them, staff may be forced to:

```text
Create fake Order

Ignore real money

Store notes in Excel
```

A proper reconciliation system should handle unidentified money.

---

# 44. Payment Amount

Payment records the actual amount received.

Never modify it merely because the Order requires less.

Example:

```text
Order Due:
৳1,000

Customer Sent:
৳1,100
```

Payment remains:

```text
৳1,100
```

because that is what happened.

---

# 45. Overpayment

Recommended handling:

```text
Payment:
৳1,100

Order Allocation:
৳1,000

Unallocated Excess:
৳100
```

The system flags:

```text
Customer Overpayment / Credit / Refund Required
```

---

# 46. Why This Is Better Than Hiding Excess

Wrong:

```text
Payment amount = ৳1,000
```

when bank/wallet truth is:

```text
৳1,100
```

That creates reconciliation errors.

---

# 47. Underpayment

Example:

```text
Order Due:
৳1,500

Payment:
৳1,000
```

Order Collection Status becomes:

```text
PARTIALLY_PAID
```

Remaining:

```text
৳500
```

---

# 48. Payment Balance Model

Conceptually:

```text
Current Order Payable
-
Net Valid Applied Customer Payments
=
Balance Due
```

The exact Order payable already reflects valid:

```text
Cancellations

Returns/credits

Order adjustments
```

---

# 49. Net Applied Payment

Conceptually:

```text
Confirmed Payment Allocations
-
Confirmed Refunds against those allocations
=
Net Retained Customer Payment
```

This supports accurate financial reconciliation.

---

# 50. Refund Requires Financial Reason

A normal Refund should correspond to something such as:

```text
Cancelled item

Returned item

Price correction

Delivery charge reversal

Customer credit

Overpayment
```

Avoid issuing arbitrary Refunds while leaving Order financial obligation unchanged.

---

# 51. Customer Collection Status

Recommended derived states:

```text
UNPAID

PAYMENT_PENDING

PARTIALLY_PAID

PAID

EXCESS_PAYMENT
```

`EXCESS_PAYMENT` is clearer operationally than silently calling everything `OVERPAID`.

---

# 52. Payment Pending

Example:

```text
Manual bKash submission exists
but not verified.
```

Collection status:

```text
PAYMENT_PENDING
```

Confirmed collected amount remains unchanged.

---

# 53. Refund Status

Separate:

```text
NONE

REFUND_PENDING

PARTIALLY_REFUNDED

REFUNDED

REFUND_FAILED
```

---

# 54. Settlement Status

Separate provider-receivable state:

```text
NOT_APPLICABLE

UNSETTLED

PARTIALLY_SETTLED

SETTLED

SETTLEMENT_EXCEPTION
```

---

# 55. Combined Order UI

UI may show:

```text
Paid
Refunded ৳300
COD Settlement Pending
```

instead of forcing one overloaded badge.

---

# 56. Manual bKash Flow

Recommended V1 flow:

```text
Customer selects bKash
        ↓
System displays payment instructions
        ↓
Payment Intent created
        ↓
Customer sends payment externally
        ↓
Customer submits Transaction ID
        ↓
Payment Attempt created
        ↓
PENDING VERIFICATION
        ↓
Staff verifies
        ↓
Confirmed Payment created
        ↓
Payment allocated to Order
        ↓
Collection Status recalculated
```

---

# 57. Manual Nagad Flow

Same architecture:

```text
Intent
→ Submission
→ Verification
→ Payment
→ Allocation
```

Only Provider/Method configuration differs.

---

# 58. No Separate bKash Order Engine

Do not write:

```text
if payment == bkash:
   special_order_table...
```

Manual bKash and Nagad should plug into the same Payment domain.

---

# 59. Transaction Reference

Manual payments should support:

```text
Provider Transaction Reference
```

Example:

```text
TxnID
```

Reference is not the Payment's internal primary key.

---

# 60. Reference Normalization

Provider references may need normalization for:

```text
Case

Whitespace

Formatting
```

before duplicate checks.

Do not alter the original displayed/reference snapshot unnecessarily.

---

# 61. Duplicate Reference Detection

Strong V1 requirement.

System should check duplicate combinations such as:

```text
Provider

Merchant Account

External Transaction Reference
```

before verifying payment.

---

# 62. Duplicate Attempt Scenario

Order A submits:

```text
TXN123
```

then Order B submits:

```text
TXN123
```

System should strongly flag/block verification.

---

# 63. Duplicate Does Not Always Mean Fraud

Possible:

```text
Customer accidentally entered same reference twice.
```

Keep both attempts but only one real Payment can normally correspond to the same provider transaction.

---

# 64. Sender Number

Manual wallet submissions may optionally record:

```text
Sender Number
```

where useful.

Sensitive display should be masked according to permission.

---

# 65. Amount Verification

Customer claims:

```text
Paid:
৳1,500
```

Merchant evidence shows:

```text
৳1,000
```

Staff should confirm:

```text
Actual:
৳1,000
```

The confirmed Payment amount must reflect verified financial reality.

---

# 66. Evidence

Payment Attempt/Payment may attach:

```text
Customer Screenshot

Merchant Screenshot

Statement Evidence

Manual Verification Document
```

through Media/Attachment infrastructure.

---

# 67. Evidence Is Not Proof by Itself

A customer-uploaded screenshot should never automatically establish:

```text
Payment = confirmed.
```

Verification/business rules determine confirmation.

---

# 68. COD Payment Intent

At Order creation:

```text
Method:
COD

Expected:
৳1,500
```

creates a Payment Intent.

No Payment exists yet.

---

# 69. COD Fulfillment

Order can proceed while:

```text
Customer Collection:
UNPAID
```

because COD intentionally collects later.

---

# 70. COD Collection

When customer pays:

```text
Courier collects:
৳1,500
```

a confirmed customer Payment can be recorded.

Payment Method:

```text
COD
```

Provider:

```text
Courier Provider
```

---

# 71. COD Collection Reference

Possible:

```text
Courier Consignment ID

Provider Collection ID

Delivery Reference
```

should link Payment to Delivery/Fulfillment.

---

# 72. COD Delivery Does Not Guarantee Amount

Courier may report:

```text
Delivered
```

but collected amount might be:

```text
৳0

৳1,500

৳1,400
```

depending on operational errors/adjustments.

Payment system must use confirmed collection data rather than infer amount from delivery status alone.

---

# 73. COD Amount Mismatch

Example:

```text
Expected:
৳1,500

Collected:
৳1,400
```

Result:

```text
PARTIALLY_PAID
+
Reconciliation Issue
```

Do not silently mark Paid.

---

# 74. COD Failure

Delivery fails.

Payment Intent becomes:

```text
FAILED / CANCELLED
```

according to business outcome.

No Payment is created.

---

# 75. COD RTO

Courier returns item.

Again:

```text
No customer Payment
```

unless an actual partial collection happened.

Inventory return handling remains Delivery/Inventory responsibility.

---

# 76. Alternative Payment at Delivery

Customer originally chose COD but pays Maevelle by bKash before/at delivery.

System should allow:

```text
COD Intent cancelled/reduced

bKash Payment recorded
```

rather than forcing the actual payment to pretend it was COD.

---

# 77. Provider Settlement

**Settlement** means money a collecting Provider transfers/remits to Maevelle.

Examples:

```text
Courier remits COD money

Gateway settles captured payments

Wallet provider transfers merchant balance
```

---

# 78. Settlement Is Not Customer Payment

Example:

```text
Customer paid:
৳1,500

Provider fee:
৳30

Maevelle receives:
৳1,470
```

The Order is:

```text
Paid ৳1,500
```

not:

```text
Paid ৳1,470
```

---

# 79. Provider Fees

Provider fees must be recorded separately.

Example:

```text
Gross Customer Collection:
৳1,500

COD Fee:
৳15

Courier Delivery Fee:
৳60

Other Deduction:
৳5

Net Settlement:
৳1,420
```

---

# 80. Fees Do Not Reduce Customer Payment

This is a critical invariant.

Customer fulfilled:

```text
৳1,500 payment obligation.
```

Provider fees represent Maevelle's business cost.

They later integrate with:

```text
Expenses

Fulfillment Cost

Profitability
```

---

# 81. Settlement Batch

Providers often remit many transactions together.

Therefore:

```text
Settlement Batch
```

must be first-class.

Example:

```text
Courier Settlement:
SET-2026-0801

Orders:
MV-1001
MV-1002
MV-1005
...
```

---

# 82. Settlement Batch Structure

Conceptually:

```text
Provider

Payment Account

Settlement Reference

Settlement Date

Gross Amount

Fees

Adjustments

Net Amount

Currency

Settlement Lines

Status

Evidence / Statement
```

---

# 83. Settlement Line

A Settlement Line maps Provider money back to:

```text
Payment

Order

Delivery / Consignment

Provider Transaction
```

where possible.

---

# 84. Settlement Reconciliation

For each customer Payment:

```text
Collected:
৳1,500
```

system asks:

```text
Has the Provider settled this money to Maevelle?
```

---

# 85. Partial Settlement

Possible:

```text
Payment:
৳5,000

Provider settles:
৳3,000 now
৳2,000 later
```

Architecture should support it even if rare.

---

# 86. Settlement Allocation

Like Payment Allocation:

```text
Settlement
→ one or more Payments
```

with amounts.

---

# 87. Gross vs Net Settlement

Never reconcile only the net bank transfer.

Example:

```text
Gross:
৳100,000

Provider Fees:
৳5,000

Net:
৳95,000
```

The system should understand all three.

---

# 88. Settlement Fee Integration

Future Finance/Expense domain can consume:

```text
Provider Fee
```

without users manually entering it again.

This avoids double counting.

---

# 89. Settlement Evidence

Potential:

```text
Courier Settlement Sheet

Gateway Settlement Report

Bank Credit Receipt

CSV/XLSX statement
```

---

# 90. COD Reconciliation Center

Strongly recommended V1/early enhancement:

```text
Delivered + Collected + Unsettled

Settled

Amount Mismatch

Missing Settlement

Unmatched Settlement
```

This can prevent large operational money leakage.

---

# 91. Unmatched Settlement Line

Provider statement contains:

```text
Tracking:
ABC123

Amount:
৳1,500
```

but system cannot find a matching Payment/Order.

Do not discard it.

Create:

```text
Reconciliation Issue
```

---

# 92. Reconciliation Issue

Potential types:

```text
UNMATCHED_PAYMENT

UNMATCHED_SETTLEMENT

DUPLICATE_TRANSACTION

AMOUNT_MISMATCH

MISSING_SETTLEMENT

MISSING_PAYMENT

REFUND_MISMATCH

PROVIDER_STATUS_MISMATCH
```

---

# 93. Reconciliation Lifecycle

```text
OPEN

INVESTIGATING

RESOLVED

IGNORED_WITH_REASON
```

---

# 94. Manual Resolution

Authorized operator may:

```text
Match to Order

Match to Payment

Correct Reference

Record Missing Payment

Record Provider Fee

Mark Known Exception
```

Every action is audited.

---

# 95. Refund

A **Refund** represents money returned to a customer.

Refund is separate from:

```text
Return

Cancellation

Payment
```

though normally connected to a financial reason.

---

# 96. Refund Amount

Refund may be:

```text
Full

Partial
```

Example:

```text
Payment:
৳1,500

Refund:
৳500
```

---

# 97. Multiple Refunds

Example:

```text
Refund 1:
৳300

Refund 2:
৳200
```

Total:

```text
৳500
```

This must be supported.

---

# 98. Refund Source

Refund should reference:

```text
Order

Order adjustment / Return / Cancellation reason

Original Payment(s) where applicable
```

---

# 99. Refund Method May Differ

Important for Maevelle.

Customer originally paid:

```text
COD
```

but Refund is sent through:

```text
bKash
```

This is valid.

Therefore:

```text
Original Payment Method
≠
Required Refund Method
```

---

# 100. Refund Destination

Manual refund may need:

```text
Recipient Number / Account

Recipient Name where appropriate
```

Sensitive details should be protected/masked.

---

# 101. Refund Lifecycle

Recommended:

```text
DRAFT

PENDING

PROCESSING

CONFIRMED

FAILED

CANCELLED
```

---

# 102. Manual Refund

Example:

```text
Refund via bKash manually
```

Staff records:

```text
Amount

Recipient

Transaction Reference

Evidence

Performed At
```

Authorized verifier/poster confirms.

---

# 103. Future Provider Refund

Gateway adapter may submit Refund.

Provider interaction remains under Refund record.

---

# 104. Refund Idempotency

Pressing:

```text
Refund ৳1,000
```

twice must not return:

```text
৳2,000
```

Critical requirement.

---

# 105. Refund Limit

System must prevent ordinary Refund amount from exceeding valid refundable amount.

Conceptually:

```text
Refundable
=
Eligible Confirmed Customer Payment
-
Already Refunded
-
Other applicable reversals
```

subject to Order credit logic.

---

# 106. Refund and Order Adjustment

Suppose customer receives:

```text
৳100 goodwill reduction.
```

Order financial model should first represent a valid:

```text
৳100 credit/adjustment
```

then Payment domain returns:

```text
৳100
```

This keeps Order balance consistent.

---

# 107. Overpayment Refund

Payment:

```text
৳1,100

Order due:
৳1,000
```

Unallocated:

```text
৳100
```

Refund:

```text
৳100
```

No Order-total reduction is necessary because the ৳100 was never allocated to Order obligation.

---

# 108. Refund Does Not Restock Inventory

A Refund operation must never directly do:

```text
Inventory +1
```

Returns domain handles physical goods.

---

# 109. Return Does Not Automatically Refund

Likewise:

```text
Return received
```

does not by itself mean refund succeeded.

---

# 110. Void

A **Void** is different from Refund.

Example:

Staff accidentally recorded:

```text
Payment:
৳1,000
```

but later proves the money never existed.

Correct operation may be:

```text
Void erroneous Payment
```

rather than:

```text
Refund
```

because no real money was returned.

---

# 111. Void Requires Strong Controls

Posted financial records should not be casually voided.

Require:

```text
Permission

Reason

Actor

Audit
```

---

# 112. Reversal

A Provider may reverse previously successful money.

Examples future:

```text
Charge reversal

Failed settlement reversal

Payment reversal
```

Represent this explicitly rather than editing original Payment amount.

---

# 113. Chargeback / Dispute — Future

Future card payments may create:

```text
Dispute

Chargeback
```

These should not be represented as ordinary customer Refunds.

Architecture should allow:

```text
Payment → Dispute → Resolution
```

later.

---

# 114. Payment Evidence

Evidence record may attach to:

```text
Attempt

Payment

Refund

Settlement

Reconciliation
```

and should use central Media infrastructure.

---

# 115. Payment Timeline

Order/payment timeline example:

```text
10:00 Payment Intent created

10:04 bKash reference submitted

10:10 Verification started

10:12 Payment verified ৳1,500

10:12 Applied to Order

Aug 25 Refund ৳300 requested

Aug 25 Refund confirmed
```

---

# 116. Payment Audit

Audit answers:

```text
Who verified this transaction?

Who changed the reference?

Who issued this Refund?

Who voided the Payment?

Who matched this Settlement?
```

---

# 117. Payment vs Audit

Payment records financial truth.

Audit records:

```text
who changed/approved what.
```

Do not use generic Audit as the only Payment history.

---

# 118. Payment Reference History

A submitted transaction reference may be corrected before verification.

Example:

```text
ABC12
→
ABC123
```

The correction should be audited.

After Payment posting, external reference should generally become immutable except controlled correction.

---

# 119. Payment Creation Source

Payment should identify source:

```text
MANUAL_VERIFICATION

COD_COLLECTION

PROVIDER_WEBHOOK

PROVIDER_API

ADMIN_RECONCILIATION

IMPORT
```

---

# 120. Future Provider Adapter

Payment integration layer should use Provider-specific adapters.

Conceptually:

```text
Payment Domain
      ↓
Provider Adapter
      ↓
SSLCommerz / bKash / Nagad / etc.
```

Core Order/Payment logic should not contain Provider-specific HTTP payload details.

---

# 121. Provider Capabilities

Providers differ.

Potential capability metadata:

```text
Can Initiate Payment

Redirect Checkout

Supports Verification

Supports Refund

Supports Partial Refund

Supports Webhooks

Supports Settlements

Supports Authorization/Capture

Supports Void
```

---

# 122. Do Not Force Fake Capabilities

If manual Nagad does not have an API:

```text
supports_webhook = false
```

Do not implement fake methods merely to satisfy one giant interface.

Adapter design should handle capability differences cleanly.

---

# 123. Provider External ID

Every Provider transaction should preserve:

```text
External Transaction ID
```

independently from internal Payment ID.

---

# 124. Provider Status

Store normalized provider state and, where useful, raw external status/reference.

But:

```text
Provider Status
```

must not become the only internal source of Payment truth.

---

# 125. Browser Redirect Is Not Financial Truth

For future hosted gateway checkout:

```text
Customer browser says:
"Success"
```

alone must not be enough to create confirmed Payment.

Server-side provider verification/webhook confirmation should establish authoritative result according to Provider integration rules.

---

# 126. Webhooks

Future payment Providers may send asynchronous events.

Payment architecture must support:

```text
Signature verification

Provider Event ID

Idempotency

Event history

Processing status

Retry-safe handlers
```

---

# 127. Provider Event

Conceptually:

```text
Provider

External Event ID

Event Type

Received At

Verification Result

Processing Status

Related Payment / Attempt / Refund

Sanitized Payload Reference
```

---

# 128. Duplicate Webhooks

Same Provider Event may arrive repeatedly.

Process it once.

Subsequent deliveries should be safely recognized.

---

# 129. Out-of-Order Webhooks

Events may not always arrive in expected sequence.

Handlers must evaluate current Provider/domain state rather than blindly applying:

```text
whatever event arrived last.
```

---

# 130. Webhook Failure

If handler fails:

```text
Event remains visible/retryable.
```

Do not silently lose the payment update.

---

# 131. Payment Provider Timeout

Client requests payment initiation.

Provider succeeds but response times out.

Retry must not create duplicate payment transactions.

Use:

```text
Idempotency key

Provider reference lookup

Reconciliation
```

where supported.

---

# 132. Payment Reconciliation

Payment is financially sensitive enough to require explicit reconciliation.

The system should compare:

```text
Maevelle records
vs
Provider / Wallet / Courier truth
```

---

# 133. Manual Wallet Reconciliation

Possible V1 process:

```text
Merchant statement

Search transaction reference

Compare amount

Compare date

Match Payment

Resolve unmatched items
```

---

# 134. Statement Import — Preferred

CSV/XLSX import can later/ideally support:

```text
bKash statement

Nagad statement

Courier COD settlement report

Gateway settlement report
```

---

# 135. Import Flow

Recommended:

```text
Upload
   ↓
Map Columns
   ↓
Validate
   ↓
Auto-Match Candidates
   ↓
Review
   ↓
Confirm Matches
   ↓
Create Reconciliation Issues
```

Never silently rewrite Payments from a statement upload.

---

# 136. Matching Signals

Potential:

```text
Transaction Reference

Amount

Date / Time

Merchant Account

Order Number

Courier Tracking ID
```

---

# 137. Confidence

Future auto-matching may show:

```text
Exact Match

Probable Match

No Match
```

Human review handles ambiguity.

---

# 138. Settlement Import

Courier report:

```text
Tracking ID
COD Amount
Delivery Charge
COD Fee
Net Payable
```

can map into:

```text
Customer Payment

Provider Fees

Settlement
```

---

# 139. Do Not Treat Courier Report as One Number

A settlement report contains several financial meanings.

Example:

```text
COD Collected:
৳1,500

Delivery:
৳80

COD Fee:
৳15

Net Settlement:
৳1,405
```

Each should remain distinguishable.

---

# 140. Payment Fees and Expenses

Provider fees can later feed:

```text
Finance Operations / Expenses
```

automatically or through linked generated entries.

Do not ask staff to re-enter them manually if they already exist in Settlement.

---

# 141. Payment Fee Is Not Landed Cost

Payment processing fees belong to selling/transaction cost.

They are not inbound Product acquisition cost.

---

# 142. COD Courier Delivery Cost

Likewise:

```text
Outbound courier delivery fee
```

belongs to Fulfillment/Order profitability.

Not Product landed cost.

---

# 143. Payment Method Change

Before payment:

```text
bKash
→
COD
```

can cancel one Intent and create another.

---

# 144. Method Change After Partial Payment

Order:

```text
৳2,000

bKash Paid:
৳500

Remaining:
৳1,500
```

Customer chooses:

```text
COD for remaining ৳1,500.
```

Perfectly valid.

Create COD Intent for balance.

---

# 145. Multiple Payment Methods per Order

Therefore Order can be:

```text
bKash ৳500
+
COD ৳1,500
```

No architecture restriction should assume one method forever.

---

# 146. Payment Instructions Snapshot

When Payment Intent is created, optionally preserve relevant instruction/configuration version.

If merchant payment number changes later, historical payment record remains understandable.

---

# 147. Manual Merchant Account Change

Changing bKash account:

```text
Old Merchant Account
→
New Merchant Account
```

must not change historical Payments.

---

# 148. Disable Payment Method

Disabling:

```text
Nagad
```

should:

```text
Hide it from new Checkout
```

but preserve:

```text
Existing Intents

Payments

Refunds

History
```

---

# 149. Payment Availability Rules

V1 may support basic:

```text
Enabled

Minimum Amount

Maximum Amount
```

Potential future:

```text
Customer Segment

Location

Delivery Area

Risk Level

Product Category
```

---

# 150. COD Eligibility

Possible business rules:

```text
Maximum Order Value

Restricted Area

Restricted Customer

High-risk Order
```

V1 can begin with simple enable/disable and optional threshold.

Do not bake permanent assumptions into Order.

---

# 151. Payment Currency

Every:

```text
Intent

Payment

Refund

Settlement
```

must have explicit currency.

---

# 152. Same-Currency V1

Normal Maevelle customer Orders will likely be BDT initially.

Architecture remains multi-currency capable.

---

# 153. Cross-Currency Customer Payment

Not required for V1.

If introduced later, conversion rules must be explicit.

Never silently convert customer money based on current FX.

---

# 154. Payment Precision

Use fixed/decimal money arithmetic.

Currency precision determines posting/rounding.

---

# 155. Payment Amount Cannot Be Negative

Normal Payment:

```text
amount > 0
```

Refund/reversal are separate financial operations.

Do not use:

```text
Payment = -৳500
```

as a refund hack.

---

# 156. Allocation Cannot Exceed Payment

Invariant:

```text
Sum(Payment Allocations)
<=
Payment Available Amount
```

unless accounting for void/reversal through explicit operations.

---

# 157. Allocation Beyond Order Due

Normal operation should prevent allocating more than valid Order obligation.

Excess remains:

```text
Unallocated
```

unless explicit overpayment policy allows otherwise.

---

# 158. Payment Posted Twice

Critical duplicate scenario.

Payment reference/provider transaction uniqueness and idempotency must prevent:

```text
one real transaction
→
two Payments
```

---

# 159. Manual Verification Race

Two staff open same pending bKash submission.

Both click:

```text
Verify
```

Only one posting operation succeeds.

Concurrency protection required.

---

# 160. Refund Race

Refundable:

```text
৳500
```

Two staff simultaneously request:

```text
৳500 each
```

Only valid total may succeed.

---

# 161. Settlement Race

A Settlement Batch cannot be finalized twice.

---

# 162. Provider Callback Race

Webhook and manual verification may both discover the same future Provider payment.

Unique external transaction identity must converge them into one Payment.

---

# 163. Idempotency — Intent Creation

Checkout retry should not accidentally create dozens of active equivalent Provider payment sessions.

Use checkout/payment operation identity.

---

# 164. Idempotency — Manual Submission

Repeated browser submission of same TxnID should return/recognize existing attempt where appropriate.

---

# 165. Idempotency — Posting

Confirmed Provider transaction can become a Payment once.

---

# 166. Idempotency — Refund

Refund operation can execute once per idempotency identity.

---

# 167. Idempotency — Settlement

Provider statement/batch import should not duplicate Settlement on re-upload.

---

# 168. Payment Exception Dashboard

Useful V1/early view:

```text
Pending Verification

Duplicate Reference

Amount Mismatch

Unallocated Payments

Missing COD Settlement

Unmatched Settlement

Failed Refund

Settlement Variance
```

---

# 169. Stale Payment Attempts

Example:

```text
Manual bKash submitted
48 hours ago
not verified
```

should appear in operational alerts.

---

# 170. Expired Intents

Payment Intent can expire when:

```text
Order cancelled

Checkout abandoned

Payment window expired

Method changed
```

---

# 171. Expired Intent Is Historical

Do not delete it.

Useful for diagnostics and conversion analytics.

---

# 172. Order Cancellation

On cancellation:

```text
Unpaid active Intents
→ cancel
```

Confirmed Payments:

```text
do not disappear.
```

Refund workflow determines customer money return.

---

# 173. Paid Order Cancellation

Example:

```text
Order:
Paid ৳1,500

Then Cancelled
```

System should surface:

```text
Refund Required:
৳1,500
```

subject to valid cancellation adjustment.

---

# 174. Partial Cancellation

Order:

```text
৳2,000 paid
```

Cancelled item value:

```text
৳500
```

Payment remains historical:

```text
৳2,000
```

Refund entitlement:

```text
৳500
```

Refund after execution:

```text
Net retained:
৳1,500
```

---

# 175. Customer Return

Return eligibility/resolution determines financial credit.

Payment domain executes resulting Refund.

---

# 176. Return Rejected

If return is rejected:

```text
No automatic Refund.
```

Payment remains unchanged.

---

# 177. Refund Before Return Receipt

Business may choose to refund early.

Architecture allows it with permission.

But it should remain obvious that:

```text
Refund completed
Return not yet received
```

are separate states.

---

# 178. COD Returned Order

If customer never paid:

```text
Refund = none.
```

RTO handles inventory only.

---

# 179. Invoice Relationship

Invoice represents customer financial document.

Payment Allocation can later reference Invoice/Order obligation if Invoice Architecture requires.

V1 can remain Order-centric.

---

# 180. Payment Receipt

Maevelle may generate a customer-facing:

```text
Payment Receipt
```

for confirmed Payment.

This document is not the same as:

```text
Order Invoice
```

---

# 181. Receipt Information

Potential:

```text
Payment Number

Order Number

Amount

Method

Date

Reference

Business Details
```

---

# 182. Payment Number

Human-readable internal payment reference:

```text
PAY-2026-00182
```

optional but operationally useful.

---

# 183. Refund Number

Example:

```text
RF-2026-00042
```

---

# 184. Settlement Number

Example:

```text
SET-2026-00017
```

---

# 185. Search

Payment search should support:

```text
Payment Number

Order Number

Transaction Reference

Customer Name

Phone

Payment Account

Provider

Settlement Reference
```

---

# 186. Filters

Useful:

```text
Method

Provider

Status

Verification Pending

Date

Amount

Payment Account

Allocated / Unallocated

Refunded

Settlement Status

Has Reconciliation Issue
```

---

# 187. Payment List

High-priority columns:

```text
Payment

Order

Customer

Amount

Method

Provider

Collected At

Allocation

Settlement

Status
```

---

# 188. Payment Detail

Recommended:

```text
Overview

Order Allocation

Attempts

Provider Information

Evidence

Refunds

Settlement

Timeline

Audit
```

---

# 189. Verification Queue

Dedicated operational screen:

```text
Pending bKash

Pending Nagad

Submitted At

Order

Expected Amount

Claimed Reference

Customer

Potential Duplicate Warning
```

---

# 190. Fast Verification UX

Operator should be able to:

```text
Open submission

See Order amount

See transaction reference

Search/cross-check

Confirm actual amount

Verify / Reject

Add note
```

without navigating several modules.

---

# 191. Bulk Verification

Automatic bulk verification should not be added casually for manual payments.

Financial correctness is more important than bulk speed.

Future statement matching may safely automate exact matches.

---

# 192. Payment Permissions

Recommended:

```text
payments.view

payments.view_sensitive

payments.intents.view

payments.manual_submissions.view

payments.verify_manual

payments.record_manual

payments.allocate

payments.reconcile

payments.void

payments.refunds.view

payments.refunds.create

payments.refunds.execute

payments.refunds.verify

payments.settlements.view

payments.settlements.manage

payments.methods.manage

payments.accounts.manage
```

---

# 193. Separation of Duties

Someone who can:

```text
Verify payment
```

should not automatically have permission to:

```text
Refund payment
```

or:

```text
Edit Provider credentials.
```

---

# 194. Refund Permission

Refunds are especially sensitive.

Potential future approval:

```text
Refund above ৳X
→ Manager approval
```

V1 can begin with granular refund permission and audit.

---

# 195. Settlement Permission

Settlement reconciliation may reveal financial totals.

It should be restricted separately from ordinary Order management.

---

# 196. Sensitive Data

Payment API should minimize exposure of:

```text
Customer payment identifiers

Wallet phone numbers

Merchant account identifiers

Refund destinations
```

based on need and permission.

---

# 197. Raw Card Data

Future card support must not make Maevelle responsible for storing raw:

```text
Card number

CVV
```

Core architecture should rely on gateway/provider-managed payment data/token references instead.

---

# 198. Payment Provider Credentials

Never include secrets in:

```text
Audit diff

Error log

Webhook log

Client response
```

---

# 199. Error Handling

Payment errors need structured codes.

Examples:

```text
PAYMENT_INTENT_EXPIRED

PAYMENT_ALREADY_POSTED

DUPLICATE_PROVIDER_TRANSACTION

PAYMENT_REFERENCE_ALREADY_USED

PAYMENT_AMOUNT_MISMATCH

PAYMENT_ALLOCATION_EXCEEDS_AMOUNT

ORDER_ALREADY_FULLY_PAID

REFUND_EXCEEDS_REFUNDABLE_AMOUNT

REFUND_ALREADY_PROCESSED

SETTLEMENT_ALREADY_POSTED

PROVIDER_VERIFICATION_FAILED

PAYMENT_VERSION_CONFLICT
```

---

# 200. User-Facing Error vs Internal Detail

Customer may see:

```text
We could not verify this payment yet.
```

Internal operations may see:

```text
Provider reference already used by Payment PAY-1022.
```

Sensitive internal details should not leak publicly.

---

# 201. Payment Failure Does Not Destroy Order

A failed Payment Attempt may allow:

```text
Retry

Choose another method
```

depending on Order lifecycle.

---

# 202. Gateway Failure Future

Future:

```text
Attempt failed
```

should not automatically:

```text
Cancel Order
```

unless Order policy explicitly decides to expire unpaid Orders.

---

# 203. Unpaid Order Expiry — Future

Potential:

```text
Online prepaid Order unpaid for 30 min
→ expire/cancel
→ release reservation
```

This is an Order policy.

Payment exposes Intent state.

---

# 204. COD Does Not Use Short Expiry

COD Intent remains active through delivery flow.

Payment methods require different collection policies.

---

# 205. Provider Availability Failure

If gateway unavailable:

```text
Payment Method can temporarily be unavailable
```

without taking down checkout entirely when other methods exist.

---

# 206. Payment Health

Operational health checks should detect:

```text
Posted Payment with no allocation

Allocation to missing Order

Duplicate Provider reference

Refund exceeds valid basis

Payment collected but settlement stale

Settlement line with no Payment

Verified manual submission without Payment

Provider success with no local Payment
```

---

# 207. Reconciliation Without Database Surgery

Operators need supported repair actions such as:

```text
Match Payment

Reallocate Payment

Retry Provider Verification

Resolve Duplicate

Record Missing Settlement

Associate Provider Event

Retry Failed Refund
```

---

# 208. No Hard Delete

Posted Payments:

```text
never normally hard-delete.
```

Use:

```text
Void

Reverse

Refund
```

as appropriate.

---

# 209. Draft Records

Draft Intents or unsubmitted drafts may be deletable under controlled rules.

Financially material history remains.

---

# 210. Provider Event Retention

Events should retain enough information for:

```text
Support

Reconciliation

Debugging

Audit
```

while avoiding unnecessary sensitive payload storage.

---

# 211. Payment Analytics

Useful V1 metrics:

```text
Payments Collected

Collection by Method

Collection by Provider

COD Collection

Manual bKash

Manual Nagad

Pending Verification

Partial Payments

Refunds

Payment Failure Rate

Unallocated Payments

Outstanding COD Settlement
```

---

# 212. Order Payment Metrics

Distinguish:

```text
Order Value

Collected Amount

Refunded Amount

Net Collected Amount

Outstanding Balance
```

---

# 213. Collection vs Cash Received

For COD:

```text
Collected from customer
```

and:

```text
Settled to Maevelle
```

must appear separately in financial dashboards.

---

# 214. Provider Fee Analytics

Future/useful:

```text
Payment Processing Fees

COD Fees

Settlement Deductions

Fee % by Provider
```

---

# 215. Refund Analytics

Useful:

```text
Refund Amount

Refund Rate

Refund by Method

Refund by Reason

Refund Processing Time
```

Reason originates from Order/Return/Adjustment context.

---

# 216. Unpaid Analytics

Do not classify all COD Confirmed Orders as a problem merely because they are unpaid before delivery.

Metrics must account for Payment Method lifecycle.

---

# 217. Payment Conversion Analytics — Future

For online gateways:

```text
Intents

Attempts

Successful Payments

Failure Reasons
```

could measure checkout payment conversion.

---

# 218. Audit Events

Important events:

```text
payment_intent.created

payment_intent.cancelled

payment_attempt.submitted

payment_attempt.rejected

payment.verified

payment.posted

payment.allocated

payment.allocation_changed

payment.voided

payment.reversed

refund.created

refund.confirmed

refund.failed

settlement.created

settlement.matched

settlement.finalized

reconciliation_issue.opened

reconciliation_issue.resolved
```

---

# 219. Domain Events

Potential application events:

```text
payment.received

payment.partially_applied

order.payment_completed

payment.refunded

payment.excess_detected

payment.settled

payment.reconciliation_required
```

---

# 220. Event Consumers

May trigger:

```text
Order summary update

Notifications

Analytics

Invoice/receipt generation

Future accounting

Webhooks
```

---

# 221. Customer Notification

Potential:

```text
Payment received

Payment verification failed

Refund processed
```

Actual channel implementation belongs to Notifications.

---

# 222. Order Payment Summary

Order query should be able to return:

```text
Order Payable

Confirmed Applied Payments

Pending Payment Attempts

Balance Due

Excess Payment

Refunded Amount

Refund Pending

Settlement Status
```

without frontend independently calculating financial truth.

---

# 223. Payment Calculation Authority

Frontend must not determine:

```text
This Order is paid.
```

from local arithmetic alone.

Server/domain produces authoritative summary.

---

# 224. Payment Allocation Authority

Only Payment domain/application commands may create/modify payment allocations.

Avoid arbitrary database updates from Order code.

---

# 225. Concurrency

Payment mutations require strong concurrency control.

Examples:

```text
Verification

Allocation

Refund

Void

Settlement finalization
```

---

# 226. Transaction Boundary — Manual Verification

Conceptually:

```text
Lock / validate Attempt
      ↓
Verify uniqueness
      ↓
Create Payment
      ↓
Create Allocation
      ↓
Update Intent state
      ↓
Write Timeline / Audit
```

should succeed coherently.

---

# 227. Transaction Boundary — Refund

```text
Validate refundable amount
      ↓
Create/execute Refund
      ↓
Record financial result
      ↓
Update Payment/Order summary
      ↓
Audit
```

Provider external execution may require asynchronous reconciliation rather than one database transaction.

---

# 228. External Side Effects

Provider API calls cannot always participate in database transactions.

Therefore future payment integrations need:

```text
Idempotency

Durable operation state

Retry

Webhook reconciliation

Operator visibility
```

not wishful atomicity across the internet.

---

# 229. Payment Intent Provider Session

Future gateway Intent may reference:

```text
Provider Session ID

Checkout URL

Expiration

External Intent ID
```

without exposing these concepts to Order domain.

---

# 230. Manual Methods Do Not Need Fake Provider Sessions

Manual bKash/Nagad can simply create a manual Payment Intent and Submission.

Provider-neutral architecture should accommodate both.

---

# 231. Payment Method Switching

Example:

```text
Attempt 1:
Nagad rejected

Attempt 2:
bKash verified
```

Order ends Paid.

Both attempts remain historical.

---

# 232. Partial Mixed Payment Example

Order:

```text
৳2,500
```

Payment:

```text
bKash:
৳1,000

COD:
৳1,500
```

Collection status before delivery:

```text
PARTIALLY_PAID
```

After COD collection:

```text
PAID
```

Settlement may still be:

```text
PARTIALLY_SETTLED
```

---

# 233. Overpayment Example

Order:

```text
৳1,200
```

Customer bKash:

```text
৳1,500
```

Payment:

```text
৳1,500
```

Allocation:

```text
৳1,200
```

Excess:

```text
৳300
```

Order:

```text
PAID
+
EXCESS PAYMENT ALERT
```

Refund ৳300 later clears excess.

---

# 234. COD Settlement Example

Order:

```text
৳1,500
```

Customer pays courier:

```text
৳1,500
```

Payment:

```text
POSTED ৳1,500
```

Settlement later:

```text
Gross:
৳1,500

Delivery Fee:
৳80

COD Fee:
৳15

Net:
৳1,405
```

Order remains fully Paid.

Provider-cost reporting receives:

```text
৳95
```

of related charges.

---

# 235. Full Refund Example

Order payable after cancellation:

```text
৳0
```

Previously collected:

```text
৳1,500
```

Refund:

```text
৳1,500
```

Result:

```text
Collection historical:
৳1,500

Refund Status:
REFUNDED

Net retained:
৳0

Balance Due:
৳0
```

History remains intact.

---

# 236. Wrong Payment Record Example

Staff accidentally posts:

```text
৳1,500
```

but merchant account confirms no transaction existed.

Correct:

```text
Void Payment
Reason:
Verification error
```

not:

```text
Refund ৳1,500
```

because no money was actually returned.

---

# 237. Reconciliation Example

Provider statement:

```text
TXN-A   ৳1,500
TXN-B   ৳2,000
TXN-C   ৳800
```

Maevelle:

```text
TXN-A ✓ matched

TXN-B ✓ matched

TXN-C ? unmatched
```

System creates:

```text
Unmatched Payment / Reconciliation Issue
```

until resolved.

---

# 238. Important Invariants

### PAY-INV-001

Every Payment entity belongs to one Organization.

### PAY-INV-002

Payment Method and Payment Provider are separate concepts.

### PAY-INV-003

Payment Intent does not itself prove customer money was received.

### PAY-INV-004

A Payment Attempt does not become a confirmed Payment until applicable verification succeeds.

### PAY-INV-005

One Payment Intent may have multiple Attempts.

### PAY-INV-006

One Order may have multiple confirmed Payments.

### PAY-INV-007

A confirmed Payment preserves the actual amount received.

### PAY-INV-008

Payment allocations cannot exceed available Payment amount.

### PAY-INV-009

Normal Order allocation cannot silently discard overpayment.

### PAY-INV-010

Excess customer money remains explicitly unallocated/credited/refundable.

### PAY-INV-011

Provider transaction references must support duplicate protection.

### PAY-INV-012

Customer collection and Provider settlement are separate.

### PAY-INV-013

Provider fees do not reduce the customer's paid amount.

### PAY-INV-014

Refund and Return are separate concepts.

### PAY-INV-015

Refund does not change Inventory.

### PAY-INV-016

Posted Payments are not silently rewritten.

### PAY-INV-017

Incorrect posted Payments use controlled void/reversal operations.

### PAY-INV-018

Refund amount cannot exceed valid refundable amount.

### PAY-INV-019

Manual Payment verification is auditable.

### PAY-INV-020

Critical Payment operations are idempotent.

### PAY-INV-021

Payment verification/refund/allocation operations are concurrency-safe.

### PAY-INV-022

Browser/provider redirect alone is not authoritative financial truth for future gateway payments.

### PAY-INV-023

Provider webhook events must be authenticated/validated and deduplicated where supported.

### PAY-INV-024

Settlement batches can contain multiple customer Payments.

### PAY-INV-025

Settlement gross, fees and net amounts remain distinguishable.

### PAY-INV-026

Unmatched Payments/Settlements remain visible for reconciliation.

### PAY-INV-027

Disabling a Payment Method does not invalidate historical Payment records.

### PAY-INV-028

Order payment summary is server-derived from authoritative Payment data.

### PAY-INV-029

Payment/API secrets never appear in ordinary client responses or audit logs.

### PAY-INV-030

Provider-specific implementation details remain behind Payment Provider adapters.

---

# 239. V1 Mandatory Scope

Maevelle V1 Payment should include:

```text
✓ Payment Methods

✓ COD

✓ Manual bKash

✓ Manual Nagad

✓ Payment Providers

✓ Payment Accounts

✓ Configurable payment instructions

✓ Enable / Disable methods

✓ Payment Intents

✓ Payment Attempts

✓ Manual Transaction-ID submission

✓ Payment Evidence

✓ Pending Verification

✓ Manual Verification

✓ Rejection

✓ Confirmed Payments

✓ Actual collected amount

✓ Transaction References

✓ Duplicate detection

✓ Multiple Payments per Order

✓ Payment Allocations

✓ Partial Payments

✓ Excess Payments

✓ Unallocated Payments

✓ Order Balance Due

✓ Customer Collection Status

✓ Refund Status

✓ Refunds

✓ Partial Refunds

✓ Manual Refunds

✓ Different Refund Method

✓ Refund Evidence

✓ Refund Limits

✓ Payment Void / correction foundation

✓ COD Collection

✓ COD amount mismatch

✓ Settlement model

✓ Settlement Batch foundation

✓ COD settlement tracking

✓ Provider Fees / Deductions separation

✓ Unmatched settlement handling

✓ Payment Reconciliation

✓ Reconciliation Issues

✓ Search

✓ Filters

✓ Verification Queue

✓ Permissions

✓ Audit

✓ Timeline

✓ Notifications

✓ Analytics

✓ Structured errors

✓ Concurrency

✓ Idempotency

✓ Secure sensitive-data handling

✓ Provider-abstraction foundation
```

---

# 240. Strongly Preferred V1

```text
Statement CSV/XLSX import

Manual auto-match suggestions

Courier settlement import

Settlement reconciliation center

Unallocated payment queue

Duplicate transaction warnings

Refund verification workflow

Payment health dashboard

Payment receipts

Provider-fee expense linkage

Stale verification alerts
```

---

# 241. Foundation Now / Later

Architecture should prepare for:

```text
SSLCommerz

Direct bKash API

Direct Nagad API

Cards

Authorization / Capture

Provider Webhooks

Provider Refund APIs

Chargebacks

Disputes

Automated Settlements

Bank Reconciliation

Customer Credit Balance

Multi-order payment allocations

Multi-currency checkout
```

---

# 242. Deferred Advanced Capabilities

Post-V1:

```text
Automatic Gateway Verification

Automatic Payment Reconciliation

Automatic Settlement Import

Card Authorization / Capture

Saved Payment Methods

Tokenized Customer Payments

Chargeback Management

Dispute Evidence

Payment Risk Scoring

Recurring Payments

Subscriptions

Automatic Refund Routing

Accounting Journal Integration

Bank Feed Integration

Advanced Customer Credit
```

---

# 243. Decisions Established

### Decision PAY-001

**Payment is a dedicated domain separate from Order.**

### Decision PAY-002

**Payment Method and Payment Provider are different concepts.**

### Decision PAY-003

**Payment Intent represents expected collection, not collected money.**

### Decision PAY-004

**Payment Attempt represents one payment effort/submission.**

### Decision PAY-005

**Manual bKash/Nagad submissions remain unconfirmed until verification.**

### Decision PAY-006

**Confirmed Payment represents actual customer money recognized as collected.**

### Decision PAY-007

**Multiple Payments per Order are supported.**

### Decision PAY-008

**Payment Allocation is explicit.**

### Decision PAY-009

**Actual overpayment is preserved rather than truncated to Order total.**

### Decision PAY-010

**Excess payment normally remains unallocated/refundable rather than corrupting Order value.**

### Decision PAY-011

**Customer collection, Refund and Provider settlement have separate statuses.**

### Decision PAY-012

**COD creates a payment obligation/Intent before actual Payment exists.**

### Decision PAY-013

**COD customer payment can be complete while Provider settlement remains pending.**

### Decision PAY-014

**Provider fees never reduce the recorded customer payment amount.**

### Decision PAY-015

**Settlement Batches are first-class for courier/gateway reconciliation.**

### Decision PAY-016

**Refund is independent from Return.**

### Decision PAY-017

**Refund method may differ from original Payment method.**

### Decision PAY-018

**Posted Payments are corrected through void/reversal/refund rather than silent edits.**

### Decision PAY-019

**Manual transaction references require duplicate protection.**

### Decision PAY-020

**Unmatched/unallocated financial transactions remain visible instead of being discarded.**

### Decision PAY-021

**Provider-specific APIs remain behind adapter boundaries.**

### Decision PAY-022

**Future gateway browser redirects are not sufficient by themselves to prove Payment.**

### Decision PAY-023

**Payment Provider events must be idempotently processed.**

### Decision PAY-024

**Payment reconciliation is a first-class operational capability, not an accounting afterthought.**

### Decision PAY-025

**Payment Provider fees belong to transaction/finance cost analysis, not Product landed cost.**

---

# 244. Resulting Payment Model

The core structure is now:

```text
                         ORDER
                           │
                           ▼
                    PAYMENT INTENT
                           │
                    ┌──────┴──────┐
                    │             │
                    ▼             ▼
               ATTEMPT 1      ATTEMPT 2
                 Failed        Successful
                                   │
                                   ▼
                                PAYMENT
                                   │
                                   ▼
                         PAYMENT ALLOCATION
                                   │
                                   ▼
                                 ORDER
```

Manual payment:

```text
bKash Instructions
       ↓
Customer Sends Money
       ↓
TxnID Submission
       ↓
Payment Attempt
       ↓
Manual Verification
       ↓
Confirmed Payment
       ↓
Order Allocation
```

COD:

```text
COD Intent
    ↓
Order Fulfilled
    ↓
Customer Pays Courier
    ↓
Customer Payment
    ↓
Order = Paid
    ↓
Courier Holds Funds
    ↓
Settlement Batch
    ↓
Provider Fees
    ↓
Net Remittance to Maevelle
```

Refund:

```text
Order Credit / Return / Cancellation
            ↓
       Refund Eligibility
            ↓
          Refund
            ↓
   Manual / Provider Execution
            ↓
        Confirmation
```

The most important improvement is that Maevelle can now distinguish:

```text
Customer paid us
```

from:

```text
Provider settled money to us
```

and from:

```text
We refunded the customer
```

without forcing all three into one `payment_status` field.

---

# 245. Architecture Milestone

We now have both sides of the commercial transaction connected:

```text
                    ACQUISITION SIDE

Supplier
  ↓
Purchase
  ↓
Inbound Shipment
  ↓
Landed Cost
  ↓
Inventory


                    SALES SIDE

Customer
  ↓
Order
  ↓
Payment
  ↓
Warehouse Allocation
  ↓
Fulfillment
  ↓
Future Delivery
```

Inventory sits between acquisition and sales.

---

# 246. Next Domain

The next document should be:

```text
docs/domains/customers/customer-architecture.md
```

This must define the **Customer** independently from future customer login/accounts.

It should cover:

```text
Guest Customer

Customer Identity

Name

Phone

Email

Multiple Addresses

Address History

Order History

Payment History

Return History

Customer Statistics

First / Last Order

Lifetime Spend

Average Order Value

Repeat Customer

Customer Notes

Internal Tags

Customer Source

Guest Matching

Duplicate Detection

Duplicate Merge

Phone Normalization

Email Normalization

Customer Editing

Customer Timeline

Customer Search

Customer Segmentation Foundation

Customer Account Relationship

Future Login

Future Saved Addresses

Future Cross-Device Cart

Privacy

Anonymization

Deletion / Retention

Permissions

Audit
```

A particularly important question will be:

```text
Guest orders:
017xxxxxxxx
```

today and:

```text
+88017xxxxxxxx
```

next month should not blindly create two unrelated Customers—but neither should the system aggressively merge two different people because they happen to share a family phone number.

So Customer Architecture needs a **safe identity-resolution and merge model**, not simply:

```text
UNIQUE(phone)
```

---

**End of Payment Architecture v0.1**
