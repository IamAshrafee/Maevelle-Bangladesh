# Phase01B mutation and reconciliation contract

The controller sends existing add, set quantity, remove line, apply coupon and remove coupon operations with UUID Idempotency-Key, numeric expected version, ownerContext body and x-cart-context header. Prices, discounts, currency, tenant and customer authority never come from frontend command bodies. There is no new receipt lookup endpoint: exact mutation replay recovers the backend receipt plus current authorized projection.

## Identity and ordering

A new deliberate action creates one key. Simultaneous identical activations share an in-flight promise; later completed actions get new keys. Different commands serialize. Before a new command, refresh authority. If a foreign revision appeared since the action was queued, refuse and ask for review instead of silently rebasing a desired quantity. The backend still arbitrates actual races with stale-version conflicts.

A submitted intent's operation, owner, key, payload and expected version never change. Timeout,5xx, malformed success or network interruption are uncertain outcomes, not proof of rollback. Keep the pending identity and block new mutations. Explicit “Retry same action” validates original ownership and resubmits the exact intent; it never silently issues a new key. A definitive stale revision clears automatic replay, retrieves current state and retains a review notice. Idempotency payload conflicts require review, not altered replay. Rate-limit recovery honors Retry-After. Retry attempts are user-driven; no unbounded automatic write loop exists.

Confirmed receipts are distinct from current pricing. `outcome.committedVersion`/changes belong to the immutable original result; DTO version/evaluatedAt/fingerprint describe the returned current projection. Replayed older outcomes do not overwrite newer quantities or authorize stale purchase prices. No-op receipt with unchanged version is a confirmed no-op. Product availability and all totals remain server-owned.

## Response fences

Owner epoch invalidates reads, queued work and late write callbacks on auth transitions. Read generations, accepted-response tickets, revision and evaluation timestamps prevent older projections replacing newer ones. Abort of a write is never represented as a rollback. Client route unmount does not destroy the shared controller. Full reload recovers current state first, then offers review of saved intent without executing it automatically.

## Persistence/privacy

Only a small nonsecret sessionStorage intent journal (<=2048 characters, <=7days) and selected public context are stored. Quantity metadata uses canonical whole-number bounds. Validated reload reconstructs whitelisted fields; extra stored properties cannot become request authority. Full Cart/product/customer projections and guest credentials are never persisted. Coupon text is memory-only; storage denial is visible and warns to keep the tab open. Seven days is a technical recovery ceiling matching existing receipt policy, not approval of a business retention policy. sessionStorage does not promise restoration after browser process shutdown.

A failed reconciliation read retains the uncertain intent and recovery controls. Ownership rejection stays latched through a later cookie-less404; focus/polling cannot authorize a replacement guest bag. Owner changes clear private display immediately. Old journals are never automatically submitted for a new identity. “Stop retrying and review” explicitly discards recovery metadata and explains that earlier changes may already be saved. Multiple authorities are not merged. Account Cart is controlled unavailable, with no guest fallback.

Tests and residual gaps: [browser results](PHASE_01B_BROWSER_SCENARIO_RESULTS.md), [acceptance](PHASE_01B_ACCEPTANCE_REGISTER.md).
