# Transactional SMS Notifications Verification

## Checkpoint

- Implementation checkpoint: `1832b4d`
- Status: `LOCAL_VERIFICATION_COMPLETE`
- Owner review: `PENDING`

## Verified Locally

- A clean disposable PostgreSQL database was reconstructed from the checked-in migration baseline with `docker compose down --volumes` followed by `docker compose up -d --build`.
- Test-database migrations applied successfully.
- `pnpm exec vitest run apps/worker/src/worker.test.ts packages/database/src/sms.test.ts packages/database/src/sms-notifications.test.ts packages/database/src/notifications.test.ts packages/config/src/index.test.ts apps/api/src/app.test.ts` passed: 6 files and 60 tests.
- `pnpm exec tsc --build --pretty false` passed across the monorepo.
- `pnpm --filter @maevelle/admin build` passed and generated 80 routes, including `/sms`.

## Covered Behaviors

- Bangladesh mobile normalization and validation.
- GSM-7, extension-character, and Unicode segment estimation.
- Provider contract, capability declaration, mock delivery outcomes, and callback authentication.
- Automatic outbox materialization, manual send, test send, intentional resend, retry, and request idempotency.
- Missing and invalid recipient handling, suppression checks, transient/permanent/rate-limit classification, and unknown provider outcome reconciliation.
- Idempotent provider events and separation between accepted and delivered states.
- Worker independence from business processing and Email delivery.

## Not Yet Verified

- No real provider adapter, production credential, sender identity, live callback, provider status polling, balance, cost, or real-device delivery was tested.
- Browser-based responsive and owner visual review was not performed in this checkpoint.
- Commercial onboarding, Bangladesh regulatory requirements, consent/opt-out policy, and final production configuration require owner/provider confirmation.
