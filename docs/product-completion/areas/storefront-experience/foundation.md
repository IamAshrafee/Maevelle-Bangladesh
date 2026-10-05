# Storefront Architecture and Visual Foundation

## Evidence status

`LOCAL_VERIFICATION_COMPLETE / OWNER_REVIEW_PENDING`

Architecture checkpoint: `32d1152`; Task 02 implementation checkpoint: `f551bde`.

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

## Completed Task 02 visual foundation

- One canonical Tailwind v4 semantic token system for brand, surfaces, content, borders, actions, status, type, shape, elevation, layout, and motion.
- Production Plus Jakarta Sans, Playfair Display, and Noto Sans Bengali use-site mapping, including intentional `lang="bn"` behavior and tabular Taka price presentation.
- Mobile-first `Container`/`Section` layout rules with 16 px mobile gutters, 24 px desktop gutters, and a 1240 px main maximum.
- Server-compatible Button, IconButton, Badge, Chip/choice/swatch, native form, Field, selection, Surface, Notice, loading, typography, accessibility, and Money/Price primitives.
- Visible focus, skip navigation, reduced-motion behavior, 48 px primary touch targets, semantic feedback pairs, and focused WCAG contrast assertions.
- Development-only `/design-system` lab covering English/Bangla/mixed type, prices, important component states, responsive behavior, surfaces, forms, and loading. The route is `noindex` and unavailable in production.
- MVP CSS remains quarantined in the Tailwind base layer; production utilities win and no new page styling was added.
- Canonical human-readable contract in `docs/storefront/design-system.md`; missing approved design artifacts and the berry choice are truthfully owner-flagged.
- No new runtime or development dependency.

## Verification

- Storefront/contracts TypeScript build: passed.
- Focused Storefront tests: 7 passed across SEO, catalog URL parsing, and measurement identity/consent.
- Focused ESLint: passed.
- Storefront Next.js production build: passed; content routes and sitemap are request-rendered, robots remains static.
- Architecture check, secret scan, and `git diff --check`: passed.
- Task 02 focused verification: Storefront TypeScript, focused ESLint, 11 token/contrast tests, production build, architecture check, secret scan, and `git diff --check` passed.
- Development lab browser smoke passed at 390 px and 1440 px: 16/24 px gutters, 1240 px desktop container, no horizontal overflow, 48 px default controls, correct computed Plus Jakarta/Playfair/Noto Bengali fonts, and visible keyboard skip-link focus.
- Browser checks used the development lab at `http://127.0.0.1:3100/design-system`; the running Docker Storefront image was not rebuilt for this task.

## Next resume point

Compare `/design-system` with the approved design artifact when it is available and confirm the owner-flagged primary berry decision. Then start the production Global Shell/Header/Footer task, followed by Homepage and the remaining page-specific designs. Do not present Homepage, Catalog, PDP, Cart, Checkout, Reviews, or vendor analytics as visually complete because the foundation now exists.
