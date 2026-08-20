# Maevelle Ecommerce — Storefront Commerce Architecture

**Document:** `docs/domains/storefront/storefront-commerce-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `catalog-architecture.md`, `sizing-architecture.md`, `inventory-architecture.md`, `order-lifecycle-architecture.md`, `payment-architecture.md`, `customer-architecture.md`, `media-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Storefront domain defines Maevelle's public customer-facing commerce experience.

It brings together:

```text
Catalog

Pricing

Media

Sizing

Inventory Availability

Search

Reviews

Cart

Checkout

Customer Identity

Payment Methods

Order Creation

SEO

Performance
```

without taking ownership of the underlying business truth.

---

# 2. Core Principle

> **The Storefront is an orchestration and presentation layer, not the owner of commerce data.**

For example:

```text
Product truth
→ Catalog

Inventory truth
→ Inventory

Payment truth
→ Payments

Customer identity
→ Customer

Order truth
→ Orders

Media truth
→ Media
```

Storefront consumes those capabilities.

---

# 3. Second Core Principle

> **Fast customer experience must never be achieved by weakening transactional correctness.**

It is acceptable for:

```text
Product page stock badge
```

to use a cached availability projection.

But:

```text
Place Order
```

must perform authoritative server-side validation.

---

# 4. Third Core Principle

> **The Storefront must remain replaceable.**

Future Maevelle may want:

```text
Theme A

Theme B

Campaign storefront

Mobile app

Headless client

Marketplace integration
```

All should reuse the same commerce APIs.

Therefore:

```text
Theme
≠
Business Logic
```

---

# 5. Fourth Core Principle

> **Mobile is the primary interaction environment.**

The architecture should work exceptionally well for customers who:

```text
arrive from Facebook/Instagram

use mobile data

browse quickly

choose a Product

enter phone/address

place COD/bKash/Nagad order
```

with minimal friction.

---

# 6. Research-Informed Direction

Next.js currently supports the App Router, metadata APIs, dynamic Open Graph metadata, image optimization, route prefetching, and explicit caching mechanisms, making it suitable for a server-heavy storefront where pages can be rendered and cached selectively rather than requiring the entire commerce experience to be client-rendered.

Google currently supports ecommerce structured data including `Product`, merchant listings, product variants/ProductGroup, breadcrumbs, and other ecommerce-relevant structured information.

Modern storefront systems also treat free-text search and faceted filtering as distinct capabilities; Shopify's current storefront interfaces expose relevance-based search together with available filters and support filters such as availability, price, variant options, product type, tags, and other structured product data.

Performance architecture should explicitly protect the page's primary above-the-fold visual: web.dev advises against lazy-loading the Largest Contentful Paint image, while non-critical imagery can be deferred and appropriately sized.

---

# 7. Storefront Responsibilities

The Storefront domain owns:

```text
Public Routes

Navigation Presentation

Product Browsing UX

Category Browsing UX

Collection Browsing UX

Product Detail UX

Variant Selection UX

Size Selection UX

Size Guide Presentation

Search Experience

Faceted Filtering Experience

Cart Experience

Checkout Experience

Guest Session Experience

Storefront Error States

Public SEO Rendering

Public Structured Data

Social Sharing Metadata

Storefront Caching Strategy

Storefront Performance Strategy

Theme Presentation Contracts
```

---

# 8. Storefront Does Not Own

Storefront does not own:

```text
Product Master Data

Variant Master Data

Stock Ledger

Stock Reservation

Customer Master Identity

Coupon Rules

Payment Transactions

Order State Machine

Media Storage

Size Guide Definitions
```

---

# 9. Storefront Commerce Model

Conceptually:

```text
CUSTOMER
   ↓
DISCOVERY
   ↓
PRODUCT
   ↓
VARIANT
   ↓
CART
   ↓
CHECKOUT
   ↓
ORDER CREATION
```

with domain interactions:

```text
Catalog
Media
Sizing
Inventory
Pricing
Promotions
Customer
Payments
Orders
```

---

# 10. Public Route Structure

Example:

```text
/

 /products/[handle]

 /categories/[...path]

 /collections/[handle]

 /search

 /cart

 /checkout

 /order/[safe-public-reference]

 /pages/[slug]        future CMS
```

Exact route names remain implementation-level decisions.

---

# 11. Stable Public URLs

Public commerce URLs should use stable human-readable identifiers such as:

```text
/product-handle
```

while internal entities continue using stable IDs.

---

# 12. Handle vs Product ID

Handle:

```text
red-floral-midi-dress
```

is a public-routing concept.

Product ID remains internal identity.

Changing Product title should not automatically force Product identity to change.

---

# 13. Handle Uniqueness

Storefront handles must be unique inside the relevant Storefront/Organization context.

---

# 14. Handle Change

If:

```text
/red-summer-dress
```

changes to:

```text
/floral-midi-dress
```

the previous URL should ideally redirect to the current URL.

Do not silently produce unnecessary permanent 404s for indexed Products.

---

# 15. Redirect History

A simple redirect-history mechanism should eventually support:

```text
old Product handles

old Category handles

old Collection handles
```

---

# 16. Storefront Navigation

Navigation should not be hard-coded into React components.

At minimum, Storefront should consume configurable navigation structure.

---

# 17. V1 Navigation

V1 can support:

```text
Header

Primary Menu

Mobile Menu

Footer Links
```

without requiring a full CMS.

---

# 18. Navigation Item Types

Potential:

```text
Category

Collection

Product

External URL

Static Page

Custom URL
```

---

# 19. Category Navigation

Catalog Categories already support arbitrary nesting.

Storefront navigation may expose only selected parts of that hierarchy.

Therefore:

```text
Catalog hierarchy
≠
Mandatory navigation structure
```

---

# 20. Category Effective Visibility

Catalog Architecture established configured vs effective Category state.

Storefront must respect:

```text
Category active

Ancestor effective visibility

Product publication
```

---

# 21. Category Page

A Category page can provide:

```text
Category Name

Description

Optional Media

Breadcrumb

Child Categories

Product Listing

Filters

Sort

SEO Metadata
```

---

# 22. Parent Category

Example:

```text
Women
   ├── Dresses
   ├── Jewelry
   └── Hats
```

`Women` may show:

```text
Child Categories
+
Products recursively contained
```

according to merchandising policy.

---

# 23. Category Product Inclusion

This should be explicit.

Possible modes:

```text
DIRECT_ONLY

INCLUDE_DESCENDANTS
```

V1 can use a consistent default but should avoid embedding accidental behavior deep in queries.

---

# 24. Collections

Collections are merchandising concepts.

Examples:

```text
Eid Collection

Summer Picks

New Arrivals

Best Sellers
```

They should have separate public pages from taxonomy Categories.

---

# 25. Category vs Collection

Category answers:

```text
What kind of Product is this?
```

Collection answers:

```text
How are we merchandising this Product?
```

Storefront should preserve that difference.

---

# 26. Occasion Browsing

Occasion vocabulary established in Catalog can support landing/listing experiences such as:

```text
Beach

Wedding

Eid

Party

Casual
```

without turning Occasion into Category hierarchy.

---

# 27. Product Listing Page

Common listing surfaces:

```text
Category

Collection

Search Results

Occasion

Tag-derived merchandising where appropriate
```

should reuse one consistent Product-listing system.

---

# 28. Product Card

Product card should receive a purpose-built Storefront projection.

Potential:

```text
Product ID

Handle

Title

Primary Image

Price

Compare-at Price where applicable

Availability Summary

Primary Color Swatches

Rating Summary

Badges
```

---

# 29. Do Not Send Full Product to Product Card

Listing page should not load:

```text
Full descriptions

All gallery assets

All FAQs

Every size-guide row

Every Variant field
```

for each Product.

Use compact projections.

---

# 30. Card Availability

Card may display:

```text
In Stock

Out of Stock

Low Stock / limited if business chooses
```

using Storefront availability projection.

---

# 31. Exact Stock Quantity

V1 should generally avoid publicly displaying:

```text
37 units in warehouse
```

unless business explicitly wants it.

Expose customer-meaningful availability rather than internal inventory structure.

---

# 32. Availability Is Not Product Publication

A Product can be:

```text
Published
+
Out of Stock
```

and remain visible.

---

# 33. Out-of-Stock Listing Policy

Configurable merchandising options:

```text
Keep visible

Move toward bottom

Hide from selected surfaces
```

Storefront policy should not mutate Catalog publication.

---

# 34. Sorting

V1 useful sorts:

```text
Recommended / Featured

Newest

Price Low → High

Price High → Low
```

Future:

```text
Best Selling

Highest Rated
```

when sufficient analytics data exists.

---

# 35. Recommended Sorting

Must have an explicit source.

Do not label:

```text
Recommended
```

if it is actually random.

Initial ordering can use:

```text
manual merchandising position
+
fallback deterministic rule
```

---

# 36. Pagination

Large listings require pagination.

Possible UX:

```text
Load More

Infinite Scroll

Page Navigation
```

Underlying query should support cursor/pagination semantics cleanly.

---

# 37. SEO and Pagination

Search-engine-visible category pages should remain crawlable and stable even if customer UX uses "Load More".

---

# 38. Filter vs Search

Fundamental separation:

```text
Search:
"What Products match these words?"
```

```text
Filters:
"Within these results, which Products satisfy structured properties?"
```

---

# 39. Storefront Search

Search should index the Catalog search projection already defined.

Fields may include:

```text
Product Title

Description

SKU

Categories

Tags

Occasions

Attributes

Primary Color

Associated Colors

Synonyms
```

---

