# Maevelle Ecommerce — Sizing & Measurement Architecture

**Document:** `docs/domains/sizing/sizing-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `catalog-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Sizing & Measurement domain defines how Maevelle Ecommerce represents:

- selectable sizes;
- size systems;
- size labels;
- measurement definitions;
- size charts;
- reusable size guides;
- product-specific sizing;
- unit handling;
- regional size equivalents;
- measurement instructions;
- measurement diagrams;
- storefront size selection;
- variant integration.

This subsystem must support products as different as:

```text
Dress
T-Shirt
Pants
Shoes
Ring
Bracelet
Children's Clothing
Hat
Belt
Furniture
Custom-sized Product
```

without redesigning the database every time a new kind of size appears.

---

# 2. Core Principle

The most important rule is:

> **Size designation and physical measurement are different concepts.**

For example:

```text
Size Label:
M
```

does not itself tell us:

```text
Chest
Waist
Length
Shoulder
Sleeve
```

Likewise:

```text
EU 41
```

is a size designation.

The useful physical reference may involve:

```text
Foot Length
Foot Width
```

The current ISO clothing-size standard, ISO 8559-2:2025, bases clothing size designation on body measurements, while ISO 8559-1 defines anthropometric body measurements.

Therefore Maevelle shall explicitly separate:

```text
SIZE IDENTITY
from
MEASUREMENT DATA
```

---

# 3. Second Core Principle

We must also distinguish:

```text
Body Measurement
```

from:

```text
Garment Measurement
```

These are not interchangeable.

Example:

```text
Customer chest circumference:
38 inches

Dress chest measurement:
41 inches
```

The additional garment space may intentionally exist because of fit, design, fabric, construction or ease.

ISO's clothing sizing framework similarly bases designation on body dimensions rather than assuming garment dimensions themselves are the customer's body measurements.

Our system must therefore never store simply:

```text
Chest = 40
```

without understanding **what was measured**.

---

# 4. Domain Vocabulary

Official project terminology:

```text
Sizing Domain
│
├── Size System
├── Size Definition
├── Size Label
├── Measurement Definition
├── Measurement Subject
├── Measurement Value
├── Size Guide
├── Size Guide Revision
├── Size Guide Row
├── Measurement Matrix
├── Conversion Mapping
├── Measurement Instructions
├── Measurement Diagram
└── Product Size Configuration
```

---

# 5. Size System

A **Size System** defines a coherent vocabulary and ordering of sizes.

Examples:

```text
Women's Alpha Apparel
Men's Alpha Apparel
EU Footwear
UK Footwear
US Footwear
Mondopoint
Kids Age Sizing
Numeric Waist Sizing
Ring Sizing
Custom Maevelle Sizing
```

A Size System primarily answers:

> How are sizes named, ordered and interpreted?

---

# 6. Size System Is Not a Size Chart

Example:

```text
Size System:
Women's Alpha Apparel

Sizes:
XS
S
M
L
XL
```

This does **not** tell us that every Medium dress in the world has the same chest measurement.

The Size Guide supplies those measurements.

Therefore:

```text
Size System
=
Naming / ordering system

Size Guide
=
Measurement information
```

---

# 7. Why This Separation Matters

Maevelle could source two products from different manufacturers.

Product A:

```text
Size M
Chest: 38"
Length: 45"
```

Product B:

```text
Size M
Chest: 40"
Length: 47"
```

Both legitimately use:

```text
Size = M
```

but their charts differ.

The architecture must support this naturally.

---

# 8. Size Definition

A **Size Definition** represents one selectable/designated size within a Size System.

Example:

```text
System:
Women's Alpha Apparel

Definitions:

XS
S
M
L
XL
XXL
```

Another:

```text
System:
EU Footwear

Definitions:

35
36
37
38
39
40
41
42
...
```

---

# 9. Size Definition Properties

Conceptually, a Size Definition may contain:

```text
Display Label
Internal Code
Sort Order
Short Label
Optional Description
Active / Inactive
Size System
```

Potential examples:

```text
Display Label: Extra Small
Short Label: XS
Code: XS
Sort Order: 10
```

or:

```text
Display Label: EU 41
Short Label: 41
Code: EU-41
Sort Order: 410
```

---

# 10. Size Ordering

Size ordering must never depend purely on alphabetical sorting.

Incorrect:

```text
L
M
S
XL
XS
XXL
```

Correct:

```text
XS
S
M
L
XL
XXL
```

Therefore every reusable Size System must define explicit ordering.

---

# 11. Custom Size Systems

Administrators shall be capable of defining new size systems without code changes.

Example:

```text
Maevelle Abaya Size

50
52
54
56
58
60
```

or:

```text
Supplier ABC Dress Size

1
2
3
4
5
```

This is important because merchants frequently encounter supplier-specific sizing.

---

# 12. Free Size

`Free Size` is a legitimate Size Definition.

Example:

```text
System:
Apparel Special Sizes

Size:
Free Size
```

It is different from:

```text
Product does not use sizing.
```

That distinction matters.

---

# 13. No-Size Products

Some Products have no meaningful Size option.

Examples:

```text
Hair Clip
Perfume
Handbag with one physical format
```

The Product Size Configuration can simply be:

```text
Sizing:
Not Applicable
```

The dashboard shall not force irrelevant size-chart fields onto such products.

---

# 14. Measurement Definition

A **Measurement Definition** describes what physical characteristic is being measured.

Examples:

```text
Chest Circumference
Bust Circumference
Waist Circumference
Hip Circumference
Shoulder Width
Sleeve Length
Garment Length
Inseam
Foot Length
Foot Width
Ring Inner Circumference
Ring Inner Diameter
Head Circumference
Belt Length
```

---

# 15. Reusable Measurement Vocabulary

Measurements should preferably be reusable definitions.

Avoid:

```text
Chest
chest
Chest Size
Chest Measurement
Bust/Chest
```

being unrelated text columns on different charts.

Instead:

```text
Measurement Definition:
Chest Circumference
```

can be reused across relevant templates.

This improves:

- consistency;
- translations;
- instructions;
- search;
- unit conversions;
- diagram reuse;
- future analytics.

---

# 16. Measurement Subject

Every Measurement Definition must understand **what is being measured**.

Recommended subjects:

```text
BODY
GARMENT
FOOT
HAND
FINGER
HEAD
PRODUCT
PACKAGE
OTHER
```

This prevents dangerous ambiguity.

---

# 17. Example — Body vs Garment

These should be different definitions:

```text
BODY_CHEST_CIRCUMFERENCE
```

and:

```text
GARMENT_CHEST_CIRCUMFERENCE
```

even if both are presented to customers as:

```text
Chest
```

where the context is obvious.

---

# 18. Why Measurement Subject Is Critical

Suppose the chart says:

```text
M
Chest: 40"
```

Without context we cannot know whether:

1. customers with a 40-inch body chest should choose M; or
2. the physical garment itself measures 40 inches.

Those can produce significantly different fit expectations.

Therefore measurement semantics must never depend only on UI wording.

---

# 19. Measurement Method

A Measurement Definition may include instructions describing how it is measured.

Example:

```text
Shoulder Width

Measure straight across the back
from shoulder seam to shoulder seam.
```

Another:

```text
Garment Length

Measure from the highest shoulder point
to the bottom hem.
```

---

# 20. Measurement Diagram

Measurements may have an associated illustration.

For example:

```text
Dress Diagram
     ↕ Length
↔ Chest
↔ Waist
↔ Hip
```

