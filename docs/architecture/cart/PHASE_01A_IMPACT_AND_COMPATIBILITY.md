# Phase01A impact and compatibility plan (before application edits)

Baseline 2026-11-02: main aa290065407030e85b5b6847efd22fb437a65279; 23 modified tracked paths, 38 untracked paths (Phase00 directory now included). Snapshot /tmp/cart01a-baseline.json records hashes of 1,950 existing files. Current source matches the audited Cart; preserved auth/Wishlist edits remain authoritative.

## Planned changes and reasons

- packages/contracts/src/cart.ts and index.ts: additive shared legacy-compatible Cart view, discriminated owner, receipt/outcome/error contracts.
- packages/database/src/cart.ts: retain public exports; split query, command, context and receipt responsibility into cart/ files. Preserve CartView numeric version with explicit safe range checks and add string intentRevision; keep all old fields and Orders imports.
- packages/database/src/migrations/3213_cart_foundation.ts and migrations/index.ts: additive scoped FK/ownership/receipt metadata; preserve legacy rows, quantities, status and token hash. No applied migration edits.
- apps/api/src/routes/cart.ts plus focused cart-* helpers: configured tenant/currency, bounded strict schema/origin/no-store/shared quotas, capability-backed context selection, modern owner preconditions plus documented legacy adapter.
- apps/api/src/routes/shopper-auth.ts: add optional strict resolution mode for Cart; retain default Wishlist behavior. Auth composition root passes config/resolver to Cart without disturbing prior dirty edits.
- packages/database/src/cart-foundation.test.ts and apps/api/src/cart-foundation.test.ts: actual isolated PostgreSQL/API replay/concurrency/privacy/ownership tests and legacy compatibility checks.
- Cart documentation only: protocol, outcome/revision semantics, coverage/acceptance and implementation report. No frontend or deployment edits.

## D15 proposed protocol and safe fallback

Independent cold requests cannot share an inferred identity. Each initialization issues a distinct, server-generated HttpOnly cookie name containing a random credential slot; no initialization response overwrites another slot or the legacy maevelle_cart authority. Mutation requires a returned cookie (round-trip proof); no cookie => SESSION_ESTABLISHMENT_REQUIRED, never implicit creation/add. Context selectors are public preconditions only, always matched against a cookie-backed server owner. Duplicate init with established authority does not issue/rotate cookies. Unknown init without received cookie can leave only an empty row.

If multiple issued credentials are present, a request without explicit ownerContext is refused with CART_CONTEXT_REQUIRED and a bounded list of cookie-authorized context references; no silent selection/merge/overwrite. Explicit context resumes each independently acknowledged Cart. The Phase01B client coordinates initialization and reconciles multiple contexts; server does not depend on that for authorization or loss prevention. Cookies are never deleted/rotated by ambiguous late responses. Slot/header bounds refuse further creation instead of evicting acknowledged authority. Browser cookie rejection/eviction cannot promise persistence; no mutation without credential; this limitation is reported explicitly.

Existing PDP/cart route response remains {data:CartView}; additive fields carry owner context/revision/outcome. Legacy no-key mutations derive an owner+operation+version+payload identity, so exact retry is safe; new clients send explicit UUID key and ownerContext. With multiple contexts legacy callers receive actionable conflict rather than silently switching owner. Legacy maevelle_cart token remains accepted and is never replaced during bootstrap. Existing Checkout imports continue using the facade, schema/status/CartView preserved; new slot cookies are not automatically handed to legacy Checkout (separate readiness gate, no invented Checkout integration).

Authenticated Cart access resolves existing verified shopper identity but returns ACCOUNT_CART_NOT_READY in this phase; no guest fallback or merge. Invalid/expired shopper cookies or resolver errors fail closed. Existing anonymous clients remain supported; authenticated shopper Cart becomes explicit Phase03 work. Snapshot/pricing re-evaluation is distinct from immutable receipt outcome. Receipt expiry refuses execution; no physical deletion or unapproved retention purge is enabled.

No database execution is permitted until a new isolated local instance and target database identity are verified. Existing Wishlist PostgreSQL container remains untouched.

## Verified dependency additions during implementation

Compatibility evidence required a narrow Orders cookie reader and CHECKOUT_CHANGED classification adapter; no new Checkout feature. The owning Promotions evaluator required remaining-gross stack capping to eliminate negative Cart net. A real pg_terminate_backend test exposed unhandled driver error events between queries, requiring createDatabase event handling and safe API/Worker logger callbacks. Database's public test-fixture subpath avoids private cross-workspace source imports; it adds no dependency/install. Migration additionally scopes coupon links via metadata-only500-row backfill and compatible fill trigger. Tests use random new databases on a verified local test server rather than fixed shared schema names. No unrelated user changes were rewritten.
