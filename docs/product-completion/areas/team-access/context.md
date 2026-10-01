# Team & Access Context

## Product boundary

Team & Access owns human identity-to-organization membership, capability grants,
location scopes, invitations, ownership, membership lifecycle, access-sensitive
session operations, and their audit and notification effects. Better Auth remains
the authentication authority; Team & Access decides whether an authenticated
identity may operate in a particular organization.

## Completion findings

The original implementation had useful foundations—organization memberships,
capability definitions, Better Auth sessions, audit/outbox infrastructure, and
organization-filtered repositories—but exposed an MVP-level generic member
update, had no durable invitation lifecycle, treated Owner access as copied
grants, and did not consistently carry explicit organization context or location
scope enforcement through every relevant route.

The completed model follows the access-control architecture:

- a global user identity may hold independent memberships in multiple organizations;
- exactly one active structural Owner exists per organization;
- presets are one-time grant templates, not runtime roles;
- standard memberships receive additive capabilities and optional LOCATION scopes;
- all effective access is re-evaluated against the current active membership;
- authentication never implies organization authorization;
- resource queries remain organization-bound, with additional location checks where supported.

## Deliberate exclusions

Enterprise federation, SCIM, service accounts, policy scripting, deny overrides,
and custom role administration are not part of Maevelle's documented human-team
model. A separate frontend phase may expand the Team workspace presentation;
this phase includes only the UI needed to operate the completed backend safely.
