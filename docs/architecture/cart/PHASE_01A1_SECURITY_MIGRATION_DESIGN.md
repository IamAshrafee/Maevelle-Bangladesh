# Phase 01A.1 security migration design

2026-11-02. Chosen policy: controlled retirement, no adoption or account transfer.

## Pre-edit impact map

Baseline main @ aa290065407030e85b5b6847efd22fb437a65279; 2,004 existing files SHA-256 captured in /tmp/cart01a1-baseline.json and full dirty status in /tmp/cart01a1-status.txt. Existing Cart, Wishlist, auth, Admin and storefront work is dirty and preserved. No package installation, commit, push, deployment or shared database operation authorized.

Change boundaries: additive migration 3214; database Cart issuance/lookup/revocation; shared API guest-cookie/owner resolver; legacy Checkout Cart-token adapter and auth composition; focused tests and Cart documents. No account persistence/merge, UI redesign, new store, Clear, order/payment functionality. Existing exports/DTO/receipts/revisions stay intact. Runtime and peer dependencies unchanged.

## Why retirement

Old bearer possession is the only proof recorded. Old and Phase01A credentials both have random 32-byte values and SHA-256 hashes; no issuance provenance is persisted. Cookie naming alone cannot prove issuance. Therefore pre-cutover fixed AND slot credentials cannot be safely distinguished. No automatic rotation/adoption: it would promote a potentially fixed owner. Neither public IDs nor customer login establish ownership of an arbitrary guest Cart.

Migration retires all pre-cutover token hashes in place (prefix `retired:`) and marks their credential state RETIRED. Items, coupons, owner contexts, numeric revisions and receipts remain unchanged. This also denies old readers that only compare hashes. There is no silent deletion or assertion of recovered intent. No new Cart is initialized when an old credential is supplied. The generic SESSION_EXPIRED response avoids an existence oracle. Independent customer-verifiable proof does not currently exist; restoration is unavailable. This is a material continuity limitation, including previously issued Phase01A slots, not full compatibility success.

## New issuance and lifecycle

Only server-created rows explicitly marked SLOT_V1 accept 32-byte credentials. Default RETIRED rejects old writers, rather than letting pre-cutover code mint accepted credentials. DB checks and a trigger prohibit changing a token or resurrecting RETIRED state. Revocation prefixes the hash and transitions state atomically while locking the same Cart row as mutations. No raw credential is persisted. Expiry is checked again under mutation lock; lock uses current wall clock so transaction-start time cannot extend an expired capability.

Fixed cookie is rejected without lookup. Slot names must exactly match the environment prefix and Cart UUID suffix. Duplicate/malformed slots fail closed. Multiple valid slots require explicit cookie-backed owner context, including Checkout. No automatic selection among old/new credentials. No rotation response exists, so delayed legacy Set-Cookie cannot replace a slot or reactivate a retired hash. New slots retain Phase01A issuance/round-trip and unique-name guarantees.

## Shopper and Checkout contract

Existing verified shopper realm/CRM mapping is authoritative. Strict lookup/mapping/config failures refuse; invalid shopper cookies never fall back to guest. Account operations, including all Checkout Cart readers, return ACCOUNT_CART_NOT_READY. No sign-in claim/merge is performed; sign-out can resume only an independently valid new guest slot. Checkout uses shared resolution on each Cart-facing request, requires configured storefront and resolver, and fails closed when not composed. Legacy guest response/Checkout domain error classifications are preserved after authorization.

## Rollout / forward recovery (not executed)

Stop all Cart/Checkout writers, record aggregate populated affected rows and obtain explicit operational acceptance of continuity loss; back up and preserve diagnostics. Run 3214 once, deploy all API readers/writers together, verify health and cookie/owner smoke checks before enabling traffic. This is a security cutover, not a rolling-compatible migration. Old images cannot create accepted Carts; old hashes stay dead even for old readers. Last compatible release is the new 3214-aware API, not baseline HEAD. Image rollback alone is unsupported. Forward repair must preserve retirement and contents; never strip retired prefixes or re-enable old credentials. Backup restore must reapply retirement before exposing traffic. No staging/production execution authorized here.
