Maevelle Ecommerce — Concept Clarification

Status: Initial / Living Document
Version: 0.1
Project type: E-commerce Platform + Business Operations Platform
Initial business: Maevelle Bangladesh

1. What is Maevelle Ecommerce?

Maevelle Ecommerce is not only an online store.

It is a combined commerce and business operations platform consisting of two primary experiences:

Customer Storefront — the public-facing e-commerce experience through which customers discover products, search and filter the catalog, view products and variants, build carts, apply promotions and place orders.

Business Portal — the internal operating system through which a business manages its catalog, inventory, warehouses, orders, customers, procurement, sourcing, incoming shipments, landed costs, expenses, media, users/access, notifications, analytics, configuration and other operational activities.

Maevelle Bangladesh will be the first business using the platform.

However, the software architecture must not assume Maevelle, Bangladesh, fashion, dresses, or even a specific product type as permanent constraints.

The long-term intention is for the platform to be reusable by different commerce businesses.

2. Fundamental Product Principle

The system must follow this principle:

Powerful underneath, simple on the surface.

“Minimal UI” must never mean reducing functionality.

Instead, complexity should be controlled through good information architecture, contextual actions, progressive disclosure, intelligent defaults, reusable configurations, bulk operations, search, filtering, saved views and strong relationships between modules.

A normal employee should be able to perform common operations without needing to understand the complexity of the underlying architecture.

At the same time, advanced users should be able to access the deeper capabilities when necessary.

3. The Platform Is Business-Agnostic

Although the current working name is Maevelle Ecommerce, the actual commerce engine should not be tightly coupled to Maevelle.

For example, code should not contain assumptions such as:

dress_size
dress_color
maevelle_warehouse
bangladesh_currency_only

Instead, concepts should be generic:

product
variant
attribute
option
inventory_location
currency
measurement

This will allow the same platform to support fashion, shoes, cosmetics, jewelry, accessories, electronics, home products or another product category later.

The storefront itself can still be completely branded as Maevelle.

4. Platform Shape

Conceptually, the platform consists of several connected domains.

                         MAEVELLE COMMERCE PLATFORM

┌─────────────────────────────────────────────────────────────┐
│ CUSTOMER STOREFRONT │
│ │
│ Discovery → Product → Cart → Checkout → Order → Tracking │
└─────────────────────────────┬───────────────────────────────┘
│
API Layer
│
┌─────────────────────────────┴───────────────────────────────┐
│ COMMERCE / BUSINESS CORE │
│ │
│ Catalog Inventory Orders Customers │
│ Pricing Warehouses Payments Promotions │
│ Procurement Shipments Landed Cost Expenses │
│ Media Search Notifications Analytics │
│ Identity Permissions Audit Settings │
└─────────────────────────────┬───────────────────────────────┘
│
API Layer
│
┌─────────────────────────────┴───────────────────────────────┐
│ BUSINESS PORTAL │
│ │
│ Dashboard → Operations → Management → Reporting → Config │
└─────────────────────────────────────────────────────────────┘

The storefront and dashboard should consume the same underlying business capabilities instead of implementing separate versions of business logic.

5. API-First Does Not Mean API-Only

The platform should be designed around explicit application/service boundaries.

Core operations should be accessible through controlled APIs so that the same capabilities can eventually power the website, administrative portal, mobile applications, courier integrations, automation, third-party integrations and external developer APIs.

However, “API-first” should not force every internal server-side operation through unnecessary network requests.

We should distinguish between:

application interfaces, internal services, public/internal APIs, and integration APIs.

That distinction will matter later for both performance and maintainability.

6. Catalog Should Be a Core Platform Domain

The catalog must eventually represent significantly more than a product title and price.

Conceptually:

Product
│
├── Classification
│ ├── Categories
│ ├── Collections
│ ├── Tags
│ └── Event / Occasion Tags
│
├── Product Information
│ ├── Title
│ ├── Description
│ ├── Information Groups
│ ├── Key / Value Specifications
│ └── FAQs
│
├── Options / Attributes
│ ├── Color
│ ├── Size
│ └── Other future attributes
│
├── Variants / SKUs
│
├── Media
│
├── Pricing
│
├── Inventory
│
├── SEO
│
├── Search Metadata
│
└── Publication State

This is why your question about having an attribute/catalog system is important.

Decision: Keep the attribute/catalog architecture.

We should not skip requirement #46.

Without it, making the system business-agnostic would become extremely difficult.

7. Category Architecture

Categories should support unlimited hierarchical nesting.

For example:

Women
└── Clothing
└── Traditional
└── Saree
└── Wedding Saree

A category can independently be active or inactive.

However, effective storefront visibility should follow its ancestry.

For example:

Women ACTIVE
└── Clothing INACTIVE
└── Saree ACTIVE

Saree is technically active but effectively unavailable because its parent is inactive.

This appears to match what you described as:

Active in active.

We should therefore eventually distinguish between something like:

status = ACTIVE
effective_status = INACTIVE
reason = PARENT_INACTIVE

rather than silently changing child records.

That provides much better management UX.

8. Product Variants

Color and size should not simply be fields attached to a product.

A product may conceptually have:

Product
└── Variants
├── Red / Small
├── Red / Medium
├── Red / Large
├── Blue / Small
├── Blue / Medium
└── Blue / Large

Each sellable variant may eventually have its own SKU, barcode, price adjustments, inventory, dimensions, weight, media, procurement cost and status.

This gives us the flexibility required for proper inventory and purchasing later.

9. Color Architecture

Your color requirement is more sophisticated than normal variant selection and should be preserved.

A variant can have a primary color:

Primary Color:
Red

and searchable/associated colors:

Associated Colors:
White
Black
Gold

The storefront visually identifies the variant primarily as Red, while the search system can still understand that the item contains substantial white, black or gold.

Therefore:

Visual Identity ≠ Search Color Metadata

These should be modeled separately.

10. Variant-Aware Media

Product media should understand its relationship with variants.

For example:

Red Variant
├── red-front.jpg
├── red-back.jpg
└── red-model.jpg

Blue Variant
├── blue-front.jpg
├── blue-back.jpg
└── blue-model.jpg

Selecting Blue on the storefront should replace the visible gallery with the media associated with the Blue variant.

But the architecture should support fallback media too.

For example:

Variant media available
↓ yes
Show variant gallery

        ↓ no

Show generic product gallery 11. Size Is Its Own Subsystem

The size system should not be designed merely as:

size = S / M / L

Your requirement deserves a dedicated Sizing & Measurement subsystem.

It should eventually support concepts such as reusable size systems, product-specific sizes, category-specific measurements, measurement units, regional sizing, custom labels, numerical sizing, shoe sizes, one-size products, dimensions, measurement instructions, size chart templates and overrides.

Examples:

Fashion:
XS / S / M / L / XL

Shoes:
EU 41
UK 7
US 8

Ring:
6 / 7 / 8

Children:
2Y / 3Y / 4Y

Custom:
Free Size

Measurement-based:
Chest: 40"
Length: 28"
Sleeve: 24"

The Size Chart Builder should consequently be treated as a first-class feature rather than a rich-text table attached to a product.

We will design this domain separately and research established commerce/PIM approaches before finalizing it.

12. Inventory Must Not Be a Stock Number

A naïve implementation would store:

product.stock = 58

We should not build the platform around that model.

Inventory should eventually answer questions such as:

How many physically exist?
How many are available to sell?
How many are reserved for orders?
How many are damaged?
How many are incoming?
Where are they?
Why did the quantity change?
Who changed it?
What transaction caused the change?

Conceptually:

Inventory
│
├── On Hand
├── Available
├── Reserved
├── Incoming
├── Damaged
└── Other controlled states

And inventory changes should have traceable movements.

Purchase Receiving +20
Customer Order -2
Order Cancellation +2
Damage Adjustment -1
Warehouse Transfer -5 / +5
Manual Correction +1

This will become one of the foundations of the business platform.

13. Multiple Warehouses / Locations

Inventory cannot belong only to the business globally.

It belongs to locations.

Conceptually:

Business
│
├── Main Warehouse
├── Shop / Showroom
├── Secondary Warehouse
└── Future Location

A variant could therefore have:

Red / M

Main Warehouse 20
Showroom 3
Secondary 8

---

Total 31

Later, inventory transfers between these locations should be properly tracked.

14. Procurement Is Separate From Inventory

Purchasing products does not immediately mean the inventory is available.

There is an important lifecycle:

Supplier
↓
Purchase / Purchase Order
↓
Supplier Processing
↓
Shipment
↓
Transportation
↓
Customs / Tax / Charges
↓
Business Receives Goods
↓
Receiving / Inspection
↓
Inventory

Keeping procurement and inventory separate will make the system much stronger.

15. Shipment and Landed-Cost Management

This is one of the core differentiators of your project.

A shipment may contain products from multiple purchases and potentially multiple suppliers.

For example:

Supplier A → Product A ┐
Supplier B → Product B ├── Consolidated China Shipment
Supplier C → Product C ┘

