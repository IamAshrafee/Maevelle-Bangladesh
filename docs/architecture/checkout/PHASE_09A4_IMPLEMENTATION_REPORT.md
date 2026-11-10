# Phase 09A.4 implementation report

2026-11-10, Asia/Dhaka. **PARTIAL locally; repository lint closure achieved; release/financial activation BLOCKED.** No commit, push, publication, deployment, persistent migration, VPS change, real financial/provider operation or live marketing activation occurred.

## Repository baseline and preservation

Actual branch/HEAD: `main`, `cf68b53ddbb3321f03570e0b66a627914c1db674`. The09A.3 edits/reports/evidence/verifier were uncommitted on entry; they were preserved, as were unrelated skill/rule changes, `skills-lock.json`, untracked frontend skill files and development Next declarations. [Entry identity/status](phase09a4-evidence/entry.json) records the actual tracked/untracked tree and file hashes before remediation. No reset, stash, force-checkout, shared cleanup or old-commit restoration occurred.

The final runner captures before/after HEAD and SHA-256 per executable source/config file plus combined digest. Final source digest is `108283ba5131469c95ceaf00109019dff7acfe77904a176462ff774784b1814a`; confirm its completed after snapshot in [verification.json](phase09a4-evidence/verification.json). Coverage includes applications/packages/scripts/tooling/CI/config and the touched root diagnostic script. Documentation/evidence, unrelated skill files and generated Next declarations are outside that executable digest. The runner preserves the declaration bytes around builds. No immutable candidate is inferred from a dirty source snapshot.

An early09A.4 run reused the previous69-file selection;646 cases and both builds passed, but planned verifier expansion/scoped formatting changed source during execution. Its `sourceUnchanged=false` is retained in `initial-verification.json`, with `initial-broad.json`; it is not accepted as the final source baseline. Final expanded verification reruns affected source together after edits stop. No external product-source/HEAD modification was observed; all actual edits remain reviewable.

## Full lint inventory and remediation

Supported full command reproduced **778 errors /0 warnings across180 files**. All original diagnostics are classified individually in [lint-inventory.json](phase09a4-evidence/lint-inventory.json); rule configuration/plugin metadata, raw sanitized before/after diagnostics and before/after package/rule totals accompany the [lint register](PHASE_09A4_LINT_REGISTER.md). No package/rule severity/ignore pattern was changed and no blanket suppression was added.

Before by rule:731 unused names;40 explicit-any; one each unsafe-finally, consistent-type-import, unknown Next image rule, control-character regex and regex-space; two undefined-console findings. Before by package: Admin706, API18, Storefront8, Database43, root/tooling3. Original production/test/script scopes were731/43/4 respectively; these are not rule counts. Current full lint after corrections returns **zero errors/warnings**.

The import batch removed679 diagnosed bindings. Hash-checked proposals ensured a concurrent file would not be overwritten. Remaining unused names were inspected by responsibility: dead pure calculations/private helper removed; real effectful fixture creation preserved; unused hook reads omitted or hooks retained; callback types retained where still public. The unused DesignSystemView hideHeader argument had no callers supplying it and was removed rather than inventing a new visual behavior. No repository-wide formatting write was run. Scoped import formatting and selected critical-file formatting followed the edits.

Types now describe real boundaries: TypeBox query unions for procurement sorting; Base UI trigger render props; current enum state types; correlated Integrity filter key/value callbacks; actual shared rating-summary DTO; typed SQL media projection; React element/element-type contracts; guarded unknown audit diffs; valid DTO test fixtures. Denial-only route mocks retain an explicit partial test boundary rather than `any`; no persistence success or extra permission is fabricated.

Correctness findings:

- Refresh button no longer returns from `finally`; mounted-state checks only guard UI updates, preserving cleanup/error completion semantics.
- Seven hidden error values across six analytics/email/notification workspaces now render the existing shared ErrorState. No new global CSS, control or UI system was introduced.
- Review rebuild results now read actual `ratingCount` and `verifiedReviewCount` instead of undefined legacy names/false zero. The shared DTO exposes the mismatch at compile time.
- Team audit capability/status values are narrowed before use; arbitrary JSON objects are not blindly treated as string arrays or rendered children.
- Review sanitizer's intentional forbidden-control set is expressed without a control-character regex. All128 ASCII code points, allowed tab/LF/CR and Bangla/emoji preservation are asserted. Plain-text tag stripping still preserves inert script body text; it does not execute/render HTML.
- Added Reviews tests exposed a pre-existing rollback defect: customer withdrawal inserted literal `system` into a UUID audit actor column. SYSTEM audit events now omit actorId; real USER actor UUIDs are unchanged. Ownership checks, aggregate rebuild, audit/outbox and transaction boundary are preserved. Test checks the actual SYSTEM/null event.
- Newly included Reviews assertions/fixtures were outdated: collections have paginated `.items`, approved reviews are absent from the default pending queue, and SQL customer/order-line selections lacked the aliases read by fixtures. Tests now verify actual contracts, including the exact owned approved ID and foreign empty items. No tenant denial was replaced by a trivial success assertion. Seed-cycle mocks now throw if unexpectedly executed.

## Authentication, money and operational preservation

Shopper-only Admin requests retain401/AUTH_REQUIRED; authenticated insufficient-capability requests retain their403 contract. No session check, cookie realm, organization selection, capability revocation,2FA boundary, private rendering, guest/account partition, guest Order grant, privacy subject or stale-owner fence was weakened. Existing09A.3 Auth/Wishlist regression fixes remain included. Request-local server access checks and private/no-store responses remain authoritative; frontend abort is not authorization.

Unused Auth/IAM helpers/imports are distinct from active authority: `resolveActorContext` and its actual membership/session operations remain. Money/settlement changes are limited to unused imports/dead unrendered values; no authoritative financial equation, rounding method, Number conversion, transaction/idempotency boundary, Inventory operation or Payment/Finance/outbox emission was introduced or altered.

Original81, actual cash80, separate authorized adjustment1 and customer due0 retain SETTLED_WITH_ADJUSTMENT alongside cash-based PARTIALLY_PAID. Waiver is not cash, refundable funds, courier remittance or another conversion. Retail exact string presentation, historical fractions/internal costs, final server payable and explicit rounding remain. Real cash-shortfall application is still POLICY_BLOCKED regardless of stored proposal approval. The memorandum remains non-cash operational evidence, not a completed receivables/general-ledger write-off.

No Catalog writer policy changed. The previous [writer matrix](phase09a3-evidence/catalog-writers.md), including direct Catalog create/workspace-save bypasses, remains valid. No persistent records were normalized and integer-only authoring remains approval-gated. Owner/qualified tax/Finance/courier/provider decisions in the09A.1 register are unchanged.

## Verification and source identity

The nonpublishing `scripts/checkout-phase09a4-verify.mjs` requires explicit assignment-owned loopback55440/maevelle_test and `CHECKOUT_RC_LOCAL_ALLOW=1`. It does not load repository credentials, publish images or deploy. [Toolchain](phase09a4-evidence/toolchain.json): Node24.14.1, pnpm11.19.0, TypeScript5.9.3, ESLint9.39.5, typescript-eslint8.67.0, Vitest5.0.5, Next16.4.2, React19.2.8, Better Auth1.7.12, pg8.23.0, Kysely0.29.5; PostgreSQL18.3 Linux container with Windows application/test processes. Dependencies were not changed.

