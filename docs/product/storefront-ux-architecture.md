# Maevelle Ecommerce — Storefront UX Architecture

**Document:** `docs/product/storefront-ux-architecture.md`
**Status:** Product / UX Architecture — Living Document
**Version:** 0.1
**Primary UI Stack:** Next.js + React
**Related:** Storefront Commerce, Catalog, Pricing, Promotions, Inventory, Sizing, Media, Reviews, Customers, Orders, Payments, Delivery, Geography, SEO, API/OpenAPI

---

# 1. Purpose

The Storefront is Maevelle's public commerce experience.

Its job is to make:

```text
discovering
evaluating
selecting
ordering
paying
tracking
```

as fast and understandable as possible.

It must simultaneously preserve the correctness established by the domain architecture.

Therefore:

> **The Storefront optimizes for customer confidence and purchase speed, while the server remains authoritative for price, promotion, stock, delivery, payment, and Order creation.**

---

# 2. Primary UX Goals

The Storefront should maximize:

```text
Product discovery

Purchase confidence

Checkout completion

Mobile usability

Perceived speed

Trust

Repeat usability
```

while minimizing:

```text
unnecessary fields

unnecessary page transitions

confusing option selection

pricing surprises

delivery uncertainty

payment uncertainty

dead ends
```

---

# 3. Core Rule

The browser may display:

```text
Price

Availability

Promotion

Delivery estimate

Cart total
```

but it does not own those values.

Final authority remains:

```text
Server
→ Pricing
→ Promotions
→ Inventory
→ Delivery
→ Orders
```

---

# 4. Storefront Is an Orchestration Surface

Storefront does not own:

```text
Catalog truth

Inventory truth

Promotion truth

Order truth

Payment truth

Delivery truth
```

It orchestrates customer-facing representations of those domains.

---

# 5. Customer Journey

Canonical journey:

```text
LAND
  ↓
DISCOVER
  ↓
PRODUCT
  ↓
SELECT VARIANT
  ↓
ADD TO CART
  ↓
CART
  ↓
CHECKOUT
  ↓
ADDRESS
  ↓
DELIVERY
  ↓
PAYMENT
  ↓
REVIEW TOTAL
  ↓
PLACE ORDER
  ↓
PAYMENT ACTION if required
  ↓
CONFIRMATION
  ↓
TRACKING
```

Not every customer must pass through every page.

---

# 6. Mobile First

Primary Storefront design target:

```text
mobile browser
```

Desktop receives a richer layout, not a completely separate interaction model.

---

# 7. Mobile Principles

Prioritize:

```text
thumb reach

large tap targets

short forms

sticky purchase actions

fast image browsing

clear back navigation

minimal overlays

minimal typing
```

---

# 8. Desktop Principles

Desktop should use additional space for:

```text
larger gallery

persistent purchase panel

richer filtering

comparison context

expanded navigation
```

without creating different commercial behavior.

---

# 9. Storefront Route Architecture

Recommended:

```text
/
 /search

 /categories/:handle
 /collections/:handle

 /products/:handle

 /cart
 /checkout

 /order/:publicReference
 /track

 /reviews/submit/:secureReference
```

Future:

```text
/account
/account/orders
/account/addresses
/account/reviews
```

---

# 10. Stable Product URLs

Canonical:

```text
/products/:handle
```

Handle should remain human-readable and SEO-friendly.

---

# 11. Handle Changes

If Product handle changes:

```text
old handle
→ permanent redirect
→ current handle
```

Store redirects in Catalog/SEO infrastructure.

---

# 12. Navigation

Primary navigation should reflect merchandising, not database structure.

Potential desktop structure:

```text
New Arrivals

Categories

Collections

Occasions

Best Sellers

Offers
```

Exact sections remain business-configurable.

---

# 13. Navigation ≠ Category Tree

Navigation may link to:

```text
Category

Collection

Search page

Campaign page

Static page
```

without changing taxonomy.

---

# 14. Mobile Navigation

Use compact menu with:

```text
primary destinations

nested categories

account future

order tracking

support/contact
```

Avoid deeply nested accordion complexity where possible.

---

# 15. Header

Recommended:

```text
Logo

Navigation

Search

Cart

Account future
```

Mobile:

```text
Menu
Logo
Search
Cart
```

---

# 16. Search Must Be Prominent

Search should be discoverable from every page.

Especially important for mobile returning customers.

---

# 17. Search Experience

Search across:

```text
Product title

Description

SKU where appropriate

Categories

Collections

Tags

Occasions

Attributes

Primary colors

Associated searchable colors

Synonyms
```

as established previously.

---

# 18. Search Suggestions

As customer types, suggestions can show:

```text
Products

Categories

Collections

Search suggestions
```

---

# 19. Search Suggestion Example

```text
"hat"

Products
Summer Beach Hat
Wide Brim Sun Hat

Categories
Women's Hats

Search for "hat"
```

---

# 20. Search Does Not Need Exact Typing

Support:

```text
prefix

minor typo tolerance

synonyms

color aliases
```

through Search architecture.

---

# 21. Empty Search

If no results:

```text
No exact results for "..."
```

then offer:

```text
similar Products

related Categories

clear filters
```

Do not produce a dead page.

---

# 22. Search Projection Is Not Purchase Authority

Search may display cached:

```text
price

availability

promotion badge
```

but Product/Checkout revalidate canonical data.

---

# 23. Category Pages

Category page should contain:

```text
Category title

Optional description

Breadcrumbs

Optional subcategories

Filters

Sort

Product grid
```

---

# 24. Collection Pages

Collection is merchandising.

Examples:

```text
Eid Collection

Beach Essentials

New This Week
```

Collection UX may be more editorial than Category.

---

# 25. Category vs Collection

Never present them as if they are identical concepts internally.

Customer does not need to know the architectural difference.

---

# 26. Product Grid

Each Product Card should normally show:

```text
Primary image

Title

Current price

Compare-at price if valid

Promotion badge if useful

Color preview where useful

Availability signal
```

---

# 27. Product Card Should Not Be Overloaded

Avoid displaying:

```text
full description

all sizes

all warehouse information

long rating histogram
```

inside grid.

---

# 28. Product Card Quick Add

Use only when Product selection is unambiguous.

Example single-variant Product:

```text
[Add]
```

Multi-option Product:

```text
[Choose options]
```

Do not guess Size/Color.

---

# 29. Product Image Hover

Desktop may show:

```text
second image
```

on hover.

Mobile should not depend on hover.

---

# 30. Product Card Price

If all sellable Variants have one price:

```text
৳850
```

If prices vary:

```text
From ৳850
```

---

# 31. Compare-at Price

Display only if meaningful:

```text
Compare-at > current selling price.
```

---

