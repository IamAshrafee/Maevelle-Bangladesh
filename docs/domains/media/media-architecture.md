# Maevelle Ecommerce — Media & Digital Asset Architecture

**Document:** `docs/domains/media/media-architecture.md`
**Status:** Initial Domain Design / Living Document
**Version:** 0.1
**Related:** `catalog-architecture.md`, `sizing-architecture.md`, `procurement-architecture.md`, `inbound-shipment-architecture.md`, `payment-architecture.md`, `customer-architecture.md`, `requirements.md`, `scope.md`

---

# 1. Purpose

The Media domain defines how Maevelle uploads, stores, processes, secures, reuses, delivers, searches, relates, and eventually removes digital files.

Media is used throughout the platform:

```text
Catalog
├── Product galleries
├── Variant galleries
├── Color galleries
└── SEO/social images

Sizing
├── Size diagrams
└── Measurement illustrations

Reviews
└── Customer review images

Procurement
├── Supplier product photos
├── Quotations
├── Proforma invoices
└── Supplier screenshots

Shipments
├── Packing lists
├── Airway bills
├── Customs documents
├── Damage photos
└── Transport receipts

Payments
├── Payment evidence
├── Refund evidence
└── Settlement reports

Inventory
├── Damage evidence
└── Adjustment attachments

Customers
└── Future support attachments

CMS / Marketing
└── Future content assets
```

A single common media infrastructure should serve all of these.

---

# 2. Core Principle

> **Media Asset is not the same thing as Product Image.**

An Asset is reusable.

Its relationship to another business entity determines how it is being used.

Conceptually:

```text
MEDIA ASSET
    │
    ├── Used by Product
    │      Role: Gallery Image
    │
    ├── Used by Variant Color = Red
    │      Role: Variant Gallery
    │
    ├── Used by Size Guide
    │      Role: Measurement Diagram
    │
    └── Used by future CMS
           Role: Hero Image
```

One file does not need to be uploaded four times simply because it appears in four places.

---

# 3. Second Core Principle

> **Storage, Asset identity, and Asset usage are separate concepts.**

Conceptually:

```text
STORED OBJECT
     ↓
MEDIA ASSET
     ↓
ASSET USAGE
     ↓
BUSINESS ENTITY
```

Each answers a different question.

### Stored Object

```text
Where are the bytes?
```

### Media Asset

```text
What file does Maevelle know this as?
```

### Asset Usage

```text
Where and why is this Asset currently used?
```

This separation gives us safe reuse, usage tracking, storage portability, and controlled deletion.

---

# 4. Third Core Principle

> **Public commerce media and private operational documents may use the same infrastructure without having the same access policy.**

Examples:

```text
PUBLIC
Product photo

PRIVATE
Supplier invoice

PRIVATE
bKash payment evidence

PRIVATE
Customs document

PUBLIC
Size-guide diagram
```

The Media domain must know the difference.

---

# 5. Research-Informed Direction

WordPress treats uploaded media as reusable attachment records with metadata such as file path, image width/height, file size, generated sizes, and image metadata rather than treating an upload as merely a URL string.

Shopify similarly maintains media as structured platform objects that can be associated with Products and Variants and served through CDN-backed media infrastructure rather than storing raw image URLs directly on every Product field.

Object-storage systems such as Amazon S3 support time-limited presigned URLs so clients can upload or access objects without receiving permanent storage credentials. This supports a scalable direct-upload architecture for Maevelle later.

Next.js currently provides image optimization capabilities including appropriately sized images, modern formats, lazy loading, and remote-image transformation support. Maevelle can use these presentation capabilities while keeping the underlying Media domain independent from Next.js itself.

---

# 6. Media Domain Responsibilities

The Media domain owns:

```text
Media Assets

Stored Object References

Asset Types

Asset Metadata

Upload Sessions

Upload Validation

Asset Processing

Image Metadata

Document Metadata

Derived Media

Thumbnails

Asset Visibility

Asset Access Policies

Asset Usage

Usage History

Asset Search

Asset Tags

Asset Collections / Folders

Duplicate Detection

Asset Lifecycle

Safe Deletion

Storage Provider Abstraction

Secure Delivery

Media Permissions

Audit
```

---

# 7. Media Does Not Own

Media does not determine:

```text
Which Product is published

Which Review is approved

Which Purchase is valid

Which Payment evidence proves payment

Which Shipment document is legally correct

Which Size Guide is active
```

Those domains own business meaning.

Media owns the file infrastructure and relationships.

---

# 8. Primary Concepts

The major conceptual entities are:

```text
Media Asset

Stored Object

Derived Asset / Rendition

Asset Usage

Asset Collection

Upload Session

Media Processing Job
```

These are conceptual domain entities.

They are **not yet final database tables**.

---

# 9. Media Asset

A **Media Asset** is Maevelle's stable logical representation of an uploaded or imported file.

Example:

```text
Asset:
AST-001582

Type:
IMAGE

Original Filename:
red-dress-front.jpg

MIME:
image/jpeg

Visibility:
PUBLIC

Status:
READY
```

---

# 10. Stable Asset Identity

Asset identity must not depend on:

```text
Filename

Storage URL

CDN hostname

Product relationship
```

Those can all change.

Asset ID remains stable.

---

# 11. Why URL Cannot Be Asset Identity

Today:

```text
https://cdn-a.example/abc.jpg
```

Tomorrow Maevelle could migrate to:

```text
https://cdn-b.example/objects/xyz
```

Product relationships should not need migration simply because delivery infrastructure changed.

Therefore business domains reference:

```text
Asset ID
```

not permanent hard-coded URLs as identity.

---

# 12. Stored Object

The Stored Object represents the physical file bytes in object storage.

Conceptually:

```text
Storage Provider

Bucket / Container

Object Key

Byte Size

Checksum

Content Type

Created At
```

---

# 13. Storage Provider Independence

Media domain should not permanently assume:

```text
AWS S3 only
```

A compatible object-storage abstraction allows future use of:

```text
Amazon S3

Cloudflare R2

Backblaze

MinIO

Other S3-compatible services
```

without changing Catalog or Product relationships.

---

# 14. V1 Storage Direction

Recommended architecture:

```text
Application Database
      │
      └── Media metadata / relationships

Object Storage
      │
      └── File bytes

CDN / Delivery Layer
      │
      └── Public optimized media
```

Do not store large uploaded files directly inside PostgreSQL under normal operation.

---

# 15. Why Object Storage

Media files have very different:

```text
storage

delivery

caching

lifecycle

bandwidth
```

requirements from transactional relational data.

Therefore object storage is the appropriate infrastructure boundary.

---

# 16. Database Stores References

Conceptually PostgreSQL stores:

```text
Asset ID

Object key

Metadata

Relationships

Access classification

Processing state
```

rather than image bytes.

---

# 17. Object Key

Storage key should be system-controlled.

Example conceptual form:

```text
organization-id/
assets/
year/
random-id
```

Do not use user filename as the only storage key.

---

# 18. Why Not Filename-Based Keys

Two users may upload:

```text
image.jpg
```

and:

```text
image.jpg
```

Filename collision should not overwrite an existing asset.

Generated/random object identity avoids this.

---

# 19. Original Filename

Still preserve:

```text
red-dress-front.jpg
```

as metadata.

Useful for:

```text
search

download naming

admin UX

document identification
```

---

# 20. Asset Type

V1 should support at least:

```text
IMAGE

DOCUMENT
```

Foundation for:

```text
VIDEO

AUDIO

MODEL_3D

OTHER
```

---

# 21. MIME Type

Store validated MIME/content type.

Examples:

```text
image/jpeg

image/png

image/webp

application/pdf
```

Do not determine file type using extension alone.

---

# 22. File Extension

Preserve a normalized extension where useful:

```text
jpg

png

pdf
```

but extension is secondary metadata.

---

# 23. Media Image Metadata

For images:

