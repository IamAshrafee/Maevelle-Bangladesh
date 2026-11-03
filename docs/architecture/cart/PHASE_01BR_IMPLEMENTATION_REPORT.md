# Phase 01B-R implementation report

2026-11-03. **PARTIAL local implementation acceptance.** Overall Cart release
readiness remains PARTIAL independently. No production/shared DB or VPS operation,
package installation, commit, push or deployment occurred.

## 1. Phase 01B-R status

18 PASS /2 PARTIAL local acceptance gates. The two partial gates are complete
AT/device/native-zoom acceptance and the explicitly disclosed historical timing
artifact preservation exception. Account persistence/merge and full Checkout are
not mislabelled as failures of this guest frontend assignment.

## 2. Executive summary

Kept one external store and authoritative backend contracts. Implemented atomic
Clear and deliberate session forgetting; retained exact-key replay, separated
uncertain intentions from confirmed projections, preserved unknown work across
owner loss, added a reload-safe nonsecret reset-review marker, bounded queues and
lock waits, and released runtime resources on final unsubscribe. Fixed pre-hydration
Add readiness, old Buy Now continuations, dialog focus/keyboard behavior, measured
header/footer/line-item zoom overflow and48px Cart quantity controls. No second
Cart state library, unsafe bearer adoption or client price/tenant authority.

## 3. Git baseline and preservation

Initial/final branch `main`, HEAD
`aa290065407030e85b5b6847efd22fb437a65279`. The pre-edit manifest covers2054
tracked/untracked files, including the extensive existing dirty Cart/Wishlist/
Admin/API/Worker work. No reset/clean/stash/discard. Final hashes/path accounting
are in [preservation.json](phase01br-evidence/preservation.json).

**Preservation exception:** an inherited benchmark test wrote its fixed output
into01A-R performance.json during regression. Original narrative/test outcomes
and original reported sample values remain preserved; the original complete plan
bytes could not be restored. The artifact now explicitly records regeneration,
its original checksum and reported samples. New measurements live under01B-R.
The DB test now writes artifacts only when CART_PERFORMANCE_OUTPUT is supplied.
This was an avoidable evidence-handling error, not a business-data or backend
contract change. Do not claim byte-perfect historical artifact preservation.

## 4. Frontend architectural reassessment

[Reassessment](PHASE_01BR_REASSESSMENT.md) evaluates controller, transport, journal,
queue, lifecycle, subscriptions, authority, recovery, PDP/header/page, shared
primitives and accessibility. Existing factory external-store architecture is
appropriate; replacing it with another cache/context library would duplicate
state without resolving capability/unknown-outcome races.

## 5. Keep / improve / refactor / replace / retire

KEEP factory store, primitive selectors, backend truth, exact submitted identity,
capability barrier and shopper realm. IMPROVE queue/lock bounds, journal/reload
fences and resource cleanup. REFACTOR session-forgetting I/O into session-recovery,
request tracking into activity, and recovery presentation into focused components.
REPLACE unsupported Clear with semantic backend DELETE. RETIRE the unsupported
capability message, unkeyed assumptions, dangling quantity label, enabled SSR
Add window and clipped/nowrap affected content. [Six ADRs](PHASE_01BR_ARCHITECTURE_DECISIONS.md).

## 6. Final shared controller

One browser-only controller serves header, global feedback, PDP and Cart. Confirmed
server projections, submitted intentions, unknown outcomes and errors remain
separate. Twenty-flight admission, duplicate collapse, serialized commands,
epoch/ticket/revision/evaluation fences and15-second transport deadlines remain
explicit. Optional Web Lock acquisition is bounded at20 seconds. Private state
is never a shared server snapshot. No optimistic money or stock authority.

## 7. Atomic Clear

Main-page confirmation states all items AND selected coupons will be removed,
with no misleading Undo. One `{kind:'clear'}` intention, UUID, observed revision
and owner context reaches DELETE current. Receipt/current projection reconcile
separately, subscriptions/count update and one revision hint is emitted. Empty
Clear gives an already-empty notice without an invented version/change event.
Duplicate/stale/conflicting/timeout/lost/503/replay/next-Add cases are tested.

## 8. Session forgetting and recovery UX

“Start a new bag on this browser” requires deliberate confirmation, warns that
old contents may not return and that stored bags are not deleted. Unknown work
must first be recovered exactly or separately acknowledged as stopped; active
requests cannot be hidden by reset. Drain tracked activity, coordinate, call
forgetting, clear owner-bound state only on acknowledgement, and re-read actual
cookies. Do not initialize until a new explicit shopping action. Remaining/late
credentials, including after reload where storage permits, require review.
[Implementation](PHASE_01BR_CLEAR_AND_RESET_IMPLEMENTATION.md).

