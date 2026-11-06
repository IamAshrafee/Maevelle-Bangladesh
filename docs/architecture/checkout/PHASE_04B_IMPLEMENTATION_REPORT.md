# Checkout Phase 04B — implementation and local acceptance

Date: 2026-11-05, Asia/Dhaka. **Overall: PARTIAL. Public financial activation: BLOCKED.**

The existing Admin Payments workspace now uses the Phase 04A financial operations for independent claim review, receiving configuration, deadlines, receipts, liabilities, refunds and COD. The Storefront exposes an unavailable payment section and an unmounted, explicitly synthetic presentation component. No real Checkout purchase or public payment collection is enabled. Phase 05 placement was not implemented.

## Repository baseline and preservation

Work began on `main` at `504e53b71ba2c05d1c174d435d69846721b05242`, with substantial existing uncommitted Phase 03A/03B/04A source, migrations, tests and reports. These were inspected and retained. During this assignment another actor committed the preceding work: `6af92ea`, `81c4187`, then `06f6d7856064d36d0bc89dd9470ad272ba2c114d`. The latter was the observed final source baseline; these commits were not made by this task. The Phase 04B changes remain uncommitted. No reset, clean, stash, push, deployment, persistent database migration, VPS change, provider contact or live financial operation was performed.

Product Completion, engineering standards, checkout contracts and reports were checked against source. Historical phase labels were treated as continuity, while this assignment's explicit prohibition on purchases, public claims and Phase 05 implementation was preserved. No dependency was installed or changed. No migration was added; the disposable ledger runs through `3222_manual_payment_integrity`.

## Admin audit and reuse

The prior `/payments` console mixed queues, lists, details, legacy verification, refunds and method settings in a large component. Orders already link to Payments and Finance already owns cash posting, courier custody and settlement. The implementation keeps this navigation and replaces the console body with focused workspaces; it introduces no Checkout Administration section or separate settlement system.

The implementation reuses Admin context/capabilities, API envelopes, `Button`, `Input`, `NativeSelect`, dialogs, page panels, status badges, existing payment/refund table and filter controls, COD queue, Order links and Finance links. Standard semantic Tailwind tokens and mono/tabular monetary displays remain authoritative. Existing legacy dialog/settings modules are retained but are not mounted as alternative manual-verification paths. Unrelated application chrome and the authored Storefront shell remain intact.

### Responsibility boundaries

- `payments-console.tsx`: workspace navigation and truthful readiness.
- `claim-review.tsx`: paginated claim queue, immutable intended instructions, testimony and independent evidence.
- `destination-panel.tsx`, `policy-panel.tsx`: reviewed configuration and deadline proposals.
- `receipt-workspace.tsx`, `refund-operations.tsx`: original/current balances, correction controls and payout reconciliation.
- `record-panels.tsx`: existing records, filters, COD collection and legacy posting integration.
- `payment-command.tsx`: deliberate review/confirmation, exact intent retention and uncertain responses.
- `use-payment-query.ts`, `payment-ui.tsx`, `lib/payments/transport.ts`: owner-scoped reads, shared presentation, safe errors and exact decimal formatting.

### Narrow backend additions

Two Admin read operations were necessary to avoid fabricated policy IDs and incoherent claim-detail joins in the browser:

| Read | Capability | Returned authority |
| --- | --- | --- |
| `GET /admin/payments/attempts/:id/workspace` | `payments.view` | Attempt, currency, original destination snapshot/revision, already allocated amount, outstanding balance and resulting Payment ID in one repeatable-read transaction. |
| `GET /admin/payments/operating-policies?page=1` | `payments.destinations.view` | Bounded stored proposals, proposer, approved revision ID, approver and timestamps. |

The claim queue adds Order reference, method, customer reference, expected amount and currency to its existing bounded SQL read. Receipt details add verifier identity for independent-correction controls. Shared DTOs cover these reads. Existing financial mutations and their transactional authority are reused. No schema or new financial store was introduced. Private Admin payment/refund search URLs are excluded from automatic request URL logging.

## Configuration, review and money workflows

**Readiness:** the actual readiness API drives explicit blockers for COD, bKash and Nagad. The UI distinguishes implemented operations, internal configuration approval, external onboarding, operating approval, live activation and public Checkout readiness. Maevelle-added manual surcharge is zero; external provider fees, tax and payable remain unknown/unresolved. There is no Activate control.

