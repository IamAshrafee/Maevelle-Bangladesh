# Checkout operational containment and recovery

Prepared 2026-11-10. **This document does not authorize any host, provider,
configuration, deployment or persistent database operation.** Phase 09A used
only a fresh local PostgreSQL cluster and random disposable databases. Live
thresholds, responders and provider permissions remain pending.

2026-11-11 local checkpoint: [Phase09A.5](PHASE_09A5_FINAL_LOCAL_ACCEPTANCE.md) provides a source-specific review package only. Keep independent purchase/method/destination/payout/marketing controls and preserve committed Order reads, legitimate claim reconciliation and Finance/outbox evidence. Do not replace them with a routine blanket API shutdown. Before any target action, satisfy the [separate09B prerequisites](PHASE_09A5_NEXT_STAGE_HANDOFF.md), including actual immutable images, explicit operator/target approval, schema compatibility and backup/forward repair or verified restore. No control was executed in09A.5.

## Preflight and authority

Before any later action identify the approved environment/hostname, operator,
organization UUID, current/previous full release SHA and image digests, schema
ledger, affected financial records, backup/media references and support impact.
Use the existing Maevelle rootless Podman user/service group. Inspect the actual
auto-deploy timer before publication: a ready candidate may be consumed outside
CircleCI. Do not change shared Nginx, OS, unrelated containers or volumes.

Retain restricted diagnostics and stable correlation/intent IDs. Never paste
contact, cookies, grant/proof, auth secrets, transfer references or payment
evidence into general incident reports. Assign an incident commander, Finance
reviewer and Security/Privacy lead as appropriate. Notify customers through
approved support channels; no message is sent by this runbook.

## Independent controls

| Control | Exact owning operation / effect | Retained access / qualification |
| --- | --- | --- |
| New purchasing | **Admin Settings → Checkout → Pause new orders** for the active organization Owner. Requires a reason. The API calls `pauseCheckoutOrders`, which writes the existing `checkout_enabled` kill switch and audit event in one transaction. | Placement checks it under the commercial fence. Exact committed receipt replay bypasses new commercial eligibility after live authority validation. Cart, Order and cash history are preserved. The Settings page shows release blocked independently of the pause and exposes no resume command while release authority is unavailable. |
| Affected payment method | `configurePaymentMethod` through existing Payments method administration | Stops current method eligibility. Preserve original immutable destination/amount provenance and receipt/support operations; verify the exact candidate's current claim behavior. |
| Compromised destination | Payments destination `SUSPEND` with expected revision and reason, through `changeReceivingDestination` / authorized Admin workspace | Stops obsolete instruction/claim eligibility; existing real money still needs independent verification/liability handling. Do not rewrite destination snapshots or send customers to a personal wallet. |
| Payout execution | Stop issuing affected refund processing/completion commands; restrict the authorized operational capability under incident procedure | No external payout adapter/one-click global payout switch is qualified here. UNKNOWN_EXTERNAL_OUTCOME requires independent reconciliation, never automatic second payout. Keep status/evidence reads. |
| Optional measurement/export | Keep GA4/Meta adapters/destinations unavailable and `externalDispatchEnabled=false`; revoke affected purpose through consent authority | Does not disable essential Order, Finance, Inventory or Support. No real vendor execution occurred in 09A. |
| Compromised identity/grant | Revoke the affected shopper/guest authority using its semantic operation | Keep immutable Order/payment history. Current guest Order grant is also bounded by its original guest session; never silently extend it. |

The ordinary purchase kill switch is **not** `CHECKOUT_DRAFTS_ENABLED=false`
or a service shutdown. `protectCheckoutRoutes` currently rejects its whole
namespace when draft protection is off or NODE_ENV is production, including
private post-order routes. Public production purchasing remains intentionally
unavailable; do not remove that protection incidentally. Future activation must
qualify separate post-order HTTP access while preserving new-purchase controls.
09A proves operational-control semantics in the DB engine, not deployed HTTP.

### Reviewed internal kill command template for releases without the Admin control

After explicit environment/operator authorization, run inside the selected API
image on the existing private network with protected environment injection.
Use the actual target organization and active authorized operator UUID. This
internal port relies on privileged operator custody; it is not an authorization
bypass endpoint. Record the reason and incident ID. Never print DATABASE_URL.