The Media system stores the actual image.

Sizing references that asset.

---

# 21. Measurement Diagrams Can Be Reused

A reusable apparel diagram could support several products.

Example:

```text
Women's Dress Measurement Diagram
```

referenced by:

```text
Dress Size Guide A
Dress Size Guide B
Dress Size Guide C
```

No need to upload the same diagram repeatedly.

---

# 22. Future Diagram Hotspots

The architecture may later support structured diagram markers.

Example:

```text
Point A → Chest
Point B → Waist
Point C → Length
```

This can eventually power interactive measurement instructions.

Not required for V1.

---

# 23. Measurement Unit

Every numeric physical measurement must carry meaningful unit information.

Examples:

```text
mm
cm
m
inch
```

Where relevant:

```text
g
kg
```

may be used in more general measurement infrastructure, although weight does not necessarily belong to customer sizing.

---

# 24. Unit Must Not Exist Only in Column Title

We should not make this the only representation:

```text
Chest (inch)
40
```

Internally the measurement should semantically know its unit.

That allows reliable:

```text
Conversion
Validation
Formatting
Import
API output
```

---

# 25. Canonical Measurement Storage

Recommended principle:

> Store measurements in a predictable canonical representation and convert for presentation where appropriate.

For example, dimensional measurements may be normalized internally to a metric base unit.

The exact persistence strategy will be determined during schema design.

The application should not repeatedly convert already-rounded display values back and forth.

---

# 26. Display Unit

A Size Guide may have a preferred display unit.

Example:

```text
Default Unit:
inch
```

Customer switches:

```text
inch
↔
cm
```

The system converts supported physical values.

---

# 27. Unit Conversion Is Not Size Conversion

This distinction is mandatory.

```text
40 inches
→
101.6 cm
```

is mathematical unit conversion.

But:

```text
UK Shoe 7
→
US Shoe 8
```

is **size-system mapping**, not unit conversion.

These must use different mechanisms.

---

# 28. Measurement Value Forms

Not every size-chart measurement is necessarily one exact number.

The system should support:

```text
Exact Value
Range
Minimum
Maximum
Approximate Value
Text / Not Applicable where intentionally allowed
```

Examples:

```text
Chest:
38–40 inches
```

or:

```text
Recommended Height:
160–168 cm
```

---

# 29. Structured Ranges

A range should not be stored only as:

```text
"38-40"
```

when numeric behavior is needed.

Conceptually:

```text
Min: 38
Max: 40
Unit: inch
```

This allows future:

- conversion;
- validation;
- comparison;
- size recommendations.

---

# 30. Approximation

Some measurements supplied by vendors are approximate.

The system should support presentation such as:

```text
Length:
Approx. 44 in
```

without replacing the underlying value with an arbitrary string.

---

# 31. Measurement Tolerance

Future advanced product data may support tolerances:

```text
Length:
44 in ± 0.5 in
```

V1 does not need sophisticated manufacturing tolerance calculations.

But the measurement model should not make them impossible.

---

# 32. Size Guide

A **Size Guide** is a structured collection describing how size designations relate to measurements and/or equivalents.

Example:

```text
Maevelle Women's Dress Guide

        Chest    Waist    Length
S       36"      30"      44"
M       38"      32"      45"
L       40"      34"      46"
XL      42"      36"      47"
```

---

# 33. Size Guide Is a Structured Object

It should not merely be:

```html
<table>
  ...
</table>
```

stored inside rich text.

Instead the system understands:

```text
Sizes
Measurements
Units
Cells
Instructions
Ordering
Metadata
```

---

# 34. Research Support for Structured Reuse

Shopify's current custom-data architecture allows reusable structured objects with multiple fields and explicitly lists size charts as an example use of merchant-defined metaobjects. That reinforces our decision that reusable size guides should be structured data rather than static HTML/images.

Maevelle will go significantly deeper because sizing is a first-class domain rather than generic metadata.

---

# 35. Size Guide Structure

Conceptually:

```text
Size Guide
│
├── Name
├── Internal Code
├── Status
├── Size System
├── Measurement Subject
├── Preferred Unit
│
├── Sizes
├── Measurements
├── Matrix Values
│
├── Instructions
├── Diagram
├── Notes
│
└── Revision
```

---

# 36. Size Guide Example — Apparel

```text
Guide:
Maevelle Standard Dress — Garment Measurements

Subject:
GARMENT

System:
Women's Alpha

Unit:
inch

Measurements:
Chest
Waist
Length

Rows:
S
M
L
XL
```

---

# 37. Another Guide — Body Measurements

```text
Guide:
Maevelle Dress Body Fit Guide

Subject:
BODY

System:
Women's Alpha

Measurements:
Bust
Waist
Hip
```

The two guides describe different information.

---

# 38. Supporting More Than One Guide

A Product may eventually show:

```text
Body Size Guide
+
Garment Measurements
```

if the business wants to provide both.

V1 should architecturally allow multiple related guides, even if the normal UI commonly displays one main guide.

---

# 39. Measurement Matrix

The central Size Guide experience is effectively a matrix:

```text
             Chest   Waist   Hip   Length
XS
S
M
L
XL
```

Each intersection is a structured measurement value.

---

# 40. Matrix Orientation

Some merchants prefer:

```text
Sizes as rows
Measurements as columns
```

Others may prefer the opposite.

The underlying model should not semantically depend on visual orientation.

The dashboard may provide a standard editing layout while storefront themes may transpose it.

---

# 41. Sparse Charts

Not every cell must always have a value.

Example:

```text
Size   Chest   Length   Sleeve
S      36      44       22
M      38      45       23
L      40      46       —
```

Missing data should be distinguishable from:

```text
0
```

---

# 42. Validation

The Size Guide builder should validate:

- duplicate size rows;
- duplicate measurement columns;
- invalid numbers;
- ranges where minimum exceeds maximum;
- incompatible units;
- unsupported size-system relationships;
- accidental empty chart;
- missing required measurements.

---

# 43. Required Measurements by Product Type

Product Types may define recommended or required measurement definitions.

Example:

```text
Product Type:
Dress

Recommended:
Chest
Waist
Hip
Length
```

Another:

```text
Product Type:
Shoes

Recommended:
Foot Length
Optional:
Foot Width
```

This guides merchants without hard-coding forms.

---

# 44. Required Does Not Mean Universal

The platform should allow business configuration.

One dress seller may need:

```text
Chest
Length
```

Another may require:

```text
Bust
Waist
Hip
Shoulder
Sleeve
Length
```

Product Type supplies a reusable starting structure.

---

# 45. Size Guide Template

A reusable Size Guide can act as a template.

Example:

```text
Maevelle Standard Women's Dress
```

used by:

```text
Product A
Product B
Product C
Product D
```

---

# 46. Why Reusable Guides Matter

Without reuse, merchants repeatedly enter the same data.

This causes:

- duplicated work;
- inconsistent charts;
- errors;
- difficult maintenance.

Reusable guides solve that.

---

# 47. But Reuse Creates Risk

Suppose:

```text
Standard Dress Guide
```

is used by 200 products.

An administrator changes:

```text
M Chest:
38
→
42
```

If that change silently affects 200 live products, it can create a serious storefront error.

Therefore reusable guides require controlled revision behavior.

---

# 48. Size Guide Revisions

Size Guides should support revisions.

Conceptually:

```text
Standard Dress Guide

Revision 1
Revision 2
Revision 3
```

Each publication/change can produce an identifiable revision.

