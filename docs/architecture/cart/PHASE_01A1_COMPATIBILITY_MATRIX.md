# Phase 01A.1 compatibility matrix

2026-11-02. Security enforcement and functional support are assessed separately.

| Consumer | Supported behavior | Controlled unavailable / dependency | New evidence |
| --- | --- | --- | --- |
| PDP/header/Cart controller | New guest slots, existing five commands, owner/version/key, receipts and exact replay | Fixed/pre-cutover credentials refuse, no automatic replacement | 17 rerun Chrome scenarios B01–B17; controller/journal/PDP tests |
| Cart full page | Quantity/remove/coupon and authoritative projection unchanged | Atomic Clear still unsupported; no delete loop | B05/B17 and existing controller tests |
| Guest API | Same paths/DTO/numeric versions/error envelope; new SLOT_V1 issuance | Old fixed cookie intentionally deprecated; no adoption endpoint | API foundation/closure + C01–C04 |
| Database Cart facade | Same exports/inputs/DTO; only active issued new capabilities authorize | Old credentials return NOT_FOUND, including old receipt replay; intent and receipt stay stored | DB foundation/closure; populated upgrade |
| Checkout creation/read/contact/address/payment-method list/select/refresh/place reader | Existing guest semantics after shared tenant/owner resolution; one scoped slot or explicit header-selected valid slot | Account:409 ACCOUNT_CART_NOT_READY; invalid shopper:401; mapping/outage:503; ambiguous slots:409; absent token preserves404 | Eight-verb API test; guest creation test; selected22 Orders regressions; C05/C06/C08 |
| Authenticated shopper | Existing verified realm and CRM mappings retained; account is never anonymous | Account Cart persistence and all guest/account merging remain Phase03 | Actual A/B/login/logout/suspended mapping tests; C05/C06 |
| Sign-out | May resume an independently valid new guest slot without attaching it to the account | Old guest capability remains retired; no account intent copied | API real-identity test; Chrome C06/B08 |
| Old API image / direct hash reader | Retired hash cannot match raw token digest | Old writer insert shape fails DB constraint; no rolling compatibility or old-image rollback claim | DB old-writer test, C01 old_reader_matches=0 |
| Wishlist/Admin | No feature/source changes in this phase; shopper default non-strict behavior retained | No claim of complete Wishlist/Admin integrated acceptance | Existing12 shopper tests and preservation manifest; broad Wishlist browser suite not rerun |

Checkout requires the configured storefront and existing shopper resolver in registerOrderRoutes. Omitting either fails503; there is no unauthenticated fallback parser. Production cookie environment is taken from RuntimeConfig for Cart authority. Checkout's own existing token/cookie and business semantics are unchanged. This phase does not certify Checkout completion or add Checkout/payment/order features.

All pre-3214 Carts, including Phase01A slots, lack persisted issuance provenance. Their customer intent is retained but cannot be automatically recovered safely. A browser with a retired credential is refused even on initialization. Removing cookies does not recover the old Cart; an explicit later fresh shopping session creates an independent Cart. There is no claim that sign-in, public context, old key, or matching product quantities proves legacy ownership.

Before any persistent cutover, obtain a deliberate operational decision on these inaccessible populated Carts, back up, and use the stop-writers procedure in the migration design. No operational cutover is authorized or executed by this work.
