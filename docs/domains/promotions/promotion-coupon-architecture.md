# Maevelle Ecommerce — Promotions, Discounts & Coupons Architecture

**Document:** `docs/domains/promotions/promotion-coupon-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `catalog-architecture.md`, `order-lifecycle-architecture.md`, `storefront-commerce-architecture.md`, `customer-architecture.md`, `finance-operations-architecture.md`, `access-control-architecture.md`

---

# 1. Purpose

The Promotions domain defines how Maevelle can intentionally reduce the customer's payable amount through:

```text
Coupon Codes

Automatic Promotions

Percentage Discounts

Fixed Amount Discounts

Product Discounts

Order Discounts

Free Delivery

Future Buy X Get Y

Future Customer-Specific Offers
```

while preserving:

```text
Correct Order totals

Correct line totals

Correct refund calculations

Correct partial-return calculations

Usage limits

Customer limits

Promotion history

Concurrency safety

Deterministic rounding

Auditability
```

---

# 2. Core Principle

> **Promotion definition and resulting Discount are separate concepts.**

Example:

```text
Promotion:
Eid 10% Off

Rule:
10% off eligible Products

Coupon:
EID10
```

This is configuration.

When applied to an actual Cart:

```text
Dress       ৳1,000
Hat         ৳500
----------------
Discount    ৳150
```

that is a specific:

```text
Discount Application
+
Discount Allocations
```

---

# 3. Second Core Principle

> **Discount total alone is insufficient.**

Bad Order history:

```text
Subtotal:        ৳3,000
Discount:          ৳300
Total:           ৳2,700
```

This does not tell us:

```text
Which Product received the discount?

How much discount belongs to each Order Line?

What happens if one item is returned?

What amount should be refunded?
```

---

# 4. Correct Model

Instead:

```text
Product A
Gross:            ৳1,000
Discount:           ৳100
Net:                ৳900

Product B
Gross:            ৳2,000
Discount:           ৳200
Net:              ৳1,800

--------------------------------

Order Gross:      ৳3,000
Discount:           ৳300
Net:              ৳2,700
```

Now every monetary result is explainable.

---

# 5. Third Core Principle

> **Promotions are evaluated dynamically, but Orders preserve the result historically.**

The current Promotion definition might later change.

Historical Order:

```text
ORD-1005
```

must still know exactly why and how it received:

```text
৳300 discount
```

at the time it was placed.

---

# 6. Fourth Core Principle

> **Cart discounts are previews; Order discounts are committed historical facts.**

Cart:

```text
mutable

re-priced

re-evaluated
```

Order:

```text
snapshotted

traceable

historical
```

---

# 7. Fifth Core Principle

> **Promotions cannot reduce a charge below its valid monetary floor unless a future feature explicitly allows store credit or negative pricing.**

Normal V1:

```text
Line Net >= 0

Delivery Net >= 0

Order Payable >= 0
```

---

# 8. Research-Informed Direction

Current Medusa promotion architecture separates Promotions, eligibility rules, and application methods, and supports discounts against items, shipping methods, or an order.

Its cart and order architecture also represents applied promotions through adjustment lines attached to affected commerce components rather than treating discounting as only one opaque final total.

Saleor similarly supports percentage/fixed discounts over products, collections, categories, and variants, while Shopify documents discounts at line-item/cart/order levels and automatic or code-triggered application.

These patterns reinforce our decision to model:

```text
Promotion
→ Evaluation
→ Application
→ Allocation
```

rather than:

```text
order.discount = 300
```

---

# 9. Domain Responsibilities

Promotions owns:

```text
Promotion

Coupon Code

Automatic Promotion

Promotion Rules

Promotion Conditions

Promotion Targets

Promotion Benefits

Promotion Evaluation

Discount Application

Discount Allocation

Promotion Usage

Customer Usage

Promotion Scheduling

Stacking / Combination Policy

Promotion Snapshot

Promotion Health

Promotion Audit
```

---

# 10. Promotions Does Not Own

Promotions does not own:

```text
Base Product Price

Variant Identity

Customer Master Identity

Order Lifecycle

Refund execution

Return authorization

Delivery lifecycle

Payment transaction
```

It integrates with those domains.

---

# 11. Main Concepts

Recommended concepts:

```text
Promotion

Promotion Trigger

Coupon Code

Promotion Condition

Promotion Target

Promotion Benefit

Promotion Evaluation

Discount Application

Discount Allocation

Promotion Usage

Promotion Snapshot
```

---

# 12. Promotion

A **Promotion** represents a commercial incentive program.

Example:

```text
Name:
Eid 10% Discount

Trigger:
COUPON

Code:
EID10

Benefit:
10% Off

Target:
Eligible Products

Start:
June 1

End:
June 15
```

---

# 13. Promotion Is Not Coupon

A Coupon Code is only one way to trigger a Promotion.

Therefore:

```text
Promotion
≠
Coupon Code
```

---

# 14. Automatic Promotion

Example:

```text
Spend ৳2,000
→ Free Delivery
```

No customer code required.

---

# 15. Coupon Promotion

Example:

```text
Use:
WELCOME10

→ 10% off
```

---

# 16. Future Trigger Types

Potential:

```text
AUTOMATIC

COUPON

MANUAL_ADMIN

CAMPAIGN_LINK

CUSTOMER_ENTITLEMENT

API
```

V1 requires:

```text
AUTOMATIC
COUPON
```

and explicit manual discount remains separately controlled.

---

# 17. Coupon Code

A **Coupon Code** represents a customer-entered activation code.

Example:

```text
EID10
```

---

# 18. One Promotion, Multiple Codes

Architecture should support:

```text
Promotion:
Influencer Campaign

Codes:
NUSRA10
RAHIM10
MAEVELLE10
```

even if V1 UI commonly uses one code per Promotion.

---

# 19. Why?

Future:

```text
Influencer attribution

Campaign partners

Bulk customer codes

Affiliate marketing
```

should not require duplicate Promotion rules.

---

# 20. One Code, One Promotion

Normal V1:

```text
Coupon Code
→ one Promotion
```

A code should not unpredictably activate several unrelated Promotion definitions.

---

# 21. Coupon Code Normalization

Recommended comparison:

```text
trim outer whitespace

case-insensitive
```

so:

```text
eid10

EID10

 Eid10
```

normally resolve to the same code.

---

# 22. Preserve Display Form

System can still preserve/display:

```text
EID10
```

as intended marketing capitalization.

---

# 23. Code Uniqueness

Normalized active Coupon Codes should be unique within:

```text
Organization / relevant Storefront scope
```

---

# 24. Code Reuse

After Promotion ends, should:

```text
EID10
```

be reusable?

Recommended:

> Avoid casual code reuse.

Historical Orders may reference the old Coupon.

If reuse is allowed later:

```text
Coupon identity
+
Promotion snapshot
```

must make histories unambiguous.

---

# 25. Safer V1

Treat previously used Coupon Codes as reserved historical identifiers unless explicitly reactivated under controlled rules.

---

# 26. Promotion Lifecycle

Recommended:

```text
DRAFT

SCHEDULED

ACTIVE

PAUSED

ENDED

ARCHIVED
```

---

# 27. Draft

Not customer-applicable.

Can be edited freely.

---

# 28. Scheduled

Configured and valid but:

```text
start time > now
```

---

# 29. Active

Potentially applicable subject to eligibility.

---

# 30. Paused

Temporarily unavailable.

Useful for:

```text
Campaign problem

Unexpected abuse

Inventory situation

Business decision
```

without deleting configuration.

---

# 31. Ended

Validity period has permanently passed or Promotion intentionally ended.

---

# 32. Archived

Historical administrative state.

Cannot be newly applied.

Historical Orders remain unchanged.

---

# 33. Lifecycle vs Eligibility

An `ACTIVE` Promotion does not mean:

```text
every Cart receives discount.
```

It means Promotion may be evaluated.

Conditions still determine eligibility.

---

# 34. Promotion Schedule

Potential:

```text
Starts At

Ends At
```

---

# 35. Start Inclusive

Recommended:

```text
valid when now >= starts_at
```

---

# 36. End Semantics

Define centrally.

Recommended:

```text
valid while now < ends_at
```

using explicit timestamp.

Avoid ambiguous:

```text
Ends June 10
```

with no timezone/time definition.

---

# 37. Central Timezone

Promotion schedule uses stored absolute timestamps with business-local input/display.

Maevelle's configured timezone controls admin/customer presentation.

---

# 38. Never Evaluate Client Clock

Promotion validity uses server time.

---

# 39. Promotion Trigger

Recommended:

```text
COUPON

AUTOMATIC
```

V1.

---

# 40. Promotion Benefit

Benefit answers:

> What financial advantage is granted?

V1 types:

```text
PERCENTAGE_OFF

FIXED_AMOUNT_OFF

FREE_DELIVERY
```

Strong future:

```text
BUY_X_GET_Y

FIXED_PRICE

FREE_GIFT
```

---

# 41. Percentage Off

Example:

```text
10%
```

---

# 42. Percentage Validation

Normal:

```text
0 < percentage <= 100
```

unless advanced future pricing model intentionally supports different semantics.

---

# 43. Fixed Amount Off

Example:

```text
৳500 off
```

---

# 44. Fixed Amount Currency

Every fixed discount explicitly has currency.

Example:

```text
500 BDT
```

---

# 45. Multi-Currency Promotion

Future Promotion may define:

```text
BDT 500

