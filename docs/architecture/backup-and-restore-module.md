# Backup and Restore module — production architecture and implementation specification

**Status:** implementation-ready design proposal, 2026-10-29. No module implementation, VPS configuration, backup, or restore was performed by this document. The existing staging recovery capture and retention tooling remains locally tested only; a live off-host copy and isolated restore are unverified. Revalidate versions, provider terms, credentials, topology, and source code before implementation or launch.

## Outcome and boundary

The Admin Portal gets a **Settings → Backup and restore** workspace for policy, schedules, destinations, history, verification, exports, and recovery operations. A separate rootless Maevelle recovery controller performs host-level work, records its own durable journal, and provides an emergency CLI when the API, Admin, or database is unavailable. Full recovery is an **environment-wide** capability that may contain every organization. Organization-level export permissions cannot authorize environment-wide backup download or restore. The application must never claim a backup is recoverable merely because a job finished or a remote upload succeeded.

The system supports two explicitly different products:

1. **Full recovery set:** one consistent Maevelle PostgreSQL database, **all** referenced originals, renditions and private documents, release image digests, migration ledger, media inventory, and protected configuration recovery inventory. This is the disaster-recovery unit. Media categories cannot be excluded. It is eligible for full restore only after its data and dependencies have been verified.
2. **Scoped export:** a selected domain or image category, for portability, review, or individual-asset recovery. Product/catalog, reviews, Facebook, Instagram, storefront chat, and future media consumers are selectable here. Exports may run manually or on a separate schedule with their own destination and retention policy. An export is labeled **not a full-system backup** and cannot be selected for full restore. Domain semantics determine the included records and assets; no generic table whitelist or file-path filter may assert referential completeness.

The first version of this module must deliver the complete vertical, including an off-host restore drill and an emergency recovery path. A polished Admin screen without those capabilities does not close the recovery gap.

## Product requirements and non-negotiable outcomes

| Requirement | Observable acceptance |
| --- | --- |
| Scheduled full protection | The selected daily, weekly, or monthly calendar policy runs without an Admin session; missed and overlapping runs have recorded outcomes. A successful run has a complete database/media set and an independently readable remote copy. |
| Manual backup | An authorized operator can start a run, see queued/running/failed/completed states, leave the page, and return to the same durable operation. Repeated submission cannot make duplicate captures. |
| Selective capture | Product, Review, and each messaging channel can be selected for a scheduled or manual **export** with exact domain-owned relationship coverage. Its UI and manifest never call it a full recovery set. |
| Retention | Policy preview names every set to keep/delete and why. Pinned, last-good, and insufficiently verified recovery sets survive any automated prune. |
| Encryption and keys | Every backup containing business or personal data is encrypted before it leaves a private staging directory. An off-VPS key can decrypt a fetched set in an independent drill. |
| Google Drive | Setup, test, quota, transfer, retry, readback, revocation, and recovery from disconnected/expired authorization are operator-visible. A failed Drive copy remains a failed off-host copy. |
| History and files | Pagination, filter/search, sizes, asset/table counts, release, status, verification, downloadable encrypted package, restore report, and auditable actions work on mobile, tablet, and desktop. |
| Full restore | A fetched set can recreate the exact Maevelle data/media/release combination on a clean target. Wrong-target, incomplete, stale, corrupt, or unverified inputs fail before changing the live target. |
| Failure visibility | Missed schedules, expiring keys, low capacity, stale remote copies, damaged files, failed drills, and stuck jobs have concrete operator actions. No static or inferred success badge is accepted. |

## Existing foundations to preserve

- `scripts/staging-recovery.py` and `scripts/recovery/` already provide strict staging identity checks, a shared deploy/migration lock, encrypted coordinated capture, immutable manifests, remote readback checks, and guarded retention. They have no schedule or restore implementation and are not evidenced as installed on the VPS.
- `docs/staging-recovery-backup.md` defines the current live preconditions and explicitly reserves `restore-verified` for an independent drill. Its mounted-storage adapter requires filesystem publication semantics; do not treat a Google Drive FUSE mount as a compatible destination without proof.
- The local media adapter stores originals and renditions in the persistent media volume. The database stores asset identity and domain relationships. Recovery must preserve both together.
- Settings have versioned organization configuration and encrypted integration-secret patterns, but the backup private key, OAuth recovery material, and host control credentials cannot exist only in the database being restored.
- Staging is rootless Maevelle Podman/Quadlet on a VPS shared with unrelated applications. The controller may operate only on Maevelle's exact units, network, database, volumes, backup roots, and release records.

