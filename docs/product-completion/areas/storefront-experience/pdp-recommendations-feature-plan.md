# Product recommendations — feature plan

**Status:** PDP discovery implementation added locally; owner quality review and staging browser verification remain open. See the [implementation plan](pdp-recommendations-implementation-plan.md).
**Prepared:** 2026-10-30.
**Primary experience:** Storefront product detail page (PDP).
**Product intent:** Help a shopper find a better alternative or a genuinely complementary item, while giving Maevelle's operators reliable merchandising control and a path to measure results.

This plan reflects the owner's attached recommendation conversations and the current repository. The current work is the complete **PDP recommendation discovery capability**: contextual ranking, merchandising, public display, and honest discovery measurement. The owner will work on Wishlist, Cart, and Checkout as separate product areas later; this task will not change their behavior or implement purchase attribution. Existing code in those areas remains relevant to eligibility and future integration. The linked implementation plan sets the migration, contract, query, file-ownership, sequencing, and verification direction. Historical MVP/phase labels do not limit the quality of the current capability.

## 1. Current-system assessment

| Area | Current evidence | Consequence for this feature |
| --- | --- | --- |
| PDP | `apps/storefront/app/products/[handle]/page.tsx` takes up to six items from a generic, cached catalog search; `features/pdp/pdp-cross-sells.tsx` renders a single “Complete Your Look” grid and substitutes six hard-coded external-image examples when no items are passed. It labels results “Curated.” | Replace generic selection, unsupported curation claims, and example fallback with real eligible recommendations. Separate similar and complementary purposes. |
| Public catalog | `catalog.products`, variants, categories, tags, occasions, collections, product/variant attributes, colors, and Media placements exist. Public Product reads require active/published state and coherent active variants. | Reuse canonical product identity and structured catalog signals; define a normalization/quality policy where metadata is sparse. |
| Search | `search.catalog_documents` is a rebuildable projection fed from Catalog/Pricing/Inventory changes through outbox processing. It includes categories, a minimum price, and a projected availability flag. | It can help find bounded candidates, but projection values alone cannot be the final price or sellability authority. Its current schema has no full attribute or compatibility index. |
| Price and stock | The public Product API resolves variant prices from Pricing. Catalog's public variant projection checks inventory levels; Cart/Checkout own final purchase validation. Products and variants also have `DENY`/`CONTINUE` inventory policies. | Define recommendation eligibility against actual purchasability, including policy, active variant, current price, and available stock. Show current display price; never use a fabricated zero price. Revalidate again at cart/checkout. |
| Admin | Product list, create, detail, and edit routes exist; `catalog.view`, `catalog.manage`, and `catalog.publish` are existing capabilities. Team & Access is the authority for grants. | Put per-product merchandising in Product editing and an overview/configuration workspace in Admin; apply explicit capability checks to every operation. |
| Analytics | Shared `CommerceEventDto` includes list view, product selection, cart, and order events. The browser bus is consent gated and failure isolated; `analytics.storefront_events` deduplicates event IDs. Orders, delivery, payment, and refunds are authoritative for business outcomes. | Extend the existing semantic measurement path with placement/request/item context. Do not count API responses as impressions or order creation as realized COD revenue. |
| Delivery | Storefront Product reads use `no-store`; catalog search has a 60-second tagged fetch cache. The worker processes search projection outbox changes. | Keep recommendations independent of the primary PDP read, and design freshness for publication, configuration, price, and stock changes. No new service is required. |
| Shared commerce UI and later work | `components/commerce/product-card.tsx`, Price/Money, Media and `WishlistButton` already exist. Cart and Checkout have routes and backend workflows. Wishlist has a local-storage UI with sample items and a simulated move-to-bag action; ProductCard currently renders a heart even without a persistence callback. | Reuse and, if necessary, extend the shared ProductCard. Recommendation cards must not present a misleading wishlist or quick-add action. Do not create replacement Cart/Checkout/Wishlist modules. |

The Product Completion V2 state currently tracks Fit & Sizing owner review and Customer 360 work. This new plan changes neither their evidence nor their completion status.

## 2. Customer experience

### PDP placements

1. **Complete Your Look (`pdp_complementary`)** suggests products that work with the viewed item as an additional purchase. Show a small set near the buying context when the layout supports it; otherwise place it immediately after the main product content. Default target: up to two or three distinct products.
2. **You May Also Like (`pdp_similar`)** suggests credible alternatives to the viewed product. Put it after details and reviews. Default target: up to four distinct products.

