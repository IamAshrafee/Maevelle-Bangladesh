# Phase 09A.1 financial policy and backend report

2026-11-10, Asia/Dhaka. **PARTIAL locally; release, public purchasing and real collection BLOCKED.** No commit, push, publication, deployment, persistent migration, VPS change, real payment/refund or marketing activation occurred. Existing dirty 09A work was preserved.

## Baseline and architecture

Actual branch `main`, HEAD `947c2964979ac7e22135146a123d8ebf32ede6aa`; entry contained uncommitted 09A changes. Source migration tail was `3225_privacy_preferences`, 74 registered migrations, 51 immutable baseline migrations. Added forward-only `3226_retail_money_settlement`: now 75. No applied historical migration or accepted hash was rewritten. Synthetic PostgreSQL 18 databases were created on a task-owned loopback cluster; persistent environments were not migrated.

Shared exact string contracts live in `packages/contracts/src/retail-money.ts`; BigInt arithmetic reuses existing cart money parsing. Monetary database precision is retained, including costing/valuation. Prepared whole retail authoring validation and a bounded read-only fractional-price audit cover selling/compare-at/shipping records. They do not silently change existing prices or wire new validation into every legacy authoring surface. A normalization proposal is in the decision register; actual persistent Catalog audit is NOT VERIFIED.

Versioned whole rounding records BDT, unit, mode, aggregate boundary, signed treatment, invoice reference and approval provenance. HALF_UP is a synthetic candidate, not business approval: 80.4→80, 80.5→81, 80.6→81, 99.99→100. EXACT refuses a fraction. Fractional discounts, taxes and allocations remain precise; one final adjustment is applied after the full calculation. No per-line rounding. Negative corrections are symmetric in the primitive; negative sales are not enabled. New final commitments must be whole BDT, including the retained exact-policy path; historical snapshots remain unchanged. Missing/unresolved tax or policy evidence fails closed, never silently becomes zero.

Final terms preserve subtotal, discount, shipping, tax, payment fees, precise payable, rounding, final payable and policy snapshot. Order/intent use that exact final payable. Maevelle wallet surcharge remains zero; this is not an assertion about provider fees. Orders and analytics facts now persist tax/fee/rounding components with matching equations. A trigger protects commercial amounts on whole-policy Orders. Partial line amendment of these Orders is blocked until approved invoice/allocation correction exists; full cancellation preserves original terms.

## Cash settlement and conservation

`payments/cash-shortfall/` separates policy approval, transactional commands, history/read models and collection correction. Immutable proposed/approved policy revisions require explicit limits, eligible states, effectivity, accounting/invoice/courier references and independent policy approval. New restricted capabilities separate adjustment management, adjustment approval, policy management and policy approval. Existing correction authority handles compensating records. No production threshold, role grant or approver is inferred from fixtures.

An application requires a genuine confirmed delivered COD receipt allocated to the same organization and Order, a positive whole residual exactly matching the requested reduction, current approved policy, reason and collection evidence. Requests above self-limit remain pending independent review. Server actors, immutable evidence, per-Order gross limits and per-requester UTC-day gross budgets prevent silent edits/backdating and repeated-limit bypass. Reversals do not replenish gross limits. Policy effectivity is rechecked after locks; the database additionally constrains applied financial evidence.

Stable idempotency fingerprints bind canonical intent. A requester budget advisory lock and Order→intent→receipt locking serialize competitors; request, application, Finance memorandum, intent state, audit and outbox commit together. Deferred database checks bind the receipt, Order, policy, Finance identity and residual equation. There is no new global Finance lock or numbering scheme: the 09A transaction-backed FIN sequence is reused.

The actual tested example is:

| Record | Result |
|---|---|
| Original Order and obligation | 81.0000 BDT |
| Confirmed COD collection | 80.0000 BDT; one real receipt |
| Authorized synthetic waiver | 1.0000 BDT; separate immutable identity |
| Current customer due | 0.0000 BDT |
| Classification | SETTLED_WITH_ADJUSTMENT; cash-based payment status remains PARTIALLY_PAID |
| Courier custody | 80.0000 BDT until settlement; no invented Maevelle cash |
| Waiver Finance cash entries | None; non-cash operational memorandum only |

