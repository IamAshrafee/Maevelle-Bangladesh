# Task 01.1 Runtime Closure

Status: `TASK_01_CLOSED`

Validated on 2026-10-06 against Task 01 checkpoint `32d1152` and current `main` runtime. Current `main` also contains the separately committed Task 02 visual foundation; this closure did not redesign or extend it.

## Runtime environment

- Windows host, Docker Engine 29.8.1, PostgreSQL 18, Next.js 16.3.1, Fastify API, Worker, Admin, Storefront, and Caddy 2.10.2.
- Public production-like origin: `http://127.0.0.1:8080` through Caddy. Configured canonical origin: `http://localhost:8080`.
- Compose services: PostgreSQL on host `127.0.0.1:5434`; API, Worker, Admin, and Storefront on the private Compose network; Caddy on host port 8080.
- The mutable development migration baseline required `docker compose down --volumes`, a clean Compose start, owner bootstrap, and `pnpm db:seed`. The canonical seed created 49 categories and eight published products.
- Direct Storefront access inside its container serves pages, but `/api/...` returns 500 because the production Compose topology intentionally relies on Caddy for browser API routing. Server Components correctly use `http://api:3000` directly.

## Route and rendering evidence

- `200`: `/`, `/categories`, `/categories/clothing/tops/crochet-tops`, `/products/artisanal-linen-tiered-maxi-skirt`, `/search?q=linen`, `/cart`, `/checkout`, `/orders/confirmation`, `/orders/track`, `/reviews/submit`, and all four policy routes.
- `404`: an unknown general route, unknown Product handle, and invalid Category path.
- `308`: trailing-slash normalization for Category and Product routes.
- Raw initial HTML contained the global navigation and meaningful route content for Homepage, Category index, nested Category, PDP, and Privacy policy. Homepage and Category initial HTML contained product/catalog content; PDP initial HTML contained product identity, price, description, media URLs, JSON-LD, and interactive initial props.
- No critical public content required a post-hydration context/category/catalog request. Browser-side requests were limited to interactive/private workflows such as Cart and Checkout.

## Browser, navigation, and integration evidence

- Production browser checks covered 1440x900 and 390x844 viewports through Caddy.
- Desktop Product links, Category links, Search submission, Cart navigation, and Checkout continuation worked.
- Mobile navigation opened, exposed nested Category levels, closed on Escape, returned focus to the menu trigger, closed after route navigation, and had no horizontal overflow at 390 px.
- The narrow Cart indicator loaded an empty Cart, updated from 0 to 1 after adding a Product variant, survived refresh through the HttpOnly Cart cookie, and matched the persisted Cart page. Checkout loaded the same line, price, variant, and COD option.
- Browser console capture across representative routes and interactions contained no warnings or errors, including no hydration mismatch, serialization, controlled-input, or dynamic-import failures.

## Network, cache, and proxy evidence

- Caddy correctly routed Storefront HTML, `/api/...`, `/admin...`, and Media requests. API requests carried `Via: 1.1 Caddy`; no CORS workaround was required because browser calls were same-origin.
- API logs showed public Server Component requests arriving from the Storefront service at `api:3000`. Browser Cart/Checkout calls arrived through the public Caddy origin.
- Repeated Category requests produced one API Search read within the 60-second cache window. Repeated PDP requests produced two Product and Review reads (`no-store`) while Size Guide was read once under the five-minute cache.
- Root Context and Categories used the documented five-minute cache; Homepage/Search used the documented 60-second projection cache. Cart/Checkout HTML and customer API state were private/no-store.
- Seeding after an already-rendering Storefront temporarily cached an empty Category hierarchy. A container recreation cleared the persisted development data cache. Normal environment preparation must seed before Storefront traffic or explicitly invalidate/recreate the Storefront after seeding.

## SEO, robots, sitemap, and structured data

- Homepage, Category, PDP, and policy pages emitted indexable metadata and self canonicals at the configured origin.
- Search and Cart emitted `noindex, follow`; Checkout, tracking, confirmation, and review submission emitted `noindex, nofollow` without canonicals. No route emitted conflicting index/noindex directives.
- PDP emitted title, description, canonical, Open Graph URL/images, Product JSON-LD, and BreadcrumbList JSON-LD.
- Product JSON-LD parsed successfully and matched API Product identity, 12 authoritative offers, BDT price/currency, availability, and three images. No aggregate rating was emitted because the Product had no legitimate ratings. FAQ JSON-LD was correctly absent because the Product had no FAQs.
- `robots.txt` allows public crawling and blocks only `/api/` and `/admin/`. Runtime validation found and fixed its relative sitemap reference; it now advertises `http://localhost:8080/sitemap.xml`.
- `sitemap.xml` parsed as XML and contained 55 URLs: Homepage, Category index, four policies, and 49 active Categories. It contained no Product, Search, Cart, Checkout, Order, Review, private, or workflow URLs and no `<lastmod>` timestamps. Product URLs remain intentionally excluded pending an efficient published-Product sitemap projection.

