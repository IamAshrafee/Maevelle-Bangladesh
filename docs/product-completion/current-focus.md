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

`ACTIVE_DISCOVERY` — `CURRENT_HEAD_ASSESSMENT`

## Evidence Already Known

Current source contains dedicated Product list/create/detail/edit routes,
catalog API commands/read models, shared contracts, focused Catalog tests, and
Storefront product consumption. Current-head workflow, responsive behavior, and
owner acceptance are not yet evidenced.

## Immediate Objective

Establish a current, evidence-backed gap assessment for the operator path from
product creation through organization, variants, pricing/media/sizing signals,
publication, and Storefront visibility.

## Next Exact Action

Read the current Product Admin routes/components, Catalog API/database commands,
and focused tests; map one realistic merchandiser workflow and record only
observed gaps before implementing any behavior.

## Important Constraints

Catalog owns product identity and publication. Pricing, inventory, media, and
sizing retain their own authoritative writes. Preserve tenant/capability checks,
transactions, optimistic versions, audit, and outbox behavior.

## Blockers / Owner Review

No technical blocker recorded. Owner review is not yet requested because the
area is being assessed, not presented for acceptance.
