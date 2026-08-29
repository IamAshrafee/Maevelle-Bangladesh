# Maevelle Engineering Standards

## Objective

Maevelle is being built as a complete, production-quality commerce and business
operations platform. New work must not use MVP, demo, temporary scaffold, or
artificially reduced scope as its target. Complete features may be implemented
incrementally, but the design must account for the full workflow and every
relevant surface.

These standards apply equally to backend and frontend work. They define code
quality and product completeness; the lighter verification and mutable-database
rules in the [development working policy](development-working-policy.md) still
apply during solo heavy development.

## Complete vertical implementation

A feature is more than its most visible happy path. Consider, as applicable:

- schema, constraints, indexes, history, and domain invariants;
- application commands, queries, transactions, and concurrency behavior;
- authentication, authorization, organization isolation, and auditability;
- stable API contracts, validation, errors, pagination, filters, and sorting;
- Admin workflows and Storefront/customer behavior;
- loading, empty, error, disabled, conflict, retry, and recovery states;
- accessibility, responsive behavior, keyboard interaction, and clear feedback;
- background work, idempotency, integrations, and cross-domain effects; and
- operational visibility needed to understand and repair failures.

Not every feature needs every item, but omissions must follow from the feature's
actual needs—not an old MVP boundary.

Do not call placeholder data, static readiness, fake controls, UUID copy/paste,
manual SQL, or a UI that cannot complete the real workflow a finished feature.

## Code organization

- Organize by domain and responsibility, with explicit module boundaries.
- Separate transport/routing, application orchestration, domain rules,
  persistence, external adapters, and UI presentation.
- Keep files cohesive. Split a file when it owns multiple independent concepts,
  becomes difficult to navigate, or mixes state, transport, persistence, and
  rendering concerns.
- Avoid god services, giant route modules, page-sized client components, broad
  "utils" dumping grounds, and hidden cross-domain coupling.
- Keep business rules out of route handlers and React components. Both should
  coordinate typed capabilities rather than become the capability themselves.
- Prefer explicit dependencies and typed interfaces over global mutable state or
  imports that reach through another domain's internals.
- When touching prototype-era monolithic code, refactor the affected boundary
  enough to give new behavior a maintainable home. A full unrelated rewrite is
  not required.

## Reuse and composition

Reuse is expected for genuine repeated behavior:

- backend pagination parsing/results, filtering/sorting, API envelopes, error
  mapping, authorization/tenant context, idempotency, money/time handling, and
  transaction helpers;
- frontend design primitives, application shells, layouts, page headers,
  worklists, tables, pagination, filters, forms, field wrappers, dialogs,
  feedback, empty/error states, and data-access helpers; and
- shared transport DTOs and schemas used across API consumers.

Before creating a helper or component, search for an existing implementation.
Extend or generalize it when the concepts are truly the same. Do not duplicate
near-identical implementations with different names.

Do not force unrelated concepts into a generic abstraction merely to remove a
few repeated lines. Prefer a clear domain-specific module until a stable shared
contract is evident.

For complex React UI, prefer composition, compound components, providers with
typed `state`/`actions`/`meta` contracts, and explicit variants. Avoid components
whose behavior is controlled by growing combinations of boolean props.

## Backend and domain code

- Put authoritative business invariants on the server and enforce important
  integrity rules in PostgreSQL where practical.
- Make transaction boundaries explicit for operations that change related
  state.
- Avoid N+1 queries, unbounded collection reads, sequential independent I/O,
  and repeated database round trips that can be expressed as a set operation.
- Use shared domain/application services for behavior consumed by both Admin
  and Storefront; do not implement separate business truth in each interface.
- Model important state transitions explicitly. Preserve history where the
  business needs traceability rather than overwriting evidence.
- Treat external services as unreliable and their responses as untrusted.
  Validate them at the adapter boundary and make retries/idempotency deliberate.
- Use concise comments for invariants, concurrency reasoning, intentional
  tradeoffs, compatibility constraints, or surprising SQL—not narration of
  obvious syntax.

## API contracts

- Define typed request and response contracts before or alongside endpoint
  implementation. Transport DTOs belong in the shared contracts package when
  multiple applications consume them.
- Successful responses use the established `{ data: ... }` envelope. Errors use
  a consistent `{ error: { code, message, details? } }` shape with safe,
  machine-readable codes and no leaked internal details.
