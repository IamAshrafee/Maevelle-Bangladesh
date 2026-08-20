# Maevelle Ecommerce — Identity, Authentication & Access Control Architecture

**Document:** `docs/domains/access-control/access-control-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** All business domains, `requirements.md`, `scope.md`, `media-architecture.md`, `customer-architecture.md`

---

# 1. Purpose

This domain defines how Maevelle determines:

```text
Who is accessing the platform?

How did they authenticate?

Which Organization do they belong to?

Is their account active?

What are they allowed to do?

Which resources are they allowed to act upon?

Which Locations are they allowed to operate?

Which sensitive data may they see?

Does the current action require stronger authentication?

How are permissions changed safely?

How are sessions revoked?

How are integrations authenticated?

How is every sensitive security event audited?
```

This architecture protects:

```text
Catalog

Inventory

Warehouses

Purchases

Supplier Costs

Shipments

Landed Cost

Orders

Payments

Refunds

Customers

Private Media

Business Settings

Future APIs / Integrations
```

---

# 2. Core Security Principle

> **Authentication and authorization are separate responsibilities.**

Authentication:

```text
Who are you?
```

Authorization:

```text
What are you allowed to do?
```

A successfully authenticated user does **not** automatically have permission to access a resource.

---

# 3. Second Core Principle

> **Maevelle authorization is capability-based, scope-aware, and resource-aware—not role-name-driven.**

Avoid application logic such as:

```text
if user.role == "manager"
```

or:

```text
if user.role == "admin"
```

Instead:

```text
Can this Principal perform
inventory.adjust

for this Inventory Item

at this Location

inside this Organization

under the current security context?
```

---

# 4. Third Core Principle

> **Deny by default.**

If the system cannot positively establish that an action is allowed:

```text
DENY
```

not:

```text
ALLOW
```

OWASP's current authorization guidance recommends least privilege, deny-by-default behavior, authorization checks on every request, and fine-grained attribute/relationship-aware controls for complex applications.

---

# 5. Fourth Core Principle

> **Frontend visibility is not authorization.**

Hiding:

```text
[ Refund ]
```

from the UI is useful UX.

But the server must independently reject:

```text
POST /refund
```

when the Principal does not have permission.

Every sensitive business operation must enforce authorization server-side.

---

# 6. Research-Informed Direction

OWASP recommends:

```text
Least privilege

Deny by default

Authorization checks on every request

Object/resource-level authorization

Attribute/relationship-aware authorization
```

rather than relying entirely on coarse role checks.

OWASP ASVS provides a security-verification framework for authentication, authorization, session management, and other application controls, making it useful as a later implementation/testing benchmark for Maevelle.

For authentication, NIST SP 800-63B distinguishes authentication assurance, authenticator strength, session lifetime, and reauthentication requirements, while OWASP provides complementary practical authentication/session guidance.

---

# 7. Primary Concepts

The domain consists of:

```text
Identity

Internal User Account

Organization Membership

Authentication Credential

Authenticator / MFA Method

Session

Permission / Capability

Permission Grant

Scope

Authorization Decision

Organization Ownership

Security Event

Service / Integration Identity
```

---

# 8. Internal Users Are Not Customers

Important separation:

```text
CUSTOMER
```

represents someone buying from Maevelle.

```text
INTERNAL USER
```

represents someone authorized to operate the business-management platform.

They must never be treated as the same identity type.

---

# 9. Future Customer Accounts

Future:

```text
Customer
   ↕
Customer Account
```

will have customer-facing authentication.

That authentication realm is separate from:

```text
Internal Business Portal Authentication
```

A customer must never become an internal administrator merely because some generic:

```text
role = admin
```

field was changed.

---

# 10. No HR Domain

Internal User is purely:

```text
Application Access Identity
```

It is not:

```text
Employee HR Record

Payroll Employee

Attendance Record

Job Contract
```

Maevelle explicitly does not need an HR/staff-management subsystem.

---

# 11. Identity

An **Identity** represents a person or system principal that can authenticate.

Potential principal types:

```text
HUMAN_INTERNAL_USER

SYSTEM

SERVICE_ACCOUNT

API_CLIENT
```

V1 primarily uses:

```text
HUMAN_INTERNAL_USER

SYSTEM
```

---

# 12. Stable User Identity

Internal users require stable IDs independent of:

```text
Email

Display Name

Password

Organization Membership
```

Changing email must not create a new actor identity.

---

# 13. Identity vs Organization Membership

This separation is important for future multi-business readiness.

Conceptually:

```text
IDENTITY
   │
   ├── Membership → Organization A
   │
   └── Membership → Organization B
```

V1 may have only one Organization operationally.

But:

```text
User
→ Permissions
```

should conceptually flow through Organization Membership.

---

# 14. Organization Membership

Membership answers:

```text
Does this Identity belong to this Organization?

Is the membership active?

What permissions does it have here?

What scopes apply?
```

---

# 15. Why Membership Matters

Future:

```text
User@example.com

Maevelle Bangladesh
→ Catalog permissions

Another Business
→ Owner permissions
```

can exist without duplicating authentication identities.

---

# 16. Tenant Boundary

Every access decision must first establish:

```text
Principal has valid active Membership
in Resource Organization.
```

No permission can grant access across an unrelated Organization accidentally.

---

# 17. Organization ID From Client Is Not Trusted

Bad:

```text
POST /orders

organizationId = "abc"
```

therefore:

```text
grant access to abc
```

Instead:

```text
Authenticate Principal

Resolve Membership

Verify Resource Organization

Authorize Operation
```

---

# 18. Membership Lifecycle

Recommended:

```text
INVITED
   ↓
ACTIVE
   ↓
DISABLED
```

Potential:

```text
EXPIRED_INVITE

REMOVED
```

Historical membership information should remain where required for audit.

---

# 19. Invitation Model

New internal users should normally be invited by an authorized administrator.

Flow:

```text
Authorized User
      ↓
Invite User
      ↓
Email / identity specified
      ↓
Initial Permissions configured
      ↓
One-Time Invite created
      ↓
Recipient accepts
      ↓
Authentication configured
      ↓
Membership Activated
```

---

# 20. No Public Internal Signup

The business portal should not expose:

```text
Create Admin Account
```

to arbitrary public visitors.

Internal access is invite-controlled.

---

# 21. Invite Token

Invite credential should be:

```text
Random

Single-use

Time-limited

Bound to intended invitation
```

and protected similarly to other authentication secrets.

---

# 22. Invite Expiration

Unused invitations should expire.

Expired invite:

```text
cannot activate Membership.
```

Authorized admin can:

```text
Resend / Create new invitation
```

---

# 23. Invite Permission Snapshot

The invitation should identify what access the user will initially receive.

The user must not be able to modify those permission grants while accepting the invitation.

---

# 24. Email Change Before Acceptance

If administrator invited:

```text
old@example.com
```

but needs:

```text
new@example.com
```

cancel/reissue the invitation rather than allowing an untrusted acceptance flow to arbitrarily rewrite the intended identity.

---

# 25. Account Status

Internal account security state may include:

```text
ACTIVE

DISABLED
```

Separate authentication-defense conditions may include:

```text
TEMPORARILY_RATE_LIMITED

RECOVERY_REQUIRED

MFA_RECOVERY
```

Avoid encoding everything inside one `user.status`.

---

# 26. Disabling a User

Disabling should immediately prevent:

```text
New Login

Authenticated Requests

API access through that user
```

and revoke active sessions.

---

# 27. Disable Does Not Delete Actor History

Audit entries such as:

```text
Inventory adjusted by User X
```

must remain understandable after User X is disabled.

---

# 28. Internal User Hard Delete

Once an Identity has meaningful operational/audit history:

```text
do not hard-delete it casually.
```

Disable access instead.

---

# 29. Authentication Methods

V1 internal authentication should support a strong conventional mechanism such as:

```text
Verified Email
+
Password
+
MFA where required
```

The exact authentication library/provider should be selected during implementation.

Do not create custom cryptographic primitives.

---

# 30. Future Authentication Methods

Architecture should allow:

```text
Passkeys / WebAuthn

Enterprise SSO

OIDC

SAML

External Identity Provider
```

without redesigning permissions.

Authentication changes should not alter authorization architecture.

---

# 31. Email Login

V1 may use:

```text
Email
```

as human login identifier.

But stable Identity ID remains separate.

---

# 32. Email Verification

Invite acceptance establishes control over the invitation destination through a secure flow.

Future email changes must require verification of the new address.

---

# 33. Authentication Errors

Public login responses should not unnecessarily reveal:

```text
This exact email exists

This account is the Owner

This user has Finance permissions
```

Use appropriately generic authentication failure responses.

---

# 34. Password Storage

If Maevelle stores password credentials locally:

> Passwords must never be stored in plaintext or reversibly encrypted for ordinary login.

OWASP currently recommends password hashing with modern adaptive algorithms and specifically recommends Argon2id as the preferred option when available.

---

# 35. Password Hash

Recommended implementation direction:

```text
Argon2id
+
Unique salt
+
Secure framework/library
```

Exact cost parameters should be benchmarked at implementation and periodically revisited as hardware changes.

---

# 36. Never Use

Do not store authentication passwords using:

```text
Plain SHA-256

