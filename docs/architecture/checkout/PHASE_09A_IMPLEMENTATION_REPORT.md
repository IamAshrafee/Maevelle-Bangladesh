# Phase 09A — local technical readiness and release preparation

2026-11-10, Asia/Dhaka. **Overall: PARTIAL locally. Release and production
activation remain BLOCKED. Staging execution is NOT AUTHORIZED.**

## 1. Overall Phase 09A verdict

**PARTIAL locally; release and production activation BLOCKED.** Local engineering and verification only. No commit, image publication, persistent migration, staging deployment or live provider/marketing operation. Earlier phase verdicts are unchanged.

## 2. Executive summary

09A corrected a reproduced cross-account Finance numbering race, incorrect
duplicate-receipt error classification and a Worker driver-detail logging leak.
It expanded physical COMMIT recovery across money and consent commands, proved
purchase-disable recovery semantics locally, repaired a stale fresh-schema test,
added a nonpublishing prerequisite to CI and produced the release/incident/guest
recovery/staging package. No purchase eligibility, provider approval, guest proof
or earlier phase completion was manufactured.

Consolidated final evidence: **413 distinct selected Vitest cases across 40 files**
passed across the initial run and focused correction; **28 separate tooling tests**;
**18 actual Chromium browser cases** against newly built standalone Next servers;
**168 mixed jobs/8 runners**; actual PostgreSQL dump/restore and whole Worker
kill/restart. Both production UI builds and backend/test-inclusive TypeScript pass.
The initial readiness runner stopped at a stale migration inventory; the corrected
case passed independently. The entire runner was not repeated just to recount
already passing cases. Local evidence is not Linux CI/deployed/production approval.

## 3. Actual repository state

Entry: clean `main`, HEAD `947c2964979ac7e22135146a123d8ebf32ede6aa`, 15 commits
ahead of the locally recorded origin/main. Prior user-authorized commits already
captured 06B–08; the request's dirty `038087c` entry facts were stale. No fetch/reset/
clean/stash/checkout/commit/push occurred. This assignment leaves 09A uncommitted.
Schema tail remains 3225; all 74 migrations, 51 anchored baseline entries and
baseline digest remain unchanged. No schema migration or dependency was added.

Read Product Completion, engineering/package rules, phase architecture and
scenario/08/09 evidence; inspected actual API/Worker/Storefront/Admin source,
payment/grant/consent authorities, migration registry, CircleCI publisher,
Dockerfiles, release/operator/migration scripts and rootless Podman/Caddy/Nginx
strategy. Historical planning/phase labels were not treated as feature limits.

All DB execution used a **new** temporary PostgreSQL 18 cluster bound to
`127.0.0.1:5548`, dedicated `maevelle_test` and random disposable integration,
upgrade/restore databases. No `.env` or persistent/staging database was used.
Browser fixture credentials and raw test logs stayed in temporary local files;
retained JSON has sanitized cases/counts/timings, not bearer or payment evidence.

## 4. Work completed

The [release register](PHASE_09_RELEASE_READINESS_REGISTER.md) consolidates 22
gates with severity, domain/classification, evidence/reproduction, required test,
owner/approver, mitigation and release significance. It separates defects,
harness faults, missing evidence, external approvals, human acceptance and target
runtime verification. Phase 08's 419-case/38-file run, 18 browser cases, 120-job
sample and 29 PASS/9 PARTIAL/2 BLOCKED remain historical scoped evidence. 09A's
selected 413-case set is a different selection, not a claim to replace or improve
that numerical total. Rechecks are not added to distinct counts.

Deliverables: register; [guest recovery specification](PHASE_09_GUEST_RECOVERY_SPEC.md);
[candidate template](PHASE_09_CANDIDATE_MANIFEST.template.json);
[operational runbook](PHASE_09_OPERATIONAL_RUNBOOK.md);
[09B staging and human/09C handoff](PHASE_09B_HANDOFF.md).

