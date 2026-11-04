# Phase 02A delivery/contact and saved-address contract

Implemented backend only; purchases and production drafts remain disabled. Phase 01B acceptance remains **PARTIAL**. Phase 02B and immutable quotes/placement are separate assignments. Shared DTOs are in `packages/contracts/src/checkout-delivery.ts`; source and authority protocol remain in [Phase 01A](PHASE_01A_BACKEND_CONTRACT.md).

## Ownership and minimum input

Checkout owns a purchase-specific snapshot. Customers owns `customer_addresses` and its semantic create/edit/soft-remove operations. Geography owns reference nodes and ancestry. Orders owns the existing shipping-policy/rate rules and shared resolution; Delivery owns home-delivery availability. No phone lookup enrolls or links a guest to a Customer.

The complete delivery input is:

```json
{
  "recipientName": "Recipient name",
  "mobile": "01712345678",
  "geographyNodeId": "an-existing-supported-location-uuid",
  "addressLine1": "House, road, village and landmark as needed",
  "addressLine2": null,
  "instructions": null
}
```

Only the first four fields are required. Names support Bangla/English, punctuation and shaping joiners. Text is NFC-normalized and trimmed; bounds are 120/500/300/500 Unicode characters for name/address1/address2/instructions. Control characters, bidi overrides/isolates and lone surrogates are rejected. Phone input is bounded to 40 characters, accepts Bangla digits and existing local/880/+880 formatting, and uses the existing libphonenumber identity validator plus a BD mobile constraint. Stored mobile is E.164. No mandatory email, billing address, postcode, second number or registration is introduced.

## Transport and authority

Base: `/storefront/v1`. All routes inherit the Phase 01A default-off, non-production-only draft gate, exact write Origin/Fetch Metadata, JSON-only writes, durable trusted-IP quotas, private `no-store`, no-referrer and safe request-ID errors. Bodies are strictly allowlisted before Fastify coercion/removal; delivery/address bodies are at most 8 KiB, removal 1 KiB. Never include PII in URLs, storage journals, telemetry or idempotency keys.

Guest: selected `X-Checkout-Context` plus its existing HttpOnly cookie. Account: shopper-realm cookie plus current `X-Shopper-Partition` from `/shopper/session`. Saved-address routes require the account authority even if a guest cookie is supplied. Admin cookies, typed Customer IDs, phone matches and UUIDs confer no address authority. Searches expose only nonprivate reference labels and do not require a guest principal; they remain behind the development draft gate and quotas.

Writes below require one stable UUID `Idempotency-Key` per intent. Persist that nonsecret key before sending; retry exactly the same body/key after an uncertain response. Same key/different content conflicts. Authority is checked before replay. Delivery replay returns the **current** authorized state, not an old private response snapshot. Address replay returns the canonical `{id}`; reload the address book for current revision/content. Successful receipts contain IDs only, not addresses or phones.

| Method / path | Input | `{data: ...}` result |
| --- | --- | --- |
| GET `/checkouts/:id/delivery` | No body/query | `CheckoutDeliveryStateDto` |
| PUT `/checkouts/:id/delivery` | `{revision,delivery:<complete input>}` | Current state and incremented draft revision |
| PUT same path | `{revision,savedAddressId,savedAddressRevision}` | Authorized saved address copied into purchase snapshot; incremented draft revision |
| PUT same path | `{revision,action:"REVALIDATE"}` | Accept current supported configuration, increment draft revision; rejects changed/removed saved address |
| GET `/checkout/delivery-areas?query=...&offset=0` | Prefix query, 2–80 characters after trim; offset 0–10000 | `{items:[{id,name,localName,nodeType,parentName}],nextOffset}`; at most 20 rows |
| GET `/checkout/addresses?offset=0` | Offset 0–10000 | `{items:ShopperAddressDto[],nextOffset}`; at most 20 rows |
| POST `/checkout/addresses` | `{address:<delivery input plus optional label/isDefault>}` | 201 `{id}` |
| PUT `/checkout/addresses/:id` | `{revision,address:<complete address input>}` | 200 `{id}` |
| DELETE `/checkout/addresses/:id` | `{revision}` as JSON | 200 `{id}`; soft removal |