MD5

Plaintext

Reversible database encryption
```

as the password-verification mechanism.

OWASP explicitly warns that fast general-purpose hashes are unsuitable for password storage.

---

# 37. Password Length

Current NIST guidance prioritizes password length, permits long passphrases, and rejects unnecessary character-composition rules.

Maevelle should therefore favor:

```text
Long passwords / passphrases

Large maximum length

No arbitrary "must contain one symbol + uppercase + number" rules
```

---

# 38. Recommended Maevelle Policy

For simplicity and strong security:

```text
Minimum internal-user password length:
strong baseline appropriate for single-factor resistance

Maximum:
at least 64 characters supported

Spaces / passphrases:
allowed

Silent truncation:
never
```

Exact minimum will be finalized with the authentication implementation and MFA policy.

---

# 39. Password Blocklist

Known commonly used or compromised passwords should be rejected where feasible.

Do not rely only on:

```text
Password123!
```

meeting a composition checklist.

---

# 40. Password Change

Changing password should require:

```text
Authenticated Session
+
Current Credential / Step-Up Authentication
```

unless using an authorized recovery flow.

---

# 41. Password Change Impact

After significant credential change:

```text
Rotate/revoke relevant sessions
```

according to policy.

A user should be able to:

```text
Sign out all other sessions
```

---

# 42. Password Reset

Forgot-password flow should use:

```text
One-time

Time-limited

Unpredictable reset token
```

sent through verified recovery channel.

---

# 43. No Security Questions

Avoid weak recovery mechanisms such as:

```text
Mother's maiden name

Favorite color

First school
```

for protecting business-administration accounts.

---

# 44. Password Reset Does Not Automatically Grant Full Session

A secure reset flow should return the user through proper authentication/session establishment.

---

# 45. Authentication Rate Limiting

Login attempts must be protected against:

```text
Brute force

Credential stuffing

Password spraying
```

using rate limiting and risk controls.

OWASP recommends login-throttling protections and cautions that lockout design should avoid allowing attackers to trivially deny service to another user's account.

---

# 46. Rate-Limit Inputs

Protection can consider:

```text
Account / login identifier

IP address

Device/session context

Attempt velocity
```

rather than relying only on one IP address.

---

# 47. CAPTCHA

CAPTCHA may be used as an adaptive defense against suspicious automated activity.

It should not be the primary authentication security mechanism.

---

# 48. Login Security Events

Record security-relevant events:

```text
Login succeeded

Login failed

Excessive failures

Password reset requested

Password changed

Suspicious authentication detected
```

---

# 49. MFA

Multi-factor authentication should be part of the production security design.

OWASP currently recommends MFA broadly and specifically recommends requiring it for administrative/high-privilege users.

---

# 50. V1 MFA Direction

Recommended V1 authenticator:

```text
TOTP Authenticator Application
```

with:

```text
Recovery Codes
```

Future:

```text
WebAuthn / Passkeys
```

---

# 51. Mandatory MFA

At minimum V1 production should require MFA for:

```text
Organization Owner

Users managing access control

Users managing security configuration

Users executing sensitive refunds

Users managing payment accounts

Other designated high-privilege users
```

Organization setting should allow:

```text
Require MFA for all internal users
```

and this is strongly preferred.

---

# 52. MFA Enrollment

Flow:

```text
User Authenticated
      ↓
Generate enrollment secret
      ↓
User enrolls authenticator
      ↓
Verify first valid code
      ↓
MFA becomes active
      ↓
Generate recovery codes
```

Do not mark MFA enabled before successful verification.

---

# 53. MFA Secret Protection

TOTP secrets are authentication secrets.

They must be protected appropriately at rest and never exposed through ordinary APIs after enrollment.

---

# 54. Recovery Codes

Recovery codes should be:

```text
Random

Single-use

Displayed securely once

Stored as protected hashes where feasible
```

---

# 55. MFA Reset

MFA reset is itself a high-risk security operation.

Do not allow:

```text
User forgot MFA
→ administrator clicks reset casually
```

without appropriate identity verification, permission, and audit.

---

# 56. MFA Downgrade Attack

Changing:

```text
MFA required
→ MFA disabled
```

must require elevated security controls.

Potential:

```text
Step-up authentication

High-level permission

Security notification

Audit
```

---

# 57. Passkeys Future

Passkeys/WebAuthn should be considered later, particularly for high-privilege users because modern cryptographic authenticators can provide phishing-resistant authentication. NIST's current authentication guidance explicitly addresses phishing-resistant authenticators.

---

# 58. Session

A **Session** represents an authenticated browser/application session.

Conceptually:

```text
Session ID

Identity

Membership

Created At

Last Activity

Absolute Expiry

Authentication Strength

MFA State

Device Metadata

IP Metadata

Revocation State
```

---

# 59. V1 Session Direction

For the internal admin portal, prefer:

```text
Opaque

Random

Server-controlled session
```

rather than making a long-lived self-contained client token the only authority.

---

# 60. Why Server-Controlled Session?

It gives Maevelle strong control over:

```text
Immediate revocation

Disabled users

Credential reset

Session listing

Permission-change enforcement

Security response
```

---

# 61. Session Token Storage

Browser should hold only an opaque session credential.

Server retains authoritative session state.

The raw server-side token should be protected appropriately rather than unnecessarily stored in directly reusable plaintext form.

---

# 62. Session Cookie

Web sessions should use secure cookie properties such as:

```text
Secure

HttpOnly

Appropriate SameSite policy
```

and must never put session identifiers in normal URLs.

OWASP's session guidance covers secure session identifiers, secure cookie transport, and protection against session fixation/hijacking.

---

# 63. Session Regeneration

A new authenticated security context should receive a fresh session identifier.

Examples:

```text
Login

Reauthentication

Privilege elevation
```

OWASP recommends replacing/regenerating session identity across authentication boundaries to defend against session fixation.

---

# 64. Session Expiration

Sessions need:

```text
Absolute lifetime
```

and potentially:

```text
Inactivity timeout
```

based on security policy.

NIST explicitly distinguishes overall and inactivity session timeouts and requires reauthentication when the applicable timeout expires.

---

# 65. Do Not Hard-Code Session Time in Domain

Exact:

```text
30 minutes

8 hours

7 days
```

should be security configuration, not scattered constants.

---

# 66. Different Security Sensitivity

A user reviewing Product descriptions may tolerate a different reauthentication threshold from a user executing:

```text
Refund

Permission change

Owner transfer
```

Sensitive actions can use step-up authentication.

---

# 67. Session List

Internal user security page should show active sessions:

```text
Browser / Device

Approximate location/IP context

Created

Last active

Current session
```

with:

```text
Revoke
```

action.

---

# 68. Revoke Other Sessions

User should be able to:

```text
Sign out other sessions
```

especially after suspicious activity.

---

# 69. Administrative Session Revocation

Authorized security administrator can revoke:

```text
All sessions belonging to User X
```

when:

```text
Account compromised

User leaves organization

Permissions severely changed
```

---

# 70. Disable Membership

Disabling membership should revoke its sessions immediately.

---

# 71. Password Reset Session Policy

Account recovery/password reset should invalidate or rotate relevant existing sessions according to security policy.

OWASP recommends reauthentication/session handling after high-risk account events.

---

# 72. Permission Changes and Sessions

A session created yesterday must not permanently retain permissions that were removed today.

Therefore authorization must evaluate current grants or an immediately invalidatable permission version.

---

# 73. Avoid Long-Lived Embedded Permissions

Bad:

```text
JWT valid for 30 days

permissions = [
 "refund",
 "manage_users"
]
```

with no immediate revocation strategy.

Permission revocation must become effective promptly.

---

# 74. Permission Version

Potential implementation:

```text
Membership Permission Version = 42

Session remembers version = 41

Mismatch
→ refresh/re-evaluate security state
```

Exact implementation comes later.

---

# 75. Session Cache

Permission/session data may be cached for performance.

But cache is:

```text
optimization
```

not authoritative security truth.

Invalidation must occur when access changes.

---

# 76. Step-Up Authentication

Some actions should require recent stronger authentication even when the user's session is valid.

OWASP recommends reauthentication after high-risk events, and MFA guidance notes that sensitive operations can warrant additional authentication.

---

# 77. Step-Up Candidates

Examples:

```text
Change Organization Owner

Change User Permissions

Reset Another User's MFA

Disable MFA

Change Payment Account

Execute Sensitive Refund

Reveal/regenerate integration credentials

Purge critical records

Change security configuration
```

---

# 78. Recent Authentication Context

Session can track:

```text
Last Password Authentication

Last MFA Authentication

Authentication Strength
```

so high-risk commands can require:

```text
Recent MFA
```

without logging the user out entirely.

---

# 79. Authorization

Authorization evaluates:

```text
PRINCIPAL

ACTION

RESOURCE

SCOPE

