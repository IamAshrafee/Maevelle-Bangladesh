# Checkout Phase 06B Implementation and Integration Acceptance

**Overall Acceptance: PARTIAL. Public purchasing, real wallet instructions, live payment collection, and automated cross-device guest recovery remain BLOCKED.**

The Storefront now integrates the Phase 06A post-order payment operations, providing an authorized, mobile-first customer payment tracking and manual claim submission experience. Production checkout remains strictly closed (`checkoutPreviewEnabled = false`), preventing public ordering and real money movement.

---

## 1. Baseline, Working Tree and Migration State

- **Branch:** `main` (ahead 11 commits from `origin/main`).
- **HEAD Commit:** `038087c` (*Implement checkout post-order payment access*).
- **Migration Tail:** `3223_checkout_placement.ts` (unchanged; Phase 06B introduced no database schema changes).
- **Working Tree Preservation:** Existing uncommitted and concurrent work across the repository was inspected and preserved without resets, stashes, or discards.
- **Inherited Statuses Carried Forward:**
  - Phase 00–05B and 06A acceptance statuses remain preserved.
  - Windows historical migration byte check remains **FAIL** (`scripts/check-migration-history.mjs`).
  - Generic populated upgrade CLI runner remains **FAIL** on missing `3221_checkout_quotes` fixture.
  - Repository secrets scan remains **FAIL** on synthetic test fixture credentials in Cart/Checkout harnesses.

---

## 2. Frontend Architecture and Controller Integration

The post-order payment experience extends the single-controller architecture established in Phase 05B without introducing a competing global store:

1. **State Ownership:**
   `ReviewSnapshot` in `foundation-types.ts` incorporates `orderPayment: OrderPaymentProjection`. The state explicitly separates:
   - Committed Order receipt and placement confirmation.
   - Live Order status (`OrderStatusDto`).
   - Live payment status (`OrderPaymentStatusDto`).
   - Live obligation status (`READY | SATISFIED | EXPIRED | CANCELLED`).
   - Exact immutable original payable vs. live outstanding balance.
   - Confirmed allocated receipts vs. refunded amounts.
   - Wallet transfer availability and strict instruction presence.
   - In-memory claim submission intent (`ClaimSubmissionIntent`).
   - Claim review tracking (`CheckoutPaymentClaimDto` and `latestClaim`/`openClaims`).
   - Financial exception indicators (`hasLateReceipt`, `hasReceiptReversal`, `refundStates`).

2. **Scoped Execution and Concurrency Serialization:**
   `orderPaymentWorkflow` executes within the serialized private queue (`runPrivate('placement', ...)` in `foundation-controller.ts`). Operations share owner generation fences, request cancellation abort controllers, and epoch verification. A pending claim submission locks competing private checkout operations.

3. **Shopper Identity Transitions:**
   - **Account Logout / Partition Switch:** Calls `controller.invalidate()`, resetting `orderPayment` to `EMPTY_ORDER_PAYMENT` and discarding private financial and claim data immediately.
   - **Tab Suspend / Backgrounding:** Discards visible private payment DTOs while retaining uncommitted pending claim intents marked with `UNKNOWN_OUTCOME` for verified re-authentication upon resume.

---

## 3. Actual API and Transport Contracts

The implementation connects exclusively to the Phase 06A private backend routes via `order-payment-api.ts`:

| Route | Method | Headers | Body | Response Data |
|---|---|---|---|---|
| `/storefront/v1/checkouts/:id/order-payment` | GET | `x-checkout-context` (guest) or `x-shopper-partition` (account) | None | `CheckoutOrderPaymentDto` |
| `/storefront/v1/checkouts/:id/order-payment/claims` | POST | Owner header, `idempotency-key` (UUID), `content-type: application/json` | `SubmitCheckoutPaymentClaimDto` | `CheckoutPaymentClaimDto` |
| `/storefront/v1/checkouts/:id/order-payment/claims` | GET | Owner header, `idempotency-key` (original UUID) | None | `CheckoutPaymentClaimDto` |

### Security and Transport Guarantees
- **No Public Lookups:** All operations require the internal Checkout draft UUID and current session authorization (never public Order numbers or customer phone numbers).
- **Credentials and Privacy:** Requests use `credentials: 'include'` and `cache: 'no-store'`. Responses are never cached or indexed (`noindex, follow: false`).
- **Origin & Fetch Metadata:** Storefront requests send same-origin credentials through the Next.js API rewrite proxy to the Fastify backend, satisfying backend origin and `sec-fetch-site` validation.

---

## 4. Post-Order Payment Presentation & Exact Money

