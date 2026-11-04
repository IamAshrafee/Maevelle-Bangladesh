# Scenario and acceptance register

## Phase 02B execution addendum — 2026-11-04

Overall **PARTIAL**; Phase 01B remains PARTIAL. See the [02B report](PHASE_02B_IMPLEMENTATION_REPORT.md) and [machine-readable evidence](PHASE_02B_VERIFICATION.json). The Phase 00 scenarios below remain a specification, not blanket passing evidence.

| Executed scenario | Evidence and status |
| --- | --- |
| Guest Bangla contact/mobile/address, save/reload; Cart and Buy Now | Real isolated API/browser PASS; Bag unchanged |
| Search English/Bangla, keyboard, clear, pagination; absent approved coverage | Browser PASS; real reference API, synthetic dataset only |
| Saved select/create/edit/default/remove, CHANGED/REMOVED snapshot | Browser PASS; explicit actions and retained purchase snapshot |
| After-commit 503, exact retry, 409 review and invalid mobile correction | Browser PASS; local fields retained and no fresh-key automatic replay |
| A/B normal switch and switch away from uncertain committed save | Browser PASS; previous private marker/retry absent |
| Ignored-abort delayed private read/write and changed-owner suspension | Controller tests PASS; exact delayed-response browser timing and OS-background cloak NOT VERIFIED |
| Forged money/internal fields, guest book denial, string revisions, no PII journal, 429 | Focused adapter/controller/API tests PASS; no full browser status matrix claim |
| Responsive saved-form layout | Six widths including landscape; no horizontal overflow; one form; 16px mobile fields |
| Native zoom, human AT/hardware/browser breadth, historical receipt, production runtime | NOT VERIFIED; inherited Phase 01B requirements remain open |
| Delivery creates no Orders/payments/stock/promotion/conversion/purchase events | Browser database zero facts and API assertions PASS; separate Orders regression isolated |

The full focused run is 200 tests in 16 files. Screenshots precede the final draft-change/revocation clearing hardening, which passed controller tests and the final build. No purchase activation, persistent migration or deployment.

All scenarios below have execution status **NOT VERIFIED in Phase 00**. They are specification coverage, not passing tests. E31 in the audit identifies overlapping pre-existing test source; future runs must record command, commit, environment, assertion and artifact, plus whether PostgreSQL/browser/provider was real or mocked. `Pxx` refers to paired phases in the roadmap. Shared security requirement for every row: tenant/current-owner or explicit Admin capability, bounded input, private no-store/PII-safe diagnostics and exact money. Additional controls listed per case. Failure-risk column also identifies why the case is required.

