# Checkout Phase 09 — controlled release preparation handoff

2026-11-10. **No staging or production action is authorized by this document.** Phase 08 is PARTIAL locally. Preserve dirty `main` at HEAD `038087c288da33787de85b1e81ec880a911e4e78`, including uncommitted 06B–08 work. Actual schema tail is 3225; Phase 08 adds no migration. Read [the full report and 40 outcomes](PHASE_08_IMPLEMENTATION_REPORT.md), [execution register](PHASE_08_EXECUTION_REGISTER.md), before/after load JSON and browser evidence before selecting work.

Current positive evidence: 419 distinct scoped regression tests/38 files, six tooling tests, 18 actual local browser cases, both production UI builds, backend typechecks, architecture/hardening checks, repaired migration-history/scanner checks and populated generic upgrade through all 23 post-baseline migrations. Physical placement COMMIT socket faults, commerce-consumer termination, exhausted pool timeout and same-account financial contention were tested. These are local results, not public Checkout, complete financial browser, human, deployed ingress or provider acceptance.

## Release-readiness matrix

Every row remains a release gate even where local subchecks pass. Decision-makers below are required roles, not recorded signatories.

| Gate | Current status / evidence required | Responsible decision-maker | Verification procedure | Rollback/mitigation | Release blocking? |
| --- | --- | --- | --- | --- | --- |
| Technical functionality | PARTIAL: no complete four-path browser purchase success under actual HTTP policy; wider fault/recovery matrix open | Engineering owner + product owner | Safely qualified isolated guest/account Cart/Buy Now success, refresh/lost response/exact-key recovery, stale commercial terms and all effect counts | Keep public policy/draft gates off; retain durable receipts and same-key recovery | Yes |
| Security/privacy | PARTIAL: configured-origin and logger/cookie contracts pass; deployed edge, full canaries/revocation timing incomplete | Security/privacy owner | Real HTTPS Host/Origin/forwarded-hop/cookie/CORS/cache/referrer tests; unique canaries in every actual sink; delayed A/B/Admin-role races | Block new purchasing/optional export; revoke scoped authority without deleting business records | Yes |
| Financial integrity | PARTIAL: local partial/excess/late/refund/COD and same-account contention pass; unknown-COMMIT breadth, cross-account numbering/load and operator browser exceptions open | Finance owner + backend owner | Reconcile receipt/allocation/liability/refund/ledger totals; actual failure injection and concurrent different-account posting; audit exact idempotency keys | Stop new collection/payout commands; retain liabilities, reconcile uncertain outcomes before retry | Yes |
| Business policy | BLOCKED: final tax/VAT, invoice, BDT rounding, fees, refund/partial-payment and final payable decisions absent | Business owner + qualified tax/legal/Finance advisers | Written actual policies mapped to domain equations/lifecycle; re-review quoted terms if changed | Reject unsupported policies; never default unresolved amounts to zero | Yes |
| Provider approvals | BLOCKED: actual bKash category/PRA capabilities, Nagad designation/eligibility, permitted actions/destinations/limits/charges unverified | Actual provider + business/Finance owner | Validate real agreement/onboarding and approved collection operation; no UI label substitutes for provider approval | Keep methods/destinations unavailable; no personal Send Money substitution | Yes |
| Courier operations | BLOCKED: real areas/serviceability, courier/COD compatibility, custody/remittance/RTO policy unverified | Delivery owner + courier | Real approved coverage and exception workflows; collection versus settlement reconciliation | Stop affected methods/areas; preserve existing Order support | Yes |
| Accessibility | PARTIAL: automated geometry/keyboard/CSS text/forced-colors pass; native zoom and human AT/device gates unverified | Accessibility reviewer + product owner | Run report's manual procedure with NVDA/VoiceOver/TalkBack, native zoom, touch/keyboard and mobile Safari/Firefox | Delay activation of inaccessible flow; retain clear support path | Yes |
| Production configuration | NOT VERIFIED: loopback build/runtime is not public hostname/certificate/callback acceptance | Platform/security operator | Check exact secrets custody, origins, cookie prefixes, trusted gateway IP, public URLs and `/admin` routing on approved target | Restore compatible configuration; no broad forwarded-host trust | Yes |
| Database migrations | PARTIAL: current Windows checker and generic upgrade pass; Linux CI and actual persistent upgrade/backup compatibility unverified | Database/platform owner | Run unchanged anchored policy + tamper tests in Linux CI; fresh + populated upgrade from actual prior schema, ledger/status and controlled one-time migration | Retain additive schema; verified forward repair or separately authorized restore | Yes |
| Observability | PARTIAL: scoped logger/projection allowlists pass; historical logs/traces/cache/dead-letter/support evidence and operational alerting incomplete | Operations + privacy owner | Inspect real sinks with synthetic canaries; exercise backlog, dead letter, timeouts and amount reconciliation; no high-cardinality sensitive labels | Disable optional destinations; preserve restricted diagnostics and financial evidence | Yes |
| Customer support/recovery | BLOCKED: no approved independently verified Order-bound guest challenge channel | Support/business/security/privacy owner + provider | Approve threat model/channel/TTL/attempts/anti-enumeration and audit policy, then implement/report real cross-device and exception journeys | Keep one-hour original-session grant; never authorize by Order+phone or privacy cookie | Yes |
| Deployment/rollback | NOT VERIFIED: no image publication or target rollout in Phase 08 | Explicitly authorizing operator + engineering owner | Immutable SHA/digest manifest, compatible versions, scoped backup/restore drill, service health and browser smoke, revocation reconciliation | Compatible image rollback with additive schema, or explicit forward repair; no silent financial down migration | Yes |

## Stage A — technical closure