```text
Width

Height

Aspect Ratio

File Size

Format

Orientation
```

Potential:

```text
Color profile

EXIF extraction status
```

WordPress similarly extracts image dimensions, generated sizes, and image metadata for attachment records.

---

# 24. Document Metadata

For documents:

```text
MIME Type

File Size

Page Count if processing supports it

Document Classification

Original Filename
```

Page count can be optional.

---

# 25. Asset Title

Human-editable title:

```text
Red Floral Dress — Front
```

separate from filename.

---

# 26. Alt Text

Public visual Assets should support accessibility-oriented alternative text.

Example:

```text
Red floral midi dress shown from the front
```

Alt text should not simply copy filename automatically as final content.

---

# 27. Alt Text Context

An interesting complication:

One Asset could appear in several contexts.

The same photo could be:

```text
Product Gallery

Homepage Hero

Collection Banner
```

and ideal alt text may differ by usage.

Therefore architecture should support:

```text
Asset default alt text
```

and potentially:

```text
Usage-specific alt override
```

---

# 28. Caption

Optional human-visible caption:

```text
Available in three colors.
```

This is different from Alt Text.

---

# 29. Description / Internal Notes

Optional internal metadata:

```text
Photoshoot Aug 2026

Original daylight version
```

---

# 30. Asset Tags

Reusable internal tags:

```text
product-shoot

summer-2026

red

supplier

invoice

marketing
```

These aid asset search.

---

# 31. Tags Are Not Security

Never use:

```text
tag = private
```

to control access.

Visibility/access is structured policy.

---

# 32. Asset Collections / Folders

Users expect Media Library organization.

Recommended concept:

```text
Collection / Folder
```

Examples:

```text
Products

Supplier Documents

Summer Campaign

Brand Assets

Size Guides
```

---

# 33. Folder Is Organizational, Not Storage Path

Important:

```text
Media Folder
≠
Object Storage Folder
```

Moving an Asset from:

```text
Summer
→
Archive
```

should not require physically moving storage objects or changing URLs.

Folder is logical organization metadata.

---

# 34. Multiple Collections?

A sophisticated DAM could allow one Asset in several Collections.

V1 can choose:

```text
One primary folder
+
Tags
```

for simpler UX.

Architecture should not make future multi-collection grouping impossible.

---

# 35. Asset Visibility

Minimum classifications:

```text
PUBLIC

PRIVATE
```

Potential:

```text
RESTRICTED
```

later.

---

# 36. Public Asset

Examples:

```text
Product images

Size diagrams

Public brand logo
```

can be safely served to storefront users.

---

# 37. Private Asset

Examples:

```text
Supplier invoice

Payment evidence

Refund screenshot

Shipment customs documents

Internal damage evidence
```

must not have unrestricted public URLs.

---

# 38. Private by Default for Operational Attachments

When a file is uploaded through:

```text
Payment

Procurement

Shipment

Inventory adjustment
```

default classification should normally be:

```text
PRIVATE
```

unless the business workflow explicitly says otherwise.

---

# 39. Public by Context?

Do not infer public status merely because an Asset gets attached to a Product.

Instead require valid Asset visibility/publication handling.

This avoids accidentally exposing an internal supplier photograph or document.

---

# 40. Asset Usage

An **Asset Usage** represents a relationship between Asset and another business entity.

Conceptually:

```text
Asset

Target Entity Type

Target Entity ID

Usage Role

Position

Optional Context

Created At
```

---

# 41. Example Usage

```text
Asset:
AST-100

Entity:
Product P-22

Role:
PRODUCT_GALLERY

Position:
1
```

---

# 42. Another Usage

Same Asset:

```text
Asset:
AST-100

Entity:
Collection Summer

Role:
COLLECTION_CARD_IMAGE
```

The Asset has two active usages.

---

# 43. Usage Role

Controlled roles might include:

```text
PRODUCT_GALLERY

PRODUCT_PRIMARY

VARIANT_GALLERY

OPTION_VALUE_GALLERY

SIZE_GUIDE_DIAGRAM

REVIEW_IMAGE

SUPPLIER_ATTACHMENT

PURCHASE_ATTACHMENT

SHIPMENT_DOCUMENT

PAYMENT_EVIDENCE

REFUND_EVIDENCE

INVENTORY_EVIDENCE

CUSTOMER_ATTACHMENT
```

Future:

```text
CMS_HERO

BLOG_IMAGE

MARKETING_ASSET
```

---

# 44. Role Is Domain-Specific Meaning

Media infrastructure stores the relationship.

The target business domain decides whether that usage is semantically valid.

Example:

Catalog decides whether:

```text
PRODUCT_PRIMARY
```

can be assigned.

Media should not know Product publication rules.

---

# 45. Product Gallery

Product general gallery:

```text
Product
   ↓
Asset Usage[]
```

with explicit ordering.

---

# 46. Gallery Order

Store:

```text
Position
```

or equivalent.

Do not infer gallery order from:

```text
upload date

filename

Asset ID
```

---

# 47. Primary Product Image

Primary Product visual may be:

```text
Usage role
```

or:

```text
first ordered gallery item
```

We should choose one unambiguous rule during Catalog schema design.

Recommended:

> Gallery ordering is authoritative, with optional explicit primary/cover semantics where contexts require it.

---

# 48. Variant Gallery

Variant can have its own Asset Usage relationships.

But as established in Catalog Architecture, we should avoid copying the same Red images onto:

```text
Red / S

Red / M

Red / L
```

individually.

---

# 49. Option-Value / Color Gallery Context

Recommended media-assignment capability:

```text
Product
   ↓
Option Value:
Color = Red
   ↓
Gallery Assets
```

Then all Red Variants inherit that gallery.

---

# 50. Variant-Specific Override

Rare example:

```text
Red / Limited Edition
```

might need unique images.

Architecture should allow true Variant-level media override in addition to Color/Option-value gallery.

---

# 51. Gallery Resolution

Conceptually storefront resolves:

```text
Variant-specific media?
     │
    yes → use
     │
     no
     ▼
Relevant option/color media?
     │
    yes → use
     │
     no
     ▼
Product general gallery
```

Exact precedence must be deterministic.

---

# 52. Partial Media Override

Question:

If Variant has one custom image, should Product images disappear?

We should support explicit gallery behavior rather than guess.

Possible modes:

```text
REPLACE

APPEND / INHERIT
```

V1 can default Color Gallery to replace general gallery while supporting fallback when empty.

Avoid hidden complex inheritance in first implementation.

---

# 53. Usage-Specific Ordering

The same Asset could be:

```text
Position 1
```

in Product A and:

```text
Position 4
```

in Collection B.

Therefore ordering belongs to Usage relationship, not Asset.

---

# 54. Reusable Asset

If staff selects an existing Asset:

```text
do not duplicate the file.
```

Create another Usage.

This is one of the main goals of the Media Library.

---

# 55. Usage Tracking

Asset detail should show:

```text
Currently Used By:

3 Products

1 Size Guide

2 Collections
```

and allow drill-down.

---

# 56. Usage History

Current usage is not enough.

Useful history:

```text
Added to Product A

Removed from Product A

Used in Campaign B

Removed
```

can support audit/troubleshooting.

---

# 57. Current Usage vs Historical Usage

Asset may currently be:

```text
Unused
```

while historical usage shows:

```text
Used in 12 Products previously.
```

These are different concepts.

---

# 58. Unused Asset

Definition:

```text
No active Asset Usage relationships
```

not:

```text
Not downloaded recently
```

---

# 59. Unused Asset Filter

Media Library should provide:

```text
Unused
```

view.

Useful for storage cleanup.

---

# 60. Recently Uploaded

Other useful views:

```text
Recently Uploaded

Images

Documents

Private Files

Public Files

Unused

Processing Failed
```

---

# 61. Asset Search

Search should support:

```text
Filename

Title

Alt Text

Tags

Asset ID

File Type
```

