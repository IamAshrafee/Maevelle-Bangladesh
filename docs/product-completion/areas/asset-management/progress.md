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
- Domain documentation and focused integration tests.

## Deliberate exclusions

- Formal depreciation/book value, tax books, work orders, predictive maintenance, RFID, and IoT.
- Asset quantity balances. Each Asset is individually tracked; Inventory remains the quantity ledger.

## Remaining gate

Run the clean disposable database migration and focused Asset integration tests when Docker/PostgreSQL is available, then conduct owner operational/visual review of the workflows.
