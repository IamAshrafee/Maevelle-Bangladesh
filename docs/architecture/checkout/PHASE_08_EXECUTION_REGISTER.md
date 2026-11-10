# Phase 08 execution register

Opened 2026-11-10 before implementation. Baseline main `038087c288da33787de85b1e81ec880a911e4e78`, dirty 06B/07A/07B work preserved, migration tail 3225. No external/persistent operations authorized. Status describes evidence, not production approval.

| ID / severity | Classification / owner / scenarios | Existing evidence and reproduction | Proposed correction / required verification | Initial status / residual risk |
| --- | --- | --- | --- | --- |
| H01 P0 | Test infrastructure / Database history | Run migration history checker: manifest + 18 checkout byte mismatches; autocrlf=true | Compare Git blobs, working bytes and anchored hashes; constrain supported checkout canonicalization; tamper regressions | FAIL / release integrity gate |
| H02 P0 | Test infrastructure / Database upgrade | Generic runner lacks 3221 fixture | Genuine populated immediately prior schema, preservation + constraints, sequence through tail and no-op | FAIL / upgrade acceptance absent |
| H03 P0 | Test infrastructure/security / fixture scripts | Scanner identifies eight synthetic assignments | Inspect without exposing values, generate ephemeral credentials; retain scanner and test detection | FAIL / no broad ignores permitted |
| H04 P0 | Reliability/data integrity / Checkout S38–S40 | Existing real PostgreSQL atomic/concurrency/rollback tests | Expand actual socket/commit and bounded lock faults, recover stable operation ID and inspect all effects | PARTIAL / unknown physical outcomes |
| H05 P0 | Data integrity / Payments/Finance | Existing manual/overpayment/refund/COD suites | Re-run applicable conservation/race tests; no external payouts | PARTIAL / operator/provider breadth |
| H06 P0 | Security / Auth/Admin/Checkout | Owner fencing and cross-org regression | Revocation and delayed identity response tests, real API denial; keep contexts separate | PARTIAL / deployed/session breadth |
| H07 P0 | Security/privacy / consent S41/S42 | 13 API tests + 11 browser cases; stale/withdrawn proof rejection | Expand expiry, policy, unavailable/storage, active dispatch races; no retro export | PARTIAL / live sinks disabled |
| H08 P0 | Security / observability S46 | Positive allowlists and proof-header redaction | Actual synthetic canaries through persisted payloads, diagnostics and logger; fix leaks | PARTIAL / historical/deployed sinks unverified |
| H09 P1 | Missing evidence / Storefront | Public path correctly blocked; backend injected policy success | Only nonpublic test injection may succeed; never add runtime bypass | BLOCKED / successful integrated purchase absent |
| H10 P1 | Security/product / guest Order recovery | One-hour original-session grant only | Inspect verified delivery channel; implement only if prerequisites exist, otherwise exact design/threat model | BLOCKED / no approved verified challenge |
| H11 P1 | Deployment-only / ingress | Loopback evidence and existing staging topology | Inspect cookies, Origin/Host/proxy trust; local HTTPS if available, separate deployed gate | NOT VERIFIED / public edge not available |
| H12 P1 | Reliability / Worker S38/S39 | Injected interruption/replay | Physical disposable child termination/restart, durable fact identities and queue preservation | PARTIAL / physical crash gap |
| H13 P1 | Performance / Database S43 | Microbenchmarks, 100-line cart evidence | Mixed synthetic load/lock/pool metrics and plans, explicitly local capacity only | PARTIAL / representative environment absent |
| H14 P1 | Accessibility / Storefront/Admin | Responsive geometry, keyboard, CSS text enlargement | Inspect actual controls, fault/reflow regressions; no simulated human sign-off | PARTIAL / human AT, native zoom and physical devices |
| H15 P0 | External policy/human / owner/provider/legal | All purchasing/collection/export off | Keep approvals and operational readiness matrix explicit; no activation | BLOCKED / business and legal decisions |
| H16 P1 | Release compatibility / operator | Additive 3224/3225 and existing development deployment strategy | Document ordered release, compatible rollback, forward repair and kill conditions for Phase 09 | PARTIAL / no deployment authorized |

Final dispositions and executable evidence are recorded in PHASE_08_IMPLEMENTATION_REPORT.md; initial outcomes above remain the entry record.

## Final disposition

| ID | Final status | Actual correction / evidence / remaining scope |
| --- | --- | --- |
| H01 | PARTIAL | Windows checker and LF/CRLF/tamper fixtures PASS; original Git hashes retained; Linux CI execution open |
| H02 | PASS | Genuine 3221–3223 fixtures; generic 23 post-baseline upgrades and no-op through 3225 PASS |
| H03 | PASS | Eight synthetic findings corrected; unchanged scanner and planted-credential detector self-test PASS |
| H04 | PARTIAL | Physical before/after COMMIT sockets and exact-key recovery, real lock timeout and exhausted pool PASS; failover/other money commands open |
| H05 | PARTIAL | Scoped financial conservation/exception tests PASS; mixed load found and corrected same-account receipt deadlocks; broader operator/cross-account matrix open |
| H06 | PARTIAL | Actual forged Host/forwarded Origin denial and scoped owner/tenant regressions PASS; complete delayed Admin revocation browser timing open |
| H07 | PASS | Scoped account-browser revision, policy mismatch, withdrawal/replay and HTTP uncertainty evidence PASS; live dispatch still disabled |
| H08 | PARTIAL | Actual API logger canary and response-cookie redaction PASS; historical/all-sink corpus open |
| H09 | BLOCKED | HTTP policy engine remains disabled; no public test policy switch added |
| H10 | BLOCKED | Order-bound challenge provider/policy unavailable; technical design/threat model in report; one-hour grant unchanged |
| H11 | PARTIAL | Production cookie response contract and spoof denial PASS; actual TLS/edge/callback chain not executed |
| H12 | PARTIAL | Physical consumer child termination at claim/commit and replay PASS; full Worker supervisor/job matrix open |
| H13 | PARTIAL | 120-job mixed local sample PASS after correction; before FAIL retained; representative HTTP/hardware/pool metrics open |
| H14 | PARTIAL | Actual 400% CSS overflow corrected and seven fault/reflow browser cases PASS; native zoom/human/device gates open |
| H15 | BLOCKED | No provider/courier/Finance/legal sign-off invented or activation performed |
| H16 | PARTIAL | Phase 09 stage/compatibility/recovery/kill plan complete; deployment and restore not authorized/executed |

Discovered P0 defect: receipt evidence FK KEY SHARE locks conflicted with Finance FOR UPDATE upgrades under concurrent distinct receipts. Initial mixed sample had 18 deadlocks. FOR NO KEY UPDATE retains financial serialization without that cycle; eight-way financial regression and final 120-job sample pass. See the report and preserved before/after JSON. Discovery added work to the initial register; it did not turn a real product failure into a tooling exception.
