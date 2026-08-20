# Maevelle Ecommerce — Admin Information Architecture

**Document:** `docs/product/admin-information-architecture.md`
**Status:** Product / UX Architecture — Living Document
**Version:** 0.1
**Primary UI Stack:** Next.js + React + shadcn/ui
**Related:** All Domain Architectures, Application Commands & Queries, OpenAPI Contract, Security Architecture

---

# 1. Purpose

Maevelle Admin is not merely:

```text
an ecommerce dashboard
```

and it is not intended to become:

```text
a traditional ERP with hundreds of confusing screens.
```

It is the operating interface for the business.

The Admin must make it possible to manage:

```text
Orders
Deliveries
Returns
Customers

Products
Categories
Collections
Sizing
Media

Inventory
Warehouses
Transfers
Stocktakes

Suppliers
Purchases
Inbound Shipments
Receiving
Landed Cost
Inventory Costing

Payments
Refunds
Finance

Reviews
Promotions

Analytics

Notifications
Integrations

Team
Security
Settings

Exceptions
Integrity
```

without requiring users to understand the internal architecture.

---

# 2. Central UX Principle

> **Expose complexity progressively.**

The system can be complex internally.

The interface should prioritize:

```text
What happened?

What needs attention?

What can I do next?
```

before showing:

```text
technical detail

historical internals

provider payloads

database-oriented information.
```

---

# 3. Second Principle

> **The Admin is organized around business work, not database domains.**

A user should not need to think:

```text
"Which bounded context owns this?"
```

They should think:

```text
I need to process today's Orders.

I need to receive today's Shipment.

I need to check why this Payment has a problem.

I need to restock these Returns.
```

---

# 4. Third Principle

> **Every important entity gets a workspace, not merely an edit page.**

Examples:

```text
Order Workspace
Customer Workspace
Product Workspace
Purchase Workspace
Shipment Workspace
Delivery Workspace
Return Workspace
```

A workspace combines:

```text
summary
status
alerts
related entities
actions
timeline
activity
```

around one business object.

---

# 5. Fourth Principle

> **Operational problems must come to the user.**

Users should not discover problems only by manually opening records.

The Admin needs first-class queues for:

```text
Payment verification

Booking failures

RTO

Returns awaiting inspection

Stock discrepancies

Unmapped courier areas

Integration failures

Unvalued inventory

Stale deliveries

Integrity problems
```

---

# 6. Fifth Principle

> **Navigation reflects frequency and responsibility, not every available feature.**

The sidebar should not contain 40 unrelated links.

Secondary functionality belongs under:

```text
section landing pages

tabs

overflow navigation

settings
```

---

# 7. Sixth Principle

> **Permission-aware navigation hides unavailable capabilities but never replaces server authorization.**

The UI may hide:

```text
Refund
Finance
Cost
Team Access
```

when unavailable.

The backend still authorizes every request.

---

# 8. Seventh Principle

> **Normal actions should be obvious. Dangerous actions should require friction proportional to risk.**

Example:

```text
Edit Product Title
→ low friction

Cancel Order
→ confirmation + reason

Refund Customer
→ confirmation + calculated refund context

Adjust Inventory
→ reason + quantity preview

Change Permissions
→ stronger confirmation

Override Delivered Status
→ step-up + reason + audit warning
```

---

# 9. Eighth Principle

> **Users should rarely need to copy IDs between screens.**

The platform should provide deep links between:

```text
Order
↔ Customer

Order
↔ Payment

Order
↔ Fulfillment

Fulfillment
↔ Delivery

Delivery
↔ RTO

Return
↔ Refund

Purchase
↔ Shipment

Shipment
↔ Receipt

Receipt
↔ Inventory

Inventory
↔ Cost Layer
```

---

# 10. Admin Personas

The architecture should support different working patterns without introducing rigid HR roles.

Examples:

```text
Owner

Operations Manager

Order Operator

Warehouse Operator

Procurement Operator

Finance Operator

Customer Support

Marketing / Catalog Manager

Technical Administrator
```

Permissions remain capability-based.

---

# 11. Navigation Model

Use:

```text
Primary Sidebar
+
Contextual Page Navigation
+
Global Search / Command Menu
```

---

# 12. Recommended Primary Sidebar

```text
Home

Commerce
Catalog
Inventory
Supply
Customers
Finance
Marketing
Analytics

Operations

Settings
```

Do not expose every submodule as a top-level item.

---

# 13. Expanded Sidebar

Recommended structure:

```text
HOME
  Dashboard

COMMERCE
  Orders
  Deliveries
  Returns

CATALOG
  Products
  Categories & Collections
  Media
  Sizing

INVENTORY
  Stock
  Warehouses
  Transfers
  Stocktakes

SUPPLY
  Suppliers
  Purchases
  Inbound Shipments
  Receiving
  Landed Cost

CUSTOMERS
  Customers
  Reviews

FINANCE
  Payments
  Refunds
  Expenses
  Financial Accounts

MARKETING
  Promotions

ANALYTICS
  Overview
  Sales
  Inventory
  Customers
  Delivery
  Finance

OPERATIONS
  Attention Center
  Notifications
  Integrations
  Jobs
  Integrity

SETTINGS
  Business
  Storefront
  Commerce
  Inventory
  Delivery
  Payments
  Notifications
  Team & Access
  Integrations
  Developer
```

---

# 14. Why "Commerce"?

Commerce groups:

```text
Order
Delivery
Return
```

because these form the customer's operational transaction lifecycle.

---

# 15. Why "Supply"?

Supply groups:

```text
Supplier
Purchase
Shipment
Receiving
Landed Cost
```

because they represent obtaining inventory.

---

# 16. Why "Operations"?

Operations contains cross-domain things requiring attention.

It should not become a miscellaneous dumping ground.

Its purpose is:

```text
What is broken?

What is waiting?

What needs human action?
```

---

# 17. Sidebar Collapse

Desktop supports:

```text
expanded sidebar
collapsed icon sidebar
```

Preference can persist per user.

---

# 18. Sidebar Badges

Badges should represent **actionable counts**, not vanity metrics.

Good:

```text
Returns 4

Payments 7

Operations 12
```

meaning unresolved actionable items.

Bad:

```text
Orders 15,302
```

---

# 19. Badge Severity

Allow indicators such as:

```text
normal
attention
critical
```

but avoid turning the sidebar into an alarm dashboard.

---

# 20. Sidebar Permission Filtering

If user lacks:

```text
finance.view
```

then:

```text
Finance
```

may disappear entirely.

If user can:

```text
payments.view
```

but not:

```text
finance.expenses.view
```

show only relevant Finance items.

---

# 21. Workspace Navigation Memory

When users return to a module, preserve:

```text
last selected view
filters
sort
density
```

within reasonable limits.

---

# 22. Header

Admin global header should contain:

```text
Sidebar toggle

Global Search / Command Menu

Quick Create

Notifications

Current Organization

User menu
```

