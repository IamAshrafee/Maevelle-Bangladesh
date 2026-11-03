# Cart security threat model

See the [Phase 03-C integrated acceptance report](PHASE_03C_INTEGRATED_ACCEPTANCE.md) for current lifecycle, merge recovery and ownership evidence.

See the [Phase 03B Storefront report](PHASE_03B_STOREFRONT_IMPLEMENTATION.md) for the implemented authenticated Bag, explicit guest review, and owner-scoped recovery.

See [Phase 03A account ownership and merge acceptance](PHASE_03A_ACCOUNT_CART_IMPLEMENTATION.md) for the implemented backend contract, tested races and open security and release gates.

For current executed Phase 01-C coverage, see the [integrated security verification](PHASE_01C_SECURITY_VERIFICATION.md). The entries below retain their original design scope and identifiers.

Phase01B mitigation evidence: [frontend security review](PHASE_01B_SECURITY_REVIEW.md) and [browser results](PHASE_01B_BROWSER_SCENARIO_RESULTS.md). Legacy fixed-cookie adoption/retirement/fixation parity remains High/open; frontend work does not close that backend boundary.

Phase01A update: the [implemented profile](PHASE_01A_RECEIPT_AND_OWNER_CONTRACT.md), [bootstrap protocol](PHASE_01A_BOOTSTRAP_PROTOCOL.md) and [acceptance register](PHASE_01A_ACCEPTANCE_REGISTER.md) distinguish current code from this full-product proposal/historical design register. Only explicitly evidenced Phase01A coverage has run; other scenarios/threats remain unexecuted.


Design review, not penetration-test certification. Threats refer to static evidence IDs in the [audit](PHASE_00_REPOSITORY_AUDIT.md). Missing controls are proposed work, not implemented mitigations. High likelihood/impact ratings indicate meaningful public abuse/data/integrity exposure; Medium requires more constrained conditions; Low likelihood is not low impact. No confirmed Critical exploit was demonstrated. Critical is reserved for verified broad account compromise or irreversible authoritative money/inventory corruption; any such discovery immediately blocks rollout.

## Boundaries and references

Boundaries: untrusted browser/storage → same-origin Next/proxy → Fastify; guest bearer → Cart; verified shopper realm → tenant account/CRM; Admin realm → scoped capabilities; Cart application → Catalog/Pricing/Promotions/Inventory; transaction → receipt/outbox; Worker lease → projection/cleanup; consent gate → external providers; operational database → logs/backups. Underlying IAM credentials are shared across realms; distinct cookies/HMAC storage isolate sessions, not separate identity databases.