CONTEXT
```

and produces:

```text
ALLOW
```

or:

```text
DENY
```

---

# 80. Authorization Example

Request:

```text
User Alice

Action:
inventory.adjust

Resource:
Inventory Item SKU-001

Location:
Main Warehouse

Organization:
Maevelle
```

Authorization evaluates all relevant conditions.

---

# 81. Capability

A **Capability** represents one meaningful business action.

Examples:

```text
orders.view

orders.confirm

inventory.adjust

products.publish

payments.verify_manual

payments.refunds.execute

customers.view_sensitive
```

---

# 82. Capability Naming

Recommended format:

```text
domain.action
```

or:

```text
domain.subdomain.action
```

Examples:

```text
products.view

products.edit

products.publish

inventory.stocktake.create

payments.refunds.execute
```

---

# 83. Capabilities Must Be Semantic

Good:

```text
inventory.adjust
```

Bad:

```text
button_12_access
```

Permissions describe business authority, not frontend implementation.

---

# 84. View and Modify Are Separate

Having:

```text
products.view
```

must not imply:

```text
products.edit
```

Likewise:

```text
payments.view
```

must not imply:

```text
payments.refunds.execute
```

---

# 85. Sensitive Read Is Separate

A user may need:

```text
orders.view
```

without seeing:

```text
Customer full phone

Supplier costs

Payment evidence

Landed costs
```

Therefore sensitive-read permissions need explicit treatment.

---

# 86. Permission Grant

A **Permission Grant** answers:

```text
Principal Membership X
is allowed capability Y
under scope Z.
```

---

# 87. Additive Allow Model

Recommended V1:

```text
No Grant
= Denied

Valid Grant
= Potentially Allowed
```

Avoid introducing complex arbitrary explicit `DENY` rules in V1.

---

# 88. Why Avoid Explicit Deny Initially?

Combining:

```text
Allow from Preset

Allow directly

Deny directly

Deny from group

Scope inheritance
```

can make effective access extremely hard to understand.

A simple additive grant model plus deny-by-default is safer initially.

---

# 89. Resource Conditions Can Still Deny

Even with a capability grant:

```text
orders.cancel
```

business logic may deny:

```text
Order already fully fulfilled.
```

Authorization permission and domain-state validity are separate checks.

---

# 90. Authorization vs Domain Validation

Example:

User has:

```text
inventory.transfer
```

but source stock is insufficient.

Result:

```text
Authorized:
Yes

Business operation:
Rejected
```

Do not report every business-rule failure as:

```text
Permission denied.
```

---

# 91. Permission Presets

Maevelle can provide convenient starting presets such as:

```text
Catalog Operator

Order Operator

Warehouse Operator

Procurement Operator

Finance Operator
```

But these are **configuration conveniences**, not hard-coded runtime roles.

---

# 92. Preset Behavior

Recommended V1:

```text
Select Preset
      ↓
Populate recommended capabilities
      ↓
Administrator reviews
      ↓
Save actual Permission Grants
```

Runtime code still checks capabilities.

---

# 93. Why One-Time Presets?

This avoids:

```text
if role == "warehouse_manager"
```

and avoids surprising organization-wide permission changes merely because a preset definition was edited.

---

# 94. Future Permission Sets

Later, if operations grow, reusable linked:

```text
Permission Sets
```

may become valuable.

But not necessary for V1.

---

# 95. Direct Customization

Admin should be able to start from:

```text
Warehouse Preset
```

then remove:

```text
inventory.adjust
```

while keeping:

```text
inventory.view

inventory.receive
```

---

# 96. Permission Categories

Admin UX should organize capabilities by domain:

```text
Catalog

Sizing

Media

Inventory

Warehouses

Procurement

Shipments

Landed Cost

Orders

Payments

Customers

Analytics

Settings

Access Control
```

---

# 97. Catalog Capabilities

Examples:

```text
products.view

products.create

products.edit

products.publish

products.unpublish

products.archive

products.pricing.edit

products.seo.edit

categories.manage

attributes.manage

colors.manage
```

---

# 98. Sizing Capabilities

Examples:

```text
sizing.view

sizing.guides.create

sizing.guides.edit

sizing.guides.publish

sizing.systems.manage

sizing.measurements.manage

products.sizing.edit
```

---

# 99. Media Capabilities

As established:

```text
media.view

media.upload

media.use

media.view_private

media.download_private

media.replace

media.delete

media.purge
```

---

# 100. Inventory Capabilities

Examples:

```text
inventory.view

inventory.view_movements

inventory.adjust

inventory.receive

inventory.transfer

inventory.stocktake.create

inventory.stocktake.finalize
```

---

# 101. Warehouse Capabilities

Examples:

```text
locations.view

locations.manage

transfers.view

transfers.create

transfers.dispatch

transfers.receive
```

---

# 102. Procurement Capabilities

Examples:

```text
procurement.view

procurement.suppliers.manage

procurement.purchases.create

procurement.purchases.confirm

procurement.purchases.amend

procurement.receipts.create
```

---

# 103. Procurement Cost Visibility

Separate:

```text
procurement.costs.view
```

because users may handle receiving without needing to know supplier purchase prices.

---

# 104. Shipment Capabilities

Examples:

```text
shipments.view

shipments.create

shipments.dispatch

shipments.tracking.edit

shipments.documents.manage

shipments.expenses.manage

shipments.close
```

---

# 105. Landed Cost Capabilities

Examples:

```text
landed_cost.view

landed_cost.edit

landed_cost.allocate

landed_cost.override_basis

landed_cost.finalize

landed_cost.reopen
```

---

# 106. Order Capabilities

Examples:

```text
orders.view

orders.create_manual

orders.confirm

orders.amend_confirmed

orders.hold

orders.cancel

orders.price_override

orders.fulfillment.create
```

---

# 107. Payment Capabilities

Examples:

```text
payments.view

payments.view_sensitive

payments.verify_manual

payments.allocate

payments.reconcile

payments.void

payments.refunds.create

payments.refunds.execute

payments.settlements.manage
```

---

# 108. Customer Capabilities

Examples:

```text
customers.view

customers.view_sensitive

customers.edit

customers.notes.manage

customers.block

customers.merge

customers.export

customers.anonymize
```

---

# 109. Settings Capabilities

Examples:

```text
settings.view

settings.business.edit

settings.payment_methods.manage

settings.localization.manage

settings.security.manage
```

---

# 110. Access-Control Capabilities

High-risk:

```text
access.users.view

access.users.invite

access.users.disable

access.permissions.manage

access.mfa.reset

access.sessions.revoke

access.owner.transfer
```

---

# 111. Permission Scope

Some capabilities require a **Scope**.

Example:

```text
inventory.adjust

Scope:
Main Warehouse
```

rather than:

```text
All Warehouses
```

---

# 112. Scope Principle

> **Scope answers where/over which resources a granted capability applies.**

Capability:

```text
inventory.adjust
```

Scope:

```text
Main Warehouse
```

Together:

```text
Can adjust inventory in Main Warehouse.
```

---

# 113. Scope Is Not Universal

Different domains require different scope meanings.

Avoid one generic:

```text
scope_id
```

whose meaning changes unpredictably everywhere.

---

# 114. V1 Scope Dimensions

Implement only scopes with clear immediate business value.

Highest-value V1 scope:

```text
LOCATION
```

for:

```text
Inventory

Receiving

Transfers

Stocktakes

Fulfillment
```

---

# 115. Organization Scope

All normal grants are inherently bounded to:

```text
Current Organization Membership.
```

So Organization is already the outer authorization boundary.

---

# 116. Location Scope

Examples:

```text
inventory.view
Locations:
Main Warehouse
Showroom
```

User can access Inventory only in those Locations according to capability semantics.

---

# 117. Fulfillment Scope

User may have:

```text
orders.fulfillment.create
Location:
Main Warehouse
```

They cannot fulfill stock from:

```text
Showroom
```

without corresponding scope.

---

# 118. Receiving Scope

Example:

```text
inventory.receive
Location:
Main Warehouse
```

cannot post Receipt into another Location.

---

# 119. Transfer Scope

Transfer permissions may distinguish:

```text
Can Dispatch From

Can Receive Into
```

based on Location scopes.

---

# 120. Order Visibility Scope

Order visibility by warehouse becomes more nuanced because one Order can involve multiple Locations.

Recommended V1:

```text
orders.view
```

remains Organization-wide for users who need Order access.

Location scope restricts operational fulfillment actions.

Future:

```text
Location-scoped Order visibility
```

can be added if real organizational need appears.

---

# 121. Do Not Invent Complex Scope Early

Avoid immediately implementing:

```text
Location
+
Category
+
Supplier
+
Customer segment
+
Time of day
+
IP range
+
Price threshold
```

for every permission.

Use extensible architecture without building an enterprise policy engine unnecessarily.

---

# 122. Future Scope Dimensions

Potential:

```text
Storefront / Channel

Region

Warehouse

Business Unit

API integration
```

only when real requirements justify them.

---

# 123. Resource-Aware Authorization

Authorization may also inspect the target resource.

Example:

```text
User Membership Organization:
Maevelle

