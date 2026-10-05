# Storefront Architecture

## Ownership

- `apps/storefront/app`: routing, route metadata, loading/error/not-found boundaries, and composition only.
- `apps/storefront/components/ui`: future low-level reusable storefront primitives. Task 2 owns the visual system and representative primitives.
- `apps/storefront/components/layout`: global server-rendered shell compositions.
- `apps/storefront/components/navigation`: narrow interactive navigation islands.
- `apps/storefront/features/<domain>`: domain-specific components, state, and helpers. Feature code stays local until reuse is demonstrated.
- `apps/storefront/lib/api/server`: server-only reads of Fastify APIs, API-envelope validation, errors, and cache policy.
- `apps/storefront/lib/api/client`: browser request/error normalization for interactive mutations.
- `apps/storefront/lib/seo`: canonical URL, route policy, and safe structured-data construction.
- `apps/storefront/lib/analytics`: vendor-neutral commerce identity, consent, and browser event hand-off.
- `apps/storefront/lib/media`, `format`, `env`: focused cross-feature utilities.
- `apps/storefront/styles/legacy.css`: quarantined MVP page styling. New page-specific CSS must not be added here.
- `apps/storefront/styles/theme.css` and `base.css`: the canonical Tailwind v4 visual tokens and minimal document/accessibility foundation. See `docs/storefront/design-system.md`.
- `packages/contracts`: types shared across browser, server rendering, API, and future measurement workers.
- `packages/ui-storefront`: intentionally remains empty until components have genuine cross-application reuse. App-local brand UI does not move there merely for symmetry.

Avoid barrel files on hot client paths. Import implementation files directly so dependency and bundle boundaries remain visible.

## Server and client model

Server Components own store context, navigation categories, initial catalog/search results, product content, policy content, metadata, and structured data. React `cache()` deduplicates identical reads during one render. Server code calls Fastify directly through `STOREFRONT_INTERNAL_API_URL`; it does not loop through the public Next/Caddy route.

The root shell is request-rendered because Fastify is a separate runtime service and is not available during the Storefront image build. Explicit `fetch` cache windows still reuse safe public reads across requests. This avoids binding a container image to build-time database/API availability while preserving server-rendered HTML.

Client Components are limited to mobile navigation state, cart count, PDP option/gallery/cart interaction, reviews interaction, checkout, order tracking, and other browser workflows. The current PDP, Cart, Checkout, order confirmation/tracking, and review submission clients are retained because they contain real interaction behavior; they should be decomposed during their dedicated page tasks rather than mechanically converted.

The global `StorefrontContextProvider` was removed. It previously forced hydration and a serial browser chain of context, categories, then products. Shared public context is now server data; client mutations receive only the identifiers they need.

## Data access and errors

`requestStorefrontApi` is the server boundary. It resolves the internal origin, requests JSON, verifies the `ApiEnvelope`, and throws `StorefrontApiError` with normalized status/code semantics. Catalog functions own endpoint construction and freshness. `requestStorefrontClient` provides the corresponding browser envelope/error boundary.

Public catalog contracts live in `@maevelle/contracts`. Backend price, stock, cart, checkout, and order operations remain authoritative. Rendering cached discovery data never bypasses mutation-time validation.

Failure classes are intentional:

- Product identity, price, and purchasability are critical and fail the route or mutation visibly.
- Reviews and recommendation-like enhancements are optional and must not take down the product core.
- Analytics is observational and never awaited by core commerce.

## Component layers

1. UI primitives: accessible Button, IconButton, Container, VisuallyHidden, form controls, skeletons. Task 2 owns their first visual contract.
2. Commerce primitives: Money/Price, rating, availability, quantity and option controls.
3. Patterns: ProductCard/Grid, Breadcrumbs, filters, empty/error states.
4. Compositions: Header, navigation, Footer, CartDrawer, ProductGallery.
5. Route features: page-specific orchestration under `features` or route-local `_components`.

Prefer composition and named variants to boolean prop growth. Keep feature components local until two credible consumers need the same behavior.

Task 2 established the first production primitive set under `components/ui`, `components/layout`, and `components/commerce`. These remain app-local because the Maevelle Storefront identity is not a brand-neutral monorepo UI package.

## Current keep/refactor/replace decisions

- KEEP: shared contracts, Fastify storefront endpoints, authoritative Cart/Checkout operations, Media renditions, product/review SEO builders and focused tests.
- REFACTOR: header/context and catalog reads are now server-first; API, SEO, analytics, media, and formatting responsibilities have explicit homes.
- REPLACE: the root-level client provider and client-only initial catalog waterfall were removed.
- REMOVE LATER: quarantined demo selectors in `styles/legacy.css` as each real design replaces its page.
- DEFER: full PDP, Cart, Checkout, Reviews visual/component decomposition; those are dedicated feature tasks with higher regression risk.

## Quality gate

For storefront architecture changes run focused Vitest files, `tsc` for the Storefront/contracts graph, focused ESLint, `git diff --check`, and `pnpm --filter @maevelle/storefront build`. Browser/mobile and owner visual review remain separate evidence.
