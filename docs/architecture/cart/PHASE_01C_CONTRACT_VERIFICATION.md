# Phase 01-C contract verification

API root is /storefront/v1/carts. The browser adds /api and includes cookies. Writes require JSON and exact Origin, with untrusted Fetch Metadata rejected. Configured tenant/currency and strict shopper resolution precede ownership. V is observed safe integer revision, O is public owner UUID, K is UUID Idempotency-Key, Q is whole-unit string 1–99. The adapter sends O in body and X-Cart-Context. The API accepts either and checks equality when both are present.

| Operation | Method and suffix | Request / authorization | Success, UI and recovery | Executed cases |
| --- | --- | --- | --- | --- |
| Initialize | POST root | Empty JSON preferred, optional org/currency equality assertions and O. No V/K. | 201 new HttpOnly slot or 200 existing view. Read back actual cookie before mutation. Missing cookie echo leaves Add uncommitted. | B01/B02/B07/B09, cookie policy |
| Current | GET /current | Cookie authority, optional X-Cart-Context. No body/key. | Evaluated projection and confirmed count. 404 absent, 401 expired/invalid, 409 ambiguity/account. No creation. | B01/B07/B11/B15 |
| Add | POST /current/lines | V/O/K, exact variant UUID, Q. | Increment and confirm projection; uncertain outcome keeps original request. | B02–B04/B09/B10, AR03 |
| Set quantity | PATCH /current/lines/:lineId | V/O/K, scoped line UUID, Q. | Desired quantity, consumed no-op if unchanged. Stale version needs review. Foreign line returns 404. | B05/B06, C05 foreign line |
| Remove | DELETE /current/lines/:lineId | V/O/K and scoped line UUID. | Receipt and updated projection. Missing/foreign line 404. | B05, C05 foreign line |
| Apply coupon | POST /current/coupons | V/O/K, 2–64 alphanumeric/underscore/hyphen characters. | Selected coupon and evaluated totals. Invalid input 400, unknown code 404, stale revision 409. | B17, C03/C05 |
| Remove coupon | DELETE /current/coupons/:couponCode | V/O/K and encoded code. | Updated evaluation; missing selection 404. | B17, C05 logging |
| Clear | DELETE /current | V/O/K. | Atomic lines and coupon selection removal. Empty consumes receipt without revision/event. Conflict or uncertain recovery uses same rules. | BR18–BR24/BR30–BR31, AR01–AR04 |
| Forget | DELETE /session | Empty JSON. No V/O/K, protected Origin and bounded cookie scan. | Acknowledgement and expiry headers, then unqualified GET. Quiesce pending work and fence late cookie. | BR25–BR27/BR32 |
| Select | GET /current | Explicit offered context with matching cookie. | Scoped projection; invalid context fails closed. | B07, AR12 |
| Replay | Same method/path | Exact original O/V/K, operation and body. | Immutable receipt plus authorized current projection; changed fingerprint conflicts within operation scope. Expired key stays consumed. | B03/B04/B10, S03/S04, C01 |
| Revision conflict | Same command with stale V and new K | Valid context and cookie still required. | 409 STALE_VERSION and current revision, then review. | B06/BR23, AR03, C03 |
| Account unavailable | Owner-resolved routes | Strict verified shopper identity. | 409 ACCOUNT_CART_NOT_READY or auth/mapping error. Clear old guest display. | B08/B15, credential closure |

Success is {data: GuestCartViewDto} except forgetting, which returns {data:{sessionForgotten:true}}. Errors are {error:{code,message,requestId?,currentVersion?,contexts?}}. Response controls use private/no-store and Cookie/context variance. Money and stock come from server evaluation. A receipt's committed revision can differ from the current projection. The UUID selector grants no authority. Guest session forgetting removes cookies and leaves stored Cart records and live bearer revocation policy intact. The assembled parser now returns 400 INVALID_REQUEST for malformed JSON. See [Phase 02A constraints](PHASE_01C_PHASE02A_HANDOFF.md).
