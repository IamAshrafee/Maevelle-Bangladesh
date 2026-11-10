'use client';

import { useState } from 'react';
import type { CheckoutOrderPaymentDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Money } from '@/components/commerce/price';
import { CheckIcon, CopyIcon } from '@/components/ui/icons';
import {
  accountTypeLabel,
  formatDhakaDateTime,
  transferActionLabel,
  walletAvailabilityMessage,
  walletAvailabilityTitle,
} from '../order-payment-labels';

function CopyableField({
  label,
  value,
  displayValue,
  id,
}: {
  label: string;
  value: string;
  displayValue?: React.ReactNode;
  id: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is blocked
    }
  }

  return (
    <div className="flex flex-col justify-between gap-1 rounded-lg border border-border bg-surface-container p-3 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        <div className="font-mono text-base font-semibold text-on-surface break-all" id={id}>
          {displayValue ?? value}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start sm:self-auto min-h-9 px-3 text-xs"
        onClick={() => void handleCopy()}
        aria-describedby={id}
      >
        {copied ? (
          <>
            <CheckIcon className="mr-1 text-success" size={14} />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <CopyIcon className="mr-1 text-on-surface-variant" size={14} />
            <span>Copy</span>
          </>
        )}
      </Button>
    </div>
  );
}

export function WalletInstructionsCard({ payment }: { payment: CheckoutOrderPaymentDto }) {
  const isAvailable = payment.transferAvailability === 'AVAILABLE' && payment.instructions !== null;

  if (!isAvailable) {
    const title = walletAvailabilityTitle[payment.transferAvailability];
    const message = walletAvailabilityMessage[payment.transferAvailability];
    const variant =
      payment.transferAvailability === 'CLAIM_UNDER_REVIEW'
        ? 'info'
        : payment.transferAvailability === 'PAYMENT_ALREADY_SETTLED'
          ? 'success'
          : 'warning';

    return (
      <Notice variant={variant} title={title}>
        {message}
      </Notice>
    );
  }

  const instructions = payment.instructions!;
  const deadline = formatDhakaDateTime(payment.submissionDeadline);

  return (
    <div className="space-y-4 rounded-xl border border-primary/20 bg-surface-container-low p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-on-surface">
            {instructions.provider === 'BKASH' ? 'bKash' : 'Nagad'} Payment Instructions
          </h3>
          <p className="text-xs text-on-surface-variant">
            {accountTypeLabel(instructions.accountType)} &bull;{' '}
            {transferActionLabel(instructions.transferAction)}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          Official Merchant Account
        </span>
      </div>

      <p className="text-sm text-on-surface-variant">
        Please complete the transfer using the exact details below. Once sent, copy the Transaction
        ID from your provider SMS or app receipt and submit it for verification.
      </p>

      <div className="space-y-2.5">
        <CopyableField
          id="receiving-account-number"
          label={`${instructions.provider === 'BKASH' ? 'bKash' : 'Nagad'} Receiving Number`}
          value={instructions.accountNumber}
        />

        <CopyableField
          id="exact-payable-amount"
          label="Exact Amount to Pay"
          value={payment.outstanding}
          displayValue={
            <Money amount={payment.outstanding} currency={payment.currency} precision="exact" />
          }
        />

        <CopyableField
          id="payment-order-reference"
          label="Payment Reference / Counter No."
          value={payment.orderNumber}
        />
      </div>

      {instructions.accountName && (
        <p className="text-xs text-on-surface-variant">
          Recipient Name: <strong className="text-on-surface">{instructions.accountName}</strong>
        </p>
      )}

      {instructions.text && (
        <div className="rounded-lg bg-surface-container p-3 text-xs leading-relaxed text-on-surface-variant">
          <p className="font-semibold text-on-surface mb-1">How to pay:</p>
          <p className="whitespace-pre-line">{instructions.text}</p>
        </div>
      )}

      {deadline && (
        <p className="text-xs font-medium text-warning">
          Payment submission window closes: <strong>{deadline}</strong> (Bangladesh Time)
        </p>
      )}
    </div>
  );
}
