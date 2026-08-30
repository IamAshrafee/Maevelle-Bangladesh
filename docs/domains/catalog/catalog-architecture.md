# Maevelle Ecommerce — Catalog & Product Architecture

**Document:** `docs/domains/catalog/catalog-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `concept-clarification.md`, `requirements.md`, `scope.md`

The current Admin operating model is defined in
[`product-admin-workflow.md`](product-admin-workflow.md). It supersedes older
mockups or terminology that describe a user-facing "Product workspace."

---

# 1. Purpose

The Catalog domain defines **what the business sells and how those products are represented**.

It must support Maevelle's current fashion requirements while remaining flexible enough for businesses selling:

- dresses;
- shoes;
- jewelry;
- bags;
- cosmetics;
- accessories;
- electronics;
- furniture;
- home products;
- arbitrary future physical products.

The architecture must not be based around assumptions such as:

```text
Every product has:
Color + Size
```

Instead:

```text
A Product may define whatever characteristics
are appropriate for that Product Type.
```

Color and Size are extremely important first-class experiences for Maevelle, but they are implementations of broader catalog concepts.

---

# 2. Catalog Domain Responsibilities

The Catalog domain owns concepts related to defining, describing, organizing and presenting sellable products.

Conceptually:

```text
Catalog
│
├── Product Types
├── Products
├── Product Options
├── Option Values
├── Attributes
├── Attribute Values
├── Variants
├── SKUs
│
├── Classification
│   ├── Categories
│   ├── Collections
│   ├── Tags
│   └── Occasions / Events
│
├── Color Vocabulary
│
├── Product Information
│   ├── Description
│   ├── Information Groups
│   ├── Specifications
│   └── FAQs
│
├── Publication
├── SEO
└── Relationships to
    ├── Sizing
    ├── Media
    ├── Pricing
    ├── Inventory
    ├── Search
    ├── Reviews
    └── Procurement
```

The Catalog domain **does not itself own**:

```text
Inventory quantities
Warehouse movements
Orders
Discount calculations
Customer carts
Procurement transactions
Shipment costs
Review moderation workflow
Search-engine indexes
```

It provides the product identities that those domains reference.

---

# 3. Research Direction

The domain architecture is informed by patterns used in mature commerce platforms without copying their implementations.

Shopify models a product with options and variants, where each variant represents a particular combination of option values such as `Red / Small`.

Medusa likewise describes product options such as Color and Size as the values that differentiate variants and treats the variant as the saleable form of the product.

Saleor separates reusable attributes from Product Types; a Product Type defines which attributes are available to products and variants of that type.

These patterns strongly support separating:

```text
Product
Product Type
Option
Attribute
Variant
```

rather than placing arbitrary columns directly on `Product`.

---

# 4. Fundamental Catalog Vocabulary

The following terminology becomes official project terminology.

---

## 4.1 Product

A **Product** represents the overall commercial concept presented to a customer.

Example:

```text
Maevelle Floral Summer Dress
```

The product contains shared information such as:

```text
Title
Description
Category
Product Type
Specifications
FAQ
SEO
General Media
Tags
Occasions
```

The Product itself is generally **not the exact inventory unit being sold** when variants exist.

---

# 5. Product Variant

A **Variant** is a specific sellable configuration of a Product.

Example:

```text
Product:
Maevelle Floral Summer Dress

Options:
Color
Size

Variants:

Red / S
Red / M
Red / L
Black / S
Black / M
Black / L
```

Each variant can independently have operational information such as:

```text
SKU
Barcode
Price relationship
Inventory
Weight
Dimensions
Status
Variant Media
Procurement references
```

This approach follows the same broad variant concept used by Shopify, Saleor and Medusa.

---

# 6. Product Type

A **Product Type** defines the reusable structural template for a family of similar products.

Examples:

```text
Dress
Shoe
Handbag
Ring
Cosmetic
Watch
Furniture
Generic Physical Product
```

A Product Type answers questions such as:

```text
Which descriptive attributes are available?

Which attributes are required?

Which attributes may define variants?

Does this product type normally use sizing?

Which measurements are relevant?

Which fields should appear in the product editor?

Which storefront filters may be relevant?
```

Saleor uses a similar Product Type concept where types define which attributes are available to products and variants.

### Example

```text
Product Type: Dress

Product-Level Attributes
├── Material
├── Pattern
├── Sleeve Style
├── Country of Origin
└── Care Instructions

Variant-Defining Options
├── Color
└── Size

Optional Variant Attributes
├── Weight
└── Manufacturing Code
```

Another product type:

```text
Product Type: Handbag

Product Attributes
├── Material
├── Closure Type
├── Strap Type
└── Water Resistant

Possible Variant Options
└── Color
```

And:

```text
Product Type: Ring

Product Attributes
├── Material
├── Stone Type
└── Plating

Variant Options
├── Size
└── Color
```

---

# 7. Why Product Type Matters

Without Product Types, every product editor eventually becomes one enormous form containing fields for every possible business.

Example of a bad architecture:

```text
Product

shoe_size
dress_length
ring_size
battery_capacity
screen_size
fabric
skin_type
storage_capacity
...
```

Instead:

```text
Product
    ↓
Product Type
    ↓
Relevant Attributes
```

This keeps the platform generic without making the dashboard chaotic.

---

# 8. Product Type Is Not Category

This distinction is mandatory.

For example:

```text
Product Type:
Dress

Category:
Women
  → Clothing
    → Dresses
      → Party Dresses

Collection:
Eid Collection 2027

Occasion:
Wedding
Party
Eid
```

These are different concepts.

Product Type controls **data structure**.

Category controls **catalog navigation/classification**.

Collection controls **merchandising grouping**.

Occasion controls **use-case/event discovery**.

Tag provides **flexible labeling**.

They must not be collapsed into one feature.

---

# 9. Attribute

An **Attribute** represents structured information describing a product or variant.

Examples:

```text
Material
Pattern
Country of Origin
Water Resistance
Heel Height
Fabric Weight
Stone Type
Battery Capacity
Gender
Fit
```

Attributes should be reusable definitions rather than arbitrary text fields recreated for every product.

Saleor similarly treats attributes as reusable fields assignable to product or variant types.

---

# 10. Attribute Definition

An Attribute definition should conceptually include:

```text
Name
Internal Code / Slug
Description

Value Type
Required / Optional

Product-Level / Variant-Level eligibility

Searchable?
Filterable?
Storefront Visible?
Internal Only?

Reusable predefined choices?
Allow custom value?

Unit information where appropriate

Ordering
Status
```

Exact persistence will be decided during schema design.

---

# 11. Attribute Data Types

The architecture should support structured data types instead of storing everything as strings.

Potential types include:

```text
Text
Long Text
Integer
Decimal
Boolean
Single Select
Multi Select
Measurement
Date
Reference
Color Reference
Possibly File/Asset Reference
```

Shopify's extensible metafield system similarly uses typed definitions and validation rather than treating all extension data as untyped text.

Not all types need to be implemented immediately.

But the architecture must avoid:

```text
attribute_value VARCHAR for everything
```

becoming an irreversible assumption.

---

# 12. Product-Level vs Variant-Level Attributes

Attributes may belong at different levels.

Example:

```text
Product:
Cotton Casual Shirt

Product Attributes:
Material = Cotton
Pattern = Solid
Fit = Regular
```

while:

```text
Variant:
Blue / XL

