# Phase 02A — Delivery, contact, saved addresses and serviceability backend

Date: 2026-11-04, Asia/Dhaka. **PASS for the assigned locally verified backend scope.** Production activation remains blocked; full Checkout is incomplete. Phase 01B remains **PARTIAL** with its independent browser/race/accessibility/historical-receipt/runtime gates. No Phase 02B frontend, immutable quote, Order placement, reservation, payment collection, commit, push or deployment was implemented or activated.

## 1. Executive implementation summary

Both Buy Now and complete-Cart drafts now accept the same normalized recipient/destination snapshot under existing owner, revision and durable intent protocols. Guests remain independent of Customer identity. Shopper accounts can list, explicitly save, edit, default and soft-remove their own addresses; selecting one creates a purchase-specific snapshot. Saved-address changes never silently replace that intention.

Delivery eligibility uses current Geography, Delivery method state and existing shipping rules. Coverage is explicitly confirmed independently from price; unknown/inactive/restricted destinations fail safely. Rates retain existing priority/specificity semantics, exact decimal strings, revisions and nonfinal labeling. Public purchase and production-draft gates remain unchanged.

## 2. Repository baseline and preserved work

Initial and final branch: `main`. Initial and final HEAD: `fd2cfa2e3496e2bb7a959a83fa0c41989ac41ee3`. Initial tree was dirty with Phase 01B Storefront/contracts/tracker/documentation/runtime-script work; final tree contains that work plus this backend implementation. None was reset, stashed, cleaned, committed or discarded. No Storefront/Admin frontend source was changed by 02A. The existing dirty `packages/contracts/src/checkout.ts` was preserved; new DTOs use a separate file.

The existing `PHASE_01B_IMPLEMENTATION_REPORT.md` was only two bytes when inspected. It was preserved, not reconstructed or presented as a readable detailed report. Its populated `PHASE_01B_VERIFICATION.json`, current source, Git and tracker provide the available baseline evidence. Its PARTIAL verdict and listed unresolved gates are retained.

## 3. Architecture decisions and ownership

| Responsibility | Authoritative reuse / extension |
| --- | --- |
| Current purchase recipient/destination | One normalized `orders.checkout_draft_delivery` child of implementation-2 drafts |
| Account ownership | Existing shopper mapping, live session proof, partition and Phase 01A revocation fence; no CRM phone/email matching |
| Address persistence | Existing Customers table/semantic commands, extended for instructions and participation in the same transaction |
| Geography | Existing nodes/parents/aliases/datasets, explicit country mapping, no fabricated seed/coverage |
| Serviceability and rates | Existing shipping rules gain UNVERIFIED/SUPPORTED/UNSUPPORTED; shared domain selection; existing Delivery method status gates availability |
| Recovery and privacy | Existing platform idempotency receipts, bounded transactions, private transport and safe audit/error handling |

Price is not proof of coverage. Legacy/default tariffs remain UNVERIFIED after migration. Explicit nearest-area restrictions override inherited support; price priority remains the existing separate rate policy. This avoids a competing coverage table or a duplicated price formula. Real courier destination-coverage data was not established by the inspected adapters, so compatibility is honestly NOT_EVALUATED; a merchant-approved coverage decision is required and does not claim a provider promise.

Customer address mutations acquire the Customer exclusively before account/address locks. Existing soft removal was aligned to Customer-before-address ordering to prevent inversion with Checkout selection. Semantic Customer operations retain their audit/outbox/version behavior and now participate in the enclosing receipt/authority transaction. Existing Admin updates that omit new instructions/coverage fields preserve them.

## 4. Database changes and compatibility

New forward migration: `3220_checkout_delivery`, after verified ledger tail 3219. It adds the draft delivery child, Customers instructions, explicit ISO country mapping and shipping coverage decision; tenant-composite draft/customer/address FKs, positive/all-or-none address association revision, mobile/text constraints and relevant reference/coverage indexes. No historical migration was edited. Guest/account drafts without delivery data remain valid; old saved addresses and legacy Checkout→Order links are preserved.

Fresh databases and populated 3219→3220 fixtures passed on isolated PostgreSQL 18.3. Upgrade evidence retains guest/account drafts and their revisions, incomplete legacy saved addresses and a legacy Checkout/Order link. Cross-tenant insertion, invalid phone/location, incomplete saved association, missing association revision and oversized instructions are rejected. Migration 3218→latest foundation regression also passes.

