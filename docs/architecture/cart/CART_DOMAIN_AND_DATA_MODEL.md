# Cart domain and data model

> Current implementation notice (2026-11-03): [Phase01A-R](PHASE_01AR_IMPLEMENTATION_REPORT.md)
> and its [API/frontend profile](PHASE_01AR_API_AND_FRONTEND_CONTRACT.md) are authoritative
> for the implemented guest foundation. Retain the full-product design below;
> fixed-cookie adoption, optional public intent keys and legacy receipt replay
> are superseded. Atomic Clear and explicit cookie-only session forgetting now
> exist. Account Carts/merge and complete Checkout are not implemented by01A-R.


Phase01A update: the [implemented profile](PHASE_01A_RECEIPT_AND_OWNER_CONTRACT.md), [bootstrap protocol](PHASE_01A_BOOTSTRAP_PROTOCOL.md) and [acceptance register](PHASE_01A_ACCEPTANCE_REGISTER.md) distinguish current code from this full-product proposal/historical design register. Only explicitly evidenced Phase01A coverage has run; other scenarios/threats remain unexecuted.


This is a logical proposal, not an executable migration. Existing schema: audit E16. PostgreSQL/Kysely/raw SQL and decimal strings follow E04/E50/E52.

## Proposed schema evolution

| Relation | Fields / invariants | Index / foreign-key policy |
| --- | --- | --- |
| `cart.carts` existing | UUID PK; organization; currency; ACTIVE/MERGED/EXPIRED/CONVERTED (retain ABANDONED legacy until mapped); version bigint >=1; nullable customer_account_id; guest hash nullable; activity/expiry timestamps; merged_into_id; owner_generation UUID | Unique `(organization_id,id)`; partial unique `(organization_id,customer_account_id,currency_code)` WHERE status=ACTIVE and account nonnull; unique nonnull guest hash; composite account FK; self FK `(organization_id,merged_into_id)`; active expiry index |
| `cart.cart_lines` existing | UUID PK; organization/cart/variant; numeric(20,6) constrained integer 1..99; last_seen_unit_price decimal4 advisory; created/updated, version; optional acknowledged_price_definition_id for price notices | Unique `(cart_id,variant_id)`; composite org/cart and org/variant FKs; indexed variant references; no cascading merchandise deletion |
| `cart.cart_coupons` existing | Selected coupon intent only; org added for scoped FK; application outcome computed | Composite scoped cart/coupon FKs; primary cart/coupon; coupon FK index; no coupon redemption |
| `platform.idempotency_records` reused | organization, principal type/id, operation, key, request fingerprint, status, safe_response; new Cart envelope contains committed outcome, owner generation, cart ID, version, event IDs, expiry | Existing uniqueness claim must be verified against migration; preserve shared consumers. Add Cart-only expiry/index/retention association by forward migration if shared columns insufficient |
| `cart.merge_receipts` proposed | organization, merge intent UUID, guest cart, target account/cart, guest/account versions, result counts, reviewed exclusions, committed revision | Unique org/guest_cart for terminal successful merge; unique org/account/intent; scoped FKs; bounded response, no token; account-authorized lookup |
| `cart.intent_tombstones` proposed | org, principal/cart generation, key hash, operation and payload hash, consumed_at, expires_at | Unique same receipt identity; retains consumed status without rich response, prevents old intent reexecution |
| `cart.transfer_intents` proposed | org/cart/owner, intent, source line/version/variant/quantity, Wishlist result, status SAVING/SAVED/REMOVED/NEEDS_REVIEW, expiry | Unique org/cart/intent; scoped cart FK; account save-first transactional orchestration via existing Wishlist application operations; guest save receipt stays client-side reference only |
| `platform.outbox_events` existing | Cart aggregate UUID/version, event_version, minimal before/after delta and source; no token/account PII | Existing outbox leasing/projection patterns, dedupe projector org/event |
| Analytics Cart projections proposed | daily org/currency/source/variant aggregate counts, snapshots with as_of and eligibility version | Bounded date dimensions; no raw customer Cart browsing by default |

