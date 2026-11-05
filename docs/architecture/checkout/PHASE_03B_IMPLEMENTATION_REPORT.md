# Phase 03B implementation and acceptance

Overall: **PARTIAL**. The component-quote review frontend is implemented and verified through real local guest/account Buy Now and complete-Cart journeys. Human accessibility/device breadth, full browser fault timing, representative frontend volume/performance and production runtime remain open. Phase 01B, 02B and 03A remain **PARTIAL**. Complete Checkout is not operational or production-ready.

## Baseline and scope

Initial and final branch: `main`; HEAD: `504e53b71ba2c05d1c174d435d69846721b05242`. Phase 03A backend/contracts/migration/tests/docs were already dirty and remain preserved. The two-byte Phase 02A report remains unchanged. No backend application source, dependency, production configuration or migration was added by 03B. No commit, push, deployment, provider operation or persistent-database migration occurred. Only new random databases on an expressly disposable loopback PostgreSQL 18.3 cluster were migrated. Existing completion metadata is extended without promoting earlier phases.

## Architecture and shopper workflow

Quote state composes into the existing Checkout foundation controller, identity generation fence, canonical root draft, abort controller and shared task queue. Delivery, source and quote writes cannot run independently against stale roots. Stable private commands contain one immutable key/body/authority in page memory only. They never enter the foundation persistent journal. A successful quote write rereads the canonical draft; replayed historical quote revisions cannot roll it backwards. Acknowledgement binds the exact quote fingerprint/root and does not increment the root.

Focused quote transport, workflow, presentation and exact-money modules separate responsibilities. Both sources use the actual Phase 03A endpoints and shared DTO. Runtime parsing rejects malformed identities, unsafe money, inconsistent equations/allocations, unknown lifecycle flags and manufactured payable/tax/fees. Existing cookie/guest capability handling and private no-store transport are reused. Quote actions load behind the Checkout route; public catalog labels/media use one shared bounded loader and never replace immutable quote title/SKU/quantity/amount facts. Missing media has an honest placeholder. Long evaluated lists use content visibility and memoized line rendering; representative 100-line browser performance is not established.

Buy Now has an optional bounded explicit coupon form, neutral no-benefit results and re-evaluation action. Cart has no coupon override: shoppers return to Bag, change coupons there and explicitly review the complete current source. Changed coupon entries or unsaved delivery edits block acknowledgement. Previously evaluated lines and totals remain visible as historical facts while conditions need attention. New evaluations compare their authorized immutable predecessor, including component totals, changed quantities/prices/net amounts and added/removed items; equal totals do not imply the same evaluation.

## Money and lifecycle

Four-place decimal strings are formatted through BigInt whole units and literal fractional digits; monetary amounts and root revisions never pass through Number. Legitimate zero prices, discounts and shipping remain zero. The displayed equation is merchandise subtotal minus discounts plus evaluated shipping. Tax and payment fees remain “Not determined”; the evaluated components total is explicitly “Not final payable”. `tax`, `paymentFees`, `payable` stay null and `final`, `stockReserved`, `purchaseAvailable` stay false. No transfer instructions or working purchase/payment control was added.

CURRENT, EXPIRED, SUPERSEDED and INVALIDATED drive separate recovery states. Historical acknowledgement never turns an old quote current. Local expiry disables acknowledgement conservatively; server clock/eligibility remain authoritative. Reads never create quotes. Explicit current checks and immutable-history reads remain available. Creation and acknowledgement respect Retry-After, exact-key unknown-outcome recovery, shared root revisions and explicit conflict review. Session rejection clears private state; old-owner responses cannot publish after a generation change. Source/delivery/saved-address/configuration/stock issues guide correction rather than client price reconstruction.

Reload browser testing exposed an initial delivery/quote read race. Initial quote reading now waits for delivery initialization; delivery and quote initial-read refs reset through StrictMode cleanup. Verified account reload restored the reviewed quote automatically without a new write or manual current-check action.

## Executed verification