---

# 49. Draft and Published Size Guide

Recommended lifecycle:

```text
DRAFT
PUBLISHED
ARCHIVED
```

A merchant can safely edit:

```text
Draft Revision 4
```

while products continue displaying:

```text
Published Revision 3
```

until the change is published.

---

# 50. Impact Preview

Before publishing a shared guide update:

```text
This Size Guide is used by 82 products.
```

The system should show impact.

Potential UX:

```text
Publishing this revision will affect:

82 Products
214 Variants

Continue?
```

---

# 51. Linked Product Mode

A Product may remain linked to the reusable guide.

Meaning:

```text
Product
→
Standard Dress Guide
→
Current Published Revision
```

When a new guide revision is deliberately published, linked products may adopt it according to the configured update behavior.

---

# 52. Product Override

Sometimes one sourced product differs slightly from Maevelle's reusable standard.

Example:

```text
Standard M Chest:
38"

This Product:
39"
```

The merchant should not be forced to create an entirely unrelated guide.

The system should support:

```text
Reusable Guide
+
Product Override
```

or a controlled `Duplicate & Customize` workflow.

---

# 53. Override Strategy

Recommended V1 UX:

```text
Use Shared Guide
```

or:

```text
Customize for This Product
```

Choosing customization creates an independent/product-level version based on the reusable guide.

This is simpler and safer than complex inheritance of individual cells.

---

# 54. Avoid Deep Inheritance

We should avoid:

```text
Global Guide
  ↓
Category Override
  ↓
Product-Type Override
  ↓
Product Override
  ↓
Variant Override
```

for V1.

That becomes difficult for staff to understand.

Prefer explicit reuse and controlled copying/customization.

---

# 55. Product Size Configuration

Each Product determines how sizing applies.

Conceptually:

```text
Product Size Configuration

Sizing Enabled?
Size Option
Size System
Available Size Definitions
Size Guide Assignment
Display Configuration
```

---

# 56. Catalog Option Integration

Recall from Catalog Architecture:

```text
Product Option:
Size
```

The option values should connect to structured Size Definitions.

Example:

```text
Catalog Option Value
M
      ↓
Size Definition
Women's Alpha / M
```

This prevents sizing from becoming an unrelated second selection system.

---

# 57. Variant Integration

Product:

```text
Options:
Color
Size
```

Size definitions:

```text
S
M
L
```

Variants:

```text
Red / S
Red / M
Red / L
Blue / S
Blue / M
Blue / L
```

Inventory remains attached to Variants.

The Size domain supplies the meaning of `S/M/L`; it does not own stock.

---

# 58. Size Does Not Own Inventory

The sizing system should never contain:

```text
M Stock = 20
```

because inventory may differ by:

```text
Color
Warehouse
Variant
```

Example:

```text
Red / M   Dhaka Warehouse     4
Blue / M  Dhaka Warehouse     8
```

Inventory remains authoritative.

---

# 59. Product May Use a Subset

A reusable Size System may define:

```text
XS
S
M
L
XL
XXL
```

but Product A may sell only:

```text
S
M
L
```

The Product references a subset.

We do not create a brand-new Size System merely because a Product doesn't sell every size.

---

# 60. Product-Specific Ordering

Normally the Size System's order should be used.

Rarely a Product may require an alternative display sequence.

This should be supported only when justified.

Default:

```text
Use Size System Order
```

---

# 61. Size Status

A reusable Size Definition can be active/inactive globally.

But a Product's use of that size also needs state.

Example:

```text
System:
M is active

Product A:
M enabled

Product B:
M not offered
```

These are different conditions.

---

# 62. Variant Availability vs Size Availability

Suppose Product has:

```text
M
```

but:

```text
Red / M = out of stock
Blue / M = available
```

The storefront cannot simply say:

```text
M unavailable
```

without considering the selected Color.

Size availability is therefore derived from the current variant-selection context.

---

# 63. Storefront Selection Logic

Example:

```text
Customer selects:
Color = Red
```

The storefront evaluates valid Red variants.

Then:

```text
S  Available
M  Available
L  Out of Stock
XL Not Offered in Red
```

These states may need different visual treatment.

---

# 64. Unavailable vs Nonexistent Combination

Important distinction:

```text
Red / XL exists but stock = 0
```

vs:

```text
Red / XL variant does not exist
```

The UI may show both as unavailable, but the domain must know the difference.

---

# 65. Size Chart Must Not Depend on Inventory

Even if:

```text
XL
```

is currently out of stock, it can still appear in the Size Guide.

Size chart describes sizing.

Inventory describes availability.

---

# 66. Size Chart Display

Product details page should expose:

```text
Select Size

S
M
L
XL

[ Size Guide ]
```

Opening Size Guide should provide a clean mobile-friendly interface.

---

# 67. Storefront Size Guide UX

Recommended capabilities:

- size table;
- measurement context;
- unit toggle;
- measurement instructions;
- diagram;
- guide notes;
- clear selected size highlighting where useful;
- mobile-friendly scrolling/layout.

---

# 68. Mobile Size Chart

A giant desktop table squeezed into a phone is unacceptable.

Depending on chart complexity, mobile may use:

```text
Horizontal scrolling
```

or:

```text
Size selector
→
Measurement cards
```

Example:

```text
Size M

Chest     38"
Waist     32"
Length    45"
Sleeve    23"
```

The storefront theme determines presentation.

---

# 69. Highlight Selected Size

If customer currently selected:

```text
M
```

the guide should optionally highlight:

```text
M
```

to reduce cognitive effort.

---

# 70. Unit Toggle

Where convertible dimensions exist:

```text
IN | CM
```

should update measurements without replacing the underlying guide.

---

# 71. Unit Preference

Storefront may default using:

- business setting;
- locale;
- guide preference.

But customers should be able to switch when appropriate.

No need to permanently modify business data.

---

# 72. Fit Notes

Size Guide may include contextual notes.

Examples:

```text
Relaxed Fit
```

```text
This product runs slightly small.
```

```text
If between sizes, choose the larger size.
```

These should be separate from structured measurements.

---

# 73. Fit Profile

Future advanced sizing may introduce structured fit characteristics:

```text
Slim
Regular
Relaxed
Oversized
```

For V1 these may simply be product attributes or guide notes.

Do not overbuild a fit engine now.

---

# 74. Apparel Standards Awareness

ISO maintains a series specifically for clothing sizing. The current ISO 8559-2:2025 defines primary and secondary dimensions based on body measurements, while ISO 8559-3 addresses methodology for creating body-measurement tables and intervals.

Maevelle does **not** need to claim ISO sizing compliance.

Instead, these standards reinforce our architecture decision that measurement definitions, subjects, size designations and size tables should be explicit and structured.

---

# 75. We Do Not Hard-Code ISO

The platform should support business-defined sizing.

Therefore:

```text
ISO concepts
=
useful structural/reference guidance
```

not:

```text
Every merchant must use ISO sizes
```

---

# 76. Clothing Size Example

System:

```text
Maevelle Women's Alpha
```

Definitions:

```text
XS
S
M
L
XL
```

Guide:

```text
Body Measurements

Size    Bust    Waist    Hip
XS
S
M
L
XL
```

Another Guide:

```text
Garment Measurements

Size    Chest   Length   Sleeve
XS
S
M
L
XL
```

Both can coexist.

---

# 77. Numeric Apparel Sizes

The platform must support:

```text
34
36
38
40
42
```

without assuming numbers imply mathematical measurements.

