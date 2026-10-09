'use client';

import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  LockIcon,
  PackageCheckIcon,
  ShieldCheckIcon,
  VerifiedIcon,
} from '@/components/ui/icons';
import type { UseCheckoutReturn } from '../use-checkout';
import type { MobileWalletType } from '../types';

export interface CheckoutPaymentStepProps {
  readonly checkout: UseCheckoutReturn;
}

export function CheckoutPaymentStep({ checkout }: CheckoutPaymentStepProps) {
  const {
    contact,
    address,
    goToStep,
    selectedWallet,
    setSelectedWallet,
    setPaymentMethod,
    senderNumber,
    setSenderNumber,
    manualTrxId,
    setManualTrxId,
    merchantNumber,
    copiedField,
    copyMerchantNumber,
    copyPayableAmount,
    handlePrimaryAction,
    isSubmitting,
    formattedTotal,
    stepError,
  } = checkout;

  const walletMeta = {
    bkash: {
      name: 'bKash',
      color: '#E2136E',
      type: 'Personal / Merchant Send Money',
      ussd: '*247#',
      sampleTrx: '9JK84M2P',
      appStoreLabel: 'bKash App or USSD *247#',
    },
    nagad: {
      name: 'Nagad',
      color: '#F7931E',
      type: 'Personal / Merchant Send Money',
      ussd: '*167#',
      sampleTrx: '7NGD9421',
      appStoreLabel: 'Nagad App or USSD *167#',
    },
  }[selectedWallet];

  const handleSelectWallet = (wallet: MobileWalletType) => {
    setSelectedWallet(wallet);
    setPaymentMethod(wallet);
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-3 duration-200">
      {/* Top Breadcrumb / Return trigger */}
      <div className="flex items-center justify-between">
        <button
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover active:scale-95 transition-transform cursor-pointer"
          onClick={() => goToStep(1)}
          type="button"
        >
          <ArrowLeftIcon size={16} />
          <span>Edit Contact &amp; Shipping Details</span>
        </button>

        <span className="text-xs font-semibold text-primary">Step 2 of 3</span>
      </div>

      {/* Recipient & Delivery Brief Summary Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-surface-container-low p-4 border border-border-subtle">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-sans text-xs font-bold text-on-surface">
              {contact.fullName}
            </span>
            <span className="text-[11px] text-outline-variant">•</span>
            <span className="font-mono text-xs text-on-surface-variant">
              +880 {contact.phone}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant truncate max-w-md">
            {address.streetAddress}, {address.district}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="rounded-full bg-secondary-fixed px-2.5 py-0.5 font-sans text-[11px] font-semibold text-primary">
            {address.zone === 'dhaka' ? 'Inside Dhaka Express' : 'Nationwide Courier'}
          </span>
          <span className="font-mono text-xs font-bold text-primary tabular-nums">
            {formattedTotal}
          </span>
        </div>
      </div>

      {/* Step Error Notice */}
      {stepError ? (
        <div className="rounded-xl bg-error/10 p-3.5 border border-error/30 text-xs font-medium text-error flex items-center gap-2 animate-in fade-in duration-150">
          <ShieldCheckIcon className="shrink-0" size={16} />
          <span>{stepError}</span>
        </div>
      ) : null}

      {/* MANUAL MOBILE BANKING WORKSPACE */}
      <div className="flex flex-col gap-4 rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-sm border border-border-subtle">
        {/* Section Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
              2
            </span>
            <div>
              <h3 className="font-serif text-lg sm:text-xl font-semibold text-on-surface">
                Manual Mobile Banking Transfer
              </h3>
              <p className="text-xs text-on-surface-variant">
                Send money via {walletMeta.name} and submit your Transaction ID (TrxID)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-primary font-semibold">
            <LockIcon size={13} />
            <span>Encrypted</span>
          </div>
        </div>

        {/* Wallet Selector Tabs */}
        <div className="grid grid-cols-2 gap-2.5">
          {(['bkash', 'nagad'] as const).map((wallet) => {
            const isSelected = selectedWallet === wallet;
            const meta = {
              bkash: { name: 'bKash', color: '#E2136E', badge: 'Send Money' },
              nagad: { name: 'Nagad', color: '#F7931E', badge: 'Send Money' },
            }[wallet];

            return (
              <button
                className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-bold transition-colors duration-150 cursor-pointer ${
                  isSelected
                    ? 'border-2 shadow-xs'
                    : 'border-border-subtle bg-surface-container-low/50 hover:bg-surface-container-low text-on-surface-variant'
                }`}
                key={wallet}
                onClick={() => handleSelectWallet(wallet)}
                style={{
                  borderColor: isSelected ? meta.color : undefined,
                  backgroundColor: isSelected ? `${meta.color}0D` : undefined,
                  color: isSelected ? meta.color : undefined,
                }}
                type="button"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-3 rounded-full shrink-0"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span className="text-sm font-semibold">{meta.name}</span>
                </div>
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                  {meta.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Official Maevelle Account Detail Box */}
        <div
          className="rounded-xl border p-4 sm:p-5 flex flex-col gap-4 transition-colors duration-150"
          style={{
            borderColor: `${walletMeta.color}40`,
            backgroundColor: `${walletMeta.color}06`,
          }}
        >
          {/* Merchant Identity Strip */}
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <div
                className="flex size-8 items-center justify-center rounded-lg text-white font-bold text-xs shadow-xs"
                style={{ backgroundColor: walletMeta.color }}
              >
                {selectedWallet === 'bkash' ? '৳' : 'N'}
              </div>
              <div className="flex flex-col">
                <span className="font-sans text-xs font-bold text-on-surface flex items-center gap-1">
                  Maevelle Bangladesh Ltd.
                  <VerifiedIcon className="text-primary" size={13} />
                </span>
                <span className="text-[10px] text-on-surface-variant">
                  Official Merchant Accounts
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">
                Total Payable
              </span>
              <p className="font-mono text-base font-bold text-primary tabular-nums">
                {formattedTotal}
              </p>
            </div>
          </div>

          {/* Account Number & Amount Copy Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Account Number Tile */}
            <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container-lowest border border-border-subtle shadow-2xs">
              <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Maevelle {walletMeta.name} Number
              </span>
              <div className="flex items-center justify-between mt-1.5">
                <span className="font-mono text-base sm:text-lg font-bold text-on-surface tracking-wider">
                  {merchantNumber}
                </span>
                <button
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-primary bg-secondary-fixed hover:bg-secondary-fixed-dim transition-colors duration-150 cursor-pointer"
                  onClick={copyMerchantNumber}
                  type="button"
                >
                  {copiedField === 'number' ? (
                    <>
                      <CheckIcon className="text-success" size={14} />
                      <span className="text-success font-bold">Copied</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon size={14} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <span className="text-[10px] text-on-surface-variant mt-1">
                Type: {walletMeta.type}
              </span>
            </div>

            {/* Exact Payable Amount Tile */}
            <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container-lowest border border-border-subtle shadow-2xs">
              <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Exact Amount to Send
              </span>
              <div className="flex items-center justify-between mt-1.5">
                <span className="font-mono text-base sm:text-lg font-bold text-primary tabular-nums">
                  {formattedTotal}
                </span>
                <button
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-primary bg-secondary-fixed hover:bg-secondary-fixed-dim transition-colors duration-150 cursor-pointer"
                  onClick={copyPayableAmount}
                  type="button"
                >
                  {copiedField === 'amount' ? (
                    <>
                      <CheckIcon className="text-success" size={14} />
                      <span className="text-success font-bold">Copied</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon size={14} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <span className="text-[10px] text-on-surface-variant mt-1">
                Include courier fee (VAT inclusive)
              </span>
            </div>
          </div>

          {/* 3-Step Instruction Guide */}
          <div className="rounded-xl bg-surface-container-low/70 p-3.5 border border-border-subtle/80 flex flex-col gap-2">
            <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
              <span>Quick 3-Step Payment Guide</span>
            </span>
            <ol className="flex flex-col gap-1.5 text-xs text-on-surface-variant list-decimal pl-4 leading-relaxed">
              <li>
                Open your <strong className="text-on-surface">{walletMeta.name} App</strong> (or dial{' '}
                <strong className="text-on-surface font-mono">{walletMeta.ussd}</strong>).
              </li>
              <li>
                Choose <strong className="text-on-surface">Send Money</strong> (or Payment), enter{' '}
                <strong className="text-on-surface font-mono">01894623835</strong> and amount{' '}
                <strong className="text-on-surface font-mono">{formattedTotal}</strong>.
              </li>
              <li>
                Complete the transfer and copy the <strong className="text-on-surface">TrxID</strong> from the confirmation SMS into the form below.
              </li>
            </ol>
          </div>

          {/* Interactive Form: Sender Mobile & TrxID */}
          <div className="flex flex-col gap-3.5 pt-1">
            {/* Input 1: Sender Mobile Number */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface" htmlFor="senderNumber">
                Sender {walletMeta.name} Account Number <span className="text-primary">*</span>
              </label>
              <div className="flex items-center overflow-hidden rounded-lg bg-surface-container-lowest border border-border-subtle focus-within:ring-2 focus-within:ring-primary/20">
                <div className="flex h-11 items-center gap-1.5 bg-surface-container-high px-3 text-xs font-semibold text-on-surface shrink-0 select-none border-r border-border-subtle">
                  <span>🇧🇩</span>
                  <span>+880</span>
                </div>
                <input
                  className="h-11 flex-1 bg-transparent px-3 text-sm font-mono text-on-surface placeholder:text-outline focus:outline-none"
                  id="senderNumber"
                  inputMode="tel"
                  placeholder="01XXXXXXXXX"
                  type="tel"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                />
              </div>
              <span className="text-[10px] text-on-surface-variant">
                The mobile number you sent the money from (editable if paid from a different phone)
              </span>
            </div>

            {/* Input 2: Transaction ID (TrxID) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-on-surface" htmlFor="manualTrxId">
                  Transaction ID (TrxID) <span className="text-primary">*</span>
                </label>
                <button
                  className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  onClick={() => setManualTrxId(walletMeta.sampleTrx)}
                  type="button"
                >
                  Test demo TrxID ({walletMeta.sampleTrx})
                </button>
              </div>
              <input
                autoCapitalize="characters"
                autoComplete="off"
                className="h-11 w-full rounded-lg bg-surface-container-lowest px-3.5 text-sm uppercase font-mono tracking-wider text-on-surface placeholder:text-outline border border-border-subtle focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors duration-150"
                id="manualTrxId"
                maxLength={16}
                placeholder={`e.g. ${walletMeta.sampleTrx}`}
                type="text"
                value={manualTrxId}
                onChange={(e) => setManualTrxId(e.target.value.toUpperCase())}
              />
              <span className="text-[10px] text-on-surface-variant">
                Found in the {walletMeta.name} SMS confirmation received on your phone
              </span>
            </div>

            {/* Security Assurance Notice */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-container-low border border-border-subtle text-xs text-on-surface-variant">
              <ShieldCheckIcon className="text-primary shrink-0 mt-0.5" size={16} />
              <p className="leading-snug">
                <strong className="text-on-surface font-semibold">Security Promise:</strong> Maevelle will never ask for your confidential PIN or password. Only submit your Transaction ID after completing the transfer.
              </p>
            </div>

            {/* In-Card Confirm Button */}
            <button
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-white font-sans text-sm font-semibold shadow-md hover:opacity-95 active:scale-[0.98] transition-colors duration-150 transition-transform disabled:opacity-50 cursor-pointer"
              disabled={isSubmitting}
              onClick={handlePrimaryAction}
              style={{ backgroundColor: walletMeta.color }}
              type="button"
            >
              {isSubmitting ? (
                <>
                  <span className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Submitting Payment Information...</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon size={17} />
                  <span>Confirm {walletMeta.name} Payment • {formattedTotal}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Security Assurance Footer Note */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl bg-surface-container-low/70 p-4 border border-border-subtle text-xs text-on-surface-variant">
        <div className="flex items-center gap-2">
          <ClockIcon className="text-primary shrink-0" size={17} />
          <span>Manual verification takes 15–30 minutes · Order reserved immediately</span>
        </div>

        <div className="flex items-center gap-2 text-secondary font-semibold">
          <PackageCheckIcon size={16} />
          <span>Doorstep Open-Box Inspection Supported</span>
        </div>
      </div>
    </div>
  );
}
