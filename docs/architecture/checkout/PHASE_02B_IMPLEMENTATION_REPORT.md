# Phase 02B — delivery frontend implementation

Overall status: **PARTIAL**. Date: 2026-11-04 (Asia/Dhaka).

The delivery frontend is implemented against the actual Phase 02A APIs and passes focused local verification. Browser/device/accessibility and production-runtime acceptance are incomplete. This is not full Checkout completion. Phase 01B remains **PARTIAL**. Purchases and production drafts remain disabled.

## Summary and baseline

Guest and account shoppers can enter a purchase-specific destination, search approved geography, save/restore it, review changing eligibility, and intentionally select/create/edit/default/remove account addresses. Buy Now and complete-Cart share the form and authoritative draft controller. Monetary presentation is reserved for immutable quotes; no provisional total, courier promise, payment destination or working purchase action was added.

Actual branch: `main`; initial and final HEAD: `2fd662eb2b515d0cda250b11b0e60a5883249901`. Initial dirty work was only `PHASE_02A_IMPLEMENTATION_REPORT.md`, already two bytes. It remains untouched. The committed Phase 01B Markdown report is also two bytes; neither report was reconstructed. Evidence came from current contracts/source, verification JSON and new runs. Final tree contains uncommitted frontend, test, standalone fixture and documentation changes. No commit, push, deployment, dependency change, backend/schema change, persistent migration, provider operation or real-customer action occurred.

## UI architecture

- Existing Storefront semantic tokens, serif headings, pink accents, Button/Input/Textarea/Field/Notice and ConfirmDialog are reused. No global CSS or new design system was added. The authored shell, Bag and Wishlist remain intact.
- `CheckoutReview` supplies one responsive form tree: destination first on mobile and a source/unavailable-payment sidebar on desktop. No phase-driven wizard. The main landmark now matches the existing skip link.
- `DeliveryFields` is shared by purchase entry and the account address editor. `DeliveryAreaPicker` and `use-area-search` isolate geography interaction. `SavedAddresses` owns explicit book actions and confirmation; it does not silently save a checkout destination.
- `delivery-workflow` composes into the foundation controller's projection, task serialization, authority resolution, generation fence and root revision. There is no second authentication or Checkout store. Initial private reads queue behind source acceptance; distinct concurrent writes are rejected.
- Unsaved input is component memory; confirmed input and an uncertain exact command are separate controller memory. Changing drafts clears the previous destination before showing the new draft. Explicit guest revocation clears private projection. Address-save success has an outcome marker so retry recovery also closes the editor without creating a duplicate.

## Contact, validation and recovery

Required: recipient name, mobile, supported area and detailed address. Optional secondary details/instructions are progressively disclosed. No email, postcode, billing address, registration or second number is required. Unicode character bounds match the contract; mobile uses `tel`, tel input mode and shipping autofill without an ASCII-only regex. The server owns Bangla-digit/E.164 normalization and detailed validation. Real browser entry used Bangla names, address and digits; normalized mobile restored successfully.

Client required/length errors have associated fields and a focused summary. Server rejection preserves unrelated local entries. Confirmed saved state returns after reload or authorized route re-entry. Unsaved edits and exact private request bodies intentionally exist only while this page/runtime remains open; they are not recovered from storage after reload/navigation. There is no navigation guard. Reload after an uncertain request reads server truth and never reconstructs or automatically resubmits its PII body.

409 fetches the latest delivery/book state while retaining unsaved input. Saving remains locked until the shopper explicitly reviews the latest revision; failed latest-state fetch cannot be acknowledged as fresh. Network/5xx/429 retain the immutable original body/key in memory, prohibit distinct mutations and offer explicit same-request retry after Retry-After. A response-loss fixture committed the real transaction then returned 503; retry recovered the saved result. No automatic retry loop or fresh-key replay is used.

## Geography and serviceability

