# Admin access boundary

Admin documents, RSC navigation and prefetch requests are protected before rendering by
`apps/admin/proxy.ts`. Cookie presence is only a shortcut for detecting a missing session;
cookie-bearing requests are validated through Fastify's existing `/admin/context` endpoint.
The request's page capability is checked against current organization membership. Login,
two-factor challenge, invitation acceptance and safe access-status screens are public and
render without the business shell. The development design-system screens require Admin access.

The root server layout and navigation template also call the request-local
`requireAdminAccess` helper. A persistent layout alone is not the continuing access boundary.
The shell receives validated initial context and denies unknown access. It rechecks on
navigation, focus, visibility restoration, account changes, visible-tab intervals (60 seconds)
and Admin API access failures. Normal authorized navigation does not replace the workspace
with a full-screen session check. Requests already issued are never replayed by these checks.

Absent/expired sessions go to login; missing membership or page capability goes to access
denied; required enrollment goes to Account security; verification failures show Retry.
Password sign-in is currently the only enabled Admin sign-in method. Better Auth's incomplete
two-factor challenge is not a normal session; the API boundary requires both user and session
identifiers. Enrollment and login preserve validated internal Admin destinations. Successful
sign-out uses a full document navigation to discard this tab's in-memory route cache.

Fastify's shared Admin guard enforces a valid session, active organization membership and
organization two-factor policy before route-specific authorization. Each business endpoint
retains its own capability and scope checks. `/admin/context` keeps its existing response
contract, adding an unavailable (503) outcome. Session lookup exceptions are not converted
to a missing session. Admin/auth responses and protected rendering use private/no-store
policies. Never cache access decisions globally or treat a UI permission check as API authority.

## Runtime configuration

`ADMIN_INTERNAL_API_URL` is a trusted HTTP(S) origin, never derived from request Host headers.
Local Node development defaults to `http://127.0.0.1:3002`; Compose explicitly uses
`http://api:3000`. The Admin image defaults to the existing rootless staging container DNS name
`http://maevelle-staging-api:3000`; override the variable if the deployment uses another alias.
No public service port is needed. Deploy the API change before the Admin image. No migration
or database reset is needed. Deploying either image does not revoke already-issued sessions.

## Focused verification

Local checks on 2026-11-10: 35 focused tests passed across four files, Admin typechecking,
the API TypeScript build, and ESLint on the changed authentication files passed. No full suite,
production UI build, persistent database operation or deployment was performed.

Regression coverage lives in Admin `lib/auth/access.test.ts`, `src/admin-proxy.test.ts`,
the existing `src/account-ui.test.tsx`, and API `src/admin-access.test.ts`. It covers return-URL
attacks, page capabilities, missing/incomplete sessions, membership denial, enrollment policy,
service failures, document/RSC entry decisions and shell withholding without validated context.
Local unauthenticated HTTP requests verify `/admin`, nested routes, RSC prefetches and spoofed
path headers redirect without dashboard markup, while login and safe error pages remain usable.
Full authenticated browser, real 2FA/expiry/revocation, browser cache restoration and deployed
ingress acceptance remain separate follow-up checks. Already-delivered information cannot be
retracted; idle-tab revocation is detected on the next check, not instantaneously.
