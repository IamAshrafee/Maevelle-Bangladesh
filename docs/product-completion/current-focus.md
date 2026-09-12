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

`ACTIVE_IMPLEMENTATION` — `MERCHANDISER_WORKLIST_AND_WORKSPACE_CLARITY`

## Evidence Already Known

`SCALABLE_VARIANT_AND_MEDIA_OPERATIONS` is complete. The Admin traverses the
full Variant matrix in bounded 50-combination pages, generates only the visible
missing page with stable unique SKU suffixes, protects unsaved page edits, and
preserves Pricing as a separate authoritative write with explicit partial-save
recovery. Catalog detects stored-signature drift as repair work. Media supports
searchable SKU-specific galleries while retaining Product and option scopes.
Twenty-three focused tests and fresh Admin/API/Storefront builds pass.

## Immediate Objective

Make the Product worklist and workspace explain the next merchandising action:
useful sorting and readiness/attention reasons, coherent media-scope signals,
and a safe handoff to the customer-facing Product representation.

## Next Exact Action

Implement `MERCHANDISER_WORKLIST_AND_WORKSPACE_CLARITY`: add useful
operator-selectable sorting and actionable readiness/attention reasons to the
Product worklist, reconcile Product/option/Variant media signals, and add a
safe Storefront preview/open handoff. Do not begin integrated
organization/sizing/content/lifecycle review yet.

## Important Constraints

Catalog owns product identity and publication. Pricing, inventory, media, and
sizing retain their own authoritative writes. Preserve tenant/capability checks,
transactions, optimistic versions, audit, and outbox behavior.

## Blockers / Owner Review

No technical blocker recorded. The previous shared SearchInput TypeScript
failure is fixed and the local Docker services are healthy. Authenticated
browser verification was not completed because the fresh container rebuild
invalidated the saved session; no bootstrap credential was exposed or injected.
Owner review is not yet requested because the area remains in implementation.
