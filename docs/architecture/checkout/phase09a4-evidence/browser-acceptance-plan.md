# Permitted-environment browser acceptance plan

**NOT VERIFIED at the browser layer in09A.4.** The09A.3 automatic rejection of the isolated Next runtime (`blocked by policy`) remains an execution restriction. No alternate shell/wrapper, policy change, process impersonation or attachment of synthetic data to another application's runtime was attempted.

Inspected pathways: `scripts/checkout-phase09a2-runtime.mjs` creates a disposable PostgreSQL fixture and actual Fastify API; `scripts/checkout-phase09a2-browser.mjs` drives CDP but assumes existing Next apps and a dedicated browser profile. `scripts/ci-checkout-readiness.sh` runs nonpublishing Node checks/builds in Linux, not browser acceptance. These do not supply a separately permitted Next startup pathway here. Source/component/controller/API results must remain separate from browser evidence.

## Preconditions in a separately permitted execution environment

1. Obtain permission for the actual Next runtime on that environment; this document is not permission and does not override the rejection.
2. Reproduce the final executable source hash and toolchain in the09A.4 ledger. Use only dedicated loopback PostgreSQL18 and fresh random databases, synthetic identities A/B and Admin actors in two organizations, and a dedicated Chrome/Chromium profile.
3. Check all required ports before startup. The existing harness expects Storefront3000, Admin3001, API3002 and CDP9238, and current Next rewrites use those API ports. Use a dedicated environment with those ports free, or make explicitly reviewed test-origin configuration changes and rebuild there. Never repoint a shared app or kill an unrelated process.
4. Build the actual apps with public Checkout preview false. Use the existing synthetic fixture credentials helper, not production secrets. Keep tokens/cookies/mailbox and fixture connection strings out of screenshots/logs/reports. Store only sanitized case outcomes and source identity.
5. Seed accounts/organization capabilities and private records through supported fixture/domain operations. Any simulated policy is SYNTHETIC; real HTTP application must remain POLICY_BLOCKED. Do not add a production policy override or a test control route to deployed registrations.
6. Use DevTools/CDP request interception to pause a response **after the actual API authorized it**, then switch owner and release it. Check actual backend denial separately. Record response status, sanitized projection and visible UI; abort alone is not proof of isolation.

## Required journeys

Every row is currently **NOT VERIFIED** in an actual09A.4 browser. Lower-layer evidence is in `broad.json`; it is not a substitute for these steps.

| # | Browser steps and frontend acceptance | Independent backend acceptance |
|---|---|---|
|1|Save a guest Wishlist item; sign in through Account UI; explicitly complete supported merge/review. Verify guest references survive uncertainty and accepted receipt controls final state.|Live shopper session owns account list; Admin cookie/foreign partition cannot mutate it.|
|2|Pause A's Wishlist response; begin account transition; sign in as B; release A response. A's items/count/undo/share controls must never reappear.|B cannot read/mutate A's account/share records.|
|3|Show a private fixture Checkout through supported development components; log out while visible. Delivery/contact/payment state hides immediately and stays hidden after refresh.|Expired/revoked shopper session denied; no implicit downgrade to a guest grant. Public Checkout remains blocked.|
|4|Pause private Order-payment read for A; switch to B; release response. No A amount, claim, destination or recovery state appears.|B has no authority over A's Order, including an older guest Order without its grant.|
|5|Pause an Admin financial read for org A; select org B through supported organization controls; release it. A's amount/history/evidence remains hidden.|A resource ID queried in B is404 or a documented empty tenant-scoped collection; capabilities are evaluated for B.|
|6|Open policy workspace; revoke that actor's capability using a separate authorized synthetic actor; refresh/focus the page. Hide policy/evidence/actions after revalidation.|Subsequent discovery/proposal/review/mutation requests denied despite the older UI.|
|7|Navigate away from a private page, switch owner/logout, then Back/Forward. Previous private content must not reappear from retained route state.|Document/RSC/private fetches reauthorize and use private/no-store.|
|8|Background a tab, revoke its session in another authorized synthetic context, then resume. Hide private content pending recheck and show recovery/denial.|New sensitive requests reject the revoked session. Do not claim instantaneous retraction of previously delivered data.|
|9|Use an Order-specific guest grant, expire it in the isolated fixture, then re-read/retry.|Grant expiry/revocation denies; phone or Order number never substitutes for proof.|
|10|Pause an analytics event, withdraw consent, release pending work; confirm preference UI and dispatch outcome.|Server consent revision/withdrawal prevents unauthorized dispatch. No live provider adapter may receive a request.|
|11|Open payment-policy details, change account/capabilities, then release an old pending read.|Current capabilities govern all new sensitive commands; approval never enables activation.|
|12|Load cash history, switch organization during a pending page read, then retry pagination.|Bounded tenant-scoped history; foreign evidence/Finance references never appear.|
|13|Read shopper confirmation/payment/rounding views with valid limited authority.|Customer DTO excludes staff reasons, approval/invoice provenance and internal policy/Finance evidence.|
|14|Force an actual lookup failure in supported tracking/payment routes.|UI reports unavailable/recovery; no invented receipt, courier, rider, estimate or successful payment.|
|15|Refresh an existing authorized synthetic confirmation repeatedly without placing a new public Order.|No duplicate conversion, receipt, Payment or Finance posting. Domain/outbox IDs remain stable.|

Record keyboard/focus,320/390/768/1024/1280 widths, long identifiers, safe error states and reduced-motion observations when actually exercised. Native zoom, human assistive technology and physical touch/iPad remain separate actual-observation gates. Stop only assignment-owned processes/profile and drop only its random databases/container. A browser failure requires source reconciliation and affected verification again, not a screenshot fabricated from component output.
