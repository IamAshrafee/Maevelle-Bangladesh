# Cart master implementation roadmap

Phase00 creates specifications only. Each numbered capability has A (backend/database/API/domain/security/Worker/tests), B (frontend/state/accessibility/browser/tests) and a real integrated gate. A completion alone never completes the feature. B phases use the actual implemented API and explicitly disposable test fixtures; mocks supplement failure/unit tests only. Security work starts in 01, and transactional domain events start with first mutations rather than waiting for 05.

## Sequence and critical dependencies

00 → 01A → 01B/gate → 02A → 02B/gate → 03A → 03B/gate → 04A → 04B/gate → 05A → 05B/gate → 06A → 06B/gate → 07A → 07B/gate → 08.

Foundation introduces ownerContext and receipt schema before any account merge. Owning-domain promotion cap fix precedes reliable totals in 02, even though expanded coupon UX is 04. Capture minimal outbox events in first domain writes, project/deliver in 05. Preserve existing Checkout compatibility throughout. Independent implementation tasks may be batched, but dependencies and A/B acceptance cannot be skipped.

## Phase 01A — Secure foundation and shared state: backend

- **Objective / exact scope:** Extend existing schema with owner/revision/receipt foundations via new migration; server storefront context, strict DTOs, ownerContext, hardened cookie/origin/no-store/shared quotas; split cart.ts behind legacy compatibility exports. Make all existing Cart mutations use consistent receipts/limits before exposing new foundation. Design safe initialization and prove auth realm fallback fails closed.
- **Preconditions / prior dependency:** None beyond approved blueprint, current source/baseline reinspection; resolve cold guest initialization design before accepting foundation.
- **Database/API/Worker responsibilities:** Implement only relevant contract/schema/domain/handler/projector changes above; forward-only migrations, scoped constraints/transactions/receipt+outbox atomicity, bounded jobs when named. Keep API transport thin.
- **Existing code to reuse:** Audit E06–E17/E22–E25/E29–E33/E46/E47/E50.
- **Security:** T01–T05/T09/T10/T13/T14/T16/T19/T21/T28/T30; owner/tenant/origin limits never feature-toggleable.
- **Scenarios:** S01–S05,S12,S35–S38,S51,S59.
- **Automated tests:** Fresh/populated upgrade + constraints; receipt claim/replay/body mismatch; all-route tenant/origin/owner denial; legacy consumer compile/DTO fixture; cookie-less initialization barriers.
- **Manual checks:** Targeted API requests and schema/receipt/outbox inspection on disposable test DB; browser contract handoff prepared for B.
- **Performance:** Establish baseline query counts, bundle/public-page timing and shared multi-API limiter cost.
- **Deliverables:** Backend portion of Schema/contracts/API facade/controller ready with adversarial tests; no account merge falsely declared complete.
- **Acceptance:** A tests and shared DTOs pass; B integration is still required. AC01/AC02: all mutations authorized/bounded/retry-safe; legacy source compiles; header and UI agree under delayed responses.
- **Rollback/recovery:** Expand-only schema, retain old exports, Cart enablement gate; do not roll images to incompatible old schema reader.
- **Out of scope:** Checkout implementation, provider activation, full Admin reporting; no stock reservation.

## Phase 01B — Secure foundation and shared state: frontend and integrated gate

