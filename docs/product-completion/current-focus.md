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

Stage 3's backend foundation added tenant-scoped category choices and atomic
Product category/primary-category assignment, plus Product Type-driven typed
attribute reads and writes with required-value and optimistic-concurrency
enforcement. Commit: `d90d817`.

## Next exact action

Build the Admin Product Organization editor on the verified taxonomy and typed
attribute commands, including draft-loss protection, stale-version recovery,
inline validation, and accessible required/optional controls.

## Do not switch areas

Catalog Product Management remains active until its completion gate passes.