Each section has its own heading, item count, strategy, and empty behavior. It renders only when at least one useful eligible item exists. A smaller relevant list is preferable to filler. A product may appear in only one of these two PDP sections in the same response, with complementary placement taking priority after explicit pins are evaluated. The current product, another SKU of the same Product, and duplicate cards never appear. If a later product-group concept is introduced, its canonical grouping can extend diversity without guessing relationships from names.

Cards use the existing ProductCard, Price/Money, and Media rendition conventions; current product identity, handle, image, currency, price, and availability come from authoritative public projections. In this task, recommendation cards provide a clear accessible link to the Product. The shared card must support omitting wishlist/quick-add controls when no real action is wired; a cosmetic heart toggle or pretend bag action is unacceptable. Claims such as “Bestseller,” “Trending,” “Frequently Bought Together,” “Curated,” or a specific matching reason appear only when the underlying evidence or operator action supports them. A plain section heading is sufficient otherwise. No unavailable item should imply that it can be purchased immediately. The entire PDP and existing purchase flow remain usable when recommendation retrieval or tracking fails.

The layout must work at mobile, tablet/iPad, intermediate, and desktop widths, including longer Bangla/English titles, touch, keyboard, screen reader, reduced motion, and orientation changes. Reserve card geometry to prevent layout shifts; load below-fold media lazily. Horizontal scrolling, if used on mobile, needs visible controls and keyboard access. No recommendation retrieval waterfall may delay the primary product content. A failed or empty optional section should disappear cleanly rather than show fake products or a customer-facing error for an internal ranking failure.

### Other experiences using the same capability

Placements are stable public identifiers separate from ranking strategies. The capability must be able to serve cart add-ons, home discovery, product alternatives, or an operator-assisted recommendation surface later through placement-specific rules. “Shop the Look” is a distinct coordinated-merchandising and multi-add workflow; it may reuse relationships and retrieval but is not silently treated as a PDP carousel. Recently viewed is a browsing-history feature with its own privacy/storage rules. Genuine frequently-bought-together and customer personalization require their own evidence and consent rules. These are identified extension points, not current PDP labels or claims.

## 3. Recommendation behavior

### Eligibility is a hard gate

For every placement and every manual or automatic candidate, require the same organization; a distinct canonical Product; active and published Product state; coherent active variants; current public Media fit for a card or an explicit approved placeholder policy; a current displayable price in the Storefront currency; and a currently purchasable variant under the authoritative Pricing, Inventory, and inventory-policy semantics. Default PDP policy is sellable-only. Do not expose private, archived, unpublished, broken, excluded, or cross-organization products. Pins and boosts never bypass these gates. Decide whether a `CONTINUE` backorderable item counts as sellable by following the actual Cart/Checkout semantics, not a second rule invented here.

Validate both the source Product and targets at request time. An unavailable pinned target is skipped, shown as an actionable issue in Admin, and replaced only by eligible fallback candidates. Public cards must not rely solely on the possibly stale `search.catalog_documents.available` or `minimum_price` fields. Cart/Checkout remain the final authorities if stock or price changes after display. An out-of-stock discovery or stock-notification experience belongs to its own explicit workflow; it is not enabled by a recommendation setting that makes an unavailable card appear buyable.

### Candidate and ranking policy

Use one reusable recommendation capability with placement-specific candidate sources and scoring. Candidate collection is bounded and organization scoped. The first version uses structured data and explicit human relationships; it does not need ML or an external recommendation service.

- **Similar:** prioritize shared specific categories/product type, meaningful attribute values, color family, material, style, occasion, collection, and a sensible relative price band. Broad categories alone should not force weak matches.
- **Complementary:** prioritize explicit directed curation and deliberate compatibility rules across product types/categories, then shared aesthetic signals such as color family, collection, style, or occasion. Merely sharing a category must not be interpreted as “pairs well.” When structured compatibility is absent, return curated matches or no section rather than inventing a pairing.
- **Merchandising:** support ordered pins, bounded boosts, and exclusions per source Product and placement. Exclusion wins; eligible pins outrank automatic candidates; boost changes rank without guaranteeing inclusion. Global placement defaults can be overridden for a Product without copying unrelated settings.
- **Quality and diversity:** apply a minimum relevance threshold, avoid near-duplicate designs, cap concentration in one category/collection where appropriate, and give new products a fair chance without claiming sales popularity. Tie-breaking is deterministic for the same Product, configuration, and catalog context.
- **Fallback:** progressively relax noncritical similarity criteria within a placement's purpose. Never cross from complementary to random catalog products, fill a fixed count with irrelevant items, or make unverifiable popularity claims. Return fewer products or none when necessary.

