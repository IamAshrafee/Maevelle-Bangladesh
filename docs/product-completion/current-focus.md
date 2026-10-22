# Current Focus

## Active area

Omnichannel messaging — Phase 08 Instagram Direct backend integration.

## Evidence state

`PHASE 08 INSTAGRAM BACKEND CODE COMPLETE / LIVE META ACTIVATION PENDING`

Phase 08 adds the official Instagram professional-account backend as a separate,
credential-isolated provider adapter over the existing canonical messaging core.

Repository-controlled work now includes secure Page-linked account discovery,
OAuth state binding, encrypted credentials, signed durable webhooks, canonical
DM/contact/conversation ingestion, private images, policy-aware Send API
delivery, echo/read reconciliation, resumable history sync, diagnostics, and
typed Phase 09 APIs. Details and activation limits are recorded in
`docs/architecture/messaging/18-phase-08-instagram-backend-completion.md`.

The existing Phase 07 Facebook Messenger administrative and operator frontend includes:

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
- Database messaging tests passed (`packages/database/src/messaging.test.ts` - 14/14 passed).
- Core Meta messenger tests passed (`packages/core/src/meta-messenger.test.ts` - 7/7 passed).
- Config validation tests passed (`packages/config/src/index.test.ts` - 13/13 passed).
- Clean PostgreSQL baseline migration and rerun passed (`packages/database/src/migrate.test.ts` - 1/1 passed).
- Focused combined provider/regression verification passed (36/36 tests).
- API suite passed (`pnpm vitest run apps/api` - 11 files, 39 tests).
- Credential-pattern scan passed (`pnpm check:secrets`).

## Next implementation boundary

- Phase 09: implement the Instagram connection, diagnostics, history-sync, inbox badge/filter, context rendering, and policy-aware composer frontend over the completed contracts.
- Live Meta activation remains owner-controlled and requires App Review, Business Verification, Instagram/Page eligibility, production credentials, public HTTPS callbacks, and controlled real-message verification.
