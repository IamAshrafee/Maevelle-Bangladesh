# Cart scenario register

For current executed Phase 01-C coverage, see the [integrated scenario results](PHASE_01C_SCENARIO_RESULTS.md). The entries below retain their original design scope and identifiers.

Phase01B execution evidence: [browser results](PHASE_01B_BROWSER_SCENARIO_RESULTS.md) maps actual Chrome cases to this register; [acceptance](PHASE_01B_ACCEPTANCE_REGISTER.md) records limited foundation coverage. This does not mark all59 design scenarios executed.

Phase01A update: the [implemented profile](PHASE_01A_RECEIPT_AND_OWNER_CONTRACT.md), [bootstrap protocol](PHASE_01A_BOOTSTRAP_PROTOCOL.md) and [acceptance register](PHASE_01A_ACCEPTANCE_REGISTER.md) distinguish current code from this full-product proposal/historical design register. Only explicitly evidenced Phase01A coverage has run; other scenarios/threats remain unexecuted.


59 design scenarios; no scenario below is reported executed in Phase 00. P0 blocks related capability acceptance; P1 must close before final Cart acceptance unless a concrete exception is recorded. Backend/frontend are proposed actionable resolutions. Each test describes the observable acceptance criterion, not a claimed result. Threat references supplement these cases.

## S01 — First guest add and reload

- **Situation / category:** First guest add and reload; Guest.
- **Preconditions:** No Cart cookie; published priced variant with stock.
- **Potential failure / root cause or risk:** Header GET creation could flood empty rows; failed cookie persistence loses restoration.
- **Expected behavior / backend solution:** Explicit initialization/add only, resolve server tenant/currency, return HttpOnly cookie and committed receipt.
- **Frontend behavior:** Show pending, confirm only committed outcome; reload authorized snapshot.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Add two units, reload: exactly two units, no stock reservation; header GET writes zero rows. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S02 — Double-click Add

- **Situation / category:** Double-click Add; Guest.
- **Preconditions:** Same product action remains pending.
- **Potential failure / root cause or risk:** Two handlers create two intents for a single rapid activation.
- **Expected behavior / backend solution:** Require mandatory intent key, unique receipt and one commit.
- **Frontend behavior:** Disable action during submission; reuse one intent across duplicate activation; later deliberate click creates new intent.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Double activation adds requested units once; subsequent explicit completed click adds again. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S03 — Same request replay / changed body

- **Situation / category:** Same request replay / changed body; Network.
- **Preconditions:** A committed add has a receipt.
- **Potential failure / root cause or risk:** Replay duplicates units or key reuse hides tampering.
- **Expected behavior / backend solution:** Resolve receipt before version; fingerprint operation/body/owner; mismatch conflict.
- **Frontend behavior:** Reuse exact key/body for retries; never generate key per attempt.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** 100 exact replays yield one mutation/event; changed variant or quantity returns 409. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S04 — Timeout after database commit

- **Situation / category:** Timeout after database commit; Network.
- **Preconditions:** Server commits add; response lost.
- **Potential failure / root cause or risk:** Unknown outcome misclassified as failure and fresh intent doubles units.
- **Expected behavior / backend solution:** Receipt query returns original committed delta/event IDs and latest authorized Cart.
- **Frontend behavior:** Mark outcome unknown, recover receipt, then same-key retry.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Drop response after commit: exactly one add; UI reconciles without duplicate success measurement. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S05 — Browser closes during mutation

- **Situation / category:** Browser closes during mutation; Guest.
- **Preconditions:** Add in flight; browser terminated.
- **Potential failure / root cause or risk:** After restart user cannot distinguish sent intent from rejected request.
- **Expected behavior / backend solution:** Persist server receipt; recovery lookup bound to owner; reject aged recovery.
- **Frontend behavior:** Store minimal nonsecret intent/key/owner/time for <=7-day recovery when permitted; reload first; storage unavailable warns.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Close before and after commit: recover current Cart and receipt, never blind duplicate. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S06 — Product requires variant selection

- **Situation / category:** Product requires variant selection; Catalog.
- **Preconditions:** Product has multiple option combinations.
- **Potential failure / root cause or risk:** Product minimum-price card invents a variant.
- **Expected behavior / backend solution:** Accept exact Catalog variant UUID only and validate option coherence.
- **Frontend behavior:** Open reusable picker; preserve selected option intent on errors.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** No mutation before valid explicit selection; distinct variants produce distinct lines. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S07 — Set differs from Add

