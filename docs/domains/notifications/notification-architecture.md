# Maevelle Ecommerce — Notification & Messaging Architecture

**Document:** `docs/domains/notifications/notification-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** All business domains, `access-control-architecture.md`, `customer-architecture.md`, `media-architecture.md`, `storefront-commerce-architecture.md`

---

# 1. Purpose

The Notification domain defines how Maevelle turns important business/security events into useful communication for:

```text
Customers

Internal Users

Organization Owners

Operational Teams

Future External Recipients
```

through channels such as:

```text
In-App

Email

Future SMS

Future WhatsApp

Future Telegram

Future Push Notifications
```

while supporting:

```text
Templates

Localization

Preferences

Mandatory Notifications

Delivery Tracking

Retries

Deduplication

Rate Limiting

Provider Failures

Read / Unread

Deep Links

Security

Audit

Analytics
```

---

# 2. Core Principle

> **Domain Event, Notification, and Delivery Attempt are three different things.**

Example:

```text
Payment Domain
     ↓
payment.verified
     ↓
Notification Decision
     ↓
"Your payment has been verified."
     ↓
Notification
     ↓
Email Delivery Attempt
     ↓
Provider
```

These layers must remain separate.

---

# 3. Why?

Suppose:

```text
Payment successfully verified
```

but:

```text
Email provider is unavailable.
```

Correct result:

```text
Payment:
VERIFIED

Notification:
PENDING / RETRYING

Email:
FAILED TEMPORARILY
```

Incorrect result:

```text
Payment verification failed
because email failed.
```

---

# 4. Second Core Principle

> **Notification delivery is a side effect of business truth, not business truth itself.**

An Order exists because:

```text
Order domain committed it.
```

Not because:

```text
Order confirmation email was sent.
```

---

# 5. Third Core Principle

> **One Notification may have multiple Delivery Attempts across multiple channels.**

Example:

```text
Notification
"Your refund was completed"
       │
       ├── In-App
       │
       └── Email
```

Future:

```text
       ├── SMS
       └── WhatsApp
```

Each has independent status.

---

# 6. Fourth Core Principle

> **Notification preference and notification requirement are different concepts.**

Customer may disable:

```text
Promotional Email
```

but should not necessarily be able to disable:

```text
Security warning

Password changed

Critical payment issue
```

Likewise internal users may mute operational convenience notifications but not security-critical ones.

---

# 7. Research-Informed Direction

Real notification providers distinguish message creation from later delivery outcomes. Amazon SES exposes separate events for sending, delivery, delays, bounces, complaints, rejection, and rendering failures.

Twilio similarly exposes outbound messaging status changes through callbacks as a message progresses from creation through sending and delivery, and in supported channels potentially read state.

For future push notifications, Firebase Cloud Messaging similarly separates trusted-server message creation from the delivery infrastructure and provides delivery-management concepts including registration-token lifecycle.

These provider models reinforce Maevelle's internal separation of:

```text
Notification

Delivery Attempt

Provider Message

Provider Delivery Event
```

---

# 8. Notification Domain Responsibilities

Notifications owns:

```text
Notification

Notification Type

Notification Category

Recipient Resolution

Channel Selection

Notification Template

Template Version

Template Rendering

Notification Preference

Notification Inbox

Delivery Attempt

Provider Adapter

Delivery Status

Retry Policy

Failure Handling

Deduplication

Digest foundation

Security Notification Rules

Notification Audit

Notification Analytics
```

---

# 9. Notifications Does Not Own

Notifications does not determine:

```text
Whether Order is actually confirmed

Whether Payment succeeded

Whether Inventory is low

Whether Shipment is delayed

Whether Review is approved

Whether Promotion is active

Whether user is authorized
```

Those source domains determine facts.

Notifications reacts to them.

---

# 10. Primary Concepts

Recommended:

```text
Notification Type

Notification

Notification Recipient

Notification Template

Notification Preference

Delivery Attempt

Provider Message Reference

Notification Inbox Entry

Notification Event Handling Record
```

---

# 11. Domain Event

A Domain Event says:

```text
Something happened.
```

Examples:

```text
order.created

order.confirmed

payment.verified

payment.refund.completed

inventory.low_stock

shipment.arrived

review.submitted

expense.overdue

security.password_changed
```

---

# 12. Notification Type

A **Notification Type** defines:

> What kind of communication may be generated because of an event or system condition?

Examples:

```text
CUSTOMER_ORDER_PLACED

CUSTOMER_PAYMENT_VERIFIED

CUSTOMER_REFUND_COMPLETED

INTERNAL_LOW_STOCK

INTERNAL_SHIPMENT_DELAYED

INTERNAL_EXPENSE_OVERDUE

SECURITY_NEW_LOGIN

SECURITY_PASSWORD_CHANGED
```

---

# 13. Domain Event != Notification Type

One event may produce:

```text
0 notifications

1 notification

many notifications
```

depending on policy.

---

# 14. Example

```text
order.created
```

may create:

```text
Customer Order Confirmation

Internal New Order Alert
```

Different:

```text
Recipients

Templates

Channels

Preferences

Security classification
```

---

# 15. Another Example

```text
inventory.low_stock
```

may produce:

```text
Warehouse Manager notification
```

but no customer notification.

---

# 16. No Notification Required

Some domain events exist only for:

```text
Audit

Analytics

Search projection

Integration
```

and should produce no human message.

---

# 17. Notification

A **Notification** is a concrete communication intent.

Conceptually:

```text
Notification ID

Organization

Notification Type

Recipient

Source Event

Source Entity

Template Version

Rendered Summary

Priority

Created At

State
```

---

# 18. Notification Is Recipient-Specific

If three users need the same alert:

```text
User A

User B

User C
```

recommended model is conceptually:

```text
3 recipient-specific Notification records
```

or equivalent recipient records beneath one logical occurrence.

---

# 19. Why Recipient-Specific?

Because each recipient may have different:

```text
Read state

Preferences

Channels

Locale

Permissions

Delivery outcomes
```

---

# 20. Logical Notification Occurrence

Implementation may optionally group them under:

```text
Notification Occurrence
```

for one business event.

But recipient-level state must remain independent.

---

# 21. Notification Recipient

Recipient type:

```text
INTERNAL_USER

CUSTOMER
```

Future:

```text
EXTERNAL_CONTACT

SERVICE_RECIPIENT
```

---

# 22. Internal Recipient

References:

```text
Internal Identity / Organization Membership
```

and must belong to the appropriate Organization.

---

# 23. Customer Recipient

References:

```text
Customer
```

with communication destination resolved through Customer contact data.

---

# 24. Recipient Snapshot

Notification should preserve relevant transaction-time destination context.

Example:

```text
Email sent to:
n***@example.com
```

even if Customer later changes email.

---

# 25. Do Not Use Snapshot as Current Identity

Snapshot explains historical delivery.

Current notifications re-resolve current valid contact information.

---

# 26. Notification Category

Recommended categories:

```text
TRANSACTIONAL

OPERATIONAL

SECURITY

MARKETING

SYSTEM
```

---

# 27. Transactional

Customer/business communications directly tied to requested commerce.

Examples:

```text
Order confirmation

Payment confirmation

Refund completion

Order cancellation
```

---

# 28. Operational

Internal business alerts:

```text
Low stock

Receiving discrepancy

Expense overdue

Shipment delay
```

---

# 29. Security

Examples:

```text
New login

Password changed

MFA disabled

Permissions changed

Owner transferred
```

---

# 30. Marketing

Future:

```text
Promotion

Campaign

Back-in-stock marketing

Product announcement
```

Marketing has separate consent requirements.

---

# 31. System

Potential internal technical alerts:

```text
Backup failed