Variant Attributes:
Manufacturing Batch = B1034
Country Code = CN
```

Not every attribute describing a variant necessarily needs to be customer selectable.

That produces another important distinction:

```text
Variant Attribute
≠
Variant Option
```

---

# 13. Product Option

A **Product Option** is a characteristic customers use to choose between sellable variants.

Examples:

```text
Color
Size
Storage
Material Finish
Pack Size
Length
```

Options are variant-defining.

Medusa describes options such as Size and Color as the attributes that define a product's different variants.

---

# 14. Option Value

Each Option has values.

Example:

```text
Option: Color

Values:
Red
Black
White
Blue
```

and:

```text
Option: Size

Values:
S
M
L
XL
```

Variant:

```text
Color = Red
Size = M
```

---

# 15. Attribute vs Option

This distinction is critical.

### Attribute

Describes something.

```text
Material = Cotton
Sleeve Type = Full Sleeve
Country of Origin = China
```

### Option

Selects what exact version the customer wants.

```text
Color = Red
Size = M
```

Sometimes the same underlying reusable definition can participate in both contexts.

For example:

```text
Color
```

may be an attribute vocabulary and also be used as a variant-selection option.

The architecture should support reuse without confusing the two business meanings.

---

# 16. Option Ordering

Option order must be configurable.

Example:

```text
1. Color
2. Size
```

rather than:

```text
1. Size
2. Color
```

The storefront can therefore consistently present:

```text
Choose Color
Choose Size
```

Option-value order also matters.

Sizes should display:

```text
XS
S
M
L
XL
XXL
```

not alphabetical order:

```text
L
M
S
XL
XS
XXL
```

---

# 17. Variant Combination Rule

A Variant corresponds to one unique combination of the Product's variant-defining option values.

Example:

```text
Color = Red
Size = M
```

There must not be two active variants of the same product representing the same exact option combination accidentally.

Conceptual invariant:

```text
(Product + Option Combination) = unique
```

---

# 18. Variant Generation

The admin should not require manually constructing hundreds of obvious combinations one at a time.

Example:

```text
Colors:
Red
Blue
Black

Sizes:
S
M
L
XL
```

The system may offer generation of:

```text
3 × 4 = 12 variants
```

However, variant generation must not assume that **every Cartesian combination is valid**.

Example:

```text
Red:
S
M
L

Blue:
S
M

Black:
M
L
XL
```

Therefore the builder must support:

```text
Generate combinations
        ↓
Review
        ↓
Remove invalid combinations
        ↓
Create variants
```

or equivalent UX.

---

# 19. Variant Explosion Protection

Because the platform allows flexible options, admins could accidentally create enormous variant combinations.

Example:

```text
20 colors
×
20 sizes
×
10 materials
×
10 lengths

= 40,000 variants
```

The system should therefore:

```text
Preview combination count
Warn about unusually large sets
Require explicit confirmation
Provide practical configurable limits
```

The domain itself should not depend on another platform's arbitrary variant limit.

---

# 20. Product With No Meaningful Options

Some products have no meaningful customer-selectable variants.

Example:

```text
Decorative Hair Clip
```

The system should not force users to invent:

```text
Size = Default
Color = Default
```

in the dashboard.

From an operational architecture perspective, however, having one internal sellable variant/item can simplify:

```text
Inventory
Pricing
Orders
Procurement
SKU
```

Therefore our likely model is:

```text
Product
   ↓
At least one internal sellable Variant
```

while the storefront hides meaningless option selection.

This decision should be confirmed during schema design.

---

# 21. SKU

SKU belongs primarily to the sellable Variant.

Example:

```text
Product:
Maevelle Floral Dress

Variant:
Red / M

SKU:
MVD-RED-M
```

---

# 22. SKU Strategy

V1 should support:

```text
Manual SKU entry
+
Automatic SKU generation
```

where useful.

SKU should generally be unique within the business/organization.

The system should prevent accidental duplicates unless future integration requirements demonstrate a valid reason otherwise.

---

# 23. SKU Is Not Product ID

Never expose the internal database ID as the operational SKU.

These serve different purposes:

```text
Internal ID
→ technical identity

SKU
→ business/inventory identity
```

Changing a SKU should not change the underlying record identity.

---

# 24. Barcode Identifiers

Variants should be capable of storing optional identifiers such as:

```text
Barcode
EAN
UPC
Other business-specific identifiers
```

Medusa's current variant management similarly exposes SKU and common barcode identifiers separately.

V1 does not require sophisticated barcode warehouse workflows, but the catalog should not block them.

---

# 25. Categories

Category is the primary hierarchical classification and storefront-navigation structure.

Example:

```text
Women
└── Clothing
    ├── Dresses
    │   ├── Casual Dresses
    │   └── Party Dresses
    │
    └── Traditional
        ├── Saree
        └── Salwar Kameez
```

Tree-structured categories are also used by established commerce platforms for catalog organization/navigation.

---

# 26. Arbitrary Category Depth

The platform must not implement fixed columns such as:

```text
category
subcategory
subsubcategory
```

Instead:

```text
Category
    parent_category
```

conceptually allows arbitrary hierarchy.

The exact database implementation will be designed later.

---

# 27. Category State

Each category has its configured state:

```text
Active
Inactive
```

But storefront visibility should calculate an **effective state**.

Example:

```text
Women                   ACTIVE
└── Clothing             INACTIVE
    └── Dresses          ACTIVE
```

`Dresses` remains configured as ACTIVE.

But:

```text
Effective Visibility = INACTIVE
Reason = ANCESTOR_INACTIVE
```

---

# 28. Why We Preserve Child State

When `Clothing` is reactivated:

```text
Dresses
```

can automatically become effectively active again.

We should not destroy each descendant's explicit preference every time a parent changes.

This also allows an intentionally disabled child:

```text
Women                   ACTIVE
└── Clothing             ACTIVE
    └── Old Collection   INACTIVE
```

to remain disabled.

---

# 29. Category Move

Admins must be able to move categories.

Example:

```text
Before:

Accessories
└── Hair Clips
```

to:

```text
Women
└── Accessories
    └── Hair Clips
```

The system must validate against cycles.

Invalid:

```text
A
└── B
    └── C

Move A underneath C
```

This must be rejected.

---

# 30. Category Delete

Categories should generally not be destructively deleted when that would create unintended product/classification damage.

Possible operations:

```text
Deactivate
Archive
Move Products
Move Children
Delete when safe
```

The dashboard should explain consequences before destructive operations.

---

# 31. Primary Category vs Multiple Categories

A Product should be capable of appearing in multiple categories.

Example:

```text
Floral Party Dress
```

could appear in:

```text
Women → Dresses
Women → Party Wear
New Arrivals
```

However, breadcrumbs and canonical navigation may require one preferred/primary category context.

Therefore we should support the concept of:

```text
Product Categories
+
Optional Primary Category
```

The exact SEO/navigation behavior will be designed with storefront architecture.

---

# 32. Collections

We should add **Collection** as a first-class concept.

Collections are merchandising groupings, not taxonomy hierarchy.

Shopify describes Collections as groups of products merchants use to organize their catalog for browsing.

Examples:

```text
New Arrivals
Best Sellers
Eid Collection 2027
Summer Collection
Under ৳999
Editor's Picks
Clearance
```

---

# 33. Category vs Collection

### Category

Usually stable classification.

```text
Women
→ Dresses
→ Party Dresses
```

### Collection

Usually merchandising-focused.

```text
Eid Collection 2027
Summer Essentials
New This Week
```

Products may appear in many collections without altering category hierarchy.

---

# 34. Collection Membership

V1 can begin with:

```text
Manual product assignment
```

and optionally simple rule-based collections if scope allows.

Future:

```text
Price < X
Tag contains Y
Attribute = Z
Published within 30 days
Inventory available
```

Shopify supports rule-driven automated collection concepts, which confirms this is a useful future evolution path.

The architecture should therefore not assume collection membership must always remain manual.

---

# 35. Tags

Tags are flexible labels.

Examples:

```text
Premium
Imported
Trending
Limited
Influencer Pick
Clearance Candidate
```

Tags should be lightweight.

They are useful for:

```text
Internal organization
Search
Filtering
Automation
Merchandising
```

where appropriate.

---

# 36. Tags Are Not the Answer to Everything

A weak catalog often turns every concept into a tag:

```text
tag = red
tag = cotton
tag = wedding
tag = dress
tag = medium
```

This destroys structured meaning.

Instead:

```text
Color      → structured Color
Material   → Attribute
Wedding    → Occasion
Dress      → Product Type / Category
Medium     → Size
Premium    → Tag
```

Tags should handle genuinely flexible labels.

---

# 37. Occasion / Event

Your original requirement deserves a dedicated concept rather than only generic tags.

Example:

```text
Wedding
Eid
Party
Office
Casual
Beach
Birthday
Festival
Formal
Travel
```

This concept represents:

> **What situation is this product suitable for?**

---

# 38. Occasion Should Be Controlled Vocabulary

Instead of allowing every admin to type:

```text
Wedding
wedding
Wedding Event
For Wedding
Weddings
```

we should create reusable Occasion records.

Example:

```text
Occasion:
Wedding

