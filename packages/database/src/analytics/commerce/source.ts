import type { CommerceFactName } from '@maevelle/contracts';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';

export interface CommerceSource {
  id: string;
  organization_id: string;
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  event_version: number;
  payload: Record<string, unknown>;
}

export interface CommerceFact {
  name: CommerceFactName;
  businessId: string;
  currency: string | null;
  amount: string | null;
  allocated: string | null;
}

/** Only owning-domain records qualify. Never copy an outbox/request payload wholesale. */
export async function readCommerceFact(
  db: Kysely<DatabaseSchema>,
  e: CommerceSource,
): Promise<CommerceFact | null> {
  if (e.event_version !== 1) return null;
  const fact = (
    name: CommerceFactName,
    amount: string | null = null,
    currency: string | null = null,
    allocated: string | null = null,
  ): CommerceFact => ({ name, businessId: e.aggregate_id, amount, currency, allocated });
  if (
    e.aggregate_type === 'orders.order' &&
    ['orders.order.placed', 'orders.order.cancelled'].includes(e.event_type)
  ) {
    const row = (
      await sql<{ amount: string | null; currency: string | null }>`
      select placement.final_terms->'terms'->>'payable' amount,
        placement.final_terms->'terms'->>'currency' currency
      from orders.orders o left join orders.checkout_placements placement
        on placement.organization_id=o.organization_id and placement.order_id=o.id
      where o.organization_id=${e.organization_id} and o.id=${e.aggregate_id}
    `.execute(db)
    ).rows[0];
    // Legacy editable Orders have no immutable original amount: retain count, no guessed money.
    return row
      ? fact(
          e.event_type === 'orders.order.placed' ? 'ORDER_COMMITTED' : 'ORDER_CANCELLED',
          row.amount,
          row.currency,
        )
      : null;
  }
  if (
    (e.aggregate_type === 'payments.payment_attempt' &&
      ['payments.payment_attempt.submitted', 'payments.payment_attempt.rejected'].includes(
        e.event_type,
      )) ||
    (e.aggregate_type === 'payments.payment' &&
      e.event_type === 'payments.claim.reviewed' &&
      e.payload.state === 'CORRECTION_REQUESTED')
  ) {
    const row = (
      await sql`select id from payments.payment_attempts where organization_id=${e.organization_id} and id=${e.aggregate_id}`.execute(
        db,
      )
    ).rows[0];
    return row
      ? fact(
          e.event_type.endsWith('submitted')
            ? 'PAYMENT_CLAIM_SUBMITTED'
            : e.event_type.endsWith('rejected')
              ? 'CLAIM_REJECTED'
              : 'CLAIM_CORRECTION_REQUESTED',
        )
      : null;
  }
  if (
    e.aggregate_type === 'payments.payment' &&
    [
      'payments.payment.verified',
      'payments.payment.reversed',
      'payments.cod_collection.recorded',
    ].includes(e.event_type)
  ) {
    const row = (
      await sql<{
        amount: string;
        currency: string;
        allocated: string;
        independent: boolean;
        cod: boolean;
        reversed: boolean;
      }>`
      select p.amount::text amount,p.currency_code currency,
        coalesce(evidence.allocated_amount,(select sum(a.amount) from payments.payment_allocations a
          where a.organization_id=p.organization_id and a.payment_id=p.id),0)::numeric(24,4)::text allocated,
        evidence.payment_id is not null independent,p.source_delivery_id is not null cod,
        exists(select 1 from payments.receipt_corrections c where c.organization_id=p.organization_id and c.payment_id=p.id) reversed
      from payments.payments p left join payments.verified_receipt_evidence evidence
        on evidence.organization_id=p.organization_id and evidence.payment_id=p.id
      where p.organization_id=${e.organization_id} and p.id=${e.aggregate_id}
    `.execute(db)
    ).rows[0];
    if (
      !row ||
      (e.event_type.endsWith('verified') && !row.independent) ||
      (e.event_type.endsWith('reversed') && !row.reversed) ||
      (e.event_type.includes('cod_collection') && !row.cod)
    )
      return null;
    return fact(
      e.event_type.endsWith('verified')
        ? 'PAYMENT_VERIFIED'
        : e.event_type.endsWith('reversed')
          ? 'PAYMENT_REVERSED'
          : 'COD_COLLECTED',
      row.amount,
      row.currency,
      row.allocated,
    );
  }
  if (e.aggregate_type === 'payments.refund' && e.event_type === 'payments.refund.completed') {
    const row = (
      await sql<{
        amount: string;
        currency: string;
      }>`select amount::text,currency_code currency from payments.refunds
      where organization_id=${e.organization_id} and id=${e.aggregate_id} and completed_at is not null and status='COMPLETED'`.execute(
        db,
      )
    ).rows[0];
    return row ? fact('REFUND_COMPLETED', row.amount, row.currency) : null;
  }
  return null;
}
