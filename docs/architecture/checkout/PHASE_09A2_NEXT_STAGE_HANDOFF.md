# Phase 09A.2 next-stage handoff

**PARTIAL locally; release/activation BLOCKED.** Read [report](PHASE_09A2_IMPLEMENTATION_REPORT.md), [40 outcomes](PHASE_09A2_ACCEPTANCE_REGISTER.md), [financial decisions](PHASE_09A1_FINANCIAL_DECISIONS.md) and [release register](PHASE_09_RELEASE_READINESS_REGISTER.md).

Implemented: exact shared money modes, clean integer retail prices, historical fraction retention, final rounding disclosure and mismatch guard, secure customer settlement facts, Admin Order/payment balance/history, private policy discovery and inactive eligibility, proposal/independent-review forms, existing waiver reversal UI and read-only price review. The81/80/1/0 example is truthful; it does not imply81 cash received. Internal decimal storage/cost input is unchanged.

New reads:

- `GET /admin/payments/cash-policies?page=1&pageSize=20`: policy managers or reviewers; immutable proposal/review metadata, status, limits, evidence and activation=POLICY_BLOCKED.
- `GET /admin/payments/orders/:id/cash-eligibility`: payments.view; canApply=false, canApprove=false, exact due and server reasons. No browser/SQL approval bypass.
- `GET /admin/pricing/fractional-retail-prices?page=1&pageSize=20`: pricing.view; exact selling/compare-at/shipping inventory and product/variant identity for editor navigation. No normalization mutation.

Admin Order detail additionally exposes optional `roundingAdjustment` and `paymentFees` from the original stored components; do not recompute them from the total.

All reads are tenant scoped, bounded to100/page and private/no-store. Existing cash summary/history and mutation paths remain authoritative. Customer GET placement now includes collected/refunded/authorizedWaiver/settlementStatus; GET order-payment keeps the same safe fields. Public final-term policy metadata is whitelisted; full provenance remains in backend history. Do not remove the new privacy projection when resuming.

Next work, in order:

1. Reconcile concurrent Admin/Auth work and rerun the open Shopper/Wishlist cases. The shared HEAD advanced outside this task; do not reset or discard either feature's dirty work. Recheck pool acquisition under controlled load after its successful isolated retry. Current full-repository lint is not certified: unrelated auth files had lint findings.
2. Obtain actual rounding/tax/invoice/accounting, cash limits/role/day-basis and courier approvals. A stored proposal/review is not activation. Source `cashShortfallEngine` exported application resolver remains disabled. No real receiving destination or wallet/COD collection is authorized.
3. Approve and implement authoritative retail authoring policy across current price definitions, variant/current-price updates, imports/bulk edits, fixed promotions/manual discounts and shipping. Keep fractional procurement/costing. The current UI deliberately does not enforce integer-only inputs while other server writers still accept fractions.
4. Audit actual authorized current Catalog records, review proposed new prices and effective dates, then refresh affected quotes. No existing/persistent inventory was inspected or changed by 09A.2.
5. Implement approved item/invoice/refund rounding allocation, posted/remitted/refund-encumbered correction, multi-delivery cash composition and documentary accounting integration. Current memorandum is not a general-ledger write-off. Internal-only `reverseUnpostedCodCollection` has no new public HTTP shortcut.
6. Only after activation design approval, replace disabled eligibility with the same server policy authority used by commands, supply authorized current receipt/policy selection and a focused quick-settlement form. Preserve exact intent/key/body through uncertainty and independent escalation. Current disabled button must never calculate eligibility or enable itself from a small due amount.
7. Extend browser acceptance for policy submission/independent approval, existing waiver reversal and physical lost-response reconciliation, full organization/account switch/revocation, private storage, native200/400% zoom, NVDA/VoiceOver/TalkBack and real touch/iPad devices. Successful public Checkout remains blocked; use isolated fixtures without adding overrides.
8. Re-run final current-source integrated checks after concurrent work settles. Prepare an authorized immutable candidate and Linux/target compatibility separately. Migration3226 is required before these reads; no09A.2 migration was added. Preserve coordinated API/Worker components, persistent storage, explicit target backup/forward repair and existing09B deployment restrictions.

No commit, push, image publication, persistent migration or deployment is authorized by this handoff. Earlier phase PARTIAL verdicts and provider/guest-recovery/HTTPS/privacy/operations gates remain open. The legacy tracking component no longer substitutes simulated financial/delivery facts after lookup failure; it does not establish cross-device Order recovery.