- **Objective / exact scope:** Build focused Cart transport/controller/owner/snapshot/intent modules, one header summary subscription; remove independent local state authority from live surfaces as wired, not unrelated fixtures. Represent loading/error/unknown separately, stale response rejection and exact-key retry.
- **Preconditions / prior dependency:** Phase 01A verified contracts and actual local backend running with disposable fixtures; previous capability integrated gate closed.
- **Backend/API/Worker integration:** Exercise implemented responses, receipt outcomes, permissions and error/retry states; never invent client authority or mark a backend gap solved by mock data.
- **Existing code to reuse:** Audit E06–E17/E22–E25/E29–E33/E46/E47/E50; shared primitives/controllers/forms from preceding phases.
- **Security:** T01–T05/T09/T10/T13/T14/T16/T19/T21/T28/T30; owner/tenant/origin limits never feature-toggleable.
- **Scenarios:** S01–S05,S12,S35–S38,S51,S59.
- **Automated tests:** Focused controller/component tests for queue/owner/stale/state flows; real API integration for scenario outcomes; typecheck and focused lint. Production build when routes/styling/bundles/rendering change.
- **Manual / real-browser tests:** Header/PDP real API add and retry, token/cookie blocked, response-loss and multi-tab cold initialization; inspect proxy no-store/Set-Cookie and page payload.
- **Performance:** Establish baseline query counts, bundle/public-page timing and shared multi-API limiter cost.
- **Deliverables:** Frontend and evidence completing Schema/contracts/API facade/controller ready with adversarial tests; no account merge falsely declared complete.
- **Integrated acceptance:** AC01/AC02: all mutations authorized/bounded/retry-safe; legacy source compiles; header and UI agree under delayed responses. Owner visual/operational review and real browser evidence are distinct gates; unperformed checks stay PARTIAL/BLOCKED.
- **Rollback/recovery:** Expand-only schema, retain old exports, Cart enablement gate; do not roll images to incompatible old schema reader.
- **Out of scope:** Checkout implementation, provider activation, full Admin reporting; no stock reservation.

## Phase 02A — Complete Cart commerce and primary storefront: backend

- **Objective / exact scope:** Catalog-owned batched eligibility/media, Pricing batched resolver, Inventory storefront availability query; consistent snapshot/fingerprint, exact decimal4 totals and price notices; add/set/remove/clear/variant/validate/restore; save immutable outcomes/outbox. Fix combined discount integrity in Promotions before exposing dependent totals, even if broader coupons UI arrives 04.
- **Preconditions / prior dependency:** 01A and 01B integrated foundation gate.
- **Database/API/Worker responsibilities:** Implement only relevant contract/schema/domain/handler/projector changes above; forward-only migrations, scoped constraints/transactions/receipt+outbox atomicity, bounded jobs when named. Keep API transport thin.
- **Existing code to reuse:** Audit E11–E21/E29–E34/E37/E51–E55.
- **Security:** T06–T08/T11/T12/T14; remove/reduction remains possible for invalid merchandise.
- **Scenarios:** S06–S15,S39,S58.
- **Automated tests:** Rule invariants for quantities, variant union/rollback, eligibility redaction, price changes, ATS/no reservation, decimal rounding/caps and consistent reads.
- **Manual checks:** Targeted API requests and schema/receipt/outbox inspection on disposable test DB; browser contract handoff prepared for B.
- **Performance:** Batch query-count budget across 1/10/100 lines; no repeated per-line pricing/stock calls.
- **Deliverables:** Backend portion of Full primary Cart workflow and coherent totals/eligibility; no mock drawer data on live header.
- **Acceptance:** A tests and shared DTOs pass; B integration is still required. AC03: all primary interactions and unavailable recovery pass against real backend and preserve inventory.
- **Rollback/recovery:** Disable new UI path if needed, preserve Cart intent/receipts; forward-repair owning-domain issue, never roll back money data by schema reset.
- **Out of scope:** Checkout fees/tax/payment/order flow, claim/merge, provider delivery.

## Phase 02B — Complete Cart commerce and primary storefront: frontend and integrated gate

