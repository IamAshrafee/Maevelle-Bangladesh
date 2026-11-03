# Cart master specification

> Frontend implementation notice (2026-11-03): [Phase01B-R](PHASE_01BR_IMPLEMENTATION_REPORT.md)
> and its [state/recovery contract](PHASE_01BR_STATE_AND_RECOVERY_CONTRACT.md) supersede
> unsupported-Clear/reset frontend assumptions. One controller now integrates
> the unchanged01A-R atomic Clear and cookie-forgetting API. Full account/merge,
> Checkout and complete AT/device/release acceptance are not claimed.


> Current implementation notice (2026-11-03): [Phase01A-R](PHASE_01AR_IMPLEMENTATION_REPORT.md)
> and its [API/frontend profile](PHASE_01AR_API_AND_FRONTEND_CONTRACT.md) are authoritative
> for the implemented guest foundation. Retain the full-product design below;
> fixed-cookie adoption, optional public intent keys and legacy receipt replay
> are superseded. Atomic Clear and explicit cookie-only session forgetting now
> exist. Account Carts/merge and complete Checkout are not implemented by01A-R.


Status: proposed implementation blueprint, 2026-11-02. Phase 00 does not implement or certify Cart. [Audit](PHASE_00_REPOSITORY_AUDIT.md) is authoritative for existing behavior; other documents below describe proposed behavior unless explicitly labeled existing.

## Product contract

Cart preserves shopping intent for guest and verified account shoppers, resolves exact variants, presents current server prices and availability, supports editing/recovery, integrates Wishlist/Recommendations/Promotions, and supplies private operational/reporting surfaces. It works with Checkout disabled. It never collects addresses, creates orders, reserves inventory, initiates payments, records COD collection or claims purchase completion.

A complete capability means its A backend and B frontend pass the integrated gate against the real backend. Historical MVP/deferred labels do not constrain this product. Existing Checkout code is a compatibility dependency, not authority to extend Checkout now.

## Requirements and traceability

| Requirement | Authoritative specification | Scenarios | Phase / acceptance |
| --- | --- | --- | --- |
| R01 Safe foundation, contracts and migration | [Data](CART_DOMAIN_AND_DATA_MODEL.md), [API](CART_API_CONTRACTS.md) | S01–S05, S35–S39, S59 | 01A/B; AC01, AC02 |
| R02 Variant commerce, quantities, money/stock | [Rules](CART_BUSINESS_RULES.md) | S06–S15 | 02A/B; AC03 |
| R03 Guest/account ownership and lifecycle | [System](CART_SYSTEM_ARCHITECTURE.md), Data | S16–S27, S34 | 03A/B; AC04, AC05 |
| R04 Wishlist, batch, recommendation, coupons | Rules, [UX](CART_STOREFRONT_UX_ARCHITECTURE.md) | S28–S33, S44 | 04A/B; AC06 |
| R05 Internal/external measurement | [Analytics](CART_ANALYTICS_TRACKING_SPEC.md) | S40–S43 | 05A/B; AC07 |
| R06 Private operator experience | [Admin](CART_ADMIN_UX_ARCHITECTURE.md) | S45–S48 | 06A/B; AC08 |
| R07 Security/reliability/accessibility/performance | [Threats](CART_SECURITY_THREAT_MODEL.md), [Performance](CART_SEO_PERFORMANCE_SCALABILITY.md) | S01–S58 | Every phase; 07A/B; AC09–AC11 |
| R08 Independent Cart and future Checkout | [Handoff](CART_CHECKOUT_HANDOFF_CONTRACT.md) | S49–S52 | 01–08; AC12 |
| R09 Release evidence, privacy and recovery | [Roadmap](CART_MASTER_IMPLEMENTATION_ROADMAP.md) | S53–S58 | 08; AC13 |

Scenario register contains concrete acceptance for each case. AC IDs in this table are future implementation gates, distinct from P00 acceptance entries. Security threats T01–T30 supplement scenario tests and apply from the first relevant phase.