Media processing failures increasing

Webhook failures
```

Some may later belong to infrastructure monitoring rather than user notification.

---

# 32. Priority

Recommended:

```text
LOW

NORMAL

HIGH

CRITICAL
```

---

# 33. Priority Does Not Mean Business State

A:

```text
CRITICAL Notification
```

does not make the related Order critical.

Priority only guides notification handling/presentation.

---

# 34. Example Priorities

```text
Marketing:
LOW

New Order:
NORMAL

Payment Verification Problem:
HIGH

Owner Security Alert:
CRITICAL
```

---

# 35. Notification State

Recommended logical state:

```text
CREATED

DELIVERY_PENDING

DELIVERED_PARTIALLY

DELIVERED

FAILED
```

Potential:

```text
CANCELLED
```

before delivery where valid.

---

# 36. Do Not Overload State

Channel-specific delivery state belongs to Delivery Attempts.

Notification-level state is aggregate.

---

# 37. Delivery Attempt

A **Delivery Attempt** represents one attempt to deliver one Notification through one Channel.

Example:

```text
Notification:
N-100

Channel:
EMAIL

Attempt:
1
```

---

# 38. Channel

V1:

```text
IN_APP

EMAIL
```

Foundation:

```text
SMS

WHATSAPP

TELEGRAM

WEB_PUSH

MOBILE_PUSH
```

---

# 39. In-App Notification

Internal users should have a notification inbox inside the business portal.

Potential future Customer Account inbox.

---

# 40. In-App Is Different From External Delivery

In-App creation may succeed immediately because it is internal database state.

Email depends on external provider.

---

# 41. In-App Notification State

Recipient-level:

```text
UNREAD

READ
```

Potential:

```text
ARCHIVED
```

---

# 42. Read Does Not Mean Acknowledged

Reading a notification is not equivalent to:

```text
Issue resolved

Order processed

Stock replenished
```

Business workflows retain their own states.

---

# 43. Mark Read

User can:

```text
Mark one read

Mark all read
```

---

# 44. Notification Inbox

Useful grouping:

```text
All

Unread

Orders

Inventory

Payments

Security

Finance
```

depending on recipient permissions.

---

# 45. Notification Inbox Is Not Task Manager

A notification may lead to a task.

But:

```text
Notification
≠
Task
```

Do not overload read/unread into workflow status.

---

# 46. Deep Link

Notification can contain safe internal navigation context.

Example:

```text
Order ORD-1005 needs review
```

deep-links to:

```text
Order Detail
```

---

# 47. Deep Link Is Not Authorization

Critical:

> Opening a Notification link still performs normal authorization.

A stale notification must never grant access after permissions were removed.

---

# 48. Permission-Aware Inbox

Internal notifications should generally only be generated for users who:

```text
currently have relevant capability/scope
```

at recipient-resolution time.

---

# 49. Example

Low stock at:

```text
Main Warehouse
```

should not alert a user whose inventory access is scoped only to:

```text
Showroom
```

---

# 50. Notification After Permission Removal

Historical notification may remain in inbox.

Opening target may now return:

```text
Access denied
```

which is correct.

---

# 51. Sensitive Notification Content

Avoid putting excessive sensitive data directly in:

```text
Notification title

Email subject

Push preview
```

---

# 52. Example

Instead of:

```text
Customer Nusrat Jahan, phone 01712345678,
refund bank account ...
```

use:

```text
Refund RF-1005 needs review.
```

Authorized user can open details.

---

# 53. Lock-Screen Privacy

Future mobile/web push may display content on a locked device.

Sensitive notification templates need conservative content.

---

# 54. Templates

A **Notification Template** defines presentation.

Example:

```text
Type:
CUSTOMER_ORDER_PLACED

Channel:
EMAIL
```

with:

```text
Subject

Body

CTA

Formatting
```

---

# 55. Channel-Specific Templates

Same Notification Type can have:

```text
EMAIL template

IN_APP template

SMS template

WHATSAPP template
```

---

# 56. Why?

SMS requires:

```text
short text
```

while email supports:

```text
rich layout

order summary

CTA
```

---

# 57. Template Variables

Example:

```text
{{customer_name}}

{{order_number}}

{{order_total}}

{{store_name}}
```

---

# 58. Typed Template Variables

Prefer registered template schemas.

For:

```text
CUSTOMER_ORDER_PLACED
```

allowed variables could be:

```text
customerDisplayName

orderNumber

orderTotal

paymentMethod

publicOrderUrl
```

---

# 59. Avoid Arbitrary Data Access in Templates

Bad:

```text
{{database.query(...)}}
```

or unrestricted object traversal.

Templates receive prepared safe context.

---

# 60. Template Context

Source application service prepares:

```text
Notification Context
```

containing only intended data.

---

# 61. Template Rendering Failure

If required variable missing:

```text
Delivery Attempt
→ RENDER_FAILED
```

or Notification generation can fail before dispatch.

Do not send:

```text
Hello {{customer_name}}
```

to customer.

---

# 62. Template Validation

At template save/publish:

```text
Syntax valid?

Required variables known?

Channel supports features?

Unsafe content?
```

---

# 63. Template Version

Notification Templates should be version-aware.

---

# 64. Why?

Order confirmation sent in January should remain explainable even if template is changed in August.

---

# 65. Template Revision

Conceptually:

```text
Template
├── Revision 1
├── Revision 2
└── Revision 3
```

Notification records which Revision rendered it.

---

# 66. Rendered Snapshot

For important notifications, preserve:

```text
Rendered Subject

Rendered Body
```

or equivalent safe delivery snapshot.

Useful for:

```text
Audit

Support

Delivery troubleshooting
```

---

# 67. Sensitive Snapshot Retention

Do not retain sensitive message bodies forever without policy.

Retention can vary by Notification Type.

---

# 68. Template Status

Potential:

```text
DRAFT

ACTIVE

ARCHIVED
```

---

# 69. Active Revision

Exactly one active Template Revision per:

```text
Notification Type

Channel

Locale
```

under normal configuration.

---

# 70. Localization

Templates should be locale-aware.

Example:

```text
CUSTOMER_ORDER_PLACED

bn-BD

en
```

---

# 71. Recipient Locale

Resolution may use:

```text
Customer preferred locale

User preferred locale

Storefront/order locale

Organization default
```

with documented fallback.

---

# 72. Recommended Customer Fallback

```text
Order locale
→ Customer preference
→ Storefront default
```

depending available data.

---

# 73. Internal User Locale

Use user preference.

Fallback Organization locale.

---

# 74. Missing Translation

Fallback to default locale.

Do not fail a critical notification merely because translated template is absent.

---

# 75. Template Preview

Admin should preview with sample data.

---

# 76. Test Send

Authorized user can send test to themselves.

Test delivery must clearly be:

```text
TEST
```

and not linked to real Order/payment state.

---

# 77. Template Editing Permission

Suggested:

```text
notifications.templates.view

notifications.templates.manage

notifications.templates.publish
```

---

# 78. Notification Preference

Preference answers:

```text
Which optional Notifications does this recipient want,
through which channels?
```

---

# 79. Internal Preferences

Example:

```text
Low Stock:
In-App ✓
Email ✗

New Order:
In-App ✓
Email ✓
```

---

# 80. Customer Preferences

Future:

```text
Order updates:
Email ✓

Marketing:
Email ✗
SMS ✗
```

---

# 81. Preference Scope

Could exist by:

```text
Notification Type
```

or broader:

```text
Category
```

---

# 82. V1 Recommended Internal UX

Category/type-based channel toggles.

Avoid hundreds of individual settings initially.

---

# 83. Mandatory Notifications

Some types ignore opt-out.

Examples:

```text
Password changed

