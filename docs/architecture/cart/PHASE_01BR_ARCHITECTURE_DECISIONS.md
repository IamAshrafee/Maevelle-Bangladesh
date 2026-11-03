# Phase 01B-R architecture decisions

2026-11-03. Applies to local dirty source; no deployment approval implied.

## BR-01 — keep one external store

The current useSyncExternalStore design owns confirmed projections, submitted
intentions and recovery state, not prices, stock, tenant or account authority.
Alternative: React Context/reducer would still need a stable global coordinator
and would broaden rerenders; a new state/query package introduces a competing
cache and dependency without solving unknown outcome or HttpOnly capability
races. Keep the factory and narrow primitive subscriptions. No private singleton
is constructed while server rendering. Header state remains unknown until an
authorized read; SSR/idle Add controls now stay busy until that read settles.

## BR-02 — semantic Clear, not client-side bulk deletes

One `{kind:'clear'}` intention maps to DELETE current with one UUID, observed
revision and owner context. Alternatives: per-line deletes lose atomicity, leave
coupons, create multiple outcomes and race edits; optimistic local empty state
can falsely confirm an unknown commit. Retain confirmed server state until receipt,
block dependent commands and broadcast one revision hint after success. Empty
Clear confirms a consumed no-op without a false removal notice. No Undo is offered.
Tests cover duplicate flight, no-op, stale confirmation, competing edits, lost
response, timeout, server error, subsequent Add and other-tab header synchronization.

## BR-03 — explicit forgetting with a persistent nonsecret review marker

Alternative: automatically delete/reset on401 or treat old bearer/public context
as recovery proof. Rejected: it hides continuity loss or adopts unproven authority.
The frontend never reads/deletes HttpOnly values. It calls the existing endpoint
only after a deliberate confirmation. Unknown work cannot be discarded as part
of reset: retry exact intent while authorized or separately confirm stopping
recovery. In-flight requests, including requests fenced by an owner change,
remain tracked until settled. Coupon recovery is memory-only, not secretly
persisted for convenience.

Reset pauses admission, fences callbacks, broadcasts minimal hints, drains local
requests, acquires the same optional browser lock, calls forgetting, clears
owner-bound state only on acknowledgement and re-reads unqualified authority.
Any remaining/late authority requires explicit review, not automatic adoption.
A static tab-local `required` marker survives reload until explicit review or a
fresh verified initialization. It contains no cookie, owner, customer or Cart
contents. If storage is denied, memory fencing remains and the customer is warned
that reload recovery could not be recorded. Other/nonparticipating tabs and
stolen bearers are not revoked; backend retirement/expiry remains separate.

## BR-04 — bounded requests, queues and coordination

Keep exact submitted identity across retry and use20-flight admission bound.
Mutation transport deadlines are15 seconds; Web Lock acquisition is bounded at
20 seconds. A stalled lock never bypasses the barrier after callback entry.
SecurityError/NotSupportedError may fall back only before entry; the backend
still requires the cookie round trip. Timeout/503/429 remain uncertain intentions
with the same key; Retry-After controls explicit retry availability. No automated
retry loop or automatic revision rebase is added.

Epochs fence owner/display callbacks; request tickets, intent revision and
calculation timestamps fence old reads. A receipt's committed outcome and latest
projection remain distinct. Route identity is captured when an intention is
admitted, so a later completion cannot claim success for a different PDP; Buy Now
also fences its navigation continuation. Diagnostic conflicts/expired intents
remain reviewable until explicitly stopped.

## BR-05 — browser hints and subscription lifecycle

Keep BroadcastChannel plus storage/focus/visibility/history/online fallbacks.
Messages contain only kind, nonce and public context/revision or transition phase.
They can invalidate/re-read, never choose an owner or authorize a mutation.
Coalesce revision hints, deduplicate transition phases, do not broadcast on reads
and release polling/channel/event listeners when the last subscriber leaves.
No second state store or background request per product card is introduced.

## BR-06 — accessible reflow and shared confirmation

Native dialog composes shared Button and supplies a named/described modal,
Cancel initial focus, busy controls, Escape and focus restoration. Return focus
is scheduled after DOM removal; if the trigger disappears, use the permanent
Cart status region. A generic confirmation fits both Clear and reset; the existing
mobile-only sheet is not repurposed into an incompatible desktop modal.

Reproduce the706px failure and inspect element bounds. Fix footer wrapping and
tablet input/header minimum sizing, rather than clipping the page. Announcement
content wraps and has a keyboard pause control. Touch targets and reduced-motion
rules are retained. Chat offset uses the same lg boundary as bottom navigation.
Native browser zoom, real devices and assistive technology require distinct
verification; CSS zoom/effective viewport metrics do not certify WCAG.
