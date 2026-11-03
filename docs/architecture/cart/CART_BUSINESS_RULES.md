# Cart business rules

## Commands and quantity

| Command | Intent / atomic behavior | Failure and UI recovery |
| --- | --- | --- |
| Add | Increment exact variant by positive units; new line if absent; shared key once per user intent | Reject if new total > live ATS or configured cap; keep current line unchanged |
| Set / plus / minus | Set is desired absolute quantity; +/- may queue a desired value from latest confirmed line, coalescing unsent sets only | Do not coalesce submitted increments; stale version refetch/review; quantity 1 minus does not silently delete |
| Remove / clear | Desired absent / entire empty; no-op yields successful receipt without event/revision | Undo is a new add of removed reference/quantity under fresh price/stock, not resurrection of old price |
| Variant change | Same product eligible variant; remove source + combine target atomically, sum quantities | Reject unsupported option combination; preserve source on target stock/cap failure |
| Validate / restore | Fixed-time batched current evaluation; restore only unexpired owner Cart | Explain changes and retain unavailable references; never automatically reserve or purchase |
| Wishlist add | Resolve explicit preferred variant if still eligible; else variant picker; keep saved product | One-unit increment per explicit action, not product-ID line identity |
| Recommendation add | Recommendation is a suggestion, not authorization; resolve explicit eligible variant at mutation | Failure does not alter existing Cart or block page |
| Shared Wishlist batch | Recipient owns resulting Cart; <=50 explicit variants per command, stable entry IDs | Picker/review for ambiguous variants; partial results explain added/rejected; never import sender identity or capability as authority |
| Move to Wishlist | Save first, await durable acknowledgement (guest browser persistence is explicitly local), guarded removal second | Save failure leaves Cart; remove failure keeps both and offers retry removal; changed source line requires review, never delete newly added quantity |
| Coupons | Explicit normalized selected codes, re-evaluate schedule/targets/thresholds/stackability on every projection | Show rejection/expiry; never claim applied solely because code exists; no redemption/usage-counter changes |

Default new user commands never silently clamp. Merge may preserve requested quantity above stock to avoid lost intent, with needs-review; configured hard safety caps trigger review before merge consumption. Live stock decreasing does not mutate quantity or silently drop lines. Users may remove unavailable/unpriced/unpublished lines and reduce excessive quantity; reductions should not be blocked by unrelated Catalog ineligibility (unlike existing set guard). Backorder/preorder is denied unless Inventory explicitly supplies that entitlement in a future authorized policy.

## Exact money and evaluation

Existing authoritative amounts are `numeric(20,4)` and decimal strings; reuse owning Pricing resolver (effective definition per org/variant/currency) and Promotions evaluator/allocator (audit E18–E20/E52). Parse with existing decimal4 integer arithmetic, never floating-point multiplication or rounding client totals. For q whole units, gross = scaled unitPrice * q. Promotion percentage truncates to four decimals per current evaluator; largest-remainder allocation with stable line IDs distributes that discount exactly. **Required owning-domain fix:** sequential stackable promotions must allocate against remaining eligible gross or cap aggregate per line; `0 <= totalDiscount(line) <= gross(line)` and sum allocations equals total. Cover exclusive/stackable ordering and fixed discounts larger than merchandise.

BDT is configured currency, no automatic conversion. Format display with shared Money/Price and the approved currency display policy; decimal4 totals remain exact DTO truth. Do not round each display row then sum independently. If business requires two-decimal payable totals, Checkout/finance owns final quantization and explicit reconciliation; Cart must label merchandise estimate, never invent payment rounding. Tax inclusion policy is not verified and must be confirmed before production pricing copy; Cart returns no calculated tax/charge or delivery quote.

Current price is always recomputed; last_seen_unit_price/acknowledged definition is only notice baseline. Show old/new price notice when definition changes, including during quantity editing. Version protects intent; evaluation fingerprint protects external changes. No permanent price lock. Revalidation and mutations return current price without implying user accepted a future payable amount; Checkout will require its own fresh acknowledgement.

Visible merchandiseGross/net summarize priced requested intent including stock-blocked priced rows, with explicit excluded/needs-review labels; eligibleMerchandiseNet separately totals only eligible lines with their own eligible promotion evaluation. Unpublished/discontinued/unpriced rows contribute zero to aggregate and return null per-line price (not a false free item). Promotion qualification uses eligible lines only. State totals purpose clearly; never sum a display-only invalid price into payable truth. All invalid lines block readyForFutureCheckout until repaired/removed. Empty Cart is also ineligible.

## Inventory authority

Inventory provides tenant-scoped sellable-minus-reserved availability for storefront-eligible locations, excluding damaged/quarantine/inactive/nonfulfillable positions; raw sum currently in Cart must move behind that policy. Inventory must confirm eligible-location policy rather than assuming all warehouses. Floor nonnegative ATS to discrete units. Cart writes no inventory transaction, reservation, allocation or payment state. Many carts may show the same last unit, so availability is an advisory snapshot. Future Checkout independently validates/reserves through Inventory semantic operations.

## Cross-domain guarantees

No batch partial database commit: BEST_EFFORT business rejections and applied entries are one transaction/outcome/revision; a database error rolls all back. Transfer workflow partial success is explicit and recoverable, unlike a failed atomic Cart command. Coupons do not migrate automatically from guest over account choices. Restores/merges/validation never become new AddToCart analytics. All entry surfaces call the same shared Cart command and server rules; client disables impossible choices for usability only.
