# Maevelle Ecommerce — Reviews & Ratings Architecture

**Document:** `docs/domains/reviews/reviews-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `catalog-architecture.md`, `orders/order-lifecycle-architecture.md`, `customer-architecture.md`, `media-architecture.md`, `storefront-commerce-architecture.md`, `access-control-architecture.md`

---

# 1. Purpose

The Reviews domain defines how customers evaluate Products through:

```text
Star Ratings

Written Reviews

Review Images

Purchased Variant Context

Verified Purchase Status

Merchant Responses
```

while supporting:

```text
Guest Customers

Manual Orders

Moderation

Spam Prevention

Negative Reviews

Customer Editing

Privacy

Customer Merge

Rating Aggregation

Storefront Display

SEO

Audit
```

without reducing the system to:

```text
product.rating = 4.7
product.review_count = 152
```

---

# 2. Core Principle

> **A Product rating is derived from Review records.**

The authoritative relationship is:

```text
CUSTOMER
   ↓
REVIEW
   ↓
RATING
   ↓
MODERATION
   ↓
PUBLISHED REVIEW
   ↓
RATING PROJECTION
   ↓
PRODUCT
```

The Product does not own a manually editable rating.

---

# 3. Second Core Principle

> **Verified Purchase is a derived fact, not a manually selectable badge.**

A Review becomes verified because the Customer has qualifying purchase history for the reviewed Product.

Not because an administrator checked:

```text
☑ Verified Buyer
```

---

# 4. Third Core Principle

> **Review moderation protects relevance, safety and integrity—not Maevelle from criticism.**

A legitimate:

```text
★☆☆☆☆
"The stitching was poor."
```

review should not be rejected merely because it is negative.

Moderation exists for matters such as:

```text
Spam

Abuse

Irrelevant Content

Personal Information

Duplicate Content

Fraudulent Review

Unsafe Media
```

---

# 5. Fourth Core Principle

> **Customer-authored Review content and Maevelle's response remain separate records.**

Maevelle should never silently rewrite:

```text
what the customer said
```

to make a Review more favorable.

---

# 6. Research-Informed Direction

Google currently supports Review and AggregateRating structured data for Products, but structured information must correspond to content available on the page and satisfy its structured-data guidelines.

Shopify's current standard review model separately stores Review records while its standard Product rating fields represent aggregated average rating and rating count. That is consistent with using Reviews as source records and Product rating summaries as projections rather than editable Product master fields.

Schema.org likewise distinguishes an individual `Review`/`Rating` from an `AggregateRating`, where the latter represents the overall result derived from multiple ratings.

---

# 7. Domain Responsibilities

Reviews owns:

```text
Review

Rating

Review Eligibility

Purchase Verification

Review Revision

Moderation

Review Media Relationship

Merchant Response

Review Aggregate Projection

Review Reporting / Abuse Foundation

Review Invitation Foundation

Review Settings
```

---

# 8. Reviews Does Not Own

Reviews does not own:

```text
Customer Identity

Order State

Fulfillment

Product Master Data

Media Storage

Customer Account Authentication

SEO Rendering
```

It references those domains.

---

# 9. Primary Concepts

Recommended domain concepts:

```text
Review

Review Eligibility

Review Purchase Reference

Review Revision

Review Moderation Decision

Merchant Response

Review Media Usage

Product Rating Summary

Review Invitation
```

---

# 10. Review Subject

V1 Review subject should normally be:

```text
PRODUCT
```

rather than one Review per Variant.

---

# 11. Why Product-Level Review?

Consider:

```text
Floral Dress
├── Red / S
├── Red / M
├── Red / L
├── Blue / S
├── Blue / M
└── Blue / L
```

Customers are fundamentally reviewing:

```text
Floral Dress
```

while purchased Variant provides useful context.

---

# 12. Purchased Variant Context

Review can preserve:

```text
Purchased Variant ID

Variant Snapshot

Color Snapshot

Size Snapshot

Other Option Snapshots
```

so Storefront can display:

```text
Purchased: Red / M
```

---

# 13. Variant Context Is Historical

If Variant later changes or becomes archived:

```text
Review remains understandable.
```

Use transaction-time Order Line snapshots where appropriate.

---

# 14. Future Variant Ratings

Architecture can later derive:

```text
Rating for Variant

Rating for Color

Rating for Size
```

if enough Review data exists.

But V1 public rating should primarily aggregate at Product level.

---

# 15. Review

Conceptually:

```text
Review ID

Product

Customer

Rating

Title optional

Body optional

Purchase Reference

Author Display Snapshot

Submitted At

Review State

Moderation State

Visibility

Source
```

---

# 16. Rating

V1 uses:

```text
1–5 stars
```

with integer customer selections:

```text
1
2
3
4
5
```

---

# 17. Rating Is Required

A Review must contain a Rating.

Written text may be optional.

Therefore valid:

```text
★★★★★
```

without mandatory paragraph text.

---

# 18. Why Allow Rating-Only?

This reduces customer friction.

A customer who has no written comment can still contribute genuine satisfaction data.

---

# 19. Review Body

Optional customer-written content.

Example:

```text
"The material was very comfortable and the size was accurate."
```

---

# 20. Review Title

Optional.

Example:

```text
"Beautiful dress"
```

Do not force title if customer only wants to leave a short comment.

---

# 21. Review Images

Optional.

Media Architecture handles storage/security.

Reviews owns whether those Assets are eligible for public Review presentation.

---

# 22. Review Image Count

Business setting can define a reasonable maximum.

Do not hard-code image count throughout frontend logic.

---

# 23. Review Source

Recommended:

```text
CUSTOMER

MIGRATION

CONTROLLED_IMPORT
```

Potential future:

```text
EXTERNAL_REVIEW_PLATFORM
```

---

# 24. Admin Cannot Fabricate Customer Reviews

V1 should not expose a normal:

```text
Create Customer Review
```

button to staff.

---

# 25. Why?

Staff-authored testimonials should not masquerade as independent customer Reviews.

If genuine historical reviews need migration:

```text
CONTROLLED_IMPORT
```

preserves their provenance.

---

# 26. Imported Review

An imported Review may be legitimate.

But:

```text
Imported
≠
Verified Purchase
```

unless the system can link it to qualifying Order history.

---

# 27. Review Identity

Every Review references:

```text
Customer ID
```

privately.

Public Storefront does **not** expose that internal Customer identity.

---

# 28. Public Author Name

Review should have privacy-safe display representation.

Example:

```text
Nusrat J.
```

rather than:

```text
Nusrat Jahan
01712345678
Kazipara, Mirpur...
```

---

# 29. Author Display Snapshot

Review should preserve the public author name used for that Review.

This prevents future Customer profile edits from unexpectedly changing years of Review presentation.

---

# 30. Public Author Strategy

Configurable options might include:

```text
First Name

First Name + Last Initial

Customer-chosen Display Name
```

V1 can use a safe default such as:

```text
First Name + Last Initial
```

where available.

---

# 31. Never Publicly Display

Review DTO must never expose:

```text
Full Phone

Email

Full Address

Customer Internal ID

Payment Details
```

---

# 32. Purchase Verification

A Review may be:

```text
VERIFIED_PURCHASE

UNVERIFIED
```

as a derived presentation state.

---

# 33. Verification Source

Internally preserve why the Review is verified.

Example:

```text
ORDER_LINE
```

Future:

```text
MARKETPLACE_ORDER