# 32. Promotion Badge

Examples:

```text
10% Off

Free Delivery

Eid Offer
```

But do not overwhelm cards with multiple badges.

---

# 33. Filter Architecture

Filters derive from:

```text
Category

Product Type

Attributes

Color

Size

Price

Availability
```

where relevant.

---

# 34. Contextual Filters

Do not show:

```text
shoe size
```

inside Hat Category if irrelevant.

Filter availability should derive from current result context.

---

# 35. Mobile Filters

Use full-height drawer/sheet.

Include:

```text
selected filter count

clear all

result count

apply
```

---

# 36. Desktop Filters

Sidebar or horizontal controls depending category density.

---

# 37. Sort

V1 recommended:

```text
Featured

Newest

Price: Low to High

Price: High to Low
```

Potential:

```text
Best Selling
```

once analytics quality supports it.

---

# 38. "Featured" Requires Definition

Featured ordering may come from:

```text
Collection merchandising order

Category merchandising rules

manual priority
```

not random database ordering.

---

# 39. Breadcrumbs

Example:

```text
Home
/
Women
/
Accessories
/
Summer Beach Hat
```

Breadcrumbs support:

```text
navigation

SEO

orientation
```

---

# 40. Product Detail Page — Core Purpose

PDP must answer immediately:

```text
What is this?

What does it look like?

How much is it?

Which option do I want?

Is it available?

Will it fit?

Can I trust it?

How do I order it?
```

---

# 41. PDP Desktop Layout

Recommended:

```text
┌─────────────────────┬─────────────────────┐
│                     │ Title               │
│     Media Gallery   │ Rating              │
│                     │ Price               │
│                     │ Promotion           │
│                     │ Color               │
│                     │ Size                │
│                     │ Availability        │
│                     │ Quantity            │
│                     │ Add to Cart         │
│                     │ Buy Now             │
└─────────────────────┴─────────────────────┘
```

Below:

```text
Product information

Size information

Delivery/returns summary

Reviews

FAQ
```

---

# 42. PDP Mobile Layout

Recommended order:

```text
Gallery

Title

Rating

Price

Promotion

Color

Size

Availability

Quantity

Purchase actions

Key information

Description

Size guide

Reviews

FAQ
```

---

# 43. Sticky Mobile Purchase Bar

Strongly preferred after scrolling.

Could show:

```text
৳850
[Add to Cart]
```

or:

```text
[Select Size]
```

if incomplete selection.

---

# 44. Media Gallery

Supports:

```text
Images

Variant-specific images

Zoom

Swipe

Thumbnail navigation

Video future
```

---

# 45. Color Selection Changes Gallery

When customer selects:

```text
Red
```

gallery should switch to relevant Red media where configured.

---

# 46. Variant Media Fallback

Resolution order:

```text
Variant media
→ Product media
```

Never show empty gallery because one Variant lacks media.

---

# 47. Image Performance

Use:

```text
responsive image sizes

modern optimized formats

lazy loading below initial gallery

preload primary hero
```

through Media renditions.

---

# 48. Product Title

Keep prominent but not excessively large on mobile.

---

# 49. Rating

Example:

```text
★ 4.7 (38)
```

click/anchor opens Review section.

Rating derives from Review Summary projection.

---

# 50. Rating Missing

Do not fake:

```text
5.0
```

when no Reviews.

Show:

```text
No reviews yet
```

or omit rating.

---

# 51. Price Display

Use canonical customer-facing Pricing result.

Potential:

```text
৳850
৳1,000
15% off
```

---

# 52. Price Changes by Variant

Selecting Variant may update:

```text
Price

Compare-at

Availability

Media
```

without full page reload.

---

# 53. Option Architecture

UI receives generic:

```text
Product Options
```

but can specialize known semantics:

```text
COLOR

SIZE
```

for better experience.

---

# 54. Color Option

Display:

```text
swatch
+
human-readable label
```

Do not rely only on swatch color.

---

# 55. Search Color vs Display Color

Customer PDP uses:

```text
display/canonical color
```

Associated searchable colors remain Search behavior.

---

# 56. Color Swatch Image

For patterns/mixed materials, support:

```text
image swatch
```

future-ready.

---

# 57. Selected Color

Show:

```text
Color: Beige
```

not merely a highlighted circle.

---

# 58. Size Option

Display buttons:

```text
S
M
L
XL
```

or domain-appropriate size labels.

---

# 59. Unavailable Size

If impossible combination:

```text
do not make it selectable.
```

If valid Variant but out of stock:

```text
display disabled/out-of-stock state.
```

These are different.

---

# 60. Impossible Combination

Example:

```text
Red + XXL
```

does not correspond to a Variant.

UI can hide/disable it as:

```text
Unavailable combination.
```

---

# 61. Out-of-Stock Combination

Variant exists but available quantity is zero.

Display:

```text
Out of stock
```

---

# 62. Variant Selection Algorithm

Customer selection should resolve:

```text
selected option values
→ exact Variant
```

No browser-created pseudo-Variant.

---

# 63. Deep-Link Selected Variant

Optional query parameter:

```text
?variant=...
```

can preserve selected Variant.

Canonical SEO Product URL stays Product-level.

---

# 64. Size Guide

Accessible beside Size selector:

```text
Size Guide
```

opens:

```text
drawer/modal
```

on mobile and desktop.

---

# 65. Size Guide Must Be Product Appropriate

Use Product's configured published Size Guide revision.

---

# 66. Size Guide Content

May contain:

```text
measurements

units

instructions

diagram

conversion information
```

---

# 67. Body vs Garment Measurement

Label explicitly.

Example:

```text
Body Bust

Garment Length
```

Do not make Customer infer.

---

# 68. Unit Switching

If Guide supports:

```text
cm
in
```

switching can happen in UI using authoritative conversion data.

---

# 69. Purchase Action Eligibility

Add to Cart only if:

```text
all required Options selected

Variant valid

Product sellable

requested quantity valid
```

---

# 70. Stock Display

Avoid exposing exact warehouse inventory unnecessarily.

Customer-friendly:

```text
In stock

Low stock
Out of stock
```

Exact counts only if merchandising policy deliberately allows.

---

# 71. Scarcity Claims

Never fabricate:

```text
Only 2 left!
```

unless backed by real sellable availability and approved presentation policy.

---

# 72. Quantity Selector

Default:

```text
1
```

with:

```text
− 1 +
```

or accessible stepper.

---

# 73. Max Quantity

Client can restrict from latest availability/policy, but final server validation remains authoritative.

---

# 74. Add to Cart

On success:

```text
cart state updates

mini-cart/drawer opens or concise confirmation appears
```

Avoid forcing immediate navigation to Cart.

---

# 75. Buy Now

