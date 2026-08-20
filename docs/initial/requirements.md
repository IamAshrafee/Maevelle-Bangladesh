# Maevelle Ecommerce — Initial Requirements Specification

**Document:** `docs/initial/requirements.md`
**Status:** Living Document
**Version:** 0.1
**Initial Business:** Maevelle Bangladesh
**Platform Direction:** Reusable Commerce + Business Operations Platform

---

# 1. Purpose

This document converts the original Maevelle Ecommerce concept into structured, individually identifiable requirements.

Its purpose is to:

- establish a common source of truth;
- separate requirements from implementation decisions;
- distinguish current requirements from future requirements;
- expose hidden requirements and dependencies;
- prevent important business behavior from being accidentally omitted;
- provide IDs that future domain documents, API specifications, tests, issues, database decisions and architecture documents can reference;
- give developers and AI agents a stable requirements baseline.

This is **not yet a database schema specification** and is **not yet detailed acceptance criteria for every feature**.

Individual domains will receive deeper specifications later.

---

# 2. Requirement Classification

Requirements use three classifications.

### `CURRENT`

The feature is expected to be part of the initial operational platform.

### `FOUNDATION`

The complete feature may not be exposed immediately, but the architecture must support it from the beginning or avoid decisions that make it difficult later.

### `FUTURE`

The feature is intentionally planned for a later stage.

Requirements also use:

- **MUST** — mandatory.
- **SHOULD** — strongly desired unless a justified technical/product reason prevents it.
- **MAY** — optional or conditional.

---

# 3. Core System Requirements

### SYS-001 — Commerce + Operations Platform

**CURRENT — MUST**

The system shall provide both:

1. a customer-facing commerce storefront; and
2. an internal business operations portal.

### SYS-002 — Business-Agnostic Core

**FOUNDATION — MUST**

Core commerce logic shall not depend specifically on:

- Maevelle;
- Bangladesh;
- fashion;
- dresses;
- a fixed category structure;
- one currency;
- one warehouse;
- one payment provider;
- one courier.

### SYS-003 — Maevelle as Initial Business

Maevelle Bangladesh shall be the initial configured business and storefront brand.

### SYS-004 — Shared Business Core

Storefront and business portal operations shall use the same authoritative underlying commerce/business services.

Business logic shall not be duplicated separately inside storefront and dashboard implementations.

### SYS-005 — Modular Domain Architecture

The application shall maintain explicit boundaries between major domains such as:

- catalog;
- inventory;
- orders;
- procurement;
- customers;
- expenses;
- identity/access;
- media;
- analytics.

### SYS-006 — Progressive Complexity

Advanced functionality shall not require common workflows to become unnecessarily complicated.

The interface shall prioritize common information/actions and progressively reveal advanced capabilities.

### SYS-007 — Traceability

Important operational records shall preserve sufficient history to determine how the current state was reached.

### SYS-008 — Future-Ready Without Premature Implementation

Known future requirements shall influence architecture boundaries without requiring every future feature to be implemented immediately.

---

# 4. Organization / Business Requirements

### ORG-001 — Business Entity

**FOUNDATION — MUST**

Business-owned data shall be logically associated with a business/organization boundary.

### ORG-002 — Single Initial Organization

The initial deployment may operate with only Maevelle Bangladesh.

### ORG-003 — Multi-Organization Readiness

**FOUNDATION — MUST**

Core architecture shall avoid assumptions that permanently restrict the system to exactly one organization.

### ORG-004 — Business Configuration

A business shall maintain centralized operational configuration.

### ORG-005 — Business Identity

Business configuration should support information such as:

- business name;
- legal/display name;
- logo;
- contact information;
- addresses;
- currency;
- timezone;
- number/date/time preferences.

---

# 5. Storefront Requirements

### STO-001 — Public Storefront

**CURRENT — MUST**

Customers shall be able to access a public storefront without authentication.

### STO-002 — Responsive Experience

The storefront shall work effectively across:

- mobile;
- tablet;
- desktop.

Mobile usability shall receive particularly high priority.

### STO-003 — Product Discovery

Customers shall be able to discover products through:

- categories;
- navigation;
- search;
- collections/tags where exposed;
- direct product links.

### STO-004 — Product Listing Pages

The storefront shall support product listing/catalog pages.

### STO-005 — Filtering

Product listing/search experiences shall support structured filtering where relevant.

### STO-006 — Sorting

Product lists should support relevant sorting strategies.

Examples:

- newest;
- price;
- popularity;
- relevance.

Exact strategies will be defined later.

### STO-007 — Product Detail Page

Every publishable product shall have a detailed storefront product page.

### STO-008 — Fast Purchase Flow

The purchasing flow shall minimize unnecessary screens and interactions.

### STO-009 — Buy Now

The system should support purchasing directly from a product page without requiring the user to first navigate through the full cart workflow.

### STO-010 — Breadcrumbs

Hierarchical storefront pages shall display appropriate breadcrumbs.

### STO-011 — Loading UX

Loading states shall avoid confusing blank screens or uncontrolled layout shifts.

### STO-012 — Error UX

Storefront errors shall provide understandable recovery actions rather than exposing technical errors.

### STO-013 — Empty States

Empty search results, carts and unavailable catalog states shall have intentional UX.

---

# 6. Category Requirements

### CAT-001 — Hierarchical Categories

**CURRENT — MUST**

Categories shall support parent/child relationships.

### CAT-002 — Arbitrary Depth

**CURRENT — MUST**

The system shall not impose a business-specific fixed number of category levels.

Example:

```text
Women
→ Clothing
→ Traditional
→ Saree
→ Wedding Saree
```

### CAT-003 — Root Categories

Categories may exist without a parent.

### CAT-004 — Category Activation

Every category shall support activation/deactivation.

### CAT-005 — Effective Activation

A category marked active shall not be storefront-visible when an ancestor required for its hierarchy is inactive.

### CAT-006 — Preserve Child State

Deactivating a parent category should not necessarily overwrite the configured active/inactive state of every child.

### CAT-007 — Category Ordering

Administrators shall be able to control category display order.

### CAT-008 — Category Metadata

Categories should support information such as:

- name;
- description;
- slug;
- image;
- SEO metadata.

### CAT-009 — Category Movement

Administrators shall be able to reorganize categories within the hierarchy.

### CAT-010 — Safe Hierarchy Validation

The system must prevent invalid hierarchy relationships such as circular parent relationships.

---

# 7. Product Catalog Requirements

### PRD-001 — Product Entity

**CURRENT — MUST**

Products shall be first-class catalog entities.

### PRD-002 — Product Lifecycle

Products shall support at least:

- Draft
- Published
- Unpublished

### PRD-003 — Product Editing

Authorized business users shall be able to edit products.

### PRD-004 — Product Duplication

The portal should support duplicating an existing product as the starting point for a new one.

### PRD-005 — Product Title

Products shall support a primary title.

### PRD-006 — Product Description

Products shall support detailed descriptions.

### PRD-007 — Structured Information

Products shall support structured information groups.

Example:

```text
Material
  Fabric: Cotton
  GSM: 180

Care
  Wash: Hand Wash
  Iron: Low Heat
```

### PRD-008 — Repeating Key/Value Fields

Information groups shall support flexible key/value entries.

### PRD-009 — Product FAQ

Products shall support multiple FAQ entries containing a question and answer.

### PRD-010 — Product Categories

Products shall be assignable to categories.

### PRD-011 — Product Tags

Products shall support reusable tags.

### PRD-012 — Occasion/Event Classification

Products shall support classification by relevant occasion/event concepts.

Examples:

- Wedding
- Eid
- Party
- Casual
- Formal

These shall not require categories to be misused for every merchandising concept.

### PRD-013 — Product Status

Product publication state shall be clearly visible within the portal.

### PRD-014 — SKU Visibility

SKU information shall be visible where operationally important.

### PRD-015 — Product Archival

Products should eventually support archival without destroying historical order/inventory references.

### PRD-016 — Product Deletion Safety

Products referenced by important historical transactions shall not be destructively deleted without safeguards.

### PRD-017 — Bulk Product Operations

The portal should support bulk actions where operationally useful.

Examples:

- publish;
- unpublish;
- tag;
- categorize;
- update selected properties.

---

# 8. Attribute and Option Requirements

Research into mature commerce systems supports treating reusable attributes and variant-selection properties separately instead of creating fixed fashion-only columns. Saleor, for example, models reusable attributes that can be assigned at product or variant level.

### ATR-001 — Reusable Attributes

**CURRENT — MUST**

The platform shall support reusable catalog attributes.

### ATR-002 — Product-Level Attributes

Attributes may describe an entire product.

Example:

```text
Material = Cotton
Country of Origin = China
```

### ATR-003 — Variant-Level Attributes

Attributes may describe a particular variant.

Example:

```text
Color = Red
Size = M
```

### ATR-004 — Flexible Data Types

The architecture should eventually support appropriate attribute types such as:

- text;
- number;
- boolean;
- selection;
- multi-selection;
- measurement.

### ATR-005 — Product-Type Reuse

Relevant attribute configurations should be reusable across multiple products.

### ATR-006 — Storefront Visibility

An attribute shall be configurable as storefront-visible or internal where necessary.

### ATR-007 — Search/Filter Eligibility

Attributes should be configurable for use in:

- search;
- filtering;
- product specifications.

---

# 9. Variant Requirements

Mature commerce platforms treat product variants as distinct product versions representing dimensions such as size or color and associate stock/SKU information with those variants.

### VAR-001 — First-Class Variants

**CURRENT — MUST**

Sellable product variations shall be modeled explicitly.

### VAR-002 — Option Combinations

A product may have variants created from combinations such as:

```text
Red + Small
Red + Medium
Blue + Small
Blue + Medium
```

### VAR-003 — Variant SKU

Variants shall support SKU identifiers.

### VAR-004 — SKU Uniqueness

The system shall enforce an appropriate SKU uniqueness policy.

Exact scope will be defined during catalog architecture.

### VAR-005 — Variant Price

Variants may require independent or adjusted pricing.

### VAR-006 — Variant Status

Individual variants should be capable of being unavailable without necessarily removing the entire product.

### VAR-007 — Variant Inventory

Inventory shall be capable of being tracked at sellable variant level.

### VAR-008 — Variant Media

Media shall be associable with individual variants.

### VAR-009 — Variant Weight

Variants should support physical weight where required for shipping/procurement calculations.

### VAR-010 — Variant Dimensions

Physical dimensions should be supported where relevant.

### VAR-011 — No-Variant Products

The system shall gracefully support products that do not require meaningful customer-selectable variations.

Internally, implementation may still use a default sellable item/variant concept.

---

# 10. Color Requirements

### CLR-001 — Primary Color

**CURRENT — MUST**

A relevant color variant shall support a primary/display color.

### CLR-002 — Associated Colors

**CURRENT — MUST**

A variant/product shall be capable of having additional associated/searchable colors.

Example:

```text
Primary: Red

Associated:
- White
- Gold
```

### CLR-003 — Search by Associated Color

Searching/filtering for an associated color should allow the product to be discovered where appropriate.

### CLR-004 — Primary Visual Representation

Associated colors shall not automatically replace the primary color used for normal variant representation.

### CLR-005 — Color Presentation Metadata

Colors should support visual information needed by the storefront, such as:

- display name;
- color value/swatch;
- optional custom image/texture where necessary.

### CLR-006 — Reusable Color Definitions

Common colors should not require completely unrelated definitions on every product.

---

# 11. Product Media Requirements

Shopify's current product architecture manages files independently and allows uploaded assets to be referenced from different commerce objects, supporting the centralized media-library direction requested for Maevelle.

### MED-001 — Central Media Library

**CURRENT — MUST**

Uploads shall become managed media assets in a centralized media system.

### MED-002 — Reuse

An asset should be reusable without requiring duplicate uploads.

### MED-003 — Product Gallery

Products shall support ordered media galleries.

### MED-004 — Variant Gallery

Media shall be assignable to specific variants.

### MED-005 — Variant Switching

Changing a color/variant on the storefront shall be able to change the displayed media stack.

### MED-006 — Product Fallback Media

When a selected variant lacks its own complete gallery, configured product-level media may act as fallback.

### MED-007 — Media Metadata

Assets shall store useful metadata.

At minimum where applicable:

- filename;
- MIME/type;
- dimensions;
- file size;
- upload timestamp;
- uploader;
- alt text.

### MED-008 — Usage Tracking

**CURRENT — MUST**

The system shall be capable of identifying where an asset is currently used.

### MED-009 — Safe Deletion

Deletion shall warn/block appropriately when an asset is referenced elsewhere.

### MED-010 — Unused Media Detection

Administrators should be able to identify assets that are not used anywhere.

### MED-011 — Media Search

The library should support searching/filtering assets.

### MED-012 — Image Optimization

Storefront delivery should use appropriately optimized image representations.

### MED-013 — Original Preservation

Where appropriate, image optimization shall not require destruction of the original uploaded asset.

### MED-014 — Future Media Types

**FOUNDATION — SHOULD**

The media architecture should not permanently assume that every media item is a JPEG/PNG image.

Established storefront systems support richer media such as video and 3D assets.

---

# 12. Sizing & Measurement Requirements

The sizing system shall be treated as a dedicated domain rather than a fixed `S/M/L` product field.

### SIZ-001 — Dedicated Sizing Subsystem

**CURRENT — MUST**

Sizing shall have reusable structured models.

### SIZ-002 — Arbitrary Size Labels

The system shall support labels such as:

- XS / S / M / L;
- 38 / 40 / 42;
- EU 41;
- UK 7;
- 2Y;
- Free Size;
- custom business-defined labels.

### SIZ-003 — Product-Specific Sizes

Different products may expose different sets of selectable sizes.

### SIZ-004 — Reusable Size Systems

Administrators should be able to reuse size systems across relevant products.

### SIZ-005 — Measurement Fields

Size charts shall support configurable measurements.

Examples:

- chest;
- waist;
- length;
- shoulder;
- sleeve;
- foot length.

### SIZ-006 — Measurement Units

Measurements shall support explicit units.

Examples:

- cm;
- inch;
- mm.

### SIZ-007 — Size Matrix Builder

Administrators shall be able to create structured size charts using rows/columns without writing HTML.

### SIZ-008 — Category-Appropriate Measurements

The system shall not assume that every size chart uses fashion-body measurements.

### SIZ-009 — Regional Systems

The architecture should support regional equivalencies where required.

Example:

```text
EU 41
UK 7
US 8
```

### SIZ-010 — Product Override

A product should be able to override or customize a reusable size chart where necessary.

### SIZ-011 — Measurement Instructions

Size charts should support explanatory measurement instructions.

### SIZ-012 — Optional Diagram

The architecture should allow measurement diagrams/images to accompany charts.

### SIZ-013 — Size-to-Variant Connection

Selectable product sizes shall connect cleanly with variants and inventory.

### SIZ-014 — No-Size Products

Products without sizes shall not be forced into irrelevant size configuration.

### SIZ-015 — Advanced Builder UX

The dashboard size builder must prioritize ease of use despite supporting advanced structures.

---

# 13. Reviews and Ratings

### REV-001 — Product Rating

Published products shall be capable of receiving star ratings.

### REV-002 — Written Review

A review shall support written customer feedback.

### REV-003 — Review Images

Customers shall be capable of attaching images to reviews.

### REV-004 — Review Moderation

Business users shall have moderation capabilities.

### REV-005 — Review Status

Reviews should have states such as:

- pending;
- approved;
- rejected/hidden.

### REV-006 — Rating Summary

The storefront shall be capable of displaying aggregate product rating information.

### REV-007 — Abuse Protection

Review submission shall have safeguards against spam and abuse.

### REV-008 — Verified Purchase Readiness

**FOUNDATION — SHOULD**

The model should allow reviews to later be associated with actual purchases.

---

# 14. Search Requirements

### SRC-001 — Storefront Search

**CURRENT — MUST**

Customers shall have access to a prominent product search capability.

### SRC-002 — Title Search

Search shall consider product titles.

### SRC-003 — Category Search Context

Category information may influence search/discovery.

### SRC-004 — Tag Search

Relevant tags should participate in discovery.

### SRC-005 — Occasion Search

Occasion/event classification shall be searchable/filterable where appropriate.

### SRC-006 — Color Search

Primary and associated colors shall be available to search/filter logic.

### SRC-007 — SKU Search

Business portal search shall support SKU lookup.

### SRC-008 — Attribute Search

Selected catalog attributes should be searchable/filterable.

### SRC-009 — Typo Tolerance

**CURRENT — SHOULD**

Search should eventually tolerate reasonable spelling mistakes.

### SRC-010 — Search Relevance

Results shall be ranked intentionally rather than solely by database insertion order.

### SRC-011 — Search Performance

Search response times shall remain suitable for interactive storefront usage.

### SRC-012 — Search Engine Replaceability

**FOUNDATION — MUST**

Catalog modeling shall not tightly depend on one specific search engine.

### SRC-013 — Zero-Result UX

The storefront shall provide useful behavior when no exact results are found.

### SRC-014 — Internal Search

Important business portal modules shall provide fast internal search.

---

# 15. Social Sharing Requirements

### SHR-001 — Product Sharing

**CURRENT — MUST**

Product pages shall expose sharing functionality.

### SHR-002 — Shareable URL

Products shall have stable, appropriate storefront URLs.

### SHR-003 — Social Metadata

Product links shall produce useful previews on supported social platforms.

### SHR-004 — Variant Sharing Readiness

Where useful, the architecture should allow a shared URL to represent a selected product configuration/variant.

---

# 16. Cart Requirements

### CRT-001 — Guest Cart

**CURRENT — MUST**

