# Checkout Phase 06B backend handoff

Phase 06A adds three private API operations under `/storefront/v1/checkouts/:id/order-payment`. The path parameter is the Checkout draft UUID returned by the existing Checkout API. All three resolve the committed Order and its original payment intent on the server. Use the existing `{ data }` and `{ error: { code, message, requestId } }` envelopes.

| Method and path suffix | Request | Success data |
| --- | --- | --- |
| GET on the base path | No query or body | `CheckoutOrderPaymentDto` |
| POST `/claims` | UUID `Idempotency-Key`, JSON `SubmitCheckoutPaymentClaimDto`, exact Storefront Origin | `CheckoutPaymentClaimDto` |
| GET `/claims` | Original UUID `Idempotency-Key` header | Current `CheckoutPaymentClaimDto` for that submission |

`GET /placement` remains the receipt and order confirmation read. New routes are implemented in the API. Phase 06B needs to wire any Storefront proxy and client integration and test the actual browser path.

## Credentials and recovery

- Account requests use the live shopper cookie and current `X-Shopper-Partition`. Account and Customer attribution come from the authenticated session and the committed draft. Discard private view state on logout, partition change or account switch.
- Guest requests use the original live guest Checkout cookie and `X-Checkout-Context` plus the draft-specific Order HttpOnly cookie from placement. Server-side access expires at the earlier of one hour from commitment and original Checkout-session expiry. Revoking that session disables the grant. Exact authorized placement replay can reissue the original cookie within the server window.
- With the live guest credentials, recover the order payment view on the same device by reading the same draft UUID. An expired grant, lost guest session or changed device requires a support escalation under independent identity checks. Automated cross-device recovery, independent rotation and committed guest Order adoption are blocked pending verified Order-bound proof and policy. Account verification alone supplies no authority over guest Order history.

## Amounts, instructions and review

- `originalPayable` is the exact BDT decimal committed in final terms. `outstanding` is the current Payments balance. `allocated` is the confirmed amount applied toward the Order. `refundedFromAllocation` is the completed refunded amount attributable to that allocation. Wallet receipts reflect independently verified current confirmed receipts associated with the bound intent.
- `unallocatedAtVerification` reports the part of current confirmed receipts that was unallocated at verification. It is historical allocation context. Display current refund lifecycle separately using `refundStates`; the value does not state a refund amount due. `hasLateReceipt` and `hasReceiptReversal` identify exceptions.
- Show Order status, payment status and obligation status independently. COD is payable on collection and has no wallet instructions or claim form. The Order's COD collection state comes from Payments allocations. Courier custody and merchant remittance remain separate operator facts.
- Render the wallet number, recipient, action and text only when `transferAvailability` is `AVAILABLE` and `instructions` is present. The backend requires the original approved revision, compatible active method and Finance account, policy provenance and matching snapshot. A changed, suspended or retired destination suppresses instructions. A pending claim also suppresses instructions. Already-transferred customers who can no longer submit should use support.
- Display submission and review deadlines separately. The server evaluates expiry from database time. An open review can continue after submissions close. This does not extend the submission deadline or reopen a cancelled Order.
- The POST accepts only `transactionId` and optional `sendingMobile` in local Bangladesh format `01[3-9][0-9]{8}`. The reference accepts 4–128 ASCII letters, digits or hyphens after trimming. Case is preserved. Keep amount, destination, screenshots and authentication secrets out of the form.
- A claim response contains its ID, submission time, attempt status and review state. Show pending verification, review in progress, correction requested, escalation, or resolution from those fields. Treat current monetary status as a separate read. The response excludes the original transaction ID, sending mobile, internal notes and independent evidence.

## Retry and failure handling

Keep one UUID per logical claim and reuse that UUID and canonical body for an exact in-memory retry. If the response is uncertain or the page reloads, reconcile using GET with the UUID header or the latest/open claim summaries from the base GET. Retaining a short-lived non-authorizing intent UUID is sufficient for targeted reconciliation. Private claim contents and bearer credentials belong outside web storage. A 404 from claim recovery can also mean the first transaction is still uncommitted. Re-read or retry the same logical submission while authorized. A changed body using the same key gets `IDEMPOTENCY_CONFLICT`. A different key with the same exact pending or verified reference gets `CLAIM_ALREADY_SUBMITTED`.

| Result | Handling |
| --- | --- |
| 400 `INVALID_REQUEST` | Correct the input or missing key. |
| 401/409 authority errors | Refresh the current authority and clear prior private state. |
| 404 `NOT_FOUND` | Order access or claim is unavailable. Avoid inferring whether unrelated records exist. |
| 410 `ORDER_GRANT_EXPIRED` or `PAYMENT_WINDOW_EXPIRED` | Stop transfer prompts. Preserve existing claim review history when still authorized. |
| 409 `COD`, `PAYMENT_METHOD_UNAVAILABLE`, `DESTINATION_UNAVAILABLE`, `ORDER_CANCELLED`, `PAYMENT_ALREADY_SETTLED`, `PAYMENT_SUPPORT_REQUIRED` | Refresh status and show the relevant collection, settlement or support guidance. |
| 409 `CLAIM_ALREADY_SUBMITTED`, `CLAIM_LIMIT_REACHED`, `IDEMPOTENCY_CONFLICT` | Read current claims. The existing intent limit is five unresolved claims. |
| 429 `RATE_LIMITED` | Honor `Retry-After`. Claims use a durable 12 POSTs per minute per tenant and trusted client IP. Reads share 120 per minute. |
| 503 `POLICY_BLOCKED`, `CHECKOUT_DISABLED`, `UNAVAILABLE` | Show unavailable or retryable infrastructure status based on the code. Preserve the intent UUID when the outcome is uncertain. |

## Activation and browser acceptance

The production Checkout gate and the hard-disabled payment resolver prevent public ordering, transfer instructions and fresh shopper claims. The eligible path runs with isolated synthetic configuration. Activation requires approved BDT tax, invoices, fees and rounding, verified bKash and Nagad provider/account actions, destination and Finance eligibility, real carrier/COD serviceability, payment and review windows, and privacy/retention approval.

Exercise committed guest and account Orders, Buy Now and Cart, COD, eligible/expired/suspended/settled wallets, partial/excess/late and reversal/refund presentation, correction, unknown response and reload, multi-tab duplicate prevention, guest-grant expiry and logout/account switch. Verify proxy origin/metadata, cache, logs, and cookie handling before using private endpoints in a browser. Check screen reader announcements, focus and keyboard recovery, native zoom, physical touch devices, copy affordances, and status comprehension. Keep prior browser and owner gates open until verified.