| Verification | Actual evidence / limit |
|---|---|
|Lint baseline/after|Supported full pnpm command:778/0 then0/0 errors/warnings; further final full ESLint in ledger.|
|Initial focused probe|17 pass /6 fail across23 cases; six Reviews failures classified above. This is not final acceptance.|
|Reviews correction|8/8 pass in `reviews-verified.json`; intermediate probes include the new audit assertion's wrong schema name, corrected to owning `audit.audit_events` before final verification.|
|Early09A.4 checkpoint|646 cases/69 files pass; source drifted during planned work, explicitly non-final. Both builds completed; counts are not added to later runs.|
|Expanded probe before fixture corrections|799 pass/7 fail/0 skip across806 cases/83 files,227.765s, matching digest `fb58fc8c13be92dcdcc935a776b0524e2a82821816e02978e79f8c3d238c923d`. Retained separately in `expanded-before-corrections.json` and its verification ledger; superseded after correction.|
|Affected expanded-suite recheck|62/62 IAM/Procurement/seed cases pass; overlaps final selection.|
|Final expanded selection|806/806 cases across83 files,0 failures/skips,228.807s, matching before/after source digest. All per-file cases in `broad.json`; exact command/exit/hashes in final ledger. Includes previous646 selection plus affected UI/API/Reviews/IAM/Orders/Procurement/Inventory/Catalog/seed suites.|
|Types/builds|Backend build types, test-inclusive types and both production UI builds have separate exit/log evidence. Preview remains false.|
|Migration/security|75 registered/51 immutable migrations, tail3226 unchanged; fresh schema,24 populated upgrades;28 tooling cases including tamper/scanner tests; secrets, architecture and hardening checks.|
|Pool lifecycle|All three bounded cases pass in broad, plus three concurrent processes each pass the same three cases: saturation/no hidden queued write, stalled cold handshake/queue cleanup, real cancellation/recovery/no idle transaction. Nine repeated stress outcomes are not added as distinct cases. No production timeout/retry changed.|
|Formatting/whitespace|Full `pnpm format:check` FAIL:1,141 files before scoped formatting and1,129 in the later recorded check. Ten critical edited files pass focused Prettier check. No global write; whitespace checked separately. These are distinct formatting checkpoints, not lint failures.|
|Browser|NOT VERIFIED for all15 new owner/security journeys; no startup restriction bypass or fabricated observation.|

Only a newly created container `maevelle-phase09a4-pg` (loopback55440) and disposable synthetic databases are used. Credentials/tokens are omitted from ledgers. Cleanup targets only assignment-owned resources, preserving unrelated processes/containers/volumes. Fresh/upgrade migrations are local fixture operations, not persistent environment migrations. Final source matching, preserved unrelated file/migration hashes and cleanup are recorded in completion evidence.

### Seven expanded-probe failures and resolution

All were in newly added suites, not silent exclusions from the previous646 selection. No production rule or fixture privilege was relaxed.

| Actual test | Error / source cause | Correction |
|---|---|---|
|IAM: records an audit event when owner membership is created at bootstrap|`relation platform.audit_events does not exist`; assertion also used obsolete `event_name`. Actual bootstrap writer inserts `audit.audit_events.action`.|Read the owning schema/action and retain the actual owner-created-event assertion.|
|Procurement: records shipment departure and only allows planned shipments to cancel|Event chronology expected PLANNED before a fixed2026-11-01 event, which is now earlier than test creation. Actual query sorts by occurred_at/id.|Choose event time exactly1s after the actual planned milestone. Preserve ordering, version and cancellation constraints.|
|Seed: complete hierarchical taxonomy|Expected7 roots/44 categories; current canonical data includes8 roots/49 categories.|Inspected seed data, including Shoes/Home additions; assert concrete8/49 and retain parent/child checks.|
|Seed: categories strictly idempotent|Expected44 created/unchanged rows.|Assert49 consistently across repeated runs and actual database count. No idempotency assertion removed.|
|Seed: rich products/media/inventory|Expected completed URL-backed media objects; migration3205 and current registerUrlMedia instead create pending owned-byte import jobs.|Assert attached source URL, PENDING job and null current object. Do not download externally or fabricate READY media. Inventory/variant/price checks remain.|
|Seed: targeted Product Types dependencies|Expected23; canonical data has25 types.|Inspected Cup or Mug/High-Heel Sandal entries and assert concrete25; retain dependency ordering.|
|Seed: comprehensive transaction|Expected44 categories/23 types.|Assert49/25 while retaining148 attributes and all other domain/database counts.|

## Browser and release limits

Inspected existing runtime/CDP harnesses and the nonpublishing CI runner. The browser driver assumes actual Next apps; it supplies no separately permitted startup pathway for the earlier rejected isolated runtime. No alternative shell, wrapper, impersonation, policy modification or synthetic fixture attachment to another app was attempted. No new browser startup denial or success is fabricated. All15 journeys remain NOT VERIFIED at that layer; [exact permitted-environment plan](phase09a4-evidence/browser-acceptance-plan.md) separates frontend privacy and backend authority checks.

