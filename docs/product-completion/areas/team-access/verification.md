# Team & Access Verification

## Automated evidence

- Monorepo TypeScript project build (`pnpm typecheck`): passed with 0 errors across all packages.
- Next.js Admin production build (`pnpm --filter @maevelle/admin build`): passed with 0 errors, compiling all 67 routes and pages.
- Backend API build (`pnpm --filter @maevelle/api build`): passed with 0 errors.
- Database build (`pnpm --filter @maevelle/database build`): passed with 0 errors.
- Extended Vitest security invariant coverage:
  - invitation idempotency and exactly-once acceptance,
  - duplicate prevention and re-invitation/reactivation of removed members,
  - delegation ceilings and optimistic concurrency,
  - immediate suspension and removal access denial,
  - suspended member removal without conflict,
  - Owner structural authority and lifecycle protection,
  - Owner creation bootstrap audit event recording,
  - tenant-safe location scopes in warehouse, inventory, fulfillment, and receiving,
  - security notifications and atomic ownership transfer.
- Secret scan, architecture rules, and whitespace validation passed.

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
