# Storefront Engineering Rules

These rules apply inside `apps/storefront` in addition to the repository root instructions.

- Build public routes as React Server Components by default. Add a Client Component only for browser APIs, stateful interaction, event handlers, or interactive forms.
- Keep route files thin. Put reusable brand-neutral primitives in `components/ui`, global compositions in `components/layout` or `components/navigation`, and domain work in `features/<domain>`.
- Fetch public data through `lib/api/server`; browser mutations go through `lib/api/client`. Do not call a local Next route merely to reach the Fastify API from a Server Component.
- Import shared API and commerce types from `@maevelle/contracts`. Never duplicate backend business rules, price calculation, availability, authorization, or order truth in the storefront.
- Treat URL search parameters as the durable source for catalog filters, sort, and pagination. Initial indexable content must be useful without hydration.
- Use Tailwind utilities for new component/page styling and existing shared primitives before creating new ones. `app/globals.css` is limited to Tailwind imports, tokens, and base rules. `styles/legacy.css` is quarantined MVP styling to remove during page redesigns, not a destination for new selectors.
- Treat `docs/storefront/design-system.md` and `styles/theme.css` as the canonical production visual contract. Use semantic tokens and existing `components/ui`, `components/layout`, and `components/commerce` primitives; do not invent raw colors, radii, shadows, component variants, or competing token names.
- **Single Source of Truth for Reusable Components:** Always update, evolve, and elevate shared reusable components (in `components/ui`, `components/commerce`, `components/layout`) directly instead of creating one-off inline variants inside drawers, pages, or feature modules. Every shared pattern (such as `QuantityStepper`, `Price`, `Money`, `SortDrawer`, `CartDrawer`, `Button`, `IconButton`, `Chip`, `Badge`, `PhoneInput`, `Toggle`) must have a single authoritative component implementation, and all parent surfaces must consume that shared component. If a design requires a new size, styling variant, or interaction state, add it as a clean variant or prop to the shared component rather than duplicating markup in parent files.
- Do not add page CSS, static inline styles, `transition-all`, or routine arbitrary Tailwind values. A narrow dynamic style such as a backend-provided color swatch is allowed. Keep the storefront light-theme only until the product direction changes.
- Plus Jakarta Sans owns functional UI, Playfair Display is editorial-only, and Bangla content uses Noto Sans Bengali with `lang="bn"`. Use shared Money/Price presentation for formatted tabular prices; never duplicate pricing logic.
- Use the shared 16/24 px `Container` gutters, standard mobile-first breakpoints, 48 px important touch targets, visible focus, labels/descriptions/errors, reduced-motion behavior, and semantic status treatments. Color or hover alone must never communicate state.
- The permanent `/design-system` lab is the visual QA and shared-element reference surface in every environment. It must remain reachable, `noindex`, and excluded from the sitemap. Keep it current whenever tokens or shared primitives change; extend primitives only for demonstrated reusable needs.
- Design mobile- and touch-first. Important controls need comfortable interaction envelopes, visible focus, native semantics, labels, loading/empty/error/recovery states, and reduced-motion support.
- Every public route needs an explicit entry in the SEO policy. Canonicals exclude marketing/filter parameters. Workflow and token-bearing pages are `noindex`.
- Use backend Media renditions through `lib/media/url`. Reserve dimensions/aspect ratio, use `card` for grids and `pdp` for primary product media, and never request originals for routine display.
- Emit semantic commerce measurement through `lib/analytics`; never call GA4, Meta, TikTok, or another vendor directly from feature components. Tracking must be consent-gated and failure-isolated.
- Preserve the Server Component boundary: do not pass large response objects to client islands when a smaller typed projection is enough.
- Do not add a dependency without checking the monorepo first and reading the current official framework documentation.
- Before completion, run focused tests, Storefront type checking, focused linting, `git diff --check`, and a production Storefront build when the change affects routing, styling, bundling, or server rendering.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
