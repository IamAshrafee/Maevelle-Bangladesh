# Maevelle Ecommerce — Pricing & Order Totals Architecture

**Document:** `docs/domains/pricing/pricing-order-totals-architecture.md`
**Status:** Initial Domain Architecture / Living Document
**Version:** 0.1
**Related:** Catalog, Orders, Promotions, Payments, Finance, Storefront, Analytics, API/OpenAPI, PostgreSQL Schema Specification

---

# 1. Purpose

This document defines one authoritative commercial calculation model for Maevelle.

It answers:

```text
What is a Product/Variant price?

Which price applies?

How are promotions applied?

How are fixed discounts allocated?

How is delivery priced?

Where does tax belong?

How is the final Order total calculated?

How is every amount rounded?

What does the Order snapshot preserve?

What happens after price changes?

How are cancellations/refunds calculated?

Which amount does Analytics call Sales?
```

Without this domain, different parts of the platform could independently calculate money and produce inconsistent results.

That is not acceptable.

---

# 2. Central Principle

> **Price Definition, Price Resolution, Pricing Adjustment, Discount Allocation, Delivery Charge, Tax, and Order Total are separate concepts.**

They must not be collapsed into one field such as:

```text
product.price
```

or:

```text
order.total
```

without preserving how that value was produced.

---

# 3. Second Core Principle

> **The customer-facing payable amount is the result of a deterministic calculation pipeline.**

Conceptually:

```text
PRICE SOURCE
    │
    ▼
RESOLVED UNIT PRICE
    │
    ▼
LINE GROSS
    │
    ▼
LINE-LEVEL ADJUSTMENTS
    │
    ▼
LINE NET BEFORE ORDER DISCOUNT
    │
    ▼
ORDER-LEVEL DISCOUNT ALLOCATION
    │
    ▼
NET MERCHANDISE
    │
    ├── DELIVERY CHARGE
    │        ↓
    │   DELIVERY DISCOUNT
    │
    ├── TAX / VAT
    │
    ▼
FINAL ORDER TOTAL
```

The exact same semantic pipeline must power:

```text
Storefront Checkout

Admin Manual Order

Order Invoice

Refund Calculations

Analytics

Future Mobile App

Integration API
```

---

# 4. Third Core Principle

> **Committed Order money is historical truth.**

Once an Order is placed:

```text
current Product price changes
current Promotion changes
current Delivery fee changes
current Tax configuration changes
```

must not retroactively alter the committed Order.

---

# 5. Fourth Core Principle

> **The client never calculates authoritative totals.**

Browser can display calculated values.

But final authority is always:

```text
Pricing Application Service
+
Order/Checkout transaction
```

---

# 6. Fifth Core Principle

> **Discounts never mutate the Catalog base/current price definition.**

Example:

```text
Variant current price:
৳1,000

Promotion:
10% off
```

Catalog price remains:

```text
৳1,000
```

Order calculation creates:

```text
Gross:
৳1,000

Discount:
৳100

Net:
৳900
```

---

# 7. Sixth Core Principle

> **Every money adjustment must have a reason and allocation.**

If Order total changes by:

```text
৳100
```

the system should know whether it came from:

```text
Promotion

Coupon

Manual Discount

Delivery Discount

Tax

Refund

Order Amendment
```

---

# 8. Seventh Core Principle

> **Totals are calculated from components, not independently edited.**

Admin should not be able to type:

```text
Order Total = ৳1,500
```

while the components sum to:

```text
৳1,700.
```

The system calculates the final total.

---

# 9. Domain Ownership

Pricing owns:

```text
Price Resolution

Commercial Price Calculation

Line Gross Calculation

Discount Application Ordering

Order-Level Discount Allocation

Delivery Charge Integration

Tax Adjustment Integration

Rounding

Checkout Calculation

Order Total Snapshot Semantics

Manual Discount Semantics

Price Override Semantics

Refundable Commercial Amount Calculation
```

---

# 10. Pricing Does Not Own

Pricing does **not** own:

```text
Product identity
→ Catalog

Promotion eligibility definitions
→ Promotions

Delivery operational lifecycle
→ Delivery future

Payment collection
→ Payments

Refund execution
→ Payments

Accounting
→ Finance/Accounting future

Cost of goods
→ Inventory Costing future
```

---

# 11. Core Concepts

The Pricing domain uses these concepts:

```text
Price Definition

Price Context

Resolved Price

Pricing Line

Pricing Adjustment

Discount Application

Discount Allocation

Delivery Charge

Tax Component

Pricing Calculation

Pricing Snapshot

Manual Adjustment

Price Override
```

---

# 12. Price Definition

A Price Definition is a commercial selling-price source.

V1 primary source:

```text
Variant Price
```

Example:

```text
Variant:
HAT-RED-M

Currency:
BDT

Price:
৳850

Compare-at:
৳1,000
```

---

# 13. Price Definition Is Not Order Price

Catalog might later change:

```text
৳850
→ ৳950
```

Old Orders remain:

```text
৳850
```

because Order Lines preserve their resolved price snapshot.

---

# 14. Base Price Terminology

To eliminate ambiguity:

### Base Catalog Price

Price configured on the Variant before temporary Promotions.

### Resolved Unit Price

Price selected by Pricing for the current context.

### Gross Line Amount

```text
Resolved Unit Price × Quantity
```

before discounts.

### Net Line Amount

Gross Line Amount minus allocated discounts plus applicable line-level taxes where tax model requires.

---

# 15. Compare-at Price

`compare_at_price` is merchandising/reference information.

Example:

```text
Selling Price:
৳850

Compare At:
৳1,000
```

It may display:

```text
৳1,000
৳850
```

but:

> Compare-at price does not itself create a Promotion or Discount Allocation.

---

# 16. Compare-at Restrictions

Recommended:

```text
compare_at_price > selling_price
```

where present.

If:

```text
compare_at <= selling
```

UI should normally suppress the comparison.

---

# 17. Sale Price vs Promotion

Maevelle should avoid two independent discount systems.

V1 recommendation:

```text
Catalog Variant Price
=
current normal sellable unit price

Promotion
=
temporary conditional discount
```

Do not introduce a second hidden:

```text
sale_price
```

system without explicit need.

---

# 18. Future Price Lists

Architecture should support later:

```text
Default Retail

Wholesale

VIP

Marketplace

Country/Region

Storefront
```

through:

```text
Price Lists
```

without altering Order calculation semantics.

---

# 19. V1 Price Context

Price resolution input includes:

```text
Organization

Variant

Currency

Quantity

Customer context

Order source

Storefront/channel

Current time
```

Some inputs are unused in simple V1 but reserved conceptually.

---

# 20. Price Resolution

Conceptually:

```text
resolvePrice(
    variant,
    context
)
```