Human assistive technology, native zoom, physical devices/iPad, real browser cache/history/resume, Linux CI, deployed HTTPS/ingress/cookies, compatible immutable images, actual staging migration/rollback/restore, successful public Checkout and real provider/courier approval remain open. Existing validation still gates CircleCI publication; no workflow publication/deployment was triggered. Lint green is not permission to activate any blocked capability.

## Thirty-eight independent outcomes

|#|Outcome|Verdict|Evidence / remaining limit|
|---|---|---|---|
|1|Actual Git state|PASS|Entry status/hashes and current main/HEAD.|
|2|Concurrent work preserved|PASS|Hash-checked edits; no shared reset/discard.|
|3|Full lint baseline reproduced|PASS|778 errors/0 warnings on current entry source.|
|4|Every diagnostic classified|PASS|Machine inventory with file/rule/category/scope/risk/owner.|
|5|Security-critical findings addressed|PASS|Control flow/types/audit/sanitizer corrections; no blanket security certification.|
|6|Auth lint corrected securely|PASS|No guard/session/capability change.|
|7|Checkout/Finance/Payments lint|PASS|Unused names/type contracts; authoritative money unchanged.|
|8|Privacy/Worker preservation|PASS|No weakening; current regression selection retained.|
|9|Real frontend issues addressed|PASS|Hidden errors, result fields and guarded audit data.|
|10|Tests/tooling corrected meaningfully|PASS|Typed fixtures, preserved tenant assertions, no skips.|
|11|Remaining lint reported exactly|PASS|Zero after full lint.|
|12|Repository-wide lint|PASS|Actual full command success; no rule/ignore changes.|
|13|Shopper/Auth baseline|PASS|Current806-case selection includes real-session Auth lifecycle; no earlier run substituted.|
|14|Wishlist ownership|PARTIAL|API/controller tests; full browser transitions unverified.|
|15|Admin guards/capabilities|PASS|Current guard/proxy/API/IAM tests; browser/cache acceptance remains a separate gate.|
|16|Guest Checkout/Order grants|PASS|Current authority/expiry regression preserved; no cross-device recovery authority added.|
|17|Whole-taka exactness|PASS|Current money/placement outcomes; policy approval separate.|
|18|Historical fractions|PASS|No normalization; exact format/transport tests retained.|
|19|Cash separate from waiver|PASS|No financial change; settlement tests retained.|
|20|Refund/courier reconciliation|PARTIAL|Existing operational coverage; approved allocation/remitted correction gaps remain.|
|21|Activation blocked|PASS|Resolver unchanged; real route rejection retained.|
|22|No fabricated financial/conversion event|PASS|No new emission or success fallback.|
|23|Runtime policy respected|PASS|No bypass attempt or unrelated runtime attachment.|
|24|Actual browser owner transitions|NOT VERIFIED|No permitted Next startup pathway established.|
|25|Unexecuted journeys explicit|PASS|15-row browser plan with separate layers.|
|26|Bounded pool lifecycle|PASS|Three current pool cases plus concurrent three-process recheck.|
|27|Current broad checkpoint|PASS|806 cases/83 files,0 failed/skipped, matching source hashes.|
|28|Both UI builds|PASS|Actual final Storefront/Admin exits0.|
|29|Backend/test-inclusive types|PASS|Actual final independent type-check exits0.|
|30|Migration/upgrades|PASS|75/51 history, fresh and24 upgrades locally.|
|31|Secrets/hardening|PASS|Unchanged detectors and self-tests locally.|
|32|Historical migrations unchanged|PASS|No schema or immutable history edits.|
|33|Final source identity|PASS|Final before/after digest matches; early drift excluded.|
|34|No live activation|PASS|Public purchase/collection/waiver/provider/marketing gates closed.|
|35|No persistent migration/deploy|PASS|Owned disposable resources only.|
|36|No commit/push/publication|PASS|No Git publication/release operations.|
|37|Release gates accurate|PASS|Scoped local evidence; external/human/runtime approvals remain.|
|38|Report/register/handoff|PASS|Separate lint, format, browser, policy and deployment gates.|

See [lint register](PHASE_09A4_LINT_REGISTER.md), [release register](PHASE_09_RELEASE_READINESS_REGISTER.md) and [next-stage handoff](PHASE_09A4_NEXT_STAGE_HANDOFF.md). No earlier phase is promoted to overall PASS by these local technical corrections.