# 40. Search Is Product Discovery

Customer query:

```text
black beach hat
```

may match:

```text
Product title

associated color

Category

Tag

Occasion
```

without requiring those words to appear literally in title.

---

# 41. Search Ranking

V1 ranking should prioritize commercially useful signals.

Potential:

```text
Exact Product Title

Title token match

SKU

Category

Variant options

Tags / Occasions

Description
```

Exact ranking strategy will be tuned during implementation.

---

# 42. Search Typo Tolerance

Desirable:

```text
jewellry
→ jewelry
```

but should depend on chosen search engine.

V1 can begin with good PostgreSQL-backed search and evolve if needed.

---

# 43. Search Engine Evolution

Architecture:

```text
Storefront
   ↓
Search Service Interface
   ↓
PostgreSQL Search Initially
```

Future:

```text
Dedicated Search Engine
```

without changing public commerce APIs.

---

# 44. Search Authority

Search index is:

```text
derived projection
```

not Catalog authority.

---

# 45. Stale Search

If index briefly lags after Product unpublish:

```text
final Product page/query must still enforce publication
```

so stale index cannot expose unpublished business data.

---

# 46. Predictive Search

Preferred V1/early capability:

As customer types:

```text
hat
```

show:

```text
Products

Categories

Collections
```

where relevant.

---

# 47. Search Empty State

Do not show:

```text
No results.
```

alone.

Offer:

```text
Correct spelling

Clear filters

Browse Categories

Popular Products
```

---

# 48. Filters

Potential V1 filters:

```text
Availability

Price

Category where relevant

Color

Size

Product Type

Selected Attributes

Occasion
```

---

# 49. Dynamic Filter Relevance

Not every Category needs every filter.

Example:

```text
Rings
→ Ring Size

Shoes
→ Shoe Size

Hats
→ Head Size maybe

Jewelry
→ Material
```

Product Type/Attribute architecture should drive useful filters.

---

# 50. Avoid Global Filter Noise

Bad:

```text
every possible attribute
```

shown on every Category.

Only expose filters relevant to current result set/context.

---

# 51. Size Filter

Storefront size filter operates on actual sellable Variant option values.

Example:

```text
M
```

means Products having an applicable Variant with Size M under current selection/search context.

---

# 52. Size Vocabulary

Size filter should use Sizing-linked definitions where available.

Do not assume:

```text
S M L XL
```

for all Products.

---

# 53. Color Filter

Use Catalog canonical color vocabulary.

---

# 54. Associated Color Search

Variant may be:

```text
Primary:
Wine Red

Associated Search Colors:
Red
Maroon
```

A customer filtering:

```text
Red
```

may discover the Product.

---

# 55. Primary vs Associated Display

Associated search colors should not necessarily appear as actual selectable Product color swatches.

Only Variant-defining/display colors should normally become selection options.

---

# 56. Price Filter

Price filter must account for Product/Variant price range.

Example Product:

```text
Variants:
৳1,000
৳1,200
৳1,500
```

Product can match a price range if applicable sellable Variants overlap it.

---

# 57. Availability Filter

`In Stock` should mean:

```text
at least one applicable sellable Variant
has Storefront Available-to-Sell > 0
```

under current storefront/location eligibility rules.

---

# 58. Filter URLs

Filter state should be representable in URL/query parameters when practical.

Benefits:

```text
Back button

Refresh

Sharing

Analytics

Crawl control
```

---

# 59. Filter Canonicalization

SEO should avoid indexing millions of insignificant filter combinations.

Canonical/noindex policies can be defined for filter/search pages.

---

# 60. Product Detail Page

PDP is the central commerce surface.

It should combine:

```text
Gallery

Title

Price

Variant Options

Color

Size

Availability

Quantity

Add to Cart / Buy

Size Guide

Description

Structured Information

Reviews

FAQ

Related Products future
```

---

# 61. Product Detail Source

PDP should be assembled from a Storefront Product Query/Application Service aggregating:

```text
Catalog

Pricing

Media

Sizing

Inventory Availability

Reviews
```

---

# 62. Avoid Frontend Domain Joins

Bad:

Browser performs:

```text
GET Product

GET Variants

GET Inventory

GET Images

GET Size Guide

GET Reviews
```

sequentially to construct initial PDP.

Prefer server-side orchestration/projection.

---

# 63. Initial PDP Rendering

Important customer-visible Product information should be available in the server-rendered response.

Do not require client JavaScript to discover:

```text
Product title

price

primary image

basic availability
```

after a blank initial page.

---

# 64. Product Media

Media Architecture already defines:

```text
Product Gallery

Color/Option Gallery

Variant Override

Fallback
```

Storefront simply resolves deterministic gallery output.

---

# 65. Variant Selection

Product options come from Catalog.

Example:

```text
Color:
Red
Blue

Size:
S
M
L
```

---

# 66. Not All Products Have Color + Size

Storefront must render generic Product Options.

Example:

```text
Storage:
128 GB
256 GB

Finish:
Black
Silver
```

This preserves platform neutrality.

---

# 67. Presentation Enhancements

Known semantic types may have specialized controls:

```text
Color
→ swatches

Size
→ compact buttons
```

but generic option selection remains available.

---

# 68. Option Order

Product's option configuration determines:

```text
Color first

Size second
```

not hard-coded frontend assumptions.

---

# 69. Variant Resolution

Selected option combination resolves to:

```text
exact Variant
```

if one exists.

---

# 70. Invalid Combination

Example:

```text
Red + XL
```

does not exist.

The UI should disable or explain unavailable combinations.

---

# 71. Do Not Let Customer Select Impossible Variant

Option interaction should progressively constrain valid combinations.

---

# 72. Unavailable vs Nonexistent

Important distinction:

```text
Red / XL
does not exist
```

vs:

```text
Red / L
exists but out of stock
```

Storefront UX may display these differently.

---

# 73. Out-of-Stock Variant

Variant can remain selectable/displayable but:

```text
Add to Cart disabled
```

with clear availability message.

---

# 74. Variant URL State

Selected Variant should be representable in URL when practical:

```text
?variant=...
```

or option parameters.

Useful for:

```text
sharing

return navigation

ads

analytics
```

---

# 75. Invalid Variant URL

If referenced Variant:

```text
no longer active
```

PDP falls back safely to Product with an appropriate valid default selection.

Do not expose archived/private Variant.

---

# 76. Default Variant Selection

Rules should be deterministic.

Potential:

```text
first available combination
```

or merchandising-preferred option.

Avoid selecting:

```text
out-of-stock first Variant
```

when better alternatives exist unless the URL explicitly requested it.

---

# 77. Color Switching

When Color changes:

```text
Gallery changes

Availability context changes

Possible size availability changes

Variant URL state changes
```

without full unnecessary page reload.

---

# 78. Media Selection

Color gallery is context-specific media.

It does not change Product identity.

---

# 79. Size Selection

Size buttons should display Product's actual available Size option values.

---

# 80. Size Availability

Example:

```text
S ✓

M ✓

L Out of Stock
```

State comes from Variant availability.

---

# 81. Size Guide

If Product has assigned Size Guide:

```text
[ Size Guide ]
```

opens appropriate storefront representation.

---

# 82. Size Guide Content

Sizing domain provides:

```text
Size labels

Measurements

Units

Instructions

Diagram
```

Storefront renders them.

---

# 83. Unit Toggle

Where guide supports:

```text
cm
in
```

customer can switch display units without changing source measurements.

---

# 84. Body vs Garment Measurement

UI should clearly state measurement subject where important.

Example:

```text
Garment Measurements
```

rather than ambiguous:

```text
Measurements
```

---

# 85. Free Size

Product may show:

```text
Free Size
```

with guide/measurement details.

No hard-coded assumption that every Product has multiple sizes.

---

# 86. Product Price

Storefront displays authoritative current commercial price projection.

---

# 87. Price Range

If Variants differ:

```text
৳1,200 – ৳1,500
```

can show before exact Variant selection.

After selection:

```text
exact Variant price
```

---

# 88. Compare-at / Sale Price

If pricing architecture supports:

```text
Original ৳1,500

Current ৳1,200
```

storefront can render discount presentation.

Do not calculate "discount" from arbitrary frontend values.

---

# 89. Currency Formatting

Use centralized localization/currency formatting.

No:

```text
"৳" + number
```

scattered throughout components.

---

# 90. Storefront Availability

Storefront availability is derived only from:

```text
eligible active fulfillment Locations
```

as established by Inventory/Warehouse architecture.

---

# 91. Internal Stock Must Not Leak Into Availability

Example:

```text
Main Warehouse:
0

Damaged Location:
10

Inspection:
5
```

Customer sees:

```text
Out of Stock
```

if no sellable fulfillable stock exists.

---

# 92. Incoming Stock

Incoming supplier stock:

```text
does not normally make Product "In Stock"
```

unless future preorder/backorder policy explicitly enables it.

---

# 93. Safety Stock

Storefront availability already incorporates:

```text
Safety Buffer
```

where configured.

Customer never sees buffer math.

---

# 94. Product Quantity Selector

Customer can select requested quantity.

Maximum UI quantity may be constrained using current availability.

---

# 95. UI Quantity Limit Is Advisory

Even if UI says:

```text
maximum 3
```

server Add-to-Cart/Checkout validates again.

---

# 96. Add to Cart

Input:

```text
Variant ID

Quantity
```

not Product ID alone for sellable goods.

---

# 97. Cart

Cart represents customer purchase intent before Order.

It is:

```text
mutable

temporary

non-authoritative for inventory
```

---

# 98. Guest Cart V1

V1 should support Cart without login.

