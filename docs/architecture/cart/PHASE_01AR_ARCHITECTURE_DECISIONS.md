# Phase 01A-R architecture decisions

2026-11-03. All decisions apply to the inspected dirty source at baseline HEAD
`aa290065407030e85b5b6847efd22fb437a65279`, not a claim about deployed staging.

## ADR AR-01: keep capability slots and an establishment barrier

Current: unique host-only HttpOnly cookie per server-issued Cart; subsequent
request must return the cookie. Browser coordination reduces cold initializations,
but API correctness does not depend on coordination being available.

Alternative: one fixed session cookie plus a Web Locks/single-flight barrier.
That lowers normal cookie/parser/UI complexity and can make the common path
cheaper, but cookie-less requests from separate tabs, unsupported/denied locks,
network retries and late responses cannot be correlated securely. A late
Set-Cookie can silently switch authority after an acknowledged write. A
client-generated correlation ID would require a distinct proven server capability
and protocol, not merely an ID. A dedicated session table with Cart references
would add joins, lifecycle/migration work and still need a cold establishment rule.

Decision: KEEP slots and explicit selection. Deterministic independent bootstrap
means independent empty Carts; never pretend to merge their identity. Selected
contexts must be backed by a matching cookie. Multiple contexts produce a bounded
409 context list. Read never initializes. Cookie rejection means mutations fail
SESSION_ESTABLISHMENT_REQUIRED. A lost response with persisted cookie reuses it;
without cookie, a retry creates independent empty intent. No acknowledged write
can occur before the capability round-trip. At 32 valid slots bootstrap refuses
rather than silently evicting a Cart. Cookie loss/eviction loses guest access;
there is no false durability claim across browser deletion.

Security: production __Host-/Secure/HttpOnly/Lax/Path=/; no Domain, JS token,
public-ID adoption or fixation bridge. Existing 3214 revocation is retained.
Testing: actual database-backed concurrent cold calls, delayed-response arrival,
replay/expiry, actual HTTPS browser cookie acceptance and rejection. Migration
cost: none for slots; explicit reset endpoint is additive. Frontend complexity:
retain existing shared controller, select ambiguity explicitly, add deliberate
session reset UI in 01B-R. No automatic reset on a transient error.

## ADR AR-02: semantic relational commands, not generic CRUD/event sourcing

Current: normalized Cart aggregate, exact variant lines and coupon references,
Cart-row serialization and scoped FKs. Alternatives: JSONB document CAS (simpler
single-row writes but weaker relational integrity and expensive whole-document
updates); event-sourced Cart (durable intent history but projections/rebuilds and
operational complexity); Redis-first storage (new dependency/durability boundary).

Decision: KEEP normalized PostgreSQL. Improve constraints through new migration
3215, keep 1000/3213/3214 immutable. Clear is a semantic command removing lines
and coupon selections atomically. Command callbacks receive the already locked,
authorized context instead of re-resolving it. This reduces work and makes the
transaction boundary visible without creating micro-classes or a generic CRUD
service. Existing Orders consumer response shapes stay compatible.

Security: same-tenant customer/variant/cart/coupon references; SLOT_V1 cannot
simultaneously be account-owned. Test DB constraints and populated upgrades,
rollback and same-owner races. Invalid historic rows stop migration; no rounding,
truncation, ownership inference or deletion. Upgrade requires explicit repair of
actual data, not a migration that hides its inconsistency.

## ADR AR-03: retain platform transactional receipts

Alternative: desired-state-only PUT makes quantity retries simple but cannot
represent incremental Add/new intentions; Redis TTL keys introduce a non-atomic
cross-store commit; storing full response snapshots freezes stale catalog/price
and private merchandise. A separate Cart receipt model duplicates the platform.

