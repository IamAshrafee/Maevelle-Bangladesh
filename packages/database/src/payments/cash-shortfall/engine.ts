import { sql, type Kysely, type Transaction } from 'kysely';
import type { SettleCashShortfallDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../../index.js';
import { PaymentDomainError, getOrderPaymentSummary } from '../../payments.js';
import { requirePaymentCapability } from '../authorization.js';
import {
  claimIdempotencyRecord,
  IdempotencyKeyReuseError,
  appendAuditEvent,
} from '../../platform.js';
import { fingerprint, parseMoney, money } from '../../cart/value.js';
import { postCashWaiverMemorandum } from '../../finance/non-cash-adjustment.js';
import { cashAdjustment } from './queries.js';

type Tx = Transaction<DatabaseSchema>;
type Context = { organizationId: string; actorId: string };
type Resolver = (tx: Tx, org: string, policyId: string) => Promise<'SYNTHETIC' | 'BUSINESS' | null>;
type Request = {
  id: string;
  order_id: string;
  payment_id: string;
  policy_id: string;
  amount: string;
  requested_by: string;
};
const fail = (
  code: 'CONFLICT' | 'POLICY_BLOCKED' | 'VALIDATION_FAILED' | 'NOT_FOUND' | 'FORBIDDEN',
  message: string,
): never => {
  throw new PaymentDomainError(code, message);
};
function reason(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512)
    fail('VALIDATION_FAILED', 'A bounded reason and evidence reference are required.');
  return value.trim();
}
async function intent(tx: Tx, c: Context, key: string, operation: string, body: unknown) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
    fail('VALIDATION_FAILED', 'A stable UUID intent key is required.');
  try {
    return await claimIdempotencyRecord(tx, {
      organizationId: c.organizationId,
      principalType: 'USER',
      principalId: c.actorId,
      operationType: operation,
      idempotencyKey: key.toLowerCase(),
      requestFingerprint: fingerprint(body),
    });
  } catch (e) {
    if (e instanceof IdempotencyKeyReuseError)
      throw new PaymentDomainError(
        'IDEMPOTENCY_CONFLICT',
        'Intent key was reused for another financial adjustment.',
      );
    throw e;
  }
}
async function finish(tx: Tx, id: string, resultId: string) {
  await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type='payments.cash_shortfall',result_entity_id=${resultId},
    completed_at=clock_timestamp(),expires_at=null where id=${id}`.execute(tx);
}
async function replay(tx: Tx, id: string) {
  const r = (
    await sql<{
      id: string;
    }>`select result_entity_id::text id from platform.idempotency_records where id=${id} and status='SUCCEEDED'`.execute(
      tx,
    )
  ).rows[0];
  if (!r)
    throw new PaymentDomainError(
      'IDEMPOTENCY_CONFLICT',
      'Adjustment is in progress. Retry the exact intent.',
    );
  return r.id;
}
async function policy(tx: Tx, c: Context, id: string, resolve: Resolver) {
  const scope = await resolve(tx, c.organizationId, id);
  if (!scope)
    fail(
      'POLICY_BLOCKED',
      'Cash shortfall activation, accounting, invoice and courier policy are not approved.',
    );
  const p = (
    await sql<{
      maximum_per_adjustment: string;
      maximum_per_order: string;
      maximum_per_staff_day: string;
      self_approval_limit: string;
      allowed_order_states: string[];
    }>`
    select maximum_per_adjustment::text,maximum_per_order::text,maximum_per_staff_day::text,self_approval_limit::text,allowed_order_states
    from payments.cash_policy_revisions where organization_id=${c.organizationId} and id=${id} and scope=${scope}
      and effective_from<=clock_timestamp() and expires_at>clock_timestamp() for share`.execute(tx)
  ).rows[0];
  if (!p) fail('POLICY_BLOCKED', 'An effective independently approved cash policy is required.');
  return p!;
}
async function lockBudget(tx: Tx, c: Context, requester: string) {
  // One logical staff budget, never a global database or Finance account lock.
  await sql`select pg_advisory_xact_lock(hashtextextended(${`cash-shortfall:${c.organizationId}:${requester}`},0))`.execute(
    tx,
  );
}
async function eligible(
  tx: Tx,
  c: Context,
  r: Omit<Request, 'id' | 'requested_by'>,
  p: Awaited<ReturnType<typeof policy>>,
) {
  const order = (
    await sql<{
      order_status: string;
      total_amount: string;
      currency_code: string;
      payment_method: 'COD';
    }>`select order_status,total_amount::text,currency_code,payment_method
    from orders.orders where organization_id=${c.organizationId} and id=${r.order_id} for update`.execute(
      tx,
    )
  ).rows[0];
  if (!order) fail('NOT_FOUND', 'Order was not found.');
  if (
    order!.payment_method !== 'COD' ||
    order!.currency_code !== 'BDT' ||
    !p.allowed_order_states.includes(order!.order_status)
  )
    fail('CONFLICT', 'Only an eligible cash COD Order can receive this adjustment.');
  const obligations = (
    await sql<{
      id: string;
    }>`select id from payments.payment_intents where organization_id=${c.organizationId}
    and order_id=${r.order_id} order by id for update`.execute(tx)
  ).rows;
  if (obligations.length !== 1)
    fail('CONFLICT', 'Resolve ambiguous payment obligations before adjustment.');
  const receipt = (
    await sql`select p.id from payments.payments p join payments.payment_methods m on m.organization_id=p.organization_id and m.id=p.payment_method_id and m.code='COD'
    join delivery.deliveries d on d.organization_id=p.organization_id and d.id=p.source_delivery_id and d.order_id=${r.order_id} and d.outcome_status='DELIVERED'
    join payments.payment_allocations a on a.organization_id=p.organization_id and a.payment_id=p.id and a.order_id=${r.order_id} and a.amount>0
    where p.organization_id=${c.organizationId} and p.id=${r.payment_id} and p.status='CONFIRMED' for update of p`.execute(
      tx,
    )
  ).rows[0];
  if (!receipt)
    fail('CONFLICT', 'A genuine confirmed delivered COD collection for this Order is required.');
  const live = (
    await sql`select 1 from payments.cash_policy_revisions where organization_id=${c.organizationId} and id=${r.policy_id}
    and effective_from<=clock_timestamp() and expires_at>clock_timestamp()`.execute(tx)
  ).rows.length;
  if (!live) fail('POLICY_BLOCKED', 'The approved policy expired while waiting.');
  const summary = await getOrderPaymentSummary(tx, {
    organizationId: c.organizationId,
    orderId: r.order_id,
    paymentMethod: 'COD',
    expectedAmount: order!.total_amount,
  });
  if (summary.intentStatus !== 'READY')
    fail('CONFLICT', 'The obligation is not open for a new adjustment.');
  const amount = parseMoney(r.amount);
  if (
    amount <= 0n ||
    amount % 10000n ||
    amount !== parseMoney(summary.outstanding) ||
    amount > parseMoney(p.maximum_per_adjustment)
  )
    fail(
      'CONFLICT',
      'Adjustment must equal the current eligible whole-taka residual within policy.',
    );
  return summary;
}
async function emit(tx: Tx, c: Context, id: string, event: string) {
  await appendAuditEvent(tx, {
    organizationId: c.organizationId,
    actorType: 'USER',
    actorId: c.actorId,
    action: event,
    targetType: 'payments.cash_shortfall',
    targetId: id,
  });
  await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values(${c.organizationId},${event},1,'payments.cash_shortfall',${id},1,${JSON.stringify({ adjustmentId: id })}::jsonb,clock_timestamp())`.execute(
    tx,
  );
}
async function apply(tx: Tx, c: Context, r: Request, p: Awaited<ReturnType<typeof policy>>) {
  if (r.requested_by === c.actorId && parseMoney(r.amount) > parseMoney(p.self_approval_limit))
    fail('FORBIDDEN', 'Independent approval is required for this amount.');
  await eligible(tx, c, r, p);
  const budget = (
    await sql<{ order_total: string; staff_total: string }>`select
    coalesce(sum(r.amount) filter(where r.order_id=${r.order_id}),0)::text order_total,
    coalesce(sum(r.amount) filter(where r.requested_by=${r.requested_by} and
      (a.created_at at time zone o.timezone)::date=(clock_timestamp() at time zone o.timezone)::date),0)::text staff_total
    from payments.cash_shortfall_adjustments a join payments.cash_shortfall_requests r on r.organization_id=a.organization_id and r.id=a.id
    join platform.organizations o on o.id=a.organization_id where a.organization_id=${c.organizationId}`.execute(
      tx,
    )
  ).rows[0]!;
  if (
    parseMoney(budget.order_total) + parseMoney(r.amount) > parseMoney(p.maximum_per_order) ||
    parseMoney(budget.staff_total) + parseMoney(r.amount) > parseMoney(p.maximum_per_staff_day)
  )
    fail('CONFLICT', 'Cumulative Order or staff-day adjustment budget is exhausted.');
  const posting = await postCashWaiverMemorandum(tx, { ...c, adjustmentId: r.id, reversal: false });
  await sql`insert into payments.cash_shortfall_adjustments(id,organization_id,approved_by,finance_transaction_id)
    values(${r.id},${c.organizationId},${c.actorId},${posting})`.execute(tx);
  await sql`update payments.payment_intents set status='SATISFIED',version=version+1,updated_at=now()
    where organization_id=${c.organizationId} and order_id=${r.order_id} and status='READY'`.execute(
    tx,
  );
  await emit(tx, c, r.id, 'payments.cash_shortfall.applied');
}