Optional:

```text
Environment indicator
```

for staging.

---

# 23. Environment Safety Banner

Staging should visibly show:

```text
STAGING
```

to reduce accidental production assumptions.

---

# 24. Global Search

Keyboard:

```text
/
or
Cmd/Ctrl + K
```

opens:

```text
Global Search / Command Menu
```

---

# 25. Search Targets

Search across:

```text
Order number

Customer

Phone

Product title

SKU

Purchase number

Shipment number

Delivery number

Tracking number

Return number

Payment reference

Supplier

Media filename
```

subject to permission.

---

# 26. Search Results

Grouped:

```text
Orders
Customers
Products
Payments
Deliveries
Purchases
...
```

---

# 27. Search Result Context

Avoid showing only:

```text
ORD-2026-00192
```

Show:

```text
ORD-2026-00192
Rahim • ৳1,450 • Delivery pending
```

---

# 28. Sensitive Search

Users without sensitive Customer permission may see:

```text
Rahim • 01******45
```

instead of full phone number.

---

# 29. Global Search Does Not Bypass Permission

An unauthorized entity should not appear as a discoverable search result.

---

# 30. Command Menu

Same interface may expose actions:

```text
Create Product

Create Manual Order

Create Purchase

Adjust Inventory

Create Expense

Open Payment Verification Queue
```

depending permission.

---

# 31. Quick Create

Primary create options:

```text
Product

Manual Order

Purchase

Inbound Shipment

Customer

Expense
```

Do not include every possible entity.

---

# 32. Dashboard Philosophy

Dashboard should answer:

```text
What happened?

What needs attention?

How is the business performing?
```

not simply display 30 charts.

---

# 33. Dashboard Layout

Recommended:

```text
Top:
Critical Attention

Then:
Today's Operating Snapshot

Then:
Sales / Orders

Then:
Fulfillment / Delivery

Then:
Inventory / Supply

Then:
Financial Snapshot

Then:
Recent Activity
```

---

# 34. Attention Strip

Examples:

```text
7 Payments awaiting verification

3 Deliveries with booking failures

5 Returns awaiting inspection

2 Critical integrity issues
```

Each card opens the corresponding filtered queue.

---

# 35. Operating Snapshot

Potential cards:

```text
Orders Today

Orders Awaiting Confirmation

Ready to Fulfill

Deliveries In Transit

RTO In Progress

Returns Awaiting Inspection
```

---

# 36. Financial Snapshot

Permission-sensitive.

Potential:

```text
Collected Today

Refunded Today

Expenses Today

Outstanding COD Settlement
```

Do not call:

```text
Cash
```

what is merely provider-collected but unsettled COD.

---

# 37. Inventory Snapshot

Potential:

```text
Low Stock

Out of Stock

Incoming Inventory

Unvalued Inventory

Stocktake Exceptions
```

---

# 38. Dashboard Customization

V1 does not need drag-and-drop dashboard building.

Support:

```text
role/capability-aware default widgets

optional hide/show later
```

---

# 39. Attention Center

This becomes the operational command center.

Route:

```text
/operations/attention
```

---

# 40. Attention Categories

```text
Orders

Payments

Delivery

Returns

Inventory

Supply

Finance

Integrations

Integrity
```

---

# 41. Attention Item

Each should show:

```text
severity

what happened

affected record

how long waiting

recommended next action
```

---

# 42. Example

```text
PAYMENT VERIFICATION

৳1,450 bKash claim
Order ORD-2026-00152
Submitted 14 minutes ago

[Review Payment]
```

---

# 43. Attention Center Is Not Notification Inbox

Notification:

```text
"Payment submitted"
```

Attention item:

```text
"Payment requires verification."
```

Different purposes.

---

# 44. Queue Aging

Queues should make aging visible.

Examples:

```text
12m

3h

2d
```

with SLA-style warnings where meaningful.

---

# 45. Saved Views

Lists with frequent operational filtering should support:

```text
Saved Views
```

---

# 46. Example Order Views

```text
All Orders

New

Awaiting Payment

Ready to Fulfill

In Delivery

Delivery Problem

RTO

Completed

Cancelled
```

---

# 47. Saved View Structure

A view captures:

```text
filters

sort

visible columns

density
```

---

# 48. Personal vs Shared Views

Future-ready:

```text
PRIVATE

SHARED
```

V1 may begin with predefined system views + personal saved views.

---

# 49. URL-Persisted Filters

Filters should generally be represented in URL query state.

Example:

```text
/orders?order_status=CONFIRMED&payment_status=UNPAID
```

Benefits:

```text
bookmarking

sharing

browser back

deep links
```

---

# 50. List Page Pattern

Standard list page:

```text
Title
Description / help if needed

Primary Action

Saved View Tabs

Search

Filters

Bulk Action

Table

Pagination
```

---

# 51. Tables

Tables must support:

```text
server-side pagination

server-side filters

server-side sort

column visibility

row selection

sticky headers

responsive overflow
```

---

# 52. Table Density

User preference:

```text
Comfortable

Compact
```

Especially useful for operations teams.

---

# 53. Row Height

Avoid oversized card-like tables.

Operational Admin needs high information density.

---

# 54. Column Philosophy

Default table should show only fields required for quick decision.

Deep detail belongs in Workspace.

---

# 55. Example Order Columns

```text
Order

Customer

Total

Payment

Fulfillment

Delivery

Created

Attention
```

Not:

```text
every address component
every Payment ID
every audit field
```

---

# 56. Status Representation

Do not show one meaningless:

```text
Status: Processing
```

for multidimensional entities.

Order row can show:

```text
Order: Confirmed
Payment: Unpaid
Fulfillment: Ready
Delivery: —
```

---

# 57. Badge Semantics

Create one consistent visual vocabulary.

Example:

```text
Neutral
Draft

Informational
In Transit

Positive
Delivered / Completed

Attention
Awaiting Review

Critical
Failed / Integrity Error
```

Color is supplementary.

Text/icon remains understandable without color.

---

# 58. Status Labels

Human-readable:

```text
Awaiting verification
```

while machine state may be:

```text
PENDING_VERIFICATION
```

---

# 59. Bulk Actions

Bulk action should be available only when operation is genuinely safe.

Examples:

```text
Publish selected Products

Archive selected Products

Add Product Tags

Assign Category

Export selected Orders
```

---

# 60. Dangerous Bulk Actions

Avoid or strongly restrict:

```text
Bulk Refund

Bulk Inventory Adjustment

Bulk Cancel Orders
```

unless explicit workflow exists.

---

# 61. Selection Scope

Clear distinction:

```text
Selected 25 rows on this page
```

versus:

```text
All 4,392 matching results
```

Never imply one while doing the other.

---

# 62. Export

Export is async for large datasets.

UX:

```text
Export requested

You'll find it under Exports / notification when ready
```

No page freeze.