They are labels within a Size System unless explicitly defined otherwise.

---

# 78. Waist-Based Sizes

Example jeans:

```text
28
30
32
34
36
```

A merchant might mean actual waist-related designation.

But the system should still treat the selectable value as a Size Definition.

Measurements clarify what it represents.

---

# 79. Two-Dimensional Sizes

Some apparel uses combinations such as:

```text
32 × 30
32 × 32
34 × 30
34 × 32
```

There are two valid modeling possibilities:

### Option A

One combined Size Option:

```text
32×30
```

### Option B

Two variant options:

```text
Waist = 32
Inseam = 30
```

For products where customers select these independently, **Option B is generally stronger**.

Sizing architecture must support either product configuration.

---

# 80. Size Is Not Always One Option

Product:

```text
Pants
```

could have:

```text
Color
Waist
Length
```

instead of:

```text
Color
Size
```

Therefore the Size domain should be reusable by multiple size-related Option definitions.

---

# 81. Footwear

Footwear requires different modeling from apparel.

Example selectable systems:

```text
EU
UK
US
Mondopoint
```

ISO 9407:2019 defines the Mondopoint footwear sizing system based on measurements of the foot that the footwear is intended to fit.

This reinforces our decision that footwear Size Systems and physical foot measurements should remain separate but connected.

---

# 82. Footwear Conversion

ISO 19407:2023 provides conversion tables across major footwear sizing systems and bases those conversions on foot length. It also notes the complexity caused by different historical systems, so conversions should be treated as mappings/guidance rather than naive arithmetic.

Therefore Maevelle must not implement rules like:

```text
EU = US + 33
```

as universal truth.

---

# 83. Conversion Mapping

Instead:

```text
Size Conversion Set
```

can define mappings.

Example conceptually:

```text
EU 41
↔
UK 7
↔
US 8
↔
Foot Length X
```

Exact values should come from whichever verified conversion source/business configuration is being used.

---

# 84. Many-to-Many / Approximate Equivalence

Sizing systems may not always map perfectly one-to-one.

Therefore conversion data should be capable of representing:

```text
Equivalent
Approximate
Range
No mapping
```

rather than assuming mathematical equality.

---

# 85. Primary Size System

A footwear product should have one primary/customer-selectable system.

Example:

```text
Primary:
EU
```

The Size Guide may display equivalents:

```text
EU   UK   US   Foot Length
```

---

# 86. Avoid Duplicate Variants for Regional Labels

If:

```text
EU 41
UK 7
US 8
```

all refer to the same physical shoe, these should not create three separate inventory variants merely because the guide displays three regional labels.

One sellable Variant can use one primary Size Definition and display conversion/equivalence information.

---

# 87. Ring Sizing

Ring sizing requires another specialized system.

ISO 8653:2016 specifies ring-size measurement/designation methodology, demonstrating that ring sizing has semantics different from apparel or footwear.

Our architecture therefore uses:

```text
Ring Size System
```

rather than forcing ring sizes into apparel structures.

---

# 88. Ring Measurements

Potential structured measurements include:

```text
Inner Diameter
Inner Circumference
```

A Size Guide may additionally display regional labels where the merchant has verified mappings.

---

# 89. Jewelry Example

```text
Guide:
Ring Size Guide

Primary System:
Business-configured ring sizes

Columns:
Size
Inner Diameter
Inner Circumference
Optional Regional Equivalent
```

---

# 90. Children's Sizing

Children's products may use labels such as:

```text
0–3M
3–6M
6–12M
1Y
2Y
3Y
4Y
```

These are Size Definitions.

They should not be interpreted automatically as exact body measurements.

---

# 91. Age Label vs Measurement

For example:

```text
3Y
```

may have:

```text
Recommended Height:
92–98 cm

Chest:
X–Y cm
```

Age is a designation/guide.

Physical measurements provide stronger fit information.

---

# 92. Age Ranges

Age-style sizes should support explicit display labels.

Do not require awkward numeric representation.

Example:

```text
Display:
6–12 Months

Code:
6_12M
```

---

# 93. One Size / Adjustable

Products may have sizing states like:

```text
One Size
Free Size
Adjustable
```

These are not identical.

Example:

```text
Adjustable Ring
```

could have an adjustment range.

```text
Free Size Dress
```

could still include garment measurements.

The system should support explanatory measurements/notes.

---

# 94. Hats

Possible system:

```text
S
M
L
```

with:

```text
Head Circumference
```

or:

```text
Adjustable
```

No new architecture required.

---

# 95. Belts

Possible Size System:

```text
80
85
90
95
100
```

Measurement:

```text
Waist Range
Total Belt Length
```

Again, same engine.

---

# 96. Non-Fashion Measurement Guides

Because Maevelle's platform may later support other businesses, the measurement engine should not be called internally:

```text
FashionSizeChart
```

A furniture product might need:

```text
Width
Depth
Height
```

although these may be specifications rather than customer-selectable sizes.

The generic measurement vocabulary can still be reused.

---

# 97. Sizing vs General Product Dimensions

We should distinguish:

### Selection/Fit Measurements

Used to help choose a size.

from:

### Physical Logistics Dimensions

Used for:

```text
Shipping
Warehouse
Landed-cost allocation
Packaging
```

A Dress `Length` shown in a size chart is not necessarily the same as package `Length`.

Different subjects/definitions prevent confusion.

---

# 98. Supplier Size Mapping

Maevelle imports products.

A supplier may call a size:

```text
Supplier:
L
```

while Maevelle chooses to sell it as:

```text
Storefront:
M
```

This scenario must be possible.

However, the mapping belongs partly to Procurement/Supplier Catalog relationships.

---

# 99. Supplier Label

The system should therefore allow a supplier product/variant reference to preserve:

```text
Supplier Size Label
```

without changing the storefront Size Definition.

Example:

```text
Maevelle Variant:
M

Supplier Variant:
CN-L
```

This will be finalized in Procurement Architecture.

---

# 100. Never Silently Rename Supplier Size

Historical purchase records should preserve the supplier's original designation when useful.

This helps:

- reordering;
- supplier communication;
- dispute resolution;
- receiving.

---

# 101. Size Recommendation — Future

A future system may ask customers for:

```text
Height
Weight
Chest
Waist
Hip
Foot Length
```

and recommend a size.

Our structured measurements make such functionality possible.

But:

> V1 will not automatically guess customer size.

---

# 102. Why We Prepare for Recommendation

If measurements are stored only as HTML like:

```html
<td>38-40 inches</td>
```

a future recommendation engine must parse display text.

Structured values avoid that problem.

---

# 103. Product Size Chart Builder

This is one of the highest-priority dashboard UX areas.

The builder should feel more like:

```text
A small structured spreadsheet
```

than:

```text
A CMS form containing 200 inputs.
```

---

# 104. Builder — Step 1

### Basic Information

```text
Guide Name

Example:
Maevelle Standard Women's Dress

Guide Type:
Body Measurements / Garment Measurements / Other

Size System:
Women's Alpha

Default Unit:
inch
```

---

# 105. Builder — Step 2

### Select Sizes

Example:

```text
☐ XS
☑ S
☑ M
☑ L
☑ XL
☐ XXL
```

Sizes appear in system order.

---

# 106. Builder — Step 3

### Select Measurements

Example:

```text
Chest
Waist
Hip
Length
Sleeve
```

The merchant can select reusable definitions or create an authorized custom definition.

---

# 107. Builder — Step 4

### Fill Matrix

