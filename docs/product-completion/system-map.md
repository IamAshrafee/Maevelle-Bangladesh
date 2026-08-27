# System Map

## Runtime applications

| Application | Role | Current surface |
| --- | --- | --- |
| `apps/storefront` | Public Next.js commerce experience | Discovery, PDP, cart, checkout, confirmation, tracking, reviews, policies |
| `apps/admin` | Internal Next.js operations console | 30+ operational routes spanning catalog, orders, supply, inventory, finance, settings, analytics |
| `apps/api` | Fastify HTTP boundary | Authenticated Admin APIs, public Storefront APIs, provider/webhook boundaries |
| `apps/worker` | Durable background processing | Jobs, outbox consumers, notifications, projections, imports |

## Shared packages

| Package | Ownership |
| --- | --- |
| `packages/database` | PostgreSQL migrations, tenant-scoped repositories, application orchestration currently colocated with persistence |
| `packages/contracts` | Shared transport DTOs |
| `packages/core` | Shared domain primitives and errors |
| `packages/config` | Validated configuration |
| `packages/security` | Security primitives and controls |
| `packages/observability` | Logging, telemetry, and operational signals |
| `packages/ui-admin`, `packages/ui-storefront` | UI foundations |
| `packages/testkit` | Deterministic test support |

## Architectural flow

`Admin/Storefront -> API -> application/repository functions -> PostgreSQL`

The database is split into bounded schemas including `platform`, `iam`, `audit`,
`catalog`, `sizing`, `media`, `warehouse`, `inventory`, `customers`, `pricing`,
`promotions`, `cart`, `orders`, `payments`, `fulfillment`, `delivery`,
`procurement`, `receiving`, `landed_cost`, `costing`, `returns`, `finance`,
`reviews`, `notifications`, `analytics`, and rebuildable `search` projections.

## Verification foundation

Vitest covers package, database, API, worker, Admin, Storefront, and architecture
contracts. Root scripts provide lint, typecheck, build, architecture, secrets,
hardening, migration, acceptance, backup/restore, and staging checks. The
presence of these commands is not evidence that every business workflow is
complete; area verification records the exact proof used.
