# Maevelle Ecommerce — Settings, Configuration & Localization Architecture

**Document:** `docs/domains/settings/settings-localization-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** All domains, `access-control-architecture.md`, `storefront-commerce-architecture.md`, `notification-architecture.md`, `analytics-reporting-architecture.md`

---

# 1. Purpose

The Settings domain defines how Maevelle manages configurable business behavior such as:

```text
Organization identity

Business timezone

Locale

Currency

Date / number formatting

Number sequences

Storefront defaults

Operational defaults

Localization

Domain policy references

User preferences

Integration configuration

Security-sensitive configuration

Configuration history
```

without turning the application into:

```text
settings
-----------------
key
value
```

with hundreds of undocumented strings.

---

# 2. Core Principle

> **Settings is not a giant key/value dumping ground.**

Bad:

```text
settings["inventory_oversell"] = "false"

settings["warehouse_default"] = "12"

settings["date_format"] = "x"

settings["refund_rule"] = "something"
```

This eventually causes:

```text
No ownership

No validation

Unknown types

Hidden dependencies

No migration safety

No impact analysis

Broken historical behavior
```

---

# 3. Better Model

Settings architecture should be:

```text
CONFIGURATION AREA
        │
        ├── Organization Configuration
        ├── Localization Configuration
        ├── Storefront Configuration
        ├── Domain-Owned Policies
        ├── Integration Configuration
        ├── Security Configuration
        └── User Preferences
```

Each configuration field has:

```text
Owner

Scope

Type

Validation

Default

Change behavior

Permissions

Audit policy
```

---

# 4. Second Core Principle

> **A domain owns the settings that control its business rules.**

Examples:

```text
Inventory oversell policy
→ Inventory

Review moderation policy
→ Reviews

Promotion stacking defaults
→ Promotions

Notification preferences
→ Notifications

Payment Methods
→ Payments

Default fulfillment strategy
→ Warehouse / Order Fulfillment
```

The Settings domain provides:

```text
organization

structure

discovery

shared infrastructure

editing UX

audit integration
```

but does not steal domain ownership.

---

# 5. Third Core Principle

> **Changing a setting affects future behavior according to explicit semantics; it does not rewrite historical transactions.**

Example:

```text
Default Currency:
BDT
→
USD
```

must not transform:

```text
Historical Order:
৳1,500
```

into:

```text
$1,500
```

---

# 6. Another Example

Changing:

```text
Default Receiving Location:
Warehouse A
→ Warehouse B
```

affects new receiving workflows.

It does not rewrite historical Receipts from Warehouse A.

---

# 7. Another Example

Changing:

```text
Order Prefix:
ORD
→
MV
```

does not rename:

```text
ORD-2026-00152
```

already issued.

---

# 8. Fourth Core Principle

> **Configuration is not transaction history.**

Current setting:

```text
timezone = Asia/Dhaka
```

describes current organizational policy.

Historical Order still preserves:

```text
created_at

order number

currency

financial snapshots
```

independently.

---

# 9. Fifth Core Principle

> **Secrets are not ordinary Settings.**

Examples:

```text
Database Password

Payment Provider Secret

SMTP/API Secret

Webhook Signing Secret

Object Storage Secret
```

must not live in normal editable configuration payloads.

---

# 10. Sixth Core Principle

> **Feature Flags, User Preferences, Business Settings and Infrastructure Configuration are different concepts.**

They need separate treatment.

---

# 11. Research-Informed Localization Direction

Unicode CLDR exists specifically to provide locale-sensitive data for formatting things such as numbers, currencies, dates, times and related locale conventions. Maevelle should therefore rely on runtime/framework internationalization facilities backed by established locale data rather than maintaining hand-written locale tables.

Time zones should use named IANA zones such as:

```text
Asia/Dhaka

Asia/Kolkata

America/New_York
```

rather than storing only fixed offsets such as:

```text
UTC+06:00
```

because the IANA database represents historical and changing civil-time rules. PostgreSQL itself uses the IANA time-zone database for historical time-zone information.

---

# 12. Configuration Categories

Recommended top-level configuration taxonomy:

```text
Organization

Localization

Storefront

Commerce

Catalog

Inventory

Warehouse / Fulfillment

Procurement

Shipment

Orders

Payments

Customers

Reviews

Promotions

Notifications

Finance

Analytics

Security

Integrations

Developer / API
```

---

# 13. Configuration Ownership

Each setting declares:

```text
configuration_key

owner_domain

scope_type

value_type

default

validation

change_semantics

sensitivity

audit_requirement
```

Conceptually.

Exact schema comes later.

---

# 14. Example

```text
inventory.allow_oversell
```

Owner:

```text
Inventory
```

Type:

```text
Boolean
```

Scope:

```text
Organization
```

Change semantics:

```text
Future transactions only
```

Sensitive:

```text
Operationally high impact
```

---

# 15. Another Example

```text
organization.timezone
```

Owner:

```text
Settings / Organization
```

Type:

```text
IANA Time Zone Identifier
```

Change semantics:

```text
Future display/report grouping behavior

Never rewrite stored absolute timestamps
```

---

# 16. Scope

A configuration value exists within a defined scope.

Recommended scopes:

```text
PLATFORM

ORGANIZATION

STOREFRONT

LOCATION

USER

INTEGRATION
```

Not every configuration supports every scope.

---

# 17. Platform Scope

System-wide technical configuration.

Examples:

```text
Maximum upload hard ceiling

Supported locales

Application feature availability

System maintenance settings
```

Usually controlled by developers/platform operators.

---

# 18. Organization Scope

Primary Maevelle business settings.

Examples:

```text
Business Name

Timezone

Default Locale

Default Currency

Order number configuration
```

---

# 19. Storefront Scope

Future multiple Storefront support.

Examples:

```text
Public Store Name

Storefront Locale

Theme

SEO defaults

Public contact info
```

V1 has one main Storefront.

---

# 20. Location Scope

Only settings logically attached to a Location.

Examples:

```text
Fulfillment paused

Local operating note

Future pickup configuration

Future printer settings
```

Do not move warehouse master data into generic Settings.

---

# 21. User Scope

Personal preferences.

Examples:

```text
Theme preference

Preferred locale

Dashboard layout

Notification preferences
```

---

# 22. Integration Scope

Configuration for one external integration.

Example:

```text
Pathao Integration

Steadfast Integration

Payment Gateway

Email Provider
```

Non-secret metadata can be stored here.

Secrets remain in protected secret infrastructure.

---

# 23. Configuration Precedence

Some configuration can inherit.

Example:

```text
Platform Default
      ↓
Organization Override
      ↓
Storefront Override
```

---

# 24. Effective Configuration

The application may resolve:

```text
effectiveValue(key, context)
```

based on documented precedence.

---

# 25. But Do Not Make Everything Inheritable

Avoid generic:

```text
Platform
→ Org
→ Storefront
→ Location
→ User
```

for every setting.

This creates difficult behavior.

---

# 26. Supported Scope Per Setting

Example:

```text
organization.timezone
```

supports:

```text
ORGANIZATION
```

only.

---

# 27. Example

```text
storefront.default_locale
```

may support:

```text
ORGANIZATION DEFAULT
+
STOREFRONT OVERRIDE
```

---

# 28. Example

```text
notifications.low_stock.email
```

may support:

```text
Organization Default
+
User Override
```

---

# 29. Explicit Inheritance Metadata

Configuration definition should declare:

```text
supports_inheritance = true/false

allowed_scopes
```

rather than assuming global behavior.

---

# 30. Effective Value Explanation

Admin/developer tools should be able to answer:

```text
Why is this value 30?
```

Example:

```text
Low Stock Threshold:
30

Source:
Product-specific Inventory Policy
```

or:

```text
Inherited from Organization default.
```

---

# 31. Configuration Definition

A **Configuration Definition** is the contract for a setting.

Conceptually:

```text
Key

