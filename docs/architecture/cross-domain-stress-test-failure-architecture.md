# Maevelle Ecommerce — Cross-Domain Stress Test, Failure Recovery & Fallback Architecture

**Document:** `docs/architecture/cross-domain-stress-test-failure-architecture.md`
**Status:** Architecture Hardening / Adversarial Review
**Version:** 0.1
**Related:** All domain and architecture documents
**Purpose:** Find architectural leaks before final DDL and implementation

---

# 1. Purpose

This document attempts to break Maevelle's architecture under:

```text
Concurrency

Duplicate requests

Out-of-order events

Partial failure

Provider outages

Worker crashes

Database failures

Bad migrations

Incorrect operator actions

Malicious input

Stale projections

Data corruption

Unexpected business scenarios

Multi-domain race conditions
```

For every meaningful failure we ask:

```text
1. What triggers it?

2. What state must remain correct?

3. What dangerous state could occur?

4. How do we prevent it?

5. How do we detect it?

6. How do we recover?

7. Do we need compensation?

8. What gets audited?

9. What does the operator see?

10. What automated test proves it?
```

---

# 2. Core Principle

> **A failure is not handled merely because an exception was caught.**

Handling means we know:

```text
What committed

What did not commit

What may have happened externally

Whether retry is safe

Whether manual intervention is required

How the system becomes trustworthy again
```

---

# 3. Second Core Principle

> **Unknown is a valid operational state.**

Bad:

```text
External API timed out
→ assume failed
```

Better:

```text
External API timed out
→ UNKNOWN_EXTERNAL_OUTCOME
→ reconcile
```

This is essential for:

```text
Courier creation

Payment/refund provider operations

External settlement

Webhook delivery
```

---

# 4. Third Core Principle

> **Every destructive or money/stock-changing workflow needs an explicit recovery story.**

Examples:

```text
Refund

Inventory adjustment

Receipt posting

Transfer dispatch

Customer merge

Landed Cost finalization

Permission change
```

---

# 5. Fourth Core Principle

> **Retryability must be designed, not assumed.**

An operation can be:

```text
Safe to retry

Safe only with idempotency

Unsafe until external state reconciled

Never automatically retry
```

---

# 6. Fifth Core Principle

> **Derived data may be repaired automatically. Authoritative business history generally may not.**

Examples:

```text
Search Projection
→ rebuild automatically

Analytics Projection
→ rebuild automatically

Inventory Ledger
→ never silently rewrite

Payment
→ never silently fabricate

Audit
→ never silently rewrite
```

---

# 7. Failure Classification

Use the following classifications.

### F1 — Validation Failure

Nothing should commit.

### F2 — Authorization Failure

Nothing should commit.

### F3 — Concurrency Conflict

Retry/reload may be appropriate.

### F4 — Transaction Failure Before Commit

Nothing committed.

### F5 — Commit Succeeded, Response Lost

Idempotent retry returns original result.

### F6 — Local Success, Async Failure

Business truth committed; background work retries.

### F7 — External Outcome Unknown

Reconciliation required before duplicate-prone retry.

### F8 — Data Projection Corruption

Rebuild from authority.

### F9 — Authoritative Data Integrity Problem

Requires controlled repair/compensation.

### F10 — Infrastructure Failure

Degrade or stop safely.

### F11 — Security Incident

Contain, revoke, investigate, repair.

### F12 — Operator Error

Undo through domain-supported compensation where possible.

---

# 8. Failure State Vocabulary

Important workflows may need explicit states such as:

```text
PENDING

PROCESSING

FAILED_RETRYABLE

FAILED_PERMANENT

RECONCILIATION_REQUIRED

UNKNOWN_EXTERNAL_OUTCOME

BLOCKED

PARTIALLY_COMPLETED
```

Do not map every unexpected condition into:

```text
ERROR
```

---

# 9. System-Wide Recovery Hierarchy

Preferred recovery order:

```text
1. Automatic retry

2. Automatic reconciliation

3. Projection rebuild

4. Safe compensating transaction

5. Operator repair workflow

6. Controlled administrative repair

7. Emergency database repair
```

Direct database editing is the final option, not the normal one.

---

# 10. System-Wide Failure Record

For important recoverable failures, preserve:

```text
Failure Type

Affected Domain

Affected Entity

Detection Time

Current State

Retry Count

Last Error

Recommended Action

Assigned Operator foundation

Resolved At

Resolution Note
```

Not every exception needs a permanent record.

Only failures that may require operational attention.

---

# 11. Checkout Stress Test

## Scenario

100 customers attempt to buy the final unit simultaneously.

### Correct Result

```text
Exactly one qualifying reservation succeeds.

Others receive unavailable-stock result.
```

### Dangerous Result

```text
100 confirmed Orders
for one physical item.
```

### Prevention

```text
Server-side final availability check

Database transaction

Inventory row locking / atomic update

Reservation uniqueness/state integrity
```

### Detection

Inventory reconciliation must detect:

```text
Reserved > Sellable Stock
```

when overselling policy is disabled.

### Recovery

If corruption somehow occurs:

```text
freeze affected fulfillment

identify impacted Orders

operator resolution

release/cancel excess commitments

customer communication
```

Never silently make Inventory negative and continue.

### Test

High-concurrency automated reservation test.

---

# 12. Checkout — Cached Stock Stale

Storefront shows:

```text
In Stock
```

but final unit sold milliseconds earlier.

Correct:

```text
Checkout rejects/recalculates.
```

Storefront cache is advisory.

---

# 13. Checkout — Manipulated Price

Customer changes browser payload:

```text
unit_price = 1
```

Correct:

```text
server ignores submitted authoritative price
and recalculates from Catalog/Pricing/Promotion.
```

---

# 14. Checkout — Manipulated Discount

Customer submits:

```text
discount = 99%
```

Correct:

```text
ignored/rejected.
```

Only Promotion engine creates Discount Allocations.

---

# 15. Checkout — Product Becomes Unpublished

Customer adds Product to Cart.

Before checkout:

```text
Product unpublished
```

Policy must define whether unpublished means:

```text
cannot create new Order
```

Recommended:

```text
Yes.
```

Checkout revalidates Product/Variant sellability.

---

# 16. Checkout — Variant Disabled

Same rule.

Cart can retain historical line for UX, but checkout blocks it.

---

# 17. Checkout — Payment Method Disabled Mid-Checkout

Customer selected:

```text
COD
```

Admin disables COD before Order submission.

Final Order command revalidates available methods.

Correct:

```text
customer must choose another method.
```

Existing committed COD Orders remain valid.

---

# 18. Checkout — Promotion Expires Mid-Checkout

Cart displays discount.

Promotion expires before final submit.

Correct:

```text
server recalculates

customer sees changed payable amount

Order not silently placed at unexpected total
```

A price-change acknowledgement may be required in UX.

---

# 19. Checkout — Final Coupon Use Race

One global use remains.

Two checkouts simultaneously qualify.

Correct:

```text
one usage commits
one loses eligibility
```

Promotion usage and Order transaction must coordinate atomically.

---

# 20. Checkout — Order Commit Succeeds but HTTP Response Lost

Customer sees network error.

Customer retries same request with same Idempotency Key.

Correct:

```text
same Order returned

no duplicate reservation

no duplicate Payment Intent
```

---

# 21. Checkout — Client Uses Same Idempotency Key With Changed Cart

Correct:

```text
IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST
```

Never associate changed request with original successful result.

---

# 22. Cart Stress — Duplicate Button Click

Place Order tapped twice.

Same technical operation identity:

```text
one Order.
```

---

# 23. Business Duplicate Order

Customer intentionally places identical Order 10 minutes later.

This is not technical idempotency.

Duplicate-order detection may warn:

```text
Possible duplicate
```

but should not automatically discard legitimate second Orders.

---

# 24. Order + Inventory Atomicity

Dangerous:

```text
Order committed

reservation failed
```

leaving confirmed impossible Order.

Recommended invariant:

> A normal confirmed stock-dependent Order cannot commit unless required reservation succeeds.

---

# 25. Reservation Failure

Correct result:

```text
Order creation transaction fails/reverts
```

or Order remains a non-confirmed retryable Draft state if workflow intentionally uses one.

Never ordinary confirmed Order.

---

# 26. Cancellation Stress Test

Two operators cancel same Order simultaneously.

Correct:

```text
one cancellation effect
```

Second:

```text
already cancelled / idempotent result.
```

Inventory released exactly once.

---

# 27. Partial Cancellation Race

Operator A cancels quantity 2.

