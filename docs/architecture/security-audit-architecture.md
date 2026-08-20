# Maevelle Ecommerce — Security & Audit Architecture

**Document:** `docs/architecture/security-audit-architecture.md`
**Status:** Initial Architecture Design / Living Document
**Version:** 0.1
**Related:** All domain and architecture documents, especially `access-control-architecture.md`, `api-webhook-integration-architecture.md`, `media-architecture.md`, `payment-architecture.md`, `customer-architecture.md`, `settings-localization-architecture.md`

---

# 1. Purpose

This document defines Maevelle's system-wide security architecture.

Security covers:

```text
Authentication

Authorization

Organization isolation

Session security

MFA

Step-up authentication

API credentials

Service accounts

Secrets

Encryption

Personal data

Payments

Uploads

Webhooks

Provider callbacks

Rate limiting

Abuse protection

Infrastructure access

Database access

Backups

Logging

Audit

Security monitoring

Incident response

Security testing
```

Security is not one module.

It is a cross-cutting property of the entire platform.

---

# 2. Core Principle

> **Every request is untrusted until authenticated where required, authorized for the requested action, validated, and accepted by the owning domain.**

Conceptually:

```text
REQUEST
   │
   ▼
IDENTITY
   │
   ▼
AUTHENTICATION
   │
   ▼
ORGANIZATION CONTEXT
   │
   ▼
AUTHORIZATION
   │
   ▼
INPUT VALIDATION
   │
   ▼
DOMAIN INVARIANTS
   │
   ▼
TRANSACTION
   │
   ▼
AUDIT / SECURITY EVENTS
```

---

# 3. Second Core Principle

> **Frontend visibility is never authorization.**

Hiding:

```text
[ Refund ]
```

from a user does not protect Refund.

The server must independently enforce:

```text
payments.refund
```

for the actual command.

---

# 4. Third Core Principle

> **Knowing an entity ID does not grant access to the entity.**

Example:

```text
GET /orders/ORD_ID
```

must verify:

```text
Authenticated actor

Organization

Capability

Scope

Object relationship where relevant
```

before returning data.

---

# 5. Fourth Core Principle

> **Security controls must fail closed for sensitive operations.**

If authorization infrastructure cannot determine whether an actor can:

```text
refund ৳50,000
```

the safe result is:

```text
DENY
```

not:

```text
probably allow.
```

---

# 6. Fifth Core Principle

> **No single control is assumed sufficient.**

Examples:

```text
UI restriction
+
server authorization
+
domain validation
+
audit
```

or:

```text
rate limiting
+
idempotency
+
duplicate detection
+
operational review
```

Security uses defense in depth.

---

# 7. Sixth Core Principle

> **Security events and business events remain distinguishable.**

Example:

```text
Order cancelled
```

is a business event.

```text
Unauthorized cancellation attempt
```

is a security event.

Both may be important.

---

# 8. Security Objectives

Maevelle should protect:

```text
Confidentiality

Integrity

Availability

Authenticity

Accountability

Recoverability
```

---

# 9. Confidentiality

Unauthorized actors cannot access:

```text
Customer PII

Financial data

Supplier costs

Payment information

Secrets

Private media

Internal notes
```

---

# 10. Integrity

Unauthorized or accidental activity cannot silently corrupt:

```text
Orders

Inventory

Payments

Landed Cost

Finance

Access Control

Settings
```

---

# 11. Availability

Security controls should not themselves make legitimate business operations unnecessarily fragile.

But attacks must not be allowed to exhaust:

```text
Database

Workers

Storage

External provider quotas
```

without controls.

---

# 12. Authenticity

System should know whether an action came from:

```text
Internal User

Customer

Service Account

External Provider

System Worker
```

and verify that identity appropriately.

---

# 13. Accountability

High-value actions must remain attributable to:

```text
who

what

when

from where

why

before

after
```

where appropriate.

---

# 14. Recoverability

Security incidents and failures must have recovery paths:

```text
Credential revocation

Session termination

Secret rotation

Backup restoration

Projection rebuild

Audit investigation
```

---

# 15. Security Architecture Layers

```text
NETWORK / EDGE
      ↓
APPLICATION ENTRY
      ↓
AUTHENTICATION
      ↓
AUTHORIZATION
      ↓
APPLICATION SERVICES
      ↓
DOMAIN VALIDATION
      ↓
DATABASE / STORAGE
      ↓
AUDIT / MONITORING
```

External integrations have an additional:

```text
PROVIDER AUTHENTICATION

SIGNATURE VERIFICATION

REPLAY PROTECTION

RECONCILIATION
```

layer.

---

# 16. Threat Model

The project should maintain a living threat model.

Threat sources include:

```text
Anonymous internet attacker

Malicious customer

Compromised customer device

Compromised employee account

Malicious internal user

Compromised API credential

Compromised integration provider

Application vulnerability

Dependency compromise

Misconfiguration

Operational mistake

Infrastructure compromise

Credential leak
```

---

# 17. Important Assets

High-value assets include:

```text
Customer PII

Internal user credentials

MFA credentials

Sessions

API keys

Integration secrets

Order history

Payment records

Refund capability

Inventory quantities

Supplier costs

Landed cost

Cash/financial accounts

Backups

Audit history

Private media
```

---

# 18. Attack Surfaces

Important surfaces:

```text
Public Storefront

Checkout

Login

Admin portal

Customer order lookup

Review submission

Payment reference submission

Media upload

Admin APIs

Integration API

Outbound webhooks

Inbound provider callbacks

File import

Export downloads

SSH/VPS

Database

Object storage
```

---

# 19. Trust Boundaries

Key trust boundaries:

```text
Public Internet
      ↓
Maevelle Edge / Application

Browser
      ↓
Server

Admin User
      ↓
Privileged Business APIs

Maevelle
      ↓
External Provider

External Provider
      ↓
Provider Callback Endpoint

Application
      ↓
Database

Application
      ↓
Object Storage

Application
      ↓
Secret Store
```

---

# 20. Never Trust Browser State

Browser values such as:

```text
price

discount

payment_status

customer_id

organization_id

inventory_quantity

permission

order_status
```

are always treated as untrusted input.

---

# 21. Organization Context

Organization must be derived from trusted context.

Do not trust:

```text
organization_id
```

submitted by a client as authorization.

---

# 22. Organization Isolation

Every Organization-owned record must be protected from cross-Organization access.

---

# 23. Cross-Organization Read Attack

User from Organization A guesses:

```text
Order ID belonging to Organization B
```

Result:

```text
NOT FOUND / FORBIDDEN
```

with no data leakage.

---

# 24. Cross-Organization Write Attack

Same principle for mutations.

---

# 25. Organization Validation

Relationship chain must remain valid.

Example:

```text
Order
→ Customer
→ Organization
```

must not contain mixed Organization references.

---

# 26. Cross-Organization Reference Validation

Cannot configure:

```text
Org A Promotion
→ Org B Product
```

or:

```text
Org A Inventory Adjustment
→ Org B Location
```

---

# 27. Defense at Database Level

Where practical, database constraints should reinforce:

```text
Organization ownership

uniqueness

referential integrity
```

rather than relying only on application code.

Exact schema later.

---

# 28. Authentication Domains

Different actors require distinct authentication architecture:

```text
Internal Users

Customers future

Service Accounts

Providers
```

---

# 29. Internal User Authentication

Internal portal security is highest priority because it can affect:

```text
Money

Inventory

Customer data

Permissions

Settings
```

---

# 30. Password Storage

Passwords must never be stored:

```text
plaintext

reversibly encrypted
```

Use a modern password hashing algorithm configured with appropriate cost.

---

# 31. Password Handling

Application should never:

```text
email passwords

display stored passwords

log passwords
```

---

# 32. Password Policy

Prefer strength-based policy.

Avoid unnecessary rules such as:

```text
must have exactly one symbol
```

if they reduce usability without meaningful security.

---

# 33. Common/Compromised Password Protection