Domain

Display Name

Description

Value Type

Allowed Scopes

Default Value

Validation

Sensitivity

Change Semantics

Requires Impact Preview?

Requires Step-Up?

Deprecated?
```

---

# 32. Type Safety

Supported types may include:

```text
Boolean

Integer

Decimal

Money

Currency Code

Locale Code

Timezone Identifier

Enum

Duration

Entity Reference

Structured Object
```

---

# 33. Avoid Stringly-Typed Settings

Bad:

```text
"value": "false"
```

when meaning is Boolean.

---

# 34. Structured Configuration

Some settings are naturally structured.

Example:

```text
Order Numbering:
{
  prefix,
  year_mode,
  sequence_padding
}
```

Do not flatten into unrelated keys if they must validate together.

---

# 35. Schema Validation

Every structured configuration has versioned validation schema.

---

# 36. Unknown Field

Reject or deliberately preserve according to migration strategy.

Do not silently accept typos:

```text
allow_oversel
```

---

# 37. Configuration Version

Configuration definitions may evolve.

Example:

```text
Version 1:
flat shipping fee

Version 2:
zone-based shipping configuration
```

Migration must be explicit.

---

# 38. Configuration Data Migration

When schema changes:

```text
old configuration
→ migration
→ new valid configuration
```

not:

```text
application crashes because old JSON shape remains.
```

---

# 39. Configuration Definition Registry

Recommended central registry for discoverability.

But business behavior remains implemented by owner domain.

---

# 40. Registry Can Answer

```text
Which settings exist?

Which domain owns them?

Which permissions are required?

What scope can override them?

How are they validated?
```

---

# 41. Setting Group

Admin UI groups configuration logically.

Example:

```text
Localization
├── Timezone
├── Locale
├── Currency
├── Date Format
└── Number Format
```

---

# 42. Do Not Organize Only by Database Table

Admin settings IA should match user mental models.

---

# 43. Organization Configuration

Core:

```text
Legal / Business Name

Display Name

Business Code foundation

Timezone

Default Locale

Default Currency

Contact Information

Business Address

Logo / Branding references
```

---

# 44. Business Display Name

Example:

```text
Maevelle
```

may differ from future:

```text
Legal entity name
```

Keep concepts distinct if needed.

---

# 45. Organization Code

Potential stable internal code:

```text
MAEVELLE-BD
```

useful for:

```text
exports

integrations

number sequences
```

but not mandatory as customer-visible branding.

---

# 46. Business Address

Structured address.

May be used on:

```text
Invoices

Receipts

Email footer
```

---

# 47. Business Contact

Could include:

```text
Support Email

Support Phone
```

but communication channels may have separate provider configuration.

---

# 48. Logo

Use Media Asset reference.

Do not store binary logo inside settings JSON.

---

# 49. Localization Configuration

Core:

```text
Business Timezone

Default Locale

Supported Storefront Locales

Default Currency

Number Presentation

Date Presentation

Time Presentation
```

---

# 50. Locale

A locale represents language plus regional formatting context where applicable.

Examples:

```text
en

en-BD

bn-BD
```

---

# 51. Language and Locale Are Related but Different

Example:

```text
English
```

language does not by itself fully describe:

```text
Date formatting

Number separators

Currency presentation
```

---

# 52. V1 Locale

Maevelle can use a primary configured locale.

Architecture remains ready for multiple locales.

---

# 53. Locale Fallback Chain

Potential:

```text
bn-BD
→ bn
→ Organization Default
→ System Default
```

---

# 54. Translation Fallback

Missing translated Product content can use configured fallback.

Do not automatically create machine translation.

---

# 55. Locale Does Not Change Data Identity

Product:

```text
PRD-1001
```

remains same Product in:

```text
Bangla

English
```

---

# 56. Currency

Default organizational transaction currency:

```text
BDT
```

initially.

But architecture remains multi-currency.

---

# 57. Currency Code

Use standard currency identifiers such as:

```text
BDT

USD

CNY
```

rather than custom labels.

---

# 58. Currency Symbol Is Presentation

Do not store:

```text
৳
```

as monetary currency identity.

Store:

```text
BDT
```

and format appropriately.

---

# 59. Money Storage

As previously established:

```text
decimal/fixed representation

+
currency
```

not floating-point money.

---

# 60. Default Currency Change

Changing:

```text
BDT → USD
```

affects defaults for new applicable records.

It does not convert existing:

```text
Orders

Payments

Purchases

Expenses

Landed Cost
```

---

# 61. Currency Change Impact

This should require strong impact preview because it can affect:

```text
Product pricing defaults

new Orders

new Expenses

reporting defaults

integrations
```

---

# 62. Default Currency Is Not Reporting Currency

Analytics may have:

```text
Reporting Currency
```

separate from:

```text
Default Transaction Currency
```

---

# 63. Date Formatting

Presentation examples:

```text
20 Aug 2026

20/08/2026

Aug 20, 2026
```

---

# 64. Do Not Store Formatted Dates

Store timestamp/date value.

Format at presentation/export boundary.

---

# 65. Number Formatting

Examples:

```text
1,250.50

1.250,50
```

depend on locale/presentation policy.

Formatting should use standard locale data rather than handwritten replacement logic.

---

# 66. Currency Formatting

Examples:

```text
৳1,500

1,500 BDT
```

are presentation choices.

The underlying value remains:

```text
1500 BDT
```

---

# 67. Formatting Override

Business may prefer a presentation style different from locale default.

Potential:

```text
Currency Display:
SYMBOL

CODE

SYMBOL_AND_CODE
```

---

# 68. Number Decimal Digits

Do not assume:

```text
2 decimals
```

for every currency/measurement.

Use domain precision/currency rules.

---

# 69. Timezone

Store:

```text
Asia/Dhaka
```

rather than:

```text
GMT+6
```

as primary organizational timezone.

The IANA time-zone database is designed to represent historical civil-time rules and is updated as those rules change.

---

# 70. Absolute Timestamps

Business events store an absolute instant.

Example conceptual:

```text
2026-08-19T23:30:00Z
```

Presentation:

```text
2026-08-20 05:30
Asia/Dhaka
```

---

# 71. Do Not Store Only Local Time

For events such as:

```text
Order placed

Payment verified

Stock adjusted
```

local wall-clock value alone is insufficient.

---

# 72. `timestamp with time zone`

PostgreSQL supports time-zone-aware timestamp handling and uses IANA time-zone information for conversions/historical rules.

Exact database representation will be decided during schema design.

---

# 73. Timezone Change

Changing:

```text
Asia/Dhaka
→ Asia/Singapore
```

does not change the actual instant historical Orders occurred.

It can change:

```text
display

daily grouping

report boundaries
```

according to reporting policy.

---

# 74. Reporting Timezone

Analytics should normally use configured Organization reporting timezone.

Could later be independent from operational timezone if needed.

V1 one business timezone is enough.

---

# 75. User Timezone

Future internal user preference may allow personal display timezone.

But business reports need a clearly identified business timezone.

---

# 76. Number Sequences

Maevelle needs human-readable numbers for entities such as:

```text
Order

Purchase

Shipment

Receipt

Expense

Refund

Transfer

Stocktake
```

---

# 77. Internal ID vs Human Number

Every entity should continue having:

```text
stable internal ID
```

separate from:

```text
ORD-2026-00125
```

---

# 78. Human Number

For:

```text
support

operations

printing

search
```

not primary database identity.

---

# 79. Number Sequence Configuration

Potential:

```text
Prefix

Sequence

Padding

Reset Policy

Optional Year

Optional Organization Code
```

---

# 80. Example

```text
ORD-2026-000123
```

---

# 81. Sequence Ownership

Each domain owns its sequence type.

Settings provides shared sequence infrastructure/configuration.

---

# 82. Sequence Types

Examples:

```text
ORDER