Operator B fulfills quantity 2 simultaneously.

Application must lock/revalidate line quantities so:

```text
cancelled + fulfilled
<= ordered
```

always.

---

# 28. Cancellation After Fulfillment

Cannot simply cancel already fulfilled quantity.

Correct workflow:

```text
Return / RTO / refund
```

depending situation.

---

# 29. Cancellation Releases Reservation

Physical stock does not move.

Correct:

```text
reservation released

Sellable On Hand unchanged

Available to Sell increases
```

---

# 30. Cancellation + Payment

Order cancelled after customer payment confirmed.

Cancellation cannot silently erase Payment.

System must surface:

```text
Refund required / outstanding customer credit
```

according to policy.

---

# 31. Cancellation + COD Unpaid

No Refund needed.

---

# 32. Order Edit After Confirmation

Dangerous:

```text
operator changes quantity
without adjusting reservation/payment/totals.
```

Confirmed Order amendments must use semantic commands.

---

# 33. Fulfilled Quantity Immutable

Confirmed Order edit cannot rewrite quantity below already fulfilled quantity.

---

# 34. Order Address Change

Before fulfillment:

```text
controlled amendment
```

may be allowed.

After courier booking:

```text
may require provider update/rebooking
```

and cannot simply change database address while external consignment retains old address.

---

# 35. Customer Change on Existing Order

Reassigning Order to another Customer is dangerous.

Recommended:

```text
highly restricted correction command
```

with audit.

Order customer/address snapshot remains historical.

---

# 36. Inventory Adjustment Stress

Two users adjust same Inventory Item.

Correct behavior depends command type.

### Difference-Based Adjustment

```text
+5
```

can safely apply sequentially.

### Target-Based Adjustment

```text
Set count to 100
```

requires expected version/current quantity validation to prevent stale overwrite.

---

# 37. Manual Adjustment With No Reason

Reject for posted adjustment.

Reason mandatory.

---

# 38. Large Adjustment

Example:

```text
1000 → 10
```

System should:

```text
warn

require elevated permission/confirmation

record before/after

possibly require reason detail
```

---

# 39. Adjustment Retry

Same Idempotency Key:

```text
one Inventory Transaction.
```

---

# 40. Inventory Ledger vs Level Mismatch

Detected:

```text
ledger says 50
level says 47
```

Correct response:

```text
mark inventory integrity unhealthy

block/limit sensitive mutation if necessary

recalculate projection from ledger

investigate source
```

If Level is only projection:

```text
rebuild Level.
```

Do not modify ledger to match Level.

---

# 41. Negative Sellable Stock

When oversell disabled:

```text
must be impossible under normal commands.
```

If detected:

```text
critical integrity incident.
```

---

# 42. Damaged Stock

Moving:

```text
SELLABLE → DAMAGED
```

must preserve total physical On Hand.

---

# 43. Disposal

Moving damaged goods out of physical inventory must reduce On Hand.

---

# 44. Return Approval vs Physical Return

Approving return does **not** add stock.

Correct:

```text
Return Approved
Stock unchanged
```

Only physical receiving does.

---

# 45. Returned Item Received Damaged

Correct:

```text
Return Receive
→ INSPECTION / DAMAGED
```

not immediately SELLABLE.

---

# 46. Transfer Dispatch Retry

Same Transfer Dispatch retried.

Correct:

```text
source deducted once.
```

---

# 47. Transfer Dispatch + Cancellation

Once dispatched, normal cancellation cannot teleport stock back.

Need:

```text
return transfer

loss resolution

receipt/re-dispatch workflow
```

---

# 48. Transfer Partial Receipt

Dispatch:

```text
10
```

Receipt:

```text
8
```

Remaining:

```text
2 IN TRANSIT / unresolved discrepancy
```

until resolved.

---

# 49. Transfer Damage

Dispatch 10.

Destination receives:

```text
8 sellable
1 damaged
```

and:

```text
1 missing
```

System needs explicit discrepancy resolution.

---

# 50. Transfer Destination Changed After Dispatch

Generally prohibit.

Physical goods already travelling to original destination.

Use controlled rerouting/new transfer workflow if necessary.

---

# 51. Stocktake Stress

Expected:

```text
100
```

Count:

```text
92
```

Posting creates:

```text
-8 adjustment
```

It does not rewrite old movements.

---

# 52. Concurrent Stocktake and Sales

Dangerous.

If sales occur while count session active:

```text
expected quantity changes.
```

Policy options:

```text
Freeze inventory operations

or

use count snapshot + movements-after-snapshot reconciliation
```

For V1, recommended:

> Stocktake session snapshots expected quantity at count start and posting reconciles movements occurring after snapshot.

A full warehouse freeze should remain optional.

---

# 53. Duplicate Stocktake Post

One Inventory adjustment transaction only.

---

# 54. Purchase Stress — Supplier Changes Price

Confirmed Purchase should not silently mutate historical commercial commitment.

Use amendment/revision.

---

# 55. Purchase Partial Cancellation

Ordered 100.

Supplier can supply only 80.

Correct:

```text
20 cancelled
80 active commitment
```

Shipment/receipt quantities reconcile accordingly.

---

# 56. Purchase Line Shipped More Than Ordered

Possible operationally due supplier over-shipment.

System should not automatically reject physical truth.

Correct:

```text
allow explicit over-shipment exception

require operator confirmation

preserve variance
```

---

# 57. Supplier Invoice > Purchase Amount

Possible due:

```text
fees

price change

mistake
```

Do not silently force equality.

Create reconciliation/variance.

---

# 58. Supplier Payment > Invoice Outstanding

Do not silently discard excess.

Possible:

```text
supplier advance / unallocated supplier payment
```

Foundation needed.

If V1 does not support advances fully:

```text
block over-allocation
```

while still allowing actual Payment to exist as partially unallocated where necessary.

---

# 59. Supplier Payment Retry

Must not record cash/payment twice.

---

# 60. Shipment Consolidation Stress

Shipment contains:

```text
Purchase A

Purchase B

Purchase C
```

One Shipment can proceed independently of Purchase status summaries.

No duplicated physical shipment quantity.

---

# 61. Shipment Allocation Double Count

Same Purchase Line quantity must not be allocated to two active shipment allocations exceeding legitimate quantity unless explicit over-shipment exception.

Reconciliation:

```text
allocated quantity
<= shippable commercial quantity
```

subject to approved variance.

---

# 62. Shipment Split

Shipment planned with 100 units.

Before dispatch split into:

```text
Shipment X: 60

Shipment Y: 40
```

Allocation history must remain traceable.

---

# 63. Shipment Merge

Two planned shipments consolidated.

Only allowed before incompatible physical milestones.

Post-dispatch merge should not rewrite historical transport events.

---

# 64. Shipment Arrival ≠ Receipt

Arrival recorded.

Warehouse unavailable for 2 days.

Correct:

```text
Shipment:
ARRIVED

Inventory:
unchanged
```

until receipt.

---

# 65. Canonical Inbound Receipt Stress

One Shipment includes multiple Purchases and Suppliers.

One physical Receipt can receive all physical lines.

Purchase-level received quantity is derived.

This confirms the canonical **Inbound Receipt** decision.

---

# 66. Receipt Partial

Expected 100.

First unload:

```text
60
```

Inventory increases by 60 only.

Remaining expected:

```text
40
```

---

# 67. Receipt Over Quantity

Expected 100.

Physical count:

```text
103
```

Do not force operator to lie.

Correct:

```text
record 103

flag +3 overage

require permission/reason
```

Inventory reflects physical truth.

Procurement reconciliation handles commercial implication.

---

# 68. Receipt Under Quantity

Expected 100.

Received 95.

Correct:

```text
95 physical Inventory

5 remaining expected / short depending shipment resolution.
```

---

# 69. Receipt Wrong Variant

Operator discovers Supplier sent Blue instead of Red.

Do not receive Red and change Catalog later.

Correct workflow:

```text
receive actual identifiable Variant
```

If Variant does not yet exist:

```text
receipt may remain unresolved/mapped to procurement item
```

until controlled Catalog mapping.

---

# 70. Unmapped Procurement Item

Purchase Line has no Catalog Variant.

System must not create sellable Inventory blindly.

Receipt can:

```text
receive into unresolved/quarantine context
```

until mapping is completed.

This is an important schema/API requirement.

---

# 71. Receipt Duplicate Submit

Button double-click/network retry.

Correct:

```text
one posted Receipt
one Inventory Transaction
```

---

# 72. Receipt Posting Crash

If DB transaction rolls back:

```text
Receipt not posted

Inventory unchanged.
```