Strongly preferred:

```text
reject extremely common/known-compromised passwords
```

during password set/reset.

---

# 34. Password Length

Allow long passwords/passphrases.

Do not impose tiny maximum lengths.

---

# 35. Password Reset

Flow:

```text
Request Reset
      ↓
Generic Response
      ↓
One-Time Expiring Token
      ↓
Set New Password
      ↓
Invalidate Token
      ↓
Optionally terminate other sessions
      ↓
Security Notification
```

---

# 36. Account Enumeration

Login/reset endpoints should avoid unnecessarily revealing:

```text
this email exists
```

to anonymous attackers.

---

# 37. Reset Token

Must be:

```text
Cryptographically random

Short-lived

Single-use

Stored safely

Bound to intended identity/action
```

---

# 38. Password Reset Logging

Never log raw reset token.

---

# 39. Password Change

Authenticated password change should require:

```text
current credential
```

or:

```text
recent step-up authentication
```

according to policy.

---

# 40. Password Change Security Event

Generate:

```text
security.password_changed
```

and notify user appropriately.

---

# 41. Multi-Factor Authentication

MFA should be supported for internal users.

---

# 42. V1 Recommendation

Strongly preferred:

```text
TOTP authenticator application
```

with secure recovery mechanism.

---

# 43. Future MFA

Possible:

```text
WebAuthn / Passkeys

Hardware security keys
```

later.

---

# 44. MFA Enforcement

Configurable policy:

```text
OPTIONAL

REQUIRED_FOR_PRIVILEGED_USERS

REQUIRED_FOR_ALL_INTERNAL_USERS
```

---

# 45. Privileged Examples

Users capable of:

```text
permissions.manage

payments.refund

finance.cash.manage

settings.security.manage

integrations.credentials.manage
```

should strongly require MFA.

---

# 46. MFA Secret

MFA secret is sensitive authentication material.

Store encrypted/protected.

Never expose again after enrollment except controlled recovery/re-enrollment.

---

# 47. MFA Recovery Codes

If supported:

```text
single-use

hashed

shown once

regeneratable
```

---

# 48. MFA Disable

Sensitive command.

Should require:

```text
recent MFA / step-up

permission

audit

security notification
```

---

# 49. Lost MFA

Recovery process must not become an easy account-takeover bypass.

Owner/admin reset requires high-trust workflow and audit.

---

# 50. Step-Up Authentication

Certain actions should require recent stronger authentication even if session is already active.

Examples:

```text
Disable MFA

Generate API Key

Rotate Integration Secret

Change Security Settings

Transfer Organization Ownership

Large Refund

Sensitive Customer Export
```

---

# 51. Step-Up Window

Successful recent authentication can remain valid for a short configured period.

Exact duration later.

---

# 52. Session Security

Admin authentication should use secure server-managed session semantics.

---

# 53. Session ID

Session identifiers must be:

```text
unguessable

high entropy
```

and never encode sensitive information.

---

# 54. Session Storage

Server retains authoritative session state such as:

```text
User

Membership

Authentication level

MFA state

Created At

Expires At

Revoked At

Last Activity
```

---

# 55. Session Cookie

For browser sessions:

```text
Secure

HttpOnly

appropriate SameSite
```

and narrowly scoped.

---

# 56. Do Not Store Sensitive Auth Tokens in LocalStorage by Default

For internal admin browser authentication, avoid architecture that unnecessarily exposes persistent bearer credentials to browser JavaScript.

---

# 57. Session Expiration

Use:

```text
absolute lifetime

idle timeout
```

appropriate to internal operations.

---

# 58. Remember Me

If supported:

```text
longer-lived trusted session
```

still requires safe rotation and revocation.

---

# 59. Session Rotation

Rotate identifiers after:

```text
Login

Privilege elevation

MFA verification

Password change
```

where relevant.

---

# 60. Session Revocation

User/admin must be able to:

```text
Log out current session

Log out other sessions

Revoke all sessions
```

---

# 61. Password Reset and Sessions

Strong default:

```text
invalidate other active sessions
```

after account recovery/password reset.

---

# 62. Disabled User

All current sessions should stop authorizing promptly.

---

# 63. Permission Change

Critical permission removal must converge promptly to active sessions.

Do not leave:

```text
refund permission removed
```

but session can refund for another six hours due to stale cache.

---

# 64. Session Listing

Preferred internal security UX:

```text
Device / Browser

Approximate Location/IP context

Last Activity

Created At

Current Session
```

---

# 65. Session Revocation Audit

Track:

```text
actor

target user

session

reason

time
```

when admin forces logout.

---

# 66. Customer Authentication Future

Customer Account authentication remains isolated from Internal User authentication.

---

# 67. Customer Session Cannot Access Admin API

Even if customer and internal user share same email/phone.

Identity systems remain separate.

---

# 68. Customer Guest Checkout

Does not create authenticated Customer Account.

---

# 69. Authorization Model

Maevelle uses capability-based access control.

Examples:

```text
orders.view

orders.create

orders.cancel

inventory.adjust

payments.verify

payments.refund

customers.view_sensitive

finance.expenses.view

settings.security.manage
```

---

# 70. Presets / Roles

Named roles/presets may group capabilities.

But authorization should ultimately resolve capabilities/scopes.

---

# 71. Never Use Role Name in Domain Logic

Bad:

```text
if role == "manager"
```

Better:

```text
authorize(payments.refund)
```

---

# 72. Scopes

Capabilities can be constrained.

Examples:

```text
Organization

Location

Future Storefront

Future business unit
```

---

# 73. Object-Level Authorization

Capabilities alone are not enough.

Example:

```text
inventory.view
```

with:

```text
Location A only
```

cannot access Location B Inventory.

---

# 74. Relationship-Based Checks

Potential customer-facing future:

Customer can view:

```text
their own Order
```

because of ownership relationship.

This differs from internal capabilities.

---

# 75. Server Authorization Sequence

Recommended:

```text
Authenticate

Resolve Organization Membership

Check Membership active

Resolve capabilities

Resolve scopes

Load target safely

Validate target Organization

Check action-specific policy
```

---

# 76. Avoid Fetch-Then-Filter Leaks

Queries should ideally include authorization scope in retrieval where practical.

---

# 77. Aggregate Authorization

Reports/totals must respect scopes too.

User cannot infer:

```text
other warehouse stock
```

through grand total.

---

# 78. Sensitive Fields

Some fields require stronger capability.

Examples:

```text
Customer Phone

Customer Email

Supplier Cost

Landed Cost

Cash Balance

Payment Evidence
```

---

# 79. Masking

Where partial access useful:

```text
017•••••890

n***@example.com
```

---

# 80. Masking Is Presentation, Not Authorization

Masked data endpoint still requires legitimate permission.

---

# 81. Mass Assignment Protection

Never map arbitrary request body directly onto persistent/domain entity.

Bad:

```text
entity.update(request.body)
```

because attacker may inject:

```text
organization_id

is_admin

payment_status

cost

verified_purchase
```

---

# 82. Explicit Command DTOs

Each command accepts only approved fields.

---

# 83. Input Validation

All inputs validated for:

```text
Type

Length

Format

Range

Allowed enum

Relationship

Business constraints
```

---

# 84. Negative Quantity

Reject malformed:

```text
quantity = -999
```

unless command semantics intentionally support signed adjustment.

---

# 85. Excessive Payload

Bound:

```text
JSON size

array size

string length

nesting depth
```

---

# 86. SQL Injection

Database access uses parameterized/query-builder mechanisms.

Never concatenate untrusted values into SQL.

---

# 87. Dynamic Sort

Sort fields use whitelist mapping.

Do not append arbitrary:

```text
ORDER BY ${input}
```

---

# 88. Dynamic Filters

Same.

---

# 89. XSS

Sources include:

```text
Product descriptions

Reviews

Customer notes

Supplier notes

CMS content future

Notification content
```

---

# 90. Default Rule

