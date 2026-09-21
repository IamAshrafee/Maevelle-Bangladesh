# Payments & Finance Progress

## Current checkpoint

- Added an authoritative Finance overview read model using the organisation's
  default currency and local calendar month.
- Overview metrics now distinguish customer collections, completed refunds,
  paid expenses, net account movement, total account balance, outstanding
  expenses, and supplier-linked obligations without calling any value profit.
- Attention counts now cover manual-payment verification, delivered COD
  collection, missing account postings, reconciliation differences, and
  supplier obligations.
- Added a dedicated Payment detail route connecting the Payment to its Order,
  customer snapshot, collection source, account posting, and Refund history.
- Replaced capped Payment and Refund reads with deterministic server pagination,
  total counts, search, method/status, posting-state, and date-range filters.
- Removed the Refund list N+1 query path and introduced a shared paginated
  response contract consumed by Payments and Returns.
- Added URL-backed, responsive Payment/Refund worklist controls with accurate
  total counts and extracted them from the command-heavy Payments console.
- Decomposed the Payments workspace into focused verification/COD queues,
  Payment/Refund tables, method settings, reusable filters, and composed command
  dialogs; the console now concentrates on orchestration and server commands.
- Added a complete manual reconciliation lifecycle: exact matches close
  automatically, discrepancies can be resolved with an auditable explanation,
  and mistaken resolutions can be safely reopened without deleting history.
- Hardened supplier payables so Finance accepts only placed, same-tenant
  Purchases in the correct currency and exposes direct Purchase/supplier
  traceability alongside partial and completed payments.
- Added courier COD settlement as a distinct Finance workflow after customer
  collection: confirmed COD Payments remain outstanding until allocated to a
  courier remittance, and only account-posted Payments are settlement-eligible.
- Added partial and batch COD allocations, normalized unique remittance
  references, courier deductions with mandatory explanations, immutable
  holding-account/net-receipt entries, idempotent replay, audit/outbox evidence,
  tenant/currency/account controls, and integrity checks against over-settlement.
- Added a responsive `/finance/cod-settlements` workspace with an outstanding
  courier-held queue, missing-posting guidance, compatible Payment selection,
  settlement entry, paginated history, source Payment links, and Finance-overview
  amount/count attention.
- Added authoritative timezone-aware Finance trends for 7-, 30-, and 90-day or
  current-month periods. Daily series and totals distinguish collections,
  completed refunds, paid expenses, courier deductions, and net immutable
  account movement, with explicit cash-activity—not profit—terminology.
- Added matching 7-day, 30-day, current-month, and 90-day shortcuts to the
  paginated Payment and Refund worklists while retaining custom date inputs.
- Completed the everyday Expense workflow with paginated server-side search,
  category/account/payment/lifecycle/date filters, merchant quick ranges, and
  an uncapped contract shared by Finance, Purchase, Supplier, and Landed Cost
  consumers.
- Expense entry now supports payee, external reference, notes, and optional
  full account-backed payment at creation while keeping common fields first and
  optional context progressively disclosed.
- Added a responsive Expense detail route with related Purchase/supplier
  context, immutable account payment history, adjustments, and audited activity.
  Operators can make retry-safe partial payments, record versioned corrections
  or credits, and cancel only unpaid Expenses with a required reason.
- Hardened Expense retries and invariants: creation, payment, and adjustment
  idempotency is consulted before mutable-state checks; adjustments cannot
  modify cancelled Expenses, erase the obligation, or reduce it below money
  already paid; lifecycle changes emit audit and outbox evidence.
- Preserved the required Delivery booking lifecycle in COD test coverage.

## Next implementation slice

Scale Financial Activity and account detail with paginated, server-filtered
history and authoritative account summaries instead of unbounded browser
aggregation. Complete explicit account lifecycle controls, then perform
authenticated responsive review of the Payments and Finance surfaces.
