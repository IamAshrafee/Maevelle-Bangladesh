# Catalog Product Management Gap Analysis

## Resolved in Stage 1 (`2229434`)

- The Product workspace renders price, media, and inventory with success icons
  without querying those domains. Resolved with server-derived operational
  signals and warning states.
- Publication validation is not exposed as a reusable read model, so operators
  learn blockers only after pressing Publish. Resolved with one shared readiness
  model used by reads and the publish command.
- The list downloads every Product and filters in browser memory; there is no
  server pagination, durable URL state, Product Type filter, or blocked-work view.
  Resolved with the bounded Product worklist endpoint and Admin filters.

## Domain/application gaps

- No Product archive/reactivate, Variant update/archive, duplicate, taxonomy
  assignment, attribute value, structured information/FAQ, or SEO commands.
- Product Type and attribute-definition management is only a minimal create/list.
- Adding option axes after Variants can make combinations incomplete; the UI
  does not surface that integrity risk before publication.
- Outbox aggregate version is currently hard-coded in Catalog events.

## Admin gaps

- Product master fields could not be edited despite an API command existing.
  Resolved in Stage 2 with explicit saves and stale-version recovery.
- No dedicated deep-linkable Product route or section navigation. Product
  selection and filters are now URL-backed; a dedicated route remains open.
- Variants do not show current price, stock, media, barcode, physical data, or
  setup issues and cannot be safely batch-edited.
- Categories, collections/tags/occasions, attributes, information, FAQ, SEO,
  activity, duplicate, archive, and safe bulk work are absent.
- Drawer focus recovery, Escape behavior, URL state, async submit prevention,
  inline overview errors, and overview/create draft-loss handling are now covered;
  full dialog focus trapping and later-stage forms remain open.

## Verification gaps

- No realistic operator walkthrough creates a fully merchandised Product and
  confirms it in Storefront.
- No Catalog Admin browser/accessibility/large-list proof exists.
