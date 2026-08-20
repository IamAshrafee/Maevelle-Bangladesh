# Maevelle Ecommerce — Customer Architecture

**Document:** `docs/domains/customers/customer-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `order-lifecycle-architecture.md`, `payment-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Customer domain defines how Maevelle represents people who purchase from, interact with, or develop a commercial history with the business.

It must support:

```text
Guest Checkout

Manual Orders

Repeat Customers

Multiple Addresses

Phone / Email Changes

Order History

Payment History

Returns

Reviews

Internal Notes

Customer Tags

Duplicate Detection

Customer Merge

Future Customer Accounts

Future Support

Future Marketing

Future Loyalty
```

without making:

```text
Customer = Login Account
```

or:

```text
Customer = Phone Number
```

---

# 2. Core Principle

> **Customer identity and Customer authentication are separate concepts.**

A person can be a Customer without having a login account.

V1:

```text
Customer
✓

Customer Account
Future
```

Therefore:

```text
Guest Checkout
```

still produces or associates with a Customer record.

---

# 3. Why This Matters

Suppose the same person orders through Facebook/manual ordering five times before customer accounts exist.

Their history should still become:

```text
Customer
├── Order 1
├── Order 2
├── Order 3
├── Order 4
└── Order 5
```

Later the person creates an account.

We want:

```text
Customer
      ↕
Customer Account
```

rather than:

```text
Old Guest Orders
+
New Account
=
Two unrelated identities
```

Saleor currently documents a similar pattern where anonymous orders with the relevant email can be associated with the customer account when that identity becomes known.

---

# 4. Customer Domain Responsibilities

Customer owns:

```text
Customer Identity

Customer Name

Customer Contact Points

Phone Numbers

Email Addresses

Customer Addresses

Preferred / Default Contact Information

Internal Notes

Customer Tags

Customer Source

Customer Status

Duplicate Candidates

Identity Matching

Customer Merge

Customer Statistics Projections

Customer Timeline

Privacy / Anonymization State
```

---

# 5. Customer Does Not Own

Customer does not own:

```text
Order Commercial State

Payment Transactions

Returns

Reviews

Support Tickets

Marketing Campaigns

Customer Authentication Credentials
```

It references or aggregates those domains.

---

# 6. Official Terminology

Preferred terminology:

```text
Customer

Customer Contact Point

Customer Phone

Customer Email

Customer Address

Customer Identity Signal

Customer Match Candidate

Customer Merge

Customer Alias / Historical Identity

Customer Note

Customer Tag

Customer Account
```

---

# 7. Customer

A **Customer** represents the business's stable commercial identity for a person or buyer.

Conceptually:

```text
Customer
├── Name
├── Phones
├── Emails
├── Addresses
├── Orders
├── Payments
├── Returns
├── Reviews
├── Notes
└── Statistics
```

---

# 8. Customer Is Not Defined by One Field

Never permanently define identity as:

```text
Customer ID = Phone Number
```

or:

```text
Customer ID = Email
```

because:

- phone numbers change;
- email addresses change;
- family members can share numbers;
- customers can type incorrect details;
- customers may have several numbers;
- duplicate records can exist.

Customer requires its own stable internal identity.

---

# 9. Stable Customer ID

Customer ID must survive:

```text
Phone change

Email change

Name correction

Address change

Account creation

Customer merge
```

---

# 10. Human-Readable Customer Number — Optional

The business may benefit from:

```text
CUS-000182
```

for support/admin use.

Not mandatory if internal ID + searchable identity is sufficient.

---

# 11. Customer Type

V1 primarily supports:

```text
INDIVIDUAL
```

Future platform use may require:

```text
BUSINESS
ORGANIZATION
```

for B2B.

Architecture should not make organization customers impossible.

---

# 12. Customer Status

Recommended:

```text
ACTIVE

INACTIVE

BLOCKED

ANONYMIZED
```

Potential:

```text
ARCHIVED
```

where operationally useful.

---

# 13. Active

Normal commercial customer.

---

# 14. Inactive

Customer remains historically valid but may no longer be actively engaged.

This should not remove Order history.

---

# 15. Blocked

Block may prevent:

```text
New Orders

COD

Selected Payment Methods
```

depending on business policy.

Potential reasons:

```text
Fraud

Repeated Fake Orders

Repeated Refusal

Abuse

Manual Business Decision
```

---

# 16. Blocking Is Not Deletion

A blocked Customer retains:

```text
Orders

Payments

Returns

Notes

History
```

so staff understand why the customer was blocked.

---

# 17. Contact Points

A Customer can have multiple contact points.

For example:

```text
Phone 1
Phone 2
Email 1
Email 2
```

Do not permanently limit the domain to:

```text
customer.phone

customer.email
```

even if V1 UI emphasizes one primary phone and one primary email.

---

# 18. Primary Contact

Customer may have:

```text
Primary Phone

Primary Email
```

for convenience.

But these are preferences over a collection of contact points.

---

# 19. Phone Number Model

A phone record should conceptually retain:

```text
Original Input

Normalized Number

Country / Region Context

Verification State

Primary Flag

Label

Created At
```

---

# 20. Original Phone Input

If customer enters:

```text
01712345678
```

we may preserve that original/display input where useful.

---

# 21. Normalized Phone

For comparison/search, normalize the number using a real phone-number parser.

Example possible normalized form:

```text
+8801712345678
```

Google's libphonenumber supports parsing, validating, and formatting international phone numbers and E.164-style output, which is why this architecture should use a standards-aware parser rather than string manipulation.

---

# 22. Do Not Normalize by Naive Prefix Replacement

Bad:

```text
if number starts 0:
    replace 0 with +880
```

This assumes:

- Bangladesh;
- mobile numbering;
- valid length;
- correct input.

A parser should use region context and validity rules.

---

# 23. Example Equivalent Inputs

Potentially equivalent after valid parsing:

```text
01712345678

8801712345678

+8801712345678
```

The application should compare normalized values rather than raw strings.

---

# 24. Invalid Number

Input:

```text
01712ABC
```

should not be normalized into a fabricated valid number.

Store validation errors and require correction where phone is required.

---

# 25. Bangladesh-First UX, International-Safe Model

Storefront can default phone parsing region to:

```text
Bangladesh
```

for usability.

But data architecture must not permanently assume every Customer phone belongs to Bangladesh.

---

# 26. Phone Verification

Verification state should be distinguishable from phone existence.

Potential:

```text
UNVERIFIED

VERIFIED

INVALID / FAILED
```

V1 does not necessarily need OTP verification.

But future account/security workflows may use it.

---

# 27. Verified Does Not Mean Identity-Proven

A verified phone confirms control of a number at a point in time.

It does not prove:

```text
Two Customer records with this phone
are definitely the same human.
```

This distinction matters for duplicate merging.

---

# 28. Email Model

Email should similarly have:

```text
Original Input

Normalized Comparison Form

Verification State

Primary Flag
```

---

# 29. Email Normalization

Safe normalization can include:

```text
trim surrounding whitespace

case-insensitive comparison where appropriate
```

Do **not** invent aggressive provider-specific transformations such as always deleting dots or `+tags`.