```text
       Chest   Waist   Length
S      [36]    [30]    [44]
M      [38]    [32]    [45]
L      [40]    [34]    [46]
XL     [42]    [36]    [47]
```

---

# 108. Spreadsheet-Like Editing

The matrix should support efficient behaviors where practical:

```text
Tab navigation
Arrow navigation
Copy
Paste
Multi-cell paste
Row copy
Column copy
Bulk unit setting
```

A merchant entering 40 measurements should not have to use the mouse for every field.

---

# 109. Paste From Spreadsheet

V1 should strongly consider allowing users to copy a rectangular region from Excel/Google Sheets and paste into the chart matrix.

Example clipboard data:

```text
36    30    44
38    32    45
40    34    46
42    36    47
```

The system previews the result before committing where ambiguity exists.

This is particularly valuable for imported supplier data.

---

# 110. Import Size Chart

Later or preferably within V1 if manageable:

```text
CSV / XLSX
```

size-chart import.

It should map:

```text
Rows
Columns
Units
```

rather than storing a screenshot.

---

# 111. Import Validation

Import preview should identify:

```text
Unknown Size
Unknown Measurement
Invalid Number
Invalid Range
Missing Unit
Duplicate Column
```

The user can fix mapping before applying data.

---

# 112. Quick Create

For simple products, we should not force the full builder wizard.

Example:

```text
Sizes:
S M L XL

Measurements:
Chest, Length
```

A quick-create action generates the matrix immediately.

---

# 113. Clone Size Guide

Admins should be able to:

```text
Duplicate Guide
```

Example:

```text
Maevelle Standard Dress
→
Supplier ABC Dress Guide
```

Then make small changes.

---

# 114. Reorder Measurements

Merchant can reorder columns:

```text
Chest
Waist
Hip
Length
```

to:

```text
Chest
Length
Waist
Hip
```

without recreating data.

---

# 115. Reorder Sizes

Normally Size System order applies.

But custom guides may explicitly control displayed subset/order.

Reordering should never change Variant identity.

---

# 116. Unit Change

If merchant changes the preferred display:

```text
inch
→
cm
```

the builder should ask whether to:

1. convert existing numeric values; or
2. reinterpret values.

The default safe operation should be **convert**, not silently reinterpret.

---

# 117. Dangerous Unit Reinterpretation

Example:

```text
Chest = 38 inch
```

Changing unit field to:

```text
cm
```

must not produce:

```text
38 cm
```

without deliberate confirmation.

That would corrupt measurements.

---

# 118. Undo

High-frequency matrix editing should support useful undo/redo behavior where practical.

Especially:

- paste;
- row deletion;
- column deletion;
- bulk change.

---

# 119. Unsaved Changes

If the user attempts to leave a modified chart, the system should prevent accidental data loss.

---

# 120. Revision History

Authorized staff should be able to see important changes:

```text
Revision 4
Aug 20, 2026
Changed by User X

M Chest:
38 → 39
```

This integrates with Audit.

---

# 121. Guide Usage

The dashboard should show:

```text
Used By
```

Example:

```text
Maevelle Women's Dress Guide

Used by:
48 Products
```

Clicking opens the affected products.

---

# 122. Safe Delete

A Size Guide used by Products should not simply disappear.

Possible actions:

```text
Archive
Replace references
Duplicate
Detach products
```

Direct deletion only when safe.

---

# 123. Archive Size Guide

Archived guides remain available to historical/linked data where necessary but do not normally appear as choices for new Products.

---

# 124. Product Editor Integration

Inside Product Editor:

```text
Sizing
│
├── Sizing enabled
├── Size System
├── Available Sizes
├── Size Guide
├── Measurement Subject
├── Guide Preview
└── Customize Guide
```

---

# 125. Product Type Defaults

Product Type may provide:

```text
Sizing enabled by default
Recommended Size System
Recommended Measurements
Recommended Guide
```

Example:

```text
Product Type: Dress

Sizing:
Enabled

Suggested:
Women's Alpha

Measurements:
Chest
Waist
Hip
Length
```

---

# 126. Product Type Does Not Lock Everything

The merchant may need a special supplier.

Therefore:

```text
Product Type Default
```

is not necessarily:

```text
Unchangeable Product Rule
```

Permissions/business rules may determine which overrides are allowed.

---

# 127. Creating Size Variant Values

When configuring Product options:

```text
Size
```

the admin should select existing Size Definitions.

Example:

```text
System: Women's Alpha

☐ XS
☑ S
☑ M
☑ L
☑ XL
```

The selected definitions become Size option values.

---

# 128. Prevent Duplicate Size Labels

Within one Product's Size Option, the system should not allow two selections that appear identically to the customer without clear differentiation.

Bad:

```text
M
M
```

representing two unrelated definitions.

---

# 129. Same Label Across Systems

Globally this is fine:

```text
Women's Alpha / M
Men's Alpha / M
Kids Alpha / M
```

They are different Size Definitions in different systems.

Display context determines the customer label.

---

# 130. Size Guide Compatibility Check

If Product sizes are:

```text
S
M
L
```

and selected Guide contains:

```text
XS
S
M
L
XL
```

this is valid.

The storefront can show either:

### Product-relevant rows only

or, if configured:

### Full guide

Recommended default:

> Show only sizes relevant to the Product unless the business explicitly wants the entire reference chart.

---

# 131. Missing Product Size From Guide

If Product sells:

```text
XXL
```

but Guide lacks XXL, the editor should warn:

```text
XXL has no measurement row.
```

Whether publication is blocked depends on Size Guide requirement configuration.

---

# 132. Size Chart Required

Product Types can define:

```text
Size Guide:
Required
Recommended
Optional
Not Applicable
```

Example:

```text
Dress:
Required/Recommended

Hair Clip:
Not Applicable
```

---

# 133. Publication Validation

Potential sizing publication checks:

```text
Configured Size Option valid
Selected Size Definitions valid
No duplicate size combination
Required Size Guide present
Required measurement rows complete
Measurement units valid
Guide published
```

---

# 134. Warning Example

```text
Warning:

Size XL is available for purchase
but its size guide row is incomplete.
```

Depending on business configuration, merchant can fix or publish with warning.

---

# 135. Storefront Fallback

If a Product has Size options but no Size Guide:

```text
Size buttons still function
```

if business policy allows.

But:

```text
Size Guide
```

button does not appear.

The storefront should never show a broken empty modal.

---

# 136. Size Chart Image

Some suppliers may provide only a chart image.

V1 may support an optional:

```text
Reference Image
```

but this should not replace structured measurements when the business wants structured functionality.

---

# 137. Image-Only Legacy Support

For migration/import scenarios:

```text
Structured Guide:
Not yet entered

Legacy Guide Image:
Available
```

can be allowed temporarily.

The system should clearly mark this as unstructured.

---

# 138. Size Guide Notes

Guide-level notes may include:

```text
Measurements may vary slightly due to manual measurement.
```

or:

```text
Measure while wearing light clothing.
```

These should remain separate from individual cell values.

---

# 139. Measurement-Specific Notes

A particular definition may also have instructions.

Example:

```text
Bust:
Measure around the fullest part of the bust.
```

This is reusable.

---

# 140. Product-Specific Note

A Product can add:

```text
This style is intentionally oversized.
```

without modifying the global Chest measurement definition.

---

# 141. Size Conversion Sets

Regional conversions should have reusable mapping objects.

Conceptually:

```text
Conversion Set:
Women's Footwear EU ↔ UK ↔ US
```