The three delivery mutation variants are mutually exclusive. The revision is a decimal **string**, shared with source edits, adoption and abandonment; there is no separate delivery version. UUIDs identify resources and are never credentials. Labels are optional, at most 60 characters; default selection is explicit. Fifty active saved addresses per Customer and existing write quotas bound account creation. First address is not silently made default. Setting a default uses existing Customers behavior and may increment other address versions. Lists sort by default descending then stable UUID; concurrent writes require refresh rather than treating offset pages as an immutable snapshot.

Saved addresses may be retained when coverage later changes; selecting them for Checkout always revalidates. Legacy incomplete/foreign saved addresses remain visible to their owner but cannot be selected until corrected. Save is a separate opt-in command; delivery PUT never changes the account address book. To save a newly entered destination, POST the reviewed input, reload its revision, and optionally select it explicitly. Do not automatically overwrite an existing account address after an in-Checkout edit.

## Current delivery state and conflict recovery

`CheckoutDeliveryStateDto` includes `draftId`, `draftStatus`, `expiresAt`, string `revision`, nullable normalized `delivery`, nullable `savedAddress:{id,selectedRevision,status}`, nullable `eligibility`, `configurationChanged`, `reviewRequired`, `quoteAvailable:false` and `purchaseAvailable:false`.

Saved association status is CURRENT, CHANGED or REMOVED. Soft removal retains the explicit purchase snapshot; no historical Order is rewritten. CHANGED/REMOVED blocks implicit REVALIDATE: select the reviewed latest account address, or explicitly PUT the retained/edited input to use it for this purchase and detach the saved association. No silent refresh from the address book occurs. Foreign-customer associations are also rejected by composite database foreign keys.

Reads and same-key replays reevaluate serviceability. A tariff, method, hierarchy or coverage change changes a server-derived configuration fingerprint and requires review, without overwriting the snapshot. Unsupported current locations report `UNSUPPORTED_AREA` and no tariff. A failed update/revalidation leaves the prior snapshot and revision intact. Expired drafts remain readable by their live owner, report EXPIRED/review required and reject new mutations; receipt replay still recovers the authorized current result.

On 409, GET current state, preserve unsent local edits privately in memory, show the conflict, and reapply only after explicit review using the new revision and a new intent key. Do not automatically replay an old body with a fresh key/revision. On timeout/503, retry the original intent before inferring failure. A rollback leaves no succeeded receipt or partial address/revision update. Network loss at COMMIT was not physically injected; exact-key API replay and database rollback/lock timeout were exercised.

Account/guest fencing uses the actual Phase 01A session/KV/guest row locks, DB-clock expiry and bounded waits. A revocation that wins first denies the delayed operation. An operation that wins first can commit before logout and its response can arrive afterward. Phase 02B must cancel and ignore old-partition responses, clear private address/form state on identity transition, and avoid shared localStorage/cache copies. This client behavior is not implemented by this backend phase. Adoption preserves the guest's explicit delivery snapshot and does not auto-save it; old guest/account B access is denied.

## Geography, coverage and tariffs

An active destination must be a district or finer supported node type, have one active Bangladesh COUNTRY root with explicit `country_code='BD'`, valid bounded/cycle-safe ancestry, confirmed coverage, and an active customer-visible HOME_DELIVERY method. Missing configuration fails closed. COUNTRY, DIVISION and OTHER cannot be selected. Existing geographic identifiers, local names and aliases are reused; no locations or provider coverage are fabricated.

Migration 3220 backfills the country mapping **only** for COUNTRY nodes with explicit `source_code='BD'`. The Geography creation interface additionally accepts an explicit ISO `countryCode`; its existing ISO-BD source-code import path sets the same mapping. Unmapped datasets require vetted authoritative mapping. The repository does not supply a verified production coverage dataset.