Customers shall be able to create and use a cart without an account.

### CRT-002 — Add Product

Customers shall be able to add sellable variants to the cart.

### CRT-003 — Update Quantity

Customers shall be able to update quantities.

### CRT-004 — Remove Item

Customers shall be able to remove items.

### CRT-005 — Availability Validation

Cart quantities must be validated against relevant purchasing rules.

### CRT-006 — Revalidation

Important values shall be revalidated before order completion.

Examples:

- availability;
- price;
- promotion eligibility.

### CRT-007 — Cart Persistence

A guest cart should survive normal navigation/reloads for a reasonable duration.

### CRT-008 — Future Account Cart

**FOUNDATION — MUST**

The cart architecture shall allow future association/synchronization with customer accounts.

---

# 17. Checkout Requirements

### CHK-001 — Guest Checkout

**CURRENT — MUST**

Account creation shall not be required to place an order.

### CHK-002 — Minimal Checkout

Checkout shall require only information necessary for successfully processing the order.

### CHK-003 — Customer Information

Checkout shall capture required customer identity/contact information.

### CHK-004 — Delivery Address

Checkout shall capture necessary delivery-address information.

### CHK-005 — Payment Selection

Customers shall choose from currently available payment methods.

### CHK-006 — Order Review

The customer shall be able to review critical order information before final submission.

### CHK-007 — Duplicate Submission Protection

**CURRENT — MUST**

Retries, double-clicks or network uncertainty shall not easily create duplicate orders.

Reliable API systems commonly use idempotency mechanisms to make repeated mutation requests safe; this principle should be applied to critical Maevelle operations.

### CHK-008 — Server-Side Validation

Checkout security and validation shall not depend exclusively on client-side validation.

### CHK-009 — Clear Failure Recovery

A checkout failure shall communicate whether an order was created and what the customer should do next.

---

# 18. Coupon and Promotion Requirements

### PRO-001 — Coupon Codes

**CURRENT — MUST**

Customers shall be able to enter coupon codes.

### PRO-002 — Coupon Management

Authorized business users shall be able to create/manage coupons.

### PRO-003 — Coupon Activation

Coupons shall support active/inactive state.

### PRO-004 — Validity Period

Coupons should support start/end validity.

### PRO-005 — Usage Limits

Coupons should support configurable usage restrictions.

### PRO-006 — Discount Types

The architecture should support multiple discount types.

Examples:

- fixed amount;
- percentage.

### PRO-007 — Eligibility Rules

Promotions should eventually support rules based on relevant conditions.

### PRO-008 — Usage Tracking

Coupon usage shall be traceable to orders.

### PRO-009 — Abuse Prevention

Promotion rules shall be enforced server-side.

---

# 19. Order Requirements

### ORD-001 — Order Entity

**CURRENT — MUST**

Orders shall be first-class transactional records.

### ORD-002 — Storefront Orders

Orders may originate from storefront checkout.

### ORD-003 — Manual Orders

**CURRENT — MUST**

Authorized staff shall be able to create orders manually.

### ORD-004 — Order Editing

Authorized staff shall be capable of modifying eligible order information.

### ORD-005 — Historical Integrity

**CURRENT — MUST**

Order line items shall preserve important purchase-time information even if the current product changes later.

Examples include:

- product name;
- selected variant;
- SKU;
- quantity;
- unit price;
- discount;
- relevant tax;
- final totals.

### ORD-006 — Unique Order Reference

Each order shall receive a human-usable unique reference/number.

### ORD-007 — Order Timeline

The portal shall show important lifecycle events/history for an order.

### ORD-008 — Order Notes

Staff should be able to add internal notes.

### ORD-009 — Customer Notes

Customer-facing notes/instructions shall remain distinguishable from internal notes.

### ORD-010 — Status Filtering

The order list shall support filtering by relevant status.

### ORD-011 — Powerful Search

Orders shall be searchable by relevant identifiers.

Examples:

- order number;
- customer name;
- phone;
- email;
- tracking number where available.

### ORD-012 — Bulk Operations

Appropriate bulk order workflows should be supported.

### ORD-013 — Cancellation

Eligible orders shall support cancellation.

### ORD-014 — Cancellation Reason

Cancellation shall support reason/history information.

### ORD-015 — Partial Fulfillment Readiness

**FOUNDATION — MUST**

The model shall not assume every item in an order must always be fulfilled simultaneously.

Established commerce systems model partial and complete fulfillment separately, including stock allocation/release behavior.

### ORD-016 — Returns Foundation

**FOUNDATION — MUST**

Order architecture shall not prevent future return workflows.

### ORD-017 — Refund Foundation

**FOUNDATION — MUST**

Payment/order architecture shall not prevent full or partial refunds.

### ORD-018 — Order Source

The system shall record how an order was created.

Examples:

- storefront;
- manual portal;
- future API/integration.

---

# 20. Order State Separation

A single giant `status` shall not represent every dimension of an order.

### OST-001 — Order State

The business lifecycle of the order shall have its own state.

### OST-002 — Payment State

Payment shall have its own state.

### OST-003 — Fulfillment State

Fulfillment shall have its own state.

Example:

```text
Order: Confirmed
Payment: Unpaid
Fulfillment: Unfulfilled
```

### OST-004 — Valid State Transitions

The system shall control invalid transitions.

Example:

A delivered order should not accidentally transition directly back to a normal pending order without an intentional corrective workflow.

### OST-005 — State Change History

Important state transitions shall be recorded.

---

# 21. Payment Requirements

### PAY-001 — Cash on Delivery

**CURRENT — MUST**

Cash on delivery shall be supported.

### PAY-002 — Manual bKash

**CURRENT — MUST**

Manual bKash payment workflows shall be supported.

### PAY-003 — Manual Nagad

**CURRENT — MUST**

Manual Nagad payment workflows shall be supported.

### PAY-004 — Payment Record

Payments shall be represented independently enough to maintain transaction/payment history.

### PAY-005 — Payment Reference

Manual payment methods should capture relevant transaction/reference information.

### PAY-006 — Payment Verification

Manual payment workflows shall support verification state.

### PAY-007 — Multiple Payment Providers

**FOUNDATION — MUST**

The payment architecture shall not be tied exclusively to the initial methods.

### PAY-008 — SSLCommerz Readiness

**FUTURE — MUST**

Future integration with SSLCommerz shall be possible without redesigning orders.

### PAY-009 — Partial/Multiple Payments Readiness

**FOUNDATION — SHOULD**

The underlying model should not unnecessarily prevent multiple payment attempts/records for an order.

### PAY-010 — Payment History

Payment changes shall be auditable.

---

# 22. Invoice Requirements

### INVCE-001 — Order Invoice

**CURRENT — MUST**

The system shall generate an invoice/receipt representation for orders.

### INVCE-002 — Stable Historical Values

Generated invoices shall use transaction-time data rather than blindly using current product values.

### INVCE-003 — Printable Format

Invoices shall have a print-friendly representation.

### INVCE-004 — Invoice Numbering

The system shall provide an appropriate numbering/reference strategy.

### INVCE-005 — Business Information

Invoices shall contain configured business information.

---

# 23. Inventory Requirements

Research across modern commerce platforms confirms the value of separating inventory items, inventory levels, stock locations and reservations rather than storing only a single global quantity. Medusa explicitly models inventory quantity by location and reservations; Saleor exposes warehouse stock and allocated quantities separately.

### STK-001 — Inventory Tracking

**CURRENT — MUST**

Inventory shall be trackable for sellable items/variants.

### STK-002 — Location-Level Inventory

**CURRENT — MUST**

Inventory quantities shall be associated with locations.

### STK-003 — On-Hand Quantity

The system shall distinguish physical on-hand quantity.

### STK-004 — Reserved Quantity

The system shall support quantity reservations/allocations.

### STK-005 — Available Quantity

Available-to-sell quantity shall be derivable according to inventory rules.

### STK-006 — Incoming Quantity

The system should be able to represent expected incoming stock.

### STK-007 — Inventory Movement Ledger

**CURRENT — MUST**

Inventory changes shall generate traceable movements/entries rather than only silently overwriting a stock number.

### STK-008 — Movement Type

Inventory movements shall indicate their cause/type.

Examples:

- purchase receipt;
- sale;
- cancellation;
- return;
- transfer;
- damage;
- correction.

### STK-009 — Movement Reference

Where possible, a movement shall link to its originating business record.

### STK-010 — Manual Adjustment

Authorized staff shall be able to adjust inventory.

### STK-011 — Adjustment Reason

Manual adjustments shall require or support an appropriate reason.

### STK-012 — Adjustment Audit

Manual stock adjustments shall record actor and timestamp.

### STK-013 — Negative Inventory Policy

The business shall have configurable behavior around overselling/negative availability where appropriate.

### STK-014 — Low Stock

The system should support low-stock thresholds.

### STK-015 — Out of Stock

Sellability behavior for unavailable variants shall be explicit.