Slug:
wedding
```

Products reference that concept.

This dramatically improves:

```text
Search
Filtering
Analytics
Consistency
Storefront navigation
```

---

# 39. Event vs Occasion

There may eventually be two concepts:

### Occasion

Reusable suitability.

```text
Wedding
Party
Office
Casual
```

### Campaign / Seasonal Event

Time/context-specific merchandising.

```text
Eid-ul-Fitr 2027
Valentine's 2027
Winter Sale 2027
```

V1 does not necessarily need both as full modules.

A seasonal event can initially be represented using **Collections**.

Thus:

```text
Wedding
→ Occasion

Eid Collection 2027
→ Collection
```

This avoids unnecessary duplication.

---

# 40. Color Architecture

Color requires more specialized handling than a normal text option.

Your requirement includes:

```text
Primary Color
+
Associated / Secondary Search Colors
```

---

# 41. Color Definition

We should maintain a reusable Color vocabulary.

Example:

```text
Color:
Red

Display Name:
Red

Swatch:
#C83232
```

Other examples:

```text
Black
White
Beige
Cream
Maroon
Navy
Sky Blue
Rose Gold
Multicolor
```

---

# 42. Color Value May Need More Than HEX

A HEX value works for ordinary colors.

But future requirements may include:

```text
Pattern
Gradient
Metallic
Texture
Multicolor
Fabric Swatch
```

Therefore Color visual representation should be capable of supporting:

```text
Solid Swatch
or
Asset/Image Swatch
```

without redesign.

---

# 43. Primary Color

For a color-based variant:

```text
Variant:
Red / M
```

the primary color is:

```text
Red
```

This controls things like:

```text
Variant selector
Primary filtering
Variant identity
Default visual label
Potential URL state
```

---

# 44. Associated Colors

The variant may additionally contain meaningful secondary colors.

Example:

```text
Primary:
Red

Associated:
White
Gold
```

This means:

> The variant is marketed as Red, but searching/filtering White or Gold may reasonably discover it.

---

# 45. Associated Color Is Search Metadata

Associated colors should **not create variants**.

Incorrect:

```text
Red/White
Red/Gold
```

unless those are actually different sellable products.

Correct:

```text
Variant:
Primary Color = Red

Search Colors:
White
Gold
```

---

# 46. Multicolor Products

Some products genuinely have no single dominant color.

We should support:

```text
Primary Color = Multicolor
Associated Colors =
Red
Blue
Yellow
White
```

The visual color system should not force misleading primary colors.

---

# 47. Product Media Relationship

The Catalog domain does not own media storage, but it defines how products reference media assets.

Conceptually:

```text
Product
├── General Media
│   ├── Image A
│   └── Image B
│
└── Variant Media
    ├── Red
    │   ├── Red Front
    │   ├── Red Back
    │   └── Red Model
    │
    └── Blue
        ├── Blue Front
        ├── Blue Back
        └── Blue Model
```

---

# 48. Color-Based Gallery Switching

Storefront behavior:

```text
Customer selects:
Blue
      ↓
Determine selected Blue variant context
      ↓
Find Blue-associated media group
      ↓
Display Blue gallery
```

If no dedicated media exists:

```text
Variant Media Missing
        ↓
Fall back to Product Media
```

---

# 49. Media Assignment Should Not Be Limited to Individual SKU

Suppose:

```text
Red / S
Red / M
Red / L
```

All share exactly the same photographs.

Requiring the merchant to attach the same gallery separately to three variants is poor UX.

Therefore media architecture should support some concept equivalent to:

```text
Media Association
→ Option Value: Color = Red
```

or provide efficient inheritance/group assignment.

The exact relationship will be finalized in the Media domain.

---

# 50. Product Information Architecture

Product information should be structured into different concepts.

A product can include:

```text
Title
Short Summary
Description
Structured Information Groups
FAQ
Attributes
Sizing Information
```

We should not force all information into one rich-text description.

---

# 51. Product Description

The main description is editorial content.

Example:

```text
A lightweight summer dress designed for...
```

It may use limited structured rich text.

It should not become the storage mechanism for:

```text
Material
Size
Color
Weight
Country
```

when those values matter structurally.

---

# 52. Information Groups

Your requested key/value groups become a first-class structured product-information feature.

Example:

```text
Fabric Details

Material        Cotton
Fabric Type     Soft Woven
Transparency    No
Stretch         Low
```

Another group:

```text
Care Instructions

Wash            Hand wash
Water Temp      Cold
Iron            Low heat
Bleach          No
```

---

# 53. Information Group Structure

Conceptually:

```text
Information Group
├── Title
├── Order
└── Items
    ├── Label
    ├── Value
    └── Order
```

A Product may contain multiple groups.

---

# 54. Attribute vs Information Group

We must avoid confusing these.

### Attribute

Structured catalog data.

Useful for:

```text
Search
Filtering
Rules
Product Type
Analytics
```

### Information Group

Display-oriented product information.

Useful when:

```text
Merchants want organized customer-readable details
that do not need catalog-wide semantic behavior.
```

Example:

`Material = Cotton` should probably be an Attribute.

`Package Includes = 1 Dress + 1 Belt` may simply be an information entry.

---

# 55. Avoid Duplicate Truth

If an Attribute already defines:

```text
Material = Cotton
```

we should avoid separately storing:

```text
Information Group:
Material = Cotton
```

when possible.

The storefront should be capable of presenting structured attributes inside appropriate groups/templates.

This prevents contradictory data:

```text
Attribute:
Material = Cotton

Description Table:
Material = Polyester
```

---

# 56. Product FAQ

FAQ should be structured.

```text
FAQ
├── Question
├── Answer
└── Sort Order
```

A product supports multiple entries.

---

# 57. FAQ Future Reuse

V1 can support product-specific FAQs.

Later we may support:

```text
Reusable FAQ Templates
```

Example:

```text
Jewelry Care FAQ
Return FAQ
Fabric Care FAQ
```

A product could inherit/reuse them.

The initial architecture should avoid making future reuse impossible, but we do not need to build a complex inheritance engine now.

---

# 58. Product Title

Product title is customer-facing.

Examples:

```text
Floral Puff Sleeve Midi Dress
Classic Leather Crossbody Bag
Minimal Pearl Drop Earrings
```

It is not the SKU.

It is not necessarily unique.

---

# 59. Internal Product Name

We should consider an optional separate internal/internal-reference name.

Example:

```text
Customer Title:
Floral Puff Sleeve Midi Dress