USD 5
```

or channel/currency-specific benefits.

Do not silently convert fixed discounts using current FX.

---

# 46. V1 Currency Policy

Fixed-amount Promotion must match transaction currency unless explicit configured equivalent exists.

---

# 47. Free Delivery

Benefit reduces eligible:

```text
Delivery Charge
```

to:

```text
0
```

or applicable allowed amount.

---

# 48. Free Delivery Is Not Order Discount

Important.

Suppose:

```text
Items:          ৳2,000
Delivery:         ৳100
```

Free Delivery gives:

```text
Item Discount:      ৳0
Delivery Discount: ৳100
```

not:

```text
Order Product Discount:
৳100
```

---

# 49. Why?

Returns, Product margins, and fulfillment reporting depend on knowing what was discounted.

---

# 50. Promotion Target

Target answers:

> Which charge/items may receive the benefit?

Recommended target classes:

```text
ORDER

PRODUCT_LINES

DELIVERY
```

---

# 51. Order Target

Benefit applies across eligible merchandise subtotal.

Example:

```text
10% off entire order
```

---

# 52. Product-Line Target

Example:

```text
20% off Hats
```

Only qualifying lines receive allocations.

---

# 53. Delivery Target

Example:

```text
Free Delivery
```

---

# 54. Target Selector

Product-targeting Promotion may select by:

```text
Specific Product

Specific Variant

Category

Collection

Product Type

Potential Tag

Potential Attribute
```

---

# 55. V1 Recommended Targeting

Mandatory:

```text
ALL_ELIGIBLE_PRODUCTS

SPECIFIC_PRODUCTS

SPECIFIC_VARIANTS

CATEGORIES

COLLECTIONS
```

Strongly preferred:

```text
PRODUCT_TYPES
```

---

# 56. Tags as Promotion Rules

Tags are useful but less structurally controlled.

They may be supported later/optionally.

Do not make critical Promotion logic rely heavily on accidental freeform tags.

---

# 57. Category Target

Example:

```text
20% off Jewelry
```

must define whether descendants count.

---

# 58. Category Descendant Policy

Explicit:

```text
DIRECT_ONLY

INCLUDE_DESCENDANTS
```

Do not let tree query implementation silently decide.

---

# 59. Collection Target

Promotion can target:

```text
Eid Collection
```

using Collection membership.

---

# 60. Dynamic Collection Future

If Collections later become rule-generated:

```text
Promotion eligibility uses resolved Collection membership
```

at evaluation time.

Order preserves resulting applied target snapshot.

---

# 61. Product Type Target

Useful:

```text
All Shoes
```

regardless of merchandising Category.

---

# 62. Variant Target

Useful when:

```text
Old stock Variant

Specific color

Specific package
```

needs discount.

---

# 63. Product Target and Variant

If Product is eligible:

```text
all active eligible Variants
```

normally qualify unless exclusions restrict them.

---

# 64. Exclusions

Promotions should support explicit exclusions.

Examples:

```text
Exclude Product X

Exclude Category Y

Exclude Sale Items
```

---

# 65. V1 Exclusions

Recommended:

```text
Excluded Products

Excluded Variants

Excluded Categories
```

---

# 66. Include/Exclude Conflict

Recommended:

> Exclusion wins.

Example:

```text
Include:
Category Dresses

Exclude:
Product Premium Dress
```

Premium Dress does not qualify.

---

# 67. Promotion Condition

Condition answers:

> When is this Promotion allowed to apply?

---

# 68. V1 Condition Types

Recommended:

```text
MINIMUM_ELIGIBLE_SUBTOTAL

MINIMUM_ELIGIBLE_QUANTITY

CUSTOMER_FIRST_ORDER

CUSTOMER_INCLUDE

CUSTOMER_EXCLUDE
```

Potential:

```text
CUSTOMER_TAG

PAYMENT_METHOD

DELIVERY_METHOD

LOCATION

CHANNEL

DAY_OF_WEEK
```

later.

---

# 69. Avoid Premature Rule Explosion

Do not immediately build:

```text
arbitrary IF/ELSE scripting language.
```

Implement typed rules with known semantics.

---

# 70. Rule Composition

V1 recommended:

```text
all configured eligibility conditions must pass
```

for one Promotion.

---

# 71. Future OR Groups

Future may need:

```text
Customer is VIP
OR
Customer spent > ৳20,000
```

but do not build generic nested boolean trees unless required.

---

# 72. Minimum Subtotal

Example:

```text
Spend at least ৳2,000
→ 10% off
```

---

# 73. Which Subtotal?

This must be explicit.

Recommended:

```text
eligible merchandise subtotal
```

before this Promotion's benefit.

---

# 74. Excluded Items

Suppose:

```text
Eligible Dress:      ৳1,500
Excluded Product:    ৳1,000
```

Minimum eligible subtotal:

```text
৳2,000
```

should evaluate:

```text
৳1,500
```

not:

```text
৳2,500
```

unless Promotion explicitly defines total-cart threshold.

---

# 75. Threshold Basis

Promotion should declare:

```text
ELIGIBLE_SUBTOTAL

ORDER_MERCHANDISE_SUBTOTAL
```

if both behaviors are needed.

---

# 76. V1 Simpler Default

For targeted Product Promotions:

```text
ELIGIBLE_SUBTOTAL
```

For whole-order Promotions:

```text
ORDER_MERCHANDISE_SUBTOTAL
```

---

# 77. Delivery in Minimum Spend

Normally exclude Delivery charge from merchandise minimum.

Example:

```text
Free delivery over ৳2,000
```

means merchandise subtotal, not:

```text
৳1,950 Products
+
৳100 Delivery
```

qualifying itself.

---

# 78. Minimum Quantity

Example:

```text
Buy 3 eligible hats
→ 10% off
```

Quantity is sum of eligible units.

---

# 79. Customer First Order

A first-order Promotion requires precise definition.

Recommended:

```text
Customer has zero qualifying previously committed Orders
```

according to documented Order statuses.

---

# 80. Do Not Use Customer Record Age

```text
Customer created today
```

does not necessarily mean first Order.

---

# 81. Guest Customer First Order

Customer identity resolution occurs during checkout.

Promotion evaluation may need preliminary customer candidate context and final revalidation after Customer resolution.

---

# 82. First-Order Race

Customer opens two browser tabs and tries:

```text
WELCOME10
```

twice simultaneously.

Only one should qualify under a one-first-order policy.

---

# 83. Therefore

First-order eligibility and usage commitment must be concurrency-safe at final Order placement.

---

# 84. Specific Customer Promotion

Example:

```text
Customer CUS-1001
→ ৳500 goodwill Coupon
```

Supported through customer targeting.

---

# 85. Customer Exclusion

Useful:

```text
Exclude blocked Customers
```

though blocked-order restrictions may belong to Customer/Order policy anyway.

Avoid duplicating security/business bans into every Promotion.

---

# 86. Customer Tags Future

Potential:

```text
VIP

Wholesale
```

as eligibility.

But tags should not substitute for formal pricing contracts if B2B grows.

---

# 87. Promotion Eligibility Context

Evaluation may inspect:

```text
Cart Lines

Current Product/Variant metadata

Current Prices

Customer Context

Delivery Selection

Coupon Codes

Current Time

Prior Promotion Usage
```

---

# 88. Payment Method Conditions

Potential future:

```text
Pay with bKash
→ ৳100 off
```

But evaluate carefully because Payment selection may occur late in Checkout.

---

# 89. V1 Recommendation

Do not make Payment Method conditions a mandatory V1 feature unless Maevelle immediately needs them.

Keep architecture extensible.

---

# 90. Promotion Scope vs Condition

Do not confuse:

```text
Target:
Hats
```

with:

```text
Condition:
Cart subtotal >= ৳2,000
```

Target determines **where** discount goes.

Condition determines **whether** it applies.

---

# 91. Trigger vs Condition

Likewise:

```text
Coupon EID10
```

is a trigger.

It does not by itself establish eligibility.

---

# 92. Coupon Apply Flow

```text
Customer enters EID10
        ↓
Normalize
        ↓
Find Promotion
        ↓
Check lifecycle
        ↓
Check schedule
        ↓
Check eligibility rules
        ↓
Resolve eligible targets
        ↓
Calculate benefit
        ↓
Create Cart Discount Application
        ↓
Create Allocations
```

---

# 93. Coupon Errors

Customer-safe result types:

```text
INVALID

NOT_STARTED

EXPIRED

NOT_ELIGIBLE

MINIMUM_NOT_MET

USAGE_LIMIT_REACHED

CUSTOMER_LIMIT_REACHED

NOT_APPLICABLE_TO_CART
```

---

# 94. Avoid Coupon Enumeration

Do not reveal excessive difference between:

```text
"code exists but is for Customer CUS-1992"
```

and:

```text
"code invalid"
```

Public messaging can be intentionally generic where needed.

---

# 95. Public Error Example

```text
This coupon can't be applied to your order.
```

Internal reason:

```text
CUSTOMER_NOT_ELIGIBLE
```

---

# 96. Coupon Removal

Customer can remove manually applied Coupon.

Cart re-evaluates totals.

---

# 97. Automatic Promotion

No code needed.

System evaluates relevant active automatic Promotions whenever materially relevant cart state changes.

---

# 98. Avoid Evaluating Everything Naively

At scale, do not scan:

```text
every Promotion ever created
```

on every Cart mutation.

Filter candidate Promotions by:

```text
Organization

Active schedule

Trigger

Currency

Storefront/channel

Potential target index
```

before detailed evaluation.

---

# 99. Cart Re-Evaluation Triggers

Promotions may need recalculation when:

```text
Line added

Line removed

Quantity changed

Variant changed

Coupon applied/removed

Customer context changes

