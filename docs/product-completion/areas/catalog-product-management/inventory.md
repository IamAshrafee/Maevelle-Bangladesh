# Catalog Product Management Inventory

## Database and domain

- Migration: `packages/database/src/migrations/0200_catalog.ts`.
- Product Types, categories, attributes, Products, handles, options/values,
  Variants, category links, information groups/items, FAQ.
- Media and sizing add Catalog relationships in later migrations.
- Pricing and inventory reference Variants across bounded schemas.

## Application/API

- `packages/database/src/catalog.ts` implements create/update/publish/unpublish,
  option/Variant creation, category create/move, list/workspace/public reads.
- `apps/api/src/routes/catalog.ts` protects Admin commands with Catalog
  capabilities and exposes public Storefront reads.
- Catalog import exists through Admin operations/worker flow.

## Admin and Storefront

- `/products` renders `CatalogConsole`: Product list, draft creation, Product
  Type creation, option/value and single-Variant creation, publication action,
  and links to Media/Sizing/Pricing/Inventory.
- Public pages use Catalog/Storefront read models for browse, search, and PDP.

## Tests

- PostgreSQL Catalog invariant tests cover drafts, variants, publication,
  audit/outbox, stale updates, category cycles, and public isolation.
- API security tests cover hostile-origin rejection.
- No focused Catalog Admin interaction/browser suite exists yet.