- **Objective / exact scope:** Refit shared CartDrawer and thin /cart using authoritative shared components; PDP/card variant picker, QuantityStepper, remove/undo/clear and price/stock/unavailable recovery. Truthfully gate legacy Checkout affordances without modifying its workflow.
- **Preconditions / prior dependency:** Phase 02A verified contracts and actual local backend running with disposable fixtures; previous capability integrated gate closed.
- **Backend/API/Worker integration:** Exercise implemented responses, receipt outcomes, permissions and error/retry states; never invent client authority or mark a backend gap solved by mock data.
- **Existing code to reuse:** Audit E11–E21/E29–E34/E37/E51–E55; shared primitives/controllers/forms from preceding phases.
- **Security:** T06–T08/T11/T12/T14; remove/reduction remains possible for invalid merchandise.
- **Scenarios:** S06–S15,S39,S58.
- **Automated tests:** Focused controller/component tests for queue/owner/stale/state flows; real API integration for scenario outcomes; typecheck and focused lint. Production build when routes/styling/bundles/rendering change.
- **Manual / real-browser tests:** Real API phone/tablet/desktop Cart page/drawer/PDP/card, stale price/unpublish/stock change, keyboard/dialog focus/undo with changed owner.
- **Performance:** Batch query-count budget across 1/10/100 lines; no repeated per-line pricing/stock calls.
- **Deliverables:** Frontend and evidence completing Full primary Cart workflow and coherent totals/eligibility; no mock drawer data on live header.
- **Integrated acceptance:** AC03: all primary interactions and unavailable recovery pass against real backend and preserve inventory. Owner visual/operational review and real browser evidence are distinct gates; unperformed checks stay PARTIAL/BLOCKED.
- **Rollback/recovery:** Disable new UI path if needed, preserve Cart intent/receipts; forward-repair owning-domain issue, never roll back money data by schema reset.
- **Out of scope:** Checkout fees/tax/payment/order flow, claim/merge, provider delivery.

## Phase 03A — Account/guest ownership, lifecycle and synchronization: backend

- **Objective / exact scope:** Account active uniqueness/scoped FK, typed fail-closed identity resolution, guest credential rotation, deterministic merge/review/receipt, account retention/deletion, bounded cleanup job and activity/expiry locks; no private-account exposure through legacy token facade.
- **Preconditions / prior dependency:** 02A/B gate; active verified shopper resolver available; foundation ownerContext in place.
- **Database/API/Worker responsibilities:** Implement only relevant contract/schema/domain/handler/projector changes above; forward-only migrations, scoped constraints/transactions/receipt+outbox atomicity, bounded jobs when named. Keep API transport thin.
- **Existing code to reuse:** Audit E10/E16/E22–E27/E43/E49.
- **Security:** T01/T02/T04/T05/T10/T11/T15/T16/T19/T20/T27.
- **Scenarios:** S16–S27,S34.
- **Automated tests:** Barrier tests: old-owner request with new cookie; exact guest/account versions; duplicate/lost merge; atomic revoke; concurrent creation; cleanup overlap; natural expiry and DB error must not become guest.
- **Manual checks:** Targeted API requests and schema/receipt/outbox inspection on disposable test DB; browser contract handoff prepared for B.
- **Performance:** Same-account lock contention bounded; hidden tabs stop polling; cleanup budget and lease reclaim.
- **Deliverables:** Backend portion of Durable multi-device Cart with safe merge and lifecycle Worker.
- **Acceptance:** A tests and shared DTOs pass; B integration is still required. AC04/AC05: no owner leakage, no lost/double guest units, no replay under new account; cleanup cannot delete refreshed Cart.
- **Rollback/recovery:** Pause merges/cleanup with separate kill switch, preserve receipts/revoked hashes; forward repair only; no guest overwrite fallback.
- **Out of scope:** Wishlist sharing redesign, abandoned-cart marketing, Checkout claims/reservation.

## Phase 03B — Account/guest ownership, lifecycle and synchronization: frontend and integrated gate

