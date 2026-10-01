# Team & Access Verification

## Automated evidence

- Monorepo TypeScript project build: passed.
- Focused ESLint over new IAM, API, worker, and Admin files: passed.
- Focused Vitest set: 15 tests passed across IAM security invariants,
  notifications, retained Admin operations, and the clean migration path.
- IAM coverage includes invitation idempotency and exactly-once acceptance,
  duplicate prevention, delegation ceilings, optimistic concurrency, immediate
  suspension/removal denial, Owner protection, tenant-safe location scopes,
  security notifications, and atomic ownership transfer.
- Secret scan, architecture rules, and whitespace validation passed.
- A clean Docker volume rebuilt successfully from the full migration baseline;
  migration and Owner bootstrap exited successfully, and PostgreSQL, API, Admin,
  and Storefront reported healthy while the worker remained running.

## Manual review checklist

- Invite a new identity, observe queued delivery, accept once, and confirm access.
- Invite an existing identity and confirm its global account is reused.
- Resend and revoke invitations; verify old tokens cannot activate access.
- Change grants and scopes, then confirm the same active session sees the new decision.
- Suspend, restore, remove, and revoke sessions; confirm historical attribution remains.
- Transfer ownership after fresh MFA and confirm there is never zero or two Owners.
- Attempt cross-organization IDs and out-of-scope warehouse/inventory locations.
- Review Team audit entries and security notifications for sensitive values.

## Unverified external evidence

- A real external email-provider delivery was not exercised locally.
- Owner visual/responsive review remains pending for the intentionally minimal UI.