That shipment may then generate shared expenses:

International Shipping
Freight Forwarder Fee
Customs
VAT
Handling
Local Transport
Insurance
Other Charges

Those costs must ultimately contribute to the real landed cost of the received products.

And different charges may require different allocation methods.

Equal
By Quantity
By Product Value
By Weight
By Volume
By Percentage
Manual Allocation

Later we should also consider combinations.

For example:

Customs → by item value
Freight → by weight
Local delivery → equal
Special charge → manually assigned

This means Cost Allocation Engine should become an explicit platform capability.

16. Expense Management Is Larger Than Shipment Expenses

Procurement expenses and general business expenses are related financially, but operationally they are different.

The expense system should eventually handle both direct and indirect costs.

Examples include procurement charges, shipment expenses, warehouse expenses, packaging, Facebook advertising, Google advertising, salaries, utilities, software subscriptions, office expenses, transport, refunds and miscellaneous operational costs.

Some expenses may be linked to another entity:

Expense → Shipment
Expense → Purchase
Expense → Order
Expense → Marketing Campaign

while others are general business expenses.

That linkage will eventually make analytics much more powerful.

17. Order Management

Order management must model a lifecycle rather than merely storing a status string.

Conceptually:

Order Created
↓
Pending Review
↓
Confirmed
↓
Processing
↓
Ready to Ship
↓
Shipped
↓
Delivered

But real systems also need alternative flows:

Cancelled
Rejected
Failed
Returned
Partially Returned
Delivery Failed
On Hold

Payment state should eventually remain separate from fulfillment/order state.

For example:

Order Status: Confirmed
Payment Status: Unpaid
Fulfillment Status: Unfulfilled

This prevents one giant status field from becoming impossible to maintain.

18. Guest-First Checkout

The initial storefront should optimize heavily for Bangladesh's low-friction purchasing behavior.

A customer should not be forced to create an account.

The target should be:

Product
↓
Buy Now / Cart
↓
Customer + Delivery Information
↓
Payment Method
↓
Review
↓
Place Order

Customer accounts can later be introduced without removing guest checkout.

If an existing customer can be reliably identified, their history can still be associated internally even when the checkout itself is guest-based.

19. Customers Are Business Records

Customers should exist independently of whether they have storefront accounts.

This distinction is critical.

Customer
≠
Customer Login Account

A customer can order as a guest ten times and still have a rich internal customer profile.

Later, an optional account can become associated with that customer record.

This allows customer analytics and history from day one without forcing account creation.

20. Media Library Is a Platform Capability

Your WordPress-like media requirement should be implemented as a centralized Asset / Media Library.

An uploaded image should become a managed asset rather than disappearing inside whichever product form uploaded it.

The platform should eventually understand:

Asset
├── File information
├── Dimensions
├── File size
├── MIME type
├── Alt text
├── Metadata
├── Upload source
├── Uploaded by
├── Uploaded date
├── Usage references
└── Possibly transformations/variants

More importantly:

Where is this image used?

should be answerable.

Deleting an asset being used by seven products should therefore not behave the same as deleting an unused image.

21. Access Control

We will not design this primarily as:

Admin
Manager
Employee

Instead, the foundation should be capabilities/permissions.

For example:

products.view
products.create
products.edit
products.publish

orders.view
orders.edit
orders.cancel

inventory.view
inventory.adjust
inventory.transfer

expenses.view
expenses.create
expenses.approve

users.manage_access

Later we can introduce convenient permission presets.

For example:

Order Operator
Inventory Operator
Finance Manager
Catalog Manager

But those presets will merely represent collections of permissions.

The administrator should ultimately be able to customize access far beyond fixed roles.

22. Auditability Is a Cross-Cutting Requirement

A serious business system should be able to explain important mutations.

For sensitive operations, we should eventually answer:

Who did it?
What changed?
When?
From what?
To what?
Why?
From which operation?

Examples include inventory adjustments, cost changes, order status changes, payment changes, permission changes, refunds, expense edits and publication changes.

Therefore Audit Log / Change History becomes a first-class cross-cutting capability.

23. Globalization / Localization

The underlying platform should not assume:

BDT only
Bangladesh timezone only
DD/MM/YYYY only
12-hour time only

It should support centralized business configuration for currency, timezone, date formatting, time formatting, locale and number formatting.

Money should also be handled with financial correctness rather than normal floating-point arithmetic.

24. Storefront Search

Search will eventually need to understand more than product titles.

Searchable information can include:

Title
Description
SKU
Category
Tags
Event / Occasion
Attributes
Primary Color
Associated Colors
Possibly synonyms

Filtering/faceting should remain conceptually separate from free-text search.

We should design the catalog so that a stronger search engine can be introduced later without rewriting the product model.

25. Themes and CMS

The future storefront-theme system gives us another important architecture constraint.

Storefront presentation should not own the business data.

Conceptually:

Commerce Data
↓
Storefront API / Application Layer
↓
Theme

instead of:

Theme contains commerce logic

The same applies to the future CMS.

Content and commerce should integrate strongly while remaining distinguishable domains.

That will eventually allow:

Theme A ←┐
Theme B ←┼── same commerce system
Theme C ←┘ 26. Architectural Direction

At this point my recommended architectural philosophy is:

Modular Monolith +
Strong domain boundaries +
API-first interfaces +
PostgreSQL +
Background jobs where appropriate +
Object storage for assets +
Caching only where justified +
Events/webhooks where appropriate

Not:

30 microservices on day one

This gives us a realistic path from:

Single Private VPS

to later infrastructure containing separated workers, replicas, external object storage, CDN, dedicated search, queues, horizontally scaled application servers and potentially extracted services where scale genuinely demands them.

PostgreSQL is suitable for complex transactional workloads and remains a strong candidate for the primary relational datastore, but we will finalize infrastructure choices later rather than allowing technology choices to dictate our domain model.

27. Current Major Domains

This gives us our first real domain map:

Maevelle Platform
│
├── Organization / Business
├── Identity & Access
├── Catalog
├── Products
├── Attributes & Options
├── Sizing & Measurements
├── Pricing
├── Media / Assets
├── Inventory
├── Warehouses / Locations
├── Procurement
├── Suppliers
├── Incoming Shipments
├── Landed Cost
├── Expenses
├── Orders
├── Payments
├── Fulfillment
├── Customers
├── Promotions / Coupons
├── Reviews
├── Search
├── Notifications
├── Analytics & Reporting
├── Audit
├── Localization / Money / Time
├── Settings
└── Integrations

Future domains would add CMS, storefront themes, delivery management, courier integrations, customer accounts, customer support, social notification integrations and broader marketing capabilities.

This is already a much better description of the actual system than “an ecommerce website.”

28. Important Non-Goals Right Now

We should not attempt to solve everything simultaneously.

But equally, we should not create temporary architecture that makes known future requirements impossible.

For example, we do not need customer accounts now.

But customer and cart architecture should not deliberately prevent customer accounts.

We do not need multi-tenant SaaS management now.

But the database should not casually assume that the entire universe contains exactly one business.

We do not need courier automation now.

But fulfillment should not be tied directly to manually typing a Pathao tracking number.

This distinction will become one of our project rules:

Future-ready does not mean future-built.

29. Documentation Strategy

I recommend that the project documentation become the internal source of truth for both developers and AI agents.

We should eventually grow toward something approximately like:

docs/
├── initial/
│ ├── concept-clarification.md
│ ├── requirements.md
│ ├── scope.md
│ └── terminology.md
│
├── product/
│ ├── storefront/
│ └── business-portal/
│
├── domains/
│ ├── catalog/
│ ├── sizing/
│ ├── inventory/
│ ├── procurement/
│ ├── landed-cost/
│ ├── expenses/
│ ├── orders/
│ ├── customers/
│ ├── media/
│ └── access-control/
│
├── architecture/
├── api/
├── database/
├── security/
├── ux/
├── testing/
├── operations/
├── decisions/
└── roadmap/

We should not create all those documents immediately. The structure can grow as we reach each subject.

30. Project Rules Established Today

These are the first foundational decisions I would consider accepted unless we later discover a strong reason to change them:

Maevelle is the first business, not the architectural boundary.

The platform is commerce + business operations, not merely an e-commerce website.

The system should begin as a modular monolith rather than premature microservices.

Catalog/attribute architecture stays.

Variants are first-class sellable entities.

Sizing becomes a dedicated domain/subsystem.

Inventory is ledger/movement-oriented rather than only a stock number.

Multi-location inventory is part of the foundation.

Procurement, shipments and inventory are separate but interconnected domains.

Landed-cost allocation is a first-class capability.

Customers and customer login accounts are different concepts.

Permissions are capability-based; roles/presets may sit on top later.

Media is centrally managed and usage-aware.

Auditability is designed into sensitive business operations.

Storefront presentation is separated from commerce logic so future themes remain practical.

Known future requirements influence today's boundaries without forcing us to implement those future features today.

That gives us our first real foundation.
