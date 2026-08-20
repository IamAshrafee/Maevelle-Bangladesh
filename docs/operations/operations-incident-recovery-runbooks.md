# Maevelle Ecommerce — Operations, Incident Response & Recovery Runbooks

**Document:** `docs/operations/operations-incident-recovery-runbooks.md`
**Status:** Operational Architecture / Source of Truth
**Version:** 0.1
**Related:** Security Architecture, Technical Architecture, Cross-Domain Stress Test, Testing Master Plan, Integrations, Payments, Inventory, Costing, Delivery, Returns, Database Architecture

---

# 1. Purpose

Maevelle must remain operable when things go wrong.

Failures will eventually occur:

```text
database unavailable

disk full

provider API down

payment outcome unknown

worker crash

queue backlog

bad deployment

bad migration

courier webhook duplicated

inventory mismatch

costing mismatch

payment reconciliation mismatch

operator mistake

credentials compromised

backup restore required
```

The platform therefore requires more than:

```text
error handling
```

It requires:

```text
Detection
Containment
Diagnosis
Recovery
Reconciliation
Compensation
Verification
Audit
Post-incident improvement
```

---

# 2. Central Operational Principle

> **Recovery must preserve business truth before restoring convenience.**

When uncertain, prefer:

```text
temporarily block risky mutation
```

over:

```text
guess what probably happened.
```

Examples:

```text
Unknown Refund outcome
→ block duplicate Refund

Unknown Courier Booking
→ reconcile before rebooking

Inventory integrity failure
→ block affected stock mutation

Payment provider uncertainty
→ preserve UNKNOWN state
```

---

# 3. Second Principle

> **UNKNOWN is a legitimate operational state.**

Do not convert uncertainty into:

```text
FAILED
```

only because the local request timed out.

Example:

```text
Maevelle sends courier booking request

Provider receives it

Provider creates consignment

Network response never reaches Maevelle
```

Local truth is:

```text
UNKNOWN_EXTERNAL_OUTCOME
```

not:

```text
BOOKING_FAILED.
```

---

# 4. Third Principle

> **Do not use emergency database edits as the normal repair mechanism.**

Recovery priority:

```text
1. Automatic retry

2. Reconciliation

3. Projection rebuild

4. Semantic compensation

5. Purpose-built repair command

6. Controlled migration/repair script

7. Emergency database intervention
```

Direct database repair is the final option.

---

# 5. Fourth Principle

> **A failed side effect must not invalidate already-committed business truth.**

Examples:

```text
Order committed
Email failed
→ Order remains valid

Payment verified
Notification failed
→ Payment remains valid

Return received
Refund provider down
→ Inventory remains restored

Delivery delivered
Analytics worker down
→ Delivery remains delivered
```

---

# 6. Fifth Principle

> **Every incident should answer four questions immediately.**

```text
What business truth is already committed?

What operations are unsafe right now?

What operations can safely continue?

How will we prove recovery succeeded?
```

---

# 7. Operational Terminology

Canonical terms:

```text
Incident

Alert

Exception

Integrity Issue

Operational Hold

Degraded Mode

Maintenance Mode

Reconciliation

Repair

Compensation

Recovery Verification

Post-Incident Review
```

---

# 8. Alert

An automated signal indicating something abnormal.

Examples:

```text
API error rate spike

Worker backlog

Provider auth failure

Disk space low

Inventory reconciliation mismatch
```

An Alert does not automatically mean full Incident.

---

# 9. Exception

A localized business workflow problem.

Examples:

```text
one courier booking failed

one Payment requires reconciliation

one Return contains wrong item
```

Often resolved inside Admin.

---

# 10. Integrity Issue

Evidence that authoritative data may violate a system invariant.

Examples:

```text
Inventory Ledger does not reconcile

Payment allocations exceed Payment

COGS reversal exceeds recognized quantity

cross-organization reference exists
```

Higher severity than routine workflow exception.

---

# 11. Incident

A problem affecting:

```text
system availability

business correctness

financial integrity

security

data integrity

large operational volume
```

requiring coordinated response.

---

# 12. Operational Hold

A targeted restriction preventing unsafe actions while allowing unrelated business operations.

Examples:

```text
Block Fulfillment for one Inventory Item

Block Refund for one Payment

Block Booking for one Delivery

Block Costing finalization for one Shipment
```

---

# 13. Degraded Mode

System remains partially functional.

Example:

```text
Courier API unavailable
```

while:

```text
Storefront browsing

Orders

Inventory

Admin
```

continue.

---

# 14. Maintenance Mode

Broad user-facing mutations are intentionally restricted.

Used only when:

```text
database integrity

migration

major infrastructure failure
```

makes continuing unsafe.

---

# 15. Emergency Commerce Controls

The platform should support targeted emergency switches.

Recommended:

```text
Checkout Pause

Order Placement Pause

Payment Method Disable

Courier Provider Disable

Automatic Courier Booking Disable

Refund Processing Pause

Inventory Fulfillment Hold

Promotion Disable

Import Pause

Webhook Delivery Pause
```

---

# 16. Why Targeted Controls?

If:

```text
Pathao API is broken
```

do not shut down:

```text
Storefront

Payments

Inventory

Steadfast.
```

Disable only the affected capability where possible.

---

# 17. Emergency Controls Are Audited

Every activation requires:

```text
Actor

Reason

Time

Previous state

Expected impact
```

and restoration is also audited.

---

# 18. Incident Severity

Recommended:

```text
SEV-0

SEV-1

SEV-2

SEV-3
```

---

# 19. SEV-0 — Critical Integrity/Security Emergency

Examples:

```text
Confirmed cross-organization data exposure

Active credential compromise with privileged access

System producing duplicate Payments at scale

Inventory corruption affecting many Orders

Irrecoverable primary database failure

Widespread financial corruption
```

Response:

```text
Immediate containment

Potential mutation shutdown

Owner/security escalation

Preserve forensic evidence

Recovery verification mandatory
```

---

# 20. SEV-1 — Major Business Impact

Examples:

```text
Checkout unavailable

Payment processing largely unavailable

Database severe degradation

Courier booking unavailable across all providers

Worker system unable to process critical queues

Disk near/full affecting writes
```

---

# 21. SEV-2 — Partial/Localized Degradation

Examples:

```text
one provider unavailable

analytics delayed

email failing

search degraded

one workflow queue stalled
```

---

# 22. SEV-3 — Minor Operational Issue

Examples:

```text
individual stale job

single mapping mismatch

non-critical report issue

isolated UI error
```

---

# 23. Incident Lifecycle

Canonical:

```text
DETECTED
   ↓
TRIAGED
   ↓
CONTAINED
   ↓
RECOVERING
   ↓
RECOVERED
   ↓
VERIFIED
   ↓
REVIEWED
```

Security incidents retain the previously established:

```text
DETECTED
→ TRIAGED
→ CONTAINED
→ ERADICATED
→ RECOVERED
→ REVIEWED
```

where appropriate.

---

# 24. Incident Record

Recommended fields:

```text
Incident ID

Severity

Status

Title

Started At

Detected At

Affected systems/domains

Customer impact

Business impact

Containment actions

Recovery actions

Current owner

Timeline

Evidence links

Resolved At

Verification result

Post-incident actions
```

---