Potential:

```text
Related Product SKU

Related Product name
```

through usage-aware search.

---

# 62. Search by Usage

Example:

```text
Show Assets used by Product:
Floral Dress
```

or:

```text
All payment evidence files
```

---

# 63. Media Library UX

Recommended layout:

```text
Grid View

List View
```

Grid works well for images.

List view works well for:

```text
PDFs

documents

financial evidence
```

---

# 64. Grid Card

Potential image card shows:

```text
Thumbnail

Filename / Title

Dimensions

File Size

Usage count

Visibility

Status
```

without overwhelming the interface.

---

# 65. Asset Detail Drawer/Page

Recommended:

```text
Preview

Metadata

Usage

Access

Versions / Derivatives

Activity

Audit
```

---

# 66. Asset Picker

Any domain requiring media should use one reusable Asset Picker component.

Example Product Editor:

```text
[ Select Media ]
```

opens Media Library.

Users can:

```text
Upload New

Search Existing

Select Multiple

Filter
```

---

# 67. No Separate Product Upload System

Avoid:

```text
Product uploader

Review uploader

Shipment uploader

Payment uploader
```

each implementing independent storage logic.

They should all use Media infrastructure with domain-specific permissions/configuration.

---

# 68. Upload Session

An Upload Session represents the controlled process of adding file bytes.

Conceptually:

```text
Request Upload

Validate Request

Issue Upload Target

Upload Bytes

Confirm Upload

Validate Stored Object

Process

Create/Activate Asset
```

---

# 69. Direct Upload

For sufficiently large files or scalable deployments:

```text
Browser
   ↓
Presigned Upload URL
   ↓
Object Storage
```

can avoid routing every byte through the main Next.js application server.

S3 officially supports presigned upload URLs that grant temporary upload permission without exposing storage credentials.

---

# 70. Upload Authorization Still Comes From Maevelle

The browser cannot generate unrestricted upload permissions itself.

Flow:

```text
Authenticated user
      ↓
Maevelle checks permission
      ↓
Maevelle creates limited upload target
      ↓
Browser uploads
```

---

# 71. Upload URL Must Be Limited

Presigned/direct upload authorization should be constrained by:

```text
Expiry

Object key

Operation

Expected constraints where supported
```

not provide general bucket access.

---

# 72. Upload Confirmation

Successful HTTP upload alone should not automatically make an Asset ready.

Application should confirm:

```text
Object exists

Expected file received

Metadata obtainable

Validation passed
```

---

# 73. Upload Status

Recommended lifecycle:

```text
PENDING_UPLOAD
       ↓
UPLOADED
       ↓
VALIDATING
       ↓
PROCESSING
       ↓
READY
```

Exceptional:

```text
FAILED

REJECTED

QUARANTINED
```

---

# 74. Pending Upload

Upload session exists but bytes have not completed.

---

# 75. Uploaded

Bytes exist but validation/processing is not complete.

Do not publish storefront image yet.

---

# 76. Validating

Check:

```text
File size

File signature/type

Allowed format

Basic integrity

Security validation
```

---

# 77. Processing

For image:

```text
Extract metadata

Correct orientation where appropriate

Create derivatives

Generate thumbnail

Prepare optimized formats
```

---

# 78. Ready

Asset can be used according to its visibility/access classification.

---

# 79. Failed

Processing failed.

Original may remain temporarily available for retry/admin investigation.

---

# 80. Quarantined

Potentially unsafe/suspicious upload.

It must not be delivered as normal Asset.

---

# 81. File Validation

Never trust only:

```text
filename extension

browser Content-Type header
```

Validate using server-side inspection/file signatures and allowed-content rules.

---

# 82. Allowed File Types

V1 image allowlist may include appropriately supported:

```text
JPEG

PNG

WebP
```

Potential:

```text
AVIF
```

depending on processing path.

Documents:

```text
PDF
```

plus selected office formats only where genuinely required.

Do not make arbitrary executable file types uploadable by default.

---

# 83. SVG

SVG deserves special security treatment because it can contain active content.

Recommended V1:

```text
Do not allow arbitrary untrusted SVG uploads
```

unless sanitization policy is intentionally implemented.

Brand/admin-controlled SVG can be added later safely.

---

# 84. Executables

Reject:

```text
.exe

.sh

.bat

scripts
```

through ordinary Media upload.

---

# 85. Archive Files

ZIP/RAR should not automatically be accepted merely because they are documents.

Only enable if a real business requirement exists.

---

# 86. Upload Size Limits

Limits should depend on Asset class.

Example:

```text
Product image:
reasonable image limit

PDF document:
larger limit

Future video:
much larger limit
```

Configurable, but with safe system ceilings.

---

# 87. Organization Quotas — Future

Future SaaS/multi-business mode may support:

```text
Storage quota

Bandwidth quota
```

Not needed for Maevelle V1.

---

# 88. Image Original

Preserve an original/source image.

Do not destructively replace the only high-quality uploaded copy with a thumbnail.

---

# 89. Why Preserve Original

Future processing may need:

```text
New image format

Different thumbnail dimensions

Higher-resolution crop

New CDN provider
```

Without the original, quality can degrade after repeated transformations.

---

# 90. Derived Asset / Rendition

Image Asset may generate derived representations.

Example:

```text
Thumbnail

Small

Medium

Large

Optimized storefront
```

---

# 91. Rendition Identity

A rendition belongs to its source Asset.

Conceptually:

```text
Asset AST-100
├── Original
├── 320px
├── 640px
├── 1280px
└── Thumbnail
```

---

# 92. Derivatives Are Not Independent Business Assets

Normally users should not attach:

```text
AST-100-640px
```

as a separate Product media item.

They attach:

```text
AST-100
```

Delivery system selects suitable rendition.

---

# 93. Image Delivery

Storefront asks Media presentation layer for a suitable image.

Depending on implementation:

```text
CDN transformation

Pre-generated rendition

Next.js Image optimizer
```

may provide the final response.

---

# 94. Next.js Boundary

Next.js image optimization is a presentation/deployment capability, not our source-of-truth Media model. Next.js currently supports serving appropriately sized images and modern formats and can optimize remote images.

Therefore Maevelle should be able to change frontend delivery architecture later without changing Asset relationships.

---

# 95. Responsive Images

Product storefront should support device-appropriate image delivery.

Example:

```text
Mobile
→ smaller rendition

Desktop PDP
→ larger rendition
```

Avoid delivering huge original photos to every device.

---

# 96. Lazy Loading

Offscreen storefront media should generally load lazily where UX allows.

Primary above-the-fold hero/Product visual may be prioritized separately.

---

# 97. Layout Stability

Image width/height metadata allows frontend to reserve aspect-ratio space before image loads.

This helps avoid layout jumps.

---

# 98. Product Image Quality

Storefront optimization should not unnecessarily destroy Product detail.

Fashion customers may zoom into:

```text
Fabric

stitching

texture

details
```

so PDP image quality requirements may differ from thumbnail requirements.

---

# 99. Zoom Asset

PDP zoom may use:

```text
higher-resolution rendition
```

than card/list image.

No separate manual upload should usually be needed.

---

# 100. Image Crop

Do not automatically crop all source images destructively.

Different placements need different aspect ratios.

Future system can support:

```text
Focal Point

Crop Configuration
```

per Usage.

---

# 101. Focal Point

Potential Asset metadata:

```text
x/y focal point
```

or usage-specific crop information.

Useful future:

```text
Product card 1:1

Homepage banner 16:9
```

from one Asset.

---

# 102. Usage-Specific Presentation

The Asset itself should not permanently mean:

```text
square
```

or:

```text
16:9
```

Usage/presentation layer decides.

---

# 103. Image Editing — Future

Potential:

```text
Crop

Rotate

Focal point

Basic resize
```

can be added.

Avoid building a Photoshop-like editor in V1.

---

# 104. Replacement

Users may want:

```text
Replace this file
```

This operation is dangerous when an Asset has multiple usages.

---

# 105. Replace Asset Semantics

Two distinct operations should exist conceptually:

### Replace File Everywhere

```text
Keep Asset ID

New binary/version

All usages display new content
```

### Replace in This Usage Only

```text
Use another Asset for one Product/relationship
```

These are very different.

---

# 106. Replacement Warning

If Asset has:

```text
17 active usages
```

and user selects:

```text
Replace File
```

show:

```text
This will affect 17 usages.
```

---

# 107. Asset Revision / Version

For globally replacing Asset content, preserve revision history where important.

Conceptually:

```text
AST-100

Version 1
Old image

Version 2
Retouched image
```

---

# 108. Do We Need Full Versioning V1?

Not for every Asset mutation.

V1 can support a simpler rule:

```text
Replacing underlying file is privileged and audited.
```

Old object may remain temporarily/historically according to retention.

Full DAM version browser can come later.

---

# 109. Safer Default

For ordinary staff:

```text
Upload New Asset
→ Change Usage
```

is safer than replacing a widely reused Asset.

---

# 110. Duplicate Upload Detection

When an uploaded binary is exactly identical to an existing Asset, the system should detect it.

Recommended input:

```text
Cryptographic content checksum
```

---

# 111. Exact Duplicate

File A and File B have identical bytes.

System can show:

```text
This file already exists.

[Use Existing Asset]
[Upload as Separate Asset if permitted]
```

---

# 112. Why Separate Asset May Still Be Valid

Even if bytes are identical, two logical Asset records might eventually need independent:

```text
metadata

permissions

lifecycle
```

Therefore physical deduplication and logical Asset deduplication need not be the same policy.

---

# 113. Recommended V1 Duplicate Policy

For user UX:

```text
detect exact duplicate
recommend reuse existing Asset
```

Do not silently merge logical Assets without informing users.

---

# 114. Storage-Level Deduplication

Could later store one physical binary behind multiple logical Assets.

Not necessary for V1.

Avoid complexity until storage volume justifies it.

---

# 115. Perceptual Duplicate Detection — Future

Two photos may be visually identical but have:

```text
different compression

different metadata

different resolution
```

Future perceptual hash/image similarity can identify them.

Not V1.

---

# 116. Checksum

Store cryptographic content hash when practical.

Useful for:

```text
Duplicate detection

Upload integrity

Storage verification
```

---

# 117. Checksum Is Not User-Facing Identity

Do not make product relationships depend on hash.

Asset ID remains stable.

---

# 118. EXIF Metadata

Uploaded photographs may contain:

```text
Camera model

Date

Orientation

GPS/geolocation
```

Public delivery should not unintentionally expose sensitive metadata.

---

# 119. EXIF Policy

Recommended:

```text
Extract only useful metadata

Correct image orientation

Strip unnecessary/sensitive metadata from public derivatives
```

Original handling depends on retention/privacy policy.

---

# 120. GPS Metadata

Treat embedded GPS data carefully.

A product photo should not accidentally reveal:

```text
home/studio location
```

through public image metadata.

Public derivatives should strip unnecessary location metadata.

---

# 121. Original Privacy

If originals retain EXIF, originals must not automatically be publicly accessible.

---

# 122. Public Asset Delivery

Public media may use:

```text
CDN-cached URL

stable Asset delivery route

signed transform URLs where needed
```

depending on infrastructure.

---

# 123. Private Asset Delivery

Private assets should use:

```text
authenticated request
```

and/or:

```text
short-lived signed access URL
```

rather than permanent public object URLs.

Shopify's MediaImage API similarly exposes signed, time-limited original-file URLs for secure access scenarios.

---

# 124. Authorization Before Signed URL

Flow:

```text
User requests private Asset
      ↓
Maevelle checks permission
      ↓
Short-lived access generated
      ↓
User accesses file
```

Object storage itself should not decide Maevelle business authorization.

---

# 125. Signed URL Lifetime

Private URLs should expire.

Avoid:

```text
signed URL valid forever
```

which effectively becomes public if leaked.

---

# 126. Do Not Persist Temporary URLs

Database stores:

```text
Asset identity / object key
```

not:

```text
temporary signed URL
```

Signed URLs are generated when required.

---

# 127. Public URL Stability

Even public delivery URLs should ideally be generated from Asset/storage abstraction.

Avoid business records containing hard-coded provider hostnames.

---

# 128. Object Storage Privacy

Private source bucket/objects should not be globally readable.

Public delivery can be mediated through:

```text
CDN

public derivatives

controlled bucket policy
```

depending on final infrastructure.

---

# 129. Review Images

Customer review uploads are untrusted public-origin uploads.

They require stricter validation than trusted admin uploads.

Flow:

```text
Customer Upload
      ↓
Validation
      ↓
Moderation / Review association
      ↓
Publication only after appropriate state
```

---

# 130. Review Media Must Not Become Public Immediately

Even if bytes upload successfully:

```text
Review moderation
```

decides whether the media is publicly displayed.

Media domain only marks Asset technically safe/ready.

---

# 131. Review Asset Ownership Context

Store:

```text
Uploaded via Customer Review

Related Customer

Related Review
```

where allowed.

But Review domain owns moderation.

---

# 132. Customer Upload Limits

Review media may have stricter:

```text
file count

file size

image type
```

limits than admin uploads.

---

# 133. Payment Evidence

Must default:

```text
PRIVATE
```

and require Payment-related access permission.

---

# 134. Payment Evidence Leakage

Never return evidence URLs in normal public Order APIs.

Even an opaque URL is insufficient protection if publicly reachable.

---

# 135. Supplier Documents

Examples:

```text
Quotation

Invoice

Supplier screenshot

Purchase agreement
```

default private.

---

# 136. Shipment Documents

Examples:

```text
Commercial Invoice

Packing List

Air Waybill

Customs document
```

normally private/internal.

---

# 137. Damage Photos

Could contain internal warehouse/customer information.

Default private unless explicitly published.

---

# 138. Size Guide Images

Normally public.

May be shared across:

```text
many Products

many Product Types
```

making Asset reuse especially useful.

---

# 139. Product Photo Usage

Product image is public only when:

```text
Asset is public/eligible

AND

Product publication allows it
```

Media status alone does not publish Product.

---

# 140. Asset Processing Queue

Heavy processing should not block ordinary request threads unnecessarily.

Examples:

```text
Thumbnail generation

Large image optimization

Future video processing
```

can run through background jobs.

---

# 141. Async Processing UX

After upload:

```text
Processing...
```

Asset card appears.

When ready:

```text
Ready
```

Users should not have to refresh blindly.

---

# 142. Processing Failure

Show:

```text
Processing Failed

[Retry]
[View Error]
[Delete]
```

with safe internal error details.

---

# 143. Original Upload Failure

If upload never completes:

```text
Upload Session expires
```

and orphan object cleanup should remove abandoned partial/unclaimed files.

---

# 144. Orphan Object

Possible situation:

```text
Object uploaded
Database Asset creation failed
```

System needs reconciliation/cleanup.

---

# 145. Missing Object

Opposite:

```text
Asset record exists
Object missing from storage
```

This is a serious integrity issue.

Media health checks should detect it.

---

# 146. Processing Idempotency

Retrying:

```text
Generate thumbnail
```

must not create uncontrolled duplicate renditions.

Use deterministic rendition identity/state.

---

# 147. Upload Idempotency

Retrying upload-finalization should not create:

```text
five Asset records
```

for one successful Upload Session.

---

# 148. Storage Retry

Network failures during storage operations must use safe retries.

Never mark:

```text
READY
```

until required object/processing state is confirmed.

---

# 149. Media Health

Potential diagnostics:

```text
Missing Original

Missing Rendition

Processing Failed

Orphan Object

Asset Without Storage Object

Private Asset Exposed Publicly

Invalid Usage Target

Unused Large Asset

Duplicate Asset Candidates
```