## Future module and schema coverage contract

A whole-database `pg_dump` includes new Maevelle schemas and tables by default. This is the correct baseline for future modules. The backup command must select the exact Maevelle database, not maintain a growing list of allowed business tables or use `--exclude-schema` for convenience. It must capture the migration ledger, extension/role prerequisites, table/schema inventory digest, and row-count summary. PostgreSQL cluster roles and tablespaces are outside a single-database dump, so an explicitly protected recovery inventory must cover their reconstruction. [PostgreSQL's dump boundary](https://www.postgresql.org/docs/18/app-pgdump.html).

Every new module must declare its **authoritative state inventory** before launch:

| State kind | Required module declaration |
| --- | --- |
| PostgreSQL records | Schema ownership, tenant scope, migrations, critical consistency probes, and whether provider callbacks/outbox jobs need suppression during restore. All rows remain in full recovery regardless of export configuration. |
| Media objects | Domain-owned relationship to `media_assets`, privacy class, retention rule, and a query that proves every referenced object exists. A new channel or document type must join the full-media inventory and usage/retention checks. |
| Other local durable files | Exact protected root/volume, reader and writer identities, snapshot and restore adapter, size limits, and integrity probe. Unknown durable directories must fail coverage assessment, not be silently ignored. |
| External service state | Whether state is reproducible, provider-owned, or impossible to capture; tokens/webhooks/callback registration recovery steps; safe test mode. Do not claim to back up Facebook, Instagram, payment, or courier provider servers. |
| Secrets and runtime configuration | Secret name and custodian, independent escrow location, rotation effect, and whether the old secret is required to decrypt restored database fields. The backup manifest records references and key IDs, never values. |
| Export/partial restore | Explicit exporter/importer and conflict semantics, or an honest `NOT_SUPPORTED` state. A new module is automatically covered by full database backup but is not automatically safe for selective restore. |

Maintain a versioned **coverage registry** in source, with a manifest copy in each recovery set. At capture, compare registered components against actual Maevelle database schemas, durable mounts, storage providers, and release configuration. An unregistered authoritative store or unavailable required adapter blocks a `COMPLETE` verdict. A deploy that introduces new durable state must update this registry, its backup/restore checks, and the relevant migration. A restore validates the registry version in the backup against the selected application release; it does not reinterpret an old set using the current module list. Keep manifest readers for supported older versions and provide an explicit format migration/retirement policy.

The recovery manifest has an `environmentId` and `formatVersion`, with separate environment profiles for current staging and any future production host. The current v1 contract is intentionally hard-coded to staging; do not loosen its allowlists to make it serve production. Introduce a reviewed v2+ contract and controller profile while preserving v1 read/restore compatibility for existing sets. No automatic cross-environment restore: a staging-to-production import requires a distinct sanitized migration procedure, never the live restore command.

## Architecture

```text
Admin Settings UI → typed API → backup application service → protected host controller
                    ↘ organization policy DB       ↘ host journal + manifests
                                                     ↘ PostgreSQL + media volume
                                                     ↘ local encrypted repository
                                                     ↘ Google Drive encrypted repository

Emergency CLI ───────────────────────────────────────→ host controller
```

The API may submit narrowly typed intents and read sanitized status. It does not receive a shell, host paths, database credentials, encryption keys, or arbitrary command arguments. The host controller validates the exact environment, release, repository, lock, operation ID, and current state again immediately before every action. It runs as the existing `maevelle` user, outside the API and Worker lifecycle; restore may stop those services. A host-owned append-only journal and portable manifest are authoritative when the database is unavailable. Database rows are a searchable UI projection, reconciled from the host journal after recovery.

Use versioned, forward-only configuration and schema migrations to introduce backup capabilities and policy/job metadata. Test both fresh installation and upgrade from a prior schema. Backups must record the deployed full SHA, image digests, schema/ledger, application compatibility, PostgreSQL version, media object inventory digest, key ID, destination IDs, and verification evidence. Backup files and secrets do not belong in PostgreSQL.

## Consistency and scheduling semantics

The recovery point is the database snapshot and the exact referenced media set associated with it. The first implementation may use the existing safe, short Maevelle-only writer quiescence. It must measure interruption time and resume API and Worker even when capture fails. If that interruption exceeds the approved service objective, design an online protocol that freezes media deletion, records a database snapshot boundary, and retains all referenced immutable objects until the snapshot is secured; prove it under concurrent uploads, deletes, messages, and worker processing before replacing quiescence. Do not claim that ordinary `pg_dump` and an unrelated filesystem copy are one consistent snapshot.

Store schedule policy in the database for Admin editing and mirror an authenticated, versioned controller configuration outside it so a database outage cannot silently erase the schedule or its last-run record. The host controller is the sole scheduler; the API and Worker must not start parallel jobs. Define timezone, local wall-clock time, day-of-week/day-of-month behavior, daylight-saving behavior, catch-up limit after downtime, and overlap coalescing in the contract. A missed run that cannot catch up is `MISSED`, not `SUCCEEDED`. Weekly/monthly retention may select daily snapshots; extra capture frequency is an explicit schedule choice. Manual runs do not silently reset the calendar schedule.

Use a durable state machine for each operation: `REQUESTED → PREFLIGHT → CAPTURING → LOCAL_VERIFIED → TRANSFERRING → REMOTE_VERIFIED → RESTORE_TESTED`, with `FAILED`, `CANCELLED`, and `NEEDS_RECONCILIATION` outcomes where applicable. Record timestamps and the exact failed step. A process restart reconciles a running operation from the host journal and repository, and never assumes a timeout means that a destructive or external effect did not happen. A retry resumes the same intent when safe. The controller performs transfer and verification after writers resume; only the consistency-critical capture stays under the outage window.

## Capture and storage

- The schedule is evaluated by one host timer/controller in the configured IANA timezone (`Asia/Dhaka` by default). Support daily, weekly, and monthly calendar rules, local start time, enabled state, and a bounded missed-run policy. Persist next/last run, reason for skip, and schedule version. A global lock prevents overlap with capture, transfer, prune, migration, deployment, reset, and restore. A manual run uses the same path.
- A full capture locks and identifies the host, checks free space and keys, quiesces Maevelle's API and Worker writers, captures an exact PostgreSQL custom-format dump and a consistent immutable media view, records checksums and inventory, and restores service availability before transferring remotely. The capture and outage window are measured. PostgreSQL alone is consistent during `pg_dump`, but its snapshot is not automatically consistent with the media filesystem.
- Continue to support the existing portable `age`-encrypted coordinated set for operator recovery. For routine Google Drive backups, do not upload a newly encrypted whole-media tar each day: that defeats useful incremental deduplication and can rapidly exhaust the free quota. Use an encrypted, incremental repository design (for example restic with rclone's Google Drive backend) over individual immutable media objects plus the database dump. Design and prove a snapshot/manifest link that identifies one consistent recovery set in both local and off-host repositories. Do not delete source or prior verified sets when transfer fails.
- Encryption is **required** for all retained local and off-host sets containing customer, order, messaging, payment, or provider data. The Admin may manage key status, public recipient, rotation, and recovery-kit instructions, but must not offer an off switch or reveal the private key. The owner stores the recovery key outside the VPS and confirms an independent retrieval test. Old keys remain available for snapshots encrypted under them.
- A Google Drive connection uses a dedicated account/folder, least-privilege scope where feasible, server-side OAuth setup with an owned client ID, encrypted refresh-token storage outside the recoverable database, revocation, reconnect, quota check, transfer check, and last successful readback. The browser never sees a refresh token. The connection is a **destination**, not the live image origin. A Drive transfer must be independently verifiable and restorable without the original VPS.
- Support a second future destination such as another VPS via a destination interface. Each destination has independent capacity, transfer, verification, retention, and failure state. Do not silently downgrade a failed remote run to a successful local-only recovery point.

## Destination and key model

Define a destination interface around `put immutable`, `read`, `list exact set`, `check capacity`, and `delete exact set`; an adapter must state which guarantees it supplies. Local encrypted repository, Google Drive, and later SFTP/second-VPS are separate instances. Do not pass arbitrary URLs, paths, shell flags, or hostnames from Admin into controller commands. Probe destination capabilities and perform a disposable write/read/delete test before enabling a policy. The existing mounted-filesystem adapter is retained only for filesystems that pass its atomic-rename, hard-link, fsync, and readback requirements; Google Drive gets a dedicated adapter or a proven restic/rclone backend rather than an assumed compatible mount.

Separate **data encryption** from **transport authorization**. For routine incremental snapshots, use a reviewed encrypted repository format. For portable individual downloads, produce an independently decryptable encrypted package and manifest without exposing plaintext to the browser or leaving a stale plaintext file on the host. Create a recovery kit containing the key identifier, recovery instructions, and a way to verify a test decryption; keep the actual secret outside the VPS and outside its database. The operator may rotate to a new key for new sets, but retention must preserve the keys needed for old sets. Google OAuth refresh tokens and repository credentials are host-protected secrets with independently documented re-enrollment and escrow; a database restore must not make the off-host repository inaccessible.

The free Google allowance is a capacity constraint, not a durability promise. Quota, API throttling, account lockout, and refresh-token expiration are explicit failure states. The system must continue retaining the most recent complete local set if remote transfer fails, alert that off-host protection is stale, and retry with backoff. A second VPS or Windows VPS can later receive the encrypted repository over a supported transport; it is a destination, not a second application server. Test restore from that destination independently before counting it as protected.

## Retention and capacity

Configure daily/weekly/monthly counts per destination (for example 7/4/6), minimum recent verified full sets, pre-migration pins, manual pins, and maximum local space target. A snapshot can satisfy multiple calendar slots. Preview exact sets and estimated reclaim before applying retention. Never delete the newest verified full set, either of the last two independently restore-verified sets, pinned sets, or the only off-host recovery point. Failed, incomplete, and unverified sets need an explicit repair or quarantine policy rather than automatic deletion. Prune only after a successful newer capture and verification, under the shared lock, with a durable deletion journal and exact IDs. Capacity alerts must distinguish repository bytes from logical protected bytes.

Google's free account allowance is currently up to 15 GB shared across Drive, Gmail, and Photos. The UI must show available quota, projected size, and whether the selected retention policy fits; it cannot promise that 7/4/6 snapshots will fit. Incremental storage reduces repeated media bytes but each daily database dump may still consume substantial space. If capacity is insufficient, fail visibly and keep the last good backup.

## Verification and restore

Verification levels must be named precisely: `CAPTURED`, `TRANSFERRED`, `INTEGRITY_VERIFIED`, `ISOLATED_RESTORE_VERIFIED`, and `LIVE_RESTORED`. A checksum readback proves uploaded bytes, not that PostgreSQL, media, keys, roles, settings, and the application can be restored together. Schedule periodic isolated restore drills on an approved disposable target; inspect table/row integrity, migration status, required roles/extensions, media inventory, public and private delivery, auth, and critical commerce workflows. Record the tested release and report, with no provider side effects.

Three restore operations have separate contracts:

1. **Inspect/preview:** download or stream an encrypted set to a controlled location, verify manifest/key/repository, and perform an isolated restore without changing staging. Show the exact recovery point, included data, release, missing dependencies, expected downtime, and outcome.
2. **Scoped asset recovery:** import selected media from a verified set through Media-domain operations, with organization ownership, checksum, usage review, and conflict policy. It must not directly overwrite current files or blindly replay rows. Other domain-specific recovery is designed per domain; generic table restoration is not exposed.
3. **Full environment restore:** a deliberate, destructive operation. Take a fresh pre-restore capture if possible; preserve current diagnostics. Validate target host/database/volume, backup completeness, key, release/schema compatibility, and available disk. Require recent Owner reauthentication/MFA, typed target and recovery-set confirmation, an idempotency key, and a short-lived execution grant. The host controller takes the shared lock, stops only Maevelle writers, restores into new/disposable database and media targets first, verifies them, then performs a controlled cutover and starts compatible image digests. On failure, preserve the old targets and journal for a forward recovery decision. Never restore only database while leaving mismatched media in place. The Admin may start and track the workflow; the emergency CLI must provide the same guarded path if Admin is down.

The UI must not present a one-click `Restore` button that immediately replaces the running environment. Its row action opens a recovery workspace with **Preview restore** as the first action and **Replace staging** after successful preflight. The API's connection will be interrupted during cutover, so the page must show a durable operation ID, reconnect, and reconcile final status rather than assuming a timeout means failure.

## Restore procedure and compatibility

The full restore plan is a persisted, read-only artifact bound to a manifest hash, target fingerprint, target database/volume IDs, encryption key ID, compatible release digests, estimated disk need, expiry, and requester. The controller recalculates every input under the shared lock immediately before execution. A changed plan requires a new confirmation. Current application images are not assumed compatible with an older schema; the plan selects the recorded compatible release first, then applies only reviewed forward migrations after the recovered service is healthy. An image rollback does not reverse SQL.

Execution sequence:

1. Authenticate the designated platform recovery operator, require recent step-up, authorize the exact environment, and create an idempotent operation with a readable plan. If the Admin/API is unavailable, use the equivalent guarded CLI with external identity and key custody.
2. Retrieve the encrypted set and key, verify manifest version/signature/hash and every required artifact, inspect database archive, confirm release-image availability and dependency inventory, and compute the exact old/new target plan. Refuse missing media or unknown authoritative state.
3. Preserve diagnostics and, if feasible, create a pinned rescue set of the current environment. Stop only Maevelle writers; preserve unrelated VPS applications. Restore database and media to separate new targets, recreate required roles/extensions/configuration in their scoped boundary, and keep provider integrations inert.
4. Validate migration ledger, schema, critical row counts, foreign keys, media references and checksums, Owner authentication, API health, Admin, Storefront image delivery, Worker/outbox ability, and representative commerce workflows. Run no live payment, Meta, SMS, email, or courier side effects during validation.
5. Perform an explicit cutover to the validated targets and compatible app digests. Monitor health and record the exact cutover time. Keep previous targets pinned through a defined hold period. On a failed cutover, use the recorded state to choose safe forward repair or a reviewed return to the old targets; never perform an unverified automatic SQL rollback.
6. Reconcile the host journal into the restored database, re-evaluate schedules/destinations/keys, and create a new post-restore backup. Record any external provider reauthorization or callback action still required.

An isolated drill follows the same restore code through validation but has no cutover branch. A clean-host disaster drill must start with only the off-host set, recovery kit, source/release references, and documented host prerequisites. This is the proof that a destroyed VPS can be replaced. Define approved maximum data loss (RPO), maximum recovery time (RTO), and backup age thresholds before claiming production readiness; measure them in drills rather than guessing.

## Admin experience

Add `/settings/backup-and-restore` to the Settings navigation, overview search, and capability-aware links. Build a responsive page from existing page-shell, form, table, badge, dialog, and settings primitives. The common path should be visible first; advanced controls expand by section.

| Section | Operator tasks |
| --- | --- |
| Overview | Last full recovery point, last off-host copy, last isolated restore, next run, current job, disk/Drive headroom, and actionable alerts. Never show a blanket Healthy state without coverage and timestamps. |
| Schedule & policy | Daily/weekly/monthly rule, local time/timezone, pause/resume, retention preview, key ID, and estimated impact. Changing policy is versioned and audited. |
| Destinations | Local repository and Google Drive connection status, scope, quota, last successful transfer/readback, reconnect/disconnect, and test connection. Credentials are never displayed. |
| Backup history | Server-paginated, filterable rows with ID/name, full/export type, recovery point, logical/physical bytes, media count, release/schema, destinations, verification level, duration, errors, and pin state. Actions depend on capability and state. |
| Recovery | Preview, isolated verification, scoped asset import, full cutover plan, progress journal, result, and emergency instructions. The screen explains exactly what will be replaced. |
| Activity | Failed/missed jobs, transfer retries, restore reports, audits, and event timestamps with direct next steps. |

The `Download` action delivers a portable encrypted package/manifest through a bounded stream or short-lived authorized link. The Admin never buffers an entire backup in memory. `Delete` shows the exact set, destination, pins, and retention consequence; deleting a protected or last good set is refused by the controller. Export requests specify domain inclusion and are labeled separately from disaster recovery.

## API and schema contracts for implementation

Implement transport in focused route files, application commands/queries in the Backup domain, persistence in dedicated repositories, destination adapters behind a port, and Admin presentation in small components. The host controller contract is versioned separately from public Admin endpoints. Example endpoint families (final paths and DTOs are fixed during contract review):

| Resource | Operations |
| --- | --- |
| `/admin/backup/overview` | Read sanitized protection status, coverage, next run, last good local/off-host/restore-tested set, and alert counts. |
| `/admin/backup/policies` | Read/update versioned environment policy with `expectedVersion`; preview schedule and retention before save. |
| `/admin/backup/destinations` | List, initiate Google connection, test, disconnect, and show quota/last readback without returning secrets. |
| `/admin/backup/recovery-sets` | Paginated list/detail with filters, manifest summary, artifacts, coverage, destination and verification states. |
| `/admin/backup/operations` | Start manual capture/export/verify, read durable progress, and request safe cancellation. Mutations accept stable idempotency keys. |
| `/admin/backup/restore-plans` | Create isolated/full plan; return exact target and impact, refusal reasons, expiry, and plan digest. |
| `/admin/backup/restore-executions` | Submit exact plan digest plus step-up/confirmation; return durable operation ID. Never accept arbitrary database, volume, or shell parameters. |
| `/admin/backup/downloads` | Issue a short-lived, audited capability for a specific encrypted set/export and stream with size limits. |

All responses use the project's typed envelope and error codes; long-running calls return `202` and a status URL. List endpoints use server-side pagination and deterministic sorting. State changes use optimistic concurrency or idempotency as appropriate. Do not make a `GET` trigger capture, restore, deletion, or transfer. Connector callbacks validate state, origin, scopes, and token response; no token appears in a URL, response body, audit entry, or error. The host controller refuses intents that are not signed/authorized for its exact environment and operation type.

Create normalized tables only for queryable policy and projection state, with environment-scoped unique keys and `timestamptz` event times. Suggested additional tables: `backup.schedule_rules`, `backup.operation_events`, `backup.recovery_set_components`, `backup.retention_pins`, `backup.download_grants`, and `backup.restore_plans`. Keep immutable recovery-set identity and plan hash unique; index `(environment_id, created_at desc, id)` and operation status/next-run paths. Do not store binary archives, key material, or OAuth refresh tokens in these tables. Add composite organization keys only to scoped exports. Use append-only migrations, narrow constraints, and upgrade tests; do not edit already-applied staging migrations.

## Contracts, ownership, and audit

Introduce typed operations for policies, destinations, backups, exports, verifications, restore plans, and restore executions. Use the established success/error envelope and pagination. Long jobs return an operation ID and durable state; retries reuse the same idempotency key and request hash. Distinct environment-level capabilities: `backup.view`, `backup.policy.manage`, `backup.run`, `backup.download`, `backup.verify`, `backup.delete`, and `backup.restore`. A separate organization-scoped `backup.export` may authorize filtered exports. Do not infer environment authority from a membership's `OWNER` label in one organization. Full restore and key/connection changes require explicitly designated platform recovery operators with recent step-up authentication. Audit policy edits, connection changes, schedules, captures, downloads, pins, deletion, verification, and all restore attempts; redact secrets, customer content, and token-bearing URLs.

Suggested normalized data: `backup.policies` (environment, version, schedule, retention), `backup.destinations` (environment, provider/status/config reference), `backup.operations` (environment, intent, state, idempotency, timings), `backup.recovery_sets` (environment, immutable ID, manifest digest, recovery point, type, verification), `backup.recovery_set_destinations` (per-destination state/bytes), and `backup.restore_reports` (target, checks, verdict). Scoped export policies and operations also carry `organization_id`. Use `timestamptz`, explicit checks, foreign keys, scoped unique constraints, and indexes for the history/filter paths. The independent host journal remains authoritative for disaster recovery; these rows are rebuilt from it after a full restore.

## Security, observability, and failure policy

- Treat full backup files and downloads as the most sensitive data in the platform: they can contain all tenants, account hashes, messaging content, customer records, and integration ciphertext. A normal organization Owner must not automatically gain full-environment download or restore rights. Separate policy, run, download, delete, key, destination, and restore authority; use recent MFA for critical actions and audit both allowed and refused attempts.
- Bind the API-to-controller channel to a private local transport with mutually authenticated, short-lived, operation-scoped credentials. The controller has a fixed allowlist of Maevelle targets and command forms, no generic subprocess endpoint, and no public port. Redact command output, secrets, OAuth codes, customer data, and filesystem paths from Admin reports.
- Backup poisoning and ransomware are in scope: immutable set IDs, checksummed/signed manifests, append-only or independently protected off-host copies where supported, separate key custody, retention pins, and restore from a previously verified set. A compromised VPS can still destroy credentials it holds; document residual risk and independent operator recovery.
- Customer deletion, privacy requests, and retention obligations must account for old backups: live deletion does not rewrite immutable historical sets. Limit backup lifetime, access and restore purpose; after any restore, replay recorded privacy/deletion actions that occurred after the recovery point before reopening customer access where required. Do not extend backup retention solely because storage is cheap.
- Record backup age, schedule drift, capture/transfer/verify durations, bytes processed and uploaded, deduplication ratio, database/media growth, free disk/quota, failure codes, latest restore-test age, and predicted time to full storage. Alert on thresholds and on missing heartbeat. An alert needs a direct operator action and must never be suppressed by a local-only success when off-host protection is expected.
- Bound CPU, disk I/O, network bandwidth, concurrent file reads, upload chunking, and temporary space so backup activity does not starve checkout, messaging, or PostgreSQL. Run outside peak traffic when possible. Measure the actual VPS before choosing defaults. Never hold API request memory for an archive download or Drive upload.
- Failure tests must cover power loss at every publication boundary, partial Google upload, duplicate job delivery, clock/timezone change, key loss, token revocation, quota exhaustion, database corruption, missing media, stale manifest, incompatible release, concurrent migration, and both API and controller restart. Preserve enough journal state to resume or stop safely without duplicating destructive effects.

## Decisions to finalize before implementation

These are product and operator inputs, not gaps to fill silently in code. The following values are proposed starting points for sizing and test design; the owner approves them after measuring the real VPS and Drive account.

| Decision | Proposed starting point and evidence needed |
| --- | --- |
| Full-backup frequency | One full recovery point daily at a low-traffic local time, with manual pre-migration/pre-restore captures. Confirm the accepted maximum data loss and whether more frequent database protection is needed. |
| Retention | Seven daily, four weekly, six monthly *selection slots*, subject to Drive quota and the mandatory two independently restore-verified sets. Run a capacity simulation from measured database/media growth before enabling deletion. |
| Time zone and missed runs | `Asia/Dhaka`; one bounded catch-up run after an outage, with every skipped calendar occurrence recorded. Confirm the operational window and acceptable API interruption. |
| Recovery objectives | Record a numeric RPO and RTO for staging and later production separately. Time a clean-host drill and compare it with the approved targets. |
| Google identity and quota | Dedicated business-controlled Google account and app-owned OAuth client ID, scoped Drive folder, owner custody, revocation contact, and a quota read from the connected account. Confirm that the free allowance fits the measured policy. |
| Key custody | Two independent owner-held recovery-key copies outside the VPS, a tested retrieval procedure, and an old-key retirement rule tied to snapshot expiry. Confirm who can act if the Owner account is unavailable. |
| Recovery authority | Explicit platform recovery operator assignment and MFA, separate from organization membership. Define an emergency break-glass custodian and audit review. |
| Previous-target hold | Set a measurable hold window after a full restore, with disk budget and exact cleanup approval. Do not promise old and new targets can coexist without checking available space. |
| Alert delivery | Select an actually configured channel and escalation recipient. Verify a simulated failure reaches that recipient, including when the application database is unavailable. |
| Production topology | Reinventory the future production host, Postgres version, volumes, network, images, gateway, roles, and secrets. Create a separate environment profile and drill; do not reuse staging fingerprints or names. |

## Delivery and acceptance gates

1. Specify versioned contracts, manifest v2 compatibility, threat model, key custody, recovery objectives, quota budget, and failure matrix. Inventory the actual VPS read-only before any host installation.
2. Implement and test the host controller, incremental encrypted destination, scheduler, journal, metrics, retention, and isolated restore path. Test fresh install and upgrade from prior schema. Preserve the existing Phase 04 tooling until a replacement passes equivalent safety checks.
3. Add API, capabilities, settings integration, Admin workspace, export and download flows. Test small/mobile/tablet/desktop layouts and keyboard access with realistic history and error states.
4. Prove backups and restore with disposable local targets, then fetch an approved off-host set onto an independent machine and restore it into a disposable environment with a key retrieved from outside the VPS. Test interrupted capture/transfer, unavailable Drive, exhausted quota, wrong key, tampered manifest, stale release, missing media, concurrent migration, API outage, and restart mid-operation.
5. Only after the above, enable the scoped VPS schedule and record the first verified recovery point. Run a controlled live staging restore only as a separate, explicit operation with a reviewed plan. A passing CI build, local mock, or Admin green badge alone never completes this gate.

**Decisions intentionally fixed by this plan:** local persistent media remains the live backend; full recovery sets always include all authoritative media; encryption is mandatory; secrets and emergency recovery state survive database loss; Google Drive is an off-host backup destination; retention cannot remove the last good recovery point; and full restore uses isolated validation before cutover.

## Production launch definition

The module is complete only when all of these are evidenced on the actual intended environment or an equivalent clean recovery target:

1. Every active module appears in the coverage registry; new-table and new-file fixtures prove detection and restore coverage. Full sets have zero unresolved authoritative-state gaps.
2. A scheduled full backup runs unattended; local and Google Drive copies are encrypted, readable, and independently verified. The Admin shows accurate timestamps, quota, storage size, and failure states.
3. A set fetched from off-host storage is restored on an independent clean machine with a separately retrieved key. Database, media, runtime configuration, compatible release, auth, and critical business flows pass the recorded drill. RPO/RTO meet approved values.
4. Restore plan, wrong-target refusal, safe cutover, failed-cutover recovery, emergency CLI, retention protection, and portable download are exercised with deliberate faults. Provider side effects remain suppressed during drills.
5. Admin workflows work at mobile, tablet/iPad, and desktop sizes; keyboard, screen reader, loading, empty, offline, conflict, and long-running states are reviewed. Capability and tenant boundaries are tested.
6. Fresh migrations and upgrades from a prior release pass. A staging deployment records full SHA/digests, schema and manifest versions, installed controller version, backup/restore evidence, and any required operator action. A later production launch repeats the same gates against its own environment profile; staging evidence does not automatically certify production.

Until these gates pass, show the exact state (`Not configured`, `Local only`, `Off-host copy unverified`, `Restore unverified`, or `Protected as of <time>`) rather than a generic green status. Keep the older backup tooling and manifests readable through the transition; migrate operational authority only after a proven replacement and rollback path.

## Current primary references

- [PostgreSQL 18 `pg_dump`](https://www.postgresql.org/docs/18/app-pgdump.html) for the database snapshot and custom-format restore boundary.
- [restic rclone backend](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#other-services-via-rclone) and [snapshot retention](https://restic.readthedocs.io/en/stable/060_forget.html) for the incremental/retention design option; these tools are proposed, not installed by this plan.
- [rclone Google Drive configuration](https://rclone.org/drive/) for OAuth and the owned-client-ID requirement.
- [Google account storage allowance](https://support.google.com/googleone/answer/9004014?hl=en) for the free-tier capacity constraint.
