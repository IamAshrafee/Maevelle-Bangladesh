# Current Focus

## Active area

Omnichannel messaging — Phase 09 Instagram Direct frontend integration completed.

## Evidence state

`PHASES 00–09 ROADMAP CODE COMPLETE / LIVE META ACTIVATION AND PRODUCTION VERIFICATION PENDING`

Phase 09 completes the responsive Instagram Direct administration and unified
inbox experience over the Phase 08 provider adapter. Repository-controlled work
now includes official authorization preflight and return handling, eligible
professional-account selection, Page identity confirmation, health and
permission evidence, diagnostics, reauthorization, suspend/restore,
non-destructive disconnect, history-sync monitoring, Instagram filters and
context, and a server-authoritative text-or-one-image reply composer.

Implementation and activation limits are recorded in
`docs/architecture/messaging/19-phase-09-instagram-frontend-completion.md`.

The existing Facebook Messenger administrative and operator frontend continues to include:

- Multi-step connection wizard with scope disclosures, availability preflight, popup/redirect OAuth flow, and eligible Page discovery;
- Connection overview dashboard with 5-pillar readiness matrix (Auth, Webhook, Routing, Historical Sync, Operational);
- Realtime permission and webhook verification card with token security status;
- Phase 06.5 safety assurance dialog enforcing owner coexistence reviews and optimistic concurrency for webhook subscription;
- Historical conversation synchronization controls, non-destructive data preservation guarantees, and live counters;
- Safe non-destructive disconnect modal preserving canonical transcripts;
- Unified inbox integration with channel filtering, Facebook badges, and Page-scoped customer display names;
- Policy-aware reply composer enforcing Meta's 24-hour reply window, countdown timers, 1-image maximum restriction, and MIME type validation;
- Full responsiveness across mobile, tablet, and desktop viewports utilizing Tailwind CSS v4 semantic tokens and Base UI / shadcn primitives.

The complete architecture, operational flows, safety controls, and verification evidence are recorded in
`docs/architecture/messaging/17-phase-07-completion.md`.

## Verification completed

- Repository TypeScript build passed (`pnpm typecheck`).
- Focused ESLint passed with 0 errors and 0 warnings on the touched TypeScript paths.
- Admin production build passed (`pnpm --filter @maevelle/admin build`, 90 routes).
- Clean PostgreSQL baseline migration and rerun passed (`packages/database/src/migrate.test.ts` - 1/1 passed).
- Focused Instagram/database/messaging/Facebook regression verification passed (4 files, 21/21 tests).
- Architecture boundary check passed (`pnpm check:architecture`).
- Credential-pattern scan passed (`pnpm check:secrets`).
- Responsive browser inspection passed at 390/820/1440 widths with no console warnings or errors.
- Design-system scan found no new literal Instagram colors, `transition-all`, or routine `!important` usage.

## Next implementation boundary

- Owner-controlled Meta App Review, Business Verification, Instagram/Page eligibility, production credentials, and public HTTPS OAuth/webhook configuration.
- Controlled live Instagram authorization, inbound/outbound text and image messaging, story/shared context, delivery/read reconciliation, historical coverage, reauthorization, and disconnect verification.
- Comprehensive regression/security/accessibility testing and an explicitly authorized production deployment.