- **Situation / category:** Set differs from Add; Commerce.
- **Preconditions:** Line currently quantity 3.
- **Potential failure / root cause or risk:** Set one treated as increment or Add one overwrites.
- **Expected behavior / backend solution:** Separate command semantics and receipt operation; set=1, add=+1.
- **Frontend behavior:** Quantity editor submits desired state; Add surfaces incremental intent.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Set 1 yields 1; Add 1 then yields 2; replay each unchanged. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S08 — Price changes while editing

- **Situation / category:** Price changes while editing; Pricing.
- **Preconditions:** Editor open, price definition changes.
- **Potential failure / root cause or risk:** Revision unchanged despite stale price display.
- **Expected behavior / backend solution:** Fixed-time re-evaluation and fingerprint using price definition version.
- **Frontend behavior:** Preserve typed quantity, show current price/change notice and new subtotal.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Commit under new price; no client amount accepted; old/new notice appears. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S09 — Variant disappears while Cart open

- **Situation / category:** Variant disappears while Cart open; Catalog.
- **Preconditions:** Line variant archived or option coherence invalidated.
- **Potential failure / root cause or risk:** Mutation/read resurrects discontinued merchandise.
- **Expected behavior / backend solution:** Catalog-owned eligibility; redacted unavailable reference; remove still allowed.
- **Frontend behavior:** Inline unavailable recovery, choose variant or remove.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Archive then refresh: no purchasable line, removal succeeds, no draft/media leakage. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S10 — Stock drops below requested quantity

- **Situation / category:** Stock drops below requested quantity; Inventory.
- **Preconditions:** Cart quantity 5; new ATS 2.
- **Potential failure / root cause or risk:** UI implies stock hold or silently cuts intent.
- **Expected behavior / backend solution:** Return requested 5, ATS 2, insufficient status; new increases fail.
- **Frontend behavior:** Offer explicit reduce-to-2/remove; retain requested value until confirmed.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Stock unaffected by Cart; no silent clamp; future handoff ineligible. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S11 — Unpublished product remains in Cart

- **Situation / category:** Unpublished product remains in Cart; Catalog.
- **Preconditions:** Product previously public now DRAFT/withdrawn.
- **Potential failure / root cause or risk:** Current hydration exposes private metadata and eligible price.
- **Expected behavior / backend solution:** Recheck publication/coherence on every read; redact metadata/price; safe tombstone.
- **Frontend behavior:** Show generic unavailable saved selection, remove control.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Known variant ID cannot reveal unpublished title/media/price or count as eligible. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S12 — Deliberate malformed quantity or body

- **Situation / category:** Deliberate malformed quantity or body; Security.
- **Preconditions:** Public mutation endpoint.
- **Potential failure / root cause or risk:** Huge numbers/fractions/exponents/unknown fields exhaust or bypass rules.
- **Expected behavior / backend solution:** Strict canonical quantity length/value, UUID schemas, 64KiB/body and line caps; reject mass assignment.
- **Frontend behavior:** Map field errors, never send arbitrary object spread.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. This scenario directly tests adversarial boundary enforcement; denial must leave no side effects.
- **Required automated/manual tests and acceptance criterion:** Fuzz zero/negative/99+/.5/1e9/long digits/prototype fields: bounded 4xx, no write. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S13 — Remove, Undo and Clear

- **Situation / category:** Remove, Undo and Clear; Commerce.
- **Preconditions:** Populated cart, coupon selected.
- **Potential failure / root cause or risk:** Undo restores stale money or Clear leaves coupons.
- **Expected behavior / backend solution:** Atomic desired operations, new receipt per undo, fresh eligibility evaluation.
- **Frontend behavior:** Visible undo result/error, accessible confirmation for clear with large cart.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Clear yields zero lines/coupons once; undo uses latest price/stock and respects changed owner. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S14 — Variant edit collides with existing target

- **Situation / category:** Variant edit collides with existing target; Commerce.
- **Preconditions:** Two variants of same product already present.
- **Potential failure / root cause or risk:** Remove source before target validation loses units.
- **Expected behavior / backend solution:** Single transaction combines target + source quantity, rejects over caps/stock unchanged.
- **Frontend behavior:** Preview combination and confirm; source retained on failure.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Successful union exactly sums units; failure leaves both original lines. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S15 — Two carts contain last available unit

- **Situation / category:** Two carts contain last available unit; Inventory.
- **Preconditions:** ATS 1, independent guest carts.
- **Potential failure / root cause or risk:** Cart creates reservation or guarantees future purchase.
- **Expected behavior / backend solution:** Allow each intent while observed stock available; no reserve side effect.
- **Frontend behavior:** State stock not held; revalidate on open.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Both carts can contain unit, reservation sum remains zero. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S16 — Sign-in during guest mutation