| ID / phase | Preconditions and action | Expected backend outcome / failure risk | Frontend recovery | Admin / Worker and security / acceptance evidence |
| --- | --- | --- | --- | --- |
| S01 P01–05 | Guest, eligible Bag, COD, supported address | One unpaid Order, snapshots, reservation, conversion and receipt atomically; risk fake success | No login; exact reference/amount/status only after commit | Staff normal confirmation; DB conservation + real browser guest journey |
| S02 P01–05 | Active account, eligible Bag | Linked account Order; no guest-token bypass or phone-based account linking | Autofill only authorized info, explicit save | Cross-account/tenant denial + browser account flow |
| S03 P01–05 | Buy Now variant+quantity while Bag populated | One source-owned draft/Order, Bag version/items unchanged | Show selection and recover unavailable variant | DB compare Bag before/after success/failure, mobile PDP browser |
| S04 P01 | Empty/expired/merged/converted Bag, hidden variant | No eligible draft/submission, no reservations | Explain reason, return to Bag/PDP | API manipulation tests; no new side effects |
| S05 P02 | Minimal valid BD address, Bangla name/local phone | Canonical phone, correct geography/area/rate; no unnecessary required fields | Autofill/inputmode and inline validation | API valid/invalid context cases + actual courier mapping fixture |
| S06 P02–03 | Unsupported area, inactive/wrong-country node, stale saved address | No serviceable quote/Order; don't use broad fallback accidentally | Reselect area/support, preserve other fields | Tariff simulator and hierarchy tests; no provider call in transaction |
| S07 P03 | Price/promotion/rate/tax/destination changes after quote | New review outcome, no Order/stock mutation | Show itemized old/new and accept new quote | Mutate synthetic config concurrently; receipt replay of review stable |
| S08 P03–05 | Bag edited in another tab after quote | Exact revision conflict; no consume/clear later edits | Refresh items/review; don't silently replace | Deterministic Cart edit/conversion race test |
| S09 P05 | Double click / two identical concurrent same-key requests | One Order, receipt, allocation/redemption/event set | Disabled pending action plus canonical response | PostgreSQL concurrent requests + counts, UI click race |
| S10 P05 | Same key reused with different draft/quote/payment content | 409 key conflict, original outcome unchanged | Recover old result; new key only for reviewed new intent | Canonical digest adversarial body variations |
| S11 P05 | Two keys for same Checkout, two tabs | Unique Checkout Order binding, no second Order | Existing committed receipt/status | DB uniqueness + request race, no duplicate notifications |
| S12 P05 | Transaction commits; connection/HTTP/cookie response lost | Same-key receipt recovers original even after Cart conversion | “Checking order status”; persist nonsecret intent key, retry same key | Cut response after COMMIT, reload browser, DB one-Order assertion |
| S13 P05 | Replay after draft expiry/cleanup with valid Order authority | Recover retained committed outcome; expired grant denies private data | Restore status or verified recovery | Clock-controlled expiry/retention/replay tests; no resurrected source |
| S14 P03–05 | Two shoppers buy final unit; reverse line lock ordering | One winner; loser no partial Order/payment/redemption | Out-of-stock review with eligible alternatives, no fake reservation | Real PG barrier race + conservation; bounded deadlock retry |
| S15 P03–05 | Last limited coupon used concurrently | One redemption, totals/allocations consistent | Explain coupon change/requote | Real PG coupon race + no residual loser side effects |
| S16 P05 | Inject error after header/reserve/promo/intent/convert | Whole transaction rolls back | Retain form, retry same intent if uncertain | DB snapshots incl audit/outbox; fault stage harness |
| S17 P01–05 | Sign out or A→B while draft update/place/read in flight | Linearization respects authority fence, no A data to B | Cancel/clear private state, reauthenticate or explicit new guest | Race with session revoke + delayed response browser test |
| S18 P01 | Explicit guest adoption/sign-in and separate Bag merge | Rotate grant, one owner, no automatic Cart merge | Review ownership transition; stale guest views removed | Both proofs + stale grant/parallel adoption tests |
| S19 P04–06 | COD selected and permitted | Due remains outstanding; no confirmed payment at placement/delivery alone | “Pay on delivery”; no paid badge | DB payment count zero; fulfillment-gate integration |
| S20 P04–06 | COD restricted/risk high or courier cannot collect | Reject method or hold by approved policy; never bypass via direct payload | Choose eligible method, neutral reason | Customer/courier restriction tests, no sensitive risk details |
| S21 P04–06 | Delivered COD collected, partial remittances and fees | Separate collection/custody/settlement; no double posting | Accurate status summary, no bank-received inference | Existing settlement operations + repeat collection/remittance tests |
| S22 P04–06 | COD fails/returns/cancels after dispatch | No automatic stock restoration or refund for unreceived cash | Show failure/support/return progress | Returns inspection + Inventory/Finance conservation |
| S23 P04–05 | Manual order placed then reference submitted | Pending obligation and claim, no paid state | Exact instructions/ref/deadline, pending-review feedback | DB no confirmed Payment before independent verification |
| S24 P04–06 | Fake/incorrect reference or customer screenshot | Reject/pending, preserve evidence; no dispatch | Correct reference/new claim; safe reason | Review permission, independent statement requirement tests |
| S25 P04–06 | Same external transfer claimed on two Orders, concurrent reviewers | One receipt/payment, duplicate claims retained | Safe claim status, no other shopper info | Unique receipt constraint under actual concurrent transactions |
| S26 P04–06 | Partial then remaining receipt / overpayment | Accurate allocations/outstanding/unallocated liability, no excess revenue | Remaining balance or support/refund notice | Finance totals + allocation/refund exception acceptance |
| S27 P04–06 | Wrong destination / paid without submitting reference | No automatic paid inference; independent receipt-match exception | Support with Order ref; no repeated-payment demand while uncertain | Reconciliation with owned/unowned destination fixtures |
| S28 P04–06 | Unpaid unclaimed manual Order reaches deadline | Semantic cancel/release once; no partial financial state | Expired payment instructions, fresh stock review option | DB time, Worker repeated expiry, no generic orphan reservation |
| S29 P04–06 | Fake pending claim repeatedly submitted near deadline | No indefinite stock renewal; review deadline/escalation | Honest review status and next update | Abuse limits + virtual-time aging; no receipt destroyed |
| S30 P04–06 | Verify/partial receipt races timeout/cancel | One locked outcome; real received money retained/refund exception | Committed current state, reload safe | Real PG race Order/intent locks and conserved stock/cash |
| S31 P04–06 | Late receipt for cancelled/expired Order | Real money recorded as exception, no automatic resurrection/stock promise | Refund/reorder choice after stock review | Receipt/Finance journal + authorized compensation evidence |
| S32 P06 | Cancel paid Order, duplicate refund, provider outcome unknown | Refund obligation not completion; capped/idempotent payout, unknown quarantined | Refund pending/confirmed truthful | Concurrent refund + Finance postings; manual payout evidence |
| S33 P06 | Reviewer/content editor changes receiving account or self-approves | Denied unless explicit audited sole-Owner policy | Admin capability-aware controls, server still authoritative | Role/tenant/revocation/MFA tests; destination audit history |
| S34 P04–06 | Approved destination suspended/compromised | New quotes/placements blocked; historical snapshots retained | Stop unsafe instructions, show support | Incident fixture, affected-Order report and rotation tests |
| S35 P02/06 | Saved-address edit and Order correction | Profile update doesn't alter historical Order; correction revalidates charges/carrier | Explicit save/correct outcomes, no hidden address merge | Owner checks + pre/post-dispatch correction tests |
| S36 P05 | Guess order ref/phone/UUID or stolen expired link | Generic denial or verified challenge; no tenant collision/PII | Accessible recovery request, no existence disclosure | Enumeration/rate/no-store/referrer tests + collision fixture |
| S37 P05–08 | DB unavailable/pool full/serialization/deadlock/COMMIT unknown | Bounded safe error or receipt lookup, no new key retry | Preserve form, distinguish unknown from failed | Fault injection, SQL lock metrics and receipt assertions |
| S38 P04–08 | Worker crash before/after event effect, duplicate lease/delivery | Local once-only effects, bounded retry, poison isolation | Order truth remains usable | Kill/restart two consumers + receipts/backlog/lease assertions |
| S39 P05–08 | Notification/courier outage after commit | Order remains committed; retry/reconcile outside transaction | Confirmation not blocked by sending notification | Provider mock timeout/unknown; no duplicate sends where supported |
| S40 P07 | Refresh/retry/browser+server/Worker replays conversion | One qualified purchase per Order policy, no claim-as-paid | No fake conversion on button click/demo/error | Destination uniqueness + vendor test/debug evidence separately |
| S41 P07 | Consent denied/withdrawn, forged purchase or attribution | Business record intact, no unauthorized export/browser money fact | Consent choice preserved, checkout functional | Capture+delivery consent tests and PII inspection |
| S42 P01–08 | Foreign Origin, encoded paths, amount/owner/status injection | Fail closed, no action or data leak | Clear generic validation, retain legitimate input | Raw API adversarial suite; normalized ingress tests |
| S43 P01–08 | Bots flood initiation/quotes/track/challenges/claims on two API replicas | Durable quotas and business caps; bounded resource cost | Retry-After/actionable recovery | Spoofed IP/forwarding tests + restart quota persistence |
| S44 P02–08 | 320/390/768/1024/1440 widths, landscape/keyboard/zoom/AT | Same workflow and valid API state | No clipping/hidden action, focus/errors/live feedback, 44px primary targets | Real browser/keyboard, VoiceOver/TalkBack or NVDA; screenshots + owner review |
| S45 P01–08 | Offline/interrupted form, blocked storage/cookies, reload pending | No invisible success/replay; owner-private draft server truth | Recover nonsecret key, explain cookie need, save/retry feedback | Browser offline, storage exceptions, slow network, stale fetch race |
| S46 P08–09 | Sensitive token/contact canary through 4xx/5xx/502/cache | No secret in logs/traces/cache/referrer; private responses | No PII in URL/history/analytics | Authorized synthetic canary search across every sink; no live PII scan |
| S47 P09 | New schema with previous compatible images / old Checkout consumer | Controlled compatibility or fail closed; existing Orders still operable | Gate unavailable paths; historical confirmation adapter | Fresh+populated upgrade, mixed-version API/Worker contract fixtures |
| S48 P09 | Backup restore or rollback restores revoked credentials | Reapply revocations/deletions before reopen; preserve receipt/outbox identity | Safe reauthentication/recovery | Authorized isolated restore, ledger+grant+retry assertions |
| S49 P09 | New Checkout disabled after rollout incident | Stop new submissions; existing status/claims/financial operations remain available safely | Honest unavailable message + status recovery | Feature-gate and prior-compatible-release drill; no schema reversal |
| S50 P03–06 | Zero delivery/zero discount/rounding residual/tax policy | Exact totals, zero preserved, 2-place payable matches obligation | Same amount on form/instructions/receipt | Property examples and ledger equation, signed correction cases |

Phase acceptance must include a real backend for B phases. Unit mocks do not establish inventory, financial or transaction correctness. Live provider/courier/legal readiness and human visual/accessibility judgment remain separate gates even after synthetic tests pass.

## Phase 02A backend evidence (2026-11-04)

[Report and scoped acceptance](PHASE_02A_IMPLEMENTATION_REPORT.md#9-scenario-acceptance): S05/S06 delivery validation and S35 saved-address snapshot/ownership are PASS for implemented backend scope on isolated PostgreSQL 18. S45 server replay/rollback/revision/revocation portions pass; full browser interruption/storage/identity display remains PARTIAL. S44 frontend/device/AT remains NOT VERIFIED in 02A. These do not close Phase 01B or later purchase/provider scenarios. [API handoff](PHASE_02A_BACKEND_CONTRACT.md) defines exact conflicts and explicit re-selection behavior.
