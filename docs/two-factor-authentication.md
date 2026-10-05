# Authenticator app two-factor authentication

**Status:** Implemented for internal Admin Portal identities  
**Authentication engine:** Better Auth 1.6.25 two-factor plugin  
**Scope:** Maevelle team members only; storefront customer authentication is unchanged

## What this protects

Two-factor authentication (2FA) adds a second proof to an administrator's password. A person who
knows only the password cannot enter a protected account. Maevelle implements the standard TOTP
protocol. Google Authenticator is one compatible app, but Maevelle does not call Google, require a
Google account, or use a Google API. Codes are generated on the phone and normally work without an
internet connection. Accurate automatic time on the phone and synchronized time on Maevelle's
servers are required.

TOTP has no per-message fee. Normal application hosting, email delivery, and operations costs still
apply.

## User guide

### Enable an authenticator

1. Sign in and open **Account security** from the Admin navigation.
2. Choose **Set up authenticator** and confirm the account password.
3. Scan the locally rendered QR code with a compatible authenticator app. If scanning is unavailable,
   enter the displayed setup key manually.
4. Enter the current six-digit code. Maevelle does not enable 2FA until this first code succeeds.
5. Save the recovery codes somewhere secure and separate from the phone. They are shown only at
   creation or regeneration time.

The QR, setup key, TOTP secret, and recovery codes are credentials. Do not screenshot or share them,
and do not paste them into support messages.

### Sign in afterward

Enter email and password first. Maevelle then shows an authenticator challenge. Enter the current
six-digit code, or choose **Use a recovery code instead**. A password-only challenge never receives a
normal Admin session.

### Recovery codes

Each recovery code can be used once. A consumed code cannot be reused, including by concurrent
requests. Regenerating recovery codes immediately invalidates every previous code. Regeneration
requires the password, a current authenticator code, and a recently established 2FA session.

### Lost phone

Use one saved recovery code. If both the authenticator and recovery codes are unavailable, contact an
administrator who has the dedicated 2FA reset capability. A reset never reveals the old QR or secret:
it deletes the enrollment, invalidates old authenticator and recovery codes, and revokes active
sessions. Where organization policy requires 2FA, the member must enroll again before protected work.

The Owner account cannot be reset by another member through this workflow. Owner recovery requires
controlled operational intervention and proof of authority; it is deliberately not a routine Team &
Access action.

### Disable 2FA

A member may disable their own authenticator only when organization policy does not require it.
Password confirmation, the current authenticator code, and a fresh 2FA session are required. All
sessions are revoked after disabling, so the user must sign in again.

## Authentication and enrollment architecture

```mermaid
flowchart TD
  P[Email and password] --> BA[Better Auth 1.6.25]
  BA --> Q{2FA enabled?}
  Q -- No --> S[Full session]
  Q -- Yes --> C[Short-lived 2FA challenge]
  C --> V{TOTP or unused recovery code valid?}
  V -- No --> C
  V -- Yes --> S
```

```mermaid
flowchart TD
  A[Authenticated member] --> PW[Confirm password]
  PW --> E[Better Auth creates pending enrollment]
  E --> QR[Maevelle renders QR locally]
  QR --> APP[Authenticator app]
  APP --> FIRST[Verify first six-digit code]
  FIRST --> ENABLE[Enable 2FA]
  ENABLE --> RC[Show one-time recovery codes]
  ENABLE --> SIDE[Audit, outbox, queued security notification]
```

```mermaid
flowchart TD
  ADMIN[Authorized admin with fresh MFA] --> RESET[Reset member 2FA]
  RESET --> INVALIDATE[Delete old enrollment and recovery state]
  INVALIDATE --> REVOKE[Revoke member sessions]
  INVALIDATE --> AUDIT[Audit and outbox event]
  INVALIDATE --> NOTIFY[Queued security notification]
  REVOKE --> REENROLL[Member signs in and re-enrolls if required]
```

## Security model and decisions

- Better Auth owns TOTP generation/verification, pending challenge cookies, recovery-code consumption,
  failed-attempt counters, and temporary account lockout. Maevelle does not implement TOTP crypto.
- The issuer is configured explicitly; the default is `Maevelle`, never `Better Auth`.
- Trusted-device bypass is disabled. Every new protected sign-in requires a second factor.
- A challenge lasts 10 minutes by default. The plugin applies its endpoint rate limit and Maevelle's
  `/auth/*` rate limit also applies.
- Ten failed second-factor attempts lock the account for 15 minutes by default. Values are validated
  at startup.
- Better Auth encrypts the persisted TOTP secret and recovery-code payload using its configured secret.
  Maevelle session/challenge secondary-storage values are independently encrypted with AES-256-GCM
  using `AUTH_ENCRYPTION_KEY`; storage keys are HMAC-derived.
