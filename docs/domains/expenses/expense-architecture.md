# Maevelle Ecommerce — Finance Operations & Expense Architecture

**Document:** `docs/domains/finance/finance-operations-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `procurement-architecture.md`, `inbound-shipment-architecture.md`, `landed-cost-architecture.md`, `order-lifecycle-architecture.md`, `payment-architecture.md`, `access-control-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Finance Operations domain gives Maevelle a trustworthy operational view of:

```text
What costs has the business incurred?

What money is still owed?

What money actually entered the business?

What money actually left the business?

Which account did it enter or leave?

What was the money for?

Which operational object caused it?

Has it been paid?

Has it been reconciled?

Is the same financial event being counted twice?

How much are we spending on marketing?

How much on fulfillment?

How much on operating the business?

What cash do we actually have?
```

This is **management-finance infrastructure**.

It is not intended to become a complete statutory accounting/general-ledger system in Maevelle V1.

---

# 2. The Most Important Principle

> **Business Event, Expense/Obligation, and Cash Movement are different things.**

Example:

```text
Office Rent for August
        │
        ▼
Expense Incurred
৳50,000
        │
        ▼
Unpaid for 5 days
        │
        ▼
Bank Payment
৳50,000
        │
        ▼
Cash Outflow
```

The expense existed **before** the money left the bank.

---

# 3. Another Example

Supplier Purchase:

```text
Purchase:
৳500,000
```

Deposit:

```text
৳200,000
```

Final payment:

```text
৳300,000
```

This is not:

```text
Expense 1 = ৳500,000
Expense 2 = ৳200,000
Expense 3 = ৳300,000
```

which would incorrectly report:

```text
৳1,000,000
```

of spending.

---

# 4. Another Critical Example

Customer Refund:

```text
Refund:
৳1,000
```

is a real:

```text
Cash Outflow
```

but it is not necessarily:

```text
Operating Expense:
৳1,000
```

It may instead represent a reversal/reduction of a customer transaction.

---

# 5. Internal Transfer Example

Maevelle moves:

```text
৳100,000
```

from:

```text
Bank Account
```

to:

```text
bKash Merchant Wallet
```

Cash moved.

But:

```text
Expense = ৳0
Income = ৳0
```

The business merely changed where its money is held.

---

# 6. Therefore

We need at least four different concepts:

```text
BUSINESS EVENT

FINANCIAL OBLIGATION / COST

CASH MOVEMENT

FINANCIAL CLASSIFICATION
```

They may be related.

They must not be conflated.

---

# 7. Domain Goal

The Finance Operations layer should let all existing domains remain authoritative while providing one coordinated financial view.

Conceptually:

```text
Procurement ──────┐
Shipments ────────┤
Payments ─────────┤
Orders ───────────┤
Fulfillment ──────┼──► FINANCE OPERATIONS
General Expenses ─┤
Future Marketing ─┤
Future Delivery ──┘
```

---

# 8. Research-Informed Direction

Current ERP systems also keep the financial obligation and the eventual payment distinct. Microsoft Business Central records purchase invoices/orders separately from vendor payments, and its vendor reconciliation flow allows a payment or refund to be partially applied across one or more open vendor entries.

Likewise, current Odoo reconciliation matches bank transactions against existing records such as invoices, bills, and payments instead of assuming every bank movement is itself the original business transaction.

Microsoft's accounts-payable guidance similarly treats vendor invoices, matching, approval, and vendor payment as separate stages, which supports the same separation we are adopting here.

---

# 9. Explicit Boundary

V1 Finance Operations is **not** intended to implement:

```text
Complete General Ledger

Double-entry bookkeeping UI

Balance Sheet

Statutory accounting

Bangladesh VAT/tax filing

Depreciation

Fixed asset accounting

Payroll accounting

Corporate tax calculation

Audited financial statements
```

Those require separate Finance/Accounting architecture and professional accounting validation.

---

# 10. But V1 Must Still Be Financially Trustworthy

Maevelle should be able to answer operational questions such as:

```text
What did we spend today?

Which bills are unpaid?

How much did we spend on Facebook Ads?

How much courier cost did we incur?

Which bank/wallet paid an expense?

How much COD money remains unsettled?

Which shipment expenses have not been paid?

Which expenses are overdue?

What are our current operational cash balances?

Did someone enter the same expense twice?
```

without relying on Excel as an essential source of truth.

---

# 11. Core Domain Concepts

Recommended concepts:

```text
Financial Account

Expense

Expense Category

Expense Source

Expense Payment Allocation

Cash Movement

Cash Transfer

Payee Reference

Recurring Expense Template

Financial Attachment

Financial Reconciliation

Statement / Statement Line foundation

Financial Activity Projection

Financial Exception
```

---

# 12. Source Domain Authority

Important rule:

> Finance must not steal business ownership from source domains.

Example:

```text
Supplier Invoice
```

remains owned by:

```text
Procurement
```

Customer Refund remains owned by:

```text
Payments
```

Shipment Freight remains owned by:

```text
Shipment
```

Finance consumes, classifies, pays/reconciles, and reports them.

---

# 13. Why This Matters

Bad architecture:

```text
Shipment Freight = Shipment Expense

Then copy to:
Finance Expense

Then copy to:
Landed Cost Expense
```

Three independent records can drift.

Better:

```text
Shipment Expense
      │
      ├── Finance Classification / Payment
      │
      └── Landed Cost Allocation
```

One business cost.

Multiple legitimate relationships.

---

# 14. Financial Activity Projection

Finance may maintain a normalized read model/projection across source domains.

Conceptually:

```text
Financial Activity

Source Domain

Source Entity

Activity Type

Amount

Currency

Effective Date

Classification

Cash Status

Payment Status

Related Objects
```

This is for unified reporting/search.

It does not replace source records.

---

# 15. Projection Is Not Editable Truth

Example:

```text
Shipment Freight
৳20,000
```

is modified through Shipment/Expense workflow.

Do not let Finance dashboard directly rewrite the Shipment's source record through a generic edit field.

---

# 16. General Expense

Finance itself **does** own standalone business expenses that do not belong to another source domain.

Examples:

```text
Office Rent

Electricity

Internet

Office Supplies

Software Subscription

Facebook Ads

Photography Expense

Packaging Office Expense

Professional Service Fee
```

These become first-class:

```text
Expense
```

records.

---

# 17. Expense

An **Expense** represents a business cost/financial obligation incurred by Maevelle.

Conceptually:

```text
Expense Number

Description

Category

Amount

Currency

Expense Date

Payee

Due Date

Payment Status

Source

Related Business Context

Attachments

Notes
```

---

# 18. Expense Does Not Mean Paid

Example:

```text
Expense:
Internet Bill
৳5,000

Status:
UNPAID
```

is valid.

---

# 19. Expense Does Not Automatically Mean Cash Outflow

The bill may exist today.

Payment may occur next week.

---

# 20. Expense Date

The Expense Date represents:

> When the business cost was incurred or recognized operationally.

This is different from:

```text
Paid Date
```

---

# 21. Example

Electricity bill:

```text
Expense Date:
August 15

Paid:
August 23
```

Expense reports and cash-flow reports may therefore differ.

That is expected.

---

# 22. Expense Number

Human-readable:

```text
EXP-2026-00182
```

useful for internal reference.

Internal ID remains separate.

---

# 23. Expense Description

Example:

```text
August Office Internet Bill
```

---

# 24. Expense Category

A reusable **Expense Category** classifies expenses.

Example hierarchy:

```text
Marketing
├── Facebook Ads
├── Instagram Ads
├── Influencer
└── Content Production

Operations
├── Rent
├── Electricity
├── Internet
├── Software
└── Office Supplies

Fulfillment
├── Courier Delivery
├── COD Fee
└── Packaging

Finance
├── Bank Fee
├── Payment Gateway Fee
└── Currency Conversion Fee
```

---

# 25. Category Hierarchy

Recommended:

```text
arbitrary parent/child hierarchy
```

similar to Catalog Categories but semantically independent.

---

# 26. Expense Category Is Not Product Category

Never reuse:

```text
Catalog Category
```

for financial categorization.

---

# 27. Category Status

Potential:

```text
ACTIVE

INACTIVE

ARCHIVED
```

Historical expenses remain connected to inactive categories.

---

# 28. Renaming Category

Renaming:

```text
Facebook Marketing
→
Paid Social
```

must not corrupt historical Expense identity.

---

# 29. Expense Classification vs Category

