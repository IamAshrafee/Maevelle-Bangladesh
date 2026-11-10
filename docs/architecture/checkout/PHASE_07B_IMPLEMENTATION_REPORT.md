# Checkout Phase 07B implementation and acceptance

2026-11-10, Asia/Dhaka. **Overall: PARTIAL locally; public purchasing, payment collection and external marketing activation remain BLOCKED.** The server-backed preference workflow, authoritative observation binding and existing Admin aggregate interface are implemented. This is not legal, provider, human accessibility or deployed-runtime acceptance.

## Repository baseline and audit

Branch `main`, HEAD `038087c288da33787de85b1e81ec880a911e4e78`. Entry migration tail was the uncommitted `3224_commerce_measurement`. Existing Phase 06B Storefront/payment work and Phase 07A database/API/Worker/reporting work were preserved. No reset, clean, stash, commit, push, persistent migration, deployment or VPS operation occurred. Migration 3224 and historical migration bytes were not edited in this assignment.

Read the repository engineering rules, Product Completion tracking, Checkout architecture/security/analytics/UX documents, 06B evidence, 07A report and 07B handoff, and inspected the owning contracts, database consent operations, authentication, proxy, logging, Worker and Admin source. Used the repository API design, PostgreSQL and React skills. No dependency was installed or upgraded.

The old Storefront consent module trusted a browser-local grant, coupled marketing to analytics and could not authorize the 07A trusted consent port. The existing generic observation route had no secure subject binding. Existing privacy entry points were retained; the existing `lib/analytics/consent.ts` is now a server snapshot/state adapter. The existing database consent table, observation ingestion, outbox, Worker, API envelopes, rate counters and Admin reporting API remain authoritative. No second consent/event framework or state-manager dependency was introduced.

## Server transport and subject lifecycle

`GET` and `PUT /storefront/v1/analytics/consent` use the existing same-origin `/api` proxy. Both return private/no-store responses. Reads require `x-privacy-request: 1`; writes additionally require the exact configured Storefront Origin and current `x-privacy-context`. Cross-site Fetch Metadata, query parameters and extra body fields are rejected. The strict write contract accepts only the current policy version, independent purpose decisions, and account/browser revision preconditions. It accepts no organization, account, subject, scope, expiry or event identity supplied by the caller.

The configured Storefront tenant and real shopper resolver derive ownership. Invalid/revoked shopper sessions do not fall back to anonymous identity. A live shopper-session fence and active verified account/customer checks run within the mutation transaction. The private anonymous preference cookie is a random 256-bit bearer, stored only as a hash; it is not a Checkout guest grant. Production uses `__Host-maevelle_privacy`, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain, and an actual remaining Max-Age of at most 30 days. Local HTTP evidence uses the development cookie name. Malformed/duplicate cookie values cannot select another subject; a read can establish a fresh isolated preference context.

Browser sessions bind to tenant and authenticated session/account authority. Guest → account A → account B → logout rotates browser preference context; grants are never copied or silently merged. Account preferences may be read on another device, but effective permission requires both account and current browser agreement. DENIED wins, then UNKNOWN; only two current GRANTED decisions permit analytics. A new browser therefore needs explicit confirmation even if an account previously granted. Account records expire after 90 days; browser records after at most 30 days. Policy-version mismatch or expiry becomes UNKNOWN. Changing this retention/policy choice requires owner/privacy approval before activation.

Opaque response context and observation proofs are purpose/revision-bound HMACs, not exposed subject IDs. GET creates an essential preference context, not an optional analytics grant. Durable HMAC-IP read/write counters bound requests (120 reads/minute, 30 writes/minute, 12 no-cookie bootstraps/minute). These are local implementation limits, not representative ingress/load acceptance.

Writes update both purposes and applicable account/browser rows atomically through the existing consent operation. Exact CAS revisions reject stale writes with 409. An unknown write response never becomes a successful UI save or automatic grant retry. Re-read and explicit review are required. No raw request body, cookie, context proof or private observation token is logged by these routes; analytics request logging is excluded and shared logger redaction covers the two new proof headers. The logger test verifies redaction. Full historical logs/traces/sink canary review remains open.

## Customer workflow and withdrawal

The initial panel starts with both optional purposes unchecked when unknown. Analytics and advertising are independent. Decline and Save use equal outline actions; Not now dismisses without granting. Essential shopping/security/Order support is explanatory and has no optional-consent toggle. Permanent Privacy choices controls in the footer and privacy page reopen the same form.

