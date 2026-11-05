import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { PaymentDomainError } from '../payments.js';
import { requirePaymentCapability } from './authorization.js';
import { appendPaymentOperationEvent } from './events.js';
type Context = { organizationId: string; actorId: string };
import { getVerifiedReceipt } from './manual-receipts.js';
import { reverseVerifiedReceiptInTransaction } from '../finance.js';

export async function reverseManualReceipt(
  db: Kysely<DatabaseSchema>,
  input: Context & { paymentId: string; reason: string; evidenceReference: string },
) {
  if (
    !input.reason.trim() ||
    input.reason.length > 512 ||
    !input.evidenceReference.trim() ||
    input.evidenceReference.length > 512
  )
    throw new PaymentDomainError(
      'VALIDATION_FAILED',
      'A bounded correction reason and independent reversal evidence are required.',
    );
  return db.transaction().execute(async (tx) => {
    await requirePaymentCapability(tx, input.organizationId, input.actorId, 'payments.correct');
    const e = (
      await sql<{
        order_id: string;
        financial_account_id: string;
        reviewer_id: string;
      }>`select order_id,financial_account_id,reviewer_id
      from payments.verified_receipt_evidence where organization_id=${input.organizationId} and payment_id=${input.paymentId}`.execute(
        tx,
      )
    ).rows[0];
    if (!e) throw new PaymentDomainError('NOT_FOUND', 'Verified receipt was not found.');
    if (e.reviewer_id === input.actorId)
      throw new PaymentDomainError(
        'FORBIDDEN',
        'A different authorized person must correct this receipt.',
      );
    await sql`select id from orders.orders where organization_id=${input.organizationId} and id=${e.order_id} for update`.execute(
      tx,
    );
    await sql`select id from payments.payment_intents where organization_id=${input.organizationId} and order_id=${e.order_id} order by id for update`.execute(
      tx,
    );
    const p = (
      await sql<{
        status: string;
        amount: string;
      }>`select status,amount::text from payments.payments where organization_id=${input.organizationId}
      and id=${input.paymentId} for update`.execute(tx)
    ).rows[0]!;
    if (p.status === 'REVERSED')
      return getVerifiedReceipt(tx, input.organizationId, input.paymentId);
    const refunds = (
      await sql`select 1 from payments.refunds where organization_id=${input.organizationId} and payment_id=${input.paymentId}
      and status in ('REQUESTED','PROCESSING','UNKNOWN_EXTERNAL_OUTCOME','COMPLETED') limit 1`.execute(
        tx,
      )
    ).rows[0];
    if (refunds)
      throw new PaymentDomainError(
        'CONFLICT',
        'Resolve refund liabilities before reversing this receipt.',
      );
    await reverseVerifiedReceiptInTransaction(tx, {
      ...input,
      accountId: e.financial_account_id,
      amount: p.amount,
      currency: 'BDT',
    });
    await sql`insert into payments.receipt_corrections(organization_id,payment_id,reason,evidence_reference,actor_id)
      values(${input.organizationId},${input.paymentId},${input.reason.trim()},${input.evidenceReference.trim()},${input.actorId})`.execute(
      tx,
    );
    await sql`update payments.payments set status='REVERSED',version=version+1 where organization_id=${input.organizationId} and id=${input.paymentId}`.execute(
      tx,
    );
    await sql`update payments.payment_intents set status='READY',version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and order_id=${e.order_id} and status='SATISFIED'`.execute(
      tx,
    );
    await appendPaymentOperationEvent(tx, input, input.paymentId, 'payments.payment.reversed', {
      paymentId: input.paymentId,
      orderId: e.order_id,
    });
    return getVerifiedReceipt(tx, input.organizationId, input.paymentId);
  });
}
