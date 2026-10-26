# Release security audit — 2026-10-26

The historical twelve authorization warnings were reproduced with the earlier
file-level scanner, then traced from `buildApi` through `registerAuthRoutes` and
the registered handlers. No authorization bypass was confirmed in those twelve
findings. A green repository check is not deployment approval.

A separate real authorization flaw was found during the handler audit:
`setAgentAvailability` inserted a row before checking whether the membership was
an eligible messaging agent. The error response left that write committed.
`heartbeatAgentAvailability` could update an existing row for a non-agent.
Both commands now check the active organization's eligible membership before
writing. A database regression test first reproduced the committed row after
the error and then passed after the fix, including the heartbeat case.

| Historical finding | Route and guard evidence | Verdict |
| --- | --- | --- |
| `account.ts` | `/admin/account/*` handlers call `requireUserSession` and operate on the authenticated user's account or sessions. Selected organization views resolve through membership-aware account queries. | False positive: authenticated self-service routes. |
| `catalog-classification.ts` | Each Admin handler calls `requireCatalogCapability` for `catalog.view` or `catalog.manage`, rejects a missing context, and passes its organization ID to catalog operations. | False positive. |
| `catalog-product-types.ts` | Same catalog guard and organization context for product types, attributes, and reference options. | False positive. |
| `catalog-variants.ts` | Variant matrix requires `catalog.view` and passes the guarded organization ID. | False positive. |
| `facebook-messaging.ts` | Connection routes require `messaging.connections.view` or `.manage`; reply eligibility requires `messaging.reply` and inbox access. Operations use the selected active organization. | False positive. |
| `instagram-messaging.ts` | Same connection and reply capability pattern as Facebook. | False positive. |
| `messaging.test.ts` | Test fixture route strings are not registered application source. | False positive. |
| `procurement/purchases.routes.ts` | Each route calls shared `requireAdmin` with a procurement capability, rejects failure, and passes the guarded organization and actor. | False positive. |
| `procurement/receiving.routes.ts` | Shared `requireAdmin` checks receiving capabilities; reads and changes check location scope, and posting uses the organization's shipment. | False positive. |
| `procurement/shipments.routes.ts` | Shared `requireAdmin` checks shipment view/manage capabilities; domain calls use the guarded organization. | False positive. |
| `procurement/suppliers.routes.ts` | Shared `requireAdmin` checks procurement view/manage capabilities; domain calls use the guarded organization. | False positive. |
| `settings.test.ts` | Test fixture route strings are not registered application source. | False positive. |

`findActiveAdminContext` requires an active membership, restricts a selected
organization to that membership, denies ambiguous multi-organization requests,
and checks required capability grants. The shared catalog, procurement, and
messaging guards obtain the session before calling it. Existing RBAC, location
scope checks, domain writes, and audit calls were not replaced.

The hardening check now scans tracked and untracked non-ignored application
source, excludes test files from the route registration audit, and examines each
Admin handler and referenced local helper. It verifies the guard helper's session
and active-context calls and an early denial in the handler. This is a static
regression check, not a full proof of control flow or domain object isolation.
The messaging self-service availability and notification preference routes use
the authenticated membership ID. Availability writes additionally enforce
agent eligibility in the domain.

The Admin chart emits CSS as React style text rather than an HTML sink. Color
values already reject CSS rule delimiters, HTML delimiters, comments, URL
functions, and expression syntax. Chart IDs and color keys now require valid
identifier characters; invalid caller IDs fall back to React's generated ID.
The chart's `data-chart` attribute cannot be overridden by forwarded props.

The release checker reads current Product Completion V2 state and focus files,
reports missing artifacts without throwing, and separates repository validation
from pending product, environment, and human approval gates. It does not invoke
Docker or demand a clean working tree for repository validation. Staging Compose
configuration validation remains an explicit deployment requirement. The secret
scanner no longer exempts the obsolete implementation status document.

## Verification

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Pass |
| `pnpm build` | Pass after adding Suspense around `/sizing/attention` search parameters; Admin, Storefront, and backend build steps completed. |
| Messaging database test file | 19 tests passed, including the new authorization regression. |
| Focused API route tests | 5 files, 13 tests passed. |
| Chart CSS test | 1 test passed with CSS and HTML injection strings. |
| Hardening route scanner tests | 2 tests passed; an untracked unguarded route probe was detected and removed. |
| Hardening, secrets, architecture | Passed. Hardening covered 635 Admin handlers in 52 route modules. |
| Production dependency audit | No known high severity vulnerabilities reported. |
| Focused ESLint and `git diff --check` | Passed. |
| Release checker | Repository mode exited 0 with deployment pending; strict mode exited 1. An isolated empty-directory probe reported missing artifacts and exited 1 without crashing. |

The pre-deployment rerun passed all 33 focused Vitest tests across seven files,
both hardening scanner tests, typecheck, secrets, hardening, release repository
validation, and the production build. Strict deployment readiness remains
pending on 17 recorded requirements, including shared database compatibility.

The first build failed at `/sizing/attention` because `useSearchParams` lacked a
Suspense boundary. The corrected page passed the production build. No staging
service, VPS, production account, schema migration, or database reset was used.

Deployment remains pending: the Product Completion V2 state records sizing owner
acceptance, the customer-controlled identity challenge, authenticated UI and
accessibility review, live Meta acceptance, persistent schema backup and restore,
privacy/legal and secure delivery approval, and representative volume performance
as open gates. Compose configuration in the target environment, the operator UAT
checklist and sign-off, provider certification, remote encrypted backup, external
alert delivery, and an approved release Git state also remain to be evidenced.

## Shared staging database compatibility

The checked-in migration registry includes sizing migrations `0300` and `0301`
and messaging migrations `3200` through `3202`. The current `0300_sizing`
definition was expanded after its earlier introduction, and the current
`3200_messaging_core` definition gained CRM identity tables after its earlier
version. If either migration name was already recorded as applied on the shared
VPS, its newer baseline SQL will not be replayed there by the migration runner.
That could leave the deployed schema missing columns, tables, constraints, or
indexes expected by current code. The target's applied migration names and
actual schema are unknown, so compatibility is **unverified**. No migration
source or database was changed for this audit.

For staging, record the target migration ledger and schema read-only, compare
them with the exact release commit, and prepare forward-only reconciliation for
any differences. Rehearse it on an isolated copy with a verified restore path;
deploy an immutable application revision only after that review and the
remaining acceptance gates close. Do not run the mutable development baseline
against the shared VPS merely because local repository checks pass.
