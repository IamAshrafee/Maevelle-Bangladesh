# Phase 01B-R browser acceptance

2026-11-03. Real Chrome156.0.8078.74 against the production-compiled Storefront,
actual Fastify routes and isolated PostgreSQL18.6. No mock Cart success payloads.
Loopback proxy preserves browser cookies and only holds/drops selected actual
responses, or injects a labelled synthetic503 before submission. A hanging real
committed response exercises the actual15-second frontend abort deadline.

Functional evidence:17 inherited/current regression cases plus16 new Clear/reset/
lifecycle cases and one real visibility-transition case (34 total). Cookie rejection is a separate actual browser-preference case. Nine layout,
reduced-motion and browser accessibility-tree checks are separate from functional
scenario counts. Touch emulation/performance is a separate sample. No cross-browser,
real hardware, native zoom or screen-reader claim.

| User-required scenario | Evidence |
| --- | --- |
| 1 first Add | B02, touch-emulated production sample |
| 2 cold bootstrap | B01/B02 |
| 3 two-tab initialization | B07/B09 |
| 4 delayed initialization response | B07 |
| 5 multiple contexts/explicit selection | B07 |
| 6 rejected cookies | blocked-cookies.json: UserPreferences, zero cookies/no false success |
| 7 expired cookies/authority | BR25 actual database expiry |
| 8 eviction | B11/BR26 actual browser cookie deletion through CDP, not frontend JS |
| 9 session forgetting | BR25/BR26 |
| 10 reset racing late response | BR27, plus reload-marker controller regression |
| 11 Clear populated bag | BR18/BR20 |
| 12 Clear coupons | BR18 |
| 13 double Clear | BR20 one request/intention |
| 14 Clear then Add | BR21 |
| 15 stale Clear | BR23 preflight refusal and renewed confirmation |
| 16 timeout after committed Clear | BR31 actual transport deadline |
| 17 exact-key replay/lost response | B03/B04/BR22/BR31 |
| 18 owner change pending | B08; controller epoch tests |
| 19 real sign-in/out | B08/B15 using synthetic verified shopper accounts |
| 20 cross-tab quantity | B09 |
| 21 header synchronization | B02/B09/BR24 |
| 22 PDP navigation | B13 |
| 23 history | B16 |
| 24 narrow viewport | B12/layout320/390 |
| 25 high zoom | B12 exact640px/body zoom2 and layout effective320px; native zoom unperformed |
| 26 keyboard/focus | BR28 actual Enter/Tab/Escape; BR18 disappearing-trigger fallback |
| 27 recovery accessibility | Native labelled confirmations, persistent status and AX tree; complete AT remains PARTIAL |
| 28 denied storage/locks | B14 real storage denial; B07 unavailable locks; runtime tests explicit SecurityError and acquisition timeout |
| 29 offline/reconnect | BR29 |
| 30 invalid ownership/context | B10/B07; strict backend regression cases |

Additional coverage:33-slot recovery BR32; actual tab-close/reopen after commit BR33;
[visibility evidence](phase01br-evidence/visibility.json) checks hidden display and
foreground revalidation. SessionStorage is tab-local: a newly opened tab reads
current server state without auto-replaying lost tab-local intentions. No promise
of cross-tab-close journal persistence is made.

Additional coverage: empty/no-op Clear and replay BR19;503/Retry-After BR30;
source/API integrity, changed payload, unknown fields and foreign selector B10;
private state excluded from public HTML B16; coupon UI compatibility B17.

## Artifacts and commands

- `node scripts/cart-phase01br-browser.mjs` →
  [17-case regression](phase01br-evidence/browser-regression.json), raw browser-regression.txt.
- `node scripts/cart-phase01br-clear-reset.mjs` →
  [16-case Clear/reset/lifecycle](phase01br-evidence/browser-clear-reset.json).
- `node scripts/cart-phase01br-blocked-cookies.mjs` →
  [cookie policy](phase01br-evidence/blocked-cookies.json).
- `node scripts/cart-phase01br-layout.mjs` →
  [layout/AX](phase01br-evidence/layout.json), phone/zoom PNGs.
- `node scripts/cart-phase01br-visibility.mjs` → actual hidden/visible browser state, visibility.json.
- `node scripts/cart-phase01br-performance.mjs` →
  [production route/touch sample](phase01br-evidence/performance.json).

Prerequisites: own labelled tmpfs PostgreSQL container127.0.0.1:55443; runtime
`CART_01BR_ISOLATED_URL` explicitly verified; synthetic runtime on3002; production
Storefront on3004; loopback-only fault proxy on3000; two dedicated headless Chrome
profiles on9227/9228. Runtime fixtures and fault endpoints are never registered
in production buildApi. Production cookie security remains the01A-R HTTPS proof;
these UI tests use actual development HttpOnly cookies on localhost HTTP.

Do not run both functional scripts concurrently: they share fault selection and
owned browser-context cleanup. Dispose completed case contexts to stop their
polling; do not relax API protection. The reused local `next start` test server
warns about output:standalone; these tests verify compiled application behavior,
not deployment packaging. No staging smoke/deployment was attempted.

## Failures investigated before final evidence

Initial dev/proxy startup produced404/unhydrated controls; the test switched to
the required production build. A real enabled-SSR/pre-authority window was fixed,
not hidden by a long test sleep. Real706px overflow was reproduced and corrected
from element bounds. Focus fallback and Tab cycling were repaired and verified
with actual key events. Test contexts left open accumulated polling and hit the
real limiter; case cleanup fixed the harness without disabling protection.
Transport unit comparison now excludes per-attempt AbortSignal identity while
asserting exact immutable request fields. Touch setup applies mobile metrics
before navigation and uses immediate scroll before tapping, avoiding a moving
smooth-scroll target. Initial failure logs are retained separately; final JSON
records the final executed result, not historical phase outcomes.

Final executed-check summary: [verification.json](phase01br-evidence/verification.json). The shared lab confirmation passed Cancel-first focus, Escape and trigger focus restoration ([lab record](phase01br-evidence/design-system.json)). A final fast-suite run also exhausted the unchanged shared-IP limiter; its failure log is retained, and spaced probes passed all16 cases after the limiter window expired.
