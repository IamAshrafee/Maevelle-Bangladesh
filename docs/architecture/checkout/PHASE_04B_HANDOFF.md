# Phase 04B exact backend-to-frontend handoff

Phase 04A is **PARTIAL**, with local financial-domain evidence in [the report](PHASE_04A_IMPLEMENTATION_REPORT.md) and [verification record](PHASE_04A_VERIFICATION.json). Public financial activation is BLOCKED. Earlier 01B/02B/03A/03B gates remain open. This handoff does not authorize Phase 05 placement, provider operations or deployment.

## Customer boundary

Preserve the authored Checkout shell and Bangladesh-first sequence: choose an eligible method → commit an authoritative Order → receive versioned approved instructions → pay through the provider-approved channel → submit Transaction ID → await independent management verification. Transaction ID is required; sending mobile is optional. No screenshot, PIN, OTP or login collection. No Maevelle-added wallet surcharge, no claimed zero external provider fee, no promised verification SLA.

**There is no new public payment endpoint in 04A.** Do not connect a quote/draft ID, Order number, client amount or generic Admin endpoint to a shopper claim form. Phase 05 must supply a committed Order and secure live owner/recovery grant. Existing contained legacy Order-confirmation access is not a reusable Phase 05 credential. Components may be prepared against explicitly synthetic committed-Order fixtures, remaining unavailable publicly.

Quotes still have `tax:null`, `paymentFees:null`, `payable:null`, `final:false`, `stockReserved:false`, `purchaseAvailable:false`. Do not reinterpret `evaluatedTotal` as money owed. Component acknowledgement is not financial acceptance. Display no payment number or transfer instructions before a valid committed Order. Account numbers come from its immutable backend instruction revision, never source/client constants or live mutable settings.

## Shared types and request conventions

`packages/contracts/src/checkout-payment.ts` exports `CheckoutPaymentMethod`, `ManualPaymentClaimDto`, `IndependentReceiptEvidenceDto`, `ReceivingDestinationInputDto`, `ReceivingDestinationDto`, `PaymentReadinessDto`, and `VerifiedReceiptDto`. Existing payment/refund/detail contracts and functions remain under `@maevelle/database/payments`. Amounts are exact decimal strings; destination/policy revisions are strings. Legacy refund versions are numbers. All successful HTTP operations use `{data:...}`. Domain errors use `{error:{code,message}}`; some unchanged legacy authorization denials retain `{error:'FORBIDDEN'}`. New operations return structured denials. Admin payment/refund responses are `Cache-Control:no-store`.

Use the established Admin session and organization selection (`x-organization-id` when required). Identity alone grants no financial capability. New domain operations reject restricted capability scopes rather than ignoring them. Never echo private evidence or receiving numbers to URLs, analytics or public logs.

## Available Admin operations

Extend the existing Payments and Orders workspaces; do not add unrelated top-level navigation.