For this pre-refund case, original obligation = actual collection + effective waiver + remaining due. Refunds are separate genuine cash outflows, capped by refundable receipts and tracked independently; they do not turn the waiver into money or automatically create a new receivable. Approved return/invoice and rounding-allocation treatment is still required.

The existing Finance model is an operational account/cash ledger, not a general receivables/double-entry ledger. New `CUSTOMER_BALANCE_WAIVER` and reversal transactions preserve document number, source identity and evidence without financial-account entries. They are explicitly `NON_CASH_OPERATIONAL_RECORD_ONLY`. No guessed expense, tax journal, revenue recognition or credit note is posted. Full accounting integration/classification is **BLOCKED**, not claimed complete.

Customer collection 80 versus instructed 81 requires approved courier permission and evidence. Customer collection 81 / remittance 80 instead leaves courier receivable 1 using existing settlement accounting; a customer waiver is rejected. COD net collection above due is rejected: cashier change/tender workflow is not newly implemented. Wallet receipt claims remain unverified until independent confirmation; wallet underpayment cannot use this waiver and excess remains in existing liability/refund handling.

Waiver correction appends compensating evidence and a non-cash counter-memorandum, reopening the residual. An unposted/unremitted COD collection correction appends linked waiver reversals, reverses the receipt, reopens the intent and emits the existing reversal event atomically. This requires independent collection correction authority. Already-posted/remitted or refund-encumbered corrections fail closed pending Finance reconciliation; no cash ledger is silently undone. Adjustment history survives Order closure. Inventory, promotions and original commercial history are not changed by waiver/correction.

Owning transactions emit operational audit/outbox identities. The waiver is not mapped to PAYMENT_VERIFIED, COD_COLLECTED or a second conversion. Real collected 80 remains the sole COD_COLLECTED fact. GA4/Meta dispatch remains disabled. Private API responses are no-store, organization/capability-scoped and paginated; explicit prevalidation rejects injected authority fields instead of allowing Fastify to strip them. No private reason/evidence is exported to public analytics.

## Activation, compatibility and verification

Public placement still uses its disabled policy engine. Exported new waiver application/approval commands bind to a disabled resolver: even recorded BUSINESS or SYNTHETIC policy approvals cannot activate them. Only explicitly imported internal test engines exercise synthetic application. Existing reversal remains available for correction. No new override flag or active collection destination was added.

Migration 3226 adds component columns/equations, immutable policy/request/application/reversal evidence, tenant-bound references, constraints, indexes and capabilities. Existing fractional Orders survive the populated upgrade unchanged. New API reads depend on the new waiver function; old Worker projection logic is not an approved processor for new rounded/tax-bearing Orders. Plan migration before new API/Worker and coordinated contracts/clients. Image rollback does not reverse migration; down is deliberately unsupported. Actual old/new immutable-image compatibility, Linux CI, target upgrade and forward-repair/restore operations remain NOT VERIFIED. No deployable candidate SHA/digest was manufactured.

Executed local evidence:

| Check | Actual result and limit |
|---|---|
| Broad nonpublishing selected regression | 459 passed / 1 failed, 44 files, 460 cases. Failure exposed unknown approval-field stripping at API boundary; explicit prevalidation fixed it. Broad suite was not rerun wholesale. |
| Final focused regression | See sanitized [verification ledger](phase09a1-evidence/verification.json): final exact test names/counts. Includes placement, cash settlement, API, retail money/audit and fresh migrations after correction. Counts overlap broad coverage and are not added together. |
| Tooling tests | 28 passed in broad readiness run. |
| Populated upgrade | 24 post-baseline migrations passed, including retained fractional 3226 fixture; no-op migration rerun twice passed. |
| Production builds | Admin and Storefront passed individually after contract changes. No new frontend/browser workflow accepted. |
| Types/source guards | Final results in verification ledger; history baseline preserved, source/secrets/hardening and focused lint/format checks run. |
| Physical recovery | Real PostgreSQL before-COMMIT rollback and after-COMMIT lost response recover the original adjustment with exact retry. Not just a thrown application mock. |

