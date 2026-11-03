# Cart Phase 02A implementation checkpoint

**Local status: PARTIAL. Production readiness: BLOCKED.**

This checkpoint adds atomic guest variant replacement and extends the current Cart projection. The existing Cart transaction, owner fencing, intent version, replay receipt, and outbox remain the command boundary. Catalog owns variants, Pricing owns price definitions, Inventory owns availability facts, and Promotions owns allocations. There is no schema change.

## Decisions and current behavior

| Area | Decision and evidence |
| --- | --- |
| Variant replacement | Add a semantic command to [Cart commands](../../../packages/database/src/cart/commands.ts). It locks the Cart through the existing mutation wrapper, scopes the source line to the Cart and tenant, requires an active variant of the same published product, and validates the final quantity, stock and price before writing. |
| Line identity | Preserve the source ID if the target is absent. When the exact target exists, keep its ID, add the requested replacement quantity to its current quantity and remove the source atomically. An unchanged same-variant request is a no-op after eligibility checks. |
| Receipts | Keep existing operation-scoped idempotency and outbox behavior. An in-place change records both variant IDs even when quantity is unchanged. |
| Quantity and stock | Keep the technical whole-unit cap of 99 per variant. Count stock only from active tenant locations with stock-holding capability. Treat this as the current location policy for the Cart; fulfillment routing and channel eligibility require an owner decision. Cart stock is advisory. |
| Price and discounts | Use authoritative prices for replacement and changed quantities. Keep fixed-point money and Promotions allocations. Include coupon attribution and line allocations in the calculation fingerprint. |
| Evaluation | Add merchandise issues and corrective actions and distinguish selected coupons from effective discounts in the [Cart projection](../../../packages/database/src/cart/queries.ts). Keep legacy response fields for existing clients. |

## Acceptance register

| Area | Status |
| --- | --- |
| Replacement, collision, rollback and replay | Focused tests cover equal-quantity variant changes, concurrent duplicate submission, collision failure preserving both lines, and successful consolidation. API tests cover a foreign Cart line, a missing intent key and changed payload under the same key. |
| Inventory | A disabled stock location invalidates merchandise availability and changes the calculation fingerprint while preserving intent revision. Channel, destination, backorder and inventory policy scenarios remain open. |
| Catalog configuration and lifecycle | Same-product replacement and publication checks are in place. Complete option-matrix validation, lifecycle reason codes and configuration recovery evidence remain open. |
| Quantity | Existing 1–99 whole-unit safety rule applies to replacement and the final merged quantity. Minimums, increments, and product, category and Cart policies remain open. |
| Pricing, Promotions and evaluation | Merchandise review and coupon benefit attribution are available. Full compare-at, time and currency scenarios, coupon redemption restrictions, stacking policy, and a consistent mutation-time commerce snapshot remain open. |
| Performance and release | Fresh query plans, representative volume and concurrent load measurements remain open. Historical Phase 01-C samples apply to the previous implementation. Persistent continuity, restore and revocation, proxy and role verification, and owner policy acceptance remain release gates. |

## Phase 02B frontend contract

Send `PUT /storefront/v1/carts/current/lines/:lineId/variant` with the existing guest cookie and UUID `Idempotency-Key`. The request supplies `version`, observed owner context using the existing body or header protocol, `targetVariantId`, and `quantity` as a string of whole units. Quantity is the desired source quantity before any collision merge. Retry uncertain outcomes using the identical request and key. Use the returned lines and receipt to reconcile canonical line identity and show any consolidation.

Read the optional `commerceReview` on the current Cart and successful mutations. `merchandiseReady` refers to a nonempty Cart with all lines available at evaluation time. Coupon status `NO_CURRENT_BENEFIT` is intentionally general. Display the selected code and current discount separately. Checkout must validate merchandise, delivery and payment at handoff.

## Verification and preservation

HEAD was `27b79e9` at inspection. Existing dirty Phase 01-C source and evidence were preserved. Fresh Cart tests created isolated random databases on the local PostgreSQL 18.6 fixture server. No persistent environment was migrated.

- `pnpm --filter @maevelle/database build`, `pnpm exec tsc -p apps/api/tsconfig.json --noEmit`, and `pnpm exec tsc -p packages/database/tsconfig.json --noEmit` passed.
- `pnpm exec vitest run apps/api/src/cart-foundation.test.ts packages/database/src/cart-foundation.test.ts packages/database/src/cart-reassessment.test.ts packages/database/src/cart-credential-closure.test.ts` passed 60 tests.
- `pnpm exec vitest run packages/database/src/orders.test.ts` initially passed 22 of 23 tests on an isolated database with migrations applied. The nationwide test rule duplicated seeded priority 0. The fixture now uses priority 5, between the seeded nationwide rule and the regional override at priority 10. All 23 tests passed on a second freshly migrated isolated database.

Continue with Catalog-owned configuration validation, then quantity and location policy, deterministic pricing and Promotions evaluation, and the remaining scenario and performance gates before closing 02A.
