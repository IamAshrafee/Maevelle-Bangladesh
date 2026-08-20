# Maevelle Ecommerce — Analytics & Reporting Architecture

**Document:** `docs/domains/analytics/analytics-reporting-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** All transactional domains, `finance-operations-architecture.md`, `access-control-architecture.md`, `storefront-commerce-architecture.md`

---

# 1. Purpose

The Analytics domain defines how Maevelle transforms trusted operational data into:

```text
KPIs

Dashboards

Reports

Trends

Comparisons

Breakdowns

Drill-downs

Exports

Management insights
```

without turning analytics tables or dashboard numbers into transactional authority.

---

# 2. Core Principle

> **Transactional domains own facts. Analytics interprets them.**

Conceptually:

```text
ORDERS
PAYMENTS
INVENTORY
PROCUREMENT
SHIPMENTS
LANDED COST
FINANCE
CUSTOMERS
PROMOTIONS
REVIEWS
        │
        ▼
ANALYTICS PROJECTIONS
        │
        ▼
METRIC DEFINITIONS
        │
        ▼
DASHBOARDS / REPORTS
```

---

# 3. Second Core Principle

> **A metric is a defined business concept—not an arbitrary SQL expression inside a dashboard.**

For example:

```text
Net Sales
```

must have one canonical definition.

Not:

```text
Dashboard A:
SUM(order.total)

Dashboard B:
SUM(payment.amount)

Dashboard C:
SUM(order.total - refunds)
```

all labelled:

```text
Sales
```

---

# 4. Third Core Principle

> **Gross Sales, Net Sales, Cash Inflow, Gross Margin and Profit are different metrics.**

Example:

```text
Customer Order:
৳2,000

Discount:
৳200

Refund:
৳300

Payment Provider Fee:
৳50

Landed Cost:
৳900
```

Different questions produce different results.

---

# 5. Fourth Core Principle

> **Analytics projections are rebuildable.**

If an analytics table becomes corrupt:

```text
rebuild from trusted domain data
```

must be possible.

Never:

```text
Analytics says stock = 5
therefore Inventory stock becomes 5.
```

---

# 6. Fifth Core Principle

> **Every metric has explicit time semantics.**

We must distinguish:

```text
When business event happened
```

from:

```text
When Analytics processed it.
```

Apache Flink's event-time model similarly distinguishes the time an event occurred from the system processing time, which is useful conceptual validation for late-arriving events and backfills.

---

# 7. Sixth Core Principle

> **Historical reporting must not silently change because current master data changed.**

Example:

Product was:

```text
Category:
Hats
```

when sold.

Later moved to:

```text
Accessories
```

We must deliberately define whether a historical report means:

```text
Category at sale time
```

or:

```text
Current Product category
```

rather than getting accidental results.

---

# 8. Research-Informed Direction

dbt's current Semantic Layer/MetricFlow is built around defining metric logic centrally so the same business metric can be queried consistently from different consumers. That reinforces Maevelle's decision to maintain a central **Metric Catalog** rather than duplicating formulas across dashboards.

Microsoft's current dimensional-modeling guidance distinguishes **fact tables**, which capture events/observations, from **dimension tables**, which describe entities used to group and filter those facts. Maevelle does not need a separate warehouse on day one, but the same conceptual separation is useful for our analytical projections.

For multi-currency reporting, current Microsoft BI guidance recognizes currency conversion as a separate reporting concern rather than simply summing unlike currencies together; one documented strategy aggregates by currency/period before applying reporting exchange rates. Our architecture therefore preserves source currencies and makes reporting conversion policy explicit.

---

# 9. Analytics Responsibilities

Analytics owns:

```text
Metric Catalog

Metric Definitions

Metric Versions

Analytical Facts

Analytical Dimensions

Reporting Projections

Snapshots

Aggregates

Dashboards

Reports

Saved Reports

Saved Views

Drill-Down

Period Comparison

Currency Reporting

Analytical Exports

Data Quality

Backfills

Projection Rebuild

Late-Arriving Data Handling

Analytics Access Control
```

---

# 10. Analytics Does Not Own

Analytics does not own:

```text
Order state

Payment state

Inventory quantity

Customer master

Product master

Expense

Landed Cost

Refund execution

Promotion usage authority
```

---

# 11. Primary Concepts

Recommended:

```text
Metric Definition

Metric Version

Dimension Definition

Analytical Fact

Analytics Projection

Metric Snapshot

Report Definition

Report Filter

Saved Report

Dashboard

Dashboard Widget

Data Quality Check

Analytics Refresh Run
```

---

# 12. Metric Definition

A **Metric Definition** describes exactly what a KPI means.

Required conceptual fields:

```text
Metric Key

Display Name

Description

Formula

Source Facts

Grain

Time Basis

Currency Basis

Eligible States

Exclusions

Supported Dimensions

Precision

Version

Sensitivity
```

---

# 13. Example — Gross Merchandise Sales

Potential definition:

```text
Metric:
sales.gross_merchandise

Meaning:
Gross committed merchandise value
before Promotions and Returns.

Source:
Order Lines

Time:
Order committed_at

Currency:
Transaction currency or configured reporting currency

Excludes:
Cancelled-before-commit lines
Delivery charge
Taxes if separately represented
```

The precise formula becomes an intentional contract.

---

# 14. Example — Net Merchandise Sales

Conceptually:

```text
Gross Merchandise Sales
-
Committed Merchandise Discounts
-
Eligible Returned/Refunded Merchandise Value
=
Net Merchandise Sales
```

Exact treatment of cancellation/refunds must follow Order/Payment history.

---

# 15. Metric Key

Stable machine identifier:

```text
sales.net_merchandise
```

not dashboard title.

---

# 16. Display Name

Human-readable:

```text
Net Sales
```

---

# 17. Description

Must answer:

```text
What does this number include?

What does it exclude?

When is it counted?
```

---

# 18. Metric Grain

Grain means the lowest unit at which the underlying fact is defined.

Examples:

```text
Order

Order Line

Payment Transaction

Inventory Movement

Purchase Line

Shipment Allocation

Expense

Cash Movement

Review
```

---

# 19. Grain Is Critical

Bad analytics:

```text
Orders joined to Order Lines
joined to Payments
```

then:

```text
SUM(order.total)
```

can duplicate Order totals because one Order may have many lines/payments.

Metric grain must prevent this.

---

# 20. Fact vs Dimension

Conceptually:

```text
FACT
What happened?

DIMENSION
How do we describe/group it?
```

---

# 21. Example Fact

```text
Order Line Sale Fact

Amount

Quantity

Discount

Product

Customer

Date
```

---

# 22. Example Dimensions

```text
Product

Variant

Category

Customer

Date

Location

Supplier

Promotion

Payment Method
```

---

# 23. Star-Like Reporting Model

A mature analytical projection may conceptually look like:

```text
             Product
                │
Customer ── Sales Fact ── Date
                │
             Promotion
                │
             Location
```

This follows the standard fact/dimension approach described in Microsoft's current analytical-modeling guidance.

---

# 24. No Separate Warehouse Required V1

This conceptual model does **not** mean Maevelle immediately needs:

```text
Snowflake

BigQuery

Redshift

Dedicated data warehouse
```

V1 can maintain reporting projections inside PostgreSQL.

---

# 25. V1 Architecture

Recommended:

```text
PostgreSQL
├── Transactional domain tables
└── Analytical projections / materialized reporting tables
```

Later:

```text
Transactional DB
       ↓
CDC / Events / ETL
       ↓
Analytics Warehouse
```

if justified.

---

# 26. Analytics Read Isolation

Heavy reporting queries should not degrade:

```text
Checkout

Inventory reservation

Payment verification

Order creation
```

---

# 27. V1 Strategy

Use:

```text
purpose-built projections

indexes

pre-aggregations

background refresh
```

for expensive analytics.

---

# 28. Future Read Replica

When load justifies:

```text
Analytics Reads
→ PostgreSQL read replica
```

can reduce pressure on primary transactional database.

---

# 29. Future Warehouse

Move to separate analytical infrastructure only when:

```text
data volume

report complexity

query load

cross-source integrations
```

justify it.

---

# 30. Metric Catalog

Maevelle should maintain one central catalog containing every official KPI.

Categories:

```text
Sales

Orders

Customers

Products

Inventory

Procurement

Shipments

Finance

Payments

Promotions

Reviews

Operations
```

---

# 31. Why Metric Catalog?

User asks:

```text
How much did we sell this month?
```

System should know which official metric represents:

```text
Sales
```

rather than letting each developer improvise.

---

# 32. Metric Documentation

Admin/report tooltip can display:

```text
Net Sales