Research checked 2026-11-02: [OWASP ASVS 5.0.0](https://asvs.owasp.org/) for technical verification; [API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/) for object/property/function authorization, resource and business-flow abuse, configuration, inventory and provider risks; [WSTG 4.2](https://wstg.owasp.org/v4.2/) and [session test index](https://owasp.github.io/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/06-Session_Management_Testing/README) for executable attack journeys. ASVS V7 session guidance and WSTG session fixation/CSRF tests inform cookie/claim controls. These are applicability mappings, not a claim of ASVS certification or exhaustive requirement-ID compliance. Phase07 must pin exact applicable ASVS requirement IDs against implemented controls and retain test evidence.

## T01 — Tenant substitution / IDOR

- **Actor / entry point:** Guest or shopper; creation/current/line/receipt endpoints.
- **Asset / trust boundary:** Tenant/cart ownership; browser→API→DB.
- **Likelihood / impact:** High / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E08/E10/E15/E16; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Configured tenant binding and composite ownership constraints.
- **Mitigation:** Resolve context server-side, scope all queries and FKs; generic foreign-ID denial.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Substitute org/account/cart/line IDs across every endpoint.
- **Residual risk:** Privileged database compromise bypasses app checks.
- **Phase / reference mapping:** 01A/01B; API1/API3; ASVS authorization; WSTG authorization.

## T02 — Account switching queued-request takeover

- **Actor / entry point:** Shopper; pending old-owner request sent with new cookie.
- **Asset / trust boundary:** Account Cart privacy; session→command.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E23/E26/E49; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart owner precondition and generation control.
- **Mitigation:** Require ownerContext server check; UI epochs, pause and segregate journals.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** A prepared intent delivered under B cookie writes neither B nor unauthorized A.
- **Residual risk:** Already authorized A commit may finish on A; must never appear on B.
- **Phase / reference mapping:** 01A/03A/03B; API1/API2; ASVS session/authorization; WSTG session.

## T03 — CSRF / origin bypass

- **Actor / entry point:** External site; cookie mutation.
- **Asset / trust boundary:** Shopping intent; browser→API.
- **Likelihood / impact:** High / Medium. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E07/E09; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart paths absent from strict origin protection.
- **Mitigation:** Require exact configured Origin, JSON, Fetch Metadata and same-origin proxy; distrust forwarded host.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Evil/missing/null origin, form content type and spoofed forwarding denied.
- **Residual risk:** Same-origin XSS can submit legitimate requests.
- **Phase / reference mapping:** 01A/01B; ASVS browser security; WSTG-SESS-05; API8.

## T04 — Guest session fixation

- **Actor / entry point:** Attacker; planted cookie/token.
- **Asset / trust boundary:** Guest capability→account transition.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E07/E10/E22; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Rotation/merge revocation and host cookie.
- **Mitigation:** 32-byte random token, host-only Secure cookie, rotate on legacy migration and revoke claim atomically.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Preplanted/merged token never authenticates account Cart.
- **Residual risk:** Stolen live guest token remains bearer credential until revoked.
- **Phase / reference mapping:** 01A/03A/03B; ASVS V7; WSTG-SESS-03; API2.

## T05 — Guest token disclosure/hijack

- **Actor / entry point:** Script/proxy/log reader; cookie transport.
- **Asset / trust boundary:** Cart intent and privacy; browser/proxy/storage.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E07/E47; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart-wide no-store, safe header/error behavior verification.
- **Mitigation:** HttpOnly/Secure/Lax; no token in URL/localStorage/body/event; redact logs; TLS proxy checks.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Inspect errors, logs, cache and analytics payloads for canary token.
- **Residual risk:** Compromised browser/device or trusted proxy remains powerful.
- **Phase / reference mapping:** 01A/01B; ASVS V7/data protection; WSTG-SESS-04.

## T06 — Unpublished merchandise disclosure

- **Actor / entry point:** Known-variant guest; Cart GET.
- **Asset / trust boundary:** Catalog private data; Catalog→Cart response.
- **Likelihood / impact:** High / Medium. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E12/E13/E54; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Read-time publication/coherence enforcement.
- **Mitigation:** Catalog eligibility adapter redacts blocked lines; do not hydrate draft media/price.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Unpublish saved item; direct GET/summary must not reveal draft payload.
- **Residual risk:** Previously public metadata may already be known to shopper.
- **Phase / reference mapping:** 02A/02B; API3; ASVS authorization/data protection.

## T07 — Client price/discount manipulation

- **Actor / entry point:** Malicious shopper; JSON mutation.
- **Asset / trust boundary:** Money truth; browser→commerce.
- **Likelihood / impact:** High / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E15/E18/E20; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Strict allowlist schemas/DTOs for all new routes.
- **Mitigation:** Reject price/totals/discount/account fields; recompute via Pricing/Promotions.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Tamper prices/totals and compare persisted/outcome truth.
- **Residual risk:** Owning-domain bugs remain possible and need invariant tests.
- **Phase / reference mapping:** 01A/02A/02B; API3; ASVS validation/business logic.

## T08 — Stackable discount integrity

- **Actor / entry point:** Shopper/configuring staff; coupon sequence.
- **Asset / trust boundary:** Nonnegative merchandise net; Promotions→Cart.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E19/E20; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Combined cap on original-gross allocations.
- **Mitigation:** Fix Promotions once, remaining-gross or per-line cap, deterministic allocation.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Two high percentages/fixed stacks never exceed eligible gross.
- **Residual risk:** Business policy choice of stack order still needs explicit semantics.
- **Phase / reference mapping:** 02A/04A/04B; ASVS business logic; API6.

## T09 — Quantity/line/payload exhaustion

- **Actor / entry point:** Bot; public create/add/batch.
- **Asset / trust boundary:** Pool/CPU/storage; internet→API/DB.
- **Likelihood / impact:** High / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E08/E09; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart quotas, integer length/value and line/batch caps.
- **Mitigation:** 64KiB, 99 units, 100 lines, batch 50, max key length; reject before costly work.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Giant digit strings, UUID arrays and many creates across two API processes.
- **Residual risk:** Distributed botnets need adaptive operational limits.
- **Phase / reference mapping:** 01A/01B; API4/API6; ASVS validation; WSTG business logic.

## T10 — Idempotency abuse/replay

- **Actor / entry point:** Malicious/retrying client; all mutations.
- **Asset / trust boundary:** Exactly-once intent effect; API→receipt/DB.
- **Likelihood / impact:** High / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E15/E17; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Mandatory receipt on every mutation and immutable outcome.
- **Mitigation:** Atomic claim scoped owner/cart generation + body hash; safe replay before version, tombstones.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Concurrent same/different key bodies, stale expected version after commit, aged replay.
- **Residual risk:** Finite retention means client replay window must be enforced.
- **Phase / reference mapping:** 01A/01B; ASVS business logic; API6.

## T11 — Race/partial transactions

- **Actor / entry point:** Concurrent shoppers/Worker; edit/merge/cleanup.
- **Asset / trust boundary:** Cart integrity; command→DB.
- **Likelihood / impact:** High / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E15/E21; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Account lock order, merge atomicity and cleanup recheck.
- **Mitigation:** Locks + expected version + deterministic order; receipt/outbox in same transaction.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Barrier/fault injection after each write and Worker activity selection.
- **Residual risk:** Stock can change after snapshot; Cart never guarantees reservation.
- **Phase / reference mapping:** 01A/03A/03B; ASVS business logic; WSTG concurrency.

## T12 — XSS in title/options/media/errors

- **Actor / entry point:** Malicious content editor; rendered data.
- **Asset / trust boundary:** Session and UI; Catalog→browser.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E09/E34; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart-specific output/context and URL tests.
- **Mitigation:** React escaped text, allowlisted Media rendition paths, no dangerous HTML; CSP verified at page proxy.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Script/attribute/URL payloads inert; status text escaped.
- **Residual risk:** Trusted script compromise remains out of scope for escaping alone.
- **Phase / reference mapping:** 02A/02B; ASVS encoding/browser; WSTG input validation.

## T13 — SQL injection / unsafe sort

- **Actor / entry point:** Client; IDs/coupon/admin filters.
- **Asset / trust boundary:** Database; API→SQL.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E15/E50; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Strict new filter schemas and query review.
- **Mitigation:** Kysely parameterization; whitelist dynamic identifiers/sorts; no concatenation.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Injection payloads yield safe 4xx, no SQL error leakage or altered tenant.
- **Residual risk:** SQL credentials compromise remains a separate boundary.
- **Phase / reference mapping:** 01A/06A; ASVS injection; WSTG-INPV; API8.

## T14 — Mass assignment

- **Actor / entry point:** Client; body extra properties.
- **Asset / trust boundary:** Owner/version/currency/privilege fields.
- **Likelihood / impact:** High / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E08/E25; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Strict Cart schemas and explicit mapping.
- **Mitigation:** additionalProperties false; explicit command fields; identity derived only.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Send ownerId/status/discount/organization/version overflow fields.
- **Residual risk:** Future contract expansion requires review.
- **Phase / reference mapping:** 01A/01B; API3; ASVS validation.

## T15 — Admin realm / function escalation

- **Actor / entry point:** Staff or shopper; admin routes.
- **Asset / trust boundary:** Private diagnostics/settings; auth→IAM.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E22/E23/E44; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart capabilities and scoped Admin APIs.
- **Mitigation:** Shopper and Admin resolvers isolated; explicit grants, tenant scope; no general staff Cart edits.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Shopper/Admin cookie swap and orders.view-only grants denied.
- **Residual risk:** Authorized high-privilege insider still requires audit/detection.
- **Phase / reference mapping:** 03A/06A/06B; API2/API5; ASVS authorization.

## T16 — Sensitive cache poisoning/leakage

- **Actor / entry point:** User/cache intermediary; GET/receipt/error.
- **Asset / trust boundary:** Private snapshot; API/proxy/browser cache.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E25/E45/E46; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart private no-store on every route, summary and errors.
- **Mitigation:** No public RSC cache/session payload; no-store and Vary Cookie; cache never key solely URL.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Two owners behind proxy cannot receive each other cached body.
- **Residual risk:** Browser back-forward screenshot/device access needs UX clearing.
- **Phase / reference mapping:** 01A/01B; ASVS data protection; WSTG session; API8.

## T17 — Shared Wishlist capability misuse

- **Actor / entry point:** Recipient/attacker; batch share import.
- **Asset / trust boundary:** Sender privacy, recipient Cart; share→Cart.
- **Likelihood / impact:** Medium / Medium. **Severity:** Medium; medium because exposure is constrained or principally affects recoverable observations/intent; impact still requires closure.
- **Existing verified protection:** E27; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart explicit recipient identity/variant batch contract.
- **Mitigation:** Share read only, recipient own Cart, never log share token; validate fresh catalog choices.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Revoked/foreign share, spoofed price/variant/owner body rejected.
- **Residual risk:** Recipients can intentionally add public products as ordinary shoppers.
- **Phase / reference mapping:** 04A/04B; API1/API3/API6.

## T18 — Transfer loses item / deletes newer units

- **Actor / entry point:** Concurrent customer; Wishlist transfer retry.
- **Asset / trust boundary:** Shopping/saved intent; Wishlist↔Cart.
- **Likelihood / impact:** Medium / Medium. **Severity:** Medium; medium because exposure is constrained or principally affects recoverable observations/intent; impact still requires closure.
- **Existing verified protection:** E25/E26; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Durable save-first operation and guarded remove.
- **Mitigation:** Intent result, save acknowledgement then line-version removal; partial state visible.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Fail second operation; concurrently add units; recovery never deletes new units.
- **Residual risk:** Temporary duplicate in both lists is accepted and explicit.
- **Phase / reference mapping:** 04A/04B; ASVS business logic; WSTG workflow.

## T19 — Rate-limit bypass / spoofed client IP

- **Actor / entry point:** Bot; multiple API nodes/proxy headers.
- **Asset / trust boundary:** Availability; internet→proxy→API.
- **Likelihood / impact:** High / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E09; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart in shared quotas and proxy validation.
- **Mitigation:** Postgres atomic counters per hashed IP/owner/op; trusted proxy allowlist; fail closed for writes.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Two-process shared cap; spoof X-Forwarded-For cannot reset counters.
- **Residual risk:** NAT sharing may need tuned quotas and support recovery.
- **Phase / reference mapping:** 01A/07A; API4/API8.

## T20 — Worker job forgery / replay

- **Actor / entry point:** Compromised queue actor/operator; redrive payload.
- **Asset / trust boundary:** Cart cleanup/projections; job→domain.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E17/E43; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart handler allowlist and payload/tenant checks.
- **Mitigation:** Validate tenant and job type, lease compare-and-set, bounded retries; authorized audited redrive.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Foreign-tenant malformed/expired lease replay has no side effect.
- **Residual risk:** Worker DB role compromise can exceed normal handler scope.
- **Phase / reference mapping:** 03A/06A/07A; API5/API10; ASVS secure architecture.

## T21 — Sensitive logging / error trace

- **Actor / entry point:** Staff/log collector; failures.
- **Asset / trust boundary:** Tokens/PII; API/Worker→logs.
- **Likelihood / impact:** Medium / High. **Severity:** Medium; medium because exposure is constrained or principally affects recoverable observations/intent; impact still requires closure.
- **Existing verified protection:** E47; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** New receipt/cookie serializers coverage and low-cardinality metrics.
- **Mitigation:** Log correlation/operation/outcome only; redact token and account data; no full body dumps.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Canary credentials absent from logs/traces/errors under all failures.
- **Residual risk:** Operational logs still contain metadata; restrict retention/access.
- **Phase / reference mapping:** 01A/05A/06A; ASVS logging/data protection; API8.

## T22 — Forged analytics / fake conversion

- **Actor / entry point:** Bot or buggy browser; event ingestion.
- **Asset / trust boundary:** Metric integrity; browser→Analytics.
- **Likelihood / impact:** High / Medium. **Severity:** Medium; medium because exposure is constrained or principally affects recoverable observations/intent; impact still requires closure.
- **Existing verified protection:** E38/E41/E42; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Committed Cart outcome authority and observation separation.
- **Mitigation:** Server domain outcome is authoritative, bounded consented browser exposure only; dedupe projection.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Forge ADD_TO_CART with no receipt cannot become trusted Cart demand.
- **Residual risk:** Consented browser view observations inherently less trustworthy.
- **Phase / reference mapping:** 05A/05B; API6; ASVS business logic.

## T23 — Analytics PII/consent leakage

- **Actor / entry point:** Vendor/third-party script; dispatch.
- **Asset / trust boundary:** Shopper privacy; system→external vendor.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E38/E39/E40; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Actual consented destination adapters and withdrawal suppression.
- **Mitigation:** Purpose gating at capture/dispatch; minimal fields; no email/phone/token/account ID by default.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Unknown/denied/revoked captures zero vendor requests; inspect payloads.
- **Residual risk:** Legal basis and provider retention need owner/privacy sign-off.
- **Phase / reference mapping:** 05A/05B; ASVS data protection; API10.

## T24 — Destination retry/dedupe failure

- **Actor / entry point:** Network/provider; dispatch retry.
- **Asset / trust boundary:** Analytics integrity and resource budgets.
- **Likelihood / impact:** High / Medium. **Severity:** Medium; medium because exposure is constrained or principally affects recoverable observations/intent; impact still requires closure.
- **Existing verified protection:** E40/E42/E43; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Destination delivery receipts/retry budgets.
- **Mitigation:** Same event ID/name, single GA4 path, bounded backoff/dead-letter; no external call under cart lock.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Provider timeout duplicates transport but no new domain event or changed IDs.
- **Residual risk:** Third-party exactly-once cannot be guaranteed; reconcile discrepancies.
- **Phase / reference mapping:** 05A/05B; API10; ASVS communication.

## T25 — Unsafe config / retention weakening

- **Actor / entry point:** Staff; config endpoint.
- **Asset / trust boundary:** Security invariants and privacy.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E44; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart config allowlist/version/audit/hard ceiling.
- **Mitigation:** Separate settings capability, version lock, reason/audit; cannot disable CSRF/auth/quotas entirely.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Try setting infinite retention/units or disabling ownership/origin protection.
- **Residual risk:** Approved policy defaults still need operational monitoring.
- **Phase / reference mapping:** 06A/06B; API5/API8; ASVS configuration.

## T26 — Secret/environment exposure

- **Actor / entry point:** Developer/operator; config/image/deploy.
- **Asset / trust boundary:** Provider keys/credentials; repo→runtime.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E47; deployment strategy; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart-specific key/destination controls not implemented.
- **Mitigation:** Existing config/encryption/redaction; no secrets in Git/browser bundles; separate staging/prod and test destinations.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Static output review and synthetic logging tests; no production connections.
- **Residual risk:** Host/secret-store compromise requires separate recovery.
- **Phase / reference mapping:** 05A/07A/08; ASVS configuration/cryptography; API8.

## T27 — Retention/backup restores access

- **Actor / entry point:** Operator or backup thief; restore/erasure.
- **Asset / trust boundary:** Private intent/credential hashes; DB→backup.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E16; deployment strategy; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart purge/revocation replay and policy acceptance.
- **Mitigation:** Minimize retained payloads, encrypted controlled backup, deletion/revocation ledger reapplied on restore.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Disposable expired/deleted-account restore cannot revive access.
- **Residual risk:** Backups retain data for approved finite horizon.
- **Phase / reference mapping:** 03A/07A/08; ASVS data protection; WSTG configuration.

## T28 — Dependency/supply-chain compromise

- **Actor / entry point:** Dependency maintainer/build attacker.
- **Asset / trust boundary:** All application trust boundaries.
- **Likelihood / impact:** Low / High. **Severity:** Medium; medium because exposure is constrained or principally affects recoverable observations/intent; impact still requires closure.
- **Existing verified protection:** E01–E05 manifests; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** No dependency scan run; future changes require current official docs.
- **Mitigation:** Pinned lockfile, compatible stable versions, CI audit/secret checks and immutable images.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Focused dependency audit at change/release; scrutinize any new package.
- **Residual risk:** Scanner cannot detect all malicious or unpublished vulnerabilities.
- **Phase / reference mapping:** 01A/07A/08; ASVS secure architecture/configuration; API8.

## T29 — Recommendation/provider SSRF or unsafe consumption

- **Actor / entry point:** Client/third party; suggestion/media/delivery inputs.
- **Asset / trust boundary:** Internal network/data; API→provider.
- **Likelihood / impact:** Low / High. **Severity:** Medium; medium because exposure is constrained or principally affects recoverable observations/intent; impact still requires closure.
- **Existing verified protection:** E28/E46; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Cart adapter strict context and failure budget.
- **Mitigation:** No client fetch URL, internal typed domain query, Media-owned URLs; validate provider payloads.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Arbitrary URL/host input rejected; malformed suggestion cannot become trusted SKU.
- **Residual risk:** Existing non-Cart remote fetchers require own audit.
- **Phase / reference mapping:** 04A/05A/07A; API7/API10; ASVS API/communication.

## T30 — Legacy Checkout bypass and rollback mismatch

- **Actor / entry point:** Old client/service; legacy guest Cart consumer.
- **Asset / trust boundary:** Ownership/business state; Cart→Orders/schema.
- **Likelihood / impact:** Medium / High. **Severity:** High; high because the condition can breach ownership, monetary integrity, privacy or sustained availability on a public/privileged path.
- **Existing verified protection:** E35/E36/E37; consult evidence ledger for exact inspected source, with no runtime security claim.
- **Missing protection:** Compatible owner-aware facade and phased rollout evidence.
- **Mitigation:** Preserve legacy DTO/status, enforce equal tenant security; no account-token bridge; migration-first expand.
- **Responsibilities:** Backend enforces policy/transactions/authorization; frontend handles safe rendering, owner isolation and explicit recovery. Worker owns leased processing where applicable; infrastructure owner verifies TLS/proxy/backup boundaries at release.
- **Attack/abuse test:** Old consumer contract fixtures and new-owner denial; disable feature on schema-compatible image rollback.
- **Residual risk:** Actual Checkout completion/security remains separate project.
- **Phase / reference mapping:** 01A/08; API9; ASVS architecture/business logic.

## Measurable release conditions

Every T01–T30 has an implementation owner/evidence link at its assigned A/B gate. No unresolved Critical or High finding may pass production readiness; exploitability uncertainty affecting ownership, money, private caching or public abuse counts as unresolved, not a waiver. Medium/Low residual findings need explicit severity/rationale, compensating control, owner and due date; product completeness defects still block their capability gate.

Require adversarial tenant/account/guest/session/cookie/origin matrices for all route variants and errors; race barriers proving receipt/domain/outbox atomicity; multi-API shared-limit evidence; canary log/privacy tests; representative payload/load/Worker budgets; dependency review at change; natural/revoked session expiry and owner-switch browser proof. Preserve separately open Wishlist/customer identity/provider/privacy gates where they intersect Cart. No production/staging testing is authorized by this document. All controls begin in the first applicable phase; 07 is regression and hardening, not permission to postpone security.

## Phase01A.1 local closure update (historical entries retained)

T04: fixed-cookie acceptance, slot renaming and unproven bearer adoption are removed through explicit retirement and persisted SLOT_V1 issuance.3214 prefixes old hashes and prevents resurrection; no guest/account claim or merge occurs. T05: actual HTTPS Chrome verifies host-only __Host/Secure/HttpOnly/Lax/path/expiry and no JS token visibility. Old credentials cannot replay, including under a renamed slot. T30: all eight Checkout Cart-consuming routes resolve the same configured tenant/currency and strict shopper authority; accounts are controlled unavailable, failures never become guests.

[Audit/matrix](PHASE_01A1_LEGACY_CREDENTIAL_AUDIT.md), [tests](PHASE_01A1_TEST_EVIDENCE.md), [acceptance](PHASE_01A1_ACCEPTANCE_REGISTER.md). These targeted local controls pass; operational cutover, inaccessible legacy-state policy and functional account compatibility remain PARTIAL. Stolen live new bearer, same-origin compromise, actual deployment TLS/proxy and future Phase03 merge/revocation retain their separate threat obligations. No blanket production security closure is asserted.