MFA reset

Owner transfer

Critical account-security event
```

---

# 84. Mandatory Does Not Mean Every Channel

Security policy determines required channels.

Example:

```text
In-App
+
Email
```

when usable email exists.

---

# 85. Transactional Customer Opt-Out

A customer generally should not be able to suppress essential communications necessary to service their own transaction.

Marketing preferences are different.

---

# 86. Marketing Consent

Marketing notification eligibility must respect:

```text
Customer consent/preferences
```

from Customer/Marketing architecture.

Having a phone/email is not permission to market.

---

# 87. Preference at Send Time

Preferences should be evaluated near Notification creation/channel resolution.

---

# 88. Historical Preference

For audit, optionally preserve:

```text
why channel was selected/suppressed.
```

---

# 89. Recipient Resolution

A Notification policy may identify audience by:

```text
Specific Customer

Specific User

Users with Capability

Users with Capability + Scope

Organization Owner

Configured Alert Recipients
```

---

# 90. Example

```text
inventory.low_stock
```

recipient rule:

```text
Internal users with:
inventory.view

and relevant Location scope

and Low Stock notifications enabled
```

---

# 91. Capability Resolution

Do not create hard-coded:

```text
role == warehouse_manager
```

recipient rules.

Use IAM capabilities/scopes.

---

# 92. Finance Notification

Expense overdue:

```text
Users with:
finance.expenses.view
```

and appropriate Finance alerts.

---

# 93. Security Notification

Permission changed:

```text
Affected user
+
Organization Owner
```

depending security policy.

---

# 94. Customer Contact Resolution

For email:

```text
verified/usable preferred Customer Email
```

where available.

---

# 95. Customer Without Email

Email Delivery Attempt cannot be created.

Notification can still:

```text
use another supported channel
```

or remain partially deliverable.

---

# 96. Destination Status

Contact points may have:

```text
VALID

UNVERIFIED

BOUNCED / SUPPRESSED

INVALID
```

depending Customer/contact architecture.

---

# 97. Email Hard Bounce

A hard-bounced address should not be repeatedly hammered indefinitely.

Delivery feedback can update destination health/suppression policy.

Amazon SES explicitly exposes bounce and complaint events for this operational purpose.

---

# 98. Complaint

Email complaint should be treated seriously.

Potentially suppress non-essential future sends to that address.

---

# 99. Transactional Exception

Some essential transactional/security communication may require alternate delivery/support workflow if normal email destination is suppressed.

Do not simply re-enable a bad destination blindly.

---

# 100. Provider Adapter

Notification domain should use:

```text
EmailProvider

SmsProvider

WhatsAppProvider

PushProvider
```

interfaces/adapters.

---

# 101. Why Provider Adapter?

Today:

```text
Amazon SES
```

Future:

```text
Postmark

Resend

Mailgun

Other provider
```

should not require rewriting:

```text
Order Domain

Payment Domain
```

---

# 102. Business Domains Never Call Provider Directly

Bad:

```text
OrderService
→ ses.sendEmail()
```

Better:

```text
Order
→ domain event
→ Notifications
→ Email Provider Adapter
```

---

# 103. Channel Provider Configuration

Organization/system settings may define active provider configuration.

Provider secrets belong to secure configuration, not Notification templates.

---

# 104. Provider Credential Security

Do not expose:

```text
SMTP password

API secret

WhatsApp token
```

through ordinary admin APIs.

---

# 105. Provider Message ID

Delivery Attempt stores:

```text
Provider

Provider Message ID
```

for reconciliation/status callbacks.

---

# 106. Provider ID Is Not Internal Identity

Notification remains stable even if provider changes.

---

# 107. Delivery Attempt State

Recommended normalized states:

```text
QUEUED

SENDING

PROVIDER_ACCEPTED

DELIVERED

FAILED_TEMPORARY

FAILED_PERMANENT

BOUNCED

REJECTED

SUPPRESSED
```

Potential future:

```text
READ
```

for channels that support reliable read receipts.

---

# 108. Accepted != Delivered

Provider accepting a message does not necessarily prove final recipient delivery.

This distinction is reflected by both email and messaging provider status models.

---

# 109. Delivered != Read

Even if provider reports delivery:

```text
recipient may not have read it.
```

Do not call it:

```text
Seen
```

without a supported read signal.

---

# 110. Email Open Tracking

Email opens are not authoritative evidence that customer actually read/understood a message.

Use only as optional analytics, not business state.

---

# 111. In-App Read State

In-App:

```text
READ
```

means user opened/marked Notification.

Still not business acknowledgement.

---

# 112. Delivery Attempt Number

Store:

```text
Attempt #1

Attempt #2

...
```

with timestamps.

---

# 113. Retry

Temporary failures can retry.

Examples:

```text
Provider timeout

Rate limit

Temporary server error

Temporary network issue
```

---

# 114. Permanent Failure

Examples:

```text
Invalid email

Invalid phone

Hard bounce

Template rejected

Destination blocked
```

should not retry forever.

---

# 115. Retry Policy

Define per:

```text
Channel

Failure class

Notification priority
```

---

# 116. Exponential Backoff

Recommended retry strategy:

```text
Increasing retry intervals
+
jitter
```

for external-provider failures.

Exact timing belongs implementation/configuration.

---

# 117. Maximum Attempts

Every retry policy needs:

```text
max attempts
```

after which Delivery Attempt becomes permanently failed / dead-lettered.

---

# 118. Dead-Letter / Failed Queue

Persistent failures need operational visibility.

Example:

```text
Refund notification failed permanently.
```

should not disappear from logs.

---

# 119. Retry Does Not Duplicate Notification

Retry creates:

```text
another delivery attempt
```

for the same Notification/channel.

Not a new customer Notification every time.

---

# 120. Provider Idempotency

Where provider supports idempotency/deduplication, use it appropriately.

Internally, Maevelle must still prevent duplicate dispatch caused by its own retries.

---

# 121. Notification Deduplication

Suppose:

```text
inventory.low_stock
```

event is processed three times due to retry.

User should not receive:

```text
Low Stock
Low Stock
Low Stock
```

for the exact same condition occurrence.

---

# 122. Event Idempotency

Notification event handler records:

```text
Source Event ID
+
Notification Type
+
Recipient
```

or equivalent idempotency identity.

---

# 123. Duplicate Event

Same source event retried:

```text
no duplicate Notification.
```

---

# 124. But Distinct Events Can Be Legitimate

Inventory:

```text
Low Stock at 9 AM

Stock replenished

Low Stock again at 6 PM
```

can legitimately generate two Notifications.

---

# 125. Condition Notifications

Certain alerts are based on:

```text
condition transitions
```

rather than every recalculation.

Example:

```text
Available Stock:
6 → 4

threshold:
5
```

Generate alert when crossing threshold.

---

# 126. Avoid Repeated Alert Spam

If stock remains:

```text
4
3
2
1
```

do not necessarily notify on every decrement.

Source Inventory/Notification policy can use:

```text
condition entered
```

semantics.

---

# 127. Recovery Notification

Potential:

```text
Stock restored
```

can be separate type if useful.

Not mandatory.

---

# 128. Notification Dedup Window

For noisy operational types, policy may suppress repeated equivalent alerts for a period.

---

# 129. Deduplication != Rate Limiting

Deduplication:

```text
same logical message
```

Rate limiting:

```text
too many messages
```

Different controls.

---

# 130. Rate Limiting

Channels/providers may impose sending limits.

Maevelle also needs protection against notification storms.

---

# 131. Notification Storm

Example bug produces:

```text
100,000 inventory alerts
```

in minutes.

System should have:

```text
channel rate controls

per-type rate controls

provider safeguards