MIGRATED_VERIFIED_PURCHASE
```

if trustworthy evidence exists.

---

# 34. Qualifying Purchase

A qualifying purchase should satisfy rules such as:

```text
Order belongs to Customer

Order Line references reviewed Product

Relevant quantity was genuinely fulfilled/completed

Order was not merely Draft/Rejected

Transaction is not known fraudulent/test data
```

Exact transition trigger will integrate with Order/Delivery lifecycle.

---

# 35. Completed Order

For V1, a practical review-eligibility milestone can be based on:

```text
qualifying completed/fulfilled Order Line
```

rather than merely:

```text
Order created
```

---

# 36. Why Not Order Creation?

Otherwise someone could:

```text
place COD order
never receive it
leave "Verified Purchase" Review
```

without actually becoming a buyer.

---

# 37. Future Delivery Integration

When courier Delivery becomes first-class, Review eligibility can use stronger:

```text
DELIVERED
```

evidence.

Architecture remains unchanged.

---

# 38. Returned Product

A customer who legitimately received and then returned a Product may still have a Verified Purchase Review.

Example:

```text
★★☆☆☆
"Size was much smaller than expected, so I returned it."
```

This is valuable information.

---

# 39. Refund Does Not Automatically Remove Verification

A legitimate refund does not erase the fact that the customer purchased/received the Product.

---

# 40. Cancelled Before Fulfillment

An Order cancelled before the customer genuinely received the Product should not normally qualify for Verified Purchase.

---

# 41. Review Eligibility

A **Review Eligibility** answers:

```text
Can this Customer currently review this Product?
```

---

# 42. Eligibility Is Not Review

The customer may be eligible but never submit anything.

---

# 43. Eligibility Sources

May derive from:

```text
Customer

Product

Qualifying Order Line(s)

Existing Active Review
```

---

# 44. Guest Customer Eligibility

Customer Account is not required.

Because Guest Orders already belong to Customer identity:

```text
Guest Customer
    ↓
Order
    ↓
Order Line
    ↓
Review Eligibility
```

---

# 45. Secure Guest Review

Guest Review submission must not trust client values such as:

```text
customerId = ...

orderId = ...
```

to establish eligibility.

Use:

```text
secure review link/token

safe public Order access

future authenticated account
```

to prove access to the eligible Review context.

---

# 46. Review Invitation

Foundation concept:

```text
Review Invitation
```

may reference:

```text
Customer

Order

Order Line

Product

Secure Token

Created At

Expires At
```

---

# 47. Invitation Is Convenience

An expired Review invitation should not necessarily mean:

```text
Customer permanently lost the right to review.
```

The Customer may later review through:

```text
Customer Account

Verified Order Lookup

New Review Invitation
```

---

# 48. Invitation Token

Must be:

```text
Random

Ungues­sable

Time-limited

Scope-limited
```

and never expose internal authorization merely through editable URL parameters.

---

# 49. One Active Review per Customer/Product

Recommended V1 rule:

> **One active public Review per canonical Customer per Product.**

---

# 50. Why?

Otherwise:

```text
Customer buys same Product 5 times
→ leaves five 5-star ratings
```

and disproportionately influences Product rating.

---

# 51. Repeat Purchase

A repeated purchase can strengthen:

```text
Verified Purchase context
```

but does not automatically create another active Review slot.

---

# 52. Review Update

Repeat customer can:

```text
edit/update existing Review
```

instead.

---

# 53. Future Multiple Purchase Reviews

If genuine use cases later require one Review per purchase occurrence, architecture can evolve.

V1 should favor rating integrity and simplicity.

---

# 54. Duplicate Review Protection

Uniqueness should conceptually enforce:

```text
Canonical Customer
+
Product
+
Active Review
```

while preserving historical removed/rejected records.

---

# 55. Customer Merge Complication

Customer A and Customer B may each have Review for Product X.

Then Customer records are merged.

Now canonical Customer appears to have:

```text
2 Reviews for same Product.
```

This is a first-class merge conflict.

---

# 56. Customer Merge Preview

Customer-domain merge preview should surface:

```text
Duplicate Review Conflict:

Review A
★★★★★

Review B
★★★★☆
```

before merge finalization where possible.

---

# 57. Review Merge Resolution

Authorized operation may:

```text
Keep Review A

Keep Review B

Archive one as duplicate

Require manual resolution
```

Do not silently count both.

---

# 58. Aggregate Rebuild After Merge

After Customer merge:

```text
Product Rating Summary
```

must be recalculated/rebuilt as needed.

---

# 59. Review State

Recommended record lifecycle:

```text
ACTIVE

REMOVED
```

---

# 60. Moderation State

Separate:

```text
PENDING

APPROVED

REJECTED
```

---

# 61. Visibility State

Separate:

```text
VISIBLE

HIDDEN
```

---

# 62. Why Separate These?

A Review could be:

```text
ACTIVE

APPROVED

HIDDEN
```

because it was once valid but temporarily hidden due to:

```text
privacy concern

legal complaint

content investigation
```

This is different from:

```text
REJECTED
```

at submission.

---

# 63. Submitted Review

Default:

```text
ACTIVE
PENDING
HIDDEN
```

until moderation succeeds.

---

# 64. Approved Review

After moderation:

```text
ACTIVE
APPROVED
VISIBLE
```

and becomes eligible for Storefront display.

---

# 65. Rejected Review

```text
ACTIVE
REJECTED
HIDDEN
```

Historical submission remains.

---

# 66. Removed by Customer

```text
REMOVED
```

and no longer displayed or counted.

---

# 67. Hide Previously Published Review

```text
ACTIVE
APPROVED
HIDDEN
```

with structured reason.

---

# 68. Moderation Decision

A moderation action should record:

```text
Decision

Reason

Moderator

Timestamp

Internal Note
```

---

# 69. Moderation Reasons

Recommended:

```text
SPAM

DUPLICATE

IRRELEVANT

ABUSIVE_OR_THREATENING

PERSONAL_INFORMATION

UNSAFE_MEDIA

FRAUD_SUSPECTED

PROHIBITED_CONTENT

OTHER
```

---

# 70. Negative Sentiment Is Not Moderation Reason

Do not include:

```text
NEGATIVE_REVIEW
```

as a valid rejection reason.

---

# 71. Mixed Review

Example:

```text
★★☆☆☆
"Beautiful color, but stitching came loose."
```

is legitimate customer feedback.

---

# 72. Moderation Queue

Admin view:

```text
Pending Reviews

Rating

Customer Display

Verified Purchase

Product

Purchased Variant

Body

Images

Submitted Date

Risk Warnings
```

---

# 73. Fast Moderation Actions

```text
Approve

Reject

Request Hide / Escalate

Open Customer

Open Order Context
```

according to permissions.

---

# 74. Moderator Should See Purchase Context

When authorized:

```text
Order Number

Product

Variant

Fulfillment status

Review Verification
```

helps identify fraudulent submissions.

---

# 75. Moderation Should Not Expose Unnecessary Finance Data

Review moderator does not require:

```text
Supplier cost

Landed cost

Customer payment evidence
```

---

# 76. Review Editing

Customer should eventually be able to edit their active Review through:

```text
Customer Account
```

or:

```text
secure Review management link
```

---

# 77. Review Revision

Recommended concept:

```text
Review Revision
```

stores the customer-authored version history.

---

# 78. Why Revisions?

Suppose published:

```text
★★★★★
"Very good."
```

changes to:

```text
★★☆☆☆
"Broke after one week."
```

We should preserve:

```text
what changed