Delivery method changes

Relevant Promotion configuration changes
```

---

# 100. Do Not Trust Old Cart Adjustment

When Cart changes:

```text
recalculate
```

rather than merely carrying forward old discount totals.

---

# 101. Discount Application

A **Discount Application** represents:

> One Promotion applied to one specific pricing context.

Example:

```text
Application:
APP-123

Promotion:
EID10

Context:
Cart CART-88

Calculated Benefit:
৳300
```

---

# 102. Cart Application Is Mutable

It may disappear/recalculate when Cart changes.

---

# 103. Order Discount Application

At Order creation, committed Promotion result becomes historical Order Discount Application/snapshot.

---

# 104. Promotion Snapshot

Order should preserve:

```text
Promotion ID

Promotion Name

Trigger Type

Coupon Code used

Benefit Type

Benefit Value

Relevant Conditions Summary

Applicable Target Summary

Application Time

Total Discount

Allocation Breakdown
```

---

# 105. Why Snapshot?

Later:

```text
EID10
```

might become:

```text
15%
```

but historical Order must remain:

```text
10%
```

if that is what customer received.

---

# 106. Historical Promotion Name

If admin renames:

```text
Eid Offer
→ Summer Offer
```

Order should still preserve relevant original snapshot/display.

---

# 107. Coupon Snapshot

Order should preserve Coupon Code actually used.

---

# 108. Promotion Deletion

Promotion with usage history should not be hard-deleted normally.

Archive instead.

---

# 109. Draft Promotion Delete

Unused Draft Promotion may be deletable.

---

# 110. Discount Allocation

A **Discount Allocation** assigns an amount of discount to a specific monetary target.

Examples:

```text
Order Line A:       ৳100

Order Line B:       ৳200

Delivery Charge:    ৳80
```

---

# 111. Allocation Target Types

V1:

```text
ORDER_LINE

DELIVERY_CHARGE
```

---

# 112. Why No Generic Order Target?

Even an order-level Promotion should ultimately allocate its monetary effect down to eligible Order Lines.

This supports:

```text
Partial cancellation

Partial return

Refund

Margin analysis

Revenue reporting
```

---

# 113. Example

Order:

```text
Dress      ৳1,000
Shoes      ৳2,000
```

Order-level:

```text
10% off
```

Allocations:

```text
Dress       -৳100

Shoes       -৳200
```

---

# 114. Fixed Order Discount

Order:

```text
Dress      ৳1,000
Shoes      ৳2,000

Coupon:
৳500 off
```

How should ৳500 be allocated?

---

# 115. Recommended Default

Allocate proportionally to eligible monetary value.

Gross ratio:

```text
Dress:
1/3

Shoes:
2/3
```

Raw allocations:

```text
Dress:
৳166.666...

Shoes:
৳333.333...
```

Need deterministic currency rounding.

---

# 116. Rounding

For BDT minor units:

```text
whole taka
```

if transaction precision is configured that way.

Possible final:

```text
Dress:
৳167

Shoes:
৳333
```

Total remains exactly:

```text
৳500
```

---

# 117. Deterministic Residual

Rounding may produce leftover minor units.

We need stable residual allocation.

Example strategy:

```text
Largest Remainder Method
```

with deterministic tie-breaking such as:

```text
stable Order Line order / stable ID
```

---

# 118. Why Deterministic?

Same Order calculation must produce same allocations across:

```text
Retry

Preview

Final Order

Audit/Recalculation
```

---

# 119. No Floating Point

Use fixed decimal/minor-unit arithmetic.

---

# 120. Percentage Rounding

Each eligible line calculation can generate fractional minor units.

Apply centralized deterministic rounding.

---

# 121. Quantity-Level Allocation

Order Line:

```text
Quantity 3

Gross ৳999
Discount ৳100
```

Future partial returns may require knowing discount per returned quantity.

---

# 122. Unit Discount Distribution

We need deterministic unit-level attribution or return-allocation rules.

Example:

```text
Unit gross:
৳333
৳333
৳333

Discount ৳100
```

could conceptually distribute:

```text
৳34
৳33
৳33
```

---

# 123. Do We Need Physical Unit Rows?

No.

Order Line can preserve:

```text
total discount allocation
```

plus deterministic quantity return-allocation algorithm.

No need to create one database row per physical unit.

---

# 124. Return Discount Principle

If:

```text
2 of 3 units returned
```

refundable Product amount must include the corresponding original allocated discount treatment.

---

# 125. Refund Cannot Ignore Promotion

Original:

```text
Gross:
৳1,000

Discount:
৳200

Customer paid:
৳800
```

Returning the Product normally does not refund:

```text
৳1,000
```

because customer never paid that amount.

---

# 126. Refund Baseline

Normal refund starts from:

```text
original net paid/order value attributable to returned quantity
```

subject to refund/order policy.

---

# 127. Historical Allocation Is Essential

This is why Discount Allocation belongs in Order history.

---

# 128. Partial Cancellation

Before fulfillment:

```text
Order Line removed/cancelled
```

needs Promotion re-evaluation policy.

---

# 129. Two Different Cases

### Cart / Before Order Placement

Always re-evaluate current Promotions.

### Committed Order Amendment

Must respect historical pricing rules and controlled Order amendment policy.

---

# 130. Order Amendment Policy

If staff removes Product after Order creation:

Promotion engine may need to determine:

```text
Should remaining Order retain original Promotion?

Should Promotion be recalculated?

Is customer grandfathered into original discount?
```

This is a business policy.

---

# 131. Recommended V1

For **customer-caused/pre-fulfillment amendments**, recalculate Promotion eligibility using original Order pricing context where practical.

For **business-caused cancellation**, avoid unexpectedly penalizing customer where Maevelle caused the reduction.

---

# 132. Example

Promotion:

```text
Spend ৳2,000
→ ৳200 off
```

Original:

```text
Product A ৳1,000
Product B ৳1,000
```

Discount:

```text
৳200
```

Maevelle later cannot supply Product B.

If we simply recalculate:

```text
Subtotal = ৳1,000
Promotion invalid
```

customer would lose discount because Maevelle failed fulfillment.

Potentially unfair.

---

# 133. Therefore Adjustment Reason Matters

Promotion recalculation policy can depend on:

```text
CUSTOMER_REQUEST

BUSINESS_UNAVAILABLE

FRAUD

OTHER
```

Order architecture should pass context.

---

# 134. V1 Safe Policy

Preserve original discount attribution on already committed remaining items unless amendment explicitly requires commercial repricing.

Do not silently claw back discounts during operational cancellation.

---

# 135. Customer Adds Item After Order

Confirmed Order amendment adding Product should price the new line under current controlled pricing rules.

Do not retroactively apply old Promotion unless Order amendment policy explicitly allows.

---

# 136. Return Eligibility vs Promotion Requalification

After completed sale, do **not** retroactively re-evaluate whether original Order would have qualified without returned Product and demand more money from customer.

Normal return uses original allocated net values.

---

# 137. Example

Promotion:

```text
Spend ৳3,000
→ 10% off
```

Customer bought:

```text
A ৳2,000
B ৳1,000
```

received:

```text
-৳300
```

Later returns B.

Do not say:

```text
Remaining purchase is below threshold,
therefore refund only ৳700 and claw back discount on A.
```

unless a very explicit Promotion return policy says so.

---

# 138. Recommended V1 Return Policy

> Preserve original per-line discount allocations.

Returned line refund uses its original net allocated amount.

---

# 139. This Makes Returns Predictable

Order history remains authoritative.

---

# 140. Discount Cap

Percentage Promotion may optionally have:

```text
Maximum Discount Amount
```

Example:

```text
10% off
Maximum ৳500
```

---

# 141. Cap Allocation

Calculate raw Percentage benefit.

Then:

```text
min(calculated benefit, cap)
```

and allocate final capped amount proportionally among eligible lines.

---

# 142. Example

Eligible subtotal:

```text
৳10,000
```

10%:

```text
৳1,000
```

Cap:

```text
৳500
```

Final discount:

```text
৳500
```

---

# 143. Fixed Discount Floor

Coupon:

```text
৳500 off
```

eligible merchandise:

```text
৳300
```

Normal result:

```text
discount = ৳300

net = ৳0
```

not:

```text
net = -৳200
```

---

# 144. Unused Discount Value

Remaining:

```text
৳200
```

does not become Store Credit unless the Promotion explicitly represents a stored-value instrument.

Coupon discount is not gift balance.

---

# 145. Gift Cards Are Different

Future Gift Card:

```text
stored value/payment instrument
```

should not be modeled as Promotion.

---

# 146. Store Credit Is Different

Same principle.

---

# 147. Free Delivery

If delivery:

```text
৳80
```

free-delivery Promotion allocation:

```text
৳80
```

---

# 148. Delivery Already Free

Promotion:

```text
Free Delivery
```

when delivery is already:

```text
৳0
```

provides:

```text
৳0 benefit
```

---

# 149. Coupon Application With Zero Benefit

Should it count as usage?

Recommended:

> No, not normally.

A code that applied no actual benefit should not consume limited usage.

---

# 150. Promotion Usage

A **Promotion Usage** represents committed consumption of Promotion entitlement.

---

# 151. Usage Scope

Potential limits:

```text
Total Promotion Uses

Per Customer Uses