---

# 63. Filters

Use:

```text
quick filters
+
advanced filters
```

---

# 64. Quick Filters

Example Orders:

```text
Status

Payment

Delivery

Date

Source
```

---

# 65. Advanced Filters

Potential:

```text
Customer

Product

Location

Promotion

Payment Method

Amount range

Delivery provider
```

---

# 66. Filter Chips

Applied filters appear as removable chips.

---

# 67. Filter Count

Show:

```text
Filters 3
```

to prevent users forgetting that records are hidden.

---

# 68. Empty States

Differentiate:

```text
No records exist yet
```

from:

```text
No results match current filters.
```

---

# 69. Workspace Page Pattern

Standard detail workspace:

```text
Breadcrumbs

Entity identity/title
Status summary

Primary next actions
Attention/warnings

Summary cards

Main content tabs/sections

Related records

Timeline

Audit/deep technical details
```

---

# 70. Primary Action Area

Examples Order:

```text
Verify Payment

Create Fulfillment

Cancel

Hold
```

Only show currently valid actions.

---

# 71. Disabled vs Hidden Actions

If user lacks permission:

```text
hide
```

normally.

If action exists but current state disallows it:

```text
disable + explain why
```

when explanation aids understanding.

---

# 72. Action Overflow

Secondary/destructive actions:

```text
⋯
```

Examples:

```text
Print Invoice

Copy Order Number

View Audit

Cancel Order
```

depending importance.

---

# 73. Warning Hierarchy

Three classes:

```text
Information

Needs Attention

Blocking Issue
```

---

# 74. Blocking Example

```text
This Payment cannot be verified because the transaction reference is already used by another Payment.
```

---

# 75. Cross-Domain Summary Cards

Workspace should surface related domain summaries without forcing navigation.

Example Order:

```text
Payment
৳1,450 confirmed

Inventory
Reserved

Delivery
Pathao • In transit

Returns
None
```

---

# 76. Timeline

Most transactional Workspaces should have unified Timeline.

---

# 77. Timeline Event Sources

Could include:

```text
Order

Payment

Fulfillment

Delivery

Return

Refund

Notification
```

---

# 78. Timeline Is User-Friendly

Example:

```text
3:12 PM
Courier picked up the parcel.

2:48 PM
Fulfillment FUL-001 posted from Main Warehouse.

2:44 PM
Payment verified by Samira.
```

---

# 79. Audit Is Separate

Technical Audit can display:

```text
actor

request

before/after

capability

reason
```

through dedicated panel for privileged users.

---

# 80. Activity Drawer

A side drawer may be useful for:

```text
Timeline

Audit

Comments/Notes
```

without crowding main workspace.

---

# 81. Notes

Internal notes should have:

```text
author

timestamp

visibility
```

No accidental Storefront exposure.

---

# 82. Product Workspace

Route:

```text
/catalog/products/{productId}
```

---

# 83. Product Workspace Sections

Recommended:

```text
Overview

Variants

Media

Pricing

Inventory

Product Information

Sizing

SEO

Reviews

Activity
```

---

# 84. Product Overview

Contains:

```text
Title

Handle

Status

Publication

Product Type

Categories

Collections

Tags

Description
```

---

# 85. Product Editing

Avoid one giant form.

Use logical sections.

---

# 86. Autosave

Do not autosave critical changes blindly.

Recommended:

```text
explicit Save
```

for Product master edits.

Draft form state can persist locally/server draft if useful.

---

# 87. Unsaved Changes

Navigation guard:

```text
You have unsaved changes.
```

with:

```text
Save and leave

Discard

Stay
```

---

# 88. Product Variants

Variants displayed as structured table.

Example:

```text
SKU
Color
Size
Price
Stock
Status
```

---

# 89. Variant Matrix

For Color × Size products, optional matrix editor.

But the domain remains generic Options/Variants.

UI specialization must not redefine Catalog architecture.

---

# 90. Product Media

Drag-sort gallery.

Support:

```text
Product gallery

Variant-specific media

Primary image

Alt text
```

via Media Library.

---

# 91. Media Picker

Reusable modal/drawer:

```text
Search library

Upload

Select existing

View usages
```

---

# 92. Product Inventory Summary

Show:

```text
Main Warehouse 17

Secondary 6

Reserved 3

Incoming 25
```

without allowing Product editor to directly edit stock.

Action:

```text
View Inventory
```

or:

```text
Adjust Inventory
```

with proper permission.

---

# 93. Product Pricing

Show:

```text
Current Price

Compare-at

Price history/audit
```

and future price-list readiness.

---

# 94. Product Margin

Only for authorized users:

```text
Current estimated FIFO margin
```

clearly marked:

```text
Estimated
```

Historical actual margin belongs Analytics/Order Costing.

---

# 95. Category Management

Recommended split:

```text
Tree view
+
Category detail
```

---

# 96. Category Tree

Supports:

```text
expand/collapse

drag/move only through valid semantic command

status

product count projection
```

---

# 97. Media Library

Route:

```text
/catalog/media
```

---

# 98. Media Views

```text
All

Images

Documents

Unused Candidates

Processing

Failed
```

---

# 99. Media Detail

Show:

```text
Preview

File metadata

Alt/title

Usages

Renditions

Processing status

Upload/source
```

---

# 100. Delete Media UX

Before purge:

```text
Used by 4 Products
Used by 2 Reviews
```

Block destructive action where authoritative usage exists.

---

# 101. Inventory Main Page

Route:

```text
/inventory/stock
```

Primary question:

> What stock do we currently have and where?

---

# 102. Inventory Columns

```text
Product / Variant

SKU

Location

Sellable

Reserved

Available

Unavailable

Incoming

Attention
```

---

# 103. Inventory Detail Workspace

Show:

```text
Current quantities

Conditions

Reservations

Ledger

Incoming

Transfers

Cost valuation if authorized

Integrity
```

---

# 104. Inventory Adjustment

Use dedicated modal/page.

Required:

```text
Inventory Item

Location

Condition

Adjustment method

Quantity

Reason

Note
```

---

# 105. Adjustment Preview

Before submit:

```text
Current Sellable: 18
Adjustment: -2
New Sellable: 16
```

---

# 106. Set Count Mode

For physical recount:

```text
Current system:
18

Set counted:
16

Difference:
-2
```

with expected version protection.

---

# 107. Warehouse Workspace

Sections:

```text
Overview

Inventory

Transfers

Stocktakes

Receiving

Configuration
```

---

# 108. Transfer Workspace

Show:

```text
Source

Destination

Requested

Dispatched

Received

Variance

Timeline
```

---

# 109. Stocktake Workspace

Workflow optimized for warehouse use.

```text
Create
Freeze snapshot
Count
Review variances
Post
```

---

# 110. Mobile Stocktake

This is one of the Admin features that should work particularly well on phone/tablet.

Large controls.

Barcode-ready future.