when

which version was public
```

without silently rewriting history.

---

# 79. Review Revision Contains

Conceptually:

```text
Rating

Title

Body

Media Set

Submitted At

Author
```

---

# 80. Active Published Revision

A Review points to:

```text
Current Approved Revision
```

for Storefront display.

---

# 81. Edited Published Review

Recommended flow:

```text
Published Review
      ↓
Customer edits
      ↓
New Revision = PENDING
      ↓
Old Approved Revision remains visible
      ↓
Moderator approves
      ↓
New Revision becomes current
```

---

# 82. Why Preserve Old Version Until Approval?

Prevents an approved Review from suddenly displaying:

```text
spam

unsafe content

personal phone number

malicious image
```

before moderation.

---

# 83. Customer Removal Is Different

If customer requests:

```text
Remove my Review
```

the Review can be hidden promptly.

They should not be forced to wait for moderation simply to stop displaying their own content.

---

# 84. Emergency Privacy Hide

If a published Review accidentally exposes:

```text
phone number

address

other sensitive data
```

authorized staff can immediately hide it pending resolution.

---

# 85. Staff Editing Customer Text

Normal staff workflow must not allow:

```text
edit Review body
```

directly.

---

# 86. Controlled Redaction — Preferred/Future

A privileged moderation workflow may eventually support:

```text
Redact only sensitive personal information
```

while preserving original privately and logging exactly what was redacted.

V1 can simply hide/request correction if this is unnecessary initially.

---

# 87. Review Image Workflow

Customer:

```text
uploads image
```

Media creates technically validated Asset.

Review remains:

```text
PENDING
```

until image/content moderation succeeds.

---

# 88. Review Media Access

Before publication:

```text
not publicly accessible through Storefront
```

even if Media processing is READY.

---

# 89. Public Review Media

Public presentation requires:

```text
Review approved

Review visible

Media technically safe

Media approved for that Review usage
```

---

# 90. Review Hidden Later

Review media should also stop appearing through normal Storefront delivery.

---

# 91. Unsafe Review Media

A safe Review text with unsafe image should not publish the unsafe image.

V1 simplest policy:

```text
whole Review stays pending/rejected
```

until attachments are resolved.

Future can support per-image moderation.

---

# 92. Review Image Removal

Customer may edit Review and remove an image.

Asset usage is removed.

Media Asset retention/deletion follows Media Architecture.

---

# 93. Review Image Ownership

Removing Review does not automatically hard-purge Media Asset immediately.

Retention/privacy policy applies.

---

# 94. Merchant Response

Maevelle may publicly respond to a Review.

Concept:

```text
Merchant Response
```

separate from Review content.

---

# 95. Example

```text
Customer:
★★☆☆☆
"The size felt smaller than expected."

Maevelle:
"Thank you for the feedback. We've updated the size-guide instructions to make the garment measurements clearer."
```

---

# 96. Merchant Response Fields

Conceptually:

```text
Review

Response Body

Internal Author

Public Business Display Name

Published At

Updated At

State
```

---

# 97. Public Response Author

Storefront can display:

```text
Maevelle
```

rather than employee's personal name.

---

# 98. Internal Author

Audit still records:

```text
which internal user wrote it.
```

---

# 99. Merchant Response Editing

Merchant response can be edited by authorized users.

Preserve audit/revision history where material.

---

# 100. One Active Merchant Response

Recommended V1:

```text
one active public Merchant Response per Review
```

rather than staff having a discussion thread.

---

# 101. Customer Follow-Up — Future

Future Review conversation/comments could become separate functionality.

Not required V1.

---

# 102. Rating Aggregate

Storefront requires a fast summary such as:

```text
4.7 ★

152 Reviews
```

This should come from:

```text
Product Rating Summary
```

projection.

---

# 103. Product Rating Summary

Conceptually:

```text
Product ID

Average Rating

Rating Count

1-Star Count

2-Star Count

3-Star Count

4-Star Count

5-Star Count

Verified Review Count

Review-With-Media Count

Updated At
```

---

# 104. Aggregate Eligibility

Only Reviews satisfying defined public rating rules count.

Recommended:

```text
ACTIVE

APPROVED

VISIBLE

Valid Current Approved Revision
```

---

# 105. Pending Reviews

Do not count.

---

# 106. Rejected Reviews

Do not count.

---

# 107. Hidden Reviews

Do not count while hidden.

---

# 108. Customer-Removed Reviews

Do not count.

---

# 109. Edited Pending Revision

If old approved revision remains visible while new edit is pending:

```text
old approved Rating
```

continues to count until replacement is approved.

---

# 110. Approved Rating Change

When edit changes:

```text
★★★★★
→
★★★☆☆
```

and new revision becomes approved:

```text
aggregate projection updates.
```

---

# 111. Average Rating

Conceptually:

```text
sum(eligible rating values)
/
eligible rating count
```

---

# 112. Display Precision

Internal average can retain sufficient decimal precision.

Storefront may display:

```text
4.7
```

using centralized deterministic rounding.

---

# 113. Distribution

Example:

```text
★★★★★ 82%

★★★★☆ 11%

★★★☆☆ 4%

★★☆☆☆ 2%

★☆☆☆☆ 1%
```

derived from rating bucket counts.

---

# 114. Zero Reviews

Display should not pretend:

```text
0.0 ★
```

is a genuine rating.

Use:

```text
No reviews yet
```

or omit rating.

---

# 115. No Manual Aggregate Override

Admin must not have fields:

```text
Rating: [4.9]

Review Count: [1500]
```

for ordinary Product editing.

---

# 116. Aggregate Projection Is Rebuildable

If summary becomes inconsistent:

```text
recalculate from authoritative eligible Reviews.
```

---

# 117. Projection Consistency Checks

Detect:

```text
Rating count != sum(bucket counts)

Average outside 1–5

Published Review missing from summary

Hidden Review still counted
```

---

# 118. Product Archive

Archiving Product:

```text
does not delete Reviews.
```

They remain historical.

Storefront simply no longer shows normal Product page.

---

# 119. Product Republish

Eligible Reviews can appear again when Product becomes publicly available.

---

# 120. Variant Archive

Review purchased Variant context remains historical.

---

# 121. Product Merge — Future

If Catalog ever supports merging Products:

```text
Review migration/aggregate impact
```

must be explicit.

Not a V1 requirement.

---

# 122. Review Storefront Summary

PDP can show near Product title:

```text
★★★★☆ 4.6 (38)
```

linked to Review section.

---

# 123. Review Section

Recommended:

```text
Rating Summary

Distribution

Review Filters

Review List

Write Review / eligibility action
```

---

# 124. Public Review Card

Potential:

```text
★★★★★

Nusrat J.
Verified Purchase

Purchased: Red / M

Beautiful dress
"The fabric looks exactly like the photos."

[images]

Aug 2026

