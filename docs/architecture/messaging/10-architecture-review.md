# Phase 00 Architecture Review

**Review date:** 2026-10-21
**Result:** Ready for Phase 01 implementation, subject to the explicit external/deferred gates below.

## Consistency review

| Gate | Result | Evidence |
|---|---|---|
| Modular fit | Pass | Existing API/worker/PostgreSQL/IAM/media/notification boundaries are reused; no new deployable. |
| Channel extensibility | Pass | Core depends on `ChannelAdapter` capability/outcome contracts; website/Meta remain adapters. |
| Database/API agreement | Pass | Conversation/message IDs, status, sequence, delivery state, version and cursor semantics match the DTO/routes. |
| Reliability/API agreement | Pass | 202 means durable acceptance; delivery remains asynchronous; idempotency and unknown outcomes are explicit. |
| Identity/security agreement | Pass | Visitor/contact/customer are distinct; customer context requires verified link plus permission. |
| Realtime/history agreement | Pass | compact durable event cursor invalidates/reconciles canonical cursor-paginated queries. |
| Frontend/contracts agreement | Pass | Phase 03 permanent components consume the same list/detail/message/read/claim/status/SSE contracts expanded in Phase 05. |
| Phase ownership | Pass | Core (01), website backend (02), usable UIs (03), Admin operations (04/05), Facebook (06/07), Instagram (08/09) do not duplicate ownership. |
| Single-VPS operations | Pass | DB replay, bounded worker polling and SSE require no broker/cache/service. |
| Meta isolation | Pass | Connection failure pauses only that adapter; official access is a later go/no-go gate. |

## Requirements coverage

- Repository/customer/commerce/auth/worker/media/frontend/deployment audit: `00-codebase-audit.md`.
- Domain boundaries, services, capabilities, flows and lifecycle: `01-system-architecture.md`.
- Core/website/operations/provider/reporting schema, constraints, indexes, retention and migration ownership: `02-database-design.md`.
- Public/Admin/internal/provider APIs, schemas, errors, idempotency, pagination and event catalog: `03-api-and-event-contracts.md`.
- ordering/delivery/retry/reconnect/concurrency, guest identity, permissions, privacy and attachment security: `04-realtime-reliability-security.md`.
- complete customer/staff responsive workflows, components, performance and notification behavior: `05-storefront-admin-ux.md`.
- official Meta feasibility signals, prerequisites, adapter/webhook/token design and blockers: `06-meta-integrations.md`.
- performance targets, observability, deployment, dependency decisions and annotated folders: `07-operations-packages-folders.md`.
- consequential decisions and alternatives: `08-adrs.md`.
- user stories, Phases 01–09 ownership/DoD and actionable Phase 01 order/checks/exclusions: `09-roadmap-and-phase-01-handoff.md`.

## Resolved review findings

1. Website connection creation was clarified as Phase 02; Phase 01 owns only the channel-agnostic connection table.
2. Message attachment relationship/state is created in Phase 01; website upload authorization is Phase 02.
3. Generic messaging settings reuse existing versioned platform configuration; structured business hours and assignment rules remain messaging-owned.
4. Per-agent unread state uses read cursors, avoiding a shared counter race.
5. Provider message uniqueness is connection-qualified through external references, avoiding invalid global assumptions.
6. Reporting totals use `NULLS NOT DISTINCT` uniqueness rather than a nullable primary-key dimension.

## Deliberately deferred verification

- No migrations, database rebuild, application build, typecheck, runtime test, provider call, OAuth flow or deployment was performed because Phase 00 changed documentation only.
- Caddy SSE buffering/timeouts, connection capacity and latency targets require implementation/runtime evidence.
- Meta scopes, Graph version, webhook fields, reply rules, account eligibility and approval must be reverified from official documentation in Phases 06/08.
- Malware scanning provider and legal retention/privacy policy require owner/security/legal decisions before production attachments/launch.
- Owner visual/operational judgment remains required after Phase 03/05 UI implementation.

## Lightweight verification performed

- Confirmed every referenced repository path/symbol used as evidence exists at the inspected revision.
- Checked all internal Markdown links in this directory resolve.
- `pnpm exec prettier --check docs/architecture/messaging/*.md` passed.
- `git diff --check` passed.
- Cross-read schema/API/reliability/UX/phase documents and corrected ownership/settings/reporting inconsistencies listed above.