Search calls the real bounded endpoint with English/Bangla prefix queries, 300 ms debounce, cancellation and sequence checks. Pages contain at most 20 results; rendering caps at 100 and requests refinement. There are no hardcoded production locations, rates or inferred coverage. The fixture's names and coverage are explicitly synthetic. A restored saved reference with no loaded label is described as saved, never presented as a UUID label or invented location.

The combobox supports arrows, Home/End, Enter, Escape, selected state, clear, loading/empty/error and More. Current approved results alone are selectable. Unsupported/unverified policy and unavailable service are shown honestly; explicit availability checking can discover configuration changes. Dirty local input does not inherit the prior saved destination's eligible banner. Configuration changes require review. CHANGED/REMOVED saved associations cannot implicitly REVALIDATE: select the latest reviewed address or explicitly save retained/manual input to detach it.

The adapter accepts valid zero tariffs and validates `final:false`, `purchaseAvailable:false` and `quoteAvailable:false`. No tariff is displayed or combined with Cart prices. Courier compatibility remains NOT_EVALUATED; the delivery panel makes no ETA guarantee. Existing shell/footer shipping and payment marketing copy is outside this implementation and must receive production content review; it is not authoritative coverage evidence.

## Accounts, security and concurrency

Guest delivery uses the existing guest context/cookie; book access requires the live shopper partition/cookie. UUIDs and typed phone numbers grant no authority. Explicit create/edit/remove/default actions use Phase 02A semantic endpoints and address revision strings; selecting copies a snapshot. Editing/removing a selected book address does not overwrite that purchase snapshot. Default creation does not automatically select it for the purchase. The book supports bounded pagination and compact expansion; 23 seeded addresses were loaded in the browser.

Identity transitions invalidate private projections, abort requests, increment the generation and unmount owner-keyed local forms. Responses are checked against current authority after transport, including transports that ignore abort. No private bodies, addresses or phone numbers enter the source journal, URLs, analytics or cross-tab signals. Input is allowlisted before serialization; forged shipping/customer/purchase fields are stripped. Source and delivery share decimal-string revisions without numeric coercion.

Background/focus handling suspends and hides the private view while retaining same-owner edits in memory, then checks live identity and authorized draft access before revealing it. A pending write becomes uncertain and is never automatically sent. Identity change or rejected authority clears private memory; failed network verification leaves it hidden. Unit tests exercise suspension/resumption and ignored-abort races. Browser same-owner tab round-trip retained unsaved fields, but this IAB did not establish actual OS/background visibility transitions; that privacy-cloaking browser case remains NOT VERIFIED.

Actual browser A-to-B switching and switching away from a committed-but-uncertain B save cleared the previous private marker and retry control. The separate six-second delayed-response race attempt did not establish the intended timing before the response arrived; **that exact browser race remains NOT VERIFIED**, despite passing modeled delayed read/write tests. No cancellation-only security claim is made.

## Accessibility and performance

Semantic labels, fieldset, required/error associations, live feedback, summary focus, keyboard combobox and existing confirmation primitive are implemented. Picker results use 48 px minimum targets, clear uses 44 px; mobile text fields measured 16 px after correcting an inherited primitive font-size override. There is one mounted destination form.

Final browser viewport/scrollWidth measurements: 320/320, 390/375, 768/753, landscape 844/829, 1024/1009 and 1440/1425. No horizontal overflow in these synthetic saved-form states. Desktop and mobile full-page screenshots were captured using the supported in-app browser; fixed shell elements appear at their capture viewport positions. Screenshots are local evidence, not a production/owner design approval.

Production manifest measurement is recorded in `PHASE_02B_VERIFICATION.json`: unique checkout client-reference JS chunks, uncompressed and individually gzip-compressed bytes, including shared code with preview gate off. This is not a measured incremental bundle delta or browser transferred payload. No comparable baseline build, representative network/INP, field Core Web Vitals or production load evidence was available. Search debounce and bounded pages are implementation bounds, not latency benchmarks.