- **Objective / exact scope:** Sign-in/sign-out/account switch queue isolation, guest merge review/result/lost-response recovery, cross-tab nonsecret invalidation, cross-device focus refresh and inactive/expired states.
- **Preconditions / prior dependency:** Phase 03A verified contracts and actual local backend running with disposable fixtures; previous capability integrated gate closed.
- **Backend/API/Worker integration:** Exercise implemented responses, receipt outcomes, permissions and error/retry states; never invent client authority or mark a backend gap solved by mock data.
- **Existing code to reuse:** Audit E10/E16/E22–E27/E43/E49; shared primitives/controllers/forms from preceding phases.
- **Security:** T01/T02/T04/T05/T10/T11/T15/T16/T19/T20/T27.
- **Scenarios:** S16–S27,S34.
- **Automated tests:** Focused controller/component tests for queue/owner/stale/state flows; real API integration for scenario outcomes; typecheck and focused lint. Production build when routes/styling/bundles/rendering change.
- **Manual / real-browser tests:** Two accounts/tabs/devices with delayed/out-of-order requests and storage/cookie denial; natural TTL or controlled synthetic TTL test clearly labelled; merge capacity review.
- **Performance:** Same-account lock contention bounded; hidden tabs stop polling; cleanup budget and lease reclaim.
- **Deliverables:** Frontend and evidence completing Durable multi-device Cart with safe merge and lifecycle Worker.
- **Integrated acceptance:** AC04/AC05: no owner leakage, no lost/double guest units, no replay under new account; cleanup cannot delete refreshed Cart. Owner visual/operational review and real browser evidence are distinct gates; unperformed checks stay PARTIAL/BLOCKED.
- **Rollback/recovery:** Pause merges/cleanup with separate kill switch, preserve receipts/revoked hashes; forward repair only; no guest overwrite fallback.
- **Out of scope:** Wishlist sharing redesign, abandoned-cart marketing, Checkout claims/reservation.

## Phase 04A — Wishlist, Recommendations and supported Promotions: backend

- **Objective / exact scope:** Save-first resumable transfer via owning operations; explicit variant Wishlist add and <=50 batch outcomes; Recommendation-owned cart context/placement using bounded product IDs and exclude list; coupon schedule/targets/selection status, no redemption.
- **Preconditions / prior dependency:** 03A/B gate; Wishlist contracts preserved; Promotions integrity from 02.
- **Database/API/Worker responsibilities:** Implement only relevant contract/schema/domain/handler/projector changes above; forward-only migrations, scoped constraints/transactions/receipt+outbox atomicity, bounded jobs when named. Keep API transport thin.
- **Existing code to reuse:** Audit E18–E20/E25–E28/E34/E38/E39.
- **Security:** T07/T08/T17/T18/T29; no sender capability as Cart authority; no remote fetch URLs.
- **Scenarios:** S28–S33,S44.
- **Automated tests:** Transfer fault injection including newer line edit; batch receipt/rejection; recommendation exclude/timeout; coupon expiry and overlapping discounts.
- **Manual checks:** Targeted API requests and schema/receipt/outbox inspection on disposable test DB; browser contract handoff prepared for B.
- **Performance:** Bound recommendations independently; no PDP fanout per Cart line; batch <=50 predictable DB work.
- **Deliverables:** Backend portion of Complete integrations without duplicating Wishlist/Pricing/Recommendation data ownership.
- **Acceptance:** A tests and shared DTOs pass; B integration is still required. AC06: every integration has real committed outcomes, useful partial recovery and no Cart blockage on optional service failure.
- **Rollback/recovery:** Feature-disable optional recommendation/bulk transfer entry; keep core Cart and intent receipts; resumable transfer must not delete before save.
- **Out of scope:** New promotion eligibility engine, sender cart sharing, Checkout coupon redemption or purchase.

## Phase 04B — Wishlist, Recommendations and supported Promotions: frontend and integrated gate

