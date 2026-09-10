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
  current request, this file, and current Product Completion V2 evidence supersede
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

## Evidence and continuity

- The repository, current Git state, source, tests, and runtime evidence outrank
  historical completion reports or chat context. Preserve and inspect dirty work;
  never reset, clean, stash, or discard useful interrupted work merely to simplify
  a task.
- Before selecting or resuming product work, read `docs/product-completion/`
  (especially `state.json` and `current-focus.md`) and verify important claims
  against current source and Git. Do not declare an area complete without current
  evidence for the applicable completion gate.
- Keep shared contracts, domain ownership, organization isolation, and capability
  authorization authoritative. Authentication establishes identity; it does not
  grant authorization. Do not bypass semantic operations for money, inventory,
  payments, refunds, costing, or other authoritative business state.
- Preserve deliberate transaction boundaries, idempotency, optimistic concurrency,
  audit, and outbox behavior when modifying affected workflows.

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
  for UI work; always prefer existing shadcn UI components and the project's
  own shared components before creating feature-specific UI. Compose or extend
  those primitives when needed instead of rebuilding the same controls and
  interaction patterns. Do not add feature-specific raw vanilla CSS or grow
  monolithic global stylesheets;
- before creating a component, search the repository for an existing component
  that already serves the need. When a component or behavior has a credible use
  in more than one place, design it as a reusable component with a clear API and
  place it in the appropriate shared or domain-level component directory. Avoid
  duplicating markup, behavior, validation, and styling across features;
- keep implementation code in focused files organized by responsibility. Split
  substantial components, hooks, schemas, utilities, data-access code, and
  business logic into appropriately named files and directories so pages and
  modules remain easy to read and navigate. Avoid both large mixed-purpose files
  and excessive fragmentation into trivial files that make the code harder to
  follow;
- prefer React composition and explicit variants over boolean-prop-heavy
  components, keep client boundaries narrow, avoid async waterfalls, and avoid
  sending unused server data to client components;
- write developer-friendly names, types, structure, and concise comments that
  explain intent, invariants, tradeoffs, or non-obvious behavior; and
- improve touched legacy code enough that new work does not deepen its
  structural problems.

## Frontend experience and responsive design

- Treat responsive behavior as a core requirement for every frontend feature,
  not as optional polish. Design and implement each screen for mobile, tablet
  and iPad, and desktop layouts, including intermediate widths, content growth,
  and orientation changes.
- Treat mobile and touch use as the primary interaction context. Use comfortable
  touch targets and spacing, avoid hover-only actions, keep important actions
  reachable, support touch-friendly scrolling and controls, and ensure forms,
  dialogs, drawers, tables, menus, and navigation remain practical on small
  screens and on-screen keyboards.
- Plan the complete user workflow before implementing a frontend surface. Keep
  tasks clean, direct, predictable, and organized; use clear labels, sensible
  defaults, progressive disclosure, visible feedback, validation, loading and
  empty states, success outcomes, error recovery, and an obvious next step.
- Preserve the platform's full power without exposing its architectural
  complexity to users. Group advanced capabilities logically, reveal detail
  when it becomes relevant, and optimize common tasks for the fewest clear
  decisions and interactions without hiding necessary controls.
- Put the primary action for creating a resource on its main listing or
  workspace page. Use a dialog, sheet, or similarly focused overlay for short
  and simple forms; use a dedicated page for long, multi-section, or complex
  forms. After a successful creation, return the user to the relevant main page
  or detail context with clear confirmation and refreshed data.
- Reuse the same form fields, validation, layout, and interaction patterns for
  creating and editing the same resource. Share the underlying form component
  and vary only the mode, initial values, permissions, labels, and submit action
  needed by the workflow so both experiences stay familiar and consistent.
- Choose overlays and full pages based on task complexity and device usability.
  Dialogs that work on desktop must adapt appropriately for mobile, such as a
  full-screen dialog, sheet, or dedicated route when space, scrolling, keyboard
  use, or recovery would otherwise be difficult.

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

- Local browser, screenshot, and UI verification are allowed when useful and
  tooling is available. Never use production credentials or mutate production
  or other live external systems without explicit user authorization. Record an
  unavailable tool or unperformed visual check honestly; owner visual and
  operational judgment remains a distinct review gate where applicable.
- Use the narrowest useful verification for the files and behavior changed.
- Prefer focused typechecking, focused tests, or a targeted API/manual workflow.
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
