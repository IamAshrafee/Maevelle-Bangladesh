# Maevelle Product Completion

This directory is the current implementation-progress record for Maevelle. It
replaces historical phase and launch sequencing; those old plans no longer
define product scope or constrain which module may be improved.

Tracking one primary area can preserve continuity, but the user may direct work
in any area at any time. Historical completion labels are not accepted as
current evidence. An area becomes `VERIFIED_COMPLETE` only after its complete
code, integrations, operator experience, failure handling, and realistic
workflows have been inspected and proven under the completion policy.

## Resume protocol

1. Read `state.json` and `current-focus.md`.
2. Compare them with `git status`, recent commits, and the latest session record.
3. Resume the active area when no newer user instruction selects another area.
4. Read that area's context, target, plan, progress, and verification files.
5. Keep tracking concise and update it at coherent checkpoints.

## Current authority

- `state.json`: machine-readable resume point.
- `current-focus.md`: human-readable next action.
- `area-registry.md`: evidence status for business areas.
- `completeness-matrix.md`: completion dimensions and gates.
- `areas/`: active-area evidence and working documents.
- `sessions/`: concise recovery records.

Architecture and domain documents remain authoritative for business rules.
Source code and runtime behavior remain authoritative for what exists today.
Historical MVP/V1 scopes, roadmaps, phases, and deferred lists remain useful
context, but do not choose the next task or exclude capabilities. See the
[documentation authority](../README.md).