Internal Name:
CN-AUG26 Floral Dress Batch 3
```

This can be useful when sourcing names differ from storefront merchandising names.

V1 implementation can make it optional.

---

# 60. Slug / URL Identity

A published Product needs a stable storefront slug.

Example:

```text
/products/floral-puff-sleeve-midi-dress
```

Slug must be:

```text
Unique within its routing scope
SEO appropriate
Editable under controlled rules
```

Historical slug redirect behavior belongs to storefront/SEO architecture.

---

# 61. Product Status Lifecycle

At minimum:

```text
DRAFT
ACTIVE / PUBLISHED
UNPUBLISHED
ARCHIVED
```

These states have different meanings.

---

# 62. Draft

```text
DRAFT
```

means:

- product is being prepared;
- it may be incomplete;
- it does not appear publicly;
- required storefront publication validation may not yet pass.

---

# 63. Published

```text
PUBLISHED
```

means:

- the merchant intends the product to appear;
- required publication validation has passed.

But publication does **not automatically guarantee purchasability**.

---

# 64. Unpublished

```text
UNPUBLISHED
```

means:

- intentionally removed from storefront;
- product remains operationally available in dashboard/history;
- existing order references remain intact.

---

# 65. Archived

```text
ARCHIVED
```

means:

- product is no longer part of normal active catalog operations;
- historical data must remain;
- it should disappear from normal product-management views unless requested.

---

# 66. Publication vs Availability

This distinction is extremely important.

A Product can be:

```text
Published
```

but not purchasable because:

```text
All variants inactive
No sellable inventory
Required category unavailable
Pricing invalid
Business/store unavailable
```

Therefore:

```text
Publication State
≠
Availability State
```

---

# 67. Effective Storefront Visibility

Product visibility should be derived from several conditions.

Conceptually:

```text
Product configured as Published?
        ↓
Required classification effectively active?
        ↓
Product valid?
        ↓
Store/channel eligibility?
        ↓
VISIBLE
```

Inventory should usually influence **purchasability**, not necessarily whether an out-of-stock product can be viewed.

---

# 68. Product Availability

Potential storefront statuses:

```text
Available
Low Stock
Out of Stock
Unavailable
Coming Soon
```

Not all need implementation in V1.

But availability should be derived from operational systems rather than manually duplicated everywhere.

---

# 69. Variant Status

A Product may remain active while one Variant is unavailable.

Example:

```text
Red / S        ACTIVE
Red / M        ACTIVE
Red / L        INACTIVE
Blue / S       ACTIVE
```

Variant disabling should not require deleting historical data.

---

# 70. Variant Deletion

A never-used variant may potentially be safely deleted.

A variant referenced by:

```text
Orders
Inventory Movements
Purchases
Shipments
Returns
```

should normally be archived/deactivated rather than physically destroyed.

---

# 71. Product Deletion

Same principle:

```text
Historical commercial data
must survive current catalog changes.
```

Therefore product deletion needs strong safeguards.

Normal operation should favor:

```text
Archive
```

over destructive deletion.

---

# 72. Pricing Boundary

Pricing deserves its own explicit boundary.

Conceptually:

```text
Catalog
defines:
What is being sold?

Pricing
defines:
At what price?
```

Medusa similarly separates its Product module from its Pricing module and links variants to pricing information rather than making pricing the responsibility of the product model itself.

We do not need separate services.

This is a **domain/module separation** inside the modular monolith.

---

# 73. V1 Pricing Relationship

A Variant must be able to obtain:

```text
Regular/Base Selling Price
```

and potentially:

```text
Compare-at Price
Sale Price
Currency-Specific Price
```

depending on final Pricing-domain design.

Product cards may display:

```text
৳900
```

or:

```text
From ৳900
```

based on variant pricing.

---

# 74. Promotions Do Not Rewrite Product Price

Coupon or campaign discount logic belongs to Promotions/Pricing.

Example:

```text
Variant Price:
৳1,200

Coupon:
10% OFF
```

should not mutate the stored catalog price to:

```text
৳1,080
```

The checkout/pricing engine calculates the applicable result.

---

# 75. Cost Price Is Not Selling Price

We must also avoid treating:

```text
Purchase Cost
Landed Cost
Selling Price
```

as the same thing.

Relationships:

```text
Procurement
→ Supplier Cost

Landed Cost
→ Actual Acquisition Cost

Pricing
→ Customer Selling Price
```

Catalog connects these concepts through Product/Variant identity but should not collapse them.

---

# 76. Inventory Boundary

Inventory belongs to the sellable unit.

Typically:

```text
Variant
   ↓
Inventory Item
   ↓
Inventory Levels
   ↓
Warehouse
```

A Product itself should not contain a global field such as:

```text
stock = 24
```

when variants exist.

---

# 77. Product Aggregate Inventory

The dashboard may display:

```text
Product Total Stock = 142
```

but that is a **derived aggregate**.

Example:

```text
Red / S      10
Red / M      20
Red / L       8
Blue / S     15
...

Total       142
```

The aggregate must not become the source of truth.

---

# 78. Procurement Boundary

Purchases should reference the sellable/product variant identity.

Example:

```text
Supplier Purchase

Red / M    20 units @ ¥28
Red / L    20 units @ ¥30
```

This makes procurement costing specific enough for real landed-cost calculations.

---

# 79. Supplier Catalog Mapping

Supplier names may differ from storefront products.

Example:

```text
Maevelle Product:
Floral Puff Sleeve Midi Dress

Supplier Listing:
Women New Summer French Floral Dress 8821
```

Therefore supplier-related product references belong to Procurement/Supplier Catalog relationships, rather than forcing customer-facing titles to match supplier titles.

---

# 80. Search Boundary

Search should consume catalog information but not become the authoritative store.

Conceptually:

```text
Catalog Database
      ↓
Search Projection / Index
      ↓
Search Engine
```

If a dedicated search service is introduced later, deleting/rebuilding the index must not destroy product truth.

---

# 81. Searchable Product Information

Potential indexed data:

```text
Product Title
Internal keywords
Description
Category
Collection
Tags
Occasion
SKU
Attributes
Primary Color
Associated Colors
Product Type
```

Exact weighting will be defined in Search architecture.

---

# 82. Search Synonyms

Future search may need:

```text
Saree ↔ Sari
T-shirt ↔ Tee
Maroon ↔ Dark Red
Sneaker ↔ Trainer
```

Therefore catalog identifiers and display labels should be structured enough to support a synonym/search layer later.

---

# 83. SEO Boundary

Product should expose structured SEO data:

```text
SEO Title
SEO Description
Slug
Indexability override where appropriate
```

Storefront infrastructure handles actual metadata generation, structured data, canonicals and sitemap behavior.

---

# 84. Social Sharing

A shared product URL should resolve to meaningful storefront metadata.

Variant selection may eventually be encoded through URL/query state.

Example:

```text
/product/floral-dress?color=red
```

But variants should generally remain under the parent Product detail experience unless a future business reason requires separate pages.

---

# 85. Product Editor Architecture

The Product Editor must not become one 5,000-pixel-long form.

Recommended dashboard structure:

```text
Product Editor
│
├── Overview
├── Organization
├── Options & Variants
├── Pricing
├── Inventory Summary
├── Media
├── Sizing
├── Product Information
├── SEO
└── Advanced
```

The final UI can use:

```text
Sections
Tabs
Side panels
Context drawers
Progressive disclosure
```

according to UX testing.

---

# 86. Product Creation Flow

Recommended initial experience:

```text
Create Product
      ↓
