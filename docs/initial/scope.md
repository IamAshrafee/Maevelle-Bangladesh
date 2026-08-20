# Maevelle Ecommerce — Scope & Release Strategy

**Document:** `docs/initial/scope.md`
**Status:** Living Document
**Version:** 0.1
**Initial Business:** Maevelle Bangladesh
**Initial Release:** Production-Operational MVP / V1.0

---

# 1. Purpose

This document defines the implementation scope and release philosophy of Maevelle Ecommerce.

Its most important responsibility is preventing the word **MVP** from being interpreted as:

- a demo;
- a prototype;
- a few CRUD screens;
- an incomplete storefront;
- an admin panel that requires Excel/manual work for important business operations;
- a system that technically works but cannot actually operate a business.

Maevelle Ecommerce will start with an MVP, but it will be an **Operational MVP**.

The initial release must be capable of running real business operations.

---

# 2. Our Definition of MVP

For this project:

> **MVP means the smallest production system that can realistically operate the business across its essential workflows—not the smallest system that can demonstrate the idea.**

The V1 system does not need every future advanced feature.

However, every core domain included in V1 must be sufficiently complete for real usage.

We explicitly reject this interpretation:

```text
Basic Product CRUD
+
Simple Cart
+
Simple Order Table
=
MVP
```

That would be a demonstration system.

Our target is closer to:

```text
Production Storefront
+
Real Catalog
+
Variants
+
Advanced Sizing
+
Inventory
+
Warehouses
+
Procurement
+
Incoming Shipments
+
Landed Cost
+
Expenses
+
Orders
+
Payments
+
Customers
+
Permissions
+
Media
+
Operational Analytics
+
Security
+
Auditability
+
Backups
+
Real Error Handling
=
Maevelle V1
```

---

# 3. Product Maturity Ladder

To avoid ambiguity, functionality will be evaluated using five maturity levels.

## Level 0 — Missing

The feature does not exist.

---

## Level 1 — Demonstration

The feature proves an idea but is not sufficient for dependable business usage.

Example:

```text
Inventory:
product.stock = 15
```

No history, locations, reservations or adjustments.

This level is **not acceptable for V1 core domains**.

---

## Level 2 — Operational / Production

The feature can reliably support normal real-world business usage.

Example inventory capability:

```text
On Hand
Available
Reserved
Warehouse
Stock Movement
Manual Adjustment
Adjustment Reason
Transfer
History
Concurrency Protection
```

This is the **minimum target for V1 core domains**.

---

## Level 3 — Advanced

The feature adds stronger automation, optimization, configuration and high-volume capabilities.

Examples:

- automated replenishment;
- advanced forecasting;
- highly configurable workflows;
- advanced allocation;
- integrations;
- advanced bulk operations.

---

## Level 4 — Enterprise / Platform Scale

The feature supports large organizational complexity, major scale and ecosystem-level requirements.

Examples:

- multi-region infrastructure;
- extremely large catalogs;
- complex approval chains;
- advanced automation;
- enterprise integrations;
- multi-organization SaaS capabilities;
- dedicated data infrastructure.

---

# 4. V1 Quality Rule

Every feature does **not** need Level 4 maturity.

But:

> **Every V1 core domain should reach approximately Level 2 operational maturity.**

Some particularly important domains may intentionally contain selected Level 3 features from the beginning.

Those domains include:

- sizing;
- inventory;
- landed-cost allocation;
- product management;
- permissions;
- media management.

This is because those areas are particularly important to Maevelle and difficult to retrofit later.

---

# 5. Scope Decision Framework

Whenever a feature is proposed, classify it using the following test.

## Include in V1 when:

- normal business operation cannot work reliably without it;
- excluding it forces important workflows into Excel/manual external tracking;
- excluding it causes incorrect inventory/cost/order information;
- the business is highly likely to require it immediately;
- postponing it would force architectural redesign;
- it protects financial/data integrity;
- it protects security;
- it prevents significant operational confusion.

## Foundation Only when:

- the full capability is not needed today;
- but today's architecture could make future implementation unnecessarily difficult.

## Defer when:

- the feature primarily improves growth rather than core operation;
- a reasonable manual process exists temporarily;
- it does not compromise data integrity;
- postponing it does not require future redesign;
- the benefit becomes important only at higher scale.

---

# 6. V1 — Production Operational MVP

The first production release will be referred to as:

# Maevelle V1.0 — Production Core

It should be capable of running Maevelle's normal commerce and operational workflows without the system feeling like unfinished software.

---

# 7. V1 Core Business Workflows

Before deciding whether V1 is complete, the system must successfully support several end-to-end scenarios.

These scenarios are more important than counting individual features.

---

## FLOW-001 — Source Product → Receive Inventory

