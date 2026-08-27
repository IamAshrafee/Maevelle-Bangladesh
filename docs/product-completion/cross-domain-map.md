# Cross-Domain Map

| Source | Relationship | Consumer/effect |
| --- | --- | --- |
| Catalog Product/Variant | Stable sellable identity | Pricing, inventory, procurement, orders, reviews, analytics |
| Catalog publication events | Outbox projection input | Storefront search and downstream consumers |
| Media association | Public-ready asset references | Product gallery and search cards |
| Sizing assignment | Published guide revision | Storefront selection help |
| Pricing | Current organization-currency price | Catalog readiness signal and Storefront purchase |
| Inventory | Available-to-sell by Variant/location | Catalog operational signal and checkout reservation |
| Category assignments | Navigation/classification | Storefront browse, breadcrumbs, search facets |
| Orders | Immutable Product/Variant snapshots | Reviews, returns, fulfillment, analytics |

Catalog Product Management is the active integration point. It may query these
domains for an operator read model but may not mutate their truth directly.
