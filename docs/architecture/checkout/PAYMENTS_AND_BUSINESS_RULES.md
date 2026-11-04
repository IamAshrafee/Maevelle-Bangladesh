# Payments, inventory, delivery and pricing

R unless marked V. This extends existing Payments/Orders/Finance/Inventory (audit E12–E19), not a new money or stock subsystem. Initial shopper methods are exactly COD, BKASH_MANUAL and NAGAD_MANUAL. Disabled/unapproved methods cannot be selected or placed through direct API calls.

## COD

Placement creates PENDING Order, exact amount due, payment obligation and Inventory allocation. It creates **no received Payment**. Validate serviceable geography, courier COD capability where relevant, active method and Customer COD restrictions; optional risk review places Order ON_HOLD without exposing private risk scores to shopper. Staff confirmation remains distinct from stock reservation and cash receipt.

Fulfillment consumes reserved stock through Inventory. Delivery failure/return does not manufacture a refund or restore sellable stock automatically: Returns receives and inspects stock, Inventory determines condition; fees/losses follow Finance policy. Cancellation before dispatch releases unconsumed reservations; after dispatch uses delivery/return semantics. Never release physically shipped units as if still available in warehouse.

Record actual COD collection with collector/courier custody, value date, evidence/reference and collected amount; enforce not more than outstanding unless an approved excess-receipt exception. Courier-held money is a receivable/custody fact, not cash in Maevelle's bank. Reuse current partial remittance, deductions and settlement operations; reconcile collection→remittance→Finance posting. Deductions need categorized charges/approval, not netting against sale value invisibly. A failed/cancelled delivery with provider-reported collection enters reconciliation, not automatic unpaid cancellation. Short collection, duplicate collection, lost cash and unknown settlement each require an aging exception queue and independent evidence. Completion gate must agree with Orders' real fulfillment and payment policy.

## Manual bKash / Nagad lifecycle

1. Owner selects available method. Quote binds approved receiving-destination revision and exact rounded payable. No PIN, OTP or password field exists in Maevelle.
2. Commit Order/reservation/payment obligation first. Confirmation states “Order received — payment pending,” shows immutable order reference, deadline, method-specific instructions and approved recipient. Show only instructions permitted by merchant agreement; do not assume consumer “Send Money” is an allowed merchant route.
3. Shopper makes transfer in provider's own app/process. Returning to Maevelle can submit reference; sender identifier optional unless provider reconciliation requires it. Claim amount is a hint, never authoritative money. Default no screenshot upload: references plus independent receipt reduce privacy and malicious-file risk. If required later, reuse private Media quarantine, type/size/AV checks, access/retention controls.
4. Claim persists PENDING_VERIFICATION with idempotency and history. Shopper sees “We received your reference. Payment has not yet been verified.” Allow status refresh/recovery without generating a new transfer instruction or a second Order.
5. Authorized reviewer independently checks the actual approved account's merchant statement/app/export: provider, destination revision, unique transfer reference, credited amount/currency, value time, reversal status and correspondence to Order. Record source/evidence locator and reviewer; customer screenshot never satisfies this check. Do not collect provider credentials into the application.
6. Lock Order/intent and claim, consume permanent external receipt identity, record confirmed Payment, cap allocation to remaining amount, create Finance posting and audit/outbox atomically. Duplicate database constraint maps to safe duplicate-reference exception. Repeated verification returns original result.
7. Fulfillment allowed after required amount is verified and restrictions cleared. A claimed payment does not permit dispatch. COD has separate fulfillment policy.

Existing `verifyManualPayment` accepts confirmed amount but lacks a complete independently sourced receipt contract; add that boundary. Existing reference uniqueness applies only while Payment CONFIRMED. R: permanent tenant/provider/receipt-scope uniqueness survives reversals. Confirm whether provider references are global, destination-scoped or reused over time before choosing canonical key; never normalize away meaningful characters based on guessed provider format. Preserve original reference; use provider-aware bounded canonicalization. Cross-tenant deduplication must not disclose another merchant's records.