If commit succeeds but response lost:

```text
idempotent retry returns posted Receipt.
```

---

# 73. Receipt Correction

Operator later discovers:

```text
received 50
actual 48
```

Do not edit posted Receipt to 48.

Use:

```text
Receiving Correction
→ compensating Inventory Transaction
```

and preserve discrepancy audit.

---

# 74. Landed Cost Stress — Missing Weight

Freight allocation uses:

```text
BY_WEIGHT
```

but one target missing weight.

Never:

```text
treat missing as zero silently.
```

Correct:

```text
block finalization

show missing basis
```

or explicit exclusion policy with operator acknowledgement.

---

# 75. Landed Cost Rounding

Allocated component:

```text
৳100
```

across 3 targets.

Rounded allocations must total:

```text
৳100 exactly.
```

Deterministic remainder strategy mandatory.

---

# 76. Landed Cost Negative Credit

Supplier/logistics credit:

```text
-৳2,000
```

must be allowed where cost type supports credit.

Do not globally enforce all Cost Components positive.

---

# 77. Estimate Replaced by Actual

Estimated freight:

```text
৳50,000
```

Actual:

```text
৳47,500
```

Correct total:

```text
৳47,500
```

not:

```text
৳97,500
```

Estimate and actual relationship must prevent double counting.

---

# 78. Finalized Landed Cost Changed Later

Late customs bill arrives.

Do not rewrite finalized revision invisibly.

Use:

```text
new revision / adjustment
```

and preserve variance.

---

# 79. Inventory Already Sold Before Final Cost

Allowed.

Quantity truth and cost-finalization truth are separate.

Later cost adjustment affects:

```text
costing/profitability projections
```

without changing physical Inventory.

---

# 80. Same Variant, Different Acquisition Cost

Must remain distinguishable.

This stress test confirms need for acquisition-cost provenance/layers.

---

# 81. Landed Cost Double Link

One Expense accidentally linked twice as two Cost Components.

Need:

```text
source reference duplicate detection
```

and reconciliation warnings.

---

# 82. Finance Double Counting Stress

Freight:

```text
Expense ৳50,000
```

linked into Landed Cost.

Correct management reporting must not treat:

```text
Finance Expense 50k
+
Inventory acquisition allocation 50k
```

as:

```text
100k cash expense.
```

Different analytical dimensions, one economic source.

---

# 83. Expense vs Payment

Rent Expense:

```text
৳20,000
```

Expense Payment:

```text
৳20,000
```

Correct:

```text
Expense = 20k
Cash Outflow = 20k
```

not:

```text
Expense = 40k.
```

---

# 84. Expense Partial Payment

Expense:

```text
100k
```

Payments:

```text
60k
20k
```

Correct:

```text
Outstanding = 20k
```

---

# 85. Expense Overpayment

Must not silently set:

```text
Outstanding = -20k
```

without an explicit advance/credit model.

If unsupported V1:

```text
block allocation beyond outstanding.
```

---

# 86. Expense Void After Payment

Cannot simply void paid Expense.

Need:

```text
settlement reversal/credit/correction
```

workflow.

---

# 87. Source-Backed Expense Edited Manually

Example provider fee generated from settlement.

Finance user cannot freely change:

```text
৳200 → ৳100
```

Correct source domain/correction must drive it.

---

# 88. Provider Settlement Stress

Customer collection:

```text
10,000
```

Provider fee:

```text
200
```

Net settlement:

```text
9,800
```

Correct:

```text
Payment principal = 10,000

Fee expense = 200

Cash inflow = 9,800
```

---

# 89. COD Settlement Missing

Courier marks Orders delivered but expected Settlement absent.

Correct:

```text
customer collection may be recognized

cash settlement remains outstanding

reconciliation issue opened
```

---

# 90. COD Amount Mismatch

Expected:

```text
1,500
```

Courier reports collection:

```text
1,300
```

Do not mark fully paid automatically.

Create:

```text
partial collection + mismatch issue
```

---

# 91. Payment Attempt Stress

Customer submits same bKash transaction ID twice.

Need duplicate transaction detection.

Do not create two confirmed Payments.

---

# 92. Manual Verification Race

Two agents verify same Payment Attempt simultaneously.

Correct:

```text
one confirmed Payment
```

Second sees already resolved.

---

# 93. Verify Wrong Amount

Customer claims:

```text
1,500
```

System/provider evidence shows:

```text
1,200
```

Verifier can record actual:

```text
1,200
```

Order becomes partially paid.

Never force expected amount.

---

# 94. Overpayment

Order due:

```text
1,000
```

Payment:

```text
1,100
```

Correct:

```text
Payment = 1,100

Allocation = 1,000

Unallocated/Customer Credit = 100
```

Do not truncate Payment to 1,000.

---

# 95. Payment Callback + Poll Race

Both discover same provider transaction simultaneously.

Unique provider transaction identity ensures:

```text
one Payment.
```

---

# 96. Payment Success Callback Out of Order

Provider sends:

```text
SUCCESS
```

then stale:

```text
PENDING
```

State must not regress.

---

# 97. Refund Stress — Double Click

Same Refund command submitted twice.

Correct:

```text
one Refund.
```

---

# 98. Refund Race

Two operators each refund:

```text
৳800
```

against refundable amount:

```text
৳1,000
```

Correct total cannot exceed:

```text
৳1,000
```

Refundable amount check requires concurrency protection.

---

# 99. Provider Refund Timeout

Provider may have processed refund but response lost.

State:

```text
UNKNOWN_EXTERNAL_OUTCOME
```

Do not retry creating another provider refund until reconciled.

---

# 100. Refund Provider Success But Local Update Fails

Reconciliation later detects provider refund.

Local Refund transitions accordingly.

No duplicate external refund.

---

# 101. Return Without Refund

Valid.

Return is physical/commercial process.

Refund separate.

---

# 102. Refund Without Return

Can also be valid:

```text
goodwill refund

delivery-fee refund

partial compensation
```

Do not force Return entity.

---

# 103. Exchange

Do not model as one magical state.

Recommended:

```text
Return workflow

+

new/replacement Order/Fulfillment relationship
```

---

# 104. Customer Identity Stress — Shared Phone

Mother and daughter use same phone.

System must not auto-merge.

Correct:

```text
duplicate candidate / shared-contact warning.
```

---

# 105. Recycled Phone Number

New person receives old number.

Phone equality cannot prove same Customer forever.

---

# 106. Same Email Typo

Two Customers accidentally created due formatting/case.

Matching can suggest merge.

No blind automatic merge.

---

# 107. Customer Merge Race

Two operators merge Customer A into:

```text
B
```

and:

```text
C
```

simultaneously.

Must lock canonical merge state.

Only one canonical path survives.

---

# 108. Merge Cycle

Prevent:

```text
A → B

B → A
```

and longer cycles.

Canonical resolution must always terminate.

---

# 109. Merge With Blocked Customer

If A blocked and B active:

```text
block status cannot disappear silently.
```

Merge preview must surface conflict.

---

# 110. Merge With Customer Account

Future Account identity conflicts require deliberate resolution.

Do not attach one Account to two Customers.

---

# 111. Merge Historical Orders

Do not rewrite Order snapshots.

Analytics/customer profile uses canonical resolution.

---

# 112. Wrong Customer Merge

Because merge may be difficult to undo:

```text
preview

strong permission

clear evidence

audit
```

required.

Future unmerge may be complex and not guaranteed.

---

# 113. Customer Delete Request

Commercial history exists.

Correct:

```text
privacy/anonymization workflow
```

not cascade deletion.

---

# 114. Media Stress — Duplicate Upload

Same file uploaded 20 times.

Checksum can identify duplicate candidate.

Whether to reuse Asset is policy-driven.

Do not automatically merge sensitive/private and public Assets without access-context validation.

---

# 115. Media MIME Spoof

File named:

```text
photo.jpg
```

contains executable/non-image.

Content validation rejects/quarantines.

---

# 116. Huge Pixel Bomb

Tiny compressed file decompresses to massive image.

Pixel/dimension limits protect processor.

---

# 117. Media Processing Crash

Asset stays:

```text
PROCESSING / FAILED
```

not READY.

Retry safe.

---

# 118. Asset Deleted While Upload Processing

Concurrency must ensure worker cannot resurrect purged Asset incorrectly.

---

# 119. Asset Used While Admin Deletes It

Deletion command rechecks active authoritative usages transactionally.

Correct:

```text
block deletion

show usages.
```

---

# 120. Usage Projection Stale

Media Library says:

```text
0 usages
```

but Product FK references Asset.

Deletion authority checks actual domain references.

This validates our earlier design.

---

# 121. Product Asset Replacement

Reused Asset appears on 30 Products.

Global replace should require impact preview.

Default safer action:

```text
new Asset + relink selected usage.
```

---

# 122. Private Payment Evidence Accidentally Selected for Product

Asset access classification/context validation must prevent private sensitive Asset appearing in public Catalog usage.

---

# 123. Reviews Stress — Fake Verified Review

Client submits:

```text
verified_purchase = true
```

Server ignores it.

Verification derives from eligible Order Line.

---

# 124. Review Link Reuse

One secure review invitation used multiple times.

Policy must define:

```text
one review per eligible purchase/product/customer
```

and enforce usage idempotency.

---

# 125. Review Product Ref Changed

Historical eligible Order Line determines Product/Variant.

Client cannot review arbitrary Product through modified ID.

---

# 126. Review Media Before Moderation

Must remain non-public.

---

# 127. Review Approved Then Product Archived

Review history remains.

Public visibility follows Product/storefront policy.

---

# 128. Low-Rating Notification Failure

Review remains submitted.

Notification retry independent.

---

# 129. Promotions Stress — Circular Conditions

Rule builder must prevent impossible/self-referential configuration.

Example:

```text
Promotion applies only if Promotion X already applied
```

unless combination architecture deliberately supports it.

V1 typed rule engine should avoid such recursion entirely.

---

# 130. Promotion Stacking Race

Two Promos each individually qualify but combination policy disallows both.

Evaluation order must be deterministic.

---

# 131. Promotion Order Changes

Same Promotions evaluated twice should produce same result given same state/context.

Deterministic ordering mandatory.

---

# 132. Private Coupon Guessing

Use sufficient code entropy and rate limiting.

Public errors should not reveal:

```text
valid code but not for you
```

unless UX/business needs it.

---

# 133. Coupon Disabled After Order

Historical Order discount remains.

Promotion Usage remains.

---

# 134. Notification Storm

Bug emits 100,000 low-stock events.

Protection:

```text
event dedupe

condition-transition semantics

rate controls

queue priorities

provider rate protections
```

Security/Payment Notifications must not starve.

---

# 135. Notification Provider Down

Business transactions unaffected.

Queue retains delivery attempts.

---

# 136. Notification Render Failure

Do not send raw template placeholders.

Mark:

```text
RENDER_FAILED
```

and alert for critical message type.

---

# 137. User Disabled Before Notification Delivery

Routine internal Notification can be suppressed.

Security/audit record remains.

---

# 138. Permission Removed After Notification Created

Deep link re-authorizes current permission.

Notification never grants stale access.

---

# 139. Webhook Stress — Endpoint Down

Webhook retries.

Domain event remains committed.

---

# 140. Webhook Duplicate Delivery

Consumer expected to dedupe using Webhook Event ID.

Maevelle retains same logical Event with multiple Delivery Attempts.

---

# 141. Webhook Out-of-Order Delivery

External consumer receives:

```text
order.cancelled

before

order.created
```

possible due retry timing.

Contract must explicitly not guarantee global ordering.

Resource version helps consumer.

---

# 142. Webhook Endpoint Returns 200 but Did Not Process

Maevelle cannot know.

At-least-once contract cannot guarantee remote business processing.

External consumer owns correct acknowledgement semantics.

---

# 143. Webhook Timeout After Remote Processed Event

Maevelle retries.

Consumer deduplication prevents duplicate effect.

---

# 144. Webhook Endpoint Redirects to localhost

SSRF protection blocks unsafe redirect.

---

# 145. Webhook Endpoint DNS Rebinding

Destination validation must consider resolved connection destination, not only saved hostname.

---

# 146. Provider Callback Forgery

Invalid signature:

```text
reject

security log

no domain mutation.
```

---

# 147. Provider Callback Replay

Valid old callback replayed 100 times.

Event dedupe ensures one effect.

---

# 148. Provider Callback Unknown Reference

Do not create arbitrary local entity.

Create integration exception.

---

# 149. Provider Callback Wrong Organization/Account

Merchant account/provider mapping mismatch:

```text
reject/reconciliation issue.
```

---

# 150. External Mapping Collision

One external consignment maps to two Local Deliveries.

Unique mapping constraint should prevent unless provider semantics explicitly allow.

---

# 151. Integration API Timeout — Create Courier

Dangerous if blindly retrying.

Correct:

```text
UNKNOWN_EXTERNAL_OUTCOME
```

then:

```text
query provider using merchant reference.
```

---

# 152. Provider Does Not Support Idempotency

Maevelle must use:

```text
stable merchant reference

local operation record

reconciliation
```

to avoid duplicates.

---

# 153. Provider Authentication Expires

Integration status:

```text
ERROR / AUTH_REQUIRED
```

New provider-dependent jobs stop/retry appropriately.

Existing Maevelle business history remains.

---

# 154. Provider Rate Limit

Queue respects:

```text
Retry-After / backoff
```

and avoids immediate retry storm.

---

# 155. Search Projection Failure

Product published.

Search update fails.

Correct:

```text
Product remains published

search projection unhealthy/pending

worker retries.
```

---

# 156. Search Completely Corrupted

Correct:

```text
drop/rebuild search projection.
```

Catalog remains authority.

---

# 157. Search Shows Archived Product

Projection lag.

Final Product detail/read should verify publish/effective status or projection update latency must be sufficiently bounded.

Never checkout archived Variant from stale search result.

---

# 158. Analytics Projection Duplicate Event

Unique source fact prevents duplicate Sales.

---

# 159. Analytics Missing Two Days

Source truth preserved.

Backfill restores.

Dashboard shows freshness warning until repaired.

---

# 160. Analytics Formula Bug

Fix Metric definition/projection.

Backfill.

Do not manually adjust dashboard number.

---

# 161. Refund After Reporting Period

Analytics must distinguish:

```text
refund activity date

economic attribution to original sale.
```

Already established.

Stress test confirms this is necessary.

---

# 162. Missing FX Rate

No 1:1 fallback.

Report:

```text
Incomplete due to missing FX
```

and list affected records.

---

# 163. Incorrect FX Rate Entered

Correction must preserve:

```text
which reports/transactions used old rate
```

depending reporting/transaction semantics.

Historical transaction-specific FX snapshots are not silently rewritten unless correcting an explicitly erroneous source under controlled process.

---

# 164. Settings Stress — Default Currency Changed

Historical:

```text
BDT Orders remain BDT.
```

Future new records use new default where applicable.

---

# 165. Settings — Timezone Changed

Stored instants unchanged.

Daily reporting boundaries may change according to selected reporting timezone.

---

# 166. Settings — Default Warehouse Disabled

System detects dependency.

Deactivation requires replacement or resulting configuration warning/block.

---

# 167. Settings — COD Disabled With Existing COD Orders

Existing Orders remain valid.

Only future selection stops.

---

# 168. Settings — Reservation Timeout Changed

Need explicit policy.

Recommended:

```text
existing Reservations retain their existing expires_at

new Reservations use new policy.
```

This prevents surprise mass expiration.

---

# 169. Settings Concurrent Edit

Two admins edit same setting page.

Version conflict prevents stale overwrite.

---

# 170. Security Stress — Permission Revoked During Active Session

Next protected request must reflect revocation promptly.

Long-lived embedded capability token cannot continue indefinitely.

---

# 171. Security — User Disabled While Long Job Running

If job represents user-requested sensitive action:

```text
job should revalidate actor context before sensitive execution
```

where delayed execution matters.

---

# 172. Security — API Key Revoked

Pending client requests after revocation fail.

Already committed transactions remain.

---

# 173. Security — Compromised API Key Creates Many Orders

Controls:

```text
capability scope

rate limit

audit

revocation

duplicate/idempotency
```

Incident workflow identifies blast radius.

---

# 174. Security — Session Theft

Owner/admin can revoke sessions.

Password/MFA reset invalidates according to policy.

---

# 175. Security — Privilege Escalation via Mass Assignment

Request:

```text
{
  "name": "User",
  "is_owner": true
}
```

Explicit DTO ignores/rejects protected field.

---

# 176. Security — Cross-Organization ID

Should fail at:

```text
repository scope

authorization

and relational constraint where mutation attempted.
```

Defense in depth.

---

# 177. Security — Export Leakage

Shared report/export permissions must be rechecked at generation time.

Generated file private.

Link expiry/retention controlled.

---

# 178. Security — Logs Contain Secret