Committed merchandise value
after discounts and merchandise refunds.
Excludes delivery charges.
```

---

# 33. Metric Version

Metric definitions may evolve.

Example:

```text
Gross Margin V1
```

initially excludes delivery fees.

Later business decides to include:

```text
payment processing fee
```

in a contribution metric.

Do not silently redefine historical dashboards.

---

# 34. Metric Versioning

Conceptually:

```text
Metric:
margin.contribution

Version 1
Formula A

Version 2
Formula B
```

---

# 35. Dashboard Uses Version

Dashboard/report should know which metric definition/version it uses.

---

# 36. Definition Change

If change is correction of a bug:

```text
backfill/recalculate
```

may be appropriate.

If change is genuinely new business meaning:

```text
new metric version
```

or new metric.

---

# 37. Metric Alias

Potential:

```text
"Revenue"
```

could be discouraged if ambiguous.

Prefer:

```text
Gross Merchandise Sales

Net Merchandise Sales

Cash Collected
```

---

# 38. Sales Metrics

Core V1 should include:

```text
Gross Merchandise Sales

Discounts

Net Merchandise Sales

Delivery Charges Collected

Order Gross Value

Refunded Merchandise Value

Refunded Delivery Value

Net Order Revenue foundation
```

---

# 39. Gross Merchandise Sales

Should represent:

```text
merchandise value
before Promotion Discounts
```

from committed qualifying Order Lines.

---

# 40. Discounts

Derived from:

```text
committed Discount Allocations
```

not Coupon definitions.

---

# 41. Why?

Promotion:

```text
10% off
```

could produce:

```text
৳50
```

or:

```text
৳500
```

depending on Order.

Actual analytics uses applied allocations.

---

# 42. Net Merchandise Sales

Conceptually:

```text
Gross Merchandise Sales
-
Discount Allocations
-
qualifying Returned/Refunded Merchandise
```

subject to documented timing.

---

# 43. Delivery Charges Collected

Separate.

Do not include Delivery implicitly in Product revenue if we want Product-level margins.

---

# 44. Order Value

Potential:

```text
Order Gross Value

Order Net Value

Order Payable
```

all separately definable.

---

# 45. Orders Metric

Useful:

```text
Orders Created

Orders Committed

Orders Confirmed

Orders Cancelled

Orders Fulfilled

Orders Completed

Delivery Failed Orders future
```

---

# 46. One Generic "Orders" Card Is Ambiguous

Dashboard should usually use:

```text
Committed Orders
```

or clearly state selected status basis.

---

# 47. Average Order Value

Must specify numerator and denominator.

Recommended operational AOV:

```text
Net Merchandise Sales
+
Net Delivery Charges
-------------------------
Qualifying Committed Orders
```

or another explicitly approved formula.

---

# 48. Do Not Calculate AOV From Payment Count

One Order may have multiple payments.

---

# 49. Cancellation Rate

Conceptually:

```text
Cancelled qualifying Orders
/
Created/committed qualifying Orders
```

Definition must specify denominator and cancellation timing.

---

# 50. Customer Metrics

Core:

```text
Customers Created

Customers With Orders

New Customers

Repeat Customers

Orders per Customer

Customer Net Sales

Customer Lifetime Value foundation
```

---

# 51. New Customer

Do not define as:

```text
Customer record created this month.
```

Recommended commercial definition:

```text
Customer's first qualifying committed Order
occurred during period.
```

---

# 52. Repeat Customer

Customer with:

```text
previous qualifying Order
```

before current Order.

---

# 53. Customer Merge

Analytics must use:

```text
canonical Customer
```

for future aggregation.

---

# 54. Historical Customer Merge

After Customer A+B merge, customer-level lifetime metrics should normally combine them.

Order facts remain historically traceable to original records but resolve canonical customer dimension.

---

# 55. Customer LTV

Do not label a crude:

```text
SUM(order totals)
```

as full LTV without definition.

Potential V1:

```text
Customer Lifetime Net Sales
```

Future:

```text
Customer Lifetime Gross Margin
```

---

# 56. Product Metrics

Core:

```text
Units Ordered

Units Fulfilled

Gross Merchandise Sales

Net Merchandise Sales

Discounts

Returns

Refund Value

Landed Cost

Gross Margin

Review Rating

Review Count
```

---

# 57. Variant Metrics

Same at Variant grain.

Very important for:

```text
Color

Size

specific SKU performance
```

---

# 58. Product vs Variant

Product report aggregates all Variants.

Variant report preserves actual sellable configuration.

---

# 59. Category Metrics

Potential:

```text
Sales by Category

Units by Category

Margin by Category
```

Need category semantics.

---

# 60. Multi-Category Product Problem

Product can belong to:

```text
Category A

Category B
```

If sales are counted in both:

```text
category totals exceed business total.
```

---

# 61. Category Reporting Modes

Two distinct reports:

### Attribution Mode

```text
Use Primary Category
```

so every Product sale contributes once.

### Membership Analysis

```text
Count sale in every Category membership
```

useful for merchandising but totals intentionally overlap.

---

# 62. V1 Recommendation

Official financial Category metrics use:

```text
Primary Category attribution
```

where configured.

Membership analysis explicitly labelled non-additive.

---

# 63. Historical Category

Order Line should preserve Product/Variant snapshots.

But full historical Category attribution may require analytical snapshot of relevant dimension at sale.

---

# 64. Dimension History

Potential future slowly changing dimension concept:

```text
Product was Category X
from date A–B
```

but V1 can preserve selected analytical attributes on sale projection.

---

# 65. Product Type Metrics

Product Type is more stable than merchandising Category and useful for reporting.

---

# 66. Color Metrics

Possible:

```text
Sales by Primary Color
```

using purchased Variant's actual primary color.

---

# 67. Associated Colors

Do not count associated searchable colors as actual sold Variant color.

---

# 68. Size Metrics

Use purchased Variant's Size Definition.

Potential:

```text
Units Sold by Size
```

within compatible Size Systems/Product Types.

---

# 69. Never Aggregate Incompatible Sizes Blindly

`Size 42` could mean:

```text
shoe

ring

clothing numeric
```

Different Sizing Domains/Systems must remain distinguishable.

---

# 70. Inventory Metrics

Core:

```text
On Hand

Sellable On Hand

Unavailable On Hand

Reserved

Available to Sell

Incoming

In Transit

Low Stock Items

Out-of-Stock Items
```

---

# 71. Current Inventory Metrics

These are point-in-time balances.

---

# 72. Historical Inventory Metrics

Question:

```text
How much stock did we have on July 1?
```

requires:

```text
ledger reconstruction
```

or snapshots.

---

# 73. Inventory Snapshot

Recommended periodic analytical snapshot:

```text
Inventory Item

Location

Date/Time

On Hand

Sellable

Reserved

Available

Incoming

In Transit
```

---

# 74. Why?

Recalculating one year of historical daily stock directly from every movement on every dashboard can become expensive.

---

# 75. Ledger Remains Authority

Inventory Snapshot is analytics optimization.

---

# 76. Snapshot Frequency

Potential V1:

```text
Daily
```

for management trends.

Intraday operational views use current Inventory Level.

---

# 77. Stockout Rate

Needs exact definition.

Potential:

```text
Percentage of active sellable Variants
with ATS <= 0
```

at snapshot.

---

# 78. Low Stock

Use actual Inventory low-stock policy, not analytics's own threshold.

---

# 79. Inventory Movement Metrics

```text
Units Received

Units Fulfilled

Units Returned

Units Damaged

Units Adjusted

Units Transferred

Stocktake Variance
```

from ledger movements.

---

# 80. Adjustment Analytics

Can show:

```text
Adjustments by reason

Adjustments by user

Large adjustments

Net adjustment quantity
```

subject to IAM.

---

# 81. Inventory Turnover

Future/advanced.

Requires:

```text
cost-of-goods basis
+
average inventory valuation
```

and must wait for reliable valuation policy.

Do not fake it from quantity alone.

---

# 82. Stock Valuation

Foundation:

```text
Inventory Quantity
×
appropriate acquisition cost layer
```

but exact valuation depends on future costing methodology.

Do not label current `variant.cost × stock` as authoritative inventory valuation.

---

# 83. Procurement Metrics

Core:

```text
Purchase Value

Quantity Ordered

Quantity Shipped

Quantity Received

Open Quantity

Supplier Spend

Purchase Price Variance

Lead Time

Supplier On-Time Performance foundation

Supplier Shortage/Damage
```

---

# 84. Purchase Value

Use Purchase commercial amounts.

Supplier Payment is not Purchase Value.

---

# 85. Supplier Spend

Could mean:

```text
Purchase committed value
```

or:

```text
actual supplier payments
```

Those are different metrics.

Use explicit names:

```text
Supplier Purchase Value

Supplier Cash Paid
```

---

# 86. Supplier Lead Time

Potential:

```text
Order confirmed date
→ qualifying receipt date
```

but partial receipts make it nuanced.

Metrics may include:

```text
First Receipt Lead Time

