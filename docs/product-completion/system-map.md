# System Map

Maevelle is a fashion-commerce and operations platform: a customer Storefront,
an internal Admin, a Fastify API, PostgreSQL domain data, and a worker that
processes durable background work.

| Surface | Current responsibility |
| --- | --- |
| `apps/admin` | Operator workspaces: catalog, stock, supply, orders, fulfillment, finance, reporting, access and settings. |
| `apps/storefront` | Customer discovery, PDP, cart, checkout, tracking, reviews, policies and SEO. |
| `apps/api` | Authentication bridge, typed HTTP boundary, authorization context and domain-route registration. |
| `apps/worker` | Jobs/outbox, notifications/email/webhooks, analytics, imports, search and order projections. |
| `packages/contracts` | Shared transport DTOs. |
| `packages/database` | PostgreSQL migrations and domain command/query modules. |
| `packages/security`, `config`, `observability` | Crypto, validated runtime configuration and Pino logging. |

Major domains are identity/platform; catalog; media; sizing; pricing/promotions;
warehouse/inventory; customers/geography; cart/checkout/orders;
payments/refunds; procurement/receiving/landed cost/costing;
fulfillment/delivery; returns/RTO; finance; reviews; notifications/integrations;
analytics/search/audit.

Core flow: Catalog feeds Storefront discovery and joins with pricing, media,
sizing and inventory signals. Cart/checkout creates orders; orders reserve stock
and drive fulfillment/delivery/payment. Procurement through receiving supplies
inventory and costing. Business outbox events drive worker-owned projections and
deliveries.
