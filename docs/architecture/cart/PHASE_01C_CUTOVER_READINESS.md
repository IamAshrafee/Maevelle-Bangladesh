# Phase 01-C cutover readiness

Persistent cutover is BLOCKED on continuity approval and deployment-environment evidence.

| Step | Verified locally | Required before persistent rollout |
| --- | --- | --- |
| 3213 foundation | Populated prior-schema upgrade and repeatable migration ledger. | Verify schema ledger, current full SHA/image digests and quiesce incompatible writers. |
| 3214 retirement | Populated fixture retires all pre-cutover credentials and preserves Cart/receipt data. Retired credentials and Checkout bypass are rejected. | Approve continuity communication and verify recoverable backup before migration. |
| 3215 integrity | Fresh 64 migrations and populated 3214 upgrade, safe failure on invalid rows and forward repair. | Preflight actual constraints/data, run one migration job and roll out compatible API, Worker, Admin and Storefront images. |
| Restore | Synthetic custom dump restored to a separate disposable database. Row hashes matched 10 Cart, 8 line, 22 receipt and 21 outbox rows. | Rehearse authorized snapshot restore, record RPO/RTO, verify revocation replay and access before opening traffic. |
| Runtime and roles | Local API/Next, exact Origin, production cookie attributes by API test, private no-store. | Verify actual TLS, cookie propagation/size, trusted forwarding, private caches and access logs, least privilege, health and smoke. |
| Retention | Tested expiry and consumed receipt behavior. | Approve cleanup, retention, erasure and backup policies and monitor safe aggregates. |

Recommended continuity decision is a fresh guest bag with explicit customer messaging. Retain existing rows under approved policy. Assisted recovery requires independent ownership proof. Cart IDs, matching contents, IP and browser signatures are insufficient. This recommendation awaits business approval.

Record the last release compatible with the resulting schema. Rolling an app image back leaves the schema and retired credentials in place. A backup restored to pre-retirement state may reintroduce authority. Keep ingress closed until forward retirement and revocation controls are reapplied and verified. Use the existing controlled deployment workflow, stop on failed preflight, migration, health or smoke, and record release/restore evidence independently.
