# Checkout Phase 08 — integrated hardening and acceptance

2026-11-10, Asia/Dhaka. **Overall PARTIAL locally. Production activation BLOCKED.** This assignment implemented and verified engineering corrections; it did not activate public purchasing, production Checkout drafts, wallet collection, GA4/Meta, advanced matching or any provider operation. No commit, push, image publication, deployment, VPS modification or persistent-database migration occurred.

Independent acceptance: **29 PASS, 9 PARTIAL, 2 BLOCKED** across 40 outcomes. Unavailable human, deployed, successful-browser and external-policy evidence was not inferred from automation.

## Baseline, preservation and execution record

Actual branch `main`, HEAD `038087c288da33787de85b1e81ec880a911e4e78`; migration tail `3225_privacy_preferences`. The worktree already contained tracked and untracked 06B payment UI, 07A analytics/outbox/Worker/schema and 07B privacy/API/Admin files and evidence. They were preserved. Historical migrations and their accepted manifest were not rewritten. This assignment adds no migration. The initial [execution register](PHASE_08_EXECUTION_REGISTER.md) was written before implementation; its initial statuses remain intact with final dispositions appended.

The attached Phase 08 assignment is the task authority. The referenced ChatGPT review was read as contextual data; actual Git, source, contracts and runtime evidence controlled implementation. Reviewed root/package engineering rules, Product Completion state, Checkout specification, transaction/security/analytics/UX/migration documents, prior reports/handoff, relevant CI/deployment files and owning Checkout, Payments, Finance, auth, privacy, proxy and Worker source. Used repository security-scanning, API/PostgreSQL/React guidance and installed Next documentation for the shared UI correction. No dependency was installed or upgraded.

## Corrections and initial versus final risk

| Issue | Entry evidence | Final local result | Residual risk |
| --- | --- | --- | --- |
| Historical migration byte checker | FAIL: manifest + 18 checkout mismatches | PASS with constrained repository-text identity and tamper tests | Linux OS/CI execution not performed locally |
| Missing populated upgrade coverage | FAIL at 3221 | PASS through all 23 post-baseline migrations to 3225; real 3221–3223 fixtures added | Not an exhaustive history corpus or deployed upgrade |
| Eight scanner findings | FAIL on public synthetic assignments | PASS; scanner unchanged, fixture credentials made explicit and signing secrets ephemeral | All old browser harnesses were not rerun end to end |
| Receipt verification contention | Discovered during mixed sample: 18 deadlocks/30 verifications | Corrected Finance row-lock mode; 8-way regression and mixed rerun PASS | Cross-account numbering/load breadth and deployed resource limits still require testing |
| Pool exhaustion | Source had unbounded acquisition default | Five-second default acquisition/connection bound; actual exhausted one-client regression PASS | Capacity tuning, full outage failover and HTTP SLOs unverified |
| Admin/chat Origin trust | Host/forwarded-host could broaden configured trust | Explicit configured-origin allowlist only; real-app denial regression PASS | Actual public proxy/HTTPS chain unverified |
| Sensitive request logging | Bare analytics/auth/invitation variants not uniformly excluded | Private namespace boundary widened; real logger canary and Set-Cookie redaction PASS | Historical logs, traces, caches and every sink not audited |
| Enlarged privacy dialog text | 400% CSS test reproduced horizontal overflow | Shared wrapping/Close sizing corrected; actual Chromium reflow PASS | CSS enlargement is not native zoom or human acceptance |
| Checkout success, recovery, provider/legal gates | BLOCKED/PARTIAL | Unchanged; precise Phase 09 handoff | Release blockers remain |

## Migration-history integrity

Investigated Git blobs, working-tree bytes, `.gitattributes`, `core.autocrlf=true`, the checker, anchored manifest and CI invocation. The checker previously hashed checkout-dependent raw bytes. All **51** historical migration Git blobs match their anchored expected hashes; 18 working files differ only by CRLF representation. The manifest Git blob and LF checkout hash are both `2fba6929c46eb456a26c279885a3d1a932ed268eb609b733a61635a25036a288`; the raw Windows manifest hash was `f79b850c252dcd18633a52bcb7300d7cba2626f0971d7793b122c3e5c0001c17`.