Per Coupon Code Uses
```

---

# 152. Global Usage Limit

Example:

```text
First 100 Orders
```

---

# 153. Per-Customer Limit

Example:

```text
One use per customer
```

---

# 154. Coupon-Specific Limit

Useful when several Coupon Codes belong to one Promotion.

---

# 155. Usage Counting Event

Do not increment usage simply when:

```text
customer enters Coupon into Cart.
```

---

# 156. Why?

Abandoned Carts would consume Coupons.

---

# 157. Recommended Usage Commitment

Promotion usage commits when:

```text
Order placement succeeds
```

and the Promotion has positive committed benefit.

---

# 158. Usage and Order Cancellation

What happens if Order later cancels?

Policy needed.

---

# 159. Recommended V1

Separate:

```text
Usage Attempt

Committed Usage

Released Usage
```

conceptually.

For standard Promotions:

- technical failed Order → no usage;
- successfully created Order → usage committed;
- Order cancelled before meaningful fulfillment → usage may be released according to Promotion policy;
- completed Order → usage remains permanently consumed.

---

# 160. Promotion Usage Release Policy

Promotion can declare:

```text
NEVER_RELEASE

RELEASE_ON_FULL_PRE_FULFILLMENT_CANCELLATION
```

V1 recommended default:

```text
RELEASE_ON_FULL_PRE_FULFILLMENT_CANCELLATION
```

for customer-friendly one-use Coupons.

---

# 161. Why Explicit?

Different campaigns may want different semantics.

Example:

```text
one-time goodwill Coupon
```

could possibly remain consumed after abuse-related cancellation.

---

# 162. Partial Cancellation

Do not release a usage merely because one line is cancelled if Promotion remains part of Order.

---

# 163. Full Return

Normally does not restore Promotion usage automatically.

The customer genuinely used the Promotion in a completed purchase.

Business may issue a replacement Coupon separately.

---

# 164. Usage Concurrency

Promotion:

```text
1 use remaining
```

Customer A and B place Orders simultaneously.

Exactly one may claim the final usage.

---

# 165. Atomic Usage Commitment

Final Order transaction must atomically verify/claim applicable limited Promotion usage.

---

# 166. Cart Eligibility Is Advisory

Both customers may temporarily see:

```text
Coupon applied
```

in Cart.

At final placement, one may receive:

```text
Coupon usage limit was just reached.
```

---

# 167. Revalidation

Final Order placement must revalidate:

```text
Promotion active

Schedule

Eligibility

Target lines

Usage limits

Customer limits

Stacking

Calculated benefit
```

---

# 168. Customer Usage Identity

Use canonical Customer ID.

---

# 169. Guest Customer Complexity

During checkout, Customer resolution may happen near Order placement.

Final Promotion customer-limit validation should use canonical resolved Customer.

---

# 170. Customer Merge

Customer A and Customer B may each have used:

```text
one-use Promotion
```

then merge.

---

# 171. Usage History After Merge

Historical usages remain.

Canonical Customer may now appear to have:

```text
2 past uses
```

This is correct history.

---

# 172. Future Eligibility After Merge

Promotion engine evaluates canonical combined usage.

No silent deletion of one usage.

---

# 173. Customer Split Future

If wrong merge is corrected, usage reconciliation may be required.

---

# 174. Stacking

**Stacking** determines whether multiple Promotions can contribute to the same Cart/Order.

This must be explicit.

---

# 175. Why?

Example:

```text
Automatic:
10% off Dresses

Coupon:
WELCOME10
10% off Order

Free Delivery
```

Can all three apply?

Without policy, results become unpredictable.

---

# 176. Promotion Combination Classes

Recommended V1:

```text
PRODUCT_DISCOUNT

ORDER_DISCOUNT

DELIVERY_DISCOUNT
```

---

# 177. Promotion Combination Policy

Each Promotion can declare which classes it can combine with.

Example:

```text
EID10
can combine with:
DELIVERY_DISCOUNT

cannot combine with:
PRODUCT_DISCOUNT
ORDER_DISCOUNT
```

---

# 178. Symmetry Requirement

To combine Promotion A and B:

```text
A must allow B's class

AND

B must allow A's class
```

This prevents one Promotion unilaterally forcing stacking.

---

# 179. Same-Class Multiple Promotions

If two eligible Product Promotions affect same line:

Potential policies:

```text
BEST_DISCOUNT

STACK

PRIORITY_FIRST
```

---

# 180. V1 Recommended

Avoid unrestricted same-target stacking.

Use:

```text
BEST_DISCOUNT
```

or controlled exclusive priority.

---

# 181. Why?

```text
20% off
+
20% off
+
৳500 off
```

on one line creates much more complex math and campaign risk.

---

# 182. Best Discount

Evaluate eligible conflicting candidates and choose the outcome with greatest allowed customer benefit.

---

# 183. Stable Tie-Breaker

If equal:

```text
Promotion Priority

then stable Promotion ID
```

or other deterministic ordering.

---

# 184. Promotion Priority

Admin-configurable integer/ordering can decide:

```text
which exclusive Promotion wins
```

where business rules require.

---

# 185. Priority Does Not Mean More Discount

It is rule precedence.

---

# 186. Product + Delivery

Common safe combination:

```text
10% Product Discount

+

Free Delivery
```

if both Promotions allow combination.

---

# 187. Order + Product

Can be supported, but calculation order must be defined.

---

# 188. Calculation Order

Recommended logical phases:

```text
1. Base Line Prices

2. Product-Line Promotions

3. Order-Level Promotions

4. Delivery Pricing

5. Delivery Promotions

6. Final Totals
```

---

# 189. Order Discount Base

If Product discounts already reduced a line, should Order-level percentage calculate from:

```text
original gross
```

or:

```text
post-product-discount net
```

?

Must be explicit.

---

# 190. Recommended

If stacking is permitted:

> Order-level Promotion evaluates against merchandise value remaining after Product-level Promotion allocations.

This prevents discounts from being applied twice to the same original value unintentionally.

---

# 191. Example

Product:

```text
৳1,000
```

Product Promotion:

```text
20% = -৳200
```

Remaining:

```text
৳800
```

Order Promotion:

```text
10%
```

applies:

```text
-৳80
```

Final:

```text
৳720
```

not:

```text
৳700
```

unless Promotion explicitly defines another basis.

---

# 192. Allocation Preservation

Order stores both:

```text
Promotion A:
-৳200

Promotion B:
-৳80
```

against the line.

---

# 193. Discount Application Ordering

Each application has deterministic:

```text
calculation phase

priority

sequence
```

for historical explanation.

---

# 194. Automatic vs Coupon Priority

Do not universally assume:

```text
Coupon always wins
```

or:

```text
Automatic always wins.
```

Combination rules decide.

---

# 195. Coupon Rejected Because Better Automatic Promotion

Potential UX:

```text
This code can't be combined with your current offer.
```

Could optionally show:

```text
We kept the better discount.
```

if engine chooses best benefit.

---

# 196. Customer Choice

Future advanced UI may let customer choose among mutually exclusive Promotions.

V1 can automatically retain best applicable customer value when safe.

---

# 197. Multiple Coupon Codes

Should customer be allowed to enter multiple codes?

Recommended V1:

```text
one manually entered Coupon Code
```

plus compatible automatic Promotions.

---

# 198. Why?

Reduces:

```text
Stacking complexity

Abuse

Checkout confusion

Support burden
```

---

# 199. Future Multiple Codes

Architecture can allow:

```text
Coupon Applications[]
```

later.

---

# 200. Manual Discounts

Admin/manual Order creation may need:

```text
Manual Discount
```

---

# 201. Manual Discount Is Not Fake Coupon

Do not create:

```text
Coupon:
ADMIN123
```

just to reduce an Order manually.

---

# 202. Manual Discount

A controlled Order Adjustment could contain:

```text
Fixed amount

Percentage

Target lines/order

Reason

Internal actor

Permission

Audit
```

---

# 203. Ownership

Manual Order Discount may belong to:

```text
Order Pricing Adjustment
```

while Promotions engine provides deterministic allocation utilities.

---

# 204. Why Separate?

A one-off customer service concession is not a reusable campaign Promotion.

---

# 205. Manual Discount Permission

Suggested:

```text
orders.discount.manual
```

or:

```text
promotions.manual_discount.apply
```

depending final IAM catalog.

---

# 206. High-Risk Manual Discount

Potential future:

```text
Discount > X%
→ elevated permission/approval
```

---

# 207. Price Override

Manual Discount and Price Override are distinct.

Example:

```text
Variant list price:
৳1,000

Staff negotiates:
৳850
```

Could be:

```text
price override
```

or:

```text
৳150 discount
```

depending business semantics.

---

# 208. Recommended Boundary

If reason is:

```text
Campaign / concession
```

use Discount.

If staff is changing actual agreed unit price:

```text
Order Price Override
```

with dedicated permission/audit.

---

# 209. Order History Must Explain Both

Example:

```text
Base Price:           ৳1,000
Manual Price Override:  ৳950
Promotion Discount:      ৳50
Final Net:              ৳900
```

where policy allows.

---

# 210. Promotion Analytics

Useful V1:

```text
Orders Using Promotion

Total Discount Granted

Gross Sales Influenced

Net Sales

Average Discount per Order

Coupon Usage

Redemption Rate foundation

Top Coupons

Customer Uses
```

---

# 211. Redemption Rate

Needs clear denominator.

Possible:

```text
Coupon Uses
/
Coupon Exposure
```

but exposure may be unknown.

Do not label usage/order count:

```text
redemption rate
```

without valid denominator.

---

# 212. Coupon Usage Count

Simple:

```text
successful committed Orders using Coupon
```

according to usage policy.

---

# 213. Discount Cost

Management metric:

```text
Total customer price reduction attributable to Promotion
```

not necessarily an accounting Expense.

---

# 214. Promotion Is Not Expense

Discount normally reduces commercial sales value.

Do not automatically create:

```text
Finance Expense:
Coupon Discount
```

---

# 215. Finance Relationship

Finance/Analytics may see:

```text
Gross Sales

