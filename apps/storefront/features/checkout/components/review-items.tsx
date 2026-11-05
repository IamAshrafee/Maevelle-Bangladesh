'use client';
import Link from 'next/link';
import type { CheckoutDraftDto, StorefrontProductDto } from '@maevelle/contracts';
import type { CatalogReferences } from '../foundation-types';

/** Public catalog labels only; price fields are deliberately never rendered as a quote. */
export function ReviewItems({
  draft,
  handles,
  products,
}: {
  draft: CheckoutDraftDto;
  handles: CatalogReferences;
  products: Readonly<Record<string, StorefrontProductDto>>;
}) {
  return (
    <ul className="divide-y divide-border-subtle" aria-label="Selected items">
      {draft.lines.map((line, index) => {
        const handle = handles[line.variantId],
          product = handle ? products[handle] : undefined;
        const variant = product?.variants.find((v) => v.id === line.variantId);
        return (
          <li key={line.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
            <div className="min-w-0 flex-1 basis-48">
              {product ? (
                <Link
                  href={`/products/${product.handle}`}
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  {product.title}
                </Link>
              ) : (
                <p className="font-semibold">Item {index + 1} · Product details unavailable</p>
              )}
              {variant && (
                <p className="mt-1 text-sm text-on-surface-variant">SKU: {variant.sku}</p>
              )}
            </div>
            <p className="text-sm tabular-nums">
              Quantity <strong>{line.quantity}</strong>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