Order Organization:
Other Organization
```

Result:

```text
DENY
```

even if:

```text
orders.view
```

exists.

---

# 124. Relationship-Aware Authorization

Examples:

```text
Can receive this Transfer?
```

depends on:

```text
Destination Location
```

or:

```text
Can edit this Stocktake?
```

may depend on its Location.

This is a practical use of relationship-aware authorization without implementing a generic ReBAC language.

---

# 125. Access Decision Model

Conceptually:

```text
authorize(
  principal,
  capability,
  resource,
  context
)
```

evaluates:

```text
Identity active?

Membership active?

Correct Organization?

Capability granted?

Scope allows resource?

Sensitive-data requirement satisfied?

Security step-up required?

Resource/domain restrictions?
```

---

# 126. Authorization Result

Internally useful result:

```text
ALLOW
```

or:

```text
DENY
Reason:
MISSING_PERMISSION
```

Potential reasons:

```text
ACCOUNT_DISABLED

NO_MEMBERSHIP

WRONG_ORGANIZATION

MISSING_CAPABILITY

OUT_OF_SCOPE

MFA_REQUIRED

SESSION_REAUTH_REQUIRED
```

---

# 127. Do Not Leak Authorization Internals Publicly

Internal logs may know:

```text
Missing payments.refunds.execute
```

but user-facing API may use an appropriate:

```text
Forbidden
```

response.

---

# 128. Authorization at Domain Command Boundary

Sensitive command:

```text
finalizeLandedCost()
```

must authorize itself through application/domain security layer.

Do not rely exclusively on:

```text
Page route middleware
```

because future:

```text
API

Background job

Mobile admin client
```

may call the same command.

---

# 129. Defense in Depth

Authorization may exist at:

```text
Route/API boundary

Application command boundary

Resource query boundary
```

where appropriate.

The most important principle is that every access path reaches authoritative checks.

---

# 130. Query Authorization

Read operations are as important as writes.

Example:

```text
GET /payments
```

must apply:

```text
payments.view
```

and sensitive-data filtering.

---

# 131. Object-Level Authorization

Guessing:

```text
/orders/another-order-id
```

must not bypass access controls.

OWASP explicitly calls out authorization of lookup/object identifiers as part of robust access control.

---

# 132. Pagination Cannot Leak

A user scoped to certain resources must not receive unauthorized records merely because:

```text
search

pagination

export
```

queries forgot to apply scope.

---

# 133. Counts Cannot Leak

Even:

```text
There are 48 Finance records
```

can be sensitive.

Aggregations must respect authorization.

---

# 134. Search Authorization

Search indexing/querying must apply the same access rules as primary data.

Never use:

```text
search engine results
```

as an authorization bypass.

---

# 135. Export Authorization

Export often exposes more information than the normal list UI.

Therefore:

```text
customers.export

payments.export
```

may deserve distinct permissions.

---

# 136. Sensitive Data

Some records can be visible while fields remain restricted.

Examples:

```text
Customer Name:
visible

Full phone:
restricted

Purchase:
visible

Supplier unit cost:
restricted
```

---

# 137. Field-Level Sensitivity

High-value categories include:

```text
Customer PII

Payment evidence

Refund destinations

Supplier costs

Landed costs

Margins

Private media

Integration credentials
```

---

# 138. Sensitive Data Is Not Frontend Masking Only

Bad:

```text
API sends full phone
Frontend renders 017****1234
```

Unauthorized user can still inspect network response.

Instead server returns appropriate masked/omitted representation.

---

# 139. Customer Sensitive Data

Potential:

```text
customers.view
```

may expose:

```text
Name

Order count
```

while:

```text
customers.view_sensitive
```

exposes:

```text
Full phone

Full email

Full addresses
```

depending on task.

---

# 140. Payment Sensitive Data

Separate access for:

```text
Full transaction references

Payment evidence

Refund destination

Provider account details
```

---

# 141. Cost Sensitive Data

Potential separation:

```text
procurement.costs.view

landed_cost.view

analytics.margin.view
```

A Product operator may edit Product descriptions without knowing gross margins.

---

# 142. Private Media

As Media Architecture established:

```text
Media Permission
+
Target Domain Permission
```

may both be required.

---

# 143. Example

User has:

```text
media.view_private
```

but not:

```text
payments.view_sensitive
```

Result:

```text
Cannot access Payment Evidence Asset.
```

---

# 144. Row + Field Access

A strong authorization system can therefore determine:

```text
Can user see record?
```

and:

```text
Which sensitive fields can user receive?
```

---

# 145. Permission UX

Permission-management screen should avoid presenting hundreds of undifferentiated checkboxes.

Recommended:

```text
Domain accordion

Common preset

Basic / Sensitive / Administrative grouping

Search permissions

Scope configuration
```

---

# 146. Example Permission UI

```text
Inventory

☑ View inventory
☑ View movement history
☑ Receive stock
☐ Adjust stock
☐ Finalize stocktake

Locations:
☑ Main Warehouse
☐ Showroom
```

---

# 147. Explain Sensitive Permissions

For:

```text
Execute Refund
```

show warning:

```text
Allows the user to return customer funds.
```

For:

```text
Manage Permissions
```

show:

```text
Allows changing other users' access.
```

---

# 148. Permission Dependencies

Some capabilities logically depend on basic read access.

Example:

```text
products.edit
```

without:

```text
products.view
```

is not useful.

The admin UI can automatically recommend/include required lower-level permissions.

---

# 149. Avoid Hidden Permission Implications

Do not secretly make:

```text
products.edit
```

grant:

```text
payments.view
```

Permissions should remain predictable.

---

# 150. Parent Permission Implication

Within one domain, limited explicit implications may be acceptable.

Example:

```text
products.edit
```

may logically include ability to read the Product being edited.

But this relationship must be centrally defined and testable.

---

# 151. No Permission String Checks Everywhere

Avoid:

```text
user.permissions.includes("orders.edit")
```

repeated throughout arbitrary components/services.

Use centralized authorization service/helpers.

---

# 152. Central Permission Catalog

Capabilities should be registered centrally with:

```text
Key

Description

Domain

Sensitivity

Supported Scopes

Optional dependency metadata
```

---

# 153. Unknown Permission

If code checks an unregistered capability:

```text
DENY / development error
```

rather than accidentally allow.

---

# 154. Renaming Permission Keys

Capability keys become internal contracts.

Do not rename casually.

Migration/alias strategy is needed if names change later.

---

# 155. Permission Preset Evolution

Because V1 presets simply assist grant creation, changing future preset defaults does not silently modify existing users.

This improves change safety.

---

# 156. Effective Permission Preview

Before saving user permissions, admin should be able to see:

```text
Effective Access
```

including scopes.

---

# 157. High-Risk Permission Warning

Granting:

```text
access.permissions.manage
```

or:

```text
payments.refunds.execute
```

should trigger stronger confirmation.

Potentially require step-up MFA.

---

# 158. Self-Permission Escalation

Critical rule:

> A user must not be able to grant themselves access they are not authorized to grant.

---

# 159. Permission Management Authority

Having:

```text
access.permissions.manage
```

does not necessarily mean:

```text
Can grant every possible capability.
```

V1 can initially allow only Owner/full access administrator to manage the complete permission universe.

Later delegated grant boundaries may be added.

---

# 160. Safer V1

Recommended:

```text
Organization Owner
→ full permission administration

Designated Access Administrator
→ can manage ordinary access,
   but cannot alter Ownership
```

Exact delegated limits will be centrally defined.

---

# 161. Cannot Create Stronger Administrator Accidentally

Access Administrator should not be able to grant:

```text
access.owner.transfer
```

unless explicitly authorized.

---

# 162. Self-Disable

System should prevent dangerous actions such as:

```text
Sole Owner disables own Membership
```

without valid ownership transfer/recovery condition.

---

# 163. Last Administrator Protection

If only one Principal can manage access:

```text
do not allow accidental removal
```

that makes Organization permanently inaccessible.

---

# 164. Organization Owner

**Owner** is a protected Organization relationship, not a normal application role.

It represents ultimate organizational control.

---

# 165. Owner Authority

Owner normally has access to all Organization capabilities.

But security-sensitive operations still may require:

```text
MFA

Step-Up Authentication

Audit
```

---

# 166. Why Owner Is Special

If Owner were simply:

```text
preset = Full Access
```

another administrator might accidentally remove Owner recovery/control.

Ownership requires structural protections.

---

# 167. Ownership Invariant

Every active Organization requires:

```text
at least one valid Owner/control principal
```

according to the final ownership model.

---

# 168. V1 Primary Owner

V1 can begin with:

```text
One Primary Owner
```

with a deliberate transfer workflow.

Future:

```text
Multiple Owners
```

can be evaluated if needed.

---

# 169. Owner Transfer

Flow should require:

```text
Current Owner

Target active identity

Strong reauthentication

Target confirmation where appropriate

Audit