Optional:

```text
Buy Now
```

means:

```text
Add selected Variant
→ proceed to Checkout
```

It does not bypass Cart/Checkout server logic.

---

# 76. Buy Now Cart Semantics

Do not accidentally destroy existing Cart.

Recommended:

```text
same Cart
+
selected item
→ Checkout
```

unless separate instant checkout semantics are deliberately designed.

---

# 77. Product Information

Use structured sections from Catalog:

```text
Materials

Dimensions

Care

Origin

Included Items

Other key/value groups
```

---

# 78. Product Description

Readable content.

Avoid huge wall of text above purchase controls.

---

# 79. FAQ

Product FAQs appear as accordion below primary commerce content.

---

# 80. Sharing

Native Web Share where supported.

Fallback:

```text
Copy link
```

Metadata supplied via SEO/Open Graph.

---

# 81. Reviews Section

Show:

```text
Average

Count

Rating histogram

Verified purchase indication

Media review filter

Review list
```

---

# 82. Verified Purchase

Label derives from trusted Order relationship.

Customer cannot choose it.

---

# 83. Review Sort

V1:

```text
Most Recent

Highest Rating

Lowest Rating
```

Potential:

```text
Most Helpful
```

later when helpful-vote architecture exists.

---

# 84. Review Filter

Potential:

```text
Rating

With Photos

Verified Purchase
```

---

# 85. Merchant Response

Display below Review clearly identified as:

```text
Maevelle response
```

---

# 86. Cart Architecture

Cart remains:

```text
server-backed
guest-capable
non-authoritative
no inventory reservation
```

---

# 87. Cart Persistence

Guest receives secure opaque Cart/session credential.

Cart can survive:

```text
page navigation

browser refresh

reasonable return visit
```

according to expiry policy.

---

# 88. Cart Line

Show:

```text
Product image

Title

Selected Options

Unit price

Quantity

Line subtotal

Availability issue if any
```

---

# 89. Cart Recalculation

Whenever Cart loads/changes, server recalculates current:

```text
Price

Promotion

Availability
```

---

# 90. Price Changed in Cart

Example:

```text
Price changed from ৳850 to ৳900.
```

Make change visible.

Do not silently show a different total without explanation where practical.

---

# 91. Promotion Removed

Example:

```text
Your EID10 discount is no longer available.
```

---

# 92. Out-of-Stock Cart Item

Keep line visible with:

```text
Out of stock
```

and prevent Checkout until removed/changed.

Do not silently delete it.

---

# 93. Invalid Variant

If Variant archived after adding:

```text
This option is no longer available.
```

---

# 94. Cart Coupon

Coupon field:

```text
Promo code
[Apply]
```

---

# 95. Coupon Feedback

Success:

```text
EID10 applied — ৳150 off
```

Failure should be specific but safe:

```text
This code is not valid for your cart.
```

or:

```text
This code has expired.
```

where disclosure is appropriate.

---

# 96. Auto Promotions

Automatically applied Promotions appear without requiring code.

---

# 97. Discount Breakdown

Cart/Checkout should make discounts understandable.

Example:

```text
Merchandise        ৳1,800
Eid discount       -৳180
Delivery             ৳80
Free delivery        -৳80
Total               ৳1,620
```

---

# 98. Mini-Cart

Useful on desktop/mobile drawer.

Shows:

```text
items

total

Checkout

View Cart
```

---

# 99. Cart Empty State

Provide:

```text
Continue shopping
```

and potentially curated suggestions.

---

# 100. Checkout Philosophy

Checkout should be:

```text
short
linear
transparent
guest-first
```

---

# 101. Guest Checkout

No account required V1.

Do not interrupt checkout with:

```text
Create an account first.
```

---

# 102. Checkout Structure

Recommended single-page progressive flow:

```text
CONTACT

DELIVERY ADDRESS

DELIVERY METHOD

PAYMENT

ORDER SUMMARY

PLACE ORDER
```

---

# 103. Why Single Page?

For Maevelle's initial straightforward commerce model:

```text
less navigation

lower abandonment

easier mobile completion
```

than a long multi-page wizard.

---

# 104. Progressive Sections

Each section can unlock/validate as information becomes sufficient.

---

# 105. Checkout Contact

Required V1:

```text
Name

Phone
```

Optional:

```text
Email
```

depending communication requirements.

---

# 106. Phone Input

Optimize for Bangladesh.

Support:

```text
local phone formatting
```

while server preserves normalized contact representation.

---

# 107. Address UX

Use Geography architecture.

Recommended:

```text
District

Area / Thana / Upazila / Locality search

Detailed Address

Landmark optional
```

---

# 108. Area Search

Customer types:

```text
Mirpur
```

and receives disambiguated choices.

---

# 109. No Courier IDs

Customer never sees:

```text
Pathao Area ID 132
```

---

# 110. Unmapped Address

If customer location can be preserved but automated courier mapping is unavailable:

Possible UX:

```text
Delivery to this area needs confirmation.
```

according to serviceability policy.

---

# 111. Address Error

Avoid generic:

```text
Invalid address.
```

Prefer:

```text
Please select your area.
```

or:

```text
We currently can't confirm delivery to this location.
```

---

# 112. Delivery Options

Checkout displays customer-facing methods such as:

```text
Standard Delivery
৳80
Estimated 2–3 days
```

If only one valid method:

```text
preselect it.
```

---

# 113. Courier Provider Selection

Normally hidden operationally.

Customer selects service level, not courier company.

---

# 114. Delivery Estimate

Use:

```text
Estimated
```

language unless contractual guarantee exists.

---

# 115. Delivery Price

Comes from Pricing calculation.

---

# 116. Free Delivery

Show:

```text
Free
```

and optionally crossed-out gross delivery price where useful.

---

# 117. Delivery Temporarily Unavailable

Customer should know before Place Order.

---

# 118. Payment Methods V1

Expected:

```text
Cash on Delivery

bKash manual

Nagad manual
```

Future:

```text
SSLCommerz
```

or other gateway.

---

# 119. Payment Method Cards

Each shows:

```text
Name

Short explanation

Any relevant availability
```

---

# 120. COD

Example:

```text
Cash on Delivery
Pay when your order arrives.
```

---

# 121. Manual bKash

Need distinguish:

```text
selecting bKash
```

from:

```text
payment actually confirmed.
```

---

# 122. Recommended Manual Wallet Flow

```text
Checkout
  ↓
Place Order
  ↓
Order Created
  ↓
Payment Instructions
  ↓
Customer sends money
  ↓
Customer submits Transaction ID
  ↓
Payment Attempt
  ↓
Maevelle verifies
```

---

# 123. Why Create Order Before Manual Payment?

