# Product Admin Workflow

**Status:** Current product behavior

## Operator mental model

The Admin has three distinct product surfaces. “Product workspace” is not a
user-facing concept.

- **Products** is the searchable, filterable operating list. It is used to find
  products, understand readiness and publication state, and start creation.
- **Product details** is the organized read view for one product. It is the
  default destination after creation and the place to review the whole product,
  manage variants and media, archive or restore it, and begin editing.
- **Product editor** is the task-focused form for setup and later changes. The
  same sections and validation rules are used for first-time setup and editing.

## Creation and editing flow

Product creation is a page-based guided flow because a publishable product has
too much structure for a modal. The operator can move between these sections:

1. **Overview** — product identity, handle, description and publication state.
2. **Organization** — product type, vendor, categories, collections, tags and
   occasions.
3. **Variants** — option axes and values, generated sellable combinations,
   SKU/barcode, price, physical data, status, colors and normalized sizes.
4. **Media** — multiple uploads or library reuse, gallery placement, role,
   visibility, ordering and a primary image for each gallery scope.
5. **Content** — structured information groups, specifications, FAQs and SEO.
6. **Review** — authoritative readiness checks and the draft/publish decision.

The product is created as a draft after the first step, so progress is durable.
Operators may leave at any point and resume from the details page. The final
review may keep the product as a draft or publish it when blocking readiness
checks pass. Concurrent updates use the existing version token and surface a
merge choice instead of silently overwriting another operator’s work.

## Variant model

A variant is the sellable and inventory-addressable unit. Option axes (for
example Color and Size) define the variant matrix, and option values define each
combination. Matrix generation is atomic and rejects duplicate combinations,
duplicate SKUs, invalid option selections and stale updates.

Colors are reusable catalog records. A variant may have one primary color plus
additional associated colors for filtering and merchandising. Size option
values may link to normalized sizing definitions rather than relying only on
free-form labels.

## Gallery behavior

Media placements can belong to the whole product, one option value (normally a
color), or one exact variant. Every scope has independent ordering and at most
one primary image. On the storefront, the selected exact variant gallery wins;
otherwise its selected option-value gallery is used, followed by the general
product gallery. This makes a color selection switch to that color’s images
without duplicating the underlying media asset.

## Publication readiness

Readiness is calculated by the server, not inferred only from visible form
fields. Blocking checks protect required identity, organization, sellable
variant, SKU and price invariants. Operational recommendations such as adding
public media or available inventory remain visible as warnings when they are
not legitimate publication blockers for the business.
