# Monitoring readiness

Repository probes exist for API liveness/readiness, PostgreSQL readiness, Worker process state, outbox/notification/webhook backlogs, `UNKNOWN_OUTCOME` operations, integrity findings, and routed Storefront/Admin responses.

Before production, operators must connect these signals to an external alert service and prove delivery for:

- API or PostgreSQL readiness failure;
- Worker stopped or stale processing;
- disk/volume capacity;
- outbox, notification, or webhook retry backlog;
- unresolved integration `UNKNOWN_OUTCOME`;
- critical integrity finding;
- elevated checkout and PlaceOrder semantic/server errors.

External alert delivery status: **EXTERNAL_REQUIRED**.