### STK-016 — Inventory History

Users shall be able to inspect historical movements for an inventory item.

### STK-017 — Bulk Adjustment

Efficient bulk inventory management should be provided.

### STK-018 — Concurrency Safety

**CURRENT — MUST**

Simultaneous orders/adjustments shall not casually corrupt or incorrectly oversell tracked inventory.

### STK-019 — Reservation Lifecycle

Inventory reservations shall have explicit creation, release and consumption behavior.

Established systems use reservations/allocations to prevent stock promised to active orders from appearing fully available.

---

# 24. Warehouse / Location Requirements

### WHS-001 — Multiple Locations

**CURRENT — MUST**

A business shall support multiple inventory locations.

### WHS-002 — Warehouse Metadata

Locations shall contain operational information such as:

- name;
- code;
- address;
- active status.

### WHS-003 — Stock Per Warehouse

The portal shall expose stock by warehouse/location.

### WHS-004 — Aggregate Stock

The UI should be able to show aggregate inventory while permitting location-level inspection.

Shopify's current admin-extension guidance similarly recommends aggregate variant inventory with the ability to inspect/filter per location.

### WHS-005 — Inventory Transfer

**CURRENT — MUST**

Stock shall be transferable between appropriate locations.

### WHS-006 — Transfer Lifecycle

Transfers should have controlled states rather than instantly and silently modifying both warehouses.

Potential lifecycle:

```text
Draft
→ Requested
→ In Transit
→ Received
```

Detailed design will follow.

### WHS-007 — Transfer History

Warehouse transfers shall be traceable.

### WHS-008 — Fulfillment Allocation Strategy

**FOUNDATION — SHOULD**

The platform should allow future rules that determine which warehouse fulfills an order.

Mature platforms expose strategies such as warehouse priority or higher-stock preference.

---

# 25. Supplier Requirements

### SUP-001 — Supplier Records

**CURRENT — MUST**

The procurement system shall support suppliers.

### SUP-002 — Supplier Information

Suppliers should support relevant information including:

- name;
- contact methods;
- address;
- country;
- internal notes.

### SUP-003 — Supplier Product Relationship

The system should support recording where products/variants are sourced.

### SUP-004 — Supplier History

The business shall be able to inspect purchases associated with a supplier.

### SUP-005 — Multiple Suppliers

The architecture shall not assume every product has exactly one possible supplier.

---

# 26. Procurement / Purchasing Requirements

### PUR-001 — Purchase Record

**CURRENT — MUST**

The business shall be able to represent purchases from suppliers.

### PUR-002 — Purchase Lifecycle

Purchases shall support operational status/lifecycle.

### PUR-003 — Purchase Items

A purchase may contain multiple products/variants.

### PUR-004 — Purchase Quantity

Purchased quantities shall be recorded.

### PUR-005 — Purchase Unit Cost

Supplier unit cost shall be recorded independently from retail selling price.

### PUR-006 — Purchase Currency

Purchase transactions shall record their currency.

### PUR-007 — Supplier Reference

External supplier/order references should be recordable.

### PUR-008 — Ordered vs Received

The system shall distinguish quantities ordered from quantities actually received.

### PUR-009 — Partial Receiving

A purchase shall be capable of being received partially.

### PUR-010 — Purchase Notes

Operational notes shall be supported.

### PUR-011 — Supporting Documents

Future-ready attachment support should allow purchase-related invoices/documents/images.

### PUR-012 — Purchase Payment Tracking

**CURRENT — SHOULD**

Payments made to suppliers should be recordable.

### PUR-013 — Purchase History

Edits/state changes affecting important purchasing values shall be traceable.

---

# 27. Inbound Shipment Requirements

### ISH-001 — Incoming Shipment

**CURRENT — MUST**

Incoming shipments shall be represented independently from purchases.

### ISH-002 — Multiple Purchases Per Shipment

**CURRENT — MUST**

One incoming shipment may consolidate items from multiple purchases.

### ISH-003 — Multiple Suppliers Per Shipment

**CURRENT — MUST**

A shipment may contain items sourced from different suppliers.

### ISH-004 — Partial Purchase Shipment

A purchase may potentially be split across multiple shipments.

### ISH-005 — Shipment Lifecycle

Inbound shipments shall support appropriate operational stages.

Potential concepts include:

```text
Preparing
Booked
In Transit
Customs
Arrived
Receiving
Completed
```

Exact lifecycle will be designed separately.

### ISH-006 — Shipping Information

Shipments should support useful information such as:

- origin;
- destination;
- forwarding/shipping provider;
- tracking/reference;
- expected dates;
- actual arrival dates.

### ISH-007 — Shipment Items

The system shall know which purchased items/quantities are contained in a shipment.

### ISH-008 — Goods In Transit

**FOUNDATION — MUST**

Inventory architecture shall be able to distinguish goods that have been purchased/shipped but are not yet available warehouse inventory.

Large supply-chain platforms explicitly distinguish goods-in-transit from normal warehouse availability.

### ISH-009 — Shipment Attachments

Documents such as invoices, customs papers or shipping receipts should be attachable.

---

# 28. Landed Cost Requirements

Landed cost must be a dedicated capability. Microsoft Dynamics describes landed cost as controlling inbound shipping and related financial costs, while Business Central treats freight, handling, insurance and transportation as costs that can contribute to inventory value.

### LDC-001 — Landed Cost Calculation

**CURRENT — MUST**

The platform shall calculate the effective acquisition/landed cost of received inventory.

### LDC-002 — Base Product Cost

Supplier purchase cost shall form part of landed cost.

### LDC-003 — Additional Charges

Additional direct costs may contribute to landed cost.

Examples:

- international freight;
- local freight;
- customs;
- VAT/taxes where appropriate;
- forwarding fee;
- insurance;
- handling;
- packaging/processing;
- other direct charges.

### LDC-004 — Shipment-Level Charge

A charge may apply to an entire shipment.

### LDC-005 — Item-Level Charge

A charge may apply specifically to selected items.

### LDC-006 — Allocation Engine

**CURRENT — MUST**

Shared charges shall support allocation to affected inventory.

### LDC-007 — Equal Allocation

Allocation may be equal among selected allocation targets.

### LDC-008 — Quantity Allocation

Allocation may be based on item quantity.

### LDC-009 — Value Allocation

Allocation may be based on purchase value.

### LDC-010 — Weight Allocation

Allocation may be based on weight.

### LDC-011 — Volume Allocation

**FOUNDATION — SHOULD**

Allocation should support volume where product dimensions are available.

Enterprise landed-cost systems similarly use quantities and physical measurements such as weight/volume during inbound cost calculations.

### LDC-012 — Percentage Allocation

Manual percentage-based distribution should be supported.

### LDC-013 — Manual Allocation

Users shall be able to manually assign amounts when automatic strategies are unsuitable.

### LDC-014 — Different Strategy Per Charge

Different shipment charges shall be able to use different allocation strategies.

Example:

```text
Freight      → by weight
Customs      → by purchase value
Local Van    → equal
Special Fee  → manual
```

### LDC-015 — Allocation Preview

The portal shall show allocation results before finalizing when appropriate.

### LDC-016 — Allocation Validation

Allocated amounts shall reconcile with the source expense subject to defined rounding rules.

### LDC-017 — Rounding Handling

Financial rounding differences shall be handled deterministically.

### LDC-018 — Landed Unit Cost

The platform shall calculate resulting landed unit cost where applicable.

### LDC-019 — Estimated Costs

**CURRENT — SHOULD**

The system should support estimated/preliminary shipment costs.

### LDC-020 — Actual Costs

Actual costs should later replace/reconcile estimates.

### LDC-021 — Recalculation Control

Changing landed-cost inputs after inventory receipt shall follow controlled accounting/business rules rather than silently rewriting historical values.

### LDC-022 — Cost Breakdown

Users shall be able to understand how landed cost was calculated.

Example:

```text
Supplier Cost            ৳500
International Freight     ৳70
Customs                    ৳35
Local Handling             ৳10
-------------------------------
Landed Cost               ৳615
```

### LDC-023 — Profitability Connection

Analytics should eventually be able to compare sales against meaningful acquisition/landed cost.

---

# 29. Expense Management Requirements

### EXP-001 — Expense Records

**CURRENT — MUST**

The system shall support business expense recording.

### EXP-002 — Expense Categories

Expenses shall support categories.

Examples:

- sourcing;
- shipping;
- marketing;
- office;
- packaging;
- transport;
- utilities;
- software;
- miscellaneous.

### EXP-003 — Custom Categories

Businesses should be able to configure appropriate expense categories.

### EXP-004 — Expense Amount

Expenses shall record financial amount and currency.

### EXP-005 — Expense Date

Expenses shall record relevant date/time information.

### EXP-006 — Expense Description

Expenses shall support notes/descriptions.

### EXP-007 — Attachments

Receipts/invoices/images should be attachable.

### EXP-008 — Entity Link

An expense may be associated with a relevant entity.