Those semantics differ by provider.

---

# 30. Customer Without Email

Valid.

Maevelle's Bangladesh/F-commerce workflow may often have:

```text
Phone only
```

Customer architecture must not require email.

---

# 31. Customer Without Phone

Potentially valid for future international/account use.

Business rules may require phone for current checkout.

That is Checkout validation, not a permanent Customer-domain invariant.

---

# 32. Multiple Phones

Example:

```text
Primary:
017...

Alternative:
018...
```

Valid.

---

# 33. Shared Phone Number

Critical edge case:

```text
Mother and daughter
```

may use the same family phone.

Therefore:

> Equal phone does not always prove equal Customer.

This is why automatic destructive merge based solely on phone is unsafe.

---

# 34. Recycled Phone Number

Over long periods a number may potentially change ownership.

Again:

```text
same normalized phone
≠
mathematically guaranteed same person
```

---

# 35. Shared Email

Less common but still possible:

```text
family@example.com
```

may represent multiple people.

Do not assume absolute identity from one signal when conflicting evidence exists.

---

# 36. Identity Signals

Potential identity signals:

```text
Normalized Phone

Normalized Email

Name

Addresses

Customer Account

Payment information references

Order behavior

Manually confirmed relationship
```

Different signals have different confidence.

---

# 37. Identity Matching

When new Order arrives, Customer matching should produce:

```text
Definite Match

Probable Match

Ambiguous Match

No Match
```

rather than blindly:

```text
if phone exists:
    use that customer
```

---

# 38. Recommended V1 Matching Strategy

Strong deterministic auto-linking may occur when:

```text
Normalized primary identifier matches
AND
there is no material conflict
```

Otherwise:

```text
Create / retain separate Customer
+
mark possible duplicate
```

Conservative identity handling is safer than incorrect merging.

---

# 39. Example — Strong Match

Existing Customer:

```text
Name:
Ayesha Rahman

Phone:
+8801712345678
```

New guest checkout:

```text
Ayesha Rahman
01712345678
```

with compatible details.

Strong match candidate.

---

# 40. Example — Ambiguous Match

Existing Customer:

```text
Rahima Begum
+8801712345678
```

New checkout:

```text
Nusrat Jahan
+8801712345678
```

Different name and address.

Do not silently merge.

Flag:

```text
Possible Shared Phone / Duplicate
```

---

# 41. Example — Email Match but Different Phone

Could indicate:

```text
Customer changed number
```

or:

```text
shared email
```

Use matching confidence and history.

---

# 42. Match Confidence

Conceptually:

```text
EXACT

HIGH

MEDIUM

LOW
```

The exact scoring system need not become an AI model.

V1 can use transparent deterministic rules.

---

# 43. No Opaque Identity Algorithm

Operators should be able to understand:

```text
Why is this Customer considered a duplicate?
```

Example:

```text
Same normalized phone
Same email
Similar name
Same delivery address
```

---

# 44. Customer Creation During Checkout

Flow:

```text
Guest Checkout
     ↓
Normalize Contact Information
     ↓
Search Match Candidates
     ↓
Confident Existing Customer?
     │
   Yes ──► Link Order
     │
    No
     ▼
Create Customer
```

Ambiguous candidate may additionally create duplicate-review signal.

---

# 45. Customer Creation During Manual Order

Same core identity-resolution workflow.

Do not create separate:

```text
Facebook Customer
```

and:

```text
Storefront Customer
```

models.

---

# 46. Customer Source

Customer can have acquisition/source metadata.

Examples:

```text
STOREFRONT

MANUAL_ORDER

FACEBOOK

INSTAGRAM

IMPORT

ADMIN_CREATED

FUTURE_API
```

---

# 47. First Source vs Latest Source

Potential distinction:

```text
Acquisition Source

Latest Order Source
```

Do not overwrite:

```text
Originally came from Facebook
```

because customer later orders on Storefront.

---

# 48. Customer Addresses

Customer can have multiple addresses.

This is a standard commerce requirement; Shopify's current Customer/MailingAddress APIs support multiple customer addresses and a default address, while Medusa's Customer model likewise associates addresses with a customer.

---

# 49. Customer Address Structure

Potential:

```text
Recipient Name

Phone

Address Line 1

Address Line 2

Area / Neighborhood

City

District / Region

Postal Code

Country

Instructions

Label
```

---

# 50. Bangladesh Address Reality

Bangladesh addresses may rely heavily on:

```text
Area

Road

House

Landmark

Thana / Upazila

District
```

The UI should be practical for local addresses without making the core model Bangladesh-only.

---

# 51. Address Labels

Examples:

```text
Home

Office

Parents

Other
```

Labels are convenience metadata.

---

# 52. Default Address

Customer may have:

```text
Default Shipping Address
```

and potentially future:

```text
Default Billing Address
```

---

# 53. Order Address Snapshot vs Customer Address

Critical distinction:

```text
Customer Address
=
Reusable current address
```

```text
Order Address Snapshot
=
Address used for that transaction
```

Editing the customer address must never rewrite historical Orders.

---

# 54. Checkout New Address

Customer orders using a new address.

Possible flow:

```text
Order snapshot created
```

and Customer-domain policy may:

```text
Add/reuse the address in Customer profile
```

where appropriate.

---

# 55. Duplicate Address Detection

Avoid storing 20 identical address records for a repeat Customer.

Normalize enough structure to detect likely identical addresses.

But do not aggressively merge addresses that have meaningful differences.

---

# 56. Address History

Customer profile should preserve useful address history without requiring every obsolete address to remain selected as current.

Potential status:

```text
ACTIVE

INACTIVE
```

or simply usage metadata.

---

# 57. Address Usage

Useful derived information:

```text
Last Used

Order Count

First Used
```

---

# 58. Address Verification — Future

Future courier/location integrations may:

```text
validate district

standardize postcode

geocode
```

but V1 should accept normal human-entered Bangladesh addresses.

---

# 59. Customer Name

Name should not be an immutable identity key.

Support:

```text
Name correction

Spelling change

Different preferred name
```

without creating new Customer.

---

# 60. Name Structure

For international flexibility:

```text
Given / First Name

Family / Last Name

Display Name
```

may be supported.

But Bangladesh UI should not force Western assumptions where unnecessary.

A flexible display/full-name experience is important.

---

# 61. Customer Display Name

Can derive from:

```text
Provided Name
```

with fallback to:

```text
Phone
or
Email
```

where no name exists.

Shopify's current Customer object uses a similar fallback concept for display name when personal names are unavailable.

---

# 62. Customer Notes

Internal staff notes:

```text
Prefers calls after 5 PM.

Repeatedly requests size M.

Previous delivery issue.
```

---

# 63. Notes Are Internal

Customer notes should not automatically appear to the customer.

Future customer-account data export/privacy rules may require careful classification.

---

# 64. Structured Notes vs One Giant Textarea

A chronological note model is stronger than:

```text
customer.notes = one giant mutable blob
```

Preferred:

```text
Customer Note
├── Author
├── Date
├── Text
└── Optional type
```

---