```javascript
// Execute as a reviewed one-off Node module in the pinned API image, not via a public route.
import { createDatabase, sql } from '/app/packages/database/dist/src/index.js';
import { findActiveAdminContext, setOperationalControl, appendAuditEvent } from '/app/packages/database/dist/src/platform.js';
const target = new URL(process.env.DATABASE_URL);
if (target.hostname !== 'maevelle-staging-postgres' || target.pathname !== '/maevelle_staging')
  throw new Error('Incorrect staging target');
const db = createDatabase({ connectionString: target.href, maxConnections: 1 });
try {
  const operator = await findActiveAdminContext(db.db, process.env.INCIDENT_ACTOR_ID, {
    organizationId: process.env.INCIDENT_ORGANIZATION_ID,
  });
  // Before use, verify the operator is an active Owner in the intended organization;
  // do not infer authorization from the presence of an actor UUID.
  if (!operator || operator.membershipType !== 'OWNER') throw new Error('Owner required');
  if (!process.env.INCIDENT_REASON?.trim()) throw new Error('Incident reason required');
  await db.db.transaction().execute(async tx => {
    await setOperationalControl(tx, {
      organizationId: operator.organizationId, actorId: process.env.INCIDENT_ACTOR_ID,
      key: 'checkout_enabled', type: 'KILL_SWITCH', enabled: false,
      reason: process.env.INCIDENT_REASON,
    });
    await appendAuditEvent(tx, {
      organizationId: operator.organizationId, actorType: 'USER',
      actorId: process.env.INCIDENT_ACTOR_ID, action: 'checkout.incident.purchases_disabled',
      targetType: 'platform.operational_control',
      metadata: { controlKey: 'checkout_enabled', reason: process.env.INCIDENT_REASON },
    });
  });
  const state = await sql`select enabled from platform.operational_controls
    where organization_id=${operator.organizationId} and control_key='checkout_enabled'`.execute(db.db);
  if (state.rows[0]?.enabled !== false) throw new Error('Containment not confirmed');
} finally { await db.close(); }
```

This template must be reviewed against the candidate's actual Admin context
contract before execution. Re-enable only through separately approved policy,
incident reconciliation and healthy verification; never simply reverse the
boolean because a server restarted.

## Incident matrix

For every row retain detection/query results, containment action/actor/time,
affected IDs in restricted evidence, verified correction and re-enable approval.
Communication uses the incident commander and approved customer-support process.

| Incident / severity / responsible operator | Detection and immediate containment | Verification, recovery and re-enable conditions |
| --- | --- | --- |
| Duplicate Order/effects — P0; Engineering + Finance/Inventory | Compare Checkout placement/Order binding, idempotency receipt, stock allocation, promotion redemption and outbox identity. Stop new purchasing. | Preserve both histories; determine authoritative commit, use semantic cancellation/correction/release after review. Resume only after root cause and exact-key/conservation regression pass; notify affected customers accurately. |
| Oversell — P0; Inventory + Engineering | Compare sellable/reserved/allocated/consumed stock by location/condition. Stop affected purchase paths. | Reconcile inventory ledger and fulfillment; do not directly edit quantities or promise unavailable stock. Approved recovery and contention acceptance required. |
| Incorrect allocation / duplicate receipt — P0; Finance | Compare independently confirmed receipt, permanent reference fence, allocation/unallocated liability and Finance posting. Stop affected verification/collection commands. | Preserve real receipt; use reversal/correction/refund semantic operations with independent evidence. Never delete fence or classify a Finance uniqueness fault as a duplicate provider transfer. Reconcile exact decimal totals before reopening. |
| Unknown refund payout — P0; Finance | Read refund state/version, stable command key and original-source statement. Stop further transfer commands for that intent. | Independent provider/account reconciliation decides completion or confirmed failure. A timeout is not proof of failure. Same completion key after verified evidence; no new payout on retry. |
| Destination compromise — P0; Finance + Security | Suspend exact destination revision and affected method instructions; stop new collection there. | Retain original instructions/receipts, investigate incoming funds and notify affected customers via approved channel. Independent provider/destination approval and security review before replacement. |
| Claim submission failures — P1/P0 if systematic; Support + Payments | Inspect status/429/503/error codes and durable claims using authorized reads; stop new purchase if recovery is unsafe. | Reuse pending keys; recover durable claims and review queue. Do not ask customers to transfer again or invent receipt success. Resume after actual UI/API reconciliation. |
| Account/tenant exposure — P0; Security | Disable affected new operations, revoke scoped credentials, restrict affected read route if necessary. Preserve business records and evidence. | Investigate authorization and stale response/cache sinks; complete notification/legal process with privacy owner. Reopen only after denial/clearing and deployed cache proof. |
| Guest grant leak — P0; Security + Support | Revoke original guest authority/grant lineage. Do not disclose Order by locator. | Approved independent recovery/support process only. Reconcile backup revocations. Test stolen/replayed/expired credentials before restoration. |
| Consent/export failure — P0 privacy; Privacy + Operations | Stop optional dispatch and locally pause collection; retain durable withdrawals. | Identify in-flight/queued sends, reconcile purpose/policy revisions and vendor evidence. Essential commerce stays usable. Separate privacy/vendor authorization required to re-enable. |
| Worker backlog/poison — P1; Operations + owning domain | Inspect pending age, retry/dead-letter status, stable consumer receipts and heartbeat. Isolate poison work; preserve queue. | Fix handler/data via reviewed semantic repair, restart compatible Worker, drain and reconcile unique facts. No automatic uncertain external payout replay. |
| Pool exhaustion — P1/P0 if purchase uncertain; Operations + Database | Inspect connections/acquisition failures/transaction age and capacity; bound new purchase traffic. | Bounded acquisition timeout remains; do not assume timeout rolled back. Recover durable keys and remove root cause. No unbounded pool/retry increase. |
| Severe deadlocks — P0 if integrity/availability affected; Database + Finance | Preserve restricted lock graph and transaction diagnostics; stop affected writers. | Fix lock order/numbering; do not widen global locks or blindly retry new intents. Reproduce relevant same/cross-account graph with conservation. |
| Delivery provider unavailable — P1; Delivery + Support | Stop affected areas/methods, inspect booking unknown outcomes and existing Orders. | Reconcile original booking IDs with provider before retry; approved carrier alternatives and customer communications. No guessed eligibility. |
| Incorrect tax/fee policy — P0; Finance + tax/legal + Engineering | Stop new purchases and invalidate affected final-term review. | Determine affected immutable Orders; approved append-only adjustment/refund handling, never rewrite original payable. Resume after qualified policy revisions and equation tests. |