Manual wallet payment cannot be atomically confirmed during checkout.

Order provides:

```text
stable amount

stable reference

payment context
```

---

# 124. Payment Instructions

After Order:

```text
Send ৳1,450 to:
01XXXXXXXXX

Payment type:
Send Money

Then enter your Transaction ID.
```

Exact instructions come from Payment Method configuration.

---

# 125. Do Not Put Payment Account Number in Frontend Code

Load from server-safe public configuration DTO.

---

# 126. Transaction ID Submission

Form:

```text
Transaction ID

Paid amount if policy requires

Screenshot optional if enabled
```

---

# 127. Submission Confirmation

```text
Payment submitted for verification.
```

Not:

```text
Payment successful.
```

---

# 128. Pending Verification

Order confirmation page clearly shows:

```text
Payment: Awaiting verification
```

---

# 129. Rejected Payment Attempt

Customer-safe reason if allowed:

```text
We couldn't verify this payment. Please check the Transaction ID or contact us.
```

---

# 130. Duplicate Transaction Reference

Do not expose another Customer's information.

Show:

```text
We couldn't verify this transaction reference.
```

---

# 131. SSLCommerz Future Flow

Architecture slot:

```text
Order
→ Payment Intent
→ Gateway redirect/session
→ provider callback
→ Payment confirmation
```

Browser return URL is UX only, never proof of payment.

---

# 132. Order Summary

Sticky desktop sidebar where useful.

Mobile appears before final Place Order and accessible during checkout.

---

# 133. Order Summary Components

Canonical:

```text
Merchandise gross

Discount

Merchandise net

Delivery gross

Delivery discount

Tax if applicable

Total
```

---

# 134. Avoid Ambiguous "Subtotal"

If UI uses:

```text
Subtotal
```

its meaning must remain consistent.

Recommended customer simplification:

```text
Items
Discount
Delivery
Total
```

while internal API retains precise components.

---

# 135. Final Place Order Button

Examples:

```text
Place Order — ৳1,620
```

or:

```text
Place Order
```

Button disabled only when required information incomplete.

---

# 136. Place Order Behavior

Send:

```text
Checkout ID

Accepted Calculation Version

Idempotency Key
```

to server.

---

# 137. Prevent Double Tap

Button enters:

```text
Placing order...
```

state.

Same idempotency key retained across transport retry.

---

# 138. Never Generate New Idempotency Key on Uncertain Retry

If browser did not receive response:

```text
retry same logical PlaceOrder
→ same key.
```

---

# 139. Checkout Changed

Server may return:

```text
CHECKOUT_CHANGED
```

---

# 140. Checkout Changed UX

Do not display raw conflict.

Show:

```text
Your order details changed before it was placed.

Please review the updated total.
```

Highlight:

```text
old vs new
```

where practical.

---

# 141. Example

```text
Delivery
৳80 → ৳100

New total
৳1,640
```

Action:

```text
Review & Place Order
```

---

# 142. Item Became Unavailable

Show line:

```text
Red / M is no longer available.
```

Provide:

```text
Change option
Remove
```

---

# 143. Promotion Expired

Show:

```text
EID10 is no longer available.
```

recalculate.

---

# 144. Order Creation Success

Immediately navigate to:

```text
Order Confirmation
```

using secure public reference/access context.

---

# 145. Order Confirmation

Show:

```text
Order placed

Order number

Items

Total

Payment state

Delivery summary

Next step
```

---

# 146. COD Confirmation

Example:

```text
Order placed successfully.

You'll pay ৳1,620 when the order is delivered.
```

---

# 147. Manual Wallet Confirmation

Example:

```text
Order placed.

Complete your bKash payment to continue processing.
```

with Payment Instructions.

---

# 148. Order Number

Human-readable:

```text
ORD-2026-00152
```

may be displayed.

It is not sufficient authorization for lookup.

---

# 149. Guest Order Access

Use:

```text
secure opaque reference/token
```

stored in link/session.

---

# 150. Guest Order Lookup

Public lookup should require sufficient verification.

Potential UX:

```text
Order number
+
Phone verification
```

or secure link/access credential.

Exact security flow remains implementation-level.

---

# 151. Tracking Page

Customer view should combine:

```text
Order state

Fulfillment progress

Delivery tracking

Payment status
```

without exposing internal domain complexity.

---

# 152. Customer-Facing Order Progress

Example:

```text
Order confirmed
        ↓
Preparing
        ↓
Handed to courier
        ↓
In transit
        ↓
Out for delivery
        ↓
Delivered
```

---

# 153. RTO Customer UX

Do not expose:

```text
PENDING_SALE_OUTCOME
```

or costing states.

Show:

```text
Delivery could not be completed.
The parcel is returning to Maevelle.
```

where appropriate.

---

# 154. Failed Delivery

Customer-safe:

```text
We couldn't complete delivery.
```

with:

```text
support / next-step information.
```

---

# 155. Delivery Attempts

Tracking can show:

```text
Delivery attempted
Customer unavailable
```

if provider information is safe/reliable.

---

# 156. Payment Tracking

Examples:

```text
Cash on Delivery

Payment awaiting verification

Payment confirmed

Refund processing

Refund completed
```

---

# 157. Returns Future/Initial Public Flow

If V1 exposes customer Return request:

```text
Order
→ Return eligible items
→ quantity/reason
→ submit Return Request
```

Otherwise Admin creates Return manually.

Architecture supports both.

---

# 158. Review Submission

Customer receives secure review link after eligible purchase.

---

# 159. Review Form

Simple:

```text
Rating

Title optional

Review optional

Photos optional
```

Rating required.

---

# 160. Review Editing

Customer can submit new revision where policy allows.

Published old revision remains until moderation approval according to Reviews architecture.

---

# 161. Review Confirmation

```text
Thanks. Your review has been submitted.
```

If moderation required:

```text
It will appear after review.
```

---

# 162. Homepage

Homepage should be modular and merchandising-driven.

---

# 163. V1 Homepage Sections

Typed section system may include:

```text
Hero

Featured Categories

Product Carousel/Grid

Collection Banner

Promo Banner

New Arrivals

Best Sellers

Editorial Image + Text

Reviews/Testimonial summary

Trust/Service benefits
```

---

# 164. Homepage Is Not Arbitrary CMS HTML

V1 uses typed structured sections.

Future CMS can expand.

---

# 165. Hero

Must load efficiently.

Avoid giant video by default.

---

# 166. Homepage Merchandising

Section references:

```text
Collection

Category

Products

Media assets
```

rather than copying Product data into CMS.

---

# 167. Homepage Section Fallback

If referenced Collection becomes empty/inactive:

```text
hide section
```

or use configured fallback.

Do not render broken carousel.

---

# 168. Promotional Banner