- `node scripts/checkout-phase03b-verification.mjs` with the explicit guarded disposable base URL: **237 tests / 22 files PASS**, 52.93 seconds. The harness verifies database identity, migrates a new random database and drops it in finally. Includes 70 Checkout frontend tests (17 new quote cases), database quotes/foundation, actual Checkout API foundation/delivery, legacy Orders, Cart frontend controller/API/runtime/journal, Wishlist and PDP details/component regressions. Individual unit and component tests are narrower evidence than a browser acceptance matrix.
- `node node_modules/typescript/bin/tsc --project apps/storefront/tsconfig.json --noEmit --pretty false`: PASS.
- Storefront `next build` with `NEXT_PUBLIC_CHECKOUT_DRAFT_PREVIEW=false`: PASS; compilation 2.4s, TypeScript 6.8s. This is build evidence, not deployed runtime evidence.
- ESLint for the six changed existing frontend files, all new quote/catalog/money modules and both 03B harnesses: PASS. A broader Checkout-folder lint also exposed pre-existing unused legacy prototype imports/variables and missing next lint rule; no broad lint PASS is claimed.
- `node scripts/check-architecture.mjs`: PASS for 13 packages. `git diff --check`: PASS (Git emits existing Windows LF/CRLF conversion warnings).
- `node scripts/check-migration-history.mjs`: **FAIL**, existing historical baseline manifest plus 18 historical migration byte mismatches on this Windows checkout. No historical file or manifest was regenerated. Fresh disposable migrations succeeding does not clear this gate.

## Real-browser/API evidence

Real Next development Storefront, Fastify/Better Auth and PostgreSQL 18.3; synthetic data only, loopback API 3002 and Storefront 3000, no provider. Fixture guard uses dedicated port 55445 and random database names; base database is not migrated. Shared shell retained an obsolete fixture guest Cart cookie: the existing explicit forget-browser-session confirmation recovered the Bag without deleting stored bags. Buy Now remained independent of that inaccessible Bag. Old public Next fetch-cache entries were isolated by using a unique loopback internal API origin; no application cache reset or persistent data cleanup was performed.

Verified through actual UI:

- Guest Buy Now with Bangla name/address/mobile digits, supported area selection, saved delivery, quote and acknowledgement. Root advanced on create and stayed unchanged on acknowledgement.
- Effective SYNTH10 and no-benefit synthetic code; exact 100.0000 to 90.0000 predecessor comparison. No unsupported reason for a rejected coupon was invented.
- Accepted quote response deliberately replaced with 503/Retry-After: UI retained one frozen command and disabled conflicting edits. Exact retry recovered the same quote; count stayed 3 and root stayed 5. This simulates post-commit response loss, not a physical COMMIT-wire failure.
- Real price/promotion changes invalidated old facts; explicit update produced 130.1234 with the now-inactive coupon neutral. Stock loss removed acknowledgement eligibility. Zero-price/shipping quote displayed exact zero and could be reviewed.
- Shipping policy change required delivery re-review before quoting; 130.1234 minus 13.0123 plus 12.3333 displayed 129.4444, never final payable.
- Guest complete Cart with coupon applied in actual Bag, explicit source initiation, destination save, quote and acknowledgement. Cart quote had no separate coupon input.
- Account Buy Now with saved address, quote/acknowledgement and automatic reload recovery. Editing the selected saved address invalidated the quote with ADDRESS_CHANGED; explicitly selecting its amended revision and re-evaluating recovered it.
- Account complete Cart with saved-address selection, quote and acknowledgement. Sign-out/account B sign-in and restore displayed no account A quote, title history, coupon state or address. A guest adoption invitation remained explicit and did not adopt anything.

Final browser fixture: **4 drafts, 10 quotes, 5 acknowledgements**. Orders, reservations, payment obligations, promotion redemptions, converted drafts, purchases, confirmed payments, Finance postings and purchase events were **all zero**. Legacy Orders tests passed separately in another random database. No Stock hold, redemption, receipt, payment or Order is created by these quote flows.

## Accessibility, layout and remaining limits

Measured browser widths / document scroll widths: 320/320, 390/375, 768/753, 844-landscape/829, 1024/1009, 1440/1425. One quote panel at each width; no horizontal overflow. Mobile delivery controls measured 16px type. Saved mobile/desktop screenshots show four-place component totals, unresolved fees/tax, unavailable ordering and existing authored shell. Source/coupon/delivery controls use existing shared primitives; labels, live feedback, keyboard combobox selection and post-action focus were exercised. No WCAG compliance, full touch-target audit, contrast measurement, native 200/400 percent zoom, screen reader, physical device or Safari/Firefox PASS is claimed.

