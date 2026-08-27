# Catalog Product Management Target State

## Information architecture

- Paginated worklist with server search, lifecycle/Product Type/readiness
  filters, useful counts, URL-deep-linked state, and bulk selection.
- Dedicated Product workspace with Overview, Organization, Variants, Pricing,
  Inventory, Media, Sizing, Information, SEO, Reviews, and Activity sections.
- Readiness panel distinguishes publication blockers, operational warnings, and
  purchasability signals and offers the exact next action.

## Lifecycle and commands

- Create/save draft; edit master identity with optimistic concurrency.
- Manage options and valid Variant combinations efficiently.
- Assign taxonomy and structured values; manage information, FAQ, and SEO.
- Publish/unpublish/archive/reactivate with impact-aware confirmation.
- Duplicate with explicit copy policy; safe previewed bulk commands.

## Cross-domain behavior

Catalog composes read-only price, media, sizing, inventory, review, and activity
signals. Mutations route to each owning domain. Published visibility remains
distinct from current purchasability and out-of-stock Products may stay visible.

## Failure and safety

All boundary input is validated. Stale versions produce recoverable reload UX.
Forms prevent duplicate submit, preserve or warn on unsaved work, and surface
field-specific fixes. Tenant/capability isolation applies to reads and commands.

## Completion gate

A non-developer can create, configure, price, image, categorize, size, stock,
validate, publish, find, edit, unpublish/archive, and audit a Product using
realistic data. Storefront behavior and all linked domain truth are verified.