1. Preserve and review the current source/diff. Do not resurrect old phase boundaries as product omissions. Reconcile the report's remaining risks and add genuine data/physical fault cases where feasible.
2. Finish successful Checkout HTTP/browser acceptance only through a reviewed nonpublic fixture or genuinely approved policy boundary. The current production HTTP policy engine remains disabled. Never add a public synthetic approval flag.
3. Expand physical COMMIT faults to claims/refunds/consent and real Worker supervisor restart/replay where safe. Verify rollback, durable commit and unknown client outcomes independently. Retain logical keys; never retry a payout under a new key after uncertainty.
4. Test representative mixed small/medium/maximum Cart, stock/coupon contention, configuration changes, account/guest sessions, privacy and Admin traffic. The 120-job local DB sample is useful defect evidence, not capacity acceptance. Include different-account Finance document-number allocation and remaining lock graphs.
5. Run actual deployed-configuration candidate checks and human/device procedure. Linux CI execution is required before treating cross-platform history checks as accepted. Preserve the checker anchor; reject real SQL/manifest edits.
6. Review CI coverage: current `.circleci/config.yml` invokes `scripts/ci-publish-staging-images.sh`, which builds SHA-labelled images, runs migration policy and isolated schema/upgrade checks, then publishes candidates. A push can trigger publication; Phase 08 did not push or run this job. Ensure intended source security/regression gates, including the new detector self-test, are required before a candidate is approved. Do not equate a passing image build with rollout.

## Stage B — actual business approvals

Record real tax/invoice/rounding/fee/refund/payment decisions, courier eligibility/COD/RTO, approved receiving account and provider operation, privacy notice/basis/retention/guest verification and any analytics conversion policy. Identify who can approve each fact; a Maevelle operator cannot invent provider/legal authority. Do not use the fixture's synthetic evidence/reference, zero tax or seeded verified accounts as approval.

GA4/Meta and advanced matching remain disabled. Any future vendor adapter or activation needs separately authorized payload, lawful-purpose, deduplication and actual vendor qualification. A stored advertising preference does not enable a destination.

## Stage C — staging validation, only after authorization

Reuse the actual CircleCI/GHCR/rootless Podman/Quadlet/private Caddy/host Nginx topology in `docs/architecture/development-deployment-strategy.md`; do not build a parallel deployment stack. Do not update the OS, unrelated Nginx/container services, public database exposure or shared applications.

For the selected reviewed source, create a manifest with **full committed SHA**, exact immutable digest for each affected service, schema predecessor/tail, last compatible release, required gates and verification results. The current dirty worktree has no releasable SHA/digests; do not fabricate them. Obtain explicit authorization for any commit/publication/deployment/persistent migration.

Perform target-identity preflight and authorized backup. Validate restore and revocation/deletion reconciliation; restoring an old backup must not silently reinstate credentials. Stop before migration on preflight/backup failure. Run migrations once in a controlled job, never concurrent API/Worker startup; verify ledger through 3225. Do not reset ordinary staging data.

For this source family the logical order is schema → compatible API/Worker → coordinated Storefront proof-bearing client → Admin, deploying only services whose compatibility requires it. Migration 3224's facts/receipts and 3225's provenance/session tables must exist before newer consumers use them. Old clients fail closed against proof-required observation ingestion. Do not run mixed versions against critical payment/authority changes without an explicit compatibility check. Phase 08's pool and Finance lock changes need coordinated backend verification; no schema rollback is needed for them.

Check actual health, migration status, unit/container logs, public HTTPS/Origin/callback/cookies, private authorization, synthetic Order/payment/Finance/Inventory/Worker consistency, and focused browser smoke. Record manifest, current/previous release, schema and operator action. Passing CI alone does not satisfy this stage.

## Stage D — limited production release, separate authorization

Proceed only after every blocking row above has actual evidence and the appropriate approvals. Public purchase, collection and exports are distinct activation decisions. Require a limited cohort, monitoring, incident ownership and recovery plan. Never delete or down-migrate immutable Order/receipt/Finance/audit data as an image rollback.

If an older image is compatible with the migrated schema and authority/consent semantics, retain additive schema during rollback. Otherwise use a reviewed forward repair or explicitly authorized verified restore with pending outbox and revocation reconciliation. No deployed old-image/backup recovery test was run in Phase 08.

## Stage E — post-release controls and kill conditions

Immediately block **new purchasing** for duplicate Orders/effects, financial/allocation mismatch, unexplained receipt/refund variance, unsafe stock/promotion oversell, owner/tenant leakage, systematic unavailable/unknown placement recovery, sustained lock/pool timeout/backlog or compromised collection destination. Stop affected provider/payout commands and optional exports independently; never automatically repeat an uncertain payout or reopen a cancelled Order.

The existing placement check uses organization operational control **`checkout_enabled`**. Exercise its supported command path in the approved environment; disabling it must stop new placement while preserving durable receipt/status recovery. Do not use a blanket service shutdown or the production draft/protection configuration as the ordinary incident kill switch: those can also make legitimate private post-order support unavailable. Keep immutable financial records, authorized Order/payment reads, exact recovery, support and outbox diagnostics available under their own controls. Prove this behavior on the actual release candidate before activation.

Monitor Order counts versus placements/obligations/reservations/redemptions, receipt/allocation/liability/refund/Finance conservation, COD custody/settlement, Worker pending age/retry/dead letters and privacy-proof rejection/withdrawal behavior. Define quantitative thresholds on the representative environment, named responders and a documented re-enable review; no synthetic local latency value is a production alert threshold.

Earlier phases remain PARTIAL until their specific owning evidence changes. This is the Phase 09 plan, not approval or evidence that its stages have already occurred.
