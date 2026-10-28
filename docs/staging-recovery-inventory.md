# Phase 04.1 staging recovery inventory

`scripts/staging-recovery-inventory.py` is a read-only, operator-invoked inspection command. It has no backup, restore, reset, migration, seed or service-control mode. It uses Python's standard library and the existing Phase 03 `staging` modules. It reports only Maevelle's fixed rootless user, six units/containers, private network, two named volumes, database version/name/migration count/extensions, media file count/bytes, available PostgreSQL tools, protected-file permissions, backup-directory metadata and the recorded application release. It never prints environment values, database rows or secret contents. Its JSON output is still operational metadata and should be kept private.

## Local validation

From the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=scripts python3 -m unittest recovery.test_contract recovery.test_inventory -v
```

The portable manifest validator is `scripts/recovery/contract.py`. Its format version is 1; see the Phase 04.1 section of [the architecture](architecture/phase-04-staging-data-lifecycle.md) for fields, state transitions and eligibility. Validation is a structural gate, not proof that a dump can restore. The command does not create a manifest or a backup.

| JSON field | Version 1 meaning |
| --- | --- |
| `formatVersion`, `recoverySetId`, `kind`, `state`, `stateHistory` | Immutable version/ID, `database-only` or `coordinated`, current state and ordered UTC transitions. |
| `environment`, `database` | Fixed staging identities including hashed host ID and PostgreSQL 18 server/client versions. |
| `capture`, `recoveryPoint`, `consistency` | UTC capture interval, database/media recovery points, limitations, writer quiescence interval and matching ledger hashes. |
| `artifacts`, `mediaExpected`, `encryption`, `offHost` | Safe artifact names, sizes, SHA-256 digests, expected media count/bytes, `age` key ID and opaque off-host object reference. |
| `release`, `migrations` | Full deployed release SHA, four immutable image refs, sorted baseline-compatible migration names and their SHA-256 hash. |
| `verification.integrity`, `verification.restore` | Off-host hash/readback result and isolated restore report ID/SHA-256 tied to the recovery-set ID and migration hash. |

The only success sequence is `candidate → captured → transferred → integrity-verified → restore-verified`; `failed` is terminal. A database-only checkpoint can be restored for its own validation but `coordinated_eligible()` always returns false for it. The JSON validator checks the declared evidence, while future trusted tooling must actually produce and authenticate the evidence. Do not treat manually edited JSON as a verified recovery point.

## Exact next read-only VPS verification

1. On the local machine, review and checksum `scripts/staging-recovery-inventory.py`, `scripts/recovery/__init__.py` and `scripts/recovery/inventory.py`. Transfer **only these three files** into the corresponding paths under `/home/maevelle/deployment/tooling/` as the `maevelle` user; compare their checksums after transfer. This installation writes tooling files but does not change Phase 02/03 scripts or services. Do not replace the existing `staging/` directory. Use the operator's approved private transfer channel and do not put reports in Git.
2. On the VPS, first check that the installed Python is at least 3.10 and that `/home/maevelle/deployment/tooling/staging/` is the Phase 03 module directory. Run the command as rootless `maevelle`, with the existing user session and no `sudo`:

   ```sh
   PYTHONDONTWRITEBYTECODE=1 python3 /home/maevelle/deployment/tooling/staging-recovery-inventory.py
   ```

3. Review the JSON privately. Check `identity.uid=1001`, `rootless=true`, the 32-hex `identity.hostId`, `network.name=maevelle-staging`, six expected service names, exact two volume names/mountpoints, `database.name=maevelle_staging`, PostgreSQL 18 tool versions, migration count at least 51, media count/bytes, secret-file mode, and `releaseRecord.commitSha` against the **currently deployed release**. The `hostId` is a namespaced hash of the host's machine ID; compare it with a trusted operator inventory and retain it as the future reset target. The local Git HEAD `91ee8d5...` is not expected to match the deployed `87fec723...` release. Record the inventory date and unresolved prerequisites without copying secrets.
4. If the command refuses, preserve its single sanitized error line and inspect only the named Maevelle resource through approved read-only follow-up. A missing or unverified `current.json`, or a release record that differs from running images, is a refusal condition. Do not weaken identity checks or rerun with root. Resolve any discrepancy before Phase 04.2. Do not run backup, migration, reset, seed, restart, or unrelated-host commands as part of this verification.

The current `.env.staging.example` does not define `STAGING_ENVIRONMENT`. The command accepts a missing explicit sentinel only because existing protected staging configuration may predate it; it reports `sentinelPresent=false` as an unresolved prerequisite. A present sentinel with any value other than `staging` causes refusal. Before any future mutating recovery command, a separately reviewed explicit sentinel and target validation must be installed. The inventory still requires exact rootless user, network, container, database and volume identities.

The media count is a filesystem metadata walk of the exact named media volume with no symlink following; it does not prove the files match database object references. If rootless UID mapping prevents a safe read, the report sets `media.readable=false` and leaves counts unknown; the operator must resolve that before backup design. Backup-directory absence is reported, not created. No VPS run or backup was performed during Phase 04.1 implementation.
