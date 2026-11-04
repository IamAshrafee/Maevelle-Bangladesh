# Storefront, shopper account and Admin UX

R: use the authored Maevelle Storefront visual language, current tokens and `apps/storefront/components/ui/` primitives. Audit E01–E04/E21/E29 identify replacement targets. Keep premium feminine typography/spacing/media and existing shell behavior; do not preserve demo data, unsupported delivery/open-box promises or a separate Checkout CSS system. No wireframe here implies owner visual approval.

## Shopper flow

PDP: existing variant selectors and quantity remain. Add Buy Now only when a real eligible source can be initiated; require missing options inline and focus their group. Separate busy state for initiation, no optimistic navigation to a blank Checkout. Availability failure leaves selection visible. Add to Bag and Buy Now must remain distinct; Buy Now preserves Bag count/items on every outcome.

Bag: enable a clearly labeled Checkout action only when backend readiness and eligible complete source agree. Revalidate at click; surface stale price/line changes inline. A disabled launch state remains truthful and does not fire begin_checkout. Never clear on click, quote generation or failed placement.

Checkout common path is one page, not a mandatory multi-step wizard:

1. “Delivery details”: recipient name, mobile, searchable delivery area and street/house address. One recipient/contact identity by default. Optional email and delivery note behind modest disclosure; no forced second phone or billing section.
2. “Payment”: accessible radio choices COD/bKash/Nagad with honest due/verification description. Show only active approved methods. Manual transfer details appear **after** Order commit; before commit say payment will be verified manually.
3. Summary: actual variants/media/quantities, merchandise, named effective discounts, delivery, tax/rounding where applicable and exact total payable. Optional coupon control reuses established validation, no fake voucher suggestions. A valid zero delivery charge stays zero.
4. Terms/policy links and acknowledgement only where required by approved policy; marketing opt-in separate, optional and unchecked. Button “Place order — ৳X” with payment-specific due hint. Do not describe COD as paid or promise guaranteed fulfillment from a quote.

Mobile: one-column form, compact expandable item summary above details, full total near action. Sticky bottom action with safe-area padding and reserved layout space, never covering final fields or errors; respect on-screen keyboard. 44px design target for key touch controls. Tablet: one column until content comfortably supports form+summary; tablet landscape/zoom must not force tiny controls. Desktop: form plus 320–400px summary column, sticky only while it fits; same underlying fields/labels/IDs across all widths. Do not mount duplicate mobile/desktop form trees hidden by CSS (legacy shell currently does this). Show summary before financial commitment regardless of width.

Account: optional sign-in link without blocking guest. Authorized saved-address selector uses recipient/address cards with one default; “Use once” vs explicit “Save to my addresses” after authenticated consent. Shared create/edit address form with initial values/mode, server validation and expected version. Address chooser sheet on mobile/full dialog or inline on desktop; long address editing remains practical with keyboard. Autofill verified account info only; distinguish unverified typed contact. Address edit changes future defaults, never existing Orders. Add account Orders/history/detail/status and payment-pending follow-up inside existing `/account` workspace; paginate. Never use typed checkout phone to auto-show CRM addresses/history.

## State, errors and recovery

Server owns draft/source revision, quote and receipt. Narrow client boundary owns interaction only; use shared contract-based request adapter and focused controller/hooks. Preserve non-sensitive submission key plus draft reference in a bounded owner-partitioned journal so refresh can query/retry exact intent. Do not put contact/address, bearer, payment recipient, receipt screenshot or account profile in localStorage. Server persists valid draft sections; show saving/saved/retry state. On account switch clear local state and ignore stale responses using partition/generation guards, reusing proven Cart patterns without importing private Cart internals.

| State | Shopper response |
| --- | --- |
| Initial load / restore | Skeleton with stable dimensions; no default items, address or payable amount while unresolved |
| Validation failure | Inline errors connected with aria-describedby plus focusable summary after submission; preserve good fields |
| Quote stale/expired | Itemized changes, reason and explicit review/accept; no automatic submit loop |
| Unavailable stock/area/method | Explain affected line/area and next action; preserve other inputs; no silent substitution |
| Request pending | Prevent accidental clicks, announce progress; navigate/back safely using server state |
| Timeout/unknown | “We’re checking whether your order was received.” Recover receipt or retry identical intent; never advise making a second transfer |
| Definite noncommit | Show actionable error and retained draft; no confirmation until real receipt |
| Offline / storage failure | Show offline notice; resume server draft when possible; memory-only intent warning if persistence unavailable, never fake saved state |
| Session changed | Remove private data; sign in again or explicitly start guest; do not auto-convert account intent |
| Expired draft | Offer fresh item review; expired quote/hold is not payable instructions |