- **Objective / exact scope:** Shared Wishlist individual/bulk picker/review/partial results, move-to-Wishlist save/remove recovery, independent suggestion module, applied/rejected/expired coupon UI; same shared variant/form patterns.
- **Preconditions / prior dependency:** Phase 04A verified contracts and actual local backend running with disposable fixtures; previous capability integrated gate closed.
- **Backend/API/Worker integration:** Exercise implemented responses, receipt outcomes, permissions and error/retry states; never invent client authority or mark a backend gap solved by mock data.
- **Existing code to reuse:** Audit E18–E20/E25–E28/E34/E38/E39; shared primitives/controllers/forms from preceding phases.
- **Security:** T07/T08/T17/T18/T29; no sender capability as Cart authority; no remote fetch URLs.
- **Scenarios:** S28–S33,S44.
- **Automated tests:** Focused controller/component tests for queue/owner/stale/state flows; real API integration for scenario outcomes; typecheck and focused lint. Production build when routes/styling/bundles/rendering change.
- **Manual / real-browser tests:** Recipient versus owner accounts, revoked share, ambiguous variant, save/remove partial failure, source recommendation stale stock, mobile review and keyboard.
- **Performance:** Bound recommendations independently; no PDP fanout per Cart line; batch <=50 predictable DB work.
- **Deliverables:** Frontend and evidence completing Complete integrations without duplicating Wishlist/Pricing/Recommendation data ownership.
- **Integrated acceptance:** AC06: every integration has real committed outcomes, useful partial recovery and no Cart blockage on optional service failure. Owner visual/operational review and real browser evidence are distinct gates; unperformed checks stay PARTIAL/BLOCKED.
- **Rollback/recovery:** Feature-disable optional recommendation/bulk transfer entry; keep core Cart and intent receipts; resumable transfer must not delete before save.
- **Out of scope:** New promotion eligibility engine, sender cart sharing, Checkout coupon redemption or purchase.

## Phase 05A — Internal analytics, GA4 and Meta delivery: backend

- **Objective / exact scope:** Authoritative domain-outcome projector, metric dictionary, receipt-linked canonical measurement IDs, consent context/withdrawal suppression, provider adapter/delivery ledger and Worker retry/dead-letter. Recheck Meta docs and use official stable API version; choose one GA4 delivery path.
- **Preconditions / prior dependency:** 04A/B gate; baseline event facts captured since earliest Cart commands; official provider docs + privacy/consent decisions before activation.
- **Database/API/Worker responsibilities:** Implement only relevant contract/schema/domain/handler/projector changes above; forward-only migrations, scoped constraints/transactions/receipt+outbox atomicity, bounded jobs when named. Keep API transport thin.
- **Existing code to reuse:** Audit E38–E43/E47.
- **Security:** T21–T24/T26/T29; necessary outcomes separate from behavioral tracking; no PII by default.
- **Scenarios:** S40–S43.
- **Automated tests:** Domain event atomicity and replay, projector rebuild, fake browser event exclusion, payload/value identities, consent change while queued, provider timeout/retry/dedupe.
- **Manual checks:** Targeted API requests and schema/receipt/outbox inspection on disposable test DB; browser contract handoff prepared for B.
- **Performance:** Cart response has no provider wait; batch Worker resources and delivery age budgets.
- **Deliverables:** Backend portion of Verified internal reporting facts and configurable, privacy-gated GA4/Meta adapters with evidence; unconfigured provider visibly unavailable.
- **Acceptance:** A tests and shared DTOs pass; B integration is still required. AC07: one committed fact/delta, correct consent and value mapping, no purchase/begin_checkout; external provider acceptance cannot PASS while docs/config/test-mode evidence missing.
- **Rollback/recovery:** Disable destination dispatch/scripts independently, retain safe outbox and stable IDs; never regenerate event IDs during retry/redrive.
- **Out of scope:** Purchase/Checkout measurement, legal consent assumptions, production provider activation without release authorization.

## Phase 05B — Internal analytics, GA4 and Meta delivery: frontend and integrated gate