Atomic transfer
```

---

# 170. Owner Transfer Cannot Be Casual

Changing a dropdown:

```text
Owner = Bob
```

is insufficient.

This is a security-critical operation.

---

# 171. Owner MFA

Owner must have strong MFA before production use.

---

# 172. Owner Account Recovery

Owner recovery requires especially careful documented procedures.

Avoid insecure shortcut:

```text
I know the business name,
reset my MFA.
```

---

# 173. Emergency Recovery

Potential controlled process:

```text
Verified recovery mechanisms

Recovery codes

Secondary trusted recovery channel

Documented emergency administrative procedure
```

Final exact process depends on deployed authentication provider.

---

# 174. Security Settings

High-risk settings include:

```text
MFA policy

Session policy

Allowed authentication methods

Access administrator configuration

Integration credentials
```

Require:

```text
settings.security.manage
```

and step-up authentication.

---

# 175. Permission Change Audit

Every meaningful access change should record:

```text
Target User

Changed By

Previous Grants

New Grants

Scopes Changed

Timestamp

Reason where required
```

---

# 176. Account Disable Audit

Record:

```text
Who disabled?

Why?

When?

Which sessions revoked?
```

---

# 177. Authentication Audit Events

Examples:

```text
user.invited

invite.accepted

auth.login_succeeded

auth.login_failed

auth.password_changed

auth.password_reset

auth.mfa_enrolled

auth.mfa_reset

auth.session_revoked

user.disabled
```

---

# 178. Authorization Audit Events

Examples:

```text
permissions.changed

permission_scope.changed

owner.transfer_started

owner.transferred

security_policy.changed
```

---

# 179. Authorization Denials

Security-sensitive denied actions should be logged appropriately.

Examples:

```text
Unauthorized refund attempt

Cross-Organization resource attempt

Permission-management attempt

Private payment evidence access denied
```

Do not necessarily persist every harmless missing read permission forever.

---

# 180. Audit vs Security Log

Audit:

```text
Business/security administrative changes
```

Security monitoring:

```text
Authentication failures

Suspicious attempts

Abuse signals
```

These can share infrastructure while serving different purposes.

---

# 181. Audit Immutability

Ordinary users must not be able to:

```text
Edit audit record

Delete embarrassing permission change
```

Audit should be append-oriented and protected.

---

# 182. Actor Snapshot

Audit references stable user Identity.

If user's display name changes:

```text
historical actor still resolvable.
```

Optional display snapshots improve readability.

---

# 183. System Actor

Automated operations need explicit actor identity:

```text
SYSTEM
```

not:

```text
null user
```

where meaningful.

---

# 184. Background Jobs

Background jobs should not casually run with:

```text
bypassAuthorization = true
```

Instead distinguish:

```text
System-authorized operation
```

with explicit internal authority and audit context.

---

# 185. Example

Reservation-expiration job:

```text
Actor:
SYSTEM

Reason:
Reservation Expiry Policy

Operation:
Release reservation
```

---

# 186. User-Initiated Async Job

If User requests:

```text
Bulk Export Customers
```

background job should retain:

```text
Requesting Principal

Authorization Context
```

and revalidate sensitive access when appropriate.

---

# 187. Service Account

Future integrations may need non-human identities.

Examples:

```text
Courier Integration

ERP Integration

Automation
```

Use:

```text
Service Account
```

not an employee's personal login.

---

# 188. Why Service Accounts?

Bad:

```text
Pathao integration uses
owner@example.com's token
```

because:

```text
Owner password changes

Owner leaves

Token has enormous permissions
```

Service identities isolate access.

---

# 189. Service Account Capabilities

Example:

```text
orders.view

deliveries.create

deliveries.update_tracking
```

not:

```text
payments.refunds.execute
```

unless actually required.

---

# 190. Service Account Scope

Integrations should follow least privilege just like humans.

Potential:

```text
One Organization

Specific capabilities

Specific channel/provider scope
```

---

# 191. API Tokens — Future

A Service Account may authenticate using:

```text
API Token

OAuth client credential

Signed request
```

depending on integration.

---

# 192. API Tokens Are Secrets

Store only appropriately protected token material.

Display full secret:

```text
once on creation
```

where token design requires.

---

# 193. Token Prefix

Useful:

```text
mv_live_abcd...
```

with a non-secret identifier/prefix for management.

Database can store:

```text
hash

prefix

created date

last used
```

rather than reusable plaintext secret.

---

# 194. Token Expiration

Support:

```text
Expiration

Revocation
```

and optionally:

```text
rotation.
```

---

# 195. Token Last Used

Useful security metadata:

```text
Last used

Approximate source

Integration
```

---

# 196. Never Share Human Session Tokens

External integration must not reuse browser session cookies.

---

# 197. Webhooks Are Different

Inbound webhook authentication represents:

```text
External Provider
```

not a normal internal User.

Each integration validates:

```text
Signature

Provider identity

Event ID
```

according to provider protocol.

---

# 198. Webhook Authorization

After validating provider authenticity, the integration can perform only the operations permitted to that integration context.

---

# 199. Integration Compromise

If one courier credential leaks:

```text
revoke that integration
```

without resetting every employee account.

---

# 200. CSRF Protection

Because the internal web application will likely use browser cookies for authentication, state-changing browser requests require CSRF protection appropriate to the chosen architecture.

Examples may include:

```text
SameSite protections

Origin validation

CSRF token patterns
```

depending on the framework.

---

# 201. XSS and Session Protection

`HttpOnly` cookies reduce direct JavaScript access to session tokens but do not eliminate the impact of cross-site scripting.

Strong frontend/content security remains necessary.

---

# 202. Clickjacking

Admin interfaces should use appropriate browser protections against being invisibly embedded into hostile pages.

Implementation details belong to Security Architecture later.

---

# 203. CORS

Admin/API CORS configuration should be explicit.

Do not deploy:

```text
Access-Control-Allow-Origin: *
```

alongside sensitive credentialed administrative endpoints.

---

# 204. Authentication Security Boundary

Internal admin authentication endpoints should not share careless policies with:

```text
Public Storefront

Customer Account login

Webhook endpoints
```

Each principal type has different risks.

---

# 205. User Impersonation

A future support feature might want:

```text
View as Customer
```

This is dangerous.

Do not implement by giving staff the customer's password/session.

If added later, use explicit audited impersonation/delegation architecture.

---

# 206. Internal User Impersonation

Avoid:

```text
Owner → Login as Finance User
```

in V1.

If ever needed for support, require extremely strong audit/step-up controls.

---

# 207. Sensitive Action Confirmation

Some actions should display meaningful confirmation.

Example:

```text
Refund ৳50,000 to customer?
```

not generic:

```text
Are you sure?
```

---

# 208. Confirmation Is Not Authorization

Confirmation prevents accidental clicks.

Authorization determines authority.

Step-up authentication protects identity assurance.

These are separate controls.

---

# 209. Large Financial Actions

Future policy may introduce:

```text
Refund > threshold
→ additional approval
```

or:

```text
Inventory adjustment > threshold
→ manager approval
```

Our granular capability model prepares for it.

---

# 210. Separation of Duties

Future operations may enforce:

```text
Person who created refund
cannot approve same refund.
```

V1 does not need full approval workflows.

But capabilities should not make this future model impossible.

---

# 211. No Generic Policy Programming

Do not build a V1 interface where business users write:

```text
IF user.age > 20
AND time < ...
THEN ...
```

arbitrary authorization formulas.

This creates unnecessary security complexity.

---

# 212. Controlled Policy Model

Use:

```text
Registered capabilities

Known scope types

Known security policies

Explicit high-risk rules
```

which remain inspectable and testable.

---

# 213. Access-Control Testing

Every capability should have authorization tests.

Examples:

```text
No permission → DENY

Permission → ALLOW

Permission wrong Location → DENY

Disabled account → DENY

Wrong Organization → DENY

Owner → ALLOW where appropriate

Sensitive read without sensitive permission → REDACT/DENY
```

---

# 214. Horizontal Access-Control Testing

Test User A attempting:

```text
User B's resources

Another Location

Another Organization
```

even when IDs are manually changed.

---

# 215. Permission Regression Tests

If new endpoint:

```text
/orders/export
```

is added, security tests should verify it cannot bypass:

```text
orders.view/export permissions.
```

---

# 216. ASVS Testing

Implementation security review should use relevant OWASP ASVS requirements as one verification baseline.

---

# 217. Authorization Matrix Testing

Generate test cases from central Permission Catalog where feasible.

This prevents endpoints from quietly appearing without coverage.

---

# 218. Permission Coverage Check

Useful development tooling:

```text
Every protected command declares required capability.
```

A missing declaration can fail automated tests/build checks where practical.

---

# 219. Secure Defaults

New capability:

```text
defaults to no user having it
```

except Owner/system policy.

Never:

```text
new permission automatically granted to everyone.
```

---

# 220. New User Defaults

New invited user should receive:

```text
No permissions
```

unless administrator intentionally selects grants/preset.

---

# 221. Empty Membership

An active account with zero permissions may log in but see:

```text
No accessible modules
```

or access-denied experience.

This is safer than broad defaults.

---

# 222. Dashboard Filtering

Sidebar/menu should derive from capabilities.

Example:

No:

```text
procurement.view
```

then Procurement module can be hidden.

But server remains authoritative.

---

# 223. Module Visibility

User with:

```text
payments.verify_manual
```

may require enough Payment UI visibility to execute that operation.

Permission catalog/UI dependencies should make this understandable.

---

# 224. Dashboard Widgets

Authorization applies to dashboard metrics too.

Example:

User cannot see landed cost.

Then dashboard must not show:

```text
Gross margin
```

derived from landed cost.

---

# 225. Notifications

Notifications should respect permissions.

Do not send:

```text
Supplier cost alert
```

to user who cannot view supplier costs.

---

# 226. Notification Links

Even if unauthorized notification somehow exists, opening the link must still perform normal authorization.

---

# 227. Search

Global admin search must filter:

```text
Products

