# Current Focus

## Active Area

Admin Inventory Operations

## Why Now

The Catalog-to-Inventory setup gap is closed in the current working tree.
Inventory operations is left idle until a new repository-evidenced capability
is selected.

## Current Status / Substage

`IDLE`

## Evidence Already Known

New Catalog variants are discoverable before their first stock movement through
a paginated inventory-identity read model. The Stock workspace surfaces active
SKUs awaiting opening balances, and Product, Inventory dashboard, item-detail,
adjustment, and transfer links now carry authoritative variant/location
identifiers. Storefront search also consumes pricing-definition outbox events.

## Immediate Objective

None. Reassess the current repository before starting the next Inventory
capability.

## Last Completed Action

Closed the product-setup lifecycle gap in the current working tree: zero-stock
variants remain visible and actionable, adjustment/transfer preselection works,
dead cross-module links were repaired, and price changes refresh Storefront
search. Focused Inventory and Storefront tests, targeted TypeScript/lint, the
Admin production build, and rebuilt service health checks passed.

## Important Constraints

Preserve the existing Warehouse Transfer authority, Inventory movement ledger,
Costing provenance, tenant isolation, capability authorization, idempotency,
optimistic concurrency, audit, and outbox behavior. Posted dispatch/receipt
movements are immutable facts; corrections must be new explainable movements.

## Blockers / Owner Review

No technical blocker is recorded. The earlier adjustment selector was visually
verified; the rebuilt Stock workspace still needs authenticated owner review
because the service restart invalidated the browser session.