Examples:

```text
Expense → Shipment
Expense → Purchase
Expense → Order
Expense → Marketing activity
```

### EXP-009 — General Expense

Expenses shall also be allowed without a specific linked transaction.

### EXP-010 — Marketing Expense

Marketing spending such as Facebook/Google advertising shall be recordable.

### EXP-011 — Payment Method

The business should be able to record how an expense was paid.

### EXP-012 — Expense Editing Audit

Important edits shall be traceable.

### EXP-013 — Expense Analytics

Reports shall aggregate/filter expenses over relevant dimensions.

---

# 30. Customer Requirements

### CUS-001 — Customer Record

**CURRENT — MUST**

Customers shall exist as business records independently of customer login accounts.

### CUS-002 — Guest Customer Creation/Matching

Guest orders shall be capable of creating or associating with customer records.

### CUS-003 — Customer Contact Information

Customer records shall support relevant contact information.

### CUS-004 — Address History

Relevant delivery addresses should be reusable/inspectable internally.

### CUS-005 — Order History

A customer's historical orders shall be visible.

### CUS-006 — Customer Statistics

The portal should provide useful statistics such as:

- number of orders;
- delivered orders;
- cancelled orders;
- total/relevant spend;
- last order;
- first order.

### CUS-007 — Customer Search

Customers shall be searchable using relevant identifiers.

### CUS-008 — Customer Notes

Staff should be able to attach internal notes.

### CUS-009 — Duplicate Handling

**CURRENT — MUST**

The platform shall have a deliberate policy for identifying possible duplicate customer records.

### CUS-010 — Merge Foundation

**FOUNDATION — SHOULD**

Customer architecture should allow duplicate records to be merged safely in the future.

### CUS-011 — Customer Account Separation

**FOUNDATION — MUST**

A customer record shall not require a storefront authentication account.

---

# 31. Customer Account Future Requirements

### ACC-001 — Customer Registration

**FUTURE**

Customers may create storefront accounts.

### ACC-002 — Login

Customers may authenticate to their account.

### ACC-003 — Order History

Authenticated customers shall view their associated orders.

### ACC-004 — Saved Cart

Account-associated carts shall persist across devices.

### ACC-005 — Guest History Claiming

The architecture should allow an authenticated customer to safely associate eligible historical guest orders where identity can be verified.

---

# 32. Identity & Staff Account Requirements

### IAM-001 — Multiple Internal Accounts

**CURRENT — MUST**

Administrators shall be able to add multiple business portal accounts.

### IAM-002 — Individual Authentication

Each person shall have their own identity rather than sharing a global admin credential.

### IAM-003 — Account Activation

Accounts shall be activatable/deactivatable.

### IAM-004 — Granular Permissions

**CURRENT — MUST**

Access shall be based on capabilities/permissions.

Examples:

```text
products.view
products.create
products.edit
products.publish

orders.view
orders.edit
orders.cancel

inventory.view
inventory.adjust

expenses.view
expenses.create

users.manage_access
```

### IAM-005 — Permission Groups/Presets

**CURRENT — SHOULD**

Convenient presets may group permissions.

Example:

- Order Operator
- Catalog Manager
- Inventory Operator

However, these presets shall not replace granular permission control.

### IAM-006 — Custom Access

Administrators shall be able to customize access beyond fixed presets.

### IAM-007 — Sensitive Data Restriction

The system shall allow sensitive areas to have stricter access.

Examples may include:

- cost prices;
- expenses;
- financial analytics;
- account permissions.

### IAM-008 — Server-Side Authorization

**CURRENT — MUST**

Hiding a UI button shall never be the sole authorization mechanism.

### IAM-009 — Scope-Aware Permissions

**FOUNDATION — SHOULD**

The permission model should permit future restrictions based on scope, such as warehouse/location or other organizational dimensions.

Existing commerce systems use both data permissions and scoped permissions, demonstrating why a richer model can become useful.

### IAM-010 — Privilege Escalation Prevention

A user shall not be able to grant themselves or another account permissions beyond what they are authorized to manage.

---

# 33. Audit Requirements

### AUD-001 — Audit Log

**CURRENT — MUST**

Security- and business-sensitive operations shall produce auditable events.

### AUD-002 — Actor

Audit events shall record who initiated the change when an actor exists.

### AUD-003 — Timestamp

Audit events shall record when the action occurred.

### AUD-004 — Entity

Audit entries shall identify the affected entity.

### AUD-005 — Action

Audit entries shall identify the action performed.

### AUD-006 — Change Information

For relevant changes, previous/new values or an equivalent structured representation should be recorded.

### AUD-007 — System Actions

Automated/system actions should be distinguishable from human actions.

### AUD-008 — Audit Search

Authorized users shall be able to search/filter important audit history.

### AUD-009 — Audit Protection

Ordinary users shall not be able to edit historical audit events.

---

# 34. Notification Requirements

### NTF-001 — Internal Notifications

**CURRENT — MUST**

The business portal shall support notifications.

### NTF-002 — Notification Types

Notification categories should be distinguishable.

Examples:

- new order;
- stock warning;
- payment issue;
- operational warning.

### NTF-003 — Read State

Users shall be able to distinguish unread/read notifications.

### NTF-004 — Notification Link

Notifications should link directly to their relevant records.

### NTF-005 — User Preference Readiness

**FOUNDATION — SHOULD**

Future notification preferences should be possible.

### NTF-006 — External Channels

**FUTURE**

Notifications may later be delivered to systems such as:

- Telegram;
- WhatsApp;
- other communication channels.

---

# 35. Analytics & Reporting Requirements

### ANA-001 — Dashboard Overview

**CURRENT — MUST**

The portal shall provide a high-priority business overview.

### ANA-002 — Sales Analytics

Reporting shall include sales/order performance.

### ANA-003 — Order Analytics

Reporting shall include order lifecycle metrics.

### ANA-004 — Product Analytics

Reporting should allow product-level performance analysis.

### ANA-005 — Inventory Analytics

The business should be able to analyze inventory conditions.

### ANA-006 — Customer Analytics

Customer behavior/history statistics shall be available where meaningful.

### ANA-007 — Expense Analytics

Expenses shall be reportable.

### ANA-008 — Cost / Profitability Analytics

Where sufficient cost data exists, the platform should provide profitability analysis using meaningful product cost rather than only revenue.

### ANA-009 — Date Filtering

Reports shall support date-range filtering.

### ANA-010 — Comparative Periods

**CURRENT — SHOULD**

Reports should support useful period comparison.

### ANA-011 — Warehouse Filtering

Relevant analytics should support location filtering.

### ANA-012 — Export

**CURRENT — SHOULD**

Business users should be able to export useful report/data sets.

### ANA-013 — Correctness Over Decoration

Analytics shall prioritize explainable/correct metrics over visually impressive but ambiguous charts.

### ANA-014 — Metric Definitions

Important metrics shall have defined meanings.

For example:

`Revenue`, `Net Sales`, `Delivered Orders`, and `Profit` must not be left semantically ambiguous.

---

# 36. Settings Requirements

### SET-001 — Organized Settings

**CURRENT — MUST**

Configuration shall be centralized into a structured settings experience.

### SET-002 — Business Settings

Business identity/configuration shall be manageable.

### SET-003 — Storefront Settings

Storefront-related settings shall be manageable without source-code edits where appropriate.

### SET-004 — Order Settings

Relevant order policies shall be configurable.

### SET-005 — Inventory Settings

Relevant stock behavior shall be configurable.

### SET-006 — Payment Settings

Payment methods shall have centralized configuration.

### SET-007 — Permission Settings

Access configuration shall be organized appropriately.

### SET-008 — Dangerous Setting Protection

Settings with broad destructive impact shall use explicit safeguards.

---

# 37. Currency, Locale, Date & Time Requirements

### LOC-001 — Central Timezone

**CURRENT — MUST**

The business shall have a configured operational timezone.

### LOC-002 — Internal Timestamp Integrity

**FOUNDATION — MUST**

Timestamp storage/processing shall not depend on presentation formatting.

### LOC-003 — Date Format

Users/business settings shall support configurable date presentation.

### LOC-004 — Time Format

12-hour/24-hour presentation shall be configurable where required.

### LOC-005 — Currency Support

**CURRENT — MUST**

The architecture shall support multiple currencies.

### LOC-006 — Business/Base Currency

The system shall have an appropriate concept of business/base currency.

### LOC-007 — Transaction Currency

Financial records shall retain the currency in which the transaction occurred.

### LOC-008 — Currency Formatting

Currency formatting shall respect currency/locale configuration.

### LOC-009 — Number Formatting

Number formatting shall support locale-appropriate presentation.

### LOC-010 — Decimal Safety

**CURRENT — MUST**

Financial amounts shall not use unsafe floating-point assumptions that can introduce monetary calculation errors.

### LOC-011 — Exchange Rate Readiness

**FOUNDATION — MUST**