The checking policy now explicitly identifies the repository's LF text bytes. Only paired CRLF → LF is canonicalized before hashing. No trimming, SQL normalization, JSON reserialization, BOM removal, lone-CR removal, regenerated checksum, deleted-history exemption or always-pass comparison exists. Accepted digests are unchanged. `.gitattributes` declares LF for migration source and the manifest; no command rewrote existing historical files. Registry/name/order checks remain enforced.

Security consequence: checkout line-ending representation is no longer treated as a historical SQL modification. Every other byte difference remains subject to the anchored digest. This establishes source identity, not byte-for-byte identity of every deployed PostgreSQL function definition. Tests cover LF/CRLF fixtures, modified/deleted history, added SQL, BOM/lone CR, duplicate/unregistered/missing migrations, historical-order insertion and silently regenerated manifest. All five migration-policy tests pass. Current checker: **74 registered / 51 immutable baseline migrations PASS**. These ran on Windows with LF and CRLF fixtures; **Linux OS/CI execution is NOT VERIFIED**, rather than inferred from a fixture.

## Genuine populated upgrades

The generic runner previously stopped before testing 3221; investigation also found missing 3222 and 3223 registrations behind that failure. Added focused fixtures for all three, rather than empty coverage entries.

- **3221:** legitimate immediately prior 3220 guest/account drafts, legacy Order/session linkage, saved delivery-compatible address, a populated guest Cart with source revision, Catalog/Pricing/Inventory facts and a limited coupon. Snapshot comparisons preserve owner, Order, address, Cart, inventory and existing financial counts, allowing only the additive quote pointer. After migration a real parent/line quote is inserted atomically, immutable update is rejected and cross-tenant binding is rejected. The quote fixture legitimately has zero Finance postings/receipts; it does not manufacture historical financial evidence.
- **3222:** existing manual method/Order/intent, duplicate old claims and distinct CONFIRMED/REVERSED receipt rows are populated before the integrity migration. Both historical receipts survive, permanent collision fencing counts both, and a further duplicate is rejected. No historical receipt is silently deduplicated.
- **3223:** populated Orders, obligations and receipts survive unchanged except the additive nullable draft column. No placement is backfilled; the one-Order-per-draft index exists and an unbound COMMITTED draft is rejected.

The actual generic runner migrates 51 baseline migrations plus **23 post-baseline migrations** in order, executes each registered before/after fixture, preserves baseline organization/sequence/configuration records, reaches 3225 and verifies a no-op rerun. Fresh/focused migration regressions also pass. No persistent database was used. Broader historical business states still belong in future upgrade coverage.

## Secrets scanning and fixture safety

Inspected every reported assignment without copying values into this report. All eight findings were public synthetic local/development fixture assignments, not discovered provider or customer credentials:

| File | Classification / correction |
| --- | --- |
| `cart-phase01ar-runtime.ts` | Synthetic signing assignment → fresh random per-process signing secret |
| `cart-phase02b-runtime.ts` | Synthetic account password → explicit public disposable-fixture password; signing key was already random |
| `cart-phase03b-browser.mjs` | Corresponding synthetic account login → same shared fixture password, including browser evaluation serialization |
| `checkout-phase01b-runtime.mjs` | Synthetic signing/password → ephemeral signing key and shared public fixture password |
| `checkout-phase02b-runtime.mjs` | Same correction, preserving matching browser-account setup |
| `checkout-phase03b-runtime.mjs` | Same correction; 05B browser login updated with it |
| `checkout-phase04b-runtime.mjs` | Ephemeral signing key; synthetic password generated by explicit fixture helper |
| `checkout-phase05b-browser.mjs` | Shared disposable account password; no embedded credential assignment |

`scripts/fixtures/browser-credentials.mjs` explicitly documents that its reproducible account password is public and valid only for isolated loopback fixture accounts; it is not a signing/provider secret. Signing secrets use random bytes per process. The actual scanner and its scan exclusions were **not changed**. A temporary Git fixture plants a realistic-looking credential assignment and requires scanner exit 1, then removes it and requires exit 0. Fixture key generation is tested independently. No broad ignore, global disable or temporary account credential was added to published evidence. Syntax/lint checks passed for changed harnesses, but this is not a claim that every historical browser harness was rerun.