Basic Information
      ↓
Choose Product Type
      ↓
System loads relevant structure
      ↓
Configure Options
      ↓
Generate / Create Variants
      ↓
Set Prices
      ↓
Assign Media
      ↓
Sizing if applicable
      ↓
Organization
      ↓
Information / SEO
      ↓
Save Draft
      ↓
Publication Validation
      ↓
Publish
```

The user must be able to save incomplete work as Draft throughout the process.

---

# 87. Product Type Selection UX

Choosing Product Type should immediately simplify the form.

Example:

```text
Choose:
Dress
```

The product editor knows to show:

```text
Material
Pattern
Fit
Dress-related attributes
Sizing configuration
Color
```

Choose:

```text
Handbag
```

and irrelevant dress-sizing controls should disappear.

This is how the system can remain powerful without appearing cluttered.

---

# 88. Product Type Change

Changing a Product Type after substantial product data exists is dangerous.

Example:

```text
Dress
→
Shoe
```

Potential consequences:

```text
Attributes become invalid
Size model changes
Variant configuration changes
Filters change
```

Therefore Product Type change should:

```text
Show impact preview
Preserve compatible values
Identify incompatible values
Require confirmation
```

For heavily used products, the operation may need stronger restrictions.

---

# 89. Variant Matrix Editor

For products with multiple variants, the dashboard should provide a matrix/bulk experience.

Example:

| Color | Size | SKU    | Price | Stock | Status |
| ----- | ---- | ------ | ----: | ----: | ------ |
| Red   | S    | DR-R-S |  1200 |    10 | Active |
| Red   | M    | DR-R-M |  1200 |     8 | Active |
| Red   | L    | DR-R-L |  1250 |     4 | Active |
| Blue  | S    | DR-B-S |  1200 |     3 | Active |

Users should be able to:

```text
Bulk set price
Bulk set SKU pattern
Activate/deactivate
Select many variants
Edit relevant data efficiently
```

without opening every variant individually.

---

# 90. Variant Detail

A Variant detail/editor can expose advanced information:

```text
Option Values
SKU
Barcode
Pricing
Inventory Summary
Physical Information
Media
Supplier References
Audit History
```

---

# 91. Bulk Product Editing

V1 should support carefully selected bulk catalog operations.

Examples:

```text
Publish
Unpublish
Archive
Assign Category
Assign Collection
Assign Tag
Assign Occasion
Change selected attribute
```

Dangerous bulk operations require preview/confirmation where appropriate.

---

# 92. Product Duplication

Duplication should help merchants create similar products.

Example:

```text
Duplicate Floral Dress
```

Potentially copied:

```text
Product Type
Attributes
Information groups
Options
Size configuration
FAQ
Categories
Tags
```

Potentially **not automatically copied**:

```text
SKU
Inventory
Supplier purchase history
Reviews
SEO slug
Audit history
```

Media-copy behavior should be explicit.

The duplication workflow should show what is copied.

---

# 93. Product Validation

Validation should distinguish:

```text
Draft Validation
```

from:

```text
Publication Validation
```

A draft may temporarily contain incomplete data.

A Product cannot publish if critical requirements are missing.

---

# 94. Example Publication Validation

Potential checks:

```text
Title exists

Product Type exists

At least one sellable variant exists

Required attributes complete

Option combinations valid

Required pricing available

Required storefront media available

Category requirements satisfied

SKU validity satisfied

SEO slug valid
```

Some checks may be warnings rather than blockers.

---

# 95. Warning vs Error

The product editor should distinguish:

### Error

```text
Cannot publish:
No sellable variant exists.
```

### Warning

```text
This product has no SEO description.
```

The system should not block publication for every best-practice recommendation.

---

# 96. Draft Autosave

Product creation may be complex.

The UX should consider:

```text
Explicit Save
+
Safe autosave for appropriate sections
```

or reliable draft persistence.

A connection failure should not cause twenty minutes of product-entry work to disappear.

Exact autosave architecture comes later.

---

# 97. Concurrent Editing

Eventually two staff members may open the same Product.

The system should avoid silent last-write-wins corruption.

At minimum, V1 should detect conflicting updates for important records through:

```text
Version
Updated-at comparison
Optimistic concurrency
```

or equivalent.

Advanced collaborative editing is unnecessary.

---

# 98. Audit Integration

Important catalog events should enter the Audit system.

Examples:

```text
Product created
Product published
Product unpublished
Product archived
Price reference changed
Variant created
Variant deactivated
SKU changed
Product Type changed
Category changed
```

The exact level of field-by-field auditing can vary by sensitivity.

---

# 99. Events from Catalog Domain

The architecture should support internal domain/application events.

Examples:

```text
product.created
product.updated
product.published
product.unpublished

variant.created
variant.updated
variant.archived

category.updated
```

These events can later trigger:

```text
Search re-indexing
Cache invalidation
Notifications
Webhooks
Analytics projections
```

This does not require a distributed event-bus architecture in V1.

Internal application events are sufficient initially.

---

# 100. Product Aggregate Boundary

Product is a natural consistency boundary for certain catalog operations.

Examples:

```text
Product
Options
Option Values
Variants
```

are highly interdependent.

Changing an option may affect multiple variants.

This requires controlled application-level operations rather than allowing unrelated code to update underlying records freely.

---

# 101. Option Change Example

Suppose:

```text
Color:
Red
Blue
```

Variants:

```text
Red / S
Red / M
Blue / S
Blue / M
```

Admin attempts to delete:

```text
Blue
```

The system must understand that this affects:

```text
Blue / S
Blue / M
Variant media
Inventory
Purchases
Historical references
```

Therefore:

```text
Deleting Option Value
```

cannot simply mean:

```sql
DELETE FROM option_value
```

---

# 102. Safe Option Removal

Possible UX:

```text
Remove "Blue"?

2 variants currently use this value.

Blue / S
Blue / M

These variants contain:
Inventory: 14 units
Historical orders: 22

Choose:
Cancel
Deactivate affected variants
...
```

Actual allowed operations depend on domain state.

---

# 103. Variant Option Rename

Renaming:

```text
Dark Red
→
Maroon
```

should generally update the reusable display concept without changing historical order snapshots.

Orders preserve:

```text
What customer purchased at transaction time
```

even when catalog terminology changes later.

---

# 104. Product Snapshot Rule

Catalog entities remain mutable.

Transactions do not.

Therefore an Order Item stores snapshot information such as:

```text
Product ID
Variant ID

Product Title Snapshot
Variant Description Snapshot
SKU Snapshot
Option Snapshot
Price Snapshot
```

This belongs technically in Order architecture, but Catalog must explicitly support it.

---

# 105. Localization Readiness

The platform is not required to support multi-language storefront content immediately.

But key text identifiers should not be architected in a way that makes localization impossible.

Future translatable fields could include:

```text
Product title
Description
Category name
Attribute labels
Option labels
FAQ
SEO content
```

V1 can use a single primary language.

---

# 106. Product Types and Sizing

Product Type should indicate which sizing model is appropriate.

Possible configuration:

```text
Product Type: Dress
Sizing:
Supported

Product Type: Earrings
Sizing:
Optional / None