Maevelle response...
```

---

# 125. Review Date

Public date can use:

```text
original submitted/published context
```

according to presentation policy.

Do not fake recent dates after merchant moderation.

---

# 126. Edited Indicator

If Review materially edited later, Storefront can show:

```text
Edited
```

where useful.

---

# 127. Verified Purchase Badge

Only show when verification rule currently succeeds from trusted history.

---

# 128. Unverified Review

If future policy allows unverified/imported Reviews:

```text
do not display Verified Purchase.
```

---

# 129. Should Maevelle Accept Unverified Public Reviews?

Recommended V1 default:

> **Public customer submissions require qualifying purchase eligibility.**

This substantially simplifies identity, spam, and trust.

---

# 130. Imported Historical Reviews

Controlled migration may bypass current purchase eligibility.

Their source remains internally identifiable.

They should not automatically receive Verified Purchase.

---

# 131. Future Open Reviews

If business later wants anyone to review:

```text
UNVERIFIED public review submission
```

can be added without redesigning Review records.

---

# 132. Review Filters

Useful Storefront filters:

```text
Rating

With Photos

Verified Purchase
```

---

# 133. Review Sort

Useful:

```text
Newest

Highest Rating

Lowest Rating
```

---

# 134. Helpful Sort — Future

```text
Most Helpful
```

requires helpful-voting architecture.

Deferred.

---

# 135. Featured Reviews

Admin-selected featured Review could be useful.

But do not let:

```text
Featured
```

alter rating aggregates.

---

# 136. Featured Review Transparency

It is merchandising order only.

Not a stronger review weight.

---

# 137. Review Pagination

Use pagination/load-more.

Do not load thousands of Reviews into initial PDP.

---

# 138. Rating Summary Performance

Summary comes from projection.

Do not aggregate entire Reviews table on every Product request.

---

# 139. Review List Query

Indexes should support:

```text
Product

Visibility

Rating

Submitted/Published Date

Has Media

Verified Purchase
```

---

# 140. Search Within Reviews — Future

Potential:

```text
search review text
```

not required V1.

---

# 141. Review Analytics

Useful:

```text
Average Rating

Review Count

Rating Distribution

Reviews Over Time

Verified Review Count

Photo Review Count
```

---

# 142. Business Quality Analytics

Potential:

```text
Products with low rating

Products with rating declining

Products frequently mentioning sizing issues
```

future.

---

# 143. Size Feedback

Because Review knows purchased Variant/Size:

```text
Reviews for Size M
```

can eventually help analyze fit problems.

---

# 144. Structured Fit Feedback — Future

Potential customer questions:

```text
Runs Small

True to Size

Runs Large
```

could become structured Review attributes.

Do not infer this reliably from free text in V1.

---

# 145. Review Tags — Future

Structured feedback such as:

```text
Quality

Sizing

Color Accuracy

Comfort
```

could later support insights.

Not V1.

---

# 146. Review Request

Future Notifications domain can send review requests after qualifying purchase.

---

# 147. Review Request Timing

Future policy may say:

```text
X days after delivery/completion
```

depending on Product/customer experience.

Reviews provides eligibility.

Notifications handles delivery.

---

# 148. No Review Request Before Eligibility

Do not invite customer to review:

```text
while Order is merely Pending
```

under Verified Purchase policy.

---

# 149. Review Reminder

Future:

```text
one reminder
```

if no Review submitted.

Avoid excessive spam.

---

# 150. Review Request Stops After Review

Once Customer has active Review:

```text
do not continue sending request reminders.
```

---

# 151. Moderation Notifications

Internal:

```text
New Review Pending

Low Rating Review

Review With Report/Issue
```

---

# 152. Low Rating Alert

Optional:

```text
1–2 star Review submitted
```

can notify relevant operators.

Notification must not influence moderation integrity.

---

# 153. Customer Notification

Potential:

```text
Review published

Review rejected/requested correction

Merchant responded
```

future/optional V1.

---

# 154. Review Spam Protection

Purchase-gated submission already reduces significant spam surface.

Still apply:

```text
Rate limiting

Token validation

Payload limits

Media limits
```

---

# 155. Duplicate Submission

Customer double-clicks:

```text
Submit Review
```

should create:

```text
1 Review / Revision
```

not duplicates.

---

# 156. Submission Idempotency

Required for Review creation/edit commands.

---

# 157. Review Token Reuse

A submission token should not permit unlimited unrelated Reviews.

Scope it to:

```text
Customer

eligible Product/context
```

---

# 158. Review Brute Force

Opaque Review/Order identifiers and rate limiting protect public management endpoints.

---

# 159. Review Body Limits

Set reasonable:

```text
minimum/maximum
```

when body exists.

Do not allow multi-megabyte text payloads.

---

# 160. Unicode

Support normal Bangla and English Review text.

Do not restrict customer Reviews to ASCII.

---

# 161. HTML

Customer Review body should normally be plain/structured text.

Do not allow arbitrary customer HTML/scripts.

---

# 162. Links

V1 can:

```text
disable clickable arbitrary links
```

or safely render them according to policy to reduce spam/phishing.

---

# 163. Personal Information

Review may accidentally include:

```text
phone

address

order number
```

Moderation should prevent unnecessary sensitive information from becoming public.

---

# 164. Review Media Security

Review image upload uses Media protections:

```text
Type validation

Size limits

Dimension limits

Malware/content safeguards

Metadata stripping
```

before public delivery.

---

# 165. Abuse Report Foundation

Future public action:

```text
Report Review
```

can create:

```text
Review Report
```

---

# 166. Report Reasons

Potential future:

```text
Spam

Abuse

Personal Information

Not About Product

Other
```

---

# 167. Report Does Not Auto-Hide

One user report should not automatically suppress a legitimate negative Review.

Use moderation policy.

---

# 168. Review Report Abuse

Reporting itself needs rate limits.

---

# 169. Merchant Response Abuse

Internal responses should follow professional business communication policy.

Review domain preserves author/audit.

---

# 170. Review Deletion

Avoid hard deleting normal historical Reviews.

Use:

```text
REMOVED

HIDDEN
```

according to reason.

---

# 171. Why Preserve?

Useful for:

```text
Audit

Moderation disputes

Customer merge

Aggregate reconstruction

Abuse investigation
```

subject to privacy/retention rules.

---

# 172. Customer Removes Review

Public content disappears.

Internal retention follows privacy policy.

---

# 173. Admin Hides Review

Requires:

```text
Reason

Actor

Timestamp
```

---

# 174. Admin Cannot Hide Without Reason

Especially for previously published Review.

This discourages arbitrary negative-review suppression.

---

# 175. Rejected Review Reconsideration

Moderator may later:

```text
approve previously rejected Review
```

through explicit decision with audit.

---

# 176. Moderation Appeal — Future

Customer appeal workflow is not required V1.

Support may resolve manually.

---

# 177. Customer Privacy

Customer identity linked to Review is sensitive.

Only authorized staff should see:

```text
full Customer

Order history
```

behind Review.

---

# 178. Public Review DTO

Contains only:

```text
Public Author Name

Rating

Title

Body

Public Review Media

Verified Purchase Indicator

Purchased Variant Display

Dates

Merchant Response
```

---

# 179. Internal Review DTO

May additionally contain:

```text
Customer ID

Order / Order Line Reference

Eligibility Details

Moderation History

Internal Notes
```

subject to permission.

---

# 180. IP/Device Metadata

If collected for abuse prevention:

```text
minimize it

restrict access