- **Objective / exact scope:** Central commerce adapter consumes confirmed outcomes, real view exposure measurement, purpose-specific consent controls, no direct vendor calls in feature components; failure-isolated delivery state.
- **Preconditions / prior dependency:** Phase 05A verified contracts and actual local backend running with disposable fixtures; previous capability integrated gate closed.
- **Backend/API/Worker integration:** Exercise implemented responses, receipt outcomes, permissions and error/retry states; never invent client authority or mark a backend gap solved by mock data.
- **Existing code to reuse:** Audit E38–E43/E47; shared primitives/controllers/forms from preceding phases.
- **Security:** T21–T24/T26/T29; necessary outcomes separate from behavioral tracking; no PII by default.
- **Scenarios:** S40–S43.
- **Automated tests:** Focused controller/component tests for queue/owner/stale/state flows; real API integration for scenario outcomes; typecheck and focused lint. Production build when routes/styling/bundles/rendering change.
- **Manual / real-browser tests:** Network capture no denied-purpose vendor activity; repeated render/merge/restore no add; provider test-mode verification only in separately authorized environment.
- **Performance:** Cart response has no provider wait; batch Worker resources and delivery age budgets.
- **Deliverables:** Frontend and evidence completing Verified internal reporting facts and configurable, privacy-gated GA4/Meta adapters with evidence; unconfigured provider visibly unavailable.
- **Integrated acceptance:** AC07: one committed fact/delta, correct consent and value mapping, no purchase/begin_checkout; external provider acceptance cannot PASS while docs/config/test-mode evidence missing. Owner visual/operational review and real browser evidence are distinct gates; unperformed checks stay PARTIAL/BLOCKED.
- **Rollback/recovery:** Disable destination dispatch/scripts independently, retain safe outbox and stable IDs; never regenerate event IDs during retry/redrive.
- **Out of scope:** Purchase/Checkout measurement, legal consent assumptions, production provider activation without release authorization.

## Phase 06A — Admin reporting, exceptions and safe configuration: backend

- **Objective / exact scope:** Tenant-scoped reports/product insights/operational exceptions, as-of snapshots, bounded pagination/filter DTOs; Cart IAM grants/settings version/hard ceilings/audit; safe diagnostic and redrive permissions; retention controls.
- **Preconditions / prior dependency:** 05A/B event/projection gate; IAM capabilities defined explicitly.
- **Database/API/Worker responsibilities:** Implement only relevant contract/schema/domain/handler/projector changes above; forward-only migrations, scoped constraints/transactions/receipt+outbox atomicity, bounded jobs when named. Keep API transport thin.
- **Existing code to reuse:** Audit E41–E44/E47 plus current Orders/Analytics/page-shell/Table/StatusBadge.
- **Security:** T15/T20/T21/T25/T27; no raw customer-cart browsing or ownership impersonation.
- **Scenarios:** S45–S48.
- **Automated tests:** Capability/tenant denial for all reports/exports/config/redrive, config concurrency/audit, bounded date/currency query, projector kill/restart/poison.
- **Manual checks:** Targeted API requests and schema/receipt/outbox inspection on disposable test DB; browser contract handoff prepared for B.
- **Performance:** Report query plans/row bounds, lag indicators and Worker fairness under storefront load.
- **Deliverables:** Backend portion of Operationally useful private dashboards and immutable security controls.
- **Acceptance:** A tests and shared DTOs pass; B integration is still required. AC08: correct permission, metric definitions and stale/error distinctions; no fake zero/conversion metric.
- **Rollback/recovery:** Disable new navigation/report reads if broken; retain audit/projections; config rollback is another versioned audited command, not direct SQL.
- **Out of scope:** Arbitrary staff Cart edits, marketing audience export, purchase conversion until future events.

## Phase 06B — Admin reporting, exceptions and safe configuration: frontend and integrated gate

- **Objective / exact scope:** Orders-context Cart workspace and existing Analytics Cart tab; overview, product insights, exceptions, configuration and diagnostics using Admin shared primitives; mobile/tablet/dark-light and no private data defaults.
- **Preconditions / prior dependency:** Phase 06A verified contracts and actual local backend running with disposable fixtures; previous capability integrated gate closed.
- **Backend/API/Worker integration:** Exercise implemented responses, receipt outcomes, permissions and error/retry states; never invent client authority or mark a backend gap solved by mock data.
- **Existing code to reuse:** Audit E41–E44/E47 plus current Orders/Analytics/page-shell/Table/StatusBadge; shared primitives/controllers/forms from preceding phases.
- **Security:** T15/T20/T21/T25/T27; no raw customer-cart browsing or ownership impersonation.
- **Scenarios:** S45–S48.
- **Automated tests:** Focused controller/component tests for queue/owner/stale/state flows; real API integration for scenario outcomes; typecheck and focused lint. Production build when routes/styling/bundles/rendering change.
- **Manual / real-browser tests:** Actual Admin sessions with permitted/denied grants, org switch during load, filters/as-of/error retry, phone/tablet/desktop/dark mode.
- **Performance:** Report query plans/row bounds, lag indicators and Worker fairness under storefront load.
- **Deliverables:** Frontend and evidence completing Operationally useful private dashboards and immutable security controls.
- **Integrated acceptance:** AC08: correct permission, metric definitions and stale/error distinctions; no fake zero/conversion metric. Owner visual/operational review and real browser evidence are distinct gates; unperformed checks stay PARTIAL/BLOCKED.
- **Rollback/recovery:** Disable new navigation/report reads if broken; retain audit/projections; config rollback is another versioned audited command, not direct SQL.
- **Out of scope:** Arbitrary staff Cart edits, marketing audience export, purchase conversion until future events.