Observed browser diagnostics: existing Next smooth-scroll annotation warning; one development HMR hook-dependency warning while the effect dependency list changed during editing. Subsequent full reload and automatic restoration passed. No claim of a clean historical dev-console buffer. Exact delayed old-owner response/OS suspension, browser 429 countdown, quote-only TTL expiry, cross-tab supersession and complete stale-Cart/adoption/abandonment fault matrices remain unverified in browser; focused controller/backend cases cover relevant invariants. Representative latency, render counts, network budgets and 100-line browser scale remain open. Existing shell delivery/zero-fee marketing promises need owner content review before activation.

## Acceptance register

| # | Outcome | Result and evidence |
| --- | --- | --- |
| 1 | Exact 03A contracts | PASS; actual endpoints, shared DTO, strict parser and API tests |
| 2 | Buy Now / complete Cart | PASS locally; guest and account browser journeys |
| 3 | Immutable merchandise facts | PASS; quote facts, escaped labels, public media identity check |
| 4 | Exact money | PASS; BigInt formatter, large/zero/exact fixtures and browser four-place values |
| 5 | No fake final payable | PASS; explicit component-only total and no payment controls |
| 6 | Unresolved tax/fees | PASS; null contract checks and visible unknowns |
| 7 | Effective/no-benefit coupons | PASS; real synthetic promotion changes and neutral results |
| 8 | Source-specific coupons | PASS; Buy Now form, Cart Bag-owned coupon journey |
| 9 | Lifecycle distinctions | PARTIAL; implementation/controller/backend cases pass; full real-browser supersession/quote-only expiry timing open |
| 10 | Explicit acknowledgement | PASS; real eligibility checks and root unchanged |
| 11 | Shared root revision | PASS; create/replay/delivery/controller and browser evidence |
| 12 | Historical immutability | PASS; predecessor/replay tests and real configuration-change journey |
| 13 | Commercial change review | PASS locally; old/new components, equal-total identity and delivery change |
| 14 | Stale source/delivery/address | PARTIAL; real delivery/address and API/controller coverage; full browser Cart mutation matrix open |
| 15 | Eligibility | PASS within focused stock/product API/controller scope; stock-loss browser journey |
| 16 | Idempotent recovery | PARTIAL; accepted lost-response browser retry and focused conflicts/backoff pass; full wire/browser fault matrix open |
| 17 | Account privacy | PARTIAL; real A/B switch and ignored-abort controller pass; exact delayed browser/OS timing open |
| 18 | Responsive design | PASS within six measured emulated widths; physical device review open |
| 19 | Accessibility | PARTIAL; labelled controls, keyboard selection/focus and mobile type observed; human AT/zoom/contrast breadth open |
| 20 | Meaningful integration tests | PASS within stated scope; 237 tests and real API/browser fixtures |
| 21 | Existing behavior preserved | PASS within Cart/Wishlist/PDP/Orders regressions and account/delivery browser scope; inherited release gates stay open |
| 22 | No purchase side effects | PASS; final fixture counts all zero for nine forbidden effects |
| 23 | Gates disabled | PASS for source/API regression and preview-disabled production build; deployed runtime unverified |
| 24 | Earlier PARTIAL retained | PASS; 01B/02B/03A unchanged |
| 25 | Next backend dependencies | PASS; separate Phase 04A handoff |

## Changed files and resume point

03B changes: six existing Checkout files (controller, runtime, snapshot types, review, delivery panel, review items); new quote API/workflow/types, shared public review catalog hook, exact-money formatter, five quote components, two quote test files plus fixture; guarded runtime/regression scripts; this report, verification JSON, 04A handoff and concise tracker/security/scenario updates. Existing 03A dirty backend files are not new 03B implementation. No unrelated legacy component formatting was retained.

Next: follow [Phase 04A backend handoff](PHASE_04A_HANDOFF.md), obtain the listed policy decisions, and close the explicit frontend acceptance gaps before any activation. Raw local synthetic fixture logs/screenshots are referenced in the verification JSON; they are not production evidence.