Treat user-editable text as data, not executable HTML.

---

# 91. Rich Text

If rich text is supported:

```text
restricted structured format

sanitization

safe renderer
```

rather than arbitrary script-enabled HTML.

---

# 92. React Rendering

Do not use unsafe HTML injection with untrusted data without sanitization.

---

# 93. Content Security Policy

Production storefront/admin should use a restrictive CSP compatible with required assets.

---

# 94. Inline Scripts

Avoid uncontrolled inline script execution.

---

# 95. Third-Party Scripts

Examples:

```text
Meta Pixel

Analytics

Chat
```

increase attack/privacy surface.

Load deliberately.

---

# 96. Security Headers

Production should use appropriate:

```text
Content-Security-Policy

Strict-Transport-Security

X-Content-Type-Options

Referrer-Policy

frame restrictions / frame-ancestors

Permissions-Policy where useful
```

---

# 97. Clickjacking

Admin portal should not normally be embeddable in arbitrary third-party frames.

---

# 98. CSRF

Cookie-authenticated state-changing browser requests require CSRF defense.

---

# 99. CSRF Is Separate From CORS

CORS configuration does not by itself solve CSRF.

---

# 100. Unsafe GET

GET requests must not perform important state changes.

---

# 101. CORS

Explicit trusted origins for:

```text
Storefront

Admin
```

where cross-origin access required.

---

# 102. Admin CORS

Do not allow:

```text
*
```

with credentialed admin APIs.

---

# 103. SSRF

Particularly relevant to:

```text
Outbound webhooks

Remote media imports future

Integration callbacks/configuration

URL preview future
```

---

# 104. Webhook SSRF

Reject destinations resolving to unsafe:

```text
localhost

private network

link-local metadata services

internal infrastructure
```

unless explicitly trusted.

---

# 105. Redirect SSRF

Do not blindly follow redirects from approved public URL to internal target.

---

# 106. DNS Rebinding

Resolution policy should consider destination at connection time, not only form submission.

---

# 107. File Upload Security

Uploads are untrusted.

Examples:

```text
Product image

Review image

Supplier document

Import spreadsheet
```

---

# 108. File Validation

Use:

```text
MIME/content validation

allowed extensions only as secondary signal

maximum file size

maximum dimensions

maximum count
```

---

# 109. Never Trust Filename

Filename is presentation metadata.

Storage identity uses generated safe identifier.

---

# 110. Path Traversal

User filename must never control server filesystem path.

---

# 111. Image Processing

Decode/re-encode image where appropriate.

Generate safe derivatives.

---

# 112. Metadata Removal

Public images should strip unnecessary embedded metadata such as EXIF location where appropriate.

---

# 113. SVG

Treat SVG carefully because it can contain active content.

V1 can restrict or sanitize SVG uploads.

---

# 114. Office/PDF Attachments

Future supplier/business documents may require:

```text
private storage

malware scanning

strict content type

download disposition
```

---

# 115. File Serving

Private assets must not become public because object-store URL is guessable.

---

# 116. Public vs Private Media

Media architecture already defines visibility.

Security enforces it.

---

# 117. Signed URLs

Private downloads may use short-lived signed access.

Authorization occurs before generating access.

---

# 118. Public Asset Immutability

Public CDN assets should use safe object identities, not raw filesystem paths.

---

# 119. Media Authorization

Review image pending moderation:

```text
private
```

even if processing complete.

---

# 120. Import File Security

Spreadsheet import should never permit:

```text
macro execution

formula execution on server

embedded executable code
```

as part of parsing.

---

# 121. CSV Formula Injection

Exports containing user-controlled values should consider spreadsheet formula injection.

Values beginning with dangerous formula prefixes may need safe handling for CSV/XLSX.

---

# 122. Personal Data

Sensitive customer data includes:

```text
Name

Phone

Email

Address

Order history

Payment context

Review identity

Support notes future
```

---

# 123. Data Minimization

Store only data needed for legitimate business functions.

---

# 124. API Minimization

Do not return:

```text
full Customer object
```

where only:

```text
customer_display_name
```

is needed.

---

# 125. Analytics Minimization

Analytics projections should avoid unnecessary PII duplication.

---

# 126. Logs Minimization

Do not log:

```text
full request body
```

by default for customer/payment endpoints.

---

# 127. PII Masking in Logs

Examples:

```text
Phone:
01*****890

Email:
n***@example.com
```

where values need diagnostic context.

---

# 128. Payment Data

Maevelle should minimize handling of highly sensitive card data.

Future online gateway architecture should prefer hosted/tokenized provider flows where possible.

---

# 129. Card Data

The core platform should not unnecessarily store:

```text
full card number

CVV
```

---

# 130. Manual Mobile Wallet

Store only necessary:

```text
transaction reference

sender information if business needs it

verified amount

verification evidence
```

with restricted permissions.

---

# 131. Payment Proof Images

Sensitive/private.

Do not expose through public Media endpoints.

---

# 132. Provider Secrets

Payment/courier/email provider secrets must be isolated from normal domain records.

---

# 133. Secret Management

Categories:

```text
Application secrets

Integration secrets

Database credentials

Storage credentials

Signing secrets

Encryption keys
```

---

# 134. Secret Storage Principle

Secrets should be stored through protected deployment/secret-management mechanisms.

Normal settings may hold only:

```text
secret reference

masked status
```

---

# 135. Secret Exposure

Never include secret values in:

```text
Logs

Audit

Error messages

API responses

Analytics

Support screenshots
```

---

# 136. Secret Creation

Where user generates API/Webhook secret:

```text
show once
```

then mask.

---

# 137. Secret Rotation

All long-lived integration credentials should have rotation strategy.

---

# 138. Secret Revocation

Immediate.

---

# 139. Encryption in Transit

Production traffic uses TLS.

---

# 140. Plain HTTP

Normal production application endpoints should redirect/deny plain HTTP appropriately.

---

# 141. Internal Provider Calls

External APIs also use TLS.

---

# 142. Encryption at Rest

Storage volumes/databases/backups should use appropriate infrastructure encryption where available.

---

# 143. Application-Level Encryption

Especially sensitive values may additionally require application-level field encryption.

Candidates:

```text
MFA secrets

provider secrets if persisted

high-risk tokens
```

---

# 144. Encryption Key Management

Keys must remain separate from encrypted database values.

---

# 145. Key Rotation

Architecture should permit key rotation.

Potential model:

```text
key version
+
ciphertext
```

---

# 146. Hash vs Encryption

Passwords:

```text
hash
```

because plaintext recovery unnecessary.

Provider credentials:

```text
encryption/secret store
```

because application must use original secret.

---

# 147. Token Hashing

One-time tokens/API keys can often store:

```text
secure hash
```

while showing original only once.

---

# 148. Rate Limiting

Security-specific rate limits needed for:

```text
Login

Password Reset

MFA

Order Placement

Coupon Validation

Review Submission

Payment Reference Submission

Public Order Lookup

Search

Webhook configuration/test
```

---

# 149. Rate Limit Dimensions

Potential:

```text
IP

Account

Session

Customer

Phone

API Client

Organization

Endpoint
```

---

# 150. Login Protection

Use:

```text
rate limiting

progressive delay

security monitoring
```

without creating trivial denial-of-service via permanent account locking.

---

# 151. Account Lockout

Avoid simplistic:

```text
5 wrong attempts
→ account permanently locked
```

which attackers can abuse.

---

# 152. Credential Stuffing

Detect patterns across:

```text
accounts

IPs

user agents
```

where practical.

---

# 153. CAPTCHA

Adaptive.

Do not require for every normal user.

Could be introduced for suspicious public abuse.

---

# 154. COD Abuse

Public Order creation can be abused.

Controls:

```text
Rate limits

Idempotency

Duplicate Order detection

Customer history

Phone validation foundation

Manual confirmation where needed

Future risk scoring
```

---

# 155. Do Not Make Phone Number Equal Trust

