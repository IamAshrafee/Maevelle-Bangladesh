# Phase 01: staging database compatibility audit

Date: 2026-10-27. Scope: supplied read-only VPS inventories versus the checked-out repository, plus a disposable local PostgreSQL 18 replay. No VPS connection or change occurred. The full live dump remains outside Git at `~/Downloads/maevelle-phase01/`.

## Verdict

**Schema compatibility at the supplied snapshot: VERIFIED.** The 51 applied Kysely migration names match HEAD, and a fresh replay from HEAD produced a schema-only dump identical to the supplied VPS dump after removal of only pg_dump's two random `\restrict`/`\unrestrict` tokens. No structural drift was observed in tables, columns, nullability, types, keys, constraints, indexes, triggers, functions, RLS, sequences, or SQL dependencies represented by the dump. This is a point-in-time schema finding, not proof of data migration behavior, ownership/ACL equivalence, runtime configuration, media persistence, or a safe future rollout.

**Phase 02: GO for implementing and testing controlled migration tooling; NO-GO for enabling automatic VPS migration on push.** Preserve the current staging database. Add forward-only migrations from now on. Before activation, prove the one-time job, backup/restore, upgrade test, release compatibility and exact Quadlet behavior in a separate reviewed step.

## Inputs and exact method

- Git branch `main`, HEAD `ccd405c1e6fa8c827307977b947a4a3dbce859f5`. Pre-existing dirty work: modified root `AGENTS.md`, untracked `docs/architecture/development-deployment-strategy.md` from Phase 00. Both were preserved.
- User-verified VPS inventory: Ubuntu 24.04, Podman 4.9.3, systemd 255, rootless user `maevelle`; six active Maevelle services with zero restarts at inventory time; private network `maevelle-staging`; persistent volumes `maevelle-staging-postgres` and `maevelle-staging-media`; Caddy bound `127.0.0.1:18080 -> 80`. Other websites own host 80/443. These host facts were not independently rechecked in this phase.
- Inputs: `~/Downloads/maevelle-phase01/maevelle-phase01-migrations.tsv` and `maevelle-phase01-schema.sql`, reported as read-only `psql`/`pg_dump` output from `maevelle_staging`. The supplied database inventory was 51 applied migrations, 33 schemas including `public`, 358 tables, about 32 MB, extensions `pg_trgm 1.6`, `pg_stat_statements 1.12`, `plpgsql 1.0`.
- Parsed the TSV's `name|executed_at` rows, compared them with all `*.ts` migration source stems and the explicit keys in `packages/database/src/migrations/index.ts`, checked duplicates and order, and recomputed MD5 of the lexically sorted names joined by newline. The 51 timestamps are monotonic.
- Built `@maevelle/database`, started a disposable local `postgres:18` Docker container with an ephemeral localhost port and no persistent volume, ran `packages/database/dist/src/migrate-cli.js` using a synthetic local credential, queried status, reran it, and used `pg_dump --schema-only --no-owner --no-privileges`. Local PostgreSQL and pg_dump were 18.6, matching the version header in the supplied dump. The disposable container was removed after comparison.
- Compared all 27,318 lines of the two dumps. The only raw differences were the independently generated `\restrict` token near the top and its `\unrestrict` counterpart at the end. Removing **only** those two token lines yielded byte-identical SQL with SHA-256 `1dfbc26e0aa7b90134d0bc072d9800b7cdd6de07e33befd63b065dc2a01025eb`. No object sections, SQL statements, headers, or settings were otherwise normalized or suppressed.

## Migration ledger

| Check | Result |
| --- | --- |
| Applied TSV rows / unique names | 51 / 51 |
| Registry keys / migration source files | 51 / 51 |
| Missing or extra source files versus registry | None |
| Applied names absent from HEAD | None |
| HEAD migrations not applied | None |
| Duplicate names | None in ledger or registry |
| Applied order | Lexical order, matching Kysely execution order and the clean replay |
| Name fingerprint | `3bd263cd94c5b618bce254724b854201`, matching the user-supplied PostgreSQL value |

The registry object is not written in exact lexical order around `2500`–`2602`, but Kysely executed those names lexically: `2500`, `2600`, `2601`, `2602`, `2603`. The ledger and local CLI output agree. The fingerprint proves only the name set, not migration source contents or schema equivalence. `migrate.ts` enforces PostgreSQL 18 and calls Kysely `migrateToLatest`; `migrate-cli.ts --status` reports applied/pending. The local rerun reported “Database is current.” The root `db:migrate` and `db:migrate:status` wrappers use the package CLI and a local `.env`; the API image contains the compiled CLI used by the existing CircleCI fresh-database check.