Discounts

Net Sales
```

as separate commercial metrics.

---

# 216. Margin Analysis

Because Discount Allocations are per line, Analytics can calculate:

```text
Net Selling Price
-
Product Cost
```

accurately.

---

# 217. Avoid Double Discount in Reporting

If Order line already stores:

```text
Net after discount
```

do not subtract discount again from net revenue.

---

# 218. Promotion Search

Admin search:

```text
Name

Coupon Code

Promotion ID
```

---

# 219. Promotion Filters

```text
Status

Trigger

Benefit Type

Start/End

Has Usage Limit

Automatic/Coupon

Target Type

Active Now

Expired
```

---

# 220. Promotion List

Columns:

```text
Promotion

Trigger / Code

Benefit

Status

Schedule

Usage

Target

Last Updated
```

---

# 221. Promotion Detail

Recommended:

```text
Overview

Benefit

Eligibility

Targets

Exclusions

Combination Rules

Codes

Usage

Orders

Analytics

Timeline

Audit
```

---

# 222. Promotion Builder UX

Structured step-by-step:

```text
1. Name / Type

2. Trigger

3. Benefit

4. Target Products

5. Eligibility Conditions

6. Usage Limits

7. Combination Policy

8. Schedule

9. Review

10. Activate
```

---

# 223. Preview

Before activation, show examples:

```text
Example Cart
Eligible subtotal
Calculated discount
```

or at minimum human-readable rule summary.

---

# 224. Human-Readable Rule Summary

Example:

```text
10% off Dresses

Minimum eligible subtotal:
৳2,000

Maximum discount:
৳500

One use per customer

Code:
EID10

Valid:
June 1–15

Can combine with:
Free Delivery
```

---

# 225. Why?

Promotion rules must be understandable without inspecting database JSON.

---

# 226. Draft Validation

Check:

```text
Benefit valid

Targets valid

Schedule valid

Currency valid

Coupon code unique

Usage limits sensible

No impossible target
```

---

# 227. Activation Validation

Stricter:

```text
All mandatory rules complete

At least one valid target if required

Code exists for Coupon trigger

No scheduling conflict that violates policy
```

---

# 228. Empty Target

For order-wide Promotion:

```text
ALL_ELIGIBLE_PRODUCTS
```

can be valid.

For:

```text
PRODUCT_LINES
```

with no targets:

```text
invalid
```

unless explicit all-products target selected.

---

# 229. Pausing Active Promotion

Existing Orders unchanged.

New Cart/Checkout evaluations stop applying it.

---

# 230. Customer Has Coupon in Cart When Paused

Cart re-evaluation:

```text
Promotion no longer available
```

and removes adjustment.

---

# 231. Ending Promotion

Same effect on new Orders.

Historical Orders preserved.

---

# 232. Editing Active Promotion

This is dangerous.

Example:

```text
10%
→
50%
```

while customers have it in carts.

---

# 233. Recommended Rule

Allow controlled edits but treat certain fields as a **new Promotion revision**.

---

# 234. Promotion Revision

Promotion configuration should be versioned once active.

Conceptually:

```text
Promotion
└── Revision 1
    10%

└── Revision 2
    15%
```

---

# 235. Why Version?

Cart evaluation knows current active revision.

Order snapshot knows exact revision that generated its Discount Application.

---

# 236. Revision-Immutability

Once a Revision has committed Order usage:

```text
do not rewrite its rule definition.
```

Create new Revision.

---

# 237. Editable Metadata

Fields such as internal note may change without commercial revision.

---

# 238. Commercially Material Changes

Examples:

```text
Benefit

Targets

Conditions

Limits

Combination Policy

Schedule
```

should be version-aware.

---

# 239. Code Change

Changing Coupon Code may create new code/version while old usage history remains.

---

# 240. Coupon Invalidated

Specific code can be:

```text
DISABLED
```

without disabling entire Promotion if other codes exist.

---

# 241. Coupon Status

Potential:

```text
ACTIVE

DISABLED

EXPIRED / inherited
```

Lifecycle may largely derive from Promotion.

---

# 242. Bulk Unique Coupons Future

Example:

```text
10,000 one-time codes
```

for campaigns.

Architecture should not require one Promotion copy per code.

---

# 243. Code Generation Future

Potential:

```text
random customer-specific coupons
```

with secure randomness.

Not mandatory V1.

---

# 244. Coupon Guessing

Avoid tiny predictable code spaces for private/single-use offers.

Public marketing codes like:

```text
EID10
```

are intentionally shareable.

---

# 245. Public vs Private Coupon

Potential classification:

```text
PUBLIC_CAMPAIGN

PRIVATE / CUSTOMER_SPECIFIC
```

helps abuse policy.

---

# 246. Customer-Specific Coupon

Even if someone else learns the code:

```text
Customer eligibility
```

must still block use.

Code secrecy is not authorization.

---

# 247. One-Time Coupon Concurrency

One code remaining.

Two checkout requests.

Usage claim transaction determines winner.

---

# 248. Usage Reservation?

Should entering code temporarily reserve last usage?

Recommended V1:

```text
No.
```

---

# 249. Why?

Otherwise abandoned carts can lock scarce codes.

Final Order commit claims usage.

---

# 250. Limited Promotion UX

Customer may see:

```text
Coupon applied
```

then fail at final placement because final usage was consumed.

Rare but transactionally correct.

---

# 251. Potential Future Reservation

Short-lived Coupon reservation can be added only if campaign needs justify it.

---

# 252. Promotion Evaluation Result

Useful internal result:

```text
Promotion ID

Revision

Eligible / Ineligible

Reason

Eligible Targets

Raw Benefit

Capped Benefit

Allocations

Combination Decisions
```

---

# 253. Evaluation Explainability

Admin/debug tools should be able to answer:

```text
Why did EID10 not apply?
```

---

# 254. Example Explainability

```text
Promotion active:
YES

Code valid:
YES

Eligible subtotal:
৳1,800

Required subtotal:
৳2,000

Result:
NOT ELIGIBLE
```

---

# 255. Customer Message

```text
Spend ৳200 more to use this coupon.
```

where business wants such guidance.

---

# 256. Sensitive Eligibility

Customer-specific reasons should remain generic.

---

# 257. Promotion Debugger — Preferred

Admin can simulate:

```text
Customer

Cart lines

Coupon

Delivery
```

and inspect evaluation.

Very useful for support.

---

# 258. Debugger Is Read-Only

Simulation must not:

```text
consume usage

create Order

reserve stock
```

---

# 259. Promotion Health

Detect:

```text
Active Promotion with no eligible targets

Coupon Promotion with no active code

Expired but still marked active projection

Allocation mismatch

Usage count mismatch

Invalid currency

Orphaned targets

Impossible rules
```

---

# 260. Target Product Archived

Promotion can remain valid but target becomes inactive.

Health warning if no remaining applicable targets.

---

# 261. Target Category Archived

Same.

---

# 262. Product Added to Category

For Category-targeted active Promotion:

```text
newly qualifying Product
```

becomes eligible automatically.

---

# 263. Is That Desirable?

Usually yes, but admin should understand dynamic target behavior.

Human rule summary should say:

```text
All Products in Dresses,
including future Products added while Promotion is active.
```

---

# 264. Snapshot Still Protects Order

Order records actual Product Lines discounted at transaction time.

---

# 265. Product Removed From Category

Future Cart evaluations stop applying Promotion to it.

Historical Order allocations remain.

---

# 266. Collection Membership Changes

Same principle.

---

# 267. Base Price Change

Promotion percentage calculates from current authoritative eligible price during Cart evaluation.

---

# 268. Order Placement Snapshot

Final base price and discount both become historical Order facts.

---

# 269. Sale Price + Promotion

If Product already has:

```text
Current Price:
৳800

Compare-at:
৳1,000
```

what is Promotion base?

---

# 270. Recommended

Promotion calculates from:

```text
actual current selling price
```

not compare-at/reference price.

---

# 271. Why?

Compare-at is merchandising/reference value, not actual amount customer owes.

---

# 272. Sale Exclusion

If business wants:

```text
Coupon not valid on already discounted items
```

that is an explicit eligibility/exclusion rule.

---

# 273. `Exclude Sale Items`

Strongly preferred condition.

---

# 274. Defining Sale Item

Must be precise.

Could mean:

```text
compare_at_price > current_price
```

under Pricing semantics.

Do not infer from frontend "SALE" badge alone.

---

# 275. Promotions vs Catalog Pricing

Catalog/Pricing owns:

```text
Base/current commercial price
```

Promotions owns temporary conditional reductions.

---

# 276. Permanent Price Change

Example:

```text
Regular price reduced:
৳1,500 → ৳1,200
```

should probably be Pricing change, not a never-ending Promotion.

---

# 277. Campaign Price Reduction

Example:

```text
Eid week:
20% off
```

Promotion.

---

# 278. Promotion and Tax

V1 tax requirements are minimal.

But discount allocations should be computed before any future tax engine according to explicit tax policy.

---

# 279. Future Tax Boundary

A Tax domain will need to know:

```text
gross line amount

discount allocation

taxable net amount
```

---

# 280. Do Not Embed Tax Logic in Promotion

Promotion outputs discounts.

Tax system determines tax effects.

---

# 281. Delivery Discount and Courier Cost

Free Delivery means:

```text
Customer pays ৳0
```

but Maevelle may still incur:

```text
Courier cost ৳100
```

Finance/Delivery records actual business cost separately.

---

# 282. Free Delivery Is Revenue/Charge Reduction

Not:

```text
Courier expense disappears.
```

---

# 283. Promotion Permissions

Recommended:

```text
promotions.view