**Destinations:** lists mask numbers; authorized detail exposes the original configuration, Finance account, provider evidence and revision context. Creation selects a real authorized Finance account and creates a draft. Changed receiving details require a new draft; old Order instructions remain immutable. Approval requires another authorized actor. Self-approval is disabled and independently enforced by the backend. Nagad approval remains blocked. bKash PRA presents merchant payment/QR, without an ordinary Send Money option. Suspend/retire use the existing revision-checked transition with a reason.

**Deadlines:** inputs begin blank. The UI creates an actual proposal, lists stored proposals, and approves the selected immutable proposal through another actor. The proposed 60-minute suggestion is not a default production policy. Approval records provenance and does not activate purchases. The UI explains bounded review and that repeated testimony cannot indefinitely extend stock holds.

**Claims:** the oldest-first server queue is paginated at 25, with Order/method/reference, expected amount, age, review deadline and overdue status. Empty/loading/error/denial/retry and mutation page recovery are explicit. Detail separates customer testimony from the original instructions and actual verified balances. Under-review, correction, escalation and rejection use existing operations and their actual capabilities.

**Verification:** authoritative proof fields start blank. Staff enter actual credited amount, independently checked Transaction ID and receiving number, Bangladesh value time explicitly converted with `+06:00`, account-history/provider-statement source, evidence reference and actual BDT Finance account. A review step presents entered evidence/account name before confirmation. Claim reference, intended number and last recorded outstanding are shown for comparison; the server determines allocation at commit. The saved receipt displays that result. No client money calculation approves a receipt, and no second Finance post follows verification. Non-BDT historical claims remain unavailable for this BDT-only operation.

**Receipts and exceptions:** original received, allocated and historical excess remain distinct from current remaining liability and Order outstanding. Partial, excess, late and reversed classifications use server results. A late receipt never claims to reopen a cancelled Order or allocate stock. Historical exception lists lead to a current receipt read. Duplicate evidence is shown as a safe conflict; unrelated customer records are not disclosed through error text.

**Reversals:** a distinct verifier/corrector, reason and evidence are required. The UI blocks the original verifier and receipts with unresolved/completed refunds, consistent with backend rules. Reversal is a financial correction, not inventory restoration or Order reopening.

**Refunds:** a refund request is separate from money paid out. Versioned processing controls preserve `UNKNOWN_EXTERNAL_OUTCOME`; the UI explicitly says not to send again and offers reconciliation rather than another transfer attempt. Completion requires outgoing reference, evidence and original-source confirmation for new manual receipts. It posts through the original Finance account atomically. No arbitrary recipient account is accepted and no second posting is offered for these completed refunds.

**COD:** existing pending-collection queue and actual collection command are reused. Payment records retain collection/custody/settlement distinctions and links to Finance's existing custody/settlement workspace. Order creation is not payment; courier cash is not settled merchant cash. Existing unposted legacy/COD Finance actions remain available only under their original capabilities and returned posting state.

## Shopper foundation and security

The actual quote review renders `PaymentMethodsUnavailable`: no selected live method, receiving account, fabricated payable or submission API. Old hardcoded wallet/demo payment UI was replaced with this safe wrapper, and dormant wallet defaults/copy actions were removed. Quotes retain unresolved tax/fees/payable; evaluated merchandise totals are never relabeled as money owed.

`SyntheticOrderPaymentPreview` accepts an explicit `SYNTHETIC_PREVIEW` model, amounts and instructions as props. It is not mounted in the public flow and states that it is not an actual payable Order and that users must not transfer. It prepares copy controls, deadline/reference, required Transaction ID, optional sender, pending/partial/paid presentation and COD unpaid-on-delivery wording. Submission stays disabled. There is no invented customer claim endpoint, screenshot requirement, PIN/OTP/password collection or promised verification SLA. Phase 05 must supply secure committed-Order authority before any real integration.

Admin reads and commands derive organization/actor/capabilities/scopes from current context; server checks remain authoritative. Owner/capability changes remount private workspaces, abort reads and reject stale responses. Read-only staff cannot use review/destination/refund mutations. Exact evidence and UUID keys remain in owner-scoped page memory, never persistent browser storage, shared journals, analytics or newly constructed URLs. Search filters retain existing UI behavior while newly entered search is not written into browser history.

