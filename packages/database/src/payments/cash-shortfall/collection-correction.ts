import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';
import { PaymentDomainError, getPayment } from '../../payments.js';
import { requirePaymentCapability } from '../authorization.js';
import { postCashWaiverMemorandum } from '../../finance/non-cash-adjustment.js';
import { appendAuditEvent } from '../../platform.js';

/** Correct unposted courier-custody evidence only. Settled/posted cash needs its own reconciled Finance correction. */
export async function reverseUnpostedCodCollection(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    paymentId: string;
    reason: string;
    evidenceReference: string;
  },
) {
  if ([input.reason, input.evidenceReference].some((v) => !v.trim() || v.length > 512))
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'Independent correction evidence and reason are required.',
    );
  return db.transaction().execute(async (tx) => {
    await sql`set local lock_timeout='3s'`.execute(tx);
    await sql`set local statement_timeout='10s'`.execute(tx);
    await requirePaymentCapability(tx, input.organizationId, input.actorId, 'payments.correct');
    const link = (
      await sql<{
        order_id: string;
      }>`select a.order_id from payments.payment_allocations a join payments.payments p
      on p.organization_id=a.organization_id and p.id=a.payment_id join payments.payment_methods m on m.id=p.payment_method_id and m.code='COD'
      where p.organization_id=${input.organizationId} and p.id=${input.paymentId}`.execute(tx)
    ).rows;
    if (link.length !== 1)
      throw new PaymentDomainError('CONFLICT', 'A single COD Order allocation is required.');
    const orderId = link[0]!.order_id;
    await sql`select id from orders.orders where organization_id=${input.organizationId} and id=${orderId} for update`.execute(
      tx,
    );
    await sql`select id from payments.payment_intents where organization_id=${input.organizationId} and order_id=${orderId} order by id for update`.execute(
      tx,
    );
    const p = (
      await sql<{
        status: string;
        confirmed_by_actor_id: string;
      }>`select status,confirmed_by_actor_id from payments.payments
      where organization_id=${input.organizationId} and id=${input.paymentId} for update`.execute(
        tx,
      )
    ).rows[0]!;
    if (p.status === 'REVERSED') return getPayment(tx, input.organizationId, input.paymentId);
    if (p.status !== 'CONFIRMED' || p.confirmed_by_actor_id === input.actorId)
      throw new PaymentDomainError(
        'FORBIDDEN',
        'A different authorized operator must correct genuine collection evidence.',
      );
    const blocked = (
      await sql`select 1 where exists(select 1 from finance.finance_transactions where organization_id=${input.organizationId} and source_domain='payments.payment' and source_id=${input.paymentId})
      or exists(select 1 from finance.cod_settlement_allocations where organization_id=${input.organizationId} and payment_id=${input.paymentId})
      or exists(select 1 from payments.refunds where organization_id=${input.organizationId} and payment_id=${input.paymentId} and status in ('REQUESTED','PROCESSING','UNKNOWN_EXTERNAL_OUTCOME','COMPLETED'))`.execute(
        tx,
      )
    ).rows.length;
    if (blocked)
      throw new PaymentDomainError(
        'CONFLICT',
        'Resolve posted cash, remittance and refund history through independent Finance reconciliation first.',
      );
    const adjustments = (
      await sql<{
        id: string;
      }>`select a.id from payments.cash_shortfall_adjustments a join payments.cash_shortfall_requests r
      on r.organization_id=a.organization_id and r.id=a.id where r.organization_id=${input.organizationId} and r.payment_id=${input.paymentId}
      and not exists(select 1 from payments.cash_shortfall_reversals x where x.adjustment_id=a.id) order by a.id`.execute(
        tx,
      )
    ).rows;
    for (const a of adjustments) {
      const posting = await postCashWaiverMemorandum(tx, {
        ...input,
        adjustmentId: a.id,
        reversal: true,
      });
      await sql`insert into payments.cash_shortfall_reversals(organization_id,adjustment_id,actor_id,reason,evidence_reference,finance_transaction_id)
        values(${input.organizationId},${a.id},${input.actorId},${input.reason},${input.evidenceReference},${posting})`.execute(
        tx,
      );
      await appendAuditEvent(tx, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'payments.cash_shortfall.reversed',
        targetType: 'payments.cash_shortfall',
        targetId: a.id,
      });
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
        values(${input.organizationId},'payments.cash_shortfall.reversed',1,'payments.cash_shortfall',${a.id},${JSON.stringify({ adjustmentId: a.id })}::jsonb,now())`.execute(
        tx,
      );
    }
    await sql`update payments.payments set status='REVERSED',version=version+1 where organization_id=${input.organizationId} and id=${input.paymentId}`.execute(
      tx,
    );
    await sql`update payments.payment_intents set status='READY',version=version+1,updated_at=now() where organization_id=${input.organizationId}
      and order_id=${orderId} and status='SATISFIED'`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'payments.cod_collection.reversed',
      targetType: 'payments.payment',
      targetId: input.paymentId,
      reason: input.reason,
      metadata: { evidenceReference: input.evidenceReference },
    });
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
      values(${input.organizationId},'payments.payment.reversed',1,'payments.payment',${input.paymentId},${JSON.stringify({ paymentId: input.paymentId, orderId })}::jsonb,now())`.execute(
      tx,
    );
    return getPayment(tx, input.organizationId, input.paymentId);
  });
}
