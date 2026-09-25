# Current Focus

## Active Areas

Commerce: Orders (`/admin/orders`) & Customers (`/admin/customers`); Media

## Current Status / Substage

`COMMERCE_MODULE_COMPLETION + MEDIA_IMPLEMENTATION_COMPLETE / OWNER_REVIEW_PENDING`

## Evidence Already Known

Orders and Customers are completed with their focused domain split, order-line
image snapshots, public tracking, delivery pricing, payment routing, customer
notes/tags, exports, and their Admin and Storefront workflows.

The shared Media platform is implemented across storage, schema, API, worker,
Admin, Catalog/Product/Variant, Storefront/Cart, and verified-purchase Reviews.
The legacy request-buffered Product-image path has been removed.

## Immediate Objective

Perform owner visual review of customer notes/tags, public order tracking, CSV
exports, the responsive Admin Media library and Product creator, Storefront
galleries, and verified-purchase Review uploads. Configure a live Cloudflare R2
smoke environment only when credentials are available.

## Last Completed Action

Completed the Media final verification checkpoint after the Commerce completion.
The focused migration/domain run passed 21 tests, the API application run passed
6, identity enforcement passed, Media storage/processing passed 2, and the
Worker lifecycle check passed. Production images built and runtime services are
healthy.

## Important Constraints

Storage bytes, Media assets, and domain usages remain separate. Catalog and
Reviews own relationship semantics. Private bytes must not be placed in public
storage, archived assets must keep existing usages working, and destructive
purge must remain delayed and usage-aware.

## Blockers / Owner Review

No code blocker is recorded. A real Cloudflare R2 smoke test requires
owner-supplied bucket credentials and CORS configuration; the S3-compatible
adapter and local provider are implemented. Owner visual review remains pending.
