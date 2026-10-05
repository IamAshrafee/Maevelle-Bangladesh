# Storefront SEO and Discovery Policy

The executable baseline is `apps/storefront/lib/seo/route-policy.ts`. Semantic server-rendered HTML, ordinary links, truthful status codes, and accessible content serve search, social, assistive, and machine consumers together; there is no separate "AI SEO" path.

| Route | Index | Canonical | Sitemap | Structured data / notes |
| --- | --- | --- | --- | --- |
| `/` | yes | self | yes | Organization/site schema may be added with final content |
| `/categories` | yes | self | yes | Breadcrumb expected in Task 2/catalog work |
| `/categories/[...path]` | yes when category exists | clean category path | yes | Breadcrumb expected; filters remain canonicalized to the category |
| `/products/[handle]` | yes when published | current parent Product handle | pending product sitemap endpoint | Product, Offer, AggregateRating/Review when visible and legitimate, FAQ, Breadcrumb |
| `/search` | no, follow | `/search` without query | no | Search/filter parameters never enter canonicals |
| `/cart` | no, follow | `/cart` | no | No commerce schema |
| `/checkout` | no, nofollow | none | no | Private workflow |
| `/orders/confirmation` | no, nofollow | none | no | Private/token or cookie context |
| `/orders/track` | no, nofollow | none | no | Customer-entered identifiers |
| `/reviews/submit` | no, nofollow | none | no | Signed-token workflow |
| `/policies/*` | yes | self | yes | Stable public information |

`robots.ts` blocks infrastructure paths (`/api/`, `/admin/`) rather than blocking public workflow URLs that need a `noindex` directive. Route metadata owns `noindex`. Marketing parameters, including UTM and future click IDs, never change canonical URLs.

The sitemap currently includes static public pages and active categories without invented `lastModified` values. Products are deliberately excluded until the API exposes an efficient published-product sitemap projection with stable handles and meaningful update timestamps; paginating the interactive search API at crawl time would be a fragile substitute.

Variant query parameters may preselect a sellable option in later PDP work, but the parent Product URL remains canonical unless a future merchandising decision intentionally creates independently indexable ProductGroup members. Structured data must match visible price, availability, ratings, and reviews. Never emit a rating or freshness value that the authoritative API did not provide.

Open Graph images use public Media `pdp` renditions. Social preview artwork and Merchant/feed endpoints remain dedicated later work.
