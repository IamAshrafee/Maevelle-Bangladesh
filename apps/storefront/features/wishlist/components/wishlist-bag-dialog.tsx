'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { loadCartConfigurations } from '@/features/cart/configurations';
import type { CartView, WishlistTransfer } from '@/features/cart/types';
import { formatMoney } from '@/lib/format/money';
import type { WishlistDisplayItem } from './wishlist-view-model';

export interface WishlistBagSelection {
  item: WishlistDisplayItem;
  action: WishlistTransfer['action'];
  source: { generation: number; partition: string | null; version: number };
  bag: Pick<CartView, 'ownerContext' | 'version' | 'currency'> | null;
}

export function WishlistBagDialog({
  selection,
  disabled,
  onClose,
  onSubmit,
  fallbackFocusId,
}: {
  selection: WishlistBagSelection;
  disabled: boolean;
  onClose(): void;
  onSubmit(variantId: string, quantity: string): Promise<void>;
  fallbackFocusId: string;
}) {
  const { item, action, source, bag } = selection;
  const product = item.product!;
  const preferred = item.entry.preferredVariantId;
  const optionId = useId();
  const quantityId = useId();
  const [options, setOptions] = useState<Awaited<ReturnType<typeof loadCartConfigurations>>>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState('');
  const [quantity, setQuantity] = useState('1');

  useEffect(() => {
    let cancelled = false;
    void loadCartConfigurations(product.handle, bag?.currency, product.id).then(
      (result) => {
        if (!cancelled) setOptions(result);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [product.handle, product.id, bag?.currency, attempt]);

  const saved = options?.find(({ id }) => id === preferred);
  const blockedPreference = Boolean(source.partition && preferred && options && !saved);
  const selected = saved ?? options?.find(({ id }) => id === target);
  const label = action === 'MOVE' ? 'Move to bag' : 'Add to bag';
  const validQuantity = /^[1-9][0-9]?$/.test(quantity);

  return (
    <ConfirmDialog
      open
      title={`${label} · ${product.title}`}
      confirmLabel={label}
      confirmDisabled={disabled || blockedPreference || !selected || !validQuantity}
      variant="primary"
      fallbackFocusId={fallbackFocusId}
      onClose={onClose}
      onConfirm={() => (selected ? onSubmit(selected.id, quantity) : Promise.resolve())}
    >
      <div className="space-y-3">
        <p>
          {action === 'MOVE'
            ? 'This piece leaves your Wishlist after it is moved to your bag.'
            : 'This piece stays in your Wishlist.'}
        </p>
        {!options && !failed && <p role="status">Loading current selections…</p>}
        {failed && (
          <p role="alert">
            Selections could not be loaded.{' '}
            <button
              className="min-h-11 underline"
              type="button"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </p>
        )}
        {blockedPreference ? (
          <p role="status">
            Your saved selection is unavailable.{' '}
            <Link className="underline" href={`/products/${product.handle}`}>
              View current options
            </Link>
            . You can keep this piece saved while shopping for another selection.
          </p>
        ) : options?.length === 0 ? (
          <p role="status">No selection is currently available. This piece stays saved.</p>
        ) : saved ? (
          <p>
            {saved.label} · {formatMoney(saved.unitPrice, saved.currency)}
          </p>
        ) : options?.length ? (
          <>
            <label className="block font-semibold" htmlFor={optionId}>
              Choose a selection
            </label>
            <select
              className="min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-base"
              id={optionId}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">Choose an option</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} · {formatMoney(option.unitPrice, option.currency)}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {selected && !blockedPreference && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="font-semibold" htmlFor={quantityId}>
              Quantity
            </label>
            <input
              className="min-h-12 w-20 rounded-lg border border-border bg-surface px-3 text-base tabular-nums"
              id={quantityId}
              inputMode="numeric"
              maxLength={2}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            {!validQuantity && <span role="status">Enter 1 to 99.</span>}
          </div>
        )}
        <p className="text-sm">Your bag checks current price and stock when you confirm.</p>
        {disabled && <p role="status">Check your current Wishlist and bag before confirming.</p>}
      </div>
    </ConfirmDialog>
  );
}