A banner saying:

```text
20% Off
```

must align with actual Promotion.

Avoid stale manual copy where practical.

---

# 169. Trust Content

Potential:

```text
Cash on Delivery

Easy ordering

Delivery coverage

Secure payments
```

Only make claims the business can actually fulfill.

---

# 170. SEO Architecture

Every public indexable page should have deliberate:

```text
title

meta description

canonical URL

Open Graph

structured data

index policy
```

---

# 171. Product SEO

Use:

```text
Product name

Description

Images

Price/availability

Brand

Review aggregate where valid
```

for structured metadata.

---

# 172. Variant Structured Data

Can use ProductGroup/variant structures where appropriate.

Public structured data must match visible truth.

---

# 173. Review Structured Data

Rating/count must match public approved Reviews.

---

# 174. Breadcrumb Structured Data

Matches visible Breadcrumb hierarchy.

---

# 175. Category SEO

Provide:

```text
canonical title

description

clean URL
```

---

# 176. Filter URL Indexing

Do not allow uncontrolled faceted combinations to create millions of indexable URLs.

---

# 177. Search Page SEO

Typically:

```text
noindex
```

unless a deliberate SEO strategy says otherwise.

---

# 178. Canonicalization

Filtered Category URLs normally canonicalize to appropriate base/curated page unless specifically intended for indexing.

---

# 179. Sitemap

Generate:

```text
Products

Categories

Collections

relevant static pages
```

from published resources.

---

# 180. Archived Product SEO

If permanently unavailable with no replacement:

```text
appropriate 404/410 policy
```

or preserve page if historical/SEO/business reasons justify.

Exact SEO policy can be refined.

---

# 181. Product Temporarily Out of Stock

Keep page live.

Do not 404.

---

# 182. Redirects

Handle/category URL changes should preserve redirect history.

---

# 183. Performance Architecture

Storefront performance is a product requirement, not cleanup work.

---

# 184. Performance Priorities

Optimize:

```text
initial page rendering

hero/PDP primary image

search/category navigation

variant selection

cart interaction

checkout
```

---

# 185. Server-Heavy Rendering

Use Next.js server rendering/server components where useful for:

```text
Product page

Category page

Collection page

SEO metadata
```

while keeping interactive commerce islands client-side.

---

# 186. Avoid Client Waterfalls

Bad PDP:

```text
browser loads Product
then Price
then Inventory
then Reviews
then Sizing
```

sequentially.

Use purpose-built server/BFF orchestration.

---

# 187. Initial PDP Payload

Should include above-the-fold:

```text
Product identity

Media

Options/Variants necessary for selection

Current price

Availability

Promotion summary

Rating summary
```

---

# 188. Lazy PDP Data

Can defer:

```text
large Review list

FAQ deep sections

secondary recommendations
```

---

# 189. JavaScript Budget

Storefront should avoid turning all pages into heavy client applications.

Interactive client code only where needed.

---

# 190. Third-Party Scripts

Every third-party script adds:

```text
performance

privacy

security

reliability
```

cost.

Require explicit justification.

---

# 191. Analytics Scripts

Prefer controlled loading and first-party event architecture.

---

# 192. Image Budget

Product/gallery images are likely largest assets.

Serve properly sized renditions.

Never send desktop 4K image to small mobile card unnecessarily.

---

# 193. Layout Stability

Reserve dimensions for:

```text
images

product cards

checkout summary
```

to avoid content jumps.

---

# 194. Loading States

Use skeletons only where useful.

Primary server-rendered content should minimize initial loading placeholders.

---

# 195. Interaction Feedback

Add to Cart:

```text
immediate pending feedback
```

then authoritative success/failure.

---

# 196. Offline / Connection Failure

If network fails during non-critical browse interaction:

```text
show retry.
```

If during Place Order:

```text
do not assume failure.
```

Retry with same idempotency key / recover Order result.

---

# 197. Place Order Network Timeout UX

Recommended:

```text
We're checking whether your order was placed.
```

Client can query Checkout/Order result.

Never encourage repeated clicking with new key.

---

# 198. Payment Submission Timeout

Same principle.

Use same idempotency semantics if command retries.

---

# 199. Failure State Philosophy

Always answer:

```text
What happened?

What is safe?

What should the customer do?
```

---

# 200. Product Load Failure

```text
We couldn't load this product right now.
[Try again]
```

---

# 201. Cart Failure

Preserve local visible state where safe, then refresh from server.

---

# 202. Checkout Server Error

Do not clear form.

Keep:

```text
name

phone

address
```

and offer retry.

---

# 203. Payment Provider Unavailable

Hide/disable affected method and explain:

```text
bKash payment is temporarily unavailable.
You can use Cash on Delivery instead.
```

only if another method is actually allowed.

---

# 204. Delivery Serviceability Failure

Do not let customer complete impossible Checkout.

---

# 205. Unknown Provider State After Order

Order still exists.

Customer sees:

```text
We're arranging your delivery.
```

rather than technical integration errors.

---

# 206. Accessibility

Target modern WCAG-compatible experience.

---

# 207. Core Requirements

```text
Keyboard accessible navigation

Visible focus

Semantic forms

Accessible labels

Screen-reader status announcements

Correct dialog focus handling

Sufficient contrast

No color-only state

Logical heading order

Accessible image alt text
```

---

# 208. Color Swatches Accessibility

Each swatch needs accessible label:

```text
Red
```

not only visual color.

---

# 209. Size Buttons

Announce:

```text
Medium, available

Large, out of stock
```

appropriately.

---

# 210. Error Accessibility

Form errors linked to fields.

Summary at top for multiple errors where useful.

---

# 211. Reduced Motion

Respect user motion preference.

---

# 212. Touch Targets

Important controls:

```text
Size

Color

Quantity

Cart

Checkout
```

must be comfortably tappable.

---

# 213. Localization

Architecture should support:

```text
English

Bangla
```

without embedding UI strings throughout components.

---

# 214. V1 Language

Actual launch language policy is business decision.

Architecture remains locale-ready.

---

# 215. Number/Currency Formatting

Use centralized localization/settings.

Do not hard-code:

```text
"৳" + number
```

throughout components.

---

# 216. Date Formatting

Order/Tracking dates respect Storefront locale/timezone semantics.

---

# 217. Product Content Localization

Future translations should live in Catalog/content localization, not frontend if-statements.

---

# 218. Theme Architecture

Storefront presentation should be replaceable without changing:

```text
Cart logic

Checkout logic

Pricing

Catalog

Orders
```

---

# 219. Theme Responsibility

Theme controls:

```text
Typography

Colors

Spacing

Cards

Navigation presentation

PDP layout variants

Homepage presentation
```

not:

```text
business rules.
```

