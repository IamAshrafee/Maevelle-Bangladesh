import type { CheckoutOrderPaymentDto } from '@maevelle/contracts';
import { Money } from '@/components/commerce/price';
import { Notice } from '@/components/ui/notice';
import { OrderPaymentSummary } from './order-payment-summary';
export function CodPaymentSummary({ payment }: { payment: CheckoutOrderPaymentDto }) {
  const canCollect =
    payment.settlementStatus === 'OPEN' &&
    payment.orderStatus !== 'CANCELLED' &&
    payment.obligationStatus !== 'CANCELLED' &&
    payment.refundStates.length === 0;
  return (
    <div className="space-y-4">
      <OrderPaymentSummary payment={payment} />
      {canCollect && (
        <Notice variant="info">
          Amount due on delivery: <Money amount={payment.outstanding} currency={payment.currency} />
          . Please have the exact cash ready when the courier delivers your package.
        </Notice>
      )}
      {payment.settlementStatus === 'SETTLED_WITH_ADJUSTMENT' && (
        <Notice variant="success">
          Your balance is settled with an authorized cash adjustment. The adjustment is separate
          from cash received.
        </Notice>
      )}
      {payment.settlementStatus === 'SETTLED_BY_RECEIPTS' && (
        <Notice variant="success">
          Recorded receipts settle your original balance. Any refund is shown separately.
        </Notice>
      )}
      <p className="text-xs leading-relaxed text-on-surface-variant">
        No online transfer is required for Cash on Delivery. Do not send wallet transfers or submit
        transaction IDs for this order.
      </p>
    </div>
  );
}