One logical intent freezes the exact JSON body, UUID and owner. Double submission is guarded. Lost/malformed/5xx responses are uncertain, not success or rejection. Supported idempotent endpoints offer exact replay; amount/evidence cannot be edited while retaining the key. Legacy Finance posting receives the same key in its required body and header. Operations without replay support require authoritative reload/reconciliation instead of automatic resubmission. Closing an uncertain dialog reloads server truth. Reload intentionally loses private page-memory evidence; it does not manufacture a replacement key automatically.

Money formatting operates on decimal strings, including large values and four-place stored precision; no JavaScript floating-point total authorizes payment. All touched receipt displays preserve currency. Authorization/privacy controls are implemented locally; deployed role, proxy, log-sink and retention acceptance is still open. This is not an ASVS or WCAG certification.

## Actual verification

All financial fixtures were synthetic in a dedicated PostgreSQL **18.3** cluster on loopback port 55444. The template `maevelle_test` was empty; harnesses created random disposable databases, migrated those databases and dropped them afterward. No ordinary local Docker/VPS/staging database was used. The browser runtime used the real API, BetterAuth sessions and production-built Admin, with owner, independent reviewer and read-only viewer accounts. Diagnostic control routes exist only in the isolated script, not application routes.

Cleanup completed: the browser API closed and dropped its disposable database, the task's Admin process stopped, and the exact isolated PostgreSQL data directory was stopped with `pg_ctl`. Diagnostics and screenshot artifacts were retained. No unrelated service was stopped.

### Commands and outcomes

Commands below ran from the repository root with a synthetic `TEST_DATABASE_URL`; credentials are deliberately omitted. Package build commands rebuild their declared prerequisites. No all-package test/build or deployment acceptance claim is made.

| Check | Actual command / result |
| --- | --- |
| Integrated database/API/frontend regression | `node scripts/checkout-phase04b-verification.mjs`: **306 tests / 27 files PASS**, 123.75 seconds. [Machine record](PHASE_04B_VERIFICATION.json). Payments, Finance, Orders, fulfillment/delivery, inventory, Notifications, Account, Cart, pricing/promotions, delivery/foundation/quote and payment adapters/presentation. |
| Shopper Auth plus overlapping presentation/transport checks | `pnpm exec vitest run apps/api/src/shopper-auth.test.ts apps/admin/lib/payments/transport.test.ts apps/storefront/features/checkout/payment-foundation.test.tsx`: **19 tests / 3 files PASS**; 12 Shopper Auth tests, 7 overlap the integrated run. |
| Wishlist regression | `pnpm exec vitest run packages/database/src/wishlist/account.test.ts`: **18 tests / 1 file PASS** on its own random migrated database. |
| Final focused follow-up | `pnpm exec vitest run apps/api/src/payment-operations.test.ts apps/admin/src/payment-permissions.test.tsx apps/admin/lib/payments/transport.test.ts apps/storefront/features/checkout/payment-foundation.test.tsx`: **16 tests / 4 files PASS**; includes 3 new least-privilege markup tests and overlaps other checks. Counts must not be added as independent tests. |
| Production builds | `pnpm --filter @maevelle/admin build` and `pnpm --filter @maevelle/storefront build`: PASS. Admin rebuilt after the hydration/currency/correction fixes. The final additive confirmation-context copy was subsequently typechecked/linted; that copy was not separately rebuilt/browser-tested. |
| Types / backend compile | Focused Admin/Storefront TypeScript and backend/contracts build checks passed. Final `pnpm exec tsc --project apps/admin/tsconfig.json --noEmit --pretty false`: PASS. |
| Static checks | Focused ESLint, Prettier, `pnpm check:architecture` (13 checks), and `git diff --check`: PASS. |
| Historical migration bytes | `pnpm check:migrations`: **FAIL**, inherited baseline/18 historical byte mismatches. No old migration, hash or baseline was edited to hide it. |

The first integrated attempt encountered Shopper Auth's intentionally strict template-URL guard; that attempt was not a pass. The harness was corrected to run Shopper Auth separately against its supported empty template, and the corrected integrated run passed. An intermediate Admin build caught a duplicate formatter import; it was corrected before the successful build. Browser navigation exposed React hydration error 418 from window-derived initial tab state; using `useSearchParams` fixed it. A fresh tab on the rebuilt application reported no warning/error logs. The response-loss exercise also revealed unsafe generic 503 wording; transport now explicitly reports uncertainty.

### Browser evidence and its limits

Observed with real synthetic sessions and database operations:

- Actual readiness blockers and 30 pending claims; Next reached claim 26.
- Detail comparison and blank independent proof form; deliberate evidence review.
- A successful verification whose response was deliberately replaced by 503, followed by exact retry: one receipt and one incoming Finance movement.
- Actual receipt 120 BDT against 100 BDT obligation: 100 allocated, 20 original/current excess, Order outstanding zero.
- A 20 BDT excess refund: request → processing → unknown external outcome → evidenced original-source completion. Current liability became zero; Order outstanding stayed zero.
- Destination draft creation, self-approval unavailable, then real independent reviewer approval. Public activation stayed unavailable.
- Blank deadline proposal form, stored proposal creation, self-approval unavailable, then real independent approval.
- Final receipt displayed original excess 20 versus remaining liability zero, verified transfer reference and completed refund; reversal was unavailable because of the refund.
- Real read-only viewer saw permission-required states for claim review and private destinations.

Browser screenshots: [desktop](C:/Users/devas/.codex/visualizations/2026/11/04/01a1a79a-4505-7c52-94e5-044cd0612b16/checkout04b-desktop.png) and [mobile](C:/Users/devas/.codex/visualizations/2026/11/04/01a1a79a-4505-7c52-94e5-044cd0612b16/checkout04b-mobile.png). These are local artifacts, not deployed URLs. [Structured browser evidence](PHASE_04B_BROWSER_VERIFICATION.json) records widths and side effects.

Stable browser observations covered 320, 390, 768, 1024 and 1440 widths without horizontal content overflow. At 320, the verification dialog's content width and scroll width were both 258 pixels; its bottom actions remained reachable through internal scrolling. At 390 the main width/scroll width were both 375; at 768 both 497; at 1024 both 753. Keyboard Tab moved through labeled independent proof fields. These checks do not establish physical touch/keyboard behavior, native zoom, screen-reader navigation, all modal focus-return paths, contrast conformance or owner visual acceptance.

Browser runtime was started before the final additive currency read field; financial journeys exercised that prior read DTO with the current backend money operations. Final API tests/typechecks cover the currency read addition. The browser did not independently repeat every partial/late/duplicate/reversal/COD/role-revocation workflow against the final build. Backend/API regression evidence covers important money/tenant/race invariants, but is not a substitute for those missing UI journeys.

No representative load, production ingress, physical COMMIT connection loss, natural session-expiry matrix, role revocation during a pending mutation, full account/organization switch timing matrix or full Worker/browser overlap experiment was performed. The controlled 503 happens after a successful application commit; it is not a physical PostgreSQL wire-loss test.

### Synthetic financial facts and negative side effects

Direct SQL after browser reconciliation: receipt count **1**, received **120.0000**, completed refund **20.0000**, Finance transaction count **2** (incoming receipt and outgoing refund). Receipt UI showed allocation **100.0000**, remaining liability **0.0000**, Order outstanding **0.0000**. Exact retry did not create a second receipt or duplicate incoming post.

The isolated diagnostic read returned **0 Storefront Checkout Orders, 0 inventory reservations, 0 promotion redemptions, 0 converted Carts, 0 `orders.order.placed` events**. Thirty Orders were deliberately constructed by the synthetic fixture for Admin testing; they were not created by Checkout. These assertions do not prove all production analytics sinks are safe; none were contacted.

## Acceptance register

Statuses describe this assignment's local evidence; PASS does not mean public activation approval.

