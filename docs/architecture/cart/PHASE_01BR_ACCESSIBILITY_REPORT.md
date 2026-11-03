# Phase 01B-R accessibility and responsive verification

2026-11-03. **PARTIAL accessibility acceptance**, not WCAG certification.
The current browser JSON is the exact executed evidence; real assistive technology,
hardware touch devices and native browser zoom are not claimed.

## Measured root cause and corrections

The prior failure is reproduced:640px CSS viewport with body zoom2 produced
706px document width. Element bounds identified the tablet footer privacy row at
right705.875px (nowrap intrinsic minimum), and tablet search input at670.984px
(padding wider than its shrinking flex allocation). These are independent causes;
merely truncating the announcement or hiding overflow would not fix them.
A populated-Cart run then found a653px quantity/price overflow. Wrap that row
and the image/content group; use a shared48px touch stepper with a product-named
group rather than a dangling label for a nonexistent input.

Allow the footer/privacy group to wrap and let the tablet header/search reflow
at its useful minimum width. Keep navigation/actions reachable. Announcements
wrap instead of truncating, provide48px controls, pause/resume and pause on focus.
Chat launcher uses the lg offset boundary, matching bottom navigation visibility;
the previous sm override overlapped tablet/zoom navigation. No global overflow
hiding or storefront branding redesign was added.

Current evidence covers320/390/640/768/1280px widths with no horizontal overflow,
the exact640px/body zoom2 regression and320px effective viewport representing
400% reflow from1280px. That last check is NOT native400% browser zoom. Reduced
motion and browser accessibility-tree status regions are checked separately.
[Machine evidence](phase01br-evidence/layout.json),
[phone capture](phase01br-evidence/mobile-cart.png),
[zoom capture](phase01br-evidence/zoom-cart.png).

## Interaction foundation

- Shared native ConfirmDialog is named and described, initially focuses Cancel,
  keeps background inert, wraps Tab/Shift+Tab within its controls, supports Escape
  while idle and communicates busy confirmation. When Clear removes its trigger,
  restore focus after DOM commit to the permanent Cart status region. Do not
  mistake document.body as a meaningful prior focus target.
- Clear/reset/stop-recovery compose shared Buttons with48px important targets.
  Remove-item/coupon controls are enlarged. Labels state the effect and continuity
  limits. No nonfunctional Undo or color-only error is used.
- Cart feedback has a persistent focusable status destination and polite live
  announcements. Context selection uses real buttons; unknown counts remain
  unknown. Expired/account/error states do not masquerade as an empty bag.
- SSR/idle Cart controls remain busy until authority resolves; this closes the
  observed pre-hydration enabled-button window.
- Keyboard evidence uses actual CDP key events for Enter, Tab and Escape against
  the production application. Programmatic focus is setup; it is not presented
  as a screen-reader session. Browser AX-tree inspection is also not equivalent
  to VoiceOver/NVDA acceptance.

## Open checks / closure path

Run a documented VoiceOver or NVDA session covering confirmation descriptions,
error/status announcements, context selection, reset continuity warning, expired
account states and focus return. Test Safari/Firefox, real phone/tablet touch,
on-screen keyboard/orientation, native200%/400% browser zoom and text spacing.
CSS zoom is a supplemental regression technique and differs from native zoom,
especially for fixed consent/chat chrome and short viewport heights. Complete
owner visual review of those overlay interactions separately; settled screenshots
and width metrics alone do not establish complete device accessibility.