---

# 99. Guest Cart Identity

Recommended:

```text
Opaque random Cart ID
```

stored through secure browser persistence.

---

# 100. Cart ID Security

Cart identifiers must be sufficiently unguessable.

Possession of a Cart ID should not expose sensitive customer data beyond what the cart flow legitimately requires.

---

# 101. Cart Storage

Recommended architecture:

```text
Server-side Cart state
+
opaque client cart identifier
```

rather than relying entirely on browser localStorage as commerce truth.

---

# 102. Why Server-Side Cart?

Provides:

```text
authoritative recalculation

multi-request consistency

future account attachment

API reuse

server checkout validation
```

---

# 103. Local Optimism

Frontend may optimistically update:

```text
Cart badge

line quantity
```

for responsiveness.

Server confirmation remains authoritative.

---

# 104. Cart Line

Conceptually:

```text
Cart Line

Variant Reference

Quantity
```

plus derived Storefront presentation:

```text
Product Title

Variant Labels

Media

Current Price

Availability
```

---

# 105. Do Not Snapshot Price as Final Order Price in Cart

Cart can preserve last-seen price for comparison.

But checkout re-prices from authoritative Pricing/Promotion systems.

---

# 106. Cart Price Change

Example:

Customer added yesterday:

```text
৳1,000
```

Today:

```text
৳1,100
```

Cart should surface:

```text
Price updated
```

rather than silently pretending old price is guaranteed.

---

# 107. Price Decrease

Likewise communicate or simply apply new lower price according to policy.

---

# 108. Cart Stock Change

Customer added:

```text
Quantity 3
```

but only:

```text
1
```

is available later.

Cart should show:

```text
Only 1 currently available.
```

and require adjustment before checkout.

---

# 109. Cart Variant Unpublished

If Product/Variant no longer purchasable:

```text
Item unavailable
```

should remain understandable in Cart and removable.

---

# 110. Cart Does Not Reserve

Default V1 principle:

```text
Adding to Cart
≠
Inventory Reservation
```

Inventory Architecture already established this.

---

# 111. Why?

Otherwise abandoned carts could lock large portions of limited inventory.

---

# 112. Cart Expiration

Server carts can expire after a configured period of inactivity.

Expiration does not affect Inventory because no reservation exists.

---

# 113. Future Persistent Cart

When Customer Account exists:

```text
Guest Cart
→ safely attach/merge with Account Cart
```

according to a dedicated policy.

Architecture should prepare for this.

---

# 114. Cart Merge Future

Potential conflict:

```text
Guest Cart:
Hat ×1

Account Cart:
Hat ×2
```

merge policy may produce:

```text
Hat ×3
```

subject to availability.

Not V1.

---

# 115. Mini Cart

Header/side-cart UI consumes same server Cart data.

No separate cart implementation.

---

# 116. Buy Now

A "Buy Now" interaction may:

```text
Add selected Variant
→ proceed directly to Checkout
```

using the same Cart/Checkout engine.

Do not create a parallel Order system.

---

# 117. Checkout Goal

For Maevelle, checkout should optimize for:

```text
few fields

few decisions

fast completion

clear COD/bKash/Nagad

mobile keyboard friendliness
```

while retaining correctness.

---

# 118. Guest Checkout

V1 does not require account creation.

Checkout asks only information necessary to fulfill/order safely.

---

# 119. Suggested Checkout Information

Typical:

```text
Name

Phone

Delivery Address

Optional Email

Delivery Method

Payment Method

Customer Note

Coupon
```

Exact address form can adapt to business needs.

---

# 120. Checkout Does Not Require Password

Never add:

```text
Create password
```

as mandatory purchase friction.

---

# 121. Future Account Offer

After Order:

```text
Create Account to track orders
```

may eventually be offered.

Account remains optional.

---

# 122. Checkout Session

A **Checkout Session** should coordinate mutable pre-Order state.

Conceptually:

```text
Cart

Customer Inputs

Delivery Selection

Payment Selection

Coupon State

Pricing Summary

Validation State
```

---

# 123. Checkout Session Is Not Order

Only successful final placement creates committed Order.

---

# 124. Checkout Session Expiration

Checkout state may expire after configured inactivity.

---

# 125. Checkout Server Calculation

Server computes:

```text
Product prices

Discounts

Delivery charge

Tax if applicable

Grand Total
```

---

# 126. Client Cannot Submit Final Price

Bad:

```text
{
  variant: X,
  price: 100
}
```

then trust `100`.

Server retrieves/calculates valid price.

---

# 127. Client Can Submit Selection

Client may say:

```text
Variant X

Quantity 2

Coupon EID10

Delivery Method HOME
```

Server determines resulting money values.

---

# 128. Checkout Validation Stages

Recommended:

```text
Cart validity

Product/Variant eligibility

Current price

Inventory availability

Coupon eligibility

Customer fields

Address

Delivery method

Payment method
```

---

# 129. Incremental Validation

Do not wait until final Place Order to reveal obvious:

```text
Invalid phone
```

errors.

Validate fields interactively/server-assisted.

Final authoritative validation still occurs at submission.

---

# 130. Phone Input

Bangladesh-first UX:

```text
Mobile-friendly phone field

Bangladesh region default
```

Customer Architecture handles normalized identity.

---

# 131. Phone Normalization

Storefront should not implement its own independent `+880` string logic.

Use Customer/domain normalization service.

---

# 132. Address UX

Bangladesh checkout should prioritize understandable local delivery address entry.

Potential:

```text
District / City

Area

Detailed Address

Landmark optional
```

while retaining flexible structured Address architecture.

---

# 133. Avoid Excessive Address Fields

Do not make customer understand internal geographic data model.

Ask only useful fulfillment fields.

---

# 134. Address Validation

Basic required-field validation in V1.

Future courier integrations can validate:

```text
service area

district codes

pickup/delivery zone
```

---

# 135. Delivery Method

Initial V1:

```text
HOME_DELIVERY
```

or business-configured delivery method.

Future:

```text
Pickup

Location-specific delivery

Courier services
```

without changing Order architecture.

---

# 136. Delivery Pricing

Storefront consumes Delivery Pricing/Settings.

Do not hard-code:

```text
Dhaka = 80

Outside Dhaka = 150
```

inside JSX.

---

# 137. V1 Delivery Charge

Can use simple configuration:

```text
inside area

outside area

flat rate
```

if current business needs are simple.

Future Delivery Architecture will become richer.

---

# 138. Payment Methods

Checkout asks Payment domain:

```text
Which methods are currently available
for this Order context?
```

Potential V1:

```text
COD

bKash

Nagad
```

---

# 139. Payment Instructions

Manual bKash/Nagad instructions come from Payment Method configuration.

Not hard-coded storefront copy.

---

# 140. Payment Availability

Payment domain may disable:

```text
COD
```

for:

```text
Order too large

Blocked Customer

Future risk policy
```

Storefront renders returned eligibility.

---

# 141. Coupon

Customer enters:

```text
EID10
```

Storefront sends code to Promotion service.

---

# 142. Coupon Result

Server returns:

```text
Applied

Not found

Expired

Not eligible

Minimum not met

Usage limit reached
```

with safe customer messaging.

---

# 143. Do Not Reveal Internal Promotion Rules

Customer should not receive unnecessary information such as:

```text
this coupon exists but is reserved for customer ID 123.
```

---

# 144. Coupon Revalidation

Coupon must be revalidated during final Order placement.

---

# 145. Promotion Snapshot

Order stores actual resulting Promotion/discount snapshot.

Storefront does not preserve it as authority after Order placement.

---

# 146. Checkout Summary

Persistent mobile-friendly summary:

```text
Items

Subtotal

Discount

Delivery

Total
```

---

# 147. Total Changes

If:

```text
delivery address
```

changes applicable delivery charge:

```text
summary updates
```

and customer sees changed total before placement.

---

# 148. Final Place Order

This is the critical transactional command.

Conceptually:

```text
placeOrder(checkoutId, idempotencyKey)
```

---

# 149. Place Order Pipeline

Authoritative server operation should approximately:

```text
1. Load Checkout/Cart

2. Validate Product publication

3. Validate Variant active state

4. Recalculate prices

5. Recalculate promotions

6. Recalculate delivery charges

7. Validate Payment method

8. Validate Customer/address inputs

9. Validate current inventory availability

10. Resolve/create Customer

11. Create Order

12. Secure required Inventory Reservation

13. Create Payment Intent as needed

14. Commit coherent transaction

15. Return Order confirmation
```

Exact transaction boundaries may differ by domain implementation.

---

# 150. Inventory Reservation Timing

The Order/Inventory docs intentionally left policy flexibility.

For Maevelle V1 recommended default:

> Successful Order placement should secure the required inventory commitment immediately or atomically fail as a normal purchasable Order.

This prevents two accepted Orders from promising the same final unit.

---

# 151. Pending Confirmation

Even if business later calls customer manually before:

```text
CONFIRMED
```

the storefront Order may still reserve at placement depending configured policy.

Otherwise limited stock could be oversold while Orders wait for phone confirmation.

---

# 152. Reservation Expiration Policy

If Maevelle eventually releases reservations for stale/unconfirmed Orders:

```text
Order policy
```

controls it.

Storefront does not directly release stock.

---

# 153. Last Unit Race

Available:

```text
1
```

Customer A and Customer B press:

```text
Place Order
```

nearly simultaneously.

Only one reservation can succeed.

---

# 154. Losing Customer UX

The other checkout receives:

```text
This item just became unavailable.
```

with:

```text
Return to cart
```

and clear affected item.

---

