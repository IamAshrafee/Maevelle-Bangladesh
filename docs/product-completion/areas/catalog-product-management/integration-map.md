# Catalog Product Management Integration Map

| Domain | Catalog workspace needs | Ownership rule |
| --- | --- | --- |
| Pricing | Current default-currency price per active Variant | Pricing commands own changes |
| Inventory | Available/reserved/on-hand by Variant/location | Inventory ledger owns quantities |
| Media | Public-ready gallery/thumbnail and Variant coverage | Media owns assets and processing |
| Sizing | Assigned published guide and revision | Sizing owns guide truth |
| Categories/Search | Active classification and projection freshness | Catalog owns assignment; search is rebuildable |
| Reviews | Rating/moderation summary | Reviews owns visibility and verification |
| Procurement | Supplier references and incoming context | Procurement owns sourcing history |
| Audit/Outbox | Product change history and projection events | Platform infrastructure preserves evidence |
