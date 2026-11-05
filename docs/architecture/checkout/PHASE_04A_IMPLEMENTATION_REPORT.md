# Phase 04A payment backend implementation and acceptance

Date: 2026-11-05 (Asia/Dhaka). **Overall: PARTIAL. Public financial activation: BLOCKED.**

The local backend now distinguishes untrusted claims, independently verified receipts, capped Order allocations, excess/late liabilities, reversals, refund processing and actual Finance postings. COD continues to use the existing collection and courier-settlement owners. This does not establish legal/provider approval, activate a receiving account, finalize a Checkout quote or implement placement. Phase 01B/02B/03A/03B remain PARTIAL.

## Repository and scope

Branch `main`; initial and final HEAD `504e53b71ba2c05d1c174d435d69846721b05242`. The initial tree already contained substantial tracked and untracked Phase 03A/03B work, shared tracking edits and the previously truncated 02A report. Those were preserved. No commit, push, persistent migration, deployment, provider action or VPS change occurred. No Storefront source was edited by 04A.

04A adds `checkout-payment.ts` shared contracts; focused Payments modules for destinations, authorization, receipts, corrections, refunds, policy proposals/approval, queues and aging; `3222_manual_payment_integrity`; Admin operations routes; isolated fixtures/tests; a verification harness; and this report/handoff. It extends existing Payments/Finance/Orders/Fulfillment/Delivery/Worker/notification code. Existing Checkout migration expectations now include the additive suffix. The database package exposes a test fixture through its established testing export pattern; no dependency version changed.

The inspected source migration tail was `3221_checkout_quotes`. `3222_manual_payment_integrity` was unused and is the only new migration. No historical migration or baseline manifest was edited. The real persistent ledger was deliberately not queried.

## Existing infrastructure audit and reuse

| Existing owner | Finding and implementation decision |
| --- | --- |
| Payments | Retain payment methods, intents, attempts, confirmed payments, allocations and refunds. Replace the amount-only verifier with independent evidence and transactional cash posting. Move new responsibilities into `src/payments/`. |
| Finance | Retain `finance_transactions`, `financial_account_entries`, source-posting uniqueness and COD settlement allocations. Add transaction-aware semantic helpers; no second cash or courier ledger. |
| Orders | Retain committed Order totals, cancellation/refund obligations and Inventory release. Verification locks the Order before intent/attempt. Late money never recreates a cancelled Order. |
| Inventory/Fulfillment/Delivery | Retain reservations, consumption, costing and dispatch semantics. Add fully verified prepaid payment checks at dispatch and take the Order fence before Delivery/Fulfillment locks. COD remains a separate unpaid collection workflow. |
| IAM/platform | Reuse active membership/capabilities, scoped-denial checks, row locks, durable idempotency, audit and outbox. Destination approval and financial correction require independent actors. |
| Notifications/Worker | Reuse claim-submitted staff notifications. Add one durable overdue escalation per intent and the existing notification pipeline. Delivery failure cannot alter financial truth. |
| Checkout | Leave immutable component quotes and all purchase/production-draft gates unchanged. Provide a fail-closed future financial boundary and readiness contract. |

Source findings addressed: the previous receipt-reference unique index applied only to CONFIRMED rows; verification accepted only a confirmed amount without independent destination/time/source evidence; pending claims could prevent expiry indefinitely; unallocated receipts were hidden by allocation-only readers; and dispatch did not enforce fully verified prepaid payment.

## Business and provider facts

Owner-approved product choices: COD/manual bKash/manual Nagad; guests remain supported; Transaction ID required, sending mobile optional; no screenshot/PIN/OTP/login collection; no Maevelle-added manual-wallet surcharge. Internal multiple receipts support partial/exception handling without imposing split-payment UX. These choices do not approve external fees, tax or final payable.

