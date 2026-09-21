# Payments & Finance Context

## Product boundary

Payments owns customer collection facts, manual verification, COD collection,
allocations, and refunds. Finance owns merchant financial accounts, immutable
account entries, expenses, transfers, adjustments, and balance comparison.
Orders, Delivery, Returns, Procurement, and Costing retain their operational
authority and link to those financial facts.

## Good foundations to preserve

- Confirmed Payments and completed Refunds are immutable, separately traceable
  facts with allocation, idempotency, audit, and outbox behavior.
- Order payment state is derived from Payment allocations and Refunds rather
  than independently edited on Orders.
- Delivered COD remains a collection obligation until actual collection is
  recorded; delivery does not invent money.
- Financial account balances are derived from immutable entries. Transfers are
  one zero-sum transaction, not fake income and expense.
- Supply-linked expenses use explicit source links, allowing Finance to record
  money while Procurement and Landed Cost retain workflow ownership.

## MVP shortcuts found

- Important collections are capped or unbounded arrays rather than paginated,
  server-filtered contracts.
- The Finance home previously aggregated capped client lists with JavaScript
  numbers, so totals could be incomplete and were not authoritative.
- Payment and Finance workspace state is concentrated in large client
  components; filtering is mainly client-side.
- Financial Activity and account detail still consume unbounded entries and
  calculate lifetime totals in the browser.
- Expense receipt attachments and deeper category maintenance remain optional
  follow-on capabilities after the core daily workflow.

## Missing product capabilities

- Paginated, filterable Financial Activity and authoritative account summaries.
- Complete Refund detail and richer actor labels in audit history.
- Explicit account lifecycle management.
- First-class courier remittance/settlement from COD receivable to merchant
  account; current support records collection but not provider settlement.
- Complete supplier payable visibility across purchase and supplier contexts.
- Consistent date-range controls and server-side reporting read models.