Final Receipt Lead Time
```

---

# 87. Supplier Fulfillment Rate

Potential:

```text
Resolved received quantity
/
ordered quantity
```

with cancellation exclusions defined.

---

# 88. Purchase Price History

Variant + Supplier:

```text
Unit purchase cost over time
```

useful for sourcing decisions.

---

# 89. Shipment Metrics

Core:

```text
Shipments Created

Shipments In Transit

Delayed Shipments

Average Transit Time

Customs Duration

Shipment Cost

Freight Cost

Shipment Variances

Damaged Quantity

Lost Quantity
```

---

# 90. Transit Time

Must define endpoints.

Example:

```text
Actual Departure
→
Actual Arrival at Destination
```

or:

```text
Actual Departure
→
Receipt Complete
```

These are different.

---

# 91. Journey Leg Metrics

Future:

```text
Duration by Leg

Provider Delay by Leg
```

possible because Shipment architecture preserves journey legs.

---

# 92. ETA Accuracy

Potential:

```text
Actual arrival - original estimated arrival
```

versus:

```text
Actual arrival - latest ETA
```

two useful metrics.

---

# 93. Landed Cost Metrics

Core:

```text
Purchase Base Cost

Allocated Freight

Allocated Customs

Allocated Taxes

Allocated Handling

Total Landed Cost

Landed Cost per Unit

Estimated vs Actual Variance
```

---

# 94. Cost Breakdown

Analytics reads Landed Cost allocations.

It does not recompute allocation.

---

# 95. Margin Metrics

At Product/Order Line grain:

```text
Net Merchandise Revenue
-
Acquisition / COGS Cost
=
Gross Margin
```

but exact COGS assignment depends on acquisition-cost provenance.

---

# 96. Gross Margin %

```text
Gross Margin
/
Net Merchandise Revenue
```

when denominator > 0.

---

# 97. Negative Margin

Allowed.

Do not clamp to zero.

A promotion/refund/cost spike may genuinely create negative margin.

---

# 98. Contribution Margin

Potential:

```text
Gross Margin
-
Fulfillment Cost
-
Payment Provider Fees
-
Direct Attributable Marketing Cost
=
Contribution Margin
```

---

# 99. Contribution Margin Is Not Accounting Net Profit

It is a management metric.

Clearly label formula.

---

# 100. Operating Result

Potential:

```text
Contribution Margin
-
General Operating Expenses
=
Management Operating Result
```

Still not statutory accounting income.

---

# 101. Profit Label

Avoid generic:

```text
Profit
```

where basis is ambiguous.

Use:

```text
Gross Margin

Contribution Margin

Management Operating Result
```

---

# 102. Finance Metrics

Core:

```text
Expenses Incurred

Expenses Paid

Outstanding Expenses

Overdue Expenses

Cash Inflows

Cash Outflows

Net Cash Movement

Cash Position

Unreconciled Cash Movements
```

---

# 103. Expense vs Cash

Dashboard must preserve distinction established by Finance Architecture.

---

# 104. Cash Position

Derived from:

```text
Financial Account balances
```

not Sales.

---

# 105. Cash Inflow

Examples:

```text
Customer Direct Payment

COD Settlement

Supplier Refund

Other valid inflow
```

---

# 106. Customer Payment ≠ Immediate Cash Inflow

COD collection can occur before settlement.

Finance domain already separates these.

Analytics follows that truth.

---

# 107. Payment Metrics

Core:

```text
Payment Attempts

Successful Payments

Failed Payments

Manual Payments Pending Verification

Payment Amount

Refund Amount

Provider Fees

Settlement Amount

Settlement Delay

Payment Method Mix
```

---

# 108. Payment Success Rate

Need denominator.

Example:

```text
Successful terminal Payment Attempts
/
all qualifying terminal Payment Attempts
```

Manual payment workflows may require separate metrics.

---

# 109. Payment Method Mix

Possible:

```text
COD

bKash

Nagad

future SSLCommerz
```

by:

```text
Order Count

Net Order Value
```

separately.

---

# 110. Refund Metrics

```text
Refund Count

Refund Amount

Refund Rate

Refund Reason
```

---

# 111. Refund Rate

Possible definitions:

```text
Refunded Orders / Completed Orders
```

or:

```text
Refund Value / Net Sales
```

These are different.

Use explicit metrics.

---

# 112. Promotion Metrics

Core:

```text
Promotion Uses

Coupon Uses

Discount Granted

Orders With Promotion

Net Sales Influenced

Average Discount

Usage Limit Utilization
```

---

# 113. Promotion Revenue Attribution

Do not claim:

```text
Promotion generated ৳1,000,000
```

merely because Orders used Coupon.

That is influenced sales, not proven incremental sales.

---

# 114. Better Label

```text
Net Sales on Orders Using Promotion
```

---

# 115. Promotion Incrementality

Requires:

```text
control groups

experiments

causal analysis
```

future.

---

# 116. Review Metrics

Core:

```text
Average Rating

Review Count

Rating Distribution

Verified Review Count

Photo Review Count

Review Submission Rate foundation

Moderation Queue
```

---

# 117. Rating Summary Source

Use Reviews projection.

Analytics should not independently calculate different eligibility rules.

---

# 118. Review Submission Rate

Potential denominator:

```text
eligible purchased Product/customer combinations
```

which must be precisely defined.

---

# 119. Warehouse Metrics

Core:

```text
Stock by Location

Available Stock

Inbound Receipts

Transfer Volume

Transfer Variance

Fulfilled Orders by Location

Inventory Adjustments
```

---

# 120. Future Warehouse Productivity

Potential:

```text
Pick time

Pack time

Receiving time

Order accuracy
```

once WMS processes exist.

---

# 121. Storefront Metrics

Analytics events can measure:

```text
Product Views

Add to Cart

Checkout Started

Order Placed

Searches

Search No-Result Rate
```

---

# 122. Behavioral Analytics vs Transactional Analytics

Very important.

```text
Order Placed
```

transaction should ultimately use Order domain as authority.

Analytics browser event:

```text
order_placed
```

can support funnel analytics but must not replace Order count.

---

# 123. Example

Browser analytics event fails.

Order exists.

Official:

```text
Orders = 1
```

not zero.

---

# 124. Funnel Metrics

Potential:

```text
Product View → Add to Cart

Add to Cart → Checkout

Checkout → Order
```

---

# 125. Session Definition

Funnel requires a defined:

```text
Storefront Session
```

and inactivity/identity rules.

Do not count raw pageviews as customers.

---

# 126. Unique Visitors

Requires analytics identity/cookie/privacy architecture.

Not essential transactional KPI.

---

# 127. Privacy

Behavioral tracking should be designed separately from business transactional analytics and respect applicable consent/privacy policy.

---

# 128. Analytics Event

For behavioral/technical events:

```text
Event ID

Event Name

Event Time

Session

Anonymous/User Context

Entity Context

Properties
```

---

# 129. Event Time

The time the activity occurred.

---

# 130. Processing Time

The time Analytics received/processed it.

The distinction is important when data arrives late or processing is retried.

---

# 131. Late Event

Example:

```text
Order occurred:
Aug 10

Analytics projection restored:
Aug 12
```

Official Aug 10 sales should ultimately include the Order.

Do not permanently attribute it to Aug 12 merely because processing was delayed.

---

# 132. Backfill

A **Backfill** recalculates historical analytical data from trusted source history.

---

# 133. Backfill Reasons

```text
Metric bug fixed

Projection failure

New dimension introduced

Customer merge

Historical import

Currency correction

Data repair
```

---

# 134. Backfill Must Be Traceable

Record:

```text
Run ID

Scope

Time range

Reason

Started by

Started at

Completed at

Rows affected

Errors
```

---

# 135. Backfill Does Not Mutate Transactions

It only rebuilds analytical state.

---

# 136. Analytics Refresh Run

Background job records:

```text
Projection

From watermark/time

To watermark/time

Rows processed

Status

Errors
```

---

# 137. Incremental Processing

Do not rebuild entire analytics dataset on every new Order.

Use:

```text
events

changed timestamps

watermarks

source versions
```

where appropriate.

---

# 138. Full Rebuild

Still needed as recovery option.

---

# 139. Source Event Idempotency

Processing same:

```text
order.created
```

twice cannot double Sales.

---

# 140. Facts Need Stable Source Identity

Example:

```text
Sales Fact
source_order_line_id = OLI-1005
```

unique for relevant fact type.

---

# 141. Corrections

If source Order line changes through legitimate amendment:

Analytics updates:

```text
same analytical fact/source identity
```

or posts corresponding analytical correction according to projection design.

Do not add duplicate revenue.

---

# 142. Event-Sourced vs State Projection

Different metrics use different source strategies.

Example:

```text
Current Product status
→ current state projection
```

while:

```text
Inventory movement
→ event fact
```

---

# 143. Order Financial Fact

Should use immutable/snapshotted Order Line amounts rather than current Product price.

---

# 144. Dimensions

Core dimensions:

```text
Date