| Situation | Required outcome and operational recovery |
| --- | --- |
| Partial receipt | Record actual funds, allocate actual amount, leave balance due. Keep fulfillment blocked unless explicit approved partial-payment policy. Show remaining amount and approved deadline; review aging cannot hold stock forever. |
| Overpayment | Record full actual receipt, allocate only outstanding, expose unallocated liability. Resolve through existing Finance/refund semantic extension; no silent revenue inflation, lost balance or fictitious negative Order. Return funds only via authorized refund with independent destination validation. |
| Duplicate claims for same transfer | Preserve claims; only one receipt/payment. Reviewer sees conflict without exposing unrelated shopper data; investigate mistaken attribution or fraud. |
| Incorrect reference | Reject with safe reason, preserve history, allow corrected new claim. No automatic verification merely because reference format looks valid. |
| Wrong Maevelle account | Route to reconciliation; prove account ownership/credit before authorized reallocation. Original intent snapshot stays intact. |
| Wrong third-party account | Explain support/recovery limitations, do not mark paid or fabricate refund from money Maevelle never received. Escalate genuine compromise separately. |
| Receipt after deadline/cancellation | Record real money via exception receipt even if normal intent is closed. Do not resurrect Order or reserve stock automatically. Operator can refund or explicitly create a new eligible Order under fresh pricing/stock and shopper agreement. |
| Paid but reference not submitted | Review unallocated statement receipts; independent match plus identity proof permits semantic allocation. A lost customer submission cannot erase received money. |
| Claimed but statement unavailable | Pending/escalated; no mark-paid shortcut. Show next update expectation; alert before review deadline. |
| Confirmed receipt reversed/incorrectly matched | Audited compensation, reopen correct outstanding balance, block fulfillment if still possible; shipped case becomes financial exception. Preserve original receipt identity. |
| Cancellation/refund | Existing Order cancellation creates obligation, not completed refund. Require approval, payment-out evidence and ledger posting; unknown outcome quarantined until reconciled. |

## Receiving-account management

Payments settings own destinations, not environment literals, product content or checkout source. Store provider, merchant account type, public recipient number/name, currency, approved usage instructions, version and activation status. Secrets used for future APIs belong in existing secret/integration infrastructure. Public account number is display data, but changes are financially critical.

Proposed lifecycle DRAFT→PENDING_APPROVAL→ACTIVE→SUSPENDED/RETIRED. Submitter and approver differ when staff exist; sole Owner exception requires strong reauthentication/MFA, explicit acknowledgement, reason, audit and security notification. Read permission does not grant mutation. Validate format and merchant-account confirmation; perform a separately authorized provider verification before activation. No real verification payment is authorized here.

Active instructions are immutable revisions. At placement recheck destination status under commercial/payment configuration fence. Disable/revoke invalidates open quotes. Ordinary recipient change affects new intents; old pending Orders retain historical instructions and need explicit migration/communication. On suspected compromise, suspend new instructions and claims against unsafe destinations, flag affected pending Orders, preserve evidence, reconcile actual receipts, issue replacement instructions only through audited revision and authenticated channels. Never silently rewrite old destination snapshots or pay refund to a claimant-supplied replacement number without verification.

## Stock meanings and policies

V: existing `sellable_quantity - reserved_quantity` is available-to-sell, and on-hand includes sellable + unavailable. Reserved stock is still physically on hand. R: “committed” describes active Order allocation, not another independent quantity column. Fulfillment consumption reduces physical/sellable/reserved through Inventory once; release makes unconsumed reservation available without increasing physical stock.

COD: reserve only at Order commit, keep while normal Order operationally active. Unconfirmed or held COD needs staff aging SLA and cancellation/review policy, not payment timeout. Fraud controls cap unreviewed orders/quantities and can challenge suspicious purchases.

Manual: reserve at Order commit against configured payment deadline. Existing configuration allows 15 minutes–7 days; that is a validation bound, not justified default. O: select actual window from mobile-transfer completion observations, support hours and scarce-stock impact. No production activation until approved.

Do not attach a blind generic reservation expiry to an ORDER_LINE while Order still promises allocation. Existing generic expiry excludes order-owned lifecycle semantics; keep coordinated Order cancellation/release. Before expiry Worker locks Order and obligation, rechecks verified funds and claims, and atomically cancels unpaid unclaimed Order/release through existing operations. Verification/claim arrival races must have one consistent winner. DB time, not browser countdown, decides.