Anyone can enter a phone number.

Customer history/risk signals must remain contextual.

---

# 156. Coupon Abuse

Protection:

```text
Rate limiting

Generic public errors

Customer limits

Usage limits

Concurrency-safe usage

Private-code entropy
```

---

# 157. Review Abuse

Protection:

```text
Verified purchase eligibility

Secure review links

Rate limits

Moderation

Media limits
```

---

# 158. Search Abuse

Bound:

```text
query length

request frequency

filter complexity
```

---

# 159. Export Abuse

Large sensitive exports require:

```text
Permission

Row limits

Async processing

Private delivery

Audit
```

---

# 160. API Credential Abuse

Monitor:

```text
Unusual request volume

New source IP

Authorization failures

Rate-limit spikes
```

---

# 161. API Key Scope

Least privilege.

Example accounting integration does not need:

```text
inventory.adjust
```

unless explicitly required.

---

# 162. Service Account Human Login

Service Accounts should not log into admin portal as human users.

---

# 163. Webhook Security

Outbound Webhooks:

```text
HTTPS

signature

timestamp

secret

SSRF protection

rate/retry controls
```

---

# 164. Provider Callback Security

Inbound:

```text
Provider authentication

signature validation

replay protection

event deduplication

amount/resource validation
```

---

# 165. Signature Comparison

Use constant-time comparison where applicable.

---

# 166. Raw Body

If provider signature depends on raw payload, preserve exact raw request bytes for verification before JSON normalization.

---

# 167. Replay

Valid signature alone may not be enough.

Use:

```text
timestamp window

event ID dedupe
```

where protocol allows.

---

# 168. Webhook Secret Rotation

During rotation, short overlap may accept:

```text
current

previous
```

secret where required.

---

# 169. Provider Callback Does Not Bypass Domain Rules

Even authenticated:

```text
payment succeeded
```

event must pass Payment reconciliation rules.

---

# 170. Idempotency Abuse

Idempotency endpoint should validate:

```text
same key
+
same operation
+
same request fingerprint
```

---

# 171. Attacker Reuses Key With Different Payload

Reject.

---

# 172. Idempotency Record Privacy

Do not store raw sensitive request unnecessarily.

Use safe request fingerprint and result references.

---

# 173. Security Logging

Security-relevant events should be structured.

Examples:

```text
Login Success

Login Failure

MFA Failure

Password Changed

Session Revoked

Permission Changed

API Key Created

API Key Revoked

Security Setting Changed

Webhook Verification Failed

Repeated Authorization Failure
```

---

# 174. Security Log Is Not Audit Trail

Security logs are operational detection signals.

Audit trail records important business/security actions.

They overlap but remain conceptually different.

---

# 175. Application Logging

Use structured logs.

Common context:

```text
timestamp

request_id

organization_id

actor_id

operation

outcome
```

where safe.

---

# 176. Logs Must Not Contain

```text
Passwords

MFA secrets

Raw API keys

Reset tokens

Webhook secrets

Full payment credentials
```

---

# 177. Error Logging

Internal logs may contain technical details.

User-facing error does not.

---

# 178. Log Retention

Define retention by log type.

Do not retain sensitive verbose logs indefinitely.

---

# 179. Audit Architecture

Audit is append-oriented evidence of important actions.

---

# 180. Audit Record

Conceptually:

```text
Audit Event ID

Organization

Actor Type

Actor ID

Action

Target Type

Target ID

Timestamp

Request ID

Source

Reason

Before

After

Metadata
```

---

# 181. Actor Types

```text
INTERNAL_USER

CUSTOMER

SERVICE_ACCOUNT

EXTERNAL_PROVIDER

SYSTEM
```

---

# 182. Audit Source

Potential:

```text
ADMIN_WEB

STOREFRONT

API

WEBHOOK

BACKGROUND_JOB

SYSTEM_REPAIR
```

---

# 183. Audit Actions

Use semantic action names.

Examples:

```text
order.cancelled

inventory.adjusted

payment.verified

payment.refund_created

permissions.changed

settings.security_changed
```

---

# 184. Avoid Audit Every Read

Logging every ordinary read can become overwhelming.

Focus on:

```text
mutations

security actions

sensitive exports

sensitive reads where required

privileged operations
```

---

# 185. Sensitive Read Audit

Examples that may justify audit:

```text
Full Customer PII export

Payment evidence access

API secret generation

Backup download

Security log access
```

---

# 186. Before / After

Store meaningful changes.

Example:

```text
Order State:
CONFIRMED → CANCELLED
```

---

# 187. Avoid Giant Snapshots

Do not dump entire Order object into every audit entry.

Store meaningful changed fields/summary.

---

# 188. Secret Redaction in Audit

Before/after must never contain:

```text
raw password

secret

token
```

---

# 189. Reason

High-risk actions require reason.

Examples:

```text
Inventory Adjustment

Payment Reversal

Large Refund

Permission Change

Security Setting Change
```

---

# 190. Audit Immutability

Normal application users must not:

```text
edit

delete

rewrite
```

audit history.

---

# 191. Audit Correction

If audit metadata needs correction, append new corrective record rather than modifying original event.

---

# 192. Audit Availability

Audit should remain queryable by:

```text
Entity

Actor

Action

Date

Organization
```

---

# 193. Audit Permission

Sensitive:

```text
audit.view
```

and perhaps:

```text
audit.security.view
```

separately.

---

# 194. Audit Organization Isolation

Never expose other Organization audit history.

---

# 195. Audit Export

High privilege.

Audit who exported audit.

---

# 196. Financial Audit Events

Mandatory examples:

```text
Payment posted

Payment reversed

Refund initiated

Refund completed

Cash movement recorded

Expense posted

Expense reversed

Landed Cost finalized
```

---

# 197. Inventory Audit Events

```text
Adjustment

Stocktake posting

Damage

Disposal

Transfer dispatch

Transfer receipt
```

---

# 198. IAM Audit Events

```text
Membership created

Membership disabled

Capabilities changed

Scope changed

MFA reset

API key created/revoked
```

---

# 199. Settings Audit

High-impact Settings already defined.

Security architecture requires preservation.

---

# 200. Audit Integrity Check

Strongly preferred:

Periodic checks confirm:

```text
sequence continuity

unexpected deletion

storage health
```

Potential future tamper-evident chaining can be introduced if justified.

---

# 201. Security Event Monitoring

Monitor meaningful anomalies.

Examples:

```text
Many failed logins

Repeated authorization failures

Unexpected high refund volume

Repeated webhook signature failures

New API key + unusual traffic

Mass customer export

Large inventory adjustments

Many secret rotations

Suspicious session behavior
```

---

# 202. Security Alert

Notification domain can alert:

```text
Organization Owner

Security Administrator
```

for configured events.

---

# 203. Alert Fatigue

Do not alert on every normal security event.

Prioritize:

```text
actionable

meaningful

high-confidence
```

conditions.

---

# 204. Production Access

Production infrastructure access is highly privileged.

---

# 205. Principle

Normal business Admin access:

```text
≠
Production server shell access
```

---

# 206. SSH Access

VPS administration should use:

```text
SSH keys

restricted accounts

no shared credentials
```

---

# 207. Root Login

Direct routine root login should be avoided.

Use privilege escalation from named administrative account where practical.

---

# 208. SSH Password Login

Prefer disabled where operationally practical once secure key-based access is established.

---

# 209. SSH Exposure

Restrict through:

```text
firewall

allowlists/VPN future

rate limiting
```

where appropriate.

---

# 210. Production Admin Accounts

Each developer/operator gets individual identity.

Do not share:

```text
admin123
```

credentials.

---

# 211. Least Privilege Infrastructure

Application process should not run with unnecessary operating-system privileges.

---

# 212. Process Separation

Web application, workers, database, reverse proxy should run with appropriately separated permissions where practical.

---

# 213. Firewall

Only required services exposed publicly.

Typical:

```text
80/443
```