Time

Product

Variant

Product Type

Category

Customer

Location

Supplier

Payment Method

Promotion

Review Rating

Expense Category

Currency
```

---

# 145. Date Dimension

Useful attributes:

```text
Date

Day

Week

Month

Quarter

Year

Day of Week
```

---

# 146. Business Day

Potential future:

```text
holiday

campaign date
```

can be added.

---

# 147. Timezone

All business period boundaries must use explicitly configured business/reporting timezone.

Maevelle default initially:

```text
Asia/Dhaka
```

but architecture remains configurable.

---

# 148. Stored Timestamps

Store absolute timestamps consistently.

Reporting converts/group into configured timezone.

---

# 149. Midnight Boundary

Order:

```text
2026-08-20 00:05 Dhaka
```

belongs to August 20 business day even if stored UTC timestamp falls on prior UTC date.

---

# 150. Timezone Changes

Changing Organization timezone must not rewrite raw timestamps.

Reporting grouping changes according to selected/reporting timezone policy.

---

# 151. Historical Timezone

Future multi-region platform may require transaction/storefront timezone snapshots.

V1 can use Organization business timezone.

---

# 152. Period Comparison

Standard:

```text
Today vs Yesterday

This Week vs Previous Week

This Month vs Previous Month

This Year vs Previous Year
```

---

# 153. Comparison Must Use Same Metric Definition

No comparing:

```text
Current Net Sales
```

with:

```text
Prior Gross Sales
```

because projection versions differ.

---

# 154. Date Range

Dashboard supports:

```text
Today

Yesterday

Last 7 Days

Last 30 Days

This Month

Last Month

Custom
```

---

# 155. Inclusive Range Semantics

Use explicit:

```text
[start, end)
```

timestamps internally to avoid double counting boundary events.

---

# 156. Multi-Currency

Every monetary fact preserves:

```text
Transaction Amount

Transaction Currency
```

---

# 157. Never Sum Unlike Currencies

Bad:

```text
BDT 1000
+
USD 100
=
1100
```

---

# 158. Reporting Currency

Management dashboard may configure:

```text
BDT
```

as reporting currency.

---

# 159. Conversion Policy

Must define:

```text
Rate Source

Rate Date/Period

Rate Type

Conversion Version
```

---

# 160. Transaction-Time Converted Value

If source domain already stores authoritative conversion relevant to transaction:

```text
use that for transaction-specific metrics
```

where semantically appropriate.

---

# 161. Reporting FX

Cross-currency management reporting may instead use a configured reporting exchange-rate series.

---

# 162. Historical Rate

Never convert all historical sales using:

```text
today's exchange rate
```

without clearly calling the metric:

```text
Current-Rate Converted
```

---

# 163. Reporting Currency Values Are Derived

Original currency remains preserved.

---

# 164. FX Rate Table

Analytics can consume centralized:

```text
FX Rate
```

records from future Finance/Localization service.

---

# 165. Missing Rate

Do not silently treat:

```text
USD → BDT = 1
```

Flag:

```text
MISSING_REPORTING_FX
```

and exclude/identify affected metric as incomplete.

---

# 166. Currency Conversion Health

Dashboard can show:

```text
3 transactions excluded due to missing FX
```

rather than silently wrong totals.

---

# 167. Metric Precision

Display:

```text
৳1.2M
```

may be rounded UI.

Underlying metric retains authoritative decimal precision.

---

# 168. Percent Metrics

Need handling for:

```text
zero denominator
```

Use:

```text
N/A
```

rather than Infinity or misleading 0%.

---

# 169. Dashboard

A **Dashboard** is a curated collection of analytical views.

Potential V1 dashboards:

```text
Executive Overview

Sales

Products

Inventory

Procurement

Shipments

Finance

Customers

Promotions

Reviews
```

---

# 170. Executive Dashboard

Should surface only high-value KPIs.

Example:

```text
Net Sales

Committed Orders

Average Order Value

Gross Margin

Cash Position

Outstanding Expenses

Low Stock

Incoming Shipments
```

depending permissions.

---

# 171. Do Not Put 50 Widgets on Home Dashboard

Operational clarity matters more than showing every metric.

---

# 172. Dashboard Widget

Potential types:

```text
Metric Card

Line Chart

Bar Chart

Table

Distribution

Status Summary

Top-N List
```

---

# 173. Metric Card

Contains:

```text
Value

Period

Comparison

Definition tooltip

Optional drill-down
```

---

# 174. Comparison

Example:

```text
Net Sales
৳250,000

+12.4% vs previous period
```

---

# 175. Comparison Formula

```text
(current - previous)
/
abs(previous)
```

when meaningful.

Need special handling:

```text
previous = 0
```

---

# 176. Trend Color

UI might show positive/negative.

But direction is metric-specific.

Example:

```text
Refund Rate increasing
```

is usually bad.

```text
Net Sales increasing
```

usually good.

Metric metadata can define desirability direction.

---

# 177. Drill-Down

Metric should lead to records explaining it.

Example:

```text
Net Sales
৳250,000
```

click:

```text
Order/Order Line breakdown
```

---

# 178. Reconciliation Principle

User should be able to move:

```text
Dashboard KPI
→ Report rows
→ Source transaction
```

where permissions allow.

---

# 179. Example

```text
Expense Total
৳100,000
      ↓
Expenses Report
      ↓
EXP-1005
```

---

# 180. Analytics Is Explainable

A KPI that cannot be traced to source records becomes difficult to trust.

---

# 181. Report

A **Report** is a structured analytical query/view.

Examples:

```text
Sales by Product

Sales by Date

Inventory by Location

Supplier Spend

Expenses by Category
```

---

# 182. Standard Reports

Curated system reports should cover common business questions.

---

# 183. Saved Report

User can save:

```text
Metric

Dimensions

Filters

Sorting

Date range default
```

---

# 184. Report Builder Foundation

V1 should not immediately become a full BI platform.

Support controlled:

```text
Choose Metric

Choose supported Dimensions

Choose Filters

Choose Date Range
```

rather than arbitrary SQL.

---

# 185. Why Controlled Builder?

Keeps:

```text
metric semantics

permissions

grain

currency
```

safe.

---

# 186. Unsupported Dimension

If metric cannot logically group by:

```text
Supplier
```

do not permit that dimension.

---

# 187. Metric-Dimension Compatibility

Metric Catalog declares supported dimensions.

---

# 188. Non-Additive Metric

Examples:

```text
Average Rating

Inventory Balance

Conversion Rate
```

cannot simply be summed across subgroups.

Metric metadata should define aggregation behavior.

---

# 189. Additive Metrics

Examples:

```text
Net Sales

Units Sold

Discount Amount
```

usually additive across compatible dimensions/time.

---

# 190. Semi-Additive Metric

Inventory balance can be added across:

```text
Products

Locations
```

at one time point.

But not across:

```text
days
```

because:

```text
10 stock Monday + 10 stock Tuesday ≠ 20 stock
```

---

# 191. Metric Aggregation Type

Potential:

```text
ADDITIVE

SEMI_ADDITIVE

NON_ADDITIVE
```

---

# 192. Top Products

Define sorting metric explicitly:

```text
Top Products by Net Sales
```

not simply:

```text
Top Products
```

---

# 193. Product Ranking

Possible:

```text
Units

Revenue

Margin

Review Rating
```

all produce different rankings.

---

# 194. Report Filters

Examples:

```text
Date Range

Product

Category

Product Type

Variant

Customer

Location

Supplier

Payment Method

Promotion

Currency
```

---

# 195. Filter Authorization

A user who cannot access:

```text
Supplier costs
```

must not infer them through Analytics filters/reports.

---

# 196. Analytics Permissions

Suggested:

```text
analytics.dashboard.view

analytics.sales.view

analytics.products.view

analytics.inventory.view

analytics.customers.view

analytics.procurement.view

analytics.finance.view

analytics.margin.view

analytics.cash.view

analytics.reports.create

analytics.reports.export
```

---

# 197. Sensitive Metrics

Examples:

```text
Supplier Cost

Landed Cost

Gross Margin

Cash Balance

Operating Expenses
```

require separate permissions.

---

# 198. Product Operator

May see:

```text
Units Sold

Product Views

Rating
```

but not:

```text
Landed Cost

Margin

Cash Position
```

---

# 199. Warehouse User

May see:

```text
Stock

Transfers