## 9. Guest bootstrap/context selection

Retained optional Web Locks plus mandatory server cookie round trip. Independent
cookie-less requests are not falsely correlated. Multiple slots require explicit
offered context selection and a server read; a pending intention cannot migrate
to a different context. Cookie rejection, expiration/eviction, delayed initialization
and absence of automatic replacement are verified. A public UUID grants no authority. “Review other bags” supports returning to the
server-backed list; slot-limit recovery is deliberate and bounded.

## 10. Replay/revision integrity

Every command uses a new UUID for a new decision and the exact same operation,
path/body, owner and revision for an uncertain retry. No fresh-key timeout retry,
no stale desired-state overwrite. Receipt committedVersion may precede the fresh
projection; feedback distinguishes those concepts. Expired/mismatched intentions
remain reviewable until explicit stop. Coupon contents stay memory-only rather
than expanding persistence. [State contract](PHASE_01BR_STATE_AND_RECOVERY_CONTRACT.md).

## 11. Cross-tab/browser lifecycle

Minimal nonsecret hints only invalidate/re-read. They never select/authenticate,
combine bags or replay commands. Transition/revision hints are bounded/coalesced;
reads do not broadcast. Last unsubscribe releases channel/listeners/polling.
Visibility/focus/history/online/auth settlement revalidate while old epochs cannot
restore display. A post-reset review marker survives tab reload; denied storage
retains memory safety and an honest reload warning. No infinite initialization
or automatic retry loop.

## 12. Authentication/owner isolation

Existing strict verified shopper realm and CRM mapping remain authoritative.
ACCOUNT_CART_NOT_READY is shown honestly; no guest substitution or account merge.
Real synthetic A/B/sign-in/out and pending-owner scenarios pass. Auth begin hides
old contents and fences callbacks before settlement. Unsupported account capability
is not represented as working merely because a guest cookie still exists.

## 13. PDP, Cart page and header

Real header navigation/count remain; unknown does not become false zero. Sample
CartDrawer stays only in its design-system specimen. PDP variant selection and
Wishlist interactions are preserved. SSR/idle Add controls wait for authority;
route/product/owner continuation fencing prevents old success/navigation effects.
Cart retains quantity/remove/coupon workflow while adding Clear/reset feedback,
wrapping line content and accessible48px quantity/remove targets. Shared native
ConfirmDialog and touch stepper are demonstrated in the permanent lab.

## 14. Accessibility/responsive verification

Actual706px overflow at640px/body zoom2 was traced to footer nowrap and tablet
input padding/minimum sizing. A populated run then exposed653px line-price overflow;
its flex groups now wrap.320/390/640/768/1280 and supplemental CSS zoom/effective
320px reflow, reduced motion, status AX tree, Enter/Tab/Escape and disappearing-
trigger focus are recorded. Touch emulation activates real PDP Add. Real AT,
hardware devices, native zoom and multi-engine acceptance remain unperformed;
no WCAG certification. [Accessibility report](PHASE_01BR_ACCESSIBILITY_REPORT.md).

## 15. Security findings/mitigations

Unknown work preservation closes a potential duplicate-intent/continuity problem.
Late-cookie/reset/reload fences, queue/acquisition bounds, SSR readiness and old
continuation guards improve reliability without weakening backend ownership.
No credentials in frontend persistence/hints; no private server Cart cache, new
auth realm, price/tenant authority, unsafe reset/retry or newly waived Critical/High
finding. Existing01A-R/01A.1 protections remain. [Security/performance](PHASE_01BR_SECURITY_AND_PERFORMANCE.md).

## 16. Performance measurements

No dependency added. Primitive selectors and one shared runtime retained; cleanup
and hint/request bounds have tests. The current production-route sample records
one ordinary Cart read, then two reads/initialization/Add for the first action.
Observed route bytes, gzip estimate and touch-to-confirmed-header latency are
stored in performance.json. These are local samples, not baseline deltas, CWV,
CLS, a React Profiler run or representative device/load measurements.

## 17. Exact test commands/results

Final focused run:148 PASS /17 files /0 failed /0 skipped. Includes real DB/API,
controller/journal/transport/runtime, PDP, Wishlist and architecture regressions.
34 functional browser cases, one actual cookie-policy case, nine layout/AX checks
and a touch-emulated sample are recorded separately.
Production Storefront build, Storefront typecheck, scoped ESLint, architecture,
migration-history and whitespace checks are recorded. No full monorepo suite/build.

