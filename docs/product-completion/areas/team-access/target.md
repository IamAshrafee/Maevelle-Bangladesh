# Team & Access Completion Target

The implementation-complete gate requires all of the following:

- verified organization context and active membership on every Admin request;
- deny-by-default capability checks with no runtime role-name authorization;
- structural Owner protection and atomic, step-up-protected ownership transfer;
- secure, expiring, revocable, resendable, single-use invitations for new and existing identities;
- duplicate and retry protection through constraints, transactions, row locks, and idempotency keys;
- explicit permission replacement with delegation ceilings and optimistic concurrency;
- suspend, restore, and remove operations that preserve history and immediately end authority;
- session inventory and audited revocation without exposing session tokens;
- location-scope enforcement in warehouse and inventory resource paths;
- tenant-safe Team lists, invitation lists, audit history, search, and pagination;
- synchronous audit/outbox state and asynchronous invitation/security notifications;
- an atomic organization/default-preset bootstrap path;
- removal of the generic MVP Team mutation path;
- focused tests for the highest-risk access invariants and a clean baseline migration.

Owner review remains a separate gate for the minimal Admin workflows. A configured
external email adapter remains an environment concern; invitation state and retry
behavior must stay correct when delivery fails.