returns:

```text
ResolvedPrice {
    amount
    currency
    sourceType
    sourceId
    sourceVersion
}
```

---

# 21. No Silent Currency Conversion

If Variant has:

```text
BDT price
```

and Checkout requests:

```text
USD
```

Pricing must not silently use today's FX unless a deliberate multi-currency selling-price policy exists.

V1 Maevelle may operate primarily in:

```text
BDT
```

while preserving generic architecture.

---

# 22. Unsupported Currency

Return:

```text
PRICE_NOT_AVAILABLE_IN_CURRENCY
```

rather than:

```text
price = 0.
```

---

# 23. Pricing Line

During calculation each Cart/Order Line becomes a Pricing Line.

Conceptually:

```text
PricingLine {
    lineId
    productId
    variantId
    quantity
    unitPrice
    grossAmount
    adjustments[]
    discountAmount
    netAmount
}
```

---

# 24. Gross Line Formula

```text
Line Gross
=
Resolved Unit Price
×
Quantity
```

Example:

```text
Price:
৳850

Quantity:
2

Gross:
৳1,700
```

---

# 25. Merchandise Gross Amount

```text
Merchandise Gross
=
SUM(Line Gross)
```

---

# 26. Pricing Adjustment

A Pricing Adjustment changes a calculated monetary component.

Examples:

```text
Product-level Promotion

Order-level Promotion

Manual Discount

Delivery Discount

Tax

Future Surcharge
```

---

# 27. Adjustment Is Not Payment

A:

```text
৳100 discount
```

changes what Customer owes.

It does not mean:

```text
৳100 cash moved.
```

---

# 28. Adjustment Direction

Conceptually:

```text
DISCOUNT
SURCHARGE
TAX
```

V1 mainly needs:

```text
DISCOUNT
```

with tax foundation.

---

# 29. Promotion Integration

Promotions determines:

```text
Is Promotion eligible?

What benefit applies?

What targets are eligible?

Can it combine?
```

Pricing determines:

```text
How that benefit translates into exact money

How fixed amounts are allocated

How rounding works

How final totals are calculated
```

---

# 30. Product-Level Discount

Example:

```text
Line Gross:
৳1,000

Promotion:
10%

Discount:
৳100

Line after product discount:
৳900
```

---

# 31. Fixed Product Discount

Example:

```text
Line:
৳1,000

Promotion:
৳150 off selected Product

Net:
৳850
```

Discount cannot exceed eligible amount.

---

# 32. Discount Floor

Every merchandise component satisfies:

```text
Net Amount >= 0
```

unless a future credit/gift model explicitly says otherwise.

---

# 33. No Negative Order From Discounts

Promotions cannot make:

```text
Order Total = -৳200
```

---

# 34. Percentage Calculation

Conceptual calculation uses high internal precision.

Example:

```text
৳999 × 7.5%
```

Internal calculation may produce:

```text
74.925
```

Final allocation rounding follows currency rounding policy.

---

# 35. Rounding Must Occur Deliberately

Do not round at random intermediate application steps.

The Pricing service defines:

```text
internal calculation precision

allocation precision

transaction currency precision

final rounding points
```

---

# 36. Currency Minor Unit

Rounding policy must be currency-aware.

Even if Maevelle currently displays:

```text
BDT with 2 decimals or whole taka
```

the system must not globally assume every currency has exactly two decimal places.

---

# 37. V1 Storage Precision

As established:

```text
NUMERIC(20,6)
```

transaction amounts.

Higher calculation precision where needed.

Display precision is separate.

---

# 38. Deterministic Rounding

Given identical input:

```text
same exact allocation result
```

must always occur.

No dependence on:

```text
database row order

unstable array ordering
```

---

# 39. Fixed Order Discount

Example:

```text
Line A:
৳1,000

Line B:
৳500

Order Coupon:
৳300 off
```

Pricing must allocate the:

```text
৳300
```

to Lines.

---

# 40. Why Allocate Order Discounts?

Because later we need correct:

```text
Partial cancellation

Return

Refund

Product sales analytics

Product-level net revenue

Tax future
```

---

# 41. Fixed Discount Allocation

Default:

> Allocate proportionally by eligible monetary value.

Example:

```text
Eligible Line A:
৳1,000

Eligible Line B:
৳500

Total:
৳1,500
```

Shares:

```text
A:
66.666...

B:
33.333...
```

For:

```text
৳300
```

discount:

```text
A:
৳200

B:
৳100
```

---

# 42. Remainder Allocation

If division produces a rounding remainder, use deterministic largest-remainder allocation.

Example:

```text
Discount:
৳100

3 equal lines
```

might result:

```text
৳33.34
৳33.33
৳33.33
```

where:

```text
sum = exactly ৳100.
```

---

# 43. Stable Tie Breaking

For equal remainders use stable key such as:

```text
Order Line sequence
```

not random ordering.

---

# 44. Percentage Order Discount

If Order-level percentage applies:

```text
eligible amount
×
percentage
```

then final discount is also allocated to Lines.

---

# 45. Percentage Cap

Promotion may define:

```text
10% off
up to ৳500.
```

Pricing:

```text
calculated percentage discount

then cap
```

before Line allocation.

---

# 46. Eligibility Base

Promotions must explicitly state whether minimum threshold uses:

```text
Gross eligible merchandise

or

Post-product-discount eligible merchandise
```

V1 recommendation:

> Minimum subtotal conditions should use explicitly configured semantic basis; default to **eligible merchandise subtotal after line/product-level discounts but before Order-level discount**, unless Promotion specification states otherwise.

No hidden assumption.

---

# 47. Discount Sequence

V1 canonical sequence:

```text
1. Resolve Unit Price

2. Calculate Line Gross

3. Apply Product/Line-Level Promotions

4. Calculate Merchandise Subtotal After Line Discounts

5. Evaluate and Apply Order-Level Discounts

6. Allocate Order-Level Discounts to Lines

7. Calculate Net Merchandise

8. Calculate Delivery Charge

9. Apply Delivery Discounts

10. Calculate Tax/VAT when enabled

11. Calculate Final Order Total
```

---

# 48. Why Sequence Matters

Example:

```text
Product:
৳1,000

Product discount:
10%

Order discount:
10%
```

Sequence yields:

```text
৳1,000
→ ৳900
→ ৳810
```

not:

```text
৳800
```

unless policy explicitly says both percentages apply to original Gross.

---

# 49. Promotion Combination

Promotions domain decides whether multiple Promotions may combine.

Pricing executes allowed ordered adjustments.

---

# 50. Promotion Priority

When two compatible Promotions apply:

```text
priority

adjustment class

stable ID/tie
```

must create deterministic evaluation order.

---

# 51. Best Discount Selection

Where stacking is not allowed, Promotions can compare candidate outcomes.