Secret scanning/redaction tests must detect common credential formats.

Known leak requires rotation—not only log deletion.

---

# 179. Security — Malware Upload

Quarantine + scan/process failure.

Never publicly served before readiness and domain publication.

---

# 180. Database Failure — Transaction Before Commit

PostgreSQL connection drops before commit confirmation.

Application may not know whether commit occurred.

This can become:

```text
UNKNOWN_COMMIT_OUTCOME
```

for rare cases.

Idempotency must allow safe retry/reconciliation using operation ID.

---

# 181. Database Failover Future

Same principle applies.

Never rely solely on client exception type to prove rollback when commit acknowledgement was lost.

---

# 182. Database Deadlock

Transaction aborted.

Application recognizes retryable SQL state.

Retry only safe/idempotent transaction.

---

# 183. Database Lock Timeout

Return concurrency/retryable error.

Do not hold request forever.

---

# 184. Database Constraint Failure

Map expected invariant conflict to domain-safe error.

Do not expose raw SQL.

---

# 185. Database Disk Full

Critical.

Likely:

```text
writes fail

system becomes degraded/unavailable.
```

Alert before full via monitoring.

Do not continue accepting Order confirmations if commit reliability compromised.

---

# 186. VPS Crash During Order

PostgreSQL durability determines committed state.

Idempotency helps client resolve unknown response.

---

# 187. Worker Crash Mid-Job

Lease expires.

Another worker retries.

Handler idempotent.

---

# 188. Worker Sends Email Then Crashes Before Marking Success

Potential duplicate email on retry.

Mitigation:

```text
provider idempotency where available

provider message reference

best-effort dedupe

recognize exactly-once external delivery cannot be guaranteed.
```

This remains a known residual risk.

---

# 189. Worker Calls Courier Create Then Crashes

Much more dangerous than duplicate email.

Must persist Integration Operation before call and reconcile ambiguous outcome before retry.

---

# 190. Job Poison Message

Repeatedly crashes worker.

After bounded attempts:

```text
DEAD_LETTER
```

Other queue work continues.

---

# 191. Queue Starvation

500k analytics jobs arrive.

Critical payment reconciliation must retain worker capacity.

Use:

```text
priority

separate concurrency pools
```

---

# 192. Outbox Consumer Failure

Webhook consumer fails.

Notification/Analytics consumers continue.

Consumer receipts independent.

---

# 193. Outbox Event Malformed

Do not block entire dispatcher.

Dead-letter consumer-specific processing.

Alert.

---

# 194. Missing Outbox Event

Critical reconciliation jobs compare domain records with expected projection/integration state.

Example:

```text
Order committed

no analytics fact
```

Analytics backfill fixes.

For critical external operations, application workflows should detect pending action from authoritative state, not rely only on event history.

---

# 195. Deployment Stress — New Code Before Migration

Application must verify schema compatibility and fail startup or remain on old version.

---

# 196. Migration Before Compatible Code

Use expand/contract.

Avoid destructive migration that old instances cannot tolerate.

---

# 197. Failed Migration Midway

Migration framework records status.

Operator must know whether migration transaction rolled back or partially applied.

High-risk migrations should be transactional where PostgreSQL allows.

---

# 198. Data Backfill Crash

Backfill resumes idempotently from checkpoint/batch.

Do not restart from scratch if that duplicates transformed records.

---

# 199. Rolling Deployment Future

Old and new app versions coexist.

Schema must temporarily support both.

---

# 200. Job Payload From Old Version

Worker reads:

```text
payload_version
```

and either:

```text
handles old version

migrates payload

or fails explicitly.
```

---

# 201. Webhook Event Schema Old Version

Active subscribers continue receiving contracted old version until migrated/deprecated.

---

# 202. Configuration Cache Stale

High-risk config changes use versioned invalidation.

Final domain command still revalidates authoritative state where necessary.

---

# 203. Next.js Cache Stale

Public Product price/availability may be briefly stale.

Checkout server remains authoritative.

---

# 204. Backup Stress — Backup Exists But Corrupted

Regular restore testing discovers before disaster.

---

# 205. Backup On Same VPS

Not sufficient.

Host loss removes both production and backup.

Off-host copy mandatory.

---

# 206. Backup Missing Object Storage

Database restore works but Product images/private docs missing.

Recovery plan must cover both:

```text
DB

Object Storage
```

---

# 207. Restore Database Older Than Object Storage

Potential orphan/newer objects.

Media reconciliation detects mismatches.

---

# 208. Restore Object Storage Older Than DB

DB references missing objects.

Media health flags.

Critical private documents may require restoration from object-store backup/versioning.

---

# 209. Restore Test With Real Customer Data

Must occur in secure isolated environment.

Prefer anonymized/test restoration practices where possible.

---

# 210. Disaster Recovery — Complete VPS Loss

Recovery sequence:

```text
1. Provision server

2. Restore secure infrastructure configuration

3. Restore PostgreSQL

4. Connect/restore Object Storage

5. Deploy compatible application release

6. Verify schema

7. Start API

8. Start workers

9. Verify outbox/jobs

10. Run integrity checks

11. Reopen traffic
```

---

# 211. System Clock Incorrect

Dangerous for:

```text
tokens

expiry

promotions

jobs

audit.
```

VPS must use reliable time synchronization.

Application uses server/database trusted time, not browser time.

---

# 212. Client Clock Wrong

No authority.

Promotion eligibility/order timestamps use server time.

---

# 213. Sequence Failure

Number sequence allocation fails.

Do not create Order with duplicate/empty official number if number required at creation.

Transaction rolls back/retries.

---

# 214. Sequence Gaps

Acceptable.

Never attempt dangerous rollback/reuse of allocated number solely to keep sequence gapless.

---

# 215. Import Stress — Duplicate File Upload

Import Batch has unique identity/idempotency.

Same file can be detected by checksum but may legitimately be imported again intentionally.

Do not auto-block solely by checksum.

---

# 216. Import Crash at Row 50,000

Previously committed rows tracked.

Retry resumes/fails remaining rows safely.

---

# 217. Inventory Import

Must create controlled Inventory adjustment/opening transactions.

No direct:

```text
UPDATE inventory_levels
```

---

# 218. Customer Import Duplicate Phone

Should create:

```text
candidate/matching decision
```

not blindly overwrite existing Customer by phone.

---

# 219. Product Import Duplicate SKU

Reject/conflict unless explicit update mode.

---

# 220. CSV Formula Injection

Exported user-controlled values safe for spreadsheet consumers.

---

# 221. Malformed Huge Import

Bound:

```text
file size

rows

columns

cell length
```

to avoid memory/resource exhaustion.

---

# 222. Operator Error — Wrong Inventory Adjustment

Correction:

```text
compensating Inventory adjustment
```

not history deletion.

---

# 223. Operator Error — Wrong Payment Verified

Need:

```text
Payment reversal/correction workflow
```

with strong permission.

Do not delete Payment row.

---

# 224. Operator Error — Wrong Refund

If external refund already paid:

```text
cannot undo money movement trivially.
```

System records correct history and may require new customer charge/recovery outside Refund reversal.

This is residual operational risk.

---

# 225. Operator Error — Wrong Customer Merge

High-impact.

Prevention more important than recovery.

Require:

```text
preview

strong permission

conflict summary

confirmation.
```

---

# 226. Operator Error — Wrong Receipt Variant

If posted, correction workflow must reverse/move incorrect received Inventory and record corrected item.

Do not edit ledger.

---

# 227. Operator Error — Wrong Landed Cost Allocation

If not finalized:

```text
edit Draft.
```

If finalized:

```text
revision/adjustment.
```

---

# 228. Operator Error — Wrong Expense Category

Reclassification may be allowed with audit if economic amount unchanged.

Category changes are less severe than amount/cash changes.

---

# 229. Operator Error — Wrong Security Permission

Audit + security notification.

Revocation takes effect promptly.

Review actions performed during exposure window.

---

# 230. Domain Health Model

Each critical domain should expose health checks.

### Inventory Health

```text
Negative unavailable states

Ledger/Level mismatch

Reservations > Sellable

Unresolved transfer discrepancy
```

### Payments Health

```text
Duplicate provider refs

Allocation > Payment

Refund > refundable amount

Unmatched settlement
```

### Procurement Health

```text
Receipt > expected unresolved

Purchase/Shipment mismatch

Unmapped received items
```

### Landed Cost Health

```text
Unallocated component amount

Missing basis

Allocation total mismatch
```

### Finance Health

```text
Account balance mismatch

Expense settlement mismatch
```

---