An initial broad failure and its correction are retained as evidence rather than relabeled a fully green broad run. Native devices, accessibility, real courier/provider operations, posted COD correction, full invoice/refund allocation, persistent Catalog normalization and live accounting remain outside verified evidence.

## Required monetary and settlement cases

PASS below means the stated local scope only. Unit coverage is distinguished from actual PostgreSQL coverage.

| Case | Result | Evidence / limit |
|---|---|---|
| 1 Integer price | PASS | Actual placement and authoring audit tests. |
| 2 Fractional internal cost | PASS | Existing costing column precision + exact numeric probe; no valuation rewrite. |
| 3 Fractional discount | PASS | Actual promotion .6000 preserved before final rounding. |
| 4 Synthetic VAT component | PASS | Actual placement 79.99 + .41 tax = 80.4 → 80; no legal applicability claim. |
| 5 Zero shipping | PASS | Whole-policy placement fixtures. |
| 6 Zero discount | PASS | Whole-policy placement fixtures. |
| 7 Zero payable | PASS | Actual zero Order/intent placement. |
| 8 Round down | PASS | Actual 80.4→80. |
| 9 Round up | PASS | Actual 80.6→81. |
| 10 Half boundary | PASS | Actual 80.5→81. |
| 11 Negative correction | PARTIAL | Exact primitive unit tests; no approved negative invoice workflow. |
| 12 Large amount | PARTIAL | Exact BigInt boundary unit test; not an actual large-value Order. |
| 13 Multiple quantities | PASS | Actual 3 × 33.3333→100. |
| 14 Multiple line allocations | PARTIAL | Existing multi-line placement regression; approved whole-taka line/refund allocation absent. |
| 15 Promotion discount | PASS | Actual fractional promotion/final terms. |
| 16 Refund rounding residual | BLOCKED | Receipt cap enforced; invoice/line residual allocation needs approved policy. |
| 17 Payable=obligation | PASS | Actual Orders, intents and analytics rebuild agree. |
| 18 Integral customer contract | PARTIAL | New final terms whole; fractional legacy exact commitment rejected. UI integration pending. |
| 19 81/80/1 | PASS | Real COD receipt and transactional synthetic policy. |
| 20 81/81 | PASS | No residual; waiver rejected. |
| 21 81/79 | PASS | Outside explicit synthetic threshold rejected. |
| 22 Unapproved policy | PASS | Exported commands policy-blocked even with fixture approval. |
| 23 Unauthorized operator | PASS | Capability and tenant rejection. |
| 24 Expired approval | PASS | Expired policy rejected. |
| 25 Already settled | PASS | Exact replay safe; competing additional application rejected. |
| 26 Cancelled Order | PASS | Application rejected. |
| 27 Simultaneous commands | PASS | Two authorized different-key actors, exactly one winner. |
| 28 Same-key retry | PASS | Original identity recovered. |
| 29 Changed amount same key | PASS | Intent conflict; no duplicate. |
| 30 Multiple partial cash receipts | NOT VERIFIED | Single delivered receipt scenarios verified; new multi-delivery COD composition not specifically exercised. |
| 31 Refund after waiver | PARTIAL | Reject 81 refund, complete 80; documentary return policy open. |
| 32 Receipt reversal | PARTIAL | Unposted collection + waiver reversed atomically; posted/remitted correction blocked. |
| 33 Collect81/remit80 | PASS | Customer remains settled; courier receivable1, no waiver. |
| 34 Collect80 | PASS | Genuine delivered collection evidence; synthetic permission only. |
| 35 Overpayment/change | PARTIAL | Excess COD net collection rejected; tender/change UI not implemented. Existing wallet excess tests retained. |
| 36 Wallet underpayment | PASS | Not eligible for COD waiver. |
| 37 Duplicate Finance posting | PASS | Replay/competition preserve one memorandum; unique source bindings. |
| 38 Finance failure | PASS | Actual PostgreSQL trigger failure rolls back entire application. |
| 39 Unknown COMMIT | PASS | Physical wire-fault recovery before and after commit. |
| 40 History after closure | PASS | Closed Order retains history; request mutation rejected. |