Pricing provides exact candidate monetary values.

Promotions selects allowed/best result.

---

# 52. Manual Discount

Manual Discount is separate from Promotion.

Example:

```text
Agent grants ৳50 goodwill discount.
```

This must not create fake:

```text
coupon = MANUAL50.
```

---

# 53. Manual Discount Requires

```text
Permission

Reason

Actor

Amount/type

Allocation

Audit
```

---

# 54. Manual Discount Types

V1:

```text
FIXED_AMOUNT

PERCENTAGE
```

---

# 55. Manual Discount Scope

Potential:

```text
ORDER

ORDER_LINE

DELIVERY
```

---

# 56. Manual Discount and Promotion

Combination policy must be explicit.

V1 recommendation:

```text
Manual discount applies after Promotion discounts
```

unless Admin explicitly replaces/overrides existing pricing under stronger authorization.

---

# 57. Manual Discount Limit

Cannot reduce eligible component below:

```text
0.
```

---

# 58. Manual Discount Permission

Potential capability:

```text
orders.discount.apply
```

Stronger:

```text
orders.discount.override_limit
```

future threshold.

---

# 59. Price Override

Price Override differs from Discount.

Example:

Catalog says:

```text
৳1,000
```

Admin manually negotiates unit price:

```text
৳900
```

That changes:

```text
Resolved Unit Price
```

for that Order Line.

---

# 60. Why Separate Price Override?

Because analytics/history should distinguish:

```text
Base Price:
৳1,000

Override Price:
৳900
```

from:

```text
Price:
৳1,000

Discount:
৳100
```

These are commercially different.

---

# 61. Price Override Requirements

```text
High permission

Reason

Original resolved price preserved

Override price preserved

Actor

Audit
```

---

# 62. Storefront Price Override

Not allowed.

Only authorized internal/manual Order workflows.

---

# 63. Catalog Price Snapshot

Order Line should preserve:

```text
resolved_unit_price

price_source_type

price_source_id/version

original/catalog reference price if useful

price_override metadata if any
```

---

# 64. Delivery Charge

Delivery charge is a separate commercial component.

It is not merchandise.

---

# 65. Delivery Quote

Pricing receives or calculates:

```text
Delivery Charge
```

from Delivery Pricing policy/application.

V1 may use simple configured rates.

Future Courier quoted cost remains distinct from customer delivery charge.

---

# 66. Customer Delivery Charge vs Courier Cost

Example:

```text
Customer charged:
৳100

Courier costs Maevelle:
৳120
```

These are different concepts.

---

# 67. Delivery Discount

Example:

```text
Delivery:
৳120

Free Delivery Promotion:
-৳120
```

Final customer delivery charge:

```text
৳0
```

---

# 68. Delivery Discount Allocation

Delivery discount allocates to:

```text
Delivery component
```

not Product Lines.

---

# 69. Free Delivery Cannot Reduce Merchandise

If Delivery is:

```text
৳80
```

and Promotion says:

```text
free delivery
```

discount is:

```text
৳80
```

not:

```text
Promotion value ৳120 and extra ৳40 applied to merchandise.
```

---

# 70. Multiple Fulfillments

Customer delivery pricing is based on Order commercial policy, not necessarily:

```text
one charge per Fulfillment.
```

Future Delivery architecture may support split-delivery pricing.

Order snapshot must preserve what Customer agreed.

---

# 71. Tax / VAT

Tax is intentionally a **foundation**, not a full V1 statutory tax engine.

Maevelle V1 should not pretend to provide:

```text
jurisdictional tax accounting
```

without explicit requirements.

---

# 72. Tax Domain Boundary

Pricing owns placement of Tax Components within totals.

A future Tax domain owns:

```text
Tax eligibility

Rate determination

Jurisdiction

Tax category

Tax calculation rules
```

---

# 73. V1 Tax Default

Recommended:

```text
No automatic tax engine.
```

If Maevelle's displayed consumer price already includes all applicable tax operationally:

```text
tax_amount may remain zero/not separately broken out
```

until explicit tax architecture exists.

---

# 74. Tax-Inclusive vs Tax-Exclusive

Future Pricing must explicitly support:

```text
TAX_INCLUDED

TAX_EXCLUDED
```

policy.

Never infer it from whether a tax amount happens to be zero.

---

# 75. Order Totals Vocabulary

Canonical Order monetary fields:

```text
merchandise_gross_amount

merchandise_discount_amount

merchandise_net_amount

delivery_gross_amount

delivery_discount_amount

delivery_net_amount

tax_amount

total_amount
```

---

# 76. Merchandise Gross

```text
Σ original resolved line gross
```

before Discounts.

---

# 77. Merchandise Discount

```text
Σ all discounts allocated to merchandise lines
```

including:

```text
Product Promotions

Order Promotions

Manual merchandise discounts
```

but excluding:

```text
Delivery discounts.
```

---

# 78. Merchandise Net

```text
Merchandise Gross
-
Merchandise Discount
```

before separately modeled taxes if tax-exclusive.

---

# 79. Delivery Gross

Original customer delivery fee.

---

# 80. Delivery Discount

Discount allocated exclusively to delivery.

---

# 81. Delivery Net

```text
Delivery Gross
-
Delivery Discount
```

---

# 82. Final Total Formula

For V1 no separate tax engine:

```text
Total
=
Merchandise Net
+
Delivery Net
+
Tax Amount
```

where:

```text
Tax Amount = 0
```

until applicable configuration exists.

---

# 83. Order Total Cannot Be Negative

Constraint/domain invariant:

```text
total_amount >= 0
```

---

# 84. Zero-Value Order

Can be allowed when:

```text
Discounts legitimately reduce payable to 0.
```

Payment method becomes:

```text
NO_PAYMENT_REQUIRED
```

or equivalent Payment logic.

Do not create fake:

```text
৳0 Payment
```

unless Payments architecture specifically requires one.

---

# 85. Zero-Value Order Security

A zero-value Order still requires:

```text
Promotion eligibility

usage limit

stock reservation

Order validation
```

No bypass.

---

# 86. Checkout Calculation

Pricing produces a deterministic:

```text
Checkout Calculation
```

containing all current monetary components.

---

# 87. Checkout Calculation Structure

Conceptually:

```text
CheckoutCalculation {
    currency

    lines[]

    merchandiseGross

    merchandiseDiscount

    merchandiseNet

    deliveryGross

    deliveryDiscount

    deliveryNet

    tax

    total

    appliedAdjustments[]

    warnings[]

    fingerprint
}
```

---

# 88. Calculation Version

Checkout Session already maintains:

```text
calculation_version
```

Every meaningful recalculation increments/changes version.

---

# 89. Calculation Fingerprint

Strongly recommended.