Category answers:

```text
What business type of expense was this?
```

Classification may answer:

```text
How should management reporting treat it?
```

These concepts may eventually differ.

---

# 30. Recommended High-Level Management Classification

Useful foundation:

```text
OPERATING

MARKETING

FULFILLMENT

PAYMENT_FEE

DIRECT_ACQUISITION

TAX_DUTY

OTHER
```

Exact management-report grouping can evolve.

---

# 31. Direct Acquisition Cost

Examples:

```text
International Freight

Customs

Inbound Handling
```

may participate in Landed Cost.

These should not be mixed invisibly with ordinary operating expenses.

---

# 32. Acquisition Cost Double Counting

Suppose:

```text
Freight:
৳20,000
```

was allocated into inventory landed cost.

Later management reporting must not automatically subtract:

```text
৳20,000
```

again from Product gross margin as if it were an unrelated operating expense.

---

# 33. Reporting Treatment

Each financial cost needs a clear management-report treatment.

Conceptually:

```text
Included in Landed Cost?

Operating Expense?

Fulfillment Cost?

Payment Fee?

Cash Flow Only?

Revenue Reversal?
```

---

# 34. Customer Refund Treatment

Customer Refund:

```text
Cash Outflow:
Yes
```

Normal Expense Category:

```text
No
```

unless a specific accounting/reporting policy deliberately classifies some component.

---

# 35. Supplier Product Payment

Supplier payment:

```text
Cash Outflow:
Yes
```

General Operating Expense:

```text
No
```

because product acquisition cost belongs to Procurement/Inventory costing.

---

# 36. Internal Account Transfer

```text
Cash Movement:
Yes

Expense:
No
```

---

# 37. Owner Capital / Financing — Future

Similarly future:

```text
Owner adds ৳500,000
```

would be:

```text
Cash Inflow
```

but not customer Revenue.

This reinforces why cash movements and income/expense concepts must remain separate.

Full financing/accounting remains future.

---

# 38. Expense Source

Each Expense has a source type.

Examples:

```text
MANUAL

RECURRING_TEMPLATE

SHIPMENT

PAYMENT_PROVIDER_FEE

DELIVERY

IMPORT

OTHER
```

---

# 39. Manual Expense

Example:

```text
Facebook Ad Spend
```

entered directly in Finance.

---

# 40. Source-Backed Expense

Example:

```text
Shipment Freight
```

originates from Shipment.

Finance should reference that source rather than creating an unrelated duplicate.

---

# 41. Source Identity

Conceptually:

```text
source_domain

source_entity_type

source_entity_id
```

or an equivalent typed reference mechanism.

---

# 42. Unique Source Protection

One source-generated cost should normally generate at most one corresponding Finance financial-activity representation.

Retrying source synchronization must not create duplicates.

---

# 43. Source Changes

If source amount changes:

```text
Shipment Freight:
৳20,000
→
৳22,000
```

Finance should reconcile/update the corresponding linked representation according to source state.

Do not create:

```text
৳20,000
+
৳22,000
```

as two costs unless the second is a genuine additional charge.

---

# 44. Source Finalization

Finalized source records may become immutable.

Finance respects that lifecycle.

---

# 45. Expense Payee

Expense may have a Payee.

Examples:

```text
Meta / Facebook

Office Landlord

Internet Provider

Photographer

Courier

Forwarder

Supplier
```

---

# 46. Avoid Duplicate Vendor Masters Everywhere

Maevelle already has:

```text
Supplier

Logistics Provider

Payment Provider
```

Finance should not require copying all of these into another independent `Vendor` table.

---

# 47. Typed Payee Reference

Recommended:

```text
Payee Type:
SUPPLIER
LOGISTICS_PROVIDER
PAYMENT_PROVIDER
OTHER
```

with:

```text
Optional entity reference
+
transaction-time name snapshot
```

---

# 48. Generic Payee

For entities not otherwise modeled:

```text
Expense Payee
```

can be a lightweight Finance contact.

Example:

```text
Office Landlord
```

---

# 49. Payee Snapshot

Historical Expense should preserve:

```text
Payee Name at time
```

even if the current Payee record is renamed.

---

# 50. Currency

Every Expense explicitly stores:

```text
Currency
```

Examples:

```text
BDT

USD

CNY
```

---

# 51. No Hard-Coded BDT

BDT is initial business default.

Architecture remains multi-currency.

---

# 52. Expense Amount

Use fixed/decimal money arithmetic.

No binary float for authoritative amounts.

---

# 53. Tax / VAT Foundation

An Expense may optionally preserve:

```text
Subtotal

Tax Amount

Total Amount
```

where operationally useful.

V1 does not calculate statutory tax rules.

---

# 54. Tax Included/Excluded Foundation

Potential:

```text
Tax Included
```

or structured tax breakdown later.

Do not overbuild a tax engine here.

---

# 55. Expense Due Date

Useful for unpaid obligations such as:

```text
Rent

Internet

Subscriptions

Professional service invoice
```

---

# 56. Payment Status

Derived:

```text
UNPAID

PARTIALLY_PAID

PAID

OVERPAID / CREDIT_EXCEPTION
```

where relevant.

---

# 57. Expense Status

Separate record lifecycle:

```text
DRAFT

RECORDED

CANCELLED
```

Potential:

```text
VOIDED
```

depending on correction semantics.

---

# 58. Draft

Expense being prepared.

Does not yet participate in official management reporting.

---

# 59. Recorded

Expense is considered operationally real.

---

# 60. Cancelled

Expense was legitimately cancelled.

It remains historical.

---

# 61. Paid Does Not Equal Closed

An Expense can be:

```text
RECORDED
+
PAID
```

The two states describe different dimensions.

---

# 62. Expense Payment

Actual payment of a Finance-owned general Expense should be represented through:

```text
Cash Movement
+
Expense Payment Allocation
```

rather than:

```text
expense.paid = true
```

---

# 63. Expense Payment Allocation

Conceptually:

```text
Cash Movement
      ↓
Expense Payment Allocation
      ↓
Expense
```

with an amount.

---

# 64. Partial Payment

Expense:

```text
৳50,000
```

Payment 1:

```text
৳20,000
```

Payment 2:

```text
৳30,000
```

naturally supported.

---

# 65. One Payment for Multiple Expenses

Example:

Bank transfer:

```text
৳15,000
```

covers:

```text
Internet      ৳5,000
Software     ৳3,000
Photography  ৳7,000
```

One Cash Movement may allocate to several Expenses.

---

# 66. Unallocated Outflow

Bank statement shows:

```text
৳4,500 outflow
```

but staff cannot yet identify the purpose.

It can remain:

```text
UNALLOCATED
```

until reconciled.

Do not create a fake Expense category just to balance the bank statement.

---

# 67. Financial Account

A **Financial Account** represents where Maevelle's own funds are held or settled.

Examples:

```text
Cash

Bank Account

bKash Merchant Balance

Nagad Merchant Balance

USD Account

Other Wallet
```

---

# 68. Financial Account Types

Recommended:

```text
CASH

BANK

MOBILE_WALLET

PAYMENT_PROVIDER_BALANCE

OTHER
```

---

# 69. Payment Account vs Financial Account

Payment Architecture already defined:

```text
Payment Account
```

which represents a customer-payment/provider configuration.

Finance defines:

```text
Financial Account
```

which represents money-holding/reconciliation context.

They are related but not identical.

---

# 70. Example

```text
Payment Account:
SSLCommerz Merchant Account
```

may settle money to:

```text
Financial Account:
BRAC Bank Business Account
```

The gateway account itself may not represent money physically held by Maevelle long-term.

---

# 71. Another Example

Manual bKash:

```text
Payment Account:
Maevelle bKash Merchant
```

may map directly to:

```text
Financial Account:
Maevelle bKash Balance
```

---

# 72. Financial Account Properties

Conceptually:

```text
Name

Type

Currency

Institution / Provider

Masked Identifier

Status

Opening Balance Context

Notes
```

Sensitive account details require protected permissions.

---

# 73. Financial Account Currency

A Financial Account may have primary/native currency.

Example:

```text
BDT Bank

USD Bank
```

---

# 74. Financial Account Status

Recommended:

```text
ACTIVE

INACTIVE

ARCHIVED
```

---

# 75. Inactive Account

Prevents new normal transactions.

Historical Cash Movements remain.

---

# 76. Cannot Delete Account With History

Financial account with posted movements should not be destructively removed.

Archive instead.

