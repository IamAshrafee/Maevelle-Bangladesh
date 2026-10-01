# Current Focus

## Active Area

Team & Access: identity/membership boundaries, organization context, capability
authorization, permission presets, location scopes, invitations, membership
lifecycle, ownership, sessions, audit, and security notifications.

## Current Status / Substage

`IMPLEMENTATION_COMPLETE / READY_FOR_OWNER_REVIEW`

## Evidence Already Known

- Better Auth remains the identity/session authority; active organization membership
  and capabilities are resolved dynamically for authorization.
- Owner is a structural membership type with one-Owner database protection and an
  atomic, recent-MFA ownership transfer command.
- Invitations are hashed at rest, encrypted only for asynchronous delivery,
  expiring, revocable, resendable, idempotent, and consumable exactly once.
- Permission presets are organization-scoped grant templates. Runtime access uses
  direct additive capability grants with delegation ceilings and optional LOCATION scopes.
- Explicit lifecycle commands replace the MVP generic mutation; suspend/remove
  deny access immediately and trigger Better Auth session cleanup.
- Organization context is propagated across Admin routes; ambiguous multi-org
  identities must select an organization that they actively belong to.
- Warehouse and inventory resource paths enforce capability-specific location scope;
  operations overview and search no longer disclose unauthorized domain summaries.
- All sensitive Team changes emit audit/outbox evidence and relevant security notices.
- Focused IAM, notification, and Admin operation tests and TypeScript checks pass.

## Immediate Objective

Conduct owner operational review of the minimal Team workflows and verify external
invitation email delivery in the configured environment.

## Important Constraints

- Authentication never grants authorization by itself.
- Unknown capabilities, inactive memberships, ambiguous organization context, and
  resources outside the verified organization/location scope deny by default.
- Invitation/session/MFA secrets never appear in Team DTOs, audit, outbox, or logs.
- Membership removal preserves business history and actor attribution.
- Presets do not remain linked runtime roles; applying one snapshots its grants.

## Blockers / Owner Review

No code blocker. Owner operational review and external-provider verification remain pending.