# 25. Incident Commander

For SEV-0/SEV-1 designate one coordinator.

Responsibilities:

```text
maintain incident state

coordinate actions

prevent conflicting repairs

record decisions

control escalation

declare recovery
```

The Incident Commander does not need to personally perform every technical action.

---

# 26. Single-Writer Incident Principle

During a major repair:

> One person/process coordinates authoritative mutation decisions.

Avoid:

```text
Developer A repairs inventory

Operator B retries order

Developer C manually edits database
```

simultaneously without coordination.

---

# 27. Incident Timeline

Every major action should be recorded:

```text
17:08 Alert triggered

17:12 Checkout paused

17:15 DB storage confirmed 99%

17:21 log volume cleaned

17:25 DB writes restored

17:29 integrity suite started

17:37 checkout resumed
```

---

# 28. Communications

Operational messaging should state:

```text
Impact

Current status

Workaround if available

What users/operators should avoid
```

Avoid speculation.

---

# 29. Internal Status Example

```text
Pathao booking is currently unavailable.

Existing Orders and Inventory are safe.

Do not manually retry bookings marked "Checking outcome."

Steadfast and Manual Booking remain available.
```

---

# 30. Customer Communication

Only when customer impact exists.

Example:

```text
We're experiencing a temporary delay arranging some deliveries.
Your Order remains confirmed.
```

Do not expose internal infrastructure details unnecessarily.

---

# 31. Runbook Standard Structure

Every runbook should contain:

```text
Trigger

Severity Guidance

Symptoms

Immediate Containment

What Must Not Be Done

Diagnosis

Recovery

Reconciliation

Verification

Rollback/Compensation

Escalation

Customer Impact

Operator Guidance

Monitoring

Post-Incident Actions
```

---

# 32. RUNBOOK — Database Unavailable

## Trigger

```text
PostgreSQL unreachable

connection failures across application

health check failing
```

## Immediate containment

```text
Stop unsafe mutations if DB cannot confirm writes.

API returns controlled service-unavailable responses.

Do not redirect writes to an improvised alternative database.
```

Read-only pages backed entirely by unavailable DB may also fail.

---

# 33. Database Unknown Commit Risk

If connection breaks during commit:

```text
client does not know whether transaction committed.
```

For idempotent commands:

```text
retry same Idempotency Key after DB returns.
```

Do not create new logical operation.

---

# 34. Database Recovery

Investigate:

```text
PostgreSQL process

host health

disk

memory

connection limit

filesystem

container/runtime

network
```

Restore PostgreSQL before clearing UNKNOWN operations.

---

# 35. Database Verification

Run:

```text
health checks

critical integrity suite

outbox checks

job lease checks

recent transaction reconciliation
```

before declaring full recovery.

---

# 36. RUNBOOK — Database Connection Pool Exhaustion

Symptoms:

```text
API timeouts

"too many connections"

worker/API both degraded
```

Containment:

```text
reduce non-essential concurrency

pause large reports/imports

inspect leaking/long-running transactions
```

Never simply:

```text
increase connection limit indefinitely.
```

---

# 37. Pool Diagnosis

Inspect:

```text
active connections

idle-in-transaction

long queries

worker concurrency

deployment instance count

pool configuration
```

---

# 38. RUNBOOK — Database Lock Contention / Deadlocks

Symptoms:

```text
PlaceOrder latency spike

inventory operations timing out

deadlock errors
```

Correct response:

```text
identify conflicting queries

verify lock ordering

keep transactions short

retry safe transient failures
```

Do not:

```text
disable concurrency safeguards
```

to improve latency.

---

# 39. RUNBOOK — Disk Space Critical

This is particularly important on single-VPS deployment.

Thresholds:

```text
warning

critical

write-danger
```

must be monitored.

Potential consumers:

```text
PostgreSQL

Docker layers

logs

temporary uploads

exports

media processing temp files

backups accidentally stored locally
```

---

# 40. Disk Full Containment

Immediately:

```text
pause imports

pause large exports

pause media processing if consuming temp space

reduce non-essential logging
```

If DB cannot safely write:

```text
pause transactional mutations.
```

---

# 41. Disk Cleanup

Safe cleanup examples:

```text
expired temp files

old rotated logs according to retention

unused container build cache

completed export temp files
```

Never delete:

```text
PostgreSQL data

WAL

unknown database files

live object-storage data
```

to gain emergency space without recovery plan.

---

# 42. Disk Recovery Verification

Verify:

```text
DB writable

filesystem healthy

PostgreSQL logs clean

critical transactions operate

backup system still valid.
```

---

# 43. RUNBOOK — Worker Completely Down

Symptoms:

```text
outbox backlog grows

emails stop

webhooks stop

provider operations remain pending

analytics stale
```

Business transactions may still commit.

---

# 44. Worker Down Containment

Do not shut down API automatically unless workflow critically requires workers.

Admin should show:

```text
Background processing delayed.
```

---

# 45. Worker Recovery

Restart worker.

Verify:

```text
leases recover

stuck RUNNING jobs re-enter safe retry

queues drain

no duplicate external effects.
```

---

# 46. RUNBOOK — Job Queue Backlog

Determine which queue:

```text
critical-provider

payment-reconciliation

notifications

analytics

media

imports

exports
```

Do not treat all jobs equally.

---

# 47. Queue Priority

Recommended priority:

```text
P0
Payment / Refund / Provider Reconciliation

P1
Delivery booking / critical business work

P2
Notifications / operational workflows

P3
Analytics / exports / media non-critical
```

Exact queue names can be refined in implementation.

---

# 48. Queue Backlog Containment

Possible:

```text
pause low-priority queues

increase bounded worker concurrency

disable expensive imports

investigate failing poison jobs
```

---

# 49. Dead Letter

A job reaching DEAD_LETTER requires:

```text
visible Admin/operations issue

error reason

related business entity

safe retry action where possible
```

Never disappear silently.

---

# 50. RUNBOOK — Outbox Backlog

Business data may be correct while side effects are delayed.

Check:

```text
outbox event count

oldest unpublished age

consumer status

worker health
```

---

# 51. Outbox Recovery

Resume consumers.

Verify each independent consumer:

```text
Notifications

Analytics

Webhooks

Integrations
```

has caught up.

---

# 52. Never Delete Outbox Backlog to "Fix" It

Unless events are proven obsolete and disposal is explicitly audited.

---

# 53. RUNBOOK — One Outbox Consumer Broken

Example:

```text
Analytics consumer failing
```

while Notifications works.

Do not mark event globally handled.

Fix only affected consumer checkpoint.

---

# 54. RUNBOOK — Search Projection Broken

Symptoms:

```text
missing products

stale prices

wrong search result
```

Containment:

```text
Checkout remains canonical

Product direct access remains available
```

Potential temporary:

```text
disable search suggestions

show degraded search.
```

---

# 55. Search Recovery

```text
repair consumer

rebuild search projection

compare sample result counts

verify published/archived filtering
```

---

# 56. RUNBOOK — Analytics Projection Broken

Do not modify Orders/Payments to fix Analytics.

Recovery:

```text
identify projection version

clear/rebuild derived tables safely

replay source facts/events

verify golden reconciliation metrics.
```

---

# 57. Analytics Degraded UX

Display:

```text
Analytics data is delayed.
Last updated ...
```