NOT VERIFIED: native 200% text scaling/400% zoom, human screen readers, real iOS/Android keyboards/autofill, hardware, Safari/Firefox breadth, reduced-motion/dialog accessibility matrix and representative volume. Viewport 320 is not claimed as native zoom evidence. Computer-use and Web Interface Guidelines informed the focused review; compliance is not certified.

## Tests and runtime evidence

Final **200 tests passed in 16 files**:

| Command (repository root; `node node_modules/vitest/vitest.mjs run …`) | Result |
| --- | --- |
| `apps/storefront/features/checkout` plus Cart `api`, `browser-runtime`, `controller`; Wishlist `wishlist-store`, `account-adapter`, `guest-journal`; `components/commerce/wishlist-button.test.tsx`; `features/pdp/pdp-product-details.test.tsx` | 131 / 12 files |
| `apps/api/src/checkout-delivery.test.ts apps/api/src/checkout-foundation.test.ts apps/api/src/shopper-auth.test.ts` | 45 / 3 files |
| `packages/database/src/orders.test.ts` | 24 / 1 file |

API runs explicitly set `TEST_DATABASE_URL=postgresql://checkout_fixture@127.0.0.1:55443/maevelle_test`. PostgreSQL 18.3 ran in a newly initialized temporary cluster, loopback-only port 55443. API fixtures create/drop random databases. Orders used `isolatedCartDatabase`, migrated that random database, spawned Vitest with its URL and dropped it in finally. Only these disposable databases were migrated. Browser runtime used another random database, real API/BetterAuth, synthetic A/B accounts, 25 localities and an explicitly confirmed synthetic zero-tariff policy. Mail was captured in memory. No external provider was called.

Focused Storefront typecheck, changed-code ESLint/Prettier, 13-workspace architecture check and `git diff --check` passed. Next 16.4.2 production build passed with `NEXT_PUBLIC_CHECKOUT_DRAFT_PREVIEW=false`. Browser runtime used the nonproduction gate explicitly on and `localhost:3000`, proxying to the isolated loopback API. Production-mode runtime/ingress was not exercised. An initial dev request reused an older synthetic Next fetch cache and returned 404; restarting with a distinct loopback API hostname restored the current fixture without source or cache deletion.

The standalone `scripts/checkout-phase02b-runtime.mjs` rejects every base database URL except the exact disposable target and requires an output directory. Its fault/control routes exist only in this loopback test process, not the application API registration. It supports after-commit response loss, delayed response, policy change, revision conflict and expiry. Runtime shutdown/drop and cluster-stop evidence are recorded in the verification JSON.

## Real-browser journeys and regressions

PASS locally: actual PDP Buy Now; guest Bangla entry/save/reload; English/Bangla search and More; keyboard selection/clear; after-commit 503 exact retry; 409 explicit review retaining edits; guest adoption preserving destination; A/B isolation; saved select/edit/default/create/remove; changed and removed association review; no-approved-coverage empty search; coverage restoration/revalidation; invalid mobile correction retaining fields; complete-Cart entry/save/back restoration with Bag quantity 1 unchanged; expired draft save disabled; payment action disabled. Latest final browser console sample contained no errors; earlier injected errors are expected evidence, not a claim that no fault occurred.

Checkout foundation, Cart controller/runtime/API, Wishlist and PDP focused suites passed. Shopper Auth API passed. Orders' 24 existing database regressions passed in a separate random database; they intentionally create synthetic Orders to verify the existing domain. Populated historical receipt, full Orders UI, broad Cart/Wishlist browser acceptance and production ingress were not retested and are not promoted to PASS.

Final browser database facts: four drafts; zero Orders, reservations, payment intents, confirmed payments, promotion usage, converted Carts, ORDER_PLACED/PAYMENT_CONFIRMED analytics events and order-placement outbox events. Phase 02A API suite separately asserts zero financial/inventory/purchase side effects after its workflows. These facts concern the delivery fixture, not the separate Orders regression database.