---

# 77. Opening Balance

Migrating into Maevelle may require:

```text
Opening Balance
```

as an explicit Cash Movement.

Example:

```text
Opening Balance:
৳350,000
```

---

# 78. Opening Balance Is Not Revenue

It represents pre-existing money.

This is another reason account balance and income must remain separate.

---

# 79. Cash Movement

A **Cash Movement** represents an actual change in Maevelle-controlled money.

Examples:

```text
Customer bKash Payment

Supplier Payment

Rent Payment

Customer Refund

COD Settlement

Bank Fee

Transfer Between Own Accounts
```

---

# 80. Cash Movement Direction

```text
INFLOW

OUTFLOW
```

Internal transfers use linked outflow/inflow.

---

# 81. Cash Movement Properties

Conceptually:

```text
Movement Number

Financial Account

Direction

Amount

Currency

Effective Date

Source

External Reference

Description

Status

Attachments

Reconciliation State
```

---

# 82. Cash Movement Status

Recommended:

```text
POSTED

VOIDED

REVERSED
```

Pending obligations should generally not be posted as actual cash movements.

---

# 83. Posted Means Money Changed

A posted Cash Movement should reflect actual operational cash truth.

---

# 84. Source-Generated Cash Movements

Examples:

```text
Supplier Payment
→ Finance Cash Outflow

Customer Direct Payment
→ Finance Cash Inflow

Customer Refund
→ Finance Cash Outflow

Courier Settlement
→ Finance Cash Inflow
```

---

# 85. Source Domain Remains Authoritative

Finance Cash Movement answers:

```text
Which Maevelle account changed?
```

Payment/Procurement answers:

```text
Why did it happen?
```

---

# 86. Source Reference

Cash Movement should preserve its originating transaction.

Example:

```text
Source:
PAYMENT PAY-1005
```

or:

```text
Source:
SUPPLIER_PAYMENT SPP-120
```

---

# 87. Idempotent Source Posting

If Payment domain retries:

```text
post cash inflow for PAY-1005
```

there must still be exactly:

```text
1
```

Finance movement for that source operation.

---

# 88. Manual Cash Movement

Authorized staff may manually record actual money movements not represented elsewhere.

Example:

```text
Cash withdrawn from bank
```

But internal transfer should preferably use dedicated Transfer workflow.

---

# 89. Cash Transfer

A **Cash Transfer** represents movement between Maevelle-owned Financial Accounts.

Example:

```text
Bank
     ↓ ৳100,000
bKash
```

---

# 90. Transfer Structure

Conceptually:

```text
Cash Transfer
├── Source Outflow
└── Destination Inflow
```

The two movements belong to one transfer operation.

---

# 91. Internal Transfer Is Not Expense

Fundamental invariant.

---

# 92. Transfer Fees

If:

```text
Transfer:
৳100,000

Fee:
৳100
```

then:

```text
৳100,000
```

is internal movement.

```text
৳100
```

may be a real financial fee/expense.

Keep them separate.

---

# 93. Cross-Currency Transfer

Future example:

```text
USD Account
→
BDT Account
```

may require:

```text
Source amount

Destination amount

Exchange rate

Fee
```

Multi-currency transfer foundation should not assume amounts are identical.

---

# 94. Cash Account Balance

Conceptually:

```text
Opening Balance
+
Posted Inflows
-
Posted Outflows
=
Operational Balance
```

for a Financial Account.

---

# 95. Operational Balance Is Only as Good as Recorded Movements

Maevelle should distinguish:

```text
System Balance
```

from:

```text
Bank/Provider Statement Balance
```

until reconciled.

---

# 96. Reconciliation

A Financial Account should support:

```text
Recorded cash movements
vs
external statement truth
```

comparison.

Current bank-reconciliation systems likewise match statement transactions against existing invoices, bills, payments, and journal items rather than treating the imported statement alone as the business source of truth.

---

# 97. Reconciliation Status

Potential:

```text
UNRECONCILED

PARTIALLY_RECONCILED

RECONCILED

EXCEPTION
```

---

# 98. Manual Reconciliation V1

Operator can:

```text
Select account movement

Enter/confirm external reference

Mark reconciled
```

with appropriate evidence.

---

# 99. Statement Import — Preferred

Architecture should support later/strong V1:

```text
CSV/XLSX statement import
```

for:

```text
Bank

bKash

Nagad

Courier settlement reports
```

---

# 100. Statement

Conceptually:

```text
Financial Account

Statement Period

Opening Balance

Closing Balance

Imported File

Import Status
```

---

# 101. Statement Line

Conceptually:

```text
Date

Description

External Reference

Amount

Direction

Balance where available

Match State
```

---

# 102. Statement Line Is Not Automatically Expense

Example:

```text
৳50,000 outflow
```

may represent:

```text
Supplier payment

Internal transfer

Refund

Rent

Unknown transaction
```

Matching determines context.

---

# 103. Statement Matching

Potential signals:

```text
Amount

Date

Reference

Financial Account

Counterparty

Source transaction
```

---

# 104. Exact vs Suggested Matching

Possible:

```text
EXACT

LIKELY

UNMATCHED
```

Human review handles ambiguous cases.

---

# 105. Duplicate Statement Import

Re-uploading the same statement must not double-create statement lines/cash movements.

Use:

```text
Import identity

File hash

Statement identifiers
```

where available.

---

# 106. Statement Is Evidence

Imported statement lines should be preserved even if matched.

They are external financial evidence.

---

# 107. Statement Matching Does Not Rewrite Source

Matching:

```text
Bank Line
→ Supplier Payment
```

does not modify the Purchase quantity or Supplier invoice.

---

# 108. General Expense Payment

Example:

```text
Expense:
Office Rent
৳50,000

Financial Account:
Bank

Cash Movement:
OUTFLOW ৳50,000

Allocation:
Expense EXP-1001 ৳50,000
```

---

# 109. Cash Expense

Example:

```text
Office Tea:
৳500
```

paid immediately from petty cash.

System may create:

```text
Expense
+
Cash Movement
+
Full Allocation
```

as one convenience workflow.

Underlying concepts remain separate.

---

# 110. Quick Paid Expense UX

Admin form can support:

```text
[✓] Already Paid

Paid From:
Petty Cash
```

and create both records transactionally.

---

# 111. Unpaid Expense UX

```text
Expense:
Facebook Creative Invoice
৳20,000

Payment:
Unpaid
```

Later:

```text
[Record Payment]
```

---

# 112. Payment Due View

Useful dashboard:

```text
Due Today

Due This Week

Overdue

Partially Paid
```

---

# 113. Overdue

Derived:

```text
Due Date < Today
AND
Outstanding Amount > 0
```

unless Expense cancelled.

---

# 114. Recurring Expenses

Common examples:

```text
Office Rent

Internet

Software Subscription

Hosting

Phone
```

should not require manual recreation from scratch forever.

---

# 115. Recurring Expense Template

Conceptually:

```text
Template Name

Category

Payee

Expected Amount

Currency

Frequency

Default Due Rule

Default Financial Account optional

Start Date

End Date optional

Status
```

---

# 116. Recurring Template Does Not Mean Auto-Paid

Very important.

Monthly rent template generates:

```text
Expense occurrence
```

not:

```text
Bank Payment
```

---

# 117. Why?

The actual bill/payment may:

```text
change

be delayed

be skipped

require review
```

---

# 118. Generated Expense

Example:

```text
Rent — August 2026
৳50,000
```

can be generated as:

```text
DRAFT
```

or:

```text
RECORDED
```

depending on configured policy.

V1 safer default:

```text
DRAFT / Needs Review
```

for variable costs.

---

# 119. Fixed Reliable Expenses

Future configuration may auto-record predictable amounts.

Still should not auto-post cash movement without real payment evidence.

---

# 120. Recurring Schedule

Potential:

```text
MONTHLY

WEEKLY

YEARLY

CUSTOM interval
```

No need for a sophisticated billing engine V1.

---

# 121. Template Revision

Changing monthly rent from:

```text
৳50,000
→
৳55,000
```

must not modify old Expense records.

Only future occurrences.

---

# 122. Advertising Expenses

Marketing spend should support:

```text
Expense Category:
Marketing > Facebook Ads

Related Campaign:
Optional future reference
```

---

# 123. Campaign Relationship

Future Marketing domain may create:

```text
Campaign
```

Finance Expenses can reference it.

Do not create campaign logic inside Expense domain today.

---

