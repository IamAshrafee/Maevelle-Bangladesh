# Maevelle Working Mode

This repository is currently in **solo, heavy-development mode**. The delivery
target is a complete, production-quality commerce and operations platform—not
an MVP, demo, prototype, or deliberately reduced first version. At the same
time, local data is disposable and release-process ceremony is not the current
priority.

These instructions apply to every task unless the user explicitly asks for a
different level of rigor.

## Product scope authority

- Historical MVP, V1, phase, roadmap, "implement later," "deferred," and
  scoped-implementation labels are **not current product boundaries**.
- Historical documents remain useful for business reasoning, but they must not
  be used to omit a capability or force a thin implementation. The user's
  current request, this file, and current product-completion evidence supersede
  those old limits.
- Work may happen in any module the user selects. `current-focus.md` is a resume
  aid, not an instruction that forbids switching areas.
- Build complete vertical capabilities across schema, backend, API, Admin,
  Storefront, permissions, validation, operational states, and relevant
  cross-domain behavior.
- Large capabilities may be delivered in manageable increments, but an
  increment must not be presented as the completed feature when important
  workflows or surfaces are still missing.
- "Advanced as practical" means robust, extensible, maintainable, and complete
  for the real product. It does not mean adding speculative complexity with no
  credible product use.

## Priorities

1. Prioritize complete working product behavior and real operator/customer
   workflows.
2. Replace or refactor prototype-quality foundations when they obstruct the
   feature being built; do not keep stacking new work into known monoliths.
3. Minimize ceremony, repetitive documentation, token usage, and long-running
   verification during ordinary implementation.
4. Do not confuse production-quality code with release ceremony: build the
   former now, defer staging/launch/backup bureaucracy until it is relevant.

## Engineering standards

The detailed rules are in
[`docs/engineering-standards.md`](docs/engineering-standards.md). In every
backend and frontend task:

- organize code by domain and responsibility; avoid god files, giant route
  handlers, giant page components, and unrelated helpers in one module;
- keep transport, application/domain logic, persistence, and presentation
  responsibilities separated;
- reuse shared contracts, pagination, errors, authorization context, UI
  primitives, layouts, forms, tables, filters, and dialogs instead of copying
  feature-specific versions;
- use typed, predictable API success/error envelopes and server-side pagination
  for potentially growing collections;
- validate at system boundaries and keep domain invariants authoritative on the
  server;
- use the established Tailwind CSS and shadcn/component-primitives direction
  for UI work; do not add feature-specific raw vanilla CSS or grow monolithic
  global stylesheets;
- prefer React composition and explicit variants over boolean-prop-heavy
  components, keep client boundaries narrow, avoid async waterfalls, and avoid
  sending unused server data to client components;
- write developer-friendly names, types, structure, and concise comments that
  explain intent, invariants, tradeoffs, or non-obvious behavior; and
- improve touched legacy code enough that new work does not deepen its
  structural problems.

## Dependencies and framework changes

- Before installing, replacing, upgrading, or configuring a dependency or
  framework, browse its current **official documentation**, release notes, and
  migration guide. Use primary sources rather than remembered or third-party
  setup instructions.
- Prefer the latest stable release compatible with the project. "Stable" is the
  requirement; it does not have to be the LTS line.
- Do not use alpha, beta, canary, release-candidate, or deprecated releases
  unless the user explicitly approves a concrete reason.
- Check runtime, peer-dependency, framework, and breaking-change compatibility
  before modifying package files, then use the official installation command
  and perform a focused verification.

## Database and schema changes

- Treat the checked-in migration set as a **mutable development baseline**.
- Prefer editing the relevant existing domain migration and its `CREATE TABLE`
  definitions instead of adding incremental `ALTER TABLE` migrations.
- Do not preserve or backfill disposable local data unless the feature itself
  requires testing a data transition.
- After baseline changes, rebuild the disposable local database when needed
  with `docker compose down --volumes` followed by
  `docker compose up -d --build`.
- Remember that deleting/recreating containers without `--volumes` does not
  erase the PostgreSQL named volume.
- A new forward-only migration is required only when the user asks for one or
  when a real/shared environment must retain existing data.
- Keep the clean-database path working: a fresh database must still be
  constructible from the checked-in baseline.

## Verification

- Use the narrowest useful verification for the files and behavior changed.
- Prefer focused typechecking, focused tests, or a targeted manual/API check.
- Do not run the full test suite, all-package build, complete acceptance suite,
  backup drill, staging smoke suite, or release-readiness checks after every
  task or checkpoint.
- Run broad verification only when the user requests it, at a meaningful area
  closure/release checkpoint, or when a cross-cutting/high-risk change makes it
  necessary.
- Do not add large test matrices for ordinary scaffolding. Add focused tests
  where they efficiently protect important business rules, authorization,
  money, inventory, or destructive behavior.
- Never claim a check passed unless it was actually run.

## Documentation and tracking

- Update documentation when behavior, a public contract, or the next resume
  point materially changes.
- Keep progress notes concise. Do not expand historical architecture,
  verification evidence, or release documentation at every implementation
  checkpoint.
- Architecture documents describe the intended product; they do not require
  production-grade implementation ceremony during this development phase.
- Treat historical MVP/scope/phase/deferred wording as context only. Do not
  propagate it into new plans or code unless the user intentionally restores
  that boundary.

## Quality floor

Speed does not mean knowingly leaving broken builds, obvious security issues,
tenant-isolation failures, corrupt accounting/inventory behavior, or destructive
commands without warning. Address these risks proportionally and explain when
they require broader work.

## When this mode ends

Revisit and replace this policy before the first environment or dataset that
must survive schema upgrades, before another developer depends on migration
history, or when beta/release preparation begins. At that point, freeze the
baseline and adopt immutable forward-only migrations plus broader automated
verification.
