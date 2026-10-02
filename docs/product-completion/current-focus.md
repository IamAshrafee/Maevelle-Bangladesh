# Current Focus

## Active Area

Payments & Finance: Owner Capital contributors, capital Account movements,
personally funded Expenses and supplier payments, reversals, permissions, audit,
and finance reporting semantics.

## Current Status / Substage

`IMPLEMENTATION_COMPLETE / READY_FOR_OWNER_REVIEW`

## Evidence Already Known

- Account balances remain derived exclusively from immutable Account entries.
- Cash contributions and withdrawals post real Account entries and never become Revenue or Expense.
- Personally funded costs create real Expense payments and capital events without
  fabricating a business Account movement; Purchase payments reuse the linked Expense.
- Partial personal and Account-backed payments share the existing Expense payment
  source of truth, so paid and outstanding totals cannot diverge.
- Corrections use one-time compensating capital events; personal-payment reversals
  append signed Expense-payment facts and restore the outstanding obligation.
- Contributors are organization-scoped Finance identities, optionally linkable to a
  user, but independent of Team membership and ownership percentages.
- Dedicated view/manage capabilities, composite tenant foreign keys, database shape
  checks, idempotency, audit, and outbox evidence protect the workflow.
- Clean migration, focused capital integration tests, database/API builds, Admin
  production build, and focused lint pass.

## Immediate Objective

Conduct owner operational review of `/finance/capital`, including cash contribution,
withdrawal, personal Expense payment, supplier invoice payment, mixed partial funding,
and reversal outcomes in Accounts, Expense/Purchase detail, and Finance Overview.

## Important Constraints

- Capital is not Revenue, a customer Payment, an Expense, or an ownership percentage.
- Owner-funded costs settle Expenses without changing business cash.
- Account and Expense truth must remain in their existing immutable ledgers; the
  capital ledger supplies contributor meaning rather than duplicating balances.
- Cross-organization Account, contributor, Expense, and reversal links deny by default.
- Financial history is corrected with compensating facts, never silent deletion.

## Blockers / Owner Review

No code blocker. Owner operational review remains pending. The earlier Team & Access
operational review and external-provider verification are still pending separately.