# 124. Current V1 Marketing Link

Can support:

```text
Campaign / reference text
```

or typed optional future entity reference.

---

# 125. Advertising Payment

If Facebook charges automatically:

```text
Expense:
৳10,000

Cash Outflow:
Bank/Card ৳10,000
```

Both can be linked.

---

# 126. Provider Processing Fee

Payment domain Settlement may produce:

```text
SSLCommerz Fee

COD Fee
```

These should be source-backed financial costs.

---

# 127. Do Not Re-enter Provider Fee

If Settlement already records:

```text
COD Fee:
৳500
```

Finance should surface/classify it.

User should not manually create:

```text
Expense:
COD Fee ৳500
```

again.

---

# 128. Courier Delivery Fee

Future Delivery domain may own:

```text
Courier charge
```

Finance consumes it as:

```text
Fulfillment Cost
```

---

# 129. Shipment Expense

Shipment already owns:

```text
Freight

Customs

Forwarder Fee

Local Transport
```

Finance should classify/pay/reconcile them.

Landed Cost determines Product allocation.

---

# 130. Shipment Expense Can Be Unpaid

Example:

```text
Customs Charge:
৳30,000

Landed Cost:
Actual cost known

Payment:
Due tomorrow
```

This is valid.

Cost incurred and cash paid are different timelines.

---

# 131. Landed Cost Is Not Cash Movement

Landed Cost allocation:

```text
Product A +৳100/unit
```

does not itself move money.

It reallocates acquisition cost to inventory.

---

# 132. Supplier Invoice

Procurement owns Supplier Invoice.

Finance may show it among:

```text
Open obligations / payables
```

without duplicating it as a manual general Expense.

---

# 133. Supplier Payment

Procurement owns commercial payment allocation to Supplier Invoice/Purchase.

Finance records associated:

```text
Cash Outflow from Business Account
```

---

# 134. Supplier Advance

Example:

```text
Supplier Advance:
৳100,000
```

is a Cash Outflow.

It is not automatically a current-period operating Expense.

---

# 135. Customer Payment

Payment domain owns:

```text
Customer collected amount
```

Finance records an Inflow only when Maevelle's controlled money position actually changes.

---

# 136. Manual bKash

Customer pays directly to Maevelle bKash.

Once verified:

```text
Payment:
৳1,500
```

and:

```text
Financial Account:
bKash

Cash Inflow:
৳1,500
```

can be linked.

---

# 137. COD

Customer pays courier:

```text
৳1,500
```

Payment domain can mark customer collection.

But Finance does not yet record:

```text
Bank Cash Inflow ৳1,500
```

because Maevelle has not received settlement.

---

# 138. COD Settlement

Courier later transfers:

```text
Net:
৳1,405
```

Finance posts:

```text
Bank Inflow:
৳1,405
```

while Payment domain preserves:

```text
Gross Customer Collection:
৳1,500
```

and provider costs:

```text
৳95
```

---

# 139. This Prevents False Cash Balance

Without this distinction, system would claim Maevelle possesses COD money while it is still with courier.

---

# 140. Customer Refund

Payment domain owns Refund.

Finance records actual:

```text
Cash Outflow
```

from the account used to issue it.

---

# 141. Refund Is Not General Expense

Default reporting treatment should not count it alongside:

```text
Rent

Electricity

Marketing
```

---

# 142. Source-Generated Cost Classification

Finance should allow central category/classification mapping for source costs.

Example:

```text
COD Fee
→ Fulfillment > COD Fee

SSLCommerz Fee
→ Finance > Payment Processing

International Freight
→ Direct Acquisition > Freight
```

---

# 143. Automatic Category Defaults

Source type can suggest a category.

Example:

```text
PAYMENT_PROVIDER_FEE
→ Finance / Payment Fees
```

Authorized users may override where policy permits.

---

# 144. Do Not Overwrite Source Meaning

Category override affects management classification.

It does not change:

```text
Provider Fee
```

into:

```text
Rent
```

at source-domain level.

---

# 145. Relationship Context

Expense may relate to:

```text
Shipment

Purchase

Order

Fulfillment

Campaign

Location

Supplier

Provider

General Business
```

---

# 146. Multiple Relationships

One Expense can sometimes relate to more than one business object.

Example:

```text
Courier Invoice
```

covering many Orders.

Avoid requiring one generic:

```text
related_id
```

that can only point to one thing.

---

# 147. Financial Associations

Potential reusable relation:

```text
Financial Record
      ↓
Association
      ↓
Business Entity
```

with typed relationship.

Exact persistence comes later.

---

# 148. Cost Center Foundation

Future business may want:

```text
Dhaka Warehouse

Marketing Team

Online Store
```

as reporting cost centers.

Not necessary to fully implement V1.

Architecture should allow future reporting dimensions.

---

# 149. Location Relationship

Expense may relate to:

```text
Main Warehouse Electricity
```

with:

```text
Location:
Main Warehouse
```

---

# 150. Expense Allocation Across Business Contexts

Different from Landed Cost allocation.

Example:

```text
Office Rent:
৳60,000
```

future management reporting may split:

```text
Warehouse 70%

Office 30%
```

This is **management expense allocation**, not Product landed-cost allocation.

---

# 151. Do Not Reuse Landed Cost Engine Blindly

Landed Cost has strict Product acquisition semantics.

General Expense allocation has different reporting semantics.

They may reuse lower-level deterministic percentage/amount utilities later, but remain separate domains.

---

# 152. V1 Expense Allocation

Optional/preferred:

```text
Percentage

Manual Amount
```

across:

```text
Locations

Campaigns

Other reporting contexts
```

but not mandatory for basic operations.

---

# 153. Expense Attachment

Uses Media infrastructure.

Examples:

```text
Invoice

Receipt

Screenshot

Contract
```

Default:

```text
PRIVATE
```

---

# 154. Expense Notes

Internal notes separate from formal description.

---

# 155. External Reference

Examples:

```text
Invoice number

Bank transaction reference

Provider charge ID
```

---

# 156. Duplicate Expense Detection

Potential signals:

```text
Same Payee

Same Amount

Same Currency

Same Date

Same External Invoice Reference

Same Source Entity
```

---

# 157. Strong Duplicate Protection

Exact:

```text
Payee + Invoice Number
```

may be a strong warning or constraint depending on payee semantics.

---

# 158. Source Duplicate Must Block

If the same:

```text
Shipment Expense ID
```

already maps into Finance:

```text
do not create another source-backed record.
```

---

# 159. Similar Manual Expenses

Same amount/date/payee may legitimately occur.

Warn.

Do not automatically reject every similar record.

---

# 160. Expense Correction

Recorded Expense should not be silently rewritten after payment/history if materially changed.

Possible:

```text
Edit with audit
```

while unpaid/simple.

After financial activity:

```text
Adjustment / cancellation / correction workflow
```

is safer.

---

# 161. Paid Expense Amount Reduction

Expense:

```text
৳10,000
```

Paid:

```text
৳10,000
```

Changing Expense to:

```text
৳5,000
```

creates:

```text
৳5,000 overpayment
```

and must trigger resolution.

---

# 162. Paid Expense Increase

Expense:

```text
৳10,000
```

Paid:

```text
৳10,000
```

Corrected:

```text
৳12,000
```

becomes:

```text
PARTIALLY_PAID
```

with:

```text
৳2,000 outstanding
```

---

# 163. Expense Cancellation After Payment

Cannot simply delete the Expense.

It may imply:

```text
Supplier/Payee Refund

Credit

Reclassification
```

Cash history remains.

---

# 164. Cash Movement Correction

Posted Cash Movement must not simply be overwritten from:

```text
৳10,000
→
৳1,000
```

after reconciliation.

Use:

```text
Void

Reversal

Corrective Movement
```

as appropriate.

---

# 165. Cash Movement Reference

Every posted movement should have stable identity:

```text
CASH-2026-00182
```

or equivalent.

---

# 166. Cash Movement Timeline

Example:

```text
Aug 20
Expense recorded

Aug 22
Partial payment ৳20,000

Aug 25
Remaining ৳30,000 paid

Aug 27
Bank statement matched
```

---

# 167. Financial Timeline

Cross-domain financial record should show human-readable related activity.

---

# 168. Financial Audit

Audit remains separate and includes:

```text
Who changed amount?

Who recorded payment?

Who voided movement?

Who changed category?

Who reconciled statement?
```

---

# 169. Cash Reconciliation Issue

Potential types:

```text
UNMATCHED_STATEMENT_LINE

UNMATCHED_CASH_MOVEMENT

AMOUNT_MISMATCH

DUPLICATE_TRANSACTION

MISSING_SOURCE_RECORD

CURRENCY_MISMATCH

SOURCE_CHANGED_AFTER_PAYMENT
```

---

# 170. Reconciliation Lifecycle

```text
OPEN

INVESTIGATING

RESOLVED

IGNORED_WITH_REASON
```

---

# 171. Finance Health Dashboard

Useful:

```text
Overdue Expenses

Unpaid Expenses

Partially Paid Expenses

Unallocated Cash Movements

Unmatched Statement Lines

Duplicate Expense Warnings

Source Sync Problems

Accounts Not Reconciled

COD Settlement Outstanding
```

---

# 172. Expense List UX

High-priority columns:

```text
Expense

Date

Category

Payee

Amount

Payment Status

Due Date

Source

Related Context
```

---

# 173. Expense Filters

```text
Date

Category

Payee

Status

Payment Status

Currency

Source

Location

Related Shipment

Related Campaign

Overdue
```

---

# 174. Saved Views

Examples:

```text
Marketing Expenses

Unpaid Bills

Overdue

Paid This Month

Shipment Costs

Courier Fees

Payment Provider Fees

Main Warehouse Expenses
```

---

# 175. Expense Detail

Recommended:

```text
Overview

Payment

Relationships

Attachments

Timeline

Audit
```

---

# 176. Financial Accounts List

Show:

```text
Account

Type

Currency

System Balance

Reconciliation Status

Last Activity
```

Sensitive account identifiers masked.

---

# 177. Financial Account Detail

Recommended:

```text
Overview

Cash Movements

Transfers

Statements

Reconciliation

Activity

Settings
```

---

# 178. Cash Movement List

Filters:

```text
Account

Inflow / Outflow

Date

Source

Reconciliation

Amount

Currency
```

---

# 179. Daily Cash View

Useful:

```text
Opening

Inflows

Outflows

Closing System Balance
```

by Financial Account.

---

# 180. Cash Flow Reporting

Operational report should show:

```text
Cash In

Cash Out

Net Cash Movement
```

for a period.

This is different from:

```text
Expense Incurred
```

report.

---

# 181. Expense Report

Shows Expense Date basis.

Example:

```text
August incurred marketing expenses
```

even if some are paid in September.

---

# 182. Paid Expense Report

Shows actual payments/cash basis.

Example:

```text
Payments made during August
```

---

# 183. Both Are Useful

Users should not be forced to choose one ambiguous:

```text
Expense This Month
```

metric.

Display exact definition.

---

# 184. Management Reporting Layers

Eventually:

```text
Sales

Refunds

Acquisition Cost

Fulfillment Cost

Payment Fees

Marketing Expenses

Operating Expenses
```

can produce progressively deeper profitability metrics.

---

# 185. Gross Margin

Conceptually future analytics:

```text
Revenue
-
Product Cost / COGS basis
=
Gross Margin
```

---

# 186. Contribution Margin

Potential:

```text
Gross Margin
-
Fulfillment Costs
-
Payment Fees
-
Direct Marketing Attribution
=
Contribution Margin
```

Exact formula must be documented.

---

# 187. Operating Profit

Further:

```text
Contribution Margin
-
General Operating Expenses
=
Management Operating Result
```

Again, not statutory accounting.

---

# 188. Do Not Mix Metrics

Never label all of these:

```text
Profit
```

without stating calculation basis.

---

# 189. Landed Cost Relationship

Landed Cost provides:

```text
inventory acquisition cost
```

Finance should not recompute it.

---

# 190. Inventory Valuation Boundary

Actual accounting COGS still depends on future inventory valuation method.

Finance Operations does not decide:

```text
FIFO

Weighted Average
```

in this document.

---

# 191. Expense vs Asset Purchase

Future example:

```text
Laptop ৳150,000
```

may be a capital asset for accounting purposes rather than immediate operating expense.

V1 can classify:

```text
ASSET_PURCHASE / OTHER CASH OUTFLOW
```

rather than falsely claiming statutory expense treatment.

---

# 192. Financial Classification Future

Potential reporting treatments:

```text
OPERATING_EXPENSE

ACQUISITION_COST

SELLING_COST

FINANCIAL_FEE

ASSET_PURCHASE

TAX

REFUND

INTERNAL_TRANSFER

OTHER
```

This allows better future accounting mapping.

---

# 193. Financial Account Permissions

Suggested:

```text
finance.accounts.view

finance.accounts.manage

finance.accounts.view_sensitive
```

---

# 194. Expense Permissions

```text
finance.expenses.view

finance.expenses.create

finance.expenses.edit

finance.expenses.record

finance.expenses.cancel

finance.expenses.pay

finance.expenses.export
```

---

# 195. Cash Permissions

```text
finance.cash.view

finance.cash.record_manual

finance.cash.void

finance.transfers.create

finance.transfers.confirm
```

---

# 196. Reconciliation Permissions

```text
finance.reconciliation.view

finance.reconciliation.manage

finance.statements.import
```

---

# 197. Category Permissions

```text
finance.categories.manage
```

---

# 198. Sensitive Financial Visibility

A Warehouse user may need:

```text
Shipment arrives
```

without seeing:

```text
Bank balance

Marketing spend

Supplier payment

Company cash position
```

Finance permissions remain distinct.

---

# 199. Source Domain Permission

Finance access must not automatically grant unrestricted source-domain access.

Example:

User can see:

```text
Expense:
International Freight ৳20,000
```

but may not have permission to edit:

```text
Shipment SH-100
```

---

# 200. Private Financial Attachments

Require:

```text
Finance permission
+
Media private access
```

according to Access Control Architecture.

---

# 201. Recurring Expense Permissions

```text
finance.recurring.view

finance.recurring.manage
```

---

# 202. Financial Audit Events

Examples:

```text
expense.created

expense.recorded

expense.changed

expense.cancelled

expense.payment_allocated

cash_movement.posted

cash_movement.voided

cash_transfer.posted

statement.imported

statement_line.matched

reconciliation_issue.resolved

financial_account.created

financial_account.archived
```

---

# 203. Source-Sync Events

Potential:

```text
finance.source_activity.registered

finance.source_activity.changed

finance.source_activity.reconciliation_required
```

---

# 204. Domain Events

Useful application events:

```text
expense.recorded

expense.overdue

expense.paid

cash.inflow_posted

cash.outflow_posted

financial_account.balance_changed

finance.reconciliation_required
```

---

# 205. Notifications

Useful V1:

```text
Expense Due Soon

Expense Overdue

Large Expense Recorded

Financial Reconciliation Problem

Duplicate Expense Warning

Account Reconciliation Needed

COD Settlement Overdue
```

---

# 206. Large Expense Threshold

Organization configuration may define:

```text
Large Expense Warning Threshold
```

This is notification/control policy, not accounting logic.

---

# 207. Approval Workflows — Future

Future:

```text
Expense > ৳100,000
→ approval required
```

or:

```text
Creator cannot approve own expense
```

Not necessary V1.

Granular permissions leave room for it.

---

# 208. Expense Request / Reimbursement

Traditional employee reimbursement workflows are not a priority because Maevelle is not building HR/employee expense management.

If needed later:

```text
Expense Claim
```

can become separate.

Do not overbuild V1 around employee travel receipts.

---

# 209. Petty Cash

Financial Account:

```text
Petty Cash
```

allows operational cash expenses.

---

# 210. Petty Cash Example

Opening:

```text
৳20,000
```

Tea:

```text
-৳500
```

Packaging supplies:

```text
-৳2,000
```

System balance:

```text
৳17,500
```

---

# 211. Cash Count Reconciliation — Future

Physical petty cash count may later compare:

```text
System:
৳17,500

Actual:
৳17,000
```

and require:

```text
৳500 discrepancy
```

resolution.

Not necessary for V1.

---

# 212. Financial Account Opening Balance

Opening balances need explicit:

```text
Date

Amount

Actor

Migration reason
```

not hidden setup fields.

---

# 213. Negative Account Balance

Depending on account type:

```text
Bank
```

might legitimately allow overdraft.

```text
Cash
```

negative physical cash may indicate missing data.

Do not globally enforce one rule without account policy.

---

# 214. Expense Currency vs Payment Currency

Expense:

```text
USD 100
```

might be paid from:

```text
BDT Bank
```