```sh
# Explicitly exported TEST_DATABASE_URL targets only the owned loopback test container.
CART_PERFORMANCE_OUTPUT=docs/architecture/cart/phase01br-evidence/backend-performance.json pnpm exec vitest run packages/database/src/cart-foundation.test.ts packages/database/src/cart-credential-closure.test.ts packages/database/src/cart-reassessment.test.ts apps/api/src/cart-foundation.test.ts apps/api/src/cart-credential-closure.test.ts apps/storefront/features/cart/controller.test.ts apps/storefront/features/cart/pending-journal.test.ts apps/storefront/features/cart/api.test.ts apps/storefront/features/cart/browser-runtime.test.ts apps/storefront/features/pdp/pdp-product-details.test.tsx apps/storefront/features/wishlist/wishlist-store.test.ts apps/storefront/features/wishlist/guest-journal.test.ts apps/storefront/features/wishlist/account-adapter.test.ts apps/storefront/features/wishlist/share-client.test.ts apps/storefront/features/wishlist/recipient-save-feedback.test.ts apps/storefront/lib/analytics/wishlist-telemetry.test.ts tooling/architecture-boundaries.test.mjs
pnpm exec tsc --project apps/storefront/tsconfig.json --noEmit --pretty false
pnpm exec eslint apps/storefront/features/cart apps/storefront/components/ui/confirm-dialog.tsx apps/storefront/components/commerce/quantity-stepper.tsx apps/storefront/components/layout/{announcement-bar,mobile-navbar,mobile-footer}.tsx apps/storefront/features/pdp/{pdp-view,pdp-sticky-bar}.tsx apps/storefront/features/chat/chat-root.tsx apps/storefront/app/design-system/page.tsx packages/database/src/cart-reassessment.test.ts scripts/cart-phase01br-*
STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002 STOREFRONT_BASE_URL=http://localhost:3000 pnpm --filter @maevelle/storefront build
pnpm check:architecture
pnpm check:migrations
git diff --check
```

Browser commands/artifacts: [acceptance report](PHASE_01BR_BROWSER_ACCEPTANCE.md).
All tests use actual isolated PostgreSQL18.6: own labelled tmpfs container on
127.0.0.1:55443; identity/mount/host verified, random fixture databases, synthetic
catalog/inventory/accounts, local email mailbox. Existing persistent local Cart/
Wishlist containers and all production/shared/VPS systems are untouched. No new
migration was authored; existing migrations execute only in isolated fixtures.

## 18. Documentation/acceptance counts

Ten requested01B-R reports, current index/spec notices, shared primitive guide
and resume metadata updated. Local register:18PASS/2PARTIAL. Browser artifacts
separate functional, cookie-policy, layout/AX and touch/performance checks; no
historical counts are added as if freshly rerun. Raw failure logs retain startup,
readiness, overflow, focus, limiter/harness and assertion investigations.

## 19. Outstanding risks/release blockers

Complete real AT/device/native-zoom/multi-engine and representative performance
acceptance remains open. Restore original01A-R timing-plan bytes from a matching
backup if available; the provenance exception remains explicit. Persistent legacy
continuity/cutover, backup/restore/revocation, real proxy/role/TLS/cache, privacy/
retention/location policy and account persistence/merge are separate release gates.
The legacy Storefront Checkout path still needs a deliberate multi-context handoff;
the Cart page retains its controlled gate. No deployment packaging, security
certification or production readiness is asserted.

## 20. Phase 01 integrated foundation readiness

Guest frontend/backend contracts are coherent and locally tested. Integrated
acceptance remains PARTIAL because the stated verification/preservation gaps and
01A-R operational gates remain. A passing build is not a staging deployment;
frontend reset cannot solve historical ownership proof or database revocation.

## 21. Phase 02A readiness/commerce contracts

Ready for a separately assigned commerce backend audit using exact variant IDs,
server money/availability, scoped owner contexts, intent revisions/UUID receipts,
atomic Clear and the current coupon facade. Remaining contracts include variant
replacement/collisions, richer eligibility/availability and promotion rules,
policy-configured limits/location eligibility and complete commerce evaluation.
Do not preempt account merge, Wishlist transfer/recommendation bulk operations,
analytics/Admin, Checkout, payment, order placement or reservations. Any contract
change must deliberately migrate this shared adapter/controller and consumers.