Orders

Customers

Payments
```

based on permissions.

---

# 228. Command Palette

Same principle.

Do not reveal:

```text
Refund Customer
```

command to unauthorized users.

---

# 229. Activity Feed

Audit/activity feeds can themselves contain sensitive information.

Authorization must apply.

---

# 230. Error Messages

Unauthorized resource should not always distinguish:

```text
Exists but forbidden
```

from:

```text
Does not exist
```

when that distinction would leak sensitive resource existence.

Policy can vary by internal context.

---

# 231. Session Device Metadata

Potential:

```text
User Agent

IP

Approximate country/region

First Seen

Last Seen
```

for security diagnostics.

Do not treat device fingerprints as perfect person identity.

---

# 232. New Device Alert — Future / Preferred

Potential notification:

```text
New sign-in detected.
```

especially for Owner/high-risk users.

---

# 233. Suspicious Session Response

User/security admin can:

```text
Revoke Session

Revoke All Sessions

Change Password

Reset MFA
```

according to secure recovery rules.

---

# 234. Authentication Strength

Session can conceptually record:

```text
PASSWORD_ONLY

MFA_VERIFIED

PHISHING_RESISTANT
```

future.

High-risk commands can require minimum strength.

---

# 235. Step-Up State Expires

MFA performed three months ago should not automatically count as:

```text
recent strong authentication
```

for today's Owner transfer.

Recent-authentication window should be configurable.

---

# 236. Access Review

Admin should have a page showing:

```text
Users

Status

Last Login

MFA

Permissions

Scopes

High-Risk Access
```

---

# 237. High-Risk User Filter

Useful:

```text
Can Execute Refunds

Can Manage Access

Can View Sensitive Customer Data

Can Reopen Landed Cost

Can Purge Media
```

---

# 238. Access Review Export — Future

Periodic security review may export permission matrix.

Not necessary initially but architecture supports it.

---

# 239. User Detail Page

Recommended:

```text
Profile

Membership

Permissions

Scopes

Security

Sessions

Activity

Audit
```

---

# 240. Invite User UX

Flow:

```text
Email

Display Name optional

Choose preset

Review capabilities

Configure Location scopes

Send invitation
```

---

# 241. Edit Access UX

Show:

```text
Current permissions

Changed permissions

Risk warnings
```

before save.

---

# 242. Permission Change Confirmation

For sensitive changes:

```text
You are granting this user permission to execute refunds.
```

with step-up authentication where configured.

---

# 243. Disable User UX

Impact preview:

```text
This will:

Block new logins

Revoke 3 active sessions

Preserve historical activity
```

---

# 244. Owner Transfer UX

Must clearly state:

```text
You are transferring primary control of the Organization.
```

with explicit destination identity and strong reauthentication.

---

# 245. Security Dashboard — Preferred

Potential:

```text
Active Users

Pending Invites

Users Without MFA

High-Risk Access

Recent Login Failures

Recently Revoked Sessions

Recent Permission Changes
```

---

# 246. Access APIs

Conceptual application commands:

```text
inviteUser()

acceptInvitation()

disableMembership()

enableMembership()

updatePermissions()

updatePermissionScopes()

revokeSession()

revokeAllSessions()

enrollMfa()

resetMfa()

transferOwnership()
```

---

# 247. Authentication APIs

Conceptual:

```text
login()

logout()

requestPasswordReset()

resetPassword()

reauthenticate()

verifyMfa()

listSessions()
```

Exact endpoints depend on chosen auth implementation.

---

# 248. Authorization API

Internal application service:

```text
authorize({
  principal,
  capability,
  resource,
  context
})
```

or equivalent.

---

# 249. Query Helpers

Examples:

```text
requireCapability()

requireScopedCapability()

filterAuthorizedResources()

sanitizeSensitiveFields()
```

centralized rather than reinvented.

---

# 250. Avoid Client-Supplied Permission State

Never trust:

```text
{
  "isAdmin": true
}
```

sent by browser.

Server derives identity/access from authenticated session and authoritative grants.

---

# 251. Avoid Editable Security Claims

The frontend may cache UI permission hints for UX.

But client claims cannot authorize server operations.

---

# 252. Structured Errors

Examples:

```text
AUTHENTICATION_REQUIRED

INVALID_CREDENTIALS

MFA_REQUIRED

MFA_INVALID

SESSION_EXPIRED

SESSION_REVOKED

ACCOUNT_DISABLED

MEMBERSHIP_INACTIVE

AUTHORIZATION_DENIED

PERMISSION_REQUIRED

RESOURCE_OUT_OF_SCOPE

ORGANIZATION_MISMATCH

STEP_UP_REQUIRED

INVITE_EXPIRED

OWNER_TRANSFER_REQUIRED

LAST_OWNER_PROTECTION

PERMISSION_VERSION_CONFLICT
```

---

# 253. Authentication vs Authorization Error

Keep distinct internally:

```text
401-style:
Not authenticated

403-style:
Authenticated but not authorized
```

while avoiding unnecessary sensitive leakage.

---

# 254. Concurrency — Permission Changes

Two administrators edit same user's permissions.

Use optimistic concurrency/versioning.

Do not silently overwrite one another.

---

# 255. Concurrency — Owner Transfer

Only one ownership transfer can be applied.

Atomic protection required.

---

# 256. Concurrency — MFA Reset

Two simultaneous resets must not produce inconsistent authenticator state.

---

# 257. Idempotency — Invitation

Retrying invite request should not create uncontrolled duplicate active invites.

---

# 258. Idempotency — Session Revoke

Revoking same Session twice should remain safely revoked.

---

# 259. Idempotency — Ownership Transfer

Retry after network timeout should not transfer control repeatedly/inconsistently.

---

# 260. Authentication System Failure

If authentication backend is unavailable:

```text
fail closed
```

for protected operations.

Do not temporarily make the admin portal public.

---

# 261. Authorization System Failure

If permission lookup fails unexpectedly:

```text
DENY
```

rather than assuming broad access.

---

# 262. Database Unavailable

Authenticated session alone should not grant sensitive operations when current authorization cannot be verified.

---

# 263. Cache Failure

Permission cache failure should fall back to authoritative data or deny safely.

Never:

```text
Cache missing
→ Allow
```

---

# 264. Audit Failure

Sensitive state-changing operation should not casually succeed if required audit persistence fails.

Where audit and business mutation share the database, commit them consistently.

---

# 265. Security Notification Failure

Email notification failure should usually not roll back a successful password change.

But failure should be observable/retryable.

Distinguish:

```text
security control
```

from:

```text
notification side effect.
```

---

# 266. Session Store Failure

If server cannot verify Session:

```text
request is unauthenticated.
```

---

# 267. Clock Handling

Security expirations should use consistent server-side UTC timestamps.

Examples:

```text
Invite expiry

Session expiry

Reset token expiry

MFA recovery timing
```

Display converts through centralized timezone settings.

---

# 268. Authentication Tokens

Do not compare expiration using client-reported time.

Server time is authoritative.

---

# 269. Secure Randomness

Session IDs, invitation tokens, reset tokens, recovery codes, and API secrets must use cryptographically secure random generation.

Do not use:

```text
Math.random()
```

style general-purpose randomness for credentials.

---

# 270. Secret Logging

Never log:

```text
Password

Session token

MFA secret

Reset token

Full API token

Webhook secret
```

---

# 271. Authorization Logging

Logs may include:

```text
User ID

Capability

Resource ID

Decision

Reason
```

without secret values.

---

# 272. Personal Data in Logs

Avoid unnecessarily copying:

```text
Full Customer address

Full payment evidence

Phone
```

into security/application logs.

---

# 273. Production Support Access

Developers/operators should not automatically use application Owner credentials for infrastructure access.

Application IAM and server/DevOps access are separate security boundaries.

---

# 274. Database Credentials

Database/service credentials must never be usable as frontend/admin-login credentials.

OWASP similarly warns against exposing sensitive backend/service accounts through frontend authentication paths.

---

# 275. Environment Secrets

Infrastructure secrets belong in secure deployment secret configuration.

Not:

```text
Git repository

Frontend environment variables