through conversion.

Architecture should support:

```text
Expense Amount

Settlement Amount

FX Rate
```

future/when needed.

---

# 215. V1 Multi-Currency Payment

At minimum preserve:

```text
Original Expense Currency

Cash Movement Currency

Settlement Equivalent

Exchange Context
```

when currencies differ.

---

# 216. No Silent FX

Never assume:

```text
$100 = ৳100
```

because conversion data is missing.

Block/reconcile appropriately.

---

# 217. FX Fee

Currency conversion fee can be a separate:

```text
Financial Fee Expense
```

rather than hidden by changing exchange rate arbitrarily.

---

# 218. Payment Allocation Across Currency

Requires explicit converted amount.

Detailed cross-currency finance rules can remain Foundation/advanced V1 depending actual need.

---

# 219. Expense Import

CSV/XLSX-friendly import should support:

```text
Date

Category

Description

Amount

Currency

Payee

Payment Status

Reference
```

---

# 220. Import Flow

```text
Upload

Map Columns

Validate

Duplicate Detection

Preview

Confirm

Create
```

---

# 221. No Blind Import

Do not create thousands of Expenses without:

```text
validation

source duplicate check

category mapping
```

---

# 222. Existing Source Records During Import

If spreadsheet contains:

```text
Shipment Freight
```

already represented through Shipment domain, import should warn rather than automatically duplicate it.

---

# 223. Financial Export

Export:

```text
Expenses

Cash Movements

Accounts

Reconciliation

Categories
```

according to permission.

---

# 224. Excel Is an Output, Not Required Truth

As with Landed Cost:

```text
Excel export
```

is useful.

But normal expense/cash reporting should not require external Excel calculations.

---

# 225. Duplicate Source Failure

Scenario:

Shipment creates:

```text
Freight ৳20,000
```

event delivered twice.

Finance unique source identity ensures:

```text
1 record
```

not two.

---

# 226. Expense Paid Twice

Expense due:

```text
৳10,000
```

Two staff simultaneously record:

```text
৳10,000 payment
```

Concurrency validation must detect that only valid outstanding amount can be normally allocated.

---

# 227. Overpayment

If real:

```text
৳20,000
```

was actually paid for a:

```text
৳10,000
```

expense, Cash Movement remains:

```text
৳20,000
```

Only:

```text
৳10,000
```

allocates normally.

Remaining:

```text
৳10,000
```

becomes explicit:

```text
unallocated advance / recoverable overpayment / exception
```

depending on context.

---

# 228. Source Deleted After Payment

Source-generated financial obligations with financial activity should not disappear simply because someone tries to delete the source.

Source domain must preserve/archive historical record.

---

# 229. Source Amount Changed After Payment

Example:

```text
Courier Fee:
৳10,000

Paid:
৳10,000

Source corrected:
৳9,000
```

Finance creates:

```text
৳1,000 overpayment/reconciliation issue
```

rather than rewriting the payment.

---

# 230. Internal Transfer Double Counting

Cash report:

```text
Bank -৳100,000

bKash +৳100,000
```

Net business cash:

```text
৳0
```

Expense report:

```text
৳0
```

A critical invariant.

---

# 231. COD Fee Double Counting

Payment Settlement already records:

```text
COD Fee ৳500
```

Manual Expense:

```text
COD Fee ৳500
```

should trigger source/duplicate warning.

---

# 232. Landed Cost Double Counting

Shipment Freight:

```text
৳20,000
```

used by:

```text
Landed Cost
```

must not be counted again in Product margin as a separate after-COGS expense unless the metric intentionally uses that treatment.

---

# 233. Refund Double Counting

Customer Refund should not:

```text
reduce net revenue by ৳1,000
```

and also automatically:

```text
add ৳1,000 operating expense
```

unless reporting explicitly intends such a treatment.

---

# 234. Bank Statement Duplicate

Same statement imported twice.

Import identity/file hash/external line identifiers should prevent duplicate financial effects.

---

# 235. Source Sync Timeout

Source operation succeeds.

Finance projection/movement creation times out.

System must have:

```text
retry

idempotency

reconciliation
```

rather than silently losing the financial side.

---

# 236. Finance Projection Failure

Source domain business transaction must remain authoritative.

Financial health system should surface:

```text
Source financial event not projected
```

for recovery.

---

# 237. Cash Movement Without Source

Manual Cash Movement is valid.

But system should clearly identify:

```text
Source:
MANUAL
```

for audit.

---

# 238. Unknown Cash Outflow

Instead of fabricating Expense:

```text
Cash Outflow
৳15,000
Status:
Unallocated / Needs Classification
```

can exist temporarily.

---

# 239. Unknown Cash Inflow

Could be:

```text
Customer payment

Owner funding

Refund from supplier

Internal transfer

Unknown
```

Needs reconciliation before classifying as Revenue.

---

# 240. Finance Health Principle

> **Unclassified financial truth is safer than fabricated classification.**

If money moved but reason is unknown:

```text
Record movement
+
Flag exception
```

rather than pretend it is an Expense.

---

# 241. Search

Finance search should support:

```text
Expense Number

Cash Movement Number

Payee

Description

Invoice Reference

External Transaction Reference

Shipment Number

Purchase Number

Order Number

Account
```

---

# 242. Global Search Security

Only users with Finance permissions should see protected financial records.

---

# 243. Finance Dashboard

Potential:

```text
Cash Position

Today's Inflows

Today's Outflows

Expenses This Month

Unpaid Expenses

Overdue Expenses

Marketing Spend

Fulfillment Cost

COD Settlement Outstanding

Unreconciled Transactions

Financial Exceptions
```

---

# 244. Dashboard Definition Clarity

Every card should have a precise meaning.

Example:

```text
Expenses This Month
```

tooltip:

```text
Recorded operating expenses by Expense Date.
Excludes internal cash transfers and customer refunds.
```

---

# 245. Financial Account Balance Widget

Display:

```text
System Balance

Last Reconciled Balance

Last Reconciled Date
```

if available.

---

# 246. Cash Position

Potential:

```text
Bank          ৳300,000

bKash         ৳100,000

Nagad          ৳20,000

Cash           ৳15,000
----------------------
Total         ৳435,000
```

subject to currencies and reconciliation status.

---

# 247. Multi-Currency Cash Position

Do not simply add:

```text
USD + BDT
```

without explicit reporting FX rate.

Show native currencies or converted management view with clearly defined rate.

---

# 248. Finance Analytics

Useful V1:

```text
Expenses Over Time

Expenses by Category

Expenses by Payee

Marketing Spend

Fulfillment Spend

Payment Provider Fees

Shipment Expenses

Paid vs Unpaid

Cash Inflows

Cash Outflows

Net Cash Movement
```

---

# 249. Future Analytics

```text
Expense Budget Variance

Cash Runway

Forecast Expenses

Vendor Spend

Cost Center Reports

Campaign Profitability

Contribution Margin
```

---

# 250. Budgeting

Budget management is valuable but should be a later dedicated feature.

Do not turn Expense Categories into budget objects prematurely.

---

# 251. Recurring Expense Forecast

Recurring templates can eventually contribute to simple future cash projections.

Foundation only.

---

# 252. Financial Forecast vs Actual

Future:

```text
Expected Rent

Expected Subscriptions

Incoming COD Settlements

Supplier payments due
```

could produce operational cash forecast.

Not required for V1.

---

# 253. Accounts Payable Boundary

Maevelle will have payable-like records in multiple domains:

```text
Supplier Invoices

Shipment Expenses

General Expenses
```

Finance can provide unified:

```text
Amounts Due
```

view.

But it need not create a duplicate universal AP invoice for each source in V1.

---

# 254. Unified Payables Projection

Potential read model:

```text
Open Payable

Source

Payee

Amount

Currency

Due Date

Outstanding

Status
```

generated from:

```text
Procurement Supplier Invoice

Shipment Expense

General Expense
```

---

# 255. Unified Payables Is Read Model

Payment/correction still routes to owning domain where required.

---

# 256. Future Central Payment Run

Later, Finance may support:

```text
Select 10 Payables

Generate Payment Batch
```

similar to mature AP systems that can settle multiple vendor obligations. Current Business Central and Dynamics documentation describes payment workflows and applying payments to open vendor entries, validating this as a future direction.

Not needed V1.

---

# 257. Unified Receivables

Customer Payment domain already handles:

```text
Order Balance Due

COD Settlement
```

No need to create duplicate Finance receivables in V1.