monitoring
```

---

# 132. Critical Notifications

Do not silently suppress:

```text
Security compromise
```

because a low-priority marketing rate limit was reached.

Priority classes can have separate queues/limits.

---

# 133. Queue Architecture

Recommended conceptual processing:

```text
Domain Event
     ↓
Notification Outbox/Event Handler
     ↓
Notification Records
     ↓
Delivery Queue
     ↓
Channel Workers
     ↓
Provider
```

---

# 134. Why Queue?

External delivery can be:

```text
slow

unavailable

rate-limited
```

without blocking critical business requests.

---

# 135. Order Creation Latency

Order placement should not wait for:

```text
email provider response
```

before returning successful Order confirmation.

---

# 136. Transactional Outbox Principle

When critical domain mutation and event generation share one database:

```text
Business Transaction

+
Durable Event/Outbox Record
```

should commit coherently where practical.

---

# 137. Why?

Avoid:

```text
Order committed

application crashes before notification event recorded
```

with no recovery path.

---

# 138. Notifications Still Eventually Delivered

Worker can process durable event afterward.

---

# 139. Outbox Is Not Notification Table

Outbox records:

```text
business event waiting for processing.
```

Notification records:

```text
communication intent for recipient.
```

Separate concepts.

---

# 140. Delivery Worker Crash

If worker sends email then crashes before marking local state:

```text
duplicate-send risk
```

must be considered.

Use provider identifiers/idempotency and reconciliation where available.

---

# 141. Delivery Status Callback

Future SMS/WhatsApp provider can asynchronously report:

```text
sent

delivered

failed
```

Twilio uses outbound status callbacks for this style of lifecycle reporting.

---

# 142. Callback Security

Provider callback endpoints must verify authenticity according to provider protocol.

Never accept:

```text
POST status=DELIVERED
```

from arbitrary internet caller.

---

# 143. Callback Idempotency

Providers may retry callbacks.

Same callback/event must not create duplicate state transitions.

---

# 144. Out-of-Order Status Events

Potential:

```text
DELIVERED callback

then delayed SENT callback
```

or retried old event.

State machine should not regress incorrectly.

---

# 145. Provider Event History

Preserve raw/normalized provider event history where useful for troubleshooting.

---

# 146. Unknown Provider Message

Callback referencing unknown provider ID:

```text
security/integration anomaly
```

log and reject safely.

---

# 147. Email Provider Feedback

Email channel should process:

```text
Delivery

Bounce

Complaint

Rejection

Delay
```

where provider supports it. Amazon SES exposes these event categories through event publishing.

---

# 148. Delivery Delay

Delayed email is not permanent failure.

Could remain:

```text
PROVIDER_ACCEPTED / DELAYED
```

until final outcome.

---

# 149. Bounce Classification

Provider-specific classifications should map to normalized Maevelle status without discarding provider details.

---

# 150. Notification Failure Is Observable

Operations screen should show:

```text
Failed Deliveries

Temporary Failures

Permanent Failures

Suppressed Destinations

Provider Error Rates
```

---

# 151. Notification Health Dashboard

Recommended:

```text
Delivery Success Rate

Pending Queue

Oldest Pending Notification

Temporary Failures

Permanent Failures

Email Bounces

Email Complaints

Template Failures

Missing Recipient Destination

Provider Callback Errors

Notification Storm Detection
```

---

# 152. Internal Notification Types

Useful V1 candidates:

### Orders

```text
New Order

Order On Hold

Order Cancellation Exception

Duplicate Order Warning
```

### Inventory

```text
Low Stock

Out of Stock

Large Adjustment

Stocktake Discrepancy

Transfer Overdue

Transfer Variance
```

### Procurement

```text
Purchase Expected Date

Supplier Payment Due

Purchase Exception

Unmapped Procurement Item
```

### Shipments

```text
Shipment Dispatched

Shipment ETA Soon

Shipment Delayed

Customs Hold

Shipment Arrived

Receiving Discrepancy
```

---

# 153. Payment Notifications

Internal:

```text
Manual Payment Submitted

Payment Verification Needed

Payment Mismatch

Refund Needs Action

Settlement Missing
```

Customer:

```text
Payment Verified

Payment Rejected / Needs Correction

Refund Completed
```

---

# 154. Finance Notifications

```text
Expense Due Soon

Expense Overdue

Large Expense

Unreconciled Cash Movement

Statement Reconciliation Issue

COD Settlement Overdue
```

---

# 155. Review Notifications

```text
Review Submitted

Low-Rating Review

Review Pending Too Long

Merchant Response future customer notice
```

---

# 156. Promotion Notifications

```text
Promotion Starting Soon

Promotion Ending Soon

Usage Limit Near

Usage Limit Reached

Promotion Health Issue
```

---

# 157. Media Notifications

Normally not noisy.

Potential:

```text
Media Processing Failed

Private Asset Exposure Issue

Storage Integrity Failure
```

---

# 158. Security Notifications

High-priority examples:

```text
New Login

Password Changed

MFA Enabled

MFA Disabled / Reset

Permissions Changed

Account Disabled

Owner Transfer

New API Credential

Credential Revoked
```

---

# 159. Customer Order Notifications

V1:

```text
Order Placed

Payment Verified

Manual Payment Needs Correction

Order Cancelled

Refund Completed
```

Future Delivery domain:

```text
Order Shipped

Out for Delivery

Delivered

Delivery Failed
```

---

# 160. Do Not Duplicate Courier Messages Blindly

Future Pathao/Steadfast may also notify customers.

Maevelle should configure whether its own Delivery notifications are sent to avoid redundant spam.

---

# 161. Notification Policy

A **Notification Policy** can define:

```text
Notification Type

Audience rule

Default channels

Mandatory/optional

Priority

Deduplication strategy

Template

Retry policy
```

---

# 162. Policy vs Template

Policy says:

```text
who/how/when
```

Template says:

```text
what message looks like
```

---

# 163. Admin Customization

V1 should not expose unrestricted policy scripting.

Use structured configuration.

---

# 164. Customer Transaction Notifications

Default policies should be system-defined and safely configurable.

---

# 165. Security Policies

Critical security policies should have limited customization to avoid accidental disabling.

---

# 166. Internal Alert Recipients

Some Organizations may want:

```text
Owner gets financial alerts

Warehouse team gets inventory alerts

Procurement team gets shipment alerts
```

Capability-aware default resolution can support this.

---

# 167. Explicit Subscribers

Potential:

```text
Specific user always receives this alert
```

in addition to capability-based resolution.

Useful for Owner.

---

# 168. Recipient Resolution Snapshot

When Notification is generated, preserve recipient identity.

Later permission/config changes should not retroactively transfer historical Notification to another person.

---

# 169. Customer Name Change

Rendered historical message stays as originally rendered.

---

# 170. User Disabled Before Delivery

If an internal user is disabled before queued optional Notification sends:

Recommended:

```text
suppress pending ordinary delivery
```

where practical.

Security/history records remain.

---

# 171. Customer Contact Changes Before Delayed Delivery

Normally use destination resolved at Notification creation.

Do not unexpectedly send an old Order message to a newly added unrelated contact.

---

# 172. Immediate Rendering vs Late Rendering

Two approaches:

```text
Render at Notification creation

Render at delivery
```

---

# 173. Recommended

For transactional notifications:

```text
resolve recipient
+
capture notification context
+
render/snapshot before delivery
```

or otherwise guarantee stable transaction-time values.

---

# 174. Why?

Order total should not change in an email because Product title/price changed before worker processed queue.

---

# 175. Source Snapshot

Notifications should use:

```text
Order snapshots

