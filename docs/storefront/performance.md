# Storefront Performance, Freshness, and Delivery

## Targets and budgets

Core Web Vitals are evaluated at p75 on realistic mobile traffic. The external good thresholds are LCP <= 2.5 s, INP <= 200 ms, and CLS <= 0.1. Maevelle's working ambitions are LCP < 2.0 s, INP < 150 ms, and CLS < 0.05.

Budgets for page work:

- Critical catalog/product text and navigation render on the server and work before hydration.
- Add no route-wide Client Component/provider for local interaction. Pass the smallest serializable projection to islands.
- A new third-party script needs an owner, consent category, loading point after critical content, measured payload/main-thread cost, and a failure-isolation path.
- Product images always reserve dimensions/aspect ratio. Only the real above-the-fold LCP candidate is eager/preloaded; card and below-fold gallery media are lazy.
- Use Suspense only around independently useful slow regions; do not replace one blocking tree with decorative skeletons.
- Start independent server reads together and avoid context → category → product browser waterfalls.

## Freshness matrix

| Data | Current policy | Intended invalidation |
| --- | --- | --- |
| Store context/announcement | 5 minute cache | `storefront:context` tag after settings publication |
| Category navigation | 5 minute cache | organization catalog tag after category change |
| Search/catalog projection | 60 second cache | organization catalog tag after projection update |
| Product content + current price/availability | `no-store` composite read | split content and volatile commerce facts only when API contracts support it |
| Size guide | 5 minute cache | catalog/sizing publication event |
| Reviews/rating | `no-store` today | short cache plus review projection tag later |
| Policies | route/static output | deploy or content publication |
| Cart, checkout, order, tokens | private `no-store` browser workflows | never shared-cache |

The project does not enable Next Cache Components. It uses the documented previous-model `fetch` cache options and tags deliberately. Catalog cache entries are discovery hints only: Cart and Checkout revalidate authoritative price and stock.

Routes are request-rendered because the Fastify service exists at runtime, not during the standalone Storefront image build. This is deliberate SSR, not client rendering; explicit context/catalog fetch caches remain active. Revisit partial prerendering only after runtime API availability and invalidation are proven in the deployment topology.

## Media ownership

The backend Media system is the canonical optimizer. Sharp produces privacy-safe WebP `thumbnail` (320), `card` (640), `pdp` (1280), and `zoom` (2400) renditions and the API serves local immutable objects with long-lived caching. The Storefront therefore keeps `next/image` optimization disabled to avoid a second optimization hop.

- Product grid: `card`, explicit intrinsic size, lazy load.
- PDP primary candidate: `pdp`, intrinsic source dimensions/aspect ratio, eager only when it is the measured LCP candidate.
- Gallery thumbnails: `thumbnail`; zoom dialog: `zoom` only on demand.
- Alt text comes from Catalog/Media placement. Decorative duplicate images use empty alt text.
- External URL-backed assets currently receive only a five-minute proxy cache and are a delivery risk; production media should use managed object storage/CDN.

## Fonts and CSS

Next self-hosts Plus Jakarta Sans (functional UI), Playfair Display (selective editorial display), and Noto Sans Bengali (deliberate Bangla fallback), all with `display: swap`. Page work should not add families or weights casually. Task 2 owns final typography tokens and measured font payload.

Tailwind v4/PostCSS is active. `app/globals.css` is an import manifest; `styles/theme.css` contains the production semantic token contract and `styles/base.css` contains minimal document/accessibility behavior. The 3,300-line MVP stylesheet remains isolated in `styles/legacy.css` and is imported into the low-priority base layer so production utilities win. Page redesigns delete their owned legacy sections instead of growing the global dependency graph.

Task 2 added no runtime dependency and no route-wide Client Component. Foundational primitives are server-compatible except when a future feature supplies interaction. Glass remains a feature-detected, restricted surface recipe rather than a general scrolling effect. The development lab is unavailable in production.

## Delivery and security ownership

Caddy owns public routing and zstd/gzip compression. The backend/CDN owns Media cache headers; Next owns HTML/RSC/static-asset behavior. Production DNS, TLS/HSTS, CDN behavior, and real-user monitoring are deployment work and are not proven by a local build.

Security headers require coordinated testing with payments, Media and future consent-gated scripts. The intended baseline is CSP with explicit nonces/hosts, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and a minimal Permissions Policy. HSTS belongs at the TLS terminator. Do not add a permissive CSP or expose vendor/server secrets through `NEXT_PUBLIC_*` variables.