All 51 historical Git migration blobs match the anchored baseline; worktree text matches after CRLF normalization. Byte-preserving temporary-tree validation reports 69 registered migrations and zero errors. The historical baseline was not regenerated. See the contract for controlled migration/API ordering, compatible predecessor and forward-repair/auth-fence constraints. No persistent target was migrated.

## 5. API contracts and errors

The exact frontend-ready endpoint/body/DTO/header/error contract is [PHASE_02A_BACKEND_CONTRACT.md](PHASE_02A_BACKEND_CONTRACT.md). It specifies delivery GET/PUT, manual/saved/revalidate variants, paginated reference search, account address list/create/edit/removal, stable UUID intent keys and string revisions. New routes reuse the existing Fastify framework and protections; query support is narrowly limited to the two paginated lookup routes. No client owner/status/price/shipping amount is accepted.

Errors distinguish malformed input, invalid contact, opaque missing object, stale revision/key, changed saved address, unsupported area, inactive delivery, expiry, quota and retryable infrastructure failure without leaking PII or driver diagnostics. Existing capability-protected Admin shipping-rule writes accept optional explicit coverage decisions; no new Admin UI is included.

## 6. Guest/account behavior and identity transitions

Minimum input is name, mobile, reference location and detailed address; second address line/instructions are optional. Names and addresses preserve meaningful Bangla/English content with safe NFC/trim normalization. Existing phone validation handles local/international formatting; Bangla digits normalize to E.164. No email or account is required.

Guests cannot read account addresses or derive Customer authority from a phone match. Account address reads/writes/selects derive tenant/Customer/account from the verified shopper authority. Cross-account, cross-tenant, stale-partition, Admin-cookie and UUID-only attempts are denied. Adoption preserves explicit guest delivery without automatic profile save and removes old guest access. Session revocation winning the fence rejects a delayed update; a mutation committed before logout can still have a delayed response, which Phase 02B must discard by owner generation.

Address book writes are opt-in, revision checked, idempotent and capped at 50 active entries. Defaults are explicit. Editing delivery detaches saved association unless the shopper explicitly reselects it. Changed/removed selected addresses preserve their snapshot, require review and block implicit revalidation. None changes an existing Order snapshot.

## 7. Delivery/serviceability and financial boundary

The validator checks active district-or-finer selection, one explicit active BD root, bounded/cycle-safe ancestry, explicit supported coverage, restrictions and customer-visible active home delivery. Unknown nodes, wrong/inactive ancestry, country-only defaults and unverified coverage cannot authorize delivery. Search uses real labels/aliases, 20-row pages and bounded offsets/query lengths.

The returned tariff includes server-selected rule UUID, string version, exact amount/currency and `final:false`. A zero amount remains zero. Configuration fingerprint includes applicable rules, coverage, hierarchy and method state; reads/replays detect changes and require revalidation without overwriting input. There is no quote, stock hold, order, obligation or confirmed payment. Phase 03A must revalidate and bind an immutable quote; no configuration-writer fence is claimed for these nonfinal observations.

## 8. Security findings and residual risks

Direct API tests cover foreign owners/tenants, guest/Admin denial, stale partitions/revoked proofs, mixed/mass-assigned/coerced fields, unsafe Unicode, body limits, Origin rejection, expiry, key reuse, stale versions and shared quotas. Real PostgreSQL tests cover same-intent replay, two-tab updates, address defaults/edits, revocation competition, lock timeout, rollback and composite constraints. Request IDs/private headers and sanitized infrastructure errors remain in force. Receipts and audit do not copy contact PII.

Residual gates: actual deployment role/ingress/log canaries, provider coverage, privacy/retention approval, representative load, browser display isolation and physical network loss at COMMIT were not verified. No custom encryption, external service, broker or cache was introduced. Normal live-capability theft/XSS risks remain governed by existing session/application controls. Added instructions are scrubbed by existing Customers anonymization.

## 9. Scenario acceptance

