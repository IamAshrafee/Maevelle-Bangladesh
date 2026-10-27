# Development Working Policy

## Current phase

Maevelle is currently being built by one developer in a heavy-development
phase. Local application data is disposable, production release is still far
away, and implementation progress is more valuable right now than repeatedly
performing release-grade migration, testing, and documentation work.

This reduced ceremony does **not** reduce the product target. Maevelle is no
longer an MVP or scoped prototype: implementations should aim at complete,
production-quality modules and workflows. See the
[engineering standards](engineering-standards.md).

The operational instructions for coding agents are in the repository-root
[`AGENTS.md`](../AGENTS.md).

## Practical approach

During ordinary feature work:

- implement complete product capabilities in manageable, coherent increments;
- add a new forward-only Kysely migration for each normal schema change;
- preserve staging data during ordinary deployments; reset disposable local data only deliberately;
- run focused checks that cover the changed behavior;
- defer exhaustive regression, staging, backup, and release checks until a
  meaningful milestone; and
- keep documentation and progress tracking concise.

This is deliberate phase-appropriate engineering, not a permanent rejection of
migrations or testing.

Historical MVP, V1, phase, roadmap, deferred-capability, and scoped-development
labels are no longer implementation boundaries. They remain research context
only, as described in the [documentation authority](README.md).

## Schema workflow

The staging database is persistent. The 51 migrations at release
`ccd405c1e6fa8c827307977b947a4a3dbce859f5` form an immutable historical
baseline. New schema work uses new migrations; run `pnpm check:migrations`
before commit. A deliberate history rebaseline requires coordinating every
affected environment, a verified backup, an explicit reset or reconciliation
plan, and a new reviewed baseline manifest. Never silently regenerate the
manifest or edit an applied migration to make validation pass.

When a clean rebuild is needed:

```sh
docker compose down --volumes
docker compose up -d --build
```

The first command permanently removes local Docker data. A normal
`docker compose down` or container recreation preserves the PostgreSQL named
volume and therefore does not replay modified migrations against a clean
database.

These commands are for the disposable **local** Compose project only. They
must never be used as the staging reset procedure. A fresh database must be
constructible from migrations; normal staging deployment preserves its data.

## Verification workflow

Choose verification according to the change:

| Change | Normal verification |
| --- | --- |
| Local implementation detail | Relevant typecheck or focused test |
| API/UI behavior | Targeted test or one realistic manual/API workflow |
| Schema migration | History check, focused migration test, and an upgrade fixture for a new migration |
| Money, inventory, authorization, or tenant isolation | Focused invariant and failure-path checks |
| Area closure or release preparation | Broader regression and readiness checks |

Full-suite and release-grade checks remain available, but they are checkpoint
tools rather than a tax on every commit.

## Staging migration discipline

The durable-migration transition has occurred for the shared staging database.
CI checks the historical file hashes, clean installation, and upgrade harness.
The harness currently reports when no post-baseline migration exists; each
future migration must add a representative before/after upgrade case. Migration
application on the VPS remains an explicit, one-time operation, separate from
Owner bootstrap, seed and intentional reset. See the
[development deployment strategy](architecture/development-deployment-strategy.md).
