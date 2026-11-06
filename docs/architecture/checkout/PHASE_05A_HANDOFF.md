# Checkout Phase 05A — exact backend handoff

2026-11-05. Phase 04B local acceptance is **PARTIAL**; public purchases and collection remain **BLOCKED**. See [04B report](PHASE_04B_IMPLEMENTATION_REPORT.md), [integrated verification](PHASE_04B_VERIFICATION.json) and [browser evidence](PHASE_04B_BROWSER_VERIFICATION.json). This document prepares the next assignment; no Phase 05 implementation or activation is authorized by the handoff itself.

## Current authority and deliberate gaps

Cart and Buy Now converge through Checkout roots and immutable quote components. Root/source/address/configuration changes invalidate prior review. `tax:null`, `paymentFees:null`, `payable:null`, `final:false`, `stockReserved:false` and `purchaseAvailable:false` remain meaningful. `evaluatedTotal` is not payable. Read current shared contracts and quote evaluation/application code before placement work; older reports do not prove current readiness.

`prepareCheckoutPaymentObligationInTransaction` in `packages/database/src/payments/operating-policy.ts` accepts organization/Order/quote/fingerprint/root revision/method/destination revision/policy references, but **always throws `POLICY_BLOCKED`**. Its shape is a future transaction boundary, not permission to collect funds. Do not replace that guard with a generic call that trusts the client.

Existing `createPaymentIntentForOrder` in `packages/database/src/payments.ts` locks and checks the existing Order's organization, number, currency, method and exact total. A supplied operating policy must resolve to an approved same-organization policy. It still uses legacy active-method instructions and is not a complete Checkout placement/destination-selection boundary. It does not establish quote freshness, secure customer access, provider activation or approved final payable. Keep it as an internal semantic operation; do not expose it as a public arbitrary-Order endpoint.

## Financial operations already available