Mappings:

```text
Primary Size
Equivalent System
Equivalent Value
Confidence / Type if needed
```

---

# 142. Conversion Context Matters

Conversions may differ by:

```text
Men
Women
Children
Product type
Manufacturer
```

Therefore conversion mappings must have scope/context.

Do not build one global table:

```text
EU41 = US8
```

for every possible footwear scenario.

---

# 143. Supplier-Specific Conversion

A Product or supplier may override generic conversion mapping where actual manufacturer fit differs.

This should be possible later without modifying global standards for every product.

---

# 144. Approximate Conversion Label

When mapping is not exact, storefront can show:

```text
Approx.
```

instead of presenting false precision.

---

# 145. Internationalization

Size display labels may eventually be localized.

Example:

```text
Free Size
One Size
Adjustable
```

could have translated display values.

Stable internal code remains independent.

---

# 146. Measurement Label Localization

Reusable Measurement Definition:

```text
Waist Circumference
```

can later have translations.

This is another benefit of structured definitions.

---

# 147. API Representation

Sizing API should expose structured information.

Conceptual storefront output:

```text
sizeSystem
sizes
selectedSize
measurements
preferredUnit
availableUnits
guide
instructions
diagram
```

Not:

```text
sizeChartHtml
```

as the authoritative API.

---

# 148. Admin API

Administrative APIs should support:

```text
Create Size System
Create Size Definition
Create Measurement Definition
Create Size Guide
Create Revision
Update Matrix
Publish Revision
Assign Guide
Duplicate Guide
Archive Guide
```

All protected by permissions.

---

# 149. API Bulk Update

Matrix updates should support efficient bulk operations.

Updating 50 cells should not necessarily require:

```text
50 separate network requests
```

A transactional batch operation is preferable.

---

# 150. Concurrency

Two employees may edit the same guide.

V1 should prevent silent overwrite using:

```text
Version
Revision
Optimistic concurrency
```

or equivalent.

---

# 151. Atomic Guide Publishing

Publishing a Size Guide revision should be atomic.

Customers must not temporarily see:

```text
Rows from Revision 3
+
Columns from Revision 4
```

during update.

---

# 152. Audit Events

Important events:

```text
size_system.created
size_system.updated

size_definition.created
size_definition.deactivated

measurement_definition.created

size_guide.created
size_guide.updated
size_guide.published
size_guide.archived

product.size_guide_assigned
product.size_configuration_changed
```

---

# 153. Permissions

Suggested granular capabilities:

```text
sizing.view

sizing.guides.create
sizing.guides.edit
sizing.guides.publish
sizing.guides.archive

sizing.systems.manage
sizing.measurements.manage

products.sizing.edit
```

Potentially:

```text
sizing.global_definitions.manage
```

should be more restricted than editing a Product's guide.

---

# 154. Why Global Definition Permissions Matter

Deleting or changing:

```text
Chest Circumference
```

may affect hundreds of guides.

A Product Operator should not necessarily have permission to modify global sizing vocabulary.

---

# 155. Search

Business dashboard should support searching guides by:

```text
Name
Internal code
Size System
Product Type
Usage
Status
```

---

# 156. Filters

Useful filters:

```text
Published
Draft
Archived
Size System
Measurement Subject
Used / Unused
Product Type
```

---

# 157. Size Guide List

Potential columns:

```text
Guide
Size System
Subject
Sizes
Measurements
Used By
Status
Updated
```

---

# 158. Duplicate Detection

When creating:

```text
Maevelle Standard Dress
```

the system may warn if a similarly named Guide already exists.

Do not automatically prevent legitimate duplicates with different measurement data.

---

# 159. Sizing Analytics — Future

Structured sizing enables future analysis such as:

```text
Most sold size
Most returned size
Return rate by size
Size availability gaps
Size-specific sell-through
```

Analytics will derive from Order/Inventory data.

Sizing merely supplies structured identity.

---

# 160. Return Reason Integration — Future

A return could record:

```text
Reason:
Too Small
Too Large
```

Later we could analyze:

```text
Product X
Size M
20% returned as Too Small
```

This may inform merchandising or size-guide corrections.

Not V1 analytics scope, but our model makes it possible.

---

# 161. AI Size Recommendation — Future

A future service may use:

```text
Customer Measurements
Product Size Guide
Historical Return Data
Fit Preference
```

to recommend a variant.

This must remain a separate service/application capability.

Sizing provides trusted structured input.

---

# 162. Customer Measurement Profile — Future

Future account:

```text
Customer
├── Height
├── Chest
├── Waist
├── Hip
├── Foot Length
└── Fit Preference
```

could interact with sizing.

This introduces privacy considerations and is explicitly outside V1.

---

# 163. Custom / Made-to-Measure Products — Future

A future Product may allow the customer to enter:

```text
Chest
Waist
Length
Sleeve
```

during ordering.

These values are:

```text
Order-Line Customization
```

not pre-created Variant sizes.

Do not confuse custom measurements with normal Size Definitions.

---

# 164. Size Guide vs Variant Creation

The Size Guide shall never automatically create arbitrary variants merely because it contains rows.

Example guide:

```text
XS S M L XL XXL
```

Product only sells:

```text
S M L
```

Variants remain:

```text
S M L
```

Guide can contain broader reference data if business explicitly chooses.

---

# 165. Measurement Matrix Is Not Inventory Matrix

Even though both may visually resemble tables:

```text
Size Guide Matrix
```

and:

```text
Variant Inventory Matrix
```

are separate domains.

The UI can cross-link them but should not mix their source-of-truth data.

---

# 166. Supplier Measurement Import

Procurement workflow could later allow:

```text
Supplier Purchase
→
Supplier Size Sheet
→
Import into Product Size Guide
```

This is a valuable future integration point.

---

# 167. OCR Should Not Be Foundational

A supplier may send a size-chart image.

Future AI/OCR can assist converting it into structured measurements.

But the authoritative output should still be reviewed structured data.

The sizing architecture must not depend on OCR correctness.

---

# 168. Measurement Precision

Measurements should support controlled decimal precision.

Examples:

```text
38
38.5
38.25
```

Formatting rules may depend on unit.

Do not force integers.

---

# 169. Rounding

Unit conversion may produce:

```text
96.52 cm
```

The storefront may display:

```text
96.5 cm
```

according to presentation precision.

We should preserve sufficient canonical precision internally.

---

# 170. Do Not Convert Size Labels Automatically

If a Product uses:

```text
Size 38
```

the system must not assume:

```text
38 = 38 cm
```

A numeric Size Label is still a label unless explicitly tied to a measurement.

---

# 171. Measurement Semantics

A structured Measurement Definition may include:

```text
Semantic Code
Display Name
Subject
Quantity Type
Allowed Units
Instructions
Diagram
```

Example:

```text
Code:
body.chest_circumference

Quantity:
Length

Allowed:
mm, cm, inch
```

---

# 172. Compatible Units

A Length measurement can convert:

```text
cm ↔ inch
```

but not:

```text
cm ↔ kg
```

The unit system must validate dimension compatibility.

---

# 173. Text Measurements

Some size-guide cells may genuinely be non-numeric.

Example:

```text
Fit:
Relaxed
```

However that is usually better represented as a Product/Size attribute rather than a physical Measurement.

The builder should discourage turning every arbitrary text field into a Measurement column.

---

# 174. Reusable Size Profiles

Potential Product Type configuration:

```text
Sizing Profile:
Women's Dress
```