Scoring configuration must have safe operator bounds, sensible defaults, a versioned strategy identity, and an explainable Admin preview. Margin or sales weight may aid tie-breaking only after relevance and eligibility; it cannot displace clearly better matches. Genuine order co-purchase signals may be introduced as one candidate source once sample size, returns/cancellations, and fraud filtering make them trustworthy. They must be labeled “Frequently Bought Together” only when that claim is supported.

## 4. Operator workflows

### Product-level management

From Product edit/detail, an authorized operator can inspect both placements, search a paginated eligible Product picker, pin and reorder targets, apply a boost or exclusion, remove/reinstate a relationship, choose automatic/hybrid/manual behavior where appropriate, and preview the resulting Storefront order. The same target cannot be assigned conflicting active actions in one placement. The interface explains why a configured item is omitted (publication, price, stock, invalid variant, exclusion, or missing source data). Saved changes have clear success/error feedback; stale concurrent edits produce a recoverable conflict rather than silent overwrite. Reordering must have keyboard and touch-friendly controls, even if drag and drop is offered.

The Product list/workspace should show recommendation coverage and actionable missing-data/invalid-pin cues without blocking Product publication solely because no useful recommendation exists. Draft Products can be curated in advance, but public results appear only for published source Products. Bulk operations should support applying/removing a deliberate set of rules to a selected, bounded Product set, with preview and conflict/error reporting; bulk changes must not overwrite unrelated per-product choices.

### Global management

A Recommendations workspace provides placement enablement and target counts, bounded strategy weights/thresholds, compatibility vocabulary or rule management, fallback and freshness policy, searchable coverage/quality worklists, performance by placement, and operational health. The operator can preview a Product/placement against pending changes before saving. Configuration changes retain version, actor, time, and before/after audit evidence. Strategy tuning and global policy require a more privileged capability than ordinary per-product curation if the existing `catalog.manage` grant is too broad; the implementation plan must select or add capability definitions in Team & Access and assign them intentionally. Reporting uses `analytics.view` or the relevant financial capability, never edit permission alone.

## 5. Domain and data boundaries

Recommendations own placements, strategy configuration, directed Product relationships/actions, and evaluation explanations. Analytics owns discovery observations and reporting; Catalog owns Product/variant identity and structured descriptors; Pricing owns price; Inventory and Cart/Checkout own sellability; Media owns renditions; Orders/Delivery/Payment/Refunds own conversion state. Recommendations must not copy these systems' truth into an independently editable product, price, or stock table.

Persist only configuration and relationships that need operator ownership, with organization-scoped Product foreign keys, source != target constraints, unique active action semantics, position/priority bounds, versioned writes, timestamps, and actor/audit linkage. Relationship direction is explicit. Similar relationships need not be bidirectional by default; complementary relationships are directional. Existing audit, outbox, and analytics facilities should be reused. A new durable event or materialized candidate structure is justified only where existing tables cannot express measured discovery or retrieval needs. If schema is added, use a new Kysely migration and preserve staging data during normal deployment.

The public API should retrieve both PDP placements in one bounded request, using the current `/storefront/v1` conventions and `{ data }` envelope. Its stable contract includes source Product identity, placement identifiers, ordered display-ready cards, a request/evaluation identifier for discovery measurement, and strategy version. It should reuse shared Storefront item and money/media types rather than introduce an incompatible second card model. It must not expose internal scoring weights, unpublished Product details, sensitive visitor identifiers, or private Admin explanations. Admin APIs separately support paginated picker/coverage queries, configuration/relationship writes, conflict versions, previews with explanations, and performance. Public and Admin input/output schemas and structured error semantics belong in `@maevelle/contracts` and Fastify boundary validation.

## 6. Measurement, privacy, and later commerce attribution

Record a placement impression only when items actually enter the visible viewport, not when the API responds or an offscreen section mounts. Deduplicate repeat visibility within a defined page/placement/request context. Record the selected Product and position on click and subsequent Product-page visit where the current event system supports it. Browser events are consent gated and best effort through `lib/analytics`; tracking failure cannot block shopping. Keep identifiers pseudonymous and validate event payloads server side, including rate/abuse controls.