| Method/path | Capability | Input / result |
| --- | --- | --- |
| `GET /admin/payments/readiness` | `payments.view` | Three methods, all ineligible; zero merchant-added fee, null external fees/tax/payable and explicit blockers. |
| `GET /admin/payments/destinations?page=1&pageSize=25` | `payments.destinations.view` | Private versioned destination rows and `{page,pageSize,totalItems}`. Page size at most 100. |
| `POST /admin/payments/destinations` | `payments.destinations.edit` | `ReceivingDestinationInputDto`: provider BKASH/NAGAD, category PERSONAL_RETAIL_ACCOUNT/MERCHANT, receivingNumber `01[3-9]…` (11 digits), recipientName, transferAction MERCHANT_PAYMENT/PAYMENT_QR/UNVERIFIED, instructions and financialAccountId. Returns DRAFT revision `1`. |
| `POST /admin/payments/destinations/:id/transitions` | Approve: `payments.destinations.approve`; suspend/retire: `.edit` | `{expectedRevision,action:'APPROVE'|'SUSPEND'|'RETIRE',reason,providerEvidenceReference?}`. Approval requires independent actor and evidence; Nagad approval always blocked. Returns revised destination. |
| `POST /admin/payments/operating-policy-proposals` | `payments.destinations.edit` | `{submissionMinutes,reviewMinutes}`. Bounds 15–10080 and 1–10080 respectively. Actual authenticated proposer is stored. Returns `{id}`. |
| `POST /admin/payments/operating-policies` | `payments.destinations.approve` | `{proposalId,approvalReference}`. A different actor approves the immutable proposal; returns policy `{id}`. Identical proposal approval replays its policy. No production policy is seeded. |
| `GET /admin/payments/claims?page=1&pageSize=25` | `payments.review` | Oldest unresolved claims first. IDs, Order IDs, review state, submission/review times, ageSeconds string and overdue flag; pagination metadata. Use existing attempt detail for reference/Order context. |
| `GET /admin/payments/attempts/:attemptId` | `payments.view` | Existing PaymentAttemptView, including customer reference/expected amount/status. |
| `POST /admin/payments/attempts/:id/review` | `payments.review` | `{state:'UNDER_REVIEW'|'CORRECTION_REQUESTED'|'ESCALATED',note}`. No financial or deadline change. |
| `POST /admin/payments/attempts/:attemptId/verify` | `payments.verify` | `{confirmedAmount,evidence:IndependentReceiptEvidenceDto}` plus `Idempotency-Key`. Returns existing PaymentView, including atomic Finance posting. Evidence mandatory. |
| `POST /admin/payments/attempts/:attemptId/reject` | `payments.verify` | Existing `{reasonCode,note?}`. Preserves rejected testimony and audit/outbox. |
| `GET /admin/payments/:id/receipt` | `payments.view` | VerifiedReceiptDto: original received/allocated/unallocated, remainingUnallocated, disposition and reversed flag. |
| `GET /admin/payments/receipt-exceptions?page=1&pageSize=25` | `payments.review` | Historical excess/late/reversal rows. Original unallocated value is historical; fetch receipt detail for current remaining liability after refunds. |
| `POST /admin/payments/:id/reversal` | `payments.correct` | `{reason,evidenceReference}`. Different actor from verifier; blocks existing refund liabilities. Repeated reversal returns existing receipt. |
| `POST /admin/payments/:paymentId/refunds` | `refunds.manage` | Existing `{amount,reasonCode,reasonText?}` plus `Idempotency-Key`. Excess liability is allocated before commercial refund value. Request is not completed money movement. |
| `POST /admin/refunds/:id/processing` | `refunds.manage` | `{expectedVersion,state:'PROCESSING'|'UNKNOWN_EXTERNAL_OUTCOME'|'FAILED'|'CANCELLED_BEFORE_PROCESSING',evidenceReference}`. Version checked. Unknown outcomes cannot restart transfer processing; reconcile actual outcome first. |
| `POST /admin/refunds/:refundId/complete` | `refunds.manage` | `{externalReference,evidenceReference?,originalSourceVerified?:true}` plus `Idempotency-Key`. For new independently evidenced receipts, both independent evidence and original-source confirmation are required. Posts refund through original Finance account atomically. No arbitrary target number. |

Existing payment/refund lists/details, pending COD collections, actual COD collection and Finance courier settlement operations remain available under their established capabilities. Independent manual verification already posts Finance cash: **do not call the old separate Finance source-post endpoint after approval**. The same applies to completing refunds for new independently evidenced receipts. Legacy/COD posting workflows retain their original semantics; inspect returned `financePosting`.

Verification evidence must contain exact `transactionId`, `receivingNumber`, `currency:'BDT'`, ISO `valueTime` with timezone, `source:'ACCOUNT_HISTORY'|'PROVIDER_STATEMENT'`, private `evidenceReference`, and `financialAccountId`. The actual destination/transaction must match the Order intent and claim. The amount is the actual credited amount, not the claim or expected total. Source references document management's independent check; they are not automated verification.

