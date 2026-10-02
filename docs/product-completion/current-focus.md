# Current Focus

## Active Area

Asset Management: durable business property, acquisition provenance, custody,
location, condition, maintenance, private documents, and terminal lifecycle.

## Current Status / Substage

`IMPLEMENTATION_COMPLETE / LOCAL_DB_VERIFICATION_BLOCKED`

## Evidence Already Known

- Asset identity and physical lifecycle are separate from saleable Inventory.
- Finance/Expense/Purchase/Owner Capital facts are referenced and derived rather
  than duplicated.
- Existing and gifted Assets require no fake financial history.
- Sale posts one idempotent Finance transaction and Account entry atomically with
  the final Asset lifecycle change.
- Composite organization foreign keys, capability checks, versioning,
  idempotency, Audit, outbox, and private Media rules protect the workflows.
- Responsive Admin list/detail/create/category/assignment/movement/maintenance/
  file/lifecycle/sale/disposal workflows are implemented with progressive disclosure.
- Cross-module workflows link Expenses, Purchases, Owner Capital, and Finance Ledgers
  directly to Asset records with prefilled registration and bidirectional links.
- Database/contracts/API and Admin TypeScript checks pass.

## Immediate Objective

Start Docker/PostgreSQL, rebuild the disposable database from the checked-in
baseline, run `packages/database/src/assets.test.ts`, and fix any runtime issue.
Then conduct owner operational and visual review at `/assets`.

## Important Constraints

- Acquisition cost is historical cost, not book or market value.
- No formal depreciation exists; do not imply accounting precision.
- Expense payments and Account entries remain Finance authority.
- Purchase and supplier truth remains Procurement authority.
- Asset location/custody history never mutates Inventory quantities.
- Sold and disposed Assets are historical records, not deletable operational data.

## Blockers / Owner Review

Docker Desktop was unavailable on 2026-10-02, so clean migration and focused
PostgreSQL integration execution remain pending. Browser/responsive and owner
workflow review also remain pending. Earlier Owner Capital and Team & Access
owner-review items remain open separately.
