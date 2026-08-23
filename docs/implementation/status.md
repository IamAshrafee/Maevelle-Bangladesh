# Maevelle implementation status

Current Phase: Commercial inbound operations foundation complete

Current Milestone: PROCUREMENT-SHIPMENT-RECEIVING-01 — COMPLETE

Completed: Foundation runtime and application shell, platform migrations, IAM/authentication, catalog/media/sizing, warehouse locations and capabilities, immutable inventory ledger, Geography, Customers, Variant Pricing, Promotions/Coupons, server-backed guest Cart, transactional Checkout, COD Orders, immutable Order snapshots, reservation-backed cancellation, Payment Methods, Payment Intents/Attempts, manual bKash/Nagad verification, payment allocations, refund foundation, partial Fulfillment, reservation consumption, physical Inventory deduction, picking/packing/dispatch, Delivery lifecycle, manual delivery operations, append-only Delivery event history, provider-ready courier boundary, Suppliers, Purchase Orders, Purchase Line shipment allocations, consolidated inbound Shipments, and canonical condition-aware Inbound Receipts

Capabilities: canonical Geography; Customer management; Variant Pricing; Promotions/Coupons; exact discount calculation; server-backed guest Cart; guest Checkout; COD payment-state separation; manual bKash/Nagad submission and verification; payment allocations/outstanding balance; partial manual refunds; secure guest payment status; Admin Payment operations; partial Fulfillment; atomic reservation consumption; physical Inventory deduction; picking/packing/dispatch; Delivery lifecycle; manual delivery operations; Delivery event history; provider-ready courier boundary; Supplier and Purchase management; allocation-safe inbound consolidation; arrival separated from stock; partial condition-aware receiving; immutable receipt-ledger postings

Current Batch: PROCUREMENT-SHIPMENT-RECEIVING-01 complete and verified through PostgreSQL integration tests and Docker/Caddy

Next: LANDED-COST-COSTING-01

Blockers: None

Known Risks: Media storage remains local-development only; warehouse transfer in-transit quantity is represented by dispatched-minus-received transfer lines until a dedicated transit-location/reporting requirement is introduced; manual Delivery operations deliberately do not automate courier booking, reconciliation, COD settlement, RTO receiving, or returns; purchase costs and shipment expenses are intentionally not allocated to inventory value until the dedicated Landed Cost/Costing milestone.