Do not display stale data as live without freshness indication.

---

# 58. RUNBOOK — Object Storage Unavailable

Possible impact:

```text
new uploads fail

media processing fails

some public images unavailable
```

Do not allow:

```text
Asset status = READY
```

when bytes were not stored successfully.

---

# 59. Object Storage Degraded Mode

Existing commerce can continue if necessary.

Fallback images may be used for display.

Payment/Return evidence upload may need temporary disabling if secure storage unavailable.

---

# 60. RUNBOOK — Media Processing Failure

Asset remains:

```text
PROCESSING_FAILED
```

or equivalent.

Original object remains if safely stored.

Retry processing through semantic job.

Do not repeatedly upload duplicate Assets unless necessary.

---

# 61. RUNBOOK — Email Provider Down

Business truth unaffected.

Queue Notification Delivery Attempts.

Admin notification remains available where possible.

---

# 62. Email Failure Recovery

```text
retry temporary failures

stop retrying permanent bounce/rejection

resume after provider recovery
```

No need to replay Order itself.

---

# 63. RUNBOOK — Notification Storm

Symptoms:

```text
thousands of repetitive notifications

queue growth

provider rate limit
```

Containment:

```text
disable affected notification policy

activate storm/rate controls

preserve originating business events.
```

---

# 64. RUNBOOK — Courier Provider Down

Example:

```text
Pathao unavailable
```

Containment:

```text
disable new Pathao automatic bookings

leave existing Deliveries intact

allow other providers/manual booking

show provider health warning.
```

---

# 65. Existing Deliveries

Do not change:

```text
Delivery outcome

tracking
```

based solely on provider outage.

Mark:

```text
tracking stale / provider unavailable.
```

---

# 66. RUNBOOK — Courier Authentication Failure

Immediately:

```text
stop new API operations for affected Integration Account

mark Integration needs attention

do not keep retrying bad credentials aggressively.
```

Investigate:

```text
credential expiry

revocation

configuration mistake

provider account status.
```

---

# 67. Credential Rotation

Reconnect/rotate through Integration configuration.

Do not expose old secret.

After recovery:

```text
reconcile pending provider operations.
```

---

# 68. RUNBOOK — Courier Booking Unknown Outcome

Critical.

State:

```text
UNKNOWN_EXTERNAL_OUTCOME
```

Immediate rule:

> Do not create another external booking until reconciliation establishes whether the first booking exists.

---

# 69. Courier Booking Reconciliation

Use stable:

```text
merchant reference

external lookup

provider tracking search
```

where supported.

Possible outcomes:

### Provider booking exists

```text
link external identity
mark BOOKED
continue.
```

### Provider confirms none

```text
mark failed/retryable
allow safe retry.
```

### Still uncertain

```text
remain UNKNOWN
operator escalation/manual provider check.
```

---

# 70. RUNBOOK — Duplicate Courier Booking Suspected

Immediate:

```text
block handover

identify all external consignments

determine whether any parcel physically moved.
```

If one unused:

```text
cancel unused provider booking.
```

Never delete history.

---

# 71. RUNBOOK — Stale Delivery Tracking

Detection:

```text
Delivery remains IN_TRANSIT beyond expected threshold.
```

Response:

```text
create Delivery Exception

provider reconciliation

operator follow-up if required.
```

Do not guess:

```text
DELIVERED
or
LOST.
```

---

# 72. RUNBOOK — Delivered Callback Duplicated

Expected automatic behavior:

```text
dedupe event

one DeliveryDelivered effect

one COGS recognition

one COD collection recognition path
```

No operator intervention unless reconciliation flags mismatch.

---

# 73. RUNBOOK — Out-of-Order Delivery Events

Example:

```text
DELIVERED
then stale IN_TRANSIT
```

Ignore/regard stale event as historical provider evidence.

Do not regress normalized Delivery state.

---

# 74. RUNBOOK — Delivery Marked Delivered but Customer Disputes

Do not immediately rewrite Delivery state.

Create:

```text
Delivery Dispute / Exception
```

Investigate:

```text
provider proof

tracking

COD collection

customer report

operator evidence.
```

Possible later compensation:

```text
Refund

Return

Provider claim
```

according to actual facts.

---

# 75. RUNBOOK — Confirmed Parcel Lost

Once sufficiently established:

```text
Delivery = LOST

Costing → Inventory Loss

prepaid Payment → Refund workflow where required

COD → no collection if none occurred

Delivery Claim → possible.
```

No RTO Inventory restoration.

---

# 76. RUNBOOK — COD Expected Amount Changed After Booking

Trigger:

```text
customer makes digital payment

Order balance changes

active courier still instructed to collect old COD.
```

Immediate:

```text
mark COD synchronization required

attempt provider update if supported.
```

---

# 77. If COD Update Cannot Be Confirmed

Set:

```text
MANUAL_ACTION_REQUIRED
```

Potential:

```text
cancel/rebook before pickup

contact provider

hold handover.
```

---

# 78. After Courier Handover

Risk is higher.

Do not claim provider COD changed until confirmed.

Admin must show:

```text
Double collection risk.
```

---

# 79. RUNBOOK — COD Under-Collection

Expected:

```text
৳1,500
```

Provider reports:

```text
৳1,300
```

Correct:

```text
Delivery = Delivered

Payment = ৳1,300

Order Balance Due = ৳200

Reconciliation issue open.
```

Do not modify Order Total.

---

# 80. RUNBOOK — COD Over-Collection

Expected:

```text
৳1,500
```

Actual:

```text
৳1,700
```

Record actual Payment:

```text
৳1,700
```

Allocate:

```text
৳1,500 → Order

৳200 → unallocated/customer credit context.
```

Open reconciliation.

---

# 81. RUNBOOK — COD Collected But Provider Settlement Missing

Do not reduce confirmed Customer Payment.

Track:

```text
provider receivable / unsettled amount.
```

Escalate settlement reconciliation according to aging threshold.

---

# 82. RUNBOOK — Payment Provider/API Down

For manual bKash/Nagad V1, verification may be human.

Future provider/gateway outage:

```text
disable affected payment method if required

preserve existing Payment Intents

allow alternative methods according to policy.
```

---

# 83. RUNBOOK — Payment Unknown Outcome

Example:

```text
Refund/payment provider request times out.
```

State:

```text
UNKNOWN_EXTERNAL_OUTCOME
```

Never issue duplicate-prone retry until reconciliation.

---

# 84. RUNBOOK — Duplicate Payment Reference

System should normally prevent confirmation.

If duplicate discovered historically:

```text
open critical Payment Integrity Issue

freeze affected allocations/refunds if necessary

identify legitimate Payment

perform controlled correction.
```

---

# 85. RUNBOOK — Manual Payment Verification Mistake

Example:

Operator confirms wrong transaction.

Do not delete Payment.

Potential correction:

```text
Payment Reversal
```

or approved financial correction based on actual facts.

Audit operator action.

---

# 86. RUNBOOK — Payment Received After Order Cancellation

This is a known stress-test case.

Correct state:

```text
Cancelled Order remains cancelled

Payment remains real

Order requires financial resolution.
```

Possible:

```text
Refund

customer credit

manual resolution
```

Never silently reopen Order.

---