# 65. Customer Tags

Lightweight internal tags:

```text
VIP

Wholesale

Frequent Buyer

High Return Rate

Facebook Lead
```

---

# 66. Tags Are Not Customer State

Do not represent:

```text
BLOCKED
```

using merely:

```text
Tag = blocked
```

Important business state deserves structured fields.

---

# 67. Customer Groups — Future / Foundation

Future:

```text
VIP Customers

Wholesale

Repeat Buyers

Employees
```

can be represented through Customer Groups or dynamic Segments.

Medusa currently provides customer groups as part of its Customer module, demonstrating the usefulness of customer grouping as a separate commerce concept.

V1 can rely on tags and derived metrics unless actual pricing/business logic needs formal groups.

---

# 68. Customer Statistics

Customer page should expose useful derived metrics.

Examples:

```text
Total Orders

Confirmed Orders

Completed Orders

Cancelled Orders

Total Spend

Net Spend

Average Order Value

First Order Date

Last Order Date

Return Count

Refund Amount
```

---

# 69. Statistics Are Derived

Do not manually edit:

```text
customer.total_spend = 10000
```

These metrics derive from Orders/Payments according to explicit definitions.

---

# 70. Total Spend Definition

This needs a precise metric.

Potential interpretations:

```text
Gross Order Value

Confirmed Order Value

Delivered Order Value

Net Paid Value

Net Revenue after Refund
```

The Customer domain should not ambiguously label one of them:

```text
Total Spend
```

without documented definition.

---

# 71. Recommended Customer Spend Metric

For operational customer profile:

```text
Net Completed Sales
```

or another clearly documented metric can be primary.

Additional metrics can be separately exposed.

---

# 72. Average Order Value

Must define which Orders qualify.

Example:

```text
Completed Orders only
```

rather than including cancelled Orders.

---

# 73. Repeat Customer

Should be derived using an explicit rule.

Example:

```text
2+ completed Orders
```

not a manually toggled boolean.

---

# 74. Customer Lifetime Value — Future

True CLV prediction is advanced.

V1 should not label:

```text
historical spend
```

as:

```text
Customer Lifetime Value
```

unless it really means predicted/defined lifetime value.

Use precise terminology.

---

# 75. Order History

Customer detail should show:

```text
Order Number

Date

Status

Total

Payment

Fulfillment

Source
```

Order remains authoritative.

---

# 76. Payment History

Customer page can show linked:

```text
Payments

Refunds

Outstanding Payment Issues
```

Payment domain remains authoritative.

---

# 77. Return History

Customer page can aggregate:

```text
Returns

Return Reasons

Returned Quantity
```

without embedding return workflow inside Customer.

---

# 78. Review History

Future/current Review domain can display:

```text
Reviews submitted

Products reviewed

Moderation status
```

Customer merely links identity.

---

# 79. Customer Timeline

A unified human-friendly timeline may include:

```text
Customer created

Order placed

Order completed

Payment received

Refund issued

Return received

Address added

Phone changed

Note added

Customer merged

Account linked
```

---

# 80. Timeline vs Audit

Timeline:

```text
Business/customer interaction history
```

Audit:

```text
Administrative data-change history
```

Do not confuse them.

---

# 81. Customer Search

Search should support:

```text
Name

Phone

Normalized Phone

Email

Address

Customer Number

Order Number
```

Modern commerce platforms expose customer search across contact and address information; Shopify's customer query includes filters over customer identity/history, and Saleor's customer search includes names, email, and addresses.

---

# 82. Phone Search UX

Searching:

```text
01712345678
```

should be capable of finding stored:

```text
+8801712345678
```

through normalization.

---

# 83. Partial Phone Search

Authorized operations may need:

```text
last digits
```

search.

Be careful with privacy and indexing.

---

# 84. Customer Filters

Useful:

```text
Active

Blocked

Repeat Customer

Has Orders

No Orders

Order Count

Spend Range

Last Order Date

Source

Tags

Has Duplicate Candidate

Has Account
```

---

# 85. Saved Views

Examples:

```text
Repeat Customers

New This Month

High-Value Customers

Blocked Customers

Potential Duplicates

Inactive Customers

Facebook Customers
```

---

# 86. Customer List

High-priority columns:

```text
Customer

Primary Contact

Orders

Spend

Last Order

Source

Status

Alerts
```

---

# 87. Customer Detail UX

Recommended:

```text
Overview

Orders

Payments

Addresses

Returns

Reviews

Notes

Timeline

Identity / Duplicates

Audit
```

---

# 88. Overview

Should answer quickly:

```text
Who is this Customer?

How can we contact them?

How many Orders?

When did they last order?

How much business history?

Any warning/block?

Any duplicate issue?
```

---

# 89. Duplicate Customer Problem

Example:

Customer orders first as:

```text
Name:
Nusrat

Phone:
01712345678
```

Later:

```text
Nusrat Jahan

Phone:
+8801712345678
```

If normalized identity was not used properly, two Customer records may exist.

The system needs controlled duplicate management.

---

# 90. Duplicate Candidate

A **Duplicate Candidate** means:

> The system suspects two Customer records may represent the same person.

It does not mean they have already been merged.

---

# 91. Duplicate Reasons

Show:

```text
Same normalized phone

Same email

Same address

Similar name

Same payment contact information

Manual staff report
```

---

# 92. Duplicate Confidence

Possible:

```text
HIGH

MEDIUM

LOW
```

with transparent reasons.

---

# 93. Duplicate Queue

Operational screen:

```text
Customer A
Customer B

Matching Signals

Conflicting Signals

Order Counts

Addresses

[Compare]
```

---

# 94. Merge Is Explicit

A Customer Merge should be an explicit privileged operation.

Shopify's current GraphQL API similarly exposes dedicated customer-merge and merge-preview operations rather than treating merge as a simple profile update.

---

# 95. Merge Preview

Before merge, show:

```text
Surviving Customer

Phones

Emails

Addresses

Orders

Payments

Returns

Notes

Tags

Account Relationship

Conflicts
```

This is critical.

---

# 96. Why Preview Matters

Customer A:

```text
Phone:
017...

Email:
a@example.com

Orders:
5
```

Customer B:

```text
Phone:
017...

Email:
b@example.com

Orders:
3
```

The same phone does not tell us which email is correct.

Merge must allow conflict decisions.

---

# 97. Surviving Customer

A merge results in one canonical Customer.

Conceptually:

```text
Customer A
   \
    → Customer C / surviving identity
   /
Customer B
```

or one existing record is designated survivor.

---

# 98. Merge Alias

The absorbed Customer ID should not become an unexplained dead identifier.

Maintain:

```text
Merged Customer Alias
→ Canonical Customer
```

so old references/imports can resolve safely.

---

# 99. Historical Foreign Keys

When practical, transactional records can be reassigned to canonical Customer.

But their transaction-time Customer snapshots remain unchanged.

---

# 100. Merge Does Not Rewrite Order Snapshot

Order originally:

```text
Customer Name Snapshot:
Nusrat
```

After Customer merge:

```text
Customer master name:
Nusrat Jahan
```

old Order snapshot remains:

```text
Nusrat
```

if that was transaction-time data.

---

# 101. Merge Contact Points

Combined:

```text
Phones

Emails

Addresses
```

need deduplication.

Exact duplicates should not produce unnecessary duplicate contact rows.

---

# 102. Merge Conflicts

Potential conflicts:

```text
Different primary phone

Different primary email

Different names

Different account linkage

Different marketing consent

Blocked vs Active
```

The system must not arbitrarily choose silently.

---

# 103. Merge Blocking Conditions

Some merges should be blocked until resolved.

Examples:

```text
Two incompatible Customer Accounts

Active merge already in progress

Organization mismatch

Sensitive unresolved conflict
```

---

# 104. Merge Permission

Suggested:

```text
customers.merge
```

separate from:

```text
customers.edit
```

because merge has broad consequences.

---

# 105. Merge Audit

Record:

```text
Source Customers

Surviving Customer

Conflict Decisions

Actor

Timestamp

Reason
```

---

# 106. Merge Undo?

Full automatic undo can become very complex once post-merge activity occurs.

V1 should prefer:

```text
Strong preview + confirmation
```

over promising unrestricted reversible merge.

If a wrong merge occurs, provide controlled administrative separation/correction later if feasible.

---

# 107. Auto-Merge Is Dangerous

The system should **not** automatically merge Customer records merely because:

```text
phone matches
```

when conflicting signals exist.

Auto-linking new Orders to a confident existing record and destructive merge of two existing histories are different operations.

---

# 108. Matching vs Merge

Important distinction:

```text
MATCH
=
This new transaction belongs to an existing Customer.
```

```text
MERGE
=
Two already-existing Customer records should become one.
```

Keep these separate.

---

# 109. Account Relationship

Future:

```text
Customer
     ↕
Customer Account
```

Account owns:

```text
Authentication

Password / Identity Provider

Sessions

Login Security
```

Customer owns commerce history.

---

# 110. Customer Can Exist Without Account

Always valid.

---

# 111. Account Should Link to Existing Customer

When customer registers, system should try to associate the Account with the appropriate Customer rather than create a fresh unrelated Customer.

---

# 112. Account Matching Requires Verification

Because login identity is security-sensitive, linking should require verified account identity such as:

```text
Verified email

Verified phone

Controlled claim flow
```

rather than matching only a typed name.

---

# 113. Anonymous Historical Orders

When an Account is securely linked to Customer:

```text
Customer's previous Guest Orders
```

can appear in account history.

Saleor currently documents this type of anonymous-order-to-account linkage for matching identity.

---

# 114. Account Does Not Rewrite Order History

Orders remain transaction records.

The Account simply gains access to Orders belonging to the linked Customer according to authorization rules.

---

# 115. Account Deletion

Deleting/deactivating authentication should not automatically delete Customer commercial history.

Saleor similarly distinguishes continuing customer/order data from account/staff lifecycle in its user model documentation.

---

# 116. Multiple Accounts per Customer?

Normal consumer model should be:

```text
One active Customer Account
↔
One Customer
```

unless a future B2B/shared-company model explicitly requires otherwise.

---

# 117. Customer Import

V1 should support controlled CSV/XLSX-friendly Customer import where useful.

Fields:

```text
Name

Phone

Email

Address

Tags

Notes

Source
```

---

# 118. Import Is Identity-Sensitive

Before import:

```text
Normalize

Validate

Search existing Customers

Identify conflicts

Preview
```

---

# 119. Import Match Options

For each row:

```text
Create New

Update Existing

Potential Duplicate — Review

Invalid
```

---

# 120. Never Blindly Upsert by Phone

Because shared phones exist.

Import should use matching rules and preview.

---

# 121. Customer Export

Export according to permissions:

```text
Customer

Contacts

Addresses

Order Stats

Tags

Status
```

Sensitive fields and consent rules must be respected.

---

# 122. Customer Notes Import

Imported notes should preserve:

```text
Import Source

Imported At
```

where useful.

---

# 123. Customer Source History

If imported from old business data:

```text
Source:
LEGACY_IMPORT
```

can remain useful.

---

# 124. Manual Customer Creation

Staff can create Customer without immediately creating Order.

Useful for:

```text
Phone enquiry

Lead converted manually later

Existing offline customer
```

But Maevelle should not become a generic CRM at V1.

---

# 125. Customer vs Lead

Future Marketing/CRM may need:

```text
Lead
```

before a person becomes a Customer.

Do not overload Customer with full lead-management lifecycle now.

---

# 126. Customer Definition

Practical V1:

A person can become a Customer through:

```text
Order

Manual Customer Creation
```

Future CRM may distinguish prospect/lead more deeply.

---

# 127. Customer Tags vs Marketing Consent

These are separate.

```text
Tag: VIP
```

does not mean:

```text
Marketing Consent = yes
```

---

# 128. Marketing Consent — Foundation

Future marketing requires explicit consent/preference records.

Potential:

```text
Email Marketing

SMS Marketing

WhatsApp Marketing
```

with:

```text
Consent State

Source

Timestamp
```

Do not infer consent from having contact information.

Shopify's current customer creation model also treats marketing consent as explicit customer data rather than implying it from contact details.

---

# 129. V1 Marketing Scope

No full marketing engine required.

Architecture should simply not make future consent impossible.

---

# 130. Customer Communication Preferences — Future

Potential:

```text
Preferred Channel

Preferred Language

Do Not Call

Do Not SMS
```

---

# 131. Locale / Language

Customer may eventually have:

```text
Preferred Locale
```

for communications.

Not required for Bangladesh-only V1 but safe to prepare.

---

# 132. Customer Risk Signals

Potential operational flags:

```text
Repeated Cancellation

Repeated Refused COD

Fraud Warning

Address Problem
```

These can derive from Orders and staff notes.

---

# 133. Risk Score — Future

Do not build opaque automated risk scoring in V1.

Use transparent operational facts/flags.

---

# 134. COD Reliability Metric — Future / Useful

Potential:

```text
COD Delivered:
8

COD Refused:
2
```

can later inform COD eligibility.

This must be derived from Delivery history.

---

# 135. Customer Blocking Policy

A Block should not automatically mean:

```text
Delete Customer
```

or:

```text
Hide history
```

It controls future operations.

---

# 136. Block Reason

Structured:

```text
Fraud

Repeated Fake Orders

Repeated Refusal

Abuse

Payment Issue

Other
```

and notes.

---

# 137. Temporary Block — Future

Could support:

```text
Blocked Until
```

but permanent/manual status is sufficient V1.

---

# 138. Customer Data Ownership

Customer Master information belongs to Customer domain.

Order snapshots are owned by Orders.

Payment references belong to Payments.

Support data belongs to Support.

Avoid creating one enormous Customer table containing every feature.

---

# 139. Customer Metrics Projection

Metrics should be a read projection.

Potential:

```text
Customer Summary
```

maintained/recalculated from domain events.

---

# 140. Why Projection?

Customer list should not run expensive aggregate queries across all Orders/Payments every time.

At scale:

```text
order_count

last_order_at

net_spend
```

