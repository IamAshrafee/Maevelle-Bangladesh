import { sql, type Transaction, type Kysely } from 'kysely';
import { hashToken } from '@maevelle/security';
import type {
  CheckoutCommittedOrderDto,
  CheckoutPlacementReceiptDto,
  CheckoutPlacementMethod,
  OrderStatusDto,
} from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { getOrderPaymentSummary } from '../payments.js';
import { checkoutTransaction } from './commands.js';
import { lockCheckoutAuthority } from './authority.js';
import { ownedDraft } from './queries.js';
import { CheckoutError, type CheckoutAuthority } from './types.js';

export async function committedCheckoutRow(
  tx: Transaction<DatabaseSchema>,
  organizationId: string,
  draftId: string,
) {
  return (
    await sql<{
      order_id: string;
      order_number: string;
      intent_id: string;
      order_status: OrderStatusDto;
      payment_method: CheckoutPlacementMethod;
      total_amount: string;
      final_terms: { terms: CheckoutPlacementReceiptDto['terms'] };
    }>`select o.id order_id,o.order_number,o.order_status,o.payment_method,o.total_amount::text,p.final_terms,p.intent_id
    from orders.checkout_placements p join orders.orders o on o.organization_id=p.organization_id and o.id=p.order_id
    where p.organization_id=${organizationId} and p.draft_id=${draftId}`.execute(tx)
  ).rows[0];
}

export async function requireCheckoutOrderGrant(
  tx: Transaction<DatabaseSchema>,
  owner: CheckoutAuthority,
  draftId: string,
  guestCredential?: string,
) {
  if (owner.kind !== 'GUEST') return;
  const missing = () => new CheckoutError('NOT_FOUND', 'Committed Checkout was not found.');
  if (!guestCredential || !/^[A-Za-z0-9_-]{43}$/.test(guestCredential)) throw missing();
  const grant = (
    await sql<{
      live: boolean;
    }>`select least(guest_grant_expires_at,created_at+interval '1 hour')>clock_timestamp() live
    from orders.checkout_placements where organization_id=${owner.organizationId}
      and draft_id=${draftId} and guest_grant_hash=${hashToken(guestCredential)}`.execute(tx)
  ).rows[0];
  if (!grant) throw missing();
  if (!grant.live)
    throw new CheckoutError('ORDER_GRANT_EXPIRED', 'Guest Order access has expired.');
}

export async function requireCommittedCheckout(
  tx: Transaction<DatabaseSchema>,
  owner: CheckoutAuthority,
  draftId: string,
  guestCredential?: string,
) {
  await lockCheckoutAuthority(tx, owner);
  const draft = await ownedDraft(tx, owner, draftId);
  if (draft.status !== 'COMMITTED')
    throw new CheckoutError('NOT_FOUND', 'Committed Checkout was not found.');
  await requireCheckoutOrderGrant(tx, owner, draftId, guestCredential);
  const row = await committedCheckoutRow(tx, owner.organizationId, draftId);
  if (!row) throw new CheckoutError('NOT_FOUND', 'Committed Checkout was not found.');
  return row;
}

export async function getCommittedCheckoutOrder(
  db: Kysely<DatabaseSchema>,
  owner: CheckoutAuthority,
  draftId: string,
  guestCredential?: string,
): Promise<CheckoutCommittedOrderDto> {
  return checkoutTransaction(
    db,
    async (tx) => {
      const row = await requireCommittedCheckout(tx, owner, draftId, guestCredential);
      const payment = await getOrderPaymentSummary(tx, {
        organizationId: owner.organizationId,
        orderId: row.order_id,
        paymentMethod: row.payment_method,
        expectedAmount: row.total_amount,
        intentId: row.intent_id,
      });
      return {
        receipt: {
          orderId: row.order_id,
          orderNumber: row.order_number,
          terms: row.final_terms.terms,
        },
        status: row.order_status,
        payment: {
          status: payment.status,
          outstanding: payment.outstanding,
          collected: payment.collected,
          refunded: payment.refunded,
          authorizedWaiver: payment.authorizedWaiver,
          settlementStatus: payment.settlementStatus,
        },
      };
    },
    'repeatable read',
  );
}