Receiving
```

within Location scope.

---

# 200. Location Scope in Analytics

Inventory/warehouse analytics must respect IAM Location scope.

---

# 201. Example

User can access:

```text
Main Warehouse
```

only.

Dashboard:

```text
Stock by Location
```

must not reveal:

```text
Showroom stock.
```

---

# 202. Financial Aggregation Leakage

Even a total:

```text
All Warehouses stock value
```

could reveal unauthorized location information.

Scope applies to aggregates, not only rows.

---

# 203. Customer PII

Analytics normally should use:

```text
Customer ID

Customer segment

aggregate metrics
```

without full phone/address.

Detailed customer drill-down uses Customer permissions.

---

# 204. Customer Export

Separate permission.

---

# 205. Report Ownership

Saved report belongs to:

```text
User

Organization
```

Potential sharing:

```text
PRIVATE

SHARED
```

---

# 206. Shared Report

Other users still require permission for underlying metrics.

A shared report never grants additional access.

---

# 207. Export

Supported:

```text
CSV

XLSX
```

for tabular reports.

Potential PDF later.

---

# 208. Export Is Permission-Aware

Export receives same filtered authorized dataset.

---

# 209. Export Row Limits

Large exports should run asynchronously and have safe limits.

---

# 210. Export Snapshot

Long-running export should define data as of:

```text
request time
```

or document that it streams live-changing data.

Recommended:

```text
consistent report snapshot where feasible.
```

---

# 211. Analytics Cache

Metrics can be cached.

But cache key must include:

```text
Organization

Metric

Version

Date Range

Filters

Currency

Permission Scope where relevant
```

---

# 212. Never Share Permission-Sensitive Cache Blindly

Finance user's dashboard result cannot be reused for unauthorized user.

---

# 213. Cache Invalidation

Can be:

```text
time-based

event-based

projection version-based
```

depending metric.

---

# 214. Real-Time vs Near-Real-Time

Not every dashboard needs millisecond real time.

Recommended classifications:

### Transaction-Critical

```text
Current Inventory Availability
```

handled by source domain, not analytics.

### Near-Real-Time

```text
Today's Orders

Today's Sales
```

seconds/minutes acceptable.

### Periodic

```text
Monthly supplier performance

Historical inventory snapshot
```

can refresh less frequently.

---

# 215. Dashboard Freshness Indicator

Show:

```text
Updated 2 minutes ago
```

where analytics is not immediate.

---

# 216. Stale Projection

If refresh fails:

```text
do not silently present stale data as live.
```

Show health/freshness warning.

---

# 217. Metric Freshness SLA

Metric metadata may define expected freshness.

Example:

```text
sales:
5 minutes

inventory daily history:
24 hours
```

---

# 218. Data Quality

Analytics needs explicit checks.

Examples:

```text
Order line totals reconcile

Discount allocations reconcile

Refund amounts valid

Sales fact count matches eligible source lines

Missing Product dimensions

Missing FX

Orphan fact references

Duplicate source facts
```

---

# 219. Data Quality Check

Conceptually:

```text
Check Name

Projection

Severity

Last Run

Result

Affected Rows

Resolution
```

---

# 220. Severity

```text
INFO

WARNING

ERROR

CRITICAL
```

---

# 221. Critical Example

```text
Net Sales projection differs
from source Orders by ৳50,000.
```

---

# 222. Analytics Health Dashboard

Should show:

```text
Projection Freshness

Failed Refreshes

Metric Errors

Missing FX

Duplicate Facts

Orphan Dimensions

Backfill Status

Data Quality Failures
```

---

# 223. Reconciliation

For key financial metrics:

```text
Sales projection total
```

should reconcile against:

```text
qualifying Order history.
```

---

# 224. Finance Reconciliation

Cash analytics should reconcile to:

```text
Finance Cash Movements
```

not Payments.

---

# 225. Promotion Reconciliation

Discount metric:

```text
sum Order Discount Allocations
```

should match:

```text
sum Order committed discount totals.
```

---

# 226. Review Reconciliation

Review summary:

```text
rating count
```

must match eligible published Reviews.

---

# 227. Inventory Reconciliation

Historical movement analytics can reconcile:

```text
opening + movements
```

to Inventory ledger balances.

---

# 228. Projection Version

Every analytical projection can have:

```text
projection schema/version
```

for migrations.

---

# 229. Rebuild During Deployment

New analytics code may require:

```text
backfill new projection
```

before dashboard switches to it.

---

# 230. Blue/Green Metric Migration

Potential approach:

```text
build V2 projection

validate

switch reads

retire V1
```

for high-risk metrics.

---

# 231. Historical Imports

If Maevelle imports:

```text
previous Orders

Expenses

Purchases
```

analytics backfill should include them where trusted.

---

# 232. Imported Data Quality

Mark source:

```text
MIGRATION
```

and possibly completeness period.

---

# 233. Partial Historical Coverage

Dashboard must not imply:

```text
Lifetime Sales
```

if data only begins:

```text
January 2026.
```

---

# 234. Analytics Coverage Metadata

Potential:

```text
Reliable From:
2026-01-01
```

per domain/metric.

---

# 235. Source of Truth Marker

Report may display:

```text
Based on Maevelle Orders
```

or:

```text
Based on imported historical data + Maevelle Orders
```

if useful.

---

# 236. Event Corrections

Suppose:

```text
Order incorrectly recorded
```

then legitimately corrected through Order domain.

Analytics should update based on corrected source.

---

# 237. No Manual Dashboard Adjustment

Do not allow:

```text
Net Sales:
250,000

Admin override:
260,000
```

to hide source inconsistency.

Fix source or metric projection.

---

# 238. Analytical Annotation

If business needs explanation:

```text
Sales spike caused by offline migration
```

future dashboards can support annotations.

Annotations do not alter metrics.

---

# 239. Forecasting

Future.

Analytics can later add:

```text
Sales forecast

Inventory forecast

Cash forecast

Demand forecast
```

---

# 240. Forecast vs Actual

Never mix forecast into actual KPI.

Use:

```text
Actual

Forecast
```

separate series.

---

# 241. Targets / Goals

Future:

```text
Monthly Sales Target:
৳1,000,000
```

can be compared to actual.

Target is planning configuration, not transaction.

---

# 242. Budget

Finance Budget future.

Analytics consumes budget/target values.

---

# 243. Cohort Analytics

Future:

```text
Customer cohort by first purchase month
```

possible with canonical Customer + first Order date.

---

# 244. Retention

Future customer account/commerce:

```text
Repeat purchase within 30/60/90 days
```

can be defined.

---

# 245. RFM

Future:

```text
Recency

Frequency

Monetary
```

customer analysis.

Not V1 mandatory.

---

# 246. Search Analytics

Useful:

```text
Top Searches

No-Result Searches

Search → Product Click

Search → Order Conversion
```

---

# 247. Search Privacy

Do not retain unnecessarily sensitive customer-entered search content indefinitely.

---

# 248. Storefront Funnel Analytics

V1 foundation:

```text
Product View

Add to Cart

Checkout Started

Order Placed
```

---

# 249. Conversion Rate

Potential:

```text
Orders
/
Storefront Sessions
```

but only when session measurement is reliable.

---

# 250. Do Not Mix Transaction and Browser Sources Silently

Official Order count:

```text
Orders domain
```

Session count:

```text
Behavioral analytics
```

Metric definition documents both.

---

# 251. Ad Spend Analytics

Finance records:

```text
Marketing Expense
```

Future Campaign relationship can allow:

```text
Spend by Campaign
```

---

# 252. ROAS

Potential:

```text
Attributed Revenue
/
Ad Spend
```

requires attribution architecture.

Do not calculate true ROAS from generic Marketing Expense alone.

---

# 253. Marketing Attribution

Future dedicated Marketing domain.

Analytics should not invent causal attribution.

---

# 254. Current Safe Metric

```text
Marketing Spend
```

from Finance.

---

# 255. Supplier Dashboard

Potential:

```text
Purchase Value

Orders

Average Lead Time

Shortage Rate

Damage Rate

Price Trend
```

---

# 256. Shipment Dashboard

Potential:

```text
In Transit

Delayed

Arriving Soon

Average Transit Days

Shipment Cost

Cost Variance
```

---

# 257. Finance Dashboard

Potential:

```text
Expenses This Month

Outstanding Expenses

Cash Position

Cash In

Cash Out

Overdue Payables

Unreconciled Transactions
```

---

# 258. Product Dashboard

Potential:

```text
Net Sales

Units Sold

Margin

Stock

Review Rating

Return Rate
```

---

# 259. Customer Dashboard

Potential:

```text
New Customers

Repeat Customers

Orders per Customer

Net Sales per Customer

Top Customers
```

sensitive access controlled.

---

# 260. Promotion Dashboard

Potential:

```text
Usage

Discount Granted

Orders Using Promotion