/** Internal composition seam only. Public application exports remain bound to a null activation resolver. */
export function cashShortfallEngine(resolve: Resolver) {
  return {
    settle(db: Kysely<DatabaseSchema>, c: Context, input: SettleCashShortfallDto, key: string) {
      const canonical = {
        orderId: input.orderId.toLowerCase(),
        paymentId: input.paymentId.toLowerCase(),
        policyId: input.policyId.toLowerCase(),
        amount: money(parseMoney(input.amount)),
        reason: reason(input.reason),
        collectionEvidenceReference: reason(input.collectionEvidenceReference),
      };
      return db.transaction().execute(async (tx) => {
        await sql`set local lock_timeout='3s'`.execute(tx);
        await sql`set local statement_timeout='10s'`.execute(tx);
        await requirePaymentCapability(
          tx,
          c.organizationId,
          c.actorId,
          'payments.cash_adjustments.manage',
        );
        const record = await intent(tx, c, key, 'payments.cash-shortfall.request.v1', canonical);
        if (!record.created)
          return cashAdjustment(tx, c.organizationId, await replay(tx, record.id));
        const p = await policy(tx, c, input.policyId, resolve);
        await lockBudget(tx, c, c.actorId);
        const r = {
          order_id: input.orderId,
          payment_id: input.paymentId,
          policy_id: input.policyId,
          amount: canonical.amount,
          requested_by: c.actorId,
        };
        await eligible(tx, c, r, p);
        const row = (
          await sql<{
            id: string;
          }>`insert into payments.cash_shortfall_requests(organization_id,order_id,payment_id,policy_id,amount,requested_by,reason,collection_evidence_reference)
          values(${c.organizationId},${r.order_id},${r.payment_id},${r.policy_id},${r.amount}::numeric,${c.actorId},${canonical.reason},${canonical.collectionEvidenceReference}) returning id`.execute(
            tx,
          )
        ).rows[0]!;
        await emit(tx, c, row.id, 'payments.cash_shortfall.requested');
        if (parseMoney(r.amount) <= parseMoney(p.self_approval_limit))
          await apply(tx, c, { ...r, id: row.id }, p);
        await finish(tx, record.id, row.id);
        return cashAdjustment(tx, c.organizationId, row.id);
      });
    },
    approve(db: Kysely<DatabaseSchema>, c: Context, id: string, key: string) {
      return db.transaction().execute(async (tx) => {
        await sql`set local lock_timeout='3s'`.execute(tx);
        await sql`set local statement_timeout='10s'`.execute(tx);
        await requirePaymentCapability(
          tx,
          c.organizationId,
          c.actorId,
          'payments.cash_adjustments.approve',
        );
        const record = await intent(tx, c, key, 'payments.cash-shortfall.approve.v1', { id });
        if (!record.created)
          return cashAdjustment(tx, c.organizationId, await replay(tx, record.id));
        const r = (
          await sql<Request>`select id,order_id,payment_id,policy_id,amount::text,requested_by from payments.cash_shortfall_requests
          where organization_id=${c.organizationId} and id=${id}`.execute(tx)
        ).rows[0];
        if (!r) fail('NOT_FOUND', 'Adjustment request was not found.');
        const p = await policy(tx, c, r!.policy_id, resolve);
        await lockBudget(tx, c, r!.requested_by);
        await eligible(tx, c, r!, p);
        if ((await cashAdjustment(tx, c.organizationId, id)).state !== 'REQUIRES_APPROVAL')
          fail('CONFLICT', 'Adjustment is already decided.');
        await apply(tx, c, r!, p);
        await finish(tx, record.id, id);
        return cashAdjustment(tx, c.organizationId, id);
      });
    },
    reverse(
      db: Kysely<DatabaseSchema>,
      c: Context,
      id: string,
      input: { reason: string; evidenceReference: string },
      key: string,
    ) {
      const canonical = {
        id,
        reason: reason(input.reason),
        evidenceReference: reason(input.evidenceReference),
      };
      return db.transaction().execute(async (tx) => {
        await sql`set local lock_timeout='3s'`.execute(tx);
        await sql`set local statement_timeout='10s'`.execute(tx);
        await requirePaymentCapability(tx, c.organizationId, c.actorId, 'payments.correct');
        const record = await intent(tx, c, key, 'payments.cash-shortfall.reverse.v1', canonical);
        if (!record.created)
          return cashAdjustment(tx, c.organizationId, await replay(tx, record.id));
        const prior = await cashAdjustment(tx, c.organizationId, id);
        await sql`select id from orders.orders where organization_id=${c.organizationId} and id=${prior.orderId} for update`.execute(
          tx,
        );
        await sql`select id from payments.payment_intents where organization_id=${c.organizationId} and order_id=${prior.orderId} order by id for update`.execute(
          tx,
        );
        const current = await cashAdjustment(tx, c.organizationId, id);
        if (current.state === 'REQUIRES_APPROVAL')
          fail('CONFLICT', 'No applied adjustment exists.');
        if (current.state !== 'REVERSED') {
          const posting = await postCashWaiverMemorandum(tx, {
            ...c,
            adjustmentId: id,
            reversal: true,
          });
          await sql`insert into payments.cash_shortfall_reversals(organization_id,adjustment_id,actor_id,reason,evidence_reference,finance_transaction_id)
            values(${c.organizationId},${id},${c.actorId},${canonical.reason},${canonical.evidenceReference},${posting})`.execute(
            tx,
          );
          await sql`update payments.payment_intents set status='READY',version=version+1,updated_at=now()
            where organization_id=${c.organizationId} and order_id=${prior.orderId} and status='SATISFIED'
              and exists(select 1 from orders.orders where id=${prior.orderId} and order_status<>'CANCELLED')`.execute(
            tx,
          );
          await emit(tx, c, id, 'payments.cash_shortfall.reversed');
        }
        await finish(tx, record.id, id);
        return cashAdjustment(tx, c.organizationId, id);
      });
    },
  };
}
const inactive = cashShortfallEngine(async () => null);
export const settleCashShortfall = inactive.settle;
export const approveCashShortfall = inactive.approve;
// Corrections of existing evidence remain available even when new waivers are disabled.
export const reverseCashShortfall = inactive.reverse;