---

# 150. Asset Lifecycle

Recommended:

```text
PROCESSING
    ↓
READY
    ↓
ARCHIVED
```

Possible:

```text
FAILED

QUARANTINED

DELETED / PURGED
```

---

# 151. Archive

Archived Asset:

```text
not normally selected for new usage
```

but existing usage/history remains.

---

# 152. Why Archive?

Useful when:

```text
old brand logo

outdated campaign image

obsolete supplier document
```

should no longer be used but history must remain.

---

# 153. Delete

Delete requires careful distinction:

```text
Remove Asset logically
```

vs:

```text
Permanently purge bytes
```

---

# 154. Safe Deletion

If Asset is currently used:

```text
Usage Count:
12
```

ordinary deletion should be blocked or require explicit impact handling.

---

# 155. Delete Impact Preview

Example:

```text
This Asset is currently used by:

5 Products
2 Product Variants
1 Size Guide

Deleting it will break those relationships.
```

Options:

```text
Cancel

Replace Uses

Remove Uses and Delete
```

subject to permissions.

---

# 156. Private Evidence Deletion

Financial/operational documents may have retention requirements.

Even if unused in presentation, they may be referenced historically.

Therefore:

```text
Unused
≠
Safe to delete
```

---

# 157. Deletion Eligibility

Must consider:

```text
Active usages

Historical transaction references

Retention policy

Legal/business record requirements

Asset state
```

---

# 158. Soft Delete

Initial removal may mark:

```text
DELETED / TRASHED
```

without immediately destroying bytes.

---

# 159. Trash / Recovery

A recovery period is useful for accidental deletion.

Example:

```text
Trash
→ Retain for configurable period
→ Purge
```

---

# 160. Hard Purge

Permanent byte deletion requires stronger permission.

Example:

```text
media.purge
```

---

# 161. Purge Is Irreversible

UI should communicate:

```text
This permanently removes the stored file and derivatives.
```

---

# 162. Historical Metadata After Purge

Depending on policy, a minimal tombstone may remain:

```text
Asset ID

Deleted At

Deletion Reason

Actor
```

for audit.

---

# 163. Replace Before Delete

Useful operation:

```text
Replace all active usages with Asset B
then archive/delete Asset A.
```

This is much safer than manually changing twenty Products.

---

# 164. Bulk Asset Actions

V1 useful actions:

```text
Add Tag

Move Folder

Archive

Change visibility where safe

Delete unused
```

---

# 165. Bulk Visibility Change

Changing private files to public is security-sensitive.

Should require:

```text
permission

impact review
```

and possibly restrict certain usage types.

---

# 166. Domain-Enforced Privacy

For example:

```text
PAYMENT_EVIDENCE
```

should not become PUBLIC merely because a media librarian toggles visibility.

Business usage can impose minimum privacy classification.

---

# 167. Effective Visibility

This gives:

```text
Configured Asset Visibility
+
Usage Security Requirements
=
Effective Access
```

Private-required usage wins.

---

# 168. Mixed Public/Private Usage Problem

Suppose same Asset is used as:

```text
Product Gallery
```

and:

```text
Private Supplier Evidence
```

Should it be public?

Potentially yes if the file itself is genuinely public-safe.

But business must be deliberate.

---

# 169. Better Rule

Security classification belongs primarily to the Asset content itself.

If same binary contains sensitive information, it should not also be public media.

Upload/create a sanitized public Asset separately.

---

# 170. Asset Classification

Potential:

```text
PUBLIC_CONTENT

INTERNAL

SENSITIVE
```

instead of only binary Public/Private in future.

V1 can start:

```text
PUBLIC

PRIVATE
```

plus domain-specific permission requirements.

---

# 171. Public Product Image Copy

If private supplier Asset needs editing/sanitization before storefront use:

```text
Create derived/new public Asset
```

rather than simply exposing private source.

---

# 172. File Security

Upload pipeline should protect against:

```text
malformed files

spoofed types

active scripts

oversized payloads

dangerous content types
```

through allowlists and validation.

---

# 173. Malware Scanning

Private documents and customer uploads should support malware scanning.

V1 can integrate an appropriate scanner in the processing pipeline or establish a clear security gate.

No file should be considered fully trusted simply because it came from an authenticated employee.

---

# 174. Quarantine

Suspicious file:

```text
Status:
QUARANTINED
```

should not be downloadable by ordinary users.

Security/admin inspection only.

---

# 175. Filename Security

Never execute, interpolate, or trust uploaded filenames.

Store them as sanitized display metadata.

Storage key remains generated.

---

# 176. Content-Disposition

Private document download response should use safe filename handling to avoid header injection/unsafe browser behavior.

---

# 177. Image Decompression Risk

Extremely large dimensions can cause processing/resource abuse even when compressed file size is small.

Validation should limit:

```text
pixel dimensions

processing resources
```

as well as byte size.

---

# 178. Upload Rate Limiting

Public/customer uploads especially require:

```text
rate limits

file-count limits
```

to prevent abuse.

---

# 179. Admin Upload Rate

Internal trusted admins can have higher limits but still need safeguards against accidental massive uploads.

---

# 180. Access Logging — Sensitive Media

For particularly sensitive evidence, future/advanced security may log:

```text
who accessed/downloaded Asset
```

V1 can start with modification audit and add access logs where justified.

---

# 181. Asset Audit

Important events:

```text
asset.upload_requested

asset.uploaded

asset.ready

asset.metadata_updated

asset.visibility_changed

asset.archived

asset.deleted

asset.purged

asset.replaced

asset.usage_added

asset.usage_removed
```

---

# 182. Asset Usage Audit

Who attached:

```text
Photo A
```

to:

```text
Product B
```

can matter operationally.

Audit should capture assignment/reordering for sensitive/important contexts.

---

# 183. Gallery Reorder Audit

Do we need audit for every drag reorder?

Potentially Catalog audit can capture meaningful Product media order changes without generating excessive low-value logs.

Audit design will define granularity.

---

# 184. Permissions

Recommended capabilities:

```text
media.view

media.upload

media.edit_metadata

media.use

media.archive

media.delete

media.purge

media.replace

media.manage_visibility

media.view_private

media.download_private

media.manage_collections

media.manage_tags
```

---

# 185. Domain-Specific Permissions Still Apply

Having:

```text
media.view_private
```

does not automatically allow viewing:

```text
payment evidence
```

if user lacks Payment access.

Effective authorization should check:

```text
Media Permission
+
Target Domain Permission
```

for sensitive usages.

---

# 186. Product Manager

May have:

```text
media.view

media.upload

media.use
```

for public Catalog assets.

But not:

```text
payment evidence
```

---

# 187. Finance User

May access:

```text
payment evidence

supplier financial documents
```

while having no right to edit Product galleries.

---

# 188. Public Asset Selector

Catalog users should be able to filter:

```text
Public images only
```

to reduce accidental selection of private documents.

---

# 189. Asset Ownership / Uploader

Record:

```text
Uploaded By
```

for operational traceability.

---

# 190. Upload Source

Possible:

```text
ADMIN_UPLOAD

CUSTOMER_REVIEW

SUPPLIER_IMPORT

REMOTE_IMPORT

API

MIGRATION

SYSTEM_GENERATED
```

---

# 191. Remote Import

Future/useful capability:

```text
Import image from supplier URL
```

rather than hotlinking it forever.

Flow:

```text
Remote URL
     ↓
Maevelle downloads
     ↓
Validates
     ↓
Stores own Asset
```

---

# 192. Do Not Hotlink Supplier Images

Supplier URLs may:

```text
expire

change

block requests

remove files
```

Maevelle Product assets should live under Maevelle-controlled storage/delivery.

---

# 193. Remote Import Security

Server-side remote import must defend against unsafe/internal network URLs.

Only controlled HTTP(S) sources should be accepted, with SSRF protections.