Hash over canonical monetary/eligibility inputs such as:

```text
Cart version

Variant IDs

Quantities

Resolved prices

Promotion revisions

Coupon

Customer eligibility context

Delivery method/rate revision

Currency

Tax policy version
```

---

# 90. Why Fingerprint?

Two calculations can both be:

```text
version 5
```

in different sessions.

Fingerprint supports diagnostics and can prove which commercial context produced the Order.

---

# 91. Fingerprint Is Not Security Secret

It is integrity/correlation metadata.

---

# 92. Final Place Order Recalculation

`PlaceOrder` must recalculate using authoritative current data.

It compares:

```text
Customer accepted calculation
```

against:

```text
current calculation.
```

---

# 93. Material Change

Examples:

```text
Price increased

Discount disappeared

Delivery charge increased

Variant changed availability

Tax changed
```

Return:

```text
CHECKOUT_CHANGED
```

rather than silently committing.

---

# 94. Beneficial Change

What if price decreases?

Recommended:

> Still recalculate and return the updated calculation if the monetary contract changed materially.

This keeps:

```text
what Customer accepted
```

aligned with:

```text
what Order commits.
```

UX can make acceptance one click.

---

# 95. Tiny Rounding Change

Policy can define no-change tolerance at:

```text
currency minor-unit level.
```

Do not use arbitrary floating epsilon.

---

# 96. Order Pricing Snapshot

At commit the Order stores:

```text
currency

line unit prices

line gross

line discounts

line net

discount applications

discount allocations

delivery gross

delivery discount

tax

total

pricing calculation/fingerprint
```

---

# 97. Order Snapshot Is Immutable Financial Evidence

Changing Product price tomorrow does not recalculate old Order.

---

# 98. Order Recalculation After Commit

Forbidden as normal behavior.

---

# 99. Order Amendment

If a committed Order legitimately changes:

```text
Quantity

Item

Manual discount

Delivery fee
```

use explicit:

```text
Order Amendment
```

architecture.

Do not mutate old totals invisibly.

---

# 100. V1 Order Amendment Strategy

Keep V1 intentionally restricted.

Supported after confirmation:

```text
Partial cancellation

Address correction where allowed

Hold/release

Fulfillment
```

Avoid arbitrary:

```text
add/remove/change Products
```

on confirmed Orders unless a dedicated amendment architecture is implemented.

---

# 101. Manual Order Draft

Admin may edit Draft Order pricing/items freely before confirmation.

At confirmation:

```text
snapshot is committed.
```

---

# 102. Manual Order Price Change Warning

If Catalog Price changed since Draft:

```text
recalculate
```

and require acceptance/override policy.

---

# 103. Partial Cancellation

Cancellation does not recalculate remaining lines using current prices/promotions.

---

# 104. Cancellation Amount

For cancelled quantity:

```text
cancelled commercial value
```

must derive from original Order Line's committed:

```text
unit gross

discount allocations

net amount
```

---

# 105. Example Partial Cancellation

Order Line:

```text
Qty:
2

Gross:
৳2,000

Allocated Discount:
৳200

Net:
৳1,800
```

Each unit economic net:

```text
৳900
```

Cancelling one quantity should remove:

```text
৳900
```

of merchandise obligation, subject to exact deterministic per-unit allocation rules.

---

# 106. Uneven Allocation Across Quantity

Fixed discount may not divide perfectly by quantity.

Therefore Order Line should preserve sufficient allocation detail or use deterministic quantity-level allocation logic.

---

# 107. Unit Allocation Strategy

For line quantity `N`:

```text
Line discount allocation
```

must be deterministically divisible across units for:

```text
partial cancellation

partial return
```

---

# 108. Recommended V1 Strategy

Store:

```text
line-level discount amount
```

and calculate quantity-specific cancellation using deterministic proportional allocation with cumulative rounding protection.

For very complex future requirements, introduce:

```text
order_line_unit_allocations
```

or commercial allocation fragments.

Do not prematurely create one database row per physical unit for ordinary fashion Orders.

---

# 109. Cancellation of Delivery Charge

Policy depends on Order lifecycle.

Example:

```text
Order fully cancelled before dispatch
```

normally cancels delivery charge.

Partial item cancellation may not reduce delivery charge.

---

# 110. Delivery Cancellation Policy

Must be explicit.

V1 recommended:

```text
Full pre-fulfillment Order cancellation
→ Delivery net amount cancelled

Partial cancellation
→ Delivery unchanged unless operator/policy adjusts separately
```

---

# 111. Promotion Usage and Cancellation

Pricing calculates values.

Promotions decides whether usage is:

```text
released
```

after qualifying cancellation.

As previously defined:

```text
full pre-fulfillment cancellation
```

may release usage according to Promotion policy.

---

# 112. Refunds

Refund execution belongs to Payments.

Pricing provides:

```text
maximum commercially refundable amount
```

and attribution.

---

# 113. Refund ≠ Recalculation

Do not calculate Refund using current:

```text
Product price

Promotion

Delivery fee.
```

Use committed Order allocations.

---

# 114. Refundable Merchandise

Conceptually:

```text
Original Net Merchandise Allocated to Returned/Refunded Quantity
-
Already Refunded Merchandise Amount
```

---

# 115. Refundable Delivery

Separate component.

Possible rules:

```text
Delivery not refundable

Delivery fully refundable

Partial/manual delivery refund
```

---

# 116. Refundable Tax

Future Tax architecture determines.

V1 no separate tax engine.

---

# 117. Goodwill Refund

Can exceed normal returned-line attribution only through explicit:

```text
GOODWILL / MANUAL COMPENSATION
```

policy.

It remains a Refund but must be separately classified.

---

# 118. Refund Ceiling

Normal commercial refund:

```text
cannot exceed amount actually collected/available
```

Payments enforces financial ceiling.

Pricing enforces commercial attribution ceiling.

---

# 119. Return Without Refund

No Pricing mutation needed.

---

# 120. Refund Without Return

Allowed.

Pricing identifies which component is being refunded:

```text
MERCHANDISE

DELIVERY

GOODWILL

OTHER
```

---

# 121. Exchange

New replacement Order gets its own pricing snapshot.

Do not rewrite original sale prices.

---

# 122. Invoice

Invoice displays committed Order pricing.

Not current Catalog pricing.

---

# 123. Invoice Components

Recommended:

```text
Line Gross

Line Discount

Line Net

Merchandise Subtotal

Delivery

Delivery Discount

Tax if separately applicable

Grand Total

Payments / Balance separately
```

---

# 124. Invoice Payment Information

Commercial Invoice total and Payment state remain separate.

Example:

```text
Invoice Total:
৳1,500

Paid:
৳1,000

Balance:
৳500
```

Do not alter Invoice Total to:

```text
৳500
```