Changed files: Implementation: `.circleci/config.yml`; `apps/worker/src/worker.ts` and its test;
`packages/database/src/finance.ts`, new `finance/document-numbers.ts`;
`payments/manual-receipts.ts`, new `payments/release-integrity.test.ts`;
`checkout/placement.test.ts`; `migrate.test.ts`. Harnesses:
`scripts/checkout-release-checks.mjs`, `ci-checkout-readiness.sh`,
`checkout-phase09a-load.mjs`, `checkout-phase09a-recovery.mjs` and
`fixtures/checkout-worker-child.mjs`. Documentation: this report, release register,
09B handoff, operational runbook, guest recovery specification, manifest template,
README/scenario/current-focus/state updates and sanitized `phase09a-evidence/`.
No Storefront/Admin product source or dependency change.

## 5. Defects found and fixed

### Finance numbering and false duplicate diagnosis

`finance.ts` allocated FIN/EXP/EPS/CODS numbers using `lpad(count(*)+1,6,'0')`.
Independent accounts did not share an account lock; simultaneous receipts chose
the same organization-wide Finance number. A real disposable-PostgreSQL test
widens the INSERT overlap with a test-only 50 ms trigger: **only 3/8 succeeded;
5 incorrectly returned DUPLICATE_EXTERNAL_TRANSACTION**. The data rolled back
safely, but real independent receipts could not all be recorded.