# 87. RUNBOOK — Refund Unknown Outcome

One of the highest-risk workflows.

Immediately:

```text
block another Refund against same refundable amount

status = UNKNOWN_EXTERNAL_OUTCOME

reconciliation required.
```

---

# 88. Refund Reconciliation

Check provider using:

```text
merchant refund reference

provider refund ID

transaction history.
```

Outcomes:

### Provider confirms Refund

```text
record confirmed Refund.
```

### Provider confirms no Refund

```text
mark failed/retryable
allow controlled retry.
```

### Unknown remains

```text
escalate/manual provider verification.
```

---

# 89. RUNBOOK — Duplicate Refund Suspected

Immediately block additional Refunds.

Calculate:

```text
commercial refundable amount

confirmed Refunds

pending Refunds

unknown Refund operations.
```

Do not assume unknown = zero.

---

# 90. RUNBOOK — Inventory Reconciliation Failure

Example:

```text
Ledger-derived quantity != Inventory Level.
```

Immediate:

```text
mark affected Inventory Item/Location integrity-blocked
```

if mismatch can affect oversell.

---

# 91. Inventory Block UX

Internal distinction:

```text
OUT_OF_STOCK
```

versus:

```text
INVENTORY_BLOCKED_DUE_TO_INTEGRITY_ISSUE.
```

Storefront may simply treat affected Variant unavailable.

Admin sees exact integrity issue.

---

# 92. Inventory Recovery

Prefer:

```text
rebuild Inventory Level from authoritative ledger
```

where ledger is trustworthy.

Compare:

```text
ledger

reservations

physical movement

return/receipt links.
```

---

# 93. Never Insert Fake Adjustment to Make Numbers Match

Unless investigation establishes an actual physical adjustment occurred.

Projection repair is not a stock movement.

---

# 94. RUNBOOK — Negative Availability Detected

If oversell disabled and:

```text
ATS < 0
```

unexpectedly:

```text
block new reservations/fulfillments for affected item

open CRITICAL integrity issue.
```

Investigate:

```text
reservation race

manual correction

duplicate fulfillment

bad import/migration.
```

---

# 95. RUNBOOK — Reservation Stuck

Reservation exists beyond expected lifecycle.

Check:

```text
Order state

Fulfillment

expiry

release event

worker status.
```

Use:

```text
ExpireReservation

ReleaseReservation
```

semantic commands where valid.

Do not delete reservation row manually.

---

# 96. RUNBOOK — Duplicate Fulfillment Suspected

Immediately:

```text
hold affected Order/Inventory Item

compare fulfillment records

Inventory transactions

reservation consumption

cost assignments.
```

If duplicate physical mutation occurred:

```text
compensating Inventory transaction

Costing compensation
```

through repair workflow.

Never delete historical Fulfillment.

---

# 97. RUNBOOK — Inbound Receipt Duplicate Suspected

Check:

```text
receipt idempotency

Inventory transaction

Cost Layer creation

warehouse receiving evidence.
```

If stock actually posted twice:

```text
post controlled compensating receipt correction

correct Costing.
```

---

# 98. RUNBOOK — Physical Receipt Does Not Match System

Warehouse count is evidence.

Do not force expected quantity.

Record:

```text
actual quantity

condition

discrepancy

unresolved item
```

then resolve commercially.

---

# 99. RUNBOOK — Unresolved Inbound Item

Stock remains:

```text
unresolved/inspection holding
```

and is not sellable.

Resolve:

```text
identify Inventory Item

create proper mapping

post semantic resolution movement.
```

---

# 100. RUNBOOK — Cost Layer Quantity Mismatch

Immediate:

```text
block cost-sensitive disposition if necessary

Inventory physical truth may continue if safe.
```

Run:

```text
Cost Layer reconciliation

Outbound assignments

Transfers

Returns

Loss allocations.
```

---

# 101. Costing Principle During Incident

Do not change physical Inventory solely to make Costing match.

Costing and Inventory are separate truths.

---

# 102. RUNBOOK — Unvalued Inventory

This may be expected.

Admin queue:

```text
Unvalued Inventory
```

Resolve through:

```text
known Receipt

opening balance source

manual approved cost basis.
```

Do not set cost to zero.

---

# 103. RUNBOOK — Late Landed Cost Processing Failure

Original Inventory remains valid.

Landed Cost revision stays:

```text
pending/failed
```

Do not partially update some Cost Layers invisibly.

The apply operation should be transactional or safely resumable.

---

# 104. RUNBOOK — Landed Cost Applied Incorrectly

Do not rewrite historic Cost Layer amounts.

Create:

```text
Cost Layer Adjustment
```

to reverse/correct incorrect allocation.

Affected COGS receives corresponding adjustments.

---

# 105. RUNBOOK — COGS Missing After Delivery

Check:

```text
DeliveryDelivered event

Outbound Cost Assignment

COGS consumer/command

Costing status.
```

If event missed but truth is known:

```text
re-run idempotent RecognizeCOGS.
```

---

# 106. RUNBOOK — COGS Recognized Twice

Should be prevented by constraints/idempotency.

If detected:

```text
CRITICAL Costing Integrity Issue

block affected Margin reporting

create controlled COGS correction/reversal.
```

Do not delete historical recognition row.

---

# 107. RUNBOOK — Customer Return Received but Refund Failed

Correct:

```text
Return Receipt remains posted

Inventory/Cost restored

Refund remains pending/unknown/failed.
```

Never reverse physical receipt because payment provider failed.

---

# 108. RUNBOOK — Refund Completed but Item Never Returned

Possible if policy permitted refund-first.

Correct:

```text
Refund remains real

Inventory not restored

COGS not reversed

Return remains overdue/lost/closed according to resolution.
```

---

# 109. RUNBOOK — RTO Provider Says Returned, Warehouse Has Not Received

Correct:

```text
RTO transport indicates arrived/returned

Inventory unchanged

Return Receipt still required.
```

Create aging/receiving exception.

---

# 110. RUNBOOK — Wrong Item in Return

Record actual physical truth.

Do not restore expected SKU.

Move actual item into:

```text
unresolved/inspection
```

and open discrepancy.

---

# 111. RUNBOOK — Return Inventory Restored Twice

Critical.

Contain:

```text
block affected item if sellable count overstated

identify duplicate Return transactions.
```

Repair via compensating Inventory/Costing transaction.

---

# 112. RUNBOOK — Promotion Usage Mismatch

Example:

```text
usage count > valid committed Orders
```

or:

```text
committed Order missing usage.
```

Pause affected Promotion if active exploitation risk exists.

Reconcile from:

```text
Order Discount Applications

Promotion Usage history

cancellations/releases.
```

---

# 113. Do Not Change Historical Discount

Repair usage bookkeeping without recalculating committed Order prices.

---

# 114. RUNBOOK — Pricing Snapshot Mismatch

If:

```text
Order component totals do not reconcile
```

mark:

```text
Pricing Integrity Issue.
```

Do not recalculate from current Catalog/Promotion.

Use committed:

```text
Order Lines

Discount Applications

Allocations

Delivery snapshot.
```

---

# 115. RUNBOOK — Customer Merge Problem

If erroneous merge suspected:

```text
freeze further merge involving canonical chain

inspect alias graph

Orders

Promotion usage

Reviews

contacts.
```