Payment snapshots
```

rather than current Product values where historical communication requires transaction-time truth.

---

# 176. Notification Cancellation

Some queued Notifications may become obsolete before sending.

Example:

```text
"Payment verification needed"
```

queued.

Payment gets verified immediately by another operator.

Potentially cancel obsolete operational alert before external delivery.

---

# 177. Not All Notifications Are Cancellable

Security:

```text
Password changed
```

should still send even if user later changes password again.

---

# 178. Obsolescence Policy

Notification Type can define:

```text
CANCELLABLE_IF_RESOLVED

ALWAYS_DELIVER
```

---

# 179. Internal Inbox Resolution

Future operational notification may be marked:

```text
RESOLVED
```

when source condition resolves.

But keep:

```text
READ
```

separate.

---

# 180. V1 Recommendation

Do not introduce full resolved-task state for every notification.

Add only where a strong operational use appears.

---

# 181. Digest

Future/internal users may prefer:

```text
Daily low-stock digest
```

instead of 50 emails.

---

# 182. Digest != Individual Notification

System may still create individual In-App Notifications.

External delivery can batch/digest them.

---

# 183. Digest Policy

Potential:

```text
IMMEDIATE

DAILY_DIGEST

WEEKLY_DIGEST
```

---

# 184. V1

Immediate:

```text
Security

Transactional customer

High-priority operational
```

Digest foundation can remain future.

---

# 185. Quiet Hours

Future user preference:

```text
Don't email routine operational alerts
11 PM–7 AM
```

---

# 186. Critical Override

Critical/security notifications ignore quiet hours where appropriate.

---

# 187. Timezone

Quiet hours use recipient/Organization timezone.

Exact scheduling logic centralized.

---

# 188. Scheduled Notification

Potential future:

```text
Promotion starts tomorrow

Expense due in 3 days
```

Notifications may be scheduled from durable source state rather than one-time application timer.

---

# 189. Scheduler Reliability

Future scheduled Notification processing should derive from persistent records/jobs.

Not:

```text
setTimeout(...)
```

inside web server.

---

# 190. Event vs Scheduled Condition

Examples:

```text
order.created
→ event notification
```

```text
expense due in 24 hours
→ scheduled/condition notification
```

Both feed the same Notification infrastructure.

---

# 191. Customer Email Layout

Central branded shell:

```text
Logo

Message body

Order/payment content

CTA

Support info

Footer
```

---

# 192. Template Layout vs Message

Reusable:

```text
Email Layout
```

can wrap channel templates.

---

# 193. Branding

Notification rendering can consume:

```text
Organization/Storefront branding
```

without hard-coding Maevelle into infrastructure.

---

# 194. Future Multi-Business

Each Organization may have:

```text
Sender Name

Sender Email

Logo

Brand colors

Footer
```

subject to provider verification.

---

# 195. Sender Identity

Email sender configuration belongs to secure Notification/Organization settings.

---

# 196. Reply-To

Transactional customer email can use configured support address.

---

# 197. Do Not Use Personal Staff Email

System transactional mail should not originate from arbitrary employee account.

---

# 198. Attachments

Avoid attaching large documents by default.

Prefer secure links.

---

# 199. Private Attachments

If sending:

```text
Invoice PDF
```

or future file:

- confirm recipient authorization,
- use safe generated document,
- avoid permanent private Media URL.

---

# 200. Signed Link Expiration

Private document links should be appropriately controlled.

---

# 201. Customer Invoice Email

Potential:

```text
Order confirmation
+
invoice link
```

rather than uncontrolled attachment proliferation.

---

# 202. Notification Security

Never allow customer-controllable text to become:

```text
Email header

Raw HTML

Template logic
```

without escaping/validation.

---

# 203. Template XSS / Injection

HTML email/template engine must escape untrusted variables according to output context.

---

# 204. Subject Injection

Strip/control newline/header injection from variables used in email subjects.

---

# 205. URLs

Deep links generated from trusted route builders.

Do not directly insert arbitrary customer URL input.

---

# 206. Phishing Safety

Customer notification links should use legitimate Maevelle domain.

Avoid link-shortening schemes that make destination unclear.

---

# 207. Sensitive Tokens

Secure review/reset/order-management links may contain tokens.

Never log them unnecessarily.

---

# 208. Authentication Links

Password reset and invitation emails are security/authentication flows.

Notification system may deliver them, but IAM owns:

```text
token generation

expiry

validation

one-time use
```

---

# 209. Notification Cannot Recreate Security Token

It receives safe delivery context from IAM.

---

# 210. Token Expiry and Email Delay

If reset email is delayed until token expires:

```text
link fails safely.
```

User requests a new reset.

Do not extend token because notification provider was slow unless IAM policy explicitly does so.

---

# 211. Provider Webhook Security

Delivery callbacks require:

```text
Signature verification

Provider identity validation

Replay/idempotency protection
```

according to provider.

---

# 212. Callback Data Trust

Even authenticated provider callback updates:

```text
delivery status
```

only.

It must never alter:

```text
Order status

Payment status
```

unless a separate integration/domain contract explicitly defines such behavior.

---

# 213. Delivery Status Is Notification Data

Critical boundary.

---

# 214. Notification Analytics

Useful:

```text
Created

Delivery Attempted

Delivered

Failed

Bounced

Suppressed

Read In-App
```

---

# 215. Email Opens/Clicks

Optional future analytics.

Do not require them for V1 operational reliability.

---

# 216. Privacy and Tracking

Marketing/open tracking may have additional privacy implications.

Keep optional and policy-driven.

---

# 217. Operational Delivery Metrics

More important V1:

```text
Delivery success

Failure rate

Queue delay

Provider response latency

Bounce rate

Retry rate
```

---

# 218. Type-Level Analytics

Example:

```text
ORDER_PLACED email delivery:
99.4%

PAYMENT_VERIFIED:
99.8%
```

---

# 219. Provider-Level Analytics

Compare:

```text
Email provider

SMS provider future
```

for health.

---

# 220. Notification Latency

Measure:

```text
Domain Event occurred
→ Notification created

Notification created
→ provider accepted

Provider accepted
→ delivered where known
```

---

# 221. Customer Support View

Order detail can show:

```text
Notifications
```

such as:

```text
Order confirmation email
Delivered

Payment correction email
Bounced
```

---

# 222. Support Resend

Authorized staff may:

```text
Resend
```

certain transactional notifications.

---

# 223. Resend Is New Delivery

Recommended:

```text
same business Notification context
+
new explicit resend occurrence/delivery
```

or linked child Notification.

Audit who requested resend.

---

# 224. Do Not Duplicate Business Event

Resending order confirmation does not emit:

```text
order.created
```

again.

---

# 225. Resend Current vs Original Template

Recommended default:

> Use a fresh Notification generated from the same historical transaction context and current approved template, while preserving that it is a resend.

For legal/strict messages, exact original re-send may sometimes be preferred.

V1 can keep simple current-template policy.

---

# 226. Resend Abuse

Rate-limit staff/customer resend controls.

---

# 227. Customer Order Lookup

Future customer can request:

```text
Resend Order Confirmation
```

after safely verifying order ownership.

---

# 228. Notification Search

Admin search:

```text
Notification ID

Order Number

Customer

Recipient Email

Notification Type

Provider Message ID
```

subject to privacy permissions.

---

# 229. Filters

```text
Channel

Status

Type

Category

Date

Recipient Type

Failed

Bounced

Unread
```

---

# 230. Notification Detail

Recommended:

```text
Overview

Recipient

Content Snapshot

Delivery Attempts

Provider Events

Source Entity

Timeline

Audit
```

---

# 231. Privacy-Safe List

Notification list should not expose full message body unnecessarily.

---

# 232. Internal Inbox UI

Suggested:

```text
Unread badge

