'use client';
import { useState } from 'react';
import { Notice } from '@/components/ui/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatExactMoney } from '@/lib/format/exact-money';
export function PaymentMethodsUnavailable() {
  return (
    <section
      aria-labelledby="checkout-payment-foundation"
      className="grid gap-4 rounded-2xl border border-border bg-surface-container-lowest p-5"
    >
      <h2 id="checkout-payment-foundation" className="font-serif text-xl">
        Payment
      </h2>
      <Notice variant="info">
        Ordering and payment collection are not available yet. No amount is due from this review.
      </Notice>
      <ul className="grid gap-2 text-sm text-on-surface-variant">
        <li>Cash on Delivery — unavailable</li>
        <li>bKash — unavailable</li>
        <li>Nagad — unavailable</li>
      </ul>
      <p className="text-sm text-on-surface-variant">
        When ordering is available, approved payment details will appear only after your Order is
        created. We never ask for your PIN, OTP or wallet password.
      </p>
    </section>
  );
}
/** Presentation contract only. No production grant, endpoint, or collection toggle exists here. */
export interface SyntheticPaymentContext {
  readonly kind: 'SYNTHETIC_PREVIEW';
  readonly orderReference: string;
  readonly provider: 'bKash' | 'Nagad' | 'COD';
  readonly payable: string;
  readonly receivingNumber: string;
  readonly accountType: string;
  readonly transferAction: string;
  readonly instructions: string;
  readonly deadline: string;
  readonly status: 'AWAITING_PAYMENT' | 'PENDING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID';
  readonly outstanding: string;
}
export function SyntheticOrderPaymentPreview({ context }: { context: SyntheticPaymentContext }) {
  const [feedback, setFeedback] = useState('');
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback('Copied.');
    } catch {
      setFeedback('Copy unavailable. Select and copy the displayed value.');
    }
  }
  const status = {
    AWAITING_PAYMENT: 'Awaiting payment',
    PENDING_VERIFICATION:
      'Payment information submitted. Our team will verify your payment. You can leave this page.',
    PARTIALLY_PAID: 'Part of the payment has been verified. A balance remains.',
    PAID: 'Payment verified.',
  }[context.status];
  return (
    <section
      className="grid gap-4 rounded-2xl border border-border bg-surface-container-lowest p-5"
      aria-label="Synthetic payment presentation"
    >
      <Notice variant="warning">
        Synthetic preview only. This is not an actual payable Order. Do not transfer money.
      </Notice>
      <h2 className="font-serif text-xl">
        {context.provider === 'COD'
          ? 'Order received — payment due on delivery'
          : `${context.provider} payment`}
      </h2>
      <p className="font-mono tabular-nums">
        {context.orderReference} · {formatExactMoney(context.payable)}
      </p>
      {context.provider !== 'COD' ? (
        <>
          <p>
            {context.accountType} · {context.transferAction}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono tabular-nums">{context.receivingNumber}</span>
            <Button variant="outline" onClick={() => void copy(context.receivingNumber)}>
              Copy number
            </Button>
            <Button variant="outline" onClick={() => void copy(context.payable)}>
              Copy amount
            </Button>
          </div>
          <p>{context.instructions}</p>
          <p className="text-sm font-mono tabular-nums">Payment deadline: {context.deadline}</p>
          <form className="grid gap-3" onSubmit={(event) => event.preventDefault()}>
            <label className="grid gap-1 text-sm">
              Transaction ID (required)
              <Input required autoComplete="off" maxLength={128} />
            </label>
            <label className="grid gap-1 text-sm">
              Sending mobile number (optional)
              <Input type="tel" autoComplete="off" />
            </label>
            <Button disabled>Payment submission unavailable</Button>
          </form>
        </>
      ) : (
        <p>Cash on Delivery is unpaid until actual collection. Order placement is not payment.</p>
      )}
      <p role="status">{feedback || status}</p>
      {context.status === 'PARTIALLY_PAID' ? (
        <p className="font-mono tabular-nums">
          Outstanding: {formatExactMoney(context.outstanding)}
        </p>
      ) : null}
      <p className="text-sm text-on-surface-variant">
        The future authorized Order-status page and account history will provide recovery. No public
        payment or recovery endpoint is connected in this preview.
      </p>
    </section>
  );
}
