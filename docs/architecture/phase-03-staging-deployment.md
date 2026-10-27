# Phase 03: digest-pinned development staging releases

Status: the first CircleCI/GHCR release `87fec723c9fcfa30424f82c7520c984bded477f3` deployed on the VPS, but its final migration-ledger `podman exec` returned exit 1. The historical failed attempt remains preserved; its exact cause is unknown. After installing this hotfix, the operator reported that standalone `verify` succeeded on the VPS. Status now records that commit, 51 applied migrations, `outcome: verified`, and `verificationMethod: reconciliation`; all four running image references match the release manifest and Quadlets. No application redeployment was needed for reconciliation.

## Release creation and discovery

The existing CircleCI `main` publisher remains authoritative. It builds the four application images, runs the Phase 02 checks and disposable PostgreSQL/API startup, then pushes each image to GHCR. It extracts each **published registry digest from Docker's push result**, rejects a missing or ambiguous digest, and generates a version 1 `release.json`. Only after all four app pushes succeed does it build and push `ghcr.io/iamashrafee/maevelle-release:staging-<12-char SHA>`, a scratch OCI image containing `/release.json`. CircleCI stores `<full SHA>.json` and `<full SHA>.ref` as job artifacts. The `.ref` names the manifest image by its own published digest. A failed image push or manifest publication does not produce a successful job/artifact.

Manifest fields: `formatVersion`, `status: published`, full `commitSha`, `shortSha`, ISO `builtAt`, four `{repository,digest,ref}` image entries, and `schema.{baselineRelease,migrationNames}`. Validation requires exact Maevelle GHCR repositories, 64-hex SHA-256 digests, sorted unique migrations and the verified 51-name baseline. It contains no credentials or runtime configuration. The release image tag is a discovery aid; use the `.ref` digest for fetching.

Example developer commands after CircleCI succeeds:

```sh
# Shows GHCR release tags and registry-provided manifest digests.
GHCR_USERNAME=... GHCR_TOKEN=... pnpm release list --remote

# Use full SHA and manifest digest from that release's CircleCI artifacts.
pnpm release fetch --sha <full-commit-sha> --manifest-digest sha256:<64-hex> --dir var/releases
pnpm release list --dir var/releases
pnpm release inspect --sha <full-commit-sha> --dir var/releases
```

