# Verification Policy

Choose evidence proportional to the area. An area becomes `VERIFIED_COMPLETE`
only when current evidence covers the relevant business workflow, authoritative
data/domain invariants, API reads and commands, authorization and organization
isolation, and transaction/idempotency/concurrency behavior where applicable.

For a user-facing area, evidence must also cover practical Admin and/or
Storefront workflows with human-readable controls, error/empty/loading states,
cross-domain connections, and responsive/accessibility behavior. Focused tests
are expected for meaningful invariants; broader regression is required when the
area closure or risk warrants it. Record realistic local workflow verification
and tool limitations honestly.

Visual or operational acceptance normally moves through `OWNER_REVIEW_PENDING`.
Owner review is not replaced by automated or agent-run browser checks. Do not
force irrelevant gates onto a domain with no corresponding surface or risk.
