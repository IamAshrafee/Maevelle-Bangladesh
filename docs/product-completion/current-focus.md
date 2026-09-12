# Current Focus

## Active Area

Admin Product Management Workspace

## Why Now

Products are the upstream operating record for merchandising and customer
discovery. The workspace received concentrated recent changes after the former
tracker was deleted, so its real workflow and remaining gaps are uncertain.
It is bounded enough to establish the V2 assessment process without assuming
that the historical Catalog stage remains current.

## Current Status / Substage

`PLANNED` — `INTEGRATED_ORGANIZATION_SIZING_CONTENT_LIFECYCLE_REVIEW`

## Evidence Already Known

`MERCHANDISER_WORKLIST_AND_WORKSPACE_CLARITY` is complete. The Product worklist
now retains URL-backed filters and pagination while adding useful operator sorts
and the first canonical readiness issue with a direct Product-editor recovery
link. The details workspace distinguishes Product fallback, option, and exact-SKU
media coverage, and published Products can be opened through a root-relative
Storefront handoff without exposing drafts. Seventeen focused tests,
Catalog/API/Admin TypeScript, executable-surface lint, and an Admin production
build pass; pre-existing contracts lint errors remain outside this change.

## Immediate Objective

Validate and close the full Product workspace flow across organization,
classification, sizing, structured customer content, lifecycle transitions,
deep links, stale/error recovery, and the customer-facing handoff.

## Next Exact Action

Implement `INTEGRATED_ORGANIZATION_SIZING_CONTENT_LIFECYCLE_REVIEW`: validate
and close the coherent end-to-end organization, sizing, structured content,
lifecycle-editing, and public-handoff workflow with focused proof. Do not begin
final verification and owner review yet.

## Important Constraints

Catalog owns product identity and publication. Pricing, inventory, media, and
sizing retain their own authoritative writes. Preserve tenant/capability checks,
transactions, optimistic versions, audit, and outbox behavior.

## Blockers / Owner Review

No technical blocker recorded. Local Docker services are healthy, but the fresh
container rebuild invalidated the saved authenticated browser session; no
bootstrap credential was exposed or injected. Owner review is not yet requested
because the area remains in implementation.