GHCR credentials are needed only when the package is private; keep them outside shell history and files in Git. `release list` without `--remote` lists only locally fetched manifests. The remote listing uses the [OCI Distribution tag list and manifest digest endpoints](https://github.com/opencontainers/distribution-spec/blob/main/spec.md); the CircleCI artifact provides the full SHA and immutable manifest ref. The fetch command checks the embedded full SHA and strict schema before storing it. There is no SSH-to-VPS step in CircleCI.

The current publisher rebuilds all four images every run, so their commit labels normally change all digests even for a small frontend edit. Later optimization can reuse service images only with reviewed source/dependency impact and a manifest that truthfully records each image's source revision. Do not infer compatibility merely from changed file paths.

## Installing and reviewing the tooling

The user-verified VPS inventory confirms Ubuntu 24.04.4, Podman 4.9.3, Python 3.12.3, systemd 255, rootless `maevelle` (UID 1001), the six expected `.container` Quadlet filenames, six active units, private network, digest-pinned application images, `Pull=never`, and the loopback Caddy listener. The installed tooling's read-only `status` passed on the VPS. The tool expects `[Container]` `ContainerName`, `Network`, and one `Image` entry, the PostgreSQL/media volumes, and Caddy `PublishPort=127.0.0.1:18080:80`. Future host changes must preserve those identity checks or be reviewed and retested before deployment.

**Quadlet network hotfix:** the first installed `status` failed because the validator compared `Network=maevelle.network` against the runtime name `maevelle-staging`. The corrected validator accepts that native Quadlet reference only when the adjacent, regular `maevelle.network` resource has exactly one `[Network] NetworkName=maevelle-staging`. It then checks `podman network inspect maevelle-staging` for the expected bridge network and each of the six running containers for attachment only to that network. Direct `Network=maevelle-staging` remains valid; missing resources, unrelated references, duplicate declarations, different names, and wrong runtime attachment fail closed. The PostgreSQL and API volume checks also resolve the Maevelle `.volume` resources by their explicit `[Volume] VolumeName`, if those references are used. [Podman 4.9.3 documents `.network`/`.volume` references and name overrides](https://docs.podman.io/en/v4.9.3/markdown/podman-systemd.unit.5.html). User-reported read-only status verification passed after installing this hotfix.

Build the minimal archive locally with `python3 scripts/package-staging-tooling.py`. It writes `/tmp/maevelle-phase03-tooling.tar.gz` and `/tmp/maevelle-phase03-tooling.tar.gz.sha256`. The archive contains `staging-deploy.py`, `staging-migrate.sh`, and the six runtime modules under `staging/`. No `scripts/release/` JavaScript, Node modules, migration sources, secrets, or database artifacts are needed on the VPS for these commands. Verify the checksum before and after transfer (`shasum -a 256 -c` locally or `sha256sum -c` on Ubuntu, from the directory containing both files), inspect `tar -tzf`, and extract as `maevelle` into `/home/maevelle/deployment/tooling/`. The archive contains regular files and one relative directory only; the packager rejects source symlinks and unsafe member paths. Do not extract it over an unrelated directory.

The earlier `ccd405c1e6fa8c827307977b947a4a3dbce859f5` release predated Phase 03 manifests. `status` can still operate without `current.json` and report observed state without inventing a historical release record. The first managed release is now recorded through verified reconciliation of `87fec723c9fcfa30424f82c7520c984bded477f3`. Transfer each future fetched, validated target `<SHA>.json` separately into a Maevelle-owned release input directory for planning.

Example commands **on the VPS as `maevelle`, never with root `systemctl`**:

```sh
python3 /home/maevelle/deployment/tooling/staging-deploy.py status
python3 /home/maevelle/deployment/tooling/staging-deploy.py plan --release /home/maevelle/deployment/releases/incoming/<SHA>.json
python3 /home/maevelle/deployment/tooling/staging-deploy.py apply --release /home/maevelle/deployment/releases/incoming/<SHA>.json --confirm <full-SHA>
python3 /home/maevelle/deployment/tooling/staging-deploy.py verify --release /home/maevelle/deployment/releases/incoming/<SHA>.json --confirm <full-SHA>
python3 /home/maevelle/deployment/tooling/staging-deploy.py status --release /home/maevelle/deployment/releases/incoming/<SHA>.json
```

`status` reads Maevelle unit state, Quadlet and running image references, the migration ledger through a SELECT in the existing API container, and optional release records. `plan` adds target-manifest comparison, pending migrations, changed digests, files, and restart order. Neither creates a lock/cache/state file, pulls images, reloads systemd, restarts services, backs up, seeds, or migrates. `apply` changes selected application images after a confirmed plan and records success only after verification. `verify` takes the shared deployment/migration lock and performs **no rollout**: it checks the exact manifest, all four running and Quadlet digest refs, six units and containers, the complete migration ledger, API liveness/readiness, Admin, Storefront, Better Auth session, and Storefront context. Only after those pass does it atomically write `current.json` with `verificationMethod: reconciliation`; it leaves `latest-attempt.json` unchanged and links its failed attempt ID when applicable. Repeating `verify` for an already recorded and still healthy identical release makes no metadata change. Worker has unit/container/image checks but no independent heartbeat endpoint.

The separate `staging-migrate.sh status` and `preflight` require a **locally present**, digest-pinned `ghcr.io/iamashrafee/maevelle-api` image and the protected `/home/maevelle/deployment/secrets/staging.env`; they do not pull an image. They create or open `/run/user/1001/maevelle-staging-migration.lock` (or `$XDG_RUNTIME_DIR/maevelle-staging-migration.lock`), take a nonblocking lock, and run short-lived rootless Podman containers for target/history checks and migration status. They do not apply migrations. Use the same `XDG_RUNTIME_DIR` for the migration and deployment commands so they share that lock. Check the candidate API image's migration CLI before using it; the one-time migration runner still needs separate live validation. `staging-migrate.sh apply` remains a separate, deliberate migration operation and may pull its selected image.

## Apply behavior and migration gate

`apply` requires full-SHA confirmation and takes the same `maevelle-staging-migration.lock` used by Phase 02's migration runner. It recomputes the plan inside the lock. If any target migration is pending, it stops before pulling or changing an image. After a separately reviewed backup/recovery rehearsal and compatibility decision, the operator may invoke the existing one-time `staging-migrate.sh preflight` and then its confirmed `apply` for the target API image. Re-run deployment `plan` and `apply` afterward. **Phase 02's runner has not been verified on the live VPS**, so this is not a standing approval to run it. No database reset, Owner bootstrap, seed, or automatic SQL rollback exists in this workflow.

With no pending migrations, `apply` pulls only changed application digests and confirms the pulled registry digest and source commit label before touching Quadlets. It backs up every changed Maevelle Quadlet, replaces only that file's `[Container] Image=` line atomically, reloads rootless user systemd once, then restarts and verifies selected application services. Admin-only or Storefront-only changes restart only those services. An API or Worker digest change coordinates API, Admin, Storefront and Worker: Worker stops, API and frontends restart and pass readiness, then Worker starts. PostgreSQL and Caddy are never restarted by an application release. API liveness and database-backed readiness are checked through `127.0.0.1:18080`; Admin and Storefront routes are checked similarly. Service HTTP readiness has bounded 90-second retries. Final migration-ledger verification retries transient DNS, database-connection and container-exec errors for up to 90 seconds; configuration, missing-ledger and query errors fail without retry. The error record distinguishes a completed image rollout from final verification failure. No secret, raw stderr, or response body is logged.

The tool writes attempt metadata and Quadlet backups under `/home/maevelle/deployment/releases/attempts/`. It writes `current.json` only after service and HTTP verification, preserving the old `current.json` as `previous.json` after success. It checks that the migration ledger did not change during application rollout. `latest-attempt.json` records success or the failed step and scoped journal commands. No secret or unrestricted inspect output is stored.

## Failure and recovery

Invalid manifest, target mismatch, lock contention and pending migrations stop before service changes. A pull failure leaves Quadlets and services untouched. A later service/readiness failure may leave a partial application update; the failed attempt contains original Quadlet copies and does **not** claim a successful release. Inspect `systemctl --user status maevelle-<service>.service` and the scoped `journalctl --user -u ...` commands in the attempt record. The tool does not automatically restore images: compatibility with the current schema and any concurrent operator action cannot be assumed. If the previous release is compatible, an operator can restore its backed-up Maevelle Quadlet files, reload **user** systemd, restart only affected application units, and recheck health. For an incompatible schema, use a forward repair or a separately verified database/media restore with a compatible image set. Image rollback never reverses migrations.

After a **final verification** failure with healthy, already-running target images, use the separately confirmed `verify` command above. It does not pull, rewrite Quadlets, restart, migrate, bootstrap, seed, or reset; it writes only the shared lock and verified release metadata. Refusal leaves the prior failed attempt and release record intact. A recorded reconciliation does not retroactively turn the failed deployment attempt into a success. The old `podman exec` exit 1 cannot be attributed definitively to DNS because the earlier tool discarded stderr; the new tool emits fixed, sanitized cause categories when its ledger probe can classify the failure.

The status/plan/apply/verify implementation touches only the rootless `maevelle` user, six Maevelle units/containers, private network, protected Maevelle files, and selected app Quadlets. It neither invokes global Nginx nor changes host ports, OS packages, unrelated Podman resources, PostgreSQL/media volumes, or the Caddy gateway. `BETTER_AUTH_URL=http://127.0.0.1:18080` and `/api` path stripping remain unchanged.

## Installing this hotfix and reconciling the first release

Use the allowlisted `scripts/package-staging-tooling.py` archive and its checksum. On the Mac, compare the archive checksum with its sidecar before transfer. On the VPS, as `maevelle`, compare the transferred archive against the separately conveyed checksum, back up `/home/maevelle/deployment/tooling/`, inspect the archive member list, then extract it into that existing tooling directory. Check `python3 staging-deploy.py --help` and run `status` before `verify`. No service reload or restart is needed to install this tooling. Keep the previous archive available for operator recovery.

For the already-running `87fec723c9fcfa30424f82c7520c984bded477f3` release, use its published manifest file at the actual VPS path:

```sh
python3 /home/maevelle/deployment/tooling/staging-deploy.py verify --release /home/maevelle/deployment/releases/incoming/87fec723c9fcfa30424f82c7520c984bded477f3.json --confirm 87fec723c9fcfa30424f82c7520c984bded477f3
python3 /home/maevelle/deployment/tooling/staging-deploy.py status
```

The operator reported that this first live reconciliation succeeded and the previous failed-attempt record remained intact. For future use, check the manifest path before running the example. `verify` refuses any digest, Quadlet, network, service, schema, or route mismatch. On refusal it does not write `current.json`; inspect its sanitized error and scoped user-unit logs. It does not prove Worker job execution, business workflows, database dump integrity, or public HTTPS routing.