- **Situation / category:** Sign-in during guest mutation; Identity.
- **Preconditions:** Guest add unresolved; sign-in starts.
- **Potential failure / root cause or risk:** Late guest commit lost from merge or duplicated under account.
- **Expected behavior / backend solution:** OwnerContext binds guest request; drain/recover guest outcome, exact versions then merge.
- **Frontend behavior:** Pause queue and block merge until unknown add resolved; bump epoch.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Run sign-in at before/after commit barriers: exact guest units once in merge. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S17 — Account switches while request pending

- **Situation / category:** Account switches while request pending; Identity.
- **Preconditions:** A mutation prepared; B cookie becomes active.
- **Potential failure / root cause or risk:** Request applies A intent to B despite frontend abort.
- **Expected behavior / backend solution:** Validate ownerContext against current server session before any writes.
- **Frontend behavior:** Blank A state, increment epoch, abort, never replay A queue as B.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Barrier test enqueue A/send with B cookie: reject OWNER_CHANGED; B unchanged. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S18 — Account Cart across devices

- **Situation / category:** Account Cart across devices; Account.
- **Preconditions:** Same account signed in on two devices.
- **Potential failure / root cause or risk:** Independent browser stores diverge.
- **Expected behavior / backend solution:** Unique active account Cart and authorized snapshot/version.
- **Frontend behavior:** Refetch on visible focus; show new values/conflicts.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Device one edit visible on device two focus; no duplicate active cart. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S19 — Two devices edit same line

- **Situation / category:** Two devices edit same line; Concurrency.
- **Preconditions:** Both hold revision 7.
- **Potential failure / root cause or risk:** Lost update via last writer wins.
- **Expected behavior / backend solution:** Row lock + expected version permits one; second gets safe 409.
- **Frontend behavior:** Keep local desired input, refetch and ask retry after review.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Concurrent set 2/set 4: exactly one revision-8 commit; loser cannot silently overwrite. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S20 — Slow response follows newer update

- **Situation / category:** Slow response follows newer update; Concurrency.
- **Preconditions:** Revision 8 request slower than revision 9.
- **Potential failure / root cause or risk:** UI count/price regresses.
- **Expected behavior / backend solution:** Return owner/revision/evaluatedAt; no stale cached body.
- **Frontend behavior:** Accept only current generation and newest revision/evaluation, cancel superseded reads.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Deliver 9 then 8: rendered state stays 9, outcome still deduped. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S21 — Duplicate variants merge

- **Situation / category:** Duplicate variants merge; Merge.
- **Preconditions:** Guest has 2/account 3 same variant and another different variant.
- **Potential failure / root cause or risk:** Overwrite or max policy discards intent.
- **Expected behavior / backend solution:** Sum to 5 under caps, retain account line ID, separate other variant, one revision.
- **Frontend behavior:** Show combined quantities and reconciliation summary.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Merge 2+3=5 once; distinct variant remains distinct. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S22 — Merge exceeds inventory or hard cap

- **Situation / category:** Merge exceeds inventory or hard cap; Merge.
- **Preconditions:** Combined quantity >ATS or >99 / >100-line union.
- **Potential failure / root cause or risk:** Silent clamp loses desired units or unbounded rows.
- **Expected behavior / backend solution:** Above ATS retain needs-review within hard cap; hard cap returns review without consuming guest.
- **Frontend behavior:** Review quantities/exclusions with exact versions then resubmit new reviewed intent.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** No guest consumption before valid review; all exclusions visible; stock unchanged. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S23 — Merge response lost / repeated merge

- **Situation / category:** Merge response lost / repeated merge; Merge.
- **Preconditions:** Atomic merge committed and token revoked.
- **Potential failure / root cause or risk:** Retry cannot prove outcome or adds guest again.
- **Expected behavior / backend solution:** Account-bound merge receipt lookup before stale/capability path; guest replay denied.
- **Frontend behavior:** Recover same merge intent, render current account Cart.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Lose merge response, replay 20 times: one merge, revoked token never reads account Cart. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S24 — Merge races with account edit

- **Situation / category:** Merge races with account edit; Merge.
- **Preconditions:** Guest+account exact versions captured then account changes.
- **Potential failure / root cause or risk:** Lost account edits or partial merge.
- **Expected behavior / backend solution:** Lock deterministic order, recheck versions; conflict rolls all back.
- **Frontend behavior:** Refetch and review fresh account+guest combination.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Race edit/merge yields serial commit or clean conflict; no dropped units. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S25 — Sign-out and session expiry