promotions.create

promotions.edit_draft

promotions.activate

promotions.pause

promotions.end

promotions.archive

promotions.codes.manage

promotions.usage.view

promotions.analytics.view

promotions.import

promotions.debug
```

---

# 284. Sensitive Promotion Permission

Potential:

```text
promotions.edit_active
```

separate from Draft editing.

---

# 285. Why?

Changing active financial rules can affect live customer prices immediately.

---

# 286. Activation Permission

Separate:

```text
promotions.activate
```

from:

```text
promotions.create
```

allows controlled business workflows.

---

# 287. High-Discount Warning

Example:

```text
90% discount
```

should trigger strong warning.

Could require elevated permission/step-up later.

---

# 288. 100% Discount

Valid business use:

```text
free Product
```

but financially sensitive.

Require deliberate configuration.

---

# 289. Fixed Discount Larger Than Typical Price

Warn:

```text
৳100,000 off
```

when normal Product prices are low.

Do not rely only on warning for correctness—the floor prevents negative total.

---

# 290. Promotion Audit

Important events:

```text
promotion.created

promotion.updated

promotion.revision_created

promotion.activated

promotion.paused

promotion.ended

promotion.archived

coupon.created

coupon.disabled

promotion.usage_committed

promotion.usage_released
```

---

# 291. Audit Material Changes

Store:

```text
Before

After

Actor

Timestamp

Reason where required
```

---

# 292. Active Promotion Edit Audit

Especially important.

---

# 293. Order Timeline

Order should display:

```text
Coupon EID10 applied

10% discount

Total benefit ৳300
```

in customer/admin-appropriate terms.

---

# 294. Customer Invoice

Invoice can display:

```text
Subtotal        ৳3,000
EID10           -৳300
Delivery           ৳80
Total           ৳2,780
```

and line-level allocation internally.

---

# 295. Multiple Promotion Invoice

Example:

```text
Product Discount   -৳300
Free Delivery       -৳80
```

Clear breakdown.

---

# 296. Promotion Names vs Codes on Invoice

Customer-facing display uses:

```text
Coupon Code
or
Promotion public label
```

not internal staff campaign names if inappropriate.

---

# 297. Internal Promotion Name

Example:

```text
June Acquisition Campaign Phase B
```

may differ from public:

```text
EID10
```

---

# 298. Promotion Public Label

Optional:

```text
Eid Special
```

---

# 299. Notifications

Useful internal:

```text
Promotion starting soon

Promotion ending soon

Usage limit nearly reached

Promotion fully consumed

Promotion health issue
```

---

# 300. No Customer Notification Engine Here

Notifications domain delivers messages.

Promotions emits events.

---

# 301. Domain Events

Potential:

```text
promotion.activated

promotion.paused

promotion.ended

promotion.usage_committed

promotion.usage_limit_reached

coupon.applied

order.discount_committed
```

---

# 302. Analytics Events

Storefront may record:

```text
coupon_apply_attempted

coupon_applied

coupon_rejected
```

for analytics.

Those are not usage authority.

---

# 303. Privacy

Promotion history may expose customer buying behavior.

Customer-specific Promotion usage follows Customer/Analytics access permissions.

---

# 304. Coupon Logs

Avoid putting customer-specific private codes into unnecessary logs.

---

# 305. Rate Limiting

Public coupon application endpoint needs rate limiting.

---

# 306. Brute Force

Especially for:

```text
private random Coupons
```

avoid allowing millions of guesses.

---

# 307. Generic Error Messaging

Helps reduce enumeration.

---

# 308. Promotion API Commands

Conceptual:

```text
createPromotion()

updateDraftPromotion()

createPromotionRevision()

activatePromotion()

pausePromotion()

endPromotion()

archivePromotion()

createCouponCode()

disableCouponCode()

evaluatePromotions()

applyCoupon()

removeCoupon()

commitPromotionUsage()

releasePromotionUsage()
```

---

# 309. Read APIs

```text
getPromotion()

listPromotions()

getPromotionUsage()

getPromotionAnalytics()

simulatePromotion()

getActiveStorefrontPromotions()
```

---

# 310. Storefront Application Interface

Prefer:

```text
evaluateCartPromotions(cartContext)
```

rather than frontend independently calling twenty Promotion rules.

---

# 311. Order Interface

At final placement:

```text
evaluateAndCommitPromotions(...)
```

or equivalent transactionally safe orchestration.

---

# 312. Avoid Generic Rule CRUD

Do not expose arbitrary JSON that client can mutate into unsupported rule types.

Use typed validated commands.

---

# 313. Structured Errors

Examples:

```text
PROMOTION_NOT_FOUND

PROMOTION_NOT_ACTIVE

PROMOTION_NOT_STARTED

PROMOTION_EXPIRED

PROMOTION_PAUSED

PROMOTION_NOT_ELIGIBLE

COUPON_INVALID

COUPON_DISABLED

COUPON_ALREADY_APPLIED

COUPON_USAGE_LIMIT_REACHED

CUSTOMER_USAGE_LIMIT_REACHED

PROMOTION_NOT_COMBINABLE

PROMOTION_NO_ELIGIBLE_TARGETS

PROMOTION_CURRENCY_MISMATCH

PROMOTION_ALLOCATION_FAILED

PROMOTION_VERSION_CONFLICT
```

---

# 314. Concurrency — Usage Limit

Atomic.

---

# 315. Concurrency — Customer Limit

Atomic.

---

# 316. Concurrency — Promotion Edit

Optimistic versioning.

---

# 317. Concurrency — Activation

Two admins activating different revisions:

```text
only one current commercial revision
```

unless architecture explicitly allows scheduled successor versions.

---

# 318. Scheduled Revision

Useful:

```text
Revision 1:
10% until June 10

Revision 2:
15% starting June 11
```

but can be represented as separate Promotions initially if simpler.

---

# 319. V1 Recommendation

Do not overcomplicate revision scheduling.

Create a new Promotion for materially different campaigns unless editing an ongoing campaign truly needs revision continuity.

Still preserve commercial snapshot/version identity.

---

# 320. Idempotency — Order Placement

Promotion usage commitment uses Order placement idempotency.

Same Order operation:

```text
one usage
```

---

# 321. Idempotency — Usage Release

Cancellation retry:

```text
usage released once.
```

---

# 322. Idempotency — Promotion Events

Duplicate:

```text
order.created
```

must not increment Promotion usage twice.

---

# 323. Evaluation Determinism

For the same:

```text
Promotion revision

Cart state

Customer state

Time context

Usage state
```

calculation should produce deterministic allocations.

---

# 324. Time Context

Preview/evaluation should use explicit:

```text
evaluation timestamp
```

internally.

Avoid one phase evaluating at 23:59:59 and another at 00:00:00 without revalidation.

---

# 325. Promotion Expiring During Checkout

Cart applied Coupon before midnight.

Customer submits Order after expiration.

Recommended:

```text
final Order evaluation uses current valid time
```

unless explicit grace/price-lock policy exists.

---

# 326. Customer Message

```text
This offer has just expired.
```

Order total recalculates and requires customer acknowledgement if payable increases.

---

# 327. No Silent Total Increase

Storefront Architecture established that material total changes should be visible before final acceptance.

---

# 328. Promotion Evaluation Performance

Avoid arbitrary remote calls inside Promotion engine.

V1 Promotion evaluation should operate on local, prepared domain context.

---

# 329. Context Fetching

Storefront/BFF gathers needed:

```text
Product metadata

Customer summary

Usage counts

Delivery context
```

through application/domain services.

---

# 330. Avoid N+1

One Cart with:

```text
20 lines
```

should not produce hundreds of per-rule database round trips.

Batch target/rule evaluation.

---

# 331. Promotion Candidate Indexing

Potential indexes:

```text
status

trigger

active time

coupon normalized code

target Product/Category/Collection

currency
```

---

# 332. Coupon Lookup

Normalized exact lookup should be fast and indexed.

---

# 333. Usage Counters

For limited Promotions, current committed usage needs efficient authoritative count.

Could use:

```text
ledger/usage rows
+
safe aggregate/projection
```

with transaction-safe limit enforcement.

---

# 334. Do Not Trust Cached Usage Count

Final limit enforcement must be authoritative.

---

# 335. Usage Ledger

Recommended conceptual:

```text
Promotion Usage
├── Promotion
├── Coupon
├── Customer
├── Order
├── Benefit Amount
├── State
└── Timestamps
```

---

# 336. Usage Is Traceable

Admin can answer:

```text
Who used this Coupon?

On which Order?

How much discount?

Was usage released?
```

---

# 337. Coupon Privacy in Public API

Storefront should only receive codes customer entered / public promotional information.

Do not expose:

```text
all active private Coupon Codes
```

through public APIs.

---

# 338. Automatic Promotion Discovery

Public Storefront may receive eligible public promotion messaging such as:

```text
Spend ৳2,000 for free delivery
```

but not internal rule metadata.

---

# 339. Promotion Messaging

Promotion calculation and marketing copy are separate.

---

# 340. Example

Rule:

```text
10% off Dresses
```

Public message:

```text
Eid Special — Save 10% on Dresses
```

---

# 341. Marketing Copy Change

Should not require rewriting financial rule.

---

# 342. Promotion Banner

Future CMS/Storefront can link to Promotion identity for messaging.

Promotion does not own homepage layout.

---

# 343. Automatic Promotion Discoverability

Could be:

```text
silent automatic discount
```

or:

```text
promoted visibly
```

configuration.

---

# 344. Coupon Requirement

Do not automatically expose code for private Promotion.

---

# 345. Promotion Import

Controlled CSV import may later support bulk Codes or Promotions.

Not a high-priority normal V1 feature.

---

# 346. Bulk Coupon Codes

Future import/generation likely more useful than full Promotion import.

---

# 347. Export

Authorized export:

```text
Promotions

