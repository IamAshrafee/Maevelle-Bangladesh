# Complete Checkout — Phase 00

Planning baseline: 2026-11-04 (Asia/Dhaka), branch `main`, HEAD `7ca66d1d56aa42d194fa0e2a92cad86d42b4c75f`. Initial tracked/untracked working tree: clean. This package specifies recommended behavior; it does not enable Checkout or establish runtime acceptance.

Phase 01A backend foundation is now implemented and locally verified, with purchases still disabled. See the [implementation report](PHASE_01A_IMPLEMENTATION_REPORT.md) and [actual backend / transaction contract](PHASE_01A_BACKEND_CONTRACT.md). Phase 00 documents below remain the planning baseline.

Phase 01B Storefront foundation is implemented with **PARTIAL** local acceptance. See the [frontend implementation and acceptance report](PHASE_01B_IMPLEMENTATION_REPORT.md) and [verification record](PHASE_01B_VERIFICATION.json). Main real-browser/API journeys pass; browser fault/race and accessibility breadth remain open. Purchases remain disabled.

Phase 02A backend is **PASS for locally verified scope**. See the [implementation and acceptance report](PHASE_02A_IMPLEMENTATION_REPORT.md) and [exact Phase 02B backend handoff](PHASE_02A_BACKEND_CONTRACT.md). Explicit coverage defaults UNVERIFIED; missing real data fails safely. Phase 01B remains PARTIAL, purchases stay disabled, and Phase 02B/immutable quotes are not implemented.

## Reading order and authority

| Document | Authoritative subject |
| --- | --- |
| [Repository audit](REPOSITORY_AUDIT.md) | Current source evidence, capability status and replacement decisions |
| [Master specification and architecture](MASTER_SPEC.md) | Product invariants, ownership, purchase sources and domain responsibilities |
| [Data, transactions and API](DATA_TRANSACTIONS_API.md) | Logical model, locking, idempotency, transport and transitions |
| [Payments and business policies](PAYMENTS_AND_BUSINESS_RULES.md) | COD, manual wallets, inventory, pricing, delivery and unresolved policies |
| [Security](SECURITY_THREAT_MODEL.md) | Threats, controls, ASVS/API mapping and adversarial verification |
| [Scenarios](SCENARIO_ACCEPTANCE_REGISTER.md) | Required acceptance cases and evidence obligations |
| [Shopper and Admin UX](UX_AND_OPERATIONS.md) | Responsive workflows, recovery, permissions and operational placement |
| [Measurement and reliability](ANALYTICS_PERFORMANCE.md) | Events, conversion policy, privacy, SEO and measurable targets |
| [Migration and roadmap](MIGRATION_AND_ROADMAP.md) | Compatibility, deployment sequencing and paired A/B delivery |
| [Phase 00 final report](PHASE_00_REPORT.md) | Acceptance verdict, baseline, limitations, decisions and exact next action |
| [External guidance](EXTERNAL_GUIDANCE.md) | Official research, access limitations and legal/provider gates |

Evidence labels throughout: **V** = verified by source inspection at this HEAD; **E** = external guidance; **R** = recommendation; **B** = business assumption awaiting owner decision; **O** = open verification/decision. Source inspection proves code exists, not that it is deployed, reachable through every ingress, or correct under real concurrency. Existing tests are evidence of intended coverage until run and observed.

Dedicated Checkout scope supersedes the Cart project's prohibition on implementing Checkout only after a separate implementation assignment. This Phase 00 assignment permits documentation only. Existing Cart, Wishlist and Product Completion release gates remain open independently.