Product Type: Shoes
Sizing:
Supported
Default Size System:
Footwear
```

But the detailed rules belong in:

```text
docs/domains/sizing/sizing-architecture.md
```

---

# 107. Product Types and Physical Properties

Certain physical information belongs at variant level because it may vary.

Examples:

```text
Weight
Height
Width
Length
```

Medusa also models physical properties such as weight and dimensions on variants.

These values later become useful for:

```text
Shipping
Landed-cost allocation
Warehouse operations
Courier integrations
```

---

# 108. Product Bundle Readiness

V1 does not require a complete bundle/kit system.

But future products may include:

```text
Gift Set

1 × Bag
1 × Wallet
1 × Keychain
```

The Product/Variant architecture should not make bundles impossible.

Medusa currently supports inventory kits/multi-part product configurations, demonstrating that bundle requirements commonly emerge in mature commerce systems.

Detailed bundle design is deferred.

---

# 109. Digital Products

The current Maevelle use case is physical goods.

V1 does not need digital-product fulfillment.

However, Product Type should avoid unnecessary assumptions such as:

```text
every possible future product
must require warehouse stock
```

This is Foundation-only thinking.

No digital-delivery implementation is required now.

---

# 110. Product Type Example — Dress

```text
Product Type
DRESS

Product Attributes
├── Material
├── Pattern
├── Fit
├── Sleeve Type
├── Neckline
├── Length Style
├── Country of Origin
└── Care Type

Variant Options
├── Color
└── Size

Sizing Profile
└── Apparel

Physical Variant Fields
├── Weight
└── Package Dimensions
```

---

# 111. Product Type Example — Shoe

```text
Product Type
SHOE

Product Attributes
├── Upper Material
├── Sole Material
├── Closure
├── Heel Type
└── Gender / Audience if business uses it

Variant Options
├── Color
└── Shoe Size

Sizing Profile
└── Footwear

Physical
├── Weight
├── Length
├── Width
└── Height
```

---

# 112. Product Type Example — Jewelry

```text
Product Type
JEWELRY

Product Attributes
├── Material
├── Plating
├── Stone
└── Finish

Variant Options
├── Color
└── Size where applicable

Sizing
└── Optional depending on subtype
```

---

# 113. Product Type Example — Generic Product

A business should not need a developer whenever it begins selling something unusual.

Therefore:

```text
Generic Physical Product
```

can provide:

```text
Custom attributes
Custom options
Optional sizing
Physical properties
```

Admins can later create specialized Product Types.

---

# 114. Product Type Management

Authorized admins should be able to:

```text
Create Product Type
Rename
Configure attributes
Configure variant options
Configure required fields
Configure sizing behavior
Activate/deactivate
```

Deleting a Product Type already used by products should be restricted.

---

# 115. Reusable Attribute Definitions

Example:

```text
Attribute:
Material

Values:
Cotton
Polyester
Silk
Leather
Synthetic
```

This same Attribute can participate in:

```text
Dress
Bag
Shoe
```

where appropriate.

Saleor similarly permits reusable attributes to be associated with multiple Product Types.

---

# 116. Controlled Choice vs Free Entry

Attributes should configure whether values come from:

```text
Controlled choices
```

or:

```text
Free entry
```

Example:

```text
Material
→ Controlled choice preferred
```

while:

```text
Manufacturer Model Note
→ Free text
```

Controlled values provide much stronger filtering and search consistency.

---

# 117. Extensible Metadata

Not every future piece of application-specific metadata deserves an immediate dedicated table/column.

We may eventually support controlled custom metadata for integrations/extensions.

Shopify and Saleor both expose flexible metadata/extensibility mechanisms around commerce objects.

However:

> Custom metadata must **not** become an excuse to avoid proper domain modeling.

Core concepts such as:

```text
Color
Size
Inventory
Category
Landed Cost
```

must remain explicitly modeled.

---

# 118. Product Relationships

Future merchandising may require:

```text
Related Products
Similar Products
Complete the Look
Accessories
Replacement Product
```

V1 does not require a sophisticated recommendation system.

But a generic Product-to-Product relationship mechanism may eventually be useful.

Do not hard-code one relation called:

```text
related_product
```

without considering typed relationships.

This remains Foundation/Future.

---

# 119. Category-Based Product-Type Guidance

When creating a Product, Category may suggest an appropriate Product Type.

Example:

```text
Category:
Women → Shoes

Suggested Product Type:
Footwear
```

But Category should not necessarily rigidly determine Product Type.

There may be valid exceptions.

---

# 120. Catalog Completeness Indicator

The dashboard can provide helpful completion information.

Example:

```text
Product Readiness

Basic Info             ✓
Variants               ✓
Pricing                ✓
Inventory              ✓
Media                   !
Sizing                  ✓
SEO                     !
```

This should guide users without turning every optional improvement into a publication blocker.

---

# 121. Product List UX

The default Product list should prioritize information needed for daily operations.

Possible columns:

```text
Product
Status
Product Type
Category
Variant Count
Stock Summary
Price / Range
Updated
```

Optional configurable columns can expose more.

---

# 122. Product List Filters

Important filters:

```text
Status
Category
Product Type
Collection
Tag
Occasion
Inventory status
Created date
Updated date
```

Potential future:

```text
Supplier
Warehouse stock
Margin
Incomplete products
```

---

# 123. Saved Views

Examples:

```text
Out of Stock Products
Draft Products
Eid Collection
Needs Images
Recently Added
Low Inventory
```

Saved-view infrastructure belongs to shared dashboard UX but Catalog should expose suitable filter capabilities.

---

# 124. Catalog Permissions

Suggested capability groups:

```text
catalog.products.view
catalog.products.create
catalog.products.edit
catalog.products.archive
catalog.products.publish

catalog.variants.edit

catalog.categories.manage
catalog.collections.manage
catalog.attributes.manage
catalog.product_types.manage
catalog.tags.manage
catalog.occasions.manage
```

Potentially sensitive operations may receive separate permissions.

For example:

```text
catalog.pricing.edit
```

may eventually belong more directly to Pricing permissions.

---

# 125. Catalog API Responsibilities

Potential internal/public API concepts:

```text
Products
Product Types
Variants
Attributes
Options
Categories
Collections
Tags
Occasions
Colors
```

APIs must support appropriate:

```text
Pagination
Filtering
Sorting
Search
Permission enforcement
Validation
```

---

# 126. Storefront Catalog Read Model

The storefront should not necessarily receive raw admin domain structures.

Instead, the application layer can provide a storefront-oriented Product representation.

Example:

```text
Storefront Product

Title
Description
Available Options
Available Variants
Effective Price
Available Inventory State
Media
Size Information
Reviews
SEO
```

Internal information such as:

```text
Supplier Cost
Internal Notes
Draft Metadata
Audit History
```

must never leak simply because it exists on related objects.

---

# 127. Admin Catalog Read Model

Dashboard product details need different information:

```text
Product
Variants
Publication
Inventory summary
Procurement references
Audit information
Media usage
Completeness
```

This reinforces:

```text
One domain model
does not require
one universal API response.
```

---

# 128. Catalog Performance Considerations

Product listing queries can become expensive if every page independently loads:

```text
Variants
Inventory
Pricing
Categories
Media
Reviews
```

for each Product.

Therefore later query/API design should deliberately use:

```text
Purpose-specific projections
Aggregates
Batching
Pagination
Selective fields
Indexes
Caching where justified
```

rather than returning the entire Product graph everywhere.

---

# 129. Catalog Caching Rule

Catalog content is relatively cache-friendly compared with transactional inventory/order operations.

Possible future caching:

```text
Published Product detail
Category trees
Product Type definitions
Attribute vocabularies
```

But availability/pricing may require different freshness rules.

Catalog cache invalidation should be driven by controlled update events.

---

# 130. Search Index Projection

Later we may create a dedicated read/search representation:

```text
ProductSearchDocument