## Decision log

| ID | Decision / recommendation | Alternatives and rationale | Follow-up |
| --- | --- | --- | --- |
| D01 | Server-authoritative guest + account Cart | Browser authority cannot safely merge across devices or protect money; PostgreSQL already available | Accepted architectural default |
| D02 | Existing dedicated guest capability, hardened | Wishlist guest journal contains no server Cart credential; auth session alone cannot restore anonymous shopping | Cookie/proxy browser evidence in 01B/03B |
| D03 | Own by customer_account UUID, tenant scoped | CRM customer can have other links; user UUID alone lacks tenant context | Reuse verified shopper resolver, 01A/03A |
| D04 | One ACTIVE account Cart per organization/account/currency | Multi-cart UX unsupported by credible current need; future currency extension explicit | BDT configured storefront initially |
| D05 | Merge sums variant quantities without losing excess intent | max() undercounts deliberate shopping; overwrite destroys account intent; silent stock clamp loses intent | Show needs-review excess; validate with owner in 03B |
| D06 | Missing/unpublished merchandise becomes redacted unavailable line | Hiding silently loses intent; exposing draft metadata leaks Catalog data | Catalog eligibility adapter in 02A |
| D07 | Version + immutable receipt outcome + fresh evaluation fingerprint | Revision alone misses external price/stock changes; latest view alone cannot prove original mutation | 01A/02A shared DTO review |
| D08 | Cart-to-Wishlist save-first resumable orchestration | Cross-domain monolithic transaction incompatible with local guest Wishlist; remove-first loses item | 04A/B reconciliation tests |
| D09 | 100 lines, 99 units/line, batch 50; 30-day guest/180-day account inactivity | Limits bound cost without stock reservation; values are proposed business defaults | Owner may tune within hard ceilings before 06 acceptance |
| D10 | 7-day recoverable receipt outcomes, 180-day consumed-intent tombstones | Short TTL can replay unknown operations; permanent rich payload retention harms privacy | Privacy/retry-window review; never auto-replay >7 days |
| D11 | Recommendations extend owning engine, exclude Cart products | Running PDP queries per line creates coupling and expensive repeated work | 04A contract |
| D12 | Retain legacy Checkout facade until separate migration | Existing order tests/imports prove coupling; schema removal unsafe | Compatibility tests in 01A; separate Checkout project |
| D13 | Provider tracking disabled until consent/config/docs verified | No current active adapters; Meta primary documentation fetch returned HTTP 429 | Blocks provider activation, not core Cart |
| D14 | Merchandise-only totals; no invented tax/delivery quote | No verified Cart tax policy; shipping needs destination/Checkout authority | Business tax/display review before production; no address collection |

D09/D10/D14 are explicit recommended defaults with policy review pending, not discovered business settings. Phase 01A can proceed using defaults, but production retention/privacy and external activation cannot pass on assumptions.

| ID | Decision / recommendation | Alternatives and rationale | Follow-up |
| --- | --- | --- | --- |
| D15 | New slot bootstrap backend implemented; legacy adoption PARTIAL | Browser-wide lock + verified cookie round trip and server owner fencing are recommended; lock-only coordination cannot prove safety when unavailable. Avoid key-as-credential recovery or populated-owner cookie replacement | Controlled-order API/DB S59 passed in01A; legacy retirement and real-browser01B still open |
| D16 | Typed fail-closed shopper resolution | Current resolver catches session errors to null; an authenticated-looking request must not silently become guest during auth-storage outage | Implemented strict Cart resolver and owner preconditions in01A; account Cart remains explicitly gated until03 |

D15 now has an implemented slot protocol with controlled API ordering evidence. Complete legacy adoption/security parity remains PARTIAL; see the Phase01A report. D16 changes the Cart integration contract around the shared resolver; do not alter Wishlist authentication behavior incidentally.