PURCHASE

INBOUND_SHIPMENT

RECEIPT

EXPENSE

REFUND

TRANSFER
```

---

# 83. Sequence Independence

Purchase and Order numbers should not consume one global shared counter unless deliberately desired.

---

# 84. Concurrency Safety

Two Orders created simultaneously must not receive same Order number.

---

# 85. Number Assignment

Normally occurs at meaningful creation/commit point.

---

# 86. Draft Numbers

Some domains may need draft number.

Others may allocate official number at confirmation.

Each domain decides.

---

# 87. No Gapless Promise

Important:

> Maevelle should not promise perfectly gapless operational numbering unless a legal/accounting requirement explicitly demands it.

Retries, rollbacks, reserved numbers and concurrency can legitimately create gaps.

---

# 88. Why?

Trying to guarantee gapless numbers often creates unnecessary locking and operational fragility.

---

# 89. Sequential Does Not Mean Guessable Public Access

Even if Orders are:

```text
ORD-1001
ORD-1002
```

public Order access still requires secure public identifiers/verification.

---

# 90. Prefix Change

Future Orders use new prefix.

Historical numbers remain unchanged.

---

# 91. Sequence Reset

Potential policies:

```text
NEVER

YEARLY

MONTHLY
```

---

# 92. V1 Recommendation

Prefer:

```text
YEARLY
```

or:

```text
NEVER
```

depending business preference.

Do not implement arbitrary scriptable numbering.

---

# 93. Sequence Example

Yearly:

```text
ORD-2026-000001

...

ORD-2027-000001
```

uniqueness includes year.

---

# 94. Sequence Configuration Changes

Should require impact preview.

Example:

```text
Prefix change:
ORD → MV
```

Preview:

```text
Next number:
MV-2026-000153
```

---

# 95. Existing Number Never Regenerated

Once transaction receives number:

```text
immutable
```

except exceptionally controlled data repair.

---

# 96. Number Search

Search should normalize:

```text
ORD-000123
```

appropriately.

---

# 97. Storefront Configuration

V1 examples:

```text
Store Name

Logo

Favicon

Contact Information

Social Links

Navigation

Footer

Announcement Bar

Homepage Sections

Theme

SEO Defaults

Default Locale
```

---

# 98. Storefront Business Logic

Storefront setting may choose:

```text
Out-of-stock Products:
visible
```

as merchandising policy.

It must not override Inventory quantity.

---

# 99. Storefront Visibility Configuration

Potential:

```text
SHOW_OUT_OF_STOCK

DEMOTE_OUT_OF_STOCK

HIDE_OUT_OF_STOCK
```

presentation only.

---

# 100. Homepage Configuration

Use typed sections:

```text
Hero

Featured Categories

Featured Collection

Selected Products

Promo Banner
```

---

# 101. No Arbitrary Homepage HTML V1

Structured configuration is safer and more portable.

---

# 102. SEO Defaults

Potential:

```text
Default Title Template

Default Meta Description

Default Social Image

Robots defaults
```

Product-specific SEO remains Catalog-owned.

---

# 103. Theme Configuration

Typed tokens/configuration may include:

```text
Brand accent

Border radius

Typography preset

Layout options
```

but Theme owns presentation.

---

# 104. Theme Configuration Does Not Store Business Rules

No:

```text
if theme == fashion:
inventory logic changes
```

---

# 105. Commerce Configuration

Settings UI may expose domain-owned commerce policies.

Examples:

```text
Guest Checkout Enabled

Default Delivery Method

Allowed Payment Methods

Review Submission Enabled
```

but owner domains define semantics.

---

# 106. Inventory Policy Configuration

Potential:

```text
Oversell Policy

Safety Stock Default

Low Stock Default

Reservation Policy
```

Owner:

```text
Inventory
```

---

# 107. Product-Level Overrides

Some inventory settings may later override at:

```text
Product

Inventory Item

Location
```

These remain Inventory Policies, not generic Setting inheritance.

---

# 108. Warehouse Defaults

Useful organization defaults:

```text
Default Receiving Location

Default Return Location

Default Fulfillment Priority
```

---

# 109. Do Not Create `default_warehouse_id`

as one magical field controlling everything.

Already established:

```text
Receiving Default
≠
Return Default
≠
Fulfillment Priority
```

---

# 110. Default Receiving Location

Used to prefill new operational records.

User may override if authorized.

---

# 111. Default Does Not Mean Forced

Unless specific domain policy says so.

---

# 112. Location Deactivation Impact

If configured default Location becomes inactive:

```text
configuration health error
```

and new operations should not silently keep using it.

---

# 113. Replacement Workflow

When deactivating a default Location:

```text
Impact:
This Location is default receiving location.

Select replacement?
```

---

# 114. Order Configuration

Potential:

```text
Reservation timing policy

Order confirmation workflow

Manual order defaults

Duplicate order detection policy

Cancellation settings
```

Owner:

```text
Orders
```

---

# 115. Payment Configuration

Examples:

```text
Enabled Payment Methods

Manual bKash Instructions

Manual Nagad Instructions

COD Availability Rules
```

Owner:

```text
Payments
```

---

# 116. Financial Accounts Are Not Settings

A:

```text
Bank Account
```

is a Finance domain entity.

Settings may reference:

```text
Default Expense Payment Account
```

if needed.

Do not serialize entire Financial Account into Settings.

---

# 117. Payment Accounts Are Not Simple Settings

They have lifecycle, sensitive configuration and business relationships.

Treat as Payment entities.

---

# 118. Review Configuration

Owner:

```text
Reviews
```

Examples:

```text
Reviews Enabled

Purchase Required

Manual Moderation

Allow Images

Maximum Images

Public Author Format
```

---

# 119. Promotion Configuration

Most Promotion behavior lives on Promotion records themselves.

Settings may define organization defaults such as:

```text
Default combination policy
```

only if genuine need exists.

---

# 120. Notification Configuration

Owner:

```text
Notifications
```

Examples:

```text
Organization notification defaults

Sender display name

Alert recipients

Template selection
```

Provider secrets stay secret infrastructure.

---

# 121. Finance Configuration

Potential:

```text
Default Expense Currency

Default Financial Account

Large Expense Warning Threshold
```

if needed.

Do not configure statutory accounting rules without dedicated accounting architecture.

---

# 122. Analytics Configuration

Examples:

```text
Reporting Currency

Reporting Timezone

Default Dashboard Date Range
```

Metric definitions remain system-controlled V1.

---

# 123. Security Configuration

Examples:

```text
Require MFA

Session Policy

Allowed Authentication Methods

Security Alert Recipients
```

Owner:

```text
IAM / Security
```

---

# 124. Security Settings Are High Risk

Require:

```text
settings.security.manage
```

plus:

```text
step-up authentication
```

where appropriate.

---

# 125. Security Configuration Cannot Disable Core Protection Casually

Do not allow:

```text
authorization_required = false
```

as a business Setting.

---

# 126. Infrastructure Configuration

Examples:

```text
Database URL

Redis URL

Object Storage Credentials

Encryption Keys
```

are deployment configuration.

Not business Settings.

---

# 127. Environment Configuration

Usually supplied through:

```text
Environment variables

Secret manager

Deployment configuration
```

---

# 128. Business Settings vs Deployment Config

```text
Business Setting:
Order prefix

Deployment Config:
DATABASE_URL
```

Keep separate.

---

# 129. Secrets

A Secret contains sensitive credential material.

Examples:

```text
API key

OAuth client secret

Webhook secret

SMTP password
```

---

# 130. Secret Storage

Normal Settings database should store at most:

```text
Secret Reference

Masked metadata

Last rotated