## Transactional resilience and physical PostgreSQL faults

The scoped regression covers guest/account Buy Now and complete Cart, exact/different keys, changed-body conflict, expiry/replay, source/configuration/stock/coupon races, atomic rollback checkpoints, payment access and guest credential boundaries. The existing trusted database policy injection remains test-only. Production HTTP handlers still call the disabled policy engine; no public synthetic-approval switch or test endpoint was added.

New loopback-only PostgreSQL protocol fault helper accepts only random disposable database names. It creates a real TCP proxy, recognizes COMMIT, and destroys sockets in two cases:

1. **Before forwarding COMMIT:** transaction connection loss produces definite rollback. No partial Order/reservation/obligation/outbox remains; the original key can commit once after recovery.
2. **After PostgreSQL reports COMMIT, before the application receives its acknowledgement:** the application sees a connection failure despite a durable Order. Repeating the **same** key through a healthy connection returns the same committed result. Exact effects remain one Order, placement, reservation/allocation, unpaid obligation, audit and outbox, zero payment/Finance effect.

This is actual socket loss, not merely dropping a JavaScript/HTTP result. The fault harness knows whether it observed the server COMMIT; the application must treat its own failed acknowledgement as unknown and consult durable authority. It does **not** prove storage-device failure, failover, WAL corruption, or physical unknown-COMMIT recovery for every claim/refund/consent operation.

A real locked draft causes the placement's existing two-second lock timeout; no business effects survive and the original key succeeds after lock release. Existing serialization retry tests remain bounded. Pool acquisition now uses node-postgres `connectionTimeoutMillis`, default 5000 ms, with a validated optional 10–30000 ms `connectionTimeoutMs` constructor setting. An exhausted one-client pool times out an attempted write, removes the queued acquisition and accepts work after release; no hidden write executes later. A timeout is never interpreted as proof that some previously submitted write rolled back. [Official node-postgres pool semantics](https://node-postgres.com/apis/pool) informed the configuration; no dependency version changed.

## Payment/Finance contention correction and conservation

The initial mixed workload failed **18 verifications with SQLSTATE 40P01**. PostgreSQL's local diagnostics showed multiple transactions holding foreign-key KEY SHARE locks from receipt evidence while attempting FOR UPDATE on the same financial account. Twelve verifications committed; the others rolled back safely. The failure was retained in [`PHASE_08_LOAD_BEFORE.json`](PHASE_08_LOAD_BEFORE.json), not discarded as infrastructure noise.

Finance account locking now uses **FOR NO KEY UPDATE** for balance/status decisions. It still serializes competing financial decisions and conflicts with status/key-changing updates/deletes, while allowing the existing foreign-key KEY SHARE references. No key is modified by this helper. This avoids the observed lock upgrade cycle; adding blind retries would have hidden its cause. [PostgreSQL 18 row-lock conflict documentation](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) was checked before the change.

An eight-way concurrent distinct-receipt regression verifies exact receipt and Finance posting conservation: eight receipts/postings, BDT 320.0000 in each total. The mixed rerun verifies 30 receipts totalling BDT 1,200.0000 and no failed job. Existing tests additionally cover concurrent reviewers, duplicate reference across Orders, partial/excess money, unallocated/late liability, cancellation/review, rollback of Finance/audit/outbox, receipt reversal, unknown refund reconciliation and verified completion. Finance/COD suites retain the distinction between collection, courier custody and settlement. A claim is never cash and a refund request is never a payout.

No actual provider or payout ran. Full simultaneous cross-account Finance document-number allocation, review versus every Worker lifecycle transition, and browser operator exception journeys are not established by the same-account regression; those remain technical closure work, not implied acceptance.

## Auth, privacy, canaries and ingress

Admin/chat Origin validation previously accepted request Host or forwarded-host as fallback trust. It now accepts only exact configured origins. A real `buildApi` regression sends forged Host/forwarded headers and an attacker Origin and receives `403 ORIGIN_REJECTED` before business authorization. This removes a trust-expansion path; it does not claim a demonstrated browser CSRF exploit or deployed proxy validation.

