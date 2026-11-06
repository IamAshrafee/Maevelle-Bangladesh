'use client';
import { useRef, useState, type ReactNode, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAdminContext } from '../admin-capabilities';
import {
  paymentIntent,
  paymentOwnerKey,
  sendPaymentIntent,
  paymentError,
  uncertainPaymentResult,
  type PaymentIntent,
} from '@/lib/payments/transport';
import { PaymentNotice } from './payment-ui';

/** Exact request and key stay in owner-scoped page memory through uncertain outcomes. */
export function PaymentCommand({
  title,
  path,
  children,
  build,
  onClose,
  onSuccess,
  consequence,
  context,
}: {
  title: string;
  path: string;
  children: ReactNode;
  build: (form: FormData) => unknown;
  onClose: () => void;
  onSuccess: (data: unknown) => void;
  consequence: string;
  context?: ReactNode;
}) {
  const owner = useAdminContext(),
    currentOwner = useRef(owner);
  currentOwner.current = owner;
  const initialOwner = useRef(paymentOwnerKey(owner));
  const intent = useRef<PaymentIntent | null>(null);
  const [stage, setStage] = useState<'edit' | 'review' | 'sending' | 'unknown' | 'success'>('edit');
  const [error, setError] = useState(''),
    [summary, setSummary] = useState<readonly [string, string][]>([]);
  const inFlight = useRef(false);
  function close() {
    if (stage === 'unknown') window.location.reload();
    else onClose();
  }
  const changed = initialOwner.current !== paymentOwnerKey(owner);
  const canReplay =
    /\/(?:verify|complete|refunds|reversal|posting|cod-collections|operating-policies)$/.test(path);
  async function submit() {
    if (!intent.current || changed || inFlight.current) return;
    inFlight.current = true;
    setStage('sending');
    setError('');
    try {
      const result = await sendPaymentIntent<unknown>(intent.current, owner);
      if (paymentOwnerKey(currentOwner.current) !== initialOwner.current) return;
      setStage('success');
      intent.current = null;
      onSuccess(result);
    } catch (e) {
      if (paymentOwnerKey(currentOwner.current) !== initialOwner.current) return;
      const unknown = uncertainPaymentResult(e);
      setStage(unknown ? 'unknown' : 'edit');
      if (!unknown) intent.current = null;
      setError(paymentError(e));
    } finally {
      inFlight.current = false;
    }
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage !== 'edit') return;
    try {
      intent.current = paymentIntent(path, build(new FormData(event.currentTarget)), owner);
      setSummary(
        Array.from(event.currentTarget.elements).flatMap((element) => {
          if (
            !(
              element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement
            ) ||
            !element.name
          )
            return [];
          const label =
            element.closest('label')?.firstChild?.textContent?.trim() ||
            element.closest('label')?.textContent?.trim() ||
            element.name;
          const value =
            element instanceof HTMLSelectElement
              ? (element.selectedOptions[0]?.textContent ?? '')
              : element.type === 'checkbox'
                ? (element as HTMLInputElement).checked
                  ? 'Confirmed'
                  : 'Not confirmed'
                : element.value;
          return [[label, value] as [string, string]];
        }),
      );
      setStage('review');
      setError('');
    } catch {
      setError('Check the required fields, amount and timestamp.');
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && stage !== 'sending') close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{consequence}</DialogDescription>
        </DialogHeader>
        {changed ? (
          <PaymentNotice>
            Organization or account changed. Close this dialog and reload the authorized record.
          </PaymentNotice>
        ) : (
          <>
            {context}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {stage === 'success' ? (
              <PaymentNotice>
                Saved. Refresh the authoritative record before another action.
              </PaymentNotice>
            ) : (
              <form onSubmit={review} className="grid gap-4">
                <fieldset
                  disabled={stage !== 'edit'}
                  className={stage === 'edit' ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}
                >
                  {children}
                </fieldset>
                {stage !== 'edit' ? (
                  <>
                    <dl className="grid gap-3 rounded-lg border border-border p-4">
                      {summary.map(([label, value], i) => (
                        <div key={i} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="break-words text-sm font-mono tabular-nums">
                            {value || 'Not supplied'}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <PaymentNotice>
                      {consequence} The backend determines the actual allocation, outstanding
                      balance and liability.
                    </PaymentNotice>
                  </>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  {stage === 'edit' ? (
                    <Button type="submit">Review details</Button>
                  ) : (
                    <>
                      {stage === 'review' ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            intent.current = null;
                            setStage('edit');
                          }}
                        >
                          Edit details
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        disabled={stage === 'sending' || (stage === 'unknown' && !canReplay)}
                        onClick={() => void submit()}
                      >
                        {stage === 'unknown'
                          ? canReplay
                            ? 'Retry exact request'
                            : 'Reconcile the server record before retry'
                          : stage === 'sending'
                            ? 'Saving…'
                            : 'Confirm checked details'}
                      </Button>
                    </>
                  )}
                </div>
              </form>
            )}
          </>
        )}
        <Button variant="outline" disabled={stage === 'sending'} onClick={close}>
          Close{stage === 'unknown' ? ' and reload authoritative records' : ''}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
