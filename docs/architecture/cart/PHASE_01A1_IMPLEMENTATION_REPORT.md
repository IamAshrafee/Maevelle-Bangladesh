# Phase 01A.1 implementation report

2026-11-02, Asia/Dhaka. **PARTIAL —16 PASS /3 PARTIAL acceptance gates.** Local security enforcement passes; unavailable historical recovery/account functionality and unexecuted operational cutover are not represented as completed compatibility.

## 1. Executive outcome

Implemented controlled credential retirement, persisted issuance provenance, irreversible row-locked revocation, exact slot binding, post-lock expiry checks and strict owner-aware Checkout compatibility. No account Cart/merge, Clear, UI redesign or new store. No packages installed or commits/pushes/deployments/VPS/shared DB writes.

## 2. Git preservation

Initial/final branch main, HEAD aa290065407030e85b5b6847efd22fb437a65279. Captured2,004 existing files and all initial dirty/untracked paths before editing (45 tracked modifications /61 untracked status entries; final45 /67). All unrelated Wishlist/Admin/Storefront/config work remains unchanged from that snapshot; no missing files. Exact changed/new paths and hashes are in [preservation manifest](phase01a1-evidence/preservation.json), with baseline/final status snapshots. No reset/clean/stash/discard operation.

## 3. Verified legacy findings

Fixed `maevelle_cart` used a real256-bit random bearer and SHA-256 persistence, not a public UUID. Its lack of __Host naming made known-token planting a conditional fixation risk where an attacker can set a parent-domain cookie. Phase01A accepted it without independent issuance proof, and slot suffix was not bound to the row. Checkout's separate parser skipped current shopper/tenant/environment checks. No arbitrary-token guessing exploit is claimed. [Full audit and attack matrix](PHASE_01A1_LEGACY_CREDENTIAL_AUDIT.md).

## 4. Retirement design and rejected alternatives

No independent historical ownership/issuance proof exists. Automatic adoption/rotation would promote a potentially fixed authority. Login, ownerContext, Cart ID, key, IP/UA and product matching are rejected as proof. Migration3214 retires **all** pre-cutover hashes, including Phase01A slots, by retaining them under a nonmatching `retired:` prefix. Cart rows/items/coupons/receipts/revisions are retained. No automatic deletion/replacement or claim of recovery. New server-created Carts explicitly use SLOT_V1. [Design and impact map](PHASE_01A1_SECURITY_MIGRATION_DESIGN.md).

## 5. Session security

Random256-bit issuance/hash storage and unique host-only Secure/HttpOnly/Path=/Lax/30-day slots remain. Fixed cookie refuses; exact environment+UUID suffix required. Invalid/retired mixed slots refuse; multiple valid slots require explicit context. No rotation/adoption response exists to reorder; delayed fixed response cannot overwrite a new slot or revive a retired hash. Internal scoped retirement locks the Cart row, prefixes its hash atomically and never changes intent revision or receipts. DB trigger forbids hash replacement/resurrection. Expiry uses database wall clock and is rechecked after obtaining a mutation lock. Credential possession remains bearer authority for an active issued guest; no claim of same-origin compromise resistance.

## 6. Signed-in compatibility

Reused existing verified shopper realm and customer-account/CRM mapping. Strict config/mapping failures refuse; default non-strict Wishlist resolution remains unchanged. Cart and all eight Checkout Cart consumers return409 ACCOUNT_CART_NOT_READY for verified accounts,401 for invalid/expired shopper state and503 for resolution/mapping outage. Sign-out can resume only an independently valid new guest slot. This is an explicit deprecation/unavailable contract, not functional signed-in Cart persistence. [Matrix](PHASE_01A1_COMPATIBILITY_MATRIX.md).

## 7. Database/API paths and contract

- `packages/database/src/migrations/3214_cart_credential_retirement.ts`: additive credential_state/check/trigger, in-place irreversible hash retirement; existing migration3213 unchanged.
- `packages/database/src/migrations/index.ts`: register3214.
- `packages/database/src/cart/context.ts`: explicit SLOT_V1 issuance/lookup and post-lock expiry.
- `packages/database/src/cart/credentials.ts`: internal tenant/context-scoped atomic revocation; no public adoption endpoint.
- `apps/api/src/routes/cart-context.ts`: exact slot/fixed-cookie/state/multiple authority enforcement.
- `apps/api/src/routes/checkout-cart-context.ts`: route-bound read-only owner adapter; no raw URL authority or token fallback.
- `apps/api/src/routes/orders.ts`, `auth.ts`: pass verified resolver and use authorized Cart token; Checkout business logic unchanged.
- `apps/api/src/routes/shopper-auth.ts`: strict mapping/config failure propagation.
- API/database foundation/closure tests, Cart CI upgrade cases, one-minute-past synthetic price fixture and loopback HTTPS scripts provide evidence. Existing DTO/contracts/facade signatures, receipt/outbox/revision logic and all frontend source remain unchanged.