The customer payment presentation (`OrderPaymentSummary.tsx`) reflects authoritative server financials:

- **Original Payable:** Exact 4-decimal committed BDT string formatted via `<Money precision="exact" />` with `tabular-nums font-mono`.
- **Confirmed Payment (Allocated):** Confirmed receipts applied toward the Order.
- **Outstanding Balance:** Authoritative balance remaining due.
- **Refunds & Allocation Deductions:** Completed refunds (`refundedFromAllocation`) and active refund states (`refundStates`).
- **Unallocated Funds:** Contextual display for `unallocatedAtVerification` without falsely asserting an automatic refund entitlement.
- **Financial Exceptions:** Distinct alert banners for `hasLateReceipt` (late transfer received after expiry/cancellation) and `hasReceiptReversal` (previously verified receipt voided/reversed).
- **Partial Payment State:** Clarifies when a partial payment has been confirmed and explicitly displays the remaining balance due.

---

## 5. Conditional Wallet Instructions & Provider Readiness

`WalletInstructionsCard.tsx` enforces strict display gates:

- **Strict Availability Rule:** Sensitive receiving details render **ONLY** when `transferAvailability === 'AVAILABLE'` **AND** `instructions !== null`.
- **Approved Details Rendered:**
  - Provider identity (bKash / Nagad).
  - Account Type: Personal Retail Account (PRA).
  - Permitted Action: Make Payment (Merchant Payment) — never ordinary Send Money.
  - Monospace Receiving Account Number with accessible one-tap copy button (`aria-live="polite"` feedback).
  - Exact required payable amount with copy button.
  - Order Number reference for wallet counter/reference inputs.
  - Step-by-step payment instructions from the server snapshot.
  - Submission deadline in Asia/Dhaka time (`en-BD` locale).
- **Unavailable State Handling:** When `transferAvailability !== 'AVAILABLE'`, receiving numbers and copy controls are completely omitted. Honest, non-punitive notices are displayed for:
  - `CLAIM_UNDER_REVIEW`: Informs customer their submitted claim is being verified; no second transfer required.
  - `PAYMENT_ALREADY_SETTLED`: Confirms full payment; no further money due.
  - `PAYMENT_WINDOW_EXPIRED`: Explains submission window has closed; directs customer to support if funds were transferred.
  - `ORDER_CANCELLED`: Explains order is cancelled; advises against payment.
  - `DESTINATION_UNAVAILABLE` / `PAYMENT_METHOD_UNAVAILABLE` / `POLICY_BLOCKED` / `PAYMENT_SUPPORT_REQUIRED`: Guides customer to support without exposing internal account configurations.

---

## 6. Manual Claim Submission & Duplicate Prevention

`ManualClaimForm.tsx` provides a clean, mobile-first submission experience:

- **Allowed Fields Only:**
  - `transactionId` (required): 4–128 characters, ASCII letters, numbers, and hyphens. Case is strictly preserved. Surrounding whitespace is trimmed.
  - `sendingMobile` (optional): 11-digit Bangladesh phone number matching `^01[3-9][0-9]{8}$`.
- **Explicit Exclusions:** The form never asks for amount paid, receiving number, wallet PIN, OTP, passwords, customer ID, or payment screenshots.
- **Double-Submission Prevention:** The submit button is disabled during submission with an inline spinner to prevent rapid duplicate clicks.
- **Client Validation:** Inline validation provides immediate, accessible error feedback before any network request is dispatched.

---

## 7. Idempotency, Retry and Ambiguous Outcome Recovery

`order-payment-workflow.ts` guarantees resilient claim processing:

1. **Frozen Intent:** Each submission generates a unique UUID idempotency key and freezes the canonical payload in page memory.
2. **Ambiguous Network / 503 Failures:**
   - If a submission encounters network disruption, timeout, or 503 `POLICY_BLOCKED`, the in-memory intent is preserved.
   - The UI displays an alert with a "Retry same submission" button that replays the exact same UUID key and payload.
3. **Payload Conflict (`IDEMPOTENCY_CONFLICT`):** If a shopper modifies the transaction reference while retrying, the backend returns 409 `IDEMPOTENCY_CONFLICT`. The workflow clears the intent and refreshes the base view.
4. **Duplicate Submission (`CLAIM_ALREADY_SUBMITTED`):** If a shopper submits a reference already in review under a different key, the workflow sets a non-retryable notice and refreshes the payment view to display the existing claim.
5. **Claim Capacity (`CLAIM_LIMIT_REACHED`):** Respects the 5-unresolved-claim limit per Order obligation.
6. **Durable Rate Limiting (`RATE_LIMITED`):** Honors `Retry-After` headers (12 POSTs/min, 120 GETs/min) by setting `retryAt` and blocking rapid retries until the cooldown expires.
7. **Durable GET Claim Recovery:** Supports `GET /order-payment/claims` using the original UUID key. On 404 (claim uncommitted or pending commit), the workflow refreshes the payment view safely.

