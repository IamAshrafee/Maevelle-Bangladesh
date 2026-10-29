# Media Completion Progress

## Implemented

- Media Library grid and list inspection now use semantic, keyboard-accessible controls
  with separate bulk checkboxes. The page and picker split results, inspector, and
  dialogs into focused components, use shared Admin primitives, and expose clearer
  loading, empty, error, and mobile states. Both library surfaces apply used/unused
  filters and sorting on the server before pagination; usage includes Product, Review, and
  conversation attachments. The authenticated upload-policy endpoint returns the
  effective deployment-capped limit and supported MIME types so both Admin upload
  surfaces validate files before transfer. The picker accepts PDF uploads when its
  caller permits documents and previews documents without trying to render them as images.
- Media settings now read the actual keyed API values and show the active local or
  S3-compatible backend without claiming a live connection. Accepted upload formats
  come from the server policy. The deployment upload limit is returned by an
  authenticated runtime endpoint, caps effective organization settings, and rejects
  overrides above it; existing larger overrides remain stored but cannot authorize
  larger uploads. The System and Integrations views use deployment-backed storage
  labels. No schema or Worker change is needed for these settings corrections.
  The System diagnostics page marks worker liveness unverified until a real probe exists.
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
- Media Library usage, unused filtering, and single/bulk trash checks now include
  conversation attachments. Admin shows the conversation use and links to its inbox entry;
  the existing purge worker also retains assets referenced by messages.
- Purge claims now use a 15-minute lease and fencing token. Failed attempts record an error
  and retry with capped exponential delay (30 seconds to one hour); expired leases are
  reclaimable after worker crashes. Admin can filter `PURGING`, inspect attempts and errors,
  and request an immediate retry of an unclaimed failure. Health reports failed and stale
  purges. Purge selection checks customer profile and business asset references; the final
  transaction removes messaging upload ledger rows before deleting their media records.
- Storage health inventory now uses cursor pages of up to 100 records instead of silently
  stopping at 2,000. Admin continues until every page succeeds and distinguishes scanning,
  complete, degraded, and failed results. The scan checks storage presence and recorded byte
  size; external URL objects are explicitly unverified, and the UI does not claim checksum
  or image-property integrity. Issue counts remain exact when displayed details are capped.
- Public image delivery now resolves only the exact requested processed WebP/AVIF rendition
  of the current original. Missing variants return 404; public requests cannot fall back
  to an original or another size. The Media Library identifies incomplete public rendition
  sets and offers an audited regeneration action; archived assets return to Archived after
  repair. Public asset URLs now issue an uncached redirect to a URL containing the
  rendition SHA-256 fingerprint. The versioned response has a five-minute cache
  lifetime and an ETag; an old or withdrawn version returns 404 when revalidated.
  S3 signed reads expire within five minutes and request a five-minute Cache-Control
  response from the object store. Previously issued unversioned browser cache
  entries can persist until their original advertised expiration.
  Migration `3206` records whether an Archived asset must return to that state after repair;
  apply it before deploying the updated API and Worker.
- Local API-proxy uploads for Admin, Reviews, staff messaging, and storefront chat stream
  into bounded temporary files with incremental signature,
  size, and SHA-256 checks, then atomically publish the stored object. Local delivery streams
  bytes, and `head()` uses file metadata instead of rereading and hashing originals. The
  Worker removes abandoned upload temporary files. Admin library, picker, and Product
  creator uploads run at most three files concurrently. Storefront chat still checks its
  declared SHA-256 during the streaming write. Imported originals use private storage.
  Messaging attachments generate thumbnail and card
  renditions; other images retain all four. Sharp encodes variants sequentially to limit
  peak CPU and memory use.

- External image URLs from seed and supplier import now create pending Media assets and
  durable import jobs. The worker validates each HTTPS redirect and DNS result, pins the
  connection to the checked public address, limits time and bytes, validates MIME/signature,
  stores owned bytes, then runs normal rendition processing. Failed jobs have bounded retries,
  lease recovery, and an Admin retry action. Public and Admin delivery never fetch a remote
  URL; legacy URL-backed assets are queued by migration `3205` and unavailable until imported.
  Previously archived assets return to Archived after processing. Failed imports retain their
  source URL in the job for retry, while obsolete URL object records are removed.

For the `3205` upgrade, stop the old API and Worker before the migration; deploy the updated
API and Worker together after it. The migration temporarily makes legacy URL images pending,
so schedule the change when the importer can reach suppliers and monitor failed imports in
the Media Library. Do not start the old Worker against the migrated schema. Keep the database
and media volume together in the pre-upgrade backup; a code-only rollback cannot reverse the
new schema or recover remote-only images.

For an upgrade, stop the old worker, apply migrations `3203` and `3204` once, then deploy
the new Worker, API, and Admin together. Check Media Library's Purging filter and Media
Health for previously stranded assets; an unclaimed legacy `PURGING` row is eligible for
automatic recovery after migration. File deletion is safe to repeat when a previous
attempt removed some objects before failing.
- Upgraded Admin Media Library (`apps/admin/app/media/page.tsx`) to production-grade shadcn/Base UI
  and Tailwind CSS v4, featuring Grid and List views, multi-select checkboxes, sticky floating bulk action
  bar (`motion/react`), taxonomy folder pills, search and format/usage/status filters, storage health diagnostics,
  full-screen drag-and-drop file ingestion, and clipboard paste (`Ctrl+V`) direct upload.
- Transformed Asset Inspector (`apps/admin/components/media/media-asset-inspector.tsx`) into an organized
  4-tab workspace (`Details`, `Taxonomy`, `Catalog`, `Activity`) with an interactive multi-rendition switcher
  (`PDP`, `Card`, `Thumbnail`, `Zoom`, `Original`), one-click public CDN URL copy with feedback, and complete
  lifecycle controls.
- Added complete taxonomy management: folder renaming and deletion (safely unfiling contained assets), tag
  creation and deletion, and bulk tag management (`addTagIds`, `removeTagIds`).
- Aligned backend and contract schemas: updated `bulkOrganizeMediaAssets` and `POST /admin/media/bulk/organize`
  to support `tagIds`, `addTagIds`, and `removeTagIds`, and added `assetCount` to `MediaFolderDto` and `MediaTagDto`.
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