# 155. No False Success

Never display:

```text
Order placed successfully
```

before authoritative order/reservation operation completes.

---

# 156. Checkout Idempotency

Critical.

Customer:

```text
double taps

refreshes

network retries
```

must not create multiple Orders.

---

# 157. Idempotency Key

Each final placement attempt uses stable operation identity.

Repeated same operation returns:

```text
same resulting Order
```

rather than creating another.

---

# 158. Retry After Unknown Outcome

Scenario:

```text
Customer presses Place Order

Server creates Order

Network drops before response
```

Retry must find same operation result.

---

# 159. Payment Interaction

For COD:

```text
Order created
+
COD Payment Intent
+
confirmation
```

---

# 160. Manual bKash/Nagad Flow

Two possible UX approaches:

### Approach A

```text
Payment before Order placement
```

### Approach B

```text
Create Order
→ display manual payment instructions
→ customer submits TxnID
```

---

# 161. Recommended V1 Manual Wallet Flow

For manual payment methods, safer operationally:

```text
Create Order
        ↓
Create Payment Intent
        ↓
Show bKash/Nagad Instructions
        ↓
Customer submits TxnID
        ↓
Payment Verification
```

because payment evidence then has a stable Order reference.

---

# 162. Payment Not Verified

Order can show:

```text
Payment Pending Verification
```

not Paid.

---

# 163. Payment Submission UX

Customer may submit:

```text
Transaction ID

Optional sender number

Optional screenshot if required
```

Payment Architecture handles verification.

---

# 164. Avoid Mandatory Screenshot if Unnecessary

Transaction ID and merchant verification may be sufficient operationally.

Screenshots increase friction and storage/privacy concerns.

Keep evidence policy configurable.

---

# 165. Order Confirmation Page

After successful placement:

```text
Thank you

Order Number

Order Summary

Payment Instructions if needed

Delivery Address

Next Step
```

---

# 166. Public Order Lookup

V1 may offer Order status lookup using:

```text
Order reference
+
phone verification/input
```

or another safe mechanism.

---

# 167. Do Not Expose Order by Sequential ID

Bad:

```text
/orders/1001
/orders/1002
```

with unauthenticated full details.

Use unguessable public token/reference and additional verification where needed.

---

# 168. Public Order Information

Only expose customer-appropriate fields.

Never:

```text
Internal notes

Landed cost

Warehouse stock

Fraud flags

Payment evidence
```

---

# 169. Checkout Abandonment

No Order is created if customer leaves before successful placement.

Checkout can expire.

---

# 170. Abandoned Checkout Analytics — Future

Future marketing can track:

```text
cart abandoned

checkout started

checkout abandoned
```

subject to privacy/consent.

Not a core V1 transactional requirement.

---

# 171. Error Taxonomy

Storefront should distinguish:

```text
Validation Error

Availability Error

Price Changed

Payment Method Unavailable

Coupon Error

Technical Failure
```

---

# 172. Technical Failure Message

Customer sees something safe/actionable:

```text
We couldn't place your order. Please try again.
```

while internal logging retains diagnostic detail.

---

# 173. Preserve Checkout on Failure

If server temporarily fails:

```text
do not clear Cart
```

and force customer to rebuild purchase.

---

# 174. Preserve Form Inputs

On recoverable validation errors:

```text
keep name

phone

address

payment selection
```

where safe.

---

# 175. Price Changed During Checkout

Example:

```text
Old:
৳1,200

Now:
৳1,300
```

Before final commitment, customer should see:

```text
Price changed
```

and updated total where policy requires explicit acknowledgement.

---

# 176. Price Decreased

New lower price can generally apply automatically.

Still final Order snapshot reflects actual accepted price.

---

# 177. Coupon Becomes Invalid

Example:

Usage limit consumed while customer was checking out.

Final placement returns:

```text
Coupon no longer available.
```

recalculates summary.

Do not create an Order with impossible discount.

---

# 178. Delivery Charge Changes

Same principle.

Customer must be shown materially changed payable amount before final order acceptance.

---

# 179. Product Unpublished During Checkout

Cart/checkout reports:

```text
Item no longer available.
```

Cannot place it.

---

# 180. Variant Deactivated

Same.

---

# 181. Inventory Goes to Zero

Affected line becomes unavailable.

Other Cart lines can remain.

---

# 182. Partial Checkout?

V1 should not silently place only available subset.

If:

```text
3 items
1 unavailable
```

require customer review.

Do not unexpectedly order only two.

---

# 183. Inventory Below Requested Quantity

Example:

```text
Requested 3

Available 2
```

offer:

```text
Change quantity to 2
```

rather than modifying without acknowledgement.

---

# 184. Payment Method Disabled Mid-Checkout

Customer must select another payment method.

---

# 185. Customer Blocked Mid-Checkout

Order/customer policy decides whether checkout is denied or restricted.

Return safe message.

Do not reveal internal fraud notes.

---

# 186. Product Reviews

PDP may display:

```text
Rating Summary

Review Count

Review List

Review Photos
```

according to Review moderation rules.

---

# 187. Reviews Are Separate Domain

Storefront consumes:

```text
published reviews only
```

and does not decide moderation.

---

# 188. Rating Summary

Derived:

```text
Average Rating

Review Count
```

from eligible published reviews.

---

# 189. No Fake Review Counts

Never derive count from hidden/rejected reviews unless metric explicitly intends that.

---

# 190. Review Images

Media system delivers approved public-safe review Assets.

---

# 191. Review Pagination

Large review lists need pagination/load-more.

---

# 192. Review Sort

Potential:

```text
Newest

Highest Rating

Lowest Rating
```

V1 optional.

---

# 193. Structured Product Information

Catalog architecture established grouped Product information.

Storefront can render:

```text
Material

Care

Dimensions

Origin

Other structured sections
```

---

# 194. Product Description

Separate rich/text description from structured facts.

Avoid repeating the same truth in conflicting areas.

---

# 195. FAQs

Product-specific FAQs can appear as accessible accordion/content.

---

# 196. Breadcrumbs

Example:

```text
Home
>
Women
>
Dresses
>
Floral Dress
```

---

# 197. Primary Category and Breadcrumb

Product may belong to multiple Categories.

Catalog's optional Primary Category can determine canonical Product breadcrumb.

---

# 198. Breadcrumb Structured Data

Google currently supports breadcrumb structured data as part of its Search structured-data ecosystem.

---

# 199. SEO Metadata

Each Product should expose:

```text
SEO Title

SEO Description

Canonical URL

Indexability State

Social Image
```

with safe defaults from Catalog where explicit values absent.

---

# 200. Metadata Fallback

Example:

```text
SEO Title missing
→ Product Title + Store Name
```

Exact template should be centralized/configurable.

---

# 201. Dynamic Metadata

Next.js currently supports dynamic metadata and generated Open Graph assets through its Metadata APIs, so the Storefront can generate Product/Category-specific page metadata without storing presentation logic inside Catalog.

---

# 202. Social Sharing

Product page should provide:

```text
Title

Description

Primary image

Canonical URL
```

for Open Graph/social sharing.

---

# 203. Canonical URL

Product has one canonical public URL even if reached through:

```text
Category

Collection

Search

Filtered listing
```

---

# 204. Product Structured Data

PDP should produce appropriate Product/merchant structured data from authoritative data.

Google currently documents Product structured data for purchasable product pages, including merchant-listing information.

---

# 205. Variant Structured Data

Products with meaningful Variants should be modeled appropriately in structured data.

Google currently documents `ProductGroup`/Product variant structured data specifically for product variations.

---

# 206. Structured Data Truth

Structured data must match visible/customer-available Product data.

Do not advertise:

```text
InStock
```

when storefront Product is unavailable.

---

# 207. Review Structured Data

Only include ratings/reviews that legitimately meet search-engine requirements and visible content rules.

No manufactured rating schema.

---

# 208. Sitemap

Storefront should produce sitemap entries for eligible:

```text
Products

Categories

Collections

future CMS pages
```

---

# 209. Unpublished Product Sitemap

Never include unpublished/private Products.

---

# 210. Robots

Storefront should control crawling of:

```text
Cart

Checkout

Internal search/filter combinations

private/public-order routes
```

appropriately.

---

# 211. Search Result Indexing

Internal storefront search result pages generally should not become uncontrolled SEO landing pages by default.

---

# 212. Category SEO

Categories can have:

```text
SEO title

description

canonical URL

media
```

---

# 213. Collection SEO

Same.

---

# 214. Performance Objective

Storefront must feel fast under:

```text
mobile network

mid-range devices

image-heavy fashion catalog
```

---

# 215. Server-Heavy Rendering

Use server rendering/caching where it reduces client JavaScript and improves initial response.

Interactive pieces can hydrate/client-render selectively.

---

# 216. Do Not Make Entire PDP Client-Only

Variant selector requires client interaction.

Product title and initial Product details do not.

Keep client boundary small.

---

# 217. Client Components

Good candidates:

```text
Variant Selector

Gallery Interaction

Cart Controls

Filter Drawer

Checkout Interactive Fields
```

---

# 218. Server Components / Server Rendering

Good candidates:

```text
Product Content

Category Data

SEO

Breadcrumbs

Initial Listing

Structured Data
```

depending on final Next.js implementation.

---

# 219. Cacheability Classification

Storefront data should be classified.

### Highly Cacheable

```text
Navigation

Published Product descriptive data

Category hierarchy

Size Guide content

Public Media metadata
```

### Moderately Dynamic

```text
Prices

Review summary
```

### Highly Dynamic / Transactional

```text
Cart

Checkout

Inventory final validation

Customer data

Order placement
```