apply retention policy
```

and do not present it as customer identity truth.

---

# 181. Customer Anonymization

If Customer is anonymized:

```text
Review public author
→ Anonymous / anonymized display
```

according to retention/privacy policy.

---

# 182. Review Content May Contain Personal Data

Anonymizing Customer master alone may not be enough.

Privacy workflow may need to inspect/redact/remove Review text/media if personally identifying.

---

# 183. Customer Merge

Review references update to canonical Customer.

Public Review text/snapshot does not need rewriting merely because Customer master merged.

---

# 184. Review Merge Conflict

As established earlier:

```text
one active Review per canonical Customer/Product
```

must remain true after merge.

---

# 185. Product Rating Projection and Privacy

If Review is removed because privacy policy requires removal:

```text
aggregate must update.
```

---

# 186. Review Permissions

Recommended:

```text
reviews.view

reviews.view_customer_context

reviews.moderate

reviews.approve

reviews.reject

reviews.hide

reviews.restore_visibility

reviews.respond

reviews.import

reviews.export

reviews.settings.manage
```

---

# 187. Media Permission

Review image moderation also requires appropriate:

```text
media.view

media.view_private
```

during pending state.

---

# 188. Customer Context Permission

Review moderator may need limited:

```text
reviews.view_customer_context
```

without broad:

```text
customers.view_sensitive
```

depending on final authorization design.

---

# 189. Negative Review Hiding Is Sensitive

`reviews.hide` should be separately auditable.

Potential permission separate from ordinary approval queue.

---

# 190. Import Permission

Review import is high-trust.

It can materially alter:

```text
Product rating

public social proof
```

so:

```text
reviews.import
```

should not be granted casually.

---

# 191. No Aggregate Edit Permission

There should be no:

```text
reviews.rating_override
```

in normal architecture.

---

# 192. Review Settings

Potential:

```text
Review Submission Enabled

Require Purchase Eligibility

Manual Moderation

Allow Images

Maximum Images

Allow Rating-Only Reviews

Public Author Format

Review Sort Default
```

---

# 193. Dangerous Setting Changes

Changing:

```text
Require Purchase Eligibility = false
```

could materially affect Review trust/spam.

Requires appropriate permissions/audit.

---

# 194. V1 Recommended Settings

```text
Purchase required:
YES

Manual moderation:
YES

Rating required:
YES

Body required:
NO

Images:
YES

One active Review per Customer/Product:
YES
```

---

# 195. Future Auto-Moderation

Trusted verified Reviews could later auto-publish under configurable rules.

Do not require manual moderation forever at architecture level.

---

# 196. Auto-Moderation Must Not Favor Positive Ratings

Rule should not be:

```text
5 stars → auto approve

1 star → manual review
```

solely because sentiment is negative.

---

# 197. Review Quality Rules

Potential automated checks:

```text
Duplicate text

Excessive links

Repeated characters

Known spam patterns
```

can create moderation warnings.

They need not automatically reject.

---

# 198. AI Moderation — Future

Potential:

```text
spam classification

unsafe image detection

personal information detection
```

can assist moderators.

Human/business policy remains authoritative.

---

# 199. Review Import

Migration workflow:

```text
Upload CSV/XLSX

Map fields

Validate Products

Resolve Customers where possible

Resolve Order/Purchase evidence

Preview

Import
```

---

# 200. Imported Product Matching

Prefer:

```text
stable Product external reference

SKU/handle mapping

explicit manual mapping
```

rather than title-only guessing.

---

# 201. Imported Customer Matching

Use Customer identity-resolution architecture.

Do not blindly match by raw phone string.

---

# 202. Imported Verification

Only mark Verified Purchase if:

```text
trusted qualifying purchase relationship can be established.
```

Otherwise:

```text
UNVERIFIED
```

---

# 203. Imported Publication

Historical Reviews may import as:

```text
PENDING
```

for moderation/quality review.

Or controlled migration may approve them if data source is trusted.

Policy should be explicit.

---

# 204. Import Duplicate Detection

Detect:

```text
same external Review ID

same Customer/Product

same source record
```

where possible.

---

# 205. Export

Authorized export can include:

```text
Review

Rating

Product

Variant Context

Verification

Status

Moderation

Dates
```

Sensitive Customer details require separate permission.

---

# 206. Review Audit Events

Important:

```text
review.submitted

review.revision_submitted

review.approved

review.rejected

review.hidden

review.visibility_restored

review.removed_by_customer

review.response_created

review.response_updated

review.imported
```

---

# 207. Audit Context

Record:

```text
Actor

Review ID

Before / After state

Reason

Timestamp
```

---

# 208. Customer Submission Actor

Can record:

```text
Customer
```

rather than Internal User.

---

# 209. System Actor

Automated projection/moderation actions:

```text
SYSTEM
```

with reason.

---

# 210. Review Timeline

Internal Review page may show:

```text
Aug 10 — Submitted

Aug 10 — Moderation pending

Aug 11 — Approved by Alice

Aug 18 — Customer edited

Aug 18 — Revision pending

Aug 19 — Revision approved
```

---

# 211. Moderation Note

Internal only.

Never show moderator note publicly.

---

# 212. Product Timeline

Catalog/Product activity may show:

```text
New Review published

Review hidden
```

without duplicating Review audit.

---

# 213. Domain Events

Potential:

```text
review.submitted

review.published

review.updated

review.hidden

review.removed

review.response_published

product.rating_changed
```

---

# 214. Event Consumers

May update:

```text
Rating Projection

Storefront Cache

Search Projection

Notifications

Analytics

SEO rendering
```

---

# 215. Rating Projection Update

When Review becomes published:

```text
increment/recalculate summary
```

transactionally or reliably.

---

# 216. Projection Retry

If event processing fails:

```text
Review remains authoritative

Projection repair/rebuild available.
```

---

# 217. Storefront Cache Invalidation

Publishing/hiding Review should invalidate:

```text
Product Rating Summary

Review section
```

as required.

---

# 218. Search Ranking

Future search ranking may use Product rating.

Search must consume:

```text
Rating Summary Projection
```

not raw Review scans.

---

# 219. Rating and SEO

When Reviews are visibly presented on the Product page, the Storefront may expose eligible Review/AggregateRating structured data according to current search-engine requirements. Google's current Product/review documentation supports review and aggregate-rating information for Product pages.

---

# 220. Structured Data Eligibility

Only use:

```text
published

visible

customer-facing
```

Review data.

Do not include:

```text
Pending

Rejected

Hidden
```

Reviews in public structured data.

---

# 221. Structured Data Count

The structured rating count must be consistent with the actual public rating projection.

Do not publish:

```text
ratingCount = 1000
```

when Storefront has only:

```text
12 eligible Reviews.
```

---

# 222. Hidden Review and SEO

If Review becomes hidden:

```text
Rating Summary

Review List

Structured Data
```

must converge on the same public truth.

---

# 223. No Separate SEO Rating Database

SEO consumes Review projection.

It does not maintain another rating count.

---

# 224. Product Listing Rating

Product card may display:

```text
4.7 ★ (152)
```

from Product Rating Summary.

---

# 225. Rating Threshold for Display?

Do not hide poor ratings merely because:

```text
average < 3
```

If Review feature is enabled, presentation policy should be consistent.

---

# 226. Empty Review State

PDP:

```text
No reviews yet.

Be the first verified buyer to review this product.
```

when appropriate.

---

# 227. Write Review Eligibility UX

Anonymous viewer can see:

```text
Write a Review
```

but submission must establish purchase eligibility.

Possible routes:

```text
secure invitation