| # | Required outcome | Status | Evidence / remaining limitation |
| --- | --- | --- | --- |
| 1 | Admin uses real backend operations | PASS | Actual sessions/API/PG receipt, refund, destination and policy flows. |
| 2 | Reuse Payments/Orders navigation | PASS | Existing Payments route, Order links and Finance workspace. |
| 3 | Truthful readiness/blockers | PASS | Actual ineligible methods; activation remains blocked. |
| 4 | Secure receiving draft creation | PASS | Real authorized synthetic draft; capability and validation retained. |
| 5 | Separate authorized approval actors | PASS | Self unavailable; actual second-actor destination/policy approval. |
| 6 | Nagad restrictions | PASS | UI blocks approval and backend regression retains provider block; no new provider validation claimed. |
| 7 | No unsupported Activate action | PASS | No activation control/API introduced. |
| 8 | Operating-policy proposals/approval | PASS | Actual stored proposal selection and independent approval. |
| 9 | Paginated pending queue | PASS | 30 rows, 25-row page and real page two. |
| 10 | Testimony distinct from evidence | PASS | Separate detail sections; blank independent proof. |
| 11 | Management review states | PARTIAL | Real operations/forms and API/domain checks; all state transitions not repeated in browser. |
| 12 | Independent actual receipt | PASS | Actual 120 BDT evidence and atomic Finance receipt with response-loss replay. |
| 13 | Partial/excess/late accuracy | PARTIAL | Excess/refund browser proof and domain tests; partial/late browser journeys remain. |
| 14 | Duplicate receipts cannot approve twice | PASS | Real retry remains one receipt; permanent reference-fence/race domain regression. Full two-reviewer browser race unperformed. |
| 15 | Corrections/exceptions controls | PARTIAL | Current balance, independent actor/refund blockers; actual separate-actor reversal browser journey remains. |
| 16 | Refund unknown outcome safe | PASS | Browser unknown state cannot restart payout; evidenced completion and actual refund posting. |
| 17 | COD collection/settlement distinction | PARTIAL | Reused real queue/collection/Finance paths and regression; end-to-end courier browser journey unperformed. |
| 18 | Least-privilege permissions | PARTIAL | API/domain/markup checks and actual read-only denial; pending revocation and deployed-role breadth open. |
| 19 | Exact money/terminology | PASS | String formatter tests, explicit actual/original/current balances and currency. |
| 20 | Safe idempotency/unknown responses | PASS | Frozen owner/body/key tests and real successful-commit 503/retry. Full browser fault matrix open. |
| 21 | Protect sensitive client data | PARTIAL | Memory-only private intents, owner fences, safe URL/error handling; deployed sink/retention audit open. |
| 22 | Shopper Phase 05 boundary | PASS | Unavailable live section; unmounted synthetic-only component; disabled submit. |
| 23 | No public collection/purchases | PASS | No public claim API, purchase gate unchanged, negative DB assertions. |
| 24 | Meaningful integration/regression | PASS | Listed actual suites/builds/browser flows; not full production-runtime proof. |
| 25 | Accurate accessibility/responsive acceptance | PARTIAL | Five widths and keyboard smoke; human AT/device/zoom/contrast and owner review open. |
| 26 | Existing Checkout/commerce integrity | PARTIAL | Focused Cart/Wishlist/Auth/Orders/Finance/Checkout regression passes; complete prior browser suites not rerun. |
| 27 | Migration/deployment limits visible | PASS | Historical byte check remains FAIL; no persistent/deployed changes. |
| 28 | Previous PARTIAL gates preserved | PASS | 01B/02B/03A/03B/04A remain PARTIAL. |
| 29 | Provider/tax/legal/operating approvals | BLOCKED | External approvals, final payable and real operational acceptance unresolved. |
| 30 | Exact Phase 05A handoff | PASS | [Backend handoff](PHASE_05A_HANDOFF.md); no placement implementation. |

## Remaining decisions and next work

External merchant/account category/allowed collection action, provider fees/limits, Nagad availability, legal/tax/invoice/rounding, real coverage/courier compatibility, production payment/review windows, refund/correction operations, retention/privacy and historical null-review-policy remediation remain explicit gates. Internal fixture approval does not settle these decisions. Prior Phase 01B/02B/03A/03B/04A acceptance stays PARTIAL; Wishlist/Cart and Product Completion gates are not promoted.

Complete the missing browser financial/state/race and human accessibility/device review independently. Phase 05A is a separate backend assignment requiring transactional committed Orders, version revalidation, final payable and secure Order access/recovery. Do not activate the synthetic presentation, reuse Order UUIDs as bearer credentials or bypass the deliberately blocked payment-obligation boundary.

## Changed-file inventory

Admin: `payments-console.tsx`; new payment query/UI/command, claim, destination, policy, receipt, refund and record modules; `lib/payments/transport.ts` and tests; permission tests; existing payment detail, queue, record/filter and retained legacy dialog/settings modules (focused formatting/import cleanup included).

Storefront: quote review integration, unavailable payment step/section wrappers, synthetic payment-foundation component/tests and removal of dormant hardcoded wallet defaults/copy behavior in `use-checkout.ts`.

Backend/contracts: `checkout-payment.ts`; API payment-operation reads/tests and private URL logging; database payment exports, `workspace.ts`, queue metadata and receipt verifier identity. No financial algorithm or migration was replaced.

Evidence: isolated runtime/verification scripts, this report, verification/browser JSON, Phase 05A handoff, checkout README/scenario/security notes and concise Product Completion resume state. The working-tree diff remains the exact reviewable source inventory.
