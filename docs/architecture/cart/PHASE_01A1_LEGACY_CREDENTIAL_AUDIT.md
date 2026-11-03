# Phase 01A.1 legacy credential audit

2026-11-02. Source baseline main @ aa290065407030e85b5b6847efd22fb437a65279 with preserved dirty Phase01A/01B and Wishlist/Admin work. This audit distinguishes inherited source behavior from tests executed in this phase.

## Verified trust boundaries

| Boundary | Inherited evidence | Closure |
| --- | --- | --- |
| Browser cookie → guest bearer | HEAD `routes/cart.ts` read fixed `maevelle_cart`; Phase01A `cart-context.ts` accepts fixed and environment slot values | Fixed cookie refused; exact slot suffix must match server Cart ID, value must match an active SLOT_V1 hash |
| Credential issuance → persistence | `security.generateOpaqueToken()` uses randomBytes(32), base64url 43 characters; SHA-256 via hashToken, no plaintext persistence | Entropy/hash unchanged; 3214 persists issuance state, pre-cutover hashes irreversibly retired |
| Cookie naming → security | Legacy HttpOnly, Path=/, Lax, 30 days, Secure in production but no __Host prefix. Phase01A unique `__Host-maevelle_cart_<uuidhex>` in production; development unprefixed | Host-only Secure production slots retained; wrong environment/malformed/duplicate names refused |
| Bearer → owner/tenant | Phase01A current configured organization/currency, ACTIVE/unexpired/non-account row; public ownerContext only selects a possessed token | State/slot checks added; facade refuses retired credentials too; expiry rechecked after lock wait |
| Shopper cookie → account | Existing Better Auth shopper realm, encrypted PG secondary storage, verified user and resolveOrEnrollShopper CRM account mapping | Existing identity reused; strict mapping/config failures throw; never guest fallback |
| Cart → Checkout | Independent Orders cookie parser accepted one fixed OR slot without resolving shopper, configured tenant, or environment prefix | One shared resolver, configured tenant/currency and strict shopper check on all eight Cart-facing routes |
| Cart mutation → persistence | Existing row lock + scoped receipt + revision + outbox transaction | Unchanged; retirement takes same row lock; DB trigger rejects token changes/resurrection |
| Response → frontend | Unique names avoid old response replacing another slot, owner epochs fence old callbacks | Existing controller unchanged; mixed legacy/new credentials refuse and never erase acknowledged data |

The original fixed cookie was never a public Cart UUID. It already had 256-bit entropy and hash persistence: guessing a token or seeing a UUID is not a verified exploit. Cookie **planting of a known valid bearer**, however, is a different boundary: a compromised sibling domain able to set a parent-domain fixed cookie could plant its own scoped Cart. The Phase01A reader had no independent issuance/owner proof and would reuse that authority. This is a conditional fixation vulnerability, not proof of a real attack or of arbitrary browser cookie injection. A same-origin compromise or stolen live new token remains powerful; HttpOnly is not an XSS authorization boundary.

## Precedence and lifecycle findings

Legacy/new credential values were previously pooled and matched by hash. Several valid rows required explicit context; one valid fixed cookie could be selected automatically. Slot suffix was not bound to the row. Expired/converted/account rows were excluded by the Cart facade, but no explicit token revocation/provenance distinguished earlier issuance. Cookie Max-Age alone did not revoke a replayed token; server expires_at did. Checkout counted cookie names independently and could accept a wrong-environment or foreign-tenant token and ignore signed-in identity. It did not grant account Cart persistence, but bypassed the newer owner-refusal policy.

No existing customer-controlled guest ownership proof, signed issuance claim, device secret, or recoverable verified guest-to-account link was found. Legacy active Cart customer_id is not an independent account-authority contract. Login must never claim a guest by that public reference. Phase03 merge remains separate.

## Attack and compatibility matrix

| Input/attack | Before closure | After closure / evidence |
| --- | --- | --- |
| Valid fixed bearer | Accepted by Phase01A and Checkout | 401, no DTO/cookie/adoption; API and Chrome C01 |
| Forged/random/malformed fixed bearer | Invalid/expired refusal; not brute-forceable | Same generic refusal without existence disclosure |
| Expired/revoked/retired token | Expiry/status exclusions; no retirement state | State+prefixed hash denied even by old equality readers; DB, C01/C02/C07 |
| Rename old token into slot | No provenance check; suffix ignored | All old hashes retired, exact suffix binding; API/C02 |
| Wrong tenant/currency | Current Cart refuses; Checkout unscoped | Shared configured scope on both; focused API tests |
| Wrong public ownerContext/cart ID | No authority without token | Remains rejected; API foundation and closure tests |
| Multiple old/new cookies | Could select one valid authority from pooled values | Fixed or invalid slot poisons request; several valid slots require explicit cookie-backed context; C04/B07 |
| Replay after retirement / concurrent revokers | No explicit lifecycle | Irreversible trigger, serialized mutation/revoke; DB/C07 |
| Guest → A → B | Cart denied account; Checkout still used guest token | All Cart-facing routes ACCOUNT_CART_NOT_READY; Chrome C05/B08/B15 |
| Invalid/expired shopper or resolver failure | Current Cart fail closed; Checkout skipped identity | 401/503 with no guest substitution; API/C06/C08 |
| Delayed initialization / fixed-cookie response | Distinct new slots safe, legacy boundary open | Existing B07 plus C09: fixed arrival cannot overwrite new slot or resurrect old hash |
| Legitimate pre-cutover intent | Accessible only by unproven bearer | Data retained; browser recovery unavailable. This is a compatibility limitation, not successful adoption |

The required policy is retirement, not account migration or merge. No automatic deletion, new Cart, token exchange, selection guess, IP/UA proof or public-ID recovery is introduced.
