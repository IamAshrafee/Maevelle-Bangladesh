# Checkout Phase 05B implementation and integration acceptance

**Overall: PARTIAL. Public purchases and payment collection: BLOCKED.** The Storefront now understands the real Phase 05A final terms, placement and status operations. The real development policy rejects final terms; production still serves an unavailable Checkout. No provider or test policy was exposed to the Storefront. A successful browser purchase and guest cookie issuance through the new UI were not verified.

## Baseline and scope

Branch `main`, HEAD `06f6d7856064d36d0bc89dd9470ad272ba2c114d`, migration tail `3223_checkout_placement`. The tree already had 79 status entries, including earlier Phase 04B and Phase 05A work. Existing changes were preserved. No migration, dependency change, production purchase setting, provider request, real charge/refund, commit, push, VPS action or deployment was performed. Earlier PARTIAL statuses are unchanged.

## Architecture, authority and recovery

- `foundation-controller` owns one draft and existing shopper partition, source, delivery and component quote. Its placement workflow is loaded on demand and shares the existing request lock, deadlines, aborts, owner rechecks and generation fences. The new projection distinguishes final terms, pending placement intent, committed receipt and live Order/payment status. Account switches clear all private projections; late responses cannot repopulate them. Visibility restoration hides private Order facts until the current owner has been checked. No global placement store or background polling was added.
- Cart and Buy Now reuse the same review, with their existing source references and Cart independence. No placement UI clears a Bag, changes its revision or emits purchase analytics. During submission or unknown recovery, the controller blocks competing review mutations; component panels also stop initiating requests. Final terms cannot be used with a stale, unacknowledged, expired or source/delivery-invalid quote.
- The method selector asks the backend to **check** availability; names in the selector make no eligibility assertion. The shared transport sends credentials, no-store and the existing guest-context or account-partition header. It accepts the specific `409 {data:{kind:"REVIEW_REQUIRED",reason}}` outcome separately from ordinary error envelopes. The DTO reader validates current quote/revision/method identity, exact four-place decimal strings and final fingerprint, and projects only documented receipt/status fields.
- The final terms panel uses the shared Money component’s exact-string variant, including signed rounding. It shows the server’s merchandise, discounts, delivery, tax treatment, approved charges, rounding, method and original payable. Component estimates are never used as payable. Terms and their explicit checkbox approval are tied to the displayed fingerprint. No Place order action appears in the actual policy-blocked journey.
- One explicit submission freezes the body, UUID key, draft and original owner before the POST. The same in-memory intent can be retried after ambiguous errors, expiry or Cart conversion while the original authority is live. Review-required clears the final acceptance, restores server draft state and asks the shopper to review again. A changed-payload conflict or already-committed conflict triggers status recovery rather than another submit. If the server may have committed and the subsequent owner check fails, the client cannot infer a definite rejection.
- The journal holds the existing bounded, nonsecret owner/draft reference and a boolean that an order attempt may need recovery. It stores no placement key, body, money, address, grant or receipt. Reload does not replay any POST. It can read authorized status for a committed or marked review. A still-unresolved review without its original in-memory intent cannot be silently retried. Browser storage denial limits post-reload continuity; an open tab retains the original intent.
- Confirmation is inline on the private, noindex Checkout route. It requires an authorized canonical receipt, or a status read that returns that receipt. The Order number is a display reference. Account access is through current live shopper partition. Guest status requires both original live Checkout session/context and the server-issued Order-specific HttpOnly cookie; JavaScript does not read or recreate it. Exact POST replay can obtain the cookie again in the original session. A missing/revoked session or inaccessible grant gives honest unavailable/recovery guidance. Cross-device verification and independent grant rotation are absent.
- The confirmation separates Order state, payment state, original total and reported outstanding balance. COD says due on delivery only for an applicable unpaid balance and noncancelled Order; no inferred delivery dates or paid state. Manual payment can be unverified, partial, expired or cancelled as returned by Payments. The UI shows no wallet number, QR, transfer action, claim form or legacy confirmation fallback. The contained historical confirmation route was not changed. The unmounted Phase 04B synthetic preview remains unmounted.

