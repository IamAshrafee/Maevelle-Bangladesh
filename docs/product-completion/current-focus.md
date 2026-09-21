# Current Focus

## Active Area

Admin Payments & Finance

## Why Now

Payments & Finance is the selected module-completion area. Core Payment,
Refund, account-ledger, supplier-payable, manual reconciliation, and courier COD
settlement workflows are now materially stronger; compact reporting and the
everyday Expense workflow now have authoritative read models, complete detail
context, and safe money/lifecycle actions. Financial Activity and account
detail are the next material scaling gap.

## Current Status / Substage

`FOUNDATION / IN_PROGRESS`

## Evidence Already Known

Confirmed payments, refunds, COD collection, order allocation, financial account
entries, transfers, expenses, audit, outbox, and idempotency foundations exist.
The Finance home now consumes an authoritative server-side monthly read model,
confirmed Payments have a traceable detail route, and Payment/Refund worklists
use paginated server filters instead of capped client aggregation. Manual
reconciliation supports audited resolution/reopen, and supplier invoices are
validated and traceable to their placed Purchase. Courier-held COD is now
tracked independently from Delivery and customer collection through partial or
batch remittance allocations, deductions, account receipt, and immutable
settlement history.

## Immediate Objective

Replace unbounded Financial Activity and client-side account aggregation with
paginated server filters and authoritative account summaries. Complete account
lifecycle controls, then perform authenticated responsive review of Payments
and Finance.

## Last Completed Action

Completed a production-grade daily Expense workflow: scalable cross-module
filters, optional immediate account payment, payee/reference/notes context,
responsive detail and payment history, versioned correction/credit rules,
unpaid cancellation, retry safety, audit, and outbox evidence. Thirty-one
focused Payments/Finance/Procurement tests, fresh development/test migrations,
targeted TypeScript/lint, and API/Admin production builds pass.

## Important Constraints

Preserve Payment allocation as the source of Order collection truth, immutable
account entries as the source of account balances, separate Delivery/COD
collection and settlement facts, and existing tenant isolation, capability,
idempotency, audit, outbox, and transaction boundaries.

## Blockers / Owner Review

No technical blocker is recorded. Authenticated owner review is still required
for the Finance overview, Payment and Expense detail, paginated worklists,
reconciliation actions, supplier traceability, and COD settlement surfaces.
