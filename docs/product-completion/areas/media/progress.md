# Media Completion Progress

## Implemented

- Added `@maevelle/media` with local and S3/R2-compatible object storage.
- Replaced request-buffered immediate-ready uploads with authorized sessions,
  object confirmation, explicit states, and worker processing.
- Added immutable originals, checksums, metadata, four WebP renditions, PDF
  signature validation, EXIF orientation/privacy handling, retry, stale claim
  recovery, expiry cleanup, and retained-trash purge.
- Completed tenant-safe schema constraints/indexes for assets, objects,
  renditions, sessions, processing attempts, folders, tags, Product placement,
  usage projection, and usage history.
- Added bounded Admin pagination/search/filtering, multi-upload progress,
  lifecycle actions, trash recovery, folders/tags, usage inspection, and an
  on-demand media/storage health report.
- Completed Product, exact Variant, and option-value placement with authoritative
  scope validation and correct Storefront/Cart precedence and rendition sizes.
- Added verified-purchase Review image upload through the same pipeline, with
  credential-bound ownership and moderation-controlled publication.
- Removed the obsolete API-local filesystem upload implementation.
- Preserved archived bytes for existing usages while preventing new archived
  placements and unsafe public-to-private reclassification.

## Deliberate boundary

No speculative generic attachment table was added for operational domains that
do not yet expose an attachment workflow. A future Payment, Procurement,
Shipment, Inventory, or Customer attachment must use Media for bytes/assets and
a domain-owned typed relationship for semantic validity and retention.
