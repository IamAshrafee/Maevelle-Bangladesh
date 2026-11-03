# Phase01B browser scenario results

2026-11-02. Real Chrome156.0.8078.74, Next16.4.2 production build, actual Fastify API and PostgreSQL18.6. No Playwright/Puppeteer installed; dependency-free CDP harness uses installed Chrome. No Cart response, receipt or cookie credential is mocked. The loopback proxy holds/drops **actual upstream responses after commit**, preserving real Set-Cookie and Origin behavior.

**19 PASS:**17 main scenarios plus actual blocked-cookie and visibility checks. Machine-readable [main results](phase01b-evidence/browser-results.json), [blocked cookies](phase01b-evidence/blocked-cookies.json), [visibility](phase01b-evidence/visibility.json). The CSS-zoom stress observation is a separate **PARTIAL** visual gate, not hidden by these pass counts.

| Case | Executed result | Scenario / threat mapping |
| --- | --- | --- |
| B01 | Ordinary PDP current GET404, no initialization or slot cookie | S01/S59; T09 |
| B02 | First UI Add, actual HttpOnly slot, document.cookie excludes credential, header count1, response no-store | S01; T05/T16 |
| B03 | Partial response interrupted after real commit; explicit same-key retry leaves quantity2, not3 | S03/S04/S57; T10/T11 |
| B04 | Full reload recovers unknown intent for review; exact replay leaves quantity3 | S05; T10 |
| B05 | Cart UI quantity increment/decrement persisted via real API | S07/S13; T11 |
| B06 | Other tab changes quantity4; old desired2 is409 STALE_VERSION, persisted4 retained | S07/S34; T11 |
| B07 | Locks unavailable; initializerA response held, B adds successfully; releaseA installs second real cookie; A requires explicit chooser, B quantity1 remains accessible by credential+context | S59; T04/T11 |
| B08 | Hold committed guest mutation; actual auth sign-in while in flight; release old response cannot display old success; account unavailable; sign-out rechecks guest | S24/S25/S57; T02 |
| B09 | Web Locks serialize cold initializers to one slot; competing writes cannot silently overwrite; explicit subsequent add broadcasts hint and other header reconciles | S34/S59; T10/T11 |
| B10 | Same-quantity no-op and replay; changed same-key body409; invalid coupon404; extra tenant/price400; foreign public context409 OWNER_CHANGED | S03/S36/S39; T01/T07/T10/T14 |
| B11 | Actual Chrome credential deletion; reload refuses replacement, GET404 and zero slots | S25/S26; T05 |
| B12 | Widths320/390/768/1280 without horizontal overflow; keyboard focus, polite live region, reduced-motion media; screenshot reviewed | S55; partial accessibility evidence |
| B13 | Client route navigation while committed mutation response held; shared result/header2 survives; actual UI removal yields empty Cart | S05/S57; T11 |
| B14 | Denied sessionStorage; current tab still establishes real cookie, warns on unknown write, exact in-memory retry does not duplicate | S34/S05; T10/T16 |
| B15 | Real sign-in/out as synthetic A then B: account unavailable, no previous guest count shown, guest contents retained | S24/S25; T02 |
| B16 | Browser history returns to authoritative Cart; public HTML has no private variant/product line payload | S01/S34; T16 |
| B17 | Valid synthetic coupon UI apply/remove invokes real Promotions and restores discount0 | S13; T08 |
| Cookie policy | Separate Chrome profile denies first-party cookies; Network blockedReasons=UserPreferences, zero slots, no “Added” success | S01/S59; T04/T05 |
| Visibility | Real document.visibilityState hidden removes private Cart line/count; visible event revalidates and restores authorized projection | S25/S34; T02/T16 |

## Environment and reproduction

- Existing owned container `maevelle-cart01a-pg18`, label `maevelle.purpose=cart01a-isolated`, tmpfs `/var/lib/postgresql`, bound **127.0.0.1:55441**. Explicit newly created `maevelle_cart01b_cdaf4d23358047189e6a965b3e9841d6`; actual current_database verified before migrations/fixtures. No shared/production database, reset, DROP or TRUNCATE.
- `scripts/cart-phase01b-runtime.ts` requires explicit `CART_01B_ISOLATED_URL` matching verified loopback template; creates a unique database, applies existing migrations and semantic synthetic catalog/inventory/price/coupon fixtures. Never deletes a database. Credentials stay in private `/tmp/maevelle-cart01b/fixture.json`, not this evidence.
- Start production Next on3004 with local STOREFRONT_BASE_URL=http://localhost:3000 and STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002; proxy `node scripts/cart-phase01b-browser-proxy.mjs` on loopback3000. API3002. No security middleware modified.
- Launch installed Chrome with `--headless=new --remote-debugging-port=9227 --user-data-dir=/tmp/maevelle-cart01b-chrome --no-first-run --no-default-browser-check`. Dedicated profile only.
- Main command: `node scripts/cart-phase01b-browser-acceptance.mjs`.
- Blocked-cookie profile on9228 has Preferences `profile.default_content_setting_values.cookies=2`; command `node scripts/cart-phase01b-blocked-cookies.mjs` verifies browser-reported rejection, not just a preference file.
- Visibility command: `node scripts/cart-phase01b-visibility.mjs`.

## Honest limits and debugging evidence

Initial exploratory runs failed on an outdated button selector, canonical decimal quantity used incorrectly in test request, expecting401/404 where source defines409 OWNER_CHANGED, and case-sensitive CSS-uppercase empty-state text. These test assumptions were corrected against actual source. A connection-only disconnect caused Chrome to transparently retry the **same** key safely; the final injector interrupts a response body to exercise explicit unknown-state recovery. Repeated runs also encountered retained API rate limits; none were disabled.

Headless focus/viewport emulation left later windows hidden; the application correctly cleared private display and deferred reads. The deterministic main harness models visible independent windows with CDP focus emulation; this does not mock cookies or HTTP. Separate visibility test restores actual hidden/visible document events and verifies clearing/revalidation. No physical multi-monitor/manual OS-tab or Safari/Firefox claim is made.

Normal viewport results are not full WCAG2.2 certification. At CSS zoom2 on640px, global header/announcement content extends to706px. This is an open reflow check; CSS zoom differs from browser-menu zoom, which still needs manual verification. No real screen reader or physical touch/slow-network usability review ran. [Mobile screenshot](phase01b-evidence/mobile-cart.png) shows synthetic data only; consent overlay is existing shared behavior.

Atomic Clear has no backend route and cannot be browser-integrated; factory test proves an explicit unsupported result with zero mutation calls. Complete valid-coupon commerce edge cases, shutdown/restart restoration beyond sessionStorage, account Cart/merge and Checkout remain outside this foundation's proven behavior.
