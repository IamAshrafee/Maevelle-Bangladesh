'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CheckoutDeliveryInput } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { SavedAddresses } from '@/features/account/addresses/saved-addresses';
import { reviewActions } from '../foundation-runtime';
import type { ReviewSnapshot } from '../foundation-types';
import {
  blankDelivery,
  DeliveryFields,
  validateDelivery,
  type DeliveryErrors,
} from './delivery-fields';

export function DeliveryPanel({ review, clock }: { review: ReviewSnapshot; clock: number }) {
  const projection = review.delivery,
    confirmed = projection.confirmed,
    actions = reviewActions.delivery();
  const [value, setValue] = useState<CheckoutDeliveryInput>(blankDelivery),
    [dirty, setDirty] = useState(false),
    [errors, setErrors] = useState<DeliveryErrors>({}),
    [localMessage, setLocalMessage] = useState('');
  const summary = useRef<HTMLDivElement>(null),
    formHeading = useRef<HTMLHeadingElement>(null),
    loaded = useRef('');
  const busy =
      review.suspended ||
      ['loading', 'saving'].includes(projection.phase) ||
      ['checking', 'pending'].includes(review.phase),
    pending = Boolean(projection.pending),
    conflict = projection.phase === 'conflict';
  const expired = review.draft?.status !== 'ACTIVE' || Date.parse(review.draft.expiresAt) <= clock;
  const locked = busy || pending || conflict || expired;
  useEffect(() => {
    const id = review.draft?.id;
    if (!id || busy || pending) return;
    const token = `${id}:${review.draft?.revision}`;
    if (loaded.current === token) return;
    if (loaded.current && confirmed?.revision === review.draft?.revision) {
      loaded.current = token;
      return;
    }
    loaded.current = token;
    void actions.refresh().catch(() => undefined);
  }, [actions, review.draft?.id, review.draft?.revision, busy, pending, confirmed?.revision]);
  useEffect(() => {
    if (!dirty && confirmed) setValue(confirmed.delivery ?? blankDelivery);
  }, [confirmed, dirty]);
  function resetFromServer() {
    setDirty(false);
    setValue(confirmed?.delivery ?? blankDelivery);
    setErrors({});
    setLocalMessage('');
    actions.acknowledge();
    formHeading.current?.focus();
  }
  async function action(run: () => Promise<unknown>) {
    setLocalMessage('');
    try {
      await run();
    } catch {
      requestAnimationFrame(() => summary.current?.focus());
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    const next = validateDelivery(value);
    setErrors(next);
    if (Object.keys(next).length) {
      setLocalMessage('Check the highlighted fields before saving.');
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    await action(async () => {
      await actions.save(value);
      setDirty(false);
    });
  }
  return (
    <section
      aria-labelledby="delivery-heading"
      className="min-w-0 space-y-5 rounded-2xl border border-border-subtle bg-surface-container-lowest p-4 sm:p-6"
    >
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
          Your destination
        </p>
        <h2 id="delivery-heading" className="font-serif text-2xl font-semibold">
          Contact & delivery
        </h2>
        <p className="mt-2 text-sm text-on-surface-variant">
          A few details so we can check delivery. You can continue as a guest.
        </p>
      </header>
      {(projection.issue || localMessage) && (
        <div
          ref={summary}
          tabIndex={-1}
          role="alert"
          className="space-y-2 rounded-xl bg-error-container p-4 text-sm text-on-error-container"
        >
          <p>{localMessage || projection.issue?.message}</p>
          {Object.entries(errors).map(([key, message]) => (
            <p key={key}>{message}</p>
          ))}
        </div>
      )}
      {projection.phase === 'loading' && (
        <p role="status" className="text-sm">
          Checking your saved delivery details…
        </p>
      )}
      {projection.notice && (
        <p role="status" className="text-sm text-primary">
          {projection.notice}
        </p>
      )}
      {pending && projection.phase === 'unknown' && (
        <Notice variant="warning" title="Save awaiting confirmation">
          <p>
            The result is uncertain. Your private retry details stay only in this tab’s memory.
            Retry the same request before making another change. After a reload, review the server’s
            saved details and re-enter any missing edits.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={busy || clock < (projection.issue?.retryAt ?? 0)}
            onClick={() =>
              void action(async () => {
                const kind = projection.pending?.kind;
                await actions.retry();
                if (kind === 'delivery') setDirty(false);
              })
            }
          >
            Retry same delivery request
          </Button>
        </Notice>
      )}
      {conflict && (
        <Notice variant="warning" title="Review the latest saved details">
          {!projection.conflictReady && (
            <p>
              The latest details could not be retrieved. Check them before choosing how to continue.
            </p>
          )}
          {confirmed?.delivery ? (
            <div className="break-words">
              <p>
                {confirmed.delivery.recipientName} · {confirmed.delivery.mobile}
              </p>
              <p>{confirmed.delivery.addressLine1}</p>
            </div>
          ) : (
            <p>No destination is currently saved.</p>
          )}
          <p className="mt-2">Your unsaved entries have not replaced these details.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!projection.conflictReady}
              onClick={resetFromServer}
            >
              Use latest saved details
            </Button>
            <Button
              variant="outline"
              disabled={!projection.conflictReady}
              onClick={() => {
                actions.acknowledge();
                formHeading.current?.focus();
              }}
            >
              I reviewed this — keep my unsaved edits
            </Button>
          </div>
          {!projection.conflictReady && (
            <Button variant="outline" onClick={() => void action(actions.refresh)}>
              Check latest delivery details
            </Button>
          )}
        </Notice>
      )}
      {expired && (
        <Notice variant="warning" title="Checkout expired">
          Your saved details cannot be changed here. Return to the product or your bag to start a
          new review.
        </Notice>
      )}
      {!pending && projection.phase === 'error' && (
        <Button
          variant="outline"
          disabled={busy || clock < (projection.issue?.retryAt ?? 0)}
          onClick={() => void action(actions.refresh)}
        >
          Check saved delivery details
        </Button>
      )}
      {confirmed && !pending && !conflict && (
        <Button
          variant="ghost"
          disabled={busy || expired}
          onClick={() => void action(actions.refresh)}
        >
          Check delivery availability
        </Button>
      )}
      {confirmed?.savedAddress && confirmed.savedAddress.status !== 'CURRENT' && (
        <Notice
          variant="warning"
          title={
            confirmed.savedAddress.status === 'REMOVED'
              ? 'Selected saved address was removed'
              : 'Selected saved address changed'
          }
        >
          Your purchase-specific details are preserved below. Review and select the latest saved
          address, or explicitly save the retained or edited details as a one-time destination. We
          will not replace them automatically.
        </Notice>
      )}
      {confirmed?.configurationChanged && (
        <Notice variant="warning" title="Delivery policy changed">
          Review the current area eligibility, then recheck your saved destination.
        </Notice>
      )}
      {confirmed?.eligibility && !dirty && (
        <Notice
          variant={confirmed.eligibility.status === 'ELIGIBLE' ? 'neutral' : 'warning'}
          title={
            confirmed.eligibility.status === 'ELIGIBLE'
              ? confirmed.reviewRequired
                ? 'Delivery needs review'
                : 'Delivery area accepted'
              : confirmed.eligibility.status === 'UNSUPPORTED_AREA'
                ? 'This destination is currently unsupported'
                : 'Delivery is currently unavailable'
          }
        >
          {confirmed.eligibility.status === 'ELIGIBLE'
            ? 'Accepted by the current delivery policy. Final availability and charges will be checked in the next checkout stage.'
            : 'Choose another supported area or contact us. Your other delivery details are still here.'}
          {confirmed.configurationChanged &&
            confirmed.savedAddress?.status !== 'CHANGED' &&
            confirmed.savedAddress?.status !== 'REMOVED' && (
              <Button
                variant="outline"
                className="mt-3"
                disabled={locked || dirty}
                onClick={() => void action(actions.revalidate)}
              >
                Recheck saved destination
              </Button>
            )}
        </Notice>
      )}
      {review.partition !== 'guest' && projection.addressesLoaded && (
        <SavedAddresses
          successKey={projection.addressOutcomeKey}
          selectedId={confirmed?.savedAddress?.id ?? null}
          items={projection.addresses}
          nextOffset={projection.nextOffset}
          busy={locked}
          actions={actions}
          onSelected={() => {
            setDirty(false);
            setErrors({});
            setLocalMessage('');
            formHeading.current?.focus();
          }}
        />
      )}
      <div className="border-t border-border-subtle pt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 ref={formHeading} tabIndex={-1} className="font-serif text-xl font-semibold">
            {review.partition === 'guest' ? 'Your delivery details' : 'Use a one-time address'}
          </h3>
          {dirty && (
            <p role="status" className="text-xs text-on-surface-variant">
              Unsaved changes · only while this page is open
            </p>
          )}
        </div>
        <form onSubmit={submit} noValidate className="space-y-5">
          <DeliveryFields
            prefix="checkout-delivery"
            value={value}
            errors={errors}
            disabled={busy || pending || expired}
            onChange={(next) => {
              setValue(next);
              setDirty(true);
              setErrors({});
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={locked}
              loading={projection.phase === 'saving'}
              loadingLabel="Saving delivery details"
            >
              Save delivery details
            </Button>
            {dirty && (
              <Button variant="ghost" disabled={busy || pending} onClick={resetFromServer}>
                Discard unsaved edits
              </Button>
            )}
          </div>
        </form>
      </div>
      <p className="text-xs leading-relaxed text-on-surface-variant">
        Saving these details does not place an order or reserve stock. Payment, final prices and
        ordering are not available yet.
      </p>
    </section>
  );
}