## Acceptance register: 34 required outcomes

| # | Outcome | Verdict | Scope / remaining requirement |
|---|---|---|---|
| 1 | Whole-BDT direction | PASS | Captured without approving algorithm. |
| 2 | Internal precision | PASS | Exact strings/BigInt and decimal schema retained. |
| 3 | Integral final contract | PASS | Server final commitment guard; UI later. |
| 4 | Versioned rounding | PASS | Explicit signed mode/boundary/provenance snapshot. |
| 5 | Terms/obligation reconcile | PASS | Actual PostgreSQL persistence and projection. |
| 6 | Unknown tax not zero | PASS | Missing/unresolved treatment blocks. |
| 7 | Fractional Catalog preserved | PASS | Read-only synthetic audit; no normalization. |
| 8 | Discount distinct | PASS | Separate exact term. |
| 9 | Waiver distinct | PASS | Separate post-sale financial identity. |
| 10 | Original total immutable | PASS | Whole-policy commercial trigger; no waiver rewrite. |
| 11 | Cash accurate | PASS | Receipt80 remains80. |
| 12 | Adjustment domain | PARTIAL | Complete gated synthetic application/correction; operational activation pending. |
| 13 | Controlled policy | PASS | Explicit approved revisions, budgets, dates and evidence. |
| 14 | IAM | PASS | Restricted caps, tenant binding and independent approval. |
| 15 | No duplicates | PASS | Residual locking, uniqueness and idempotency. |
| 16 | Concurrency/retry | PASS | Competing actors and physical commit recovery. |
| 17 | Finance reconciliation | PARTIAL | Non-cash memorandum conserved; approved receivable/journal classification absent. |
| 18 | Truthful settlement | PASS | Settled with adjustment distinguished from cash paid. |
| 19 | Balance closes | PASS | Approved synthetic81/80/1 due0. |
| 20 | Courier shortage separate | PASS | Existing remittance receivable remains1. |
| 21 | Wallet separate | PASS | No automatic waiver. |
| 22 | Excess liability | PARTIAL | Existing wallet liability regression; COD excess rejected, tender/change not added. |
| 23 | Refund/reversal | PARTIAL | Genuine receipt cap and unposted correction; invoice/remitted/line allocation open. |
| 24 | COD compatible | PARTIAL | Actual receipt/remittance tests; real courier and multiple-delivery breadth unverified. |
| 25 | Audit/outbox | PASS | Owning atomic operation, durable correction history. |
| 26 | Analytics truthful | PASS | One COD_COLLECTED80, no fabricated payment/conversion. |
| 27 | Migration paths | PASS | Local fresh and24 populated upgrade fixtures; Linux/target separately open. |
| 28 | Existing regressions | PARTIAL | Broad459/1 fixed; final focused green, full broad not rerun. |
| 29 | Security/privacy | PARTIAL | Boundary/capability/no-store/source checks; inherited deployed sink/ingress gates open. |
| 30 | No activation | PASS | Disabled exported resolvers and existing public gates. |
| 31 | Policy gates | BLOCKED | Actual business/tax/accounting/courier evidence outstanding. |
| 32 | Frontend handoff | PASS | Exact current contracts, routes and missing discovery workflow documented. |
| 33 | Earlier verdicts accurate | PASS | No earlier PARTIAL promoted or historical evidence recounted as new. |
| 34 | No persistent operation | PASS | Disposable cluster/tests only; no commit/publication/deployment. |

Next: resolve [financial decisions](PHASE_09A1_FINANCIAL_DECISIONS.md), implement [09A.2 workflow](PHASE_09A2_FRONTEND_HANDOFF.md) with private gates intact, then close the existing Phase 09 release register. This report is technical evidence, not tax/accounting sign-off or authorization to operate.