---

# 220. Avoid One Global Cache Policy

Do not choose:

```text
cache everything 5 minutes
```

or:

```text
cache nothing
```

for all storefront data.

---

# 221. Product Cache Invalidation

When Product:

```text
published

unpublished

title changed

media changed

price changed
```

affected storefront cache should invalidate/revalidate appropriately.

---

# 222. Category Cache Invalidation

Category changes affect:

```text
navigation

breadcrumbs

listing pages
```

---

# 223. Availability Caching

Public Product availability can use very short-lived/derived caching.

Final checkout does not rely on that cache.

---

# 224. Stale Availability UX

It is acceptable that a Product card showed:

```text
In Stock
```

seconds before the final unit was purchased.

Checkout handles race correctly.

---

# 225. Not Acceptable

It is not acceptable for stale cache to allow:

```text
successful reservation of nonexistent stock.
```

---

# 226. Image Performance

Media domain provides responsive renditions.

Storefront selects suitable sizes.

---

# 227. LCP Image

Primary above-the-fold Product/hero image should not be lazy-loaded when it is the page's LCP candidate; web.dev specifically warns that lazy-loading an LCP image causes avoidable delay.

---

# 228. Below-the-Fold Images

Additional Product/gallery/listing imagery can load lazily as appropriate.

---

# 229. Image Dimensions

Use known width/height/aspect metadata from Media to reserve layout space.

This helps avoid visual layout shifts.

---

# 230. Layout Stability

Core Web Vitals includes CLS as the metric for unexpected visual layout shifts, reinforcing the need to reserve media/layout space rather than inserting images into previously unsized containers.

---

# 231. Product Card Images

Do not deliver PDP-resolution images for small listing cards.

---

# 232. Font Strategy

Limit excessive font weights/files.

Storefront aesthetic should not come at the cost of unnecessary render-blocking assets.

---

# 233. Third-Party Scripts

Be conservative with:

```text
analytics

pixels

chat

heatmaps

ads trackers
```

because they can materially affect performance/privacy.

---

# 234. Analytics Loading

Load non-critical analytics after critical commerce experience where appropriate.

---

# 235. Facebook/Meta Pixel Future

Marketing integrations should be treated as optional adapters with consent/privacy considerations.

Do not scatter raw tracking calls throughout Product components.

---

# 236. Analytics Event Layer

Storefront may emit normalized events such as:

```text
product_viewed

variant_selected

product_added_to_cart

checkout_started

payment_method_selected

order_placed
```

---

# 237. Analytics Is Not Transaction Authority

Analytics failure must never prevent:

```text
Order placement
```

---

# 238. Event Failure

If analytics endpoint is unavailable:

```text
commerce continues.
```

---

# 239. Accessibility

Storefront must support:

```text
Keyboard navigation

Visible focus

Meaningful labels

Form errors

Alt text

Semantic controls

Adequate contrast
```

---

# 240. Color Swatches

Do not expose selection only through color.

Swatch should also have:

```text
accessible label:
"Red"
```

---

# 241. Disabled Option

Size:

```text
L — Out of stock
```

must be understandable through text/assistive technology, not only lighter color.

---

# 242. Gallery

Image thumbnails/buttons require meaningful accessible labels.

---

# 243. Modal

Size Guide modal/drawer needs:

```text
focus management

keyboard close

proper semantics
```

---

# 244. Forms

Every Checkout input needs:

```text
label

error association

keyboard appropriate input mode
```

---

# 245. Phone Keyboard

Use suitable mobile input behavior for phone numbers.

---

# 246. Error Summary

On checkout failure:

```text
focus/scroll customer to error
```

rather than silently displaying red border outside viewport.

---

# 247. Loading State

Buttons such as:

```text
Place Order
```

should clearly indicate processing and prevent accidental repeated interaction.

Idempotency remains the true backend defense.

---

# 248. Skeletons

Use selectively.

Do not replace immediately server-renderable Product text with unnecessary skeleton interfaces.

---

# 249. Mobile Sticky Actions

PDP may use:

```text
Sticky Add to Cart / Buy area
```

if it improves purchase ergonomics.

Must not obscure core content/accessibility.

---

# 250. Mobile Filter UX

Listing filters can use:

```text
Drawer / Sheet
```

with:

```text
Apply

Clear

result count
```

---

# 251. Desktop Filter UX

Sidebar/top filters as appropriate.

Same underlying filter state.

---

# 252. Filter State Preservation

Customer opens Product then back:

```text
filters

sort

scroll/listing context
```

should ideally remain.

---

# 253. Loading More Products

Maintain sensible browser history behavior.

---

# 254. Empty Cart

Useful content:

```text
Your cart is empty

Continue Shopping
```

Potential recommendations later.

---

# 255. Checkout Mobile Layout

Primary focus:

```text
Customer Information

Delivery

Payment

Order Summary

Place Order
```

No unnecessary navigation clutter.

---

# 256. Checkout Header

Simplified checkout shell can reduce distraction.

---

# 257. Navigation Away Warning

If customer has typed checkout details, unnecessary accidental loss should be minimized.

But do not trap customers with aggressive browser dialogs without need.

---

# 258. Storefront Authentication Boundary

V1 public Storefront:

```text
anonymous browsing

guest cart

guest checkout
```

No customer login requirement.

---

# 259. Future Customer Authentication

Customer Account can later introduce:

```text
/login

/account/orders

/account/addresses
```

using separate Customer Account security architecture.

---

# 260. Never Share Internal Admin Authentication

Storefront/customer account sessions remain separate from:

```text
Internal Business Portal
```

as established by IAM architecture.

---

# 261. Public API Boundary

Storefront should consume APIs/read models explicitly safe for public exposure.

Do not expose Admin Product DTO then hide fields in frontend.

---

# 262. Storefront Product DTO

Example safe projection:

```text
ID/public identifier

Handle

Title

Description

Published Variants

Public Media

Customer Price

Availability

Size Guide

Review summary
```

No:

```text
Supplier cost

Landed cost

Internal SKU if business doesn't want public

Inventory ledger

Internal notes
```

---

# 263. Public Variant Data

May include:

```text
Variant ID/public selection ID

Option values

Price

Availability

Media context
```

---

# 264. Internal Warehouse Details

Do not expose:

```text
Warehouse A has 5
Warehouse B has 2
```

unless future store-location inventory feature intentionally requires it.

---

# 265. Storefront Security

Public Product reads:

```text
no authentication required
```

but only published/public content.

---

# 266. Public Mutations

Examples:

```text
Cart creation

Cart update

Checkout

Order placement

Payment submission

Review submission
```

require:

```text
validation

rate limiting

abuse protection

idempotency where applicable
```

---

# 267. Rate Limiting

Especially:

```text
Search abuse

Coupon brute force

Order creation

Payment TxnID submission

Review upload
```

---

# 268. Coupon Enumeration

Do not provide APIs that let attackers easily discover valid promotion codes.

---

# 269. Order Spam

Storefront must be prepared for fake COD order abuse.

V1 protections may include:

```text
rate limits

duplicate detection

customer history

manual confirmation
```

Future risk scoring can extend it.

---

# 270. Duplicate Order Warning/Detection

Order domain has duplicate-detection foundation.

Storefront idempotency handles technical duplicates.

Operational duplicate detection handles:

```text
customer intentionally/accidentally repeats checkout later.
```

---

# 271. Bot Protection

Can be adaptive.

Do not make every legitimate customer solve a CAPTCHA by default.

---

# 272. CSRF

If public Storefront uses cookie-backed mutation state, appropriate CSRF protection is required according to final session/API architecture.

---

# 273. XSS

Product descriptions, review content, CMS content, and structured rich content require safe rendering/sanitization policies.

Never blindly inject arbitrary HTML.

---

# 274. Rich Text

If Product description supports rich text:

```text
store structured/sanitized representation
```

rather than accepting arbitrary scripts.

---

# 275. Review Content

Customer-created review text must be escaped/safely rendered.

---

# 276. Theme Architecture

Themes control:

```text
Typography

Color

Spacing

Component arrangement

Visual treatments

Homepage presentation
```

---

# 277. Themes Do Not Control

Themes must not redefine:

```text
Inventory reservation

Pricing rules

Coupon eligibility

Order lifecycle

Payment validation
```

---

# 278. Theme Contract

Storefront components consume stable view models.

Example:

```text
ProductPageViewModel
```

rather than directly querying internal database tables.

---

# 279. Theme Swapping

Goal:

```text
Theme A
→ Theme B
```

without:

```text
data migration

Order rewrite

Catalog rewrite
```

---

# 280. V1 Theme Scope

One production theme.

But architecture separates:

```text
Storefront Application Services

Theme Components
```

from the beginning.

---

# 281. CMS Boundary

Future CMS owns:

```text
Homepage sections

Landing pages

Editorial pages

Banners

Content blocks
```

Storefront renders them.

---

# 282. V1 Homepage

V1 does not need full page builder.

Homepage can use configured structured sections such as:

```text
Hero

Featured Categories

Featured Collection

Products

Promo banner
```

---

# 283. Structured Homepage Configuration

Prefer:

```text
typed sections
```

over storing whole homepage as arbitrary HTML.

---

# 284. Future CMS Migration

Later CMS can take ownership of content composition without affecting:

```text
Product

Cart

Checkout

Orders
```

---

# 285. Promotional Banners

May link:

```text
Category

Collection

Product

URL
```

using Media Assets.

---

# 286. Announcement Bar

Simple Storefront setting:

```text
Free delivery over...
```

with activation state.

No full CMS needed.

---

