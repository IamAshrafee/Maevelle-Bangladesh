# Current Focus

## Active area

Catalog Product Management (`ACTIVE_IMPLEMENTATION`)

## Why now

Products are the operational source for Storefront, media, sizing, pricing,
inventory, procurement, promotions, reviews, search, and analytics. The current
Admin Product page exists, but it is an unbounded client-filtered table plus a
partial variant drawer. It cannot yet support complete day-to-day catalog work.

## Current stage

Stage 3 — Taxonomy, attributes, structured information, FAQ, and SEO.

## Last completed action

Stage 2 added explicit Product overview editing, active Product Type changes,
`If-Match` optimistic concurrency, three-way stale-draft merging, inline conflict
choices, deep-link preservation, and create/overview draft-loss guards. Commit:
`c364860`.

## Next exact action

Inventory existing category, attribute-definition/value, and Storefront metadata
models. Implement the smallest coherent Product organization slice: category
assignment plus Product Type-driven required/optional attribute values, with
tenant-scoped commands, truthful readiness, and Admin editing.

## Do not switch areas

Catalog Product Management remains active until its completion gate passes.