Because merge is designed alias-based, historical Orders should remain intact.

Repair canonical/alias resolution explicitly.

---

# 116. Never Rewrite Every Historical Customer FK During Emergency

That destroys provenance and increases blast radius.

---

# 117. RUNBOOK — Geography Provider Mapping Broken

Impact:

```text
courier bookings fail for certain Area.
```

Canonical customer Addresses remain valid.

Actions:

```text
fix Provider Area mapping

reconcile failed bookings

retry safely.
```

No need to edit Customer Addresses unless they themselves are wrong.

---

# 118. RUNBOOK — Provider Geography Sync Returns Empty Dataset

Treat sync as failed.

Do not deprecate all existing Provider Areas.

Alert operator.

Retain last trusted provider dataset.

---

# 119. RUNBOOK — Bad Import

If import has not been confirmed:

```text
discard staging import.
```

If committed:

```text
identify imported records

use domain-specific correction/archive commands.
```

Never perform giant generic DELETE without impact analysis.

---

# 120. RUNBOOK — Import Partially Processes then Worker Crashes

Import design must be:

```text
row-idempotent

checkpointed

restartable.
```

Resume from job state.

Do not restart blindly from row 1 if duplicate-prone.

---

# 121. RUNBOOK — Large Export Overloads System

Cancel/limit export job.

Exports are lower priority than commerce.

Apply:

```text
row limits

batching

worker isolation.
```

---

# 122. RUNBOOK — Bad Configuration Change

Examples:

```text
wrong default warehouse

incorrect delivery method

payment method misconfigured

notification template broken.
```

Use:

```text
configuration audit

previous value

impact semantics.
```

If safe:

```text
restore previous configuration.
```

Historical transactions remain unchanged.

---

# 123. RUNBOOK — Dangerous Setting Enabled

Immediately:

```text
disable affected capability

identify transactions created since change

run impact query

open Integrity Issue if actual corruption occurred.
```

---

# 124. RUNBOOK — Permission Configuration Mistake

Example:

User accidentally receives Finance permission.

Immediate:

```text
revoke grant

invalidate/re-evaluate sessions as required

audit actions during exposure window.
```

If sensitive data accessed:

```text
security incident assessment.
```

---

# 125. RUNBOOK — Compromised User Session

Actions:

```text
revoke affected session

potentially revoke all user sessions

reset credentials if relevant

review audit/security log

check high-risk actions.
```

---

# 126. RUNBOOK — Compromised API Credential

Immediately:

```text
revoke credential

rotate replacement

review recent calls

identify affected scope

reconcile business mutations.
```

Do not wait for provider/system recovery.

---

# 127. RUNBOOK — Secret Accidentally Logged

Treat as compromised.

Actions:

```text
rotate secret

restrict/remove log access if possible

review exposure

improve masking rule.
```

Deleting one log line is not sufficient if secret was exposed.

---

# 128. RUNBOOK — Suspected Cross-Organization Data Leak

**SEV-0.**

Immediate:

```text
disable affected endpoint/feature

preserve evidence

identify Organizations/resources exposed

invalidate suspicious credentials/sessions if needed.
```

Do not continue serving endpoint while investigation occurs.

---

# 129. Cross-Tenant Investigation

Review:

```text
request logs

audit logs

tenant FK paths

authorization checks

queries

cache keys

exports

search indexes.
```

---

# 130. Recovery Requirement

Before re-enabling:

```text
root cause fixed

cross-org test added

security regression suite passes

affected data scope understood.
```

---

# 131. RUNBOOK — Malicious Request / Attack Spike

Possible:

```text
coupon brute force

fake COD Orders

login attack

review spam

API abuse.
```

Actions:

```text
rate-limit

temporarily block abusive source where appropriate

enable stricter challenge/risk rules

preserve evidence.
```

Avoid broad shutdown unless necessary.

---

# 132. RUNBOOK — Webhook Signature Attack

Invalid provider callbacks:

```text
reject

do not mutate domain

record security signal

rate-limit abusive source.
```

Do not expose why signature failed in detail externally.

---

# 133. RUNBOOK — Webhook Storm

Protect:

```text
API capacity

job queue

database.
```

Use:

```text
dedupe

bounded ingestion

queue isolation

rate controls.
```

Critical customer/API traffic gets priority.

---

# 134. RUNBOOK — Bad Deployment

Symptoms:

```text
500 errors

worker crash

frontend broken

unexpected query failures.
```

Immediate decision:

```text
roll forward
or
rollback application image.
```

Do not edit production source manually through SSH.

---

# 135. Deployment Rollback

Use previous known-good immutable image/version.

Verify schema compatibility before rollback.

---

# 136. Schema Compatibility Problem

If new migration is not backward compatible:

```text
application rollback may be unsafe.
```

Follow migration-specific recovery plan.

This is why expand-and-contract is preferred.

---

# 137. RUNBOOK — Failed Migration Before Completion

Determine:

```text
did migration transaction rollback?

did it partially apply outside transaction?

did data backfill partially run?
```

Never rerun blindly before understanding migration semantics.

---

# 138. Migration Recovery Categories

### Fully transactional migration failed

Usually:

```text
rollback automatic
fix migration
retry.
```

### Partial non-transactional migration

Requires:

```text
migration-specific resume/repair.
```

### Destructive migration failure

Potential:

```text
restore backup/PITR.
```

---

# 139. RUNBOOK — Bad Migration Succeeded

If application/data incorrect:

```text
stop affected mutation paths

assess whether forward repair possible.
```

Prefer:

```text
corrective forward migration
```

over unsafe reverse migration when data has already changed.

---

# 140. Backup Before High-Risk Migration

Mandatory.

But:

> Backup exists ≠ recovery guaranteed.

Restore procedure must already be tested.

---

# 141. RUNBOOK — Application Starts Against Unexpected Schema Version

Fail readiness.

Do not serve traffic in undefined compatibility state.

---

# 142. RUNBOOK — Worker Version Mismatch

Old Worker processing new job payload can be dangerous.

Job payload has:

```text
version.
```

Unknown versions:

```text
do not process
move to blocked/dead-letter state
alert.
```

---

# 143. RUNBOOK — API/Worker Deployment During Active Jobs

Graceful shutdown:

```text
stop claiming new jobs

finish safe current job or release lease

close DB connections

exit.
```

---

# 144. Long External Job at Shutdown

If uncertain external operation:

```text
persist state

reconcile after restart.
```

---

# 145. RUNBOOK — Entire VPS Lost

Assumption:

```text
single VPS is not highly available.
```

Recovery objective is:

```text
recoverable architecture.
```

---

# 146. VPS Loss Recovery

Provision replacement host.

Restore:

```text
infrastructure config

secrets

PostgreSQL backup

object storage connectivity/data if self-hosted

application images/config

reverse proxy

workers.
```

---

# 147. Recovery Order

Recommended:

```text
1. Infrastructure/network

2. PostgreSQL

3. Object storage access

4. API

5. Admin/Storefront

6. Worker

7. Provider integrations

8. Background projections
```

---

# 148. Before Reopening Commerce

Verify:

```text
DB integrity

inventory reconciliation

payment state

recent provider operations

outbox/jobs

backup timestamp gap

external provider divergence.
```

---

# 149. External State Divergence After Restore