# 231. Global Integrity Dashboard

Recommended internal screen:

```text
Critical Integrity Issues

Inventory

Payments

Finance

Procurement

Media

Integrations

Analytics
```

---

# 232. Health Issue Severity

```text
INFO

WARNING

ERROR

CRITICAL
```

---

# 233. Critical Health Issue Behavior

Some failures should block related operations.

Example:

```text
Inventory Item ledger corrupted
```

May block new reservations for that Item until repaired.

---

# 234. Do Not Block Whole Platform Unnecessarily

One corrupt Inventory Item should not necessarily disable:

```text
all Products

all Orders.
```

Scope failure.

---

# 235. Reconciliation Jobs

Essential periodic jobs:

```text
Inventory Ledger ↔ Levels

Payments ↔ Allocations

Refund totals

COD Settlements

Finance Account Ledger ↔ Balance

Purchase/Shipment/Receipt Quantities

Landed Cost Component ↔ Allocation totals

Media DB ↔ Object Storage

Analytics projections ↔ source samples/totals
```

---

# 236. Reconciliation Is Not Repair

Job detects.

Repair is separate controlled operation.

---

# 237. Repair Records

Every manual/automatic repair should record:

```text
Issue

Method

Before

After

Actor/System

Reason

Timestamp
```

---

# 238. Projection Repair

Can be:

```text
rebuild
```

with no business compensation.

---

# 239. Ledger Repair

Requires:

```text
compensating domain transaction.
```

---

# 240. Security Repair

Example:

```text
revoke compromised credential

revoke sessions

reverse unauthorized mutations through domains.
```

---

# 241. Recovery UX Principle

Operators should not need SQL knowledge to resolve normal failures.

---

# 242. Integration Exception UX

Should offer:

```text
Retry

Reconcile

Link External Record

Ignore With Reason

Open Provider
```

depending scenario.

---

# 243. Payment Reconciliation UX

Should show:

```text
Expected

Observed

Difference

Provider Reference

Recommended actions
```

---

# 244. Inventory Integrity UX

Should show:

```text
Ledger quantity

Materialized quantity

Reservation quantity

Difference

Related recent movements
```

---

# 245. Receiving Exception UX

Show:

```text
Expected

Received

Damaged

Missing

Overage

Unmapped
```

---

# 246. Landed Cost Error UX

Show exactly:

```text
which target lacks basis

which component fails allocation

difference after rounding
```

rather than generic:

```text
Calculation failed.
```

---

# 247. Failure Observability

Every critical failure should be diagnosable using:

```text
Request ID

Operation ID

Entity ID

Job ID

Provider Reference

Audit timeline
```

---

# 248. Cross-Domain Correlation

Example Order:

```text
Order ID
→ Reservation
→ Payment Intent
→ Fulfillment
→ Notification
→ Webhook
```

operator should navigate these relationships.

---

# 249. Human Timeline vs Audit

Human Timeline:

```text
operationally understandable
```

Audit:

```text
detailed actor/change evidence.
```

Keep separate.

---

# 250. Required Automated Stress Suites

Create dedicated tests:

```text
checkout-concurrency.spec

inventory-concurrency.spec

promotion-usage-concurrency.spec

payment-idempotency.spec

refund-concurrency.spec

receipt-idempotency.spec

transfer-partial-receipt.spec

customer-merge-concurrency.spec

job-leasing.spec

outbox-consumer-retry.spec

provider-callback-idempotency.spec
```

---

# 251. Fault Injection Tests

Intentionally simulate:

```text
DB exception after validation

network timeout after external success

worker kill mid-job

provider 500

provider 429

provider malformed response

cache unavailable

search unavailable

object storage unavailable
```

---

# 252. Database Fault Injection

Especially test:

```text
deadlock

serialization failure

lock timeout

connection loss

commit response ambiguity
```

---

# 253. Worker Fault Injection

Kill worker:

```text
before side effect

after side effect

before status update

during retry scheduling.
```

---

# 254. Integration Fault Injection

Simulate:

```text
external success + local timeout

duplicate callback

out-of-order callback

invalid signature

missing provider reference
```

---

# 255. Migration Fault Tests

Simulate:

```text
old app + new schema

new app + old schema

backfill interrupted

new column partially populated
```

---

# 256. Restore Drill

At regular operational intervals:

```text
restore database

restore/connect objects

deploy app

run integrity suite

validate sample Orders/Inventory/Payments.
```

---

# 257. Load Tests

High-priority scenarios:

```text
Product browse

Search

Cart

Checkout

Order creation

Admin order queue

Inventory adjustment

Receiving

Large Product catalog queries
```

---

# 258. Stress vs Load

Load test:

```text
normal expected traffic at volume.
```

Stress test:

```text
push beyond expected limits
to observe graceful degradation.
```

Both needed.

---

# 259. Soak Test

Run sustained workload for hours to discover:

```text
memory leaks

connection leaks

queue buildup

disk growth

slow query degradation.
```

---

# 260. Chaos Test — Worker Offline for 2 Hours

Expected:

```text
Orders continue

async queues accumulate

health alerts

workers restart

queues drain.
```

---

# 261. Chaos Test — Email Provider Offline for 12 Hours

Expected:

```text
no domain rollback

retry schedule bounded

no retry storm

critical failures visible.
```

---

# 262. Chaos Test — Courier Provider Offline

Expected:

```text
Orders remain

delivery creation queued/failed visibly

operator can switch/manual handle if policy allows.
```

---

# 263. Chaos Test — Search Down

Expected:

```text
direct navigation/category browsing may continue

checkout unaffected.
```

---

# 264. Chaos Test — Analytics Down

Operational Admin functions continue.

---

# 265. Chaos Test — Redis Down Future

Business truth remains.

---

# 266. Chaos Test — Object Storage Down

Existing cached/public assets may continue.

New media uploads unavailable.

Order creation without upload dependency continues.

---

# 267. Chaos Test — Database Down

Correct:

```text
write operations fail

no fake success

read cache may serve public safe content

system reports DB outage.
```

---

# 268. Architecture Leak Found #1

## Need explicit **Unresolved Received Item** handling.

Earlier architecture allowed unmapped Purchase Lines but Receipt design assumed `inventory_item_id`.

Real-world case:

```text
Supplier sends wrong/new SKU
and warehouse physically receives it.
```

We must not lose physical truth.

### Refinement

Inbound Receipt Line should allow a controlled state:

```text
UNRESOLVED_ITEM
```

with:

```text
procurement/shipment item reference

actual quantity

condition

temporary physical identity / description
```

but **must not post into normal sellable Inventory Item** until mapped.

Possible architecture:

```text
Receiving Exception / Unresolved Receipt Line
```

remains outside normal Inventory ledger until resolution,

or receives into a dedicated unresolved/quarantine inventory identity.

### Recommended V1

Use:

```text
Inbound Receipt Line
status = UNRESOLVED

inventory_item_id nullable until resolution
```

and do not post unresolved quantity to normal Inventory ledger.

Warehouse UI clearly shows:

```text
Physically Received — Mapping Required
```

A dedicated future quarantine/unidentified stock model can improve this.

---

# 269. Architecture Leak Found #2

## Need explicit handling of **Reservation expiration race**.

Scenario:

```text
Reservation expires at 10:00:00

Customer payment confirms at 10:00:00
```

Two workers/processes race.

### Refinement

Reservation expiry and Order/Payment workflow must coordinate on locked current reservation state.

Expiration job:

```text
lock Reservation

recheck status

recheck Order/payment conditions

expire only if still eligible.
```

Payment callback cannot merely assume existing reservation.

If payment arrives after legitimate release:

```text
Order enters PAYMENT_RECEIVED_STOCK_UNAVAILABLE exception
```

rather than silently re-reserving without policy.

This must be handled in Order lifecycle.

---

# 270. Architecture Leak Found #3

## Need explicit **Payment received after Order cancellation** scenario.

Example:

```text
Manual bKash customer sends money late

Order already cancelled.
```

Correct:

```text
Payment remains real money

do not reactivate Order automatically

Payment becomes unallocated / reconciliation-required

operator may refund or create/reopen commercial arrangement.
```

This reinforces Payment independence from Order.

---

# 271. Architecture Leak Found #4

## Need explicit **Fulfillment creation vs reservation allocation** mapping.

An Order Line may have:

```text
Location A reservation 2

Location B reservation 1
```

Fulfillment must consume specific reservation allocations, not merely:

```text
Order Line quantity = 3.
```

### Refinement

Fulfillment Line should reference/associate with:

```text
reservation allocation(s)
```