Decision: KEEP atomic shared ledger and immutable outcome/fresh evaluation.
Uniqueness is tenant/Cart/operation/key, not a global key. Same key in a different
operation is a different namespace; clients must still create one UUID per user
intention. Same operation/key with changed payload or expected revision conflicts.
Resolve replay before revision checks. Seven-day outcome recovery is retained;
expired keys stay consumed indefinitely, pending approved retention/tombstone
policy. No-op receipts are real consumed intents with no revision/event. Retire
unkeyed public mutation semantics; the current frontend already sends keys.
Internal legacy direct-call fallback remains a narrow compatibility input shape,
using the same ledger and owner/revision protections. RETIRE legacy Add-receipt
lookup: 3214 revokes every pre-cutover capability, so no supported authority can
reach those receipts. Historical records stay stored; no second replay branch or
legacyReceipt response flag remains. Migration regression still proves old
credentials cannot replay or expose retained data.

Correctness/operational tradeoff: one hot Cart serializes; independent owners do
not. Duplicate waits are bounded by lock timeout, then 503/same-key retry.
READ COMMITTED + row lock avoids a mandatory Serializable retry layer. Automatic
new-key retries are forbidden. Test multiple pools, duplicate storms, reconnect,
rollback, actual connection termination, mismatch, expiry and stale desired state.

## ADR AR-04: batch owning-domain reads, not Cart-owned commerce copies

Current: 2N inventory/pricing selects plus bounded projection/promotion reads.
Alternative: materialized Cart prices/stock or cross-domain Redis cache lowers
latency but needs invalidation and can incorrectly imply reservation/quote.

Decision: REPLACE per-line round trips with bounded batch selection inside the
existing Pricing and Cart inventory adapter boundaries. Single and batch pricing
share one implementation. Repeatable GET keeps one database snapshot; external
commerce changes do not increment intent revision. Security: server-selected
currency/tenant, publication redaction and no client money. Test temporal parity,
100-line constant query count and current price/stock regressions. No data migration.

## ADR AR-05: explicit cookie forgetting; no unproven legacy recovery

Alternative: auto-adopt/rotate fixed bearer, attach guest data on sign-in or
silently delete invalid cookies and initialize. These either promote unproven
ownership or conceal continuity loss. Blocking every subsequent request forever
is secure but offers no app recovery workflow.

Decision: ADD origin-protected DELETE /carts/session. It expires only recognized
Cart cookie names, never reads/adopts old tokens, and never deletes stored intent
or receipts. The frontend must explain that fresh shopping is independent and
clear old pending journals before proceeding. More than 33 names refuses with
browser-settings recovery instructions. Concurrent old responses may reintroduce
old slots, so reset requires quiescing requests and a fresh read; it is not global
revocation. A stolen valid cookie remains valid until expiry/retirement. True
cross-device revocation/rotation belongs with the later ownership lifecycle.

## ADR AR-06: protect routes by composition; no new Worker infrastructure

Decision: REFACTOR transport protection/error/logging into cart-protection.ts;
keep route schema/projection and context resolution explicit. Preserve strict
existing shopper mapping and read-only Checkout adapter. Account paths return
controlled unavailable, never guest fallback.

Worker alternatives: scheduled deletes simplify disk pressure but can erase
receipts and resurrect retries, or destroy unapproved legacy data. Separate
queue/microservice adds operational work without a demonstrated need. KEEP
existing outbox and safe logging; plan bounded inspection/cleanup only after
policy approval. No cleanup is activated. Monitor receipt growth, orphan empty
bootstrap Carts, lock/statement timeouts, 409/429/503 rates and outbox lag before
release. Database role separation and restore replay require deployment evidence.

## Primary references

Reviewed [PostgreSQL 18 isolation](https://www.postgresql.org/docs/18/transaction-iso.html)
and [row locks/deadlocks](https://www.postgresql.org/docs/18/explicit-locking.html).
Security review uses [OWASP API Security](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)
and [ASVS 5.0](https://asvs.owasp.org/) as review guidance; this is not an ASVS certification.