| Scenario | Expected backend/security outcome | Method and actual result | Limitation |
| --- | --- | --- | --- |
| S05 | Minimal Bangla/English input, canonical mobile, supported reference destination, authoritative nonfinal zero tariff | PASS: API guest/account/Cart/Buy Now, local/+880/880/Bangla-digit domain cases, synthetic approved coverage | Real dataset/provider coverage approval remains open |
| S06 | Unsupported/inactive/wrong-country location and stale saved address cannot silently authorize delivery | PASS: direct API invalidation, current-state/replay revision change, explicit restriction and changed/removed snapshot tests | No live courier call |
| S35 | Address edit/remove cannot replace selected intent or change historical Orders | PASS for backend snapshot/ownership/migration scope; existing Orders correction regressions pass | Post-dispatch provider correction and its frontend are outside 02A |
| S44 | Same backend state/API supports future responsive forms | PASS for typed bounded backend contract; NOT VERIFIED for UI/device/AT | Phase 02B frontend is not implemented |
| S45 | Uncertain request recoverable under the same owner/key; rollback atomic; stale edits rejected | PASS for server/API portion: second-instance replay, real same-key/two-tab races, fault trigger, lock timeout and revoked session | Full browser offline/storage/pending-response identity matrix remains PARTIAL with 01B |
| Additional | Default concurrency, page growth/cap, guessed foreign IDs, phone/tenant confusion and zero purchase effects | PASS: 50-address pagination/cap, concurrent default/edit and foreign-tenant authority tests | Offset listing requires refresh after mutations |

These are scoped outcomes, not a claim that entire Phase 00 scenarios or full Checkout are complete.

## 10. Test environment and executed checks

Dedicated temporary cluster: PostgreSQL **18.3**, `127.0.0.1:55442`, synthetic `checkout_fixture` user, generated `maevelle-checkout02a-*` data directory. Binary version, server data directory/address/port and database identity were verified before mutation. New integration fixtures create/drop random databases. Legacy regressions used an explicitly created/migrated random database in that same cluster; Auth used its required `/maevelle_test` selector to create its own random fixture. No `.env`, staging, production or ordinary local persistent database was migrated. Email used the existing in-memory test sender; no provider effects occurred.

Final distinct focused coverage: **177 tests passed**: 26 Phase 02A API/domain/migration/performance, 16 Checkout foundation, 12 Shopper Auth, and 123 Cart/Customers/Orders/Payments/Fulfillment/Delivery regressions. Counts exclude repeated diagnostic runs.

Commands below use `node node_modules/vitest/vitest.mjs run` with the explicit isolated TEST_DATABASE_URL:

| Test paths / command | Result |
| --- | --- |
| `apps/api/src/checkout-delivery.test.ts`, `packages/database/src/checkout/{delivery-migration,delivery-performance}.test.ts` | 26 PASS |
| `apps/api/src/checkout-foundation.test.ts`, `packages/database/src/checkout/foundation.test.ts` | 16 PASS |
| `apps/api/src/shopper-auth.test.ts` | 12 PASS |
| `packages/database/src/{orders,payments,cart-foundation,customers,fulfillment-delivery}.test.ts`, `packages/database/src/customers/identities.test.ts`, `apps/api/src/{cart-foundation,cart-credential-closure}.test.ts` | 123 PASS |
| `node node_modules/typescript/bin/tsc -b packages/contracts packages/database apps/api --pretty false` | PASS |
| Corresponding `packages/{contracts,database}/tsconfig.build.json` and `apps/api/tsconfig.build.json` build | PASS |
| `tsc -b apps/storefront --pretty false` | PASS; existing frontend source preserved |
| ESLint and Prettier on touched backend/contracts files; `git diff --check` | PASS |
| `node scripts/check-architecture.mjs` | PASS, 13 workspaces |
| Byte-preserving historical migration validator | PASS, 69 registered / 51 historical |

Development failures were corrected before final verification: stale dist package, a fixture duplicate default tariff, prepared multi-statement fixture SQL, NFC expectation, nullable association check, and cold reference-search planning. The first legacy regression attempt used the unmigrated disposable base and failed missing-relation setup; the corrected random migrated fixture passed. Shopper Auth then rejected the random selector because it requires `/maevelle_test`; rerunning with its required selector passed. One diagnostic performance command omitted the environment variable and attempted the repository default test port 5434; connection was refused before any database creation/mutation. Final measurements/checks use the verified temporary cluster. These setup/diagnostic failures are not counted as passing tests or concealed as product defects.

## 11. Measured performance and reliability

Synthetic fixture: 2,500 locality nodes under a district, one confirmed policy, no provider calls; 5 warmups then 20 samples per operation, concurrency 1. These are local loopback timings, not approved production targets or a representative load test. Explicit query counts include timeout SET statements and authorization but exclude driver BEGIN/COMMIT commands.

| Operation | p50 ms | p95 ms | Explicit queries | Maximum DTO bytes |
| --- | ---: | ---: | ---: | ---: |
| Serviceability | 1.51 | 1.60 | 1 | 253 |
| Area search (20 returned) | 9.56 | 10.25 | 1 | 2,980 |
| Full fenced guest delivery update | 6.12 | 7.10 | 16 | 743 |
| Fenced guest delivery restore | 2.77 | 3.36 | 8 | 743 |