can be maintained as projections while source domains remain authoritative.

---

# 141. Projection Repair

Because projections can become inconsistent after software failure, the system should be able to:

```text
Rebuild Customer Metrics
```

from authoritative transactional data.

---

# 142. Customer Timeline Projection

Likewise, timeline can assemble relevant events without duplicating transactional truth.

---

# 143. Customer Search Index

Search projection may index:

```text
Name

Normalized Phone

Phone variants for search

Email

Address

Tags

Customer Number
```

---

# 144. Search Is Not Identity Authority

Search result similarity does not itself merge Customers.

Identity-resolution logic remains explicit.

---

# 145. Customer Data Privacy

Customer data includes personally identifying contact/address information.

Access should follow least-privilege principles.

Shopify currently classifies access to customer information as protected customer data in its developer platform, which reinforces treating these fields as sensitive business data rather than generic public metadata.

---

# 146. Permissions

Suggested:

```text
customers.view

customers.view_sensitive

customers.create

customers.edit

customers.contacts.manage

customers.addresses.manage

customers.notes.view

customers.notes.manage

customers.tags.manage

customers.block

customers.unblock

customers.duplicates.view

customers.merge

customers.export

customers.anonymize
```

---

# 147. Sensitive Contact Display

Users without sensitive-data permission may see:

```text
017****5678
```

rather than full number.

Exact masking policy depends on role/task.

---

# 148. Warehouse Staff

May need:

```text
Recipient Name

Delivery Phone

Delivery Address
```

for relevant Order fulfillment.

They do not necessarily need:

```text
Entire Customer lifetime payment history

Notes

Other addresses
```

---

# 149. Customer Support Staff

May need broader Customer history but not:

```text
Landed Cost

Supplier information
```

Cross-domain permissions must remain clean.

---

# 150. Marketing Staff — Future

Could receive permitted marketing/customer segments without payment-sensitive information.

---

# 151. Customer Data Minimization

APIs should return only fields needed for the operation.

Do not send entire Customer object with:

```text
All addresses

All notes

All payment history
```

to every frontend screen.

---

# 152. Public Storefront Exposure

Public storefront must never expose Customer records through guessable IDs.

Account customer data later requires authenticated authorization.

---

# 153. Customer Enumeration

Endpoints such as:

```text
Does this phone belong to a Customer?
```

must avoid leaking customer existence publicly.

---

# 154. Account Registration Privacy

Future signup should not tell attackers excessive information such as:

```text
This exact person already has five orders.
```

Identity-claim flows require careful responses.

---

# 155. Customer Anonymization

Commercial/legal retention may require keeping Orders while removing unnecessary personal identity.

Therefore support future/controlled:

```text
ANONYMIZE CUSTOMER
```

rather than deleting all connected transactions.

---

# 156. Anonymization Effects

Potential:

```text
Name → anonymized

Phones → removed/masked

Emails → removed/masked

Addresses → anonymized where legally permitted

Notes → reviewed

Customer record → retained as anonymous historical identity
```

Exact legal policy will be defined later.

---

# 157. Order Snapshots and Privacy

Order snapshots also contain personal information.

Anonymizing Customer master alone may not satisfy a deletion/privacy requirement.

Future privacy workflow must coordinate:

```text
Customer

Orders

Payments

Returns

Support
```

according to applicable law and retention obligations.

---

# 158. Hard Delete

Customer with transaction history should generally not be hard-deleted through ordinary UI.

Use:

```text
Anonymize

Block

Archive/Inactive

Merge
```

as appropriate.

---

# 159. Empty Customer

A Customer accidentally created with:

```text
No Orders

No Payments

No Reviews

No operational references
```

may be safely deletable under controlled rules.

---

# 160. Customer Merge and Privacy

If an anonymization request occurs after merge, merged aliases/history must also be considered.

---

# 161. Audit

Important actions:

```text
customer.created

customer.updated

customer.phone_added

customer.email_changed

customer.address_added

customer.blocked

customer.unblocked

customer.merge_started

customer.merged

customer.anonymized
```

---

# 162. Audit Sensitive Values

Audit must be useful without unnecessarily exposing full sensitive values forever.

For example, changes may store masked/hash/reference representations where appropriate.

Detailed Audit Architecture will define policy.

---

# 163. Phone Change Audit

Example:

```text
Primary Phone changed

Old:
017****5678

New:
018****4321
```

with actor/time.

---

# 164. Customer Timeline Event

Customer timeline may show:

```text
Primary phone updated
```

without displaying sensitive before/after values to every user.

---

# 165. Merge Timeline

Surviving Customer timeline:

```text
Merged with Customer CUS-00281
```

with permission-controlled details.

---

# 166. Customer API Commands

Conceptual:

```text
createCustomer()

updateCustomerProfile()

addPhone()

setPrimaryPhone()

addEmail()

addAddress()

setDefaultAddress()

blockCustomer()

unblockCustomer()

findCustomerMatches()

previewCustomerMerge()

mergeCustomers()

anonymizeCustomer()
```

---

# 167. Identity Matching API

Internal/application service:

```text
resolveCustomerIdentity(
  phone,
  email,
  name,
  address,
  context
)
```

returns candidates and confidence rather than silently mutating.

---

# 168. Avoid Generic Upsert

Do not expose logic equivalent to:

```text
upsert customer where phone = X
```

for every checkout/import operation.

Identity is too nuanced.

---

# 169. Customer Query APIs

Potential:

```text
getCustomer()

listCustomers()

searchCustomers()

getCustomerOrders()

getCustomerPayments()

getCustomerAddresses()

getCustomerTimeline()

getCustomerDuplicateCandidates()
```

---

# 170. Structured Errors

Examples:

```text
CUSTOMER_NOT_FOUND

PHONE_INVALID

EMAIL_INVALID

CONTACT_ALREADY_EXISTS

CUSTOMER_BLOCKED

CUSTOMER_NOT_MERGEABLE

CUSTOMER_MERGE_CONFLICT

CUSTOMER_MERGE_IN_PROGRESS

ACCOUNT_LINK_CONFLICT

CUSTOMER_VERSION_CONFLICT
```

---

# 171. Concurrency

Two staff may edit:

```text
Customer phone
```

and:

```text
Customer address
```

at the same time.

Use versioning/optimistic concurrency for meaningful profile updates.

---

# 172. Merge Concurrency

While Customer A/B are being merged:

```text
Second merge involving A
```

should be blocked or serialized.

---

# 173. Checkout During Merge

A new Order may arrive while merge is in progress.

Identity-resolution service must safely resolve canonical identity or retry.

Do not lose the Order.

---

# 174. Canonical Customer Resolution

Any merged Customer alias should resolve:

```text
Old Customer ID
→ Canonical Customer ID
```

internally where appropriate.

---

# 175. Idempotency

Customer creation from retrying Checkout must not necessarily create duplicate Customers when the same Checkout operation is retried.

Order idempotency plus Customer-resolution logic should coordinate.

---

# 176. Import Idempotency

Re-uploading the same migration file should not create duplicate Customers blindly.

Use import operation identity and matching preview.

---

# 177. Merge Idempotency