product_id
title
category_paths
collection_ids
tags
occasions
product_type
attributes
variant_colors
associated_colors
price_range
availability
...
```

This is not the source-of-truth Product schema.

---

# 131. Important Catalog Invariants

These rules should eventually be enforced through application logic and, where appropriate, database constraints.

### CAT-INV-001

Every Product belongs to one Organization.

### CAT-INV-002

Every Variant belongs to exactly one Product.

### CAT-INV-003

A Variant cannot contain an option not configured for its Product.

### CAT-INV-004

A Variant cannot contain two different values for the same single-value option.

### CAT-INV-005

Two active variants under the same Product cannot unintentionally represent the same option combination.

### CAT-INV-006

SKU uniqueness must follow the configured organization-level policy.

### CAT-INV-007

Category hierarchy must never contain cycles.

### CAT-INV-008

Archived historical Products/Variants cannot silently invalidate transaction references.

### CAT-INV-009

A Product cannot be published unless publication validation passes.

### CAT-INV-010

Variant availability must not be represented solely by Product status.

### CAT-INV-011

Associated Colors must not automatically create sellable variants.

### CAT-INV-012

Product Type change must not silently discard incompatible data.

---

# 132. Edge Case — One Color, Many Sizes

```text
Color:
Black

Sizes:
S M L XL
```

The storefront may decide not to visually show a Color selector because only one color exists.

Variants still remain:

```text
Black / S
Black / M
Black / L
Black / XL
```

---

# 133. Edge Case — Multiple Colors, No Size

Example handbag:

```text
Black
Brown
Cream
```

Variants:

```text
Color = Black
Color = Brown
Color = Cream
```

No fake size required.

---

# 134. Edge Case — Free Size

Free Size is a valid size value.

Example:

```text
Size:
Free Size
```

This can still participate in the structured sizing system.

It is different from a Product that has no sizing concept at all.

---

# 135. Edge Case — Same Product, Variant-Specific Price

Example:

```text
S       ৳1,000
M       ৳1,000
L       ৳1,050
XL      ৳1,100
```

Pricing architecture must support this.

---

# 136. Edge Case — Variant-Specific Weight

Example:

```text
Small storage box:
500 g

Large:
900 g
```

Weight therefore cannot always exist only on Product.

---

# 137. Edge Case — Variant Temporarily Not Sold

A business may want:

```text
Blue / XL
```

temporarily unavailable even when stock remains.

Variant operational activation therefore remains separate from inventory quantity.

---

# 138. Edge Case — Out-of-Stock Product Still Visible

A business may want Product pages searchable even when unavailable.

Therefore:

```text
Out of Stock
≠
Automatically Unpublished
```

The storefront policy can determine whether such products remain visible.

---

# 139. Edge Case — Category Disabled

If:

```text
Women → Dresses
```

is disabled but a Product also belongs to:

```text
Sale
```

an important policy question emerges:

> Should the Product still be visible through Sale?

Our recommended model:

**Category effective state controls visibility within that category path, not automatically global Product publication.**

If the business wants the Product globally unavailable, it should unpublish the Product.

This avoids one category accidentally disabling a Product that legitimately belongs elsewhere.

---

# 140. Edge Case — Deleted Attribute Choice

Suppose:

```text
Material:
Cotton
Polyester
Silk
```

and hundreds of products use:

```text
Silk
```

Deleting `Silk` should not destroy existing Product data.

Possible options:

```text
Deactivate choice
Merge into another choice
Prevent deletion while used
```

Safe lifecycle rules are required.

---

# 141. Edge Case — Rename Category URL

Changing:

```text
Party Dress
→
Party Dresses
```

may change slug.

The old URL may already be shared/indexed.

Therefore later SEO architecture must support historical redirects.

Catalog must expose stable identity independent of slug.

---

# 142. Edge Case — Duplicate Product

Duplicating a Product must not duplicate identifiers that should remain unique.

Do not copy blindly:

```text
SKU
Barcode
Product Slug
Inventory
Review History
Order History
```

---

# 143. Edge Case — Product Media Used Elsewhere

Deleting Product does not automatically delete media.

An asset may be:

```text
Used by Product A
Used by Product B
Used in CMS
```

Media Library remains authoritative for asset lifecycle.

---

# 144. Edge Case — Product Type Deactivation

Deactivating:

```text
Dress
```

should stop it being selected for new Products but should not invalidate existing Dresses.

---

# 145. Edge Case — Option Value Reordering

Changing:

```text
S M L XL
```

to:

```text
M L XL S
```

changes presentation order only.

It must not recreate variants or change inventory identity.

---

# 146. Edge Case — Option Rename

Renaming:

```text
Colour
→
Color
```

changes display/schema terminology.

It should not cause new variants to be created.

---

# 147. Edge Case — Merge Colors

The business may initially create:

```text
Dark Red
Maroon
```

then realize they should be one reusable color.

Future admin tools may need safe merge/reassignment.

V1 can initially prevent deletion while values are used and offer reassignment.

---

# 148. Edge Case — Shared Search Colors

Variant:

```text
Primary:
Cream

Associated:
White
Beige
```

must be returned when searching relevant colors without pretending there are separate White or Beige variants.

---

# 149. Future: Product Taxonomy Templates

As the platform becomes reusable for many businesses, we may eventually provide ready-made Product Types.

Example:

```text
Apparel
Footwear
Jewelry
Electronics
Cosmetics
Furniture
```

Shopify maintains standardized product taxonomy concepts, demonstrating the long-term value of standardized classification, but Maevelle does not need to recreate a worldwide taxonomy in V1.

V1 should prioritize business-defined Product Types.

---

# 150. Future: Product Type Versioning

If Product Types become heavily used, changing their structure can have major consequences.

Future architecture may need:

```text
Schema/version awareness
Migration tooling
Impact analysis
```

V1 can begin with controlled modifications and usage validation.

---

# 151. Future: Rule-Based Collections

Potential collection:

```text
Collection:
Under ৳1,000

Rules:
Published
Price <= 1000
Inventory > 0
```

Another:

```text
Wedding Collection

Occasion = Wedding
Status = Published
```

This is a natural future progression after manual Collections.

---

# 152. Future: Multi-Storefront Publication

The current platform initially has one storefront.

Future:

```text
Product
├── Maevelle Bangladesh Store
├── Wholesale Portal
└── Another Storefront
```

may require channel-specific publication.

We should not implement a large Sales Channel subsystem now unless another domain requires it.

But publication architecture should avoid assuming:

```text
published BOOLEAN
```

is the only model the platform could ever support.

This is a **future-ready constraint**, not V1 scope expansion.

---

# 153. Future: Bundles / Kits

Possible future Product Type:

```text
Bundle
```

with composition:

```text
2 × Product A
1 × Product B
```

Inventory availability may then derive from child components.

This requires separate design.

Do not implement as ordinary variant options.

---

# 154. Future: Product Customization

Possible future businesses may sell customizable products.

Example:

```text
Engraving Text
Custom Name
Custom Measurement
```

These are not necessarily pre-generated Variants.

The architecture should later distinguish:

```text
Variant Selection
```

from:

```text
Order-Line Customization
```

Not V1.

---

# 155. Future: Marketplace/Seller Catalog

If the platform later becomes marketplace-capable:

```text
Product
Seller
Offer
```

may become distinct.

This is far outside V1 and should not distort today's model.

---

# 156. Catalog Domain Relationship Map

Final conceptual map:

```text
Organization
    │
    ├── Product Types
    │      │
    │      ├── Product Attribute Definitions
    │      ├── Variant Attribute Definitions
    │      └── Sizing Behavior
    │
    ├── Attribute Definitions
    │
    ├── Colors
    ├── Categories
    ├── Collections
    ├── Tags
    └── Occasions