Critical issue.

Example:

Backup time:

```text
14:00
```

Restore occurs:

```text
17:00
```

But provider processed:

```text
Payments

Courier deliveries

Refunds
```

between 14:00–17:00.

---

# 150. Never Assume Restored DB Is Current External Truth

Run provider reconciliation before resuming duplicate-prone operations.

---

# 151. Restore Reconciliation Areas

```text
Payment callbacks/transactions

Refund operations

Courier bookings

Delivery states

COD collections

Settlements

webhook delivery where important.
```

---

# 152. RUNBOOK — Database Backup Restore Drill

Regular drill:

```text
restore isolated DB

start compatible application

run integrity suite

run smoke tests

compare backup metadata.
```

Record:

```text
restore duration

failures

manual steps

missing dependencies.
```

---

# 153. RUNBOOK — Object Storage Loss

If object storage self-hosted and lost:

Database may contain Asset metadata without bytes.

Do not mark Assets available.

Recovery:

```text
restore object backup

reconcile object keys

reprocess renditions where possible.
```

Private evidence loss is higher-severity than missing public Product image.

---

# 154. RUNBOOK — Backup Found Corrupt

Escalate immediately.

Test:

```text
older backup

replica/PITR if available.
```

A corrupted backup is an operational incident even before production fails.

---

# 155. RUNBOOK — Time/Clock Misconfiguration

Symptoms:

```text
Promotions activate incorrectly

jobs expire incorrectly

timestamps strange

provider signature windows fail.
```

Immediate:

```text
fix system time/NTP

do not rewrite historical timestamps automatically.
```

Investigate affected time-sensitive operations.

---

# 156. RUNBOOK — Organization Timezone Misconfigured

Configuration affects presentation/business-day interpretation, not stored absolute timestamps.

Correct setting.

Assess:

```text
scheduled actions

reports

promotion windows
```

created under incorrect assumption.

---

# 157. RUNBOOK — Third-Party Dependency Rate Limited

Respect:

```text
Retry-After

backoff

jitter.
```

Do not increase retry aggression.

Reduce concurrency.

Queue work.

---

# 158. RUNBOOK — Third-Party Provider Sends Malformed Response

Treat operation as:

```text
provider error

or UNKNOWN if external effect may have happened.
```

Preserve raw response securely for diagnosis.

Do not deserialize partial values into business truth.

---

# 159. RUNBOOK — Third-Party Provider Changes API

Symptoms:

```text
validation errors

unknown statuses

payload schema changes.
```

Disable affected integration capability if unsafe.

Do not make core domain changes immediately to mirror provider naming.

Update adapter.

---

# 160. RUNBOOK — Unknown Provider Status

Store raw event.

Map normalized result:

```text
UNMAPPED_PROVIDER_STATUS
```

Create integration exception.

Do not guess semantic state.

---

# 161. RUNBOOK — Projection Rebuild

Applicable to:

```text
Search

Review summaries

Analytics

Customer statistics

some Admin summaries.
```

Procedure:

```text
identify projection version

stop/coordinate consumer if required

clear/rebuild safely

replay canonical data/events

switch/re-enable projection

verify counts/checksums/spot checks.
```

---

# 162. Never Rebuild Ledger Truth as Projection

The following are not casually disposable:

```text
Inventory Ledger

Payments

Orders

Cost Assignments

Audit history.
```

---

# 163. RUNBOOK — Integrity Issue Framework

Every integrity issue has:

```text
Issue Type

Domain

Entity

Severity

Detected At

Detection Source

Status

Evidence

Recommended Action

Resolved By

Resolution
```

---

# 164. Integrity Status

```text
OPEN

INVESTIGATING

BLOCKED

RESOLVED

ACCEPTED_WITH_REASON
```

---

# 165. Integrity Issues Can Apply Operational Holds

Examples:

```text
Inventory mismatch
→ hold Inventory Item

Refund mismatch
→ hold Refund actions for Payment

Cost mismatch
→ hold Cost finalization/reporting
```

---

# 166. Health Dashboard

Operations needs one consolidated health view.

Sections:

```text
Application

Database

Workers

Queues

Object Storage

Payments

Delivery Providers

Notifications

Search

Analytics

Integrity

Backups

Security
```

---

# 167. Health State

Recommended:

```text
HEALTHY

DEGRADED

UNHEALTHY

UNKNOWN
```

---

# 168. Health Is Not One Boolean

Example:

```text
Storefront Healthy

Pathao Degraded

Analytics Delayed

Backups Healthy
```

is useful.

One:

```text
System: OK
```

is not.

---

# 169. Core Infrastructure Metrics

Monitor:

```text
CPU

memory

disk usage

disk I/O

network

container restarts

DB connections

DB latency

DB locks

API latency

API error rate
```

---

# 170. Worker Metrics

```text
queue depth

oldest job age

jobs/minute

retry count

dead letters

worker heartbeat

lease age
```

---

# 171. Outbox Metrics

```text
pending events

oldest pending age

consumer lag

failed consumer attempts.
```

---

# 172. Payment Metrics

```text
payment verification backlog

unknown provider outcomes

refund unknown outcomes

settlement backlog

COD mismatches
```

---

# 173. Delivery Metrics

```text
booking failures

unknown bookings

stale tracking

delivery exceptions

RTO aging

COD sync issues

provider availability
```

---

# 174. Inventory Metrics

```text
negative availability anomalies

unreconciled Inventory

reservation aging

stocktake issues

unresolved receipts
```

---

# 175. Costing Metrics

```text
unvalued quantity

COGS missing

Cost Layer mismatches

late-cost adjustment failures.
```

---

# 176. Backup Metrics

```text
last successful DB backup

backup size anomaly

backup age

last restore drill

restore drill result.
```

---

# 177. Alert Philosophy

Alert only when:

```text
human action may be required

or

serious automatic recovery is failing.
```

Do not alert for every normal retry.

---

# 178. Alert Fatigue Prevention

Use:

```text
deduplication

aggregation

severity

suppression windows

recovery notifications.
```

---

# 179. Example Good Alert

```text
CRITICAL: PostgreSQL disk 94% full.
Estimated operational risk: writes may fail.
```

---

# 180. Example Bad Alert

```text
Job retry #1 failed.
```

if automatic retry is expected and healthy.

---

# 181. Maintenance Mode

Broad maintenance should be rare.

Potential modes:

```text
READ_ONLY_ADMIN

CHECKOUT_DISABLED

ALL_MUTATIONS_DISABLED
```

Avoid a single ambiguous switch where possible.

---

# 182. Checkout Pause UX

Customer sees:

```text
Ordering is temporarily unavailable.
Please try again shortly.
```

Browsing remains available where safe.

---

# 183. Admin Mutation Pause

Admin can still inspect data while mutation is blocked.

Prominent banner:

```text
Some changes are temporarily disabled while the system is being repaired.
```

---

# 184. Payment Method Kill Switch

Example:

```text
bKash manual instructions misconfigured.
```

Disable:

```text
new selection
```

without affecting existing Orders/Payments.

---

# 185. Courier Provider Kill Switch

Disable:

```text
new bookings

automatic status-dependent actions if provider compromised
```

while preserving existing data.

---

# 186. Promotion Kill Switch

If Promotion bug is causing financial loss:

```text
pause Promotion
```

for future Checkout.

Do not recalculate committed Orders.

---

# 187. Integration Credential Kill Switch

Revoke:

```text
API client

Webhook subscription

provider credential
```

individually.

---

# 188. Operational Runbook UI

Admin Operations section should provide:

```text
Health

Attention Center

Integrity Issues

Jobs

Integrations

Incidents

Maintenance Controls
```

for appropriately privileged users.

---

# 189. Repair Command UX

Every high-risk repair should show:

```text
Detected issue

Affected entities

Current truth

Proposed change

Side effects

Audit reason
```

before execution.

---

# 190. Dry Run

Strongly preferred for repair commands.

Example:

```text
Rebuild Inventory Level

Current materialized level:
18

Ledger-derived:
16

Proposed:
16

No physical ledger entry will be created.
```

---

# 191. Repair Idempotency

Repair command must be safe if:

```text
operator retries after response loss.
```

---

# 192. Repair Authorization

Potential capabilities:

```text
operations.incidents.manage

integrity.view

integrity.resolve

inventory.repair

payments.reconcile

delivery.reconcile

costing.repair

projections.rebuild
```

---

# 193. Emergency Database Access

Production DB direct-write access should be highly restricted.

Default developers/operators:

```text
no routine direct-write access.
```

---

# 194. Emergency SQL Procedure

If unavoidable:

```text
1. Declare incident.

2. Capture backup/snapshot if practical.

3. Document exact invariant broken.

4. Define expected final state.

5. Prepare peer-reviewed SQL.

6. Execute inside controlled transaction where possible.

7. Record affected IDs/counts.

8. Run reconciliation.

9. Add permanent application repair capability if recurrence possible.

10. Add regression test.
```

---

# 195. Never Perform Unrecorded Production Repair

Every emergency correction must leave:

```text
Incident record

Audit/repair note

SQL/script version where relevant

Verification evidence.
```

---

# 196. Operator Mistake Policy

Do not design system assuming operators never make mistakes.

Actions should be recoverable where possible.

Examples:

```text
Payment verification
→ reversal

Inventory adjustment
→ compensating adjustment

Return receipt
→ correction transaction

Landed cost
→ adjustment

Permission grant
→ revoke + audit
```

---

# 197. Destructive Actions

Avoid irreversible:

```text
delete
```

for business truth.

Prefer:

```text
cancel

archive

reverse

adjust

compensate.
```

---

# 198. Incident Customer Data Safety

During debugging:

```text
minimize PII copied into tickets/logs/screenshots.
```

Use internal entity IDs where sufficient.

---

# 199. Incident Evidence Retention

Security and major financial incident evidence may require longer retention than routine logs.

Exact retention policy should be configurable/documented later.

---

# 200. Post-Incident Review

Required for:

```text
SEV-0

SEV-1

repeated SEV-2

any financial/data integrity issue.
```

---

# 201. Post-Incident Questions

```text
What happened?

What was the customer/business impact?

Why did prevention fail?

Why did detection take this long?

Did containment work?

Was recovery safe?

Did runbook match reality?

What manual actions were required?

What tests were missing?

What monitoring was missing?

What architecture must change?
```

---

# 202. Blameless Does Not Mean Accountability-Free

Review:

```text
system/process weaknesses

decision quality

missing safeguards
```

without using postmortem to shame operators.

---

# 203. Required Outputs After Incident

Potential:

```text
Bug fix

Regression test

New invariant

New alert

Updated runbook

New repair command

Permission change

Provider adapter fix

Schema constraint

Capacity change
```

---

# 204. Incident → Test Requirement

Every reproducible Incident defect should enter:

```text
Testing Master Plan regression suite.
```

---

# 205. Incident → Architecture Requirement

If system had no safe recovery path:

```text
architecture gap
```

must be documented and closed.

---

# 206. Runbook Catalog

Initial required runbooks:

```text
OPS-001 Database Unavailable

OPS-002 Database Pool Exhaustion

OPS-003 Lock/Deadlock Incident

OPS-004 Disk Space Critical

OPS-005 VPS Loss

OPS-006 Worker Down

OPS-007 Queue Backlog

OPS-008 Dead Letter

OPS-009 Outbox Backlog

OPS-010 Search Projection Failure

OPS-011 Analytics Failure

OPS-012 Object Storage Failure

OPS-013 Notification Provider Failure

OPS-014 Courier Provider Outage

OPS-015 Courier Auth Failure

OPS-016 Courier Unknown Booking

OPS-017 Duplicate Courier Booking

OPS-018 Stale Delivery

OPS-019 Parcel Lost

OPS-020 COD Sync Mismatch

OPS-021 COD Settlement Delay

OPS-022 Payment Unknown Outcome

OPS-023 Duplicate Payment

OPS-024 Payment Verification Error

OPS-025 Refund Unknown Outcome

OPS-026 Duplicate Refund

OPS-027 Inventory Reconciliation Failure

OPS-028 Negative Availability

OPS-029 Stuck Reservation

OPS-030 Duplicate Fulfillment

OPS-031 Duplicate Inbound Receipt

OPS-032 Receipt Discrepancy

OPS-033 Cost Layer Mismatch

OPS-034 Unvalued Inventory

OPS-035 Landed Cost Failure

OPS-036 COGS Reconciliation

OPS-037 Return/Refund Mismatch

OPS-038 Duplicate Return Restoration

OPS-039 Promotion Usage Mismatch

OPS-040 Pricing Snapshot Mismatch

OPS-041 Customer Merge Issue

OPS-042 Geography Mapping Failure

OPS-043 Bad Import

OPS-044 Bad Configuration

OPS-045 Permission Mistake

OPS-046 Compromised Session

OPS-047 Compromised API Credential

OPS-048 Cross-Organization Leak

OPS-049 Webhook Attack/Storm

OPS-050 Bad Deployment

OPS-051 Migration Failure

OPS-052 Backup Restore

OPS-053 Backup Corruption

OPS-054 Clock/Timezone Incident

OPS-055 Provider API Breaking Change
```

---

# 207. Operational Readiness Checklist — New Domain

Before a new domain feature launches, answer:

```text
What fails?

How is failure detected?

Can unrelated business continue?

What is retryable?

What can produce UNKNOWN state?

What requires reconciliation?

What can be compensated?

What can be rebuilt?

What needs an operational hold?

What can an operator repair?

What needs emergency escalation?
```

---

# 208. Operational Readiness — External Integration

Must have:

```text
Health check

Timeout policy

Retry policy

Unknown-outcome handling

Idempotency strategy

Reconciliation

Manual fallback

Credential rotation

Rate-limit behavior

Provider outage behavior

Raw-event diagnostics
```

---

# 209. Operational Readiness — Financial Workflow

Must have:

```text
Idempotency

Concurrency protection

Unknown outcome

Reconciliation

Correction mechanism

Audit

Customer communication policy

Operator queue.
```

---

# 210. Operational Readiness — Inventory Workflow

Must have:

```text
Ledger

Concurrency

Reconciliation

Physical discrepancy support

Compensation

Integrity block

Operator repair.
```

---

# 211. Operational Readiness — Derived Projection

Must have:

```text
Freshness metric

Rebuild

Version

Source authority

Failure degradation.
```

---