---

# 111. Supplier Workspace

Sections:

```text
Overview

Purchases

Invoices

Payments

Products / Supplier SKUs

Shipments

Activity
```

---

# 112. Purchase Workspace

Header:

```text
PUR-2026-0014
Supplier
Currency
Status
Expected
```

Sections:

```text
Lines

Financial

Shipment Allocation

Receiving

Amendments

Timeline
```

---

# 113. Purchase Confirmation

Before confirmation show:

```text
Lines

Quantity

Currency

Total

Warnings
```

and explain:

```text
After confirmation, material changes require an Amendment.
```

---

# 114. Inbound Shipment Workspace

Sections:

```text
Overview

Shipment Items

Purchase Allocations

Packages

Journey

Expenses

Receiving

Landed Cost

Exceptions

Timeline
```

---

# 115. Receiving Workspace

This is operationally important.

Primary display:

```text
Expected

Received

Remaining

Discrepancy

Condition
```

---

# 116. Receiving Input

Optimize for rapid warehouse workflow.

Example:

```text
SKU / Item
Expected 20

Sellable received [18]
Damaged [1]
Unresolved [1]
```

---

# 117. Receiving Must Record Reality

UI cannot force:

```text
received = expected.
```

---

# 118. Unresolved Received Items

First-class queue:

```text
1 physically received item needs product identification.
```

---

# 119. Landed Cost Workspace

Show:

```text
Components

Sources

Allocation Method

Basis Completeness

Calculated Allocation

Estimated / Actual

Reconciliation

Revision History
```

---

# 120. Landed Cost Preview

Before Finalize:

```text
Freight              ৳12,000
Customs               ৳4,000
Handling              ৳1,500

Allocated              ৳17,500
Unallocated            ৳0
```

---

# 121. Costing Workspace

Not a primary everyday sidebar page.

Accessible under:

```text
Inventory → Costing / Valuation
```

or Analytics.

---

# 122. Costing Views

```text
Inventory Valuation

Cost Layers

Unvalued Inventory

Cost Adjustments

Integrity
```

---

# 123. Cost Sensitive Visibility

Users without:

```text
costing.view
```

do not see:

```text
unit acquisition cost

COGS

margin.
```

---

# 124. Orders List

Probably the highest-frequency Admin page.

Optimize strongly.

---

# 125. Order Row

Recommended:

```text
ORD-...
Customer

৳1,450

Payment:
Pending verification

Fulfillment:
Not started

Delivery:
—

12m ago

Attention:
Payment
```

---

# 126. Order Workspace Layout

Top:

```text
Order number
Customer
Source
Created
Total

[Primary actions]
```

---

# 127. Order Attention Area

Examples:

```text
Payment requires verification

Inventory reservation expires in 21 minutes

Delivery booking failed
```

---

# 128. Order Workspace Main Sections

Recommended:

```text
Overview

Items

Payment

Fulfillment & Delivery

Returns & Refunds

Customer

Timeline
```

Not every domain needs its own tab if a unified overview works.

---

# 129. Order Summary

Show canonical pricing:

```text
Merchandise gross

Discount

Merchandise net

Delivery

Tax

Total

Paid

Refunded

Balance due
```

---

# 130. Paid vs Total

Never visually confuse:

```text
Total
```

with:

```text
Balance Due.
```

---

# 131. Payment Verification Action

Open focused drawer/modal:

```text
Submitted reference

Claimed amount

Evidence

Expected Order amount

Existing provider/reference matches

Customer history if authorized
```

Actions:

```text
Verify

Reject

Close
```

---

# 132. Manual Verification Safety

Before Verify:

```text
This will record a confirmed payment of ৳1,450.
```

---

# 133. Fulfillment Creation

Order Workspace selects:

```text
Lines

Quantities

Location
```

then previews:

```text
inventory availability.
```

---

# 134. Delivery Booking

After Fulfillment:

```text
Create Delivery
```

or automated according to workflow.

Delivery UI should not clutter the initial Order processing screen before relevant.

---

# 135. Delivery List

Views:

```text
Ready to Book

Booking

Pickup Pending

In Transit

Out for Delivery

Delivery Problems

Delivered

RTO
```

---

# 136. Delivery Workspace

Top:

```text
Delivery
Order
Customer
Provider
Tracking
Status
COD
```

---

# 137. Delivery Main Sections

```text
Tracking

Package

Courier Booking

COD

Attempts

Charges

RTO

Exceptions

Timeline
```

---

# 138. Delivery Tracking Timeline

Use customer-friendly normalized status plus optional provider detail.

---

# 139. Courier Booking Failure

Prominent:

```text
Pathao booking failed
Reason: Area mapping missing

[Fix Mapping]
[Choose another courier]
[Record manual booking]
```

---

# 140. COD Risk Warning

Example:

```text
Customer completed a digital payment after courier pickup.

Courier is still instructed to collect ৳1,500.

Immediate action required.
```

---

# 141. Returns List

Views:

```text
Requested

Awaiting Approval

Expected

In Transit

Awaiting Receipt

Awaiting Inspection

Refund Pending

RTO

Exceptions

Resolved
```

---

# 142. Return Workspace

Show four distinct summaries:

```text
Commercial

Physical

Financial

Cost
```

---

# 143. Example

```text
Commercial
Approved

Physical
Received • awaiting inspection

Financial
Refund not created

Cost
Cost restored to Inspection stock
```

This is much clearer than:

```text
Status: Processing
```

---

# 144. Return Receiving

Warehouse-focused workflow:

```text
Expected item

Actual item

Expected qty

Received qty

Mismatch
```

---

# 145. Inspection Workspace

Large, simple disposition controls:

```text
Sellable

Damaged

Quarantine

Return to customer
```

with quantity split.

---

# 146. RTO Queue

Should be highly operational.

Columns:

```text
Delivery

Order

Courier

RTO status

Returned to warehouse?

COD/prepaid

Age

Issue
```

---

# 147. Customer List

Search heavily by:

```text
phone

name

email

customer number
```

---

# 148. Customer Workspace

Recommended sections:

```text
Overview

Orders

Payments

Returns

Addresses

Reviews

Notes

Activity
```

---

# 149. Customer Header

Show:

```text
Name

Primary Phone

Status

First Order

Last Order

Total Orders
```

Financial values permission-sensitive.

---

# 150. Duplicate Customer Warning

Example:

```text
Possible duplicate customer found.

Same phone used by 2 Customer records.

[Review]
```

No automatic merge.

---

# 151. Customer Merge UX

Preview must show:

```text
Source

Target

Phones

Emails

Addresses

Orders

Promotion usage implications

Review conflicts

Conflicts
```

Then:

```text
Merge
```

with reason.

---

# 152. Payments Page

Views:

```text
All

Awaiting Verification

Confirmed

Unallocated

Reconciliation Issues
```

---

# 153. Payment Workspace

Show:

```text
Payment amount

Method

Reference

Order allocation

Refunds

Settlement

Evidence

Timeline
```

---

# 154. Refund Workspace

Show:

```text
Requested amount

Commercial attribution

Original Payment

Provider processing

Current status

Unknown outcome warning

Return linkage
```

---

# 155. Unknown Refund Outcome

Prominent and blocking:

```text
Provider outcome is unknown.

Do not retry before reconciliation.
```

Action:

```text
Reconcile
```

---

# 156. Finance Section

Navigation:

```text
Overview

Expenses

Financial Accounts
```

Potential settlement views may remain under Payments depending responsibility.

---

# 157. Finance Dashboard

Only show facts architecture supports.

Example:

```text
Account balances

Expenses

Cash movements

Outstanding expense obligations

COD unsettled
```

Do not show fake:

```text
Net Profit
```

unless all required cost/accounting data is trustworthy.

---

# 158. Expense List

Views:

```text
Draft

Recorded

Partially Paid

Paid

Cancelled
```

Payment state may be derived.

---

# 159. Expense Workspace

Show:

```text
Category

Amount

Effective amount after credits

Payments

Attachments

Source relationship

Timeline
```

---

# 160. Reviews Moderation Queue

Columns:

```text
Product

Rating

Customer

Verified Purchase

Submitted

Media

Flag
```

---

# 161. Moderation Detail

Show:

```text
Current public revision if any

Pending revision

Order verification

Review text

Images

Moderation rules
```

Actions:

```text
Approve

Reject

Hide Review
```

---

# 162. Negative Review UX

Never offer:

```text
Reject because negative
```

as moderation reason.

---

# 163. Promotions

Views:

```text
Draft

Scheduled

Active

Paused

Ended
```

---

# 164. Promotion Builder

Prefer structured steps:

```text
1. Benefit

2. Target

3. Conditions

4. Coupon

5. Usage limits

6. Combinability

7. Schedule

8. Review
```

rather than one giant rule builder.

---

# 165. Promotion Simulation

Important before activation.

Example:

```text
Test Cart

Product A × 2
Customer: Existing
Subtotal: ৳1,800

Result:
Eligible

Product discount: ৳180
Order discount: ৳100
Delivery discount: ৳80

Final: ...
```

---

# 166. Analytics Navigation

Recommended:

```text
Overview

Sales

Products

Customers

Inventory

Supply

Delivery & Returns

Payments & Finance
```

---

# 167. Analytics UX Rule

Every metric needs:

```text
definition

time basis

currency

filters

drill-down
```

---

# 168. Metric Tooltip

Example:

```text
Net Merchandise Sales

Gross merchandise value minus committed merchandise discounts.

Excludes delivery and refunds.
```

---

# 169. Avoid Ambiguous Labels

Do not use simply:

```text
Revenue
```

if meaning is:

```text
Net Merchandise Sales.
```

---

# 170. Analytics Freshness

Show:

```text
Updated 4 min ago
```

for asynchronous projections where relevant.

---

# 171. Drill-Down

Metric:

```text
RTO Rate 13.4%
```

can drill into:

```text
affected Deliveries.
```

---

# 172. Integrations Page

Views:

```text
Connected

Needs Attention

Disabled
```

---

# 173. Integration Workspace

Show:

```text
Provider

Status

Capabilities

Last Successful Request

Recent Failures

Webhook health

Credential status

Geography sync

Exceptions
```

---

# 174. Provider Credentials

Never redisplay secret values.

Actions:

```text
Rotate

Revoke

Reconnect
```

---

# 175. Jobs Page

Mostly operational/technical.

Views:

```text
Running

Retrying

Failed

Dead Letter
```

---

# 176. Jobs Visibility

Only appropriate technical/operations permissions.

Normal users see business-facing result rather than background-job internals.

---

# 177. Integrity Page

High-value operations feature.

Views:

```text
Critical

Open

Investigating

Resolved
```

---

# 178. Integrity Item

Show:

```text
Domain

Affected record

Detected issue

Impact

Suggested repair

Evidence
```

---

# 179. Repair UX

Never:

```text
Edit database row
```

Use semantic action:

```text
Rebuild Inventory Level

Reconcile Delivery

Resolve Cost Position

Rebuild Rating Summary
```

---

# 180. Notifications

Two surfaces:

```text
User Notification Inbox

Operational Attention Center
```

Do not merge them.

---

# 181. Notification Inbox

Contains:

```text
business updates

assigned changes

security alerts

system notifications
```

---

# 182. Mark Read

Reading Notification does not acknowledge business task.

---

# 183. Team & Access

Settings area:

```text
Team Members

Permission Presets

Service Accounts

API Credentials

Sessions
```

---

# 184. Team Member Workspace

Show:

```text
Identity

Membership status

Capabilities

Location scopes

Sessions

Security

Activity
```

---

# 185. Permission Editor

Do not expose 300 checkboxes in one flat list.

Group:

```text
Catalog

Orders

Inventory

Payments

Customers

Finance

Settings

Security
```

---

# 186. Permission Search

Support:

```text
Search capability
```

---

# 187. Scope UX

Example:

```text
Inventory:
View — Main Warehouse
Adjust — Main Warehouse

Other warehouses:
No access
```

---

# 188. Permission Preview

Strongly preferred:

```text
What can this person do?
```

human-readable summary.

---

# 189. Ownership Transfer

Dedicated high-risk flow.

Not a normal permission checkbox.

---

# 190. Settings Architecture

Settings landing page categories:

```text
Business

Localization

Storefront

Commerce

Catalog

Inventory

Delivery

Payments

Customers

Reviews

Promotions

Notifications

Finance

Analytics

Security

Integrations

Developer
```

---

# 191. Settings Search

Because Settings becomes large:

```text
Search settings
```

is mandatory.

---

# 192. Settings Change Impact

Example:

```text
Default Return Warehouse
```

show:

```text
Affects future Return Receipts.
Existing Returns are unchanged.
```

---

# 193. High-Risk Settings

Examples:

```text
Default currency

Costing configuration

Payment provider

Security session policy

Webhook secret
```

should have stronger warnings/permissions.

---

# 194. Configuration Health

Settings can show:

```text
2 configuration issues
```

Examples:

```text
No default receiving location

Payment method active but account missing

Courier connected but geography mapping incomplete
```

---

# 195. Breadcrumbs

Use:

```text
Orders / ORD-2026-00152
```

or:

```text
Supply / Inbound Shipments / SHP-2026-0042
```

---

# 196. Cross-Domain Navigation

Contextual links should communicate relation.

Example:

```text
Payment
Allocated to ORD-2026-00152
```

clickable.

---

# 197. Open in New Tab

Entity links should behave naturally with browser:

```text
Cmd/Ctrl click
```

No JavaScript-only navigation traps.

---

# 198. Browser Back

Preserve list state when returning from detail.

---

# 199. Drawers vs Pages