which bundles:

```text
Suggested Size System
Suggested Measurements
Suggested Measurement Subject
Suggested Guide presentation
```

This can reduce setup time.

We can implement this initially through Product Type sizing configuration rather than introducing another complex entity unless needed.

---

# 175. Default Maevelle Sizing Templates

For launch, Maevelle can configure practical templates such as:

```text
Women's Dress — Garment Measurements
Women's Top — Garment Measurements
Women's Bottom — Garment Measurements
Footwear — Foot Length
Ring — Diameter/Circumference
Free Size Apparel
```

These are business data/configuration, not hard-coded software rules.

---

# 176. Default Template Can Be Edited

Business admins should be able to adapt defaults as the catalog evolves.

No developer deployment should be required merely to add:

```text
Thigh Circumference
```

to a relevant product type/guide.

---

# 177. Sizing Domain Boundaries

Sizing owns:

```text
Size systems
Size definitions
Measurement definitions
Size guides
Size-guide revisions
Measurement matrices
Conversion mappings
Instructions
Sizing configuration
```

Sizing does **not** own:

```text
Product identity
Variants
Inventory
Selling price
Supplier purchase
Orders
Returns
Customer accounts
Media binary storage
```

---

# 178. Relationship Map

```text
Organization
│
├── Size Systems
│    ├── Size Definition
│    ├── Size Definition
│    └── Size Definition
│
├── Measurement Definitions
│
├── Size Guides
│    ├── Revision
│    │    ├── Sizes
│    │    ├── Measurements
│    │    ├── Matrix Values
│    │    ├── Instructions
│    │    └── Diagram Reference
│    │
│    └── Revision
│
└── Conversion Sets

Product Type
      │
      └── Sizing Configuration
              │
Product ──────┼──── Size Guide Assignment
      │       │
      └── Size Option
              │
              └── Size Definitions
                      │
                    Variant
```

---

# 179. Catalog Relationship

```text
CATALOG

Product
 ├── Product Option: Color
 └── Product Option: Size
                   │
                   ▼
              SIZING DOMAIN
              Size Definition
```

Sizing enriches the Catalog Size option.

It does not replace Catalog variants.

---

# 180. Media Relationship

```text
Sizing
  ↓
Measurement Diagram Reference
  ↓
Media Asset
```

Media Library owns:

```text
File
Storage
Transformation
Usage
```

Sizing owns why the asset is being referenced.

---

# 181. Search Relationship

Storefront Search may index:

```text
Available size labels
```

Example query/filter:

```text
Size = M
```

But sizing itself does not own the search index.

---

# 182. Order Relationship

Order Item snapshot should preserve:

```text
Selected Size Label
Selected Size Definition ID
Selected Variant
```

The entire Size Guide does not normally need to be copied into every Order.

If future legal/business requirements demand historical guide preservation, published revisions provide stable reference.

---

# 183. Guide Revision Helps Historical Context

Suppose Product used:

```text
Guide Revision 3
```

when an order occurred.

Later:

```text
Revision 4
```

changes measurements.

Stable revision identity can help answer:

> What guide was published when the customer ordered?

This is another reason revisions are valuable.

---

# 184. Guide Revision Retention

Published revisions referenced by operational history should not be destructively erased.

They can become:

```text
Superseded
Archived
```

while remaining readable.

---

# 185. Size Definition Rename

Renaming:

```text
Extra Large
→
XL
```

should not recreate inventory Variants.

Identity remains stable.

Display label changes.

Historical Order snapshots remain unchanged where appropriate.

---

# 186. Size Definition Deactivation

If:

```text
XXXL
```

is no longer used:

```text
Deactivate Size Definition
```

should prevent new use while preserving existing Products/history.

---

# 187. Measurement Definition Rename

Renaming:

```text
Dress Length
→
Garment Length
```

should preserve matrix associations through stable identifiers.

Never identify measurements by display label alone.

---

# 188. Measurement Definition Deletion

If used by guides:

```text
Chest
```

cannot simply be deleted.

Possible:

```text
Deactivate
Replace
Merge
```

according to safe lifecycle rules.

---

# 189. Guide Deletion

Never hard-delete a published guide referenced by Products/history without safeguards.

Preferred:

```text
Archive
```

---

# 190. Size System Deletion

Same principle.

If system is used:

```text
Cannot delete directly.
```

Deactivate/archive instead.

---

# 191. Performance

A Product page should not require dozens of database queries to assemble its size guide.

Storefront read models should retrieve:

```text
Product sizes
Availability
Published guide
Measurements
```

efficiently.

---

# 192. Caching

Published Size Guides are good candidates for caching because they change much less frequently than inventory.

Publishing a new revision can invalidate the relevant cached representation.

---

# 193. Storefront Read Projection

A storefront-oriented representation might conceptually provide:

```text
guideId
revisionId
title
subject
sizes[]
measurements[]
matrix
unit
alternativeUnits
instructions
diagram
```

rather than exposing all admin/audit information.

---

# 194. Matrix Storage Warning

We should not decide yet whether the database stores matrix values as:

```text
Rows
Cells
Relational values
JSON
Hybrid
```

Domain architecture comes first.

Requirements that matter:

- structured values;
- validation;
- efficient retrieval;
- revisioning;
- bulk update;
- unit handling.

Schema design can choose the best representation later.

---

# 195. Important Sizing Invariants

### SIZ-INV-001

Every Size Definition belongs to a Size System.

### SIZ-INV-002

Size order is explicit.

### SIZ-INV-003

Measurement values have explicit semantics.

### SIZ-INV-004

Numeric physical measurements have valid compatible units.

### SIZ-INV-005

Body and garment measurements are distinguishable.

### SIZ-INV-006

Size label and measurement value are not the same concept.

### SIZ-INV-007

Product Size option values must correspond to valid configured Size Definitions where structured sizing is used.

### SIZ-INV-008

A Size Guide cannot contain duplicate logical rows for the same Size Definition in one matrix context.

### SIZ-INV-009

A published Guide revision is immutable or changed through a new controlled revision.

### SIZ-INV-010

Archived/deactivated sizing definitions must not invalidate historical references.

### SIZ-INV-011

Size Guide changes do not directly alter Inventory.

### SIZ-INV-012

Regional conversion does not create duplicate physical inventory Variants.

### SIZ-INV-013

Unit conversion and size-system conversion are different operations.

### SIZ-INV-014

Numeric size labels must not automatically be interpreted as measurement values.

---

# 196. Edge Case — Same M, Different Products

```text
Dress A:
M Chest 38"

Dress B:
M Chest 40"
```

Valid.

Both can use the same Size System and different Size Guides.

---

# 197. Edge Case — Same Product, Different Color Measurements

Rare but possible:

```text
Red / M
```

and:

```text
Blue / M
```

may come from different manufacturing batches/suppliers and differ slightly.

V1 should **not** immediately create variant-level size charts unless a real business need emerges.

Recommended handling:

- separate Products if sizing materially differs; or
- assign a Product-specific guide representing the actual range.

Variant-specific measurement override can remain future capability.

---

# 198. Edge Case — Supplier Uses Wrong Label

Supplier says:

```text
XL
```

but Maevelle decides customer-facing size should be:

```text
L
```

Valid through supplier variant mapping.

Do not change global XL definition.

---

# 199. Edge Case — No Measurements

Product uses:

```text
S M L
```

but supplier gives no measurements.

If business policy permits, the Product can still use size options without a structured guide.

