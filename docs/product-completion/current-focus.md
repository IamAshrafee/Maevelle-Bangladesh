# Current Focus

## Active area

Catalog Product Management (`ACTIVE_IMPLEMENTATION`)

## Why now

Products are the operational source for Storefront, media, sizing, pricing,
inventory, procurement, promotions, reviews, search, and analytics. The current
Admin Product page exists, but it is an unbounded client-filtered table plus a
partial variant drawer. It cannot yet support complete day-to-day catalog work.

## Current stage

Stage 4 — Variant matrix, lifecycle, identifiers, and cross-domain price/stock/media.

## Last completed action

Stage 3 is complete. Product Types, attribute definitions, required/filter/search
behavior, normalized reference options, Product selectors, taxonomy, structured
information, FAQs, and SEO are operator-usable across the database, API, Admin,
and public Product projection. Commit: `8fa0e78`.

## Next exact action

Implement the authoritative Variant matrix read model and atomic option/value and
combination synchronization commands. The read model must distinguish existing,
missing, archived, duplicate-risk, and incomplete combinations and expose the
real price, stock, and media setup state needed by the Admin matrix.

## Continuity note

Catalog Product Management is the recommended resume point when no newer user
instruction selects another module. It is not a restriction against working in
another area.
