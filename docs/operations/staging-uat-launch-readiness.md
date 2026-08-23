# Staging, UAT, and launch readiness

Status: **repository ready; external gates pending**.

## Staging

Copy `.env.staging.example` to a private `.env.staging`, replace every `REPLACE_` value, then validate the topology with:

```powershell
pnpm check:release-readiness
docker compose -f compose.staging.yaml --env-file .env.staging up --build -d
```

Verify `/api/health/live`, `/api/health/ready`, Admin sign-in, Storefront browsing, and worker health. Run migrations only forward; do not attempt a schema rollback.

## Human UAT evidence

An authorized operator must record the date, environment, account (not password), result, and evidence location for: Catalog publishing, COD checkout, manual payment verification, warehouse dispatch, receiving/Landed Cost, return/refund, finance expense, reporting, and access control. The release remains `AWAITING_HUMAN_UAT` until this evidence is signed off.

## Backup and restore

Before any launch, direct production backups to an approved encrypted destination and perform a restore drill into an isolated PostgreSQL 18 database. Local development backup files are not production backup activation.

## Stop conditions

Stop launch for failed readiness, unresolved CRITICAL integrity issues, migration errors, unauthorised access, checkout/order failures, inventory balance mismatch, unavailable worker, or unverified backup restore. Disable risky rollout flags rather than mutating transactional records.

## Production preparation only

No production environment, DNS, provider certification, monitoring endpoint, backup destination, or human UAT evidence is configured in this repository. Do not claim a production launch from these files.