Retrying the same confirmed merge operation should resolve to the same result rather than merging again.

---

# 178. Customer Account Claim — Future

Future account signup:

```text
Verify phone/email
      ↓
Find eligible Customer
      ↓
Claim/link Customer
      ↓
Previous Orders visible
```

---

# 179. Ambiguous Account Claim

If identity matches multiple Customer records:

```text
Do not automatically expose all histories.
```

Require safe resolution/merge.

This is both a data-quality and security requirement.

---

# 180. Customer Account Change

Changing authenticated email/phone does not automatically mean Customer's historical contact points should disappear.

Account security and commerce contact preferences may evolve separately.

---

# 181. Cross-Device Persistent Cart — Future

Account relationship enables:

```text
Customer Account
→ Persistent Cart
```

But Cart remains its own domain/state.

---

# 182. Wishlist — Future

Likewise:

```text
Customer/Account
→ Wishlist
```

without changing Customer core model.

---

# 183. Loyalty — Future

Potential:

```text
Points

Tier

Rewards
```

should be separate Loyalty domain using Customer identity.

Do not add:

```text
loyalty_points
```

directly to Customer core without domain design.

---

# 184. Store Credit — Future

Customer may eventually have:

```text
Store Credit Account
```

separate from Payment transactions.

Medusa currently models store-credit accounts separately from core customer records, which is a useful boundary pattern.

---

# 185. Support Integration — Future

Support tickets/chat reference:

```text
Customer ID
```

so support agents see relevant context.

Support does not own Customer identity.

---

# 186. Marketing Integration — Future

Marketing segments can consume:

```text
Order history

Tags

Source

Spend

Recency

Product interests
```

subject to consent/privacy rules.

---

# 187. Customer Segmentation

Future segmentation examples:

```text
Bought Hats

Bought More Than 3 Times

Spent > ৳20,000

No Order in 90 Days

High Return Rate
```

Segments are derived/query logic.

Not Customer master fields.

---

# 188. RFM — Future

Could calculate:

```text
Recency

Frequency

Monetary
```

later.

No V1 requirement.

---

# 189. Customer Analytics

Useful V1:

```text
New Customers

Repeat Customers

Customers by Source

Order Count per Customer

Average Order Value

Customer Spend Distribution

Repeat Purchase Rate

Top Customers
```

---

# 190. New Customer Definition

Must be explicit.

Example:

```text
First completed Order during selected period
```

or:

```text
Customer record created during period
```

Those are different metrics.

Analytics must state which one.

---

# 191. Repeat Purchase Rate

Define based on:

```text
qualifying completed Orders
```

rather than raw Customer records.

---

# 192. Customer Source Attribution

Initial source may be:

```text
Facebook
```

but later Orders may be Storefront.

Analytics should preserve:

```text
Acquisition Source

Order Source
```

separately.

---

# 193. Customer Search Performance

Customer dataset can grow substantially.

Search/index design should prepare for:

```text
Normalized phone exact search

Email exact/prefix search

Name full-text

Address text

Customer number
```

---

# 194. Sensitive Indexing

Search infrastructure should not expose sensitive indexes publicly.

Customer search is authenticated/internal.

---

# 195. Metrics Performance

Customer list should use prepared projections rather than doing complex Order aggregation per row.

Avoid N+1 queries.

---

# 196. Customer History Pagination

Orders, Payments, Notes, Timeline must be paginated.

Do not load lifetime history in one request.

---

# 197. Customer Merge Scale

A Customer could have hundreds/thousands of related records.

Merge implementation must use safe transactional/batch strategy.

Shopify's current merge API can represent customer merging as a job and provides a merge preview/resulting customer, which supports treating merge as a meaningful data operation rather than a trivial row update.

---

# 198. Domain Events

Potential:

```text
customer.created

customer.updated

customer.contact_added

customer.address_added

customer.blocked

customer.unblocked

customer.merged

customer.anonymized

customer.account_linked
```

---

# 199. Event Consumers

May update:

```text
Search

Analytics

Notifications

Marketing

Support

Audit

Customer Metrics
```

---

# 200. Duplicate Candidate Event

Potential:

```text
customer.duplicate_suspected
```

can create internal notification/task.

No need to alert customers.

---

# 201. Customer Metrics Events

Order completion:

```text
order.completed
```

may update:

```text
Customer order count

Last order

Spend projection
```

Return/refund events update relevant projections.

---

# 202. Metrics Recalculation

If business changes metric definition, rebuild Customer metrics from source transactions.

Do not permanently encode business analytics into irreversible counters.

---

# 203. Failure Scenario — Wrong Auto-Link

New Order gets linked to wrong Customer.

Staff should be able to:

```text
Reassign Customer association
```

before/through controlled correction.

Order snapshot remains unchanged unless separately corrected.

---

# 204. Failure Scenario — Duplicate Customer Created

No data loss.

Mark duplicate and merge later.

This is much safer than risky auto-merging.

---

# 205. Failure Scenario — Wrong Merge

This is serious.

Strong preview, permissions, conflicts, and audit are mandatory.

Potential recovery tool can be designed later, but preventing bad merge is priority.

---

# 206. Failure Scenario — Phone Normalization Library Update

Phone metadata/rules can evolve.

Do not change stable Customer IDs because normalized presentation changes.

Future migration may recompute normalized values carefully.

---

# 207. Failure Scenario — Invalid Legacy Phone

Imported Customer has:

```text
017XXXX
```

Keep record if business history matters.

Mark phone:

```text
INVALID / UNVERIFIED
```

rather than deleting Customer.

---

# 208. Failure Scenario — Shared Number

Two valid Customers share same phone.

System must allow this exceptional state with:

```text
Shared Contact / conflict indicator
```

rather than violating history.

---

# 209. Uniqueness Policy

Therefore normalized Phone should **not automatically be a universal hard unique key** at Customer level.

A unique constraint may exist on specific verified identity/account contexts, but not blindly across all commercial Customer records.

This is an important architecture decision.

---

# 210. Email Uniqueness Policy

Same principle deserves caution.

Future authenticated Account may require unique login email.

Commercial Customer records do not necessarily need the same hard uniqueness rule.

---

# 211. Account Identity vs Customer Contact

This gives us:

```text
Customer Phone
can potentially be shared / duplicated with warning
```

while:

```text
Customer Account Login Identity
```

can enforce stricter security uniqueness.

---

# 212. Customer Merge After Account Creation

If one duplicate Customer owns Account:

```text
Customer A + Account
```

and another has guest Orders:

```text
Customer B
```

merge can consolidate histories into the Account-linked canonical Customer if conflicts are safe.

---

# 213. Merge Preview Account Priority

The UI should strongly indicate:

```text
Customer A has active login account.
```

This is a significant merge decision.

---

# 214. Address Conflict During Merge

Do not choose one address and delete the rest.

Combine valid unique addresses unless staff explicitly removes obsolete duplicates.

---

# 215. Note Merge

Chronological notes from both Customers should remain.

Do not concatenate into one unreadable blob.

---

# 216. Tags Merge

Typically:

```text
union of tags
```

subject to business conflicts.

