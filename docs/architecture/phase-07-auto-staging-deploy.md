# Phase 07 — pull-based automatic staging deployment

## 2026-11-03 audit

CircleCI pipeline `0e4d0e2a-9652-48e0-925e-be6dbd320b76` published all four images and ready marker `staging-ready-000000000010-0c0da8821793`. The release manifest digest is `sha256:4e140fa863ebfcfb1fb06f2171a03654cfe558d4076d42482c591964f4e7cd6a`. CircleCI has one publish job and does not invoke the VPS. Its green status means a candidate was published; verify rollout independently using `pnpm staging status`.

The VPS operator gateway reported six active services and four running image refs matching their Quadlets for recorded release `5b4d8bdaed196c2cd743da6ff95131afedcdf384`. The last recorded rollout was for that release. The staging hostname resolves to this VPS. Its Nginx vhost forwards to Caddy on `127.0.0.1:18080`; public and loopback Storefront/Admin JavaScript asset sets matched. The available SSH account could not inspect the Maevelle user timer or private journal. A timer check before rollout could therefore have occurred without a recorded rollout.

The staging ledger has 55 migrations, through `3206_media_rendition_repair`. This candidate requires 67. The migration gate blocks rollout with 12 pending migrations (`3207` through `3218`), even if the timer discovers the candidate. The gate remains in force. The checker now records the last migration block for the operator status command; the publish job archives the ready marker and explicitly reports that VPS rollout is independent.

## Current disposable staging cutover

The owner waived backup, restore rehearsal, recovery-point validation, and data-preservation gates for this development staging cutover. This waiver does not authorize deletion or apply to production. Prefer the existing 55-to-67 forward path, which passed the synthetic rehearsal. The previous release cannot create a valid Cart after credential retirement in migration 3214.

1. Obtain a Maevelle-scoped maintenance window and operator access. As rootless `maevelle`, inspect the timer and checker journal, record the original enabled and active states, inspect the six user units and their dependencies, and verify that stopping the four app units leaves PostgreSQL and Caddy running. Verify the staging database name, private Podman network, and named PostgreSQL and media volumes. Verify that the rootless registry credential can access the release and four pinned app images.
2. Install the reviewed Maevelle deployment tooling and stage the published manifest at `/home/maevelle/deployment/releases/incoming/0c0da882179316b75421e9f431e38daa3db758ef.json`. Compare it with the CI artifact and GHCR manifest digest from the audit. Run `staging-deploy.py plan --release <manifest>` and review the 55-entry ledger, 12 pending migrations, and four pinned image changes. Before downtime, run `staging-cart-preflight.sql` against the verified PostgreSQL container using an authorized read-only session. It requires the expected database name, PostgreSQL major version, and baseline ledger boundary. Require all reported counts to be zero. The probe checks Cart scope, credentials, revisions, quantities and prices, the expected absence of Wishlist and recommendations schemas, and storefront event integrity. The operator plan separately verifies the exact ledger prefix against the manifest. If incompatible data is found, stop for a separate decision. A rebuild would discard staging accounts, orders, carts, settings and other database records, and could leave existing media objects without metadata.
3. For the approved cutover, disable and stop only the Maevelle user timer and confirm the checker is inactive. Leave the timer disabled through HTTPS acceptance. Run the following as rootless `maevelle` in its user session with the private GHCR auth file configured. The command checks the recorded release and current ledger, pulls and verifies all four images before downtime, holds the shared migration/deploy lock, stops the application units, checks that the database and Caddy remain active, runs the pinned migration job, and verifies the complete ledger before changing Quadlet image refs. It starts and verifies only the candidate application services.

   ```sh
   sha=0c0da882179316b75421e9f431e38daa3db758ef
   systemctl --user disable --now maevelle-auto-deploy.timer
   python3 /home/maevelle/deployment/tooling/staging-deploy.py cutover \
     --release "/home/maevelle/deployment/releases/incoming/$sha.json" --confirm "$sha"
   ```

4. Confirm 67 applied migrations, candidate image digests and application readiness. Over staging HTTPS, verify Storefront, Admin, sign-in and session behavior, and guest Bag create/add/update. Run the cutover from a durable operator session such as tmux on the VPS. If connectivity is lost, reconnect to the existing session and inspect the lock, attempt record, ledger and unit state before deciding what to do. If a step fails, leave the timer held and inspect the ledger, attempt record and unit state. After 3214, use a compatible candidate/repair image and forward repair. Do not start the prior release or reset a database as an automatic failure response.
5. After acceptance, restore the timer’s previous state, or enable it under separate operator approval if it was previously disabled. Future image-only releases can roll out automatically. Candidates with pending migrations remain held for supervised cutover.


## Mechanism