---

# 220. Design Tokens

Define:

```text
Brand colors

Background

Surface

Text

Muted text

Border

Critical

Success

Spacing

Radius

Typography

Container widths
```

---

# 221. Customer-Facing Status Vocabulary

Internal:

```text
PENDING_VERIFICATION
```

Customer:

```text
Payment awaiting verification
```

---

# 222. Avoid Operational Jargon

Do not show:

```text
Fulfillment posted

Outbound cost assigned

RTO receipt
```

unless user-facing wording is appropriate.

---

# 223. Customer Copy Principles

Use:

```text
short

clear

specific

action-oriented
```

language.

---

# 224. Checkout Copy

Bad:

```text
Submit
```

Better:

```text
Place Order
```

---

# 225. Payment Copy

Bad:

```text
Pending
```

Better:

```text
Waiting for payment verification
```

---

# 226. Analytics Events

Storefront product analytics should be deliberate and versioned.

---

# 227. Core Event Candidates

```text
page_view

product_view

search_performed

search_result_clicked

category_view

collection_view

variant_selected

size_guide_opened

add_to_cart

remove_from_cart

cart_view

checkout_started

checkout_address_completed

delivery_method_selected

payment_method_selected

coupon_applied

place_order_attempted

order_placed

payment_attempt_submitted

review_submitted
```

---

# 228. Analytics Event ≠ Business Truth

`order_placed` frontend event is behavioral analytics.

Authoritative Order comes from Orders domain.

---

# 229. Conversion Metrics

Use server/business truth for final:

```text
Orders

Sales

Payments
```

rather than relying solely on browser events.

---

# 230. Deduplicate Analytics

Browser retry should not create misleading business metrics.

Use:

```text
session/event IDs
```

where appropriate.

---

# 231. Consent / Privacy

Future marketing analytics/cookies require explicit consent architecture according to applicable policy.

Do not build uncontrolled tracking into every component.

---

# 232. Recommendations

V1 may use simple rule-based recommendations:

```text
same Category

same Collection

manually associated Products
```

---

# 233. Avoid Premature ML Recommendations

Not needed for initial Storefront.

---

# 234. Cross-Sell

Cart/PDP may show:

```text
You may also like
```

but should not interfere with Checkout.

---

# 235. Recently Viewed

Optional.

If implemented:

```text
local/session
```

can be sufficient initially.

No need to create Customer profile tracking for guests unless justified.

---

# 236. Wishlist

Deferred unless explicitly prioritized.

---

# 237. Customer Account Boundary

V1:

```text
guest-first
```

Future Account will add:

```text
Login

Order history

Saved addresses

Persistent cart

Review history

Returns
```

without replacing guest commerce.

---

# 238. Account Creation After Checkout

Future could offer:

```text
Save your details for next time
```

after Order.

Do not block current Order.

---

# 239. Cart Upgrade Future

Guest Cart can later attach/merge into Customer Account Cart through explicit merge rules.

---

# 240. Security

Storefront is public and hostile-input facing.

---

# 241. Never Trust

Client-supplied:

```text
Price

Discount

Inventory availability

Customer ID

Verified purchase

Order total

Payment status

Delivery fee
```

---

# 242. Public DTO Discipline

Only public-safe fields leave the server.

---

# 243. IDs

Opaque internal IDs may be sent where necessary for commerce actions.

They do not grant authorization.

---

# 244. Guest Cart Authorization

Possessing random Cart UUID alone should not be sufficient unless it is itself a high-entropy secret credential by design.

Prefer separate secure session/access mechanism.

---

# 245. Guest Order Authorization

Human Order number alone is never sufficient.

---

# 246. Checkout Abuse

Rate-limit:

```text
Place Order

Coupon attempts

Payment reference submission

Review submission
```

appropriately.

---

# 247. COD Abuse Foundation

Risk controls future may evaluate:

```text
repeat RTO

phone history

order velocity
```

but Storefront should receive only resulting policy decision.

---

# 248. CAPTCHA

Do not deploy everywhere by default.

Use risk-based challenge if abuse justifies it.

---

# 249. Product Availability

Storefront may show:

```text
Available
```

from current availability projection.

Final Order reservation remains authoritative.

---

# 250. Race — Last Unit

Two customers see:

```text
1 available
```

Both Checkout.

Only one can successfully reserve/place Order.

Loser receives:

```text
ITEM_UNAVAILABLE
```

with recoverable UX.

---

# 251. Do Not Oversell to Preserve UX

Fast UX cannot weaken Inventory invariant.

---

# 252. Promotion Race

Coupon has one use remaining.

Two customers attempt.

Atomic Promotion usage determines winner.

Other customer receives updated Checkout.

---

# 253. Price Race

Handled by final Checkout recalculation.

---

# 254. Delivery Race

Area/method disabled between Checkout preview and Place Order.

Return:

```text
CHECKOUT_CHANGED
```

or delivery-unavailable problem.

---

# 255. Checkout Calculation Version

UI should carry:

```text
calculation_version
```

without exposing technical meaning prominently.

---

# 256. Customer Acceptance

When material change occurs, customer explicitly accepts updated total by placing again.

---

# 257. Order Expiry

If unpaid/manual-payment Orders eventually expire:

Storefront should communicate:

```text
Pay before ...
```

only if an explicit Payment/Order expiry policy exists.

Do not invent countdowns.

---

# 258. Cart Expiry

Usually invisible.

If Cart expires, browser can recreate/restore visible selections where possible and revalidate.

---

# 259. Empty/Archived Product

If Product unpublished while customer is on page:

Add to Cart/Checkout server rejects.

UI refreshes:

```text
This product is no longer available.
```

---

# 260. Product URL Sharing

Selected Color/Variant may optionally be encoded for share:

```text
?color=beige
```

but canonical page remains stable.

---

# 261. Social Preview

Use:

```text
Product primary media

Title

Price/context-safe description
```

---

# 262. Support

Storefront should make:

```text
contact/support
```

easy to find.

Future Chat module can integrate without becoming checkout dependency.

---

# 263. WhatsApp / Messenger Future

Can launch support conversation.

Do not expose sensitive Order data automatically through query parameters.

---

# 264. Static Pages

Need architecture for:

```text
About

Contact

Delivery policy

Return policy

Privacy

Terms

Size help
```

V1 can use typed/static CMS records.

---

# 265. Policy Page Versioning

Critical Order/Return decisions should preserve policy version independently.

Public page current content can change.

---

# 266. Product Page Failure Matrix

### Price unavailable

```text
Product cannot be purchased.
```

Do not show zero.

### No valid Variants

```text
Currently unavailable.
```

### Media processing failure

Show safe fallback image if available.

### Reviews unavailable

Product purchase can continue.