Status
```

not necessarily raw secret value.

---

# 131. Secret Display

UI:

```text
sk_live_••••••••A92X
```

or:

```text
Configured
```

not full value after creation.

---

# 132. Secret Rotation

Integration can:

```text
Add new secret

Verify

Switch

Revoke old
```

where provider supports it.

---

# 133. Secret Change Audit

Audit:

```text
Changed By

Integration

Timestamp
```

but never include secret value.

---

# 134. User Preferences

User-specific presentation/convenience configuration.

Examples:

```text
Appearance

Locale

Dashboard layout

Notification preferences

Table density
```

---

# 135. User Preference Is Not Business Policy

A Warehouse user's dark mode must not affect other users.

---

# 136. Business Settings Override User Preference Where Necessary

Example:

```text
Business reporting timezone
```

cannot be changed by one user preference for official report interpretation.

User may change display timezone only if report clearly identifies context.

---

# 137. Feature Flags

Feature Flag controls software rollout.

Example:

```text
new_checkout_v2
```

---

# 138. Feature Flag Is Not Business Setting

Purpose:

```text
Deployment

Testing

Gradual rollout

Rollback
```

not permanent business configuration.

---

# 139. Feature Flag Lifecycle

```text
Created

Enabled for target

Rolled out

Removed
```

Flags should not become permanent architecture debris.

---

# 140. Do Not Put Business Rules Behind Hidden Flags Forever

If feature becomes normal:

```text
remove flag

promote configuration if genuinely configurable
```

---

# 141. Feature Flag Scope

Potential:

```text
Environment

Organization

User cohort
```

but implementation belongs platform/deployment architecture.

---

# 142. Experiments

A/B experiment assignment is different again.

Future Marketing/Experimentation domain.

---

# 143. Configuration Change Semantics

Every configuration should declare one of several behavior classes.

Recommended:

```text
FUTURE_ONLY

IMMEDIATE_DYNAMIC

REQUIRES_RECALCULATION

REQUIRES_MIGRATION

REQUIRES_IMPACT_RESOLUTION

IMMUTABLE_AFTER_USE
```

---

# 144. FUTURE_ONLY

Example:

```text
Order Number Prefix
```

New Orders affected.

Existing Orders unchanged.

---

# 145. IMMEDIATE_DYNAMIC

Example:

```text
Show Out-of-Stock Products
```

Storefront presentation changes immediately.

No transaction rewriting.

---

# 146. REQUIRES_RECALCULATION

Example:

```text
Reporting Currency
```

Analytics projections/cache may need recalculation.

Transactions unchanged.

---

# 147. REQUIRES_MIGRATION

Example:

Structured configuration schema changes.

Application performs migration.

---

# 148. REQUIRES_IMPACT_RESOLUTION

Example:

```text
Deactivate default receiving Location
```

cannot proceed safely until replacement/default issue is resolved.

---

# 149. IMMUTABLE_AFTER_USE

Certain sequence or integration identifiers may become immutable after meaningful usage.

---

# 150. Configuration Impact Preview

High-impact changes should show what will be affected.

Example:

```text
Change Default Currency
BDT → USD

Impact:
• New Product price defaults
• New Expense currency defaults
• New direct Purchase defaults
• Storefront configuration review required
• Historical records unchanged
```

---

# 151. Another Impact Preview

```text
Disable COD

Impact:
• New checkouts cannot select COD
• Existing COD Orders remain unchanged
```

---

# 152. Another

```text
Require MFA For All Internal Users

Impact:
12 users active
4 already enrolled
8 will require enrollment
```

---

# 153. Impact Preview Is Domain-Provided

Settings framework asks owner domain:

```text
previewConfigurationChange(...)
```

or equivalent.

Do not make generic Settings guess Inventory/Payment effects.

---

# 154. Configuration Validation

Three levels:

```text
Type Validation

Domain Validation

Cross-Domain Validation
```

---

# 155. Type Validation

Example:

```text
Low stock threshold:
-10
```

invalid if policy requires non-negative.

---

# 156. Domain Validation

Example:

```text
Default Receiving Location
```

must have:

```text
PURCHASE_RECEIVING capability
```

---

# 157. Cross-Domain Validation

Example:

Storefront payment method set to:

```text
bKash
```

but Payment Method is inactive.

Configuration invalid.

---

# 158. Reference Validation

Entity references must:

```text
exist

belong to same Organization

support required capability/state
```

---

# 159. No Dangling Configuration

If referenced entity is archived/deactivated:

```text
configuration becomes unhealthy
```

or source operation blocks with clear remediation.

---

# 160. Configuration Health

System should continuously detect invalid effective configuration.

Examples:

```text
No active Payment Method

Default Receiving Location inactive

Storefront locale unsupported

Reporting currency missing FX setup

Security requires MFA but Owner has none

Active storefront has no eligible fulfillment Location
```

---

# 161. Settings Health Dashboard

Recommended:

```text
Critical Configuration Problems

Warnings

Recently Changed Settings

Integration Configuration Issues

Missing Required Defaults
```

---

# 162. Severity

```text
INFO

WARNING

ERROR

CRITICAL
```

---

# 163. Blocking Configuration Error

Example:

```text
No active eligible fulfillment location.
```

Checkout may need to stop.

---

# 164. Warning

Example:

```text
No default receiving Location configured.
```

Manual receiving selection still possible.

---

# 165. Configuration Change History

Every meaningful change records:

```text
Setting

Scope

Previous Value

New Value

Actor

Timestamp

Reason if required
```

---

# 166. Sensitive Values

Audit must mask:

```text
secret references

private provider credentials
```

---

# 167. Configuration Revision

Potential grouping:

```text
Change Set
```

for multiple related updates.

---

# 168. Example

Admin changes:

```text
Default Locale

Date Formatting

Currency Display
```

in one save.

Audit can preserve one:

```text
Localization Change Set
```

with field-level changes.

---

# 169. Transactional Configuration Save

Related settings should update atomically.

---

# 170. Avoid Partial Save

Example:

```text
Enable payment method
+
required instructions
```

should not leave method enabled with missing instructions because request crashed midway.

---

# 171. Optimistic Concurrency

Two admins open Settings simultaneously.

Admin A changes:

```text
Timezone
```

Admin B saves stale page.

System should not silently restore old Timezone.

Use configuration versioning/concurrency checks.

---

# 172. Configuration Version

Organization can maintain:

```text
configuration_version
```

or domain-specific versions.

---

# 173. Cache

Configuration reads can be cached heavily.

---

# 174. Effective Configuration Cache

Cache key may include:

```text
Organization

Storefront

Configuration Domain

Version
```

---

# 175. Invalidation

Configuration save emits:

```text
configuration.changed
```

and invalidates affected cache.

---

# 176. Do Not Wait Minutes for Critical Config

Example:

```text
Disable Payment Method
```

should take effect promptly.

---

# 177. Permission Change Parallel

Just as permissions cannot stay stale indefinitely, critical business configuration should have reliable invalidation.

---

# 178. Public Configuration Projection

Storefront needs some Settings publicly.

Examples:

```text
Store Name

Logo

Public Support Contact

Available locales

Navigation

Theme
```

---

# 179. Private Configuration

Never expose:

```text
Security policies in detail

Provider configuration

Financial defaults

Integration secrets

Internal alert routing
```

through public Storefront APIs.

---

# 180. Public DTO

Purpose-built:

```text
StorefrontConfiguration
```

not:

```text
GET /settings/all
```

then frontend ignores private fields.

---

# 181. Admin Configuration API

Likewise grouped/domain-specific.

---

# 182. Avoid Generic

```text
PATCH /settings/{key}
```

for all high-risk behavior.

Semantic commands are safer.

---

# 183. Example Commands

```text
updateLocalizationSettings()

updateStorefrontSettings()

setDefaultReceivingLocation()

updateOrderNumberingPolicy()

