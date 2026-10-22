# Current Focus

## Active area

Omnichannel messaging — Phase 07 Facebook Messenger Admin connection and
operations experience.

## Evidence state

## Evidence state

`PHASE 07 FRONTEND CODE COMPLETE / LIVE META ACTIVATION PENDING`

Phase 07 completes the Facebook Messenger administrative and operator frontend integration:

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
- Focused ESLint passed with 0 errors and 0 warnings (`pnpm --filter @maevelle/admin exec eslint components/messaging`).
- Database messaging tests passed (`pnpm vitest run packages/database/src/messaging.test.ts` - 12/12 passed).
- Core Meta messenger tests passed (`pnpm vitest run packages/core/src/meta-messenger.test.ts` - 5/5 passed).
- API test suite passed (`pnpm vitest run apps/api` - 11 files, 39 tests passed).
- Config validation tests passed (`pnpm vitest run packages/config/src/index.test.ts` - 12/12 passed).

## Next implementation boundary

- Phase 08 External Meta activation: complete Meta App Review, Business Verification, configure public HTTPS webhooks, and execute live end-to-end message delivery verification.
- Live Meta communication requires production Meta App credentials, webhook verify token matching, and Advanced Access permissions.
