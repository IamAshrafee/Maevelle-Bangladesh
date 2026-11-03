# Phase01B implementation report

2026-11-02. Current source and executed evidence take precedence over historical proposals.

## 1. Status

**PARTIAL —14 PASS /2 PARTIAL /0 FAIL /1 BLOCKED gates.** Guest foundation implementation is verified within the documented Chrome/API profile. Integrated Cart/release readiness remains PARTIAL, with an inherited High legacy credential boundary. Atomic Clear integration is blocked by the absent backend contract. Accessibility closure is incomplete.

## 2. Executive summary

Implemented one reusable frontend Cart controller with an adapter to the existing Phase01A backend, confirmed/pending state separation, cookie round-trip barriers, explicit multiple-bag selection, immutable replay identity, revision and owner-epoch fences, bounded cross-tab hints and nonsecret recovery. PDP, Cart page and header consume that controller. Production header now navigates to the real Cart page instead of displaying sample items. Auth changes clear private display before requests and respect ACCOUNT_CART_NOT_READY.

No new state library, dependency installation, schema or backend change, full Cart drawer/page redesign, account Cart/merge, Checkout/payment/order implementation, commit/push/deploy or VPS operation.

## 3. Repository/Git baseline and preservation

Initial and final branch `main`, HEAD `aa290065407030e85b5b6847efd22fb437a65279`. Initial35 dirty tracked files and45 untracked status entries; final45 dirty tracked files and61 untracked status entries. A pre-edit SHA256 snapshot covered1971 existing files in `/tmp/cart01b-baseline.json`. The checked-in [verification manifest](phase01b-evidence/verification.json) records the final delta/preservation check and command outcomes.

Ten existing storefront files were intentionally changed; none had pre-existing dirty content. Cart README/scenario/threat references were updated additively. Existing01A, Wishlist, Admin, API, database, Worker, configuration, infrastructure and product-completion dirty work remained byte-identical. Zero baseline files missing. No reset/clean/stash/discard. Generated `.next/cache/fetch-cache` from an earlier local Wishlist fixture was moved to `/tmp/cart01b-prior-fetch-cache` to avoid testing against the wrong cached catalog; no source/data reset.

## 4. Frontend architecture and significant paths

| Paths | Responsibility/change |
| --- | --- |
| `apps/storefront/features/cart/types.ts`, `controller.ts` | Typed state/commands, factory external store, intent queue, init/read flights, epochs, ownership-loss latch, revision/evaluation guards, replay/recovery |
| `apps/storefront/features/cart/api.ts`, `errors.ts` | Exact existing route adapter,15s bounded requests, stable frontend coordination errors vs actual API codes, recovery classification |
| `apps/storefront/features/cart/pending-journal.ts` | Tab-local <=7day/2048-character nonsecret journal, whitelist reconstruction and policy-denial handling; no coupons/full Cart/credentials persisted |
| `apps/storefront/features/cart/browser-runtime.ts` | Lazy browser singleton, optional Web Locks, channel/storage hints, auth begin/settled, hidden/visible/focus/history/online recovery and bounded polling |
| `apps/storefront/features/cart/use-cart.ts`, `use-cart-count.ts` | useSyncExternalStore, primitive count/busy/epoch/message subscriptions; unknown count is null, not false zero |
| `apps/storefront/features/cart/components/cart-feedback.tsx` | Existing Button/Notice primitives, polite status, explicit context selection, retry same action, stop/review recovery |
| `apps/storefront/features/cart/components/cart-page-view.tsx`, `app/cart/page.tsx` | Existing page presentation adapted to shared state; true empty differs from errors/unknown; existing quantity/remove/coupon actions preserved; no fabricated delivery/tax total |
| `apps/storefront/components/product-page-client.tsx`, `features/pdp/pdp-view.tsx` | Shared commands/busy/epoch; one global authoritative feedback surface avoids attributing an old success to a different PDP; rejected Buy Now cannot continue to Checkout |
| `apps/storefront/components/layout/header-client-shell.tsx`, `desktop-navbar.tsx`, `mobile-navbar.tsx` | Real Cart link and shared count/accessible names; sample drawer removed from customer header |
| `apps/storefront/app/layout.tsx` | Narrow client feedback/runtime boundary; no private server snapshot |
| `apps/storefront/features/account/shopper-account.tsx` | Cart owner transition before sign-in/out/reset requests and server recheck after settlement; existing shopper/Wishlist semantics retained |
| `apps/storefront/lib/api/client/http.ts` | Additive validated safe context/currentVersion error metadata; existing envelope/status/retry fields preserved |
| `apps/storefront/features/cart/controller.test.ts`, `pending-journal.test.ts` |24 focused controller/journal tests;10 existing PDP/architecture regression tests also run |
| `scripts/cart-phase01b-*` | Isolated synthetic runtime, loopback actual-response fault proxy, dependency-free Chrome CDP tests, cookie-policy and visibility checks |