Owner constraint: ACTIVE account Cart has account ID and no usable guest hash; ACTIVE guest has hash and no account ID. Terminal merged cart has revoked hash. Legacy customer_id is CRM metadata only; do not infer account ownership from it. Proposed composite FK requires referenced `(organization_id,id)` unique key; verify actual account/catalog schema in migration implementation and add keys without weakening constraints. All FK referencing columns get appropriate index unless covered by leading columns of existing index.

Do not persist transient UI states, derived stock, authoritative prices, taxes or recommendation payloads in Cart. Minimal sanitized line reference remains on publication withdrawal; never persist a complete draft product snapshot for private reads. Referenced hard deletion is restricted; any future hard-delete workflow must explicitly redact/tombstone references through owning domains.

## Transaction and read invariants

Commands: resolve trusted org and owner; validate bounded input; transaction; owner-bound cart lock; receipt check before stale-version rejection; version match; batched catalog/price/inventory evaluation at one timestamp; apply command; version bump once only for actual intent change; store immutable outcome and event IDs; insert outbox; commit. Receipt and domain effects cannot commit independently. Same-key no-op/replay does not increment or emit duplicate event. Deterministic validation failures may be retained as final outcomes; transient infrastructure failures roll back and remain retryable under same key.

READ uses a read-only REPEATABLE READ transaction (or equivalent single statement snapshot) with fixed evaluation instant to prevent mixed line/version/price reads. Catalog/stock/price may change immediately after snapshot: response includes evaluatedAt and advisory expiry, never guaranteed stock. Mutation revision changes shopping intent, not every external price update. Evaluation fingerprint covers currency, complete line IDs/variants/quantities/eligibility, price definition versions, promotion revisions/allocations and policy version. Cart eligibility at time T never reserves stock at T+1.

Global caps: 100 lines, 99 units per line, 50 batch entries and 64 KiB mutation payload. Enforce cart row lock before counting lines. Bigint revision returns canonical decimal string in new shared DTO (legacy facade uses safe checked number); no Number overflow. Quantity DTO is canonical positive integer decimal string (no exponent/fractions/leading zero), money four decimal strings.

## Retention and privacy proposal

Guest Cart expires 30 days after last explicit activity, account 180 days; credential hard expiry remains independent (System spec). Expired/merged item rows purge after 7 days unless a still-referenced legacy checkout requires preservation; terminal cart tombstone and FK-safe minimum metadata retained 180 days, then purge if no business retention dependency. Cart receipt rich outcomes 7 days; consumed-key hashes/merge tombstones 180 days. Do not enqueue/replay client intent older than 7 days: require fresh review with new intent, never silently convert stale intent into a new mutation. Receipt age beyond recovery produces INTENT_EXPIRED/409, not execution. Retention Worker indexes expiry and processes <=100 rows/batch with budget/leases.

Account deletion revokes access immediately; purge/anonymize Cart data through existing customer deletion policy, retaining only necessary dedupe/FK facts. No new recovery email campaign or abandoned-cart marketing without separate consent/business authorization. Proposed raw operational events 30 days and pseudonymous aggregates 13 months require privacy approval before production. Backups follow deployment recovery policy; deleted data may persist only for documented backup horizon, with deletion reapplied on restore.

## Migration and compatibility plan

Add new migration after current registered head; do not edit `1000_cart` or Wishlist migrations. Expand nullable ownership/lifecycle/receipt fields and scoped keys; preflight legacy data consistency and fractional quantities, never cast/truncate silently. Backfill only provable guest ownership; `customer_id` cannot prove an account claim. Deploy new readers/compatibility facade first, then new commands/controller behind enablement. Old Checkout expects CartView/version/fingerprint/status: retain facade until its separate project; do not expose new ownership through old token APIs. Test fresh and populated prior-schema upgrades on explicitly disposable DB later, plus old consumer fixture compatibility. Rollback images only to last schema-compatible release; feature-disable new mutations and forward-repair bad data. No automatic down migration/reset. Staging backup/manifest/one-job migration and private proxy checks belong to authorized release, not Phase 00.
