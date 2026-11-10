# Phase 09B staging validation handoff

2026-11-10. **STAGING DEPLOYMENT, PERSISTENT MIGRATION, IMAGE PUBLICATION AND
PRODUCTION ACTIVATION ARE NOT AUTHORIZED.** Phase 09A is PARTIAL locally. The
[release register](PHASE_09_RELEASE_READINESS_REGISTER.md) and
[implementation report](PHASE_09A_IMPLEMENTATION_REPORT.md) define remaining
evidence. No earlier phase was promoted. Do not run these procedures merely
because they are documented.

## Candidate and authorization checkpoints

1. Review the preserved uncommitted 09A changes on baseline full SHA
   `947c2964979ac7e22135146a123d8ebf32ede6aa`. Obtain separate authorization
   to commit and publish the reviewed candidate. Candidate commit is **PENDING**;
   the baseline SHA is not the 09A candidate.
2. Before publication determine whether the existing VPS auto-deploy timer
   consumes staging-ready markers. CircleCI publication can cause indirect rollout.
   A separate authorized operator must disable/verify it when preparing a
   nondeploying candidate. Do not change the timer from this local assignment.
3. Run the added `validate-checkout` Linux job. It must pass before the existing
   `publish-staging` job can run. Record actual job/source/log identities; 09A did
   not trigger CI or execute Docker/Linux. Local constituent checks are separate.
4. Once publication is authorized, obtain actual full SHA and immutable digests
   for API/Worker/Storefront/Admin and release manifest. Generate the real release
   manifest from actual push logs using existing tooling; never replace PENDING
   with guessed digests. [Planning template](PHASE_09_CANDIDATE_MANIFEST.template.json)
   is intentionally not a valid deployable release manifest.
5. Obtain explicit target-specific staging deployment/migration authorization,
   including host, database, selected services, backup and rollback plan. A public
   purchase or provider activation requires another separate decision.

## A. Target preflight

Use the established `maevelle-staging` SSH/operator alias only after approval;
actual host identity must match the approved inventory. Reuse rootless user
`maevelle`, `/home/maevelle/deployment`, existing Quadlets, private Caddy and shared
Nginx. No OS/unrelated unit/Nginx change and no public DB/app port exposure.

```text
pnpm staging status --host APPROVED_ALIAS --engine podman
pnpm staging plan --sha FULL_CANDIDATE_SHA --host APPROVED_ALIAS --engine podman
```

These commands access GHCR/SSH; none ran in 09A. Verify permitted operator,
host/user/rootless engine, current/previous recorded and running digests, all six
Maevelle units, migration ledger prefix, disk/DB/media capacity, backup destination
and protection, effective origins/callbacks, trusted gateway and network bindings.
Actual database must be `maevelle-staging-postgres/maevelle_staging`, never
production. If any identity/configuration/ledger mismatch occurs, stop and retain
diagnostics. Current target schema predecessor is **PENDING**, source tail is 3225.

## B. Backup and compatible recovery

Create an explicitly authorized PostgreSQL backup and media snapshot using the
existing target procedure. Record backup ID/time/LSN where applicable, release,
ledger and all subsequent writes. Verify restore on an isolated target. Local
09A Windows `pg_dump`/`pg_restore` is useful rehearsal, not proof of target backup,
media completeness or recovery time.

Inventory post-backup payment/provider/Order/stock/outbox/revocation/consent/deletion
facts. Keep writes/dispatch closed until reconciled on a restored target. Do not
restore an old credential or advertising permission silently. Last compatible
release is **PENDING**: old count-based Finance writers are not approved for mixed
operation/rollback with 09A. Use forward repair unless compatibility is established.

## C. Schema and service rollout

09A adds no schema migration; required suffix through 3225 remains additive.
3224 and 3225 must exist before new commerce/privacy readers/consumers. Current
source uses the existing `platform.number_sequences` table for Finance numbering.

The normal operator planner deliberately rejects pending migrations. Do not
bypass that error or run API/Worker migrations at startup. The repository has
`scripts/staging-migrate.sh status|preflight|apply` for the dedicated controlled
migration operation, and a quiesced cutover implementation in `scripts/staging/execute.py`;
the ordinary restricted operator gateway does **not** expose a cutover action.
This distinction must be resolved with the authorized target operator, not by
inventing a `pnpm staging cutover` command.

After target identity, backup, migration-window and quiescence authorization,
stop incompatible application writers and automatic deployment while keeping
PostgreSQL/media/Caddy persistent. Migration command template, executed as the
actual rootless Maevelle user on the approved host:

```text
bash scripts/staging-migrate.sh preflight --image ghcr.io/iamashrafee/maevelle-api@ACTUAL_DIGEST --env-file /home/maevelle/deployment/secrets/staging.env
bash scripts/staging-migrate.sh apply --image ghcr.io/iamashrafee/maevelle-api@ACTUAL_DIGEST --env-file /home/maevelle/deployment/secrets/staging.env --confirm maevelle_staging
```

Run once under its lock; stop on failed preflight/migration/ledger check. No reset,
seed-on-deploy or volume deletion. Verify exact applied ledger through 3225 and
no pending migration before ordinary image deployment. The shell helper does not
itself establish application quiescence or backup completion; those are explicit
preconditions above. Maintain a reviewed compatible repair path if migration wins
but deployment fails.

