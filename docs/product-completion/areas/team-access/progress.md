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
- Added re-invitation and atomic reactivation of `REMOVED` members, preserving
  historical business attribution, actor references, and `unique(organization_id, user_id)` integrity.
- Made Owner authority structural, protected Owner lifecycle operations, emitted
  `iam.organization.owner_created` audit/outbox events at bootstrap, and added
  atomic ownership transfer requiring a recent MFA-authenticated session.
- Made Admin organization selection explicit when identity membership is ambiguous;
  every route verifies the selected active membership and requested capability.
- Added capability-specific LOCATION enforcement to warehouse, inventory, fulfillment,
  and receiving lists, details, aggregate paths, stocktakes, reservations, transfers, and receipts.
- Implemented user session indexing (`active-sessions-${userId}`) in secondary storage to
  enable authoritative `listAuthSessionsForUser` and immediate `revokeAuthSessionsForUser`
  across member suspension, removal, and explicit session revocation.
- Prevented cross-capability data leakage in operations overview and global search.
- Integrated invitation and security messages with the worker/notification system,
  including membership recipients.
- Standardized all IAM wire types in `@maevelle/contracts` (`TeamMemberListItemDto`,
  `CapabilityCatalogItemDto`, `PermissionPresetDto`, `MembershipInvitationDto`,
  `AdminContextDto`, etc.).
- Added Team member search/pagination, capability and preset discovery, pending
  invitation operations, audit history, session metadata/revocation, and Admin
  invite/accept/member-management UI actions (including session revocation and member removal).
- Removed obsolete generic Team database and API mutations.

## Remaining gates

- Owner visual and operational review of invite, accept, permission, lifecycle,
  ownership-transfer, and session-revocation workflows.
- Environment verification with the production email provider once configured.