updateSecurityPolicy()
```

---

# 184. Domain-Owned Commands

Inventory policy changes go through:

```text
Inventory application service
```

even if Settings UI invokes them.

---

# 185. Settings UI as Aggregator

Admin Settings area can route to:

```text
General

Localization

Storefront

Payments

Inventory

Notifications

Security

Integrations
```

while backend ownership remains distributed.

---

# 186. Search Settings

A settings search should allow:

```text
timezone

order number

payment

review moderation
```

and navigate to correct domain configuration.

---

# 187. Settings Navigation

Recommended:

```text
Settings
├── Organization
├── Localization
├── Storefront
├── Commerce
├── Inventory & Fulfillment
├── Payments
├── Finance
├── Notifications
├── Reviews
├── Analytics
├── Security
└── Integrations
```

---

# 188. Do Not Expose Technical Internals

Normal business admin should not see:

```text
Redis TTL

queue worker concurrency

database pool size
```

inside business Settings.

---

# 189. Developer Configuration

Technical operations belong:

```text
deployment

operations

developer configuration
```

not normal admin portal.

---

# 190. Configuration Defaults

Defaults should come from:

```text
application-defined safe defaults
```

or Organization onboarding.

---

# 191. Default Must Be Visible

Admin should be able to see:

```text
Current effective value

Using system default
```

rather than having invisible behavior.

---

# 192. Null vs Default

Need distinction:

```text
No override
```

vs:

```text
Explicitly set to empty/disabled
```

---

# 193. Example

Notification email:

```text
INHERIT
```

different from:

```text
DISABLED
```

---

# 194. Configuration Reset

Where inheritance exists:

```text
Reset to Organization Default
```

removes override.

---

# 195. Change Reason

Require for especially sensitive changes.

Examples:

```text
Overselling enabled

Security MFA disabled

Landed Cost policy changed

Payment Method disabled
```

---

# 196. Step-Up Authentication

High-risk setting changes may require:

```text
recent MFA
```

as defined by IAM.

---

# 197. Permissions

Potential settings capabilities:

```text
settings.view

settings.organization.manage

settings.localization.manage

settings.storefront.manage

settings.commerce.manage

settings.integrations.view

settings.integrations.manage

settings.security.manage
```

Domain-specific capabilities still apply.

---

# 198. Example

Changing Payment Method requires:

```text
payments.methods.manage
```

not only:

```text
settings.commerce.manage
```

---

# 199. Why?

The Settings page should not become a permission bypass into every subsystem.

---

# 200. Sensitive Setting Read

Some settings may require view permission separately from edit.

Example:

```text
Integration metadata

Security policy

Financial account defaults
```

---

# 201. Owner Protection

Critical Organization/security settings may be Owner-only or highly restricted.

---

# 202. Organization Deletion

Not ordinary Settings.

Future organization closure/data retention workflow.

---

# 203. Integration Configuration

Each integration should be first-class.

Conceptually:

```text
Integration

Provider

Status

Non-secret Settings

Secret References

Capabilities

Health

Last Sync

Audit
```

---

# 204. Integration Status

Potential:

```text
DRAFT

ACTIVE

PAUSED

ERROR

DISABLED
```

---

# 205. Integration Settings Example

Courier:

```text
Merchant ID

Pickup Location Mapping

Default Service

Webhook URL metadata
```

Secrets separate.

---

# 206. Integration Health

Can show:

```text
Connected

Authentication expired

Webhook failing

Provider unavailable

Missing required mapping
```

---

# 207. Integration Configuration Change

Should not rewrite historical courier/shipping records.

---

# 208. Webhook Configuration

Future API/Webhooks domain owns:

```text
Webhook Endpoints

Subscriptions

Signing configuration

Retries
```

Settings UI may surface it.

---

# 209. API Configuration

Future:

```text
API Clients

Service Accounts

Keys

Webhook subscriptions
```

are domain entities, not string Settings.

---

# 210. Business Policy vs Entity

Rule:

> If something has lifecycle, identity, history, relationships or many records, it is probably an entity—not a Setting.

---

# 211. Examples of Entities, Not Settings

```text
Payment Method

Financial Account

Warehouse / Location

Promotion

Notification Template

API Client

Webhook Endpoint

Supplier

Courier Integration
```

---

# 212. Examples of True Settings

```text
Default Locale

Default Currency

Order Prefix

Review moderation default

Storefront out-of-stock presentation policy
```

---

# 213. Configuration Import/Export

Useful for:

```text
backup

environment setup

future Organization templates
```

but sensitive.

---

# 214. Export Should Exclude Secrets

Never export usable:

```text
API keys

passwords

webhook secrets
```

in ordinary configuration export.

---

# 215. Configuration Export

Potential:

```text
Organization settings

Localization

Public storefront

Domain policy defaults
```

---

# 216. Import Validation

Before applying:

```text
schema validate

entity references resolve

impact preview

permission checks
```

---

# 217. Do Not Blindly Clone IDs

Location ID from Organization A cannot become default Location in Organization B.

---

# 218. Future Organization Template

Could define:

```text
Bangladesh Ecommerce Defaults
```

with:

```text
Asia/Dhaka

BDT

Bangla/English locales
```

but should create safe Organization-specific configuration.

---

# 219. Multi-Business Readiness

Every Organization gets independent:

```text
Timezone

Currency

Numbering

Storefront

Operational Policies

Security Settings
```

---

# 220. No Maevelle Hardcoding

Avoid:

```text
if business_name == "Maevelle"
```

for Settings behavior.

---

# 221. Country

Organization may have:

```text
Country / Region
```

for defaults.

---

# 222. Country Does Not Automatically Determine Everything

Bangladesh can suggest:

```text
BDT

Asia/Dhaka

bn-BD
```

but administrator may need different:

```text
language

currency

international operation
```

---

# 223. Country-Based Defaults

Use as onboarding suggestions.

Not irreversible rules.

---

# 224. Measurements

Potential organization default:

```text
Metric
```

but Sizing/physical dimensions preserve explicit units.

---

# 225. Unit Display Preference

Storefront can display:

```text
cm

in
```

based on locale/user choice.

Stored measurements remain structured.

---

# 226. Default Does Not Convert Source

Changing display unit:

```text
cm → in
```

does not overwrite stored measurement values.

---

# 227. Weight Units

Catalog/Shipment can store explicit units.

Organization preference may choose default data-entry/display unit.

---

# 228. Input Defaults

Examples:

```text
Default Weight Unit:
kg

Default Length Unit:
cm
```

used for forms.

---

# 229. Historical Physical Data

Variant weight:

```text
0.5 kg
```

remains structured regardless of later input default.

---

# 230. Precision Policy

Different domains may have different precision requirements:

```text
Money

Weight

Dimensions

Quantity
```

Do not create one global decimal precision Setting.

---

# 231. Locale-Sensitive Input

Admin form may accept:

```text
1,5
```

in some locales.

Backend must normalize safely to structured numeric value.

---

# 232. Export Formatting

CSV/XLSX may use:

```text
raw numeric values
```

plus locale-aware display where appropriate.

Machine imports should avoid ambiguous formatted money strings.

---

# 233. API Localization

API responses should prefer:

```text
machine-friendly values
```

such as:

```text
amount: "1500.00"
currency: "BDT"
```

rather than only:

```text
"৳১,৫০০"
```

---

# 234. Presentation Layer Formats

Frontend/localization layer handles customer-facing formatting.

---

# 235. Translation Keys

Application UI text uses:

```text
translation keys
```

not business data stored in Settings.

---

# 236. Product Translations

Catalog-owned.

---

# 237. Template Translations

Notification-owned.

---

# 238. Settings Labels

Application localization resources.

---

# 239. Business Custom Text

Example:

```text
Checkout note:
"Delivery usually takes 2–3 days."
```

could be Storefront content/configuration.

---

# 240. Business Copy vs Translation

If multilingual:

```text
copy per locale
```

may need structured localization.

---

# 241. CMS Boundary

Large editable content should move to CMS.

Do not let Settings become mini-CMS containing:

```text
About page

