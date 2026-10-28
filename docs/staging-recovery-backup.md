# Maevelle staging backup capture and retention (Phase 04.2)

**Status:** locally implemented and mock-tested. No live backup, service control, upload, deletion, or isolated restore has been performed. Real recoverability remains unverified until Phase 04.3 restores a fetched set into disposable targets.

## Command interface

Run as the rootless `maevelle` user (UID 1001) from the installed tooling directory. `python3 scripts/staging-recovery.py --help` shows the syntax. Each mutating command takes the same Maevelle migration/deployment lock and exits on contention.

| Command | Effect |
| --- | --- |
| `inventory` or `status` | Phase 04.1 read-only host inventory. |
| `plan --kind database-only` / `plan --kind coordinated` | Read-only identity and service-impact plan; prints a hash-bound `planId`. Requires approved configuration and sentinel, so a missing prerequisite refuses the plan. |
| `checkpoint --confirm PLAN_ID` | Online encrypted PostgreSQL custom-format checkpoint, with **no media**. Cannot meet the coordinated recovery gate. |
| `capture --confirm PLAN_ID` | Stops only Maevelle Worker and API, captures matched database and media, restarts those units, and publishes only a complete local set. Causes a Maevelle-only API outage during the window. |
| `inspect --id SET_ID` | Local sizes and SHA-256 verification, with no restore claim. |
| `transfer-verify --id SET_ID --confirm SET_ID` | Immutable upload to the approved remote mount, full readback hash check, then `integrity-verified`. Retry the same command after a recoverable interrupted transfer. |
| `retention-plan` | Read-only exact-ID decisions and `planId`. |
| `retention-execute --confirm PLAN_ID` | Deletes only exact eligible Maevelle set directories, after recalculating the plan under the shared lock. Never touches volumes. |

There is no schedule, reset, seed, migration, role change, host Nginx command, or broad prune in this CLI. Plan IDs change when their inventory/policy inputs change. This tooling is not installed or enabled on the VPS by this repository change.

## Live prerequisites and approvals

1. Re-run the Phase 04.1 inventory and compare the host fingerprint, UID 1001, six scoped units, exact network/database/volumes, PostgreSQL 18.6 clients, migration ledger, media readability, protected-file modes, and **deployed release record**. The deployed release in the supplied evidence is `87fec723c9fcfa30424f82c7520c984bded477f3`; the local Git HEAD is not a substitute.
2. Confirm that the Worker Quadlet and running container mount **the same `maevelle-staging-media` volume** at `/app/var/media`. Phase 04.1 did not verify this. The coordinated command refuses an absent/different mount. Confirm the API and Worker SIGTERM shutdown path and Quadlet stop timeout allow in-flight work to drain; `systemctl stop` must report `Result=success`. All current repository writers found are API uploads/deletes and Worker media jobs/provider attachment ingestion. Browser uploads and provider callbacks enter through the API. A future writer requires a reviewed quiescence update.
3. Add `STAGING_ENVIRONMENT=staging` exactly once to the protected staging environment file. It was absent in the supplied inventory. Do this only under an approved host configuration change; no command here writes it.
4. Select and approve an **off-host remote mount** at `/mnt/maevelle-staging-backups`, with private Maevelle-scoped transfer credentials managed outside Git. The mounted-filesystem adapter accepts named remote filesystem types only and requires atomic directory rename, hard-link publication, fsync and readback semantics. Prove these with a disposable object before using it. Local directories are accepted by tests only. An unmounted/local path cannot qualify as off-host.
5. Establish custody and retrieval of the `age` recipient private key outside this VPS; install the stable `age` CLI and a protected `backup-recipients.txt` (public `age1...` recipients, owner UID 1001, mode 0600). The private key is never an argument to capture and must not be copied into reports. Approve the key ID, provider, 14 daily/8 weekly proposal, space budget, backup window, data-loss target, and service impact.
6. Install a UID-1001-owned `deployment/secrets/recovery.json` mode 0600, containing only nonsecret approval metadata. Example structure below. `hostId` must come from a trusted inventory and `releaseCommit` must match the **deployed** record. `enabled` and `storage.approved` are explicit operator gates; `retention.approved` is a separate deletion gate.

