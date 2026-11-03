# Phase 01A-R security reassessment

2026-11-03 · **PARTIAL production security closure**. Focused adversarial tests
pass locally. This is source review plus runtime regression, not a full SAST-tool,
penetration-test or ASVS certification. No dependency/scanner was installed.
Existing ESLint and repository architecture/migration checks were used; no
third-party source upload. Primary guidance: [OWASP ASVS](https://asvs.owasp.org/)
and [API authorization guidance](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/).

## Findings and closure evidence

| ID / severity | Verified source; failure conditions and root cause | Mitigation and regression | Residual / status |
| --- | --- | --- | --- |
| F01 High legacy fixation/adoption (historical, already repaired in baseline dirty work) | cart-context.ts, migration3214: unproven old bearer possession cannot distinguish rightful owner from fixation; pre-cutover rows lack issuance provenance | Retain retirement/hash prefix/lifecycle trigger; exact slot binding; no adoption. DB/API credential-closure suites and populated upgrades verify no resurrection and preservation | Local security control PASS. Persistent continuity acceptance and restore replay BLOCKED for release; no independent legacy recovery proof exists |
| F02 Medium ambiguous public intent identity | cart.ts previously accepted missing keys; deterministic revision fingerprints could not represent distinct no-op intentions unambiguously to clients | Mandatory UUID key for public commands. Original unkeyed success test explicitly replaced with refusal test; explicit replay, changed payload, missing owner and Clear coverage | PASS public boundary. Internal direct-call legacy input still uses one revision-bound ledger; not exposed as a second API |
| F03 Medium invalid commercial row integrity | 1000_cart allowed fractional/excessive quantity, invalid line revisions and negative observed prices through direct SQL; customer_id FK lacked tenant scope | New3215 checks and scoped customer FK; AR05 SQL violations, AR06 populated failure/forward repair, generic upgrade fixture | PASS in isolated DB. Migration deliberately blocks incompatible real rows instead of silently repairing |
| F04 Medium unusable credential recovery | cart-context rejected fixed/malformed/retired cookies including initialize; no application reset protocol existed | Origin/JSON-protected cookie-only DELETE session; bounded cookie names; no DB mutation, no credential return. AR10/11/13 and BR04/05 | PASS protocol; frontend UX pending01B-R. Forgetting is not revocation; outstanding responses can set old slots again |
| F05 Medium resource amplification | queries.ts issued two SQL calls per line for current stock/price; bounded100 lines still multiplied DB round trips | Shared batch Pricing and stock adapters, skipped unpublished variants, query budgets; AR08 query count/plans | PASS structural reduction; distributed flooding/real load/edge proxy evidence remains PARTIAL |
| F06 High deployment trust/restore risk (verification gate) | Runtime composes one configured DB connection; local synthetic role owns test schema. Production app/Worker/migration role grants, proxy IP/TLS and revocation-on-restore are not evidenced by these tests | Keep migration/deployment isolated; require least-privilege grants, private ports, valid public origin/cookies, trusted proxy/rate-key verification and restore replay before release | BLOCKED for production readiness; no inference from local superuser tests. No infrastructure edits authorized/performed |

No newly found Critical/High exploit in the implemented guest routes is labelled
ready by waiver. F01/F06 remain explicit release gates. Stolen valid live bearer,
same-origin XSS and privileged DB compromise are residual threat classes, not
claims that HttpOnly/capability hashing eliminate those risks. The application
must retain its CSP, safe rendering, secret custody and least-privilege deployment.

## Phase 00 threat-by-threat disposition

PASS below means the named foundation control has local evidence, not that the
entire future threat family is closed. PARTIAL/BLOCKED retain the broader gate.

| Threat | Foundation control / evidence | Status and remaining boundary |
| --- | --- | --- |
| T01 tenant substitution/IDOR | Trusted context + composite FKs + exact cookie owner; DB/API foreign-owner/tenant tests | PASS guest foundation |
| T02 account switching | Strict shopper resolution, no guest fallback; actual A/B/logout/suspended-mapping API tests | PARTIAL; account Cart/merge not implemented |
| T03 CSRF | Exact configured Origin + Fetch Metadata + JSON for every mutation/reset; forged forwarded host tests | PASS local; deployed proxy/browser origins still open |
| T04 fixation | SLOT_V1 issuance, exact names, retirement trigger; closure tests + BR01 | PASS local; persistent cutover gate remains |
| T05 disclosure/hijack | Hash-only DB, no response token, production host-only HttpOnly/Secure; BR02 | PARTIAL; stolen bearer/rotation lifecycle and actual deployment not certified |
| T06 draft disclosure | Unpublished line metadata/options/media/prices redacted; pricing/stock skipped | PASS focused unpublished regression |
| T07 client money | Strict unknown-field rejection, server tenant/currency/pricing | PASS selected tampering cases |
| T08 discount stacking | Owning Promotions caps against remaining gross; foundation stack regression | PASS focused case; full promotion matrix separate |
| T09 exhaustion | Body/quantity/line/coupon/slot bounds, shared rates, bounded hydration/timeouts | PARTIAL; representative concurrent/distributed load not run |
| T10 replay | Same-lock atomic receipt/outbox, fingerprint conflicts, expiry consumed; reconnect/concurrent tests | PASS local |
| T11 partial transactions | Rollback and actual connection termination; AR01/03/04 | PASS local |
| T12 XSS | No HTML render in backend, unchanged JSON projection; existing Storefront React/CSP boundaries retained | PARTIAL; malicious-content full UI acceptance not rerun |
| T13 injection | Bound Kysely SQL values, fixed sort/order, UUID/schema validation | PASS source/invalid-input coverage; no automated SAST injection scan claim |
| T14 mass assignment | additionalProperties:false plus explicit prevalidation rejection | PASS selected API cases |
| T15 realm escalation | Existing verified shopper realm; strict missing/failed CRM mapping; account never a guest | PASS guest authorization boundary |
| T16 cache leakage | private/no-store on success/errors; Vary Cookie/context | PASS local API/browser; proxy/CDN behavior unverified |
| T17 shared Wishlist capability | No sharing token accepted as Cart authority | PARTIAL; no transfer integration introduced |
| T18 transfer intent loss | No transfer endpoint added | BLOCKED until separately implemented transfer capability |
| T19 limiter/proxy spoof | Database-shared HMAC buckets; two API instances quota test; forwarded headers confer no origin authority | PARTIAL; current untrusted forwarding may aggregate real shoppers behind gateway |
| T20 Worker forgery | Only transactional server-created Cart outbox; no new public job endpoint | PARTIAL; no Cart event consumer/retention worker introduced |
| T21 sensitive logs | Protection logs code/status/requestId and outcome operation/revision only; configured logger redacts credentials | PARTIAL; no full adversarial log-canary scan performed |
| T22 analytics forgery | No client Cart conversion ingestion added | BLOCKED until Cart analytics capability exists |
| T23 analytics privacy | No new analytics payload/destination | BLOCKED until approved analytics/privacy implementation |
| T24 destination dedupe | No provider delivery introduced | BLOCKED until Cart destination integration |
| T25 retention policy | No destructive Cart/receipt cleanup activated; expired credentials rejected at access | PARTIAL; policy and capacity monitoring required |
| T26 secret exposure | No secrets/dependencies installed; tokens omitted from API/errors; synthetic fixture only | PARTIAL; production secret custody not inspected |
| T27 restore resurrects authority | Irreversible local retirement tested; never strip retired hash | BLOCKED actual persistent restore/revocation drill |
| T28 supply chain | Existing lockfile/runtime unchanged; no installation | PARTIAL; dependency audit not run in this scope |
| T29 SSRF/unsafe consumption | No client-supplied remote URLs or provider calls; exact variant domain adapters | PARTIAL; future recommendations/transfer adapters separate |
| T30 Checkout bypass | Same strict context adapter across eight consuming verbs; guest compatibility tests | PASS guest boundary; full Checkout remains separate |

## Operational plan without activating destructive behavior

Keep expired receipts as consumed evidence. Never delete a key and thereby allow
an unknown Add to execute again. Future compaction needs permanent/minimal intent
tombstones or an independently enforced intent horizon, policy approval, bounded
ordered batches and interruption/retry tests. Preserve pre-cutover inaccessible
intent until a deliberate recovery/retention decision. Neither cookies expiring
nor status EXPIRED by itself authorizes erasure.

Cart outbox facts remain transactionally durable; existing generic consumers may
ignore/acknowledge unsupported Cart event types. There is no claim of a new Cart
analytics projector or provider delivery. Proposed operational counters: rejected
origin/session/context/quantity, key conflicts/expired replay, bootstrap rates,
429/503, lock wait/timeout, active/expired/retired Cart counts, receipt count/age,
oldest unconsumed Cart event. Exclude raw cookies, coupons, line content, account
identities and token hashes from routine metric labels/logs. No unbounded admin
listing, new scheduler or retention execution is introduced for this foundation.
