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
      order_status: OrderStatusDto;
      payment_method: CheckoutPlacementMethod;
      total_amount: string;
      final_terms: { terms: CheckoutPlacementReceiptDto['terms'] };
    }>`select o.id order_id,o.order_number,o.order_status,o.payment_method,o.total_amount::text,p.final_terms
    from orders.checkout_placements p join orders.orders o on o.organization_id=p.organization_id and o.id=p.order_id
    where p.organization_id=${organizationId} and p.draft_id=${draftId}`.execute(tx)
  ).rows[0];
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
      await lockCheckoutAuthority(tx, owner);
      // Committed drafts cannot be edited or adopted. The scoped guest read grant
      // also requires its original live, revocable Checkout authority.
      await ownedDraft(tx, owner, draftId);
      const missing = () => new CheckoutError('NOT_FOUND', 'Committed Checkout was not found.');
      if (owner.kind === 'GUEST') {
        if (!guestCredential || !/^[A-Za-z0-9_-]{43}$/.test(guestCredential)) throw missing();
        const grant =
          await sql`select 1 from orders.checkout_placements where organization_id=${owner.organizationId}
        and draft_id=${draftId} and guest_grant_hash=${hashToken(guestCredential)}
        and guest_grant_expires_at>clock_timestamp()`.execute(tx);
        if (!grant.rows.length) throw missing();
      }
      const row = await committedCheckoutRow(tx, owner.organizationId, draftId);
      if (!row) throw missing();
      const payment = await getOrderPaymentSummary(tx, {
        organizationId: owner.organizationId,
        orderId: row.order_id,
        paymentMethod: row.payment_method,
        expectedAmount: row.total_amount,
      });
      return {
        receipt: {
          orderId: row.order_id,
          orderNumber: row.order_number,
          terms: row.final_terms.terms,
        },
        status: row.order_status,
        payment: { status: payment.status, outstanding: payment.outstanding },
      };
    },
    'repeatable read',
  );
}