---

# 194. Import Copyright/Ownership

Operationally, Maevelle remains responsible for using media it has rights to use.

The software should allow source/credit metadata where useful but does not attempt legal rights determination automatically.

---

# 195. Asset Source Metadata

Potential:

```text
Original Source

Supplier

Photoshoot

Import

Generated

External URL
```

Useful for provenance.

---

# 196. Photographer / Creator — Future

Brand asset workflows may later store:

```text
Creator

Copyright

License

Usage Expiration
```

Not required for Maevelle V1.

---

# 197. Asset Expiration — Future

Campaign/license assets may have:

```text
Do not use after date
```

future functionality.

---

# 198. Media Localization — Future

Future multilingual storefront may need:

```text
Alt text per language

Caption per language
```

Asset binary remains shared.

---

# 199. Video Foundation

Future Product videos should use the same Media Asset identity concept.

But processing/delivery differs substantially from images.

Therefore:

```text
Media Asset Type = VIDEO
```

can be foundational while full video pipeline remains deferred.

---

# 200. Video Processing — Future

May require:

```text
transcoding

poster image

adaptive bitrate

streaming
```

Do not attempt full video hosting pipeline in V1 unless business demands it.

---

# 201. External Video — Future

Future Product media may reference:

```text
YouTube

Vimeo
```

without owning video bytes.

Shopify's media model similarly supports multiple media kinds including hosted and external video alongside images.

Our architecture should not assume every media record necessarily owns an uploaded binary forever.

---

# 202. 3D Media — Future

Potential:

```text
MODEL_3D
```

foundation.

Not V1.

---

# 203. Asset Variants vs Product Variants

Terminology caution.

Avoid calling derived image sizes simply:

```text
Variants
```

in UI because Catalog already uses Product Variants.

Preferred:

```text
Renditions

Derivatives

Media Versions
```

---

# 204. Media Rendition

Use:

```text
Rendition
```

for resized/optimized file representation.

---

# 205. CDN Cache

Public image delivery should support long-lived caching for immutable rendition URLs.

If content changes, use:

```text
new version/content address
```

or proper cache invalidation.

---

# 206. Original Asset Replacement and Cache

Replacing underlying file should not leave old image permanently cached at same immutable URL.

Therefore delivery/versioning strategy must support cache-busting or new rendition identity.

---

# 207. Rendition Generation Strategy

Potential:

```text
Pre-generate common sizes
```

and/or:

```text
On-demand CDN transforms
```

This is an infrastructure decision.

Media domain only requires:

```text
Original

Known metadata

Stable Asset identity
```

---

# 208. Avoid Generating Hundreds of Sizes

Do not pre-generate every possible dimension.

Define a sensible set or use transformation service.

---

# 209. Product Card Image

Typical requirement differs from:

```text
PDP Image

Zoom Image

Admin Thumbnail
```

delivery layer chooses appropriate rendition.

---

# 210. Media URL API

Business APIs should preferably return structured media information:

```text
Asset ID

Type

Width

Height

Alt Text

Delivery URL / rendition info
```

rather than only:

```text
image_url
```

---

# 211. Storefront DTO

Example conceptual response:

```text
{
  assetId,
  alt,
  width,
  height,
  src,
  srcSet / rendition information
}
```

Actual API shape comes later.

---

# 212. Admin DTO

Admin may additionally receive:

```text
Filename

File Size

Uploader

Visibility

Usage Count

Status
```

---

# 213. Private DTO

Private access URLs generated only after authorization.

Do not include them in list responses unnecessarily.

---

# 214. Media API Commands

Conceptual:

```text
requestUpload()

completeUpload()

retryProcessing()

updateAssetMetadata()

setAssetVisibility()

archiveAsset()

deleteAsset()

purgeAsset()

replaceAssetFile()

addAssetUsage()

removeAssetUsage()

reorderAssetUsages()
```

---

# 215. Read APIs

Potential:

```text
getAsset()

searchAssets()

listAssets()

getAssetUsage()

getAssetHistory()

getUnusedAssets()

getProcessingFailures()
```

---

# 216. Structured Errors

Examples:

```text
MEDIA_TYPE_NOT_ALLOWED

MEDIA_TOO_LARGE

MEDIA_DIMENSIONS_TOO_LARGE

MEDIA_UPLOAD_EXPIRED

MEDIA_OBJECT_MISSING

MEDIA_PROCESSING_FAILED

MEDIA_QUARANTINED

MEDIA_NOT_READY

MEDIA_PRIVATE_ACCESS_DENIED

MEDIA_IN_USE

MEDIA_RETENTION_BLOCK

MEDIA_DUPLICATE_DETECTED

MEDIA_VERSION_CONFLICT
```

---

# 217. Concurrency

Two staff may reorder same gallery simultaneously.

Use Product/versioning semantics to prevent silent loss.

---

# 218. Asset Metadata Concurrency

Two users edit Alt Text/title.

Use optimistic version handling where appropriate.

---

# 219. Replace Concurrency

Replacing an Asset while another user is deleting it must serialize or reject one operation.

---

# 220. Usage Integrity

An active Asset Usage must point to:

```text
valid Asset

valid target

valid role
```

according to domain rules.

---

# 221. Target Deleted/Archived

If Product is archived:

```text
Asset is not deleted.
```

Product usage may remain historical/inactive.

Other usages continue.

---

# 222. Product Hard Deletion

If a truly unreferenced Draft Product is hard-deleted, its Asset usages can be removed.

Assets themselves remain unless independently deleted.

---

# 223. Review Deleted

Review media may become unused.

Retention/moderation policy decides whether Asset can then be deleted.

---

# 224. Payment Record Retention

Deleting Payment evidence casually should normally be prohibited while Payment record requires it.

---

# 225. Usage Cascade

Never use database cascade rules that accidentally:

```text
Delete Product
→ Delete Asset
→ break other Product
```

Asset ownership/reuse requires careful deletion semantics.

---

# 226. Media Library Upload Flow

Recommended UX:

```text
Open Media Library
      ↓
Upload
      ↓
Drop/select files
      ↓
Immediate local previews
      ↓
Upload progress
      ↓
Processing indicators
      ↓
Ready Assets appear
```

---

# 227. Batch Upload

Users should be able to upload multiple Product images at once.

Example:

```text
15 photos
```

not one-by-one.

---

# 228. Batch Failure

If:

```text
14 succeed
1 fails
```

do not fail the entire upload batch.

Show per-file status.

---

# 229. Upload Progress

Useful statuses:

```text
Waiting

Uploading 62%

Processing

Ready

Failed
```

---

# 230. Drag-and-Drop

Media Library and Product Editor should support efficient drag/drop.

But the underlying domain operation remains the same upload session.

---

# 231. Paste Upload — Preferred

Pasting an image from clipboard can create an Asset.

Useful for supplier screenshots/admin workflows.

---

# 232. Clipboard File Naming

System can assign generated display title if original filename is absent.

---

# 233. Product Editor Integration

Flow:

```text
Product
→ Media
→ Add
```

shows:

```text
Upload New
Media Library
```

This matches the WordPress-like usability goal.

---

# 234. Color Gallery UX

Product Editor:

```text
Color:
Red

Gallery:
[ img ] [ img ] [ img ]
```

Users select existing/new Assets.

No need to duplicate files for every Size.

---

# 235. Media Reorder

Drag ordered thumbnails.

Changes Asset Usage positions only.

---

# 236. Media Bulk Assignment

Potential:

```text
Select 4 images
→ Assign to Color Red
```

efficient for many-variant products.

---

# 237. Product Duplication

From Catalog architecture:

When duplicating Product:

```text
Media reuse
```

should be explicit.

Recommended options:

```text
Reuse same Assets

Don't copy Media
```

Do not physically duplicate bytes by default.

---

# 238. Why Reuse on Duplication

Duplicating Product for another color/style may initially reuse some:

```text
Size Diagram

Brand information image
```

without additional storage.

---

# 239. Asset Copy

If user explicitly needs an independently editable copy:

```text
Duplicate Asset
```

can create separate logical Asset.

Physical binary duplication can be optimized internally later.

---

# 240. Media Import/Migration

When migrating existing ecommerce content:

```text
URLs
→ import files
→ create Assets
→ establish usages
```

Do not leave critical Product media dependent on old site's availability.

---

# 241. Migration Duplicate Detection

Use checksums/known source mapping to avoid downloading same file hundreds of times.

---

# 242. Legacy URL Map

Maintain:

```text
old URL
→ Asset ID
```

during migration if useful.

---

# 243. External Storage Migration

If switching object-storage provider:

```text
copy objects
update storage references
```

Catalog relationships remain untouched.

This validates the Asset-identity abstraction.

---

# 244. Backup Strategy

Relational database backup alone is insufficient.

Operational backup/recovery must include:

```text
Media metadata

Original object storage

Critical private documents
```

---

# 245. Derived Media Backup

Renditions can often be regenerated from originals.

Therefore backup priority:

```text
Originals
+
Metadata
```

is higher than every derivative.

---

# 246. Restore Test

Backup strategy must test:

```text
Can an Asset record be restored with its original file and usages?
```

not merely "bucket backup exists."

---

# 247. Object Versioning — Infrastructure Option

Storage-provider object versioning can be considered as additional protection.

But Media application-level revision semantics should not depend exclusively on provider-specific features.

---

# 248. Media Metrics

Operational metrics:

```text
Total Assets

Storage Used

Public Assets

Private Assets

Unused Assets

Failed Processing

Uploads by Type
```

---

# 249. Usage Analytics — Future

Potential:

```text
Most reused Assets

Unused campaign media

Storage by domain
```

Useful for operations.

---

# 250. Media Delivery Analytics — Future

Could track:

```text
Bandwidth

Transformation volume

CDN hit ratio
```

at infrastructure layer.

Not V1 product functionality.

---

# 251. Asset Size Optimization Report — Preferred

Media Library may identify:

```text
Extremely large originals

Poor aspect ratios

Missing Alt Text

Unused large Assets
```

---

# 252. Accessibility Warning

Public Product image missing Alt Text:

```text
Warning
```

not necessarily publication blocker for all V1 cases.

Catalog publication validation may later require stricter rules.

---

# 253. Image Aspect Validation

Product card system may recommend:

```text
preferred aspect ratio
```

but should not reject all alternative photos.

Presentation layer can handle varied images.

---

# 254. Media Metadata Templates — Future

Example Product shoot tags could be applied in bulk.

Not necessary initially.

---

# 255. Future AI Media Features

Potential:

```text
Automatic Alt Text

Image Tagging

Background Removal

Quality Detection

Duplicate Similarity

Object Detection
```

These are enhancements.

Core Media data model should not depend on AI.

---

# 256. Future Image Moderation

Customer review photos may eventually use automated content moderation before human moderation.

Review architecture remains final publication authority.

---

# 257. Future Digital Product Files

If platform later supports digital products:

```text
Downloadable Asset
```

requires:

```text
customer entitlement

secure access

download limits
```

This should become a Digital Fulfillment domain, not merely set Asset PUBLIC.

---

# 258. Media Is Organization-Scoped

Every Asset belongs to an Organization.

Cross-organization sharing must not happen accidentally.

---

# 259. Future Platform Shared Assets

A multi-business SaaS system might support platform/global brand assets.

Not required now.

Keep ordinary Asset:

```text
organization-owned
```

---

# 260. Asset Copy Between Organizations — Future

Must create a controlled copy/transfer, never silently expose private cross-tenant storage.

---

# 261. Important Invariants

### MED-INV-001

Every Media Asset belongs to one Organization.

### MED-INV-002

Asset identity is independent of filename, URL, and storage provider.

### MED-INV-003

Stored Object, Media Asset, and Asset Usage are separate concepts.

### MED-INV-004

Business domains reference Asset identity, not storage-provider URL as identity.

### MED-INV-005

One Asset can have multiple active usages.

### MED-INV-006

Asset usage ordering belongs to the usage context, not the Asset globally.

### MED-INV-007

Removing one usage does not delete the Asset.

### MED-INV-008

Deleting a Product does not automatically destroy a reused Asset.

### MED-INV-009

Private Assets are never exposed through permanent unrestricted public URLs.

### MED-INV-010

Temporary private access is authorization-controlled.

### MED-INV-011

Operational documents default to private unless explicitly classified otherwise.

### MED-INV-012

Upload completion does not imply Asset readiness before validation/processing succeeds.

### MED-INV-013

Untrusted file type claims are validated server-side.

### MED-INV-014

Dangerous/disallowed file types are rejected or quarantined.

### MED-INV-015

Original image is preserved independently from generated renditions where policy requires.

### MED-INV-016

Renditions are derived representations, not independent Product assets by default.

### MED-INV-017

Final business relationships reference original logical Asset identity.

### MED-INV-018

Exact duplicate detection does not silently destructive-merge logical Assets.

### MED-INV-019

Current usage and historical usage remain distinguishable.

### MED-INV-020

Unused Asset does not automatically mean safe to delete.

### MED-INV-021

Asset deletion checks active usages and retention requirements.

### MED-INV-022

A finalized historical financial/operational reference can block Asset purge.

### MED-INV-023

Public derivatives should not unintentionally expose sensitive source metadata.

### MED-INV-024

Upload/processing/finalization operations are retry-safe.

### MED-INV-025

Missing stored files are detectable as integrity failures.

### MED-INV-026

Asset metadata changes are auditable.

### MED-INV-027

Cross-domain access to sensitive Assets requires appropriate domain authorization.

### MED-INV-028

Storage-provider migration must not require rewriting Catalog/Order/Procurement business relationships.

### MED-INV-029

Object-storage credentials are never exposed to clients.

### MED-INV-030

Public storefront delivery infrastructure remains replaceable independently of Media Asset identity.

---

# 262. V1 Mandatory Scope

Maevelle V1 Media should include:

```text
✓ Media Asset

✓ Stable Asset ID

✓ Object Storage

✓ Storage Provider abstraction

✓ IMAGE

✓ DOCUMENT

✓ Original Filename

✓ MIME Type

✓ File Size

✓ Image Width / Height

✓ Image Format

✓ Asset Title

✓ Alt Text

✓ Caption foundation

✓ Internal Description

✓ Asset Tags

✓ Logical Folders / Collections

✓ PUBLIC

✓ PRIVATE

✓ Upload Sessions

✓ Direct-upload-ready architecture

✓ File validation

✓ Type allowlist

✓ Upload size limits

✓ Image dimension limits

✓ Upload progress

✓ Processing lifecycle

✓ READY / FAILED / QUARANTINED

✓ Original image preservation

✓ Thumbnail generation

✓ Optimized image renditions

✓ Asset Usage

✓ Usage Roles

✓ Usage Ordering

✓ Product Gallery

✓ Color / Option-Value Gallery

✓ Variant Media override

✓ Size Guide Media

✓ Review Image foundation

✓ Supplier Attachments

✓ Purchase Attachments

✓ Shipment Documents

✓ Payment Evidence

✓ Refund Evidence

✓ Inventory Evidence

✓ Asset Picker

✓ Media Library

✓ Grid View

✓ List View

✓ Search

✓ Filters

✓ Usage Count

✓ Usage Detail

✓ Unused Asset Detection

✓ Exact Duplicate Detection

✓ Safe Deletion

✓ Archive

✓ Trash / deletion foundation

✓ Private signed access

✓ Permission enforcement

✓ Sensitive domain authorization

✓ Audit

✓ Idempotent processing

✓ Media integrity checks

✓ CDN-ready public delivery

✓ Import / migration foundation
```

---

# 263. Strongly Preferred V1

