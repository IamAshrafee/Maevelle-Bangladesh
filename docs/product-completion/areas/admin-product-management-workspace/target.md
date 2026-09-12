# Target

A merchandiser can create, organize, configure variants and content, connect
authoritative pricing/media/sizing/inventory work, understand readiness, publish
or safely change a product, and see the correct customer-facing result. The
workspace must preserve organization/capability isolation, recover from stale
edits, and not duplicate downstream domain authority.

## Completion Plan

1. **Safe published variant integrity — COMPLETE** — published Product
   option/Variant changes are transaction-serialized, recovery is explicit,
   history is retained, and public projections fail closed on legacy
   inconsistency.
2. **Scalable variant and media operations — COMPLETE** — complete paginated matrix work,
   bulk generation/reconciliation, variant-scoped media, and safe high-count
   editing without moving pricing or inventory authority into Catalog.
3. **Merchandiser worklist and workspace clarity — COMPLETE** — Product rows
   support useful URL-backed sorting and canonical recovery cues; media scopes
   are explicit and published Products can open their customer representation.
4. **Integrated organization, sizing, content, and lifecycle review — COMPLETE** —
   product sizing configuration now follows Sizing-domain compatibility,
   serialization, public projection safety, and a legible Product workspace
   handoff; existing content conflict recovery and lifecycle/deep-link flows
   retain their focused proof.
5. **Verification and owner review — NEXT** — run targeted database/API/Admin and
   Storefront proof, responsive review, and a focused operator acceptance pass.