Net Sales on Promotion Orders
```

---

# 261. Review Dashboard

Potential:

```text
Average Rating

New Reviews

Low Ratings

Pending Reviews

Rating Trend
```

---

# 262. Executive Dashboard

Recommended V1 cards:

```text
Net Sales

Committed Orders

AOV

Gross Margin

Cash Position

Expenses

Low Stock

Incoming Shipments
```

with role/capability-aware visibility.

---

# 263. Dashboard Personalization

User can later:

```text
reorder widgets

hide widgets

save date range
```

but core definitions remain centrally controlled.

---

# 264. Report Scheduling

Future:

```text
Email weekly sales report
```

should use Notifications/Scheduling infrastructure.

Analytics generates report.

Notifications delivers it.

---

# 265. Report Subscription

Future:

```text
Every Monday
send Sales Summary
```

recipient still needs permission.

---

# 266. Permission at Delivery Time

Scheduled report should recheck recipient's current access before delivery.

---

# 267. Historical Shared Export

A previously generated export might contain sensitive information.

Use private Media access/retention rules.

---

# 268. API

Conceptual queries:

```text
getMetric()

queryMetric()

getDashboard()

getReport()

runReport()

getAnalyticsHealth()

getMetricDefinition()

listAvailableDimensions()
```

---

# 269. Admin Commands

```text
saveReport()

shareReport()

runBackfill()

rebuildProjection()

acknowledgeDataQualityIssue()
```

Metric definitions themselves should normally be code/system-controlled in V1.

---

# 270. Why Metric Definitions Should Be Code-Controlled V1

Allowing business users to redefine:

```text
Gross Margin
```

through UI creates enormous consistency risk.

---

# 271. Configurable Metrics Future

A semantic reporting layer can later permit custom metrics with governance.

V1 official KPIs remain version-controlled application definitions.

---

# 272. API Result Metadata

Metric response should include:

```text
Metric Key

Metric Version

Value

Currency

Period

Timezone

Last Updated

Completeness/Warnings
```

where relevant.

---

# 273. Example

```text
Net Sales

৳252,450

Aug 1–20, 2026

Asia/Dhaka

Updated 2 minutes ago
```

---

# 274. Structured Errors

Examples:

```text
ANALYTICS_METRIC_UNKNOWN

ANALYTICS_DIMENSION_UNSUPPORTED

ANALYTICS_PERMISSION_DENIED

ANALYTICS_PROJECTION_STALE

ANALYTICS_MISSING_FX

ANALYTICS_BACKFILL_IN_PROGRESS

ANALYTICS_DATA_QUALITY_ERROR

ANALYTICS_REPORT_TOO_LARGE

ANALYTICS_VERSION_CONFLICT
```

---

# 275. Analytics Is Read-Heavy

Most Analytics APIs are queries.

Mutations mainly concern:

```text
saved reports

dashboard configuration

projection operations
```

---

# 276. Concurrency

Saved report/dashboard edits use optimistic concurrency.

---

# 277. Backfill Concurrency

Two backfills for same projection/time range should not corrupt each other.

Use:

```text
locking

run ownership

versioning
```

appropriate to implementation.

---

# 278. Projection Swap

Rebuild should avoid leaving dashboard half-populated.

Build/replace transactionally where feasible.

---

# 279. Idempotency

Analytics source processing must be idempotent.

---

# 280. Late Source Event

Processing a historical Order tomorrow updates its correct historical period.

---

# 281. Deleted Source

Commercial transactional sources generally archive/correct rather than hard-delete.

Analytics follows source lifecycle.

---

# 282. Draft Data

Draft Orders/Purchases/Expenses should not enter official financial metrics unless the metric explicitly represents Draft workload.

---

# 283. Separate Operational Workload Metrics

Example:

```text
Draft Purchases

Payments Awaiting Verification
```

can include non-final states.

---

# 284. Metric Eligibility States

Every metric explicitly lists eligible lifecycle states.

---

# 285. Example — Sales

Do not use:

```text
status != cancelled
```

as lazy catch-all.

Use explicit qualifying statuses/financial commitments.

---

# 286. Future New Status

If Order domain adds:

```text
ON_HOLD_REVIEW
```

official Sales metric should not accidentally change because SQL used a negative condition.

---

# 287. Prefer Inclusion Lists

Metric uses explicit:

```text
eligible economic state
```

rules.

---

# 288. Order State Dimensions

Analytics may still report counts by status.

This is separate from Sales eligibility.

---

# 289. Snapshot vs Event Metrics

### Flow Metric

Measured across period:

```text
Sales

Orders

Expenses
```

### Stock Metric

Measured at point in time:

```text
Inventory

Cash Balance
```

---

# 290. Do Not Sum Stock Across Time

Already established.

Metric metadata records:

```text
time aggregation behavior.
```

---

# 291. Daily Closing Snapshot

For Inventory/Cash trends:

```text
end-of-day balance
```

can provide chart points.

---

# 292. Current Cash Position

Use Finance current balances.

Historical trend uses snapshots/reconstructed movements.

---

# 293. Cash Balance Reconciliation

Analytics snapshot must reconcile to Finance source balances.

---

# 294. Currency-Specific Dashboard

User can view:

```text
Native Currency
```

breakdown where cross-currency conversion unavailable.

---

# 295. Multi-Currency Table

Example:

```text
BDT: ৳500,000

USD: $1,200

CNY: ¥8,000
```

better than an invalid combined number.

---

# 296. Reporting Currency Toggle

Future:

```text
BDT

USD
```

if approved FX policies exist.

---

# 297. Performance Budget

Dashboard should not execute dozens of massive live joins.

Use:

```text
projection

aggregation

caching
```

intelligently.

---

# 298. Pagination

Detailed reports require server pagination.

---

# 299. Large Top-N

Do not retrieve all Products to display:

```text
Top 10 Products.
```

---

# 300. Query Limits

Report builder should enforce:

```text
maximum date range where expensive

maximum rows

allowed dimensions
```

---

# 301. Asynchronous Heavy Reports

Large export/report:

```text
QUEUED

RUNNING

COMPLETED

FAILED
```

with generated private file.

---

# 302. Report Files

Use Media infrastructure:

```text
PRIVATE
```

with authorization and retention.

---

# 303. Generated Export Expiry

Exports containing customer/financial data should not live forever by default.

---

# 304. Observability

Track:

```text
Report query latency

Dashboard latency

Projection lag

Projection errors

Backfill duration

Cache hit rates

Export failures
```

---

# 305. Slow Metric

Identify metric/report causing load.

---

# 306. Analytics Failure Isolation

Analytics outage must not break:

```text
Storefront checkout

Orders

Payments

Inventory receiving
```

---

# 307. Dashboard Unavailable

Show:

```text
Analytics temporarily unavailable
```

while business operations continue.

---

# 308. Projection Write Failure

Domain transaction remains valid.

Durable event/reconciliation causes Analytics catch-up.

---

# 309. Do Not Put Analytics Update in Critical Transaction

Avoid:

```text
Order cannot commit because monthly_sales table lock failed.
```

---

# 310. Durable Processing

Use committed source/event/outbox data to update projections asynchronously where appropriate.

---

# 311. Analytics Audit

Need audit for:

```text
Backfill started

Projection rebuilt

Saved report shared

Sensitive export generated

Metric version changed
```

---

# 312. Viewing Analytics

Ordinary dashboard reads need not produce heavy audit logs.

Sensitive exports may.

---

# 313. Sensitive Export Audit

Record:

```text
User

Report

Filters

Date range

Generated file

Timestamp
```

---

# 314. Analytics Data Retention

Transactional facts typically follow underlying domain retention.

Behavioral analytics may have separate shorter/privacy-aware retention.

---

# 315. Personally Identifiable Analytics

Minimize duplication of:

```text
phone

email

address
```

inside analytical projections.

Prefer IDs and non-sensitive dimensions.

---

# 316. Customer Geography

Future geographic reporting can use:

```text
District

Area
```

derived appropriately.

Do not expose full addresses in analytics facts.

---

# 317. Data Lineage

For every metric, internal documentation should identify:

```text
Source Domain

Source Fact

Transformation

Projection

Metric
```

---

# 318. Example Lineage

```text
Order Line
   ↓
Sales Fact
   ↓
Discount Allocation join
   ↓
Net Merchandise Metric
   ↓
Sales Dashboard
```

---

# 319. Lineage Helps Debug

If Sales seems wrong:

```text
Dashboard
→ Metric
→ Projection
→ Source Order Lines
```

---

# 320. Data Contract

Source domains should expose stable analytical event/read contracts.

Analytics should not query arbitrary private tables without domain ownership discipline.

---

# 321. Modular Monolith Reality

Physical database may be shared.

Logical domain boundaries still matter.

---

# 322. Analytics Adapter

Each domain can expose:

```text
analytics projection builder
```

or events/read interfaces.

---

# 323. Avoid Tight Coupling

Analytics shouldn't depend on:

```text
internal column X from random implementation table
```

without a documented contract.

---

# 324. Testing — Sales

Mandatory scenarios:

```text
Normal Order