and controlled:

```text
SSH
```

Database should not be openly internet-accessible.

---

# 214. Database Exposure

PostgreSQL should accept connections only from required trusted application/admin network context.

---

# 215. Database Credentials

Separate:

```text
Application runtime credential

Migration/deployment privilege where needed

Backup credential
```

rather than one omnipotent user everywhere.

---

# 216. Application DB User

Should not have unnecessary:

```text
SUPERUSER

CREATEDB
```

privileges.

---

# 217. Migration Privileges

Database migrations may require stronger privileges.

Keep deployment access controlled.

---

# 218. Direct Production DB Editing

Strong rule:

> **Normal operational problems should be repairable through application workflows, not direct database edits.**

---

# 219. Emergency DB Repair

If unavoidable:

```text
authorized operator

recorded reason

backup/checkpoint

controlled query

post-repair verification

audit/incident record
```

---

# 220. Database Backups

Backups are security-critical data copies.

---

# 221. Backup Contains

Potentially:

```text
PII

financial history

secrets if poorly designed

audit records
```

Therefore backup protection matters.

---

# 222. Backup Requirements

```text
Automated

Regular

Encrypted/protected

Access controlled

Retention defined

Restore tested
```

---

# 223. Backup Frequency

Specific schedule belongs Operations architecture.

But RPO/RTO targets must eventually be documented.

---

# 224. Off-Server Backup

Strongly preferred.

If VPS disk dies/ransomware occurs:

```text
backup on same disk
```

is insufficient.

---

# 225. Backup Credentials

Separate and protected.

---

# 226. Backup Download

High privilege.

Audit access.

---

# 227. Restore Testing

A backup not tested for restore cannot be fully trusted.

Periodic restore drill required.

---

# 228. Restore Environment

Test restore should not accidentally expose real PII to insecure development environment.

---

# 229. Production Data in Development

Avoid using full raw production database for local development.

---

# 230. Development Fixtures

Use:

```text
synthetic

anonymized
```

data.

---

# 231. Environment Separation

At minimum:

```text
Development

Staging/Test

Production
```

logical separation.

---

# 232. Production Credentials

Never reused in:

```text
local development

CI test fixtures
```

---

# 233. Production Provider Accounts

Payment/courier/email production credentials separate from sandbox/test credentials.

---

# 234. Storage Buckets

Production and non-production assets should be separated.

---

# 235. Email Test Safety

Staging must not accidentally email real customers.

Use:

```text
sandbox provider

recipient allowlist

mail sink
```

as appropriate.

---

# 236. Payment Test Safety

Staging uses provider sandbox/test environment.

---

# 237. Courier Test Safety

Prevent accidental real delivery creation from staging.

---

# 238. CI/CD Security

Build/deploy pipeline is privileged.

Protect:

```text
repository secrets

deployment credentials

production environment
```

---

# 239. Branch Protection

Strongly preferred for production code.

---

# 240. Code Review

Sensitive changes should be reviewed.

Examples:

```text
Authentication

Authorization

Payments

Inventory ledger

Migrations

Secrets

Deployment
```

---

# 241. Dependency Security

Third-party packages are supply-chain dependencies.

---

# 242. Dependency Policy

Avoid:

```text
unmaintained obscure packages
```

for critical security/business functions where robust alternatives exist.

---

# 243. Dependency Pinning

Use lockfiles and controlled updates.

---

# 244. Dependency Scanning

Automated scanning for known vulnerable dependencies.

---

# 245. Secrets Scanning

Repository/CI should detect likely committed credentials.

---

# 246. Secret Leak Response

If credential enters repository:

```text
rotation/revocation
```

is required.

Deleting commit alone is not sufficient.

---

# 247. Static Analysis

Use security-focused static analysis where useful.

---

# 248. Supply Chain

CI actions/plugins/tooling should be intentionally selected and pinned where feasible.

---

# 249. Build Artifacts

Production deployment should come from trusted build pipeline.

---

# 250. Source Maps

Production source-map exposure should be controlled.

Useful internally for error tracking but not necessarily public.

---

# 251. Error Tracking

Production exception tracking must redact:

```text
PII

tokens

secrets
```

---

# 252. Availability / DoS

Protect expensive endpoints from abusive work.

Examples:

```text
Search

Exports

File uploads

Bulk imports

Webhook tests

Large filters
```

---

# 253. Resource Limits

Use:

```text
request size

file size

query complexity

worker concurrency

job queue bounds
```

---

# 254. Worker Isolation

Eventually separate:

```text
Payments

Webhooks

Notifications

Imports

Analytics
```

worker pools to prevent resource starvation.

---

# 255. Queue Flood

Low-priority analytics/webhooks should not prevent critical payment/refund work.

---

# 256. Database Connection Exhaustion

Use bounded connection pools.

---

# 257. Expensive Reports

Analytics uses projections/read isolation instead of hammering transactional tables.

---

# 258. Security and Idempotency

Security attacks may intentionally replay requests.

Idempotency protects integrity but still requires authentication/rate limiting.

---

# 259. Sequence Abuse

Human-readable sequential Order numbers must never be used as sole public authorization.

---

# 260. Public Order Lookup

Require:

```text
unguessable public token

or additional ownership verification
```

---

# 261. Sensitive Public URLs

Do not place:

```text
phone

email

payment reference

reset token
```

in ordinary URLs unnecessarily.

---

# 262. Referrer Leakage

Sensitive tokens in URLs should minimize leak risk and expire quickly.

---

# 263. Cache Security

Never shared-cache:

```text
Cart

Checkout

Customer

Order details

Payment data

Admin responses
```

without safe user-specific cache semantics.

---

# 264. CDN

Public product/media content can be cached.

Private content cannot rely on obscurity.

---

# 265. Cache Key

Must not accidentally omit:

```text
Organization

Locale

authorization context
```

where relevant.

---

# 266. Cache Poisoning

Validate cache variation and untrusted headers/query fields.

---

# 267. Storefront SEO Security

Structured data must not expose:

```text
internal IDs

private customer data

internal cost
```

---

# 268. Security of Reviews

Public Reviews expose safe author snapshot only.

---

# 269. Security of Customer Merge

Merge is sensitive and potentially destructive.

Requires:

```text
customer.merge

preview

conflict resolution

audit
```

---

# 270. Security of Inventory Adjustment

Requires:

```text
inventory.adjust

Location scope

reason

before/after

audit
```

Large changes can require elevated confirmation.

---

# 271. Security of Stocktake

Posting Stocktake creates real inventory changes.

Permission separate from count entry.

---

# 272. Security of Landed Cost

Landed cost exposes sensitive supplier economics.

Separate:

```text
landed_cost.view

landed_cost.finalize
```

capabilities.

---

# 273. Security of Finance

Separate capabilities for:

```text
view expense

create expense

post expense

record payment

view cash

reconcile
```

---

# 274. Security of Refunds

Refund can move money out.

Requires:

```text
payments.refund
```

and potentially:

```text
refund approval threshold
```

future.

---

# 275. High-Value Refund

Future policy:

```text
Refund > threshold
→ step-up
→ approval
```

---

# 276. Security of Payment Verification

Manual payment verification is financially sensitive.

Require:

```text
payments.verify
```

and audit:

```text
submitted amount

verified amount

actor

reference
```

---

# 277. Security of Reversal

More sensitive than ordinary verification.

Separate permission.

---

# 278. Security of Supplier Payments

Procurement supplier payments require financial privilege.

---

# 279. Security of Settings

Settings page must not become capability bypass.

Changing Inventory policy requires Inventory authorization.

---

# 280. Security of Integrations

Integration credentials are among highest-risk assets.

Separate:

```text
integrations.view

integrations.manage

integrations.credentials.rotate
```

---

# 281. Security of API Keys

Creation should require step-up for privileged API clients.

---

# 282. Security of Webhook Replay

Replay can flood external consumer.

High permission.

Audit.

---

# 283. Security of Exports

