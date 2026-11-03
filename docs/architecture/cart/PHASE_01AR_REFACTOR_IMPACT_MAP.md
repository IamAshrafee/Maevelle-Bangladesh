# Phase 01A-R change boundary

2026-11-03. Baseline: `main`, `aa290065407030e85b5b6847efd22fb437a65279`.
The initial tracked/untracked file hashes are in `phase01ar-evidence/baseline.json`.
No baseline file is discarded, stashed, reset, committed, or pushed.

Authorized source boundaries: Cart API/context and facade/commands/queries/availability;
Pricing's existing resolver (add a shared batch operation); shared Cart DTOs where
needed; a NEW forward-only migration and its registry/upgrade fixture; focused
Cart API/database tests; Cart architecture documentation and concise completion
resume metadata. Existing dirty work in each boundary is the starting implementation.

Consumers: Storefront Cart controller already sends explicit UUID intent keys,
owner contexts and revisions; its implementation is preserved. Orders/Checkout
reads the Cart facade through the strict context adapter; preserve its shape and
fail-closed account boundary. Worker uses the shared outbox; no new consumer or
retention policy is activated. No Admin/Wishlist/provider/deployment edits.

Planned changes: atomic Clear; mandatory public intent keys; explicit cookie-only
session reset without data deletion/authority adoption; database discrete-unit,
revision, monetary and guest-owner constraints; batch authoritative price/stock
reads; precise tests and frontend handoff. Keep slot issuance, tenant resolution,
account rejection, receipt ledger and immutable outcomes. Keep migrations
1000/3213/3214 unchanged; retirement is an existing dirty security cutover and
must not be replayed on a persistent environment without its deployment plan.

Breaking contract: unkeyed public mutations reject with INTENT_KEY_REQUIRED;
current Storefront already complies. Test callers that represent successful
public mutations must send explicit keys. Internal legacy call shapes retain
revision-bound deterministic receipts for existing direct consumers; this is one
implementation, not a second persistence model. Clear is additive and backend-only.

Final explicit retirement: removed cart/legacy-receipts.ts and the unused optional
legacyReceipt outcome flag; persisted old receipts are unchanged and the current
facade rejects every pre-cutover credential. New scripts/cart-phase01ar-runtime.ts
and cart-phase01ar-browser.mjs are synthetic-only verification harnesses, not
registered production endpoints. Current Cart README/master/system/domain/API
notices and completion resume metadata link the new profile; old phase reports
remain unchanged. Pricing.ts was clean at baseline and receives only the focused
batch resolver. Shared dirty exports are extended without replacing other work.
