# Phase 11 deployment, recovery and operations

## Deployment boundary

This repository is still in disposable-baseline development mode. `0700_customers` and `3200_messaging_core` were extended in place. Do not apply those edited historical migrations to an environment whose migration ledger already marks them complete. Before the first persistent/shared environment, freeze the baseline and produce an expand-and-contract forward migration plus an idempotent reconciliation worker.

## Development deployment

1. Stop application traffic.
2. Recreate the disposable database volume with `docker compose down --volumes` and `docker compose up -d postgres`.
3. Run `pnpm --filter @maevelle/database migrate`.
4. Seed only if representative local records are needed.
5. Build/start API, worker, admin and storefront from the same revision.
6. Verify `/admin/customers`, a customer profile, inbox customer context, identity review, duplicate review, segments, analytics, privacy work and settings.

No new environment variables or external infrastructure are required.

## Persistent-environment migration plan

1. Take and verify a PostgreSQL backup; record a restoration target.
2. Deploy additive schema first: nullable profile columns, new CRM tables, constraints that do not rewrite historical rows, and concurrent indexes where production volume requires them.
3. Keep existing `messaging.contacts.customer_id` reads/writes compatible during the transition.
4. Backfill existing links in bounded organization/id batches. Each batch must lock or lease its range, insert idempotently, record counts/errors, and never infer links absent the existing explicit customer relationship.
5. Run reconciliation reports for contact projection versus CRM identity link, organization mismatches, multiple active links and missing customer/identity references.
6. Deploy application services. Enable privileged capabilities only for reviewed roles.
7. Observe query latency, link conflicts, export audit events, privacy-work age and outbox/worker failures before broad enablement.

## Rollback and incident recovery

- Prefer application rollback while retaining additive schema. Do not drop CRM tables during an incident.
- Suspend identity mutation/export capabilities if identity or authorization correctness is in doubt; ordinary customer, order and messaging history remains readable.
- Revoke an incorrect identity link through the domain operation. Never delete conversations or rewrite provider IDs.
- Customer merge runs in one transaction and is idempotency-protected. Preserve merge/alias/audit evidence. There is no general automated unmerge; use the recorded provenance and domain-specific recovery tooling under incident control.
- Restore from backup only for database-wide corruption, with an explicit recovery-point decision. Reconcile provider webhooks and durable outbox work after restoration.

## Operational checks

- CRM identity links: no active identity/contact linked to two customers; every relationship is organization-qualified.
- Messaging projection: active link and `messaging.contacts.customer_id` agree.
- Privacy work: overdue open requests and unresolved identity-verification requirements.
- Customer quality: missing/unchecked contacts, open duplicate candidates, ownerless relationships and overdue follow-ups.
- Export audit: actor, reason, row count and whether sensitive columns were included.
- Database: slow directory/segment queries and index usage under representative data.

## Production gates

- Counsel-approved privacy notice, lawful-basis register, retention schedule and rights-request procedure.
- Production role/capability review and access recertification.
- Real Meta asset validation described in the messaging Phase 10 audit.
- Representative desktop/tablet/mobile owner walkthrough.
- Backup restoration exercise and incident contacts.
- Forward-only migration/backfill rehearsal on a production-sized copy.

