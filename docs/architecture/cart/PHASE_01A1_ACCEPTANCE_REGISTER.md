# Phase 01A.1 acceptance register

2026-11-02. **PARTIAL — 16 PASS / 3 PARTIAL / 0 FAIL / 0 BLOCKED.** These19 gates assess this closure only. Historical Phase00/01A/01B registers remain unchanged. Security refusal is not account feature compatibility or successful legacy recovery.

| ID | Gate | Status | Evidence / remaining limit |
| --- | --- | --- | --- |
| A1-01 | Git and unrelated work preserved | PASS | 2,004-file baseline; preservation manifest, no missing/unrelated changed files; main/HEAD unchanged |
| A1-02 | Legacy policy and trust map finalized | PASS | Audit/design: retirement, no adoption based on supplied bearer; exact limitations disclosed |
| A1-03 | Fixed-cookie authority removed | PASS | API refusal; Chrome C01/C04; no response token/new cookie |
| A1-04 | Rename/replay cannot evade retirement | PASS | Prefixed persisted hash, SLOT_V1 predicate, exact suffix; C02/DB/old reader0 |
| A1-05 | New guest functionality preserved | PASS | B01–B17 rerun, guest facade/API tests, C03 |
| A1-06 | Cryptographic issuance and production cookie attributes | PASS | Existing random256-bit/hash; HTTPS Chrome Secure/HttpOnly/__Host/host/path/Lax/TTL and document.cookie denial |
| A1-07 | Irreversible revocation/concurrency | PASS | DB lifecycle trigger/row lock, concurrent mutation/retirement, duplicate revokers, C07 |
| A1-08 | Expiry and delayed response protections | PASS | Post-lock wall-clock expiry; C08 shopper TTL; C09 delayed fixed cookie; B07 delayed new slot |
| A1-09 | Tenant and owner isolation | PASS | Foreign tenant/context/wrong slot tests, shared Checkout resolver, no public-ID authority |
| A1-10 | Multiple authorities handled without guessing | PASS | Mixed fixed/invalid slots refuse; several valid slots explicit context only, B07 and API |
| A1-11 | Strict authenticated identity failures | PASS | Resolver outage, actual expired/invalid shopper and suspended mapping; no guest substitution |
| A1-12 | Guest/account transitions/in-flight display | PASS | Actual A/B/logout, B08/B15 and controller epochs rerun; no account attachment |
| A1-13 | Checkout-facing authorization compatibility | PASS | All eight current Cart-consuming routes guarded; guest201/account409/error classes;22 selected Orders regressions |
| A1-14 | Preserved data and migration correctness | PASS | Fresh installs; populated upgrade/CI12 migrations; quantities/coupons/revisions/receipts retained, old writers denied |
| A1-15 | Focused verification and browser evidence | PASS |114 passing selected tests;26 browser scenarios; builds/types/lint/history/architecture; limits explicitly recorded |
| A1-16 | Scope/no external operations | PASS | No dependency install, frontend redesign, Clear, account merge, commit/push/deploy/VPS/shared DB changes |
| A1-17 | Legitimate historical guest continuity | PARTIAL | Stored intent/receipts preserved, but all pre-cutover credentials lack independent issuance proof, including01A slots. No safe automatic recovery currently available |
| A1-18 | Signed-in functional Cart compatibility | PARTIAL | Explicit controlled unavailable contract is implemented, not signed-in Cart persistence. Phase03 required for functional account Cart/merge |
| A1-19 | Operational/release closure | PARTIAL | Local security tests pass; persistent cutover must accept continuity loss and follow stop-writers/backup/forward repair. Staging/proxy/restore not executed or authorized |

T04 legacy fixation and T30 independent Checkout authority bypass are addressed in tested local paths. T05 legacy hash replay is revoked; stolen active new bearer, trusted-origin compromise and deployed proxy/secrets remain normal separate boundaries. No known newly introduced Critical/High finding is left knowingly accepted. The unexecuted operational cutover and unavailable legacy recovery keep integrated readiness partial; this is not a declaration that all historical security/release risks are closed.

## Precise remaining closure

1. Resolve the customer continuity policy before persistent cutover: retain refusal and explicitly accept inaccessible pre-cutover state, or separately design a customer-verifiable recovery channel. Login/public IDs/old tokens alone cannot satisfy it. Do not reverse retirement.
2. Implement owner-aware account persistence/merge in separately authorized Phase03. Current409 is a verified safe contract, not that feature.
3. When deployment is authorized, stop old writers, back up, apply3214 once, deploy compatible API and verify actual TLS/proxy/cookies and forward recovery before traffic. Old-image rollback cannot reverse this security cutover.

Phase01B.1 still owns high-zoom reflow and assistive/touch review. Phase02A can use the protected new guest foundation but must supply atomic Clear with owner/version/key/receipt semantics. Neither is implemented here.