Use Drawer for:

```text
quick review

simple action

small contextual edit
```

Use full page/workspace for:

```text
complex record

multi-step workflow

deep history.
```

---

# 200. Modal Use

Modals only for focused operations.

Avoid giant Product editor inside modal.

---

# 201. Forms

Form fields grouped logically.

Use:

```text
progressive disclosure
```

for advanced fields.

---

# 202. Required Fields

Mark clearly.

Avoid:

```text
* everywhere
```

without meaning.

---

# 203. Inline Validation

Validate immediately for:

```text
format

required

simple constraints
```

Server remains authoritative for domain rules.

---

# 204. Domain Error UX

Example:

```text
This refund cannot be created because ৳500 is already pending in another refund.
```

not:

```text
409 Conflict
```

---

# 205. Preserve User Input

On server validation failure:

```text
do not clear the form.
```

---

# 206. Drafts

Entities naturally supporting Draft:

```text
Product

Purchase

Promotion

Expense
```

should preserve draft status.

---

# 207. Autosave Policy

Recommended:

```text
Settings/preferences
→ can autosave selectively

Complex transactional drafts
→ explicit Save

Long content
→ optional draft autosave
```

---

# 208. Concurrency UX

If stale update:

```text
This record changed while you were editing.
```

Show:

```text
Your changes

Latest values
```

where possible.

---

# 209. Never Offer Blind Overwrite by Default

User should:

```text
reload

review

reapply
```

---

# 210. Real-Time Updates

V1 does not require full websocket-everywhere architecture.

Important workspaces can use:

```text
periodic refresh

refresh on focus

event-driven update later
```

---

# 211. Live Operational Pages

Candidates for stronger freshness:

```text
Payment Verification

Delivery Tracking

Return Receiving

Inventory
```

---

# 212. Freshness Indicator

Example:

```text
Updated 20 seconds ago
```

with:

```text
Refresh
```

where meaningful.

---

# 213. Optimistic UI

Safe for:

```text
mark notification read

minor preference changes
```

Avoid for:

```text
Refund

Inventory Adjustment

Payment Verification

Return Receipt posting
```

until server confirmation.

---

# 214. Toasts

Use for simple confirmation:

```text
Product saved
```

Not for important irreversible information that disappears after 4 seconds.

---

# 215. Persistent Result

Critical action result remains visible in page state/timeline.

---

# 216. Confirmations

Confirmation should explain consequence.

Bad:

```text
Are you sure?
```

Better:

```text
Cancel Order ORD-00152?

2 reserved units will be released.
The customer has paid ৳1,450 and may require a refund.
```

---

# 217. Typed Confirmation

Reserve for extremely dangerous rare operations:

```text
Ownership transfer

Purge Media

Revoke all API credentials
```

not normal everyday tasks.

---

# 218. Reason Capture

Required for actions such as:

```text
Inventory adjustment

Order cancellation

Payment rejection

Refund

Permission override

Manual Delivery override

Customer merge
```

---

# 219. Keyboard Navigation

Desktop power users should get:

```text
Cmd/Ctrl + K
Global command/search

/
Search

Esc
Close drawer/modal
```

Later:

```text
G then O
Go to Orders
```

can be considered.

---

# 220. Accessibility

Target modern WCAG-compatible behavior.

Requirements:

```text
keyboard navigation

focus visibility

semantic labels

screen-reader status

no color-only communication

sufficient contrast

accessible dialogs

table semantics
```

---

# 221. Light / Dark Mode

Both supported.

System default option.

---

# 222. Accent Color

Admin should use restrained product branding.

Operational status colors must remain consistent and accessible regardless of theme.

---

# 223. Responsive Strategy

Primary Admin target:

```text
Desktop
```

but important operational workflows should work on:

```text
Tablet
Phone
```

---

# 224. Mobile Priority Workflows

Strongly support:

```text
Order lookup

Payment verification

Delivery status

Return receiving

Inventory lookup

Stocktake/count

Quick customer search
```

---

# 225. Complex Desktop-Preferred Workflows

Examples:

```text
Landed Cost

Promotion builder

Advanced Analytics

Permission editor

Large Product variant matrix
```

May remain usable but not optimized for small screens.

---

# 226. Responsive Tables

On mobile:

```text
table
→
structured row cards / horizontal scroll
```

depending workflow.

Do not hide critical information unpredictably.

---

# 227. Print

Dedicated print layouts for:

```text
Invoice

Purchase Order

Receiving sheet

Package label

Return receipt
```

Browser print styling separate from screen UI.

---

# 228. Page Route Architecture

Recommended:

```text
/admin
```

may be root of Admin application externally, while routes inside app use:

```text
/orders

/deliveries

/returns

/catalog/products

/inventory/stock

/supply/purchases

/customers

/payments

/finance/expenses

/marketing/promotions

/analytics

/operations/attention

/settings
```

Exact reverse-proxy path is deployment decision.

---

# 229. Route Stability

Entity URLs should be stable.

Example:

```text
/orders/{orderId}
```

not dependent on currently selected saved view.

---

# 230. Human Number Search, UUID Route

Use UUID internally for route identity.

Display human number.

---

# 231. Query State

List filters remain URL-query encoded where practical.

---

# 232. Navigation Information Scent

Avoid generic links such as:

```text
Management

Data

Miscellaneous
```

Use business words.

---

# 233. Terminology

Admin terms must match internal glossary.

Examples:

```text
Purchase
not Purchase Order sometimes and Supplier Order elsewhere

Inbound Shipment
not Cargo in one screen and Shipment elsewhere

Return
not RMA unless explicitly explained
```

---

# 234. Customer-Friendly vs Internal Terms

Admin can use:

```text
Fulfillment
```

while Storefront may use:

```text
Preparing your order.
```

---

# 235. Empty-State Education

Example first Purchase:

```text
Purchases record what you order from a Supplier.

[Create Purchase]
```

Concise, contextual.

---

# 236. Help

Inline help should explain unusual concepts such as:

```text
Available to Sell

Unvalued Inventory

COD Settlement

Landed Cost

Cost Layer
```

---

# 237. Raw Technical Data

Provider payloads, event IDs and request details belong behind:

```text
Technical details
```

for authorized users.

---

# 238. No Database Language in Normal UI

Avoid:

```text
Foreign key invalid

row version conflict

projection rebuild
```

Normal users see:

```text
This record changed.

Related record is no longer available.

The summary needs to be refreshed.
```

---

# 239. Exception UX

Every exception should have:

```text
Explanation

Impact

Recommended next action

Related entities

Technical details
```

---

# 240. Example

```text
Courier booking could not be created.

The selected area has no verified Pathao mapping.

Order and inventory are safe.

[Map Area]
[Choose Steadfast]
[Use Manual Booking]
```

Excellent exception UX explains:

```text
what failed
what did not fail
what to do
```

---

# 241. Error Recovery