Existing unique hash index supports lookup; no speculative index added. Default RETIRED rejects old writers. This is intentionally not rolling-compatible: stop writers, back up, apply once, deploy compatible API together. Last compatible release is the new3214-aware source/image; no image artifact is built/deployed here. Old image rollback alone is unsupported. Forward repair/restore must retain retirement. No persistent migration executed.

## 8. Real-browser evidence

**26 PASS:**9 new Chrome156 HTTPS cookie/security/migration scenarios and17 rerun existing PDP/header/Cart scenarios. Actual server Set-Cookie, browser HttpOnly/Secure policy, real PostgreSQL3213→3214 migration, retained quantity/revision/receipt, renamed retired bearer, production host/path/Lax/expiry, duplicate recovery, mixed cookies, A/B/logout/mapping/session TTL, concurrent revoke/write and delayed old response. [New evidence](phase01a1-evidence/browser.json), [regression evidence](phase01a1-evidence/phase01b-regression.json). Self-signed localhost certificate accepted only in disposable browser; no staging TLS claim.

## 9. Security test results

**114 selected tests pass /10 files:**92 combined backend/frontend/architecture plus22 Orders, with1 intentionally excluded pre-existing delivery-pricing fixture case. Additional focused13-test refinement rerun exercises duplicate refused initialization and expiry of an unchanged locked row. Fresh isolated DB and populated CI upgrade12 migrations pass. Backend production build, API/database types, targeted lint, architecture13 packages, migration history63/51 and whitespace checks pass. [Exact commands, failures and coverage limits](PHASE_01A1_TEST_EVIDENCE.md).

## 10. Regression outcome

Guest PDP/header/page mutations, coupons, receipt recovery, owner epochs, Web Locks/cross-tab and navigation passed real browser checks. Shopper12 tests cover existing realm/Wishlist authorization behavior; no Wishlist/Admin feature file changed. Broad Wishlist/Admin browser/suite not rerun, so no full regression certification. Existing production frontend artifact was used; no new frontend build claimed.

## 11. Threat/acceptance status

T04/T05 legacy fixation/replay and T30 independent Checkout Cart owner bypass have targeted local closure evidence. Future account merge/credential revocation, trusted proxy/secrets and operational deployment remain separate gates. [Register](PHASE_01A1_ACCEPTANCE_REGISTER.md):16 PASS/3 PARTIAL, no known new unaddressed Critical/High issue knowingly accepted. Historical acceptance counts are preserved.

## 12. Outstanding risks and exact closure

Pre-cutover legitimate guests cannot be distinguished from holders of planted/stolen old credentials. All old state is preserved but safe automatic recovery is unavailable. Before persistent cutover, explicitly resolve that continuity policy or build separately verified recovery; never strip retirement prefixes or trust login/public IDs. Functional account Cart/merge requires Phase03. Persistent migration/TLS/proxy/backups/forward recovery have not been executed or authorized. New guest capabilities remain usable; this result is not achieved by denying all Cart functionality.

## 13. Phase01B.1 readiness

Frontend source/controller/store unchanged;17 existing Chrome flows pass. Existing high-zoom header reflow, browser-menu zoom, real screen-reader and physical touch judgment remain open. No accessibility closure claimed or unrelated UI work performed.

## 14. Phase02A readiness

Protected new guest owner/receipt/revision foundation is usable for separately authorized domain work. Atomic Clear still requires one server semantic transaction, expected owner/version, immutable key/receipt and correct no-op/replay semantics; no endpoint/delete-loop implementation here. Integrated release readiness remains partial.

## 15. Resume and operational limits

Review retirement/continuity design before any persistent cutover. Local browser fixture databases remain available; auxiliary test processes are stopped after evidence collection. Preserve this implementation and existing dirty work; do not deploy or begin03/Checkout/other features without assignment. No confirmation request or external operation was needed for authorized local implementation and isolated verification.