```text
Create / Select Supplier
        ↓
Create Purchase
        ↓
Add Purchased Products / Variants
        ↓
Record Purchase Cost
        ↓
Create Incoming Shipment
        ↓
Combine Products / Suppliers if necessary
        ↓
Record Shipment Expenses
        ↓
Allocate Shared Costs
        ↓
Calculate Estimated / Actual Landed Cost
        ↓
Receive Goods
        ↓
Inventory Movement Created
        ↓
Stock Available in Warehouse
```

This must be a real working workflow.

---

## FLOW-002 — Create Product → Publish Storefront

```text
Create Product
      ↓
Assign Category
      ↓
Configure Attributes
      ↓
Configure Colors
      ↓
Configure Sizes
      ↓
Create Variants
      ↓
Upload / Select Media
      ↓
Assign Variant Media
      ↓
Set Pricing
      ↓
Set Inventory Behavior
      ↓
SEO / Product Information
      ↓
Preview
      ↓
Publish
```

---

## FLOW-003 — Customer Purchase

```text
Browse / Search
      ↓
Product Details
      ↓
Select Color
      ↓
Gallery Changes
      ↓
Select Size
      ↓
Add to Cart / Buy Now
      ↓
Guest Checkout
      ↓
Delivery Information
      ↓
Coupon
      ↓
Payment Method
      ↓
Place Order
      ↓
Order Confirmation
```

---

## FLOW-004 — Order Processing

```text
New Order
   ↓
Review
   ↓
Confirm
   ↓
Inventory Reservation
   ↓
Processing
   ↓
Ready to Ship
   ↓
Manual Courier / Delivery Information
   ↓
Shipped
   ↓
Delivered
   ↓
Final Inventory / Payment State
```

---

## FLOW-005 — Cancelled Order

```text
Order
  ↓
Cancelled
  ↓
Reason Recorded
  ↓
Reservation Released
  ↓
Payment Handling if Required
  ↓
Timeline Updated
```

---

## FLOW-006 — Manual Order

Staff must be able to:

```text
Find/Create Customer
      ↓
Add Products
      ↓
Select Variants
      ↓
Configure Quantity
      ↓
Apply Price / Discount according to permission
      ↓
Add Delivery Details
      ↓
Choose Payment
      ↓
Create Order
```

Manual orders must behave consistently with storefront orders after creation.

---

## FLOW-007 — Warehouse Transfer

```text
Select Source Warehouse
        ↓
Select Destination
        ↓
Select Inventory
        ↓
Create Transfer
        ↓
Dispatch
        ↓
In Transit
        ↓
Receive
        ↓
Both Inventory Ledgers Updated
```

---

## FLOW-008 — Product Return

A minimal but real return capability should exist in V1.

```text
Delivered Order
      ↓
Select Returned Items
      ↓
Return Quantity
      ↓
Reason
      ↓
Receive / Confirm Return
      ↓
Disposition
 ┌────────────┴────────────┐
Restock                 Damaged
  ↓                        ↓
Inventory +            Non-sellable
```

Advanced return portals and automated exchanges can come later.

---

## FLOW-009 — Expense Recording

```text
Create Expense
      ↓
Category
      ↓
Amount
      ↓
Currency
      ↓
Date
      ↓
Attachment / Receipt
      ↓
Optional Relationship
      ↓
Shipment / Purchase / Marketing / General
```

---

## FLOW-010 — Business Oversight

An authorized manager should be able to answer questions such as:

```text
How many orders today?

How much did we sell?

What is currently pending?

What products are low on stock?

What inventory exists in each warehouse?

What products are incoming?

How much did a shipment actually cost us?

What is the landed cost of Product X?

How much have we spent this month?

What has Customer X ordered previously?

Who changed this inventory quantity?

Which staff member cancelled this order?
```

If basic operational questions like these cannot be answered, the V1 business portal is incomplete.

---

# 8. V1 Storefront Scope

V1 shall include a complete production storefront.

## Included

- homepage;
- category browsing;
- unlimited nested category support;
- category activation logic;
- product listing pages;
- breadcrumbs;
- product detail pages;
- variants;
- color switcher;
- variant-aware image galleries;
- associated searchable colors;
- sizes;
- structured size charts;
- product description;
- grouped specifications;
- FAQs;
- ratings/reviews;
- review images;
- product sharing;
- responsive mobile-first UX;
- search;
- filters;
- sorting;
- cart;
- Buy Now;
- guest checkout;
- coupons;
- COD;
- manual bKash;
- manual Nagad;
- order confirmation;
- SEO fundamentals;
- social metadata;
- sitemap;
- appropriate empty/error/loading states.

## Not required in V1

- customer login;
- customer account dashboard;
- account-synchronized cart;
- wishlist unless later deliberately promoted into V1;
- loyalty program;
- advanced recommendation engine;
- advanced personalization;
- full CMS;
- theme switching;
- storefront page builder.