Database rows exposed to admin UI
```

unless specifically designed/encrypted.

---

# 276. Break-Glass Access — Future

For larger organization operations, future:

```text
Emergency / Break-Glass Administrator
```

may exist with:

```text
strong MFA

rare use

alerting

mandatory reason

audit
```

Not necessary for V1.

---

# 277. Permission Analytics

Do not treat authorization itself as business analytics.

But security reporting can show:

```text
High-risk permissions by user

Inactive privileged accounts

Users without MFA

Permission changes
```

---

# 278. Last Login

Store:

```text
Last Successful Login
```

for operational security visibility.

Potential:

```text
Last Failed Login
```

security system can track separately.

---

# 279. Dormant Accounts

Future policy may flag:

```text
No login for X period
```

for review.

Do not automatically delete accounts.

---

# 280. Account Offboarding

Operational flow:

```text
Disable Membership

Revoke Sessions

Revoke API credentials owned by user if any

Transfer pending work if needed

Preserve audit history
```

---

# 281. Permission Inheritance From Ownership

Owner receives complete Organization authority structurally.

Normal users receive explicit capabilities.

Do not grant everyone:

```text
everything except some denied items.
```

---

# 282. Permission Default

New permission introduced:

```text
payments.settlements.export
```

should initially be:

```text
Owner only / explicitly ungranted
```

until administrators grant it.

---

# 283. Capability Deprecation

If capability is removed:

```text
migrate existing grants

audit change

remove from catalog
```

rather than leave orphan strings indefinitely.

---

# 284. Permission Documentation

Every capability needs human-friendly documentation:

```text
What does it allow?

What does it expose?

Supported scopes?

Is it sensitive?

What permissions usually accompany it?
```

---

# 285. Developer Rule

No new privileged operation should be considered complete until:

```text
Capability identified

Authorization check implemented

Tests written

Audit behavior considered
```

---

# 286. Security Review Rule

New domain implementation must document:

```text
Read permissions

Write permissions

Sensitive fields

Scope behavior

High-risk actions
```

---

# 287. Architecture Against Privilege Escalation

The system must explicitly defend against:

```text
Editing own permission payload

Manipulating hidden form fields

Changing resource IDs

Calling API directly

Creating stronger user than allowed

Changing organization ID

Reusing expired session

Using disabled-user session

Bypassing UI
```

---

# 288. Mass Assignment Protection

User-editable profile endpoint must not accept:

```text
{
  "name": "...",
  "permissions": ["*"]
}
```

because permission data happened to be part of the same model.

Security fields require dedicated commands.

---

# 289. DTO Separation

Use separate input models for:

```text
Edit User Profile
```

and:

```text
Change User Access
```

rather than generic object update.

---

# 290. Owner Flag Protection

Never allow generic:

```text
PATCH /user
{
  "isOwner": true
}
```

Ownership changes only through dedicated secure workflow.

---

# 291. Organization Relationship Protection

User cannot move themselves into another Organization through ordinary profile update.

---

# 292. Location Scope Protection

Location IDs in permission changes must be validated:

```text
belong to same Organization

exist

appropriate scope type
```

---

# 293. Permission Assignment Atomicity

Updating user access should atomically apply intended grant set.

Avoid temporary state such as:

```text
old permissions removed
new permissions partially added
request crashes
```

leaving broken access.

---

# 294. Access Change Preview

Recommended before commit:

```text
Added:
inventory.adjust — Main Warehouse

Removed:
payments.refunds.execute

Sensitive Change:
Yes
```

---

# 295. Permission Change Notification

Preferred:

Notify affected user when significant access changes, particularly:

```text
Administrator access added

MFA reset

Account disabled

High-risk permission granted
```

Notification delivery itself is separate.

---

# 296. Security Policy Version

Future configuration may track:

```text
MFA Policy

Session Policy

Password Policy
```

with change audit.

No need for complicated policy version engine V1.

---

# 297. Organization Security Settings

Potential:

```text
Require MFA for everyone

Session timeout

Allow password authentication

Future passkey requirement

Security alert recipients
```

---

# 298. Safe Defaults

Initial production configuration should favor:

```text
MFA for privileged accounts

Secure cookie sessions

Strong password rules

Limited session duration

Deny-by-default permissions

No public internal signup
```

---

# 299. Important Invariants

### IAM-INV-001

Every protected request requires a valid authenticated Principal unless explicitly public.

### IAM-INV-002

Authentication does not imply authorization.

### IAM-INV-003

Authorization is deny-by-default.

### IAM-INV-004

Server-side authorization is mandatory for protected operations.

### IAM-INV-005

Frontend visibility does not determine authority.

### IAM-INV-006

Internal User and Customer Account are separate identity types.

### IAM-INV-007

Internal User identity is stable independently of email/password.

### IAM-INV-008

Organization Membership determines participation in an Organization.

### IAM-INV-009

A Membership can only access resources belonging to its authorized Organization.

### IAM-INV-010

Disabled Membership cannot continue using old Sessions.

### IAM-INV-011

Historical actor identity remains after account disablement.

### IAM-INV-012

Passwords are never stored as plaintext.

### IAM-INV-013

Authentication secrets are never logged or exposed through ordinary APIs.

### IAM-INV-014

Sessions are revocable.

### IAM-INV-015

Permission removal must become effective for active sessions promptly.

### IAM-INV-016

Capabilities represent business actions rather than role names/UI elements.

### IAM-INV-017

Missing capability means denied access.

### IAM-INV-018

Permission scope must be validated against the target resource where scope applies.

### IAM-INV-019

Location-scoped capabilities cannot operate outside authorized Locations.

### IAM-INV-020

Sensitive field access requires explicit permission where defined.

### IAM-INV-021

Private Media access also respects the owning business domain's authorization.

### IAM-INV-022

Permission presets do not become hard-coded runtime roles.

### IAM-INV-023

Permission changes are auditable and concurrency-safe.

### IAM-INV-024

Users cannot grant themselves unauthorized capabilities.

### IAM-INV-025

Organization Ownership cannot be changed through generic profile editing.

### IAM-INV-026

Owner transfer requires dedicated secure workflow.

### IAM-INV-027

High-risk security actions may require step-up authentication.

### IAM-INV-028

Critical invitation/reset/session secrets are random, time-bound where appropriate, and protected.

### IAM-INV-029

Background/system operations have explicit actor/security context.

### IAM-INV-030

External integrations do not use employee browser sessions as their identity.

### IAM-INV-031

Service identities follow least privilege.

### IAM-INV-032

Unknown/unregistered permissions never imply allow.

### IAM-INV-033

Search/export/analytics must respect the same authorization boundaries as ordinary reads.

### IAM-INV-034

Cross-Organization resource access is always rejected unless explicitly supported by a future platform-level capability.

### IAM-INV-035

Authorization-system failure fails closed for protected operations.

---

# 300. V1 Mandatory Scope

Maevelle V1 Identity & Access should include:

```text
✓ Internal User Identity

✓ Organization Membership

✓ Invite-only Internal Users

✓ Invitation Expiration

✓ ACTIVE / DISABLED membership

✓ Email Login

✓ Strong Password Authentication

✓ Secure Password Hashing

✓ Password Change

✓ Password Reset

✓ Login Rate Limiting

✓ TOTP MFA

✓ Recovery Codes

✓ MFA requirement for high-privilege users

✓ Organization-wide MFA enforcement option

✓ Session Management

✓ Secure HttpOnly Cookie Sessions

✓ Session Expiration

✓ Session Revocation

✓ Sign Out Other Sessions

✓ Disable User → Revoke Sessions

✓ Step-Up Authentication foundation

✓ Capability Catalog

✓ Granular Permission Grants

✓ Deny by Default

✓ Server-Side Authorization

✓ Domain-Level Authorization

✓ Permission Presets as UX convenience

✓ Custom Permission Selection

✓ Location-Scoped Permissions

✓ Sensitive Data Permissions

✓ Customer PII protection

✓ Procurement Cost visibility control

✓ Landed Cost visibility control

✓ Payment sensitive-data control

✓ Refund execution permission

✓ Private Media authorization

✓ Organization Owner

✓ Owner protection

✓ Secure Ownership Transfer

✓ Permission Change Audit

✓ Authentication Audit

✓ Security Events

✓ Centralized Authorization Service

✓ Resource-Level Authorization

✓ Search/Export authorization

✓ System Actor

✓ Integration/Service Identity foundation

✓ CSRF-aware browser architecture

✓ Concurrency Protection

✓ Idempotent security operations

✓ Safe failure behavior

✓ Authorization Tests

✓ Security settings
```

---

# 301. Strongly Preferred V1

```text
Security Dashboard

Active Session Viewer

New Login Notification

Users Without MFA View

High-Risk Permission Filter

Permission Change Notifications

Effective Access Preview

Permission Search

Sensitive Permission Warnings

Customer Data Masking

Access Denial Security Monitoring

Breached/Common Password Screening

Audit Export for Security Review
```

---

# 302. Foundation Now / Later

Architecture should prepare for:

```text
WebAuthn / Passkeys

OIDC

Enterprise SSO

SAML

Multiple Organizations per Identity