Extend the current `PRODUCT_LIST_VIEWED` and `PRODUCT_SELECTED` semantic events with placement/request/position context only where their contracts lack it. Do not create a second vendor-specific event path. Current reporting shows visible impressions, clicks, CTR, placement/Product coverage, and available Product-page continuation, with explicit denominators and consent coverage. It must not label these observations as purchases or increased sales. When the owner takes up Cart/Checkout, a separate integration will carry exact item-level recommendation context through a successful Cart add and Order placement. That later work must distinguish attributed orders from realized revenue: COD creation is not payment, and completed/earned value follows authoritative delivery, payment, return, and refund state. Attributed value is not incremental lift.

Consent-denied and consent-unknown sessions should still receive contextual, nonpersonalized recommendations. Future customer-specific ranking needs a separate consent and privacy design. Reporting should distinguish measured (consented) traffic from total served requests and disclose coverage limits.

## 7. Performance, freshness, and failure behavior

Candidate retrieval must be bounded, indexed for actual organization/source/placement access, and measured with representative catalog volume. Request output is capped; no full-catalog scoring or per-card price/inventory query waterfall. The first implementation can calculate on demand with efficient SQL and application ranking. Cache stable candidate IDs/configuration if useful, but perform final publication, variant, price, and purchasability checks against current authority before response. Outbox-driven invalidation/rebuild can follow existing search patterns; a worker-precomputed candidate snapshot is an optimization only after profiling shows the need. No new infrastructure is presumed.

Keep retrieval independent of the main Product page. A timeout or failure hides the optional sections or uses a verified eligible fallback and records diagnostics; it never blocks the main PDP, add-to-cart, or checkout. Admin preview surfaces errors rather than silently claiming success. A rapid navigation to another PDP must not allow an earlier response to overwrite the current Product's recommendations. Product unpublication, category/attribute changes, price changes, stock changes, and merchandising edits must have an explicit freshness path; candidate caching must never make an ineligible item purchasable.

## 8. Acceptance outcomes

The PDP discovery capability is complete when current evidence demonstrates all of the following:

1. The two PDP placements communicate their different purposes and return relevant, distinct, currently eligible Products, including for new Products with no order history.
2. Sparse catalogs return a shorter list or omit a section; no generic filler, fake Product, stale price, unsupported badge, self-reference, or cross-organization result appears.
3. Manual pin, reorder, boost, exclusion, per-Product strategy, and global policy behave predictably, with preview explanations, bulk handling, version conflicts, audit evidence, and capability enforcement.
4. Structured catalog data and explicit compatibility drive bounded deterministic ranking; eligibility cannot be overridden by merchandising. Product/variant, price, stock, policy, and Media edge cases have focused proof.
5. The public API has stable typed contracts and safe metadata. The Admin API validates inputs, isolates organizations, paginates growing lists, and returns recoverable errors.
6. Mobile, tablet, and desktop PDPs support touch, keyboard, screen readers, content growth, loading, empty, and failure states without layout shift or a blocked primary purchase path.
7. Visible impressions and clicks are deduplicated and consent aware; discovery reporting has honest denominators and does not claim revenue. Analytics failure is isolated.
8. Candidate retrieval, query plans, cache/freshness behavior, and failure paths pass focused tests and representative-volume checks. A staging deployment verifies migrations, services, API health, and browser behavior when that deployment is undertaken.

Owner review of recommendation quality and responsive/accessibility behavior remains a distinct acceptance step. A CI build or a checked list alone does not prove a successful staging release. Completing this PDP discovery gate does not mark recommendation-to-Cart/Order attribution complete; that integration remains explicitly open for the later Cart/Checkout work.

## 9. Implementation-plan decisions to settle next

- Exact placement/configuration/relationship schema and whether existing analytics tables can carry placement-level discovery events without a new table.
- Exact canonical card DTO and display-price rule when a Product has multiple variant prices, missing prices, or `CONTINUE` inventory policy.
- Which structured attributes are already populated sufficiently for similar matching; which cross-category compatibility vocabulary/operators need to author first.
- Explicit scoring defaults, minimum relevance threshold, candidate cap, diversification order, and deterministic tie breakers, validated with real seed/catalog examples.
- Capability split between per-product merchandising and global strategy; migration/grant behavior for existing memberships.
- Whether recommendation retrieval is a separately streamed Server Component or a small client island, using the project's actual Next.js runtime/cache model.
- Discovery analytics context through ProductCard/PDP, consent, deduplication window, retention, and reporting definitions; leave Cart/Order transport for the separate commerce integration.
- Focused migration/deployment order and rollback compatibility for API, Worker, Admin, and Storefront.

These are design decisions for implementation. The deliberately separate Cart/Order attribution integration must remain visible as unfinished work, not be described as delivered by this PDP task.
