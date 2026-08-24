# Controlled production launch runbook

Status: **NOT AUTHORIZED / NOT EXECUTED**. This is preparation only; it is not authorization to deploy.

1. Obtain explicit launch approval and confirm a signed UAT record.
2. Confirm encrypted PostgreSQL 18 backup destination and a successful isolated restore drill.
3. Configure production-only secrets outside Git, including database credentials, Better Auth secret, encryption key, provider credentials, and public URLs.
4. Validate images, migration status, `/api/health/live`, `/api/health/ready`, worker connectivity, object-storage connectivity, and Caddy routes.
5. Run forward migrations once. Do not attempt a rollback by reversing forward-only migrations.
6. Create Organization and Owner; configure structured settings, Warehouse, payment methods, delivery methods, and integrations through protected Admin flows.
7. Create/import Catalog and opening Inventory only through canonical inventory and cost-basis commands. Record opening Finance balances through immutable opening-balance transactions.
8. Keep Storefront browsing and checkout disabled by rollout controls until catalog, prices, inventory, and integrity checks are clean.
9. Enable browsing, then checkout. Observe order conflicts, payment verification, queue retries, provider outcomes, database health, and disk capacity.
10. Stop immediately for failed readiness, integrity errors, unauthorized access, customer-impacting order failures, inventory mismatch, or failed backup confirmation. Contain with feature flags; do not edit transactional truth directly.

No production deployment, DNS, payment/courier certification, monitoring activation, backup destination, or operator UAT sign-off is present in this repository.