The dashboard should indicate:

```text
Size Guide Missing
```

rather than invent measurements.

---

# 200. Edge Case — Range

```text
Free Size

Bust:
Fits approximately 32–38 in
```

Valid structured range.

---

# 201. Edge Case — Measurement Not Applicable

Guide:

```text
Size   Chest   Waist   Sleeve
S      36      30      22
M      38      32      23
L      40      34      N/A
```

N/A should have explicit empty/not-applicable semantics rather than a numeric zero.

---

# 202. Edge Case — One Regional Size Has Two Labels

If a conversion set cannot safely determine one exact equivalent, the storefront should show:

```text
Approx. US 8–8.5
```

when configured, rather than creating false certainty.

---

# 203. Edge Case — Product Has Waist and Inseam Options

```text
Waist:
30 32 34

Length:
30 32
```

Variants can be generated from these independent structured size-related options.

No special `Size` field required.

---

# 204. Edge Case — Size Row Removed

Guide currently contains:

```text
S M L XL
```

Merchant removes:

```text
XL
```

but Product still sells XL.

The builder should warn before publication.

---

# 205. Edge Case — Shared Guide Update

82 Products use a Guide.

Merchant updates `M`.

System must show impact and use controlled revision publishing.

No silent instant mutation.

---

# 206. Edge Case — Conversion Mapping Updated

Changing a regional equivalence should not create/recreate Variants.

It only changes presentation/reference mapping.

---

# 207. Edge Case — Archived Size Still in Historical Order

Order from 2026:

```text
Size:
Old Size 3
```

Size definition archived in 2027.

The Order remains understandable.

---

# 208. Edge Case — Changed Size Display Label

Current Product displays:

```text
Medium
```

but historical Order snapshot displayed:

```text
M
```

That is acceptable.

Historical commercial records preserve transaction-time presentation where required.

---

# 209. V1 Scope — Confirmed

V1 Sizing includes:

```text
✓ Size Systems
✓ Size Definitions
✓ Explicit ordering

✓ Custom Size Systems

✓ Measurement Definitions
✓ Measurement Subjects
✓ Measurement Units
✓ Measurement Instructions

✓ Body measurements
✓ Garment measurements
✓ Foot measurements
✓ Ring/jewelry measurements
✓ Generic measurement support

✓ Exact values
✓ Numeric ranges
✓ Missing / N/A values

✓ Structured Size Guides
✓ Measurement Matrix

✓ Reusable Guides
✓ Guide revisions
✓ Draft / Publish / Archive

✓ Product assignment
✓ Product customization / duplication

✓ Product Type sizing defaults

✓ Catalog Size Option integration
✓ Variant integration

✓ Size Guide builder

✓ Efficient keyboard/matrix editing
✓ Copy/paste support

✓ Unit conversion
✓ Display unit switching

✓ Measurement diagrams/images

✓ Guide usage tracking
✓ Safe deletion / archive

✓ Storefront Size Guide
✓ Mobile UX

✓ Apparel
✓ Numeric apparel
✓ Free Size
✓ Footwear
✓ Children's sizing
✓ Ring sizing
✓ Custom sizing

✓ Permission controls
✓ Audit integration
✓ API-first structured output
```

---

# 210. Preferred V1 Enhancements

Strongly preferred if development complexity remains reasonable:

```text
CSV/XLSX Size Guide import

Spreadsheet multi-cell paste

Regional equivalence display

Basic reusable conversion sets

Guide comparison / revision diff

Product readiness warnings
```

---

# 211. Deferred

Not required for V1:

```text
AI size recommendation

Customer body profile

Automatic fit prediction

Return-based fit learning

3D body scanning

Digital fitting room

Variant-specific measurement overrides

Complex inheritance chains

Interactive diagram hotspots

Automatic supplier-image OCR ingestion

Full international sizing standards database

Manufacturer-specific automatic conversion engine

Made-to-measure checkout

Smart sizing analytics
```

The architecture leaves room for them.

---

# 212. Decisions Established

### Decision S-001

**Sizing is a dedicated domain.**

### Decision S-002

**Size label/designation and physical measurement are separate.**

### Decision S-003

**Body measurements and garment measurements are separate semantic concepts.**

### Decision S-004

**Size System defines reusable naming and ordering.**

### Decision S-005

**Size Definition represents an individual size within a system.**

### Decision S-006

**Measurement Definition describes what is physically measured.**

### Decision S-007

**Measurements carry subject/context.**

### Decision S-008

**Measurements use structured units.**

### Decision S-009

**Numeric size labels are not automatically physical measurements.**

### Decision S-010

**Unit conversion and regional size conversion are different systems.**

### Decision S-011

**Size Guides are structured data, not HTML tables.**

### Decision S-012

**Size Guides are reusable.**

### Decision S-013

**Reusable Guides use controlled revisions to prevent dangerous global changes.**

### Decision S-014

**Products may customize/duplicate reusable Guides.**

### Decision S-015

**Catalog Size Option values connect to Size Definitions.**

### Decision S-016

**Sizing does not own Variant inventory.**

### Decision S-017

**Size Guides may contain sizes not currently available in inventory.**

### Decision S-018

**Regional equivalent labels do not create duplicate inventory Variants.**

### Decision S-019

**Products may use multiple size-related Options such as Waist and Length.**

### Decision S-020

**Free Size and No Sizing are different states.**

### Decision S-021

**Product Types provide sizing defaults/recommendations without permanently hard-coding them.**

### Decision S-022

**The dashboard Size Guide Builder should behave like an efficient structured matrix/spreadsheet.**

### Decision S-023

**Published Guide revisions should remain historically identifiable.**

### Decision S-024

**Maevelle will support custom business sizing instead of forcing compliance with one external standard.**

### Decision S-025

**Supplier sizing and storefront sizing may differ and will later be linked through Procurement mappings.**

---

# 213. Result

We now have a sizing architecture capable of representing:

```text
M
```

as easily as:

```text
EU 41
```

or:

```text
Waist 32 / Length 30
```

or:

```text
3–6 Months
```

or:

```text
Ring Size 7
```

or:

```text
Free Size
```

while still preserving real structured measurements underneath.

The system is therefore not:

```text
Product
└── Size Chart HTML
```

It is:

```text
SIZE SYSTEM
    ↓
SIZE DEFINITIONS

MEASUREMENT DEFINITIONS
    ↓
STRUCTURED SIZE GUIDE
    ↓
PUBLISHED REVISION
    ↓
PRODUCT SIZE CONFIGURATION
    ↓
CATALOG OPTIONS
    ↓
VARIANTS
    ↓
STOREFRONT SELECTION
```

---

# 214. Next Domain

The next deep domain should be:

```text
docs/domains/inventory/inventory-architecture.md
```

Inventory is the next major high-risk foundation because it must connect:

```text
Variant
Warehouse
Physical Stock
Available Stock
Reservations
Orders
Cancellations
Returns
Damaged Goods
Purchasing
Receiving
Transfers
Manual Adjustments
Stocktake
Concurrency
Audit
```

It needs to answer not merely:

```text
How much stock do we have?
```

but:

```text
Where is it?

Why is that quantity there?

How much physically exists?

How much is already promised?

How much can we sell?

How much is incoming?

What is damaged?

What moved?

Who moved it?

What business operation caused the movement?

What happens if two customers buy the last unit simultaneously?
```

The Inventory Architecture should therefore be designed before serious database schema work begins.

---

**End of Sizing & Measurement Architecture v0.1**
