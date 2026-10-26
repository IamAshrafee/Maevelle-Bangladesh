# Fit & Sizing — Owner Guide

Maevelle Fit & Sizing connects reusable, manually entered customer guides to
Products without turning technical sizing setup into an everyday requirement.

The normal workflow is:

1. create or reuse a Fit & Size Guide;
2. enter authentic measurements;
3. preview and publish it;
4. connect it through a primary Category, a direct Product choice, or a reviewed
   Supply purchase; and
5. resolve any mismatch shown in **Needs Attention**.

## What belongs here

Use Fit & Sizing for selectable apparel or footwear sizes and for wearable fit
guidance such as head circumference, wrist fit, adjustable waist range, or
chain length.

Ordinary Product facts such as mug capacity, bag dimensions, clip width, or
earring drop belong in Product specifications instead.

## Create a guide

Open **Sizing → Guides** and choose **Create Guide** or a structural preset.
Presets provide a useful starting row structure; they never invent supplier or
Product measurements.

Choose:

- a customer-facing guide name;
- the guide type;
- what the measurements describe: the customer's body, the garment, or the
  wearable Product;
- the technical domain and optional standard under Advanced setup; and
- an optional internal description.

In the guide workspace, add only the measurement columns the guide needs. Column
labels can be renamed for customers, and removing a column also removes its
working values after confirmation. Type exact values, ranges such as `56-58`, or
deliberate approximations such as `~110` directly into the grid. Tab moves across
cells, Enter moves down, and changes save automatically. Rectangular spreadsheet
paste and CSV import/export are available for larger matrices.

Add only guidance you can support: fit notes, general measuring instructions,
and measurement-specific instructions. **Customer preview** uses the same data
shape and renderer as the Storefront.

## Publish safely

Customers continue seeing the current published guide while working changes are
edited. Choose **Review & publish** to see:

- affected Products and Category defaults;
- added, removed, and changed rows;
- guidance changes; and
- Product-size conflicts the publication will create.

The reviewed impact is version-bound. If the guide or its assignments change,
Maevelle requires a fresh review before publication.

Published versions are immutable. Later editing creates or resumes working
changes; publishing them creates the next customer-visible version.

## Connect guides to Products

### Primary Category default

Open **Sizing → Assignments**. Select a published guide for a Category, review
the impact, then apply it. Only a Product's primary Category participates in
inheritance. Direct assignments and explicit **No customer guide** decisions
remain unchanged.

### Product choice

On Product create or edit, find **Customer guide source**. On Product Details,
choose **Change guide** to review the exact before/after Storefront source and
size-match impact before applying it:

- **Use primary Category guide** — follow the current published Category
  default;
- **Use [guide]** — create a direct Product override; or
- **No customer guide** — record the required reason.

Product Details shows the effective customer outcome first, including whether
it came from the Product, Category, or a reviewed Supply purchase. It also shows
how many purchasable Product sizes match the guide.

### Supply purchase review

On a Purchase, open **Fit evidence**. Decisions are made once per Product even
when the Purchase contains several Variant lines. You can keep the current
guide, retain supplier evidence only, or deliberately apply another published
guide to the Product. Supplier evidence never changes Storefront truth by
itself, and the latest Purchase never wins automatically.

## Product sizes versus guide rows

Catalog Product options and Variants remain the authority for what customers
can buy. A guide explains those choices; it does not create inventory.

Maevelle matches a Product size to a guide row by its linked standard definition
first, then by an unambiguous normalized label. It does not silently make fuzzy
guesses. Product Details and Needs Attention report missing, extra, or ambiguous
matches.

## Needs Attention

Open **Sizing → Attention** for customer-facing exceptions such as:

- a Product with selectable sizes but no explicit guide outcome;
- an unavailable effective guide;
- unmatched Product sizes or unsold guide rows;
- unpublished changes on a guide used by active Products;
- an unavailable Category default; or
- conflicting Supply-purchase evidence.

Each item links to the Product, guide, Category assignment, or Purchase that can
resolve it.

## What customers see

When a Product has an effective active published guide, the Product page shows
**Size & Fit Guide**. The dialog renders only that guide's authentic name,
measurement basis, rows, columns, notes, and instructions. A unit switch appears
only for supported conversions. A row can select a Product size only when it is
mapped to a real Product option.

When no effective guide exists, Maevelle shows no generic fallback chart. The
old simulated Fit Finder and invented model, stretch, shrinkage, and stylist
claims are intentionally removed.

## Advanced Settings

Domains, measurement vocabulary, size systems, canonical definitions, and
mapping diagnostics are available under **Sizing → Settings**. Owners normally
configure these foundations occasionally; everyday guide authoring and Product
assignment do not require working through them.

## Core rules

- Reuse a shared guide when Products genuinely use the same measurements.
- Use a direct Product guide only when it intentionally differs from Category
  inheritance.
- Record a No-guide reason instead of silently treating missing guidance as
  complete.
- Never publish supplier, sample, or assumed values as authentic Product truth.
- Archive unused foundations; do not rewrite published history.

The detailed product and engineering contract is in
[`docs/domains/sizing/sizing-product-blueprint.md`](../docs/domains/sizing/sizing-product-blueprint.md).