## Historical `0300` and `3200` review

Git history **confirms edits to existing migration files**: commit `9c80cc8` added 63 lines to `0300_sizing.ts` and 89 to `3200_messaging_core.ts` on 2026-10-26; older commits had already introduced those files. The `0300` change added size-guide kind/basis, `sizing.size_guide_revision_columns`, and product size-assignment provenance and checks. The `3200` change added customer identity link, event, and verification-challenge tables with indexes and foreign keys. The earlier release audit correctly identified the risk that an environment which applied the old source under the same names would not replay those additions.

**Actual VPS schema drift verdict for both migrations: NOT OBSERVED.** The supplied VPS dump contains their current structures because it is byte-identical, apart from random dump tokens, to a fresh replay of HEAD. The TSV records these migrations as applied on 2026-10-26. This establishes current structural equivalence, but not whether VPS reached it through a clean rebuild or another past intervention. No migration source was rewritten here.

Dependencies matter for future changes: `0301_sizing_category_defaults` adds a Catalog foreign key to `sizing.size_guides` after `0300`; current sizing provenance also references IAM users and records a source purchase ID. `3200` identity links reference customer and messaging tables; later `3201`/`3202` add reconciliation/performance objects on the messaging base. Any new correction belongs in a new forward migration with an upgrade test, not in either historical file.

## Schema comparison detail and limits

Both dumps contain 32 explicit `CREATE SCHEMA` sections plus `public`, 358 table sections, 416 index sections, 787 constraint sections, 1,165 foreign-key sections, 35 sequences, four functions, five triggers, two extensions and two comments. Both have zero `CREATE POLICY`, `ALTER POLICY`, `ENABLE ROW LEVEL SECURITY`, or `FORCE ROW LEVEL SECURITY` statements. They include the same PostgreSQL SQL definitions for columns, defaults, type declarations, nullability, primary/unique/check/foreign keys, indexes, triggers, functions, sequences, and references. Both declare `pg_trgm` and `pg_stat_statements`; local extension versions are `1.6` and `1.12`, and local `plpgsql` is `1.0`, matching the user-reported VPS inventory.

The dumps were generated without owners or privileges, so **live role ownership and ACLs are not verifiable** from these files. The dump also cannot prove row contents, migration-side data transforms, application credentials, host-level extension configuration, media volume contents, or live health at audit time. The comparison is strong evidence for schema structure at the snapshot, not a blanket operational equivalence claim. A later change to either environment requires a new comparison.

## Deployment compatibility and Phase 02 prerequisites

| Capability | Audit finding / prerequisite |
| --- | --- |
| Data-preserving normal deploy | Supported in principle by persistent VPS PostgreSQL/media volumes, but `compose.staging.yaml` has only a PostgreSQL volume and chains migration, bootstrap, and seed before API/Worker. Treat Compose as reference, not the active Quadlet implementation. Verify actual units and mounts read-only before scripts. |
| One-time migration | Existing compiled CLI works and reruns idempotently in the disposable test. There is no VPS serialization/lock wrapper, preflight, manifest or failure log yet. Do not invoke it from API/Worker startup. |
| Breaking change | Requires a forward migration, prior-schema upgrade test, data transformation where needed, declared old/new API and Worker compatibility, and coordinated service order or downtime. Image rollback does not reverse SQL. |
| Intentional reset | No guarded VPS reset exists. Require staging identity checks, manual authorization, backup and isolated restore proof, scope to Maevelle's database/volumes, then migrations and bootstrap/seed. Never couple it to push. |
| Synthetic seed and Owner | `staging-seed.ts`, modular seeds, and `bootstrap-owner.ts` exist. Confirm deterministic rerun and improve target/environment guard before VPS automation; keep Owner credentials outside Git/logs. |
| Immutable deploy | CircleCI publishes all four images under `staging-<12-char SHA>` tags and verifies a fresh DB/API startup. Tags are not an immutable digest manifest; no deployed-digest reconciliation or selective Quadlet update is implemented in repo. |
| Recovery | Local Docker `postgres-backup.mjs` and restore drill do not establish VPS PostgreSQL/media recovery. Need scoped Podman backup, isolated restore, prior compatible digest record, and forward-repair path before automatic migration. |

Phase 01 handoff to Phase 02 was to align the older mutable-baseline prose, add an append-only migration check, test clean install and upgrade from this exact commit's schema with representative data, and prepare a serialized migration job. Phase 02 implements that repository tooling; digest release metadata and backup/restore evidence remain prerequisites before enabling live migrations. The shared host Nginx, other websites, host OS and unrelated units remain outside routine deployment scope.
