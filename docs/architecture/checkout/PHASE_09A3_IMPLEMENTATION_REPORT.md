# Phase 09A.3 implementation report

2026-11-10, Asia/Dhaka. **PARTIAL locally; public purchasing, collection, cash-adjustment activation and release BLOCKED.** Authentication regression closure and the selected local integration baseline are established. Full-repository lint and expanded browser acceptance are not green. No commit, push, publication, deployment, persistent migration, live provider/financial operation or marketing activation occurred.

## Current source and preservation

Entry and final HEAD: `cf68b53ddbb3321f03570e0b66a627914c1db674`, branch `main`. The historical947c296/e277265 checkpoints are not the current baseline. Checkout09A/09A.1/09A.2 are now represented by eb78ba7/8eaa145/ea47d2f/cf68b53 after the previously reported independent Admin commit. Existing dirty skill catalog/rule updates, `skills-lock.json`, untracked frontend skill files and generated development Next declarations were preserved. No reset, stash, cleanup of shared work, commit or push was used.

The verification ledger records before/after HEAD plus SHA-256 of each relevant application/package/script/tooling/CI/config file and a combined digest. Final selected source digest: `aa1c5b09992866bada552b71baf2e16e48337feef529d44291f23c7fad1407e2`. This identifies uncommitted product/test changes; it is not an immutable release candidate. Documentation/evidence, unrelated skill files and generated `next-env.d.ts` are excluded from the executable source digest. Next builds regenerate declarations; development references are retained after verification. No concurrent product-source/HEAD change was observed within either completed verification checkpoint. Pre-existing local application processes were left alone.

## Authentication and financial access

All four exact historical errors were recovered from retained logs, then reproduced against current source and an isolated PostgreSQL server. The [regression register](PHASE_09A3_REGRESSION_REGISTER.md) records names, original line locations, errors, cause and corrections. The primary failure was an obsolete403 expectation for a shopper cookie at an Admin endpoint; current Admin authentication correctly returns401/AUTH_REQUIRED. That early assertion prevented creation of product/Wishlist fixtures, causing the expiry, sharing and anonymization failures. Both shopper-only denial checks now verify401 and the structured error; no production guard, cookie rule, TTL, permission, test assertion of data isolation or fixture privilege was relaxed.

The corrected real-session12-case file covers verification, Admin/shopper cookie separation including renamed copied cookies, unrelated CRM contact match, account Wishlist writes/merge/replay/logout,12h expiry, password-reset revocation, A/B share permissions, foreign storefront shares and account anonymization with guest preservation. It remains an ordered workflow fixture; late cases are not independent standalone fixtures. No second Auth state/system was introduced.

Source review and selected tests retain Checkout live session/partition checks, explicit guest adoption, separate guest Order grants and expiry, owner-generation rejection of delayed results and private state clearing. Privacy identity is not shopper authority. Neither phone nor Order number authorizes access, and a new Account session does not own earlier guest Orders.

Admin `proxy.ts`, server layout/template and request-local `requireAdminAccess` retain fail-closed rendering. `lookupAdminAccess` uses a trusted configured origin, no-store fetch and no global session cache. Fastify's shared guard requires user **and** session IDs, current membership/organization and2FA policy before route capabilities. New reads still resolve current server capabilities/organization; client organization headers are selectors, not authorization. Existing payment queries key state by organization/actor/capabilities/scopes and reject aborted results; policy workspaces remount by that key. This source/component/API assessment does not establish complete real-browser cache, organization-switch or idle-tab revocation acceptance.

New route tests prove actual database capability removal denies subsequent policy reads and financial commands, and local authorized actors cannot read another organization's settlement/eligibility. Those route-level tests stub session identity only; database authorization/financial records are real, while shared-guard tests and the real-session shopper suite verify their separate boundaries. Tenant-filtered history returns an empty page for foreign/missing Orders; it does not reveal their existence or evidence. Summary/eligibility return404. Existing strict body/pagination/no-store, review separation and policy-blocked application tests remain. Seven account UI files received only unused-import/type-import corrections:15 lint violations removed. The expanded selection also revealed an older money transport test using pre09A.2 labels; its expected display now follows shared exact retail presentation and retains precision/unknown-money checks.

## Pool investigation and resource controls

The original exhausted-pool test failed at its **first CREATE TABLE connection**, before saturation. pg-pool reported `Connection terminated due to connection timeout` with `Connection terminated unexpectedly`; its single100ms timeout also governed cold TCP/authentication. This is not evidence of an exhausted queue or leaked held transaction. The exact historical machine scheduling/connection pressure cannot be reconstructed, so no claim is made that every historical resource condition was harmless.

The corrected integration test keeps a bounded1000ms cold/acquisition budget, then proves a deliberately occupied one-client pool rejects its queued write after >=900ms and <3000ms, never runs that write after release and recovers. Production pool configuration/default5000ms is unchanged. Cleanup now releases **and awaits** the held transaction before pool/database teardown, including assertion failure. No retries were added.