or application must maintain an explicit consumption bridge.

Recommended relational concept:

```text
fulfillment_inventory_allocations
```

linking:

```text
Fulfillment Line
↔ Reservation Allocation
↔ Quantity Consumed
```

This gives precise stock provenance.

---

# 272. Architecture Leak Found #5

## Need explicit financial treatment for **Supplier advances/unallocated supplier payments**.

Procurement Architecture hinted at advances.

Stress tests show actual money can be sent before Invoice.

### Refinement

Supplier Payment cannot require full allocation to Supplier Invoice.

Support:

```text
unallocated supplier payment amount
```

or supplier advance balance foundation.

Do not fake an Expense merely to consume payment.

---

# 273. Architecture Leak Found #6

## Need explicit **Expense credit / vendor refund** mechanism.

If logistics provider refunds:

```text
৳5,000
```

we should not delete old Expense or enter misleading negative cash manually.

Need:

```text
Expense Adjustment / Credit
```

foundation.

Could be modeled as:

```text
finance.expense_adjustments
```

or credit-type Finance Transaction linked to Expense.

Concrete DDL stage should resolve exact representation.

---

# 274. Architecture Leak Found #7

## Need a canonical distinction between **Order financial summary** and Payment truth.

For fast Order Admin screen we may maintain:

```text
paid_amount

balance_due

refund_amount
```

projection.

But Payment Allocations remain authority.

### Refinement

Any fields on `orders.orders` representing payment totals must be explicitly:

```text
projection/cache
```

and reconcilable.

Alternatively calculate through read projection/table.

Do not let mutation logic write both independently without controlled service.

---

# 275. Architecture Leak Found #8

## Need explicit **financial period / close snapshot** foundation later.

Late refunds/cost adjustments can change historical economics.

Analytics already distinguished:

```text
Activity View

Economic Attribution View
```

Stress tests confirm future management close may need:

```text
Period Snapshot
```

but not full accounting close V1.

Architecture should leave room for:

```text
analytics.metric_snapshots
```

or future Finance Period entity.

---

# 276. Architecture Leak Found #9

## Need stronger representation of **External Operation**.

Integration operation should have:

```text
operation_key

request fingerprint

provider account

local resource

external reference

attempts

outcome certainty
```

with states:

```text
PENDING

SENT

CONFIRMED_SUCCESS

CONFIRMED_FAILURE

UNKNOWN_OUTCOME

RECONCILIATION_REQUIRED
```

This is essential for duplicate-prone provider operations.

---

# 277. Architecture Leak Found #10

## Need explicit **Domain Integrity Issues** concept.

We currently have:

```text
Payment Reconciliation Issue

Integration Exception

Analytics Data Quality
```

but cross-domain consistency checks may need one operational framework.

Recommended lightweight platform concept:

```text
Integrity Issue
```

fields:

```text
domain

issue_type

severity

entity

detected_at

status

repair_reference
```

Domain remains responsible for meaning/repair.

This gives one integrity dashboard without centralizing business logic.

---

# 278. Architecture Leak Found #11

## Need **Job Actor Context**.

A background job requested by an Admin may execute later.

Payload should preserve:

```text
initiated_by actor

organization

requested permissions/context
```

but sensitive actions must often revalidate current permission at execution time.

### Rule

```text
Historical actor context
≠
permanent authorization grant.
```

---

# 279. Architecture Leak Found #12

## Need explicit distinction between **System Jobs** and **User-Requested Jobs**.

Examples:

### System Job

```text
Expire Reservations
```

uses SYSTEM principal.

### User Job

```text
Bulk Refund

Large Export
```

must preserve requesting Membership and current authorization rules.

---

# 280. Architecture Leak Found #13

## Need explicit **Critical Queue Isolation**.

One generic queue priority may be insufficient once real workloads grow.

V1 PostgreSQL Jobs can include:

```text
queue_name
```

such as:

```text
critical

default

media

analytics
```

even if all stored in same table.

This prepares later separate workers.

---

# 281. Architecture Leak Found #14

## Need customer-facing handling when **price changes after checkout review**.

If final recalculation materially changes total:

```text
customer must see/accept updated amount
```

rather than backend silently place higher Order.

API may return:

```text
CHECKOUT_CHANGED
```

with updated Checkout Quote.

This suggests a first-class:

```text
Checkout Quote / Calculation Version
```

may be valuable.

---

# 282. Checkout Quote Foundation

Potential concept:

```text
quote_id

cart_version

pricing_version/context

expires_at

calculated totals
```

Final Order still recalculates/validates.

V1 may not need persistent Quote table, but API should support:

```text
calculation token/version
```

to detect changed checkout.

---

# 283. Architecture Leak Found #15

## Need clearer distinction between **Inventory unavailable** and **Inventory integrity unavailable**.

Normal:

```text
OUT_OF_STOCK
```

Different from:

```text
INVENTORY_BLOCKED_DUE_TO_INTEGRITY_ISSUE
```

Admin/support needs different remediation.

Public Storefront can show generic unavailable message.

---

# 284. Architecture Leak Found #16

## Need explicit stale-data behavior in Admin edits.

Example Product editor open for 2 hours.

Other Admin changed Variants.

Autosave blindly submits.

Version conflict must:

```text
stop overwrite

show differences

allow refresh/merge.
```

---

# 285. Architecture Leak Found #17

## Need **repair commands**, not only normal commands.

Examples:

```text
Rebuild Inventory Level

Relink External Provider Record

Reconcile Provider Payment

Resolve Receiving Variance

Rebuild Search Projection

Rebuild Analytics Projection
```

Repair APIs should be:

```text
privileged

audited

purpose-built.
```

---

# 286. Repair Command Principle

Repair should preserve:

```text
why inconsistency occurred

what was changed

who repaired it
```

and should never be a generic:

```text
PATCH anything
```

endpoint.

---

# 287. Architecture Leak Found #18

## Need an explicit **Operational Hold** ability beyond Orders.

Potentially:

```text
Inventory Item Hold

Payment Reconciliation Hold

Shipment Exception Hold
```

But avoid generic universal Hold entity.

Each domain can expose blocking state where required.

---

# 288. Architecture Leak Found #19

## Need a **system maintenance mode** distinction.

Cases:

```text
Database migration

Incident

Checkout disabled

Admin read-only
```

Settings should not use one Boolean:

```text
maintenance=true
```

for everything.

Future platform operations can define:

```text
Storefront read-only

Checkout disabled

Admin mutations disabled
```

independently.

Not mandatory V1, but deployment/incident architecture should support emergency checkout pause.

---

# 289. Architecture Leak Found #20

## Need clearer source-of-truth hierarchy for derived balances.

Examples:

```text
Inventory Level
→ derived/materialized from movements + reservations

Finance Account Balance
→ derived/materialized from account entries

Order Payment Summary
→ derived from payment allocations/refunds

Promotion Usage Count
→ derived from usage rows
```

For every derived balance we must document:

```text
Authoritative source

Projection table

Rebuild method

Reconciliation rule.
```

This should become a schema annotation/checklist.

---

# 290. Hardening Decision — Result of Stress Test

The architecture survives the majority of failure scenarios **without needing major structural redesign**.

However the following refinements should be incorporated before DDL freeze:

```text
1. Unresolved Inbound Receipt Item state

2. Reservation expiration race handling

3. Late Payment after Order cancellation

4. Fulfillment ↔ Reservation Allocation consumption bridge

5. Supplier Payment unallocated/advance foundation

6. Expense Credit/Adjustment foundation

7. Explicit Order financial projection semantics

8. Metric/period snapshot future foundation

9. Strong Integration Operation state machine

10. Cross-domain Integrity Issue framework

11. Background Job actor context

12. System Job vs User Job distinction

13. Queue-name / workload isolation foundation

14. Checkout change/version handling

15. Inventory integrity-blocked availability state

16. Admin stale-edit conflict UX

17. Privileged repair command architecture

18. Domain-specific operational holds where justified

19. Emergency maintenance/checkout pause foundation

20. Formal authoritative-source metadata for every derived balance
```

---

# 291. New Stress-Test Invariants

### STR-INV-001

No failed external side effect is assumed failed when the external outcome is uncertain.

### STR-INV-002

Unknown external outcome is reconciled before duplicate-prone retry.

### STR-INV-003

Every critical command is safe under duplicate request delivery.

### STR-INV-004

Every critical async handler is safe under duplicate execution.

### STR-INV-005

A process crash cannot create an untraceable half-committed local business workflow.

### STR-INV-006

A provider outage cannot roll back unrelated committed business truth.

