# Phase 09A.2 frontend handoff

Backend checkpoint: 2026-11-10, **PARTIAL; public Checkout and collection BLOCKED**. Read [the financial report](PHASE_09A1_FINANCIAL_POLICY_REPORT.md) and [decisions](PHASE_09A1_FINANCIAL_DECISIONS.md). This handoff specifies future work; no new monetary UI was implemented in 09A.1.

## Money and customer workflow

Keep API amounts as exact decimal strings. `CheckoutFinalTermsDto.payableUnit = BDT_1` identifies new whole-BDT commitments. Whole rounding adds `precisePayable` and `wholeTakaPolicy`; existing exact integer commitments need no fractional rounding. `roundingAdjustment` is separate from `discountTotal`, tax and fees. Render ordinary committed `299.0000` as `৳299`, with grouping. Reject/flag unexpected fractional whole-contract values; never hide fractions using a formatter. Retained fractional history needs an explicit exact historical view.

Current `formatExactMoney` exposes four decimals and other numeric/Intl formatters may reduce precision. Audit callers before changing shared formatting. A display change alone cannot normalize prices, quotes, obligations or wallet instructions. Client floats must never decide payable, eligibility or refunds.

Prepare whole-BDT Catalog regular/variant/offer/fixed promotional price, manual fixed discount and shipping entry using the prepared server validator. First inventory existing fractional prices and approve normalization; existing authoring endpoints are not yet switched to the prepared validator. Keep procurement/landed cost/allocation forms fractional. Percentage discounts and tax calculations remain exact internally.

Storefront: product → Cart → review → committed Order → payment instructions must use authoritative values for their respective stages. Show approved rounding separately when nonzero. A provisional quote may still be fractional and is not the final payable. Require renewed review for changed commercial terms; no client rounding. Wallet instructions use exact committed payable, zero added Maevelle surcharge, approved destination only. Existing production gate remains closed.

Order status must distinguish original payable, actual received, authorized adjustment, refunded cash and remaining balance. Example: original ৳81, collected ৳80, adjustment ৳1, due ৳0, **Settled with adjustment**. Do not label it “৳81 received” or infer payment from intent `SATISFIED`. PaymentSummary retains cash-based `PARTIALLY_PAID` alongside `settlementStatus=SETTLED_WITH_ADJUSTMENT`. Refunds are separate historical cash movements and do not automatically recreate an Order obligation.

## Implemented private Admin API

All routes use existing Admin authentication/organization context, server capability checks, ordinary `{data: ...}` / `{error:{code,message}}` envelopes and no-store responses. IDs come from authorized resource selection, never manual UUID entry. Mutation bodies reject unknown fields before Fastify can strip them. Adjustment commands require a stable UUID `Idempotency-Key`; preserve body/key after unknown response and recover the existing result before making another intent.

| Route | Contract and permission |
|---|---|
| `GET /admin/payments/orders/:id/cash-settlement` | `payments.view`; `CashSettlementDto` plus `adjustmentActivation=POLICY_BLOCKED`. |
| `GET /admin/payments/orders/:id/cash-adjustments?page=1&pageSize=50` | `payments.view`; paginated `CashAdjustmentDto` history, maximum pageSize 100. Reason/evidence are private operator data. |
| `POST /admin/payments/cash-shortfalls` | `payments.cash_adjustments.manage`; `SettleCashShortfallDto`: orderId, paymentId, policyId, amount, reason, collectionEvidenceReference. New applications currently return `POLICY_BLOCKED` (422). |
| `POST /admin/payments/cash-shortfalls/:id/approve` | `payments.cash_adjustments.approve`; body `{}` and stable key; currently policy-blocked. Requester/approver are server-derived. |
| `POST /admin/payments/cash-shortfalls/:id/reverse` | `payments.correct`; `{reason,evidenceReference}` and stable key. Corrects an existing adjustment append-only even when new applications are disabled. |
| `POST /admin/payments/cash-policies` | `payments.cash_policies.manage`; `CashShortfallPolicyInputDto` explicit revision, scope, limits, states, dates and accounting/invoice/courier references. Creates proposal, not activation. |
| `POST /admin/payments/cash-policies/:id/approve` | `payments.cash_policies.approve`; `{approvalReference}`; different actor from proposer. Stores approval, not activation. |

There is no policy discovery/eligibility endpoint or public application switch. Add a bounded authorized policy listing and server-computed eligibility projection before a usable live policy selector/quick action. Do not manufacture eligibility from client amounts. `reverseUnpostedCodCollection` is an internal backend command, not a newly exposed HTTP route; a future correction UI needs a reviewed semantic endpoint.

## Operator interaction

Compose existing payment workspace primitives. One focused collection panel should show original due, actual cash collected and remaining balance. After approved activation, present a quick “Settle small cash difference” action only from authoritative eligibility. Require reason/evidence; show adjustment and resulting due before submission. Within approved self-limit, one action can settle. Above it, submit a pending request and provide an independent reviewer queue. Do not force several Finance screens for a small approved difference.

Show pending/application/reversal state, responsible staff, revision, Finance reference and recovery feedback. No general “mark paid” shortcut. Over-limit differences remain due; policy-blocked, expired, conflicting and unauthorized states have clear recovery. After uncertain response, lock the original intent and retry/reconcile exactly. A changed amount needs a new reviewed intent after recovery.

Keep courier custody/remittance/receivable on a distinct reconciliation view. Customer paid 81 / courier remitted 80 leaves courier receivable 1; it does not offer a customer waiver. Cash tendered 82 requires change/net collection handling or approved excess liability; current COD command rejects net collection above due. Wallet underpayment stays partial and cannot use this cash waiver.

Reuse Admin Button/Input/dialog/page-shell/StatusBadge primitives, semantic tokens and numeric typography. Design mobile/touch, iPad orientation and desktop with keyboard, loading, validation, empty/error and unknown-outcome states. Short forms use responsive dialogs/sheets. No feature CSS in globals. Verify actual browser, accessibility and human financial workflow separately; 09A.1 builds are compatibility checks, not UI acceptance.

## Integration gates

Migration 3226 must precede new API/Worker queries. Coordinate contracts, API, Worker and both clients for tax/fee/rounding projections. Whole-policy Orders block partial line amendments until approved invoice/allocation correction exists. Full cancellation preserves commercial snapshots. Correction of already-posted/remitted COD requires a Finance reconciliation design; current helper deliberately refuses it. Preserve existing refund idempotency and genuine receipt cap. Do not expose any action until all applicable decision-register approvals and deployment compatibility are verified.
