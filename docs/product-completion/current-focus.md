# Current Focus

## Active Areas

Payments & Finance: Overview (`/finance`), Payments (`/payments`), Accounts & Treasury (`/finance/accounts`), Expenses (`/finance/expenses`)

## Current Status / Substage

`PAYMENTS_AND_FINANCE_MODULE_COMPLETION / OWNER_REVIEW_PENDING`

## Evidence Already Known

Payments & Finance has been completed as a practical, operationally complete financial
module for merchants:
- Consolidated global navigation into four focused operational surfaces: Overview,
  Payments, Accounts & treasury, and Expenses.
- Courier COD settlements are integrated directly into Accounts & treasury as an operational
  tab (`/finance/accounts?tab=cod-settlements`) with transparent handling for courier remittances,
  deductions, and net holding receipts.
- Server-paginated, filterable Activity & Ledger with direct bidirectional links to
  underlying business records (`payments.payment`, `payments.refund`, `finance.expense`,
  `procurement.purchase`, `finance.cod_settlement`).
- Modernized Payments queues, record tables, and command dialogs with responsive shadcn/ui
  primitives, URL search parameter reactivity, and deep linking from Orders and Attention cards.
- Enhanced Payment Detail with in-place account posting and refund dispatch capabilities.

## Immediate Objective

Conduct owner visual and operational review of Payments, Finance Overview, Accounts & Treasury,
and Expense surfaces across mobile, tablet, and desktop viewports.

## Last Completed Action

Streamlined navigation, integrated Courier COD settlements, modernized Payments and Finance
consoles to shadcn/ui design standards, enabled URL sync and deep linking, added in-context
actions to Payment Detail, and passed comprehensive TypeScript typechecks and Next.js builds.

## Important Constraints

- Ledger records remain immutable financial facts once created.
- Reconciliations, refunds, and cancellations emit audit and outbox events.
- Cash movements must not be labeled as business profit without complete landed cost coverage.

## Blockers / Owner Review

No code blockers. Ready for owner visual and operational review.
