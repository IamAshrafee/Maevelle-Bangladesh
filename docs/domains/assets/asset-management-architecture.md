# Asset Management Architecture

## Purpose and boundary

Asset Management records durable property Maevelle owns or controls: what the item is, where it is, who is responsible for it, its condition, maintenance, documents, and lifecycle. It does not represent saleable stock, consumables, a second cash ledger, or statutory fixed-asset accounting.

- Inventory remains authoritative for product quantities, reservations, transfers, and valuation.
- Finance remains authoritative for Expenses, payments, Account balances, Owner Capital, and sale proceeds.
- Procurement remains authoritative for suppliers, Purchases, and Purchase lines.
- Warehouse locations, Team memberships, Media, Audit, idempotency, and outbox infrastructure are reused through organization-scoped references.

Each Asset is an individually tracked durable item. A bulk purchase can produce multiple Asset records when individual location, condition, custody, or lifecycle matters. Low-value consumables remain Expenses or Supplies.

## Domain model

`assets.assets` owns the Asset code, physical identity, current status and condition, acquisition snapshot, current location/custodian, warranty, and terminal sale/disposal references. Organization-scoped composite foreign keys prevent cross-tenant links.

`assets.categories` is a small organization-managed taxonomy. Archived categories remain on historical Assets.

`assets.events` is the readable physical lifecycle timeline. It records registration, edits, assignment, movement, condition/status changes, maintenance, attachments, sale, and disposal. Platform Audit remains the security/administrative audit authority.

`assets.maintenance_records` records service facts and optionally links a Finance Expense. It never stores a second maintenance cost.

`assets.media_links` connects private Media to Assets and writes the existing Media usage projection/history.

## Acquisition and Finance

Acquisition sources are deliberately limited:

- `EXISTING`: opening registration with optional historical cost and no fabricated Finance record.
- `GIFT`: zero/optional-cost property with no forced payment.
- `EXPENSE`: references a recorded Finance Expense. Cost and currency default from that Expense; Account or Owner Capital funding is derived from its immutable payments.
- `PURCHASE`: references a placed/closed Procurement Purchase and optionally a line. The Purchase remains supplier authority; its linked Finance Expense and payments provide funding provenance.

Acquisition cost is a historical Asset snapshot. It is not an Account movement, book value, or market value. Maevelle does not currently calculate depreciation: the Finance product is management-finance rather than a statutory general ledger, and a partial depreciation model would imply false accounting precision. The schema keeps acquisition facts explicit so an accounting capability can be added later without rewriting physical history.

## Lifecycle and commands

Operational statuses are `ACTIVE`, `IN_STORAGE`, `UNDER_REPAIR`, `DAMAGED`, and `LOST`. `SOLD` and `DISPOSED` are final. A lost Asset may be recovered through an explicit lifecycle command. Condition is separate: `GOOD`, `FAIR`, `NEEDS_REPAIR`, or `DAMAGED`.

Assignment, movement, maintenance, lifecycle changes, sale, and disposal use explicit APIs rather than a generic status patch. Version checks prevent lost updates. Important creates, maintenance, attachments, sale, and disposal are idempotent.

Sale locks the Asset and receiving Account, creates one `ASSET_SALE` Finance transaction and positive Account entry, and transitions the Asset to `SOLD` in one database transaction. Disposal changes physical lifecycle only and creates no fake financial movement.

## Access and privacy

- `assets.view`: view Assets, provenance, maintenance, documents, and history.
- `assets.manage`: register/edit, assign/move, record maintenance, manage categories, and attach documents.
- `assets.lifecycle.manage`: change consequential lifecycle state, sell, or dispose.

Every API authorizes server-side. Asset documents must be private, ready Media records. Tenant-scoped foreign keys and domain lookups reject guessed IDs from another organization.

## Admin experience and cross-module workflows

`/assets` provides server pagination, multi-attribute search (asset code, name, serial number, model, brand, custom location, custodian), status/category filters, meaningful summary counts, category management, and registration.

`/assets/[assetId]` is the operational workspace with Overview, Acquisition & Finance, Maintenance, Files, and Activity sections. Desktop tables become touch-friendly cards on smaller screens. Normal operations are available through focused dialogs; Finance and Purchase records are linked rather than copied as IDs.

### Cross-domain navigation:
- **Finance Expenses (`/finance/expenses/[id]`)**: Shows connected Assets (both acquired property and maintenance records) with clickable links. Unlinked recorded expenses offer a 1-click "Register as Asset" action pre-filling source, expense ID, cost, currency, and description into `/assets?create=asset`.
- **Procurement Purchases (`/purchases/[id]`)**: Placed and closed purchases offer a 1-click "Register Asset" action pre-filling source, purchase ID, total order cost, and currency into `/assets?create=asset`.
- **Finance Ledger & Account Ledger**: `ASSET_SALE` transactions render the business origin as a clickable link directly to `/assets/[assetId]`.
- **Owner Capital (`/finance/capital`)**: Personally funded equipment purchases connect `Owner Capital -> Expense Payment -> Asset Financial Provenance` without duplicated charges.

## Reporting semantics

The overview reports operational counts and total acquisition cost in the organization default currency only. Acquisition cost is labelled historical cost and never presented as current value. Maintenance totals are read from linked Expenses, and sale proceeds are read from Finance Account entries.