---

# 217. Block Status Merge

If one Customer is blocked:

```text
Do not silently lose the block.
```

Require explicit merge resolution.

---

# 218. Privacy Status Merge

An anonymized Customer should not normally be merged casually with an active identified Customer.

Requires privileged conflict handling.

---

# 219. Customer Data Quality Dashboard — Preferred

Useful issues:

```text
Potential Duplicates

Invalid Phones

Invalid Emails

Customers Missing Names

Shared Phone Numbers

Customers With No Activity

Unlinked Guest History
```

---

# 220. Customer Health Indicator

Customer detail may show:

```text
Identity Quality:
Good
```

or warnings:

```text
Phone Unverified

Possible Duplicate

Shared Number
```

No need for a complex score.

---

# 221. Bulk Customer Operations

Safe V1 actions:

```text
Add Tag

Remove Tag

Block with reason

Export
```

Dangerous actions such as:

```text
Bulk Merge
```

should not be casual V1 features.

---

# 222. Bulk Delete

Do not support bulk hard deletion of Customers with commercial history.

---

# 223. Customer Import Merge

Imported dataset may include historical duplicates.

Provide candidate preview.

Do not auto-merge thousands of Customers invisibly.

---

# 224. Customer External References

Future integrations may assign:

```text
External CRM ID

Marketplace Customer ID

Legacy Customer ID
```

These should be typed external identities, not stuffed into notes.

---

# 225. Customer Metadata

A limited extensibility mechanism may support integration-specific metadata.

But important business fields should become first-class domain concepts rather than arbitrary metadata.

Medusa currently supports customer metadata for extension/integration purposes, which is a useful pattern for non-core custom data.

---

# 226. Avoid Metadata Abuse

Bad:

```text
metadata {
  blocked: true,
  lifetimeSpend: 10000,
  defaultAddress: ...
}
```

when those concepts materially affect business logic.

Use typed first-class fields/domains.

---

# 227. Customer Labels and Presentation

Display:

```text
Nusrat Jahan
017****5678

Repeat Customer
5 Orders
```

gives useful operational context.

---

# 228. Manual Order Customer Search

Before creating new Customer:

```text
Search phone/email/name
```

and show likely existing matches.

This prevents unnecessary duplicates.

---

# 229. Quick Create Customer

If no match:

```text
Name
Phone
Address
```

quick-create inside Manual Order workflow.

Customer can be enriched later.

---

# 230. Order Creation Warning

If manual staff tries to create:

```text
Nusrat
017...
```

and high-confidence Customer exists:

```text
Possible existing Customer:
Nusrat Jahan — 4 Orders
```

offer:

```text
Use Existing

Create New Anyway
```

with reason if creating duplicate.

---

# 231. Storefront Must Stay Fast

Identity resolution must not make checkout feel like enterprise CRM.

Storefront flow:

```text
Customer enters details
→ backend resolves safely
→ Order created
```

No duplicate-management UI for customers.

---

# 232. Customer Merge Is Admin-Only

Customers should not be exposed to internal merge operations.

Future account self-service identity claiming is a separate safe workflow.

---

# 233. Customer Profile Editing

Staff edits:

```text
Name

Primary Phone

Email

Addresses
```

with validation.

Changes affect future profile use.

Historical Order snapshots stay unchanged.

---

# 234. Transaction Correction

If historical Order phone was actually entered incorrectly and must be corrected operationally:

```text
Edit Order contact snapshot
```

through Order amendment/correction rules.

Do not expect Customer update to rewrite the Order.

---

# 235. Customer Stats and Merges

When merging:

```text
Do not add precomputed total_spend fields together blindly.
```

Recompute/rebuild metrics from canonical related transactions.

---

# 236. Customer Stats and Cancelled Orders

Metrics should respect Order definitions.

Example:

```text
Cancelled Orders:
not included in completed spend
```

---

# 237. Customer Stats and Refunds

If metric is:

```text
Net Spend
```

Refunds must reduce it.

If metric:

```text
Gross Purchased Value
```

they may not.

Both can exist with precise naming.

---

# 238. Important Invariants

### CUS-INV-001

Every Customer belongs to one Organization.

### CUS-INV-002

Customer has stable internal identity independent of phone/email.

### CUS-INV-003

Customer and Customer Account are separate concepts.

### CUS-INV-004

Guest checkout can create/link a Customer without an Account.

### CUS-INV-005

Customer may have multiple Phones.

### CUS-INV-006

Customer may have multiple Emails.

### CUS-INV-007

Customer may have multiple Addresses.

### CUS-INV-008

Order addresses remain historical snapshots independent of Customer address edits.

### CUS-INV-009

Phone comparison uses normalized/parsed representation, not raw string equality.

### CUS-INV-010

A matching phone alone does not universally prove two Customer records represent the same person.

### CUS-INV-011

Commercial Customer phone/email need not be universal hard unique keys.

### CUS-INV-012

Identity matching and Customer merging are separate operations.

### CUS-INV-013

Ambiguous identity matches must not cause destructive automatic merges.

### CUS-INV-014

Customer Merge is explicit, permission-controlled, previewed, and audited.

### CUS-INV-015

Merged identities preserve alias/canonical resolution where needed.

### CUS-INV-016

Customer Merge does not rewrite historical Order snapshots.

### CUS-INV-017

Customer statistics derive from authoritative transactional domains.

### CUS-INV-018

Customer metric definitions must be explicit.

### CUS-INV-019

Blocking a Customer does not destroy their history.

### CUS-INV-020

Customers with transactional history are not normally hard-deleted.

### CUS-INV-021

Future Account linking requires secure identity verification.

### CUS-INV-022

Customer authentication credentials do not belong to Customer domain.

### CUS-INV-023

Sensitive Customer information is permission-protected.

### CUS-INV-024

Customer search/indexes do not become identity authority.

### CUS-INV-025

Customer merge/reassignment operations are concurrency-safe and auditable.

---

# 239. V1 Mandatory Scope

Maevelle V1 Customer domain should include:

```text
✓ Customer entity

✓ Stable Customer identity

✓ Guest Customers

✓ Manual Customers

✓ Customer Status

✓ Active / Blocked

✓ Name

✓ Multiple Phones

✓ Primary Phone

✓ Phone normalization

✓ Bangladesh-friendly parsing

✓ International-safe phone model

✓ Multiple Emails

✓ Primary Email

✓ Multiple Addresses

✓ Default Address

✓ Address History / Usage

✓ Customer Source

✓ Order History

✓ Payment History

✓ Return History foundation

✓ Review relationship foundation

✓ Internal Notes

✓ Customer Tags

✓ Customer Statistics

✓ Order Count

✓ First Order

✓ Last Order

✓ Defined Spend Metrics

✓ Repeat Customer metric

✓ Customer Timeline

✓ Customer Search

✓ Phone Search

✓ Filters

✓ Saved Views

✓ Identity Matching

✓ Duplicate Candidate Detection

✓ Duplicate Reasons

✓ Merge Preview

✓ Customer Merge

✓ Merge Conflict Handling

✓ Merged Customer Alias / canonical resolution

✓ Blocking

✓ Block Reason

✓ Permissions

✓ Sensitive-data protection

✓ Audit

✓ Concurrency

✓ Idempotent creation support

✓ CSV/XLSX-friendly Import/Export foundation
```