---

# 9. V1 Catalog Scope

The catalog will be one of the strongest V1 modules.

## Included

- products;
- draft/published/unpublished states;
- archive strategy;
- categories;
- arbitrary category nesting;
- tags;
- event/occasion tags;
- reusable attributes;
- product-level attributes;
- variant-level attributes;
- product options;
- variants/SKUs;
- color definitions;
- associated searchable colors;
- pricing;
- structured descriptions;
- grouped specifications;
- FAQ entries;
- SEO metadata;
- product duplication;
- product search;
- filtering;
- useful bulk operations.

## Selected Advanced V1 Capabilities

Because future businesses may sell very different product types, we should make catalog architecture more capable than a typical early MVP.

This includes:

- reusable attributes;
- flexible option architecture;
- first-class variants;
- non-fashion-specific modeling.

---

# 10. V1 Sizing Scope

Sizing is a **priority domain**.

V1 shall not ship with only an HTML table field called “Size Chart.”

## Included

- reusable size systems;
- arbitrary size labels;
- size ordering;
- custom product sizes;
- measurement definitions;
- measurement units;
- reusable measurement schemas;
- structured size-chart builder;
- product-specific overrides;
- measurement instructions;
- optional size-chart image/diagram;
- size-to-variant connection;
- products without size;
- support for fashion, footwear and arbitrary size labels.

## Can Be Added Later

- automated size recommendation;
- customer body profile;
- AI size suggestion;
- country-aware automatic conversion;
- advanced fit analytics.

---

# 11. V1 Media Library Scope

The centralized media system is included in V1.

## Included

- upload;
- reusable media assets;
- asset browsing;
- search;
- metadata;
- alt text;
- uploader/date information;
- product association;
- variant association;
- usage tracking;
- unused asset indication;
- safe deletion;
- optimized storefront delivery;
- original asset preservation strategy.

## Later

- advanced DAM functionality;
- automatic AI tagging;
- advanced image editing;
- video transcoding pipeline;
- sophisticated transformations;
- external media providers.

---

# 12. V1 Inventory Scope

Inventory is a **critical V1 domain**.

## Included

- sellable inventory items;
- multiple warehouses;
- on-hand quantity;
- reserved quantity;
- available quantity;
- incoming quantity where appropriate;
- inventory movement ledger;
- purchase receiving;
- order reservation;
- order consumption;
- cancellation release;
- returns;
- damaged stock;
- manual adjustment;
- adjustment reason;
- inventory history;
- low-stock threshold;
- stock status;
- warehouse filtering;
- warehouse transfers;
- transfer lifecycle;
- concurrency protection;
- overselling policy.

## V1 Should Also Support

Simple stocktake/reconciliation capability or at minimum a safe structured inventory-count adjustment workflow.

## Later

- automatic replenishment;
- forecasting;
- reorder recommendations;
- cycle-count scheduling;
- barcode warehouse workflows;
- picking waves;
- bin/shelf-level warehouse management;
- advanced warehouse routing.

---

# 13. V1 Warehouse Scope

## Included

- multiple locations;
- warehouse identity;
- warehouse active/inactive;
- address;
- warehouse stock;
- aggregate inventory;
- transfers;
- receiving destination;
- inventory history per location.

## Later

- bins;
- aisles;
- zones;
- picking strategies;
- warehouse worker task management;
- sophisticated order-routing optimization.

---

# 14. V1 Supplier Scope

## Included

- supplier records;
- supplier contacts;
- address/country;
- notes;
- supplier history;
- supplier-product relationship where useful;
- multiple suppliers for products;
- purchase history.

## Later

- supplier portal;
- automated purchase requests;
- supplier scorecards;
- supplier performance analytics;
- automatic reorder suggestions.

---

# 15. V1 Procurement Scope

Procurement must be genuinely usable.

## Included

- purchases / purchase orders;
- supplier;
- supplier reference;
- purchase currency;
- purchased products;
- quantities;
- unit cost;
- ordered quantity;
- received quantity;
- partial receiving;
- purchase status;
- notes;
- attachments;
- supplier-payment records;
- purchase history.

## Later

- advanced approval workflows;
- automatic replenishment;
- request-for-quotation;
- vendor bidding;
- purchase planning;
- supplier portal.

---

# 16. V1 Incoming Shipment Scope

This is core to Maevelle because imported products may be consolidated.

## Included

- incoming shipment record;
- multiple purchases per shipment;
- multiple suppliers per shipment;
- partial purchase shipment;
- item quantities;
- shipment status;
- origin;
- destination;
- shipping/forwarding company;
- tracking/reference;
- expected arrival;
- actual arrival;
- attachments;
- receiving;
- goods-in-transit representation.

## Later