Order With Discount

Order With Delivery

Order Cancelled

Partial Cancellation

Full Refund

Partial Refund

Partial Return

Price Override

Promotion
```

---

# 325. Testing — Customer

```text
Guest Order

Repeat Customer

Customer Merge

First Order

Imported Customer
```

---

# 326. Testing — Inventory

```text
Receipt

Reservation

Fulfillment

Damage

Return

Transfer

Stocktake

Adjustment
```

---

# 327. Testing — Finance

```text
Expense incurred unpaid

Expense paid

Internal Transfer

Refund Outflow

COD Settlement

Supplier Payment
```

---

# 328. Testing — Multi-Currency

```text
BDT Order

USD Purchase

Missing Reporting FX

Historical FX change

Reporting currency switch
```

---

# 329. Testing — Time

```text
Order before midnight

Order after midnight

UTC date differs from Dhaka date

Late-arriving event

Backfill
```

---

# 330. Testing — Permissions

```text
Sales user

Warehouse-only user

Finance user

No Margin permission

Location-scoped user

Cross-Organization request
```

---

# 331. Testing — Projection

```text
Duplicate event

Out-of-order update

Projection crash

Full rebuild

Partial backfill

Source correction
```

---

# 332. Stress Scenario — One Million Order Lines

Reporting query should rely on indexed/projection data rather than loading business objects individually.

---

# 333. Stress Scenario — Huge Customer Merge

Two Customers with years of Orders merged.

Customer metrics eventually converge correctly without rewriting Order history.

---

# 334. Stress Scenario — Category Reorganization

Entire Catalog Category hierarchy changes.

Current merchandising reports change intentionally.

Historical sale-time attribution remains explainable.

---

# 335. Stress Scenario — Metric Bug

Net Sales formula accidentally excluded partial refunds.

Fix:

```text
new projection code

controlled backfill

validation

deployment
```

not manual dashboard adjustment.

---

# 336. Stress Scenario — Projection Missing Two Days

Domain source truth remains complete.

Backfill restores missing dates.

---

# 337. Stress Scenario — FX Rate Missing

Dashboard displays incomplete/warning state.

Does not invent a rate.

---

# 338. Stress Scenario — One Order Has 4 Payments

Order count remains:

```text
1
```

Payment transaction count:

```text
4
```

No grain duplication.

---

# 339. Stress Scenario — Product in 3 Categories

Primary-category Sales total counts it once.

Membership analysis may intentionally show it in all 3 and marks totals as non-additive.

---

# 340. Stress Scenario — Refund After Month Close

Order occurred:

```text
July
```

Refund occurs:

```text
August
```

We need two possible reporting questions:

```text
Refund activity in August

Restated net economics of July sale
```

They are not the same.

---

# 341. Transaction-Time vs Attribution-Time Metrics

Analytics can expose:

```text
Refunds by Refund Date
```

and:

```text
Net Sales attributed to Original Order Date
```

as separate metrics.

---

# 342. This Is Important

Otherwise management may ask:

```text
Why did July Sales change in August?
```

The answer depends on chosen report basis.

---

# 343. Restated vs Activity Reporting

Recommended two concepts:

### Activity View

```text
What happened during this period?
```

### Economic Attribution View

```text
What is the final/current economics of transactions originating in this period?
```

---

# 344. V1 Dashboard Default

Use:

```text
activity date
```

for operational activity dashboards.

Provide clearly defined net sales calculation and later restatement reports as needed.

---

# 345. Historical Freeze

Do not blindly freeze all monthly numbers forever.

Corrections/refunds legitimately affect economics.

Instead distinguish reporting basis.

---

# 346. Snapshot Reports

Future business may generate:

```text
Month-End Snapshot
```

for management close.

This captures metric values as known then.

---

# 347. Close Process

Full accounting close is future.

Analytics snapshots can still support operational historical comparison.

---

# 348. Important Invariants

### ANA-INV-001

Transactional domains remain authoritative over business facts.

### ANA-INV-002

Analytics projections never mutate transactional truth.

### ANA-INV-003

Every official KPI has a centrally defined Metric Definition.

### ANA-INV-004

Official Metric Definitions include explicit grain.

### ANA-INV-005

Official Metric Definitions include explicit eligible source states.

### ANA-INV-006

Official Metric Definitions include explicit time basis.

### ANA-INV-007

Monetary Metrics include explicit currency/reporting basis.

### ANA-INV-008

Unlike currencies are never silently summed.

### ANA-INV-009

Missing FX never silently defaults to 1:1.

### ANA-INV-010

Analytics source processing is idempotent.

### ANA-INV-011

Duplicate source events cannot duplicate analytical facts.

### ANA-INV-012

Late-arriving events are attributed according to event/business time where metric definition requires.

### ANA-INV-013

Analytics processing time never silently replaces business event time.

### ANA-INV-014

Historical Order metrics use Order transaction snapshots rather than current Product prices.

### ANA-INV-015

Dashboard caches cannot bypass permissions or scopes.

### ANA-INV-016

Aggregations respect the same authorization boundaries as detail rows.

### ANA-INV-017

Location-scoped users cannot infer unauthorized Location data from totals.

### ANA-INV-018

Sensitive financial metrics require explicit permissions.

### ANA-INV-019

Analytics can be rebuilt from trusted source history.

### ANA-INV-020

Backfills never mutate source-domain transactional records.

### ANA-INV-021

Metric formula changes are versioned or explicitly backfilled as corrections.

### ANA-INV-022

Discount metrics derive from committed Discount Allocations, not Promotion definitions.

### ANA-INV-023

Order counts do not multiply because of one-to-many Payment/Line relationships.

### ANA-INV-024

Inventory balances are treated as point-in-time/semi-additive metrics.

### ANA-INV-025

Historical inventory snapshots never become Inventory ledger authority.

### ANA-INV-026

Customer merge produces canonical analytical aggregation without rewriting historical Order truth.

### ANA-INV-027

Public/behavioral analytics cannot replace transactional Order/Payment metrics.

### ANA-INV-028

Analytics outages must not block core commerce operations.

### ANA-INV-029

Data-quality failures are surfaced rather than hidden with fabricated values.

### ANA-INV-030

Every critical KPI can ultimately be traced to underlying authorized source records.

---

# 349. V1 Mandatory Scope

Maevelle V1 Analytics should include:

```text
✓ Analytics domain

✓ Central Metric Catalog

✓ Metric Definitions

✓ Metric Keys

✓ Metric Descriptions

✓ Metric Grain

✓ Metric Time Basis

✓ Metric Currency Basis

✓ Metric Version foundation

✓ Analytical Projections

✓ Rebuildable projections

✓ Idempotent source processing

✓ Late-event handling

✓ Backfill

✓ Analytics Refresh Runs

✓ Data Quality Checks

✓ Analytics Health Dashboard

✓ Date Dimension

✓ Product Dimension

✓ Variant Dimension

✓ Customer Dimension

✓ Location Dimension

✓ Supplier Dimension

✓ Promotion Dimension

✓ Payment Method Dimension

✓ Expense Category Dimension

✓ Gross Merchandise Sales

✓ Discounts

✓ Net Merchandise Sales

✓ Delivery Charges

✓ Committed Orders

✓ Cancelled Orders

✓ Average Order Value

✓ Units Ordered

✓ Units Fulfilled

✓ New Customers

✓ Repeat Customers

✓ Sales by Product

✓ Sales by Variant

✓ Sales by Product Type

✓ Primary-Category Sales attribution

✓ Current Inventory KPIs

✓ Daily Inventory Snapshot

✓ Inventory Movements

✓ Low Stock

✓ Out of Stock

✓ Purchase Value

✓ Supplier Purchase Value

✓ Quantity Ordered / Received

✓ Shipment metrics

✓ Landed Cost breakdown

✓ Estimated vs Actual Landed Cost variance

✓ Gross Margin foundation

✓ Expense metrics

✓ Cash Inflows

✓ Cash Outflows

✓ Net Cash Movement

✓ Cash Position

✓ Payment metrics

✓ Refund metrics

✓ Promotion usage metrics

✓ Review metrics

✓ Warehouse/location metrics

✓ Executive Dashboard

✓ Sales Dashboard

✓ Product Dashboard

✓ Inventory Dashboard

✓ Procurement Dashboard

✓ Finance Dashboard

✓ Customer Dashboard

✓ Standard Reports

✓ Date Filters

✓ Dimension Filters

✓ Drill-Down