Product
│
├── Product Type
│
├── Categories
├── Primary Category
├── Collections
├── Tags
├── Occasions
│
├── Product Attributes
│
├── Product Options
│     ├── Color
│     ├── Size
│     └── Other
│
├── Variants
│     ├── Option Values
│     ├── Variant Attributes
│     ├── SKU / Barcode
│     ├── Physical Properties
│     │
│     ├── Pricing Reference
│     ├── Inventory Reference
│     ├── Media Relationships
│     └── Procurement Relationships
│
├── General Media
├── Information Groups
├── FAQ
├── SEO
└── Publication
```

---

# 157. Domain Boundary Map

```text
                    ┌──────────────────┐
                    │     CATALOG      │
                    │                  │
                    │ Product          │
                    │ Variant          │
                    │ Category         │
                    │ Attribute        │
                    │ Product Type     │
                    │ Collection       │
                    └────────┬─────────┘
                             │
      ┌──────────────────────┼───────────────────────┐
      │                      │                       │
      ▼                      ▼                       ▼
┌────────────┐        ┌──────────────┐       ┌─────────────┐
│  PRICING   │        │  INVENTORY   │       │    MEDIA    │
│            │        │              │       │             │
│ Sell Price │        │ Stock        │       │ Assets      │
│ Price Sets │        │ Warehouse    │       │ Galleries   │
└────────────┘        └──────────────┘       └─────────────┘
      │                      │
      ▼                      ▼
┌────────────┐        ┌──────────────┐
│   ORDERS   │        │ PROCUREMENT  │
│ Snapshots  │        │ Supplier     │
│ Line Items │        │ Purchase     │
└────────────┘        └──────────────┘
```

---

# 158. V1 Catalog Scope Confirmed

The following Catalog capabilities belong in V1 Production Core:

```text
✓ Products
✓ Product Types

✓ Product Attributes
✓ Variant Attributes
✓ Product Options
✓ Option Values

✓ Variants
✓ SKUs
✓ Optional Barcodes

✓ Categories
✓ Unlimited hierarchy
✓ Effective category activation

✓ Collections
✓ Manual collection assignment

✓ Tags
✓ Controlled Occasions

✓ Structured Color vocabulary
✓ Primary color
✓ Associated/search colors

✓ Product descriptions
✓ Structured information groups
✓ FAQs

✓ Product lifecycle
✓ Draft
✓ Publish
✓ Unpublish
✓ Archive

✓ Variant activation

✓ Product duplication
✓ Bulk operations

✓ SEO fields

✓ Product/variant media relationships

✓ Sizing integration

✓ Pricing integration
✓ Inventory integration
✓ Procurement integration

✓ Audit integration

✓ Search projections / indexing readiness
```

---

# 159. Deferred Catalog Capabilities

Not required for initial V1:

```text
Advanced rule-based Collections
Product bundles/kits
Product personalization/customization
Marketplace sellers
Multi-storefront/channel management UI
Global standardized taxonomy
Automated product recommendations
AI product enrichment
Product Type versioning engine
Advanced localization
Digital-product fulfillment
```

They remain architecturally possible.

---

# 160. Decisions Established by This Document

Unless later domain analysis reveals a strong reason to change them:

### Decision C-001

**Product and Variant are separate concepts.**

### Decision C-002

**Variant is the fundamental sellable catalog configuration.**

### Decision C-003

**Products with no meaningful customer options may still use an internal default sellable variant.**

### Decision C-004

**Product Type is first-class.**

### Decision C-005

**Product Type defines reusable catalog structure.**

### Decision C-006

**Attributes and Options are separate concepts.**

### Decision C-007

**Options define customer-selectable variant dimensions.**

### Decision C-008

**Attributes describe Products/Variants structurally.**

### Decision C-009

**Categories use arbitrary hierarchical depth.**

### Decision C-010

**Category configured state and effective state are separate.**

### Decision C-011

**Products may belong to multiple categories.**

### Decision C-012

**Primary category may exist separately for navigation/SEO purposes.**

### Decision C-013

**Collections become first-class merchandising groups.**

### Decision C-014

**Tags remain lightweight flexible labels.**

### Decision C-015

**Occasion is structured vocabulary rather than arbitrary text.**

### Decision C-016

**Seasonal campaigns can generally begin as Collections instead of another duplicate classification system.**

### Decision C-017

**Color uses reusable structured definitions.**

### Decision C-018

**Primary Color and Associated Search Colors are separate concepts.**

### Decision C-019

**Associated Colors do not generate variants.**

### Decision C-020

**Product information groups and FAQ are structured rather than one unstructured HTML blob.**

### Decision C-021

**Catalog does not own inventory quantity.**

### Decision C-022

**Catalog does not own procurement cost.**

### Decision C-023

**Pricing is a distinct module/domain boundary.**

### Decision C-024

**Search indexes are derived representations, not catalog source of truth.**

### Decision C-025

**Historical transactions snapshot mutable catalog information.**

### Decision C-026

**Archive/deactivation is preferred over destructive deletion when commercial history exists.**

### Decision C-027

**Publication and purchasability are separate states.**

### Decision C-028

**Variant generation supports combinations but must not assume every combination is valid.**

### Decision C-029

**Product Type changes require impact analysis rather than silently discarding data.**

### Decision C-030

**Catalog must remain business-neutral despite Maevelle being the initial storefront.**

---

# 161. Questions Intentionally Deferred

The following are not unresolved accidentally; they belong in subsequent domain documents.

### Sizing

```text
How size systems work
Measurement schemas
Regional sizes
Reusable charts
Variant size relationship
```

→ `docs/domains/sizing/sizing-architecture.md`

### Media

```text
Asset storage
Transformations
Usage graph
Variant/color media assignment implementation
```

→ `docs/domains/media/media-architecture.md`

### Pricing

```text
Price sets
Multi-currency prices
Compare-at prices
Price lists
Promotions
```

→ Pricing architecture.

### Inventory

```text
Inventory Item
Stock levels
Reservations
Movements
Warehouse stock
```

→ Inventory architecture.

### Procurement

```text
Supplier product mapping
Purchases
Receiving
Costs
```

→ Procurement architecture.

### Search

```text
Ranking
Typo tolerance
Synonyms
Faceting
Search engine
```

→ Search architecture.

---

# 162. Database Warning

This document intentionally does **not** prescribe tables such as:

```text
products
product_variants
attribute_values
```

yet.

The conceptual relationships are established.

Persistence design comes later.

We should not mistake:

```text
Domain Concept
```

for:

```text
Database Table
```

Some concepts may require:

```text
multiple tables,
value objects,
join structures,
JSON structures,
indexes,
materialized projections
```

depending on the final relational design.

---

# 163. Next Domain

The next deep domain should be:

```text
docs/domains/sizing/sizing-architecture.md
```

This must be designed **before** database/schema work because sizing directly influences:

```text
Product Types
Options
Variants
Storefront Product Selection
Size Chart Builder
Measurements
Search / Filters
Future Product Categories
```

The sizing design should answer substantially harder cases than:

```text
S / M / L / XL
```

including:

```text
Apparel
Shoes
Rings
Children's sizing
Numeric sizes
Regional equivalencies
Free Size
Custom labels
Measurement matrices
Reusable charts
Product overrides
Different measurement units
Variant integration
Admin chart-builder UX
Storefront chart UX
```

---

**End of Catalog & Product Architecture v0.1**