Exports can leak large datasets.

Treat:

```text
export
```

as separate privileged operation.

---

# 284. Security of Audit

Audit itself contains sensitive operational details.

Protect.

---

# 285. Data Retention

Security/privacy architecture should define retention classes.

Examples:

```text
Core transaction history

Customer PII

Audit

Security logs

Provider raw callbacks

Notification bodies

Temporary uploads

Exports
```

---

# 286. Transaction Records

Commercial/legal retention requirements will eventually define exact durations.

Do not hard delete prematurely.

---

# 287. Customer Anonymization

Future privacy workflow can remove/anonymize unnecessary PII while retaining legitimate transaction history.

---

# 288. Anonymization Is Not Deletion of Order Economics

Example:

```text
Customer name/phone
→ anonymized
```

while Order total/inventory history remains.

---

# 289. Review Privacy

Customer-authored text/media may require separate handling because it can contain personal data.

---

# 290. Logs Retention

Shorter than transaction history where appropriate.

---

# 291. Temporary Exports

Expire/delete after retention period.

---

# 292. Session Data

Expired session/token records can be purged according to security retention policy.

---

# 293. Security Incident

A Security Incident represents suspected/confirmed compromise or serious control failure.

Examples:

```text
Stolen API key

Compromised admin account

Customer data exposure

Unauthorized refund

Malicious dependency

Production database leak

Webhook secret leak
```

---

# 294. Incident Response Lifecycle

Conceptually:

```text
DETECTED

TRIAGED

CONTAINED

ERADICATED

RECOVERED

REVIEWED
```

---

# 295. Immediate Incident Capabilities

Operators need ability to:

```text
Disable User

Revoke Sessions

Revoke API Keys

Disable Integration

Rotate Secret

Pause Payment Method

Pause Webhooks

Disable Checkout if necessary
```

---

# 296. Security Kill Switches

Emergency actions should exist for:

```text
Checkout

Payment Method

Integration

API Credential

Webhook Endpoint
```

without destroying historical data.

---

# 297. Incident Audit Preservation

During incident:

```text
do not delete relevant audit/log evidence.
```

---

# 298. Incident Timeline

Capture:

```text
Detection

Actions

Actors

Credential rotations

Affected records

Recovery
```

---

# 299. Post-Incident Review

Document:

```text
Root cause

Blast radius

Detection gap

Control failure

Required remediation
```

---

# 300. Security Testing Strategy

Security testing must be continuous, not one final penetration test.

---

# 301. Unit Tests

For:

```text
Authorization policies

Signature verification

Token expiry

Password/MFA flows

PII masking

Input validation
```

---

# 302. Integration Tests

Examples:

```text
Cross-org access blocked

Location scope enforced

Permission removed mid-session

Provider signature invalid

Duplicate callback safe
```

---

# 303. End-to-End Security Tests

```text
Admin cannot access another Organization

Customer cannot enumerate Orders

Unauthorized refund rejected

Manipulated price rejected

Draft Product not public

Private Media inaccessible

Coupon brute force limited
```

---

# 304. Authorization Matrix Tests

Every sensitive capability should have:

```text
allowed test

denied test

scope denied test
```

---

# 305. Regression Tests

Security bug gets permanent regression test.

---

# 306. Static Security Analysis

Automate where useful.

---

# 307. Dependency Vulnerability Scanning

Run continuously/regularly.

---

# 308. Secret Scanning

Run pre-commit/CI where feasible.

---

# 309. Container/OS Scanning

If containerized/deployed through images later, scan OS/package vulnerabilities.

---

# 310. Dynamic Security Testing

Staging can receive automated web/API security testing.

---

# 311. Penetration Testing

Before significant scale or exposing public developer APIs/payment automation, perform focused penetration testing.

---

# 312. Manual Abuse Testing

Especially:

```text
Checkout

COD

Coupons

Review links

Order lookup

Payment verification

File upload

Webhooks

Exports
```

---

# 313. Fuzz Testing

Useful on parsers/endpoints:

```text
API payloads

File imports

Webhook payloads
```

---

# 314. Security Test Data

Never use production secrets.

---

# 315. Security Release Gate

Critical vulnerabilities block production release.

---

# 316. Vulnerability Severity

Define internal severity:

```text
CRITICAL

HIGH

MEDIUM

LOW
```

with remediation expectations.

---

# 317. Security Debt

Known risk must be tracked.

Do not hide behind:

```text
we'll fix later
```

without explicit risk acceptance.

---

# 318. Security Exception

If a temporary insecure workaround is unavoidable:

```text
owner

reason

risk

expiration date

mitigation
```

required.

---

# 319. Threat Modeling Per Major Feature

Before implementing:

```text
Customer Accounts

Courier Automation

Gateway Payments

Public API

CMS

Support Chat
```

perform focused threat review.

---

# 320. Security Checklist for New Domain Command

Every new command should answer:

```text
Who can call it?

Which Organization?

Which scopes?

What data is trusted?

What must be validated?

Is it idempotent?

Is step-up needed?

What gets audited?

What can fail?

Can it move money?

Can it expose PII?

Can it alter stock?
```

---

# 321. Security Checklist for New Integration

```text
How authenticated?

How are secrets stored?

How are callbacks authenticated?

Replay protection?

Timeouts?

Retry safety?

External duplicate risk?

PII shared?

Data retention?

Disable switch?

Audit?
```

---

# 322. Security Checklist for New Public Endpoint

```text
Can it be anonymous?

Can IDs be enumerated?

Rate limit?

Abuse case?

Sensitive response?

Cache safe?

Input limits?

CSRF?

CORS?

XSS?
```

---

# 323. Security Health Dashboard

Recommended internal health:

```text
Failed Login Spike

Active Privileged Sessions

MFA Adoption

Recent Permission Changes

Recent API Key Creation

Recent Secret Rotation

Webhook Verification Failures

High-Risk Audit Events

Security Configuration Problems

Dependency Vulnerabilities

Backup Status

Last Restore Test
```

---

# 324. Do Not Expose Security Dashboard Broadly

Sensitive operational/security information.

---

# 325. Security Notifications

Examples:

```text
New Login

Password Changed

MFA Disabled

API Key Created

API Key Revoked

Permission Escalation

Owner Changed

Webhook Signature Failures

Backup Failure
```

---

# 326. Security Notification Failure

Security event remains true even if email delivery fails.

Notification health should surface failure.

---

# 327. Default Deny

For internal capabilities:

```text
not explicitly allowed
→ denied
```

---

# 328. Secure Defaults

Examples:

```text
Overselling disabled

Private uploads private

API keys no permissions by default

New Webhook endpoint inactive until configured

MFA encouraged/required for privileged users
```

---

# 329. Do Not Depend on Security Through Obscurity

Hidden route:

```text
/admin-secret-page
```

does not make feature secure.

---

# 330. Recovery Paths

Security controls should not lock Organization permanently out.

Examples:

```text
MFA recovery

Owner recovery

API key rotation

Secret rotation

Backup restore
```

must be intentionally designed.

---

# 331. Owner Account Protection

Organization Owner is highest-value account.

Strong requirements:

```text
MFA

security notifications

step-up

session visibility

recovery protections
```

---

# 332. Ownership Transfer

Sensitive workflow:

```text
Current Owner step-up

Target membership validation

MFA requirements

confirmation

audit

security notification
```

---

# 333. Last Owner Protection

Do not allow deletion/disable of final controlling owner without safe transfer/recovery rules.

---

# 334. Permission Escalation

User should not grant themselves capabilities they do not have authority to grant.

---

# 335. Delegated Permission Administration

IAM must define which actors can:

```text
assign which capabilities

within which scopes
```

---

# 336. Privilege Ceiling

An administrator may have permission to manage users but not to grant:

```text
owner-level
```

capabilities beyond their own delegation ceiling.

Strong future/enterprise capability.

---

# 337. V1 Simpler Rule