Codes

Usage

Discount Amount

Orders
```

---

# 348. Security

Promotion configuration directly changes customer prices.

Treat activation/editing as financially sensitive.

---

# 349. Cross-Organization Protection

Promotion cannot target Product/Category/Customer from another Organization.

---

# 350. Target Validation

At save/activation:

```text
all target entities belong to same Organization.
```

---

# 351. Coupon Application Organization

A Coupon from another Store/Organization must behave as invalid.

---

# 352. Promotion Abuse — Repeated Accounts

Future Customer Account system could be abused to bypass:

```text
one per customer
```

using multiple identities.

V1 guest Customer identity and phone matching helps but does not guarantee anti-fraud.

---

# 353. One-per-Customer Is Not Fraud-Proof

It is a business rule.

Future Risk/Fraud system can incorporate:

```text
phone

address

device

payment identity
```

carefully.

---

# 354. Do Not Build Surveillance Into Promotion

Promotion domain should not become a generic fraud engine.

---

# 355. Test Scenario — Percentage Coupon

```text
Dress:
৳1,000

Hat:
৳500

EID10:
10%
```

Allocations:

```text
Dress:
৳100

Hat:
৳50

Total:
৳150
```

---

# 356. Test Scenario — Fixed Discount

```text
A:
৳1,000

B:
৳2,000

Coupon:
৳500
```

Proportional deterministic allocation:

```text
A:
৳167

B:
৳333
```

---

# 357. Test Scenario — Category Discount

Promotion:

```text
20% Hats
```

Cart:

```text
Hat:
৳1,000

Dress:
৳2,000
```

Result:

```text
Hat:
-৳200

Dress:
৳0 discount
```

---

# 358. Test Scenario — Minimum Spend

```text
Eligible:
৳1,900

Minimum:
৳2,000
```

Result:

```text
NOT ELIGIBLE
```

---

# 359. Test Scenario — Free Delivery

```text
Products:
৳3,000

Delivery:
৳100
```

Result:

```text
Product discount:
৳0

Delivery discount:
৳100
```

---

# 360. Test Scenario — Fixed Discount Exceeds Value

```text
Eligible:
৳300

Coupon:
৳500
```

Result:

```text
Discount:
৳300

Net:
৳0
```

---

# 361. Test Scenario — Usage Race

```text
Remaining:
1
```

Two Orders commit concurrently.

Result:

```text
Order A:
Promotion accepted

Order B:
PROMOTION_USAGE_LIMIT_REACHED
```

or reverse.

Never both.

---

# 362. Test Scenario — Double Submit

Same idempotent Order operation retries.

Result:

```text
1 Order

1 Promotion Usage
```

---

# 363. Test Scenario — Customer Limit

Customer used:

```text
WELCOME10
```

previously.

Limit:

```text
1 per customer
```

Result:

```text
CUSTOMER_USAGE_LIMIT_REACHED
```

---

# 364. Test Scenario — Customer Merge

Customer A used Coupon once.

Customer B used same Coupon once.

After merge:

```text
Canonical Customer Usage:
2
```

Future one-use Promotion cannot be used again.

---

# 365. Test Scenario — Product Removed From Category

While Promotion active:

```text
Product X removed from Hats.
```

New Cart:

```text
No longer receives Hat discount.
```

Historical Orders unchanged.

---

# 366. Test Scenario — Promotion Paused

Cart currently shows:

```text
-৳200
```

Admin pauses Promotion.

Cart/Checkout re-evaluates:

```text
discount removed
```

before Order.

---

# 367. Test Scenario — Return

Original line:

```text
Gross:
৳1,000

Discount:
৳200

Net:
৳800
```

Full qualifying return baseline:

```text
৳800
```

subject to Refund/Return policy.

---

# 368. Test Scenario — Partial Quantity Return

Line:

```text
3 × ৳333
Gross ৳999

Discount:
৳100

Net:
৳899
```

Return one unit uses deterministic allocation of original Discount.

No recalculation using today's Promotion.

---

# 369. Test Scenario — Stacking

Product Promotion:

```text
20%
```

then compatible Order Promotion:

```text
10%
```

on ৳1,000:

```text
After Product Promotion:
৳800

Order Promotion:
৳80

Final:
৳720
```

Both allocations preserved.

---

# 370. Important Invariants

### PROMO-INV-001

Every Promotion belongs to one Organization.

### PROMO-INV-002

Coupon Code and Promotion are separate concepts.

### PROMO-INV-003

Promotion definition and applied Discount are separate.

### PROMO-INV-004

Cart Discount Applications are recalculable and not historical price authority.

### PROMO-INV-005

Order Discount Applications preserve committed historical results.

### PROMO-INV-006

Order discount totals equal the sum of valid Discount Allocations.

### PROMO-INV-007

Every monetary Product discount is attributable to eligible Order Lines.

### PROMO-INV-008

Delivery discounts are attributable to Delivery charges rather than Product Lines.

### PROMO-INV-009

Normal discounts cannot reduce an eligible monetary target below zero.

### PROMO-INV-010

Fixed Promotion currency must be compatible with Order currency.

### PROMO-INV-011

No silent FX conversion is used for fixed Promotion value.

### PROMO-INV-012

Coupon matching uses normalized code identity.

### PROMO-INV-013

Coupon application does not itself consume Promotion usage.

### PROMO-INV-014

Successful committed Order placement is the normal usage-commit point.

### PROMO-INV-015

Usage-limit enforcement is concurrency-safe.

### PROMO-INV-016

Per-customer usage enforcement uses canonical Customer identity.

### PROMO-INV-017

Order-placement retries cannot duplicate Promotion Usage.

### PROMO-INV-018

Promotion historical usage survives Promotion archive.

### PROMO-INV-019

Promotion changes cannot rewrite historical Order discount snapshots.

### PROMO-INV-020

Active/commercial Promotion revisions with Order history are not silently rewritten.

### PROMO-INV-021

Promotion eligibility is revalidated at final Order placement.

### PROMO-INV-022

Client-calculated discounts are never authoritative.

### PROMO-INV-023

Target exclusions override inclusions where both match.

### PROMO-INV-024

Promotion combination rules are deterministic.

### PROMO-INV-025

Same calculation context produces deterministic allocations and rounding.

### PROMO-INV-026

Discount allocation uses decimal/minor-unit-safe arithmetic, never binary floating-point authority.

### PROMO-INV-027

Partial returns use original historical Discount Allocations rather than current Promotion definitions.

### PROMO-INV-028

Customer refunds do not automatically cause historical Promotion requalification.

### PROMO-INV-029

Promotion discounts are not automatically Finance Expenses.

### PROMO-INV-030

Gift Cards/Store Credit are not modeled as Promotions.

### PROMO-INV-031

Manual staff discounts are auditable and distinct from reusable Coupon campaigns.

### PROMO-INV-032

Promotion targeting cannot cross Organization boundaries.

### PROMO-INV-033

Public Coupon APIs never expose private Coupon inventories.

### PROMO-INV-034

Promotion-engine failure must not fabricate a discount.

### PROMO-INV-035

Promotion projections/caches never override authoritative final checkout evaluation.

---

# 371. V1 Mandatory Scope

Maevelle V1 Promotions should include:

```text
✓ Promotion entity

✓ Coupon-triggered Promotions

✓ Automatic Promotions

✓ Coupon Code

✓ Coupon normalization

✓ Coupon uniqueness

✓ DRAFT

✓ SCHEDULED

✓ ACTIVE

✓ PAUSED

✓ ENDED

✓ ARCHIVED

✓ Start / End scheduling

✓ Percentage Discount

✓ Fixed Amount Discount

✓ Free Delivery

✓ Order-level targeting

✓ Product-line targeting

✓ Delivery targeting

✓ All Products targeting

✓ Specific Product targeting

✓ Specific Variant targeting

✓ Category targeting

✓ Category descendant policy

✓ Collection targeting

✓ Product exclusions

✓ Variant exclusions

✓ Category exclusions

✓ Minimum subtotal

✓ Minimum quantity

✓ Customer-specific eligibility

✓ Customer exclusion

✓ First-order foundation

✓ Maximum Discount cap

✓ Global usage limit

✓ Per-customer usage limit

✓ Coupon usage limit foundation

✓ Stacking / combination rules

✓ Product Discount class

✓ Order Discount class

✓ Delivery Discount class

✓ Best-discount conflict handling

✓ Deterministic Promotion priority

✓ Deterministic calculation order

✓ Cart Promotion evaluation

✓ Checkout revalidation

✓ Order Promotion snapshot

✓ Discount Applications

✓ Line-level Discount Allocations

✓ Delivery Discount Allocations

✓ Proportional fixed-discount allocation

✓ Deterministic rounding

✓ Residual handling

✓ Partial-return-safe allocation history

✓ Promotion Usage

✓ Usage release policy

✓ Concurrency-safe usage

✓ Idempotent usage commitment

✓ Promotion search

✓ Filters

✓ Promotion Builder

✓ Human-readable rule summary

✓ Promotion Usage view

✓ Permissions

