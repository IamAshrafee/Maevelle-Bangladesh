'use client';

import Link from 'next/link';

import { LockIcon } from '@/components/ui/icons';
import { CheckoutConfirmedStep } from './checkout-confirmed-step';
import { CheckoutContactSection } from './checkout-contact-section';
import { CheckoutGuaranteeCard } from './checkout-guarantee-card';
import { CheckoutOrderSummary } from './checkout-order-summary';
import { CheckoutPaymentSection } from './checkout-payment-section';
import { CheckoutPaymentStep } from './checkout-payment-step';
import { CheckoutShippingSection } from './checkout-shipping-section';
import { CheckoutStepper } from './checkout-stepper';
import type { UseCheckoutReturn } from '../use-checkout';

export interface CheckoutDesktopViewProps {
  readonly checkout: UseCheckoutReturn;
}

export function CheckoutDesktopView({ checkout }: CheckoutDesktopViewProps) {
  const isPaymentStep = checkout.currentStep === 2;
  const isConfirmedStep = checkout.currentStep === 3;

  const pageTitle = isConfirmedStep
    ? 'Order Confirmation'
    : isPaymentStep
      ? 'Payment Authorization'
      : 'Express Checkout';

  return (
    <div className="relative min-h-[calc(100vh-14rem)] bg-surface w-full">
      {/* Main Content Area: Luxury Atelier Layout */}
      <main className="mx-auto w-full max-w-7xl px-6 lg:px-8 py-8">
        {/* Breadcrumb Navigation */}
        <nav
          aria-label="Breadcrumb"
          className="mb-4 flex items-center gap-2 text-xs font-medium text-on-surface-variant"
        >
          <Link className="hover:text-primary transition-colors duration-150" href="/cart">
            Shopping Bag
          </Link>
          <span className="text-outline-variant">/</span>
          <button
            className={`transition-colors duration-150 ${
              checkout.currentStep === 1
                ? 'font-semibold text-primary'
                : 'text-on-surface-variant hover:text-primary'
            }`}
            disabled={isConfirmedStep}
            onClick={() => checkout.goToStep(1)}
            type="button"
          >
            Express Checkout
          </button>
          <span className="text-outline-variant">/</span>
          <span
            className={`transition-colors duration-150 ${
              isPaymentStep ? 'font-semibold text-primary' : 'text-outline'
            }`}
          >
            Payment Authorization
          </span>
          <span className="text-outline-variant">/</span>
          <span
            className={`transition-colors duration-150 ${
              isConfirmedStep ? 'font-semibold text-primary' : 'text-outline'
            }`}
          >
            Order Confirmation
          </span>
        </nav>

        {/* Desktop Page Title & Security Notice */}
        <div className="mb-8 flex items-center justify-between border-b border-border-subtle pb-5">
          <div className="flex flex-col">
            <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-secondary">
              Maevelle Atelier
            </span>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-on-surface">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface-variant border border-border-subtle">
            <LockIcon className="text-primary" size={14} />
            <span className="font-semibold">256-Bit SSL Encrypted Checkout</span>
          </div>
        </div>

        {/* Step 3: Full Page Order Confirmation */}
        {isConfirmedStep ? (
          <div className="w-full flex flex-col gap-8">
            {/* Stepper Progress */}
            <div className="max-w-2xl mx-auto w-full">
              <CheckoutStepper currentStep={3} />
            </div>

            {/* Complete Order Confirmed Content (Responsive 2-Column Luxury Layout) */}
            <CheckoutConfirmedStep checkout={checkout} />
          </div>
        ) : (
          /* Steps 1 & 2: 2-Column Grid (7 cols Form Steps, 5 cols Sticky Summary) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Express Checkout Steps & Forms (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Stepper Progress */}
              <CheckoutStepper
                currentStep={checkout.currentStep}
                onStepClick={checkout.goToStep}
              />

              {checkout.currentStep === 1 ? (
                <>
                  {/* Step 1: Contact Information */}
                  <CheckoutContactSection checkout={checkout} />

                  {/* Step 2: Shipping Destination */}
                  <CheckoutShippingSection checkout={checkout} />

                  {/* Step 3: Payment Method */}
                  <CheckoutPaymentSection checkout={checkout} />

                  {/* Maevelle Brand Guarantee Card */}
                  <CheckoutGuaranteeCard />
                </>
              ) : (
                /* Step 2: Payment Authorization (bKash / Nagad / Rocket / Cards) */
                <CheckoutPaymentStep checkout={checkout} />
              )}
            </div>

            {/* Right Column: Sticky Summary & Instant Order Action (5 cols) */}
            <div className="lg:col-span-5">
              <CheckoutOrderSummary checkout={checkout} isDesktop />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
