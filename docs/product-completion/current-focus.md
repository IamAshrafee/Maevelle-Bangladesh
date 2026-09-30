# Current Focus

## Active Areas

Media Platform: Media Library (`/media`), Object Storage Ports & Adapters, Image Processing Worker, Product Media Placement Sync, Asset Picker Dialog, Customer Review Media

## Current Status / Substage

`MEDIA_COMPLETE / READY_FOR_OWNER_REVIEW`

## Evidence Already Known

Media has been transitioned from MVP to a complete, production-grade digital asset platform:
- Decoupled asset identity from storage keys and URLs (`Stored Object -> Media Asset -> Asset Usage -> Business Entity`).
- Magic-byte signature validation (`validateMediaSignature`) for JPEG, PNG, WebP, and PDF preventing MIME-type spoofing before upload writes.
- Atomic Product Media placement batch synchronization (`syncProductMediaPlacements`) supporting reordering, primary cover swaps, option-value (Color) gallery assignments, and variant-specific SKU overrides, with single-primary enforcement per scope.
- Single-transaction asset replacement (`replaceProductMediaAsset`) with full usage history audit trail.
- Bulk operations: `bulkOrganizeMediaAssets` (multi-asset folder and tag updates) and `bulkTrashMediaAssets` (safe usage-checked batch trashing of unattached assets).
- Modernized Admin Media Library (`apps/admin/app/media/page.tsx`) with shadcn/ui and Tailwind CSS, featuring Grid and List view toggle, multi-select checkboxes, sticky bulk action bar, taxonomy management, comprehensive search/filter toolbar (including unused filter), storage health diagnostics modal, and clipboard paste (`Ctrl+V`) direct upload.
- Reusable `AssetPickerDialog` (`apps/admin/components/media/asset-picker-dialog.tsx`) for choosing library photography or uploading new photography inline from catalog and content forms.
- Upgraded Product Creator & Editor (`apps/admin/components/products/creator/*`) with Media Library picker integration, reordering controls (Move Left / Right), scope/color selectors, and atomic batch sync on draft and active submissions.
- Private document delivery supporting renditions and `download=true` for authenticated `Content-Disposition` attachments.
- Verified 100% monorepo TypeScript compilation and focused test suites.

## Immediate Objective

Conduct owner visual and operational review of the modernized Media Library, AssetPickerDialog, and Product gallery management.

## Last Completed Action

Completed Media module from MVP to production product: added atomic placement batch sync and swap, magic-byte signature validation, modernized shadcn/ui and Tailwind Media Library with Grid/List view and bulk actions, reusable AssetPickerDialog, Product Creator reordering and variant/color placement assignment, private document download delivery, and verified tests and typecheck.

## Important Constraints

- Organization / tenant isolation strictly enforced on every media lookup, session, placement, and bulk operation.
- No direct filesystem storage dependency in production; storage port supports local dev and S3/R2 cloud storage.
- Processed public bytes cannot be reclassified as private.
- Trashing is usage-aware: assets in active catalog or review placements are never deleted.

## Blockers / Owner Review

No code blockers. Ready for owner visual and operational review.