---

# 258. Accounting Integration Future

A future Accounting domain can consume normalized financial events to produce:

```text
Journal Entries

Accounts Payable Ledger

Accounts Receivable Ledger

Inventory Valuation

COGS

Balance Sheet

Income Statement
```

---

# 259. Finance Operations Should Help Future Accounting

Every financial record should have:

```text
Stable ID

Amount

Currency

Date

Source

Classification

Counterparty

Audit
```

making later accounting integration possible.

---

# 260. But No Fake Double-Entry Now

Do not create hidden:

```text
Debit

Credit

Chart of Accounts
```

with poorly understood accounting semantics just to look enterprise-grade.

That would create more risk than value.

---

# 261. Accounting Professionals Later

Before statutory accounting functionality is implemented, tax/accounting policies should be reviewed with appropriate Bangladesh accounting/tax expertise.

The operational architecture intentionally leaves room for that rather than guessing legal treatment.

---

# 262. API Commands

Conceptual:

```text
createExpense()

recordExpense()

updateExpense()

cancelExpense()

recordExpensePayment()

createCashTransfer()

recordManualCashMovement()

voidCashMovement()

createFinancialAccount()

archiveFinancialAccount()

createRecurringExpenseTemplate()

importStatement()

matchStatementLine()

resolveFinancialException()
```

---

# 263. Source Integration Commands

Conceptual internal operations:

```text
registerSourceFinancialActivity()

postSourceCashMovement()

updateSourceFinancialActivity()

markSourceReconciliationRequired()
```

---

# 264. Read APIs

```text
getExpense()

listExpenses()

getFinancialAccount()

listCashMovements()

getCashPosition()

getPayablesSummary()

getFinanceHealth()

getFinancialActivity()

getStatement()

getReconciliationIssues()
```

---

# 265. Avoid Generic PATCH

A posted cash movement should not support:

```text
PATCH {
  "amount": 1
}
```

Critical financial operations require explicit commands.

---

# 266. Structured Errors

Examples:

```text
EXPENSE_ALREADY_RECORDED

EXPENSE_ALREADY_CANCELLED

EXPENSE_HAS_PAYMENTS

EXPENSE_PAYMENT_EXCEEDS_OUTSTANDING

FINANCIAL_ACCOUNT_INACTIVE

CASH_MOVEMENT_ALREADY_POSTED

CASH_MOVEMENT_ALREADY_VOIDED

TRANSFER_SAME_ACCOUNT

SOURCE_FINANCIAL_ACTIVITY_ALREADY_EXISTS

SOURCE_FINANCIAL_ACTIVITY_MISMATCH

DUPLICATE_EXPENSE_REFERENCE

STATEMENT_ALREADY_IMPORTED

STATEMENT_LINE_ALREADY_MATCHED

FX_RATE_REQUIRED

FINANCE_VERSION_CONFLICT
```

---

# 267. Concurrency — Expense Payment

Two users paying same outstanding Expense must not both independently consume the same balance.

---

# 268. Concurrency — Account Transfer

Two retries of one transfer must create one paired transfer, not two.

---

# 269. Concurrency — Reconciliation

A statement line can be matched once unless deliberately rematched through controlled correction.

---

# 270. Idempotency — Source Activity

Mandatory.

Source events are routinely retryable.

---

# 271. Idempotency — Cash Movement

Customer Payment / Supplier Payment / Refund retry cannot duplicate account ledger movement.

---

# 272. Idempotency — Statement Import

Required.

---

# 273. Transactional Paid Expense

Convenience operation:

```text
Create Paid Expense
```

should atomically create:

```text
Expense

Cash Movement

Payment Allocation
```

or fail coherently.

---

# 274. Source + Cash Consistency

Where source domain and Finance share modular-monolith database transaction capability, critical postings should be coordinated transactionally where practical.

Where external side effects exist, use durable state/reconciliation.

---

# 275. Finance Audit Integrity

Financial records and their audit entries should commit coherently.

---

# 276. Important Invariants

### FIN-INV-001

Every Finance record belongs to one Organization.

### FIN-INV-002

Expense and Cash Movement are separate concepts.

### FIN-INV-003

An Expense may exist before it is paid.

### FIN-INV-004

A Cash Movement does not automatically represent an Expense.

### FIN-INV-005

Internal Cash Transfer is neither Expense nor Revenue.

### FIN-INV-006

Customer Refund is not automatically classified as operating Expense.

### FIN-INV-007

Supplier Payment is not duplicated as a standalone general Expense.

### FIN-INV-008

Shipment Expense remains one source cost even when used by Finance and Landed Cost.

### FIN-INV-009

Source-generated financial activity has stable unique source identity.

### FIN-INV-010

Retries cannot duplicate source financial activity or Cash Movements.

### FIN-INV-011

A posted Cash Movement preserves actual amount moved.

### FIN-INV-012

Cash Movement correction uses void/reversal/correction semantics rather than silent historical rewrite.

### FIN-INV-013

Expense payment allocations cannot silently exceed valid available payment/movement amount.

### FIN-INV-014

Expense payment status derives from valid allocations.

### FIN-INV-015

Every monetary record has explicit currency.

### FIN-INV-016

Missing FX context never defaults silently to 1:1.

### FIN-INV-017

Financial Account history is preserved after deactivation/archive.

### FIN-INV-018

Financial Accounts with history are not hard-deleted normally.

### FIN-INV-019

Opening Balance is explicit and is not treated as Revenue.

### FIN-INV-020

Internal transfer posts linked source and destination effects.

### FIN-INV-021

Transfer principal amount does not enter Expense reporting.

### FIN-INV-022

Transfer fees remain separate costs.

### FIN-INV-023

Imported Statement Line does not automatically become Expense/Revenue.

### FIN-INV-024

Statement reconciliation does not rewrite source business records.

### FIN-INV-025

Duplicate statement imports cannot duplicate financial effects.

### FIN-INV-026

Unmatched financial activity remains visible rather than being fabricated into a false category.

### FIN-INV-027

Source-domain financial truth remains authoritative for source-specific business meaning.

### FIN-INV-028

Finance projections are rebuildable/read-oriented and do not replace source truth.

### FIN-INV-029

Sensitive Finance data is protected through granular authorization.

### FIN-INV-030

Management-profitability reporting must prevent the same underlying cost from being deducted multiple times.

---

# 277. V1 Mandatory Scope

Maevelle V1 Finance Operations should include:

```text
✓ Finance Operations domain

✓ General Expense

✓ Expense Number

✓ Expense Description

✓ Expense Date

✓ Due Date

✓ Amount

✓ Currency

✓ Expense Categories

✓ Nested Expense Categories

✓ Expense Payee

✓ Payee snapshots

✓ Manual Expenses

✓ Source-backed financial activities

✓ Unique source protection

✓ Expense Attachments

✓ Internal Notes

✓ DRAFT / RECORDED / CANCELLED

✓ UNPAID / PARTIALLY_PAID / PAID

✓ Expense Payment Allocation

✓ Partial Expense Payments

✓ One payment across multiple Finance-owned Expenses

✓ Financial Accounts

✓ CASH

✓ BANK

✓ MOBILE_WALLET

✓ PAYMENT_PROVIDER_BALANCE foundation

✓ Opening Balances

✓ Cash Movements

✓ INFLOW / OUTFLOW

✓ Cash Movement source references

✓ Manual Cash Movements

✓ Cash Transfers

✓ Transfer fees separation

✓ Account System Balance

✓ Customer Payment cash integration

✓ Supplier Payment cash integration

✓ Customer Refund cash integration

✓ COD Settlement cash integration

✓ Shipment Expense finance integration

✓ Payment Provider Fee integration

✓ Marketing / Advertising Expenses

✓ Operating Expenses

✓ Fulfillment Expense classification

✓ Management financial classifications

✓ Unallocated Cash Movements

✓ Duplicate Expense Detection

✓ Finance Health / Exception detection

✓ Search

✓ Filters

✓ Saved Views

✓ Finance Dashboard

✓ Expense Analytics

✓ Cash Flow Analytics

✓ Permissions

✓ Audit

✓ Concurrency protection

✓ Idempotency

✓ CSV/XLSX-friendly Export
```

---

# 278. Strongly Preferred V1

