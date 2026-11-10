# Phase 09A.5 implementation report

2026-11-11, Asia/Dhaka. **Overall PARTIAL; local review package only.** Full formatting remains FAIL. Public Checkout, collection, cash-adjustment application and live marketing remain blocked/disabled. No commit, push, publication, deployment, persistent migration, VPS control, real provider/payment/refund or marketing operation occurred.

## Source, scope and preservation

Branch `main`, HEAD `cf68b53ddbb3321f03570e0b66a627914c1db674`; preserved09A.3/09A.4 changes remain uncommitted. [Entry inventory](phase09a5-evidence/entry.json) records actual tracked/untracked status and hashes before work. No reset, stash, force-checkout, broad formatting write or unrelated cleanup occurred. Every formatting proposal rechecked its pre-edit hash before writing. No external concurrent source change was observed; unrelated skill/configuration WIP was not selected.

The current source checkpoint uses digest `d343149828f4e5cc7a40fd7850671519e5035b8e02ff337e125b7e6e5b26ed0d`. The [final ledger](phase09a5-evidence/verification.json) supplies before/after HEAD and per-file SHA-256, commands, exits, durations and source-match outcome. It includes applications/packages/scripts/tooling/CI/configuration, formatter configuration and the reviewed debt baseline. Documentation/evidence and generated Next declarations are not executable-source identity; declaration bytes are preserved around builds. This is not a candidate commit or immutable-image identity.

## Formatting inventory and bounded remediation

Actual supported `pnpm format:check` reproduced1,129 failures and later1,121, both exit1. Prettier3.9.6 uses unchanged `.prettierrc.json`, `.prettierignore`, `.editorconfig` and `.gitattributes`. The [formatting register](PHASE_09A5_FORMATTING_REGISTER.md) and [machine inventory](phase09a5-evidence/format-inventory.json) identify every path, package, status, authored/generated/phase/ownership category, risk, before hash, correction, outcome, verification and next action. Existing ignores were recorded, not broadened to hide debt.

Ten high-priority changed/phase-source candidates were previewed. Seven passed a conservative comparison of emitted JavaScript syntax and raw template chunks and were formatted: Finance console/opening-balance dialog; Shopper Auth test; Checkout contact/header/summary; release manifest helper. Three JSX proposals did not produce identical emitted syntax and were left untouched, without claiming that difference is necessarily a product bug. SQL/template, monetary/signature strings and statements were not knowingly changed by formatting. `package.json` was formatted while adding explicit quality scripts. Seven pure formatting corrections plus that package update explain the reduction of eight reported files.

There is no giant unrelated source rewrite.37 historical migration-material formatting failures remain in the full check. Old migration sources and accepted hash anchors were not formatted. The remaining1,121 failures require separate owning-module batches, with particularly careful review of templates, fixtures, manifests, commands and JSX children. The formatter comparison is a review aid, not a universal semantic proof; lint/types/tests remain independent.

## New quality policy and CI consolidation

[Formatting policy](../../formatting-policy.md) distinguishes full Prettier FAIL from `pnpm format:check:regressions`. The new gate reads tracked/untracked supported files using existing Prettier ignores, configuration and EditorConfig. It accepts only unchanged inherited violations with recorded canonical-EOL SHA-256; new or modified unformatted content fails. Resolving a debt file passes. There is no automatic baseline-refresh/bypass flag. Configuration fingerprints require deliberate review of policy changes.

`tooling/format-debt-baseline.json` contains the explicit1,121-file debt and protects75 existing migration sources plus the accepted migration-history manifest independently, including removal/ignore cases. CRLF→LF normalization makes fingerprints portable across Windows/Linux; no SQL spacing, string content or other characters are normalized. Raw source hashes separately preserve this task's bytes. The full formatter is not relabeled green.

Seven policy/safety self-tests cover unchanged debt versus full status, new/changed violations, resolution, protected tampering, EOL portability, exact money, SQL template whitespace, JSX text and operator changes. The checker explicitly resolves EditorConfig, matching the intended CLI configuration. No dependencies or versions, ESLint settings or formatter ignore/rule files were changed.

The shared nonpublishing release runner now uses the full83-file selection previously used locally, runs the formatting regression gate, full ESLint with zero warnings and policy tests before publication. Existing CircleCI `validate-checkout` still gates `publish-staging`; no workflow was triggered. Actual Linux CI, frozen target images and deployment compatibility remain NOT VERIFIED. This is an enforceable source change prepared for review, not external CI acceptance.

## Narrow fixture correction discovered during verification

The first broad run was805 pass/1 fail/0 skip across806 cases/83 files. Exact failure: `Checkout atomic placement on disposable PostgreSQL shows actual Admin review, partial receipt and excess settlement to the account owner`, in `packages/database/src/checkout/placement.test.ts`, raised `PaymentDomainError: Receipt value time cannot be in the future.` The production receipt guard compares evidence to the database transaction clock; the fixture supplied host `new Date()`. This mixed-clock fixture is timing-sensitive. No claim is made that the guard was defective or that the exact historical host offset was measured.