Logical dependency order: required schema → compatible API/Worker family →
coordinated proof-bearing Storefront → Admin. The actual existing operator stops
Worker, restarts API/Admin/Storefront, then starts Worker, and coordinates all four
services for an API or Worker change. Retain that tested orchestration rather
than manually running old/new writers together. Proofless old observation clients
fail closed; assess user messaging rather than weakening consent authority.

```text
pnpm staging deploy --sha FULL_CANDIDATE_SHA --host APPROVED_ALIAS --engine podman
pnpm staging verify --sha FULL_CANDIDATE_SHA --host APPROVED_ALIAS --engine podman
```

Deploy is interactive and requires its actual approval step. Execute only after
the separate authorization and compatible ledger. Health failure stops rollout;
retain attempted/current/previous manifests and logs. Do not mark verified from
a successful image build or generic HTTP 200.

## D. Target acceptance

Record exact operator/time/host/SHA/digests/config revisions/ledger/backup and each
test result. Use synthetic, authorized target accounts and financial fixtures;
no real provider/payment operation without its own authorization.

- API `/health/live` and `/health/ready`, exact service image/status/logs, Worker
  heartbeat/backlog, migration ledger; persistent DB/media mount ownership.
- Actual public HTTPS hostname/certificate chain through Nginx→private Caddy,
  `/admin` routing and API-prefix stripping; callback and logout URLs.
- Configured Origin/CSRF, forged Host/forwarded Host/IP denial, CORS, no shared
  private caching, no-referrer, Secure/HttpOnly/SameSite and `__Host-` cookie issue,
  replay and deletion through the real edge. Verify Admin/shopper realm isolation.
- Storefront production `/checkout` remains unavailable; no flag or synthetic
  approval turns on purchases. Confirm no live merchant methods or GA4/Meta sends.
- Approved private Order/payment/Finance/Inventory history, exact-key recovery,
  tenant/account/permission denial and state clearing. A successful four-path
  Checkout test still requires the explicit safe policy/testing boundary in RC01.
- Receipt/allocation/unallocated/refund/ledger conservation; COD collection versus
  custody/settlement; source-only Cart conversion and stock/promotion integrity.
- Consent denial/withdrawal, stale policy/proof, account A/B/logout, lost response,
  cache/history/BFCache; optional measurement remains paused on uncertainty.
- Worker restart/replay/poison/backlog, restricted diagnostics and synthetic
  canaries across actual logs/traces/metrics/proxy/dead letters/artifacts.

## E. Abort, rollback and evidence

Abort for identity/backup/ledger mismatch, failed migration, unhealthy or wrong
digest service, financial/inventory variance, authority leak, revoked access or
withdrawn consent restored, uncontrolled optional send, unsafe recovery or
unintended public purchase. Stop affected new operations and capture evidence;
do not erase committed records to make a smoke check green.

Use [incident controls](PHASE_09_OPERATIONAL_RUNBOOK.md). Preserve committed
Order/status/support and legitimate financial reconciliation under separate
permissions. Compatible image rollback retains additive schema and all new
numbering/revocation semantics. No compatible old image has been verified in
09A; otherwise repair forward. Restore is separately authorized with complete
post-backup financial/outbox/revocation reconciliation, never an automatic
deployment fallback. Retain attempted/current/previous state and operator record.

## Human and device acceptance

Required sign-off: actual Accessibility reviewer + Product owner, with Security/
Finance/Support for private recovery and exception tasks. Record operator,
device/browser/AT versions, viewport/orientation/native zoom, steps and evidence.

1. Real phone/tablet/iPad/desktop and landscape at 320/390/768/intermediate/1440
   widths; on-screen keyboard and touch. Complete delivery/review/confirmation
   only after safe success fixture is available. No hover-only action or clipped
   primary controls. Native browser 200% and 400% zoom, not CSS simulation.
2. NVDA/VoiceOver/TalkBack plus keyboard: correct names/legend/error descriptions,
   useful live loading/conflict/success announcements; no duplicate announcements.
   Tab order/focus trap/Escape/restoration and visible focus; forced colors,
   reduced motion and Admin dark theme. Verify monetary values remain exact/readable.
3. Decline both purposes, independent analytics grant/advertising refusal, change
   choices and withdraw; offline/cookie/storage denial, 429/503/conflict and lost
   response. Shopping essential actions continue; no unconfirmed grant displayed.
4. Pending account A→B/logout, revoked capability, org switch, browser Back/Forward
   and BFCache with delayed responses. Prior address/payment/instructions/choices
   never repopulate. Test Firefox and mobile Safari independently.
5. Authorized claim correction/rejection/partial/excess/late/reversal/refund-unknown
   and COD-versus-settlement journeys, expired guest grant and support escalation.
   Staff/customer understand the next action; no suggestion to pay twice.

09A automated Chromium results are not any of these human sign-offs.

## Phase 09C production prerequisites

Separate independent production authorization, after every applicable release
blocker has evidence: successful commercial journey; financial/Inventory/Promo
integrity; security/privacy/verified guest recovery; qualified tax/invoice/rounding;
actual bKash/Nagad eligibility; courier/COD operations; human accessibility;
production config/HTTPS/migrations; target backup/compatible repair; monitoring,
incident command and trained Support/Finance. Staging passing is not launch approval.

Any later limited release must define an approved cohort/geography/payment scope,
named responders, daily independent reconciliation, evidence-based alert/stop
thresholds and explicit re-enable/rollback criteria. No live transaction caps,
volume thresholds or dates are chosen by this local engineering assignment.
