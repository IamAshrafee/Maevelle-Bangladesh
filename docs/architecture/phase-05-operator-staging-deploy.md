# Phase 05: operator staging deployment and integration hotfix

## Audit and workflow

CircleCI publishes four application images and a release manifest image to private GHCR. It does not deploy. The Phase 03 rootless executor at `/home/maevelle/deployment/tooling/staging-deploy.py` owns status, plan, apply and verify. It validates host identity, migration ledger, Quadlet and running digests, uses the shared migration/deployment lock, and limits restarts to Maevelle application units. The first verified running release is `87fec723c9fcfa30424f82c7520c984bded477f3`.

The initial Phase 05 CLI connected as SSH user `ashrafee`, then tried to read protected `/home/maevelle` files directly. That produces `Permission denied`; the executor also requires effective user `maevelle`. The initial Node GHCR registry request read `GHCR_USERNAME`/`GHCR_TOKEN` only. Docker or Podman login did not supply those variables, so private package token exchange could return 401. The observed 401 alone cannot distinguish an absent local token from an expired token or missing package grant.

The hotfix uses one SSH command, `sudo -n /usr/local/libexec/maevelle-staging-operator`, with a JSON request on stdin. The root-owned gateway accepts no command-line arguments and validates action, full SHA and request size. It invokes one fixed Maevelle-owned adapter through `runuser -u maevelle`, with a clean environment containing `HOME`, `XDG_RUNTIME_DIR=/run/user/1001` and `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus`. The adapter works from `/home/maevelle/deployment/tooling`, validates the release manifest, writes it atomically as mode 0600 under the private incoming directory, and calls only the installed Phase 03 executor. It never accepts a caller-supplied path or shell command. The exact sudoers rule allows the gateway with **no arguments**, without a repeated password. No permission on `/home/maevelle` is relaxed.

```sh
pnpm staging --help
pnpm staging status
pnpm staging plan --sha <full-published-commit>
pnpm staging verify --sha <full-published-commit>
pnpm staging deploy --sha <full-published-commit>
```

`plan` and `status` do not change running services. `plan` fetches the immutable GHCR release image by the digest returned for the exact SHA tag, validates its embedded manifest, uploads it, and asks the executor for host, ledger and service preflight. `deploy` refuses pending migrations, shows the plan, requires the operator to type the full SHA, then calls the executor's locked apply and health verification. `verify` independently reconciles an already-running release without pulling or restarting app images. The executor keeps the migration gate and scoped restart logic authoritative.

## MacBook GHCR setup

