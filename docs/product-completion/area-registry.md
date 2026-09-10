# Area Registry

Statuses are evidence states, not progress percentages. `CODE_SUBSTANTIAL`
means meaningful current implementation exists; it does not mean acceptance.

| Area | Current evidence status | Primary source evidence |
| --- | --- | --- |
| Admin Product Management Workspace | `ACTIVE_IMPLEMENTATION` | Current-head assessment recorded in `areas/admin-product-management-workspace`; `apps/admin/app/products`, `apps/admin/components/products`, Catalog API/database modules |
| Catalog and classification | `CODE_SUBSTANTIAL` | `catalog.*`, `catalog-classification.*`, public catalog routes |
| Media | `CODE_SUBSTANTIAL` | `media.*`, Admin Media, product-media forms |
| Sizing | `CODE_SUBSTANTIAL` | `sizing.*`, Admin sizing routes, PDP size guide |
| Pricing and promotions | `CODE_SUBSTANTIAL` | `pricing.*`, `promotions.*`, Admin pages |
| Warehouse and inventory | `CODE_SUBSTANTIAL` | `warehouse.*`, `inventory.*`, Admin inventory routes |
| Customers and geography | `CODE_SUBSTANTIAL` | `customers.*`, `geography.*`, Admin customer routes |
| Cart, checkout and orders | `CODE_SUBSTANTIAL` | `cart.*`, `orders.*`, Storefront and Admin order routes |
| Payments and refunds | `CODE_SUBSTANTIAL` | `payments.*`, payment/admin routes |
| Supply, receiving and costing | `CODE_SUBSTANTIAL` | procurement, inbound shipment, receiving, landed-cost and costing modules |
| Fulfillment and delivery | `CODE_SUBSTANTIAL` | fulfillment/delivery modules and Admin workspaces |
| Returns and RTO | `CODE_SUBSTANTIAL` | returns modules and Admin routes |
| Finance | `CODE_SUBSTANTIAL` | finance modules and Admin routes |
| Reviews | `CODE_SUBSTANTIAL` | reviews modules, Admin moderation, Storefront display/submission |
| Notifications and integrations | `CODE_SUBSTANTIAL` | notification/integration tables, routes and worker processing |
| Analytics, search and audit | `CODE_SUBSTANTIAL` | analytics/search/audit schemas, worker processors and Admin pages |
| IAM, settings and operations | `CODE_SUBSTANTIAL` | platform/IAM modules, Team/Settings/Integrity/Admin operations |
| Storefront experience | `ASSESSMENT_REQUIRED` | `apps/storefront` customer paths and public API projections |

No area is currently `VERIFIED_COMPLETE`.