Notification title

Short summary

Time

Category icon

Deep link
```

---

# 233. Bulk Inbox Actions

```text
Mark Read

Mark All Read
```

Potential:

```text
Archive
```

later.

---

# 234. Retention

Different Notification categories may have different retention.

Examples:

```text
Routine operational in-app:
shorter

Security:
longer

Transactional delivery history:
longer
```

---

# 235. Notification Retention != Domain Retention

Deleting an old Notification does not delete:

```text
Order

Payment

Audit record
```

---

# 236. Provider Event Retention

Raw provider callbacks can have shorter retention than normalized delivery state.

---

# 237. Customer Privacy Requests

Notification content may contain personal information.

Customer anonymization/privacy workflow must consider stored Notification snapshots.

---

# 238. Marketing Data

Marketing communications may require stronger consent/retention controls.

Future Marketing architecture.

---

# 239. Internal User Disablement

Historical Notifications remain attributable to user where appropriate.

Account disable does not erase security history.

---

# 240. Multi-Organization Isolation

Every Notification belongs to:

```text
one Organization
```

except future platform-level system notices explicitly modeled otherwise.

---

# 241. Cross-Tenant Failure

Never allow:

```text
Organization A Order
→ Organization B Customer/User notification.
```

Recipient/source ownership validation mandatory.

---

# 242. Notification Preferences Are Organization-Scoped

Internal user could have different alert preferences in different future Organizations.

---

# 243. Customer Multi-Storefront Future

Customer contact preference may vary by Organization/storefront and marketing consent.

Transactional communication remains transaction-context-specific.

---

# 244. API Commands

Conceptual:

```text
createNotificationFromEvent()

dispatchNotification()

retryDelivery()

cancelPendingNotification()

markNotificationRead()

markAllNotificationsRead()

updateNotificationPreferences()

resendNotification()

publishTemplateRevision()
```

---

# 245. Internal Event Handler

Conceptually:

```text
handleDomainEvent(event)
```

resolves:

```text
Applicable Notification Policies

Recipients

Preferences

Channels

Templates
```

---

# 246. Provider Adapter Interface

Conceptual:

```text
sendEmail()

sendSms()

sendWhatsApp()

sendPush()
```

returns normalized provider acceptance/reference.

Exact interfaces later.

---

# 247. Provider Callback Commands

```text
recordProviderDeliveryEvent()

recordBounce()

recordComplaint()
```

after provider authentication.

---

# 248. Read APIs

```text
listMyNotifications()

getUnreadCount()

getNotification()

listNotificationHistory()

listFailedDeliveries()

getNotificationHealth()

getNotificationPreferences()
```

---

# 249. Customer-Facing Notification APIs

Future Customer Account:

```text
listCustomerNotifications()
```

but not needed V1.

---

# 250. Structured Errors

Examples:

```text
NOTIFICATION_RECIPIENT_NOT_FOUND

NOTIFICATION_CHANNEL_UNAVAILABLE

NOTIFICATION_DESTINATION_UNAVAILABLE

NOTIFICATION_TEMPLATE_MISSING

NOTIFICATION_TEMPLATE_RENDER_FAILED

NOTIFICATION_SUPPRESSED_BY_PREFERENCE

NOTIFICATION_PROVIDER_UNAVAILABLE

NOTIFICATION_DELIVERY_FAILED

NOTIFICATION_ALREADY_DISPATCHED

NOTIFICATION_DUPLICATE_EVENT

PROVIDER_CALLBACK_INVALID

NOTIFICATION_VERSION_CONFLICT
```

---

# 251. Suppressed Is Not Error

If optional Notification preference disables Email:

```text
No Email attempt
```

is expected behavior.

Record:

```text
SUPPRESSED_BY_PREFERENCE
```

where useful.

---

# 252. Missing Mandatory Destination

Security Notification requires Email, but user has no usable email.

This is:

```text
Security/Configuration Exception
```

not ordinary preference suppression.

---

# 253. Fallback Channel

Future policy:

```text
Email unavailable
→ SMS
```

for specific critical Notification Types.

---

# 254. Fallback Is Explicit

Do not automatically spam every available channel.

Policy defines fallback.

---

# 255. Multi-Channel Delivery

Different from fallback.

```text
Email + In-App
```

may intentionally send both.

Fallback means:

```text
attempt alternate channel when primary cannot be used.
```

---

# 256. Channel Preference

Could say:

```text
Preferred:
Email

Fallback:
SMS
```

future.

---

# 257. SMS

Future SMS templates need:

```text
Short content

No HTML

Phone destination

Provider-specific segmentation/cost awareness
```

---

# 258. SMS Cost

Messaging channels may incur per-message cost.

Finance/Analytics can later consume provider usage.

Notification domain tracks operational sends.

---

# 259. WhatsApp

Future WhatsApp integration likely requires:

```text
approved template concepts

provider adapters

status callbacks
```

depending on provider/platform rules at implementation time.

Do not hard-code assumptions now.

---

# 260. Telegram

Useful primarily for internal/business alerts in future.

Can be adapter:

```text
Telegram Bot
```

without changing source domains.

---

# 261. Push Notifications

Future internal/customer apps can use:

```text
WEB_PUSH

MOBILE_PUSH
```

---

# 262. Push Subscription

Push destination differs from Email/Phone.

Need:

```text
Device / Push Subscription
```

identity.

---

# 263. Stale Push Tokens

Push destinations can expire/become stale.

Future adapter must clean invalid registrations; Firebase's current guidance explicitly addresses managing stale registration tokens.

---

# 264. Push Permission

Browser/device notification permission is user-controlled.

Maevelle cannot assume it is granted.

---

# 265. Web Push

Future web push can use Service Worker/Push APIs.

Not necessary for V1.

---

# 266. Notification Preference Defaults

Internal user:

```text
In-App:
enabled for relevant operational types

Email:
enabled selectively
```

Avoid sending every internal event by email.

---

# 267. Customer Defaults

Transactional:

```text
enabled through available primary channel
```

Marketing:

```text
only when consent permits.
```

---

# 268. Default Changes

Changing Organization notification defaults should affect:

```text
users without explicit override
```

according to policy.

Do not silently overwrite explicit user preference.

---

# 269. Preference Model

Potential:

```text
DEFAULT

ENABLED

DISABLED
```

so organization-level defaults can evolve.

---

# 270. Mandatory Type

Ignores:

```text
DISABLED
```

where security/business policy requires delivery.

UI should explain this.

---

# 271. Preference UX

Example:

```text
Orders

New Order
In-App  ✓
Email   ✓

Inventory

Low Stock
In-App  ✓
Email   ✗

Security

Password Changed
In-App  Required
Email   Required
```

---

# 272. Avoid Notification Overload

Initial V1 should have a curated set of meaningful alerts.

Do not generate a notification for every domain event merely because it exists.

---

# 273. Notification Design Rule

Ask:

```text
Does a human need to know or act?
```

If not:

```text
no Notification.
```

---

# 274. Examples of Bad Notifications

```text
Product description updated

Search index rebuilt

Inventory projection refreshed
```

usually not useful human notifications.

---

# 275. Examples of Useful Notifications

```text
Stock dropped below threshold

Payment needs manual verification

Shipment delayed

Expense overdue

Security permission changed
```

---

# 276. Notification Escalation

Future:

```text
Expense overdue 7 days
→ Owner alert
```

or:

```text
Shipment exception unresolved 24h
→ escalation
```

Not required V1.

---

# 277. Escalation Is Policy

Does not alter source business record automatically.

---

# 278. Acknowledgement Future

For critical operational alerts:

```text
Acknowledge
```

could be supported.

But acknowledgement still does not resolve business issue.

---

# 279. Tasks Future

If Maevelle later builds operational task management:

```text
Notification
→ Task
```

can link.

Keep concepts separate.

---

# 280. Testing

Mandatory notification tests:

```text
Domain event creates correct Notification

