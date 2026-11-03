# Phase 00 repository audit

Date: 2026-11-02 (Asia/Dhaka). Scope: source/history inspection and new Cart planning documents only. Evidence refers to the preserved working tree, including uncommitted files; line numbers can change after later edits. **Static verified** means code was inspected, not that a runtime test passed.

## Baseline and method

Root: `/Users/ashrafee/Documents/GitHub/Maevelle Bangladesh`. Branch `main`; HEAD `aa290065407030e85b5b6847efd22fb437a65279`. Initial dirty state is captured verbatim in [BASELINE_GIT_STATUS.txt](BASELINE_GIT_STATUS.txt). There were 23 modified tracked paths and 37 untracked paths at capture (validate count in final report). All pre-existing content is protected by a SHA-256 comparison of 1,931 files. No checkout, reset, install, database connection, migration, runtime test, commit, push or deployment was performed.

Read repository AGENTS, engineering standards, Product Completion state/current focus, Storefront-specific AGENTS, relevant domain source/migrations/tests, manifests, proxy/worker/observability code and deployment strategy. History for Cart includes `4137de8` commerce foundation, `c83cbda` Storefront rebuild and `86ce82e` media changes. Historical completion claims are context only.

## Evidence ledger

| ID | Source | Verified finding / practical implication |
| --- | --- | --- |
| E01 | [package.json:6](../../../package.json#L6) | pnpm 11.19.0; Node >=24 <25; TypeScript 5.9.3 in manifest. Installed/runtime versions were not tested. |
| E02 | [apps/api/package.json:17](../../../apps/api/package.json#L17) | Fastify 5.12.7, Better Auth 1.7.12, TypeBox 1.3.16 declared. |
| E03 | [apps/storefront/package.json:14](../../../apps/storefront/package.json#L14) | Next 16.4.2, React 19.2.8, Tailwind 4.1.18; Admin additionally declares Base UI 1.7 range. |
| E04 | [packages/database/package.json:230](../../../packages/database/package.json#L230) | Kysely 0.29.5 and pg 8.23.0 declared; database package has domain subpath exports. |
| E05 | [compose.yaml:3](../../../compose.yaml#L3) | Local Compose specifies PostgreSQL 18 and loopback database binding; no runtime connection made. |
| E06 | [apps/api/src/routes/auth.ts:225](../../../apps/api/src/routes/auth.ts#L225) | Cart routes register through the existing Auth composition root, but receive neither storefront config nor shopper resolver. |
| E07 | [apps/api/src/routes/cart.ts:16](../../../apps/api/src/routes/cart.ts#L16) | Guest token cookie: HttpOnly, Lax, 30 days, Secure only in production; no account resolution. |
| E08 | [apps/api/src/routes/cart.ts:60](../../../apps/api/src/routes/cart.ts#L60) | Creation accepts arbitrary organizationId/currency strings rather than resolving storefront context; mutations use string IDs and unbounded quantities. |
| E09 | [apps/api/src/app.ts:91](../../../apps/api/src/app.ts#L91) | Exact origin, JSON and PostgreSQL-backed limiting cover shopper/Wishlist paths, not Cart; generic limit list also omits Cart. |
| E10 | [packages/database/src/cart.ts:85](../../../packages/database/src/cart.ts#L85) | Opaque token hashed before lookup; ACTIVE and unexpired checks, optional row lock; no configured organization predicate. |
| E11 | [packages/database/src/cart.ts:119](../../../packages/database/src/cart.ts#L119) | Cart directly sums Inventory tables per variant; extract/reuse an Inventory-owned batched availability query. |
| E12 | [packages/database/src/cart.ts:133](../../../packages/database/src/cart.ts#L133) | Mutation guard checks variant ACTIVE and product ACTIVE/PUBLISHED; does not reuse full catalog coherence policy. |
| E13 | [packages/database/src/cart.ts:184](../../../packages/database/src/cart.ts#L184) | Read hydration joins Catalog without publication/lifecycle predicates; availability later considers price/stock only, allowing formerly published data to remain visible. |
| E14 | [packages/database/src/cart.ts:235](../../../packages/database/src/cart.ts#L235) | Per-line price and stock queries plus promotion target queries: N+1 pressure; read is not a single consistent snapshot outside mutation transactions. |
| E15 | [packages/database/src/cart.ts:326](../../../packages/database/src/cart.ts#L326) | Add is incremental, row locked, version guarded, optional platform idempotency; other mutations lack receipts; replay returns latest cart, not original outcome. |
| E16 | [packages/database/src/migrations/1000_cart.ts:10](../../../packages/database/src/migrations/1000_cart.ts#L10) | Existing carts, lines, coupons; uuidv7, numeric quantities, decimal4 price hints, unique cart+variant. customer_id exists but no account ownership, merge or retention implementation. |
| E17 | [packages/database/src/platform.ts:487](../../../packages/database/src/platform.ts#L487) | Shared unique-conflict claim and request-fingerprint protection; reuse with cart-specific outcome semantics and lifecycle. |
| E18 | [packages/database/src/pricing.ts:276](../../../packages/database/src/pricing.ts#L276) | Pricing owns effective selling and compare-at prices by organization/variant/currency/time. |
| E19 | [packages/database/src/promotions.ts:56](../../../packages/database/src/promotions.ts#L56) | Promotions owns decimal4 deterministic largest-remainder allocation with line ID tiebreaking. |
| E20 | [packages/database/src/promotions.ts:796](../../../packages/database/src/promotions.ts#L796) | Existing automatic/coupon, schedule, threshold, target, priority and exclusive/stackable evaluation; each allocation uses original gross; combined stackable cap absent in reviewed function. |
| E21 | [packages/database/src/inventory.ts:980](../../../packages/database/src/inventory.ts#L980) | Inventory owns reservations and transaction invariants. Cart add never calls reservation operations. |
| E22 | [apps/api/src/auth/shopper-auth.ts:47](../../../apps/api/src/auth/shopper-auth.ts#L47) | Separate HMAC realm secret, cookie namespace, trusted storefront origin and secondary storage; underlying IAM users/accounts shared, so realm isolation is not separate credential storage. |
| E23 | [apps/api/src/routes/shopper-auth.ts:44](../../../apps/api/src/routes/shopper-auth.ts#L44) | Verified session resolves configured storefront + active shopper account; opaque browser partition; unavailable email sender disables realm endpoints. |
| E24 | [packages/database/src/shopper.ts:16](../../../packages/database/src/shopper.ts#L16) | Verified ACTIVE IAM user maps transactionally to organization-specific customer_account and CRM customer; email alone is not Cart ownership. |
| E25 | [apps/api/src/routes/account-wishlist.ts:25](../../../apps/api/src/routes/account-wishlist.ts#L25) | Shopper resolver, private no-store, strict TypeBox boundaries and cursor pagination are reusable patterns. |
| E26 | [apps/storefront/features/wishlist/wishlist-store.ts:63](../../../apps/storefront/features/wishlist/wishlist-store.ts#L63) | Wishlist product-based membership, guest journal/account adapter, owner partition/generation and merge control exist; do not copy its entire state machine or assume pending races solved. |
| E27 | [apps/storefront/features/wishlist/components/shared-wishlist.tsx:24](../../../apps/storefront/features/wishlist/components/shared-wishlist.tsx#L24) | Public capability resolved from fragment via POST; recipient saves to own Wishlist; no actual Cart batch workflow. |
| E28 | [packages/database/src/recommendations/evaluate.ts:22](../../../packages/database/src/recommendations/evaluate.ts#L22) | Only pdp_complementary and pdp_similar placements; no cart-context evaluation contract yet. |
| E29 | [apps/storefront/components/product-page-client.tsx:65](../../../apps/storefront/components/product-page-client.tsx#L65) | Live guest get/create/add path; client-local CartView and version, no idempotency header, no successful-add commerce event. |
| E30 | [apps/storefront/app/cart/page.tsx:50](../../../apps/storefront/app/cart/page.tsx#L50) | Live page has set/remove/coupons, duplicated DTO and state; initial errors can appear empty, no centralized synchronization, checkout link and hardcoded delivery copy. |
| E31 | [apps/storefront/components/commerce/cart-drawer.tsx:33](../../../apps/storefront/components/commerce/cart-drawer.tsx#L33) | Sample drawer default items, local quantities/subtotal and shipping assumptions; conflicts with authoritative Cart, exposed through header. |
| E32 | [apps/storefront/components/layout/header-client-shell.tsx:39](../../../apps/storefront/components/layout/header-client-shell.tsx#L39) | Header mounts drawer without authoritative items or navigation callbacks; both navbars separately invoke count hook. |
| E33 | [apps/storefront/features/cart/use-cart-count.ts:13](../../../apps/storefront/features/cart/use-cart-count.ts#L13) | GET entire cart for count per hook/path/event, failures map to zero; same-window CustomEvent only, no cross-tab channel. |
| E34 | [apps/storefront/components/commerce/product-card.tsx:77](../../../apps/storefront/components/commerce/product-card.tsx#L77) | Reusable card supports optional Add action; catalog adapter supplies no concrete Cart handler or chosen variant. |
| E35 | [packages/database/src/orders/checkout.ts:36](../../../packages/database/src/orders/checkout.ts#L36) | Checkout consumes getGuestCart/CartView and fingerprints; existing functionality conflicts with assumption that Checkout has no source. |
| E36 | [packages/database/src/orders/placement.ts:428](../../../packages/database/src/orders/placement.ts#L428) | Existing order placement sets Cart CONVERTED. Do not remove status or break old consumers during Cart work. |
| E37 | [apps/storefront/features/pdp/pdp-view.tsx:297](../../../apps/storefront/features/pdp/pdp-view.tsx#L297) | PDP buy flow currently navigates to Checkout, including catch path. Cart project must gate handoff affordances without rebuilding Checkout. |
| E38 | [apps/storefront/lib/analytics/events.ts:46](../../../apps/storefront/lib/analytics/events.ts#L46) | Central vendor-neutral failure-isolated browser channel + consented internal ingestion exists. |
| E39 | [apps/storefront/lib/analytics/commerce-item.ts:38](../../../apps/storefront/lib/analytics/commerce-item.ts#L38) | Variant UUID is GA4 item ID, Meta content ID, merchant offer ID; SKU text separate. |
| E40 | [apps/api/src/routes/analytics.ts:241](../../../apps/api/src/routes/analytics.ts#L241) | GA4/Meta destination responses explicitly NOT_ACTIVE/unconfigured; declarations are not actual adapters or live acceptance. |
| E41 | [packages/database/src/analytics/wishlist/events.ts:22](../../../packages/database/src/analytics/wishlist/events.ts#L22) | Minimal domain outcome outbox events inside caller transaction; reusable pattern, not Cart implementation. |
| E42 | [packages/database/src/analytics/behavioral.ts:226](../../../packages/database/src/analytics/behavioral.ts#L226) | Browser event ingestion deduplicates org/event UUID; observations remain client-asserted, not authoritative Cart mutations. |
| E43 | [apps/worker/src/worker.ts:2](../../../apps/worker/src/worker.ts#L2) | Existing bounded leased jobs, independent runJob fault isolation, domain cleanup/report processing; no Cart cleanup handler found in reviewed scheduler. |
| E44 | [apps/admin/components/admin-shell.tsx:86](../../../apps/admin/components/admin-shell.tsx#L86) | Commerce contains Orders; Analytics already separate and capability-gated; no Cart workspace or Cart capabilities found. |
| E45 | [apps/storefront/lib/seo/route-policy.ts:59](../../../apps/storefront/lib/seo/route-policy.ts#L59) | Cart is noindex, excluded from sitemap, no structured data; actual layout also noindex. |
| E46 | [apps/storefront/next.config.ts:54](../../../apps/storefront/next.config.ts#L54) | Browser same-origin /api rewrite to Fastify localhost development; staging proxy is distinct and unverified. |
| E47 | [packages/observability/src/index.ts:18](../../../packages/observability/src/index.ts#L18) | Shared Pino redaction covers cookies/auth/tokens; API server uses it. Verify novel receipt/merge fields and error serializers in future tests. |
| E48 | [packages/database/src/commerce-foundation.test.ts:317](../../../packages/database/src/commerce-foundation.test.ts#L317) | Existing database test covers opaque carts, authority, non-reservation, add replay, stock/stale conflicts; read only, not executed this phase. |
| E49 | [docs/product-completion/current-focus.md:19](../../../docs/product-completion/current-focus.md#L19) | Preserved Wishlist local acceptance explicitly remains PARTIAL with pending owner-switch races and verification replay decisions. |
| E50 | [packages/database/src/index.ts:37](../../../packages/database/src/index.ts#L37) | One pg pool per process, Kysely transaction/raw parameterized SQL conventions; schema typings intentionally empty. |
| E51 | [docs/storefront/design-system.md:5](../../../docs/storefront/design-system.md#L5) | Storefront warm light theme differs from Admin teal/Inter dark-capable design; use each app’s established primitives. |
| E52 | [packages/database/src/migrations/0800_pricing.ts:15](../../../packages/database/src/migrations/0800_pricing.ts#L15) | Prices numeric(20,4), nonnegative; effective interval overlap trigger; exact decimal strings must remain API authority. |
| E53 | [packages/database/src/catalog-variants.ts:6](../../../packages/database/src/catalog-variants.ts#L6) | Variant lifecycle ACTIVE/ARCHIVED; option coherence and identity must come from Catalog, never product-card minimum-price inference. |
| E54 | [packages/database/src/storefront.ts:3](../../../packages/database/src/storefront.ts#L3) | Storefront uses Catalog coherence helper and ACTIVE/PUBLISHED eligibility; reusable domain policy boundary. |
| E55 | [apps/storefront/features/wishlist/components/wishlist-drawer.tsx:8](../../../apps/storefront/features/wishlist/components/wishlist-drawer.tsx#L8) | Existing Wishlist drawer is a modal interaction reference; actual accessibility acceptance remains open. |

## Architecture and ownership

Four applications: Next Storefront and Admin consume Fastify HTTP; API transport validates/authorizes and delegates domain operations to database package subpaths; Worker runs PostgreSQL-backed leased jobs and projections. Contracts are TypeScript DTOs, route validation is TypeBox, success is `{data}`, domain errors `{error:{code,message}}`. SQL is parameterized Kysely raw SQL; business mutations use transactions and optimistic versions. Shared packages also include config, core, security, observability and media. There is no reason to introduce another backend, ORM, queue, pricing engine or UI library.

Public Catalog search/read models may be cached; private Cart must bypass those caches. No centralized Cart invalidation or account-cart state is verified. Existing Storefront server/client HTTP separation and same-origin browser proxy are reusable; VPS origin/cookie/header behavior requires separate read-only and browser deployment acceptance later.

## Cart inventory and disposition

| Finding | Classification | Required direction |
| --- | --- | --- |
| Guest token generation/hash, ACTIVE/expiry, locks/version guard (E07–E16) | Reusable / Needs Modification | Retain foundations; configured tenant, account identity, receipt contract and consistent evaluation |
| `1000_cart` schema | Reusable / Needs Modification | New forward migration only; never rewrite applied baseline |
| Current add receipts | Needs Modification | Mandatory all-mutation receipts, owner binding and committed outcome replay |
| Page/PDP/count hooks | Needs Modification | Shared contracts, controller, owner epochs, error recovery and committed measurement |
| Header drawer defaults + client shipping totals | Conflicting / Obsolete production behavior | Refit same shared component; move examples explicitly to design lab fixtures |
| Catalog card optional Add | Reusable / Needs Modification | Concrete variant resolution and shared Cart command |
| Guest browser Cart localStorage authority | Missing (not found) | Do not add; only nonsecret short-lived intent recovery metadata |
| Account ownership/merge/clear/variant-change/batch/validation APIs | Missing | Build specified vertical capabilities |
| Cart admin/reporting/cleanup/outbox | Missing | Extend IAM/Analytics/Worker patterns |
| Cart-context recommendations | Missing | Recommendation-owned explicit context contract |
| Wishlist-to-Cart controls | Planned but missing | Product to explicit variant; never treat product-level save as a sellable SKU |
| Checkout/order consumers | Confirmed architectural conflict | Preserve compatibility facade/status; separately gate future checkout entry |
| Browser storage/account race acceptance in Wishlist | Requires Investigation | Reuse ownership ideas with independent Cart race tests; E49 is an open dependency risk |
| Live provider tracking/proxy/runtime versions | Unverified | Source/manifests are not deployment evidence |

## Commerce gaps and unresolved evidence

Catalog UUID variant is the sellable line identity, `(organization,cart,variant)` the uniqueness boundary. Product UUID/handle are presentation/grouping, SKU is mutable business text. Catalog options, variants, category links, publication/coherence and media remain Catalog/Media owned. Archival exists; Cart FK restricts hard variant deletion, so unavailable rows require redacted tombstones rather than silent removal.

Pricing effective definitions and Promotions are implemented. No Cart tax engine, preorder/backorder entitlement, shopper-specific promotion eligibility, or authoritative delivery promise was verified in inspected Cart/Pricing/Promotions/Storefront source. Reject unsupported policy rather than invent it. Combined promotion capping, read-time publication checks, batched availability and consistent snapshot hydration are concrete prerequisites. Stored last_seen price is advisory history, not a price guarantee.

Wishlist business-owner completion does not close technical evidence gates. Source shows guest journal, account API, sharing lifecycle, recipient save, telemetry and reporting. Product Completion still records pending races/accessibility/replay/security/recovery acceptance. Cart integration must have its own tests and preserve all Wishlist work.

## Limits

No running app/database/browser/VPS/provider account was inspected; no performance, accessibility, auth TTL or exploit result is asserted. No dependency vulnerability scan or installed-version verification was run. Missing findings are bounded to repository searches and inspected call paths, not claims about external deployments. Official security/analytics research and Meta access limitation are recorded in the respective specifications.