FAQ site

Blog posts
```

---

# 242. Configuration Change Event

Every material change can emit:

```text
configuration.changed
```

with:

```text
domain

scope

configuration key

version
```

without leaking secrets.

---

# 243. Consumers

Potential:

```text
Cache invalidation

Analytics

Audit

Notifications

Integration refresh
```

---

# 244. Domain-Specific Events

Prefer semantic event when meaningful:

```text
payment_method.disabled

organization.timezone_changed

security.mfa_policy_changed
```

rather than only generic configuration event.

---

# 245. Change Notifications

High-risk configuration changes may notify:

```text
Owner

Security Admin

Affected team
```

through Notification domain.

---

# 246. Example

```text
COD disabled
```

could notify Order/Storefront operators if configured.

---

# 247. Configuration Rollback

Can we restore previous configuration?

For simple FUTURE_ONLY/IMMEDIATE_DYNAMIC settings:

```text
yes, through a new change
```

---

# 248. Rollback Is New Change

Do not erase history.

Example:

```text
Version 5:
COD disabled

Version 6:
COD enabled
```

---

# 249. Historical Configuration Versions

Useful for:

```text
Audit

Debugging

Incident investigation
```

---

# 250. Reconstructing Past Effective Settings

For high-value configuration, system should be able to determine:

```text
What was the setting when event occurred?
```

when needed.

But not every cosmetic setting needs full temporal querying.

---

# 251. Transaction Snapshot Preferred

For transactionally important fields:

```text
Currency

Promotion

Delivery charge

Payment method
```

Order snapshot is stronger than trying to reconstruct everything from settings history.

---

# 252. Configuration History Supports Explanation

Not a replacement for transaction snapshots.

---

# 253. Change Categories

Potential:

```text
COSMETIC

OPERATIONAL

FINANCIAL

SECURITY

INTEGRATION
```

for audit/confirmation UX.

---

# 254. Financial Configuration

Examples:

```text
Default Currency

Payment Method availability

Large Expense threshold

Analytics reporting currency
```

---

# 255. Security Configuration

Highest sensitivity.

---

# 256. Confirmation UX

High impact:

```text
You are disabling Cash on Delivery for new checkouts.
Existing Orders will not change.
```

---

# 257. Prevent Accidental Destructive Effects

Configuration change must never silently:

```text
cancel Orders

move Inventory

delete Customers
```

unless dedicated business workflow explicitly performs such operations.

---

# 258. Example — Warehouse Default

Changing default Location does not:

```text
transfer existing stock.
```

---

# 259. Example — Currency

Changing default does not:

```text
convert Product prices automatically.
```

If business wants price conversion:

```text
dedicated pricing migration/bulk update
```

is required.

---

# 260. Example — Timezone

Changing timezone does not:

```text
shift stored timestamps.
```

---

# 261. Example — Review Policy

Turning manual moderation off affects:

```text
future Review moderation workflow
```

according to Reviews policy.

Pending Reviews should not automatically publish unless explicitly selected.

---

# 262. Example — Oversell

Enabling oversell affects future Inventory availability/reservation behavior.

It should not:

```text
create negative stock immediately.
```

---

# 263. Example — Reservation Expiration

Changing expiration from:

```text
24h → 12h
```

must define effect on existing reservations.

Possible:

```text
Existing reservations retain original expiry
```

recommended for predictability unless explicit migration selected.

---

# 264. Policy Version Snapshot

Certain domain policies may snapshot relevant policy version at transaction creation.

Example:

```text
Reservation Policy Version
```

if needed.

Do not force universal configuration snapshot everywhere.

---

# 265. Configuration Testing

Every setting needs tests for:

```text
Default

Valid change

Invalid value

Unauthorized change

Scope resolution

History

Cache invalidation
```

---

# 266. High-Impact Setting Tests

Also:

```text
Impact preview

Concurrent edit

Reference becomes inactive

Rollback

Historical transactions unchanged
```

---

# 267. Localization Tests

Mandatory:

```text
Bangla locale

English locale

BDT

USD

Date formatting

Number formatting

Timezone boundaries

UTC ↔ Asia/Dhaka

DST-zone future compatibility
```

---

# 268. Timezone Test

Even though Bangladesh currently has straightforward local time, platform tests should include a DST-changing zone because platform architecture is reusable.

---

# 269. Numbering Tests

```text
Concurrent Order creation

Year reset

Prefix change

Retry

Rollback

Search
```

---

# 270. Configuration Cache Test

Change:

```text
COD enabled → disabled
```

Storefront must not continue accepting COD because stale cache persists.

---

# 271. Cross-Organization Test

Organization A changes:

```text
timezone
```

Organization B remains unchanged.

---

# 272. Reference Scope Test

Organization A cannot select Organization B's:

```text
Warehouse

Payment Account

Media Asset
```

as configuration reference.

---

# 273. Security Test

Normal Settings user cannot change:

```text
MFA requirement

Owner security policy
```

without required permission/step-up.

---

# 274. Secret Test

API never returns full stored integration secret.

---

# 275. Failure Scenario — Config Saved, Cache Invalidation Failed

Authoritative configuration remains saved.

Cache versioning/invalidation retry ensures convergence.

Critical reads may compare configuration version.

---

# 276. Failure Scenario — Partial Multi-Setting Save

Use transaction:

```text
all intended changes
or
none
```

for one configuration change set.

---

# 277. Failure Scenario — Reference Deleted

Normally referenced domain entity should archive/deactivate instead of destructive delete.

Configuration health detects invalid relationship.

---

# 278. Failure Scenario — Timezone Database Update

Named IANA zone allows runtime/database rules to follow updated civil-time data rather than having business configuration store a fixed permanent offset.

---

# 279. Failure Scenario — Unsupported Locale

Reject selection or use explicit fallback.

Do not render broken translation keys silently.

---

# 280. Failure Scenario — Missing Default Currency

Transaction creation requiring currency must fail clearly rather than assume an arbitrary currency.

---

# 281. Failure Scenario — Sequence Collision

Database/sequence uniqueness protects human transaction number.

Retry number allocation safely.

---

# 282. Failure Scenario — Sequence Generation Unavailable

Do not create two transactions with same human number.

Depending domain:

```text
fail creation
```

or use robust database-backed sequence primitive.

---

# 283. Failure Scenario — Integration Secret Missing

Integration:

```text
ERROR / MISCONFIGURED
```

but unrelated commerce remains operational.

---

# 284. Failure Scenario — Payment Provider Misconfigured

That Payment Method becomes unavailable.

Other Payment Methods can continue.

Storefront clearly reflects availability.

---

# 285. Failure Scenario — Default Receiving Location Disabled

New Procurement receiving requires another eligible Location.

Historical records unaffected.

---

# 286. Failure Scenario — Reporting Currency Changed

Analytics projections/cache refresh.

Transactions retain original currencies.

---

# 287. Failure Scenario — Review Policy Changed Mid-Submission

Final Review command uses current applicable Reviews policy.

Already published Reviews remain historical.

---

# 288. Configuration Health Principle

> **An invalid setting should become visible as an operational problem—not silently force the system to guess.**

---

# 289. API Commands

Conceptual:

```text
updateOrganizationSettings()

updateLocalizationSettings()

updateStorefrontSettings()

updateUserPreferences()

previewConfigurationChange()

resetConfigurationOverride()

updateNumberSequencePolicy()
```

Domain-specific:

```text
updateInventoryPolicy()

updatePaymentConfiguration()

updateReviewPolicy()

updateNotificationPolicy()