Reusable Permission Sets

Additional scope types

API Tokens

OAuth Clients

Service Accounts

Break-Glass Access

Approval Workflows

Separation of Duties

Device Trust

Risk-Based Authentication
```

---

# 303. Deferred Advanced Capabilities

Post-V1:

```text
Enterprise SSO

SAML

SCIM provisioning

Passkey-only privileged authentication

Hardware security keys

Just-In-Time Access

Temporary Privilege Elevation

Approval-Based High-Risk Actions

IP Allowlisting

Managed Device Policies

Advanced Risk Scoring

Automated Dormant-Account Disabling

Advanced Security Analytics

External SIEM Integration

Fine-Grained ABAC Policy Engine

Cross-Organization Platform Administration
```

---

# 304. Decisions Established

### Decision IAM-001

**Authentication and Authorization are distinct subsystems.**

### Decision IAM-002

**Customer Accounts and Internal User Accounts remain separate security realms.**

### Decision IAM-003

**Internal User is an access identity, not an HR Employee record.**

### Decision IAM-004

**Identity and Organization Membership are separate concepts.**

### Decision IAM-005

**Every protected resource is Organization-bound.**

### Decision IAM-006

**Internal accounts are invite-only in V1.**

### Decision IAM-007

**Disabled Membership revokes active access without deleting historical actor identity.**

### Decision IAM-008

**Password authentication uses mature secure libraries/provider infrastructure rather than custom cryptography.**

### Decision IAM-009

**Local password storage uses modern adaptive hashing such as Argon2id.**

### Decision IAM-010

**MFA is first-class and mandatory for high-privilege production users.**

### Decision IAM-011

**TOTP + recovery codes is the practical V1 MFA baseline.**

### Decision IAM-012

**Passkeys/WebAuthn remain a strong future enhancement.**

### Decision IAM-013

**Internal web sessions are revocable server-controlled security contexts.**

### Decision IAM-014

**Permission changes cannot remain stale inside long-lived sessions indefinitely.**

### Decision IAM-015

**Authorization denies by default.**

### Decision IAM-016

**Every sensitive request/command requires server authorization.**

### Decision IAM-017

**Capabilities, not hard-coded role names, drive runtime authorization.**

### Decision IAM-018

**Permission Presets exist only to simplify administration, not to become business logic.**

### Decision IAM-019

**V1 uses additive permission grants rather than complicated Allow/Deny inheritance.**

### Decision IAM-020

**Location scope is the first major scope dimension.**

### Decision IAM-021

**Scope semantics remain domain-aware rather than one ambiguous generic scope implementation.**

### Decision IAM-022

**Sensitive data access is separately permissioned from ordinary record access.**

### Decision IAM-023

**Field-level server filtering is required; frontend masking alone is insufficient.**

### Decision IAM-024

**Organization Owner is a protected structural relationship, not a normal role preset.**

### Decision IAM-025

**Ownership changes require a dedicated step-up-authenticated workflow.**

### Decision IAM-026

**Users cannot escalate their own authority through generic update endpoints.**

### Decision IAM-027

**High-risk actions may require recent MFA/reauthentication in addition to permission.**

### Decision IAM-028

**Service/integration identities never rely on employee browser Sessions.**

### Decision IAM-029

**Background/system activity uses explicit SYSTEM or delegated actor context.**

### Decision IAM-030

**Authorization applies equally to reads, writes, exports, search, analytics, and private media.**

### Decision IAM-031

**Authorization logic is centrally testable.**

### Decision IAM-032

**New capabilities are denied until explicitly granted.**

### Decision IAM-033

**Authorization infrastructure fails closed.**

### Decision IAM-034

**OWASP ASVS and related security guidance should inform implementation verification.**

---

# 305. Resulting Security Model

The core model becomes:

```text
                      IDENTITY
                          │
                   Authentication
                          │
                          ▼
                       SESSION
                          │
                          ▼
              ORGANIZATION MEMBERSHIP
                          │
                          ▼
                  PERMISSION GRANTS
                          │
               ┌──────────┴───────────┐
               │                      │
          CAPABILITY                SCOPE
               │                      │
               └──────────┬───────────┘
                          ▼
                     AUTHORIZATION
                          │
              ┌───────────┴───────────┐
              │                       │
            ALLOW                    DENY
              │
              ▼
                  DOMAIN OPERATION
```

Example:

```text
Alice
  ↓
Authenticated + MFA
  ↓
Maevelle Membership
  ↓
inventory.adjust
  ↓
Scope:
Main Warehouse
  ↓
Adjustment target:
Main Warehouse
  ↓
ALLOW
```

But:

```text
Alice
  ↓
inventory.adjust
  ↓
Scope:
Main Warehouse
  ↓
Adjustment target:
Showroom
  ↓
DENY
```

---

# 306. Sensitive Data Model

```text
User
  │
  ├── customers.view
  │        ↓
  │   Customer summary
  │
  └── customers.view_sensitive
           ↓
      Full phone/address
```

Similarly:

```text
procurement.view
      ↓
Purchase operational data

procurement.costs.view
      ↓
Supplier financial costs
```

and:

```text
payments.view
      ↓
Payment summary

payments.view_sensitive
      ↓
Evidence / sensitive references
```

---

# 307. Owner Model

```text
ORGANIZATION
      │
      ▼
 PRIMARY OWNER
      │
      ├── Full Organization Authority
      │
      ├── MFA Required
      │
      ├── Step-Up for Critical Changes
      │
      └── Protected Ownership Transfer
```

This prevents:

```text
"role = admin"
```

from becoming the only thing protecting control of the entire business.

---

# 308. Complete Operational Security Boundary

All of the domains we have designed now sit behind:

```text
                  IDENTITY
                     │
              AUTHENTICATION
                     │
                  SESSION
                     │
              AUTHORIZATION
                     │
   ┌─────────────────┼──────────────────┐
   │                 │                  │
 Catalog          Inventory          Orders
   │                 │                  │
 Media          Procurement         Payments
   │                 │                  │
 Sizing          Shipment          Customers
                     │
                Landed Cost
```

Every module receives the same core security guarantees:

```text
Who?

Which Organization?

Which Capability?

Which Scope?

Which Resource?

Which Sensitive Fields?

Which Authentication Strength?
```

---

# 309. Architecture Milestone

We have now completed almost all of the most dangerous foundational transactional domains:

```text
Catalog              ✓

Sizing               ✓

Inventory            ✓

Warehouse/Locations  ✓

Procurement          ✓

Inbound Shipments    ✓

Landed Cost          ✓

Orders               ✓

Payments             ✓

Customers            ✓

Media                ✓

Identity / Access    ✓
```

This is important because we can now design remaining operational domains **on top of stable concepts**, rather than repeatedly changing fundamental Product, stock, Customer, cost, Payment, and security assumptions.

---

# 310. Next Domain

The next document should now be:

```text
docs/domains/expenses/expense-architecture.md
```

or more broadly:

```text
docs/domains/finance/finance-operations-architecture.md
```

I recommend using the broader **Finance Operations** domain and placing Expenses underneath it, because we already have money flowing through several systems:

```text
Supplier Payments

Purchase Costs

Shipment Expenses

Landed Costs

Customer Payments

Refunds

Courier Fees

COD Settlements

General Business Expenses

Advertising Expenses

Operating Expenses
```

The next architecture needs to prevent something very dangerous:

```text
Supplier Payment
+
Expense Entry
+
Shipment Charge
```

all representing the **same ৳50,000 cash outflow** and therefore being counted three times.

It should define:

```text
Expense

Expense Category

Expense Type

Expense Source

Operational Expense

Direct vs Indirect Expense

General Expense

Advertising Expense

Rent / Utilities

Courier Expense

Payment Provider Fees

Shipment Expense relationship

Purchase Payment relationship

Refund relationship

Manual Expense

Recurring Expense foundation

Vendor / Payee

Expense Currency

Amount

Tax/VAT foundation

Expense Date

Due Date

Paid / Unpaid status

Payment / Cash Movement relationship

Attachment / Receipt

Expense Allocation

Campaign relationship

Order relationship

Shipment relationship

Purchase relationship

Location relationship

Cost Center foundation

Cash Outflow

Source-Generated Financial Records

Duplicate Prevention

Reconciliation

Financial Timeline

Profitability Boundaries

Accounting Boundary

Permissions

Audit
```

Most importantly we need to formally separate:

```text
BUSINESS EVENT

FINANCIAL OBLIGATION

ACTUAL CASH MOVEMENT

EXPENSE CLASSIFICATION
```

because those are not always the same thing.

For example:

```text
Facebook ad expense
→ General/Marketing Expense

International Freight
→ Shipment Expense
→ Landed Cost eligible

Supplier Product Payment
→ Procurement Payment
→ Acquisition cash outflow

Customer Refund
→ Payment Refund

Pathao delivery fee
→ Fulfillment/Transaction Expense
```

All should eventually contribute to management reporting **without being manually duplicated into one giant Expense table**.

---

**End of Identity, Authentication & Granular Access Control Architecture v0.1**