# 212. Recovery Priority Matrix

### Tier A — Customer money / stock / security

```text
Payments

Refunds

Inventory

Costing

Orders

Authorization
```

Highest recovery and verification priority.

### Tier B — Operational execution

```text
Delivery

Returns

Procurement

Receiving

Integrations
```

### Tier C — Convenience/derived

```text
Search

Analytics

Email

recommendations

exports.
```

---

# 213. Recovery Time vs Recovery Correctness

Fast recovery is desirable.

But:

> Never trade data integrity for an artificial uptime number.

---

# 214. Recovery Point Awareness

Backups should state:

```text
Recovery Point Objective
```

eventually.

Before formal SLA:

```text
know exact age of latest usable backup.
```

---

# 215. Recovery Time Awareness

Restore drills provide real:

```text
Recovery Time Objective evidence
```

instead of guesses.

---

# 216. Launch Blocking Operations Requirements

Before production launch:

```text
✓ Automated DB backups

✓ Off-VPS backup copy

✓ Successful restore drill

✓ Disk monitoring

✓ Database monitoring

✓ API error monitoring

✓ Worker heartbeat

✓ Queue backlog monitoring

✓ Dead-letter visibility

✓ Outbox monitoring

✓ Provider health

✓ Integrity dashboard

✓ Emergency Checkout pause

✓ Payment Method disable

✓ Courier Provider disable

✓ Audit logs

✓ Session/API credential revocation

✓ Production deploy rollback procedure

✓ Migration recovery procedure

✓ Incident severity model

✓ Critical runbooks accessible to operators/developers
```

---

# 217. Strongly Preferred Launch Operations

```text
✓ Central error tracking

✓ Alert routing

✓ Automated production read-only reconciliation

✓ Health dashboard

✓ Queue priority isolation

✓ Provider status dashboard

✓ Backup age alerts

✓ Restore drill schedule

✓ Incident timeline tooling

✓ Maintenance banner support

✓ Dry-run repair commands
```

---

# 218. Deferred Operational Sophistication

Not required V1:

```text
Kubernetes auto-healing

multi-region failover

24/7 formal NOC

active-active database

chaos engineering platform

automated multi-provider courier failover under UNKNOWN states

full SIEM

service mesh

automated database failover cluster
```

---

# 219. Operations Invariants

### OPS-INV-001

Unknown external outcomes are reconciled before duplicate-prone retry.

### OPS-INV-002

Provider outage never rewrites committed business truth.

### OPS-INV-003

Derived projection failure cannot corrupt transactional authority.

### OPS-INV-004

Inventory projection mismatch is repaired from authoritative history rather than masked by fake stock adjustment.

### OPS-INV-005

Financial unknown state blocks operations that could duplicate money movement.

### OPS-INV-006

A Refund provider timeout never automatically permits another Refund.

### OPS-INV-007

Courier booking timeout never automatically creates another booking.

### OPS-INV-008

Return/provider status cannot restore Inventory without physical receipt.

### OPS-INV-009

Direct database repair is a last-resort controlled procedure.

### OPS-INV-010

Major repairs preserve audit evidence.

### OPS-INV-011

Operational holds are scoped as narrowly as possible.

### OPS-INV-012

Critical infrastructure degradation surfaces explicitly in Admin.

### OPS-INV-013

Worker failure cannot lose durable jobs/outbox events.

### OPS-INV-014

One failing outbox consumer cannot consume another consumer's progress.

### OPS-INV-015

Backups are not considered healthy without successful restoration evidence.

### OPS-INV-016

System recovery after backup restore requires external-provider reconciliation.

### OPS-INV-017

Application rollback occurs only when schema compatibility is known.

### OPS-INV-018

Bad migration recovery never assumes every migration is trivially reversible.

### OPS-INV-019

Critical integrity issues can block affected mutations.

### OPS-INV-020

Operator mistakes are corrected through semantic compensation rather than silent historical deletion.

### OPS-INV-021

Security credential compromise triggers revocation before investigation is considered complete.

### OPS-INV-022

Confirmed cross-organization exposure is a critical security incident.

### OPS-INV-023

Customer-facing communication never claims success when outcome is uncertain.

### OPS-INV-024

Incident recovery is verified with reconciliation/tests before declaring full resolution.

### OPS-INV-025

Every major incident feeds back into tests, monitoring or architecture.

### OPS-INV-026

Non-critical dependencies fail gracefully without unnecessarily stopping commerce.

### OPS-INV-027

Emergency controls affect future operations and never rewrite historical transactions.

### OPS-INV-028

System health is multi-dimensional rather than represented as one misleading boolean.

### OPS-INV-029

Production emergency changes are documented and auditable.

### OPS-INV-030

Recovery correctness takes priority over superficial uptime.

---

# 220. Architecture Milestone

We now have:

```text
Failure
   ↓
Detection
   ↓
Operational Hold / Containment
   ↓
Reconciliation
   ↓
Recovery / Compensation
   ↓
Verification
   ↓
Incident Review
   ↓
Regression Test
```

The system is no longer designed only for:

```text
how things work
```

but also for:

```text
how the business survives when they don't.
```

---

# 221. Next Phase — Implementation Planning

At this point, broad architecture discovery is mature enough.

The next major source-of-truth document should be:

```text
docs/implementation/implementation-roadmap.md
```

# Maevelle Implementation Roadmap

This document should transform everything we have designed into actual engineering execution.

It should determine:

```text
Implementation phases

Dependency order

Repository bootstrap

Which modules are built first

Which database schemas/tables are created first

Which APIs come first

Admin vs Storefront sequencing

Vertical slices

Test requirements per phase

Migration order

Provider integration timing

Feature flags

Seed data

Staging milestones

Launch readiness gates

What remains deferred
```

---

# 222. Important Implementation Principle

We should not build:

```text
all database tables

then all backend

then all frontend

then test everything
```

as isolated horizontal layers.

Preferred:

> **Foundation first, then validated vertical business slices.**

Example:

```text
Organization + IAM foundation
        ↓
Catalog
        ↓
Inventory
        ↓
Customer + Cart
        ↓
Pricing + Promotions
        ↓
PlaceOrder
        ↓
Admin Order Workspace
        ↓
Storefront Checkout
```

Then progressively add:

```text
Payment

Fulfillment

Delivery

Returns

Procurement

Costing

Finance

Analytics
```

---

# 223. Implementation Roadmap Must Also Correct One Earlier Sequencing Risk

Before writing production migrations in full, the roadmap should include:

```text
Concrete PostgreSQL Schema Specification
```

as a controlled implementation artifact derived from all completed domains.

We now have enough domain clarity to freeze it safely.

The roadmap should therefore sequence:

```text
Implementation Roadmap
        ↓
Repository Bootstrap
        ↓
PostgreSQL Schema Specification
        ↓
Initial Migrations
        ↓
Core Foundation
        ↓
Vertical Slices
```

rather than improvising tables while feature coding.

---

# 224. Recommended Next Document

```text
docs/implementation/implementation-roadmap.md
```

It should be detailed enough that:

```text
the user

human developers

AI coding agents
```

can all independently determine:

```text
what to build next

what must already exist

what tests must pass

what documents govern the implementation

what counts as complete.
```

---

**End of Operations, Incident Response & Recovery Runbooks v0.1**
