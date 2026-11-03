'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { CartView } from '../types';
import { Button } from '@/components/ui/button';
import { formatMoney, wholeQuantity } from '@/lib/format/money';
import { cartStore } from '../browser-runtime';
import { loadCartConfigurations } from '../configurations';

export function CartVariantEditor({
  cart,
  line,
  busy,
}: {
  cart: CartView;
  line: CartView['lines'][number];
  busy: boolean;
}) {
  const inputId = useId();
  const select = useRef<HTMLSelectElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const restoreFocus = useRef(false);
  const [options, setOptions] = useState<Awaited<ReturnType<typeof loadCartConfigurations>>>([]);
  const [phase, setPhase] = useState<'closed' | 'loading' | 'ready' | 'error'>('closed');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [observedVersion, setObservedVersion] = useState(cart.version);
  const selected = options.find((option) => option.id === target);
  const collision = cart.lines.find((item) => item.variantId === target && item.id !== line.id);
  const quantity = wholeQuantity(line.quantity);
  const combined = quantity + (collision ? wholeQuantity(collision.quantity) : 0);
  const stale = observedVersion !== cart.version;

  useEffect(() => {
    if (phase !== 'closed') (select.current ?? closeButton.current)?.focus();
    if (phase === 'closed' && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [phase]);

  function close() {
    request.current++;
    restoreFocus.current = true;
    setPhase('closed');
  }

  async function open() {
    const ticket = ++request.current;
    setPhase('loading');
    setTarget('');
    setObservedVersion(cart.version);
    try {
      const current = await loadCartConfigurations(line.productHandle, cart.currency);
      if (ticket !== request.current) return;
      setOptions(current.filter((option) => option.id !== line.variantId));
      setPhase('ready');
    } catch {
      if (ticket === request.current) setPhase('error');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || saving || busy || stale || combined > 99) return;
    setSaving(true);
    try {
      await cartStore.replaceVariant(line.id, selected.id, String(quantity), {
        ownerContext: cart.ownerContext,
        version: observedVersion,
      });
      close();
    } catch {
      // The shared controller retains the actionable error or the original intent.
    } finally {
      setSaving(false);
    }
  }

  if (phase === 'closed')
    return (
      <Button ref={trigger} variant="ghost" disabled={busy} onClick={() => void open()}>
        Change selection
      </Button>
    );

  return (
    <form
      className="space-y-3 rounded-xl bg-surface-container-low p-3"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !saving) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      aria-busy={phase === 'loading' || saving}
    >
      {phase === 'loading' && <p role="status">Loading current selections…</p>}
      {phase === 'error' && (
        <p role="status">Selections could not be loaded. Try again or remove this item.</p>
      )}
      {phase === 'ready' && !options.length && (
        <p role="status">
          No other current selection is listed. You can remove this item from your bag.
        </p>
      )}
      {phase === 'ready' && options.length > 0 && (
        <>
          <label className="block font-semibold" htmlFor={inputId}>
            Choose a new selection
          </label>
          <select
            id={inputId}
            ref={select}
            className="min-h-12 w-full rounded-lg border border-border bg-surface-container-lowest px-3"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={busy || saving || stale}
            required
          >
            <option value="">Choose an option</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} · {formatMoney(option.unitPrice, cart.currency)}
              </option>
            ))}
          </select>
          {selected && (
            <p role="status" className="text-sm text-on-surface-variant">
              {collision
                ? `Matching items will combine into one line of ${combined}.`
                : `Your quantity will stay at ${quantity}.`}{' '}
              {combined > 99
                ? 'The bag supports up to 99 of the same selection. Reduce a quantity first.'
                : 'Current price and stock are checked when you save.'}
            </p>
          )}
        </>
      )}
      {stale && <p role="status">Your bag changed. Check the current selections before saving.</p>}
      <div className="flex flex-wrap gap-2">
        {phase === 'ready' && options.length > 0 && (
          <Button
            type="submit"
            disabled={!selected || busy || stale || combined > 99}
            loading={saving}
          >
            Save selection
          </Button>
        )}
        {(stale || phase === 'error') && (
          <Button variant="outline" disabled={busy || saving} onClick={() => void open()}>
            Check selections
          </Button>
        )}
        <Button ref={closeButton} variant="ghost" disabled={saving} onClick={close}>
          Close editor
        </Button>
      </div>
    </form>
  );
}