The form reports unsaved changes, loading, saving, confirmed save, conflict, unavailable and reload states. A revision/context keyed form drops choices from an old owner. Account/browser and expiry copy describes actual behavior. Advertising copy states that exports remain inactive. Privacy copy does not claim legal compliance, cross-device anonymous recovery or deletion of necessary business records.

Any save immediately pauses optional browser collection. The preference adapter stores only a denial/pause marker and an opaque change notification, never grants or account/session IDs. Existing purpose-permitted analytics session storage remains separate. An offline withdrawal retains the local pause and does not falsely claim server persistence. Confirmed writes clear that guard. Cross-tab changes, identity transitions, focus and visibility reauthorize server state and cancel stale requests. Legacy local grants cannot opt in. Browser storage failure does not confer server authority. Physical browser storage-blocking and long-lived cookie expiration remain part of the wider fault matrix.

The shared native dialog has a labelled heading, Escape/Close, focus return with a persistent-control fallback, explicit Tab wrapping, scrolling and responsive sizing. Actual browser testing found and fixed enlarged-text heading overflow and Tab escape. The shared checkbox indicator was corrected to display its checked state. Native keyboard checks are automated evidence; no human screen-reader acceptance is claimed.

## Observation integration and authority

The existing browser transport requires the current server snapshot and sends current context/revision proof headers with same-origin cookies and no referrer. It keeps at most one in-memory retry with the same event ID, cancels on preference changes and rechecks current authority before each attempt. No persistent observation queue or retroactive collection was added. Mount observations that occur before preferences resolve are deliberately dropped; successful re-read does not replay them.

The actual API transaction locks current shopper/browser and analytics consent, verifies current policy/revisions, checks event time after the grant boundary, and only then captures the observation and minimal private provenance together. Events older than 120 seconds or more than five seconds ahead fail closed. Account/guest modes must match current server identity. Client anonymous IDs/attribution are discarded. Generic and Wishlist session keys are replaced by a purpose/revision scoped server key; Cart retains its strict sessionless envelope. Duplicate events must already have the same browser/revision binding; old unbound events cannot acquire authority through replay.

Generic allowed client names remain `PRODUCT_VIEWED`, `PRODUCT_LIST_VIEWED`, `PRODUCT_SELECTED`, `VARIANT_SELECTED`, `SIZE_GUIDE_OPENED`, `ADD_TO_CART`, `REMOVE_FROM_CART`, `VIEW_CART`, `BEGIN_CHECKOUT`, `ADD_SHIPPING_INFO`, `ADD_PAYMENT_INFO`. They describe interactions only. Client wire minimization accepts validated UUID product/SKU/cart/list references and bounded quantities/items, dropping labels, free text, URLs, contact, money and attribution. URL/slug list IDs are suppressed.

Existing strict Cart names remain `CART_VIEWED`, `CART_COMMAND_INITIATED`, `CART_COMMAND_REJECTED`, `CART_RECOVERY_VIEWED`. Existing strict Wishlist names remain `WISHLIST_PAGE_VIEWED`, `WISHLIST_SHARE_OPENED`, `WISHLIST_SCOPE_SELECTED`, `WISHLIST_COPY_ATTEMPTED`, `WISHLIST_COPY_SUCCEEDED`, `WISHLIST_NATIVE_SHARE_INVOKED`, `WISHLIST_WHATSAPP_SELECTED`, `WISHLIST_RECIPIENT_VIEWED`, `WISHLIST_SAVE_ONE_INITIATED`, `WISHLIST_SAVE_ALL_INITIATED`, `WISHLIST_GUEST_SAVE_OBSERVED`, `WISHLIST_GUEST_REMOVE_OBSERVED`, `WISHLIST_PRODUCT_OPENED`. Their payload constraints were preserved, including no share bearer/URL/customer fields.

Browser Purchase/Order/payment/receipt/refund/COD/reversal authority is rejected before optional consent qualification. The old public vendor-event handoff is no longer emitted. Confirmed Orders and verified money continue to come from committed domain outbox facts and Worker deduplication, not confirmation rendering. No client purchase event, collection instruction activation or provider adapter was added. A synthetic TEST delivery queued before withdrawal is suppressed by the existing dispatcher after actual HTTP withdrawal. No dispatch port is exposed to browser callers.

## Admin reporting

`/admin/analytics?view=commerce` consumes the actual `GET /admin/analytics/commerce` aggregate contract, with current organization authorization and UTC bounds. Both `analytics.view` and `analytics.financial.view` are required by UI and independently by API. Actor/organization keyed mounting, aborts and query-result keys prevent stale prior-scope data rendering. Date, currency, traffic-class, refresh and retry controls use the existing workspace/primitives; unsupported Commerce CSV export is disabled.

