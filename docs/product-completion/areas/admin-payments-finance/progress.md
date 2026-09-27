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
- Streamlined global Payments & Finance navigation down to four coherent surfaces:
  Finance Overview (`/finance`), Payments (`/payments`), Accounts & treasury (`/finance/accounts`),
  and Expenses (`/finance/expenses`).
- Integrated Courier COD settlements directly into Accounts & treasury as a first-class
  operational tab (`/finance/accounts?tab=cod-settlements`) while maintaining URL redirection
  compatibility for legacy `/finance/cod-settlements` links.
- Replaced capped/in-memory Financial Activity with server-paginated, filterable activity
  ledger supporting search, quick date presets, direction filter, movement type filter,
  direct account links, and rich business origin links (`payments.payment`, `finance.expense`,
  `procurement.purchase`, `finance.cod_settlement`).
- Modernized Payments queue and record tables (`VerificationQueue`, `CodCollectionQueue`,
  `PaymentsTable`, `RefundsTable`) to use shadcn/ui Card, Table, Badge, and Button primitives,
  with clickable order and delivery links and clear Courier Holding badges for unremitted COD.
- Modernized Payment command dialogs (COD collection, manual verification, refund issuance,
  account posting, and refund completion) and payment method settings with responsive shadcn
  Dialog, Card, Input, NativeSelect, and Button controls.
- Added URL search parameters reactivity and deep-linking to `PaymentsConsole` (`?tab=...`,
  `?q=...`, `?posting=...`), ensuring filters from Order Details ("Payment operations",
  "Review refunds") and Finance Overview attention cards automatically select the target
  tab and search filter.
- Enhanced `PaymentDetail` with in-context financial operations: operators can now directly
  post payments to treasury accounts and request/issue refunds from the payment detail view
  with immediate operational feedback.
- Wrapped `/payments` with a Suspense boundary and accessible skeleton layout.
- Connected Finance Overview attention items directly to specific filtered views
  (e.g., `/payments?tab=verification`, `/payments?tab=payments&posting=UNPOSTED`,
  `/finance/accounts?tab=cod-settlements`).
- Verified TypeScript compilation and production builds across all routes in `@maevelle/admin`.

## Next implementation slice

Conduct owner visual review of the updated Payments and Finance surfaces across mobile
and desktop viewports; preserve all immutable financial transaction and audit safeguards.