When action fails, do not leave user wondering whether it succeeded.

Example external timeout:

```text
Courier booking outcome is unknown.

Do not create another booking yet.
Maevelle is checking the provider.
```

---

# 242. Unknown Outcome Visual Language

Use distinct state:

```text
Checking outcome
```

not generic:

```text
Failed.
```

---

# 243. Security UX

Security should be visible when helpful, not obstructive everywhere.

Examples:

```text
MFA setup

Session list

Step-up prompt

API credential creation

Permission warning
```

---

# 244. Sensitive Data Reveal

Could use:

```text
Reveal phone
```

for high-sensitivity environments later.

V1 masking may depend directly on capability.

---

# 245. Audit UX

Audit access from workspace:

```text
Activity → Audit log
```

or dedicated global Audit page.

---

# 246. Audit Filters

```text
Actor

Action

Entity

Date

Request
```

---

# 247. Deleted / Archived Entity UX

Historical references should show:

```text
Archived Product
```

rather than broken link.

---

# 248. Missing Reference

If a relation is intentionally unavailable:

```text
Original external resource unavailable
```

rather than silently blank.

---

# 249. Performance Requirements

List first meaningful content should not wait for:

```text
10 sequential browser API calls.
```

Use purpose-built queries.

---

# 250. Order Workspace Query

One orchestrated Admin query can return:

```text
Order

Customer summary

Payment summary

Fulfillment summary

Delivery summary

Return summary

attention flags
```

with heavier timelines lazy-loaded.

---

# 251. Lazy Loading

Appropriate for:

```text
Audit

large timeline

raw provider events

historical cost adjustments
```

not for essential primary information.

---

# 252. Pagination

All high-volume lists server-paginated.

---

# 253. Search Debounce

Short reasonable debounce for free-text search.

Do not query on every keystroke without control.

---

# 254. Skeleton Loading

Use for predictable layout loading.

Avoid excessive spinning indicators.

---

# 255. Slow Action Feedback

For important mutations:

```text
Saving...
```

button state.

Prevent duplicate submits.

---

# 256. Async Operation Feedback

Example:

```text
Import started.

Processed 482 / 2,000
```

where progress exists.

---

# 257. Background Job Completion

Notify user with:

```text
Your Product import completed.
1,982 successful
18 need review.
```

---

# 258. Import UX

Flow:

```text
Upload

Validate

Preview

Resolve Errors

Confirm

Process

Result
```

Do not upload spreadsheet and instantly mutate production records blindly.

---

# 259. Import Errors

Row-level:

```text
Row 48
SKU already exists

Row 102
Unknown Category
```

---

# 260. Export UX

User chooses:

```text
Current view

Selected rows

All matching results
```

where permission allows.

---

# 261. PII Export Warning

Customer export may require:

```text
customers.export_sensitive
```

and audit.

---

# 262. Module Home Pages

Complex areas can have landing pages.

Example Inventory:

```text
Stock

Warehouses

Transfers

Stocktakes

Costing
```

with small operational summary.

---

# 263. Do Not Create Empty Landing Pages

If sidebar click can sensibly open the most useful list, do that.

---

# 264. Dashboard vs Module Dashboard

Avoid dashboard proliferation.

Only create module dashboard if it answers a real workflow question.

---

# 265. Information Hierarchy Standard

Every Workspace should roughly follow:

```text
Identity

State

Attention

Action

Summary

Detailed content

History

Technical/Audit
```

---

# 266. Action Hierarchy Standard

```text
Primary action

Secondary actions

Destructive / exceptional actions
```

---

# 267. Status Hierarchy Standard

If multiple dimensions:

```text
show separately
```

rather than forcing one master status.

---

# 268. Common Shared Components

Build reusable Admin components:

```text
PageHeader

EntityHeader

StatusBadge

AttentionBanner

MetricCard

DataTable

FilterBar

SavedViewTabs

Timeline

AuditDrawer

Money

Quantity

Address

CustomerSummary

ProductSummary

EmptyState

ErrorState

PermissionGate

VersionConflictDialog

AsyncJobProgress

IntegrityBadge
```

---

# 269. Domain-Specific Components

Avoid making one universal:

```text
EntityEditor
```

for every domain.

Order, Product and Purchase workflows differ.

---

# 270. shadcn/ui Usage

shadcn/ui provides primitives.

Maevelle should define its own:

```text
spacing

density

status

table

workspace
```

conventions on top.

---

# 271. Design Tokens

Admin-specific tokens:

```text
content widths

sidebar width

table row height

card padding

status semantic colors

critical/warning/info backgrounds
```

---

# 272. Admin Content Width

Operational tables:

```text
full available width.
```

Forms/content:

```text
bounded readable width.
```

---

# 273. Cards

Do not put everything inside cards.

Tables/forms benefit from clear sections without excessive borders.

---

# 274. Layout Density

Aim:

```text
clean
structured
dense enough for operations
```

not:

```text
consumer landing-page spacing.
```

---

# 275. Visual Hierarchy

Primary:

```text
action and state
```

Secondary:

```text
context
```

Tertiary:

```text
technical metadata.
```

---

# 276. Product Design Invariant

### ADMIN-INV-001

The primary Admin navigation is organized around business workflows rather than database tables.

### ADMIN-INV-002

Complex multidimensional entities do not expose one misleading generic status.

### ADMIN-INV-003

Every high-value transactional entity has a dedicated Workspace.

### ADMIN-INV-004

Operational exceptions are surfaced proactively through queues/Attention Center.

### ADMIN-INV-005

Unavailable navigation never replaces backend authorization.

### ADMIN-INV-006

Cross-domain relations are navigable without manually copying identifiers.

### ADMIN-INV-007

High-risk actions require proportional confirmation, reason and/or step-up authentication.

### ADMIN-INV-008

Lists use server-side pagination/filtering/sorting for high-volume datasets.

### ADMIN-INV-009

List filter state is shareable/bookmarkable where practical.

### ADMIN-INV-010

Saved Views capture operational context without altering underlying data.

### ADMIN-INV-011

Bulk operations exist only where domain semantics support safe batching.

### ADMIN-INV-012

Historical records never disappear from Workspaces merely because referenced master data was archived.

### ADMIN-INV-013

Order financial totals, Payment state and Balance Due are displayed as distinct concepts.

### ADMIN-INV-014

Product editing never directly mutates Inventory quantities.

### ADMIN-INV-015

Receiving UI records actual physical quantities rather than forcing expected quantities.

### ADMIN-INV-016

Return UI distinguishes commercial, physical, financial and cost status.

### ADMIN-INV-017

Delivery UI distinguishes Booking, physical handover, tracking, outcome, COD and Settlement.

### ADMIN-INV-018

Provider errors never expose raw technical details to ordinary business users by default.

### ADMIN-INV-019

Unknown external outcomes are shown as uncertain/reconciling, not falsely as failed.

### ADMIN-INV-020