BUSINESS is the default. SYNTHETIC and UNCLASSIFIED require explicit selection and carry warnings. Exact decimal strings and BigInt counts preserve zero, null/unavailable and very large amounts without floating point. The existing money formatter now supports larger aggregate integer parts. Orders, claims, verified receipts, obligations, COD, reversals and completed refunds remain separate rows; allocation is separate from receipt amount. No sum is invented as recognized revenue, net profit or conversion. Finance retains recognized-revenue authority. Null global conversion is shown as unavailable; policy-blocked steps are not abandonment. Third-party exports are labelled disabled.

## Schema and compatibility

New additive migration `3225_privacy_preferences` adds bounded preference sessions and observation-authority foreign keys/indexes, reusing existing consent and event rows. Fresh PostgreSQL 18 reaches 74 migrations. A focused populated 3224 → 3225 fixture preserves an existing refusal and creates no backfilled browser authority. Rerun is empty. The new fixture is also registered with the generic upgrade runner; it does not replace the missing historical 3221 fixture.

For a future separately authorized deployment: apply 3225 once, deploy API and updated Storefront together for proof-required collection, then Admin. Worker compatibility is unchanged except bounded session retention cleanup. Older Storefront clients fail closed against the new API. Old application images do not undo schema or revoke already persisted preferences. Retain additive schema on application rollback; use forward repair or a separately verified backup restoration. This is source compatibility reasoning, not deployed rollback evidence.

## Verification ledger

All database execution used a dedicated disposable loopback PostgreSQL 18 cluster on port 5548, with random isolated database names; no `.env` credentials or persistent staging data were used. The browser fixture creates synthetic users and synthetic domain facts through existing application operations. Its credentials remain in a temporary local fixture file, not these artifacts.

| Check | Actual result |
| --- | --- |
| Focused integration command below | **155 tests / 16 files PASS**, main integration run, 123.08 seconds; a final 20-test/2-file overlap adds two new regressions, for **157 distinct passing tests / 16 files** |
| Fresh schema and populated 3224 upgrade | PASS; 74 migrations, refusal preserved, no retroactive binding, rerun empty |
| `pnpm exec tsc --build tsconfig.build.json --pretty false` | PASS |
| `pnpm exec tsc --build packages/database/tsconfig.json apps/api/tsconfig.json apps/worker/tsconfig.json packages/observability/tsconfig.json --pretty false` | PASS, test-inclusive |
| `pnpm exec tsc --noEmit -p apps/storefront/tsconfig.json --pretty false` and Admin equivalent | PASS |
| `pnpm --filter @maevelle/storefront build` | PASS, supported Next production build; Checkout production preview remains false |
| `pnpm --filter @maevelle/admin build` | PASS, supported Next production build |
| Focused ESLint on changed feature/API/analytics/privacy/observability/harness files | PASS after adding explicit Node imports to harnesses |
| Prettier on touched current-assignment files | PASS; no historical migration rewrite |
| `node scripts/check-architecture.mjs` | PASS, 13 packages |
| `node scripts/check-migration-history.mjs` | **FAIL**: inherited manifest and 18 historical migration byte mismatches |
| `UPGRADE_TEST_ALLOW=1` with dedicated `TEST_DATABASE_URL`, `node packages/database/dist/src/upgrade-test-cli.js` | **FAIL**: `Missing upgrade fixture for 3221_checkout_quotes`; no waiver/fabrication |
| `node scripts/check-secrets.mjs` | **FAIL**: same eight existing synthetic runtime/browser fixture assignments; scanner unchanged |