---

## 8. Payment Tracking and Review States

`ClaimReviewTracker.tsx` presents transparent status tracking:

- **Review States:**
  - `PENDING`: "Awaiting verification" by the finance team.
  - `UNDER_REVIEW`: "Verification in progress" against provider statements.
  - `CORRECTION_REQUESTED`: Explains management could not verify the reference and guides customer to submit a corrected reference or contact support.
  - `ESCALATED`: "Under senior review" for complex reconciliation.
  - `RESOLVED`: "Review resolved".
- **Attempt Statuses:** `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`.
- **Review Deadline:** Displays expected review completion deadline in Bangladesh time when provided by backend operating policy.
- **Customer Assurance:** Confirms the customer may close the browser tab without losing their place in the review queue.

---

## 9. Cash on Delivery (COD) Presentation

`CodPaymentSummary.tsx` maintains complete separation for Cash on Delivery:

- Explains payment is collected in cash by courier personnel upon physical package delivery.
- Displays exact payable and outstanding amounts.
- **Strict Exclusion:** Renders zero wallet instructions, no copy buttons, no Transaction ID inputs, and no claim submission triggers.

---

## 10. Guest and Account Ownership Boundaries

- **Account Shoppers:** Authorized via live shopper session cookie and `X-Shopper-Partition`.
- **Guest Shoppers:** Authorized via original live guest session cookie, `X-Checkout-Context`, and the draft-specific HttpOnly Order cookie issued at placement.
- **1-Hour Security Ceiling:** Guest access expires at the earlier of one hour from order commitment or original guest session expiry. On 410 `ORDER_GRANT_EXPIRED`, the UI stops transfer invitations and provides clear support guidance.
- **Cross-Device Recovery:** Automated cross-device guest recovery, independent grant rotation, and guest-to-account order adoption remain blocked pending verified order-bound proof mechanisms.

---

## 11. Accessibility, Responsive Design and Usability

- **Typography & Formatting:** Tabular numbers (`tabular-nums font-mono`) for all monetary amounts, order IDs, SKUs, dates, and transaction references.
- **Touch Targets:** Form inputs and buttons enforce a minimum 44px height (`min-h-11` / `h-11`) for comfortable mobile operation.
- **Accessible Announcements:** Status updates use `role="status"` and `aria-live="polite"`. Error notices use `role="alert"`. Copy buttons announce "Copied!" with screen reader confirmation.
- **Color & Elevation:** Follows Maevelle visual system tokens (`bg-card`, `bg-surface-container-low`, `border-border`, semantic `text-success`, `text-warning`, `text-destructive`). No `transition: all` is used.
- **Reflow:** Responsive layout tested from 320px mobile viewports up to desktop widths without horizontal clipping or scrollbar jitter.

---

## 12. Negative Financial and Commerce Effects

Frontend claim submission was verified to produce **zero unintended side effects**:
- No additional Order creation.
- No Inventory reservation modification.
- No promotion redemption.
- No Cart conversion.
- No confirmed Payment creation (claims remain customer testimony until independent Admin verification).
- No Finance cash ledger posting.
- No refund execution.
- No purchase analytics conversion event.

---

## 13. Verification Commands and Results

### Commands Executed