## Media and fonts

- Public `thumbnail`, `card`, `pdp`, and `zoom` Media URLs resolved through the API with `200`, `image/jpeg`, and `Cache-Control: public, max-age=300`; missing valid UUIDs returned `404`.
- Seeded Products use `MIGRATION` URL-backed assets with no generated `media_renditions`, so the API truthfully falls back to the original 1200 px source for each requested rendition. The representative card source was 276,202 bytes at 1200x1235 for an approximately 173x230 display box. This is seed/media-pipeline debt, not a Task 01 Server/Client regression; owned uploaded-asset rendition generation remains a Media workflow verification item.
- `images.unoptimized` remains consistent with backend Media URL ownership. The local migration fixtures do not prove CDN behavior or optimized owned-asset renditions.
- Plus Jakarta Sans, Playfair Display, and Noto Sans Bengali were self-hosted from `/_next/static/media`; no runtime Google Fonts stylesheet/request existed. Runtime computed stacks used Plus Jakarta for body text and Playfair for the main heading, with Noto Sans Bengali in the intended fallback chain. Three WOFF2 files were preloaded (about 174 KB total).

## Measurement, bundle, performance, accessibility, and security

- Measurement remains vendor-neutral and failure-isolated: semantic event contracts, UUID event IDs, Product/SKU destination identity mapping, consent state, attribution contract, and Pixel/CAPI shared-event-ID policy are present. No vendor SDK calls were found in Storefront page components.
- Production response baseline through Caddy: Homepage TTFB about 9-10 ms, Category about 10-11 ms, and PDP about 21-26 ms on the warm local stack. Compressed HTML transfer was about 11.8 KB, 11.3 KB, and 10.7 KB respectively.
- Referenced uncompressed client JavaScript was about 579 KB for Homepage/Category and 620 KB for PDP; CSS was about 88 KB. PDP remains the heavier Client Component by design and belongs to its dedicated page task. No server-only/internal API module or secret was found in client static output.
- Lighthouse/field Web Vitals were not available in the installed browser/toolchain, so LCP, CLS, FCP, and INP/TBT were not claimed. Browser console, HTTP timing, payload, responsive, and waterfall evidence found no foundation-level performance disaster.
- Keyboard smoke passed for the visible skip link, focus transfer to `#main-content`, semantic links/buttons, mobile Escape/focus return, and representative heading hierarchy.
- Secret scan passed. Browser/static output did not expose database URLs, Better Auth secrets, encryption keys, provider secrets, Compose credentials, or `STOREFRONT_INTERNAL_API_URL`.

## Issues and disposition

### Fixed now

- `FOUNDATION REGRESSION`: made the robots sitemap reference absolute and tied it to the configured Storefront origin.

### Deferred outside Task 01

- `RUNTIME CONFIGURATION`: local development seed must precede cached Storefront traffic or be followed by cache invalidation/container recreation.
- `MEDIA DATA/WORKFLOW`: migration URL assets fall back to full-size originals because they have no owned generated renditions.
- `PLATFORM WORKER`: the Worker logs a pre-existing recovery-tick PostgreSQL `42703` missing-column error every 30 seconds. Search projection, Cart, Checkout, and tested Storefront behavior still worked; this is not caused by Task 01 and requires a separate Worker/domain investigation.
- `POST-TASK-01 LINT`: broad Storefront ESLint currently finds one unused `productId` prop in `components/reviews/review-eligibility-cta.tsx`, introduced after the Task 01 checkpoint. Task 01-focused ESLint passed.
- `PAGE TASKS`: PDP/Checkout/Reviews Client Component size and the disposable MVP page implementations remain assigned to their dedicated future tasks.
- `PRODUCTION HARDENING`: external CDN, TLS/HSTS, live analytics destinations, production cookies/domains, and real-user monitoring were not exercised locally.

## Verification commands

- `docker compose up -d --build`
- `docker compose down --volumes` and `docker compose up -d`
- `pnpm db:seed`
- HTTP route/status/header/source checks through `http://127.0.0.1:8080`
- production browser route, console, desktop/mobile, Cart, Checkout, keyboard, and navigation checks
- `pnpm exec tsc --build packages/contracts apps/storefront --pretty false`
- 18 focused Storefront SEO, analytics, catalog-query, and design-token tests
- Task 01-focused ESLint
- `pnpm --filter @maevelle/storefront build`
- `pnpm check:architecture`
- `pnpm check:secrets`
- `git diff --check`

The Task 01 architecture works through the production-like Caddy topology, public content is server-rendered, interactive Cart/Checkout integration remains functional, and no critical Task 01 regression remains. Final status: `TASK_01_CLOSED`.
