# Phase 09A.4 lint register

2026-11-10, Asia/Dhaka. Baseline `main` / `cf68b53ddbb3321f03570e0b66a627914c1db674` plus the preserved09A.3 worktree. Full supported `pnpm lint --format json --output-file .../lint-before.json` reproduced **778 errors, zero warnings,180 files**. The same supported command after remediation returned **zero errors/warnings**. The final verification ledger records a further full ESLint execution against the final source.

Every original diagnostic has its actual file, line, column, rule, severity, message, category, source/test/tooling scope, security sensitivity, correction/risk, verification reference, outcome and owning package in [lint-inventory.json](phase09a4-evidence/lint-inventory.json). [Raw baseline](phase09a4-evidence/lint-before.json), [after inventory](phase09a4-evidence/lint-after.json) and [effective rule/plugin configurations](phase09a4-evidence/lint-config.json) support the classification. Source text is omitted from the sanitized baseline diagnostic artifact. No lint configuration, severity or ignore pattern was changed.

| Actual rule | Before | After | Classification and correction |
|---|---:|---:|---|
|`@typescript-eslint/no-unused-vars`|731|0|679 import bindings plus52 other unused names. Review TypeScript AST scope; remove unused imports, dead pure calculations/helpers and ignored internal props; omit unused destructured values while retaining required hook calls, callback/public contracts and effectful fixture operations. Display meaningful stored errors instead of discarding them.|
|`@typescript-eslint/no-explicit-any`|40|0|Use actual TypeBox query schemas, shared DTOs, domain unions, Base UI render-prop contracts, React element props, guarded unknown audit data and explicitly bounded route-test mocks.|
|`no-unsafe-finally`|1|0|Refresh button guards mounted-state updates without returning from `finally`.|
|`@typescript-eslint/consistent-type-imports`|1|0|Scratch tool imports DatabaseSchema as a type; the tool itself is not executed.|
|`@next/next/no-img-element` unknown rule|1|0|Remove stale inline suppression for a plugin not configured in this repository. No image rendering or rule configuration changed.|
|`no-control-regex`|1|0|Replace intentional sanitizer control-character regex with an equivalent code-point filter; preserve NFC, permitted tab/LF/CR, Bangla/emoji and tag stripping. Exhaustive ASCII assertions protect equivalence.|
|`no-regex-spaces`|1|0|Release registry parser expresses its exact two leading spaces with `{2}`; manifest/tooling tests retain behavior.|
|`no-undef`|2|0|Explicitly import Node console in the existing root diagnostic script. Do not execute its HTTP mutation.|

| Package | Before | After |
|---|---:|---:|
|Admin|706|0|
|API|18|0|
|Storefront|8|0|
|Database|43|0|
|Root/tooling|3|0|

Original scope classification:731 production-source diagnostics,43 test diagnostics and4 script/tooling diagnostics. These scope counts are independent of rule counts. ESLint9.39.5 / TypeScript5.9.3 / typescript-eslint8.67.0; effective rules are recorded, not guessed. The active configuration does not provide a comprehensive type-aware async/React Hooks/accessibility audit; absence of such diagnostics is not proof those entire categories are defect-free.

## Safety and behavior review

| Boundary / finding | Correction | Risk and evidence |
|---|---|---|
|Auth/IAM imports and unused `resolveActor` helper|Remove only unused imports/private helper; retain active `resolveActorContext`, realm/session, membership/capability and2FA operations.|No guard bypass, new privilege or identity shortcut. Real-session Shopper, Admin boundary and IAM selection retained.|
|Payments/Finance/Inventory/Checkout imports and dead values|Remove unused names and unrendered derived values; retain effectful fixture creation and authoritative calculations.|No new Number conversion, changed financial equation, SQL transaction boundary, semantic operation, policy resolver, outbox emission or idempotency behavior.|
|Procurement list query sort casts|`Static<typeof list...QuerySchema>` supplies validated query unions; remove sortBy/sortOrder `as any`.|Existing Fastify schema validation, authorization and server pagination unchanged.|
|Order/Team dialog trigger casts|Use the actual `DialogTrigger` render prop type; preserve custom trigger/fallback behavior.|Typecheck/build and existing UI selection; no financial action/permission change.|
|Select/Breadcrumb and controlled enums|Use React element/element-type contracts and existing state unions; no arbitrary `any` props.|No new control implementation, CSS system or feature workflow.|
|Integrity filter and tab callbacks|Key/value-correlated filter type and existing `IntegrityTab`; retain generic context and server checks.|No widening of authority; types describe actual controls.|
|Team audit projection|Treat diff values as unknown, accept only string capability arrays and status labels.|Malformed JSON cannot be blindly rendered as a React child. Unknown evidence does not grant authority.|
|Stored errors ignored by UI|Six analytics/email/notification workspaces now use shared ErrorState for seven previously hidden error values.|Visible recoverable failure instead of silently retaining an error. Existing request/data/auth behavior unchanged.|
|Review rebuild result field mismatch hidden by `any`|Use shared ProductRatingSummaryDto and actual `ratingCount` / `verifiedReviewCount` fields.|Corrects undefined/false-zero displayed counts; no review or money mutation is added.|
|Review withdrawal audit failure found by added tests|Omit actorId for existing SYSTEM audit classification; retain a real supplied USER UUID.|Previously the literal `system` failed UUID insertion and rolled back withdrawal. Matching token/tenant checks, aggregate rebuild, audit and outbox remain in one transaction. Test verifies actual SYSTEM/null audit row.|
|Review test/fixture debt exposed by expansion|Assert actual paginated `.items`, explicitly request ALL for an approved review, alias SQL customer/order-line IDs correctly, and assert inert script text is preserved after tags are removed.|No tenant assertion removed. Public foreign items remain empty; own approved ID must match; duplicate-review conflict and real withdrawal assertions remain. Sanitization is plain-text preparation, not HTML execution.|
|Cycle seed mocks|Throw if unexpectedly executed rather than cast an empty object to a result.|Strengthens unreachable-fixture expectation without weakening cycle assertions.|
|Route/UI test casts|Use actual DTO fields; route-denial tests use deliberately partial typed mock boundaries and deny before persistence.|No new privileges, skipped tests or trivial success assertions.|

Import proposals were inspected as an import-only batch; each write checked its pre-edit hash to avoid overwriting concurrent source changes. Other edits stayed focused on diagnosed responsibilities. Existing09A.3 fixes, unrelated skill files and development declarations remain preserved. No historical migration was edited.

## Remaining findings

**No remaining ESLint findings** in the completed full lint execution. There is no remaining lint owner queue to conceal or exclude. This does not close the following distinct gates:

- Full `pnpm format:check` failed with1,141 reported files initially and1,129 in the later recorded check, including unrelated tracked files/earlier dirty work and touched files. Ten critical files pass focused formatting. No indiscriminate repository formatting was run; formatting is not silently relabeled as lint PASS.
- Browser owner transitions are NOT VERIFIED at that layer. The prior automatic runtime rejection was respected; see the [permitted-environment plan](phase09a4-evidence/browser-acceptance-plan.md).
- Human AT/native zoom/devices, Linux CI/deployed HTTPS, immutable candidate/target compatibility and financial/business/provider approvals remain open.

Counts from focused probes, initial runs and final expanded regression overlap. Use the [verification ledger](phase09a4-evidence/verification.json) and [implementation report](PHASE_09A4_IMPLEMENTATION_REPORT.md) for the actual accepted source snapshot and results; never add them together.