Existing `orders.delivery_pricing_rules` now has `checkout_serviceability`: UNVERIFIED (default), SUPPORTED, UNSUPPORTED. Existing tariffs are **not** automatically coverage approvals. Coverage resolves the nearest explicit district-or-finer policy; at the same node, highest priority then stable rule UUID wins. A locality UNSUPPORTED overrides district support. Country/division/default tariffs never establish coverage. Delivery method status can disable the entire operation. Approving SUPPORTED is a merchant coverage decision; provider compatibility is still `NOT_EVALUATED` because the current courier adapters have no authoritative reusable destination-coverage mapping. Do not display a courier guarantee/ETA from this response. Provider/payment-method compatibility must be checked by later quote/placement work when applicable.

Rate selection reuses the existing authoritative resolver: priority descending, then nearest ancestor, then stable UUID. It runs only after valid explicit coverage is established; existing broad rate policy may determine the amount for an already-supported location. Zero stays `"0.0000"`. `eligibility.tariff` includes rule UUID, string rule revision, exact amount/currency and `final:false`. It is informational and cannot become the final Checkout charge. The configuration fingerprint includes ancestry, applicable rules/coverage and method configuration, including insertion/deactivation; it is not a permanent configuration lock. Phase 03A must bind the draft revision and revalidate all inputs when producing an immutable quote and again at placement.

Existing capability-protected Admin shipping-rule POST/PATCH APIs accept optional `checkoutServiceability`; update still requires the existing version and `orders.manage`. Omitting it preserves an existing decision; new rules default UNVERIFIED. Existing listing adds `checkout_serviceability` following its existing raw-record naming. Audit includes the decision. No Admin/Storefront form is added in 02A and no real coverage is approved by this task.

Search resolves explicit policies once, carries nearest-node coverage through the active hierarchy, includes English/local/alias prefix matches, escapes SQL wildcard characters and returns bounded pages. Existing PK/parent/alias indexes and a scoped coverage-resolution index support lookup. It is one coherent SQL statement with no provider calls or per-result network queries. No private response cache or new infrastructure is introduced.

## Error contract

Foundation `{error:{code,message,requestId}}` is retained. Missing/stale authority is 401; partition conflict at transport 409; untrusted Origin 403; unavailable foreign draft/address 404; malformed/unknown/coerced input 400; stale draft/address revision, changed selected address, conflicting key and address limit 409; inactive/expired draft mutation 410; body too large 413; non-JSON 415; INVALID_CONTACT, UNSUPPORTED_AREA or DELIVERY_UNAVAILABLE 422; shared quota 429 with Retry-After; sanitized database/lock/infrastructure failure 503 with Retry-After. No phone/address/account/driver diagnostics appear in errors.

## Migration and rollout boundary

Forward migration `3220_checkout_delivery` follows inspected 3219. It adds one normalized draft snapshot relation, Customers delivery instructions, explicit geography country mapping and coverage policy on existing tariff rules. Composite tenant/draft/customer/address FKs, positive address revision, all-or-none association and bounded contact constraints protect persisted data. Existing drafts need no delivery row; existing Orders and snapshots remain unchanged. Historical migrations were not edited.

Apply 3220 once as a controlled migration job before deploying its API readers. Existing Worker/Admin/Storefront can continue using their old contracts; the predecessor `fd2cfa2e3496e2bb7a959a83fa0c41989ac41ee3` remains schema-compatible with the additive schema. Preserve the 3219 auth-fence writer requirement during any application rollback; pre-01A auth writers remain unsafe after revocations. Database rollback is not supplied: repair forward, or use a separately verified backup/restore under existing deployment controls. No deployment or persistent migration occurred here. Production retention/cleanup, real reference/coverage approval, provider capability, ingress/role and restore acceptance remain independent gates.