- **Situation / category:** Sign-out and session expiry; Account.
- **Preconditions:** Private Cart displayed; session expires/revokes.
- **Potential failure / root cause or risk:** Private content flashes in guest mode or queued writes leak.
- **Expected behavior / backend solution:** Return 401 for stale account owner context; fresh guest context on explicit sign-out.
- **Frontend behavior:** Hide private data immediately, clear memory partition, pause queue.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Natural/revoked expiry and sign-out: no private flash, no account-to-guest data copy. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S26 — Customer clears cookies

- **Situation / category:** Customer clears cookies; Guest.
- **Preconditions:** Server guest cart populated.
- **Potential failure / root cause or risk:** Fingerprint recovery would expose abandoned Cart.
- **Expected behavior / backend solution:** No restoration without token; new guest starts empty, old expires.
- **Frontend behavior:** Explain browser data loss; account sign-in recovers account only.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Clear cookie, reload: no old guest content and no guessed UUID access. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S27 — Worker cleanup overlaps activity

- **Situation / category:** Worker cleanup overlaps activity; Lifecycle.
- **Preconditions:** Worker selects near-expiry Cart; customer edits.
- **Potential failure / root cause or risk:** Stale cleanup selection deletes active Cart.
- **Expected behavior / backend solution:** Lock and recheck expiry/activity; mutate validates expiry after lock; SKIP LOCKED bounded batch.
- **Frontend behavior:** If truly expired offer new Cart; never fake saved.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Deterministic interleaving retains refreshed Cart or cleanly rejects expired write. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S28 — Move to Wishlist second operation fails

- **Situation / category:** Move to Wishlist second operation fails; Wishlist.
- **Preconditions:** Wishlist save succeeds; Cart removal times out/fails.
- **Potential failure / root cause or risk:** Remove-first loses item; retry removes newer quantity.
- **Expected behavior / backend solution:** Save-first transfer receipt, guarded line version, receipt recovery.
- **Frontend behavior:** Show saved but still in bag; retry remove only; changed line requires review.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Inject failure after save: at least one copy; no repeated Wishlist creation; newer Cart units retained. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 04A/04B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S29 — Wishlist preferred variant stale

- **Situation / category:** Wishlist preferred variant stale; Wishlist.
- **Preconditions:** Saved product preferred variant archived.
- **Potential failure / root cause or risk:** Product-level save identity treated as current variant.
- **Expected behavior / backend solution:** Catalog resolves chosen eligible variant; reject stale preferred reference.
- **Frontend behavior:** Picker when ambiguous/stale, leave Wishlist saved.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Unavailable preference cannot bypass validation; chosen variant added once. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 04A/04B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S30 — Shared Wishlist bulk partial success

- **Situation / category:** Shared Wishlist bulk partial success; Wishlist.
- **Preconditions:** Recipient selects 12 products; 3 invalid/ambiguous.
- **Potential failure / root cause or risk:** Sender snapshot prices/owner trusted, retries duplicate successes.
- **Expected behavior / backend solution:** Bounded explicit variants, stable entry IDs; per-entry outcome in single receipt.
- **Frontend behavior:** Picker/review first, report 9 added/3 need review; retry only rejected under fresh reviewed intent.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Replay batch gives same 9 additions and no sender-private identity leakage. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 04A/04B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S31 — Recommendations unavailable

- **Situation / category:** Recommendations unavailable; Recommendation.
- **Preconditions:** Cart loaded; suggestion endpoint fails.
- **Potential failure / root cause or risk:** Optional failure blocks Cart or repeated queries overload DB.
- **Expected behavior / backend solution:** Separate budget/timeouts and response; no Cart-table coupling.
- **Frontend behavior:** Omit/retry module without disabling quantities/subtotal.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Forced 503/timeout leaves Cart edits usable and no false empty state. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 04A/04B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S32 — Promotion expires while open

- **Situation / category:** Promotion expires while open; Promotions.
- **Preconditions:** Selected coupon was applied before end time.
- **Potential failure / root cause or risk:** Stale discount presented as guaranteed.
- **Expected behavior / backend solution:** Re-evaluate fixed instant and return EXPIRED selection status/new fingerprint.
- **Frontend behavior:** Visible removed-discount notice, current subtotal, remove code action.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Time boundary expires benefit; no redemption and no purchase event. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 04A/04B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S33 — Stacked discounts exceed gross