A real loopback TCP server accepts connections without answering the PostgreSQL handshake. Under the original100ms budget, four simultaneous acquisitions reject, a subsequent acquisition also rejects and concurrent idempotent pool close completes. This isolates failed creation/queued cleanup from SQL, credentials, remote services or guessed host latency. A real PostgreSQL cancellation test cancels a running synthetic sleep, observes transaction rejection, verifies a new query succeeds and checks zero idle-in-transaction clients. Three independent suite processes ran concurrently with unique random databases: all nine repeated cases passed. They overlap the three distinct pool cases and are not added to the broad total.

Only the assignment-owned PostgreSQL18.3 container `maevelle-phase09a3-pg` on loopback55439 was used for integration data. Tests create random fixture database names; the configured `maevelle_test` target is disposable. Synthetic fixture credentials/tokens are omitted from reports. Two failed browser-fixture startup attempts at the occupied default API port left only disposable databases inside this owned container; container cleanup removes them. A later isolated3102 API fixture was stopped by its own stop file. No unrelated process/container/volume was stopped or removed.

## Verification checkpoints

Commands, exit status, duration, toolchain, database identity and exact source hashes are in [verification.json](phase09a3-evidence/verification.json). The local nonpublishing runner is `scripts/checkout-phase09a3-verify.mjs`; it requires explicit `TEST_DATABASE_URL`, loopback55439/maevelle_test and `CHECKOUT_RC_LOCAL_ALLOW=1`. It never loads repository credentials or invokes publishing/deployment. Per-file case names/results are in [broad.json](phase09a3-evidence/broad.json). Test counts below are separate checkpoints, never summed.

| Run | Outcome / relationship |
|---|---|
| Original current-source reproduction | 8 Auth pass /4 Auth fail; original pool case passed in this reproduction. Confirms all four historical assertions/cascades. |
| Auth correction |12/12 pass; overlaps broad. |
| Initial integrated checkpoint |614/614 cases,66 files,218.600s; both UI builds passed; matching before/after source digest `a78d330e9c41c5e59d15944e0b2e341ec36a8cff348375373c9c50681528d7a9`. Retained in `initial-verification.json` and `initial-broad.json`. Superseded by final edits. |
| Added security/account/transport probe |35 pass /2 fail: one new test incorrectly assumed404 for an empty history collection, one stale money display expectation. Both corrected to verified current contracts; no production authorization change. |
| Final selected integration |646/646 cases across69 files, zero skipped,214.867s; source digest above. Includes the earlier repository-supported selection plus Admin guard/proxy/account/transport, account Cart/browser controller and database Wishlist cases. |
| Pool stress |3 concurrent processes ×3 cases pass; repeated evidence, not9 additional unique tests. |
| Migration/security/tooling |75 registered /51 immutable baseline; tail3226 unchanged;28 tooling cases including tamper self-tests; fresh schema and24 populated upgrades; secrets, architecture and hardening checks. No historical bytes/hash edit. |
| Types / builds |Backend build types, test-inclusive types, Storefront production build and Admin production build pass at each completed checkpoint. Production Checkout preview false. |
| Lint |Focused account/Auth/pool/source checks pass. Full-repository lint remains FAIL:778 errors, reduced from793 by15 scoped import corrections; exact paths/rules retained in `lint.log`. No suppression/config weakening. |
| Browser |No new browser PASS. Existing15 actual09A.2 cases remain historical; this phase's runtime launch was automatically rejected. |

Toolchain: Node24.14.1, pnpm11.19.0, Vitest5.0.5, TypeScript5.9.3, Next16.4.2, React19.2.8, Better Auth1.7.12, pg8.23.0, Kysely0.29.5; PostgreSQL18.3 Linux container, Windows application/test processes. No package dependency changed.

## Financial preservation and Catalog audit

Selected tests retain exact decimal-string retail display, significant historical fractions and internal precision, invalid BDT_1 rejection, provisional quote semantics, server final payable/obligation equality and privacy projection. Original81, actual cash80, authorized waiver1, due0 remains SETTLED_WITH_ADJUSTMENT with cash-based PARTIALLY_PAID. Waiver is neither cash nor refundable funds. Existing append-only reversal, exact-key/idempotent recovery, courier-remittance separation, receipt-capped refunds, Finance numbering and single conversion remain covered by the selection. Full posted/remitted/refund-encumbered corrections, item/document allocation and multi-delivery/operator acceptance retain prior limitations. The memorandum is a non-cash operational record, not a completed general-ledger write-off.

The [Catalog writer matrix](phase09a3-evidence/catalog-writers.md) identifies product/initial variant and workspace-save direct SQL, current/future Pricing definitions, compare-at, offers/promotions, manual price/discount/delivery overrides, shopper tariffs and imports/bulk variants. Direct Catalog create/update paths bypass the Pricing service validator. The audit specifies approved-policy integration points and normalization prerequisites; it does not activate integer-only validation or alter persistent Catalog records. Supplier acquisition cost remains separate. All financial decisions in the09A.1 register remain unapproved; synthetic limits are never production defaults.

## Browser, security and remaining limits