- live freight-provider integrations;
- automatic shipment tracking;
- customs system integrations;
- container-level logistics;
- complex international trade documentation.

---

# 17. V1 Landed Cost Scope

This is another **priority domain**.

The V1 landed-cost module should already be more advanced than a basic commerce admin.

## Included

- purchase cost;
- shipment-level costs;
- item-level costs;
- expense categories;
- estimated costs;
- actual costs;
- allocation by quantity;
- allocation by purchase value;
- allocation by weight;
- allocation by percentage;
- equal allocation;
- manual allocation;
- different strategy per charge;
- allocation preview;
- reconciliation validation;
- deterministic rounding;
- resulting landed unit cost;
- cost breakdown;
- relation to inventory receiving;
- change/audit history.

## Preferably Included

- volume-based allocation when necessary input information is available.

## Later

- sophisticated costing simulations;
- automatic freight invoice ingestion;
- advanced accounting integration;
- landed-cost forecasting;
- automated cost variance alerts.

---

# 18. V1 Expense Management Scope

## Included

- expenses;
- custom categories;
- date;
- amount;
- currency;
- description;
- payment method;
- attachments;
- procurement expense linkage;
- shipment expense linkage;
- order linkage where meaningful;
- marketing expense;
- general business expense;
- filtering;
- search;
- reports;
- editing history.

## Later

- budgets;
- approval chains;
- recurring expenses;
- automatic bank/feed import;
- accounting-software integrations;
- advanced cost-center accounting.

---

# 19. V1 Order Management Scope

Order management must function as an operating workspace, not simply a table.

## Included

- storefront orders;
- manual orders;
- order editing according to lifecycle rules;
- unique order numbers;
- order source;
- customer relationship;
- product snapshots;
- pricing snapshots;
- internal notes;
- customer notes;
- order timeline;
- order status;
- payment status;
- fulfillment status;
- search;
- filters;
- sorting;
- appropriate bulk actions;
- confirmation;
- cancellation;
- cancellation reasons;
- manual fulfillment;
- tracking information;
- delivered state;
- basic partial fulfillment architecture;
- basic return handling;
- basic refund recording;
- inventory integration.

## Later

- automated courier booking;
- split shipment UI optimized for high volume;
- advanced exchange management;
- automated return labels;
- advanced fraud scoring;
- complex order-routing automation.

---

# 20. V1 Payment Scope

## Included

- COD;
- manual bKash;
- manual Nagad;
- transaction/reference information;
- verification;
- payment statuses;
- multiple payment records where appropriate;
- payment timeline/history;
- refunds recorded correctly;
- authorization controls.

## Foundation

Payment provider abstraction must exist.

## Later

- SSLCommerz;
- automated bKash;
- automated Nagad;
- card payments;
- provider webhooks;
- advanced payment reconciliation.

---

# 21. V1 Customer Scope

## Included

- customer profiles;
- guest customer creation/matching;
- phone;
- email where available;
- address history;
- order history;
- customer statistics;
- internal notes;
- customer search;
- duplicate detection support;
- customer activity/history.

Customer authentication is intentionally separate.

## Later

- storefront registration;
- login;
- customer portal;
- saved addresses;
- synchronized cart;
- wishlist;
- loyalty;
- customer segmentation automation.

---

# 22. V1 Review Scope

## Included

- star rating;
- comment;
- image attachment;
- moderation;
- approve/reject/hide;
- rating aggregates;
- anti-spam controls.

## Foundation

Reviews should be capable of being associated with verified purchases later.

---

# 23. V1 Promotions Scope

## Included

- coupon codes;
- fixed discounts;
- percentage discounts;
- start/end time;
- activation;
- usage limits;
- basic eligibility;
- usage history;
- server-side validation.

## Later

- complex promotion engine;
- buy-X-get-Y;
- bundle discounts;
- customer-segment promotions;
- automatic campaigns;
- advanced stacking rules.

---

# 24. V1 User & Access Scope

This will be **permission-based**.

## Included

- multiple internal accounts;
- individual authentication;
- account activation/deactivation;
- granular permissions;
- permission presets;
- custom permission mapping;
- sensitive financial permission separation;
- server-side permission enforcement;
- privilege-escalation protections;
- audit history.

Example:

```text
Catalog Operator
    products.view
    products.create
    products.edit

Order Operator
    orders.view
    orders.confirm
    orders.edit

Inventory Manager
    inventory.view
    inventory.adjust
    inventory.transfer
```

But administrators should be able to customize these.

## Later

- approval chains;
- temporary access;
- fine-grained contextual access;
- warehouse-specific access;
- enterprise SSO;
- SCIM.

---

# 25. V1 Notifications Scope

## Included

- dashboard notification center;
- unread/read state;
- link to relevant entity;
- important new-order notifications;
- relevant inventory warnings;
- selected operational warnings.