---

# 240. Strongly Preferred V1

```text
Customer Data Quality Dashboard

Shared Phone Warning

Invalid Phone Queue

Duplicate Customer Queue

Quick Customer Creation in Manual Order

Possible Existing Customer Warning

Source History

Customer Number

Metrics Rebuild Utility

Customer Export

Bulk Tags

Bulk Blocking
```

---

# 241. Foundation Now / Later

Architecture should prepare for:

```text
Customer Accounts

Verified Phone

Verified Email

Saved Addresses

Cross-Device Cart

Wishlist

Store Credit

Loyalty

Marketing Consent

Customer Groups

Dynamic Segments

Support Integration

CRM / Lead System

Customer Privacy Requests

Anonymization

B2B Customers
```

---

# 242. Deferred Advanced Capabilities

Post-V1:

```text
Customer Self-Service Account

OTP Login

Social Login

Identity Providers

Advanced Segmentation

RFM

Predictive CLV

Loyalty

Rewards

Store Credit

Automated Marketing

Customer Support Timeline

Advanced Fraud Risk

COD Reliability Scoring

AI Duplicate Detection

CRM Lead Management

Customer Data Platform integrations
```

---

# 243. Decisions Established

### Decision CUS-001

**Customer is a first-class commerce entity independent of login/account.**

### Decision CUS-002

**Guest Orders still belong to Customer identity/history.**

### Decision CUS-003

**Customer uses stable internal identity rather than phone/email as primary identity.**

### Decision CUS-004

**Customer can have multiple Phones, Emails and Addresses.**

### Decision CUS-005

**Phone numbers use standards-aware normalization/parsing.**

### Decision CUS-006

**Raw phone string equality is rejected as an identity strategy.**

### Decision CUS-007

**Phone/email matches are identity signals, not unconditional proof of personhood.**

### Decision CUS-008

**Shared Customer contact points are possible and must not force destructive merging.**

### Decision CUS-009

**Identity resolution uses confidence and conflict awareness.**

### Decision CUS-010

**New transaction matching and existing Customer merging are separate workflows.**

### Decision CUS-011

**Duplicate detection is first-class.**

### Decision CUS-012

**Customer Merge requires preview, permissions and audit.**

### Decision CUS-013

**Merge preserves historical transactional snapshots.**

### Decision CUS-014

**Merged Customer identities support canonical resolution.**

### Decision CUS-015

**Order Address Snapshot and Customer Address are separate.**

### Decision CUS-016

**Customer metrics are derived projections, not manually maintained truths.**

### Decision CUS-017

**Customer metric definitions must explicitly state which Order/Payment states qualify.**

### Decision CUS-018

**Customer blocking controls future business behavior without deleting history.**

### Decision CUS-019

**Future Customer Account securely links to existing Customer where identity can be established.**

### Decision CUS-020

**Authentication credentials remain outside Customer domain.**

### Decision CUS-021

**Customer commercial identity does not blindly require globally unique phone/email.**

### Decision CUS-022

**Customer data is treated as sensitive and access-controlled.**

### Decision CUS-023

**Customer with transactional history is preserved or anonymized rather than casually deleted.**

### Decision CUS-024

**Customer architecture remains reusable for future Support, Marketing, Loyalty, Store Credit, and B2B capabilities.**

---

# 244. Resulting Customer Model

We now have:

```text
                         CUSTOMER
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
        Phones             Emails            Addresses
          │                  │                  │
          └───────────── Identity ─────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
              Orders      Payments      Returns
                │
                ▼
         Customer Metrics
                │
                ▼
        Customer Timeline
```

Guest ordering:

```text
Guest Checkout
      ↓
Normalize Identity
      ↓
Find Customer Candidates
      ↓
┌─────────────┬───────────────┐
│             │               │
Strong       Ambiguous       None
Match        Match
│             │               │
▼             ▼               ▼
Existing    Create/Link     New Customer
Customer    conservatively   Created
              +
         Duplicate Signal
```

Duplicate resolution:

```text
Customer A
     \
      → Merge Preview
     /
Customer B
      ↓
Conflict Resolution
      ↓
Canonical Customer
      │
      ├── Combined Orders
      ├── Combined Contacts
      ├── Combined Addresses
      └── Rebuilt Metrics
```

Future Account:

```text
CUSTOMER
   │
   ├── Guest history
   ├── Orders
   ├── Addresses
   │
   ▼
CUSTOMER ACCOUNT
   │
   ├── Authentication
   ├── Sessions
   └── Login Identity
```

This means Maevelle's customer database becomes a genuine **commercial identity layer**, rather than just a table populated from checkout forms.

---

# 245. Architecture Milestone

We now have the core commercial loop:

```text
                     CUSTOMER
                         │
                         ▼
                       ORDER
                    ┌────┴────┐
                    ▼         ▼
                PAYMENT   FULFILLMENT
                              │
                              ▼
                         INVENTORY
```

and acquisition:

```text
SUPPLIER
   ↓
PURCHASE
   ↓
SHIPMENT
   ↓
LANDED COST
   ↓
INVENTORY
```

So both major sides now meet around reliable Inventory and transactional Orders.

---

# 246. Next Domain

The next document should now be:

```text
docs/domains/media/media-architecture.md
```

because Media is already referenced throughout:

```text
Product galleries

Variant / Color galleries

Size-guide diagrams

Review images

Supplier screenshots

Purchase documents

Invoices

Payment evidence

Shipment documents

Damage photos

Transfer attachments
```

We need to stop treating those as unrelated file-upload fields and define a proper **WordPress-like reusable Media Library / Asset Management subsystem**.

It should cover:

```text
Media Asset

Image / File / Video foundation

Original Asset

Derived Variants

Object Storage

Public vs Private Assets

Asset Metadata

Alt Text

Title / Caption

File Type

Dimensions

File Size

Checksums

Duplicate Upload Detection

Reusable Assets

Folders / Collections

Search

Tags

Upload Status

Processing

Optimization

Thumbnails

Responsive Images

Image Formats

Product Usage

Variant / Color Gallery Usage

Review Usage

Document Attachments

Payment Evidence

Private Financial Documents

Usage Tracking

Current Usage Count

Historical Usage

Unused Assets

Safe Deletion

Replace Asset

Asset Versioning

Access Permissions

Signed URLs

Security

Virus / Malicious Upload Protection

Upload Limits

EXIF Metadata

Privacy

CDN

Caching

Audit

Import / Migration

Failure Recovery
```

A particularly important design rule will be:

```text
MEDIA ASSET
≠
PRODUCT IMAGE
```

A single asset can be reused across multiple entities, while its **usage relationship** explains whether it is serving as:

```text
Product Gallery Image

Red Color Gallery

Size Diagram

Supplier Attachment

Invoice

Payment Evidence
```

That is the right next domain before we move into Access Control and Finance Operations.

---

**End of Customer Architecture v0.1**