### Sizing unavailable

If Size selection still understandable, continue; otherwise surface issue.

---

# 267. Checkout Failure Matrix

### Pricing unavailable

Block Place Order.

### Inventory unavailable

Block affected line.

### Promotion service/projection issue

Use authoritative evaluation; if unavailable, do not invent discount.

### Delivery unavailable

Block until valid method.

### Notifications unavailable

Order can still succeed.

### Analytics unavailable

Order can still succeed.

---

# 268. Graceful Degradation

Storefront must remain useful when non-critical dependencies fail.

---

# 269. Critical Dependencies

For Place Order:

```text
Catalog sellability

Pricing

Promotion authoritative evaluation

Inventory reservation

Customer resolution

Order persistence

Payment Intent where applicable
```

---

# 270. Non-Critical Dependencies

Examples:

```text
Review listing

Recommendations

Analytics

Email sending

External webhook delivery
```

---

# 271. Storefront Error Boundary

A Recommendations component crash must not destroy PDP purchase flow.

---

# 272. SEO Rendering Failure

If Product query fails, return correct error response rather than rendering empty 200 page.

---

# 273. 404

For unknown public resource:

```text
helpful 404
```

with:

```text
Search

Popular Categories

Home
```

---

# 274. Storefront Information Architecture

Recommended top-level:

```text
Home

Shop
  Categories
  Collections

Search

Cart

Checkout

Order Tracking

Policies / Support
```

---

# 275. Do Not Mirror Admin Navigation

Customers do not need:

```text
Catalog

Inventory

Promotions
```

as system concepts.

---

# 276. Storefront Shared Components

Recommended:

```text
SiteHeader

MobileNavigation

SearchTrigger

SearchOverlay

ProductCard

ProductGrid

PriceDisplay

RatingSummary

MediaGallery

OptionSelector

ColorSelector

SizeSelector

SizeGuide

AvailabilityLabel

QuantitySelector

AddToCartButton

MiniCart

CartLine

CouponInput

MoneySummary

AddressForm

GeographySearch

DeliveryOptionCard

PaymentMethodCard

OrderSummary

CheckoutSection

OrderProgress

TrackingTimeline

ReviewCard

ReviewForm

EmptyState

InlineError

Skeleton
```

---

# 277. Business Components, Not Generic Everything

Avoid one universal:

```text
SelectableThing
```

for:

```text
Color

Size

Delivery

Payment
```

if semantics differ materially.

---

# 278. Page Data Contracts

Prefer purpose-built APIs/read models.

Example PDP:

```text
GetStorefrontProduct
```

rather than client calling 8 generic endpoints.

---

# 279. PDP DTO

Should conceptually include:

```text
Product

Options

Variants/public selection matrix

Media

Pricing

Availability

Sizing reference

Rating summary

SEO
```

---

# 280. Checkout DTO

Should include:

```text
Customer/contact draft

Address

Delivery options

Payment options

Lines

Pricing calculation

Warnings

Calculation version
```

---

# 281. Public DTO Exclusions

Never expose:

```text
Supplier

Purchase cost

Landed cost

COGS

Internal stock count

Internal notes

Risk flags

Payment provider secrets

Private media

Audit
```

---

# 282. V1 Page Inventory

```text
/

 /search

 /categories/:handle
 /collections/:handle

 /products/:handle

 /cart

 /checkout

 /order/:secureReference
 /track

 /reviews/submit/:secureReference

 /about
 /contact
 /delivery-policy
 /return-policy
 /privacy
 /terms
```

---

# 283. Storefront UX Invariants

### STOREFRONT-UX-INV-001

The browser never becomes authoritative for Price, Discount, Stock, Delivery Charge, Payment or Order Total.

### STOREFRONT-UX-INV-002

Guest Checkout is supported without mandatory account creation.

### STOREFRONT-UX-INV-003

Cart does not reserve Inventory.

### STOREFRONT-UX-INV-004

Final Place Order revalidates all commercial and Inventory conditions.

### STOREFRONT-UX-INV-005

Material Checkout changes require Customer review rather than silent commitment.

### STOREFRONT-UX-INV-006

Double Place Order submission cannot create duplicate Orders.

### STOREFRONT-UX-INV-007

A network timeout does not automatically mean Place Order failed.

### STOREFRONT-UX-INV-008

Impossible Variant combinations and out-of-stock Variants remain visually distinct.

### STOREFRONT-UX-INV-009

Color selection can alter Variant Media without changing Product identity.

### STOREFRONT-UX-INV-010

Sizing UI consumes published Sizing-domain truth rather than hard-coded charts.

### STOREFRONT-UX-INV-011

Search results are advisory and never transactional availability authority.

### STOREFRONT-UX-INV-012

Product pages remain valid when temporarily out of stock.

### STOREFRONT-UX-INV-013

Current Product price never rewrites historical Order price.

### STOREFRONT-UX-INV-014

Coupon display never implies usage is committed before Order placement.

### STOREFRONT-UX-INV-015

Manual wallet Payment submission is not presented as confirmed Payment.

### STOREFRONT-UX-INV-016

Human Order number alone never grants access to guest Order data.

### STOREFRONT-UX-INV-017

Courier provider IDs never appear as Customer address concepts.

### STOREFRONT-UX-INV-018

Storefront Delivery choices represent customer-facing service levels rather than requiring courier-provider selection.

### STOREFRONT-UX-INV-019

Checkout does not fabricate Delivery availability during provider/serviceability uncertainty.

### STOREFRONT-UX-INV-020

Review Verified Purchase status cannot be client-controlled.

### STOREFRONT-UX-INV-021

Public Product rating uses approved/visible Review truth.

### STOREFRONT-UX-INV-022

Public DTOs never expose internal cost, supplier, audit, security or private operational data.

### STOREFRONT-UX-INV-023

Customer-facing status language does not expose unnecessary internal domain jargon.

### STOREFRONT-UX-INV-024

Non-critical failures such as Recommendations or Analytics cannot block purchasing.

### STOREFRONT-UX-INV-025

Storefront URLs remain stable and SEO-conscious.

### STOREFRONT-UX-INV-026

Theme changes cannot alter business behavior.

### STOREFRONT-UX-INV-027

Accessibility never depends solely on color or pointer hover.

### STOREFRONT-UX-INV-028

Mobile purchasing flow is a first-class design target.

### STOREFRONT-UX-INV-029

Free-delivery display never alters the underlying Delivery serviceability decision.

### STOREFRONT-UX-INV-030

Customer Order confirmation distinguishes Order placement, Payment status and Delivery status.

---

# 284. Mandatory V1 Storefront Scope