Order lookup

future Customer Account
```

---

# 228. Do Not Ask for Order ID + Phone Without Controls

Order-review lookup endpoint needs:

```text
rate limiting

safe errors

non-enumerable order identity

verification
```

to protect customer privacy.

---

# 229. Customer Already Reviewed

Show:

```text
You already reviewed this product.

[Edit Review]
```

when securely identified.

---

# 230. Customer Not Eligible

Safe message:

```text
Reviews are available to verified purchasers of this product.
```

No internal Order information is exposed.

---

# 231. Review Submission UX

Recommended:

```text
Your Rating ★★★★★

Review Title optional

Your Review optional

Add Photos optional

Purchased Variant displayed

Submit
```

---

# 232. Purchased Variant Selection

If Customer purchased Product multiple times/Variants:

```text
choose which qualifying purchase context
```

or use most relevant eligible line.

V1 can automatically select the qualifying Order Line tied to invitation.

---

# 233. Review Variant Snapshot

Public display can show:

```text
Purchased: Black / M
```

without exposing:

```text
Order Number
```

---

# 234. Review Image Preview

Customer sees image thumbnails before submit.

Can remove unwanted upload.

---

# 235. Submission Confirmation

After submit:

```text
Thanks. Your review is awaiting approval.
```

if manual moderation is enabled.

---

# 236. Do Not Pretend Pending Review Is Public

Avoid:

```text
Review published!
```

before moderation.

---

# 237. Review Moderation SLA

System can track:

```text
Pending since
```

and stale queue.

No need for strict SLA engine V1.

---

# 238. Stale Review Alert

Useful:

```text
Reviews pending > X days
```

for operations.

---

# 239. Review Health Dashboard

Potential:

```text
Pending Reviews

Rejected Reviews

Hidden Reviews

Reviews Awaiting Media Moderation

Duplicate Review Conflicts

Products With Aggregate Mismatch

Low-Rating Products

Stale Moderation
```

---

# 240. Product Rating Health

Detect:

```text
Published Reviews = 100

Projection Count = 99
```

and flag/rebuild.

---

# 241. Orphan Review

Review references missing Product:

```text
integrity failure
```

should not happen normally.

---

# 242. Missing Customer

Customer anonymization/merge must preserve Review's valid author relationship or anonymized identity.

---

# 243. Missing Purchase Reference

Verified Review whose qualifying Order reference disappeared:

```text
integrity/security issue.
```

Orders with commercial history should not be destructively deleted.

---

# 244. Review Product Unpublished

Review remains internally accessible.

Public Product route determines exposure.

---

# 245. Review Submission During Product Unpublish

If Product becomes unavailable between invitation and submission:

Policy can:

```text
accept Review internally
```

because historical purchase remains valid,

while Product remains non-public.

---

# 246. Review of Archived Product

May remain valid historical business record.

---

# 247. Rejected Review Resubmission

Customer may be allowed to edit/resubmit Review.

Create new Revision.

Do not require completely new Review identity.

---

# 248. Rejection Reason Customer Visibility

Some reasons can be shown safely:

```text
Please remove personal contact information.
```

Internal fraud/moderation notes may remain private.

---

# 249. Review Rating After Rejection

Rejected Review does not affect aggregate.

---

# 250. Hidden Review After Complaint

Hiding removes it from aggregate immediately.

Historical Review remains for investigation.

---

# 251. Merchant Response and Hidden Review

If Review hidden:

```text
Merchant Response also stops displaying.
```

---

# 252. Merchant Response and Review Edit

If Customer materially edits Review:

```text
existing Merchant Response may become contextually outdated.
```

System should flag:

```text
Review changed after merchant response
```

for business review.

---

# 253. Merchant Response Notification

Preferred:

notify responder/moderator when Review significantly changes.

---

# 254. Review Feature Disable

Business may disable new Review submissions.

Existing published Reviews can:

```text
remain visible
```

unless separate display setting says otherwise.

---

# 255. Submission vs Display Settings

Separate:

```text
Accept New Reviews

Display Existing Reviews
```

Avoid one setting that unexpectedly deletes public social proof.

---

# 256. Reviews Disabled on One Product

Future Product-level setting could disable Review submission/display for certain Product Types.

Not required V1 unless genuine need.

---

# 257. Rating Summary When Review Display Disabled

If business hides Reviews:

```text
do not continue exposing aggregate rating publicly
```

unless policy explicitly supports summary-only display.

Keep public presentation consistent.

---

# 258. Review Settings History

High-impact changes should be audited.

---

# 259. API Commands

Conceptual:

```text
submitReview()

submitReviewRevision()

removeOwnReview()

approveReview()

rejectReview()

hideReview()

restoreReviewVisibility()

createMerchantResponse()

updateMerchantResponse()

importReviews()
```

---

# 260. Eligibility APIs

Conceptual:

```text
getReviewEligibility()

createReviewInvitation()

resolveReviewAccess()
```

---

# 261. Read APIs

```text
getProductReviewSummary()

listPublishedProductReviews()

getAdminReview()

listModerationQueue()

getCustomerReviewHistory()

getReviewHealth()
```

---

# 262. Avoid Generic PATCH

Do not expose:

```text
PATCH /review {
  "rating": 5,
  "verifiedPurchase": true,
  "status": "published"
}
```

as one unrestricted update operation.

Use semantic commands.

---

# 263. Structured Errors

Examples:

```text
REVIEW_NOT_ELIGIBLE

REVIEW_ALREADY_EXISTS

REVIEW_ACCESS_INVALID

REVIEW_TOKEN_EXPIRED

REVIEW_RATING_INVALID

REVIEW_BODY_TOO_LONG

REVIEW_MEDIA_LIMIT_EXCEEDED

REVIEW_PENDING_MODERATION

REVIEW_ALREADY_REMOVED

REVIEW_REVISION_CONFLICT

REVIEW_MERGE_CONFLICT

REVIEW_VERSION_CONFLICT
```

---

# 264. Customer-Facing Error

Safe:

```text
You are not currently eligible to review this product.
```

not:

```text
Your Order 1025 is not in status COMPLETED.
```

---

# 265. Concurrency — Review Submission

Two simultaneous submissions for same Customer/Product:

```text
one succeeds
```

under one-active-review rule.

---

# 266. Concurrency — Review Editing

Two edit sessions cannot silently overwrite each other.

Use revision/version checks.

---

# 267. Concurrency — Moderation

Two moderators:

```text
Approve
```

and:

```text
Reject
```

simultaneously.

Only one valid moderation transition wins.

---

# 268. Concurrency — Customer Merge

Customer merge and Review submission must preserve canonical uniqueness.

---

# 269. Idempotency — Submission

Retry does not create duplicate Review.

---

# 270. Idempotency — Moderation

Retrying:

```text
Approve
```

should not duplicate events/projection increments.

---

# 271. Idempotency — Import

Re-import same external Review dataset should not duplicate Reviews.

---

# 272. Rating Projection Idempotency

Same:

```text
review.published
```

event retried must not increment Review count twice.

---

# 273. Projection Strategy

Two valid implementation patterns:

```text
Incremental updates
+
periodic/recovery rebuild
```

Recommended.

---

# 274. Rebuild Authority

Rebuild scans:

```text
eligible public Review revisions
```

and replaces projection state.

---

# 275. Review Count Consistency

Rating count means:

```text
number of Reviews contributing to aggregate
```

not:

```text
number of written comments
```

because rating-only Review counts too.

---

# 276. Written Review Count

If business needs separate metric:

```text
Reviews With Text
```

can be derived separately.

---

# 277. Review vs Rating Terminology

For V1:

> A Review is the customer evaluation record.
> Every Review contains a Rating.
> Text and images are optional.

This avoids managing separate independent `Rating` and `Review` records.

---

# 278. Why Not Separate Rating Table?

A Customer should not accidentally produce:

```text
Rating = 5
```

and later:

```text
Review = 4 stars
```

as contradictory independent evaluations.

One Review aggregate keeps the evaluation coherent.

---

# 279. Rating History

Revision history already preserves Rating changes.

No separate rating-event model required.

---

# 280. Test Scenario — Happy Path

```text
Customer purchases Dress Red / M
      ↓
