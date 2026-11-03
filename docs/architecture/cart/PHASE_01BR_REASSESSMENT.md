# Phase 01B-R frontend reassessment

2026-11-03. Scope is the guest frontend foundation against the verified01A-R
backend, not complete account/merge/Checkout/analytics/Admin Cart functionality.
The repository dirty source outranks historical phase labels. Historical reports
retain their original outcomes; the current implementation supersedes their
unsupported-Clear and missing-reset statements.

| Subsystem | Verified current finding | Decision / alternative |
| --- | --- | --- |
| External store | One browser-only factory controller; server snapshot contains no private Cart; header/busy/epoch select primitives | KEEP. Context/reducer or a new query library would not remove imperative cross-tab/unknown-write orchestration and would add migration/dependency cost |
| Transport | Stable key/path/body/version/context, no client money;15-second abort deadline | KEEP, extend exact atomic Clear and cookie-forgetting endpoints. Transport signals may differ per attempt; intent fields must not |
| Queue | Existing serialized mutations and duplicate flights; no admission bound; Clear unsupported | IMPROVE:20 outstanding distinct flights, Clear blocks dependent commands, UUID per intention, exact replay remains separate |
| Authority | Epoch/ticket/revision fences, explicit context selection, strict account-unavailable state | KEEP and strengthen preservation of uncertain intents across failed authority reads; no account-to-guest fallback |
| Journal | Tab-local minimal references,7-day/2KB whitelist, coupon text excluded | IMPROVE: Clear whitelist; preserve review state when cookies disappear; minimal nonsecret reset-review marker survives reload |
| Recovery | Unknown write could be lost on a later ownership rejection; no app session reset | REPLACE unsupported reset with deliberate forgetting; pending recovery must be resolved or explicitly stopped first |
| Bootstrap | Optional Web Locks plus mandatory cookie round trip; unsupported coordination cannot correlate cookie-less clients | KEEP, add20-second lock acquisition budget. Same lock coordinates mutations/reset; denied locks fall back only before callback entry |
| Browser runtime | Lazy singleton, bounded hints/polling; no release of listeners/channel/timer when last subscriber leaves | IMPROVE reference-counted cleanup; lifecycle hints remain non-authoritative |
| PDP | Shared controller; SSR busy snapshot false enabled Add before authority validation/hydration; Buy Now could navigate after unmount | FIX busy SSR/idle state and continuation generation; preserve exact product/variant selection and Wishlist behavior |
| Cart/header | Real page/navigation/count already replace sample drawer; missing atomic Clear; zero unknown states already distinguished | KEEP current visual composition, add Clear confirmation and recovery; no complete drawer/page redesign |
| Confirmation | Existing native size dialog and mobile-only BottomSheet; no reusable cross-device confirmation | ADD focused native ConfirmDialog using shared Button; safe initial focus, Escape, containment, post-removal fallback |
| Layout | Actual640px/body zoom2 failure: footer privacy row right705.875px; tablet input right670.984px | FIX measured wrap/intrinsic sizing. Announcement text previously truncated and lacked keyboard pause; reflow and add pause. Never hide horizontal overflow |
| Sticky chrome | Chat launcher switched to desktop offset atsm while bottom navigation remains until lg | FIX offset breakpoint only; no Chat/provider behavior change |

Controller ownership, network activity and session-forgetting transport are focused
modules. Do not fragment the state/epoch transitions into independent stores or
turn channel messages into identity proof. The controller remains the cohesive
orchestrator; presentation, journal, transport, coordination resources and recovery
I/O have their own boundaries.

No dependency or authentication realm was added. Backend routes/migrations,
Wishlist/Admin/Worker/provider behavior stay authoritative and unchanged. One
inherited DB test artifact sink was made opt-in after an accidental historical
benchmark artifact overwrite; see the impact map and implementation report for
that preservation exception. It is not a backend contract modification.