### STR-INV-007

A projection mismatch is repaired from authority rather than making authority match the projection.

### STR-INV-008

A posted ledger record is corrected through compensation rather than history rewrite.

### STR-INV-009

Every money-moving external operation has an outcome-reconciliation strategy.

### STR-INV-010

Every stock-changing operation has an idempotent linkage to its originating business action.

### STR-INV-011

Normal confirmed Orders cannot over-commit stock when overselling is disabled.

### STR-INV-012

Cancelled, fulfilled and returned quantities can never collectively exceed ordered quantity.

### STR-INV-013

Payment received after cancellation remains real financial truth and is never discarded.

### STR-INV-014

A Refund can never exceed currently refundable value under concurrent execution.

### STR-INV-015

Supplier/payment excess amounts are not silently discarded.

### STR-INV-016

Physical receipt records actual observed quantity, including authorized over/under scenarios.

### STR-INV-017

Unmapped physically received items never become normal sellable Inventory accidentally.

### STR-INV-018

Reservation expiration rechecks current Order/Payment state transactionally.

### STR-INV-019

Fulfillment consumes explicitly attributable reserved Inventory quantities.

### STR-INV-020

External provider events cannot regress a terminal local state due to stale/out-of-order delivery.

### STR-INV-021

Customer contact equality cannot automatically prove identity.

### STR-INV-022

Customer merge canonical relationships cannot form cycles.

### STR-INV-023

Media usage projections cannot authorize deletion.

### STR-INV-024

A stale Admin screen cannot silently overwrite a newer resource version.

### STR-INV-025

Configuration changes cannot silently alter already committed historical transactions.

### STR-INV-026

Critical queues remain operable when low-priority workloads become large.

### STR-INV-027

A user-requested background job does not retain unlimited authorization merely because it was once queued.

### STR-INV-028

Every critical derived balance documents its authoritative source and rebuild strategy.

### STR-INV-029

Every integrity repair is attributable and auditable.

### STR-INV-030

A critical integrity failure becomes observable rather than silently tolerated.

---

# 292. Failure Mode Definition of Done

A critical workflow is not implementation-ready until we can answer:

```text
What is the transaction boundary?

What is the idempotency boundary?

What is locked?

What can be duplicated?

What external calls occur?

What happens on timeout?

What happens if response is lost?

What happens if worker crashes?

What is the authoritative state?

What can be rebuilt?

What requires compensation?

What does operator see?

How do we test it?
```

---

# 293. Domains Requiring Strong Concurrency Tests

Mandatory:

```text
Checkout

Inventory Reservations

Inventory Adjustment

Transfer Dispatch/Receipt

Inbound Receipt Posting

Promotion Usage

Payment Verification

Refund

Supplier Payment Allocation

Number Sequences

Customer Merge

Job Claiming

Outbox Consumption
```

---

# 294. Domains Requiring Reconciliation Tests

Mandatory:

```text
Inventory

Payments

COD Settlements

Finance Accounts

Procurement Receiving

Landed Cost

Media Storage

Analytics

Integrations
```

---

# 295. Domains Requiring External Failure Tests

```text
Payments

Courier / Delivery

Notifications

Webhooks

Object Storage

Future Search provider
```

---

# 296. Domains Requiring Operator Error Tests

```text
Inventory

Receiving

Payments

Refunds

Customer Merge

Landed Cost

Finance

IAM

Settings
```

---

# 297. Domains Requiring Large-Data Tests

```text
Orders

Customers

Inventory Ledger

Audit

Notifications

Webhooks

Analytics

Search

Imports/Exports
```

---

# 298. Launch Blocking Integrity Problems

Maevelle should **not launch** if tests show unresolved risk of:

```text
Duplicate Orders from retry

Overselling final stock under concurrency

Duplicate Payment posting

Duplicate Refund

Duplicate Receipt stock posting

Cross-Organization access

Cross-Organization FK linkage

Unreliable Inventory reconciliation

Unrecoverable backup

Unauthenticated Provider callbacks

Sensitive Media exposure

Payment/Finance double counting
```

---

# 299. Launch Blocking Recovery Problems

Also block launch if:

```text
Database backup cannot restore

Worker jobs are lost on crash

Outbox event can disappear after business commit

Provider timeout can create duplicate courier/payment side effect

No way exists to revoke compromised sessions/API keys

No way exists to repair Inventory projection safely
```

---

# 300. Production-Operational MVP Requirement

The platform becomes trustworthy only when normal operations do not require:

```text
manual SQL

spreadsheet truth

guessing stock

guessing payment status

guessing whether webhook ran

guessing whether provider created something
```

Normal exceptions must be visible inside the product.

---

# 301. Resulting Reliability Model

```text
COMMAND
   │
   ▼
VALIDATE
   │
   ▼
AUTHORIZE
   │
   ▼
TRANSACTION
   │
   ├── Business State
   ├── Ledger/History
   └── Outbox
   │
   ▼
COMMIT
   │
   ▼
ASYNC SIDE EFFECTS
   │
   ├── Retry
   ├── Idempotency
   ├── Reconciliation
   └── Dead Letter
   │
   ▼
HEALTH / AUDIT / REPAIR
```

---

# 302. Reliability Layers

### Layer 1 — Prevent

```text
Validation

Authorization

Constraints

Transactions

Locks

Versions

Idempotency
```

### Layer 2 — Detect

```text
Health checks

Reconciliation

Metrics

Audit

Alerts
```

### Layer 3 — Recover

```text
Retry

Rebuild

Compensation

Repair commands

Restore
```

No critical domain should depend on only one layer.

---

# 303. Architecture Milestone

At this point Maevelle has gone through:

```text
Concept Design

Requirements

Scope

Domain Architecture

API Architecture

Security

Technical Architecture

Relational Architecture

AND

Cross-Domain Adversarial Stress Testing
```

This is the right time to stop adding broad conceptual layers and begin **freezing implementation contracts**.

---

# 304. Recommended Next Document

Next should be:

```text
docs/architecture/postgresql-schema-specification.md
```

This is different from the Database Architecture document.

The next document should finally define the **concrete schema**:

```text
Exact PostgreSQL schemas

Exact table names

Exact column names

Exact SQL types

Primary keys

Foreign keys

Composite tenant-safe FKs

Unique constraints

Check constraints

Indexes

Version columns

Status columns

Ledger columns

Snapshot fields

JSONB schemas

Idempotency constraints

Job leasing columns

Outbox processing structures

Cross-domain linkage tables
```

And it should incorporate the hardening changes discovered here, especially:

```text
Unresolved Receipt Items

Fulfillment/Reservation Consumption

Supplier Payment Advances

Expense Credits

Integrity Issues

Integration Operation Outcomes

Job Actor Context

Queue Names

Derived-Balance Source Rules
```

---

# 305. Recommended Schema Workflow

Do **not** attempt all tables in one uncontrolled SQL dump.

Use staged schema design:

```text
Stage 1
Platform + Organization + IAM

Stage 2
Catalog + Sizing + Media

Stage 3
Warehouse + Inventory

Stage 4
Procurement + Shipment + Receiving

Stage 5
Landed Cost + Acquisition Cost

Stage 6
Customers + Cart + Orders

Stage 7
Payments + Finance

Stage 8
Reviews + Promotions + Notifications

Stage 9
Integrations + Webhooks

Stage 10
Outbox + Jobs + Audit

Stage 11
Analytics + Search Projections
```

For every stage:

```text
Tables

Constraints

Indexes

Concurrency strategy

Example transactions

Failure checks
```

should be reviewed before moving forward.

---

# 306. PostgreSQL Skill Timing

This is now the exact point where the focused **`postgresql-table-design`** skill should be used before we freeze the schema.

It should challenge:

```text
Normalization

Composite tenant-safe keys

Foreign keys

Constraint choices

Indexes

JSONB boundaries

Ledger tables

High-volume tables

Locking-sensitive structures
```

Then after actual SQL is written:

```text
postgresql-code-review

sql-optimization
```

become useful.

---

# 307. What Comes After Concrete Schema

Once `postgresql-schema-specification.md` is completed and reviewed:

```text
1. ADRs for unresolved implementation choices

2. API endpoint/OpenAPI specification

3. Repository/module implementation plan

4. UX/Admin information architecture

5. Testing master plan

6. Operations/runbooks

7. Detailed implementation roadmap

8. Begin coding
```

At that point, coding starts from a much stronger foundation rather than discovering the business model while writing migrations.

---

**End of Cross-Domain Stress Test, Failure Recovery & Fallback Architecture v0.1**