- **Situation / category:** Stacked discounts exceed gross; Promotions.
- **Preconditions:** Two 70% stackable promotions target same line.
- **Potential failure / root cause or risk:** Negative net from original-gross allocations.
- **Expected behavior / backend solution:** Fix Promotions-owned remaining-gross allocation/cap; Cart consumes result.
- **Frontend behavior:** Show each valid allocation and nonnegative total.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Overlapping fixed/percentage tests ensure line net >=0 and allocations reconcile. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 04A/04B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S34 — Cross-tab updates and denied storage

- **Situation / category:** Cross-tab updates and denied storage; Synchronization.
- **Preconditions:** Two tabs or storage access blocked.
- **Potential failure / root cause or risk:** Stale count, loops, sensitive broadcast payload.
- **Expected behavior / backend solution:** Authorized reads only, no browser token store.
- **Frontend behavior:** Nonsecret revision invalidation; storage fallback; focus refetch; memory-only recovery notice.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Two tabs converge once without event storm; blocked APIs retain working current session. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 03A/03B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S35 — Guest token fixation/replay

- **Situation / category:** Guest token fixation/replay; Security.
- **Preconditions:** Attacker plants old token/cookie.
- **Potential failure / root cause or risk:** Token promoted into account access.
- **Expected behavior / backend solution:** Host-only cookie, no URL token, rotate/revoke at claim; server owner binding.
- **Frontend behavior:** Never copy token or restore account from guest credential.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. This scenario directly tests adversarial boundary enforcement; denial must leave no side effects.
- **Required automated/manual tests and acceptance criterion:** Preplanted/merged token cannot view/mutate account; duplicate-cookie ambiguity rejected. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S36 — Cross-tenant or foreign line ID

- **Situation / category:** Cross-tenant or foreign line ID; Security.
- **Preconditions:** Attacker knows another org/cart/line UUID.
- **Potential failure / root cause or risk:** IDOR or arbitrary tenant creation.
- **Expected behavior / backend solution:** Resolve configured org, composite FK and owner predicates on every query.
- **Frontend behavior:** Generic not-found message; no foreign metadata.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. This scenario directly tests adversarial boundary enforcement; denial must leave no side effects.
- **Required automated/manual tests and acceptance criterion:** Org/account/line substitution rejected for every endpoint incl receipt/transfer. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S37 — CSRF and forged proxy origin

- **Situation / category:** CSRF and forged proxy origin; Security.
- **Preconditions:** Cookie present, cross-site request / forged forwarded-host.
- **Potential failure / root cause or risk:** Cart mutation by untrusted site.
- **Expected behavior / backend solution:** Exact configured origin, JSON, Fetch Metadata, trusted proxy boundary; no wildcard credential CORS.
- **Frontend behavior:** Use same-origin helper; no hidden alternate mutation path.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. This scenario directly tests adversarial boundary enforcement; denial must leave no side effects.
- **Required automated/manual tests and acceptance criterion:** Missing/evil/null origin, form POST and forged forwarded host denied with zero effects. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S38 — Guest flooding and key exhaustion

- **Situation / category:** Guest flooding and key exhaustion; Security.
- **Preconditions:** Bot repeatedly creates carts/unique receipts.
- **Potential failure / root cause or risk:** Pool/storage saturation.
- **Expected behavior / backend solution:** Shared DB-backed quotas per IP hash/owner/op, byte/line/key limits, creation quotas, bounded retention.
- **Frontend behavior:** Honor Retry-After; do not loop silently.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. This scenario directly tests adversarial boundary enforcement; denial must leave no side effects.
- **Required automated/manual tests and acceptance criterion:** Two API instances enforce combined cap; 429 before unbounded rows/CPU. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S39 — Stored XSS/injection/mass assignment

- **Situation / category:** Stored XSS/injection/mass assignment; Security.
- **Preconditions:** Malicious title/options/coupon/JSON keys.
- **Potential failure / root cause or risk:** UI executes script or SQL alters ownership/prices.
- **Expected behavior / backend solution:** Parameterized SQL; explicit DTO allowlist; no client price/owner assignment.
- **Frontend behavior:** Escaped text, safe media URLs, no raw HTML or token logging.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. This scenario directly tests adversarial boundary enforcement; denial must leave no side effects.
- **Required automated/manual tests and acceptance criterion:** Script and SQL payloads render inert/reject; prototype and total override have zero authority. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S40 — Analytics retry same event