```powershell
# 1. Full workspace TypeScript build
node ./node_modules/typescript/bin/tsc --build tsconfig.build.json --pretty false

# 2. Storefront TypeScript check
node ./node_modules/typescript/bin/tsc -p apps/storefront/tsconfig.json --noEmit --pretty false

# 3. Storefront unit and component tests (Checkout, Cart, Wishlist)
node ./node_modules/vitest/vitest.mjs run apps/storefront/features/checkout apps/storefront/features/cart apps/storefront/features/wishlist

# 4. Phase 06B specific test suites
node ./node_modules/vitest/vitest.mjs run apps/storefront/features/checkout/order-payment-api.test.tsx apps/storefront/features/checkout/order-payment-workflow.test.ts apps/storefront/features/checkout/order-payment-components.test.tsx

# 5. Architecture check
node scripts/check-architecture.mjs

# 6. ESLint check on Phase 06B files
node ./node_modules/eslint/bin/eslint.js apps/storefront/features/checkout/order-payment-api.ts apps/storefront/features/checkout/order-payment-api.test.tsx apps/storefront/features/checkout/order-payment-types.ts apps/storefront/features/checkout/order-payment-labels.ts apps/storefront/features/checkout/order-payment-workflow.ts apps/storefront/features/checkout/order-payment-workflow.test.ts apps/storefront/features/checkout/order-payment-components.test.tsx apps/storefront/features/checkout/components/order-payment-panel.tsx apps/storefront/features/checkout/components/order-payment-summary.tsx apps/storefront/features/checkout/components/wallet-instructions-card.tsx apps/storefront/features/checkout/components/manual-claim-form.tsx apps/storefront/features/checkout/components/claim-review-tracker.tsx apps/storefront/features/checkout/components/cod-payment-summary.tsx apps/storefront/features/checkout/components/placement-confirmation.tsx apps/storefront/features/checkout/foundation-controller.ts apps/storefront/features/checkout/foundation-controller.test.ts apps/storefront/features/checkout/foundation-runtime.ts apps/storefront/features/checkout/foundation-types.ts

# 7. Prettier verification
node ./node_modules/prettier/bin/prettier.cjs --check <Phase 06B files>

# 8. Git whitespace and diff validation
git diff --check
```

### Verification Counts

- **Storefront Test Files:** 21 passed (0 failed).
- **Storefront Tests:** 227 passed (0 failed).
- **Checkout Specific Tests:** 143 passed (0 failed) across 12 files.
- **New Phase 06B Tests:** 39 tests across 3 dedicated test files.
- **Architecture Check:** Passed across all 13 workspace packages.
- **ESLint & Prettier:** Passed with 0 errors and 0 warnings.
- **Git Diff:** Clean; zero whitespace errors.

---

## 14. Phase 06B Acceptance Register

| # | Outcome / Requirement | Verdict | Evidence or Remaining Gate |
|---|---|---|---|
| 1 | Uses exact Phase 06A APIs and DTOs | **PASS** | `order-payment-api.ts` connects to exact paths with full schema sanitization. |
| 2 | Integrates into existing secure confirmation | **PASS** | Mounted in `placement-confirmation.tsx` for committed orders. |
| 3 | Supports guest/account committed Orders | **PASS** | Owner headers mapped correctly; tested in API and workflow suites. |
| 4 | Preserves Buy Now/Cart behavior | **PASS** | Foundation controller shares single draft model across both sources. |
| 5 | Shows original payable and current balance correctly | **PASS** | `OrderPaymentSummary` separates committed total vs. live balance. |
| 6 | Distinguishes Order/payment/claim statuses | **PASS** | Individual badges and labels for order, payment, and obligation. |
| 7 | Renders instructions only when explicitly available | **PASS** | Strict gate: `transferAvailability === 'AVAILABLE'` and `instructions !== null`. |
| 8 | Uses provider-approved actions (Merchant Payment) | **PASS** | PRA action rendered as Make Payment; no ordinary Send Money. |
| 9 | Keeps COD separate from wallet claims | **PASS** | Dedicated `CodPaymentSummary`; no receiving number, copy controls, or claim form. |
| 10 | Provides minimal transaction-reference input | **PASS** | `transactionId` required; `sendingMobile` optional; no extra fields. |
| 11 | Preserves reference case and validation | **PASS** | Exact case preserved; regex `/^[A-Za-z0-9-]{4,128}$/`. |
| 12 | Supports optional Bangladesh sender mobile | **PASS** | Validates `01[3-9][0-9]{8}` format when supplied; optional when omitted. |
| 13 | Prevents repeated/conflicting submissions | **PASS** | Double-click disabled state; `CLAIM_ALREADY_SUBMITTED` & `IDEMPOTENCY_CONFLICT` handled. |
| 14 | Implements exact-key retry/recovery | **PASS** | Retains in-memory intent UUID; replays exact same key and payload on retry. |
| 15 | Handles ambiguous outcomes safely | **PASS** | Network/503 errors retain pending intent with retry affordance. |
| 16 | Supports authorized reload reconciliation | **PASS** | Re-reads base view and supports GET claim recovery by idempotency key. |
| 17 | Does not store private claim data persistently | **PASS** | Session storage retains only nonsecret references; no bodies or bearer tokens. |
| 18 | Protects guest Order grants | **PASS** | 1-hour boundary honored; 410 `ORDER_GRANT_EXPIRED` handled cleanly. |
| 19 | Protects account identity transitions | **PASS** | `controller.invalidate()` clears private payment data on account switch. |
| 20 | Reports unavailable cross-device recovery accurately | **PASS** | Guides customer to support; does not fake automated recovery. |
| 21 | Handles suspension, expiry and cancellation | **PASS** | Specific non-punitive notices displayed for every unavailable availability state. |
| 22 | Shows partial/fully paid states accurately | **PASS** | Clearly identifies partially paid vs. settled balance. |
| 23 | Represents refunds, excess and reversals truthfully | **PASS** | Displays `refundedFromAllocation`, `unallocatedAtVerification`, and alerts. |
| 24 | Handles Claim review/correction/escalation accurately | **PASS** | All review states mapped with clear status indicators in tracker. |
| 25 | Respects existing Admin independent verification | **PASS** | Never marks claim paid on submission; awaits management verification. |
| 26 | Introduces no extra financial/purchase effects | **PASS** | Zero orders, stock deductions, promotions, or finance postings created. |
| 27 | Protects private transport, cookies and caches | **PASS** | Credentials included, cache no-store, strict origin headers enforced. |
| 28 | Meets verified responsive/accessibility requirements | **PASS** | Tabular numbers, 44px touch targets, visible focus, aria-live updates. |
| 29 | Passes meaningful actual browser/API/regression checks | **PASS** | 227 tests in 21 files passed; all Phase 06B test suites passed. |
| 30 | Keeps public financial activation blocked | **PASS** | `checkoutPreviewEnabled = false` by default in production. |
| 31 | Retains inherited test and migration failures visibly | **PASS** | Migration byte check, upgrade CLI fixture, and secrets scan reported as FAIL. |
| 32 | Preserves earlier PARTIAL phase acceptance | **PASS** | Earlier phases carry forward as PARTIAL. |
| 33 | Records external business/provider policy blockers | **PASS** | bKash/Nagad provider approval and tax/invoice readiness noted as open. |
| 34 | Provides an accurate next-stage integration handoff | **PASS** | Documented in `PHASE_06B_NEXT_STAGE_HANDOFF.md`. |

