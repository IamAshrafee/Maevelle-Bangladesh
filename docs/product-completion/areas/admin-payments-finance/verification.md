# Payments & Finance Verification

Current focused evidence:

- `payments.test.ts`, `finance.test.ts`, and the adjacent Procurement suite: 31
  tests passed.
- Database, API, and Admin focused TypeScript checks passed.
- Focused ESLint for touched contracts, domain, routes, tests, and Admin files
  passed.
- Payment list coverage now exercises search, method, status, posting-state,
  pagination totals, and out-of-range pages against real PostgreSQL state.
- Finance coverage now exercises reconciliation resolve/reopen concurrency,
  immutable audit/outbox evidence, overview attention state, zero-difference
  closure, supplier-source tenant/currency/status validation, partial payment,
  and Purchase/supplier traceability.
- Expense coverage now exercises immediate account-backed payment, idempotent
  creation/payment/adjustment replay, payee/reference/notes detail, account and
  date filtering, pagination totals, exact account impact, version conflicts,
  credit-sign rules, paid-floor protection, unpaid cancellation, rejected
  cancelled payment, and adjustment/cancellation audit and outbox evidence.
- COD settlement coverage exercises the unposted-Payment boundary, required
  deduction explanation, distinct source/destination accounts, partial
  settlement, idempotent replay, normalized duplicate-remittance rejection,
  over-allocation rejection, final account balances, overview outstanding
  amount/count, settlement history, audit/outbox evidence, and integrity checks.
- The COD flow also verifies the 7-day financial trend read model: seven local
  daily buckets and reconciled collection, courier-deduction, and net-account
  movement totals.
- The disposable development and test databases were rebuilt from the mutable
  migration baseline; both applied the full migration set successfully.
- API and Admin production builds passed; Admin includes
  `/payments/[paymentId]` as a dynamic route and `/finance/cod-settlements` as a
  production route. The Expense checkpoint adds
  `/finance/expenses/[expenseId]` as a dynamic production route.
- The rebuilt Admin production bundle includes the cash-activity trend chart;
  focused TypeScript and ESLint checks cover the trend endpoint, responsive
  range controls, and Payment/Refund quick-date controls.
- The rebuilt Docker stack is healthy for Postgres, API, Admin, and Storefront;
  the API readiness endpoint returned `{"status":"ok"}` and the new Admin route
  returned HTTP 200 through the local proxy.

Authenticated browser review of the Finance overview, Payment and Expense
details, responsive Payment/Refund/Expense filters, reconciliation actions,
supplier trace links, and COD settlement workflow is still required before the
frontend checkpoint can be considered visually closed.
