# Phase 03: digest-pinned development staging releases

Status: repository implementation plus user-reported read-only VPS status verification. The installed tooling passed `status` with Python 3.12.3 and Podman 4.9.3: six units active, four running application image references matching Quadlets, and 51 applied migrations. No Phase 03 release metadata exists yet. No Phase 03 image publication, deployment, service restart, or database migration has occurred; the existing `ccd405c1e6fa8c827307977b947a4a3dbce859f5` VPS release remains operational.

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

The deployed `ccd405c1e6fa8c827307977b947a4a3dbce859f5` release predates Phase 03 manifests. `status` works without `current.json`: it reports `recordedCommit: null` while showing observed Quadlet/running image references, unit states, and migration names. This is **not** a historical publication or verified deployment record. No baseline adoption is required for read-only status or planning; the first successful Phase 03 `apply` creates the first verified record. Transfer a fetched, validated target `<SHA>.json` separately into a Maevelle-owned release input directory for planning. Tooling installation and read-only status were user-verified; release planning and apply have not been run.

Example commands **on the VPS as `maevelle`, never with root `systemctl`**:

```sh
python3 /home/maevelle/deployment/tooling/staging-deploy.py status
python3 /home/maevelle/deployment/tooling/staging-deploy.py plan --release /home/maevelle/deployment/releases/incoming/<SHA>.json
python3 /home/maevelle/deployment/tooling/staging-deploy.py apply --release /home/maevelle/deployment/releases/incoming/<SHA>.json --confirm <full-SHA>
python3 /home/maevelle/deployment/tooling/staging-deploy.py status --release /home/maevelle/deployment/releases/incoming/<SHA>.json
```

`staging-deploy.py status` reads only Maevelle unit state, Quadlet image references, running image names, the migration ledger through a SELECT in the existing API container, and optional release records. `plan` adds target-manifest comparison and names pending migrations, changed digests, exact Quadlet files, restart order, and untouched host assets. Neither command creates a lock/cache/state file (Python bytecode writing is disabled), pulls images, reloads systemd, restarts services, backs up, seeds, or migrates. They never display the env file or full container configuration. A mismatch between running image and Quadlet, an unexpected ledger, missing identity, or missing file fails closed.

The separate `staging-migrate.sh status` and `preflight` require a **locally present**, digest-pinned `ghcr.io/iamashrafee/maevelle-api` image and the protected `/home/maevelle/deployment/secrets/staging.env`; they do not pull an image. They create or open `/run/user/1001/maevelle-staging-migration.lock` (or `$XDG_RUNTIME_DIR/maevelle-staging-migration.lock`), take a nonblocking lock, and run short-lived rootless Podman containers for target/history checks and migration status. They do not apply migrations. Use the same `XDG_RUNTIME_DIR` for the migration and deployment commands so they share that lock. The current deployed image predates Phase 02 and may lack its history checker; use a reviewed Phase 02-capable candidate image for those commands. `staging-migrate.sh apply` remains a separate, deliberate migration operation and may pull its selected image.

## Apply behavior and migration gate

`apply` requires full-SHA confirmation and takes the same `maevelle-staging-migration.lock` used by Phase 02's migration runner. It recomputes the plan inside the lock. If any target migration is pending, it stops before pulling or changing an image. After a separately reviewed backup/recovery rehearsal and compatibility decision, the operator may invoke the existing one-time `staging-migrate.sh preflight` and then its confirmed `apply` for the target API image. Re-run deployment `plan` and `apply` afterward. **Phase 02's runner has not been verified on the live VPS**, so this is not a standing approval to run it. A first activation with no pending migrations is preferable. No database reset, Owner bootstrap, seed, or automatic SQL rollback exists in this workflow.

With no pending migrations, `apply` pulls only changed application digests and confirms the pulled registry digest and source commit label before touching Quadlets. It backs up every changed Maevelle Quadlet, replaces only that file's `[Container] Image=` line atomically, reloads rootless user systemd once, then restarts and verifies selected application services. Admin-only or Storefront-only changes restart only those services. An API or Worker digest change coordinates API, Admin, Storefront and Worker: Worker stops, API and frontends restart and pass readiness, then Worker starts. PostgreSQL and Caddy are never restarted by an application release. API HTTP readiness is checked at `/api/health/ready` through `127.0.0.1:18080` with up to 90 seconds; Admin `/admin` and Storefront `/` are checked similarly. Worker verification covers its unit, running container and image identity; a separate heartbeat/queue check would strengthen live acceptance.

The tool writes attempt metadata and Quadlet backups under `/home/maevelle/deployment/releases/attempts/`. It writes `current.json` only after service and HTTP verification, preserving the old `current.json` as `previous.json` after success. It checks that the migration ledger did not change during application rollout. `latest-attempt.json` records success or the failed step and scoped journal commands. No secret or unrestricted inspect output is stored.

## Failure and recovery

Invalid manifest, target mismatch, lock contention and pending migrations stop before service changes. A pull failure leaves Quadlets and services untouched. A later service/readiness failure may leave a partial application update; the failed attempt contains original Quadlet copies and does **not** claim a successful release. Inspect `systemctl --user status maevelle-<service>.service` and the scoped `journalctl --user -u ...` commands in the attempt record. The tool does not automatically restore images: compatibility with the current schema and any concurrent operator action cannot be assumed. If the previous release is compatible, an operator can restore its backed-up Maevelle Quadlet files, reload **user** systemd, restart only affected application units, and recheck health. For an incompatible schema, use a forward repair or a separately verified database/media restore with a compatible image set. Image rollback never reverses migrations.

The status/plan/apply implementation touches only the rootless `maevelle` user, six Maevelle units/containers, private network, protected Maevelle files, and selected app Quadlets. It neither invokes global Nginx nor changes host ports, OS packages, unrelated Podman resources, PostgreSQL/media volumes, or the Caddy gateway. `BETTER_AUTH_URL=http://127.0.0.1:18080` and `/api` path stripping remain unchanged.

## Activation gate

The local tests cover manifest validation and digest parsing; release artifact round trip; read-only planning; target rejection; selective and coordinated plans; migration gate; lock contention; failed pull; failed readiness; and preservation of unrelated Quadlets and named volumes by non-use. User-reported read-only VPS `status` verification additionally confirmed the live Quadlet syntax, Podman inspect fields, service states, image references, and 51-name migration ledger. GHCR authentication, target-release `plan`, live readiness timing, Worker heartbeat, and an actual deployment remain unverified. Run `plan` against a published manifest before considering `apply`. Activate `apply` only for an approved digest-pinned release with zero pending migrations, a recent backup/restore check and an operator watching the resulting user-unit logs and browser smoke checks.