Confirmation loads a canonical committed receipt, not a current Cart. COD: reference, confirmed receipt of Order, amount due on delivery and current Order/fulfillment status. Manual: reference, payment pending, exact amount, approved account/type/name, copy controls reporting actual clipboard failure, deadline with timezone, reference field and “Submit payment reference”. After claim: pending verification, remaining balance if partial, support route if uncertain. No paid badge until authoritative verified allocation. Missing/expired authority shows recovery, not fabricated luxury receipt. Product media missing uses honest neutral placeholder, not another product's photo.

Guest status access uses the scoped grant/recovery design in MASTER_SPEC; order-number-only URLs and guessed phone are insufficient. Cross-device challenge result is uniform; delivery failures have support fallback. Account Orders visible only by explicit authenticated attribution. Changing profile phone cannot claim history automatically.

Accessibility acceptance follows [WCAG 2.2](https://www.w3.org/TR/WCAG22/) as a test target: semantic fieldsets/radios, permanent labels, autocomplete name/tel/street-address, inputmode tel, visible focus, keyboard-operable area chooser, error association and polite live regions. Dialog focus trap/return, no hover-only controls, reduced motion and readable contrast. Test 200% text / 400% zoom reflow, portrait/landscape and screen reader. Avoid coercive timers/auto-focus jumps while typing. Real-device and owner visual review remain separate acceptance.

## Admin placement and workflow

Extend existing navigation, not a new top-level Checkout console:

| Existing workspace | Add/refine workflow |
| --- | --- |
| Orders listing/detail | Method/payment/verification/age filters, allocation issues and clear next action; timeline unifies commercial events without conflating states. Confirm/hold/cancel/correct use existing dialogs and semantic commands. |
| Payments | Tabs/filters: claims to verify, due/aging, COD custody/settlement, unallocated/overpaid/late/duplicate/wrong-account exceptions and refunds. Bounded queues; drill into Order/payment context. |
| Payments settings | Approved receiving-account revisions, method availability/windows, approval and suspension actions. No raw secret exposure. |
| Orders delivery pricing / Delivery | Existing tariffs/simulator and serviceability/courier mappings; explain effect on fresh quotes and pending Orders. |
| Customers | Authorized account/address identity and delivery restrictions; no duplicate shopper identity database. |
| Analytics | Checkout funnel and separate placed/verified/collected/realized metrics, coverage and consent limitations. |
| Notifications / technical diagnostics | Failed delivery, pending outbox age and poison work; manual replay only after cause review; no business-state rollback. |

Verification detail shows claim as untrusted, Order due, destination revision, independent statement fields, duplicate matches and safe reasons. Reviewer enters actual received amount/source/time; large difference requires exception action. Mutation confirmation summarizes financial/stock consequences in plain language. Read-only staff cannot trigger financial commands via direct HTTP. Preserve reviewer disagreement/history rather than silently editing prior result.

## Authorization matrix

Existing capability names must be inventoried before migration; names tagged proposed below are design requirements, not available grants. Use current IAM capability definitions, organization and location context; authentication alone never authorizes.

| Operation | Capability / stronger control |
| --- | --- |
| View/process/hold/confirm/cancel Orders | Existing `orders.view`/`orders.manage` as applicable, PII-minimal lists; exact current grants verified in implementation |
| Review queue and claim evidence | Existing `payments.view`/`payments.verify` split if necessary into proposed review vs verify |
| Confirm receipt / record COD collection | Existing `payments.verify`, independent evidence and expected revision/idempotency |
| Refund / correction / reallocation | Existing refund command permission mapped explicitly; proposed approval threshold, MFA/reauth and separate approver for high-risk amounts |
| Destination propose/approve/suspend | Proposed `payments.destinations.manage`/`.approve`, strong reauth; emergency suspension narrowly scoped; no ordinary content role |
| Tariff/serviceability changes | Existing Orders/Delivery configuration capability; proposed narrower grant if broad `orders.manage` is excessive |
| Analytics | Existing `analytics.view`, audited restricted export, no receipt secrets |
| Worker/integration diagnostics | Existing technical capability; PII redaction, no money mutation through replay UI |
| Audit/security visibility | Existing audit/security grants, restricted access and export; immutable actor/action/reason/version history |

Admin implementation must use page-shell, Button/Input/NativeSelect/Textarea/Table/StatusBadge, semantic colors and token typography. Monetary values/IDs/dates use tabular-nums font-mono. No page-specific globals/raw CSS, transition-all or routine important. Short forms use responsive dialogs/sheets; long reconciliation forms use detail workspace. Create/edit share forms and validation. All lists have server pagination/filtering and visible empty/loading/error recovery.
