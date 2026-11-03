# Phase 01A-R foundation reassessment

2026-11-03 · **PARTIAL** · local implementation verified; production release readiness is not established.

The current source includes the original 01A/01B work AND the later uncommitted
01A.1 security cutover. Reports saying fixed-cookie adoption remains supported
are superseded. This review preserves the historical results rather than
rewriting them. This report and the [decision record](PHASE_01AR_ARCHITECTURE_DECISIONS.md)
describe the current implementation; the roadmap is not a product scope limit.

## Source reassessment

| Boundary | Actual implementation and assessment | Disposition |
| --- | --- | --- |
| Persistence | One normalized Cart/line/coupon model, exact variant UUID, unique variant per Cart; organization-scoped FKs and public owner-context precondition. Whole-unit limits existed only in TypeScript; customer link lacked tenant FK. | IMPROVE: migration 3215; retain tables and monetary scale |
| Guest authority | 32-byte opaque bearer, hash-only persistence, per-Cart cookie names, database SLOT_V1 provenance, irreversible retirement; independent requests cannot prove shared identity. | KEEP and harden recovery; reject fixed-cookie adoption |
| Account authority | Existing verified shopper realm/customer-account mapping, composite owner FK and active-account uniqueness; API explicitly refuses account Cart operations. | KEEP foundation, do not claim account persistence/merge |
| Lifecycle | ACTIVE/CONVERTED/ABANDONED/EXPIRED, hard credential expiry, same-lock retirement. No automated Cart deletion. | KEEP; retention requires business policy |
| Commands | Cart row lock before revision/receipt; atomic domain/outbox/receipt; repeated command callbacks redundantly selected/locked the same row. No atomic Clear. | REFACTOR callbacks to receive authorized context; implement Clear |
| Receipts | Platform uniqueness scoped by tenant, owner, operation and key; canonical fingerprint; immutable outcome plus fresh view. Expired records remain consumed. | KEEP, use wall-clock expiry after waits |
| Queries | Bounded hydration, repeatable-read GET; per-line stock and price round trips (2N), even though Cart size is bounded. | REPLACE per-line reads with authoritative batch adapters |
| API | Encapsulated protections and error mapping mixed into route definitions; optional public intent key kept obsolete consumer semantics. | REFACTOR protection module; RETIRE unkeyed public commands |
| Recovery | Invalid/fixed/retired cookie failed closed indefinitely, with no explicit app protocol to forget that browser capability. | IMPROVE: cookie-only reset, preserve all data |
| Checkout | Shared strict context adapter across eight existing Cart-consuming routes, same guest facade, account fail-closed. | KEEP; no Checkout implementation added |
| Promotions | Existing engine evaluates eligible stock/priced lines and caps allocations against remaining gross. | KEEP; not a new discount engine |
| Observability | Safe code/status/revision logs, transactional outbox, database connection-loss reporting. No Cart-specific cleanup worker. | KEEP; plan bounded lifecycle controls without activating deletion |

## Material decisions and limitations

The Cart is customer intent, not a price quote or inventory reservation. Stock
and price may change after an evaluation. Decimal strings/four-place bigint
calculations remain authoritative; no float money is introduced. Changes to
prices do not manufacture customer intent revisions. Shared Cart IDs and owner
contexts remain public preconditions, never bearer authority.

Limits remain 100 distinct variants, 99 units per line and 10 selected coupons.
Quantity/revision/price/tenant integrity is enforced in PostgreSQL. Aggregate
line/coupon policy limits are enforced under the shared Cart lock by semantic
commands; direct arbitrary SQL is not a supported application interface.

Standalone GET uses a repeatable-read snapshot. Mutations use READ COMMITTED
with the owner row locked before receipt and revision handling. Commerce reads
in a mutation can observe newer external catalog/pricing/inventory commits;
the response is advisory, not an atomic multi-domain quote. No external provider
calls occur under the Cart lock. Two-second lock/five-second per-statement
budgets bound ordinary database waits; these are not total transaction deadlines.

The legacy retirement migration 3214 already present at task start preserves
intent but makes pre-cutover guest data inaccessible without independent proof.
That is a real continuity limitation. Resetting cookies creates an independent
session; it does not recover ownership. Persistent cutover approval, backup and
restore/revocation verification remain blocking for release. Account support,
merge, full Checkout, payments, reservations and destructive retention are outside
this assignment and are not represented as completed features.

## Integration and performance findings

Catalog and media hydrate once per projection. Pricing now owns a shared batch
resolver, while its single resolver delegates to the identical temporal rule.
Stock groups inventory levels by exact variant in one query. Promotions still
runs once per projection. The price/stock adapters reject more than 100 variants;
unpublished lines skip both and redact private metadata. Eight SQL statements
were observed for 1/20/100-line hydration; timings/plans are in
[performance evidence](phase01ar-evidence/performance.json). This is synthetic
local evidence, not a high-concurrency or production-cardinality benchmark.

No Redis, queue, service, dependency, authentication realm or second Cart store
was introduced. No production/shared database, VPS, deployment, commit or push
operation occurred. See the [acceptance register](PHASE_01AR_ACCEPTANCE_REGISTER.md)
for the precise distinction between implemented foundations and open gates.
