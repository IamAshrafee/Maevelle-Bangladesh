# Phase 09A.5 formatting register

2026-11-11, Asia/Dhaka. **Full formatting FAIL; controlled remediation and prevention policy implemented.** Actual supported command: `pnpm format:check`, exit1 before and after. Prettier3.9.6. The current formatter/ignore/EditorConfig/Git attributes were inspected and preserved.

Baseline:1,129 reported files. After:1,121. [Machine inventory](phase09a5-evidence/format-inventory.json) records every original path, package, tracked/dirty/phase state, authored/generated classification, ownership, risk/embedded-text flags, before hash, correction/outcome, verification and remaining action. Categories overlap; package totals do not. Original/current paths and actual command output remain in `format-before.log` / `format-after.log`.

| Package | Before | Remaining |
|---|---:|---:|
|Admin|575|573|
|API|75|74|
|Storefront|148|145|
|Worker|9|9|
|Database|196|196|
|Contracts|10|10|
|Core|5|5|
|Media|12|12|
|Config|1|1|
|Root/tooling|98|96|
|Total|1129|1121|

The original list includes172 phase-commit/dirty-WIP paths,81 commerce/security-sensitive paths,97 test/fixture paths,57 CI/operation paths,20 Markdown paths and37 historical migration-material failures.704 files contain template literals needing preservation review. These are descriptive overlapping groups, not independent defect totals. Generated Next/build outputs, docs, skills and named externally managed files are already outside the configured check; no new exclusion was added. Unrelated dirty skill/lock/declaration work was not selected.

## Applied proposals

Every candidate had a pre-edit hash, Prettier proposal, diff preview and emitted-JavaScript/template preservation assessment. All candidate hashes were rechecked immediately before writing. No functional domain change was introduced by these proposals.

| File | Outcome / verification |
|---|---|
|`apps/admin/components/finance-console.tsx`|Formatted; emitted syntax and template chunks unchanged.|
|`apps/admin/components/finance/set-opening-balance-dialog.tsx`|Formatted; monetary strings, values and semantic operation unchanged.|
|`apps/api/src/shopper-auth.test.ts`|Formatted; exact requests, denial assertions, realm boundaries and fixture values unchanged.|
|`apps/storefront/features/checkout/components/checkout-contact-section.tsx`|Formatted; labels/validation/handlers unchanged.|
|`apps/storefront/features/checkout/components/checkout-header.tsx`|Formatted; links, breadcrumb semantics and conditional rendering unchanged.|
|`apps/storefront/features/checkout/components/checkout-order-summary.tsx`|Formatted; money values/calculation calls/authority unchanged.|
|`scripts/release/manifest.mjs`|Formatted; release parser/manifest strings and syntax unchanged. No publication operation executed.|
|`package.json`|Formatted while adding explicit regression-gate/policy-test scripts. This is a deliberate tooling change, not a formatting-only claim. Dependencies/versions unchanged.|

[Sanitized proposal results](phase09a5-evidence/format-proposals.json) contain before/after hashes and guard outcomes; full source/fixture secret values are not copied into that artifact. The final regression/type/lint/build ledger verifies the resulting source. Full migration/security checks remain independent of formatter comparison.

## Deferred guard rejections

`apps/admin/components/analytics/views/finance-view.tsx`, `apps/admin/components/security/authenticator-setup-wizard.tsx` and `apps/storefront/features/checkout/components/checkout-confirmed-step.tsx` preserved template chunks but did not produce identical emitted JSX syntax under the conservative comparison. They were **not written**. A failed comparison is not proof of a production bug, and no functional correction was invented to force formatting acceptance. Owners must inspect the compiled child/whitespace difference and proposed UI impact in a separate batch.

## Remaining debt and future enforcement

All1,121 remaining failures are frozen by path and canonical-EOL content fingerprint in [tooling/format-debt-baseline.json](../../../tooling/format-debt-baseline.json). Historical75 migration sources plus the accepted migration-history manifest are protected independently. New/changed unformatted content fails the new gate; existing debt does not disappear from the full check. Configuration fingerprints prevent unnoticed policy drift. The baseline has no automatic refresh command.

See [formatting policy](../../formatting-policy.md) for developer/editor workflow, removal of resolved entries, CI meaning and limits. The existing CircleCI validation still gates publication; no external CI/publishing action occurred. Remaining module rewrites need separately scoped review, with special care for SQL, templates, fixtures, manifests, shell commands and immutable history. This phase does not create an uncontrolled thousand-file source diff.
