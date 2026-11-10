# Checkout Phase 06B Next-Stage Integration Handoff

This document records the exact state of the Storefront post-order payment integration at the conclusion of **Phase 06B** and identifies the technical boundaries, open policy gates, and recommended next steps for subsequent checkout milestones.

---

## 1. Implemented Customer Capabilities

1. **Authorized Post-Order Payment Access:**
   - Shoppers revisit or remain on the Checkout confirmation page and view live payment status derived directly from server Payments authority.
   - Access requires the committed draft UUID and active credentials (shopper session cookie for accounts; guest session cookie + draft-specific HttpOnly Order cookie for guests).

2. **Accurate Financial Presentation:**
   - Displays immutable original payable vs. live outstanding balance due.
   - Shows confirmed allocated payments, completed refunds, and historical unallocated verification context.
   - Surfaces indicators for late receipts (transfers received after deadline/cancellation) and receipt reversals without concealing historical facts.

3. **Strict Conditional Wallet Instructions:**
   - bKash PRA and Nagad instructions appear **only** when `transferAvailability === 'AVAILABLE'` and instructions are explicitly present.
   - Uses approved business collection workflows (`MERCHANT_PAYMENT` / Make Payment) rather than ordinary Send Money.
   - Accessible copy affordances for receiving number, exact amount, and Order reference with clipboard feedback.
   - When unavailable (settled, expired, cancelled, suspended destination, or claim in review), instructions are omitted and replaced by clear, non-punitive guidance.

4. **Minimal Transaction ID Claim Submission:**
   - Accepts only `transactionId` (4–128 characters, ASCII letters, numbers, hyphens, case preserved) and optional `sendingMobile` (11-digit BD format).
   - Never requests amount paid, receiving number, screenshots, wallet PIN, OTP, passwords, or customer ID.
   - Prevents double-click duplicate requests; provides inline validation.

5. **Durable Idempotent Recovery:**
   - Preserves frozen intent with UUID key in memory for ambiguous outcomes (network drop, timeout, 503).
   - Replays exact same key on retry; respects `IDEMPOTENCY_CONFLICT` if body is modified.
   - Reconciles `CLAIM_ALREADY_SUBMITTED` by displaying the existing claim in review.
   - Supports GET claim recovery with the original UUID key.
   - Enforces 5-unresolved-claim limit per Order and honors durable rate limits (`Retry-After`).

6. **Dedicated Cash on Delivery (COD) Presentation:**
   - Displays cash due upon delivery.
   - Strictly excludes wallet numbers, copy controls, and claim submission forms.

7. **Claim Status & Review Tracking:**
   - Tracks claims through `PENDING_VERIFICATION`, `VERIFIED`, and `REJECTED`.
   - Explains review states (`PENDING`, `UNDER_REVIEW`, `CORRECTION_REQUESTED`, `ESCALATED`, `RESOLVED`).
   - Displays expected review deadlines in Bangladesh time.

---

## 2. Working Backend & Frontend Connections

- Backend: `/storefront/v1/checkouts/:id/order-payment` (GET), `/claims` (POST, GET) in Fastify (`apps/api/src/routes/checkout-placement.ts`).
- Frontend API Client: `apps/storefront/features/checkout/order-payment-api.ts`.
- Workflow Engine: `apps/storefront/features/checkout/order-payment-workflow.ts`.
- Single State Model: `apps/storefront/features/checkout/foundation-controller.ts`.
- UI Integration: `<OrderPaymentPanel>` embedded in `apps/storefront/features/checkout/components/placement-confirmation.tsx`.
- Transport: Next.js API rewrite proxy forwards cookies and origin headers; private responses use `cache: 'no-store'` and `noindex`.

---

## 3. Secure Order & Guest Grant Limitations

- **One-Hour Security Ceiling:** Guest access expires at the earlier of one hour from order commitment or original guest session expiry.
- **Session Revocation:** Revoking the guest session or logging out of an account immediately invalidates the view and purges private financial state.
- **No Inferred Authority:** Order numbers, recipient phone numbers, and customer emails are display identifiers, never access credentials.

---

## 4. Missing Cross-Device Recovery Contract

- **Automated Cross-Device Recovery: BLOCKED.** A guest cannot recover their Order or payment view from another device or browser.
- **Independent Grant Rotation: BLOCKED.** No token exchange mechanism exists to extend guest access beyond the one-hour ceiling.
- **Historical Order Adoption: BLOCKED.** An account shopper cannot adopt a previously placed guest Order without independent verification proof.
- **Current Mitigation:** The UI directs customers whose access has expired or who switched devices to contact Maevelle customer support quoting their Order reference for manual, verified recovery.

---

## 5. Incomplete Browser, Device and Security Acceptance

- **Public Production Gating:** `checkoutPreviewEnabled` remains `false` in production. Public visitors see an honest "Checkout is currently unavailable" notice.
- **Real-Browser Physical Verification:** Verified via simulated static/component testing, Vitest contract suites, and Chromium automated headless sessions. Formal human screen-reader testing (NVDA/TalkBack/VoiceOver), physical touch devices, and 200%/400% native zoom testing remain open.
- **Network Fault Breadth:** Wire loss during physical PostgreSQL `COMMIT` execution was exercised via simulated timeout/discarded-response fixtures; real carrier packet drops remain unverified.

---

## 6. External Policy and Provider Blockers

Before public ordering and wallet collection can safely be enabled, the following external business gates must be satisfied:

1. **Provider Agreements:** Verified commercial contract and merchant credentials with bKash and Nagad.
2. **Category & Workflow Approval:** Formal provider sign-off on Personal Retail Account (PRA) and Merchant Payment actions.
3. **Finance Destination Setup:** Active, reconciled bank accounts bound to verified receiving destinations in the Finance ledger.
4. **Tax, Rounding and Fees Policy:** Finalized commercial rules for BDT VAT/tax treatment, payment gateway charges, and rounding adjustments.
5. **Carrier / Courier COD SLA:** Operating agreements for cash custody, delivery attempts, and remittance schedules with delivery partners.
6. **Operating & Review Windows:** Formally approved operational timeframes for customer payment submission (e.g. 30/60 minutes) and management review SLAs.

---

## 7. Legacy Tooling & Migration Failures Retained

The following inherited baseline findings are deliberately retained without silent fixes:

1. **Windows Migration Byte Check (`FAIL`):** `node scripts/check-migration-history.mjs` reports manifest and 18 historical migration byte mismatches due to Windows git checkout line-ending baselines.
2. **Generic Upgrade CLI Runner (`FAIL`):** Fails on missing `3221_checkout_quotes` fixture in the generic upgrade test runner.
3. **Repository Secrets Scanner (`FAIL`):** Reports pre-existing synthetic mock API secrets in test fixtures (`scripts/check-secrets.mjs`).

---

## 8. Recommended Next Steps

1. **Phase 07 — Checkout Analytics & Privacy Observability:**
   - Implement privacy-safe conversion event dispatching without transmitting PII or unverified payment states.
   - Enforce cookie consent preferences.
2. **Phase 08 — Reliability, Load & Fault Hardening:**
   - Conduct simulated network fault drills and connection pool saturation benchmarks.
   - Verify rate-limiting behavior under distributed ingress proxies.
3. **Phase 09 — Final Production Release Preparation:**
   - Formalize cross-device guest recovery policy.
   - Resolve provider/financial readiness gates.
   - Execute controlled staging deployment and recovery verification.
