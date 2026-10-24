# Phase 10 omnichannel messaging assurance audit

**Audit date:** 2026-10-24

**Verified implementation commit:** `16f648a`

**Channels:** Website chat, Facebook Messenger, Instagram Direct, unified Admin inbox

**Production release verdict:** **NO-GO**

**Local engineering disposition:** Ready for controlled acceptance after the release blockers below are closed.

## Executive finding

The reviewed local implementation is materially stronger than the earlier Phase 10 record claimed. The audit fixed stale-worker write races, ambiguous outbound-delivery recovery, staff attachment provenance, conversation-switching client races, Storefront uncertain-send duplication, dependency vulnerabilities, test-runner compatibility, authentication schema validation, and the default inbox query plan. Focused tests, typechecking, architecture checks, secret scanning, dependency auditing, and production builds pass.

This is not evidence of production readiness. No production system or Meta asset was accessed or changed. The actual deployment schema and migration history were not inventoried, backup/restore was not rehearsed, authenticated browser and accessibility acceptance was not completed, repository-wide lint and hardening gates are not green, and live Meta delivery/read/echo flows were not exercised. Those are release blockers, so the prior `CONDITIONAL GO` and “100% verified” claims are withdrawn.

## Scope and evidence boundaries

- Source, migrations, tests, package graph, and local PostgreSQL 18 were inspected at the current Git state.
- A fresh disposable database was built through migration `3202`.
- A detached Phase 9 fixture at commit `f72d8d4` was migrated through its historical `3200`, then upgraded with current `3201` and `3202`. Its schema matched the fresh current schema after removing `pg_dump`'s random guard tokens.
- This proves the checked-in Phase 9 baseline upgrade path. It does **not** prove compatibility with an unknown production or staging schema.
- A separate performance fixture contained 5,000 conversations and 25,000 messages. The default inbox query improved from about 1.031 ms with a sequential scan/top-N sort to about 0.085 ms with an index scan after `conversations_activity` was added. These are local fixture measurements, not production capacity claims.
- Shared development and test databases were not used for the migration or performance evidence.

## Verified remediation

| Severity | Finding | Resolution/evidence |
|---|---|---|
| P1 | A worker could transmit to Meta and lose the acknowledgement, allowing an unsafe retry or an unresolved `UNKNOWN` delivery. | Ambiguous post-send outcomes are fenced for reconciliation; late echoes and receipts can resolve them and publish realtime/outbox changes. |
| P1 | Expired provider-event and Facebook/Instagram sync leases allowed a stale worker to overwrite a newer claim. | Completion, advance, and failure writes now require the current lease owner; provider events also fence on attempt count. A database test proves stale writes are rejected. |
| P1 | Staff sends could reference a private media asset ID without proving actor/conversation upload provenance. | Staff attachment uploads are registered and bound to organization, actor, conversation, expiry, and readiness before attachment. |
| P1 | Admin conversation changes and late async responses could contaminate another transcript; double-submit and IME composition could duplicate sends. | Conversation-scoped state and request fencing were added, with submit/composition guards. |
| P1 | Storefront could retain an editable draft after an uncertain request while also owning a retryable pending message with a different future idempotency key. | Composer outcomes now distinguish `not-queued`, `pending`, and `accepted`; both pending and accepted ownership clear the original draft. |
| P1 | The default inbox activity ordering could not use the existing status-oriented index. | Migration `3202_messaging_performance` adds `(organization_id, coalesce(last_message_at, created_at) desc, id desc)` for existing installs and the mutable baseline includes it for clean databases. |
| P2 | Better Auth 1.7 schema validation did not know about the trigger-managed required `email_normalized` column. | The field is declared as non-input/non-returned additional schema metadata. |
| P2 | Vitest 5 could not resolve extensionless `@/` imports through the old custom alias resolver. | A pre-resolution plugin now delegates resolved app paths back to Vite. |
| P2 | The Admin production build lacked the tracked `shadcn` package required by the global stylesheet import. | Stable `shadcn` was restored and the Admin build passed. |
| P2 | Production dependency audit reported vulnerable transitive packages. | Stable direct dependencies and scoped overrides were updated; the production audit now reports no known vulnerabilities. |

