# Phase01B acceptance register

2026-11-02. **PARTIAL —14 PASS /2 PARTIAL /0 FAIL /1 BLOCKED.** These are17 Phase01B gates, not edits to Phase00's24 gates or Phase01A's16 gates. Inherited security status remains unchanged.

| ID | Gate | Status | Evidence |
| --- | --- | --- | --- |
| B-A01 | Preserve baseline/unrelated dirty work | PASS | Verification manifest:1971 baseline files, zero missing; only declared source/docs changed; branch/HEAD unchanged |
| B-A02 | Shared authoritative frontend controller/subscriptions | PASS | Factory tests; primitive count/busy/epoch hooks; one browser store |
| B-A03 | Existing five mutation/API compatibility | PASS | B02/B05/B13/B17 actual API + PostgreSQL; additive adapter, unchanged backend DTO/routes |
| B-A04 | Concurrent cold bootstrap and late cookies | PASS | B07 distinct real slots and explicit selection; B09 one slot with Web Locks |
| B-A05 | Cookie rejection and lost guest access | PASS | Chrome UserPreferences blockedReasons, zero slots/no success; B11; ownership-rejection latch tests |
| B-A06 | Immutable mutation identity and recovery | PASS | B03/B04/B14 and factory tests; no duplicate commit, manual exact replay |
| B-A07 | Revision/evaluation conflicts and no-op | PASS | Factory price-only/out-of-order/stale tests; B06/B10 real conflicts/no-op receipts |
| B-A08 | Response epochs, navigation and unmount safety | PASS | Late owner response factory test; B08/B13/B16 |
| B-A09 | Auth transitions/account switch | PASS | B08/B15 actual synthetic shopper A/B; controlled ACCOUNT_CART_NOT_READY, no fallback/merge |
| B-A10 | Cross-tab coordination and bounded hints | PASS | B09 authoritative header update; optional storage/channel hints, trailing debounce, visible30s poll |
| B-A11 | Header/PDP/page and sample drawer removal | PASS | B02/B05/B13/B17; production header uses /cart, drawer import only design-system route |
| B-A12 | Privacy/authority/cache safeguards | PASS | B02/B10/B16, browser cookie checks, journal tests and source review; no backend relaxation |
| B-A13 | Type/lint/tests/architecture/build/whitespace | PASS |34 focused tests; production build; storefront tsc; targeted ESLint;13-package architecture; git diff --check |
| B-A14 | Mobile/accessibility closure | PARTIAL | Normal320/390/768/1280, keyboard/live/reduced-motion and screenshot pass; CSS-zoom header overflow706/640, real screen-reader/browser-menu zoom/physical touch review open |
| B-A15 | Browser lifecycle recovery | PASS | Explicit hidden/visible Chrome event test plus B16 history; physical OS-tab and other-engine behavior not certified |
| B-A16 | Atomic Clear integration | BLOCKED | Backend has no atomic Clear/receipt contract; local unsupported rejection tested, no fake route/delete loop. Precise Phase02A prerequisite, not a silently omitted UI action |
| B-A17 | Integrated legacy credential/release gate | PARTIAL | Phase01A High legacy adoption/retirement/fixation parity and signed-in compatibility remain unresolved; not weakened or claimed fixed |

The implemented guest profile has strong focused evidence; the entire Phase01B/integrated foundation is **not PASS**. No newly introduced unresolved Critical/High issue is knowingly accepted. Source fixes for policy-denied Web Locks, ownership-rejection latch and uncertain-read recovery have regression coverage.

## Smallest closure plan

1. Targeted backend legacy-security closure: approve retirement/adoption policy; enforce fixation parity and signed-in compatibility; real-browser old-cookie/account-switch proofs. Do not use a frontend selector/storage workaround.
2. Close header high-zoom reflow and perform manual browser zoom, assistive technology and physical mobile checks for implemented feedback/actions.
3. Phase02A supplies atomic Clear with owner/version/idempotency/receipt semantics, then add controller/browser integration. Current unsupported behavior remains explicit until then.
4. Preserve this Chrome evidence and add other engine/real-device checks at the applicable broader frontend acceptance gate.

Phase02A guest-domain work may start using this adapter; integrated release/account work must respect the inherited High boundary. No deploy/production approval is implied.