Review queue states and money statuses are separate. A claim can be under review while unpaid; approved partial funds leave an outstanding balance; excess/late funds carry liabilities. Never show “paid” after submission/review alone. Fully paid eligibility still belongs to Orders/Fulfillment; the server dispatch guard blocks unpaid/partial prepaid Orders. Reversal does not reverse inventory or resurrect an Order.

## UI behavior and recovery

Use shared shadcn/page/form/table/status primitives, exact string money, touch-friendly responsive dialogs and existing locale conventions. A short create/edit form can be a responsive sheet. Receiving details are immutable: to replace a number or action, create a new draft and independently approve it; preserve existing Order instructions. APPROVED means configuration review, not live provider activation. There is deliberately no Activate action. A justified single-Owner exception/fresh reauthentication path is not enabled and must not be simulated in the client.

Persist a verification/refund write intent privately for exact-key/body retry; do not generate a new key after a timeout. A missing response is not rejection or success. Same key with changed amount/evidence conflicts. Repeat identical approval can return the existing Payment. Show stale-revision reload, duplicate-reference reconciliation, mismatched-evidence correction and policy blockers clearly. Unknown refund transfer outcome disables transfer retry until independent reconciliation. No automatic external transfer/checking is supported.

Typical errors: `FORBIDDEN` 403; `NOT_FOUND` 404; `IDEMPOTENCY_CONFLICT`, `CONFLICT`, `DUPLICATE_EXTERNAL_TRANSACTION`, `PAYMENT_ATTEMPT_ALREADY_REVIEWED`, `REFUND_ALREADY_COMPLETED` 409; `POLICY_BLOCKED`, `PAYMENT_METHOD_UNAVAILABLE`, `VALIDATION_FAILED`, `REFUND_EXCEEDS_REFUNDABLE` 422. Schema violations return 400. Treat lock/transport failures as unknown/retryable with the same immutable write intent; never invent a successful financial result.

Destination creation and policy proposals create drafts and are not transfer operations. A failed response may leave a draft; reload its private listing rather than assuming none exists. Destination transition retries may require reloading the revision. Growing queues are server paginated and ordered; empty out-of-range pages preserve the total count. Recover to an in-range page after deletions or status changes.

## Phase 05 boundary and unresolved dependencies

`prepareCheckoutPaymentObligationInTransaction` currently always throws `POLICY_BLOCKED`. Its future inputs bind organization, committed Order, quote ID/fingerprint, exact root revision, method and optional destination/policy revision IDs. Do not call legacy Order placement to bypass it. The eventual implementation must re-evaluate shared quote authority, final tax/fees/BDT rounding, method/configuration/destination revision, coverage/customer/courier eligibility and exact obligation equality in the same placement transaction as Inventory, Promotions, Cart conversion, receipt and outbox. No such placement implementation is provided here.

Existing internal `createPaymentIntentForOrder` can bind an approved operatingPolicyId for synthetic/established Order workflows. It validates committed Order equality. It does not authorize new Checkout placement or constitute a public receiving destination activation path. Legacy null review policies are preserved and need an explicit remediation decision; fake claims cannot extend a configured absolute review deadline. Overdue notification/expiry races use existing Worker and Orders semantics.

Before public use obtain actual bKash/Nagad account/product/instructions/fees/limits and identity semantics; accountant tax/invoicing/rounding approval; advance-payment/legal/privacy/retention acceptance; approved numbers/deadlines/staffing; real delivery/COD compatibility; committed-Order grants/recovery; deployed IAM/ingress/backup/upgrade compatibility; representative load and owner/browser/device acceptance. Provider approval cannot be manufactured with synthetic test data. Phase 04B must report unavailable pieces honestly and preserve all existing quote/purchase gates.