updateSecurityPolicy()
```

remain owned by those application services.

---

# 290. Read APIs

```text
getEffectiveConfiguration()

getConfigurationDefinition()

getConfigurationHistory()

getSettingsHealth()

getPublicStorefrontConfiguration()

getUserPreferences()
```

---

# 291. Settings Search API

Could return:

```text
Setting

Description

Section

Permission

Current value summary
```

without secret content.

---

# 292. Structured Errors

Examples:

```text
CONFIGURATION_UNKNOWN

CONFIGURATION_VALUE_INVALID

CONFIGURATION_SCOPE_INVALID

CONFIGURATION_REFERENCE_INVALID

CONFIGURATION_PERMISSION_DENIED

CONFIGURATION_IMPACT_UNRESOLVED

CONFIGURATION_VERSION_CONFLICT

CONFIGURATION_REQUIRES_STEP_UP

CONFIGURATION_SECRET_NOT_AVAILABLE

CONFIGURATION_DEPENDENCY_INVALID

NUMBER_SEQUENCE_COLLISION

TIMEZONE_INVALID

LOCALE_UNSUPPORTED

CURRENCY_UNSUPPORTED
```

---

# 293. Configuration Concurrency

Optimistic concurrency mandatory for admin changes.

---

# 294. Idempotency

High-risk configuration commands should be retry-safe.

Example:

```text
disablePaymentMethod(operationId)
```

retry does not create duplicate audit/events.

---

# 295. Audit Events

Examples:

```text
settings.organization_changed

settings.localization_changed

settings.storefront_changed

settings.numbering_changed

settings.default_location_changed

settings.integration_changed

settings.security_changed
```

---

# 296. Audit Detail

Record:

```text
Actor

Scope

Configuration

Before

After

Timestamp

Reason

Impact summary
```

---

# 297. Sensitive Audit

Never store:

```text
raw secret
```

in before/after.

Use:

```text
Secret rotated
```

---

# 298. Configuration Analytics

Usually not business analytics.

But operational/security reporting may show:

```text
Configuration changes

High-risk setting changes

Invalid configuration count
```

---

# 299. Important Invariants

### SET-INV-001

Every business configuration belongs to an explicit owner domain.

### SET-INV-002

Settings is not an untyped arbitrary key/value authority.

### SET-INV-003

Every registered configuration has defined value type and validation.

### SET-INV-004

Every registered configuration has defined supported scope.

### SET-INV-005

Configuration inheritance exists only where explicitly supported.

### SET-INV-006

Effective configuration can be traced to the scope/default that produced it.

### SET-INV-007

Changing current configuration does not silently rewrite historical transactions.

### SET-INV-008

Historical Orders retain their transaction currencies regardless of default currency changes.

### SET-INV-009

Historical transaction numbers remain unchanged after sequence configuration changes.

### SET-INV-010

Default Location changes do not move existing Inventory.

### SET-INV-011

Timezone changes never alter stored absolute event instants.

### SET-INV-012

Money identity is currency code + amount; currency symbol is presentation only.

### SET-INV-013

Date/number/currency formatting is a presentation concern and does not rewrite stored values.

### SET-INV-014

Named IANA time-zone identifiers are used for organizational time-zone configuration.

### SET-INV-015

Infrastructure secrets are not ordinary business Settings.

### SET-INV-016

Raw secrets are never exposed through ordinary Settings APIs/audit.

### SET-INV-017

Feature Flags are separate from permanent business configuration.

### SET-INV-018

User Preferences cannot modify Organization business policy.

### SET-INV-019

Domain entities with lifecycle/history are not collapsed into generic Settings records.

### SET-INV-020

Entity-reference settings must reference valid same-Organization entities.

### SET-INV-021

Invalid configuration dependencies are surfaced through health checks.

### SET-INV-022

High-impact changes can require impact preview before commit.

### SET-INV-023

High-risk Security configuration requires dedicated authorization and step-up where defined.

### SET-INV-024

Configuration writes are concurrency-safe.

### SET-INV-025

Related configuration changes can be committed atomically as one change set.

### SET-INV-026

Configuration history is append-oriented/auditable.

### SET-INV-027

Rolling a setting back creates a new change rather than erasing history.

### SET-INV-028

Public Storefront configuration exposes only explicitly public-safe fields.

### SET-INV-029

Critical configuration-cache invalidation must converge promptly after change.

### SET-INV-030

No configuration failure permits the system to silently fabricate financially or operationally important defaults.

---

# 300. V1 Mandatory Scope

Maevelle V1 Settings should include:

```text
✓ Typed configuration architecture

✓ Explicit domain ownership

✓ Configuration Definition registry

✓ Organization Settings

✓ Organization Display Name

✓ Business Address / Contact foundation

✓ Organization Timezone

✓ Default Locale

✓ Default Currency

✓ Date Formatting

✓ Number Formatting

✓ Currency Presentation

✓ Default Weight / Length input units

✓ Storefront Settings

✓ Store Name

✓ Logo

✓ Favicon

✓ Public Contact Details

✓ Navigation settings

✓ Footer settings

✓ Announcement Bar

✓ Typed Homepage Sections

✓ SEO Defaults

✓ One Theme configuration

✓ Number Sequence infrastructure

✓ Order numbering

✓ Purchase numbering

✓ Shipment numbering

✓ Receipt numbering

✓ Expense numbering

✓ Refund numbering

✓ Transfer numbering

✓ Prefix configuration

✓ Sequence padding

✓ Yearly/never reset policy

✓ Concurrency-safe number allocation

✓ Default Receiving Location

✓ Default Return Location

✓ Fulfillment priority configuration

✓ Domain policy Settings routing

✓ Payment configuration routing

✓ Review configuration routing

✓ Notification configuration routing

✓ Analytics reporting configuration

✓ Security Settings routing

✓ User Preferences

✓ Effective Value resolution

✓ Explicit inheritance where supported

✓ Configuration Validation

✓ Cross-domain reference validation

✓ Impact Preview foundation

✓ Settings Health

✓ Configuration Change History

✓ Audit

✓ Permissions

✓ Optimistic Concurrency

✓ Cache invalidation

✓ Public Storefront configuration projection

✓ Secrets separated from ordinary settings

✓ Configuration versioning foundation
```

---

# 301. Strongly Preferred V1

```text
Settings Search

Configuration Change Sets

Configuration Health Dashboard

High-Risk Change Notifications

Preview Next Sequence Number

Reset-to-Default UX

Configuration Export excluding secrets

Settings Import validation foundation

Integration Health

Organization Branding

Locale fallback configuration

Reporting Currency

Settings change reason for high-risk actions

Security step-up for sensitive changes
```

---

# 302. Foundation Now / Later

Architecture should prepare for:

```text
Multiple Storefronts

Multiple Organization Locales

User Timezones

Multiple Currencies

Country-specific onboarding defaults

Multiple Themes

Full CMS

Configuration Templates

Environment Promotion

Advanced Feature Flags

Experiments

Organization Cloning

Advanced Integration Configuration

Accounting Policy Configuration

Multi-Entity Businesses
```

---

# 303. Deferred Advanced Capabilities

Post-V1:

```text
Full configuration template marketplace

Multi-storefront configuration inheritance

Advanced regional tax settings

Advanced international commerce settings

Complex translation management

Dynamic feature experimentation

Country-specific compliance packs

Configuration approval workflows

Policy simulation

Configuration-as-code synchronization