The default local API port was occupied by a process not owned by this assignment. No unrelated process was stopped. A disposable API fixture started on3102, and isolated copies of successful build output were prepared with test-only origins3100/3101/3102. Launching the Next browser runtime was rejected by automatic approval review: `blocked by policy`, with no more specific reason supplied. No browser run completed, no screenshot or owner-switch success is invented, and modified-origin test artifacts are not immutable candidates.

Consequently guest→account browser merge, A→B pending reads, logout with private Checkout shown, organization switch with payment pending, policy-screen capability revocation, real correction recovery and full no-fabricated-success/marketing observation remain PARTIAL or NOT VERIFIED here. Existing controller tests are useful evidence but are not real-browser acceptance. Native zoom, human AT, physical devices and iPad are unperformed. Linux CI, deployed HTTPS, ingress/cookies, actual staging schema/image compatibility and provider/courier/qualified-policy approvals remain separate gates.

## Forty independent outcomes

| # | Outcome | Verdict | Evidence / limit |
|---|---|---|---|
|1|Actual repository state recorded|PASS|Current HEAD, dirty inventory and content hashes.|
|2|Concurrent work preserved|PASS|No reset/stash/discard; no product drift during completed checkpoints.|
|3|Four Auth failures reproduced/explained|PASS|Original logs and current reproduction match.|
|4|Auth failures resolved securely|PASS|401 + structured denial; unchanged production guards.|
|5|Wishlist ownership/transitions|PARTIAL|Real-session/backend and controller coverage; full browser transitions unverified.|
|6|Admin protected rendering|PARTIAL|Guard/proxy/account tests and source review; browser/cache breadth remains open.|
|7|Guest/account Checkout authority|PASS|Existing partition/grant/expiry regression retained.|
|8|Organization/capability enforcement|PASS|Actual database revocation and foreign-Order reads plus existing boundary tests.|
|9|Pool root cause investigated|PASS|Pre-saturation cold connection error identified; exact historical host pressure not claimed.|
|10|Bounded acquisition/cleanup|PASS|Saturation, stalled creation, cancellation, recovery and bounded teardown cases.|
|11|Fixture/resource isolation|PASS|Owned container/random databases; task cleanup only, within tested scope.|
|12|Earlier failures reconciled|PASS|Exact names, causal cascade and stale money expectation documented.|
|13|Current broad selection green|PASS|Final ledger/source-identified selected run.|
|14|Counts/reruns separated|PASS|No addition of overlapping focused/stress/history runs.|
|15|Whole-taka presentation exact|PASS|Shared presentation/transport and selected financial tests.|
|16|Historical fractions preserved|PASS|Exact large/fractional values; no normalization.|
|17|Final payable authoritative|PASS|Existing server placement/obligation tests.|
|18|Cash/waiver distinct|PASS|Existing81/80/1/0 domain and presentation assertions.|
|19|Customer settlement truthful|PASS|Cash status and settlement stay distinct.|
|20|Policy remains blocked|PASS|Real route POLICY_BLOCKED; no resolver activation.|
|21|Refund/courier correctness|PARTIAL|Existing cash caps/separation pass; approved allocation/remitted correction limits remain.|
|22|No duplicate Finance/conversion|PASS|Existing numbering/idempotency/domain selection; no new emission.|
|23|Tenant-scoped financial screens|PASS|API database isolation and owner-keyed query review; browser switching separate.|
|24|Proposal approval distinct from activation|PASS|Blocked eligibility/command and stored-proposal tests.|
|25|Protected correction|PARTIAL|Existing semantic/capability tests; full correction/browser recovery remains open.|
|26|Expanded real owner-switch browser testing|NOT VERIFIED|Next runtime automatically rejected; no new case claimed.|
|27|Browser no-fabricated-success retained|PARTIAL|Source and tracking regression pass; prior browser evidence remains historical.|
|28|Pricing writers audited|PASS|Concrete eight-path matrix plus workspace-save bypass.|
|29|Existing Catalog unchanged|PASS|Audit only; no persistent data touched.|
|30|Business/accounting/provider approvals|BLOCKED|Actual signatures/authorities still absent.|
|31|Fresh/populated migrations|PASS|75/51 integrity, fresh and24 upgrades on disposable18.3.|
|32|Security/integrity detectors|PASS|Unchanged scanner/guards/tamper self-tests.|
|33|CI readiness intact|PARTIAL|Nonpublishing validation still gates publishing; Linux job not executed.|
|34|Both UI production builds|PASS|Actual final runner exits/logs.|
|35|Lint/tooling honestly classified|PARTIAL|Scoped lint green; repository lint remains FAIL.|
|36|No real financial/provider activity|PASS|Synthetic isolated operations only.|
|37|No public purchase/marketing activation|PASS|No activation changes.|
|38|No persistent migration/deploy/commit/push|PASS|Local disposable testing only.|
|39|Prior verdicts preserved|PASS|No blanket phase promotion.|
|40|Precise handoff completed|PASS|Separate technical/policy/browser/runtime gates in next handoff.|

The [release register](PHASE_09_RELEASE_READINESS_REGISTER.md) records the scoped RC28 closure and remaining RC10/23–27 restrictions. Follow the [next-stage handoff](PHASE_09A3_NEXT_STAGE_HANDOFF.md); it does not authorize09B or publication/deployment.