- QR data is created in the browser with the local `qrcode` package. It is never sent to a QR service,
  placed in a URL, or persisted as an image.
- Enrollment and recovery responses set `Cache-Control: no-store, private`. Codes and secrets are not
  written to audit, outbox, notifications, application logs, browser storage, or generic user DTOs.
- Authentication and authorization remain separate. After 2FA, active membership, tenant isolation,
  capabilities, and business invariants are still checked normally.

## Organization policy

The policy has three modes:

| Mode | Behavior |
| --- | --- |
| `OPTIONAL` | Members may choose whether to enroll. |
| `CRITICAL_CAPABILITIES` | Owner and members holding active `CRITICAL` or `RESTRICTED` capabilities must enroll. |
| `ALL_MEMBERS` | Every active Admin member must enroll. |

Changing from optional enforcement starts a configurable grace period. During grace, eligible members
can work and see their deadline. After the deadline, the API permits only Admin context, authenticator
status/enrollment, and logout/auth endpoints; all other `/admin/*` operations return
`TWO_FACTOR_ENROLLMENT_REQUIRED`. This server-side gate prevents URL bypass. The Admin shell sends the
member to Account security without creating a redirect loop.

Policy changes require `admin.security.two_factor_policy.manage`, a fresh 2FA session, the acting
member's current TOTP, optimistic version matching, a reason, audit/outbox records, and member
notifications. Reset requires `admin.team.two_factor.reset` plus the same fresh-MFA proof. Owner and
self-reset are denied.

## Session decisions

- Enable: Better Auth replaces the enrollment session when the first code succeeds; other existing
  sessions are not automatically revoked.
- Disable: all sessions are revoked.
- Administrative reset: all target sessions are revoked.
- Recovery-code use: the successful challenge creates the normal session; the code is consumed once.
- Policy change: current requests are evaluated against live policy. Once the deadline is reached,
  existing sessions cannot access protected Admin APIs until enrollment completes.
- Password-change session behavior remains owned by the existing Better Auth password workflow.

## API surface

Maevelle wrappers are used for sensitive account and policy changes:

- `GET /admin/security/two-factor/status`
- `POST /admin/security/two-factor/enrollment`
- `POST /admin/security/two-factor/enrollment/verify`
- `POST /admin/security/two-factor/backup-codes`
- `POST /admin/security/two-factor/disable`
- `GET|PUT /admin/security/two-factor/policy`
- `POST /admin/team/:membershipId/two-factor/reset`

The login challenge uses Better Auth's `/auth/two-factor/verify-totp` and
`/auth/two-factor/verify-backup-code`. Maevelle forces `trustDevice: false`. Direct raw enable,
disable, and recovery-code-generation endpoints are blocked so callers cannot bypass Maevelle policy,
reauthentication, audit, or authorization.

## Data ownership

The mutable development baseline migration `0004_iam_and_authentication` contains Better Auth's
canonical `iam.users.two_factor_enabled` field and the unique-per-user `iam.auth_two_factor` record
(`secret`, encrypted recovery-code payload, verification state, failed count, and lock expiry). The
record cascades on user deletion. Maevelle separately owns
`iam.organization_two_factor_policies`; policy data is tenant-scoped, versioned, constrained, and does
not duplicate authenticator credentials.

Security lifecycle events use the existing `audit.audit_events`, `platform.outbox_events`, and
`notifications.notifications` infrastructure. Critical security notifications create IN_APP and EMAIL
deliveries regardless of ordinary preference settings; provider delivery remains asynchronous. Failure
to deliver a notification does not reverse an already completed authentication action.

## Frontend architecture and components

The Admin Portal frontend integrates 2FA natively through Next.js App Router and the Maevelle Admin Design System (Tailwind CSS v4 and shadcn/Base UI component primitives).

### Routes and surfaces

| Route | Role / Surface | Key Components |
| --- | --- | --- |
| `/login` | Primary credentials sign-in | `login/page.tsx` — intercepts `twoFactorRedirect: true` and transitions smoothly to `/two-factor`. |
| `/two-factor` | Second-factor login challenge | `two-factor/page.tsx`, `TotpCodeInput` — supports 6-digit TOTP, 1-click fallback to recovery code, clock-drift help, lockout notice, and safe sign-out. |
| `/account/security` | Personal 2FA management | `TwoFactorSecurityConsole`, `AuthenticatorSetupWizard`, `TwoFactorManagementDialog` — guided enrollment, regeneration, and policy status. |
| `/settings/security` | Organization 2FA policy | `TwoFactorPolicyCard`, `TotpCodeInput` — 3 policy modes, configurable grace periods, audit reasons, and fresh TOTP confirmation. |
| `/team` | Directory posture | `TeamMembersList` — 2FA status badges (`Enabled`, `Required`, `Not enabled`) and filter toolbar (`all`, `enabled`, `required`, `not_enabled`). |
| `/team/[id]` | Member security & reset | `TeamMemberDetailConsole`, `TotpCodeInput` — detailed 2FA status, owner protection, self-management notice, and fresh admin reset dialog. |
| Any Admin Route | Route enforcement gate | `AdminShell`, `TwoFactorRequiredGate` — blocks navigation when `accessRestricted: true` to prevent dashboard data leakage; displays grace period warning strip. |

