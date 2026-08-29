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
- evolve the database by editing the current domain migration baseline;
- reset and rebuild the local database instead of preserving disposable data;
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

Existing migration files are mutable while the project has no persistent or
shared database to upgrade. Prefer changing the relevant original table
definition over writing a chain of development-only `ALTER TABLE` operations.

When a clean rebuild is needed:

```sh
docker compose down --volumes
docker compose up -d --build
```

The first command permanently removes local Docker data. A normal
`docker compose down` or container recreation preserves the PostgreSQL named
volume and therefore does not replay modified migrations against a clean
database.

The minimum invariant is that the checked-in baseline can construct a fresh,
working database. Preserving old local data is not currently an invariant.

## Verification workflow

Choose verification according to the change:

| Change | Normal verification |
| --- | --- |
| Local implementation detail | Relevant typecheck or focused test |
| API/UI behavior | Targeted test or one realistic manual/API workflow |
| Schema baseline | Clean database rebuild plus the affected workflow |
| Money, inventory, authorization, or tenant isolation | Focused invariant and failure-path checks |
| Area closure or release preparation | Broader regression and readiness checks |

Full-suite and release-grade checks remain available, but they are checkpoint
tools rather than a tax on every commit.

## Transition to durable migrations

Before real data, a shared environment, another developer, beta, or production:

1. consolidate and review the current schema baseline;
2. verify a clean installation;
3. mark the baseline as immutable;
4. begin adding forward-only migrations for subsequent changes; and
5. introduce the appropriate CI, upgrade, backup, and release verification.

Until one of those triggers occurs, implementation speed and focused evidence
are the default.