✓ CSV/XLSX Export

✓ Permissions

✓ Location-scoped Analytics

✓ Sensitive Financial Metric permissions

✓ Multi-currency preservation

✓ Reporting Currency foundation

✓ Missing-FX detection

✓ Projection freshness

✓ Observability
```

---

# 350. Strongly Preferred V1

```text
Report Builder

Saved Reports

Shared Reports

Dashboard Widget customization

Period comparisons

Metric-definition tooltips

Supplier Performance report

Shipment ETA accuracy

Promotion Analytics

Review Rating trends

Customer lifetime Net Sales

Storefront funnel foundation

Search analytics

Marketing Spend reporting

Contribution Margin foundation

Large async exports

Private generated report files

Metric reconciliation jobs

Analytics coverage/completeness indicators
```

---

# 351. Foundation Now / Later

Architecture should prepare for:

```text
Dedicated Analytics Warehouse

CDC

Read Replica

BI Tools

Forecasting

Budgets

Targets

Cohorts

Retention

RFM

Customer Segments

Campaign Attribution

ROAS

Inventory Forecasting

Demand Forecasting

Cash Forecasting

Advanced Supplier Scoring

Warehouse Productivity

Multi-Storefront Analytics

Advanced Multi-Currency Reporting
```

---

# 352. Deferred Advanced Capabilities

Post-V1:

```text
BigQuery/Snowflake/ClickHouse-class warehouse if justified

Advanced Semantic Layer

Self-Service BI

Custom Calculated Metrics

Natural-Language Analytics

Machine Learning Forecasts

Anomaly Detection

Marketing Attribution Models

Causal Promotion Analysis

Customer Cohorts

Retention Curves

RFM Segmentation

Inventory Forecasting

Demand Planning

Profitability Forecasting

Executive Scheduled Reports

Advanced Data Governance
```

---

# 353. Decisions Established

### Decision ANA-001

**Analytics is a projection/reporting domain, never transactional authority.**

### Decision ANA-002

**All official KPIs are centrally defined through a Metric Catalog.**

### Decision ANA-003

**Metric Definitions specify grain, formula, state eligibility, time basis, currency basis and dimensions.**

### Decision ANA-004

**Metric logic is not duplicated across arbitrary dashboard widgets.**

### Decision ANA-005

**Facts and Dimensions are separate analytical concepts.**

### Decision ANA-006

**V1 can use PostgreSQL analytical projections; a separate warehouse is not required initially.**

### Decision ANA-007

**Analytics infrastructure can later move to a warehouse without changing transactional domain ownership.**

### Decision ANA-008

**Source business event time and analytics processing time remain distinct.**

### Decision ANA-009

**Late-arriving events and backfills are first-class supported scenarios.**

### Decision ANA-010

**Analytics source processing is idempotent.**

### Decision ANA-011

**Historical commercial reports use transaction snapshots where current master-data changes would otherwise corrupt history.**

### Decision ANA-012

**Category financial attribution uses Primary Category by default to prevent double-counting across multi-category membership.**

### Decision ANA-013

**Membership-based Category analysis is allowed but must be explicitly marked non-additive.**

### Decision ANA-014

**Current inventory and historical inventory are separate analytical concepts.**

### Decision ANA-015

**Historical Inventory trends use ledger reconstruction/snapshots rather than summing daily balances.**

### Decision ANA-016

**Cash, Sales and Expense metrics remain separate.**

### Decision ANA-017

**Gross Sales, Net Sales, Gross Margin, Contribution Margin and Management Operating Result remain separately defined metrics.**

### Decision ANA-018

**Promotion analytics uses actual committed Discount Allocations, not configured Promotion percentages.**

### Decision ANA-019

**Review analytics consumes the canonical Review rating projection.**

### Decision ANA-020

**Unlike currencies are never summed without explicit reporting conversion.**

### Decision ANA-021

**Original transaction currencies remain preserved even when a reporting currency is used.**

### Decision ANA-022

**Historical reporting FX never silently uses today's rate.**

### Decision ANA-023

**Dashboard/report access is permission and scope aware.**

### Decision ANA-024

**Shared reports never grant permission to underlying data.**

### Decision ANA-025

**Analytics aggregates cannot leak information the user cannot access at row level.**

### Decision ANA-026

**Analytics can fail independently without stopping Checkout/Orders/Payments/Inventory operations.**

### Decision ANA-027

**Critical analytical projections have reconciliation/data-quality checks.**

### Decision ANA-028

**Metric definition changes are governed through versioning or explicit correction/backfill.**

### Decision ANA-029

**User-facing metric names must avoid ambiguous generic terms such as 'Profit' when a more precise metric exists.**

### Decision ANA-030

**Every important KPI must remain explainable and drillable back toward source transactions.**

---

# 354. Resulting Analytics Model

```text
                TRANSACTIONAL DOMAINS
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
      Orders         Inventory          Finance
        │                │                 │
      Payments       Procurement        Reviews
        │                │                 │
     Promotions       Shipments         Customers
        └────────────────┼─────────────────┘
                         ▼
                ANALYTICS INGESTION
                         │
                         ▼
               ANALYTICAL FACTS
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
            Date       Product    Customer
          Dimensions   Dimension  Dimension
                         │
                         ▼
                   METRIC CATALOG
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   Dashboards          Reports          Exports
```

---

# 355. Sales Example

```text
ORDER LINE

Gross:
৳1,000

Promotion Allocation:
৳100

Net Merchandise:
৳900

Acquisition Cost:
৳500

Gross Margin:
৳400
```

From this one source line, Analytics can legitimately produce:

```text
Gross Merchandise Sales    ৳1,000

Discounts                     ৳100

Net Merchandise Sales         ৳900

Gross Margin                   ৳400
```

without confusing any of them with:

```text
Cash received
```

---

# 356. COD Example

```text
Order Net:
৳1,500

Customer paid courier:
৳1,500

Courier holds funds:
৳1,500

Courier fee:
৳95

Bank settlement:
৳1,405
```

Analytics therefore distinguishes:

```text
Net Sales:
৳1,500

Customer Payment Collected:
৳1,500

Provider/Fulfillment Fees:
৳95

Business Cash Inflow:
৳1,405
```

This is exactly why Analytics must consume the domain architecture rather than inventing dashboard formulas.

---

# 357. Inventory Example

```text
Aug 1 closing stock:
100

Aug 2 closing stock:
90

Aug 3 closing stock:
80
```

Monthly stock is **not**:

```text
270
```

Instead reports may show:

```text
Starting Stock:
100

Ending Stock:
80

Average Daily Stock:
90
```

because Inventory balance is a point-in-time/semi-additive metric.

---

# 358. Late Refund Example

```text
Order:
July 20

Refund:
August 5
```

Analytics can answer two distinct questions:

```text
What refund activity happened in August?

August Refund Activity
→ includes refund
```

and:

```text
What is the current final economics of July-originating sales?

July Economic Attribution
→ July sale now reflects refund
```

The two views are intentionally different rather than one mysterious changing number.

---

# 359. Architecture Milestone

We now have reliable architecture for:

```text
Transaction Creation

Operational Management

Financial Operations

Customer Commerce

Promotion Rules

Communication

AND

Business Intelligence
```

The platform can now answer:

```text
What happened?

Why did it happen?

How much was it worth?

Where did it happen?

Who/what caused it?

How has it changed over time?
```

without using Dashboard tables as business truth.

---

# 360. Recommended Next Domain

The next document should be:

```text
docs/domains/settings/settings-localization-architecture.md
```

This is important now because almost every domain currently refers to configuration such as:

```text
Organization timezone

Currency

Date format

Number format

Order numbering

Purchase numbering

Invoice numbering

Default Warehouse

Default Receiving Location

Default Return Location

Fulfillment priority

Inventory policies

Oversell policy

Reservation policy

Customer identity policy

Payment Methods

Financial Accounts

Review settings

Promotion settings

Notification settings

Security settings

Storefront settings

SEO defaults

Media limits

Analytics reporting currency
```

We now need to define **what belongs in Settings**, what must remain owned by a business domain, what can be changed safely, how changes are audited, and which configuration changes require impact previews.

The central principle should be:

```text
SETTINGS
≠
A giant key/value dumping ground
```

Instead:

```text
Organization Settings
Storefront Settings
Localization Settings
Domain Policies
Integration Configuration
Security Configuration
```

should have explicit ownership and typed validation.

One particularly important area is **configuration history**.

For example:

```text
Default Currency changed
BDT → USD
```

must not rewrite historical BDT Orders.

Likewise:

```text
Timezone changed

Order-number prefix changed

Default Warehouse changed

Review moderation policy changed
```

should affect future behavior according to explicit rules, while preserving historical transactions.

---

**End of Analytics & Reporting Architecture v0.1**