- **Situation / category:** Analytics retry same event; Analytics.
- **Preconditions:** Committed add delivery retries.
- **Potential failure / root cause or risk:** Repeated add metrics inflate conversion intent.
- **Expected behavior / backend solution:** Stable event per outcome + unique org/event/destination; at-least-once delivery.
- **Frontend behavior:** Publish stable committed event only once per view lifecycle; retries retain ID.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Replay mutation + redelivery 10 times yields one internal outcome and destination ID. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 05A/05B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S41 — Consent unknown or withdrawn

- **Situation / category:** Consent unknown or withdrawn; Analytics.
- **Preconditions:** No analytics/marketing consent or withdrawal during queued delivery.
- **Potential failure / root cause or risk:** Behavioral/vendor leakage after opt-out.
- **Expected behavior / backend solution:** Separate necessary outcomes, consented observations and destination delivery; recheck before dispatch.
- **Frontend behavior:** No vendor script/event before grant; update across tabs; stop on revoke.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Network capture proves no denied-purpose request/PII; queued revoked delivery suppressed. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 05A/05B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S42 — Tracking service outage

- **Situation / category:** Tracking service outage; Analytics.
- **Preconditions:** GA4/Meta/internal delivery unavailable.
- **Potential failure / root cause or risk:** External outage blocks commerce or loses retry identity.
- **Expected behavior / backend solution:** Commit Cart + outbox independent; bounded retry/dead-letter with original IDs.
- **Frontend behavior:** Successful Cart remains successful; no shopper tracking error alert.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Timeout/crash provider: Cart latency unaffected by external wait, retry observable. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 05A/05B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S43 — View rerender / merge / restore measurement

- **Situation / category:** View rerender / merge / restore measurement; Analytics.
- **Preconditions:** Cart rerenders, restores, merges.
- **Potential failure / root cause or risk:** Repeated render counted as add or fake checkout/purchase.
- **Expected behavior / backend solution:** Taxonomy distinguishes outcomes and observations; merge source excluded from new adds.
- **Frontend behavior:** view_cart once per genuine open/navigation exposure; no ADD on hydration.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Rerender/open cycles match exposure policy; zero add for restore/merge and zero checkout/purchase. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 05A/05B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S44 — Recommendation add stale stock

- **Situation / category:** Recommendation add stale stock; Recommendation.
- **Preconditions:** Recommended SKU sells out before click.
- **Potential failure / root cause or risk:** Suggestion eligibility treated as reservation.
- **Expected behavior / backend solution:** Common add operation freshly validates Catalog/Pricing/Inventory.
- **Frontend behavior:** Inline not-available feedback, suggestions can refresh.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Stale recommendation cannot bypass stock guard or emit successful add. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 04A/04B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S45 — Admin lacks Cart permission

- **Situation / category:** Admin lacks Cart permission; Admin.
- **Preconditions:** Authenticated staff has orders.view only.
- **Potential failure / root cause or risk:** Authentication/order permission grants private Cart access.
- **Expected behavior / backend solution:** Explicit scoped Cart capabilities; server denies all unauthorized reads/settings.
- **Frontend behavior:** Hide inaccessible tabs but rely on backend authorization.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Direct API/navigation with insufficient/cross-org grants yields denial and no rows. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 06A/06B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S46 — Operator changes limits during editing

- **Situation / category:** Operator changes limits during editing; Admin.
- **Preconditions:** Config version changed; active Cart above new soft limit.
- **Potential failure / root cause or risk:** Silent deletion or admin disables critical protections.
- **Expected behavior / backend solution:** Versioned audited configuration; existing intent preserved needs-review; hard ceilings immutable.
- **Frontend behavior:** Explain policy change and corrective actions.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** New adds obey policy, existing items not silently purged; origin/owner protections not configurable. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 06A/06B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S47 — Diagnostics exposes customer content

- **Situation / category:** Diagnostics exposes customer content; Admin.
- **Preconditions:** Support opens trace/report/export.
- **Potential failure / root cause or risk:** Private cart contents/token/PII visible unnecessarily.
- **Expected behavior / backend solution:** Aggregate default, explicit diagnostic grant/reason + audited redacted view; export constraints.
- **Frontend behavior:** Redacted diagnostics and bounded date/pagination, no arbitrary cart edit.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Token/account identity absent from generic reports/logs; access audit present. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 06A/06B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S48 — Worker/projector failures

- **Situation / category:** Worker/projector failures; Operations.
- **Preconditions:** Poison outbox event or lease expires.
- **Potential failure / root cause or risk:** Report stalls forever or duplicate processing.
- **Expected behavior / backend solution:** Bounded retry, lease recovery, idempotent projector, dead-letter exception and authorized redrive.
- **Frontend behavior:** Admin displays lag/stale/as-of and safe recovery outcome.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Kill/restart Worker and poison one event: progress continues, no double count. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 06A/06B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S49 — Cart works with Checkout disabled