## Later

- Telegram;
- WhatsApp;
- email notification engine;
- SMS;
- user-specific advanced preference matrix;
- notification escalation.

---

# 26. V1 Analytics Scope

V1 analytics must answer useful business questions.

## Included

### Sales

- order volume;
- sales/revenue;
- delivered sales;
- cancelled orders;
- date trends.

### Product

- top-performing products;
- quantity sold;
- sales contribution.

### Customer

- order counts;
- returning customers where identifiable;
- customer spend.

### Inventory

- stock levels;
- low stock;
- inventory movement;
- warehouse-level stock.

### Procurement

- purchasing values;
- incoming inventory.

### Expenses

- expense totals;
- expense categories;
- date trends;
- marketing expense.

### Profitability

Where sufficient reliable cost data is available:

```text
Sales
-
Discounts
-
Relevant Landed Product Cost
=
Useful Gross Margin View
```

Exact accounting terminology must be defined carefully later.

### Reporting Features

- date filtering;
- comparison periods;
- filtering;
- export.

## Later

- advanced BI;
- forecasting;
- cohort analysis;
- attribution;
- predictive analytics;
- custom report builder;
- dedicated analytics warehouse.

---

# 27. V1 Settings Scope

## Included

Organized settings for:

- business;
- storefront;
- orders;
- payments;
- inventory;
- warehouses;
- users/access;
- localization;
- currency;
- date;
- time;
- timezone;
- appearance;
- notifications where required.

---

# 28. V1 Localization Scope

V1 shall not hard-code Bangladesh assumptions into the platform.

## Included

- centralized timezone;
- configurable date format;
- configurable time format;
- currency identity;
- currency formatting;
- number formatting;
- safe monetary calculations;
- transaction currency storage;
- base/business currency concept.

Maevelle may initially operate primarily in BDT.

That does not mean the architecture may assume:

```text
currency = BDT forever
```

---

# 29. V1 Audit Scope

Auditability is mandatory for sensitive operations.

At minimum include:

- product publication changes;
- price changes where relevant;
- inventory adjustment;
- warehouse transfer;
- purchase changes;
- landed-cost changes;
- expense changes;
- order lifecycle changes;
- payment changes;
- permission changes;
- user-account security events where appropriate.

Audit records should capture:

```text
Actor
Action
Entity
Timestamp
Important Change Information
```

---

# 30. V1 API Scope

## Included

- clear API/application boundaries;
- consistent resource patterns;
- validation;
- structured errors;
- authentication;
- authorization;
- pagination;
- sorting;
- filtering;
- idempotency for critical operations;
- request/correlation IDs where useful;
- API documentation;
- abuse/rate controls where required.

## Foundation

The architecture should allow public/integration APIs later.

But internal implementation should not be artificially forced through network HTTP calls when a direct application-service call is more efficient.

---

# 31. V1 Import / Export Scope

For a real business, this should not be completely deferred.

## Include

At minimum:

- CSV/Excel-friendly export of important data;
- product export;
- inventory export;
- order export;
- customer export;
- relevant financial/export reporting.

## Strongly Preferred

Controlled product import.

The system should eventually support validation preview and row-level error reporting.

Advanced generic import infrastructure can mature after V1.

---

# 32. V1 Security Scope

Security is not a post-launch feature.

V1 requires:

- secure authentication;
- server-side authorization;
- safe session handling;
- strong password storage where passwords are used;
- input validation;
- output encoding;
- upload protection;
- CSRF protection where applicable;
- injection protection;
- rate limiting where needed;
- secret management;
- safe API errors;
- audit logs;
- permission isolation;
- production environment separation;
- backup security;
- dependency review;
- secure HTTP configuration;
- security headers where applicable.

V1 shall receive an explicit security review before launch.

---

# 33. V1 Reliability Scope

The system is not considered production-ready without:

- structured server logs;
- error monitoring;
- database migrations;
- automated backups;
- restore procedure;
- restore testing;
- application health checks;
- safe failure handling;
- transaction integrity;
- deterministic money calculations;
- concurrency handling for inventory/orders;
- retry-safe critical operations.

---

# 34. V1 Performance Scope

V1 performance requirements include:

- fast storefront first load;
- optimized images;
- minimal unnecessary client JavaScript;
- efficient Next.js rendering;
- appropriate server/client boundaries;
- paginated business lists;
- efficient database access;
- no uncontrolled N+1 patterns;
- suitable indexes;
- background processing where synchronous processing would damage UX;
- performance measurement before launch.

---

# 35. What V1 Deliberately Does NOT Include

The following capabilities are valuable, but they are not required for the initial Production Core.

## Customer Platform

- storefront account creation;
- account login;
- cross-device cart;
- wishlists;
- loyalty system.

## Content

- complete CMS;
- page builder;
- advanced blog platform.

