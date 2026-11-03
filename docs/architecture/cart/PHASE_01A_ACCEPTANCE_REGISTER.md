# Phase01A acceptance register

Overall **PARTIAL: 15 PASS / 1 PARTIAL / 0 FAIL / 0 BLOCKED**. New guest bootstrap and receipt foundation is tested; complete legacy compatibility/security parity is not closed. PASS entries describe the specific backend evidence below, not full Cart product, ASVS certification, or browser/production readiness. Phase00 historical statuses remain unchanged.

| ID | Gate | Status | Current evidence / boundary |
| --- | --- | --- | --- |
| 01A-01 | D15 slot bootstrap and safe refusal | PASS | S01/S04/S35/S59; two cold responses ordered around acknowledged writes, independent adds retained, missing cookies refused |
| 01A-02 | D16 strict owner identity | PASS | Real shopper registration/verification/sign-in/sign-out; expired/invalid cookie denial, typed account rejection and auth/protection-store outage tests |
| 01A-03 | Credential rather than public-ID authority | PASS | S35/S36; UUID/context alone and forged token rejected; production Host/HttpOnly/Secure emission inspected |
| 01A-04 | Configured tenant/currency | PASS | Foreign credential and organization/currency substitutions rejected; domain checks repeated under lock |
| 01A-05 | Durable replay on all current mutations | PASS | Sequential/concurrent duplicates, mismatch, all five existing commands, old receipt upgrade, expired receipt refusal, stable immutable deltas |
| 01A-06 | Revision/evaluation and no-op semantics | PASS | S07/S08/S19; competing sets, no-op receipt, price change without intent revision, replay against newer projection |
| 01A-07 | Fresh/upgrade/scoped database integrity | PASS | 3213 on fresh random databases and populated prior3212; legacy lines/coupons/receipt survive, FK violations rejected, rerun no migration |
| 01A-08 | Atomicity and real disconnect recovery | PASS | S53; injected write failure and pg_terminate_backend roll back receipt/domain; same intent recovers once without unhandled error |
| 01A-09 | Origin/schema/cache/abuse controls | PASS | S12/S37/S38; origin/missing/forged forwarding, malformed/large JSON, field/UUID/quantity checks, shared two-API quota and no-store errors |
| 01A-10 | Complete legacy compatibility/security parity | PARTIAL | Numeric view/facade/one-slot Checkout and old guest API tested. Signed-in old Cart now deliberately rejects ACCOUNT_CART_NOT_READY; fixed-cookie retirement and old-client owner-precondition parity are not complete. See bootstrap closure plan. |
| 01A-11 | Publication privacy and money authority | PASS | S11/T06/T07/T08; unpublished metadata/price redaction, removal, client-price rejection, owning Promotions remaining-gross cap test; full Catalog/commerce matrix remains02 |
| 01A-12 | Safe lifecycle/Worker foundation | PASS | Existing expiry honored; recovery-window metadata/index, no automatic purge; safe DB-loss reporting wired API/Worker; full lifecycle remains03 |
| 01A-13 | Focused compile/lint/architecture checks | PASS | Backend production builds, API/database types, focused lint, architecture and migration-history checks; commands in report |
| 01A-14 | Preserve prior dirty work | PASS | 1,950-file baseline comparison; all pre-existing dirty content preserved except the single documented auth composition call, whose original text is reconstructively verified |
| 01A-15 | No forbidden external operations | PASS | Only owned isolated PostgreSQL/tmpfs test operations; no source install, commit/push/deploy/VPS/environment/production configuration change |
| 01A-16 | Precise Phase01B handoff | PASS | Actual version/envelope/key/context/error profile documented; conditional guest-state readiness only, not account/merge/Checkout readiness |

## Scenario/threat traceability

Implemented tests cover S01–S05 (guest/replay/bootstrap), S07/S08/S13/S19 (current commands/revisions/evaluation), S11/S12/S17 (privacy/input/owner switch), S33 (limited stacked-discount invariant), S35–S39 (credentials/tenant/origin/abuse/field manipulation), S51 (legacy API/facade compatibility), S53 (rollback/real connection failure), S59 (cold initialization ordering). This is targeted coverage, not PASS for every aspect of each full-product scenario. New tests plus existing compatibility/shopper checks provide 70 passing selected tests; broader initial regression run found two unrelated pre-existing failures left open.

T01/T02/T03/T06/T07/T08/T09/T10/T11/T13/T14/T16/T19/T21 have targeted foundation controls and evidence; T04/T05 are only partially closed across legacy credential migration. T15 account operations are deliberately unavailable, not implemented. T20 has no purge job yet; T21 logging and T30 legacy compatibility have stated limits. Other analytics/Admin/retention/provider threats remain their assigned later phases, never inferred PASS from this register.

## Smallest closure plan

1. Resolve the explicit legacy signed-in guest-shopping policy: preserve unclaimed guest capability behavior under a verified shopper through a narrowly defined adapter, or intentionally retire that behavior with owner-approved migration. Never interpret an auth failure as guest.
2. Design/test reader-first old-cookie adoption and round-trip-confirmed credential retirement, preserving acknowledged old Cart/receipt authority on lost responses and concurrent adopters. Do not simply rotate/revoke an old populated Cart token on an unacknowledged Set-Cookie response.
3. Adopt ownerContext + explicit keys/epochs and context reconciliation in authorized Phase01B; execute actual browser cookie/context/PDP/page journeys. Do not expose a production account-Cart claim before03 implementation.

The unresolved legacy credential-adoption/fixation boundary retains High readiness severity from T04/T05; it is not waived or accepted as production-safe. Unpublished/coherence/backorder/location/tax/full promotion matrices remain owning-domain02/04 tasks. Privacy/retention approval remains required before destructive cleanup or external tracking.