Cost/COGS/Margin data is permission-sensitive.

### ADMIN-INV-021

Customer sensitive information is permission-filtered.

### ADMIN-INV-022

Unsaved edits cannot be silently discarded through ordinary navigation.

### ADMIN-INV-023

Stale optimistic-concurrency updates never silently overwrite newer data.

### ADMIN-INV-024

Critical monetary/inventory mutations are not optimistically displayed as successful before server confirmation.

### ADMIN-INV-025

The Timeline and Audit Log remain different views.

### ADMIN-INV-026

Notifications and actionable operational queues remain different concepts.

### ADMIN-INV-027

Repair operations are semantic actions, never generic database editing.

### ADMIN-INV-028

Admin mobile UX prioritizes operational tasks rather than attempting to reproduce every desktop screen perfectly.

### ADMIN-INV-029

Accessibility does not rely on color alone for business state.

### ADMIN-INV-030

Module terminology follows one shared product/domain glossary.

---

# 277. V1 Mandatory Admin Sections

```text
✓ Dashboard

✓ Attention Center

✓ Global Search

✓ Quick Create

✓ Orders

✓ Deliveries

✓ Returns

✓ Customers

✓ Products

✓ Categories

✓ Collections

✓ Media

✓ Sizing

✓ Inventory

✓ Warehouses

✓ Transfers

✓ Stocktakes

✓ Suppliers

✓ Purchases

✓ Inbound Shipments

✓ Receiving

✓ Landed Cost

✓ Payments

✓ Refunds

✓ Expenses

✓ Financial Accounts

✓ Reviews

✓ Promotions

✓ Analytics

✓ Notifications

✓ Integrations

✓ Team & Access

✓ Settings

✓ Integrity / Exceptions
```

---

# 278. V1 Mandatory Interaction Patterns

```text
✓ Workspace pages

✓ Server tables

✓ Saved system views

✓ Filters

✓ Search

✓ Sort

✓ Pagination

✓ Column visibility

✓ Row selection

✓ Permission-aware navigation

✓ Status badges

✓ Attention banners

✓ Reason capture

✓ Confirmation dialogs

✓ Unsaved-change protection

✓ Version-conflict handling

✓ Timeline

✓ Audit access

✓ Cross-domain links

✓ Loading states

✓ Error states

✓ Empty states

✓ Async job progress

✓ Light / Dark mode

✓ Responsive operational flows
```

---

# 279. Strongly Preferred V1

```text
✓ Personal Saved Views

✓ Table density preference

✓ Keyboard command menu

✓ Dashboard attention cards

✓ Return receiving mobile UX

✓ Stocktake mobile UX

✓ Promotion simulator

✓ Customer merge preview

✓ Costing integrity dashboard

✓ Delivery provider health

✓ COD reconciliation queue

✓ Geography mapping queue

✓ Import preview workflow

✓ Export jobs

✓ Contextual help
```

---

# 280. Deferred

```text
Fully customizable dashboard builder

Drag-and-drop admin page builder

Custom user-created forms

Arbitrary workflow designer

Generic report DSL

Full mobile-native admin app

Collaborative comments everywhere

Real-time presence

Extensive keyboard shortcut system

AI autonomous business actions

Cross-company multi-organization switcher complexity
```

---

# 281. Recommended Page Inventory

Approximate first implementation page map:

```text
/
  dashboard

/orders
/orders/:id

/deliveries
/deliveries/:id

/returns
/returns/:id
/returns/receiving/:receiptId

/catalog/products
/catalog/products/:id
/catalog/categories
/catalog/collections
/catalog/media
/catalog/sizing

/inventory/stock
/inventory/items/:id
/inventory/warehouses
/inventory/warehouses/:id
/inventory/transfers
/inventory/transfers/:id
/inventory/stocktakes
/inventory/stocktakes/:id
/inventory/costing

/supply/suppliers
/supply/suppliers/:id
/supply/purchases
/supply/purchases/:id
/supply/shipments
/supply/shipments/:id
/supply/receiving/:id
/supply/landed-cost/:id

/customers
/customers/:id
/reviews

/payments
/payments/:id
/refunds
/refunds/:id

/finance
/finance/expenses
/finance/expenses/:id
/finance/accounts
/finance/accounts/:id

/marketing/promotions
/marketing/promotions/:id

/analytics
/analytics/sales
/analytics/products
/analytics/inventory
/analytics/customers
/analytics/delivery
/analytics/finance

/operations/attention
/operations/integrations
/operations/jobs
/operations/integrity
/notifications

/settings
/settings/business
/settings/storefront
/settings/commerce
/settings/inventory
/settings/delivery
/settings/payments
/settings/notifications
/settings/security
/settings/team
/settings/integrations
/settings/developer
```

---

# 282. Architecture Milestone

The architecture now has two layers:

### Business/system truth

```text
Catalog
Inventory
Orders
Payments
Delivery
Returns
...
```

### Human operating interface

```text
Dashboard
Queues
Lists
Workspaces
Actions
Settings
```

The Admin no longer needs to mirror the domain architecture one-to-one.

Instead:

```text
Business complexity
        ↓
Application services
        ↓
Purpose-built queries
        ↓
Admin Workspaces
        ↓
Clear operator decisions
```

---

# 283. Next Document

The next product architecture document should now be:

```text
docs/product/storefront-ux-architecture.md
```

Admin answers:

> How does the business operate the system?

Storefront must answer:

> How does a customer discover, evaluate and purchase with the minimum possible friction while preserving all the correctness we have built?

---

# 284. Storefront UX Architecture Should Define

```text
Homepage

Navigation

Category / Collection pages

Search

Filters

Product cards

Product Detail Page

Color switching

Size selection

Size guide

Variant availability

Media gallery

Reviews

Cart

Mini-cart

Guest Checkout

Address entry

Delivery options

Coupons

Manual bKash / Nagad

COD

Order confirmation

Guest order lookup

Tracking

Review submission

Future customer account boundary

SEO

Mobile-first interaction

Loading / failure states

Analytics events

Accessibility

Performance budgets

Theme architecture
```

---

# 285. Critical Storefront Principle

The next document should begin with:

> **The Storefront optimizes for customer confidence and purchase speed, while the server remains authoritative for price, promotion, stock, delivery, and payment.**

That allows us to make Checkout feel extremely fast without weakening:

```text
No overselling

Correct pricing

Correct coupon usage

Secure guest access

Reliable Delivery serviceability

Payment integrity
```

---

# 286. Recommended Remaining Sequence

```text
Storefront UX Architecture
        ↓
Testing Master Plan
        ↓
Operations & Incident Runbooks
        ↓
Implementation Roadmap
        ↓
Repository Bootstrap
        ↓
Database Migrations
        ↓
Application Implementation
```

We have now crossed from architecture discovery into **product design and implementation preparation**.

---

**End of Admin Information Architecture v0.1**