EXPLAIN ANALYZE on the same intentionally fresh statistics fixture observed 8.395 ms execution and 5,121 shared hit blocks. An earlier plan performed millions of cross-product comparisons and measured roughly 200–219 ms search p95. Policy batching alone did not fix it; parameterized indexed child traversal and post-pagination parent-label lookup did. Search remains proportional to reference hierarchy size; representative national datasets, concurrency, collation, warm/cold caches and runtime DB roles remain NOT VERIFIED. Account listing/cap is verified at 50 entries; no account throughput benchmark is claimed.

## 12. Negative effects and regressions

API-fixture assertions after delivery/address/failure workflows verify **zero** Orders, inventory reservations, payment obligations, confirmed payments, promotion redemptions, Cart conversions, purchase outbox facts and ORDER_PLACED/PAYMENT_CONFIRMED behavioral events. Cart-source revision/items remain unchanged; Buy Now never requires a Cart. Populated migration fixtures intentionally contain a historical Order for compatibility and are separate from the zero-purchase fixture.

Existing Orders, Payments, Customer identity, Cart, Shopper Auth and Fulfillment/Delivery regressions pass. No Worker or financial semantic operation was replaced. Public legacy purchase endpoints remain disabled. No full all-package suite, release-readiness drill, browser acceptance, deployment or live-provider test was run.

## 13. Open risks and operational gates

Vetted BD country mappings and merchant-approved area coverage must be supplied through authoritative configuration; old/unmapped/unverified data safely remains unavailable. Courier/payment-method compatibility, production retention/cleanup/caps, privacy approval, actual ingress/roles, migration/restore continuity and representative load remain open. Existing Phase 01B browser failure/race/device/accessibility/populated historical receipt/production-runtime gates are unchanged. Its two-byte report is an inherited documentation gap; its verification JSON remains preserved. No real merchant destination or provider configuration was touched.

## 14. Phase 02B handoff

Use the [exact backend contract](PHASE_02A_BACKEND_CONTRACT.md), including full delivery replacement, stable intent recovery, explicit save/selection, string revisions, changed/removed snapshot review, server revalidation and owner-partition cancellation. The UI must never persist private address data in shared journals, auto-save or auto-refresh a changed account address, infer a final charge/provider promise, or enable purchases. Empty lookup data means configured coverage is unavailable; do not insert a default district/fee. Backend work is ready for separately authorized Phase 02B integration; no frontend was started here.

## 15. Acceptance register

| Required outcome | Status and evidence |
| --- | --- |
| 1–2 Guest and authenticated contact/delivery | PASS — common API and normalized persisted snapshot |
| 3 Secure account addresses | PASS — live realm/session/tenant/Customer checks and adversarial tests |
| 4 Address create/edit/select behavior | PASS — explicit opt-in, default/version/remove semantics and snapshot review |
| 5 Authoritative location validation | PASS — existing reference hierarchy and explicit country mapping |
| 6 Unsupported destinations fail safely | PASS — no default coverage, explicit restriction and stale configuration tests |
| 7 Shipping ownership | PASS — shared Orders rules/rate resolver plus Delivery method state; provider capability remains NOT VERIFIED |
| 8 Revisions/isolation | PASS — root string revision, authority fence, composite FKs and transaction receipts |
| 9 Concurrent/stale updates | PASS backend — two tabs, replay, defaults, timeout and rollback; browser presentation remains outside 02A |
| 10 Authentication transitions | PASS backend — revocation race/adoption/tenant/account denial; pending browser display gate preserved |
| 11 Phase 02B contract | PASS — shared DTOs and exact handoff |
| 12 Migrations | PASS — fresh/populated isolated PG18 and historical integrity |
| 13 Adversarial tests | PASS — direct API and real PostgreSQL evidence |
| 14 No purchase activation | PASS — unchanged default-off/production refusal and zero effects |
| 15 Existing commerce modules | PASS for executed 123 + 12 focused regressions; broader operational acceptance NOT VERIFIED |
| 16 Phase 01B gates visible | PASS — PARTIAL unchanged |
| 17 Limitations reported | PASS — scoped evidence and explicit remaining gates above |

The task-owned random regression database was dropped; only the fixture base and postgres database remained, and the temporary cluster was stopped. `pg_ctl status` confirmed no server running. All work remains uncommitted. No push or deployment occurred.
