# Storefront wishlist: repository audit and implementation direction

The Cart Phase 04B integration adds private Account Wishlist Add and atomic Move, guest Add with the saved entry retained, and a public product continuation for shared recipients. See the [Cart Storefront integration report](../../../architecture/cart/PHASE_04B_STOREFRONT_INTEGRATION_REPORT.md) for ownership and recovery behavior.

Status: **in progress**. The customer-visible guest save/list workflow has been replaced; the complete capability, especially sharing and account ownership, is **not complete**.

## Product decisions from the owner discussion

- One private default wishlist per authenticated customer; guest saving without registration.
- Product is the unique saved identity. A selected catalog variant may be remembered as a preference, never as a second product identity.
- Snapshot sharing is explicit and private by default. The owner selects all or specific saved products; a share freezes the selected product references, while displayed price and availability remain current.
- Guest sharing requires separate public read and private management capabilities. Tokens are random and only digests are stored. Links can expire, renew and revoke. Recipients may save individual or all eligible products into their own wishlist.
- No personal wishlists in general Admin views. Aggregate metrics and narrowly authorized, audited abuse revocation are appropriate.
- Saving does not imply marketing consent. Events distinguish browser-level guest interest from verified account interest and must avoid click inflation and link-preview inflation.

## Current source evidence

- `apps/storefront/features/wishlist/use-wishlist.ts` previously seeded five sample products, stored full stale card data and swallowed storage errors. The old share control copied `/wishlist`, which did not share the owner's data. The old move-to-bag controls only played timers.
- Product identity is `catalog.products.id`; variants are `catalog.product_variants` IDs inside `StorefrontProductDto`. Storefront public catalog reads filter publication and lifecycle state.
- `search.catalog_documents` is a rebuildable public projection with current price and availability. The new bounded `POST /storefront/v1/wishlist/products` reads it and returns public product data for up to 100 IDs without returning unpublished records.
- Better Auth is wired for Admin sessions and `iam.users`. Storefront has a guest cart and checkout, but no customer sign-in or account session flow. CRM account links and contact identities are not a customer-controlled storefront login. Do not use Admin identity or a CRM match as shopper authorization.
- Storefront analytics already has behavioral events. New wishlist event names and ingestion must fit its validation, consent, identity, bot, and reporting model.

## Remaining implementation, in dependency order

1. **Customer identity:** establish a customer-controlled storefront authentication and session boundary, with organization-scoped customer account ownership and deletion/anonymization behavior. Verify a real sign-in/sign-out journey before enabling account wishlist routes.
2. **Private persistence:** forward-only migration for one wishlist per `(organization, owner account)`, unique `(wishlist, product)` items, optional validated variant preference, bounded keyset pagination, explicit PUT/DELETE, and idempotent merge. Preserve account isolation across switches and pending requests.
3. **Guest state hardening:** migrate storage to minimal product/variant references, reconcile simultaneous tab writes and storage failures, and merge only successfully accepted guest entries. Never persist catalog prices as authority.
4. **Sharing domain:** forward-only migration for share snapshots and item references, digest-only view/manage tokens, expiration/revocation, separate guest management credential, account ownership claim, bounded creation and active-share limits, and audited operational revocation. Public reads must check revocation/expiry each time and expose only currently public catalog fields.
5. **Sharing UI:** selected-item overlay, native share and Copy Link, guest credential preservation, link list/renew/revoke, public `/wishlist/shared/[token]` read-only page, noindex and no-referrer/no-store, recipient Save All into their own list, and expired/revoked state.
6. **Analytics and Admin:** deduplicated save/remove/share/recipient signals; consent and preview-bot controls; aggregate interest reporting; capability-controlled abuse revocation with audit. No secret tokens in analytics or logs.
7. **Acceptance:** guest and account multi-tab/multi-device flows, rapid taps, variants, unpublished/out-of-stock items, account switching, merge retries, share lifecycle, recipient isolation, storage/network errors, accessibility, mobile/tablet/desktop, performance and staging browser review.

Do not call the wishlist complete until these workflows have current source, focused tests and operator/customer review evidence. The existing untracked `docs/product-completion/areas/stockout-interest/` work is unrelated and must be preserved.