# 287. Storefront Settings

Potential:

```text
Store Name

Logo

Favicon

Contact Information

Social Links

Navigation

Footer

Checkout Instructions

Delivery Copy

Theme Configuration

SEO Defaults
```

---

# 288. Settings Source

Settings domain remains authoritative.

Storefront consumes them.

---

# 289. Localization

Storefront architecture should support:

```text
locale

currency formatting

date formatting
```

without embedding Bangla/English assumptions throughout code.

---

# 290. V1 Language

Business may launch in:

```text
Bangla/English or chosen primary language
```

according to Product content readiness.

Architecture remains translation-ready.

---

# 291. Future Multilingual Catalog

Catalog content can later have:

```text
Title bn

Title en
```

without changing Product identity.

Storefront resolves active locale.

---

# 292. Locale in URL

Future:

```text
/bn/...

/en/...
```

or domain-based localization can be introduced.

No need to decide V1 unless multilingual launch requires it.

---

# 293. Number Formatting

Use centralized locale APIs.

---

# 294. Date Formatting

Order confirmation dates etc. use organization/storefront locale conventions.

---

# 295. Currency

Storefront transaction currency belongs to Pricing/Order context.

No hard-coded BDT business logic.

---

# 296. Stock Error Recovery

If checkout fails due to one unavailable Variant:

```text
preserve rest of cart

identify line

offer available alternatives
```

where possible.

---

# 297. Variant Alternative

Example:

```text
Red / M sold out

Red / L available
```

storefront may suggest L but must never switch customer's Size automatically.

---

# 298. Color Alternative

Same.

---

# 299. Technical Outage

If transactional backend unavailable:

```text
Browsing cached pages
```

may possibly remain available.

But Checkout/Order Placement must fail clearly rather than pretend to accept Orders.

---

# 300. Read-Only Degraded Mode

Future operational possibility:

```text
Storefront browse:
working

Checkout:
temporarily unavailable
```

with visible message.

---

# 301. Search Failure

If dedicated search later fails:

```text
Category/Product direct navigation
```

can remain operational.

Potential fallback:

```text
basic DB search
```

where architecture allows.

---

# 302. Media CDN Failure

Product data should still fail gracefully.

Potential fallback original/alternate delivery if infrastructure supports it.

No broken application crash from one missing image.

---

# 303. Broken Product Image

Media health should detect missing files.

Storefront can display fallback placeholder while internal alert is generated.

---

# 304. Price Service Failure

Do not display:

```text
৳0
```

because price could not load.

Use explicit unavailable/error state.

---

# 305. Availability Service Failure

Do not claim:

```text
In Stock
```

when availability cannot be verified.

Transactional Add/Checkout must fail safe.

---

# 306. Cart Service Failure

Do not clear local cart indicator permanently simply because one request failed.

Retry/recover.

---

# 307. Checkout Payment Failure

Manual payment method selection failure must not create a false Paid Order.

---

# 308. Order Placement Timeout

Idempotency enables:

```text
Retry safely
```

and/or:

```text
Check existing operation result.
```

---

# 309. Customer Identity Resolution Failure

If duplicate-resolution service cannot confidently match:

```text
creating a conservative new Customer
```

may be safer than linking to wrong person, provided Order creation remains valid.

Customer architecture handles duplicates later.

---

# 310. Storefront Observability

We need operational visibility into:

```text
Product page errors

Search failures

Cart errors

Checkout validation failures

Order placement failures

Payment initiation failures

Latency
```

---

# 311. Error Correlation

Checkout/customer error can have:

```text
Support Reference ID
```

to correlate internal logs without exposing stack traces.

---

# 312. Funnel Metrics

Useful:

```text
Product View

Add to Cart

Checkout Started

Order Placed
```

---

# 313. Funnel Metrics Definitions

Must define:

```text
unique session?

event count?

customer?

time window?
```

before calling metrics conversion rates.

---

# 314. Order Conversion

Do not include bot/test Orders unless reporting explicitly handles them.

---

# 315. Server Metrics

Track:

```text
PDP latency

Search latency

Cart mutation latency

Checkout placement latency

Error rate
```

---

# 316. Core Web Vitals

Performance monitoring should include customer-experience metrics rather than only server CPU. LCP and CLS are established Core Web Vitals metrics documented by web.dev.

---

# 317. Real User Monitoring

Preferred later:

collect real-user performance metrics for:

```text
Home

Category

PDP

Cart

Checkout
```

---

# 318. Test Environment

Storefront requires realistic testing of:

```text
mobile widths

slow network

out-of-stock races

price changes

payment failures

double submission
```

not only happy-path desktop browsing.

---

# 319. SEO Tests

Automated checks can validate:

```text
title

canonical

robots

structured data presence

published/unpublished visibility
```

---

# 320. Accessibility Tests

Automated accessibility testing plus manual keyboard/screen-reader-sensitive review for critical flows.

---

# 321. Checkout E2E Tests

Mandatory cases:

```text
COD success

Manual bKash order

Nagad order

Coupon success/failure

Out-of-stock race

Price changed

Double click

Invalid phone

Unavailable payment method

Server retry
```

---

# 322. Product E2E Tests

```text
Select Color

Gallery changes

Select Size

Unavailable combination disabled

Size Guide opens

Add to Cart
```

---

# 323. Search Tests

```text
Title

SKU if exposed/searchable

Color

Associated Color

Category

Tag

Occasion

No results

Filtering
```

---

# 324. Security Tests

Public Storefront should test:

```text
Unpublished Product access

Archived Variant access

Order ID enumeration

Coupon abuse

Cart ID guessing

Invalid quantities

Manipulated price

Manipulated discount

Manipulated payment method
```

---

# 325. Manipulated Quantity

Reject:

```text
-5

0

unreasonably large malformed values
```

according to domain validation.

---

# 326. Manipulated Variant

Customer cannot purchase:

```text
Draft Variant

Inactive Variant

Different Organization Variant
```

by posting its ID manually.

---

# 327. Manipulated Price

Ignored/rejected.

Server recalculates.

---

# 328. Manipulated Discount

Same.

---

# 329. Manipulated Delivery Price

Same.

---

# 330. Manipulated Payment Method

Server verifies method eligibility.

---

# 331. Storefront API Versioning

Internal/public commerce interfaces should evolve deliberately.

Because mobile/future clients may eventually consume them.

---

# 332. BFF / Storefront Application Layer

Recommended architectural layer:

```text
Storefront UI
      ↓
Storefront Application Services / BFF
      ↓
Domain APIs
```

---

# 333. Why BFF?

Prevents React components from understanding internal domain topology.

For example:

```text
getProductPage(handle)
```

can aggregate Catalog + Media + Inventory + Sizing cleanly.

---

# 334. BFF Does Not Duplicate Rules

It orchestrates.

It should not reimplement:

```text
Inventory available formula

Coupon eligibility

Payment validation
```

---

# 335. Storefront Queries

Conceptual:

```text
getHomePage()

getProductPage(handle, selection)

getCategoryPage(handle, filters)

getCollectionPage(handle, filters)

searchStorefront(query, filters)

getCart(cartId)

getCheckout(checkoutId)
```

---

# 336. Storefront Commands

Conceptual:

```text
createCart()

addCartLine()

updateCartLine()

removeCartLine()

applyCoupon()

startCheckout()

updateCheckoutContact()

updateCheckoutAddress()

selectDeliveryMethod()

selectPaymentMethod()

placeOrder()
```

---

# 337. Manual Payment Commands

After Order:

```text
submitManualPaymentReference()
```

routes to Payment domain.

---

# 338. API Responses

Return:

```text
customer-actionable state
```

not raw internal exceptions.

---

# 339. Example Stock Error

Internal:

```text
RESERVATION_CONFLICT
SKU ...
expected version ...
```

Public:

```text
One of the items in your cart is no longer available.
```

---

# 340. Structured Storefront Errors

Potential internal/public codes:

```text
CART_ITEM_UNAVAILABLE

CART_QUANTITY_UNAVAILABLE

PRODUCT_PRICE_CHANGED

COUPON_INVALID

COUPON_NO_LONGER_VALID

DELIVERY_METHOD_UNAVAILABLE

PAYMENT_METHOD_UNAVAILABLE

CHECKOUT_EXPIRED

ORDER_ALREADY_PLACED

ORDER_PLACEMENT_FAILED
```

---

# 341. Storefront Session

Separate from Customer authentication.

Can represent anonymous browsing state:

```text
Cart

Locale

recent checkout state
```

without pretending customer is authenticated.

---

# 342. Cookies

Keep only necessary identifiers/preferences in cookies.

Avoid storing entire Cart/Customer details in large client cookies.

---

# 343. Privacy

Do not put:

```text
Full phone

Address

Payment reference
```

into analytics URLs/query parameters.

---

# 344. Referrer Leakage

Sensitive checkout/order information should not be embedded into URLs that may leak through referrer headers.

---

# 345. Public Order Reference

Use safe random/opaque reference.

---

# 346. Cache and Customer Data

Never public-cache responses containing:

```text
Customer name

Address

Cart

Checkout

Order details
```

---

# 347. Cache-Key Safety

Public cached Product content must not accidentally vary by:

```text
Customer private context
```

unless cache strategy properly accounts for it.

---

# 348. Personalized Storefront Future

Future recommendations/account experiences can introduce personalization.

V1 should prioritize predictable cacheable public storefront.

---

# 349. Feature Flags

Risky storefront features can use controlled feature flags:

```text
new checkout

new search

new filter UI
```

Feature flags are deployment controls, not business permissions.

---

# 350. Rollback

