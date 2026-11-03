# Phase 01B-R security and performance

2026-11-03. Source review and focused runtime evidence; no penetration-test,
Core Web Vitals improvement or production-readiness certification.

## Security findings and mitigations

| Finding / severity | Source and failure condition | Mitigation / evidence | Residual |
| --- | --- | --- | --- |
| Lost uncertain recovery — High potential duplicate-intent risk | Controller could discard an earlier unknown intention after a later authority rejection;404 restore could miss the journal | Keep pending memory/journal across epochs, including memory-only coupons; block reset/new writes until exact recovery or separate explicit stop. Controller tests and lost-response/timeout browser cases | Explicitly stopping recovery cannot undo a committed write; UI warns before new intention |
| Late post-reset cookie — Medium continuity risk | Another tab's delayed initialization can return Set-Cookie after reset read404 | Drain local requests, same optional lock, transition fencing, persistent nonsecret reset-review marker, server re-read and explicit review. Controlled late-response browser case and reload unit test | No global revocation; uncoordinated/nonparticipating clients and storage denial remain explicit limits |
| Enabled SSR action — Medium reliability risk | Server HTML enabled Add before hydration/authority validation; early activation could be lost | Busy SSR/idle selector until initial read settles; production browser tests wait on that actual disabled state | JS/network unavailable cannot complete a Cart mutation; no false success |
| Old PDP continuation — Medium navigation/display risk | Late callback after route/product/auth change could navigate or attribute success to the current page | Admission route scope, generic earlier-action feedback, fenced Buy Now continuation | Original server intention may still commit; safe replay remains required |
| Resource/coordination leak — Medium | Unbounded distinct flights; listener/channel/polling lifetime; suspended lock acquisition |20-flight admission, duplicate collapse, last-subscriber cleanup,20-second acquisition/15-second transport budgets. Runtime/controller tests, bounded cross-tab read evidence | No claim of total transaction deadline or distributed flood protection; backend rates remain enabled |
| Focus/reflow — Medium UX risk | Removed trigger, native focus leaving modal controls, footer/input overflow | Shared dialog focus fallback/Tab wrap and measured layout fixes | Real AT/device/native zoom checks remain open |

No price, stock, discount, tenant, currency or shopper authority moved to JavaScript.
Only the adapter calls Cart routes; no raw credential is read, persisted or
broadcast. Cookies remain server-issued HttpOnly capabilities. Header/page/PDP
share one controller; no sample-data production Cart. Private projections are not
server snapshots or public cached HTML. Error/context channels contain no tokens,
full products, shopper identities or coupon text. No frontend change weakens
origin/JSON/ownership/revision/receipt protections. Account Cart unavailability
never falls back to guest. No Critical/High finding is waived as release-ready.

One test-only backend change makes performance-artifact writes opt-in. It changes
no API/domain/security behavior. Historical benchmark provenance was affected by
an accidental fixed-output rewrite and is documented in the impact/report; do
not represent regenerated plans as the original01A-R execution.

## Performance evidence and limits

No dependency installation or new state framework. Primitive count/busy/epoch
selectors remain, and global state is lazy/client-only. Real subscriber tests
prove one poll timer shared across subscriptions and zero after final cleanup. Read429/503 cooldowns also pause background refreshes
and new commands until Retry-After ends; manual recovery keeps the same key.
Mutation hints are one minimal message per confirmed intention, reads do not
broadcast, and revision hints are coalesced. Cross-tab Clear measures bounded
server reads, not an infinite invalidation loop.

The production build is required and recorded in storefront-build.txt. Current
route JavaScript/network/interaction samples, when recorded, are in performance.json.
These are local measurements, not a pre/post comparison, React Profiler result,
mobile hardware benchmark or Core Web Vitals claim. The loopback fault proxy
requests identity encoding; compressed-size estimates are distinct from observed
network transfer. No baseline bundle delta is invented. Backend benchmark output
is kept separate and never used as proof of frontend performance.

Remaining release gates: representative product grids/catalog/load, real mobile
CPU/network, production proxy/cache behavior, idle/background suspension and full
render/CLS profiling. Existing Cart analytics/provider/retention capabilities are
not implemented by this frontend phase.

Final production-route sample:767,791 decoded script bytes;212,807 locally estimated gzip bytes;141.62ms touch-to-confirmed-header latency including80ms observation granularity. One ordinary read and four first-Add Cart requests. No baseline delta or representative-device claim. See [raw sample](phase01br-evidence/performance.json).
