import { memo, useState } from 'react';
import Link from 'next/link';
import type { CheckoutQuoteDto, StorefrontProductDto } from '@maevelle/contracts';
import { ShoppingBagIcon } from '@/components/ui/icons';
import { publicMediaPath } from '@/lib/media/url';
import { formatExactMoney } from '@/lib/format/exact-money';
import type { CatalogReferences } from '../foundation-types';

export const QuoteLines = memo(function QuoteLines({
  quote,
  handles,
  products,
}: {
  quote: CheckoutQuoteDto;
  handles: CatalogReferences;
  products: Readonly<Record<string, StorefrontProductDto>>;
}) {
  return (
    <ol className="divide-y divide-border-subtle" aria-label="Evaluated items">
      {quote.facts.lines.map((line) => {
        const handle = handles[line.variantId];
        const product = handle ? products[handle] : undefined;
        const matching =
          product?.id === line.productId &&
          product.variants.some((v) => v.id === line.variantId && v.sku === line.sku)
            ? product
            : null;
        const image =
          matching?.media.find((m) => m.variantId === line.variantId) ??
          matching?.media.find((m) => m.variantId === null && m.optionValueId === null);
        return (
          <li
            key={line.id}
            className="min-w-0 space-y-3 py-4 [content-visibility:auto] [contain-intrinsic-size:auto_220px]"
          >
            <div className="flex min-w-0 items-start gap-3">
              <QuoteImage key={image?.id ?? 'missing'} assetId={image?.id} />
              <div className="min-w-0 flex-1 break-words">
                <h3 className="font-semibold">
                  {matching ? (
                    <Link
                      className="underline-offset-4 hover:underline focus-visible:underline"
                      href={`/products/${encodeURIComponent(matching.handle)}`}
                    >
                      {line.title}
                    </Link>
                  ) : (
                    line.title
                  )}
                </h3>
                <p className="mt-1 break-all font-mono text-xs tabular-nums text-on-surface-variant">
                  SKU {line.sku}
                </p>
                <p className="mt-1 text-sm">
                  Quantity <span className="font-mono tabular-nums">{line.quantity}</span>
                </p>
              </div>
            </div>
            <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
              {(
                [
                  ['Unit price', line.unitPrice],
                  ['Before discount', line.gross],
                  ['Discount', line.discount],
                  ['After discount', line.net],
                ] as const
              ).map(([label, value]) => (
                <div className="contents" key={label}>
                  <dt className="text-on-surface-variant">{label}</dt>
                  <dd className="break-all text-right font-mono tabular-nums">
                    {formatExactMoney(value, quote.facts.currency)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ol>
  );
});

function QuoteImage({ assetId }: { assetId: string | undefined }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container-low text-outline">
      {assetId && !failed ? (
        <img
          src={publicMediaPath(assetId, 'thumbnail')}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ShoppingBagIcon size={20} aria-hidden="true" />
      )}
    </div>
  );
}