Pending claims and partial payments need a separate approved **review deadline**, maximum extensions and escalation owner. Never automatically discard real receipts. At deadline: escalate; verify from independent source, reject fraudulent claim or put Order into an explicit stock-release/reallocation exception with shopper notice and refund liability. A fake claim must not renew its deadline indefinitely. Review age and unallocated cash visible to Admin. Cleanup batches use bounded SKIP LOCKED/leases, idempotent keys and poison-work isolation; repeat execution releases stock at most once.

## Delivery and address

Recipient name + normalized mobile + address line + one valid delivery area selection is initial required shape. Collect district/upazila/area only to the resolution needed by real tariff and courier mapping; derive ancestors server-side. Apartment/landmark/instructions and email are optional. Don't require postcode or separate billing address unless verified use requires them. Use real geography search/pagination, no hard-coded Dhaka list.

Validate active node, BD ancestry, serviceability and supported method. A country fallback tariff must not accidentally authorize unsupported areas. Resolve charges from existing `orders.delivery_pricing_rules`; rate-selection priority/specificity is a documented contract. Version rules and snapshot selected rule/name/amount/currency. Courier mapping failures that prevent serviceability block placement with a clear area-reselect/support path. Shipment carrier fees and landed cost remain separate authorities.

Post-placement address correction uses Orders' semantic operation: revalidate serviceability/charge, preserve old snapshot/history, require approval for monetary difference and notify shopper. After booking/dispatch coordinate carrier correction or return; no direct overwrite of courier data. Saved address edits never retroactively edit Orders.

## Money, promotion and tax

V: money numeric(20,4), BigInt scaled helpers and positive half-up multiplication exist; tax currently constrained zero (E10/E13). R: quantities are whole bounded units for these accessories, snapshots retain 4-place exact values. Final wallet/COD payable must use one shared BDT two-decimal half-up boundary **once**; store explicit rounding adjustment and equation, display exactly the amount expected by Payments/Finance. If commercial policy instead guarantees 2-decimal prices so adjustment is zero, enforce it. No binary floating-point computation or `Number(x) || fallback` for zero values.

Gross − discounts + delivery + applicable tax/fee + explicit rounding adjustment = payable; never accept component amounts from browser. Per-line allocated discounts sum exactly to order discount; rounding residual assigned deterministically. Promotion limits/stacking/customer eligibility evaluated and committed under locks. Do not double count recalculated discounts against stale line values. Refund/correction uses signed-safe exact arithmetic and retained original allocations.

O: tax-inclusive/exclusive treatment, registration obligations, fee legality and invoice wording require owner/accountant/legal confirmation. Do not advertise tax-free based on zero constraint. Implement approved policy through existing Pricing/Orders/Finance; migrate zero-tax constraint only when needed. Price/discount/rate/tax changes force transparent quote diff and acknowledgement before submission.

## Open decision register

| ID | Decision / recommended starting position | Owner / gate |
| --- | --- | --- |
| D01 | Approved bKash/Nagad account types, recipients and permitted manual collection flow; keep manual methods inactive until confirmed | Merchant owner + provider + legal; live activation |
| D02 | Manual pay window and bounded claim/partial-payment review SLA, support hours and stock release remedy | Operations owner; payment implementation policy fixtures then activation |
| D03 | COD risk thresholds, confirmation/hold aging, delivery coverage and collection/settlement discrepancy ownership | Operations/Finance; integrated COD acceptance |
| D04 | Tax, fee, BDT rounding and invoice policy | Accountant/owner; quote-money contract before 03A/04A final acceptance |
| D05 | Draft/quote/grant/receipt/audit retention, verified recovery channel, account-history linking | Owner/privacy/security; private-data activation |
| D06 | Conversion policy in measurement document and vendor privacy consent | Marketing/owner/privacy; external adapters off until resolved |
| D07 | Refund/destination approval thresholds and sole-owner exception | Owner/Finance/security; financial Admin acceptance |
| D08 | Merchant obligations, escrow/advance collection, cancellation/refund/delivery promises, complaint contact and registrations | Legal/provider/merchant; production payment activation |

These are visible policy gates, not authorization requests in Phase 00. Development can proceed with explicit synthetic policy fixtures when assigned; do not silently activate guessed business defaults.