Order completes
      ↓
Review eligibility created
      ↓
Customer submits ★★★★★ + image
      ↓
Media validated
      ↓
Review pending
      ↓
Moderator approves
      ↓
Review visible
      ↓
Product Rating Summary updates
```

---

# 281. Test Scenario — Negative Review

```text
Verified customer
      ↓
★☆☆☆☆
"Poor stitching"
      ↓
Content valid
      ↓
Approve
      ↓
Rating decreases
```

Correct behavior.

---

# 282. Test Scenario — Spam Review

```text
★★★★★
"CLICK THIS LINK ..."
```

Moderation:

```text
Reject: SPAM
```

No aggregate impact.

---

# 283. Test Scenario — Personal Information

```text
"My phone is 017..."
```

Review:

```text
Pending/hidden for privacy correction
```

before publication.

---

# 284. Test Scenario — Returned Item

Customer legitimately received item and returned because wrong fit.

Review:

```text
Verified Purchase = true
```

if qualification rules remain satisfied.

---

# 285. Test Scenario — Cancelled Order

Order cancelled before fulfillment.

Review submission:

```text
REVIEW_NOT_ELIGIBLE
```

---

# 286. Test Scenario — Duplicate Technical Request

Submit button retries three times.

Result:

```text
1 Review
```

---

# 287. Test Scenario — Repeat Purchase

Customer buys same Dress twice.

Result:

```text
Still one active Review
```

and existing Review can be updated.

---

# 288. Test Scenario — Customer Merge

Customer A:

```text
★★★★★ Product X
```

Customer B:

```text
★★★☆☆ Product X
```

Merge:

```text
REVIEW_MERGE_CONFLICT
```

requires explicit resolution.

---

# 289. Test Scenario — Customer Edits Rating

Published:

```text
★★★★★
```

Customer edits:

```text
★★★☆☆
```

Pending revision created.

Current public aggregate stays at:

```text
★★★★★
```

until new revision approved.

Then aggregate recalculates.

---

# 290. Test Scenario — Hide Review

Published Review:

```text
★★★★☆
```

Moderator hides for privacy investigation.

Immediately:

```text
Storefront removes Review

Aggregate excludes Review

SEO structured data excludes Review
```

---

# 291. Test Scenario — Product Archive

Review remains in internal history.

No Review hard deletion.

---

# 292. Important Invariants

### REV-INV-001

Every Review belongs to one Organization.

### REV-INV-002

Every Review has one Product subject in V1.

### REV-INV-003

Every Review has exactly one valid Rating on the configured V1 scale.

### REV-INV-004

Review text and images may be optional; Rating is mandatory.

### REV-INV-005

A Review privately references one canonical Customer.

### REV-INV-006

Public Review DTO never exposes Customer sensitive identity fields.

### REV-INV-007

Verified Purchase can only derive from trusted qualifying purchase history.

### REV-INV-008

Staff cannot manually toggle arbitrary Reviews into Verified Purchase status.

### REV-INV-009

One canonical Customer normally has at most one active Review per Product in V1.

### REV-INV-010

Customer merge cannot silently violate Review uniqueness.

### REV-INV-011

Purchased Variant context is historical and remains understandable after Variant changes/archive.

### REV-INV-012

Pending Reviews do not affect public Product rating.

### REV-INV-013

Rejected Reviews do not affect public Product rating.

### REV-INV-014

Hidden Reviews do not affect public Product rating while hidden.

### REV-INV-015

Removed Reviews do not affect public Product rating.

### REV-INV-016

Product rating/count fields are derived projections and not manually authoritative.

### REV-INV-017

Rating projection can be rebuilt from eligible Reviews.

### REV-INV-018

Customer Review edits create controlled revision history rather than silent destructive overwrite.

### REV-INV-019

A pending edit does not replace the approved public Revision until moderation succeeds.

### REV-INV-020

Staff cannot normally rewrite customer-authored Review text.

### REV-INV-021

Merchant Response is separate from Customer Review content.

### REV-INV-022

Merchant Response internal author remains auditable.

### REV-INV-023

Review media is not public merely because upload processing completed.

### REV-INV-024

Public Review media requires both Media safety and Review publication eligibility.

### REV-INV-025

Negative sentiment alone is never a valid moderation rejection reason.

### REV-INV-026

Review moderation actions are permission-controlled and audited.

### REV-INV-027

Review submission is idempotent.

### REV-INV-028

Moderation/projection events are retry-safe.

### REV-INV-029

Review Product/Customer/Purchase relationships obey Organization boundaries.

### REV-INV-030

Public structured Review/rating data must use the same public eligibility rules as Storefront Review presentation.

---

# 293. V1 Mandatory Scope

Maevelle V1 Reviews should include:

```text
✓ Review entity

✓ Product-level Review subject

✓ 1–5 star Rating

✓ Optional Review Title

✓ Optional Review Body

✓ Rating-only Reviews

✓ Review Images

✓ Customer relationship

✓ Safe public Author Display

✓ Purchased Variant context

✓ Verified Purchase

✓ Order/Order-Line verification

✓ Guest Customer Review eligibility

✓ Secure Guest Review access foundation

✓ One Active Review per Customer/Product

✓ Review Revisions

✓ Manual Moderation

✓ PENDING

✓ APPROVED

✓ REJECTED

✓ VISIBLE

✓ HIDDEN

✓ Customer Review Removal

✓ Moderation Reasons

✓ Negative Review protection from arbitrary rejection policy

✓ Review Media moderation integration

✓ Merchant Response

✓ Product Rating Summary

✓ Average Rating

✓ Rating Count

✓ 1–5 Distribution

✓ Verified Review Count

✓ Reviews With Media Count

✓ Rebuildable Aggregates

✓ Storefront Review List

✓ Storefront Rating Summary

✓ Filter by Rating

✓ With Photos

✓ Verified Purchase filter

✓ Review Pagination

✓ Newest / Highest / Lowest sorting

✓ Review Moderation Queue

✓ Duplicate Submission Protection

✓ Rate Limiting

✓ Review Security

✓ Customer Merge conflict handling

✓ Privacy-safe public DTO

✓ Permissions

✓ Audit

✓ Idempotency

✓ Concurrency protection

✓ SEO/structured-data integration foundation
```

---

# 294. Strongly Preferred V1

```text
Review Invitations

Review Invitation Notifications

Low Rating Alerts

Stale Moderation Alerts

Review Health Dashboard

Controlled Historical Review Import

Import Duplicate Detection

Review Export

Product Admin Review Tab