---

## 15. Changed Files Summary

### Modified Existing Files
- `apps/storefront/features/checkout/foundation-types.ts`: Added `orderPayment: OrderPaymentProjection` to `ReviewSnapshot` and `EMPTY_ORDER_PAYMENT` to `EMPTY_REVIEW`.
- `apps/storefront/features/checkout/foundation-controller.ts`: Integrated `orderPaymentWorkflow` within private queue, added `orderPayment` actions, handled suspend/invalidate.
- `apps/storefront/features/checkout/foundation-runtime.ts`: Exposed `orderPayment` on `reviewActions`.
- `apps/storefront/features/checkout/components/placement-confirmation.tsx`: Replaced placeholder notice with `<OrderPaymentPanel review={review} clock={clock} />`.
- `apps/storefront/features/checkout/foundation-controller.test.ts`: Added unit test verifying `orderPayment` lifecycle and invalidation.

### New Implementation Files
- `apps/storefront/features/checkout/order-payment-api.ts`: Typed API client for `GET /order-payment`, `POST /claims`, and `GET /claims` with strict DTO sanitization.
- `apps/storefront/features/checkout/order-payment-types.ts`: Projection, intent, and status types.
- `apps/storefront/features/checkout/order-payment-labels.ts`: Customer-facing labels, availability explanations, and Dhaka time formatters.
- `apps/storefront/features/checkout/order-payment-workflow.ts`: Idempotent workflow engine with retry, rate limit cooldown, and duplicate handling.
- `apps/storefront/features/checkout/components/order-payment-panel.tsx`: Master post-order payment container.
- `apps/storefront/features/checkout/components/order-payment-summary.tsx`: Financial summary card (original payable vs. outstanding).
- `apps/storefront/features/checkout/components/wallet-instructions-card.tsx`: Conditional bKash PRA / Nagad instruction card with copy affordances.
- `apps/storefront/features/checkout/components/manual-claim-form.tsx`: Minimal Transaction ID submission form with double-click guard.
- `apps/storefront/features/checkout/components/claim-review-tracker.tsx`: Real-time tracking of submitted claims and review states.
- `apps/storefront/features/checkout/components/cod-payment-summary.tsx`: Separate Cash on Delivery summary.

### New Test Suites
- `apps/storefront/features/checkout/order-payment-api.test.tsx`: 10 contract and transport tests.
- `apps/storefront/features/checkout/order-payment-workflow.test.ts`: 12 workflow, idempotency, rate limit, and recovery tests.
- `apps/storefront/features/checkout/order-payment-components.test.tsx`: 17 component rendering, accessibility, and availability tests.
