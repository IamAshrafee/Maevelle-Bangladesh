# Area Registry

Historical phase completion is intentionally not copied into this registry.

| Area | State | Business role | Primary evidence |
| --- | --- | --- | --- |
| Catalog Product Management | `ACTIVE_IMPLEMENTATION` | Product identity, taxonomy, variants, structured content, publication | `catalog.*`, Catalog API, Admin Products, Storefront product reads |
| Media | `DISCOVERED` | Asset lifecycle, renditions, Product media | `media.*`, Admin Media, media worker/routes |
| Sizing | `DISCOVERED` | Size definitions, guides, Product assignment | `sizing.*`, Admin Sizing, public size guide |
| Inventory & Warehousing | `DISCOVERED` | Stock truth, movements, reservations, transfers, stocktakes | `warehouse.*`, `inventory.*`, Admin Inventory |
| Customers & Geography | `DISCOVERED` | Customer identity, address, serviceability | `customers.*`, geography services, Admin Customers |
| Pricing & Promotions | `DISCOVERED` | Selling price and discount truth | `pricing.*`, `promotions.*`, Admin Pricing/Promotions |
| Cart, Checkout & Orders | `DISCOVERED` | Guest commerce and order lifecycle | `cart.*`, `orders.*`, Storefront cart/checkout, Admin Orders |
| Payments | `DISCOVERED` | COD/manual payment, verification, refund allocation | `payments.*`, Admin Payments |
| Fulfillment & Delivery | `DISCOVERED` | Pick/pack/ship, courier, delivery/RTO | `fulfillment.*`, `delivery.*`, Admin operations |
| Procurement & Receiving | `DISCOVERED` | Suppliers, purchase orders, inbound receipt | `procurement.*`, receiving/inbound Admin routes |
| Landed Cost & Costing | `DISCOVERED` | Receipt allocation, FIFO COGS, correction | `landed_cost.*`, `costing.*`, Admin Costing |
| Returns & Reverse Logistics | `DISCOVERED` | Customer returns, RTO, stock/cost/refund effects | `returns.*`, Admin Returns/RTO |
| Finance | `DISCOVERED` | Accounts, movements, expenses, transfers, reconciliation | `finance.*`, Admin Finance |
| Reviews | `DISCOVERED` | Verified review capture, moderation, public summaries | `reviews.*`, Admin/Storefront Reviews |
| Notifications & Integrations | `DISCOVERED` | Templates, delivery attempts, providers, webhooks | `notifications.*`, Admin Integrations |
| Analytics | `DISCOVERED` | Rebuildable business reporting and drilldowns | `analytics.*`, Admin Analytics |
| IAM, Settings & Platform Operations | `DISCOVERED` | Organization, users, capabilities, config, audit, jobs, integrity | platform/IAM schemas, Team/Settings/Integrity |
| Storefront Experience | `DISCOVERED` | Customer discovery and purchase usability | `apps/storefront`, public API/read models |
| Admin Shell & Cross-Domain Operations | `DISCOVERED` | Navigation, attention, search, imports/exports | Admin shell, Operations, global search |
| Security, Reliability & Recovery | `DISCOVERED` | Isolation, abuse prevention, observability, backup/recovery | security package, hardening scripts, runbooks |