- Keep HTTP status semantics consistent: authentication, authorization,
  validation, not-found, conflict, and server failures must not vary randomly
  between routes.
- Validate user input, configuration, and third-party data at boundaries. Do
  not scatter duplicate validation through trusted internal calls.
- Resource collections that can grow must use reusable server-side pagination,
  bounded page sizes, deterministic ordering, and typed pagination metadata.
  Filtering and sorting happen on the server, not after downloading the whole
  collection.
- Keep persistence rows private. Map them deliberately into stable transport
  types instead of exposing database structure accidentally.
- Use idempotency for retryable commands whose duplicate execution could create
  duplicate money movement, orders, inventory effects, provider actions, or
  other costly side effects.
- Prefer additive contract evolution. When intentionally breaking an internal
  contract during heavy development, update every consumer in the same coherent
  change rather than maintaining accidental parallel versions.

## Frontend architecture and styling

- Use Next.js and React according to the currently installed stable APIs.
  Prefer Server Components by default and introduce Client Components only for
  real interactivity or browser-only behavior.
- Keep server/client boundaries narrow and serialize only the data the client
  actually needs.
- Start independent data work together and avoid request waterfalls. Compose
  server components so independent fetches can execute in parallel.
- Use route layouts and reusable page/workspace primitives instead of copying
  shells and page structure.
- Separate data access, workflow state, and presentation. Large interactive
  workspaces should be composed from focused hooks/providers and components,
  not accumulated in one console file.
- Use the established Tailwind CSS, shadcn, Base UI, and shared design-token
  direction for new interfaces. Do not add feature-specific raw vanilla CSS,
  large one-off selector blocks, or inline style systems.
- Gradually migrate touched legacy global/vanilla CSS into reusable primitives
  and utility-based styling. A repository-wide styling rewrite is required only
  when it is the assigned task.
- Build accessible primitives with semantic HTML, labels, keyboard support,
  focus visibility, appropriate ARIA, and sufficient contrast.
- Design responsive behavior intentionally for relevant screen sizes; do not
  treat desktop-only overflow as a completed interface.
- Avoid unnecessary dependencies and client JavaScript. Dynamically load truly
  heavy optional UI and configure framework-supported package import
  optimization when official guidance supports it.

## Readability and comments

- Use names that communicate business meaning rather than abbreviations or
  implementation accidents.
- Prefer small typed functions with explicit inputs/outputs and early returns.
- Represent variants and state machines with discriminated unions or other
  types that make invalid states difficult to express.
- Comments explain **why**, invariants, edge cases, or non-obvious constraints.
  Do not comment every line or restate readable code.
- Public/shared interfaces and surprising domain behavior should have concise
  documentation close to the code.
- Remove obsolete comments, dead code, fake examples, and stale TODOs when
  replacing the behavior they describe.

## Performance and optimization

- Design collection endpoints, queries, and pages for realistic data volume
  from the beginning; do not rely on loading everything into memory.
- Measure or inspect the relevant path before low-level optimization, while
  applying obvious structural wins such as eliminating N+1 queries, async
  waterfalls, duplicate work, and unnecessary client bundles.
- Add indexes for actual access paths and foreign keys, but avoid speculative
  indexes that only add write cost.
- Cache only with explicit ownership, invalidation, and correctness behavior.
  Stale business truth is not an acceptable performance strategy.
- Optimization must preserve readability and business correctness.

## Dependencies and upgrades

Before any dependency/framework installation, upgrade, replacement, or material
configuration change:

1. search the internet and open the project's official documentation;
2. confirm the current latest stable version and supported runtime/framework
   matrix;
3. read official release notes and the migration/breaking-change guide between
   the installed and target versions;
4. verify peer dependencies and compatibility with this monorepo;
5. use the official current installation/configuration command; and
6. perform a focused build, typecheck, or runtime check of the affected package.

Prefer the latest stable release, even when it is newer than the LTS line. Do
not choose preview, canary, beta, RC, deprecated, or unofficial forks without a
specific user-approved reason. Record a non-obvious compatibility decision near
the relevant configuration or dependency declaration.

## Definition of done during heavy development

An implementation checkpoint should leave the changed path coherent and usable,
with no known false controls or knowingly broken contract. Use focused
verification under the development working policy; exhaustive release evidence
is not required at every checkpoint.

If a larger capability is intentionally continued across multiple checkpoints,
record what works and the exact next gap. Do not relabel the incomplete module
as complete merely because one scoped slice has landed.