### Component hierarchy

- `TotpCodeInput`: Accessible, keyboard-friendly 6-digit OTP input built on `input-otp`. Supports grouped 3-3 display, clipboard paste sanitization, numeric virtual keyboard (`inputMode="numeric"`), auto-focus, backspace navigation, and disabled submission states.
- `RecoveryCodesPanel`: Tabular monospace display (`tabular-nums font-mono`) of generated recovery codes with 1-click clipboard copy, transient "Copied" feedback, `.txt` file export (excluding sensitive tokens/secrets), and mandatory acknowledgement checkbox (`"I have saved my recovery codes"`).
- `AuthenticatorSetupWizard`: Multi-step guided modal:
  1. *Introduction*: Calm explanation of compatible apps (Google Authenticator, Microsoft Authenticator, etc.).
  2. *Password Confirmation*: Clean identity verification step with show/hide password toggle.
  3. *QR Setup & Manual Key*: Client-side QR rendering using `qrcode` on a high-contrast white backing canvas (dark-mode immune). Collapsible manual setup key with 1-click copy for mobile/single-device users.
  4. *Code Verification*: 6-digit verification with contextual clock-drift troubleshooting tip.
  5. *Recovery Codes*: Save recovery codes safely before completion.
  6. *Success*: Subtle confirmation banner returning the operator to `/account/security`.
- `TwoFactorManagementDialog`: Dedicated modal for high-sensitivity account actions: regenerating recovery codes and disabling 2FA. Re-authenticates using account password and current TOTP, and cleanly disables the disable action when organization policy enforces 2FA.
- `TwoFactorRequiredGate`: Full-page blocking gate rendered inside `AdminShell` when a user's session is restricted (`accessRestricted: true`). Eliminates redirect loops while preventing unauthorized access to protected dashboard APIs, and provides clear action to initiate enrollment or safely sign out.
- `TwoFactorPolicyCard`: Organization-wide policy configuration interface with 3 visual options (`OPTIONAL`, `CRITICAL_CAPABILITIES`, `ALL_MEMBERS`), quick-select grace period presets (24h, 72h, 7d, 14d), mandatory change reason, and fresh acting-admin TOTP verification.

### Sensitive frontend state handling

To uphold zero-leakage security standards:
- **No persistent storage:** Enrollment URIs, TOTP setup secrets, recovery codes, entered passwords, and active OTP values are **NEVER** stored in `localStorage`, `sessionStorage`, browser query parameters, or persistent global stores.
- **Component lifecycle isolation:** Sensitive enrollment state exists solely in transient React component state (`useState`) during wizard mounting and is wiped immediately upon dialog closure or step advancement.
- **No telemetry/log leaks:** Development and production logging rules strictly forbid printing TOTP secrets, recovery codes, or OTP entries to `console.log`, analytics trackers, or Sentry error breadcrumbs.
- **No sensitive props in SSR:** Server components never receive or render raw TOTP secrets into server-rendered HTML payloads.

### Authentication state machine

```mermaid
stateDiagram-v2
  [*] --> Unauthenticated: Open Admin Portal
  Unauthenticated --> PasswordCheck: Submit Email + Password
  PasswordCheck --> Authenticated: 2FA Disabled & Not Required
  PasswordCheck --> TwoFactorChallenge: 2FA Enabled
  TwoFactorChallenge --> Authenticated: Valid TOTP or Recovery Code
  TwoFactorChallenge --> Unauthenticated: Cancel / Sign Out
  Authenticated --> MandatoryEnrollment: Policy Enforced & Deadline Passed
  MandatoryEnrollment --> Authenticated: Complete Enrollment Wizard
  MandatoryEnrollment --> Unauthenticated: Sign Out
```

## Troubleshooting

- **Every code is invalid:** enable automatic date/time and timezone on the phone, select the correct
  Maevelle entry, wait for a new code, and confirm server/container NTP synchronization.
- **Temporarily locked:** stop trying codes and wait for the configured lock interval. Repeated attempts
  do not shorten it. Review the account's security/audit activity if the failures were unexpected.
- **No phone:** use one unused recovery code. Otherwise request an authorized administrative reset.
- **Old QR unavailable:** this is intentional. Re-exposing an enrollment secret would let another
  person clone the authenticator.
- **Member is stuck after policy change:** verify the active organization, policy deadline, account
  status, and the member's capability-derived requirement, then complete enrollment at Account security.