Use a GitHub personal access token (classic) with `read:packages` and read access to the private Maevelle GHCR packages. GitHub's [Container registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) specifies this scope. Store the token through Docker or Podman login using `--password-stdin`; do not type it in a command argument, paste it into the repository, or put it in shell history. Docker's [credential-store documentation](https://docs.docker.com/reference/cli/docker/login/) explains its macOS helper or Keychain storage. The Node registry client now reads the selected engine's configured credential helper or auth file when GHCR issues its bearer challenge; the container engine independently uses that same login to pull the digest-pinned release image. `GHCR_USERNAME` and `GHCR_TOKEN` remain an optional paired override for a protected session. Missing credentials and rejected/expired credentials produce separate errors. `--engine podman` selects Podman's auth file and pull command.

```sh
# On the Mac, feed a read-only token from a protected interactive source to stdin.
docker login ghcr.io --username <github-user> --password-stdin
# For Podman, use podman login ghcr.io --username <github-user> --password-stdin.
```

Supply the token to `--password-stdin` from the operator's protected source. Do not run the displayed login command with an empty stdin. Verify local access with `pnpm release list --remote` after Docker login, or `pnpm release list --remote --engine podman` after Podman login; this contacts GHCR but makes no VPS or application change. The exact target command still requires the full commit SHA and validates the manifest image's registry digest and embedded commit.

## One-time VPS authorization: review before installation

These are **manual operator setup artifacts**, not an automatic installer. Review [the gateway](../../scripts/staging/operator-gateway.py), [the Maevelle adapter](../../scripts/staging-operator-entry.py), and [the sudoers rule](../../scripts/staging/maevelle-staging-operator.sudoers) locally. Confirm `/usr/sbin/runuser`, `/usr/bin/python3`, UID 1001, the existing rootless user bus, and the installed Phase 03 tooling paths on the intended VPS. Do not connect as root or change the ownership or mode of `/home/maevelle` itself.

From the repository root on the Mac, stage the three reviewed files in `ashrafee`'s home directory. Record their local SHA-256 digests, then compare them with `sha256sum` on the VPS before installation:

```sh
shasum -a 256 scripts/staging/operator-gateway.py scripts/staging-operator-entry.py scripts/staging/maevelle-staging-operator.sudoers
scp scripts/staging/operator-gateway.py maevelle-staging:/home/ashrafee/operator-gateway.py
scp scripts/staging-operator-entry.py maevelle-staging:/home/ashrafee/staging-operator-entry.py
scp scripts/staging/maevelle-staging-operator.sudoers maevelle-staging:/home/ashrafee/maevelle-staging-operator.sudoers
```

Then, **on the VPS as `ashrafee`**, verify those three hashes against the Mac output and use the existing one-time administrator authorization:

```sh
sha256sum /home/ashrafee/operator-gateway.py /home/ashrafee/staging-operator-entry.py /home/ashrafee/maevelle-staging-operator.sudoers
sudo visudo -cf /home/ashrafee/maevelle-staging-operator.sudoers
sudo test -d /usr/local/libexec || sudo install -d -o root -g root -m 0755 /usr/local/libexec
sudo install -o root -g root -m 0755 /home/ashrafee/operator-gateway.py /usr/local/libexec/maevelle-staging-operator
sudo install -o maevelle -g maevelle -m 0755 /home/ashrafee/staging-operator-entry.py /home/maevelle/deployment/tooling/staging-operator-entry.py
sudo install -o root -g root -m 0440 /home/ashrafee/maevelle-staging-operator.sudoers /etc/sudoers.d/maevelle-staging-operator
sudo visudo -cf /etc/sudoers
sudo stat -c '%U:%G %a %n' /usr/local/libexec/maevelle-staging-operator /home/maevelle/deployment/tooling/staging-operator-entry.py /etc/sudoers.d/maevelle-staging-operator
sudo -n -l /usr/local/libexec/maevelle-staging-operator
```

The sudoers file's `""` means the gateway may run with no arguments. The gateway rejects extra request fields, invalid actions and SHA/path injection. It checks that the `maevelle` account still has UID 1001 and that `/run/user/1001` belongs to it. The adapter and Phase 03 executor run with effective UID 1001; they use only Maevelle's protected directory, private network, user units and deployment lock. The gateway does not grant a general `sudo -u maevelle`, shell, editor, interpreter, or host service command. The root-owned gateway must remain non-writable by `ashrafee` and `maevelle`.

If any install or `visudo` check fails, restore the previous sudoers file or remove the new one before using the CLI. Rollback of this hotfix needs no service restart:

```sh
sudo rm -f /etc/sudoers.d/maevelle-staging-operator
sudo rm -f /usr/local/libexec/maevelle-staging-operator
sudo rm -f /home/maevelle/deployment/tooling/staging-operator-entry.py
sudo visudo -cf /etc/sudoers
```

Remove only these three new files. Keep the Phase 03 executor, releases, Quadlets, PostgreSQL and media untouched. If an older gateway was previously installed, restore its saved copy instead of deleting it.

## Read-only first live validation

After the manual setup, run on the Mac:

```sh
pnpm staging --help
pnpm staging status
pnpm staging plan --sha 87fec723c9fcfa30424f82c7520c984bded477f3
```

`status` confirms the recorded running commit, migration count and last attempt. `plan` reads the published GHCR manifest, transfers it privately and confirms the target against the already-running release. It may create or replace only that Maevelle release-input JSON; it does not pull app images, migrate, restart or alter the release record. Expected plan: zero pending migrations and no changed images/services for the current release. Stop if identity, digest, ledger or health evidence differs. `verify` is a separate health/reconciliation action that can update `current.json`; run it only when that record needs reconciliation. Do not use `deploy` for this read-only acceptance.

## Failure, retry and remaining limits

Missing sudo authorization produces a specific CLI error; no fallback to direct protected-path access occurs. A failed upload cannot start an apply. After a failed apply, the CLI reports the recorded running release and latest failed step when status is available. Inspect `/home/maevelle/deployment/releases/latest-attempt.json`, its attempt directory and the named Maevelle `journalctl --user` units before retrying. Re-running `deploy` recomputes the plan under the lock; `verify` checks a healthy already-running release without service restarts. Migration application remains the separate, reviewed `staging-migrate.sh` procedure.

The hotfix has local mock verification only. No VPS connection, host privilege change, migration, restart or deployment was performed in this work. CircleCI still builds all four application images per commit. The Worker has no independent heartbeat endpoint; Phase 04 backup/recovery remains paused. A passing status/plan does not establish database recovery readiness or business workflow acceptance.