- **Situation / category:** Cart works with Checkout disabled; Checkout boundary.
- **Preconditions:** Existing checkout_enabled false.
- **Potential failure / root cause or risk:** Cart Add/edits depend on Checkout session.
- **Expected behavior / backend solution:** Cart queries/commands independent of Checkout; no address/order/payment side effects.
- **Frontend behavior:** View Cart and Continue Shopping work; future Checkout action omitted/unavailable truthfully.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** End-to-end complete Cart journey with Checkout off; zero order/reservation/payment rows. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 08. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S50 — Future handoff is stale

- **Situation / category:** Future handoff is stale; Checkout boundary.
- **Preconditions:** Cart edited or price/stock changes after handoff snapshot.
- **Potential failure / root cause or risk:** Handoff fingerprint used as purchase authorization.
- **Expected behavior / backend solution:** Future consumer must fresh validate expected Cart version + fingerprint; no reserved-stock claim.
- **Frontend behavior:** Present changed merchandise for review on later Checkout project.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Contract test stale snapshot rejected/re-evaluated without any order creation in Cart. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 08. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S51 — Legacy Checkout consumer compatibility

- **Situation / category:** Legacy Checkout consumer compatibility; Checkout boundary.
- **Preconditions:** Existing Orders tests import CartView/getGuestCart.
- **Potential failure / root cause or risk:** New ownership/status/DTO breaks unrelated workflow.
- **Expected behavior / backend solution:** Compatibility facade, safe number boundary, legacy terminal status retained; no account token exposure.
- **Frontend behavior:** Gate affordance separately; do not rebuild Checkout.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Existing consumer compile/contract fixtures remain compatible; owner isolation never weakened. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 01A/01B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S52 — Empty or invalid future handoff

- **Situation / category:** Empty or invalid future handoff; Checkout boundary.
- **Preconditions:** Empty Cart or unavailable line.
- **Potential failure / root cause or risk:** Eligibility flag alone permits purchase.
- **Expected behavior / backend solution:** Return false reasons; future Checkout independently validates; no handoff token as ownership.
- **Frontend behavior:** No functional proceed action until separate Checkout enabled acceptance.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Empty/invalid returns explicit reasons, zero conversions/actions. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 08. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S53 — Database temporarily unavailable

- **Situation / category:** Database temporarily unavailable; Reliability.
- **Preconditions:** Pool/network unavailable mid request.
- **Potential failure / root cause or risk:** Lost writes or UI claims empty/success.
- **Expected behavior / backend solution:** Rollback or unknown outcome recovery; bounded timeout and safe 503; fail closed protection store.
- **Frontend behavior:** Keep confirmed snapshot labelled stale; preserve intent and retry.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Disconnect before/after commit: no half cart/receipt/outbox state, no false empty. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 07A/07B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S54 — Load: 100-line carts and catalog growth

- **Situation / category:** Load: 100-line carts and catalog growth; Performance.
- **Preconditions:** Representative 10k catalog, 100k carts, concurrent shoppers.
- **Potential failure / root cause or risk:** N+1, lock queues, shared Worker harms API.
- **Expected behavior / backend solution:** Batch domain queries, indexes, payload cap, budgets and pool headroom.
- **Frontend behavior:** Lazy drawer/nonessential recommendations, one summary request.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Measure proposed p95/p99 and query-count budgets; no per-line query growth. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P1; 07A/07B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S55 — Keyboard/screen reader/touch and slow mobile

- **Situation / category:** Keyboard/screen reader/touch and slow mobile; Accessibility.
- **Preconditions:** 320px to desktop; zoom, keyboard open, reduced motion.
- **Potential failure / root cause or risk:** Focus trapped/lost, controls hidden, layout jumps.
- **Expected behavior / backend solution:** Return clear structured errors/statuses and stable IDs.
- **Frontend behavior:** Modal focus/inert/Escape/return, 48px important targets, status live region, noncolor notices.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Real browser keyboard+screen-reader, 200% zoom and phone/tablet orientations pass documented matrix. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 07A/07B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S56 — Backup restore / account erasure