✓ Audit

✓ Health checks

✓ Structured errors
```

---

# 372. Strongly Preferred V1

```text
Exclude Sale Items

Product Type Targeting

Promotion Debugger / Simulator

Promotion Revision History

Public Promotion Label

Multiple Coupon Codes per Promotion

Customer-specific private Coupons

Promotion Analytics

Usage-near-limit Alert

Scheduled Promotion Notifications

Promotion Health Dashboard

Manual Discount integration

Coupon usage release on full pre-fulfillment cancellation

Promotion import/export foundation
```

---

# 373. Foundation Now / Later

Architecture should prepare for:

```text
Buy X Get Y

Free Gift

Fixed Product Price

Multiple Coupon Codes per Cart

Bulk Unique Coupon Generation

Customer Tags

Customer Groups

Payment Method Promotions

Delivery Method Promotions

Channel Promotions

Location Promotions

Affiliate Codes

Influencer Codes

Promotion Campaigns

Promotion Budgets

Advanced Rule Groups

Advanced Customer Segments
```

---

# 374. Deferred Advanced Capabilities

Post-V1:

```text
Buy X Get Y engine

Tiered Discounts

Quantity Breaks

Bundle Discounts

Gift-With-Purchase

Promotion Budgets

Promotion Campaign Hierarchy

Affiliate Attribution

Referral Promotions

Loyalty Rewards

Personalized Promotions

Customer Segmentation Rules

Multiple Public Storefront Channels

Promotion Experimentation / A-B Testing

Dynamic/AI Promotions
```

---

# 375. Decisions Established

### Decision PROMO-001

**Promotion and Coupon Code are distinct concepts.**

### Decision PROMO-002

**Promotions can be Coupon-triggered or Automatic.**

### Decision PROMO-003

**Promotion configuration is separate from actual Discount Applications.**

### Decision PROMO-004

**Cart discounts are dynamic previews; Order discounts are historical snapshots.**

### Decision PROMO-005

**Every committed monetary discount is explicitly allocated to Order Lines or Delivery charges.**

### Decision PROMO-006

**An order-level discount is still allocated to affected lines for historical/refund integrity.**

### Decision PROMO-007

**Percentage, Fixed Amount and Free Delivery are mandatory V1 benefits.**

### Decision PROMO-008

**Buy X Get Y is structurally anticipated but can remain post-V1/strong extension unless immediately required.**

### Decision PROMO-009

**Promotion target and Promotion eligibility condition remain distinct.**

### Decision PROMO-010

**Product, Variant, Category and Collection are primary V1 targeting dimensions.**

### Decision PROMO-011

**Category descendant behavior is explicit.**

### Decision PROMO-012

**Exclusions override matching inclusions.**

### Decision PROMO-013

**Promotion schedules use authoritative server time.**

### Decision PROMO-014

**Fixed Promotion values are currency-explicit and never silently FX-converted.**

### Decision PROMO-015

**Promotion calculations never create negative normal line/order charges.**

### Decision PROMO-016

**Coupon usage is not consumed when merely added to Cart.**

### Decision PROMO-017

**Usage normally commits with successful Order placement.**

### Decision PROMO-018

**Global and per-Customer usage limits are concurrency-safe.**

### Decision PROMO-019

**Canonical Customer identity drives customer-level usage limits.**

### Decision PROMO-020

**Promotion stacking is explicitly controlled rather than accidental.**

### Decision PROMO-021

**V1 avoids unrestricted same-target stacking.**

### Decision PROMO-022

**Compatible Product discounts apply before compatible Order-level discounts.**

### Decision PROMO-023

**When stacked, downstream Promotion calculations use remaining eligible value after prior applicable allocations.**

### Decision PROMO-024

**Fixed order discounts allocate proportionally by eligible monetary value using deterministic rounding.**

### Decision PROMO-025

**Order Promotion snapshots preserve Promotion revision, Coupon, benefit and allocation details.**

### Decision PROMO-026

**Commercially material active Promotion changes require traceable revision/history rather than rewriting Order history.**

### Decision PROMO-027

**Historical returns use original line Discount Allocations instead of re-evaluating today's Promotion rules.**

### Decision PROMO-028

**Normal returns do not retroactively claw back discounts from Products the customer keeps.**

### Decision PROMO-029

**Business-caused partial cancellation should not unexpectedly remove a customer's historical committed discount.**

### Decision PROMO-030

**Manual discounts remain explicit staff adjustments rather than fake Coupon Codes.**

### Decision PROMO-031

**Price Overrides and Discounts remain distinct commercial operations.**

### Decision PROMO-032

**Promotional discounts reduce customer commercial price; they are not automatically Finance Expenses.**

### Decision PROMO-033

**Gift Cards and Store Credit are outside Promotions.**

### Decision PROMO-034

**Promotion activation/editing is financially sensitive and permission-controlled.**

### Decision PROMO-035

**Final Checkout/Order Placement is authoritative for Promotion validity and usage.**

---

# 376. Resulting Promotion Model

The configuration side:

```text
                    PROMOTION
                        │
          ┌─────────────┼─────────────┐
          │             │             │
       TRIGGER       CONDITIONS      TARGETS
          │             │             │
      Coupon /       Minimum      Products
      Automatic       Spend       Categories
                       etc.        Collections
          │
          ▼
       BENEFIT
          │
     Percentage
     Fixed Amount
     Free Delivery
```

---

# 377. Application Model

```text
CART
 │
 ▼
Promotion Evaluation
 │
 ├── Is active?
 ├── Is scheduled now?
 ├── Is code valid?
 ├── Does Customer qualify?
 ├── Does Cart qualify?
 ├── Which Lines qualify?
 ├── Can it stack?
 └── What benefit results?
 │
 ▼
DISCOUNT APPLICATION
 │
 ▼
DISCOUNT ALLOCATIONS
 ├── Line A -৳100
 ├── Line B -৳200
 └── Delivery -৳80
```

---

# 378. Order Commitment

```text
CHECKOUT
   │
   ▼
Re-Evaluate Promotions
   │
   ▼
Check Usage Limits
   │
   ▼
Commit Order
   │
   ├── Promotion Snapshot
   │
   ├── Coupon Snapshot
   │
   ├── Discount Applications
   │
   ├── Discount Allocations
   │
   └── Promotion Usage
   │
   ▼
Historical Financial Truth
```

---

# 379. Partial Return Example

Original:

```text
Dress
Gross:       ৳1,000
Discount:      ৳100
Net:           ৳900

Shoes
Gross:       ৳2,000
Discount:      ৳200
Net:         ৳1,800
```

Customer returns Shoes.

The historical starting point is:

```text
Shoes refundable Product value:
৳1,800
```

not:

```text
৳2,000
```

and not a fresh calculation using whatever Promotion exists today.

That is the exact reason Discount Allocations must be first-class.

---

# 380. Promotion + Finance Result

```text
Gross Merchandise:
৳3,000

Promotion Discount:
-৳300

Net Merchandise:
৳2,700
```

Finance/Analytics understands:

```text
Gross Sales:
৳3,000

Discounts:
৳300

Net Sales:
৳2,700
```

without creating:

```text
Marketing Expense:
৳300
```

and double-counting the reduction.

---

# 381. Architecture Milestone

Our customer commercial-pricing path is now much more complete:

```text
CATALOG PRICE
      │
      ▼
PROMOTION EVALUATION
      │
      ▼
DISCOUNT ALLOCATION
      │
      ▼
CART
      │
      ▼
CHECKOUT REVALIDATION
      │
      ▼
ORDER SNAPSHOT
      │
      ▼
PAYMENT
```

and downstream:

```text
ORDER DISCOUNT ALLOCATIONS
       │
       ├──► Refund calculation
       ├──► Return calculation
       ├──► Revenue analytics
       ├──► Margin analysis
       └──► Customer invoice
```

This removes a major source of future financial ambiguity.

---

# 382. Recommended Next Domain

Next we should create:

```text
docs/domains/notifications/notification-architecture.md
```

because almost every domain we have built now emits things somebody needs to know about:

```text
Order placed

Order held

Stock low

Stock out

Shipment arriving

Shipment delayed

Receiving discrepancy

Supplier payment due

Expense overdue

Payment submitted

Payment verified

Refund completed

COD settlement missing

Review submitted

Low-rating Review

Promotion starting

Promotion ending

Security login alert

Permission changed
```

The Notifications architecture should **not** be just:

```text
sendEmail()
```

It should define:

```text
Notification Event

Notification Type

Notification Recipient

Internal vs Customer Notification

In-App Notification

Email

SMS future

WhatsApp future

Telegram future

Template

Template Variables

Localization

Notification Preference

Mandatory Security Notifications

Delivery Attempt

Delivery Status

Retry

Failure

Provider Adapter

Deduplication

Idempotency

Rate Limiting

Digest / Batching

Quiet Hours foundation

Deep Links

Read / Unread State

Notification Inbox

Audience Resolution

Permission-Aware Internal Notifications

Customer Identity

Phone / Email Selection

Fallback Channels

Sensitive Data Handling

Audit

Analytics
```

The most important distinction will be:

```text
DOMAIN EVENT
≠
NOTIFICATION
≠
DELIVERY ATTEMPT
```

For example:

```text
payment.received
```

is a business event.

It may cause:

```text
Customer Payment Confirmation
```

which is a Notification.

That may be attempted through:

```text
Email

SMS

Future WhatsApp
```

and each attempt can independently:

```text
SUCCEED

FAIL

RETRY
```

without changing Payment truth.

---

**End of Promotions, Discounts & Coupons Architecture v0.1**