because only ৳500 remains unpaid.

---

# 125. Analytics Integration

Pricing defines the amounts Analytics may consume.

---

# 126. Gross Merchandise Value

Recommended semantic source:

```text
SUM committed Order Line Gross
```

for qualifying Orders.

Delivery excluded.

---

# 127. Merchandise Discounts

```text
SUM committed merchandise Discount Allocations
```

---

# 128. Net Merchandise Value

```text
Gross Merchandise
-
Merchandise Discounts
```

before refunds.

---

# 129. Delivery Revenue/Charge

Report separately.

---

# 130. Refund Activity

Report separately from Sales.

Do not silently overwrite original Gross Sale fact.

---

# 131. Net-to-Date Order View

Analytics may separately calculate:

```text
Original Net Merchandise
-
Subsequent attributable Refunds
```

for an Order/cohort view.

Different from period activity.

---

# 132. Do Not Call Payment "Sales"

Payment amount is:

```text
cash/customer collection
```

not the pricing definition of merchandise Sales.

---

# 133. Do Not Call Order Total "Merchandise Sales"

Order Total includes:

```text
Delivery

Tax future
```

and potentially other components.

---

# 134. Profit

Pricing does not calculate profit.

Profit requires:

```text
Sales amount
+
COGS/acquisition costing
+
other direct costs
```

Costing architecture remains separate.

---

# 135. Pricing Calculation Object

Recommended application concept:

```text
PricingCalculation
```

immutable after construction.

---

# 136. Calculation Line

```text
PricingCalculationLine {
    lineReference
    variantId
    quantity

    resolvedUnitPrice

    grossAmount

    productAdjustments[]

    orderAdjustments[]

    manualAdjustments[]

    totalDiscount

    netAmount
}
```

---

# 137. Calculation Adjustment

```text
PricingAdjustment {
    sourceType
    sourceId
    sourceRevision
    adjustmentType
    targetType
    amount
    descriptionSnapshot
}
```

---

# 138. Source Types

Examples:

```text
PROMOTION

COUPON

MANUAL_DISCOUNT

PRICE_OVERRIDE

DELIVERY_PROMOTION

TAX
```

---

# 139. Adjustment Target

```text
ORDER_LINE

ORDER

DELIVERY

TAX_COMPONENT
```

---

# 140. Pricing Provenance

Every calculated adjustment should preserve enough metadata to answer:

```text
Why did Customer pay this amount?
```

---

# 141. Pricing Versioning

Pricing calculation algorithm has:

```text
pricing_engine_version
```

---

# 142. Why Version the Engine?

If rounding/allocation methodology changes later, historical Orders should still be explainable.

Order snapshot might preserve:

```text
pricing_engine_version = 1
```

---

# 143. Do We Recalculate Historical Orders With New Engine?

No.

The new engine applies to future calculation/amendment contexts.

---

# 144. Price Definition Version

Price changes should maintain useful revision/audit history.

Exact table design may use:

```text
variant_prices.version
```

plus audit.

A full immutable Price Revision table can be added when:

```text
scheduled pricing

advanced price history

multi-channel Price Lists
```

justify it.

---

# 145. Scheduled Price Changes

Future:

```text
Starts At

Ends At
```

Price Definition versions.

Do not use server cron to overwrite one current price field if advanced scheduled pricing is introduced.

---

# 146. Storefront Display Pricing

PDP may show:

```text
From ৳650
```

for multi-Variant Product.

This is presentation.

Pricing resolves actual Variant price when Variant selected.

---

# 147. Multi-Variant Price Range

Read projection can provide:

```text
minimum active price

maximum active price
```

per currency.

Do not make Product itself own one misleading price.

---

# 148. Variant Selection

Checkout requires exact:

```text
Variant
```

so price resolution is unambiguous.

---

# 149. Inventory and Price Are Separate

A Variant may have:

```text
Price:
৳850

Availability:
OUT_OF_STOCK
```

Price still exists.

---

# 150. Archived Variant Pricing

Historical price remains explainable.

New Orders cannot use archived Variant.

---

# 151. Free Product Promotion

Future gift/BOGO may create:

```text
line gross > 0
discount = full line gross
net = 0
```

rather than:

```text
unit price = 0
```

where the product has a normal market price.

This preserves discount economics.

---

# 152. Complimentary Manual Item

If business intentionally sets an Order Line Price Override to:

```text
৳0
```

that should be classified explicitly as:

```text
COMPLIMENTARY / OVERRIDE
```

rather than confused with Promotion.

---

# 153. Surcharges

Not V1 core.

Architecture can later support:

```text
Packaging Fee

COD Fee

Handling Fee
```

as first-class Order Charge components.

---

# 154. Do Not Hide Fees in Delivery

Future non-delivery fees should not be stuffed into:

```text
delivery_amount
```

just because Order currently has no generic charge architecture.

---

# 155. Future Order Charge Model

Potential:

```text
Order Charge

Charge Type

Gross

Discount

Tax

Net
```

V1 only needs:

```text
MERCHANDISE

DELIVERY
```

to avoid premature abstraction.

---

# 156. Payment Fee to Customer

If future payment method imposes:

```text
customer payment surcharge
```

that must become explicit commercial Charge.

Provider fee paid by Maevelle is Finance Expense and does not alter Order total unless deliberately passed through to customer.

---

# 157. Price Resolution Failure

Possible errors:

```text
PRICE_NOT_FOUND

PRICE_NOT_AVAILABLE_IN_CURRENCY

VARIANT_NOT_SELLABLE

PRICE_CONFIGURATION_INVALID
```

---

# 158. Calculation Errors

```text
PROMOTION_CALCULATION_INVALID

DISCOUNT_EXCEEDS_ELIGIBLE_AMOUNT

ALLOCATION_ROUNDING_FAILURE

DELIVERY_PRICE_UNAVAILABLE

UNSUPPORTED_TAX_CONFIGURATION

CHECKOUT_CALCULATION_CHANGED
```

---

# 159. Pricing Health

Recommended integrity checks:

```text
Order totals reconcile to components

Line net = gross - discounts

Merchandise totals reconcile to Lines

Discount Application total = allocations

Delivery net = gross - discount

Grand total reconciles

No negative unsupported components
```

---

# 160. Pricing Reconciliation

For every committed Order:

```text
SUM(order_line.gross)
=
order.merchandise_gross
```

```text
SUM(order_line.discount)
=
order.merchandise_discount
```

```text
SUM(order_line.net)
=
order.merchandise_net
```

---

# 161. Order Grand Total Reconciliation

```text
merchandise_net
+
delivery_net
+
tax
=
total
```

---

# 162. Discount Reconciliation

```text
SUM(discount allocations)
=
SUM(discount applications)
```

with target-specific separation.

---

