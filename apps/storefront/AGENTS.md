# Storefront Engineering Rules

These rules apply inside `apps/storefront` in addition to the repository root instructions.

- Build public routes as React Server Components by default. Add a Client Component only for browser APIs, stateful interaction, event handlers, or interactive forms.
- Keep route files thin. Put reusable brand-neutral primitives in `components/ui`, global compositions in `components/layout` or `components/navigation`, and domain work in `features/<domain>`.
- Fetch public data through `lib/api/server`; browser mutations go through `lib/api/client`. Do not call a local Next route merely to reach the Fastify API from a Server Component.
- Import shared API and commerce types from `@maevelle/contracts`. Never duplicate backend business rules, price calculation, availability, authorization, or order truth in the storefront.
- Treat URL search parameters as the durable source for catalog filters, sort, and pagination. Initial indexable content must be useful without hydration.
- Use Tailwind utilities for new component/page styling and existing shared primitives before creating new ones. `app/globals.css` is limited to Tailwind imports, tokens, and base rules. `styles/legacy.css` is quarantined MVP styling to remove during page redesigns, not a destination for new selectors.
- Design mobile- and touch-first. Important controls need comfortable interaction envelopes, visible focus, native semantics, labels, loading/empty/error/recovery states, and reduced-motion support.
- Every public route needs an explicit entry in the SEO policy. Canonicals exclude marketing/filter parameters. Workflow and token-bearing pages are `noindex`.
- Use backend Media renditions through `lib/media/url`. Reserve dimensions/aspect ratio, use `card` for grids and `pdp` for primary product media, and never request originals for routine display.
- Emit semantic commerce measurement through `lib/analytics`; never call GA4, Meta, TikTok, or another vendor directly from feature components. Tracking must be consent-gated and failure-isolated.
- Preserve the Server Component boundary: do not pass large response objects to client islands when a smaller typed projection is enough.
- Do not add a dependency without checking the monorepo first and reading the current official framework documentation.
- Before completion, run focused tests, Storefront type checking, focused linting, `git diff --check`, and a production Storefront build when the change affects routing, styling, bundling, or server rendering.