```text
✓ Homepage

✓ Responsive Header

✓ Mobile Navigation

✓ Search

✓ Search suggestions

✓ Categories

✓ Collections

✓ Product Grid

✓ Filters

✓ Sort

✓ Product Detail Page

✓ Media Gallery

✓ Color Selection

✓ Size Selection

✓ Size Guide

✓ Generic Variant resolution

✓ Price display

✓ Compare-at display

✓ Promotion display

✓ Availability

✓ Quantity

✓ Add to Cart

✓ Buy Now foundation

✓ Mini Cart

✓ Full Cart

✓ Cart recalculation

✓ Coupon

✓ Guest Checkout

✓ Contact details

✓ Bangladesh-oriented Address flow

✓ Geography search

✓ Delivery options

✓ COD

✓ Manual bKash

✓ Manual Nagad

✓ Order summary

✓ Place Order idempotency

✓ Checkout-change handling

✓ Order confirmation

✓ Manual Payment instructions

✓ Transaction reference submission

✓ Secure guest Order access

✓ Tracking

✓ Reviews listing

✓ Review submission

✓ SEO metadata

✓ Structured Product data

✓ Breadcrumbs

✓ Sitemap

✓ Redirects

✓ Responsive images

✓ Accessibility

✓ Failure states

✓ Analytics events

✓ Theme foundation
```

---

# 285. Strongly Preferred V1

```text
✓ Sticky mobile purchase bar

✓ Search typo tolerance

✓ Search synonyms

✓ Color-aware Product gallery

✓ Review media filtering

✓ Rating histogram

✓ Product recommendations

✓ Product share

✓ Saved guest Cart

✓ Checkout address autocomplete

✓ Delivery estimate

✓ Checkout pricing-change diff

✓ Payment verification status

✓ Customer-safe tracking timeline

✓ Homepage typed merchandising sections

✓ Performance monitoring

✓ Core Web Vitals monitoring

✓ First-party commerce analytics events
```

---

# 286. Explicitly Deferred

```text
Customer Account

Wishlist

Persistent cross-device Cart

Store Credit

Gift Cards

Loyalty

Subscriptions

Product Bundles

Advanced BOGO

Marketplace

International Checkout

Multiple Selling Currencies

Real-time tax engine

Buy Now Pay Later

Advanced personalization

AI recommendations

Native mobile app

Web Push

Saved payment methods

Social login

Live shopping

Advanced product comparison

AR try-on
```

---

# 287. Implementation Priorities

Storefront implementation should not start by building every page.

Recommended sequence:

```text
1. Shared Storefront shell

2. Catalog Search/Category/Product read models

3. Product grid

4. PDP + Variant selection

5. Cart

6. Checkout

7. Address + Delivery

8. Payment methods

9. Place Order

10. Confirmation / Payment attempt

11. Tracking

12. Reviews

13. Homepage merchandising

14. SEO refinement

15. Analytics + performance hardening
```

---

# 288. Key End-to-End Acceptance Flow

Before launch, this exact path must work:

```text
Customer opens Maevelle
        ↓
Searches or browses
        ↓
Opens Product
        ↓
Selects Color
        ↓
Gallery updates
        ↓
Selects Size
        ↓
Correct Variant resolves
        ↓
Adds to Cart
        ↓
Applies Coupon
        ↓
Checkout
        ↓
Enters Bangladesh address
        ↓
Valid Delivery option resolves
        ↓
Chooses COD
        ↓
Reviews Total
        ↓
Places Order
        ↓
Server reserves Inventory
        ↓
Order committed exactly once
        ↓
Confirmation appears
        ↓
Admin receives Order
        ↓
Fulfillment/Delivery continues
        ↓
Customer can securely Track
```

---

# 289. Second Acceptance Flow — Manual bKash

```text
Product
  ↓
Cart
  ↓
Checkout
  ↓
bKash
  ↓
Place Order
  ↓
Payment Instructions
  ↓
Customer sends money
  ↓
Transaction ID submitted
  ↓
Payment Awaiting Verification
  ↓
Admin verifies
  ↓
Customer Tracking reflects Payment Confirmed
```

---

# 290. Critical Failure Acceptance Flow

Test:

```text
Customer sees final unit
        ↓
Another Customer buys it
        ↓
First Customer presses Place Order
```

Expected:

```text
No oversell

No duplicate Order

No false Payment

Customer receives clear item-unavailable message

Cart remains recoverable
```

---

# 291. Architecture Milestone

We now have both major human-facing surfaces:

```text
BUSINESS OPERATIONS
        ↓
ADMIN INFORMATION ARCHITECTURE
```

and:

```text
CUSTOMER COMMERCE
        ↓
STOREFRONT UX ARCHITECTURE
```

connected to the same:

```text
Commands

Queries

Domains

Pricing

Inventory

Orders

Payments

Delivery
```

rather than implementing separate business logic in each frontend.

---

# 292. Product Architecture Phase Complete

At this point, continuing directly into more UI architecture would provide diminishing value.

The next major task should challenge whether everything we have designed is actually safe to implement.

---

# 293. Recommended Next Document

Create:

```text
docs/quality/testing-master-plan.md
```

# **Testing, Verification & Quality Master Plan**

This must be much broader than:

```text
unit tests
```

It should define:

```text
Architecture tests

Domain unit tests

Application command tests

Database constraint tests

Repository integration tests

Transactional tests

Concurrency tests

Idempotency tests

Authorization matrix tests

Cross-organization isolation

API contract tests

OpenAPI tests

Storefront E2E

Admin E2E

Payment workflows

Delivery/provider simulation

Returns/RTO tests

FIFO Costing tests

Pricing rounding tests

Promotion race tests

Migration tests

Backup/restore tests

Worker crash tests

Outbox tests

Webhook duplicate/reordering tests

Security tests

Performance tests

Load tests

Accessibility tests

Visual regression

Browser/device coverage

Data reconciliation tests

Failure injection

Provider outage simulations

Production smoke tests

Release gates

Test data strategy

Fixtures

Factories

CI pipeline
```

---

# 294. Why Testing Master Plan Now?

Because we already have hundreds of invariants such as:

```text
No oversell

No duplicate Payment

No cross-Organization access

No duplicate Receipt posting

No duplicate courier booking

No Refund overrun

No cost-layer double consumption

No historical price rewrite

No RTO stock restoration before physical receipt
```

The next document needs to transform those architectural statements into **executable proof requirements**.

---

# 295. Sequence From Here

Recommended:

```text
Testing & Quality Master Plan
        ↓
Operations / Incident / Recovery Runbooks
        ↓
Implementation Roadmap
        ↓
Repository Bootstrap
        ↓
Concrete Migrations
        ↓
Application Code
        ↓
Storefront/Admin Implementation
```

---

**End of Storefront UX Architecture v0.1**