Enterprise tenant templates
```

---

# 304. Decisions Established

### Decision SET-001

**Settings is a typed configuration architecture rather than one generic key/value table contract.**

### Decision SET-002

**Every business setting has an explicit owner domain.**

### Decision SET-003

**Settings UI may aggregate configuration while backend ownership remains distributed.**

### Decision SET-004

**Configuration scopes are explicit and limited to supported context types.**

### Decision SET-005

**Inheritance is opt-in per configuration definition rather than universal.**

### Decision SET-006

**Current effective configuration remains explainable back to its source/default.**

### Decision SET-007

**Historical transactions never derive their historical truth from today's Settings.**

### Decision SET-008

**Default Currency changes affect future defaults and do not convert existing monetary records.**

### Decision SET-009

**Organization timezone uses a named IANA time-zone identifier.**

### Decision SET-010

**Stored transaction instants remain absolute; timezone controls interpretation/presentation.**

### Decision SET-011

**Locale-sensitive formatting relies on established internationalization/CLDR-style runtime data rather than handwritten formatting rules.**

### Decision SET-012

**Locale, Currency and Timezone remain distinct concepts.**

### Decision SET-013

**Human-readable transaction numbers are separate from internal entity IDs.**

### Decision SET-014

**Number sequence generation is concurrency-safe.**

### Decision SET-015

**Maevelle does not promise gapless operational numbering by default.**

### Decision SET-016

**Changing number-sequence configuration never renumbers historical records.**

### Decision SET-017

**Receiving, Return and Fulfillment defaults remain separate rather than one magical default Warehouse.**

### Decision SET-018

**A default value normally pre-fills behavior rather than becoming an immutable forced choice unless domain policy says otherwise.**

### Decision SET-019

**Business entities such as Payment Methods, Financial Accounts, Locations and Integrations are not collapsed into generic Settings records.**

### Decision SET-020

**Secrets and deployment configuration are separate from business Settings.**

### Decision SET-021

**Feature Flags are separate from persistent business configuration.**

### Decision SET-022

**User Preferences are separate from Organization policies.**

### Decision SET-023

**High-impact configuration changes support impact preview.**

### Decision SET-024

**Settings change semantics are explicitly classified, such as FUTURE_ONLY or IMMEDIATE_DYNAMIC.**

### Decision SET-025

**Configuration changes are audited and version/concurrency protected.**

### Decision SET-026

**Public Storefront configuration uses a dedicated safe projection rather than exposing the complete Settings model.**

### Decision SET-027

**Configuration dependency failures are first-class health issues.**

### Decision SET-028

**Critical configuration changes invalidate effective configuration promptly.**

### Decision SET-029

**Rollback of configuration creates another auditable change rather than rewriting history.**

### Decision SET-030

**Configuration architecture remains Organization/multi-business ready without forcing full SaaS complexity into V1.**

---

# 305. Resulting Settings Architecture

```text
                     SETTINGS UI
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
   Organization      Localization      Storefront
        │                │                 │
        └────────────────┼─────────────────┘
                         │
               SETTINGS ORCHESTRATION
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
 Inventory           Payments            Reviews
 Policies            Policies            Policies
      │                  │                  │
 Warehouse          Notifications        Security
 Defaults             Policies           Policies
      │                  │                  │
      └──────────────────┼──────────────────┘
                         │
                    OWNER DOMAINS
```

Settings gives one coherent administrative experience.

But each business rule remains owned by its correct domain.

---

# 306. Localization Result

```text
Organization
    │
    ├── Timezone
    │      Asia/Dhaka
    │
    ├── Default Locale
    │      en-BD / bn-BD
    │
    └── Default Currency
           BDT
```

Transactions still preserve:

```text
Order:
৳1,500 BDT

Purchase:
¥220 CNY

Shipment Expense:
$40 USD
```

independently.

---

# 307. Time Example

Stored instant:

```text
2026-08-19T23:30:00Z
```

Business display:

```text
20 Aug 2026
05:30 AM
Asia/Dhaka
```

Change display timezone later:

```text
does not change the actual event.
```

---

# 308. Numbering Example

Current:

```text
Order Prefix:
ORD

Next:
ORD-2026-000153
```

Admin changes:

```text
Prefix:
MV
```

Future:

```text
MV-2026-000154
```

Historical:

```text
ORD-2026-000152
```

remains exactly as issued.

---

# 309. Default Warehouse Example

Before:

```text
Default Receiving:
Main Warehouse
```

Purchase receipt form defaults:

```text
Main Warehouse
```

After configuration change:

```text
Default Receiving:
New Import Warehouse
```

New receipt:

```text
New Import Warehouse
```

Historical receipt:

```text
Main Warehouse
```

unchanged.

---

# 310. Configuration Change Example

Admin attempts:

```text
Disable COD
```

System:

```text
Impact Preview

New customer checkouts:
COD unavailable

Existing Orders:
unchanged

Existing COD Payments:
unchanged

Storefront:
reconfiguration cache invalidated

Proceed?
```

This is much safer than blindly changing:

```text
settings.cod = false
```

---

# 311. Configuration vs History

The general pattern becomes:

```text
CURRENT CONFIGURATION
        │
        ▼
FUTURE DOMAIN DECISION
        │
        ▼
TRANSACTION SNAPSHOT
        │
        ▼
HISTORICAL TRUTH
```

Once the transaction exists, current Settings no longer control what historically happened.

---

# 312. Architecture Milestone

With this domain we now have coherent foundations for almost every major business capability:

```text
Catalog                  ✓
Sizing                   ✓
Inventory                ✓
Warehouses               ✓
Procurement              ✓
Inbound Shipments        ✓
Landed Cost              ✓
Orders                   ✓
Payments                 ✓
Customers                ✓
Media                    ✓
Identity / Access        ✓
Finance Operations       ✓
Storefront               ✓
Reviews                  ✓
Promotions               ✓
Notifications            ✓
Analytics                ✓
Settings / Localization  ✓
```

This is a major point in the project.

We have moved far enough through domain architecture that the next step should start defining **how these domains communicate externally and with each other through stable interfaces**.

---

# 313. Recommended Next Domain

Next:

```text
docs/architecture/api-webhook-integration-architecture.md
```

This should be broader than merely:

```text
REST endpoints
```

because the platform needs:

```text
Public Storefront APIs

Admin APIs

Internal Application Interfaces

Integration APIs

Webhooks

Service Accounts

API Authentication

Idempotency

Pagination

Filtering

Sorting

Search

Command vs Query design

Error envelopes

API versioning

Request validation

Optimistic concurrency

Rate limiting

Bulk operations

Async operations

Webhook subscriptions

Webhook delivery

Webhook retries

Webhook signatures

Replay protection

Webhook event IDs

Webhook ordering

Webhook dead-letter handling

Provider callbacks

Inbound webhooks

Courier integrations

Payment gateway integrations

Future mobile apps

Future third-party developer API
```

The most important rule should become:

```text
DOMAIN MODEL
      │
      ▼
APPLICATION COMMAND / QUERY
      │
      ▼
API CONTRACT
```

not:

```text
Database Table
      ↓
CRUD Endpoint
```

For example, we should not design:

```text
PATCH /inventory-level/123
{
  "quantity": 500
}
```

Instead:

```text
POST /inventory/adjustments
```

or a semantic equivalent expressing:

```text
Inventory Item

Location

Difference/Target

Reason

Idempotency

Actor
```

because Inventory quantity is ledger-controlled.

Likewise:

```text
POST /orders/{id}/cancel

POST /shipments/{id}/dispatch

POST /payments/{id}/verify

POST /landed-cost/{id}/finalize
```

should represent business commands rather than generic CRUD mutation.

We also need the outbound integration pattern:

```text
DOMAIN EVENT
     ↓
WEBHOOK EVENT
     ↓
WEBHOOK DELIVERY
     ↓
External Consumer
```

with the same lesson we applied to Notifications:

```text
Domain Event
≠
Webhook Event
≠
Webhook Delivery Attempt
```

so an external partner being unavailable can never roll back:

```text
Order

Payment

Inventory

Shipment
```

business truth.

---

**End of Settings, Configuration & Localization Architecture v0.1**
