# Current Focus

## Active area

Catalog Product Management (`ACTIVE_IMPLEMENTATION`)

## Why now

Products are the operational source for Storefront, media, sizing, pricing,
inventory, procurement, promotions, reviews, search, and analytics. The current
Admin Product page exists, but it is an unbounded client-filtered table plus a
partial variant drawer. It cannot yet support complete day-to-day catalog work.

## Current stage

Stage 3 — Product Types, taxonomy, attributes, structured information, FAQ, and SEO.

## Last completed action

The customer-content slice now provides popup editors for structured information
groups, FAQs, and SEO, section-level drafts and concurrency recovery, a shared
transport contract, and verified public Product/SEO/FAQ projection. Commit:
`9d52f61`.

## Next exact action

Complete Product Type and attribute-definition management. Define a normalized,
tenant-scoped reference-option source and selector so `REFERENCE` attributes are
no longer a schema capability that operators cannot configure or edit. Then run
the Stage 3 closure checks and begin the Variant matrix.

## Continuity note

Catalog Product Management is the recommended resume point when no newer user
instruction selects another module. It is not a restriction against working in
another area.