The fixture now reads a synthetic past receipt time from PostgreSQL before starting concurrent verification transactions. Production validation, authority, financial values, evidence source, idempotency, locks and side effects are unchanged. The existing2099 future-receipt rejection remains. The exact selected case passes; its filtered probe recorded1 pass/51 filtered cases and is not represented as a complete-suite PASS. No test was skipped in source. The fixture file was already formatted, so this correction does not reduce the1,129 formatting baseline. Its subsequent formatter proposal also passed syntax/template comparison after the intentional fixture edit. See [correction evidence](phase09a5-evidence/receipt-fixture-correction.json).

This is the only non-tooling behavioral correction: a synthetic test timestamp source, not a production money rule. No unrelated architecture or product redesign was added.

## Verification checkpoints and resources

Use [verification.json](phase09a5-evidence/verification.json), `broad.json`, [toolchain](phase09a5-evidence/toolchain.json) and completion evidence for exact final results. The local verifier requires explicit assignment-owned loopback55441/maevelle_test and `CHECKOUT_RC_LOCAL_ALLOW=1`; it never loads repository credentials or invokes release operations. Only the disposable PostgreSQL18.3 container `maevelle-phase09a5-pg` and random synthetic databases were used. Its ID was verified and it was stopped. Automatic approval review rejected the combined removal of that container/volume and the temporary formatting preview directory (`blocked by policy`); they remain intact. Deletion was not retried. Unrelated processes/containers/volumes remain untouched.

| Checkpoint | Evidence / relationship |
|---|---|
|Full formatting|1,129→1,121 files, exit1 retained. Separate regression gate passes with zero new violations.|
|Initial source `b831…`|805/806 cases pass, one future-date fixture failure. Matching hashes do not turn a failed run green. `initial-broad.json` and `initial-verification.json` retained.|
|Intermediate source `902b…`|806 cases pass, but the fixture correction changed source during verification. `sourceUnchanged=false`; retained in pre-receipt-fix artifacts and not final acceptance.|
|Exact failing-case recheck|1 pass,0 failures,51 explicitly filtered cases. Overlaps final selection.|
|Final selected integration|806/806 cases across83 files,0 failures/skips,238.633s, matching before/after digest. Exact command and per-file results in the final ledger; no earlier snapshot is substituted.|
|Lint|Supported `pnpm lint` exit0; final full ESLint additionally requires zero warnings. No rule/ignore suppression added.|
|Types/builds|Backend build types, test-inclusive types, Storefront and Admin production builds recorded separately; preview false.|
|Migration/security|75 registered/51 immutable baseline; tail3226 verified; fresh schema,24 populated upgrades/no-op reruns,28 existing tooling cases and unchanged secrets/architecture/hardening detectors. Seven new format-policy cases are separate, not added to broad case count.|
|Whitespace/preservation|Independent diff/byte checks, immutable migration/anchor and unrelated-work preservation recorded in completion evidence.|

Node24.14.1, pnpm11.19.0, TypeScript5.9.3, ESLint9.39.5, Prettier3.9.6, Vitest5.0.5, Next16.4.2 and React19.2.8 remain unchanged. Application/tests run on Windows; disposable PostgreSQL18.3 runs in Linux. A local production build is not an immutable deployable image.

## Commerce, Auth, Finance and privacy

No production domain operation, API authority, role, session lifetime, owner partition, grant, response cache, consent subject or stale-response fence changed. Shopper-only Admin access remains401/AUTH_REQUIRED; authenticated insufficient capability remains denied. Phone/Order number, matching contact/account or privacy cookie is never Order authority. Current source confirms guest grant expiry at earlier of commitment+1h or original guest session; cross-device recovery remains unimplemented/unapproved.

Exact final terms, atomic Order/Inventory/Promotion/Cart/payment-obligation effects, claim/receipt/refund/Finance idempotency, COD custody/remittance and outbox/conversion deduplication are retained in the selection. Original81/cash80/noncash waiver1/due0 remains SETTLED_WITH_ADJUSTMENT with cash-based PARTIALLY_PAID. No waiver becomes cash/refundable money or a second receipt/conversion. Whole BDT is not derived by floating rounding; historical fractions and internal costs remain precise. Candidate approval never activates the cash resolver. No authoring rule or persistent Catalog price was normalized.

Tax/invoice/rounding/accounting/limits/refund allocation/courier/provider decisions remain blocked. The memorandum is noncash operational evidence, not a complete general-ledger write-off. Synthetic fixtures are not policy defaults. The prior Catalog writer matrix remains valid; this task did not change its write paths.

## Browser, operations and readiness package