## Phase 07A — Comprehensive security, reliability and performance regression: backend

- **Objective / exact scope:** Close every T threat against exact applicable pinned ASVS requirements, multi-API abuse/race/fault tests, retention interruption and dependency review; tune batched plans/indexes/locks/pools from measurements. No speculative infrastructure.
- **Preconditions / prior dependency:** 01–06 integrated capability gates; controls already implemented throughout.
- **Database/API/Worker responsibilities:** Implement only relevant contract/schema/domain/handler/projector changes above; forward-only migrations, scoped constraints/transactions/receipt+outbox atomicity, bounded jobs when named. Keep API transport thin.
- **Existing code to reuse:** Audit All prior tests, platform lease/observability/recovery tooling; existing design labs.
- **Security:** T01–T30 plus unresolved findings; Critical/High block acceptance.
- **Scenarios:** S01–S58 plus S59 regressions; emphasize S53–S57.
- **Automated tests:** Barrier fault injection, no partial state, schema constraints, rate limits, consent/log canaries, representative synthetic volume/Worker starvation and complete threat tests.
- **Manual checks:** Targeted API requests and schema/receipt/outbox inspection on disposable test DB; browser contract handoff prepared for B.
- **Performance:** Measure stated API p95/p99/query/bundle/CWV objectives on recorded machine/load; regress public PDP/catalog, not just Cart route.
- **Deliverables:** Backend portion of Threat evidence register, load report, UX accessibility report and closed high-risk issues.
- **Acceptance:** A tests and shared DTOs pass; B integration is still required. AC09–AC11: no unresolved Critical/High; relevant scenarios pass, bounded tail latency/pool usage and no private cache leakage.
- **Rollback/recovery:** Revert schema-compatible code/config, disable affected optional path; preserve evidence and forward-repair; do not erase broken carts to make tests pass.
- **Out of scope:** Checkout implementation and any unauthorized staging/production writes.

## Phase 07B — Comprehensive security, reliability and performance regression: frontend and integrated gate

- **Objective / exact scope:** Complete accessibility/mobile/keyboard/screen-reader matrices, network/owner/stale response resilience, deferred bundle/performance checks and UI consistency across all entry points.
- **Preconditions / prior dependency:** Phase 07A verified contracts and actual local backend running with disposable fixtures; previous capability integrated gate closed.
- **Backend/API/Worker integration:** Exercise implemented responses, receipt outcomes, permissions and error/retry states; never invent client authority or mark a backend gap solved by mock data.
- **Existing code to reuse:** Audit All prior tests, platform lease/observability/recovery tooling; existing design labs; shared primitives/controllers/forms from preceding phases.
- **Security:** T01–T30 plus unresolved findings; Critical/High block acceptance.
- **Scenarios:** S01–S58 plus S59 regressions; emphasize S53–S57.
- **Automated tests:** Focused controller/component tests for queue/owner/stale/state flows; real API integration for scenario outcomes; typecheck and focused lint. Production build when routes/styling/bundles/rendering change.
- **Manual / real-browser tests:** Real browsers widths 320/390/430/768/1024/1440, tablet rotation, 200% zoom, keyboard/screen reader, blocked storage/cookies, offline/unknown/switch/replay.
- **Performance:** Measure stated API p95/p99/query/bundle/CWV objectives on recorded machine/load; regress public PDP/catalog, not just Cart route.
- **Deliverables:** Frontend and evidence completing Threat evidence register, load report, UX accessibility report and closed high-risk issues.
- **Integrated acceptance:** AC09–AC11: no unresolved Critical/High; relevant scenarios pass, bounded tail latency/pool usage and no private cache leakage. Owner visual/operational review and real browser evidence are distinct gates; unperformed checks stay PARTIAL/BLOCKED.
- **Rollback/recovery:** Revert schema-compatible code/config, disable affected optional path; preserve evidence and forward-repair; do not erase broken carts to make tests pass.
- **Out of scope:** Checkout implementation and any unauthorized staging/production writes.

