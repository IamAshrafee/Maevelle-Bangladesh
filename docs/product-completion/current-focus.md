# Current Focus

## Active area

Catalog Product Management (`ACTIVE_IMPLEMENTATION`)

## Why now

Products are the operational source for Storefront, media, sizing, pricing,
inventory, procurement, promotions, reviews, search, and analytics. The current
Admin Product page exists, but it is an unbounded client-filtered table plus a
partial variant drawer. It cannot yet support complete day-to-day catalog work.

## Current stage

Stage 2 — Product overview editing and safe recovery.

## Last completed action

Stage 1 added a bounded tenant-scoped Product worklist, server filtering and URL
state, shared publication readiness, operational warnings, stale-page recovery,
and truthful Admin readiness. Commit: `2229434`.

## Next exact action

Add an explicit Product overview editor for title, handle, description, and
Product Type. Use `If-Match` optimistic concurrency, preserve drafts against
accidental close/navigation, show field and stale-save recovery inline, and keep
the selected Product deep-linkable without losing worklist state.

## Do not switch areas

Catalog Product Management remains active until its completion gate passes.
