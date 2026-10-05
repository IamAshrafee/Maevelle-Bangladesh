# Storefront Architecture Foundation

## Evidence status

`LOCAL_VERIFICATION_COMPLETE / OWNER_REVIEW_PENDING`

Baseline: `3393e19`; implementation is currently an uncommitted worktree checkpoint.

## Completed foundation

- Server-rendered Storefront context, primary navigation, initial catalog/search/category content, PDP product content, reviews, and size-guide input.
- Narrow client islands for mobile navigation, Cart count, and retained interactive commerce workflows.
- Typed `lib/api/server` and `lib/api/client` boundaries plus shared Storefront search and measurement contracts.
- Tailwind CSS v4/PostCSS enabled; MVP CSS isolated in `styles/legacy.css` for page-by-page removal.
- Plus Jakarta Sans, Playfair Display, and Noto Sans Bengali loaded through `next/font`.
- Executable route indexability policy, canonical cleanup, workflow `noindex`, category sitemap support, safe structured data, and no fake sitemap timestamps.
- Backend Media rendition ownership documented and centralized media URL construction established.
- Versioned semantic commerce event, consent, attribution, destination identity, and browser event-bus foundation established without vendor SDKs.
- Storefront-specific agent rules and architecture, SEO, performance, and measurement documentation added.

## Verification

- Storefront/contracts TypeScript build: passed.
- Focused Storefront tests: 7 passed across SEO, catalog URL parsing, and measurement identity/consent.
- Focused ESLint: passed.
- Storefront Next.js production build: passed; content routes and sitemap are request-rendered, robots remains static.
- Architecture check, secret scan, and `git diff --check`: passed.
- Docker was available but no local services were running, so browser/mobile/Caddy/API integration was not performed.

## Next resume point

Run owner/browser review against `http://127.0.0.1:8080`, then start Task 2 Design System / Visual Foundation. Use `docs/storefront/*` and `apps/storefront/AGENTS.md` as the durable implementation contract. Do not present the real page designs, vendor analytics activation, Product/PDP decomposition, Cart, or Checkout redesign as complete.