The existing CircleCI `main` publisher runs its image, migration, upgrade and API-startup checks, pushes all four application images and the digest-pinned release manifest image, then publishes an additional `staging-ready-<12-digit pipeline number>-<12-character SHA>` tag on that **same manifest image**. It first checks that the commit is still the remote `main` head. A failed job or a job superseded before marker publication cannot create a ready tag. Each ready tag has an immutable pipeline number for selection; the tag itself is only a discovery pointer. The checker resolves the selected tag to its registry digest before pulling it.

A rootless `maevelle` systemd user timer checks every two minutes. The checker lists ready tags from private GHCR, selects the highest pipeline number, and skips a candidate that is already running, older than the last automatic rollout, or older than the recorded running manifest. It verifies the downloaded release image digest, its revision label, the embedded full source SHA, exact Maevelle image refs and migration history. It then uses the existing Phase 03 `build_plan` and `apply_release` functions. Those functions preserve the existing migration/deployment lock, pending-migration block, immutable app-image checks, scoped Quadlet changes and health verification. The checker never invokes `staging-migrate.sh`, seed or reset. A rollout failure records the failed release ref in `auto-deploy.json`; later timer runs hold that same release for manual review instead of restarting it repeatedly. A newer ready release may be considered normally.

The service is oneshot. systemd prevents overlapping instances of the same unit, and the checker has its own nonblocking lock for manual runs. It does not open a port or run continuously. The Phase 05 manual CLI remains available. No CircleCI SSH credential or host Nginx change is needed.

## HTTPS and configuration

The checker updates only the app image refs through Phase 03. It does not write the protected Quadlet environment file, Caddy or Nginx, so the current `BETTER_AUTH_URL=https://maevelle-staging.duckdns.org` remains in place. Admin and Storefront browser auth calls use same-origin `/api/auth/*`; the inspected frontend sources have no `NEXT_PUBLIC_*` staging API URL. `STOREFRONT_BASE_URL` and the API auth/trusted-origin settings are runtime environment values. Next's localhost rewrites are development routing and require browser smoke validation on each new image. Before enabling the timer, verify `/admin`, Storefront, API health, sign-in cookies and redirects at the HTTPS staging hostname. Businessupdate.org and other host services are outside this workflow.

## One-time VPS installation, after local review

Install files manually using `ashrafee`'s existing SSH access and ordinary one-time sudo authorization. From the Mac repository root, stage only these files and compare local SHA-256 values with `sha256sum` on the VPS before installation:

```sh
shasum -a 256 scripts/staging-auto-deploy.py scripts/staging/auto.py scripts/staging/registry.py infrastructure/systemd/user/maevelle-auto-deploy.service infrastructure/systemd/user/maevelle-auto-deploy.timer
ssh maevelle-staging 'mkdir -m 700 -p /home/ashrafee/phase07'
scp scripts/staging-auto-deploy.py scripts/staging/auto.py scripts/staging/registry.py infrastructure/systemd/user/maevelle-auto-deploy.service infrastructure/systemd/user/maevelle-auto-deploy.timer maevelle-staging:/home/ashrafee/phase07/
```

On the VPS as `ashrafee`, run `sha256sum /home/ashrafee/phase07/*` and compare the five file hashes. Do not transfer a GHCR token with the files. Install only these Maevelle files; do not alter PostgreSQL, media, Caddy, host Nginx or other user units.

```sh
sudo install -o maevelle -g maevelle -m 0755 /home/ashrafee/phase07/staging-auto-deploy.py /home/maevelle/deployment/tooling/staging-auto-deploy.py
sudo install -o maevelle -g maevelle -m 0644 /home/ashrafee/phase07/auto.py /home/maevelle/deployment/tooling/staging/auto.py
sudo install -o maevelle -g maevelle -m 0644 /home/ashrafee/phase07/registry.py /home/maevelle/deployment/tooling/staging/registry.py
sudo install -d -o maevelle -g maevelle -m 0700 /home/maevelle/.config/containers
sudo install -d -o maevelle -g maevelle -m 0755 /home/maevelle/.config/systemd/user
sudo install -o maevelle -g maevelle -m 0644 /home/ashrafee/phase07/maevelle-auto-deploy.service /home/maevelle/.config/systemd/user/maevelle-auto-deploy.service
sudo install -o maevelle -g maevelle -m 0644 /home/ashrafee/phase07/maevelle-auto-deploy.timer /home/maevelle/.config/systemd/user/maevelle-auto-deploy.timer
```

The service uses `/home/maevelle/.config/containers/auth.json` for both the GHCR tag request and Podman pulls. As `maevelle`, log in to `ghcr.io` with a read-only `read:packages` credential using `podman login --authfile /home/maevelle/.config/containers/auth.json --password-stdin`; supply the token on stdin from a protected operator source, never as an argument or in a log. Confirm that auth file is owned by `maevelle` and mode 0600. The existing rootless user manager and `/run/user/1001` must be active. The timer does not create them.