```text
Batch Upload

Clipboard Paste Upload

Drag-and-Drop

Logical Folder Management

Bulk Tags

Replace Usage

Replace Asset warning

Exact checksum duplicate suggestion

Usage History

Media Health Dashboard

Missing Alt Text view

Large Asset report

Private-document access logging foundation

Image EXIF stripping for public derivatives

Processing Retry

Orphan-file Cleanup

Storage Reconciliation
```

---

# 264. Foundation Now / Later

Architecture should prepare for:

```text
Video

External Video

3D Models

Asset Versions

Focal Points

Usage-Specific Crops

Multi-language Alt Text

DAM Licensing

Asset Expiration

Perceptual Duplicate Detection

AI Alt Text

AI Tagging

Image Moderation

Digital Product Downloads

Remote Asset Providers
```

---

# 265. Deferred Advanced Capabilities

Post-V1:

```text
Full Video Transcoding

Adaptive Video Streaming

Advanced Image Editor

Background Removal

AI Product Photo Enhancement

AI Asset Classification

Perceptual Search

Digital Rights Management

DAM Approval Workflows

Creative Review Workflows

Automated Copyright/License Tracking

Advanced Asset Analytics

Global Multi-Region Media Delivery

Digital Product Entitlement Delivery
```

---

# 266. Decisions Established

### Decision M-001

**Media is a first-class shared infrastructure domain.**

### Decision M-002

**Media Asset is not equivalent to Product Image.**

### Decision M-003

**Stored Object, Media Asset, and Asset Usage are separate concepts.**

### Decision M-004

**Assets are reusable across business entities.**

### Decision M-005

**Asset identity is independent of storage URL/provider.**

### Decision M-006

**Object storage holds file bytes; PostgreSQL holds business metadata and relationships.**

### Decision M-007

**Media architecture remains storage-provider independent.**

### Decision M-008

**Images and Documents are mandatory V1 Asset types.**

### Decision M-009

**Video/3D are future extensions of the same Asset identity model.**

### Decision M-010

**Public and Private media use the same infrastructure but different access policies.**

### Decision M-011

**Operational/financial attachments default to Private.**

### Decision M-012

**Asset Usage determines business context and ordering.**

### Decision M-013

**Gallery ordering is usage-context-specific.**

### Decision M-014

**Color/Option-value galleries prevent unnecessary duplication across size Variants.**

### Decision M-015

**True Variant-specific media remains possible.**

### Decision M-016

**The original source image is preserved independently from storefront renditions.**

### Decision M-017

**Responsive/optimized images are generated/delivered from one logical Asset.**

### Decision M-018

**Next.js image optimization is a presentation capability, not the Media source of truth.**

### Decision M-019

**Private files use authorization-controlled time-limited access rather than permanent public URLs.**

### Decision M-020

**Upload clients never receive permanent object-storage credentials.**

### Decision M-021

**Upload lifecycle includes validation and processing before READY.**

### Decision M-022

**Untrusted uploads use allowlisted file types and security validation.**

### Decision M-023

**Arbitrary untrusted SVG/executable uploads are rejected unless a safe dedicated policy exists.**

### Decision M-024

**Duplicate files are detected, but logical Assets are not silently merged.**

### Decision M-025

**Current Usage and Historical Usage are both meaningful.**

### Decision M-026

**Unused does not automatically mean deletable.**

### Decision M-027

**Deletion is usage-aware and retention-aware.**

### Decision M-028

**Asset replacement and usage replacement are separate operations.**

### Decision M-029

**Replacing a reused Asset requires impact awareness.**

### Decision M-030

**Public image derivatives should strip unnecessary sensitive metadata.**

### Decision M-031

**Media operations are permission-controlled and auditable.**

### Decision M-032

**Sensitive media authorization must respect both Media permission and target-domain permission.**

### Decision M-033

**Critical media processing/upload operations are idempotent and recoverable.**

### Decision M-034

**Media integrity/reconciliation tooling is part of production reliability.**

---

# 267. Resulting Media Model

The core infrastructure now looks like:

```text
                        MEDIA ASSET
                            │
                ┌───────────┴───────────┐
                │                       │
          ORIGINAL OBJECT          RENDITIONS
                │                  ├─ Thumbnail
                │                  ├─ Small
                │                  ├─ Medium
                │                  └─ Large
                │
                ▼
          ASSET METADATA
                │
                ▼
             USAGES
       ┌────────┼─────────┬───────────┐
       │        │         │           │
       ▼        ▼         ▼           ▼
    Product   Sizing   Shipment    Payment
     Media    Diagram  Document    Evidence
```

Product hierarchy:

```text
Product
   │
   ├── General Gallery
   │      ├── Asset A
   │      └── Asset B
   │
   ├── Color = Red
   │      ├── Asset C
   │      └── Asset D
   │
   └── Variant Override
          └── Asset E
```

Secure documents:

```text
Payment
    ↓
Payment Evidence Usage
    ↓
Private Media Asset
    ↓
Private Object
    ↓
Authorization Check
    ↓
Short-Lived Access
```

Safe deletion:

```text
Delete Asset
     ↓
Check Active Usages
     ↓
Check Historical / Retention References
     ↓
┌──────────────┬──────────────┐
│              │              │
Blocked      Trash         Replace Uses
               │
               ▼
          Retention Period
               │
               ▼
              Purge
```

And the WordPress-style usability target becomes:

```text
                 MEDIA LIBRARY

Upload New   Search   Filter   Reuse Existing

┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Image  │ │ Image  │ │  PDF   │ │ Image  │
│        │ │        │ │        │ │        │
└────────┘ └────────┘ └────────┘ └────────┘

Each Asset knows:

What am I?
Where are my bytes?
Who uploaded me?
Am I public?
Where am I used?
Can I safely be deleted?
```

That is a substantially stronger media model than attaching arbitrary URLs to Products.

---

# 268. Architecture Milestone

The previously designed domains can now all rely on one media layer:

```text
Catalog ──────────────┐
Sizing ───────────────┤
Reviews ──────────────┤
Procurement ──────────┤
Shipments ────────────┼──► MEDIA
Inventory ────────────┤
Payments ─────────────┤
Customers ────────────┤
Future CMS ───────────┘
```

This also means we no longer need to invent upload/storage/security rules independently inside every domain.

---

# 269. Next Domain

The next major document should be:

```text
docs/domains/access-control/access-control-architecture.md
```

This is now especially important because we have accumulated sensitive operations across the system:

```text
Products
Inventory
Purchases
Supplier Costs
Landed Costs
Orders
Payments
Refunds
Customer Personal Data
Private Media
Shipment Documents
```

A simple:

```text
Admin
Employee
```

model will not be sufficient.

The next architecture should deeply define:

```text
Identity

Internal User Account

Authentication

Authorization

Capability / Permission

Permission Presets

Custom Permission Sets

Sensitive Data Permissions

Entity Actions

Read vs Write

Publish Permission

Inventory Adjustment Permission

Large Adjustment Permission

Supplier Cost Visibility

Landed Cost Visibility

Payment Verification

Refund Permission

Customer Sensitive Data

Private Media Access

Configuration Permissions

Permission Dependencies

Scope-Aware Permission Foundation

Location / Warehouse Scope

Future Storefront / Channel Scope

Organization Scope

Owner / Super Admin Safety

Privilege Escalation Protection

Self-Permission Changes

Account Disable

Session Revocation

Password Security

MFA Foundation

Login Protection

Rate Limiting

Audit

Security Events

API Authorization

Background Job Authorization Context

Webhook / Integration Identity

Service Accounts

API Tokens future

Emergency Access

Permission Testing
```

The central rule should remain:

```text
USER
  ↓
PERMISSIONS / CAPABILITIES
  ↓
ALLOWED ACTIONS
```

rather than:

```text
if user.role == "manager"
```

throughout the codebase.

---

**End of Media & Digital Asset Architecture v0.1**
