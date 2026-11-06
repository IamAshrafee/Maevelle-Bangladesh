'use client';
import type { UseCheckoutReturn } from '../use-checkout';
import { PaymentMethodsUnavailable } from './payment-foundation';
export interface CheckoutPaymentSectionProps {
  readonly checkout: UseCheckoutReturn;
}
export function CheckoutPaymentSection(_props: CheckoutPaymentSectionProps) {
  void _props;
  return <PaymentMethodsUnavailable />;
}