Final integration command (PowerShell, disposable target only):

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5548/maevelle_test'
pnpm exec vitest run packages/database/src/analytics/commerce/commerce.test.ts packages/database/src/analytics/commerce/privacy-migration.test.ts apps/api/src/privacy-preferences.test.ts apps/api/src/wishlist-analytics.test.ts apps/api/src/shopper-auth.test.ts apps/worker/src/worker.test.ts packages/database/src/checkout/foundation.test.ts packages/database/src/checkout/quotes.test.ts packages/database/src/checkout/delivery-migration.test.ts packages/database/src/payments/manual-payment.test.ts packages/database/src/checkout/placement.test.ts apps/storefront/lib/analytics/privacy-client.test.ts apps/storefront/lib/analytics/wishlist-telemetry.test.ts apps/storefront/lib/analytics/analytics.test.ts apps/admin/src/commerce-analytics.test.tsx packages/observability/src/index.test.ts
```

This includes actual PostgreSQL CAS/concurrent writes, tenant/identity/revocation boundaries, origin/Fetch Metadata/rate restrictions, canonical binding, stale/pregrant/withdrawn proof rejection, Cart/Wishlist contracts, synthetic dispatch suppression, aggregate permissions, committed conversion replay and Worker consumer behavior. Tests inspect unchanged Order, obligation, payment, refund, Finance, reservation, promotion and converted-Cart counts across preference withdrawal/dispatch. No real money moved. Additional focused API regressions verify expired-context rotation and refusal to bind replayed legacy observations. The new populated migration fixture initially omitted its mandatory revision; that test fixture was corrected and passes. No failing product assertion was waived.

### Actual browser evidence

[`phase07b-evidence/browser.json`](phase07b-evidence/browser.json) records **11 passing cases** in a dedicated Chrome 156.0.8078.80 CDP profile against actual local Next development servers, the real Fastify app and disposable PostgreSQL. This is a development-runtime browser test, separate from successful production builds. Commands: run `scripts/checkout-phase07b-runtime.mjs` with explicit disposable TEST_DATABASE_URL and temporary CHECKOUT_07B_OUTPUT, launch the normal Next development entry points on loopback, then `node scripts/checkout-phase07b-browser.mjs` with that output path and dedicated CDP port 9238. The harness never installs a public consent bypass.

Cases cover unknown guest, independent visible choices, responsive layout, keyboard/Escape/focus return, reload and a proof-bound browser fetch through the actual proxy, cross-tab stale revision after withdrawal, offline save/reload, unavailable preference API/retry, cleared cookie/stale context, real shopper A/B authentication/logout, and real Admin denied/authorized reporting. The explicit observation fetch is harness-generated; it is not evidence that every product interaction emitter fired. Client emitter minimization and transport behavior have focused tests; pre-resolution mount events are intentionally suppressed.

Measured privacy widths: 320, 390, 768, 1280; landscape 844×390; CSS text enlargement to 200% at 320px; reduced-motion media. Admin page had no document overflow at 390, 768 and 1280, with dark-preference emulation retaining the exact amount. Dark-preference emulation alone is not a complete dark-theme visual acceptance. The native select was closed before the final screenshot. Screenshots: [privacy mobile](phase07b-evidence/privacy-390.png), [enlarged text](phase07b-evidence/privacy-320-text-200.png), [Admin commerce](phase07b-evidence/commerce-1280.png). The enlarged-text image is CSS reflow evidence, **not native browser zoom**.

407 HTTP(S) browser requests were observed; zero GA4/Meta requests. No PII canary left localhost in this harness. That limited negative check is not a complete sink canary: full request/log/trace/cache/history/vendor review, real storage blocking, expired browser sessions, mobile Safari/Firefox, physical touch/keyboard, native zoom and human assistive technology remain unverified. No successful public purchase/browser financial operation ran.

### Performance and bundle observations

No new dependency. Reads are coalesced per client state, reauthorized on meaningful lifecycle events rather than polling; optional sends are bounded and failure-isolated. New preference queries use indexed tenant/subject/session paths, and existing retention deletes expired browser authority in bounded batches without deleting necessary financial records.

The production chunk containing the old banner before 07B measured 55,118 bytes / gzip 13,676. The final chunk containing Privacy preferences is `21sv3y_m0myqk.js`, 41,311 bytes / gzip 11,516. These are whole shared chunks with bundler repartitioning; **they do not establish a feature-only size reduction**. Case durations in browser.json are local workflow timings, not p95 latency, load, Web Vitals or real-network performance acceptance. The earlier 07A benchmark remains historical evidence. The dedicated browser, Next servers, fixture API and disposable PostgreSQL cluster were stopped after verification; sanitized evidence is retained in the repository.

## Independent acceptance register

| # | Criterion | Verdict | Evidence or remaining gate |
| --- | --- | --- | --- |
| 1 | Existing analytics architecture reused | PASS | Existing consent table, ingestion, outbox, Worker and aggregate API |
| 2 | Existing consent model audited | PASS | Local grant removed as authority; independent server-backed purposes |
| 3 | Secure HTTP read | PASS | Actual route/proxy/browser and API tests |
| 4 | Secure HTTP write | PASS | Strict body, origin/context, transactional CAS and actual browser save |
| 5 | Server-derived ownership | PASS | Configured tenant, shopper resolver, live session fence |
| 6 | Session/account separation | PASS | Strictest account/browser policy and rotation |
| 7 | Anonymous subject hijacking prevented | PASS | Random private cookie, hashed lookup, no client subject selection |
| 8 | Login does not grant tracking | PASS | Real A refusal/B unknown/logout browser evidence |
| 9 | Independent purposes | PASS | Analytics granted with advertising denied via visible controls |
| 10 | UNKNOWN grants nothing | PASS | API and client fail closed |
| 11 | Decline usability | PASS | Equal actions, immediate pause, visible browser controls |
| 12 | Later preference changes | PASS | Footer and privacy entry, keyboard focus return |
| 13 | Revisions/conflicts | PASS | Concurrent CAS, stale tab 409, explicit review |
| 14 | Browser/server withdrawal | PASS | Local pause, API proof rejection and queued TEST suppression |
| 15 | No retroactive export | PASS | No replay of pregrant observations; revision/event-time checks; live ports absent |
| 16 | Authoritative event binding or blocked dispatch | PASS | Atomic provenance; all live external dispatch blocked |
| 17 | Cart/Wishlist contracts | PASS | Existing validators and focused regression |
| 18 | No new unallowlisted/PII observations | PASS | Positive wire allowlist, strict validators, minimization tests |
| 19 | No authoritative browser Purchase/Payment | PASS | Rejected before consent; domain-only facts |
| 20 | Confirmation refresh deduplication | PARTIAL | Domain/Worker replay PASS; successful committed browser confirmation remains unverified |
| 21 | POLICY_BLOCKED not abandonment | PASS | Explicit operational outcome; null global conversion |
| 22 | Actual Admin aggregate API | PASS | Real authenticated report; BUSINESS empty and SYNTHETIC verified amount |
| 23 | Financial analytics permissions | PASS | UI denied reader; independent API regression |
| 24 | Default cohort exclusion | PASS | BUSINESS default, explicit synthetic/unclassified warnings |
| 25 | Exact money/terminology | PASS | Zero/null/huge string tests and BDT 40.0000 browser report |
| 26 | No live marketing/matching | PASS | No adapter activation; zero observed GA4/Meta calls |
| 27 | Browser privacy/auth boundaries | PARTIAL | Eleven real cases PASS; deployed HTTPS/cookies/expiry/storage/browser breadth open |
| 28 | Accessibility/responsive acceptance | PARTIAL | Geometry, CSS text reflow, keyboard/reduced motion PASS; human/native zoom/devices open |
| 29 | Relevant PostgreSQL/API/browser tests | PASS | 157 distinct tests/16 files and 11 browser cases; not full acceptance matrix |
| 30 | No financial side effects | PASS | Before/after business count assertions; synthetic isolated fixture only |
| 31 | Production Storefront build | PASS | Actual supported Next production build |
| 32 | Inherited failures accurate | PASS | History, missing 3221 fixture, scanner remain FAIL |
| 33 | Earlier PARTIAL unchanged | PASS | No historical phase promoted |
| 34 | Public gates disabled | PASS | Production preview false; no policy/provider activation |
| 35 | Privacy/legal/vendor approvals | BLOCKED | Retention/copy/basis/provider policy owner acceptance required |
| 36 | Phase 08 handoff | PASS | Concrete handoff below; implementation not claimed |

## Changed-file map and continuation

- Contracts: `packages/contracts/src/privacy-preferences.ts` and type export.
- Schema/lifecycle: migration 3225/registry; `analytics/commerce/privacy-{session,preferences,observations}.ts`, cleanup in `delivery.ts`, transactional reuse in `analytics/behavioral.ts`, exports and focused migration/upgrade tests.
- HTTP: `routes/privacy-{context,preferences}.ts`, auth/analytics wiring, app logging boundary, privacy API and analytics regression fixtures.
- Storefront: existing consent/events/transport/Cart/Wishlist telemetry, new observation allowlist and privacy hook/form, existing banner/entry/privacy copy, shared modal and checkbox indicator, focused client fixtures/tests.
- Admin: existing Analytics workspace/types and exact money helper, Commerce view/tables and focused rendering tests.
- Observability: proof-header redaction and logger test. Migration-tail assertions were extended for the new additive migration; no historical fixture was fabricated.
- Evidence: the two explicit local harnesses, this report, sanitized browser JSON/screenshots, Phase 08 handoff and concise Product Completion/architecture tracking updates. Earlier uncommitted payment/07A files remain in the worktree.

Earlier 01B–07A PARTIAL results, provider/Finance/courier/legal decisions and release gates remain open. Continue with [`PHASE_08_HANDOFF.md`](PHASE_08_HANDOFF.md). No Phase 08 implementation or public activation is implied.