Sensitive request logging now recognizes bare/query/slash namespaces for Admin auth, shopper auth, invitations and privacy/Checkout/Orders, covering reset/callback tokens and malformed/bare analytics paths. Safe exception diagnostics remain low-cardinality for these paths. Shared logger redacts structured Set-Cookie in addition to authorization/cookie/privacy proofs. Actual API requests carrying unique synthetic token canaries through private query/path/header variants do not appear in the captured request log. Logger and existing browser/storefront serializer/projection/TEST-delivery tests verify their own allowlists. Necessary payment evidence stays in authorized payment stores.

This is a scoped canary result: it does not establish absence from historical logs, all tracing/metrics infrastructure, browser caches/history, backups or vendor sinks. No live vendor sink was enabled. Sensitive fields must not be placed in URLs by future recovery features.

Privacy regressions cover offline refusal, unchanged essential business counts, denied/missing/expired decisions, stale policy and revision, pregrant/regrant replay, context expiry, account A/B/logout/revocation, queued and active TEST dispatch/withdrawal ordering. New two-browser account coverage first proves a valid account-mode observation is accepted, then verifies a later account withdrawal invalidates the other browser's prior proof. A new browser cannot silently inherit effective permission. Stored superseded policy becomes UNKNOWN. Production-mode HTTP injection verifies `__Host-maevelle_privacy`, HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, bounded Max-Age, private/no-store and no observation grant; this is a **cookie response contract**, not a real HTTPS browser acceptance.

Reviewed current loopback Next rewrites, `/admin` routing, configured origins and trusted-IP protection. Existing spoofed-forwarded-IP quota regressions pass. No local TLS reverse-proxy or public Caddy/Nginx certificate/host/callback chain was executed, and no shared ingress was modified. Deployed HTTPS, Secure-cookie behavior across the actual edge, CORS/callback/logout/cache/referrer behavior and revocation during every in-flight Admin read remain open.

## Real browser and accessibility evidence

Actual Chrome `156.0.8078.80`, dedicated profile, local Next development proxies → real Fastify → disposable PostgreSQL:

- Repeated the **11** existing consent/auth/Admin cases; [`phase08-evidence/baseline-browser.json`](phase08-evidence/baseline-browser.json).
- Added **7** actual browser cases: local/session storage denied by throwing SecurityError; consent GET 429, 502, 503 and broken JSON; committed withdrawal with its real HTTP response interrupted at the browser; 400% CSS text reflow/forced colors. [`phase08-evidence/fault-browser.json`](phase08-evidence/fault-browser.json).

The lost-response test grants first, withdraws, interrupts only the completed PUT response, checks that the UI **does not claim a confirmed save**, then re-reads the durable server refusal. It tests actual HTTP uncertainty, independently from the COMMIT socket harness. Error injection belongs solely to CDP; no public test-only route or policy bypass was introduced. Zero marketing requests were observed in these runs.

The 400% CSS test reproduced horizontal overflow, including long words/Close. Shared dialog wrapping and Close bounds were fixed. The final [forced-colors screenshot](phase08-evidence/privacy-400-forced-colors.png) shows the scrollable highly enlarged view. Geometry and emulated forced colors do not establish readability, native zoom or human screen-reader acceptance. Prior 320/390/tablet/landscape/desktop, keyboard containment/Escape/focus return and 200% CSS coverage was rerun in the 11-case harness. Human AT, physical touch/on-screen keyboard, Safari/Firefox, true native 200/400% zoom and complete financial browser exception journeys remain **NOT VERIFIED**. See the manual procedure below.

### Successful Checkout browser boundary

**BLOCKED**, rather than forced. The actual placement HTTP route has no approved runtime policy resolver and calls the deliberately disabled engine; the production draft gate is also closed. Database placement tests use the existing private trusted engine boundary. No safe existing HTTP policy-injection surface was found to make all four complete browser purchase paths succeed without introducing a new activation/bypass surface. No such switch was added. The synthetic browser fixture creates existing financial test records for reporting, not successful public Checkout purchases. Confirmation refresh/recovery backend and component tests do not promote committed browser success to PASS.

## Worker physical interruption

A dedicated IPC child executes the real commerce consumer against a random disposable database. At the claimed-but-uncommitted hook it is physically terminated; PostgreSQL releases the transaction/row lease, and a healthy consumer replay projects once. In the second case the child is terminated after its consumer transaction has committed; concurrent replay retains one stable fact per logical identity and unchanged Order/obligation/money counts.