Detailed design: [state architecture](PHASE_01B_CART_STATE_ARCHITECTURE.md).

## 5. Guest bootstrap

Read-only visits do not initialize. First Add obtains optional cross-tab lock, checks current, initializes only a confirmed cookie-less empty state and performs an unqualified actual-cookie GET before mutation. Policy-denied locks fall back only before task entry; server barriers remain mandatory. Multiple real slots require explicit selection, then a server-validated GET; public UUID never authenticates.

Controlled browser ordering held initializerA, acknowledged B's add, then released A. Two distinct HttpOnly cookies remained, B's quantity1 remained accessible and A displayed selection. Default Web Locks produced one slot. Real blocked-cookie Chrome returned UserPreferences rejection, zero slots and no success. [Protocol](PHASE_01B_BOOTSTRAP_COORDINATION.md), [browser evidence](PHASE_01B_BROWSER_SCENARIO_RESULTS.md).

## 6. Mutation coordination/revisions

Submitted operation/key/body/version/owner are immutable. Duplicate in-flight activation shares a flight; later explicit action receives a new key. Different commands serialize. Unknown outcomes block new mutations and offer explicit exact-key recovery. Commit-then-response-loss and reload retries retained the committed quantity exactly. Definitive stale desired-state writes require review/current refresh and are never silently rebased.

Response tickets, owner epochs, revision/evaluation timestamps and an external-change fence suppress stale projections. A receipt's committed outcome is distinct from current pricing projection. Same-version no-op is confirmed, not represented as a quantity change. A failed reconciliation read retains uncertain recovery. Ownership rejection stays latched even if a later GET becomes cookie-less404; it cannot silently enable anonymous replacement. [Semantics](PHASE_01B_MUTATION_RECONCILIATION.md).

## 7. Authentication boundaries

Auth begin clears previous projection/notice and invalidates old callbacks/queued work. Settled resolves actual shopper authority. Real sign-in/out and account A→B checks show controlled account unavailability and no old guest count. Guest credentials/contents are not erased or adopted by frontend. Session expiry/invalid identity never authorizes guest fallback. No account merge workflow or new authentication realm.

## 8. Storefront compatibility

Actual PDP add, Cart quantity edit/remove, coupon apply/remove, header count, route-unmount continuity, reload and history navigation passed against the real API. Product options/variant IDs and Wishlist operations retained. Only Cart adapter references guest routes; header and page no longer maintain independent Cart DTOs/fetches. CartDrawer import now exists only in the design-system specimen. Existing Checkout implementation/import contracts untouched; full Checkout/account compatibility remains an inherited01A gate, not newly certified by these frontend tests.

## 9. Security

No raw guest credential in JavaScript/storage/channel/logs. Real HttpOnly browser checks, no-store responses/public HTML checks, extra tenant/price rejection and foreign-selector denial passed. No backend cookie/origin/CORS/auth control weakened. No money authority moved client-side. [Threat mapping/security review](PHASE_01B_SECURITY_REVIEW.md) distinguishes source preservation from newly executed tests.

Inherited High legacy adoption/retirement/fixation parity remains open. No claim of penetration testing, complete CSRF/rate/catalog privacy revalidation, legal policy approval, Pixel/CAPI behavior or release authorization.

## 10. Exact verification