# 163. Manual Repair

If a historical Order total fails integrity check:

```text
do not silently recalculate and overwrite.
```

Create:

```text
Integrity Issue
```

and perform controlled repair/migration after investigation.

---

# 164. Pricing Query Service

Read APIs:

```text
ResolveVariantPrice

GetProductPriceRange

PreviewCartPricing

CalculateCheckout

PreviewManualOrderPricing

GetOrderPricingBreakdown

GetRefundableCommercialAmounts
```

---

# 165. Pricing Commands

Most Pricing work occurs inside other commands.

Potential explicit commands:

```text
SetVariantPrice

ApplyManualOrderDiscount

ApplyOrderLinePriceOverride

RemoveManualAdjustment
```

---

# 166. Price Resolution Is Not a Business Mutation

`ResolveVariantPrice` is a query/application service.

---

# 167. Checkout Calculation Is Not Order Commitment

It is provisional.

---

# 168. Pricing Domain Tables

Existing:

```text
catalog.variant_prices

orders.order_lines

orders.order_discount_applications

orders.order_discount_allocations
```

Recommended refinements:

```text
orders.order_pricing_snapshots
```

optional.

---

# 169. Do We Need Separate Order Pricing Snapshot Table?

V1 recommendation:

> Keep stable component totals directly on `orders.orders` and `orders.order_lines`, while storing detailed calculation metadata/fingerprint in a dedicated pricing snapshot record.

This gives both:

```text
fast/reportable columns

+

diagnostic calculation evidence.
```

---

# 170. Recommended `orders.order_pricing_snapshots`

Conceptually:

```text
id
organization_id
order_id
pricing_engine_version
calculation_fingerprint
currency_code
calculation_snapshot_json
created_at
```

One committed snapshot per initial Order version V1.

---

# 171. Why JSON Here Is Acceptable

The authoritative financial amounts remain relational columns.

JSON preserves:

```text
calculation provenance

rule inputs

explanatory metadata
```

not primary financial truth.

---

# 172. Order Table Refinement

Earlier schema used:

```text
subtotal_amount
discount_amount
delivery_amount
tax_amount
total_amount
```

This document reveals those names are insufficiently precise.

Replace/refine into:

```text
merchandise_gross_amount

merchandise_discount_amount

merchandise_net_amount

delivery_gross_amount

delivery_discount_amount

delivery_net_amount

tax_amount

total_amount
```

---

# 173. Order Line Refinement

Keep:

```text
unit_price

gross_amount

discount_amount

net_amount
```

Add strongly preferred:

```text
resolved_price_source_type

resolved_price_source_id

price_override_amount NULL

price_override_reason NULL
```

or equivalent structured provenance.

---

# 174. Order Discount Allocation Refinement

Existing allocation:

```text
order_line_id NULL
allocation_target_type
amount
```

remains valid.

Require:

```text
ORDER_LINE
or
DELIVERY
```

target integrity.

---

# 175. Manual Adjustment Representation

Recommended new table:

```text
orders.manual_pricing_adjustments
```

---

# 176. `orders.manual_pricing_adjustments`

Conceptually:

```text
id
organization_id
order_id
order_line_id NULL
adjustment_type
scope
reason_code
reason_text
input_type
input_value
calculated_amount
created_by
created_at
```

For committed Orders only via supported amendment workflow.

For Draft manual Orders it can live in Draft pricing context.

---

# 177. Price Override Table

Potential:

```text
orders.order_line_price_overrides
```

but V1 can store override metadata directly on Order Line/Pricing Snapshot if only one override exists.

Avoid creating excessive table fragmentation without need.

---

# 178. Checkout Session Refinement

`orders.checkout_sessions.calculated_totals` JSONB should remain provisional.

Add/retain:

```text
calculation_version

calculation_fingerprint

pricing_engine_version
```

---

# 179. Promotion Usage Amount

`promotion_usage.discount_amount`

must reconcile with Order historical Promotion Discount Application.

---

# 180. Promotion Revision Snapshot

Order Discount Application preserves:

```text
promotion_id

promotion_revision_id

coupon snapshot

benefit snapshot

discount amount
```

---

# 181. Pricing Time

All time-dependent eligibility uses trusted server time.

Browser clock irrelevant.

---

# 182. Price Race

Scenario:

```text
Checkout calculated:
৳850

Admin changes Variant to:
৳900

Customer places Order.
```

Final `PlaceOrder` returns:

```text
CHECKOUT_CHANGED
```

---

# 183. Promotion Race

Same behavior.

---

# 184. Delivery Price Race

Same behavior.

---

# 185. Concurrent Manual Order Editing

Expected Version prevents two Admins overwriting pricing.

---

# 186. Catalog Price Change + Existing Cart

Cart recalculates when viewed/refreshed.

Cart does not preserve price guarantee unless future:

```text
price lock
```

feature exists.

---

# 187. No Price Lock V1

Adding Product to Cart does **not** lock:

```text
price

promotion

stock.
```

---

# 188. Reservation Does Not Lock Price

Inventory Reservation protects stock.

Commercial price remains whatever Order committed at placement.

After Order commit, price is locked by Order snapshot.

---

# 189. Payment Delay

If Order was committed at:

```text
৳850
```

and Product later becomes:

```text
৳950
```

Customer still owes:

```text
৳850
```

for that Order.

Payment delay does not trigger repricing unless Order expires/cancels according to explicit policy.

---

# 190. Manual Payment Underpayment

Order total remains:

```text
৳850
```

Payment:

```text
৳800
```

Balance:

```text
৳50.
```

Do not reduce Order total to match received cash.

---

# 191. Overpayment

Order total remains unchanged.

Excess becomes:

```text
unallocated Payment / customer credit context.
```

---

# 192. Pricing and Finance

Discount is commercial reduction, not Expense.

---

# 193. Pricing and Landed Cost

Selling price does not alter acquisition cost.

---

# 194. Pricing and Supplier Cost

Supplier price does not automatically define customer selling price.

---

# 195. Margin Foundation

Future margin:

```text
Net Merchandise
-
COGS
```

not:

```text
Order Total
-
Purchase Price
```

because:

```text
Delivery

Refunds

cost layers

discounts
```

matter.

---

# 196. Pricing Security

Sensitive internal pricing operations need capabilities.

Potential:

```text
products.pricing.view

products.pricing.manage

orders.discount.apply

orders.price_override

orders.pricing.repair
```

---

# 197. Cost Visibility Separate

Seeing:

```text
selling price
```

does not grant:

```text
landed cost
```

access.

---

# 198. Price Override Audit

Always record:

```text
original price

override price

actor

reason

time
```

---

# 199. Promotion Calculation Audit

Normal automatic Promotion does not need giant Audit per internal calculation.

Committed Order preserves Promotion application snapshot.