Only Owner/highly privileged Access Admin can modify capability assignments.

---

# 338. Break-Glass Access

Future emergency access can be designed.

If introduced:

```text
short-lived

highly audited

owner/security notification
```

---

# 339. System Workers

Background jobs use machine identity.

---

# 340. Worker Permissions

Workers should have only necessary application capabilities.

---

# 341. Worker DB Access

Ideally application workers use same restricted database role through application layer.

---

# 342. Job Payload Security

Queued job payload should not unnecessarily contain raw secrets/PII.

Use entity IDs and resolve securely.

---

# 343. Queue Tampering

Workers validate job payload/domain state before sensitive operations.

Queue message alone is not sufficient authorization.

---

# 344. Scheduled Jobs

System-generated scheduled operations still validate current domain conditions.

Example:

```text
expire reservation
```

must confirm reservation still active.

---

# 345. Security Invariants

### SEC-INV-001

Every protected operation is authorized server-side.

### SEC-INV-002

Frontend visibility never grants or substitutes authorization.

### SEC-INV-003

Knowing an entity ID never grants access to the entity.

### SEC-INV-004

Organization boundaries are enforced for every Organization-owned resource.

### SEC-INV-005

Cross-Organization references are rejected.

### SEC-INV-006

Inactive Memberships cannot authorize new internal operations.

### SEC-INV-007

Capabilities and scopes are evaluated for protected actions.

### SEC-INV-008

Sensitive operations can require stronger step-up authentication.

### SEC-INV-009

Passwords are never stored in recoverable/plaintext form.

### SEC-INV-010

Authentication tokens, reset tokens and credentials are never logged in plaintext.

### SEC-INV-011

MFA secrets are protected as sensitive credential material.

### SEC-INV-012

Revoked Sessions/API credentials cannot continue authorizing requests.

### SEC-INV-013

Password reset tokens are expiring and single-use.

### SEC-INV-014

User/customer-controlled input never directly sets protected domain fields through mass assignment.

### SEC-INV-015

Database queries never interpolate untrusted SQL fragments.

### SEC-INV-016

Untrusted rich text/media is safely processed before public presentation.

### SEC-INV-017

Private Media is never exposed through public Asset access.

### SEC-INV-018

Raw infrastructure/integration secrets are not exposed through normal Settings APIs.

### SEC-INV-019

Secrets never appear in Audit logs.

### SEC-INV-020

Critical outbound/inbound Webhook security uses authentication/signatures and replay protection where supported.

### SEC-INV-021

Authenticated provider callbacks still undergo local domain validation.

### SEC-INV-022

Idempotency cannot be used to mutate a previously associated operation with different input.

### SEC-INV-023

Sensitive API/public endpoints have bounded inputs and abuse controls.

### SEC-INV-024

Public sequential business numbers are never sufficient authorization for customer records.

### SEC-INV-025

Shared caches never expose another Customer/User/Organization's private content.

### SEC-INV-026

Audit records are append-oriented and not normally editable/deletable.

### SEC-INV-027

High-risk financial/inventory/security actions are auditable.

### SEC-INV-028

Normal application logs never contain raw secrets/passwords.

### SEC-INV-029

Production database is not directly exposed to the public internet.

### SEC-INV-030

Application database credentials follow least privilege.

### SEC-INV-031

Production and non-production credentials are isolated.

### SEC-INV-032

Backups are access-controlled and restore-tested.

### SEC-INV-033

Production data is not casually copied into insecure development environments.

### SEC-INV-034

Security failures in external providers never silently change domain truth.

### SEC-INV-035

Known critical security vulnerabilities block release until resolved or formally handled through emergency risk procedure.

---

# 346. V1 Mandatory Scope

Maevelle V1 Security should include:

```text
✓ Threat-model foundation

✓ Trust-boundary documentation

✓ Internal authentication

✓ Secure password hashing

✓ Password reset

✓ Password change

✓ Session management

✓ Secure session cookies

✓ Session expiration

✓ Session revocation

✓ Logout all sessions

✓ Disabled-user session invalidation

✓ MFA architecture

✓ TOTP support strongly preferred

✓ MFA recovery

✓ MFA reset auditing

✓ Step-up authentication foundation

✓ Capability-based authorization

✓ Location-scoped authorization

✓ Organization isolation

✓ Object-level authorization

✓ Cross-Organization validation

✓ Server-side permission checks

✓ Mass-assignment protection

✓ Input validation

✓ SQL injection prevention

✓ XSS protections

✓ CSRF protections

✓ CORS configuration

✓ Security headers

✓ CSP foundation

✓ SSRF protection

✓ File upload security

✓ Private Media protection

✓ PII minimization

✓ Sensitive-field masking

✓ Sensitive log redaction

✓ Secret isolation

✓ Secret rotation foundation

✓ TLS

✓ Provider/Webhook signature verification

✓ Replay/deduplication protection

✓ Rate limiting

✓ Login abuse protection

✓ Checkout/COD abuse protection foundation

✓ Coupon abuse protection

✓ Review abuse protection

✓ API credential security

✓ Service Account security foundation

✓ Structured security events

✓ Security alert foundation

✓ Append-oriented Audit

✓ Financial audit events

✓ Inventory audit events

✓ IAM audit events

✓ Settings audit events

✓ Audit permissions

✓ VPS firewall

✓ Restricted SSH access

✓ Key-based SSH preference

✓ Database network restriction

✓ Least-privilege database user

✓ Production/non-production separation

✓ Automated backups

✓ Off-server backup

✓ Backup protection

✓ Restore testing

✓ Dependency scanning

✓ Secret scanning

✓ Security-focused static analysis foundation

✓ Authorization tests

✓ Cross-Organization tests

✓ File-upload security tests

✓ Webhook security tests

✓ Incident response foundation
```

---

# 347. Strongly Preferred V1

```text
MFA required for privileged users

Session/device management UI

Security Health Dashboard

Compromised-password checks

Sensitive-export audit

Large-refund step-up

High-risk Inventory Adjustment warnings

Owner security notifications

API-key activity monitoring

Integration credential rotation

Automated SAST in CI

Dependency update automation

Production access audit

Database backup encryption

Quarterly restore drill

Staging mail/payment/courier safety controls

Adaptive bot/CAPTCHA protection

CSP report monitoring
```

---

# 348. Foundation Now / Later

Architecture should prepare for:

```text
Passkeys / WebAuthn

Hardware security keys

Device trust

Advanced fraud/risk engine

Advanced approval workflows

Break-glass administration

Advanced SIEM

WAF

Managed secret manager

Centralized identity provider

Enterprise SSO

SCIM

IP allowlists

VPN-only admin access

Database row-level security

Tamper-evident Audit chains

Advanced DLP
```

---

# 349. Deferred Advanced Security

Post-V1 / scale-triggered:

```text
Enterprise SSO

SAML/OIDC federation

SCIM provisioning

WebAuthn/passkey-first internal login

Hardware MFA

Advanced anomaly detection

Automated fraud scoring

Managed WAF

Security Information & Event Management

Database activity monitoring

Dedicated HSM/KMS architecture

Advanced network segmentation

Zero-trust production access

Bug bounty program

Continuous external penetration testing
```

---

# 350. Decisions Established

### Decision SEC-001

**Security is a cross-cutting architectural concern rather than one isolated module.**

### Decision SEC-002

**Every protected command and query is authorized server-side.**

### Decision SEC-003

**Organization isolation is enforced independently of client-supplied Organization IDs.**

### Decision SEC-004

**Maevelle uses capability/scoped authorization rather than role-name checks in domain logic.**

### Decision SEC-005

**Object-level authorization remains necessary even after capability checks.**

### Decision SEC-006

**Internal User and future Customer authentication remain separate security realms.**

### Decision SEC-007

**Internal authentication uses server-controlled session security.**

### Decision SEC-008

**Passwords are one-way hashed and never recoverable.**

### Decision SEC-009

**MFA is a first-class internal security capability and should be required for privileged accounts.**