| Command | Executed outcome |
| --- | --- |
| `pnpm exec vitest run apps/storefront/features/cart/controller.test.ts apps/storefront/features/cart/pending-journal.test.ts apps/storefront/features/pdp/pdp-product-details.test.tsx tooling/architecture-boundaries.test.mjs` |34 PASS /4 files;24 new focused +10 existing regression tests |
| `pnpm exec tsc --project apps/storefront/tsconfig.json --noEmit --pretty false` |PASS |
| Targeted `pnpm exec eslint` on the10 modified storefront files, `apps/storefront/features/cart` and `scripts/cart-phase01b-*` |PASS; full exact argv in verification manifest |
| `pnpm --filter @maevelle/storefront build` |PASS, Next16.4.2 production compilation/type/static-route check; baseline build also passed |
| `pnpm check:architecture` |PASS,13 workspace packages |
| `git diff --check` |PASS |
| `node scripts/cart-phase01b-browser-acceptance.mjs` |17 PASS, actual Chrome156/API/PostgreSQL |
| `node scripts/cart-phase01b-blocked-cookies.mjs` |PASS, actual UserPreferences cookie rejection |
| `node scripts/cart-phase01b-visibility.mjs` |PASS, hidden display clear + visible authoritative recovery |
| Explicit isolated runtime, migration/semantic fixture creation |PASS, new dedicated database only; existing3213 and earlier migrations applied; no destructive database command |

No mock-only database concurrency claim: browser cases use actual transactions/receipts. Mock/fault API factory tests cover narrow edge ordering; the proxy drops real committed responses rather than fabricating success. Old destructive01A fixture suites were not rerun in01B. Prior70 tests/older unrelated failures remain historical01A evidence, not added to these counts. No full all-package suite, deployment checks or production tests were run. Initial harness/build/lint errors were fixed before final checks; exploratory limitations are preserved in browser results.

## 11. Performance/accessibility

No dependencies added; detail page stays route-bound, global feedback is narrow. Primitive subscriptions prevent count consumers receiving full projection changes. Server snapshot is empty for hydration/privacy. Production all-route JS remains27 chunks:1,272,387→1,291,362 bytes, aggregate gzip349,843→355,591 bytes (+5,748 gzip bytes). Totals/delta are in verification.json; this aggregate includes design lab and is not an eager-route or Core Web Vitals benchmark. No React render-time/CWV improvement claim.

Normal widths320/390/768/1280 show no horizontal overflow. Browser keyboard focus, live region, reduced-motion media, private-display visibility and synthetic mobile screenshot checked. CSS zoom2 at640px exposes706px global header/announcement width. Browser-menu zoom, real screen reader, physical touch and broader device/engine review remain open. This is the Phase01B visual PARTIAL gate, not WCAG certification.

## 12. Documentation

Created the eight required PHASE_01B documents: impact map, state architecture, bootstrap coordination, mutation reconciliation, browser scenario results, security review, acceptance register and this implementation report. Updated Cart README/scenario/threat references additively. Sanitized evidence includes main browser results, blocked-cookie result, visibility result, mobile screenshot and verification/preservation manifest under `docs/architecture/cart/phase01b-evidence/`.

## 13. Acceptance

[17-gate acceptance register](PHASE_01B_ACCEPTANCE_REGISTER.md): **14 PASS /2 PARTIAL /0 FAIL /1 BLOCKED**. Historical Phase00/01A counts/statuses are not rewritten. Phase01B overall and integrated foundation remain PARTIAL.

## 14. Open issues and smallest closure

- **High/inherited:** backend legacy fixed-cookie adoption/retirement/fixation parity and signed-in legacy compatibility require a targeted01A closure. Client-side adoption/guest fallback is prohibited.
- **Visual:** correct/verify global header high-zoom reflow and complete manual assistive/mobile checks.
- **Missing contract:** atomic Clear needs a backend semantic operation with owner/version/receipt semantics before frontend integration; current local rejection is safe and explicit.
- **Testing limits:** Chrome/CDP visible-window emulation is documented; no Safari/Firefox/physical OS-tab certification or complete commerce/coupon edge matrix.
- **Policy:** existing business retention/limits/privacy/tax/location approvals and Phase05 Meta documentation limitation remain open in their existing gates. No irreversible cleanup/legal claims introduced.

No unresolved new Critical/High issue is knowingly accepted. All existing dirty work preserved. Synthetic database remains available for inspection; no reset or teardown deletion was performed.

## 15. Next-phase readiness

Phase02A can use the verified guest facade/DTO/receipt/revision contracts for authorized domain work. Supply atomic Clear and applicable commerce contracts before expanding frontend actions. Targeted legacy-security closure is required before declaring the integrated foundation/release ready or extending account/legacy behavior. Phase02B should build its real drawer/page on this controller and finish outstanding accessibility checks; it must not create another Cart store. Phase03 account/merge, Checkout/payments/orders and deployment remain untouched.