Phase 04A mutation contracts are listed in [04B's incoming handoff](PHASE_04B_HANDOFF.md). They remain authoritative:

- Receiving destination draft and revision-checked APPROVE/SUSPEND/RETIRE; creation and approval require distinct actors. Nagad approval blocked; no activation endpoint.
- Immutable operating-policy proposal and independently approved revision. New placements must reference an explicit approved policy; do not silently inherit arbitrary historical null review deadlines.
- Customer testimony stored separately from independent ACCOUNT_HISTORY/PROVIDER_STATEMENT evidence. Admin verify requires exact reference/destination, actual amount, BDT value time/source/evidence and Finance account.
- Permanent actual-transfer duplicate fence; actual receipt, allocations, excess/late liabilities and Finance posting commit atomically. Partial receipt leaves outstanding; late funds do not reopen cancelled Orders.
- Receipt detail gives original and current remaining liability; reversal needs independent actor and blocks refund overlap.
- Refund request/processing/unknown/completion are distinct. Unknown payout must be reconciled before another transfer; original-source evidenced completion posts through the original Finance account atomically.
- Existing COD collection, courier custody and Finance settlement retain their own lifecycle. Neither COD placement nor courier custody is settled merchant cash.
- Existing approved-policy expiry/review aging and Worker operations must share Order/payment locking, preserving verification-versus-expiry serialization.

04B adds only Admin reads: `/admin/payments/attempts/:id/workspace` (repeatable-read original snapshot, currency, allocated/outstanding and Payment link), `/admin/payments/operating-policies?page=1` (stored proposal/approval provenance), richer bounded claims and receipt `verifiedBy`. Authorization remains server-side, tenant-scoped and capability-specific. No customer endpoint was added.

## Required placement boundary

1. Resolve the actual live Checkout owner from authenticated shopper identity or an explicitly designed guest grant. Root/quote/Order UUIDs and revision strings are preconditions, never credentials. Recheck revoked/moved ownership and organization before exposing status or instructions.
2. Serialize one durable placement intent. Freeze the reviewed quote/fingerprint, expected root revision, source, delivery/contact snapshot and selected payment policy/destination versions. Same-key replay returns the same committed result; changed input conflicts. Recover an unknown commit from authorized server truth without making a second Order.
3. Revalidate current source version/Cart selection or Buy Now quantity, Catalog eligibility, exact Pricing/Promotions allocations, stock, approved delivery coverage/tariff/courier compatibility and quote expiry/configuration revisions. Material changes require explicit review; no silent price/method/address substitution.
4. Resolve approved tax, invoice, fee and rounding policy into a final exact payable. Preserve zero versus unknown. Maevelle-added manual-wallet surcharge stays zero; provider fees are not declared zero without evidence. Decide settlement precision and allocation residual rules on the server.
5. Within one deliberate database transaction, create the Order and immutable commercial/delivery/receiving/policy snapshots, reserve inventory through Inventory's semantic operations, redeem eligible Promotions exactly once, create the matching Payment obligation and record Cart conversion where appropriate. Buy Now must not mutate the Cart. Use established lock order and transactional audit/outbox; no provider/network call inside the transaction.
6. Selected destination must be same-organization, correct provider/category/action, independently approved and actually eligible for public use under explicit activation policy. Snapshot its version, receiving details and permitted action; later suspension/replacement must not silently rewrite committed Orders. Define revalidation and concurrent suspension behavior. Current internal APPROVED alone is insufficient.
7. Keep money authority in Payments/Finance. Manual verification/completed refund already post atomically; do not add duplicate source posting. Placement records an obligation rather than incoming funds. COD remains unpaid until actual collection, with custody/settlement handled separately.
8. Commit success before notifications/analytics/courier effects. Reuse the existing outbox/Worker. Conversion events must follow actual committed placement policy, never button click, draft, quote, payment testimony or synthetic preview.

Design fresh/upgrade migrations only if the final schema needs them, with forward-only compatibility and rollback/repair planning. Do not edit historical migrations or baseline hashes to make the inherited Windows byte failure disappear. No persistent migration or deployment belongs to this handoff.

## Secure committed-Order access and recovery

Define separate bounded public/shopper contracts for authorized Order confirmation/status, original instructions, permitted claim submission and recovery. An authenticated shopper must own the Order in the current tenant; a guest needs a deliberate unguessable, revocable, purpose-bound grant with expiry/rotation/recovery and abuse limits. Never reuse the contained legacy confirmation fallback or accept Order number, raw UUID, quote ID, submitted contact or client amount as proof of ownership. Grants must survive intended recovery without leaking through URLs/logs/analytics/storage/referrers.

Claim input should require Transaction ID, allow optional sending number and exclude screenshots/PIN/OTP/passwords. Server derives Order, expected amount, destination and policy; testimony cannot mark paid or extend stock holds indefinitely. Preserve private/no-store responses, structured envelopes, bounded history, Origin/session/tenant protection and durable limits. Design account/guest transition, revoked grants, resend/recovery abuse and unknown-response semantics before exposing a submit action.

## Frontend integration after authority exists

Admin already supports the Phase 04A routes in `/payments`, including real policy selection, blank independent evidence, actual/current balances and safe unknown outcomes. Preserve its exact-key/body owner-scoped recovery and least privilege. Add an authorized Order link/status context from actual placement without another payment store or calculator.

Storefront currently renders `PaymentMethodsUnavailable`. `SyntheticOrderPaymentPreview` is explicitly synthetic, unmounted and disabled. It must not be made live by removing the label alone. Introduce a separately typed committed-Order response backed by live grants, exact final payable and original destination snapshot, then integrate through the existing owner-aware Checkout controller. Public method eligibility needs a purpose-built safe contract; never call Admin readiness/destination APIs from the shopper. Keep Transaction ID required, sender optional, simple Bangladesh-first wording and accurate COD/pending/partial/paid status/recovery.

## Verification and activation gates

Use isolated real PostgreSQL for transaction rollback, concurrent placement/same key, stock/promotion races, changed evidence/key conflict, owner/grant revocation, expiry-versus-verification, destination suspension, partial/excess/late money and refund/reversal overlap. Test both Cart and Buy Now and guest/account paths without Buy Now Cart mutation. Assert one Order/reservation/redemption/payment obligation/outbox result for one accepted placement and no effects on rejection. Exercise application post-commit response loss separately from physical database/network failure, and real browser identity changes and recovery. Preserve notifications and downstream event semantics.

Still blocked: provider onboarding/allowed actions/fees/limits, Nagad category availability, legal/tax/invoice/rounding, real delivery/courier acceptance, public operating policies, legacy null-review-policy remediation, privacy/retention, secure guest/account Order grants and public placement. Human AT/native zoom/physical devices, complete Admin browser fault/race/state breadth, deployed IAM/ingress/log-sink behavior, representative load, migration byte history and prior 01B/02B/03A/03B/04A PARTIAL gates remain open. Local fixture approval and passing builds do not close any external gate.