Both cases pass. This strengthens earlier injected-error tests. It is a physical **commerce-consumer process** test, not a claim that the entire production Worker daemon, every job, provider acknowledgement or service supervisor was crash-tested. Existing poison/retry/unknown TEST-acknowledgement tests also pass. External vendor exactly-once delivery is not promised.

## Local mixed workload and performance

[`PHASE_08_LOAD.json`](PHASE_08_LOAD.json): 120 jobs, six concurrent runners, real DB application calls for manual claim/partial verification, consumer batches, aggregate reports, and preference/authorized observation. All final jobs pass; 30 Orders, 30 receipts, exact BDT 1,200.0000 received, 30 observations, no pending commerce receipt. Observation capture follows a separate confirmed preference transaction and 10 ms interaction delay; immediate same-transaction capture in an intermediate sample failed closed on some observations and was not treated as a grant. No consent rule was relaxed to make the workload pass.

| Application-call group, 30 samples each | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| Claim + partial receipt verification | 48.16 | 135.47 | 186.71 |
| Consumer batch | 6.18 | 48.33 | 109.11 |
| Aggregate report | 2.57 | 14.20 | 67.65 |
| Preference + observation, including delay | 15.44 | 76.59 | 107.55 |

Sample elapsed 600.78 ms; sanitized JSON also includes process CPU/RSS, DB connection/lock-wait samples and aggregate EXPLAIN ANALYZE summary (execution 0.062 ms on this small data set). This ran on the local workstation alongside other tests/dev services, **not representative production hardware or HTTP traffic**. The before/after samples demonstrate the observed deadlock correction, not a production capacity multiplier. No representative mixed PDP/maximum-Cart/placement workload, driver pool utilization, public network p95/p99, exhaustive slow-plan/index analysis or production throughput SLO is claimed. Existing 100-line Cart/concurrent stock/coupon tests remain separate evidence.

## Guest Order recovery: secure design, still BLOCKED

Current private guest Order access requires the original live Checkout session plus the Order-specific credential, capped at the earlier of original session expiry or one hour after commitment. Exact same-device placement replay can reissue the same credential within its authorized lifetime. The privacy preference cookie and a shopper account matched by contact text grant no Order authority.

Existing shopper verification proves account identity; no approved independently verified **Order-bound** guest challenge channel or risk/retention/support policy was found. An unverified saved mobile, an Order number/phone match, a local test mailbox or seeded `email_verified` flag cannot close this gate. The existing one-hour grant was not extended and no OTP success was fabricated.

Proposed future contract, **not implemented endpoints**:

1. `POST /storefront/v1/order-access/challenges`: accept a bounded Order reference and channel preference, derive the permitted destination from authoritative Order/contact policy. Return uniform `202` and an opaque challenge context regardless of existence/eligibility. Apply durable IP + HMAC Order/contact quotas and provider-delivery limits. No account/profile/Order facts or delivery destination appear in the public response.
2. Send a purpose-specific high-entropy one-time link or approved challenge to the independently qualified Order-bound channel. Store only challenge/token hashes, tenant/Order binding, expiry, attempt cap and revocation generation. Approve lifetime/attempt limits before implementation; no automatic extension of the current grant policy.
3. `POST /storefront/v1/order-access/challenges/:context/verify`: exact Origin/Fetch protection; never tokens in query/referrer/history. Atomically verify current policy, expiry and attempts, consume once, revoke/rotate older recovery grants, audit and mint a narrowly scoped HttpOnly credential under a separately approved recovery lifetime. Do not turn the challenge into shopper authentication or silently attach Orders to accounts.
4. Reuse authorized Order/payment read operations through an explicit new grant authority adapter. Do not bypass domain authorization or expose claim/payment commands merely because a recovery token exists. Support-assisted exceptions require documented identity evidence, capability checks, audit and independent approval; no Order+phone shortcut.

