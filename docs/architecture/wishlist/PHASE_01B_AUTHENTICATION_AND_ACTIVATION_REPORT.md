# Wishlist Phase 01B: authentication and private API activation

Status: **locally implemented; release acceptance pending** — 2026-10-30. The customer-controlled identity and private API blocker from Phase 01 is closed in source and isolated integration tests. Browser verification, actual Resend delivery, and staging migration inspection remain release gates. Phase 02 was not started.

## A. Executive summary

Added a separate Better Auth shopper realm, verified email/password enrollment, sign-in/out, password recovery, a reusable organization-scoped shopper principal, and a usable Storefront account screen. The private account Wishlist API is now registered when shopper email delivery is configured. CRM anonymization purges account-owned Wishlist rows. Local API, database, type, lint, and migration-history checks pass. Phase 01 is functionally complete locally; staging release and owner browser acceptance remain pending.

## B. Repository preflight

The working tree was already dirty with guest Wishlist, sharing, Phase 01 account persistence, reports, and unrelated stockout-interest notes. Branch was `main` as recorded in Phase 01. Phase 00 and Phase 01 reports, source, migrations, Better Auth 1.7.12 package behavior and official documentation, Storefront rewrite, email settings, CRM anonymization, and tests were reviewed. All pre-existing tracked and untracked work was preserved; no reset, stash, commit, deployment, or persistent migration occurred.

## C. Authentication architecture decision

The shopper realm uses the installed Better Auth 1.7.12 and existing `iam.users`, credentials, verification, and encrypted PostgreSQL secondary storage. It has base path `/shopper-auth`, cookie prefix `maevelle-shopper`, a realm-specific HMAC-derived secret and secondary-storage namespace. Admin remains at `/auth` with its existing registration and capability checks. A valid Admin cookie, including a renamed copy, does not authenticate the shopper realm. An IAM user may authenticate in both realms through each realm's credential flow, but neither realm grants the other's authorization. Reusing the Admin session or contact-matching a CRM record was rejected because neither proves customer control. A second identity store was unnecessary.

## D. Customer authentication implementation

`apps/api/src/auth/shopper-auth.ts` provides email/password signup (12–128 character password), verification email on signup, 15-minute verification links, no automatic sign-in after verification, verified-only sign-in, 12-hour sessions, sign-out, resend, and 15-minute password reset with session revocation. Better Auth generates and consumes verification/reset capabilities. Delivery uses existing Resend configuration; nonproduction recipients must be allowlisted. Tests inject a local mailbox. `/shopper-auth/*` is allowlisted and returns 503 when delivery is unavailable. The account screen exposes registration, verification status/resend, sign-in, sign-out, recovery and errors. Reset tokens are removed from the browser URL on load, and the page sets no-referrer metadata.

## E. Identity and ownership resolution

`/storefront/v1/shopper/session` and all private routes call the same resolver. It accepts only a valid shopper-realm session with verified email; the configured Storefront organization is resolved server-side. `resolveOrEnrollShopper` locks the active IAM user, checks active account/customer mappings, and idempotently creates a fresh CRM customer and account if absent. It never claims historical CRM contacts by matching email or phone. Enrollment emits audit and outbox events. The resulting `ShopperPrincipal` has `organizationId`, `accountId`, `customerId`, `userId`; request-supplied owner headers are ignored. Historical CRM records remain unlinked until a separately verified claim workflow exists.

## F. Database and migration changes

No new migration was necessary. Existing 3208 guest-share and 3209 account-Wishlist migrations were applied only in uniquely named disposable local databases by tests. Existing `iam` and `customers` structures support the realm and account link. `packages/database/package.json` exports the shopper module and migration runner; the latter supports isolated API tests. Migration-history guard reported 58 registered migrations and 51 immutable baseline migrations. Staging ledger/schema for 3208 and 3209 remain **UNVERIFIED**.

## G. Private Wishlist API activation

`apps/api/src/routes/auth.ts` registers the adapter only when a shopper email sender exists. Routes are `GET /storefront/v1/wishlist`, `POST /storefront/v1/wishlist/saved-state`, `PUT /storefront/v1/wishlist/items/:productId`, and `DELETE /storefront/v1/wishlist/items/:productId`. Every route resolves the trusted principal, validates input with TypeBox, returns a typed error envelope and private no-store response, and retains the Phase 01 domain's product, variant, tenant, idempotency, version, count, batch, and keyset rules. An invalid session returns 401. The cursor parser now checks exact timestamp and UUID syntax before SQL. Cursors are unsigned but are used only as owner-scoped keyset positions; they cannot switch owner or tenant. Shared DTOs remain TypeScript types, matching the repository's route-local TypeBox convention.

## H. CSRF, abuse and security controls

`apps/api/src/app.ts` requires the exact configured Storefront Origin for cookie-authenticated shopper/Wishlist mutations, rejects disallowed `Sec-Fetch-Site` values, and requires JSON content type. Better Auth also receives only the Storefront trusted origin. Cookie flags and token handling remain Better Auth managed. Request bodies retain Fastify's configured limit. Durable PostgreSQL counters keyed by HMAC of IP and route apply 5 signup attempts/hour, 12 sign-ins/15 minutes, 5 resend/reset requests/hour, and 120 Wishlist requests/minute; 429 includes Retry-After. These thresholds are code constants pending operational tuning. Reverse-proxy client-IP forwarding must be checked before staging; otherwise clients may share a gateway bucket. Auth and private responses use no-store. No token or email is intentionally logged.

## I. Privacy deletion integration

