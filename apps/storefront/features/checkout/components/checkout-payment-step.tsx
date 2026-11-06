'use client';
import type { UseCheckoutReturn } from '../use-checkout';
import { PaymentMethodsUnavailable } from './payment-foundation';
export interface CheckoutPaymentStepProps {
  readonly checkout: UseCheckoutReturn;
}
export function CheckoutPaymentStep(_props: CheckoutPaymentStepProps) {
  void _props;
  return <PaymentMethodsUnavailable />;
}
