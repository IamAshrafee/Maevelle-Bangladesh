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
- Replaced the initial minimal UI scaffolding with a complete, production-ready Admin experience:
  - **Modular Team Architecture**: `apps/admin/components/team/` containing typed contexts (`team-context.tsx`), domain catalog metadata (`team-types.ts`), and modular components for all IAM surfaces.
  - **Domain-Grouped Permissions & Location Scoping**: `team-permissions-editor.tsx` supporting 24 domain groups, search filter, sensitivity badges, preset quick-selection, and granular warehouse location restriction pickers (`LOCATION` scopes).
  - **Complete Invitations Lifecycle**: `team-invite-dialog.tsx` and `team-invitations-list.tsx` supporting full invitation lifecycle with status filtering (Pending, Accepted, Expired, Revoked), capability customization, resend with custom expiration window, and revoke with audited reason.
  - **Comprehensive Member Detail & Lifecycle Management**: `team-member-detail-sheet.tsx` offering deep inspection across Capabilities & Location Scopes, Active Sessions & Bulk Session Revocation, Lifecycle Timestamps (`invited_at`, `activated_at`, `disabled_at`, `removed_at`), and safe suspension/reactivation/removal workflows with explicit consequence confirmation.
  - **Role Presets Management**: `team-roles-presets.tsx` supporting custom permission preset creation, editing, and deletion, member usage counts, and complete system capability catalog explorer.
  - **High-Security Ownership Transfer**: `team-owner-transfer-dialog.tsx` featuring dedicated successor selection, MFA freshness requirement guidance, two-step confirmation, and Owner protection guards.
  - **IAM Audit Timeline**: `team-audit-timeline.tsx` with event filtering, actor/target attribution, and before/after capability diff highlighting.
  - **Production Recipient Onboarding**: `accept-invitation/page.tsx` featuring dedicated, actionable states for accepted, already-accepted, expired, revoked, and invalid links.
- Removed obsolete generic Team database and API mutations.

## Remaining gates

- Owner visual and operational review of the full production Team & Access Admin experience.
- Environment verification with the production email provider once configured.
