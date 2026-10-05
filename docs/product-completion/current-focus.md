# Current Focus

## Active area

Storefront Experience — Production Architecture Foundation.

## Evidence state

`ARCHITECTURE_FOUNDATION_OWNER_REVIEW`

The implementation is locally verified in the uncommitted worktree above baseline `3393e19`. The Storefront now has server-first public reads, narrow global client islands, typed API boundaries, Tailwind v4 with quarantined legacy CSS, deliberate font/Media ownership, executable SEO policy, runtime sitemap behavior, semantic measurement contracts, and durable agent/architecture documentation.

## Verification completed

- Storefront/contracts TypeScript build passed.
- 7 focused SEO/catalog/measurement tests passed.
- Focused ESLint passed.
- Storefront production build passed.
- Architecture check, secret scan, and `git diff --check` passed.

Docker reported no running services, so public browser/mobile behavior through Caddy/API is not current evidence. Owner review remains pending.

## Next action

Review the public Storefront at `http://127.0.0.1:8080` with the local stack running. Then begin Task 2 Design System / Visual Foundation using:

- `apps/storefront/AGENTS.md`
- `docs/storefront/architecture.md`
- `docs/storefront/seo-policy.md`
- `docs/storefront/performance.md`
- `docs/storefront/measurement.md`

Task 2 must replace legacy visual sections incrementally and must not claim Homepage, Catalog, PDP, Cart, Checkout, or vendor analytics completion merely because this foundation exists.
