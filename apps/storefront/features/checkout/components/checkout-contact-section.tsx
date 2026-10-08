'use client';

import { CheckCircleIcon } from '@/components/ui/icons';
import type { UseCheckoutReturn } from '../use-checkout';

export interface CheckoutContactSectionProps {
  readonly checkout: UseCheckoutReturn;
}

export function CheckoutContactSection({ checkout }: CheckoutContactSectionProps) {
  const { contact, setContact } = checkout;

  const isNameValid = contact.fullName.trim().length >= 2;
  const isPhoneValid = contact.phone.replace(/\D/g, '').length >= 10;

  return (
    <section aria-labelledby="contactHeading" className="flex flex-col gap-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
            1
          </span>
          <h2
            className="font-serif text-xl sm:text-2xl font-semibold tracking-tight text-on-surface"
            id="contactHeading"
          >
            Contact Information
          </h2>
        </div>
        <span className="text-xs font-semibold text-primary">Step 1 of 3</span>
      </div>

      {/* Form Container */}
      <div className="flex flex-col gap-3.5 rounded-xl bg-surface-container-lowest p-4 sm:p-5 shadow-sm border border-border-subtle">
        {/* Full Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-on-surface" htmlFor="fullName">
            Full Name <span className="text-primary">*</span>
          </label>
          <div className="relative">
            <input
              autoComplete="name"
              className="h-12 w-full rounded-lg bg-surface-container-low px-3.5 text-sm text-on-surface placeholder:text-outline border border-border-subtle focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all pr-10"
              id="fullName"
              placeholder="e.g. Nusrat Jahan"
              required
              type="text"
              value={contact.fullName}
              onChange={(e) => setContact((prev) => ({ ...prev, fullName: e.target.value }))}
            />
            {isNameValid ? (
              <CheckCircleIcon
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-primary"
                size={18}
              />
            ) : null}
          </div>
        </div>

        {/* Mobile Number with Bangladesh Prefix */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-on-surface" htmlFor="phoneNumber">
            Mobile Number (bKash & SMS Delivery) <span className="text-primary">*</span>
          </label>
          <div className="flex items-center overflow-hidden rounded-lg bg-surface-container-low border border-border-subtle focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <div className="flex h-12 items-center gap-1.5 bg-surface-container-high px-3 text-sm font-semibold text-on-surface shrink-0 select-none border-r border-border-subtle">
              <span aria-hidden="true" role="img">
                🇧🇩
              </span>
              <span>+880</span>
            </div>
            <input
              autoComplete="tel"
              className="h-12 flex-1 bg-transparent px-3 text-sm font-mono text-on-surface placeholder:text-outline focus:outline-none"
              id="phoneNumber"
              inputMode="tel"
              placeholder="1XXX XXXXXX"
              required
              type="tel"
              value={contact.phone}
              onChange={(e) => setContact((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
            <svg
              aria-hidden="true"
              className="size-3.5 text-secondary shrink-0"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Used for delivery rider coordination and bKash OTP
          </span>
        </div>

        {/* Email Address */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-on-surface" htmlFor="emailAddress">
              Email Address
            </label>
            <span className="text-[11px] text-on-surface-variant">Optional for digital invoice</span>
          </div>
          <input
            autoComplete="email"
            className="h-12 w-full rounded-lg bg-surface-container-low px-3.5 text-sm text-on-surface placeholder:text-outline border border-border-subtle focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            id="emailAddress"
            inputMode="email"
            placeholder="nusrat@example.com"
            type="email"
            value={contact.email}
            onChange={(e) => setContact((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>
      </div>
    </section>
  );
}