Duplicate event does not duplicate Notification

Preference suppresses optional channel

Mandatory security notice ignores opt-out

Wrong Organization recipient rejected

Template renders correctly

Missing template handled

Provider temporary failure retries

Permanent failure does not retry forever

Provider callback duplicate is idempotent

Out-of-order provider events do not regress state

Disabled internal user not selected for new operational alert

Permission/location scopes affect internal recipients
```

---

# 281. Email Tests

```text
Valid destination

Hard bounce

Complaint

Provider rejection

Render failure

Provider timeout

Retry success
```

---

# 282. In-App Tests

```text
Unread count

Mark read

Mark all read

Permission-safe deep link

No cross-Organization access
```

---

# 283. Security Tests

```text
Forged provider callback rejected

Template injection escaped

Unauthorized private Notification access rejected

Customer cannot enumerate other customer's notifications

Reset/invite token not logged

Provider credentials never returned
```

---

# 284. Failure Scenario — Order Created, Worker Down

Correct:

```text
Order committed

Notification event durable

Worker restarts

Confirmation eventually sends
```

---

# 285. Failure Scenario — Email Provider Down

Correct:

```text
Order remains successful

Email retries

Internal health alert may surface provider outage
```

---

# 286. Failure Scenario — Email Sent, Local Update Failed

Delivery reconciliation/idempotency minimizes duplicate resend.

---

# 287. Failure Scenario — Wrong Email

Delivery may:

```text
bounce
```

Customer contact health updated/flagged.

Order remains unchanged.

---

# 288. Failure Scenario — Template Broken

Do not send malformed message.

Flag:

```text
TEMPLATE_RENDER_FAILED
```

and alert operations for important types.

---

# 289. Failure Scenario — Notification Storm

Rate controls/health monitoring suppress uncontrolled external flood while preserving source events for investigation.

---

# 290. Failure Scenario — Queue Backlog

Monitor:

```text
Oldest pending age

Queue size
```

Critical queue may receive priority.

---

# 291. Failure Scenario — Provider Callback Arrives Before Local Acceptance State

Accept valid monotonic state update if provider message mapping already exists.

Avoid assuming callback order.

---

# 292. Failure Scenario — Customer Changes Email Immediately

Historical queued Notification uses the intended captured destination/context according to policy.

Future Notifications use new verified contact.

---

# 293. Failure Scenario — User Permission Removed

Future operational alerts stop targeting user.

Historical notification remains.

Deep link re-authorizes.

---

# 294. Failure Scenario — Product Name Changed

Historical Order email keeps transaction-time Product snapshot where relevant.

---

# 295. Failure Scenario — Promotion Ends Before Email Sends

If email is:

```text
Order Confirmation
```

historical order discount remains.

Do not render using current Promotion eligibility.

---

# 296. Important Invariants

### NTF-INV-001

Every Notification belongs to one Organization unless explicitly platform-level in a future architecture.

### NTF-INV-002

Domain Event, Notification, and Delivery Attempt are separate concepts.

### NTF-INV-003

Notification delivery failure does not roll back committed business truth.

### NTF-INV-004

Business domains do not call external messaging providers directly.

### NTF-INV-005

One Domain Event may produce zero, one, or multiple recipient Notifications.

### NTF-INV-006

Every recipient Notification has a stable internal identity.

### NTF-INV-007

Each Channel delivery has independent Delivery Attempt state.

### NTF-INV-008

Provider acceptance is not treated as recipient delivery.

### NTF-INV-009

Delivered is not treated as read unless the channel provides an appropriate read signal.

### NTF-INV-010

In-App read state does not modify source business state.

### NTF-INV-011

Deep links never bypass normal authorization.

### NTF-INV-012

Internal recipient resolution respects Organization, capabilities, and relevant scopes.

### NTF-INV-013

Sensitive Notification content follows least-data principles.

### NTF-INV-014

Templates use registered/controlled variables rather than arbitrary data access.

### NTF-INV-015

Untrusted template variables are escaped/sanitized for the output context.

### NTF-INV-016

Important transactional Notification content is based on stable transaction/source snapshots.

### NTF-INV-017

Optional Notification preferences are honored.

### NTF-INV-018

Mandatory security Notifications cannot be silently disabled by normal preference settings.

### NTF-INV-019

Marketing Notifications require appropriate consent/eligibility.

### NTF-INV-020

Duplicate processing of the same source event does not create duplicate logical Notifications.

### NTF-INV-021

Delivery retries do not create new business events.

### NTF-INV-022

Temporary failures may retry; permanent failures do not retry indefinitely.

### NTF-INV-023

Provider callbacks are authenticated and idempotent.

### NTF-INV-024

Out-of-order provider events cannot regress delivery state incorrectly.

### NTF-INV-025

Provider secrets are never exposed through ordinary Notification APIs.

### NTF-INV-026

Cross-Organization recipient delivery is prohibited.

### NTF-INV-027

A disabled internal Membership is not selected for new normal operational Notifications.

### NTF-INV-028

Notification queue/provider failure is observable through health monitoring.

### NTF-INV-029

A failed Notification must remain traceable rather than silently disappearing.

### NTF-INV-030

Notification analytics never become authoritative business state.

---

# 297. V1 Mandatory Scope

Maevelle V1 Notifications should include:

```text
✓ Notification domain

✓ Domain-event integration

✓ Notification Type registry

✓ Notification Categories

✓ INTERNAL_USER recipients

✓ CUSTOMER recipients

✓ IN_APP channel

✓ EMAIL channel

✓ Notification Inbox

✓ Read / Unread

✓ Unread Count

✓ Deep Links

✓ Permission-Aware Internal Recipient Resolution

✓ Location-Scope-Aware Alert Resolution

✓ Customer Email Resolution

✓ Notification Templates

✓ Channel-Specific Templates

✓ Template Variables

✓ Template Validation

✓ Template Version foundation

✓ Locale foundation

✓ Organization default locale fallback

✓ Notification Preferences

✓ Internal preference settings

✓ Mandatory Security Notifications

✓ Transactional Customer Notifications

✓ Delivery Attempts

✓ Delivery Status

✓ Provider Adapter abstraction

✓ Provider Message Reference

✓ Retry Handling

✓ Temporary vs Permanent Failure

✓ Maximum Retry Attempts

✓ Failed Delivery Queue/View

✓ Notification/Event Idempotency

✓ Deduplication

✓ Priority

✓ Queue/Worker-based external delivery

✓ Durable event/outbox integration foundation

✓ Email Bounce Handling

✓ Email Complaint Handling

✓ Provider Callback Handling

✓ Callback Authentication

✓ Callback Idempotency

✓ Delivery History

✓ Notification Health Dashboard

✓ Search

✓ Filters

✓ Audit

✓ Permissions

✓ Security controls

✓ Observability
```

---

# 298. Strongly Preferred V1

```text
Notification Template Preview

Test Send

Support Resend

Order Notification History

Payment Notification History

Low Stock Alerts

Expense Due / Overdue Alerts

Shipment Delay / Arrival Alerts

Manual Payment Submitted Alert

Refund Completed Customer Email

Low-Rating Review Alert

Promotion Start/End Alerts

New Login Security Alert

Permission Change Alert

MFA Change Alert

Owner Transfer Alert

Queue Backlog Monitoring

Notification Storm Protection

Recipient Destination Health

Rendered Content Snapshot
```

---

# 299. Foundation Now / Later

Architecture should prepare for:

```text
SMS

