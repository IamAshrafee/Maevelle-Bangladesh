# Team & Access Progress

## Status

`IMPLEMENTATION_COMPLETE / READY_FOR_OWNER_REVIEW`

## Completed implementation

- Expanded the IAM baseline with membership lifecycle/version metadata,
  capability sensitivity and scope metadata, organization-safe scope keys,
  permission presets, invitations, invitation grants/scopes, and delivery-attempt history.
- Added domain modules for authorization/delegation policy, invitations, membership
  lifecycle, permission replacement, ownership transfer, IAM audit queries, and
  access-sensitive session operations.
- Replaced generic Team PATCH behavior with explicit versioned commands and typed
  domain errors.
- Added secure invitation token generation, hash-at-rest validation, encrypted
  delivery handoff, expiry/revocation/resend, idempotent creation, exactly-once
  acceptance, worker leasing, retry history, and secret-free audit/outbox payloads.
- Made Owner authority structural, protected Owner lifecycle operations, and added
  atomic ownership transfer requiring a recent MFA-authenticated session.
- Made Admin organization selection explicit when identity membership is ambiguous;
  every route verifies the selected active membership and requested capability.
- Added capability-specific LOCATION enforcement to warehouse and inventory lists,
  details, aggregate paths, stocktakes, reservations, and transfers.
- Prevented cross-capability data leakage in operations overview and global search.
- Integrated invitation and security messages with the worker/notification system,
  including membership recipients.
- Added Team member search/pagination, capability and preset discovery, pending
  invitation operations, audit history, session metadata/revocation, and the
  minimal Admin invite/accept/member-management UI required to operate the APIs.
- Removed the obsolete generic Team database and API mutations.

## Remaining gates

- Owner visual and operational review of invite, accept, permission, lifecycle,
  ownership-transfer, and session-revocation workflows.
- Environment verification with the production email provider once configured.
