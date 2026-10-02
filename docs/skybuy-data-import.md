# SkyBuy Data Import

SkyBuy exports are historical supplier, inbound-logistics, and acquisition-cost
evidence. They are not a direct inventory count or a source of Maevelle retail
selling prices.

## Inspect and plan an export

```bash
pnpm --filter @maevelle/database import:skybuy -- \
  /absolute/path/to/skybuy-orders.xlsx \
  --output=/absolute/path/to/skybuy-import-plan.json
```

The planner reads every populated row in all 13 workbook tabs. It rejects tab
or header drift and reconciles:

- order list totals against detail totals;
- order item totals against product price;
- paid plus due against the final order total;
- payment rows against paid totals;
- product quantities against variant quantities; and
- workbook extraction quality flags.

The generated plan contains deterministic draft product handles and SKUs,
Maevelle taxonomy mappings, purchase lines, consolidated SkyBuy shipment groups,
source hashes, and import blockers.

## Data authority rules

- A SkyBuy listing ID is supplier-page identity, not Catalog Product identity.
  Assortment listings are split into separate draft Products by purchased design.
  Only explicitly reviewed color, size, capacity, or closely equivalent options
  remain Variants of one Product. Unreviewed listings default to separate Products,
  which prevents unrelated marketplace designs from being merged accidentally.
- SkyBuy option text is preserved verbatim. `color classification` is normalized
  to a neutral `Style` axis because the values are not necessarily colors.
- Maevelle SKUs are stable hashes of SkyBuy listing identity and option values.
  They are not presented as SkyBuy item SKUs because the workbook omits that field.
- SkyBuy unit price is supplier acquisition cost. Catalog products remain unpriced
  and unpublished until Maevelle retail prices are entered.
- Completed SkyBuy quantity is historical received quantity, not current on-hand
  inventory. Posting receipts is blocked until a current SKU-by-warehouse stock
  count is available, so the migration cannot inflate sellable stock.
- Payment rows remain source evidence until supplier payment/refund operations
  exist in the Procurement domain.
- Workbook shipment thumbnails are evidence links. Empty `Video URL` cells are
  not invented or derived from the thumbnail URL.

## SkyBuy API credentials

If a later connector is added, the bearer token must come from a secret/runtime
environment variable. It must never be checked into source, logs, import plans,
or database rows. The workbook is sufficient for the current read-only planning
path; API detail calls are only needed to recover status history and source item
SKU fields that the workbook did not export.

## Apply the safe domains

After reviewing the generated plan and rebuilding or migrating the local
database with the current baseline, apply draft Catalog Products and Procurement
history:

```bash
pnpm --filter @maevelle/database import:skybuy:apply -- \
  /absolute/path/to/skybuy-orders.xlsx \
  --org=maevelle \
  --location=WH-EAST-MAISHA \
  --apply
```

This creates or reuses the SkyBuyBD supplier, logical design-specific draft
Products, deterministic Variants and source media, and Purchase records. It
places non-cancelled purchases and cancels source-cancelled purchases. The source
workbook hash and external-to-Maevelle identity links make repeat runs idempotent
and recoverable.

## Reapply after local reset

The source workbook is intentionally not committed because it is operational
supplier data. To make a local environment replay it after every
`Prepare.command` or `Reset.command`, retain the workbook locally and add this
to `.env`:

```bash
SKYBUY_IMPORT_WORKBOOK_PATH=var/imports/skybuy-orders.xlsx
SKYBUY_IMPORT_ORGANIZATION_CODE=maevelle
SKYBUY_IMPORT_LOCATION_CODE=WH-EAST-MAISHA
```

The path can be absolute or relative to the repository root. Preparation runs
the normal canonical seed first, then applies the workbook with `--apply`. A
configured missing or non-XLSX workbook fails preparation instead of silently
starting with the SkyBuy data missing. Leave `SKYBUY_IMPORT_WORKBOOK_PATH`
unset when that historical import is not wanted in a local environment.

The command deliberately stops before inbound shipments, receipts, inventory,
supplier payments, and landed-cost finalization. Those operations need the
missing SkyBuy milestone timestamps, current physical stock count, and the
supplier-payment/refund domain so historical evidence cannot create false stock
or financial state.