Inbound Meta media fetches were also verified to require HTTPS, validate redirect destinations, reject private/reserved address ranges after DNS resolution, and enforce response size and content constraints. Unknown Page/account webhook events are dropped rather than assigned to a tenant.

## Known residual quality debt

The static frontend review also identified non-P1 work that should be resolved during the authenticated acceptance pass: the attachment lightbox needs explicit Escape/focus-return verification, long-lived realtime timers and debounce cleanup need browser-level observation, browser-history/URL restoration is limited, and historical-sync progress/count presentation needs operator validation against real provider responses. These do not change the current verdict—the larger acceptance gate is already blocking release—but they must not be silently treated as complete.

## Verification record

| Check | Result |
|---|---|
| Consolidated messaging/auth tests against the fresh disposable database | **PASS:** 13 files, 72 tests |
| Targeted ESLint for all files changed in commit `16f648a` | **PASS** |
| `pnpm typecheck` | **PASS** |
| `pnpm check:architecture` | **PASS:** 13 workspace packages |
| `pnpm check:secrets` | **PASS** |
| `pnpm check:dependencies` / production audit | **PASS:** no known vulnerabilities |
| Peer dependency check | **PASS** |
| Admin production build (Next.js 16.4.2) | **PASS**, including `/messaging` |
| Storefront production build | **PASS** |
| API build | **PASS** |
| Worker build-mode TypeScript compilation | **PASS** |
| Fresh migration through `3202` | **PASS** |
| Checked-in Phase 9 fixture upgrade through `3202` and schema comparison | **PASS**, scoped as described above |
| Repository-wide `pnpm lint` | **FAIL:** 813 existing errors across the repository; focused changed-file lint passes |
| `pnpm check:hardening` | **FAIL:** reports an Admin chart HTML sink plus many authorization-boundary findings; messaging routes use capability authentication but the scanner does not recognize that helper. The gate requires review/baselining and cannot be recorded as green. |
| Authenticated browser, responsive, keyboard, screen-reader, and owner visual acceptance | **NOT RUN** |
| Live Meta ingress, egress, delivery, read, echo, reconnect, and token-expiry acceptance | **NOT RUN** |
| Production schema inventory and backup/restore rehearsal | **NOT RUN** |

The database test command initially failed because an incorrect local password was supplied. It was rerun with the configured disposable-database credential and passed 13/13 files and 72/72 tests. The failed invocation is an audit-environment error, not omitted evidence.

## Meta integration review

The repository currently pins Facebook and Instagram Graph API version `v26.0`; the prior audit's `v22.0` statement was stale. Current official Meta Postman documentation was rechecked for Messenger Send API and Instagram messaging prerequisites. The implementation still needs real-asset confirmation of Page tasks, `pages_messaging`, Instagram professional-account linkage and message-management permission, recipient-initiated policy eligibility, token lifecycle, and subscribed webhook fields.

Official references:

- [Meta Messenger Platform Send API](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api)
- [Meta Instagram API documentation](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)

## Production release blockers

1. Inventory the target environment's `platform.schema_migrations` and actual messaging schema; take and verify a restorable backup before applying anything.
2. Rehearse the exact target-schema upgrade in an isolated clone and compare constraints, indexes, grants, and data invariants.
3. Resolve or explicitly baseline every repository hardening finding, including the chart HTML sink, and establish an approved repository-wide lint baseline.
4. Complete authenticated Admin and Storefront browser acceptance at mobile, tablet, intermediate, and desktop widths, including keyboard, focus, screen-reader, reduced-motion, reconnect, pagination, attachment, failure, and recovery paths.
5. Complete owner-controlled Meta App Review/permissions, credential and account linkage, then exercise signed webhooks at `/webhooks/meta/messenger` and `/webhooks/meta/instagram` plus outbound send, echo, delivery, read, retry, token expiry, and reconnect flows.
6. Obtain owner review and record the evidence before changing the verdict.

No P0 defect is known in the locally reviewed messaging code. That statement is not a guarantee that none exists, and it does not override the unclosed release gates.

## Cutover decision rule

Keep the verdict at **NO-GO** until every blocker above has current evidence. If the target-schema rehearsal, hardening review, authenticated UI/accessibility pass, and live Meta acceptance all succeed without an unresolved P0/P1, the owner may promote the system to GO through a new dated release record. Do not infer GO from this audit or from the passing focused suite alone.
