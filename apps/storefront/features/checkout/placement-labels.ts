import type {
  CheckoutPlacementMethod,
  OrderPaymentStatusDto,
  OrderStatusDto,
} from '@maevelle/contracts';

export const checkoutPlacementMethods = ['COD', 'BKASH_MANUAL', 'NAGAD_MANUAL'] as const;
export const paymentMethodLabel: Record<CheckoutPlacementMethod, string> = {
  COD: 'Cash on Delivery',
  BKASH_MANUAL: 'bKash',
  NAGAD_MANUAL: 'Nagad',
};
export const orderStatusLabel: Record<OrderStatusDto, string> = {
  PENDING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
const paymentStatuses: Record<OrderPaymentStatusDto, string> = {
  UNPAID: 'Unpaid',
  PAYMENT_PENDING: 'Awaiting payment verification',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
  EXPIRED: 'Payment window expired',
  CANCELLED: 'Payment cancelled',
};
export const paymentStatusLabel = (value: string) =>
  Object.hasOwn(paymentStatuses, value)
    ? paymentStatuses[value as OrderPaymentStatusDto]
    : 'Payment status unavailable';