## Financial and operational reconciliation

For the same tenant/currency/time bounds reconcile: one placement → one Order;
source Cart conversion only for Cart; stock allocations/reservations and releases;
promotion redemptions; obligation original amount versus outstanding; independent
receipts = allocated + unallocated; refunds limited to authorized components;
receipt/refund Finance deltas; COD collection separate from courier custody and
settlement. Reversal/cancellation/late money must preserve liabilities and audit.
Compare payment/refund identities, not just counts; use exact NUMERIC/string
amounts. Outbox/consumer replay cannot generate another business event or cash.

09A local evidence: eight concurrent independent-account receipts/postings total
BDT 320.0000; physical money-command tests finish with one BDT 100.0000 receipt,
BDT 10.0000 completed refund and BDT 90.0000 Finance balance per case. Mixed
sample: 48 receipts BDT 1,920.0000 less 24 × BDT 5.0000 refunds = BDT 1,800.0000.
These are synthetic local facts, not a provider settlement.

## Backup, image rollback and forward repair

1. Gate new writes as required and identify all writers, including Worker and
   auto-deploy. Record current manifest/ledger/media/backup and retained diagnostics.
2. Restore only to a new isolated target first. Verify dump usability, schema,
   financial identities, audits/outbox and media. The local 09A dump/restore
   rehearsal is not a target backup/media or point-in-time recovery acceptance.
3. Reconcile everything after the backup: verified receipts/refunds/provider
   outcomes, Orders/stock, outbox acknowledgements, revoked sessions/grants,
   withdrawn consent and deletion decisions. A restored granted preference or
   live old credential is unsafe even if its backup was valid when taken.
4. Keep access and optional dispatch closed until the complete reconciliation
   source is available. 09A proved a stale backup restores live grant/GRANTED
   consent, then used scoped semantic revocation/withdrawal on the disposable
   target. It did not establish a production revocation journal or generic merger.
5. Prefer compatible images with retained additive schema. There is **no verified
   old-image rollback target for 09A**; `947c296` uses unsafe count-based numbering.
   Mixed old/new financial writers are not approved. Use a reviewed forward repair
   or proven compatible image family. No destructive down migration of money,
   inventory, audit, receipt fence or revocation history.
6. Reopen only with incident commander, Finance and Security/Privacy acceptance,
   recorded reconciliation and healthy API/Worker/browser checks. Restoring an
   image or a backup never independently authorizes purchasing or payouts.

## Monitoring and support readiness

Before live operation assign actual people/on-call coverage, independent Finance
review, statement access and a verified recovery/support path. Monitor receipt
age/unallocated/late liabilities, refund uncertainty, stock/promotion conservation,
Order/placement counts, API safe outcomes, pool/lock pressure, Worker pending
age/retries/dead letters and privacy-proof/withdrawal failures. Set thresholds from
representative target evidence and business operating hours, not localhost timings.
Staff must distinguish unverified claim, cash received, allocated amount, COD
custody, settled cash and refunded funds. Record training and a containment drill.