Multi-currency architecture shall allow exchange-rate information to be incorporated where conversion/accounting requires it.

### LOC-012 — Historical Rate Preservation

**FOUNDATION — SHOULD**

Future multi-currency calculations should be able to preserve the rate used at transaction time rather than recalculating old transactions using today's rate.

---

# 38. Business Portal UX Requirements

### BUX-001 — shadcn/ui

**CURRENT**

The internal portal shall use shadcn/ui as a major UI foundation.

### BUX-002 — Organized Sidebar

The portal shall use a clear navigation hierarchy.

### BUX-003 — Nested Navigation

Sidebar sections may contain submenus where this improves comprehension.

### BUX-004 — Breadcrumbs

Dashboard subpages shall provide useful breadcrumbs.

### BUX-005 — Priority-Driven Information

Critical information shall receive stronger placement than rarely used information.

### BUX-006 — Progressive Disclosure

Advanced settings shall not overwhelm routine workflows.

### BUX-007 — Contextual Actions

Actions should appear where the underlying business context is available.

### BUX-008 — Consistent Interaction

Similar operations across modules shall behave consistently.

### BUX-009 — Filters

Operational lists shall support relevant filtering.

### BUX-010 — Sorting

Operational lists shall support relevant sorting.

### BUX-011 — Pagination / Scalable Lists

Large data collections shall not require loading every record simultaneously.

### BUX-012 — Saved Views

**CURRENT — SHOULD**

Frequently reused combinations of filters/columns should eventually support saved views.

### BUX-013 — Bulk Actions

High-volume operational workflows shall support appropriate bulk operations.

### BUX-014 — Clear Confirmation

Destructive/high-impact actions shall clearly communicate consequences.

### BUX-015 — Undo Where Safe

**CURRENT — SHOULD**

Operations that can safely support undo should consider it rather than always using disruptive confirmation dialogs.

### BUX-016 — Keyboard Efficiency

**CURRENT — SHOULD**

Frequently used business workflows should support efficient keyboard interaction where useful.

### BUX-017 — Empty States

Every important empty module/state shall explain the next useful action.

### BUX-018 — Error Recovery

Operational errors shall present actionable resolution.

### BUX-019 — Responsive Portal

The dashboard shall remain usable on reasonable screen sizes, while desktop may remain the primary high-volume operations experience.

---

# 39. Theme / Appearance Requirements

### THM-001 — Portal Light Mode

**CURRENT — MUST**

The business portal shall support a light appearance.

### THM-002 — Portal Dark Mode

**CURRENT — MUST**

The business portal shall support a carefully designed dark appearance.

### THM-003 — Preference Persistence

Appearance preference should persist appropriately.

### THM-004 — Storefront Theme Abstraction

**FOUNDATION — MUST**

Storefront commerce logic/data shall not be embedded irreversibly into a single theme implementation.

### THM-005 — Theme Switching

**FUTURE**

Businesses may eventually activate different storefront themes.

### THM-006 — Theme Data Compatibility

**FUTURE**

Switching storefront theme shall not require recreation of commerce data.

---

# 40. SEO Requirements

### SEO-001 — Server-Discoverable Storefront

**CURRENT — MUST**

Public catalog content shall be suitable for search-engine discovery.

### SEO-002 — Product Metadata

Products shall support SEO title/description where required.

### SEO-003 — Category Metadata

Categories shall support SEO metadata.

### SEO-004 — Canonical URLs

The system shall manage canonical page URLs appropriately.

### SEO-005 — Structured Data

**CURRENT — SHOULD**

Relevant storefront pages should expose appropriate structured metadata.

### SEO-006 — Social Preview Metadata

Storefront pages shall provide meaningful Open Graph/social metadata.

### SEO-007 — Sitemap

The storefront shall support sitemap generation.

### SEO-008 — Robots Controls

The platform shall expose suitable indexability controls.

### SEO-009 — Redirect Foundation

**FOUNDATION — SHOULD**

Changing slugs/URLs should eventually support redirect management to avoid unnecessary broken indexed links.

---

# 41. API Requirements

### API-001 — API-First Architecture

**CURRENT — MUST**

Core application capabilities shall have clearly designed service/API interfaces.

### API-002 — Resource Consistency

APIs shall use consistent naming and behavioral conventions.

### API-003 — Validation

Input validation shall occur at trusted application boundaries.

### API-004 — Structured Errors

APIs shall return structured, actionable errors.

### API-005 — Authentication

Protected APIs shall require appropriate authentication.

### API-006 — Authorization

API actions shall enforce permissions server-side.

### API-007 — Pagination

List APIs shall support scalable pagination where needed.

### API-008 — Filtering

Relevant APIs shall expose structured filtering.

### API-009 — Sorting

Relevant APIs shall expose structured sorting.

### API-010 — Idempotent Critical Mutations

Operations vulnerable to duplicate execution shall support appropriate idempotency/retry protections.

### API-011 — Versioning Strategy

**FOUNDATION — MUST**

External/public API evolution shall have an explicit compatibility/versioning strategy.

### API-012 — Internal vs External API

The architecture shall distinguish internal application interfaces from externally supported APIs.

### API-013 — API Documentation

Supported APIs shall be documented.

### API-014 — Rate Limiting

Public/sensitive endpoints shall support appropriate abuse/rate controls.

### API-015 — Correlation/Request IDs

**CURRENT — SHOULD**

Requests should have traceable identifiers useful for debugging distributed operations.

---

# 42. Webhook Requirements

### WHK-001 — Webhook Capability

**FOUNDATION — MUST**

The platform shall support event-driven outbound integrations where appropriate.

### WHK-002 — Event Types

Webhook events shall have explicit event types.

### WHK-003 — Stable Event Identity

Webhook deliveries shall contain an event identifier.

### WHK-004 — Retry

Failed deliveries should support controlled retries.

### WHK-005 — Duplicate Handling

Webhook design shall assume receivers may encounter repeated deliveries.

### WHK-006 — Signature Verification

Webhooks shall support authenticity verification.

### WHK-007 — Delivery History

Authorized users/operators should be able to inspect webhook delivery outcomes.

Reliable payment APIs similarly require webhook retry/idempotency-aware processing because network/event delivery failures can occur.

---

# 43. Security Requirements

### SEC-001 — Security by Design

**CURRENT — MUST**

Security shall be considered at architecture, API, data, UI and infrastructure layers.

### SEC-002 — Least Privilege

Accounts/services should receive only necessary access.

### SEC-003 — Password Security

If passwords are used, they shall be stored using appropriate modern password hashing practices, never plaintext.

### SEC-004 — Session Security

Authentication sessions shall be protected against common session attacks.

### SEC-005 — CSRF Protection

State-changing browser operations shall have appropriate CSRF protections where applicable.

### SEC-006 — XSS Protection

User-controlled content shall not be rendered unsafely.

### SEC-007 — Injection Protection

Database/query execution shall protect against injection attacks.

### SEC-008 — File Upload Security

Uploads shall be validated and treated as untrusted input.

### SEC-009 — Permission Enforcement

Authorization shall be enforced beyond the presentation layer.

### SEC-010 — Sensitive Information

Secrets and sensitive credentials shall not be exposed in frontend bundles or logs.

### SEC-011 — Secret Management

Production secrets shall be managed separately from source code.

### SEC-012 — Rate / Abuse Protection

Authentication, reviews, search and other abuse-sensitive surfaces shall have appropriate protections.

### SEC-013 — Audit Security

Sensitive administrative operations shall be traceable.

### SEC-014 — Dependency Security

Dependencies shall be monitored and maintainable.

### SEC-015 — Data Exposure Minimization

APIs shall avoid exposing fields merely because they exist internally.

### SEC-016 — Secure Defaults

New accounts/features should default to safer access rather than maximum permission.

### SEC-017 — Backup Security

Backups shall receive security protections appropriate to production data.

---

# 44. Data Integrity Requirements

### DAT-001 — Referential Integrity

**CURRENT — MUST**

Business relationships shall not silently become invalid.

### DAT-002 — Transactional Operations

Operations involving multiple dependent changes shall use transaction/consistency mechanisms where necessary.

Example:

```text
Create Order
Reserve Stock
Record Payment Attempt
Create Timeline Event
```

shall not leave arbitrary partial corruption if one critical step fails.

### DAT-003 — Historical Snapshotting

Historical transactions shall not depend completely on mutable current catalog records.

### DAT-004 — Soft Removal Where Appropriate

Records with historical importance should use archival/deactivation approaches when destructive deletion would break history.

### DAT-005 — Uniqueness

Identifiers requiring uniqueness shall be enforced at appropriate trusted layers.

### DAT-006 — Concurrency

Concurrent writes shall be handled deliberately for sensitive resources.

### DAT-007 — Financial Reconciliation

Financial allocation calculations shall provide deterministic reconciliation.

---

# 45. Import / Export Requirements

This was not explicitly included in the original brief, but a serious catalog/inventory system will eventually become unnecessarily labor-intensive without structured data movement.