```json
{
  "formatVersion": 1,
  "enabled": true,
  "hostId": "<32-hex fingerprint from trusted inventory>",
  "releaseCommit": "87fec723c9fcfa30424f82c7520c984bded477f3",
  "keyId": "staging-key-v1",
  "storage": {"provider": "mounted-filesystem", "root": "/mnt/maevelle-staging-backups", "approved": true},
  "retention": {"daily": 14, "weekly": 8, "approved": false}
}
```

Do not place passwords, TOTP/recovery codes, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_ENCRYPTION_KEY`, provider tokens, private keys, or raw environment values in this JSON or the recovery manifest. Keep the separate protected recovery inventory for database roles/extensions, auth key custody, Owner MFA recovery, application images, media settings, and provider integration configuration. Backup capture does not prove those dependencies can be restored.

## Capture and artifact lifecycle

`checkpoint` runs PostgreSQL 18 `pg_dump --format=custom` against exactly `maevelle_staging` inside the exact Maevelle PostgreSQL container. `capture` first stops Worker then API through their exact user-systemd units. It checks they are inactive, their containers stopped, stop results successful, no other database client sessions remain, and the active Maevelle network has exactly the expected nonwriter containers. PostgreSQL, Caddy, host Nginx and unrelated applications stay running. The API outage blocks browser uploads and provider callbacks at the Maevelle gateway; provider retries and external delivery are outside the snapshot.

The dump is created in a private runtime directory, inspected by PostgreSQL 18 `pg_restore --list`, and encrypted with `age`. For a coordinated set, the media volume is walked using no-follow file descriptors and tarred under the same stopped-writer boundary. Unexpected symlinks or changed file metadata refuse capture. The migration ledger, network/session state and media count/bytes are checked again before release. An encrypted database artifact, encrypted media artifact, `quiescence.json`, and versioned `manifest.json` are fsynced in a private candidate directory, then atomically renamed to its immutable set ID. Database-only sets omit media and evidence. The local backup root must be private, UID-owned, and free of symlinks. SIGTERM triggers cleanup and service restoration; SIGKILL, host power loss or filesystem failure can leave a private candidate or temporary plaintext requiring operator inspection and secure disposal. Never promote an orphan candidate.

The manifest records `candidate → captured → transferred → integrity-verified`; `restore-verified` is reserved for the independent Phase 04.3 drill. `captured` proves local packaging and application availability recovery, `transferred` means the remote object was published, and `integrity-verified` means every encrypted object was read back and hashed. None proves restore usability. The remote set uses the exact set ID with immutable `capture-manifest.json` and `verified-manifest.json`. Interrupted transfer can be retried with the same ID; differing preexisting bytes refuse overwrite. Encryption and upload errors never silently create a verified set. Local manifest atomic updates may leave `.manifest-next` after host failure; that set is blocked pending private operator review.

## Retention and failure handling

The proposed policy retains one newest set per day for 14 days and one per ISO week for 8 weeks. It also keeps the two newest independently restore-verified coordinated sets. A `pin.json` in an exact set directory with `{"recoverySetId":"...","reason":"pre-migration"}` or `pre-reset`/`operator` freezes deletion; pins must be created only by an approved future workflow or operator action. Incomplete, database-only and non-restore-verified sets are never automatically pruned. No deletion is eligible until two distinct isolated-restore report IDs exist and retention approval is true. Plans list each exact set ID, reason, and manifest hash. The execute step locks, replans, checks local artifact hashes, reads remote objects and removes only listed names. Partial remote deletion from storage failure needs operator reconciliation; never rerun an old plan blindly. This implementation does not delete unknown files, active volumes, or unrelated directories.

On a capture failure, inspect only `maevelle-api.service` and `maevelle-worker.service` status and private scoped logs. If either did not return healthy, restore Maevelle availability before another attempt. A failed candidate has no published final ID. On transfer failure, confirm remote mount health, retry the exact set ID, and investigate any mismatched immutable bytes. On retention failure, stop and inspect the exact set locally and remotely; do not manually sweep the backup root. No command changes staging data, replays migrations, bootstraps Owner, or reverses provider side effects.

**First authorized VPS procedure:** install/review the new files and exact permissions without running mutating commands; run `inventory`, review the Worker mount and stop-timeout/readiness contracts, establish approved sentinel/key/off-host mount and key custody, run a read-only `plan --kind coordinated`, and obtain explicit approval of that specific plan and Maevelle-only outage. A later operator-controlled live capture and a separate isolated off-host restore drill are required before claiming recoverability or approving pruning.