## Responsive, accessibility and performance

The existing responsive review shell is reused. Controls use the shared Select, Checkbox, Button, Notice and Money. Review and confirmation headings are semantic and focused on transition; live messages announce checks, recovery and changes. Keyboard and reflow smoke were evaluated against the [Vercel interface guidance](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) and [WCAG 2.2](https://www.w3.org/TR/WCAG22/). No claim of certification, screen-reader sign-off or real device coverage.

Real Chromium exercised guest Buy Now at 320 px (COD), account Buy Now at 390 px (bKash), guest Cart at 768 px (Nagad) and account Cart at 1440 px (COD). Each seeded the review through actual API operations, restored it on page reload and activated Check availability with Enter. Each saw one `503 POLICY_BLOCKED`, no placement POST or Place order control, an active-draft status denial (404), no horizontal overflow within the Checkout main element, and a 52 px check control. These widths cover the blocked Checkout surface, not full confirmation reflow. Component render tests separately verified receipt, outstanding, COD, manual pending/partial and expired/cancelled text without claim controls. Confirmation keyboard, native zoom, human AT, touch hardware and a real successful browser journey are still open.

The confirmation and workflow are route-local. No status fetch happens on unrelated routes or an ordinary unattempted review. The catalog hook skips empty inputs. Only one final-terms request was observed per browser check; placement writes are serialized client-side. The inherited Phase 05A fixture is a loopback PostgreSQL test, not evidence of deployed latency or representative bundle/network cost. No production Web Vitals or formal bundle baseline comparison was run.

## Verification and side effects

Disposable PostgreSQL 18.3 on `127.0.0.1:55445`; fixture API on loopback 3002; Next development Storefront on 3000; Chromium in a separate headless profile. The existing Phase 03B harness seeds only synthetic catalog, delivery and shopper accounts. It retains the real 05A policy block. Phase 05B's browser script registers no API route and installs no policy override. The fixture recorded zero Orders, reservations, promotion redemptions, converted Carts, obligations, confirmed payments, Finance postings, Order-placed outbox facts and purchase events. Phase 05A's existing internal PostgreSQL tests separately exercise synthetic atomic success, contention, rollback and grant enforcement; those tests are not browser success.

Commands used (with the explicit fixture `TEST_DATABASE_URL` and `CHECKOUT_03B_OUTPUT`):

```powershell
node node_modules/typescript/bin/tsc --build tsconfig.build.json --pretty false
node node_modules/typescript/bin/tsc -p apps/storefront/tsconfig.json --noEmit --pretty false
node node_modules/vitest/vitest.mjs run apps/storefront/features/checkout apps/storefront/features/cart apps/storefront/features/wishlist
node scripts/checkout-phase05a-verification.mjs
node scripts/checkout-phase03b-runtime.mjs
node scripts/checkout-phase05b-browser.mjs
node scripts/check-architecture.mjs
node scripts/check-migration-history.mjs
git diff --check
```

The isolated regression runner passed 371 cases in 31 files plus two Worker cases; it includes historical confirmation, Checkout, Auth, Orders, Payments, Inventory, Promotions, Cart and fulfillment. The focused Storefront run passed 187 cases in 18 files across Checkout, Cart and Wishlist, including the final owner-check failure changes. The two suites overlap and are not summed. Backend build, Storefront TypeScript, focused ESLint and Prettier, architecture (13 packages), and whitespace checks passed.

The Storefront production build passed using `node node_modules/next/dist/bin/next build` from `apps/storefront` with `NEXT_PUBLIC_CHECKOUT_DRAFT_PREVIEW=true`, deliberately testing the production interlock. The generated standalone server on loopback 3005 served `/checkout` as HTTP 200 with noindex, the unavailable view, no method selector and no Place order control even with the preview flag set. The inherited Windows migration-history check still reports the manifest and 18 historical file byte mismatches. The baseline and all historical files were left alone.

The new files are the placement API, eligibility, labels, projection, workflow and their tests; the final terms summary, placement panel and confirmation; and the local Chromium evidence harness. The existing Checkout controller/runtime, journal and review panels were extended in place. Shared Money formatting and HTTP/deadline handling gained opt-in exact/structured-result behavior. No backend or shared commercial schema was changed in this phase.

## Acceptance register

| # | Requirement | Status | Evidence or remaining work |
| ---: | --- | --- | --- |
| 1 | Phase 05A contracts integrated | PASS | Actual blocked API and specific 409/receipt/status transport tests. |
| 2 | One state model for both sources | PASS | Shared controller; four real blocked owner/source pairs. |
| 3 | Final terms distinct from quote | PASS | Separate projection and UI; component quote stays nonfinal. |
| 4 | Exact amount and fingerprint | PASS | String binding, signed formatting and large revision tests. |
| 5 | Unsupported methods and policy blocked | PASS | Actual API 503 for COD, bKash and Nagad; no submit control. |
| 6 | Stable logical intent | PASS | Frozen body/key and owner in page memory. |
| 7 | Rapid click exclusion | PASS | Concurrent controller tests; one POST. |
| 8 | Unknown outcomes and exact retry | PARTIAL | Same-tab/expiry/reload contract tests; physical browser commit response loss unverified. |
| 9 | Changed key/payload conflicts | PASS | Typed conflicts stop a new submit. |
| 10 | Explicit review on changes | PASS | Durable change results require renewed quote/final acceptance in the active workflow. |
| 11 | No stale acceptance | PASS | Revision, source/delivery, quote and expiry guards; server remains authority. |
| 12 | Real confirmation truth | PARTIAL | Commit/status-only contract verified; actual successful browser confirmation not verified. |
| 13 | Separate Order and payment status | PASS | Receipt rendering uses live status and separate original/balance amounts. |
| 14 | COD unpaid until collection | PASS | Unpaid, partial and cancelled presentation uses server status. |
| 15 | Manual claims unavailable | PASS | No new instructions or claim UI/API. |
| 16 | Guest original session and grant | PARTIAL | Actual API denies uncommitted status; backend grant tests and client recovery contract pass. Real browser grant replay unverified. |
| 17 | Account-owned access | PARTIAL | Real account reviews and backend ownership tests; successful authorized browser confirmation unverified. |
| 18 | Owner switch clears private data | PASS | Delayed A response discarded under B; uses existing runtime identity fence. |
| 19 | No Order-number/UUID credential | PASS | No lookup by these values; status uses owned draft and live authority. |
| 20 | Expired/revoked credentials | PASS | Controller invalidation and isolated authorization regression; full browser fault matrix unverified. |
| 21 | Responsive layouts | PARTIAL | 320–1440 px blocked UI verified; committed browser layout unverified. |
| 22 | Accessibility measured | PARTIAL | Keyboard activation, target size and reflow smoke; native zoom, AT and hardware open. |
| 23 | Browser/API failures | PARTIAL | Real blocked/404 and contract retry/rate-limit/owner tests; wire loss and simultaneous browser placement unverified. |
| 24 | Checkout, Cart, Wishlist and Payments regression | PASS | Focused suites and isolated backend regression. |
| 25 | Rejected public flows have no purchase effects | PASS | Browser fixture counts and actual blocked-boundary API tests. |
| 26 | Synthetic effects stay atomic | PASS | Isolated internal Phase 05A suite rerun; no public success. |
| 27 | Migration limitations visible | FAIL | Inherited Windows byte check remains failing; no history change. |
| 28 | Earlier PARTIAL outcomes retained | PASS | No prior acceptance promoted. |
| 29 | Business and provider readiness | BLOCKED | Real policy, merchant/courier/legal approvals and privacy retention open. |
| 30 | Next-stage handoff | PASS | [Post-order and activation handoff](PHASE_05B_NEXT_STAGE_HANDOFF.md). |