Focused `finance/document-numbers.ts` now uses existing per-organization/document
`platform.number_sequences` rows, advanced atomically inside the posting
transaction. First use initializes above the largest retained numeric suffix;
competing first writers use the existing unique series index. Later allocations
use a row UPDATE. Failed posting rolls the allocation back. No global advisory
lock, schema change, blind retry or cash weakening. Legacy gaps and crossing
999999 are tested; JavaScript string padding does not truncate seven digits.
PostgreSQL's [INSERT/ON CONFLICT contract](https://www.postgresql.org/docs/18/sql-insert.html)
and [locking rules](https://www.postgresql.org/docs/18/explicit-locking.html)
informed the implementation.

`verifyManualPayment` previously converted every PostgreSQL 23505 into a duplicate
external receipt. Only the actual permanent receipt-reference fence constraint
is mapped now; unrelated database failures retain honest uncertain/error handling.
The same eight-way test passes 8/8, eight unique documents and BDT 320.0000
receipts/postings. Existing same-account `FOR NO KEY UPDATE` correction remains.
Old count-based and new sequence writers must not be mixed; no old-image
compatibility/rollback is claimed.

### Worker diagnostics leak

The recovery tick logged `{error}`. A driver error's enumerable `detail` can
contain private row/contact/evidence values. An injected synthetic driver detail
was observed in the **actual structured logger output** before the fix. The catch
now emits only `WORKER_TICK_FAILED`; its canary regression passes. The injected
error tests a real logger boundary, not a physical database fault or all sinks.

### Fresh-install test inventory

The full readiness run correctly stopped: `migrate.test.ts`'s independent analytics
inventory omitted the seven tables actually added by 3224/3225. The migrations
executed; the assertion failed. Inventory now explicitly lists those tables
without weakening exact schema comparison. Focused fresh/no-op test rerun passes.
This is a harness defect, not modified historical SQL or a new migration.

### Harness corrections

Initial new consent fixture used a UUID where its binding contract requires
43-character opaque proof; a new status assertion used the wrong DTO nesting.
Both were corrected and the 49-case integrity selection rerun PASS. The load
harness initially omitted the public PDP API's required organization query,
producing 24 HTTP validation failures; the request was corrected, production
validation preserved and full sample rerun PASS. The sanitized before sample is
retained and labelled a harness failure. Syntax/lint mistakes were corrected;
none was relabelled a product PASS without re-execution.

## 6. Tests and execution evidence

Three new placement tests verify `checkout_enabled=false`: new placement rejects;
guest/account committed exact replay and authorized private status/payment reads
remain; legitimate existing wallet claim submission and exact recovery remain
under the existing isolated collection-authorized fixture. No business effects
change during rejected new placement. No grant TTL or production route gate changed.

`checkout-phase09a-recovery.mjs` uses actual `pg_dump`/`pg_restore` on random local
databases. Receipt identity, Finance balance and outbox conservation survive.
It then demonstrates the important negative result: a backup taken before guest
revocation/withdrawal restores live authority and GRANTED preference. Reopening
must be blocked; scoped semantic revocation/refusal on the disposable restore
denies access/observation again without changing cash history. This is not a
general production restore merger, media drill or post-backup financial replay.

The rehearsal starts the actual compiled Worker in a child process with no
external adapters, waits for startup, SIGKILLs it, restarts another process, then
requests graceful IPC shutdown and observes exit 0. Commerce facts remain unique.
Existing physical consumer tests terminate at claim/commit and replay with two
consumers. Full supervisor/notification/poison/retry/outage/in-flight shutdown
breadth remains open; neither mock exceptions nor this startup kill covers it all.

Consolidated commands, counts and limitations are in section 12 and [the verification ledger](phase09a-evidence/verification.json). Repeated runs overlap; none is added to distinct totals.

## 7. Release-blocking technical gaps

RC01 successful HTTP/browser purchasing remains blocked by the actual fail-closed policy composition. RC06 full Admin capability/revocation timing, RC08 every sensitive sink, RC15 representative HTTP/pool/load and RC16 the full Worker lifecycle matrix remain open. Linux/deployed ingress and old-image compatibility are unverified. The [22-gate register](PHASE_09_RELEASE_READINESS_REGISTER.md) records exact reproductions, required tests, owners and mitigations. These gaps are not closed by the local passing cases.

## 8. Financial integrity status

`release-integrity.test.ts` physically interrupts loopback PostgreSQL protocol
COMMIT **before forwarding** or **after observing server COMMIT but withholding
its acknowledgement**. In both modes the application rejects; independent
durable authority distinguishes rollback from committed-but-unknown outcome.
Per mode it covers manual claim, independent receipt verification, refund request,
refund processing CAS and refund completion. Exact logical keys recover one
claim/payment/refund; processing state is read by ID/version rather than issuing
another external payout. Each mode finishes with one BDT 100.0000 receipt, a
BDT 10.0000 completed refund and BDT 90.0000 Finance balance. No external transfer
was initiated or retried.

Physical consent withdrawal tests similarly inspect durable revisions. A rolled
back write retains its prior grant until the explicit refusal retry; a committed
unknown withdrawal is DENIED and stale CAS retries conflict. Reconciliation ends
at revision 2, no observation token and external dispatch false. Existing frontend
tests/browser evidence establish immediate local pause on uncertain save; the DB
test does not imply an uncertain response itself grants permission.

Existing placement physical socket/timeout tests, staged atomic rollback, four
owner/source cases, last stock/coupon, changed commercial terms, Cart conversion,
duplicate keys, account logout, guest grant/expiry and payment/destination races
pass in the selection. Scoped manual Payment/Finance/refund/COD suites pass:
partial/excess/late/unallocated, duplicate references, reversals, cancellation,
unknown refund handling, COD collection versus custody/settlement. These are
synthetic application facts, not provider/courier settlement acceptance.

## 9. Guest recovery status

Guest recovery remains **BLOCKED**. Account email verification and a generic email
adapter do not prove an approved Order-bound guest channel. SMS has no qualified
production adapter. The new specification covers APIs, independent proof, one-time
challenge security, rate/anti-enumeration, support, revocation, account transition,
retention and required human/provider decisions. No fake OTP, contact matching,
Order-number lookup or silent one-hour extension was introduced.

## 10. Browser and accessibility status

New production builds were run with supported standalone servers at loopback
3000/3001, compiled Fastify in test mode at 3002 and disposable PostgreSQL. Existing
07B/08 CDP harnesses pass **11+7=18 distinct actual Chrome 156.0.8078.80 cases**.
An earlier `next start` smoke also passed but warned about standalone output;
servers were replaced with generated standalone entrypoints/static artifacts and
all 18 cases rerun. Overlap is not counted twice. Evidence provenance corrects
the inherited harness's hardcoded “development proxy” label to actual standalone
runtime; API is still test-mode/local HTTP, not deployed production.

Coverage: anonymous UNKNOWN; independent analytics grant/advertising refusal;
responsive phone/tablet/desktop/landscape/text reflow; keyboard trap/Escape;
reload/proof-bound observation; stale two-tab withdrawal; offline/unavailable/
cookie/storage failures; real account A/B/logout; authorized Admin aggregates;
429/502/503/broken JSON; lost browser HTTP response after committed withdrawal;
400% CSS/forced-color dialog scrolling. No third-party marketing request observed.
Standalone `/checkout` returns its genuine unavailable page.

**Successful browser Checkout remains BLOCKED**: public exports bind the final
policy engine to null and production preview/API protections remain closed. No
reviewed HTTP policy-composition fixture was added. The only synthetic success
seam remains internal to the isolated DB engine; it has no production activation
flag. Four successful browser paths, cookie reissue/two-tab purchase and financial
exception UI matrices therefore remain unaccepted. This is a specific architecture/
test-environment dependency, not fake HTTP success or a failing purchase hidden
as a pass. Native zoom, human AT/touch/on-screen keyboard, Safari/Firefox and
deployed HTTPS were not executed; manual checklist is in the 09B handoff.

## 11. Security and privacy status

Configured-origin/forged Host/IP, production cookie response contract, tenant/
shopper authorization and stale proof/policy tests pass. Server consent/financial
authority, independent claim versus receipt and owner result fencing remain.
Capability removal during every pending Admin read/write, org switching, BFCache
and shared-device histories are not fully verified. Payment membership locks
alone are not claimed to prove every capability-grant removal race.

Canary scope expanded to actual Worker structured output; existing API logging,
header/cookie redaction, safe observation/outbox projection and browser network/
storage refusal tests pass. Proxy/historical logs, full traces/metrics/dead letters,
browser caches/history/referrers, support exports and every artifact sink remain
uninspected. Necessary contact/receipt data remains in its authorized domain
stores; this report contains no real/test bearer or payment evidence.

## 12. Database, CI and build status

| Check | Actual result / limit |
| --- | --- |
| `node scripts/check-migration-history.mjs` | PASS: 74 registered, unchanged 51-history anchor; Windows only |
| Migration/scanner self-tests | 6 PASS: LF/CRLF, SQL/lone-CR/BOM/anchor tamper and planted credential detection |
| Generic upgrade CLI (`UPGRADE_TEST_ALLOW=1`) | PASS: 23 populated post-baseline upgrades and no-op through 3225 |
| Fresh migration inventory after correction | PASS, exact tables/extensions/ledger and rerun |
| Secret/architecture/hardening checks | PASS; no detector weakened/ignored |
| Backend `tsc --build tsconfig.build.json` and test-inclusive `tsc --build` | PASS |
| Selected regression paths in `scripts/checkout-release-checks.mjs` | Initial 412 PASS/1 FAIL (stale inventory); corrected case rerun PASS: 413 distinct/40 files verified. Later 49/2 integrity and 4/2 migration/Worker rechecks overlap |
| Release credential/manifest/registry/operator tests | 22 PASS; injected transports, no actual GHCR/SSH/publication |
| Storefront and Admin `pnpm --filter ... build` | Both PASS; new standalone runtime checks as above |
| Focused ESLint/Prettier, Node/Bash syntax and `git diff --check` | Final recorded in verification ledger |
| Linux CI/container pipeline | NOT EXECUTED; no Docker images built/published or jobs triggered |

New `validate-checkout` precedes existing publishing via workflow dependency.
The local/CI runner checks source security/architecture/history/tooling/types,
fresh/populated upgrades and money/auth/privacy/Worker regression before both
builds. Its CI wrapper uses a disposable loopback-only PostgreSQL container and
Node 24, frozen lockfile, no GHCR/SSH credentials. No new service is deployed.
Official [CircleCI configuration](https://circleci.com/docs/reference/configuration-reference/)
and [Node image documentation](https://github.com/nodejs/docker-node/blob/main/README.md)
were consulted. Linux execution and provider/external deployment remain distinct.

Current publisher builds/checks before pushes, but creates the real release
manifest and ready marker **after** image pushes. A later registry/manifest/marker
failure can leave uploaded but unapproved images. Ready markers can be consumed
by the independently managed VPS timer. Approval of a push/publication must account
for that before any later execution. 09A performed neither.

## 13. Performance status

[Mixed sample](phase09a-evidence/load.json): 168 jobs, eight runners, 56 actual
HTTP requests (8 privacy bootstraps + 24 PDP + 24 privacy writes) plus instrumented
domain operations, 4,468 observed domain queries; roughly 1.20 s measured mixed
interval. HTTP-to-response-headers p50/p95/p99 approximately 7.09/130.66/180.70 ms;
this excludes response body and is not a transaction latency. HTTP PDP elapsed
p95 160.29 ms, privacy denial p95 15.51 ms. Domain Cart create/add p95 103.72 ms,
independent-account receipt job p95 162.37 ms, refund reconciliation job p95
254.77 ms. Host load/concurrency with other isolated checks affects these numbers.

48 receipts total BDT 1,920.0000, 24 completed refunds total BDT 120.0000,
Finance BDT 1,800.0000, zero pending commerce receipts/errors and zero observed
deadlock delta. Database growth ~2.12 MB; RSS ~326 MB. Samples record connection/
lock waits, not driver pool queue depth. Separate real placement profiles at
5/25/100 lines used 69 observed statements and approximately 20/35/50 ms in the
focused run; later full-run values differ normally. Last-stock/coupon contention
is separately tested, not represented as simultaneous HTTP traffic in this sample.

No production SLO/capacity/transaction caps are inferred. Regional network,
representative hardware/skew, full Checkout/authenticated Admin HTTP workload,
per-SQL/transaction timing, explicit pool-acquisition instrumentation, complete
query plans and broader Worker lag remain open. Phase 08's 18-deadlock before
sample remains untouched; 09A's before sample records a harness validation error.

## 14. Business, provider and courier dependencies

Final tax/VAT/invoice, BDT precision/rounding adjustment, actual provider fees,
refund/partial/excess policy and submission/review deadlines require authoritative
decisions. No-added-manual-wallet-surcharge preference is retained, not converted
to zero provider charges/tax. Actual bKash PRA onboarding/action/limits/account
and Nagad category/workflow remain unqualified. Real courier coverage/COD/custody/
remittance/RTO and privacy/retention/recovery approvals remain blocked.

## 15. Candidate manifest readiness

The manifest is an explicit **PENDING planning template**; baseline SHA is known,
candidate SHA/digests/current target schema/previous compatible release and
signatures are not fabricated. Last compatible backend requires review because
old Finance numbering writers cannot safely mix with 09A. The runbook is ready
for operator review, with exact existing commands and preconditions, not validated
as executable on an uninspected target. No new financial down migration or automatic
restore is proposed.

## 16. Staging-runbook readiness

[The 09B handoff](PHASE_09B_HANDOFF.md) prepares candidate identity, target preflight, backup, one-time migrations, compatible service orchestration, HTTPS/authorization/financial smoke, abort/repair and human acceptance. [The operational runbook](PHASE_09_OPERATIONAL_RUNBOOK.md) covers containment, reconciliation and recovery. They are ready for review; actual target identity/configuration/operator installation, backup/media, compatible rollback and deployment execution remain unverified. No authorization is implied.

## 17. Forty-outcome acceptance register

PASS means the scoped outcome below, not public release approval.

| # | Outcome | Verdict | Evidence / remaining boundary |
| --- | --- | --- | --- |
| 1 | Actual repository audited/preserved | PASS | Clean 947c296 entry; existing commits retained |
| 2 | Unified release register | PASS | 22 classified gates/owners/acceptance/mitigation |
| 3 | Phase 08 reconciled | PASS | Historical counts/scopes retained; no promotion |
| 4 | Three tooling fixes preserved | PASS | Anchors/upgrade fixtures/unchanged scanner retained |
| 5 | Integrity/tamper resistance | PARTIAL | Windows checks PASS; Linux CI open |
| 6 | Populated upgrades | PASS | 23 + no-op through 3225 |
| 7 | Effective secret detection | PASS | Unchanged scan + planted detector test |
| 8 | Both production UI builds | PASS | New builds/standalone runtime, no activation |
| 9 | One Order per Checkout | PASS | DB same/different-key/constraint tests |
| 10 | Atomic business/financial effects | PASS | Scoped DB failure/conservation suite |
| 11 | Successful Checkout browser | BLOCKED | Fail-closed actual HTTP policy; no safe fixture added |
| 12 | Unknown Order COMMIT | PASS | Real before/after socket/replay, local scope |
| 13 | Manual claim retry | PASS | Physical COMMIT + exact same-key recovery |
| 14 | Refund uncertainty | PASS | Physical states/request/completion; no actual payout |
| 15 | Cross-account Finance | PARTIAL | Race fixed and 8-way PASS; wider graph/target open |
| 16 | Worker crash/retry | PARTIAL | Actual whole-process restart + consumer faults; full lifecycle open |
| 17 | Consent/withdrawal authority | PASS | Scoped physical/CAS/browser proof and pause checks |
| 18 | Identity switch/privacy | PARTIAL | A/B/logout scope PASS; full Admin/BFCache timing open |
| 19 | Canary breadth | PARTIAL | Worker leak fixed; proxy/historical/all sinks open |
| 20 | Guest recovery | BLOCKED | Exact specification; independent approved channel absent |
| 21 | HTTPS/proxy/cookie scope | PARTIAL | Local HTTP + cookie response contracts; real edge open |
| 22 | Load evidence | PARTIAL | Expanded HTTP/domain sample, no capacity acceptance |
| 23 | Accessibility defects/checks | PARTIAL | Responsive/fault/CSS checks PASS; broader success UI open |
| 24 | Human/device acceptance | NOT VERIFIED | Explicit manual procedure/approver, no invented review |
| 25 | Operational kill switch reviewed | PASS | Exact control/code semantics and incident procedure |
| 26 | Post-order access after purchase disablement | PARTIAL | Real DB guest/account/claim PASS; target HTTP open |
| 27 | External policy/provider/courier blockers | BLOCKED | RC10–14, no signatures invented |
| 28 | No synthetic policy production leak | PASS | HTTP engine still null; no override/dependency added |
| 29 | CI/release gates | PARTIAL | Prerequisite added/source reviewed; Linux execution open |
| 30 | Honest candidate template | PASS | Candidate/digests/approvals PENDING |
| 31 | Database compatibility/recovery | PARTIAL | Actual local restore/revocation rehearsal; old-image/target/media open |
| 32 | Incident procedures | PASS | Named roles, containment/verification/re-enable/evidence |
| 33 | Staging runbook | PARTIAL | Exact commands/preconditions prepared; target/operator execution unverified |
| 34 | Production prerequisites | PASS | Separate 09C approval, cohort/monitoring/support gates explicit |
| 35 | No real financial/vendor activity | PASS | Synthetic local only; no provider adapters invoked |
| 36 | No public activation | PASS | Purchasing/collection/GA4/Meta remain off |
| 37 | No persistent migration/deployment | PASS | New temp cluster/random databases only |
| 38 | Worktree preserved | PASS | No destructive Git operation; 09A left uncommitted |
| 39 | Earlier phases unchanged | PASS | Historical PARTIAL remains |
| 40 | Evidence-backed handoff | PASS | Scoped artifacts and next authorization recorded |

## 18. Explicit next-stage authorization requirements

Next engineering: RC01's reviewed hermetic successful HTTP/browser boundary;
RC06 full Admin capability/revocation timing; RC08 all-sink canaries; RC15/16
representative load and Worker matrix. Independent approvals: guest channel,
commercial tax/rounding, provider/courier/privacy/support. Then separately authorize
candidate commit/publication, Linux CI and target-specific 09B deployment/backup/
migration; later production activation requires independent acceptance. Do not
push main as a harmless verification action: existing automation publishes and
can advertise a candidate to the independent deployment timer.
