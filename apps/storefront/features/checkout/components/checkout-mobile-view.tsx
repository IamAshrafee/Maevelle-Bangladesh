'use client';

import { CheckoutBottomBar } from './checkout-bottom-bar';
import { CheckoutConfirmedStep } from './checkout-confirmed-step';
import { CheckoutContactSection } from './checkout-contact-section';
import { CheckoutGuaranteeCard } from './checkout-guarantee-card';
import { CheckoutHeader } from './checkout-header';
import { CheckoutOrderSummary } from './checkout-order-summary';
import { CheckoutPaymentSection } from './checkout-payment-section';
import { CheckoutPaymentStep } from './checkout-payment-step';
import { CheckoutShippingSection } from './checkout-shipping-section';
import { CheckoutStepper } from './checkout-stepper';
import type { UseCheckoutReturn } from '../use-checkout';

export interface CheckoutMobileViewProps {
  readonly checkout: UseCheckoutReturn;
}

export function CheckoutMobileView({ checkout }: CheckoutMobileViewProps) {
  const isPaymentStep = checkout.currentStep === 2;
  const isConfirmedStep = checkout.currentStep === 3;

  const headerTitle = isConfirmedStep
    ? 'Order Confirmed'
    : isPaymentStep
      ? 'Payment Authorization'
      : 'Shipping Address';

  return (
    <div
      className={`relative min-h-screen bg-surface flex flex-col w-full ${
        isConfirmedStep ? 'pb-12' : 'pb-36'
      }`}
    >
      {/* Sticky Mobile Header with smart step back navigation */}
      <CheckoutHeader
        isDesktop={false}
        onBack={isPaymentStep ? () => checkout.goToStep(1) : undefined}
        title={headerTitle}
      />

      {/* Main Checkout Stream */}
      <main className="flex flex-col w-full px-4 sm:px-6 pt-3 gap-4 max-w-lg mx-auto">
        {/* Express Checkout Stepper Header */}
        <CheckoutStepper
          currentStep={checkout.currentStep}
          onStepClick={checkout.goToStep}
        />

        {checkout.currentStep === 1 && (
          <>
            {/* Order Summary Collapsible Accordion */}
            <CheckoutOrderSummary checkout={checkout} isDesktop={false} />

            {/* Section 1: Contact Details */}
            <CheckoutContactSection checkout={checkout} />

            {/* Section 2: Shipping Destination */}
            <CheckoutShippingSection checkout={checkout} />

            {/* Section 3: Payment Method */}
            <CheckoutPaymentSection checkout={checkout} />

            {/* Maevelle Guarantee & Security Badges */}
            <CheckoutGuaranteeCard />
          </>
        )}

        {checkout.currentStep === 2 && (
          <>
            {/* Order Summary Collapsible Accordion */}
            <CheckoutOrderSummary checkout={checkout} isDesktop={false} />

            {/* Step 2: Payment Authorization (bKash / Nagad / Rocket / Cards) */}
            <CheckoutPaymentStep checkout={checkout} />
          </>
        )}

        {checkout.currentStep === 3 && (
          /* Step 3: Complete Order Confirmed Content (Stitch Mobile Design System 14) */
          <CheckoutConfirmedStep checkout={checkout} />
        )}
      </main>

      {/* Persistent Sticky Quick-Checkout Bottom Bar (only active on Steps 1 & 2) */}
      {!isConfirmedStep && <CheckoutBottomBar checkout={checkout} />}
    </div>
  );
}
