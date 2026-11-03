# Cart SEO, performance and scalability

## Existing evidence and SEO contract

Cart metadata/SEO policy already noindex/follow and exclude sitemap (audit E45); sitemap contains public static/categories only. Private Cart summaries/views/receipts/errors require `private, no-store` at API, same-origin proxy and any future server render. Never put personal Cart content in static generation, public cache or shared request memoization keyed only by URL. Keep /cart canonical free of tracking/query parameters; no token URLs, no Product/Offer structured data on Cart. Robots exclusions are discovery controls, not authorization. Public product canonicals and Product structured data stay owned by public PDP. No Checkout/purchase schema or fabricated delivery offer in Cart.

## Frontend performance

One lightweight client controller/subscription per layout; one coalesced summary request per owner/focus transition, not one full-cart fetch per navbar. Header server markup remains public and cookie-independent; reserved badge dimensions prevent CLS. Fetch full Cart only drawer/page/explicit command needs it, dedupe concurrent reads. Lazy-load drawer, variant picker and recommendations; preserve useful public RSC catalog/PDP content without Cart hydration. Summary and full response must carry same version/owner contract; never compute authoritative totals in browser.

Optimistic quantities/counts labelled pending, confirmed rollback baseline, no optimistic money guarantee. Abort stale reads, owner epochs and nondecreasing revision/evaluation guard; coalesce unsent desired sets, never issued increments. Broadcast invalidation sends no private payload; focus revalidation instead of constant background polling. Slow/offline mobile preserves input and last confirmed state labelled stale, with bounded retry honoring Retry-After. Preload no private Cart data into public page HTML. Media uses existing card/thumbnail renditions with dimensions, never original assets; no new remote image host dependency.

## Database and Worker budgets

Batch Catalog/Media hydration, Pricing resolution and Inventory availability; fixed snapshot/time and bounded promotion candidates. Initial performance budget: summary <=5 queries, full 100-line evaluation <=12 queries including bounded owning-domain batches, mutation <=15 queries excluding fixed receipt/outbox plumbing. These are proposed measured budgets, not current results; current per-line N+1 path (E14) does not satisfy them. Promotion target loading must be batched across selected promotions, not one query per candidate. Never run Promise.all of 100 individual queries and call that batching.

Indexes: scoped Cart owner partial unique, active expiry/activity, lines by cart and variant, receipt identity/expiry, merge account+intent, outbox/projector status. Use EXPLAIN ANALYZE on synthetic volume later, inspect row estimates, buffers, sort spills and lock wait. Do not add speculative indexes to every column. Cart cap enforced under lock, no concurrent count bypass. Bound statement/lock timeouts; deterministic lock order; pool headroom shared across request/Worker load. Worker <=100 carts/event batch and explicit time budget, SKIP LOCKED/rechecked expiry, progressive checkpoints, poison-event isolation and attempt cap. Rebuild jobs do not monopolize API pool or alter Cart authority.

## Proposed validation objectives (not achieved measurements)

| Workload | Objective | Method / failure gate |
| --- | --- | --- |
| Core Web Vitals | mobile p75 LCP <=2.5s, INP <=200ms, CLS <=0.1 | Compare catalog/PDP/cart before/after; synthetic mobile plus later consented field metrics |
| Cart summary | p95 <=150ms, p99 <=400ms API duration | Warm realistic tenant, 100 concurrent active shoppers |
| Full Cart <=100 lines | p95 <=300ms, p99 <=800ms | Mixed 1/10/100-line, price/promotion/stock churn |
| Mutation | p95 <=400ms, p99 <=1s | 50 req/s mixed operations initially; separate same-Cart hotspot |
| Error/lock pressure | <1% unexpected 5xx; no unbounded queue or leaked connection | Distinguish expected 409/422/429 from failures; fault injection |
| Global Cart code | target <=10KiB gzip incremental eager controller; drawer deferred | Bundle report before/after; investigate meaningful public-page regressions |
| Worker cleanup | <=100 rows/batch, no active Cart deletion or starvation | Overlap API writes, pause/restart process, poison rows |

Vitals thresholds follow [Google Search Central](https://developers.google.com/search/docs/appearance/core-web-vitals), consulted 2026-11-02. API/bundle/load numbers are Maevelle design hypotheses, not provider standards or measured capacity. Establish baseline machine/CPU/memory/pool/network/fixture size with results before accepting. Use 10k catalog variants and 100k Cart fixtures, skew toward hot variants and overlapping same-account requests, normal storefront concurrency, stale views, abuse, degraded DB and slow mobile. Tune objectives from measured VPS resource constraints without weakening correctness or hiding bad tails.

## Growth decisions

Start PostgreSQL + existing Worker, no Redis/Kafka/WebSockets/search stack for Cart. If indexed/batched queries exceed p95 or pool/CPU budgets under representative sustained load, optimize hottest query/snapshot shape first. Precompute anonymous aggregate dashboards asynchronously; cache only public Catalog or safe product/pricing metadata with invalidation/versioned evaluation, never owner snapshots in a public cache. Add dedicated pool/read replica for analytics only when demonstrated contention justifies it; preserve authoritative mutation reads on primary. Partition historical events/retention only after measured data size/maintenance warrants it. Horizontal API instances require shared PostgreSQL quotas/receipts from day one; do not rely on per-process map for public Cart limits.

Acceptance S34/S38/S48/S53–S55; 07A measurements and 07B real mobile/UI behavior, 08 integration. No benchmarking, runtime browser test or infrastructure change performed during Phase00.