### Decision SEC-010

**High-risk actions support step-up authentication.**

### Decision SEC-011

**Permission/security changes must invalidate stale authorization promptly.**

### Decision SEC-012

**Mass assignment is prevented through explicit command contracts.**

### Decision SEC-013

**Untrusted rich content and uploaded files are treated as active attack surfaces.**

### Decision SEC-014

**Private Media authorization is independent of object-storage URL obscurity.**

### Decision SEC-015

**Secrets are separated from ordinary Settings and domain records.**

### Decision SEC-016

**Secrets are never returned/logged/audited in plaintext.**

### Decision SEC-017

**Encryption keys are separated from encrypted values and rotation-ready.**

### Decision SEC-018

**Maevelle minimizes highly sensitive payment/card data rather than becoming the storage system for it.**

### Decision SEC-019

**Public endpoints use layered abuse controls instead of relying on one CAPTCHA or one rate limit.**

### Decision SEC-020

**Outbound Webhooks and inbound provider callbacks are independent security boundaries.**

### Decision SEC-021

**Authenticated external provider input never bypasses local domain validation.**

### Decision SEC-022

**Audit is append-oriented evidence, distinct from general application logs.**

### Decision SEC-023

**Sensitive/high-value operations always create durable audit evidence.**

### Decision SEC-024

**Production access is separate from business-admin access and follows least privilege.**

### Decision SEC-025

**Production database is not directly internet-exposed.**

### Decision SEC-026

**Normal operational fixes should be performed through repair workflows rather than direct database editing.**

### Decision SEC-027

**Backups are security-sensitive assets and require off-server retention plus restore testing.**

### Decision SEC-028

**Production and non-production environments do not share credentials or provider access by default.**

### Decision SEC-029

**CI/CD, dependencies and source-code secrets are part of the security boundary.**

### Decision SEC-030

**Security testing is continuous across unit, integration, E2E, scanning and later penetration testing.**

---

# 351. Request Security Model

```text
                 INTERNET / CLIENT
                        │
                        ▼
                  EDGE / HTTPS
                        │
                        ▼
              REQUEST LIMIT / SIZE
                        │
                        ▼
                 AUTHENTICATION
                        │
                        ▼
                SESSION / API KEY
                        │
                        ▼
              ORGANIZATION CONTEXT
                        │
                        ▼
                 AUTHORIZATION
                 │             │
            Capability       Scope
                 │             │
                 └──────┬──────┘
                        ▼
                 INPUT VALIDATION
                        │
                        ▼
               APPLICATION SERVICE
                        │
                        ▼
                  DOMAIN RULES
                        │
                        ▼
                    DATABASE
                        │
                        ▼
                 AUDIT / EVENTS
```

---

# 352. External Provider Security Model

```text
EXTERNAL PROVIDER
       │
       ▼
Callback Endpoint
       │
       ├── Signature
       ├── Timestamp
       ├── Replay/Dedupe
       └── Payload limits
       │
       ▼
Provider Adapter
       │
       ▼
Normalized Event
       │
       ▼
Local Entity Match
       │
       ▼
Domain Validation
       │
       ▼
Business Transaction
```

A valid provider signature only proves:

```text
the provider sent the message
```

not:

```text
the requested domain transition is automatically correct.
```

---

# 353. High-Risk Action Model

Example refund:

```text
INTERNAL USER
     │
     ▼
Authenticated Session
     │
     ▼
payments.refund
     │
     ▼
Order / Payment Organization Check
     │
     ▼
Refundable Amount Validation
     │
     ▼
Step-Up if threshold requires
     │
     ▼
Reason
     │
     ▼
Refund Transaction
     │
     ▼
Audit
     │
     ▼
Notification
```

---

# 354. Customer Data Model

```text
Customer PII
    │
    ├── Admin Detail
    │      requires permission
    │
    ├── Operational projections
    │      minimum necessary fields
    │
    ├── Analytics
    │      IDs / non-sensitive dimensions
    │
    └── Public Storefront
           never exposed
```

---

# 355. Audit Model

```text
BUSINESS / SECURITY ACTION
          │
          ▼
        AUDIT
          │
   ┌──────┼────────┐
   ▼      ▼        ▼
 Actor   Target   Change
   │      │        │
   ▼      ▼        ▼
 User   Payment   Before/After
 System Inventory Reason
 API    Order     Request ID
```

Audit explains what happened without becoming a second business transaction database.

---

# 356. Incident Example — Leaked API Key

```text
Detection:
Unusual API traffic
      │
      ▼
Identify Credential
      │
      ▼
Revoke API Key
      │
      ▼
Stop Active Access
      │
      ▼
Review Audit / Logs
      │
      ▼
Determine Blast Radius
      │
      ▼
Rotate Related Secrets if needed
      │
      ▼
Repair Unauthorized Changes
      │
      ▼
Post-Incident Review
```

---

# 357. Incident Example — Compromised Admin User

```text
Disable Membership
      │
      ▼
Revoke All Sessions
      │
      ▼
Reset Authentication
      │
      ▼
Review:
Permissions
Refunds
Inventory Changes
Exports
Settings
      │
      ▼
Repair / Reverse Through Domain Workflows
```

---

# 358. Incident Example — Malicious Upload

```text
Upload
  │
  ▼
Private quarantine/processing
  │
  ├── Type validation
  ├── Size limits
  ├── Decode/scan
  └── Safe derivative
  │
  ▼
Approved Media Asset
  │
  ▼
Public Delivery only if usage permits
```

---

# 359. Architecture Milestone

At this point we have designed:

```text
Business domains
+
External contracts
+
Security model
+
Audit model
+
Reliable event boundaries
```

The next major work should no longer be another ordinary business domain.

We are ready for the **overall System / Technical Architecture**.

---

# 360. Recommended Next Document

Next:

```text
docs/architecture/system-technical-architecture.md
```

This should define how all of the architecture we have created becomes one real deployable system.

It should cover:

```text
Repository structure

Modular monolith structure

Application boundaries

Next.js architecture

Admin vs Storefront applications

Backend/application layer

Domain modules

PostgreSQL

Object storage

Redis / cache decision

Worker architecture

Queue strategy

Transactional Outbox

Scheduled Jobs

Search architecture

Media processing

Analytics projections

Configuration cache

Database transactions

Concurrency

Connection pooling

Reverse proxy

TLS

Deployment

One-VPS V1 topology

Docker/container strategy

Production process supervision

Logging

Metrics

Health checks

Graceful shutdown

Zero/minimal-downtime deploys

Database migrations

Backup/restore

Environment separation

CI/CD

Scaling path

Horizontal application scaling

Dedicated database future

Read replicas

Dedicated search future

Dedicated workers

CDN

Object storage evolution

Failure domains

Disaster recovery
```

The central V1 deployment should likely remain intentionally simple:

```text
Internet
   │
   ▼
Reverse Proxy
   │
   ├── Storefront/Admin/App
   └── API
          │
          ├── PostgreSQL
          ├── Worker Queue / Cache if justified
          └── Object Storage
```

while the **code itself** stays modular enough that we can later evolve toward:

```text
Load Balancer
     │
 ┌───┴────┐
 App     App
     │
Dedicated PostgreSQL
     │
Workers / Search / Cache
```

without rewriting the commerce model.

After the System/Technical Architecture, the next major stage should be **Database/Data Model Architecture**, where all of these domain decisions finally become concrete tables, keys, constraints, indexes, transaction boundaries, and migration strategy.

Only after that should we do the large cross-domain **stress test / leak finding / failure-mode / fallback / backup-plan pass**, because at that point we will be able to attack both the domain model **and** the proposed implementation architecture systematically.

At the implementation-hardening stage, this is also where the focused skills.sh security skills become valuable—especially **security scanning/SAST**, followed later by database/code-review and testing skills—rather than installing them prematurely during conceptual modeling.

---

**End of Security & Audit Architecture v0.1**