```text
Recurring Expense Templates

Expense Due / Overdue Notifications

Statement CSV/XLSX Import

Manual Statement Reconciliation

Finance Health Dashboard

Duplicate Invoice Reference Protection

Expense Category Defaults for Source Costs

Cash Position Dashboard

Unallocated Transaction Queue

Unified Payables View

Large Expense Alerts

Expense Import

Marketing Expense Reporting

COD Settlement Outstanding View
```

---

# 279. Foundation Now / Later

Architecture should prepare for:

```text
Bank Statement APIs

Automatic bKash/Nagad Statement Import

Budgeting

Cash Forecasting

Cost Centers

Campaign Expense Allocation

Vendor Payment Batches

Approval Workflows

Expense Reimbursement

Owner Funding

Loans

Capital Assets

Accounts Payable

Accounts Receivable

Accounting Integration

Chart of Accounts

General Ledger

Tax/VAT
```

---

# 280. Deferred Advanced Finance

Post-V1:

```text
Complete General Ledger

Double-Entry Accounting

Balance Sheet

Income Statement

Cash Flow Statement accounting version

FIFO/Weighted Average COGS posting

Vendor Ledger

Customer Ledger

Bank Feeds

Automatic Bank Reconciliation

Budget vs Actual

Cash Forecasting

Fixed Assets

Depreciation

Payroll Accounting

Tax Filing

VAT Returns

Multi-Entity Consolidation

Financial Close

Audit Packages
```

---

# 281. Decisions Established

### Decision FIN-001

**Finance Operations is broader than a standalone Expense table.**

### Decision FIN-002

**Business Event, Expense/Obligation, Cash Movement, and Financial Classification are separate concepts.**

### Decision FIN-003

**Finance does not duplicate source-domain financial truth.**

### Decision FIN-004

**General operational Expenses are owned directly by Finance.**

### Decision FIN-005

**Procurement, Shipment, Payment, and future Delivery remain authoritative for their source financial records.**

### Decision FIN-006

**Finance may create normalized financial projections/references for unified reporting.**

### Decision FIN-007

**Financial Activity projections are not independent editable copies of source records.**

### Decision FIN-008

**Expenses can be unpaid or partially paid.**

### Decision FIN-009

**Actual Cash Movements are first-class.**

### Decision FIN-010

**Cash Movement does not itself imply Expense.**

### Decision FIN-011

**Internal Cash Transfers are explicitly separated from Expense/Revenue.**

### Decision FIN-012

**Financial Accounts represent locations where business money is held/reconciled.**

### Decision FIN-013

**Payment Accounts and Financial Accounts remain conceptually separate but linkable.**

### Decision FIN-014

**Opening balances are explicit financial movements/migration state, not Revenue.**

### Decision FIN-015

**Expense payments use Cash Movement allocations rather than a boolean `paid`.**

### Decision FIN-016

**One Cash Movement may satisfy multiple Finance-owned Expense obligations.**

### Decision FIN-017

**Unidentified real Cash Movements may remain unallocated pending reconciliation.**

### Decision FIN-018

**Unclassified truth is preferred over fabricated financial classification.**

### Decision FIN-019

**Source-generated costs use unique source identity to prevent duplicate counting.**

### Decision FIN-020

**Shipment Expenses can participate in both Finance reporting and Landed Cost without becoming duplicate costs.**

### Decision FIN-021

**Customer Refund is a Cash Outflow but not automatically a general Expense.**

### Decision FIN-022

**Supplier Payment is a Cash Outflow but is not duplicated as a general Expense.**

### Decision FIN-023

**COD customer collection and actual Maevelle cash settlement remain separate.**

### Decision FIN-024

**Provider fees remain separate from gross customer collection and from unrelated operating costs.**

### Decision FIN-025

**Recurring Expense Templates generate obligations, not imaginary payments.**

### Decision FIN-026

**Expense Date and Paid Date remain separate.**

### Decision FIN-027

**Management expense reporting and cash-flow reporting use different source concepts.**

### Decision FIN-028

**Profitability metrics must explicitly define whether a cost is acquisition, fulfillment, payment, marketing, or operating cost.**

### Decision FIN-029

**Finance Operations will not pretend to be statutory accounting in V1.**

### Decision FIN-030

**The architecture remains intentionally ready for a later true Accounting/GL domain.**

---

# 282. Resulting Finance Model

The core model becomes:

```text
                    BUSINESS EVENT
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
      FINANCIAL OBLIGATION        SOURCE DATA
           / EXPENSE
             │
             │ payment allocation
             ▼
        CASH MOVEMENT
             │
             ▼
      FINANCIAL ACCOUNT
```

For source domains:

```text
Shipment Expense
       │
       ├──► Landed Cost
       │
       ├──► Finance Classification
       │
       └──► Cash Payment
```

There is still only **one freight cost**.

---

# 283. Supplier Example

```text
Purchase
৳500,000
      │
      ▼
Supplier Invoice
৳500,000
      │
      ├──────────────┐
      ▼              ▼
Payment 1         Payment 2
৳200,000         ৳300,000
      │              │
      ▼              ▼
Bank Outflow      Bank Outflow
```

Finance does **not** add:

```text
General Expense:
৳500,000
```

on top of it.

---

# 284. General Expense Example

```text
Office Rent
৳50,000
    │
    ▼
Expense
UNPAID
    │
    ▼
Bank Payment
৳50,000
    │
    ▼
Cash Outflow
```

---

# 285. COD Example

```text
Customer Order
৳1,500
     │
     ▼
Customer Pays Courier
৳1,500
     │
     ▼
Payment Domain:
Customer PAID
     │
     ▼
Courier Holds Money
     │
     ▼
Settlement
Gross ৳1,500
Fees ৳95
Net ৳1,405
     │
     ├──► Finance Cost ৳95
     │
     └──► Bank Inflow ৳1,405
```

This correctly separates:

```text
Customer commerce

Provider cost

Actual business cash
```

---

# 286. Internal Transfer Example

```text
BRAC Bank
৳300,000
     │
     │ transfer ৳100,000
     ▼
bKash Balance
৳100,000
```

Finance reports:

```text
Bank -100,000

bKash +100,000

Net cash change:
0

Expense:
0
```

Exactly as it should.

---

# 287. Complete Money Architecture

We now have:

```text
                         MONEY

        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ACQUISITION          SALES             OPERATIONS
        │                  │                  │
        ▼                  ▼                  ▼
 Procurement          Payments            Expenses
        │                  │                  │
 Shipments            Refunds                │
        │             Settlements             │
 Landed Cost              │                   │
        └──────────────────┼───────────────────┘
                           ▼
                   FINANCE OPERATIONS
                           │
                 ┌─────────┴─────────┐
                 ▼                   ▼
             Obligations         Cash Movements
                                     │
                                     ▼
                              Financial Accounts
```

This is strong enough for V1 management operations while remaining clean enough to support real accounting later.

---

# 288. Architecture Milestone

At this point the major internal business/transaction foundations are extremely well covered:

```text
Catalog                 ✓
Sizing                  ✓
Inventory               ✓
Warehouse               ✓
Procurement             ✓
Inbound Shipment        ✓
Landed Cost             ✓
Orders                  ✓
Payments                ✓
Customers               ✓
Media                   ✓
Identity & Access       ✓
Finance Operations      ✓
```

The next domain should **not** be another back-office financial subsystem.

We should now move into the **public commerce experience**, where many of these foundations finally come together.

---

# 289. Recommended Next Domain

Next:

```text
docs/domains/storefront/storefront-commerce-architecture.md
```

This should define:

```text
Storefront Architecture

Navigation

Category Browsing

Collections

Product Listing

Product Detail

Variant Selection

Color Switching

Size Selection

Size Guide

Gallery Resolution

Stock Availability

Price Display

Search

Faceted Filtering

Tags

Occasions

Ratings / Reviews

Cart

Guest Cart

Checkout

Fast Bangladesh Checkout

Customer Identity Resolution

Address Input

Delivery Method

Payment Method Selection

Coupon Application

Inventory Revalidation

Order Placement

Idempotency

SEO

Metadata

Structured Data

Social Sharing

Breadcrumbs

Performance

Caching

First Load

Image Optimization

Accessibility

Error Handling

Out-of-Stock UX

Price Changes During Checkout

Stock Changes During Checkout

Mobile UX

Future Customer Account Readiness

Future Themes

Future CMS Boundary
```

The storefront document should deliberately **not** redesign Order, Inventory, Payment, Customer, Catalog, Media, or Sizing logic.

Instead it should orchestrate those already-defined domains into a fast public customer experience.

---

**End of Finance Operations & Expense Architecture v0.1**
