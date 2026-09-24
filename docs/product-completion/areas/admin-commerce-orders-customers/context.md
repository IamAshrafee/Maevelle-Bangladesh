# Commerce Orders & Customers Context

Orders and Customers are central Commerce records, not isolated CRUD entities.
Orders own the commercial agreement and immutable purchase snapshots; Catalog,
Inventory, Payments, Fulfillment, Delivery, Returns, Notifications, Reviews,
Analytics, and Search remain authoritative for their respective facts.

Maevelle must treat guest and social-commerce customers as first-class. Phone
identity is Bangladesh-heavy, but a shared phone or email is evidence rather
than unconditional proof that two people are the same. Historical orders must
remain operationally and financially valid if live catalog or customer data
changes.