### IMP-001 — Data Export

**CURRENT — SHOULD**

Important operational datasets should support export.

### IMP-002 — Product Import

**FOUNDATION — SHOULD**

Bulk catalog imports should be supported later.

### IMP-003 — Inventory Import

**FOUNDATION — SHOULD**

Controlled bulk inventory updates/imports should be possible.

### IMP-004 — Validation Preview

Imports shall validate data before destructive application.

### IMP-005 — Import Error Report

Invalid rows shall produce understandable error information.

### IMP-006 — Import Audit

Important bulk mutations shall remain attributable to the import operation/user.

---

# 46. Observability & Operations Requirements

### OPS-001 — Application Logging

**CURRENT — MUST**

Important server-side application events/errors shall be logged.

### OPS-002 — Structured Logs

**CURRENT — SHOULD**

Logs should use structured context rather than only arbitrary strings.

### OPS-003 — Error Monitoring

**CURRENT — MUST**

Production failures shall be observable.

### OPS-004 — Performance Monitoring

**CURRENT — SHOULD**

Critical endpoints/pages should have measurable performance.

### OPS-005 — Health Checks

Deployments shall expose meaningful health/readiness information.

### OPS-006 — Backup Strategy

**CURRENT — MUST**

Production database/data shall have a documented backup strategy.

### OPS-007 — Restore Testing

**CURRENT — MUST**

A backup strategy is incomplete unless restoration is periodically testable.

### OPS-008 — Database Migration Strategy

**CURRENT — MUST**

Schema changes shall use controlled, reviewable migrations.

### OPS-009 — Environment Separation

Development/testing/production environments shall not casually share mutable production resources.

### OPS-010 — Background Job Visibility

**FOUNDATION — SHOULD**

When queues/jobs are introduced, failed jobs shall be observable/retryable.

---

# 47. Performance Requirements

### PERF-001 — Performance as Product Requirement

**CURRENT — MUST**

Performance shall be considered during feature design rather than postponed entirely until after implementation.

### PERF-002 — Storefront First Load

Storefront initial page loading shall be optimized aggressively.

### PERF-003 — Image Delivery

Product/media delivery shall use responsive optimized assets.

### PERF-004 — Avoid Unnecessary Client JavaScript

Pages shall not be made client-rendered by default when server rendering/static techniques better serve the requirement.

### PERF-005 — Efficient Queries

Business portal pages shall avoid uncontrolled query patterns as data grows.

### PERF-006 — Pagination

Large datasets shall be paginated/cursor-loaded.

### PERF-007 — Background Work

Long-running non-interactive operations should be moved out of user-blocking request paths when appropriate.

### PERF-008 — Caching

Caching shall be introduced where measurement/use cases justify it rather than indiscriminately.

### PERF-009 — Scalability

Architecture shall allow growth beyond the initial VPS without fundamental domain redesign.

---

# 48. Accessibility Requirements

### A11Y-001 — Keyboard Accessibility

**CURRENT — MUST**

Important interactive UI shall remain keyboard accessible.

### A11Y-002 — Semantic UI

Storefront and dashboard shall use appropriate semantic elements.

### A11Y-003 — Focus Management

Dialogs, menus and dynamic interfaces shall handle focus appropriately.

### A11Y-004 — Contrast

Light and dark themes shall maintain readable contrast.

### A11Y-005 — Form Accessibility

Form controls shall have clear labels/errors.

### A11Y-006 — Image Alternative Text

Meaningful media shall support alternative text where appropriate.

---

# 49. CMS Future Requirements

### CMS-001 — Full CMS

**FUTURE**

The storefront shall eventually support comprehensive content management.

### CMS-002 — Structured Content

CMS architecture should support structured content rather than only unrestricted HTML blocks.

### CMS-003 — Commerce References

Content shall be capable of referencing products, categories and other commerce entities.

### CMS-004 — Theme Independence

Content should remain usable across compatible storefront themes.

### CMS-005 — Publishing Workflow

Future CMS may support drafts/publishing/scheduling.

---

# 50. Delivery/Courier Future Requirements

### DLV-001 — Delivery Module

**FUTURE**

The portal may receive a dedicated delivery-management domain.

### DLV-002 — Courier Integrations

External courier companies such as Pathao Courier and Steadfast may be integrated.

### DLV-003 — Courier Booking

Eligible orders may be automatically submitted to courier providers.

### DLV-004 — Tracking Synchronization

Courier status may synchronize with the platform.

### DLV-005 — Provider Independence

**FOUNDATION — MUST**

Current fulfillment architecture shall not permanently assume one courier provider.

### DLV-006 — Integration Failure Handling

**FUTURE — MUST**

Courier integration failure shall not corrupt the order lifecycle.

---

# 51. Customer Support Future Requirements

### SUPT-001 — Support Module

**FUTURE**

The platform may include customer-support functionality.

### SUPT-002 — Storefront Chat

Customer chat may be integrated.

### SUPT-003 — Customer Context

Support interactions should be capable of referencing:

- customer;
- order;
- delivery;
- relevant business context.

---

# 52. Marketing Future Requirements

### MKT-001 — Marketing Domain

**FUTURE**

The platform may provide dedicated marketing tools.

### MKT-002 — Campaign Cost Relationship

Marketing spending should eventually be attributable to campaigns/channels where possible.

### MKT-003 — Performance Connection

Marketing analytics may later relate expenditure to commerce outcomes.

---

# 53. Technology Direction Requirements

These are architectural constraints rather than final infrastructure selections.

### TEC-001 — Next.js

**CURRENT**

The web platform shall use Next.js.

### TEC-002 — React

React shall be the UI foundation.

### TEC-003 — TypeScript

**CURRENT — SHOULD**

Application code should use TypeScript extensively.

### TEC-004 — shadcn/ui

The business portal shall use shadcn/ui.

### TEC-005 — Relational Transactional Storage

The primary transactional architecture requires a database suitable for relational commerce/operations data.

PostgreSQL remains the leading candidate and will be finalized in technical architecture.

### TEC-006 — Object Storage Abstraction

Media shall not depend permanently on files being stored on the application server's local disk.

### TEC-007 — Modular Monolith

**CURRENT — MUST**

The initial backend architecture shall prefer a well-structured modular monolith.

### TEC-008 — No Premature Microservices

Domains shall not be deployed as independent network services solely for architectural appearance.

### TEC-009 — Background Jobs

The architecture shall support background processing where operationally appropriate.

### TEC-010 — Deployment Portability

The system should remain practical to deploy initially on a private VPS.

### TEC-011 — Scaling Path

The architecture shall allow later migration toward:

- multiple application instances;
- separate workers;
- external database infrastructure;
- object storage;
- CDN;
- caching;
- dedicated search infrastructure;
- queues;
- extracted services where genuinely justified.

---

# 54. Documentation Requirements

### DOC-001 — Internal Documentation

**CURRENT — MUST**

Important architectural/product decisions shall be documented.

### DOC-002 — Source of Truth

Repository documentation shall act as a shared reference for developers and AI agents.

### DOC-003 — Architecture Decisions

Important irreversible or expensive technical choices should receive architecture decision records.

### DOC-004 — Domain Documentation

Complex domains shall receive dedicated design documents.

### DOC-005 — API Documentation

Supported APIs shall be documented.

### DOC-006 — Business Rule Documentation

Important business rules shall not exist only as hidden application behavior.

### DOC-007 — Terminology

The project shall maintain consistent business terminology.

---

# 55. Testing Requirements

### TST-001 — Automated Testing

**CURRENT — MUST**

Critical domain logic shall receive automated tests.

### TST-002 — Financial Tests

Landed-cost and monetary calculations shall have strong deterministic tests.

### TST-003 — Inventory Tests

Inventory reservation/movement/concurrency behavior shall be tested.

### TST-004 — Permission Tests

Authorization shall have tests preventing privilege leakage.

### TST-005 — Order Lifecycle Tests

Valid and invalid order transitions shall be tested.

### TST-006 — Integration Tests

Critical integrations between domains shall have tests.

### TST-007 — End-to-End Storefront Tests

Core buying flows shall receive end-to-end coverage.

### TST-008 — Failure Scenario Tests

Tests shall include failure/retry cases, not only ideal success paths.

### TST-009 — Regression Tests

Fixed high-impact bugs should gain regression coverage where practical.

---

# 56. Critical Missing Requirements Discovered

The original vision was extensive, but several areas need to be explicitly included.

These are not criticism of the original brief; they are requirements that naturally appear once the domains are connected.

## 56.1 Returns

Even if not fully implemented in the earliest release, the order/inventory/payment architecture must not assume that every delivered item permanently stays sold.

We will need to model later:

```text
Return Request
→ Approved
→ Item Received
→ Inspection
→ Restock / Damage
→ Refund / Replacement
```

## 56.2 Refunds

Refunds must remain different from order cancellation.

Potential future cases include:

- full refund;
- partial refund;
- refund without full return;
- manual refund;
- payment-provider refund.

## 56.3 Damaged / Lost Inventory

Inventory must support stock that physically exists or existed but is not sellable.

## 56.4 Stocktake / Cycle Count

Large inventory operations eventually require physical count/reconciliation workflows.

## 56.5 Supplier Payments

Purchase value and amount paid to supplier are different concepts and should not be collapsed.

## 56.6 Estimated vs Actual Landed Cost

Imported products may need provisional costs before every freight/customs invoice is known.

## 56.7 Transaction Snapshots

Product names, prices and configurations can change after an order; historical orders must not mutate accordingly.

## 56.8 Data Import / Export

A serious catalog and inventory system needs high-volume data tooling.

## 56.9 Audit Trail

Granular access control is insufficient without knowing who changed sensitive data.

## 56.10 Idempotency

Checkout, payment operations, courier integrations and external webhooks must anticipate retries and duplicated requests.

---

# 57. Requirement Conflicts Resolved

Several original requirements could conflict unless explicitly interpreted.

## 57.1 “Feature Full” vs “Minimal UI”

Resolution:

The system shall be **functionally powerful but progressively disclosed**.

Minimal UX does not mean minimal capability.

---

## 57.2 “API First” vs Maximum Performance

Resolution:

The architecture shall have explicit application/API boundaries, but internal server code shall not be forced through unnecessary HTTP network calls.

---

## 57.3 “Maevelle Ecommerce” vs Reusable for Other Businesses

Resolution:

Maevelle branding belongs primarily to configuration/storefront presentation.

Core domains remain business-neutral.

---

## 57.4 “Unlimited Categories”

Resolution:

There shall be no business-defined fixed hierarchy depth.

The UI may still discourage unnecessarily deep structures for usability/performance reasons.

---

## 57.5 “Main Color + Identical Colors”

Resolution:

Model them as:

```text
Primary/display color

+

Associated/searchable colors
```

rather than pretending that a variant has multiple equal primary colors.

---

## 57.6 “Powerful Permissions, Not Roles”

Resolution:

Permissions/capabilities form the security foundation.

Convenient role-like presets may exist only as reusable collections of permissions.

---

## 57.7 “Multiple Currency”

Resolution:

Displaying multiple currency symbols is insufficient.

Transactions must retain actual currency identity and future conversion architecture must preserve historical monetary context.

---

## 57.8 “Stock Management”

Resolution:

Stock shall not be represented merely as an editable integer.

Inventory becomes a domain involving:

```text
Inventory Item
Location
On Hand
Reservation
Availability
Movement
Transfer
Receiving
Adjustment
```

---

# 58. Initial Domain Map

The requirements now produce the following first-level domain architecture:

```text
PLATFORM
│
├── Organization
├── Identity & Access
├── Audit
│
├── Catalog
│   ├── Categories
│   ├── Products
│   ├── Attributes
│   ├── Variants
│   ├── Colors
│   ├── Sizing
│   ├── Media
│   ├── Reviews
│   └── Search
│
├── Commerce
│   ├── Cart
│   ├── Checkout
│   ├── Pricing
│   ├── Promotions
│   ├── Orders
│   ├── Payments
│   └── Invoices
│
├── Inventory
│   ├── Inventory Items
│   ├── Inventory Levels
│   ├── Reservations
│   ├── Movements
│   ├── Locations
│   └── Transfers
│
├── Procurement
│   ├── Suppliers
│   ├── Purchases
│   ├── Purchase Payments
│   ├── Incoming Shipments
│   ├── Receiving
│   └── Landed Cost
│
├── Finance Operations
│   └── Expenses
│
├── Customers
│
├── Notifications
├── Analytics
├── Settings
├── Localization
├── API / Integration
└── Media Infrastructure
```

Future domains include:

```text
CMS
Themes
Customer Accounts
Courier / Delivery
Customer Support
Marketing
External Notification Channels
```

---

# 59. High-Risk Domains

The following areas require deeper design before database implementation.

## Risk Level: Very High

### 1. Inventory

Because it interacts with:

- checkout;
- cancellation;
- purchasing;
- receiving;
- warehouse transfers;
- returns;
- manual adjustment;
- concurrency.

### 2. Procurement + Incoming Shipment + Landed Cost

Because real importing scenarios involve:

- multiple suppliers;
- consolidated shipping;
- partial shipments;
- shared charges;
- estimated costs;
- actual costs;
- multi-currency;
- cost allocation.

### 3. Product / Variant / Attribute Model

A weak model here would affect almost every future product type.

### 4. Sizing

A fashion-only size table would contradict the business-agnostic requirement.

### 5. Order Lifecycle

Order, payment, fulfillment, return and refund states need clean separation.

### 6. Access Control

Granular permission architecture becomes difficult to retrofit once every endpoint assumes `isAdmin`.

---

# 60. Requirements That Must Influence Database Design Later

When we eventually design the data model, the following requirements must be reviewed directly:

```text
ORG-003
CAT-002
ATR-001
VAR-001
MED-001
SIZ-001
ORD-005
STK-002
STK-007
STK-019
WHS-005
PUR-008
ISH-002
ISH-004
LDC-006
LDC-014
CUS-001
IAM-004
AUD-001
LOC-007
DAT-003
```

Database design shall not begin without revisiting these.

---

# 61. Requirements That Must Influence API Design Later

```text
API-001
CHK-007
ORD-018
STK-018
IAM-008
AUD-001
WHK-001
WHK-005
DAT-002
```

---

# 62. Requirements That Must Influence UX Design Later

```text
SYS-006
SIZ-015
STO-008
MED-008
LDC-015
BUX-005
BUX-006
BUX-007
BUX-009
BUX-013
BUX-018
```

---

# 63. Current Scope vs Architectural Preparation

A crucial rule for this project:

## Build Now

Examples:

```text
Storefront
Guest Cart
Checkout
Products
Variants
Categories
Colors
Sizing
Media
Orders
Manual Orders
Basic Payments
Customers
Inventory
Multiple Warehouses
Procurement
Incoming Shipments
Landed Cost
Expenses
Permissions
Notifications
Analytics
Settings
SEO
```

## Prepare Now, Expose Later

Examples:

```text
Multi-organization possibility
Customer account relationship
Returns/refunds compatibility
Courier provider abstraction
Storefront theme abstraction
Webhook architecture
CMS compatibility
Richer media types
Multi-currency historical exchange context
```

## Implement Later

Examples:

```text
Customer Accounts
Cross-device Account Cart
Full CMS
Theme Marketplace/Switching
Courier Automation
Delivery Management
Customer Support
Social Notification Integrations
Advanced Marketing Features
```

---

# 64. Research-Informed Architecture Notes

The following established-system patterns strengthen several decisions already made for Maevelle:

1. Modern commerce platforms represent product variants independently enough to associate options, inventory and SKU information with them.

2. Reusable attributes are a proven way to avoid hard-coded product-type fields.

3. Inventory systems benefit from separating stock locations, quantities and reservations/allocations.

4. Central asset/file management with reusable references is already used by major commerce platforms, supporting Maevelle's WordPress-like media-library requirement.

5. Enterprise supply-chain systems treat landed cost as more than purchase price, incorporating freight and other direct acquisition charges into inventory costing.

6. Reliable external APIs use idempotency and retry-aware webhook behavior because requests/events may be repeated during network failures.

These systems are references for understanding mature patterns—not products that Maevelle must copy.

---

# 65. Requirements Baseline

This document establishes **Requirements Baseline v0.1**.

It is intentionally expected to evolve.

However, developers should not casually violate a requirement simply because a particular implementation is easier.

If implementation reveals that a requirement should change:

1. identify the affected requirement ID;
2. document the reason;
3. review downstream implications;
4. update the requirement;
5. update relevant architecture/domain documentation.

---

# 66. Next Documentation Step

The next document should be:

```text
docs/initial/scope.md
```

It will convert this large requirement universe into an implementation-oriented scope.

However, it **must not create a weak “tiny MVP.”**

Its purpose will be to determine:

- what must exist for Maevelle to operate the business properly;
- what capability can be introduced progressively;
- what only needs architectural preparation;
- dependency order;
- implementation phases;
- what cannot safely be deferred;
- what can be deferred without creating technical debt;
- what belongs to post-launch expansion.

After scope stabilization, the highest-risk domains should be designed separately before database modeling.

Recommended domain-design order:

```text
1. Catalog / Product Architecture
2. Variant + Attribute Architecture
3. Sizing & Measurement Architecture
4. Inventory Architecture
5. Warehouse Architecture
6. Procurement Architecture
7. Incoming Shipment Architecture
8. Landed Cost Allocation Architecture
9. Order Lifecycle Architecture
10. Payment Architecture
11. Customer Architecture
12. Media Architecture
13. Access Control Architecture
```

Only after these interconnected domains are sufficiently understood should the project move into serious relational database/schema design.

---

**End of Requirements Specification v0.1**
