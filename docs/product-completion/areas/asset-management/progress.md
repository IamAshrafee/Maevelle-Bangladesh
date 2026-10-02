# Asset Management Progress

## Implemented

- Tenant-scoped schema, constraints, indexes, categories, Assets, timeline, maintenance, and private Media links.
- Existing, gifted, Expense-linked, and Purchase-linked acquisition workflows.
- Derived Account and Owner Capital funding provenance from authoritative Finance payments.
- Paginated/searchable/filterable list, summary, options, and detail APIs.
- Explicit assignment, movement, lifecycle, maintenance, sale, disposal, and attachment commands.
- Atomic, idempotent Asset sale proceeds into the immutable Finance Account ledger.
- `assets.view`, `assets.manage`, and `assets.lifecycle.manage` authorization.
- Responsive Admin list, registration, category management, detail tabs, and all normal operational actions.
- Frontend product completion pass:
  - Interactive summary stat cards with click-to-filter capability.
  - Search and multi-attribute filters including condition, business location, and custodian.
  - Responsive table and mobile touch cards with row actions menu and deep links.
  - Comprehensive registration modal with explicit acquisition modes: Existing property, Business expense, Owner-funded expense (highlighting contributor attribution), Procurement purchase with line items, and Gifts.
  - State-aware asset detail workspace with contextual action banners (Complete Repair, Send to Repair, Mark Recovered, Deploy to Service, Terminal Archive).
  - Cross-module financial provenance with direct navigation to Owner Capital (`/finance/capital`), Financial Accounts (`/finance/accounts`), Expenses (`/finance/expenses`), and Purchases (`/purchases`).
  - Dedicated Maintenance tab with inline recording and audited voiding.
  - Dedicated Files tab with private media image thumbnails, role badges, and audited detachment.
  - Formatted domain activity timeline with before/after state diffs.
  - Deep-link action and tab parameter handling for cross-domain operational agility.
- Domain documentation and focused integration tests.

## Deliberate exclusions

- Formal depreciation/book value, tax books, work orders, predictive maintenance, RFID, and IoT.
- Asset quantity balances. Each Asset is individually tracked; Inventory remains the quantity ledger.

## Remaining gate

Run the clean disposable database migration and focused Asset integration tests when Docker/PostgreSQL is available, then conduct owner operational/visual review of the workflows.
