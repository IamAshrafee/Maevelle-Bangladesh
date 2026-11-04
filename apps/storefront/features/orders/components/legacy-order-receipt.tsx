'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { LegacyOrderReceiptDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format/money';
import { requestWithDeadline } from '@/lib/api/client/deadline';
import {
  SHOPPER_TRANSITION_EVENT,
  SHOPPER_TRANSITION_STORAGE,
  SHOPPER_AUTH_STORAGE,
} from '@/lib/auth/shopper-transitions';

export function LegacyOrderReceipt() {
  const [receipt, setReceipt] = useState<LegacyOrderReceiptDto | null>(null),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  const reload = useRef<() => void>(() => undefined);
  useEffect(() => {
    let generation = 0,
      active: AbortController | undefined,
      hold = false;
    async function load() {
      const epoch = ++generation;
      active?.abort();
      active = new AbortController();
      setReceipt(null);
      setFailed(false);
      if (hold || document.visibilityState === 'hidden') {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await requestWithDeadline<LegacyOrderReceiptDto>(
          '/api/storefront/v1/orders/confirmation',
          { signal: active.signal, cache: 'no-store' },
        );
        if (epoch !== generation) return;
        if (
          !result ||
          typeof result.orderNumber !== 'string' ||
          typeof result.total !== 'string' ||
          !/^\d+(?:\.\d{1,4})?$/.test(result.total) ||
          typeof result.currency !== 'string' ||
          !/^[A-Z]{3}$/.test(result.currency) ||
          typeof result.status !== 'string' ||
          !result.payment ||
          typeof result.payment.status !== 'string' ||
          !Array.isArray(result.lines) ||
          result.lines.some(
            (line) =>
              !line ||
              typeof line.id !== 'string' ||
              typeof line.productTitle !== 'string' ||
              typeof line.quantity !== 'string',
          )
        )
          throw new Error('Invalid receipt');
        setReceipt(result);
      } catch {
        if (epoch === generation) setFailed(true);
      } finally {
        if (epoch === generation) setLoading(false);
      }
    }
    reload.current = () => void load();
    void load();
    const events = new AbortController(),
      options = { signal: events.signal };
    addEventListener(
      SHOPPER_TRANSITION_EVENT,
      (event) => {
        hold = (event as CustomEvent<{ phase: string }>).detail.phase === 'begin';
        void load();
      },
      options,
    );
    addEventListener(
      'storage',
      (event) => {
        if ([SHOPPER_TRANSITION_STORAGE, SHOPPER_AUTH_STORAGE].includes(event.key ?? '')) {
          try {
            hold =
              event.key === SHOPPER_TRANSITION_STORAGE &&
              JSON.parse(event.newValue ?? '{}').phase === 'begin';
          } catch {
            hold = false;
          }
          void load();
        }
      },
      options,
    );
    addEventListener('focus', () => void load(), options);
    document.addEventListener('visibilitychange', () => void load(), options);
    return () => {
      generation++;
      active?.abort();
      events.abort();
    };
  }, []);
  return (
    <main className="mx-auto min-h-[60vh] max-w-2xl space-y-5 px-4 py-10 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold">Your existing order</h1>
      {loading ? (
        <p role="status">Checking authorized order access…</p>
      ) : !receipt ? (
        <div className="space-y-4">
          <p role={failed ? 'alert' : 'status'}>
            Order details are unavailable for this browser session. No order confirmation can be
            shown. Contact Maevelle if you need help with an existing order.
          </p>
          <Button variant="outline" onClick={() => reload.current()}>
            Check access again
          </Button>
        </div>
      ) : (
        <section
          aria-label="Authorized order receipt"
          className="space-y-4 rounded-2xl border border-border-subtle bg-surface-container-lowest p-5"
        >
          <p className="font-semibold">
            Reference <span className="font-mono tabular-nums">{receipt.orderNumber}</span>
          </p>
          <p>Order status: {receipt.status}</p>
          <p>Payment status: {receipt.payment.status}</p>
          <p>
            Total:{' '}
            <span className="tabular-nums">{formatMoney(receipt.total, receipt.currency)}</span>
          </p>
          <ul className="space-y-3" aria-label="Order items">
            {receipt.lines.map((line) => (
              <li key={line.id}>
                {line.productTitle} · Quantity {line.quantity}
              </li>
            ))}
          </ul>
          <p className="text-sm text-on-surface-variant">
            This is an existing order record. It does not confirm a new purchase.
          </p>
        </section>
      )}
      <Link
        href="/cart"
        className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
      >
        Return to your bag
      </Link>
    </main>
  );
}