New storefront frontend deployment should be rollbackable without database schema/data corruption.

Another reason themes should not own business logic.

---

# 351. Storefront Domain Events

Potential:

```text
cart.created

checkout.started

order.placement_requested
```

But durable business events primarily come from source domains such as:

```text
order.created

payment.received
```

---

# 352. Analytics Events Separate

Do not use analytics event stream as business transaction source.

---

# 353. Storefront Notification Boundary

Order/Payment domains trigger customer notifications.

Storefront may present resulting state.

---

# 354. V1 Home Page

Recommended production-ready content:

```text
Hero / campaign

Featured Categories

Featured Collection

New Products / Selected Products

Trust/Delivery information

Footer
```

without building a full page builder.

---

# 355. Product Recommendations

V1 can use simple manually configured:

```text
Related Products

Featured Products
```

if desired.

AI recommendations deferred.

---

# 356. Recently Viewed — Future/Optional

Can be client/session based.

No need for V1 core.

---

# 357. Wishlist

Future Customer/Account feature.

Not part of guest commerce V1.

---

# 358. Compare Products

Not necessary for Maevelle V1.

Architecture does not prohibit it.

---

# 359. Store Locator

Future Warehouse/public Location capability.

Not V1.

---

# 360. Pickup

Future Delivery/Location integration.

Not V1.

---

# 361. Backorder

Future Inventory/Order policy.

Storefront must not create its own pseudo-backorder.

---

# 362. Preorder

Same.

---

# 363. Product Subscription

Future Order model extension.

Not V1.

---

# 364. Bundles

Future Catalog/Inventory architecture.

Storefront can later render Bundle Product without changing core checkout interface.

---

# 365. Gift Card

Future Payment/Store Credit domain.

Not V1.

---

# 366. Customer Chat

Future Support domain.

Should mount into Storefront without becoming Order core.

---

# 367. PWA

Next.js currently supports web app manifest/PWA-oriented patterns, so installable/PWA enhancements are possible later, but they should not delay core mobile-web quality.

---

# 368. Native App Future

Because Storefront behavior sits behind API/application services:

```text
iOS

Android
```

can later reuse Catalog/Cart/Checkout capabilities.

---

# 369. Headless Future

The storefront is effectively built with a headless-ready boundary even if frontend/backend live in one modular repository.

---

# 370. One Deployment Initially

Headless/API-first architecture does not require:

```text
separate frontend server

separate backend microservice
```

in V1.

Modular monolith deployment remains valid.

---

# 371. Route Performance

Home, Category, and PDP should avoid unnecessary blocking calls.

Aggregate Storefront read models where needed.

---

# 372. Query Shape

Avoid N+1 patterns such as:

```text
50 Product cards
→ 50 availability queries
→ 50 media queries
```

Use batch/projection queries.

---

# 373. Product Listing Projection

Precompute/read efficiently:

```text
Price summary

Primary Media

Availability summary

Rating summary
```

---

# 374. Projection Rebuild

If listing projection becomes inconsistent:

```text
rebuild from authoritative domains.
```

---

# 375. Search Projection

Same principle.

---

# 376. Storefront Read Model Freshness

Different fields can tolerate different freshness:

```text
Description:
seconds/minutes

Stock card:
very short

Checkout:
authoritative now
```

---

# 377. Storefront Admin Preview

Strongly preferred:

Admin can preview:

```text
Draft Product

Unpublished Product
```

using secure preview token/session.

---

# 378. Preview Must Not Publish

Preview access should not change Product publication state.

---

# 379. Preview Security

Preview URL/token should be:

```text
authenticated or signed

time-limited where appropriate
```

not a permanent public hidden link.

---

# 380. Preview Search Engines

Preview responses should not be indexable.

---

# 381. Theme Preview Future

Can preview future theme against production Catalog safely.

---

# 382. Maintenance Mode

Storefront may support:

```text
Checkout disabled

Entire storefront maintenance
```

through operational settings.

---

# 383. Checkout Disable

Useful during serious operational incident.

Browsing remains possible.

---

# 384. Payment Method Emergency Disable

Payment admin can quickly disable:

```text
bKash
```

if merchant account issue occurs.

Storefront reflects configuration.

---

# 385. Delivery Emergency Disable

Similar future capability.

---

# 386. Storefront Health

Operational dashboard should detect:

```text
No active payment method

No eligible fulfillment Location

Navigation broken link

Published Product with no sellable Variant

Published Product with missing primary image

Checkout error spike
```

---

# 387. Publication Quality Warnings

Catalog admin may warn:

```text
Published Product has no media

No price

No available Variant

Missing SEO description
```

Some may block publication depending on policy.

---

# 388. Availability Does Not Block Publication

A legitimate Product can be published Out of Stock.

---

# 389. Missing Price

A normal purchasable physical Product should not publish as purchasable without valid price.

Exact Catalog publication guard.

---

# 390. Storefront Product Status

Customer-facing state might derive:

```text
AVAILABLE

OUT_OF_STOCK

COMING_SOON future

UNAVAILABLE
```

without storing another Product status.

---

# 391. Product Card Badge

Badges can derive:

```text
New

Sale

Out of Stock
```

or configured merchandising labels.

---

# 392. "New" Definition

Must be explicit:

```text
Published within last X days
```

or manual badge.

Do not leave ambiguous.

---

# 393. "Best Seller"

Should be derived from qualifying sales metrics once Analytics supports it.

Do not manually call arbitrary Products best sellers unless intentionally merchandising copy.

---

# 394. Storefront Information Architecture

Suggested:

```text
Home
├── Categories
│    └── Products
├── Collections
│    └── Products
├── Search
└── Product
      ↓
     Cart
      ↓
   Checkout
      ↓
     Order
```

---

# 395. Minimal Customer Cognitive Load

Backend complexity:

```text
variants

inventory locations

reservations

payment intents

customer matching
```

must not be exposed unnecessarily.

Customer experience remains:

```text
Choose Product

Choose Color

Choose Size

Add

Enter Details

Choose Payment

Place Order
```

---

# 396. Storefront Invariant Principle

Storefront can simplify presentation.

It cannot simplify away business correctness.

---

# 397. Important Invariants

### STO-INV-001

Only Products eligible for public publication are exposed through normal Storefront Product queries.

### STO-INV-002

Inactive/archived Variants cannot be purchased through manipulated Storefront requests.

### STO-INV-003

Storefront never owns authoritative Product, Price, Inventory, Payment, Customer, or Order state.

### STO-INV-004

Business-domain IDs submitted by clients are always revalidated server-side.

### STO-INV-005

Product price accepted in an Order is calculated authoritatively on the server.

### STO-INV-006

Client-submitted price values cannot determine Order totals.

### STO-INV-007

Promotion/coupon eligibility is revalidated during final Order placement.

### STO-INV-008

Cart does not guarantee Inventory.

### STO-INV-009

Cart does not normally reserve Inventory in V1.

### STO-INV-010

Final Order placement performs authoritative Inventory validation/reservation.

### STO-INV-011

Two customers cannot successfully secure the same final no-oversell unit.

### STO-INV-012

Failed inventory reservation cannot result in a normal successful Order confirmation.

### STO-INV-013

Order placement is idempotent.

### STO-INV-014

Network retry after successful placement cannot create a duplicate Order for the same placement operation.

### STO-INV-015

Checkout failure should preserve recoverable customer/cart state.

### STO-INV-016

Customer identity matching uses Customer domain rules rather than Storefront-specific phone equality.

### STO-INV-017

Manual payment submission remains unverified until Payment domain verifies it.

### STO-INV-018

Public Storefront APIs never expose internal supplier, landed-cost, private financial, or access-control data.

### STO-INV-019

Public Order retrieval cannot rely on guessable sequential identifiers alone.

### STO-INV-020

Search/cache projections cannot expose unpublished resources simply because projection data is stale.

### STO-INV-021

Public availability projection is never final transactional authority.

### STO-INV-022

Incoming stock is not normal in-stock availability unless explicit preorder/backorder policy exists.

### STO-INV-023

Theme code cannot bypass domain validation.

### STO-INV-024

Changing Theme does not require transactional commerce-data migration.

### STO-INV-025

Private customer/checkout/order data is never stored in public shared caches.

### STO-INV-026

Storefront structured data must correspond to actual customer-visible Product information.

### STO-INV-027

Storefront Product media uses public-authorized Media Assets only.

### STO-INV-028

Customer-entered content is rendered safely and cannot inject executable storefront code.

### STO-INV-029

Analytics failure cannot prevent a valid commerce transaction.

### STO-INV-030

Transactional backend failure must never result in a false Order-success response.

---

# 398. V1 Mandatory Scope

Maevelle V1 Storefront should include:

```text
✓ Public Storefront

✓ Mobile-first responsive UI

✓ Home Page

✓ Navigation

✓ Header

✓ Mobile Navigation

✓ Footer

✓ Categories

✓ Nested Category Browsing

✓ Collections

✓ Product Listings

✓ Product Cards

✓ Sorting

✓ Pagination / Load More

✓ Search

✓ Structured Search Projection

✓ Faceted Filtering

✓ Availability Filter

✓ Price Filter

✓ Color Filter

✓ Size Filter

✓ Product Type / relevant Attribute Filters

✓ Product Detail Page

✓ Product Gallery

✓ Color-based Gallery Switching

✓ Variant Media Fallback

✓ Product Title

✓ Description

✓ Structured Product Information

✓ FAQs

✓ Variant Selection

✓ Generic Product Options

✓ Color Swatches

✓ Size Buttons

✓ Invalid Combination Handling

✓ Out-of-Stock Variant Handling

✓ Size Guide

✓ Measurement Unit Presentation

✓ Current Price

✓ Variant Price Range

✓ Availability

✓ Quantity Selector

✓ Add to Cart

✓ Buy Now optional/preferred

✓ Guest Cart

✓ Server-backed Cart

✓ Cart Updates

✓ Cart Removal

✓ Cart Stock Revalidation

✓ Price Change Handling

✓ Guest Checkout

✓ Name

✓ Phone

✓ Address

✓ Optional Email

✓ Customer Note

✓ Delivery Method

✓ Delivery Charge

✓ COD

✓ Manual bKash

✓ Manual Nagad

✓ Coupon Entry

✓ Checkout Summary

✓ Server-Side Price Calculation

✓ Server-Side Promotion Calculation

✓ Server-Side Availability Validation

✓ Customer Identity Resolution Integration

✓ Order Creation

✓ Inventory Reservation

✓ Payment Intent Creation

✓ Idempotent Place Order

✓ Order Confirmation

✓ Manual Payment Reference Submission

✓ Breadcrumbs

✓ SEO Metadata

✓ Canonical URLs

✓ Product Structured Data

✓ Product Variant Structured Data

✓ Open Graph / Social Metadata

✓ Sitemap

✓ Robots Controls

✓ Image Optimization

✓ Responsive Images

✓ LCP Image Prioritization

✓ Lazy Loading for non-critical Media

✓ Accessibility

✓ Safe Errors

✓ Storefront Rate Limiting

✓ Security Validation

✓ Performance Monitoring Foundation
```

---

# 399. Strongly Preferred V1

```text
Predictive Search

Dynamic Relevant Filters

Search Typo Tolerance where practical

Quick/Sticky Mobile Add-to-Cart

Product Admin Preview

Category SEO

Collection SEO

Old Handle Redirects

Duplicate Order Detection

Storefront Health Checks

Basic Homepage Structured Sections

Payment Method Emergency Disable

Checkout Maintenance Mode

Real User Performance Monitoring

Analytics Commerce Events

Review Display

Rating Summary

Review Images

Related Products/manual recommendations
```

---

# 400. Foundation Now / Later

Architecture should prepare for:

```text
Customer Accounts

Persistent Cart

Wishlist

Customer Order Tracking

Multiple Themes

Full CMS

Multilingual Storefront

Multiple Currencies

International Pricing

Courier Integrations

Pickup

Store Locator

Preorders

Backorders

Bundles

Gift Cards

Store Credit

Loyalty

Marketing Automation

Personalization

Native Mobile App

Public Commerce API

Marketplace Channels
```

---

# 401. Deferred Advanced Capabilities

Post-V1:

```text
Advanced Recommendations

AI Search

Semantic Search

Visual Search

Dynamic Personalization

Advanced Merchandising Rules

A/B Testing Platform

Customer Account Portal

Wishlist Sync

Saved Payment Methods

One-Click Checkout

Preorders

Backorders

Store Pickup

Multiple Storefronts

Advanced Internationalization

Advanced Tax Calculation

Subscription Commerce

Progressive Web App enhancements

Native Mobile Applications

Advanced CMS/Page Builder
```

---

# 402. Decisions Established

### Decision STO-001

**Storefront is an orchestration/presentation domain, not the source of Product/Inventory/Order truth.**

### Decision STO-002

**The storefront is API-first/headless-ready even when initially deployed in the same modular application.**

### Decision STO-003

**V1 is guest-checkout-first.**

### Decision STO-004

**Customer Account is not required to purchase.**

### Decision STO-005

**Product browsing is optimized primarily for mobile customer behavior.**

### Decision STO-006

**Categories and Collections remain distinct storefront concepts.**

### Decision STO-007

**Search and faceted filtering are separate capabilities.**

### Decision STO-008

**Filters derive from structured Catalog/Variant data.**

### Decision STO-009

**Color search uses canonical/associated colors while Product selection uses actual Variant-defining color values.**

### Decision STO-010

**Storefront option selection is generic, with specialized Color/Size presentation layered on top.**

### Decision STO-011

**Impossible Variant combinations and existing-but-out-of-stock Variants are different states.**

### Decision STO-012

**Media gallery resolution follows Catalog/Media precedence rather than copying files between Variants.**

### Decision STO-013

**Size Guides are rendered from the independent Sizing domain.**

### Decision STO-014

**Server-backed Guest Cart is preferred over browser-only commerce state.**

### Decision STO-015

**Adding to Cart does not reserve Inventory.**

### Decision STO-016

**Prices, Promotions, Delivery charges, and Inventory are all revalidated during Checkout.**

### Decision STO-017

**Client-submitted monetary values are never authoritative.**

### Decision STO-018

**Storefront Order placement is idempotent.**

### Decision STO-019

**Successful Order placement should secure required Inventory under V1 no-oversell policy.**

### Decision STO-020

**Manual bKash/Nagad V1 should normally create the Order before customer payment-reference submission, giving payment evidence a stable Order context.**

### Decision STO-021

**Public Order lookup uses secure public identity/verification rather than enumerable internal IDs.**

### Decision STO-022

**SEO/Product structured data is generated from authoritative commerce data.**

### Decision STO-023

**Themes control presentation, not commerce rules.**

### Decision STO-024

**V1 ships one production Theme while keeping the theme layer replaceable.**

### Decision STO-025

**V1 Home Page uses typed/configurable sections rather than requiring a full CMS.**

### Decision STO-026

**Storefront caching is data-class-specific rather than one global policy.**

### Decision STO-027

**Cached availability is never final reservation authority.**

### Decision STO-028

**Storefront architecture favors server rendering for initial commerce content and small interactive client boundaries.**

### Decision STO-029

**Media delivery uses responsive/optimized Assets while preserving high-quality PDP imagery.**

### Decision STO-030

**Storefront failure must degrade safely and never fabricate transactional success.**

---

# 403. Resulting Storefront Architecture

The read path:

```text
                         CUSTOMER
                            │
                            ▼
                       STOREFRONT
                            │
          ┌─────────────────┼───────────────────┐
          │                 │                   │
          ▼                 ▼                   ▼
       Catalog            Media              Search
          │                 │                   │
          ▼                 ▼                   ▼
       Product           Gallery             Results
          │
          ├── Pricing
          ├── Sizing
          ├── Reviews
          └── Availability Projection
```

Purchase path:

```text
Product
   ↓
Variant
   ↓
Cart
   ↓
Checkout
   ↓
┌──────────────────────────────┐
│ Revalidate                   │
│                              │
│ Product                      │
│ Price                        │
│ Promotion                    │
│ Delivery                     │
│ Payment Method               │
│ Inventory                    │
│ Customer Data                │
└──────────────────────────────┘
   ↓
Customer Resolution
   ↓
Order
   ↓
Inventory Reservation
   ↓
Payment Intent
   ↓
Confirmation
```

---

# 404. Customer Experience Result

All the complexity we have designed underneath:

```text
Inventory ledger

Reservations

Multi-location stock

Variant architecture

Sizing systems

Payment intents

Customer duplicate matching

Permission systems

Media renditions
```

ultimately becomes something much simpler for the customer:

```text
See Product

Choose Color

Choose Size

See Price

Add to Cart

Enter Phone + Address

Choose Payment

Place Order
```

That is exactly what the architecture should accomplish:

> **Complex underneath, simple at the surface.**

---

# 405. Architecture Milestone

We now have almost the entire production commerce loop designed:

```text
DISCOVERY
   ↓
Storefront
   ↓
Catalog
   ↓
Variant
   ↓
Cart
   ↓
Checkout
   ↓
Customer
   ↓
Order
   ↓
Payment
   ↓
Inventory Reservation
   ↓
Fulfillment
```

and the acquisition side:

```text
Supplier
   ↓
Purchase
   ↓
Shipment
   ↓
Landed Cost
   ↓
Receiving
   ↓
Inventory
```

with cross-cutting:

```text
Media

Finance

Access Control
```

---

# 406. Recommended Next Domain

The next source-of-truth document should be:

```text
docs/domains/reviews/reviews-architecture.md
```

I recommend doing **Reviews & Ratings next**, rather than jumping immediately to the database schema.

We still need to formalize:

```text
Rating

Review

Review Customer Identity

Verified Purchase

Which Order/Order Line qualifies

One Review per Product/order?

Variant relationship

Review Title

Review Body

Review Images

Review Moderation

Pending

Published

Rejected

Hidden

Reported Review

Admin Reply

Customer Editing

Customer Deletion/privacy

Rating Aggregation

Review Count

Average Rating

Image Moderation

Spam Protection

Abuse

Duplicate Review

Review Request foundation

Search/SEO relationship

Permissions

Audit

Analytics
```

This matters because Product pages already depend on:

```text
Stars

Average Rating

Comments

Review Images
```

and we should not implement those as:

```text
product.rating = 4.7

product.review_count = 152
```

with an undefined source.

The proper model should instead become:

```text
ORDER
  ↓
ORDER LINE
  ↓
CUSTOMER
  ↓
REVIEW
  ↓
MODERATION
  ↓
PUBLISHED REVIEW
  ↓
RATING PROJECTION
  ↓
PRODUCT PDP
```

After Reviews, I recommend we design **Promotions & Coupons**, then **Notifications**, **Analytics/Reporting**, and **Settings/Localization**. At that point the remaining business-domain map will be sufficiently complete to move into cross-domain technical architecture, API contracts, schema design, failure/stress-test documentation, and ultimately implementation planning.

---

**End of Storefront Commerce Architecture v0.1**
