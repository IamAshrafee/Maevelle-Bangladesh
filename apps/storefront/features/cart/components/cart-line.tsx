'use client';

import Link from 'next/link';
import type { GuestCartViewDto } from '@maevelle/contracts';
import { QuantityStepper } from '@/components/commerce/quantity-stepper';
import { Button } from '@/components/ui/button';
import { ShoppingBagIcon } from '@/components/ui/icons';
import { formatMoney, wholeQuantity } from '@/lib/format/money';
import { publicMediaPath } from '@/lib/media/url';
import { cartStore } from '../browser-runtime';
import { CartVariantEditor } from './cart-variant-editor';

const issueMessages = {
  INVALID_CONFIGURATION:
    'This selection has changed. Choose a current selection or remove the item.',
  UNAVAILABLE: 'This selection is currently unavailable.',
  INSUFFICIENT_CURRENT_STOCK: 'Reduce the quantity or choose another selection.',
  UNPRICED: 'A current price is unavailable for this selection.',
};

export function CartLine({
  cart,
  line,
  busy,
  surface,
  onNavigate,
}: {
  cart: GuestCartViewDto;
  line: GuestCartViewDto['lines'][number];
  busy: boolean;
  surface: 'drawer' | 'page';
  onNavigate?: () => void;
}) {
  const issue = cart.commerceReview?.issues.find(
    (item) => 'lineId' in item && item.lineId === line.id,
  );
  const code = issue?.code ?? line.availability;
  const quantity = wholeQuantity(line.quantity);
  const url = line.productHandle ? `/products/${encodeURIComponent(line.productHandle)}` : null;
  return (
    <article className="space-y-3 py-4">
      <div className="flex items-start gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container-low text-outline sm:size-20">
          {line.mediaAssetId ? (
            <img
              alt=""
              loading="lazy"
              className="size-full object-cover"
              src={publicMediaPath(line.mediaAssetId, 'thumbnail')}
              width={80}
              height={80}
            />
          ) : (
            <ShoppingBagIcon size={22} />
          )}
        </div>
        <div className="min-w-0 flex-1 break-words">
          <h3 className="font-semibold text-on-surface">
            {url ? (
              <Link
                href={url}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className="underline-offset-4 hover:underline"
              >
                {line.productTitle}
              </Link>
            ) : (
              line.productTitle
            )}
          </h3>
          {line.options.length > 0 && (
            <p className="text-sm text-on-surface-variant">
              {line.options.map(({ name, value }) => `${name}: ${value}`).join(' · ')}
            </p>
          )}
          <p className="mt-1 text-sm tabular-nums text-on-surface-variant">
            {surface === 'drawer' && `Qty ${quantity} · `}
            {line.unitPrice === null
              ? 'Price unavailable'
              : `${formatMoney(line.unitPrice, cart.currency)} each`}
          </p>
        </div>
      </div>
      {code !== 'AVAILABLE' && code !== 'EMPTY_CART' && (
        <p className="rounded-lg bg-warning-subtle p-2 text-sm text-warning-foreground">
          {issueMessages[code]}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {surface === 'page' &&
          (code === 'AVAILABLE' ||
            issue?.action === 'REDUCE_OR_REPLACE_OR_REMOVE' ||
            code === 'INSUFFICIENT_CURRENT_STOCK') && (
            <QuantityStepper
              label={`Quantity for ${line.productTitle}`}
              size="touch"
              value={quantity}
              max={code === 'AVAILABLE' ? 99 : quantity}
              disabled={busy}
              onChange={(next) =>
                void cartStore.setQuantity(line.id, String(next)).catch(() => undefined)
              }
            />
          )}
        <Button
          variant="ghost"
          aria-label={`Remove ${line.productTitle} from bag`}
          disabled={busy}
          onClick={() => void cartStore.removeItem(line.id).catch(() => undefined)}
        >
          Remove
        </Button>
        {line.unitPrice !== null && (
          <div className="ms-auto text-end text-sm tabular-nums">
            <p>
              <span className="text-on-surface-variant">Line subtotal </span>
              {formatMoney(line.gross, cart.currency)}
            </p>
            {Number(line.discount) > 0 && (
              <p className="font-semibold text-primary">
                {formatMoney(line.net, cart.currency)} after discount
              </p>
            )}
          </div>
        )}
      </div>
      {surface === 'page' && url && (line.options.length > 0 || code !== 'AVAILABLE') && (
        <CartVariantEditor cart={cart} line={line} busy={busy} />
      )}
    </article>
  );
}
