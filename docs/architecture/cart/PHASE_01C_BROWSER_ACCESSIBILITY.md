# Phase 01-C browser accessibility

Chrome 156.0.8078.74 drove the compiled Storefront through a loopback fault proxy to the real API and disposable PostgreSQL. Functional evidence separates 17 regression cases, 17 Clear/recovery cases, actual visibility change, exact two-variant selection, and actual first-party cookie blocking. The two-variant fixture chose Textured, confirmed the exact variant ID and BDT 123.0000 server unit price. The 390px Cart quantity buttons measured 48×50 CSS px.

| Check | Result |
| --- | --- |
| Reflow at 320/390/640/768/1280 | PASS. Empty layout checks, populated Cart regression and browser shell bounds. |
| 640px CSS zoom 2 and equivalent 320px | PASS. Distinct from browser page zoom. |
| Native Chrome 200% and 400% | PASS. Set Page zoom through Chrome's own appearance settings in disposable profiles. A 1280px outer width yielded 640/320 CSS px and DPR 2/4 with body CSS zoom 1. PDP and populated Cart matched scroll width to viewport. |
| Confirmation and keyboard | PASS. Cancel first, real Tab and Escape, focus restoration and focus-visible confirmation. At 400% the dialog scrolls vertically and Tab brings its confirmation into view. |
| Names and announcements | PASS for browser evidence. Native dialog naming, named quantity buttons, status region in AX tree, error/recovery messages observed. |
| Touch/reduced motion | PASS for Chrome CDP touch and emulated preference. |
| Other browsers and human AT | PARTIAL. Firefox unavailable. Safari WebDriver refused because remote automation is off. No human screen reader or hardware device session was recorded. |

[Native zoom results](phase01c-evidence/native-zoom.json) · [400% screenshot](phase01c-evidence/native-zoom-4.png) · [Layout/AX](phase01c-evidence/layout.json) · [Cookie policy](phase01c-evidence/blocked-cookies.json) · [Safari attempt](phase01c-evidence/safari-session.json).

## Manual closure

Use the same isolated fixture and a fresh browser profile. Record browser/OS, device, orientation, viewport and assistive technology versions. In Safari, enable remote automation only in an approved test session if driving through WebDriver. Use Firefox when available. In actual desktop browser zoom at 200% and 400%, and on an actual iPhone/iPad and Android handset, visit the selectable PDP, Add the second option, open the bag, adjust quantity, apply a synthetic coupon, then open and cancel Clear. Check reflow, reachable controls, footer, scroll behavior, focus visibility and focus return in portrait and landscape. Confirm clearing then trigger an expired bag and explicit browser forgetting.

With VoiceOver/Safari and an available second supported screen-reader combination, navigate headings, links, named variant and quantity controls and Cart status. Confirm that Add and quantity updates announce once, conflicts and lost-response recovery are understandable without visual cues, and unknown count is distinct from confirmed empty. Open both confirmations, read title/description/actions, traverse focus, use Escape or platform equivalent and check restoration. Test denied cookies and auth transitions for stale content. Record actual announcements and any failures. Accessibility-tree and synthetic touch evidence supports the local checks while this human gate remains PARTIAL.