Threat model: enumeration/timing, delivery spam/cost, typo/recycled/SIM-swapped contact, stolen/replayed links, cross-tenant contexts, concurrent redemption, stale revocation after backup restore, malicious support access, logs/cache/referrers and shared-device/logout races. UI acceptance requires neutral request feedback, resend cooldown, attempt/expiry recovery, keyboard/touch labels/errors, success into the correct private Order, explicit sign-out/forget access, no token on screen/URL, and no old-owner data after a transition. Provider delivery and owner/privacy/support decisions are prerequisites for this design, not recorded sign-offs.

## Verification commands and results

All DB work used an explicitly named disposable local PostgreSQL 18 cluster on `127.0.0.1:5548`, random `maevelle_cart01a_*`/generic upgrade databases, or its dedicated `maevelle_test` fixture database. No environment default or persistent staging database was migrated. Browser fixture credentials stayed in a temporary local file, not published artifacts. Production builds are separate from development-runtime browser evidence.

| Command/check | Actual final evidence |
| --- | --- |
| Main Vitest command below | **416 tests / 38 files PASS**, 207.32 s |
| Final privacy/ingress additions and overlap | 17 tests/2 files PASS; corrected positive account observation then 15 privacy tests PASS; **419 distinct passing regression tests / 38 files** total |
| `node --test scripts/check-migration-history.test.mjs scripts/check-secrets.test.mjs` | **6 PASS**; separate tooling tests |
| `node scripts/check-migration-history.mjs` | PASS: 74 registered, unchanged 51-history anchor |
| `node scripts/check-secrets.mjs` | PASS, scanner unchanged |
| `node scripts/check-hardening.mjs` | PASS: 1772 JS/TS sources, 673 Admin handlers / 81 route modules at execution |
| `node scripts/check-architecture.mjs` | PASS: 13 packages |
| `pnpm exec tsc --build tsconfig.build.json --pretty false` | PASS |
| `pnpm exec tsc --build packages/database/tsconfig.json apps/api/tsconfig.json apps/worker/tsconfig.json packages/observability/tsconfig.json --pretty false` | PASS, test-inclusive |
| `pnpm --filter @maevelle/storefront build` | PASS, supported production build, public Checkout still disabled |
| `pnpm --filter @maevelle/admin build` | PASS, supported production build |
| Focused ESLint/Prettier and `git diff --check` | PASS after focused corrections; no global scanner/lint disable |
| Generic upgrade command below | PASS: 23 post-baseline migrations with populated fixtures and rerun |
| 11-case 07B browser harness + 7-case 08 harness | **18 actual local browser cases PASS** |
| `node scripts/checkout-phase08-load.mjs` | Final mixed sample PASS; retained before sample FAIL |

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5548/maevelle_test'
pnpm exec vitest run packages/database/src/checkout/placement.test.ts packages/database/src/payments/manual-payment.test.ts packages/database/src/payments.test.ts packages/database/src/finance.test.ts packages/database/src/analytics/commerce/commerce.test.ts packages/database/src/analytics/commerce/physical-replay.test.ts packages/database/src/analytics/commerce/privacy-migration.test.ts packages/database/src/testing/pool-timeout.test.ts packages/database/src/checkout/foundation.test.ts packages/database/src/checkout/quotes.test.ts packages/database/src/checkout/delivery-migration.test.ts packages/database/src/cart-foundation.test.ts packages/database/src/wishlist/account.test.ts apps/api/src/checkout-foundation.test.ts apps/api/src/checkout-delivery.test.ts apps/api/src/payment-operations.test.ts apps/api/src/shopper-auth.test.ts apps/api/src/privacy-preferences.test.ts apps/api/src/phase08-ingress.test.ts apps/api/src/wishlist-analytics.test.ts apps/worker/src/worker.test.ts apps/storefront/features/checkout apps/storefront/lib/analytics/privacy-client.test.ts apps/storefront/lib/analytics/wishlist-telemetry.test.ts apps/storefront/lib/analytics/analytics.test.ts apps/admin/src/commerce-analytics.test.tsx packages/observability/src/index.test.ts
# The later additions were verified without repeating the entire closure suite:
pnpm exec vitest run apps/api/src/privacy-preferences.test.ts apps/api/src/phase08-ingress.test.ts
$env:UPGRADE_TEST_ALLOW='1'
node packages/database/dist/src/upgrade-test-cli.js
$env:PHASE08_LOAD_OUTPUT=Join-Path (Get-Location) 'docs/architecture/checkout/PHASE_08_LOAD.json'
node scripts/checkout-phase08-load.mjs
```

Browser reproduction: create a fresh temporary output directory; set `CHECKOUT_07B_OUTPUT` to it with the disposable TEST_DATABASE_URL; run `node scripts/checkout-phase07b-runtime.mjs`; run Storefront/Admin `next dev` on loopback 3000/3001 and a dedicated Chrome profile with CDP 9238. Then run `node scripts/checkout-phase07b-browser.mjs` and `node scripts/checkout-phase08-browser.mjs`. Never copy fixture.json credentials into the repository. Physical child tests require the ordinary database production build first; they do not use a live Worker/provider service.

Initial fixture/schema/type/lint mistakes were corrected and rerun, not waived: a missing TEST_DATABASE_URL test config, a Cart-shaped payload used for the new positive account/Wishlist assertion, child-test row typing, and unused/explicit Node imports. The initial workload deadlocks and real enlarged-text overflow were product defects and were fixed at source. Earlier historical FAIL reports remain truthful entry records; current gate changes have new executable evidence.

## Human/device manual acceptance procedure

Run only on a separately authorized isolated runtime with synthetic accounts. Record browser/device/AT versions, viewport/native zoom, operator and result for each item; do not fill a sign-off from automation.

1. At 320/390/tablet/landscape/desktop, use keyboard only and a real touch/on-screen keyboard. Open Privacy choices from both entry points; traverse both purposes, Decline/Save/Close, Escape and focus return. Inspect every control and error at native 200% and 400% zoom, forced colors and reduced motion.
2. With NVDA/VoiceOver/TalkBack, verify title/legend/name/description/state and one useful live announcement for loading, save, conflict, unavailable and reload; no hidden prior-owner content. Test refusal with cookie/storage rejection and after refresh/history restoration.
3. Execute delayed A→B/logout/revocation, duplicated tabs and Admin organization/capability changes while reads/writes are pending. Confirm fresh server denial and no stale private instructions or controls.
4. Once the successful Checkout fixture/policy gate is legitimately available, exercise all four purchase paths, confirmation refresh, unknown placement/claim response, exact recovery, destination suspension, partial/excess/late/refund/COD and support flow. Never substitute a manual DOM or fabricated response for a real committed workflow.

All human/device/native-zoom items above remain **NOT VERIFIED** in this run.

## Phase 08 independent acceptance register

| # | Outcome | Verdict | Evidence / remaining dimension |
| --- | --- | --- | --- |
| 1 | Existing work preserved | PASS | Dirty 06B/07A/07B retained; no Git destructive operation |
| 2 | Migration integrity consistent | PARTIAL | Windows LF/CRLF and real Git evidence PASS; Linux CI not executed |
| 3 | Historical SQL tampering detected | PASS | Anchored hash and negative fixture tests |
| 4 | No silent historical rewrite | PASS | Digests/old migrations unchanged; explicit checker policy |
| 5 | Genuine populated 3221 fixture | PASS | Legitimate pre-schema data, preservation and post-schema constraints |
| 6 | Generic upgrade suite | PASS | 23 ordered upgrades through 3225 and no-op |
| 7 | Scanner findings disposition | PASS | Eight synthetic assignments corrected; unchanged scan passes |
| 8 | Secret detection retained | PASS | Planted realistic credential rejected |
| 9 | Placement uniqueness/idempotency | PASS | Scoped DB/API regression and physical exact-key replay |
| 10 | Atomic business rollback | PASS | Orders/Inventory/Cart/Promotion/Payment/audit/outbox assertions |
| 11 | Unknown COMMIT recovery | PARTIAL | Physical placement socket boundary PASS; other financial commands/failover open |
| 12 | Payment/Finance conservation | PASS | Scoped existing exceptions and new concurrent receipt/posting totals |
| 13 | Refund/reversal/late-payment safety | PASS | Synthetic domain regressions; no real payout claim |
| 14 | COD custody versus settlement | PASS | Existing Finance/Payments regressions, no provider activation |
| 15 | Cross-owner/tenant boundaries | PASS | Scoped actual API/DB + A/B/logout browser cases |
| 16 | Admin revocation/org switch | PARTIAL | Current permission/tenant enforcement covered; full delayed-read/revocation browser matrix open |
| 17 | Consent revision/withdrawal races | PASS | Account browsers, policy expiry, queue/active dispatch and browser uncertainty |
| 18 | No unauthorized optional dispatch | PASS | Current proof checks; live vendor ports remain inactive |
| 19 | Canary absence | PARTIAL | Real request logger and scoped serializer/projection/sink tests PASS; full historical/tracing/cache corpus open |
| 20 | Successful synthetic Checkout browser | BLOCKED | Production policy boundary remains deliberately closed; no public bypass |
| 21 | Guest same-device grant recovery | PASS | Existing exact replay/expiry/owner tests plus physical placement replay |
| 22 | Cross-device guest recovery | BLOCKED | No approved independently verified Order-bound channel; design above |
| 23 | HTTPS/proxy/cookie contract | PARTIAL | Header contract and spoof denial PASS; no local/deployed TLS chain executed |
| 24 | Worker interruption/replay | PARTIAL | Physical commerce child kill/replay PASS; full daemon/jobs/provider matrix open |
| 25 | Representative database performance | PARTIAL | Local mixed sample and before/after evidence; not representative hardware/full HTTP workload |
| 26 | Bounded lock/retry behavior | PASS | Scoped real placement timeout, pool acquisition and concurrency regressions |
| 27 | Browser faults/identity transitions | PARTIAL | 18 actual cases PASS; wider history/expiry/cookie rejection/financial matrix open |
| 28 | Executable accessibility defects fixed | PASS | Real 400% CSS overflow reproduced/corrected; no human acceptance implied |
| 29 | Human/device evidence accurate | PASS | Explicit NOT VERIFIED and manual procedure |
| 30 | Checkout/financial regressions | PASS | 419 distinct tests / 38 files within stated scope |
| 31 | Production UI builds | PASS | Actual Storefront and Admin builds |
| 32 | No purchasing/collection activation | PASS | Policy engine, production draft and public preview gates unchanged |
| 33 | No live marketing activation | PASS | No vendor credentials/calls/matching |
| 34 | External blockers explicit | PASS | Release matrix requires real decisions, no fabricated approval |
| 35 | Phase 09 compatibility plan | PASS | Actual CI/topology and ordered plan in handoff |
| 36 | Rollback/forward recovery | PARTIAL | Local rollback/replay PASS; image/backup/restore and revocation reconciliation unverified |
| 37 | Earlier evidence reconciled | PASS | Overall earlier PARTIAL unchanged; current tooling gates updated with evidence |
| 38 | Reproducible execution register | PASS | Initial register, commands, JSON and scripts |
| 39 | No persistent/live operation | PASS | Dedicated local disposable targets only |
| 40 | Exact Phase 09 handoff | PASS | Readiness matrix, ownership, procedures, staged plan and kill conditions |

## Remaining severity and changed-file map

Release-blocking technical work: P0 full successful browser/unknown financial outcome and complete authorization/canary matrices; P1 representative load and broader cross-account Finance numbering/contention, full Worker daemon crash matrix, native zoom/human/device acceptance, actual HTTPS/public edge and upgrade/rollback/restore on the deployment topology. Guest recovery and business/provider/legal decisions remain external/owner blockers. No earlier phase was silently promoted from PARTIAL.

Changed implementation areas: migration checker/tests/line-ending declarations; explicit fixture credential helper and eight affected harnesses; genuine quote/manual-payment/placement upgrade fixtures and registry; narrow Finance account lock correction; bounded database acquisition; real wire-fault/consumer/pool/concurrency tests; API Origin/logging boundaries and actual-app cookie/canary tests; privacy account/policy regressions; shared modal wrapping; observability Set-Cookie redaction; 08 browser/load harnesses and sanitized evidence. Product Completion and scenario tracking point to the new evidence. Existing uncommitted 3224/3225 and payment/UI work remains preserved.

Cleanup: both Next servers, the disposable fixture API and dedicated PostgreSQL cluster are stopped; no dedicated test browser/port remains. The temporary fixture credential file was removed after sanitized evidence was copied. No unrelated process or database was stopped.

Proceed only under the staged, separately authorized [Phase 09 handoff](PHASE_09_HANDOFF.md). This report is engineering evidence, not release authorization.
