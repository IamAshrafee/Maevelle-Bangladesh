# Global Gaps

These are initial repository-level findings, not a complete audit.

## P0

- No area has been re-verified under the Product Completion standard.
- Browser-level realistic business proof is sparse relative to the number of
  operational workflows and must be established area by area.

## P1

- Several Admin lists are client-loaded consoles; each area must prove bounded
  pagination, filters, deep links, recovery, and large-data behavior.
- Cross-domain workspaces often link to separate consoles rather than composing
  the operator context needed to finish a job.
- Owner review findings need durable area-specific capture as reviews occur.

## Superseded planning language

Historical documents still contain MVP, phase, roadmap, and deferred-capability
language. Repository policy now makes those labels non-binding, so they should
be cleaned up opportunistically when the relevant document or module is
revisited rather than through a destructive bulk rewrite.

## Active-area priorities

- Catalog Products shows simulated readiness for facts it does not query.
- Product listing is unbounded and filters only after downloading all Products.
- Product editor lacks master-data editing, taxonomy/attributes/information/SEO,
  archive/duplicate/bulk commands, structured variant operations, and activity.
