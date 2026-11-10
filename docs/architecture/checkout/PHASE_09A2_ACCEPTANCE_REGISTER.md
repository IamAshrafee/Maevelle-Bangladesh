# Phase 09A.2 acceptance register

2026-11-10. **PARTIAL locally; public purchasing, collection and release BLOCKED.** Verdicts describe local implementation/evidence, not financial-policy approval. See [report](PHASE_09A2_IMPLEMENTATION_REPORT.md) and [verification ledger](phase09a2-evidence/verification.json).

| # | Outcome | Verdict | Evidence / limit |
|---|---|---|---|
| 1 | Exact retail contracts | PASS | Shared decimal-string presentation and typed discovery/eligibility projections. |
| 2 | Whole-BDT display | PASS | Integer amounts omit decimal suffix; actual PDP/Cart and Admin browser checks. |
| 3 | No fractional truncation | PASS | Significant fractions and large digits preserved; invalid whole authority flagged. |
| 4 | Historical fractions distinct | PASS | Exact fraction retained with presentation kind/accessible explanation; no normalization. |
| 5 | Cost precision | PASS | Internal authoring/storage unchanged; explicit exact display supports eight fractional digits. |
| 6 | Catalog/PDP | PASS | Shared Price/Money and exact minimum selection; actual seeded price299 browser case. |
| 7 | Cart/Wishlist | PARTIAL | Cart browser and Wishlist presentation updated; latest broad Shopper/Wishlist auth failures remain open. |
| 8 | Provisional quote | PASS | Quote text remains nonfinal; exact components do not become a final payable. |
| 9 | Final payable/obligation | PASS | Server placement regression retained; whole mismatch prevents usable review. |
| 10 | Rounding presentation | PASS | Signed nonzero exact adjustment separate from subtotal, discount, tax and final payable. |
| 11 | Active retail mutation policy | BLOCKED | Prepared validator remains inactive pending approved authoring policy. No frontend-only integer restriction. |
| 12 | Existing prices preserved | PASS | Read-only paginated audit and product-editor navigation; no updates/import normalization. |
| 13 | Confirmation authority | PARTIAL | Existing private receipt/status path extended; successful public confirmation remains blocked. |
| 14 | Actual cash vs waiver | PASS | Actual local81/80/1/0 read and separate figures. |
| 15 | Customer settlement | PASS | Server-owned amounts/classification; no waiver inferred from due0 or intent status. |
| 16 | Partial cash not fully paid | PASS | PARTIALLY_PAID coexists with Settled with adjustment; false COD full-collection copy removed. |
| 17 | COD/wallet separation | PASS | COD has no wallet instructions/claims; cancelled/refunded Orders are not asked to pay again. |
| 18 | Admin summary | PASS | Existing payment/Order contexts load private balance; no manually entered UUID. |
| 19 | History | PASS | Bounded private requests/application/reversal history, evidence and non-cash reference. |
| 20 | Policy discovery | PASS | Scoped manage/review capability, strict bounded pagination, no-store and status/effectivity. |
| 21 | Server eligibility | PARTIAL | Server accurately reports disabled activation and reasons; active eligibility cannot be enabled here. |
| 22 | No unapproved application | PASS | Disabled control and real HTTP POLICY_BLOCKED422; no activation toggle/override. |
| 23 | Capabilities | PASS | Backend checks and isolated unauthorized UI/API tests. |
| 24 | Independent policy review | PASS | Independent backend approval retained; proposal/review UI never claims activation. |
| 25 | Idempotency/recovery | PARTIAL | Existing owner-scoped in-memory command retains exact reversal intent; new application disabled. Full browser lost-response correction not exercised. |
| 26 | Concurrent settlement | PASS | Existing real PostgreSQL two-actor/unique-memorandum tests retained. |
| 27 | Corrections | PARTIAL | Authorized waiver reversal UI uses existing semantic endpoint. No posted/remitted or internal-only COD correction shortcut added. |
| 28 | Courier discrepancy | PASS | Separate custody/remittance explanation and preserved domain regression. |
| 29 | Refund cap | PASS | Genuine receipt80 cap retained; waiver is not refundable money. Documentary policy still outstanding. |
| 30 | Finance truthful | PASS | Non-cash operational memorandum explicitly distinguished from receipt/recognized expense. |
| 31 | No duplicate conversion | PASS | No new commerce emission; actual waiver/domain tests and no-marketing browser check. |
| 32 | Owner isolation | PARTIAL | Existing request ownership/capability fencing retained. Latest broader auth failures and full browser organization switch remain open. |
| 33 | Private fields | PASS | Customer rounding whitelist omits approval/invoice evidence; no staff reasons/Finance IDs in customer projection. |
| 34 | Responsive/accessibility | PARTIAL | Actual320/390/768/1280, mobile policy form, keyboard focus, dark/forced-colors/reduced-motion screenshots. Native zoom, human AT and physical devices not accepted. |
| 35 | Browser/API integration | PARTIAL | Fifteen actual local browser cases and disposable PostgreSQL/API coverage; live financial success intentionally blocked. |
| 36 | Financial regressions | PARTIAL | Financial selection recorded in ledger; broader latest rerun has open auth failures and a pool connection timing failure that passed isolated recheck. |
| 37 | Production builds | PASS | Both application builds executed; no deployable immutable candidate inferred. |
| 38 | Migration/security/tooling | PARTIAL |75/51 history, fresh schema,24 populated upgrades,28 tooling and source guards pass locally; unrelated concurrent auth lint and broader integration remain open. |
| 39 | No live operation/deployment | PASS | Task-owned synthetic runtime only; no commit/push/publication/persistent migration/VPS operation by this agent. |
| 40 | Report/handoff | PASS | Current limitations and separate policy, browser and staging gates preserved. |

## Requested test coverage boundaries

The 56 requested cases are not claimed as 56 separate passing UI journeys. Monetary1–10 and13–15 have shared/component/placement evidence;11–12 active whole-price enforcement remains BLOCKED and16 policy rollover is covered by existing server review fences, not a newly approved live policy. Cash17–24/26–31/33–44 combine presentation, route and existing actual PostgreSQL regressions; the browser verifies read presentation and rejection, not financial activation. Proposal25 is visibly inactive; complete approval submission/browser recovery32 and pagination/reversal interactions35–37 are not fully exercised as browser mutations. Privacy45–49 retain existing owner-scoped infrastructure and private DTO minimization, but full switch/revocation/browser-storage acceptance remains PARTIAL. Production gates50–52 are preserved. Regression53–56 has current financial evidence plus the explicitly open broader auth failure; overlapping runs are never added together.
