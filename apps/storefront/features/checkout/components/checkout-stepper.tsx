'use client';

import { CelebrationIcon, CheckIcon, ShieldCheckIcon } from '@/components/ui/icons';

export interface CheckoutStepperProps {
  readonly currentStep?: (1 | 2 | 3) | undefined;
  readonly onStepClick?: ((step: 1 | 2 | 3) => void) | undefined;
}

export function CheckoutStepper({ currentStep = 1, onStepClick }: CheckoutStepperProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-container-low/60 p-4 border border-border-subtle shadow-xs">
      {/* Stepper Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-secondary">
            Express Checkout
          </span>
        </div>
        <span className="flex items-center gap-1 font-sans text-[11px] font-medium text-on-surface-variant">
          <ShieldCheckIcon className="text-primary" size={14} />
          SSL Encrypted
        </span>
      </div>

      {/* Stepper Indicator Pills */}
      <div className="flex items-center gap-2 pt-1 pb-1">
        {/* Step 1: Details */}
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors duration-150 ${
            currentStep === 1
              ? 'bg-primary text-on-primary font-semibold shadow-xs'
              : currentStep > 1
                ? 'bg-secondary-fixed text-primary font-semibold hover:bg-secondary-container cursor-pointer'
                : 'bg-surface-container text-on-surface-variant'
          }`}
          disabled={currentStep === 1 || !onStepClick}
          onClick={() => onStepClick?.(1)}
          type="button"
        >
          <span
            className={`flex size-4 items-center justify-center rounded-full text-[10px] font-bold ${
              currentStep > 1 ? 'bg-primary text-on-primary' : 'bg-on-primary/25'
            }`}
          >
            {currentStep > 1 ? <CheckIcon size={11} /> : '1'}
          </span>
          <span className="truncate">Details</span>
        </button>

        <div
          className={`w-2 sm:w-4 h-[2px] transition-colors duration-150 ${
            currentStep >= 2 ? 'bg-primary' : 'bg-outline-variant/60'
          }`}
        />

        {/* Step 2: Payment */}
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors duration-150 ${
            currentStep === 2
              ? 'bg-primary text-on-primary font-semibold shadow-xs'
              : currentStep > 2
                ? 'bg-secondary-fixed text-primary font-semibold'
                : 'bg-surface-container text-on-surface-variant'
          }`}
          disabled={currentStep <= 2}
          onClick={() => onStepClick?.(2)}
          type="button"
        >
          <span
            className={`flex size-4 items-center justify-center rounded-full text-[10px] font-bold ${
              currentStep === 2
                ? 'bg-on-primary/25 text-on-primary'
                : currentStep > 2
                  ? 'bg-primary text-on-primary'
                  : 'bg-outline-variant/50 text-on-surface-variant'
            }`}
          >
            {currentStep > 2 ? <CheckIcon size={11} /> : '2'}
          </span>
          <span className="truncate">Payment</span>
        </button>

        <div
          className={`w-2 sm:w-4 h-[2px] transition-colors duration-150 ${
            currentStep >= 3 ? 'bg-primary' : 'bg-outline-variant/60'
          }`}
        />

        {/* Step 3: Confirmed */}
        <div
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors duration-150 ${
            currentStep === 3
              ? 'bg-primary text-on-primary font-semibold shadow-xs'
              : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          <span
            className={`flex size-4 items-center justify-center rounded-full text-[10px] font-bold ${
              currentStep === 3
                ? 'bg-on-primary/25 text-on-primary'
                : 'bg-outline-variant/50 text-on-surface-variant'
            }`}
          >
            {currentStep === 3 ? <CelebrationIcon size={10} /> : '3'}
          </span>
          <span className="truncate">{currentStep === 3 ? 'Confirmed' : 'Confirm'}</span>
        </div>
      </div>
    </div>
  );
}