The existing authorized CRM anonymization transaction now deletes account Wishlist lists for the target customer's accounts before customer anonymization. Foreign-key cascade deletes items and merge receipts. Guest shares are not account-owned and are preserved. After anonymization, the principal resolver rejects the nonactive customer even with a previously valid shopper session. Future account-owned shares must join this same transaction before Phase 03 release; no unauthenticated deletion route was added.

## J. Storefront authentication UI

`/account` renders a responsive account card using existing Storefront `Button` and `Input` primitives. It provides labeled forms, native email/password validation, loading and error feedback, recovery and verification actions, session refresh, Wishlist navigation, and sign-out. Desktop navigation and mobile bottom navigation link to Account. The page is excluded from indexing and uses no-referrer metadata. Mobile, tablet, and desktop code paths use responsive Tailwind layout; visual/browser execution was not performed.

## K. Tests and verification

Passed: isolated API integration tests (4) for registration, unverified rejection, verification, shopper session, Admin-only/copy-cookie rejection, unclaimed CRM contact, owner-header forgery, private save/read, origin rejection, sign-out, single-use reset, old-session revocation, durable rate limiting, and anonymization/guest preservation. Passed: focused account Wishlist and guest-share database tests (5); API, Database and Storefront TypeScript checks; targeted ESLint; migration-history guard; `git diff --check`. The API tests use an injected mailbox and a disposable PostgreSQL database. Real Resend delivery, browser flows, expired verification/session fixtures, multi-API-instance rate behavior, full suite/build, and staging ledger were not run. No staging credentials were available for authorized read-only inspection.

## L. Files changed

New in 01B: `apps/api/src/auth/shopper-auth.ts`, `apps/api/src/routes/shopper-auth.ts`, `apps/api/src/shopper-auth.test.ts`, `packages/database/src/shopper.ts`, `apps/storefront/app/account/page.tsx`, `apps/storefront/features/account/shopper-account.tsx`, and this report. Modified for 01B: `apps/api/src/app.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/routes/account-wishlist.ts` (pre-existing untracked Phase 01), `packages/database/src/customers.ts`, `packages/database/src/wishlist/account.ts` (pre-existing untracked Phase 01), `packages/database/package.json`, `apps/storefront/components/layout/bottom-nav.tsx`, `apps/storefront/components/layout/desktop-navbar.tsx`, and `docs/product-completion/current-focus.md`. Other dirty Wishlist/share/stockout files were preserved.

## M. Compatibility

Guest Wishlist and guest sharing routes/state remain intact. The account API uses distinct paths from guest share APIs. Admin auth configuration, sign-up restriction, and RBAC remain intact. CRM contact matching is not invoked for shopper ownership. Cart and Checkout were untouched. Existing 3208/3209 migration order remains intact.

## N. Deployment requirements

Configure existing `BETTER_AUTH_SECRET`, `AUTH_ENCRYPTION_KEY`, `AUTH_BASE_URL`, `AUTH_TRUSTED_ORIGINS`, `STOREFRONT_BASE_URL`, `STOREFRONT_ORGANIZATION_CODE`, and Resend/email settings (`EMAIL_ENABLED`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, sender/reply-to and production environment). Ensure the Storefront `/api/*` rewrite reaches API, HTTPS/cookie origin and callback URLs align, and reverse proxy supplies trustworthy client IP. Before release, inspect staging 3208/3209 ledger and schema read-only, back up, run migrations once in order, deploy compatible API/Storefront, then verify real email links, cookie/session behavior, 401/403/429 responses, privacy deletion, health and logs. Record release SHA/digests and last compatible release. Application rollback does not reverse migrations.

## O. Remaining risks

**High release gate:** staging 3208/3209 status is unknown. **Medium:** real email delivery and browser/device behavior are unverified. **Medium:** proxy IP configuration may cause shared rate buckets; assess at staging. **Medium:** expired verification/session and multi-instance abuse behavior lack focused tests. **Low:** cursor remains unsigned, but strict parse and owner-scoped SQL prevent cross-owner access; consider signing if cursor confidentiality or long-lived pagination guarantees become requirements. **Future Phase 03:** account-owned shares require deletion integration. Existing CRM merge behavior with account-owned Wishlist rows should be reviewed before merging enrolled customers.

## P. Phase 01 final acceptance

Local authentication, verified ownership, Admin separation, account CRUD API, CSRF/origin, durable rate limiting, privacy cleanup, migrations, and focused tests are **met**. Browser and live delivery verification and staging migration inspection are **pending**. Therefore Phase 01B source implementation is complete, but release acceptance is not declared. No staging/production changes occurred.

## Q. Phase 02 handoff

Authentication API: `POST /shopper-auth/sign-up/email`, `GET /shopper-auth/verify-email?token=...`, `POST /shopper-auth/send-verification-email`, `POST /shopper-auth/sign-in/email`, `POST /shopper-auth/sign-out`, `POST /shopper-auth/request-password-reset`, `POST /shopper-auth/reset-password`; browser calls use `/api` prefix and credentials. Phase 02 subsequently extended `GET /storefront/v1/shopper/session` to return 200 `{data:{authenticated:true,partition:string}}` or 401. The opaque partition separates client account state; it is not authorization. The response is no-store and triggers safe account enrollment after verification. Session cookie is HttpOnly under `maevelle-shopper`; client code must revalidate on refresh and clear account-only state on logout/401. Private Wishlist routes and DTOs are in `apps/api/src/routes/account-wishlist.ts` and `packages/contracts/src/wishlist.ts`; domain owner `WishlistOwner` and list semantics are in `packages/database/src/wishlist/account.ts`; principal is in `packages/database/src/shopper.ts`. The Phase 02 controller keeps guest state until a merge receipt confirms transfer, sends Origin/JSON for mutations, handles 401/409/429, uses item/list versions, and never supplies account IDs. See the Phase 02 report for the implemented merge and client integration.
