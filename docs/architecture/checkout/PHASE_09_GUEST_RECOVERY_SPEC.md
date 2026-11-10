# Order-bound guest recovery: implementation-ready contract

**BLOCKED pending channel, risk, retention and support approval.** This is a
proposed interface, not an implemented endpoint or permission to send messages.
The current one-hour/original-session grant is unchanged.

## Existing authority and missing prerequisite

`checkout/placement-status.ts` requires live original Checkout authority and the
Order-bound credential, with expiry bounded by `created_at + 1 hour` and stored
guest expiry. Exact placement replay regenerates the deterministic same grant;
it does not extend its database lifetime. Account identity comes from the live
shopper session, not matching contact details. Privacy context never grants
Order access.

Shopper Auth has account email verification/recovery and an email delivery port;
Worker has a Resend adapter and notification infrastructure. They are not an
Order-bound guest identity protocol. Configuration permits SMS `none`/`mock`
and rejects production SMS without a real adapter. No approved immutable
Order-recovery channel or staff verification policy was found. A test inbox or
manually verified synthetic user cannot qualify a live channel.

Required approval: select a channel whose possession can be independently proved
and bind it to the immutable Order, including treatment of contacts never verified
at purchase, changed/recycled mobile numbers, shared mailboxes, minors and fraud.
Do not let the requester replace the channel. Ambiguous/unverified Orders require
approved staff escalation, not automatic recovery.

## Proposed customer contract

1. `POST /storefront/v1/orders/recovery/requests`: bounded Order reference and
   contact locator, strict schema, same-origin/Fetch Metadata protection and
   private/no-store/no-referrer. Contact/reference locate a candidate only.
   Return the same `202 {data:{requestId, message}}` envelope and generic copy
   for unknown, ineligible, throttled and eligible Orders. Opaque random IDs
   for all responses; avoid existence-dependent timing/delivery diagnostics.
2. Resolve only a previously approved Order-bound channel server-side. Enqueue
   a one-time challenge with a dedicated purpose, tenant, Order ID and generation.
   Outbox payload contains a challenge ID, never plaintext code/contact; the
   authorized encrypted delivery store resolves the message. No third-party
   scripts, public status lookup or tracking pixels on recovery.
3. `POST /storefront/v1/orders/recovery/verifications`: opaque request ID,
   challenge response and stable verification intent key. Uniform invalid/expired
   response; successful proof consumes the challenge transactionally and issues
   a new revocable grant scoped to this Order and permitted status/claim actions.
   Bind to the new browser session, not to the old browser's privacy cookie.
4. Grant travels in HttpOnly Secure host-only `__Host-` SameSite cookie. Never
   persist bearer in localStorage, query, logs, analytics or final artifacts.
   If a link is chosen, use fragment → same-origin POST exchange → fragment
   removal; prevent reuse, referrer disclosure and prefetch consumption.
5. Show “Check your approved contact channel” without confirming existence;
   clear private fields on owner change, expiry, revocation, pagehide and
   BFCache restore until server revalidation. Expired challenge offers explicit
   resend; uncertain verification recovers the same intent, never assumes success.

## Security/data model

New forward migration, shared DTOs and scoped semantic operations are required.
Store tenant/Order composite FK, purpose, generation, hashed challenge, attempts,
issue/expiry/consume/revoke timestamps and minimal delivery receipt. High-entropy
tokens need at least 256 random bits; short codes require a keyed hash with
random nonce and independent server secret. Constant-time comparison; expiry
uses database time; code never appears in responses/telemetry.

Proposed settings for security review: ten-minute challenge lifetime, at most
five verification attempts, issuance ceilings per Order/channel digest/browser
and trusted IP, bounded cooldown/backoff and a daily abuse ceiling. These are
security proposals, not approved live settings. Approve grant duration, scopes,
rotation, revocation propagation, retention/deletion and key custody separately.
Use durable rate counters and nonenumerating responses; do not trust forwarded
IP from arbitrary clients. Retries of delivery retain one intent; uncertain
provider delivery does not create another identity grant.

Serialize proof consumption/grant issuance with revocation and Order state.
Replays cannot mint a new grant under a changed request. Multiple failed codes,
expired or superseded generations, wrong Order/tenant/purpose, replay and revoked
sessions all deny. Cancellation/refund history stays intact and visible only
within the authorized DTO; recovery cannot alter ownership or payment evidence.

Account transition requires explicit currently verified independent proof and
customer approval. Creating an account with matching email/mobile never links
historic guest Orders. Keep the original commercial customer snapshot unchanged.

## Support and acceptance

Support uses a dedicated capability, tenant-scoped masked search and audited
escalation. Staff must follow an approved independent evidence procedure; no
grant from order+phone/name/email alone, no reading codes to callers, no exporting
full receipt/addresses into tickets. Revoke compromised grant/challenge generation
without deleting Orders or Finance evidence. Record approver, reason and outcome
without plaintext credentials.

Acceptance requires real approved channel delivery and cross-device proof,
nonenumeration/timing/rate tests, concurrent consume/revoke/resend, lost response,
stolen link/code, stale backup reconciliation, shared-device/BFCache clearing,
account transition, expiry/support exceptions and human mobile/AT usability.
Security/Privacy/Support approve the policy; the channel provider qualifies
delivery. Until then guest release remains blocked.