Merchant Response Notifications

Public Review Image Gallery

Rating Aggregate Integrity Checks

Emergency Privacy Hide
```

---

# 295. Foundation Now / Later

Architecture should prepare for:

```text
Customer Account Review Management

Delivery-Based Review Invitations

Helpful Votes

Reported Reviews

Structured Fit Feedback

Pros / Cons

Review Attributes

Customer Follow-Up Comments

External Review Syndication

AI Moderation

AI Review Summaries

Review Search

Review Sentiment Analytics

Marketplace Review Import
```

---

# 296. Deferred Advanced Capabilities

Post-V1:

```text
Most Helpful Ranking

Review Voting

Review Discussions

Automated Spam Scoring

AI Content Moderation

AI Review Summaries

AI Fit Analysis

Review Topic Extraction

Automatic Review Translation

External Review Networks

Review Incentive Programs

Advanced Fraud Detection

Video Reviews
```

---

# 297. Decisions Established

### Decision REV-001

**Review is a first-class domain entity.**

### Decision REV-002

**Every Review contains a Rating; title/body/media are optional.**

### Decision REV-003

**V1 uses a 1–5 star customer rating scale.**

### Decision REV-004

**Product is the primary Review subject; purchased Variant is contextual metadata.**

### Decision REV-005

**Product rating/count are derived projections rather than editable Product fields.**

### Decision REV-006

**Verified Purchase is calculated from trusted Order history.**

### Decision REV-007

**Guest Customers can submit Verified Reviews without Customer Accounts.**

### Decision REV-008

**V1 public customer Review submission requires qualifying purchase eligibility.**

### Decision REV-009

**One active Review per canonical Customer/Product is the V1 default.**

### Decision REV-010

**Repeat purchases do not automatically create additional rating weight.**

### Decision REV-011

**Customer Merge must explicitly resolve duplicate Review conflicts.**

### Decision REV-012

**Review State, Moderation State and Visibility are distinct.**

### Decision REV-013

**Manual moderation is the V1 default.**

### Decision REV-014

**Negative sentiment is not a moderation violation.**

### Decision REV-015

**Customer-authored content is never silently rewritten by staff.**

### Decision REV-016

**Customer edits create Review Revisions.**

### Decision REV-017

**A pending revision does not replace the last approved public revision until approved.**

### Decision REV-018

**Customer removal can hide their Review without waiting for ordinary moderation.**

### Decision REV-019

**Review media uses the central Media subsystem.**

### Decision REV-020

**Technically READY media is not automatically public Review media.**

### Decision REV-021

**Merchant Response is separate from Review content.**

### Decision REV-022

**Merchant Response publicly represents Maevelle while retaining internal staff authorship for audit.**

### Decision REV-023

**Only eligible visible approved Reviews contribute to Product rating summaries.**

### Decision REV-024

**Rating summaries are rebuildable projections.**

### Decision REV-025

**Imported Reviews preserve provenance and do not automatically become Verified Purchase.**

### Decision REV-026

**Review moderation/import/hiding are granular privileged actions.**

### Decision REV-027

**Review and rating structured data uses the same public truth presented to customers.**

---

# 298. Resulting Review Model

The main path:

```text
CUSTOMER
   │
   ▼
QUALIFYING ORDER LINE
   │
   ▼
REVIEW ELIGIBILITY
   │
   ▼
REVIEW
   │
   ▼
REVISION
   │
   ▼
MODERATION
   │
   ├── Rejected
   │
   └── Approved
          │
          ▼
       PUBLISHED
          │
          ├── Rating
          ├── Text
          ├── Images
          ├── Purchased Variant
          └── Merchant Response
          │
          ▼
PRODUCT RATING SUMMARY
          │
          ▼
       STOREFRONT
```

---

# 299. Guest Review Model

```text
Guest Customer
      ↓
Completed Order
      ↓
Order Line
      ↓
Review Eligibility
      ↓
Secure Review Link / Order Access
      ↓
Review Submission
```

No customer password is required.

---

# 300. Rating Projection

```text
Published Review A  ★★★★★

Published Review B  ★★★★☆

Published Review C  ★★★☆☆

Pending Review D    ★☆☆☆☆
                     │
                     │ excluded until approved
                     ▼

PRODUCT RATING SUMMARY
----------------------
Average: 4.0
Count: 3
```

The pending Review cannot influence customer-visible stars.

---

# 301. Edit Model

```text
Published Revision V1
★★★★★
"Great quality"
       │
       ▼
Customer edits
       │
       ▼
Pending Revision V2
★★★☆☆
"Good, but stitching loosened later"
       │
       ├── rejected → V1 remains public
       │
       └── approved → V2 becomes public
```

---

# 302. Customer Merge Model

```text
Customer A
└── Review Product X ★★★★★

Customer B
└── Review Product X ★★★☆☆

        ↓ Customer Merge

REVIEW CONFLICT
        ↓
Manual Resolution
        ↓
One Active Canonical Review
        ↓
Rating Projection Rebuilt
```

---

# 303. Storefront Result

The Product page can now reliably show:

```text
Floral Midi Dress

★★★★☆ 4.6 · 38 Reviews

★★★★★ 26
★★★★☆ 8
★★★☆☆ 3
★★☆☆☆ 1
★☆☆☆☆ 0


★★★★★
Nusrat J. · Verified Purchase
Purchased: Red / M

"The material looks beautiful and
the size guide was accurate."

[photo] [photo]


Maevelle
"Thank you for sharing your experience."
```

and every part has an authoritative source.

---

# 304. Architecture Milestone

Our public Product experience now has proper foundations for:

```text
Catalog

Variants

Media

Sizing

Inventory

Price

Search

Cart

Checkout

Reviews
```

while Reviews also connect backward to:

```text
Customer

Order

Order Line

Media
```

This closes another important integrity gap in the Product domain.

---

# 305. Recommended Next Domain

The next document should be:

```text
docs/domains/promotions/promotion-coupon-architecture.md
```

This is the next major commerce rule engine because Storefront and Orders already refer to:

```text
Coupon

Promotion

Discount

Eligibility

Promotion Snapshot
```

without yet defining exactly what those mean.

We need to formalize:

```text
Promotion

Coupon Code

Automatic Promotion

Discount Rule

Eligibility

Product/Category/Collection Targeting

Customer Eligibility

Minimum Spend

Minimum Quantity

Fixed Discount

Percentage Discount

Free Delivery

Buy X Get Y foundation

Promotion Period

Usage Limits

Per-Customer Limits

Stacking

Exclusions

Priority

Order-Level vs Line-Level Discounts

Discount Allocation to Order Lines

Rounding

Manual Discounts

Admin Price Override boundary

Coupon Reservation / Concurrency

Usage Counting

Cancellation / Refund interaction

Partial Return impact

Historical Promotion Snapshot

Duplicate Codes

Case Sensitivity

Abuse Prevention

Search

Permissions

Audit

Analytics
```

The most important issue will be preventing ambiguous discount math.

For example:

```text
Product A  ৳1,000
Product B  ৳2,000

Coupon:
10% off
```

should not be stored only as:

```text
discount_total = ৳300
```

because later:

```text
Product B is returned
```

and the system must know how much of the original discount belonged to each Order Line.

So Promotions should produce deterministic **discount allocations**, not just one final number.

---

**End of Reviews & Ratings Architecture v0.1**