- **Situation / category:** Backup restore / account erasure; Recovery.
- **Preconditions:** Authorized restore or customer erasure.
- **Potential failure / root cause or risk:** Restored token revives access or retained payload violates policy.
- **Expected behavior / backend solution:** Revocation/deletion reapplied after restore; encrypted backup scope and retention, account purge/tombstone.
- **Frontend behavior:** No deleted account data reappears; operator diagnostic acknowledgement.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Disposable restore/erasure test proves access revoked and dedupe preserved; no live drill in Phase00. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 08. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S57 — Aborted request is not cancelled commit

- **Situation / category:** Aborted request is not cancelled commit; Concurrency.
- **Preconditions:** AbortController called after submit.
- **Potential failure / root cause or risk:** UI assumes abort reverted operation then issues new increment.
- **Expected behavior / backend solution:** Receipt proves fate; no compensation on transport disconnect.
- **Frontend behavior:** Unknown-state recovery under original owner/key; never auto-add again.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Abort at transaction barriers, recover exactly one committed outcome. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 07A/07B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S58 — Rounding and money bounds

- **Situation / category:** Rounding and money bounds; Pricing.
- **Preconditions:** Fractional decimal4 prices and large discounts/quantities.
- **Potential failure / root cause or risk:** Float error, negative totals, numeric overflow.
- **Expected behavior / backend solution:** Scaled integer arithmetic, DB/DTO bounds, stable largest remainder and aggregate cap.
- **Frontend behavior:** Shared money formatter; preserve exact API amounts, label estimates.
- **Security implication:** Owner, tenant and intent binding apply; no price/token trust at client boundary. Recovery must preserve authorization and suppress stale-owner data; operational/analytics failure cannot weaken that boundary.
- **Required automated/manual tests and acceptance criterion:** Boundary/golden tests allocations sum exactly, totals nonnegative, no client price accepted. Automate domain/API barriers where applicable; exercise the visible recovery with the real backend in the B phase.
- **Priority / implementation phase:** P0; 02A/02B. Security controls apply at first implementation, with regression in 07A/07B and integrated gate 08.

## S59 — Concurrent cold guest initialization

- **Situation / category:** Two new tabs initialize before either has an acknowledged guest cookie; Guest/concurrency.
- **Preconditions:** Both calls start without a Cart capability; one initialization response is delayed and may overwrite the other cookie.
- **Potential failure / root cause or risk:** Parallel Set-Cookie responses can orphan a subsequently populated cart; an initialization idempotency key must not become a bearer credential allowing Cart recovery by anyone who knows it.
- **Expected behavior / backend solution:** No merchandise command before a verified capability round trip; ownerContext fences all later writes. Initialization must have a reviewed browser/server protocol that prevents delayed bootstrap from replacing an already acknowledged populated owner. Do not claim existing createGuestCart provides this guarantee.
- **Frontend behavior:** Serialize same-origin initialization where Web Locks is supported, refetch owner before releasing queued commands, detect changed owner and stop/recover rather than report success under a different cookie. Unsupported/storage-restricted browser recovery must be explicitly designed and browser-tested before this gate passes.
- **Security implication:** Never recover a guest Cart from a public UUID/idempotency key; the token remains HttpOnly. Browser coordination is not server authorization.
- **Required automated/manual tests and acceptance criterion:** Two-tab barrier test delivering init A, add A, then late init B; no populated Cart becomes silently inaccessible and no unauthorized credential recovery occurs. Repeat with lock/storage denied and dropped Set-Cookie response. This acceptance remains an open design gate D15, not an asserted solution.
- **Priority / implementation phase:** P0; 01A/01B, regress 03A/03B and 07A/07B.

## Phase01A.1 executed update

S01–S05/S17/S35–S38/S51/S53/S59 now have focused credential-retirement/owner/Checkout evidence in [Phase01A.1 tests](PHASE_01A1_TEST_EVIDENCE.md). Actual HTTPS Chrome adds old-cookie migration, renamed retired slot, mixed authorities, A/B/logout, mapping/session TTL failure, concurrent retirement and late fixed-cookie response. All17 prior Chrome PDP/Cart scenarios were rerun. This updates the credential boundary only: historical intent recovery remains unavailable without independent proof, account Cart/merge remains Phase03, S55 high-zoom/assistive review Phase01B.1, atomic Clear Phase02A. Do not infer complete full-product scenario acceptance from targeted tests.

Phase 02A continuation results for Catalog invalidation, repeatable-read evaluation,
replacement and discount eligibility are in the [current acceptance register](PHASE_02A_CONTINUATION.md#acceptance-register).

See the [Phase 02B acceptance register](PHASE_02B_IMPLEMENTATION_REPORT.md#acceptance-register)
for the guest Storefront journey, drawer and variant collision/replay evidence.