## Phase 08 — Integrated acceptance, release verification and Checkout readiness

- **Objective/scope:** Establish complete Cart vertical behavior, independent of Checkout, and a stable future handoff. Reconcile scenario/threat/implementation gates into one evidence register. A complete implementation is required, not a thin Cart with roadmap promises.
- **Preconditions:** 01–07 A/B integrated gates closed; policy decisions/primary provider documentation resolved where activating tracking; explicit staging release authorization before deployment actions.
- **Backend/database/API/Worker:** Fresh + populated-prior-schema upgrade verification, legacy Checkout compile/contract fixtures, Cart no-reservation/order/payment invariants, retention/recovery and graceful Worker restart. Confirm migration status and last schema-compatible release at authorized deployment, not from CI pass alone.
- **Frontend:** Final real-backend journeys through header/card/PDP/drawer/page/account/shared Wishlist/Admin, all state/viewport/accessibility matrices, owner changes, lost responses and source integration.
- **Reuse:** Existing focused tests/builds/architecture checks, CircleCI/GHCR immutable images, isolated rootless Podman/Quadlet private Caddy/host Nginx strategy and release manifest tooling. No unrelated VPS/OS changes.
- **Security:** No open Critical/High; reviewed Medium/Low residuals with owner/date; privacy/log/cache/realm/retention evidence; provider disabled if consent/config/test evidence incomplete. Cart completeness and optional destination activation statuses stated separately.
- **Scenarios/tests:** All S01–S59 and T01–T30; unit/API/domain/concurrency/upgrade tests plus recorded browser journeys. Run broad acceptance once at this area closure, not every ordinary checkpoint.
- **Performance:** Recorded fixture/machine/load and proposed p95/p99/query/CWV/bundle targets; address failures before passing capacity gate.
- **Deployment checks when authorized:** Backup/preflight, controlled one-job migration, service logs/health, private HTTPS/auth/cookies/routes, focused browser smoke, immutable SHA/digests and schema/recovery manifest. Stop on failure, retain logs; staging reset remains separately authorized.
- **Deliverables:** Final integrated acceptance register/evidence, release log if deployed, residual risk register and Checkout handoff contract reviewed against actual implemented Cart.
- **Acceptance:** AC01–AC13 all supported by current evidence. S49–S52 demonstrate Checkout-off Cart and contract readiness, never claim Checkout complete. External tracking acceptance explicitly reports disabled/blocked if no approved provider configuration. No unperformed verification called PASS.
- **Recovery:** Disable affected entry/destination/mutations using scoped controls, use last schema-compatible images, forward repair or verified authorized backup restore; image rollback never reverses migration. Preserve receipts and customer intent; no auto-reset.
- **Out of scope:** Checkout/address/tax/delivery/payment/order/reservation implementation, production launch approval or unauthorized external changes.

## Starting Phase01A safely

Re-read current Git/source and these decisions without touching preserved Wishlist work. Define shared Cart DTOs, owner resolution result (account/guest/unavailable rather than catch-to-guest), receipt semantics and cold guest bootstrap fencing; add focused contract tests, then one additive registered migration with legacy upgrade preflight. Introduce configured org/currency, strict schemas/origin/cache/quota protections and compatibility facade before expanding capabilities. That is the exact next implementation assignment; Phase00 itself authorizes none of those source changes.
