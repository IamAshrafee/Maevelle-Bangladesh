# Phase 01-C scenario results

The [browser logs](phase01c-evidence/browser-regression.json), [Clear/recovery results](phase01c-evidence/browser-clear-reset.json) and [test log](phase01c-evidence/closure-tests.txt) contain new executions. Prior reports remain historical.

| Journey / register mapping | Evidence and disposition |
| --- | --- |
| S01–S07 first visit, Add, exact variant, reload, tab close/reopen and quantity changes | B01–B05, BR33 and selectable product fixture. B05 increases and decreases, then removes the line. |
| S08–S12 evaluation and malformed input | Real pricing/fingerprint and unpublished redaction, quantity/input security. Richer lifecycle and availability rules remain Phase 02A. |
| S13 Clear, coupon and removal | B05/B17, BR18–BR24, AR01–AR04, coupon/Clear API race. Undo remains outside supported semantics. |
| S16–S20 and S25 ownership, pending results, stale edits and auth expiry | B06/B08/B15, real shopper A/B/mapping/expiry and controller epoch tests. Accounts across devices remain later. |
| S26/S34/S35/S59 cookie loss, cold tabs, delayed setup, reset and storage | B07/B09/B11/B14, BR24–BR27/BR32, actual cookie-denial profile, credential closure suite. |
| S36–S39 adversarial | Foreign IDs and line access, origin/metadata, bounded schemas, rate limits, cookie tampering, log canary. See [threat map](PHASE_01C_SECURITY_VERIFICATION.md). |
| S47–S49/S51 diagnostics, worker and compatibility | API logging canary, Worker suite, Cart without complete Checkout and real legacy Checkout adapter protection. |
| S53/S57 rollback, lost response, offline and timeout | BR22/BR29–BR31, C01 Retry-After case, trigger and connection-termination rollback in PostgreSQL. |
| S54/S55 performance and access | Synthetic 1/20/100-line reads, bounded concurrent probes, Chrome layout/keyboard/AX and emulated touch. See [browser report](PHASE_01C_BROWSER_ACCESSIBILITY.md). |
| S56 backup and credentials | Synthetic restore and migration upgrade only. Persistent restore/revocation approval is blocked. |
| S14–S15/S18/S21–S24/S27–S33/S40–S46/S50/S52/S58 | Applicable existing boundaries were reviewed. Advanced commerce, merge, retention, Wishlist transfers, recommendation/analytics/Admin and future handoff scenarios require their scoped implementation and proof. |

Concurrency proof uses separate real PostgreSQL transactions. Same-key contenders yield one committed receipt and state transition. Changed payload conflicts. Clear/Add and coupon/Clear admit one winner at the observed revision. Coupon/Clear replays the winner's original receipt. Stale quantity and Clear remain subject to review. The browser fault proxy buffers or drops real upstream responses and injects isolated transient failures. A committed receipt and a current projection are asserted separately.