## Themes

- theme marketplace;
- multiple switchable storefront themes.

The architecture will prepare for themes, but V1 may ship one excellent production storefront.

## Courier Automation

- direct Pathao API;
- direct Steadfast API;
- automatic courier booking;
- courier synchronization.

V1 will provide manual fulfillment/tracking workflows.

## Customer Support

- helpdesk;
- tickets;
- live chat management;
- omnichannel support.

## Marketing Automation

- automated campaigns;
- customer segmentation engine;
- email automation;
- abandoned-cart campaigns;
- attribution platform.

## Enterprise Infrastructure

- microservices;
- Kubernetes;
- multi-region active-active architecture;
- event streaming infrastructure purely for architectural appearance.

## SaaS Control Plane

- public business registration;
- subscription plans;
- billing tenants;
- tenant self-service;
- multi-tenant administration UI.

The architecture should not block these possibilities, but we do not need them to operate Maevelle.

---

# 36. V1 Launch Gates

Maevelle V1 shall not be considered complete merely because all sidebar menu pages exist.

The release must pass operational launch gates.

---

## Gate 1 — Catalog

A business user can independently create, configure and publish a realistic product containing:

- category;
- attributes;
- colors;
- associated colors;
- multiple variants;
- multiple sizes;
- size chart;
- multiple media assets;
- variant media;
- pricing;
- inventory;
- descriptions;
- specifications;
- FAQ;
- SEO.

---

## Gate 2 — Procurement

A user can:

```text
Purchase Products
→ Consolidate Shipment
→ Record Shared Charges
→ Allocate Costs
→ Receive Inventory
→ Verify Landed Cost
```

without requiring an external spreadsheet for essential calculation.

---

## Gate 3 — Inventory

Inventory correctly responds to:

- purchase receipt;
- sale;
- cancellation;
- return;
- damage;
- manual adjustment;
- warehouse transfer.

---

## Gate 4 — Checkout

A real customer can complete an order on a mobile device reliably.

---

## Gate 5 — Order Operations

Staff can process an order from creation to delivery/cancellation without modifying database records manually.

---

## Gate 6 — Financial Integrity

Money calculations reconcile appropriately.

Landed-cost allocations do not silently lose or create money through rounding errors.

---

## Gate 7 — Access Control

A restricted team account cannot perform unauthorized actions through either UI or API.

---

## Gate 8 — Audit

Important mutations can be traced back to an actor/action.

---

## Gate 9 — Failure Recovery

Critical workflows have tested behavior when operations fail midway.

---

## Gate 10 — Backup / Restore

A production backup exists and has a documented/tested restoration path.

---

## Gate 11 — Performance

Key storefront pages and operational pages meet agreed performance targets.

Exact measurable targets will be defined later.

---

## Gate 12 — Security

Critical attack surfaces have been reviewed and high-severity issues resolved.

---

# 37. Implementation Strategy

Development should follow dependencies rather than merely sidebar order.

A useful high-level sequence is:

---

# Phase 0 — Project Foundation

Before feature-heavy development:

- repository conventions;
- documentation structure;
- linting;
- formatting;
- TypeScript;
- test infrastructure;
- environment configuration;
- CI foundation;
- database/migration tooling;
- logging;
- error strategy;
- architectural boundaries;
- coding rules;
- ADR process.

---

# Phase 1 — Platform Foundation

Build shared capabilities:

- organization;
- internal identities;
- permissions;
- sessions;
- audit foundation;
- settings;
- localization;
- money primitives;
- media infrastructure.

These capabilities will be used everywhere later.

---

# Phase 2 — Catalog Foundation

Build:

- categories;
- attributes;
- products;
- options;
- variants;
- colors;
- media relationships;
- pricing;
- publication lifecycle.

---

# Phase 3 — Sizing

Design and implement the advanced sizing/measurement subsystem before product modeling becomes too fixed.

---

# Phase 4 — Inventory & Warehouses

Build:

- locations;
- inventory items;
- inventory levels;
- movements;
- reservations;
- adjustments;
- transfers.

---

# Phase 5 — Procurement & Landed Cost

Build:

- suppliers;
- purchases;
- purchase payments;
- shipments;
- receiving;
- shipment expenses;
- allocation engine;
- landed cost;
- inventory integration.

---

# Phase 6 — Commerce Operations

Build:

- customers;
- cart;
- checkout;
- coupons;
- orders;
- payments;
- order lifecycle;
- cancellations;
- returns;
- basic refunds;
- invoices.

---

# Phase 7 — Storefront

Build the complete production customer experience against stable catalog/commerce capabilities.

Some storefront work can happen earlier in parallel, but final storefront behavior should depend on stable domain contracts.

---

# Phase 8 — Business Operations UX

Complete high-quality portal experiences:

- dashboards;
- list pages;
- filters;
- saved operational views where included;
- bulk workflows;
- context links;
- notifications;
- analytics;
- reports.

---

# Phase 9 — Hardening

Before launch:

- security testing;
- permission testing;
- financial calculation testing;
- concurrency testing;
- load testing;
- failure testing;
- recovery testing;
- backups;
- restore test;
- browser/device testing;
- accessibility checks;
- performance optimization;
- real-data simulations.

---

# 38. Development Principle: Vertical Validation

Although domains have a dependency order, we should not build the entire backend for months and only discover later that the workflow feels wrong.

Important capabilities should periodically be validated end-to-end.

Example:

```text
Catalog Model
+
Inventory
+
Simple Product UI
+
Simple Storefront Display
```

can be tested together before adding every catalog feature.

Likewise:

```text
Purchase
+
Shipment
+
Landed Cost
+
Receiving
```

should be validated as a complete operational slice.

This provides early reality checks while maintaining good architecture.

---

# 39. Post-V1 Evolution Strategy

Completing V1 is **not the end of the project**.

The architecture and documentation should provide a deliberate path toward increasingly advanced releases.

The exact version numbers may later change, but the maturity sequence should remain approximately as follows.

---

# V1.0 — Production Core

Goal:

> Run Maevelle's business reliably.

Focus:

- operational completeness;
- correctness;
- UX;
- security;
- performance;
- traceability.

This is our MVP.

---

# V1.1 — Operational Hardening

Goal:

> Make daily work significantly faster and safer based on real usage.

Potential areas:

- UX improvements discovered after real operation;
- stronger bulk workflows;
- more saved views;
- advanced filters;
- faster product entry;
- faster order operation;
- stronger inventory counts;
- better expense workflows;
- improved analytics;
- more exports/imports;
- automation of repetitive admin tasks;
- advanced alerts;
- improved audit exploration;
- improved error recovery.

This version is heavily informed by actual staff behavior.

---

# V1.2 — Commerce Automation

Goal:

> Reduce repetitive manual operations.

Potential features:

- Pathao Courier integration;
- Steadfast integration;
- courier provider abstraction;
- automated courier booking;
- tracking synchronization;
- SSLCommerz;
- automated payment reconciliation;
- Telegram notifications;
- WhatsApp notifications;
- richer webhooks;
- external integrations.

---

# V1.5 — Customer & Growth Platform

Goal:

> Increase customer retention and marketing capability.

Potential features:

- customer accounts;
- login;
- cross-device carts;
- saved addresses;
- wishlists;
- account order history;
- verified reviews;
- customer segmentation;
- advanced coupons/promotions;
- abandoned-cart workflows;
- richer customer analytics;
- basic CRM capabilities;
- marketing integrations.

---

# V2.0 — Content & Storefront Platform

Goal:

> Separate commerce capability from presentation enough that storefront experiences become configurable.

Potential features:

- full CMS;
- structured content;
- landing-page management;
- theme abstraction;
- multiple storefront themes;
- theme activation/deactivation;
- configurable navigation;
- content scheduling;
- reusable content sections.

A business should eventually be able to switch compatible storefront presentation without rebuilding its products/orders/inventory.

---

# V2.x — Advanced Operations

Possible capabilities:

- advanced procurement planning;
- supplier scoring;
- purchase approvals;
- automated reorder recommendations;
- sophisticated return/exchange workflows;
- warehouse picking;
- barcode workflows;
- inventory cycle counting;
- stock forecasting;
- more advanced landed-cost analytics;
- budgeting;
- marketing attribution;
- advanced BI.

---

# V3.0 — Platform / Multi-Business Maturity

Only when actual requirements justify it.

Potential capabilities:

- full multi-organization control plane;
- business onboarding;
- tenant configuration;
- separate organizations;
- subscription/billing if commercial SaaS;
- advanced API access;
- application/integration ecosystem;
- deeper organization-level access;
- custom domains;
- organization isolation controls.

This is when the system may become a genuine commerce platform rather than simply software operated by Maevelle.

---

# 40. Infrastructure Scaling Path

Feature scale and infrastructure scale are separate concerns.

V1 does not require enterprise infrastructure.

---

## Infrastructure Stage 1

Potentially:

```text
Private VPS
│
├── Reverse Proxy
├── Next.js / Application
├── Worker
├── PostgreSQL
├── Redis if justified
└── External/Object Media Storage
```

Exact topology will be decided later.

---

## Infrastructure Stage 2

As usage grows:

```text
Application Instances
        ↓
Load Balancer

Dedicated PostgreSQL

Dedicated Worker Process

Redis / Queue

Object Storage

CDN
```

---

## Infrastructure Stage 3

As scale justifies it:

- database replicas;
- stronger backup architecture;
- dedicated search service;
- multiple workers;
- horizontal scaling;
- monitoring stack;
- centralized logs;
- dedicated cache;
- job infrastructure.

---

## Infrastructure Stage 4

Only if genuinely necessary:

- selected domain extraction;
- independent services;
- geographically distributed infrastructure;
- dedicated analytical data infrastructure;
- large-scale event infrastructure.

---

# 41. Microservice Rule

A domain shall not become a microservice simply because:

> “large companies use microservices.”

Extraction must solve a demonstrated problem.

Potential valid reasons include:

- independent scaling requirement;
- security/isolation requirement;
- distinct deployment lifecycle;
- major performance requirement;
- organizational team boundary;
- reliability isolation;
- technology requirement.

Until such pressure exists:

> **Modular monolith first.**

---

# 42. Scaling Rule

We should optimize for two things simultaneously:

```text
Simple enough to operate today

+

Structured enough to evolve tomorrow
```

This is preferable to either extreme:

```text
Tiny disposable MVP
```

or:

```text
Enterprise architecture for a business with zero users
```

---

# 43. Technical Debt Rule

Deferring a feature is acceptable.

Creating architecture we already know must be thrown away is not.

Examples:

### Acceptable

Do not implement customer accounts yet.

But maintain separation between:

```text
Customer
and
Authentication Account
```

### Not Acceptable

Store customer identity only inside the order table because accounts are not currently implemented.

---

### Acceptable

Do not integrate Pathao yet.

### Not Acceptable

Build fulfillment so tightly around manual Pathao fields that adding Steadfast later requires rewriting orders.

---

### Acceptable

Launch one storefront theme.

### Not Acceptable

Place essential commerce logic directly inside theme components.

---

# 44. Scope Change Rule

During development, new ideas will appear constantly.

They should not automatically enter V1.

Every new requirement should be classified:

```text
V1 Required
V1 Preferred
Foundation Only
Post-V1
Research Required
Rejected
```

The reason should be documented.

This protects both quality and delivery.

---

# 45. V1 Priority System

Requirements inside V1 can still have priorities.

## P0 — Business Critical

Without it, the system cannot safely operate.

Examples:

- order creation;
- inventory integrity;
- checkout;
- payment recording;
- procurement;
- landed costs;
- permissions;
- backup.

## P1 — Operationally Important

The system can technically operate without it, but daily work becomes meaningfully worse.

Examples:

- strong filtering;
- bulk operations;
- import/export;
- useful analytics;
- saved views.

## P2 — Experience Enhancement

Useful, but can be improved after stable operation.

This priority system shall **not** be used to demote necessary backend correctness into “future work.”

---

# 46. Definition of “Complete Enough”

V1 is complete when:

> Maevelle can trust the software with its products, stock, purchases, shipments, costs, customers and orders during real day-to-day operations.

Staff should not need to think:

> “The website has the order, but our real information is still in Excel.”

or:

> “The stock number isn't trustworthy, so check the warehouse manually.”

or:

> “Shipment cost is calculated somewhere else.”

or:

> “Only the developer can fix this order.”

or:

> “Everyone needs admin because permissions aren't finished.”

If those are normal operating conditions, V1 has not reached its intended maturity.

---

# 47. What Success Looks Like

A successful Maevelle V1 will feel like:

```text
A real product
not a university project.

A real operations system
not a CRUD admin.

A real storefront
not a frontend template.

A trusted inventory system
not a number field.

A real sourcing system
not an Excel replacement screen.

A real foundation
not disposable MVP code.
```

At the same time, it should **not** attempt to imitate every function of Shopify, ERP systems, warehouse-management platforms, accounting systems and CRMs in its first release.

Its strength will come from building the **right operational core deeply and coherently**.

---

# 48. Immediate Next Step

With:

```text
concept-clarification.md
requirements.md
scope.md
```

we now understand:

1. what the platform is;
2. what it needs to do;
3. what the first production release means;
4. what belongs later;
5. how the platform matures after V1.

The next stage should no longer remain broad project planning.

We should begin **deep domain design**.

Recommended next document:

```text
docs/domains/catalog/catalog-architecture.md
```

This should deeply design:

- Product
- Product Type
- Attribute
- Option
- Variant
- SKU
- Category
- Tag
- Occasion/Event
- Color
- Associated Color
- Pricing relationship
- Variant generation
- Product lifecycle
- Publication
- product information groups;
- product FAQ;
- SEO;
- variant-media relationships;
- inventory relationship;
- procurement relationship;
- edge cases;
- validation;
- UX implications.

After that:

```text
docs/domains/sizing/sizing-architecture.md
```

Then inventory, warehouses, procurement, incoming shipments and landed-cost architecture.

**Database schema design should remain downstream of these domain decisions.**

---

**End of Scope & Release Strategy v0.1**