WhatsApp

Telegram

Web Push

Mobile Push

Digests

Quiet Hours

Scheduled Notifications

Escalations

Acknowledgements

Customer Account Inbox

Multiple Email Providers

Provider Failover

Marketing Notifications

Notification Campaigns

Push Devices

Channel Cost Reporting
```

---

# 300. Deferred Advanced Capabilities

Post-V1:

```text
Advanced WhatsApp Messaging

Automated SMS Fallback

Push Notifications

Daily / Weekly Digests

Advanced Notification Routing

Escalation Policies

On-Call Alerts

AI-Generated Message Copy

Marketing Journey Automation

Customer Notification Center

Advanced Delivery Optimization

Multiple Provider Routing

Provider Cost Optimization

Advanced Engagement Analytics
```

---

# 301. Decisions Established

### Decision NTF-001

**Domain Events, Notifications, and Delivery Attempts are separate layers.**

### Decision NTF-002

**Notification failure never rewrites or rolls back successful domain truth.**

### Decision NTF-003

**Business domains emit events and do not directly call email/SMS providers.**

### Decision NTF-004

**In-App and Email are mandatory V1 channels.**

### Decision NTF-005

**SMS, WhatsApp, Telegram, and Push are adapter-based future channels.**

### Decision NTF-006

**Notifications are recipient-specific for read, preference, authorization, locale, and delivery behavior.**

### Decision NTF-007

**Notification Types are registered semantic business/security concepts.**

### Decision NTF-008

**Templates are channel-specific and use controlled typed context.**

### Decision NTF-009

**Important Templates are revision/version aware.**

### Decision NTF-010

**Historical transactional Notification rendering uses stable transaction-time context where required.**

### Decision NTF-011

**Optional Preferences are respected while mandatory security Notifications remain enforceable.**

### Decision NTF-012

**Marketing communication is consent-controlled and remains distinct from transactional communication.**

### Decision NTF-013

**Internal audience resolution is capability/scope-aware rather than role-name-based.**

### Decision NTF-014

**Notification deep links never grant authority.**

### Decision NTF-015

**External delivery uses provider adapters.**

### Decision NTF-016

**Provider credentials remain secure configuration, not business/template data.**

### Decision NTF-017

**Provider acceptance and actual delivery remain distinct states.**

### Decision NTF-018

**External delivery is asynchronous/queue-backed so provider latency does not block business operations.**

### Decision NTF-019

**Domain-event consumption and Notification generation are idempotent.**

### Decision NTF-020

**Retries belong to Delivery Attempts, not repeated Domain Events.**

### Decision NTF-021

**Temporary and permanent delivery failures have different retry behavior.**

### Decision NTF-022

**Provider delivery callbacks are authenticated, idempotent, and monotonic.**

### Decision NTF-023

**Email bounce/complaint feedback participates in destination health management.**

### Decision NTF-024

**Sensitive Notification content follows least-data principles.**

### Decision NTF-025

**Read state is presentation state, not business workflow state.**

### Decision NTF-026

**Routine Notification overload is deliberately avoided; not every Domain Event becomes a human alert.**

### Decision NTF-027

**Notification health/failures are first-class operational concerns.**

---

# 302. Resulting Architecture

Core event path:

```text
DOMAIN
   │
   ▼
DOMAIN EVENT
   │
   ▼
NOTIFICATION POLICY
   │
   ├── Should anyone be notified?
   │
   ├── Who?
   │
   ├── Which channels?
   │
   ├── Mandatory or optional?
   │
   └── Which template?
   │
   ▼
NOTIFICATION
   │
   ├─────────────┐
   ▼             ▼
IN-APP        EMAIL
   │             │
   ▼             ▼
Inbox       Delivery Attempt
                 │
                 ▼
            Email Provider
                 │
                 ▼
            Provider Events
                 │
        ┌────────┼─────────┐
        ▼        ▼         ▼
    Delivered  Bounce    Failed
```

---

# 303. Order Example

```text
ORDER CREATED
     │
     └── event:
         order.created
             │
             ▼
     Notification Policies
        ┌────┴────┐
        │         │
        ▼         ▼
   Customer    Internal Team
        │         │
        ▼         ▼
      Email     In-App
```

The Order is already valid before either message is delivered.

---

# 304. Payment Failure Example

```text
Payment verification needs review
           │
           ▼
payment.verification_required
           │
           ▼
Internal Notification
           │
        ┌──┴───┐
        ▼      ▼
     In-App   Email
        │
        ▼
Finance operator opens Payment

AUTHORIZATION CHECK
        │
        ├── allowed → Payment page
        └── denied  → Access denied
```

Notification never bypasses IAM.

---

# 305. Provider Failure Example

```text
Order Successfully Created
          │
          ▼
Customer Confirmation Notification
          │
          ▼
Email Attempt #1
TEMPORARY FAILURE
          │
          ▼
Retry
          │
          ▼
Email Attempt #2
DELIVERED
```

Order status never changed because the email provider failed.

---

# 306. Security Example

```text
PASSWORD CHANGED
      │
      ▼
SECURITY Notification
      │
      ├── In-App REQUIRED
      └── Email REQUIRED
```

A preference such as:

```text
"Don't email me operational alerts"
```

does not disable this security message.

---

# 307. Architecture Milestone

We now have a reliable communication layer connecting nearly every previously designed domain:

```text
Orders ────────────┐
Payments ──────────┤
Inventory ─────────┤
Warehouse ─────────┤
Procurement ───────┤
Shipments ─────────┤
Finance ───────────┼──► NOTIFICATIONS
Reviews ───────────┤
Promotions ────────┤
Security / IAM ────┤
Media ─────────────┘
```

without forcing those domains to understand:

```text
Email APIs

SMS providers

WhatsApp

Retries

Templates

Bounces

Read states
```

That separation will make the platform much easier to maintain.

---

# 308. Recommended Next Domain

Next should be:

```text
docs/domains/analytics/analytics-reporting-architecture.md
```

because almost every major business area now produces reliable transactional data, and we need to define **how Maevelle calculates KPIs without turning dashboard numbers into another uncontrolled source of truth**.

The Analytics architecture should cover:

```text
Metric Definition

Metric Catalog

Dimensions

Time Windows

Gross Sales

Net Sales

Discounts

Refunds

Orders

Average Order Value

Customers

New vs Repeat Customers

Product Performance

Variant Performance

Category Performance

Inventory Metrics

Stock Value foundation

Inventory Turnover foundation

Supplier Spend

Purchase Metrics

Shipment Metrics

Landed Cost

Marketing Spend

Operating Expenses

Fulfillment Cost

Payment Fees

Gross Margin

Contribution Margin

Cash Metrics

Promotion Performance

Review Metrics

Warehouse Performance

Metric Snapshots

Event-Time vs Processing-Time

Timezone

Currency

Multi-Currency Reporting

Dashboard

Report Builder foundation

Saved Reports

Filters

Drill-Down

Export

Permissions

Sensitive Financial Metrics

Projection Rebuild

Late-Arriving Events

Corrections

Backfills

Data Quality

Metric Versioning

Audit
```

The central principle should be:

```text
DOMAIN TRANSACTIONS
      ↓
ANALYTICS PROJECTIONS
      ↓
METRIC DEFINITIONS
      ↓
DASHBOARDS / REPORTS
```

not:

```text
dashboard.total_sales += order.total
```

scattered through application code.

A particularly important distinction will be:

```text
Gross Sales
≠
Net Sales
≠
Cash Inflow
≠
Profit
```

because we have now designed enough financial architecture that Maevelle can calculate these correctly instead of displaying misleading dashboard numbers.

---

**End of Notification & Messaging Architecture v0.1**
