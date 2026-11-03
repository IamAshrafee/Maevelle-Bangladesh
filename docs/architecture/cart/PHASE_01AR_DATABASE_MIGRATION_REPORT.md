# Phase 01A-R database migration report

2026-11-03. Added **3215_cart_integrity**; 1000, 3213 and 3214 are byte-identical
to the task baseline. No persistent migration was applied.

New constraints: discrete quantity 1–99, positive line revision, nonnegative
non-NaN last-seen unit price; SLOT_V1 bearer authority cannot coexist with an
account owner; customer reference must match the Cart organization. A partial
customer FK index supports the new access/constraint path. Existing scoped
Cart/variant/coupon/account FKs, owner-context uniqueness, active account Cart
uniqueness and hashed-token uniqueness are retained.

The migration adds NOT VALID constraints and validates existing rows in the
same migration transaction. Bad existing data makes the migration fail and roll
back. It never truncates fractional quantities, clamps excessive quantities,
changes ownership, deletes lines, or destroys receipts. Schema-wide validation
and its locks still require a controlled migration window at meaningful volume;
NOT VALID here is not a claim of zero-lock online rollout. Lock wait is bounded
at five seconds. No line/coupon-count trigger is added: policy cardinality is
serialized by semantic Cart commands, while per-row integrity is database-owned.

## Isolated environment and checks

Created our own `maevelle-cart01ar-pg18`, labelled
`maevelle.purpose=cart01ar-isolated`, local image sha256
`5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722`.
PostgreSQL18.6; host127.0.0.1:55442 -> container5432; tmpfs storage, no mounted
persistent data. SQL verified current_database=maevelle_test/current_user=cart01ar
before tests. Each Cart fixture creates and drops a random owned
`maevelle_cart01a_<uuid>` database; it does not migrate/mutate the source template.
The upgrade harness independently creates/drops `maevelle_upgrade_<uuid>`.
No existing containers, volumes, ordinary local database, VPS or production system
were reset. Browser fixture data is synthetic and confined to the same instance.

Fresh installations: all64 migrations applied in each foundation suite.
Populated 3213/3214 upgrade preserves original lines/coupons/revisions/receipts,
retirement and tenant metadata. AR06 constructs populated3214 with a deliberately
invalid fractional legacy line: 3215 fails without changing the value; explicit
synthetic repair then succeeds, the line remains2, and reapplying runs nothing.
AR05 proves PostgreSQL rejects malformed row values and foreign customer linkage.
The generic populated upgrade harness passes13 post-baseline migrations, including
3215's added upgrade fixture. Its old Cart remains retired, with quantity intact.

## Deployment and recovery boundary — not executed

3215 is compatible with the current 3214-aware code's valid writes. Old arbitrary
fractional/excessive Cart writers will fail deliberately. API/shared Pricing
packages must be built/deployed coherently; the new API requires the exported
Clear facade. Future frontend Clear/reset adoption is additive; existing current
Storefront keyed operations work. Do not roll back only the database package
beneath an API importing its new export.

No released SHA/digest compatible with3215 is available because this entire
foundation is uncommitted. The compatibility floor is the current3214-aware
implementation with valid whole-unit commands, not baseline HEAD's old image.
Before staging: identify actual deployed ledger/image compatibility, back up,
record the candidate manifest and run preflight constraints on real data.
A timeout/validation failure stops release. Investigate and perform an explicit
forward data repair; do not weaken constraints to obtain a green deployment.
Image rollback does not reverse3215. Down migration refuses automatic weakening.
Verified restore/forward repair in the actual persistent environment remains open.

3214 is a separate irreversible security cutover already present at task start.
It retires ALL pre-cutover credentials, including older slots without persisted
provenance. Stop writers, back up, obtain continuity-loss acceptance and deploy
all readers/writers together before any persistent execution. Restore must reapply
revocation before traffic; stripping retired prefixes is forbidden. Browser reset
is not a data migration or proof-based legacy recovery path.