---

# 200. Pricing Engine Determinism Test

Same input snapshot run 1,000 times:

```text
must return identical totals and allocations.
```

---

# 201. Required Pricing Tests

```text
Single Item

Multiple Items

Quantity > 1

Percentage Product Discount

Fixed Product Discount

Percentage Order Discount

Fixed Order Discount

Discount Cap

Two Compatible Promotions

Two Conflicting Promotions

Coupon

Manual Discount

Price Override

Delivery Charge

Free Delivery

Zero-Value Order

Rounding Remainder

Price Changed During Checkout

Promotion Expired During Checkout

Partial Cancellation

Partial Refund

Delivery Refund

Overpayment

Underpayment
```

---

# 202. Rounding Stress Tests

Include:

```text
৳100 fixed across 3 lines

7.5% of ৳999

large quantity

very small decimal unit price

multiple stacked percentage adjustments

maximum monetary values
```

---

# 203. Currency Tests

At least:

```text
BDT

USD
```

even if Maevelle launches BDT-only, to detect hidden hard-coded assumptions.

---

# 204. Concurrency Tests

```text
Price change during PlaceOrder

Promotion final use race

Manual order concurrent edit

Delivery method disabled during checkout
```

---

# 205. Snapshot Tests

Change after Order:

```text
Product title

SKU

Price

Promotion

Delivery rate

Currency defaults
```

Historical Order/invoice remains unchanged.

---

# 206. Cancellation Tests

```text
Full pre-fulfillment cancellation

One of two units cancelled

One of multiple lines cancelled

Partial cancellation with fixed Order discount

Partial cancellation with rounding remainder

Partial cancellation + free delivery
```

---

# 207. Refund Tests

```text
Refund same line once

Partial Refund

Multiple partial Refunds

Delivery-only Refund

Goodwill Refund

Concurrent Refund attempts

Refund after Product price change
```

---

# 208. Pricing Health Dashboard

Recommended internal health:

```text
Orders with total mismatch

Discount allocation mismatch

Negative unsupported amount

Missing price source

Unknown currency precision

Checkout calculation failures

Pricing engine errors
```

---

# 209. Pricing Invariants

### PRICE-INV-001

Catalog Price and Order committed Price are separate concepts.

### PRICE-INV-002

Promotions never mutate Catalog Price definitions.

### PRICE-INV-003

The client never submits authoritative final monetary totals.

### PRICE-INV-004

Every Order Line has an explicit committed unit price and currency context.

### PRICE-INV-005

Line Gross equals committed Unit Price multiplied by committed Quantity.

### PRICE-INV-006

Merchandise Discount equals the sum of merchandise-targeted Discount Allocations.

### PRICE-INV-007

Every Order-level merchandise Discount is allocated to Order Lines.

### PRICE-INV-008

Every Delivery Discount is allocated to the Delivery component.

### PRICE-INV-009

Discounts cannot reduce an eligible component below zero.

### PRICE-INV-010

Final Order Total cannot be negative.

### PRICE-INV-011

Fixed Discount allocation uses deterministic rounding.

### PRICE-INV-012

The sum of rounded Discount Allocations exactly equals the committed Discount amount.

### PRICE-INV-013

Promotion combination ordering is deterministic.

### PRICE-INV-014

Price Override and Discount remain distinguishable.

### PRICE-INV-015

Manual Discount and Promotion Discount remain distinguishable.

### PRICE-INV-016

Delivery customer charge and Courier operational cost remain distinguishable.

### PRICE-INV-017

Provider Payment fee does not change Order Total unless explicitly passed to Customer as a commercial Charge.

### PRICE-INV-018

Historical Order totals never depend on current Product Price.

### PRICE-INV-019

Historical Order discounts never depend on current Promotion configuration.

### PRICE-INV-020

Cart does not lock Price.

### PRICE-INV-021

Inventory Reservation does not retroactively alter Order Price.

### PRICE-INV-022

PlaceOrder revalidates Price immediately before Order commitment.

### PRICE-INV-023

A material Checkout Pricing change requires Customer acceptance rather than silent commitment.

### PRICE-INV-024

Partial Cancellation uses original committed monetary allocations.

### PRICE-INV-025

Refund calculation uses original Order pricing/allocation rather than current Catalog pricing.

### PRICE-INV-026

Payments do not mutate the commercial Order Total.

### PRICE-INV-027

Underpayment leaves Balance Due rather than lowering Order Total.

### PRICE-INV-028

Overpayment does not increase Order Total.

### PRICE-INV-029

Discount is a commercial price reduction, not a Finance Expense.

### PRICE-INV-030

Selling Price does not become acquisition-cost authority.

### PRICE-INV-031

Pricing calculation is deterministic for identical authoritative inputs.

### PRICE-INV-032

Pricing engine version/provenance is preserved for committed calculations.

### PRICE-INV-033

Tax semantics cannot be invented ad hoc before the Tax policy/domain is defined.

### PRICE-INV-034

Analytics uses explicitly named pricing measures rather than an ambiguous generic `sales` number.

### PRICE-INV-035

Order pricing components always reconcile to the committed final Total.

---

# 210. V1 Mandatory Scope

```text
✓ Variant selling price

✓ Compare-at price

✓ Currency-safe Price Definition

✓ Price Resolution

✓ Line Gross

✓ Product Promotion discount

✓ Order Promotion discount

✓ Fixed discount

✓ Percentage discount

✓ Percentage cap

✓ Discount eligibility base

✓ Deterministic Promotion order

✓ Order-level Discount Allocation

✓ Largest-remainder rounding

✓ Delivery Charge

✓ Delivery Discount

✓ Free Delivery

✓ Manual Discount

✓ Manual Discount audit

✓ Manual Price Override for authorized Admin

✓ Price Override provenance

✓ Merchandise Gross

✓ Merchandise Discount

✓ Merchandise Net

✓ Delivery Gross

✓ Delivery Discount

✓ Delivery Net

✓ Tax Amount foundation

✓ Final Order Total

✓ Zero-value Order support

✓ Checkout Calculation

✓ Calculation Version

✓ Calculation Fingerprint

✓ Material Checkout Change handling

✓ Order pricing snapshot

✓ Pricing engine version

✓ Partial Cancellation allocation

✓ Refund commercial attribution

✓ Invoice breakdown

✓ Analytics pricing semantics

✓ Pricing reconciliation

✓ Pricing integrity health

✓ Pricing concurrency tests

✓ Pricing rounding tests
```

---

# 211. Strongly Preferred V1

```text
Product price range projection

Promotion simulation explanations

Manual discount threshold warnings

Price change audit

Price Override UI

Checkout calculation diagnostics

Order pricing breakdown UI

Refundable component calculator

Automated Order pricing integrity checks
```