The prior automatic Next runtime rejection remains a genuine restriction; no changed permission condition was found, no alternate wrapper/retry/impersonation/fixture attachment was attempted. All15 browser security journeys remain NOT VERIFIED at that layer. The existing executable CDP financial driver and detailed owner-transition plan remain available for a separately permitted environment; lower-layer cases are not browser acceptance. Native zoom, AT, Safari/Firefox, physical touch/iPad/keyboard, full human Support/operations acceptance remain unperformed.

The [local scorecard/blocker matrix](PHASE_09A5_FINAL_LOCAL_ACCEPTANCE.md) separates source debt, missing integration evidence, permission constraints, external provider/channel facts, owner/qualified-adviser decisions, human acceptance and deployment authorization. The existing operational runbook preserves independent purchase/method/destination/marketing containment while retaining committed status, legitimate claims and Finance/outbox evidence; a blanket API shutdown is not the ordinary purchase switch. No containment command was executed.

[Local readiness metadata](phase09a5-evidence/local-readiness-package.json) identifies this dirty source and artifacts and explicitly has no candidate commit/image digests or publication/deployment approval. Follow the [handoff](PHASE_09A5_NEXT_STAGE_HANDOFF.md) for exact09B prerequisites. No immutable release candidate is claimed.

## Forty independent outcomes

|#|Outcome|Verdict|Evidence / limit|
|---|---|---|---|
|1|Actual Git/source state|PASS|Entry and source-specific ledger.|
|2|Concurrent changes preserved|PASS|Hash-checked proposals; no overwrite/reset.|
|3|Full formatting baseline reproduced|PASS|Actual supported command,1,129 files.|
|4|Every failure classified|PASS|Per-file machine register.|
|5|Tracked/untracked/generated distinction|PASS|Git and authored/scope flags; existing ignores documented.|
|6|Current-phase modified files identified|PASS|Commit/dirty-state categories; selected scope explicit.|
|7|High-risk formatting reviewed|PASS|Diff preview, syntax/template preservation and rejected proposals.|
|8|Controlled batches|PASS|Seven pure formatting files, package tooling and separate receipt fixture correction.|
|9|Historical integrity unchanged|PASS|No old migration/anchor formatting.|
|10|No mass overwrite|PASS|Current hashes checked before writes.|
|11|Formatter configuration unchanged|PASS|Existing rules/ignores/EditorConfig/Git attributes retained.|
|12|Remaining debt exact|PASS|1,121 paths and fingerprints; full log retained.|
|13|Full formatting gate|FAIL|Actual full check reports1,121 files, not relabeled.|
|14|Future regression policy|PASS|New/changed debt rejected; full gate separate.|
|15|Full ESLint|PASS|Supported command0; zero-warning final check.|
|16|Auth/capabilities preserved|PASS|No production authority changes; selected regressions.|
|17|Guest/account authority preserved|PASS|No owner/grant shortcuts.|
|18|Whole-taka exactness|PASS|Strings/calculation calls preserved.|
|19|Historical fractions preserved|PASS|No data/precision normalization.|
|20|Cash/waiver separate|PASS|No new financial interpretation.|
|21|Refund/courier handling|PARTIAL|Existing invariants retained; earlier allocation/exception gaps open.|
|22|No activation|PASS|Policy resolver/public gates unchanged.|
|23|Browser restriction respected|PASS|No retry/workaround.|
|24|Permitted browser execution|NOT VERIFIED|No permitted runtime became available.|
|25|Unavailable browser cases explicit|PASS|All15 remain unverified at that layer.|
|26|Current broad integration|PASS|806 cases/83 files,0 failures/skips, matching digest.|
|27|Both UI builds|PASS|Actual final Storefront/Admin exits0.|
|28|Backend/test-inclusive types|PASS|Actual final independent exits0.|
|29|Migration/upgrades|PASS|75/51, fresh and24 populated fixtures locally.|
|30|Secrets/tamper effectiveness|PASS|Unchanged detectors/self-tests plus policy/safety cases.|
|31|Final source identity|PASS|Matching final before/after hashes; superseded runs retained.|
|32|CI publication safety|PASS|Validation still required; stronger local source gates, no external trigger.|
|33|Technical release defects classified|PASS|Matrix distinguishes source/evidence/environment.|
|34|Business/provider approvals explicit|BLOCKED|Actual independent approvals still required.|
|35|Recovery/success gates accurate|BLOCKED|Grant limits retained; independent proof and public success not invented.|
|36|No live external/financial activity|PASS|Only isolated synthetic operations.|
|37|No persistent migration/deploy|PASS|Owned disposable target only.|
|38|No commit/push/publication|PASS|No such operation occurred.|
|39|Readiness/operational references|PASS|Updated register, matrix and preserved containment semantics.|
|40|Exact09B prerequisites|PASS|Separate source/Linux/publication/target/policy approvals in handoff.|