[bKash's official PRA guidance](https://www.bkash.com/en/page/personal-retail-account) identifies PRA as a business collection product and describes customer payment through PRA QR and USSD. It also lists account-specific limits and charges. This is general product evidence, **not Maevelle onboarding or account approval**. The implementation permits explicit merchant-payment/QR actions and rejects Send Money as a receiving-destination action. No published limit or fee was hardcoded into availability.

The [Nagad merchant page inspected](https://nagad.com.bd/services/service/?service=merchant-pay) returned a page-not-found response. Nagad PRA cannot be confirmed from that evidence. Nagad destinations can be represented as intended drafts; approval fails with `POLICY_BLOCKED` for every Nagad category until the actual category and permitted workflow are confirmed and deliberately implemented. No personal-to-person collection workaround exists.

`PaymentReadinessDto` returns all three initial methods with `eligible:false`, `purchaseAvailable:false`, merchant-added fee `0.0000`, external sender/operational fees `null`, tax/payable `null`, and explicit blockers. Existing quotes retain `paymentFees:null` because no final financial quote has been approved; that field is not silently replaced with zero.

## Receiving destinations and financial configuration

Destinations have an explicit provider/category/action, BDT wallet Finance account, receiving number, recipient, bounded instructions, state and exact string revision. Create records the actual authenticated actor. Every state revision stores an append-only full snapshot plus actor/reason; audit metadata avoids copying receiving numbers. New account details require a new draft destination rather than rewriting old revisions.

States are DRAFT, APPROVED, SUSPENDED and RETIRED. APPROVED means independently reviewed configuration, **not live activation**. Approval requires a different authorized actor, evidence reference and supported action. Suspension preserves history; retired destinations cannot reopen. Stale revisions and cross-tenant IDs fail. Legacy method settings cannot activate a wallet or substitute its instructions; unchanged instructions may accompany disabling a method. No ACTIVE destination state or activation endpoint is provided in this assignment.

Deadline configuration uses an immutable, actual operator-created proposal and a separate approver. Approval cannot name an arbitrary purported proposer. Policy revisions retain submission/review durations and approval provenance. No production policy is seeded; 60 minutes remains proposed, not approved by source code. Existing Order-owned intent creation accepts an approved policy ID and binds an absolute submission deadline plus separate review deadline. It verifies that amount, currency, method and Order number equal the committed Order. Existing legacy intents retain null provenance/deadlines where previously unknown; no fabricated backfill occurs.

Highly sensitive edits require independent approval. A single-Owner emergency override and fresh reauthentication protocol are **not enabled**; there is no undocumented bypass. Any justified exception requires a separately implemented verified reauthentication/approval policy before use. Destination activation, provider product/fees/limits, staffing SLA and public deadlines remain external readiness gates.

## Claims, verification, balances and recovery

Customer claim submission derives method and destination from the committed Order intent, records untrusted transaction testimony and optional Bangladesh sending mobile, and emits the existing staff-review event. It creates no confirmed money. Same-key/same-body retries replay; changed payloads conflict. Duplicate claimed references remain separate history. At most five unresolved claims per intent limit repeated submissions. Review supports UNDER_REVIEW, CORRECTION_REQUESTED and ESCALATED without changing financial truth or extending deadlines.

Verification requires `payments.verify` and independently checked exact transaction ID, receiving number, BDT currency, value time, account-history/statement source, evidence reference, actual credited amount and Finance account. The reviewer must correct a mismatched claim before verification. Evidence source is a management assertion backed by an independent record reference; the system does not inspect a real provider account, scrape it or certify the assertion's truth.

The local transaction claims durable idempotency, locks membership/Order/intent/attempt, checks evidence, reserves permanent identity, records actual Payment and allocation/evidence, posts actual cash through Finance, resolves the claim, updates intent eligibility and writes audit/outbox. COMMIT is the only success boundary. Fault rollback removes all of these writes. A repeated identical approval, including another key/reviewer, returns the same Payment; conflicting evidence fails. A lost response must retry the same key/body. Physical wire loss at COMMIT was not simulated.

Partial receipts allocate only genuine funds and retain the outstanding balance. Excess receipts preserve actual cash, cap allocation to the obligation and record the remainder as explicit unallocated liability. Excess refunds use `UNALLOCATED_RECEIPT`, so returning excess does not reduce paid merchandise. The receipt detail exposes original received/allocated/unallocated values and remaining unallocated liability after completed refunds. Exception listings retain historical excess/late/reversal rows; use receipt detail for the current remaining liability.

Late/cancelled/expired receipts are recorded and posted with zero Order allocation and `LATE_RECEIPT_LIABILITY`; they can be refunded through existing refund operations. Payment/refund readers resolve the originating Order even without a positive allocation. Order cancellation and verification use the same Order fence; if funds arrive first, existing cancellation refund obligations apply; if cancellation wins, actual funds remain a late liability.

Permanent reference fences preserve the repository's existing conservative organization/method/normalized-reference collision scope across every Payment status. This is not a claim of provider-global uniqueness or provider-confirmed normalization. Actual verified transaction text is separately retained and matched exactly. Historical duplicate/reversed identities are grouped into a collision fence with their count, preserving every original row and preventing reuse; they are not silently deduplicated. Provider-confirmed identity/normalization rules remain an activation gate.

Receipt corrections require `payments.correct`, a different actor from the verifier, independent reversal evidence and a reason. Reversal posts a compensating Finance adjustment and append-only correction; it never frees transfer identity, deletes allocations or creates inventory. Pending/completed refund obligations block reversal until reconciled. Repeated reversal returns the existing outcome. Already-dispatched/cancelled Orders require operational exception handling rather than automatic lifecycle rollback.

## Refunds, COD and Worker behavior

Existing refund obligations, refundable-balance locking, allocation and completion semantics remain authoritative. New independently evidenced receipts require original-source verification and independent outgoing evidence before refund completion. Completion posts through the original Finance account in the same transaction, with balance/currency checks. The API accepts no arbitrary refund destination number. Duplicate refund transfer references are permanently fenced. UNKNOWN_EXTERNAL_OUTCOME retains the liability, cannot return directly to transfer processing, and can complete only after independent reconciliation; an evidenced FAILED transition is the path to a fresh obligation where appropriate. No external refund is executed.

COD remains unpaid at Order creation. Delivery, actual collection, courier-held cash and merchant remittance/settlement stay distinct through existing Payments/Delivery/Finance operations. No alternate COD settlement ledger was introduced. Existing regression tests exercise collection, remittance, settlement, fee/cash reconciliation and cancellation. Real courier compatibility, geographic coverage and operational acceptance remain blocked.

Worker review aging uses the approved absolute deadline, bounded batches, PostgreSQL locking and one durable escalation tombstone per intent. Expiry candidate selection and under-lock cancellation revalidation both stop treating claims as a hold after that deadline. Claims are retained and later real receipts remain reconcilable. Legacy null review deadlines are not invented or retroactively changed; those cohorts require explicit operational policy/remediation before public activation. Real partial receipts continue to require operator resolution rather than being silently discarded.

The dispatch fence serializes against verification/cancellation. Unpaid or partially paid prepaid Orders cannot dispatch. This does not invent COD geographic/customer eligibility or change Returns inspection rules.

## Schema and transaction evidence

`3222_manual_payment_integrity` adds receiving destination/history tables; operating proposal/approved-policy revisions; intent provenance/review deadlines; claim review state; permanent receipt/refund fences; independent receipt evidence/corrections; and escalation tombstones. New relationships use organization-composite references. Amounts remain NUMERIC(20,4). History/evidence/fences are append-only; financial receipt identity and amount cannot mutate. A deferred constraint checks actual receipt = allocation + unallocated liability = matching Finance source posting at transaction commit.

Fresh installation and populated upgrade from 3221 run on newly generated databases in an explicitly created loopback PostgreSQL 18.3 cluster. Populated tests preserve both reversed and confirmed legacy references and block reuse after upgrade. Earlier populated Checkout upgrade tests continue preserving historical Order/draft/address/Inventory relationships with the new migration suffix. No persistent environment was inspected or migrated.

Deployment is unauthorized. Future rollout must apply the additive migration once, update API/Worker readers/writers together behind financial write gates and verify real data/roles/backup before enablement. HEAD `504e53b...` is only a pre-new-semantics baseline, not a validated rollback release after unallocated receipts or new policy records exist. No deployed compatible SHA/digest was established. After new-semantic writes, use these compatible readers or forward repair; restore requires an authorized verified backup/reconciliation plan. No automatic down migration exists.

## Verification

**289 tests across 24 files passed** in the final integrated run (114.44 seconds), including 16 new payment-domain tests and four new Admin HTTP tests. The machine-readable final test record is [PHASE_04A_VERIFICATION.json](PHASE_04A_VERIFICATION.json). The harness lists the exact test files, verifies the isolated target, migrates fresh random fixtures, runs real PostgreSQL tests and drops its databases. It never reads `.env` or migrates its base template.

Commands actually run:

```powershell
pnpm exec tsc --build packages/database/tsconfig.build.json apps/api/tsconfig.build.json apps/worker/tsconfig.build.json --pretty false
pnpm exec tsc --build packages/database/tsconfig.json apps/api/tsconfig.json apps/worker/tsconfig.json --pretty false
$env:TEST_DATABASE_URL='postgresql://checkout_fixture@127.0.0.1:55444/maevelle_test'
node scripts/checkout-phase04a-verification.mjs
pnpm exec eslint <the changed payment contracts/domain/migration/API/Worker/test files>
node scripts/check-architecture.mjs
git -c core.safecrlf=false diff --check
node scripts/check-migration-history.mjs
```

Backend builds/typechecks, focused lint/formatting, architecture (13 packages) and diff whitespace checks passed. A final pagination correction was then verified with **20 tests across two files**, all passing in 17.32 seconds. No separate SAST engine, deployed penetration test or human/browser acceptance was run. The historical migration-byte check **FAILS**, reporting the baseline manifest and 18 historical files. This is the inherited Windows byte-history gate; no historical migration or checksum was changed/rebaselined. Earlier failed implementation runs were corrected; only the final record establishes the final test count/outcome.

New tests cover provider/action safety, approval/suspension/history, wrong roles/tenant, minimal durable duplicate claims, independent evidence mismatch, partial/excess/refund classification, duplicate reviewers and cross-Order races, reversal uniqueness, late receipts, atomic faults, bounded expiry/escalation, cancellation races, prepaid dispatch, unknown refund outcomes and populated upgrades. Admin HTTP tests use synthetic session identities and real IAM/tenant enforcement; they do not establish deployed authentication/CSRF/ingress behavior. Existing Orders, Payments, Finance, fulfillment/delivery, notifications, Inventory, Cart and Checkout regressions are included.

The bounded payment sample uses 20 synthetic receipts, with p95 **10.85 ms** and maximum **31.33 ms** on this local run; a 12-row review cohort returns a bounded five-row page. These are local observations, not representative load/SLA promises. Exact wire-loss, all reviewer/revocation/expiry permutations, sustained load, deployed PostgreSQL grants, full security certification, browser/human acceptance and provider statements remain NOT VERIFIED.

Checkout quote/foundation regression fixtures assert zero Checkout Orders, Inventory reservations, Payment obligations/confirmed Payments, promotion usage, Cart conversion, Finance postings and purchase events. Separate Payments fixtures deliberately create synthetic Orders, receipts, refunds and Finance entries; their counts are not customer purchases. No real merchant account or funds were used.

## Acceptance register

Statuses apply to the requested outcome as a whole; local synthetic evidence does not promote activation.

| # | Outcome | Status | Evidence / remaining boundary |
| --- | --- | --- | --- |
| 1 | COD/bKash/Nagad representation | PASS | Three explicit methods; Nagad intended/unverified. |
| 2 | Simple manual-payment contract | PASS | Required transaction ID, optional mobile; no screenshot/secrets. |
| 3 | No merchant manual surcharge | PASS | Explicit zero; provider charges remain unknown. |
| 4 | Intended PRA types without false approval | PASS | Explicit categories; Nagad approval denied. |
| 5 | Unsupported/unapproved workflows fail safely | PASS | Action validation and activation/placement gates. |
| 6 | Versioned authorized destinations | PASS | Independent approval, revisions, tenant boundaries. |
| 7 | Financial configuration audit | PASS | Actual proposer/approver, snapshots and audit. |
| 8 | Historical instructions | PASS | Existing snapshots preserved; new immutable revision history. |
| 9 | Claims remain unverified | PASS | Claim/review create no money. |
| 10 | Independent receipt evidence | PASS | Exact structured evidence required; live truth remains a human/provider gate. |
| 11 | Duplicate receipt prevention | PASS | Permanent fences and real PostgreSQL reviewer/cross-Order races. Provider identity semantics remain external. |
| 12 | Partial balances | PASS | Actual receipt allocation and outstanding balance. |
| 13 | Overpayment liabilities | PASS | Capped allocation, unallocated balance and liability refunds. |
| 14 | Late/cancelled/reversed recovery | PASS | No resurrection; explicit liabilities, corrections and refunds. |
| 15 | COD collection versus settlement | PASS | Existing collection/custody/Finance settlement regressions. |
| 16 | Payment/Finance reconciliation | PASS | Same transaction, source uniqueness, deferred conservation. |
| 17 | Idempotency/concurrency | PARTIAL | Local replay/races pass; physical COMMIT loss and full matrix unverified. |
| 18 | No indefinite fake-claim stock holds | PARTIAL | Approved-policy intents use absolute review expiry; legacy null-policy cohorts require remediation. |
| 19 | Least privilege and sensitive changes | PARTIAL | Separate grants, independent actors and tenant denials pass; deployed roles and justified Owner reauth exception unverified/not enabled. |
| 20 | Tax/final-payable truth | BLOCKED | Correctly null; accountant/rounding/invoicing approval absent. |
| 21 | Future placement boundary | PARTIAL | Typed fail-closed contract; final monetary/quote/version revalidation belongs to gated Phase 05. |
| 22 | No purchase/payment activation | PASS | Gates unchanged; no public instructions/claim path added. |
| 23 | Fresh/populated migrations | PASS | Disposable PostgreSQL 18.3; no historical cleanup. Byte-history gate remains FAIL independently. |
| 24 | Existing Orders/Payments compatibility | PARTIAL | Local regressions/readers pass; actual persistent cohorts and mixed-release rollout unverified. |
| 25 | Inherited gates visible | PASS | Earlier phases remain PARTIAL; no uplift from these tests. |
| 26 | External blockers explicit | PASS | Listed here and in readiness/handoff. |
| 27 | Phase 04B handoff | PASS | Exact current operations, inputs, unavailable paths and UI obligations documented separately. |

## Remaining activation and operational gates

Actual bKash onboarding/account confirmation; actual Nagad product/category/collection method; merchant-specific provider instructions/fees/limits and receipt uniqueness semantics; approved live numbers; Bangladesh advance-payment compliance; tax/VAT/invoicing/BDT payable rounding; privacy/financial retention; real delivery geography/courier COD compatibility; staffing/review policies; legacy pending-claim remediation; secure committed-Order grants/recovery and Phase 05 placement; deployed IAM/ingress/log/backup/mixed-version checks; representative load and human/browser acceptance. No provider/API integration, transfer execution, payment-link automation, deployment or real account activation was performed.

Exact next interface assignment: [PHASE_04B_HANDOFF.md](PHASE_04B_HANDOFF.md). Do not enable customer instructions, claims or purchase controls before Phase 05 and the readiness gates are actually satisfied.
