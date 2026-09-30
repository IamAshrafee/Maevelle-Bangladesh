# Media Completion Progress

## Implemented

- Added `@maevelle/media` with local and S3/R2-compatible object storage ports and adapters.
- Replaced request-buffered immediate-ready uploads with authorized upload sessions,
  object head confirmation, explicit lifecycle states, and worker-driven image processing.
- Added immutable originals, SHA-256 checksums, metadata extraction, four deterministic WebP
  renditions (`thumbnail`, `card`, `pdp`, `zoom`), magic-byte file signature validation
  (JPEG, PNG, WebP, PDF), EXIF orientation normalization, metadata stripping for public privacy,
  retry mechanisms, stale claim recovery, expiry cleanup, and retained-trash purge.
- Completed tenant-safe database schemas, constraints, and indexes across assets, objects,
  renditions, upload sessions, processing attempts, folders, tags, Product placements,
  usage projection, and usage history.
- Added atomic Product Media batch placement reconciliation (`syncProductMediaPlacements`)
  supporting reordering, primary cover swaps, option-value (Color) gallery assignments,
  and variant-specific SKU overrides, with single-primary enforcement per scope.
- Added single-transaction asset replacement (`replaceProductMediaAsset`) with full audit trail.
- Implemented bulk operations: `bulkOrganizeMediaAssets` (multi-asset folder and tag updates)
  and `bulkTrashMediaAssets` (safe usage-checked batch trashing of unattached assets).
- Upgraded Admin Media Library (`apps/admin/app/media/page.tsx`) to production-grade shadcn/ui
  and Tailwind CSS, featuring Grid and List views, multi-select checkboxes, sticky bulk action
  bar (Move to Folder, Trash Unused), taxonomy creation, search/filter toolbar (including unused
  filter), storage health diagnostics modal, and clipboard paste (`Ctrl+V`) direct upload.
- Created reusable `AssetPickerDialog` (`apps/admin/components/media/asset-picker-dialog.tsx`)
  for choosing library assets or uploading new photography inline from any catalog or content form.
- Enhanced Product Creator & Editor (`apps/admin/components/products/creator/*`) with Media Library
  picker integration, reordering controls (Move Left / Right), scope/color selectors, and atomic
  batch sync on draft and active submissions.
- Added private document delivery supporting renditions and `download=true` for authenticated
  `Content-Disposition` attachments.
- Completed verified-purchase Review image upload through the same secure pipeline, with
  credential-bound ownership and moderation-controlled publication.
- Verified 100% monorepo TypeScript compilation and focused test suites.

## Deliberate boundary

No speculative generic attachment table was added for operational domains that
do not yet expose an attachment workflow. A future Payment, Procurement,
Shipment, Inventory, or Customer attachment must use Media for bytes/assets and
a domain-owned typed relationship for semantic validity and retention.