Use the existing one-time admin path to run the following as `maevelle` with its user-session environment. The commands below do not enable the timer:

```sh
sudo -u maevelle env HOME=/home/maevelle XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus REGISTRY_AUTH_FILE=/home/maevelle/.config/containers/auth.json systemctl --user daemon-reload
sudo -u maevelle env HOME=/home/maevelle XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus REGISTRY_AUTH_FILE=/home/maevelle/.config/containers/auth.json /usr/bin/python3 /home/maevelle/deployment/tooling/staging-auto-deploy.py preflight
sudo -u maevelle env HOME=/home/maevelle XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus REGISTRY_AUTH_FILE=/home/maevelle/.config/containers/auth.json /usr/bin/python3 /home/maevelle/deployment/tooling/staging-deploy.py status
```

The preflight resolves and validates the newest ready release, checks the current service and migration state, and prints the selected services. It may pull/cache only the release **metadata image** and its JSON; it does not change application units or data. Compare the printed running commit with the last verified release and review any migration block or mismatch. For a controlled new release, first review CircleCI's completed job and its ready tag, then invoke one manual `check` as `maevelle`. **The next command can deploy application images**:

```sh
sudo -u maevelle env HOME=/home/maevelle XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus REGISTRY_AUTH_FILE=/home/maevelle/.config/containers/auth.json /usr/bin/python3 /home/maevelle/deployment/tooling/staging-auto-deploy.py check
```

Inspect Phase 03 verification, the current release, HTTPS routes and browser auth. Only after that live validation, enable the timer:

```sh
sudo -u maevelle env HOME=/home/maevelle XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus REGISTRY_AUTH_FILE=/home/maevelle/.config/containers/auth.json systemctl --user enable --now maevelle-auto-deploy.timer
```

## Daily operator commands

Run these in the `maevelle` user session (or prefix with the one-time `sudo -u maevelle env ...` form above):

```sh
systemctl --user status maevelle-auto-deploy.timer maevelle-auto-deploy.service
journalctl --user -u maevelle-auto-deploy.service -n 80 --no-pager
python3 /home/maevelle/deployment/tooling/staging-auto-deploy.py preflight
python3 /home/maevelle/deployment/tooling/staging-auto-deploy.py check
systemctl --user disable --now maevelle-auto-deploy.timer
systemctl --user enable --now maevelle-auto-deploy.timer
```

`preflight` never deploys. `check` may deploy; use it only after reviewing the candidate. To investigate a held failure, inspect `/home/maevelle/deployment/releases/auto-deploy.json` and Phase 03's `latest-attempt.json` plus the scoped user-unit journal. Do not delete a failed marker or force a retry until the failed step, schema compatibility and current running refs are understood. Use `pnpm staging status|plan|verify|deploy` on the Mac as the manual fallback. Disabling the timer leaves the running release and data untouched.

## Limits

### First-rollout reliability hotfix

The first live attempt for `2dd6d78957b0a271bf6260fab775f5ba83a7368c` left the Worker stopped while the API and frontends were running. The reported `podman container failed (exit 1)` is emitted by Phase 03's `podman container exists` probe; a stopped Quadlet can remove its container. The available report does not identify which invocation reached that probe. A normal `RuntimeError` inside the checked-in executor would have marked the attempt failed, so the observed `running` record also needs the scoped attempt/journal evidence to establish its exact interruption point. Host identity and final verification now check the six user-unit states before probing containers, so a missing Worker is reported by name. If rollout fails after stopping Worker, Phase 03 attempts to start and verify only that Worker when the new API, Admin and Storefront are healthy, and records both the original failure and recovery result. It still does not mark the release verified after a failed step.

The checker now writes `inProgressRef` before applying any release. If the process ends before ordinary failure finalization, later checks hold that release for review. Phase 03's `finally` also turns a still-running attempt into a failed interrupted attempt. After installing this hotfix, keep the timer disabled, inspect the existing `latest-attempt.json` and `auto-deploy.json`, and use the Phase 05 `verify` path for the already-running `2dd6d78957b0a271bf6260fab775f5ba83a7368c` only after all four application units, digests, migration ledger and health checks match. A successful reconciliation can clear the held auto-deploy marker on the next check without redeploying. Do not delete historical attempt records or force an image rollback from this report alone.

This phase uses local mocks and focused tests only. Live GHCR pagination/auth, the host's installed Podman auth path, user-manager environment and HTTPS/browser behavior still require the staged acceptance above. Pipeline numbers order CircleCI pipeline creation, while the `main` check prevents ready publication by a superseded build at the moment of marking. A push in the small interval between that check and marker publication can briefly leave an older eligible candidate; the checker's stored sequence and recorded-release timestamp prevent an older candidate replacing a newer verified release. The system does not infer database migration safety or backup readiness. Pending migrations require the separate manual Phase 02 procedure and recovery review.