## Phase 01B gates and remaining blockers

Preserve Phase 01B PARTIAL and its verification register. This phase adds delivery-specific response-loss, conflict and account-switch evidence; it does not retroactively close the foundation's complete transport/status matrix, pending-response race, rapid-click stress, multi-axis invalid selection, independent background tabs, keyboard/reduced-motion breadth, human AT/hardware, authorized populated historical receipt or production runtime/ingress requirements.

Real reference/coverage approval, courier mapping/acceptance, retention/legal decisions, persistent migration/recovery, deployed trusted ingress/role acceptance, human responsive/visual approval and later financial quote/placement remain open. No real geography or coverage was approved. Unsaved private entry is page-lifetime only. No immutable quotes, stock allocation, payment claims, financial operations or purchase events were implemented.

## Acceptance register

| # | Requirement | Status | Evidence / remaining boundary |
| --- | --- | --- | --- |
| 1 | Actual Phase 02A contracts | PASS | Typed adapter, real API browser and 45 API tests |
| 2 | Complete minimal contact/delivery | PASS | Shared four-required-field form, optional disclosure, guest browser |
| 3 | Guest/account drafts | PASS | Both owners, explicit adoption, same APIs |
| 4 | Bangladesh mobile/address | PASS | Bangla browser entry, server E.164, Unicode/no-regex tests |
| 5 | Accessible area picker | PARTIAL | Keyboard/touch semantics and browser paths pass; human AT open |
| 6 | No fabricated coverage | PASS | Real search; synthetic fixtures explicit; unverified fails closed |
| 7 | Accurate serviceability | PASS | Policy invalidation, unsupported and explicit revalidation |
| 8 | Tariff vs quote boundary | PASS | No monetary summary; zero accepted; final/purchase false checked |
| 9 | Secure saved selection | PASS | Account authority; explicit snapshot and owner isolation |
| 10 | Intentional address operations | PASS | Create/edit/default/remove, pagination and retry outcome |
| 11 | Changed/removed addresses | PASS | Browser both states; no implicit REVALIDATE |
| 12 | Revision safety | PASS | Shared root string revision, explicit 409 review |
| 13 | Retry/unknown outcome | PASS | Real after-commit response loss, immutable exact retry, 429 unit |
| 14 | Account-switch leakage prevention | PARTIAL | Modeled ignored-abort races and browser uncertain-save switch pass; exact delayed-response/OS-background browser timing open |
| 15 | Cart/Buy Now integrity | PASS | Actual entry paths, Bag unchanged, foundation/Cart regressions |
| 16 | Gates/legacy containment | PASS | Existing gates untouched, false production build, disabled purchase; no legacy route reactivation |
| 17 | Responsive/accessibility | PARTIAL | Six measured widths, single tree, keyboard; zoom/AT/device breadth open |
| 18 | Browser/API/regression verification | PARTIAL | 200 tests and listed journeys pass; specified browser/runtime breadth open |
| 19 | No commerce side effects | PASS | Delivery fixture zero facts and API assertions; separate Orders regressions isolated |
| 20 | Honest limitations | PASS | Explicit evidence boundaries, inherited gates and handoff |

## Changed modules and handoff

Frontend: foundation controller/runtime/types and review layout; new delivery types/API/workflow/search, shared fields/picker/panel; reusable account address editor/list; two focused test files. Tooling: standalone isolated browser fixture. Documentation: this report, verification JSON, Phase 03A handoff, checkout index/security/scenario addenda and Product Completion resume state. The pre-existing dirty Phase 02A report is excluded from our changes.

See [Phase 03A authoritative handoff](PHASE_03A_HANDOFF.md) for the available source/delivery preconditions and unresolved monetary/configuration decisions. Phase 03A has not been implemented or authorized by this task.
