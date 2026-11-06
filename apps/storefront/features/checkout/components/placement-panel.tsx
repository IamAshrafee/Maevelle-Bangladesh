'use client';
import { useEffect, useRef, useState } from 'react';
import type { CheckoutFinalTermsDto, CheckoutPlacementMethod } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/selection-control';
import { reviewActions } from '../foundation-runtime';
import type { ReviewSnapshot } from '../foundation-types';
import { reviewedTermsInput, usableTerms } from '../placement-eligibility';
import { checkoutPlacementMethods, paymentMethodLabel } from '../placement-labels';
import { placementBusy } from '../placement-types';
import { FinalTermsSummary } from './final-terms-summary';

const date = new Intl.DateTimeFormat('en-BD', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Dhaka',
});
function FinalApproval({ terms, submit }: { terms: CheckoutFinalTermsDto; submit: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (agreed) submit();
      }}
    >
      <h3 tabIndex={-1} ref={heading} className="scroll-mt-28 font-serif text-lg font-semibold">
        Review final terms
      </h3>
      <FinalTermsSummary terms={terms} />
      <p className="text-sm text-on-surface-variant">
        Review by <time dateTime={terms.expiresAt}>{date.format(new Date(terms.expiresAt))}</time>{' '}
        Bangladesh time.
      </p>
      <Checkbox
        className="min-h-12"
        label="I accept this final amount and payment method"
        checked={agreed}
        onChange={(event) => setAgreed(event.target.checked)}
      />
      <Button type="submit" size="lg" disabled={!agreed}>
        Place order
      </Button>
    </form>
  );
}

export function PlacementPanel({ review, clock }: { review: ReviewSnapshot; clock: number }) {
  const [method, setMethod] = useState<CheckoutPlacementMethod | ''>('');
  const p = review.placement;
  const busy = placementBusy(p);
  const final =
    p.terms && p.terms.method === method && !busy && usableTerms(review, p.terms, clock)
      ? p.terms
      : null;
  const canCheck =
    !!reviewedTermsInput(review, method || 'COD', clock) &&
    !busy &&
    clock >= (p.issue?.retryAt ?? 0);
  return (
    <section
      aria-labelledby="checkout-final-payment"
      className="grid min-w-0 gap-4 rounded-2xl border border-border bg-surface-container-lowest p-4 sm:p-6"
    >
      <h2 id="checkout-final-payment" className="font-serif text-xl font-semibold">
        Payment
      </h2>
      {!final && (
        <Notice variant="info">
          Ordering is unavailable without approved final terms. No payment is due from this review.
        </Notice>
      )}
      <p className="text-sm text-on-surface-variant">
        Check a payment method after reviewing your delivery details and evaluated amounts. Maevelle
        will never ask for your wallet PIN, OTP or password.
      </p>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (method && canCheck)
            void reviewActions
              .placement()
              .check(method)
              .catch(() => undefined);
        }}
      >
        <label className="text-sm font-semibold" htmlFor="checkout-payment-method">
          Payment method to check
        </label>
        <Select
          name="paymentMethod"
          id="checkout-payment-method"
          sizeVariant="lg"
          value={method}
          disabled={busy}
          onChange={(event) => {
            const next = checkoutPlacementMethods.find((item) => item === event.target.value);
            setMethod(next ?? '');
            reviewActions.placement().clearTerms();
          }}
        >
          <option value="">Choose a method</option>
          {checkoutPlacementMethods.map((item) => (
            <option key={item} value={item}>
              {paymentMethodLabel[item]}
            </option>
          ))}
        </Select>
        {!final && (
          <Button
            className="justify-self-start"
            size="lg"
            variant="outline"
            type="submit"
            disabled={!method || !canCheck}
          >
            Check availability
          </Button>
        )}
      </form>
      <div role="status" aria-live="polite" className="text-sm">
        {busy
          ? 'Checking final terms…'
          : (p.issue?.message ??
            (p.terms && !final
              ? 'Final terms expired or changed. Check the amount again before ordering.'
              : ''))}
      </div>
      {p.phase === 'review' && (
        <p className="text-sm text-on-surface-variant">
          Check your bag and delivery details, then request and review a new evaluation.
        </p>
      )}
      {final && (
        <FinalApproval
          key={final.fingerprint}
          terms={final}
          submit={() => {
            void reviewActions
              .placement()
              .submit(final.fingerprint)
              .catch(() => undefined);
          }}
        />
      )}
    </section>
  );
}