---

# 212. Explicitly Deferred

```text
Advanced Price Lists

Customer-specific negotiated pricing

Wholesale tiers

Country pricing

Storefront-specific prices

Scheduled Price Books

Automatic dynamic pricing

Complex BOGO/gift pricing

Bundles

Subscription pricing

Gift cards

Store credit

Loyalty points

Payment surcharges

Complex Order Charges

Full statutory Tax engine

Tax jurisdiction logic

Tax-inclusive/exclusive engine

Currency auto-conversion selling prices

Advanced Order amendment/repricing

Advanced line-unit allocation ledger
```

---

# 213. Decisions Established

### Decision PRICE-001

**Variant Price is the primary V1 Catalog selling-price source.**

### Decision PRICE-002

**Compare-at price is merchandising metadata and not itself a Discount.**

### Decision PRICE-003

**Promotions create Pricing Adjustments rather than changing Catalog Price.**

### Decision PRICE-004

**The canonical sequence is Line Price → Line Discounts → Order Discounts → Delivery → Delivery Discount → Tax → Final Total.**

### Decision PRICE-005

**Order-level merchandise discounts are always allocated to Lines.**

### Decision PRICE-006

**Fixed Discount allocation uses eligible monetary value plus deterministic largest-remainder rounding.**

### Decision PRICE-007

**Delivery Discount remains separate from merchandise Discount.**

### Decision PRICE-008

**Manual Discount is not modeled as a Promotion or Coupon.**

### Decision PRICE-009

**Manual Price Override is distinct from Discount.**

### Decision PRICE-010

**Cart and Checkout calculations are provisional; only Order commitment freezes commercial values.**

### Decision PRICE-011

**PlaceOrder always recalculates authoritative price before committing.**

### Decision PRICE-012

**Material pricing changes return `CHECKOUT_CHANGED` instead of silently placing the Order.**

### Decision PRICE-013

**Committed Orders preserve calculation provenance and pricing-engine version.**

### Decision PRICE-014

**Historical Order pricing is never recalculated from current Catalog/Promotion data.**

### Decision PRICE-015

**Partial Cancellation and Refunds use original committed allocations.**

### Decision PRICE-016

**Payments remain separate from Order commercial amount.**

### Decision PRICE-017

**Delivery customer charge is separate from Delivery provider cost.**

### Decision PRICE-018

**Tax remains an explicit future boundary; V1 will not invent a pseudo-tax engine.**

### Decision PRICE-019

**Order total component names are refined into merchandise gross/discount/net and delivery gross/discount/net.**

### Decision PRICE-020

**Pricing calculations must be deterministic and fully reconcilable.**

---

# 214. Schema Refinements Required

Update `orders.orders` from ambiguous:

```text
subtotal_amount
discount_amount
delivery_amount
tax_amount
total_amount
```

to:

```text
merchandise_gross_amount

merchandise_discount_amount

merchandise_net_amount

delivery_gross_amount

delivery_discount_amount

delivery_net_amount

tax_amount

total_amount
```

---

# 215. Add Pricing Snapshot

Recommended:

```text
orders.order_pricing_snapshots
```

with:

```text
id
organization_id
order_id
pricing_engine_version
calculation_fingerprint
calculation_snapshot_json
created_at
```

---

# 216. Checkout Schema Refinement

`orders.checkout_sessions` should include:

```text
pricing_engine_version

calculation_version

calculation_fingerprint
```

---

# 217. Order Line Refinement

Strongly preferred:

```text
resolved_price_source_type

resolved_price_source_id

price_override_amount

price_override_reason
```

or equivalent metadata preserved through Pricing Snapshot.

---

# 218. Manual Pricing Adjustment Foundation

Recommended:

```text
orders.manual_pricing_adjustments
```

for explicit:

```text
Order discount

Line discount

Delivery discount
```

manual actions.

---

# 219. API Refinement

Checkout response should expose canonical components:

```json
{
  "pricing": {
    "merchandise_gross": {},
    "merchandise_discount": {},
    "merchandise_net": {},
    "delivery_gross": {},
    "delivery_discount": {},
    "delivery_net": {},
    "tax": {},
    "total": {}
  }
}
```

---

# 220. Order API Refinement

Same naming should appear in:

```text
Storefront Order confirmation

Admin Order Workspace

Invoice

Integration Order DTO
```

rather than each inventing different terminology.

---

# 221. Architecture Milestone

With Pricing formalized, the following domains now share one consistent commercial model:

```text
Catalog
    ↓
Pricing
    ↓
Promotions
    ↓
Checkout
    ↓
Orders
    ↓
Payments
    ↓
Refunds

Pricing
    ↓
Analytics

Pricing
    ↓
Invoice
```

This closes one of the largest remaining business-logic gaps.

---

# 222. Important Remaining Financial Gap

One significant domain gap still exists:

```text
INVENTORY COSTING / COGS
```

We currently have:

```text
Purchase Price

Shipment Costs

Landed Cost

Acquisition Cost Layers

Inventory Quantity Ledger
```

but we have **not yet defined which acquisition cost is consumed when an item sells**.

Without that, the system cannot correctly calculate:

```text
COGS

Product Gross Margin

Order Gross Margin

Inventory Value

Cost adjustments after late landed-cost finalization
```

---

# 223. Why This Is Different From Landed Cost

Landed Cost answers:

> What did this acquired batch of stock cost?

Inventory Costing answers:

> When one unit is sold, which acquisition cost is assigned to that sold unit?

Possible approaches include:

```text
FIFO

Weighted Average

Specific Identification

Other management-cost basis
```

We must choose deliberately rather than accidentally implementing one through SQL.

---

# 224. Recommended Next Document

Before Admin Information Architecture, the strongest next source-of-truth document is:

```text
docs/domains/inventory-costing/inventory-costing-cogs-architecture.md
```

It should settle:

```text
Acquisition Cost Layer

Cost Layer Creation

Provisional Cost

Final Cost

FIFO vs Weighted Average

Cost Consumption

Fulfillment → Cost Consumption

Returns → Cost Restoration

Damaged/Disposed Stock Cost

Transfers and Cost

Stocktake Cost Effect

Late Landed Cost Adjustment

Negative Inventory prohibition

COGS

Inventory Valuation

Margin

Historical Cost Corrections

Analytics integration

Finance boundary

Accounting boundary
```

Only then can we safely build:

```text
Product Margin

Order Margin

Inventory Value

Profit-oriented Analytics
```

without creating fake profitability numbers.

After Costing, we should proceed to:

```text
Admin Information Architecture
        ↓
Storefront UX Architecture
        ↓
Testing Master Plan
        ↓
Operations / Runbooks
        ↓
Implementation Roadmap
```

---

**End of Pricing & Order Totals Architecture v0.1**
