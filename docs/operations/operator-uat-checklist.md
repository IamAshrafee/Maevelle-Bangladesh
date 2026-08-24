# Maevelle operator UAT checklist

Status: **AWAITING_HUMAN_UAT**. Codex and automated tests must not sign this document.

Environment: ______  Operator: ______  Date: ______  Evidence folder/ticket: ______

| Operator task | Expected result | Pass/Fail | Evidence | Notes |
| --- | --- | --- | --- | --- |
| Create, configure, and publish Product | Public PDP shows exact configured Variant, Price, Media, Size Guide, and availability |  |  |  |
| Receive or adjust Inventory | Ledger, On Hand, Reserved, and ATS remain reconciled |  |  |  |
| Place COD Order | One Order and Reservation; no fabricated Payment |  |  |  |
| Submit and verify manual bKash | Evidence is private; one authoritative Payment after verification |  |  |  |
| Pack and dispatch Fulfillment | Inventory and FIFO assignment commit once |  |  |  |
| Complete Delivery | Delivery event and COGS recognition commit once |  |  |  |
| Create Purchase, Shipment, Receipt, and Landed Cost | Receipt, Cost Layer, and valuation reconcile |  |  |  |
| Process Customer Return and Refund | Return receipt, inspection, Inventory, COGS recovery, and Refund remain independently correct |  |  |  |
| Process failed Delivery/RTO | Stock restores only through reverse receipt |  |  |  |
| Record Expense and Finance transfer | Immutable ledger entries reconcile |  |  |  |
| Moderate Review and Merchant Response | Only approved public-safe content affects rating |  |  |  |
| Inspect Notifications and Integrations | Attempts, retries, unknown outcomes, and reconciliation are visible |  |  |  |
| Review Analytics and drill-down | Dashboard totals trace to canonical facts and currencies stay separate |  |  |  |
| Review Team/access controls | Owner protection, capability denial, and tenant boundaries work |  |  |  |

Sign-off requires every critical task to pass or an explicitly approved launch-blocking disposition. Production launch also requires separate written authorization.
